-- GENERATED target-only additive operation columns. NOT a cutover migration; legacy constraints remain.
ALTER TABLE metadata.entity_operation ADD COLUMN label_id uuid;
ALTER TABLE metadata.entity_operation ADD COLUMN input_surface_id uuid;
ALTER TABLE metadata.entity_operation ADD COLUMN result_surface_id uuid;
ALTER TABLE metadata.entity_operation ADD COLUMN authorization_target text;
ALTER TABLE metadata.entity_operation ADD COLUMN authorization_effect text;
ALTER TABLE metadata.entity_operation ADD COLUMN requires_parent_read boolean;
ALTER TABLE metadata.entity_operation ADD COLUMN requires_preflight boolean;
ALTER TABLE metadata.entity_operation ADD COLUMN replacement_operation_id uuid;
ALTER TABLE metadata.entity_operation ADD COLUMN handler_version integer;
ALTER TABLE metadata.entity_operation ADD COLUMN preflight_key text;
ALTER TABLE metadata.entity_operation ADD COLUMN preflight_version integer;
ALTER TABLE metadata.entity_operation ADD COLUMN extension_field_mode text;
ALTER TABLE metadata.entity_operation ADD COLUMN export_formats text[];
ALTER TABLE metadata.entity_operation ADD COLUMN export_max_records bigint;
ALTER TABLE metadata.entity_operation ADD CONSTRAINT entity_operation_native_pending_ck CHECK(label_id IS NULL AND input_surface_id IS NULL AND result_surface_id IS NULL AND authorization_target IS NULL AND authorization_effect IS NULL AND requires_parent_read IS NULL AND requires_preflight IS NULL AND replacement_operation_id IS NULL AND handler_version IS NULL AND preflight_key IS NULL AND preflight_version IS NULL AND extension_field_mode IS NULL AND export_formats IS NULL AND export_max_records IS NULL);
