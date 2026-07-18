import { Command, Option } from "commander";
import pc from "picocolors";
import { BRAND } from "@nagger/core";
import { runCommand } from "./commands/run.js";
import { untilCommand } from "./commands/until.js";
import { tailCommand } from "./commands/tail.js";
import { pidCommand } from "./commands/pid.js";
import { serveCommand } from "./commands/serve.js";
import { statusCommand } from "./commands/status.js";
import { testNotifyCommand } from "./commands/test-notify.js";

export const VERSION = "0.1.0";

/** Options shared by every "watch" command (also mirrored in README/--help). */
function withCommon(cmd: Command): Command {
  return cmd
    .option("--label <label>", "human label for this watch")
    .option("--step <n>", "milestone step in percent (default 10)")
    .option("--silent", "suppress notification sounds")
    .option(
      "--notify <channels>",
      "comma-separated sinks: macos,ntfy,webhook,slack (default macos)",
    )
    .option("--json", "emit a machine-readable event stream to stdout")
    .option("--verbose", "log every event")
    .option("--no-color", "disable colored output")
    .option("--allow-regress", "allow progress to regress and re-fire milestones")
    .option("--debounce <dur>", "minimum interval between notifications (default 3s)")
    .option("--stall-after <dur>", "notify once after this long without progress");
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name(BRAND.bin)
    .description(
      `${pc.bold(BRAND.name)} — ${BRAND.tagline}\n\n` +
        `Wrap a command, poll a service, or tail a log; ${BRAND.name} nags you at\n` +
        `progress milestones and on completion, success, or failure.`,
    )
    .version(VERSION, "-v, --version")
    .enablePositionalOptions()
    .showHelpAfterError();

  withCommon(
    program
      .command("run")
      .description("wrap a command and nag at milestones + on exit")
      .argument("[command...]", "command to run, after `--`")
      .option("--pattern <regex>", "progress regex with a named `pct` group")
      .passThroughOptions()
      .allowUnknownOption()
      .addHelpText(
        "after",
        `\nExample:\n  $ ${BRAND.alias} run --label "prod deploy" -- ./deploy.sh --env prod`,
      ),
  ).action((command: string[], _opts, cmd: Command) => runCommand(command, cmd.optsWithGlobals()));

  withCommon(
    program
      .command("until")
      .description("poll a URL or host:port until it is available")
      .argument("<target>", "URL or host:port")
      .option("--timeout <dur>", "give up after this long (default 10m)")
      .option("--expect <status>", "expected HTTP status (default 200)")
      .option("--interval <dur>", "poll interval (default 2s)")
      .addHelpText(
        "after",
        `\nExample:\n  $ ${BRAND.alias} until https://api.example.com/health --timeout 10m`,
      ),
  ).action((target: string, _opts, cmd: Command) => untilCommand(target, cmd.optsWithGlobals()));

  withCommon(
    program
      .command("tail")
      .description("tail a log file and nag at progress milestones")
      .argument("<file>", "log file to tail")
      .option("--pattern <regex>", "progress regex with `pct` or `current`/`total` groups")
      .addHelpText(
        "after",
        `\nExample:\n  $ ${BRAND.alias} tail /var/log/etl.log --pattern "(?<pct>\\d+)%"`,
      ),
  ).action((file: string, _opts, cmd: Command) => tailCommand(file, cmd.optsWithGlobals()));

  withCommon(
    program
      .command("pid")
      .description("watch a PID or process name and nag on exit")
      .argument("<target>", "PID or process name")
      .option("--on-exit-only", "only notify on exit (no heartbeats)")
      .option("--interval <dur>", "poll interval (default 1s)")
      .addHelpText("after", `\nExample:\n  $ ${BRAND.alias} pid 4242`),
  ).action((target: string, _opts, cmd: Command) => pidCommand(target, cmd.optsWithGlobals()));

  program
    .command("serve")
    .description("run composite watches from a config as a daemon")
    .option("--config <file>", "config file (default nagger.config.ts)")
    .addOption(new Option("--notify <channels>").hideHelp())
    .action((_opts, cmd: Command) => serveCommand(cmd.optsWithGlobals()));

  program
    .command("status")
    .description("show live status of daemon watches")
    .option("--json", "output JSON")
    .action((_opts, cmd: Command) => statusCommand(cmd.optsWithGlobals()));

  program
    .command("test-notify")
    .description("send test notifications to verify permissions/routing")
    .option("--notify <channels>", "comma-separated sinks (default macos)")
    .option("--silent", "suppress notification sounds")
    .action((_opts, cmd: Command) => testNotifyCommand(cmd.optsWithGlobals()));

  return program;
}

/** Parse argv and dispatch. Errors are printed and mapped to a non-zero exit. */
export async function main(argv = process.argv): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    process.stderr.write(pc.red(`${BRAND.name}: ${(err as Error).message}\n`));
    process.exitCode = 1;
  }
}
