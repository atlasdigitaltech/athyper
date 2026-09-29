import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
const literal = (value: unknown) =>
  "'" + String(value).replaceAll("'", "''") + "'";
function run(plane: string, sql: string) {
  assert.ok(["studio", "neon", "mesh"].includes(plane));
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
  "DEV identity operation projections stage only the authorized owner dataset",
  { skip: process.env.IDENTITY_OPERATION_PROJECTION_TEST !== "1" },
  () => {
    const rows = JSON.parse(
      run(
        "studio",
        `BEGIN READ ONLY; SELECT json_agg(json_build_object('plane',c.plane_code,'release',c.publication_release_id,'payload',c.unsigned_document->'envelope'->'payload')) FROM publication.artifact_compilation c JOIN publication.release r ON r.id=c.publication_release_id WHERE r.release_key IN ('metadata.entity.principal_profile','metadata.entity.principal_notification_preference'); ROLLBACK;`,
      ),
    );
    assert.equal(rows.length, 6);
    const migration = readFileSync(
      new URL(
        "../../../migrations/20260929_identity_operation_projection.sql",
        import.meta.url,
      ),
      "utf8",
    )
      .replace(/^BEGIN;$/m, "")
      .replace(/^COMMIT;$/m, "");
    for (const row of rows) {
      const descriptor = row.payload.artifacts.find(
        (a: any) => a.artifactType === "runtime_contract",
      ).content.descriptor;
      const probe = randomUUID();
      const stage = (d: any) =>
        `authz.fn_stage_entity_operation_projection('${probe}',NULL,${literal(row.plane)},${literal(row.release)},repeat('c',64),${literal(JSON.stringify(d))}::jsonb)`;
      const variants = [
        { ...descriptor, ownerAccess: undefined },
        { ...descriptor, storage: { ...descriptor.storage, object: "other" } },
        { ...descriptor, planeKey: row.plane === "mesh" ? "neon" : "mesh" },
        {
          ...descriptor,
          operation_scope_bindings: descriptor.operation_scope_bindings.map(
            (b: any) => ({ ...b, scopeKind: "company_code" }),
          ),
        },
        {
          ...descriptor,
          operation_scope_bindings: descriptor.operation_scope_bindings.map(
            (b: any) => ({
              ...b,
              permissionCode: "common.identity.principal.administer",
            }),
          ),
        },
      ];
      const denied = variants
        .map(
          (d) =>
            `DO $$ BEGIN BEGIN PERFORM ${stage(d)}; RAISE EXCEPTION 'invalid identity binding admitted'; EXCEPTION WHEN check_violation THEN NULL; END; END $$;`,
        )
        .join("\n");
      const output = run(
        row.plane,
        `BEGIN; ${migration}
 SELECT set_config('app.database_plane',${literal(row.plane)},true);
 INSERT INTO runtime_meta.applied_release(id,publication_key,source_release_id,source_release_no,deployment_id,artifact_hash,manifest) VALUES('${probe}','test.identity.${probe}',${literal(row.release)},1,'${randomUUID()}',repeat('c',64),'{}');
 SET LOCAL ROLE athyper_projection_applier;
 ${denied}
 SELECT ${stage(descriptor)}; SELECT ${stage(descriptor)}; ROLLBACK;`,
      );
      assert.deepEqual(output.trim().split("\n").slice(-2), ["4", "4"]);
    }
  },
);
