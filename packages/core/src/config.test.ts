import { describe, it, expect } from "vitest";
import { defineConfig, buildWatcher, engineOptionsFromDefaults } from "./config.js";

describe("defineConfig", () => {
  it("validates and returns a typed config", () => {
    const cfg = defineConfig({
      defaults: { step: 10, stallAfter: "120s" },
      watches: [
        { name: "api", type: "http", url: "https://example.test/health", expect: 200 },
        { name: "etl", type: "log", path: "/tmp/etl.log", pattern: /(?<pct>\d+)%/ },
      ],
    });
    expect(cfg.watches).toHaveLength(2);
    expect(cfg.defaults?.step).toBe(10);
  });

  it("rejects an invalid watch", () => {
    expect(() =>
      defineConfig({
        // @ts-expect-error missing url
        watches: [{ name: "bad", type: "http" }],
      }),
    ).toThrow();
  });

  it("rejects unknown keys (strict)", () => {
    expect(() =>
      // @ts-expect-error extra key
      defineConfig({ nope: true, watches: [] }),
    ).toThrow();
  });
});

describe("buildWatcher", () => {
  it("builds each watcher kind", () => {
    expect(buildWatcher({ name: "s", type: "script", command: "echo" }).kind).toBe("script");
    expect(buildWatcher({ name: "h", type: "http", url: "https://x.test" }).kind).toBe("http");
    expect(buildWatcher({ name: "p", type: "port", port: 5432 }).kind).toBe("port");
    expect(buildWatcher({ name: "l", type: "log", path: "/tmp/x", pattern: /x/ }).kind).toBe("log");
    expect(buildWatcher({ name: "pid", type: "pid", pid: 1 }).kind).toBe("pid");
  });
});

describe("engineOptionsFromDefaults", () => {
  it("translates config defaults into engine options", () => {
    const opts = engineOptionsFromDefaults({ step: 5, stallAfter: "30s", debounce: "2s" });
    expect(opts).toEqual({ step: 5, stallAfterMs: 30_000, debounceMs: 2000 });
  });
});
