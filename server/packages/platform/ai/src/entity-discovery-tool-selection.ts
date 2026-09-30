import type {
  AtlasBusinessContextV1,
  AtlasModelPrompt,
  AtlasProviderToolDefinition,
} from "@athyper/server-contract-ai";
import { AtlasServiceError } from "./errors.js";
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
  // A section alias (e.g. "summary" or an Entity name) alone must not
  // select the current record when the user is naming different records.
  const current =
    /\b(this|current)\b/i.test(text) ||
    /^(?:explain|show|read)\s+(?:the\s+)?(?:saved\s+)?(?:information in\s+)?overview[.!?]?$/i.test(
      text.trim(),
    )
      ? (selectEntitySectionTools(tools, text, page) ?? [])
      : [];
  return tools
    .filter((t) =>
      discovered
        ? ["entity_lookup", "entity_follow_reference"].includes(t.name) ||
          current.some((c) => c.name === t.name)
        : t.name === "entity_discover" ||
          current.some((c) => c.name === t.name),
    )
    .map((tool) => {
      if (tool.name !== "entity_lookup") return tool;
      const {
        descriptorHash: _hash,
        value: _value,
        ...properties
      } = (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
      return {
        ...tool,
        description:
          "Read all requested names/codes together. Use discovered keys.",
        inputSchema: {
          ...tool.inputSchema,
          properties: {
            ...properties,
            values: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: { type: "string" },
              description: "All requested names/codes.",
            },
            projection: {
              type: "string",
              enum: ["summary", "fields"],
              description:
                "summary for record summaries; fields for specific fields.",
            },
            fields: {
              type: "array",
              maxItems: 8,
              items: { type: "string" },
              description: "Discovered keys; omit for summary.",
            },
          },
          required: Array.isArray(tool.inputSchema.required)
            ? [
                ...tool.inputSchema.required.filter(
                  (key) =>
                    key !== "descriptorHash" &&
                    key !== "value" &&
                    key !== "fields",
                ),
                "values",
                "projection",
              ]
            : [],
        },
      };
    });
}

/** Publication coordinates are selected from this turn's authorized discovery,
 * never fabricated by the model or borrowed from previous conversation turns. */
export function bindDiscoveredEntityLookup(
  input: Readonly<Record<string, unknown>>,
  messages: AtlasModelPrompt["messages"],
): Readonly<Record<string, unknown>> {
  if (input.projection !== undefined) {
    if (input.projection !== "summary" && input.projection !== "fields")
      throw new AtlasServiceError("TOOL_INVALID", "Invalid Entity projection.");
    const { projection, ...rest } = input;
    input = projection === "summary" ? { ...rest, fields: [] } : rest;
  }
  if (input.values !== undefined) {
    if (input.value !== undefined || !Array.isArray(input.values))
      throw new AtlasServiceError(
        "TOOL_INVALID",
        "Use one array of requested lookup values.",
      );
    const { values, ...rest } = input;
    input = { ...rest, value: values };
  }
  const lastUser = messages.reduce(
    (last, m, i) => (m.role === "user" ? i : last),
    -1,
  );
  for (const message of messages.slice(lastUser + 1).reverse()) {
    for (const block of message.content) {
      if (
        block.type !== "tool_result" ||
        block.toolName !== "entity_discover" ||
        block.isError ||
        !block.result ||
        typeof block.result !== "object"
      )
        continue;
      const items = (block.result as { items?: unknown }).items;
      if (!Array.isArray(items)) continue;
      const item = items.find(
        (item) =>
          item &&
          typeof item === "object" &&
          item.entityCode === input.entityCode,
      );
      if (!item || typeof item.descriptorHash !== "string") continue;
      if (
        input.descriptorHash !== undefined &&
        input.descriptorHash !== item.descriptorHash
      )
        throw new AtlasServiceError(
          "TOOL_DENIED",
          "The lookup publication does not match discovery.",
        );
      return { ...input, descriptorHash: item.descriptorHash };
    }
  }
  throw new AtlasServiceError(
    "TOOL_DENIED",
    "An authorized current-turn publication is required for lookup.",
  );
}

/** Keep publication pins in server evidence, not in the model's planning budget. */
export function entityDiscoveryPromptMessages(
  messages: AtlasModelPrompt["messages"],
): AtlasModelPrompt["messages"] {
  return messages.map((message) => ({
    ...message,
    content: message.content.map((block) => {
      if (
        block.type !== "tool_result" ||
        block.toolName !== "entity_discover" ||
        block.isError ||
        !block.result ||
        typeof block.result !== "object"
      )
        return block;
      const result = block.result as Record<string, unknown>;
      if (!Array.isArray(result.items)) return block;
      return {
        ...block,
        result: {
          ...result,
          items: result.items.map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item))
              return item;
            const { descriptorHash: _hash, ...metadata } = item;
            return metadata;
          }),
        },
      };
    }),
  }));
}
