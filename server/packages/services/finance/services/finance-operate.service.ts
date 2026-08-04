/**
 * Finance Setup — Operate workspace read models.
 *
 * Triage view: reuses the readiness engine's conflicts + adds bank-recon
 * signals from document.bank_recon_case (soft-linked to house banks).
 *
 * All surfaces are read-only. No mutations.
 */

import { sql, type Kysely } from "kysely";
import {
  buildCompanyConflicts,
  type FinanceSetupConflict,
  type ConflictCategory,
} from "./finance-readiness.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;


// ─── Grouped blockers view ──────────────────────────────────────────────────

export interface BlockerGroup {
  category:      ConflictCategory;
  categoryLabel: string;
  count:         number;
  topReasonCode: string | null;
  conflicts:     FinanceSetupConflict[];
}

const CATEGORY_LABEL: Record<ConflictCategory, string> = {
  foundation: "Addresses & contacts",
  chart:      "Chart",
  book:       "Books",
  gl_control: "GL controls",
  posting_role: "Posting roles",
  house_bank: "House banks",
  period:     "Period",
  assignment: "Assignment",
};

export async function loadBlockersGrouped(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<BlockerGroup[]> {
  const conflicts = await buildCompanyConflicts(db, { tenantId, companyCode });
  const groups = new Map<ConflictCategory, FinanceSetupConflict[]>();
  for (const c of conflicts) {
    const bucket = groups.get(c.category) ?? [];
    bucket.push(c);
    groups.set(c.category, bucket);
  }
  const out: BlockerGroup[] = [];
  for (const [category, list] of groups) {
    out.push({
      category,
      categoryLabel: CATEGORY_LABEL[category] ?? category,
      count:         list.length,
      topReasonCode: list[0]?.reasonCode ?? null,
      conflicts:     list,
    });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}


// ─── Bank reconciliation signals ────────────────────────────────────────────

export interface ReconciliationSignal {
  bankAccountId:      string;
  bankAccountLabel:   string;
  openCases:          number;
  unmatchedLines:     number;
  lastStatementDate:  string | null;
  glAccountCode:      string | null;
  linkStatus:         "effective" | "expired" | "future";
}

export async function loadReconciliationSignals(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<ReconciliationSignal[]> {
  const today = new Date().toISOString().slice(0, 10);
  const q = await sql<{
    bank_account_id:     string;
    bank_account_label:  string;
    gl_account_code:     string | null;
    effective_from:      string;
    effective_until:     string | null;
    open_cases:          number;
    unmatched_lines:     number;
    last_statement_date: string | null;
  }>`
    SELECT ba.id                                                      AS bank_account_id,
           COALESCE(
             bahc.account_nickname,
             ba.name,
             ba.code,
             concat('••••', ba.account_last4)
           )
                                                                       AS bank_account_label,
           ga.code                                                     AS gl_account_code,
           bal.effective_from::text                                    AS effective_from,
           bal.effective_until::text                                   AS effective_until,
           COALESCE((
             SELECT count(*)::int FROM document.bank_recon_case brc
              WHERE brc.tenant_id = ba.tenant_id
                AND brc.bank_account_id = ba.id
                AND brc.status IN ('open','in_progress')
           ), 0)                                                       AS open_cases,
           COALESCE((
             SELECT count(*)::int FROM document.bank_statement_line bsl
              WHERE bsl.tenant_id = ba.tenant_id
                AND bsl.bank_account_id = ba.id
                AND bsl.match_status IN ('unmatched','partial')
           ), 0)                                                       AS unmatched_lines,
           (SELECT max(bs.statement_date::text)
              FROM document.bank_statement bs
             WHERE bs.tenant_id = ba.tenant_id
               AND bs.bank_account_id = ba.id)                          AS last_statement_date
      FROM master.bank_account_house_config bahc
      JOIN master.bank_account_link bal
        ON bal.tenant_id       = bahc.tenant_id
       AND bal.id              = bahc.bank_account_link_id
       AND bal.owner_type      = 'company_code'
      JOIN master.company_code cc
        ON cc.id = bal.owner_id
       AND cc.tenant_id = ${tenantId}::uuid
       AND cc.code = ${companyCode}
      JOIN master.bank_account ba
        ON ba.tenant_id = bal.tenant_id
       AND ba.id = bal.bank_account_id
      LEFT JOIN master.gl_account ga
        ON ga.tenant_id = bahc.tenant_id
       AND ga.id = bahc.gl_account_id
     WHERE bahc.tenant_id = ${tenantId}::uuid
     ORDER BY open_cases DESC, unmatched_lines DESC
  `.execute(db);

  return q.rows.map((r) => {
    const linkStatus: "effective" | "expired" | "future" =
      r.effective_from > today ? "future"
        : r.effective_until && r.effective_until <= today ? "expired"
        : "effective";
    return {
      bankAccountId:      r.bank_account_id,
      bankAccountLabel:   r.bank_account_label,
      openCases:          Number(r.open_cases),
      unmatchedLines:     Number(r.unmatched_lines),
      lastStatementDate:  r.last_statement_date,
      glAccountCode:      r.gl_account_code,
      linkStatus,
    };
  });
}
