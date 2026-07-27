/**
 * Company-postable GL account predicate.
 *
 * Wraps master.mv_company_postable_account — the pre-computed set of GL accounts
 * postable per company. Used by finance-readiness, AP/AR runtime, and the setup
 * inspector; centralized here so the definition of "postable" cannot fork.
 *
 * MV canonical join (see 07_views.sql:457):
 *   company_code
 *     JOIN company_code_chart_assignment (assignment_type='operating', status='active')
 *     JOIN gl_account (is_active AND node_type='posting'
 *                      AND metadata._journal_postable = true)
 *     LEFT JOIN company_code_gl_account
 *   WHERE company_code.is_active AND ccga.posting_allowed <> false
 *
 * Refresh strategy: master.fn_refresh_mv_cpa() — called from Phase 2 mutation
 * paths. Phase 1 read-only paths accept cached data.
 */

import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface PostableAccountRow {
  glAccountId:          string;
  accountCode:          string;
  accountName:          string;
  accountClass:         string;
  normalBalance:        string;
  subledgerType:        string | null;
  postingAllowed:       boolean;
  blockedForManual:     boolean;
  blockedForAuto:       boolean;
  requiresCostCenter:   boolean;
  requiresProfitCenter: boolean;
  requiresProject:      boolean;
  /** True iff a company_code_gl_account row exists (indicates coverage). */
  hasCompanyControl:    boolean;
}

export interface PostableAccountSummary {
  totalPostableAccounts:  number;
  controlledAccounts:     number;
  blockedManualAccounts:  number;
  blockedAutoAccounts:    number;
  disallowedAccounts:     number;
  coveragePct:            number;
}

/**
 * Load all postable accounts for a company. Used by Explore workspace + inspector.
 */
export async function loadCompanyPostableAccounts(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<PostableAccountRow[]> {
  const { rows } = await sql<{
    gl_account_id:           string;
    account_code:            string;
    account_name:            string;
    account_class:           string;
    normal_balance:          string;
    subledger_type:          string | null;
    posting_allowed:         boolean;
    blocked_for_manual:      boolean;
    blocked_for_auto:        boolean;
    requires_cost_center:    boolean;
    requires_profit_center:  boolean;
    requires_project:        boolean;
    has_company_control:     boolean;
  }>`
    SELECT mv.gl_account_id,
           mv.account_code,
           mv.account_name,
           mv.account_class,
           mv.normal_balance,
           mv.subledger_type,
           mv.posting_allowed,
           mv.blocked_for_manual,
           mv.blocked_for_auto,
           mv.requires_cost_center,
           mv.requires_profit_center,
           mv.requires_project,
           (ccga.id IS NOT NULL) AS has_company_control
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

  return rows.map((r) => ({
    glAccountId:          r.gl_account_id,
    accountCode:          r.account_code,
    accountName:          r.account_name,
    accountClass:         r.account_class,
    normalBalance:        r.normal_balance,
    subledgerType:        r.subledger_type,
    postingAllowed:       r.posting_allowed,
    blockedForManual:     r.blocked_for_manual,
    blockedForAuto:       r.blocked_for_auto,
    requiresCostCenter:   r.requires_cost_center,
    requiresProfitCenter: r.requires_profit_center,
    requiresProject:      r.requires_project,
    hasCompanyControl:    r.has_company_control,
  }));
}

/**
 * Aggregate summary for the Hub / Configure coverage bar.
 */
export async function summarizeCompanyPostableAccounts(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<PostableAccountSummary> {
  const { rows } = await sql<{
    total:            number;
    controlled:       number;
    blocked_manual:   number;
    blocked_auto:     number;
    disallowed:       number;
  }>`
    SELECT
        count(*)::int                                                    AS total,
        count(*) FILTER (WHERE ccga.id IS NOT NULL)::int                 AS controlled,
        count(*) FILTER (WHERE ccga.blocked_for_manual = true)::int      AS blocked_manual,
        count(*) FILTER (WHERE ccga.blocked_for_auto = true)::int        AS blocked_auto,
        count(*) FILTER (WHERE ccga.posting_allowed = false)::int        AS disallowed
      FROM master.mv_company_postable_account mv
      JOIN master.company_code cc
        ON cc.id = mv.company_code_id
       AND cc.tenant_id = ${tenantId}::uuid
       AND cc.code = ${companyCode}
      LEFT JOIN master.company_code_gl_account ccga
        ON ccga.company_code_id = mv.company_code_id
       AND ccga.gl_account_id   = mv.gl_account_id
  `.execute(db);

  const row = rows[0] ?? { total: 0, controlled: 0, blocked_manual: 0, blocked_auto: 0, disallowed: 0 };
  const pct = row.total === 0 ? 100 : Math.round((row.controlled / row.total) * 100);
  return {
    totalPostableAccounts: row.total,
    controlledAccounts:    row.controlled,
    blockedManualAccounts: row.blocked_manual,
    blockedAutoAccounts:   row.blocked_auto,
    disallowedAccounts:    row.disallowed,
    coveragePct:           pct,
  };
}
