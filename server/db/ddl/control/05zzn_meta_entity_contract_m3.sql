-- ============================================================================
-- Meta Entity Contract M3 publication guards.
-- ============================================================================

CREATE OR REPLACE FUNCTION control.trg_fn_contract_transition_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Contract transition evidence is immutable'
        USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_fn_validate_ready_publish_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_status text;
    v_contract_hash text;
    v_projection_hash text;
BEGIN
    IF NEW.readiness_status <> 'READY' THEN
        RETURN NEW;
    END IF;
    IF NEW.published_version_id IS NULL
       OR NEW.contract_hash IS NULL
       OR NEW.materialized_hash IS NULL
       OR NEW.admin_compiled_hash IS NULL
       OR NEW.neon_compiled_hash IS NULL
       OR NEW.mesh_compiled_hash IS NULL
       OR NEW.ready_at IS NULL
    THEN
        RAISE EXCEPTION 'READY publication requires pointer and all materialized/compiled hashes'
            USING ERRCODE = '23514';
    END IF;

    SELECT status, contract_hash, projection_hash
      INTO v_status, v_contract_hash, v_projection_hash
      FROM control.entity_version
     WHERE id=NEW.published_version_id
       AND entity_id=NEW.entity_id
       AND tenant_id IS NOT DISTINCT FROM NEW.tenant_id;
    IF NOT FOUND
       OR v_status <> 'EFFECTIVE'
       OR v_contract_hash IS DISTINCT FROM NEW.contract_hash
       OR v_projection_hash IS DISTINCT FROM NEW.materialized_hash
    THEN
        RAISE EXCEPTION 'READY hashes and pointer must match the EFFECTIVE entity version'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

