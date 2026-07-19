import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeCrossBookPosting } from "../services/cross-book-posting.service.js";

const integrationDescribe = process.env.RUN_FINANCE_INTEGRATION === "1" ? describe : describe.skip;
const rollbackMarker = new Error("__cross_book_rollback__");

integrationDescribe("cross-book posting executor", () => {
  let db: Kysely<unknown>;

  beforeAll(() => {
    const connectionString = process.env.FINANCE_INTEGRATION_DATABASE_URL;
    if (!connectionString) throw new Error("FINANCE_INTEGRATION_DATABASE_URL is required");
    db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 2 }) }) });
  });

  afterAll(async () => db?.destroy(), 30_000);

  it("derives once, traces source/target, and prevents recursive fan-out", async () => {
    let observation: Record<string, unknown> = {};
    try {
      await db.transaction().execute(async (trx) => {
        const security = await sql<{ rls_enabled: boolean; policy_count: number }>`
          SELECT c.relrowsecurity AS rls_enabled,
                 (SELECT count(*)::int FROM pg_policies p
                   WHERE p.schemaname = 'document' AND p.tablename = 'book_posting_derivation') AS policy_count
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'document' AND c.relname = 'book_posting_derivation'
        `.execute(trx);
        expect(security.rows[0]).toMatchObject({ rls_enabled: true });
        expect(security.rows[0]!.policy_count).toBeGreaterThanOrEqual(3);

        const fixture = await sql<{
          tenant_id: string; company_code_id: string; actor_id: string; fiscal_period_id: string;
          fiscal_year: number; period_number: number; posting_date: string; base_currency: string;
          source_book_id: string; target_book_id: string; debit_account_id: string; credit_account_id: string;
        }>`
          WITH candidate AS (
            SELECT cc.tenant_id, cc.id AS company_code_id, cc.functional_currency AS base_currency,
                   fp.id AS fiscal_period_id, fp.fiscal_year, fp.period_number, fp.start_date::text AS posting_date,
                   array_agg(DISTINCT assignment.book_id ORDER BY assignment.book_id) AS books
              FROM master.company_code cc
              JOIN master.fiscal_period fp ON fp.tenant_id = cc.tenant_id AND fp.company_code_id = cc.id
              JOIN master.company_code_book_assignment assignment
                ON assignment.tenant_id = cc.tenant_id AND assignment.company_code_id = cc.id AND assignment.status = 'active'
             WHERE cc.status = 'active' AND fp.period_number BETWEEN 1 AND 12
             GROUP BY cc.tenant_id, cc.id, cc.functional_currency, fp.id, fp.fiscal_year, fp.period_number, fp.start_date
            HAVING count(DISTINCT assignment.book_id) >= 2
             ORDER BY fp.fiscal_year DESC, fp.period_number DESC LIMIT 1
          )
          SELECT candidate.*,
                 (SELECT p.id FROM master.principal p WHERE p.tenant_id = candidate.tenant_id AND p.status = 'active' ORDER BY p.id LIMIT 1) AS actor_id,
                 candidate.books[1] AS source_book_id, candidate.books[2] AS target_book_id,
                 (SELECT ga.id FROM master.company_code_chart_assignment ca
                   JOIN master.gl_account ga ON ga.tenant_id = ca.tenant_id AND ga.chart_of_account_id = ca.chart_of_account_id
                    AND ga.status = 'active' AND ga.node_type = 'posting'
                  WHERE ca.tenant_id = candidate.tenant_id AND ca.company_code_id = candidate.company_code_id AND ca.status = 'active'
                  ORDER BY ga.code LIMIT 1) AS debit_account_id,
                 (SELECT ga.id FROM master.company_code_chart_assignment ca
                   JOIN master.gl_account ga ON ga.tenant_id = ca.tenant_id AND ga.chart_of_account_id = ca.chart_of_account_id
                    AND ga.status = 'active' AND ga.node_type = 'posting'
                  WHERE ca.tenant_id = candidate.tenant_id AND ca.company_code_id = candidate.company_code_id AND ca.status = 'active'
                  ORDER BY ga.code OFFSET 1 LIMIT 1) AS credit_account_id
            FROM candidate
        `.execute(trx);
        const f = fixture.rows[0];
        expect(f?.actor_id).toBeTruthy();
        expect(f?.credit_account_id).toBeTruthy();

        await sql`UPDATE master.fiscal_period SET status = 'open' WHERE tenant_id = ${f!.tenant_id}::uuid AND id = ${f!.fiscal_period_id}::uuid`.execute(trx);
        await sql`
          INSERT INTO governance.book_period_status
            (tenant_id, company_code_id, book_id, fiscal_year, period_number, status, created_by)
          VALUES
            (${f!.tenant_id}::uuid, ${f!.company_code_id}::uuid, ${f!.source_book_id}::uuid, ${f!.fiscal_year}, ${f!.period_number}, 'open', ${f!.actor_id}::uuid),
            (${f!.tenant_id}::uuid, ${f!.company_code_id}::uuid, ${f!.target_book_id}::uuid, ${f!.fiscal_year}, ${f!.period_number}, 'open', ${f!.actor_id}::uuid)
          ON CONFLICT (tenant_id, company_code_id, book_id, fiscal_year, period_number)
          DO UPDATE SET status = 'open', updated_at = now(), updated_by = ${f!.actor_id}::uuid
        `.execute(trx);

        const rule = await sql<{ id: string }>`
          INSERT INTO control.book_posting_rule
            (tenant_id, company_code_id, rule_code, rule_name, source_book_id, target_book_id,
             account_strategy, amount_strategy, recognition_timing, priority, version, status, created_by)
          VALUES (${f!.tenant_id}::uuid, ${f!.company_code_id}::uuid, 'IT_CROSS_BOOK', 'Integration cross-book rule',
                  ${f!.source_book_id}::uuid, ${f!.target_book_id}::uuid, 'same', 'mirror', 'simultaneous', 1, 1, 'active', ${f!.actor_id}::uuid)
          RETURNING id
        `.execute(trx);
        const source = await sql<{ id: string }>`
          INSERT INTO document.journal_entry
            (tenant_id, je_number, company_code_id, book_id, fiscal_period_id, fiscal_year, period_number,
             document_date, posting_date, source_doc_type, transaction_currency, base_currency,
             description, status, created_by)
          VALUES (${f!.tenant_id}::uuid, '', ${f!.company_code_id}::uuid, ${f!.source_book_id}::uuid,
                  ${f!.fiscal_period_id}::uuid, ${f!.fiscal_year}, ${f!.period_number}, ${f!.posting_date}::date,
                  ${f!.posting_date}::date, 'reclass', ${f!.base_currency}, ${f!.base_currency},
                  'Cross-book integration source', 'draft', ${f!.actor_id}::uuid)
          RETURNING id
        `.execute(trx);
        const sourceId = source.rows[0]!.id;
        await sql`
          INSERT INTO document.journal_line
            (tenant_id, journal_entry_id, line_no, gl_account_id, transaction_currency,
             transaction_debit, transaction_credit, base_currency, base_debit, base_credit, created_by)
          VALUES
            (${f!.tenant_id}::uuid, ${sourceId}::uuid, 1, ${f!.debit_account_id}::uuid, ${f!.base_currency}, 125, 0, ${f!.base_currency}, 125, 0, ${f!.actor_id}::uuid),
            (${f!.tenant_id}::uuid, ${sourceId}::uuid, 2, ${f!.credit_account_id}::uuid, ${f!.base_currency}, 0, 125, ${f!.base_currency}, 0, 125, ${f!.actor_id}::uuid)
        `.execute(trx);
        await sql`UPDATE document.journal_entry SET status = 'created', updated_by = ${f!.actor_id}::uuid WHERE tenant_id = ${f!.tenant_id}::uuid AND id = ${sourceId}::uuid`.execute(trx);
        await sql`UPDATE document.journal_entry SET status = 'posted', posted_by = ${f!.actor_id}::uuid, updated_by = ${f!.actor_id}::uuid WHERE tenant_id = ${f!.tenant_id}::uuid AND id = ${sourceId}::uuid`.execute(trx);

        const queued = await sql<{ count: number }>`SELECT count(*)::int AS count FROM event.outbox WHERE tenant_id = ${f!.tenant_id}::uuid AND event_key = ${`cross-book:${sourceId}`}`.execute(trx);
        expect(queued.rows[0]?.count).toBe(1);
        await executeCrossBookPosting(trx as unknown as Kysely<never>, { tenantId: f!.tenant_id, sourceJournalId: sourceId, actorId: f!.actor_id });
        await executeCrossBookPosting(trx as unknown as Kysely<never>, { tenantId: f!.tenant_id, sourceJournalId: sourceId, actorId: f!.actor_id });

        const trace = await sql<{ status: string; target_journal_id: string; attempt_count: number }>`
          SELECT status, target_journal_id, attempt_count FROM document.book_posting_derivation
           WHERE tenant_id = ${f!.tenant_id}::uuid AND source_journal_id = ${sourceId}::uuid AND posting_rule_id = ${rule.rows[0]!.id}::uuid
        `.execute(trx);
        const targetId = trace.rows[0]!.target_journal_id;
        const target = await sql<{ status: string; derived_from_je_id: string; posting_rule_id: string; total_debit: string; line_count: number }>`
          SELECT status, derived_from_je_id, posting_rule_id, total_debit::text, line_count
            FROM document.journal_entry WHERE tenant_id = ${f!.tenant_id}::uuid AND id = ${targetId}::uuid
        `.execute(trx);
        const derivedEvents = await sql<{ count: number }>`SELECT count(*)::int AS count FROM event.outbox WHERE tenant_id = ${f!.tenant_id}::uuid AND event_key = ${`cross-book:${targetId}`}`.execute(trx);
        let loopPrevented = false;
        try {
          await executeCrossBookPosting(trx as unknown as Kysely<never>, { tenantId: f!.tenant_id, sourceJournalId: targetId, actorId: f!.actor_id });
        } catch (error) {
          loopPrevented = (error as { code?: string }).code === "CROSS_BOOK_LOOP_PREVENTED";
        }
        observation = { trace: trace.rows[0], target: target.rows[0], derivedEventCount: derivedEvents.rows[0]?.count, loopPrevented };
        throw rollbackMarker;
      });
    } catch (error) {
      if (error !== rollbackMarker) throw error;
    }

    expect(observation).toMatchObject({
      trace: { status: "completed", attempt_count: 1 },
      target: { status: "posted", total_debit: "125.0000", line_count: 2 },
      derivedEventCount: 0,
      loopPrevented: true,
    });
    expect((observation["target"] as Record<string, unknown>)["derived_from_je_id"]).toBeTruthy();
    expect((observation["target"] as Record<string, unknown>)["posting_rule_id"]).toBeTruthy();
  }, 30_000);
});
