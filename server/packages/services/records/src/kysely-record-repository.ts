import type { PlaneKey } from "@athyper/server-foundation/context";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordFilter, RecordRepository, RecordRepositoryListInput } from "@athyper/server-contract-records";
import { sql, type Kysely, type RawBuilder, type Transaction } from "kysely";
import { decodeRecordCursor, encodeRecordCursor, type DecodedRecordCursor } from "./record-cursor.js";

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
    async list(input, transaction) {
      const executor = transaction ?? databaseFor(input.descriptor);
      const conditions = baseConditions(input.descriptor, input.tenantId);
      if (input.recordIds?.length) conditions.push(sql`${sql.ref(input.descriptor.storage.idField)} IN (${sql.join(input.recordIds.map((id) => sql`${id}::uuid`))})`);
      for (const constraint of input.collectionScope) conditions.push(compileRecordCollectionScopeCondition(input.descriptor, input.tenantId, constraint));
      for (const filter of input.filters ?? []) conditions.push(filterCondition(input.descriptor, filter));
      if (input.search) conditions.push(searchCondition(input.descriptor, input.search));
      const order = orderBy(input);
      const cursor = decodeRecordCursor(input);
      const pageConditions = cursor ? [...conditions, cursorCondition(input, cursor)] : conditions;
      const result = await sql<Record<string, unknown>>`
        SELECT ${projection(input.descriptor, input.projection)} FROM ${table(input.descriptor)}
         WHERE ${sql.join(pageConditions, sql` AND `)}
         ${order} LIMIT ${input.limit + 1}
      `.execute(executor);
      const hasMore = result.rows.length > input.limit;
      const rows = result.rows.slice(0, input.limit);
      const groups = input.group ? await groupBuckets(input, conditions, executor) : undefined;
      let total: number | undefined;
      if (input.countMode === "exact" && groups) {
        total = groups.reduce((sum, bucket) => sum + bucket.count, 0);
      } else if (input.countMode === "exact") {
        const count = await sql<{ count: string | number | bigint }>`SELECT count(*) AS count FROM ${table(input.descriptor)} WHERE ${sql.join(conditions, sql` AND `)}`.execute(executor);
        total = Number(count.rows[0]?.count ?? 0);
      }
      const countMode = input.countMode === "exact" ? "exact" : "none";
      const last = rows.at(-1);
      return { data: rows, ...(groups ? { groups } : {}), pagination: { pageSize: rows.length, hasMore, ...(hasMore && last ? { nextCursor: encodeRecordCursor(input, last) } : {}), ...(total !== undefined ? { total } : {}), countMode } };
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
function projection(descriptor: EntityRuntimeDescriptor, keys: readonly string[]): RawBuilder<unknown> { const selected = keys.map((key) => { const field = descriptor.fields.find((item) => item.key === key); if (!field) throw new Error(`Unknown projection field: ${key}`); return sql`${sql.ref(field.storagePath)} AS ${sql.ref(key)}`; }); const outputKeys = new Set(keys); for (const key of [descriptor.storage.idField, descriptor.storage.versionField, descriptor.storage.statusField].filter((item): item is string => Boolean(item))) if (!outputKeys.has(key)) selected.push(sql.ref(key)); return sql.join(selected); }
function baseConditions(descriptor: EntityRuntimeDescriptor, tenantId: string): RawBuilder<unknown>[] { const conditions: RawBuilder<unknown>[] = []; if (descriptor.storage.tenantField) conditions.push(sql`${sql.ref(descriptor.storage.tenantField)} = ${tenantId}::uuid`); if (descriptor.storage.softDeleteField) conditions.push(sql`${sql.ref(descriptor.storage.softDeleteField)} IS NULL`); return conditions.length ? conditions : [sql`TRUE`]; }
/** @internal Exported for SQL contract verification; callers must use resolver-issued constraints. */
export function compileRecordCollectionScopeCondition(descriptor: EntityRuntimeDescriptor, tenantId: string, constraint: RecordRepositoryListInput["collectionScope"][number]): RawBuilder<unknown> {
  if (constraint.kind === "neon.business_partner.operating_organization.v1") {
    if (descriptor.planeKey !== "neon" || descriptor.storage.schema !== "master" || descriptor.storage.object !== "business_partner") throw new Error("Business-partner collection scope cannot be applied to this descriptor");
    return sql`EXISTS (
      SELECT 1
        FROM master.business_partner_operating_organization_assignment AS list_scope_assignment
       WHERE list_scope_assignment.tenant_id = ${tenantId}::uuid
         AND list_scope_assignment.business_partner_id = ${sql.ref(`business_partner.${descriptor.storage.idField}`)}
         AND list_scope_assignment.operating_organization_id = ${constraint.operatingOrganizationId}::uuid
         AND list_scope_assignment.status = 'active'
         AND list_scope_assignment.effective_from <= CURRENT_DATE
         AND (list_scope_assignment.effective_until IS NULL OR list_scope_assignment.effective_until > CURRENT_DATE)
    )`;
  }
  if (constraint.kind === "mesh.network_relationship.actor_account.v1") {
    if (descriptor.planeKey !== "mesh" || descriptor.storage.schema !== "mesh" || descriptor.storage.object !== "network_relationship") throw new Error("Network-relationship collection scope cannot be applied to this descriptor");
    return sql`(
      (${sql.ref("network_relationship.buyer_tenant_id")} = ${tenantId}::uuid AND ${sql.ref("network_relationship.buyer_account_id")} = ${constraint.networkAccountId}::uuid)
      OR
      (${sql.ref("network_relationship.supplier_tenant_id")} = ${tenantId}::uuid AND ${sql.ref("network_relationship.supplier_account_id")} = ${constraint.networkAccountId}::uuid)
    )`;
  }
  if (constraint.kind === "studio.metadata_entity.catalog.v1") {
    if (descriptor.planeKey !== "studio" || descriptor.storage.schema !== "metadata" || descriptor.storage.object !== "entity") throw new Error("Metadata-entity catalog scope cannot be applied to this descriptor");
    return sql`(${sql.ref("entity.tenant_id")} IS NULL OR ${sql.ref("entity.tenant_id")} = ${constraint.tenantId}::uuid)`;
  }
  throw new Error("Unsupported record collection scope kind");
}
function fieldPath(descriptor: EntityRuntimeDescriptor, key: string): string { const field = descriptor.fields.find((item) => item.key === key); if (!field) throw new Error(`Unknown descriptor field: ${key}`); return field.storagePath; }
function filterCondition(descriptor: EntityRuntimeDescriptor, filter: RecordFilter): RawBuilder<unknown> { const ref = sql.ref(fieldPath(descriptor, filter.field)); switch (filter.operator) { case "eq": return sql`${ref} = ${filter.value}`; case "ne": return sql`${ref} IS DISTINCT FROM ${filter.value}`; case "contains": return sql`${ref}::text ILIKE ${`%${escapeLike(String(filter.value ?? ""))}%`} ESCAPE '\\'`; case "starts_with": return sql`${ref}::text ILIKE ${`${escapeLike(String(filter.value ?? ""))}%`} ESCAPE '\\'`; case "gt": return sql`${ref} > ${filter.value}`; case "gte": return sql`${ref} >= ${filter.value}`; case "lt": return sql`${ref} < ${filter.value}`; case "lte": return sql`${ref} <= ${filter.value}`; case "between": { if (!Array.isArray(filter.value) || filter.value.length !== 2) return sql`FALSE`; return sql`${ref} BETWEEN ${filter.value[0]} AND ${filter.value[1]}`; } case "is_null": return sql`${ref} IS NULL`; case "is_not_null": return sql`${ref} IS NOT NULL`; case "in": { if (!Array.isArray(filter.value) || !filter.value.length) return sql`FALSE`; return sql`${ref} IN (${sql.join(filter.value.map((value) => sql`${value}`))})`; } case "relative": return relativeDateCondition(ref, filter.value); } }
function searchCondition(descriptor: EntityRuntimeDescriptor, search: string): RawBuilder<unknown> { const fields = descriptor.fields.filter((field) => field.searchable); if (!fields.length) return sql`FALSE`; return sql`(${sql.join(fields.map((field) => sql`${sql.ref(field.storagePath)}::text ILIKE ${`%${search}%`}`), sql` OR `)})`; }
function escapeLike(value: string): string { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
function relativeDateCondition(ref: RawBuilder<unknown>, value: unknown): RawBuilder<unknown> { switch (value) { case "today": return sql`${ref} >= CURRENT_DATE AND ${ref} < CURRENT_DATE + INTERVAL '1 day'`; case "yesterday": return sql`${ref} >= CURRENT_DATE - INTERVAL '1 day' AND ${ref} < CURRENT_DATE`; case "tomorrow": return sql`${ref} >= CURRENT_DATE + INTERVAL '1 day' AND ${ref} < CURRENT_DATE + INTERVAL '2 days'`; case "last_7_days": return sql`${ref} >= CURRENT_DATE - INTERVAL '7 days' AND ${ref} < CURRENT_DATE + INTERVAL '1 day'`; case "last_30_days": return sql`${ref} >= CURRENT_DATE - INTERVAL '30 days' AND ${ref} < CURRENT_DATE + INTERVAL '1 day'`; case "next_7_days": return sql`${ref} >= CURRENT_DATE AND ${ref} < CURRENT_DATE + INTERVAL '8 days'`; case "next_30_days": return sql`${ref} >= CURRENT_DATE AND ${ref} < CURRENT_DATE + INTERVAL '31 days'`; case "this_week": return sql`${ref} >= date_trunc('week', CURRENT_DATE) AND ${ref} < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week'`; case "this_month": return sql`${ref} >= date_trunc('month', CURRENT_DATE) AND ${ref} < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`; default: return sql`FALSE`; } }
async function groupBuckets(input: RecordRepositoryListInput, conditions: readonly RawBuilder<unknown>[], executor: RecordDatabase | RecordTransaction) { const ref = sql.ref(fieldPath(input.descriptor, input.group!)); const result = await sql<{ value: unknown; count: string | number | bigint }>`SELECT ${ref} AS value, count(*) AS count FROM ${table(input.descriptor)} WHERE ${sql.join(conditions, sql` AND `)} GROUP BY ${ref} ORDER BY ${ref} ASC`.execute(executor); return Object.freeze(result.rows.map((row) => Object.freeze({ value: row.value, count: Number(row.count) }))); }
function orderBy(input: RecordRepositoryListInput): RawBuilder<unknown> { const items = (input.sort ?? []).map((item) => sql`${sql.ref(fieldPath(input.descriptor, item.field))} ${item.direction === "desc" ? sql`DESC` : sql`ASC`} ${item.nulls === "first" ? sql`NULLS FIRST` : item.nulls === "last" ? sql`NULLS LAST` : sql``}`); items.push(sql`${sql.ref(input.descriptor.storage.idField)} ASC`); return sql`ORDER BY ${sql.join(items)}`; }
function cursorCondition(input: RecordRepositoryListInput, cursor: DecodedRecordCursor): RawBuilder<unknown> {
  const alternatives: RawBuilder<unknown>[] = [];
  const equalPrefix: RawBuilder<unknown>[] = [];
  for (const [index, item] of (input.sort ?? []).entries()) {
    const ref = sql.ref(fieldPath(input.descriptor, item.field));
    alternatives.push(sql`(${sql.join([...equalPrefix, after(ref, cursor.values[index] ?? null, item.direction, item.nulls)], sql` AND `)})`);
    equalPrefix.push(sql`${ref} IS NOT DISTINCT FROM ${cursor.values[index] ?? null}`);
  }
  alternatives.push(sql`(${sql.join([...equalPrefix, sql`${sql.ref(input.descriptor.storage.idField)} > ${cursor.id}`], sql` AND `)})`);
  return sql`(${sql.join(alternatives, sql` OR `)})`;
}
function after(ref: RawBuilder<unknown>, value: string | number | boolean | null, direction: "asc" | "desc", requestedNulls: "first" | "last" | undefined): RawBuilder<unknown> {
  const nulls = requestedNulls ?? (direction === "asc" ? "last" : "first");
  if (value === null) return nulls === "first" ? sql`${ref} IS NOT NULL` : sql`FALSE`;
  const comparison = direction === "asc" ? sql`${ref} > ${value}` : sql`${ref} < ${value}`;
  return nulls === "last" ? sql`(${comparison} OR ${ref} IS NULL)` : comparison;
}
function toStorage(descriptor: EntityRuntimeDescriptor, input: Readonly<Record<string, unknown>>): Record<string, unknown> { const fields = new Map(descriptor.fields.map((field) => [field.key, field.storagePath])); return Object.fromEntries(Object.entries(input).map(([key, value]) => [fields.get(key) ?? key, value])); }
async function conflictOrMissing(descriptor: EntityRuntimeDescriptor, tenantId: string, recordId: string, expectedVersion: number | undefined, transaction: RecordTransaction): Promise<{ record: null; versionConflict?: number }> { if (!descriptor.storage.versionField || expectedVersion === undefined) return { record: null }; const result = await sql<Record<string, unknown>>`SELECT ${sql.ref(descriptor.storage.versionField)} FROM ${table(descriptor)} WHERE ${sql.join([...baseConditions(descriptor, tenantId), sql`${sql.ref(descriptor.storage.idField)} = ${recordId}`], sql` AND `)} LIMIT 1`.execute(transaction); const value = result.rows[0]?.[descriptor.storage.versionField]; return typeof value === "number" ? { record: null, versionConflict: value } : { record: null }; }
