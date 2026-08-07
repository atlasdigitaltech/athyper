// server/packages/adapters/database/core/src/query-helpers.ts
import { sql } from "kysely";
import type { ReferenceExpression, SelectQueryBuilder } from "kysely";

/**
 * Supported filter operators for query building
 */
export type FilterOperator =
  | "eq" // equals
  | "ne" // not equals
  | "gt" // greater than
  | "gte" // greater than or equal
  | "lt" // less than
  | "lte" // less than or equal
  | "like" // SQL LIKE (case-sensitive)
  | "ilike" // SQL ILIKE (case-insensitive)
  | "in" // IN array
  | "nin" // NOT IN array
  | "null" // IS NULL
  | "nnull"; // IS NOT NULL

/**
 * Filter condition for a single field
 */
export type FilterCondition = {
  field: string;
  operator: FilterOperator;
  value?: any;
};

/**
 * Sort direction
 */
export type SortDirection = "asc" | "desc";

/**
 * Sort condition
 */
export type SortCondition = {
  field: string;
  direction: SortDirection;
};

/**
 * Pagination parameters
 */
export type PaginationParams = {
  /**
   * Page number (1-indexed)
   * @default 1
   */
  page?: number;

  /**
   * Items per page
   * @default 20
   */
  limit?: number;
};

/**
 * List query parameters
 */
export type ListQueryParams = {
  /**
   * Filter conditions (AND logic)
   */
  filters?: FilterCondition[];

  /**
   * Sort conditions (applied in order)
   */
  sort?: SortCondition[];

  /**
   * Pagination parameters
   */
  pagination?: PaginationParams;
};

/**
 * Paginated list result
 */
export type PaginatedResult<T> = {
  /**
   * Items on current page
   */
  items: T[];

  /**
   * Pagination metadata
   */
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

/**
 * Whitelist of allowed fields for filtering/sorting.
 * This prevents SQL injection and ensures only valid columns are accessed.
 */
export type FieldWhitelist = Set<string>;

export function parseQueryInt(
  raw: unknown,
  defaultVal: number,
  min: number,
  max: number,
): number {
  const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  const fallback = Number.isFinite(defaultVal) ? defaultVal : min;
  const n = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * Builds a Kysely list query with filtering, sorting, and pagination.
 *
 * This is a meta-driven query builder that safely applies filters,
 * sorting, and pagination based on runtime parameters.
 *
 * Example:
 * ```typescript
 * const whitelist = new Set(['code', 'name', 'status', 'created_at']);
 *
 * const result = await buildKyselyListQuery(
 *   db.kysely.selectFrom('tenant').selectAll(),
 *   {
 *     filters: [
 *       { field: 'status', operator: 'eq', value: 'active' },
 *       { field: 'name', operator: 'like', value: '%acme%' },
 *     ],
 *     sort: [{ field: 'created_at', direction: 'desc' }],
 *     pagination: { page: 1, limit: 20 },
 *   },
 *   whitelist
 * );
 * ```
 */
export async function buildKyselyListQuery<DB, TB extends keyof DB & string, O>(
  baseQuery: SelectQueryBuilder<DB, TB, O>,
  params: ListQueryParams,
  fieldWhitelist: FieldWhitelist,
): Promise<PaginatedResult<O>> {
  const { filters = [], sort = [], pagination = {} } = params;
  const { page = 1, limit = 20 } = pagination;

  // Validate pagination. Math.max/min propagate NaN, so normalize first.
  const safeLimit = parseQueryInt(limit, 20, 1, 100); // Max 100 items per page
  const safePage = parseQueryInt(
    page,
    1,
    1,
    Math.floor(Number.MAX_SAFE_INTEGER / safeLimit),
  );
  const offset = (safePage - 1) * safeLimit;

  // Start with base query
  let query = baseQuery;

  // Apply filters
  for (const filter of filters) {
    // Validate field is in whitelist
    if (!fieldWhitelist.has(filter.field)) {
      throw new Error(`Invalid filter field: ${filter.field}`);
    }

    // Cast field to valid reference type (with type assertion)
    const field = filter.field as ReferenceExpression<DB, TB>;

    // Apply operator
    switch (filter.operator) {
      case "eq":
        query = query.where(field, "=", filter.value);
        break;
      case "ne":
        query = query.where(field, "!=", filter.value);
        break;
      case "gt":
        query = query.where(field, ">", filter.value);
        break;
      case "gte":
        query = query.where(field, ">=", filter.value);
        break;
      case "lt":
        query = query.where(field, "<", filter.value);
        break;
      case "lte":
        query = query.where(field, "<=", filter.value);
        break;
      case "like":
        query = query.where(field, "like", filter.value);
        break;
      case "ilike":
        query = query.where(field, "ilike", filter.value);
        break;
      case "in":
        if (!Array.isArray(filter.value)) {
          throw new Error(`IN operator requires array value`);
        }
        query = query.where(field, "in", filter.value);
        break;
      case "nin":
        if (!Array.isArray(filter.value)) {
          throw new Error(`NIN operator requires array value`);
        }
        query = query.where(field, "not in", filter.value);
        break;
      case "null":
        query = query.where(field, "is", null);
        break;
      case "nnull":
        query = query.where(field, "is not", null);
        break;
      default:
        throw new Error(`Unsupported operator: ${filter.operator}`);
    }
  }

  // Apply sorting
  for (const sortCondition of sort) {
    // Validate field is in whitelist
    if (!fieldWhitelist.has(sortCondition.field)) {
      throw new Error(`Invalid sort field: ${sortCondition.field}`);
    }

    // Cast field to valid reference type
    const field = sortCondition.field as ReferenceExpression<DB, TB>;

    if (sortCondition.direction === "asc") {
      query = query.orderBy(field, "asc");
    } else {
      query = query.orderBy(field, "desc");
    }
  }

  // Get total count (before pagination)
  const countQuery = query
    .clearSelect()
    .select((eb) => eb.fn.countAll().as("count"));
  const countResult = (await countQuery.executeTakeFirst()) as any;
  const total = Number(countResult?.count ?? 0);

  // Apply pagination
  query = query.limit(safeLimit).offset(offset);

  // Execute query
  const items = await query.execute();

  // Calculate pagination metadata
  const totalPages = Math.ceil(total / safeLimit);

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    },
  };
}

/**
 * Create a field whitelist from an array of field names.
 *
 * Example:
 * ```typescript
 * const whitelist = createFieldWhitelist(['code', 'name', 'status', 'created_at']);
 * ```
 */
export function createFieldWhitelist(fields: string[]): FieldWhitelist {
  return new Set(fields);
}

/**
 * MetaField definition (from meta module)
 * Used to generate field whitelists automatically from metadata.
 */
export type MetaFieldMapping = {
  /**
   * Metadata field name (e.g., "tenantCode")
   */
  metaFieldName: string;

  /**
   * Database column name (e.g., "code")
   */
  dbColumnName: string;

  /**
   * Allowed operators for this field
   */
  allowedOperators: FilterOperator[];
};

/**
 * Create a field whitelist from MetaField definitions.
 *
 * This bridges the metadata system with the database query layer.
 *
 * Example:
 * ```typescript
 * const mappings: MetaFieldMapping[] = [
 *   { metaFieldName: 'tenantCode', dbColumnName: 'code', allowedOperators: ['eq', 'like'] },
 *   { metaFieldName: 'tenantName', dbColumnName: 'name', allowedOperators: ['eq', 'like'] },
 *   { metaFieldName: 'status', dbColumnName: 'status', allowedOperators: ['eq', 'in'] },
 * ];
 *
 * const whitelist = createFieldWhitelistFromMeta(mappings);
 * ```
 */
export function createFieldWhitelistFromMeta(
  mappings: MetaFieldMapping[],
): FieldWhitelist {
  return new Set(mappings.map((m) => m.dbColumnName));
}

// ─── RBAC scope helpers ───────────────────────────────────────────────────────

/**
 * Restricts a Kysely query to only rows accessible by the session's company scope.
 *
 * `ccCodeRef` must point to a `company_code.code` column that the calling query
 * already exposes (typically via `JOIN master.company_code AS cc`).
 *
 * - `scope.all = true`           → no filter (tenant-wide access)
 * - `scope.company_codes` empty  → `WHERE false` (no accessible entities)
 * - otherwise                    → `WHERE {ccCodeRef} IN (scope.company_codes)`
 */
export function withCompanyScope<DB, TB extends keyof DB & string, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  scope: { all: boolean; company_codes: string[] },
  ccCodeRef: ReferenceExpression<DB, TB>,
): SelectQueryBuilder<DB, TB, O> {
  if (scope.all) return query;
  if (scope.company_codes.length === 0) {
    // Principal has no accessible company codes — return empty result set.
    return query.where(sql<boolean>`false`);
  }
  return query.where(ccCodeRef, "in", scope.company_codes);
}

/**
 * Restricts a Kysely query to only rows visible under the session's row-level scope.
 *
 * `createdByRef` must point to the `created_by` UUID column on the primary table.
 *
 * - `visibility = 'all'`  → no filter (see all rows regardless of creator)
 * - `visibility = 'team'` → `WHERE {createdByRef} IN (principalId, ...teamMemberIds)`
 * - `visibility = 'own'`  → `WHERE {createdByRef} = principalId`
 *
 * When `visibility = 'team'`, pass `teamMemberIds` (the resolved list of principal
 * UUIDs on the same team). Falls back to 'own' behaviour when the list is absent
 * or empty — conservative by design.
 */
export function withVisibilityScope<DB, TB extends keyof DB & string, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  scope: { visibility: "all" | "own" | "team" },
  createdByRef: ReferenceExpression<DB, TB>,
  principalId: string,
  teamMemberIds?: string[],
): SelectQueryBuilder<DB, TB, O> {
  if (scope.visibility === "all") return query;
  if (scope.visibility === "team" && teamMemberIds && teamMemberIds.length > 0) {
    const ids = Array.from(new Set([principalId, ...teamMemberIds]));
    return query.where(createdByRef, "in", ids);
  }
  // 'own' or team fallback when no team members are resolved
  return query.where(createdByRef, "=", principalId);
}
