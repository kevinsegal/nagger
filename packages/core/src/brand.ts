/**
 * Single source of truth for every user-facing and internal identifier.
 * Nothing in the codebase should hard-code the string "nagger" — reference
 * {@link BRAND} instead so a rebrand is a one-line change.
 */
export const BRAND = {
  /** Display name, used in notification titles and help text. */
  name: "Nagger",
  /** Primary binary name. */
  bin: "nagger",
  /** First-class short alias. */
  alias: "nag",
  /** Prefix for environment variables, e.g. NAGGER_MOCK. */
  env: "NAGGER",
  /** Prefix for the daemon's unix socket / state directory. */
  slug: "nagger",
  /** Default remote ntfy server. */
  ntfyServer: "https://ntfy.sh",
  /** One-line tagline. */
  tagline: "Process & deployment sentinel — it nags so you don't have to check.",
} as const;

/** Build a namespaced environment variable name, e.g. env("MOCK") -> "NAGGER_MOCK". */
export function env(name: string): string {
  return `${BRAND.env}_${name}`;
}

/** True when mock adapters should be used instead of real side effects. */
export function isMock(): boolean {
  const v = process.env[env("MOCK")];
  return v === "1" || v === "true";
}
