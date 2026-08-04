CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_numbering_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM metadata.entity_field AS field
         WHERE field.id = NEW.entity_field_id
           AND field.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
           AND field.entity_id = NEW.entity_id
           AND field.change_set_id = NEW.change_set_id
           AND field.status = 'active'
           AND field.data_type = 'string'
           AND field.cardinality = 'one'
           AND field.value_origin = 'stored'
           AND field.write_mode = 'write_once'
    ) THEN
        RAISE EXCEPTION 'Numbering target must be an active stored scalar write-once string in the same Entity graph'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.entity_operation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM metadata.entity_operation AS operation
         WHERE operation.id = NEW.entity_operation_id
           AND operation.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
           AND operation.entity_id = NEW.entity_id
           AND operation.change_set_id = NEW.change_set_id
           AND operation.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Numbering operation must be active and belong to the same Entity graph'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;
