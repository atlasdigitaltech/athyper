import type { AgentStreamEnvelope } from "@athyper/platform-ai-agent-runtime";

export function serializeAgentStreamEnvelope(envelope: AgentStreamEnvelope): string {
  return `event: ${envelope.event.type}\ndata: ${JSON.stringify(envelope)}\n\n`;
}
