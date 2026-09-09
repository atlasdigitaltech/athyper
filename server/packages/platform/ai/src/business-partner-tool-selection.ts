import { selectEntitySectionTools } from "./entity-section-tool-selection.js";
import type { AtlasProviderToolDefinition, AtlasBusinessContextV1 } from "@athyper/server-contract-ai";
const codes = new Set(["bp_read_summary", "bp_submit_case", "bp_explain_case_validation", "bp_explain_case_diff", "bp_read_brief", "bp_explain_readiness", "bp_check_eligibility", "bp_read_list_insights"]);
/** Budget routing only, never authorization. Unmatched intent retains basic read;
 * explicit registered tool names support diagnostics and existing qualification. */
export function selectLocalBusinessPartnerTools(tools: readonly AtlasProviderToolDefinition[], text: string, page?: AtlasBusinessContextV1): readonly AtlasProviderToolDefinition[] {
  if (page?.kind === "manage" && tools.some(t => t.name === "bp_read_list_insights") && !/\bsubmit\b/i.test(text)) return tools.filter(t => t.name === "bp_read_list_insights");
  const sections = selectEntitySectionTools(tools, text);
  if (sections) return sections;
  tools = tools.filter(tool => !tool.entitySection);
  if (!tools.some(t => t.name === "bp_read_brief")) return tools;
  const explicit = tools.find(t => codes.has(t.name) && text.includes(t.name));
  const selected = explicit?.name ?? (/\bsubmit\b/i.test(text) ? "bp_submit_case" : /\b(diff|changed|changes)\b/i.test(text) && /\b(case|draft)\b/i.test(text) ? "bp_explain_case_diff" : /\b(case|draft)\b/i.test(text) && /\b(validation|validate|blocked|blockers|ready|missing)\b/i.test(text) ? "bp_explain_case_validation" : /\b(eligible|eligibility|purchase|purchasing|order|invoice|payment|pay|buy)\b/i.test(text) ? "bp_check_eligibility" : /\b(ready|readiness|missing|complete|completeness|requirements|blockers)\b/i.test(text) ? "bp_explain_readiness" : /\b(brief|know|attention)\b/i.test(text) ? "bp_read_brief" : "bp_read_summary");
  return tools.filter(t => !codes.has(t.name) || t.name === selected || (selected === "bp_submit_case" && t.name === "bp_explain_case_validation"));
}
