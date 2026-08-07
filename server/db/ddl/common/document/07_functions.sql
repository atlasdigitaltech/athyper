CREATE OR REPLACE FUNCTION document.trg_guard_work_item_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.source_entity_code IS DISTINCT FROM OLD.source_entity_code
       OR NEW.source_entity_id IS DISTINCT FROM OLD.source_entity_id THEN
        RAISE EXCEPTION 'work item identity, source, and creation evidence are immutable'
            USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;
