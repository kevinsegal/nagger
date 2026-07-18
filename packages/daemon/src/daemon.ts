import {
  buildWatcher,
  engineOptionsFromDefaults,
  runWatch,
  watchLabel,
  type EngineEvent,
  type NagConfig,
  type WatchConfig,
  type WatchStatus,
} from "@nagger/core";
import type { Notifier } from "@nagger/core";
import { RpcServer } from "./rpc.js";
import { socketPath, statePath } from "./paths.js";
import { writeState } from "./state.js";

interface LiveWatch {
  status: WatchStatus;
  promise: Promise<unknown>;
}

/**
 * Runs a config's watches concurrently and exposes their live status over the
 * JSON-RPC socket. State is kept in memory and mirrored to a single JSON file.
 */
export class Daemon {
  private readonly watches = new Map<string, LiveWatch>();
  private rpc: RpcServer | undefined;
  private readonly socket: string;
  private readonly state: string;

  constructor(
    private readonly config: NagConfig,
    private readonly notifier: Notifier,
    opts: { socket?: string; state?: string } = {},
  ) {
    this.socket = opts.socket ?? socketPath();
    this.state = opts.state ?? statePath();
  }

  get socketFile(): string {
    return this.socket;
  }

  async start(): Promise<void> {
    this.rpc = new RpcServer(this.socket, (req) => this.handle(req.method));
    await this.rpc.listen();
    for (const w of this.config.watches) this.launch(w);
    await this.persist();
  }

  private launch(w: WatchConfig): void {
    const now = Date.now();
    const label = watchLabel(w);
    const status: WatchStatus = {
      name: w.name,
      kind: w.type,
      label,
      state: "running",
      pct: 0,
      lastMilestone: 0,
      startedAt: now,
      updatedAt: now,
      etaMs: null,
    };
    const engineDefaults = engineOptionsFromDefaults(this.config.defaults);
    const engine = { ...engineDefaults, ...(w.step !== undefined ? { step: w.step } : {}) };

    const onEvent = (ev: EngineEvent) => {
      this.applyEvent(status, ev);
      void this.persist();
    };

    const promise = runWatch(buildWatcher(w), this.notifier, {
      label,
      engine,
      handleSigint: false,
      onEvent,
    }).catch((err: unknown) => {
      status.state = "failed";
      status.updatedAt = Date.now();
      return err;
    });

    this.watches.set(w.name, { status, promise });
  }

  private applyEvent(status: WatchStatus, ev: EngineEvent): void {
    status.updatedAt = ev.at;
    switch (ev.kind) {
      case "milestone":
        status.pct = ev.pct;
        status.lastMilestone = ev.milestone;
        status.etaMs = ev.etaMs;
        break;
      case "stalled":
        status.state = "stalled";
        break;
      case "complete":
        status.state = "complete";
        status.pct = 100;
        break;
      case "failed":
        status.state = "failed";
        break;
      case "cancelled":
        status.state = "cancelled";
        break;
    }
  }

  private statuses(): WatchStatus[] {
    return [...this.watches.values()].map((w) => w.status);
  }

  private async persist(): Promise<void> {
    await writeState(this.state, this.statuses()).catch(() => {});
  }

  private handle(method: string): unknown {
    switch (method) {
      case "ping":
        return { pong: true, pid: process.pid };
      case "status":
        return { watches: this.statuses() };
      case "shutdown":
        void this.stop();
        return { stopping: true };
      default:
        throw new Error(`unknown method: ${method}`);
    }
  }

  /** Resolves once every watch reaches a terminal state. */
  async wait(): Promise<void> {
    await Promise.all([...this.watches.values()].map((w) => w.promise));
    await this.persist();
  }

  async stop(): Promise<void> {
    await this.rpc?.close();
  }
}
