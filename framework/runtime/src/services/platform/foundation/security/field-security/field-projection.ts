/**
 * Field Projection Builder
 *
 * Builds SQL SELECT projections based on field-level security policies.
 * Pushes field filtering down to the database query level for performance and security.
 */

import type { FieldAccessService } from "./field-access.service.js";
import type { FieldAccessContext, MaskStrategy, SubjectSnapshot } from "./types.js";
import type { Logger } from "../../../../../kernel/logger.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Field with its access decision
 */
export interface ProjectedField {
  /** Original field name */
  field: string;

  /** SQL column name (may differ for computed fields) */
  column: string;

  /** Table alias (for joins) */
  tableAlias?: string;

  /** Whether field is allowed */
  allowed: boolean;

  /** Masking strategy (if allowed but masked) */
  maskStrategy?: MaskStrategy;

  /** SQL expression for masked value */
  maskExpression?: string;
}

/**
 * Projection result for a single entity
 */
export interface EntityProjection {
  /** Entity ID */
  entityId: string;

  /** Table alias in query */
  tableAlias: string;

  /** Fields to select */
  fields: ProjectedField[];

  /** SQL column list (ready to use in SELECT) */
  selectColumns: string[];

  /** Whether any fields are masked */
  hasMasking: boolean;

  /** Fields that were denied */
  deniedFields: string[];
}

/**
 * Full projection for a query (including joins)
 */
export interface QueryProjection {
  /** Main entity projection */
  main: EntityProjection;

  /** Joined entity projections */
  joins: EntityProjection[];

  /** Combined SQL SELECT clause */
  selectClause: string;

  /** Total fields allowed */
  totalAllowed: number;

  /** Total fields denied */
  totalDenied: number;
}

/**
 * Options for building projection
 */
export interface ProjectionOptions {
  /** Fields requested (if empty, allow all accessible fields) */
  requestedFields?: string[];

  /** Fields to always include (bypass security) */
  forceInclude?: string[];

  /** Fields to always exclude */
  forceExclude?: string[];

  /** Include audit fields (createdAt, updatedAt, etc.) */
  includeAuditFields?: boolean;

  /** Apply masking in SQL (true) or return mask strategy for app-level masking (false) */
  applyMaskingInSql?: boolean;
}

// ============================================================================
// Field Projection Builder
// ============================================================================

/**
 * Builds field projections for SQL queries based on security policies.
 */
export class FieldProjectionBuilder {
  constructor(
    private fieldAccessService: FieldAccessService,
    private logger: Logger
  ) {}

  /**
   * Build projection for a single entity
   */
  async buildEntityProjection(
    entityId: string,
    availableFields: string[],
    subject: SubjectSnapshot,
    context: FieldAccessContext,
    tableAlias: string = "t",
    options: ProjectionOptions = {}
  ): Promise<EntityProjection> {
    const {
      requestedFields,
      forceInclude = [],
      forceExclude = [],
      includeAuditFields = true,
      applyMaskingInSql = false,
    } = options;

    // Determine which fields to check
    let fieldsToCheck = requestedFields?.length
      ? requestedFields.filter((f) => availableFields.includes(f))
      : availableFields;

    // Add audit fields if requested
    if (includeAuditFields) {
      const auditFields = ["id", "created_at", "updated_at", "created_by", "updated_by"];
      for (const af of auditFields) {
        if (availableFields.includes(af) && !fieldsToCheck.includes(af)) {
          fieldsToCheck.push(af);
        }
      }
    }

    // Add force-included fields
    for (const field of forceInclude) {
      if (availableFields.includes(field) && !fieldsToCheck.includes(field)) {
        fieldsToCheck.push(field);
      }
    }

    // Remove force-excluded fields
    fieldsToCheck = fieldsToCheck.filter((f) => !forceExclude.includes(f));

    // Check access for each field
    const projectedFields: ProjectedField[] = [];
    const deniedFields: string[] = [];
    let hasMasking = false;

    for (const field of fieldsToCheck) {
      const decision = await this.fieldAccessService.canRead(
        entityId,
        field,
        subject,
        context
      );

      if (!decision.allowed) {
        deniedFields.push(field);
        projectedFields.push({
          field,
          column: field,
          tableAlias,
          allowed: false,
        });
        continue;
      }

      // Field is allowed
      const projected: ProjectedField = {
        field,
        column: field,
        tableAlias,
        allowed: true,
      };

      // Handle masking
      if (decision.maskStrategy) {
        hasMasking = true;
        projected.maskStrategy = decision.maskStrategy;

        if (applyMaskingInSql) {
          projected.maskExpression = this.buildMaskExpression(
            tableAlias,
            field,
            decision.maskStrategy,
            decision.maskConfig as unknown as Record<string, unknown> | undefined
          );
        }
      }

      projectedFields.push(projected);
    }

    // Build SELECT columns
    const selectColumns = projectedFields
      .filter((f) => f.allowed)
      .map((f) => {
        if (f.maskExpression) {
          return `${f.maskExpression} AS "${f.field}"`;
        }
        return `"${f.tableAlias}"."${f.column}"`;
      });

    return {
      entityId,
      tableAlias,
      fields: projectedFields,
      selectColumns,
      hasMasking,
      deniedFields,
    };
  }

  /**
   * Build projection for a query with joins
   */
  async buildQueryProjection(
    mainEntity: {
      entityId: string;
      availableFields: string[];
      tableAlias?: string;
    },
    joinedEntities: Array<{
      entityId: string;
      availableFields: string[];
      tableAlias: string;
    }>,
    subject: SubjectSnapshot,
    context: FieldAccessContext,
    options: ProjectionOptions = {}
  ): Promise<QueryProjection> {
    // Build main entity projection
    const main = await this.buildEntityProjection(
      mainEntity.entityId,
      mainEntity.availableFields,
      subject,
      context,
      mainEntity.tableAlias ?? "t",
      options
    );

    // Build joined entity projections
    const joins: EntityProjection[] = [];
    for (const joined of joinedEntities) {
      const projection = await this.buildEntityProjection(
        joined.entityId,
        joined.availableFields,
        subject,
        context,
        joined.tableAlias,
        options
      );
      joins.push(projection);
    }

    // Combine SELECT columns
    const allSelectColumns = [
      ...main.selectColumns,
      ...joins.flatMap((j) => j.selectColumns),
    ];

    // Calculate totals
    const totalAllowed =
      main.fields.filter((f) => f.allowed).length +
      joins.reduce((sum, j) => sum + j.fields.filter((f) => f.allowed).length, 0);

    const totalDenied =
      main.deniedFields.length +
      joins.reduce((sum, j) => sum + j.deniedFields.length, 0);

    return {
      main,
      joins,
      selectClause: allSelectColumns.join(", "),
      totalAllowed,
      totalDenied,
    };
  }

  /**
   * Build SQL expression for masking a field
   */
  private buildMaskExpression(
    tableAlias: string,
    field: string,
    strategy: MaskStrategy,
    config?: Record<string, unknown>
  ): string {
    const column = `"${tableAlias}"."${field}"`;

    switch (strategy) {
      case "null":
        return "NULL";

      case "remove":
        // Field should be excluded entirely
        return "NULL";

      case "redact": {
        const replacement = (config?.replacement as string) ?? "[REDACTED]";
        return `'${replacement.replace(/'/g, "''")}'`;
      }

      case "hash": {
        // PostgreSQL: encode(sha256(field::bytea), 'hex')
        // Use LEFT to truncate to desired length
        const hashLength = (config?.hashLength as number) ?? 16;
        return `LEFT(encode(sha256(COALESCE(${column}::text, '')::bytea), 'hex'), ${hashLength})`;
      }

      case "partial": {
        const visibleChars = (config?.visibleChars as number) ?? 4;
        const position = (config?.position as string) ?? "end";
        const maskChar = (config?.maskChar as string) ?? "*";

        // PostgreSQL expression for partial masking
        if (position === "start") {
          // Show first N chars: LEFT(col, N) || REPEAT('*', GREATEST(LENGTH(col) - N, 0))
          return `CASE WHEN ${column} IS NULL THEN NULL
                  WHEN LENGTH(${column}::text) <= ${visibleChars} THEN REPEAT('${maskChar}', LENGTH(${column}::text))
                  ELSE LEFT(${column}::text, ${visibleChars}) || REPEAT('${maskChar}', LENGTH(${column}::text) - ${visibleChars})
                  END`;
        } else {
          // Show last N chars: REPEAT('*', GREATEST(LENGTH(col) - N, 0)) || RIGHT(col, N)
          return `CASE WHEN ${column} IS NULL THEN NULL
                  WHEN LENGTH(${column}::text) <= ${visibleChars} THEN REPEAT('${maskChar}', LENGTH(${column}::text))
                  ELSE REPEAT('${maskChar}', LENGTH(${column}::text) - ${visibleChars}) || RIGHT(${column}::text, ${visibleChars})
                  END`;
        }
      }

      default:
        return column;
    }
  }

  /**
   * Get list of allowed column names for a SELECT query
   * Simple helper for common use case
   */
  async getAllowedColumns(
    entityId: string,
    availableFields: string[],
    subject: SubjectSnapshot,
    tenantId: string
  ): Promise<string[]> {
    const allowed: string[] = [];

    for (const field of availableFields) {
      const decision = await this.fieldAccessService.canRead(entityId, field, subject, { tenantId });
      if (decision.allowed) {
        allowed.push(field);
      }
    }

    return allowed;
  }

  /**
   * Check if any fields require masking
   * Useful for deciding whether to use SQL masking or app-level masking
   */
  async hasMaskedFields(
    entityId: string,
    fields: string[],
    subject: SubjectSnapshot,
    tenantId: string
  ): Promise<boolean> {
    for (const field of fields) {
      const decision = await this.fieldAccessService.canRead(entityId, field, subject, { tenantId });
      if (decision.allowed && decision.maskStrategy) {
        return true;
      }
    }
    return false;
  }
}

// ============================================================================
// Kysely Integration Helper
// ============================================================================

/**
 * Apply field projection to a Kysely SelectQueryBuilder.
 * This is a helper function for integrating with Kysely queries.
 *
 * Usage:
 * ```typescript
 * const projection = await projectionBuilder.buildEntityProjection(...);
 *
 * let query = db.selectFrom('users as t');
 * query = applyProjectionToQuery(query, projection);
 * ```
 */
export function buildProjectedSelectExpression(projection: EntityProjection): string {
  if (projection.selectColumns.length === 0) {
    // If no columns allowed, select NULL to avoid syntax error
    return "NULL as _no_access";
  }
  return projection.selectColumns.join(", ");
}

/**
 * Build a safe column list from projection (for use in raw SQL)
 */
export function buildSafeColumnList(projection: EntityProjection): string[] {
  return projection.fields
    .filter((f) => f.allowed)
    .map((f) => {
      if (f.maskExpression) {
        return f.maskExpression;
      }
      return `"${f.tableAlias ?? "t"}"."${f.column}"`;
    });
}
