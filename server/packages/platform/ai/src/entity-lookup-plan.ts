import type { AtlasModelPrompt } from "@athyper/server-contract-ai";

const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();
/** Narrow explicit code grammar; all identifiers must come from authorized
 * current-turn discovery. Binding and execution still use the tool coordinator. */
export function directDiscoveredCodeLookup(
  text: string,
  messages: AtlasModelPrompt["messages"],
) {
  const request =
    /^(?:show|read) (?:the )?(?:record )?summary of ([\p{L}\p{N}_ ]+) code ([\p{L}\p{N}_./+-]+)[?!.]?$/iu.exec(
      text.trim(),
    );
  if (!request || /\b(this|current|and|or|not)\b/i.test(request[1]!)) return;
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
      const items = (
        block.result as {
          items?: {
            entityCode: string;
            fields: { key: string; label?: string; searchable?: boolean }[];
          }[];
        }
      ).items;
      if (!Array.isArray(items)) return;
      const targets = items.filter(
        (item) => normalized(item.entityCode) === normalized(request[1]!),
      );
      if (targets.length !== 1) return;
      const target = targets[0]!;
      const keys = target.fields.filter(
        (field) =>
          field.searchable &&
          (normalized(field.key) === "code" ||
            normalized(field.label ?? "") === "code"),
      );
      if (keys.length !== 1) return;
      return {
        entityCode: target.entityCode,
        searchField: keys[0]!.key,
        values: [request[2]!],
        projection: "summary",
      };
    }
}
