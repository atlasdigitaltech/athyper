// lib/schema-manager/types.ts
//
// Shared types for the Schema Manager UI.
// These mirror the meta schema DB layer (050_meta_tables.sql).

export type EntityClass = "REFERENCE" | "MASTER" | "CONTROL" | "DOCUMENT" | "LEDGER" | "LOG";

export interface EntitySummary {
    id: string;
    name: string;
    entityClass: EntityClass;
    moduleId: string | null;
    tableSchema: string;
    tableName: string;
    isActive: boolean;
    governanceLevel?: string;
    engineTag?: string | null;
    currentVersion: VersionSummary | null;
    fieldCount: number;
    relationCount: number;
    updatedAt: string | null;

    // Identity & codes
    entityShort?: string | null;
    entityCode?: string | null;
    slug?: string | null;
    identityConfig?: Record<string, unknown> | null;

    // Classification
    status?: "draft" | "active" | "deprecated" | "suspended";
    mappingMode?: "exclusive" | "shared";
    ownershipModel?: string | null;
    mutability?: string | null;
    backingType?: string | null;

    // Configuration
    namingPolicy?: Record<string, unknown> | null;
    featureFlags?: Record<string, unknown> | null;
    displayConfig?: Record<string, unknown> | null;
    provenance?: string | null;

    // Polymorphism
    discriminatorColumn?: string | null;
    discriminatorValue?: string | null;

    // Display metadata
    labelSingular?: string | null;
    labelPlural?: string | null;
    description?: string | null;
    iconKey?: string | null;
    colorToken?: string | null;

    // Data policy
    dataPolicy?: Record<string, unknown> | null;

    // Status tracking
    statusChangedAt?: string | null;
    statusChangedBy?: string | null;
    statusReason?: string | null;

    // Audit timestamps
    createdAt?: string;
    createdBy?: string | null;
    updatedBy?: string | null;

    // Operational
    publishedVersionId?: string | null;
    lastCompiledAt?: string | null;
    lastCompiledHash?: string | null;
    lastSchemaChangeAt?: string | null;
}

export interface VersionSummary {
    id: string;
    versionNo: number;
    status: "draft" | "published" | "archived";
    label: string | null;
    publishedAt: string | null;
    publishedBy: string | null;
    createdAt: string;
}

export interface FieldDefinition {
    id: string;
    name: string;
    columnName: string;
    dataType: string;
    uiType: string | null;
    isRequired: boolean;
    isUnique: boolean;
    isSearchable: boolean;
    isFilterable: boolean;
    defaultValue: unknown;
    validation: Record<string, unknown> | null;
    lookupConfig: Record<string, unknown> | null;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string | null;

    // ── Phase 1: Structured configs & semantic format ──

    /** Semantic format hint (email, phone, url, money, percent, etc.) */
    format: string | null;
    /** Measurement unit */
    unit: string | null;
    /** Field multiplicity: "one" (scalar) or "many" (array) */
    cardinality: string;
    /** Field origin: "system", "standard", or "business" */
    origin: string;
    /** First-class display label */
    label: string | null;
    /** First-class description */
    description: string | null;
    /** Canonical constraints */
    constraints: Record<string, unknown> | null;
    /** Structured enum config */
    enumConfig: Record<string, unknown> | null;
    /** Structured reference config */
    referenceConfig: Record<string, unknown> | null;
    /** JSON field config */
    jsonConfig: Record<string, unknown> | null;
    /** Money config */
    moneyConfig: Record<string, unknown> | null;
    /** Datetime config */
    datetimeConfig: Record<string, unknown> | null;
    /** UI override layer */
    uiHint: Record<string, unknown> | null;
    /** Read-only flag */
    isReadOnly: boolean;
    /** Deprecated flag */
    isDeprecated: boolean;
    /** Computed/derived flag */
    isComputed: boolean;
    /** Write-once flag (locked after creation) */
    writeOnce: boolean;
    /** Context-aware visibility rules with optional conditional overrides */
    visibility: VisibilityConfig | null;
    /** Context-aware editability rules with optional conditional overrides */
    editability: EditabilityConfig | null;
}

// ─── Condition Tree (shared with validation/policy) ─────────

export interface ConditionLeaf {
    field: string;
    operator: string;
    value: unknown;
}

export interface ConditionGroup {
    operator?: "and" | "or";
    conditions: Array<ConditionLeaf | ConditionGroup>;
}

// ─── Visibility & Editability Conditional Rules ─────────────

export type VisibilityState = "visible" | "hidden" | "internal";
export type EditabilityState = "editable" | "read_only" | "system_managed" | "computed";
export type VisibilityContext = "create" | "view" | "edit";
export type EditabilityContext = "create" | "edit";

export interface VisibilityRule {
    id: string;
    name: string;
    when: ConditionGroup;
    then: VisibilityState;
    contexts: VisibilityContext[];
    priority: number;
}

export interface EditabilityRule {
    id: string;
    name: string;
    when: ConditionGroup;
    then: EditabilityState;
    contexts: EditabilityContext[];
    priority: number;
}

export interface VisibilityConfig {
    /** Static per-context defaults */
    defaults: Partial<Record<VisibilityContext, VisibilityState>>;
    /** Conditional override rules evaluated at runtime */
    rules?: VisibilityRule[];
}

export interface EditabilityConfig {
    /** Static per-context defaults */
    defaults: Partial<Record<EditabilityContext, EditabilityState>>;
    /** Conditional override rules evaluated at runtime */
    rules?: EditabilityRule[];
}

export interface RelationDefinition {
    id: string;
    name: string;
    relationKind: "belongs_to" | "has_many" | "m2m";
    targetEntity: string;
    fkField: string | null;
    targetKey: string | null;
    onDelete: "restrict" | "cascade" | "set_null";
    uiBehavior: Record<string, unknown> | null;
    createdAt: string;
}

export interface IndexDefinition {
    id: string;
    name: string;
    isUnique: boolean;
    method: "btree" | "gin" | "gist" | "hash";
    columns: unknown;
    whereClause: string | null;
    createdAt: string;
}

export interface EntityPolicy {
    id: string;
    accessMode: string;
    ouScopeMode: string;
    auditMode: string;
    retentionPolicy: Record<string, unknown> | null;
    defaultFilters: Record<string, unknown> | null;
    cacheFlags: Record<string, unknown> | null;
    createdAt: string;
}

export interface FieldSecurityPolicy {
    id: string;
    fieldPath: string;
    policyType: "read" | "write" | "both";
    roleList: string | null;
    abacCondition: Record<string, unknown> | null;
    maskStrategy: "null" | "redact" | "hash" | "partial" | "remove";
    maskConfig: Record<string, unknown> | null;
    scope: string;
    priority: number;
    isActive: boolean;
}

export interface CompiledSnapshot {
    id: string;
    entityVersionId: string;
    compiledJson: Record<string, unknown>;
    compiledHash: string;
    generatedAt: string;
}

export interface OverlayDefinition {
    id: string;
    overlayKey: string;
    baseEntityId: string;
    baseVersionId: string;
    priority: number;
    conflictMode: "fail" | "overwrite" | "merge";
    isActive: boolean;
    changes: OverlayChange[];
}

export interface OverlayChange {
    id: string;
    changeOrder: number;
    kind: "addField" | "removeField" | "modifyField" | "tweakPolicy" | "overrideValidation" | "overrideUi";
    path: string;
    value: unknown;
}

// ─── Concurrency Control ──────────────────────────────────────

export interface MutationOptions {
    ifMatch?: string;
}

export interface ConflictError {
    code: "CONFLICT";
    message: string;
    serverVersion?: string;
    serverData?: unknown;
}

export interface MutationResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: ConflictError | { code: string; message: string; fieldErrors?: Array<{ path: string; message: string }> };
}

// ─── Audit ────────────────────────────────────────────────────

export interface MeshAuditEntry {
    ts: string;
    event: string;
    tenantId: string;
    sidHash?: string;
    entityName: string;
    entityId?: string;
    versionId?: string;
    correlationId?: string;
    before?: unknown;
    after?: unknown;
    meta?: Record<string, unknown>;
}
