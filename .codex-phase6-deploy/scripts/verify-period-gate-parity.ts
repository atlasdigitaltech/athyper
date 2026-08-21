#!/usr/bin/env tsx
/**
 * Period-gate parity (CI gate)
 *
 * Verifies @athyper/finance-rules against the actual
 * document.trg_je_period_gate_fn trigger. This intentionally fires the trigger
 * on a temporary probe table inside a rollback-only transaction; it does not
 * rely on a hand-transcribed SQL predicate.
 */

import pg from "pg";
import type { PoolClient } from "pg";
import {
  decidePeriodGate,
  type FiscalPeriodStatus,
  type PeriodGateDecision,
} from "@athyper/finance-rules";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const STATUSES: readonly FiscalPeriodStatus[] = ["future", "open", "soft_close", "hard_close"];
const MISSING_BOOK_ID = "00000000-0000-0000-0000-000000000001";

interface FixtureRow {
  tenant_id: string;
  company_code_id: string;
  book_id: string;
  bps_id: string;
  fiscal_period_id: string;
  fiscal_year: number;
  period_number: number;
}

interface CaseResult {
  label: string;
  fiscalStatus: FiscalPeriodStatus;
  bookStatus: FiscalPeriodStatus | null;
  operation: "forward_posting" | "reversal";
  sqlDecision: PeriodGateDecision;
  jsDecision: PeriodGateDecision;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const fixture = await loadFixture(client);
    if (!fixture) {
      throw new Error("No fiscal/book period fixture found; seed master.fiscal_period and governance.book_period_status first.");
    }

    await createProbeTable(client, fixture);

    const disagreements: CaseResult[] = [];

    for (const fiscalStatus of STATUSES) {
      await client.query(
        `UPDATE master.fiscal_period SET status = $1 WHERE id = $2`,
        [fiscalStatus, fixture.fiscal_period_id],
      );

      for (const bookStatus of [null, ...STATUSES] as Array<FiscalPeriodStatus | null>) {
        if (bookStatus) {
          await client.query(
            `UPDATE governance.book_period_status SET status = $1 WHERE id = $2`,
            [bookStatus, fixture.bps_id],
          );
        }

        const sqlDecision = await tryForwardInsert(client, fixture, bookStatus);
        const jsDecision = decidePeriodGate({
          fiscalPeriodStatus: fiscalStatus,
          bookPeriodStatus: bookStatus,
        });
        if (!sameDecision(sqlDecision, jsDecision)) {
          disagreements.push({
            label: "forward",
            fiscalStatus,
            bookStatus,
            operation: "forward_posting",
            sqlDecision,
            jsDecision,
          });
        }
      }
    }

    await client.query(
      `UPDATE master.fiscal_period SET status = 'hard_close' WHERE id = $1`,
      [fixture.fiscal_period_id],
    );
    await client.query(
      `UPDATE governance.book_period_status SET status = 'hard_close' WHERE id = $1`,
      [fixture.bps_id],
    );

    const sqlReversal = await tryReversalUpdate(client);
    const jsReversal = decidePeriodGate(
      { fiscalPeriodStatus: "hard_close", bookPeriodStatus: "hard_close" },
      "reversal",
    );
    if (!sameDecision(sqlReversal, jsReversal)) {
      disagreements.push({
        label: "reversal",
        fiscalStatus: "hard_close",
        bookStatus: "hard_close",
        operation: "reversal",
        sqlDecision: sqlReversal,
        jsDecision: jsReversal,
      });
    }

    if (disagreements.length > 0) {
      console.error(`period-gate parity FAILED - ${disagreements.length} disagreement(s):`);
      for (const item of disagreements) {
        console.error(
          `  ${item.label} ${item.operation} fp=${item.fiscalStatus} bps=${item.bookStatus ?? "missing"}` +
          ` -> SQL=${formatDecision(item.sqlDecision)} JS=${formatDecision(item.jsDecision)}`,
        );
      }
      process.exitCode = 1;
      return;
    }

    console.log("period-gate parity OK - trigger and @athyper/finance-rules agree.");
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

async function loadFixture(client: PoolClient): Promise<FixtureRow | null> {
  const res = await client.query<FixtureRow>(`
    SELECT
      fp.tenant_id,
      fp.company_code_id,
      bps.book_id,
      bps.id AS bps_id,
      fp.id AS fiscal_period_id,
      fp.fiscal_year,
      fp.period_number
    FROM master.fiscal_period fp
    JOIN governance.book_period_status bps
      ON bps.tenant_id       = fp.tenant_id
     AND bps.company_code_id = fp.company_code_id
     AND bps.fiscal_year     = fp.fiscal_year
     AND bps.period_number   = fp.period_number
    ORDER BY fp.created_at NULLS LAST
    LIMIT 1
  `);
  return res.rows[0] ?? null;
}

async function createProbeTable(client: PoolClient, fixture: FixtureRow): Promise<void> {
  await client.query(`
    CREATE TEMP TABLE period_gate_probe (
      probe_id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      company_code_id uuid NOT NULL,
      book_id uuid NOT NULL,
      fiscal_period_id uuid NOT NULL,
      fiscal_year smallint NOT NULL,
      period_number smallint NOT NULL,
      posting_date date NOT NULL DEFAULT CURRENT_DATE,
      status text NOT NULL
    ) ON COMMIT DROP
  `);

  await client.query(`
    INSERT INTO period_gate_probe (
      probe_id, tenant_id, company_code_id, book_id, fiscal_period_id,
      fiscal_year, period_number, status
    )
    VALUES (
      '00000000-0000-0000-0000-000000000010',
      $1, $2, $3, $4, $5, $6, 'posted'
    )
  `, [
    fixture.tenant_id,
    fixture.company_code_id,
    fixture.book_id,
    fixture.fiscal_period_id,
    fixture.fiscal_year,
    fixture.period_number,
  ]);

  await client.query(`
    CREATE TRIGGER trg_period_gate_probe
      BEFORE INSERT OR UPDATE OF status, posting_date, fiscal_period_id, book_id, company_code_id
      ON period_gate_probe
      FOR EACH ROW
      EXECUTE FUNCTION document.trg_je_period_gate_fn()
  `);
}

async function tryForwardInsert(
  client: PoolClient,
  fixture: FixtureRow,
  bookStatus: FiscalPeriodStatus | null,
): Promise<PeriodGateDecision> {
  const bookId = bookStatus == null ? MISSING_BOOK_ID : fixture.book_id;
  await client.query("SAVEPOINT period_gate_case");
  try {
    await client.query(`
      INSERT INTO period_gate_probe (
        probe_id, tenant_id, company_code_id, book_id, fiscal_period_id,
        fiscal_year, period_number, status
      )
      VALUES (
        shared.uuidv7(), $1, $2, $3, $4, $5, $6, 'created'
      )
    `, [
      fixture.tenant_id,
      fixture.company_code_id,
      bookId,
      fixture.fiscal_period_id,
      fixture.fiscal_year,
      fixture.period_number,
    ]);
    await client.query("ROLLBACK TO SAVEPOINT period_gate_case");
    return { allowed: true, reason: "forward_open" };
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT period_gate_case");
    return decisionFromTriggerError(err, bookStatus);
  }
}

async function tryReversalUpdate(client: PoolClient): Promise<PeriodGateDecision> {
  await client.query("SAVEPOINT period_gate_reversal");
  try {
    await client.query(`
      UPDATE period_gate_probe
         SET status = 'reversed'
       WHERE probe_id = '00000000-0000-0000-0000-000000000010'
    `);
    await client.query("ROLLBACK TO SAVEPOINT period_gate_reversal");
    return { allowed: true, reason: "reversal_exempt" };
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT period_gate_reversal");
    return decisionFromTriggerError(err, "hard_close");
  }
}

function decisionFromTriggerError(err: unknown, bookStatus: FiscalPeriodStatus | null): PeriodGateDecision {
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith("PERIOD_NOT_OPEN")) {
    return { allowed: false, reason: "fiscal_not_open" };
  }
  if (message.startsWith("BOOK_PERIOD_NOT_OPEN")) {
    return { allowed: false, reason: bookStatus == null ? "book_missing" : "book_not_open" };
  }
  throw err;
}

function sameDecision(a: PeriodGateDecision, b: PeriodGateDecision): boolean {
  return a.allowed === b.allowed && a.reason === b.reason;
}

function formatDecision(decision: PeriodGateDecision): string {
  return `${decision.allowed ? "allow" : "block"}:${decision.reason}`;
}

main().catch((err) => {
  console.error("verify-period-gate-parity failed:", err);
  process.exit(1);
});
