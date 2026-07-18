import pc from "picocolors";
import { BRAND, formatNotification, isMock, type EngineEvent } from "@nagger/core";
import { buildNotifier } from "@nagger/notify";
import { resolveChannels, resolveSounds, type GlobalOpts } from "../options.js";

/** `nag test-notify` — verify notification permissions and routing. */
export async function testNotifyCommand(opts: GlobalOpts): Promise<void> {
  const channels = resolveChannels(opts);
  const sounds = resolveSounds(opts);
  const notifier = buildNotifier({ channels, terminal: true, config: {} });

  const now = Date.now();
  const samples: EngineEvent[] = [
    { kind: "milestone", milestone: 50, skipped: [], pct: 50, etaMs: 60_000, at: now },
    { kind: "complete", pct: 100, durationMs: 362_000, at: now },
    { kind: "failed", reason: "test", exitCode: 1, durationMs: 220_000, at: now },
  ];

  process.stderr.write(
    `${pc.bold(BRAND.name)} test-notify → channels: ${pc.cyan(channels.join(", ") || "terminal")}` +
      `${isMock() ? pc.yellow(" (mock)") : ""}\n`,
  );

  for (const ev of samples) {
    await notifier.notify(formatNotification(ev, `${BRAND.name} test`, sounds));
  }

  process.stderr.write(pc.green("✓ sent 3 test notifications (milestone, success, failure)\n"));
  process.stderr.write(
    pc.dim("if you saw nothing on macOS, grant notification permission in System Settings.\n"),
  );
}
