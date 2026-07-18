import { BRAND, type Notification, type Notifier } from "@nagger/core";

export type PostFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

const defaultPost: PostFn = async (url, init) => {
  const res = await fetch(url, init);
  return { ok: res.ok, status: res.status };
};

const PRIORITY: Record<Notification["level"], string> = {
  failure: "high",
  success: "default",
  milestone: "low",
  info: "min",
};

/** Push notifications to an ntfy.sh topic (opt-in remote sink). */
export class NtfyNotifier implements Notifier {
  readonly name = "ntfy";
  constructor(
    private readonly topic: string,
    private readonly server: string = BRAND.ntfyServer,
    private readonly post: PostFn = defaultPost,
  ) {}

  async notify(n: Notification): Promise<void> {
    const url = `${this.server.replace(/\/$/, "")}/${this.topic}`;
    await this.post(url, {
      method: "POST",
      headers: {
        Title: `${BRAND.name}: ${n.title}`,
        Priority: PRIORITY[n.level],
        Tags: n.level,
      },
      body: n.body,
    }).catch(() => {});
  }
}

/** POST a JSON payload to an arbitrary webhook. */
export class WebhookNotifier implements Notifier {
  readonly name = "webhook";
  constructor(
    private readonly url: string,
    private readonly post: PostFn = defaultPost,
  ) {}

  async notify(n: Notification): Promise<void> {
    await this.post(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: BRAND.slug,
        title: n.title,
        body: n.body,
        level: n.level,
        event: n.event,
      }),
    }).catch(() => {});
  }
}

/** Post to a Slack incoming webhook. */
export class SlackNotifier implements Notifier {
  readonly name = "slack";
  constructor(
    private readonly webhookUrl: string,
    private readonly post: PostFn = defaultPost,
  ) {}

  async notify(n: Notification): Promise<void> {
    await this.post(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `*${BRAND.name}: ${n.title}* — ${n.body}` }),
    }).catch(() => {});
  }
}
