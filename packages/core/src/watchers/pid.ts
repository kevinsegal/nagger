import { execa } from "execa";
import type { Watcher, WatcherSink } from "./types.js";

export interface PidWatcherOptions {
  name: string;
  /** PID to watch, or resolve one from `process` name. */
  pid?: number;
  /** Process name to resolve (best-effort, unix `ps`). */
  process?: string;
  intervalMs?: number;
  /** Injectable liveness check for tests. */
  isAlive?: (pid: number) => boolean;
  /** Injectable pid resolver for tests. */
  resolvePid?: (name: string) => Promise<number | null>;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = gone; EPERM = exists but not ours (still alive).
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function resolveByName(name: string): Promise<number | null> {
  try {
    const { stdout } = await execa("ps", ["-A", "-o", "pid=,comm="], { reject: false });
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const sp = trimmed.indexOf(" ");
      if (sp < 0) continue;
      const pid = Number(trimmed.slice(0, sp));
      const comm = trimmed.slice(sp + 1).trim();
      if (Number.isFinite(pid) && comm.includes(name)) return pid;
    }
  } catch {
    /* ps unavailable */
  }
  return null;
}

/**
 * Watches a PID (or a process resolved by name) and notifies when it exits.
 * Lifecycle-only in v1; resource thresholds are a documented future addition.
 */
export class PidWatcher implements Watcher {
  readonly kind = "pid";
  readonly name: string;
  private stopped = false;

  constructor(private readonly opts: PidWatcherOptions) {
    this.name = opts.name;
  }

  async run(sink: WatcherSink): Promise<void> {
    const interval = this.opts.intervalMs ?? 1000;
    const isAlive = this.opts.isAlive ?? alive;
    const resolve = this.opts.resolvePid ?? resolveByName;

    let pid = this.opts.pid;
    if (pid === undefined && this.opts.process) {
      pid = (await resolve(this.opts.process)) ?? undefined;
    }
    if (pid === undefined) {
      sink({ type: "failed", reason: "process not found", exitCode: null });
      return;
    }
    if (!isAlive(pid)) {
      sink({ type: "failed", reason: `pid ${pid} not running`, exitCode: null });
      return;
    }

    sink({ type: "state_change", state: "running", detail: `pid ${pid}` });
    while (!this.stopped) {
      if (!isAlive(pid)) {
        sink({ type: "complete", detail: `pid ${pid} exited` });
        return;
      }
      sink({ type: "heartbeat" });
      await new Promise<void>((r) => setTimeout(r, interval));
    }
  }

  stop(): void {
    this.stopped = true;
  }
}
