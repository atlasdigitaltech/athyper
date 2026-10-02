import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

// A disposable function-level rehearsal. Authorization owners are stubs here;
// tenant admission and projection compatibility have separate owner tests.
const root = resolve(import.meta.dirname, "../../..");
const ddl = readFileSync(resolve(root, "ddl/common/runtime_meta/07_functions.sql"), "utf8");
const extract = source => source.match(/CREATE OR REPLACE FUNCTION runtime_meta\.fn_rollback_release\([\s\S]*?END; \$\$;/)[0];
const canonical = extract(ddl);
const migration = readFileSync(resolve(root, "migrations/20261001_publication_rollback_retry.sql"), "utf8");
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const evidence = { tenantId: id(10), actorId: id(11), reason: "qualified recovery", operationId: "durable-job-1" };
const call = (value = evidence, target = id(1)) => `SELECT runtime_meta.fn_rollback_release('metadata.entity.country','${target}','${JSON.stringify(value)}'::jsonb);`;
const fixture = `
DROP SCHEMA IF EXISTS runtime_meta CASCADE;
DROP SCHEMA IF EXISTS authz CASCADE;
CREATE SCHEMA runtime_meta; CREATE SCHEMA authz;
CREATE TABLE runtime_meta.applied_release(id uuid PRIMARY KEY,publication_key text,source_release_no bigint,artifact_hash text,status text,activated_at timestamptz);
CREATE TABLE runtime_meta.release_activation_head(publication_key text PRIMARY KEY,applied_release_id uuid,source_release_no bigint,artifact_hash text,activated_at timestamptz,row_version bigint);
CREATE TABLE runtime_meta.release_activation_event(id uuid DEFAULT gen_random_uuid(),publication_key text,previous_applied_release_id uuid,applied_release_id uuid,activated_at timestamptz,evidence jsonb);
CREATE TABLE runtime_meta.entity_descriptor(id uuid,applied_release_id uuid,entity_contract_id uuid,status text,activated_at timestamptz,retired_at timestamptz);
CREATE TABLE runtime_meta.entity_contract(id uuid,status text,status_changed_at timestamptz);
CREATE TABLE runtime_meta.applied_release_payload(applied_release_id uuid);
CREATE FUNCTION authz.fn_retire_entity_operation_projection(uuid,timestamptz) RETURNS void LANGUAGE sql AS 'SELECT';
CREATE FUNCTION authz.fn_restore_entity_operation_projection(uuid,timestamptz) RETURNS void LANGUAGE sql AS 'SELECT';
INSERT INTO runtime_meta.applied_release VALUES ('${id(1)}','metadata.entity.country',1,'first','superseded',now()),('${id(2)}','metadata.entity.country',2,'second','active',now());
INSERT INTO runtime_meta.release_activation_head VALUES ('metadata.entity.country','${id(2)}',2,'second',now(),2);
INSERT INTO runtime_meta.applied_release_payload VALUES ('${id(1)}');
`;
const args = (container, database) => ["exec", "-i", container, "psql", "-X", "-qAt", "-h", "127.0.0.1", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"];
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const sql = (container, database, input) => execFileSync("docker", args(container, database), { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const concurrentSql = (container, database, input) => new Promise((resolve, reject) => {
  const child = spawn("docker", args(container, database)); let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; }); child.stdout.resume();
  child.on("error", reject); child.on("close", code => code === 0 ? resolve() : reject(Error(stderr)));
  child.stdin.end(input);
});
const session = `SET app.current_tenant_id='${id(10)}';`;
const rejected = (body, message) => `DO $$ BEGIN BEGIN ${body} RAISE EXCEPTION 'TEST_EXPECTED_REJECTION'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '${message}' THEN RAISE; END IF; END; END $$;`;

test("canonical and forward-upgraded rollback accept only exact current-head retries on each plane", async () => {
  assert.equal(extract(migration), canonical, "upgrade must match canonical function");
  const container = `athyper-rollback-retry-${randomUUID()}`;
  let created = false;
  try {
    docker("run", "-d", "--name", container, "--network", "none", "--label", "athyper.purpose=rollback-retry-test", "--tmpfs", "/var/lib/postgresql/data", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16.15-bookworm");
    created = true;
    let ready = false;
    for (let n = 0; n < 60; n++) {
      try { docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    assert.ok(ready);
    for (const plane of ["studio", "neon", "mesh"]) {
      const database = `athyper_${plane}`;
      sql(container, "postgres", `CREATE DATABASE ${database};`);
      for (const mode of ["canonical", "upgrade"]) {
        sql(container, database, fixture + canonical);
        if (mode === "upgrade") {
          // Model the previous non-idempotent routine, then apply the actual
          // manifest upgrade without touching existing table state.
          sql(container, database, `CREATE OR REPLACE FUNCTION runtime_meta.fn_rollback_release(text,uuid,jsonb DEFAULT '{}'::jsonb) RETURNS runtime_meta.release_activation_head LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'OLD_ROUTINE'; END $$;`.replace('fn_rollback_release(text,uuid,jsonb', 'fn_rollback_release(p_publication_key text,p_target_applied_release_id uuid,p_evidence jsonb'));
          sql(container, database, migration);
        }
        // Both jobs can start before the first commit: exactly one mutation.
        await Promise.all([1, 2].map(() => concurrentSql(container, database, session + "BEGIN;" + call() + "SELECT pg_sleep(0.05); COMMIT;")));
        const before = sql(container, database, "SELECT row_version FROM runtime_meta.release_activation_head; SELECT count(*) FROM runtime_meta.release_activation_event;");
        assert.equal(before.trim(), "3\n1", `${plane}/${mode}: one rollback mutation`);
        sql(container, database, session + call());
        assert.equal(sql(container, database, "SELECT row_version FROM runtime_meta.release_activation_head; SELECT count(*) FROM runtime_meta.release_activation_event;"), before);
        const perform = value => call(value).replace('SELECT runtime_meta', 'PERFORM runtime_meta');
        sql(container, database, session + rejected(perform({ ...evidence, reason: "changed" }), "ROLLBACK_OPERATION_REPLAY_MISMATCH"));
        sql(container, database, session + rejected(perform({ ...evidence, tenantId: id(12) }), "ROLLBACK_OPERATION_COORDINATES_INVALID"));
        sql(container, database, `SET app.current_tenant_id='${id(12)}';` + rejected(perform({ ...evidence, tenantId: id(12) }), "ROLLBACK_RELEASE_NOT_ELIGIBLE"));
        sql(container, database, session + rejected(perform({ ...evidence, operationId: "new-job" }), "ROLLBACK_RELEASE_NOT_ELIGIBLE"));
        sql(container, database, session + rejected(call(evidence, id(2)).replace('SELECT runtime_meta', 'PERFORM runtime_meta'), "ROLLBACK_OPERATION_REPLAY_MISMATCH"));
        // Another activation supersedes this completion: old retry cannot
        // move the head backwards, even if the target later becomes active again.
        sql(container, database, `UPDATE runtime_meta.release_activation_head SET applied_release_id='${id(2)}',activated_at=clock_timestamp(),row_version=row_version+1;`);
        sql(container, database, session + rejected(perform(evidence), "ROLLBACK_OPERATION_REPLAY_MISMATCH"));
        sql(container, database, `UPDATE runtime_meta.release_activation_head SET applied_release_id='${id(1)}',activated_at=clock_timestamp(),row_version=row_version+1;`);
        sql(container, database, session + rejected(perform(evidence), "ROLLBACK_OPERATION_REPLAY_MISMATCH"));
        assert.equal(sql(container, database, "SELECT count(*) FROM runtime_meta.release_activation_event;").trim(), "1");
      }
    }
  } finally { if (created) docker("rm", "-f", container); }
});
