import type {
  AtlasBusinessContextV1,
  AtlasModelPrompt,
} from "@athyper/server-contract-ai";
const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
/** Resolve only an unambiguous relative relationship and explicit field phrases
 * from this turn's authorized metadata. Execution still uses the tool coordinator. */
export function directDiscoveredReferenceRead(
  text: string,
  page: AtlasBusinessContextV1 | undefined,
  messages: AtlasModelPrompt["messages"],
): { relationshipKey: string; fields: string[] } | undefined {
  if (
    page?.kind !== "record" ||
    page.asOf ||
    !/\b(this|current)\b/i.test(text) ||
    /\b(update|create|delete|change|set|except|excluding|without|not|or)\b/i.test(
      text,
    )
  )
    return;
  const query = ` ${normalized(text)} `;
  const matches = (value: string) =>
    value.length > 1 && query.includes(` ${normalized(value)} `);
  const lastUser = messages.reduce(
    (last, message, index) => (message.role === "user" ? index : last),
    -1,
  );
  for (const message of messages.slice(lastUser + 1).reverse())
    for (const block of message.content) {
      if (
        block.type !== "tool_result" ||
        block.toolName !== "entity_discover" ||
        block.isError ||
        !block.result ||
        typeof block.result !== "object"
      )
        continue;
      type Item = {
        entityCode: string;
        fields: { key: string; label?: string }[];
        relationships?: {
          key: string;
          label?: string;
          targetEntityCode: string;
        }[];
      };
      const items = (block.result as { items?: Item[] }).items;
      if (!Array.isArray(items)) return;
      const source = items.find((item) => item.entityCode === page.entityCode);
      const relations =
        source?.relationships?.filter((relation) =>
          [relation.key, relation.label ?? "", relation.targetEntityCode].some(
            matches,
          ),
        ) ?? [];
      if (relations.length !== 1) return;
      const relation = relations[0]!,
        target = items.find(
          (item) => item.entityCode === relation.targetEntityCode,
        );
      if (!target) return;
      const fields = target.fields.filter((field) =>
        [field.key, field.label ?? ""].some(matches),
      );
      // A short key such as "code" is not a second request inside "calling code".
      const selected = fields.filter(
        (field) =>
          !fields.some(
            (other) =>
              other !== field &&
              [other.key, other.label ?? ""].some((long) =>
                [field.key, field.label ?? ""].some(
                  (short) =>
                    short &&
                    normalized(long) !== normalized(short) &&
                    normalized(long).includes(normalized(short)),
                ),
              ),
          ),
      );
      if (!selected.length || selected.length > 8) return;
      // Extra names or clauses need model planning; never silently replace an
      // explicitly requested record with the current record's relationship.
      const vocabulary = new Set(
        normalized(
          [
            "what is are the this current record s of for show read tell me please and",
            page.entityCode,
            relation.key,
            relation.label ?? "",
            target.entityCode,
            ...selected.flatMap((field) => [field.key, field.label ?? ""]),
          ].join(" "),
        ).split(" "),
      );
      if (
        normalized(text)
          .split(" ")
          .some((word) => !vocabulary.has(word))
      )
        return;
      return {
        relationshipKey: relation.key,
        fields: selected.map((field) => field.key),
      };
    }
}
