/**
 * Finance Setup — Configure workspace read models.
 *
 * Read-only in Phase 1.5. Mutations arrive in Phase 2 as separate handlers.
 *
 *   • GL Controls        → loadGlControlsGrid  (postable accounts × controls join)
 *   • Chart Assignments  → loadChartAssignments (all assignment types + statuses)
 *   • Book Assignments   → loadBookAssignments  (ledger book × posting keys)
 *   • House Banks list   → uses loadHouseBanksList from finance-explore.service
 */

import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;


// ─── GL Controls grid ───────────────────────────────────────────────────────

export interface GlControlRow {
  /** company_code_gl_account.id — null when no control row exists (uncovered). */
  controlId:            string | null;
  glAccountId:          string;
  accountCode:          string;
  accountName:          string;
  accountClass:         string;
  nodeType:            string;
  currencyCode:        string | null;
  chartCode:           string;
  normalBalance:        string;
  isPosting:            boolean;      // postable per mv_company_postable_account
  hasCompanyControl:    boolean;      // company_code_gl_account row exists
  postingAllowed:       boolean;
  blockedForManual:     boolean;
  blockedForAuto:       boolean;
  requiresCostCenter:   boolean;
  requiresProfitCenter: boolean;
  requiresProject:      boolean;
  reconciliationType:   string | null;
  taxCategory:          string | null;
  defaultCostCenterId:  string | null;
  defaultSiteId:        string | null;
  createdAt:            string | null;
  updatedAt:            string | null;
}

export interface GlControlsGridPayload {
  companyCode:      string;
  totalPostable:    number;
  totalControlled:  number;
  coveragePct:      number;
  rows:             GlControlRow[];
}

export async function loadGlControlsGrid(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<GlControlsGridPayload | null> {
  const q = await sql<{
    control_id:               string | null;
    gl_account_id:            string;
    account_code:             string;
    account_name:             string;
    account_class:            string;
    normal_balance:           string;
    node_type:                string;
    currency_code:            string | null;
    chart_code:               string;
    is_posting:               boolean;
    has_control:              boolean;
    posting_allowed:          boolean;
    blocked_for_manual:       boolean;
    blocked_for_auto:         boolean;
    requires_cost_center:     boolean;
    requires_profit_center:   boolean;
    requires_project:         boolean;
    reconciliation_type:      string | null;
    tax_category:             string | null;
    default_cost_center_id:   string | null;
    default_site_id:          string | null;
    created_at:               string | null;
    updated_at:               string | null;
  }>`
    SELECT DISTINCT ON (ga.id)
           ccga.id                                     AS control_id,
           ga.id                                       AS gl_account_id,
           ga.code                                     AS account_code,
           ga.name                                     AS account_name,
           ga.account_class,
           ga.normal_balance,
           ga.node_type,
           ga.currency_code,
           coa.code                                    AS chart_code,
           true                                       AS is_posting,
           (ccga.id IS NOT NULL AND ccga.status = 'active') AS has_control,
           COALESCE(ccga.posting_allowed, true)       AS posting_allowed,
           COALESCE(ccga.blocked_for_manual, false)   AS blocked_for_manual,
           COALESCE(ccga.blocked_for_auto,   false)   AS blocked_for_auto,
           COALESCE(ccga.requires_cost_center, false)  AS requires_cost_center,
           COALESCE(ccga.requires_profit_center, false) AS requires_profit_center,
           COALESCE(ccga.requires_project, false)     AS requires_project,
           ccga.reconciliation_type                   AS reconciliation_type,
           ccga.tax_category                          AS tax_category,
           ccga.default_cost_center_id                AS default_cost_center_id,
           ccga.default_site_id                       AS default_site_id,
           ccga.created_at::text                      AS created_at
           , ccga.updated_at::text                    AS updated_at
      FROM master.company_code cc
      JOIN master.company_code_chart_assignment ccca
        ON ccca.tenant_id = cc.tenant_id AND ccca.company_code_id = cc.id
       AND ccca.status = 'active'
       AND (ccca.effective_from IS NULL OR ccca.effective_from <= CURRENT_DATE)
       AND (ccca.effective_to IS NULL OR ccca.effective_to >= CURRENT_DATE)
      JOIN master.chart_of_account coa
        ON coa.tenant_id = ccca.tenant_id AND coa.id = ccca.chart_of_account_id AND coa.status = 'active'
      JOIN master.gl_account ga
        ON ga.tenant_id = coa.tenant_id AND ga.chart_of_account_id = coa.id
       AND ga.status = 'active' AND ga.node_type = 'posting'
       AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true)
      LEFT JOIN master.company_code_gl_account ccga
        ON ccga.tenant_id = cc.tenant_id AND ccga.company_code_id = cc.id
       AND ccga.gl_account_id = ga.id
     WHERE cc.tenant_id = ${tenantId}::uuid AND lower(cc.code) = lower(${companyCode})
     ORDER BY ga.id, coa.code
  `.execute(db);

  const rows: GlControlRow[] = q.rows.map((r) => ({
    controlId:            r.control_id,
    glAccountId:          r.gl_account_id,
    accountCode:          r.account_code,
    accountName:          r.account_name,
    accountClass:         r.account_class,
    nodeType:             r.node_type,
    currencyCode:         r.currency_code,
    chartCode:            r.chart_code,
    normalBalance:        r.normal_balance,
    isPosting:            r.is_posting,
    hasCompanyControl:    r.has_control,
    postingAllowed:       r.posting_allowed,
    blockedForManual:     r.blocked_for_manual,
    blockedForAuto:       r.blocked_for_auto,
    requiresCostCenter:   r.requires_cost_center,
    requiresProfitCenter: r.requires_profit_center,
    requiresProject:      r.requires_project,
    reconciliationType:   r.reconciliation_type,
    taxCategory:          r.tax_category,
    defaultCostCenterId:  r.default_cost_center_id,
    defaultSiteId:        r.default_site_id,
    createdAt:            r.created_at,
    updatedAt:            r.updated_at,
  })).sort((a, b) => a.chartCode.localeCompare(b.chartCode) || a.accountCode.localeCompare(b.accountCode));

  const totalPostable = rows.length;
  const totalControlled = rows.filter((r) => r.hasCompanyControl).length;
  return {
    companyCode,
    totalPostable,
    totalControlled,
    coveragePct: totalPostable === 0 ? 100 : Math.round((totalControlled / totalPostable) * 100),
    rows,
  };
}


// ─── Chart Assignments ──────────────────────────────────────────────────────

export interface ChartAssignmentRow {
  assignmentId:       string;
  assignmentType:     string;     // 'operating' | 'reporting' | ...
  chartId:            string;
  chartCode:          string;
  chartName:          string;
  chartStatus:        string;
  status:             string;
  isPrimary:          boolean;
  effectiveFrom:      string | null;
  effectiveTo:        string | null;
  impactedAccountCount: number;
  updatedAt:          string | null;
}

export async function loadChartAssignments(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<ChartAssignmentRow[]> {
  const q = await sql<{
    id:                 string;
    assignment_type:    string;
    chart_id:           string;
    chart_code:         string;
    chart_name:         string;
    chart_status:       string;
    status:             string;
    is_primary:         boolean;
    effective_from:     string | null;
    effective_to:       string | null;
    impacted_account_count: number;
    updated_at:         string | null;
  }>`
    SELECT ccca.id,
           ccca.assignment_type,
           coa.id     AS chart_id,
           coa.code   AS chart_code,
           coa.name   AS chart_name,
           coa.status AS chart_status,
           ccca.status,
           ccca.is_primary,
           ccca.effective_from::text,
           ccca.effective_to::text,
           (SELECT count(*)::int FROM master.gl_account ga
             WHERE ga.tenant_id = ccca.tenant_id AND ga.chart_of_account_id = ccca.chart_of_account_id
               AND ga.status = 'active' AND ga.node_type = 'posting') AS impacted_account_count,
           ccca.updated_at::text
      FROM master.company_code_chart_assignment ccca
      JOIN master.chart_of_account coa ON coa.id = ccca.chart_of_account_id
      JOIN master.company_code cc
        ON cc.id = ccca.company_code_id
       AND cc.tenant_id = ${tenantId}::uuid
       AND cc.code = ${companyCode}
     WHERE ccca.tenant_id = ${tenantId}::uuid
     ORDER BY ccca.assignment_type, ccca.status = 'active' DESC, ccca.effective_from DESC NULLS LAST
  `.execute(db);
  return q.rows.map((r) => ({
    assignmentId:       r.id,
    assignmentType:     r.assignment_type,
    chartId:            r.chart_id,
    chartCode:          r.chart_code,
    chartName:          r.chart_name,
    chartStatus:        r.chart_status,
    status:             r.status,
    isPrimary:          r.is_primary,
    effectiveFrom:      r.effective_from,
    effectiveTo:        r.effective_to,
    impactedAccountCount: r.impacted_account_count,
    updatedAt:          r.updated_at,
  }));
}

export interface ChartOptionRow {
  chartId: string;
  code: string;
  name: string;
  framework: string | null;
  countryCode: string | null;
  version: number;
  status: string;
  postingAccountCount: number;
}

export async function loadChartOptions(db: AnyDb, tenantId: string): Promise<ChartOptionRow[]> {
  const { rows } = await sql<{
    id: string; code: string; name: string; framework: string | null;
    country_code: string | null; version: number; status: string; posting_account_count: number;
  }>`
    SELECT coa.id, coa.code, coa.name, coa.framework, coa.country_code, coa.version, coa.status,
           count(ga.id) FILTER (WHERE ga.status = 'active' AND ga.node_type = 'posting')::int AS posting_account_count
      FROM master.chart_of_account coa
      LEFT JOIN master.gl_account ga ON ga.tenant_id = coa.tenant_id AND ga.chart_of_account_id = coa.id
     WHERE coa.tenant_id = ${tenantId}::uuid
     GROUP BY coa.id
     ORDER BY coa.status = 'active' DESC, coa.code, coa.version DESC
  `.execute(db);
  return rows.map((row) => ({
    chartId: row.id, code: row.code, name: row.name, framework: row.framework,
    countryCode: row.country_code, version: row.version, status: row.status,
    postingAccountCount: row.posting_account_count,
  }));
}


// ─── Book Assignments (view over ledger_book + optional posting-key mask) ──

export interface BookAssignmentRow {
  assignmentId:     string;
  bookId:           string;
  bookCode:         string;
  bookName:         string;
  bookStatus:       string;
  assignmentStatus: string;
  isTenantDefault:  boolean;
  isCompanyDefault: boolean;
  baseCurrencyCode: string;
  overrideCurrencyCode: string | null;
  currencyCode:     string | null;
  currencySource:   "assignment_override" | "book_base";
  companyFunctionalCurrency: string | null;
  alternateCoaPrefix: string | null;
  effectiveFrom:    string;
  effectiveTo:      string | null;
  priority:         number;
  conflictStrategy: string;
  purpose:          string | null;
  isPostingEnabled: boolean;
  updatedAt:        string | null;
}

export async function loadBookAssignments(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<BookAssignmentRow[]> {
  const q = await sql<{
    assignment_id:    string;
    id:               string;
    code:             string;
    name:             string;
    book_status:      string;
    assignment_status:string;
    is_primary:       boolean;
    is_company_default:boolean;
    base_currency_code:string;
    override_currency_code:string | null;
    currency_code:    string | null;
    company_functional_currency:string | null;
    alternate_coa_prefix:string | null;
    effective_from:   string;
    effective_to:     string | null;
    priority:         number;
    conflict_strategy:string;
    purpose:          string | null;
    updated_at:       string | null;
    is_posting_enabled:boolean;
  }>`
    SELECT ba.id AS assignment_id, lb.id, lb.code, lb.name,
           lb.status AS book_status, ba.status AS assignment_status, lb.is_primary,
           (cc.default_ledger_book_id = ba.book_id) AS is_company_default,
           lb.base_currency_code, ba.override_currency_code,
           coalesce(ba.override_currency_code, lb.base_currency_code) AS currency_code,
           cc.functional_currency AS company_functional_currency,
           ba.alternate_coa_prefix, ba.effective_from::text, ba.effective_to::text,
           ba.priority, ba.conflict_strategy, lb.category AS purpose, ba.updated_at::text,
           (lb.status = 'active' AND ba.status = 'active' AND ba.effective_from <= CURRENT_DATE
             AND (ba.effective_to IS NULL OR ba.effective_to >= CURRENT_DATE)) AS is_posting_enabled
      FROM master.ledger_book lb
      JOIN master.company_code_book_assignment ba
        ON ba.book_id = lb.id
       AND ba.tenant_id = lb.tenant_id
      JOIN master.company_code cc
        ON cc.id = ba.company_code_id
       AND cc.tenant_id = ${tenantId}::uuid
       AND cc.code = ${companyCode}
     WHERE lb.tenant_id = ${tenantId}::uuid
     ORDER BY (cc.default_ledger_book_id = ba.book_id) DESC, ba.priority DESC, lb.code
  `.execute(db);
  return q.rows.map((r) => ({
    assignmentId:     r.assignment_id,
    bookId:           r.id,
    bookCode:         r.code,
    bookName:         r.name,
    bookStatus:       r.book_status,
    assignmentStatus: r.assignment_status,
    isTenantDefault:  r.is_primary,
    isCompanyDefault: r.is_company_default,
    baseCurrencyCode: r.base_currency_code,
    overrideCurrencyCode: r.override_currency_code,
    currencyCode:     r.currency_code,
    currencySource:   r.override_currency_code ? "assignment_override" : "book_base",
    companyFunctionalCurrency: r.company_functional_currency,
    alternateCoaPrefix: r.alternate_coa_prefix,
    effectiveFrom:    r.effective_from,
    effectiveTo:      r.effective_to,
    priority:         r.priority,
    conflictStrategy: r.conflict_strategy,
    purpose:          r.purpose,
    isPostingEnabled: r.is_posting_enabled,
    updatedAt:        r.updated_at,
  }));
}

export interface BookOptionRow {
  bookId: string; code: string; name: string; category: string;
  reportingStandard: string | null; baseCurrencyCode: string;
  isTenantDefault: boolean; status: string; assignedCompanyCount: number;
}

export async function loadBookOptions(db: AnyDb, tenantId: string): Promise<BookOptionRow[]> {
  const { rows } = await sql<{
    id: string; code: string; name: string; category: string; reporting_standard: string | null;
    base_currency_code: string; is_primary: boolean; status: string; assigned_company_count: number;
  }>`
    SELECT lb.id, lb.code, lb.name, lb.category, lb.reporting_standard,
           lb.base_currency_code, lb.is_primary, lb.status,
           count(ba.id) FILTER (WHERE ba.status = 'active')::int AS assigned_company_count
      FROM master.ledger_book lb
      LEFT JOIN master.company_code_book_assignment ba
        ON ba.tenant_id = lb.tenant_id AND ba.book_id = lb.id
     WHERE lb.tenant_id = ${tenantId}::uuid
     GROUP BY lb.id
     ORDER BY lb.status = 'active' DESC, lb.is_primary DESC, lb.code
  `.execute(db);
  return rows.map((row) => ({
    bookId: row.id, code: row.code, name: row.name, category: row.category,
    reportingStandard: row.reporting_standard, baseCurrencyCode: row.base_currency_code,
    isTenantDefault: row.is_primary, status: row.status, assignedCompanyCount: row.assigned_company_count,
  }));
}
