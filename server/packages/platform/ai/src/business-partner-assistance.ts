import type { AtlasBusinessContextV1, AtlasProviderToolDefinition } from "@athyper/server-contract-ai";

/** Server-owned guidance derived only from admitted tools and verified page scope.
 * It describes capability availability, never the reason a permission was denied. */
export function businessPartnerAssistanceInstruction(
  tools: readonly AtlasProviderToolDefinition[],
  page?: AtlasBusinessContextV1,
): string {
  if (page?.entityCode !== "business_partner" && !tools.some(t => t.name.startsWith("bp_"))) return "";
  const instructions = [
    "Invoke matching read tools without asking permission. Never offer hypothetical tools. Mutations still require confirmation.",
  ];
  if (page?.kind === "record" && page.asOf) {
    instructions.push("This historical view cannot use current-data tools. Ask the user to return to the current record for a current assessment.");
  } else {
    const names = new Set(tools.map(t => t.name));
    if (page?.kind === "manage" && names.has("bp_read_list_insights")) instructions.push("Use bp_read_list_insights for filtered-list insights and selected partner comparisons. The server binds the current filters and IDs. Default to the page analysisTarget; explicit all filtered requests use target filtered_set. Counts are owner results: never sum overlapping issue counts. Partial coverage requires narrowing filters/selection, and zero disclosed issues never proves readiness. Assessments use the directory supplier/customer role and explicit work organization/company.");
    const absent = ["contacts", "addresses"].filter(section => !names.has(`bp_read_${section}`));
    if (absent.length) instructions.push(`No ${absent.join("/")} read tool supplied; report retrieval unavailable if asked. Identity is not section evidence.`);
    const insights = ["bp_read_brief", "bp_explain_readiness", "bp_check_eligibility"];
    if (!insights.some(name => names.has(name))) {
      instructions.push("No assessment tool is supplied: say the assessment is unavailable here if requested. Summary is not readiness. Do not guess why.");
    } else {
      if (page?.kind === "record") {
        const missing = [
          ...(!page.roleLens || page.roleLens === "all" ? ["supplier/customer role"] : []),
          ...(!page.workContext?.operatingOrganizationId ? ["operating organization"] : []),
          ...(!page.workContext?.companyCodeId ? ["company"] : []),
        ];
        if (missing.length) instructions.push(`Assessment scope missing: ${missing.join(", ")}. Ask the user to select these in the record controls and apply the context. Do not infer them from names or shell context.`);
      }
      instructions.push("Owner states: scope_required = select missing inputs; definition_unavailable = requirements unavailable; provider_unavailable = assessment service unavailable. Partial/not_evaluated is not ready.");
    }
    if (names.has("bp_check_eligibility")) instructions.push("Check transaction eligibility when scope/date are known; product availability is not established by this tool. Ask only for missing inputs.");
  }
  return `\n${instructions.join(" ")}\n`;
}

/** Missing scope is a control-flow result, not a fact requiring model prose. */
export function businessPartnerMissingScopeMessage(results: readonly import("@athyper/server-contract-ai").AtlasContentBlock[]): string | undefined {
  if (results.length !== 1) return undefined;
  const result = results[0];
  if (result?.type !== "tool_result" || result.isError || !["bp_read_brief", "bp_explain_readiness", "bp_check_eligibility"].includes(result.toolName)) return undefined;
  const data = result.result as {records?: Readonly<Record<string, unknown>>[]; insight?: {findings?: {code: string; state: string; facts: Record<string, unknown>}[]}} | undefined;
  const findings = data?.insight?.findings;
  const finding = findings?.[0];
  if (!Array.isArray(findings) || findings.length !== 1 || !finding || !["scope_required", "scoped_assessment_unavailable"].includes(finding.code) || finding.state !== "not_evaluated") return undefined;
  const record = data?.records?.[0];
  const identity = record ? [["Partner", record.display_name], ["Code", record.code], ["Lifecycle status", record.status], ["Category", record.partner_category]].filter(([,value]) => typeof value === "string").map(([label,value]) => `${label}: ${String(value)}.`).join(" ") : "";
  if (finding.code === "scoped_assessment_unavailable") return `${identity} Organization/company assessment is unavailable for the selected context. Readiness and eligibility have not been evaluated.`.trim();
  const facts = finding.facts;
  const labels = {missingRole: "supplier or customer role", missingOperatingOrganization: "operating organization", missingCompany: "company", missingOperation: "transaction type (order, invoice or payment)", missingBusinessDate: "business date"};
  const missing = Object.entries(labels).filter(([key]) => facts[key] === true).map(([, label]) => label);
  if (!missing.length) return undefined;
  // The validated assessment card presents the missing inputs once. Keep the
  // shared brief complete without making transaction scope a prerequisite.
  return `${identity || "No shared partner details were returned."}\n\nReadiness and eligibility have not been evaluated.`;
}
