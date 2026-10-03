#!/usr/bin/env tsx
/** Before/after common-DDL qualification. Always creates disposable, network-isolated PostgreSQL. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const repository = resolve(root, "../..");
const arg = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const beforeRef = arg("before-ref");
if (!beforeRef) throw new Error("Provide --before-ref=<commit before the common-DDL consolidation>");
const beforeCommit = execFileSync("git", ["rev-parse", "--verify", `${beforeRef}^{commit}`], { cwd: repository, encoding: "utf8" }).trim();
const output = arg("output");
const image = "postgres:16.15-bookworm";
const paths = [
  "common/ops/03_tables.sql", "common/authz/03_tables.sql", "common/authz/13_management.sql",
  "common/control/03_tables.sql", "common/control/14_admin_integrations.sql",
  "common/document/03_foundation_tables.sql", "common/document/05_constraints.sql",
  "common/document/12_collaboration_integrity.sql",
  "planes/studio/document/09_views.sql", "planes/neon/document/09_views.sql", "planes/mesh/document/09_views.sql",
];
const staging = mkdtempSync(join(tmpdir(), "athyper-common-ddl-"));
const hash = (source: string) => createHash("sha256").update(source).digest("hex");
const docker = (args: string[], input?: string): string => {
  try {
    return execFileSync("docker", args, {
      encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr;
    throw new Error(`Isolated Docker command failed: ${stderr?.slice(-4000) ?? String(error)}`);
  }
};
const sql = (container: string, plane: string, input: string) => docker([
  "exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres", "-d", `athyper_${plane}`, "-v", "ON_ERROR_STOP=1",
], input);
// Sort by object identity, never OID. Preserve physical column order and normalize ACL ordering.
const applicationSchema = "n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'";
const acl = (expression: string) => `(SELECT COALESCE(jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee=0,pg_get_userbyid(a.grantee),pg_get_userbyid(a.grantor),a.privilege_type),'[]'::jsonb) FROM aclexplode(NULLIF(${expression},ARRAY[]::aclitem[])) a)`;
const catalog = {
  schemas: `SELECT n.nspname AS identity,pg_get_userbyid(n.nspowner) AS owner,${acl("COALESCE(n.nspacl,acldefault('n',n.nspowner))")} AS acl FROM pg_namespace n WHERE ${applicationSchema}`,
  relations: `SELECT n.nspname||'.'||c.relname AS identity,c.relkind,c.relpersistence,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relreplident,c.reloptions,c.relispartition,CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound,c.oid) END AS partition_bound,CASE WHEN c.relkind='p' THEN pg_get_partkeydef(c.oid) END AS partition_key,CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid) END AS view_definition,obj_description(c.oid,'pg_class') AS description,${acl("COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::\"char\" ELSE 'r'::\"char\" END,c.relowner))")} AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${applicationSchema} AND c.relkind IN ('r','p','v','m','S','f')`,
  columns: `SELECT n.nspname||'.'||c.relname||'.'||a.attnum AS identity,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attgenerated,a.attstorage,a.attcompression,pg_get_expr(d.adbin,d.adrelid) AS default_expression,CASE WHEN a.attcollation<>0 THEN (SELECT nn.nspname||'.'||cc.collname FROM pg_collation cc JOIN pg_namespace nn ON nn.oid=cc.collnamespace WHERE cc.oid=a.attcollation) END AS collation,col_description(c.oid,a.attnum) AS description,${acl("COALESCE(a.attacl,ARRAY[]::aclitem[])")} AS acl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE ${applicationSchema} AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped`,
  constraints: `SELECT n.nspname||'.'||COALESCE(c.relname,t.typname)||'.'||k.conname AS identity,k.contype,k.condeferrable,k.condeferred,k.convalidated,k.connoinherit,k.conkey,k.confkey,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace LEFT JOIN pg_class c ON c.oid=k.conrelid LEFT JOIN pg_type t ON t.oid=k.contypid WHERE ${applicationSchema}`,
  indexes: `SELECT n.nspname||'.'||c.relname AS identity,pg_get_indexdef(i.indexrelid) AS definition,i.indisvalid,i.indisready,i.indisreplident,i.indisclustered FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${applicationSchema}`,
  triggers: `SELECT n.nspname||'.'||c.relname||'.'||t.tgname AS identity,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${applicationSchema} AND NOT t.tgisinternal`,
  policies: `SELECT n.nspname||'.'||c.relname||'.'||p.polname AS identity,p.polcmd,p.polpermissive,ARRAY(SELECT CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END FROM unnest(p.polroles) role_oid ORDER BY 1) AS roles,pg_get_expr(p.polqual,p.polrelid) AS using_expression,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${applicationSchema}`,
  routines: `SELECT n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' AS identity,pg_get_userbyid(p.proowner) AS owner,pg_get_functiondef(p.oid) AS definition,${acl("COALESCE(p.proacl,acldefault('f',p.proowner))")} AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${applicationSchema} AND p.prokind IN ('f','p')`,
  types: `SELECT n.nspname||'.'||t.typname AS identity,t.typtype,pg_get_userbyid(t.typowner) AS owner,t.typnotnull,t.typdefault,CASE WHEN t.typbasetype<>0 THEN format_type(t.typbasetype,t.typtypmod) END AS base_type,ARRAY(SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid=t.oid ORDER BY e.enumsortorder) AS labels,${acl("COALESCE(t.typacl,acldefault('T',t.typowner))")} AS acl FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE ${applicationSchema} AND t.typtype IN ('e','d')`,
  sequences: `SELECT n.nspname||'.'||c.relname AS identity,format_type(s.seqtypid,NULL) AS type,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${applicationSchema}`,
  roles: "SELECT rolname AS identity,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_roles",
  memberships: "SELECT pg_get_userbyid(roleid)||'.'||pg_get_userbyid(member) AS identity,pg_get_userbyid(grantor) AS grantor,admin_option,inherit_option,set_option FROM pg_auth_members",
  defaultPrivileges: `SELECT pg_get_userbyid(d.defaclrole)||'.'||COALESCE(n.nspname,'*')||'.'||d.defaclobjtype::text AS identity,${acl("d.defaclacl")} AS acl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace`,
};
const containers: string[] = [];
const snapshots: Record<string, Record<string, unknown[]>> = {};
const roundingCounts: Record<string, unknown> = {};
const sourceHashes: Record<string, Record<string, string>> = {};
try {
  for (const variant of ["before", "after"]) {
    const sourceRoot = join(staging, variant);
    cpSync(join(root, "ddl"), sourceRoot, { recursive: true });
    sourceHashes[variant] = {};
    for (const path of paths) {
      if (variant === "before") writeFileSync(join(sourceRoot, path), execFileSync("git", ["show", `${beforeCommit}:server/db/ddl/${path}`], { cwd: repository }));
      sourceHashes[variant]![path] = hash(readFileSync(join(sourceRoot, path), "utf8"));
    }
    const container = `athyper-common-ddl-${variant}-${randomUUID().slice(0, 8)}`;
    docker(["run", "-d", "--name", container, "--network", "none", "--tmpfs", "/var/lib/postgresql/data", "--label", "athyper.purpose=common-ddl-equivalence", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", image, "-c", "max_locks_per_transaction=512"]);
    containers.push(container);
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); ready = true; break; }
      catch { await new Promise(done => setTimeout(done, 250)); }
    }
    assert.ok(ready, "Isolated PostgreSQL must become ready");
    docker(["exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], "CREATE ROLE athyper_control_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE athyper_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE athyper_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;");
    docker(["cp", sourceRoot, `${container}:/tmp/ddl`]);
    for (const plane of ["studio", "neon", "mesh"]) {
      console.log(`${variant}/${plane}: installing complete foundation`);
      docker(["exec", container, "createdb", "-U", "postgres", `athyper_${plane}`]);
      const entries = readFileSync(join(sourceRoot, `planes/${plane}/_manifest.txt`), "utf8").split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
      sql(container, plane, `BEGIN; SELECT set_config('app.database_plane','${plane}',false); SELECT set_config('app.current_principal_id','00000000-0000-0000-0000-000000000000',false);\n${entries.map(path => `\\i /tmp/ddl/${path}`).join("\n")}\nCOMMIT;`);
      const raw = sql(container, plane, `BEGIN READ ONLY; SET LOCAL search_path=pg_catalog;\n${Object.values(catalog).map(statement => `SELECT COALESCE(jsonb_agg(to_jsonb(result) ORDER BY result.identity),'[]'::jsonb) FROM (${statement}) result;`).join("\n")}\nCOMMIT;`);
      const rows = raw.trim().split("\n").map(line => JSON.parse(line) as unknown[]);
      assert.equal(rows.length, Object.keys(catalog).length);
      const snapshot = Object.fromEntries(Object.keys(catalog).map((key, index) => [key, rows[index]!])) as Record<string, unknown[]>;
      snapshots[`${variant}/${plane}`] = snapshot;
      roundingCounts[`${variant}/${plane}`] = JSON.parse(sql(container, plane, "SELECT jsonb_build_object('rules',(SELECT count(*) FROM control.rounding_rule),'contexts',(SELECT count(*) FROM control.rounding_context));").trim());
      if (output) {
        mkdirSync(output, { recursive: true, mode: 0o700 });
        writeFileSync(join(output, `${variant}-${plane}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
      }
      console.log(`${variant}/${plane}: catalog captured`);
    }
  }
  const results = ["studio", "neon", "mesh"].map(plane => {
    const before = snapshots[`before/${plane}`]!;
    const after = snapshots[`after/${plane}`]!;
    const differences = Object.keys(catalog).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    return { plane, equivalent: differences.length === 0, differences,
      counts: Object.fromEntries(Object.entries(after).map(([key, rows]) => [key, rows.length])),
      beforeHash: hash(JSON.stringify(before)), afterHash: hash(JSON.stringify(after)) };
  });
  const report = { schemaVersion: 1, observedAt: new Date().toISOString(), image, beforeCommit,
    scope: "Only the eight cleanup files and three corrected view files use baseline bytes; every other manifest input is the same current source on both sides.",
    sourceHashes, roundingCounts, results };
  if (output) writeFileSync(join(output, "summary.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  for (const result of results) console.log(`${result.plane}: equivalent=${result.equivalent}; differences=${result.differences.join(",") || "none"}`);
  assert.ok(results.every(result => result.equivalent), "Before/after PostgreSQL catalogs differ; inspect saved snapshots");
} finally {
  for (const container of containers) docker(["rm", "-f", container]);
  rmSync(staging, { recursive: true, force: true });
}
