import {
  MilestoneEngine,
  type EngineEvent,
  type MilestoneOptions,
  type TerminalKind,
} from "./milestone.js";
import { formatNotification, type Notifier, type SoundMap } from "./notification.js";
import type { Watcher } from "./watchers/types.js";

export interface RunSummary {
  label: string;
  kind: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  outcome: TerminalKind;
  exitCode: number | null;
  milestonesHit: number[];
  notifications: number;
}

export interface RunOptions {
  label: string;
  engine?: Partial<MilestoneOptions>;
  sounds?: SoundMap;
  /** Injectable clock (ms). Defaults to Date.now. */
  now?: () => number;
  /** Poke interval for debounce flush + stall detection. Default 1000ms. */
  tickMs?: number;
  /** Emit newline-delimited JSON events to stdout. */
  json?: boolean;
  /** Called for every engine event (after notification is dispatched). */
  onEvent?: (event: EngineEvent) => void;
  /** Terminal line renderer (ignored when json is true). */
  log?: (line: string) => void;
  /** Handle SIGINT as a cancel. Default true. */
  handleSigint?: boolean;
}

/**
 * Runs a watcher to a terminal state, driving the milestone engine and
 * dispatching notifications through the given notifier. Resolves with a summary.
 */
export async function runWatch(
  watcher: Watcher,
  notifier: Notifier,
  opts: RunOptions,
): Promise<RunSummary> {
  const now = opts.now ?? Date.now;
  const tickMs = opts.tickMs ?? 1000;
  const startedAt = now();
  const engine = new MilestoneEngine(startedAt, opts.engine);

  const milestonesHit: number[] = [];
  let notifications = 0;
  let capturedExitCode: number | null = null;

  const emit = (events: EngineEvent[]): void => {
    for (const ev of events) {
      if (ev.kind === "milestone") milestonesHit.push(ev.milestone);
      if (ev.kind === "failed") capturedExitCode = ev.exitCode;
      const n = formatNotification(ev, opts.label, opts.sounds ?? {});
      notifications++;
      // Fire-and-forget: mock/test notifiers record synchronously; real
      // adapters must never let a delivery failure abort the watch.
      void notifier.notify(n).catch(() => {});
      if (opts.json) {
        process.stdout.write(`${JSON.stringify(ev)}\n`);
      } else {
        opts.log?.(n.line);
      }
      opts.onEvent?.(ev);
    }
  };

  let resolveDone!: () => void;
  const done = new Promise<void>((r) => {
    resolveDone = r;
  });

  const sink = (ev: Parameters<Parameters<Watcher["run"]>[0]>[0]): void => {
    if (engine.isTerminal) return;
    switch (ev.type) {
      case "progress":
        emit(engine.progress(ev.pct, now()));
        break;
      case "complete":
        emit(engine.complete(now()));
        break;
      case "failed":
        emit(engine.fail(ev.reason, ev.exitCode ?? null, now()));
        break;
      case "heartbeat":
        emit(engine.tick(now()));
        break;
      case "state_change":
        // Surfaced to the log only; not a notification on its own.
        opts.log?.(`· ${opts.label} — ${ev.state}${ev.detail ? ` (${ev.detail})` : ""}`);
        break;
    }
    if (engine.isTerminal) resolveDone();
  };

  const onSigint = (): void => {
    if (engine.isTerminal) return;
    emit(engine.cancel(now()));
    resolveDone();
  };
  if (opts.handleSigint !== false) process.once("SIGINT", onSigint);

  const ticker = setInterval(() => {
    if (!engine.isTerminal) emit(engine.tick(now()));
  }, tickMs);
  // Do not keep the event loop alive solely for ticks.
  if (typeof ticker.unref === "function") ticker.unref();

  try {
    await Promise.race([
      watcher.run(sink).catch((err: unknown) => {
        if (!engine.isTerminal) {
          emit(engine.fail((err as Error)?.message ?? String(err), null, now()));
          resolveDone();
        }
      }),
      done,
    ]);
    // Watcher resolved without emitting a terminal event -> treat as complete.
    if (!engine.isTerminal) {
      emit(engine.complete(now()));
      resolveDone();
    }
    await done;
  } finally {
    clearInterval(ticker);
    if (opts.handleSigint !== false) process.off("SIGINT", onSigint);
    await watcher.stop();
  }

  const endedAt = now();
  const outcome: TerminalKind = engine.terminalKind ?? "complete";

  return {
    label: opts.label,
    kind: watcher.kind,
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
    outcome,
    exitCode: outcome === "failed" ? capturedExitCode : null,
    milestonesHit,
    notifications,
  };
}
