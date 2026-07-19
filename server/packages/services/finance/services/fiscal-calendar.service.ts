import { sql, type Kysely } from "kysely";
import { writeFinanceSetupAudit } from "./finance-setup-audit.service.js";
import { CompanyNotFoundError, ResourceNotFoundError } from "./finance-setup-mutations.service.js";

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
       WHERE tenant_id = ${tenantId}::uuid AND status = 'active'
       ORDER BY fiscal_calendar_config_id, sequence_no
    `.execute(db),
    sql<{
      id: string; fiscal_calendar_config_id: string;
      effective_fiscal_year_from: number; effective_fiscal_year_to: number | null;
      priority: number; status: string;
    }>`
      SELECT id, fiscal_calendar_config_id, effective_fiscal_year_from,
             effective_fiscal_year_to, priority, status
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
      priority: row.priority,
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
    const configQ = await sql<{ id: string }>`
      UPDATE control.fiscal_calendar_config
         SET status = 'active', updated_by = ${input.actorId}::uuid
       WHERE tenant_id = ${input.tenantId}::uuid AND id = ${input.calendarId}::uuid
         AND status IN ('draft', 'active')
       RETURNING id
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
        effective_fiscal_year_from, priority, status, created_by
      ) VALUES (
        ${input.tenantId}::uuid, ${company.id}::uuid, ${input.calendarId}::uuid,
        ${input.fiscalYearFrom}, 100, 'active', ${input.actorId}::uuid
      ) RETURNING id
    `.execute(trx);

    await writeFinanceSetupAudit(trx, {
      tenantId: input.tenantId, actorId: input.actorId, companyCodeId: company.id,
      activityType: "finance_setup.fiscal_calendar_assigned",
      entityType: "company_fiscal_calendar_assignment", entityId: assignmentQ.rows[0]!.id,
      detail: { calendar_id: input.calendarId, fiscal_year_from: input.fiscalYearFrom },
    });
    return { assignmentId: assignmentQ.rows[0]!.id, companyCodeId: company.id, calendarId: input.calendarId };
  });
}

export async function generateFiscalPeriods(
  db: AnyDb,
  input: { tenantId: string; actorId: string; companyCode: string; calendarId?: string; fiscalYear: number },
) {
  const company = await resolveCompany(db, input.tenantId, input.companyCode);
  return db.transaction().execute(async (trx) => {
    const { rows } = await sql<{ result: Record<string, unknown> }>`
      SELECT control.generate_fiscal_periods(
        ${input.tenantId}::uuid, ${company.id}::uuid, ${input.fiscalYear}::integer,
        ${input.actorId}::uuid, ${input.calendarId ?? null}::uuid, true
      ) AS result
    `.execute(trx);
    const result = rows[0]?.result ?? {};
    await writeFinanceSetupAudit(trx, {
      tenantId: input.tenantId, actorId: input.actorId, companyCodeId: company.id,
      activityType: "finance_setup.fiscal_periods_generated",
      entityType: "fiscal_calendar_config", entityId: input.calendarId ?? null,
      detail: { fiscal_year: input.fiscalYear, ...result },
    });
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

function serviceError(code: string, status: number, message: string) {
  const error = new Error(message) as Error & { code: string; status: number };
  error.code = code;
  error.status = status;
  return error;
}
