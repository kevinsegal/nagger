import { pathToFileURL } from "node:url";
import path from "node:path";
import { parseDuration } from "./duration.js";
import type { MilestoneOptions } from "./milestone.js";
import {
  NagConfigSchema,
  type NagConfig,
  type NagConfigInput,
  type WatchConfig,
} from "./schema.js";
import { ScriptWatcher } from "./watchers/script.js";
import { HttpWatcher } from "./watchers/http.js";
import { PortWatcher } from "./watchers/port.js";
import { LogWatcher } from "./watchers/log.js";
import { PidWatcher } from "./watchers/pid.js";
import type { Watcher } from "./watchers/types.js";

/**
 * Identity helper that validates and returns a typed config. Config files do:
 *   import { defineConfig } from "nagger";
 *   export default defineConfig({ ... });
 */
export function defineConfig(config: NagConfigInput): NagConfig {
  return NagConfigSchema.parse(config);
}

/** Load and validate a config module from disk (.js/.mjs/.ts via a loader). */
export async function loadConfig(file: string): Promise<NagConfig> {
  const abs = path.resolve(file);
  const mod = (await import(pathToFileURL(abs).href)) as { default?: unknown };
  const raw = mod.default ?? mod;
  return NagConfigSchema.parse(raw);
}

function toRegex(pattern: string | RegExp | undefined): RegExp | undefined {
  if (pattern === undefined) return undefined;
  return pattern instanceof RegExp ? pattern : new RegExp(pattern);
}

/** Translate defaults from config into milestone-engine options. */
export function engineOptionsFromDefaults(
  defaults: NagConfig["defaults"],
): Partial<MilestoneOptions> {
  const out: Partial<MilestoneOptions> = {};
  if (!defaults) return out;
  if (defaults.step !== undefined) out.step = defaults.step;
  if (defaults.allowRegress !== undefined) out.allowRegress = defaults.allowRegress;
  if (defaults.maxPerMinute !== undefined) out.maxPerMinute = defaults.maxPerMinute;
  if (defaults.debounce !== undefined) out.debounceMs = parseDuration(defaults.debounce);
  if (defaults.stallAfter !== undefined) out.stallAfterMs = parseDuration(defaults.stallAfter);
  return out;
}

/** Construct a concrete watcher from a validated watch config entry. */
export function buildWatcher(w: WatchConfig): Watcher {
  switch (w.type) {
    case "script":
      return new ScriptWatcher({
        name: w.name,
        command: w.command,
        ...(w.args ? { args: w.args } : {}),
        ...(toRegex(w.pattern) ? { pattern: toRegex(w.pattern)! } : {}),
      });
    case "http":
      return new HttpWatcher({
        name: w.name,
        url: w.url,
        ...(w.expect !== undefined ? { expect: w.expect } : {}),
        ...(w.expectBody !== undefined ? { expectBody: w.expectBody } : {}),
        ...(w.interval !== undefined ? { intervalMs: parseDuration(w.interval) } : {}),
        ...(w.timeout !== undefined ? { timeoutMs: parseDuration(w.timeout) } : {}),
      });
    case "port":
      return new PortWatcher({
        name: w.name,
        port: w.port,
        ...(w.host !== undefined ? { host: w.host } : {}),
        ...(w.interval !== undefined ? { intervalMs: parseDuration(w.interval) } : {}),
        ...(w.timeout !== undefined ? { timeoutMs: parseDuration(w.timeout) } : {}),
      });
    case "log":
      return new LogWatcher({
        name: w.name,
        path: w.path,
        pattern: toRegex(w.pattern)!,
      });
    case "pid":
      return new PidWatcher({
        name: w.name,
        ...(w.pid !== undefined ? { pid: w.pid } : {}),
        ...(w.process !== undefined ? { process: w.process } : {}),
        ...(w.interval !== undefined ? { intervalMs: parseDuration(w.interval) } : {}),
      });
  }
}

/** The label to show for a watch (explicit label, else its name). */
export function watchLabel(w: WatchConfig): string {
  return w.label ?? w.name;
}
