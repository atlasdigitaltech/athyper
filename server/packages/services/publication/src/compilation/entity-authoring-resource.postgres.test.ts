import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
// Explicit DEV rollback rehearsal. Synthetic verification evidence demonstrates
// database projection semantics only, not authentication or publication approval.
it.skipIf(process.env.ENTITY_RESOURCE_DEV_POSTGRES !== "1")(
  "stages, verifies and activates both payload resources without retaining any fixture",
  () => {
    const container = JSON.parse(
      execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
        encoding: "utf8",
      }),
    )[0];
    expect(container.Config.Labels["com.docker.compose.project"]).toBe(
      "athyper-dev",
    );
    const run = (input: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "athyper-dev-db-1",
          "psql",
          "-X",
          "-U",
          "postgres",
          "-d",
          "athyper_studio",
          "-At",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    const before = run(
      "SELECT md5(coalesce(jsonb_agg(to_jsonb(h) ORDER BY publication_key),'[]'::jsonb)::text) FROM runtime_meta.release_activation_head h",
    );
    const forward = readFileSync(
      new URL(
        "../../../../../db/ddl/common/runtime_meta/13_authoring_resource_projection.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const body = [
      "BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s'; SET LOCAL app.database_plane='studio';",
      forward,
    ];
    for (const kind of [
      "entity_authoring_descriptor",
      "entity_identity_review",
    ]) {
      const release = randomUUID(),
        deployment = randomUUID(),
        key =
          "metadata.entity.resource_fixture." +
          randomUUID().replaceAll("-", "");
      body.push(`DO $$ DECLARE a runtime_meta.applied_release; h runtime_meta.release_activation_head; p jsonb; BEGIN
   p:=jsonb_build_object('applied_release_payload',jsonb_build_object('id','${release}','tenant_id',null,'artifact_kind','${kind}','payload_schema_version','1.0','payload_hash',repeat('a',64),'payload_json',jsonb_build_object('fixture',true),'coordinates',jsonb_build_object('release_id','${release}','release_no',1,'publication_key','${key}','plane_code','studio'),'generated_at',clock_timestamp()-interval '1 minute'));
   SELECT * INTO a FROM runtime_meta.fn_stage_release_projection('${key}','${release}',1,'${deployment}',repeat('b',64),jsonb_build_object('artifactKind','${kind}'),p);
   SELECT * INTO a FROM runtime_meta.fn_verify_release(a.id,repeat('b',64),jsonb_build_object('signature_verified',true,'manifest_valid',true,'runtime_compatible',true,'target_plane','studio','payload_hash',repeat('a',64),'payload_schema_version','1.0'));
   IF a.status<>'verified' THEN RAISE EXCEPTION 'RESOURCE_VERIFY_FAILED: %',a.failure_code; END IF;
   SELECT * INTO h FROM runtime_meta.fn_activate_release(a.id);
   IF h.applied_release_id<>a.id THEN RAISE EXCEPTION 'RESOURCE_HEAD_MISMATCH'; END IF;
   IF EXISTS(SELECT 1 FROM runtime_meta.entity_descriptor WHERE applied_release_id=a.id) THEN RAISE EXCEPTION 'UNEXPECTED_ENTITY_PROJECTION'; END IF;
  END $$;`);
    }
    body.push("ROLLBACK;");
    expect(run(body.join("\n")).trim().endsWith("ROLLBACK")).toBe(true);
    expect(
      run(
        "SELECT md5(coalesce(jsonb_agg(to_jsonb(h) ORDER BY publication_key),'[]'::jsonb)::text) FROM runtime_meta.release_activation_head h",
      ),
    ).toBe(before);
  },
);
