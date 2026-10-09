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
}

export interface GetRecordQuery {
  readonly scopeCoordinate?: RecordListScopeCoordinate;
  readonly context: VerifiedRequestContext;
  readonly entityCode: string;
  readonly recordId: string;
  readonly hydrateReferences?: boolean;
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
  readonly groups?: readonly Readonly<{ readonly value: unknown; readonly count: number }>[];
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
