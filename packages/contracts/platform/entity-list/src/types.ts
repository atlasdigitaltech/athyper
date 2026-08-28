export type ListPlane = "neon" | "mesh" | "studio";
export type ListViewMode = "table" | "compact" | "board" | "dashboard" | "spreadsheet";
export type ListDensity = "compact" | "comfortable" | "spacious";
export type ListCountMode = "none" | "cached" | "approximate" | "exact";
export type DataOperationState = "enabled" | "disabled" | "hidden";
export type RecordExportFormat = "xlsx" | "csv" | "json" | "ndjson";
export type RecordImportFormat = "xlsx" | "csv" | "json";
export type ListValueKind = "string" | "text" | "integer" | "decimal" | "money" | "boolean" | "date" | "datetime" | "uuid" | "enum" | "reference" | "json";
export type ListFilterOperator = "eq" | "ne" | "in" | "contains" | "starts_with" | "gt" | "gte" | "lt" | "lte" | "between" | "is_null" | "is_not_null" | "relative";
export type JsonPrimitive = string | number | boolean | null;
export interface JsonArray extends ReadonlyArray<JsonValue> {}
export interface JsonObject { readonly [key: string]: JsonValue; }
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export interface ListFilterV1 {
  readonly field: string;
  readonly operator: ListFilterOperator;
  readonly value?: JsonValue;
}

export interface ListSortV1 {
  readonly field: string;
  readonly direction: "asc" | "desc";
  readonly nulls?: "first" | "last";
}

/**
 * Explicit, untrusted work-context coordinates sent with list requests.
 * They are intentionally separate from saveable/location state: a server must
 * validate every value against the current principal snapshot before use.
 */
export interface EntityListScopeCoordinateV1 {
  readonly companyCodeId?: string;
  readonly legalEntityId?: string;
  readonly operatingOrganizationId?: string;
  readonly networkAccountId?: string;
}

export interface SpreadsheetStateV1 {
  readonly pinned: readonly string[];
  readonly widths: Readonly<Record<string, number>>;
}

export interface SaveableListStateV1 {
  readonly query?: string;
  readonly filters: readonly ListFilterV1[];
  readonly sort: readonly ListSortV1[];
  readonly group?: string;
  readonly columns: readonly string[];
  readonly density: ListDensity;
  readonly mode: ListViewMode;
  readonly spreadsheet?: SpreadsheetStateV1;
}

export interface ListLocationStateV1 extends SaveableListStateV1 {
  readonly savedViewId?: string;
  readonly baseSavedViewId?: string;
  readonly cursor?: string;
  readonly pageIndex?: number;
  readonly pageSize?: number;
}

export interface ListFieldDescriptorV1 {
  readonly key: string;
  readonly label: string;
  /** Optional metadata-defined catalogue section used by field discovery controls. */
  readonly columnGroup?: string;
  readonly valueKind: ListValueKind;
  readonly semanticRole?: string;
  readonly rendererKey?: string;
  readonly formatting?: Readonly<Record<string, JsonValue>>;
  /** Authorized, bounded choices suitable for enum or reference filter editors. */
  readonly filterOptions?: readonly Readonly<{ value: string | number | boolean; label: string }>[];
  readonly defaultVisible: boolean;
  readonly defaultOrder: number;
  readonly defaultWidth?: number;
  readonly filterOperators: readonly ListFilterOperator[];
  readonly sortable: boolean;
  readonly groupable: boolean;
  readonly aggregations: readonly ("count" | "sum" | "average" | "minimum" | "maximum")[];
}

export interface EffectiveListActionV1 {
  readonly key: string;
  readonly label: string;
  readonly iconKey?: string;
  readonly placement: "primary" | "secondary" | "toolbar" | "row" | "selection" | "overflow";
  readonly selection: "none" | "single" | "multiple";
  readonly execution: "navigate" | "synchronous" | "asynchronous";
  readonly state: "enabled" | "disabled" | "hidden";
  readonly disabledReason?: { readonly code: string; readonly messageKey: string };
  readonly requiresPreflight: boolean;
  readonly supportsAllMatching: boolean;
}

export interface EffectiveDataOperationV1 {
  readonly state: DataOperationState;
  readonly maxRecords?: number;
  readonly requiredPermission?: string;
  readonly requiresPreflight: boolean;
  readonly requiresApproval: boolean;
  readonly disabledReason?: { readonly code: string; readonly message: string };
}

/** Server-evaluated transfer policy. The browser may present it, but every
 * mutation endpoint must independently re-evaluate the same authority. */
export interface EntityListDataOperationsV1 {
  readonly export: {
    readonly currentPage: EffectiveDataOperationV1;
    readonly selected: EffectiveDataOperationV1;
    readonly filtered: EffectiveDataOperationV1;
    readonly all: EffectiveDataOperationV1;
    readonly formats: readonly RecordExportFormat[];
    readonly defaultFormat: RecordExportFormat;
    readonly exportableFields: readonly string[];
    readonly asynchronousThreshold: number;
  };
  readonly import: {
    readonly create: EffectiveDataOperationV1;
    readonly update: EffectiveDataOperationV1;
    readonly upsert: EffectiveDataOperationV1;
    readonly delete?: EffectiveDataOperationV1;
    readonly replace?: EffectiveDataOperationV1;
    readonly downloadTemplate: EffectiveDataOperationV1;
    readonly formats: readonly RecordImportFormat[];
    readonly defaultFormat: RecordImportFormat;
    readonly importableFields: readonly string[];
    readonly maxFileBytes: number;
    readonly maxRows: number;
    /** Studio metadata transfers must create governed drafts, never active metadata. */
    readonly draftOnly: boolean;
  };
}

export interface EntityListDescriptorV1 {
  readonly schemaVersion: 1;
  readonly plane: ListPlane;
  readonly entity: {
    readonly code: string;
    readonly label: string;
    readonly pluralLabel: string;
    readonly identityField: string;
    readonly detailRouteTemplate?: string;
  };
  readonly revision: {
    readonly release: number;
    readonly descriptorHash: string;
    readonly surfaceHash: string;
  };
  readonly surface: {
    readonly key: string;
    readonly title: string;
    readonly description?: string;
    readonly defaultState: SaveableListStateV1;
    readonly supportedModes: readonly ListViewMode[];
    readonly search: {
      readonly profileKey?: string;
      readonly minimumQueryLength: number;
    };
  };
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly actions: readonly EffectiveListActionV1[];
  readonly dataOperations?: EntityListDataOperationsV1;
  readonly scope: {
    readonly status: "ready" | "context_required";
    readonly labels: readonly { readonly key: string; readonly label: string; readonly value: string }[];
    readonly fingerprint: string;
  };
  readonly limits: {
    readonly defaultPageSize: number;
    readonly allowedPageSizes: readonly number[];
    readonly maxSortLevels: number;
    readonly countMode: ListCountMode;
  };
}

export interface EntityListRowV1 {
  readonly id: string;
  readonly version?: number;
  readonly values: Readonly<Record<string, JsonValue>>;
  readonly decoration?: {
    readonly commentCount?: number;
    readonly hasOpenComment?: boolean;
    readonly bookmarked?: boolean;
  };
}

export interface EntityListResultV1 {
  readonly schemaVersion: 1;
  readonly descriptorHash: string;
  readonly scopeFingerprint: string;
  readonly queryHash: string;
  readonly rows: readonly EntityListRowV1[];
  readonly pagination: {
    readonly pageSize: number;
    readonly hasNext: boolean;
    readonly nextCursor?: string;
    readonly hasPrevious: boolean;
    readonly previousCursor?: string;
    readonly total?: number;
    readonly countMode: ListCountMode;
    readonly requestedCountMode?: ListCountMode;
    readonly totalAsOf?: string;
  };
  readonly facets?: Readonly<Record<string, readonly { readonly value: JsonValue; readonly label: string; readonly count?: number }[]>>;
  readonly groups?: readonly { readonly value: JsonValue; readonly label: string; readonly count?: number }[];
}
