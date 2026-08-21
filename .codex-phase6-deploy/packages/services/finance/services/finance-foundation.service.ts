import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export type FoundationDomainKey = "organization" | "accounts" | "books" | "calendar";
export type FoundationDomainStatus = "not_started" | "in_progress" | "complete";
export type FoundationReadinessStatus = "not_ready" | "ready_for_certification" | "certified" | "stale";

export interface FoundationCheck {
  key: string;
  label: string;
  passed: boolean;
}

export interface FoundationDomainCompletion {
  key: FoundationDomainKey;
  label: string;
  href: string;
  status: FoundationDomainStatus;
  checks: FoundationCheck[];
}

export interface FoundationDeterministicCheck {
  domain: FoundationDomainKey;
  passed: boolean;
  failedCheckKeys: string[];
}

export interface FoundationReadiness {
  status: FoundationReadinessStatus;
  deterministicComplete: boolean;
  checks: FoundationDeterministicCheck[];
  certificationId: string | null;
  certificationStatus: string | null;
}

export interface CompanyFoundationPayload {
  context: {
    tenant: { id: string; code: string | null; name: string | null };
    legalEntity: {
      id: string; code: string; name: string; status: string;
      countryCode: string | null; countryName: string | null;
      functionalCurrency: string | null; functionalCurrencyName: string | null;
      reportingCurrency: string | null; reportingCurrencyName: string | null;
      regulatoryFramework: string | null;
    };
    company: {
      id: string; code: string; name: string; status: string;
      countryCode: string | null; countryName: string | null;
      functionalCurrency: string | null; functionalCurrencyName: string | null;
      regulatoryFramework: string | null; timezoneCode: string | null;
      localeCode: string | null; dateFormat: string | null; weekStart: number | null;
    };
  };
  domains: FoundationDomainCompletion[];
  readiness: FoundationReadiness;
  completedDomainCount: number;
  totalDomainCount: 4;
  computedAt: string;
}

export function evaluateFoundationReadiness(
  domains: FoundationDomainCompletion[],
  certification: { id: string; status: string } | null,
): FoundationReadiness {
  const checks = domains.map((domain) => ({
    domain: domain.key,
    passed: domain.status === "complete",
    failedCheckKeys: domain.checks.filter((check) => !check.passed).map((check) => check.key),
  }));
  const deterministicComplete = checks.length === 4 && checks.every((check) => check.passed);
  const certificationIsCurrent = certification?.status === "CERTIFIED" || certification?.status === "ATTESTED";
  const status: FoundationReadinessStatus = certification?.status === "SUPERSEDED" || (certificationIsCurrent && !deterministicComplete)
    ? "stale"
    : certificationIsCurrent
      ? "certified"
      : deterministicComplete
        ? "ready_for_certification"
        : "not_ready";
  return {
    status,
    deterministicComplete,
    checks,
    certificationId: certification?.id ?? null,
    certificationStatus: certification?.status ?? null,
  };
}

export function deriveFoundationDomainStatus(
  checks: FoundationCheck[],
  started: boolean,
): FoundationDomainStatus {
  if (checks.length > 0 && checks.every((check) => check.passed)) return "complete";
  return started ? "in_progress" : "not_started";
}

export async function loadCompanyFoundation(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
  activeLegalEntityId?: string | null,
): Promise<CompanyFoundationPayload | null> {
  const { rows } = await sql<{
    tenant_id: string; tenant_code: string | null; tenant_name: string | null;
    legal_entity_id: string; legal_entity_code: string; legal_entity_name: string; legal_entity_status: string;
    legal_entity_country_code: string | null; legal_entity_country_name: string | null;
    legal_entity_functional_currency: string | null; legal_entity_functional_currency_name: string | null;
    legal_entity_reporting_currency: string | null; legal_entity_reporting_currency_name: string | null;
    legal_entity_regulatory_framework: string | null;
    company_id: string; company_code: string; company_name: string; company_status: string;
    company_country_code: string | null; company_country_name: string | null;
    company_functional_currency: string | null; company_functional_currency_name: string | null;
    company_regulatory_framework: string | null; timezone_code: string | null;
    locale_code: string | null; date_format: string | null; week_start: number | null;
    le_country_valid: boolean; le_functional_currency_valid: boolean; le_reporting_currency_valid: boolean;
    company_country_valid: boolean; company_currency_valid: boolean; timezone_valid: boolean;
    operating_assignment_count: number; operating_chart_valid: boolean; posting_account_count: number; controlled_account_count: number;
    account_controls_reachable: boolean;
    book_assignment_count: number; default_book_valid: boolean; book_currencies_valid: boolean;
    calendar_assignment_count: number; current_period_count: number; next_period_count: number;
    normal_period_openable: boolean; period_sequence_valid: boolean;
    book_period_coverage_valid: boolean; legacy_calendar_consistent: boolean;
  }>`
    SELECT
      t.id AS tenant_id, t.code AS tenant_code, COALESCE(t.display_name, t.name) AS tenant_name,
      le.id AS legal_entity_id, le.code AS legal_entity_code, le.name AS legal_entity_name,
      le.status AS legal_entity_status, le.country_code AS legal_entity_country_code,
      lec.name AS legal_entity_country_name, le.functional_currency AS legal_entity_functional_currency,
      lefc.name AS legal_entity_functional_currency_name, le.reporting_currency AS legal_entity_reporting_currency,
      lerc.name AS legal_entity_reporting_currency_name, le.regulatory_framework AS legal_entity_regulatory_framework,
      cc.id AS company_id, cc.code AS company_code, cc.name AS company_name, cc.status AS company_status,
      cc.country_code AS company_country_code, ccc.name AS company_country_name,
      cc.functional_currency AS company_functional_currency, ccfc.name AS company_functional_currency_name,
      cc.regulatory_framework AS company_regulatory_framework, cc.timezone_code, cc.locale_code,
      cc.date_format, cc.week_start,
      (lec.is_active IS TRUE) AS le_country_valid,
      (lefc.is_active IS TRUE) AS le_functional_currency_valid,
      (lerc.is_active IS TRUE) AS le_reporting_currency_valid,
      (ccc.is_active IS TRUE) AS company_country_valid,
      (ccfc.is_active IS TRUE) AS company_currency_valid,
      (tz.is_active IS TRUE) AS timezone_valid,
      stats.operating_assignment_count, stats.operating_chart_valid,
      stats.posting_account_count, stats.controlled_account_count,
      stats.account_controls_reachable,
      stats.book_assignment_count, stats.default_book_valid, stats.book_currencies_valid,
      stats.calendar_assignment_count, stats.current_period_count, stats.next_period_count,
      stats.normal_period_openable, stats.period_sequence_valid,
      stats.book_period_coverage_valid, stats.legacy_calendar_consistent
    FROM master.company_code cc
    JOIN master.legal_entity le ON le.tenant_id = cc.tenant_id AND le.id = cc.legal_entity_id
    JOIN master.tenant t ON t.id = cc.tenant_id
    LEFT JOIN shared.country lec ON lec.code = le.country_code
    LEFT JOIN shared.country ccc ON ccc.code = cc.country_code
    LEFT JOIN shared.currency lefc ON lefc.code = le.functional_currency
    LEFT JOIN shared.currency lerc ON lerc.code = le.reporting_currency
    LEFT JOIN shared.currency ccfc ON ccfc.code = cc.functional_currency
    LEFT JOIN shared.timezone tz ON tz.code = cc.timezone_code
    CROSS JOIN LATERAL (
      SELECT
        (SELECT count(*)::int FROM master.company_code_chart_assignment a
          WHERE a.tenant_id = cc.tenant_id AND a.company_code_id = cc.id
            AND a.assignment_type = 'operating' AND a.is_primary AND a.status = 'active'
            AND (a.effective_from IS NULL OR a.effective_from <= CURRENT_DATE)
            AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)) AS operating_assignment_count,
        EXISTS (SELECT 1 FROM master.company_code_chart_assignment a
          JOIN master.chart_of_account coa ON coa.tenant_id = a.tenant_id AND coa.id = a.chart_of_account_id
          WHERE a.tenant_id = cc.tenant_id AND a.company_code_id = cc.id
            AND a.assignment_type = 'operating' AND a.is_primary AND a.status = 'active' AND coa.status = 'active'
            AND (a.effective_from IS NULL OR a.effective_from <= CURRENT_DATE)
            AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)) AS operating_chart_valid,
        (SELECT count(DISTINCT ga.id)::int FROM master.company_code_chart_assignment a
          JOIN master.chart_of_account coa ON coa.tenant_id = a.tenant_id AND coa.id = a.chart_of_account_id AND coa.status = 'active'
          JOIN master.gl_account ga ON ga.tenant_id = coa.tenant_id AND ga.chart_of_account_id = coa.id
          WHERE a.tenant_id = cc.tenant_id AND a.company_code_id = cc.id AND a.assignment_type = 'operating'
            AND a.status = 'active' AND ga.status = 'active' AND ga.node_type = 'posting'
            AND (a.effective_from IS NULL OR a.effective_from <= CURRENT_DATE)
            AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)) AS posting_account_count,
        (SELECT count(DISTINCT ga.id)::int FROM master.company_code_chart_assignment a
          JOIN master.chart_of_account coa ON coa.tenant_id = a.tenant_id AND coa.id = a.chart_of_account_id AND coa.status = 'active'
          JOIN master.gl_account ga ON ga.tenant_id = coa.tenant_id AND ga.chart_of_account_id = coa.id
          JOIN master.company_code_gl_account ctl ON ctl.tenant_id = a.tenant_id AND ctl.company_code_id = a.company_code_id
            AND ctl.gl_account_id = ga.id AND ctl.status = 'active'
          WHERE a.tenant_id = cc.tenant_id AND a.company_code_id = cc.id AND a.assignment_type = 'operating'
            AND a.status = 'active' AND ga.status = 'active' AND ga.node_type = 'posting'
            AND (a.effective_from IS NULL OR a.effective_from <= CURRENT_DATE)
            AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)) AS controlled_account_count,
        NOT EXISTS (
          SELECT 1 FROM master.company_code_gl_account ctl
           WHERE ctl.tenant_id = cc.tenant_id AND ctl.company_code_id = cc.id AND ctl.status = 'active'
             AND NOT EXISTS (
               SELECT 1 FROM master.gl_account ga
               JOIN master.company_code_chart_assignment a
                 ON a.tenant_id = ga.tenant_id AND a.chart_of_account_id = ga.chart_of_account_id
               JOIN master.chart_of_account coa
                 ON coa.tenant_id = a.tenant_id AND coa.id = a.chart_of_account_id
              WHERE ga.tenant_id = ctl.tenant_id AND ga.id = ctl.gl_account_id
                AND ga.status = 'active' AND ga.node_type = 'posting' AND coa.status = 'active'
                AND a.company_code_id = cc.id AND a.status = 'active'
                AND (a.effective_from IS NULL OR a.effective_from <= CURRENT_DATE)
                AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
             )
        ) AS account_controls_reachable,
        (SELECT count(*)::int FROM master.company_code_book_assignment ba
          JOIN master.ledger_book lb ON lb.tenant_id = ba.tenant_id AND lb.id = ba.book_id
          WHERE ba.tenant_id = cc.tenant_id AND ba.company_code_id = cc.id AND ba.status = 'active' AND lb.status = 'active'
            AND ba.effective_from <= CURRENT_DATE AND (ba.effective_to IS NULL OR ba.effective_to >= CURRENT_DATE)) AS book_assignment_count,
        EXISTS (SELECT 1 FROM master.company_code_book_assignment ba
          JOIN master.ledger_book lb ON lb.tenant_id = ba.tenant_id AND lb.id = ba.book_id
          WHERE ba.tenant_id = cc.tenant_id AND ba.company_code_id = cc.id AND ba.book_id = cc.default_ledger_book_id
            AND ba.status = 'active' AND lb.status = 'active' AND ba.effective_from <= CURRENT_DATE
            AND (ba.effective_to IS NULL OR ba.effective_to >= CURRENT_DATE)) AS default_book_valid,
        NOT EXISTS (SELECT 1 FROM master.company_code_book_assignment ba
          JOIN master.ledger_book lb ON lb.tenant_id = ba.tenant_id AND lb.id = ba.book_id
          LEFT JOIN shared.currency base_cur ON base_cur.code = lb.base_currency_code
          LEFT JOIN shared.currency override_cur ON override_cur.code = ba.override_currency_code
          WHERE ba.tenant_id = cc.tenant_id AND ba.company_code_id = cc.id AND ba.status = 'active'
            AND ba.effective_from <= CURRENT_DATE AND (ba.effective_to IS NULL OR ba.effective_to >= CURRENT_DATE)
            AND (base_cur.is_active IS NOT TRUE
              OR (ba.override_currency_code IS NOT NULL AND override_cur.is_active IS NOT TRUE))) AS book_currencies_valid,
        (SELECT count(*)::int FROM control.company_fiscal_calendar_assignment ca
          JOIN control.fiscal_calendar_config fc ON fc.tenant_id = ca.tenant_id AND fc.id = ca.fiscal_calendar_config_id
          WHERE ca.tenant_id = cc.tenant_id AND ca.company_code_id = cc.id AND ca.status = 'active' AND fc.status = 'active'
            AND ca.effective_fiscal_year_from <= EXTRACT(YEAR FROM CURRENT_DATE)::int
            AND (ca.effective_fiscal_year_to IS NULL OR ca.effective_fiscal_year_to >= EXTRACT(YEAR FROM CURRENT_DATE)::int)) AS calendar_assignment_count,
        NOT EXISTS (SELECT 1 FROM control.company_fiscal_calendar_assignment ca
          JOIN control.fiscal_calendar_config fc ON fc.tenant_id = ca.tenant_id AND fc.id = ca.fiscal_calendar_config_id
          WHERE ca.tenant_id = cc.tenant_id AND ca.company_code_id = cc.id AND ca.status = 'active' AND fc.status = 'active'
            AND ca.effective_fiscal_year_from <= EXTRACT(YEAR FROM CURRENT_DATE)::int
            AND (ca.effective_fiscal_year_to IS NULL OR ca.effective_fiscal_year_to >= EXTRACT(YEAR FROM CURRENT_DATE)::int)
            AND (cc.fiscal_year_start_month IS DISTINCT FROM fc.anchor_month
              OR cc.fiscal_year_variant IS DISTINCT FROM CASE fc.calendar_type
                WHEN 'four_four_five' THEN 'fy_445' WHEN 'four_five_four' THEN 'fy_454'
                WHEN 'five_four_four' THEN 'fy_544'
                WHEN 'monthly' THEN CASE WHEN fc.anchor_month = 1 THEN 'calendar' ELSE 'custom' END
                ELSE 'custom' END)) AS legacy_calendar_consistent,
        (SELECT count(*)::int FROM master.fiscal_period fp
          WHERE fp.tenant_id = cc.tenant_id AND fp.company_code_id = cc.id
            AND fp.fiscal_year = EXTRACT(YEAR FROM CURRENT_DATE)::int) AS current_period_count,
        (SELECT count(*)::int FROM master.fiscal_period fp
          WHERE fp.tenant_id = cc.tenant_id AND fp.company_code_id = cc.id
            AND fp.fiscal_year = EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) AS next_period_count,
        EXISTS (SELECT 1 FROM master.fiscal_period fp
          WHERE fp.tenant_id = cc.tenant_id AND fp.company_code_id = cc.id
            AND fp.fiscal_year IN (EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(YEAR FROM CURRENT_DATE)::int + 1)
            AND fp.period_type = 'normal' AND fp.status IN ('future', 'open')) AS normal_period_openable,
        NOT EXISTS (
          SELECT 1 FROM (
            SELECT fp.start_date, fp.end_date,
                   lag(fp.end_date) OVER (PARTITION BY fp.fiscal_year ORDER BY fp.start_date, fp.period_number) AS previous_end
              FROM master.fiscal_period fp
             WHERE fp.tenant_id = cc.tenant_id AND fp.company_code_id = cc.id
               AND fp.fiscal_year IN (EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(YEAR FROM CURRENT_DATE)::int + 1)
               AND fp.period_type = 'normal'
          ) sequence
         WHERE sequence.end_date < sequence.start_date
            OR (sequence.previous_end IS NOT NULL AND sequence.start_date <> sequence.previous_end + 1)
        ) AS period_sequence_valid,
        NOT EXISTS (
          SELECT 1 FROM master.company_code_book_assignment ba
          CROSS JOIN master.fiscal_period fp
          LEFT JOIN governance.book_period_status bps
            ON bps.tenant_id = ba.tenant_id AND bps.company_code_id = ba.company_code_id
           AND bps.book_id = ba.book_id AND bps.fiscal_year = fp.fiscal_year AND bps.period_number = fp.period_number
          WHERE ba.tenant_id = cc.tenant_id AND ba.company_code_id = cc.id AND ba.status = 'active'
            AND ba.effective_from <= CURRENT_DATE AND (ba.effective_to IS NULL OR ba.effective_to >= CURRENT_DATE)
            AND fp.tenant_id = cc.tenant_id AND fp.company_code_id = cc.id
            AND fp.fiscal_year IN (EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(YEAR FROM CURRENT_DATE)::int + 1)
            AND bps.id IS NULL
        ) AS book_period_coverage_valid
    ) stats
    WHERE cc.tenant_id = ${tenantId}::uuid
      AND lower(cc.code) = lower(${companyCode})
      AND (${activeLegalEntityId ?? null}::uuid IS NULL OR le.id = ${activeLegalEntityId ?? null}::uuid)
    LIMIT 1
  `.execute(db);

  const row = rows[0];
  if (!row) return null;

  const certificationResult = await sql<{ id: string; status: string }>`
    SELECT cert.id, cert.status
      FROM governance.cycle_certification cert
      JOIN governance.cycle_run run
        ON run.tenant_id = cert.tenant_id AND run.id = cert.cycle_run_id
      JOIN governance.cycle_type type
        ON type.tenant_id = run.tenant_id AND type.id = run.cycle_type_id
     WHERE cert.tenant_id = ${tenantId}::uuid
       AND run.entity_code = ${row.company_code}
       AND type.type_code = 'FIN_SETUP_READINESS'
       AND cert.cert_code = 'FINANCE_POSTING_READY'
     ORDER BY COALESCE(cert.updated_at, cert.created_at) DESC, cert.cert_version DESC
     LIMIT 1
  `.execute(db);

  const organizationChecks: FoundationCheck[] = [
    { key: "legal_entity_active", label: "Legal Entity is active", passed: row.legal_entity_status === "active" },
    { key: "company_active", label: "Company Code is active and linked", passed: row.company_status === "active" },
    { key: "legal_entity_country", label: "Legal Entity country is valid", passed: row.le_country_valid },
    { key: "legal_entity_functional_currency", label: "Legal Entity functional currency is active", passed: row.le_functional_currency_valid },
    { key: "legal_entity_reporting_currency", label: "Legal Entity reporting currency is active", passed: row.le_reporting_currency_valid },
    { key: "company_country", label: "Company country is valid", passed: row.company_country_valid },
    { key: "company_functional_currency", label: "Company functional currency is active", passed: row.company_currency_valid },
    { key: "company_timezone", label: "Company timezone is valid", passed: row.timezone_valid },
    { key: "company_regulatory_framework", label: "Company regulatory framework is set", passed: Boolean(row.company_regulatory_framework?.trim()) },
  ];
  const accountChecks: FoundationCheck[] = [
    { key: "primary_operating_chart", label: "One primary operating chart is effective", passed: row.operating_assignment_count === 1 },
    { key: "operating_chart_active", label: "Assigned operating chart is active", passed: row.operating_chart_valid },
    { key: "posting_accounts", label: "Active posting accounts are available", passed: row.posting_account_count > 0 },
    { key: "company_controls", label: "Posting accounts have Company controls", passed: row.posting_account_count > 0 && row.controlled_account_count >= row.posting_account_count },
    { key: "reachable_controls", label: "Active Company controls reference reachable posting accounts", passed: row.account_controls_reachable },
  ];
  const bookChecks: FoundationCheck[] = [
    { key: "book_assignment", label: "An active Ledger Book is assigned", passed: row.book_assignment_count > 0 },
    { key: "default_book", label: "Company default Book is active and effective", passed: row.default_book_valid },
    { key: "book_currencies", label: "Assigned Book currencies are active", passed: row.book_assignment_count > 0 && row.book_currencies_valid },
  ];
  const calendarChecks: FoundationCheck[] = [
    { key: "calendar_assignment", label: "An active calendar covers the current year", passed: row.calendar_assignment_count === 1 },
    { key: "legacy_calendar_consistency", label: "Legacy fiscal fields match the assigned Calendar", passed: row.calendar_assignment_count === 1 && row.legacy_calendar_consistent },
    { key: "fiscal_periods", label: "Current-year fiscal periods are generated", passed: row.current_period_count > 0 },
    { key: "forward_periods", label: "Next-year fiscal periods are generated", passed: row.next_period_count > 0 },
    { key: "period_sequence", label: "Generated normal periods have no gaps or overlaps", passed: row.current_period_count > 0 && row.next_period_count > 0 && row.period_sequence_valid },
    { key: "book_periods", label: "Assigned Books have period gates", passed: row.current_period_count > 0 && row.book_assignment_count > 0 && row.book_period_coverage_valid },
    { key: "normal_period_openable", label: "A normal period is available to open", passed: row.normal_period_openable },
  ];
  const base = `/finance/setup/company/${encodeURIComponent(row.company_code)}/foundation`;
  const domains: FoundationDomainCompletion[] = [
    { key: "organization", label: "Organization & Currency", href: `${base}/organization`, status: deriveFoundationDomainStatus(organizationChecks, true), checks: organizationChecks },
    { key: "accounts", label: "Chart of Accounts & GL Accounts", href: `${base}/accounts`, status: deriveFoundationDomainStatus(accountChecks, row.operating_assignment_count > 0 || row.posting_account_count > 0), checks: accountChecks },
    { key: "books", label: "Books & Ledgers", href: `${base}/books`, status: deriveFoundationDomainStatus(bookChecks, row.book_assignment_count > 0), checks: bookChecks },
    { key: "calendar", label: "Fiscal Calendar & Periods", href: `${base}/calendar`, status: deriveFoundationDomainStatus(calendarChecks, row.calendar_assignment_count > 0 || row.current_period_count > 0), checks: calendarChecks },
  ];
  const readiness = evaluateFoundationReadiness(domains, certificationResult.rows[0] ?? null);

  return {
    context: {
      tenant: { id: row.tenant_id, code: row.tenant_code, name: row.tenant_name },
      legalEntity: {
        id: row.legal_entity_id, code: row.legal_entity_code, name: row.legal_entity_name,
        status: row.legal_entity_status, countryCode: row.legal_entity_country_code,
        countryName: row.legal_entity_country_name, functionalCurrency: row.legal_entity_functional_currency,
        functionalCurrencyName: row.legal_entity_functional_currency_name,
        reportingCurrency: row.legal_entity_reporting_currency,
        reportingCurrencyName: row.legal_entity_reporting_currency_name,
        regulatoryFramework: row.legal_entity_regulatory_framework,
      },
      company: {
        id: row.company_id, code: row.company_code, name: row.company_name, status: row.company_status,
        countryCode: row.company_country_code, countryName: row.company_country_name,
        functionalCurrency: row.company_functional_currency, functionalCurrencyName: row.company_functional_currency_name,
        regulatoryFramework: row.company_regulatory_framework, timezoneCode: row.timezone_code,
        localeCode: row.locale_code, dateFormat: row.date_format, weekStart: row.week_start,
      },
    },
    domains,
    readiness,
    completedDomainCount: domains.filter((domain) => domain.status === "complete").length,
    totalDomainCount: 4,
    computedAt: new Date().toISOString(),
  };
}
