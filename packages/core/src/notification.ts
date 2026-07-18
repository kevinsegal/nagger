import { BRAND } from "./brand.js";
import { formatDuration } from "./duration.js";
import type { EngineEvent } from "./milestone.js";

export type NotificationLevel = "milestone" | "success" | "failure" | "info";

export interface Notification {
  /** Short title (notification headline). */
  title: string;
  /** Terse, information-dense body. */
  body: string;
  /** Single-line terminal rendering (title + body collapsed). */
  line: string;
  level: NotificationLevel;
  /** Named sound hint; adapters map this to a platform sound. */
  sound?: string;
  /** The engine event that produced this notification. */
  event: EngineEvent;
}

/** A sink that delivers notifications. All adapters implement this. */
export interface Notifier {
  readonly name: string;
  notify(n: Notification): Promise<void>;
}

const GLYPH = {
  milestone: "▲", // ▲
  success: "✓", // ✓
  failure: "✗", // ✕
  cancelled: "⊘", // ⊘
  stalled: "…", // …
} as const;

export interface SoundMap {
  milestone?: string;
  success?: string;
  failure?: string;
}

/**
 * Render an engine event into a Notification following Nagger's copy standards:
 * terse, information-dense, no wit where it would cost density.
 */
export function formatNotification(
  event: EngineEvent,
  label: string,
  sounds: SoundMap = {},
): Notification {
  switch (event.kind) {
    case "milestone": {
      const parts = [`${event.milestone}%`];
      if (event.skipped.length > 0) {
        parts.push(`skipped ${event.skipped.map((s) => `${s}%`).join("/")}`);
      }
      if (event.etaMs !== null && event.etaMs > 0) {
        parts.push(`ETA ${formatDuration(event.etaMs)}`);
      }
      const body = parts.join(" · ");
      return {
        title: label,
        body,
        line: `${GLYPH.milestone} ${label} — ${body}`,
        level: "milestone",
        ...(sounds.milestone ? { sound: sounds.milestone } : {}),
        event,
      };
    }
    case "complete": {
      const body = `done in ${formatDuration(event.durationMs)}`;
      return {
        title: label,
        body,
        line: `${GLYPH.success} ${label} — ${body}`,
        level: "success",
        ...(sounds.success ? { sound: sounds.success } : {}),
        event,
      };
    }
    case "failed": {
      const cause = event.exitCode !== null ? `exit ${event.exitCode}` : event.reason || "error";
      const body = `failed (${cause}) after ${formatDuration(event.durationMs)}`;
      return {
        title: label,
        body,
        line: `${GLYPH.failure} ${label} — ${body}`,
        level: "failure",
        ...(sounds.failure ? { sound: sounds.failure } : {}),
        event,
      };
    }
    case "cancelled": {
      const body = `cancelled after ${formatDuration(event.durationMs)}`;
      return {
        title: label,
        body,
        line: `${GLYPH.cancelled} ${label} — ${body}`,
        level: "failure",
        ...(sounds.failure ? { sound: sounds.failure } : {}),
        event,
      };
    }
    case "stalled": {
      const body = `stalled — no progress for ${formatDuration(event.sinceMs)}`;
      return {
        title: label,
        body,
        line: `${GLYPH.stalled} ${label} — ${body}`,
        level: "info",
        event,
      };
    }
  }
}

/** The Nagger notification title prefix, for adapters that want branding. */
export function brandedTitle(label: string): string {
  return `${BRAND.name}: ${label}`;
}
