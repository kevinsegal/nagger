import { BRAND, env, isMock, type NotifyConfig, type Notifier } from "@nagger/core";
import { TerminalNotifier } from "./terminal.js";
import { MacosNotifier } from "./macos.js";
import { NtfyNotifier, WebhookNotifier, SlackNotifier } from "./remote.js";
import { FanOutNotifier } from "./fanout.js";
import { MockNotifier } from "./mock.js";

export type Channel = "macos" | "ntfy" | "webhook" | "slack" | "terminal";

export interface NotifierFactoryOptions {
  /** Extra channels beyond the always-on terminal log. */
  channels?: Channel[];
  /** Include the terminal event-log sink. Default true (disable for --json). */
  terminal?: boolean;
  /** Colorize terminal output. Default true. */
  color?: boolean;
  /** Resolved notify config (topics, URLs, etc.). */
  config?: NotifyConfig;
  /** Terminal writer (defaults to stderr). */
  write?: (line: string) => void;
}

/**
 * Assemble a fan-out notifier from channels + config. Under NAGGER_MOCK only
 * the terminal sink is wired, so no real notifications are sent.
 */
export function buildNotifier(opts: NotifierFactoryOptions = {}): Notifier {
  const sinks: Notifier[] = [];
  const includeTerminal = opts.terminal !== false;

  if (includeTerminal) {
    sinks.push(new TerminalNotifier(opts.write, opts.color ?? true));
  }

  if (isMock()) {
    return new FanOutNotifier(sinks);
  }

  const channels = new Set(opts.channels ?? []);
  const cfg = opts.config ?? {};

  if (channels.has("macos")) sinks.push(new MacosNotifier());

  if (channels.has("ntfy")) {
    const topic = cfg.ntfy?.topic ?? process.env[env("NTFY_TOPIC")];
    if (topic) sinks.push(new NtfyNotifier(topic, cfg.ntfy?.server ?? BRAND.ntfyServer));
  }

  if (channels.has("webhook")) {
    const url = cfg.webhook?.url ?? process.env[env("WEBHOOK_URL")];
    if (url) sinks.push(new WebhookNotifier(url));
  }

  if (channels.has("slack")) {
    const url = cfg.slack?.webhookUrl ?? process.env[env("SLACK_WEBHOOK_URL")];
    if (url) sinks.push(new SlackNotifier(url));
  }

  return new FanOutNotifier(sinks);
}

/** A standalone mock notifier (for tests and NAGGER_MOCK inspection). */
export function mockNotifier(): MockNotifier {
  return new MockNotifier();
}
