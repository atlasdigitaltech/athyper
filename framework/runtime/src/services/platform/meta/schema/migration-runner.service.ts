/**
 * Migration Runner Service
 *
 * Runs database migrations for entity tables generated from META.
 * Phase 14.2: Migration strategy
 *
 * Key points:
 * - Uses DATABASE_ADMIN_URL for direct Postgres connection (not PgBouncer)
 * - Generates DDL from compiled entity models
 * - Applies migrations to ent schema
 * - Tracks migration history
 */

import { sql } from "kysely";

import type { DB } from "@athyper/adapter-db";
import type {
  DdlGenerator,
  MetaCompiler,
  MetaRegistry,
} from "@athyper/core/meta";
import type { Kysely} from "kysely";

/**
 * Migration runner options
 */
export type MigrationRunnerOptions = {
  /** Direct Postgres connection (not PgBouncer) */
  db: Kysely<DB>;

  /** META registry for discovering entities */
  registry: MetaRegistry;

  /** META compiler for compiling entity schemas */
  compiler: MetaCompiler;

  /** DDL generator for creating table DDL */
  ddlGenerator: DdlGenerator;

  /** Migration mode: "dev" auto-applies, "prod" requires confirmation */
  mode?: "dev" | "prod";
};

/**
 * Migration plan entry
 */
export type MigrationPlanEntry = {
  entityName: string;
  tableName: string;
  action: "create" | "alter" | "skip";
  reason: string;
  ddl?: string;
};

/**
 * Existing column metadata from information_schema
 */
type ExistingColumn = {
  columnName: string;
  dataType: string;
  isNullable: boolean;
};

/**
 * Schema diff between compiled model and existing table
 */
type SchemaDiff = {
  addColumns: Array<{ columnName: string; dataType: string; nullable: boolean }>;
  dropColumns: Array<{ columnName: string }>;
  alterColumns: Array<{ columnName: string; fromType: string; toType: string }>;
};

/**
 * Migration result
 */
export type MigrationResult = {
  success: boolean;
  plan: MigrationPlanEntry[];
  appliedCount: number;
  skippedCount: number;
  errors: string[];
  durationMs: number;
};

/**
 * Migration Runner Service
 *
 * Generates and applies database migrations from META entity definitions.
 */
export class MigrationRunnerService {
  constructor(private readonly options: MigrationRunnerOptions) {}

  /**
   * Generate migration plan
   * Compares current database state with META entities
   * Returns list of migrations to apply
   */
  async generatePlan(tenantId: string): Promise<MigrationPlanEntry[]> {
    const startTime = performance.now();
    const plan: MigrationPlanEntry[] = [];

    try {
      // Get all entities from registry
      const entitiesResponse = await this.options.registry.listEntities();
      const entities = entitiesResponse.data;

      console.log(
        JSON.stringify({
          msg: "migration_plan_start",
          entityCount: entities.length,
          tenantId,
        })
      );

      for (const entity of entities) {
        try {
          // Get active version
          const activeVersion = await this.options.registry.getActiveVersion(
            entity.name
          );

          if (!activeVersion) {
            plan.push({
              entityName: entity.name,
              tableName: `ent_${entity.name.toLowerCase()}`,
              action: "skip",
              reason: "No active version",
            });
            continue;
          }

          // Compile entity model
          const compiled = await this.options.compiler.compile(
            entity.name,
            activeVersion.version
          );

          // Check if table exists
          const tableExists = await this.checkTableExists(compiled.tableName);

          if (tableExists) {
            // Check for ALTER migrations (new/changed columns)
            const existingColumns = await this.getExistingColumns(compiled.tableName);
            const diff = this.computeSchemaDiff(compiled, existingColumns);

            if (diff.addColumns.length > 0 || diff.dropColumns.length > 0 || diff.alterColumns.length > 0) {
              const alterDdl = this.generateAlterDdl(compiled.tableName, diff);
              plan.push({
                entityName: entity.name,
                tableName: compiled.tableName,
                action: "alter",
                reason: `Schema changes: +${diff.addColumns.length} columns, -${diff.dropColumns.length} columns, ~${diff.alterColumns.length} type changes`,
                ddl: alterDdl,
              });
            } else {
              plan.push({
                entityName: entity.name,
                tableName: compiled.tableName,
                action: "skip",
                reason: "Table up to date",
              });
            }
          } else {
            // Generate DDL
            const ddlResult = this.options.ddlGenerator.generateDdl(compiled, {
              schemaName: "ent",
              ifNotExists: true,
              includeIndexes: true,
              includeComments: false,
            });

            plan.push({
              entityName: entity.name,
              tableName: compiled.tableName,
              action: "create",
              reason: "Table does not exist",
              ddl: ddlResult.fullSql,
            });
          }
        } catch (error) {
          console.error(
            JSON.stringify({
              msg: "migration_plan_entity_error",
              entityName: entity.name,
              error: String(error),
            })
          );

          plan.push({
            entityName: entity.name,
            tableName: `ent_${entity.name.toLowerCase()}`,
            action: "skip",
            reason: `Error: ${String(error)}`,
          });
        }
      }

      const duration = performance.now() - startTime;

      console.log(
        JSON.stringify({
          msg: "migration_plan_complete",
          planCount: plan.length,
          createCount: plan.filter((p) => p.action === "create").length,
          skipCount: plan.filter((p) => p.action === "skip").length,
          durationMs: duration,
        })
      );

      return plan;
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "migration_plan_error",
          error: String(error),
        })
      );
      throw error;
    }
  }

  /**
   * Apply migration plan
   * Executes DDL statements from migration plan
   */
  async applyPlan(plan: MigrationPlanEntry[]): Promise<MigrationResult> {
    const startTime = performance.now();
    const errors: string[] = [];
    let appliedCount = 0;
    let skippedCount = 0;

    console.log(
      JSON.stringify({
        msg: "migration_apply_start",
        planCount: plan.length,
        mode: this.options.mode ?? "prod",
      })
    );

    // Ensure ent schema exists
    try {
      await this.options.db.schema.createSchema("ent").ifNotExists().execute();
      console.log(JSON.stringify({ msg: "migration_schema_created", schema: "ent" }));
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "migration_schema_error",
          error: String(error),
        })
      );
      errors.push(`Schema creation failed: ${String(error)}`);
    }

    // Apply migrations
    for (const entry of plan) {
      if (entry.action === "skip") {
        skippedCount++;
        continue;
      }

      if (!entry.ddl) {
        console.warn(
          JSON.stringify({
            msg: "migration_entry_no_ddl",
            entityName: entry.entityName,
          })
        );
        skippedCount++;
        continue;
      }

      const ddlHash = this.hashDdl(entry.ddl);

      try {
        console.log(
          JSON.stringify({
            msg: "migration_apply_entry",
            entityName: entry.entityName,
            tableName: entry.tableName,
            action: entry.action,
          })
        );

        // Execute DDL (CREATE TABLE, ALTER TABLE, or indexes)
        await sql.raw(entry.ddl).execute(this.options.db);

        appliedCount++;

        // Record success in migration history
        await this.recordMigrationHistory(entry, ddlHash, "applied");

        console.log(
          JSON.stringify({
            msg: "migration_entry_applied",
            entityName: entry.entityName,
            tableName: entry.tableName,
            action: entry.action,
          })
        );
      } catch (error) {
        const errorMsg = `Failed to apply ${entry.action} migration for ${entry.entityName}: ${String(error)}`;
        console.error(
          JSON.stringify({
            msg: "migration_entry_error",
            entityName: entry.entityName,
            action: entry.action,
            error: String(error),
          })
        );
        errors.push(errorMsg);

        // Record failure in migration history
        await this.recordMigrationHistory(entry, ddlHash, "failed", String(error));
      }
    }

    const duration = performance.now() - startTime;
    const success = errors.length === 0;

    const result: MigrationResult = {
      success,
      plan,
      appliedCount,
      skippedCount,
      errors,
      durationMs: duration,
    };

    console.log(
      JSON.stringify({
        msg: "migration_apply_complete",
        success,
        appliedCount,
        skippedCount,
        errorCount: errors.length,
        durationMs: duration,
      })
    );

    return result;
  }

  /**
   * Run migrations (generate plan + apply)
   * Main entry point for migration workflow
   */
  async runMigrations(tenantId: string): Promise<MigrationResult> {
    console.log(
      JSON.stringify({
        msg: "migration_run_start",
        tenantId,
        mode: this.options.mode ?? "prod",
      })
    );

    const plan = await this.generatePlan(tenantId);
    const result = await this.applyPlan(plan);

    console.log(
      JSON.stringify({
        msg: "migration_run_complete",
        success: result.success,
        appliedCount: result.appliedCount,
      })
    );

    return result;
  }

  /**
   * Check if table exists in database
   */
  private async checkTableExists(tableName: string): Promise<boolean> {
    try {
      const result = await sql<{ exists: boolean }>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'ent'
          AND table_name = ${tableName}
        ) as exists
      `.execute(this.options.db);

      return result.rows[0]?.exists ?? false;
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "check_table_exists_error",
          tableName,
          error: String(error),
        })
      );
      return false;
    }
  }

  /**
   * Print migration plan (for review)
   */
  printPlan(plan: MigrationPlanEntry[]): string {
    const lines: string[] = [];

    lines.push("=".repeat(80));
    lines.push("META Migration Plan");
    lines.push("=".repeat(80));
    lines.push("");

    const createEntries = plan.filter((p) => p.action === "create");
    const alterEntries = plan.filter((p) => p.action === "alter");
    const skipEntries = plan.filter((p) => p.action === "skip");

    lines.push(`Total: ${plan.length} entities`);
    lines.push(`  To Create: ${createEntries.length}`);
    lines.push(`  To Alter: ${alterEntries.length}`);
    lines.push(`  To Skip: ${skipEntries.length}`);
    lines.push("");

    if (createEntries.length > 0) {
      lines.push("Tables to Create:");
      lines.push("-".repeat(80));
      for (const entry of createEntries) {
        lines.push(`  - ${entry.tableName} (${entry.entityName})`);
      }
      lines.push("");
    }

    if (skipEntries.length > 0) {
      lines.push("Tables to Skip:");
      lines.push("-".repeat(80));
      for (const entry of skipEntries) {
        lines.push(`  - ${entry.tableName}: ${entry.reason}`);
      }
      lines.push("");
    }

    lines.push("=".repeat(80));

    return lines.join("\n");
  }

  /**
   * Generate SQL script from migration plan
   * For manual review and application
   */
  generateSqlScript(plan: MigrationPlanEntry[]): string {
    const lines: string[] = [];

    lines.push("-- META Entity Tables Migration");
    lines.push(`-- Generated at: ${new Date().toISOString()}`);
    lines.push("-- Schema: ent");
    lines.push("");

    // Create schema
    lines.push("CREATE SCHEMA IF NOT EXISTS ent;");
    lines.push("");

    // Add DDL for each table to create or alter
    const createEntries = plan.filter((p) => (p.action === "create" || p.action === "alter") && p.ddl);

    for (const entry of createEntries) {
      lines.push(`-- Table: ${entry.tableName} (entity: ${entry.entityName})`);
      lines.push(entry.ddl!);
      lines.push("");
    }

    return lines.join("\n");
  }

  // ============================================================================
  // Column Introspection & ALTER Support
  // ============================================================================

  /**
   * Get existing columns for a table from information_schema
   */
  private async getExistingColumns(tableName: string): Promise<Map<string, ExistingColumn>> {
    const columns = new Map<string, ExistingColumn>();

    try {
      const result = await sql<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'ent'
        AND table_name = ${tableName}
        ORDER BY ordinal_position
      `.execute(this.options.db);

      for (const row of result.rows) {
        columns.set(row.column_name, {
          columnName: row.column_name,
          dataType: row.data_type,
          isNullable: row.is_nullable === "YES",
        });
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "get_existing_columns_error",
          tableName,
          error: String(error),
        })
      );
    }

    return columns;
  }

  /**
   * Compute schema diff between compiled model and existing table columns
   */
  private computeSchemaDiff(
    compiled: { fields: Array<{ columnName: string; type: string; required?: boolean }> },
    existingColumns: Map<string, ExistingColumn>
  ): SchemaDiff {
    const diff: SchemaDiff = {
      addColumns: [],
      dropColumns: [],
      alterColumns: [],
    };

    // System columns that should never be altered by the migration runner
    const systemColumns = new Set([
      "id", "tenant_id", "realm_id", "created_at", "created_by",
      "updated_at", "updated_by", "deleted_at", "deleted_by", "version",
      "entity_type_code", "status", "source_system", "metadata",
      "document_number", "posting_date", "effective_from", "effective_to",
    ]);

    // Check for new fields that need columns
    for (const field of compiled.fields) {
      if (systemColumns.has(field.columnName)) continue;

      if (!existingColumns.has(field.columnName)) {
        diff.addColumns.push({
          columnName: field.columnName,
          dataType: this.mapFieldTypeToPostgres(field.type),
          nullable: !field.required,
        });
      }
    }

    // Check for columns that exist in DB but not in compiled model (candidate for drop)
    const compiledColumnNames = new Set(compiled.fields.map((f) => f.columnName));
    for (const [colName] of existingColumns) {
      if (systemColumns.has(colName)) continue;
      if (!compiledColumnNames.has(colName)) {
        diff.dropColumns.push({ columnName: colName });
      }
    }

    return diff;
  }

  /**
   * Map field type to PostgreSQL type (simplified, mirrors DDL generator)
   */
  private mapFieldTypeToPostgres(fieldType: string): string {
    switch (fieldType) {
      case "string": return "TEXT";
      case "number": case "decimal": return "NUMERIC";
      case "boolean": return "BOOLEAN";
      case "date": case "datetime": return "TIMESTAMPTZ";
      case "reference": case "uuid": return "UUID";
      case "enum": return "TEXT";
      case "json": return "JSONB";
      case "rich_text": return "TEXT";
      default: return "JSONB";
    }
  }

  /**
   * Generate ALTER TABLE DDL from a schema diff
   */
  private generateAlterDdl(tableName: string, diff: SchemaDiff): string {
    const qualifiedTable = `ent.${tableName}`;
    const statements: string[] = [];

    statements.push(`-- ALTER TABLE migration for ${qualifiedTable}`);
    statements.push(`-- Generated at: ${new Date().toISOString()}`);
    statements.push("");

    // ADD COLUMN statements
    for (const col of diff.addColumns) {
      const nullable = col.nullable ? "" : " NOT NULL";
      statements.push(
        `ALTER TABLE ${qualifiedTable} ADD COLUMN IF NOT EXISTS ${col.columnName} ${col.dataType}${nullable};`
      );
    }

    // DROP COLUMN — rename to _deprecated_ for safety
    for (const col of diff.dropColumns) {
      statements.push(
        `ALTER TABLE ${qualifiedTable} RENAME COLUMN ${col.columnName} TO _deprecated_${col.columnName};`
      );
    }

    // ALTER COLUMN TYPE statements
    for (const col of diff.alterColumns) {
      statements.push(
        `ALTER TABLE ${qualifiedTable} ALTER COLUMN ${col.columnName} TYPE ${col.toType} USING ${col.columnName}::${col.toType};`
      );
    }

    return statements.join("\n");
  }

  /**
   * Hash DDL string for migration history tracking
   */
  private hashDdl(ddl: string): string {
    // Simple hash using built-in crypto (import at top if not available)
    let hash = 0;
    for (let i = 0; i < ddl.length; i++) {
      const char = ddl.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }

  /**
   * Record migration in meta.migration_history table
   */
  private async recordMigrationHistory(
    entry: MigrationPlanEntry,
    ddlHash: string,
    status: "applied" | "failed" | "rolled_back",
    errorMessage?: string
  ): Promise<void> {
    try {
      await sql`
        INSERT INTO meta.migration_history (tenant_id, entity_name, version, action, ddl_sql, ddl_hash, status, error_message, applied_by)
        VALUES (
          ${"default"},
          ${entry.entityName},
          ${"latest"},
          ${entry.action},
          ${entry.ddl ?? ""},
          ${ddlHash},
          ${status},
          ${errorMessage ?? null},
          ${"system"}
        )
      `.execute(this.options.db);
    } catch (error) {
      // Non-fatal: history recording should not block migrations
      console.error(
        JSON.stringify({
          msg: "migration_history_record_error",
          entityName: entry.entityName,
          error: String(error),
        })
      );
    }
  }
}
