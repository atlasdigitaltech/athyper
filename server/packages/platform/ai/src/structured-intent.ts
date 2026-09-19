import {
  parseAtlasIntent,
  type AtlasIntentV1,
  type AtlasBusinessContextV1,
  type AtlasProviderToolDefinition,
} from "@athyper/server-contract-ai";
import {
  directEntitySectionRead,
  selectEntitySectionTools,
} from "./entity-section-tool-selection.js";
export function resolveAtlasIntent(
  tools: readonly AtlasProviderToolDefinition[],
  text: string,
  page?: AtlasBusinessContextV1,
): AtlasIntentV1 {
  text = text.normalize("NFKC");
  const direct = directEntitySectionRead(tools, text, page);
  if (direct)
    return parseAtlasIntent({
      schemaVersion: 1,
      kind: "read",
      strategy: "exact_terms",
      reason: "matched",
      capabilityIds: [direct.name],
    });
  // Ambiguity is relevant only when each candidate could independently satisfy a direct read.
  const matches = selectEntitySectionTools(tools, text, page) ?? [];
  if (
    matches.length > 1 &&
    matches.every((tool) => directEntitySectionRead([tool], text, page))
  )
    return parseAtlasIntent({
      schemaVersion: 1,
      kind: "clarify",
      strategy: "exact_terms",
      reason: "ambiguous",
      capabilityIds: matches.map((tool) => tool.name).slice(0, 16),
    });
  // Only an admitted owner capability can establish an assessment intent. Missing
  // transaction coordinates are control flow, not a question for model inference.
  if (
    page?.kind === "record" &&
    page.entityCode === "business_partner" &&
    !page.asOf
  ) {
    const assessment =
      /\b(eligible|eligibility|purchase|purchasing|order|invoice|payment|pay|buy)\b/i.test(
        text,
      )
        ? "bp_check_eligibility"
        : /\b(ready|readiness|missing|complete|completeness|requirements|blockers)\b/i.test(
              text,
            ) && !/\b(case|draft)\b/i.test(text)
          ? "bp_explain_readiness"
          : /\b(brief|know|attention)\b/i.test(text)
            ? "bp_read_brief"
            : undefined;
    if (
      assessment &&
      tools.some((t) => t.name === assessment) &&
      (!["supplier", "customer"].includes(page.roleLens ?? "") ||
        !page.workContext?.operatingOrganizationId ||
        !page.workContext?.companyCodeId)
    )
      return parseAtlasIntent({
        schemaVersion: 1,
        kind: "clarify",
        strategy: "owner_scope",
        reason: "missing_scope",
        capabilityIds: [],
      });
  }
  return parseAtlasIntent({
    schemaVersion: 1,
    kind: "delegate",
    strategy: "model",
    reason: "unsupported",
    capabilityIds: [],
  });
}
