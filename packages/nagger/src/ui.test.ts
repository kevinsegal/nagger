import { describe, it, expect } from "vitest";
import { exitCodeFor, colorizeLine } from "./ui.js";
import type { RunSummary } from "@nagger/core";

const base: RunSummary = {
  label: "x",
  kind: "script",
  startedAt: 0,
  endedAt: 1000,
  durationMs: 1000,
  outcome: "complete",
  exitCode: null,
  milestonesHit: [],
  notifications: 0,
};

describe("exitCodeFor", () => {
  it("maps outcomes to guaranteed exit codes", () => {
    expect(exitCodeFor({ ...base, outcome: "complete" })).toBe(0);
    expect(exitCodeFor({ ...base, outcome: "cancelled" })).toBe(130);
    expect(exitCodeFor({ ...base, outcome: "failed", exitCode: 3 })).toBe(3);
    expect(exitCodeFor({ ...base, outcome: "failed", exitCode: null })).toBe(1);
  });
});

describe("colorizeLine", () => {
  it("returns a string for each glyph", () => {
    for (const line of ["▲ a", "✓ a", "✗ a", "⊘ a", "· a"]) {
      expect(typeof colorizeLine(line)).toBe("string");
    }
  });
});
