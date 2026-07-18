import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { ScriptWatcher } from "./script.js";
import type { WatcherEvent } from "./types.js";

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url));

async function collect(watcher: ScriptWatcher): Promise<WatcherEvent[]> {
  const events: WatcherEvent[] = [];
  await watcher.run((e) => events.push(e));
  return events;
}

describe("ScriptWatcher", () => {
  it("extracts progress and completes on exit 0", async () => {
    const events = await collect(
      new ScriptWatcher({ name: "progress", command: fixture("progress.sh") }),
    );
    const pcts = events.filter((e) => e.type === "progress").map((e) => (e as { pct: number }).pct);
    expect(pcts).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(events.at(-1)).toEqual({ type: "complete" });
  });

  it("reports failure with the exit code on non-zero exit", async () => {
    const events = await collect(
      new ScriptWatcher({ name: "fail", command: "bash", args: ["-c", "exit 3"] }),
    );
    expect(events.at(-1)).toMatchObject({ type: "failed", exitCode: 3 });
  });

  it("supports a current/total pattern", async () => {
    const events = await collect(
      new ScriptWatcher({
        name: "ratio",
        command: "bash",
        args: ["-c", "echo '3/4 rows'"],
        pattern: /(?<current>\d+)\/(?<total>\d+) rows/,
      }),
    );
    const progress = events.find((e) => e.type === "progress") as { pct: number } | undefined;
    expect(progress?.pct).toBe(75);
  });
});
