/**
 * Commitment (PO) Approve Service (Phase 5.3)
 *
 * Fires on PO approve transition. Side effects:
 *   1. Reads current-version document.schedule_line rows per commitment_line
 *      via getCurrentSchedules (from schedule-line.service).
 *   2. Inserts ledger.commitment_schedule rows derived from each schedule_line.
 *   3. Stamps commitment.approved_at / approved_by.
 *
 * Budget commit is wired by the dispatcher's ORDER_APPROVAL case: after this
 * service returns ok, the dispatcher calls budget-transaction.commitBudget on
 * the same transition. See transaction-flow-dispatcher.service.ts.
 *
 * Idempotency:
 *   Claims a hook slot under hookActionKey='p2p.commitment.approve'. The
 *   schedule-write subtask uses 'ledger.materialize_commitment_schedule' as
 *   a separate claim so the two phases are independently retry-safe.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { getCurrentSchedules } from "../schedule-line.service.js";
import {
  claimHookExecution, markHookCompleted, markHookFailed,
} from "../../ledger/idempotency.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface CommitmentApproveCtx {
  tenantId:            string;
  commitmentId:        string;
  principalId:         string;
  executionToken:      string;
  transitionId:        string;
  transitionEventSeq?: number;
}

export interface CommitmentApproveResult {
  ok:               boolean;
  schedulesWritten?: number;
  alreadyApproved?: boolean;
  error?:           { code: string; message: string };
}

interface CommitmentHeader {
  id:                  string;
  company_code_id:     string;
  commitment_number:   string;
  currency_code:       string;
  base_currency_code:  string;
  exchange_rate:       number | null;
  fiscal_year:         number;
  period_number:       number | null;
  status:              string;
  approved_at:         string | null;
}

interface CommitmentLine {
  id:           string;
  line_no:      number;
  quantity:     number;
  unit_price:   number;
  required_by_date: string | null;
}

export async function handleApproveCommitment(
  db:  AnyDb,
  ctx: CommitmentApproveCtx,
): Promise<CommitmentApproveResult> {
  const claim = await claimHookExecution(db, {
    tenantId:           ctx.tenantId,
    executionToken:     ctx.executionToken,
    hookActionKey:      "p2p.commitment.approve",
    transitionId:       ctx.transitionId,
    sourceDocType:      "commitment",
    sourceDocId:        ctx.commitmentId,
    transitionEventSeq: ctx.transitionEventSeq,
    principalId:        ctx.principalId,
  });

  if (!claim) {
    return { ok: true, alreadyApproved: true };
  }

  const startedAt = Date.now();
  try {
    const execute = async (trx: AnyDb) => {
      // ── 1. Load + validate ──────────────────────────────────────────────
      const header = await loadCommitmentHeader(trx, ctx.tenantId, ctx.commitmentId);
      if (!header) return failure("COMMITMENT_NOT_FOUND", "Commitment not found.");

      // Accept both pending_approval (route-handler call) and approved
      // (transition-hook call). approved_at is the authoritative gate.
      if (!["pending_approval", "approved"].includes(header.status)) {
        return failure(
          "COMMITMENT_NOT_APPROVABLE",
          `Commitment must be 'pending_approval' or 'approved' (currently '${header.status}').`,
        );
      }
      if (header.approved_at) {
        return failure("COMMITMENT_ALREADY_APPROVED", "Commitment is already approved.");
      }

      const lines = await loadCommitmentLines(trx, ctx.tenantId, ctx.commitmentId);
      if (lines.length === 0) {
        return failure("COMMITMENT_NO_LINES", "Commitment has no lines.");
      }

      const exchangeRate = Number(header.exchange_rate ?? 1);

      // ── 2. Write ledger.commitment_schedule from document.schedule_line ──
      let schedulesWritten = 0;
      let scheduleNoCounter = 1;

      for (const line of lines) {
        const lineSchedules = await getCurrentSchedules(
          trx, ctx.tenantId, "commitment_line", line.id,
        );

        // Review finding P2 fix — fail fast when schedules are missing
        // instead of synthesising. The writer service is now expected to
        // be called from the commitment_line insert path. A missing
        // schedule here means the integration was skipped, which is a
        // real bug that should surface, not be papered over.
        if (lineSchedules.length === 0) {
          return failure(
            "COMMITMENT_LINE_NO_SCHEDULES",
            `commitment_line ${line.id} has no document.schedule_line rows. ` +
            `Ensure the line-write handler called createSchedulesForCommitmentLine.`,
          );
        }

        for (const schedule of lineSchedules) {
          const scheduledAmount = Number(schedule.scheduled_quantity) * Number(line.unit_price);
          const baseAmount      = scheduledAmount * exchangeRate;
          const scheduleType    = mapKindToType(schedule.schedule_kind);

          await sql`
            INSERT INTO ledger.commitment_schedule (
              tenant_id, commitment_id,
              schedule_no, schedule_type,
              due_date, currency_code,
              scheduled_amount, base_amount, exchange_rate,
              fiscal_year, period_number,
              status,
              created_by
            ) VALUES (
              ${ctx.tenantId}::uuid,
              ${ctx.commitmentId}::uuid,
              ${scheduleNoCounter}::smallint,
              ${scheduleType}::text,
              ${schedule.scheduled_date}::date,
              ${header.currency_code}::char(3),
              ${scheduledAmount}::numeric,
              ${baseAmount}::numeric,
              ${exchangeRate}::numeric,
              ${header.fiscal_year}::smallint,
              ${header.period_number ?? 1}::smallint,
              'pending'::text,
              ${ctx.principalId}::uuid
            )
            ON CONFLICT ON CONSTRAINT cs_commitment_seq_uq DO NOTHING
          `.execute(trx);
          scheduleNoCounter += 1;
          schedulesWritten  += 1;
        }
      }

      // ── 3. Stamp approval fields on the commitment ──────────────────────
      // Status is left alone — the transition (route handler or action
      // dispatcher) is responsible for updating it. We just stamp
      // approved_at / approved_by.
      await sql`
        UPDATE document.commitment
           SET approved_at = COALESCE(approved_at, now()),
               approved_by = COALESCE(approved_by, ${ctx.principalId}::uuid),
               updated_at  = now(),
               updated_by  = ${ctx.principalId}::uuid,
               row_version = row_version + 1
         WHERE id        = ${ctx.commitmentId}::uuid
           AND tenant_id = ${ctx.tenantId}::uuid
      `.execute(trx);

      return {
        ok:               true as const,
        schedulesWritten,
        alreadyApproved:  false,
      };
    };
    const result = (db as { isTransaction?: boolean }).isTransaction === true
      ? await execute(db)
      : await db.transaction().execute((trx) => execute(trx));

    const duration = Date.now() - startedAt;
    if (result.ok) {
      await markHookCompleted(db, claim.id, undefined, duration);
    } else {
      await markHookFailed(db, claim.id, result.error!.code, result.error!.message, duration);
    }
    return result;
  } catch (err) {
    const duration = Date.now() - startedAt;
    const code     = err instanceof Error && "code" in err
      ? String((err as { code: unknown }).code)
      : "COMMITMENT_APPROVE_FAILED";
    const message  = err instanceof Error ? err.message : String(err);
    await markHookFailed(db, claim.id, code, message, duration);
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function failure(code: string, message: string): CommitmentApproveResult {
  return { ok: false, error: { code, message } };
}

function mapKindToType(kind: string): string {
  switch (kind) {
    case "billing_milestone": return "MILESTONE";
    case "release_window":    return "IRREGULAR";
    case "delivery":          return "PERIODIC";
    default:                  return "PERIODIC";
  }
}

async function loadCommitmentHeader(
  db: AnyDb, tenantId: string, commitmentId: string,
): Promise<CommitmentHeader | null> {
  const result = await sql<CommitmentHeader>`
    SELECT id, company_code_id, code AS commitment_number,
           currency_code, base_currency_code, exchange_rate,
           fiscal_year, period_number,
           status, approved_at
      FROM document.commitment
     WHERE id        = ${commitmentId}::uuid
       AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(db);
  return result.rows[0] ?? null;
}

async function loadCommitmentLines(
  db: AnyDb, tenantId: string, commitmentId: string,
): Promise<CommitmentLine[]> {
  const result = await sql<CommitmentLine>`
    SELECT id, line_no, quantity, unit_price,
           required_by_date
      FROM document.commitment_line
     WHERE tenant_id    = ${tenantId}::uuid
       AND commitment_id = ${commitmentId}::uuid
     ORDER BY line_no
  `.execute(db);
  return result.rows;
}
