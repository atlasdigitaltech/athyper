/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic tables are descriptor-validated */
import type { Kysely } from "kysely";
import type { ExecutionDescriptorPlane, ExecutionDescriptorProvider } from "@athyper/svc-metadata";

type Db = Kysely<Record<string, any>>;

export interface EntityStorageDescriptor {
  entityCode: string;
  tableSchema: string;
  tableName: string;
  naturalKeyFields: string[];
  fieldColumns: ReadonlyMap<string, string>;
  primaryKey: string;
  tenantColumn: string;
}

export interface EntityDescriptorRepository {
  resolve(entityCode: string, tenantId?: string, plane?: ExecutionDescriptorPlane): Promise<EntityStorageDescriptor | null>;
  resolveRecordId(entityCode: string, suppliedId: string, tenantId: string, plane?: ExecutionDescriptorPlane): Promise<string | null>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const row = await (this.db.selectFrom("control.entity as e") as any)
      .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
      .select(["e.entity_code", "e.name", "e.table_schema", "e.table_name", "e.identity_config", "ev.id as version_id"])
      .where((eb: any) => eb.or([
        eb("e.entity_code", "=", normalized), eb("e.name", "=", normalized), eb("e.slug", "=", entityCode),
      ]))
      .where("e.tenant_id", "is", null)
      .where("ev.status", "=", "EFFECTIVE")
      .executeTakeFirst() as {
        entity_code: string | null; name: string; table_schema: string; table_name: string;
        identity_config: unknown; version_id: string;
      } | undefined;
    if (!row) return null;
    const fields = await (this.db.selectFrom("control.entity_field as ef") as any)
      .select(["ef.name", "ef.column_name"])
      .where("ef.entity_version_id", "=", row.version_id)
      .where("ef.is_active", "=", true)
      .execute() as Array<{ name: string; column_name: string }>;
    return {
      entityCode: row.entity_code ?? row.name,
      tableSchema: row.table_schema,
      tableName: row.table_name,
      naturalKeyFields: resolveNaturalKeyFields(row.identity_config),
      fieldColumns: new Map(fields.map((field) => [field.name, field.column_name])),
      primaryKey: "id",
      tenantColumn: "tenant_id",
    };
  }

  async resolveRecordId(entityCode: string, suppliedId: string, tenantId: string, plane?: ExecutionDescriptorPlane): Promise<string | null> {
    if (UUID_RE.test(suppliedId)) return suppliedId;
    const descriptor = await this.resolve(entityCode, tenantId, plane);
    if (!descriptor) return null;
    const keys = descriptor.naturalKeyFields;
    if (keys.length === 0) return null;
    const table = `${descriptor.tableSchema}.${descriptor.tableName}` as `${string}.${string}`;
    const row = await (this.db.selectFrom(table) as any)
      .select(descriptor.primaryKey)
      .where(descriptor.tenantColumn, "=", tenantId)
      .where((eb: any) => eb.or(keys.map((key) =>
        eb(descriptor.fieldColumns.get(key) ?? key, "=", suppliedId))))
      .executeTakeFirst() as Record<string, string> | undefined;
    return row?.[descriptor.primaryKey] ?? null;
  }
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
