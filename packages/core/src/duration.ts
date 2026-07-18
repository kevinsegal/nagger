/**
 * Human duration helpers. Nagger accepts durations as strings like "120s",
 * "10m", "2m 14s", or plain milliseconds as a number.
 */

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  sec: 1000,
  m: 60_000,
  min: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  d: 86_400_000,
};

const TOKEN = /(\d+(?:\.\d+)?)\s*(ms|sec|min|hr|[smhd])/gi;

/**
 * Parse a duration string into milliseconds.
 * Accepts compound forms ("2m 14s") and bare numbers (treated as ms).
 * @throws if the string contains no recognizable duration token.
 */
export function parseDuration(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) throw new Error(`invalid duration: ${input}`);
    return input;
  }
  const trimmed = input.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);

  let total = 0;
  let matched = false;
  TOKEN.lastIndex = 0;
  for (const m of trimmed.matchAll(TOKEN)) {
    matched = true;
    const value = Number(m[1]);
    const unit = m[2]!.toLowerCase();
    const mult = UNIT_MS[unit];
    if (mult === undefined) throw new Error(`unknown duration unit: ${unit}`);
    total += value * mult;
  }
  if (!matched) throw new Error(`invalid duration: "${input}"`);
  return total;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format milliseconds as a terse, human-readable duration.
 * Examples: 6362 -> "6s", 362000 -> "6m 02s", 3_700_000 -> "1h 01m".
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (totalMin < 60) return `${totalMin}m ${pad2(sec)}s`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return `${hr}h ${pad2(min)}m`;
}
