import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

export type SyncOptions = {
  phase: number;
  tables: Set<string> | null;
  dryRun: boolean;
  discover: boolean;
  force: boolean;
};

function log(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data));
}

function printHelp(): void {
  console.log(`
Usage:
  tsx scripts/operations/mesh/sync-shared-to-mesh.ts [options]

Options:
  --phase=1              Sync mesh_sync policy phase. Defaults to 1.
  --table=shared.country Limit to a table. Repeatable.
  --dry-run              Resolve metadata and checksums without writing Mesh.
  --discover             Print resolved metadata entities only.
  --force                Run even when Mesh sync state has the same source checksum.
  --help                 Show this help.

Environment:
  NEON_DATABASE_ADMIN_URL or DATABASE_ADMIN_URL       Neon source DB
  MESH_DATABASE_ADMIN_URL or DATABASE_ADMIN_URL       Mesh target DB
`);
}

export function parseSyncArgs(argv: string[], allowedTables: ReadonlySet<string>): SyncOptions {
  let phase = 1;
  const tables = new Set<string>();
  let dryRun = false;
  let discover = false;
  let force = false;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--discover") {
      discover = true;
      continue;
    }

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg.startsWith("--phase=")) {
      const rawPhase = arg.slice("--phase=".length);
      const parsed = Number.parseInt(rawPhase, 10);
      if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Invalid --phase value: ${rawPhase}`);
      phase = parsed;
      continue;
    }

    if (arg.startsWith("--table=")) {
      const tableName = arg.slice("--table=".length).trim();
      if (!allowedTables.has(tableName)) {
        throw new Error(`Table is not in the Mesh shared sync allowlist: ${tableName}`);
      }
      tables.add(tableName);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    phase,
    tables: tables.size > 0 ? tables : null,
    dryRun,
    discover,
    force,
  };
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

export function loadProvisionEnvDefaults(): void {
  loadEnvDefaults(join(repoRoot, "server", ".env"));
  loadEnvDefaults(join(repoRoot, "stack", "env", ".env"));

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

export async function connectClient(connectionString: string): Promise<pg.Client> {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    return client;
  } catch (err) {
    const fallback = localDockerHostFallback(connectionString);
    if (!fallback || !isNameResolutionError(err)) throw err;

    log({ msg: "shared_mesh_sync_connection_retry_localhost" });
    const fallbackClient = new Client({ connectionString: fallback });
    await fallbackClient.connect();
    return fallbackClient;
  }
}

export function resolveNeonConnectionString(): string {
  const explicitNeonUrl = process.env.NEON_DATABASE_ADMIN_URL;
  if (explicitNeonUrl) return explicitNeonUrl;

  const baseAdminUrl = process.env.DATABASE_ADMIN_URL;
  if (baseAdminUrl) return baseAdminUrl;

  const user = process.env.DB_ADMIN_USER ?? process.env.DB_USER;
  const password = process.env.DB_ADMIN_PASSWORD ?? process.env.DB_PASSWORD;
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "5432";
  const dbName = process.env.DB_NAME ?? "athyper_neon";
  if (user && password) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${dbName}?sslmode=disable`;
  }

  throw new Error(
    "Cannot determine Neon database credentials. Set NEON_DATABASE_ADMIN_URL, DATABASE_ADMIN_URL, or DB_ADMIN_USER/DB_ADMIN_PASSWORD.",
  );
}

export function resolveMeshConnectionString(): string {
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


