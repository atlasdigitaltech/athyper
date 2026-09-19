// Executes the production registration command in disposable PostgreSQL.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
const name = `mesh-review-${randomUUID()}`;
function docker(args, input) {
  const r = spawnSync("docker", args, { input, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.error?.message);
  return r.stdout;
}
const sql = (input) =>
  docker(
    [
      "exec",
      "-i",
      name,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
    ],
    input,
  );
const ddl = readFileSync(
  new URL("../../../ddl/planes/mesh/mesh/11_grants.sql", import.meta.url),
  "utf8",
);
const command = ddl.match(
  /CREATE OR REPLACE FUNCTION mesh\.command_issue_registration_exchange\([\s\S]*?END \$\$;/,
)[0];
const tenant = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const call = (
  evaluation,
  message = "Hello",
  key = "registration-001",
  expires = "2099-01-01",
) =>
  `mesh.command_issue_registration_exchange('${other}','${tenant}','${other}','supplier_self_registration','commercial','mesh.registration',1,'${"a".repeat(64)}','{"message":"${message}","policyEvaluation":{"evaluationId":"${evaluation}"}}','${"b".repeat(64)}','${expires}','Reviewed','${key}','${tenant}')`;
const verify = `
TRUNCATE mesh.registration_exchange,mesh.network_command_evidence;
DO $$ DECLARE first_result record; retry_result record; BEGIN
 SELECT * INTO first_result FROM ${call("evaluation-1")};
 SELECT * INTO retry_result FROM ${call("evaluation-2")};
 IF first_result.replayed OR NOT retry_result.replayed OR first_result.exchange_id<>retry_result.exchange_id THEN RAISE EXCEPTION 'incorrect retry result'; END IF;
 IF (SELECT count(*) FROM mesh.registration_exchange)<>1 OR (SELECT count(*) FROM mesh.network_command_evidence)<>1 THEN RAISE EXCEPTION 'duplicate effects'; END IF;
 IF (SELECT intent_snapshot ? 'policyEvaluation' FROM mesh.registration_exchange) THEN RAISE EXCEPTION 'policy evidence leaked to recipient intent'; END IF;
 IF (SELECT payload->'policyEvaluation'->>'evaluationId' FROM mesh.network_command_evidence)<>'evaluation-1' THEN RAISE EXCEPTION 'original policy evidence lost'; END IF;
 BEGIN PERFORM * FROM ${call("evaluation-3", "Changed")}; RAISE EXCEPTION 'changed command accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN PERFORM * FROM ${call("evaluation-3", "Hello", "expired-new-001", "2000-01-01")}; RAISE EXCEPTION 'expired command accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;`;
try {
  docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--network",
    "none",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:16.13-bookworm",
  ]);
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (
      spawnSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], {
        stdio: "ignore",
      }).status === 0
    ) {
      ready = true;
      break;
    }
    await setTimeout(200);
  }
  assert.ok(ready, "PostgreSQL did not become ready");
  sql(`CREATE EXTENSION pgcrypto; CREATE SCHEMA mesh; CREATE SCHEMA shared; CREATE SCHEMA master;
CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
CREATE FUNCTION shared.current_tenant_id() RETURNS uuid LANGUAGE sql AS 'SELECT ''${tenant}''::uuid';
CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS 'SELECT ''${tenant}''::uuid';
CREATE TABLE mesh.network_account(tenant_id uuid,id uuid);
INSERT INTO mesh.network_account VALUES('${tenant}','${tenant}'),('${other}','${other}');
CREATE TABLE mesh.network_command_evidence(id uuid PRIMARY KEY,actor_tenant_id uuid,idempotency_key text,command_fingerprint text,aggregate_id uuid,to_state text,resulting_version bigint,payload jsonb,UNIQUE(actor_tenant_id,idempotency_key));
CREATE TABLE mesh.registration_exchange(id uuid,requester_tenant_id uuid,counterparty_tenant_id uuid,requester_account_id uuid,counterparty_account_id uuid,intent_kind text,relationship_kind text,contract_name text,contract_version int,contract_hash text,intent_snapshot jsonb,invitation_token_hash text,expires_at timestamptz,status text,row_version bigint,created_by uuid);
-- Minimal evidence dependency; command logic itself is loaded verbatim below.
CREATE FUNCTION mesh.fn_record_network_command(actor uuid,other uuid,aggregate text,aggregate_id uuid,command text,from_state text,to_state text,version bigint,reason text,key text,fingerprint text,payload jsonb,principal uuid) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE id uuid:=gen_random_uuid(); BEGIN INSERT INTO mesh.network_command_evidence VALUES(id,actor,key,fingerprint,aggregate_id,to_state,version+1,payload); RETURN id; END $$;
${command}
${verify}`);
  console.log(
    "PASS: canonical SQL preserves policy evidence, replays changed evaluations, and rejects changed commands and expired new requests.",
  );
} finally {
  spawnSync("docker", ["rm", "--force", name], { stdio: "ignore" });
}
