/**
 * Finance Taxonomy Routes
 *
 * Read models for commodity categories and business intents. These endpoints expose
 * the DDL-backed taxonomy structure used by procurement intake, AP coding, GL
 * defaulting, and reporting attribution.
 */

import type { RequestHandler, Router } from "express";
import { sql } from "kysely";
import { verifyBearer, resolveTenantId } from "@athyper/svc-shared";
import type { FinanceRouteDeps } from "./finance.route.js";

interface SpendCategoryRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  rootCategoryId: string | null;
  rootCode: string | null;
  rootName: string | null;
  procurementType: string;
  visibility: string;
  isBuyAllowed: boolean;
  isSellAllowed: boolean;
  isInventoryAllowed: boolean;
  uomCode: string | null;
  salesRevenueRecognitionMethod: string | null;
  salesVariableConsideration: string | null;
  salesStandaloneSellingPriceMethod: string | null;
  isStockable: boolean;
  isConsumable: boolean;
  defaultValuationMethod: string | null;
  isLotTrackingAllowed: boolean;
  isLotTrackingRequired: boolean;
  isSerialTrackingAllowed: boolean;
  isSerialTrackingRequired: boolean;
  isClassificationRequired: boolean;
  isHsRequired: boolean;
  isRegulated: boolean;
  allowedDomains: unknown;
  defaultIntentId: string | null;
  defaultIntentCode: string | null;
  defaultIntentName: string | null;
  defaultIntentDomain: string | null;
  childCount: string | number | null;
  companyPolicyCount: string | number | null;
  companyDenyCount: string | number | null;
  supplierPolicyCount: string | number | null;
  supplierBlockCount: string | number | null;
  glDefaultCount: string | number | null;
  metadata: unknown;
  status: string;
  isActive: boolean | null;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
  sortOrder: number;
}

interface SpendCategoryRuleRow {
  id: string;
  tenantId: string;
  classificationSource: string;
  classificationId: string;
  direction: string | null;
  conditionType: string;
  conditionConfig: unknown;
  appliesToFlows: string[];
  resolvedIntentId: string;
  resolvedIntentCode: string | null;
  resolvedIntentName: string | null;
  resolvedDomain: string | null;
  explanationTemplate: string;
  confidence: string | number | null;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  metadata: unknown;
  status: string;
  isActive: boolean | null;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface BusinessIntentRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  domain: string;
  subtype: string | null;
  parentId: string | null;
  path: string | null;
  depth: number;
  visibility: string;
  childCount: string | number | null;
  companyPolicyCount: string | number | null;
  companyDenyCount: string | number | null;
  companyDefaultCount: string | number | null;
  supplierPolicyCount: string | number | null;
  supplierDenyCount: string | number | null;
  status: string;
  sortOrder: number;
}

interface AccountingProfileRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  direction: string;
  subledgerType: string;
  domainHint: string | null;
  iconKey: string | null;
  colorToken: string | null;
  metadata: unknown;
  status: string;
  isActive: boolean | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string | null;
  configCount: string | number | null;
  activeConfigCount: string | number | null;
  eventCount: string | number | null;
  templateCount: string | number | null;
  intentRuleCount: string | number | null;
  bookRuleCount: string | number | null;
  dimensionRuleCount: string | number | null;
  commitmentConfigCount: string | number | null;
  revenueConfigCount: string | number | null;
  settlementConfigCount: string | number | null;
  activeConfigId: string | null;
  activeConfigVersion: string | number | null;
  activeProfileType: string | null;
  activeRecognitionTiming: string | null;
  activeTaxTreatment: string | null;
  activeMatchingType: string | null;
  activeFlowCodes: string[] | null;
  activeDocTypes: string[] | null;
}

interface AccountingProfileConfigRow {
  id: string;
  tenantId: string;
  accountingProfileId: string;
  profileCode: string;
  profileName: string;
  direction: string;
  profileType: string;
  subledgerType: string;
  applicableFlowCodes: string[] | null;
  applicableDocTypes: string[] | null;
  recognitionTiming: string;
  deferralScheduleType: string | null;
  deferralPeriods: string | number | null;
  autoReverse: boolean;
  reversalPeriodOffset: string | number | null;
  taxTreatment: string;
  defaultTaxGroupId: string | null;
  isReverseCharge: boolean;
  matchingType: string;
  version: string | number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  isActive: boolean | null;
  eventCount: string | number | null;
  templateCount: string | number | null;
  intentRuleCount: string | number | null;
}

interface AccountingProfileRuleRow {
  id: string;
  tenantId: string;
  direction: string | null;
  intentId: string | null;
  intentCode: string | null;
  intentName: string | null;
  intentDomain: string | null;
  flowCode: string | null;
  companyCodeId: string | null;
  companyCode: string | null;
  companyName: string | null;
  docType: string | null;
  currencyCode: string | null;
  minAmount: string | number | null;
  maxAmount: string | number | null;
  isCrossBorder: boolean | null;
  isIntercompany: boolean | null;
  commodityDomain: string | null;
  commitmentType: string | null;
  counterpartyTier: string | null;
  contractValueMin: string | number | null;
  contractValueMax: string | number | null;
  revenueType: string | null;
  resolvedProfileConfigId: string;
  accountingProfileId: string;
  profileCode: string;
  profileName: string;
  profileType: string;
  explanationTemplate: string;
  confidence: string | number | null;
  priority: string | number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  isActive: boolean | null;
}

interface AccountingProfileEventRow {
  id: string;
  tenantId: string;
  profileConfigId: string;
  accountingProfileId: string;
  profileCode: string;
  eventCode: string;
  eventName: string;
  createsJe: boolean;
  reversesEvent: string | null;
  isAutoReverse: boolean;
  autoReverseOffset: string | number | null;
  commitmentAction: string;
  commitmentAmountSource: string | null;
  firesPairedProfile: boolean;
  eventSeq: string | number | null;
  status: string;
  isActive: boolean | null;
  templateCount: string | number | null;
}

interface AccountingProfileTemplateRow {
  id: string;
  tenantId: string;
  profileEventId: string;
  profileConfigId: string;
  accountingProfileId: string;
  profileCode: string;
  eventCode: string;
  lineSeq: string | number | null;
  description: string;
  postingSide: string;
  accountSource: string;
  accountCode: string | null;
  accountLookupKey: string | null;
  accountFallback: string | null;
  amountSource: string;
  amountFormula: string | null;
  amountPercentage: string | number | null;
  isBalancingLine: boolean;
  appliesToDocTypes: string[] | null;
  sortOrder: string | number | null;
  status: string;
  isActive: boolean | null;
}

interface SpendSummarySqlRow {
  total: string | number | null;
  roots: string | number | null;
  leaves: string | number | null;
  goods: string | number | null;
  services: string | number | null;
  regulated: string | number | null;
  linkedIntent: string | number | null;
  policyCategories: string | number | null;
  companyPolicies: string | number | null;
  supplierPolicies: string | number | null;
  deniedPolicies: string | number | null;
}

type SpendSummaryMode = "include" | "only" | "false";
type SpendCategoryScope = "all" | "summary" | "roots" | "children" | "detail" | "search";

function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapSpendCategory(row: SpendCategoryRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    rootCategoryId: row.rootCategoryId,
    rootCode: row.rootCode,
    rootName: row.rootName,
    procurementType: row.procurementType,
    visibility: row.visibility,
    isBuyAllowed: row.isBuyAllowed,
    isSellAllowed: row.isSellAllowed,
    isInventoryAllowed: row.isInventoryAllowed,
    uomCode: row.uomCode,
    salesRevenueRecognitionMethod: row.salesRevenueRecognitionMethod,
    salesVariableConsideration: row.salesVariableConsideration,
    salesStandaloneSellingPriceMethod: row.salesStandaloneSellingPriceMethod,
    isStockable: row.isStockable,
    isConsumable: row.isConsumable,
    defaultValuationMethod: row.defaultValuationMethod,
    isLotTrackingAllowed: row.isLotTrackingAllowed,
    isLotTrackingRequired: row.isLotTrackingRequired,
    isSerialTrackingAllowed: row.isSerialTrackingAllowed,
    isSerialTrackingRequired: row.isSerialTrackingRequired,
    isClassificationRequired: row.isClassificationRequired,
    isHsRequired: row.isHsRequired,
    isRegulated: row.isRegulated,
    allowedDomains: row.allowedDomains,
    defaultIntentId: row.defaultIntentId,
    defaultIntentCode: row.defaultIntentCode,
    defaultIntentName: row.defaultIntentName,
    defaultIntentDomain: row.defaultIntentDomain,
    childCount: toNumber(row.childCount),
    companyPolicyCount: toNumber(row.companyPolicyCount),
    companyDenyCount: toNumber(row.companyDenyCount),
    supplierPolicyCount: toNumber(row.supplierPolicyCount),
    supplierBlockCount: toNumber(row.supplierBlockCount),
    glDefaultCount: toNumber(row.glDefaultCount),
    metadata: row.metadata,
    status: row.status,
    isActive: row.isActive,
    statusChangedAt: row.statusChangedAt,
    statusChangedBy: row.statusChangedBy,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    sortOrder: row.sortOrder,
  };
}

function mapSpendCategoryRule(row: SpendCategoryRuleRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    classificationSource: row.classificationSource,
    classificationId: row.classificationId,
    direction: row.direction,
    conditionType: row.conditionType,
    conditionConfig: row.conditionConfig,
    appliesToFlows: row.appliesToFlows,
    resolvedIntentId: row.resolvedIntentId,
    resolvedIntentCode: row.resolvedIntentCode,
    resolvedIntentName: row.resolvedIntentName,
    resolvedDomain: row.resolvedDomain,
    explanationTemplate: row.explanationTemplate,
    confidence: row.confidence === null ? null : toNumber(row.confidence),
    priority: row.priority,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    metadata: row.metadata,
    status: row.status,
    isActive: row.isActive,
    statusChangedAt: row.statusChangedAt,
    statusChangedBy: row.statusChangedBy,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

function mapBusinessIntent(row: BusinessIntentRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    domain: row.domain,
    subtype: row.subtype,
    parentId: row.parentId,
    path: row.path,
    depth: row.depth,
    visibility: row.visibility,
    childCount: toNumber(row.childCount),
    companyPolicyCount: toNumber(row.companyPolicyCount),
    companyDenyCount: toNumber(row.companyDenyCount),
    companyDefaultCount: toNumber(row.companyDefaultCount),
    supplierPolicyCount: toNumber(row.supplierPolicyCount),
    supplierDenyCount: toNumber(row.supplierDenyCount),
    status: row.status,
    sortOrder: row.sortOrder,
  };
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstQueryValue(value[0]);
  return typeof value === "string" ? value : undefined;
}

function parseLimit(value: unknown, fallback: number, max: number): number {
  const raw = Number(firstQueryValue(value));
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.floor(raw), max);
}

function parseSummaryMode(value: unknown): SpendSummaryMode {
  const raw = firstQueryValue(value);
  if (raw === "only" || raw === "false") return raw;
  return "include";
}

function isRootParentParam(value: string | undefined): boolean {
  return value === "__root" || value === "root" || value === "null";
}

function mapSpendSummary(row?: SpendSummarySqlRow | null) {
  return {
    total: toNumber(row?.total),
    roots: toNumber(row?.roots),
    leaves: toNumber(row?.leaves),
    goods: toNumber(row?.goods),
    services: toNumber(row?.services),
    regulated: toNumber(row?.regulated),
    linkedIntent: toNumber(row?.linkedIntent),
    policyCategories: toNumber(row?.policyCategories),
    companyPolicies: toNumber(row?.companyPolicies),
    supplierPolicies: toNumber(row?.supplierPolicies),
    deniedPolicies: toNumber(row?.deniedPolicies),
  };
}

async function querySpendSummary(db: FinanceRouteDeps["db"], tenantId: string) {
  const { rows } = await sql<SpendSummarySqlRow>`
    WITH default_policy AS (
      SELECT DISTINCT ON (tenant_id, commodity_category_id)
        tenant_id,
        commodity_category_id
      FROM control.commodity_category_buy_policy
      WHERE tenant_id = ${tenantId}::uuid
        AND scope_type = 'TENANT'
        AND is_default = true
        AND mapping_mode = 'ALLOW'
        AND is_active = true
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY tenant_id, commodity_category_id, effective_from DESC, sort_order, id
    ),
    category_base AS (
      SELECT
        cc.*,
        COALESCE(
          NULLIF(lower(cc.metadata->>'procurement_type'), ''),
          CASE
            WHEN cc.inventory_allowed OR cc.buy_allowed THEN 'goods'
            ELSE 'services'
          END
        ) AS procurement_type
      FROM master.commodity_category cc
      WHERE cc.tenant_id = ${tenantId}::uuid
    ),
    policy_categories AS (
      SELECT DISTINCT tenant_id, commodity_category_id AS category_id
      FROM control.commodity_category_buy_policy
      WHERE tenant_id = ${tenantId}::uuid
        AND is_active = true
    ),
    company_policy AS (
      SELECT
        tenant_id,
        COUNT(*)::text AS company_policies,
        COUNT(*) FILTER (WHERE mapping_mode = 'DENY')::text AS company_denied
      FROM control.commodity_category_buy_policy
      WHERE tenant_id = ${tenantId}::uuid
        AND scope_type = 'COMPANY'
        AND is_active = true
      GROUP BY tenant_id
    ),
    supplier_policy AS (
      SELECT
        tenant_id,
        COUNT(*)::text AS supplier_policies,
        COUNT(*) FILTER (
          WHERE mapping_mode = 'DENY'
             OR metadata->>'sourcing_status' = 'blocked'
             OR metadata->>'po_status' = 'blocked'
             OR metadata->>'invoice_status' = 'blocked'
        )::text AS supplier_denied
      FROM control.commodity_category_buy_policy
      WHERE tenant_id = ${tenantId}::uuid
        AND scope_type = 'SUPPLIER_PROFILE'
        AND is_active = true
      GROUP BY tenant_id
    )
    SELECT
      COUNT(*)::text AS "total",
      COUNT(*) FILTER (WHERE sc.parent_id IS NULL)::text AS "roots",
      COUNT(*) FILTER (WHERE sc.parent_id IS NOT NULL)::text AS "leaves",
      COUNT(*) FILTER (WHERE sc.procurement_type = 'goods')::text AS "goods",
      COUNT(*) FILTER (WHERE sc.procurement_type = 'services')::text AS "services",
      COUNT(*) FILTER (WHERE sc.is_regulated = true)::text AS "regulated",
      COUNT(*) FILTER (WHERE sc.parent_id IS NOT NULL AND dp.commodity_category_id IS NOT NULL)::text AS "linkedIntent",
      COUNT(DISTINCT pc.category_id)::text AS "policyCategories",
      COALESCE(MAX(cp.company_policies), '0') AS "companyPolicies",
      COALESCE(MAX(sp.supplier_policies), '0') AS "supplierPolicies",
      (COALESCE(MAX(cp.company_denied), '0')::int + COALESCE(MAX(sp.supplier_denied), '0')::int)::text AS "deniedPolicies"
    FROM category_base sc
    LEFT JOIN default_policy dp
      ON dp.tenant_id = sc.tenant_id
     AND dp.commodity_category_id = sc.id
    LEFT JOIN policy_categories pc
      ON pc.tenant_id = sc.tenant_id
     AND pc.category_id = sc.id
    LEFT JOIN company_policy cp
      ON cp.tenant_id = sc.tenant_id
    LEFT JOIN supplier_policy sp
      ON sp.tenant_id = sc.tenant_id
    WHERE sc.tenant_id = ${tenantId}::uuid
  `.execute(db);

  return mapSpendSummary(rows[0]);
}

async function querySpendCategoryRows(
  db: FinanceRouteDeps["db"],
  tenantId: string,
  whereSql: ReturnType<typeof sql>,
  limit?: number,
) {
  const limitSql = limit ? sql`LIMIT ${limit}` : sql``;
  const { rows } = await sql<SpendCategoryRow>`
    WITH child_counts AS (
      SELECT tenant_id, parent_id, COUNT(*)::text AS child_count
      FROM master.commodity_category
      WHERE tenant_id = ${tenantId}::uuid
      GROUP BY tenant_id, parent_id
    ),
    default_policy AS (
      SELECT DISTINCT ON (tenant_id, commodity_category_id)
        tenant_id,
        commodity_category_id,
        business_intent_id
      FROM control.commodity_category_buy_policy
      WHERE tenant_id = ${tenantId}::uuid
        AND scope_type = 'TENANT'
        AND is_default = true
        AND mapping_mode = 'ALLOW'
        AND is_active = true
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY tenant_id, commodity_category_id, effective_from DESC, sort_order, id
    ),
    company_policy AS (
      SELECT
        tenant_id,
        commodity_category_id AS category_id,
        COUNT(*)::text AS company_policy_count,
        COUNT(*) FILTER (WHERE mapping_mode = 'DENY')::text AS company_deny_count,
        COUNT(default_gl_account_id)::text AS gl_default_count
      FROM control.commodity_category_buy_policy
      WHERE tenant_id = ${tenantId}::uuid
        AND scope_type = 'COMPANY'
        AND is_active = true
      GROUP BY tenant_id, commodity_category_id
    ),
    supplier_policy AS (
      SELECT
        tenant_id,
        commodity_category_id AS category_id,
        COUNT(*)::text AS supplier_policy_count,
        COUNT(*) FILTER (
          WHERE mapping_mode = 'DENY'
             OR metadata->>'sourcing_status' = 'blocked'
             OR metadata->>'po_status' = 'blocked'
             OR metadata->>'invoice_status' = 'blocked'
        )::text AS supplier_block_count
      FROM control.commodity_category_buy_policy
      WHERE tenant_id = ${tenantId}::uuid
        AND scope_type = 'SUPPLIER_PROFILE'
        AND is_active = true
      GROUP BY tenant_id, commodity_category_id
    )
    SELECT
      sc.id::text AS "id",
      sc.tenant_id::text AS "tenantId",
      sc.code AS "code",
      sc.name AS "name",
      sc.description AS "description",
      sc.parent_id::text AS "parentId",
      sc.root_category_id::text AS "rootCategoryId",
      root.code AS "rootCode",
      root.name AS "rootName",
      COALESCE(
        NULLIF(lower(sc.metadata->>'procurement_type'), ''),
        CASE
          WHEN sc.inventory_allowed OR sc.buy_allowed THEN 'goods'
          ELSE 'services'
        END
      ) AS "procurementType",
      COALESCE(
        NULLIF(sc.metadata->>'visibility', ''),
        'standard'
      ) AS "visibility",
      sc.buy_allowed AS "isBuyAllowed",
      sc.sell_allowed AS "isSellAllowed",
      sc.inventory_allowed AS "isInventoryAllowed",
      sc.uom_code AS "uomCode",
      sc.sales_revenue_recognition_method AS "salesRevenueRecognitionMethod",
      sc.sales_variable_consideration AS "salesVariableConsideration",
      sc.sales_standalone_selling_price_method AS "salesStandaloneSellingPriceMethod",
      sc.is_stockable AS "isStockable",
      sc.is_consumable AS "isConsumable",
      sc.default_valuation_method AS "defaultValuationMethod",
      sc.is_lot_tracking_allowed AS "isLotTrackingAllowed",
      sc.is_lot_tracking_required AS "isLotTrackingRequired",
      sc.is_serial_tracking_allowed AS "isSerialTrackingAllowed",
      sc.is_serial_tracking_required AS "isSerialTrackingRequired",
      sc.is_classification_required AS "isClassificationRequired",
      sc.is_hs_required AS "isHsRequired",
      sc.is_regulated AS "isRegulated",
      sc.allowed_classification_domains AS "allowedDomains",
      dp.business_intent_id::text AS "defaultIntentId",
      bi.code AS "defaultIntentCode",
      bi.name AS "defaultIntentName",
      bi.domain AS "defaultIntentDomain",
      COALESCE(child.child_count, '0') AS "childCount",
      COALESCE(cp.company_policy_count, '0') AS "companyPolicyCount",
      COALESCE(cp.company_deny_count, '0') AS "companyDenyCount",
      COALESCE(sp.supplier_policy_count, '0') AS "supplierPolicyCount",
      COALESCE(sp.supplier_block_count, '0') AS "supplierBlockCount",
      COALESCE(cp.gl_default_count, '0') AS "glDefaultCount",
      sc.metadata AS "metadata",
      sc.status AS "status",
      sc.is_active AS "isActive",
      sc.status_changed_at::text AS "statusChangedAt",
      sc.status_changed_by::text AS "statusChangedBy",
      sc.created_at::text AS "createdAt",
      sc.created_by::text AS "createdBy",
      sc.updated_at::text AS "updatedAt",
      sc.updated_by::text AS "updatedBy",
      sc.sort_order AS "sortOrder"
    FROM master.commodity_category sc
    LEFT JOIN master.commodity_category root
      ON root.tenant_id = sc.tenant_id
     AND root.id = sc.root_category_id
    LEFT JOIN default_policy dp
      ON dp.tenant_id = sc.tenant_id
     AND dp.commodity_category_id = sc.id
    LEFT JOIN master.business_intent bi
      ON bi.tenant_id = sc.tenant_id
     AND bi.id = dp.business_intent_id
    LEFT JOIN child_counts child
      ON child.tenant_id = sc.tenant_id
     AND child.parent_id = sc.id
    LEFT JOIN company_policy cp
      ON cp.tenant_id = sc.tenant_id
     AND cp.category_id = sc.id
    LEFT JOIN supplier_policy sp
      ON sp.tenant_id = sc.tenant_id
     AND sp.category_id = sc.id
    WHERE ${whereSql}
    ORDER BY
      COALESCE(root.sort_order, sc.sort_order),
      CASE WHEN sc.parent_id IS NULL THEN 0 ELSE 1 END,
      sc.sort_order,
      sc.code
    ${limitSql}
  `.execute(db);

  return rows.map(mapSpendCategory);
}

async function querySpendCategoryRules(
  db: FinanceRouteDeps["db"],
  tenantId: string,
  classificationId: string,
) {
  const { rows } = await sql<SpendCategoryRuleRow>`
    SELECT
      r.id::text AS "id",
      r.tenant_id::text AS "tenantId",
      r.classification_source AS "classificationSource",
      r.classification_id::text AS "classificationId",
      r.direction AS "direction",
      r.condition_type AS "conditionType",
      r.condition_config AS "conditionConfig",
      COALESCE(r.applies_to_flows, ARRAY[]::text[]) AS "appliesToFlows",
      r.resolved_intent_id::text AS "resolvedIntentId",
      bi.code AS "resolvedIntentCode",
      bi.name AS "resolvedIntentName",
      r.resolved_domain AS "resolvedDomain",
      r.explanation_template AS "explanationTemplate",
      r.confidence::text AS "confidence",
      r.priority AS "priority",
      r.effective_from::text AS "effectiveFrom",
      r.effective_to::text AS "effectiveTo",
      r.metadata AS "metadata",
      r.status AS "status",
      r.is_active AS "isActive",
      r.status_changed_at::text AS "statusChangedAt",
      r.status_changed_by::text AS "statusChangedBy",
      r.created_at::text AS "createdAt",
      r.created_by::text AS "createdBy",
      r.updated_at::text AS "updatedAt",
      r.updated_by::text AS "updatedBy"
    FROM control.commodity_classification_to_intent_rule r
    LEFT JOIN master.business_intent bi
      ON bi.tenant_id = r.tenant_id
     AND bi.id = r.resolved_intent_id
    WHERE r.tenant_id = ${tenantId}::uuid
      AND r.classification_source = 'COMMODITY_CATEGORY'
      AND r.classification_id = ${classificationId}::uuid
    ORDER BY
      r.priority,
      r.condition_type,
      r.effective_from DESC,
      r.id
  `.execute(db);

  return rows.map(mapSpendCategoryRule);
}

async function querySpendCategorySearchRows(
  db: FinanceRouteDeps["db"],
  tenantId: string,
  search: string,
  filters: ReturnType<typeof sql>[],
  limit: number,
) {
  const searchTerm = `%${search}%`;
  const filterSql = filters.length > 0 ? sql`AND ${sql.join(filters, sql` AND `)}` : sql``;
  const { rows: idRows } = await sql<{ id: string }>`
    WITH RECURSIVE default_policy AS (
      SELECT DISTINCT ON (tenant_id, commodity_category_id)
        tenant_id,
        commodity_category_id,
        business_intent_id
      FROM control.commodity_category_buy_policy
      WHERE tenant_id = ${tenantId}::uuid
        AND scope_type = 'TENANT'
        AND is_default = true
        AND mapping_mode = 'ALLOW'
        AND is_active = true
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY tenant_id, commodity_category_id, effective_from DESC, sort_order, id
    ),
    matched AS (
      SELECT
        sc.id::text AS id,
        sc.parent_id
      FROM master.commodity_category sc
      LEFT JOIN master.commodity_category root
        ON root.tenant_id = sc.tenant_id
       AND root.id = sc.root_category_id
      LEFT JOIN default_policy dp
        ON dp.tenant_id = sc.tenant_id
       AND dp.commodity_category_id = sc.id
      LEFT JOIN master.business_intent bi
        ON bi.tenant_id = sc.tenant_id
       AND bi.id = dp.business_intent_id
      WHERE sc.tenant_id = ${tenantId}::uuid
        ${filterSql}
        AND (
          sc.code ILIKE ${searchTerm}
          OR sc.name ILIKE ${searchTerm}
          OR COALESCE(sc.description, '') ILIKE ${searchTerm}
          OR COALESCE(root.code, '') ILIKE ${searchTerm}
          OR COALESCE(root.name, '') ILIKE ${searchTerm}
          OR COALESCE(bi.code, '') ILIKE ${searchTerm}
          OR COALESCE(bi.name, '') ILIKE ${searchTerm}
        )
      ORDER BY
        COALESCE(root.sort_order, sc.sort_order),
        CASE WHEN sc.parent_id IS NULL THEN 0 ELSE 1 END,
        sc.sort_order,
        sc.code
      LIMIT ${limit}
    ),
    ancestors(id, parent_id) AS (
      SELECT id, parent_id
      FROM matched
      UNION
      SELECT parent.id::text AS id, parent.parent_id
      FROM master.commodity_category parent
      JOIN ancestors child
        ON child.parent_id::text = parent.id::text
      WHERE parent.tenant_id = ${tenantId}::uuid
    )
    SELECT DISTINCT id
    FROM ancestors
  `.execute(db);

  if (idRows.length === 0) return [];

  const idList = sql.join(idRows.map((row) => sql`${row.id}::uuid`), sql`, `);
  return querySpendCategoryRows(db, tenantId, sql`sc.id = ANY(ARRAY[${idList}])`);
}

export function createTaxonomyRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger } = deps;

  const commodityCategoriesHandler = (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.json({ items: [], summary: emptySpendSummary(), asAt: new Date().toISOString(), isLive: true });
        return;
      }

      const summaryMode = parseSummaryMode(req.query.summary);
      const id = firstQueryValue(req.query.id)?.trim();
      const parentId = firstQueryValue(req.query.parentId)?.trim();
      const search = firstQueryValue(req.query.q)?.trim() ?? "";
      const status = firstQueryValue(req.query.status)?.trim();
      const procurementType = firstQueryValue(req.query.procurementType)?.trim();
      const visibility = firstQueryValue(req.query.visibility)?.trim();
      const rootCode = firstQueryValue(req.query.rootCode)?.trim();
      const includeRules = firstQueryValue(req.query.includeRules)?.trim() === "true";
      const summary = summaryMode === "false" ? emptySpendSummary() : await querySpendSummary(db, tenantId);

      if (summaryMode === "only") {
        res.json({
          items: [],
          summary,
          pageInfo: { scope: "summary", limit: null, returned: 0, hasMore: false },
          asAt: new Date().toISOString(),
          isLive: true,
        });
        return;
      }

      const filters: ReturnType<typeof sql>[] = [];
      if (status) filters.push(sql`sc.status = ${status}`);
      if (procurementType) {
        filters.push(sql`COALESCE(
          NULLIF(lower(sc.metadata->>'procurement_type'), ''),
          CASE
            WHEN sc.inventory_allowed OR sc.buy_allowed THEN 'goods'
            ELSE 'services'
          END
        ) = lower(${procurementType})`);
      }
      if (visibility) filters.push(sql`COALESCE(NULLIF(sc.metadata->>'visibility', ''), 'standard') = ${visibility}`);
      if (rootCode) filters.push(sql`COALESCE(root.code, sc.code) = ${rootCode}`);

      let scope: SpendCategoryScope = "all";
      let pageLimit: number | null = null;
      let hasMore = false;
      let items: ReturnType<typeof mapSpendCategory>[] = [];

      if (search) {
        scope = "search";
        pageLimit = parseLimit(req.query.limit, 500, 1000);
        items = await querySpendCategorySearchRows(db, tenantId, search, filters, pageLimit);
      } else {
        const whereParts: ReturnType<typeof sql>[] = [sql`sc.tenant_id = ${tenantId}::uuid`, ...filters];

        if (id) {
          scope = "detail";
          pageLimit = 1;
          whereParts.push(sql`sc.id = ${id}::uuid`);
        } else if (parentId !== undefined) {
          if (isRootParentParam(parentId)) {
            scope = "roots";
            whereParts.push(sql`sc.parent_id IS NULL`);
          } else {
            scope = "children";
            whereParts.push(sql`sc.parent_id = ${parentId}::uuid`);
          }
          pageLimit = parseLimit(req.query.limit, 500, 1000);
        }

        const fetchLimit = pageLimit === null ? undefined : pageLimit + 1;
        const rows = await querySpendCategoryRows(db, tenantId, sql.join(whereParts, sql` AND `), fetchLimit);
        hasMore = pageLimit !== null && rows.length > pageLimit;
        items = hasMore && pageLimit !== null ? rows.slice(0, pageLimit) : rows;
      }

      const rules = includeRules && id
        ? await querySpendCategoryRules(db, tenantId, id)
        : undefined;

      res.json({
        items,
        ...(rules !== undefined ? { rules } : {}),
        summary,
        pageInfo: { scope, limit: pageLimit, returned: items.length, hasMore },
        asAt: new Date().toISOString(),
        isLive: true,
      });
    } catch (err) {
      logger?.error("finance_commodity_categories_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler;

  router.get("/finance/commodity-categories", commodityCategoriesHandler);
  router.get("/finance/spend-categories", commodityCategoriesHandler);

  router.get("/finance/business-intents", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.json({ items: [], summary: emptyIntentSummary(), asAt: new Date().toISOString(), isLive: true });
        return;
      }

      const { rows } = await sql<BusinessIntentRow>`
        WITH child_counts AS (
          SELECT tenant_id, parent_id, COUNT(*)::text AS child_count
          FROM master.business_intent
          WHERE tenant_id = ${tenantId}::uuid
          GROUP BY tenant_id, parent_id
        ),
        company_policy AS (
          SELECT
            tenant_id,
            business_intent_id,
            COUNT(*)::text AS company_policy_count,
            COUNT(*) FILTER (WHERE mapping_mode = 'DENY')::text AS company_deny_count,
            COUNT(*) FILTER (WHERE is_default = true)::text AS company_default_count
          FROM (
            SELECT tenant_id, business_intent_id, mapping_mode, is_default
            FROM control.commodity_category_buy_policy
            WHERE tenant_id = ${tenantId}::uuid
              AND scope_type = 'COMPANY'
              AND is_active = true
            UNION ALL
            SELECT tenant_id, business_intent_id, mapping_mode, is_default
            FROM control.commodity_category_sell_policy
            WHERE tenant_id = ${tenantId}::uuid
              AND scope_type = 'COMPANY'
              AND is_active = true
          ) policy
          GROUP BY tenant_id, business_intent_id
        ),
        default_policy AS (
          SELECT
            tenant_id,
            business_intent_id,
            COUNT(*)::text AS default_policy_count
          FROM (
            SELECT tenant_id, business_intent_id
            FROM control.commodity_category_buy_policy
            WHERE tenant_id = ${tenantId}::uuid
              AND scope_type IN ('TENANT', 'COMPANY')
              AND is_default = true
              AND is_active = true
            UNION ALL
            SELECT tenant_id, business_intent_id
            FROM control.commodity_category_sell_policy
            WHERE tenant_id = ${tenantId}::uuid
              AND scope_type IN ('TENANT', 'COMPANY')
              AND is_default = true
              AND is_active = true
          ) policy
          GROUP BY tenant_id, business_intent_id
        ),
        supplier_policy AS (
          SELECT
            tenant_id,
            business_intent_id,
            COUNT(*)::text AS supplier_policy_count,
            COUNT(*) FILTER (WHERE mapping_mode = 'DENY')::text AS supplier_deny_count
          FROM control.commodity_category_buy_policy
          WHERE tenant_id = ${tenantId}::uuid
            AND scope_type = 'SUPPLIER_PROFILE'
            AND is_active = true
          GROUP BY tenant_id, business_intent_id
        )
        SELECT
          bi.id::text AS "id",
          bi.code AS "code",
          bi.name AS "name",
          bi.description AS "description",
          bi.domain AS "domain",
          bi.subtype AS "subtype",
          bi.parent_id::text AS "parentId",
          bi.path AS "path",
          bi.depth AS "depth",
          bi.visibility AS "visibility",
          COALESCE(cc.child_count, '0') AS "childCount",
          COALESCE(cp.company_policy_count, '0') AS "companyPolicyCount",
          COALESCE(cp.company_deny_count, '0') AS "companyDenyCount",
          COALESCE(dp.default_policy_count, '0') AS "companyDefaultCount",
          COALESCE(sp.supplier_policy_count, '0') AS "supplierPolicyCount",
          COALESCE(sp.supplier_deny_count, '0') AS "supplierDenyCount",
          bi.status AS "status",
          bi.sort_order AS "sortOrder"
        FROM master.business_intent bi
        LEFT JOIN child_counts cc
          ON cc.tenant_id = bi.tenant_id
         AND cc.parent_id = bi.id
        LEFT JOIN company_policy cp
          ON cp.tenant_id = bi.tenant_id
         AND cp.business_intent_id = bi.id
        LEFT JOIN default_policy dp
          ON dp.tenant_id = bi.tenant_id
         AND dp.business_intent_id = bi.id
        LEFT JOIN supplier_policy sp
          ON sp.tenant_id = bi.tenant_id
         AND sp.business_intent_id = bi.id
        WHERE bi.tenant_id = ${tenantId}::uuid
        ORDER BY
          CASE bi.domain
            WHEN 'OPEX' THEN 10
            WHEN 'CAPEX' THEN 20
            WHEN 'COST_OF_SALES' THEN 30
            WHEN 'ADMIN' THEN 40
            WHEN 'REGULATORY' THEN 50
            WHEN 'TRANSFER' THEN 60
            WHEN 'REVENUE' THEN 70
            WHEN 'DEFERRED_REVENUE' THEN 80
            ELSE 99
          END,
          bi.depth,
          bi.sort_order,
          bi.code
      `.execute(db);

      const items = rows.map(mapBusinessIntent);
      const roots = items.filter((item) => item.parentId === null);
      const domains = [...new Set(items.map((item) => item.domain))];
      const summary = {
        total: items.length,
        roots: roots.length,
        leaves: items.length - roots.length,
        domains: domains.length,
        policyDefaults: items.reduce((sum, item) => sum + item.companyDefaultCount, 0),
        restricted: items.filter((item) => item.visibility !== "STANDARD").length,
        companyPolicies: items.reduce((sum, item) => sum + item.companyPolicyCount, 0),
        supplierPolicies: items.reduce((sum, item) => sum + item.supplierPolicyCount, 0),
        deniedPolicies: items.reduce((sum, item) => sum + item.companyDenyCount + item.supplierDenyCount, 0),
      };

      res.json({ items, summary, asAt: new Date().toISOString(), isLive: true });
    } catch (err) {
      logger?.error("finance_business_intents_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.get("/finance/accounting-profiles", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.json(emptyAccountingProfilePayload({ hasIdentityTable: true }));
        return;
      }

      const profileTable = await sql<{ exists: boolean }>`
        SELECT to_regclass('master.accounting_profile') IS NOT NULL AS "exists"
      `.execute(db);

      if (!profileTable.rows[0]?.exists) {
        res.json(emptyAccountingProfilePayload({ hasIdentityTable: false }));
        return;
      }

      const profilesResult = await sql<AccountingProfileRow>`
        WITH active_config AS (
          SELECT *
          FROM (
            SELECT
              apc.*,
              row_number() OVER (
                PARTITION BY apc.accounting_profile_id
                ORDER BY apc.is_active DESC NULLS LAST, apc.version DESC, apc.effective_from DESC
              ) AS rn
            FROM control.acct_profile_config apc
            WHERE apc.tenant_id = ${tenantId}::uuid
          ) ranked
          WHERE rn = 1
        ),
        config_rollup AS (
          SELECT
            accounting_profile_id,
            COUNT(*)::int AS config_count,
            COUNT(*) FILTER (WHERE is_active = true)::int AS active_config_count
          FROM control.acct_profile_config
          WHERE tenant_id = ${tenantId}::uuid
          GROUP BY accounting_profile_id
        ),
        event_rollup AS (
          SELECT
            apc.accounting_profile_id,
            COUNT(DISTINCT ape.id)::int AS event_count
          FROM control.acct_profile_config apc
          JOIN control.acct_profile_event ape
            ON ape.profile_config_id = apc.id
           AND ape.tenant_id = apc.tenant_id
          WHERE apc.tenant_id = ${tenantId}::uuid
          GROUP BY apc.accounting_profile_id
        ),
        template_rollup AS (
          SELECT
            apc.accounting_profile_id,
            COUNT(DISTINCT apet.id)::int AS template_count
          FROM control.acct_profile_config apc
          JOIN control.acct_profile_event ape
            ON ape.profile_config_id = apc.id
           AND ape.tenant_id = apc.tenant_id
          JOIN control.acct_profile_entry_template apet
            ON apet.profile_event_id = ape.id
           AND apet.tenant_id = ape.tenant_id
          WHERE apc.tenant_id = ${tenantId}::uuid
          GROUP BY apc.accounting_profile_id
        ),
        rule_rollup AS (
          SELECT
            apc.accounting_profile_id,
            COUNT(DISTINCT iprr.id)::int AS intent_rule_count
          FROM control.acct_profile_config apc
          JOIN control.intent_to_accounting_profile_rule iprr
            ON iprr.resolved_profile_config_id = apc.id
           AND iprr.tenant_id = apc.tenant_id
          WHERE apc.tenant_id = ${tenantId}::uuid
          GROUP BY apc.accounting_profile_id
        ),
        optional_rollup AS (
          SELECT
            apc.accounting_profile_id,
            COUNT(DISTINCT apbr.id)::int AS book_rule_count,
            COUNT(DISTINCT apdr.id)::int AS dimension_rule_count,
            COUNT(DISTINCT apcc.id)::int AS commitment_config_count,
            COUNT(DISTINCT aprc.id)::int AS revenue_config_count,
            COUNT(DISTINCT apsc.id)::int AS settlement_config_count
          FROM control.acct_profile_config apc
          LEFT JOIN control.acct_profile_book_rule apbr
            ON apbr.profile_config_id = apc.id
           AND apbr.tenant_id = apc.tenant_id
          LEFT JOIN control.acct_profile_dimension_rule apdr
            ON apdr.profile_config_id = apc.id
           AND apdr.tenant_id = apc.tenant_id
          LEFT JOIN control.acct_profile_commitment_config apcc
            ON apcc.profile_config_id = apc.id
           AND apcc.tenant_id = apc.tenant_id
          LEFT JOIN control.acct_profile_revenue_config aprc
            ON aprc.profile_config_id = apc.id
           AND aprc.tenant_id = apc.tenant_id
          LEFT JOIN control.acct_profile_settlement_config apsc
            ON apsc.profile_config_id = apc.id
           AND apsc.tenant_id = apc.tenant_id
          WHERE apc.tenant_id = ${tenantId}::uuid
          GROUP BY apc.accounting_profile_id
        )
        SELECT
          ap.id::text AS "id",
          ap.tenant_id::text AS "tenantId",
          ap.code AS "code",
          ap.name AS "name",
          ap.description AS "description",
          ap.direction AS "direction",
          ap.subledger_type AS "subledgerType",
          ap.domain_hint AS "domainHint",
          ap.icon_key AS "iconKey",
          ap.color_token AS "colorToken",
          ap.metadata AS "metadata",
          ap.status AS "status",
          ap.is_active AS "isActive",
          ap.sort_order AS "sortOrder",
          ap.created_at::text AS "createdAt",
          ap.updated_at::text AS "updatedAt",
          COALESCE(cr.config_count, 0) AS "configCount",
          COALESCE(cr.active_config_count, 0) AS "activeConfigCount",
          COALESCE(er.event_count, 0) AS "eventCount",
          COALESCE(tr.template_count, 0) AS "templateCount",
          COALESCE(rr.intent_rule_count, 0) AS "intentRuleCount",
          COALESCE(oroll.book_rule_count, 0) AS "bookRuleCount",
          COALESCE(oroll.dimension_rule_count, 0) AS "dimensionRuleCount",
          COALESCE(oroll.commitment_config_count, 0) AS "commitmentConfigCount",
          COALESCE(oroll.revenue_config_count, 0) AS "revenueConfigCount",
          COALESCE(oroll.settlement_config_count, 0) AS "settlementConfigCount",
          ac.id::text AS "activeConfigId",
          ac.version AS "activeConfigVersion",
          ac.profile_type AS "activeProfileType",
          ac.recognition_timing AS "activeRecognitionTiming",
          ac.tax_treatment AS "activeTaxTreatment",
          ac.matching_type AS "activeMatchingType",
          ac.applicable_flow_codes AS "activeFlowCodes",
          ac.applicable_doc_types AS "activeDocTypes"
        FROM master.accounting_profile ap
        LEFT JOIN active_config ac
          ON ac.accounting_profile_id = ap.id
         AND ac.tenant_id = ap.tenant_id
        LEFT JOIN config_rollup cr ON cr.accounting_profile_id = ap.id
        LEFT JOIN event_rollup er ON er.accounting_profile_id = ap.id
        LEFT JOIN template_rollup tr ON tr.accounting_profile_id = ap.id
        LEFT JOIN rule_rollup rr ON rr.accounting_profile_id = ap.id
        LEFT JOIN optional_rollup oroll ON oroll.accounting_profile_id = ap.id
        WHERE ap.tenant_id = ${tenantId}::uuid
        ORDER BY
          CASE ap.direction WHEN 'INBOUND' THEN 10 WHEN 'OUTBOUND' THEN 20 ELSE 30 END,
          ap.subledger_type,
          ap.sort_order,
          ap.code
      `.execute(db);

      const configsResult = await sql<AccountingProfileConfigRow>`
        WITH event_rollup AS (
          SELECT profile_config_id, tenant_id, COUNT(*)::int AS event_count
          FROM control.acct_profile_event
          WHERE tenant_id = ${tenantId}::uuid
          GROUP BY profile_config_id, tenant_id
        ),
        template_rollup AS (
          SELECT ape.profile_config_id, ape.tenant_id, COUNT(apet.id)::int AS template_count
          FROM control.acct_profile_event ape
          JOIN control.acct_profile_entry_template apet
            ON apet.profile_event_id = ape.id
           AND apet.tenant_id = ape.tenant_id
          WHERE ape.tenant_id = ${tenantId}::uuid
          GROUP BY ape.profile_config_id, ape.tenant_id
        ),
        rule_rollup AS (
          SELECT resolved_profile_config_id, tenant_id, COUNT(*)::int AS intent_rule_count
          FROM control.intent_to_accounting_profile_rule
          WHERE tenant_id = ${tenantId}::uuid
          GROUP BY resolved_profile_config_id, tenant_id
        )
        SELECT
          apc.id::text AS "id",
          apc.tenant_id::text AS "tenantId",
          apc.accounting_profile_id::text AS "accountingProfileId",
          ap.code AS "profileCode",
          ap.name AS "profileName",
          apc.direction AS "direction",
          apc.profile_type AS "profileType",
          apc.subledger_type AS "subledgerType",
          apc.applicable_flow_codes AS "applicableFlowCodes",
          apc.applicable_doc_types AS "applicableDocTypes",
          apc.recognition_timing AS "recognitionTiming",
          apc.deferral_schedule_type AS "deferralScheduleType",
          apc.deferral_periods AS "deferralPeriods",
          apc.auto_reverse AS "autoReverse",
          apc.reversal_period_offset AS "reversalPeriodOffset",
          apc.tax_treatment AS "taxTreatment",
          apc.default_tax_group_id::text AS "defaultTaxGroupId",
          apc.is_reverse_charge AS "isReverseCharge",
          apc.matching_type AS "matchingType",
          apc.version AS "version",
          apc.effective_from::text AS "effectiveFrom",
          apc.effective_to::text AS "effectiveTo",
          apc.status AS "status",
          apc.is_active AS "isActive",
          COALESCE(er.event_count, 0) AS "eventCount",
          COALESCE(tr.template_count, 0) AS "templateCount",
          COALESCE(rr.intent_rule_count, 0) AS "intentRuleCount"
        FROM control.acct_profile_config apc
        JOIN master.accounting_profile ap
          ON ap.id = apc.accounting_profile_id
         AND ap.tenant_id = apc.tenant_id
        LEFT JOIN event_rollup er
          ON er.profile_config_id = apc.id
         AND er.tenant_id = apc.tenant_id
        LEFT JOIN template_rollup tr
          ON tr.profile_config_id = apc.id
         AND tr.tenant_id = apc.tenant_id
        LEFT JOIN rule_rollup rr
          ON rr.resolved_profile_config_id = apc.id
         AND rr.tenant_id = apc.tenant_id
        WHERE apc.tenant_id = ${tenantId}::uuid
        ORDER BY ap.code, apc.version DESC, apc.effective_from DESC
      `.execute(db);

      const rulesResult = await sql<AccountingProfileRuleRow>`
        SELECT
          iprr.id::text AS "id",
          iprr.tenant_id::text AS "tenantId",
          iprr.direction AS "direction",
          iprr.intent_id::text AS "intentId",
          bi.code AS "intentCode",
          bi.name AS "intentName",
          COALESCE(iprr.intent_domain, bi.domain) AS "intentDomain",
          iprr.flow_code AS "flowCode",
          iprr.company_code_id::text AS "companyCodeId",
          cc.code AS "companyCode",
          cc.name AS "companyName",
          iprr.doc_type AS "docType",
          iprr.currency_code AS "currencyCode",
          iprr.min_amount AS "minAmount",
          iprr.max_amount AS "maxAmount",
          iprr.is_cross_border AS "isCrossBorder",
          iprr.is_intercompany AS "isIntercompany",
          iprr.commodity_domain AS "commodityDomain",
          iprr.commitment_type AS "commitmentType",
          iprr.counterparty_tier AS "counterpartyTier",
          iprr.contract_value_min AS "contractValueMin",
          iprr.contract_value_max AS "contractValueMax",
          iprr.revenue_type AS "revenueType",
          iprr.resolved_profile_config_id::text AS "resolvedProfileConfigId",
          ap.id::text AS "accountingProfileId",
          ap.code AS "profileCode",
          ap.name AS "profileName",
          apc.profile_type AS "profileType",
          iprr.explanation_template AS "explanationTemplate",
          iprr.confidence AS "confidence",
          iprr.priority AS "priority",
          iprr.effective_from::text AS "effectiveFrom",
          iprr.effective_to::text AS "effectiveTo",
          iprr.status AS "status",
          iprr.is_active AS "isActive"
        FROM control.intent_to_accounting_profile_rule iprr
        JOIN control.acct_profile_config apc
          ON apc.id = iprr.resolved_profile_config_id
         AND apc.tenant_id = iprr.tenant_id
        JOIN master.accounting_profile ap
          ON ap.id = apc.accounting_profile_id
         AND ap.tenant_id = apc.tenant_id
        LEFT JOIN master.business_intent bi
          ON bi.id = iprr.intent_id
         AND bi.tenant_id = iprr.tenant_id
        LEFT JOIN master.company_code cc
          ON cc.id = iprr.company_code_id
         AND cc.tenant_id = iprr.tenant_id
        WHERE iprr.tenant_id = ${tenantId}::uuid
        ORDER BY iprr.priority ASC, bi.code NULLS LAST, ap.code
      `.execute(db);

      const eventsResult = await sql<AccountingProfileEventRow>`
        WITH template_rollup AS (
          SELECT profile_event_id, tenant_id, COUNT(*)::int AS template_count
          FROM control.acct_profile_entry_template
          WHERE tenant_id = ${tenantId}::uuid
          GROUP BY profile_event_id, tenant_id
        )
        SELECT
          ape.id::text AS "id",
          ape.tenant_id::text AS "tenantId",
          ape.profile_config_id::text AS "profileConfigId",
          ap.id::text AS "accountingProfileId",
          ap.code AS "profileCode",
          ape.event_code AS "eventCode",
          ape.event_name AS "eventName",
          ape.creates_je AS "createsJe",
          ape.reverses_event AS "reversesEvent",
          ape.is_auto_reverse AS "isAutoReverse",
          ape.auto_reverse_offset AS "autoReverseOffset",
          ape.commitment_action AS "commitmentAction",
          ape.commitment_amount_source AS "commitmentAmountSource",
          ape.fires_paired_profile AS "firesPairedProfile",
          ape.event_seq AS "eventSeq",
          ape.status AS "status",
          ape.is_active AS "isActive",
          COALESCE(tr.template_count, 0) AS "templateCount"
        FROM control.acct_profile_event ape
        JOIN control.acct_profile_config apc
          ON apc.id = ape.profile_config_id
         AND apc.tenant_id = ape.tenant_id
        JOIN master.accounting_profile ap
          ON ap.id = apc.accounting_profile_id
         AND ap.tenant_id = apc.tenant_id
        LEFT JOIN template_rollup tr
          ON tr.profile_event_id = ape.id
         AND tr.tenant_id = ape.tenant_id
        WHERE ape.tenant_id = ${tenantId}::uuid
        ORDER BY ap.code, ape.event_seq, ape.event_code
      `.execute(db);

      const templatesResult = await sql<AccountingProfileTemplateRow>`
        SELECT
          apet.id::text AS "id",
          apet.tenant_id::text AS "tenantId",
          apet.profile_event_id::text AS "profileEventId",
          ape.profile_config_id::text AS "profileConfigId",
          ap.id::text AS "accountingProfileId",
          ap.code AS "profileCode",
          ape.event_code AS "eventCode",
          apet.line_seq AS "lineSeq",
          apet.description AS "description",
          apet.posting_side AS "postingSide",
          apet.account_source AS "accountSource",
          apet.account_code AS "accountCode",
          apet.account_lookup_key AS "accountLookupKey",
          apet.account_fallback AS "accountFallback",
          apet.amount_source AS "amountSource",
          apet.amount_formula AS "amountFormula",
          apet.amount_percentage AS "amountPercentage",
          apet.is_balancing_line AS "isBalancingLine",
          apet.applies_to_doc_types AS "appliesToDocTypes",
          apet.sort_order AS "sortOrder",
          apet.status AS "status",
          apet.is_active AS "isActive"
        FROM control.acct_profile_entry_template apet
        JOIN control.acct_profile_event ape
          ON ape.id = apet.profile_event_id
         AND ape.tenant_id = apet.tenant_id
        JOIN control.acct_profile_config apc
          ON apc.id = ape.profile_config_id
         AND apc.tenant_id = ape.tenant_id
        JOIN master.accounting_profile ap
          ON ap.id = apc.accounting_profile_id
         AND ap.tenant_id = apc.tenant_id
        WHERE apet.tenant_id = ${tenantId}::uuid
        ORDER BY ap.code, ape.event_seq, apet.sort_order, apet.line_seq
      `.execute(db);

      const items = profilesResult.rows.map(mapAccountingProfile);
      const configs = configsResult.rows.map(mapAccountingProfileConfig);
      const rules = rulesResult.rows.map(mapAccountingProfileRule);
      const events = eventsResult.rows.map(mapAccountingProfileEvent);
      const templates = templatesResult.rows.map(mapAccountingProfileTemplate);
      const optionalConfigs = items.reduce(
        (sum, item) => sum + item.bookRuleCount + item.dimensionRuleCount + item.commitmentConfigCount + item.revenueConfigCount + item.settlementConfigCount,
        0,
      );

      res.json({
        items,
        configs,
        rules,
        events,
        templates,
        summary: {
          total: items.length,
          activeProfiles: items.filter((item) => item.isActive).length,
          activeConfigs: configs.filter((item) => item.isActive).length,
          intentRules: rules.length,
          activeIntentRules: rules.filter((item) => item.isActive).length,
          events: events.length,
          entryTemplates: templates.length,
          optionalConfigs,
          profilesWithoutConfig: items.filter((item) => item.configCount === 0).length,
          profilesWithoutRules: items.filter((item) => item.intentRuleCount === 0).length,
          profilesWithoutTemplates: items.filter((item) => item.templateCount === 0).length,
        },
        hasIdentityTable: true,
        asAt: new Date().toISOString(),
        isLive: true,
      });
    } catch (err) {
      logger?.error("finance_accounting_profiles_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}

function emptySpendSummary() {
  return {
    total: 0,
    roots: 0,
    leaves: 0,
    goods: 0,
    services: 0,
    regulated: 0,
    linkedIntent: 0,
    policyCategories: 0,
    companyPolicies: 0,
    supplierPolicies: 0,
    deniedPolicies: 0,
  };
}

function emptyIntentSummary() {
  return {
    total: 0,
    roots: 0,
    leaves: 0,
    domains: 0,
    policyDefaults: 0,
    restricted: 0,
    companyPolicies: 0,
    supplierPolicies: 0,
    deniedPolicies: 0,
  };
}

function mapAccountingProfile(row: AccountingProfileRow) {
  return {
    ...row,
    configCount: toNumber(row.configCount),
    activeConfigCount: toNumber(row.activeConfigCount),
    eventCount: toNumber(row.eventCount),
    templateCount: toNumber(row.templateCount),
    intentRuleCount: toNumber(row.intentRuleCount),
    bookRuleCount: toNumber(row.bookRuleCount),
    dimensionRuleCount: toNumber(row.dimensionRuleCount),
    commitmentConfigCount: toNumber(row.commitmentConfigCount),
    revenueConfigCount: toNumber(row.revenueConfigCount),
    settlementConfigCount: toNumber(row.settlementConfigCount),
    activeConfigVersion: toNullableNumber(row.activeConfigVersion),
    activeFlowCodes: row.activeFlowCodes ?? [],
    activeDocTypes: row.activeDocTypes ?? [],
  };
}

function mapAccountingProfileConfig(row: AccountingProfileConfigRow) {
  return {
    ...row,
    applicableFlowCodes: row.applicableFlowCodes ?? [],
    applicableDocTypes: row.applicableDocTypes ?? [],
    deferralPeriods: toNullableNumber(row.deferralPeriods),
    reversalPeriodOffset: toNullableNumber(row.reversalPeriodOffset),
    version: toNumber(row.version),
    eventCount: toNumber(row.eventCount),
    templateCount: toNumber(row.templateCount),
    intentRuleCount: toNumber(row.intentRuleCount),
  };
}

function mapAccountingProfileRule(row: AccountingProfileRuleRow) {
  return {
    ...row,
    minAmount: toNullableNumber(row.minAmount),
    maxAmount: toNullableNumber(row.maxAmount),
    contractValueMin: toNullableNumber(row.contractValueMin),
    contractValueMax: toNullableNumber(row.contractValueMax),
    confidence: toNullableNumber(row.confidence),
    priority: toNumber(row.priority),
  };
}

function mapAccountingProfileEvent(row: AccountingProfileEventRow) {
  return {
    ...row,
    autoReverseOffset: toNullableNumber(row.autoReverseOffset),
    eventSeq: toNumber(row.eventSeq),
    templateCount: toNumber(row.templateCount),
  };
}

function mapAccountingProfileTemplate(row: AccountingProfileTemplateRow) {
  return {
    ...row,
    lineSeq: toNumber(row.lineSeq),
    amountPercentage: toNullableNumber(row.amountPercentage),
    appliesToDocTypes: row.appliesToDocTypes ?? [],
    sortOrder: toNumber(row.sortOrder),
  };
}

function emptyAccountingProfilePayload({ hasIdentityTable }: { hasIdentityTable: boolean }) {
  return {
    items: [],
    configs: [],
    rules: [],
    events: [],
    templates: [],
    summary: {
      total: 0,
      activeProfiles: 0,
      activeConfigs: 0,
      intentRules: 0,
      activeIntentRules: 0,
      events: 0,
      entryTemplates: 0,
      optionalConfigs: 0,
      profilesWithoutConfig: 0,
      profilesWithoutRules: 0,
      profilesWithoutTemplates: 0,
    },
    hasIdentityTable,
    asAt: new Date().toISOString(),
    isLive: true,
  };
}
