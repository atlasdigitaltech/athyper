import type { AtlasThreadMessage } from "../threads/thread-contracts";
import type { AtlasConversationState } from "./conversation-state";
import type { AtlasMessage } from "./message-types";

/**
 * Converts a server-authoritative persisted transcript into the current
 * text-only conversation view. Tool/system records remain in server history
 * but are not rendered as user/assistant chat bubbles until their governed UI
 * contracts exist.
 */
export function hydrateConversationFromThread(
  threadId: string,
  persistedMessages: readonly AtlasThreadMessage[],
): AtlasConversationState {
  const sequenceIds = new Set<string>();
  const messageIds = new Set<string>();

  const messages = [...persistedMessages]
    .sort((left, right) =>
      comparePositiveIntegerStrings(left.sequence, right.sequence)
    )
    .map((message) => {
      if (message.thread_id !== threadId) {
        throw new Error("persisted message belongs to a different Atlas thread");
      }
      if (sequenceIds.has(message.sequence)) {
        throw new Error("persisted Atlas message sequence is duplicated");
      }
      if (messageIds.has(message.message_id)) {
        throw new Error("persisted Atlas message ID is duplicated");
      }
      sequenceIds.add(message.sequence);
      messageIds.add(message.message_id);

      if (message.role !== "user" && message.role !== "assistant") return null;
      const hydrated: AtlasMessage = {
        id: message.message_id,
        role: message.role,
        content: message.content,
        status: message.status === "complete" ? "complete" : "failed",
        createdAt: message.created_at,
        ...(message.run_id ? { runId: message.run_id } : {}),
        ...((message.result_cards?.length ?? 0) > 0
          ? { resultCards: message.result_cards }
          : {}),
      };
      return hydrated;
    })
    .filter((message): message is AtlasMessage => message !== null);

  return {
    phase: "idle",
    messages,
    activeRunId: null,
    threadId,
    lastSequence: -1,
    error: null,
  };
}

function comparePositiveIntegerStrings(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length;
  return left.localeCompare(right);
}
