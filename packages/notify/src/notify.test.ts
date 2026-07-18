import { describe, it, expect } from "vitest";
import { formatNotification, type EngineEvent } from "@nagger/core";
import { MockNotifier } from "./mock.js";
import { FanOutNotifier } from "./fanout.js";
import { NtfyNotifier, WebhookNotifier, SlackNotifier, type PostFn } from "./remote.js";

const at = 1_000_000;
const milestone: EngineEvent = {
  kind: "milestone",
  milestone: 70,
  skipped: [],
  pct: 70,
  etaMs: 134_000,
  at,
};

describe("MockNotifier", () => {
  it("records notifications and filters by level", async () => {
    const m = new MockNotifier();
    await m.notify(formatNotification(milestone, "deploy"));
    await m.notify(
      formatNotification({ kind: "complete", pct: 100, durationMs: 1000, at }, "deploy"),
    );
    expect(m.sent).toHaveLength(2);
    expect(m.milestoneCount).toBe(1);
    expect(m.byLevel("success")).toHaveLength(1);
  });
});

describe("formatNotification copy", () => {
  it("renders a terse milestone line with ETA", () => {
    const n = formatNotification(milestone, "prod deploy");
    expect(n.line).toBe("▲ prod deploy — 70% · ETA 2m 14s");
  });
  it("lists skipped bands when coalesced", () => {
    const n = formatNotification({ ...milestone, skipped: [30, 40, 50, 60] }, "prod deploy");
    expect(n.line).toContain("skipped 30%/40%/50%/60%");
  });
  it("renders success and failure lines", () => {
    const ok = formatNotification({ kind: "complete", pct: 100, durationMs: 362_000, at }, "d");
    expect(ok.line).toBe("✓ d — done in 6m 02s");
    const bad = formatNotification(
      { kind: "failed", reason: "boom", exitCode: 1, durationMs: 220_000, at },
      "d",
    );
    expect(bad.line).toBe("✗ d — failed (exit 1) after 3m 40s");
  });
});

describe("FanOutNotifier", () => {
  it("delivers to every sink and isolates failures", async () => {
    const a = new MockNotifier();
    const flaky = { name: "flaky", notify: () => Promise.reject(new Error("nope")) };
    const b = new MockNotifier();
    const fan = new FanOutNotifier([a, flaky, b]);
    await fan.notify(formatNotification(milestone, "x"));
    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(1);
  });
});

describe("remote notifiers", () => {
  it("posts to an ntfy topic with priority + title", async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const post: PostFn = async (url, init) => {
      calls.push({ url, headers: init.headers, body: init.body });
      return { ok: true, status: 200 };
    };
    await new NtfyNotifier("mytopic", "https://ntfy.sh", post).notify(
      formatNotification(
        { kind: "failed", reason: "x", exitCode: 2, durationMs: 1000, at },
        "deploy",
      ),
    );
    expect(calls[0]!.url).toBe("https://ntfy.sh/mytopic");
    expect(calls[0]!.headers.Priority).toBe("high");
    expect(calls[0]!.headers.Title).toContain("deploy");
  });

  it("posts JSON to a webhook", async () => {
    let body = "";
    const post: PostFn = async (_url, init) => {
      body = init.body;
      return { ok: true, status: 200 };
    };
    await new WebhookNotifier("https://hook.test", post).notify(
      formatNotification(milestone, "deploy"),
    );
    const parsed = JSON.parse(body);
    expect(parsed.level).toBe("milestone");
    expect(parsed.event.milestone).toBe(70);
  });

  it("posts a Slack message", async () => {
    let body = "";
    const post: PostFn = async (_url, init) => {
      body = init.body;
      return { ok: true, status: 200 };
    };
    await new SlackNotifier("https://slack.test", post).notify(
      formatNotification({ kind: "complete", pct: 100, durationMs: 1000, at }, "deploy"),
    );
    expect(JSON.parse(body).text).toContain("deploy");
  });
});
