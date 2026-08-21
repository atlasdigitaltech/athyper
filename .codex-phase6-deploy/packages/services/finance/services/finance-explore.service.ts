/**
 * Finance Setup — Explore workspace read models.
 *
 * All queries are read-only and scoped by (tenant_id, company_code). They power
 * the four tabs of the Explore workspace:
 *   • Chart Tree   → loadChartTree
 *   • GL Accounts  → loadGlAccountsList
 *   • Books        → loadBooksList
 *   • House Banks  → loadHouseBanksList (mixed-lifecycle discipline)
 *
 * DDL alignment (verified):
 *   - master.gl_account.node_type / metadata->>'_journal_postable' → postability
 *   - master.mv_company_postable_account → controls join
 *   - master.company_code_chart_assignment (assignment_type='operating')
 *   - master.bank_account_link.effective_until + owner_type='company_code'
 */

import { sql, type Kysely } from "kysely";
import { loadCompanyPostableAccounts } from "./is-company-postable-account.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;


// ─── Chart tree ─────────────────────────────────────────────────────────────

export interface ChartTreeNode {
  id:             string;
  parentId:       string | null;
  code:           string;
  name:           string;
  accountClass:   string;
  normalBalance:  string;
  nodeType:       string;         // 'posting' | 'header' | 'summary' | ...
  isPosting:      boolean;        // node_type='posting' AND metadata._journal_postable
  isActive:       boolean;
  status:         string;         // 'draft' | 'active' | 'inactive'
  levelNo:        number;
  hasCompanyControl: boolean;
  subledgerType:  string | null;
}

export interface ChartTreePayload {
  chartId:      string;
  chartCode:    string;
  chartName:    string;
  chartStatus:  string;
  assignmentStatus: string;
  totalNodes:   number;
  postingNodes: number;
  nodes:        ChartTreeNode[];
}

export async function loadChartTree(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<ChartTreePayload | null> {
  // Resolve the company's operating chart.
  const chartQ = await sql<{
    chart_id:          string;
    chart_code:        string;
    chart_name:        string;
    chart_status:      string;
    assignment_status: string;
  }>`
    SELECT coa.id      AS chart_id,
           coa.code    AS chart_code,
           coa.name    AS chart_name,
           coa.status  AS chart_status,
           ccca.status AS assignment_status
      FROM master.company_code_chart_assignment ccca
      JOIN master.chart_of_account coa ON coa.id = ccca.chart_of_account_id
      JOIN master.company_code cc
        ON cc.id = ccca.company_code_id
       AND cc.tenant_id = ${tenantId}::uuid
       AND cc.code = ${companyCode}
     WHERE ccca.tenant_id       = ${tenantId}::uuid
       AND ccca.assignment_type = 'operating'
     ORDER BY ccca.status = 'active' DESC, ccca.effective_from DESC NULLS LAST
     LIMIT 1
  `.execute(db);
  const chart = chartQ.rows[0];
  if (!chart) return null;

  const nodesQ = await sql<{
    id:               string;
    parent_id:        string | null;
    code:             string;
    name:             string;
    account_class:    string;
    normal_balance:   string;
    node_type:        string;
    is_active:        boolean;
    status:           string;
    level_no:         number;
    subledger_type:   string | null;
    posting_flag:     boolean;
    has_control:      boolean;
  }>`
    SELECT ga.id,
           ga.parent_id,
           ga.code,
           ga.name,
           ga.account_class,
           ga.normal_balance,
           ga.node_type,
           ga.is_active,
           ga.status,
           ga.level_no,
           ga.subledger_type,
           (ga.node_type = 'posting' AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true)
                                                                                            AS posting_flag,
           EXISTS (
             SELECT 1
               FROM master.company_code_gl_account ccga
               JOIN master.company_code cc
                 ON cc.id = ccga.company_code_id
                AND cc.tenant_id = ga.tenant_id
                AND cc.code = ${companyCode}
              WHERE ccga.gl_account_id = ga.id
           )                                                                                AS has_control
      FROM master.gl_account ga
     WHERE ga.tenant_id            = ${tenantId}::uuid
       AND ga.chart_of_account_id  = ${chart.chart_id}::uuid
     ORDER BY ga.code
  `.execute(db);

  const nodes: ChartTreeNode[] = nodesQ.rows.map((r) => ({
    id:                r.id,
    parentId:          r.parent_id,
    code:              r.code,
    name:              r.name,
    accountClass:      r.account_class,
    normalBalance:     r.normal_balance,
    nodeType:          r.node_type,
    isPosting:         r.posting_flag,
    isActive:          r.is_active,
    status:            r.status,
    levelNo:           r.level_no,
    hasCompanyControl: r.has_control,
    subledgerType:     r.subledger_type,
  }));

  return {
    chartId:          chart.chart_id,
    chartCode:        chart.chart_code,
    chartName:        chart.chart_name,
    chartStatus:      chart.chart_status,
    assignmentStatus: chart.assignment_status,
    totalNodes:       nodes.length,
    postingNodes:     nodes.filter((n) => n.isPosting).length,
    nodes,
  };
}


// ─── GL account list (flat) ─────────────────────────────────────────────────

export interface GlAccountRow {
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
  hasCompanyControl:    boolean;
}

export async function loadGlAccountsList(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<GlAccountRow[]> {
  // Delegates to the shared helper (uses mv_company_postable_account).
  return loadCompanyPostableAccounts(db, tenantId, companyCode);
}


// ─── Ledger books list ──────────────────────────────────────────────────────

export interface LedgerBookRow {
  bookId:            string;
  bookCode:          string;
  bookName:          string;
  status:            string;
  isPrimary:         boolean;
  currencyCode:      string | null;
  fiscalYearStart:   string | null;
  purpose:           string | null;
  createdAt:         string;
}

export async function loadBooksList(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<LedgerBookRow[]> {
  const q = await sql<{
    id:                 string;
    code:               string;
    name:               string;
    status:             string;
    is_primary:         boolean;
    currency_code:      string | null;
    fiscal_year_start:  string | null;
    purpose:            string | null;
    created_at:         string;
  }>`
    SELECT lb.id, lb.code, lb.name, lb.status, lb.is_primary,
           coalesce(ba.override_currency_code, lb.base_currency_code) AS currency_code,
           cc.fiscal_year_start_month::text AS fiscal_year_start,
           lb.category AS purpose,
           lb.created_at::text
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
    bookId:          r.id,
    bookCode:        r.code,
    bookName:        r.name,
    status:          r.status,
    isPrimary:       r.is_primary,
    currencyCode:    r.currency_code,
    fiscalYearStart: r.fiscal_year_start,
    purpose:         r.purpose,
    createdAt:       r.created_at,
  }));
}


// ─── House banks list ───────────────────────────────────────────────────────

export type HouseBankChipTone = "active" | "inactive" | "effective" | "expired" | "future";

export interface HouseBankRow {
  configId:           string;
  configStatus:       HouseBankChipTone;   // 'active' | 'inactive'
  partyId:            string;
  partyName:          string;
  partyStatus:        HouseBankChipTone;
  bankAccountId:      string;
  bankAccountLabel:   string;              // account_nickname || iban || account_no
  bankAccountStatus:  HouseBankChipTone;
  linkId:             string;
  linkStatus:         HouseBankChipTone;   // effective / expired / future
  effectiveFrom:      string;
  effectiveUntil:     string | null;
  usageType:          string;
  isDefaultDisbursement: boolean;
  isDefaultCollection:   boolean;
  glAccountCode:      string | null;
  isReady:            boolean;
  notReadyReasons:    string[];
}

export async function loadHouseBanksList(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<HouseBankRow[]> {
  const q = await sql<{
    config_id:                 string;
    config_active:             boolean;
    party_id:                  string;
    party_name:                string;
    party_active:              boolean;
    bank_account_id:           string;
    bank_account_label:        string;
    bank_account_active:       boolean;
    link_id:                   string;
    effective_from:            string;
    effective_until:           string | null;
    usage_type:                string;
    is_default_disbursement:   boolean;
    is_default_collection:     boolean;
    gl_account_code:           string | null;
  }>`
    SELECT bahc.id                              AS config_id,
           bahc.is_active                       AS config_active,
           bp.id                                AS party_id,
           bp.name                              AS party_name,
           bp.is_active                         AS party_active,
           ba.id                                AS bank_account_id,
           COALESCE(bahc.account_nickname, ba.iban, ba.account_number, ba.id::text)
                                                AS bank_account_label,
           ba.is_active                         AS bank_account_active,
           bal.id                               AS link_id,
           bal.effective_from::text             AS effective_from,
           bal.effective_until::text            AS effective_until,
           bahc.usage_type                      AS usage_type,
           bahc.is_default_disbursement,
           bahc.is_default_collection,
           ga.code                              AS gl_account_code
      FROM master.bank_account_house_config bahc
      JOIN master.bank_account_link bal
        ON bal.tenant_id       = bahc.tenant_id
       AND bal.id              = bahc.bank_account_link_id
       AND bal.owner_type      = 'company_code'
      JOIN master.company_code cc
        ON cc.id = bal.owner_id
       AND cc.tenant_id = ${tenantId}::uuid
       AND cc.code = ${companyCode}
      JOIN master.bank_account ba ON ba.id = bal.bank_account_id
      JOIN master.bank_party    bp ON bp.id = ba.bank_party_id
      LEFT JOIN master.gl_account ga ON ga.id = bahc.gl_account_id
     WHERE bahc.tenant_id = ${tenantId}::uuid
     ORDER BY bp.name, bahc.usage_type
  `.execute(db);

  const today = new Date().toISOString().slice(0, 10);
  return q.rows.map((r) => {
    const linkTone: HouseBankChipTone =
      r.effective_from > today ? "future"
        : r.effective_until && r.effective_until <= today ? "expired"
        : "effective";

    const notReady: string[] = [];
    if (!r.config_active)                   notReady.push("house_bank_config_inactive");
    if (!r.party_active)                    notReady.push("bank_party_inactive");
    if (!r.bank_account_active)             notReady.push("bank_account_inactive");
    if (linkTone !== "effective")           notReady.push(`bank_link_${linkTone}`);
    const isReady = notReady.length === 0;

    return {
      configId:               r.config_id,
      configStatus:           r.config_active ? "active" : "inactive",
      partyId:                r.party_id,
      partyName:              r.party_name,
      partyStatus:            r.party_active ? "active" : "inactive",
      bankAccountId:          r.bank_account_id,
      bankAccountLabel:       r.bank_account_label,
      bankAccountStatus:      r.bank_account_active ? "active" : "inactive",
      linkId:                 r.link_id,
      linkStatus:             linkTone,
      effectiveFrom:          r.effective_from,
      effectiveUntil:         r.effective_until,
      usageType:              r.usage_type,
      isDefaultDisbursement:  r.is_default_disbursement,
      isDefaultCollection:    r.is_default_collection,
      glAccountCode:          r.gl_account_code,
      isReady,
      notReadyReasons:        notReady,
    };
  });
}
