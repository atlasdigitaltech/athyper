CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_lifecycle_binding()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$ BEGIN
    IF TG_TABLE_NAME = 'entity_lifecycle_binding' THEN
        IF NOT EXISTS (SELECT 1 FROM metadata.entity_field f WHERE f.id=NEW.entity_field_id
          AND f.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND f.entity_id=NEW.entity_id
          AND f.change_set_id=NEW.change_set_id AND f.status='active' AND f.cardinality <> 'many'
          AND f.data_type IN ('string','enum')) THEN
            RAISE EXCEPTION 'Lifecycle state field must be an active scalar string or enum in the same Entity graph' USING ERRCODE='foreign_key_violation';
        END IF;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM metadata.entity_lifecycle_binding b JOIN metadata.entity_operation o ON o.id=NEW.entity_operation_id
          WHERE b.id=NEW.entity_lifecycle_binding_id AND b.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
          AND o.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND b.entity_id=NEW.entity_id AND o.entity_id=NEW.entity_id
          AND b.change_set_id=NEW.change_set_id AND o.change_set_id=NEW.change_set_id) THEN
            RAISE EXCEPTION 'Lifecycle operation mapping members must belong to the same Entity graph' USING ERRCODE='foreign_key_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
