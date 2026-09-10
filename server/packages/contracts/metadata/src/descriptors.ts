import type { EntityAuthorizationRuntimeV1 } from "./entity-authorization-runtime.js";
import type { PlaneKey } from "@athyper/server-foundation/context";

export type EntityFieldType = "string" | "text" | "integer" | "decimal" | "money" | "boolean" | "date" | "datetime" | "uuid" | "enum" | "reference" | "json";
export type EntityListFilterOperator = "eq" | "ne" | "in" | "contains" | "starts_with" | "gt" | "gte" | "lt" | "lte" | "between" | "is_null" | "is_not_null" | "relative";
export type EntityListViewMode = "table" | "compact" | "board" | "dashboard" | "spreadsheet";
export type EntityListDensity = "compact" | "comfortable" | "spacious";

const PRESENCE_FILTER_OPERATORS = ["is_null", "is_not_null"] as const;

/** Canonical field-type operator capability used by metadata validation and record-query admission. */
export function entityFieldFilterOperators(type: EntityFieldType): readonly EntityListFilterOperator[] {
  if (["integer", "decimal", "money"].includes(type)) return Object.freeze(["eq", "ne", "in", "gt", "gte", "lt", "lte", "between", ...PRESENCE_FILTER_OPERATORS]);
  if (["date", "datetime"].includes(type)) return Object.freeze(["eq", "ne", "in", "gt", "gte", "lt", "lte", "between", "relative", ...PRESENCE_FILTER_OPERATORS]);
  if (["string", "text"].includes(type)) return Object.freeze(["contains", "eq", "ne", "starts_with", "in", ...PRESENCE_FILTER_OPERATORS]);
  if (type === "json") return PRESENCE_FILTER_OPERATORS;
  return Object.freeze(["eq", "ne", "in", ...PRESENCE_FILTER_OPERATORS]);
}

export interface EntityFieldDescriptor {
  readonly key: string;
  readonly storagePath: string;
  readonly type: EntityFieldType;
  readonly required: boolean;
  readonly writableOn: readonly ("create" | "patch")[];
  readonly filterable?: boolean;
  readonly sortable?: boolean;
  readonly searchable?: boolean;
  /** Authorization evaluated before query projection; denied fields never reach the repository SELECT list. */
  readonly readPermissionCode?: string;
  /** Authorization evaluated during mutation admission for every submitted field. */
  readonly writePermissionCode?: string;
  readonly classification?: "public" | "internal" | "confidential" | "pii" | "sensitive_pii";
  readonly retentionPolicyCode?: string;
  readonly validation?: Readonly<Record<string, unknown>>;
  readonly list?: {
    readonly label?: string;
    /** Human-readable section used to organize large field catalogues. */
    readonly columnGroup?: string;
    readonly semanticRole?: string;
    readonly rendererKey?: string;
    readonly defaultVisible?: boolean;
    readonly defaultOrder?: number;
    readonly defaultWidth?: number;
    readonly groupable?: boolean;
    /** Optional metadata restriction intersected with the runtime's type-safe operator policy. */
    readonly filterOperators?: readonly EntityListFilterOperator[];
    readonly aggregations?: readonly ("count" | "sum" | "average" | "minimum" | "maximum")[];
  };
}

export interface EntityListDefaultStateDescriptor {
  readonly query?: string;
  readonly filters?: readonly Readonly<{ readonly field: string; readonly operator: EntityListFilterOperator; readonly value?: unknown }>[];
  readonly sort?: readonly Readonly<{ readonly field: string; readonly direction: "asc" | "desc"; readonly nulls?: "first" | "last" }>[];
  readonly group?: string;
  readonly columns?: readonly string[];
  readonly density?: EntityListDensity;
  readonly mode?: EntityListViewMode;
}

export interface EntityListSearchPolicyDescriptor {
  readonly profileKey?: string;
  readonly minimumQueryLength?: number;
}

export interface EntityListFilterPresentationDescriptor {
  /** Ordered, surface-specific fields shown without opening the advanced builder. */
  readonly quickFields?: readonly Readonly<{ readonly field: string; readonly defaultOperator?: EntityListFilterOperator }>[];
  readonly allowUserPinning?: boolean;
}

export interface EntityListLimitsDescriptor {
  readonly defaultPageSize?: number;
  readonly allowedPageSizes?: readonly number[];
  readonly maxSortLevels?: number;
  readonly countMode?: "none" | "cached" | "approximate" | "exact";
}

export interface EntityListPresentationDescriptor {
  readonly experience?: import("@athyper/contract-platform-entity-list").PublishedListExperienceV1;
  readonly schemaVersion?: 1;
  readonly title?: string;
  readonly description?: string;
  readonly identityField?: string;
  /** Canonical defaults. Legacy default* properties remain readable during migration. */
  readonly defaultState?: EntityListDefaultStateDescriptor;
  readonly search?: EntityListSearchPolicyDescriptor;
  readonly filterPresentation?: EntityListFilterPresentationDescriptor;
  readonly limits?: EntityListLimitsDescriptor;
  /** @deprecated Use defaultState.columns. */
  readonly defaultColumns?: readonly string[];
  /** @deprecated Use defaultState.sort. */
  readonly defaultSort?: readonly Readonly<{ field: string; direction: "asc" | "desc"; nulls?: "first" | "last" }>[];
  /** @deprecated Use defaultState.density. */
  readonly defaultDensity?: EntityListDensity;
  readonly supportedModes?: readonly EntityListViewMode[];
  /** @deprecated Use limits.defaultPageSize. */
  readonly defaultPageSize?: number;
  /** @deprecated Use limits.allowedPageSizes. */
  readonly allowedPageSizes?: readonly number[];
  /** @deprecated Use limits.countMode. */
  readonly countMode?: "none" | "cached" | "approximate" | "exact";
  readonly dataOperations?: {
    readonly exportFormats?: readonly ("xlsx" | "csv" | "json" | "ndjson")[];
    readonly importFormats?: readonly ("xlsx" | "csv" | "json")[];
    readonly exportMaxRecords?: number;
    readonly importMaxRows?: number;
    readonly importMaxFileBytes?: number;
    readonly asynchronousThreshold?: number;
    readonly allowEntireEntityExport?: boolean;
    readonly allowTemplateDownload?: boolean;
    readonly draftOnly?: boolean;
    /** Plane-owned adapter capability published only after its conformance suite passes. */
    readonly importAdapterKey?: string;
    readonly importOperations?: readonly ("create" | "update" | "upsert" | "delete" | "replace")[];
    readonly importOperationPermissions?: Readonly<Partial<Record<"create" | "update" | "upsert" | "delete" | "replace", readonly string[]>>>;
    /** Adapter-owned input fields that are not list/storage columns (for example Studio draft graph coordinates). */
    readonly importFields?: readonly Readonly<{ readonly key: string; readonly type: EntityFieldType; readonly required: boolean; readonly label?: string }>[];
  };
}

export interface EntityAggregateCollectionDescriptor {
  readonly code: string;
  readonly entityCode: string;
  readonly parentField: string;
  readonly allowedOperations: readonly ("create" | "update" | "delete" | "replace")[];
}

export interface EntityRegisteredActionDescriptor {
  readonly code: string;
  readonly handlerKey: string;
  readonly permissionCode: string;
  readonly asyncThreshold?: number;
}

export interface EntityOperationDescriptor {
  readonly code: string;
  readonly permissionCode: string;
  /** System-action backed catalog projections have no entity-operation binding.
   * They must opt in explicitly; governed entity operations remain bound by default. */
  readonly authorizationMode?: "bound_operation" | "permission_only";
}

export interface EntityLifecycleTransitionDescriptor {
  readonly code: string;
  readonly from: readonly string[];
  readonly to: string;
  readonly permissionCode: string;
}

export type EntityPolicyBindingStage = "authorization" | "precondition" | "validation" | "postcondition" | "masking";
export type EntityPolicyEnforcement = "enforce" | "warn" | "observe";

/** Compiled composition coordinate; the policy body remains owned by local control tables. */
export interface EntityPolicyBindingDescriptor {
  readonly key: string;
  readonly policyDefinitionId: string;
  readonly policyVersionNo: number;
  readonly stage: EntityPolicyBindingStage;
  readonly enforcement: EntityPolicyEnforcement;
  readonly priority: number;
  readonly operationCode?: string;
  readonly fieldKey?: string;
  readonly inputMapping: Readonly<Record<string, unknown>>;
}

export interface EntityRuntimeDescriptor {
  readonly ai?: import("./entity-ai.js").EntityAiDescriptorV1;
  readonly recordPresentation?: import("@athyper/contract-platform-entity-runtime").EntityRecordPresentationV1;
  readonly directoryScope?: import("./directory-scope.js").EntityDirectoryScopeV1;
  readonly authorizationRuntime?: EntityAuthorizationRuntimeV1;
  readonly authorization?: import("./entity-authorization.js").EntityAuthorizationProfileV1;
  readonly collectionRelationship?: import("./collection-relationship.js").CollectionRelationshipV1;
  readonly schema: "athyper.entity-runtime-descriptor/1.0";
  readonly entityCode: string;
  readonly detailRouteTemplate?: string;
  readonly planeKey: PlaneKey;
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly contractHash: string;
  readonly compiledHash: string;
  readonly storage: {
    readonly schema: string;
    readonly object: string;
    readonly idField: string;
    readonly tenantField?: string;
    readonly versionField?: string;
    readonly softDeleteField?: string;
    readonly statusField?: string;
  };
  readonly fields: readonly EntityFieldDescriptor[];
  readonly operations: Readonly<Record<string, EntityOperationDescriptor>>;
  readonly lifecycle?: { readonly transitions: readonly EntityLifecycleTransitionDescriptor[] };
  readonly aggregate?: { readonly collections: readonly EntityAggregateCollectionDescriptor[] };
  readonly actions?: readonly EntityRegisteredActionDescriptor[];
  readonly policyBindings?: readonly EntityPolicyBindingDescriptor[];
  readonly listPresentation?: EntityListPresentationDescriptor;
}

export interface EntityDescriptorCoordinate {
  readonly tenantId: string;
  readonly principalId: string;
  readonly planeKey: PlaneKey;
  readonly entityCode: string;
}
