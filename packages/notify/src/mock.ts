import type { Notification, Notifier } from "@nagger/core";

/**
 * Records notifications instead of delivering them. Used by tests and whenever
 * NAGGER_MOCK=1, so acceptance criteria can be asserted deterministically.
 */
export class MockNotifier implements Notifier {
  readonly name = "mock";
  readonly sent: Notification[] = [];

  notify(n: Notification): Promise<void> {
    this.sent.push(n);
    return Promise.resolve();
  }

  /** Notifications of a given level. */
  byLevel(level: Notification["level"]): Notification[] {
    return this.sent.filter((n) => n.level === level);
  }

  /** Convenience: count of milestone notifications. */
  get milestoneCount(): number {
    return this.byLevel("milestone").length;
  }

  clear(): void {
    this.sent.length = 0;
  }
}
