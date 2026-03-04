/**
 * Query DSL - Domain Specific Language for Cross-Entity Queries
 *
 * Defines the shape of query requests for the Generic API.
 * Safe, declarative query language that prevents SQL injection.
 */

// ============================================================================
// Core Query Types
// ============================================================================

/**
 * Main query request structure
 */
export interface QueryRequest {
  /** Base entity to query from */
  from: string;

  /** Optional alias for the base entity (default: first letter of entity name) */
  as?: string;

  /** Fields to select (prefixed with alias, e.g., "a.id", "b.name") */
  select: string[];

  /** Join definitions */
  joins?: JoinDefinition[];

  /** Where conditions */
  where?: WhereCondition | WhereGroup;

  /** Order by clauses */
  orderBy?: OrderByClause[];

  /** Maximum rows to return (required, max 1000) */
  limit: number;

  /** Offset for pagination */
  offset?: number;

  /** Include total count in response */
  includeCount?: boolean;

  /** Query options */
  options?: QueryOptions;
}

/**
 * Join definition
 */
export interface JoinDefinition {
  /** Join type */
  type: "inner" | "left";

  /** Entity to join */
  entity: string;

  /** Alias for the joined entity */
  as: string;

  /** Join condition (using aliases, e.g., "a.orderId = b.id") */
  on: string;
}

/**
 * Single where condition
 */
export interface WhereCondition {
  /** Field path (with alias, e.g., "a.status") */
  field: string;

  /** Comparison operator */
  operator: WhereOperator;

  /** Value to compare against */
  value: unknown;
}

/**
 * Group of where conditions (AND/OR)
 */
export interface WhereGroup {
  /** Logical operator */
  logic: "and" | "or";

  /** Conditions in this group */
  conditions: Array<WhereCondition | WhereGroup>;
}

/**
 * Allowed comparison operators
 */
export type WhereOperator =
  | "eq"         // Equal (=)
  | "neq"        // Not equal (!=)
  | "gt"         // Greater than (>)
  | "gte"        // Greater than or equal (>=)
  | "lt"         // Less than (<)
  | "lte"        // Less than or equal (<=)
  | "in"         // In array
  | "nin"        // Not in array
  | "like"       // LIKE pattern (% allowed)
  | "ilike"      // Case-insensitive LIKE
  | "is_null"    // IS NULL
  | "is_not_null" // IS NOT NULL
  | "between";   // BETWEEN (value should be [min, max])

/**
 * Order by clause
 */
export interface OrderByClause {
  /** Field path (with alias) */
  field: string;

  /** Sort direction */
  direction: "asc" | "desc";

  /** Null handling */
  nulls?: "first" | "last";
}

/**
 * Query options
 */
export interface QueryOptions {
  /** Statement timeout in milliseconds (default: 30000, max: 60000) */
  timeout?: number;

  /** Read from replica if available */
  useReplica?: boolean;

  /** Include query explain plan in response (admin only) */
  explain?: boolean;

  /** Distinct rows only */
  distinct?: boolean;
}

// ============================================================================
// Query Response Types
// ============================================================================

/**
 * Query response
 */
export interface QueryResponse<T = Record<string, unknown>> {
  /** Result rows */
  data: T[];

  /** Total count (if requested) */
  totalCount?: number;

  /** Pagination info */
  pagination: {
    offset: number;
    limit: number;
    hasMore: boolean;
  };

  /** Query metadata */
  meta: QueryMetadata;
}

/**
 * Query metadata
 */
export interface QueryMetadata {
  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Number of rows returned */
  rowCount: number;

  /** Entities accessed */
  entitiesAccessed: string[];

  /** Fields returned (after security filtering) */
  fieldsReturned: string[];

  /** Fields denied by security */
  fieldsDenied?: string[];

  /** Query plan (if explain requested) */
  explainPlan?: QueryExplainPlan;

  /** Cache hit */
  cacheHit?: boolean;
}

/**
 * Query explain plan
 */
export interface QueryExplainPlan {
  /** Join graph */
  joinGraph: JoinGraphNode[];

  /** Projected SQL (sanitized, no actual values) */
  projectedSql: string;

  /** Index usage hints */
  indexHints?: string[];

  /** Estimated cost */
  estimatedCost?: number;
}

/**
 * Node in join graph
 */
export interface JoinGraphNode {
  /** Entity name */
  entity: string;

  /** Alias */
  alias: string;

  /** Join type (null for root) */
  joinType?: "inner" | "left";

  /** Parent alias */
  parentAlias?: string;

  /** Join condition */
  joinCondition?: string;

  /** Fields selected from this entity */
  selectedFields: string[];

  /** Fields denied by security */
  deniedFields?: string[];
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Query validation result
 */
export interface QueryValidationResult {
  /** Whether query is valid */
  valid: boolean;

  /** Validation errors */
  errors: QueryValidationError[];

  /** Validation warnings */
  warnings: QueryValidationWarning[];

  /** Normalized query (if valid) */
  normalizedQuery?: QueryRequest;
}

/**
 * Query validation error
 */
export interface QueryValidationError {
  /** Error code */
  code: QueryErrorCode;

  /** Human-readable message */
  message: string;

  /** Path to error location */
  path?: string;

  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Query validation warning
 */
export interface QueryValidationWarning {
  /** Warning code */
  code: string;

  /** Human-readable message */
  message: string;

  /** Path to warning location */
  path?: string;
}

/**
 * Query error codes
 */
export type QueryErrorCode =
  | "UNKNOWN_ENTITY"
  | "UNKNOWN_FIELD"
  | "INVALID_JOIN"
  | "JOIN_NOT_ALLOWED"
  | "MAX_JOINS_EXCEEDED"
  | "MAX_DEPTH_EXCEEDED"
  | "MAX_FIELDS_EXCEEDED"
  | "MAX_LIMIT_EXCEEDED"
  | "INVALID_OPERATOR"
  | "INVALID_VALUE"
  | "INVALID_ALIAS"
  | "DUPLICATE_ALIAS"
  | "SECURITY_DENIED"
  | "TENANT_REQUIRED"
  | "SYNTAX_ERROR";

// ============================================================================
// Guardrail Configuration
// ============================================================================

/**
 * Query guardrails configuration
 */
export interface QueryGuardrails {
  /** Maximum number of joins allowed (default: 3) */
  maxJoins: number;

  /** Maximum join depth (default: 2) */
  maxDepth: number;

  /** Maximum fields in SELECT (default: 50) */
  maxSelectFields: number;

  /** Maximum LIMIT value (default: 1000) */
  maxLimit: number;

  /** Maximum statement timeout in ms (default: 60000) */
  maxTimeout: number;

  /** Default LIMIT if not specified (default: 100) */
  defaultLimit: number;

  /** Default timeout in ms (default: 30000) */
  defaultTimeout: number;

  /** Allowed join types (default: ['inner', 'left']) */
  allowedJoinTypes: Array<"inner" | "left">;

  /** Allowed operators (default: all) */
  allowedOperators?: WhereOperator[];

  /** Require explicit SELECT (no SELECT *) */
  requireExplicitSelect: boolean;

  /** Enable count queries (can be expensive) */
  enableCount: boolean;
}

/**
 * Default guardrails
 */
export const DEFAULT_GUARDRAILS: QueryGuardrails = {
  maxJoins: 3,
  maxDepth: 2,
  maxSelectFields: 50,
  maxLimit: 1000,
  maxTimeout: 60000,
  defaultLimit: 100,
  defaultTimeout: 30000,
  allowedJoinTypes: ["inner", "left"],
  requireExplicitSelect: true,
  enableCount: true,
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if condition is a WhereGroup
 */
export function isWhereGroup(
  condition: WhereCondition | WhereGroup
): condition is WhereGroup {
  return "logic" in condition && "conditions" in condition;
}

/**
 * Check if condition is a WhereCondition
 */
export function isWhereCondition(
  condition: WhereCondition | WhereGroup
): condition is WhereCondition {
  return "field" in condition && "operator" in condition;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse alias and field from qualified field name
 * e.g., "a.name" => { alias: "a", field: "name" }
 */
export function parseQualifiedField(qualified: string): { alias: string; field: string } | null {
  const parts = qualified.split(".");
  if (parts.length !== 2) return null;
  return { alias: parts[0], field: parts[1] };
}

/**
 * Build qualified field name
 */
export function buildQualifiedField(alias: string, field: string): string {
  return `${alias}.${field}`;
}

/**
 * Extract all aliases from a query
 */
export function extractAliases(query: QueryRequest): string[] {
  const aliases: string[] = [];

  // Base entity alias
  aliases.push(query.as ?? query.from.charAt(0).toLowerCase());

  // Join aliases
  if (query.joins) {
    for (const join of query.joins) {
      aliases.push(join.as);
    }
  }

  return aliases;
}

/**
 * Extract all entities from a query
 */
export function extractEntities(query: QueryRequest): string[] {
  const entities: string[] = [query.from];

  if (query.joins) {
    for (const join of query.joins) {
      entities.push(join.entity);
    }
  }

  return entities;
}
