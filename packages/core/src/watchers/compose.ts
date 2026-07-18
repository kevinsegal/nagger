import type { Watcher, WatcherSink, WatcherEvent } from "./types.js";

export interface ComposeChild {
  watcher: Watcher;
  /** Relative weight for the aggregate progress average. Default 1. */
  weight?: number;
}

export interface ComposeWatcherOptions {
  name: string;
  children: ComposeChild[];
  /** "all": complete when every child completes; "any": complete on first. */
  completion?: "all" | "any";
}

/**
 * Aggregates several child watchers into one. Reports a weighted-average
 * progress and completes per all-of / any-of semantics. A child failure fails
 * the composite immediately.
 */
export class ComposeWatcher implements Watcher {
  readonly kind = "compose";
  readonly name: string;
  private stopped = false;

  constructor(private readonly opts: ComposeWatcherOptions) {
    this.name = opts.name;
  }

  async run(sink: WatcherSink): Promise<void> {
    const mode = this.opts.completion ?? "all";
    const children = this.opts.children;
    const totalWeight = children.reduce((s, c) => s + (c.weight ?? 1), 0) || 1;

    const pcts = new Array<number>(children.length).fill(0);
    const complete = new Array<boolean>(children.length).fill(false);
    let settled = false;

    const settle = (ev: WatcherEvent) => {
      if (settled) return;
      settled = true;
      this.stopped = true;
      for (const c of children) void c.watcher.stop();
      sink(ev);
    };

    const emitAggregate = () => {
      if (settled) return;
      const weighted = children.reduce((s, c, i) => s + pcts[i]! * (c.weight ?? 1), 0);
      sink({ type: "progress", pct: weighted / totalWeight });
    };

    await Promise.all(
      children.map((child, i) => {
        const childSink: WatcherSink = (ev) => {
          if (settled) return;
          switch (ev.type) {
            case "progress":
              pcts[i] = ev.pct;
              emitAggregate();
              break;
            case "complete":
              pcts[i] = 100;
              complete[i] = true;
              emitAggregate();
              if (mode === "any") {
                settle({ type: "complete", detail: `${child.watcher.name} completed` });
              } else if (complete.every(Boolean)) {
                settle({ type: "complete", detail: "all watchers completed" });
              }
              break;
            case "failed":
              settle({
                type: "failed",
                reason: `${child.watcher.name}: ${ev.reason}`,
                exitCode: ev.exitCode ?? null,
              });
              break;
            case "state_change":
              sink({
                type: "state_change",
                state: ev.state,
                ...(ev.detail ? { detail: ev.detail } : {}),
              });
              break;
            case "heartbeat":
              break;
          }
        };
        return child.watcher.run(childSink).catch((err: unknown) => {
          settle({
            type: "failed",
            reason: `${child.watcher.name}: ${(err as Error).message}`,
            exitCode: null,
          });
        });
      }),
    );
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await Promise.all(this.opts.children.map((c) => c.watcher.stop()));
  }
}
