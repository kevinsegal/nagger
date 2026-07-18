import path from "node:path";
import { LogWatcher } from "@nagger/core";
import { runAndReport, type GlobalOpts } from "../options.js";

export interface TailOpts extends GlobalOpts {
  pattern?: string;
}

/** `nag tail <file> --pattern "(?<pct>\d+)%" [--step 10]` */
export async function tailCommand(file: string, opts: TailOpts): Promise<void> {
  const pattern = opts.pattern ?? "(?<pct>\\d+)\\s*%";
  const label = opts.label ?? path.basename(file);
  const watcher = new LogWatcher({
    name: label,
    path: file,
    pattern: new RegExp(pattern),
  });
  await runAndReport(watcher, label, opts, { spinnerText: `tailing ${file}` });
}
