/**
 * Finance Setup readiness engine.
 *
 * Emits:
 *   • JourneyStep[] — the 5-step readiness journey for a company
 *   • PeriodPostability — current period gate summary
 *   • WorkspaceCardCounts — per-workspace KPIs
 *   • FinanceSetupConflict[] — canonical conflict list (also served standalone
 *     at /api/finance/setup/conflicts)
 *
 * All SQL uses verified DDL column names:
 *   • master.company_code_chart_assignment (not company_operating_chart_binding)
 *   • master.mv_company_postable_account (single source of the postability join)
 *   • master.bank_account_link.effective_until (not effective_to)
 *   • master.bank_account_link.owner_type = 'company_code' (polymorphic filter)
 *
 * All reason codes reference control.lookup_value(
 *   domain_code='finance.postability_reason').
 */

import { sql, type Kysely } from "kysely";
import { summarizeCompanyPostableAccounts } from "./is-company-postable-account.js";
import { loadPostingRoleCoverage, type PostingRoleCoveragePayload } from "./posting-role.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

// ─── DTO types (mirrors packages/domain/finance/finance-workbench/src/lib/finance-setup.types.ts) ──

type PostabilityChip = "postable" | "adjustment_only" | "read_only" | "locked";
type DefinitionState = "draft" | "active" | "inactive";
type JourneyStepState = "not_started" | "in_progress" | "complete" | "blocked";
type ConflictSeverity = "info" | "warning" | "error" | "blocker";
type FinanceSetupScopeType = "tenant" | "legal_entity" | "company";

export type JourneyStepKey =
  | "foundation" | "chart" | "books" | "gl_controls" | "house_banks" | "fiscal_period";

export type ConflictCategory =
  | "foundation" | "chart" | "book" | "gl_control" | "posting_role" | "house_bank" | "period" | "assignment";

interface ScopeRef {
  type:  FinanceSetupScopeType;
  code:  string;
  label?: string;
}

interface PostabilityDescriptor {
  chip:        PostabilityChip;
  reasonCode:  string;
  reasonText?: string;
}

interface DefinitionStateDescriptor {
  state:       DefinitionState;
  objectKind:  string;
  vocabulary:  ReadonlyArray<DefinitionState>;
}

export interface PeriodPostability extends PostabilityDescriptor {
  companyCode:  string;
  bookId:       string;
  bookLabel?:   string;
  fiscalYear:   number;
  periodNumber: number;
}

export interface FinanceSetupConflict {
  id:              string;
  category:        ConflictCategory;
  severity:        ConflictSeverity;
  scope:           ScopeRef;
  visibleAtScopes: ReadonlyArray<ScopeRef>;
  title:           string;
  message:         string;
  reasonCode:      string;
  actionHref:      string | null;
  actionLabel?:    string;
  detectedAt:      string;
}

function buildPostingRoleCoverageConflicts(
  companyCode: string,
  coverage: PostingRoleCoveragePayload,
): FinanceSetupConflict[] {
  const unresolved = coverage.summary.missingCells + coverage.summary.invalidCells;
  if (unresolved === 0) return [];
  return [{
    id: `posting-role-coverage:${companyCode}`,
    category: "posting_role",
    severity: "blocker",
    scope: { type: "company", code: companyCode },
    visibleAtScopes: [{ type: "company", code: companyCode }],
    title: `${unresolved} required posting-role mapping${unresolved === 1 ? "" : "s"} unresolved`,
    message: `${coverage.summary.resolvedCells} of ${coverage.summary.requiredCells} required company/book role assignments resolve to postable GL accounts.`,
    reasonCode: coverage.summary.invalidCells > 0
      ? "posting_role_account_not_postable" : "posting_role_mapping_missing",
    actionHref: `/finance/setup/company/${companyCode}/configure?tab=posting_roles`,
    actionLabel: "Complete role coverage",
    detectedAt: new Date().toISOString(),
  }];
}

export interface JourneyStep {
  key:           JourneyStepKey;
  label:         string;
  state:         JourneyStepState;
  coveragePct:   number | null;
  chip?:
    | { kind: "definition";   descriptor: DefinitionStateDescriptor }
    | { kind: "postability";  descriptor: PostabilityDescriptor };
  primaryHref:   string;
  conflictCount: number;
}

export interface WorkspaceCardCounts {
  explore:   { totalAccounts: number; postableAccounts: number };
  configure: { pendingRows: number; coveragePct: number };
  operate:   { openBlockers: number; reconciliationSignals: number };
}

export interface FinanceSetupGovernanceReadiness {
  source: "governance";
  cycleRunId: string | null;
  cycleStatus: string | null;
  mandatoryTaskCount: number;
  completedMandatoryTaskCount: number;
  criticalDeviationCount: number;
  certificationStatus: string | null;
  certified: boolean;
}

export interface CompanyHubPayload {
  companyCode:         string;
  companyName:         string;
  legalEntityCode:     string | null;
  legalEntityName:     string | null;
  tenantCode:          string | null;
  tenantName:          string | null;
  currentBookId:       string;
  currentBookLabel:    string;
  currentFiscalYear:   number;
  currentPeriodNumber: number;
  periodPostability:   PeriodPostability;
  journey:             JourneyStep[];
  inbox:               FinanceSetupConflict[];
  workspaceCounts:     WorkspaceCardCounts;
  governanceReadiness: FinanceSetupGovernanceReadiness;
  computedAt:          string;
}

async function loadFinanceSetupGovernanceReadiness(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<FinanceSetupGovernanceReadiness> {
  const { rows } = await sql<{
    cycle_run_id: string | null;
    cycle_status: string | null;
    mandatory_task_count: number;
    completed_mandatory_task_count: number;
    critical_deviation_count: number;
    certification_status: string | null;
  }>`
    WITH latest_run AS (
      SELECT cr.id, cr.status
        FROM governance.cycle_run cr
        JOIN governance.cycle_type ct
          ON ct.tenant_id = cr.tenant_id
         AND ct.id = cr.cycle_type_id
       WHERE cr.tenant_id = ${tenantId}::uuid
         AND cr.entity_code = ${companyCode}
         AND ct.type_code = 'FIN_SETUP_READINESS'
         AND cr.status <> 'CANCELLED'
       ORDER BY cr.created_at DESC
       LIMIT 1
    )
    SELECT lr.id AS cycle_run_id,
           lr.status AS cycle_status,
           count(DISTINCT ct.id) FILTER (WHERE ct.is_mandatory)::int AS mandatory_task_count,
           count(DISTINCT ct.id) FILTER (WHERE ct.is_mandatory AND ct.status = 'COMPLETED')::int AS completed_mandatory_task_count,
           count(DISTINCT cd.id) FILTER (
             WHERE cd.severity = 'CRITICAL'
               AND cd.status NOT IN ('RESOLVED', 'REJECTED', 'EXPIRED', 'REVOKED')
           )::int AS critical_deviation_count,
           max(cc.status) FILTER (WHERE cc.cert_code = 'FINANCE_POSTING_READY') AS certification_status
      FROM latest_run lr
      LEFT JOIN governance.cycle_task ct ON ct.cycle_run_id = lr.id
      LEFT JOIN governance.cycle_deviation cd ON cd.cycle_run_id = lr.id
      LEFT JOIN governance.cycle_certification cc ON cc.cycle_run_id = lr.id
     GROUP BY lr.id, lr.status
  `.execute(db);

  const row = rows[0];
  const mandatoryTaskCount = row?.mandatory_task_count ?? 0;
  const completedMandatoryTaskCount = row?.completed_mandatory_task_count ?? 0;
  const criticalDeviationCount = row?.critical_deviation_count ?? 0;
  const certificationStatus = row?.certification_status ?? null;
  return {
    source: "governance",
    cycleRunId: row?.cycle_run_id ?? null,
    cycleStatus: row?.cycle_status ?? null,
    mandatoryTaskCount,
    completedMandatoryTaskCount,
    criticalDeviationCount,
    certificationStatus,
    certified: mandatoryTaskCount > 0
      && mandatoryTaskCount === completedMandatoryTaskCount
      && criticalDeviationCount === 0
      && ["CERTIFIED", "ATTESTED"].includes(certificationStatus ?? ""),
  };
}


// ─── Header resolver ────────────────────────────────────────────────────────

interface CompanyHeader {
  companyCodeId:   string;
  companyCode:     string;
  companyName:     string;
  legalEntityCode: string | null;
  legalEntityName: string | null;
  legalEntityId:   string | null;
  tenantId:        string;
  tenantCode:      string | null;
  tenantName:      string | null;
}

async function loadCompanyHeader(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<CompanyHeader | null> {
  const { rows } = await sql<{
    company_code_id:    string;
    company_code:       string;
    company_name:       string;
    legal_entity_code:  string | null;
    legal_entity_name:  string | null;
    legal_entity_id:    string | null;
    tenant_id:          string;
    tenant_code:        string | null;
    tenant_name:        string | null;
  }>`
    SELECT cc.id     AS company_code_id,
           cc.code   AS company_code,
           cc.name   AS company_name,
           le.code   AS legal_entity_code,
           le.name   AS legal_entity_name,
           le.id     AS legal_entity_id,
           t.id      AS tenant_id,
           t.code    AS tenant_code,
           t.name    AS tenant_name
      FROM master.company_code cc
      LEFT JOIN master.legal_entity le ON le.id = cc.legal_entity_id
      LEFT JOIN master.tenant       t  ON t.id = cc.tenant_id
     WHERE cc.tenant_id = ${tenantId}::uuid
       AND cc.code = ${companyCode}
     LIMIT 1
  `.execute(db);
  const r = rows[0];
  return r ? {
    companyCodeId:   r.company_code_id,
    companyCode:     r.company_code,
    companyName:     r.company_name,
    legalEntityCode: r.legal_entity_code,
    legalEntityName: r.legal_entity_name,
    legalEntityId:   r.legal_entity_id,
    tenantId:        r.tenant_id,
    tenantCode:      r.tenant_code,
    tenantName:      r.tenant_name,
  } : null;
}

async function evaluateFoundationStep(
  db: AnyDb,
  tenantId: string,
  header: CompanyHeader,
): Promise<{ step: JourneyStep; conflicts: FinanceSetupConflict[] }> {
  if (!header.legalEntityId) {
    return {
      step: { key: "foundation", label: "Addresses & contacts", state: "blocked", coveragePct: 0,
        primaryHref: `/app/company-code/${header.companyCodeId}`, conflictCount: 1 },
      conflicts: [{
        id: `foundation-legal-entity-missing:${header.companyCode}`,
        category: "foundation", severity: "blocker", scope: { type: "company", code: header.companyCode },
        visibleAtScopes: [{ type: "company", code: header.companyCode }],
        title: "Legal Entity assignment is missing", message: "Assign the Company Code to a Legal Entity before finance setup.",
        reasonCode: "finance_foundation_legal_entity_missing", actionHref: `/app/company-code/${header.companyCodeId}`,
        actionLabel: "Open company", detectedAt: new Date().toISOString(),
      }],
    };
  }

  const result = await sql<{
    registered_office: boolean; bill_from: boolean; remit_to: boolean; finance_email: boolean;
  }>`
    WITH owners(owner_type, owner_id, rank) AS (VALUES
      ('company_code'::text, ${header.companyCodeId}::uuid, 0),
      ('legal_entity'::text, ${header.legalEntityId}::uuid, 1),
      ('tenant'::text, ${tenantId}::uuid, 2)
    )
    SELECT
      EXISTS (
        SELECT 1 FROM master.address_link al
        WHERE al.tenant_id = ${tenantId}::uuid
          AND al.owner_type = 'legal_entity' AND al.owner_id = ${header.legalEntityId}::uuid
          AND al.purpose = 'correspondence' AND al.role_qualifier = 'registered_office'
          AND al.is_primary = true AND al.effective_from <= CURRENT_DATE
          AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
      ) AS registered_office,
      EXISTS (
        SELECT 1 FROM owners o JOIN master.address_link al
          ON al.owner_type = o.owner_type AND al.owner_id = o.owner_id
        WHERE al.tenant_id = ${tenantId}::uuid AND al.purpose IN ('bill_from', 'default')
          AND al.is_primary = true AND al.effective_from <= CURRENT_DATE
          AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
      ) AS bill_from,
      EXISTS (
        SELECT 1 FROM owners o JOIN master.address_link al
          ON al.owner_type = o.owner_type AND al.owner_id = o.owner_id
        WHERE al.tenant_id = ${tenantId}::uuid AND al.purpose IN ('remit_to', 'default')
          AND al.is_primary = true AND al.effective_from <= CURRENT_DATE
          AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
      ) AS remit_to,
      EXISTS (
        SELECT 1 FROM owners o JOIN master.contact_link cl
          ON cl.owner_type = o.owner_type AND cl.owner_id = o.owner_id
        WHERE cl.tenant_id = ${tenantId}::uuid AND cl.channel_type = 'email'
          AND ((cl.purpose = 'correspondence' AND cl.role_qualifier = 'accounts_payable')
               OR (cl.purpose = 'default' AND cl.role_qualifier IS NULL))
          AND cl.is_primary = true AND cl.status = 'active'
      ) AS finance_email
  `.execute(db);
  const row = result.rows[0] ?? { registered_office: false, bill_from: false, remit_to: false, finance_email: false };
  const checks = [
    [row.registered_office, "registered-office", "Registered office is missing", "Configure the Legal Entity registered-office address."],
    [row.bill_from, "bill-from", "Bill-from address is missing", "Configure or inherit a bill-from address for this Company Code."],
    [row.remit_to, "remit-to", "Remittance address is missing", "Configure or inherit a remittance address for this Company Code."],
    [row.finance_email, "finance-email", "Finance email is missing", "Configure an AP/default email at Company, Legal Entity, or Tenant scope."],
  ] as const;
  const missing = checks.filter(([ready]) => !ready);
  const conflicts: FinanceSetupConflict[] = missing.map(([, code, title, message]) => ({
    id: `foundation-${code}:${header.companyCode}`, category: "foundation", severity: "error",
    scope: { type: "company", code: header.companyCode },
    visibleAtScopes: [{ type: "company", code: header.companyCode }], title, message,
    reasonCode: `finance_foundation_${code.replace(/-/g, "_")}_missing`,
    actionHref: `/app/company-code/${header.companyCodeId}`, actionLabel: "Configure addresses & contacts",
    detectedAt: new Date().toISOString(),
  }));
  const coveragePct = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return {
    step: { key: "foundation", label: "Addresses & contacts", state: missing.length ? (coveragePct ? "in_progress" : "not_started") : "complete",
      coveragePct, primaryHref: `/app/company-code/${header.companyCodeId}`, conflictCount: conflicts.length },
    conflicts,
  };
}


// ─── Effective book + period ────────────────────────────────────────────────

export interface EffectiveContext {
  bookId:       string;
  bookLabel:    string;
  fiscalYear:   number;
  periodNumber: number;
}

async function resolveEffectiveContext(
  db: AnyDb,
  tenantId: string,
  companyCodeId: string,
  overrides: { fiscalYear?: number; period?: number; bookId?: string } = {},
): Promise<EffectiveContext | null> {
  // Prefer explicit override; else pick company's primary/operating book and
  // today's fiscal period. Ledger book table naming: master.ledger_book.
  const { rows } = await sql<{
    book_id:       string;
    book_label:    string;
    fiscal_year:   number;
    period_number: number;
  }>`
    WITH pick_book AS (
    SELECT lb.id AS book_id,
               COALESCE(lb.name, lb.code) AS book_label
          FROM master.company_code_book_assignment ba
          JOIN master.ledger_book lb
            ON lb.id = ba.book_id
           AND lb.tenant_id = ba.tenant_id
         WHERE ba.tenant_id = ${tenantId}::uuid
           AND ba.company_code_id = ${companyCodeId}::uuid
           AND (${overrides.bookId ?? null}::uuid IS NULL OR lb.id = ${overrides.bookId ?? null}::uuid)
           AND lb.is_active = true
         ORDER BY lb.is_primary DESC NULLS LAST, lb.code
         LIMIT 1
    ),
    pick_period AS (
        SELECT fp.fiscal_year, fp.period_number
          FROM master.fiscal_period fp
         WHERE fp.tenant_id = ${tenantId}::uuid
           AND fp.company_code_id = ${companyCodeId}::uuid
           AND (
                 (${overrides.fiscalYear ?? null}::int IS NOT NULL AND fp.fiscal_year = ${overrides.fiscalYear ?? null}::int
                  AND (${overrides.period ?? null}::int IS NULL OR fp.period_number = ${overrides.period ?? null}::int))
              OR (${overrides.fiscalYear ?? null}::int IS NULL
                  AND fp.start_date <= CURRENT_DATE AND fp.end_date >= CURRENT_DATE)
               )
         ORDER BY fp.fiscal_year DESC, fp.period_number DESC
         LIMIT 1
    )
    SELECT pb.book_id, pb.book_label, pp.fiscal_year, pp.period_number
      FROM pick_book pb, pick_period pp
  `.execute(db);
  const r = rows[0];
  return r ? {
    bookId:       r.book_id,
    bookLabel:    r.book_label,
    fiscalYear:   r.fiscal_year,
    periodNumber: r.period_number,
  } : null;
}


// ─── Period postability ─────────────────────────────────────────────────────

export async function evaluatePeriodPostability(
  db: AnyDb,
  tenantId: string,
  companyCodeId: string,
  ctx: EffectiveContext,
): Promise<{ chip: PostabilityChip; reasonCode: string }> {
  // Read both fiscal_period.status (period-level) and book_period_status
  // (book+period-level). Combined effective = most restrictive.
  const { rows } = await sql<{
    fp_status:  string | null;
    bps_status: string | null;
  }>`
    SELECT fp.status AS fp_status, bps.status AS bps_status
      FROM master.fiscal_period fp
      LEFT JOIN governance.book_period_status bps
        ON bps.tenant_id       = fp.tenant_id
       AND bps.company_code_id = fp.company_code_id
       AND bps.fiscal_year     = fp.fiscal_year
       AND bps.period_number   = fp.period_number
       AND bps.book_id         = ${ctx.bookId}::uuid
     WHERE fp.tenant_id       = ${tenantId}::uuid
       AND fp.company_code_id = ${companyCodeId}::uuid
       AND fp.fiscal_year     = ${ctx.fiscalYear}
       AND fp.period_number   = ${ctx.periodNumber}
     LIMIT 1
  `.execute(db);
  const row = rows[0];
  if (!row) return { chip: "locked", reasonCode: "period_not_opened" };
  if (!row.bps_status) return { chip: "locked", reasonCode: "book_period_missing" };

  return resolvePeriodPostability(row.fp_status, row.bps_status);
}

/**
 * Combines the company-period and book-period gates. Posting is permitted only
 * when both gates permit it, so the most restrictive effective state wins.
 */
export function resolvePeriodPostability(
  fiscalPeriodStatus: string | null,
  bookPeriodStatus: string | null,
): { chip: PostabilityChip; reasonCode: string } {
  if (!fiscalPeriodStatus) return { chip: "locked", reasonCode: "period_not_opened" };
  if (!bookPeriodStatus) return { chip: "locked", reasonCode: "book_period_missing" };

  const statuses = [fiscalPeriodStatus, bookPeriodStatus];
  if (statuses.includes("hard_close")) {
    return { chip: "locked", reasonCode: "period_hard_closed" };
  }
  if (statuses.includes("future")) {
    return { chip: "locked", reasonCode: "period_not_opened" };
  }
  if (statuses.includes("soft_close")) {
    return { chip: "adjustment_only", reasonCode: "period_adjustment_only" };
  }
  if (statuses.every(status => status === "open")) {
    return { chip: "postable", reasonCode: "period_open" };
  }
  return { chip: "locked", reasonCode: "period_not_opened" };
}


// ─── Journey step evaluators ────────────────────────────────────────────────

async function evaluateChartStep(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
  companyCodeId: string,
): Promise<{ step: JourneyStep; conflicts: FinanceSetupConflict[] }> {
  const conflicts: FinanceSetupConflict[] = [];
  const { rows } = await sql<{
    assignment_status: string | null;
    chart_status:      string | null;
    chart_code:        string | null;
    chart_name:        string | null;
    assignment_count:  number;
  }>`
    SELECT ccca.status AS assignment_status,
           coa.status  AS chart_status,
           coa.code    AS chart_code,
           coa.name    AS chart_name,
           (SELECT count(*)::int
              FROM master.company_code_chart_assignment
             WHERE tenant_id = ${tenantId}::uuid
               AND company_code_id = ${companyCodeId}::uuid
               AND assignment_type = 'operating') AS assignment_count
      FROM master.company_code_chart_assignment ccca
      JOIN master.chart_of_account coa ON coa.id = ccca.chart_of_account_id
     WHERE ccca.tenant_id       = ${tenantId}::uuid
       AND ccca.company_code_id = ${companyCodeId}::uuid
       AND ccca.assignment_type = 'operating'
     ORDER BY ccca.status = 'active' DESC, ccca.effective_from DESC NULLS LAST
     LIMIT 1
  `.execute(db);

  const row = rows[0];
  const primaryHref = `/finance/setup/company/${companyCode}/configure?tab=chart_assignment`;

  if (!row) {
    conflicts.push({
      id:              `chart-missing:${companyCode}`,
      category:        "chart",
      severity:        "blocker",
      scope:           { type: "company", code: companyCode },
      visibleAtScopes: [{ type: "company", code: companyCode }],
      title:           "No operating chart assigned",
      message:         "This company has no active operating chart of accounts.",
      reasonCode:      "chart_assignment_inactive",
      actionHref:      primaryHref,
      actionLabel:     "Assign chart",
      detectedAt:      new Date().toISOString(),
    });
    return {
      step: {
        key: "chart", label: "Chart of accounts", state: "not_started",
        coveragePct: 0, primaryHref, conflictCount: 1,
      },
      conflicts,
    };
  }

  const chartActive = row.chart_status === "active";
  const assignActive = row.assignment_status === "active";
  const state: JourneyStepState =
    chartActive && assignActive ? "complete"
      : chartActive || assignActive ? "in_progress"
      : "blocked";

  if (!assignActive) {
    conflicts.push({
      id:              `chart-assignment-inactive:${companyCode}`,
      category:        "chart",
      severity:        "warning",
      scope:           { type: "company", code: companyCode },
      visibleAtScopes: [{ type: "company", code: companyCode }],
      title:           "Chart assignment not active",
      message:         `Assignment status is '${row.assignment_status}'.`,
      reasonCode:      "chart_assignment_inactive",
      actionHref:      primaryHref,
      actionLabel:     "Review assignment",
      detectedAt:      new Date().toISOString(),
    });
  }

  return {
    step: {
      key:           "chart",
      label:         "Chart of accounts",
      state,
      coveragePct:   state === "complete" ? 100 : state === "in_progress" ? 50 : 0,
      chip: {
        kind: "definition",
        descriptor: {
          state:      (row.chart_status ?? "draft") as DefinitionState,
          objectKind: "chart_of_account",
          vocabulary: ["draft", "active", "inactive"],
        },
      },
      primaryHref,
      conflictCount: conflicts.length,
    },
    conflicts,
  };
}

async function evaluateBooksStep(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
  companyCodeId: string,
): Promise<{ step: JourneyStep; conflicts: FinanceSetupConflict[] }> {
  const conflicts: FinanceSetupConflict[] = [];
  const { rows } = await sql<{
    total_books:    number;
    active_books:   number;
    primary_status: string | null;
  }>`
    SELECT count(*)::int                                                 AS total_books,
           count(*) FILTER (WHERE lb.status = 'active')::int             AS active_books,
           (SELECT status FROM master.ledger_book
             WHERE tenant_id = ${tenantId}::uuid
               AND id IN (
                 SELECT ba.book_id
                   FROM master.company_code_book_assignment ba
                  WHERE ba.tenant_id = ${tenantId}::uuid
                    AND ba.company_code_id = ${companyCodeId}::uuid
               )
               AND is_primary = true
             LIMIT 1)                                                    AS primary_status
      FROM master.company_code_book_assignment ba
      JOIN master.ledger_book lb
        ON lb.id = ba.book_id
       AND lb.tenant_id = ba.tenant_id
     WHERE ba.tenant_id = ${tenantId}::uuid
       AND ba.company_code_id = ${companyCodeId}::uuid
  `.execute(db);

  const row = rows[0] ?? { total_books: 0, active_books: 0, primary_status: null };
  const primaryHref = `/finance/setup/company/${companyCode}/configure?tab=book_assignment`;

  if (row.total_books === 0 || !row.primary_status) {
    conflicts.push({
      id:              `book-missing:${companyCode}`,
      category:        "book",
      severity:        "blocker",
      scope:           { type: "company", code: companyCode },
      visibleAtScopes: [{ type: "company", code: companyCode }],
      title:           "No ledger book configured",
      message:         "Company must have at least one active ledger book.",
      reasonCode:      "chart_assignment_inactive",
      actionHref:      primaryHref,
      actionLabel:     "Configure books",
      detectedAt:      new Date().toISOString(),
    });
  }

  const state: JourneyStepState = row.total_books === 0
    ? "not_started"
    : row.primary_status === "active" ? "complete" : "in_progress";

  return {
    step: {
      key:           "books",
      label:         "Books & ledgers",
      state,
      coveragePct:   row.total_books === 0 ? 0 : Math.round((row.active_books / row.total_books) * 100),
      chip: row.primary_status ? {
        kind: "definition",
        descriptor: {
          state:      row.primary_status as DefinitionState,
          objectKind: "ledger_book",
          vocabulary: ["draft", "active", "inactive"],
        },
      } : undefined,
      primaryHref,
      conflictCount: conflicts.length,
    },
    conflicts,
  };
}

async function evaluateGlControlsStep(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<{ step: JourneyStep; conflicts: FinanceSetupConflict[]; totalPostable: number }> {
  const summary = await summarizeCompanyPostableAccounts(db, tenantId, companyCode);
  const conflicts: FinanceSetupConflict[] = [];
  const primaryHref = `/finance/setup/company/${companyCode}/configure?tab=gl_controls`;
  const missingCount = summary.totalPostableAccounts - summary.controlledAccounts;

  if (missingCount > 0) {
    conflicts.push({
      id:              `gl-controls-missing:${companyCode}`,
      category:        "gl_control",
      severity:        missingCount > 20 ? "blocker" : "warning",
      scope:           { type: "company", code: companyCode },
      visibleAtScopes: [{ type: "company", code: companyCode }],
      title:           `${missingCount} postable GL account${missingCount === 1 ? "" : "s"} missing controls`,
      message:         `Coverage is at ${summary.coveragePct}%. Assign company controls to all postable accounts.`,
      reasonCode:      "control_missing",
      actionHref:      primaryHref,
      actionLabel:     "Assign controls",
      detectedAt:      new Date().toISOString(),
    });
  }
  if (summary.blockedManualAccounts > 0) {
    conflicts.push({
      id:              `gl-controls-blocked-manual:${companyCode}`,
      category:        "gl_control",
      severity:        "info",
      scope:           { type: "company", code: companyCode },
      visibleAtScopes: [{ type: "company", code: companyCode }],
      title:           `${summary.blockedManualAccounts} account${summary.blockedManualAccounts === 1 ? "" : "s"} blocked for manual posting`,
      message:         "These accounts still allow automatic posting.",
      reasonCode:      "control_blocked_manual",
      actionHref:      primaryHref,
      actionLabel:     "Review",
      detectedAt:      new Date().toISOString(),
    });
  }

  const state: JourneyStepState =
    summary.totalPostableAccounts === 0 ? "not_started"
      : summary.coveragePct === 100 ? "complete"
      : summary.coveragePct > 0 ? "in_progress"
      : "blocked";

  return {
    step: {
      key:           "gl_controls",
      label:         "GL controls coverage",
      state,
      coveragePct:   summary.coveragePct,
      primaryHref,
      conflictCount: conflicts.length,
    },
    conflicts,
    totalPostable: summary.totalPostableAccounts,
  };
}

async function evaluateHouseBanksStep(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
  companyCodeId: string,
): Promise<{ step: JourneyStep; conflicts: FinanceSetupConflict[] }> {
  const conflicts: FinanceSetupConflict[] = [];
  // Mixed-lifecycle rule (F4 audit): bank_party/bank_account/bank_account_house_config
  // use status/is_active; bank_account_link uses effective_from/effective_until +
  // is_primary. owner_type='company_code' filter is required.
  const { rows } = await sql<{
    ready_count:      number;
    total_count:      number;
    inactive_config:  number;
    inactive_party:   number;
    inactive_account: number;
    link_ineffective: number;
  }>`
    WITH house_banks AS (
        SELECT
            bahc.id,
            bahc.is_active                                       AS cfg_active,
            bp.is_active                                         AS party_active,
            ba.is_active                                         AS account_active,
            (bal_ref.effective_from <= CURRENT_DATE
             AND (bal_ref.effective_until IS NULL
                  OR bal_ref.effective_until > CURRENT_DATE))     AS link_effective
          FROM master.bank_account_house_config bahc
          JOIN master.bank_account_link bal_ref
            ON bal_ref.tenant_id = bahc.tenant_id
           AND bal_ref.id        = bahc.bank_account_link_id
           AND bal_ref.owner_type = 'company_code'
           AND bal_ref.owner_id   = ${companyCodeId}::uuid
          JOIN master.bank_account ba ON ba.id = bal_ref.bank_account_id
          JOIN master.bank_party    bp ON bp.id = ba.bank_party_id
         WHERE bahc.tenant_id = ${tenantId}::uuid
    )
    SELECT
        count(*) FILTER (WHERE cfg_active AND party_active AND account_active AND link_effective)::int AS ready_count,
        count(*)::int                                                                                   AS total_count,
        count(*) FILTER (WHERE NOT cfg_active)::int                                                     AS inactive_config,
        count(*) FILTER (WHERE NOT party_active)::int                                                   AS inactive_party,
        count(*) FILTER (WHERE NOT account_active)::int                                                 AS inactive_account,
        count(*) FILTER (WHERE NOT link_effective)::int                                                 AS link_ineffective
      FROM house_banks
  `.execute(db);

  const row = rows[0] ?? {
    ready_count: 0, total_count: 0, inactive_config: 0, inactive_party: 0,
    inactive_account: 0, link_ineffective: 0,
  };
  const primaryHref = `/finance/setup/company/${companyCode}/configure?tab=house_banks`;

  if (row.total_count === 0) {
    conflicts.push({
      id:              `house-bank-missing:${companyCode}`,
      category:        "house_bank",
      severity:        "warning",
      scope:           { type: "company", code: companyCode },
      visibleAtScopes: [{ type: "company", code: companyCode }],
      title:           "No house banks configured",
      message:         "AP/AR runtime requires at least one house bank for settlement.",
      reasonCode:      "control_missing",
      actionHref:      primaryHref,
      actionLabel:     "Add house bank",
      detectedAt:      new Date().toISOString(),
    });
  } else if (row.ready_count < row.total_count) {
    const notReady = row.total_count - row.ready_count;
    conflicts.push({
      id:              `house-bank-not-ready:${companyCode}`,
      category:        "house_bank",
      severity:        "warning",
      scope:           { type: "company", code: companyCode },
      visibleAtScopes: [{ type: "company", code: companyCode }],
      title:           `${notReady} house bank${notReady === 1 ? "" : "s"} not ready`,
      message:         "One or more house banks have an inactive party, account, link, or config.",
      reasonCode:      "control_missing",
      actionHref:      primaryHref,
      actionLabel:     "Review house banks",
      detectedAt:      new Date().toISOString(),
    });
  }

  const state: JourneyStepState = row.total_count === 0
    ? "not_started"
    : row.ready_count === row.total_count ? "complete" : "in_progress";

  return {
    step: {
      key:           "house_banks",
      label:         "House banks",
      state,
      coveragePct:   row.total_count === 0 ? null : Math.round((row.ready_count / row.total_count) * 100),
      primaryHref,
      conflictCount: conflicts.length,
    },
    conflicts,
  };
}

function buildFiscalPeriodStep(
  companyCode: string,
  ctx: EffectiveContext,
  postability: { chip: PostabilityChip; reasonCode: string },
): JourneyStep {
  const primaryHref =
    `/finance/period-close?company=${encodeURIComponent(companyCode)}&fy=${ctx.fiscalYear}&period=${ctx.periodNumber}`;
  const state: JourneyStepState =
    postability.chip === "postable" ? "complete"
      : postability.chip === "adjustment_only" ? "in_progress"
      : "blocked";
  return {
    key:           "fiscal_period",
    label:         "Fiscal calendar & period",
    state,
    coveragePct:   null,
    chip: {
      kind: "postability",
      descriptor: { chip: postability.chip, reasonCode: postability.reasonCode },
    },
    primaryHref,
    conflictCount: state === "blocked" ? 1 : 0,
  };
}


// ─── Public: assemble the Hub payload ───────────────────────────────────────

export interface BuildCompanyHubPayloadOptions {
  tenantId:    string;
  companyCode: string;
  fiscalYear?: number;
  period?:     number;
  bookId?:     string;
  inboxLimit?: number;
}

export async function buildCompanyHubPayload(
  db: AnyDb,
  opts: BuildCompanyHubPayloadOptions,
): Promise<CompanyHubPayload | null> {
  const header = await loadCompanyHeader(db, opts.tenantId, opts.companyCode);
  if (!header) return null;

  const ctx = await resolveEffectiveContext(db, opts.tenantId, header.companyCodeId, {
    fiscalYear: opts.fiscalYear,
    period:     opts.period,
    bookId:     opts.bookId,
  });
  if (!ctx) {
    // Fall back to a synthetic locked descriptor so the Hub still renders.
    const now = new Date();
    const periodPostability: PeriodPostability = {
      chip:         "locked",
      reasonCode:   "period_not_opened",
      companyCode:  header.companyCode,
      bookId:       "",
      fiscalYear:   now.getUTCFullYear(),
      periodNumber: 1,
    };
    return {
      companyCode:         header.companyCode,
      companyName:         header.companyName,
      legalEntityCode:     header.legalEntityCode,
      legalEntityName:     header.legalEntityName,
      tenantCode:          header.tenantCode,
      tenantName:          header.tenantName,
      currentBookId:       "",
      currentBookLabel:    "—",
      currentFiscalYear:   periodPostability.fiscalYear,
      currentPeriodNumber: periodPostability.periodNumber,
      periodPostability,
      journey: [],
      inbox:   [],
      workspaceCounts: {
        explore:   { totalAccounts: 0, postableAccounts: 0 },
        configure: { pendingRows: 0, coveragePct: 0 },
        operate:   { openBlockers: 0, reconciliationSignals: 0 },
      },
      governanceReadiness: {
        source: "governance", cycleRunId: null, cycleStatus: null,
        mandatoryTaskCount: 0, completedMandatoryTaskCount: 0,
        criticalDeviationCount: 0, certificationStatus: null, certified: false,
      },
      computedAt: now.toISOString(),
    };
  }

  const [
    foundationResult,
    chartResult,
    booksResult,
    glControlsResult,
    houseBanksResult,
    periodPostabilityResult,
    postingRoleCoverage,
    governanceReadiness,
  ] = await Promise.all([
    evaluateFoundationStep(db, opts.tenantId, header),
    evaluateChartStep(db, opts.tenantId, header.companyCode, header.companyCodeId),
    evaluateBooksStep(db, opts.tenantId, header.companyCode, header.companyCodeId),
    evaluateGlControlsStep(db, opts.tenantId, header.companyCode),
    evaluateHouseBanksStep(db, opts.tenantId, header.companyCode, header.companyCodeId),
    evaluatePeriodPostability(db, opts.tenantId, header.companyCodeId, ctx),
    loadPostingRoleCoverage(db, opts.tenantId, header.companyCode),
    loadFinanceSetupGovernanceReadiness(db, opts.tenantId, header.companyCode),
  ]);

  glControlsResult.conflicts.push(
    ...buildPostingRoleCoverageConflicts(header.companyCode, postingRoleCoverage),
  );
  glControlsResult.step.coveragePct = Math.min(
    glControlsResult.step.coveragePct ?? 100,
    postingRoleCoverage.summary.coveragePct,
  );
  glControlsResult.step.conflictCount = glControlsResult.conflicts.length;
  if (!postingRoleCoverage.summary.ready) glControlsResult.step.state = "blocked";

  const periodStep = buildFiscalPeriodStep(header.companyCode, ctx, periodPostabilityResult);
  if (periodStep.state === "blocked") {
    (glControlsResult.conflicts as FinanceSetupConflict[]).push({
      id:              `period-locked:${header.companyCode}:${ctx.fiscalYear}-${ctx.periodNumber}`,
      category:        "period",
      severity:        "blocker",
      scope:           { type: "company", code: header.companyCode },
      visibleAtScopes: [{ type: "company", code: header.companyCode }],
      title:           "Period is not postable",
      message:         `Book ${ctx.bookLabel} · FY${ctx.fiscalYear} · P${ctx.periodNumber} — reason: ${periodPostabilityResult.reasonCode}`,
      reasonCode:      periodPostabilityResult.reasonCode,
      actionHref:      periodStep.primaryHref,
      actionLabel:     "Open period",
      detectedAt:      new Date().toISOString(),
    });
  }

  const journey: JourneyStep[] = [
    foundationResult.step,
    chartResult.step,
    booksResult.step,
    glControlsResult.step,
    houseBanksResult.step,
    periodStep,
  ];
  const allConflicts: FinanceSetupConflict[] = [
    ...foundationResult.conflicts,
    ...chartResult.conflicts,
    ...booksResult.conflicts,
    ...glControlsResult.conflicts,
    ...houseBanksResult.conflicts,
  ];
  const inboxLimit = opts.inboxLimit ?? 5;
  const inbox = [...allConflicts]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, inboxLimit);

  const periodPostability: PeriodPostability = {
    chip:         periodPostabilityResult.chip,
    reasonCode:   periodPostabilityResult.reasonCode,
    companyCode:  header.companyCode,
    bookId:       ctx.bookId,
    bookLabel:    ctx.bookLabel,
    fiscalYear:   ctx.fiscalYear,
    periodNumber: ctx.periodNumber,
  };

  return {
    companyCode:         header.companyCode,
    companyName:         header.companyName,
    legalEntityCode:     header.legalEntityCode,
    legalEntityName:     header.legalEntityName,
    tenantCode:          header.tenantCode,
    tenantName:          header.tenantName,
    currentBookId:       ctx.bookId,
    currentBookLabel:    ctx.bookLabel,
    currentFiscalYear:   ctx.fiscalYear,
    currentPeriodNumber: ctx.periodNumber,
    periodPostability,
    journey,
    inbox,
    workspaceCounts: {
      explore: {
        totalAccounts:    glControlsResult.totalPostable,
        postableAccounts: glControlsResult.totalPostable,
      },
      configure: {
        pendingRows: allConflicts.length,
        coveragePct: glControlsResult.step.coveragePct ?? 0,
      },
      operate: {
        openBlockers:          allConflicts.filter(c => c.severity === "blocker").length,
        reconciliationSignals: houseBanksResult.step.conflictCount,
      },
    },
    governanceReadiness,
    computedAt: new Date().toISOString(),
  };
}


// ─── Public: full conflicts list (used by /conflicts endpoint) ──────────────

export async function buildCompanyConflicts(
  db: AnyDb,
  opts: { tenantId: string; companyCode: string },
): Promise<FinanceSetupConflict[]> {
  const header = await loadCompanyHeader(db, opts.tenantId, opts.companyCode);
  if (!header) return [];

  const [chart, books, gl, banks, postingRoles] = await Promise.all([
    evaluateChartStep(db, opts.tenantId, header.companyCode, header.companyCodeId),
    evaluateBooksStep(db, opts.tenantId, header.companyCode, header.companyCodeId),
    evaluateGlControlsStep(db, opts.tenantId, header.companyCode),
    evaluateHouseBanksStep(db, opts.tenantId, header.companyCode, header.companyCodeId),
    loadPostingRoleCoverage(db, opts.tenantId, header.companyCode),
  ]);
  gl.conflicts.push(...buildPostingRoleCoverageConflicts(header.companyCode, postingRoles));
  return [
    ...chart.conflicts,
    ...books.conflicts,
    ...gl.conflicts,
    ...banks.conflicts,
  ].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}


// ─── Public: posting-preview endpoint ───────────────────────────────────────

export async function buildPostingPreview(
  db: AnyDb,
  opts: {
    tenantId:      string;
    companyCode:   string;
    fiscalYear:    number;
    period:        number;
    bookId?:       string;
    glAccountCode?: string;
  },
): Promise<{
  periodPostability:  PeriodPostability;
  accountPostability?: {
    chip:          PostabilityChip;
    reasonCodes:   string[];
    glAccountId:   string;
    glAccountCode: string;
    glAccountName: string;
  };
} | null> {
  const header = await loadCompanyHeader(db, opts.tenantId, opts.companyCode);
  if (!header) return null;

  const ctx = await resolveEffectiveContext(db, opts.tenantId, header.companyCodeId, {
    fiscalYear: opts.fiscalYear,
    period:     opts.period,
    bookId:     opts.bookId,
  });
  if (!ctx) return null;

  const period = await evaluatePeriodPostability(db, opts.tenantId, header.companyCodeId, ctx);
  const periodPostability: PeriodPostability = {
    chip:         period.chip,
    reasonCode:   period.reasonCode,
    companyCode:  header.companyCode,
    bookId:       ctx.bookId,
    bookLabel:    ctx.bookLabel,
    fiscalYear:   ctx.fiscalYear,
    periodNumber: ctx.periodNumber,
  };

  if (!opts.glAccountCode) return { periodPostability };

  // Account-scope: look up the account in mv_company_postable_account.
  const { rows } = await sql<{
    gl_account_id:     string;
    account_code:      string;
    account_name:      string;
    posting_allowed:   boolean;
    blocked_for_manual:boolean;
    blocked_for_auto:  boolean;
    has_control:       boolean;
  }>`
    SELECT mv.gl_account_id, mv.account_code, mv.account_name,
           COALESCE(ccga.posting_allowed, true)    AS posting_allowed,
           COALESCE(ccga.blocked_for_manual,false) AS blocked_for_manual,
           COALESCE(ccga.blocked_for_auto,  false) AS blocked_for_auto,
           (ccga.id IS NOT NULL)                    AS has_control
      FROM master.mv_company_postable_account mv
      LEFT JOIN master.company_code_gl_account ccga
        ON ccga.company_code_id = mv.company_code_id
       AND ccga.gl_account_id   = mv.gl_account_id
     WHERE mv.tenant_id       = ${opts.tenantId}::uuid
       AND mv.company_code_id = ${header.companyCodeId}::uuid
       AND mv.account_code    = ${opts.glAccountCode}
     LIMIT 1
  `.execute(db);
  const acc = rows[0];

  const reasonCodes: string[] = [];
  let chip: PostabilityChip = period.chip;
  if (!acc) {
    reasonCodes.push("gl_account_not_posting");
    chip = "read_only";
    return {
      periodPostability,
      accountPostability: {
        chip, reasonCodes,
        glAccountId:  "",
        glAccountCode: opts.glAccountCode,
        glAccountName: opts.glAccountCode,
      },
    };
  }
  if (!acc.has_control)      { reasonCodes.push("control_missing");            chip = "locked"; }
  if (!acc.posting_allowed)  { reasonCodes.push("control_posting_disallowed"); chip = "locked"; }
  if (acc.blocked_for_manual){ reasonCodes.push("control_blocked_manual");     chip = chip === "postable" ? "adjustment_only" : chip; }
  if (acc.blocked_for_auto)  { reasonCodes.push("control_blocked_auto");       chip = chip === "postable" ? "adjustment_only" : chip; }
  if (period.chip !== "postable" && reasonCodes.length === 0) reasonCodes.push(period.reasonCode);
  if (reasonCodes.length === 0) reasonCodes.push("period_open");

  return {
    periodPostability,
    accountPostability: {
      chip, reasonCodes,
      glAccountId:  acc.gl_account_id,
      glAccountCode: acc.account_code,
      glAccountName: acc.account_name,
    },
  };
}


// ─── helpers ────────────────────────────────────────────────────────────────

function severityRank(s: ConflictSeverity): number {
  switch (s) {
    case "blocker": return 4;
    case "error":   return 3;
    case "warning": return 2;
    case "info":    return 1;
  }
}
