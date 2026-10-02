import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

// Execute the production SQL state machine on disposable plane databases.
// Projection-owner functions are stubs: this does not qualify owner authority,
// signed artifact loading, delivery acknowledgements, or authenticated HTTP reads.
const source = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../ddl/common/runtime_meta/07_functions.sql",
  ),
  "utf8",
);
const routine = (name) => {
  const start = source.indexOf(
    `CREATE OR REPLACE FUNCTION runtime_meta.${name}(`,
  );
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("$$;", start) + 3);
};
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const key = "metadata.entity.country";
const literal = (value) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const args = (container, database) => [
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-qAt",
  "-h",
  "127.0.0.1",
  "-U",
  "postgres",
  "-d",
  database,
  "-v",
  "ON_ERROR_STOP=1",
];
const sql = (container, database, input) =>
  execFileSync("docker", args(container, database), {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const concurrentSql = (container, database, input) =>
  new Promise((resolveResult, reject) => {
    const child = spawn("docker", args(container, database));
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      resolveResult({ code, output: output.trim(), error }),
    );
    child.stdin.end(input);
  });
const fixture = `
CREATE SCHEMA runtime_meta; CREATE SCHEMA authz;
CREATE TABLE runtime_meta.applied_release(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publication_key text, source_release_id uuid, source_release_no bigint, deployment_id uuid, artifact_hash text, manifest jsonb, status text DEFAULT 'staged', verified_at timestamptz, rejected_at timestamptz, failure_code text, verification_evidence jsonb, activated_at timestamptz, UNIQUE(publication_key,source_release_id));
CREATE TABLE runtime_meta.release_activation_head(publication_key text PRIMARY KEY, applied_release_id uuid, source_release_no bigint, artifact_hash text, activated_at timestamptz, row_version bigint DEFAULT 1);
CREATE TABLE runtime_meta.release_activation_event(id uuid DEFAULT gen_random_uuid(), publication_key text, previous_applied_release_id uuid, applied_release_id uuid, activated_at timestamptz, evidence jsonb);
CREATE TABLE runtime_meta.entity_descriptor(id uuid, applied_release_id uuid, entity_contract_id uuid, status text, activated_at timestamptz, retired_at timestamptz, plane_code text, source_contract_hash text, descriptor_schema_version text);
CREATE TABLE runtime_meta.entity_contract(id uuid, status text, status_changed_at timestamptz, entity_contract_hash text, contract_schema_version text);
CREATE TABLE runtime_meta.applied_release_payload(id uuid DEFAULT gen_random_uuid(), applied_release_id uuid UNIQUE, artifact_kind text, coordinates jsonb, payload_hash text, payload_schema_version text);
CREATE FUNCTION authz.fn_retire_entity_operation_projection(uuid,timestamptz) RETURNS void LANGUAGE sql AS 'SELECT';
CREATE FUNCTION authz.fn_activate_entity_operation_projection(uuid,timestamptz) RETURNS void LANGUAGE sql AS 'SELECT';
${["fn_stage_release", "fn_verify_release", "fn_activate_release", "fn_active_release"].map(routine).join("\n")}
`;
const stage = (n, releaseNo, plane, predecessor) =>
  `SELECT id FROM runtime_meta.fn_stage_release('${key}','${id(n)}',${releaseNo},'${id(n + 100)}','hash-${n}',${literal({ artifactKind: "compiled_entity_runtime", targetPlane: plane, ...(predecessor ? { evidence: { expectedPredecessor: JSON.stringify(predecessor) } } : {}) })});`;
const applied = (n) =>
  `(SELECT id FROM runtime_meta.applied_release WHERE source_release_id='${id(n)}')`;
const verify = (n, plane, valid = true) => `
INSERT INTO runtime_meta.applied_release_payload(applied_release_id,artifact_kind,coordinates,payload_hash,payload_schema_version)
VALUES(${applied(n)},'compiled_entity_runtime',${literal({ plane_code: plane })},'payload-${n}','1.0.0') ON CONFLICT DO NOTHING;
SELECT status FROM runtime_meta.fn_verify_release(${applied(n)},'hash-${n}',${literal({ signature_verified: valid, manifest_valid: true, runtime_compatible: true, target_plane: plane, payload_hash: `payload-${n}`, payload_schema_version: "1.0.0" })});`;
const activate = (n) =>
  `SELECT source_release_no FROM runtime_meta.fn_activate_release(${applied(n)});`;
const readHead = (container, database) =>
  JSON.parse(
    sql(
      container,
      database,
      `SELECT row_to_json(r) FROM runtime_meta.fn_active_release('${key}') r;`,
    ) || "null",
  );
const predecessor = (container, database, plane) => {
  const head = readHead(container, database);
  return {
    appliedReleaseId: head.applied_release_id,
    sourceReleaseId: head.source_release_id,
    sourceReleaseNo: head.source_release_no,
    artifactHash: head.artifact_hash,
    headVersion: Number(
      sql(
        container,
        database,
        "SELECT row_version FROM runtime_meta.release_activation_head;",
      ),
    ),
    publicationKey: key,
    plane,
    environment: "local",
    instance: "dev",
  };
};

test("concurrent Country publication and interrupted plane recovery preserve verified serving heads", async () => {
  const container = `athyper-publication-concurrency-${randomUUID()}`;
  let created = false;
  try {
    docker(
      "run",
      "-d",
      "--name",
      container,
      "--network",
      "none",
      "--label",
      "athyper.purpose=publication-concurrency-test",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "-e",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:16.15-bookworm",
    );
    created = true;
    let ready = false;
    for (let n = 0; n < 60; n++) {
      try {
        docker(
          "exec",
          container,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "postgres",
        );
        ready = true;
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 250));
      }
    }
    assert.ok(ready, "disposable database ready");
    for (const plane of ["studio", "neon", "mesh"]) {
      const database = `athyper_${plane}`;
      sql(container, "postgres", `CREATE DATABASE ${database};`);
      sql(container, database, fixture);
      // Independent workers enter the real uniqueness/advisory-lock protocol.
      const stages = await Promise.all(
        [1, 2].map(() =>
          concurrentSql(container, database, stage(1, 1, plane)),
        ),
      );
      assert.ok(stages.every((result) => result.code === 0));
      assert.equal(stages[0].output, stages[1].output);
      assert.equal(readHead(container, database), null);
      assert.equal(sql(container, database, verify(1, plane)), "verified");
      const activations = await Promise.all(
        [1, 2].map(() =>
          concurrentSql(
            container,
            database,
            `BEGIN; ${activate(1)} SELECT pg_sleep(0.05); COMMIT;`,
          ),
        ),
      );
      assert.ok(activations.every((result) => result.code === 0));
      assert.equal(
        sql(
          container,
          database,
          "SELECT count(*) FROM runtime_meta.release_activation_event;",
        ),
        "1",
      );
      const expected = predecessor(container, database, plane);
      sql(
        container,
        database,
        stage(2, 2, plane, expected) +
          verify(2, plane) +
          stage(3, 2, plane, expected) +
          verify(3, plane),
      );
      const competitors = await Promise.all(
        [2, 3].map((n) =>
          concurrentSql(
            container,
            database,
            `BEGIN; ${activate(n)} SELECT pg_sleep(0.05); COMMIT;`,
          ),
        ),
      );
      assert.equal(
        competitors.filter((result) => result.code === 0).length,
        1,
        `${plane}: exactly one successor wins`,
      );
      assert.match(
        competitors.find((result) => result.code !== 0).error,
        /RELEASE_PREDECESSOR_CHANGED/,
      );
      assert.equal(readHead(container, database).source_release_no, 2);
      assert.equal(
        sql(
          container,
          database,
          "SELECT row_version FROM runtime_meta.release_activation_head; SELECT count(*) FROM runtime_meta.release_activation_event;",
        ),
        "2\n2",
      );
      // Prepare the next release on all planes, interrupted at different steps.
      sql(
        container,
        database,
        stage(4, 3, plane, predecessor(container, database, plane)),
      );
      if (plane !== "mesh") sql(container, database, verify(4, plane));
      if (plane === "studio") sql(container, database, activate(4));
    }
    // Partial deployment is explicit; unfinished planes keep the last verified head.
    assert.deepEqual(
      ["studio", "neon", "mesh"].map(
        (plane) => readHead(container, `athyper_${plane}`).source_release_no,
      ),
      [3, 2, 2],
    );
    const rejected = await concurrentSql(
      container,
      "athyper_mesh",
      activate(4),
    );
    assert.notEqual(rejected.code, 0);
    assert.match(rejected.error, /RELEASE_NOT_VERIFIED/);
    // A process loss before commit rolls back verification, payload and head
    // together. Recovery must start from the persisted staged release again.
    sql(
      container,
      "athyper_mesh",
      `BEGIN; ${verify(4, "mesh")} ${activate(4)} ROLLBACK;`,
    );
    assert.equal(readHead(container, "athyper_mesh").source_release_no, 2);
    assert.equal(
      sql(
        container,
        "athyper_mesh",
        `SELECT status FROM runtime_meta.applied_release WHERE source_release_id='${id(4)}'; SELECT count(*) FROM runtime_meta.release_activation_event;`,
      ),
      "staged\n2",
    );
    for (const plane of ["studio", "neon", "mesh"]) {
      const database = `athyper_${plane}`;
      if (plane === "mesh") sql(container, database, verify(4, plane));
      // Restart/replay after committed activation must not duplicate events.
      sql(container, database, activate(4) + activate(4));
      const head = readHead(container, database);
      assert.equal(head.source_release_id, id(4));
      assert.equal(head.source_release_no, 3);
      assert.equal(head.artifact_hash, "hash-4");
      assert.equal(
        sql(
          container,
          database,
          "SELECT row_version FROM runtime_meta.release_activation_head; SELECT count(*) FROM runtime_meta.release_activation_event;",
        ),
        "3\n3",
      );
      assert.equal(
        sql(
          container,
          database,
          `SELECT verification_evidence->>'signature_verified' FROM runtime_meta.applied_release WHERE id='${head.applied_release_id}';`,
        ),
        "true",
      );
      // Rejected verification never becomes a serving candidate during recovery.
      sql(
        container,
        database,
        stage(5, 4, plane, predecessor(container, database, plane)),
      );
      assert.equal(
        sql(container, database, verify(5, plane, false)),
        "rejected",
      );
      assert.notEqual(
        (await concurrentSql(container, database, activate(5))).code,
        0,
      );
      assert.deepEqual(readHead(container, database), head);
    }
  } finally {
    if (created) docker("rm", "-f", container);
  }
});
