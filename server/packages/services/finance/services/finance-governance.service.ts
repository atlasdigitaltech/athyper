import { createHash } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { loadPostingRoleCoverage } from "./posting-role.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface GovernanceCheckResult {
  handler: string;
  passed: boolean;
  summary: string;
  checkedAt: string;
  evidence: Record<string, unknown>;
  blockers: string[];
}

interface CheckContext {
  tenantId: string;
  runId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  domainData: Record<string, unknown>;
  handler: string;
}

interface ScalarEvidence {
  passed: boolean;
  summary: string;
  blockers?: string[];
  [key: string]: unknown;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

async function loadContext(db: AnyDb, tenantId: string, runId: string, taskId: string): Promise<CheckContext | null> {
  const { rows } = await sql<{
    entity_code: string;
    fiscal_year: number;
    period_number: number;
    domain_data: Record<string, unknown> | null;
    system_check_handler: string | null;
    completion_mode: string;
  }>`
    SELECT cr.entity_code, cr.fiscal_year, cr.period_number, cr.domain_data,
           tpl.system_check_handler, tpl.completion_mode
      FROM governance.cycle_task task
      JOIN governance.cycle_run cr
        ON cr.tenant_id = task.tenant_id AND cr.id = task.cycle_run_id
      JOIN governance.cycle_task_template tpl
        ON tpl.tenant_id = task.tenant_id AND tpl.id = task.template_id
     WHERE task.tenant_id = ${tenantId}::uuid
       AND task.cycle_run_id = ${runId}::uuid
       AND task.id = ${taskId}::uuid
  `.execute(db);
  const row = rows[0];
  if (!row || row.completion_mode === "MANUAL" || !row.system_check_handler) return null;
  return {
    tenantId,
    runId,
    entityCode: row.entity_code,
    fiscalYear: Number(row.fiscal_year),
    periodNumber: Number(row.period_number),
    domainData: row.domain_data ?? {},
    handler: row.system_check_handler,
  };
}

async function setupCheck(db: AnyDb, ctx: CheckContext): Promise<ScalarEvidence | null> {
  const company = await sql<{
    company_code_id: string;
    company_status: string;
    legal_entity_status: string;
    functional_currency: string | null;
    default_ledger_book_id: string | null;
    tax_jurisdiction_id: string | null;
  }>`
    SELECT cc.id AS company_code_id, cc.status AS company_status,
           le.status AS legal_entity_status, cc.functional_currency,
           cc.default_ledger_book_id, cc.tax_jurisdiction_id
      FROM master.company_code cc
      JOIN master.legal_entity le
        ON le.tenant_id = cc.tenant_id AND le.id = cc.legal_entity_id
     WHERE cc.tenant_id = ${ctx.tenantId}::uuid AND cc.code = ${ctx.entityCode}
  `.execute(db);
  const companyRow = company.rows[0];
  if (!companyRow) return { passed: false, summary: "Company was not found in the tenant.", blockers: ["company_not_found"] };

  const companyId = companyRow.company_code_id;
  switch (ctx.handler) {
    case "finance.setup.company_active":
      return { passed: companyRow.company_status === "active", summary: `Company status is ${companyRow.company_status}.`, companyStatus: companyRow.company_status };
    case "finance.setup.legal_entity_active":
      return { passed: companyRow.legal_entity_status === "active", summary: `Legal entity status is ${companyRow.legal_entity_status}.`, legalEntityStatus: companyRow.legal_entity_status };
    case "finance.setup.functional_currency_configured": {
      const { rows } = await sql<{ mismatches: number; assigned_books: number }>`
        SELECT count(*)::int AS assigned_books,
               count(*) FILTER (WHERE coalesce(a.override_currency_code, b.base_currency_code) IS DISTINCT FROM cc.functional_currency)::int AS mismatches
          FROM master.company_code cc
          LEFT JOIN master.company_code_book_assignment a
            ON a.tenant_id = cc.tenant_id AND a.company_code_id = cc.id AND a.status = 'active'
          LEFT JOIN master.ledger_book b
            ON b.tenant_id = a.tenant_id AND b.id = a.book_id AND b.status = 'active'
         WHERE cc.tenant_id = ${ctx.tenantId}::uuid AND cc.id = ${companyId}::uuid
         GROUP BY cc.functional_currency
      `.execute(db);
      const r = rows[0] ?? { mismatches: 0, assigned_books: 0 };
      const passed = Boolean(companyRow.functional_currency) && r.assigned_books > 0 && r.mismatches === 0;
      return { passed, summary: passed ? "Company and assigned books have a consistent functional currency." : "Functional currency is missing or inconsistent with an assigned book.", ...r, functionalCurrency: companyRow.functional_currency };
    }
    case "finance.setup.primary_book_assigned": {
      const { rows } = await sql<{ count: number }>`
        SELECT count(*)::int AS count
          FROM master.company_code_book_assignment a
          JOIN master.ledger_book b ON b.tenant_id = a.tenant_id AND b.id = a.book_id
         WHERE a.tenant_id = ${ctx.tenantId}::uuid AND a.company_code_id = ${companyId}::uuid
           AND a.status = 'active' AND b.status = 'active'
           AND (b.is_primary OR b.id = ${companyRow.default_ledger_book_id}::uuid)
      `.execute(db);
      const count = rows[0]?.count ?? 0;
      return { passed: count > 0, summary: count > 0 ? "An active primary ledger book is assigned." : "No active primary ledger book is assigned.", primaryBookCount: count };
    }
    case "finance.setup.fiscal_calendar_generated": {
      const { rows } = await sql<{ period_count: number; has_opening: boolean }>`
        SELECT count(*)::int AS period_count, bool_or(period_number = 0) AS has_opening
          FROM master.fiscal_period
         WHERE tenant_id = ${ctx.tenantId}::uuid AND company_code_id = ${companyId}::uuid
           AND fiscal_year = ${ctx.fiscalYear}
      `.execute(db);
      const r = rows[0] ?? { period_count: 0, has_opening: false };
      return { passed: r.period_count > 1 && r.has_opening, summary: `${r.period_count} fiscal periods are generated for FY ${ctx.fiscalYear}.`, ...r };
    }
    case "finance.setup.current_period_available": {
      const { rows } = await sql<{ fiscal_count: number; assigned_books: number; book_status_count: number }>`
        SELECT (SELECT count(*)::int FROM master.fiscal_period fp
                 WHERE fp.tenant_id = ${ctx.tenantId}::uuid AND fp.company_code_id = ${companyId}::uuid
                   AND fp.fiscal_year = ${ctx.fiscalYear} AND fp.period_number = ${ctx.periodNumber}) AS fiscal_count,
               (SELECT count(*)::int FROM master.company_code_book_assignment a
                 WHERE a.tenant_id = ${ctx.tenantId}::uuid AND a.company_code_id = ${companyId}::uuid AND a.status = 'active') AS assigned_books,
               (SELECT count(*)::int FROM governance.book_period_status bps
                 WHERE bps.tenant_id = ${ctx.tenantId}::uuid AND bps.company_code_id = ${companyId}::uuid
                   AND bps.fiscal_year = ${ctx.fiscalYear} AND bps.period_number = ${ctx.periodNumber}) AS book_status_count
      `.execute(db);
      const r = rows[0]!;
      const passed = r.fiscal_count === 1 && r.assigned_books > 0 && r.book_status_count === r.assigned_books;
      return { passed, summary: passed ? "Current fiscal and all assigned book periods exist." : "Current fiscal period or one or more assigned book-period gates are missing.", ...r };
    }
    case "finance.setup.chart_assigned": {
      const { rows } = await sql<{ count: number }>`
        SELECT count(*)::int AS count FROM master.company_code_chart_assignment
         WHERE tenant_id = ${ctx.tenantId}::uuid AND company_code_id = ${companyId}::uuid AND status = 'active'
           AND effective_from <= current_date AND (effective_to IS NULL OR effective_to >= current_date)
      `.execute(db);
      const count = rows[0]?.count ?? 0;
      return { passed: count > 0, summary: count > 0 ? "An active Chart of Accounts is assigned." : "No effective Chart of Accounts assignment exists.", assignmentCount: count };
    }
    case "finance.setup.gl_controls_complete": {
      const { rows } = await sql<{ active_count: number; postable_count: number }>`
        SELECT count(*) FILTER (WHERE ccga.status = 'active')::int AS active_count,
               count(*) FILTER (WHERE ccga.status = 'active' AND mv.is_postable)::int AS postable_count
          FROM master.company_code_gl_account ccga
          LEFT JOIN master.mv_company_postable_account mv
            ON mv.tenant_id = ccga.tenant_id AND mv.company_code_id = ccga.company_code_id
           AND mv.gl_account_id = ccga.gl_account_id
         WHERE ccga.tenant_id = ${ctx.tenantId}::uuid AND ccga.company_code_id = ${companyId}::uuid
      `.execute(db);
      const r = rows[0] ?? { active_count: 0, postable_count: 0 };
      const passed = r.active_count > 0 && r.active_count === r.postable_count;
      return { passed, summary: passed ? "All active company GL controls resolve as postable." : "Company GL activation is empty or contains non-postable controls.", ...r };
    }
    case "finance.setup.posting_roles_mapped": {
      const coverage = await loadPostingRoleCoverage(db, ctx.tenantId, ctx.entityCode);
      return { passed: coverage.summary.ready, summary: `${coverage.summary.resolvedCells}/${coverage.summary.requiredCells} mandatory posting-role cells resolve.`, coverage: coverage.summary };
    }
    case "finance.setup.house_bank_configured":
    case "finance.setup.bank_account_linked": {
      const { rows } = await sql<{ link_count: number; house_config_count: number }>`
        SELECT count(DISTINCT bal.id)::int AS link_count,
               count(DISTINCT hc.id)::int AS house_config_count
          FROM master.bank_account_link bal
          JOIN master.bank_account ba ON ba.tenant_id = bal.tenant_id AND ba.id = bal.bank_account_id
          LEFT JOIN master.bank_account_house_config hc
            ON hc.tenant_id = bal.tenant_id AND hc.bank_account_link_id = bal.id AND hc.status = 'active'
         WHERE bal.tenant_id = ${ctx.tenantId}::uuid AND bal.owner_type = 'company_code'
           AND bal.owner_id = ${companyId}::uuid AND ba.status = 'active'
           AND bal.effective_from <= current_date AND (bal.effective_until IS NULL OR bal.effective_until >= current_date)
      `.execute(db);
      const r = rows[0] ?? { link_count: 0, house_config_count: 0 };
      const passed = ctx.handler.endsWith("house_bank_configured") ? r.house_config_count > 0 : r.link_count > 0;
      return { passed, summary: `${r.link_count} active company bank link(s), ${r.house_config_count} house-bank configuration(s).`, ...r };
    }
    case "finance.setup.payment_methods_configured": {
      const { rows } = await sql<{ count: number }>`
        SELECT count(*)::int AS count FROM control.payment_method_company_policy
         WHERE tenant_id = ${ctx.tenantId}::uuid AND company_code_id = ${companyId}::uuid AND status = 'active'
           AND effective_from <= current_date AND (effective_until IS NULL OR effective_until >= current_date)
      `.execute(db);
      const count = rows[0]?.count ?? 0;
      return { passed: count > 0, summary: `${count} effective company payment method policy record(s).`, policyCount: count };
    }
    case "finance.setup.tax_groups_valid": {
      const { rows } = await sql<{ active_groups: number; invalid_groups: number }>`
        SELECT count(DISTINCT tg.id)::int AS active_groups,
               count(DISTINCT tg.id) FILTER (WHERE trs.id IS NULL)::int AS invalid_groups
          FROM control.tax_group tg
          LEFT JOIN control.tax_group_component tgc
            ON tgc.tenant_id = tg.tenant_id AND tgc.tax_group_id = tg.id AND tgc.status = 'active'
          LEFT JOIN control.tax_rate_schedule trs
            ON trs.tenant_id = tgc.tenant_id AND trs.id = tgc.tax_rate_schedule_id AND trs.status = 'active'
           AND trs.effective_from <= current_date AND (trs.effective_to IS NULL OR trs.effective_to >= current_date)
         WHERE tg.tenant_id = ${ctx.tenantId}::uuid AND tg.status = 'active'
           AND (${companyRow.tax_jurisdiction_id}::uuid IS NULL OR tg.jurisdiction_id IS NULL OR tg.jurisdiction_id = ${companyRow.tax_jurisdiction_id}::uuid)
      `.execute(db);
      const r = rows[0] ?? { active_groups: 0, invalid_groups: 0 };
      const passed = r.active_groups > 0 && r.invalid_groups === 0;
      return { passed, summary: `${r.active_groups} applicable active tax group(s); ${r.invalid_groups} without a currently effective rate.`, ...r };
    }
    case "finance.setup.opening_balance_certified": {
      const { rows } = await sql<{ certification_id: string | null; status: string | null }>`
        SELECT cert.id AS certification_id, cert.status
          FROM governance.cycle_certification cert
          JOIN governance.cycle_run cr ON cr.tenant_id = cert.tenant_id AND cr.id = cert.cycle_run_id
          JOIN governance.cycle_type ct ON ct.tenant_id = cr.tenant_id AND ct.id = cr.cycle_type_id
         WHERE cert.tenant_id = ${ctx.tenantId}::uuid AND cr.entity_code = ${ctx.entityCode}
           AND cr.fiscal_year = ${ctx.fiscalYear} AND cr.period_number = 0
           AND ct.type_code IN ('OPENING_BALANCE_MIGRATION', 'OPENING_BALANCE')
           AND cert.cert_code = 'OPEN_BAL_FINAL'
         ORDER BY cert.cert_version DESC LIMIT 1
      `.execute(db);
      const r = rows[0];
      return { passed: r?.status === "ATTESTED", summary: r ? `OPEN_BAL_FINAL is ${r.status}.` : "OPEN_BAL_FINAL certification is absent.", certificationId: r?.certification_id ?? null, certificationStatus: r?.status ?? null };
    }
    case "finance.setup.period_0_closed":
    case "finance.setup.current_period_open": {
      const period = ctx.handler.endsWith("period_0_closed") ? 0 : ctx.periodNumber;
      const expected = ctx.handler.endsWith("period_0_closed") ? "hard_close" : "open";
      const { rows } = await sql<{ fiscal_status: string | null; assigned_books: number; matching_books: number }>`
        SELECT (SELECT status FROM master.fiscal_period fp
                 WHERE fp.tenant_id = ${ctx.tenantId}::uuid AND fp.company_code_id = ${companyId}::uuid
                   AND fp.fiscal_year = ${ctx.fiscalYear} AND fp.period_number = ${period}) AS fiscal_status,
               (SELECT count(*)::int FROM master.company_code_book_assignment a
                 WHERE a.tenant_id = ${ctx.tenantId}::uuid AND a.company_code_id = ${companyId}::uuid AND a.status = 'active') AS assigned_books,
               (SELECT count(*)::int FROM governance.book_period_status bps
                 WHERE bps.tenant_id = ${ctx.tenantId}::uuid AND bps.company_code_id = ${companyId}::uuid
                   AND bps.fiscal_year = ${ctx.fiscalYear} AND bps.period_number = ${period} AND bps.status = ${expected}) AS matching_books
      `.execute(db);
      const r = rows[0]!;
      const passed = r.fiscal_status === expected && r.assigned_books > 0 && r.matching_books === r.assigned_books;
      return { passed, summary: `Fiscal period ${period} is ${r.fiscal_status ?? "missing"}; ${r.matching_books}/${r.assigned_books} book gates are ${expected}.`, ...r, expectedStatus: expected };
    }
    case "finance.setup.no_critical_deviations": {
      const { rows } = await sql<{ count: number }>`
        SELECT count(*)::int AS count FROM governance.cycle_deviation
         WHERE tenant_id = ${ctx.tenantId}::uuid AND cycle_run_id = ${ctx.runId}::uuid AND severity = 'CRITICAL'
           AND status NOT IN ('RESOLVED','REJECTED','EXPIRED','REVOKED')
      `.execute(db);
      const count = rows[0]?.count ?? 0;
      return { passed: count === 0, summary: `${count} unresolved critical readiness deviation(s).`, criticalDeviationCount: count };
    }
    default:
      return null;
  }
}

async function openingBalanceCheck(db: AnyDb, ctx: CheckContext): Promise<ScalarEvidence | null> {
  const importIds = stringArray(ctx.domainData["import_request_ids"]);
  if (ctx.handler === "finance.opening_balance.source_validated") {
    if (importIds.length === 0) return { passed: false, summary: "No import requests are linked to the cycle.", blockers: ["import_request_ids_missing"] };
    const { rows } = await sql<{ request_count: number; completed_count: number; error_count: number; failed_chunks: number }>`
      SELECT count(DISTINCT ir.id)::int AS request_count,
             count(DISTINCT ir.id) FILTER (WHERE ir.status = 'completed')::int AS completed_count,
             coalesce(sum(ir.error_count), 0)::int AS error_count,
             count(DISTINCT chunk.id) FILTER (WHERE chunk.status <> 'completed' OR chunk.error_count > 0)::int AS failed_chunks
        FROM document.import_request ir
        LEFT JOIN document.import_request_chunk chunk
          ON chunk.tenant_id = ir.tenant_id AND chunk.import_request_id = ir.id
       WHERE ir.tenant_id = ${ctx.tenantId}::uuid AND ir.id = ANY(${sql.val(importIds)}::uuid[])
    `.execute(db);
    const r = rows[0]!;
    const passed = r.request_count === importIds.length && r.completed_count === importIds.length && r.error_count === 0 && r.failed_chunks === 0;
    return { passed, summary: `${r.completed_count}/${importIds.length} imports completed; ${r.error_count} row error(s), ${r.failed_chunks} failed/incomplete chunk(s).`, importRequestIds: importIds, ...r };
  }
  if (ctx.handler === "finance.opening_balance.period_0_open") {
    const { rows } = await sql<{ fiscal_status: string | null; assigned_books: number; open_books: number }>`
      SELECT (SELECT fp.status FROM master.fiscal_period fp JOIN master.company_code cc ON cc.id = fp.company_code_id
               WHERE fp.tenant_id = ${ctx.tenantId}::uuid AND cc.code = ${ctx.entityCode}
                 AND fp.fiscal_year = ${ctx.fiscalYear} AND fp.period_number = 0) AS fiscal_status,
             (SELECT count(*)::int FROM master.company_code_book_assignment a JOIN master.company_code cc ON cc.id = a.company_code_id
               WHERE a.tenant_id = ${ctx.tenantId}::uuid AND cc.code = ${ctx.entityCode} AND a.status = 'active') AS assigned_books,
             (SELECT count(*)::int FROM governance.book_period_status bps JOIN master.company_code cc ON cc.id = bps.company_code_id
               WHERE bps.tenant_id = ${ctx.tenantId}::uuid AND cc.code = ${ctx.entityCode}
                 AND bps.fiscal_year = ${ctx.fiscalYear} AND bps.period_number = 0 AND bps.status = 'open') AS open_books
    `.execute(db);
    const r = rows[0]!;
    return { passed: r.fiscal_status === "open" && r.assigned_books > 0 && r.open_books === r.assigned_books, summary: `Period 0 is ${r.fiscal_status ?? "missing"}; ${r.open_books}/${r.assigned_books} book gates are open.`, ...r };
  }
  if (ctx.handler === "finance.opening_balance.journals_posted") {
    const { rows } = await sql<{ journal_count: number; posted_count: number; total_debit: string; total_credit: string }>`
      SELECT count(*)::int AS journal_count, count(*) FILTER (WHERE je.status = 'posted')::int AS posted_count,
             coalesce(sum(je.total_debit), 0)::text AS total_debit, coalesce(sum(je.total_credit), 0)::text AS total_credit
        FROM document.journal_entry je JOIN master.company_code cc ON cc.id = je.company_code_id
       WHERE je.tenant_id = ${ctx.tenantId}::uuid AND cc.code = ${ctx.entityCode}
         AND je.fiscal_year = ${ctx.fiscalYear} AND je.period_number = 0 AND je.source_doc_type = 'opening_balance'
         AND (${sql.val(importIds)}::uuid[] = '{}'::uuid[] OR je.source_doc_id = ANY(${sql.val(importIds)}::uuid[]))
    `.execute(db);
    const r = rows[0]!;
    const passed = r.journal_count > 0 && r.journal_count === r.posted_count && r.total_debit === r.total_credit;
    return { passed, summary: `${r.posted_count}/${r.journal_count} opening journal(s) posted; debit ${r.total_debit}, credit ${r.total_credit}.`, ...r, importRequestIds: importIds };
  }
  if (ctx.handler === "finance.opening_balance.evidence_pack_generated") {
    const { rows } = await sql<{ id: string; status: string; storage_key: string | null }>`
      SELECT id, status, storage_key FROM governance.report_pack
       WHERE tenant_id = ${ctx.tenantId}::uuid AND cycle_run_id = ${ctx.runId}::uuid
       ORDER BY created_at DESC LIMIT 1
    `.execute(db);
    const r = rows[0];
    return { passed: r?.status === "ready" && Boolean(r.storage_key), summary: r ? `Latest evidence pack is ${r.status}.` : "No evidence pack has been requested.", reportPackId: r?.id ?? null, reportPackStatus: r?.status ?? null, storageKey: r?.storage_key ?? null };
  }
  return null;
}

async function commonCloseCheck(db: AnyDb, ctx: CheckContext): Promise<ScalarEvidence | null> {
  if (ctx.handler === "finance.period.open_current_month") {
    const { rows } = await sql<{ fiscal_status: string | null; assigned_books: number; open_books: number }>`
      SELECT (SELECT fp.status FROM master.fiscal_period fp JOIN master.company_code cc ON cc.id = fp.company_code_id
               WHERE fp.tenant_id = ${ctx.tenantId}::uuid AND cc.code = ${ctx.entityCode}
                 AND fp.fiscal_year = ${ctx.fiscalYear} AND fp.period_number = ${ctx.periodNumber}) AS fiscal_status,
             (SELECT count(*)::int FROM master.company_code_book_assignment a JOIN master.company_code cc ON cc.id = a.company_code_id
               WHERE a.tenant_id = ${ctx.tenantId}::uuid AND cc.code = ${ctx.entityCode} AND a.status = 'active') AS assigned_books,
             (SELECT count(*)::int FROM governance.book_period_status bps JOIN master.company_code cc ON cc.id = bps.company_code_id
               WHERE bps.tenant_id = ${ctx.tenantId}::uuid AND cc.code = ${ctx.entityCode}
                 AND bps.fiscal_year = ${ctx.fiscalYear} AND bps.period_number = ${ctx.periodNumber} AND bps.status = 'open') AS open_books
    `.execute(db);
    const r = rows[0]!;
    const passed = r.fiscal_status === "open" && r.assigned_books > 0 && r.open_books === r.assigned_books;
    return { passed, summary: `Current period is ${r.fiscal_status ?? "missing"}; ${r.open_books}/${r.assigned_books} book gates are open.`, ...r };
  }
  if (ctx.handler === "finance.period.prior_period_ready") {
    const { rows } = await sql<{ prior_period: number | null; fiscal_status: string | null; assigned_books: number; ready_books: number }>`
      WITH company AS (
        SELECT id FROM master.company_code WHERE tenant_id = ${ctx.tenantId}::uuid AND code = ${ctx.entityCode}
      ), prior AS (
        SELECT max(period_number)::int AS period_number FROM master.fiscal_period fp, company
         WHERE fp.tenant_id = ${ctx.tenantId}::uuid AND fp.company_code_id = company.id
           AND fp.fiscal_year = ${ctx.fiscalYear} AND fp.period_number < ${ctx.periodNumber}
      )
      SELECT prior.period_number AS prior_period,
             (SELECT status FROM master.fiscal_period fp, company
               WHERE fp.tenant_id = ${ctx.tenantId}::uuid AND fp.company_code_id = company.id
                 AND fp.fiscal_year = ${ctx.fiscalYear} AND fp.period_number = prior.period_number) AS fiscal_status,
             (SELECT count(*)::int FROM master.company_code_book_assignment a, company
               WHERE a.tenant_id = ${ctx.tenantId}::uuid AND a.company_code_id = company.id AND a.status = 'active') AS assigned_books,
             (SELECT count(*)::int FROM governance.book_period_status bps, company
               WHERE bps.tenant_id = ${ctx.tenantId}::uuid AND bps.company_code_id = company.id
                 AND bps.fiscal_year = ${ctx.fiscalYear} AND bps.period_number = prior.period_number
                 AND bps.status IN ('soft_close','hard_close')) AS ready_books
        FROM prior
    `.execute(db);
    const r = rows[0]!;
    const passed = r.prior_period !== null && ["soft_close", "hard_close"].includes(r.fiscal_status ?? "")
      && r.assigned_books > 0 && r.ready_books === r.assigned_books;
    return { passed, summary: r.prior_period === null ? "No prior fiscal period exists." : `Prior period ${r.prior_period} is ${r.fiscal_status ?? "missing"}; ${r.ready_books}/${r.assigned_books} book gates are close-ready.`, ...r };
  }
  if (ctx.handler === "finance.integrations.queue_clear") {
    const { rows } = await sql<{ unresolved: number; failed: number; dead_letter: number }>`
      SELECT count(*) FILTER (WHERE status IN ('pending','processing','failed','dead_letter'))::int AS unresolved,
             count(*) FILTER (WHERE status = 'failed')::int AS failed,
             count(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter
        FROM event.outbox
       WHERE tenant_id = ${ctx.tenantId}::uuid AND topic IN ('fin','finance')
         AND created_at <= (SELECT fp.end_date + interval '1 day' FROM master.fiscal_period fp
                             JOIN master.company_code cc ON cc.id = fp.company_code_id
                            WHERE fp.tenant_id = ${ctx.tenantId}::uuid AND cc.code = ${ctx.entityCode}
                              AND fp.fiscal_year = ${ctx.fiscalYear} AND fp.period_number = ${ctx.periodNumber})
    `.execute(db);
    const r = rows[0]!;
    return { passed: r.unresolved === 0, summary: `${r.unresolved} unresolved finance queue item(s), including ${r.failed} failed and ${r.dead_letter} dead-lettered.`, ...r };
  }
  if (ctx.handler === "finance.cross_book.derivations_complete") {
    const { rows } = await sql<{
      total: number; pending: number; processing: number; completed: number;
      suppressed: number; failed: number; queued_events: number; dead_events: number;
    }>`
      WITH company AS (
        SELECT id FROM master.company_code WHERE tenant_id = ${ctx.tenantId}::uuid AND code = ${ctx.entityCode}
      ), period_sources AS (
        SELECT je.id FROM document.journal_entry je, company
         WHERE je.tenant_id = ${ctx.tenantId}::uuid AND je.company_code_id = company.id
           AND je.fiscal_year = ${ctx.fiscalYear} AND je.period_number = ${ctx.periodNumber}
           AND je.status = 'posted' AND je.derived_from_je_id IS NULL AND je.posting_rule_id IS NULL
      )
      SELECT count(DISTINCT d.id)::int AS total,
             count(DISTINCT d.id) FILTER (WHERE d.status = 'pending')::int AS pending,
             count(DISTINCT d.id) FILTER (WHERE d.status = 'processing')::int AS processing,
             count(DISTINCT d.id) FILTER (WHERE d.status = 'completed')::int AS completed,
             count(DISTINCT d.id) FILTER (WHERE d.status = 'suppressed')::int AS suppressed,
             count(DISTINCT d.id) FILTER (WHERE d.status = 'failed')::int AS failed,
             count(DISTINCT outbox.id) FILTER (WHERE outbox.status IN ('pending','processing','failed'))::int AS queued_events,
             count(DISTINCT outbox.id) FILTER (WHERE outbox.status = 'dead_letter')::int AS dead_events
        FROM period_sources source
        LEFT JOIN document.book_posting_derivation d
          ON d.tenant_id = ${ctx.tenantId}::uuid AND d.source_journal_id = source.id
        LEFT JOIN event.outbox outbox
          ON outbox.tenant_id = ${ctx.tenantId}::uuid AND outbox.event_key = 'cross-book:' || source.id::text
    `.execute(db);
    const r = rows[0]!;
    const passed = r.pending === 0 && r.processing === 0 && r.failed === 0 && r.queued_events === 0 && r.dead_events === 0;
    return {
      passed,
      summary: `${r.completed} completed, ${r.suppressed} suppressed, ${r.pending} pending, ${r.failed} failed cross-book derivation(s); ${r.queued_events} queued and ${r.dead_events} dead-letter event(s).`,
      ...r,
    };
  }
  if (ctx.handler === "finance.bank.statement_import_complete") {
    const { rows } = await sql<{ linked_accounts: number; covered_accounts: number }>`
      WITH scope AS (
        SELECT cc.id AS company_id, fp.end_date
          FROM master.company_code cc JOIN master.fiscal_period fp ON fp.company_code_id = cc.id AND fp.tenant_id = cc.tenant_id
         WHERE cc.tenant_id = ${ctx.tenantId}::uuid AND cc.code = ${ctx.entityCode}
           AND fp.fiscal_year = ${ctx.fiscalYear} AND fp.period_number = ${ctx.periodNumber}
      ), linked AS (
        SELECT DISTINCT bal.bank_account_id, scope.end_date
          FROM scope JOIN master.bank_account_link bal ON bal.tenant_id = ${ctx.tenantId}::uuid
           AND bal.owner_type = 'company_code' AND bal.owner_id = scope.company_id
         WHERE bal.effective_from <= scope.end_date AND (bal.effective_until IS NULL OR bal.effective_until >= scope.end_date)
      )
      SELECT count(*)::int AS linked_accounts,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM document.bank_statement bs
                WHERE bs.tenant_id = ${ctx.tenantId}::uuid AND bs.bank_account_id = linked.bank_account_id
                  AND bs.period_end_date >= linked.end_date
             ))::int AS covered_accounts
        FROM linked
    `.execute(db);
    const r = rows[0]!;
    return { passed: r.covered_accounts === r.linked_accounts, summary: `${r.covered_accounts}/${r.linked_accounts} linked bank account(s) have statements through period end.`, ...r };
  }
  if (ctx.handler === "finance.gl.fx_revaluation_complete") {
    const { rows } = await sql<{ exposure_books: number; posted_books: number }>`
      WITH company AS (
        SELECT id, functional_currency FROM master.company_code
         WHERE tenant_id = ${ctx.tenantId}::uuid AND code = ${ctx.entityCode}
      ), exposure AS (
        SELECT DISTINCT b.book_id FROM ledger.gl_balance b, company
         WHERE b.tenant_id = ${ctx.tenantId}::uuid AND b.company_code_id = company.id
           AND b.fiscal_year = ${ctx.fiscalYear} AND b.period_number = ${ctx.periodNumber}
           AND b.currency_code <> company.functional_currency
           AND (b.opening_debit + b.opening_credit + b.period_debit + b.period_credit) <> 0
      )
      SELECT (SELECT count(*)::int FROM exposure) AS exposure_books,
             count(DISTINCT run.book_id) FILTER (WHERE run.status = 'posted')::int AS posted_books
        FROM document.fx_revaluation_run run, company
       WHERE run.tenant_id = ${ctx.tenantId}::uuid AND run.company_code_id = company.id
         AND run.fiscal_year = ${ctx.fiscalYear} AND run.period_number = ${ctx.periodNumber}
         AND run.book_id IN (SELECT book_id FROM exposure)
    `.execute(db);
    const r = rows[0]!;
    const passed = r.exposure_books === 0 || r.posted_books === r.exposure_books;
    return { passed, summary: r.exposure_books === 0 ? "No foreign-currency balance exposure requires revaluation." : `${r.posted_books}/${r.exposure_books} exposed book(s) have posted FX revaluation runs.`, ...r };
  }
  if (["finance.reporting.trial_balance_validated", "finance.year_end.final_trial_balance_validated", "finance.subledger.gl_tieout"].includes(ctx.handler)) {
    const { rows } = await sql<{ total_debit: string; total_credit: string; row_count: number }>`
      SELECT coalesce(sum(opening_debit + period_debit), 0)::text AS total_debit,
             coalesce(sum(opening_credit + period_credit), 0)::text AS total_credit,
             count(*)::int AS row_count
        FROM ledger.gl_balance b JOIN master.company_code cc ON cc.id = b.company_code_id
       WHERE b.tenant_id = ${ctx.tenantId}::uuid AND cc.code = ${ctx.entityCode}
         AND b.fiscal_year = ${ctx.fiscalYear}
         AND (${ctx.handler === "finance.year_end.final_trial_balance_validated"} OR b.period_number = ${ctx.periodNumber})
    `.execute(db);
    const r = rows[0]!;
    return { passed: r.row_count > 0 && r.total_debit === r.total_credit, summary: `Trial balance debit ${r.total_debit}, credit ${r.total_credit}, across ${r.row_count} balance row(s).`, ...r };
  }
  if (ctx.handler === "finance.year_end.hard_close_lock_verified" || ctx.handler === "finance.period.soft_close_controls_active") {
    const expected = ctx.handler.includes("hard_close") ? "hard_close" : "soft_close";
    const { rows } = await sql<{ fiscal_count: number; book_count: number; mismatch_count: number }>`
      SELECT count(DISTINCT fp.id)::int AS fiscal_count, count(DISTINCT bps.id)::int AS book_count,
             (count(DISTINCT fp.id) FILTER (WHERE fp.status <> ${expected}) + count(DISTINCT bps.id) FILTER (WHERE bps.status <> ${expected}))::int AS mismatch_count
        FROM master.fiscal_period fp
        JOIN master.company_code cc ON cc.id = fp.company_code_id
        LEFT JOIN governance.book_period_status bps
          ON bps.tenant_id = fp.tenant_id AND bps.company_code_id = fp.company_code_id
         AND bps.fiscal_year = fp.fiscal_year AND bps.period_number = fp.period_number
       WHERE fp.tenant_id = ${ctx.tenantId}::uuid AND cc.code = ${ctx.entityCode}
         AND fp.fiscal_year = ${ctx.fiscalYear}
         AND (${ctx.handler === "finance.year_end.hard_close_lock_verified"} OR fp.period_number = ${ctx.periodNumber})
    `.execute(db);
    const r = rows[0]!;
    return { passed: r.fiscal_count > 0 && r.book_count > 0 && r.mismatch_count === 0, summary: `${r.fiscal_count} fiscal and ${r.book_count} book-period record(s) checked; ${r.mismatch_count} status mismatch(es).`, ...r, expectedStatus: expected };
  }
  return null;
}

export async function evaluateFinanceGovernanceTask(
  db: AnyDb,
  input: { tenantId: string; runId: string; taskId: string },
): Promise<GovernanceCheckResult | null> {
  const ctx = await loadContext(db, input.tenantId, input.runId, input.taskId);
  if (!ctx) return null;
  const raw = await setupCheck(db, ctx) ?? await openingBalanceCheck(db, ctx) ?? await commonCloseCheck(db, ctx) ?? {
    passed: false,
    summary: `No executable implementation is registered for ${ctx.handler}.`,
    blockers: ["handler_not_implemented"],
  };
  const { passed, summary, blockers = [], ...evidence } = raw;
  return {
    handler: ctx.handler,
    passed,
    summary,
    checkedAt: new Date().toISOString(),
    evidence,
    blockers,
  };
}

export function hashCertificationSnapshot(snapshot: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export async function resolvePostingReadinessGate(
  db: AnyDb,
  tenantId: string,
  companyCodeId: string,
): Promise<{ enabled: boolean; certified: boolean; certificationId: string | null }> {
  const { rows } = await sql<{ enabled: boolean; certification_id: string | null }>`
    SELECT coalesce(
             CASE WHEN ff.tenant_overrides ? ${tenantId}
                  THEN (ff.tenant_overrides ->> ${tenantId})::boolean
                  ELSE ff.is_enabled END,
             false
           ) AS enabled,
           cert.id AS certification_id
      FROM (SELECT 1) seed
      LEFT JOIN control.feature_flag ff ON ff.code = 'finance.posting_readiness_gate'
      LEFT JOIN master.company_code cc ON cc.tenant_id = ${tenantId}::uuid AND cc.id = ${companyCodeId}::uuid
      LEFT JOIN LATERAL (
        SELECT cr.id
          FROM governance.cycle_run cr
          JOIN governance.cycle_type ct ON ct.tenant_id = cr.tenant_id AND ct.id = cr.cycle_type_id
         WHERE cr.tenant_id = ${tenantId}::uuid AND cr.entity_code = cc.code
           AND ct.type_code = 'FIN_SETUP_READINESS' AND cr.status <> 'CANCELLED'
         ORDER BY cr.run_number DESC, cr.created_at DESC LIMIT 1
      ) latest_run ON true
      LEFT JOIN LATERAL (
        SELECT c.id
          FROM governance.cycle_certification c
         WHERE c.tenant_id = ${tenantId}::uuid AND c.cycle_run_id = latest_run.id
           AND c.cert_code = 'FINANCE_POSTING_READY' AND c.status = 'ATTESTED'
           AND NOT EXISTS (
             SELECT 1 FROM governance.cycle_task task
              WHERE task.tenant_id = c.tenant_id AND task.cycle_run_id = c.cycle_run_id
                AND task.is_mandatory AND task.status <> 'COMPLETED'
           )
           AND NOT EXISTS (
             SELECT 1 FROM governance.cycle_deviation dev
              WHERE dev.tenant_id = c.tenant_id AND dev.cycle_run_id = c.cycle_run_id
                AND dev.severity = 'CRITICAL'
                AND dev.status NOT IN ('RESOLVED','REJECTED','EXPIRED','REVOKED')
           )
         ORDER BY c.cert_version DESC, c.created_at DESC LIMIT 1
      ) cert ON true
  `.execute(db);
  const r = rows[0];
  return { enabled: r?.enabled ?? false, certified: Boolean(r?.certification_id), certificationId: r?.certification_id ?? null };
}
