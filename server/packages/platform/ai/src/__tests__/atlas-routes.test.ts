import type { AtlasSseEnvelope } from "@athyper/server-contract-ai";
import { describe, expect, it, vi } from "vitest";
import { writeAtlasSse } from "../atlas-routes.js";

describe("Atlas HTTP streaming", () => {
  it("emits the versioned SSE protocol with anti-buffering headers", async () => {
    const status = vi.fn().mockReturnThis();
    const setHeader = vi.fn();
    const write = vi.fn();
    const end = vi.fn();
    const event: AtlasSseEnvelope = {
      protocol: "atlas.sse/1",
      sequence: 1,
      runId: "run-1",
      threadId: "thread-1",
      emittedAt: "2026-08-11T00:00:00.000Z",
      event: { type: "message.delta", messageId: "message-1", text: "hello" },
    };
    async function* events(): AsyncIterable<AtlasSseEnvelope> { yield event; }

    await writeAtlasSse({ status, setHeader, write, end } as never, events());

    expect(status).toHaveBeenCalledWith(200);
    expect(setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream; charset=utf-8");
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache, no-transform");
    expect(write).toHaveBeenCalledWith(expect.stringContaining("event: message.delta\n"));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"protocol":"atlas.sse/1"'));
    expect(end).toHaveBeenCalledOnce();
  });
  it("stops writing and does not end a socket already closed by the client",async()=>{const controller=new AbortController();const write=vi.fn(()=>{controller.abort();return true;});const end=vi.fn();async function* events(){yield{protocol:"atlas.sse/1",sequence:1,runId:"r",threadId:"t",emittedAt:"2026-08-12T00:00:00Z",event:{type:"run.cancelled"}} as AtlasSseEnvelope;yield{protocol:"atlas.sse/1",sequence:2,runId:"r",threadId:"t",emittedAt:"2026-08-12T00:00:00Z",event:{type:"run.cancelled"}} as AtlasSseEnvelope;}await writeAtlasSse({status:vi.fn().mockReturnThis(),setHeader:vi.fn(),write,end} as never,events(),controller.signal);expect(write).toHaveBeenCalledOnce();expect(end).not.toHaveBeenCalled();});
});

it("leaves preflight failures available for a JSON error response", async () => {
  const setHeader = vi.fn();
  async function* events(): AsyncIterable<AtlasSseEnvelope> { throw new Error("preflight failed"); }
  await expect(writeAtlasSse({ status: vi.fn(), setHeader } as never, events())).rejects.toThrow("preflight failed");
  expect(setHeader).not.toHaveBeenCalled();
});

it("waits for socket drain before requesting another event and releases listeners", async () => {
  const { EventEmitter } = await import("node:events");
  const socket = Object.assign(new EventEmitter(), { status: vi.fn(), setHeader: vi.fn(), write: vi.fn().mockReturnValueOnce(false).mockReturnValue(true), end: vi.fn() });
  let pulled = 0;
  async function* events(): AsyncIterable<AtlasSseEnvelope> {
    for (let sequence = 1; sequence <= 2; sequence++) { pulled++; yield { protocol: "atlas.sse/1", sequence, runId: "r", threadId: "t", emittedAt: "2026-09-06T00:00:00Z", event: { type: "run.cancelled" } }; }
  }
  const writing = writeAtlasSse(socket as never, events());
  await vi.waitFor(() => expect(socket.listenerCount("drain")).toBe(1));
  expect(pulled).toBe(1);
  socket.emit("drain"); await writing;
  expect(pulled).toBe(2); expect(socket.end).toHaveBeenCalledOnce(); expect(socket.listenerCount("close")).toBe(0);
});

it("releases a stalled stream when the client disconnects", async () => {
  const { EventEmitter } = await import("node:events");
  const socket = Object.assign(new EventEmitter(), { status: vi.fn(), setHeader: vi.fn(), write: vi.fn(() => false), end: vi.fn() });
  const finalized = vi.fn();
  async function* events(): AsyncIterable<AtlasSseEnvelope> {
    try { yield { protocol: "atlas.sse/1", sequence: 1, runId: "r", threadId: "t", emittedAt: "2026-09-06T00:00:00Z", event: { type: "run.cancelled" } }; } finally { finalized(); }
  }
  const writing = writeAtlasSse(socket as never, events());
  await vi.waitFor(() => expect(socket.listenerCount("drain")).toBe(1));
  socket.emit("close"); await writing;
  expect(socket.end).not.toHaveBeenCalled(); expect(finalized).toHaveBeenCalledOnce(); expect(socket.listenerCount("drain")).toBe(0);
});
