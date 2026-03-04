// framework/adapters/db/src/kysely/query-helpers.ts
import type { ReferenceExpression, SelectQueryBuilder } from "kysely";

/**
 * Supported filter operators for query building
 */
export type FilterOperator =
  | "eq"      // equals
  | "ne"      // not equals
  | "gt"      // greater than
  | "gte"     // greater than or equal
  | "lt"      // less than
  | "lte"     // less than or equal
  | "like"    // SQL LIKE (case-sensitive)
  | "ilike"   // SQL ILIKE (case-insensitive)
  | "in"      // IN array
  | "nin"     // NOT IN array
  | "null"    // IS NULL
  | "nnull";  // IS NOT NULL

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
export async function buildKyselyListQuery<
  DB,
  TB extends keyof DB & string,
  O
>(
  baseQuery: SelectQueryBuilder<DB, TB, O>,
  params: ListQueryParams,
  fieldWhitelist: FieldWhitelist
): Promise<PaginatedResult<O>> {
  const { filters = [], sort = [], pagination = {} } = params;
  const { page = 1, limit = 20 } = pagination;

  // Validate pagination
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(100, limit)); // Max 100 items per page
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
  const countQuery = query.clearSelect().select((eb) => eb.fn.countAll().as("count"));
  const countResult = await countQuery.executeTakeFirst() as any;
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
export function createFieldWhitelistFromMeta(mappings: MetaFieldMapping[]): FieldWhitelist {
  return new Set(mappings.map((m) => m.dbColumnName));
}
