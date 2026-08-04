CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_operation_scope_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM metadata.entity_operation operation
         WHERE operation.id = NEW.entity_operation_id
           AND operation.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
           AND operation.entity_id = NEW.entity_id
           AND operation.change_set_id = NEW.change_set_id
    ) THEN
        RAISE EXCEPTION 'Operation scope binding must reference an operation in the same Entity graph'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;
