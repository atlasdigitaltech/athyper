import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../../ddl/common/runtime_meta/07_functions.sql", import.meta.url), "utf8");
const ddl = source.slice(source.indexOf("CREATE OR REPLACE FUNCTION runtime_meta.fn_activate_release("), source.indexOf("CREATE OR REPLACE FUNCTION runtime_meta.fn_rollback_release("));
test("activation takes predecessor coordinates from the stored manifest under the head lock", () => {
  assert.ok(ddl.indexOf("FOR UPDATE;\n    -- Successor") < ddl.indexOf("RELEASE_PREDECESSOR_REQUIRED"));
  assert.match(ddl, /v_candidate.manifest#>>'\{evidence,expectedPredecessor\}'/);
  assert.doesNotMatch(ddl, /p_evidence\s*(->|#>)/);
  assert.ok(ddl.indexOf("RELEASE_PREDECESSOR_CHANGED") < ddl.indexOf("fn_retire_entity_operation_projection"));
});
for (const plane of ["studio", "neon", "mesh"]) test(`DEV ${plane}: exact successor head, stale pins, missing evidence and replay; rollback all fixtures`, {
  skip: process.env.ENTITY_SUCCESSOR_POSTGRES_TEST !== "1",
}, () => {
  const container = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
  assert.equal(container.Config.Labels["com.docker.compose.project"], "athyper-dev"); assert.equal(container.State.Running, true);
  const output = execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c",
    `exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_${plane} -v ON_ERROR_STOP=1`], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], input: `BEGIN;
    ${ddl}
    DO $$ DECLARE old_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid(); old_source uuid:=gen_random_uuid();
      key text:='test.successor.'||replace(gen_random_uuid()::text,'-',''); pin jsonb; bad jsonb; field text; head runtime_meta.release_activation_head;
    BEGIN
      INSERT INTO runtime_meta.applied_release(id,publication_key,source_release_id,source_release_no,deployment_id,artifact_hash,manifest,status)
        VALUES(old_id,key,old_source,1,gen_random_uuid(),repeat('a',64),'{}','active'),
        (new_id,key,gen_random_uuid(),2,gen_random_uuid(),repeat('b',64),jsonb_build_object('artifactKind','compiled_entity_runtime','targetPlane','${plane}'),'verified');
      INSERT INTO runtime_meta.release_activation_head(publication_key,applied_release_id,source_release_no,artifact_hash,activated_at)
        VALUES(key,old_id,1,repeat('a',64),clock_timestamp());
      pin:=jsonb_build_object('plane','${plane}','environment','local','instance','dev','publicationKey',key,'appliedReleaseId',old_id,
        'sourceReleaseId',old_source,'sourceReleaseNo',1,'artifactHash',repeat('a',64),'headVersion',1);
      BEGIN
        PERFORM runtime_meta.fn_activate_release(new_id,jsonb_build_object('expectedPredecessor',pin));
        RAISE EXCEPTION 'missing signed predecessor accepted';
      EXCEPTION WHEN object_not_in_prerequisite_state THEN IF SQLERRM<>'RELEASE_PREDECESSOR_REQUIRED' THEN RAISE; END IF; END;
      FOREACH field IN ARRAY ARRAY['appliedReleaseId','sourceReleaseId','sourceReleaseNo','artifactHash','headVersion','publicationKey','plane','environment','instance'] LOOP
        bad:=jsonb_set(pin,ARRAY[field],to_jsonb('changed'::text));
        UPDATE runtime_meta.applied_release SET manifest=jsonb_build_object('artifactKind','compiled_entity_runtime','targetPlane','${plane}',
          'evidence',jsonb_build_object('expectedPredecessor',bad::text)) WHERE id=new_id;
        BEGIN PERFORM runtime_meta.fn_activate_release(new_id); RAISE EXCEPTION 'changed pin accepted: %',field;
        EXCEPTION WHEN object_not_in_prerequisite_state THEN IF SQLERRM<>'RELEASE_PREDECESSOR_CHANGED' THEN RAISE; END IF; END;
      END LOOP;
      UPDATE runtime_meta.applied_release SET manifest=jsonb_build_object('artifactKind','compiled_entity_runtime','targetPlane','${plane}',
        'evidence',jsonb_build_object('expectedPredecessor',pin::text)) WHERE id=new_id;
      head:=runtime_meta.fn_activate_release(new_id);
      IF head.applied_release_id<>new_id OR head.row_version<>2 THEN RAISE EXCEPTION 'successor not activated'; END IF;
      head:=runtime_meta.fn_activate_release(new_id);
      IF head.row_version<>2 THEN RAISE EXCEPTION 'replay advanced head'; END IF;
    END $$;
    ROLLBACK; SELECT 'rollback verified';` });
  assert.equal(output.trim(), "rollback verified");
});

test("DEV Studio: successor SQL installs transactionally and denies release allocation without enrollment", {
  skip: process.env.ENTITY_SUCCESSOR_POSTGRES_TEST !== "1" || !process.env.ENTITY_SUCCESSOR_DRAFT_RECEIPT,
}, () => {
  const receipt = JSON.parse(readFileSync(process.env.ENTITY_SUCCESSOR_DRAFT_RECEIPT!, "utf8"));
  for (const value of [receipt.changeSet?.id, receipt.predecessor?.authoringReleaseId, receipt.authorityTenantId, receipt.actorId])
    assert.match(value, /^[a-f0-9-]{36}$/);
  const container = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
  assert.equal(container.Config.Labels["com.docker.compose.project"], "athyper-dev"); assert.equal(container.State.Running, true);
  const commands = ["15_system_entity_commands.sql", "17_system_entity_successor.sql"].map(file => readFileSync(new URL(`../../../ddl/planes/studio/publication/${file}`, import.meta.url), "utf8")).join("\n");
  const output = execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c",
    'exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1'], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], input: `BEGIN;
    ${commands}
    SET LOCAL ROLE athyper_runtime;
    DO $$ BEGIN
      PERFORM set_config('app.current_tenant_id','${receipt.authorityTenantId}',true);
      PERFORM set_config('app.current_principal_id','${receipt.actorId}',true);
      BEGIN
        PERFORM publication.fn_create_system_entity_successor(gen_random_uuid(),'${receipt.changeSet.id}',1,'${receipt.predecessor.authoringReleaseId}','{}',ARRAY['studio'],'${receipt.actorId}');
        RAISE EXCEPTION 'unenrolled allocation accepted';
      EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'SYSTEM_PUBLICATION_ENROLLMENT_REQUIRED' THEN RAISE; END IF; END;
    END $$;
    ROLLBACK; SELECT 'unenrolled denied; rollback verified';` });
  assert.equal(output.trim(), "unenrolled denied; rollback verified");
});
