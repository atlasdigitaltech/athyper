/**
 * @athyper/api-contracts — Shared Enum Constants
 *
 * These mirror the backend's platform enum tables.
 * Frontend code MUST use these constants — never hardcode string literals.
 *
 * CI contract rule: any backend enum change must update this file.
 * See docs/api/contract-sync.md.
 */

// ── Entity Classes ───────────────────────────────────────────────
// Mirrors control.entity_class_profile.entity_class

export const EntityClass = {
  REFERENCE:         "REFERENCE",
  MASTER:            "MASTER",
  CONTROL:           "CONTROL",
  DOCUMENT:          "DOCUMENT",
  DOCUMENT_RELATION: "DOCUMENT_RELATION",
  LEDGER:            "LEDGER",
  LOG:               "LOG",
  AGGREGATE:         "AGGREGATE",
  DIMENSION:         "DIMENSION",
  RELATION:          "RELATION",
} as const;

export type EntityClass = (typeof EntityClass)[keyof typeof EntityClass];

// ── Operation Handler Types ──────────────────────────────────────
// Mirrors control.entity_operation.handler_type

export const OperationHandlerType = {
  NAVIGATE: "NAVIGATE",
  API:      "API",
  MODAL:    "MODAL",
  INLINE:   "INLINE",
} as const;

export type OperationHandlerType = (typeof OperationHandlerType)[keyof typeof OperationHandlerType];

// ── Operation Placement ──────────────────────────────────────────
// Mirrors control.entity_operation.placement

export const OperationPlacement = {
  PRIMARY:  "PRIMARY",
  TOOLBAR:  "TOOLBAR",
  OVERFLOW: "OVERFLOW",
  CONTEXT:  "CONTEXT",
  COMMAND:  "COMMAND",
} as const;

export type OperationPlacement = (typeof OperationPlacement)[keyof typeof OperationPlacement];

// ── Workflow Action Types ────────────────────────────────────────
// Used in approval/delegation requests

export const WorkflowAction = {
  APPROVE:  "APPROVE",
  REJECT:   "REJECT",
  DELEGATE: "DELEGATE",
  ESCALATE: "ESCALATE",
  WITHDRAW: "WITHDRAW",
} as const;

export type WorkflowAction = (typeof WorkflowAction)[keyof typeof WorkflowAction];

// ── Document / Record Status ─────────────────────────────────────
// Common lifecycle statuses (actual per-entity statuses come from
// control.lookup_domain / snapshot.lifecycle_route at runtime).

export const DocumentStatus = {
  DRAFT:     "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED:  "APPROVED",
  REJECTED:  "REJECTED",
  POSTED:    "POSTED",
  REVERSED:  "REVERSED",
  CANCELLED: "CANCELLED",
} as const;

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

// ── Sort Direction ───────────────────────────────────────────────

export const SortDir = {
  ASC:  "asc",
  DESC: "desc",
} as const;

export type SortDir = (typeof SortDir)[keyof typeof SortDir];
