-- Compatibility nullability preparation only. Native pending guards remain.
-- No source enrollment, protected-state initialization, grants or cutover.
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid IN ('metadata.entity_change_set'::regclass,'metadata.entity_field'::regclass,'metadata.entity_runtime_profile'::regclass,'metadata.entity_surface'::regclass,'metadata.entity_surface_section'::regclass,'metadata.entity_surface_field_binding'::regclass,'metadata.entity_operation'::regclass) AND conname LIKE '%\_native_pending_ck' ESCAPE '\' AND convalidated) <> 7 THEN
  RAISE EXCEPTION 'NATIVE_NULLABILITY_PREPARATION_REQUIRES_PENDING_GUARDS';
 END IF;
END $$;
ALTER TABLE metadata.entity_field ADD CONSTRAINT entity_field_legacy_required_ck CHECK (label_id IS NOT NULL OR (field_key IS NOT NULL AND type_config IS NOT NULL));
ALTER TABLE metadata.entity_surface ADD CONSTRAINT entity_surface_legacy_required_ck CHECK (label_id IS NOT NULL OR (title IS NOT NULL AND layout_config IS NOT NULL));
ALTER TABLE metadata.entity_surface_section ADD CONSTRAINT entity_surface_section_legacy_required_ck CHECK (label_id IS NOT NULL OR layout_config IS NOT NULL);
ALTER TABLE metadata.entity_operation ADD CONSTRAINT entity_operation_legacy_required_ck CHECK (label_id IS NOT NULL OR label IS NOT NULL);
ALTER TABLE metadata.entity_field ALTER COLUMN field_key DROP NOT NULL, ALTER COLUMN type_config DROP NOT NULL;
ALTER TABLE metadata.entity_surface ALTER COLUMN title DROP NOT NULL, ALTER COLUMN layout_config DROP NOT NULL;
ALTER TABLE metadata.entity_surface_section ALTER COLUMN layout_config DROP NOT NULL;
ALTER TABLE metadata.entity_operation ALTER COLUMN label DROP NOT NULL;
