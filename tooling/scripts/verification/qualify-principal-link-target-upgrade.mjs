/** Bounded populated pre-upgrade fixture through the production forward runner.
 * This is not full-foundation, domain-authorization or deployment qualification. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { artifactDirectory } from "../artifact-paths.mjs";

assert.equal(
  process.argv.length,
  2,
  "This rehearsal accepts no deployed database target",
);
const root = resolve(import.meta.dirname, "../../..");
const name = "20261002_principal_person_link_target.sql";
const migration = readFileSync(
  join(root, "server/db/migrations", name),
  "utf8",
);
const canonical = readFileSync(
  join(
    root,
    "server/db/ddl/planes/neon/master/37_principal_person_link_target.sql",
  ),
  "utf8",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenant = id(1),
  actor = id(2),
  target = id(3),
  person = id(4),
  employment = id(5),
  company = id(6);
const fixture = `
CREATE SCHEMA shared; CREATE SCHEMA master;
CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid$$;
CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.current_principal_id',true),'')::uuid$$;
CREATE TABLE master.principal(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,principal_type text NOT NULL,status text NOT NULL);
CREATE TABLE master.employment(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,person_id uuid NOT NULL,company_code_id uuid NOT NULL,status text NOT NULL,employment_status text NOT NULL);
INSERT INTO master.principal VALUES('${target}','${tenant}','user','active');
INSERT INTO master.employment VALUES('${employment}','${tenant}','${person}','${company}','active','active');
ALTER TABLE master.principal ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal FORCE ROW LEVEL SECURITY;
CREATE POLICY hidden_principals ON master.principal TO athyperapp USING(false);
GRANT USAGE ON SCHEMA master,shared TO athyperapp;
GRANT SELECT ON master.principal TO athyperapp;
`;
const scratch = mkdtempSync(join(tmpdir(), "athyper-link-target-upgrade-"));
const container = `athyper-link-target-upgrade-${randomUUID()}`;
const output = artifactDirectory("principal-link-target-upgrade");
const report = {
  schema: "principal-link-target-upgrade-qualification/1",
  startedAt: new Date().toISOString(),
  fixture: "bounded-populated-principal-link-target-pre-upgrade/1",
  fixtureHash: hash(fixture),
  migration: name,
  migrationHash: hash(migration),
  passed: false,
  checks: [],
  limitations: [
    "Minimal dependency tables, not a complete supported foundation baseline",
    "Trusted authorization gate is supplied by the fixture; domain authorization is qualified separately",
    "No deployed database is modified",
  ],
};
let created = false;
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const sql = (database, input) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-Atq",
    ],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const runner = () =>
  spawnSync(
    "docker",
    [
      "exec",
      "-e",
      "PGHOST=127.0.0.1",
      "-e",
      "ATHYPER_POSTGRES_PASSWORD_FILE=/app/migrations/password",
      container,
      "sh",
      "/runner.sh",
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
mkdirSync(resolve(output, ".."), { recursive: true });
mkdirSync(output, { mode: 0o700 });
try {
  const sources = [
    "tooling/scripts/verification/qualify-principal-link-target-upgrade.mjs",
    "server/db/runtime/run-forward-migrations.sh",
    `server/db/migrations/${name}`,
    "server/db/ddl/planes/neon/master/37_principal_person_link_target.sql",
    "server/db/migrations/inventory.json",
    "server/db/migrations/manifests/neon.txt",
  ];
  mkdirSync(join(output, "source"));
  report.source = sources.map((path, index) => {
    const bytes = readFileSync(join(root, path));
    const captured = `source/${index}-${path.split("/").at(-1)}`;
    writeFileSync(join(output, captured), bytes, { flag: "wx" });
    return { path, sha256: hash(bytes), captured };
  });
  writeFileSync(join(output, "baseline.sql"), fixture);
  assert.ok(
    migration.includes(canonical),
    "Upgrade must preserve canonical target reader",
  );
  mkdirSync(join(scratch, "manifests"));
  writeFileSync(join(scratch, "password"), "disposable-test-only\n");
  writeFileSync(join(scratch, name), migration);
  writeFileSync(join(scratch, "manifests/runner-transactions.sha256"), "");
  for (const plane of ["studio", "neon", "mesh"])
    writeFileSync(
      join(scratch, `manifests/${plane}.txt`),
      plane === "neon" ? name + "\n" : "",
    );
  docker(
    "run",
    "-d",
    "--name",
    container,
    "--network",
    "none",
    "--tmpfs",
    "/var/lib/postgresql/data",
    "--label",
    "athyper.purpose=principal-link-target-upgrade",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-v",
    `${scratch}:/app/migrations:ro`,
    "-v",
    `${join(root, "server/db/runtime/run-forward-migrations.sh")}:/runner.sh:ro`,
    "postgres:16.15-bookworm",
  );
  created = true;
  report.imageId = docker(
    "inspect",
    "--format",
    "{{.Image}}",
    container,
  ).trim();
  for (let attempt = 0; ; attempt++) {
    try {
      sql("postgres", "SELECT 1");
      break;
    } catch (error) {
      if (attempt >= 60) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  sql("postgres", "CREATE ROLE athyperapp;");
  for (const plane of ["studio", "neon", "mesh"])
    sql("postgres", `CREATE DATABASE athyper_${plane}`);
  sql("athyper_neon", fixture);
  const preserved = sql(
    "athyper_neon",
    "SELECT row_to_json(p) FROM master.principal p; SELECT row_to_json(e) FROM master.employment e;",
  );
  let result = runner();
  assert.equal(result.status, 0, result.stderr);
  const ledger = sql(
    "athyper_neon",
    "SELECT row_to_json(m) FROM public.athyper_schema_migration_v1 m;",
  );
  assert.equal(JSON.parse(ledger).sha256, hash(migration));
  assert.equal(JSON.parse(ledger).status, "applied");
  assert.equal(
    sql(
      "athyper_neon",
      "SELECT row_to_json(p) FROM master.principal p; SELECT row_to_json(e) FROM master.employment e;",
    ),
    preserved,
  );
  report.checks.push(
    "Forward runner applies exact migration and preserves populated dependencies",
  );
  result = runner();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    sql(
      "athyper_neon",
      "SELECT row_to_json(m) FROM public.athyper_schema_migration_v1 m;",
    ),
    ledger,
  );
  report.checks.push("Exact retry preserves original applied receipt");
  const gate = {
    tenantId: tenant,
    actorId: actor,
    principalId: target,
    personId: person,
    employmentId: employment,
    companyCodeId: company,
    sourceRevision: `source-sha256:${"a".repeat(64)}`,
    permissionCode: "neon.workforce.profile.write",
    handlerKey: "identity.principal.link_person.v1",
  };
  const context = `SET app.current_tenant_id='${tenant}'; SET app.current_principal_id='${actor}'; SET ROLE athyperapp;`;
  const call = `SELECT master.entity_person_link_target_v1('${tenant}','${target}');`;
  assert.equal(
    sql(
      "athyper_neon",
      context +
        `SET app.entity_person_link_authority='${JSON.stringify(gate)}';` +
        call,
    ),
    target,
  );
  assert.equal(
    sql("athyper_neon", context + "SELECT count(*) FROM master.principal;"),
    "0",
  );
  report.checks.push(
    "Application role reads pinned target identity while generic Principal RLS stays closed",
  );
  for (const [label, changed, session] of [
    ["missing gate", {}, context],
    ["wrong actor", { ...gate, actorId: id(20) }, context],
    ["wrong tenant", { ...gate, tenantId: id(20) }, context],
    ["wrong target", { ...gate, principalId: id(20) }, context],
    ["wrong company", { ...gate, companyCodeId: id(20) }, context],
    ["wrong person", { ...gate, personId: id(20) }, context],
    ["wrong Employment", { ...gate, employmentId: id(20) }, context],
    ["wrong handler", { ...gate, handlerKey: "unregistered" }, context],
    [
      "wrong permission",
      { ...gate, permissionCode: "neon.identity.write" },
      context,
    ],
    ["invalid revision", { ...gate, sourceRevision: "stale" }, context],
    [
      "missing actor",
      gate,
      `SET app.current_tenant_id='${tenant}'; SET ROLE athyperapp;`,
    ],
  ]) {
    assert.throws(
      () =>
        sql(
          "athyper_neon",
          session +
            `SET app.entity_person_link_authority='${JSON.stringify(changed)}';` +
            call,
        ),
      /ENTITY_LINK_(AUTHORITY_REQUIRED|SCOPE_INVALID)/,
      label,
    );
    report.checks.push(`${label} denied`);
  }
  sql(
    "athyper_neon",
    "UPDATE master.employment SET employment_status='inactive';",
  );
  assert.throws(
    () =>
      sql(
        "athyper_neon",
        context +
          `SET app.entity_person_link_authority='${JSON.stringify(gate)}';` +
          call,
      ),
    /ENTITY_LINK_SCOPE_INVALID/,
  );
  report.checks.push("Inactive Employment denied");
  for (const plane of ["studio", "mesh"]) {
    assert.equal(
      sql(
        `athyper_${plane}`,
        "SELECT count(*) FROM public.athyper_schema_migration_v1;",
      ),
      "0",
    );
    assert.throws(
      () => sql(`athyper_${plane}`, migration),
      /NEON_DATABASE_REQUIRED/,
    );
  }
  report.checks.push("Other planes remain unchanged and reject Neon-only SQL");
  writeFileSync(join(scratch, name), migration + "\n-- checksum drift probe\n");
  result = runner();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum differs from the migration ledger/);
  assert.equal(
    sql(
      "athyper_neon",
      "SELECT row_to_json(m) FROM public.athyper_schema_migration_v1 m;",
    ),
    ledger,
  );
  report.checks.push(
    "Changed migration bytes rejected without rewriting applied receipt",
  );
  report.passed = true;
} catch (error) {
  report.failure = { message: error.message };
  process.exitCode = 1;
} finally {
  if (created) docker("rm", "-f", container);
  rmSync(scratch, { recursive: true, force: true });
  report.completedAt = new Date().toISOString();
  mkdirSync(output, { recursive: true });
  writeFileSync(
    join(output, "qualification.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: report.passed,
      checks: report.checks.length,
      output,
      failure: report.failure,
    }),
  );
}
