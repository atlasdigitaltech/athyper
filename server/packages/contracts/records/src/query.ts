import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export interface RecordListScopeCoordinate {
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
  readonly context: VerifiedRequestContext;
  readonly entityCode: string;
  readonly limit?: number;
  readonly cursor?: string;
  readonly filters?: readonly RecordFilter[];
  readonly sort?: readonly RecordSort[];
  /** Requested readable response fields. The server adds identity and query-internal fields as required. */
  readonly fields?: readonly string[];
  readonly group?: string;
  readonly search?: string;
  readonly countMode?: RecordCountMode;
  readonly hydrateReferences?: boolean;
  /** Trusted server-only record restriction. HTTP list routes never parse this value. */
  readonly recordIds?: readonly string[];
  /** Untrusted explicit coordinate; authority is resolved again on every request. */
  readonly scopeCoordinate?: RecordListScopeCoordinate;
}

export interface GetRecordQuery {
  readonly context: VerifiedRequestContext;
  readonly entityCode: string;
  readonly recordId: string;
  readonly hydrateReferences?: boolean;
}

export interface RecordListResult {
  readonly data: readonly Readonly<Record<string, unknown>>[];
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
