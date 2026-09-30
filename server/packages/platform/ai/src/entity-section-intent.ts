/** Bounded interpretation of a record section question; never authorizes data. */
export type SectionIntent = {kind: "summary" | "filter" | "exists" | "unsupported_filter"; query?: string};
export function sectionIntent(text = ""): SectionIntent {
  const exists = /\b(any|do we have|is there|are there|does .+ have)\b/i.test(text);
  const match = text.match(/\b(?:named|called|like|as(?!\s+of\b)|(?:with\s+(?:the\s+)?name|name)\s*(?:is|contains|=)?)\s+["“']?([^?\n]+?)[”"']?[?.!]*$/i);
  if (match) return {kind: exists ? "exists" : "filter", query: match[1]!.trim()};
  if (/\b(find|search|where|whose|with|from|in|as)\b/i.test(text)) return {kind: "unsupported_filter"};
  return {kind: exists ? "exists" : "summary"};
}
