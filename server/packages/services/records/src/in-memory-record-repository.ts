import { randomUUID } from "node:crypto";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordFilter, RecordRepository, RecordRepositoryListInput, RecordSort } from "@athyper/server-contract-records";
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
    async list(input, transaction) {
      let rows = [...table(input.descriptor, input.tenantId, transaction?.state).values()].filter((row) => visible(input.descriptor, row));
      if (input.recordIds?.length) { const ids = new Set(input.recordIds); rows = rows.filter((row) => ids.has(String(row[input.descriptor.storage.idField]))); }
      rows = rows.filter((row) => input.collectionScope.every((constraint) => collectionScopeMatches(input.descriptor, row, constraint)));
      rows = rows.filter((row) => (input.filters ?? []).every((filter) => matches(row, input.descriptor, filter)));
      if (input.search) { const needle = input.search.toLowerCase(); const fields = input.descriptor.fields.filter((field) => field.searchable); rows = rows.filter((row) => fields.some((field) => String(row[field.storagePath] ?? "").toLowerCase().includes(needle))); }
      rows.sort((a, b) => compareRows(a, b, input.descriptor, input.sort ?? []));
      const total = rows.length;
      const groups = input.group ? groupBuckets(rows, input.descriptor, input.group) : undefined;
      const cursor = decodeRecordCursor(input);
      if (cursor) rows = rows.filter((row) => afterCursor(row, input.descriptor, input.sort ?? [], cursor));
      const candidates = rows.slice(0, input.limit + 1);
      const hasMore = candidates.length > input.limit;
      const page = candidates.slice(0, input.limit);
      const countMode = input.countMode === "exact" ? "exact" : "none";
      const projected = page.map((row) => project(input.descriptor, row, input.projection));
      const last = projected.at(-1);
      return { data: projected, ...(groups ? { groups } : {}), pagination: { pageSize: page.length, hasMore, ...(hasMore && last ? { nextCursor: encodeRecordCursor(input, last) } : {}), ...(input.countMode === "exact" ? { total } : {}), countMode } };
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
function visible(descriptor: EntityRuntimeDescriptor, row: Row): boolean { return !descriptor.storage.softDeleteField || row[descriptor.storage.softDeleteField] === null || row[descriptor.storage.softDeleteField] === undefined; }
function collectionScopeMatches(descriptor: EntityRuntimeDescriptor, row: Row, constraint: RecordRepositoryListInput["collectionScope"][number]): boolean {
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
function relativeDateMatches(actual: unknown, relative: unknown): boolean {
  const timestamp = new Date(String(actual ?? "")); if (Number.isNaN(timestamp.valueOf())) return false;
  const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate()), day = 86_400_000;
  const rollingDays: Readonly<Record<string, readonly [number, number]>> = { today: [0, 1], yesterday: [-1, 0], tomorrow: [1, 2], last_7_days: [-7, 1], last_30_days: [-30, 1], last_90_days: [-90, 1], last_365_days: [-365, 1], next_7_days: [0, 8], next_30_days: [0, 31], next_90_days: [0, 91], next_365_days: [0, 366] };
  const rolling = typeof relative === "string" ? rollingDays[relative] : undefined;
  if (rolling) return timestamp.valueOf() >= start.valueOf() + rolling[0] * day && timestamp.valueOf() < start.valueOf() + rolling[1] * day;
  let from: Date | undefined, to: Date | undefined;
  if (relative === "this_week") { from = new Date(start); from.setDate(start.getDate() - ((start.getDay() + 6) % 7)); to = new Date(from.valueOf() + 7 * day); }
  else if (relative === "this_month") { from = new Date(start.getFullYear(), start.getMonth(), 1); to = new Date(start.getFullYear(), start.getMonth() + 1, 1); }
  else if (relative === "this_quarter") { const quarter = Math.floor(start.getMonth() / 3) * 3; from = new Date(start.getFullYear(), quarter, 1); to = new Date(start.getFullYear(), quarter + 3, 1); }
  else if (relative === "last_year") { from = new Date(start.getFullYear() - 1, 0, 1); to = new Date(start.getFullYear(), 0, 1); }
  else if (relative === "this_year") { from = new Date(start.getFullYear(), 0, 1); to = new Date(start.getFullYear() + 1, 0, 1); }
  else if (relative === "next_year") { from = new Date(start.getFullYear() + 1, 0, 1); to = new Date(start.getFullYear() + 2, 0, 1); }
  return Boolean(from && to && timestamp >= from && timestamp < to);
}
function groupBuckets(rows: readonly Row[], descriptor: EntityRuntimeDescriptor, field: string) { const counts = new Map<unknown, number>(); for (const row of rows) { const item = value(row, descriptor, field) ?? null; counts.set(item, (counts.get(item) ?? 0) + 1); } return Object.freeze([...counts].sort(([left], [right]) => compare(left, right)).map(([item, count]) => Object.freeze({ value: item, count }))); }
function compareRows(a: Row, b: Row, descriptor: EntityRuntimeDescriptor, sort: readonly RecordSort[]): number { for (const item of sort) { const result = ordered(value(a, descriptor, item.field), value(b, descriptor, item.field), item); if (result) return result; } return compare(String(a[descriptor.storage.idField]), String(b[descriptor.storage.idField])); }
function afterCursor(row: Row, descriptor: EntityRuntimeDescriptor, sort: readonly RecordSort[], cursor: DecodedRecordCursor): boolean { for (const [index, item] of sort.entries()) { const result = ordered(value(row, descriptor, item.field), cursor.values[index], item); if (result) return result > 0; } return compare(String(row[descriptor.storage.idField]), cursor.id) > 0; }
function ordered(a: unknown, b: unknown, sort: RecordSort): number { const aNull = a === null || a === undefined, bNull = b === null || b === undefined; if (aNull || bNull) { if (aNull && bNull) return 0; const nulls = sort.nulls ?? (sort.direction === "asc" ? "last" : "first"); return aNull ? (nulls === "first" ? -1 : 1) : (nulls === "first" ? 1 : -1); } const result = compare(a, b); return sort.direction === "desc" ? -result : result; }
function compare(a: unknown, b: unknown): number { if (a === b) return 0; if (a === null || a === undefined) return -1; if (b === null || b === undefined) return 1; return a < b ? -1 : 1; }
function clone(source: State): State { return new Map([...source].map(([key, rows]) => [key, new Map([...rows].map(([id, row]) => [id, { ...row }]))])); }
function project(descriptor: EntityRuntimeDescriptor, row: Row, projection: readonly string[]): Row { const output: Row = {}; for (const key of projection) { const field = descriptor.fields.find((item) => item.key === key); if (field) output[key] = row[field.storagePath]; } for (const key of [descriptor.storage.idField, descriptor.storage.versionField, descriptor.storage.statusField].filter((item): item is string => Boolean(item))) if (!(key in output)) output[key] = row[key]; return output; }
