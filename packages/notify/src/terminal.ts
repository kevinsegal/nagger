import pc from "picocolors";
import type { Notification, Notifier } from "@nagger/core";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function paint(n: Notification): string {
  switch (n.level) {
    case "success":
      return pc.green(n.line);
    case "failure":
      return pc.red(n.line);
    case "milestone":
      return pc.cyan(n.line);
    default:
      return pc.dim(n.line);
  }
}

/**
 * Always-on sink that writes a timestamped, colored line to a stream.
 * Nagger's terminal output is a single event log; the final summary is
 * rendered separately by the CLI.
 */
export class TerminalNotifier implements Notifier {
  readonly name = "terminal";

  constructor(
    private readonly write: (line: string) => void = (l) => process.stderr.write(`${l}\n`),
    private readonly color = true,
  ) {}

  notify(n: Notification): Promise<void> {
    const line = this.color ? paint(n) : n.line;
    this.write(`${pc.dim(stamp())} ${line}`);
    return Promise.resolve();
  }
}
