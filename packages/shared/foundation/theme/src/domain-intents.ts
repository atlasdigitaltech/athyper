/**
 * @athyper/theme — Domain Intent Mappings
 *
 * Maps business-domain status/class/type values to the generic SemanticIntent
 * understood by resolveSemanticColors(). This keeps palette knowledge in one
 * place and ensures every domain badge responds to theme-preset switching.
 *
 * USAGE:
 *   import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
 *   import { adminStatusIntent, accountClassIntent } from "@athyper/theme/domain-intents";
 *
 *   const colors = resolveSemanticColors(adminStatusIntent(status));
 *   <span className={cn("...", colors.subtleBadge)}>{status}</span>
 */

import type { SemanticIntent } from "./semantic-colors";

// ── Generic lifecycle / admin status ─────────────────────────────────────────

export type AdminStatus =
  | "active" | "inactive" | "deprecated"
  | "enabled" | "disabled"
  | "healthy" | "degraded" | "down"
  | "pending" | "draft" | "published" | "archived";

const ADMIN_STATUS_INTENT: Record<AdminStatus, SemanticIntent> = {
  active:     "success",
  inactive:   "neutral",
  deprecated: "warning",
  enabled:    "success",
  disabled:   "neutral",
  healthy:    "success",
  degraded:   "warning",
  down:       "error",
  pending:    "info",
  draft:      "neutral",
  published:  "success",
  archived:   "muted",
};

/** Map a generic lifecycle / admin status string to a SemanticIntent. */
export function adminStatusIntent(value: string): SemanticIntent {
  return ADMIN_STATUS_INTENT[value as AdminStatus] ?? "neutral";
}

// ── Kanban / workflow record status ──────────────────────────────────────────

const KANBAN_STATUS_INTENT: Record<string, SemanticIntent> = {
  active:      "success",
  approved:    "success",
  completed:   "info",
  in_progress: "info",
  pending:     "warning",
  on_hold:     "warning",
  draft:       "neutral",
  inactive:    "neutral",
  deprecated:  "muted",
  rejected:    "error",
  cancelled:   "error",
};

/** Map a kanban/workflow record status to a SemanticIntent. */
export function kanbanStatusIntent(value: string): SemanticIntent {
  return KANBAN_STATUS_INTENT[value.toLowerCase()] ?? "neutral";
}

// ── Entity class (metadata / schema browser) ─────────────────────────────────

const ENTITY_CLASS_INTENT: Record<string, SemanticIntent> = {
  REFERENCE:         "neutral",
  MASTER:            "primary",
  DOCUMENT:          "warning",
  DOCUMENT_RELATION: "muted",
  CONTROL:           "accent",
  LEDGER:            "success",
  LOG:               "info",
  AGGREGATE:         "info",
  DIMENSION:         "neutral",
  RELATION:          "muted",
};

/** Map a metadata entity class to a SemanticIntent. */
export function entityClassIntent(cls: string): SemanticIntent {
  return ENTITY_CLASS_INTENT[cls.toUpperCase()] ?? "neutral";
}

// ── Data / field type (metadata studio) ──────────────────────────────────────

const DATA_TYPE_INTENT: Record<string, SemanticIntent> = {
  text:     "neutral",
  integer:  "primary",
  decimal:  "primary",
  boolean:  "accent",
  uuid:     "muted",
  date:     "info",
  datetime: "info",
  time:     "info",
  enum:     "warning",
  json:     "muted",
  jsonb:    "muted",
  array:    "muted",
};

/** Map a field data type string to a SemanticIntent. */
export function dataTypeIntent(type: string): SemanticIntent {
  return DATA_TYPE_INTENT[type.toLowerCase()] ?? "neutral";
}

// ── Field attribute flags (metadata studio) ──────────────────────────────────

export const FIELD_FLAG_INTENT: Record<string, SemanticIntent> = {
  required:   "warning",
  unique:     "primary",
  read_only:  "neutral",
  computed:   "success",
  searchable: "info",
  filterable: "info",
  sortable:   "neutral",
};

// ── Finance: account class ────────────────────────────────────────────────────

const ACCOUNT_CLASS_INTENT: Record<string, SemanticIntent> = {
  asset:            "primary",
  contra_asset:     "muted",
  liability:        "accent",
  contra_liability: "muted",
  equity:           "info",
  contra_equity:    "muted",
  income:           "success",
  expense:          "warning",
};

/** Map a COA account class to a SemanticIntent. */
export function accountClassIntent(cls: string): SemanticIntent {
  return ACCOUNT_CLASS_INTENT[cls.toLowerCase()] ?? "neutral";
}

// ── Finance: chart tier ───────────────────────────────────────────────────────

const CHART_TIER_INTENT: Record<string, SemanticIntent> = {
  group:     "accent",
  operating: "primary",
  local:     "warning",
};

/** Map a COA chart tier to a SemanticIntent. */
export function chartTierIntent(tier: string): SemanticIntent {
  return CHART_TIER_INTENT[tier.toLowerCase()] ?? "neutral";
}

// ── Finance: consolidation method ────────────────────────────────────────────

const CONSOL_METHOD_INTENT: Record<string, SemanticIntent> = {
  full:         "success",
  proportional: "primary",
  equity:       "warning",
};

/** Map a consolidation method to a SemanticIntent. */
export function consolMethodIntent(method: string): SemanticIntent {
  return CONSOL_METHOD_INTENT[method.toLowerCase()] ?? "neutral";
}

// ── Finance: owner / counterparty type ───────────────────────────────────────

const OWNER_TYPE_INTENT: Record<string, SemanticIntent> = {
  customer: "primary",
  supplier: "accent",
  employee: "warning",
  internal: "neutral",
};

/** Map a counterparty owner type to a SemanticIntent. */
export function ownerTypeIntent(owner: string): SemanticIntent {
  return OWNER_TYPE_INTENT[owner.toLowerCase()] ?? "neutral";
}

// ── Finance: payment direction ───────────────────────────────────────────────

const PAYMENT_DIRECTION_INTENT: Record<string, SemanticIntent> = {
  INBOUND:  "success",
  OUTBOUND: "primary",
};

/** Map a payment direction to a SemanticIntent. */
export function paymentDirectionIntent(direction: string): SemanticIntent {
  return PAYMENT_DIRECTION_INTENT[direction.toUpperCase()] ?? "neutral";
}

// ── Finance: reconciliation type ─────────────────────────────────────────────

const RECON_TYPE_INTENT: Record<string, SemanticIntent> = {
  auto:   "primary",
  manual: "warning",
};

/** Map a reconciliation type to a SemanticIntent. */
export function reconTypeIntent(type: string): SemanticIntent {
  return RECON_TYPE_INTENT[type.toLowerCase()] ?? "neutral";
}

// ── Finance: period close run status ─────────────────────────────────────────

const CLOSE_RUN_STATUS_INTENT: Record<string, SemanticIntent> = {
  PLANNED:     "neutral",
  OPEN:        "info",
  IN_PROGRESS: "warning",
  PHASE_GATE:  "accent",
  COMPLETED:   "success",
  CERTIFIED:   "success",
  CLOSED:      "muted",
};

/** Map a period close run status to a SemanticIntent. */
export function closeRunStatusIntent(status: string): SemanticIntent {
  return CLOSE_RUN_STATUS_INTENT[status] ?? "neutral";
}

// ── Finance: period close task status ────────────────────────────────────────

const CLOSE_TASK_STATUS_INTENT: Record<string, SemanticIntent> = {
  PENDING:     "neutral",
  IN_PROGRESS: "info",
  COMPLETED:   "success",
  BLOCKED:     "warning",
  FAILED:      "error",
  DEVIATED:    "accent",
};

/** Map a period close task status to a SemanticIntent. */
export function closeTaskStatusIntent(status: string): SemanticIntent {
  return CLOSE_TASK_STATUS_INTENT[status] ?? "neutral";
}

// ── Finance: AP / AR document status ─────────────────────────────────────────

const AP_AR_STATUS_INTENT: Record<string, SemanticIntent> = {
  draft:     "neutral",
  submitted: "primary",
  approved:  "success",
  posted:    "success",
  paid:      "success",
  overdue:   "error",
  voided:    "muted",
  cancelled: "muted",
};

/** Map an AP/AR document status to a SemanticIntent (text color only — no badge). */
export function apArStatusIntent(status: string): SemanticIntent {
  return AP_AR_STATUS_INTENT[status.toLowerCase()] ?? "neutral";
}

// ── GL schema type (master / control / ledger) ────────────────────────────────

const GL_SCHEMA_INTENT: Record<string, SemanticIntent> = {
  master:  "primary",
  control: "accent",
  ledger:  "success",
};

/** Map a GL schema type tag to a SemanticIntent. */
export function glSchemaIntent(schema: string): SemanticIntent {
  return GL_SCHEMA_INTENT[schema.toLowerCase()] ?? "neutral";
}
