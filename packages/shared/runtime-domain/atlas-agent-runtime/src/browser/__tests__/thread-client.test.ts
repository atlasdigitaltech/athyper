import { describe, expect, it, vi } from "vitest";

import {
  createAtlasThread,
  deleteAtlasThread,
  getAtlasThread,
  listAtlasThreadMessages,
  listAtlasThreads,
  updateAtlasThread,
} from "../thread-client";

const THREAD_ID = "10000000-0000-4000-8000-000000000001";
const THREAD = {
  thread_id: THREAD_ID,
  plane: "neon",
  title: "Invoice review",
  status: "active",
  message_count: "2",
  created_at: "2026-07-23T12:00:00.000Z",
  updated_at: "2026-07-23T12:01:00.000Z",
  row_version: "3",
  retention: {
    policy_id: "tenant-30-days",
    expires_at: "2026-08-22T12:01:00.000Z",
    purge_after: "2026-08-29T12:01:00.000Z",
    legal_hold: false,
    display_text: "Saved for 30 days after the last message.",
  },
} as const;

describe("Atlas thread browser client", () => {
  it("lists threads through the browser relay with no-store semantics", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        items: [THREAD],
        next_cursor: null,
        retention_notice: "Saved for 30 days after the last message.",
      }),
    );

    await expect(listAtlasThreads({ fetchImpl })).resolves.toMatchObject({
      items: [{ thread_id: THREAD_ID }],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/relay/ai/agent/threads?limit=50&status=all",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
      }),
    );
  });

  it("uses the typed POST, GET, PATCH, and DELETE thread endpoints", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ thread: THREAD }))
      .mockResolvedValueOnce(jsonResponse({ thread: THREAD }))
      .mockResolvedValueOnce(jsonResponse({
        thread: { ...THREAD, status: "archived", row_version: "4" },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await createAtlasThread({
      fetchImpl,
      request: {
        title: "Invoice review",
      },
    });
    await getAtlasThread({ fetchImpl, threadId: THREAD_ID });
    await updateAtlasThread({
      fetchImpl,
      threadId: THREAD_ID,
      request: { row_version: "3", status: "archived" },
    });
    await deleteAtlasThread({
      fetchImpl,
      threadId: THREAD_ID,
      rowVersion: "4",
    });

    expect(fetchImpl.mock.calls.map(([url, init]) => [
      url,
      (init as RequestInit).method,
    ])).toEqual([
      ["/api/relay/ai/agent/threads", "POST"],
      [`/api/relay/ai/agent/threads/${THREAD_ID}`, "GET"],
      [`/api/relay/ai/agent/threads/${THREAD_ID}`, "PATCH"],
      [`/api/relay/ai/agent/threads/${THREAD_ID}`, "DELETE"],
    ]);
    expect(fetchImpl.mock.calls[2]?.[1]?.body).toBe(
      JSON.stringify({ row_version: "3", status: "archived" }),
    );
    expect(fetchImpl.mock.calls[3]?.[1]?.headers).toMatchObject({
      "If-Match": "\"4\"",
    });
    await expect(
      deleteAtlasThread({
        fetchImpl,
        threadId: THREAD_ID,
        rowVersion: "0",
      }),
    ).rejects.toThrow("Atlas thread row version is invalid");
  });

  it("lists paginated messages and rejects a cross-thread response", async () => {
    const otherThreadId = "90000000-0000-4000-8000-000000000001";
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        items: [message(THREAD_ID)],
        next_cursor: "next-page",
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [message(otherThreadId)],
        next_cursor: null,
      }));

    await expect(
      listAtlasThreadMessages({ fetchImpl, threadId: THREAD_ID }),
    ).resolves.toMatchObject({ next_cursor: "next-page" });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      `/api/relay/ai/agent/threads/${THREAD_ID}/messages?limit=100`,
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );

    await expect(
      listAtlasThreadMessages({ fetchImpl, threadId: THREAD_ID }),
    ).rejects.toThrow(/crossed the requested thread boundary/);
  });

  it("fails closed on malformed responses without echoing their body", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ secret_provider_detail: "do-not-echo" }),
    );

    const error = await listAtlasThreads({ fetchImpl }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Atlas thread endpoint returned an unsupported contract",
    );
    expect((error as Error).message).not.toContain("do-not-echo");
  });
});

function message(threadId: string) {
  return {
    message_id: "30000000-0000-4000-8000-000000000001",
    thread_id: threadId,
    sequence: "1",
    role: "user",
    content: "saved question",
    status: "complete",
    run_id: null,
    parent_message_id: null,
    created_at: "2026-07-23T12:00:00.000Z",
    terminal_at: "2026-07-23T12:00:01.000Z",
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
