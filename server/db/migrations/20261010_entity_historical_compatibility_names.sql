-- Rename active compatibility objects after their callers moved to the explicit
-- historical-normalization contract. This changes no rows, constraints or grants.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'metadata.ix_entity_operation_legacy_permission_code'::regclass)
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'metadata.entity_field_legacy_key_uq'::regclass)
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'metadata.entity_field'::regclass AND conname = 'entity_field_legacy_required_ck')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'metadata.entity_surface'::regclass AND conname = 'entity_surface_legacy_required_ck')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'metadata.entity_surface_section'::regclass AND conname = 'entity_surface_section_legacy_required_ck')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'metadata.entity_operation'::regclass AND conname = 'entity_operation_legacy_required_ck')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'metadata.entity_surface_field_binding'::regclass AND conname = 'entity_binding_legacy_required_ck')
    OR to_regprocedure('metadata.guard_legacy_ownership_initialization()') IS NULL
    OR to_regprocedure('metadata.guard_legacy_section_position()') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'metadata.entity_surface_section'::regclass AND tgname = 'legacy_section_position_guard')
  THEN
    RAISE EXCEPTION 'HISTORICAL_COMPATIBILITY_NAMING_PREDECESSOR_REQUIRED';
  END IF;
END $$;

ALTER INDEX metadata.ix_entity_operation_legacy_permission_code RENAME TO ix_entity_operation_historical_permission_code;
ALTER INDEX metadata.entity_field_legacy_key_uq RENAME TO entity_field_historical_key_uq;
ALTER TABLE metadata.entity_field RENAME CONSTRAINT entity_field_legacy_required_ck TO entity_field_historical_required_ck;
ALTER TABLE metadata.entity_surface RENAME CONSTRAINT entity_surface_legacy_required_ck TO entity_surface_historical_required_ck;
ALTER TABLE metadata.entity_surface_section RENAME CONSTRAINT entity_surface_section_legacy_required_ck TO entity_surface_section_historical_required_ck;
ALTER TABLE metadata.entity_operation RENAME CONSTRAINT entity_operation_legacy_required_ck TO entity_operation_historical_required_ck;
ALTER TABLE metadata.entity_surface_field_binding RENAME CONSTRAINT entity_binding_legacy_required_ck TO entity_binding_historical_required_ck;
ALTER FUNCTION metadata.guard_legacy_ownership_initialization() RENAME TO guard_historical_ownership_initialization;
ALTER FUNCTION metadata.guard_legacy_section_position() RENAME TO guard_historical_section_position;
ALTER TRIGGER legacy_section_position_guard ON metadata.entity_surface_section RENAME TO historical_section_position_guard;
