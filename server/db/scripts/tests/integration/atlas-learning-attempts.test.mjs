import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const migration = readFileSync(resolve(root, "migrations/20261001_atlas_learning_attempts.sql"), "utf8");
const files = ["03_tables.sql", "05_constraints.sql", "06_indexes.sql", "08_triggers.sql", "10_rls.sql", "11_grants.sql"];
const canonical = files.map(file => readFileSync(resolve(root, "ddl/planes/studio/ai", file), "utf8").split("-- BEGIN ATLAS LEARNING ATTEMPTS\n")[1].split("-- END ATLAS LEARNING ATTEMPTS")[0].trim()).join("\n");
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const docker = (...args) => execFileSync("docker", args, { encoding:"utf8",stdio:["pipe","pipe","pipe"] });
const sql = (container, input, db = "athyper_studio") => execFileSync("docker", ["exec","-i",container,"psql","-X","-qAt","-h","127.0.0.1","-U","postgres","-d",db,"-v","ON_ERROR_STOP=1"], {input,encoding:"utf8",stdio:["pipe","pipe","pipe"]});
const hash = "a".repeat(64);
const session = `SET ROLE athyperapp; SET app.current_tenant_id='${id(1)}';`;
const baseline = `
CREATE SCHEMA ai; CREATE SCHEMA shared; CREATE SCHEMA publication;
CREATE FUNCTION shared.current_tenant_id() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.current_tenant_id',true)::uuid $$;
CREATE FUNCTION publication.trg_guard_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable'; END $$;
CREATE TABLE ai.atlas_learning_inbox(tenant_id uuid,id uuid,proposal_hash text,UNIQUE(tenant_id,id,proposal_hash));
INSERT INTO ai.atlas_learning_inbox VALUES ('${id(1)}','${id(2)}','${hash}');
GRANT USAGE ON SCHEMA ai,shared TO athyperapp;
`;
const start = attempt => `INSERT INTO ai.atlas_learning_attempt(id,tenant_id,inbox_id,actor_id,proposal_hash,revision,source_release_id,source_descriptor_hash,source_contract_hash,resolver_version,scoring_version) VALUES ('${id(attempt)}','${id(1)}','${id(2)}','${id(3)}','${hash}',0,'${id(4)}','${hash}','${hash}','resolver/1','scoring/1');`;
const terminal = (attempt,status="failed",tenant=1) => `INSERT INTO ai.atlas_learning_attempt_result(tenant_id,attempt_id,status,failure_code,evidence) VALUES ('${id(tenant)}','${id(attempt)}','${status}',${status === "failed" ? "'LEARNING_EVALUATION_FAILED'" : "NULL"},'{"fixtureCount":3,"passedCount":2}');`;

test("canonical and upgrade attempt ledgers survive draft rollback, enforce tenant scope and preserve immutable terminal evidence", async () => {
  assert.ok(migration.includes(canonical), "canonical blocks and upgrade must agree");
  const container=`athyper-learning-attempts-${randomUUID()}`;
  let created=false;
  try {
    docker("run","-d","--name",container,"--network","none","--label","athyper.purpose=learning-attempts-test","--tmpfs","/var/lib/postgresql/data","-e","POSTGRES_HOST_AUTH_METHOD=trust","postgres:16.15-bookworm"); created=true;
    let ready=false;
    for(let n=0;n<60;n++){try{docker("exec",container,"pg_isready","-h","127.0.0.1","-U","postgres");ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}
    assert.ok(ready);
    sql(container,"CREATE DATABASE athyper_studio; CREATE ROLE athyperapp; CREATE ROLE athyperadmin;","postgres");
    for(const mode of ["canonical","upgrade"]){
      sql(container,"DROP SCHEMA IF EXISTS ai CASCADE; DROP SCHEMA IF EXISTS shared CASCADE; DROP SCHEMA IF EXISTS publication CASCADE;"+baseline+(mode === "canonical" ? canonical : migration));
      sql(container,session+start(10));
      // Draft work and tentative success both roll back. Started evidence survives.
      sql(container,session+"BEGIN;"+terminal(10,"succeeded")+"ROLLBACK;");
      assert.equal(sql(container,session+"SELECT count(*) FROM ai.atlas_learning_attempt; SELECT count(*) FROM ai.atlas_learning_attempt_result;").trim(),"1\n0");
      sql(container,session+terminal(10));
      assert.throws(()=>sql(container,session+terminal(10,"succeeded")),/duplicate key/);
      assert.equal(sql(container,`SET ROLE athyperapp; SET app.current_tenant_id='${id(9)}'; SELECT count(*) FROM ai.atlas_learning_attempt; SELECT count(*) FROM ai.atlas_learning_attempt_result;`).trim(),"0\n0");
      assert.throws(()=>sql(container,session+terminal(10,"failed",9)),/row-level security/);
      sql(container,session+start(13));
      assert.throws(()=>sql(container,`SET ROLE athyperapp; SET app.current_tenant_id='${id(9)}';`+terminal(13,"failed",9)),/foreign key/);
      for(const table of ["atlas_learning_attempt","atlas_learning_attempt_result"]){
        assert.throws(()=>sql(container,session+`DELETE FROM ai.${table};`),/permission denied/);
        assert.throws(()=>sql(container,`DELETE FROM ai.${table};`),/immutable/);
      }
      // Interruption remains started; retries append distinct attempts.
      sql(container,session+start(11)+start(12)+terminal(12,"succeeded"));
      assert.equal(sql(container,session+"SELECT count(*) FROM ai.atlas_learning_attempt a LEFT JOIN ai.atlas_learning_attempt_result r ON r.attempt_id=a.id WHERE r.attempt_id IS NULL;").trim(),"2");
      assert.throws(()=>sql(container,session+`INSERT INTO ai.atlas_learning_attempt_result VALUES ('${id(1)}','${id(11)}','failed','LEARNING_ATTEMPT_FAILED','{"question":"private"}',now());`),/check constraint/);
    }
  } finally { if(created) docker("rm","-f",container); }
});
