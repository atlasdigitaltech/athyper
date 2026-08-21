/**
 * Single-source GL Posting Helper (Phase 5 — review finding R6)
 *
 * Centralises invocation of ledger.upsert_gl_balance after a journal entry is
 * written. Every posting path — invoice-posting, payment-posting, receipt-
 * posting, service-sheet-posting — MUST call postJournalGl rather than writing
 * gl_balance rows directly. This is the only call site for upsert_gl_balance.
 *
 * Idempotency contract:
 *   The caller passes an executionToken (derived from the transition that
 *   triggered the JE post). postJournalGl claims a hook slot under
 *   hookActionKey='ledger.materialize_gl_balance' — if the slot is already
 *   claimed, the function returns 0 without touching gl_balance.
 *
 *   ledger.upsert_gl_balance itself is NOT idempotent (it accumulates
 *   period_debit/credit), so the idempotency check at this layer is
 *   load-bearing.
 *
 * Verification:
 *   server/scripts/verify-gl-single-source.ts greps the repo to confirm
 *   ledger.upsert_gl_balance is only called from this file.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { claimHookExecution, markHookCompleted, markHookFailed } from "./idempotency.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface PostJournalGlOpts {
  tenantId:           string;
  jeId:               string;
  executionToken:     string;
  transitionId:       string;
  sourceDocType:      string;
  sourceDocId:        string;
  transitionEventSeq?: number;
  principalId?:       string | null;
}

export interface PostJournalGlResult {
  /** Number of journal_line rows materialised into gl_balance. */
  rowsPosted: number;
  /** True when the call was an idempotent no-op (executionToken already claimed). */
  alreadyPosted: boolean;
}

/**
 * Iterate journal_line rows for jeId and accumulate each into ledger.gl_balance
 * via ledger.upsert_gl_balance. Idempotency-guarded by the supplied execution
 * token — duplicate calls (retries, replays) return rowsPosted=0 with
 * alreadyPosted=true.
 *
 * Runs inside the caller's transaction. Callers are expected to wrap the JE
 * write + gl_balance materialisation in a single TX so retries see consistent
 * state.
 */
export async function postJournalGl(
  db:   AnyDb,
  opts: PostJournalGlOpts,
): Promise<PostJournalGlResult> {
  const claim = await claimHookExecution(db, {
    tenantId:           opts.tenantId,
    executionToken:     opts.executionToken,
    hookActionKey:      "ledger.materialize_gl_balance",
    transitionId:       opts.transitionId,
    sourceDocType:      opts.sourceDocType,
    sourceDocId:        opts.sourceDocId,
    transitionEventSeq: opts.transitionEventSeq,
    principalId:        opts.principalId,
  });

  if (!claim) {
    return { rowsPosted: 0, alreadyPosted: true };
  }

  const startedAt = Date.now();
  try {
    const result = await sql<{ posted_count: number }>`
      WITH lines AS (
        SELECT
          jl.tenant_id,
          jl.company_code_id,
          jl.gl_account_id,
          jl.book_id,
          jl.fiscal_year,
          jl.period_number,
          jl.base_currency,
          jl.base_debit,
          jl.base_credit,
          jl.journal_entry_id,
          jl.cost_center_id,
          jl.profit_center_id,
          jl.project_id,
          jl.dimension_set_id,
          jl.created_by
        FROM document.journal_line jl
        WHERE jl.tenant_id        = ${opts.tenantId}::uuid
          AND jl.journal_entry_id = ${opts.jeId}::uuid
      ),
      upserted AS (
        SELECT ledger.upsert_gl_balance(
          l.tenant_id,
          l.company_code_id,
          l.gl_account_id,
          l.book_id,
          l.fiscal_year,
          l.period_number,
          l.base_currency,
          l.base_debit,
          l.base_credit,
          l.journal_entry_id,
          l.created_by,
          l.cost_center_id,
          l.profit_center_id,
          l.project_id,
          l.dimension_set_id
        ) AS gl_balance_id
        FROM lines l
      )
      SELECT COUNT(*)::int AS posted_count FROM upserted
    `.execute(db);

    const rowsPosted = result.rows[0]?.posted_count ?? 0;
    const duration   = Date.now() - startedAt;
    await markHookCompleted(db, claim.id, undefined, duration);
    return { rowsPosted, alreadyPosted: false };
  } catch (err) {
    const duration = Date.now() - startedAt;
    const code     = err instanceof Error && "code" in err
      ? String((err as { code: unknown }).code)
      : "GL_MATERIALIZATION_FAILED";
    const message  = err instanceof Error ? err.message : String(err);
    await markHookFailed(db, claim.id, code, message, duration);
    throw err;
  }
}
