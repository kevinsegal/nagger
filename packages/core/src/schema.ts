import { z } from "zod";

/**
 * Zod is the single source of truth for every config, event, and IPC message.
 * Values are validated at every boundary (config load, daemon RPC).
 */

/** A duration accepted as a string ("120s", "2m 14s") or ms number. */
export const DurationSchema = z.union([z.string().min(1), z.number().nonnegative()]);

export const SoundConfigSchema = z
  .object({
    milestone: z.string().optional(),
    success: z.string().optional(),
    failure: z.string().optional(),
  })
  .strict();

export const NotifyConfigSchema = z
  .object({
    macos: z.object({ sound: SoundConfigSchema.optional() }).strict().optional(),
    ntfy: z
      .object({
        topic: z.string().optional(),
        server: z.string().url().optional(),
      })
      .strict()
      .optional(),
    webhook: z.object({ url: z.string().url() }).strict().optional(),
    slack: z.object({ webhookUrl: z.string().url() }).strict().optional(),
  })
  .strict();

export const DefaultsSchema = z
  .object({
    step: z.number().positive().max(100).optional(),
    stallAfter: DurationSchema.optional(),
    debounce: DurationSchema.optional(),
    maxPerMinute: z.number().positive().optional(),
    allowRegress: z.boolean().optional(),
  })
  .strict();

const BaseWatch = {
  name: z.string().min(1),
  label: z.string().optional(),
  step: z.number().positive().max(100).optional(),
};

export const ScriptWatchSchema = z
  .object({
    ...BaseWatch,
    type: z.literal("script"),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    pattern: z.union([z.string(), z.instanceof(RegExp)]).optional(),
  })
  .strict();

export const HttpWatchSchema = z
  .object({
    ...BaseWatch,
    type: z.literal("http"),
    url: z.string().url(),
    expect: z.number().int().optional(),
    expectBody: z.string().optional(),
    interval: DurationSchema.optional(),
    timeout: DurationSchema.optional(),
  })
  .strict();

export const PortWatchSchema = z
  .object({
    ...BaseWatch,
    type: z.literal("port"),
    host: z.string().optional(),
    port: z.number().int().min(1).max(65535),
    interval: DurationSchema.optional(),
    timeout: DurationSchema.optional(),
  })
  .strict();

export const LogWatchSchema = z
  .object({
    ...BaseWatch,
    type: z.literal("log"),
    path: z.string().min(1),
    pattern: z.union([z.string(), z.instanceof(RegExp)]),
  })
  .strict();

export const PidWatchSchema = z
  .object({
    ...BaseWatch,
    type: z.literal("pid"),
    pid: z.number().int().positive().optional(),
    process: z.string().optional(),
    interval: DurationSchema.optional(),
  })
  .strict()
  .refine((v) => v.pid !== undefined || v.process !== undefined, {
    message: "pid watch requires either `pid` or `process`",
  });

export const WatchSchema = z.discriminatedUnion("type", [
  ScriptWatchSchema,
  HttpWatchSchema,
  PortWatchSchema,
  LogWatchSchema,
  PidWatchSchema,
]);

export const NagConfigSchema = z
  .object({
    defaults: DefaultsSchema.optional(),
    notify: NotifyConfigSchema.optional(),
    watches: z.array(WatchSchema).default([]),
  })
  .strict();

export type NagConfig = z.infer<typeof NagConfigSchema>;
export type NagConfigInput = z.input<typeof NagConfigSchema>;
export type WatchConfig = z.infer<typeof WatchSchema>;
export type NotifyConfig = z.infer<typeof NotifyConfigSchema>;

/* -------------------------------------------------------------------------- */
/* IPC (daemon <-> client) — newline-delimited JSON-RPC-ish messages.         */
/* -------------------------------------------------------------------------- */

export const RpcRequestSchema = z
  .object({
    id: z.number().int(),
    method: z.enum(["ping", "status", "shutdown"]),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const WatchStatusSchema = z.object({
  name: z.string(),
  kind: z.string(),
  label: z.string(),
  state: z.enum(["running", "complete", "failed", "cancelled", "stalled"]),
  pct: z.number(),
  lastMilestone: z.number(),
  startedAt: z.number(),
  updatedAt: z.number(),
  etaMs: z.number().nullable(),
});

export const RpcResponseSchema = z
  .object({
    id: z.number().int(),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().optional(),
  })
  .strict();

export type RpcRequest = z.infer<typeof RpcRequestSchema>;
export type RpcResponse = z.infer<typeof RpcResponseSchema>;
export type WatchStatus = z.infer<typeof WatchStatusSchema>;
