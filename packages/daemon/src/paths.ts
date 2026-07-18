import os from "node:os";
import path from "node:path";
import { BRAND } from "@nagger/core";

/** Base runtime directory for daemon socket + state (honors XDG-ish overrides). */
export function runtimeDir(): string {
  const base = process.env.XDG_RUNTIME_DIR ?? process.env.TMPDIR ?? os.tmpdir();
  return path.join(base, `${BRAND.slug}`);
}

/** Path to the daemon's unix domain socket. */
export function socketPath(): string {
  return process.env[`${BRAND.env}_SOCKET`] ?? path.join(runtimeDir(), `${BRAND.slug}.sock`);
}

/** Path to the daemon's JSON state file (single-file, in-memory mirror). */
export function statePath(): string {
  return process.env[`${BRAND.env}_STATE`] ?? path.join(runtimeDir(), "state.json");
}
