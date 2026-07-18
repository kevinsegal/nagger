import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Resolve workspace packages to their source so tests run without a build step.
export default defineConfig({
  resolve: {
    alias: {
      "@nagger/core": r("./packages/core/src/index.ts"),
      "@nagger/notify": r("./packages/notify/src/index.ts"),
      "@nagger/daemon": r("./packages/daemon/src/index.ts"),
      nagger: r("./packages/nagger/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 20000,
  },
});
