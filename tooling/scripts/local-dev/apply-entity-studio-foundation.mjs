/** Apply only reviewed Entity foundation upgrades to the owned DEV instance,
 * using the existing forward runner and its checksum ledger. No grants/seeds. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
if (process.argv.slice(2).join(" ") !== "--confirm dev") throw Error("Use --confirm dev");
const container = "athyper-dev-db-1";
const run = (args, options = {}) => execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options });
const deployed = JSON.parse(run(["inspect", container]))[0];
if (!deployed.State.Running || deployed.Config.Labels["com.docker.compose.project"] !== "athyper-dev") throw Error("Owned running DEV database required");
const env = Object.fromEntries(deployed.Config.Env.map(value => [value.slice(0,value.indexOf("=")),value.slice(value.indexOf("=")+1)]));
if (!env.POSTGRES_PASSWORD_FILE) throw Error("Managed database password-file configuration required");
const root = new URL("../../../server/db/", import.meta.url);
const inventory = JSON.parse(readFileSync(new URL("migrations/inventory.json",root),"utf8"));
const names = ["20261006_entity_scoped_order_constraints.sql", "20261006_entity_owned_label_commands.sql", "20261006_entity_reference_members.sql", "20261006_entity_reference_predicate_validation.sql", "20261006_entity_reference_predicate_roots.sql", "20261006_entity_reference_anchor_guards.sql", "20261006_entity_core_layout_columns.sql"];
const receipt = { environment: "dev", database: "athyper_studio", at: new Date().toISOString(), migrations: [] };
const backup = join(homedir(),".athyper/instances/dev/workspace",`entity-foundation-${Date.now()}`);
mkdirSync(backup,{recursive:true,mode:0o700});
const fd = openSync(join(backup,"studio.dump"),"wx",0o600);
try { run(["exec",container,"pg_dump","-U","postgres","-Fc","athyper_studio"],{stdio:["ignore",fd,"pipe"]}); } finally { closeSync(fd); }
const staged = mkdtempSync(join(tmpdir(),"entity-foundation-upgrades-"));
const remote = `/tmp/${staged.split("/").at(-1)}`;
try {
  mkdirSync(join(staged,"manifests"));
  for (const name of names) {
    const bytes=readFileSync(new URL(`migrations/${name}`,root));
    const hash=createHash("sha256").update(bytes).digest("hex");
    const entry=inventory.entries.find(entry=>entry.path===`migrations/${name}`);
    if (entry?.sha256!==hash || entry.disposition!=="forward-upgrade" || entry.planes.join()!=="studio") throw Error("Unreviewed upgrade inventory");
    writeFileSync(join(staged,name),bytes);
    receipt.migrations.push({name,sha256:hash});
  }
  writeFileSync(join(staged,"manifests/studio.txt"),names.join("\n")+"\n");
  for(const plane of ["neon","mesh"]) writeFileSync(join(staged,`manifests/${plane}.txt`),"");
  copyFileSync(new URL("migrations/manifests/runner-transactions.sha256",root),join(staged,"manifests/runner-transactions.sha256"));
  copyFileSync(new URL("runtime/run-forward-migrations.sh",root),join(staged,"runner.sh"));
  run(["cp",staged,`${container}:${remote}`]);
  process.stdout.write(run(["exec","-e",`ATHYPER_MIGRATION_ROOT=${remote}`,"-e",`ATHYPER_POSTGRES_PASSWORD_FILE=${env.POSTGRES_PASSWORD_FILE}`,"-e","PGHOST=/var/run/postgresql","-e","PGUSER=postgres",container,"sh",`${remote}/runner.sh`]));
  const applied=run(["exec",container,"psql","-X","-qAt","-U","postgres","-d","athyper_studio","-v","ON_ERROR_STOP=1","-c",`SELECT json_agg(json_build_object('name',migration_name,'sha256',sha256,'status',status)) FROM public.athyper_schema_migration_v1 WHERE migration_name IN (${names.map(name=>`'${name}'`).join(",")})`]);
  receipt.applied=JSON.parse(applied);
  if(receipt.migrations.some(m=>!receipt.applied.some(a=>a.name===m.name && a.sha256===m.sha256 && a.status==='applied'))) throw Error("Upgrade receipt mismatch");
  writeFileSync(join(backup,"receipt.json"),JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  console.log(`DEV Entity upgrade verified. Backup and receipt: ${backup}`);
} finally { run(["exec",container,"rm","-rf",remote]); rmSync(staged,{recursive:true,force:true}); }
