-- ============================================================================
-- snapshot/04_indexes.sql
-- Non-constraint indexes reconstructed from the live catalog.
-- Generated from the live Neon database snapshot schema. Do not hand-edit.
-- ============================================================================

CREATE INDEX civ_item_version_desc_idx ON snapshot.content_item_version USING btree (content_item_id, version DESC);

CREATE INDEX ds_activity_log_idx ON ONLY snapshot.document_snapshot USING btree (tenant_id, activity_log_id) WHERE activity_log_id IS NOT NULL;

CREATE INDEX ds_chain_idx ON ONLY snapshot.document_snapshot USING btree (tenant_id, entity_id, chain_seq DESC);

CREATE INDEX ds_entity_recent_idx ON ONLY snapshot.document_snapshot USING btree (tenant_id, entity_type, entity_id, captured_at DESC);

CREATE INDEX ds_gate_kind_idx ON ONLY snapshot.document_snapshot USING btree (tenant_id, gate_event_kind, captured_at DESC);

CREATE INDEX document_snapshot_default_tenant_id_activity_log_id_idx ON snapshot.document_snapshot_default USING btree (tenant_id, activity_log_id) WHERE activity_log_id IS NOT NULL;

CREATE INDEX document_snapshot_default_tenant_id_entity_id_chain_seq_idx ON snapshot.document_snapshot_default USING btree (tenant_id, entity_id, chain_seq DESC);

CREATE INDEX document_snapshot_default_tenant_id_entity_type_entity_id_c_idx ON snapshot.document_snapshot_default USING btree (tenant_id, entity_type, entity_id, captured_at DESC);

CREATE INDEX document_snapshot_default_tenant_id_gate_event_kind_capture_idx ON snapshot.document_snapshot_default USING btree (tenant_id, gate_event_kind, captured_at DESC);

CREATE INDEX ec_artifact_scope_idx ON snapshot.entity_compiled USING btree (tenant_id, artifact_kind, entity_version_id);

CREATE INDEX ec_version_idx ON snapshot.entity_compiled USING btree (entity_version_id, artifact_kind);

CREATE INDEX epc_hash_lookup_idx ON snapshot.entity_plane_compiled USING btree (compiled_hash);

CREATE UNIQUE INDEX epc_version_plane_uq ON snapshot.entity_plane_compiled USING btree (entity_version_id, plane_key);

CREATE INDEX lv_lifecycle_latest_idx ON snapshot.lifecycle_version USING btree (lifecycle_id, version DESC);

CREATE INDEX sr_hash_idx ON snapshot.status_route USING btree (tenant_id, entity_name, compiled_hash);

CREATE INDEX template_version_effective_range_idx ON snapshot.template_version USING gist (tenant_id, template_id, daterange(effective_from, effective_to, '[)'::text));
