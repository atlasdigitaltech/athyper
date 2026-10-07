-- Preserve legacy binding presence while allowing the native writer to retire it.
-- The pending binding guard still requires binding_kind IS NULL until cutover.
ALTER TABLE metadata.entity_surface_field_binding ADD CONSTRAINT entity_binding_legacy_required_ck CHECK (binding_kind IS NOT NULL OR display_config IS NOT NULL);
ALTER TABLE metadata.entity_surface_field_binding ALTER COLUMN display_config DROP NOT NULL;
