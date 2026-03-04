/**
 * Overlay System Types
 *
 * Types for the Schema Composition (Overlay) system.
 * Aligned with types defined in @athyper/core/meta.
 */

// ============================================================================
// Core Types (aligned with @athyper/core/meta)
// ============================================================================

/**
 * Overlay change kind - defines the type of modification
 */
export type OverlayChangeKind =
  | "addField"          // Add a new field to entity
  | "modifyField"       // Modify existing field properties
  | "removeField"       // Remove a field from entity
  | "tweakPolicy"       // Modify policy configuration
  | "addIndex"          // Add database index (future)
  | "removeIndex"       // Remove database index (future)
  | "tweakRelation";    // Modify relationship (future)

/**
 * Overlay conflict resolution mode
 */
export type OverlayConflictMode =
  | "fail"      // Throw error if target already exists/conflicts
  | "overwrite" // Replace existing target completely
  | "merge";    // Deep merge with existing target (for objects)

// ============================================================================
// Database Record Types
// ============================================================================

/**
 * Overlay record from database
 * Represents a schema overlay that extends a base entity
 */
export interface OverlayRecord {
  /** Unique overlay ID */
  id: string;

  /** Unique key within tenant */
  overlayKey: string;

  /** Base entity ID this overlay extends */
  baseEntityId: string;

  /** Optional: specific version to target */
  baseVersionId?: string;

  /** Merge priority (lower = applied first) */
  priority: number;

  /** Conflict resolution mode */
  conflictMode: OverlayConflictMode;

  /** Description of the overlay */
  description?: string;

  /** Whether overlay is active */
  isActive: boolean;

  /** Tenant ID */
  tenantId: string;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;

  /** Created by user ID */
  createdBy?: string;

  /** Updated by user ID */
  updatedBy?: string;

  /** Version for optimistic locking */
  version: number;
}

/**
 * Overlay change record from database
 * Represents a single modification within an overlay
 */
export interface OverlayChangeRecord {
  /** Unique change ID */
  id: string;

  /** Parent overlay ID */
  overlayId: string;

  /** Order of application within overlay (0-based) */
  changeOrder: number;

  /** Type of change */
  kind: OverlayChangeKind;

  /** JSON path to target (e.g., "fields.customField") */
  path: string;

  /** Value to apply (depends on kind) */
  value?: unknown;

  /** Created timestamp */
  createdAt: Date;
}

// ============================================================================
// Input/Output Types
// ============================================================================

/**
 * Input for creating a new overlay
 */
export interface CreateOverlayInput {
  /** Unique key within tenant */
  overlayKey: string;

  /** Base entity ID to extend */
  baseEntityId: string;

  /** Optional: specific version to target */
  baseVersionId?: string;

  /** Merge priority (default: 100) */
  priority?: number;

  /** Conflict resolution mode (default: 'fail') */
  conflictMode?: OverlayConflictMode;

  /** Description */
  description?: string;

  /** Initial changes to add */
  changes?: Array<CreateOverlayChangeInput>;
}

/**
 * Input for creating an overlay change
 */
export interface CreateOverlayChangeInput {
  /** Type of change */
  kind: OverlayChangeKind;

  /** JSON path to target */
  path: string;

  /** Value to apply */
  value?: unknown;
}

/**
 * Input for updating an overlay
 */
export interface UpdateOverlayInput {
  /** New priority */
  priority?: number;

  /** New conflict mode */
  conflictMode?: OverlayConflictMode;

  /** New description */
  description?: string;

  /** New active status */
  isActive?: boolean;
}

/**
 * Overlay with its changes loaded
 */
export interface OverlayWithChanges extends OverlayRecord {
  /** Changes in application order */
  changes: OverlayChangeRecord[];
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of applying overlays to a schema
 */
export interface OverlayApplyResult {
  /** Whether all overlays applied successfully */
  success: boolean;

  /** Keys of overlays that were applied */
  appliedOverlays: string[];

  /** Conflicts encountered during application */
  conflicts: OverlayConflict[];
}

/**
 * Conflict encountered when applying an overlay
 */
export interface OverlayConflict {
  /** Overlay key that caused conflict */
  overlayKey: string;

  /** Path that conflicted */
  path: string;

  /** Conflict message */
  message: string;

  /** Change kind that failed */
  changeKind: OverlayChangeKind;
}

/**
 * Validation result for an overlay
 */
export interface OverlayValidationResult {
  /** Whether overlay is valid */
  valid: boolean;

  /** Validation errors */
  errors: OverlayValidationErrorDetail[];

  /** Validation warnings */
  warnings: OverlayValidationWarning[];
}

/**
 * Overlay validation error detail
 */
export interface OverlayValidationErrorDetail {
  /** Change index (if applicable) */
  changeIndex?: number;

  /** Path that failed validation */
  path: string;

  /** Error message */
  message: string;

  /** Error code for programmatic handling */
  code: string;
}

/**
 * Overlay validation warning
 */
export interface OverlayValidationWarning {
  /** Change index (if applicable) */
  changeIndex?: number;

  /** Path with warning */
  path: string;

  /** Warning message */
  message: string;

  /** Warning code for programmatic handling */
  code: string;
}

/**
 * Preview result for schema composition
 */
export interface CompositionPreviewResult {
  /** Composed schema (with overlays applied) */
  schema: Record<string, unknown>;

  /** Overlays that were applied (in order) */
  appliedOverlays: string[];

  /** Any conflicts that would occur */
  conflicts: OverlayConflict[];

  /** Fields added by overlays */
  addedFields: string[];

  /** Fields modified by overlays */
  modifiedFields: string[];

  /** Fields removed by overlays */
  removedFields: string[];
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Options for listing overlays
 */
export interface ListOverlaysOptions {
  /** Filter by base entity ID */
  baseEntityId?: string;

  /** Filter by active status */
  isActive?: boolean;

  /** Order by field */
  orderBy?: "priority" | "createdAt" | "updatedAt";

  /** Order direction */
  orderDirection?: "asc" | "desc";

  /** Pagination limit */
  limit?: number;

  /** Pagination offset */
  offset?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when overlay conflicts occur
 */
export class OverlayConflictError extends Error {
  constructor(
    public readonly conflicts: OverlayConflict[],
    message?: string
  ) {
    super(
      message ||
        `Overlay conflicts: ${conflicts.map((c) => `${c.overlayKey}:${c.path} - ${c.message}`).join("; ")}`
    );
    this.name = "OverlayConflictError";
  }
}

/**
 * Error thrown when overlay validation fails
 */
export class OverlayValidationError extends Error {
  constructor(
    public readonly errors: Array<{ path: string; message: string; code: string }>,
    message?: string
  ) {
    super(
      message ||
        `Overlay validation failed: ${errors.map((e) => `${e.path} - ${e.message}`).join("; ")}`
    );
    this.name = "OverlayValidationError";
  }
}

/**
 * Error thrown when overlay is not found
 */
export class OverlayNotFoundError extends Error {
  constructor(
    public readonly identifier: string,
    public readonly identifierType: "id" | "key" = "id"
  ) {
    super(`Overlay not found: ${identifierType}=${identifier}`);
    this.name = "OverlayNotFoundError";
  }
}
