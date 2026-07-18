import type { Notification, Notifier } from "@nagger/core";

/**
 * Delivers each notification to every child sink concurrently. One sink
 * failing never blocks the others (each is isolated).
 */
export class FanOutNotifier implements Notifier {
  readonly name = "fanout";
  constructor(private readonly sinks: Notifier[]) {}

  get children(): readonly Notifier[] {
    return this.sinks;
  }

  async notify(n: Notification): Promise<void> {
    await Promise.all(this.sinks.map((s) => s.notify(n).catch(() => {})));
  }
}
