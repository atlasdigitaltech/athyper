import type { AtlasContentBlock } from "@athyper/server-contract-ai";
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const text = (value: unknown) =>
  String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/`/g, "｀")
    .replace(/\*/g, "＊");
/** Render admitted results faithfully; discovery is not record evidence. */
export function entityLookupAnswer(
  results: readonly AtlasContentBlock[],
): string | undefined {
  if (!results.length) return undefined;
  const answers: string[] = [];
  for (const block of results) {
    if (
      block.type !== "tool_result" ||
      block.isError ||
      !["entity_lookup", "entity_follow_reference"].includes(block.toolName)
    )
      return undefined;
    const data = object(block.result);
    if (
      !data ||
      !["entity_lookup", "entity_reference"].includes(String(data.kind)) ||
      !Array.isArray(data.items)
    )
      return undefined;
    if (
      data.match === "no_authorized_match" ||
      data.state === "no_visible_reference"
    ) {
      answers.push(
        "No matching authorized record or visible reference was returned. This does not establish that the record does not exist.",
      );
      continue;
    }
    const lines: string[] = [];
    if (data.match === "ambiguous")
      lines.push(
        "Several authorized records match. Which one do you mean? These are up to three candidates, not a total count.",
      );
    for (const value of data.items) {
      const item = object(value);
      if (!item || !Array.isArray(item.fields)) return undefined;
      lines.push(`${text(data.entityCode)} · ${text(item.recordId)}`);
      for (const value of item.fields) {
        const field = object(value);
        if (
          !field ||
          typeof field.label !== "string" ||
          (!["string", "number", "boolean"].includes(typeof field.value) &&
            field.value !== null)
        )
          return undefined;
        lines.push(
          `- ${text(field.label)}: ${field.value === null ? "Not recorded" : text(field.value)}`,
        );
      }
    }
    if (!lines.length) return undefined;
    answers.push(lines.join("\n"));
  }
  return answers.join("\n\n");
}
