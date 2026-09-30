import { sectionIntent } from "./entity-section-intent.js";
import type { AtlasContentBlock, AtlasProviderToolDefinition } from "@athyper/server-contract-ai";

/** Render one successful registered section read from its validated projection.
 * No second model turn, inferred findings, or arbitrary tool-result rendering. */
export function entitySectionAnswer(results: readonly AtlasContentBlock[], definitions: readonly AtlasProviderToolDefinition[], question = ""): string | undefined {
  if (results.length !== 1) return undefined;
  const block = results[0];
  if (block?.type !== "tool_result" || block.isError) return undefined;
  const binding = definitions.find(tool => tool.name === block.toolName)?.entitySection;
  if (!binding?.resultKey || !binding.label) return undefined;
  const data = block.result as Record<string, unknown> | undefined;
  if (!data || data.section !== binding.sectionKey || typeof data.hasMore !== "boolean") return undefined;
  const rawRows = data[binding.resultKey];
  if (!Array.isArray(rawRows)) return undefined;
  let rows = rawRows;
  if (data.status === "unavailable" && !rows.length && !data.hasMore) return data.unavailableReason === "denied" ? `Access to ${binding.label.toLowerCase()} is denied for this request. No absence finding was made.` : data.unavailableReason === "missing_scope" ? `Select and apply the required transaction scope on the record to read ${binding.label.toLowerCase()}. No absence finding was made.` : data.unavailableReason === "reader_unavailable" ? `The reader for ${binding.label.toLowerCase()} is unavailable. No absence finding was made.` : `${binding.label} are unavailable for this request. This does not mean no records exist.`;
  const intent = sectionIntent(question);
  if (intent.kind === "unsupported_filter") return "This section reader cannot evaluate that filter. For a name search, use ‘named’ or ‘name contains’ followed by the name. No filtered result was determined.";
  if (data.status === "empty" && !rows.length && !data.hasMore) return intent.query ? `No authorized name matches for “${intent.query.replace(/[\r\n\t]/g, " ")}” were found. The reader returned an empty authorized list.` : `No saved ${binding.label.toLowerCase()} were returned in the authorized scope.`;
  if (data.status !== "ready" || !rows.length) return undefined;
  const text = (value: string | number | boolean) => String(value).replace(/[\r\n\t]/g, " ");
  const label = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase());
  const searched = rows.length;
  let matchNote = "";
  if (intent.query) {
    if (!binding.searchFields?.length) return `Name filtering is not supported by the registered ${binding.label.toLowerCase()} reader. No match determination was made.`;
    const normalize = (value: string) => value.normalize("NFKC").toLowerCase().trim();
    const incompleteFields = rows.some(row => !row || binding.searchFields!.some(key => typeof row[key] !== "string"));
    rows = rows.filter(row => row && binding.searchFields!.some(key => typeof row[key] === "string" && normalize(row[key]).includes(normalize(intent.query!))));
    const coverage = data.hasMore || incompleteFields ? "Only a partial authorized list was searched; a non-match does not establish absence." : "The returned authorized list was fully searched.";
    matchNote = `${rows.length ? "Found" : "No"} ${rows.length ? rows.length + " " : ""}authorized name match${rows.length === 1 ? "" : "es"} for “${text(intent.query)}” among ${searched} returned records. ${coverage}`;
    if (!rows.length) return matchNote;
  } else if (intent.kind === "exists") {
    matchNote = `Yes—${searched} authorized records were returned.${data.hasMore ? " This is a partial list, not a total count." : ""}`;
  }
  const paragraphs: string[] = [`${binding.label} — ${rows.length} shown.`];
  if (matchNote) paragraphs.unshift(matchNote);
  for (const [i, row] of rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
    const lines: string[] = [];
    for (const [key, value] of Object.entries(row)) {
      if (!["string", "boolean", "number"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) return undefined;
      if (value === "") continue;
      lines.push(`- ${label(key)}: ${typeof value === "boolean" ? value ? "Yes" : "No" : text(value as string | number)}`);
    }
    paragraphs.push(`Record ${i + 1}\n\n${lines.length ? lines.join("\n") : "No displayable fields were returned."}`);
  }
  if (data.hasMore) paragraphs.push("More records are available. This is a partial summary; open the section to view the remaining records.");
  return paragraphs.join("\n\n");
}
