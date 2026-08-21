import { ATLAS_SSE_PROTOCOL, type AtlasSseEnvelope } from "@athyper/server-contract-ai";

export function serializeAtlasSse(envelope: AtlasSseEnvelope): string {
  if (envelope.protocol !== ATLAS_SSE_PROTOCOL) throw new TypeError("Unsupported Atlas SSE protocol.");
  return `id: ${envelope.runId}:${envelope.sequence}\nevent: ${envelope.event.type}\ndata: ${JSON.stringify(envelope)}\n\n`;
}
