import fs from "node:fs";
import fsp from "node:fs/promises";
import type { Watcher, WatcherSink } from "./types.js";

export interface LogWatcherOptions {
  name: string;
  path: string;
  /** Regex with named `pct`, or `current`/`total` capture groups. */
  pattern: RegExp;
  /** Poll interval for file changes in ms. Default 500. */
  intervalMs?: number;
  /** Complete once progress reaches this value. Default 100. */
  completeAt?: number;
}

/**
 * Tails a log file, extracting progress via a regex. Handles appends and
 * (by resetting to offset 0) rotations. Completes when progress hits 100%.
 */
export class LogWatcher implements Watcher {
  readonly kind = "log";
  readonly name: string;
  private stopped = false;
  private offset = 0;
  private carry = "";

  constructor(private readonly opts: LogWatcherOptions) {
    this.name = opts.name;
  }

  async run(sink: WatcherSink): Promise<void> {
    const interval = this.opts.intervalMs ?? 500;
    const completeAt = this.opts.completeAt ?? 100;

    while (!this.stopped) {
      const done = await this.readNew(sink, completeAt);
      if (done) return;
      sink({ type: "heartbeat" });
      await new Promise<void>((r) => setTimeout(r, interval));
    }
  }

  private async readNew(sink: WatcherSink, completeAt: number): Promise<boolean> {
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(this.opts.path);
    } catch {
      return false; // file not present yet; keep waiting
    }
    if (stat.size < this.offset) {
      // truncation / rotation
      this.offset = 0;
      this.carry = "";
    }
    if (stat.size === this.offset) return false;

    const fh = await fsp.open(this.opts.path, "r");
    try {
      const length = stat.size - this.offset;
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, this.offset);
      this.offset = stat.size;
      const text = this.carry + buf.toString("utf8");
      const lines = text.split(/\r?\n/);
      this.carry = lines.pop() ?? "";
      for (const line of lines) {
        const pct = this.extractPct(line);
        if (pct === null) continue;
        sink({ type: "progress", pct });
        if (pct >= completeAt) {
          sink({ type: "complete" });
          return true;
        }
      }
    } finally {
      await fh.close();
    }
    return false;
  }

  private extractPct(line: string): number | null {
    const m = this.opts.pattern.exec(line);
    if (!m) return null;
    const g = m.groups ?? {};
    if (g.pct !== undefined) {
      const v = Number(g.pct);
      return Number.isFinite(v) ? v : null;
    }
    if (g.current !== undefined && g.total !== undefined) {
      const cur = Number(g.current);
      const total = Number(g.total);
      if (Number.isFinite(cur) && Number.isFinite(total) && total > 0) {
        return (cur / total) * 100;
      }
    }
    if (m[1] !== undefined) {
      const v = Number(m[1]);
      return Number.isFinite(v) ? v : null;
    }
    return null;
  }

  stop(): void {
    this.stopped = true;
  }
}
