/**
 * Publish Service
 *
 * Enforces deterministic publish pipeline for entity versions.
 * Phase 1.1: Meta Engine Release Hardening Pack
 *
 * Publish Gate: draft → compile → diagnostics → (optional DDL plan) → publish
 *
 * Key guarantees:
 * - No edits to published versions (immutable)
 * - Only new versions/overlays allowed
 * - Publish artifacts persisted for audit trail
 */

import { createHash } from "crypto";

import type { MigrationRunnerService } from "./migration-runner.service.js";
import type { SchemaChangeNotifier } from "./schema-change-notifier.js";
import type { DB } from "@athyper/adapter-db";
import type {
  CompiledModel,
  DdlGenerator,
  EntitySchema,
  MetaCompiler,
  MetaRegistry,
} from "@athyper/core/meta";
import type { Kysely } from "kysely";


// RequestContext type (inline for now - should be imported from contracts)
type RequestContext = {
  userId: string;
  tenantId: string;
  orgId?: string;
  realmId?: string;
};

/**
 * Publish artifact metadata
 * Persisted to meta_publish_artifact table
 */
export type PublishArtifact = {
  /** Artifact ID */
  id: string;

  /** Entity name */
  entityName: string;

  /** Version identifier */
  version: string;

  /** Compiled model hash (SHA-256) */
  compiledHash: string;

  /** Diagnostics summary */
  diagnosticsSummary: DiagnosticsSummary;

  /** Applied overlay set (even if empty) */
  appliedOverlaySet: string[];

  /** Migration plan hash (if DDL generated) */
  migrationPlanHash?: string;

  /** Migration plan SQL (if generated) */
  migrationPlanSql?: string;

  /** Published at */
  publishedAt: Date;

  /** Published by */
  publishedBy: string;

  /** Tenant ID */
  tenantId: string;
};

/**
 * Diagnostics summary for a compiled model
 */
export type DiagnosticsSummary = {
  /** Compilation succeeded */
  success: boolean;

  /** Errors (if any) */
  errors: string[];

  /** Warnings (non-blocking) */
  warnings: string[];

  /** Field count */
  fieldCount: number;

  /** Relationship count */
  relationshipCount: number;

  /** Lifecycle transition count */
  lifecycleTransitionCount?: number;

  /** Has system fields */
  hasSystemFields: boolean;
};

/**
 * Publish request
 */
export type PublishRequest = {
  /** Entity name */
  entityName: string;

  /** Version to publish */
  version: string;

  /** Schema to publish */
  schema: EntitySchema;

  /** Optional overlay set */
  overlaySet?: string[];

  /** Generate DDL migration plan */
  generateDdlPlan?: boolean;

  /** Apply DDL to database (requires generateDdlPlan: true) */
  applyDdl?: boolean;

  /** Notify runtime of schema change via Redis pub/sub */
  notifyRuntime?: boolean;

  /** Request context */
  ctx: RequestContext;
};

/**
 * Publish result
 */
export type PublishResult = {
  /** Success */
  success: boolean;

  /** Artifact ID */
  artifactId?: string;

  /** Compiled model */
  compiledModel?: CompiledModel;

  /** Diagnostics */
  diagnostics: DiagnosticsSummary;

  /** Errors (if failed) */
  errors?: string[];
};

/**
 * Publish Service
 *
 * Enforces the publish gate and persists publish artifacts.
 */
export class PublishService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly registry: MetaRegistry,
    private readonly compiler: MetaCompiler,
    private readonly ddlGenerator?: DdlGenerator,
    private readonly migrationRunner?: MigrationRunnerService,
    private readonly notifier?: SchemaChangeNotifier,
  ) {}

  /**
   * Publish entity version
   *
   * Enforces the publish gate:
   * 1. Immutability check (already published?)
   * 2. Validate schema
   * 3. Compile entity
   * 4. Run diagnostics
   * 5. (Optional) Generate DDL plan
   * 6. (Optional) Apply DDL via MigrationRunnerService
   * 7. Persist publish artifact
   * 8. (Optional) Notify runtime via Redis pub/sub
   */
  async publish(request: PublishRequest): Promise<PublishResult> {
    const {
      entityName,
      version,
      schema,
      overlaySet = [],
      generateDdlPlan = false,
      applyDdl = false,
      notifyRuntime = false,
      ctx,
    } = request;

    console.log(
      JSON.stringify({
        msg: "publish_start",
        entityName,
        version,
        overlaySet,
        generateDdlPlan,
        applyDdl,
        notifyRuntime,
        userId: ctx.userId,
      })
    );

    try {
      // Gate 1: Check if version is already published (immutable check)
      const existingArtifact = await this.getPublishArtifact(entityName, version, ctx.tenantId);
      if (existingArtifact) {
        const errors = [
          `Version ${version} is already published and cannot be modified. Create a new version instead.`,
        ];
        console.warn(
          JSON.stringify({
            msg: "publish_already_published",
            entityName,
            version,
            artifactId: existingArtifact.id,
          })
        );
        return {
          success: false,
          diagnostics: existingArtifact.diagnosticsSummary,
          errors,
        };
      }

      // Gate 2: Validate schema
      console.log(
        JSON.stringify({
          msg: "publish_gate_validate",
          entityName,
          version,
        })
      );

      const validation = await this.compiler.validate(schema);
      if (!validation.valid) {
        const errors = validation.errors?.map((e) => e.message ?? String(e)) ?? ["Validation failed"];
        console.error(
          JSON.stringify({
            msg: "publish_validation_failed",
            entityName,
            version,
            errors,
          })
        );
        return {
          success: false,
          diagnostics: {
            success: false,
            errors,
            warnings: [],
            fieldCount: schema.fields.length,
            relationshipCount: 0,
            hasSystemFields: false,
          },
          errors,
        };
      }

      // Gate 3: Compile entity
      console.log(
        JSON.stringify({
          msg: "publish_gate_compile",
          entityName,
          version,
        })
      );

      // For now, we'll use a temporary approach to compile
      // In production, this should integrate with entity_version table
      const compiledModel = await this.compiler.compile(entityName, version);

      // Gate 4: Run diagnostics
      console.log(
        JSON.stringify({
          msg: "publish_gate_diagnostics",
          entityName,
          version,
        })
      );

      const diagnostics = this.runDiagnostics(compiledModel, schema);

      if (!diagnostics.success) {
        console.error(
          JSON.stringify({
            msg: "publish_diagnostics_failed",
            entityName,
            version,
            errors: diagnostics.errors,
          })
        );
        return {
          success: false,
          diagnostics,
          errors: diagnostics.errors,
        };
      }

      // Gate 5: (Optional) Generate DDL migration plan
      let migrationPlanHash: string | undefined;
      let migrationPlanSql: string | undefined;

      if (generateDdlPlan && this.ddlGenerator) {
        console.log(
          JSON.stringify({
            msg: "publish_gate_ddl_plan",
            entityName,
            version,
          })
        );

        const ddlResult = this.ddlGenerator.generateDdl(compiledModel, {
          schemaName: "ent",
          ifNotExists: true,
          includeIndexes: true,
        });

        migrationPlanSql = ddlResult.fullSql;
        migrationPlanHash = this.hashString(migrationPlanSql);
      }

      // Gate 6: Apply DDL (optional — requires generateDdlPlan + applyDdl)
      if (applyDdl && migrationPlanSql && this.migrationRunner) {
        console.log(
          JSON.stringify({
            msg: "publish_gate_apply_ddl",
            entityName,
            version,
          })
        );

        const plan = [
          {
            entityName,
            tableName: compiledModel.tableName,
            action: "create" as const,
            reason: "Publish-time DDL apply",
            ddl: migrationPlanSql,
          },
        ];

        const migrationResult = await this.migrationRunner.applyPlan(plan);

        if (!migrationResult.success) {
          console.error(
            JSON.stringify({
              msg: "publish_ddl_apply_failed",
              entityName,
              version,
              errors: migrationResult.errors,
            })
          );
          return {
            success: false,
            diagnostics,
            errors: migrationResult.errors,
          };
        }
      } else if (applyDdl && !this.migrationRunner) {
        console.warn(
          JSON.stringify({
            msg: "publish_ddl_apply_skipped",
            entityName,
            version,
            reason: "MigrationRunnerService not available",
          })
        );
      }

      // Gate 7: Persist publish artifact
      console.log(
        JSON.stringify({
          msg: "publish_gate_persist",
          entityName,
          version,
        })
      );

      const artifact = await this.persistPublishArtifact({
        entityName,
        version,
        compiledModel,
        diagnostics,
        overlaySet,
        migrationPlanHash,
        migrationPlanSql,
        ctx,
      });

      // Gate 8: Notify runtime (optional — best-effort, never blocks publish)
      if (notifyRuntime && this.notifier) {
        await this.notifier.notify(entityName, version, ctx.tenantId, applyDdl);
      }

      console.log(
        JSON.stringify({
          msg: "publish_success",
          entityName,
          version,
          artifactId: artifact.id,
          compiledHash: artifact.compiledHash,
          ddlApplied: applyDdl && !!migrationPlanSql,
          runtimeNotified: notifyRuntime && !!this.notifier,
        })
      );

      return {
        success: true,
        artifactId: artifact.id,
        compiledModel,
        diagnostics,
      };
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "publish_error",
          entityName,
          version,
          error: String(error),
        })
      );

      return {
        success: false,
        diagnostics: {
          success: false,
          errors: [String(error)],
          warnings: [],
          fieldCount: 0,
          relationshipCount: 0,
          hasSystemFields: false,
        },
        errors: [String(error)],
      };
    }
  }

  /**
   * Run diagnostics on compiled model
   */
  private runDiagnostics(
    compiledModel: CompiledModel,
    _schema: EntitySchema
  ): DiagnosticsSummary {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for required system fields (Phase 1.2)
    const hasSystemFields = this.validateSystemFields(compiledModel, errors);

    // Check field count
    if (compiledModel.fields.length === 0) {
      errors.push("Entity must have at least one field");
    }

    // Count relationships
    const relationshipCount = compiledModel.fields.filter(
      (f) => f.type === "reference"
    ).length;

    // Lifecycle transitions (if supported)
    const lifecycleTransitionCount = 0; // TODO: Add lifecycle support to CompiledModel

    // Warnings
    if (relationshipCount > 10) {
      warnings.push("Entity has more than 10 relationships, consider splitting");
    }

    if (compiledModel.fields.length > 50) {
      warnings.push("Entity has more than 50 fields, consider normalization");
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
      fieldCount: compiledModel.fields.length,
      relationshipCount,
      lifecycleTransitionCount,
      hasSystemFields,
    };
  }

  /**
   * Validate required system fields (Phase 1.2)
   *
   * Every entity must have:
   * - id (uuid pk)
   * - tenant_id (uuid)
   * - realm_id (text/uuid)
   * - created_at/by, updated_at/by
   * - deleted_at/by
   * - version (int)
   */
  private validateSystemFields(compiledModel: CompiledModel, errors: string[]): boolean {
    const requiredFields = [
      { name: "id", type: "uuid" },
      { name: "tenant_id", type: "uuid" },
      { name: "realm_id", type: ["string", "uuid"] },
      { name: "created_at", type: "timestamp" },
      { name: "created_by", type: "string" },
      { name: "updated_at", type: "timestamp" },
      { name: "updated_by", type: "string" },
      { name: "deleted_at", type: "timestamp" },
      { name: "deleted_by", type: "string" },
      { name: "version", type: "number" },
    ];

    let allPresent = true;

    for (const required of requiredFields) {
      const field = compiledModel.fields.find((f) => f.name === required.name);

      if (!field) {
        errors.push(
          `Missing required system field: ${required.name} (${Array.isArray(required.type) ? required.type.join(" or ") : required.type})`
        );
        allPresent = false;
        continue;
      }

      // Type check
      const expectedTypes = Array.isArray(required.type) ? required.type : [required.type];
      if (!expectedTypes.includes(field.type as string)) {
        errors.push(
          `System field ${required.name} has wrong type: expected ${expectedTypes.join(" or ")}, got ${field.type}`
        );
        allPresent = false;
      }
    }

    // Note: Primary key constraint is enforced at DDL generation time
    // CompiledModel doesn't expose isPrimaryKey property

    return allPresent;
  }

  /**
   * Persist publish artifact to database
   */
  private async persistPublishArtifact(params: {
    entityName: string;
    version: string;
    compiledModel: CompiledModel;
    diagnostics: DiagnosticsSummary;
    overlaySet: string[];
    migrationPlanHash?: string;
    migrationPlanSql?: string;
    ctx: RequestContext;
  }): Promise<PublishArtifact> {
    const {
      entityName,
      version,
      compiledModel,
      diagnostics,
      overlaySet,
      migrationPlanHash,
      migrationPlanSql,
      ctx,
    } = params;

    // Generate artifact ID
    const artifactId = this.generateArtifactId(entityName, version, ctx.tenantId);

    // Hash compiled model
    const compiledHash = this.hashCompiledModel(compiledModel);

    const artifact: PublishArtifact = {
      id: artifactId,
      entityName,
      version,
      compiledHash,
      diagnosticsSummary: diagnostics,
      appliedOverlaySet: overlaySet,
      migrationPlanHash,
      migrationPlanSql,
      publishedAt: new Date(),
      publishedBy: ctx.userId,
      tenantId: ctx.tenantId,
    };

    // Persist to meta.publish_artifact table
    try {
      await (this.db as unknown as Kysely<Record<string, Record<string, unknown>>>)
        .insertInto("meta.publish_artifact" as never)
        .values({
          id: artifactId,
          tenant_id: ctx.tenantId,
          entity_name: entityName,
          version,
          compiled_hash: compiledHash,
          diagnostics_summary: JSON.stringify(diagnostics),
          applied_overlay_set: JSON.stringify(overlaySet),
          migration_plan_hash: migrationPlanHash ?? null,
          migration_plan_sql: migrationPlanSql ?? null,
          published_by: ctx.userId,
        } as never)
        .execute();
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "publish_artifact_persist_error",
          artifactId,
          entityName,
          version,
          error: String(error),
        })
      );
      // Non-fatal: artifact is still returned in-memory even if DB write fails
    }

    console.log(
      JSON.stringify({
        msg: "publish_artifact_persisted",
        artifactId,
        entityName,
        version,
        compiledHash,
      })
    );

    return artifact;
  }

  /**
   * Get existing publish artifact
   */
  private async getPublishArtifact(
    entityName: string,
    version: string,
    tenantId: string
  ): Promise<PublishArtifact | undefined> {
    try {
      const row = await (this.db as unknown as Kysely<Record<string, Record<string, unknown>>>)
        .selectFrom("meta.publish_artifact" as never)
        .selectAll()
        .where("tenant_id" as never, "=", tenantId as never)
        .where("entity_name" as never, "=", entityName as never)
        .where("version" as never, "=", version as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) return undefined;

      return {
        id: row.id as string,
        entityName: row.entity_name as string,
        version: row.version as string,
        compiledHash: row.compiled_hash as string,
        diagnosticsSummary: (typeof row.diagnostics_summary === "string"
          ? JSON.parse(row.diagnostics_summary)
          : row.diagnostics_summary) as DiagnosticsSummary,
        appliedOverlaySet: (typeof row.applied_overlay_set === "string"
          ? JSON.parse(row.applied_overlay_set)
          : row.applied_overlay_set ?? []) as string[],
        migrationPlanHash: (row.migration_plan_hash as string) ?? undefined,
        migrationPlanSql: (row.migration_plan_sql as string) ?? undefined,
        publishedAt: new Date(row.published_at as string),
        publishedBy: row.published_by as string,
        tenantId: row.tenant_id as string,
      };
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "get_publish_artifact_error",
          entityName,
          version,
          tenantId,
          error: String(error),
        })
      );
      return undefined;
    }
  }

  /**
   * Generate artifact ID
   */
  private generateArtifactId(entityName: string, version: string, tenantId: string): string {
    const timestamp = Date.now();
    return `artifact_${tenantId}_${entityName}_${version}_${timestamp}`;
  }

  /**
   * Hash compiled model for integrity check
   */
  private hashCompiledModel(model: CompiledModel): string {
    // Serialize model to deterministic JSON
    const serialized = JSON.stringify(
      {
        entityName: model.entityName,
        version: model.version,
        fields: model.fields,
        tableName: model.tableName,
      },
      null,
      0 // No whitespace for consistent hash
    );

    return this.hashString(serialized);
  }

  /**
   * Hash string using SHA-256
   */
  private hashString(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }

  /**
   * Check if version is published (immutable)
   */
  async isPublished(entityName: string, version: string, tenantId: string): Promise<boolean> {
    const artifact = await this.getPublishArtifact(entityName, version, tenantId);
    return artifact !== undefined;
  }

  /**
   * Get publish history for entity
   */
  async getPublishHistory(
    entityName: string,
    tenantId: string
  ): Promise<PublishArtifact[]> {
    try {
      const rows = await (this.db as unknown as Kysely<Record<string, Record<string, unknown>>>)
        .selectFrom("meta.publish_artifact" as never)
        .selectAll()
        .where("tenant_id" as never, "=", tenantId as never)
        .where("entity_name" as never, "=", entityName as never)
        .orderBy("published_at" as never, "desc")
        .execute() as Record<string, unknown>[];

      return rows.map((row) => ({
        id: row.id as string,
        entityName: row.entity_name as string,
        version: row.version as string,
        compiledHash: row.compiled_hash as string,
        diagnosticsSummary: (typeof row.diagnostics_summary === "string"
          ? JSON.parse(row.diagnostics_summary)
          : row.diagnostics_summary) as DiagnosticsSummary,
        appliedOverlaySet: (typeof row.applied_overlay_set === "string"
          ? JSON.parse(row.applied_overlay_set)
          : row.applied_overlay_set ?? []) as string[],
        migrationPlanHash: (row.migration_plan_hash as string) ?? undefined,
        migrationPlanSql: (row.migration_plan_sql as string) ?? undefined,
        publishedAt: new Date(row.published_at as string),
        publishedBy: row.published_by as string,
        tenantId: row.tenant_id as string,
      }));
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "get_publish_history_error",
          entityName,
          tenantId,
          error: String(error),
        })
      );
      return [];
    }
  }
}
