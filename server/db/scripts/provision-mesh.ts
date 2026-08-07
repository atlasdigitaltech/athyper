#!/usr/bin/env node
// Standalone Mesh database provisioner.
// Guarded local reset shorthand:
//   tsx scripts/provision-mesh.ts --reset --confirm LOCAL-AUTH-V2-RESET
//
// This runner is intentionally narrower than provision.ts:
//   - target database: athyper_mesh
//   - DDL: local shared reference schema + mesh tables/foundation/RLS
//   - DDL: selected Mesh-owned participant profile tables derived from BP patterns
//   - DDL: account-scoped evidence/content/collaboration tables
//   - DDL: Mesh-owned utility tables for uploads, calendars, preferences, and saved views
//   - DDL: Mesh commerce tables for supplier coverage, catalog, and logistics rates
//   - DDL: Mesh-native mesh_log audit/telemetry schema
//   - DDL: Mesh-native mesh_control runtime controls schema
//   - DDL: Mesh-local Wave 0 authorization controls and durable capture
//   - seed: shared global reference data + server/db/seed/tenants/mesh/000_exchange
//   - DDL-only: shared entitlement/RBAC tables such as module, permission, persona, plan, role
//
// Mesh account fixtures live only under server/db/seed/tenants/mesh/000_exchange.
// Use --capture-only to install/reconcile only the additive Wave 0 capture
// foundation on an already provisioned Mesh database. A live install also
// requires --expected-database and --approval-ticket.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import {
  acquireProvisionLock,
  assertDestructiveResetAllowed,
  assertPlaneFileBoundary,
  recordSeedExecution,
  registerSeedPack,
  resolveDestructiveResetCliApproval,
  seedReceipt,
} from "./safe-provision.js";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_ROOT = join(__dirname, "..");
const REPO_ROOT = join(__dirname, "../../..");

type MeshPhase = "DDL" | "Seed";

type MeshSqlFile = {
  relPath: string;
  key: string;
  absPath: string;
  phase: MeshPhase;
};

type MeshOptions = {
  phases: MeshPhase[];
  force: boolean;
  skipShared?: boolean;
};

const AUTHORIZATION_CAPTURE_DDL = new Set([
  "ddl/planes/mesh/authz/03_tables.sql",
  "ddl/common/event/03_tables.sql",
  "ddl/common/event/05_constraints.sql",
  "ddl/planes/mesh/authz/06_indexes.sql",
  "ddl/common/event/06_indexes.sql",
  "ddl/common/event/07_functions.sql",
  "ddl/common/event/08_triggers.sql",
  "ddl/common/event/09_views.sql",
  "ddl/planes/mesh/authz/10_rls.sql",
  "ddl/common/event/10_rls.sql",
]);

const AUTHORIZATION_CAPTURE_SOURCES = [
  "mesh.principal",
  "mesh.principal_identity_binding",
  "mesh.network_account",
  "mesh.account_grant",
  "mesh.network_relationship",
  "mesh.attachment_acl",
  "mesh.content_item_access_grant",
  "mesh.conversation_participant",
] as const;

function log(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data));
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvDefaults(filePath: string): void {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = unquoteEnvValue(rawValue ?? "");
  }
}

function loadProvisionEnvDefaults(): void {
  loadEnvDefaults(join(REPO_ROOT, "server", ".env"));
  loadEnvDefaults(join(REPO_ROOT, "stack", "env", ".env"));

  const secretsRoot = process.env.ATHYPER_SECRETS_ROOT;
  if (secretsRoot) {
    loadEnvDefaults(join(secretsRoot, ".env"));
  }
}

function localDockerHostFallback(connectionString: string): string | null {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return null;
  }

  const dockerDbHosts = new Set(["db", "athyper-db-1"]);
  const composeProjectName = process.env.COMPOSE_PROJECT_NAME;
  if (composeProjectName) {
    dockerDbHosts.add(`${composeProjectName}-db-1`);
  }

  if (!dockerDbHosts.has(url.hostname)) return null;

  url.hostname = "localhost";
  return url.toString();
}

function isNameResolutionError(err: unknown): boolean {
  return String(err).includes("getaddrinfo ENOTFOUND");
}

async function connectClient(connectionString: string): Promise<pg.Client> {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    return client;
  } catch (err) {
    const fallback = localDockerHostFallback(connectionString);
    if (!fallback || !isNameResolutionError(err)) throw err;

    log({ msg: "mesh_db_connection_retry_localhost" });
    const fallbackClient = new Client({ connectionString: fallback });
    await fallbackClient.connect();
    return fallbackClient;
  }
}

function collectSqlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  function walk(current: string): void {
    const entries = readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith("_")) walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".sql") && !entry.name.startsWith("_")) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function collectManifestSqlFiles(plane: "mesh"): string[] {
  const ddlRoot = resolve(DB_ROOT, "ddl");
  const manifestPath = resolve(ddlRoot, "planes", plane, "_manifest.txt");
  if (!existsSync(manifestPath)) throw new Error(`DDL manifest not found: ${manifestPath}`);
  return readFileSync(manifestPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((entry) => {
      const absPath = resolve(ddlRoot, entry);
      if (!entry.endsWith(".sql") || relative(ddlRoot, absPath).startsWith("..") || !existsSync(absPath)) {
        throw new Error(`Invalid or missing DDL manifest entry: ${entry}`);
      }
      return absPath;
    });
}

function readExpandedSql(absPath: string, includeStack = new Set<string>()): string {
  const resolvedPath = resolve(absPath);
  if (includeStack.has(resolvedPath)) throw new Error(`Recursive SQL include: ${resolvedPath}`);
  includeStack.add(resolvedPath);
  try {
    return readFileSync(resolvedPath, "utf8")
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^\s*\\ir\s+(.+?)\s*$/);
        if (!match?.[1]) return line;
        const includeValue = match[1].trim().replace(/^['"]|['"]$/g, "");
        return readExpandedSql(resolve(dirname(resolvedPath), includeValue), includeStack);
      })
      .join("\n");
  } finally {
    includeStack.delete(resolvedPath);
  }
}

function readMeshSql(file: MeshSqlFile): string {
  return file.phase === "DDL" ? readExpandedSql(file.absPath) : readFileSync(file.absPath, "utf8");
}

export function discoverMeshSqlFiles(): MeshSqlFile[] {
  const ddlRelPaths = [
    "ddl/planes/mesh/mesh/00_schema.sql",
    "ddl/common/log/00_schema.sql",
    "ddl/planes/mesh/control/00_schema.sql",
    "ddl/common/shared/00_schema.sql",
    "ddl/common/shared/02_domains.sql",
    "ddl/common/shared/03_tables.sql",
    "ddl/planes/mesh/mesh/03_tables.sql",
    "ddl/common/shared/06_indexes.sql",
    "ddl/planes/mesh/mesh/03_tables.sql",
    "ddl/common/shared/07_functions.sql",
    "ddl/planes/mesh/mesh/03_tables.sql",
    "ddl/common/shared/10_rls.sql",
    "ddl/planes/mesh/mesh/03_tables.sql",
    "ddl/planes/mesh/mesh/03_tables.sql",
    "ddl/planes/mesh/mesh/03_tables.sql",
    "ddl/planes/mesh/mesh/03_tables.sql",
    "ddl/planes/mesh/mesh/03_tables.sql",
    "ddl/planes/mesh/mesh/03_tables.sql",
    "ddl/planes/mesh/mesh/03_tables.sql",
    "ddl/common/log/03_tables.sql",
    "ddl/planes/mesh/control/03_tables.sql",
    "ddl/planes/mesh/authz/03_tables.sql",
    "ddl/common/event/03_tables.sql",
    "ddl/planes/mesh/authz/03_tables.sql",
    "ddl/planes/mesh/authz/03_tables.sql",
    "ddl/planes/mesh/authz/03_tables.sql",
    "ddl/planes/mesh/authz/03_tables.sql",
    "ddl/planes/mesh/authz/03_tables.sql",
    "ddl/planes/mesh/authz/03_tables.sql",
    "ddl/planes/mesh/authz/03_tables.sql",
    "ddl/planes/mesh/control/03_tables.sql",
    "ddl/common/ops/03_tables.sql",
    "ddl/common/event/03_tables.sql",
    "ddl/common/ops/03_tables.sql",
    "ddl/planes/mesh/mesh/05_constraints.sql",
    "ddl/planes/mesh/authz/05_constraints.sql",
    "ddl/planes/mesh/authz/05_constraints.sql",
    "ddl/planes/mesh/authz/05_constraints.sql",
    "ddl/common/ops/05_constraints.sql",
    "ddl/planes/mesh/authz/05_constraints.sql",
    "ddl/common/event/05_constraints.sql",
    "ddl/common/event/05_constraints.sql",
    "ddl/planes/mesh/mesh/06_indexes.sql",
    "ddl/planes/mesh/authz/06_indexes.sql",
    "ddl/common/log/06_indexes.sql",
    "ddl/planes/mesh/control/06_indexes.sql",
    "ddl/planes/mesh/authz/06_indexes.sql",
    "ddl/planes/mesh/authz/06_indexes.sql",
    "ddl/common/event/06_indexes.sql",
    "ddl/common/event/06_indexes.sql",
    "ddl/planes/mesh/mesh/07_functions.sql",
    "ddl/common/log/07_functions.sql",
    "ddl/planes/mesh/control/07_functions.sql",
    "ddl/planes/mesh/authz/07_functions.sql",
    "ddl/common/ops/07_functions.sql",
    "ddl/planes/mesh/authz/07_functions.sql",
    "ddl/common/event/07_functions.sql",
    "ddl/planes/mesh/mesh/08_triggers.sql",
    "ddl/common/log/08_triggers.sql",
    "ddl/planes/mesh/control/08_triggers.sql",
    "ddl/planes/mesh/authz/08_triggers.sql",
    "ddl/planes/mesh/authz/08_triggers.sql",
    "ddl/planes/mesh/authz/08_triggers.sql",
    "ddl/common/ops/08_triggers.sql",
    "ddl/planes/mesh/authz/08_triggers.sql",
    "ddl/common/event/08_triggers.sql",
    "ddl/common/event/08_triggers.sql",
    "ddl/planes/mesh/authz/09_views.sql",
    "ddl/planes/mesh/authz/09_views.sql",
    "ddl/common/event/09_views.sql",
    "ddl/common/event/09_views.sql",
    "ddl/common/ops/09_views.sql",
    "ddl/planes/mesh/mesh/10_rls.sql",
    "ddl/planes/mesh/authz/10_rls.sql",
    "ddl/common/log/10_rls.sql",
    "ddl/planes/mesh/control/10_rls.sql",
    "ddl/planes/mesh/authz/10_rls.sql",
    "ddl/planes/mesh/authz/10_rls.sql",
    "ddl/planes/mesh/authz/10_rls.sql",
    "ddl/common/event/10_rls.sql",
    "ddl/planes/mesh/authz/10_rls.sql",
    "ddl/common/ops/10_rls.sql",
    "ddl/common/event/10_rls.sql",
    "ddl/planes/mesh/master/12_platform_catalog_reference_seed.sql",
  ];

  const ddlFiles = collectManifestSqlFiles("mesh").map((absPath) => {
    const relPath = relative(DB_ROOT, absPath).replace(/\\/g, "/");
    return {
      relPath,
      key: relPath.replace(/\.sql$/, ""),
      absPath,
      phase: "DDL" as const,
    };
  });

  const referenceSeedRelPaths = [
    "ddl/common/shared/reference-data/001_country.sql",
    "ddl/common/shared/reference-data/002_state_region.sql",
    "ddl/common/shared/reference-data/003_currency.sql",
    "ddl/common/shared/reference-data/004_language.sql",
    "ddl/common/shared/reference-data/005_locale.sql",
    "ddl/common/shared/reference-data/006_timezone.sql",
    "ddl/common/shared/reference-data/007_uom.sql",
    "ddl/common/shared/reference-data/008a_commodity_code_unspsc.sql",
    "ddl/common/shared/reference-data/008b_commodity_code_hs.sql",
    "ddl/common/shared/reference-data/008c_commodity_crosswalk.sql",
    "ddl/common/shared/reference-data/008d_commodity_code_keywords.sql",
    "ddl/common/shared/reference-data/009b_industry_code_isic_groups_classes.sql",
    "ddl/common/shared/reference-data/009c_industry_code_naics_subsectors.sql",
    "ddl/common/shared/reference-data/009d_industry_crosswalk.sql",
    "ddl/common/shared/reference-data/009e_industry_code_keywords.sql",
  ];

  const referenceSeedFiles: MeshSqlFile[] = [];

  const seedRoot = join(DB_ROOT, "seed", "tenants", "mesh", "000_exchange");
  const seedFiles = collectSqlFiles(seedRoot).map((absPath) => {
    // Keep "mesh/900_exchange/" prefix so schema_provisions tracking keys are stable.
    const relPath = `mesh/900_exchange/${relative(seedRoot, absPath).replace(/\\/g, "/")}`;
    return {
      relPath,
      key: relPath.replace(/\.sql$/, ""),
      absPath,
      phase: "Seed" as const,
    };
  });

  const missing = ddlFiles.filter((file) => !existsSync(file.absPath));
  if (missing.length > 0) {
    throw new Error(`Missing required Mesh DDL file(s): ${missing.map((f) => f.relPath).join(", ")}`);
  }

  const missingReferenceSeeds = referenceSeedFiles.filter((file) => !existsSync(file.absPath));
  if (missingReferenceSeeds.length > 0) {
    throw new Error(
      `Missing required Mesh reference seed file(s): ${missingReferenceSeeds.map((f) => f.relPath).join(", ")}`,
    );
  }

  return [...ddlFiles, ...referenceSeedFiles, ...seedFiles];
}

function checksum(sql: string): string {
  let hash = 5381;
  for (let i = 0; i < sql.length; i++) {
    hash = ((hash << 5) + hash + sql.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isSharedProvisionFile(file: MeshSqlFile): boolean {
  return (
    file.relPath.startsWith("ddl/common/")
    || file.relPath.startsWith("ddl/common/shared/reference-data/")
  );
}

function isAuthorizationCaptureFile(file: MeshSqlFile): boolean {
  return AUTHORIZATION_CAPTURE_DDL.has(file.relPath);
}

async function ensureTrackingTable(client: pg.Client): Promise<void> {
  await client.query("CREATE SCHEMA IF NOT EXISTS public");
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.mesh_schema_provisions (
      id          serial primary key,
      file_name   text unique not null,
      checksum    text not null,
      executed_at timestamptz not null default now()
    )
  `);
}

async function getExecuted(client: pg.Client): Promise<Map<string, string>> {
  const result = await client.query<{ file_name: string; checksum: string }>(
    "SELECT file_name, checksum FROM public.mesh_schema_provisions ORDER BY id",
  );
  return new Map(result.rows.map((row) => [row.file_name, row.checksum]));
}

async function markExecuted(client: pg.Client, key: string, hash: string): Promise<void> {
  await client.query(
    `INSERT INTO public.mesh_schema_provisions (file_name, checksum, executed_at)
     VALUES ($1, $2, now())
     ON CONFLICT (file_name) DO UPDATE SET
       checksum = EXCLUDED.checksum,
       executed_at = now()`,
    [key, hash],
  );
}

async function resetMeshDatabase(
  client: pg.Client,
  options: {
    keepSharedSchema?: boolean;
    expectedDatabase: string;
    acknowledgement: string;
    disposableEnvironmentMarker: string;
    executionProfile: string;
    approvalLabel: string;
    refreshDisposableFingerprint?: boolean;
  },
): Promise<void> {
  await assertDestructiveResetAllowed(client, {
    plane: "mesh",
    expectedDatabase: options.expectedDatabase,
    acknowledgement: options.acknowledgement,
    disposableEnvironmentMarker: options.disposableEnvironmentMarker,
    executionProfile: options.executionProfile,
    approvalLabel: options.approvalLabel,
    refreshDisposableFingerprint: options.refreshDisposableFingerprint,
  });
  log({ msg: "mesh_reset_start" });
  await client.query("DROP SCHEMA IF EXISTS mesh CASCADE");
  log({ msg: "mesh_reset_drop_schema", schema: "mesh" });
  await client.query("DROP SCHEMA IF EXISTS mesh_log CASCADE");
  log({ msg: "mesh_reset_drop_schema", schema: "mesh_log" });
  await client.query("DROP SCHEMA IF EXISTS mesh_control CASCADE");
  log({ msg: "mesh_reset_drop_schema", schema: "mesh_control" });
  if (options.keepSharedSchema) {
    log({ msg: "mesh_reset_keep_schema", schema: "shared" });
  } else {
    await client.query("DROP SCHEMA IF EXISTS shared CASCADE");
    log({ msg: "mesh_reset_drop_schema", schema: "shared" });
  }
  await client.query("DROP TABLE IF EXISTS public.mesh_schema_provisions CASCADE");
  await client.query("DROP TABLE IF EXISTS public.seed_pack_execution_v2 CASCADE");
  await client.query("DROP TABLE IF EXISTS public.seed_pack_ledger_v2 CASCADE");
  log({ msg: "mesh_reset_complete" });
}

async function invalidateTracking(client: pg.Client, pattern: string): Promise<void> {
  await ensureTrackingTable(client);
  const result = await client.query(
    `DELETE FROM public.mesh_schema_provisions
      WHERE file_name ILIKE '%' || $1 || '%'`,
    [pattern],
  );
  log({ msg: "mesh_invalidate_complete", pattern, deleted: result.rowCount ?? 0 });
}

async function runStatus(client: pg.Client, files: MeshSqlFile[]): Promise<void> {
  await ensureTrackingTable(client);
  const executed = await getExecuted(client);

  console.log("");
  console.log("Mesh DB provision status");
  console.log("------------------------");
  for (const file of files) {
    const sql = readMeshSql(file);
    const hash = checksum(sql);
    const previous = executed.get(file.key);
    const status = previous === undefined ? "PENDING" : previous === hash ? "OK" : "CHANGED";
    console.log(`${file.phase.padEnd(6)}  ${file.relPath.padEnd(58)}  ${status.padEnd(8)}  ${hash}`);
  }
}

async function runFiles(client: pg.Client, files: MeshSqlFile[], opts: MeshOptions): Promise<void> {
  await ensureTrackingTable(client);
  const executed = await getExecuted(client);
  const selectedFiles = files.filter((file) => (
    opts.phases.includes(file.phase)
    && !(opts.skipShared && isSharedProvisionFile(file))
  ));
  const seedReceipts = new Map(
    selectedFiles
      .filter((file) => file.phase === "Seed")
      .map((file) => {
        const source = readMeshSql(file);
        const receipt = seedReceipt({
          plane: "mesh",
          packKey: file.key,
          sourcePath: file.relPath,
          source,
        });
        return [file.key, receipt] as const;
      }),
  );
  for (const receipt of seedReceipts.values()) {
    await registerSeedPack(client, receipt);
  }

  if (selectedFiles.length === 0) {
    log({ msg: "mesh_provision_noop", reason: "no matching SQL files" });
    return;
  }

  log({
    msg: "mesh_provision_start",
    phases: opts.phases,
    fileCount: selectedFiles.length,
    force: opts.force,
  });

  for (const file of selectedFiles) {
    const sql = readMeshSql(file);
    const hash = checksum(sql);
    const previousHash = executed.get(file.key);

    if (!opts.force && previousHash === hash) {
      log({ msg: "mesh_provision_skip", file: file.key, reason: "already_executed" });
      continue;
    }

    const started = Date.now();
    log({ msg: "mesh_provision_executing", file: file.key, phase: file.phase });
    await client.query("BEGIN");
    try {
      if (file.phase === "Seed") {
        await client.query("SET LOCAL app.mesh_admin = 'true'");
      }
      await client.query(sql);
      await markExecuted(client, file.key, hash);
      const receipt = seedReceipts.get(file.key);
      if (receipt) {
        await recordSeedExecution(
          client,
          receipt,
          opts.force ? "forced_reseed" : previousHash === undefined
            ? "clean"
            : "upgrade",
        );
      }
      await client.query("COMMIT");
      log({
        msg: "mesh_provision_success",
        file: file.key,
        durationMs: Date.now() - started,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      log({
        msg: "mesh_provision_failed",
        file: file.key,
        error: String(err),
      });
      throw err;
    }
  }

  log({ msg: "mesh_provision_complete", phases: opts.phases });
}

async function runAuthorizationCaptureFiles(
  client: pg.Client,
  files: MeshSqlFile[],
  force: boolean,
  expectedDatabase: string,
  approvalTicket: string,
): Promise<void> {
  const captureFiles = files.filter(isAuthorizationCaptureFile);
  if (captureFiles.length !== AUTHORIZATION_CAPTURE_DDL.size) {
    throw new Error(
      `Capture-only file set is incomplete: expected `
        + `${AUTHORIZATION_CAPTURE_DDL.size}, found ${captureFiles.length}.`,
    );
  }

  await ensureTrackingTable(client);
  const executed = await getExecuted(client);
  const pending = captureFiles.filter((file) => {
    const sql = readMeshSql(file);
    return force || executed.get(file.key) !== checksum(sql);
  });

  log({
    msg: "mesh_authorization_capture_install_start",
    plane: "mesh",
    transactionAtomic: true,
    sourceCount: AUTHORIZATION_CAPTURE_SOURCES.length,
    fileCount: captureFiles.length,
    pendingFileCount: pending.length,
    force,
  });

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '30s'");
    await client.query("SET LOCAL statement_timeout = '5min'");
    await client.query(
      "SELECT set_config('app.authorization_migration_approval_ticket', $1, true)",
      [approvalTicket],
    );

    const boundary = await client.query<{
      database_name: string;
      forbidden_neon_schemas: string[];
    }>(`
      SELECT
        current_database() AS database_name,
        ARRAY(
          SELECT namespace_name
          FROM unnest(ARRAY[
            'master', 'control', 'event', 'document', 'audit'
          ]::text[]) AS forbidden(namespace_name)
          WHERE to_regnamespace(namespace_name) IS NOT NULL
          ORDER BY namespace_name
        ) AS forbidden_neon_schemas
    `);
    const boundaryRow = boundary.rows[0];
    if (!boundaryRow || boundaryRow.database_name !== expectedDatabase) {
      throw new Error(
        "Capture-only database identity mismatch: "
          + `expected ${expectedDatabase}, got `
          + `${boundaryRow?.database_name ?? "unreported"}.`,
      );
    }
    const forbiddenSchemas = boundaryRow.forbidden_neon_schemas;
    if (forbiddenSchemas.length > 0) {
      throw new Error(
        `Capture-only target violates the Mesh boundary; Neon schemas present: `
          + forbiddenSchemas.join(", "),
      );
    }

    // One lock statement acquires all source locks before any capture DDL.
    // SHARE ROW EXCLUSIVE blocks INSERT/UPDATE/DELETE/TRUNCATE and is held
    // through trigger creation, receipt verification, and commit.
    await client.query(
      `LOCK TABLE ${AUTHORIZATION_CAPTURE_SOURCES.join(", ")}
       IN SHARE ROW EXCLUSIVE MODE`,
    );

    for (const file of captureFiles) {
      const sql = readMeshSql(file);
      const hash = checksum(sql);
      if (!force && executed.get(file.key) === hash) {
        log({
          msg: "mesh_authorization_capture_install_skip",
          file: file.key,
          reason: "already_executed",
        });
        continue;
      }

      const started = Date.now();
      log({
        msg: "mesh_authorization_capture_install_executing",
        file: file.key,
      });
      await client.query(sql);
      await markExecuted(client, file.key, hash);
      log({
        msg: "mesh_authorization_capture_install_file_success",
        file: file.key,
        durationMs: Date.now() - started,
      });
    }

    const receiptResult = await client.query<{
      database_name: string;
      database_oid: string;
      plane: string;
      source_database_id: string;
      capture_contract_version: string;
      source_watermark: string;
      registered_source_count: string;
      total_source_count: string;
      enabled_source_count: string;
      source_set_sha256: string;
      expected_source_set_sha256: string;
      always_row_trigger_count: string;
      always_truncate_trigger_count: string;
      installation_txid: string;
      transaction_snapshot: string;
      receipt_observed_at: Date;
    }>(`
      WITH expected_source(source_schema, source_table) AS (
        VALUES
          ('mesh', 'principal'),
          ('mesh', 'principal_identity_binding'),
          ('mesh', 'network_account'),
          ('mesh', 'account_grant'),
          ('mesh', 'network_relationship'),
          ('mesh', 'attachment_acl'),
          ('mesh', 'content_item_access_grant'),
          ('mesh', 'conversation_participant')
      ),
      source_health AS (
        SELECT
          count(*) FILTER (
            WHERE capture_source.capture_enabled
          )::text AS registered_source_count,
          count(*) FILTER (
            WHERE capture_source.capture_enabled
              AND row_trigger.tgenabled = 'A'
          )::text AS always_row_trigger_count,
          count(*) FILTER (
            WHERE capture_source.capture_enabled
              AND truncate_trigger.tgenabled = 'A'
          )::text AS always_truncate_trigger_count
        FROM expected_source AS expected
        JOIN mesh_control.authorization_capture_source AS capture_source
          USING (source_schema, source_table)
        JOIN pg_namespace AS namespace
          ON namespace.nspname = capture_source.source_schema
        JOIN pg_class AS relation
          ON relation.relnamespace = namespace.oid
         AND relation.relname = capture_source.source_table
        LEFT JOIN pg_trigger AS row_trigger
          ON row_trigger.tgrelid = relation.oid
         AND row_trigger.tgname = 'trg_mesh_authz_wave0_capture_row'
         AND NOT row_trigger.tgisinternal
        LEFT JOIN pg_trigger AS truncate_trigger
          ON truncate_trigger.tgrelid = relation.oid
         AND truncate_trigger.tgname =
             'trg_mesh_authz_wave0_capture_truncate'
         AND NOT truncate_trigger.tgisinternal
      ),
      registry_health AS (
        SELECT
          count(*)::text AS total_source_count,
          count(*) FILTER (WHERE capture_enabled)::text
            AS enabled_source_count,
          encode(
            public.digest(
              string_agg(
                source_schema || '.' || source_table,
                ',' ORDER BY source_schema, source_table
              ),
              'sha256'
            ),
            'hex'
          ) AS source_set_sha256
        FROM mesh_control.authorization_capture_source
      ),
      expected_health AS (
        SELECT encode(
          public.digest(
            string_agg(
              source_schema || '.' || source_table,
              ',' ORDER BY source_schema, source_table
            ),
            'sha256'
          ),
          'hex'
        ) AS expected_source_set_sha256
        FROM expected_source
      )
      SELECT
        current_database() AS database_name,
        (
          SELECT oid::text
          FROM pg_database
          WHERE datname = current_database()
        ) AS database_oid,
        clock.plane_key AS plane,
        clock.source_database_id,
        clock.capture_contract_version,
        clock.current_watermark AS source_watermark,
        health.registered_source_count,
        registry.total_source_count,
        registry.enabled_source_count,
        registry.source_set_sha256,
        expected.expected_source_set_sha256,
        health.always_row_trigger_count,
        health.always_truncate_trigger_count,
        txid_current()::text AS installation_txid,
        txid_current_snapshot()::text AS transaction_snapshot,
        clock_timestamp() AS receipt_observed_at
      FROM mesh_log.authorization_capture_clock AS clock
      CROSS JOIN source_health AS health
      CROSS JOIN registry_health AS registry
      CROSS JOIN expected_health AS expected
      WHERE clock.singleton_id = 1
    `);
    const receipt = receiptResult.rows[0];
    const expectedCount = String(AUTHORIZATION_CAPTURE_SOURCES.length);
    if (
      !receipt
      || receipt.plane !== "mesh"
      || receipt.registered_source_count !== expectedCount
      || receipt.total_source_count !== expectedCount
      || receipt.enabled_source_count !== expectedCount
      || receipt.source_set_sha256 !== receipt.expected_source_set_sha256
      || receipt.always_row_trigger_count !== expectedCount
      || receipt.always_truncate_trigger_count !== expectedCount
    ) {
      throw new Error(
        `Capture receipt verification failed: ${JSON.stringify(receipt ?? null)}`,
      );
    }

    await client.query("COMMIT");
    log({
      msg: "mesh_authorization_capture_install_receipt",
      schemaVersion: "wave0.mesh-authorization-capture-install-receipt.v1",
      transactionAtomic: true,
      approvalTicket,
      ...receipt,
      committedAt: new Date().toISOString(),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    log({
      msg: "mesh_authorization_capture_install_failed",
      transactionAtomic: true,
      error: String(err),
    });
    throw err;
  }
}

function printDiscoveredFiles(files: MeshSqlFile[]): void {
  console.log("");
  console.log("Mesh DB provision file set");
  console.log("--------------------------");
  for (const file of files) {
    console.log(`${file.phase.padEnd(6)}  ${file.relPath}`);
  }
}

function resolveConnectionString(captureOnly = false): string {
  const meshUrl = process.env.MESH_DATABASE_ADMIN_URL;
  if (meshUrl) return meshUrl;

  if (captureOnly) {
    const meshRuntimeUrl = process.env.MESH_DATABASE_URL;
    if (meshRuntimeUrl) return meshRuntimeUrl;
    throw new Error(
      "--capture-only requires MESH_DATABASE_ADMIN_URL or MESH_DATABASE_URL; "
        + "it never falls back to DATABASE_ADMIN_URL or DATABASE_URL.",
    );
  }

  const user = process.env.DB_ADMIN_USER ?? process.env.DB_USER;
  const password = process.env.DB_ADMIN_PASSWORD ?? process.env.DB_PASSWORD;
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "5432";
  if (user && password) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/athyper_mesh?sslmode=disable`;
  }

  throw new Error(
    "Cannot determine Mesh database credentials. Set MESH_DATABASE_ADMIN_URL or explicit DB_ADMIN_USER/DB_ADMIN_PASSWORD; Neon database URLs are never a fallback.",
  );
}

async function main(): Promise<void> {
  loadProvisionEnvDefaults();

  const args = process.argv.slice(2);
  const keepShared = args.includes("--keep-shared");
  const skipShared = args.includes("--skip-shared") || keepShared;
  const captureOnly = args.includes("--capture-only");
  const destructiveApproval = resolveDestructiveResetCliApproval(
    args,
    "mesh",
    process.env.ATHYPER_DISPOSABLE_ENVIRONMENT,
  );
  const expectedDatabase = destructiveApproval.expectedDatabase || undefined;
  const approvalTicket = args.find(
    (arg) => arg.startsWith("--approval-ticket="),
  )?.slice("--approval-ticket=".length).trim();
  const files = discoverMeshSqlFiles().filter((file) => (
    !skipShared || !isSharedProvisionFile(file)
  )).filter((file) => (
    !captureOnly || isAuthorizationCaptureFile(file)
  ));
  assertPlaneFileBoundary("mesh", files.map((file) => file.relPath));

  if (args.includes("--discover")) {
    printDiscoveredFiles(files);
    return;
  }

  const reset = args.includes("--reset");
  const dropOnly = args.includes("--drop-only");
  const status = args.includes("--status");
  const force = args.includes("--force");
  const ddlOnly = args.includes("--ddl-only");
  const seedOnly = args.includes("--seed-only");
  const invalidateArg = args.find((arg) => arg.startsWith("--invalidate="));

  if (ddlOnly && seedOnly) {
    throw new Error("--ddl-only and --seed-only cannot be combined.");
  }
  if (captureOnly && (reset || dropOnly || seedOnly)) {
    throw new Error(
      "--capture-only cannot be combined with --reset, --drop-only, or --seed-only.",
    );
  }
  if (captureOnly && (!expectedDatabase || !approvalTicket)) {
    throw new Error(
      "--capture-only requires --expected-database=<exact name> "
        + "and --approval-ticket=<ticket>.",
    );
  }

  const phases: MeshPhase[] = captureOnly || ddlOnly
    ? ["DDL"]
    : seedOnly
      ? ["Seed"]
      : ["DDL", "Seed"];
  const connectionString = resolveConnectionString(captureOnly);
  const target = (() => {
    try {
      const url = new URL(connectionString);
      return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
    } catch {
      return "(unparseable connection string)";
    }
  })();

  log({ msg: "mesh_provision_target", target });
  const client = await connectClient(connectionString);

  try {
    await acquireProvisionLock(client, "mesh");
    if (invalidateArg) {
      await invalidateTracking(client, invalidateArg.split("=")[1] ?? "");
      return;
    }

    if (status) {
      await runStatus(client, files);
      return;
    }

    if (reset || dropOnly) {
      await resetMeshDatabase(client, {
        keepSharedSchema: keepShared,
        expectedDatabase: destructiveApproval.expectedDatabase,
        acknowledgement: destructiveApproval.acknowledgement,
        disposableEnvironmentMarker:
          destructiveApproval.disposableEnvironmentMarker,
        executionProfile: destructiveApproval.executionProfile,
        approvalLabel: destructiveApproval.approvalLabel,
        refreshDisposableFingerprint:
          destructiveApproval.confirmationShorthandUsed,
      });
      if (dropOnly) return;
    }

    if (captureOnly) {
      await runAuthorizationCaptureFiles(
        client,
        files,
        force,
        expectedDatabase!,
        approvalTicket!,
      );
    } else {
      await runFiles(client, files, { phases, force, skipShared });
    }
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(JSON.stringify({ msg: "mesh_provision_fatal", error: String(err) }));
  process.exit(1);
});
