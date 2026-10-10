import { validateDirectoryFieldConstraint } from "./directory-field-constraint.js";
import { LIST_AGGREGATE_MAX_COLUMNS, LIST_GROUP_LIMIT, entityListRelativeDateRange, exactAggregate, isExactDecimal } from "@athyper/contract-platform-entity-list";
import { compileStandardViewRelationship } from "./standard-view-relationship-sql.js";
import { validateFilterValue } from "./filter-value-validation.js";
import { documentCollectionRegistry, parseCollectionRelationship, DOCUMENT_RELATIONSHIP_RESOLVER } from "@athyper/server-contract-metadata";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordFilter, RecordListResult, RecordRank, RecordRepository, RecordRepositoryListInput } from "@athyper/server-contract-records";
import { assembleTreeMatches } from "./tree-matches.js";
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
    async selfReferenceKeyColumns(descriptor, constraint) {
      // Read after the failed commit, outside any transaction.
      const result = await sql<{ columns: string[] | null }>`
        SELECT array_agg(attribute.attname::text ORDER BY key.position) AS columns
          FROM pg_catalog.pg_constraint AS foreign_key
          CROSS JOIN LATERAL unnest(foreign_key.conkey) WITH ORDINALITY AS key(attnum, position)
          JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = foreign_key.conrelid AND attribute.attnum = key.attnum
         WHERE foreign_key.contype = 'f' AND foreign_key.conname = ${constraint}
           AND foreign_key.conrelid = to_regclass(${`${descriptor.storage.schema}.${descriptor.storage.object}`})
           AND foreign_key.confrelid = foreign_key.conrelid
      `.execute(databaseFor(descriptor));
      return result.rows[0]?.columns ?? undefined;
    },
    async measureHierarchy(input, transaction) {
      // Two bounded recursive statements over the stored hierarchy (tenant and
      // soft delete only): hidden records still occupy depth.
      const executor = transaction ?? databaseFor(input.descriptor);
      const { descriptor, tenantId, bound } = input;
      const idPath = descriptor.storage.idField;
      const parentPath = fieldPath(descriptor, input.parentField);
      const stored = baseConditions(descriptor, tenantId, "read");
      let parentDepth = 0;
      let parentChainIncludesRecord = false;
      if (input.parentId) {
        const up = await sql<{ depth: number | string | null; cycle: boolean | null }>`
          WITH RECURSIVE "__tree_up" ("__up_id", "__up_parent", "__up_depth") AS (
            SELECT ${sql.ref(idPath)}, ${sql.ref(parentPath)}, 1 FROM ${table(descriptor)} WHERE ${sql.ref(idPath)} = ${input.parentId}::uuid AND ${sql.join(stored, sql` AND `)}
            UNION
            SELECT ${sql.ref(idPath)}, ${sql.ref(parentPath)}, "__tree_up"."__up_depth" + 1 FROM ${table(descriptor)}
              JOIN "__tree_up" ON ${sql.ref(idPath)} = "__tree_up"."__up_parent"
             WHERE "__tree_up"."__up_depth" < ${bound} AND ${sql.join(stored, sql` AND `)}
          )
          SELECT max("__up_depth") AS depth, bool_or("__up_id" = ${input.recordId}::uuid) AS cycle FROM "__tree_up"
        `.execute(executor);
        parentDepth = Number(up.rows[0]?.depth ?? 0);
        parentChainIncludesRecord = up.rows[0]?.cycle === true;
      }
      const down = await sql<{ height: number | string | null }>`
        WITH RECURSIVE "__tree_down" ("__down_id", "__down_height") AS (
          SELECT ${sql.ref(idPath)}, 1 FROM ${table(descriptor)} WHERE ${sql.ref(idPath)} = ${input.recordId}::uuid AND ${sql.join(stored, sql` AND `)}
          UNION
          SELECT ${sql.ref(idPath)}, "__tree_down"."__down_height" + 1 FROM ${table(descriptor)}
            JOIN "__tree_down" ON ${sql.ref(parentPath)} = "__tree_down"."__down_id"
           WHERE "__tree_down"."__down_height" < ${bound} AND ${sql.join(stored, sql` AND `)}
        )
        SELECT max("__down_height") AS height FROM "__tree_down"
      `.execute(executor);
      return { parentDepth, subtreeHeight: Number(down.rows[0]?.height ?? 1), parentChainIncludesRecord };
    },
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
      const tree = input.hierarchy ? hierarchySql(input, scopeCompilers) : undefined;
      if (tree?.orphanCondition) conditions.push(tree.orphanCondition);
      if (input.hierarchy?.mode === "matches" && tree) return listTreeMatches(input, conditions, tree, executor, scopeCompilers);
      if (input.groupsOnly && input.pivot && input.groupTotals) {
        // A Summary with a column dimension (Aggregate A2): one statement.
        const pivoted = await pivotBuckets(input, conditions, executor);
        return { data: [], groups: pivoted.buckets, parentGroup: pivoted.total, pivotColumns: pivoted.columns, ...(pivoted.columnsTruncated ? { pivotColumnsTruncated: true } : {}), ...(pivoted.truncated ? { groupsTruncated: true } : {}), ...pivoted.ranking, pagination: { pageSize: 0, hasMore: false, total: pivoted.total.count, countMode: "exact" as const } };
      }
      if (input.groupsOnly && input.groupTotals && input.groupOrder) {
        // Top / Bottom N (Aggregate A6): one statement, ordered by the measure.
        const ranked = await orderedGroupBuckets(input, conditions, executor);
        return { data: [], groups: ranked.buckets, parentGroup: ranked.total, ...(ranked.truncated ? { groupsTruncated: true } : {}), ...ranked.ranking, pagination: { pageSize: 0, hasMore: false, total: ranked.total.count, countMode: "exact" as const } };
      }
      if (input.groupsOnly) {
        // Groups only (Tree blueprint section 5.1): no row query, no cursor.
        const { buckets, truncated, total: parentGroup } = await groupBuckets(input, conditions, executor);
        const total = parentGroup ? parentGroup.count : truncated ? await countRows(input, conditions, executor) : buckets.reduce((sum, bucket) => sum + bucket.count, 0);
        return { data: [], groups: buckets, ...(parentGroup ? { parentGroup } : {}), ...(truncated ? { groupsTruncated: true } : {}), pagination: { pageSize: 0, hasMore: false, total, countMode: "exact" as const } };
      }
      const order = orderBy(input);
      const cursor = decodeRecordCursor(input);
      // A Matrix rank's participant page narrows the returned rows only; the
      // ranked set below keeps the full conditions (Matrix blueprint 5.4).
      const output = input.rank?.output;
      const pageConditions = [
        ...conditions,
        ...(cursor ? [cursorCondition(input, cursor)] : []),
        ...(output ? [filterCondition(input.descriptor, { field: output.field, operator: "in", value: output.values })] : []),
      ];
      const result = await sql<Record<string, unknown>>`
        SELECT ${projection(input.descriptor, input.projection)}${tree ? sql`, ${tree.hasChildren} AS ${sql.ref(HAS_CHILDREN)}` : sql``} FROM ${tree ? sql`${table(input.descriptor)} AS ${sql.ref(TREE_ROW)}` : table(input.descriptor)}
         WHERE ${sql.join(pageConditions, sql` AND `)}
         ${order} LIMIT ${input.limit + 1}
      `.execute(executor);
      const hasMore = result.rows.length > input.limit;
      const page = result.rows.slice(0, input.limit);
      // Child existence travels beside the rows, never as a record field.
      const hasChildren = tree ? page.map((row) => row[HAS_CHILDREN] === true) : undefined;
      const rows = tree ? page.map(({ [HAS_CHILDREN]: _flag, ...row }) => row) : page;
      // Group counts follow the count-mode rule (layout foundation section 5): the
      // full-set GROUP BY runs only under exact counts.
      const grouped = input.group && input.countMode === "exact" ? await groupBuckets(input, conditions, executor) : undefined;
      const groups = grouped?.buckets;
      let total: number | undefined;
      if (input.countMode === "exact" && groups && !grouped.truncated) {
        total = groups.reduce((sum, bucket) => sum + bucket.count, 0);
      } else if (input.countMode === "exact") {
        const count = await sql<{ count: string | number | bigint }>`SELECT count(*) AS count FROM ${tree ? sql`${table(input.descriptor)} AS ${sql.ref(TREE_ROW)}` : table(input.descriptor)} WHERE ${sql.join(conditions, sql` AND `)}`.execute(executor);
        total = Number(count.rows[0]?.count ?? 0);
      }
      const countMode = input.countMode === "exact" ? "exact" : "none";
      const last = rows.at(-1);
      const ranked = input.rank ? await rankRows(input, input.rank, conditions, rows, executor) : undefined;
      return { data: rows, ...(ranked ? { ranks: ranked.ranks, rankRevision: ranked.revision } : {}), ...(groups ? { groups } : {}), ...(grouped?.truncated ? { groupsTruncated: true } : {}), ...(hasChildren ? { hasChildren } : {}), pagination: { pageSize: rows.length, hasMore, ...(hasMore && last ? { nextCursor: encodeRecordCursor(input, last) } : {}), ...(total !== undefined ? { total } : {}), countMode } };
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

/** Matrix rank (Matrix blueprint section 8): one window over every record
 * the list's conditions admit, never only the rows returned. Ties share a
 * rank, empty values are not ranked, and with an eligibility rule only facts
 * whose column record is in an eligible state are ranked. Difference to best
 * is |value − best| / |best| in exact numeric arithmetic, absent at the best
 * value and when the best is zero. The revision digests the ranked set's
 * identities, versions and values, so a later page ranked from different data
 * is detectable. */
async function rankRows(
  input: RecordRepositoryListInput,
  rank: NonNullable<RecordRepositoryListInput["rank"]>,
  conditions: readonly RawBuilder<unknown>[],
  rows: readonly Record<string, unknown>[],
  executor: RecordDatabase | RecordTransaction,
): Promise<{ readonly ranks: readonly (RecordRank | null)[]; readonly revision: string }> {
  const { descriptor } = input;
  const value = sql.ref(fieldPath(descriptor, rank.field));
  const partition = sql.join(rank.partition.map((key) => sql.ref(fieldPath(descriptor, key))));
  const direction = rank.better === "lower" ? sql`ASC` : sql`DESC`;
  const best = rank.better === "lower" ? sql`min(${value})` : sql`max(${value})`;
  const version = descriptor.storage.versionField ? sql`coalesce(${sql.ref(descriptor.storage.versionField)}::text, '')` : sql`''`;
  const ranked = [...conditions, sql`${value} IS NOT NULL`];
  const eligibility = rank.eligibility;
  if (eligibility) {
    // The fact table is not aliased (scope compilers may qualify it by name),
    // so the correlation names it in full; the column table is aliased and
    // its own conditions resolve to it first.
    const column = eligibility.column;
    const outer = sql.ref(`${descriptor.storage.schema}.${descriptor.storage.object}.${fieldPath(descriptor, eligibility.field)}`);
    ranked.push(sql`EXISTS (
      SELECT 1 FROM ${table(column)} AS "__rank_column"
       WHERE ${sql.ref(`__rank_column.${column.storage.idField}`)} = ${outer}
         AND ${sql.ref(`__rank_column.${fieldPath(column, eligibility.columnField)}`)} IN (${sql.join(eligibility.values.map((item) => sql`${item}`))})
         AND ${sql.join(baseConditions(column, input.tenantId, "read"), sql` AND `)}
    )`);
  }
  const ids = rows.map((row) => String(row[descriptor.storage.idField]));
  const result = await sql<{ id: string | null; rank: string | number | null; count: string | number | null; best: string | null; difference: string | null; revision: string }>`
    WITH "__rank_set" AS (
      SELECT ${sql.ref(descriptor.storage.idField)}::text AS "__rank_id",
             ${value} AS "__rank_value",
             rank() OVER (PARTITION BY ${partition} ORDER BY ${value} ${direction}) AS "__rank",
             count(*) OVER (PARTITION BY ${partition}) AS "__rank_count",
             ${best} OVER (PARTITION BY ${partition}) AS "__rank_best",
             ${sql.ref(descriptor.storage.idField)}::text || ':' || ${version} || ':' || ${value}::text AS "__rank_mark"
        FROM ${table(descriptor)}
       WHERE ${sql.join(ranked, sql` AND `)}
    )
    SELECT "__rank_row"."__rank_id" AS id, "__rank_row"."__rank" AS rank, "__rank_row"."__rank_count" AS count,
           "__rank_row"."__rank_best"::text AS best,
           CASE WHEN "__rank_row"."__rank_best" = 0 OR "__rank_row"."__rank_value" = "__rank_row"."__rank_best" THEN NULL
                ELSE round(abs("__rank_row"."__rank_value" - "__rank_row"."__rank_best") * 100 / abs("__rank_row"."__rank_best"), 1)::text END AS difference,
           "__rank_digest".revision
      FROM (SELECT md5(coalesce(string_agg("__rank_mark", ',' ORDER BY "__rank_mark"), '')) AS revision FROM "__rank_set") AS "__rank_digest"
      LEFT JOIN "__rank_set" AS "__rank_row" ON "__rank_row"."__rank_id" IN (${ids.length ? sql.join(ids.map((id) => sql`${id}`)) : sql`NULL`})
  `.execute(executor);
  const byId = new Map(result.rows.filter((row) => row.id !== null).map((row) => [row.id!, row]));
  return {
    revision: result.rows[0]!.revision,
    ranks: ids.map((id) => {
      const row = byId.get(id);
      return row
        ? Object.freeze({ rank: Number(row.rank), count: Number(row.count), best: row.best!, ...(row.difference !== null ? { difference: row.difference } : {}) })
        : null;
    }),
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
const TREE_ROW = "__tree_row";
const HAS_CHILDREN = "__tree_has_children";
const TREE_PARENT = "__tree_parent";

/** Search with ancestor context (Tree blueprint sections 5.5 and 7.3).
 * 1. Matches: the list's own conditions, its order, one more than the limit.
 * 2. Ancestors: a depth-bounded recursive walk up from the matches' parents by
 *    primary key. Every step re-applies the visible set (tenant, record
 *    predicates, collection scope) and the scope filter, never the search or
 *    the other filters: ancestors are context, and a path cannot pass through
 *    a hidden record or another owner's node.
 * Child existence is computed for both sets as for `nodes`. */
async function listTreeMatches(
  input: RecordRepositoryListInput,
  conditions: readonly RawBuilder<unknown>[],
  tree: ReturnType<typeof hierarchySql>,
  executor: RecordDatabase | RecordTransaction,
  compilers: ReadonlyMap<string, RecordCollectionScopeSqlCompiler>,
): Promise<RecordListResult> {
  const { descriptor, tenantId } = input;
  const hierarchy = input.hierarchy!;
  const idPath = descriptor.storage.idField;
  const parentPath = fieldPath(descriptor, hierarchy.parentField);
  const select = sql`${projection(descriptor, input.projection)}, ${tree.hasChildren} AS ${sql.ref(HAS_CHILDREN)}, ${sql.ref(`${TREE_ROW}.${parentPath}`)} AS ${sql.ref(TREE_PARENT)}`;
  const found = await sql<Record<string, unknown>>`
    SELECT ${select} FROM ${table(descriptor)} AS ${sql.ref(TREE_ROW)}
     WHERE ${sql.join(conditions, sql` AND `)}
     ${orderBy(input)} LIMIT ${input.limit + 1}
  `.execute(executor);
  const toItem = (row: Record<string, unknown>) => {
    const { [HAS_CHILDREN]: hasChildren, [TREE_PARENT]: parent, ...rest } = row;
    return { row: rest, id: String(rest[idPath]), parent: parent === null || parent === undefined ? null : String(parent), hasChildren: hasChildren === true };
  };
  const matches = found.rows.slice(0, input.limit).map(toItem);
  const steps = (hierarchy.maxDepth ?? 1) - 1;
  const starts = [...new Set(matches.flatMap((item) => (item.parent ? [item.parent] : [])))];
  let ancestors: ReturnType<typeof toItem>[] = [];
  if (steps > 0 && starts.length) {
    const scopeFilters = hierarchy.scopeField ? (input.filters ?? []).filter((filter) => filter.field === hierarchy.scopeField) : [];
    const visible = [
      ...baseConditions(descriptor, tenantId, "read"),
      ...input.collectionScope.map((constraint) => compileRecordCollectionScopeCondition(descriptor, tenantId, constraint, compilers)),
      ...scopeFilters.map((filter) => filterCondition(descriptor, filter)),
    ];
    const walk = await sql<Record<string, unknown>>`
      WITH RECURSIVE "__tree_walk" ("__walk_id", "__walk_parent", "__walk_depth") AS (
        SELECT ${sql.ref(idPath)}, ${sql.ref(parentPath)}, 1 FROM ${table(descriptor)}
         WHERE ${sql.ref(idPath)} IN (${sql.join(starts.map((id) => sql`${id}::uuid`))}) AND ${sql.join(visible, sql` AND `)}
        UNION
        SELECT ${sql.ref(idPath)}, ${sql.ref(parentPath)}, "__tree_walk"."__walk_depth" + 1 FROM ${table(descriptor)}
          JOIN "__tree_walk" ON ${sql.ref(idPath)} = "__tree_walk"."__walk_parent"
         WHERE "__tree_walk"."__walk_depth" < ${steps} AND ${sql.join(visible, sql` AND `)}
      )
      SELECT ${select} FROM ${table(descriptor)} AS ${sql.ref(TREE_ROW)}
       WHERE ${sql.ref(`${TREE_ROW}.${idPath}`)} IN (SELECT "__walk_id" FROM "__tree_walk") AND ${sql.join(visible, sql` AND `)}
    `.execute(executor);
    ancestors = walk.rows.map(toItem);
  }
  const assembled = assembleTreeMatches({ matches, ancestors, maxDepth: hierarchy.maxDepth ?? 1, truncated: found.rows.length > input.limit });
  let total: number | undefined;
  if (input.countMode === "exact") {
    const count = await sql<{ count: string | number | bigint }>`SELECT count(*) AS count FROM ${table(descriptor)} AS ${sql.ref(TREE_ROW)} WHERE ${sql.join(conditions, sql` AND `)}`.execute(executor);
    total = Number(count.rows[0]?.count ?? 0);
  }
  // pageSize counts matches; context rows ride along with them.
  return { ...assembled, pagination: { pageSize: assembled.treeRoles!.filter((role) => role === "match").length, hasMore: false, ...(total !== undefined ? { total } : {}), countMode: input.countMode === "exact" ? "exact" : "none" } };
}

/** Record-hierarchy SQL (Entity list Tree blueprint sections 5.3 and 7.2).
 * The outer row is aliased; each correlated subquery reads its own alias of
 * the same table, so the unqualified conditions inside it apply to the child
 * or parent being tested. Both stay inside the visible set: tenant and record
 * predicates and the trusted collection scope, never through hidden rows.
 * - hasChildren: a child exists that the viewer can read and that matches the
 *   list's own filters and search (the same set expanding would show), with
 *   the filter on the parent field itself left out.
 * - orphans: the parent field is set but no parent is in the visible set. */
function hierarchySql(input: RecordRepositoryListInput, compilers: ReadonlyMap<string, RecordCollectionScopeSqlCompiler>) {
  const { descriptor, tenantId } = input;
  const hierarchy = input.hierarchy!;
  const parentPath = fieldPath(descriptor, hierarchy.parentField);
  const idPath = descriptor.storage.idField;
  const visible = [
    ...baseConditions(descriptor, tenantId, "read"),
    ...input.collectionScope.map((constraint) => compileRecordCollectionScopeCondition(descriptor, tenantId, constraint, compilers)),
  ];
  const childConditions = [
    ...visible,
    ...(input.viewRelationships ?? []).map((relationship) => compileStandardViewRelationship(descriptor, tenantId, relationship)),
    ...(input.filters ?? []).filter((filter) => filter.field !== hierarchy.parentField).map((filter) => filterCondition(descriptor, filter)),
    ...(input.search ? [searchCondition(descriptor, input.search)] : []),
  ];
  // A scoped hierarchy (T1) compares the owner too, matching the composite
  // parent key and its index: a child or parent is always in the row's scope.
  const scopePath = hierarchy.scopeField ? fieldPath(descriptor, hierarchy.scopeField) : undefined;
  const sameScope = (alias: string) => (scopePath ? [sql`${sql.ref(`${alias}.${scopePath}`)} = ${sql.ref(`${TREE_ROW}.${scopePath}`)}`] : []);
  const hasChildren = sql`EXISTS (SELECT 1 FROM ${table(descriptor)} AS ${sql.ref("__tree_child")} WHERE ${sql.ref(`__tree_child.${parentPath}`)} = ${sql.ref(`${TREE_ROW}.${idPath}`)} AND ${sql.join([...sameScope("__tree_child"), ...childConditions], sql` AND `)})`;
  const orphanCondition = hierarchy.mode === "orphans"
    ? sql`(${sql.ref(`${TREE_ROW}.${parentPath}`)} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${table(descriptor)} AS ${sql.ref("__tree_parent")} WHERE ${sql.ref(`__tree_parent.${idPath}`)} = ${sql.ref(`${TREE_ROW}.${parentPath}`)} AND ${sql.join([...sameScope("__tree_parent"), ...visible], sql` AND `)}))`
    : undefined;
  return { hasChildren, orphanCondition };
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
/** Group buckets with their counts and, when requested, aggregates (Tree
 * blueprint A2), grouping a date field by month or quarter (A3) through
 * date_trunc in the viewer's zone for a datetime field. One statement, capped
 * at 50 groups plus the No value group; a money aggregate also counts its
 * currencies, so a group spanning currencies shows no total. With
 * `groupTotals` (a Summary request, Aggregate blueprint 8.1) the same
 * statement also returns the total over every group through GROUPING SETS,
 * so an average or a distinct count is computed from base rows, never from
 * group rows. There the grouping key is computed once in a subquery, so
 * GROUPING() names exactly the grouped expression; other requests keep the
 * single-level statement unchanged. */
/** A grouping key: the field, or a date field's month or quarter through
 * date_trunc in the viewer's zone for a datetime field (A3). */
function groupKeyExpression(input: RecordRepositoryListInput, key: string, bucket: RecordRepositoryListInput["groupBucket"]): RawBuilder<unknown> {
  const field = input.descriptor.fields.find((item) => item.key === key);
  if (!field) throw new Error(`Unknown descriptor field: ${key}`);
  const ref = sql.ref(field.storagePath);
  if (!bucket) return sql`${ref}`;
  const local = field.type === "datetime" ? sql`(${ref} AT TIME ZONE ${bucket.timeZone ?? "UTC"})` : sql`${ref}::timestamp`;
  const unit = bucket.unit === "quarter" ? sql.lit("quarter") : sql.lit("month");
  const format = bucket.unit === "quarter" ? sql.lit('YYYY-"Q"Q') : sql.lit("YYYY-MM");
  return sql`to_char(date_trunc(${unit}, ${local}), ${format})`;
}

/** The requested aggregates' select list, the inputs a subquery must carry
 * for them (`sourced`), and how one result row becomes a group's totals: a
 * money aggregate spanning currencies, or with amounts lacking a currency,
 * shows no value. */
function groupAggregateParts(input: RecordRepositoryListInput, sourced: boolean) {
  const aggregates = (input.groupAggregates ?? []).map((item, index) => {
    const source = sql.ref(fieldPath(input.descriptor, item.field));
    const target = sourced ? sql.ref(`__input_${index}`) : source;
    const fn = {
      countDistinct: sql`count(DISTINCT ${target})`,
      sum: sql`sum(${target})`,
      average: sql`avg(${target})`,
      minimum: sql`min(${target})`,
      maximum: sql`max(${target})`,
    }[item.aggregate];
    const currencySource = item.currencyField ? sql.ref(fieldPath(input.descriptor, item.currencyField)) : undefined;
    const currency = sourced ? sql.ref(`__currency_input_${index}`) : currencySource;
    return {
      name: `${item.field}:${item.aggregate}`,
      fn,
      input: sql`, ${source} AS ${target}${currencySource ? sql`, ${currencySource} AS ${currency}` : sql``}`,
      select: sql`, ${fn} AS ${sql.ref(`__aggregate_${index}`)}${currencySource ? sql`, count(DISTINCT ${currency}) AS ${sql.ref(`__currencies_${index}`)}, min(${currency}) AS ${sql.ref(`__currency_${index}`)}, count(*) FILTER (WHERE ${target} IS NOT NULL AND ${currency} IS NULL) AS ${sql.ref(`__uncurrenced_${index}`)}` : sql``}`,
      money: Boolean(currencySource),
    };
  });
  const summarize = (row: Record<string, unknown> & { count: string | number | bigint }) => {
    const currencies: Record<string, string> = {};
    const mixed: string[] = [];
    const unknown: string[] = [];
    const values = Object.fromEntries(aggregates.map((item, index) => {
      if (item.money) {
        if (Number(row[`__currencies_${index}`] ?? 0) > 1) {
          mixed.push(item.name);
          return [item.name, null];
        }
        // An amount without a recorded currency makes the total's currency unknown.
        if (Number(row[`__uncurrenced_${index}`] ?? 0) > 0) {
          unknown.push(item.name);
          return [item.name, null];
        }
        if (typeof row[`__currency_${index}`] === "string") currencies[item.name] = row[`__currency_${index}`] as string;
      }
      return [item.name, aggregateValue(row[`__aggregate_${index}`])];
    }));
    return {
      count: Number(row.count),
      ...(aggregates.length ? { aggregates: Object.freeze(values) } : {}),
      ...(Object.keys(currencies).length ? { aggregateCurrencies: Object.freeze(currencies) } : {}),
      ...(mixed.length ? { mixedCurrencies: Object.freeze(mixed) } : {}),
      ...(unknown.length ? { unknownCurrencies: Object.freeze(unknown) } : {}),
    };
  };
  const indexOf = (key: string) => {
    const index = aggregates.findIndex((item) => item.name === key);
    if (index < 0) throw new Error(`Not a requested aggregate: ${key}`);
    return index;
  };
  return {
    inputs: sql.join(aggregates.map((item) => item.input), sql``),
    selects: sql.join(aggregates.map((item) => item.select), sql``),
    summarize,
    /** The result column holding an aggregate (A6 orders by it). */
    alias: (key: string) => `__aggregate_${indexOf(key)}`,
    /** An aggregate's expression over the statement's inputs. */
    expression: (key: string) => aggregates[indexOf(key)]!.fn,
  };
}

/** Top / Bottom N (Aggregate A6, section 7.5) for a Summary level: one
 * statement that aggregates every group with the total (GROUPING SETS), then
 * orders the groups by the measure and keeps the limit. Its three
 * constraints live in the statement:
 * 1. No value is fetched first by the sort key, never ranked, and drawn last,
 *    so no cap drops it under any ordering.
 * 2. A group with fewer records than the measure's floor takes no position:
 *    the floor is on the record count, decided here before the sort, so a
 *    withheld value never influences the order. Such groups are only counted.
 * 3. `groupCount` counts ranked groups only: never the total row, No value or
 *    groups below the floor. */
async function orderedGroupBuckets(input: RecordRepositoryListInput, conditions: readonly RawBuilder<unknown>[], executor: RecordDatabase | RecordTransaction) {
  const order = input.groupOrder!;
  const key = groupKeyExpression(input, input.group!, input.groupBucket);
  const { inputs, selects, summarize, alias } = groupAggregateParts(input, true);
  const groupKey = sql.ref("__group_key");
  const column = order.key === "count" ? "count" : alias(order.key);
  const direction = order.direction === "asc" ? sql`ASC` : sql`DESC`;
  const floor = order.floor ?? 0;
  type Row = Record<string, unknown> & { value: unknown; count: string | number | bigint; __total: number | string; __ranked_count: string | number; __unranked_count: string | number };
  const result = await sql<Row>`
    WITH "__g" AS (
      SELECT ${groupKey} AS value, count(*) AS count${selects}, GROUPING(${groupKey}) AS "__total"
        FROM (SELECT ${key} AS ${groupKey}${inputs} FROM ${table(input.descriptor)} WHERE ${sql.join(conditions, sql` AND `)}) AS "__group_source"
       GROUP BY GROUPING SETS ((${groupKey}), ())
    ), "__w" AS (
      SELECT "__g".*, ("__total" = 0 AND value IS NOT NULL AND count >= ${floor}) AS "__ranked" FROM "__g"
    ), "__c" AS (
      SELECT "__w".*,
             count(*) FILTER (WHERE "__ranked") OVER () AS "__ranked_count",
             count(*) FILTER (WHERE "__total" = 0 AND value IS NOT NULL AND NOT "__ranked") OVER () AS "__unranked_count"
        FROM "__w"
    )
    SELECT * FROM "__c" WHERE "__total" = 1 OR value IS NULL OR "__ranked"
     ORDER BY "__total" DESC, (value IS NULL) DESC, ${sql.ref(column)} ${direction} NULLS LAST, value ASC
     LIMIT ${order.limit + 3}`.execute(executor);
  const totalRow = result.rows.find((row) => Number(row.__total) === 1)!;
  const groups = result.rows.filter((row) => Number(row.__total) !== 1);
  const none = groups.filter((row) => row.value === null);
  const ranked = groups.filter((row) => row.value !== null);
  const kept = ranked.slice(0, order.limit);
  const past = ranked[order.limit];
  return {
    truncated: ranked.length > order.limit,
    buckets: Object.freeze([...kept, ...none].map((row) => Object.freeze({ value: row.value, ...summarize(row) }))),
    total: Object.freeze(summarize(totalRow)),
    ranking: {
      groupCount: Number(totalRow.__ranked_count),
      groupsUnranked: Number(totalRow.__unranked_count),
      ...(past && String(past[column]) === String(kept.at(-1)?.[column]) ? { groupOrderTieAtCut: true } : {}),
    },
  };
}

async function groupBuckets(input: RecordRepositoryListInput, conditions: readonly RawBuilder<unknown>[], executor: RecordDatabase | RecordTransaction) {
  const key = groupKeyExpression(input, input.group!, input.groupBucket);
  const totals = input.groupTotals === true;
  const { inputs, selects, summarize } = groupAggregateParts(input, totals);
  const groupKey = sql.ref("__group_key");
  const result = totals
    ? await sql<Record<string, unknown> & { value: unknown; count: string | number | bigint; __total?: number | string }>`
    SELECT ${groupKey} AS value, count(*) AS count${selects}, GROUPING(${groupKey}) AS "__total"
      FROM (SELECT ${key} AS ${groupKey}${inputs} FROM ${table(input.descriptor)} WHERE ${sql.join(conditions, sql` AND `)}) AS "__group_source"
     GROUP BY GROUPING SETS ((${groupKey}), ())
     ORDER BY "__total" DESC, 1 ASC NULLS FIRST LIMIT ${LIST_GROUP_LIMIT + 3}`.execute(executor)
    : await sql<Record<string, unknown> & { value: unknown; count: string | number | bigint; __total?: number | string }>`
    SELECT ${key} AS value, count(*) AS count${selects}
      FROM ${table(input.descriptor)} WHERE ${sql.join(conditions, sql` AND `)}
     GROUP BY 1 ORDER BY 1 ASC NULLS FIRST LIMIT ${LIST_GROUP_LIMIT + 2}`.execute(executor);
  const totalRow = totals ? result.rows.find((row) => Number(row.__total) === 1) : undefined;
  const grouped = totals ? result.rows.filter((row) => Number(row.__total) !== 1) : result.rows;
  // The No value group sorts first so the cap never drops it; it is drawn last.
  const none = grouped.filter((row) => row.value === null);
  const values = grouped.filter((row) => row.value !== null);
  const truncated = values.length > LIST_GROUP_LIMIT;
  const rows = [...values.slice(0, LIST_GROUP_LIMIT), ...none];
  return {
    truncated,
    buckets: Object.freeze(rows.map((row) => Object.freeze({ value: row.value, ...summarize(row) }))),
    // An empty set has no rows to group, so its total is zero records.
    ...(totals ? { total: Object.freeze(totalRow ? summarize(totalRow) : { count: 0 }) } : {}),
  };
}

/** A Summary with a column dimension (Entity list Aggregate A2): one
 * statement whose GROUPING SETS return every cell (row × column), each row's
 * total, each column's total and the total, all from base rows. The row level
 * keeps 50 values plus No value; the columns are an expansion's kept values,
 * or the first 12 in order (No value last) with the rest reported as
 * truncated. Totals still cover every record: only cells and column totals
 * are limited to the shown columns. The kept rows and columns are
 * materialized once and matched by hash; a correlated EXISTS here re-ran the
 * column query for every grouped row (110 ms against 5 ms over 1,200
 * records, blueprint 5.9). */
async function pivotBuckets(input: RecordRepositoryListInput, conditions: readonly RawBuilder<unknown>[], executor: RecordDatabase | RecordTransaction) {
  const pivot = input.pivot!;
  const { inputs, selects, summarize } = groupAggregateParts(input, true);
  const groupKey = sql.ref("__group_key");
  const pivotKey = sql.ref("__pivot_key");
  const columnsCte = pivot.values
    ? pivot.values.length
      ? sql`"__cols" ("__column") AS MATERIALIZED (VALUES ${sql.join(pivot.values.map((value) => sql`(${value}::text)`))})`
      : sql`"__cols" ("__column") AS MATERIALIZED (SELECT NULL::text WHERE FALSE)`
    : sql`"__cols" ("__column") AS MATERIALIZED (SELECT ${pivotKey}::text FROM "__src" GROUP BY ${pivotKey} ORDER BY ${pivotKey} ASC NULLS LAST LIMIT ${LIST_AGGREGATE_MAX_COLUMNS + 1})`;
  // The row cap is the "__rows" step, not a grouping set. Under A6 the
  // ranking, the floor and the ranked count all live there: it groups
  // "__src" by the row key alone, so each row's value is its total across
  // every column, and it holds row-level groups only by construction
  // (GROUPING(__group_key) = 0 would also match the cells).
  const order = input.groupOrder;
  const rankColumn = order?.key === "count" ? sql.ref("__n") : sql.ref("__order");
  const rankDirection = order?.direction === "asc" ? sql`ASC` : sql`DESC`;
  const rowsCte = order
    ? sql`"__agg" AS (SELECT ${groupKey}, count(*) AS "__n"${order.key === "count" ? sql`` : sql`, ${groupAggregateParts(input, true).expression(order.key)} AS "__order"`} FROM "__src" WHERE ${groupKey} IS NOT NULL GROUP BY 1),
    "__rank" AS (SELECT "__agg".*, ("__n" >= ${order.floor ?? 0}) AS "__ranked",
                        count(*) FILTER (WHERE "__n" >= ${order.floor ?? 0}) OVER () AS "__ranked_count",
                        count(*) FILTER (WHERE "__n" < ${order.floor ?? 0}) OVER () AS "__unranked_count" FROM "__agg"),
    "__rows" AS MATERIALIZED (SELECT ${groupKey}, ${rankColumn}::text AS "__rank_value", row_number() OVER (ORDER BY ${rankColumn} ${rankDirection} NULLS LAST, ${groupKey} ASC) AS "__position"
                                FROM "__rank" WHERE "__ranked" ORDER BY "__position" LIMIT ${order.limit + 1})`
    : sql`"__rows" AS MATERIALIZED (SELECT ${groupKey} FROM "__src" WHERE ${groupKey} IS NOT NULL GROUP BY 1 ORDER BY 1 ASC LIMIT ${LIST_GROUP_LIMIT + 1})`;
  const rankSelect = order
    ? sql`, (SELECT "__r"."__position" FROM "__rows" AS "__r" WHERE "__r".${groupKey} = "__src".${groupKey}) AS "__position",
          (SELECT "__r"."__rank_value" FROM "__rows" AS "__r" WHERE "__r".${groupKey} = "__src".${groupKey}) AS "__rank_value",
          (SELECT max("__ranked_count") FROM "__rank") AS "__ranked_count", (SELECT max("__unranked_count") FROM "__rank") AS "__unranked_count"`
    : sql``;
  type Row = Record<string, unknown> & { value: unknown; count: string | number | bigint; __pivot_text: string | null; __total: number | string; __pivot_total: number | string; __position?: string | number | null; __rank_value?: string | null; __ranked_count?: string | number | null; __unranked_count?: string | number | null };
  const result = await sql<Row>`
    WITH "__src" AS MATERIALIZED (
      SELECT ${groupKeyExpression(input, input.group!, input.groupBucket)} AS ${groupKey}, ${groupKeyExpression(input, pivot.field, pivot.bucket)} AS ${pivotKey}${inputs}
        FROM ${table(input.descriptor)} WHERE ${sql.join(conditions, sql` AND `)}
    ),
    ${rowsCte},
    ${columnsCte}
    SELECT ${groupKey} AS value, ${pivotKey}::text AS "__pivot_text", count(*) AS count${selects},
           GROUPING(${groupKey}) AS "__total", GROUPING(${pivotKey}) AS "__pivot_total"${rankSelect}
      FROM "__src"
     GROUP BY GROUPING SETS ((${groupKey}, ${pivotKey}), (${groupKey}), (${pivotKey}), ())
    HAVING (GROUPING(${groupKey}) = 1 OR ${groupKey} IS NULL OR ${groupKey} IN (SELECT ${groupKey} FROM "__rows"))
       AND (GROUPING(${pivotKey}) = 1
            OR ${pivotKey}::text IN (SELECT "__column" FROM "__cols" WHERE "__column" IS NOT NULL)
            OR (${pivotKey} IS NULL AND EXISTS (SELECT 1 FROM "__cols" WHERE "__column" IS NULL)))
     ORDER BY "__total" DESC, "__pivot_total" DESC, ${groupKey} ASC NULLS FIRST, ${pivotKey} ASC NULLS LAST`.execute(executor);
  const flags = (row: Row) => [Number(row.__total) === 1, Number(row.__pivot_total) === 1] as const;
  const grand = result.rows.find((row) => flags(row)[0] && flags(row)[1]);
  const columnTotals = result.rows.filter((row) => flags(row)[0] && !flags(row)[1]);
  const rowTotals = result.rows.filter((row) => !flags(row)[0] && flags(row)[1]);
  const cells = result.rows.filter((row) => !flags(row)[0] && !flags(row)[1]);
  // Column values: the expansion's, in its order, or the first 12 in order.
  const shown = pivot.values
    ? [...pivot.values]
    : columnTotals.map((row) => row.__pivot_text).slice(0, LIST_AGGREGATE_MAX_COLUMNS);
  const columnsTruncated = !pivot.values && columnTotals.length > LIST_AGGREGATE_MAX_COLUMNS;
  const rawColumn = new Map(columnTotals.map((row) => [row.__pivot_text, row]));
  const cellKey = (group: unknown, column: string | null) => JSON.stringify([group, column]);
  const cellRows = new Map(cells.map((row) => [cellKey(row.value, row.__pivot_text), row]));
  const none = rowTotals.filter((row) => row.value === null);
  // Under A6 the rows follow the ranking's positions; otherwise the key order.
  const values = order ? rowTotals.filter((row) => row.value !== null).sort((a, b) => Number(a.__position) - Number(b.__position)) : rowTotals.filter((row) => row.value !== null);
  const cap = order ? order.limit : LIST_GROUP_LIMIT;
  const truncated = values.length > cap;
  const rows = [...values.slice(0, cap), ...none];
  const ranking = order
    ? {
        groupCount: Number(grand?.__ranked_count ?? 0),
        groupsUnranked: Number(grand?.__unranked_count ?? 0),
        ...(values[cap] && values[cap]!.__rank_value === values[cap - 1]?.__rank_value ? { groupOrderTieAtCut: true } : {}),
      }
    : {};
  const cellsOf = (lookup: (column: string | null) => Row | undefined) =>
    Object.freeze(shown.map((column) => {
      const row = lookup(column);
      return row ? Object.freeze(summarize(row)) : null;
    }));
  return {
    truncated,
    buckets: Object.freeze(rows.map((row) => Object.freeze({ value: row.value, ...summarize(row), cells: cellsOf((column) => cellRows.get(cellKey(row.value, column))) }))),
    total: Object.freeze({ ...(grand ? summarize(grand) : { count: 0 }), cells: cellsOf((column) => rawColumn.get(column)) }),
    // Raw column values for labelling; a kept value with no records keeps its text.
    columns: Object.freeze(shown),
    columnsTruncated,
    ranking,
  };
}

async function countRows(input: RecordRepositoryListInput, conditions: readonly RawBuilder<unknown>[], executor: RecordDatabase | RecordTransaction): Promise<number> {
  const count = await sql<{ count: string | number | bigint }>`SELECT count(*) AS count FROM ${table(input.descriptor)} WHERE ${sql.join(conditions, sql` AND `)}`.execute(executor);
  return Number(count.rows[0]?.count ?? 0);
}
/** An aggregate as a JSON number when it is exact, otherwise its decimal text. */
export function aggregateValue(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value);
  return isExactDecimal(text) ? exactAggregate(text) : null;
}
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
