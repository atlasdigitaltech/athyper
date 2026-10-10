import type { EntityAuthorizationRuntime } from "./entity-authorization-runtime.js";
import type { PlaneKey } from "@athyper/server-foundation/context";
import {
  LIST_AUDIT_ROLES,
  type ListAuditRole,
} from "@athyper/contract-platform-entity-list";

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
/** The declared audit stamps a list field can carry (shared list layout
 * foundation, gap 7): the browser contract's one vocabulary, so the server and
 * browser parsers validate against the same list. */
export const ENTITY_LIST_AUDIT_ROLES = LIST_AUDIT_ROLES;
export type EntityListAuditRole = ListAuditRole;

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
    /** A declared audit stamp (shared list layout foundation, gap 7): when and
     * by whom a record was created or last updated. Field pickers group these
     * fields from this declaration, never from the field's name. */
    readonly auditRole?: EntityListAuditRole;
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
    /** For a money field: the field holding each row's currency code. Money
     * aggregates other than count need it, and a group whose rows span more
     * than one currency shows no total (Tree blueprint A2). */
    readonly currencyField?: string;
    /** Whether a sum of this field means anything (Entity list Aggregate
     * blueprint 5.2). Declared, never inferred: a field without it is never
     * summed by a Summary. A semi-additive field (a balance) sums only across
     * records that share one value of every time field. */
    readonly additivity?: EntityFieldAdditivity;
  };
  /** Compare C3 (Entity list Compare blueprint 5.6): which direction is the
   * best value, and an optional summary-chip label. Authored, never inferred. */
  readonly compare?: {
    readonly better: "lower" | "higher";
    readonly summaryLabel?: string;
    /** C4/Matrix: the field holding this measure's unit; units must match to show a rank. */
    readonly unitField?: string;
    /** C4/Matrix: this field is an evaluation amount (one currency, normalized). */
    readonly evaluation?: true;
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

/** Published comparison declaration of a list surface (Entity list Compare
 * blueprint section 5.2): authored sections of root fields. Present means
 * Compare is offered; absent means it is not. */
export interface EntityListCompareDescriptor {
  readonly sections: readonly {
    readonly key: string;
    readonly label: string;
    readonly localizedLabel?: import("@athyper/contract-platform-entity-list").EntityLocalizedTextV1;
    readonly fields: readonly string[];
    /** The section starts collapsed (revision 3, decision 12). */
    readonly collapsed?: true;
  }[];
  /** C4 line-item collections (Compare blueprint 5.8). */
  readonly collections?: readonly EntityListCompareCollectionDescriptor[];
}

export interface EntityListCompareCollectionDescriptor {
  readonly key: string;
  readonly label: string;
  readonly localizedLabel?: import("@athyper/contract-platform-entity-list").EntityLocalizedTextV1;
  /** A published entityRelationships key of this Entity, cardinality "many". */
  readonly relationship: string;
  /** 1–2 line fields; the first references the master Entity in master-list mode. */
  readonly matchKey: readonly string[];
  /** 1–12 line fields compared, in order. */
  readonly fields: readonly string[];
  /** Master-list mode: page by the master Entity under the compared records' common parent. */
  readonly master?: {
    readonly entity: string;
    /** The master's reference to the common parent. */
    readonly parentField: string;
    /** The compared Entity's reference to the same parent. */
    readonly recordParentField: string;
  };
  /** Authored wording for a missing line, e.g. "Not quoted". */
  readonly absentLabel?: string;
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

/** Published Matrix Layout (Entity list Matrix blueprint 5.1 and 5.4): this
 * Entity's records pivoted, one row per member of the row Entity and one
 * column per member of the column Entity, under one common parent. */
export interface EntityListMatrixDescriptor {
  /** This Entity's reference to the parent both master lists belong to. */
  readonly parentField: string;
  readonly rows: {
    readonly field: string;
    /** The row Entity's reference to the same parent. */
    readonly parentField: string;
    /** Fixed at 20 for revision 1 (section 14, decision 2). */
    readonly pageSize?: number;
  };
  readonly columns: {
    readonly field: string;
    readonly parentField: string;
    /** Column Entity fields shown in its header, at most 3. */
    readonly headerFields?: readonly string[];
    /** Column Entity state meaning "declined to participate". */
    readonly declined?: {
      readonly field: string;
      readonly values: readonly string[];
    };
    /** Fixed at 5 for revision 1; rows × columns ≤ the 100-row page. */
    readonly pageSize?: number;
  };
  /** Extra key dimensions that join the column identity (drawn from M3). */
  readonly pivotDimensions?: readonly string[];
  readonly measures: readonly {
    readonly field: string;
    readonly rank?: true;
    readonly better?: "lower" | "higher";
    readonly evaluation?: true;
    readonly unitField?: string;
  }[];
  readonly absentLabel?: string;
  /** Column Entity state that may be ranked (section 5.3). */
  readonly rankEligibility?: {
    readonly field: string;
    readonly values: readonly string[];
  };
  readonly basisLabel?: string;
  /** Column Entity sort, for example items quoted desc, total asc. */
  readonly columnOrder?: readonly {
    readonly field: string;
    readonly direction: "asc" | "desc";
  }[];
}

export type EntityFieldAdditivity =
  | { readonly kind: "additive" }
  | { readonly kind: "semiAdditive"; readonly timeFields: readonly string[] }
  | { readonly kind: "nonAdditive" };

/** Published Aggregate Layout, shown as Summary (Entity list Aggregate
 * blueprint 5.1): declared dimensions and measures of this Entity's records,
 * grouped and totalled by the server. */
export interface EntityListAggregateDescriptor {
  readonly dimensions: readonly {
    readonly field: string;
    /** Required for a date field; never on another type. */
    readonly buckets?: readonly ("month" | "quarter")[];
    /** May be the column dimension (A2). */
    readonly column?: true;
  }[];
  readonly measures: readonly {
    /** Absent only for the record count. */
    readonly field?: string;
    readonly aggregates: readonly (
      "count" | "countDistinct" | "sum" | "average" | "minimum" | "maximum"
    )[];
    /** A declared floor (section 9.3), 2–100. */
    readonly minimumGroupSize?: number;
  }[];
  readonly defaults: {
    /** 1–3 entries: `field` or `field:month|quarter`. */
    readonly rows: readonly string[];
    readonly column?: string;
    /** 1–5 entries: `count`, or `field:aggregate`. */
    readonly measures: readonly string[];
  };
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
  /** Compare selection action (Entity list Compare blueprint). */
  readonly compare?: EntityListCompareDescriptor;
  readonly calendar?: EntityListCalendarDescriptor;
  readonly gantt?: EntityListGanttDescriptor;
  readonly matrix?: EntityListMatrixDescriptor;
  readonly aggregate?: EntityListAggregateDescriptor;
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

/** Published record hierarchy (Entity list Tree blueprint section 5.2): an
 * Entity-level declaration used by the Tree layout, pickers, breadcrumbs and
 * Gantt. Never inferred from field names. */
export interface EntityHierarchyDescriptor {
  /** A nullable reference to this same Entity; records without one are roots. */
  readonly parentField: string;
  /** A required reference to the owning record (a chart, a company code, a
   * project) when the parent key includes that owner; a parent and its
   * children share its value (Tree blueprint T1). */
  readonly scopeField?: string;
  /** An integer sibling order; without it siblings follow the list's default sort. */
  readonly orderField?: string;
  /** The database's own leaf rule (Tree blueprint T2). */
  readonly nodeKind?:
    | {
        readonly kind: "choice";
        /** An entity-owned enum. */
        readonly field: string;
        /** Choices that may have children; every other choice is a leaf. */
        readonly branchValues: readonly string[];
      }
    | {
        readonly kind: "boolean";
        readonly field: string;
        /** The value that means "may have children" (false for `is_postable`). */
        readonly branchWhen: boolean;
      };
  /** 1–16. Nothing deeper is requested. */
  readonly maxDepth: number;
  /** Nodes may be moved to another parent (Tree blueprint B4). Set only when
   * the database guards cycles for this table; without it, a change to the
   * parent field is refused. */
  readonly movable?: true;
  /** At most 5; sum or count over visible descendants (Phase B3). */
  readonly rollups?: readonly {
    readonly field: string;
    readonly aggregate: "sum" | "count";
  }[];
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
  readonly hierarchy?: EntityHierarchyDescriptor;
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
