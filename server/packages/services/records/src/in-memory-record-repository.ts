import { assembleTreeMatches } from "./tree-matches.js";
import { LIST_GROUP_LIMIT, addDecimals, averageDecimals, compareDecimals, exactAggregate, isExactDecimal } from "@athyper/contract-platform-entity-list";
import { validateDirectoryFieldConstraint } from "./directory-field-constraint.js";
import { entityListRelativeDateRange } from "@athyper/contract-platform-entity-list";
import { createHash, randomUUID } from "node:crypto";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordFilter, RecordRank, RecordRepository, RecordRepositoryListInput, RecordSort } from "@athyper/server-contract-records";
import type { RecordTransactionCoordinator } from "@athyper/server-contract-records";
import { decodeRecordCursor, encodeRecordCursor, type DecodedRecordCursor } from "./record-cursor.js";

type Row = Record<string, unknown>;
type State = Map<string, Map<string, Row>>;
export interface MemoryRecordTransaction {
  readonly state: State;
  /** Stages non-record effects so test adapters have real commit/rollback semantics. */
  onCommit(action: () => void): void;
}

export interface InMemoryRecordPersistence {
  readonly repository: RecordRepository<MemoryRecordTransaction>;
  readonly transactions: RecordTransactionCoordinator<MemoryRecordTransaction>;
  seed(descriptor: EntityRuntimeDescriptor, tenantId: string, rows: readonly Row[]): void;
}

export function createInMemoryRecordPersistence(): InMemoryRecordPersistence {
  let state: State = new Map();
  const table = (descriptor: EntityRuntimeDescriptor, tenantId: string, target = state): Map<string, Row> => {
    const key = `${descriptor.planeKey}\0${tenantId}\0${descriptor.storage.schema}.${descriptor.storage.object}`;
    let rows = target.get(key); if (!rows) { rows = new Map(); target.set(key, rows); } return rows;
  };
  const repository: RecordRepository<MemoryRecordTransaction> = {
    async measureHierarchy(input, transaction) {
      const rows = [...table(input.descriptor, input.tenantId, transaction?.state).values()].filter((row) => visible(input.descriptor, row));
      const id = (row: Row) => String(row[input.descriptor.storage.idField]);
      const parent = (row: Row) => value(row, input.descriptor, input.parentField);
      let parentDepth = 0;
      let parentChainIncludesRecord = false;
      for (let at = input.parentId ? rows.find((row) => id(row) === input.parentId) : undefined; at && parentDepth < input.bound; at = rows.find((row) => id(row) === parent(at!))) {
        parentDepth += 1;
        if (id(at) === input.recordId) parentChainIncludesRecord = true;
      }
      let height = 0;
      for (let level = rows.filter((row) => id(row) === input.recordId); level.length && height < input.bound; level = rows.filter((row) => level.some((above) => parent(row) === id(above)))) height += 1;
      return { parentDepth, subtreeHeight: Math.max(1, height), parentChainIncludesRecord };
    },
    async list(input, transaction) {
      const stored = [...table(input.descriptor, input.tenantId, transaction?.state).values()];
      // The visible set for hierarchy checks: record predicates and the
      // trusted collection scope, never the list's own filters.
      const visibleSet = stored.filter((row) => visible(input.descriptor, row) && input.collectionScope.every((constraint) => collectionScopeMatches(input.descriptor, row, constraint)));
      let rows = stored.filter((row) => visible(input.descriptor, row));
      if (input.viewRelationships?.length) throw new Error("Standard-view relationships require the database adapter");
      if (input.recordIds !== undefined) { const ids = new Set(input.recordIds); rows = rows.filter((row) => ids.has(String(row[input.descriptor.storage.idField]))); }
      rows = rows.filter((row) => input.collectionScope.every((constraint) => collectionScopeMatches(input.descriptor, row, constraint)));
      rows = rows.filter((row) => (input.filters ?? []).every((filter) => matches(row, input.descriptor, filter)));
      if (input.search) { const needle = input.search.toLowerCase(); const fields = input.descriptor.fields.filter((field) => field.searchable); rows = rows.filter((row) => fields.some((field) => String(row[field.storagePath] ?? "").toLowerCase().includes(needle))); }
      const hierarchy = input.hierarchy;
      const idOf = (row: Row) => row[input.descriptor.storage.idField];
      const parentOf = (row: Row) => (hierarchy ? value(row, input.descriptor, hierarchy.parentField) : undefined);
      // A scoped hierarchy compares the owner too (T1), as the SQL does.
      const scopeOf = (row: Row) => (hierarchy?.scopeField ? value(row, input.descriptor, hierarchy.scopeField) : undefined);
      if (hierarchy?.mode === "orphans") {
        rows = rows.filter((row) => parentOf(row) !== null && parentOf(row) !== undefined && !visibleSet.some((parent) => idOf(parent) === parentOf(row) && scopeOf(parent) === scopeOf(row)));
      }
      const childMatches = (row: Row) =>
        (input.filters ?? []).filter((filter) => filter.field !== hierarchy?.parentField).every((filter) => matches(row, input.descriptor, filter)) &&
        (!input.search || input.descriptor.fields.filter((field) => field.searchable).some((field) => String(row[field.storagePath] ?? "").toLowerCase().includes(input.search!.toLowerCase())));
      rows.sort((a, b) => compareRows(a, b, input.descriptor, input.sort ?? []));
      const total = rows.length;
      if (hierarchy?.mode === "matches") {
        // Search with ancestor context, as the SQL does: matches first, then a
        // depth-bounded walk up through the visible set and the scope filter.
        const scopeFilters = hierarchy.scopeField ? (input.filters ?? []).filter((filter) => filter.field === hierarchy.scopeField) : [];
        const ancestorSet = visibleSet.filter((row) => scopeFilters.every((filter) => matches(row, input.descriptor, filter)));
        const item = (row: Row) => ({
          row: project(input.descriptor, row, input.projection),
          id: String(idOf(row)),
          parent: parentOf(row) === null || parentOf(row) === undefined ? null : String(parentOf(row)),
          hasChildren: visibleSet.some((child) => parentOf(child) === idOf(row) && scopeOf(child) === scopeOf(row) && childMatches(child)),
        });
        const found = rows.slice(0, input.limit);
        const ancestors = new Map<string, Row>();
        let frontier = found.map(parentOf).filter((parent) => parent !== null && parent !== undefined);
        for (let step = 0; step < (hierarchy.maxDepth ?? 1) - 1 && frontier.length; step += 1) {
          const next: unknown[] = [];
          for (const parent of frontier) {
            const row = ancestorSet.find((candidate) => idOf(candidate) === parent);
            if (row && !ancestors.has(String(idOf(row)))) {
              ancestors.set(String(idOf(row)), row);
              next.push(parentOf(row));
            }
          }
          frontier = next.filter((parent) => parent !== null && parent !== undefined);
        }
        const assembled = assembleTreeMatches({ matches: found.map(item), ancestors: [...ancestors.values()].map(item), maxDepth: hierarchy.maxDepth ?? 1, truncated: rows.length > input.limit });
        return { ...assembled, pagination: { pageSize: assembled.treeRoles!.filter((role) => role === "match").length, hasMore: false, ...(input.countMode === "exact" ? { total } : {}), countMode: input.countMode === "exact" ? "exact" as const : "none" as const } };
      }
      // Group counts only under exact counts (layout foundation section 5).
      const grouped = input.group && input.countMode === "exact" ? groupBuckets(rows, input.descriptor, input.group, input.groupBucket, input.groupAggregates, input.groupTotals === true) : undefined;
      const groups = grouped?.buckets;
      if (input.groupsOnly && groups)
        return { data: [], groups, ...(grouped?.total ? { parentGroup: grouped.total } : {}), ...(grouped?.truncated ? { groupsTruncated: true } : {}), pagination: { pageSize: 0, hasMore: false, total, countMode: "exact" as const } };
      // Matrix rank: over every admitted record, before the participant page
      // narrows the returned rows (as the SQL does).
      const rankSet = input.rank ? rankedSet(input, input.rank, rows, transaction?.state ?? state, table) : undefined;
      const output = input.rank?.output;
      if (output) rows = rows.filter((row) => output.values.includes(String(value(row, input.descriptor, output.field))));
      const cursor = decodeRecordCursor(input);
      if (cursor) rows = rows.filter((row) => afterCursor(row, input.descriptor, input.sort ?? [], cursor));
      const candidates = rows.slice(0, input.limit + 1);
      const hasMore = candidates.length > input.limit;
      const page = candidates.slice(0, input.limit);
      const countMode = input.countMode === "exact" ? "exact" : "none";
      const projected = page.map((row) => project(input.descriptor, row, input.projection));
      const hasChildren = hierarchy ? page.map((row) => visibleSet.some((child) => parentOf(child) === idOf(row) && scopeOf(child) === scopeOf(row) && childMatches(child))) : undefined;
      const last = projected.at(-1);
      const ranks = rankSet ? page.map((row) => rankSet.ranks.get(String(idOf(row))) ?? null) : undefined;
      return { data: projected, ...(ranks && rankSet ? { ranks, rankRevision: rankSet.revision } : {}), ...(groups ? { groups } : {}), ...(grouped?.truncated ? { groupsTruncated: true } : {}), ...(hasChildren ? { hasChildren } : {}), pagination: { pageSize: page.length, hasMore, ...(hasMore && last ? { nextCursor: encodeRecordCursor(input, last) } : {}), ...(input.countMode === "exact" ? { total } : {}), countMode } };
    },
    async get(descriptor, tenantId, recordId, projection, transaction) { const row = table(descriptor, tenantId, transaction?.state).get(recordId); return row && visible(descriptor, row) ? project(descriptor, row, projection) : null; },
    async create(descriptor, tenantId, input, transaction) {
      const rows = table(descriptor, tenantId, transaction.state); const record = toStorage(descriptor, input);
      const id = typeof record[descriptor.storage.idField] === "string" ? record[descriptor.storage.idField] as string : randomUUID();
      if (rows.has(id)) throw new Error("Record already exists"); record[descriptor.storage.idField] = id;
      if (descriptor.storage.tenantField) record[descriptor.storage.tenantField] = tenantId;
      if (descriptor.storage.versionField) record[descriptor.storage.versionField] = 1;
      rows.set(id, record); return { ...record };
    },
    async patch(descriptor, tenantId, recordId, input, expectedVersion, transaction) {
      const rows = table(descriptor, tenantId, transaction.state); const current = rows.get(recordId);
      if (!current || !visible(descriptor, current)) return { record: null };
      const currentVersion = descriptor.storage.versionField ? Number(current[descriptor.storage.versionField]) : undefined;
      if (expectedVersion !== undefined && currentVersion !== expectedVersion) return { record: null, versionConflict: currentVersion ?? 0 };
      const next = { ...current, ...toStorage(descriptor, input) };
      if (descriptor.storage.versionField) next[descriptor.storage.versionField] = (currentVersion ?? 0) + 1;
      rows.set(recordId, next); return { record: { ...next } };
    },
    async delete(descriptor, tenantId, recordId, expectedVersion, transaction) {
      const rows = table(descriptor, tenantId, transaction.state); const current = rows.get(recordId);
      if (!current || !visible(descriptor, current)) return { deleted: false };
      const currentVersion = descriptor.storage.versionField ? Number(current[descriptor.storage.versionField]) : undefined;
      if (expectedVersion !== undefined && currentVersion !== expectedVersion) return { deleted: false, versionConflict: currentVersion ?? 0 };
      if (descriptor.storage.softDeleteField) { const next = { ...current, [descriptor.storage.softDeleteField]: new Date().toISOString() }; if (descriptor.storage.versionField) next[descriptor.storage.versionField] = (currentVersion ?? 0) + 1; rows.set(recordId, next); }
      else rows.delete(recordId);
      return { deleted: true };
    },
  };
  return {
    repository,
    transactions: { async run(_planeKey, _actor, work) {
      const draft = clone(state);
      const commits: Array<() => void> = [];
      const result = await work({ state: draft, onCommit(action) { commits.push(action); } });
      state = draft;
      for (const commit of commits) commit();
      return result;
    } },
    seed(descriptor, tenantId, rows) { const target = table(descriptor, tenantId); for (const row of rows) target.set(String(row[descriptor.storage.idField]), { ...row }); },
  };
}

function toStorage(descriptor: EntityRuntimeDescriptor, input: Readonly<Row>): Row { const fields = new Map(descriptor.fields.map((field) => [field.key, field.storagePath])); return Object.fromEntries(Object.entries(input).map(([key, value]) => [fields.get(key) ?? key, value])); }
function visible(descriptor: EntityRuntimeDescriptor, row: Row): boolean { return (!descriptor.storage.softDeleteField || row[descriptor.storage.softDeleteField] === null || row[descriptor.storage.softDeleteField] === undefined) && (descriptor.recordPredicates ?? []).every(predicate => matches(row, descriptor, predicate)); }
function collectionScopeMatches(descriptor: EntityRuntimeDescriptor, row: Row, constraint: RecordRepositoryListInput["collectionScope"][number]): boolean {
  if (constraint.kind === "entity.parent.v1" || constraint.kind === "entity.directory.fields.v1") {
    validateDirectoryFieldConstraint(descriptor, constraint);
    if (constraint.entityCode !== descriptor.entityCode || constraint.storageSchema !== descriptor.storage.schema ||
        constraint.storageObject !== descriptor.storage.object || !constraint.predicates.length ||
        constraint.predicates.some(predicate => !descriptor.fields.some(field => field.key === predicate.field)))
      throw new Error("Parent collection scope cannot be applied to this descriptor");
    return constraint.predicates.every(predicate => value(row, descriptor, predicate.field) === predicate.value);
  }
  if (constraint.kind === "neon.business_partner.directory.v1") return false; // Relationship admission requires the database adapter.
  if (constraint.kind === "platform.document_relationship.v1") return false; // Registered document relationships require the database adapter.
  if (constraint.kind === "neon.business_partner.operating_organization.v1") {
    if (descriptor.planeKey !== "neon" || descriptor.storage.schema !== "master" || descriptor.storage.object !== "business_partner") throw new Error("Business-partner collection scope cannot be applied to this descriptor");
    return Array.isArray(row["__operatingOrganizationIds"]) && (row["__operatingOrganizationIds"] as unknown[]).includes(constraint.operatingOrganizationId);
  }
  if (constraint.kind === "mesh.network_relationship.actor_account.v1") {
    if (descriptor.planeKey !== "mesh" || descriptor.storage.schema !== "mesh" || descriptor.storage.object !== "network_relationship") throw new Error("Network-relationship collection scope cannot be applied to this descriptor");
    return row["buyer_account_id"] === constraint.networkAccountId || row["supplier_account_id"] === constraint.networkAccountId;
  }
  if (constraint.kind === "studio.metadata_entity.catalog.v1") {
    if (descriptor.planeKey !== "studio" || descriptor.storage.schema !== "metadata" || descriptor.storage.object !== "entity") throw new Error("Metadata-entity catalog scope cannot be applied to this descriptor");
    return row["tenant_id"] === null || row["tenant_id"] === undefined || row["tenant_id"] === constraint.tenantId;
  }
  throw new Error("Unsupported record collection scope kind");
}
function value(row: Row, descriptor: EntityRuntimeDescriptor, key: string): unknown { return row[descriptor.fields.find((field) => field.key === key)?.storagePath ?? key]; }
function matches(row: Row, descriptor: EntityRuntimeDescriptor, filter: RecordFilter): boolean { const actual = value(row, descriptor, filter.field); switch (filter.operator) { case "eq": return actual === filter.value; case "ne": return actual !== filter.value; case "in": return Array.isArray(filter.value) && filter.value.includes(actual); case "contains": return String(actual ?? "").toLocaleLowerCase().includes(String(filter.value ?? "").toLocaleLowerCase()); case "starts_with": return String(actual ?? "").toLocaleLowerCase().startsWith(String(filter.value ?? "").toLocaleLowerCase()); case "gt": return compare(actual, filter.value) > 0; case "gte": return compare(actual, filter.value) >= 0; case "lt": return compare(actual, filter.value) < 0; case "lte": return compare(actual, filter.value) <= 0; case "between": return Array.isArray(filter.value) && filter.value.length === 2 && compare(actual, filter.value[0]) >= 0 && compare(actual, filter.value[1]) <= 0; case "is_null": return actual === null || actual === undefined; case "is_not_null": return actual !== null && actual !== undefined; case "relative": return relativeDateMatches(actual, filter.value); } }
export function relativeDateMatches(actual: unknown, relative: unknown): boolean {
  const timestamp = new Date(String(actual ?? "")); if (Number.isNaN(timestamp.valueOf())) return false;
  const range = entityListRelativeDateRange(relative); if (!range) return false;
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const bound = (offset: number): Date => {
    if (range.kind === "days") return new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    switch (range.unit) {
      case "week": return new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) + offset * 7);
      case "month": return new Date(today.getFullYear(), today.getMonth() + offset, 1);
      case "quarter": return new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + offset * 3, 1);
      case "year": return new Date(today.getFullYear() + offset, 0, 1);
    }
  };
  return timestamp >= bound(range.from) && timestamp < bound(range.to);
}
function groupBuckets(rows: readonly Row[], descriptor: EntityRuntimeDescriptor, field: string, bucket?: RecordRepositoryListInput["groupBucket"], aggregates: RecordRepositoryListInput["groupAggregates"] = [], totals = false) {
  // As the SQL does: a date bucket (A3) is the year and month or quarter, in
  // the viewer's zone for a datetime; aggregates (A2) per bucket.
  const type = descriptor.fields.find((item) => item.key === field)?.type;
  const keyOf = (raw: unknown): unknown => {
    if (!bucket || raw === null || raw === undefined) return raw ?? null;
    const instant = new Date(type === "date" ? `${String(raw).slice(0, 10)}T00:00:00Z` : String(raw));
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: type === "date" ? "UTC" : (bucket.timeZone ?? "UTC"), year: "numeric", month: "2-digit" }).formatToParts(instant);
    const year = parts.find((part) => part.type === "year")!.value, month = Number(parts.find((part) => part.type === "month")!.value);
    return bucket.unit === "quarter" ? `${year}-Q${Math.ceil(month / 3)}` : `${year}-${String(month).padStart(2, "0")}`;
  };
  const groups = new Map<unknown, Row[]>();
  for (const row of rows) { const key = keyOf(value(row, descriptor, field)); groups.set(key, [...(groups.get(key) ?? []), row]); }
  // Exact decimals, as the SQL does: no floating-point sums.
  const decimals = (list: Row[], key: string) => list.map((row) => value(row, descriptor, key)).filter(isExactDecimal);
  const compute = (list: Row[], item: NonNullable<RecordRepositoryListInput["groupAggregates"]>[number]): number | string | null => {
    // A distinct count over the base rows, as count(DISTINCT …) does.
    if (item.aggregate === "countDistinct")
      return new Set(list.map((row) => value(row, descriptor, item.field)).filter((entry) => entry !== null && entry !== undefined).map((entry) => JSON.stringify(entry))).size;
    const values = decimals(list, item.field);
    if (!values.length) return null;
    if (item.aggregate === "sum") return exactAggregate(addDecimals(values));
    if (item.aggregate === "average") return exactAggregate(averageDecimals(values));
    const pick = values.reduce((best, next) => ((item.aggregate === "minimum" ? compareDecimals(next, best) < 0 : compareDecimals(next, best) > 0) ? next : best));
    return typeof pick === "number" ? pick : exactAggregate(pick);
  };
  const ordered = [...groups].sort(([left], [right]) => (left === null ? 1 : right === null ? -1 : compare(left, right)));
  const nonNull = ordered.filter(([item]) => item !== null);
  const kept = [...nonNull.slice(0, LIST_GROUP_LIMIT), ...ordered.filter(([item]) => item === null)];
  const summarize = (list: Row[]) => {
      const currencies: Record<string, string> = {};
      const mixed: string[] = [];
      const unknown: string[] = [];
      const values = Object.fromEntries(aggregates.map((aggregate) => {
        const name = `${aggregate.field}:${aggregate.aggregate}`;
        if (aggregate.currencyField) {
          const codes = new Set(list.map((row) => value(row, descriptor, aggregate.currencyField!)).filter((code) => code !== null && code !== undefined));
          if (codes.size > 1) { mixed.push(name); return [name, null]; }
          const amount = (row: Row) => value(row, descriptor, aggregate.field);
          const currency = (row: Row) => value(row, descriptor, aggregate.currencyField!);
          if (list.some((row) => amount(row) !== null && amount(row) !== undefined && (currency(row) === null || currency(row) === undefined))) { unknown.push(name); return [name, null]; }
          if (codes.size === 1) currencies[name] = String([...codes][0]);
        }
        return [name, compute(list, aggregate)];
      }));
      return {
        count: list.length,
        ...(aggregates.length ? { aggregates: Object.freeze(values) } : {}),
        ...(Object.keys(currencies).length ? { aggregateCurrencies: Object.freeze(currencies) } : {}),
        ...(mixed.length ? { mixedCurrencies: Object.freeze(mixed) } : {}),
        ...(unknown.length ? { unknownCurrencies: Object.freeze(unknown) } : {}),
      };
  };
  return {
    truncated: nonNull.length > LIST_GROUP_LIMIT,
    buckets: Object.freeze(kept.map(([item, list]) => Object.freeze({ value: item, ...summarize(list) }))),
    // A Summary's total over every group, from the base rows (GROUPING SETS).
    ...(totals ? { total: Object.freeze(rows.length ? summarize([...rows]) : { count: 0 }) } : {}),
  };
}
function compareRows(a: Row, b: Row, descriptor: EntityRuntimeDescriptor, sort: readonly RecordSort[]): number { for (const item of sort) { const result = ordered(value(a, descriptor, item.field), value(b, descriptor, item.field), item); if (result) return result; } return compare(String(a[descriptor.storage.idField]), String(b[descriptor.storage.idField])); }
function afterCursor(row: Row, descriptor: EntityRuntimeDescriptor, sort: readonly RecordSort[], cursor: DecodedRecordCursor): boolean { for (const [index, item] of sort.entries()) { const result = ordered(value(row, descriptor, item.field), cursor.values[index], item); if (result) return result > 0; } return compare(String(row[descriptor.storage.idField]), cursor.id) > 0; }
function ordered(a: unknown, b: unknown, sort: RecordSort): number { const aNull = a === null || a === undefined, bNull = b === null || b === undefined; if (aNull || bNull) { if (aNull && bNull) return 0; const nulls = sort.nulls ?? (sort.direction === "asc" ? "last" : "first"); return aNull ? (nulls === "first" ? -1 : 1) : (nulls === "first" ? 1 : -1); } const result = compare(a, b); return sort.direction === "desc" ? -result : result; }
function compare(a: unknown, b: unknown): number { if (a === b) return 0; if (a === null || a === undefined) return -1; if (b === null || b === undefined) return 1; return a < b ? -1 : 1; }
function clone(source: State): State { return new Map([...source].map(([key, rows]) => [key, new Map([...rows].map(([id, row]) => [id, { ...row }]))])); }
function project(descriptor: EntityRuntimeDescriptor, row: Row, projection: readonly string[]): Row { const output: Row = {}; for (const key of projection) { const field = descriptor.fields.find((item) => item.key === key); if (field) output[key] = row[field.storagePath]; } for (const key of [descriptor.storage.idField, descriptor.storage.versionField, descriptor.storage.statusField].filter((item): item is string => Boolean(item))) if (!(key in output)) output[key] = row[key]; return output; }

/** The in-memory Matrix rank, the SQL's rules in exact decimals: ties share
 * a rank, empty values and ineligible column records are not ranked, and
 * difference to best is absent at the best value and when the best is zero. */
function rankedSet(
  input: RecordRepositoryListInput,
  rank: NonNullable<RecordRepositoryListInput["rank"]>,
  rows: readonly Row[],
  state: State,
  table: (descriptor: EntityRuntimeDescriptor, tenantId: string, target?: State) => Map<string, Row>,
): { readonly ranks: ReadonlyMap<string, RecordRank>; readonly revision: string } {
  const { descriptor } = input;
  const eligibility = rank.eligibility;
  const eligible = eligibility
    ? new Set(
        [...table(eligibility.column, input.tenantId, state).values()]
          .filter((row) => visible(eligibility.column, row) && eligibility.values.includes(String(value(row, eligibility.column, eligibility.columnField))))
          .map((row) => String(row[eligibility.column.storage.idField])),
      )
    : undefined;
  const ranked = rows.filter((row) => {
    const amount = value(row, descriptor, rank.field);
    return amount !== null && amount !== undefined && (!eligible || eligible.has(String(value(row, descriptor, eligibility!.field))));
  });
  const partitions = new Map<string, Row[]>();
  for (const row of ranked) {
    const key = JSON.stringify(rank.partition.map((field) => value(row, descriptor, field)));
    partitions.set(key, [...(partitions.get(key) ?? []), row]);
  }
  const ranks = new Map<string, RecordRank>();
  const sign = rank.better === "lower" ? 1 : -1;
  for (const members of partitions.values()) {
    const amount = (row: Row) => String(value(row, descriptor, rank.field));
    const sorted = [...members].sort((a, b) => sign * compareDecimals(amount(a), amount(b)));
    const best = amount(sorted[0]!);
    sorted.forEach((row) => {
      const position = 1 + sorted.filter((other) => sign * compareDecimals(amount(other), amount(row)) < 0).length;
      const zero = compareDecimals(best, "0") === 0;
      const atBest = compareDecimals(amount(row), best) === 0;
      const difference = zero || atBest ? undefined : (Math.round((Math.abs(Number(amount(row)) - Number(best)) * 1000) / Math.abs(Number(best))) / 10).toFixed(1);
      ranks.set(String(row[descriptor.storage.idField]), Object.freeze({ rank: position, count: members.length, best, ...(difference ? { difference } : {}) }));
    });
  }
  const version = descriptor.storage.versionField;
  const marks = ranked.map((row) => `${String(row[descriptor.storage.idField])}:${version ? String(row[version] ?? "") : ""}:${String(value(row, descriptor, rank.field))}`).sort();
  return { ranks, revision: createHash("md5").update(marks.join(",")).digest("hex") };
}
