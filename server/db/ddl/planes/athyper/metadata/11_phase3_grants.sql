REVOKE ALL ON metadata.entity_surface, metadata.entity_surface_section,
    metadata.entity_surface_field_binding, metadata.entity_operation FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION metadata.trg_validate_entity_surface_binding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION metadata.trg_validate_entity_operation_references() FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON metadata.entity_surface,
            metadata.entity_surface_section, metadata.entity_surface_field_binding,
            metadata.entity_operation TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON metadata.entity_surface, metadata.entity_surface_section,
            metadata.entity_surface_field_binding, metadata.entity_operation TO athyperadmin;
    END IF;
END;
$$;
