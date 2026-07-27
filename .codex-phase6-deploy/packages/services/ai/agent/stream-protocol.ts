import type { AgentStreamEnvelope } from "@athyper/atlas-agent-runtime";

export function serializeAgentStreamEnvelope(envelope: AgentStreamEnvelope): string {
  return `event: ${envelope.event.type}\ndata: ${JSON.stringify(envelope)}\n\n`;
}
