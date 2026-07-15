/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic tables are descriptor-validated */
import type { Kysely } from "kysely";
import { hydrateExecutionDescriptor, type ExecutionDescriptorPlane, type ExecutionDescriptorProvider } from "@athyper/svc-metadata";

type Db = Kysely<Record<string, any>>;

export interface EntityStorageDescriptor {
  entityCode: string;
  tableSchema: string;
  tableName: string;
  naturalKeyFields: string[];
  fieldColumns: ReadonlyMap<string, string>;
  primaryKey: string;
  tenantColumn: string | null;
}

export interface EntityDescriptorRepository {
  resolve(entityCode: string, tenantId?: string, plane?: ExecutionDescriptorPlane): Promise<EntityStorageDescriptor | null>;
  resolveRecordId(entityCode: string, suppliedId: string, tenantId: string, plane?: ExecutionDescriptorPlane): Promise<string | null>;
}

export class KyselyEntityDescriptorRepository implements EntityDescriptorRepository {
  constructor(
    private readonly db: Db,
    private readonly executionDescriptors?: Pick<ExecutionDescriptorProvider, "get">,
  ) {}

  async resolve(entityCode: string, tenantId?: string, plane?: ExecutionDescriptorPlane): Promise<EntityStorageDescriptor | null> {
    const normalized = entityCode.replace(/-/g, "_");
    if (this.executionDescriptors && tenantId && plane) {
      try {
        const { descriptor } = await this.executionDescriptors.get({ plane, tenantId, entityCode: normalized }, new Map());
        return {
          entityCode: descriptor.identity.entityCode,
          tableSchema: descriptor.storage.schema,
          tableName: descriptor.storage.table,
          naturalKeyFields: [...descriptor.read.naturalKeyFields],
          fieldColumns: new Map([...descriptor.fields].map(([name, field]) => [name, field.column])),
          primaryKey: descriptor.storage.primaryKey,
          tenantColumn: descriptor.storage.tenantColumn,
        };
      } catch {
        return null;
      }
    }
    // Non-provider consumers still use the persisted execution artifact. The
    // catalog artifact is intentionally excluded because it is not a storage
    // or mutation contract.
    const executionSnapshot = await (this.db.selectFrom("snapshot.entity_compiled as ec") as any)
      .innerJoin("control.entity_version as ev", "ev.id", "ec.entity_version_id")
      .innerJoin("control.entity as e", "e.id", "ev.entity_id")
      .select(["ec.compiled_json"])
      .where((eb: any) => eb.or([
        eb("e.entity_code", "=", normalized), eb("e.name", "=", normalized), eb("e.slug", "=", entityCode),
      ]))
      .where("e.tenant_id", "is", null)
      .where("e.runtime_enabled", "=", true)
      .where("e.status", "=", "ACTIVE")
      .where("e.is_active", "=", true)
      .where("ev.status", "=", "EFFECTIVE")
      .where("ec.artifact_kind", "=", "execution")
      .orderBy("ec.created_at", "desc")
      .executeTakeFirst() as { compiled_json?: unknown } | undefined;
    const snapshotRoot = asRecord(executionSnapshot?.compiled_json);
    const serializedDescriptor = snapshotRoot?.["execution_descriptor"];
    if (serializedDescriptor) {
      try {
        const descriptor = hydrateExecutionDescriptor(serializedDescriptor);
        return {
          entityCode: descriptor.identity.entityCode,
          tableSchema: descriptor.storage.schema,
          tableName: descriptor.storage.table,
          naturalKeyFields: [...descriptor.read.naturalKeyFields],
          fieldColumns: new Map([...descriptor.fields].map(([name, field]) => [name, field.column])),
          primaryKey: descriptor.storage.primaryKey,
          tenantColumn: descriptor.storage.tenantColumn,
        };
      } catch {
        // Fall through to the control-plane compatibility reader below.
      }
    }
    const row = await (this.db.selectFrom("control.entity as e") as any)
      .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
      .select(["e.entity_code", "e.name", "e.table_schema", "e.table_name", "e.primary_key", "e.tenant_column", "e.identity_config", "ev.id as version_id"])
      .where((eb: any) => eb.or([
        eb("e.entity_code", "=", normalized), eb("e.name", "=", normalized), eb("e.slug", "=", entityCode),
      ]))
      .where("e.tenant_id", "is", null)
      .where("e.runtime_enabled", "=", true)
      .where("e.status", "=", "ACTIVE")
      .where("e.is_active", "=", true)
      .where("ev.status", "=", "EFFECTIVE")
      .executeTakeFirst() as {
        entity_code: string | null; name: string; table_schema: string; table_name: string;
        primary_key: string | null; tenant_column: string | null; identity_config: unknown; version_id: string;
      } | undefined;
    if (!row) return null;
    if (!row.primary_key) return null;
    const fields = await (this.db.selectFrom("control.entity_field as ef") as any)
      .select(["ef.name", "ef.column_name"])
      .where("ef.entity_version_id", "=", row.version_id)
      .where("ef.is_active", "=", true)
      .where("ef.runtime_enabled", "=", true)
      .execute() as Array<{ name: string; column_name: string }>;
    return {
      entityCode: row.entity_code ?? row.name,
      tableSchema: row.table_schema,
      tableName: row.table_name,
      naturalKeyFields: resolveNaturalKeyFields(row.identity_config),
      fieldColumns: new Map(fields.map((field) => [field.name, field.column_name])),
      primaryKey: row.primary_key,
      tenantColumn: row.tenant_column,
    };
  }

  async resolveRecordId(entityCode: string, suppliedId: string, tenantId: string, plane?: ExecutionDescriptorPlane): Promise<string | null> {
    const descriptor = await this.resolve(entityCode, tenantId, plane);
    if (!descriptor) return null;
    const keys = descriptor.naturalKeyFields;
    const table = `${descriptor.tableSchema}.${descriptor.tableName}` as `${string}.${string}`;
    let primaryQuery = (this.db.selectFrom(table) as any)
      .select(descriptor.primaryKey)
      .where(descriptor.primaryKey, "=", suppliedId);
    if (descriptor.tenantColumn) primaryQuery = primaryQuery.where(descriptor.tenantColumn, "=", tenantId);
    const primaryRow = await primaryQuery.executeTakeFirst() as Record<string, string> | undefined;
    if (primaryRow?.[descriptor.primaryKey] !== undefined) return String(primaryRow[descriptor.primaryKey]);
    if (keys.length === 0) return null;
    let query = (this.db.selectFrom(table) as any)
      .select(descriptor.primaryKey);
    if (descriptor.tenantColumn) query = query.where(descriptor.tenantColumn, "=", tenantId);
    const row = await query
      .where((eb: any) => eb.or(keys.map((key) =>
        eb(descriptor.fieldColumns.get(key) ?? key, "=", suppliedId))))
      .executeTakeFirst() as Record<string, string> | undefined;
    return row?.[descriptor.primaryKey] ?? null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function resolveNaturalKeyFields(value: unknown): string[] {
  let config = value;
  if (typeof value === "string") {
    try { config = JSON.parse(value) as unknown; } catch { return []; }
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  const identity = config as Record<string, unknown>;
  const configured = stringArray(identity["business_key_fields"]);
  const fallback = configured.length > 0 ? configured : stringArray(identity["natural_key_fields"]);
  return fallback.filter((field) => field !== "tenant_id" && field !== "id");
}
