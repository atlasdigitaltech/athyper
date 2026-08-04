-- ============================================================================
-- snapshot/03_constraints.sql
-- Table constraints reconstructed from the live catalog.
-- Generated from the live Neon database snapshot schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE ONLY "snapshot"."content_item_version"
  ADD CONSTRAINT "civ_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "snapshot"."document_snapshot"
  ADD CONSTRAINT "ds_pkey" PRIMARY KEY (id, captured_at);

ALTER TABLE ONLY "snapshot"."document_snapshot_default"
  ADD CONSTRAINT "document_snapshot_default_pkey" PRIMARY KEY (id, captured_at);

ALTER TABLE ONLY "snapshot"."entity_compiled"
  ADD CONSTRAINT "ec_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "snapshot"."entity_compiled_overlay"
  ADD CONSTRAINT "eco_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "snapshot"."entity_plane_compiled"
  ADD CONSTRAINT "epc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "snapshot"."lifecycle_route"
  ADD CONSTRAINT "lr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "snapshot"."lifecycle_version"
  ADD CONSTRAINT "lv_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "snapshot"."status_route"
  ADD CONSTRAINT "sr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "snapshot"."template_version"
  ADD CONSTRAINT "template_version_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "snapshot"."content_item_version"
  ADD CONSTRAINT "civ_checksum_uq" UNIQUE (tenant_id, content_item_id, checksum);

ALTER TABLE ONLY "snapshot"."content_item_version"
  ADD CONSTRAINT "civ_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "snapshot"."content_item_version"
  ADD CONSTRAINT "civ_version_uq" UNIQUE (tenant_id, content_item_id, version);

ALTER TABLE ONLY "snapshot"."document_snapshot"
  ADD CONSTRAINT "ds_tenant_id_uq" UNIQUE (tenant_id, id, captured_at);

ALTER TABLE ONLY "snapshot"."document_snapshot_default"
  ADD CONSTRAINT "document_snapshot_default_tenant_id_id_captured_at_key" UNIQUE (tenant_id, id, captured_at);

ALTER TABLE ONLY "snapshot"."entity_compiled"
  ADD CONSTRAINT "ec_version_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, entity_version_id, artifact_kind);

ALTER TABLE ONLY "snapshot"."entity_compiled_overlay"
  ADD CONSTRAINT "eco_scope_uq" UNIQUE (tenant_id, entity_version_id, overlay_hash);

ALTER TABLE ONLY "snapshot"."lifecycle_route"
  ADD CONSTRAINT "lr_lifecycle_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, lifecycle_id);

ALTER TABLE ONLY "snapshot"."lifecycle_version"
  ADD CONSTRAINT "lv_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "snapshot"."lifecycle_version"
  ADD CONSTRAINT "lv_version_uq" UNIQUE (tenant_id, lifecycle_id, version);

ALTER TABLE ONLY "snapshot"."status_route"
  ADD CONSTRAINT "sr_entity_uq" UNIQUE (tenant_id, entity_name);

ALTER TABLE ONLY "snapshot"."template_version"
  ADD CONSTRAINT "template_version_checksum_uq" UNIQUE (tenant_id, template_id, checksum);

ALTER TABLE ONLY "snapshot"."template_version"
  ADD CONSTRAINT "template_version_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "snapshot"."content_item_version"
  ADD CONSTRAINT "civ_body_format_chk" CHECK (body_format = ANY (ARRAY['slate'::text, 'prosemirror'::text, 'html'::text, 'markdown'::text]));

ALTER TABLE ONLY "snapshot"."content_item_version"
  ADD CONSTRAINT "civ_checksum_chk" CHECK (btrim(checksum) <> ''::text);

ALTER TABLE ONLY "snapshot"."content_item_version"
  ADD CONSTRAINT "civ_version_pos" CHECK (version >= 1);

ALTER TABLE ONLY "snapshot"."document_snapshot"
  ADD CONSTRAINT "ds_capture_source_chk" CHECK (capture_source = ANY (ARRAY['transition_hook'::text, 'manual'::text, 'reconcile'::text, 'migration'::text]));

ALTER TABLE ONLY "snapshot"."document_snapshot"
  ADD CONSTRAINT "ds_chain_pos" CHECK (chain_seq >= 1);

ALTER TABLE ONLY "snapshot"."document_snapshot"
  ADD CONSTRAINT "ds_entity_type_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "snapshot"."document_snapshot"
  ADD CONSTRAINT "ds_hash_chk" CHECK (length(payload_hash) >= 64);

ALTER TABLE ONLY "snapshot"."document_snapshot"
  ADD CONSTRAINT "ds_header_json_chk" CHECK (jsonb_typeof(header_json) = 'object'::text);

ALTER TABLE ONLY "snapshot"."document_snapshot"
  ADD CONSTRAINT "ds_kind_chk" CHECK (gate_event_kind = ANY (ARRAY['authoring_lock'::text, 'commitment'::text, 'fulfillment'::text, 'financial_post'::text, 'match_decision'::text, 'amendment_baseline'::text, 'reversal'::text]));

ALTER TABLE ONLY "snapshot"."document_snapshot"
  ADD CONSTRAINT "ds_no_self_prev" CHECK (previous_snapshot_id IS DISTINCT FROM id);

ALTER TABLE ONLY "snapshot"."document_snapshot"
  ADD CONSTRAINT "ds_version_pos" CHECK (version_number >= 1);

ALTER TABLE ONLY "snapshot"."document_snapshot_default"
  ADD CONSTRAINT "ds_capture_source_chk" CHECK (capture_source = ANY (ARRAY['transition_hook'::text, 'manual'::text, 'reconcile'::text, 'migration'::text]));

ALTER TABLE ONLY "snapshot"."document_snapshot_default"
  ADD CONSTRAINT "ds_chain_pos" CHECK (chain_seq >= 1);

ALTER TABLE ONLY "snapshot"."document_snapshot_default"
  ADD CONSTRAINT "ds_entity_type_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "snapshot"."document_snapshot_default"
  ADD CONSTRAINT "ds_hash_chk" CHECK (length(payload_hash) >= 64);

ALTER TABLE ONLY "snapshot"."document_snapshot_default"
  ADD CONSTRAINT "ds_header_json_chk" CHECK (jsonb_typeof(header_json) = 'object'::text);

ALTER TABLE ONLY "snapshot"."document_snapshot_default"
  ADD CONSTRAINT "ds_kind_chk" CHECK (gate_event_kind = ANY (ARRAY['authoring_lock'::text, 'commitment'::text, 'fulfillment'::text, 'financial_post'::text, 'match_decision'::text, 'amendment_baseline'::text, 'reversal'::text]));

ALTER TABLE ONLY "snapshot"."document_snapshot_default"
  ADD CONSTRAINT "ds_no_self_prev" CHECK (previous_snapshot_id IS DISTINCT FROM id);

ALTER TABLE ONLY "snapshot"."document_snapshot_default"
  ADD CONSTRAINT "ds_version_pos" CHECK (version_number >= 1);

ALTER TABLE ONLY "snapshot"."entity_compiled"
  ADD CONSTRAINT "ec_artifact_kind_chk" CHECK (artifact_kind = ANY (ARRAY['catalog'::text, 'execution'::text]));

ALTER TABLE ONLY "snapshot"."entity_compiled"
  ADD CONSTRAINT "ec_hash_chk" CHECK (length(compiled_hash) >= 64);

ALTER TABLE ONLY "snapshot"."entity_compiled"
  ADD CONSTRAINT "ec_json_chk" CHECK (jsonb_typeof(compiled_json) = 'object'::text);

ALTER TABLE ONLY "snapshot"."entity_compiled"
  ADD CONSTRAINT "ec_report_chk" CHECK (jsonb_typeof(compliance_report) = 'object'::text);

ALTER TABLE ONLY "snapshot"."entity_compiled"
  ADD CONSTRAINT "ec_score_chk" CHECK (compliance_score IS NULL OR compliance_score >= 0::numeric AND compliance_score <= 100::numeric);

ALTER TABLE ONLY "snapshot"."entity_compiled_overlay"
  ADD CONSTRAINT "eco_base_hash_chk" CHECK (length(base_compiled_hash) >= 64);

ALTER TABLE ONLY "snapshot"."entity_compiled_overlay"
  ADD CONSTRAINT "eco_hash_chk" CHECK (length(compiled_hash) >= 64);

ALTER TABLE ONLY "snapshot"."entity_compiled_overlay"
  ADD CONSTRAINT "eco_json_chk" CHECK (jsonb_typeof(compiled_json) = 'object'::text);

ALTER TABLE ONLY "snapshot"."entity_compiled_overlay"
  ADD CONSTRAINT "eco_overlay_hash_chk" CHECK (length(overlay_hash) >= 64);

ALTER TABLE ONLY "snapshot"."entity_compiled_overlay"
  ADD CONSTRAINT "eco_set_chk" CHECK (jsonb_typeof(overlay_set) = 'array'::text);

ALTER TABLE ONLY "snapshot"."entity_plane_compiled"
  ADD CONSTRAINT "epc_hashes_chk" CHECK (contract_hash ~ '^[0-9a-f]{64}$'::text AND materialized_hash ~ '^[0-9a-f]{64}$'::text AND compiled_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "snapshot"."entity_plane_compiled"
  ADD CONSTRAINT "epc_json_chk" CHECK (jsonb_typeof(compiled_json) = 'object'::text);

ALTER TABLE ONLY "snapshot"."entity_plane_compiled"
  ADD CONSTRAINT "epc_plane_chk" CHECK (plane_key = ANY (ARRAY['admin'::text, 'neon'::text, 'mesh'::text]));

ALTER TABLE ONLY "snapshot"."lifecycle_route"
  ADD CONSTRAINT "lr_hash_chk" CHECK (length(compiled_hash) >= 64);

ALTER TABLE ONLY "snapshot"."lifecycle_route"
  ADD CONSTRAINT "lr_json_chk" CHECK (jsonb_typeof(compiled_json) = 'object'::text);

ALTER TABLE ONLY "snapshot"."lifecycle_version"
  ADD CONSTRAINT "lv_definition_chk" CHECK (jsonb_typeof(definition) = 'object'::text);

ALTER TABLE ONLY "snapshot"."lifecycle_version"
  ADD CONSTRAINT "lv_hash_chk" CHECK (length(compiled_hash) >= 64);

ALTER TABLE ONLY "snapshot"."lifecycle_version"
  ADD CONSTRAINT "lv_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "snapshot"."status_route"
  ADD CONSTRAINT "sr_entity_chk" CHECK (btrim(entity_name) <> ''::text);

ALTER TABLE ONLY "snapshot"."status_route"
  ADD CONSTRAINT "sr_hash_chk" CHECK (length(compiled_hash) >= 64);

ALTER TABLE ONLY "snapshot"."status_route"
  ADD CONSTRAINT "sr_json_chk" CHECK (jsonb_typeof(compiled_json) = 'object'::text);

ALTER TABLE ONLY "snapshot"."template_version"
  ADD CONSTRAINT "template_version_checksum_chk" CHECK (btrim(checksum) <> ''::text);

ALTER TABLE ONLY "snapshot"."template_version"
  ADD CONSTRAINT "template_version_date_order" CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "snapshot"."template_version"
  ADD CONSTRAINT "template_version_has_content" CHECK (content_html IS NOT NULL OR content_json IS NOT NULL);

ALTER TABLE ONLY "snapshot"."template_version"
  ADD CONSTRAINT "template_version_version_pos" CHECK (version >= 1);

ALTER TABLE ONLY "snapshot"."content_item_version"
  ADD CONSTRAINT "civ_content_item_fk" FOREIGN KEY (tenant_id, content_item_id) REFERENCES master.content_item(tenant_id, id);

ALTER TABLE ONLY "snapshot"."content_item_version"
  ADD CONSTRAINT "civ_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "snapshot"."content_item_version"
  ADD CONSTRAINT "civ_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "snapshot"."entity_compiled"
  ADD CONSTRAINT "ec_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "snapshot"."entity_compiled_overlay"
  ADD CONSTRAINT "eco_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "snapshot"."entity_compiled_overlay"
  ADD CONSTRAINT "eco_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "snapshot"."entity_plane_compiled"
  ADD CONSTRAINT "epc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "snapshot"."entity_plane_compiled"
  ADD CONSTRAINT "epc_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "snapshot"."lifecycle_route"
  ADD CONSTRAINT "lr_lifecycle_fk" FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle(id) ON DELETE CASCADE;

ALTER TABLE ONLY "snapshot"."lifecycle_route"
  ADD CONSTRAINT "lr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "snapshot"."lifecycle_version"
  ADD CONSTRAINT "lv_lifecycle_fk" FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "snapshot"."status_route"
  ADD CONSTRAINT "sr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "snapshot"."template_version"
  ADD CONSTRAINT "template_version_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "snapshot"."template_version"
  ADD CONSTRAINT "template_version_template_fk" FOREIGN KEY (tenant_id, template_id) REFERENCES master.template(tenant_id, id);

ALTER TABLE ONLY "snapshot"."template_version"
  ADD CONSTRAINT "template_version_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
