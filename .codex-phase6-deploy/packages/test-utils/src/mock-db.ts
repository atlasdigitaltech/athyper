/**
 * Kysely-compatible mock DB factory.
 *
 * Covers the builder chain patterns used across all service packages:
 *   selectFrom / insertInto / updateTable / transaction / fn.count
 *
 * Usage:
 *   const db = makeMockDb({
 *     "control.workflow_definition": [{ id: "def-1", rules: "[]" }],
 *     "document.workflow_request":   null,   // executeTakeFirst returns null
 *   });
 *
 * Transaction support:
 *   By default transaction().execute(fn) calls fn with the same mock db.
 *   Pass txOverrides to inject different row sets inside the transaction.
 *
 * Insert support:
 *   insertInto(table).values().returning().executeTakeFirstOrThrow() returns
 *   { id: insertIds[table] ?? crypto.randomUUID() }.
 */

import { vi } from "vitest";

export type TableRows = Record<string, unknown[] | unknown>;

export interface MockDbOptions {
  /** Rows returned by selectFrom queries, keyed by table name. */
  tables?: TableRows;
  /** Rows for queries run inside a transaction (defaults to `tables`). */
  txTables?: TableRows;
  /** Rows returned by updateTable(...).returningAll().executeTakeFirst(), keyed by table name. */
  updateResults?: TableRows;
  /** Transaction-scoped update results (defaults to `updateResults`). */
  txUpdateResults?: TableRows;
  /** IDs returned by insertInto(...).returning("id").executeTakeFirstOrThrow(). */
  insertIds?: Record<string, string>;
  /** Rows returned by insertInto(...).returning(...).executeTakeFirst(), keyed by table name. */
  insertResults?: TableRows;
  /** Factory for auto-generating insert IDs when no insertId is configured. */
  insertIdFactory?: () => string;
}

let _autoId = 1;
function defaultIdFactory(): string {
  return `mock-id-${(_autoId++).toString().padStart(4, "0")}`;
}

function makeBuilder(rows: unknown[]): Record<string, (...args: unknown[]) => unknown> {
  const b: Record<string, (...args: unknown[]) => unknown> = {
    select:                  () => b,
    selectAll:               () => b,
    innerJoin:               () => b,
    leftJoin:                () => b,
    where:                   () => b,
    on:                      () => b,
    onRef:                   () => b,
    orderBy:                 () => b,
    limit:                   () => b,
    offset:                  () => b,
    forUpdate:               () => b,
    returning:               () => b,
    execute:                 vi.fn().mockResolvedValue(rows),
    executeTakeFirst:        vi.fn().mockResolvedValue(rows[0] ?? null),
    executeTakeFirstOrThrow: vi.fn().mockImplementation(async () => {
      if (rows[0] == null) throw new Error("No result");
      return rows[0];
    }),
  };
  return b;
}

function makeInsertBuilder(
  table: string,
  ids: Record<string, string>,
  idFactory: () => string,
  resultQueues: Map<string, unknown[]>,
): Record<string, (...args: unknown[]) => unknown> {
  const id = ids[table] ?? idFactory();
  const nextResult = () => {
    const queue = resultQueues.get(table);
    if (!queue) return { id };
    return queue.length > 0 ? queue.shift() : undefined;
  };
  const b: Record<string, (...args: unknown[]) => unknown> = {
    values:                  () => b,
    onConflict:              () => b,
    returning:               () => b,
    returningAll:            () => b,
    execute:                 vi.fn().mockResolvedValue(undefined),
    executeTakeFirst:        vi.fn().mockImplementation(async () => nextResult()),
    executeTakeFirstOrThrow: vi.fn().mockImplementation(async () => {
      const result = nextResult();
      if (result == null) throw new Error("No result");
      return result;
    }),
  };
  return b;
}

function makeUpdateBuilder(rows: unknown[]): Record<string, (...args: unknown[]) => unknown> {
  const b: Record<string, (...args: unknown[]) => unknown> = {
    set:              () => b,
    where:            () => b,
    returningAll:     () => b,
    execute:          vi.fn().mockResolvedValue(undefined),
    executeTakeFirst: vi.fn().mockResolvedValue(rows[0] ?? undefined),
  };
  return b;
}

function resolveRows(tableRows: TableRows, table: string): unknown[] {
  const v = tableRows[table];
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

export function makeMockDb(opts: MockDbOptions = {}): Record<string, unknown> {
  const {
    tables = {},
    txTables,
    updateResults = {},
    txUpdateResults,
    insertIds = {},
    insertResults = {},
    insertIdFactory = defaultIdFactory,
  } = opts;
  const insertResultQueues = new Map(
    Object.entries(insertResults).map(([table, value]) => [
      table,
      Array.isArray(value) ? [...value] : [value],
    ]),
  );

  const makeDb = (rowSource: TableRows, updateSource: TableRows): Record<string, unknown> => {
    const db: Record<string, unknown> = {
      selectFrom: (table: string) => makeBuilder(resolveRows(rowSource, table)),
      insertInto: (table: string) => makeInsertBuilder(table, insertIds, insertIdFactory, insertResultQueues),
      updateTable: (table: string) => makeUpdateBuilder(resolveRows(updateSource, table)),
      transaction: () => ({
        execute: vi.fn().mockImplementation(
          async (fn: (trx: unknown) => Promise<unknown>) =>
            fn(makeDb(txTables ?? rowSource, txUpdateResults ?? updateSource)),
        ),
      }),
      fn: {
        count: (_col: string) => ({
          as: (_alias: string) => "COUNT(*)",
        }),
      },
    };
    return db;
  };

  return makeDb(tables, updateResults);
}
