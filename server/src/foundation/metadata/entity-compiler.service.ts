/**
 * EntityCompilerService — Phase 2.1
 *
 * Compiles control.entity + control.entity_field + control.entity_class_profile
 * into a single cached descriptor written to snapshot.entity_compiled.
 *
 * A10 confirmed DROP: no ent.* schema. Metadata Studio is configuration-only.
 * Compiler reads from existing control/snapshot tables only — no diff validator,
 * no dynamic DDL.
 *
 * Compilation steps:
 *   1. Load entity header from control.entity WHERE name = entityCode
 *   2. Load effective version from control.entity_version WHERE status = 'EFFECTIVE'
 *   3. Load all active fields from control.entity_field for that version
 *   4. Load class profile from control.entity_class_profile if entity_class_id set
 *   5. Produce CompiledEntity descriptor
 *   6. Write/update snapshot.entity_compiled (upsert by tenant_id + entity_code)
 *   7. Cache result in-process (5-min TTL)
 *
 * On cache miss, the caller gets a fresh compile from DB.
 * The snapshot table serves as warm-start cache across process restarts.
 */

import type { Kysely } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CompiledField {
  name:            string;
  columnName:      string;
  dataType:        string;
  label:           string | null;
  placeholder:     string | null;
  isRequired:      boolean;
  isVisible:       boolean;
  isReadOnly:      boolean;
  isSearchable:    boolean;
  isSortable:      boolean;
  isFilterable:    boolean;
  sortOrder:       number;
  defaultValue:    unknown;
  validation:      Record<string, unknown> | null;
  refEntity:       string | null;
  refColumn:       string | null;
  refDisplayField: string | null;
  metadata:        Record<string, unknown> | null;
  readPermission:  string[] | null;
  writePermission: string[] | null;
}

export interface CompiledEntity {
  entityCode:       string;
  tableName:        string;
  displayName:      string;
  entityClass:      string | null;
  classProfile:     Record<string, unknown> | null;
  fields:           CompiledField[];
  primaryKey:       string;
  tenantScoped:     boolean;
  hasLifecycle:     boolean;
  hasWorkflow:      boolean;
  isReadOnly:       boolean;
  versionId:        string;
  compiledAt:       number;
  schemaVersion:    number;
}

interface EntityRow {
  id: string;
  name: string;
  table_name: string;
  display_name: string;
  entity_class_id: string | null;
  primary_key: string;
  tenant_scoped: boolean;
  has_lifecycle: boolean;
  has_workflow: boolean;
  is_read_only: boolean;
  schema_version: number;
}

interface EntityVersionRow {
  id: string;
  version_no: number;
}

interface EntityFieldRow {
  name: string;
  column_name: string;
  data_type: string;
  label: string | null;
  placeholder: string | null;
  is_required: boolean;
  is_visible: boolean;
  is_read_only: boolean;
  is_searchable: boolean;
  is_sortable: boolean;
  is_filterable: boolean;
  sort_order: number;
  default_value: string | null;
  validation_rules: string | null;
  ref_entity: string | null;
  ref_column: string | null;
  ref_display_field: string | null;
  metadata: string | null;
  read_permission: string | null;
  write_permission: string | null;
}

interface ClassProfileRow {
  profile: string | null;
}

const CACHE_TTL_MS = 5 * 60_000;

// ── EntityCompilerService ─────────────────────────────────────────────────────

export class EntityCompilerService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;
  private readonly cache = new Map<string, { compiled: CompiledEntity; fetchedAt: number }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  /**
   * Get the compiled entity descriptor. Returns cached result if fresh.
   * @param entityCode   control.entity.name
   * @param tenantId     Used for snapshot write; pass system tenant for global entities
   */
  async compile(entityCode: string, tenantId?: string): Promise<CompiledEntity | null> {
    const key = entityCode;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
      return cached.compiled;
    }

    // Try warm-start from snapshot table
    const snapshot = await this.loadSnapshot(entityCode, tenantId ?? "system");
    if (snapshot && (now - new Date(snapshot.compiled_at as string).getTime()) < CACHE_TTL_MS) {
      const compiled = JSON.parse(snapshot.payload as string) as CompiledEntity;
      this.cache.set(key, { compiled, fetchedAt: now });
      return compiled;
    }

    // Full compile from control schema
    const compiled = await this.fullCompile(entityCode);
    if (!compiled) return null;

    this.cache.set(key, { compiled, fetchedAt: now });
    void this.writeSnapshot(compiled, tenantId ?? "system");
    return compiled;
  }

  /**
   * Invalidate the in-process cache for an entity.
   */
  invalidate(entityCode?: string): void {
    if (entityCode) {
      this.cache.delete(entityCode);
    } else {
      this.cache.clear();
    }
  }

  /**
   * List all entity codes known to the compiler (from control.entity).
   */
  async listEntityCodes(): Promise<string[]> {
    const rows = await this.db
      .selectFrom("control.entity as e" as never)
      .select("e.name" as never)
      .where("e.is_active" as never, "=", true as never)
      .execute() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async fullCompile(entityCode: string): Promise<CompiledEntity | null> {
    const entityRow = await this.db
      .selectFrom("control.entity as e" as never)
      .selectAll("e" as never)
      .where("e.name" as never, "=", entityCode as never)
      .where("e.is_active" as never, "=", true as never)
      .executeTakeFirst() as EntityRow | undefined;

    if (!entityRow) return null;

    const versionRow = await this.db
      .selectFrom("control.entity_version as ev" as never)
      .select(["ev.id", "ev.version_no"] as never[])
      .where("ev.entity_id" as never, "=", entityRow.id as never)
      .where("ev.status" as never, "=", "EFFECTIVE" as never)
      .executeTakeFirst() as EntityVersionRow | undefined;

    if (!versionRow) return null;

    const fieldRows = await this.db
      .selectFrom("control.entity_field as ef" as never)
      .selectAll("ef" as never)
      .where("ef.entity_version_id" as never, "=", versionRow.id as never)
      .where("ef.is_active" as never, "=", true as never)
      .orderBy("ef.sort_order" as never, "asc")
      .execute() as EntityFieldRow[];

    let classProfile: Record<string, unknown> | null = null;
    let entityClass: string | null = null;

    if (entityRow.entity_class_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cpRow = await (this.db as any)
        .selectFrom("control.entity_class as ec")
        .leftJoin("control.entity_class_profile as ecp", "ecp.entity_class_id", "ec.id")
        .select(["ec.code as class_code", "ecp.profile"])
        .where("ec.id", "=", entityRow.entity_class_id)
        .executeTakeFirst() as { class_code: string; profile: string | null } | undefined;

      if (cpRow) {
        entityClass = cpRow.class_code;
        classProfile = cpRow.profile ? JSON.parse(cpRow.profile) as Record<string, unknown> : null;
      }
    }

    const fields: CompiledField[] = fieldRows.map((f) => ({
      name:            f.name,
      columnName:      f.column_name,
      dataType:        f.data_type,
      label:           f.label,
      placeholder:     f.placeholder,
      isRequired:      f.is_required,
      isVisible:       f.is_visible,
      isReadOnly:      f.is_read_only,
      isSearchable:    f.is_searchable,
      isSortable:      f.is_sortable,
      isFilterable:    f.is_filterable,
      sortOrder:       f.sort_order,
      defaultValue:    f.default_value ? JSON.parse(f.default_value) : null,
      validation:      f.validation_rules ? JSON.parse(f.validation_rules) as Record<string, unknown> : null,
      refEntity:       f.ref_entity,
      refColumn:       f.ref_column,
      refDisplayField: f.ref_display_field,
      metadata:        f.metadata ? JSON.parse(f.metadata) as Record<string, unknown> : null,
      readPermission:  f.read_permission ? JSON.parse(f.read_permission) as string[] : null,
      writePermission: f.write_permission ? JSON.parse(f.write_permission) as string[] : null,
    }));

    return {
      entityCode,
      tableName:      entityRow.table_name,
      displayName:    entityRow.display_name,
      entityClass,
      classProfile,
      fields,
      primaryKey:     entityRow.primary_key,
      tenantScoped:   entityRow.tenant_scoped,
      hasLifecycle:   entityRow.has_lifecycle,
      hasWorkflow:    entityRow.has_workflow,
      isReadOnly:     entityRow.is_read_only,
      versionId:      versionRow.id,
      compiledAt:     Date.now(),
      schemaVersion:  entityRow.schema_version,
    };
  }

  private async loadSnapshot(entityCode: string, tenantId: string) {
    return this.db
      .selectFrom("snapshot.entity_compiled as sec" as never)
      .select(["sec.payload", "sec.compiled_at"] as never[])
      .where("sec.entity_code" as never, "=", entityCode as never)
      .where("sec.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as Promise<{ payload: string; compiled_at: string } | undefined>;
  }

  private async writeSnapshot(compiled: CompiledEntity, tenantId: string): Promise<void> {
    try {
      await this.db
        .insertInto("snapshot.entity_compiled" as never)
        .values({
          tenant_id:     tenantId,
          entity_code:   compiled.entityCode,
          entity_id:     null,
          payload:       JSON.stringify(compiled),
          schema_version: compiled.schemaVersion,
          compiled_at:   new Date(compiled.compiledAt),
          created_by:    "00000000-0000-0000-0000-000000000000",
        } as never)
        .onConflict((oc: any) =>
          oc.columns(["tenant_id", "entity_code"] as never[])
            .doUpdateSet({
              payload:        JSON.stringify(compiled),
              schema_version: compiled.schemaVersion,
              compiled_at:    new Date(compiled.compiledAt),
            } as never)
        )
        .execute();
    } catch { /* snapshot write is best-effort */ }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEntityCompilerService(db: Kysely<any>): EntityCompilerService {
  return new EntityCompilerService(db);
}
