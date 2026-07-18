/**
 * The milestone engine — Nagger's differentiator.
 *
 * It converts a noisy stream of progress readings into a small number of
 * high-signal notifications:
 *   - exactly one event per crossed milestone band, coalesced when progress
 *     jumps multiple bands in a single tick;
 *   - monotonic by default (regressions never re-fire past milestones);
 *   - debounced and rate-limited;
 *   - stall-aware;
 *   - ETA-annotated once enough data points exist;
 *   - terminal states (complete / failed / cancelled) that fire exactly once.
 *
 * The engine is pure with respect to time: every method takes an explicit
 * `now` (epoch ms) so behavior is fully deterministic under test.
 */

export interface MilestoneOptions {
  /** Percent per milestone band. Default 10. Must be in (0, 100]. */
  step: number;
  /** Allow progress to regress and re-fire earlier milestones. Default false. */
  allowRegress: boolean;
  /** Minimum ms between emitted notifications. Default 3000. */
  debounceMs: number;
  /** Hard cap on notifications emitted per rolling 60s. Default 20. */
  maxPerMinute: number;
  /** Emit a single "stalled" event after this many ms without progress. null disables. Default 120000. */
  stallAfterMs: number | null;
  /** Number of recent samples used for the rolling ETA estimate. Default 5. */
  etaWindow: number;
}

export const DEFAULT_MILESTONE_OPTIONS: MilestoneOptions = {
  step: 10,
  allowRegress: false,
  debounceMs: 3000,
  maxPerMinute: 20,
  stallAfterMs: 120_000,
  etaWindow: 5,
};

export type EngineEvent =
  | {
      kind: "milestone";
      /** Highest band reached in this emission. */
      milestone: number;
      /** Lower bands that were crossed in the same jump (coalesced), ascending. */
      skipped: number[];
      /** Latest raw progress reading (0-100). */
      pct: number;
      /** Estimated ms remaining, or null when not yet computable. */
      etaMs: number | null;
      at: number;
    }
  | { kind: "stalled"; sinceMs: number; at: number }
  | { kind: "complete"; pct: number; durationMs: number; at: number }
  | { kind: "failed"; reason: string; exitCode: number | null; durationMs: number; at: number }
  | { kind: "cancelled"; durationMs: number; at: number };

export type TerminalKind = "complete" | "failed" | "cancelled";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export class MilestoneEngine {
  private readonly opts: MilestoneOptions;
  private readonly startedAt: number;

  private lastMilestone = 0; // highest band already fired
  private lastProgress = 0;
  private lastProgressAt: number;
  private pending: number[] = []; // bands awaiting a debounce window
  private lastEmitAt = Number.NEGATIVE_INFINITY;
  private emitTimes: number[] = [];
  private samples: { pct: number; at: number }[] = [];
  private stalled = false;
  private terminal: TerminalKind | null = null;

  constructor(startedAt: number, opts: Partial<MilestoneOptions> = {}) {
    this.opts = { ...DEFAULT_MILESTONE_OPTIONS, ...opts };
    if (this.opts.step <= 0 || this.opts.step > 100) {
      throw new Error(`step must be in (0, 100], got ${this.opts.step}`);
    }
    this.startedAt = startedAt;
    this.lastProgressAt = startedAt;
  }

  get isTerminal(): boolean {
    return this.terminal !== null;
  }

  get terminalKind(): TerminalKind | null {
    return this.terminal;
  }

  /** Largest milestone band strictly below 100 for the configured step. */
  private topmostBand(): number {
    const b = Math.floor((100 - 1e-9) / this.opts.step) * this.opts.step;
    return b >= 100 ? b - this.opts.step : b;
  }

  /** Highest band <= pct that we are allowed to fire (never >= 100). */
  private bandFor(pct: number): number {
    const raw = Math.floor(pct / this.opts.step) * this.opts.step;
    return Math.min(raw, this.topmostBand());
  }

  /** Record a progress reading; returns any events ready to emit now. */
  progress(pctRaw: number, now: number): EngineEvent[] {
    if (this.terminal) return [];
    const pct = clamp(pctRaw, 0, 100);

    if (pct < this.lastProgress) {
      // Regression: retries, log rollovers, etc.
      this.lastProgressAt = now;
      this.stalled = false;
      if (!this.opts.allowRegress) {
        return this.flush(now);
      }
      // Non-monotonic mode: allow earlier bands to fire again.
      this.lastMilestone = this.bandFor(pct);
    }

    this.lastProgress = pct;
    this.lastProgressAt = now;
    this.stalled = false;
    this.samples.push({ pct, at: now });
    if (this.samples.length > this.opts.etaWindow) this.samples.shift();

    const top = this.bandFor(pct);
    if (top > this.lastMilestone) {
      for (let m = this.lastMilestone + this.opts.step; m <= top; m += this.opts.step) {
        this.pending.push(m);
      }
      this.lastMilestone = top;
    }
    return this.flush(now);
  }

  /** Time-driven poke: flush any debounced milestones and check for a stall. */
  tick(now: number): EngineEvent[] {
    if (this.terminal) return [];
    return [...this.flush(now), ...this.stallCheck(now)];
  }

  /** Explicit stall check (also invoked by tick). */
  stallCheck(now: number): EngineEvent[] {
    if (this.terminal || this.stalled || this.opts.stallAfterMs === null) return [];
    if (now - this.lastProgressAt >= this.opts.stallAfterMs) {
      this.stalled = true;
      return [{ kind: "stalled", sinceMs: now - this.lastProgressAt, at: now }];
    }
    return [];
  }

  /** Clean completion (100% or exit 0). Flushes remaining bands, then fires once. */
  complete(now: number): EngineEvent[] {
    if (this.terminal) return [];
    const out: EngineEvent[] = [];
    if (this.pending.length > 0) {
      out.push(this.drainPending(now));
      this.recordEmit(now);
    }
    this.terminal = "complete";
    out.push({
      kind: "complete",
      pct: 100,
      durationMs: now - this.startedAt,
      at: now,
    });
    return out;
  }

  /** Non-zero exit / timeout / max retries. Discards pending bands. */
  fail(reason: string, exitCode: number | null, now: number): EngineEvent[] {
    if (this.terminal) return [];
    this.pending = [];
    this.terminal = "failed";
    return [
      {
        kind: "failed",
        reason,
        exitCode,
        durationMs: now - this.startedAt,
        at: now,
      },
    ];
  }

  /** SIGINT / user cancel. Discards pending bands. */
  cancel(now: number): EngineEvent[] {
    if (this.terminal) return [];
    this.pending = [];
    this.terminal = "cancelled";
    return [{ kind: "cancelled", durationMs: now - this.startedAt, at: now }];
  }

  private drainPending(now: number): EngineEvent {
    const bands = this.pending;
    this.pending = [];
    const milestone = bands[bands.length - 1]!;
    return {
      kind: "milestone",
      milestone,
      skipped: bands.slice(0, -1),
      pct: this.lastProgress,
      etaMs: this.eta(),
      at: now,
    };
  }

  private flush(now: number): EngineEvent[] {
    if (this.pending.length === 0) return [];
    if (!this.canEmit(now)) return [];
    const ev = this.drainPending(now);
    this.recordEmit(now);
    return [ev];
  }

  private canEmit(now: number): boolean {
    if (now - this.lastEmitAt < this.opts.debounceMs) return false;
    this.pruneEmitTimes(now);
    return this.emitTimes.length < this.opts.maxPerMinute;
  }

  private recordEmit(now: number): void {
    this.lastEmitAt = now;
    this.emitTimes.push(now);
    this.pruneEmitTimes(now);
  }

  private pruneEmitTimes(now: number): void {
    const cutoff = now - 60_000;
    while (this.emitTimes.length > 0 && this.emitTimes[0]! < cutoff) {
      this.emitTimes.shift();
    }
  }

  /** Rolling-window ETA in ms, or null with fewer than two data points. */
  private eta(): number | null {
    if (this.samples.length < 2) return null;
    const first = this.samples[0]!;
    const last = this.samples[this.samples.length - 1]!;
    const dPct = last.pct - first.pct;
    const dT = last.at - first.at;
    if (dPct <= 0 || dT <= 0) return null;
    const ratePerMs = dPct / dT;
    const remaining = 100 - last.pct;
    if (remaining <= 0) return 0;
    return Math.round(remaining / ratePerMs);
  }
}
