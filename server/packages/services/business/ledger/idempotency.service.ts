/**
 * Lifecycle Transition Hook Idempotency Service (Phase 2.5 / Phase 5)
 *
 * Posting transitions fire multiple hook handlers (activity_log.write,
 * snapshot.capture, transaction_flow.dispatch, ledger.materialize_gl_balance,
 * notification.publish, etc.). Each handler must be idempotent so that retries
 * — API/client retry, webhook replay, worker re-delivery — do not double-post
 * or duplicate notifications.
 *
 * Contract (review finding R2):
 *   1. Caller builds an execution_token from
 *      sha256_hex(transition_id || ':' || source_doc_id || ':' || event_seq).
 *   2. Caller invokes claimHookExecution(...) BEFORE doing any work.
 *      INSERT … ON CONFLICT DO NOTHING RETURNING id.
 *      - Returns { id } → caller proceeds.
 *      - Returns null  → another firing already claimed this hook; caller no-ops.
 *   3. After the work completes successfully, caller calls markHookCompleted(id).
 *   4. On error, caller calls markHookFailed(id, code, message).
 *
 * Why a token-based pattern instead of a transactional advisory lock:
 *   We need durable history of which hooks ran (for audit + replay), not just
 *   serialised execution. control.lifecycle_transition_execution rows are
 *   durable; advisory locks evaporate at transaction end.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { createHash } from "node:crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface ClaimHookExecutionOpts {
  tenantId:           string;
  executionToken:     string;            // sha256 hex; see buildExecutionToken
  hookActionKey:      string;            // e.g. 'snapshot.capture'
  transitionId:       string;
  sourceDocType:      string;            // entity_code of the source document
  sourceDocId:        string;
  transitionEventSeq?: number;           // defaults to 1
  principalId?:       string | null;
}

export interface HookExecutionClaim {
  id: string;
}

/**
 * Builds the execution token used as the idempotency key for one transition
 * × source-doc × event-seq combination.
 *
 *   token = sha256_hex(transitionId || ':' || sourceDocId || ':' || eventSeq)
 *
 * The same transition fired twice for the same revision yields the same token,
 * so the UNIQUE(execution_token, hook_action_key) constraint suppresses the
 * duplicate.
 */
export function buildExecutionToken(
  transitionId: string,
  sourceDocId:  string,
  eventSeq:     number = 1,
): string {
  return createHash("sha256")
    .update(`${transitionId}:${sourceDocId}:${eventSeq}`)
    .digest("hex");
}

/** Wall-clock window after which an in_progress slot is treated as stuck
 *  and eligible for reclamation. Matches lte_in_progress_idx semantics. */
const STUCK_IN_PROGRESS_MINUTES = 5;

/**
 * Claims one hook execution slot.
 *
 * Returns `{ id }` when the caller should proceed with the work; returns
 * `null` when another firing already completed the work and the caller
 * should no-op.
 *
 * Two-step claim semantics (review finding P1):
 *   1. RECLAIM path — UPDATE rows whose status is 'failed' (transient
 *      failure being retried) or 'in_progress' older than STUCK window
 *      (stuck-handler recovery). Resets the row to in_progress and returns
 *      its id. This lets retries with the same execution_token actually
 *      re-run the handler instead of silently no-opping.
 *   2. FRESH path — INSERT a new row when no prior row exists for this
 *      (execution_token, hook_action_key) pair. ON CONFLICT DO NOTHING
 *      protects against concurrent fresh claims.
 *
 * Outcome matrix:
 *   prior row absent              → fresh insert → { id }      (proceed)
 *   prior row status=failed       → reclaim     → { id }      (retry)
 *   prior row status=in_progress  → reclaim if older than 5m else null
 *   prior row status=completed    → null                       (no-op)
 *   prior row status=skipped      → null                       (no-op)
 *   prior row status=partial      → null                       (no-op — operator must repair)
 */
export async function claimHookExecution(
  db:   AnyDb,
  opts: ClaimHookExecutionOpts,
): Promise<HookExecutionClaim | null> {
  // Step 1 — RECLAIM: try to re-open a failed or stuck in_progress row.
  const reclaim = await sql<{ id: string }>`
    UPDATE control.lifecycle_transition_execution
       SET status        = 'in_progress',
           error_code    = NULL,
           error_message = NULL,
           completed_at  = NULL,
           duration_ms   = NULL,
           executed_at   = now(),
           principal_id  = COALESCE(${opts.principalId ?? null}::uuid, principal_id)
     WHERE execution_token = ${opts.executionToken}::text
       AND hook_action_key = ${opts.hookActionKey}::text
       AND (
            status = 'failed'
         OR (
              status      = 'in_progress'
              AND executed_at < now() - (${STUCK_IN_PROGRESS_MINUTES}::int * interval '1 minute')
            )
       )
   RETURNING id
  `.execute(db);

  if (reclaim.rows[0]) {
    return { id: reclaim.rows[0].id };
  }

  // Step 2 — FRESH: insert a new row; DO NOTHING when the pair already
  // exists (in a non-reclaimable state — completed / skipped / partial /
  // recent in_progress).
  const fresh = await sql<{ id: string }>`
    INSERT INTO control.lifecycle_transition_execution (
      tenant_id, execution_token, hook_action_key,
      transition_id, source_doc_type, source_doc_id, transition_event_seq,
      status, principal_id
    ) VALUES (
      ${opts.tenantId}::uuid,
      ${opts.executionToken}::text,
      ${opts.hookActionKey}::text,
      ${opts.transitionId}::uuid,
      ${opts.sourceDocType}::text,
      ${opts.sourceDocId}::uuid,
      ${opts.transitionEventSeq ?? 1}::bigint,
      'in_progress',
      ${opts.principalId ?? null}::uuid
    )
    ON CONFLICT ON CONSTRAINT lte_token_action_uq DO NOTHING
    RETURNING id
  `.execute(db);

  return fresh.rows[0] ? { id: fresh.rows[0].id } : null;
}

/**
 * Marks a previously-claimed hook execution as completed. payloadHash is the
 * SHA-256 of the result payload (optional — used by audit/replay).
 */
export async function markHookCompleted(
  db:           AnyDb,
  id:           string,
  payloadHash?: string,
  durationMs?:  number,
): Promise<void> {
  await sql`
    UPDATE control.lifecycle_transition_execution
       SET status         = 'completed',
           completed_at   = now(),
           payload_hash   = COALESCE(${payloadHash ?? null}::text, payload_hash),
           duration_ms    = COALESCE(${durationMs ?? null}::int,  duration_ms)
     WHERE id = ${id}::uuid
       AND status = 'in_progress'
  `.execute(db);
}

/**
 * Marks a previously-claimed hook execution as failed. errorCode is a
 * machine-readable tag; errorMessage is human-readable.
 */
export async function markHookFailed(
  db:            AnyDb,
  id:            string,
  errorCode:     string,
  errorMessage:  string,
  durationMs?:   number,
): Promise<void> {
  await sql`
    UPDATE control.lifecycle_transition_execution
       SET status        = 'failed',
           completed_at  = now(),
           error_code    = ${errorCode}::text,
           error_message = ${errorMessage}::text,
           duration_ms   = COALESCE(${durationMs ?? null}::int, duration_ms)
     WHERE id = ${id}::uuid
       AND status = 'in_progress'
  `.execute(db);
}

/**
 * Convenience wrapper: claims a hook execution, runs the callback, and marks
 * the row completed (or failed on throw). Returns the callback result on the
 * first firing, or undefined when the claim was a no-op (caller MUST treat
 * undefined as "already done").
 *
 * Use this from hook handlers where the work is straightforward and the
 * caller doesn't need to thread completion state through multiple phases.
 */
export async function withIdempotency<T>(
  db:   AnyDb,
  opts: ClaimHookExecutionOpts,
  fn:   (claim: HookExecutionClaim) => Promise<T>,
): Promise<T | undefined> {
  const claim = await claimHookExecution(db, opts);
  if (!claim) {
    return undefined;
  }

  const startedAt = Date.now();
  try {
    const result   = await fn(claim);
    const duration = Date.now() - startedAt;
    await markHookCompleted(db, claim.id, undefined, duration);
    return result;
  } catch (err) {
    const duration = Date.now() - startedAt;
    const code     = err instanceof Error && "code" in err
      ? String((err as { code: unknown }).code)
      : "HOOK_HANDLER_ERROR";
    const message  = err instanceof Error ? err.message : String(err);
    await markHookFailed(db, claim.id, code, message, duration);
    throw err;
  }
}
