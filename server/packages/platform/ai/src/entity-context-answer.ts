import type {
  AtlasContentBlock,
  AtlasProviderToolDefinition,
} from "@athyper/server-contract-ai";
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const text = (value: unknown) =>
  String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/`/g, "｀")
    .replace(/\*/g, "＊");
/** Faithful rendering after an admitted model tool call; never reads or authorizes data.
 * Full typed declarations/diffs need not fit into a second local-model context. */
export function entityContextAnswer(
  results: readonly AtlasContentBlock[],
  definitions: readonly AtlasProviderToolDefinition[],
): string | undefined {
  if (results.length > 1) {
    const answers = results.map((result) =>
      entityContextAnswer([result], definitions),
    );
    return answers.every((answer): answer is string => answer !== undefined)
      ? answers.join("\n\n")
      : undefined;
  }
  if (results.length !== 1) return undefined;
  const block = results[0];
  if (
    block?.type !== "tool_result" ||
    block.isError ||
    !definitions.some(
      (d) =>
        d.name === block.toolName &&
        d.entitySection?.sectionKey === block.toolName,
    )
  )
    return undefined;
  const data = object(block.result);
  if (!data) return undefined;
  if (block.toolName === "entity_read_snapshots") {
    if (
      data.coverage !== "authorized_snapshots_in_default_date_range" ||
      !Array.isArray(data.items) ||
      typeof data.hasMore !== "boolean"
    )
      return undefined;
    const lines: string[] = [];
    for (const raw of data.items) {
      const row = object(raw);
      if (
        !row ||
        typeof row.id !== "string" ||
        typeof row.capturedAt !== "string" ||
        typeof row.coverage !== "string"
      )
        return undefined;
      lines.push(
        `- Snapshot ${text(row.id)}; captured ${text(row.capturedAt)}; coverage ${text(row.coverage)}.`,
      );
    }
    return [
      `Saved snapshots — ${lines.length} returned in the owner's default date range.`,
      lines.length
        ? lines.join("\n")
        : "No authorized snapshots were returned in that date range.",
      data.hasMore
        ? "More authorized snapshots are available in this range; this is a partial page."
        : "This page exhausts the current date range, not all record history.",
      "Captured fields remain subject to current authorization. Missing captures and omitted fields are not evidence of no history. Use two explicit snapshot IDs for comparison with each other, not the live record.",
    ].join("\n\n");
  }
  if (block.toolName === "entity_read_comments") {
    if (
      !["authorized_root_comments", "authorized_thread_replies"].includes(
        String(data.coverage),
      ) ||
      !Array.isArray(data.items) ||
      typeof data.hasMore !== "boolean"
    )
      return undefined;
    const lines: string[] = [];
    for (const raw of data.items) {
      const row = object(raw);
      if (
        !row ||
        typeof row.id !== "string" ||
        (row.tombstone !== true && typeof row.text !== "string")
      )
        return undefined;
      const author =
        typeof row.authorDisplayName === "string"
          ? row.authorDisplayName
          : typeof row.authorId === "string"
            ? row.authorId
            : "not returned";
      lines.push(
        `- Comment ${text(row.id)}; author ${text(author)}${typeof row.createdAt === "string" ? `; saved ${text(row.createdAt)}` : ""}: ${row.tombstone === true ? "Deleted comment (text withheld)" : text(row.text)}${typeof row.replyCount === "number" ? `; replies ${row.replyCount}` : ""}.`,
      );
    }
    const scope =
      data.coverage === "authorized_thread_replies"
        ? "replies in the selected thread"
        : "root comments";
    return [
      `Saved comments — ${lines.length} authorized ${scope} returned.`,
      lines.length
        ? lines.join("\n")
        : `No visible saved ${scope} were returned on this page.`,
      data.hasMore
        ? "More comments are available; this is a partial page."
        : "No further page was returned within this scope.",
      "Only saved comments visible to the current user are included. Read reply threads separately. This result does not establish that a particular author has no comments outside the returned scope; author identifiers are not resolved to names unless the owner supplies a display name.",
    ].join("\n\n");
  }
  if (!Array.isArray(data.fields)) return undefined;
  if (block.toolName === "entity_explain_fields") {
    if (
      data.coverage !== "authorized_summary_fields" ||
      typeof data.readOnlyEntity !== "boolean"
    )
      return undefined;
    const lines: string[] = [];
    for (const raw of data.fields) {
      const field = object(raw);
      if (
        !field ||
        typeof field.key !== "string" ||
        typeof field.label !== "string" ||
        typeof field.type !== "string" ||
        typeof field.required !== "boolean"
      )
        return undefined;
      lines.push(
        `- ${text(field.label)} (${text(field.key)}): type ${text(field.type)}; required ${field.required ? "Yes" : "No"}.`,
      );
    }
    return [
      `Published field declarations — ${lines.length} authorized summary fields.`,
      data.readOnlyEntity
        ? "This entity is read-only."
        : "These declarations do not grant write access.",
      lines.join("\n"),
      "Coverage: only fields returned by the current authorized summary read. These are type and required declarations, not input validation results. Undisclosed fields and rules are not assessed. Stored address and postal patterns are reference data, not executable validation rules.",
    ].join("\n\n");
  }
  if (
    block.toolName !== "entity_compare_snapshots" ||
    data.coverage !== "currently_authorized_captured_root_fields" ||
    typeof data.from !== "string" ||
    typeof data.to !== "string"
  )
    return undefined;
  const value = (raw: unknown): string | undefined => {
    const v = object(raw);
    if (v?.state === "uncaptured") return "Unknown (not captured)";
    if (v?.state !== "value") return undefined;
    if (v.value === null) return "null";
    if (!["string", "boolean", "number"].includes(typeof v.value))
      return undefined;
    return text(v.value);
  };
  const lines: string[] = [];
  let changed = 0,
    unknown = 0;
  for (const raw of data.fields) {
    const f = object(raw);
    if (
      !f ||
      typeof f.key !== "string" ||
      typeof f.label !== "string" ||
      typeof f.changed !== "boolean"
    )
      return undefined;
    const before = value(f.before),
      after = value(f.after);
    if (before === undefined || after === undefined) return undefined;
    const uncaptured =
      object(f.before)?.state === "uncaptured" ||
      object(f.after)?.state === "uncaptured";
    if (uncaptured) unknown++;
    else if (f.changed) changed++;
    lines.push(
      `- ${text(f.label)}: ${before} → ${after} (${uncaptured ? "Unknown" : f.changed ? "Changed" : "Unchanged"}).`,
    );
  }
  return [
    `Snapshot comparison: ${text(data.from)} → ${text(data.to)}.`,
    `${lines.length} currently authorized root fields: ${changed} changed, ${unknown} with unknown capture coverage.`,
    lines.join("\n"),
    "Uncaptured values are unknown. Omitted fields and related collections are not evidence of no change. This compares the two saved snapshots, not the live record or unsaved edits.",
  ].join("\n\n");
}
