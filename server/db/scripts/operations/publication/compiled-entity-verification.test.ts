import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
const literal = (v: unknown) => "'" + String(v).replaceAll("'", "''") + "'";
function run(plane: string, sql: string) {
  const info = JSON.parse(
    execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
      encoding: "utf8",
    }),
  )[0];
  assert.equal(info.Config.Labels["com.docker.compose.project"], "athyper-dev");
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-db-1",
      "psql",
      "-U",
      "postgres",
      "-d",
      `athyper_${plane}`,
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}
test(
  "compiled entity verification requires payload, signature, hash, plane and schema; legacy requires descriptor",
  { skip: process.env.COMPILED_ENTITY_VERIFICATION_TEST !== "1" },
  () => {
    const migration = readFileSync(
      new URL(
        "../upgrades/post-baseline-20260929/20260929_compiled_entity_verification.sql",
        import.meta.url,
      ),
      "utf8",
    )
      .replace(/^BEGIN;$/m, "")
      .replace(/^COMMIT;$/m, "");
    for (const plane of ["studio", "neon", "mesh"]) {
      for (const scenario of [
        "valid",
        "missing_payload",
        "signature",
        "hash",
        "plane",
        "schema",
        "legacy",
      ]) {
        const id = randomUUID(),
          release = randomUUID(),
          key = `metadata.entity.verification_probe_${id}`;
        const evidence = {
          signature_verified: scenario !== "signature",
          manifest_valid: true,
          runtime_compatible: true,
          target_plane: scenario === "plane" ? "other" : plane,
          payload_hash: "b".repeat(64),
          payload_schema_version: scenario === "schema" ? "0" : "2.0",
        };
        const projection = {
          id: release,
          artifact_kind: "compiled_entity_runtime",
          payload_schema_version: "2.0",
          payload_hash: "b".repeat(64),
          payload_json: {},
          coordinates: {
            release_id: release,
            release_no: 1,
            publication_key: key,
            plane_code: plane,
          },
          generated_at: new Date().toISOString(),
        };
        const expected: Record<string, string> = {
          valid: "verified|",
          missing_payload: "rejected|APPLIED_RELEASE_PAYLOAD_REQUIRED",
          signature: "rejected|ARTIFACT_SIGNATURE_INVALID",
          hash: "rejected|ARTIFACT_HASH_MISMATCH",
          plane: "rejected|BUSINESS_PARTNER_DEFINITION_HASH_MISMATCH",
          schema:
            "rejected|BUSINESS_PARTNER_DEFINITION_SCHEMA_VERSION_MISMATCH",
          legacy: "rejected|ENTITY_PROJECTION_REQUIRED",
        };
        const result = run(
          plane,
          `BEGIN; ${migration}
 INSERT INTO runtime_meta.applied_release(id,publication_key,source_release_id,source_release_no,deployment_id,artifact_hash,manifest) VALUES('${id}',${literal(key)},'${release}',1,'${randomUUID()}',repeat('a',64),${literal(JSON.stringify({ artifactKind: scenario === "legacy" ? "entity_runtime" : "compiled_entity_runtime" }))}::jsonb);
 SET LOCAL ROLE athyper_projection_applier;
 ${["missing_payload", "legacy"].includes(scenario) ? "" : `SELECT id FROM runtime_meta.fn_stage_applied_release_payload('${id}',${literal(JSON.stringify(projection))}::jsonb);`}
 SELECT status||'|'||COALESCE(failure_code,'') FROM runtime_meta.fn_verify_release('${id}',repeat('${scenario === "hash" ? "c" : "a"}',64),${literal(JSON.stringify(evidence))}::jsonb); ROLLBACK;`,
        );
        assert.equal(
          result.trim().split("\n").at(-1),
          expected[scenario],
          `${plane}: ${scenario}`,
        );
      }
    }
  },
);
