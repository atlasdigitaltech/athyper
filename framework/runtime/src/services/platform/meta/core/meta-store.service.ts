/**
 * MetaStore Service
 *
 * High-level convenience service for META Engine.
 * Combines registry + compiler operations into simplified workflows.
 */

import type {
  AuditLogger,
  CompiledModel,
  Entity,
  EntitySchema,
  EntityVersion,
  HealthCheckResult,
  MetaCompiler,
  MetaRegistry,
  RequestContext,
} from "@athyper/core/meta";

/**
 * MetaStore - High-level META Engine facade
 *
 * Provides simplified workflows for common operations:
 * - Get compiled models (with auto-compilation)
 * - Create entity + version atomically
 * - Publish versions (create + activate)
 * - Get active schemas
 */
export interface MetaStore {
  /**
   * Get compiled model for entity
   * Auto-compiles if not cached, uses active version if not specified
   */
  getCompiledModel(
    entityName: string,
    version?: string
  ): Promise<CompiledModel>;

  /**
   * Create entity with initial version atomically
   */
  createEntityWithVersion(
    name: string,
    description: string | undefined,
    initialVersion: string,
    schema: EntitySchema,
    ctx: RequestContext
  ): Promise<{
    entity: Entity;
    version: EntityVersion;
    compiledModel: CompiledModel;
  }>;

  /**
   * Publish a new version (create + activate + compile)
   */
  publishVersion(
    entityName: string,
    version: string,
    schema: EntitySchema,
    ctx: RequestContext
  ): Promise<{
    version: EntityVersion;
    compiledModel: CompiledModel;
  }>;

  /**
   * Get active schema for entity
   */
  getActiveSchema(entityName: string): Promise<EntitySchema | undefined>;

  /**
   * Deactivate current version and activate new version
   */
  switchVersion(
    entityName: string,
    newVersion: string,
    ctx: RequestContext
  ): Promise<{
    version: EntityVersion;
    compiledModel: CompiledModel;
  }>;

  /**
   * Health check
   */
  healthCheck(): Promise<HealthCheckResult>;
}

/**
 * MetaStore Service Implementation
 */
export class MetaStoreService implements MetaStore {
  constructor(
    private readonly registry: MetaRegistry,
    private readonly compiler: MetaCompiler,
    private readonly auditLogger: AuditLogger
  ) {}

  async getCompiledModel(
    entityName: string,
    version?: string
  ): Promise<CompiledModel> {
    try {
      // If no version specified, get active version
      let targetVersion = version;
      if (!targetVersion) {
        const entity = await this.registry.getEntity(entityName);
        if (!entity) {
          throw new Error(`Entity not found: ${entityName}`);
        }
        if (!entity.activeVersion) {
          throw new Error(`Entity has no active version: ${entityName}`);
        }
        targetVersion = entity.activeVersion;
      }

      // Get compiled model (from cache or compile)
      return await this.compiler.compile(entityName, targetVersion);
    } catch (error) {
      throw new Error(
        `Failed to get compiled model for ${entityName}@${version}: ${String(error)}`
      );
    }
  }

  async createEntityWithVersion(
    name: string,
    description: string | undefined,
    initialVersion: string,
    schema: EntitySchema,
    ctx: RequestContext
  ): Promise<{
    entity: Entity;
    version: EntityVersion;
    compiledModel: CompiledModel;
  }> {
    try {
      // 1. Validate schema first
      const validation = await this.compiler.validate(schema);
      if (!validation.valid) {
        throw new Error(
          `Schema validation failed: ${JSON.stringify(validation.errors)}`
        );
      }

      // 2. Create entity
      const entity = await this.registry.createEntity(name, description, ctx);

      // 3. Create version
      const version = await this.registry.createVersion(
        name,
        initialVersion,
        schema,
        ctx
      );

      // 4. Activate version
      await this.registry.activateVersion(name, initialVersion, ctx);

      // 5. Compile
      const compiledModel = await this.compiler.compile(name, initialVersion);

      // 6. Log audit event
      await this.auditLogger.log({
        eventType: "meta.entity.create",
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        realmId: ctx.realmId,
        action: "create",
        resource: name,
        details: {
          entityName: name,
          version: initialVersion,
          fieldsCount: schema.fields.length,
          policiesCount: schema.policies?.length ?? 0,
          workflow: "createEntityWithVersion",
        },
        result: "success",
      });

      return { entity, version, compiledModel };
    } catch (error) {
      // Log failure
      await this.auditLogger.log({
        eventType: "meta.entity.create",
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        realmId: ctx.realmId,
        action: "create",
        resource: name,
        details: {
          workflow: "createEntityWithVersion",
        },
        result: "failure",
        errorMessage: String(error),
      });

      throw new Error(
        `Failed to create entity with version: ${String(error)}`
      );
    }
  }

  async publishVersion(
    entityName: string,
    version: string,
    schema: EntitySchema,
    ctx: RequestContext
  ): Promise<{
    version: EntityVersion;
    compiledModel: CompiledModel;
  }> {
    try {
      // 1. Validate schema
      const validation = await this.compiler.validate(schema);
      if (!validation.valid) {
        throw new Error(
          `Schema validation failed: ${JSON.stringify(validation.errors)}`
        );
      }

      // 2. Verify entity exists
      const entity = await this.registry.getEntity(entityName);
      if (!entity) {
        throw new Error(`Entity not found: ${entityName}`);
      }

      // 3. Create version
      const newVersion = await this.registry.createVersion(
        entityName,
        version,
        schema,
        ctx
      );

      // 4. Activate version
      await this.registry.activateVersion(entityName, version, ctx);

      // 5. Compile
      const compiledModel = await this.compiler.compile(entityName, version);

      // 6. Log audit event
      await this.auditLogger.log({
        eventType: "meta.version.activate",
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        realmId: ctx.realmId,
        action: "activate",
        resource: entityName,
        details: {
          entityName,
          version,
          previousVersion: entity.activeVersion,
          fieldsCount: schema.fields.length,
          policiesCount: schema.policies?.length ?? 0,
          workflow: "publishVersion",
        },
        result: "success",
      });

      return { version: newVersion, compiledModel };
    } catch (error) {
      // Log failure
      await this.auditLogger.log({
        eventType: "meta.version.activate",
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        realmId: ctx.realmId,
        action: "activate",
        resource: entityName,
        details: {
          entityName,
          version,
          workflow: "publishVersion",
        },
        result: "failure",
        errorMessage: String(error),
      });

      throw new Error(`Failed to publish version: ${String(error)}`);
    }
  }

  async getActiveSchema(entityName: string): Promise<EntitySchema | undefined> {
    try {
      // Get entity
      const entity = await this.registry.getEntity(entityName);
      if (!entity || !entity.activeVersion) {
        return undefined;
      }

      // Get active version
      const version = await this.registry.getVersion(
        entityName,
        entity.activeVersion
      );

      return version?.schema;
    } catch (error) {
      throw new Error(
        `Failed to get active schema for ${entityName}: ${String(error)}`
      );
    }
  }

  async switchVersion(
    entityName: string,
    newVersion: string,
    ctx: RequestContext
  ): Promise<{
    version: EntityVersion;
    compiledModel: CompiledModel;
  }> {
    try {
      // 1. Verify entity exists
      const entity = await this.registry.getEntity(entityName);
      if (!entity) {
        throw new Error(`Entity not found: ${entityName}`);
      }

      // 2. Verify new version exists
      const version = await this.registry.getVersion(entityName, newVersion);
      if (!version) {
        throw new Error(
          `Version not found: ${entityName}@${newVersion}`
        );
      }

      const previousVersion = entity.activeVersion;

      // 3. Activate new version
      const activatedVersion = await this.registry.activateVersion(
        entityName,
        newVersion,
        ctx
      );

      // 4. Invalidate old compiled model cache
      if (previousVersion) {
        await this.compiler.invalidateCache(entityName, previousVersion);
      }

      // 5. Compile new version
      const compiledModel = await this.compiler.compile(entityName, newVersion);

      // 6. Log audit event
      await this.auditLogger.log({
        eventType: "meta.version.activate",
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        realmId: ctx.realmId,
        action: "activate",
        resource: entityName,
        details: {
          entityName,
          fromVersion: previousVersion,
          toVersion: newVersion,
          workflow: "switchVersion",
        },
        result: "success",
      });

      return { version: activatedVersion, compiledModel };
    } catch (error) {
      // Log failure
      await this.auditLogger.log({
        eventType: "meta.version.activate",
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        realmId: ctx.realmId,
        action: "activate",
        resource: entityName,
        details: {
          entityName,
          toVersion: newVersion,
          workflow: "switchVersion",
        },
        result: "failure",
        errorMessage: String(error),
      });

      throw new Error(`Failed to switch version: ${String(error)}`);
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      // Check registry, compiler health
      const [registryHealth, compilerHealth] = await Promise.all([
        (this.registry as any).healthCheck?.() ?? { healthy: true },
        this.compiler.healthCheck(),
      ]);

      const allHealthy = registryHealth.healthy && compilerHealth.healthy;

      return {
        healthy: allHealthy,
        message: allHealthy ? "MetaStore healthy" : "MetaStore unhealthy",
        details: {
          registry: registryHealth,
          compiler: compilerHealth,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `MetaStore health check failed: ${String(error)}`,
        details: { error: String(error) },
      };
    }
  }
}
