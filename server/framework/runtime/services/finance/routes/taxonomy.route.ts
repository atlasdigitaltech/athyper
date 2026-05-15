/**
 * Finance Taxonomy Routes
 *
 * Read models for spend categories and business intents. These endpoints expose
 * the DDL-backed taxonomy structure used by procurement intake, AP coding, GL
 * defaulting, and reporting attribution.
 */

import type { RequestHandler, Router } from "express";
import { sql } from "kysely";
import { verifyBearer, resolveTenantId } from "@athyper/svc-shared";
import type { FinanceRouteDeps } from "./finance.route.js";

interface SpendCategoryRow {
  id: string;
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
  defaultIntentCode: string | null;
  defaultIntentName: string | null;
  defaultIntentDomain: string | null;
  childCount: string | number | null;
  companyPolicyCount: string | number | null;
  companyDenyCount: string | number | null;
  supplierPolicyCount: string | number | null;
  supplierBlockCount: string | number | null;
  glDefaultCount: string | number | null;
  status: string;
  sortOrder: number;
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
  defaultGlAccountCode: string | null;
  defaultGlAccountName: string | null;
  defaultTaxCode: string | null;
  defaultAssetProfileCode: string | null;
  isApprovalRequired: boolean;
  maxAutoApproveAmount: string | number | null;
  maxAutoApproveCurrency: string | null;
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
    defaultIntentCode: row.defaultIntentCode,
    defaultIntentName: row.defaultIntentName,
    defaultIntentDomain: row.defaultIntentDomain,
    childCount: toNumber(row.childCount),
    companyPolicyCount: toNumber(row.companyPolicyCount),
    companyDenyCount: toNumber(row.companyDenyCount),
    supplierPolicyCount: toNumber(row.supplierPolicyCount),
    supplierBlockCount: toNumber(row.supplierBlockCount),
    glDefaultCount: toNumber(row.glDefaultCount),
    status: row.status,
    sortOrder: row.sortOrder,
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
    defaultGlAccountCode: row.defaultGlAccountCode,
    defaultGlAccountName: row.defaultGlAccountName,
    defaultTaxCode: row.defaultTaxCode,
    defaultAssetProfileCode: row.defaultAssetProfileCode,
    isApprovalRequired: row.isApprovalRequired,
    maxAutoApproveAmount: row.maxAutoApproveAmount === null ? null : toNumber(row.maxAutoApproveAmount),
    maxAutoApproveCurrency: row.maxAutoApproveCurrency,
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
      SELECT tenant_id, spend_category_id
      FROM master.company_code_spend_policy
      WHERE tenant_id = ${tenantId}::uuid
      UNION
      SELECT tenant_id, spend_category_id
      FROM master.company_code_supplier_spend_policy
      WHERE tenant_id = ${tenantId}::uuid
    ),
    company_policy AS (
      SELECT
        tenant_id,
        COUNT(*)::text AS company_policies,
        COUNT(*) FILTER (WHERE mapping_mode = 'DENY')::text AS company_denied
      FROM master.company_code_spend_policy
      WHERE tenant_id = ${tenantId}::uuid
      GROUP BY tenant_id
    ),
    supplier_policy AS (
      SELECT
        tenant_id,
        COUNT(*)::text AS supplier_policies,
        COUNT(*) FILTER (
          WHERE mapping_mode = 'DENY'
             OR sourcing_status = 'blocked'
             OR po_status = 'blocked'
             OR invoice_status = 'blocked'
        )::text AS supplier_denied
      FROM master.company_code_supplier_spend_policy
      WHERE tenant_id = ${tenantId}::uuid
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
        spend_category_id,
        COUNT(*)::text AS company_policy_count,
        COUNT(*) FILTER (WHERE mapping_mode = 'DENY')::text AS company_deny_count,
        COUNT(default_gl_account_id)::text AS gl_default_count
      FROM master.company_code_spend_policy
      WHERE tenant_id = ${tenantId}::uuid
      GROUP BY tenant_id, spend_category_id
    ),
    supplier_policy AS (
      SELECT
        tenant_id,
        spend_category_id,
        COUNT(*)::text AS supplier_policy_count,
        COUNT(*) FILTER (
          WHERE mapping_mode = 'DENY'
             OR sourcing_status = 'blocked'
             OR po_status = 'blocked'
             OR invoice_status = 'blocked'
        )::text AS supplier_block_count
      FROM master.company_code_supplier_spend_policy
      WHERE tenant_id = ${tenantId}::uuid
      GROUP BY tenant_id, spend_category_id
    )
    SELECT
      sc.id::text AS "id",
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
      bi.code AS "defaultIntentCode",
      bi.name AS "defaultIntentName",
      bi.domain AS "defaultIntentDomain",
      COALESCE(cc.child_count, '0') AS "childCount",
      COALESCE(cp.company_policy_count, '0') AS "companyPolicyCount",
      COALESCE(cp.company_deny_count, '0') AS "companyDenyCount",
      COALESCE(sp.supplier_policy_count, '0') AS "supplierPolicyCount",
      COALESCE(sp.supplier_block_count, '0') AS "supplierBlockCount",
      COALESCE(cp.gl_default_count, '0') AS "glDefaultCount",
      sc.status AS "status",
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

  router.get("/finance/spend-categories", (async (req, res, next) => {
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

      res.json({
        items,
        summary,
        pageInfo: { scope, limit: pageLimit, returned: items.length, hasMore },
        asAt: new Date().toISOString(),
        isLive: true,
      });
    } catch (err) {
      logger?.error("finance_spend_categories_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

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
            intent_id,
            COUNT(*)::text AS company_policy_count,
            COUNT(*) FILTER (WHERE mapping_mode = 'DENY')::text AS company_deny_count,
            COUNT(*) FILTER (WHERE is_default = true)::text AS company_default_count
          FROM master.company_code_intent_policy
          WHERE tenant_id = ${tenantId}::uuid
          GROUP BY tenant_id, intent_id
        ),
        supplier_policy AS (
          SELECT
            tenant_id,
            business_intent_id,
            COUNT(*)::text AS supplier_policy_count,
            COUNT(*) FILTER (WHERE mapping_mode = 'DENY')::text AS supplier_deny_count
          FROM master.company_code_supplier_intent_policy
          WHERE tenant_id = ${tenantId}::uuid
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
          ga.code AS "defaultGlAccountCode",
          ga.name AS "defaultGlAccountName",
          bi.default_tax_code AS "defaultTaxCode",
          bi.default_asset_profile_code AS "defaultAssetProfileCode",
          bi.is_approval_required AS "isApprovalRequired",
          bi.max_auto_approve_amount AS "maxAutoApproveAmount",
          bi.max_auto_approve_currency AS "maxAutoApproveCurrency",
          bi.visibility AS "visibility",
          COALESCE(cc.child_count, '0') AS "childCount",
          COALESCE(cp.company_policy_count, '0') AS "companyPolicyCount",
          COALESCE(cp.company_deny_count, '0') AS "companyDenyCount",
          COALESCE(cp.company_default_count, '0') AS "companyDefaultCount",
          COALESCE(sp.supplier_policy_count, '0') AS "supplierPolicyCount",
          COALESCE(sp.supplier_deny_count, '0') AS "supplierDenyCount",
          bi.status AS "status",
          bi.sort_order AS "sortOrder"
        FROM master.business_intent bi
        LEFT JOIN master.gl_account ga
          ON ga.tenant_id = bi.tenant_id
         AND ga.id = bi.default_gl_account_id
        LEFT JOIN child_counts cc
          ON cc.tenant_id = bi.tenant_id
         AND cc.parent_id = bi.id
        LEFT JOIN company_policy cp
          ON cp.tenant_id = bi.tenant_id
         AND cp.intent_id = bi.id
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
        approvalRequired: items.filter((item) => item.isApprovalRequired).length,
        glDefaults: items.filter((item) => !!item.defaultGlAccountCode).length,
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
    approvalRequired: 0,
    glDefaults: 0,
    restricted: 0,
    companyPolicies: 0,
    supplierPolicies: 0,
    deniedPolicies: 0,
  };
}
