import type {
  AtlasBusinessContextV1,
  AtlasModelPrompt,
  AtlasProviderToolDefinition,
} from "@athyper/server-contract-ai";
import { selectEntitySectionTools } from "./entity-section-tool-selection.js";
/** Stage metadata discovery and data reads within the local context budget.
 * Selection is not authority: every execution still revalidates its registration. */
export function entityDiscoveryRoundTools(
  tools: readonly AtlasProviderToolDefinition[],
  text: string,
  page: AtlasBusinessContextV1 | undefined,
  messages: AtlasModelPrompt["messages"],
): readonly AtlasProviderToolDefinition[] {
  if (!tools.some((t) => t.name === "entity_lookup")) return tools;
  const lastUser = messages.reduce(
    (last, m, index) => (m.role === "user" ? index : last),
    -1,
  );
  const discovered = messages
    .slice(lastUser + 1)
    .some((m) =>
      m.content.some(
        (b) =>
          b.type === "tool_result" &&
          b.toolName === "entity_discover" &&
          !b.isError &&
          b.result !== null &&
          typeof b.result === "object" &&
          Array.isArray((b.result as { items?: unknown }).items) &&
          (b.result as { items: unknown[] }).items.length > 0,
      ),
    );
  const current = selectEntitySectionTools(tools, text, page) ?? [];
  return tools.filter((t) =>
    discovered
      ? ["entity_lookup", "entity_follow_reference"].includes(t.name) ||
        current.some((c) => c.name === t.name)
      : t.name === "entity_discover" || current.some((c) => c.name === t.name),
  );
}
