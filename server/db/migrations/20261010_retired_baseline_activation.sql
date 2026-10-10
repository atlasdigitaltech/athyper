-- Retired artifacts remain immutable historical records, never new activation inputs.
CREATE OR REPLACE FUNCTION runtime_meta.trg_baseline_activation_precondition() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,runtime_meta AS $$
DECLARE candidate runtime_meta.applied_release%ROWTYPE;
BEGIN
 SELECT * INTO STRICT candidate FROM runtime_meta.applied_release WHERE id=NEW.applied_release_id;
 IF COALESCE(candidate.manifest->'evidence','{}'::jsonb) ? 'importedBaseline' THEN
   RAISE EXCEPTION 'IMPORTED_BASELINE_ACTIVATION_RETIRED';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS baseline_activation_precondition ON runtime_meta.release_activation_head;
CREATE TRIGGER baseline_activation_precondition BEFORE INSERT OR UPDATE ON runtime_meta.release_activation_head
 FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_baseline_activation_precondition();
DROP FUNCTION IF EXISTS runtime_meta.fn_runtime_restoration_precondition_version();
