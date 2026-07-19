import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPostingRoleCoverage } from "../services/posting-role.service.js";

const enabled = process.env.RUN_FINANCE_INTEGRATION === "1";
const integrationDescribe = enabled ? describe : describe.skip;
const rollbackMarker = new Error("__posting_role_rollback__");

integrationDescribe("posting-role map, trace, readiness, and RLS", () => {
  let db: Kysely<unknown>;

  beforeAll(() => {
    const connectionString = process.env.FINANCE_INTEGRATION_DATABASE_URL;
    if (!connectionString) throw new Error("FINANCE_INTEGRATION_DATABASE_URL is required");
    db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 5 }) }) });
  });

  afterAll(async () => db?.destroy(), 30_000);

  it("resolves a canonical role, returns trace steps, feeds coverage, and rejects cross-tenant access", async () => {
    let observation: Record<string, unknown> = {};
    try {
      await db.transaction().execute(async (trx) => {
        const fixture = await sql<{
          tenant_id: string; company_code_id: string; company_code: string;
          actor_id: string; book_id: string; book_code: string; gl_account_id: string;
          incompatible_gl_account_id: string | null;
          other_tenant_id: string | null;
        }>`
          WITH company_book AS (
            SELECT cc.tenant_id, cc.id AS company_code_id, cc.code AS company_code,
                   lb.id AS book_id, lb.code AS book_code
              FROM master.company_code cc
              JOIN master.company_code_book_assignment ba
                ON ba.tenant_id = cc.tenant_id AND ba.company_code_id = cc.id AND ba.status = 'active'
              JOIN master.ledger_book lb
                ON lb.tenant_id = ba.tenant_id AND lb.id = ba.book_id AND lb.status = 'active'
             WHERE cc.status = 'active'
             ORDER BY lb.is_primary DESC, cc.code
             LIMIT 1
          )
          SELECT cb.*,
                 (SELECT p.id FROM master.principal p
                   WHERE p.tenant_id = cb.tenant_id AND p.status = 'active'
                   ORDER BY p.id LIMIT 1) AS actor_id,
                 (SELECT ga.id
                    FROM master.company_code_chart_assignment ca
                    JOIN master.gl_account ga
                      ON ga.tenant_id = ca.tenant_id AND ga.chart_of_account_id = ca.chart_of_account_id
                     AND ga.status = 'active' AND ga.node_type = 'posting'
                     AND lower(ga.normal_balance) = 'credit'
                    LEFT JOIN master.company_code_gl_account ccga
                      ON ccga.tenant_id = ga.tenant_id AND ccga.company_code_id = ca.company_code_id
                     AND ccga.gl_account_id = ga.id
                   WHERE ca.tenant_id = cb.tenant_id AND ca.company_code_id = cb.company_code_id
                     AND ca.status = 'active'
                     AND (ccga.id IS NULL OR (ccga.status = 'active' AND ccga.posting_allowed AND NOT ccga.blocked_for_auto))
                   ORDER BY ga.code LIMIT 1) AS gl_account_id,
                 (SELECT ga.id
                    FROM master.company_code_chart_assignment ca
                    JOIN master.gl_account ga
                      ON ga.tenant_id = ca.tenant_id AND ga.chart_of_account_id = ca.chart_of_account_id
                     AND ga.status = 'active' AND ga.node_type = 'posting' AND lower(ga.normal_balance) = 'debit'
                   WHERE ca.tenant_id = cb.tenant_id AND ca.company_code_id = cb.company_code_id
                     AND ca.status = 'active'
                   ORDER BY ga.code LIMIT 1) AS incompatible_gl_account_id,
                 (SELECT id FROM master.tenant WHERE id <> cb.tenant_id ORDER BY id LIMIT 1) AS other_tenant_id
            FROM company_book cb
        `.execute(trx);
        const f = fixture.rows[0];
        expect(f).toBeTruthy();

        await sql`SELECT set_config('app.current_tenant_id', ${f!.tenant_id}, true)`.execute(trx);
        await sql`SET LOCAL ROLE athyperapp`.execute(trx);

        const inserted = await sql<{ id: string }>`
          INSERT INTO control.posting_role_account_map (
            tenant_id, company_code_id, ledger_book_id, posting_role_code, gl_account_id,
            effective_from, priority, status, created_by
          ) VALUES (
            ${f!.tenant_id}::uuid, ${f!.company_code_id}::uuid, ${f!.book_id}::uuid,
            'AP_TRADE_PAYABLE', ${f!.gl_account_id}::uuid, CURRENT_DATE, 777, 'active', ${f!.actor_id}::uuid
          ) RETURNING id
        `.execute(trx);

        const trace = await sql<{ trace: Record<string, unknown> }>`
          SELECT control.resolve_posting_role_account_trace(
            ${f!.tenant_id}::uuid, 'AP_TRADE_PAYABLE', ${f!.company_code_id}::uuid,
            ${f!.book_code}, CURRENT_DATE
          ) AS trace
        `.execute(trx);
        expect(trace.rows[0]?.trace["status"]).toBe("resolved");
        expect(trace.rows[0]?.trace["glAccountId"]).toBe(f!.gl_account_id);
        expect((trace.rows[0]?.trace["steps"] as unknown[]).length).toBeGreaterThanOrEqual(4);

        const resolved = await sql<{ account_id: string | null }>`
          SELECT control.resolve_posting_role_account(
            ${f!.tenant_id}::uuid, 'ap_trade_payable', ${f!.company_code_id}::uuid,
            ${f!.book_code}, CURRENT_DATE
          ) AS account_id
        `.execute(trx);
        expect(resolved.rows[0]?.account_id).toBe(f!.gl_account_id);

        let normalBalanceRejected = !f!.incompatible_gl_account_id;
        if (f!.incompatible_gl_account_id) {
          await sql`SAVEPOINT normal_balance_check`.execute(trx);
          try {
            await sql`
              INSERT INTO control.posting_role_account_map (
                tenant_id, company_code_id, ledger_book_id, posting_role_code, gl_account_id,
                effective_from, priority, status, created_by
              ) VALUES (
                ${f!.tenant_id}::uuid, ${f!.company_code_id}::uuid, ${f!.book_id}::uuid,
                'ap_trade_payable', ${f!.incompatible_gl_account_id}::uuid,
                CURRENT_DATE, 778, 'active', ${f!.actor_id}::uuid
              )
            `.execute(trx);
          } catch {
            normalBalanceRejected = true;
            await sql`ROLLBACK TO SAVEPOINT normal_balance_check`.execute(trx);
          }
        }

        let crossTenantRejected = false;
        if (f!.other_tenant_id) {
          await sql`SAVEPOINT cross_tenant_check`.execute(trx);
          try {
            await sql`SELECT control.resolve_posting_role_account_trace(
              ${f!.other_tenant_id}::uuid, 'ap_trade_payable', ${f!.company_code_id}::uuid,
              ${f!.book_code}, CURRENT_DATE
            )`.execute(trx);
          } catch {
            crossTenantRejected = true;
            await sql`ROLLBACK TO SAVEPOINT cross_tenant_check`.execute(trx);
          }
        }
        let overlapRejected = false;
        await sql`SAVEPOINT overlap_check`.execute(trx);
        try {
          await sql`
            INSERT INTO control.posting_role_account_map (
              tenant_id, company_code_id, ledger_book_id, posting_role_code, gl_account_id,
              effective_from, priority, status, created_by
            ) VALUES (
              ${f!.tenant_id}::uuid, ${f!.company_code_id}::uuid, ${f!.book_id}::uuid,
              'ap_trade_payable', ${f!.gl_account_id}::uuid, CURRENT_DATE, 777, 'active', ${f!.actor_id}::uuid
            )
          `.execute(trx);
        } catch {
          overlapRejected = true;
          await sql`ROLLBACK TO SAVEPOINT overlap_check`.execute(trx);
        }
        observation = {
          mappingId: inserted.rows[0]?.id,
          tenantId: f!.tenant_id,
          companyCode: f!.company_code,
          bookId: f!.book_id,
          overlapRejected,
          normalBalanceRejected,
          crossTenantRejected: f!.other_tenant_id ? crossTenantRejected : true,
        };
        throw rollbackMarker;
      });
    } catch (error) {
      if (error !== rollbackMarker) throw error;
    }
    expect(observation["mappingId"]).toBeTruthy();
    expect(observation["overlapRejected"]).toBe(true);
    expect(observation["crossTenantRejected"]).toBe(true);
    expect(observation["normalBalanceRejected"]).toBe(true);
    const coverage = await loadPostingRoleCoverage(
      db as unknown as Kysely<never>, String(observation["tenantId"]), String(observation["companyCode"]),
    );
    const role = coverage.rows.find((row) => row.roleCode === "ap_trade_payable");
    expect(role).toBeTruthy();
    expect(role?.cells.some((cell) => cell.bookId === observation["bookId"])).toBe(true);
  }, 30_000);
});
