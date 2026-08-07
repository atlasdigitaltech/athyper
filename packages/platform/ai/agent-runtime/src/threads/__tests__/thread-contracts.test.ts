import { describe, expect, it } from "vitest";

import { hydrateConversationFromThread } from "../../conversation/hydrate-thread";
import {
  AtlasThreadListResponseSchema,
  AtlasThreadMessageListResponseSchema,
  CreateAtlasThreadRequestSchema,
  ListAtlasThreadsQuerySchema,
  UpdateAtlasThreadRequestSchema,
  type AtlasThreadMessage,
} from "../thread-contracts";

const THREAD_ID = "10000000-0000-4000-8000-000000000001";

describe("Atlas thread contracts", () => {
  it("applies bounded pagination defaults and rejects empty updates", () => {
    expect(ListAtlasThreadsQuerySchema.parse({})).toEqual({
      limit: 50,
      status: "all",
    });
    expect(() => ListAtlasThreadsQuerySchema.parse({ limit: 101 })).toThrow();
    expect(() =>
      UpdateAtlasThreadRequestSchema.parse({ row_version: "4" })
    ).toThrow(/requires title or status/);
    expect(
      UpdateAtlasThreadRequestSchema.parse({
        row_version: "4",
        status: "archived",
      }),
    ).toEqual({ row_version: "4", status: "archived" });
  });

  it("keeps create and response contracts strict", () => {
    expect(
      CreateAtlasThreadRequestSchema.parse({
        title: "Invoice review",
      }),
    ).toEqual({
      title: "Invoice review",
    });
    expect(() =>
      CreateAtlasThreadRequestSchema.parse({
        title: "Invoice review",
        plane: "neon",
      })
    ).toThrow();
    expect(() =>
      AtlasThreadListResponseSchema.parse({
        items: [],
        next_cursor: null,
        retention_notice: "Saved for 30 days.",
        unreviewed_field: true,
      })
    ).toThrow();
  });

  it("requires unique sequences within each message page", () => {
    const message = persistedMessage({
      message_id: "30000000-0000-4000-8000-000000000001",
      sequence: "1",
    });
    expect(() =>
      AtlasThreadMessageListResponseSchema.parse({
        items: [
          message,
          {
            ...message,
            message_id: "30000000-0000-4000-8000-000000000002",
          },
        ],
        next_cursor: null,
      })
    ).toThrow(/sequence must be unique/);
  });

  it("hydrates ordered user/assistant messages and keeps tool/system records hidden", () => {
    const state = hydrateConversationFromThread(THREAD_ID, [
      persistedMessage({
        message_id: "30000000-0000-4000-8000-000000000003",
        sequence: "3",
        role: "tool",
        content: "restricted tool trace",
      }),
      persistedMessage({
        message_id: "30000000-0000-4000-8000-000000000002",
        sequence: "2",
        role: "assistant",
        status: "cancelled",
        content: "partial answer",
      }),
      persistedMessage({
        message_id: "30000000-0000-4000-8000-000000000001",
        sequence: "1",
        role: "user",
        content: "saved question",
      }),
    ]);

    expect(state).toMatchObject({
      phase: "idle",
      threadId: THREAD_ID,
      activeRunId: null,
      error: null,
    });
    expect(state.messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: "saved question",
        status: "complete",
      }),
      expect.objectContaining({
        role: "assistant",
        content: "partial answer",
        status: "failed",
      }),
    ]);
    expect(JSON.stringify(state.messages)).not.toContain("restricted tool trace");
  });

  it("rejects cross-thread persisted messages", () => {
    expect(() =>
      hydrateConversationFromThread(THREAD_ID, [
        persistedMessage({
          thread_id: "90000000-0000-4000-8000-000000000001",
        }),
      ])
    ).toThrow(/different Atlas thread/);
  });
});

function persistedMessage(
  overrides: Partial<AtlasThreadMessage> = {},
): AtlasThreadMessage {
  return {
    message_id: "30000000-0000-4000-8000-000000000001",
    thread_id: THREAD_ID,
    sequence: "1",
    role: "user",
    content: "saved question",
    status: "complete",
    run_id: null,
    parent_message_id: null,
    created_at: "2026-07-23T12:00:00.000Z",
    terminal_at: "2026-07-23T12:00:01.000Z",
    ...overrides,
  };
}
