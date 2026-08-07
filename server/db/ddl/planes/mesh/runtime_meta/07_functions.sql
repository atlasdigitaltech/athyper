CREATE OR REPLACE FUNCTION runtime_meta.trg_guard_entity_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, runtime_meta
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Published Entity contracts cannot be deleted; revoke instead'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF ROW(
        NEW.id, NEW.entity_id, NEW.entity_code, NEW.version_no,
        NEW.entity_contract_hash, NEW.source_compiled_artifact_id,
        NEW.source_compiled_hash, NEW.contract_json,
        NEW.published_at, NEW.received_at
    ) IS DISTINCT FROM ROW(
        OLD.id, OLD.entity_id, OLD.entity_code, OLD.version_no,
        OLD.entity_contract_hash, OLD.source_compiled_artifact_id,
        OLD.source_compiled_hash, OLD.contract_json,
        OLD.published_at, OLD.received_at
    ) THEN
        RAISE EXCEPTION 'Published Entity contract evidence is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'revoked' AND NEW.status <> 'revoked' THEN
        RAISE EXCEPTION 'Revoked Entity contracts cannot be restored in place'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
           (OLD.status = 'published' AND NEW.status IN ('superseded', 'revoked'))
           OR (OLD.status = 'superseded' AND NEW.status = 'revoked')
       ) THEN
        RAISE EXCEPTION 'Invalid Entity contract status transition: % -> %',
            OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.status_changed_at := clock_timestamp();
    END IF;

    RETURN NEW;
END;
$$;
