import {
  parseDuration,
  runWatch,
  type MilestoneOptions,
  type SoundMap,
  type Watcher,
  type RunSummary,
} from "@nagger/core";
import { buildNotifier, type Channel } from "@nagger/notify";
import { Spinner, printSummary, exitCodeFor, colorizeLine } from "./ui.js";

/** Raw global option bag as parsed by commander (all optional). */
export interface GlobalOpts {
  step?: string;
  silent?: boolean;
  notify?: string;
  json?: boolean;
  label?: string;
  verbose?: boolean;
  color?: boolean;
  allowRegress?: boolean;
  debounce?: string;
  stallAfter?: string;
}

const DEFAULT_SOUNDS: Required<SoundMap> = {
  milestone: "Tink",
  success: "Glass",
  failure: "Basso",
};

const DEFAULT_CHANNELS: Channel[] = ["macos"];

export function resolveEngineOptions(opts: GlobalOpts): Partial<MilestoneOptions> {
  const out: Partial<MilestoneOptions> = {};
  if (opts.step !== undefined) out.step = Number(opts.step);
  if (opts.allowRegress) out.allowRegress = true;
  if (opts.debounce !== undefined) out.debounceMs = parseDuration(opts.debounce);
  if (opts.stallAfter !== undefined) out.stallAfterMs = parseDuration(opts.stallAfter);
  return out;
}

export function resolveSounds(opts: GlobalOpts): SoundMap {
  return opts.silent ? {} : DEFAULT_SOUNDS;
}

export function resolveChannels(opts: GlobalOpts): Channel[] {
  if (!opts.notify) return DEFAULT_CHANNELS;
  return opts.notify
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean) as Channel[];
}

export interface RunAndReportExtras {
  /** Text shown by the spinner while the watch runs (sparse-event watches). */
  spinnerText?: string;
}

/**
 * Shared execution path for every "watch to completion" command: wires the
 * notifier, drives the runner, prints the summary, and sets the exit code.
 */
export async function runAndReport(
  watcher: Watcher,
  label: string,
  opts: GlobalOpts,
  extras: RunAndReportExtras = {},
): Promise<RunSummary> {
  const json = opts.json === true;
  const color = opts.color !== false;
  // The foreground CLI renders terminal lines itself (via `log`) so the spinner
  // can be cleared before each line — so the notifier's own terminal sink is off.
  const notifier = buildNotifier({
    channels: resolveChannels(opts),
    terminal: false,
    config: {},
  });

  const spinner = !json && extras.spinnerText ? new Spinner(extras.spinnerText) : undefined;
  spinner?.start();

  const summary = await runWatch(watcher, notifier, {
    label,
    engine: resolveEngineOptions(opts),
    sounds: resolveSounds(opts),
    json,
    log: (line) => {
      spinner?.clear();
      process.stderr.write(`${color ? colorizeLine(line) : line}\n`);
    },
  });

  spinner?.stop();
  if (!json) printSummary(summary);
  process.exitCode = exitCodeFor(summary);
  return summary;
}
