import net from "node:net";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  RpcRequestSchema,
  RpcResponseSchema,
  type RpcRequest,
  type RpcResponse,
} from "@nagger/core";

export type RpcHandler = (req: RpcRequest) => Promise<unknown> | unknown;

/**
 * Minimal newline-delimited JSON-RPC server over a unix domain socket. This is
 * the seam a future Swift menu bar client (Phase 2) attaches to without any
 * changes to core.
 */
export class RpcServer {
  private server: net.Server | undefined;

  constructor(
    private readonly socket: string,
    private readonly handler: RpcHandler,
  ) {}

  async listen(): Promise<void> {
    await fsp.mkdir(path.dirname(this.socket), { recursive: true });
    // Clear a stale socket from a previous run.
    if (fs.existsSync(this.socket)) await fsp.rm(this.socket, { force: true });

    this.server = net.createServer((conn) => {
      let buffer = "";
      conn.setEncoding("utf8");
      conn.on("data", (chunk: string) => {
        buffer += chunk;
        let idx: number;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (raw.trim().length === 0) continue;
          void this.dispatch(raw, conn);
        }
      });
      conn.on("error", () => conn.destroy());
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.socket, () => {
        this.server!.off("error", reject);
        resolve();
      });
    });
  }

  private async dispatch(raw: string, conn: net.Socket): Promise<void> {
    let response: RpcResponse;
    try {
      const req = RpcRequestSchema.parse(JSON.parse(raw));
      const result = await this.handler(req);
      response = { id: req.id, ok: true, result };
    } catch (err) {
      const id = safeId(raw);
      response = { id, ok: false, error: (err as Error).message };
    }
    conn.write(`${JSON.stringify(response)}\n`);
  }

  async close(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    await fsp.rm(this.socket, { force: true }).catch(() => {});
    this.server = undefined;
  }
}

function safeId(raw: string): number {
  try {
    const v = JSON.parse(raw) as { id?: unknown };
    return typeof v.id === "number" ? v.id : -1;
  } catch {
    return -1;
  }
}

/** Send a single request to a running daemon and await its response. */
export function rpcCall(
  socket: string,
  method: RpcRequest["method"],
  params?: Record<string, unknown>,
): Promise<RpcResponse> {
  return new Promise((resolve, reject) => {
    const conn = net.connect(socket);
    let buffer = "";
    const req: RpcRequest = { id: 1, method, ...(params ? { params } : {}) };

    conn.setEncoding("utf8");
    conn.on("connect", () => conn.write(`${JSON.stringify(req)}\n`));
    conn.on("data", (chunk: string) => {
      buffer += chunk;
      const idx = buffer.indexOf("\n");
      if (idx >= 0) {
        const raw = buffer.slice(0, idx);
        conn.end();
        try {
          resolve(RpcResponseSchema.parse(JSON.parse(raw)));
        } catch (err) {
          reject(err as Error);
        }
      }
    });
    conn.on("error", reject);
  });
}
