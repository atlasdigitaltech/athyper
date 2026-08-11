import { randomUUID } from "node:crypto";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordFilter, RecordRepository, RecordRepositoryListInput, RecordSort } from "@athyper/server-contract-records";
import type { RecordTransactionCoordinator } from "@athyper/server-contract-records";

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
      rows = rows.filter((row) => (input.filters ?? []).every((filter) => matches(row, input.descriptor, filter)));
      if (input.search) { const needle = input.search.toLowerCase(); const fields = input.descriptor.fields.filter((field) => field.searchable); rows = rows.filter((row) => fields.some((field) => String(row[field.storagePath] ?? "").toLowerCase().includes(needle))); }
      rows.sort((a, b) => compareRows(a, b, input.descriptor, input.sort ?? []));
      const offset = decodeCursor(input.cursor, input.descriptor.compiledHash);
      const page = rows.slice(offset, offset + input.limit);
      const hasMore = offset + input.limit < rows.length;
      return { data: page.map((row) => project(input.descriptor, row, input.projection)), pagination: { pageSize: page.length, hasMore, ...(hasMore ? { nextCursor: encodeCursor(offset + input.limit, input.descriptor.compiledHash) } : {}), ...(input.countMode === "exact" ? { total: rows.length } : {}), countMode: input.countMode ?? "none" } };
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
function value(row: Row, descriptor: EntityRuntimeDescriptor, key: string): unknown { return row[descriptor.fields.find((field) => field.key === key)?.storagePath ?? key]; }
function matches(row: Row, descriptor: EntityRuntimeDescriptor, filter: RecordFilter): boolean { const actual = value(row, descriptor, filter.field); switch (filter.operator) { case "eq": return actual === filter.value; case "ne": return actual !== filter.value; case "in": return Array.isArray(filter.value) && filter.value.includes(actual); case "gt": return compare(actual, filter.value) > 0; case "gte": return compare(actual, filter.value) >= 0; case "lt": return compare(actual, filter.value) < 0; case "lte": return compare(actual, filter.value) <= 0; case "is_null": return actual === null || actual === undefined; case "is_not_null": return actual !== null && actual !== undefined; } }
function compareRows(a: Row, b: Row, descriptor: EntityRuntimeDescriptor, sort: readonly RecordSort[]): number { for (const item of sort) { const result = compare(value(a, descriptor, item.field), value(b, descriptor, item.field)); if (result) return item.direction === "desc" ? -result : result; } return compare(String(a[descriptor.storage.idField]), String(b[descriptor.storage.idField])); }
function compare(a: unknown, b: unknown): number { if (a === b) return 0; if (a === null || a === undefined) return -1; if (b === null || b === undefined) return 1; return a < b ? -1 : 1; }
function encodeCursor(offset: number, hash: string): string { return Buffer.from(JSON.stringify({ offset, hash }), "utf8").toString("base64url"); }
function decodeCursor(cursor: string | undefined, hash: string): number { if (!cursor) return 0; try { const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { offset?: unknown; hash?: unknown }; if (parsed.hash !== hash || !Number.isInteger(parsed.offset) || Number(parsed.offset) < 0) throw new Error(); return Number(parsed.offset); } catch { throw new Error("Invalid or stale record cursor"); } }
function clone(source: State): State { return new Map([...source].map(([key, rows]) => [key, new Map([...rows].map(([id, row]) => [id, { ...row }]))])); }
function project(descriptor: EntityRuntimeDescriptor, row: Row, projection: readonly string[]): Row { const output: Row = {}; for (const key of projection) { const field = descriptor.fields.find((item) => item.key === key); if (field) output[key] = row[field.storagePath]; } for (const key of [descriptor.storage.idField, descriptor.storage.versionField, descriptor.storage.statusField].filter((item): item is string => Boolean(item))) if (!(key in output)) output[key] = row[key]; return output; }
