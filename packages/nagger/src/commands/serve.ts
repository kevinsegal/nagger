import { loadConfig, BRAND } from "@nagger/core";
import { buildNotifier, type Channel } from "@nagger/notify";
import { Daemon } from "@nagger/daemon";
import { resolveChannels, type GlobalOpts } from "../options.js";

export interface ServeOpts extends GlobalOpts {
  config?: string;
}

/** `nag serve [--config nagger.config.ts]` — run composite watches as a daemon. */
export async function serveCommand(opts: ServeOpts): Promise<void> {
  const configFile = opts.config ?? "nagger.config.ts";
  const config = await loadConfig(configFile);

  // Channels: CLI flags plus whatever remote sinks the config declares.
  const channels = new Set<Channel>(resolveChannels(opts));
  if (config.notify?.ntfy) channels.add("ntfy");
  if (config.notify?.webhook) channels.add("webhook");
  if (config.notify?.slack) channels.add("slack");

  const notifier = buildNotifier({
    channels: [...channels],
    terminal: true,
    config: config.notify ?? {},
  });

  const daemon = new Daemon(config, notifier);
  await daemon.start();
  process.stderr.write(
    `${BRAND.name} daemon listening on ${daemon.socketFile} — ${config.watches.length} watch(es)\n`,
  );

  const shutdown = () => {
    void daemon.stop().then(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await daemon.wait();
  await daemon.stop();
}
