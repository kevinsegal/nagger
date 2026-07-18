import { execa } from "execa";
import { BRAND, env, type Notification, type Notifier } from "@nagger/core";

/**
 * macOS native notifications via a fallback chain:
 *   1. bundled Swift helper (path in NAGGER_MACOS_HELPER) — carries the Nagger
 *      icon and supports click-to-focus;
 *   2. `terminal-notifier` if on PATH;
 *   3. `osascript display notification`.
 * On non-macOS platforms it degrades silently to a no-op.
 */
export class MacosNotifier implements Notifier {
  readonly name = "macos";
  private available: "helper" | "terminal-notifier" | "osascript" | null | undefined;

  constructor(private readonly enabled = process.platform === "darwin") {}

  async notify(n: Notification): Promise<void> {
    if (!this.enabled) return;
    const via = await this.detect();
    if (via === null) return;
    try {
      if (via === "helper") {
        await execa(process.env[env("MACOS_HELPER")]!, [
          "--title",
          n.title,
          "--message",
          n.body,
          ...(n.sound ? ["--sound", n.sound] : []),
        ]);
      } else if (via === "terminal-notifier") {
        await execa("terminal-notifier", [
          "-title",
          `${BRAND.name}: ${n.title}`,
          "-message",
          n.body,
          ...(n.sound ? ["-sound", n.sound] : []),
        ]);
      } else {
        const script = `display notification ${q(n.body)} with title ${q(
          `${BRAND.name}: ${n.title}`,
        )}${n.sound ? ` sound name ${q(n.sound)}` : ""}`;
        await execa("osascript", ["-e", script]);
      }
    } catch {
      // Notifications must never break a watch.
    }
  }

  private async detect(): Promise<typeof this.available> {
    if (this.available !== undefined) return this.available;
    const helper = process.env[env("MACOS_HELPER")];
    if (helper && (await onPath(helper))) {
      this.available = "helper";
    } else if (await onPath("terminal-notifier")) {
      this.available = "terminal-notifier";
    } else if (await onPath("osascript")) {
      this.available = "osascript";
    } else {
      this.available = null;
    }
    return this.available;
  }
}

function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function onPath(cmd: string): Promise<boolean> {
  try {
    // Absolute path -> check directly; bare command -> use `which`.
    if (cmd.includes("/")) {
      await execa("test", ["-x", cmd]);
      return true;
    }
    await execa("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}
