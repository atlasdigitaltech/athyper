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
    WITH policy_categories AS (
      SELECT tenant_id, commodity_category_id AS spend_category_id
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
      COUNT(*) FILTER (WHERE sc.parent_id IS NOT NULL AND sc.default_intent_id IS NOT NULL)::text AS "linkedIntent",
      COUNT(DISTINCT pc.spend_category_id)::text AS "policyCategories",
      COALESCE(MAX(cp.company_policies), '0') AS "companyPolicies",
      COALESCE(MAX(sp.supplier_policies), '0') AS "supplierPolicies",
      (COALESCE(MAX(cp.company_denied), '0')::int + COALESCE(MAX(sp.supplier_denied), '0')::int)::text AS "deniedPolicies"
    FROM master.spend_category sc
    LEFT JOIN policy_categories pc
      ON pc.tenant_id = sc.tenant_id
     AND pc.spend_category_id = sc.id
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
      FROM master.spend_category
      WHERE tenant_id = ${tenantId}::uuid
      GROUP BY tenant_id, parent_id
    ),
    company_policy AS (
      SELECT
        tenant_id,
        commodity_category_id AS spend_category_id,
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
        commodity_category_id AS spend_category_id,
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
      sc.procurement_type AS "procurementType",
      sc.visibility AS "visibility",
      sc.is_classification_required AS "isClassificationRequired",
      sc.is_hs_required AS "isHsRequired",
      sc.is_regulated AS "isRegulated",
      sc.allowed_domains AS "allowedDomains",
      sc.default_intent_id::text AS "defaultIntentId",
      bi.code AS "defaultIntentCode",
      bi.name AS "defaultIntentName",
      bi.domain AS "defaultIntentDomain",
      COALESCE(cc.child_count, '0') AS "childCount",
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
    FROM master.spend_category sc
    LEFT JOIN master.spend_category root
      ON root.tenant_id = sc.tenant_id
     AND root.id = sc.root_category_id
    LEFT JOIN master.business_intent bi
      ON bi.tenant_id = sc.tenant_id
     AND bi.id = sc.default_intent_id
    LEFT JOIN child_counts cc
      ON cc.tenant_id = sc.tenant_id
     AND cc.parent_id = sc.id
    LEFT JOIN company_policy cp
      ON cp.tenant_id = sc.tenant_id
     AND cp.spend_category_id = sc.id
    LEFT JOIN supplier_policy sp
      ON sp.tenant_id = sc.tenant_id
     AND sp.spend_category_id = sc.id
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
    WITH RECURSIVE matched AS (
      SELECT
        sc.id::text AS id,
        sc.parent_id
      FROM master.spend_category sc
      LEFT JOIN master.spend_category root
        ON root.tenant_id = sc.tenant_id
       AND root.id = sc.root_category_id
      LEFT JOIN master.business_intent bi
        ON bi.tenant_id = sc.tenant_id
       AND bi.id = sc.default_intent_id
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
      FROM master.spend_category parent
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
      if (procurementType) filters.push(sql`sc.procurement_type = ${procurementType}`);
      if (visibility) filters.push(sql`sc.visibility = ${visibility}`);
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
