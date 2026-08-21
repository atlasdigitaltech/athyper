/**
 * P2P Entity Dispatch — single source of truth for entity-type → physical
 * table / FK column / polymorphic source-type mapping plus the
 * restore-safe immutable-column allowlists.
 *
 * Consolidates dispatch maps that previously lived (in identical form) in
 * three separate files:
 *   - snapshot-capture.service.ts   (private headerTable / linesTableFor)
 *   - snapshot-restore.service.ts   (private dispatch + immutable cols)
 *   - child-current-rows.service.ts (typed polymorphicSourceTypeFor)
 *
 * The duplication was drift bait: adding a new P2P entity required updating
 * three files in lockstep. This module is the canonical home; consumers
 * import the helper they need.
 *
 * Layer boundary: business/p2p. No I/O, no React. Pure constants + switches.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type P2pParentEntityType =
  | "purchase_requisition"
  | "commitment"
  | "purchase_order"
  | "purchase_order_confirmation"
  | "delivery_note"
  | "receipt"
  | "service_sheet"
  | "purchase_invoice"
  | "payment_entry";

/**
 * Sealed enum matching the CHECK constraint on
 *   pricing_component.source_doc_type
 *   accounting_distribution.source_doc_type
 *   schedule_line.source_doc_type
 * Returned by polymorphicSourceTypeFor(); null for entity types that do
 * not own polymorphic child carriers (POC, DN).
 */
export type P2pPolymorphicSourceType =
  | "purchase_requisition_line"
  | "commitment_line"
  | "receipt_line"
  | "service_sheet_line"
  | "purchase_invoice_line";

export type P2pGateEventKind =
  | "authoring_lock"
  | "commitment"
  | "fulfillment"
  | "financial_post"
  | "match_decision"
  | "amendment_baseline"
  | "reversal";

export interface P2pDispatchEntry {
  entityType: P2pParentEntityType;
  headerTable: string;
  linesTable: string | null;
  parentFkColumn: string | null;
  documentCodeField: string;
  hasPricingComponents: boolean;
  hasAccountingDistributions: boolean;
  hasSchedules: boolean;
  hasFulfillments: boolean;
  relatedTables: readonly string[];
  polymorphicSourceType: P2pPolymorphicSourceType | null;
  supportedGateEvents: readonly P2pGateEventKind[];
  requiresPostReadinessCheck: boolean;
}

export const P2P_DISPATCH: Record<P2pParentEntityType, P2pDispatchEntry> = {
  purchase_requisition: {
    entityType: "purchase_requisition",
    headerTable: "purchase_requisition",
    linesTable: "purchase_requisition_line",
    parentFkColumn: "purchase_requisition_id",
    documentCodeField: "code",
    hasPricingComponents: false,
    hasAccountingDistributions: false,
    hasSchedules: false,
    hasFulfillments: false,
    relatedTables: [],
    polymorphicSourceType: "purchase_requisition_line",
    supportedGateEvents: ["authoring_lock", "commitment", "amendment_baseline", "reversal"],
    requiresPostReadinessCheck: false,
  },
  commitment: {
    entityType: "commitment",
    headerTable: "commitment",
    linesTable: "commitment_line",
    parentFkColumn: "commitment_id",
    documentCodeField: "code",
    hasPricingComponents: true,
    hasAccountingDistributions: true,
    hasSchedules: true,
    hasFulfillments: true,
    relatedTables: ["commitment_release_allocation"],
    polymorphicSourceType: "commitment_line",
    supportedGateEvents: ["authoring_lock", "commitment", "fulfillment", "amendment_baseline", "reversal"],
    requiresPostReadinessCheck: false,
  },
  purchase_order: {
    entityType: "purchase_order",
    headerTable: "commitment",
    linesTable: "commitment_line",
    parentFkColumn: "commitment_id",
    documentCodeField: "code",
    hasPricingComponents: true,
    hasAccountingDistributions: true,
    hasSchedules: true,
    hasFulfillments: true,
    relatedTables: ["commitment_release_allocation"],
    polymorphicSourceType: "commitment_line",
    supportedGateEvents: ["authoring_lock", "commitment", "fulfillment", "amendment_baseline", "reversal"],
    requiresPostReadinessCheck: false,
  },
  purchase_order_confirmation: {
    entityType: "purchase_order_confirmation",
    headerTable: "purchase_order_confirmation",
    linesTable: "purchase_order_confirmation_line",
    parentFkColumn: "confirmation_id",
    documentCodeField: "code",
    hasPricingComponents: false,
    hasAccountingDistributions: false,
    hasSchedules: false,
    hasFulfillments: false,
    relatedTables: [],
    polymorphicSourceType: null,
    supportedGateEvents: ["commitment", "amendment_baseline", "reversal"],
    requiresPostReadinessCheck: false,
  },
  delivery_note: {
    entityType: "delivery_note",
    headerTable: "delivery_note",
    linesTable: "delivery_note_line",
    parentFkColumn: "delivery_note_id",
    documentCodeField: "code",
    hasPricingComponents: false,
    hasAccountingDistributions: false,
    hasSchedules: false,
    hasFulfillments: false,
    relatedTables: [],
    polymorphicSourceType: null,
    supportedGateEvents: ["fulfillment", "reversal"],
    requiresPostReadinessCheck: false,
  },
  receipt: {
    entityType: "receipt",
    headerTable: "receipt",
    linesTable: "receipt_line",
    parentFkColumn: "receipt_id",
    documentCodeField: "code",
    hasPricingComponents: false,
    hasAccountingDistributions: true,
    hasSchedules: false,
    hasFulfillments: true,
    relatedTables: [],
    polymorphicSourceType: "receipt_line",
    supportedGateEvents: ["authoring_lock", "commitment", "fulfillment", "financial_post", "amendment_baseline", "reversal"],
    requiresPostReadinessCheck: true,
  },
  service_sheet: {
    entityType: "service_sheet",
    headerTable: "service_sheet",
    linesTable: "service_sheet_line",
    parentFkColumn: "service_sheet_id",
    documentCodeField: "code",
    hasPricingComponents: false,
    hasAccountingDistributions: true,
    hasSchedules: false,
    hasFulfillments: true,
    relatedTables: [],
    polymorphicSourceType: "service_sheet_line",
    supportedGateEvents: ["authoring_lock", "commitment", "fulfillment", "financial_post", "amendment_baseline", "reversal"],
    requiresPostReadinessCheck: true,
  },
  purchase_invoice: {
    entityType: "purchase_invoice",
    headerTable: "purchase_invoice",
    linesTable: "purchase_invoice_line",
    parentFkColumn: "purchase_invoice_id",
    documentCodeField: "code",
    hasPricingComponents: true,
    hasAccountingDistributions: true,
    hasSchedules: false,
    hasFulfillments: false,
    relatedTables: ["invoice_tax_snapshot", "payment_term_application"],
    polymorphicSourceType: "purchase_invoice_line",
    supportedGateEvents: ["authoring_lock", "commitment", "financial_post", "reversal", "match_decision", "amendment_baseline"],
    requiresPostReadinessCheck: true,
  },
  payment_entry: {
    entityType: "payment_entry",
    headerTable: "payment_entry",
    linesTable: "payment_entry_allocation",
    parentFkColumn: "payment_entry_id",
    documentCodeField: "payment_number",
    hasPricingComponents: false,
    hasAccountingDistributions: false,
    hasSchedules: false,
    hasFulfillments: false,
    relatedTables: ["payment_term_discount_result", "payment_remittance_output"],
    polymorphicSourceType: null,
    supportedGateEvents: ["authoring_lock", "commitment", "financial_post", "reversal"],
    requiresPostReadinessCheck: false,
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Header-table dispatch
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Maps an entity type to its header table (under the `document.` schema).
 * Returns null for unknown types so callers can short-circuit cleanly.
 *
 * `purchase_order` maps to the same `commitment` table — PO is a commitment
 * view in P2P parlance. The duplicate case isn't a typo.
 */
export function headerTable(entityType: string): string | null {
  return P2P_DISPATCH[entityType as P2pParentEntityType]?.headerTable ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Lines-table dispatch
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Maps an entity type to its `*_line` child table + the FK column that
 * points back to the parent header. Returns null when the entity has no
 * line carrier (none in the current set; defensive against future types).
 */
export function linesTableFor(entityType: string): { table: string; fk: string } | null {
  const entry = P2P_DISPATCH[entityType as P2pParentEntityType];
  if (!entry?.linesTable || !entry.parentFkColumn) return null;
  return { table: entry.linesTable, fk: entry.parentFkColumn };
}

// ──────────────────────────────────────────────────────────────────────────────
// Polymorphic source-type dispatch
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Maps the parent entity type to the value stored on
 * pricing_component / accounting_distribution / schedule_line
 * `.source_doc_type`.
 *
 * Returns null for entity types that do not own polymorphic child carriers
 * (e.g. purchase_order_confirmation, delivery_note). Callers SHOULD treat
 * null as "this entity has no child carriers" and short-circuit cleanly —
 * see snapshot-capture's per-child loaders for the canonical pattern.
 */
export function polymorphicSourceTypeFor(
  entityType: P2pParentEntityType,
): P2pPolymorphicSourceType | null {
  return P2P_DISPATCH[entityType]?.polymorphicSourceType ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Restore-safe column allowlists
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Columns we never overwrite on the header during a snapshot restore.
 * Identity + tenant scoping + the creation audit pair are immutable.
 * `status` stays as the current draft/rejected/proforma value — restoring
 * to the snapshot's status would silently rewind the workflow.
 * `status_changed_at/by` follow. `row_version` is bumped explicitly.
 *
 * Any future workspace submit or audit replay surgery should reuse
 * this same set — the rules don't change by who's writing.
 */
export const HEADER_IMMUTABLE_COLS: ReadonlySet<string> = new Set([
  "id",
  "tenant_id",
  "created_at",
  "created_by",
  "status",
  "status_changed_at",
  "status_changed_by",
  "row_version",
]);

/**
 * Columns we never propagate when re-inserting child rows during a restore.
 * Identity is regenerated (Phase 9b D1 — fresh UUIDs to avoid ledger.*
 * FK chaos). Tenant + parent FKs are set explicitly by the engine. Audit
 * pair is regenerated to reflect the restore actor.
 */
export const CHILD_REGEN_COLS: ReadonlySet<string> = new Set([
  "id",
  "tenant_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "row_version",
]);
