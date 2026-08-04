CREATE OR REPLACE FUNCTION control.trg_guard_network_document_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Network document types cannot be deleted; retire instead'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.status = 'active' AND (
        (NEW.entity_version_policy = 'latest_published' AND NOT EXISTS (
            SELECT 1
              FROM runtime_meta.entity_contract ec
             WHERE ec.entity_id = NEW.entity_id
               AND ec.entity_code = NEW.entity_code
               AND ec.status = 'published'
        ))
        OR
        (NEW.entity_version_policy = 'pinned' AND NOT EXISTS (
            SELECT 1
              FROM runtime_meta.entity_contract ec
             WHERE ec.entity_id = NEW.entity_id
               AND ec.entity_code = NEW.entity_code
               AND ec.id = NEW.pinned_entity_version_id
               AND ec.entity_contract_hash = NEW.pinned_contract_hash
               AND ec.status <> 'revoked'
        ))
    ) THEN
        RAISE EXCEPTION 'Network document type does not resolve to a published Entity contract'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Network document type identity, Entity identity, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
        RAISE EXCEPTION 'Retired network document types cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'active'
       AND (
           NEW.direction_scope IS DISTINCT FROM OLD.direction_scope
           OR NEW.entity_code IS DISTINCT FROM OLD.entity_code
           OR NEW.entity_version_policy IS DISTINCT FROM OLD.entity_version_policy
           OR NEW.pinned_entity_version_id IS DISTINCT FROM OLD.pinned_entity_version_id
           OR NEW.pinned_contract_hash IS DISTINCT FROM OLD.pinned_contract_hash
       ) THEN
        RAISE EXCEPTION
            'Deactivate a network document type before changing its routing contract'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;
