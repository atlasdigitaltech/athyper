import { parseAtlasIntent, type AtlasIntentV1, type AtlasBusinessContextV1, type AtlasProviderToolDefinition } from "@athyper/server-contract-ai";
import { directEntitySectionRead, selectEntitySectionTools } from "./entity-section-tool-selection.js";
export function resolveAtlasIntent(tools: readonly AtlasProviderToolDefinition[], text: string, page?: AtlasBusinessContextV1): AtlasIntentV1 {
  text = text.normalize("NFKC");
  const direct = directEntitySectionRead(tools, text, page);
  if (direct) return parseAtlasIntent({schemaVersion: 1, kind: "read", strategy: "exact_terms", reason: "matched", capabilityIds: [direct.name]});
  // Ambiguity is relevant only when each candidate could independently satisfy a direct read.
  const matches = selectEntitySectionTools(tools, text, page) ?? [];
  if (matches.length > 1 && matches.every(tool => directEntitySectionRead([tool], text, page))) return parseAtlasIntent({schemaVersion: 1, kind: "clarify", strategy: "exact_terms", reason: "ambiguous", capabilityIds: matches.map(tool => tool.name).slice(0, 16)});
  return parseAtlasIntent({schemaVersion: 1, kind: "delegate", strategy: "model", reason: "unsupported", capabilityIds: []});
}
