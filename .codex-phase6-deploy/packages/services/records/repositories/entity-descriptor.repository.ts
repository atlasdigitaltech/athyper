/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic tables are descriptor-validated */
import type { Kysely } from "kysely";
import { type ExecutionDescriptorPlane, type ExecutionDescriptorProvider } from "@athyper/svc-metadata";

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
    if (!this.executionDescriptors || !tenantId || !plane) return null;
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
