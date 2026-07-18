import net from "node:net";
import type { Watcher, WatcherSink } from "./types.js";

export interface PortWatcherOptions {
  name: string;
  host?: string;
  port: number;
  intervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Injectable connect probe for tests. */
  probe?: (host: string, port: number) => Promise<boolean>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function tcpProbe(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(3000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** Polls a TCP endpoint until it accepts a connection (closed -> open). */
export class PortWatcher implements Watcher {
  readonly kind = "port";
  readonly name: string;
  private stopped = false;

  constructor(private readonly opts: PortWatcherOptions) {
    this.name = opts.name;
  }

  async run(sink: WatcherSink): Promise<void> {
    const host = this.opts.host ?? "127.0.0.1";
    const interval = this.opts.intervalMs ?? 2000;
    const timeout = this.opts.timeoutMs ?? 600_000;
    const now = this.opts.now ?? Date.now;
    const sleep = this.opts.sleep ?? defaultSleep;
    const probe = this.opts.probe ?? tcpProbe;

    const started = now();
    while (!this.stopped) {
      if (now() - started >= timeout) {
        sink({ type: "failed", reason: `timeout after ${timeout}ms`, exitCode: null });
        return;
      }
      const open = await probe(host, this.opts.port);
      if (open) {
        sink({ type: "state_change", state: "open" });
        sink({ type: "complete", detail: "open" });
        return;
      }
      sink({ type: "heartbeat" });
      await sleep(interval);
    }
  }

  stop(): void {
    this.stopped = true;
  }
}
