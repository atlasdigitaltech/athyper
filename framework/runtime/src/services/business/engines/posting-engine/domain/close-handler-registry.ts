// framework/runtime/src/services/business/engines/posting-engine/domain/close-handler-registry.ts
//
// Registry for SYSTEM and HYBRID close task handlers.
// Each handler implements a specific close task validation or execution
// (e.g., trial balance check, depreciation batch, FX revaluation).
//
// Handlers are registered by their `system_check_handler` identifier
// (e.g., "close.trial_balance_validation") and dispatched by the
// PeriodCloseService when a SYSTEM/HYBRID task needs execution.

import type { OperationContext } from "../../shared/engine-base";

/**
 * Standardized evidence codes for close handler results.
 * Provides a machine-readable taxonomy so downstream systems
 * (UI, audit log, retry logic) can act on failure reasons.
 *
 * ── Normalization guide (use this to pick the right code) ──────────
 *
 * PASSED              — Check succeeded; no issues found.
 * NOT_APPLICABLE      — Check is irrelevant for this entity/period
 *                       (e.g., no assets → depreciation N/A).
 * MISSING_DATA        — Source records absent or insufficient for
 *                       evaluation (e.g., no GL balances at all).
 * MISSING_PREREQUISITE— Another task, configuration, or dependency
 *                       was never completed (e.g., fiscal period not
 *                       configured, prior-period close not done).
 * CONTEXT_MISSING_ENTITY — Entity-scoped handler cannot resolve the
 *                       entity context (e.g., legal entity row absent
 *                       in fin.legal_entity).
 * MISSING_RUN         — The domain run record itself does not exist
 *                       (e.g., depreciation_run row never created,
 *                       revaluation never triggered).
 * RUN_FAILED          — Run record exists but its status is FAILED.
 * RUN_INCOMPLETE      — Run record exists but is not yet COMPLETED
 *                       (IN_PROGRESS, PENDING, PARTIAL, etc.).
 * POSTING_INCOMPLETE  — Run completed successfully but the resulting
 *                       accounting/posting is not finalized (e.g.,
 *                       JE reference missing on revaluation).
 * RECONCILIATION_INCOMPLETE — Aggregate failure for reconciliation-
 *                       style checks where multiple sub-items have
 *                       mixed issue types.
 * DISCREPANCY         — Computed mismatch beyond tolerance threshold
 *                       (e.g., trial balance imbalance, bank recon
 *                       discrepancy amount).
 * UNMATCHED_ITEMS     — Reconciliation-style unresolved items remain
 *                       (e.g., unmatched bank transactions).
 */
export type CloseEvidenceCode =
  | "PASSED"
  | "NOT_APPLICABLE"
  | "MISSING_DATA"
  | "MISSING_PREREQUISITE"
  | "CONTEXT_MISSING_ENTITY"
  | "MISSING_RUN"
  | "RUN_FAILED"
  | "RUN_INCOMPLETE"
  | "POSTING_INCOMPLETE"
  | "RECONCILIATION_INCOMPLETE"
  | "DISCREPANCY"
  | "UNMATCHED_ITEMS";

/**
 * Result of a system close handler execution.
 */
export interface CloseHandlerResult {
  /** Whether the check/execution passed */
  passed: boolean;
  /** Machine-readable evidence classification */
  evidenceCode: CloseEvidenceCode;
  /** Human-readable summary of what happened */
  message: string;
  /** Structured evidence payload (batch IDs, JE refs, report hashes) */
  evidence: Record<string, unknown>;
  /** Optional suggested next action for the user/system */
  nextSuggestedAction?: string;
}

/**
 * A system close handler that can validate or execute a close task.
 * Implementations are stateless — all context comes via parameters.
 */
export interface CloseHandler {
  /** The handler identifier, matching period_close_task.system_check_handler */
  readonly handlerCode: string;
  /** Human-readable name for logging/diagnostics */
  readonly displayName: string;
  /**
   * Execute the close task.
   * Returns passed=true if the task succeeded (mark COMPLETED),
   * or passed=false if it failed (mark FAILED with message).
   */
  execute(
    ctx: OperationContext,
    params: CloseHandlerParams,
  ): Promise<CloseHandlerResult>;
}

/** Statement scope policy for bank reconciliation. */
export type BankRecScopePolicy = "OVERLAP" | "ENDING_WITHIN";

export interface CloseHandlerParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  /** Task-level policy overrides, sourced from period_close_task.config_json */
  taskPolicy?: {
    /** Bank-rec scope: OVERLAP (any overlap, default) or ENDING_WITHIN (statement ends within period) */
    bankRecScope?: BankRecScopePolicy;
  };
}

/**
 * Registry for close task handlers.
 * Handlers are registered during module startup and dispatched by handler code.
 */
export class CloseHandlerRegistry {
  private handlers = new Map<string, CloseHandler>();

  register(handler: CloseHandler): void {
    if (this.handlers.has(handler.handlerCode)) {
      throw new Error(
        `Close handler already registered: ${handler.handlerCode}`,
      );
    }
    this.handlers.set(handler.handlerCode, handler);
  }

  get(handlerCode: string): CloseHandler | undefined {
    return this.handlers.get(handlerCode);
  }

  has(handlerCode: string): boolean {
    return this.handlers.has(handlerCode);
  }

  listRegistered(): string[] {
    return Array.from(this.handlers.keys());
  }
}
