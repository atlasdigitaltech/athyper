/**
 * IntentResolutionService — orchestrates the 5-step procurement intake pipeline:
 *
 *   Step 1  Load invoice + line context (single JOIN query)
 *   Step 2  Resolve spend-category policy   → control.resolve_spend_category_policy()
 *   Step 3  Resolve classification → intent → control.resolve_classification_to_intent()
 *   Step 4  Resolve intent → profile        → control.resolve_intent_to_profile()
 *   Step 5  Assemble ClassificationDecision, compute status, optionally persist
 *
 * In "preview" mode nothing is written to the DB (no logs, no column update).
 * In "save" mode the pipeline writes 3 log rows and updates
 * purchase_invoice_line.classification_decision.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { randomUUID } from "node:crypto";
import type { ClassificationDecision } from "./ClassificationDecision.zod.js";
import { computeDecisionStatus, type DerivedFields } from "./DecisionStatusService.js";
import { writeContextLog, writeIntentLog, writeProfileLog } from "./ResolutionLogWriter.js";
import { suggestSpendCategories } from "./SpendCategorySuggestService.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

interface Logger {
  info?(msg: string, ctx?: Record<string, unknown>): void;
  error?(msg: string, ctx?: Record<string, unknown>): void;
}

export interface ResolveDeps {
  db:      AnyDb;
  logger?: Logger;
}

export interface ResolveLineArgs {
  tenantId:    string;
  principalId: string;
  invoiceId:   string;
  lineId:      string;
  mode:        "preview" | "save";
}

// ── Result shapes returned by the PG functions (parsed from JSONB) ────────────

interface PolicyResult {
  resolved_mapping_mode:     "ALLOW" | "DENY";
  default_intent_id:         string | null;
  classification_required:   boolean;
  hs_required:               boolean;
  is_regulated:              boolean;
  visibility:                string | null;
  capex_screening_threshold: number | null;
  asset_class_id:            string | null;
}

interface IntentResult {
  matched:         boolean;
  intent_id:       string | null;
  domain:          string | null;
  method:          "RULE_MATCH" | "CLASSIFICATION_DEFAULT" | "FAILED";
  rule_id:         string | null;
  confidence:      number;
  explanation:     string | null;
  rules_evaluated: number;
}

interface ProfileResult {
  matched:           boolean;
  profile_config_id: string | null;
  method:            "OVERRIDE" | "RULE_MATCH" | "FAILED";
  rule_id:           string | null;
  confidence:        number;
  explanation:       string | null;
}

// ── Empty fallbacks used when a PG call fails or returns nothing ──────────────

const POLICY_ALLOW: PolicyResult = {
  resolved_mapping_mode: "ALLOW", default_intent_id: null,
  classification_required: false, hs_required: false,
  is_regulated: false, visibility: "PUBLIC",
  capex_screening_threshold: null, asset_class_id: null,
};

const INTENT_FAILED: IntentResult = {
  matched: false, intent_id: null, domain: null,
  method: "FAILED", rule_id: null, confidence: 0,
  explanation: null, rules_evaluated: 0,
};

const PROFILE_FAILED: ProfileResult = {
  matched: false, profile_config_id: null,
  method: "FAILED", rule_id: null, confidence: 0, explanation: null,
};

function metadataText(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

function lineCommodityCodeFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ClassificationDecision["selected"]["line_commodity_code"] {
  const hsCode = metadataText(metadata, "hs_code");
  if (hsCode) return { domain_code: "hs", code: hsCode, label: hsCode };

  const unspscCode = metadataText(metadata, "unspsc_code");
  if (unspscCode) return { domain_code: "unspsc", code: unspscCode, label: unspscCode };

  return null;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function resolveLineClassification(
  deps: ResolveDeps,
  args: ResolveLineArgs,
): Promise<ClassificationDecision> {
  const { db, logger } = deps;
  const { tenantId, principalId, invoiceId, lineId, mode } = args;
  const pipelineId = randomUUID();

  // ── Step 1: load invoice + line context ───────────────────────────────────

  const { rows: ctxRows } = await sql<{
    item_description:         string;
    quantity:                 string;
    unit_price:               string;
    price_unit:               string;
    discount_pct:             string | null;
    currency_code:            string;
    spend_category_id:        string | null;
    business_intent_id:       string | null;
    is_asset:                 boolean;
    asset_category_id:        string | null;
    company_code_id:          string;
    invoice_source:           string | null;
    invoice_type:             string | null;
    supplier_country:         string | null;
    company_country:          string | null;
    tax_group_id:             string | null;
    withholding_tax_group_id: string | null;
    cost_center_id:           string | null;
    profit_center_id:         string | null;
    line_metadata:            Record<string, unknown> | null;
  }>`
    SELECT
      pil.item_description,
      pil.quantity::text,
      pil.unit_price::text,
      COALESCE(pil.price_unit, 1)::text AS price_unit,
      pil.discount_pct::text,
      pi.currency_code,
      pil.spend_category_id,
      pil.business_intent_id,
      pil.is_asset,
      pil.asset_category_id,
      pi.company_code_id,
      pi.invoice_source,
      pi.invoice_type,
      bp.registration_country_code   AS supplier_country,
      le.country_code                AS company_country,
      pil.tax_group_id,
      pil.withholding_tax_group_id,
      pil.cost_center_id,
      pil.profit_center_id,
      pil.metadata AS line_metadata
    FROM  document.purchase_invoice_line pil
    JOIN  document.purchase_invoice      pi
          ON  pi.id = pil.purchase_invoice_id AND pi.tenant_id = pil.tenant_id
    LEFT JOIN master.supplier         sup ON sup.id = pi.supplier_id AND sup.tenant_id = pi.tenant_id
    LEFT JOIN master.business_partner bp  ON bp.id = sup.business_partner_id AND bp.tenant_id = sup.tenant_id
    LEFT JOIN master.company_code     cc  ON cc.id  = pi.company_code_id
    LEFT JOIN master.legal_entity     le  ON le.id  = cc.legal_entity_id
    WHERE pil.id        = ${lineId}
      AND pil.tenant_id = ${tenantId}
      AND pi.id         = ${invoiceId}
    LIMIT 1
  `.execute(db);

  const ctx = ctxRows[0];
  if (!ctx) throw new Error(`Line ${lineId} not found on invoice ${invoiceId}`);

  const qty       = parseFloat(ctx.quantity);
  const price     = parseFloat(ctx.unit_price);
  const priceUnit = parseFloat(ctx.price_unit);
  const discPct   = ctx.discount_pct ? parseFloat(ctx.discount_pct) : 0;
  const amount    = (qty * price / priceUnit) * (1 - discPct / 100);

  const isCrossBorder  = !!(ctx.supplier_country && ctx.company_country &&
                            ctx.supplier_country !== ctx.company_country);
  const isIntercompany = false; // Phase 3: check sister-company supplier
  const lineCommodityCode = lineCommodityCodeFromMetadata(ctx.line_metadata);

  // Derive routing discriminants from invoice fields (used in Steps 3 & 4)
  const flowCode = ctx.invoice_source ? ctx.invoice_source.toUpperCase() : null;
  const docType  = ctx.invoice_type   ? ctx.invoice_type.toUpperCase()   : "STANDARD";

  // ── Step 2: spend-category policy ────────────────────────────────────────

  let policy: PolicyResult = POLICY_ALLOW;
  if (ctx.spend_category_id) {
    try {
      const { rows } = await sql<{ result: PolicyResult }>`
        SELECT control.resolve_spend_category_policy(
          ${tenantId}::uuid,
          ${ctx.spend_category_id}::uuid,
          ${ctx.company_code_id}::uuid
        ) AS result
      `.execute(db);
      if (rows[0]?.result) policy = rows[0].result;
    } catch (e) {
      logger?.error?.("policy_resolve_error", { err: String(e) });
    }
  }

  const capexThreshold = policy.capex_screening_threshold ?? null;
  const capexBreached  = capexThreshold !== null && amount > capexThreshold;

  // ── Step 3: classification → intent ──────────────────────────────────────

  let intent: IntentResult = INTENT_FAILED;
  if (ctx.spend_category_id) {
    try {
      const { rows } = await sql<{ result: IntentResult }>`
        SELECT control.resolve_classification_to_intent(
          ${tenantId}::uuid,
          'SPEND_CATEGORY',
          ${ctx.spend_category_id}::uuid,
          'INBOUND',
          ${flowCode},
          ${amount}::numeric,
          ${ctx.currency_code},
          false,
          ${isCrossBorder},
          ${isIntercompany},
          ${ctx.company_code_id}::uuid,
          'purchase_invoice'
        ) AS result
      `.execute(db);
      if (rows[0]?.result) intent = rows[0].result;
    } catch (e) {
      logger?.error?.("intent_resolve_error", { err: String(e) });
    }

    // Upgrade FAILED to CLASSIFICATION_DEFAULT when the category has a default intent
    if (!intent.matched && policy.default_intent_id) {
      intent = {
        matched:         true,
        intent_id:       policy.default_intent_id,
        domain:          null,
        method:          "CLASSIFICATION_DEFAULT",
        rule_id:         null,
        confidence:      0.60,
        explanation:     "Resolved from spend category default intent",
        rules_evaluated: intent.rules_evaluated,
      };
    }
  }

  // If user already had business_intent_id set and it differs from what the
  // pipeline resolved, we keep the user's choice but note it was an override.
  const resolvedIntentId = ctx.business_intent_id ?? intent.intent_id;
  const intentMethod: ClassificationDecision["resolved"]["intent_method"] =
    (ctx.business_intent_id && ctx.business_intent_id !== intent.intent_id)
      ? "CLASSIFICATION_DEFAULT"
      : (intent.method === "FAILED" ? "FAILED" : intent.method);

  // ── Step 4: intent → accounting profile ──────────────────────────────────

  let profile: ProfileResult = PROFILE_FAILED;
  if (resolvedIntentId) {
    try {
      const { rows } = await sql<{ result: ProfileResult }>`
        SELECT control.resolve_intent_to_profile(
          ${tenantId}::uuid,
          ${resolvedIntentId}::uuid,
          ${intent.domain},
          'INBOUND',
          ${flowCode},
          ${ctx.company_code_id}::uuid,
          ${docType},
          ${ctx.currency_code},
          ${amount}::numeric,
          ${isCrossBorder},
          ${isIntercompany}
        ) AS result
      `.execute(db);
      if (rows[0]?.result) profile = rows[0].result;
    } catch (e) {
      logger?.error?.("profile_resolve_error", { err: String(e) });
    }
  }

  // ── Step 5: assemble decision ─────────────────────────────────────────────

  const suggestions = await suggestSpendCategories(db, tenantId, ctx.item_description, 5)
    .catch(() => []);

  const overallConfidence = resolvedIntentId
    ? Math.min(
        intent.matched ? intent.confidence : 0,
        profile.matched ? profile.confidence : 0.60,
      )
    : 0;

  const blockers: ClassificationDecision["blockers"] = [];
  if (policy.resolved_mapping_mode === "DENY") {
    blockers.push({ code: "SAVE_BLOCKED_DENY", field: "spend_category_id",
      message: "This spend category is denied for your company" });
  }
  if (policy.classification_required && !ctx.spend_category_id) {
    blockers.push({ code: "CLASSIFICATION_MISSING", field: "spend_category_id",
      message: "Spend category classification is required" });
  }
  if (policy.hs_required && !lineCommodityCode) {
    blockers.push({ code: "HS_MISSING", field: "line_commodity_code",
      message: "HS / commodity code is required for this category" });
  }
  if (ctx.is_asset && !ctx.asset_category_id) {
    blockers.push({ code: "ASSET_CATEGORY_MISSING", field: "asset_category_id",
      message: "Asset category is required when the line is marked as an asset" });
  }

  const domain = (intent.domain ?? null) as ClassificationDecision["resolved"]["domain"];

  const decision: ClassificationDecision = {
    version:       1,
    status:        "resolved", // recomputed below via computeDecisionStatus
    pipeline_id:   pipelineId,
    mode,
    flow_code:     flowCode,
    document_type: "purchase_invoice",

    suggestions: suggestions.slice(0, 5),

    selected: {
      spend_category_id:   ctx.spend_category_id,
      business_intent_id:  resolvedIntentId,
      profile_config_id:   profile.profile_config_id,
      line_commodity_code: lineCommodityCode,
    },

    resolved: {
      domain,
      intent_method:   intentMethod,
      intent_rule_id:  intent.rule_id,
      profile_method:  profile.method,
      profile_rule_id: profile.rule_id,
      confidence:      overallConfidence,
      tax_group_resolved_via:  ctx.tax_group_id ? "supplier_profile" : "none",
      wht_group_resolved_via:  ctx.withholding_tax_group_id
        ? "supplier_profile"
        : (isCrossBorder ? "none" : "n/a"),
    },

    policy: {
      mapping_mode:             policy.resolved_mapping_mode,
      visibility:               policy.visibility ?? "PUBLIC",
      classification_required:  policy.classification_required,
      hs_required:              policy.hs_required,
      is_regulated:             policy.is_regulated,
      is_cross_border:          isCrossBorder,
      asset_tagging_required:   policy.asset_class_id != null,
      capex_threshold:          capexThreshold,
      capex_threshold_breached: capexBreached,
      source_company_code_id:   ctx.company_code_id,
    },

    explanations: [intent.explanation, profile.explanation].filter(Boolean) as string[],
    overrides:    [],
    blockers,
  };

  const derived: DerivedFields = {
    taxGroupId:      ctx.tax_group_id,
    whtGroupId:      ctx.withholding_tax_group_id,
    costCenterId:    ctx.cost_center_id,
    profitCenterId:  ctx.profit_center_id,
    isAsset:         ctx.is_asset,
    assetCategoryId: ctx.asset_category_id,
    isCrossBorder,
    isIntercompany,
  };
  decision.status = computeDecisionStatus(decision, derived);

  // ── Persist (save mode only) ──────────────────────────────────────────────

  if (mode === "save") {
    // Fire-and-forget — log failures must not block the user's save
    Promise.all([
      writeContextLog(db, {
        pipelineId, txnId: lineId, tenantId, principalId,
        direction: "INBOUND", flowCode: flowCode,
        companyCodeId: ctx.company_code_id, docType: docType,
        amount, currencyCode: ctx.currency_code, isCrossBorder, isIntercompany,
      }),
      writeIntentLog(db, {
        pipelineId, txnId: lineId, tenantId, principalId,
        classificationSource: "SPEND_CATEGORY",
        classificationId:     ctx.spend_category_id,
        resolvedIntentId,
        resolvedDomain:       intent.domain,
        method:               intentMethod,
        ruleId:               intent.rule_id,
        confidence:           intent.confidence,
        explanation:          intent.explanation,
        rulesEvaluated:       intent.rules_evaluated,
      }),
      writeProfileLog(db, {
        pipelineId, txnId: lineId, tenantId, principalId,
        resolvedProfileConfigId: profile.profile_config_id,
        method:                  profile.method,
        ruleId:                  profile.rule_id,
        confidence:              profile.confidence,
        explanation:             profile.explanation,
      }),
    ]).catch((e) => logger?.error?.("resolution_log_error", { err: String(e) }));

    // Persist the decision JSONB and promote resolved business_intent_id
    await sql`
      UPDATE document.purchase_invoice_line
         SET classification_decision = ${JSON.stringify(decision)}::jsonb,
             business_intent_id      = COALESCE(${resolvedIntentId}::uuid,
                                                business_intent_id),
             updated_at              = now()
       WHERE id        = ${lineId}
         AND tenant_id = ${tenantId}
    `.execute(db);

    logger?.info?.("line_classified", {
      tenantId, lineId, status: decision.status, pipelineId,
    });
  }

  return decision;
}
