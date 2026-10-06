-- GENERATED dormant native authoring root columns. Not enrollment or cutover.
ALTER TABLE metadata.entity_change_set ADD COLUMN native_core_layout_version integer;
ALTER TABLE metadata.entity_change_set ADD COLUMN source_kind text;
ALTER TABLE metadata.entity_change_set ADD COLUMN schema_version integer;
ALTER TABLE metadata.entity_change_set ADD COLUMN authoring_schema_hash text;
ALTER TABLE metadata.entity_change_set ADD COLUMN entity_label_id uuid;
ALTER TABLE metadata.entity_change_set ADD COLUMN publication_resource_key text;
ALTER TABLE metadata.entity_change_set ADD COLUMN source_uri text;
ALTER TABLE metadata.entity_change_set ADD COLUMN source_hash text;
ALTER TABLE metadata.entity_change_set ADD COLUMN publication_owner text;
ALTER TABLE metadata.entity_change_set ADD COLUMN source_predecessor_release_id uuid;
ALTER TABLE metadata.entity_change_set ADD CONSTRAINT entity_change_set_native_pending_ck CHECK (native_core_layout_version IS NULL AND source_kind IS NULL AND schema_version IS NULL AND authoring_schema_hash IS NULL AND entity_label_id IS NULL AND publication_resource_key IS NULL AND source_uri IS NULL AND source_hash IS NULL AND publication_owner IS NULL AND source_predecessor_release_id IS NULL);
