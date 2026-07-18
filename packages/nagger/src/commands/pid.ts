import { parseDuration, PidWatcher } from "@nagger/core";
import { runAndReport, type GlobalOpts } from "../options.js";

export interface PidOpts extends GlobalOpts {
  onExitOnly?: boolean;
  interval?: string;
}

/** `nag pid <pid|name> [--on-exit-only]` */
export async function pidCommand(target: string, opts: PidOpts): Promise<void> {
  const asPid = Number(target);
  const isPid = Number.isInteger(asPid) && asPid > 0;
  const label = opts.label ?? (isPid ? `pid ${target}` : target);
  const intervalMs = opts.interval ? parseDuration(opts.interval) : undefined;

  const watcher = new PidWatcher({
    name: label,
    ...(isPid ? { pid: asPid } : { process: target }),
    ...(intervalMs !== undefined ? { intervalMs } : {}),
  });
  await runAndReport(watcher, label, opts, { spinnerText: `watching ${label}` });
}
