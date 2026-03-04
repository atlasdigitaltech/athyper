/**
 * Persona Capability Repository
 *
 * Database access for personas, operations, and capability grants.
 */

import type {
  CapabilityMatrix,
  ConstraintType,
  EntityModuleMapping,
  Module,
  Operation,
  OperationCategory,
  OperationCategoryDef,
  Persona,
  PersonaCapability,
  PersonaCode,
  TenantModuleSubscription,
} from "./types.js";
import type { Kysely } from "kysely";

// ============================================================================
// Repository Interface
// ============================================================================

export interface IPersonaCapabilityRepository {
  // Personas
  getPersonas(): Promise<Persona[]>;
  getPersonaByCode(code: PersonaCode): Promise<Persona | null>;

  // Operations
  getOperationCategories(): Promise<OperationCategoryDef[]>;
  getOperations(): Promise<Operation[]>;
  getOperationsByCategory(category: OperationCategory): Promise<Operation[]>;
  getOperationByCode(code: string): Promise<Operation | null>;

  // Capabilities
  getCapabilities(): Promise<PersonaCapability[]>;
  getCapabilitiesForPersona(personaCode: PersonaCode): Promise<PersonaCapability[]>;
  getCapabilityForOperation(
    personaCode: PersonaCode,
    operationCode: string
  ): Promise<PersonaCapability | null>;
  getCapabilityMatrix(): Promise<CapabilityMatrix>;

  // Modules
  getModules(): Promise<Module[]>;
  getModuleByCode(code: string): Promise<Module | null>;
  getTenantSubscriptions(tenantId: string): Promise<TenantModuleSubscription[]>;
  hasModuleSubscription(tenantId: string, moduleCode: string): Promise<boolean>;
  getEntityModuleMapping(entityKey: string): Promise<EntityModuleMapping | null>;
}

// ============================================================================
// Database Repository
// ============================================================================

export class DatabasePersonaCapabilityRepository implements IPersonaCapabilityRepository {
  constructor(private db: Kysely<any>) {}

  // --------------------------------------------------------------------------
  // Personas
  // --------------------------------------------------------------------------

  async getPersonas(): Promise<Persona[]> {
    const rows = await this.db
      .selectFrom("core.persona")
      .select([
        "id",
        "code",
        "name",
        "description",
        "scope_mode as scopeMode",
        "priority",
        "is_system as isSystem",
      ])
      .orderBy("priority", "asc")
      .execute();

    return rows.map((r) => ({
      id: r.id,
      code: r.code as PersonaCode,
      name: r.name,
      description: r.description ?? undefined,
      scopeMode: r.scopeMode as Persona["scopeMode"],
      priority: r.priority,
      isSystem: r.isSystem,
    }));
  }

  async getPersonaByCode(code: PersonaCode): Promise<Persona | null> {
    const row = await this.db
      .selectFrom("core.persona")
      .select([
        "id",
        "code",
        "name",
        "description",
        "scope_mode as scopeMode",
        "priority",
        "is_system as isSystem",
      ])
      .where("code", "=", code)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      code: row.code as PersonaCode,
      name: row.name,
      description: row.description ?? undefined,
      scopeMode: row.scopeMode as Persona["scopeMode"],
      priority: row.priority,
      isSystem: row.isSystem,
    };
  }

  // --------------------------------------------------------------------------
  // Operations
  // --------------------------------------------------------------------------

  async getOperationCategories(): Promise<OperationCategoryDef[]> {
    const rows = await this.db
      .selectFrom("core.operation_category")
      .select(["id", "code", "name", "description", "sort_order as sortOrder"])
      .orderBy("sort_order", "asc")
      .execute();

    return rows.map((r) => ({
      id: r.id,
      code: r.code as OperationCategory,
      name: r.name,
      description: r.description ?? undefined,
      sortOrder: r.sortOrder,
    }));
  }

  async getOperations(): Promise<Operation[]> {
    const rows = await this.db
      .selectFrom("core.operation as o")
      .innerJoin("core.operation_category as c", "c.id", "o.category_id")
      .select([
        "o.id",
        "o.category_id as categoryId",
        "c.code as categoryCode",
        "o.code",
        "o.name",
        "o.description",
        "o.requires_record as requiresRecord",
        "o.requires_ownership as requiresOwnership",
        "o.sort_order as sortOrder",
      ])
      .orderBy("c.sort_order", "asc")
      .orderBy("o.sort_order", "asc")
      .execute();

    return rows.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      categoryCode: r.categoryCode as OperationCategory,
      code: r.code,
      name: r.name,
      description: r.description ?? undefined,
      requiresRecord: r.requiresRecord,
      requiresOwnership: r.requiresOwnership,
      sortOrder: r.sortOrder,
    }));
  }

  async getOperationsByCategory(category: OperationCategory): Promise<Operation[]> {
    const rows = await this.db
      .selectFrom("core.operation as o")
      .innerJoin("core.operation_category as c", "c.id", "o.category_id")
      .select([
        "o.id",
        "o.category_id as categoryId",
        "c.code as categoryCode",
        "o.code",
        "o.name",
        "o.description",
        "o.requires_record as requiresRecord",
        "o.requires_ownership as requiresOwnership",
        "o.sort_order as sortOrder",
      ])
      .where("c.code", "=", category)
      .orderBy("o.sort_order", "asc")
      .execute();

    return rows.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      categoryCode: r.categoryCode as OperationCategory,
      code: r.code,
      name: r.name,
      description: r.description ?? undefined,
      requiresRecord: r.requiresRecord,
      requiresOwnership: r.requiresOwnership,
      sortOrder: r.sortOrder,
    }));
  }

  async getOperationByCode(code: string): Promise<Operation | null> {
    const row = await this.db
      .selectFrom("core.operation as o")
      .innerJoin("core.operation_category as c", "c.id", "o.category_id")
      .select([
        "o.id",
        "o.category_id as categoryId",
        "c.code as categoryCode",
        "o.code",
        "o.name",
        "o.description",
        "o.requires_record as requiresRecord",
        "o.requires_ownership as requiresOwnership",
        "o.sort_order as sortOrder",
      ])
      .where("o.code", "=", code)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryCode: row.categoryCode as OperationCategory,
      code: row.code,
      name: row.name,
      description: row.description ?? undefined,
      requiresRecord: row.requiresRecord,
      requiresOwnership: row.requiresOwnership,
      sortOrder: row.sortOrder,
    };
  }

  // --------------------------------------------------------------------------
  // Capabilities
  // --------------------------------------------------------------------------

  async getCapabilities(): Promise<PersonaCapability[]> {
    const rows = await this.db
      .selectFrom("core.persona_capability as pc")
      .innerJoin("core.persona as p", "p.id", "pc.persona_id")
      .innerJoin("core.operation as o", "o.id", "pc.operation_id")
      .select([
        "pc.id",
        "pc.persona_id as personaId",
        "p.code as personaCode",
        "pc.operation_id as operationId",
        "o.code as operationCode",
        "pc.is_granted as isGranted",
        "pc.constraint_type as constraintType",
      ])
      .execute();

    return rows.map((r) => ({
      id: r.id,
      personaId: r.personaId,
      personaCode: r.personaCode as PersonaCode,
      operationId: r.operationId,
      operationCode: r.operationCode,
      isGranted: r.isGranted,
      constraintType: r.constraintType as ConstraintType,
    }));
  }

  async getCapabilitiesForPersona(personaCode: PersonaCode): Promise<PersonaCapability[]> {
    const rows = await this.db
      .selectFrom("core.persona_capability as pc")
      .innerJoin("core.persona as p", "p.id", "pc.persona_id")
      .innerJoin("core.operation as o", "o.id", "pc.operation_id")
      .select([
        "pc.id",
        "pc.persona_id as personaId",
        "p.code as personaCode",
        "pc.operation_id as operationId",
        "o.code as operationCode",
        "pc.is_granted as isGranted",
        "pc.constraint_type as constraintType",
      ])
      .where("p.code", "=", personaCode)
      .where("pc.is_granted", "=", true)
      .execute();

    return rows.map((r) => ({
      id: r.id,
      personaId: r.personaId,
      personaCode: r.personaCode as PersonaCode,
      operationId: r.operationId,
      operationCode: r.operationCode,
      isGranted: r.isGranted,
      constraintType: r.constraintType as ConstraintType,
    }));
  }

  async getCapabilityForOperation(
    personaCode: PersonaCode,
    operationCode: string
  ): Promise<PersonaCapability | null> {
    const row = await this.db
      .selectFrom("core.persona_capability as pc")
      .innerJoin("core.persona as p", "p.id", "pc.persona_id")
      .innerJoin("core.operation as o", "o.id", "pc.operation_id")
      .select([
        "pc.id",
        "pc.persona_id as personaId",
        "p.code as personaCode",
        "pc.operation_id as operationId",
        "o.code as operationCode",
        "pc.is_granted as isGranted",
        "pc.constraint_type as constraintType",
      ])
      .where("p.code", "=", personaCode)
      .where("o.code", "=", operationCode)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      personaId: row.personaId,
      personaCode: row.personaCode as PersonaCode,
      operationId: row.operationId,
      operationCode: row.operationCode,
      isGranted: row.isGranted,
      constraintType: row.constraintType as ConstraintType,
    };
  }

  async getCapabilityMatrix(): Promise<CapabilityMatrix> {
    const [personas, categories, operations, capabilities] = await Promise.all([
      this.getPersonas(),
      this.getOperationCategories(),
      this.getOperations(),
      this.getCapabilities(),
    ]);

    return { personas, categories, operations, capabilities };
  }

  // --------------------------------------------------------------------------
  // Modules
  // --------------------------------------------------------------------------

  async getModules(): Promise<Module[]> {
    const rows = await this.db
      .selectFrom("core.module")
      .select(["id", "code", "name", "description", "is_active as isActive"])
      .where("is_active", "=", true)
      .orderBy("code", "asc")
      .execute();

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description ?? undefined,
      isActive: r.isActive,
    }));
  }

  async getModuleByCode(code: string): Promise<Module | null> {
    const row = await this.db
      .selectFrom("core.module")
      .select(["id", "code", "name", "description", "is_active as isActive"])
      .where("code", "=", code)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description ?? undefined,
      isActive: row.isActive,
    };
  }

  async getTenantSubscriptions(tenantId: string): Promise<TenantModuleSubscription[]> {
    const rows = await this.db
      .selectFrom("core.tenant_module_subscription as tms")
      .innerJoin("core.module as m", "m.id", "tms.module_id")
      .select([
        "tms.id",
        "tms.tenant_id as tenantId",
        "tms.module_id as moduleId",
        "m.code as moduleCode",
        "tms.is_active as isActive",
        "tms.valid_from as validFrom",
        "tms.valid_until as validUntil",
      ])
      .where("tms.tenant_id", "=", tenantId)
      .where("tms.is_active", "=", true)
      .execute();

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      moduleId: r.moduleId,
      moduleCode: r.moduleCode,
      isActive: r.isActive,
      validFrom: new Date(r.validFrom),
      validUntil: r.validUntil ? new Date(r.validUntil) : undefined,
    }));
  }

  async hasModuleSubscription(tenantId: string, moduleCode: string): Promise<boolean> {
    const now = new Date();

    const row = await this.db
      .selectFrom("core.tenant_module_subscription as tms")
      .innerJoin("core.module as m", "m.id", "tms.module_id")
      .select("tms.id")
      .where("tms.tenant_id", "=", tenantId)
      .where("m.code", "=", moduleCode)
      .where("tms.is_active", "=", true)
      .where("tms.valid_from", "<=", now)
      .where((eb) =>
        eb.or([eb("tms.valid_until", "is", null), eb("tms.valid_until", ">", now)])
      )
      .executeTakeFirst();

    return row !== undefined;
  }

  async getEntityModuleMapping(entityKey: string): Promise<EntityModuleMapping | null> {
    const row = await this.db
      .selectFrom("core.entity_module as em")
      .innerJoin("core.module as m", "m.id", "em.module_id")
      .select([
        "em.id",
        "em.entity_key as entityKey",
        "em.module_id as moduleId",
        "m.code as moduleCode",
      ])
      .where("em.entity_key", "=", entityKey)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      entityKey: row.entityKey,
      moduleId: row.moduleId,
      moduleCode: row.moduleCode,
    };
  }
}

// ============================================================================
// In-Memory Repository (for testing)
// ============================================================================

export class InMemoryPersonaCapabilityRepository implements IPersonaCapabilityRepository {
  private personas: Persona[] = [];
  private categories: OperationCategoryDef[] = [];
  private operations: Operation[] = [];
  private capabilities: PersonaCapability[] = [];
  private modules: Module[] = [];
  private subscriptions: TenantModuleSubscription[] = [];
  private entityMappings: EntityModuleMapping[] = [];

  // Setters for test data
  setPersonas(personas: Persona[]): void {
    this.personas = personas;
  }

  setCategories(categories: OperationCategoryDef[]): void {
    this.categories = categories;
  }

  setOperations(operations: Operation[]): void {
    this.operations = operations;
  }

  setCapabilities(capabilities: PersonaCapability[]): void {
    this.capabilities = capabilities;
  }

  setModules(modules: Module[]): void {
    this.modules = modules;
  }

  setSubscriptions(subscriptions: TenantModuleSubscription[]): void {
    this.subscriptions = subscriptions;
  }

  setEntityMappings(mappings: EntityModuleMapping[]): void {
    this.entityMappings = mappings;
  }

  // IPersonaCapabilityRepository implementation
  async getPersonas(): Promise<Persona[]> {
    return [...this.personas].sort((a, b) => a.priority - b.priority);
  }

  async getPersonaByCode(code: PersonaCode): Promise<Persona | null> {
    return this.personas.find((p) => p.code === code) ?? null;
  }

  async getOperationCategories(): Promise<OperationCategoryDef[]> {
    return [...this.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getOperations(): Promise<Operation[]> {
    return [...this.operations].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getOperationsByCategory(category: OperationCategory): Promise<Operation[]> {
    return this.operations
      .filter((o) => o.categoryCode === category)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getOperationByCode(code: string): Promise<Operation | null> {
    return this.operations.find((o) => o.code === code) ?? null;
  }

  async getCapabilities(): Promise<PersonaCapability[]> {
    return [...this.capabilities];
  }

  async getCapabilitiesForPersona(personaCode: PersonaCode): Promise<PersonaCapability[]> {
    return this.capabilities.filter(
      (c) => c.personaCode === personaCode && c.isGranted
    );
  }

  async getCapabilityForOperation(
    personaCode: PersonaCode,
    operationCode: string
  ): Promise<PersonaCapability | null> {
    return (
      this.capabilities.find(
        (c) => c.personaCode === personaCode && c.operationCode === operationCode
      ) ?? null
    );
  }

  async getCapabilityMatrix(): Promise<CapabilityMatrix> {
    return {
      personas: await this.getPersonas(),
      categories: await this.getOperationCategories(),
      operations: await this.getOperations(),
      capabilities: await this.getCapabilities(),
    };
  }

  async getModules(): Promise<Module[]> {
    return this.modules.filter((m) => m.isActive);
  }

  async getModuleByCode(code: string): Promise<Module | null> {
    return this.modules.find((m) => m.code === code) ?? null;
  }

  async getTenantSubscriptions(tenantId: string): Promise<TenantModuleSubscription[]> {
    const now = new Date();
    return this.subscriptions.filter(
      (s) =>
        s.tenantId === tenantId &&
        s.isActive &&
        s.validFrom <= now &&
        (!s.validUntil || s.validUntil > now)
    );
  }

  async hasModuleSubscription(tenantId: string, moduleCode: string): Promise<boolean> {
    const subs = await this.getTenantSubscriptions(tenantId);
    return subs.some((s) => s.moduleCode === moduleCode);
  }

  async getEntityModuleMapping(entityKey: string): Promise<EntityModuleMapping | null> {
    return this.entityMappings.find((m) => m.entityKey === entityKey) ?? null;
  }
}
