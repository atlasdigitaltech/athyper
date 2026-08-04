#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

interface TablePlan {
  schema: string;
  table: string;
  columns: string[];
  primaryKey: string[];
}

interface ExecutionManifest {
  contractVersion: "wave6.fresh-database-disposition.v1";
  migrationId: string;
  plane: "neon" | "mesh";
  dataClass: "business" | "document" | "audit";
  sourceDatabase: string;
  targetDatabase: string;
  externalObjectEvidenceSha256?: string;
  approval: {
    status: "approved";
    ticket: string;
    approvedBy: string;
    approvedAt: string;
  };
  tables: TablePlan[];
}

interface TableReceipt {
  table: string;
  sourceRows: number;
  targetRows: number;
  sourceSha256: string;
  targetSha256: string;
  matched: boolean;
}

const args = process.argv.slice(2);
const manifestPath = option(args, "--manifest");
const outputPath = option(args, "--output");
const apply = args.includes("--apply");
const batchSize = Number(option(args, "--batch-size") ?? "250");
if (!manifestPath) throw new Error("--manifest=<approved JSON> is required");
if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
  throw new Error("--batch-size must be between 1 and 1000");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ExecutionManifest;
validateManifest(manifest);
const sourceUrl = requiredEnv(
  manifest.plane === "mesh" ? "MESH_SOURCE_DATABASE_URL" : "NEON_SOURCE_DATABASE_URL",
);
const targetUrl = requiredEnv(
  manifest.plane === "mesh" ? "MESH_TARGET_DATABASE_URL" : "NEON_TARGET_DATABASE_URL",
);
if (sourceUrl === targetUrl) throw new Error("source and target URLs must differ");

const source = new pg.Client({
  connectionString: sourceUrl,
  application_name: `wave6-${manifest.dataClass}-source`,
});
const target = new pg.Client({
  connectionString: targetUrl,
  application_name: `wave6-${manifest.dataClass}-target`,
});
await Promise.all([source.connect(), target.connect()]);
const receipts: TableReceipt[] = [];
try {
  await source.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await target.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  await target.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`athyper:wave6:disposition:${manifest.migrationId}`],
  );
  await assertDatabaseBoundary(source, manifest.sourceDatabase, manifest.plane);
  await assertDatabaseBoundary(target, manifest.targetDatabase, manifest.plane);

  for (const table of manifest.tables) {
    await validateTableContract(source, table);
    await validateTableContract(target, table);
    const existing = await target.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${qualified(table)}`,
    );
    if (Number(existing.rows[0]?.count ?? "0") !== 0) {
      throw new Error(`${qualified(table)} target is not fresh/empty`);
    }
    const sourceResult = await scanTable(
      source,
      table,
      batchSize,
      apply ? async (rows) => insertBatch(target, table, rows) : undefined,
    );
    const targetResult = apply
      ? await scanTable(target, table, batchSize)
      : { count: 0, sha256: emptyHash() };
    const matched = apply
      ? sourceResult.count === targetResult.count
        && sourceResult.sha256 === targetResult.sha256
      : true;
    receipts.push({
      table: qualified(table),
      sourceRows: sourceResult.count,
      targetRows: targetResult.count,
      sourceSha256: sourceResult.sha256,
      targetSha256: targetResult.sha256,
      matched,
    });
    if (!matched) throw new Error(`${qualified(table)} reconciliation failed`);
  }

  if (apply) await target.query("COMMIT");
  else await target.query("ROLLBACK");
  await source.query("ROLLBACK");
} catch (error) {
  await Promise.allSettled([
    source.query("ROLLBACK"),
    target.query("ROLLBACK"),
  ]);
  throw error;
} finally {
  await Promise.all([source.end(), target.end()]);
}

const report = {
  contractVersion: manifest.contractVersion,
  migrationId: manifest.migrationId,
  plane: manifest.plane,
  dataClass: manifest.dataClass,
  mode: apply ? "applied" : "dry_run",
  sourceDatabase: manifest.sourceDatabase,
  targetDatabase: manifest.targetDatabase,
  approvalTicket: manifest.approval.ticket,
  externalObjectEvidenceSha256: manifest.externalObjectEvidenceSha256 ?? null,
  tables: receipts,
  reconciled: receipts.every((receipt) => receipt.matched),
  deletes: 0,
  truncates: 0,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) await writeFile(outputPath, serialized, "utf8");
process.stdout.write(serialized);

async function assertDatabaseBoundary(
  client: pg.Client,
  expectedDatabase: string,
  plane: "neon" | "mesh",
): Promise<void> {
  const result = await client.query<{
    database_name: string;
    opposite_schema_count: string;
  }>(`
    SELECT
      current_database() AS database_name,
      (
        SELECT count(*)::text
        FROM pg_namespace
        WHERE nspname = ANY(
          CASE $1
            WHEN 'neon' THEN ARRAY['mesh', 'mesh_control', 'mesh_log']
            ELSE ARRAY['master', 'control', 'document', 'event', 'log']
          END
        )
      ) AS opposite_schema_count
  `, [plane]);
  const row = result.rows[0];
  if (
    row?.database_name !== expectedDatabase
    || Number(row.opposite_schema_count) !== 0
  ) {
    throw new Error(`${plane} database identity/plane boundary mismatch`);
  }
}

async function validateTableContract(
  client: pg.Client,
  table: TablePlan,
): Promise<void> {
  const result = await client.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
  `, [table.schema, table.table]);
  const actual = new Set(result.rows.map((row) => row.column_name));
  for (const column of [...table.columns, ...table.primaryKey]) {
    if (!actual.has(column)) {
      throw new Error(`${qualified(table)} missing declared column ${column}`);
    }
  }
  if (table.primaryKey.some((column) => !table.columns.includes(column))) {
    throw new Error(`${qualified(table)} primary key must be in columns`);
  }
}

async function scanTable(
  client: pg.Client,
  table: TablePlan,
  size: number,
  consume?: (rows: unknown[][]) => Promise<void>,
): Promise<{ count: number; sha256: string }> {
  const hash = createHash("sha256");
  let count = 0;
  let lastKey: unknown[] | null = null;
  const columnSql = table.columns.map(quoteIdentifier).join(", ");
  const keySql = table.primaryKey.map(quoteIdentifier).join(", ");
  while (true) {
    const predicate = lastKey
      ? `WHERE (${keySql}) > (${
        lastKey.map((_, index) => `$${index + 1}`).join(", ")
      })`
      : "";
    const result = await client.query({
      text: `
        SELECT ${columnSql}
        FROM ${qualified(table)}
        ${predicate}
        ORDER BY ${keySql}
        LIMIT ${size}
      `,
      values: lastKey ?? [],
      rowMode: "array",
    }) as unknown as { rows: unknown[][] };
    if (result.rows.length === 0) break;
    for (const row of result.rows) {
      hash.update(JSON.stringify(row));
      hash.update("\n");
    }
    if (consume) await consume(result.rows);
    count += result.rows.length;
    const last = result.rows.at(-1)!;
    lastKey = table.primaryKey.map((key) => last[table.columns.indexOf(key)]);
  }
  return { count, sha256: hash.digest("hex") };
}

async function insertBatch(
  client: pg.Client,
  table: TablePlan,
  rows: unknown[][],
): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = row.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  await client.query(`
    INSERT INTO ${qualified(table)}
      (${table.columns.map(quoteIdentifier).join(", ")})
    VALUES ${tuples.join(", ")}
  `, values);
}

function validateManifest(manifest: ExecutionManifest): void {
  if (
    manifest.contractVersion !== "wave6.fresh-database-disposition.v1"
    || manifest.approval?.status !== "approved"
    || !manifest.approval.ticket?.trim()
    || !manifest.approval.approvedBy?.trim()
    || Number.isNaN(Date.parse(manifest.approval.approvedAt))
    || !manifest.sourceDatabase?.trim()
    || !manifest.targetDatabase?.trim()
    || manifest.sourceDatabase === manifest.targetDatabase
    || !Array.isArray(manifest.tables)
    || manifest.tables.length === 0
  ) {
    throw new Error("invalid or unapproved disposition execution manifest");
  }
  if (
    manifest.dataClass === "document"
    && !/^[0-9a-f]{64}$/.test(manifest.externalObjectEvidenceSha256 ?? "")
  ) {
    throw new Error("document migration requires verified external object evidence");
  }
  for (const table of manifest.tables) {
    for (const identifier of [
      table.schema,
      table.table,
      ...table.columns,
      ...table.primaryKey,
    ]) {
      if (!/^[a-z][a-z0-9_]*$/.test(identifier)) {
        throw new Error(`unsafe SQL identifier in disposition manifest: ${identifier}`);
      }
    }
  }
}

function qualified(table: TablePlan): string {
  return `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.table)}`;
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error("unsafe SQL identifier");
  return `"${value}"`;
}

function emptyHash(): string {
  return createHash("sha256").digest("hex");
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function option(argsToRead: string[], name: string): string | undefined {
  return argsToRead.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim();
}
