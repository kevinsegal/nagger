import pc from "picocolors";
import { formatDuration, type WatchStatus } from "@nagger/core";
import { rpcCall, readState, socketPath, statePath } from "@nagger/daemon";
import type { GlobalOpts } from "../options.js";

/** `nag status` — live status of daemon watches. */
export async function statusCommand(opts: GlobalOpts): Promise<void> {
  const watches = await fetchStatuses();

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ watches }, null, 2)}\n`);
    return;
  }

  if (watches === null) {
    process.stderr.write(pc.dim("no running daemon (start one with `nag serve`)\n"));
    process.exitCode = 1;
    return;
  }
  if (watches.length === 0) {
    process.stderr.write(pc.dim("daemon running — no watches configured\n"));
    return;
  }

  const nameW = Math.max(...watches.map((w) => w.label.length), 5);
  for (const w of watches) {
    const eta = w.etaMs !== null ? ` · ETA ${formatDuration(w.etaMs)}` : "";
    const pct = `${Math.round(w.pct)}%`.padStart(4);
    process.stdout.write(`${stateGlyph(w.state)} ${w.label.padEnd(nameW)}  ${pct}${eta}\n`);
  }
}

async function fetchStatuses(): Promise<WatchStatus[] | null> {
  try {
    const res = await rpcCall(socketPath(), "status");
    if (res.ok && res.result) return (res.result as { watches: WatchStatus[] }).watches;
  } catch {
    /* fall back to the state file */
  }
  const state = await readState(statePath());
  return state ? state.watches : null;
}

function stateGlyph(state: WatchStatus["state"]): string {
  switch (state) {
    case "complete":
      return pc.green("✓");
    case "failed":
      return pc.red("✗");
    case "cancelled":
      return pc.yellow("⊘");
    case "stalled":
      return pc.yellow("…");
    default:
      return pc.cyan("▲");
  }
}
