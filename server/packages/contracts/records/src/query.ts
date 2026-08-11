import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export type RecordCountMode = "none" | "cached" | "approximate" | "exact";
export type RecordFilterOperator = "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte" | "is_null" | "is_not_null";

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
  readonly search?: string;
  readonly countMode?: RecordCountMode;
  readonly hydrateReferences?: boolean;
}

export interface GetRecordQuery {
  readonly context: VerifiedRequestContext;
  readonly entityCode: string;
  readonly recordId: string;
  readonly hydrateReferences?: boolean;
}

export interface RecordListResult {
  readonly data: readonly Readonly<Record<string, unknown>>[];
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
