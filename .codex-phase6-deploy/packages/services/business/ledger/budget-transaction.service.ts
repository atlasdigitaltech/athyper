/**
 * Budget Transaction Service (audit P0-S2)
 *
 * Writes ledger.budget_transaction rows + updates master.budget_allocation
 * running totals (reserved/consumed/released_amount) for the four P2P
 * lifecycle events:
 *
 *   reserveBudget — PR approve  → RESERVE  (DEBIT, reserved_amount +X)
 *   commitBudget  — PO approve  → COMMIT   (DEBIT, audit-only; reservation
 *                                          remains in reserved_amount until
 *                                          PI consumes or PO releases)
 *   consumeBudget — PI post     → CONSUME  (DEBIT, consumed_amount +X;
 *                                          if commitment_id set, also
 *                                          reserved_amount -X to free the
 *                                          prior COMMIT)
 *   releaseBudget — PO cancel   → RELEASE  (CREDIT, reserved_amount -X)
 *                / short_close
 *
 * Why COMMIT is balance-neutral: the schema collapses PR-encumbrance and
 * PO-commitment into a single `reserved_amount` column. The COMMIT row
 * exists for audit (it records the PR→PO promotion), but adding to
 * reserved_amount would double-count the encumbrance. The metadata jsonb
 * stores the link to the originating RESERVE row.
 *
 * Idempotency: every txn row carries
 *   idempotency_key = sha256(executionToken || verb || allocationId)
 * Retries with the same executionToken hit the UNIQUE constraint and the
 * helper returns alreadyApplied=true without touching the allocation row.
 *
 * Allocation match policy: governed by BUDGET_NO_MATCH_POLICY env:
 *   hard_fail (prod default)    — return BUDGET_ALLOCATION_NOT_FOUND
 *   warn_continue (non-prod)    — log a structured WARN, return ok:true
 *                                with empty allocations[].
 *
 * Concurrency: SELECT … FOR UPDATE on the allocation row inside the caller's
 * transaction. Two parallel transitions touching the same allocation
 * serialise — the loser sees the resulting state from the winner before
 * applying its own delta.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { createHash } from "node:crypto";
import {
  claimHookExecution,
  markHookCompleted,
  markHookFailed,
} from "./idempotency.service.js";
import {
  fetchLineIdsForDocument,
  resolveAllocationsForLines,
  type AllocationGroup,
  type LineEntityCode,
} from "./budget-allocation-resolver.service.js";
import { refreshDistributionCostBasis } from "../pricing_component/component-accounting-loader.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

type BudgetVerb = "reserve" | "commit" | "consume" | "release";

const VERB_TO_TXN_TYPE: Record<BudgetVerb, string> = {
  reserve: "RESERVE",
  commit:  "COMMIT",
  consume: "CONSUME",
  release: "RELEASE",
};

const VERB_TO_DIRECTION: Record<BudgetVerb, "DEBIT" | "CREDIT"> = {
  reserve: "DEBIT",
  commit:  "DEBIT",
  consume: "DEBIT",
  release: "CREDIT",
};

const VERB_TO_HOOK_ACTION: Record<BudgetVerb, string> = {
  reserve: "ledger.budget_reserve",
  commit:  "ledger.budget_commit",
  consume: "ledger.budget_consume",
  release: "ledger.budget_release",
};

export interface BudgetTxnCtx {
  tenantId:           string;
  /** Source document id (PR / PO / PI). The line entity is derived from verb+source. */
  sourceDocId:        string;
  /** UUID of the principal driving the transition. */
  principalId:        string;
  /** Idempotency token from the lifecycle transition. */
  executionToken:     string;
  transitionId:       string;
  transitionEventSeq?: number;
  /** Required for RELEASE; ignored otherwise. */
  releaseReason?:     "cancel" | "short_close" | "lapse";
}

export interface BudgetAllocationOutcome {
  allocationId:    string;
  txnId:           string | null;     // null when alreadyApplied=true
  txnType:         string;            // 'RESERVE' | 'COMMIT' | 'CONSUME' | 'RELEASE'
  direction:       "DEBIT" | "CREDIT";
  amount:          number;
  currencyCode:    string;
  previousState:   AllocationBalance;
  resultingState:  AllocationBalance;
  alreadyApplied:  boolean;
}

export interface AllocationBalance {
  allocated:  number;
  reserved:   number;
  consumed:   number;
  released:   number;
  available:  number;
}

export type BudgetTxnError =
  | "BUDGET_ALLOCATION_NOT_FOUND"
  | "BUDGET_ALLOCATION_INACTIVE"
  | "BUDGET_PERIOD_CLOSED"
  | "BUDGET_INSUFFICIENT"
  | "BUDGET_LINES_MISSING_AD"
  | "BUDGET_INTERNAL_ERROR";

export interface BudgetTxnResult {
  ok:           boolean;
  allocations:  BudgetAllocationOutcome[];
  alreadyApplied: boolean;            // true when claim was a no-op (entire call already done)
  warnings?:    string[];
  error?:       { code: BudgetTxnError; message: string };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export function reserveBudget(db: AnyDb, ctx: BudgetTxnCtx): Promise<BudgetTxnResult> {
  return applyBudgetVerb(db, "reserve", "purchase_requisition_line", ctx, { freesPriorReserve: false });
}

export function commitBudget(db: AnyDb, ctx: BudgetTxnCtx): Promise<BudgetTxnResult> {
  return applyBudgetVerb(db, "commit", "commitment_line", ctx, { freesPriorReserve: false });
}

/**
 * CONSUME has two shapes depending on whether the PI is PO-backed:
 *   PO-based (purchase_invoice.commitment_id IS NOT NULL):
 *     reserved_amount -= amount  (frees the prior COMMIT)
 *     consumed_amount += amount
 *   NON_PO (commitment_id IS NULL):
 *     consumed_amount += amount
 *     reserved_amount unchanged (there was nothing to free)
 *
 * We look up the linkage from purchase_invoice rather than threading it
 * through the ctx so callers (dispatcher, route handler, retry) don't
 * have to know the rule. Wrong here = NON_PO PIs would push reserved_amount
 * negative and crash on balloc_reserved_nonneg.
 */
export async function consumeBudget(db: AnyDb, ctx: BudgetTxnCtx): Promise<BudgetTxnResult> {
  const linkage = await sql<{ commitment_id: string | null }>`
    SELECT commitment_id::text AS commitment_id
      FROM document.purchase_invoice
     WHERE id = ${ctx.sourceDocId}::uuid
       AND tenant_id = ${ctx.tenantId}::uuid
     LIMIT 1
  `.execute(db);
  const freesPriorReserve = linkage.rows[0]?.commitment_id != null;
  return applyBudgetVerb(db, "consume", "purchase_invoice_line", ctx, { freesPriorReserve });
}

export function releaseBudget(db: AnyDb, ctx: BudgetTxnCtx): Promise<BudgetTxnResult> {
  return applyBudgetVerb(db, "release", "commitment_line", ctx, { freesPriorReserve: false });
}

// ──────────────────────────────────────────────────────────────────────────────
// Core
// ──────────────────────────────────────────────────────────────────────────────

interface VerbOpts {
  /** Only meaningful for verb='consume'. When true, the resulting delta
   *  also decrements reserved_amount (the prior PO commit being freed).
   *  When false, only consumed_amount changes. See consumeBudget docs. */
  freesPriorReserve: boolean;
}

async function applyBudgetVerb(
  db:              AnyDb,
  verb:            BudgetVerb,
  lineEntityCode:  LineEntityCode,
  ctx:             BudgetTxnCtx,
  verbOpts:        VerbOpts,
): Promise<BudgetTxnResult> {
  const claim = await claimHookExecution(db, {
    tenantId:           ctx.tenantId,
    executionToken:     ctx.executionToken,
    hookActionKey:      VERB_TO_HOOK_ACTION[verb],
    transitionId:       ctx.transitionId,
    sourceDocType:      sourceDocTypeForVerb(verb),
    sourceDocId:        ctx.sourceDocId,
    transitionEventSeq: ctx.transitionEventSeq,
    principalId:        ctx.principalId,
  });

  if (!claim) {
    return { ok: true, allocations: [], alreadyApplied: true };
  }

  const startedAt = Date.now();
  try {
    // Budget always consumes the same distributable-cost projection used by
    // accounting. This prevents recoverable tax, WHT, and retention from
    // entering reserve/commit/consume amounts and includes cost charges and
    // non-recoverable tax consistently.
    await refreshDistributionCostBasis(db, {
      tenantId: ctx.tenantId,
      sourceDocType: lineEntityCode,
      sourceDocId: ctx.sourceDocId,
      principalId: ctx.principalId,
      final: verb === "consume",
    });
    const lineIds = await fetchLineIdsForDocument(db, ctx.tenantId, lineEntityCode, ctx.sourceDocId);
    const resolved = await resolveAllocationsForLines(db, {
      tenantId: ctx.tenantId,
      lineEntityCode,
      lineIds,
    });

    const warnings: string[] = [];

    // Data-integrity guard: lines without any AD row at all. AD layer should
    // have created at least the default (distribution_no=1) row. If it didn't,
    // this is a posting-path bug, not a budget-config issue — fail loud.
    if (resolved.linesWithoutAd.length > 0) {
      const failure: BudgetTxnResult = {
        ok: false,
        allocations: [],
        alreadyApplied: false,
        error: {
          code:    "BUDGET_LINES_MISSING_AD",
          message: `${resolved.linesWithoutAd.length} line(s) have no accounting_distribution rows: ${resolved.linesWithoutAd.slice(0, 5).join(", ")}`,
        },
      };
      await markHookFailed(db, claim.id, failure.error!.code, failure.error!.message, Date.now() - startedAt);
      return failure;
    }

    // Allocation-match miss handling. The hard_fail path is the default in
    // prod; warn_continue lets non-prod environments roll out incremental
    // budget configuration without blocking every transition.
    if (resolved.unresolved || resolved.groups.length === 0) {
      const message =
        resolved.linesWithoutAllocation.length > 0
          ? `${resolved.linesWithoutAllocation.length} line(s) have AD rows without budget_allocation_id: ${resolved.linesWithoutAllocation.slice(0, 5).join(", ")}`
          : "No budget_allocation match for any line on this document.";

      if (noMatchPolicy() === "hard_fail") {
        const failure: BudgetTxnResult = {
          ok: false,
          allocations: [],
          alreadyApplied: false,
          error: { code: "BUDGET_ALLOCATION_NOT_FOUND", message },
        };
        await markHookFailed(db, claim.id, failure.error!.code, failure.error!.message, Date.now() - startedAt);
        return failure;
      }

      // warn_continue: log structured warning, complete the claim, return ok.
      warnBudgetUnmatched(verb, ctx, message);
      warnings.push(message);
      await markHookCompleted(db, claim.id, undefined, Date.now() - startedAt);
      return { ok: true, allocations: [], alreadyApplied: false, warnings };
    }

    // ── Apply per-allocation deltas inside a single TX ─────────────────────
    const outcomes: BudgetAllocationOutcome[] = [];

    const applyGroups = async (trx: AnyDb) => {
      for (const group of resolved.groups) {
        const outcome = await applyToAllocation(trx, verb, ctx, group, verbOpts);
        if (!outcome.ok) {
          return { ok: false, error: outcome.error } as const;
        }
        outcomes.push(outcome.outcome);
      }
      return { ok: true } as const;
    };
    const result = (db as { isTransaction?: boolean }).isTransaction === true
      ? await applyGroups(db)
      : await db.transaction().execute((trx) => applyGroups(trx));

    if (!result.ok) {
      await markHookFailed(db, claim.id, result.error!.code, result.error!.message, Date.now() - startedAt);
      return { ok: false, allocations: [], alreadyApplied: false, error: result.error };
    }

    await markHookCompleted(db, claim.id, undefined, Date.now() - startedAt);
    return { ok: true, allocations: outcomes, alreadyApplied: false, warnings: warnings.length ? warnings : undefined };
  } catch (err) {
    const code    = err instanceof Error && "code" in err
      ? String((err as { code: unknown }).code)
      : "BUDGET_INTERNAL_ERROR";
    const message = err instanceof Error ? err.message : String(err);
    await markHookFailed(db, claim.id, code, message, Date.now() - startedAt);
    throw err;
  }
}

interface AllocationApplyOk {
  ok:       true;
  outcome:  BudgetAllocationOutcome;
}

interface AllocationApplyErr {
  ok:    false;
  error: { code: BudgetTxnError; message: string };
}

async function applyToAllocation(
  trx:     AnyDb,
  verb:    BudgetVerb,
  ctx:     BudgetTxnCtx,
  group:   AllocationGroup,
  verbOpts: VerbOpts,
): Promise<AllocationApplyOk | AllocationApplyErr> {
  // Lock the allocation row for the duration of this transaction. Two
  // parallel claims on the same allocation serialise here — the second waits
  // for the first to commit before reading the post-update balance.
  const lockResult = await sql<{
    id:                 string;
    company_code_id:    string;
    fiscal_year:        number;
    currency_code:      string;
    cost_center_id:     string | null;
    project_id:         string | null;
    gl_account_id:      string | null;
    profit_center_id:   string | null;
    allocated_amount:   number;
    reserved_amount:    number;
    consumed_amount:    number;
    released_amount:    number;
    overspend_policy:   string;
    tolerance_pct:      number;
    status:             string;
  }>`
    SELECT id, company_code_id, fiscal_year, currency_code,
           cost_center_id, project_id, gl_account_id, profit_center_id,
           allocated_amount, reserved_amount, consumed_amount, released_amount,
           overspend_policy, tolerance_pct, status
      FROM master.budget_allocation
     WHERE id = ${group.allocationId}::uuid
       AND tenant_id = ${ctx.tenantId}::uuid
     FOR UPDATE
  `.execute(trx);

  const allocation = lockResult.rows[0];
  if (!allocation) {
    return {
      ok: false,
      error: {
        code:    "BUDGET_ALLOCATION_NOT_FOUND",
        message: `budget_allocation ${group.allocationId} not found for tenant.`,
      },
    };
  }

  if (allocation.status !== "active") {
    return {
      ok: false,
      error: {
        code:    "BUDGET_ALLOCATION_INACTIVE",
        message: `budget_allocation ${allocation.id} status='${allocation.status}' is not active.`,
      },
    };
  }

  // Period derivation (audit P5-S2). Use the source document's own
  // (fiscal_year, period_number, effective_date) — backdated PIs and
  // late-arrival reversals must land in the period they declare, not
  // in CURRENT_DATE's period. Then validate that the period is open or
  // soft-closed.
  const docPeriod = await loadDocumentPeriodInfo(
    trx, ctx.tenantId, verb, ctx.sourceDocId, allocation.company_code_id,
  );
  if (!docPeriod.ok) {
    return { ok: false, error: docPeriod.error };
  }

  const periodCheck = await validatePeriodOpen(
    trx, ctx.tenantId, allocation.company_code_id,
    docPeriod.fiscalYear, docPeriod.periodNumber,
  );
  if (!periodCheck.ok) {
    return { ok: false, error: periodCheck.error };
  }

  const previousState: AllocationBalance = balanceFromRow(allocation);

  // Compute the per-column deltas for this verb.
  const delta = computeColumnDelta(verb, group.amount, verbOpts);

  // Overspend / insufficient guard for DEBIT-direction non-zero deltas.
  if (delta.kind === "reserve" || delta.kind === "consume") {
    const projected = projectAvailable(previousState, delta);
    if (allocation.overspend_policy === "BLOCK" && projected < 0) {
      // Honor tolerance_pct on the projected overshoot, expressed as a
      // percent of allocated_amount. Most tenants leave it at 0.
      const toleranceAbs = (Number(allocation.tolerance_pct) / 100) * Number(allocation.allocated_amount);
      if (projected + toleranceAbs < 0) {
        return {
          ok: false,
          error: {
            code:    "BUDGET_INSUFFICIENT",
            message: `Allocation ${allocation.id} has insufficient available budget. ` +
                     `available=${previousState.available}, requested=${group.amount}, projected=${projected.toFixed(4)}.`,
          },
        };
      }
    }
  }

  // Insert the txn row. idempotency_key handles retry collisions explicitly
  // — caught here so the caller still gets a structured outcome.
  const idempotencyKey = buildIdempotencyKey(ctx.executionToken, verb, allocation.id);
  let txnId: string | null = null;
  let alreadyApplied = false;

  try {
    const insert = await sql<{ id: string }>`
      INSERT INTO ledger.budget_transaction (
        tenant_id, budget_allocation_id,
        txn_type, direction, amount, currency_code,
        fiscal_year, period_number, effective_date,
        source_doc_type, source_doc_id, commitment_id,
        previous_state, resulting_state,
        idempotency_key,
        reason, performed_by, performed_at,
        metadata, created_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${allocation.id}::uuid,
        ${VERB_TO_TXN_TYPE[verb]}::text,
        ${VERB_TO_DIRECTION[verb]}::text,
        ${group.amount}::numeric,
        ${allocation.currency_code}::char(3),
        ${docPeriod.fiscalYear}::smallint,
        ${docPeriod.periodNumber}::smallint,
        ${docPeriod.effectiveDate}::date,
        ${sourceDocTypeForVerb(verb)}::text,
        ${ctx.sourceDocId}::uuid,
        ${verb === "commit" || verb === "release" ? ctx.sourceDocId : null}::uuid,
        ${JSON.stringify(previousState)}::jsonb,
        ${JSON.stringify(projectResulting(previousState, delta))}::jsonb,
        ${idempotencyKey}::text,
        ${verb === "release" ? (ctx.releaseReason ?? null) : null}::text,
        ${ctx.principalId}::uuid,
        now(),
        ${JSON.stringify({
          verb,
          transition_id:       ctx.transitionId,
          transition_event_seq: ctx.transitionEventSeq ?? 1,
          execution_token:     ctx.executionToken,
        })}::jsonb,
        ${ctx.principalId}::uuid
      )
      ON CONFLICT ON CONSTRAINT btr_idempotency_uq DO NOTHING
      RETURNING id
    `.execute(trx);

    if (insert.rows[0]) {
      txnId = insert.rows[0].id;
    } else {
      // Idempotency-key collision → another concurrent claim already wrote
      // this row. Read it back so the caller still gets a coherent outcome.
      alreadyApplied = true;
      const prior = await sql<{ id: string }>`
        SELECT id
          FROM ledger.budget_transaction
         WHERE idempotency_key = ${idempotencyKey}::text
         LIMIT 1
      `.execute(trx);
      txnId = prior.rows[0]?.id ?? null;
    }
  } catch (err) {
    return {
      ok: false,
      error: {
        code:    "BUDGET_INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  // Only update running totals when we actually wrote a fresh row. A
  // re-discovered prior row means the totals were already applied.
  if (!alreadyApplied && (delta.reservedDelta !== 0 || delta.consumedDelta !== 0 || delta.releasedDelta !== 0)) {
    await sql`
      UPDATE master.budget_allocation
         SET reserved_amount = reserved_amount + ${delta.reservedDelta}::numeric,
             consumed_amount = consumed_amount + ${delta.consumedDelta}::numeric,
             released_amount = released_amount + ${delta.releasedDelta}::numeric,
             updated_at      = now(),
             updated_by      = ${ctx.principalId}::uuid
       WHERE id = ${allocation.id}::uuid
         AND tenant_id = ${ctx.tenantId}::uuid
    `.execute(trx);
  }

  const resultingState = projectResulting(previousState, delta);

  return {
    ok: true,
    outcome: {
      allocationId:   allocation.id,
      txnId,
      txnType:        VERB_TO_TXN_TYPE[verb],
      direction:      VERB_TO_DIRECTION[verb],
      amount:         group.amount,
      currencyCode:   allocation.currency_code,
      previousState,
      resultingState,
      alreadyApplied,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Delta math
// ──────────────────────────────────────────────────────────────────────────────

interface ColumnDelta {
  kind:           BudgetVerb;
  reservedDelta:  number;
  consumedDelta:  number;
  releasedDelta:  number;
}

export function computeColumnDelta(
  verb:     BudgetVerb,
  amount:   number,
  opts:     { freesPriorReserve: boolean } = { freesPriorReserve: false },
): ColumnDelta {
  switch (verb) {
    case "reserve":
      return { kind: verb, reservedDelta: amount,  consumedDelta: 0,      releasedDelta: 0 };
    case "commit":
      // Audit-only — reservation already in reserved_amount under the prior
      // RESERVE row. No running-total change.
      return { kind: verb, reservedDelta: 0,       consumedDelta: 0,      releasedDelta: 0 };
    case "consume":
      // PO-based PIs free the prior commit (reservedDelta=-amount);
      // NON_PO PIs only record consumption (reservedDelta=0). Bifurcation
      // governed by purchase_invoice.commitment_id (see consumeBudget).
      return {
        kind:           verb,
        reservedDelta:  opts.freesPriorReserve ? -amount : 0,
        consumedDelta:  amount,
        releasedDelta:  0,
      };
    case "release":
      return { kind: verb, reservedDelta: -amount, consumedDelta: 0,      releasedDelta: 0 };
  }
}

export function projectAvailable(prev: AllocationBalance, delta: ColumnDelta): number {
  const reserved = prev.reserved + delta.reservedDelta;
  const consumed = prev.consumed + delta.consumedDelta;
  const released = prev.released + delta.releasedDelta;
  return prev.allocated - reserved - consumed + released;
}

export function projectResulting(prev: AllocationBalance, delta: ColumnDelta): AllocationBalance {
  const reserved = prev.reserved + delta.reservedDelta;
  const consumed = prev.consumed + delta.consumedDelta;
  const released = prev.released + delta.releasedDelta;
  return {
    allocated: prev.allocated,
    reserved,
    consumed,
    released,
    available: prev.allocated - reserved - consumed + released,
  };
}

function balanceFromRow(row: {
  allocated_amount: number;
  reserved_amount:  number;
  consumed_amount:  number;
  released_amount:  number;
}): AllocationBalance {
  const allocated = Number(row.allocated_amount);
  const reserved  = Number(row.reserved_amount);
  const consumed  = Number(row.consumed_amount);
  const released  = Number(row.released_amount);
  return {
    allocated,
    reserved,
    consumed,
    released,
    available: allocated - reserved - consumed + released,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Period guard (audit P5-S2)
// ──────────────────────────────────────────────────────────────────────────────
//
// Two-stage period derivation:
//   loadDocumentPeriodInfo — reads the source document's (fiscal_year,
//                            period_number, effective_date). For PR where
//                            period_number can be NULL, falls back to the
//                            period covering document_date.
//   validatePeriodOpen     — looks up the period row by (company, year,
//                            period_number) and rejects hard_close /
//                            unmatched.
//
// Previously the service used CURRENT_DATE for both stages. That broke
// backdated invoices: a PI with posting_date in a prior closed period
// would land in TODAY's open period and silently bypass the gate. The
// new flow derives from the document so the budget movement records
// against the period the spend actually belongs to.

interface DocumentPeriodOk {
  ok:             true;
  fiscalYear:     number;
  periodNumber:   number;
  effectiveDate:  string;   // ISO date 'YYYY-MM-DD'
}

interface PeriodErr {
  ok:    false;
  error: { code: BudgetTxnError; message: string };
}

async function loadDocumentPeriodInfo(
  trx:           AnyDb,
  tenantId:      string,
  verb:          BudgetVerb,
  sourceDocId:   string,
  companyCodeId: string,
): Promise<DocumentPeriodOk | PeriodErr> {
  switch (verb) {
    case "reserve":
      return loadPrPeriod(trx, tenantId, sourceDocId, companyCodeId);
    case "commit":
    case "release":
      return loadCommitmentPeriod(trx, tenantId, sourceDocId);
    case "consume":
      return loadPurchaseInvoicePeriod(trx, tenantId, sourceDocId);
  }
}

async function loadPrPeriod(
  trx:           AnyDb,
  tenantId:      string,
  sourceDocId:   string,
  companyCodeId: string,
): Promise<DocumentPeriodOk | PeriodErr> {
  const row = await sql<{
    fiscal_year:    number;
    period_number:  number | null;
    document_date:  string;
  }>`
    SELECT fiscal_year, period_number, to_char(document_date, 'YYYY-MM-DD') AS document_date
      FROM document.purchase_requisition
     WHERE id        = ${sourceDocId}::uuid
       AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(trx);
  const r = row.rows[0];
  if (!r) {
    return periodErr("BUDGET_INTERNAL_ERROR", `purchase_requisition ${sourceDocId} not found.`);
  }

  // PR.period_number is nullable (the writer doesn't always set it on
  // draft). Fall back to looking up the period that covers document_date
  // for the company. If neither path resolves, period guard fails.
  if (r.period_number != null) {
    return {
      ok:            true,
      fiscalYear:    Number(r.fiscal_year),
      periodNumber:  Number(r.period_number),
      effectiveDate: r.document_date,
    };
  }

  return derivePeriodFromDate(trx, tenantId, companyCodeId, Number(r.fiscal_year), r.document_date);
}

async function loadCommitmentPeriod(
  trx:         AnyDb,
  tenantId:    string,
  sourceDocId: string,
): Promise<DocumentPeriodOk | PeriodErr> {
  const row = await sql<{
    fiscal_year:    number;
    period_number:  number;
    effective_date: string;
  }>`
    SELECT fiscal_year, period_number,
           to_char(effective_date, 'YYYY-MM-DD') AS effective_date
      FROM document.commitment
     WHERE id        = ${sourceDocId}::uuid
       AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(trx);
  const r = row.rows[0];
  if (!r) {
    return periodErr("BUDGET_INTERNAL_ERROR", `commitment ${sourceDocId} not found.`);
  }
  return {
    ok:            true,
    fiscalYear:    Number(r.fiscal_year),
    periodNumber:  Number(r.period_number),
    effectiveDate: r.effective_date,
  };
}

async function loadPurchaseInvoicePeriod(
  trx:         AnyDb,
  tenantId:    string,
  sourceDocId: string,
): Promise<DocumentPeriodOk | PeriodErr> {
  // posting_date is the authoritative GL-effect date for AP — using it
  // here aligns the budget txn's fiscal period with the JE's. document_date
  // (when the supplier issued the invoice) and received_date (when we
  // logged receipt) intentionally aren't used as fallbacks: posting_date
  // is NOT NULL on the table, so there's nothing to fall back from.
  const row = await sql<{
    fiscal_year:    number;
    period_number:  number;
    posting_date:   string;
  }>`
    SELECT fiscal_year, period_number,
           to_char(posting_date, 'YYYY-MM-DD') AS posting_date
      FROM document.purchase_invoice
     WHERE id        = ${sourceDocId}::uuid
       AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(trx);
  const r = row.rows[0];
  if (!r) {
    return periodErr("BUDGET_INTERNAL_ERROR", `purchase_invoice ${sourceDocId} not found.`);
  }
  return {
    ok:            true,
    fiscalYear:    Number(r.fiscal_year),
    periodNumber:  Number(r.period_number),
    effectiveDate: r.posting_date,
  };
}

async function derivePeriodFromDate(
  trx:           AnyDb,
  tenantId:      string,
  companyCodeId: string,
  fiscalYear:    number,
  isoDate:       string,
): Promise<DocumentPeriodOk | PeriodErr> {
  const row = await sql<{ period_number: number }>`
    SELECT period_number
      FROM master.fiscal_period
     WHERE tenant_id       = ${tenantId}::uuid
       AND company_code_id = ${companyCodeId}::uuid
       AND fiscal_year     = ${fiscalYear}::smallint
       AND ${isoDate}::date BETWEEN start_date AND end_date
     LIMIT 1
  `.execute(trx);
  const r = row.rows[0];
  if (!r) {
    return periodErr(
      "BUDGET_PERIOD_CLOSED",
      `No fiscal_period covers ${isoDate} for company_code=${companyCodeId}, fiscal_year=${fiscalYear}.`,
    );
  }
  return {
    ok:            true,
    fiscalYear,
    periodNumber:  Number(r.period_number),
    effectiveDate: isoDate,
  };
}

async function validatePeriodOpen(
  trx:           AnyDb,
  tenantId:      string,
  companyCodeId: string,
  fiscalYear:    number,
  periodNumber:  number,
): Promise<{ ok: true } | PeriodErr> {
  const row = await sql<{ status: string }>`
    SELECT status
      FROM master.fiscal_period
     WHERE tenant_id       = ${tenantId}::uuid
       AND company_code_id = ${companyCodeId}::uuid
       AND fiscal_year     = ${fiscalYear}::smallint
       AND period_number   = ${periodNumber}::smallint
     LIMIT 1
  `.execute(trx);
  const r = row.rows[0];
  if (!r) {
    return periodErr(
      "BUDGET_PERIOD_CLOSED",
      `No fiscal_period row for company_code=${companyCodeId}, fiscal_year=${fiscalYear}, period_number=${periodNumber}.`,
    );
  }
  if (r.status !== "open" && r.status !== "soft_close") {
    return periodErr(
      "BUDGET_PERIOD_CLOSED",
      `fiscal_period (year=${fiscalYear}, period=${periodNumber}) status='${r.status}' is not open/soft_close.`,
    );
  }
  return { ok: true };
}

function periodErr(code: BudgetTxnError, message: string): PeriodErr {
  return { ok: false, error: { code, message } };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function sourceDocTypeForVerb(verb: BudgetVerb): string {
  switch (verb) {
    case "reserve": return "purchase_requisition";
    case "commit":  return "commitment";
    case "consume": return "purchase_invoice";
    case "release": return "commitment";
  }
}

export function buildIdempotencyKey(executionToken: string, verb: BudgetVerb, allocationId: string): string {
  return createHash("sha256")
    .update(`${executionToken}:${verb}:${allocationId}`)
    .digest("hex");
}

export type NoMatchPolicy = "hard_fail" | "warn_continue";

export function noMatchPolicy(): NoMatchPolicy {
  const raw = (process.env["BUDGET_NO_MATCH_POLICY"] ?? "").trim().toLowerCase();
  if (raw === "warn_continue") return "warn_continue";
  if (raw === "hard_fail")     return "hard_fail";
  // Default by NODE_ENV: prod is strict, anything else is permissive.
  return process.env["NODE_ENV"] === "production" ? "hard_fail" : "warn_continue";
}

function warnBudgetUnmatched(verb: BudgetVerb, ctx: BudgetTxnCtx, reason: string): void {
  console.warn(
    `[budget.allocation.unmatched] verb=${verb} ` +
    `source_doc_id=${ctx.sourceDocId} transition=${ctx.transitionId} ` +
    `tenant=${ctx.tenantId} reason="${reason.replace(/"/g, "'")}"`,
  );
}
