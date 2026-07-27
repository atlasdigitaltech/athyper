import type { AgentStreamEnvelope } from "../protocol/envelope";
import type { AtlasMessage } from "./message-types";
import { reduceMessages } from "./message-store";
import { atlasRunFailureMessage } from "./public-error";

export type AtlasConversationPhase = "idle" | "running" | "awaiting-tool" | "error";

export interface AtlasConversationState {
  phase: AtlasConversationPhase;
  messages: AtlasMessage[];
  activeRunId: string | null;
  threadId: string | null;
  lastSequence: number;
  error: string | null;
}

export function createInitialConversationState(): AtlasConversationState {
  return {
    phase: "idle",
    messages: [],
    activeRunId: null,
    threadId: null,
    lastSequence: -1,
    error: null,
  };
}

export function appendUserMessage(
  state: AtlasConversationState,
  message: AtlasMessage,
): AtlasConversationState {
  return {
    ...state,
    phase: "running",
    messages: [...state.messages, message],
    error: null,
  };
}

export function applyStreamEnvelope(
  state: AtlasConversationState,
  envelope: AgentStreamEnvelope,
): AtlasConversationState {
  const startsNewRun = envelope.event.type === "run.started";
  const isInitialRejection =
    envelope.event.type === "run.failed"
    && state.activeRunId === null
    && state.phase === "running";
  if (
    !startsNewRun
    && !isInitialRejection
    && state.activeRunId !== envelope.run_id
  ) {
    return state;
  }
  if (!startsNewRun && state.activeRunId === envelope.run_id && envelope.sequence <= state.lastSequence) {
    return state;
  }

  const event = envelope.event;
  const phase: AtlasConversationPhase =
    event.type === "run.failed"
      ? "error"
      : event.type === "run.completed"
        ? "idle"
        : event.type === "tool.started"
          ? "awaiting-tool"
          : "running";

  return {
    ...state,
    phase,
    messages: reduceMessages(state.messages, envelope),
    activeRunId: event.type === "run.completed" || event.type === "run.failed"
      ? null
      : envelope.run_id,
    threadId: envelope.thread_id,
    lastSequence: envelope.sequence,
    error: event.type === "run.failed"
      ? atlasRunFailureMessage(event.code)
      : null,
  };
}

export function markConversationCancelled(
  state: AtlasConversationState,
): AtlasConversationState {
  return {
    ...state,
    phase: "idle",
    activeRunId: null,
    error: null,
    messages: state.messages.map((message) =>
      message.status === "streaming"
        ? { ...message, status: "failed" }
        : message,
    ),
  };
}
