#!/usr/bin/env node
// Metadata-driven Neon -> Mesh shared reference snapshot sync.
//
// Neon control.entity.data_policy->mesh_sync declares intent.
// This runner still enforces a code allowlist so metadata cannot widen the
// cross-database write surface by itself.

import { createHash } from "node:crypto";
import pg from "pg";
import {
  connectClient,
  loadProvisionEnvDefaults,
  parseSyncArgs,
  resolveMeshConnectionString,
  resolveNeonConnectionString,
  type SyncOptions as Options,
} from "./sync-shared-to-mesh-cli.js";
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

type SyncMode = "snapshot";
type SyncDirection = "neon_to_mesh";
type DeletePolicy = "ignore" | "deactivate_only";

type RawEntityRow = {
  entity_id: string;
  table_schema: string;
  table_name: string;
  mesh_sync: unknown;
};

type MeshSyncPolicy = {
  enabled: boolean;
  phase: number;
  direction: SyncDirection;
  mode: SyncMode;
  deletePolicy: DeletePolicy;
  keyFields: string[];
  dependsOn: string[];
  sourceVersion: string;
};

type SyncEntity = {
  entityId: string;
  schema: "shared";
  table: string;
  qualifiedName: string;
  policy: MeshSyncPolicy;
};

type ColumnRow = {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  is_identity: "YES" | "NO";
  is_generated: "ALWAYS" | "NEVER";
  ordinal_position: number;
};

type ColumnInfo = {
  name: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
  hasDefault: boolean;
  isIdentity: boolean;
  isGenerated: boolean;
  ordinal: number;
};

type DataRow = Record<string, unknown>;

const PHASE1_ALLOWED_TABLES = new Map<string, { keyFields: string[]; dependsOn: string[] }>([
  ["shared.country", { keyFields: ["code"], dependsOn: [] }],
  ["shared.currency", { keyFields: ["code"], dependsOn: [] }],
  ["shared.language", { keyFields: ["code"], dependsOn: [] }],
  ["shared.locale", { keyFields: ["code"], dependsOn: ["shared.language", "shared.country"] }],
  ["shared.timezone", { keyFields: ["code"], dependsOn: [] }],
  ["shared.uom", { keyFields: ["code"], dependsOn: [] }],
  ["shared.state_region", { keyFields: ["country_code", "code"], dependsOn: ["shared.country"] }],
]);

const LOCAL_AUDIT_COLUMNS = new Set([
  "id",
  "is_active",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "status_changed_at",
  "status_changed_by",
]);

function log(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data));
}

function qIdent(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe identifier: ${value}`);
  return `"${value}"`;
}

function qTable(schema: string, table: string): string {
  return `${qIdent(schema)}.${qIdent(table)}`;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function normalizePolicy(row: RawEntityRow): SyncEntity {
  if (row.table_schema !== "shared") {
    throw new Error(`Only shared.* entities can sync to Mesh. Got ${row.table_schema}.${row.table_name}`);
  }

  const qualifiedName = `${row.table_schema}.${row.table_name}`;
  const allowed = PHASE1_ALLOWED_TABLES.get(qualifiedName);
  if (!allowed) throw new Error(`Metadata requested sync for non-allowlisted table: ${qualifiedName}`);

  const rawPolicy = asObject(row.mesh_sync);
  const phase = typeof rawPolicy["phase"] === "number" ? rawPolicy["phase"] : Number(rawPolicy["phase"] ?? 1);
  const keyFields = asStringArray(rawPolicy["key_fields"]);
  const dependsOn = asStringArray(rawPolicy["depends_on"]);
  const direction = rawPolicy["direction"] === "neon_to_mesh" ? "neon_to_mesh" : null;
  const mode = rawPolicy["mode"] === "snapshot" ? "snapshot" : null;
  const deletePolicy = rawPolicy["delete_policy"] === "ignore" ? "ignore" : "deactivate_only";

  if (rawPolicy["enabled"] !== true) throw new Error(`mesh_sync.enabled must be true for ${qualifiedName}`);
  if (!Number.isInteger(phase) || phase < 1) throw new Error(`mesh_sync.phase must be a positive integer for ${qualifiedName}`);
  if (direction !== "neon_to_mesh") throw new Error(`mesh_sync.direction must be neon_to_mesh for ${qualifiedName}`);
  if (mode !== "snapshot") throw new Error(`mesh_sync.mode must be snapshot for ${qualifiedName}`);
  if (!sameStringArray(keyFields, allowed.keyFields)) {
    throw new Error(
      `mesh_sync.key_fields for ${qualifiedName} must be ${allowed.keyFields.join(",")}; got ${keyFields.join(",")}`,
    );
  }

  for (const dependency of dependsOn) {
    if (!allowed.dependsOn.includes(dependency)) {
      throw new Error(`mesh_sync.depends_on for ${qualifiedName} includes non-allowlisted dependency ${dependency}`);
    }
  }

  return {
    entityId: row.entity_id,
    schema: "shared",
    table: row.table_name,
    qualifiedName,
    policy: {
      enabled: true,
      phase,
      direction,
      mode,
      deletePolicy,
      keyFields,
      dependsOn,
      sourceVersion: typeof rawPolicy["source_version"] === "string" ? rawPolicy["source_version"] : `phase:${phase}`,
    },
  };
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function loadSyncEntities(source: pg.Client, opts: Options): Promise<SyncEntity[]> {
  const result = await source.query<RawEntityRow>(`
    SELECT
      e.id::text AS entity_id,
      e.table_schema,
      e.table_name,
      e.data_policy -> 'mesh_sync' AS mesh_sync
    FROM control.entity e
    WHERE e.table_schema = 'shared'
      AND e.status = 'ACTIVE'
      AND e.data_policy #>> '{mesh_sync,enabled}' = 'true'
    ORDER BY e.table_schema, e.table_name
  `);

  const entities = result.rows
    .map((row) => normalizePolicy(row))
    .filter((entity) => entity.policy.phase === opts.phase)
    .filter((entity) => !opts.tables || opts.tables.has(entity.qualifiedName));

  return sortByDependencies(entities);
}

function sortByDependencies(entities: SyncEntity[]): SyncEntity[] {
  const byName = new Map(entities.map((entity) => [entity.qualifiedName, entity]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: SyncEntity[] = [];

  function visit(entity: SyncEntity): void {
    if (visited.has(entity.qualifiedName)) return;
    if (visiting.has(entity.qualifiedName)) throw new Error(`Cycle in mesh_sync dependencies at ${entity.qualifiedName}`);

    visiting.add(entity.qualifiedName);
    for (const dependency of entity.policy.dependsOn) {
      const dependencyEntity = byName.get(dependency);
      if (dependencyEntity) visit(dependencyEntity);
    }
    visiting.delete(entity.qualifiedName);
    visited.add(entity.qualifiedName);
    ordered.push(entity);
  }

  for (const entity of entities) visit(entity);
  return ordered;
}

async function getColumns(client: pg.Client, schema: string, table: string): Promise<ColumnInfo[]> {
  const result = await client.query<ColumnRow>(
    `
      SELECT
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default,
        is_identity,
        is_generated,
        ordinal_position
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schema, table],
  );

  if (result.rows.length === 0) throw new Error(`Table does not exist or has no columns: ${schema}.${table}`);

  return result.rows.map((row) => ({
    name: row.column_name,
    dataType: row.data_type,
    udtName: row.udt_name,
    nullable: row.is_nullable === "YES",
    hasDefault: row.column_default !== null,
    isIdentity: row.is_identity === "YES",
    isGenerated: row.is_generated !== "NEVER",
    ordinal: row.ordinal_position,
  }));
}

function columnMap(columns: ColumnInfo[]): Map<string, ColumnInfo> {
  return new Map(columns.map((column) => [column.name, column]));
}

function assertCompatibleColumns(entity: SyncEntity, sourceColumns: ColumnInfo[], targetColumns: ColumnInfo[]): void {
  const targetByName = columnMap(targetColumns);

  for (const sourceColumn of sourceColumns) {
    const targetColumn = targetByName.get(sourceColumn.name);
    if (!targetColumn) {
      throw new Error(`Mesh target is missing column ${entity.qualifiedName}.${sourceColumn.name}`);
    }

    if (sourceColumn.udtName !== targetColumn.udtName) {
      throw new Error(
        `Column type mismatch for ${entity.qualifiedName}.${sourceColumn.name}: source ${sourceColumn.udtName}, target ${targetColumn.udtName}`,
      );
    }
  }

  for (const keyField of entity.policy.keyFields) {
    if (!targetByName.has(keyField)) throw new Error(`Mesh target is missing key field ${entity.qualifiedName}.${keyField}`);
  }
}

function deriveColumnSets(
  entity: SyncEntity,
  sourceColumns: ColumnInfo[],
  targetColumns: ColumnInfo[],
): { checksumColumns: string[]; insertColumns: string[]; updateColumns: string[]; selectColumns: string[] } {
  const sourceByName = columnMap(sourceColumns);
  const targetByName = columnMap(targetColumns);

  const checksumColumns = sourceColumns
    .filter((column) => !column.isGenerated && !column.isIdentity && !LOCAL_AUDIT_COLUMNS.has(column.name))
    .map((column) => column.name);

  const requiredInsertColumns = targetColumns
    .filter((column) => !column.isGenerated && !column.isIdentity)
    .filter((column) => !column.nullable && !column.hasDefault)
    .filter((column) => column.name !== "id")
    .map((column) => column.name)
    .filter((columnName) => sourceByName.has(columnName));

  const insertColumns = uniqueStrings([...checksumColumns, ...requiredInsertColumns]).filter((columnName) => {
    const targetColumn = targetByName.get(columnName);
    return targetColumn !== undefined && !targetColumn.isGenerated && !targetColumn.isIdentity;
  });

  const updateColumns = checksumColumns.filter((columnName) => !entity.policy.keyFields.includes(columnName));
  const selectColumns = uniqueStrings([...insertColumns, ...checksumColumns, ...entity.policy.keyFields]);

  if (checksumColumns.length === 0) throw new Error(`No syncable columns resolved for ${entity.qualifiedName}`);
  for (const keyField of entity.policy.keyFields) {
    if (!checksumColumns.includes(keyField)) {
      throw new Error(`Key field ${entity.qualifiedName}.${keyField} is not syncable`);
    }
  }

  return { checksumColumns, insertColumns, updateColumns, selectColumns };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

async function readRows(
  client: pg.Client,
  entity: SyncEntity,
  columns: string[],
): Promise<DataRow[]> {
  const sql = `
    SELECT ${columns.map(qIdent).join(", ")}
    FROM ${qTable(entity.schema, entity.table)}
    ORDER BY ${entity.policy.keyFields.map(qIdent).join(", ")}
  `;
  const result = await client.query<DataRow>(sql);
  return result.rows;
}

function stableNormalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => stableNormalize(item));
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      output[key] = stableNormalize(input[key]);
    }
    return output;
  }
  return value;
}

function computeSnapshotChecksum(entity: SyncEntity, rows: DataRow[], checksumColumns: string[]): string {
  const payload = {
    table: entity.qualifiedName,
    keyFields: entity.policy.keyFields,
    columns: checksumColumns,
    rows: rows.map((row) => checksumColumns.map((column) => stableNormalize(row[column]))),
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

async function getSyncState(client: pg.Client, tableName: string): Promise<{ checksum: string | null; status: string | null }> {
  const result = await client.query<{ source_checksum: string | null; status: string | null }>(
    `
      SELECT source_checksum, status
      FROM mesh_control.reference_sync_state
      WHERE table_name = $1
    `,
    [tableName],
  );
  const row = result.rows[0];
  return { checksum: row?.source_checksum ?? null, status: row?.status ?? null };
}

async function markSyncing(client: pg.Client, entity: SyncEntity, checksum: string, rowCount: number): Promise<void> {
  await client.query(
    `
      INSERT INTO mesh_control.reference_sync_state (
        table_name, source_version, source_checksum, last_synced_at,
        record_count, status, error_message, metadata, created_by, updated_at, updated_by
      )
      VALUES ($1, $2, $3, now(), $4, 'syncing', NULL, $5::jsonb, 'shared_sync', now(), 'shared_sync')
      ON CONFLICT (table_name) DO UPDATE SET
        source_version = EXCLUDED.source_version,
        source_checksum = EXCLUDED.source_checksum,
        record_count = EXCLUDED.record_count,
        status = 'syncing',
        error_message = NULL,
        metadata = EXCLUDED.metadata,
        updated_at = now(),
        updated_by = 'shared_sync'
    `,
    [
      entity.qualifiedName,
      entity.policy.sourceVersion,
      checksum,
      rowCount,
      JSON.stringify({
        entity_id: entity.entityId,
        direction: entity.policy.direction,
        mode: entity.policy.mode,
        phase: entity.policy.phase,
        key_fields: entity.policy.keyFields,
      }),
    ],
  );
}

async function markCurrent(
  client: pg.Client,
  entity: SyncEntity,
  checksum: string,
  rowCount: number,
  changedRows: number,
  deprecatedRows: number,
): Promise<void> {
  await client.query(
    `
      INSERT INTO mesh_control.reference_sync_state (
        table_name, source_version, source_checksum, last_synced_at,
        record_count, status, error_message, metadata, created_by, updated_at, updated_by
      )
      VALUES ($1, $2, $3, now(), $4, 'current', NULL, $5::jsonb, 'shared_sync', now(), 'shared_sync')
      ON CONFLICT (table_name) DO UPDATE SET
        source_version = EXCLUDED.source_version,
        source_checksum = EXCLUDED.source_checksum,
        last_synced_at = now(),
        record_count = EXCLUDED.record_count,
        status = 'current',
        error_message = NULL,
        metadata = EXCLUDED.metadata,
        updated_at = now(),
        updated_by = 'shared_sync'
    `,
    [
      entity.qualifiedName,
      entity.policy.sourceVersion,
      checksum,
      rowCount,
      JSON.stringify({
        entity_id: entity.entityId,
        direction: entity.policy.direction,
        mode: entity.policy.mode,
        phase: entity.policy.phase,
        key_fields: entity.policy.keyFields,
        changed_rows: changedRows,
        deprecated_rows: deprecatedRows,
      }),
    ],
  );
}

async function markError(client: pg.Client, entity: SyncEntity, error: unknown): Promise<void> {
  await client.query(
    `
      INSERT INTO mesh_control.reference_sync_state (
        table_name, source_version, last_synced_at, record_count,
        status, error_message, metadata, created_by, updated_at, updated_by
      )
      VALUES ($1, $2, now(), NULL, 'error', $3, $4::jsonb, 'shared_sync', now(), 'shared_sync')
      ON CONFLICT (table_name) DO UPDATE SET
        status = 'error',
        error_message = EXCLUDED.error_message,
        metadata = EXCLUDED.metadata,
        updated_at = now(),
        updated_by = 'shared_sync'
    `,
    [
      entity.qualifiedName,
      entity.policy.sourceVersion,
      String(error).slice(0, 2000),
      JSON.stringify({
        entity_id: entity.entityId,
        direction: entity.policy.direction,
        mode: entity.policy.mode,
        phase: entity.policy.phase,
      }),
    ],
  );
}

async function upsertRows(
  client: pg.Client,
  entity: SyncEntity,
  rows: DataRow[],
  insertColumns: string[],
  updateColumns: string[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const tableSql = `${qTable(entity.schema, entity.table)} AS target`;
  const insertSql = insertColumns.map(qIdent).join(", ");
  const conflictSql = entity.policy.keyFields.map(qIdent).join(", ");
  const updateSql = updateColumns
    .map((columnName) => `${qIdent(columnName)} = EXCLUDED.${qIdent(columnName)}`)
    .join(", ");
  const updateWhereSql = updateColumns
    .map((columnName) => `target.${qIdent(columnName)} IS DISTINCT FROM EXCLUDED.${qIdent(columnName)}`)
    .join(" OR ");

  let changedRows = 0;
  for (const row of rows) {
    const values = insertColumns.map((columnName) => row[columnName] ?? (columnName === "created_by" ? SYSTEM_USER_ID : null));
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    const sql = updateColumns.length > 0
      ? `
          INSERT INTO ${tableSql} (${insertSql})
          VALUES (${placeholders})
          ON CONFLICT (${conflictSql}) DO UPDATE SET
            ${updateSql}
          WHERE ${updateWhereSql}
        `
      : `
          INSERT INTO ${tableSql} (${insertSql})
          VALUES (${placeholders})
          ON CONFLICT (${conflictSql}) DO NOTHING
        `;

    const result = await client.query(sql, values);
    changedRows += result.rowCount ?? 0;
  }

  return changedRows;
}

async function deprecateMissingRows(
  client: pg.Client,
  entity: SyncEntity,
  rows: DataRow[],
  targetColumns: ColumnInfo[],
): Promise<number> {
  if (entity.policy.deletePolicy === "ignore") return 0;
  if (rows.length === 0) {
    log({ msg: "shared_mesh_sync_deactivate_skip_empty_source", table: entity.qualifiedName });
    return 0;
  }

  const targetByName = columnMap(targetColumns);
  if (!targetByName.has("status")) return 0;

  await client.query("DROP TABLE IF EXISTS pg_temp.mesh_sync_source_keys");
  await client.query(`
    CREATE TEMP TABLE mesh_sync_source_keys ON COMMIT DROP AS
    SELECT ${entity.policy.keyFields.map(qIdent).join(", ")}
    FROM ${qTable(entity.schema, entity.table)}
    WHERE false
  `);

  for (const row of rows) {
    const values = entity.policy.keyFields.map((keyField) => row[keyField]);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    await client.query(
      `INSERT INTO mesh_sync_source_keys (${entity.policy.keyFields.map(qIdent).join(", ")}) VALUES (${placeholders})`,
      values,
    );
  }

  const keyMatchSql = entity.policy.keyFields
    .map((keyField) => `source_keys.${qIdent(keyField)} IS NOT DISTINCT FROM target.${qIdent(keyField)}`)
    .join(" AND ");

  const result = await client.query(`
    UPDATE ${qTable(entity.schema, entity.table)} AS target
    SET status = 'deprecated'
    WHERE target.status IS DISTINCT FROM 'deprecated'
      AND NOT EXISTS (
        SELECT 1
        FROM mesh_sync_source_keys AS source_keys
        WHERE ${keyMatchSql}
      )
  `);

  return result.rowCount ?? 0;
}

async function syncEntity(source: pg.Client, target: pg.Client, entity: SyncEntity, opts: Options): Promise<void> {
  const sourceColumns = await getColumns(source, entity.schema, entity.table);
  const targetColumns = await getColumns(target, entity.schema, entity.table);
  assertCompatibleColumns(entity, sourceColumns, targetColumns);

  const columnSets = deriveColumnSets(entity, sourceColumns, targetColumns);
  const rows = await readRows(source, entity, columnSets.selectColumns);
  const checksum = computeSnapshotChecksum(entity, rows, columnSets.checksumColumns);
  const state = await getSyncState(target, entity.qualifiedName);

  if (!opts.force && state.checksum === checksum && state.status === "current") {
    log({
      msg: "shared_mesh_sync_skip",
      table: entity.qualifiedName,
      reason: "checksum_current",
      sourceChecksum: checksum,
      rowCount: rows.length,
    });
    return;
  }

  log({
    msg: opts.dryRun ? "shared_mesh_sync_dry_run" : "shared_mesh_sync_start",
    table: entity.qualifiedName,
    sourceChecksum: checksum,
    previousChecksum: state.checksum,
    rowCount: rows.length,
    insertColumns: columnSets.insertColumns,
    updateColumns: columnSets.updateColumns,
  });

  if (opts.dryRun) return;

  await target.query("BEGIN");
  try {
    await target.query("SET LOCAL app.mesh_admin = 'true'");
    await markSyncing(target, entity, checksum, rows.length);
    const changedRows = await upsertRows(target, entity, rows, columnSets.insertColumns, columnSets.updateColumns);
    const deprecatedRows = await deprecateMissingRows(target, entity, rows, targetColumns);
    await markCurrent(target, entity, checksum, rows.length, changedRows, deprecatedRows);
    await target.query("COMMIT");

    log({
      msg: "shared_mesh_sync_success",
      table: entity.qualifiedName,
      sourceChecksum: checksum,
      rowCount: rows.length,
      changedRows,
      deprecatedRows,
    });
  } catch (err) {
    await target.query("ROLLBACK");
    await markError(target, entity, err);
    log({ msg: "shared_mesh_sync_failed", table: entity.qualifiedName, error: String(err) });
    throw err;
  }
}

function connectionTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

async function main(): Promise<void> {
  loadProvisionEnvDefaults();

  const opts = parseSyncArgs(process.argv.slice(2), new Set(PHASE1_ALLOWED_TABLES.keys()));
  const sourceConnectionString = resolveNeonConnectionString();
  const source = await connectClient(sourceConnectionString);

  try {
    const entities = await loadSyncEntities(source, opts);
    log({
      msg: "shared_mesh_sync_metadata_resolved",
      phase: opts.phase,
      entityCount: entities.length,
      source: connectionTarget(sourceConnectionString),
      entities: entities.map((entity) => ({
        table: entity.qualifiedName,
        keyFields: entity.policy.keyFields,
        dependsOn: entity.policy.dependsOn,
        deletePolicy: entity.policy.deletePolicy,
      })),
    });

    if (opts.discover) return;

    if (entities.length === 0) {
      log({ msg: "shared_mesh_sync_noop", reason: "no metadata entities matched" });
      return;
    }

    const meshConnectionString = resolveMeshConnectionString();
    const target = await connectClient(meshConnectionString);
    try {
      await target.query("SET app.mesh_admin = 'true'");
      log({
        msg: "shared_mesh_sync_target",
        target: connectionTarget(meshConnectionString),
        dryRun: opts.dryRun,
        force: opts.force,
      });

      for (const entity of entities) {
        await syncEntity(source, target, entity, opts);
      }

      log({ msg: "shared_mesh_sync_complete", entityCount: entities.length });
    } finally {
      await target.end();
    }
  } finally {
    await source.end();
  }
}

main().catch((err: unknown) => {
  console.error(JSON.stringify({ msg: "shared_mesh_sync_fatal", error: String(err) }));
  process.exit(1);
});
