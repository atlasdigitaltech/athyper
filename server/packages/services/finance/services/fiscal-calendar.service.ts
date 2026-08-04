import { sql, type Kysely } from "kysely";
import { writeFinanceSetupAudit } from "./finance-setup-audit.service.js";
import { CompanyNotFoundError, ResourceNotFoundError, invalidateFinanceSetupReadiness } from "./finance-setup-mutations.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export type FiscalCalendarType =
  | "monthly"
  | "four_four_five"
  | "four_five_four"
  | "five_four_four"
  | "thirteen_period"
  | "custom";

export interface FiscalCalendarRuleInput {
  sequenceNo: number;
  periodNumber: number;
  periodType: "opening" | "normal" | "adjustment" | "closing";
  nameTemplate: string;
  durationUnit: "point" | "day" | "week" | "month";
  durationValue: number;
  anchor: "sequence" | "year_start" | "year_end";
  quarterNumber?: number | null;
  absorbsLeapWeek?: boolean;
}

export interface SaveFiscalCalendarInput {
  tenantId: string;
  actorId: string;
  calendarId?: string;
  code: string;
  name: string;
  description?: string | null;
  calendarType: FiscalCalendarType;
  fiscalYearLabelRule: "start_year" | "end_year";
  yearStartRule: "fixed_date" | "first_on_or_after" | "last_on_or_before" | "nearest_weekday";
  anchorMonth: number;
  anchorDay: number;
  weekStartDay: number;
  periodsPerYear: number;
  leapWeekRule: "none" | "last_period";
  rules?: FiscalCalendarRuleInput[];
}

interface RawCalendar {
  id: string;
  code: string;
  name: string;
  description: string | null;
  calendar_type: FiscalCalendarType;
  version_no: number;
  fiscal_year_label_rule: "start_year" | "end_year";
  year_start_rule: SaveFiscalCalendarInput["yearStartRule"];
  anchor_month: number;
  anchor_day: number;
  week_start_day: number;
  periods_per_year: number;
  leap_week_rule: "none" | "last_period";
  status: string;
  created_at: string;
}

interface RawRule {
  id: string;
  fiscal_calendar_config_id: string;
  sequence_no: number;
  period_number: number;
  period_type: FiscalCalendarRuleInput["periodType"];
  name_template: string;
  duration_unit: FiscalCalendarRuleInput["durationUnit"];
  duration_value: number;
  anchor: FiscalCalendarRuleInput["anchor"];
  quarter_number: number | null;
  absorbs_leap_week: boolean;
}

async function resolveCompany(db: AnyDb, tenantId: string, companyCode: string) {
  const { rows } = await sql<{ id: string; code: string; name: string }>`
    SELECT id, code, name
      FROM master.company_code
     WHERE tenant_id = ${tenantId}::uuid AND code = ${companyCode}
     LIMIT 1
  `.execute(db);
  const company = rows[0];
  if (!company) throw new CompanyNotFoundError(companyCode);
  return company;
}

export async function loadFiscalCalendarDesigner(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
) {
  const company = await resolveCompany(db, tenantId, companyCode);
  const [calendarQ, ruleQ, assignmentQ, generatedQ] = await Promise.all([
    sql<RawCalendar>`
      SELECT id, code, name, description, calendar_type, version_no,
             fiscal_year_label_rule, year_start_rule, anchor_month, anchor_day,
             week_start_day, periods_per_year, leap_week_rule, status,
             created_at::text
        FROM control.fiscal_calendar_config
       WHERE tenant_id = ${tenantId}::uuid AND status <> 'retired'
       ORDER BY code, version_no DESC
    `.execute(db),
    sql<RawRule>`
      SELECT id, fiscal_calendar_config_id, sequence_no, period_number,
             period_type, name_template, duration_unit, duration_value,
             anchor, quarter_number, absorbs_leap_week
        FROM control.fiscal_calendar_period_rule
       WHERE tenant_id = ${tenantId}::uuid
       ORDER BY fiscal_calendar_config_id, sequence_no
    `.execute(db),
    sql<{
      id: string; fiscal_calendar_config_id: string;
      effective_fiscal_year_from: number; effective_fiscal_year_to: number | null;
      status: string;
    }>`
      SELECT id, fiscal_calendar_config_id, effective_fiscal_year_from,
             effective_fiscal_year_to, status
        FROM control.company_fiscal_calendar_assignment
       WHERE tenant_id = ${tenantId}::uuid
         AND company_code_id = ${company.id}::uuid
         AND status = 'active'
       ORDER BY effective_fiscal_year_from DESC
    `.execute(db),
    sql<{
      fiscal_calendar_config_id: string | null; fiscal_year: number;
      period_count: string; first_date: string; last_date: string;
      open_count: string;
    }>`
      SELECT fiscal_calendar_config_id, fiscal_year, count(*)::text AS period_count,
             min(start_date)::text AS first_date, max(end_date)::text AS last_date,
             count(*) FILTER (WHERE status <> 'future')::text AS open_count
        FROM master.fiscal_period
       WHERE tenant_id = ${tenantId}::uuid
         AND company_code_id = ${company.id}::uuid
       GROUP BY fiscal_calendar_config_id, fiscal_year
       ORDER BY fiscal_year DESC
    `.execute(db),
  ]);

  const rulesByCalendar = new Map<string, RawRule[]>();
  for (const rule of ruleQ.rows) {
    const rules = rulesByCalendar.get(rule.fiscal_calendar_config_id) ?? [];
    rules.push(rule);
    rulesByCalendar.set(rule.fiscal_calendar_config_id, rules);
  }

  return {
    company,
    calendars: calendarQ.rows.map((calendar) => ({
      id: calendar.id,
      code: calendar.code,
      name: calendar.name,
      description: calendar.description,
      calendarType: calendar.calendar_type,
      versionNo: calendar.version_no,
      fiscalYearLabelRule: calendar.fiscal_year_label_rule,
      yearStartRule: calendar.year_start_rule,
      anchorMonth: calendar.anchor_month,
      anchorDay: calendar.anchor_day,
      weekStartDay: calendar.week_start_day,
      periodsPerYear: calendar.periods_per_year,
      leapWeekRule: calendar.leap_week_rule,
      status: calendar.status,
      createdAt: calendar.created_at,
      rules: (rulesByCalendar.get(calendar.id) ?? []).map((rule) => ({
        id: rule.id,
        sequenceNo: rule.sequence_no,
        periodNumber: rule.period_number,
        periodType: rule.period_type,
        nameTemplate: rule.name_template,
        durationUnit: rule.duration_unit,
        durationValue: rule.duration_value,
        anchor: rule.anchor,
        quarterNumber: rule.quarter_number,
        absorbsLeapWeek: rule.absorbs_leap_week,
      })),
    })),
    assignments: assignmentQ.rows.map((row) => ({
      id: row.id,
      calendarId: row.fiscal_calendar_config_id,
      fiscalYearFrom: row.effective_fiscal_year_from,
      fiscalYearTo: row.effective_fiscal_year_to,
      status: row.status,
    })),
    generatedYears: generatedQ.rows.map((row) => ({
      calendarId: row.fiscal_calendar_config_id,
      fiscalYear: row.fiscal_year,
      periodCount: Number(row.period_count),
      firstDate: row.first_date,
      lastDate: row.last_date,
      nonFutureCount: Number(row.open_count),
    })),
  };
}

export interface FiscalPeriodMatrixPayload {
  company: { id: string; code: string; name: string };
  fiscalYear: number;
  assignment: null | { id: string; calendarId: string; calendarCode: string; calendarName: string; calendarVersion: number; calendarType: FiscalCalendarType; anchorMonth: number; fiscalYearFrom: number; fiscalYearTo: number | null };
  books: Array<{ bookId: string; bookCode: string; bookName: string; isPrimary: boolean }>;
  rows: Array<{ periodId: string; periodNumber: number; periodType: string; name: string; startDate: string; endDate: string; companyStatus: string;
    calendarId: string | null; calendarVersion: number | null; generationKey: string | null; generatedAt: string | null;
    bookStatuses: Record<string, { status: string; gateId: string; metadata: Record<string, unknown> }> }>;
  conflicts: Array<{ code: string; severity: "blocking" | "warning" | "info"; message: string; periodNumber?: number; bookId?: string }>;
  evidence: { generatedPeriodCount: number; bookGateCount: number; lastGeneratedAt: string | null; generationKeys: string[]; sourceCalendar: string | null };
  canGenerate: boolean;
}

export async function loadFiscalPeriodMatrix(db: AnyDb, tenantId: string, companyCode: string, fiscalYear: number): Promise<FiscalPeriodMatrixPayload> {
  const companyQ = await sql<{ id: string; code: string; name: string }>`
    SELECT id, code, name
      FROM master.company_code WHERE tenant_id = ${tenantId}::uuid AND lower(code) = lower(${companyCode}) LIMIT 1`.execute(db);
  const company = companyQ.rows[0];
  if (!company) throw new CompanyNotFoundError(companyCode);

  const [assignmentQ, booksQ, periodsQ, gatesQ] = await Promise.all([
    sql<{ id: string; calendar_id: string; calendar_code: string; calendar_name: string; version_no: number; calendar_type: FiscalCalendarType; anchor_month: number; fiscal_year_from: number; fiscal_year_to: number | null }>`
      SELECT a.id, c.id AS calendar_id, c.code AS calendar_code, c.name AS calendar_name, c.version_no, c.calendar_type, c.anchor_month,
             a.effective_fiscal_year_from AS fiscal_year_from, a.effective_fiscal_year_to AS fiscal_year_to
        FROM control.company_fiscal_calendar_assignment a JOIN control.fiscal_calendar_config c ON c.tenant_id = a.tenant_id AND c.id = a.fiscal_calendar_config_id
       WHERE a.tenant_id = ${tenantId}::uuid AND a.company_code_id = ${company.id}::uuid AND a.status = 'active' AND c.status = 'active'
         AND a.effective_fiscal_year_from <= ${fiscalYear} AND (a.effective_fiscal_year_to IS NULL OR a.effective_fiscal_year_to >= ${fiscalYear})
       ORDER BY a.effective_fiscal_year_from DESC`.execute(db),
    sql<{ id: string; code: string; name: string; is_default: boolean; effective_from: string; effective_to: string | null }>`
      SELECT lb.id, lb.code, lb.name, lb.is_primary AS is_default,
             ba.effective_from::text, ba.effective_to::text
        FROM master.company_code_book_assignment ba JOIN master.ledger_book lb ON lb.tenant_id = ba.tenant_id AND lb.id = ba.book_id
       WHERE ba.tenant_id = ${tenantId}::uuid AND ba.company_code_id = ${company.id}::uuid AND ba.status = 'active' AND lb.status = 'active'
       ORDER BY is_default DESC, ba.priority DESC, lb.code`.execute(db),
    sql<{ id: string; period_number: number; period_type: string; name: string; start_date: string; end_date: string; status: string;
      fiscal_calendar_config_id: string | null; calendar_version_no: number | null; generation_key: string | null; generated_at: string | null }>`
      SELECT id, period_number, period_type, name, start_date::text, end_date::text, status,
             fiscal_calendar_config_id, calendar_version_no, generation_key, generated_at::text
        FROM master.fiscal_period WHERE tenant_id = ${tenantId}::uuid AND company_code_id = ${company.id}::uuid AND fiscal_year = ${fiscalYear}
       ORDER BY sort_order, period_number`.execute(db),
    sql<{ id: string; book_id: string; period_number: number; status: string; metadata: Record<string, unknown> }>`
      SELECT gate.id, gate.ledger_book_id AS book_id, period.period_number,
             gate.status, '{}'::jsonb AS metadata
        FROM ledger.book_period_status gate
        JOIN master.fiscal_period period
          ON period.tenant_id = gate.tenant_id
         AND period.id = gate.fiscal_period_id
       WHERE gate.tenant_id = ${tenantId}::uuid
         AND period.company_code_id = ${company.id}::uuid
         AND period.fiscal_year = ${fiscalYear}`.execute(db),
  ]);

  const assignmentRow = assignmentQ.rows[0] ?? null;
  const assignment = assignmentRow ? { id: assignmentRow.id, calendarId: assignmentRow.calendar_id, calendarCode: assignmentRow.calendar_code,
    calendarName: assignmentRow.calendar_name, calendarVersion: assignmentRow.version_no, calendarType: assignmentRow.calendar_type, anchorMonth: assignmentRow.anchor_month,
    fiscalYearFrom: assignmentRow.fiscal_year_from, fiscalYearTo: assignmentRow.fiscal_year_to } : null;
  const conflicts: FiscalPeriodMatrixPayload["conflicts"] = [];
  if (!assignment) conflicts.push({ code: "CALENDAR_ASSIGNMENT_MISSING", severity: "blocking", message: `No active Fiscal Calendar assignment covers FY ${fiscalYear}.` });
  if (assignmentQ.rows.length > 1) conflicts.push({ code: "CALENDAR_ASSIGNMENT_OVERLAP", severity: "blocking", message: `${assignmentQ.rows.length} active Calendar assignments cover FY ${fiscalYear}.` });

  let previewRows: Array<{ period_number: number; period_type: string; start_date: string; end_date: string }> = [];
  if (assignment) {
    const previewQ = await sql<{ period_number: number; period_type: string; start_date: string; end_date: string }>`SELECT period_number, period_type, start_date::text, end_date::text
      FROM control.preview_fiscal_calendar(${tenantId}::uuid, ${assignment.calendarId}::uuid, ${fiscalYear})`.execute(db);
    previewRows = previewQ.rows;
  }
  const boundaryRows = previewRows.length ? previewRows : periodsQ.rows;
  const fiscalStart = boundaryRows.map((row) => row.start_date).sort()[0] ?? null;
  const fiscalEnd = boundaryRows.map((row) => row.end_date).sort().at(-1) ?? null;
  const applicableBooks = fiscalStart && fiscalEnd
    ? booksQ.rows.filter((book) => book.effective_from <= fiscalEnd && (!book.effective_to || book.effective_to >= fiscalStart))
    : booksQ.rows;
  const previewByNumber = new Map(previewRows.map((row) => [row.period_number, row]));
  for (const period of periodsQ.rows) {
    const expected = previewByNumber.get(period.period_number);
    if (assignment && period.fiscal_calendar_config_id !== assignment.calendarId) conflicts.push({ code: "CALENDAR_PROVENANCE_MISMATCH", severity: period.status === "future" ? "warning" : "blocking", periodNumber: period.period_number, message: `P${period.period_number} was generated from another Calendar version.` });
    if (assignment && !expected) conflicts.push({ code: "PERIOD_NOT_IN_CALENDAR", severity: period.status === "future" ? "warning" : "blocking", periodNumber: period.period_number, message: `P${period.period_number} does not exist in the assigned Calendar preview.` });
    if (expected && (expected.period_type !== period.period_type || expected.start_date !== period.start_date || expected.end_date !== period.end_date)) conflicts.push({ code: "PERIOD_DEFINITION_DRIFT", severity: period.status === "future" ? "warning" : "blocking", periodNumber: period.period_number, message: `P${period.period_number} dates or semantic type differ from the assigned Calendar preview.` });
  }
  const normalPeriods = periodsQ.rows.filter((row) => row.period_type === "normal").sort((a, b) => a.start_date.localeCompare(b.start_date));
  for (let index = 1; index < normalPeriods.length; index += 1) {
    if (normalPeriods[index]!.start_date <= normalPeriods[index - 1]!.end_date) {
      const replaceable = normalPeriods[index]!.status === "future" && normalPeriods[index - 1]!.status === "future";
      conflicts.push({ code: "NORMAL_PERIOD_OVERLAP", severity: replaceable ? "warning" : "blocking", periodNumber: normalPeriods[index]!.period_number, message: `Normal period P${normalPeriods[index]!.period_number} overlaps its predecessor.` });
    }
  }
  const gateByKey = new Map(gatesQ.rows.map((gate) => [`${gate.period_number}:${gate.book_id}`, gate]));
  for (const period of periodsQ.rows) for (const book of applicableBooks) if (!gateByKey.has(`${period.period_number}:${book.id}`)) conflicts.push({ code: "BOOK_PERIOD_GATE_MISSING", severity: "warning", periodNumber: period.period_number, bookId: book.id, message: `${book.code} has no period gate for P${period.period_number}; generation will seed it.` });
  if (periodsQ.rows.length === 0 && assignment) conflicts.push({ code: "PERIODS_NOT_GENERATED", severity: "info", message: `FY ${fiscalYear} has not been generated.` });

  const rows = periodsQ.rows.map((period) => ({
    periodId: period.id, periodNumber: period.period_number, periodType: period.period_type, name: period.name,
    startDate: period.start_date, endDate: period.end_date, companyStatus: period.status, calendarId: period.fiscal_calendar_config_id,
    calendarVersion: period.calendar_version_no, generationKey: period.generation_key, generatedAt: period.generated_at,
    bookStatuses: Object.fromEntries(applicableBooks.flatMap((book) => {
      const gate = gateByKey.get(`${period.period_number}:${book.id}`);
      return gate ? [[book.id, { status: gate.status, gateId: gate.id, metadata: gate.metadata }]] : [];
    })),
  }));
  const generationKeys = periodsQ.rows.flatMap((row) => row.generation_key ? [row.generation_key] : []);
  const generatedAtValues = periodsQ.rows.flatMap((row) => row.generated_at ? [row.generated_at] : []).sort();
  return {
    company: { id: company.id, code: company.code, name: company.name },
    fiscalYear, assignment,
    books: applicableBooks.map((book) => ({ bookId: book.id, bookCode: book.code, bookName: book.name, isPrimary: book.is_default })),
    rows, conflicts, evidence: { generatedPeriodCount: periodsQ.rows.length, bookGateCount: gatesQ.rows.length,
      lastGeneratedAt: generatedAtValues.at(-1) ?? null, generationKeys, sourceCalendar: assignment ? `${assignment.calendarCode} v${assignment.calendarVersion}` : null },
    canGenerate: Boolean(assignment) && !conflicts.some((conflict) => conflict.severity === "blocking"),
  };
}

export async function previewFiscalCalendar(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
  calendarId: string,
  fiscalYear: number,
) {
  await resolveCompany(db, tenantId, companyCode);
  const { rows } = await sql<{
    sequence_no: number; period_number: number; period_type: string;
    period_name: string; start_date: string; end_date: string;
    quarter_number: number | null; is_adjustment: boolean;
  }>`
    SELECT sequence_no, period_number, period_type, period_name,
           start_date::text, end_date::text, quarter_number, is_adjustment
      FROM control.preview_fiscal_calendar(
          ${tenantId}::uuid, ${calendarId}::uuid, ${fiscalYear}::integer
      )
     ORDER BY sequence_no
  `.execute(db);
  return {
    calendarId,
    fiscalYear,
    periods: rows.map((row) => ({
      sequenceNo: row.sequence_no,
      periodNumber: row.period_number,
      periodType: row.period_type,
      name: row.period_name,
      startDate: row.start_date,
      endDate: row.end_date,
      quarterNumber: row.quarter_number,
      isAdjustment: row.is_adjustment,
    })),
  };
}

export async function saveFiscalCalendar(db: AnyDb, input: SaveFiscalCalendarInput) {
  const rules = input.rules?.length ? input.rules : buildTemplateRules(input.calendarType, input.periodsPerYear);
  validateInput(input, rules);

  return db.transaction().execute(async (trx) => {
    let calendarId = input.calendarId;
    let versionNo = 1;

    if (calendarId) {
      const current = await sql<{ status: string; version_no: number }>`
        SELECT status, version_no
          FROM control.fiscal_calendar_config
         WHERE tenant_id = ${input.tenantId}::uuid AND id = ${calendarId}::uuid
         FOR UPDATE
      `.execute(trx);
      if (!current.rows[0]) throw new ResourceNotFoundError("FISCAL_CALENDAR_NOT_FOUND", "Fiscal calendar was not found.");
      if (current.rows[0].status !== "draft") {
        throw serviceError("FISCAL_CALENDAR_VERSION_LOCKED", 409,
          "An active calendar version is immutable. Create a new version before changing its rules.");
      }
      versionNo = current.rows[0].version_no;
      await sql`
        UPDATE control.fiscal_calendar_config
           SET code = ${normaliseCode(input.code)}, name = ${input.name.trim()},
               description = ${input.description ?? null}, calendar_type = ${input.calendarType},
               fiscal_year_label_rule = ${input.fiscalYearLabelRule}, year_start_rule = ${input.yearStartRule},
               anchor_month = ${input.anchorMonth}, anchor_day = ${input.anchorDay},
               week_start_day = ${input.weekStartDay}, periods_per_year = ${input.periodsPerYear},
               leap_week_rule = ${input.leapWeekRule}, updated_by = ${input.actorId}::uuid
         WHERE tenant_id = ${input.tenantId}::uuid AND id = ${calendarId}::uuid
      `.execute(trx);
      await sql`DELETE FROM control.fiscal_calendar_period_rule
                 WHERE tenant_id = ${input.tenantId}::uuid
                   AND fiscal_calendar_config_id = ${calendarId}::uuid`.execute(trx);
    } else {
      const versionQ = await sql<{ next_version: number; supersedes_id: string | null }>`
        SELECT COALESCE(max(version_no), 0)::integer + 1 AS next_version,
               (array_agg(id ORDER BY version_no DESC))[1] AS supersedes_id
          FROM control.fiscal_calendar_config
         WHERE tenant_id = ${input.tenantId}::uuid AND code = ${normaliseCode(input.code)}
      `.execute(trx);
      versionNo = versionQ.rows[0]?.next_version ?? 1;
      const supersedesId = versionQ.rows[0]?.supersedes_id ?? null;
      const insertQ = await sql<{ id: string }>`
        INSERT INTO control.fiscal_calendar_config (
          tenant_id, code, name, description, calendar_type, version_no,
          fiscal_year_label_rule, year_start_rule, anchor_month, anchor_day,
          week_start_day, periods_per_year, leap_week_rule, supersedes_id, status, created_by
        ) VALUES (
          ${input.tenantId}::uuid, ${normaliseCode(input.code)}, ${input.name.trim()},
          ${input.description ?? null}, ${input.calendarType}, ${versionNo},
          ${input.fiscalYearLabelRule}, ${input.yearStartRule}, ${input.anchorMonth}, ${input.anchorDay},
          ${input.weekStartDay}, ${input.periodsPerYear}, ${input.leapWeekRule}, ${supersedesId}::uuid,
          'draft', ${input.actorId}::uuid
        ) RETURNING id
      `.execute(trx);
      calendarId = insertQ.rows[0]!.id;
    }

    for (const rule of rules) {
      await sql`
        INSERT INTO control.fiscal_calendar_period_rule (
          tenant_id, fiscal_calendar_config_id, sequence_no, period_number,
          period_type, name_template, duration_unit, duration_value, anchor,
          quarter_number, absorbs_leap_week, sort_order, created_by
        ) VALUES (
          ${input.tenantId}::uuid, ${calendarId}::uuid, ${rule.sequenceNo}, ${rule.periodNumber},
          ${rule.periodType}, ${rule.nameTemplate}, ${rule.durationUnit}, ${rule.durationValue}, ${rule.anchor},
          ${rule.quarterNumber ?? null}, ${rule.absorbsLeapWeek ?? false}, ${rule.sequenceNo}, ${input.actorId}::uuid
        )
      `.execute(trx);
    }

    await writeFinanceSetupAudit(trx, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      activityType: input.calendarId ? "finance_setup.fiscal_calendar_updated" : "finance_setup.fiscal_calendar_created",
      entityType: "fiscal_calendar_config",
      entityId: calendarId!,
      detail: { code: normaliseCode(input.code), version_no: versionNo, calendar_type: input.calendarType },
    });
    return { calendarId, versionNo, status: "draft", ruleCount: rules.length };
  });
}

export async function retireFiscalCalendar(db: AnyDb, tenantId: string, actorId: string, calendarId: string) {
  const { rows } = await sql<{ id: string }>`
    UPDATE control.fiscal_calendar_config c
       SET status = 'retired', updated_by = ${actorId}::uuid
     WHERE c.tenant_id = ${tenantId}::uuid AND c.id = ${calendarId}::uuid
       AND NOT EXISTS (
         SELECT 1 FROM control.company_fiscal_calendar_assignment a
          WHERE a.tenant_id = c.tenant_id AND a.fiscal_calendar_config_id = c.id AND a.status = 'active'
       )
     RETURNING id
  `.execute(db);
  if (!rows[0]) throw serviceError("FISCAL_CALENDAR_IN_USE", 409, "Remove active company assignments before retiring this calendar.");
  await writeFinanceSetupAudit(db, {
    tenantId, actorId, activityType: "finance_setup.fiscal_calendar_updated",
    entityType: "fiscal_calendar_config", entityId: calendarId,
    detail: { status: "retired" },
  });
  return { calendarId, status: "retired" };
}

export async function assignFiscalCalendar(
  db: AnyDb,
  input: { tenantId: string; actorId: string; companyCode: string; calendarId: string; fiscalYearFrom: number },
) {
  return db.transaction().execute(async (trx) => {
    const company = await resolveCompany(trx, input.tenantId, input.companyCode);
    const configQ = await sql<{ id: string; calendar_type: FiscalCalendarType; anchor_month: number }>`
      UPDATE control.fiscal_calendar_config
         SET status = 'active', updated_by = ${input.actorId}::uuid
       WHERE tenant_id = ${input.tenantId}::uuid AND id = ${input.calendarId}::uuid
         AND status IN ('draft', 'active')
       RETURNING id, calendar_type, anchor_month
    `.execute(trx);
    if (!configQ.rows[0]) throw new ResourceNotFoundError("FISCAL_CALENDAR_NOT_FOUND", "Fiscal calendar was not found.");

    // Preserve historical assignments that begin before the new version.
    // Only the overlapping future portion is closed.
    await sql`
      UPDATE control.company_fiscal_calendar_assignment
         SET effective_fiscal_year_to = ${input.fiscalYearFrom - 1},
             updated_by = ${input.actorId}::uuid
       WHERE tenant_id = ${input.tenantId}::uuid
         AND company_code_id = ${company.id}::uuid
         AND status = 'active'
         AND effective_fiscal_year_from < ${input.fiscalYearFrom}
         AND COALESCE(effective_fiscal_year_to, 32767) >= ${input.fiscalYearFrom}
    `.execute(trx);

    await sql`
      UPDATE control.company_fiscal_calendar_assignment
         SET status = 'inactive', updated_by = ${input.actorId}::uuid
       WHERE tenant_id = ${input.tenantId}::uuid
         AND company_code_id = ${company.id}::uuid
         AND status = 'active'
         AND effective_fiscal_year_from >= ${input.fiscalYearFrom}
    `.execute(trx);

    const assignmentQ = await sql<{ id: string }>`
      INSERT INTO control.company_fiscal_calendar_assignment (
        tenant_id, company_code_id, fiscal_calendar_config_id,
        effective_fiscal_year_from, status, created_by
      ) VALUES (
        ${input.tenantId}::uuid, ${company.id}::uuid, ${input.calendarId}::uuid,
        ${input.fiscalYearFrom}, 'active', ${input.actorId}::uuid
      ) RETURNING id
    `.execute(trx);

    await writeFinanceSetupAudit(trx, {
      tenantId: input.tenantId, actorId: input.actorId, companyCodeId: company.id,
      activityType: "finance_setup.fiscal_calendar_assigned",
      entityType: "company_fiscal_calendar_assignment", entityId: assignmentQ.rows[0]!.id,
      detail: { calendar_id: input.calendarId, fiscal_year_from: input.fiscalYearFrom,
        calendar_type: configQ.rows[0]!.calendar_type, anchor_month: configQ.rows[0]!.anchor_month },
    });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, company.id, input.actorId, "Company Fiscal Calendar assignment changed");
    return { assignmentId: assignmentQ.rows[0]!.id, companyCodeId: company.id, calendarId: input.calendarId };
  });
}

export async function generateFiscalPeriods(
  db: AnyDb,
  input: { tenantId: string; actorId: string; companyCode: string; calendarId?: string; fiscalYear: number },
) {
  const company = await resolveCompany(db, input.tenantId, input.companyCode);
  const preflight = await loadFiscalPeriodMatrix(db, input.tenantId, input.companyCode, input.fiscalYear);
  if (!preflight.canGenerate) {
    throw serviceError("FISCAL_PERIOD_GENERATION_CONFLICT", 409, "Resolve protected period or Calendar assignment conflicts before generation.", {
      fiscalYear: input.fiscalYear, conflicts: preflight.conflicts, evidence: preflight.evidence,
    });
  }
  return db.transaction().execute(async (trx) => {
    let rows: Array<{ result: Record<string, unknown> }>;
    try {
      const generated = await sql<{ result: Record<string, unknown> }>`
        SELECT control.generate_fiscal_periods(
          ${input.tenantId}::uuid, ${company.id}::uuid, ${input.fiscalYear}::integer,
          ${input.actorId}::uuid, ${input.calendarId ?? null}::uuid, true
        ) AS result
      `.execute(trx);
      rows = generated.rows;
    } catch (error) {
      const databaseError = error as Error & { code?: string; detail?: string; constraint?: string };
      throw serviceError("FISCAL_PERIOD_GENERATION_CONFLICT", 409, databaseError.message, {
        fiscalYear: input.fiscalYear, databaseCode: databaseError.code, detail: databaseError.detail,
        constraint: databaseError.constraint, preflight: preflight.conflicts, evidence: preflight.evidence,
      });
    }
    const result = rows[0]?.result ?? {};
    await writeFinanceSetupAudit(trx, {
      tenantId: input.tenantId, actorId: input.actorId, companyCodeId: company.id,
      activityType: "finance_setup.fiscal_periods_generated",
      entityType: "fiscal_calendar_config", entityId: input.calendarId ?? null,
      detail: { fiscal_year: input.fiscalYear, ...result },
    });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, company.id, input.actorId, "Company fiscal periods regenerated");
    return result;
  });
}

export function buildTemplateRules(type: FiscalCalendarType, periodsPerYear: number): FiscalCalendarRuleInput[] {
  const rules: FiscalCalendarRuleInput[] = [{
    sequenceNo: 0, periodNumber: 0, periodType: "opening", nameTemplate: "Opening {year}",
    durationUnit: "point", durationValue: 1, anchor: "year_start", quarterNumber: null,
  }];

  const weekPattern = type === "four_four_five" ? [4, 4, 5]
    : type === "four_five_four" ? [4, 5, 4]
      : type === "five_four_four" ? [5, 4, 4]
        : null;

  for (let index = 1; index <= periodsPerYear; index += 1) {
    const isWeekly = weekPattern !== null || type === "thirteen_period";
    const durationValue = weekPattern ? weekPattern[(index - 1) % 3]! : isWeekly ? 4 : 1;
    rules.push({
      sequenceNo: index,
      periodNumber: index,
      periodType: "normal",
      nameTemplate: "Period {period}",
      durationUnit: isWeekly ? "week" : "month",
      durationValue,
      anchor: "sequence",
      quarterNumber: Math.min(4, Math.ceil(index / Math.max(1, periodsPerYear / 4))),
      absorbsLeapWeek: isWeekly && index === periodsPerYear,
    });
  }
  if (periodsPerYear < 16) {
    rules.push({
      sequenceNo: periodsPerYear + 1,
      periodNumber: periodsPerYear + 1,
      periodType: "adjustment",
      nameTemplate: "Adjustment {year}",
      durationUnit: "point",
      durationValue: 1,
      anchor: "year_end",
      quarterNumber: 4,
    });
  }
  return rules;
}

function validateInput(input: SaveFiscalCalendarInput, rules: FiscalCalendarRuleInput[]) {
  if (!input.code.trim() || !input.name.trim()) throw serviceError("INVALID_CALENDAR", 400, "Calendar code and name are required.");
  if (input.anchorMonth < 1 || input.anchorMonth > 12 || input.anchorDay < 1 || input.anchorDay > 31) {
    throw serviceError("INVALID_ANCHOR", 400, "Anchor month/day is outside the valid range.");
  }
  if (input.periodsPerYear < 1 || input.periodsPerYear > 16) {
    throw serviceError("INVALID_PERIOD_COUNT", 400, "Periods per year must be between 1 and 16.");
  }
  const normalCount = rules.filter((rule) => rule.periodType === "normal").length;
  if (normalCount !== input.periodsPerYear) {
    throw serviceError("INVALID_RULE_COUNT", 400, `Expected ${input.periodsPerYear} normal rules; received ${normalCount}.`);
  }
  const periodNumbers = new Set(rules.map((rule) => rule.periodNumber));
  if (periodNumbers.size !== rules.length) throw serviceError("DUPLICATE_PERIOD", 400, "Period numbers must be unique.");
}

function normaliseCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "_");
}

function serviceError(code: string, status: number, message: string, details?: Record<string, unknown>) {
  const error = new Error(message) as Error & { code: string; status: number; details?: Record<string, unknown> };
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}
