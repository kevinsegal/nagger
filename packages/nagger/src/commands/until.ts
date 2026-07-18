import { parseDuration, HttpWatcher, PortWatcher, type Watcher } from "@nagger/core";
import { runAndReport, type GlobalOpts } from "../options.js";

export interface UntilOpts extends GlobalOpts {
  timeout?: string;
  expect?: string;
  interval?: string;
}

/** `nag until <url|host:port> [--timeout 10m] [--expect 200] [--interval 2s]` */
export async function untilCommand(target: string, opts: UntilOpts): Promise<void> {
  const label = opts.label ?? target;
  const timeoutMs = opts.timeout ? parseDuration(opts.timeout) : undefined;
  const intervalMs = opts.interval ? parseDuration(opts.interval) : undefined;

  let watcher: Watcher;
  if (/^https?:\/\//i.test(target)) {
    watcher = new HttpWatcher({
      name: label,
      url: target,
      ...(opts.expect ? { expect: Number(opts.expect) } : {}),
      ...(intervalMs !== undefined ? { intervalMs } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    });
  } else {
    const m = /^(?<host>[^:]+):(?<port>\d+)$/.exec(target);
    if (!m?.groups) {
      throw new Error(`invalid target "${target}" — expected a URL or host:port`);
    }
    watcher = new PortWatcher({
      name: label,
      host: m.groups.host!,
      port: Number(m.groups.port),
      ...(intervalMs !== undefined ? { intervalMs } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    });
  }

  await runAndReport(watcher, label, opts, { spinnerText: `waiting for ${target}` });
}
