BEGIN;
SET LOCAL lock_timeout = '5s';
-- Enforce the signed baseline precondition at the atomic activation boundary.
CREATE FUNCTION runtime_meta.trg_baseline_activation_precondition() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,runtime_meta AS $$
DECLARE v_expected jsonb; v_candidate runtime_meta.applied_release%ROWTYPE;
BEGIN
 SELECT * INTO STRICT v_candidate FROM runtime_meta.applied_release WHERE id=NEW.applied_release_id;
 v_expected:=v_candidate.manifest->'evidence'->'importedBaseline';
 IF v_expected IS NULL THEN RETURN NEW; END IF;
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'BASELINE_ACTIVATION_HEAD_REQUIRED'; END IF;
 IF COALESCE(v_expected->>'appliedReleaseId','')<>OLD.applied_release_id::text
   OR COALESCE(v_expected->>'rowVersion','')<>OLD.row_version::text
   OR COALESCE(v_expected->>'sourceReleaseNo','')<>OLD.source_release_no::text
   OR COALESCE(v_expected->>'artifactHash','')<>OLD.artifact_hash
   OR NEW.publication_key<>OLD.publication_key
   OR NEW.source_release_no<>OLD.source_release_no+1 THEN
   RAISE EXCEPTION 'BASELINE_STALE_AT_ACTIVATION';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER baseline_activation_precondition BEFORE INSERT OR UPDATE ON runtime_meta.release_activation_head
 FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_baseline_activation_precondition();

COMMIT;
