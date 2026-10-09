import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { lowerNativeRuntimePublication } from "../../../../packages/services/publication/src/compilation/native-runtime.js";
const ddl = readFileSync(
  new URL(
    "../../../ddl/planes/studio/publication/14_compiled_entity_runtime.sql",
    import.meta.url,
  ),
  "utf8",
);
const lit = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
function run(plane: string, sql: string) {
  assert.ok(["studio", "neon", "mesh"].includes(plane));
  const c = JSON.parse(
    execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
      encoding: "utf8",
    }),
  )[0];
  assert.equal(c.Config.Labels["com.docker.compose.project"], "athyper-dev");
  assert.equal(c.State.Running, true);
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-db-1",
      "sh",
      "-c",
      `exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_${plane} -v ON_ERROR_STOP=1`,
    ],
    {
      input: sql,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 8 * 1024 * 1024,
    },
  );
}
test("source reader v4 preserves the approval gate and grants no table writes", () => {
  assert.match(ddl, /metadata\.entity_release/);
  assert.doesNotMatch(
    ddl,
    /CREATE POLICY|GRANT (UPDATE|INSERT|ALL)|country|currency|business_partner/i,
  );
});
test(
  "DEV PostgreSQL accepts reviewed operation projections on each plane; all test writes roll back",
  {
    skip: process.env.OPERATION_PROJECTION_POSTGRES_TEST !== "1",
  },
  () => {
    const release = process.env.OPERATION_PROJECTION_RELEASE_ID;
    const tenant = process.env.OPERATION_PROJECTION_AUTHORITY_TENANT;
    for (const v of [release, tenant]) assert.match(v ?? "", /^[a-f0-9-]{36}$/);
    const context = `DO $$ BEGIN PERFORM set_config('app.current_tenant_id',${lit(tenant)},true); END $$;`;
    const sources = JSON.parse(
      run(
        "studio",
        `BEGIN; ${ddl} SET LOCAL ROLE athyper_publication_service; ${context}
    SELECT json_agg(s) FROM publication.fn_compiled_entity_compilation_source_v4(${lit(release)}::uuid) s; ROLLBACK;`,
      ),
    );
    assert.equal(sources.length, 3);
    const denied = run(
      "studio",
      `BEGIN; ${ddl} SET LOCAL ROLE athyper_publication_service;
    DO $$ BEGIN PERFORM set_config('app.current_tenant_id','00000000-0000-4000-8000-000000000099',true); END $$;
    SELECT count(*) FROM publication.fn_compiled_entity_compilation_source_v4(${lit(release)}::uuid); ROLLBACK;`,
    );
    assert.equal(denied.trim(), "0");
    for (const s of sources) {
      const plane = s.plane_key;
      const permissions = JSON.parse(
        run(
          plane,
          `SELECT json_agg(p) FROM (SELECT p.id,p.canonical_code code,p.permission_kind::text kind,
      array_agg(k.scope_kind::text ORDER BY k.scope_kind) "scopeKinds" FROM authz.permission p
      JOIN authz.permission_scope_kind k ON k.permission_id=p.id AND k.status='active'
      WHERE p.status='published' GROUP BY p.id) p;`,
        ),
      );
      const profile = s.compiled_json.runtimeProfiles[0];
      const result = lowerNativeRuntimePublication(
        {
          releaseId: s.publication_release_id,
          releaseNo: Number(s.release_no),
          publicationKey: s.release_key,
          plane,
          tenantId: s.source_tenant_id,
          entityCode: s.entity_code,
          revisionId: s.revision_id,
          sourceEntityId: s.source_entity_id,
          sourceReleaseHash: s.source_release_hash,
          sourceContractHash: "a".repeat(64),
          sourceDescriptorHash: "b".repeat(64),
          generatedAt: s.created_at,
          native: s.compiled_json,
          contract: s.contract_json,
        },
        {
          permissions,
          registration: {
            entityCode: s.entity_code,
            plane,
            storage: {
              schema: profile.storageSchema,
              object: profile.storageObject,
              idField: "id",
            },
            columns: s.compiled_json.fields.map(
              (f: { storagePath: string }) => f.storagePath,
            ),
          },
        },
      );
      const descriptor = result.runtimeContracts![s.entity_code]!;
      const active = run(
        plane,
        `SELECT a.id FROM runtime_meta.applied_release a JOIN runtime_meta.release_activation_head h ON h.applied_release_id=a.id
      WHERE a.source_release_id=${lit(release)}::uuid;`,
      ).trim();
      assert.match(active, /^[a-f0-9-]{36}$/);
      const count = () =>
        run(
          plane,
          `SELECT count(*) FROM authz.entity_operation_binding WHERE applied_release_id=${lit(active)}::uuid;`,
        ).trim();
      const before = count();
      const stage = (value: unknown) =>
        `authz.fn_stage_entity_operation_projection(${lit(active)}::uuid,NULL,${lit(plane)},${lit(release)}::uuid,repeat('c',64),${lit(JSON.stringify(value))}::jsonb)`;
      const output = run(
        plane,
        `BEGIN; SET LOCAL ROLE athyper_projection_applier;
      DO $$ BEGIN BEGIN PERFORM ${stage({ source: descriptor.source, operation_scope_bindings: descriptor.operation_scope_bindings })};
        RAISE EXCEPTION 'incomplete descriptor admitted'; EXCEPTION WHEN check_violation THEN NULL; END; END $$;
      SELECT ${stage(descriptor)}; ROLLBACK;`,
      );
      assert.equal(output.trim(), String(s.compiled_json.operations.length));
      assert.equal(count(), before);
    }
  },
);
