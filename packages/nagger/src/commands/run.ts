import path from "node:path";
import { ScriptWatcher } from "@nagger/core";
import { runAndReport, type GlobalOpts } from "../options.js";

export interface RunOpts extends GlobalOpts {
  pattern?: string;
}

/** `nag run [--label ...] [--step N] -- ./deploy.sh --env prod` */
export async function runCommand(command: string[], opts: RunOpts): Promise<void> {
  if (command.length === 0) {
    throw new Error("nothing to run — pass a command after `--`, e.g. `nag run -- ./deploy.sh`");
  }
  const [cmd, ...args] = command;
  const label = opts.label ?? path.basename(cmd!);
  const watcher = new ScriptWatcher({
    name: label,
    command: cmd!,
    args,
    ...(opts.pattern ? { pattern: new RegExp(opts.pattern) } : {}),
  });
  await runAndReport(watcher, label, opts);
}
