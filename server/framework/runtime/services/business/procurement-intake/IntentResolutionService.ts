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
import { pickAutoSpendCategory, suggestSpendCategories } from "./SpendCategorySuggestService.js";

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

export interface DraftLineClassificationArgs {
  tenantId:    string;
  principalId: string;
  record:      Record<string, unknown>;
  line:        Record<string, unknown>;
  mode?:       "preview" | "save";
}

interface LineClassificationContext {
  item_description:         string;
  item_id:                  string | null;
  quantity:                 string;
  unit_price:               string;
  price_unit:               string;
  discount_pct:             string | null;
  currency_code:            string;
  commodity_category_id:        string | null;
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
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINE_METADATA_ALIAS_FIELDS = [
  "item_code",
  "tax_code",
  "unspsc_code",
  "hs_code",
  "trade_code",
  "commodity_code",
  "commodity_domain",
  "commodity_domain_code",
  "line_commodity_code",
];

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
  const explicit = metadata?.["line_commodity_code"];
  if (explicit && typeof explicit === "object" && !Array.isArray(explicit)) {
    const record = explicit as Record<string, unknown>;
    const domain = typeof record["domain_code"] === "string" ? record["domain_code"].trim() : "";
    const code = typeof record["code"] === "string" ? record["code"].trim() : "";
    const label = typeof record["label"] === "string" && record["label"].trim() ? record["label"].trim() : code;
    if (domain && code) return { domain_code: domain, code, label };
  }

  const genericDomain = metadataText(metadata, "commodity_domain_code")
    ?? metadataText(metadata, "commodity_domain")
    ?? metadataText(metadata, "domain_code");
  const genericCode = metadataText(metadata, "commodity_code");
  if (genericDomain && genericCode) {
    return { domain_code: genericDomain, code: genericCode, label: genericCode };
  }

  const hsCode = metadataText(metadata, "hs_code") ?? metadataText(metadata, "trade_code");
  if (hsCode) return { domain_code: "hs", code: hsCode, label: hsCode };

  const unspscCode = metadataText(metadata, "unspsc_code");
  if (unspscCode) return { domain_code: "unspsc", code: unspscCode, label: unspscCode };

  return null;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

type LineCommodityCode = NonNullable<ClassificationDecision["selected"]["line_commodity_code"]>;

interface CategoryCommodityCodes {
  unspsc: LineCommodityCode | null;
  hs:     LineCommodityCode | null;
}

function lineCommodityCodeHasDomain(
  code: ClassificationDecision["selected"]["line_commodity_code"],
  domain: string,
): code is LineCommodityCode {
  return code?.domain_code.toLowerCase() === domain;
}

async function commodityCodesForSpendCategory(
  db: AnyDb,
  tenantId: string,
  spendCategoryId: string | null,
): Promise<CategoryCommodityCodes> {
  if (!spendCategoryId) return { unspsc: null, hs: null };

  const { rows } = await sql<{
    domain_code: string;
    code:        string;
    name:        string | null;
  }>`
    SELECT cl.domain_code, cc.code, cc.name
      FROM master.commodity_classification cl
      JOIN shared.commodity_code cc
        ON cc.id = cl.code_id
       AND cc.domain_code = cl.domain_code
     WHERE cl.tenant_id = ${tenantId}::uuid
       AND cl.owner_type IN ('commodity_category', 'spend_category')
       AND cl.owner_id = ${spendCategoryId}::uuid
       AND cl.classification_type = 'commodity'
       AND cl.domain_code IN ('unspsc', 'hs')
       AND cl.is_active = true
     ORDER BY (cl.owner_type = 'commodity_category') DESC, cl.is_primary DESC, cl.confidence DESC NULLS LAST, cl.created_at ASC
  `.execute(db);

  const result: CategoryCommodityCodes = { unspsc: null, hs: null };
  for (const row of rows) {
    const domain = row.domain_code.toLowerCase();
    const code = {
      domain_code: domain,
      code:        row.code,
      label:       row.name ? `${row.code} - ${row.name}` : row.code,
    };
    if (domain === "unspsc" && !result.unspsc) result.unspsc = code;
    if (domain === "hs" && !result.hs) result.hs = code;
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function presentText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function firstText(
  records: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): string | null {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const text = presentText(record[key]);
      if (text) return text;
    }
  }
  return null;
}

function firstNumber(
  records: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): number | null {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = record[key];
      if (value == null || value === "") continue;
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function booleanValue(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1";
}

function draftLineMetadata(line: Record<string, unknown>): Record<string, unknown> | null {
  const data = asRecord(line["data"]);
  const metadata = asRecord(line["metadata"]);
  const out: Record<string, unknown> = {
    ...(data ?? {}),
    ...(metadata ?? {}),
  };

  for (const key of LINE_METADATA_ALIAS_FIELDS) {
    if (line[key] !== undefined) out[key] = line[key];
  }

  return Object.keys(out).length > 0 ? out : null;
}

async function draftPartyContext(
  db: AnyDb,
  tenantId: string,
  record: Record<string, unknown>,
  companyCodeId: string,
): Promise<{
  supplierCountry: string | null;
  companyCountry: string | null;
  currencyCode: string | null;
}> {
  const explicitSupplierCountry = firstText(
    [record],
    ["supplier_country", "supplier_country_code", "supplier_registration_country_code"],
  );
  const explicitCompanyCountry = firstText(
    [record],
    ["company_country", "company_country_code", "legal_entity_country_code"],
  );
  const explicitCurrency = firstText(
    [record],
    ["currency_code", "transaction_currency", "base_currency_code", "base_currency"],
  );

  if (!UUID_RE.test(companyCodeId)) {
    throw new Error("company_code_id must be a valid UUID before classifying draft lines");
  }

  const supplierId = firstText([record], ["supplier_id", "vendor_id"]);
  const supplierUuid = supplierId && UUID_RE.test(supplierId) ? supplierId : null;

  const { rows } = await sql<{
    supplier_country:     string | null;
    company_country:      string | null;
    company_currency_code: string | null;
  }>`
    SELECT
      bp.registration_country_code AS supplier_country,
      le.country_code              AS company_country,
      cc.functional_currency       AS company_currency_code
    FROM master.company_code cc
    LEFT JOIN master.legal_entity le
           ON le.id = cc.legal_entity_id
          AND le.tenant_id = cc.tenant_id
    LEFT JOIN master.supplier sup
           ON sup.id = ${supplierUuid}::uuid
          AND sup.tenant_id = ${tenantId}::uuid
    LEFT JOIN master.business_partner bp
           ON bp.id = sup.business_partner_id
          AND bp.tenant_id = sup.tenant_id
    WHERE cc.id = ${companyCodeId}::uuid
      AND cc.tenant_id = ${tenantId}::uuid
    LIMIT 1
  `.execute(db);

  const row = rows[0];
  return {
    supplierCountry: explicitSupplierCountry ?? row?.supplier_country ?? null,
    companyCountry:  explicitCompanyCountry ?? row?.company_country ?? null,
    currencyCode:    explicitCurrency ?? row?.company_currency_code ?? null,
  };
}

export async function resolveDraftLineClassification(
  deps: ResolveDeps,
  args: DraftLineClassificationArgs,
): Promise<ClassificationDecision> {
  const { db } = deps;
  const { tenantId, principalId, record, line } = args;
  const data = asRecord(line["data"]);

  const companyCodeId = firstText([line, data, record], ["company_code_id"]);
  if (!companyCodeId) {
    throw new Error("company_code_id is required before classifying draft lines");
  }

  const party = await draftPartyContext(db, tenantId, record, companyCodeId);
  const explicitAmount = firstNumber(
    [line, data],
    ["gross_amount", "net_amount", "line_amount", "amount"],
  );
  const quantity = firstNumber([line, data], ["quantity", "qty"]) ?? 1;
  const unitPrice = firstNumber([line, data], ["unit_price", "price"]) ?? explicitAmount ?? 0;
  const priceUnit = firstNumber([line, data], ["price_unit"]) ?? 1;

  const ctx: LineClassificationContext = {
    item_description:         firstText([line, data], ["item_description", "description", "name"]) ?? "",
    item_id:                  firstText([line, data], ["item_id"]),
    quantity:                 String(quantity || 1),
    unit_price:               String(unitPrice),
    price_unit:               String(priceUnit || 1),
    discount_pct:             firstText([line, data], ["discount_pct"]),
    currency_code:            party.currencyCode ?? "USD",
    commodity_category_id:        firstText([line, data], ["commodity_category_id"]),
    business_intent_id:       firstText([line, data], ["business_intent_id"]),
    is_asset:                 booleanValue(line["is_asset"] ?? data?.["is_asset"]),
    asset_category_id:        firstText([line, data], ["asset_category_id"]),
    company_code_id:          companyCodeId,
    invoice_source:           firstText([record], ["invoice_source", "source", "flow_code"]),
    invoice_type:             firstText([record], ["invoice_type", "type", "document_type"]),
    supplier_country:         party.supplierCountry,
    company_country:          party.companyCountry,
    tax_group_id:             firstText([line, data], ["tax_group_id"]),
    withholding_tax_group_id: firstText([line, data], ["withholding_tax_group_id", "wht_group_id"]),
    cost_center_id:           firstText([line, data], ["cost_center_id"]),
    profit_center_id:         firstText([line, data], ["profit_center_id"]),
    line_metadata:            draftLineMetadata(line),
  };

  return resolveLineClassificationFromContext(deps, {
    tenantId,
    principalId,
    invoiceId: "__draft__",
    lineId: firstText([line], ["id", "__draft_line_id"]) ?? "__draft_line__",
    mode: "preview",
    ctx,
    persist: false,
  });
}

export async function resolveLineClassification(
  deps: ResolveDeps,
  args: ResolveLineArgs,
): Promise<ClassificationDecision> {
  const { db, logger } = deps;
  const { tenantId, principalId, invoiceId, lineId, mode } = args;

  // ── Step 1: load invoice + line context ───────────────────────────────────

  const { rows: ctxRows } = await sql<LineClassificationContext>`
    SELECT
      pil.item_description,
      pil.item_id,
      pil.quantity::text,
      pil.unit_price::text,
      COALESCE(pil.price_unit, 1)::text AS price_unit,
      pil.discount_pct::text,
      pi.currency_code,
      pil.commodity_category_id,
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

  return resolveLineClassificationFromContext(deps, {
    tenantId, principalId, invoiceId, lineId, mode, ctx, persist: true,
  });
}

async function resolveLineClassificationFromContext(
  deps: ResolveDeps,
  args: ResolveLineArgs & { ctx: LineClassificationContext; persist: boolean },
): Promise<ClassificationDecision> {
  const { db, logger } = deps;
  const { tenantId, principalId, invoiceId, lineId, mode, ctx, persist } = args;
  const pipelineId = randomUUID();

  const qty       = parseFloat(ctx.quantity);
  const price     = parseFloat(ctx.unit_price);
  const priceUnit = parseFloat(ctx.price_unit);
  const discPct   = ctx.discount_pct ? parseFloat(ctx.discount_pct) : 0;
  const amount    = (qty * price / priceUnit) * (1 - discPct / 100);

  const isCrossBorder  = !!(ctx.supplier_country && ctx.company_country &&
                            ctx.supplier_country !== ctx.company_country);
  const isIntercompany = false; // Phase 3: check sister-company supplier
  const explicitLineCommodityCode = lineCommodityCodeFromMetadata(ctx.line_metadata);

  // Derive routing discriminants from invoice fields (used in Steps 3 & 4)
  const flowCode = ctx.invoice_source ? ctx.invoice_source.toUpperCase() : "NON_PO";
  const docType  = ctx.invoice_type   ? ctx.invoice_type.toUpperCase()   : "STANDARD";

  const suggestions = await suggestSpendCategories(db, tenantId, ctx.item_description, 5, {
    itemId:        ctx.item_id,
    commodityCode: explicitLineCommodityCode,
  }).catch((e) => {
    logger?.error?.("spend_category_suggest_error", { err: String(e), lineId });
    return [];
  });
  const autoSpendCategory = pickAutoSpendCategory(suggestions, ctx.commodity_category_id);
  const selectedSpendCategoryId = ctx.commodity_category_id ?? autoSpendCategory?.id ?? null;
  const selectedSuggestion = selectedSpendCategoryId
    ? suggestions.find((suggestion) => suggestion.id === selectedSpendCategoryId) ?? null
    : null;
  const preferCategoryCommodity = Boolean(
    selectedSpendCategoryId && selectedSuggestion?.source !== "commodity",
  );
  const autoSpendCategoryExplanation = autoSpendCategory
    ? `Auto-selected spend category ${autoSpendCategory.code} (${autoSpendCategory.name}) from ${autoSpendCategory.source} suggestion at ${Math.round(autoSpendCategory.confidence * 100)}% confidence`
    : null;
  const categoryCommodityCodes = await commodityCodesForSpendCategory(
    db,
    tenantId,
    selectedSpendCategoryId,
  ).catch((e) => {
    logger?.error?.("spend_category_commodity_lookup_error", { err: String(e), lineId });
    return { unspsc: null, hs: null };
  });
  const explicitHsCode = lineCommodityCodeHasDomain(explicitLineCommodityCode, "hs")
    ? explicitLineCommodityCode
    : null;
  const explicitUnspscCode = lineCommodityCodeHasDomain(explicitLineCommodityCode, "unspsc")
    ? explicitLineCommodityCode
    : null;
  const explicitOtherCode = explicitLineCommodityCode && !explicitHsCode && !explicitUnspscCode
    ? explicitLineCommodityCode
    : null;
  const resolvedHsCode = preferCategoryCommodity
    ? categoryCommodityCodes.hs
    : (explicitHsCode ?? categoryCommodityCodes.hs);
  const resolvedUnspscCode = preferCategoryCommodity
    ? categoryCommodityCodes.unspsc
    : (explicitUnspscCode ?? categoryCommodityCodes.unspsc);
  let lineCommodityCode: ClassificationDecision["selected"]["line_commodity_code"] =
    preferCategoryCommodity
      ? (resolvedUnspscCode ?? resolvedHsCode ?? explicitOtherCode)
      : (explicitLineCommodityCode ?? resolvedUnspscCode ?? resolvedHsCode);
  const inferredMetadata: Record<string, unknown> = {};
  const currentUnspscCode = metadataText(ctx.line_metadata, "unspsc_code");
  const currentHsCode = metadataText(ctx.line_metadata, "hs_code");
  const currentTradeCode = metadataText(ctx.line_metadata, "trade_code");
  if (resolvedUnspscCode && currentUnspscCode !== resolvedUnspscCode.code) {
    inferredMetadata["unspsc_code"] = resolvedUnspscCode.code;
  } else if (preferCategoryCommodity && currentUnspscCode && !resolvedUnspscCode) {
    inferredMetadata["unspsc_code"] = null;
  }
  if (resolvedHsCode && currentHsCode !== resolvedHsCode.code) {
    inferredMetadata["hs_code"] = resolvedHsCode.code;
    if (currentTradeCode && currentTradeCode !== resolvedHsCode.code) inferredMetadata["trade_code"] = null;
  } else if (preferCategoryCommodity && (currentHsCode || currentTradeCode) && !resolvedHsCode) {
    inferredMetadata["hs_code"] = null;
    inferredMetadata["trade_code"] = null;
  }

  // ── Step 2: spend-category policy ────────────────────────────────────────

  let policy: PolicyResult = POLICY_ALLOW;
  if (selectedSpendCategoryId) {
    try {
      const { rows } = await sql<{ result: PolicyResult }>`
        SELECT control.resolve_spend_category_policy(
          ${tenantId}::uuid,
          ${selectedSpendCategoryId}::uuid,
          ${ctx.company_code_id}::uuid
        ) AS result
      `.execute(db);
      if (rows[0]?.result) policy = rows[0].result;
    } catch (e) {
      logger?.error?.("policy_resolve_error", { err: String(e) });
    }
  }
  lineCommodityCode = policy.hs_required
    ? (resolvedHsCode ?? null)
    : (preferCategoryCommodity
      ? (resolvedUnspscCode ?? resolvedHsCode ?? explicitOtherCode)
      : (explicitLineCommodityCode ?? resolvedUnspscCode ?? resolvedHsCode));
  if ((preferCategoryCommodity || !explicitLineCommodityCode) && lineCommodityCode) {
    inferredMetadata["line_commodity_code"] = lineCommodityCode;
  } else if (preferCategoryCommodity && !lineCommodityCode && ctx.line_metadata?.["line_commodity_code"]) {
    inferredMetadata["line_commodity_code"] = null;
  }

  const capexThreshold = policy.capex_screening_threshold ?? null;
  const capexBreached  = capexThreshold !== null && amount > capexThreshold;

  // ── Step 3: classification → intent ──────────────────────────────────────

  let intent: IntentResult = INTENT_FAILED;
  if (selectedSpendCategoryId) {
    try {
      const { rows } = await sql<{ result: IntentResult }>`
        SELECT control.resolve_classification_to_intent(
          ${tenantId}::uuid,
          'COMMODITY_CATEGORY',
          ${selectedSpendCategoryId}::uuid,
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

  const overallConfidence = resolvedIntentId
    ? Math.min(
        autoSpendCategory ? autoSpendCategory.confidence : 1,
        intent.matched ? intent.confidence : 0,
        profile.matched ? profile.confidence : 0.60,
      )
    : 0;

  const blockers: ClassificationDecision["blockers"] = [];
  if (policy.resolved_mapping_mode === "DENY") {
    blockers.push({ code: "SAVE_BLOCKED_DENY", field: "commodity_category_id",
      message: "This spend category is denied for your company" });
  }
  if (policy.classification_required && !selectedSpendCategoryId) {
    blockers.push({ code: "CLASSIFICATION_MISSING", field: "commodity_category_id",
      message: "Spend category classification is required" });
  }
  if (policy.hs_required && !resolvedHsCode) {
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
      commodity_category_id:   selectedSpendCategoryId,
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

    explanations: [
      autoSpendCategoryExplanation,
      resolvedUnspscCode && !explicitUnspscCode
        ? `Defaulted UNSPSC ${resolvedUnspscCode.code} from spend category classification`
        : null,
      resolvedHsCode && !explicitHsCode
        ? `Defaulted HS / trade code ${resolvedHsCode.code} from spend category classification`
        : null,
      intent.explanation,
      profile.explanation,
    ].filter(Boolean) as string[],
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

  if (mode === "save" && persist) {
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
        classificationSource: "COMMODITY_CATEGORY",
        classificationId:     selectedSpendCategoryId,
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

    const inferredMetadataJson = JSON.stringify(inferredMetadata);

    // Persist the decision JSONB and promote resolved business_intent_id
    await sql`
      UPDATE document.purchase_invoice_line
         SET classification_decision = ${JSON.stringify(decision)}::jsonb,
             commodity_category_id       = COALESCE(commodity_category_id,
                                                ${autoSpendCategory?.id ?? null}::uuid),
             business_intent_id      = COALESCE(${resolvedIntentId}::uuid,
                                                business_intent_id),
             metadata                = CASE
                                       WHEN ${inferredMetadataJson}::jsonb = '{}'::jsonb THEN metadata
                                       ELSE COALESCE(metadata, '{}'::jsonb) || ${inferredMetadataJson}::jsonb
                                       END,
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
