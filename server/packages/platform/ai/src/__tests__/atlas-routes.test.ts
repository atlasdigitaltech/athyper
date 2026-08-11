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
});
