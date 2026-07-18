import { defineConfig } from "nagger";

/**
 * Example Nagger config for daemon mode (`nag serve`).
 * Run: `nag serve --config nagger.config.ts` then `nag status`.
 */
export default defineConfig({
  defaults: {
    step: 10,
    stallAfter: "120s",
  },
  notify: {
    macos: { sound: { milestone: "Tink", success: "Glass", failure: "Basso" } },
    ntfy: { topic: process.env.NAGGER_NTFY_TOPIC },
  },
  watches: [
    {
      name: "api-health",
      type: "http",
      url: "https://api.example.com/health",
      expect: 200,
      interval: "5s",
    },
    {
      name: "nightly-etl",
      type: "log",
      path: "/var/log/etl.log",
      pattern: /(?<current>\d+)\/(?<total>\d+) rows/,
    },
  ],
});
