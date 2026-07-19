import type { VerifiedRequestContext } from "@athyper/svc-iam";
import type { ExecutionDescriptorV1 } from "@athyper/svc-metadata";

export type EntityCountMode = "none" | "cached" | "approximate" | "exact";
export type EntityFilterOperator = "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte" | "is_null" | "is_not_null";

export interface EntityQueryFilter {
  readonly field: string;
  readonly operator: EntityFilterOperator;
  readonly value?: unknown;
}

export interface EntityQuerySort {
  readonly field: string;
  readonly direction: "asc" | "desc";
  readonly nulls: "first" | "last";
}

/**
 * Trusted row-scope values derived inside the Records service. These values
 * must never be populated directly from request query parameters.
 */
export interface EntityQueryScopeExpansion {
  readonly companyCodeIds?: readonly string[];
  readonly legalEntityIds?: readonly string[];
}

export interface EntityQueryScopeResolver {
  resolve(input: {
    readonly context: VerifiedRequestContext;
    readonly descriptor: ExecutionDescriptorV1;
  }): Promise<EntityQueryScopeExpansion>;
}

interface EntityQueryCommandBase {
  readonly context: VerifiedRequestContext;
  readonly descriptor: ExecutionDescriptorV1;
  /** Exact generation captured with the descriptor; used by result caches. */
  readonly generation: string;
}

export interface ListEntitiesCommand extends EntityQueryCommandBase {
  readonly limit?: number;
  readonly cursor?: string;
  readonly filters?: readonly EntityQueryFilter[];
  readonly sort?: readonly EntityQuerySort[];
  readonly search?: string;
  readonly countMode?: EntityCountMode;
  readonly hydrateReferences?: boolean;
  /**
   * Effective result-cache TTL after applying service policy and any trusted
   * descriptor ceiling. Zero disables result-cache reads and writes.
   */
  readonly resultCacheTtlSeconds?: number;
  /** Offset is accepted only when the descriptor explicitly declares a bounded admin collection. */
  readonly offset?: number;
}

export interface GetEntityDetailCommand extends EntityQueryCommandBase {
  readonly id: string;
  readonly hydrateReferences?: boolean;
}

export interface QueryPredicate {
  readonly column: string;
  readonly operator: EntityFilterOperator;
  readonly value?: unknown;
}

export interface KeysetBoundary {
  readonly values: readonly unknown[];
}

export interface CompiledEntityQueryPlan {
  readonly entityCode: string;
  readonly schema: string;
  readonly table: string;
  readonly primaryKey: string;
  readonly columns: readonly { readonly field: string; readonly column: string }[];
  readonly predicates: readonly QueryPredicate[];
  readonly search?: { readonly columns: readonly string[]; readonly term: string };
  readonly sort: readonly (EntityQuerySort & { readonly column: string })[];
  readonly boundary?: KeysetBoundary;
  readonly limit: number;
  readonly offset?: number;
}

export interface EntityQueryExecutor {
  executeData(plan: CompiledEntityQueryPlan): Promise<readonly Record<string, unknown>[]>;
  executeExactCount(plan: CompiledEntityQueryPlan): Promise<number>;
  executeApproximateCount?(plan: CompiledEntityQueryPlan): Promise<number | undefined>;
}

export interface EntityCountCache {
  get(key: string): Promise<number | undefined>;
  set(key: string, value: number): Promise<void>;
}

export interface EntityListResultCache {
  get(key: string): Promise<EntityListResult | undefined>;
  set(key: string, value: EntityListResult, ttlSeconds?: number): Promise<void>;
}

export interface EntityListResult {
  readonly data: readonly Record<string, unknown>[];
  readonly pagination: {
    readonly page_size: number;
    readonly has_more: boolean;
    readonly next_cursor?: string;
    readonly total?: number;
    readonly count_mode: EntityCountMode;
  };
}

export type EntityQueryResultCacheState = "hit" | "miss" | "bypass";

export interface EntityListExecutionResult {
  readonly result: EntityListResult;
  readonly cacheState: EntityQueryResultCacheState;
}

export interface EntityDetailResult {
  readonly data: Record<string, unknown> | null;
}

export class EntityQueryValidationError extends Error {
  readonly status = 422;
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "EntityQueryValidationError";
  }
}
