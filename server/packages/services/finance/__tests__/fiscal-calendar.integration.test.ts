import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_FINANCE_INTEGRATION === "1";
const integrationDescribe = enabled ? describe : describe.skip;
const rollbackMarker = new Error("__fiscal_calendar_rollback__");

integrationDescribe("fiscal calendar preview, generation, and posting-date resolution", () => {
  let db: Kysely<unknown>;

  beforeAll(() => {
    const connectionString = process.env.FINANCE_INTEGRATION_DATABASE_URL;
    if (!connectionString) throw new Error("FINANCE_INTEGRATION_DATABASE_URL is required");
    db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 1 }) }) });
  });

  afterAll(async () => db?.destroy());

  it("generates monthly periods, governance book gates, and resolves a posting date", async () => {
    let observation: Record<string, unknown> = {};
    try {
      await db.transaction().execute(async (trx) => {
        const fixtureQ = await sql<{
          tenant_id: string; company_code_id: string; actor_id: string; book_id: string;
          other_tenant_id: string;
        }>`
          SELECT cc.tenant_id, cc.id AS company_code_id, p.id AS actor_id, ba.book_id,
                 (SELECT t.id FROM master.tenant t WHERE t.id <> cc.tenant_id ORDER BY t.id LIMIT 1) AS other_tenant_id
            FROM master.company_code cc
            JOIN master.company_code_book_assignment ba
              ON ba.tenant_id = cc.tenant_id AND ba.company_code_id = cc.id AND ba.status = 'active'
            JOIN master.principal p ON p.tenant_id = cc.tenant_id AND p.status = 'active'
           WHERE cc.status = 'active'
           ORDER BY cc.tenant_id, cc.code, ba.priority DESC
           LIMIT 1
        `.execute(trx);
        const fixture = fixtureQ.rows[0];
        if (!fixture?.other_tenant_id) throw new Error("Integration fixture requires two tenants plus an active company, book, and principal");
        await sql`SELECT set_config('app.current_tenant_id', ${fixture.tenant_id}, true)`.execute(trx);
        await sql`SET LOCAL ROLE athyperapp`.execute(trx);

        const configQ = await sql<{ id: string }>`
          INSERT INTO control.fiscal_calendar_config (
            tenant_id, code, name, calendar_type, version_no, fiscal_year_label_rule,
            year_start_rule, anchor_month, anchor_day, week_start_day,
            periods_per_year, leap_week_rule, status, created_by
          ) VALUES (
            ${fixture.tenant_id}::uuid, 'INTEGRATION_MONTHLY', 'Integration Monthly',
            'monthly', 1, 'start_year', 'fixed_date', 1, 1, 1, 12, 'none', 'draft',
            ${fixture.actor_id}::uuid
          ) RETURNING id
        `.execute(trx);
        const calendarId = configQ.rows[0]!.id;

        await sql`
          INSERT INTO control.fiscal_calendar_period_rule (
            tenant_id, fiscal_calendar_config_id, sequence_no, period_number,
            period_type, name_template, duration_unit, duration_value, anchor,
            quarter_number, absorbs_leap_week, created_by
          )
          SELECT ${fixture.tenant_id}::uuid, ${calendarId}::uuid, rule.sequence_no,
                 rule.period_number, rule.period_type, rule.name_template,
                 rule.duration_unit, rule.duration_value, rule.anchor,
                 rule.quarter_number, false, ${fixture.actor_id}::uuid
            FROM (
              SELECT 0::smallint AS sequence_no, 0::smallint AS period_number,
                     'opening'::text AS period_type, 'Opening {year}'::text AS name_template,
                     'point'::text AS duration_unit, 1::smallint AS duration_value,
                     'year_start'::text AS anchor, NULL::smallint AS quarter_number
              UNION ALL
              SELECT n::smallint, n::smallint, 'normal', 'Period {period}', 'month', 1,
                     'sequence', LEAST(4, CEIL(n / 3.0))::smallint
                FROM generate_series(1, 12) n
              UNION ALL
              SELECT 13, 13, 'adjustment', 'Adjustment {year}', 'point', 1, 'year_end', 4
            ) rule
        `.execute(trx);

        await sql`UPDATE control.fiscal_calendar_config
                     SET status = 'active', updated_by = ${fixture.actor_id}::uuid
                   WHERE tenant_id = ${fixture.tenant_id}::uuid
                     AND id = ${calendarId}::uuid`.execute(trx);

        await sql`
          INSERT INTO control.company_fiscal_calendar_assignment (
            tenant_id, company_code_id, fiscal_calendar_config_id,
            effective_fiscal_year_from, status, created_by
          ) VALUES (
            ${fixture.tenant_id}::uuid, ${fixture.company_code_id}::uuid, ${calendarId}::uuid,
            2199, 'active', ${fixture.actor_id}::uuid
          )
        `.execute(trx);

        const previewQ = await sql<{ period_number: number; period_type: string; start_date: string; end_date: string }>`
          SELECT period_number, period_type, start_date::text, end_date::text
            FROM control.preview_fiscal_calendar(${fixture.tenant_id}::uuid, ${calendarId}::uuid, 2199)
           ORDER BY sequence_no
        `.execute(trx);
        const generatedQ = await sql<{ result: { periodCount: number; bookPeriodRowsCreated: number } }>`
          SELECT control.generate_fiscal_periods(
            ${fixture.tenant_id}::uuid, ${fixture.company_code_id}::uuid, 2199,
            ${fixture.actor_id}::uuid, ${calendarId}::uuid, true
          ) AS result
        `.execute(trx);
        const resolvedQ = await sql<{ fiscal_year: number; period_number: number; period_type: string }>`
          SELECT fiscal_year, period_number, period_type
            FROM master.resolve_fiscal_period(
              ${fixture.tenant_id}::uuid, ${fixture.company_code_id}::uuid, DATE '2199-07-15', false
            )
        `.execute(trx);
        await sql`
          INSERT INTO master.fiscal_period (
            tenant_id, code, name, company_code_id, fiscal_year, period_number,
            period_type, start_date, end_date, status, created_by
          ) VALUES (
            ${fixture.tenant_id}::uuid, 'INTEGRATION-SPECIAL-2198', 'Integration special period',
            ${fixture.company_code_id}::uuid, 2198, 13, 'adjustment',
            DATE '2198-12-31', DATE '2198-12-31', 'open', ${fixture.actor_id}::uuid
          )
        `.execute(trx);
        const normalOnlyQ = await sql<{ period_number: number }>`
          SELECT period_number FROM master.resolve_fiscal_period(
            ${fixture.tenant_id}::uuid, ${fixture.company_code_id}::uuid, DATE '2198-12-31', false
          )
        `.execute(trx);
        const specialQ = await sql<{ period_number: number; period_type: string }>`
          SELECT period_number, period_type FROM master.resolve_fiscal_period(
            ${fixture.tenant_id}::uuid, ${fixture.company_code_id}::uuid, DATE '2198-12-31', true
          )
        `.execute(trx);
        await sql`SELECT set_config('app.current_tenant_id', ${fixture.other_tenant_id}, true)`.execute(trx);
        const isolationQ = await sql<{ visible_count: string }>`
          SELECT count(*)::text AS visible_count
            FROM control.fiscal_calendar_config
           WHERE id = ${calendarId}::uuid
        `.execute(trx);
        await sql`SELECT set_config('app.current_tenant_id', ${fixture.tenant_id}, true)`.execute(trx);

        observation = {
          previewCount: previewQ.rows.length,
          firstNormal: previewQ.rows.find((row) => row.period_number === 1),
          adjustment: previewQ.rows.find((row) => row.period_type === "adjustment"),
          generated: generatedQ.rows[0]?.result,
          resolved: resolvedQ.rows[0],
          normalOnlyCount: normalOnlyQ.rows.length,
          special: specialQ.rows[0],
          crossTenantVisible: Number(isolationQ.rows[0]?.visible_count ?? "0"),
        };
        throw rollbackMarker;
      });
    } catch (error) {
      if (error !== rollbackMarker) throw error;
    }

    expect(observation).toMatchObject({
      previewCount: 14,
      firstNormal: { start_date: "2199-01-01", end_date: "2199-01-31", period_type: "normal" },
      adjustment: { start_date: "2199-12-31", end_date: "2199-12-31", period_type: "adjustment" },
      generated: { periodCount: 14 },
      resolved: { fiscal_year: 2199, period_number: 7, period_type: "normal" },
      normalOnlyCount: 0,
      special: { period_number: 13, period_type: "adjustment" },
      crossTenantVisible: 0,
    });
  });
});
