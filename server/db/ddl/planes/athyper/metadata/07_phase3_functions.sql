CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_surface_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
BEGIN
    IF TG_TABLE_NAME = 'entity_surface_section' THEN
        IF NOT EXISTS (
            SELECT 1 FROM metadata.entity_surface surface_row
             WHERE surface_row.id = NEW.entity_surface_id
               AND surface_row.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
               AND surface_row.entity_id = NEW.entity_id
               AND surface_row.change_set_id = NEW.change_set_id
        ) THEN
            RAISE EXCEPTION 'Surface section must belong to the same scoped surface graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF NEW.parent_section_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_surface_section parent_row
             WHERE parent_row.id = NEW.parent_section_id
               AND parent_row.entity_surface_id = NEW.entity_surface_id
               AND parent_row.change_set_id = NEW.change_set_id
        ) THEN
            RAISE EXCEPTION 'Parent section must belong to the same surface'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_surface_field_binding' THEN
        IF NOT EXISTS (
            SELECT 1 FROM metadata.entity_surface surface_row
            JOIN metadata.entity_field field_row ON field_row.id = NEW.entity_field_id
             WHERE surface_row.id = NEW.entity_surface_id
               AND surface_row.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
               AND surface_row.entity_id = NEW.entity_id
               AND surface_row.change_set_id = NEW.change_set_id
               AND field_row.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
               AND field_row.entity_id = NEW.entity_id
               AND field_row.change_set_id = NEW.change_set_id
        ) THEN
            RAISE EXCEPTION 'Surface field binding must reference the same scoped surface and field graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF NEW.entity_surface_section_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_surface_section section_row
             WHERE section_row.id = NEW.entity_surface_section_id
               AND section_row.entity_surface_id = NEW.entity_surface_id
               AND section_row.change_set_id = NEW.change_set_id
        ) THEN
            RAISE EXCEPTION 'Surface field section must belong to the same surface'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_operation_references()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_surface_key text;
BEGIN
    FOREACH v_surface_key IN ARRAY ARRAY[NEW.input_surface_key, NEW.confirmation_surface_key, NEW.result_surface_key] LOOP
        IF v_surface_key IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_surface
             WHERE tenant_id IS NOT DISTINCT FROM NEW.tenant_id
               AND entity_id = NEW.entity_id
               AND change_set_id = NEW.change_set_id
               AND surface_key = v_surface_key
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Operation surface reference % is not active in this Entity graph', v_surface_key
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;
