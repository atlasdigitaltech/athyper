import { validateDirectoryFieldConstraint } from "./directory-field-constraint.js";
import { entityListRelativeDateRange } from "@athyper/contract-platform-entity-list";
import { compileStandardViewRelationship } from "./standard-view-relationship-sql.js";
import { validateFilterValue } from "./filter-value-validation.js";
import { documentCollectionRegistry, parseCollectionRelationship, DOCUMENT_RELATIONSHIP_RESOLVER } from "@athyper/server-contract-metadata";
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
  /** Trusted server registrations for scope kinds owned outside the shared repository. */
  readonly scopeCompilers?: readonly RecordCollectionScopeSqlCompiler[];
}

export interface RecordCollectionScopeSqlCompiler {
  readonly kind: RecordRepositoryListInput["collectionScope"][number]["kind"];
  compile(descriptor: EntityRuntimeDescriptor, tenantId: string, constraint: RecordRepositoryListInput["collectionScope"][number]): RawBuilder<unknown>;
}

export function createKyselyRecordRepository(options: KyselyRecordRepositoryOptions): RecordRepository<RecordTransaction> {
  const scopeCompilers = new Map(options.scopeCompilers?.map(compiler => [compiler.kind, compiler]));
  if (scopeCompilers.size !== (options.scopeCompilers?.length ?? 0)) throw new Error("Duplicate record scope SQL compiler");
  const databaseFor = (descriptor: EntityRuntimeDescriptor): RecordDatabase => {
    const database = options.databases[descriptor.planeKey];
    if (!database) throw new Error(`No record database registered for ${descriptor.planeKey}`);
    return database;
  };
  return {
    async list(input, transaction) {
      const executor = transaction ?? databaseFor(input.descriptor);
      const conditions = baseConditions(input.descriptor, input.tenantId, "read");
      if (input.recordIds !== undefined && !input.recordIds.length) conditions.push(sql`FALSE`);
      if (input.recordIds?.length) conditions.push(sql`${sql.ref(input.descriptor.storage.idField)} IN (${sql.join(input.recordIds.map((id) => sql`${id}::uuid`))})`);
      for (const constraint of input.collectionScope) conditions.push(compileRecordCollectionScopeCondition(input.descriptor, input.tenantId, constraint, scopeCompilers));
      for (const relationship of input.viewRelationships ?? []) conditions.push(compileStandardViewRelationship(input.descriptor, input.tenantId, relationship));
      for (const filter of input.filters ?? []) {
        validateFilterValue(filter, input.descriptor.fields.find((field) => field.key === filter.field)?.type);
        conditions.push(filterCondition(input.descriptor, filter));
      }
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
      // Group counts follow the count-mode rule (layout foundation section 5): the
      // full-set GROUP BY runs only under exact counts.
      const groups = input.group && input.countMode === "exact" ? await groupBuckets(input, conditions, executor) : undefined;
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
      const result = await sql<Record<string, unknown>>`SELECT ${projection(descriptor, projectionKeys)} FROM ${table(descriptor)} WHERE ${sql.join([...baseConditions(descriptor, tenantId, "read"), sql`${sql.ref(descriptor.storage.idField)} = ${recordId}`], sql` AND `)} LIMIT 1`.execute(executor);
      return result.rows[0] ?? null;
    },
    async create(descriptor, tenantId, input, transaction) {
      const values = toStorage(descriptor, input);
      if (descriptor.storage.tenantField) values[descriptor.storage.tenantField] = tenantId;
      const entries = Object.entries(values);
      if (!entries.length) throw new Error("Cannot create an empty record");
      const result = await sql<Record<string, unknown>>`INSERT INTO ${table(descriptor)} (${sql.join(entries.map(([key]) => sql.ref(key)))}) VALUES (${sql.join(entries.map(([, value]) => sql`${value}`))}) RETURNING ${projection(descriptor, descriptor.fields.map(field => field.key))}`.execute(transaction);
      const row = result.rows[0]; if (!row) throw new Error("Record insert returned no row"); return row;
    },
    async patch(descriptor, tenantId, recordId, input, expectedVersion, transaction) {
      const values = toStorage(descriptor, input);
      const assignments = Object.entries(values).map(([key, value]) => sql`${sql.ref(key)} = ${value}`);
      if (descriptor.storage.versionField) assignments.push(sql`${sql.ref(descriptor.storage.versionField)} = ${sql.ref(descriptor.storage.versionField)} + 1`);
      if (!assignments.length) throw new Error("Cannot apply an empty record patch");
      const conditions = [...baseConditions(descriptor, tenantId), sql`${sql.ref(descriptor.storage.idField)} = ${recordId}`];
      if (descriptor.storage.versionField && expectedVersion !== undefined) conditions.push(sql`${sql.ref(descriptor.storage.versionField)} = ${expectedVersion}`);
      const result = await sql<Record<string, unknown>>`UPDATE ${table(descriptor)} SET ${sql.join(assignments)} WHERE ${sql.join(conditions, sql` AND `)} RETURNING ${projection(descriptor, descriptor.fields.map(field => field.key))}`.execute(transaction);
      if (result.rows[0]) return { record: result.rows[0] };
      return conflictOrMissing(descriptor, tenantId, recordId, expectedVersion, transaction);
    },
    async delete(descriptor, tenantId, recordId, expectedVersion, transaction) {
      const conditions = [...baseConditions(descriptor, tenantId), sql`${sql.ref(descriptor.storage.idField)} = ${recordId}`];
      if (descriptor.storage.versionField && expectedVersion !== undefined) conditions.push(sql`${sql.ref(descriptor.storage.versionField)} = ${expectedVersion}`);
      const statement = descriptor.storage.softDeleteField
        ? sql<Record<string, unknown>>`UPDATE ${table(descriptor)} SET ${sql.ref(descriptor.storage.softDeleteField)} = clock_timestamp()${descriptor.storage.versionField ? sql`, ${sql.ref(descriptor.storage.versionField)} = ${sql.ref(descriptor.storage.versionField)} + 1` : sql``} WHERE ${sql.join(conditions, sql` AND `)} RETURNING ${projection(descriptor, descriptor.fields.map(field => field.key))}`
        : sql<Record<string, unknown>>`DELETE FROM ${table(descriptor)} WHERE ${sql.join(conditions, sql` AND `)} RETURNING ${projection(descriptor, descriptor.fields.map(field => field.key))}`;
      const result = await statement.execute(transaction);
      if (result.rows[0]) return { deleted: true };
      const conflict = await conflictOrMissing(descriptor, tenantId, recordId, expectedVersion, transaction);
      return { deleted: false, ...(conflict.versionConflict !== undefined ? { versionConflict: conflict.versionConflict } : {}) };
    },
  };
}

function table(descriptor: EntityRuntimeDescriptor) { return sql.table(`${descriptor.storage.schema}.${descriptor.storage.object}`); }
function projection(descriptor: EntityRuntimeDescriptor, keys: readonly string[]): RawBuilder<unknown> { const selected = keys.map((key) => { const field = descriptor.fields.find((item) => item.key === key); if (!field) throw new Error(`Unknown projection field: ${key}`); return sql`${sql.ref(field.storagePath)} AS ${sql.ref(key)}`; }); const outputKeys = new Set(keys); for (const key of [descriptor.storage.idField, descriptor.storage.versionField, descriptor.storage.statusField].filter((item): item is string => Boolean(item))) if (!outputKeys.has(key)) selected.push(sql.ref(key)); return sql.join(selected); }
/** `read` may admit platform-owned rows when the descriptor opts in; `write`
 * (patch/delete/conflict probes) is always tenant-exact. */
function baseConditions(descriptor: EntityRuntimeDescriptor, tenantId: string, access: "read" | "write" = "write"): RawBuilder<unknown>[] { const conditions: RawBuilder<unknown>[] = (descriptor.recordPredicates??[]).map(predicate=>filterCondition(descriptor,predicate)); if (descriptor.storage.tenantField) conditions.push(access === "read" && descriptor.storage.tenantVisibility === "tenant_or_platform" ? sql`(${sql.ref(descriptor.storage.tenantField)} IS NULL OR ${sql.ref(descriptor.storage.tenantField)} = ${tenantId}::uuid)` : sql`${sql.ref(descriptor.storage.tenantField)} = ${tenantId}::uuid`); if (descriptor.storage.softDeleteField) conditions.push(sql`${sql.ref(descriptor.storage.softDeleteField)} IS NULL`); return conditions.length ? conditions : [sql`TRUE`]; }
/** @internal Exported for SQL contract verification; callers must use resolver-issued constraints. */
export function compileRecordCollectionScopeCondition(descriptor: EntityRuntimeDescriptor, tenantId: string, constraint: RecordRepositoryListInput["collectionScope"][number], compilers?: ReadonlyMap<string, RecordCollectionScopeSqlCompiler>): RawBuilder<unknown> {
  const registered = compilers?.get(constraint.kind);
  if (registered) return registered.compile(descriptor, tenantId, constraint);
  if (constraint.kind === "entity.parent.v1" || constraint.kind === "entity.directory.fields.v1") {
    validateDirectoryFieldConstraint(descriptor, constraint);
    if (descriptor.entityCode !== constraint.entityCode || descriptor.storage.schema !== constraint.storageSchema || descriptor.storage.object !== constraint.storageObject || !constraint.predicates.length)
      throw new Error("Parent scope storage mismatch");
    return sql`(${sql.join(constraint.predicates.map(predicate => {
      const field = descriptor.fields.find(field => field.key === predicate.field);
      if (!field) throw new Error("Parent scope field unavailable");
      return sql`${sql.ref(field.storagePath)} = ${predicate.value}`;
    }), sql` AND `)})`;
  }
  if (constraint.kind === DOCUMENT_RELATIONSHIP_RESOLVER) {
    const binding = parseCollectionRelationship(descriptor.collectionRelationship, descriptor.storage);
    const source = documentCollectionRegistry[binding.sourceRef], scope = source.scopeFields[binding.scope.fieldRef];
    const root = (column:string) => sql.ref(`${source.object}.${column}`), related = (column:string) => sql.ref(`list_scope_related.${column}`);
    return sql`(${root(source.subjectFields[binding.subject.fieldRef])} = ${binding.subject.value} AND EXISTS (
      SELECT 1 FROM ${sql.table(`${scope.schema}.${scope.object}`)} AS list_scope_related
      WHERE ${related(scope.tenantField)} = ${tenantId}::uuid
        AND ${related(scope.tenantField)} = ${root(source.tenantField)}
        AND ${related(scope.targetField)} = ${root(scope.sourceField)}
        AND NULLIF(${related(scope.column)}->>${scope.jsonKey},'')::uuid = ${constraint.operatingOrganizationId}::uuid
    ))`;
  }
  throw new Error("Unsupported record collection scope kind");
}
function fieldPath(descriptor: EntityRuntimeDescriptor, key: string): string { const field = descriptor.fields.find((item) => item.key === key); if (!field) throw new Error(`Unknown descriptor field: ${key}`); return field.storagePath; }
function filterCondition(descriptor: EntityRuntimeDescriptor, filter: RecordFilter): RawBuilder<unknown> { const ref = sql.ref(fieldPath(descriptor, filter.field)); switch (filter.operator) { case "eq": return sql`${ref} = ${filter.value}`; case "ne": return sql`${ref} IS DISTINCT FROM ${filter.value}`; case "contains": return sql`${ref}::text ILIKE ${`%${escapeLike(String(filter.value ?? ""))}%`} ESCAPE '\\'`; case "starts_with": return sql`${ref}::text ILIKE ${`${escapeLike(String(filter.value ?? ""))}%`} ESCAPE '\\'`; case "gt": return sql`${ref} > ${filter.value}`; case "gte": return sql`${ref} >= ${filter.value}`; case "lt": return sql`${ref} < ${filter.value}`; case "lte": return sql`${ref} <= ${filter.value}`; case "between": { if (!Array.isArray(filter.value) || filter.value.length !== 2) return sql`FALSE`; return sql`${ref} BETWEEN ${filter.value[0]} AND ${filter.value[1]}`; } case "is_null": return sql`${ref} IS NULL`; case "is_not_null": return sql`${ref} IS NOT NULL`; case "in": { if (!Array.isArray(filter.value) || !filter.value.length) return sql`FALSE`; return sql`${ref} IN (${sql.join(filter.value.map((value) => sql`${value}`))})`; } case "relative": return relativeDateCondition(ref, filter.value); } }
export function searchCondition(descriptor: EntityRuntimeDescriptor, search: string): RawBuilder<unknown> { const fields = descriptor.fields.filter((field) => field.searchable); if (!fields.length) return sql`FALSE`; const pattern = `%${escapeLike(search)}%`; return sql`(${sql.join(fields.map((field) => sql`${sql.ref(field.storagePath)}::text ILIKE ${pattern} ESCAPE '\\'`), sql` OR `)})`; }
function escapeLike(value: string): string { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
export function relativeDateCondition(ref: RawBuilder<unknown>, value: unknown): RawBuilder<unknown> {
  const range = entityListRelativeDateRange(value);
  if (!range) return sql`FALSE`;
  // Offsets come from the shared contract table, never from request input.
  const bound = (offset: number) => range.kind === "days"
    ? sql.raw(`CURRENT_DATE + INTERVAL '${offset} days'`)
    : sql.raw(`date_trunc('${range.unit}', CURRENT_DATE) + INTERVAL '${range.unit === "quarter" ? offset * 3 : offset} ${range.unit === "quarter" ? "months" : `${range.unit}s`}'`);
  return sql`${ref} >= ${bound(range.from)} AND ${ref} < ${bound(range.to)}`;
}
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
function toStorage(descriptor: EntityRuntimeDescriptor, input: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const fields = new Map(descriptor.fields.map((field) => [field.key, field.storagePath]));
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    const column = fields.get(key);
    if (!column) throw Object.assign(new Error("Unknown record input field"), { code: "RECORD_INPUT_FIELD_UNKNOWN", statusCode: 400 });
    return [column, value];
  }));
}
async function conflictOrMissing(descriptor: EntityRuntimeDescriptor, tenantId: string, recordId: string, expectedVersion: number | undefined, transaction: RecordTransaction): Promise<{ record: null; versionConflict?: number }> { if (!descriptor.storage.versionField || expectedVersion === undefined) return { record: null }; const result = await sql<Record<string, unknown>>`SELECT ${sql.ref(descriptor.storage.versionField)} FROM ${table(descriptor)} WHERE ${sql.join([...baseConditions(descriptor, tenantId), sql`${sql.ref(descriptor.storage.idField)} = ${recordId}`], sql` AND `)} LIMIT 1`.execute(transaction); const value = result.rows[0]?.[descriptor.storage.versionField]; const numeric = typeof value === "number" || typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : NaN; return Number.isSafeInteger(numeric) && numeric > 0 ? { record: null, versionConflict: numeric } : { record: null }; }
