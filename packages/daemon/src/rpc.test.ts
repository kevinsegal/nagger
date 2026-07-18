import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { RpcServer, rpcCall } from "./rpc.js";
import { Daemon } from "./daemon.js";
import { MockNotifier } from "@nagger/notify";
import { defineConfig } from "@nagger/core";

let server: RpcServer | undefined;
let daemon: Daemon | undefined;

afterEach(async () => {
  await server?.close();
  await daemon?.stop();
  server = undefined;
  daemon = undefined;
});

function sock(name: string): string {
  return path.join(os.tmpdir(), `nagger-test-${process.pid}-${name}.sock`);
}

describe("RpcServer", () => {
  it("round-trips a request over the socket", async () => {
    const socket = sock("rpc");
    server = new RpcServer(socket, (req) => ({ echoed: req.method }));
    await server.listen();
    const res = await rpcCall(socket, "ping");
    expect(res.ok).toBe(true);
    expect(res.result).toEqual({ echoed: "ping" });
  });

  it("returns an error for a bad request", async () => {
    const socket = sock("bad");
    server = new RpcServer(socket, () => {
      throw new Error("boom");
    });
    await server.listen();
    const res = await rpcCall(socket, "status");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("boom");
  });
});

describe("Daemon", () => {
  it("runs watches and reports status over RPC", async () => {
    const socket = sock("daemon");
    const state = path.join(os.tmpdir(), `nagger-test-${process.pid}-state.json`);
    const config = defineConfig({
      watches: [{ name: "quick", type: "script", command: "true" }],
    });
    daemon = new Daemon(config, new MockNotifier(), { socket, state });
    await daemon.start();
    const res = await rpcCall(socket, "status");
    expect(res.ok).toBe(true);
    const watches = (res.result as { watches: { name: string }[] }).watches;
    expect(watches.map((w) => w.name)).toContain("quick");
    await daemon.wait();
  });
});
