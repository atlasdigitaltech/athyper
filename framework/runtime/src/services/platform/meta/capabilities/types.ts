/**
 * Entity Capabilities Types
 *
 * Two-layer mental model:
 *   Capabilities = enabled actions on the entity type (what it supports)
 *   Actions      = currently allowed now (filtered by auth + lifecycle state)
 *
 * This file defines the Capabilities layer.
 */

// ============================================================================
// Surface & Placement Enums
// ============================================================================

/** Where the operation appears in the UI */
export type OperationSurface =
  | "LIST"          // list page only
  | "DETAIL"        // detail page only
  | "BOTH"          // both list and detail
  | "PALETTE_ONLY"  // command palette only (no visible button)
  | "HIDDEN";       // disabled from all UI

/** How the operation is rendered on its surface */
export type OperationPlacement =
  | "PRIMARY"   // primary action button (prominent CTA)
  | "TOOLBAR"   // toolbar button row
  | "OVERFLOW"  // overflow/more menu
  | "CONTEXT"   // context/right-click menu
  | "COMMAND";  // command palette only

/** How the operation is dispatched when triggered */
export type HandlerType =
  | "NAVIGATE"  // client-side router.push(handlerTarget)
  | "API"       // POST to entity action endpoint
  | "MODAL"     // open modal dialog by key
  | "INLINE";   // inline component render

// ============================================================================
// Entity Capabilities (full resolved output)
// ============================================================================

/**
 * Full capabilities manifest for a single entity type.
 * Returned by EntityCapabilitiesService.getEntityCapabilities().
 */
export interface EntityCapabilities {
  /** Logical entity key (e.g., "Customer", "WorkOrder") */
  entityKey: string;

  /** Display name (derived from entity key) */
  entityName: string;

  /** Short mnemonic code for TCODE aliases (e.g., "PO", "INV") */
  entityShort: string | null;

  /** Entity kind (ref, ent, doc, fin, cfg, int) */
  entityKind: string;

  /** Governance level (full, light, audit_only) */
  governanceLevel: string;

  /** All enabled operations for this entity */
  operations: EntityOperationDescriptor[];

  /** Standard route templates for this entity */
  routes: EntityRoutes;

  /** Permission keys keyed by operation code */
  permissions: Record<string, string>;

  /** Available tabs based on governance + feature bindings */
  tabs: TabHint[];
}

// ============================================================================
// Entity Operation Descriptor
// ============================================================================

/**
 * A single operation enabled for an entity, with full UI and dispatch metadata.
 */
export interface EntityOperationDescriptor {
  /** Operation code from core.operation (e.g., "submit") */
  code: string;

  /** Category code (e.g., "entity", "workflow", "utilities") */
  categoryCode: string;

  /** Display label (label_override or operation.name) */
  label: string;

  /** Icon identifier (icon_override or category default) */
  icon: string | null;

  // ------ Codes & Aliases ------

  /** Canonical code: "{entityKey}.{opCode}" */
  canonicalCode: string;

  /** Memorable aliases: ["NEW CUST", "CUST NEW"] */
  aliases: string[];

  /** Optional SAP-style tcode alias (e.g., "PO01") */
  tcode: string | null;

  // ------ Two-axis UI model ------

  /** Where the operation appears */
  surface: OperationSurface;

  /** How the operation is rendered */
  placement: OperationPlacement;

  // ------ Execution ------

  /** How the operation is dispatched */
  handlerType: HandlerType;

  /** Route template, endpoint key, modal key, or component key */
  handlerTarget: string | null;

  // ------ Behavioral ------

  /** Whether this operation needs a selected record */
  requiresRecord: boolean;

  /** Permission key for authorization checks: "{entityKey}:{opCode}" */
  permissionKey: string;

  /** Resolved route for NAVIGATE handlers, null otherwise */
  route: string | null;

  /** Whether this is a tenant override (vs. system default) */
  isTenantOverride: boolean;
}

// ============================================================================
// Entity Routes
// ============================================================================

/**
 * Standard route templates for an entity type.
 * Uses kebab-case slug derived from entity name.
 */
export interface EntityRoutes {
  /** List page route (e.g., "/app/customer/view/list") */
  list: string;

  /** Create page route (e.g., "/app/customer/new") */
  create: string;

  /** Detail page route template (e.g., "/app/customer/{id}") */
  detail: string;
}

// ============================================================================
// Tab Hints
// ============================================================================

/**
 * Tab availability hints derived from entity governance + bindings.
 */
export interface TabHint {
  /** Tab code (matches plugin registry key) */
  code: string;

  /** Display label */
  label: string;

  /** Whether this tab is enabled for this entity */
  isEnabled: boolean;
}

// ============================================================================
// Verb Map (for alias generation)
// ============================================================================

/**
 * Maps operation codes to human-friendly verb prefixes.
 * Used to generate command palette aliases like "NEW PO", "APPROVE INV".
 */
export const VERB_MAP: Record<string, string> = {
  create:       "NEW",
  read:         "VIEW",
  update:       "EDIT",
  delete:       "DELETE",
  delete_draft: "DELETE DRAFT",
  submit:       "SUBMIT",
  amend:        "AMEND",
  cancel:       "CANCEL",
  close:        "CLOSE",
  reopen:       "REOPEN",
  withdraw:     "WITHDRAW",
  escalate:     "ESCALATE",
  approve:      "APPROVE",
  deny:         "REJECT",
  post:         "POST",
  reverse:      "REVERSE",
  reconcile:    "RECONCILE",
  copy:         "COPY",
  merge:        "MERGE",
  report:       "REPORT",
  print:        "PRINT",
  import:       "IMPORT",
  export:       "EXPORT",
  bulk_import:  "BULK IMPORT",
  bulk_export:  "BULK EXPORT",
  bulk_update:  "BULK UPDATE",
  bulk_delete:  "BULK DELETE",
  delegate:     "DELEGATE",
  share_readonly:  "SHARE",
  share_editable:  "SHARE EDIT",
  comment_add:     "COMMENT",
  attachment_add:  "ATTACH",
  follow:          "FOLLOW",
  tag:             "TAG",
};
