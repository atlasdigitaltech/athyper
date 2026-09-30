BEGIN;
CREATE SCHEMA bp_baseline_test;
CREATE TABLE bp_baseline_test.applied_release(id uuid PRIMARY KEY,source_release_id uuid,manifest jsonb);
CREATE TABLE bp_baseline_test.release_activation_head(publication_key text PRIMARY KEY,applied_release_id uuid,row_version bigint,source_release_no bigint,artifact_hash text);
CREATE TABLE bp_baseline_test.entity_contract(release_id uuid,publication_key text,tenant_id uuid);
-- Enforce the signed baseline precondition at the atomic activation boundary.
CREATE OR REPLACE FUNCTION bp_baseline_test.trg_baseline_activation_precondition() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,bp_baseline_test AS $$
DECLARE v_expected jsonb; v_candidate bp_baseline_test.applied_release%ROWTYPE; v_global bp_baseline_test.release_activation_head%ROWTYPE;
BEGIN
 SELECT * INTO STRICT v_candidate FROM bp_baseline_test.applied_release WHERE id=NEW.applied_release_id;
 v_expected:=v_candidate.manifest->'evidence'->'importedBaseline';
 IF v_expected IS NULL THEN RETURN NEW; END IF;
 IF v_expected->>'kind'='global_tenant_fork' THEN
   IF TG_OP<>'INSERT' OR NEW.source_release_no<>1
     OR NEW.publication_key<>COALESCE(v_expected->>'sourcePublicationKey','')||'.tenant.'||COALESCE(v_expected->>'tenantId','')
     OR NOT EXISTS(SELECT 1 FROM bp_baseline_test.entity_contract c WHERE c.release_id=v_candidate.source_release_id AND c.publication_key=NEW.publication_key AND c.tenant_id::text=v_expected->>'tenantId')
     THEN RAISE EXCEPTION 'TENANT_FORK_COORDINATE_MISMATCH'; END IF;
   SELECT * INTO STRICT v_global FROM bp_baseline_test.release_activation_head WHERE publication_key=v_expected->>'sourcePublicationKey' FOR SHARE;
   IF v_global.applied_release_id::text IS DISTINCT FROM v_expected->>'appliedReleaseId'
     OR v_global.row_version::text IS DISTINCT FROM v_expected->>'rowVersion'
     OR v_global.source_release_no::text IS DISTINCT FROM v_expected->>'sourceReleaseNo'
     OR v_global.artifact_hash IS DISTINCT FROM v_expected->>'artifactHash'
     THEN RAISE EXCEPTION 'GLOBAL_BASELINE_STALE_AT_ACTIVATION'; END IF;
   RETURN NEW;
 END IF;
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'BASELINE_ACTIVATION_HEAD_REQUIRED'; END IF;
 IF COALESCE(v_expected->>'appliedReleaseId','')<>OLD.applied_release_id::text
   OR COALESCE(v_expected->>'rowVersion','')<>OLD.row_version::text
   OR COALESCE(v_expected->>'sourceReleaseNo','')<>OLD.source_release_no::text
   OR COALESCE(v_expected->>'artifactHash','')<>OLD.artifact_hash
   OR NEW.publication_key<>OLD.publication_key
   -- Publication sequence can advance past unactivated releases; the signed
   -- baseline above must still match every current-head coordinate.
   OR NEW.source_release_no<=OLD.source_release_no THEN
   RAISE EXCEPTION 'BASELINE_STALE_AT_ACTIVATION';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS baseline_activation_precondition ON bp_baseline_test.release_activation_head;
CREATE TRIGGER baseline_activation_precondition BEFORE INSERT OR UPDATE ON bp_baseline_test.release_activation_head
 FOR EACH ROW EXECUTE FUNCTION bp_baseline_test.trg_baseline_activation_precondition();

INSERT INTO bp_baseline_test.applied_release VALUES('11111111-1111-4111-8111-111111111111',NULL,'{}'),('22222222-2222-4222-8222-222222222222',NULL,'{}');
INSERT INTO bp_baseline_test.release_activation_head VALUES('bp','11111111-1111-4111-8111-111111111111',18,18,'oldhash');
DO $test$ DECLARE expected jsonb:=jsonb_build_object('appliedReleaseId','11111111-1111-4111-8111-111111111111','rowVersion','18','sourceReleaseNo','18','artifactHash','oldhash'); key text; n integer; BEGIN
 FOREACH key IN ARRAY ARRAY['appliedReleaseId','rowVersion','sourceReleaseNo','artifactHash'] LOOP
  UPDATE bp_baseline_test.applied_release SET manifest=jsonb_build_object('evidence',jsonb_build_object('importedBaseline',jsonb_set(expected,ARRAY[key],'"changed"'))) WHERE id='22222222-2222-4222-8222-222222222222';
  BEGIN
   UPDATE bp_baseline_test.release_activation_head SET applied_release_id='22222222-2222-4222-8222-222222222222',source_release_no=20,row_version=19;
   RAISE EXCEPTION 'STALE_BASELINE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'BASELINE_STALE_AT_ACTIVATION' THEN RAISE; END IF; END;
 END LOOP;
 UPDATE bp_baseline_test.applied_release SET manifest=jsonb_build_object('evidence',jsonb_build_object('importedBaseline',expected)) WHERE id='22222222-2222-4222-8222-222222222222';
 FOREACH n IN ARRAY ARRAY[17,18] LOOP
  BEGIN
   UPDATE bp_baseline_test.release_activation_head SET applied_release_id='22222222-2222-4222-8222-222222222222',source_release_no=n,row_version=19;
   RAISE EXCEPTION 'NON_FORWARD_RELEASE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'BASELINE_STALE_AT_ACTIVATION' THEN RAISE; END IF; END;
 END LOOP;
 UPDATE bp_baseline_test.release_activation_head SET applied_release_id='22222222-2222-4222-8222-222222222222',source_release_no=20,row_version=19;
 IF NOT EXISTS(SELECT 1 FROM bp_baseline_test.release_activation_head WHERE source_release_no=20) THEN RAISE EXCEPTION 'FORWARD_RELEASE_REJECTED';END IF;
END $test$;
SELECT 'seven_baseline_checks_passed';
ROLLBACK;
