/**
 * ClassificationDecision — canonical JSONB shape for
 * purchase_invoice_line.classification_decision and
 * purchase_requisition_line.classification_decision.
 *
 * Written by IntentResolutionService (mode=save).
 * Read by the Classify tab and the document submit gate.
 *
 * Version: 1  (increment only on breaking shape change)
 */

import { z } from "zod";

// ── Blocker codes (closed vocabulary — frontend i18n keys) ────────────────────
export const BLOCKER_CODES = [
  "SAVE_BLOCKED_DENY",
  "CLASSIFICATION_MISSING",
  "HS_MISSING",
  "VISIBILITY_DENIED",
  "ASSET_CATEGORY_MISSING",
  "ENTRY_MODE_INVALID",
  "PROFILE_RESOLUTION_FAILED",
] as const;
export type BlockerCode = typeof BLOCKER_CODES[number];

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const SuggestionSchema = z.object({
  field:      z.literal("commodity_category_id"),
  id:         z.string().uuid(),
  code:       z.string(),
  name:       z.string(),
  confidence: z.number().min(0).max(1),
  source:     z.enum(["item", "commodity", "trigram", "history"]),
});

const LineCommodityCodeSchema = z.object({
  domain_code: z.string(),  // unspsc | hs | naics
  code:        z.string(),
  label:       z.string(),
});

const SelectedSchema = z.object({
  commodity_category_id:   z.string().uuid().nullable(),
  business_intent_id:  z.string().uuid().nullable(),
  profile_config_id:   z.string().uuid().nullable(),
  line_commodity_code: LineCommodityCodeSchema.nullable(),
});

const ResolvedSchema = z.object({
  domain: z.enum([
    "OPEX", "CAPEX", "REVENUE", "COST_OF_SALES",
    "TRANSFER", "REGULATORY", "ADMIN", "DEFERRED_REVENUE",
  ]).nullable(),
  intent_method:          z.enum(["RULE_MATCH", "CLASSIFICATION_DEFAULT", "FAILED"]),
  intent_rule_id:         z.string().uuid().nullable(),
  profile_method:         z.enum(["OVERRIDE", "RULE_MATCH", "FAILED"]),
  profile_rule_id:        z.string().uuid().nullable(),
  confidence:             z.number().min(0).max(1),
  tax_group_resolved_via: z.enum([
    "override", "supplier_profile", "product",
    "commodity_category", "spend_category", "fallback", "none",
  ]),
  wht_group_resolved_via: z.enum(["override", "supplier_profile", "none", "n/a"]),
});

const PolicySchema = z.object({
  mapping_mode:             z.enum(["ALLOW", "DENY"]),
  visibility:               z.string(),
  classification_required:  z.boolean(),
  hs_required:              z.boolean(),
  is_regulated:             z.boolean(),
  is_cross_border:          z.boolean(),
  asset_tagging_required:   z.boolean(),
  capex_threshold:          z.number().nullable(),
  capex_threshold_breached: z.boolean(),
  source_company_code_id:   z.string().uuid().nullable(),
});

const OverrideEntrySchema = z.object({
  field:           z.string(),
  from_id:         z.string().uuid().nullable(),
  to_id:           z.string().uuid().nullable(),
  reason:          z.string().min(3).max(500),
  by_principal_id: z.string().uuid(),
  at:              z.string().datetime(),
});

const BlockerSchema = z.object({
  code:    z.enum(BLOCKER_CODES),
  field:   z.string().nullable(),
  message: z.string(),
});

// ── Root schema ───────────────────────────────────────────────────────────────

export const ClassificationDecisionSchema = z.object({
  version:  z.literal(1),
  status:   z.enum(["resolved", "needs_review", "blocked"]),
  pipeline_id: z.string().uuid(),
  mode:     z.enum(["preview", "save"]),

  flow_code:     z.string().nullable(),
  document_type: z.enum(["purchase_invoice", "purchase_requisition"]),

  suggestions: z.array(SuggestionSchema).max(5),
  selected:    SelectedSchema,
  resolved:    ResolvedSchema,
  policy:      PolicySchema,
  explanations: z.array(z.string()).max(20),
  overrides:    z.array(OverrideEntrySchema),
  blockers:     z.array(BlockerSchema),
});

export type ClassificationDecision = z.infer<typeof ClassificationDecisionSchema>;
export type OverrideEntry          = z.infer<typeof OverrideEntrySchema>;

// ── Empty decision sentinel for legacy / pre-intake rows ──────────────────────
export const EMPTY_DECISION: Record<string, unknown> = {};

export function isEmptyDecision(d: unknown): boolean {
  return d == null || (typeof d === "object" && Object.keys(d as object).length === 0);
}
