// Isolated PostgreSQL regression; never connects to an application database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

const name = `governance-review-${randomUUID()}`;
const docker = (args, input) => {
  const result = spawnSync("docker", args, { input, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
};
const sql = input => docker(["exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], input);
const ddl = readFileSync(new URL("../../../ddl/common/governance/03_tables.sql", import.meta.url), "utf8");
const table = ddl.match(/CREATE TABLE governance\.cycle_deviation \([\s\S]*?\n\);/)[0];
const insert = key => `INSERT INTO governance.cycle_deviation(tenant_id,cycle_run_id,deviation_type,description,created_by,carry_idempotency_key) VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','exception','Evidence','33333333-3333-4333-8333-333333333333',${key});`;
const verify = `
${insert("NULL")}
${insert("NULL")}
${insert("'carry-key'")}
DO $$ BEGIN
  BEGIN
    ${insert("'carry-key'")}
    RAISE EXCEPTION 'duplicate non-null carry key was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM governance.cycle_deviation) <> 3 THEN RAISE EXCEPTION 'incorrect row count'; END IF;
END $$;`;
try {
  docker(["run", "--detach", "--rm", "--name", name, "--network", "none", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16.13-bookworm"]);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], { stdio: "ignore" }).status === 0) { ready = true; break; }
    await setTimeout(200);
  }
  assert.ok(ready, "Disposable PostgreSQL did not become ready");
  sql(`CREATE SCHEMA governance; CREATE SCHEMA control; CREATE SCHEMA shared;
CREATE DOMAIN control.cycle_deviation_type_d AS text;
CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
${table}
${verify}`);

  // Execute the production consent upsert with controlled, SQL-quoted test inputs.
  const source = readFileSync(new URL("../../../../packages/platform/governance/src/repositories/kysely-governance-repository.ts", import.meta.url), "utf8");
  const upsert = source.match(/const result = await sql<Row>`([\s\S]*?)`\.execute\(transaction\)/)[1];
  const consentTable = ddl.match(/CREATE TABLE governance\.channel_consent \([\s\S]*?\n\);/)[0];
  sql(`CREATE SCHEMA event; CREATE TABLE event.channel_consent_event (id uuid PRIMARY KEY, tenant_id uuid, created_at timestamptz);
${consentTable}
INSERT INTO event.channel_consent_event VALUES
('44444444-4444-4444-8444-444444444441','11111111-1111-4111-8111-111111111111','2026-09-06T00:00:01Z'),
('44444444-4444-4444-8444-444444444442','11111111-1111-4111-8111-111111111111','2026-09-06T00:00:03Z'),
('44444444-4444-4444-8444-444444444443','11111111-1111-4111-8111-111111111111','2026-09-06T00:00:02Z');`);
  const consentWrite = (eventId, consented) => {
    const input = {tenantId:"11111111-1111-4111-8111-111111111111",subjectType:"principal",subjectId:"22222222-2222-4222-8222-222222222222",channel:"email",consented,effectiveAt:"2026-09-06T00:00:00Z",eventId,sourceCode:"api"};
    const literals = Object.fromEntries(Object.entries(input).map(([key,value])=>[`input.${key}`,typeof value === "boolean" ? String(value) : "'"+value.replaceAll("'","''")+"'"]));
    Object.assign(literals,{"input.destinationHash ?? null":"NULL","input.expiresAt ?? null":"NULL","JSON.stringify(input.evidence)":"'{}'"});
    sql(upsert.replace(/\$\{([^}]+)\}/g,(_match,expression)=>{assert.ok(expression in literals,`Unexpected SQL expression: ${expression}`);return literals[expression];})+";");
  };
  consentWrite("44444444-4444-4444-8444-444444444441",true);
  consentWrite("44444444-4444-4444-8444-444444444442",false);
  consentWrite("44444444-4444-4444-8444-444444444443",true);
  sql(`DO $$ BEGIN IF (SELECT is_consented OR last_event_id <> '44444444-4444-4444-8444-444444444442'::uuid FROM governance.channel_consent) THEN RAISE EXCEPTION 'consent projection ignored event ordering'; END IF; END $$;`);
  console.log("PASS: canonical DDL permits multiple ordinary deviations and rejects duplicate carry keys; production consent SQL honors equal-effective-time event ordering.");
} finally {
  spawnSync("docker", ["rm", "--force", name], { stdio: "ignore" });
}
