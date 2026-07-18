import type { Watcher, WatcherSink } from "./types.js";

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ status: number; text(): Promise<string> }>;

export interface HttpWatcherOptions {
  name: string;
  url: string;
  /** Expected HTTP status. Default 200. */
  expect?: number;
  /** Optional substring the response body must contain. */
  expectBody?: string;
  /** Poll interval in ms. Default 2000. */
  intervalMs?: number;
  /** Overall timeout in ms. Default 600000 (10m). */
  timeoutMs?: number;
  /** Injectable fetch (defaults to global fetch); enables deterministic tests. */
  fetch?: FetchLike;
  /** Injectable clock (ms). Defaults to Date.now. */
  now?: () => number;
  /** Injectable sleep. Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Polls a URL until it returns healthy (transition down -> up), then completes
 * with elapsed time. Fires `failed` on timeout. Used by `nag until`.
 */
export class HttpWatcher implements Watcher {
  readonly kind = "http";
  readonly name: string;
  private stopped = false;

  constructor(private readonly opts: HttpWatcherOptions) {
    this.name = opts.name;
  }

  async run(sink: WatcherSink): Promise<void> {
    const expect = this.opts.expect ?? 200;
    const interval = this.opts.intervalMs ?? 2000;
    const timeout = this.opts.timeoutMs ?? 600_000;
    const doFetch = this.opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    const now = this.opts.now ?? Date.now;
    const sleep = this.opts.sleep ?? defaultSleep;

    const started = now();
    let wasUp = false;

    while (!this.stopped) {
      if (now() - started >= timeout) {
        sink({ type: "failed", reason: `timeout after ${timeout}ms`, exitCode: null });
        return;
      }

      const up = await this.probe(doFetch, expect);
      if (up && !wasUp) {
        wasUp = true;
        sink({ type: "state_change", state: "up" });
        sink({ type: "complete", detail: "available" });
        return;
      }
      if (!up) {
        if (wasUp) sink({ type: "state_change", state: "down" });
        wasUp = false;
        sink({ type: "heartbeat" });
      }
      await sleep(interval);
    }
  }

  private async probe(doFetch: FetchLike, expect: number): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await doFetch(this.opts.url, { signal: controller.signal });
      if (res.status !== expect) return false;
      if (this.opts.expectBody) {
        const body = await res.text();
        return body.includes(this.opts.expectBody);
      }
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  stop(): void {
    this.stopped = true;
  }
}
