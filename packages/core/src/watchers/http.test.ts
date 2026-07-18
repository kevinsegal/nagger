import { describe, it, expect } from "vitest";
import { HttpWatcher, type FetchLike } from "./http.js";
import type { WatcherEvent } from "./types.js";

describe("HttpWatcher", () => {
  it("fires exactly one complete when the service comes up", async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls++;
      // Down for the first two polls, up on the third.
      const status = calls >= 3 ? 200 : 503;
      return { status, text: async () => "ok" };
    };
    let clock = 0;
    const watcher = new HttpWatcher({
      name: "health",
      url: "https://example.test/health",
      intervalMs: 1000,
      timeoutMs: 60_000,
      fetch,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });

    const events: WatcherEvent[] = [];
    await watcher.run((e) => events.push(e));

    const completes = events.filter((e) => e.type === "complete");
    expect(completes).toHaveLength(1);
    expect(events.filter((e) => e.type === "state_change")).toEqual([
      { type: "state_change", state: "up" },
    ]);
    expect(calls).toBe(3);
  });

  it("fails on timeout", async () => {
    const fetch: FetchLike = async () => ({ status: 500, text: async () => "" });
    let clock = 0;
    const watcher = new HttpWatcher({
      name: "down",
      url: "https://example.test",
      intervalMs: 1000,
      timeoutMs: 3000,
      fetch,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    const events: WatcherEvent[] = [];
    await watcher.run((e) => events.push(e));
    expect(events.at(-1)).toMatchObject({ type: "failed" });
  });

  it("honors an expected body match", async () => {
    const fetch: FetchLike = async () => ({ status: 200, text: async () => "healthy: true" });
    let clock = 0;
    const watcher = new HttpWatcher({
      name: "body",
      url: "https://example.test",
      expectBody: "healthy",
      fetch,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    const events: WatcherEvent[] = [];
    await watcher.run((e) => events.push(e));
    expect(events.filter((e) => e.type === "complete")).toHaveLength(1);
  });
});
