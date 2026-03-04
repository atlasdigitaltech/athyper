/**
 * Query Validator Service
 *
 * Enforces strict query safety rules to prevent:
 * - Expensive queries (too many filters, sorts, etc.)
 * - SQL injection (unknown fields, client-controlled table names)
 * - Type mismatches (invalid operators for field types)
 * - Resource exhaustion (unbounded page sizes)
 *
 * Phase 15.1: Strict query safety
 */

import type {
  CompiledField,
  CompiledModel,
  FieldType,
} from "@athyper/core/meta";

/**
 * Query safety limits
 * These can be configured per environment
 */
export type QuerySafetyLimits = {
  /** Maximum number of filters in a single query */
  maxFilters: number;

  /** Maximum page size for pagination */
  maxPageSize: number;

  /** Default page size if not specified */
  defaultPageSize: number;

  /** Maximum number of sort fields */
  maxSortFields: number;

  /** Maximum depth of nested filters (AND/OR) */
  maxFilterDepth: number;
};

/**
 * Default safety limits
 */
export const DEFAULT_QUERY_LIMITS: QuerySafetyLimits = {
  maxFilters: 20,
  maxPageSize: 1000,
  defaultPageSize: 50,
  maxSortFields: 5,
  maxFilterDepth: 3,
};

/**
 * Filter operator type
 */
export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "is_null"
  | "is_not_null";

/**
 * Query filter
 */
export type QueryFilter = {
  field: string;
  operator: FilterOperator;
  value?: unknown;
};

/**
 * Sort direction
 */
export type SortDirection = "asc" | "desc";

/**
 * Query sort
 */
export type QuerySort = {
  field: string;
  direction: SortDirection;
};

/**
 * Validated query parameters
 */
export type ValidatedQuery = {
  filters: QueryFilter[];
  sorts: QuerySort[];
  page: number;
  pageSize: number;
};

/**
 * Query validation error
 */
export class QueryValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "QueryValidationError";
  }
}

/**
 * Query Validator Service
 *
 * Validates all query parameters against compiled model and safety limits
 */
export class QueryValidatorService {
  constructor(
    private readonly limits: QuerySafetyLimits = DEFAULT_QUERY_LIMITS,
  ) {}

  /**
   * Validate complete query
   * Throws QueryValidationError if invalid
   */
  validateQuery(
    model: CompiledModel,
    query: {
      filters?: QueryFilter[];
      sorts?: QuerySort[];
      page?: number;
      pageSize?: number;
    },
  ): ValidatedQuery {
    // Validate filters
    const filters = query.filters || [];
    this.validateFilters(model, filters);

    // Validate sorts
    const sorts = query.sorts || [];
    this.validateSorts(model, sorts);

    // Validate pagination
    const page = this.validatePage(query.page);
    const pageSize = this.validatePageSize(query.pageSize);

    return { filters, sorts, page, pageSize };
  }

  /**
   * Validate filters array
   */
  private validateFilters(model: CompiledModel, filters: QueryFilter[]): void {
    // Check max filters limit
    if (filters.length > this.limits.maxFilters) {
      throw new QueryValidationError(
        `Too many filters: ${filters.length} (max: ${this.limits.maxFilters})`,
        "MAX_FILTERS_EXCEEDED",
        { count: filters.length, max: this.limits.maxFilters },
      );
    }

    // Validate each filter
    for (const filter of filters) {
      this.validateFilter(model, filter);
    }
  }

  /**
   * Validate single filter
   */
  private validateFilter(model: CompiledModel, filter: QueryFilter): void {
    // Reject unknown fields (SQL injection prevention)
    const field = this.getCompiledField(model, filter.field);
    if (!field) {
      throw new QueryValidationError(
        `Unknown field: ${filter.field}`,
        "UNKNOWN_FIELD",
        { field: filter.field, entity: model.entityName },
      );
    }

    // Validate operator is allowed for field type
    this.validateOperatorForFieldType(field, filter.operator);

    // Validate value type matches field type
    if (filter.value !== undefined && filter.value !== null) {
      this.validateValueType(field, filter.value);
    }
  }

  /**
   * Validate sorts array
   */
  private validateSorts(model: CompiledModel, sorts: QuerySort[]): void {
    // Check max sort fields limit
    if (sorts.length > this.limits.maxSortFields) {
      throw new QueryValidationError(
        `Too many sort fields: ${sorts.length} (max: ${this.limits.maxSortFields})`,
        "MAX_SORT_FIELDS_EXCEEDED",
        { count: sorts.length, max: this.limits.maxSortFields },
      );
    }

    // Validate each sort
    for (const sort of sorts) {
      this.validateSort(model, sort);
    }
  }

  /**
   * Validate single sort
   */
  private validateSort(model: CompiledModel, sort: QuerySort): void {
    // Reject unknown fields
    const field = this.getCompiledField(model, sort.field);
    if (!field) {
      throw new QueryValidationError(
        `Unknown sort field: ${sort.field}`,
        "UNKNOWN_FIELD",
        { field: sort.field, entity: model.entityName },
      );
    }

    // Validate sort direction
    if (sort.direction !== "asc" && sort.direction !== "desc") {
      throw new QueryValidationError(
        `Invalid sort direction: ${sort.direction}`,
        "INVALID_SORT_DIRECTION",
        { field: sort.field, direction: sort.direction },
      );
    }
  }

  /**
   * Validate page number
   */
  private validatePage(page?: number): number {
    if (page === undefined || page === null) {
      return 1;
    }

    const pageNum = Number(page);

    if (!Number.isInteger(pageNum) || pageNum < 1) {
      throw new QueryValidationError(
        `Invalid page number: ${page}`,
        "INVALID_PAGE",
        { page },
      );
    }

    return pageNum;
  }

  /**
   * Validate page size
   */
  private validatePageSize(pageSize?: number): number {
    if (pageSize === undefined || pageSize === null) {
      return this.limits.defaultPageSize;
    }

    const size = Number(pageSize);

    if (!Number.isInteger(size) || size < 1) {
      throw new QueryValidationError(
        `Invalid page size: ${pageSize}`,
        "INVALID_PAGE_SIZE",
        { pageSize },
      );
    }

    if (size > this.limits.maxPageSize) {
      throw new QueryValidationError(
        `Page size too large: ${size} (max: ${this.limits.maxPageSize})`,
        "MAX_PAGE_SIZE_EXCEEDED",
        { pageSize: size, max: this.limits.maxPageSize },
      );
    }

    return size;
  }

  /**
   * Get compiled field by name (API field name, not column name)
   * Returns undefined if field doesn't exist
   */
  private getCompiledField(
    model: CompiledModel,
    fieldName: string,
  ): CompiledField | undefined {
    return model.fields.find((f) => f.name === fieldName);
  }

  /**
   * Validate operator is allowed for field type
   */
  private validateOperatorForFieldType(
    field: CompiledField,
    operator: FilterOperator,
  ): void {
    const allowedOps = this.getAllowedOperatorsForFieldType(field.type);

    if (!allowedOps.includes(operator)) {
      throw new QueryValidationError(
        `Operator '${operator}' not allowed for field type '${field.type}'`,
        "INVALID_OPERATOR_FOR_TYPE",
        {
          field: field.name,
          fieldType: field.type,
          operator,
          allowedOperators: allowedOps,
        },
      );
    }
  }

  /**
   * Get allowed operators for a field type
   */
  private getAllowedOperatorsForFieldType(
    fieldType: FieldType,
  ): FilterOperator[] {
    switch (fieldType) {
      case "string":
        return [
          "eq",
          "ne",
          "in",
          "not_in",
          "contains",
          "starts_with",
          "ends_with",
          "is_null",
          "is_not_null",
        ];

      case "number":
        return [
          "eq",
          "ne",
          "gt",
          "gte",
          "lt",
          "lte",
          "in",
          "not_in",
          "is_null",
          "is_not_null",
        ];

      case "boolean":
        return ["eq", "ne", "is_null", "is_not_null"];

      case "date":
      case "datetime":
        return [
          "eq",
          "ne",
          "gt",
          "gte",
          "lt",
          "lte",
          "in",
          "not_in",
          "is_null",
          "is_not_null",
        ];

      case "reference":
        return ["eq", "ne", "in", "not_in", "is_null", "is_not_null"];

      case "enum":
        return ["eq", "ne", "in", "not_in", "is_null", "is_not_null"];

      case "json":
        // JSON fields have limited query support
        return ["is_null", "is_not_null"];

      default:
        // Unknown field types get minimal operators
        return ["eq", "ne", "is_null", "is_not_null"];
    }
  }

  /**
   * Validate value type matches field type
   * Basic runtime type checking
   */
  private validateValueType(field: CompiledField, value: unknown): void {
    // Skip validation for null
    if (value === null || value === undefined) {
      return;
    }

    // Type-specific validation
    switch (field.type) {
      case "string":
      case "enum":
        if (typeof value !== "string" && !Array.isArray(value)) {
          throw new QueryValidationError(
            `Invalid value type for ${field.type} field '${field.name}': expected string`,
            "INVALID_VALUE_TYPE",
            {
              field: field.name,
              fieldType: field.type,
              valueType: typeof value,
            },
          );
        }
        break;

      case "number":
        if (typeof value !== "number" && !Array.isArray(value)) {
          throw new QueryValidationError(
            `Invalid value type for number field '${field.name}': expected number`,
            "INVALID_VALUE_TYPE",
            {
              field: field.name,
              fieldType: field.type,
              valueType: typeof value,
            },
          );
        }
        break;

      case "boolean":
        if (typeof value !== "boolean") {
          throw new QueryValidationError(
            `Invalid value type for boolean field '${field.name}': expected boolean`,
            "INVALID_VALUE_TYPE",
            {
              field: field.name,
              fieldType: field.type,
              valueType: typeof value,
            },
          );
        }
        break;

      case "date":
      case "datetime":
        if (
          typeof value !== "string" &&
          !(value instanceof Date) &&
          !Array.isArray(value)
        ) {
          throw new QueryValidationError(
            `Invalid value type for date field '${field.name}': expected ISO string or Date`,
            "INVALID_VALUE_TYPE",
            {
              field: field.name,
              fieldType: field.type,
              valueType: typeof value,
            },
          );
        }
        break;

      case "reference":
        // References are UUIDs (strings)
        if (typeof value !== "string" && !Array.isArray(value)) {
          throw new QueryValidationError(
            `Invalid value type for reference field '${field.name}': expected UUID string`,
            "INVALID_VALUE_TYPE",
            {
              field: field.name,
              fieldType: field.type,
              valueType: typeof value,
            },
          );
        }
        break;

      // json type values are not validated (any JSON is allowed)
      case "json":
        break;
    }
  }

  /**
   * Validate table name is from compiled model only
   * CRITICAL: Never allow client-controlled table names
   */
  validateTableName(model: CompiledModel, requestedTable?: string): string {
    // If client provided a table name, reject it
    if (requestedTable !== undefined && requestedTable !== model.tableName) {
      throw new QueryValidationError(
        "Table name must not be client-controlled",
        "CLIENT_CONTROLLED_TABLE_NAME",
        {
          requested: requestedTable,
          compiled: model.tableName,
        },
      );
    }

    // Always use compiled table name
    return model.tableName;
  }

  /**
   * Validate schema name is always "ent"
   * CRITICAL: Never allow client-controlled schema names
   */
  validateSchemaName(requestedSchema?: string): string {
    const SAFE_SCHEMA = "ent";

    if (requestedSchema !== undefined && requestedSchema !== SAFE_SCHEMA) {
      throw new QueryValidationError(
        "Schema name must not be client-controlled",
        "CLIENT_CONTROLLED_SCHEMA_NAME",
        {
          requested: requestedSchema,
          safe: SAFE_SCHEMA,
        },
      );
    }

    return SAFE_SCHEMA;
  }

  /**
   * Get safe column name for a field
   * CRITICAL: Always use pre-computed column name from compiled model
   */
  getSafeColumnName(model: CompiledModel, fieldName: string): string {
    const field = this.getCompiledField(model, fieldName);

    if (!field) {
      throw new QueryValidationError(
        `Cannot get column name for unknown field: ${fieldName}`,
        "UNKNOWN_FIELD",
        { field: fieldName, entity: model.entityName },
      );
    }

    // Return pre-computed column name (never construct from client input)
    return field.columnName;
  }
}
