import type { EntityRuntimeDescriptor, EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export interface RecordListScopeCoordinate {
  /** Untrusted parent reference; resolved and authorized by the server on every request. */
  readonly parentEntityCode?: string;
  readonly parentRecordId?: string;
  readonly relationshipKey?: string;
  /** Optional publication pin, checked by the registered parent resolver. A
   * mismatch narrows admission to denial; it never supplies authority. */
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

export type RecordCountMode = "none" | "cached" | "approximate" | "exact";
export type RecordFilterOperator = "eq" | "ne" | "in" | "contains" | "starts_with" | "gt" | "gte" | "lt" | "lte" | "between" | "is_null" | "is_not_null" | "relative";

export interface RecordFilter {
  readonly field: string;
  readonly operator: RecordFilterOperator;
  readonly value?: unknown;
}

export interface RecordSort {
  readonly field: string;
  readonly direction: "asc" | "desc";
  readonly nulls?: "first" | "last";
}

export interface ListRecordsQuery {
  readonly standardViewKey?: string;
  /** Trusted, server-produced relationship predicates. Never accepted from HTTP. */
  readonly viewRelationships?: readonly import("./ports.js").StandardViewRelationshipConstraint[];
  readonly context: VerifiedRequestContext;
  readonly entityCode: string;
  readonly limit?: number;
  readonly cursor?: string;
  readonly filters?: readonly RecordFilter[];
  readonly sort?: readonly RecordSort[];
  /** Requested readable response fields. The server adds identity and query-internal fields as required. */
  readonly fields?: readonly string[];
  readonly group?: string;
  /** Groups a date field by month or quarter (Tree blueprint A3); `timeZone`
   * is the viewer's zone, required for a datetime field. */
  readonly groupBucket?: RecordGroupBucket;
  /** Per-group aggregates (Tree blueprint A2); only with `group` and exact counts. */
  readonly groupAggregates?: readonly RecordGroupAggregate[];
  /** Groups only, no rows (Tree blueprint section 5.1). Valid only with
   * `group` and exact counts and no cursor. */
  readonly groupsOnly?: boolean;
  /** A record-hierarchy request (Tree blueprint section 5.3): `nodes` adds
   * hasChildren to every row; `orphans` selects visible records whose parent
   * the viewer cannot read; `matches` returns the records that match the
   * search and filters with the ancestors that place them (section 5.5). */
  readonly hierarchy?: "nodes" | "orphans" | "matches";
  readonly search?: string;
  readonly countMode?: RecordCountMode;
  readonly hydrateReferences?: boolean;
  /** Trusted server-only record restriction. HTTP list routes never parse this value. */
  readonly recordIds?: readonly string[];
  /** Untrusted explicit coordinate; authority is resolved again on every request. */
  readonly scopeCoordinate?: RecordListScopeCoordinate;
  /** Matrix rank (Matrix blueprint 5.4 point 3): a declared ranked measure.
   * Ranks cover every record the request's filters and scope admit. */
  readonly rank?: string;
  /** Matrix participant page: column key values the returned rows are narrowed
   * to. Output only; never part of the ranked set. Valid only with `rank`. */
  readonly matrixColumns?: readonly string[];
}

/** One returned row's place in its Matrix partition. */
export interface RecordRank {
  readonly rank: number;
  /** Records ranked in the partition. */
  readonly count: number;
  /** The partition's best value, exact. */
  readonly best: string;
  /** |value − best| / |best| as a percentage, exact to one decimal; absent at
   * the best value and when the best value is zero. */
  readonly difference?: string;
}

export interface GetRecordQuery {
  readonly scopeCoordinate?: RecordListScopeCoordinate;
  readonly context: VerifiedRequestContext;
  readonly entityCode: string;
  readonly recordId: string;
  readonly hydrateReferences?: boolean;
}

export interface RecordGroupBucket {
  readonly unit: "month" | "quarter";
  readonly timeZone?: string;
}
export interface RecordGroupAggregate {
  readonly field: string;
  readonly aggregate: "sum" | "average" | "minimum" | "maximum";
}

export interface RecordListResult {
  readonly data: readonly Readonly<Record<string, unknown>>[];
  /** Per row of a hierarchy request: has at least one child the viewer can read. */
  readonly hasChildren?: readonly boolean[];
  /** Per row of a `matches` request: a match, or an ancestor shown for context. */
  readonly treeRoles?: readonly ("match" | "context")[];
  /** Per row of a `matches` request: the top of a path whose next ancestor the viewer cannot read. */
  readonly parentOutsideView?: readonly boolean[];
  /** A `matches` request found more matches than it returns. */
  readonly matchesTruncated?: boolean;
  /** Matches whose path does not reach a root within the maximum depth (not returned). */
  readonly matchesBeyondDepth?: number;
  readonly groups?: readonly Readonly<{
    readonly value: unknown;
    readonly count: number;
    /** Keyed `field:aggregate` (A2). */
    readonly aggregates?: Readonly<Record<string, number | string | null>>;
    /** The one currency of a money aggregate's rows, by aggregate key. */
    readonly aggregateCurrencies?: Readonly<Record<string, string>>;
    /** Money aggregates left out because the group's rows span currencies. */
    readonly mixedCurrencies?: readonly string[];
    /** Money aggregates left out because some amounts have no recorded currency. */
    readonly unknownCurrencies?: readonly string[];
  }>[];
  /** More groups exist than the 50 returned (the "more groups" notice). */
  readonly groupsTruncated?: boolean;
  /** Per row of a rank request: its rank, or null when it is not ranked
   * (an empty value or an ineligible column record). */
  readonly ranks?: readonly (RecordRank | null)[];
  /** A digest of the ranked set: a later page with another revision was
   * ranked from different data. */
  readonly rankRevision?: string;
  readonly pagination: {
    readonly pageSize: number;
    readonly hasMore: boolean;
    readonly nextCursor?: string;
    readonly total?: number;
    readonly countMode: RecordCountMode;
  };
}

export interface RecordDetailResult {
  readonly data: Readonly<Record<string, unknown>> | null;
}

/** Request-local authorized read evidence for shared presentation compilation. */
export interface AuthorizedRecordDetailResult extends RecordDetailResult {
  readonly descriptor: EntityRuntimeDescriptor;
  readonly readableFields: readonly EntityFieldDescriptor[];
}
