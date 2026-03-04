// framework/runtime/src/services/business/engines/event-store/domain/event-catalog.ts

/**
 * Centralized event type constants organized by engine.
 * Every event published to the event store MUST use a constant from here.
 */

/** OU + Intent Events */
export const OU_EVENTS = {
  CREATED: "ou.created",
  ACTIVATED: "ou.activated",
  REVIEW_TRIGGERED: "ou.review_triggered",
  SUNSET: "ou.sunset",
  ARCHIVED: "ou.archived",
  INHERITANCE_CHANGED: "ou.inheritance_changed",
} as const;

/** Transaction Pipeline / Decision Grid Events */
export const TXN_EVENTS = {
  SUBMITTED: "txn.submitted",
  VALIDATED: "txn.validated",
  DEFAULTS_DERIVED: "txn.defaults_derived",
  POLICY_EVALUATED: "txn.policy_evaluated",
  RISK_SCORED: "txn.risk_scored",
  WORKFLOW_CREATED: "txn.workflow_created",
  APPROVED: "txn.approved",
  REJECTED: "txn.rejected",
  BLOCKED: "txn.blocked",
  FINALIZED: "txn.finalized",
} as const;

/** Funding Profile / Budget Events */
export const FP_EVENTS = {
  CREATED: "fp.created",
  RESERVED: "fp.reserved",
  COMMITTED: "fp.committed",
  CONSUMED: "fp.consumed",
  RELEASED: "fp.released",
  REFORECASTED: "fp.reforecasted",
  THRESHOLD_CROSSED: "fp.threshold_crossed",
  BREACH_DETECTED: "fp.breach_detected",
  TRANSFER_APPROVED: "fp.transfer_approved",
  CARRY_FORWARD: "fp.carry_forward",
} as const;

/** Commitment Events */
export const COMMITMENT_EVENTS = {
  CREATED: "commitment.created",
  SUBMITTED: "commitment.submitted",
  APPROVED: "commitment.approved",
  FULFILLED: "commitment.fulfilled",
  PARTIALLY_FULFILLED: "commitment.partially_fulfilled",
  CANCELLED: "commitment.cancelled",
  RENEWED: "commitment.renewed",
  ESCALATED: "commitment.escalated",
  RETENTION_RELEASED: "retention.released",
  SCHEDULE_TRIGGERED: "schedule.triggered",
} as const;

/** Journal Entry / Posting Events */
export const JE_EVENTS = {
  CREATED: "je.created",
  POSTED: "je.posted",
  REVERSED: "je.reversed",
  PERIOD_OPENED: "period.opened",
  PERIOD_SOFT_CLOSED: "period.soft_closed",
  PERIOD_HARD_CLOSED: "period.hard_closed",
  RECONCILIATION_COMPLETED: "reconciliation.completed",
} as const;

/** Tax Events */
export const TAX_EVENTS = {
  CALCULATED: "tax.calculated",
  WHT_APPLIED: "tax.wht_applied",
  RETURN_PREPARED: "tax.return_prepared",
  CREDIT_RECONCILED: "tax.credit_reconciled",
  RATE_UPDATED: "tax.rate_updated",
} as const;

/** Asset Events (Phase 2) */
export const ASSET_EVENTS = {
  CREATED: "asset.created",
  CAPITALIZED: "asset.capitalized",
  DEPRECIATED: "asset.depreciated",
  REVALUED: "asset.revalued",
  IMPAIRED: "asset.impaired",
  TRANSFERRED: "asset.transferred",
  RETIRED: "asset.retired",
  DISPOSED: "asset.disposed",
} as const;

/** Inventory Events (Phase 2) */
export const INVENTORY_EVENTS = {
  RECEIVED: "inv.received",
  ISSUED: "inv.issued",
  TRANSFERRED: "inv.transferred",
  ADJUSTED: "inv.adjusted",
  COUNTED: "inv.counted",
  REVALUED: "inv.revalued",
  SCRAPPED: "inv.scrapped",
  RETURNED: "inv.returned",
} as const;

/** Commission Events (Phase 2) */
export const COMMISSION_EVENTS = {
  CALCULATED: "comm.calculated",
  ACCRUED: "comm.accrued",
  APPROVED: "comm.approved",
  SETTLED: "comm.settled",
  CLAWED_BACK: "comm.clawed_back",
  STATEMENT_GENERATED: "comm.statement_generated",
} as const;

/** Intercompany / Federation Events (Phase 3) */
export const IC_EVENTS = {
  ORDER_CREATED: "ic.order_created",
  MIRROR_CREATED: "ic.mirror_created",
  PRICED: "ic.priced",
  NETTED: "ic.netted",
  SETTLED: "ic.settled",
  FX_TRANSLATED: "fx.translated",
  FX_REVALUED: "fx.revalued",
  CONSOLIDATION_ELIMINATION: "consolidation.elimination_posted",
} as const;

/** Production / WIP Events (Phase 3) */
export const PRODUCTION_EVENTS = {
  WO_CREATED: "wo.created",
  WO_RELEASED: "wo.released",
  MATERIAL_ISSUED: "wo.material_issued",
  LABOR_CONFIRMED: "wo.labor_confirmed",
  OVERHEAD_ABSORBED: "wo.overhead_absorbed",
  WO_COMPLETED: "wo.completed",
  WO_CLOSED: "wo.closed",
  VARIANCE_POSTED: "wo.variance_posted",
} as const;

/** Atlas AI Events (Phase 4) */
export const AI_EVENTS = {
  RECOMMENDATION: "ai.recommendation",
  ACTION_EXECUTED: "ai.action_executed",
  ACTION_REVERSED: "ai.action_reversed",
  MODEL_DEPLOYED: "ai.model_deployed",
  ANOMALY_DETECTED: "ai.anomaly_detected",
  CONFIDENCE_ALERT: "ai.confidence_alert",
} as const;
