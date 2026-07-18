import pc from "picocolors";
import { formatDuration, type RunSummary } from "@nagger/core";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** A minimal, dependency-free stderr spinner for sparse-event watches. */
export class Spinner {
  private timer: NodeJS.Timeout | undefined;
  private i = 0;
  private active = false;

  constructor(
    private text: string,
    private readonly enabled = process.stderr.isTTY === true,
  ) {}

  start(): void {
    if (!this.enabled || this.active) return;
    this.active = true;
    this.timer = setInterval(() => {
      process.stderr.write(`\r${pc.cyan(FRAMES[this.i]!)} ${this.text}\x1b[K`);
      this.i = (this.i + 1) % FRAMES.length;
    }, 90);
    this.timer.unref?.();
  }

  update(text: string): void {
    this.text = text;
  }

  /** Clear the current spinner line so a permanent line can be printed. */
  clear(): void {
    if (this.enabled && this.active) process.stderr.write("\r\x1b[K");
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.clear();
    this.active = false;
  }
}

/** Colorize a rendered notification line by its leading status glyph. */
export function colorizeLine(line: string): string {
  const glyph = line.trimStart()[0] ?? "";
  switch (glyph) {
    case "▲":
      return pc.cyan(line);
    case "✓":
      return pc.green(line);
    case "✗":
      return pc.red(line);
    case "⊘":
      return pc.yellow(line);
    default:
      return pc.dim(line);
  }
}

const OUTCOME_STYLE = {
  complete: (s: string) => pc.green(s),
  failed: (s: string) => pc.red(s),
  cancelled: (s: string) => pc.yellow(s),
} as const;

/** Render the always-printed final summary table to stderr. */
export function printSummary(summary: RunSummary): void {
  const style = OUTCOME_STYLE[summary.outcome];
  const rows: [string, string][] = [
    ["watch", `${summary.label} (${summary.kind})`],
    ["outcome", style(summary.outcome.toUpperCase())],
    ["duration", formatDuration(summary.durationMs)],
    [
      "milestones",
      summary.milestonesHit.length ? summary.milestonesHit.map((m) => `${m}%`).join(" ") : "—",
    ],
    ["notifications", String(summary.notifications)],
  ];
  if (summary.outcome === "failed" && summary.exitCode !== null) {
    rows.push(["exit code", String(summary.exitCode)]);
  }

  const width = Math.max(...rows.map(([k]) => k.length));
  const line = pc.dim("─".repeat(width + 24));
  process.stderr.write(`\n${line}\n`);
  for (const [k, v] of rows) {
    process.stderr.write(`${pc.dim(k.padEnd(width))}  ${v}\n`);
  }
  process.stderr.write(`${line}\n`);
}

/** Map a run outcome to the process exit code Nagger guarantees. */
export function exitCodeFor(summary: RunSummary): number {
  switch (summary.outcome) {
    case "complete":
      return 0;
    case "cancelled":
      return 130;
    case "failed":
      return summary.exitCode ?? 1;
  }
}
