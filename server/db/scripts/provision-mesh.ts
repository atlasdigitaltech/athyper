#!/usr/bin/env node
// Standalone Mesh database provisioner.
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
//   - seed: shared global reference data + server/db/seed/tenants/mesh/000_exchange
//   - DDL-only: shared entitlement/RBAC tables such as module, permission, persona, plan, role
//
// Mesh account fixtures live only under server/db/seed/tenants/mesh/000_exchange.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

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
};

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

function toMeshDatabaseUrl(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    url.pathname = "/athyper_mesh";
    return url.toString();
  } catch {
    return connectionString
      .replace(/\/athyper_neon(?=\?|$)/, "/athyper_mesh")
      .replace(/\/athyper_dev1(?=\?|$)/, "/athyper_mesh");
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

function discoverMeshSqlFiles(): MeshSqlFile[] {
  const ddlRelPaths = [
    "ddl/mesh/00_bootstrap.sql",
    "ddl/mesh_log/00_bootstrap.sql",
    "ddl/mesh_control/00_bootstrap.sql",
    "ddl/shared/00_bootstrap.sql",
    "ddl/000_bootstrap/003_domains.sql",
    "ddl/shared/01_tables.sql",
    "ddl/mesh/_shared/03_constraints.sql",
    "ddl/shared/04_indexes.sql",
    "ddl/mesh/_shared/04_indexes.sql",
    "ddl/shared/05_functions.sql",
    "ddl/mesh/_shared/06_triggers.sql",
    "ddl/shared/08_rls.sql",
    "ddl/mesh/_shared/08_rls.sql",
    "ddl/mesh/01_tables.sql",
    "ddl/mesh/01a_foundation_tables.sql",
    "ddl/mesh/01b_participant_profile_tables.sql",
    "ddl/mesh/01c_content_collaboration_tables.sql",
    "ddl/mesh/01d_utility_tables.sql",
    "ddl/mesh/01e_commerce_tables.sql",
    "ddl/mesh/01z_account_grant_fingerprint.sql",
    "ddl/mesh_log/01_tables.sql",
    "ddl/mesh_control/01_tables.sql",
    "ddl/mesh/03_constraints.sql",
    "ddl/mesh/04_indexes.sql",
    "ddl/mesh_log/04_indexes.sql",
    "ddl/mesh_control/04_indexes.sql",
    "ddl/mesh/05_functions.sql",
    "ddl/mesh_log/05_functions.sql",
    "ddl/mesh_control/05_functions.sql",
    "ddl/mesh/06_triggers.sql",
    "ddl/mesh_log/06_triggers.sql",
    "ddl/mesh_control/06_triggers.sql",
    "ddl/mesh/08_rls.sql",
    "ddl/mesh_log/08_rls.sql",
    "ddl/mesh_control/08_rls.sql",
  ];

  const ddlFiles = ddlRelPaths.map((relPath) => {
    const absPath = join(DB_ROOT, ...relPath.split("/"));
    return {
      relPath,
      key: relPath.replace(/\.sql$/, ""),
      absPath,
      phase: "DDL" as const,
    };
  });

  const referenceSeedRelPaths = [
    "seed/platform/001_global_reference/001_country.sql",
    "seed/platform/001_global_reference/002_state_region.sql",
    "seed/platform/001_global_reference/003_currency.sql",
    "seed/platform/001_global_reference/004_language.sql",
    "seed/platform/001_global_reference/005_locale.sql",
    "seed/platform/001_global_reference/006_timezone.sql",
    "seed/platform/001_global_reference/007_uom.sql",
    "seed/platform/001_global_reference/008a_commodity_code_unspsc.sql",
    "seed/platform/001_global_reference/008b_commodity_code_hs.sql",
    "seed/platform/001_global_reference/008c_commodity_crosswalk.sql",
    "seed/platform/001_global_reference/008d_commodity_code_keywords.sql",
    "seed/platform/001_global_reference/009b_industry_code_isic_groups_classes.sql",
    "seed/platform/001_global_reference/009c_industry_code_naics_subsectors.sql",
    "seed/platform/001_global_reference/009d_industry_crosswalk.sql",
    "seed/platform/001_global_reference/009e_industry_code_keywords.sql",
  ];

  const referenceSeedFiles = referenceSeedRelPaths.map((relPath) => {
    const absPath = join(DB_ROOT, ...relPath.split("/"));
    return {
      relPath,
      key: relPath.replace(/\.sql$/, ""),
      absPath,
      phase: "Seed" as const,
    };
  });

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

async function resetMeshDatabase(client: pg.Client): Promise<void> {
  log({ msg: "mesh_reset_start" });
  await client.query("DROP SCHEMA IF EXISTS mesh CASCADE");
  log({ msg: "mesh_reset_drop_schema", schema: "mesh" });
  await client.query("DROP SCHEMA IF EXISTS mesh_log CASCADE");
  log({ msg: "mesh_reset_drop_schema", schema: "mesh_log" });
  await client.query("DROP SCHEMA IF EXISTS mesh_control CASCADE");
  log({ msg: "mesh_reset_drop_schema", schema: "mesh_control" });
  await client.query("DROP SCHEMA IF EXISTS shared CASCADE");
  log({ msg: "mesh_reset_drop_schema", schema: "shared" });
  await client.query("DROP TABLE IF EXISTS public.mesh_schema_provisions CASCADE");
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
    const sql = readFileSync(file.absPath, "utf8");
    const hash = checksum(sql);
    const previous = executed.get(file.key);
    const status = previous === undefined ? "PENDING" : previous === hash ? "OK" : "CHANGED";
    console.log(`${file.phase.padEnd(6)}  ${file.relPath.padEnd(58)}  ${status.padEnd(8)}  ${hash}`);
  }
}

async function runFiles(client: pg.Client, files: MeshSqlFile[], opts: MeshOptions): Promise<void> {
  await ensureTrackingTable(client);
  const executed = await getExecuted(client);
  const selectedFiles = files.filter((file) => opts.phases.includes(file.phase));

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
    const sql = readFileSync(file.absPath, "utf8");
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

function printDiscoveredFiles(files: MeshSqlFile[]): void {
  console.log("");
  console.log("Mesh DB provision file set");
  console.log("--------------------------");
  for (const file of files) {
    console.log(`${file.phase.padEnd(6)}  ${file.relPath}`);
  }
}

function resolveConnectionString(): string {
  const meshUrl = process.env.MESH_DATABASE_ADMIN_URL;
  if (meshUrl) return meshUrl;

  const baseAdminUrl = process.env.DATABASE_ADMIN_URL;
  if (baseAdminUrl) return toMeshDatabaseUrl(baseAdminUrl);

  const user = process.env.DB_ADMIN_USER ?? process.env.DB_USER;
  const password = process.env.DB_ADMIN_PASSWORD ?? process.env.DB_PASSWORD;
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "5432";
  if (user && password) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/athyper_mesh?sslmode=disable`;
  }

  throw new Error(
    "Cannot determine Mesh database credentials. Set MESH_DATABASE_ADMIN_URL, DATABASE_ADMIN_URL, or DB_ADMIN_USER/DB_ADMIN_PASSWORD.",
  );
}

async function main(): Promise<void> {
  loadProvisionEnvDefaults();

  const args = process.argv.slice(2);
  const files = discoverMeshSqlFiles();

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

  const phases: MeshPhase[] = ddlOnly ? ["DDL"] : seedOnly ? ["Seed"] : ["DDL", "Seed"];
  const connectionString = resolveConnectionString();
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
    if (invalidateArg) {
      await invalidateTracking(client, invalidateArg.split("=")[1] ?? "");
      return;
    }

    if (status) {
      await runStatus(client, files);
      return;
    }

    if (reset || dropOnly) {
      await resetMeshDatabase(client);
      if (dropOnly) return;
    }

    await runFiles(client, files, { phases, force });
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(JSON.stringify({ msg: "mesh_provision_fatal", error: String(err) }));
  process.exit(1);
});
