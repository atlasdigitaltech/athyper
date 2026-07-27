import { describe, expect, it } from "vitest";
import {
  ATLAS_AGENT_SCHEMA_VERSION,
  appendUserMessage,
  applyStreamEnvelope,
  createInitialConversationState,
  type AgentStreamEnvelope,
} from "../../index";

const ids = {
  run: "00000000-0000-4000-8000-000000000001",
  thread: "00000000-0000-4000-8000-000000000002",
  message: "00000000-0000-4000-8000-000000000003",
};

function envelope(
  sequence: number,
  event: AgentStreamEnvelope["event"],
): AgentStreamEnvelope {
  return {
    schema_version: ATLAS_AGENT_SCHEMA_VERSION,
    run_id: ids.run,
    thread_id: ids.thread,
    message_id: ids.message,
    sequence,
    event,
  };
}

describe("Atlas conversation reducer", () => {
  it("builds a streamed assistant message and completes the run", () => {
    let state = appendUserMessage(createInitialConversationState(), {
      id: "user-1",
      role: "user",
      content: "Hello",
      status: "complete",
      createdAt: new Date(0).toISOString(),
    });
    state = applyStreamEnvelope(state, envelope(0, {
      type: "run.started",
      provider: "atlas",
      model: "atlas-fast",
    }));
    state = applyStreamEnvelope(state, envelope(1, {
      type: "message.delta",
      delta: "Hello ",
    }));
    state = applyStreamEnvelope(state, envelope(2, {
      type: "message.delta",
      delta: "from Atlas.",
    }));
    state = applyStreamEnvelope(state, envelope(3, {
      type: "run.completed",
      finish_reason: "end_turn",
      model_used: "atlas-fast",
      usage: { input_tokens: 4, output_tokens: 5 },
    }));

    expect(state.phase).toBe("idle");
    expect(state.threadId).toBe(ids.thread);
    expect(state.messages[1]).toMatchObject({
      role: "assistant",
      content: "Hello from Atlas.",
      status: "complete",
    });
  });

  it("ignores repeated sequence numbers in the active run", () => {
    let state = applyStreamEnvelope(createInitialConversationState(), envelope(0, {
      type: "run.started",
      provider: "atlas",
      model: "test",
    }));
    state = applyStreamEnvelope(state, envelope(1, { type: "message.delta", delta: "A" }));
    state = applyStreamEnvelope(state, envelope(1, { type: "message.delta", delta: "A" }));
    expect(state.messages[0]?.content).toBe("A");
  });

  it("attaches a validated citation once and preserves its immutable revision", () => {
    let state = applyStreamEnvelope(createInitialConversationState(), envelope(0, {
      type: "run.started", provider: "atlas", model: "test",
    }));
    const citation = {
      type: "citation.added" as const,
      citation: {
        citation_id: "rag:source-1:revision-1:chunk-1",
        source_id: "source-1", revision_id: "revision-1", chunk_id: "chunk-1",
        checksum: "sha256:abcdef123456", title: "Handbook", excerpt: "Approved guidance.",
      },
    };
    state = applyStreamEnvelope(state, envelope(1, citation));
    state = applyStreamEnvelope(state, envelope(2, citation));
    expect(state.messages[0]?.citations).toEqual([expect.objectContaining({ revisionId: "revision-1" })]);
  });

  it("preserves a certified record summary card through stream completion", () => {
    let state = applyStreamEnvelope(createInitialConversationState(), envelope(0, {
      type: "run.started", provider: "atlas", model: "test",
    }));
    state = applyStreamEnvelope(state, envelope(1, {
      type: "result.card",
      card: {
        kind: "record_summary",
        version: 1,
        entityType: "company_code",
        entityId: "CC-100",
        title: "Malaysia",
        fields: [{ label: "Code", displayValue: "CC-100" }],
        evidence: [{
          sourceId: "CC-100",
          revisionId: "sha256-revision",
          checksum: "sha256:abcdef123456",
        }],
      },
    }));
    state = applyStreamEnvelope(state, envelope(2, {
      type: "run.completed",
      finish_reason: "end_turn",
      model_used: "test",
      usage: { input_tokens: 1, output_tokens: 1 },
    }));

    expect(state.messages[0]?.resultCards).toEqual([
      expect.objectContaining({
        kind: "record_summary",
        entityId: "CC-100",
      }),
    ]);
  });

  it("ignores late events from a run that is no longer active", () => {
    const state = applyStreamEnvelope(
      createInitialConversationState(),
      envelope(2, { type: "message.delta", delta: "stale tenant content" }),
    );

    expect(state).toEqual(createInitialConversationState());
  });

  it("accepts a safe terminal rejection before a provider run starts", () => {
    let state = appendUserMessage(createInitialConversationState(), {
      id: "user-1",
      role: "user",
      content: "Hello",
      status: "complete",
      createdAt: new Date(0).toISOString(),
    });
    state = applyStreamEnvelope(state, envelope(0, {
      type: "run.failed",
      code: "stale_model_catalog",
      message: "internal catalog detail",
      retryable: false,
    }));

    expect(state.phase).toBe("error");
    expect(state.error).toBe(
      "Your available Atlas modes changed. Please try the request again.",
    );
    expect(JSON.stringify(state)).not.toContain("internal catalog detail");
  });

  it("does not expose a provider failure message to the customer", () => {
    let state = applyStreamEnvelope(createInitialConversationState(), envelope(0, {
      type: "run.started",
      provider: "internal-provider",
      model: "internal-model",
    }));
    state = applyStreamEnvelope(state, envelope(1, {
      type: "run.failed",
      code: "provider_internal",
      message: "upstream secret diagnostic: sk-private",
      retryable: false,
    }));

    expect(state.error).toBe("Atlas could not complete this response. Please try again.");
    expect(JSON.stringify(state.messages)).not.toContain("sk-private");
  });
});
