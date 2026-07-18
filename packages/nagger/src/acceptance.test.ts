import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import {
  ScriptWatcher,
  HttpWatcher,
  runWatch,
  type FetchLike,
  type Watcher,
  type WatcherSink,
} from "@nagger/core";
import { MockNotifier } from "@nagger/notify";

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../core/test/fixtures/${name}`, import.meta.url));

describe("acceptance criteria", () => {
  it("#1 one notification per 10% band plus one completion", async () => {
    const mock = new MockNotifier();
    const summary = await runWatch(
      new ScriptWatcher({ name: "deploy", command: fixture("progress.sh") }),
      mock,
      { label: "deploy", engine: { debounceMs: 0 }, handleSigint: false },
    );
    expect(mock.milestoneCount).toBe(9); // bands 10..90
    expect(mock.byLevel("success")).toHaveLength(1);
    expect(summary.outcome).toBe("complete");
    expect(summary.milestonesHit).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it("#2 a 5% -> 95% jump yields one coalesced notification, not nine", async () => {
    const mock = new MockNotifier();
    await runWatch(new ScriptWatcher({ name: "jump", command: fixture("jump.sh") }), mock, {
      label: "jump",
      engine: { debounceMs: 0 },
      handleSigint: false,
    });
    expect(mock.milestoneCount).toBe(1);
    const ms = mock.byLevel("milestone")[0]!;
    expect(ms.event).toMatchObject({ kind: "milestone", milestone: 90 });
    expect(mock.byLevel("success")).toHaveLength(1);
  });

  it("#3 `until` fires exactly one available notification with elapsed time", async () => {
    let calls = 0;
    const fetch: FetchLike = async () => ({
      status: ++calls >= 3 ? 200 : 503,
      text: async () => "ok",
    });
    let clock = 0;
    const watcher = new HttpWatcher({
      name: "health",
      url: "https://example.test/health",
      intervalMs: 30_000,
      fetch,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    const mock = new MockNotifier();
    const summary = await runWatch(watcher, mock, { label: "health", handleSigint: false });
    expect(mock.byLevel("success")).toHaveLength(1);
    expect(summary.outcome).toBe("complete");
    expect(mock.byLevel("success")[0]!.body).toMatch(/done in/);
  });

  it("#4 SIGINT fires exactly one cancelled notification", async () => {
    const mock = new MockNotifier();
    let release!: () => void;
    const watcher: Watcher = {
      name: "long",
      kind: "fake",
      run: (_sink: WatcherSink) => new Promise<void>((r) => (release = r)),
      stop: () => release?.(),
    };
    const p = runWatch(watcher, mock, { label: "long", tickMs: 10 });
    // Let the runner register its SIGINT handler, then interrupt.
    await new Promise((r) => setTimeout(r, 20));
    process.emit("SIGINT");
    const summary = await p;
    expect(summary.outcome).toBe("cancelled");
    expect(mock.sent.filter((n) => n.event.kind === "cancelled")).toHaveLength(1);
  });
});
