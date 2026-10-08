import type { EntityAuthorizationRuntime } from "./entity-authorization-runtime.js";
import type { PlaneKey } from "@athyper/server-foundation/context";

export const ENTITY_FIELD_TYPES = [
  "string",
  "text",
  "integer",
  "decimal",
  "money",
  "boolean",
  "date",
  "datetime",
  "uuid",
  "enum",
  "reference",
  "json",
] as const;
export type EntityFieldType = (typeof ENTITY_FIELD_TYPES)[number];
/** Stored fields and handler-backed facts are intentionally distinct. A computed
 * field may be queryable only after a registered server projection declares it. */
export type EntityFieldValueOrigin = "stored" | "computed" | "aggregate";
export type EntityListFilterOperator =
  | "eq"
  | "ne"
  | "in"
  | "contains"
  | "starts_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "is_null"
  | "is_not_null"
  | "relative";
export type EntityListViewMode =
  import("@athyper/contract-platform-entity-list").ListViewMode;
export type EntityListDensity = "compact" | "comfortable" | "spacious";

const PRESENCE_FILTER_OPERATORS = ["is_null", "is_not_null"] as const;

/** Canonical field-type operator capability used by metadata validation and record-query admission. */
export function entityFieldFilterOperators(
  type: EntityFieldType,
): readonly EntityListFilterOperator[] {
  if (["integer", "decimal", "money"].includes(type))
    return Object.freeze([
      "eq",
      "ne",
      "in",
      "gt",
      "gte",
      "lt",
      "lte",
      "between",
      ...PRESENCE_FILTER_OPERATORS,
    ]);
  if (["date", "datetime"].includes(type))
    return Object.freeze([
      "eq",
      "ne",
      "in",
      "gt",
      "gte",
      "lt",
      "lte",
      "between",
      "relative",
      ...PRESENCE_FILTER_OPERATORS,
    ]);
  if (["string", "text"].includes(type))
    return Object.freeze([
      "contains",
      "eq",
      "ne",
      "starts_with",
      "in",
      ...PRESENCE_FILTER_OPERATORS,
    ]);
  if (type === "json") return PRESENCE_FILTER_OPERATORS;
  return Object.freeze(["eq", "ne", "in", ...PRESENCE_FILTER_OPERATORS]);
}

export interface EntityFieldDescriptor {
  readonly structuredProjection?: import("./structured-projection.js").StructuredProjection;
  /** Published, single UUID reference; resolved through the target Entity owner, never an inferred join. */
  readonly referenceTargetEntity?: string;
  readonly keyReference?: import("./key-reference.js").EntityKeyReference;
  readonly key: string;
  readonly storagePath: string;
  readonly type: EntityFieldType;
  readonly valueOrigin?: EntityFieldValueOrigin;
  /** Required for computed/aggregate values; it is a registered server projection,
   * never a browser-supplied SQL expression or storage path. */
  readonly computation?: {
    readonly handlerKey: string;
    readonly querySupport: "none" | "filter" | "sort" | "filter_and_sort";
  };
  readonly required: boolean;
  readonly writableOn: readonly ("create" | "patch")[];
  readonly filterable?: boolean;
  readonly sortable?: boolean;
  readonly searchable?: boolean;
  /** Authorization evaluated before query projection; denied fields never reach the repository SELECT list. */
  readonly readPermissionCode?: string;
  /** Authorization evaluated during mutation admission for every submitted field. */
  readonly writePermissionCode?: string;
  readonly classification?:
    "public" | "internal" | "confidential" | "pii" | "sensitive_pii";
  /**
   * Export admission is derived from an explicit field classification.  An
   * unclassified field is deliberately not exportable: publishing a new field
   * must include its data handling decision before it can leave the product.
   */
  readonly retentionPolicyCode?: string;
  readonly validation?: Readonly<Record<string, unknown>>;
  readonly detail?: { readonly rendererKey: "text" };
  readonly list?: {
    readonly label?: string;
    /** Human-readable section used to organize large field catalogues. */
    readonly columnGroup?: string;
    readonly semanticRole?: string;
    /** Ordering hint for narrow record cards; it never widens the authorized projection. */
    readonly cardPriority?: "primary" | "secondary" | "hidden";
    readonly rendererKey?: string;
    readonly statusTones?: Readonly<
      Record<string, "neutral" | "success" | "warning" | "danger">
    >;
    readonly defaultVisible?: boolean;
    readonly defaultOrder?: number;
    readonly defaultWidth?: number;
    readonly groupable?: boolean;
    /** Optional metadata restriction intersected with the runtime's type-safe operator policy. */
    readonly filterOperators?: readonly EntityListFilterOperator[];
    readonly aggregations?: readonly (
      "count" | "sum" | "average" | "minimum" | "maximum"
    )[];
  };
}

/** Immutable content references needed to prepare a page intent. The browser sees
 * only safe runtime projections; physical Core bindings remain server-only. */
export interface CompiledEntityArtifactReferenceV1 {
  readonly artifactKey: string;
  readonly artifactType:
    | "core"
    | "operation"
    | "presentation_surface"
    | "presentation_section"
    | "flow";
  readonly hash: string;
}
export interface CompiledEntityReleaseDescriptorV1 {
  readonly releaseId: string;
  readonly releaseHash: string;
  readonly artifacts: readonly CompiledEntityArtifactReferenceV1[];
}
export interface EntityRuntimePageIntentV1 {
  readonly surfaceKey: string;
  readonly recordId?: string;
  readonly sectionKey?: string;
  readonly flowKey?: string;
}

export interface EntityListDefaultStateDescriptor {
  readonly query?: string;
  readonly filters?: readonly Readonly<{
    readonly field: string;
    readonly operator: EntityListFilterOperator;
    readonly value?: unknown;
  }>[];
  readonly sort?: readonly Readonly<{
    readonly field: string;
    readonly direction: "asc" | "desc";
    readonly nulls?: "first" | "last";
  }>[];
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
  readonly quickFields?: readonly Readonly<{
    readonly field: string;
    readonly defaultOperator?: EntityListFilterOperator;
  }>[];
  readonly allowUserPinning?: boolean;
}

export interface EntityListLimitsDescriptor {
  readonly defaultPageSize?: number;
  readonly allowedPageSizes?: readonly number[];
  readonly maxSortLevels?: number;
  readonly countMode?: "none" | "cached" | "approximate" | "exact";
}

/** Published Board projection compiled from the typed lane rows. Choices are
 * the compiled entity_field_choice projection; every choice is in exactly one
 * lane, and the lane tone is the authored tone or the members' shared tone. */
export interface EntityListBoardDescriptor {
  readonly laneFields: readonly {
    readonly field: string;
    readonly choices: readonly {
      readonly value: string;
      readonly label: string;
      readonly localizedLabel?: import("@athyper/contract-platform-entity-list").EntityLocalizedTextV1;
      readonly tone: import("@athyper/contract-platform-entity-list").ListBoardTone;
      readonly position: number;
    }[];
    readonly lanes: readonly {
      readonly key: string;
      readonly label: string;
      readonly localizedLabel?: import("@athyper/contract-platform-entity-list").EntityLocalizedTextV1;
      readonly values: readonly string[];
      readonly tone: import("@athyper/contract-platform-entity-list").ListBoardTone;
      readonly collapsed: boolean;
      readonly terminal: boolean;
    }[];
  }[];
}

/** A published date range, shared by the date layouts (Calendar, Gantt).
 * Fields are declared explicitly; a null end means open-ended. */
export interface EntityListDateRangeDescriptor {
  readonly start: string;
  readonly end?: string;
  readonly tone?: {
    readonly field: string;
    readonly choices: readonly {
      readonly value: string;
      readonly label: string;
      readonly tone: import("@athyper/contract-platform-entity-list").ListCalendarTone;
    }[];
  };
}

/** Published Calendar projection. The default view is one this release can render. */
export interface EntityListCalendarDescriptor {
  readonly defaultView: import("@athyper/contract-platform-entity-list").ListCalendarView;
  readonly dateFields: readonly EntityListDateRangeDescriptor[];
}

/** Published Gantt projection: its own date ranges, an optional group field
 * (an entity enum) and progress field (integer or decimal), and a default
 * zoom this release can render. */
export interface EntityListGanttDescriptor {
  readonly defaultZoom: import("@athyper/contract-platform-entity-list").ListGanttZoom;
  readonly dateFields: readonly EntityListDateRangeDescriptor[];
  readonly group?: { readonly field: string };
  readonly progress?: { readonly field: string };
}

/** Compiled projection of the surface's binding_kind = summary placements. */
export interface EntityListCardContentDescriptor {
  readonly fields: readonly {
    readonly field: string;
    readonly rendererKey?: string;
  }[];
}

export interface EntityListPresentationDescriptor {
  readonly localizedLabels?: import("@athyper/contract-platform-entity-runtime").EntityPresentationLocalizationV1;
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
  readonly defaultSort?: readonly Readonly<{
    field: string;
    direction: "asc" | "desc";
    nulls?: "first" | "last";
  }>[];
  /** @deprecated Use defaultState.density. */
  readonly defaultDensity?: EntityListDensity;
  readonly supportedModes?: readonly EntityListViewMode[];
  readonly board?: EntityListBoardDescriptor;
  readonly calendar?: EntityListCalendarDescriptor;
  readonly gantt?: EntityListGanttDescriptor;
  readonly cardContent?: EntityListCardContentDescriptor;
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
    readonly importOperations?: readonly (
      "create" | "update" | "upsert" | "delete" | "replace"
    )[];
    readonly importOperationPermissions?: Readonly<
      Partial<
        Record<
          "create" | "update" | "upsert" | "delete" | "replace",
          readonly string[]
        >
      >
    >;
    /** Adapter-owned input fields that are not list/storage columns (for example Studio draft graph coordinates). */
    readonly importFields?: readonly Readonly<{
      readonly key: string;
      readonly type: EntityFieldType;
      readonly required: boolean;
      readonly label?: string;
    }>[];
  };
}

export interface EntityAggregateCollectionDescriptor {
  readonly code: string;
  readonly entityCode: string;
  readonly parentField: string;
  readonly allowedOperations: readonly (
    "create" | "update" | "delete" | "replace"
  )[];
}

export interface EntityRegisteredActionDescriptor {
  readonly code: string;
  readonly handlerKey: string;
  readonly permissionCode: string;
  readonly asyncThreshold?: number;
}

export interface EntityOperationDescriptor {
  readonly code: string;
  /** Omission on a valid published operation requires no entity permission grant. */
  readonly permissionCode?: string;
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

export type EntityPolicyBindingStage =
  "authorization" | "precondition" | "validation" | "postcondition" | "masking";
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
  /** New live contracts require independently installed F6/F8 evidence. */
  readonly liveReadContract?: import("./entity-live-read.js").EntityLiveReadContractV1;
  readonly recordPredicates?: readonly import("./record-predicates.js").RecordPredicate[];
  readonly mutationPolicy?: import("./record-mutation-policy.js").RecordMutationPolicyV1;
  readonly ownerAccess?: import("./record-owner-access.js").RecordOwnerAccessV1;
  /** Validated cross-plane read-only capability; never an authorization grant. */
  readonly referenceCapability?: "common.platform.reference.view";
  readonly intakeSurfaces?: readonly import("@athyper/contract-platform-entity-runtime").EntityIntakeSurfaceV1[];
  readonly intakeFlows?: readonly import("@athyper/contract-platform-entity-runtime").EntityIntakeFlowV1[];
  readonly ai?: import("./entity-ai.js").EntityAiDescriptorV1;
  /** Runtime-only trusted host result; never parsed from a published artifact. */
  readonly capabilityReadiness?: import("./entity-readiness.js").EntityReadinessResult;
  readonly aiManifestBindings?: import("./entity-ai-manifest.js").EntityAiManifestBindingsV1;
  readonly formPresentation?: import("@athyper/contract-platform-entity-runtime").EntityFormPresentationV1;
  readonly recordPresentation?: import("@athyper/contract-platform-entity-runtime").EntityRecordPresentationV1;
  readonly directoryScope?: import("./directory-scope.js").EntityDirectoryScopeV1;
  readonly authorizationRuntime?: EntityAuthorizationRuntime;
  readonly authorization?: import("./entity-authorization.js").EntityAuthorizationProfileV1;
  readonly collectionRelationship?: import("./collection-relationship.js").CollectionRelationshipV1;
  readonly schema:
    | "athyper.entity-runtime-descriptor/1.0"
    | "athyper.entity-runtime-descriptor/1.1";
  readonly entityCode: string;
  readonly detailRouteTemplate?: string;
  readonly planeKey: PlaneKey;
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly contractHash: string;
  readonly compiledHash: string;
  /** Present only after the split-artifact compiler has prepared this descriptor. */
  readonly compiledRelease?: CompiledEntityReleaseDescriptorV1;
  readonly storage: {
    readonly schema: string;
    readonly object: string;
    readonly idField: string;
    readonly tenantField?: string;
    /** Read visibility for `tenantField`. `tenant_or_platform` also admits
     * platform-owned rows (null tenant) to reads; writes stay tenant-exact so a
     * tenant can never mutate the platform baseline. Defaults to `tenant`. */
    readonly tenantVisibility?: "tenant" | "tenant_or_platform";
    readonly versionField?: string;
    readonly softDeleteField?: string;
    readonly statusField?: string;
  };
  readonly fields: readonly EntityFieldDescriptor[];
  readonly operations: Readonly<Record<string, EntityOperationDescriptor>>;
  readonly lifecycle?: {
    readonly transitions: readonly EntityLifecycleTransitionDescriptor[];
  };
  readonly aggregate?: {
    readonly collections: readonly EntityAggregateCollectionDescriptor[];
  };
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
