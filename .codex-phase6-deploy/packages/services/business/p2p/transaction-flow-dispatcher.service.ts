/**
 * Transaction Flow Dispatcher (Phase 5.3)
 *
 * Invoked by the `transaction_flow.dispatch` lifecycle hook. Reads the hook
 * config (`event_code` + `flow_code`), looks up the matching
 * `control.transaction_flow_template` row to validate the event is known, and
 * routes to the appropriate imperative posting service.
 *
 * Routing table (event_code → handler):
 *   ORDER_CREATION    → budget-transaction.reserveBudget (PR approve)
 *   ORDER_APPROVAL    → commitment-approve.service + budget-transaction.commitBudget
 *   FULFILLMENT       → receipt-posting | service-sheet-posting
 *                       (selected by sourceDocType)
 *   INVOICE_MATCHED   → invoice-posting.service + budget-transaction.consumeBudget
 *   INVOICE_RECEIVED  → invoice-posting.service + budget-transaction.consumeBudget
 *                       (NON_PO flow — no prior reservation)
 *   SETTLEMENT        → payment-posting.service
 *   REVERSAL          → reversal handlers (PI / payment_entry implemented;
 *                       receipt / service_sheet deferred)
 *   RELEASE           → budget-transaction.releaseBudget (PO cancel / short_close)
 *
 * Idempotency:
 *   Claims a single slot under hookActionKey='transaction_flow.dispatch'. The
 *   dispatched handler claims its own (different hookActionKey, same
 *   executionToken) slots — multiple slots succeed at first firing, all
 *   become no-ops on retry.
 *
 * Error semantics:
 *   Unknown event_code         → DISPATCH_UNKNOWN_EVENT (logged, not thrown)
 *   No transaction_flow_template → DISPATCH_TEMPLATE_NOT_FOUND
 *   Handler returns error       → propagated as the dispatcher's error
 *   Handler throws              → caught, claim marked failed, re-thrown
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  claimHookExecution, markHookCompleted, markHookFailed,
} from "../ledger/idempotency.service.js";
import { handlePostReceipt, handleReverseReceipt, type ReceiptPostingResult } from "./receipt/receipt-posting.service.js";
import { handlePostServiceSheet, handleReverseServiceSheet, type ServiceSheetPostingResult } from "./service_sheet/service-sheet-posting.service.js";
import { handleApproveCommitment, type CommitmentApproveResult } from "./purchase_order/commitment-approve.service.js";
import { handlePostInvoice, handleReverseInvoice } from "../ap/purchase_invoice/invoice-posting.service.js";
import { handlePostPayment, handleVoidPayment } from "../ap/payment_entry/payment-posting.service.js";
import {
  reserveBudget, commitBudget, consumeBudget, releaseBudget,
  type BudgetTxnResult,
} from "../ledger/budget-transaction.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface DispatchCtx {
  tenantId:           string;
  sourceDocType:      string;        // 'receipt' | 'service_sheet' | 'commitment' | 'purchase_invoice' | 'payment_entry'
  sourceDocId:        string;
  eventCode:          string;        // 'ORDER_APPROVAL' | 'FULFILLMENT' | ...
  flowCode:           string;        // 'PO_BASED' | 'SERVICES' | ...
  executionToken:     string;
  transitionId:       string;
  transitionEventSeq?: number;
  principalId:        string;
  /** Inputs supplied to the lifecycle command (posting date, reason, remarks, etc.). */
  operationPayload?:  Readonly<Record<string, unknown>>;
}

export type DispatchOutcome =
  | { kind: "ok";              handler: string; result: unknown }
  | { kind: "alreadyDispatched"; handler: null }
  | { kind: "unsupported";      handler: null; eventCode: string; reason: string }
  | { kind: "templateMissing";  handler: null }
  | { kind: "handlerFailed";    handler: string; error: { code: string; message: string } };

export async function dispatchTransactionFlow(
  db:  AnyDb,
  ctx: DispatchCtx,
): Promise<DispatchOutcome> {
  // ── 1. Verify template exists ───────────────────────────────────────────
  // The transaction_flow_template seed is the authoritative event vocabulary.
  // Treating an unknown (event_code, flow_code) pair as a no-op rather than
  // raising keeps tenant rollouts safe — a tenant without the right flow
  // template seeded for their org just skips the dispatch, doesn't break.
  const templateExists = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM control.transaction_flow_template
      WHERE event_code = ${ctx.eventCode}::text
        AND flow_code  = ${ctx.flowCode}::text
        AND is_active  = true
    ) AS exists
  `.execute(db);

  if (!templateExists.rows[0]?.exists) {
    // Still claim the slot so we record the dispatch attempt
    const claim = await claimHookExecution(db, {
      tenantId:           ctx.tenantId,
      executionToken:     ctx.executionToken,
      hookActionKey:      "transaction_flow.dispatch",
      transitionId:       ctx.transitionId,
      sourceDocType:      ctx.sourceDocType,
      sourceDocId:        ctx.sourceDocId,
      transitionEventSeq: ctx.transitionEventSeq,
      principalId:        ctx.principalId,
    });
    if (claim) {
      await markHookCompleted(db, claim.id, undefined, 0);
    }
    return { kind: "templateMissing", handler: null };
  }

  // ── 2. Claim dispatch slot ──────────────────────────────────────────────
  const claim = await claimHookExecution(db, {
    tenantId:           ctx.tenantId,
    executionToken:     ctx.executionToken,
    hookActionKey:      "transaction_flow.dispatch",
    transitionId:       ctx.transitionId,
    sourceDocType:      ctx.sourceDocType,
    sourceDocId:        ctx.sourceDocId,
    transitionEventSeq: ctx.transitionEventSeq,
    principalId:        ctx.principalId,
  });

  if (!claim) {
    return { kind: "alreadyDispatched", handler: null };
  }

  const startedAt = Date.now();
  try {
    // ── 3. Route to handler ───────────────────────────────────────────────
    const dispatched = await routeToHandler(db, ctx);

    const duration = Date.now() - startedAt;
    if (dispatched.kind === "ok") {
      await markHookCompleted(db, claim.id, undefined, duration);
    } else if (dispatched.kind === "handlerFailed") {
      await markHookFailed(
        db, claim.id,
        dispatched.error.code, dispatched.error.message,
        duration,
      );
    } else if (dispatched.kind === "unsupported") {
      // Unsupported handler is not a failure — we recorded the dispatch
      // attempt but no work was done. Complete the slot.
      await markHookCompleted(db, claim.id, undefined, duration);
    }
    return dispatched;
  } catch (err) {
    const duration = Date.now() - startedAt;
    const code     = err instanceof Error && "code" in err
      ? String((err as { code: unknown }).code)
      : "DISPATCH_HANDLER_THREW";
    const message  = err instanceof Error ? err.message : String(err);
    await markHookFailed(db, claim.id, code, message, duration);
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Routing
// ──────────────────────────────────────────────────────────────────────────────

async function routeToHandler(
  db:  AnyDb,
  ctx: DispatchCtx,
): Promise<DispatchOutcome> {
  const shared = {
    tenantId:           ctx.tenantId,
    principalId:        ctx.principalId,
    executionToken:     ctx.executionToken,
    transitionId:       ctx.transitionId,
    transitionEventSeq: ctx.transitionEventSeq,
  };

  switch (ctx.eventCode) {
    case "ORDER_APPROVAL": {
      if (ctx.sourceDocType !== "commitment" && ctx.sourceDocType !== "purchase_order") {
        return unsupported(ctx.eventCode, `ORDER_APPROVAL expects sourceDocType='commitment' or 'purchase_order', got '${ctx.sourceDocType}'.`);
      }
      const approveResult = await handleApproveCommitment(db, {
        ...shared,
        commitmentId: ctx.sourceDocId,
      });
      const approveOutcome = toOutcome("commitment-approve", approveResult);
      if (approveOutcome.kind !== "ok") return approveOutcome;

      // Budget commit on the same TX: the schedule writes have committed
      // already inside handleApproveCommitment, so the commit row anchors
      // to the PO that's now visible in document.commitment.
      const budgetResult = await commitBudget(db, {
        tenantId:           ctx.tenantId,
        sourceDocId:        ctx.sourceDocId,
        principalId:        ctx.principalId,
        executionToken:     ctx.executionToken,
        transitionId:       ctx.transitionId,
        transitionEventSeq: ctx.transitionEventSeq,
      });
      return foldBudgetIntoPrior("commitment-approve+budget-commit", approveOutcome, budgetResult);
    }

    case "FULFILLMENT": {
      if (ctx.sourceDocType === "receipt") {
        const result = await handlePostReceipt(db, {
          ...shared,
          receiptId: ctx.sourceDocId,
        });
        return toOutcome("receipt-posting", result);
      }
      if (ctx.sourceDocType === "service_sheet") {
        const result = await handlePostServiceSheet(db, {
          ...shared,
          serviceSheetId: ctx.sourceDocId,
        });
        return toOutcome("service-sheet-posting", result);
      }
      return unsupported(
        ctx.eventCode,
        `FULFILLMENT routing for sourceDocType='${ctx.sourceDocType}' not implemented.`,
      );
    }

    case "INVOICE_MATCHED":
    case "INVOICE_RECEIVED": {
      if (ctx.sourceDocType !== "purchase_invoice") {
        return unsupported(
          ctx.eventCode,
          `${ctx.eventCode} expects sourceDocType='purchase_invoice', got '${ctx.sourceDocType}'.`,
        );
      }
      const result = await handlePostInvoice(
        db,
        ctx.tenantId,
        ctx.sourceDocId,
        ctx.principalId,
        { ...(ctx.operationPayload ?? {}) },
        undefined,                   // logger
        undefined,                   // lifecycleSync — Phase 4 hooks handle this
        {
          executionMode:       "lifecycle_hook",
          executionToken:     ctx.executionToken,
          transitionId:       ctx.transitionId,
          transitionEventSeq: ctx.transitionEventSeq,
        },
      );
      const postOutcome = fromHandlerResult("invoice-posting", result);
      if (postOutcome.kind !== "ok") return postOutcome;

      // Audit P0-S4: close the JE-without-budget-row gap. CONSUME runs in
      // the same logical transition; if it fails the outer hook-runner
      // catch wraps the transition into a rollback. Both PO-based
      // (INVOICE_MATCHED) and NON_PO (INVOICE_RECEIVED) flows consume —
      // the NON_PO path has no prior reservation to free, which is fine
      // since consumeBudget tolerates that case (CONSUME is the first
      // touch on the allocation).
      const budgetResult = await consumeBudget(db, {
        tenantId:           ctx.tenantId,
        sourceDocId:        ctx.sourceDocId,
        principalId:        ctx.principalId,
        executionToken:     ctx.executionToken,
        transitionId:       ctx.transitionId,
        transitionEventSeq: ctx.transitionEventSeq,
      });
      return foldBudgetIntoPrior("invoice-posting+budget-consume", postOutcome, budgetResult);
    }

    case "SETTLEMENT": {
      if (ctx.sourceDocType !== "payment_entry") {
        return unsupported(
          ctx.eventCode,
          `SETTLEMENT expects sourceDocType='payment_entry', got '${ctx.sourceDocType}'.`,
        );
      }
      const result = await handlePostPayment(
        db,
        ctx.tenantId,
        ctx.sourceDocId,
        ctx.principalId,
        undefined,                   // logger
        undefined,                   // lifecycleSync
        {
          executionToken:     ctx.executionToken,
          transitionId:       ctx.transitionId,
          transitionEventSeq: ctx.transitionEventSeq,
        },
      );
      return fromHandlerResult("payment-posting", result);
    }

    case "REVERSAL": {
      const dispatchCtx = {
        executionMode:       "lifecycle_hook" as const,
        executionToken:     ctx.executionToken,
        transitionId:       ctx.transitionId,
        transitionEventSeq: ctx.transitionEventSeq,
      };
      if (ctx.sourceDocType === "purchase_invoice") {
        const result = await handleReverseInvoice(
          db, ctx.tenantId, ctx.sourceDocId, ctx.principalId,
          { ...(ctx.operationPayload ?? {}) }, undefined, undefined, dispatchCtx,
        );
        return fromHandlerResult("invoice-reversal", result);
      }
      if (ctx.sourceDocType === "payment_entry") {
        const result = await handleVoidPayment(
          db, ctx.tenantId, ctx.sourceDocId, ctx.principalId,
          {}, undefined, undefined, dispatchCtx,
        );
        return fromHandlerResult("payment-void", result);
      }
      // Audit P5-S3: receipt + service_sheet reversal handlers are stubbed.
      // The stubs always return {ok:false, error:{code:..._NOT_IMPLEMENTED}}
      // so the dispatcher surfaces a named, searchable failure rather than
      // the generic `unsupported` outcome. The seeded REVERSAL hook for these
      // entities is safety_level='required', so this failure aborts the
      // transition under LIFECYCLE_STRICT_REQUIRED=true — which is the
      // correct fail-closed posture while no reversal pathway exists.
      if (ctx.sourceDocType === "receipt") {
        const result = await handleReverseReceipt(db, {
          tenantId:           ctx.tenantId,
          receiptId:          ctx.sourceDocId,
          principalId:        ctx.principalId,
          executionToken:     ctx.executionToken,
          transitionId:       ctx.transitionId,
          transitionEventSeq: ctx.transitionEventSeq,
        });
        return toOutcome("receipt-reversal", result);
      }
      if (ctx.sourceDocType === "service_sheet") {
        const result = await handleReverseServiceSheet(db, {
          tenantId:           ctx.tenantId,
          serviceSheetId:     ctx.sourceDocId,
          principalId:        ctx.principalId,
          executionToken:     ctx.executionToken,
          transitionId:       ctx.transitionId,
          transitionEventSeq: ctx.transitionEventSeq,
        });
        return toOutcome("service-sheet-reversal", result);
      }
      return unsupported(
        ctx.eventCode,
        `Reversal handler for sourceDocType='${ctx.sourceDocType}' is not implemented yet.`,
      );
    }

    case "ORDER_CREATION": {
      if (ctx.sourceDocType !== "purchase_requisition") {
        return unsupported(
          ctx.eventCode,
          `ORDER_CREATION expects sourceDocType='purchase_requisition', got '${ctx.sourceDocType}'.`,
        );
      }
      const budgetResult = await reserveBudget(db, {
        tenantId:           ctx.tenantId,
        sourceDocId:        ctx.sourceDocId,
        principalId:        ctx.principalId,
        executionToken:     ctx.executionToken,
        transitionId:       ctx.transitionId,
        transitionEventSeq: ctx.transitionEventSeq,
      });
      return fromBudgetResult("budget-reserve", budgetResult);
    }

    case "RELEASE": {
      if (ctx.sourceDocType !== "commitment" && ctx.sourceDocType !== "purchase_order") {
        return unsupported(
          ctx.eventCode,
          `RELEASE expects sourceDocType='commitment' or 'purchase_order', got '${ctx.sourceDocType}'.`,
        );
      }
      const reason: "cancel" | "short_close" =
        // operation_code isn't on DispatchCtx; the hook-runner stamps it on
        // its own ctx but the dispatcher only sees flowCode/eventCode here.
        // The PO transitions wired to RELEASE are 'cancel' from both
        // approved and sent_to_supplier states; short_close lands the same
        // RELEASE event from a different transition (also fine).
        "cancel";
      const budgetResult = await releaseBudget(db, {
        tenantId:           ctx.tenantId,
        sourceDocId:        ctx.sourceDocId,
        principalId:        ctx.principalId,
        executionToken:     ctx.executionToken,
        transitionId:       ctx.transitionId,
        transitionEventSeq: ctx.transitionEventSeq,
        releaseReason:      reason,
      });
      return fromBudgetResult("budget-release", budgetResult);
    }

    default:
      return unsupported(
        ctx.eventCode,
        `Unknown event_code '${ctx.eventCode}' — no dispatcher route registered.`,
      );
  }
}

function unsupported(eventCode: string, reason: string): DispatchOutcome {
  return { kind: "unsupported", handler: null, eventCode, reason };
}

function toOutcome(
  handler: string,
  result:  ReceiptPostingResult | ServiceSheetPostingResult | CommitmentApproveResult,
): DispatchOutcome {
  if (result.ok) {
    return { kind: "ok", handler, result };
  }
  return {
    kind:   "handlerFailed",
    handler,
    error: {
      code:    result.error?.code    ?? "HANDLER_FAILED",
      message: result.error?.message ?? "Handler returned ok=false without error details.",
    },
  };
}

/**
 * Convert the business-handler result from handlePostInvoice /
 * handlePostPayment ({ status: number, body: { error?, message? } }) into
 * the dispatcher's DispatchOutcome.
 *   2xx          → ok
 *   404 / 409    → handlerFailed (concurrent change or missing record)
 *   422          → handlerFailed (precondition / validation)
 *   other        → handlerFailed
 */
function fromHandlerResult(
  handler: string,
  result:  { status: number; body: Record<string, unknown> },
): DispatchOutcome {
  if (result.status >= 200 && result.status < 300) {
    return { kind: "ok", handler, result: result.body };
  }
  const errorCode    = typeof result.body["error"]   === "string" ? String(result.body["error"])   : `HTTP_${result.status}`;
  const errorMessage = typeof result.body["message"] === "string" ? String(result.body["message"]) : `Handler returned HTTP ${result.status}.`;
  return {
    kind:   "handlerFailed",
    handler,
    error: { code: errorCode, message: errorMessage },
  };
}

function fromBudgetResult(handler: string, result: BudgetTxnResult): DispatchOutcome {
  if (result.ok) {
    return { kind: "ok", handler, result };
  }
  return {
    kind:   "handlerFailed",
    handler,
    error: {
      code:    result.error?.code    ?? "BUDGET_TXN_FAILED",
      message: result.error?.message ?? "Budget transaction service returned ok=false without error details.",
    },
  };
}

/**
 * Fold a budget outcome into a prior successful posting outcome.
 *
 * The semantics here are deliberate: if the budget side-effect fails, the
 * dispatcher must surface a failure to the lifecycle hook-runner so the
 * transition rolls back atomically. A posted JE without its matching budget
 * row is the exact gap this hardening is designed to close.
 */
function foldBudgetIntoPrior(
  handler:        string,
  priorOk:        DispatchOutcome & { kind: "ok" },
  budgetResult:   BudgetTxnResult,
): DispatchOutcome {
  if (budgetResult.ok) {
    return {
      kind:    "ok",
      handler,
      result:  { posting: priorOk.result, budget: budgetResult },
    };
  }
  return {
    kind:   "handlerFailed",
    handler,
    error: {
      code:    budgetResult.error?.code    ?? "BUDGET_TXN_FAILED",
      message: budgetResult.error?.message ?? "Budget side-effect failed after posting succeeded.",
    },
  };
}
