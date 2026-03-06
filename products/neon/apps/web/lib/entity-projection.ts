/**
 * Canonical Entity Projection Types
 *
 * Shared types for the standardized entity rendering contract.
 * Used by both server-side APIs and client-side components to ensure
 * consistent FK reference resolution, read-only behavior, and
 * response envelope shapes across all entity views.
 */

// ============================================================================
// FK Reference Types
// ============================================================================

/** Resolved FK reference entry */
export interface ResolvedRef {
    id: string;
    label: string;
}

/**
 * Canonical refs join cache: "schema.table" → { uuid → ResolvedRef }
 *
 * Example:
 *   { "fin.operating_unit": { "uuid1": { id: "uuid1", label: "Demo Canada Inc" } } }
 */
export type RefsCache = Record<string, Record<string, ResolvedRef>>;

// ============================================================================
// List API Response Envelope
// ============================================================================

export interface EntityListResponse {
    data: Record<string, unknown>[];
    meta: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
        /** True when FK resolution was capped or timed out — some columns may show raw UUIDs */
        refsPartial?: boolean;
    };
    /** Canonical refs join cache — authoritative source for FK labels */
    refs?: RefsCache;
}

// ============================================================================
// Read-Only Behavior
// ============================================================================

/**
 * Reason codes for read-only field enforcement.
 *
 * Precedence order (highest → lowest):
 *   1. COMPUTED       — is_computed=true → always read-only, no override
 *   2. SYSTEM_MANAGED — is_read_only=true or system_managed editability
 *   3. SYSTEM_ORIGIN  — origin="system" → hidden from business forms
 *   4. WRITE_ONCE     — write_once=true → editable only on create
 *   5. EXPLICIT_META  — editability context rule = read_only
 *   6. LIFECYCLE_MANAGED / DERIVED_HIERARCHY / PRIMARY_KEY — convention-based
 *   7. DEPRECATED     — deprecated fields are read-only as a safety measure
 *   8. UI_ADVISORY    — ui_hint.readOnly / ui_hint.lockOnEdit (rendering only, never overrides domain truth)
 *
 * Higher-precedence reasons cannot be relaxed by lower layers.
 * UI advisory flags (ui_hint.readOnly, ui_hint.lockOnEdit) NEVER override domain/security truth.
 */
export type ReadOnlyReason =
    | "DERIVED_HIERARCHY"
    | "LIFECYCLE_MANAGED"
    | "SYSTEM_MANAGED"
    | "EXPLICIT_META"
    | "PRIMARY_KEY"
    | "LOCK_ON_EDIT"
    | "COMPUTED"
    | "WRITE_ONCE"
    | "DEPRECATED"
    | "SYSTEM_ORIGIN"
    | "UI_ADVISORY";

/** Read-only decision with reason code for tooltip display */
export interface FieldEditBehavior {
    readOnly: boolean;
    reason?: ReadOnlyReason;
}

// ============================================================================
// Read-Only Reason Labels (for UI display)
// ============================================================================

export const READ_ONLY_REASON_LABELS: Record<ReadOnlyReason, string> = {
    DERIVED_HIERARCHY: "Derived from parent hierarchy",
    LIFECYCLE_MANAGED: "Managed by lifecycle engine",
    SYSTEM_MANAGED: "System-managed field",
    EXPLICIT_META: "Read-only per entity configuration",
    PRIMARY_KEY: "Primary key field",
    LOCK_ON_EDIT: "Locked after creation",
    COMPUTED: "Computed/derived field",
    WRITE_ONCE: "Can only be set on creation",
    DEPRECATED: "Deprecated field",
    SYSTEM_ORIGIN: "System-managed field",
    UI_ADVISORY: "Read-only (display preference)",
};

// ============================================================================
// Display Policy
// ============================================================================

/** How to display FK references for a given target table */
export interface DisplayPolicy {
    /** Template string: "{{code}} - {{name}}" */
    template?: string;
    /** Ordered field list: ["code", "name"] */
    fields?: string[];
    /** Actual columns that exist on the target table (verified against schema) */
    resolvedColumns: string[];
    /** Primary key column name (detected from DB schema) */
    primaryKey: string;
    /** True if the table has a composite PK (FK resolution is skipped) */
    isCompositePk?: boolean;
}

// ============================================================================
// FK Resolution Limits
// ============================================================================

export const FK_RESOLUTION_LIMITS = {
    /** Max unique UUIDs per FK column */
    perColumnCap: 200,
    /** Max total UUIDs across all FK columns in a single request */
    perRequestCap: 600,
    /** Timeout budget for FK resolution in ms */
    timeoutMs: 250,
} as const;
