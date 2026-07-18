/** Events a watcher emits to the runner. */
export type WatcherEvent =
  | { type: "progress"; pct: number }
  | { type: "state_change"; state: string; detail?: string }
  | { type: "complete"; detail?: string }
  | { type: "failed"; reason: string; exitCode?: number | null }
  | { type: "heartbeat" };

export type WatcherSink = (event: WatcherEvent) => void;

/**
 * A pluggable progress source. `run` resolves when the watched thing reaches a
 * natural end (process exit, service up, file EOF+complete); it should emit a
 * terminal `complete`/`failed` event through the sink before resolving. Long-
 * lived watchers (http polling until up) resolve once their goal is met.
 */
export interface Watcher {
  readonly name: string;
  readonly kind: string;
  run(sink: WatcherSink): Promise<void>;
  stop(): Promise<void> | void;
}
