// lib/schema-manager/types.ts
//
// Shared types for the Schema Manager UI.
// These mirror the meta schema DB layer (050_meta_tables.sql).

export interface EntitySummary {
  id: string;
  name: string;
  kind: "ref" | "ent" | "doc" | "fin" | "cfg" | "int";
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
  kind:
    | "addField"
    | "removeField"
    | "modifyField"
    | "tweakPolicy"
    | "overrideValidation"
    | "overrideUi";
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
  error?:
    | ConflictError
    | {
        code: string;
        message: string;
        fieldErrors?: Array<{ path: string; message: string }>;
      };
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
