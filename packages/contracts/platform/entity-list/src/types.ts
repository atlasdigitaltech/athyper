import type { EffectiveEntitySectionV1 } from "./experience";
import type { ENTITY_LIST_VIEW_MODES } from "./view-modes";
export type ListPlane = "neon" | "mesh" | "studio";
export type ListViewMode = (typeof ENTITY_LIST_VIEW_MODES)[number];
export interface ListUnavailableModeV1 {
  readonly mode: ListViewMode;
  readonly code: string;
}
export type ListDensity = "compact" | "comfortable" | "spacious";
/** Metadata ordering hint for narrow record cards. It orders fields the user
 * can already see; it never widens the authorized list projection. */
export type ListCardPriority = "primary" | "secondary" | "hidden";
/** A field's declared audit stamp (shared list layout foundation, gap 7):
 * when and by whom a record was created or last updated. Field pickers group
 * these fields from this declaration, never from the field's name. */
export const LIST_AUDIT_ROLES = ["createdAt", "createdBy", "updatedAt", "updatedBy"] as const;
export type ListAuditRole = (typeof LIST_AUDIT_ROLES)[number];
export type ListCountMode = "none" | "cached" | "approximate" | "exact";
export type DataOperationState = "enabled" | "disabled" | "hidden";
export type RecordExportFormat = "xlsx" | "csv" | "json" | "ndjson";
export type RecordImportFormat = "xlsx" | "csv" | "json";
export type ListValueKind =
  | "string"
  | "text"
  | "integer"
  | "decimal"
  | "money"
  | "boolean"
  | "date"
  | "datetime"
  | "uuid"
  | "enum"
  | "reference"
  | "json";
export type ListFilterOperator =
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
export type JsonPrimitive = string | number | boolean | null;
export interface JsonArray extends ReadonlyArray<JsonValue> {}
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/** Browser and service limits are deliberately shared so metadata-rich entities
 * cannot create requests that the records API will reject or URLs that proxies
 * cannot safely carry. */
export const ENTITY_LIST_MAX_VISIBLE_COLUMNS = 100;
/** Grouping levels (Tree blueprint decision 4). */
export const ENTITY_LIST_MAX_GROUP_LEVELS = 3;
export const ENTITY_LIST_MAX_FILTERS = 20;
/** Values an `in` filter may name (Compare blueprint 5.8 point 8; Matrix section 3). */
export const MAX_LIST_FILTER_VALUES = 100;
export const ENTITY_LIST_MAX_SORT_LEVELS = 10;
export const ENTITY_LIST_MAX_URL_LENGTH = 8_192;
/** Longest search term the records API accepts (route schema and query service). */
export const ENTITY_LIST_MAX_SEARCH_LENGTH = 512;
/** How a relative-date value maps to a half-open range `[from, to)`.
 * `days` offsets are counted from today; `calendar` offsets are whole units
 * from the start of the current week (Monday), month, quarter or year. This
 * table is the single definition every filter endpoint, repository and
 * validator derives from; never restate a range elsewhere. */
export type EntityListRelativeDateRange =
  | { readonly kind: "days"; readonly from: number; readonly to: number }
  | {
      readonly kind: "calendar";
      readonly unit: "week" | "month" | "quarter" | "year";
      readonly from: number;
      readonly to: number;
    };
const days = (from: number, to: number) =>
  Object.freeze({ kind: "days" as const, from, to });
const calendar = (
  unit: "week" | "month" | "quarter" | "year",
  from: number,
  to: number,
) => Object.freeze({ kind: "calendar" as const, unit, from, to });
export const ENTITY_LIST_RELATIVE_DATE_RANGES = Object.freeze({
  today: days(0, 1),
  yesterday: days(-1, 0),
  tomorrow: days(1, 2),
  last_7_days: days(-7, 1),
  last_30_days: days(-30, 1),
  last_90_days: days(-90, 1),
  last_365_days: days(-365, 1),
  next_7_days: days(0, 8),
  next_30_days: days(0, 31),
  next_90_days: days(0, 91),
  next_365_days: days(0, 366),
  this_week: calendar("week", 0, 1),
  this_month: calendar("month", 0, 1),
  this_quarter: calendar("quarter", 0, 1),
  last_year: calendar("year", -1, 0),
  this_year: calendar("year", 0, 1),
  next_year: calendar("year", 1, 2),
}) satisfies Readonly<Record<string, EntityListRelativeDateRange>>;
export type EntityListRelativeDateValue =
  keyof typeof ENTITY_LIST_RELATIVE_DATE_RANGES;
/** Values accepted by every Entity Framework relative-date filter endpoint. */
export const ENTITY_LIST_RELATIVE_DATE_VALUES = Object.freeze(
  Object.keys(ENTITY_LIST_RELATIVE_DATE_RANGES),
) as readonly EntityListRelativeDateValue[];
export function entityListRelativeDateRange(
  value: unknown,
): EntityListRelativeDateRange | undefined {
  return typeof value === "string" &&
    Object.hasOwn(ENTITY_LIST_RELATIVE_DATE_RANGES, value)
    ? ENTITY_LIST_RELATIVE_DATE_RANGES[value as EntityListRelativeDateValue]
    : undefined;
}
export type EntityListMaxVisibleColumns = 100;
export type EntityListMaxFilters = 20;
export type EntityListMaxSortLevels = 10;

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
/** Server-derived requirements for one collection operation, independent of directory filters. */
export interface EntityWorkContextRequirementV1 {
  readonly schemaVersion: 1;
  readonly resolver: string;
  readonly requiredCoordinates: readonly (
    "operatingOrganizationId" | "companyCodeId" | "legalEntityId"
  )[];
}

export interface EntityListScopeCoordinateV1 {
  /** Untrusted parent reference; resolved and authorized by the server on every request. */
  readonly parentEntityCode?: string;
  readonly parentRecordId?: string;
  readonly relationshipKey?: string;
  /** Loaded parent publication pin; the server still derives and authorizes scope. */
  readonly parentDescriptorHash?: string;
  readonly companyCodeIds?: readonly string[];
  readonly operatingOrganizationIds?: readonly string[];
  readonly partnerRole?: "supplier" | "customer";
  readonly eligibleOperation?: "order" | "invoice" | "payment";
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
  readonly standardViewKey?: string;
  readonly query?: string;
  readonly filters: readonly ListFilterV1[];
  readonly sort: readonly ListSortV1[];
  /** Grouping fields, level 1 first (Tree blueprint section 5.1): 1–3, ordered,
   * unique. A date field is grouped as `field:month` or `field:quarter` (A3).
   * A legacy single `group` reads as one level. */
  readonly groups?: readonly string[];
  readonly columns: readonly string[];
  readonly density: ListDensity;
  readonly mode: ListViewMode;
  readonly spreadsheet?: SpreadsheetStateV1;
  readonly board?: import("./board").ListBoardStateV1;
  readonly calendar?: import("./calendar").ListCalendarStateV1;
  readonly gantt?: import("./gantt").ListGanttStateV1;
  readonly matrix?: import("./matrix").ListMatrixStateV1;
  readonly aggregate?: import("./aggregate").ListAggregateStateV1;
}

export interface ListLocationStateV1 extends SaveableListStateV1 {
  readonly savedViewId?: string;
  readonly baseSavedViewId?: string;
  readonly cursor?: string;
  readonly pageIndex?: number;
  readonly pageSize?: number;
  /** Calendar position (`YYYY-MM-DD`). Location only: never saved with a view. */
  readonly calendarAnchor?: string;
  /** Gantt position (`YYYY-MM-DD`). Location only: never saved with a view. */
  readonly ganttAnchor?: string;
  /** Tree deep link (`tree.node`): the record to reveal. Location only, an
   * internal routing identity that is never displayed. */
  readonly treeNode?: string;
  /** Matrix row and column page indices. Location only: never saved. */
  readonly matrixRowPage?: number;
  readonly matrixColumnPage?: number;
  /** The open comparison (Compare blueprint section 5.4): record routing
   * identities, never displayed. Location only: never saved with a view. */
  readonly compare?: import("./compare").ListCompareLocationV1;
}

export interface ListFieldDescriptorV1 {
  readonly referenceLookup?: { readonly dependencies: readonly string[] };
  readonly key: string;
  readonly label: string;
  /** Optional metadata-defined catalogue section used by field discovery controls. */
  readonly columnGroup?: string;
  readonly valueKind: ListValueKind;
  readonly semanticRole?: string;
  readonly auditRole?: ListAuditRole;
  readonly cardPriority?: ListCardPriority;
  readonly statusTones?: Readonly<
    Record<string, "neutral" | "success" | "warning" | "danger">
  >;
  readonly rendererKey?: string;
  readonly formatting?: Readonly<Record<string, JsonValue>>;
  /** Authorized, bounded choices suitable for enum or reference filter editors. */
  readonly filterOptions?: readonly Readonly<{
    value: string | number | boolean;
    label: string;
  }>[];
  readonly defaultVisible: boolean;
  readonly defaultOrder: number;
  readonly defaultWidth?: number;
  readonly filterOperators: readonly ListFilterOperator[];
  readonly sortable: boolean;
  readonly groupable: boolean;
  readonly aggregations: readonly (
    "count" | "sum" | "average" | "minimum" | "maximum"
  )[];
  /** A semi-additive field (Entity list Aggregate blueprint 5.2): its sum
   * holds only within one value of each of these fields, and a group total
   * across them is withheld by the server as `notSummable`. */
  readonly sumWithin?: readonly { readonly key: string; readonly label: string }[];
}

export interface EffectiveListActionV1 {
  readonly key: string;
  readonly label: string;
  readonly localizedLabel?: import("./experience").EntityLocalizedTextV1;
  readonly href?: string;
  readonly disabledMessage?: import("./experience").EntityLocalizedTextV1;
  readonly iconKey?: string;
  readonly placement:
    "primary" | "secondary" | "toolbar" | "row" | "selection" | "overflow";
  readonly selection: "none" | "single" | "multiple";
  readonly execution: "navigate" | "synchronous" | "asynchronous";
  readonly state: "enabled" | "disabled" | "hidden";
  readonly disabledReason?: {
    readonly code: string;
    readonly messageKey: string;
  };
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
  readonly workspaceHref?: string;
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
  readonly localizedLabels?: import("@athyper/contract-platform-entity-runtime").EntityPresentationLocalizationV1;
  readonly standardViews?: readonly import("./standard-views.js").EffectiveStandardViewV1[];
  readonly serverViews?: boolean;
  /** Client-resolved catalog, never persisted as record metadata. */
  readonly viewCatalog?: EntityViewCatalog;
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
    readonly header?: import("./experience").EntityListHeaderV1;
    readonly description?: string;
    readonly defaultState: SaveableListStateV1;
    readonly supportedModes: readonly ListViewMode[];
    /** Declared modes this viewer cannot use, with a reason code. They are
     * shown as unavailable and never rendered through another layout. */
    readonly unavailableModes?: readonly ListUnavailableModeV1[];
    /** Lane fields and lanes this viewer can use; present only when Board is supported. */
    readonly board?: import("./board").ListBoardV1;
    /** Compiled card content (summary placements), shared by Cards and Board. */
    readonly cardContent?: import("./board").ListCardContentV1;
    /** Date fields and default view this viewer can use; present only when Calendar is supported. */
    readonly calendar?: import("./calendar").ListCalendarV1;
    /** Date ranges, zoom, group and progress this viewer can use; present only when Gantt is supported. */
    readonly gantt?: import("./gantt").ListGanttV1;
    /** The record hierarchy this viewer can browse; present only when Tree is supported. */
    readonly tree?: import("./tree").ListTreeV1;
    /** The pivot this viewer can use; present only when Matrix is supported. */
    readonly matrix?: import("./matrix").ListMatrixV1;
    /** The dimensions and measures this viewer can summarise; present only when Summary is supported. */
    readonly aggregate?: import("./aggregate").ListAggregateV1;
    /** The comparison this viewer can open from the selection bar (Compare
     * blueprint section 5.3); present only when the surface declares one. */
    readonly compare?: import("./compare").ListCompareV1;
    readonly search: {
      readonly profileKey?: string;
      readonly minimumQueryLength: number;
    };
    readonly filterPresentation: {
      readonly quickFields: readonly Readonly<{
        readonly field: string;
        readonly defaultOperator: ListFilterOperator;
      }>[];
      readonly source: "metadata" | "fallback";
      readonly allowUserPinning: boolean;
    };
  };
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly actions: readonly EffectiveListActionV1[];
  readonly navigation?: readonly EffectiveEntitySectionV1[];
  readonly application?: import("./experience").EntityApplicationV1;
  readonly viewNamespace?: string;
  readonly currentSurfaceKey?: string;
  readonly dataOperations?: EntityListDataOperationsV1;
  readonly scope: {
    readonly quickFilters?: readonly import("./scope-filters").EntityScopeFilterV1[];
    readonly filterKinds?: readonly ("organization" | "company")[];
    readonly workContext?: EntityWorkContextRequirementV1;
    readonly status: "ready" | "context_required";
    readonly labels: readonly {
      readonly key: string;
      readonly label: string;
      readonly value: string;
    }[];
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
  readonly displayValues?: Readonly<Record<string, string>>;
  readonly id: string;
  readonly version?: number;
  readonly values: Readonly<Record<string, JsonValue>>;
  readonly decoration?: {
    readonly commentCount?: number;
    readonly hasOpenComment?: boolean;
    readonly bookmarked?: boolean;
  };
  /** Only on rows of a `hierarchy` response: the row has at least one child
   * the viewer can read (Tree blueprint section 5.3). */
  readonly hasChildren?: boolean;
  /** On rows of a `hierarchy=orphans` response, and on the top row of a
   * `hierarchy=matches` path whose next ancestor the viewer cannot read; says
   * nothing about the parent. */
  readonly parentOutsideView?: true;
  /** Only on rows of a `hierarchy=matches` response (Tree blueprint section
   * 5.5): a match, or an ancestor shown for context. */
  readonly treeRole?: "match" | "context";
}

export interface EntityListResultV1 {
  readonly schemaVersion: 1;
  readonly descriptorHash: string;
  readonly scopeFingerprint: string;
  readonly queryHash: string;
  readonly rows: readonly EntityListRowV1[];
  /** Only on a `hierarchy=matches` response: more records match than are returned. */
  readonly matchesTruncated?: true;
  /** Only on a `hierarchy=matches` response: matches whose path is deeper than
   * the tree shows (not returned). */
  readonly matchesBeyondDepth?: number;
  readonly pagination: {
    /** Rows on the page; on a `hierarchy=matches` response, the matches. */
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
  readonly facets?: Readonly<
    Record<
      string,
      readonly {
        readonly value: JsonValue;
        readonly label: string;
        readonly count?: number;
      }[]
    >
  >;
  readonly groups?: readonly (ListGroupTotalsV1 & {
    readonly value: JsonValue;
    readonly label: string;
  })[];
  /** Only on a Summary request (`totals`): the total over every group of this
   * request, computed from base rows in the same statement (Aggregate
   * blueprint section 8.1). */
  readonly parentGroup?: ListGroupTotalsV1;
  /** Only on a Summary request with a column dimension (`pivot`, Aggregate
   * A2): the column values, in order; every group's `cells` align with them. */
  readonly pivotColumns?: readonly { readonly value: JsonValue; readonly label: string }[];
  /** More column values exist than the 12 returned (section 7.2). */
  readonly pivotColumnsTruncated?: true;
  /** More groups exist than the 50 returned (the "more groups" notice); under
   * `groupOrder`, more ranked groups exist than the limit. */
  readonly groupsTruncated?: true;
  /** Top / Bottom N (Aggregate A6, section 7.5): the order the server applied. */
  readonly groupOrder?: { readonly key: string; readonly direction: "asc" | "desc"; readonly limit: number };
  /** Under `groupOrder`: the exact number of ranked groups, never the total
   * row, No value or groups below the measure's floor. */
  readonly groupCount?: number;
  /** Under `groupOrder`: groups too small to rank, only counted. */
  readonly groupsUnranked?: number;
  /** Under `groupOrder`: the first ranked group past the limit ties the last one shown. */
  readonly groupOrderTieAtCut?: true;
  /** Only on a Matrix `rank` request: each ranked row's place, by row id. */
  readonly ranks?: Readonly<Record<string, import("./matrix").ListMatrixRankV1>>;
  /** Only on a Matrix `rank` request: a digest of the ranked set. */
  readonly rankRevision?: string;
}

/** A group's count and aggregates (Tree blueprint A2; Aggregate blueprint 5.5). */
export interface ListGroupTotalsV1 {
  readonly count?: number;
  /** Keyed `field:aggregate`, only when requested (Tree blueprint A2). */
  readonly aggregates?: Readonly<Record<string, number | string | null>>;
  /** The one currency of a money aggregate's rows, by aggregate key. */
  readonly aggregateCurrencies?: Readonly<Record<string, string>>;
  /** Money aggregates left out because the group's rows span currencies. */
  readonly mixedCurrencies?: readonly string[];
  /** Money aggregates left out because some amounts have no recorded currency. */
  readonly unknownCurrencies?: readonly string[];
  /** Summary aggregates shown as text instead of a value: a semi-additive sum
   * across its time fields, or a group below a measure's floor. */
  readonly states?: Readonly<Record<string, import("./aggregate").ListAggregateCellState>>;
  /** Only on a Summary request with a column dimension (Aggregate A2): this
   * group's value per column, aligned with `pivotColumns`; null where the
   * group has no records in that column. Named owner: the Aggregate
   * blueprint (section 5.7 point 1). */
  readonly cells?: readonly (Omit<ListGroupTotalsV1, "cells"> | null)[];
}

export interface EntityApplicationDescriptorV1 {
  readonly localizedLabels?: import("@athyper/contract-platform-entity-runtime").EntityPresentationLocalizationV1;
  readonly intakeSurfaces?: readonly import("@athyper/contract-platform-entity-runtime").EntityIntakeSurfaceV1[];
  readonly intakeFlows?: readonly import("@athyper/contract-platform-entity-runtime").EntityIntakeFlowV1[];
  readonly schemaVersion: 1;
  readonly plane: EntityListDescriptorV1["plane"];
  readonly entity: Pick<
    EntityListDescriptorV1["entity"],
    "code" | "label" | "pluralLabel"
  >;
  readonly revision: EntityListDescriptorV1["revision"];
  readonly surface: Pick<
    EntityListDescriptorV1["surface"],
    "key" | "title" | "header" | "description"
  >;
  readonly actions: EntityListDescriptorV1["actions"];
  readonly scope: EntityListDescriptorV1["scope"];
  readonly navigation?: EntityListDescriptorV1["navigation"];
  readonly application?: EntityListDescriptorV1["application"];
}

export interface EntitySavedView {
  readonly id: string;
  readonly name: string;
  readonly scope: "personal" | "shared" | "system";
  readonly state: SaveableListStateV1;
  readonly version: number;
  readonly compatible: boolean;
}
export interface EntityViewCatalog {
  readonly views: readonly EntitySavedView[];
  readonly personalDefault?: string;
  readonly sharedDefault?: string;
  readonly createdId?: string;
  readonly capabilities: {
    readonly createShared: boolean;
    readonly manageShared: boolean;
    readonly setSharedDefault: boolean;
  };
}
