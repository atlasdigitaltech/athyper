-- Enforce the signed baseline precondition at the atomic activation boundary.
CREATE OR REPLACE FUNCTION runtime_meta.trg_baseline_activation_precondition() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,runtime_meta AS $$
DECLARE v_expected jsonb; v_candidate runtime_meta.applied_release%ROWTYPE; v_global runtime_meta.release_activation_head%ROWTYPE;
BEGIN
 SELECT * INTO STRICT v_candidate FROM runtime_meta.applied_release WHERE id=NEW.applied_release_id;
 v_expected:=v_candidate.manifest->'evidence'->'importedBaseline';
 IF v_expected IS NULL THEN RETURN NEW; END IF;
 IF v_expected->>'kind'='reviewed_empty_target' THEN
   IF TG_OP<>'INSERT' OR NEW.source_release_no<>1
     OR (v_expected->>'schemaVersion'='1') IS NOT TRUE
     OR NEW.publication_key IS DISTINCT FROM v_expected->>'publicationKey'
     OR NOT EXISTS(SELECT 1 FROM runtime_meta.entity_contract c WHERE c.release_id=v_candidate.source_release_id AND c.publication_key=NEW.publication_key AND c.tenant_id::text=v_expected->>'tenantId' AND c.entity_code=v_expected->>'entityCode')
     OR EXISTS(SELECT 1 FROM runtime_meta.entity_contract c WHERE c.tenant_id::text=v_expected->>'tenantId' AND c.entity_code=v_expected->>'entityCode' AND c.release_id<>v_candidate.source_release_id)
     THEN RAISE EXCEPTION 'RESTORATION_EMPTY_TARGET_REQUIRED'; END IF;
   RETURN NEW;
 END IF;
 IF v_expected->>'kind'='global_tenant_fork' THEN
   IF TG_OP<>'INSERT' OR NEW.source_release_no<>1
     OR NEW.publication_key<>COALESCE(v_expected->>'sourcePublicationKey','')||'.tenant.'||COALESCE(v_expected->>'tenantId','')
     OR NOT EXISTS(SELECT 1 FROM runtime_meta.entity_contract c WHERE c.release_id=v_candidate.source_release_id AND c.publication_key=NEW.publication_key AND c.tenant_id::text=v_expected->>'tenantId')
     THEN RAISE EXCEPTION 'TENANT_FORK_COORDINATE_MISMATCH'; END IF;
   SELECT * INTO STRICT v_global FROM runtime_meta.release_activation_head WHERE publication_key=v_expected->>'sourcePublicationKey' FOR SHARE;
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
DROP TRIGGER IF EXISTS baseline_activation_precondition ON runtime_meta.release_activation_head;
CREATE TRIGGER baseline_activation_precondition BEFORE INSERT OR UPDATE ON runtime_meta.release_activation_head
 FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_baseline_activation_precondition();

CREATE FUNCTION runtime_meta.fn_runtime_restoration_precondition_version() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 1 $$;
REVOKE ALL ON FUNCTION runtime_meta.fn_runtime_restoration_precondition_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION runtime_meta.fn_runtime_restoration_precondition_version() TO athyperapp;
