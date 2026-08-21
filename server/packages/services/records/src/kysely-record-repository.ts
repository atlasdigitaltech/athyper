import type { PlaneKey } from "@athyper/server-foundation/context";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordFilter, RecordRepository, RecordRepositoryListInput } from "@athyper/server-contract-records";
import { sql, type Kysely, type RawBuilder, type Transaction } from "kysely";

type Schema = Record<string, never>;
export type RecordDatabase = Kysely<Schema>;
export type RecordTransaction = Transaction<Schema>;

export interface KyselyRecordRepositoryOptions {
  readonly databases: Partial<Readonly<Record<PlaneKey, RecordDatabase>>>;
}

export function createKyselyRecordRepository(options: KyselyRecordRepositoryOptions): RecordRepository<RecordTransaction> {
  const databaseFor = (descriptor: EntityRuntimeDescriptor): RecordDatabase => {
    const database = options.databases[descriptor.planeKey];
    if (!database) throw new Error(`No record database registered for ${descriptor.planeKey}`);
    return database;
  };
  return {
    async list(input) {
      const database = databaseFor(input.descriptor);
      const conditions = baseConditions(input.descriptor, input.tenantId);
      for (const filter of input.filters ?? []) conditions.push(filterCondition(input.descriptor, filter));
      if (input.search) conditions.push(searchCondition(input.descriptor, input.search));
      const order = orderBy(input);
      const offset = decodeCursor(input.cursor, input.descriptor.compiledHash);
      const result = await sql<Record<string, unknown>>`
        SELECT ${projection(input.descriptor, input.projection)} FROM ${table(input.descriptor)}
         WHERE ${sql.join(conditions, sql` AND `)}
         ${order} LIMIT ${input.limit + 1} OFFSET ${offset}
      `.execute(database);
      const hasMore = result.rows.length > input.limit;
      const rows = result.rows.slice(0, input.limit);
      let total: number | undefined;
      if (input.countMode === "exact") {
        const count = await sql<{ count: string | number | bigint }>`SELECT count(*) AS count FROM ${table(input.descriptor)} WHERE ${sql.join(conditions, sql` AND `)}`.execute(database);
        total = Number(count.rows[0]?.count ?? 0);
      }
      return { data: rows, pagination: { pageSize: rows.length, hasMore, ...(hasMore ? { nextCursor: encodeCursor(offset + input.limit, input.descriptor.compiledHash) } : {}), ...(total !== undefined ? { total } : {}), countMode: input.countMode ?? "none" } };
    },
    async get(descriptor, tenantId, recordId, projectionKeys, transaction) {
      const executor = transaction ?? databaseFor(descriptor);
      const result = await sql<Record<string, unknown>>`SELECT ${projection(descriptor, projectionKeys)} FROM ${table(descriptor)} WHERE ${sql.join([...baseConditions(descriptor, tenantId), sql`${sql.ref(descriptor.storage.idField)} = ${recordId}`], sql` AND `)} LIMIT 1`.execute(executor);
      return result.rows[0] ?? null;
    },
    async create(descriptor, tenantId, input, transaction) {
      const values = toStorage(descriptor, input);
      if (descriptor.storage.tenantField) values[descriptor.storage.tenantField] = tenantId;
      const entries = Object.entries(values);
      if (!entries.length) throw new Error("Cannot create an empty record");
      const result = await sql<Record<string, unknown>>`INSERT INTO ${table(descriptor)} (${sql.join(entries.map(([key]) => sql.ref(key)))}) VALUES (${sql.join(entries.map(([, value]) => sql`${value}`))}) RETURNING *`.execute(transaction);
      const row = result.rows[0]; if (!row) throw new Error("Record insert returned no row"); return row;
    },
    async patch(descriptor, tenantId, recordId, input, expectedVersion, transaction) {
      const values = toStorage(descriptor, input);
      const assignments = Object.entries(values).map(([key, value]) => sql`${sql.ref(key)} = ${value}`);
      if (descriptor.storage.versionField) assignments.push(sql`${sql.ref(descriptor.storage.versionField)} = ${sql.ref(descriptor.storage.versionField)} + 1`);
      if (!assignments.length) throw new Error("Cannot apply an empty record patch");
      const conditions = [...baseConditions(descriptor, tenantId), sql`${sql.ref(descriptor.storage.idField)} = ${recordId}`];
      if (descriptor.storage.versionField && expectedVersion !== undefined) conditions.push(sql`${sql.ref(descriptor.storage.versionField)} = ${expectedVersion}`);
      const result = await sql<Record<string, unknown>>`UPDATE ${table(descriptor)} SET ${sql.join(assignments)} WHERE ${sql.join(conditions, sql` AND `)} RETURNING *`.execute(transaction);
      if (result.rows[0]) return { record: result.rows[0] };
      return conflictOrMissing(descriptor, tenantId, recordId, expectedVersion, transaction);
    },
    async delete(descriptor, tenantId, recordId, expectedVersion, transaction) {
      const conditions = [...baseConditions(descriptor, tenantId), sql`${sql.ref(descriptor.storage.idField)} = ${recordId}`];
      if (descriptor.storage.versionField && expectedVersion !== undefined) conditions.push(sql`${sql.ref(descriptor.storage.versionField)} = ${expectedVersion}`);
      const statement = descriptor.storage.softDeleteField
        ? sql<Record<string, unknown>>`UPDATE ${table(descriptor)} SET ${sql.ref(descriptor.storage.softDeleteField)} = clock_timestamp()${descriptor.storage.versionField ? sql`, ${sql.ref(descriptor.storage.versionField)} = ${sql.ref(descriptor.storage.versionField)} + 1` : sql``} WHERE ${sql.join(conditions, sql` AND `)} RETURNING *`
        : sql<Record<string, unknown>>`DELETE FROM ${table(descriptor)} WHERE ${sql.join(conditions, sql` AND `)} RETURNING *`;
      const result = await statement.execute(transaction);
      if (result.rows[0]) return { deleted: true };
      const conflict = await conflictOrMissing(descriptor, tenantId, recordId, expectedVersion, transaction);
      return { deleted: false, ...(conflict.versionConflict !== undefined ? { versionConflict: conflict.versionConflict } : {}) };
    },
  };
}

function table(descriptor: EntityRuntimeDescriptor) { return sql.table(`${descriptor.storage.schema}.${descriptor.storage.object}`); }
function projection(descriptor: EntityRuntimeDescriptor, keys: readonly string[]): RawBuilder<unknown> { const selected = keys.map((key) => { const field = descriptor.fields.find((item) => item.key === key); if (!field) throw new Error(`Unknown projection field: ${key}`); return sql`${sql.ref(field.storagePath)} AS ${sql.ref(key)}`; }); const storage = new Set(descriptor.fields.filter((field) => keys.includes(field.key)).map((field) => field.storagePath)); for (const key of [descriptor.storage.idField, descriptor.storage.versionField, descriptor.storage.statusField].filter((item): item is string => Boolean(item))) if (!storage.has(key)) selected.push(sql.ref(key)); return sql.join(selected); }
function baseConditions(descriptor: EntityRuntimeDescriptor, tenantId: string): RawBuilder<unknown>[] { const conditions: RawBuilder<unknown>[] = []; if (descriptor.storage.tenantField) conditions.push(sql`${sql.ref(descriptor.storage.tenantField)} = ${tenantId}::uuid`); if (descriptor.storage.softDeleteField) conditions.push(sql`${sql.ref(descriptor.storage.softDeleteField)} IS NULL`); return conditions.length ? conditions : [sql`TRUE`]; }
function fieldPath(descriptor: EntityRuntimeDescriptor, key: string): string { const field = descriptor.fields.find((item) => item.key === key); if (!field) throw new Error(`Unknown descriptor field: ${key}`); return field.storagePath; }
function filterCondition(descriptor: EntityRuntimeDescriptor, filter: RecordFilter): RawBuilder<unknown> { const ref = sql.ref(fieldPath(descriptor, filter.field)); switch (filter.operator) { case "eq": return sql`${ref} = ${filter.value}`; case "ne": return sql`${ref} IS DISTINCT FROM ${filter.value}`; case "gt": return sql`${ref} > ${filter.value}`; case "gte": return sql`${ref} >= ${filter.value}`; case "lt": return sql`${ref} < ${filter.value}`; case "lte": return sql`${ref} <= ${filter.value}`; case "is_null": return sql`${ref} IS NULL`; case "is_not_null": return sql`${ref} IS NOT NULL`; case "in": { if (!Array.isArray(filter.value) || !filter.value.length) return sql`FALSE`; return sql`${ref} IN (${sql.join(filter.value.map((value) => sql`${value}`))})`; } } }
function searchCondition(descriptor: EntityRuntimeDescriptor, search: string): RawBuilder<unknown> { const fields = descriptor.fields.filter((field) => field.searchable); if (!fields.length) return sql`FALSE`; return sql`(${sql.join(fields.map((field) => sql`${sql.ref(field.storagePath)}::text ILIKE ${`%${search}%`}`), sql` OR `)})`; }
function orderBy(input: RecordRepositoryListInput): RawBuilder<unknown> { const items = (input.sort ?? []).map((item) => sql`${sql.ref(fieldPath(input.descriptor, item.field))} ${item.direction === "desc" ? sql`DESC` : sql`ASC`} ${item.nulls === "first" ? sql`NULLS FIRST` : item.nulls === "last" ? sql`NULLS LAST` : sql``}`); items.push(sql`${sql.ref(input.descriptor.storage.idField)} ASC`); return sql`ORDER BY ${sql.join(items)}`; }
function toStorage(descriptor: EntityRuntimeDescriptor, input: Readonly<Record<string, unknown>>): Record<string, unknown> { const fields = new Map(descriptor.fields.map((field) => [field.key, field.storagePath])); return Object.fromEntries(Object.entries(input).map(([key, value]) => [fields.get(key) ?? key, value])); }
async function conflictOrMissing(descriptor: EntityRuntimeDescriptor, tenantId: string, recordId: string, expectedVersion: number | undefined, transaction: RecordTransaction): Promise<{ record: null; versionConflict?: number }> { if (!descriptor.storage.versionField || expectedVersion === undefined) return { record: null }; const result = await sql<Record<string, unknown>>`SELECT ${sql.ref(descriptor.storage.versionField)} FROM ${table(descriptor)} WHERE ${sql.join([...baseConditions(descriptor, tenantId), sql`${sql.ref(descriptor.storage.idField)} = ${recordId}`], sql` AND `)} LIMIT 1`.execute(transaction); const value = result.rows[0]?.[descriptor.storage.versionField]; return typeof value === "number" ? { record: null, versionConflict: value } : { record: null }; }
function encodeCursor(offset: number, hash: string): string { return Buffer.from(JSON.stringify({ offset, hash }), "utf8").toString("base64url"); }
function decodeCursor(cursor: string | undefined, hash: string): number { if (!cursor) return 0; try { const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { offset?: unknown; hash?: unknown }; if (parsed.hash !== hash || !Number.isInteger(parsed.offset) || Number(parsed.offset) < 0) throw new Error(); return Number(parsed.offset); } catch { throw new Error("Invalid or stale record cursor"); } }
