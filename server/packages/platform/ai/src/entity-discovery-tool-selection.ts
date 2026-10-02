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
  const relative = /\b(this|current)\b/i.test(text);
  const relationshipTerms =
    text
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter(
        (word) =>
          word.length > 2 &&
          ![
            "this",
            "current",
            "record",
            "code",
            "field",
            "what",
            "the",
          ].includes(word),
      ) ?? [];
  const sourceRelationship =
    relative &&
    page?.kind === "record" &&
    messages.slice(lastUser + 1).some((message) =>
      message.content.some((block) => {
        if (
          block.type !== "tool_result" ||
          block.toolName !== "entity_discover" ||
          block.isError ||
          !block.result ||
          typeof block.result !== "object"
        )
          return false;
        const items = (
          block.result as {
            items?: {
              entityCode: string;
              relationships?: {
                key: string;
                label?: string;
                targetEntityCode: string;
              }[];
            }[];
          }
        ).items;
        return items?.some(
          (item) =>
            item.entityCode === page.entityCode &&
            item.relationships?.some((relation) =>
              relationshipTerms.some((term) =>
                `${relation.key} ${relation.label ?? ""} ${relation.targetEntityCode}`
                  .toLowerCase()
                  .includes(term),
              ),
            ),
        );
      }),
    );
  return tools
    .filter((t) =>
      discovered
        ? sourceRelationship
          ? t.name === "entity_follow_reference"
          : t.name === "entity_lookup" || current.some((c) => c.name === t.name)
        : t.name === "entity_discover" ||
          current.some((c) => c.name === t.name),
    )
    .map((tool) => {
      if (tool.name === "entity_follow_reference") return { ...tool, description: "Read the current record's published relationship using discovered keys and target fields." };
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
            },
            projection: {
              type: "string",
              enum: ["summary", "fields"],
            },
            fields: {
              type: "array",
              maxItems: 8,
              items: { type: "string" },
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
          kind: result.kind,
          coverage: result.coverage,
          items: result.items.map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item))
              return item;
            const {
              descriptorHash: _hash,
              capabilities: _capabilities,
              fields,
              relationships,
              ...metadata
            } = item;
            return {
              ...metadata,
              ...(Array.isArray(fields)
                ? {
                    fields: fields.map((field) => {
                      const { searchable, ...display } = field;
                      if (typeof display.label === "string" && typeof display.key === "string" && display.label.toLowerCase() === display.key.replaceAll("_", " ").toLowerCase()) delete display.label;
                      return searchable
                        ? { ...display, searchable: true }
                        : display;
                    }),
                  }
                : {}),
              ...(Array.isArray(relationships) && relationships.length
                ? { relationships }
                : {}),
            };
          }),
        },
      };
    }),
  }));
}
