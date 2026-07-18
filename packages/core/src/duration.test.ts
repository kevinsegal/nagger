import { describe, it, expect } from "vitest";
import { parseDuration, formatDuration } from "./duration.js";

describe("parseDuration", () => {
  it("parses single units", () => {
    expect(parseDuration("120s")).toBe(120_000);
    expect(parseDuration("10m")).toBe(600_000);
    expect(parseDuration("2h")).toBe(7_200_000);
    expect(parseDuration("500ms")).toBe(500);
  });

  it("parses compound durations", () => {
    expect(parseDuration("2m 14s")).toBe(134_000);
    expect(parseDuration("1h 30m")).toBe(5_400_000);
  });

  it("treats bare numbers as milliseconds", () => {
    expect(parseDuration("3000")).toBe(3000);
    expect(parseDuration(4200)).toBe(4200);
  });

  it("throws on garbage", () => {
    expect(() => parseDuration("soon")).toThrow();
  });
});

describe("formatDuration", () => {
  it("formats terse durations", () => {
    expect(formatDuration(6000)).toBe("6s");
    expect(formatDuration(362_000)).toBe("6m 02s");
    expect(formatDuration(3_660_000)).toBe("1h 01m");
  });
});
