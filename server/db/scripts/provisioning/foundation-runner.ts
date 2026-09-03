#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const PLANES = ["studio", "neon", "mesh"] as const;
type Plane = typeof PLANES[number];
type Entry = Readonly<{ ordinal: number; path: string; fullPath: string; sql: string; sha256: string }>;

let databaseRoot = resolve(import.meta.dirname, "../..");
let ddlRoot = resolve(databaseRoot, "ddl");
const definitions = {
  studio: { database: "athyper_studio", environments: ["ATHYPER_PLATFORM_DATABASE_ADMIN_URL"] },
  neon: { database: "athyper_neon", environments: ["ATHYPER_NEON_DATABASE_ADMIN_URL", "DATABASE_ADMIN_URL"] },
  mesh: { database: "athyper_mesh", environments: ["ATHYPER_MESH_DATABASE_ADMIN_URL", "MESH_DATABASE_ADMIN_URL"] },
} as const;

export async function planFoundation(plane: Plane) {
  const manifestPath = resolve(ddlRoot, "planes", plane, "_manifest.txt");
  const manifest = await readFile(manifestPath, "utf8");
  const entries = await loadEntries(manifest);
  return Object.freeze({
    plane,
    database: definitions[plane].database,
    manifest: relative(databaseRoot, manifestPath),
    manifestSha256: sha256(manifest),
    entries: entries.map(({ ordinal, path, sha256: checksum }) => ({ ordinal, path, sha256: checksum })),
  });
}

export async function applyFoundation(options: {
  plane: Plane;
  databaseUrl?: string;
  dockerContainer?: string;
  databaseUser?: string;
  resumeFrom?: string;
  recordReceipts?: boolean;
}) {
  const plan = await planFoundation(options.plane);
  const entries = await loadEntries(await readFile(resolve(databaseRoot, plan.manifest), "utf8"));
  const start = options.resumeFrom ? entries.findIndex((entry) => entry.path === options.resumeFrom) : 0;
  if (start < 0) throw new Error(`resume path is absent from ${plan.manifest}: ${options.resumeFrom}`);
  if (options.dockerContainer) {
    await createDatabase(options.plane, options.dockerContainer, options.databaseUser ?? "postgres");
  }
  const target = options.dockerContainer
    ? dockerTarget(options.dockerContainer, options.databaseUser ?? "postgres", plan.database)
    : urlTarget(requiredUrl(options.plane, options.databaseUrl), plan.database);
  await target.assertIdentity();
  if (!options.resumeFrom) await target.assertFresh();
  for (const entry of entries.slice(start)) {
    const pendingReceipts = entries.slice(0, entry.ordinal);
    await target.execute(entry.sql, options.recordReceipts === false ? "" : receiptSql(options.plane, plan.manifestSha256, pendingReceipts), entry.path);
  }
  const receipts = options.recordReceipts === false ? [] : await target.receipts();
  if (options.recordReceipts !== false) reconcileReceipts(entries, receipts, options.plane, plan.manifestSha256);
  await target.close();
  return Object.freeze({ ...plan, mode: "applied", receiptCount: receipts.length, appliedAt: new Date().toISOString() });
}

async function loadEntries(manifest: string): Promise<Entry[]> {
  const paths = manifest.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (new Set(paths).size !== paths.length) throw new Error("foundation manifest contains duplicate entries");
  return Promise.all(paths.map(async (path, index) => {
    if (path.startsWith("/") || path.includes("..")) throw new Error(`unsafe manifest path: ${path}`);
    const fullPath = await confined(resolve(ddlRoot, path));
    const sql = await expandSql(fullPath, new Set());
    return Object.freeze({ ordinal: index + 1, path, fullPath, sql, sha256: sha256(sql) });
  }));
}

function receiptSql(plane: Plane, manifestSha256: string, entries: readonly Entry[]): string {
  if (!entries.some((entry) => entry.path === "common/_database/02_schema_provisions.sql")) return "";
  const values = entries.map((entry) => `('${plane}','${manifestSha256}',${entry.ordinal},${literal(entry.path)},'${entry.sha256}')`).join(",\n");
  return `
INSERT INTO public.schema_provisions(plane,manifest_checksum,manifest_ordinal,file_name,checksum)
VALUES ${values}
ON CONFLICT(file_name) DO NOTHING;
DO $receipt$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES ${values}) expected(plane,manifest_checksum,manifest_ordinal,file_name,checksum)
    LEFT JOIN public.schema_provisions actual USING(file_name)
    WHERE actual.id IS NULL OR actual.plane<>expected.plane OR actual.manifest_checksum<>expected.manifest_checksum
       OR actual.manifest_ordinal<>expected.manifest_ordinal OR actual.checksum<>expected.checksum
  ) THEN RAISE EXCEPTION 'FOUNDATION_RECEIPT_DRIFT'; END IF;
END $receipt$;`;
}

type Receipt = { plane: string; manifest_checksum: string; manifest_ordinal: number; file_name: string; checksum: string };
function reconcileReceipts(entries: readonly Entry[], receipts: readonly Receipt[], plane: Plane, manifestSha256: string) {
  if (receipts.length !== entries.length) throw new Error(`foundation receipt count mismatch: expected ${entries.length}, received ${receipts.length}`);
  for (const entry of entries) {
    const receipt = receipts[entry.ordinal - 1];
    if (!receipt || receipt.plane !== plane || receipt.manifest_checksum !== manifestSha256
      || Number(receipt.manifest_ordinal) !== entry.ordinal || receipt.file_name !== entry.path || receipt.checksum !== entry.sha256) {
      throw new Error(`foundation receipt mismatch at ordinal ${entry.ordinal}: ${entry.path}`);
    }
  }
}

function urlTarget(databaseUrl: string, database: string) {
  const client = new Client({ connectionString: databaseUrl, application_name: "athyper-foundation-runner" });
  return {
    async assertIdentity() { await client.connect(); const row = (await client.query<{ database: string }>("SELECT current_database() database")).rows[0]; if (row?.database !== database) throw new Error(`expected ${database}, received ${row?.database}`); },
    async assertFresh() { const count = Number((await client.query<{ count: string }>(freshSql)).rows[0]?.count ?? -1); if (count !== 0) throw new Error(`${database} is not fresh; found ${count} non-system schema/relation blockers`); },
    async execute(sql: string, receipt: string, path: string) { try { await client.query("BEGIN"); await client.query("SELECT set_config('app.database_plane',$1,false),set_config('app.current_principal_id','00000000-0000-0000-0000-000000000000',false)", [database.slice(8)]); await client.query(sql); if (receipt) await client.query(receipt); await client.query("COMMIT"); } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw new Error(`DDL failed at ${path}`, { cause: error }); } },
    async receipts() { return (await client.query<Receipt>("SELECT plane,manifest_checksum,manifest_ordinal,file_name,checksum FROM public.schema_provisions ORDER BY manifest_ordinal")).rows; },
    async close() { await client.end(); },
  };
}

function dockerTarget(container: string, user: string, database: string) {
  if (!/^[A-Za-z0-9_.-]+$/u.test(container) || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(user)) throw new Error("unsafe Docker container or database user");
  return {
    async assertIdentity() { const inspection = JSON.parse(await capture("docker", ["inspect", container])) as Array<{ State?: { Running?: boolean } }>; if (!inspection[0]?.State?.Running) throw new Error(`PostgreSQL container is not running: ${container}`); const actual = (await psqlCapture(container, user, database, "SELECT current_database()" )).trim(); if (actual !== database) throw new Error(`expected ${database}, received ${actual}`); },
    async assertFresh() { const count = Number((await psqlCapture(container, user, database, freshSql)).trim()); if (count !== 0) throw new Error(`${database} is not fresh; found ${count} non-system schema/relation blockers`); },
    async execute(sql: string, receipt: string, path: string) { const plane = database.slice(8); const input = `SELECT set_config('app.database_plane','${plane}',false);\nSELECT set_config('app.current_principal_id','00000000-0000-0000-0000-000000000000',false);\n${sql}\n${receipt}`; try { await pipe("docker", ["exec", "-i", container, "psql", "-U", user, "-d", database, "--single-transaction", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-f", "-"], input); } catch (error) { throw new Error(`DDL failed at ${path}`, { cause: error }); } },
    async receipts() { return JSON.parse(await psqlCapture(container, user, database, "SELECT COALESCE(json_agg(row_to_json(r)),'[]'::json)::text FROM (SELECT plane,manifest_checksum,manifest_ordinal,file_name,checksum FROM public.schema_provisions ORDER BY manifest_ordinal) r")) as Receipt[]; },
    async close() {},
  };
}

const freshSql = `SELECT count(*)::text count FROM (
 SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname !~ '^pg_'
 UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p','v','m','S','f') AND n.nspname NOT IN ('information_schema') AND n.nspname !~ '^pg_'
) blockers`;

async function expandSql(path: string, stack: Set<string>): Promise<string> {
  const actual = await confined(path);
  if (stack.has(actual)) throw new Error(`recursive SQL include: ${relative(ddlRoot, actual)}`);
  stack.add(actual);
  try {
    const output: string[] = [];
    for (const line of (await readFile(actual, "utf8")).replace(/^\uFEFF/u, "").split(/\r?\n/u)) {
      const match = line.match(/^\s*\\ir\s+(.+?)\s*$/u);
      if (!match) { output.push(line); continue; }
      const include = match[1]!.trim().replace(/^["']|["']$/gu, "");
      output.push(`-- begin included SQL: ${include}`, await expandSql(resolve(dirname(actual), include), stack), `-- end included SQL: ${include}`);
    }
    return output.join("\n");
  } finally { stack.delete(actual); }
}

async function confined(path: string) { const actual = await realpath(path); const prefix = `${await realpath(ddlRoot)}${sep}`; if (!actual.startsWith(prefix)) throw new Error(`DDL path escapes root: ${path}`); return actual; }
function sha256(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function literal(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function requiredUrl(plane: Plane, explicit?: string) { const value = explicit ?? definitions[plane].environments.map((name) => process.env[name]?.trim()).find(Boolean); if (!value) throw new Error(`no admin database URL configured for ${plane}`); return value; }
async function psqlCapture(container: string, user: string, database: string, sql: string) { return capture("docker", ["exec", container, "psql", "-U", user, "-d", database, "-At", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-c", sql]); }
async function capture(command: string, args: readonly string[]) { return new Promise<string>((ok, fail) => { const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], shell: false }); let stdout = "", stderr = ""; child.stdout.setEncoding("utf8").on("data", (part) => { stdout += part; }); child.stderr.setEncoding("utf8").on("data", (part) => { stderr += part; }); child.once("error", fail); child.once("exit", (code) => code === 0 ? ok(stdout) : fail(new Error(`${command} failed (${code ?? "unknown"}): ${stderr.trim()}`))); }); }
async function pipe(command: string, args: readonly string[], input: string) { return new Promise<void>((ok, fail) => { const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"], shell: false }); let stderr = ""; child.stderr.setEncoding("utf8").on("data", (part) => { stderr += part; }); child.once("error", fail); child.once("exit", (code) => code === 0 ? ok() : fail(new Error(`${command} failed (${code ?? "unknown"}): ${stderr.trim()}`))); child.stdin.end(input); }); }
function option(args: readonly string[], name: string) { const equal = args.find((value) => value.startsWith(`${name}=`)); if (equal) return equal.slice(name.length + 1); const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }

async function createDatabase(plane: Plane, container: string, user: string) {
  const database = definitions[plane].database;
  const exists = (await psqlCapture(container, user, "postgres", `SELECT 1 FROM pg_database WHERE datname=${literal(database)}`)).trim() === "1";
  if (!exists) await capture("docker", ["exec", container, "createdb", "-U", user, "-O", user, "--encoding", "UTF8", "--template", "template0", database]);
  return { plane, database, created: !exists };
}

async function main() {
  const args = process.argv.slice(2), all = args.includes("--all"), dryRun = args.includes("--dry-run") || args.includes("--plan");
  const alternateDdlRoot = option(args, "--ddl-root");
  if (alternateDdlRoot) { ddlRoot = resolve(alternateDdlRoot); databaseRoot = dirname(ddlRoot); }
  const requested = option(args, "--plane");
  if (!all && !PLANES.includes(requested as Plane)) throw new Error("--plane=studio|neon|mesh or --all is required");
  if (all && !dryRun) throw new Error("--all is limited to --dry-run; apply one plane explicitly");
  const planes = all ? PLANES : [requested as Plane];
  const docker = args.includes("--docker") || Boolean(option(args, "--container"));
  const container = option(args, "--container") ?? process.env.DOCKER_CONTAINER_DB ?? "athyper-dev-db-1";
  const user = option(args, "--database-user") ?? process.env.DB_ADMIN_USER ?? "postgres";
  if (args.includes("--create-database-only")) {
    if (!docker || planes.length !== 1) throw new Error("--create-database-only requires one plane and --docker");
    process.stdout.write(`${JSON.stringify(await createDatabase(planes[0]!, container, user), null, 2)}\n`); return;
  }
  const results = [];
  for (const plane of planes) results.push(dryRun ? await planFoundation(plane) : await applyFoundation({ plane, databaseUrl: option(args, "--database-url"), dockerContainer: docker ? container : undefined, databaseUser: user, resumeFrom: option(args, "--resume-from"), recordReceipts: !args.includes("--no-receipts") }));
  process.stdout.write(`${JSON.stringify({ mode: dryRun ? "plan" : "applied", results }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
