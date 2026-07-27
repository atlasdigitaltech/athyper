import type { AgentStreamEnvelope } from "../protocol/envelope";
import type { AtlasMessage } from "./message-types";
import { atlasRunFailureMessage } from "./public-error";

export function reduceMessages(
  messages: readonly AtlasMessage[],
  envelope: AgentStreamEnvelope,
): AtlasMessage[] {
  const event = envelope.event;

  if (event.type === "run.started") {
    if (messages.some((message) => message.id === envelope.message_id)) return [...messages];
    return [
      ...messages,
      {
        id: envelope.message_id,
        role: "assistant",
        content: "",
        status: "streaming",
        createdAt: new Date().toISOString(),
        runId: envelope.run_id,
      },
    ];
  }

  if (event.type === "message.delta") {
    return messages.map((message) =>
      message.id === envelope.message_id
        ? { ...message, content: `${message.content}${event.delta}` }
        : message,
    );
  }

  if (event.type === "citation.added") {
    const citation = {
      citationId: event.citation.citation_id,
      sourceId: event.citation.source_id,
      revisionId: event.citation.revision_id,
      chunkId: event.citation.chunk_id,
      checksum: event.citation.checksum,
      title: event.citation.title,
      excerpt: event.citation.excerpt,
    };
    return messages.map((message) => {
      if (message.id !== envelope.message_id) return message;
      if (message.citations?.some((item) => item.citationId === citation.citationId)) return message;
      return { ...message, citations: [...(message.citations ?? []), citation] };
    });
  }

  if (event.type === "result.card") {
    return messages.map((message) =>
      message.id === envelope.message_id
        ? {
            ...message,
            resultCards: [...(message.resultCards ?? []), event.card],
          }
        : message,
    );
  }

  if (event.type === "run.completed") {
    return messages.map((message) =>
      message.id === envelope.message_id
        ? { ...message, status: "complete" }
        : message,
    );
  }

  if (event.type === "run.failed") {
    return messages.map((message) =>
      message.id === envelope.message_id
        ? {
            ...message,
            status: "failed",
            content: message.content || atlasRunFailureMessage(event.code),
          }
        : message,
    );
  }

  return [...messages];
}
