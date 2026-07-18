import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import { LogWatcher } from "./log.js";
import type { WatcherEvent } from "./types.js";

describe("LogWatcher", () => {
  it("tails a file, extracts progress, and completes at 100%", async () => {
    const file = path.join(os.tmpdir(), `nagger-log-${process.pid}-${Date.now()}.log`);
    await fsp.writeFile(file, "");

    const watcher = new LogWatcher({
      name: "etl",
      path: file,
      pattern: /(?<current>\d+)\/(?<total>\d+) rows/,
      intervalMs: 15,
    });

    const events: WatcherEvent[] = [];
    const run = watcher.run((e) => events.push(e));

    const steps = ["25/100 rows", "50/100 rows", "75/100 rows", "100/100 rows"];
    for (const line of steps) {
      await fsp.appendFile(file, `${line}\n`);
      await new Promise((r) => setTimeout(r, 25));
    }

    await run;
    await fsp.rm(file, { force: true });

    const pcts = events.filter((e) => e.type === "progress").map((e) => (e as { pct: number }).pct);
    expect(pcts).toEqual([25, 50, 75, 100]);
    expect(events.at(-1)).toEqual({ type: "complete" });
  });
});
