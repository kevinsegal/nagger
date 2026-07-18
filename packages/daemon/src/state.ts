import fsp from "node:fs/promises";
import path from "node:path";
import type { WatchStatus } from "@nagger/core";

/** Persist the daemon's in-memory status mirror to a single JSON file. */
export async function writeState(file: string, statuses: WatchStatus[]): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const payload = { pid: process.pid, updatedAt: Date.now(), watches: statuses };
  await fsp.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
}

/** Read the persisted state, or null if absent/invalid. */
export async function readState(
  file: string,
): Promise<{ pid: number; updatedAt: number; watches: WatchStatus[] } | null> {
  try {
    const raw = await fsp.readFile(file, "utf8");
    return JSON.parse(raw) as { pid: number; updatedAt: number; watches: WatchStatus[] };
  } catch {
    return null;
  }
}
