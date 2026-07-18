import { execa, type ResultPromise } from "execa";
import type { Watcher, WatcherSink } from "./types.js";

export interface ScriptWatcherOptions {
  name: string;
  command: string;
  args?: string[];
  /**
   * Regex used to extract progress from stdout/stderr lines. Supports a named
   * capture group `pct` (0-100), or a `current`/`total` pair. Defaults to
   * matching a trailing percentage like "42%".
   */
  pattern?: RegExp;
  /** Working directory for the child process. */
  cwd?: string;
  env?: Record<string, string>;
}

const DEFAULT_PATTERN = /(?<pct>\d+(?:\.\d+)?)\s*%/;

/**
 * Wraps an arbitrary command (`nag run -- ./deploy.sh`). Parses progress from
 * the child's output and reports completion/failure from its exit code.
 */
export class ScriptWatcher implements Watcher {
  readonly kind = "script";
  readonly name: string;
  private readonly pattern: RegExp;
  private child: ResultPromise | undefined;

  constructor(private readonly opts: ScriptWatcherOptions) {
    this.name = opts.name;
    this.pattern = opts.pattern ?? DEFAULT_PATTERN;
  }

  async run(sink: WatcherSink): Promise<void> {
    const child = execa(this.opts.command, this.opts.args ?? [], {
      cwd: this.opts.cwd,
      env: this.opts.env,
      shell: false,
      reject: false,
      all: false,
      stdout: "pipe",
      stderr: "pipe",
    });
    this.child = child;

    const onData = (buf: Buffer) => {
      for (const line of buf.toString("utf8").split(/\r?\n/)) {
        if (line.length === 0) continue;
        const pct = this.extractPct(line);
        if (pct !== null) sink({ type: "progress", pct });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    const result = await child;
    if (result.exitCode === 0) {
      sink({ type: "complete" });
    } else if (result.isCanceled || result.signal) {
      sink({ type: "failed", reason: `signal ${result.signal ?? "terminated"}`, exitCode: null });
    } else {
      sink({ type: "failed", reason: "non-zero exit", exitCode: result.exitCode ?? 1 });
    }
  }

  private extractPct(line: string): number | null {
    const m = this.pattern.exec(line);
    if (!m) return null;
    const groups = m.groups ?? {};
    if (groups.pct !== undefined) {
      const v = Number(groups.pct);
      return Number.isFinite(v) ? v : null;
    }
    if (groups.current !== undefined && groups.total !== undefined) {
      const cur = Number(groups.current);
      const total = Number(groups.total);
      if (Number.isFinite(cur) && Number.isFinite(total) && total > 0) {
        return (cur / total) * 100;
      }
    }
    // Fall back to the first numeric capture, treated as a percentage.
    if (m[1] !== undefined) {
      const v = Number(m[1]);
      return Number.isFinite(v) ? v : null;
    }
    return null;
  }

  async stop(): Promise<void> {
    if (this.child && this.child.exitCode === undefined) {
      this.child.kill("SIGTERM");
    }
  }
}
