/** DEV-only scoped deployment. Never prints credentials or touches QA. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

if (process.argv.slice(2).join(" ") !== "--confirm dev") throw Error("Use --confirm dev");
const container = "athyper-dev-db-1";
const docker = (args, options = {}) => execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options });
const identity = JSON.parse(docker(["inspect", container]))[0];
if (identity.Config.Labels["com.docker.compose.project"] !== "athyper-dev" || !identity.State.Running) throw Error("Running owned DEV database required");
const root = join(homedir(), ".athyper/instances/dev");
const directory = join(root, "workspace", `recovery-deployment-${Date.now()}`);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const sql = source => docker(["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "athyper_studio", "-v", "ON_ERROR_STOP=1", "-At"], { input: source });
const name = "20260930_publication_recovery_discovery.sql";
const source = readFileSync(new URL(`../../../server/db/migrations/${name}`, import.meta.url), "utf8");
const hash = createHash("sha256").update(source).digest("hex");
const previous = sql(`SELECT sha256 FROM public.athyper_schema_migration_v1 WHERE migration_name='${name}' AND status='applied';`).trim();
if (previous && previous !== hash) throw Error("Migration checksum conflict");
// Back up Studio and cluster role metadata before changing discovery authority.
for (const [file, args] of [["studio.dump", ["pg_dump", "-U", "postgres", "-Fc", "athyper_studio"]], ["roles.sql", ["pg_dumpall", "-U", "postgres", "--roles-only"]]]) {
  const fd = openSync(join(directory, file), "wx", 0o600);
  try { docker(["exec", container, ...args], { stdio: ["ignore", fd, "pipe"] }); } finally { closeSync(fd); }
}
if (!previous) {
  const body = source.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");
  sql(`BEGIN; SET LOCAL lock_timeout='10s'; ${body}\nROLLBACK;`);
  sql(`BEGIN; SET LOCAL lock_timeout='10s'; ${body}
    INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at)
    VALUES('${name}','${hash}','applied','dev-publication-recovery',now(),now()); COMMIT;`);
}
const secrets = join(root, "secrets");
mkdirSync(secrets, { recursive: true, mode: 0o700 });
const credentialPath = join(secrets, "publication-recovery.json");
const role = "athyper_dev_publication_recovery";
let databaseUrl;
if (existsSync(credentialPath)) {
  databaseUrl = JSON.parse(readFileSync(credentialPath, "utf8")).databaseUrl;
  const url = new URL(databaseUrl);
  if (url.hostname !== "db" || url.username !== role || url.pathname !== "/athyper_studio") throw Error("Unexpected recovery credential coordinate");
} else {
  if (sql(`SELECT 1 FROM pg_roles WHERE rolname='${role}';`).trim()) throw Error("Recovery login exists without managed credential; refusing rotation");
  const password = randomBytes(32).toString("hex");
  databaseUrl = `postgresql://${role}:${password}@db:5432/athyper_studio`;
  // Keep the generated credential recoverable if subsequent SQL fails.
  writeFileSync(credentialPath, JSON.stringify({ databaseUrl }) + "\n", { mode: 0o600, flag: "wx" });
}
const password = decodeURIComponent(new URL(databaseUrl).password);
if (!/^[a-f0-9]{64}$/.test(password)) throw Error("Unexpected managed password format");
sql(`BEGIN;
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN
 CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
 END IF; END $$;
 GRANT CONNECT ON DATABASE athyper_studio TO ${role};
 GRANT athyper_publication_recovery TO ${role};
 COMMIT;`);
const checks = sql(`SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole
 AND NOT pg_has_role('${role}','athyper_publication_recovery_owner','member')
 AND NOT pg_has_role('${role}','athyper_publication_service','member')
 AND NOT has_table_privilege('${role}','publication.release','SELECT')
 AND has_function_privilege('${role}','publication.fn_recoverable_deployment_coordinates(timestamptz,uuid,integer)','EXECUTE')
 FROM pg_roles WHERE rolname='${role}';`).trim();
if (checks !== "t") throw Error("Recovery privilege check failed");
const result = sql(`SET ROLE ${role}; SELECT count(*) FROM publication.fn_recoverable_deployment_coordinates(NULL,NULL,200); RESET ROLE;`);
writeFileSync(join(directory, "receipt.json"), JSON.stringify({ environment: "dev", migration: name, sha256: hash, privilegeChecks: true, discoveryCheck: result, at: new Date().toISOString() }, null, 2), { mode: 0o600 });
console.log(`DEV recovery migration and restricted login ready. Private backup/receipt: ${directory}`);
