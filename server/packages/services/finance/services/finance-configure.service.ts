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
  }>`
    SELECT ccga.id                                     AS control_id,
           mv.gl_account_id,
           mv.account_code,
           mv.account_name,
           mv.account_class,
           mv.normal_balance,
           true                                       AS is_posting,
           (ccga.id IS NOT NULL)                      AS has_control,
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
      FROM master.mv_company_postable_account mv
      JOIN master.company_code cc
        ON cc.id = mv.company_code_id
       AND cc.tenant_id = ${tenantId}::uuid
       AND cc.code = ${companyCode}
      LEFT JOIN master.company_code_gl_account ccga
        ON ccga.company_code_id = mv.company_code_id
       AND ccga.gl_account_id   = mv.gl_account_id
     ORDER BY mv.account_code
  `.execute(db);

  const rows: GlControlRow[] = q.rows.map((r) => ({
    controlId:            r.control_id,
    glAccountId:          r.gl_account_id,
    accountCode:          r.account_code,
    accountName:          r.account_name,
    accountClass:         r.account_class,
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
  }));

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
           ccca.effective_to::text
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
  }));
}


// ─── Book Assignments (view over ledger_book + optional posting-key mask) ──

export interface BookAssignmentRow {
  bookId:           string;
  bookCode:         string;
  bookName:         string;
  status:           string;
  isPrimary:        boolean;
  currencyCode:     string | null;
  purpose:          string | null;
  isPostingEnabled: boolean;
}

export async function loadBookAssignments(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<BookAssignmentRow[]> {
  const q = await sql<{
    id:               string;
    code:             string;
    name:             string;
    status:           string;
    is_primary:       boolean;
    currency_code:    string | null;
    purpose:          string | null;
  }>`
    SELECT lb.id, lb.code, lb.name, lb.status, lb.is_primary,
           coalesce(ba.override_currency_code, lb.base_currency_code) AS currency_code,
           lb.category AS purpose
      FROM master.ledger_book lb
      JOIN master.company_code_book_assignment ba
        ON ba.book_id = lb.id
       AND ba.tenant_id = lb.tenant_id
      JOIN master.company_code cc
        ON cc.id = ba.company_code_id
       AND cc.tenant_id = ${tenantId}::uuid
       AND cc.code = ${companyCode}
     WHERE lb.tenant_id = ${tenantId}::uuid
     ORDER BY lb.is_primary DESC, lb.code
  `.execute(db);
  return q.rows.map((r) => ({
    bookId:           r.id,
    bookCode:         r.code,
    bookName:         r.name,
    status:           r.status,
    isPrimary:        r.is_primary,
    currencyCode:     r.currency_code,
    purpose:          r.purpose,
    isPostingEnabled: r.status === "active",
  }));
}
