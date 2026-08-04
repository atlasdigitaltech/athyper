-- ============================================================================
-- mesh_control/03_constraints.sql
-- Table constraints reconstructed from the live catalog.
-- Generated from the live Mesh database mesh_control schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."auth_entitlement_policy"
  ADD CONSTRAINT "mesh_auth_entitlement_policy_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."auth_permission_category"
  ADD CONSTRAINT "mesh_auth_permission_category_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."auth_permission_plane"
  ADD CONSTRAINT "mesh_auth_permission_plane_pkey" PRIMARY KEY (permission_id, plane_code);

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."auth_plane"
  ADD CONSTRAINT "mesh_auth_plane_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."authorization_anomaly_disposition"
  ADD CONSTRAINT "mesh_authorization_anomaly_disposition_pkey" PRIMARY KEY (finding_fingerprint);

ALTER TABLE ONLY "mesh_control"."authorization_capture_source"
  ADD CONSTRAINT "mesh_authorization_capture_source_pkey" PRIMARY KEY (source_schema, source_table);

ALTER TABLE ONLY "mesh_control"."authorization_consumer_migration_v2"
  ADD CONSTRAINT "mesh_authorization_consumer_migration_v2_pkey" PRIMARY KEY (plane_code, consumer_family);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_cohort_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_cohort_v2_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_plane_v2"
  ADD CONSTRAINT "authorization_cutover_plane_v2_pkey" PRIMARY KEY (plane_code);

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."authorization_runtime_release_v2"
  ADD CONSTRAINT "mesh_authorization_runtime_release_v2_pkey" PRIMARY KEY (plane_code);

ALTER TABLE ONLY "mesh_control"."authorization_shadow_mismatch_disposition_v2"
  ADD CONSTRAINT "authorization_shadow_mismatch_disposition_v2_pkey" PRIMARY KEY (comparison_id);

ALTER TABLE ONLY "mesh_control"."authorization_target_guard_installation_v2"
  ADD CONSTRAINT "authorization_target_guard_installation_v2_pkey" PRIMARY KEY (target_relation);

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."authorization_v2_deferred_constraint_registry"
  ADD CONSTRAINT "mesh_authorization_v2_deferred_constraint_registry_pkey" PRIMARY KEY (target_schema, target_table, constraint_name);

ALTER TABLE ONLY "mesh_control"."authorization_v2_expand_installation"
  ADD CONSTRAINT "mesh_authorization_v2_expand_installation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."authorization_v2_frozen_legacy_object"
  ADD CONSTRAINT "mesh_authorization_v2_frozen_legacy_object_pkey" PRIMARY KEY (source_schema, source_table);

ALTER TABLE ONLY "mesh_control"."authorization_v2_transformer_registry"
  ADD CONSTRAINT "mesh_authorization_v2_transformer_registry_pkey" PRIMARY KEY (source_schema, source_table, capture_contract_version, transformer_version);

ALTER TABLE ONLY "mesh_control"."authorization_v3_scope_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_scope_mapping_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."authorization_v4_legacy_exception_disposition"
  ADD CONSTRAINT "mesh_authorization_v4_exception_disposition_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."authorization_writer_registry"
  ADD CONSTRAINT "mesh_authorization_writer_registry_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."authorization_writer_switch_receipt_v2"
  ADD CONSTRAINT "authorization_writer_switch_receipt_v2_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."connector_instance"
  ADD CONSTRAINT "mesh_control_connector_instance_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."connector_type"
  ADD CONSTRAINT "mesh_control_connector_type_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."entity_operation_plane"
  ADD CONSTRAINT "mesh_auth_entity_operation_plane_pkey" PRIMARY KEY (entity_operation_id, plane_code);

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."feature_flag"
  ADD CONSTRAINT "mesh_control_feature_flag_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."notification_provider"
  ADD CONSTRAINT "mesh_control_notification_provider_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."notification_routing_rule"
  ADD CONSTRAINT "mesh_control_notification_route_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."notification_template"
  ADD CONSTRAINT "mesh_control_notification_template_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."policy_rule_version"
  ADD CONSTRAINT "mesh_control_policy_rule_version_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."preserved_identity_migration_receipt_v2"
  ADD CONSTRAINT "mesh_preserved_identity_migration_receipt_v2_pkey" PRIMARY KEY (manifest_id);

ALTER TABLE ONLY "mesh_control"."quota_policy"
  ADD CONSTRAINT "mesh_control_quota_policy_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."reference_sync_state"
  ADD CONSTRAINT "mesh_control_reference_sync_state_pkey" PRIMARY KEY (table_name);

ALTER TABLE ONLY "mesh_control"."retention_policy"
  ADD CONSTRAINT "mesh_control_retention_policy_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_code_uq" UNIQUE (owner_code);

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_scope_uq" UNIQUE (id, account_scope_key);

ALTER TABLE ONLY "mesh_control"."auth_entitlement_policy"
  ADD CONSTRAINT "mesh_auth_entitlement_policy_target_uq" UNIQUE NULLS NOT DISTINCT (product_code, capability_code, policy_version);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_exact_operation_uq" UNIQUE NULLS NOT DISTINCT (catalog_owner_id, account_scope_key, entity_id, operation_code, id);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_id_delegable_uq" UNIQUE (id, is_delegable);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_id_shareable_uq" UNIQUE (id, is_shareable);

ALTER TABLE ONLY "mesh_control"."auth_permission_category"
  ADD CONSTRAINT "mesh_auth_permission_category_code_uq" UNIQUE (code);

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_exact_uq" UNIQUE (id, permission_id, plane_code, scope_kind);

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_uq" UNIQUE (permission_id, plane_code, scope_kind);

ALTER TABLE ONLY "mesh_control"."auth_plane"
  ADD CONSTRAINT "mesh_auth_plane_code_uq" UNIQUE (plane_code);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_cohort_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_cohort_v2_code_uq" UNIQUE (plane_code, cohort_code);

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_code_uq" UNIQUE (run_code);

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_uq" UNIQUE NULLS NOT DISTINCT (migration_run_id, phase, source_relation, target_relation, source_txid);

ALTER TABLE ONLY "mesh_control"."authorization_v2_expand_installation"
  ADD CONSTRAINT "mesh_authorization_v2_expand_installation_contract_uq" UNIQUE (target_database_oid, expand_contract_version, ordered_ddl_sha256);

ALTER TABLE ONLY "mesh_control"."authorization_v3_scope_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_scope_mapping_source_uq" UNIQUE (account_id, plane_code, legacy_grant_id, source_watermark_id);

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_source_uq" UNIQUE (account_id, plane_code, principal_id, source_watermark_id);

ALTER TABLE ONLY "mesh_control"."authorization_v4_legacy_exception_disposition"
  ADD CONSTRAINT "mesh_authorization_v4_exception_disposition_source_uq" UNIQUE (account_id, source_relation, source_row_id, source_watermark_id);

ALTER TABLE ONLY "mesh_control"."authorization_writer_registry"
  ADD CONSTRAINT "mesh_authorization_writer_registry_key_uq" UNIQUE (writer_key);

ALTER TABLE ONLY "mesh_control"."authorization_writer_switch_receipt_v2"
  ADD CONSTRAINT "mesh_authorization_writer_switch_receipt_epoch_uq" UNIQUE (plane_code, writer_epoch);

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_code_uq" UNIQUE NULLS NOT DISTINCT (account_code, request_code);

ALTER TABLE ONLY "mesh_control"."connector_instance"
  ADD CONSTRAINT "mesh_control_connector_instance_code_uq" UNIQUE (account_code, code);

ALTER TABLE ONLY "mesh_control"."connector_type"
  ADD CONSTRAINT "mesh_control_connector_type_code_uq" UNIQUE (code);

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_code_uq" UNIQUE NULLS NOT DISTINCT (account_code, code);

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_code_uq" UNIQUE NULLS NOT DISTINCT (account_code, code);

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_exact_code_id_uq" UNIQUE (catalog_owner_id, account_scope_key, entity_code, id);

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_owner_scope_id_uq" UNIQUE (catalog_owner_id, account_scope_key, id);

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_id_permission_uq" UNIQUE (id, permission_id);

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_owner_entity_id_uq" UNIQUE (catalog_owner_id, account_scope_key, entity_id, id);

ALTER TABLE ONLY "mesh_control"."entity_operation_plane"
  ADD CONSTRAINT "mesh_auth_entity_operation_plane_exact_uq" UNIQUE (entity_operation_id, permission_id, plane_code);

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_uq" UNIQUE (entity_operation_id, plane_code, scope_kind, binding_kind);

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_exact_id_uq" UNIQUE (catalog_owner_id, account_scope_key, entity_id, id);

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_no_uq" UNIQUE (entity_id, version_no);

ALTER TABLE ONLY "mesh_control"."feature_flag"
  ADD CONSTRAINT "mesh_control_feature_flag_code_uq" UNIQUE (code);

ALTER TABLE ONLY "mesh_control"."notification_provider"
  ADD CONSTRAINT "mesh_control_notification_provider_code_uq" UNIQUE NULLS NOT DISTINCT (account_code, channel, code);

ALTER TABLE ONLY "mesh_control"."notification_routing_rule"
  ADD CONSTRAINT "mesh_control_notification_route_code_uq" UNIQUE NULLS NOT DISTINCT (account_code, code);

ALTER TABLE ONLY "mesh_control"."notification_template"
  ADD CONSTRAINT "mesh_control_notification_template_version_uq" UNIQUE NULLS NOT DISTINCT (account_code, template_key, channel, locale_code, version);

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_code_uq" UNIQUE NULLS NOT DISTINCT (account_code, rule_code);

ALTER TABLE ONLY "mesh_control"."policy_rule_version"
  ADD CONSTRAINT "mesh_control_policy_rule_version_uq" UNIQUE (policy_rule_id, version_no);

ALTER TABLE ONLY "mesh_control"."quota_policy"
  ADD CONSTRAINT "mesh_control_quota_policy_code_uq" UNIQUE NULLS NOT DISTINCT (account_code, code);

ALTER TABLE ONLY "mesh_control"."quota_policy"
  ADD CONSTRAINT "mesh_control_quota_policy_metric_uq" UNIQUE NULLS NOT DISTINCT (account_code, quota_subject, quota_metric);

ALTER TABLE ONLY "mesh_control"."retention_policy"
  ADD CONSTRAINT "mesh_control_retention_policy_code_uq" UNIQUE NULLS NOT DISTINCT (account_code, code);

ALTER TABLE ONLY "mesh_control"."retention_policy"
  ADD CONSTRAINT "mesh_control_retention_policy_resource_uq" UNIQUE NULLS NOT DISTINCT (account_code, resource_type);

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_code_uq" UNIQUE NULLS NOT DISTINCT (account_code, code);

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_account_chk" CHECK (owner_kind = 'platform'::text AND account_id IS NULL OR owner_kind = 'account'::text AND account_id IS NOT NULL);

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_code_chk" CHECK (owner_code ~ '^[a-z][a-z0-9_.-]{1,127}$'::text);

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_kind_chk" CHECK (owner_kind = ANY (ARRAY['platform'::text, 'account'::text]));

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_provenance_chk" CHECK (btrim(provenance_ref) <> ''::text);

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_version_chk" CHECK (catalog_version > 0);

ALTER TABLE ONLY "mesh_control"."auth_entitlement_policy"
  ADD CONSTRAINT "mesh_auth_entitlement_policy_capability_chk" CHECK (capability_code IS NULL OR capability_code ~ '^[a-z][a-z0-9_.-]{1,127}$'::text);

ALTER TABLE ONLY "mesh_control"."auth_entitlement_policy"
  ADD CONSTRAINT "mesh_auth_entitlement_policy_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."auth_entitlement_policy"
  ADD CONSTRAINT "mesh_auth_entitlement_policy_product_chk" CHECK (product_code ~ '^[a-z][a-z0-9_.-]{1,127}$'::text);

ALTER TABLE ONLY "mesh_control"."auth_entitlement_policy"
  ADD CONSTRAINT "mesh_auth_entitlement_policy_reason_chk" CHECK (btrim(reason) <> ''::text AND btrim(approval_ticket) <> ''::text);

ALTER TABLE ONLY "mesh_control"."auth_entitlement_policy"
  ADD CONSTRAINT "mesh_auth_entitlement_policy_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."auth_entitlement_policy"
  ADD CONSTRAINT "mesh_auth_entitlement_policy_version_chk" CHECK (policy_version > 0);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_capability_code_chk" CHECK (capability_code IS NULL OR capability_code ~ '^[a-z][a-z0-9_.-]{1,127}$'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_code_chk" CHECK (canonical_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_entity_operation_chk" CHECK ((entity_id IS NULL) = (operation_code IS NULL));

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_operation_code_chk" CHECK (operation_code IS NULL OR operation_code ~ '^[a-z][a-z0-9_]{0,63}$'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_product_code_chk" CHECK (product_code IS NULL OR product_code ~ '^[a-z][a-z0-9_.-]{1,127}$'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_provenance_kind_chk" CHECK (provenance_kind = ANY (ARRAY['seed'::text, 'catalog_manifest'::text, 'migration'::text, 'approved_import'::text]));

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_provenance_ref_chk" CHECK (btrim(provenance_ref) <> ''::text);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_risk_chk" CHECK (risk_tier = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]));

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_sha256_chk" CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_version_chk" CHECK (catalog_version > 0);

ALTER TABLE ONLY "mesh_control"."auth_permission_category"
  ADD CONSTRAINT "mesh_auth_permission_category_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."auth_permission_category"
  ADD CONSTRAINT "mesh_auth_permission_category_code_chk" CHECK (code ~ '^[a-z][a-z0-9_]{1,63}$'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission_category"
  ADD CONSTRAINT "mesh_auth_permission_category_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission_category"
  ADD CONSTRAINT "mesh_auth_permission_category_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."auth_permission_category"
  ADD CONSTRAINT "mesh_auth_permission_category_provenance_kind_chk" CHECK (provenance_kind = ANY (ARRAY['seed'::text, 'catalog_manifest'::text, 'migration'::text, 'approved_import'::text]));

ALTER TABLE ONLY "mesh_control"."auth_permission_category"
  ADD CONSTRAINT "mesh_auth_permission_category_provenance_ref_chk" CHECK (btrim(provenance_ref) <> ''::text);

ALTER TABLE ONLY "mesh_control"."auth_permission_category"
  ADD CONSTRAINT "mesh_auth_permission_category_sha256_chk" CHECK (definition_sha256 IS NULL OR definition_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission_category"
  ADD CONSTRAINT "mesh_auth_permission_category_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."auth_permission_category"
  ADD CONSTRAINT "mesh_auth_permission_category_version_chk" CHECK (catalog_version > 0);

ALTER TABLE ONLY "mesh_control"."auth_permission_plane"
  ADD CONSTRAINT "mesh_auth_permission_plane_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."auth_permission_plane"
  ADD CONSTRAINT "mesh_auth_permission_plane_code_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission_plane"
  ADD CONSTRAINT "mesh_auth_permission_plane_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."auth_permission_plane"
  ADD CONSTRAINT "mesh_auth_permission_plane_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission_plane"
  ADD CONSTRAINT "mesh_auth_permission_plane_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'deprecated'::text]));

ALTER TABLE ONLY "mesh_control"."auth_permission_plane"
  ADD CONSTRAINT "mesh_auth_permission_plane_version_chk" CHECK (policy_version > 0);

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_kind_chk" CHECK (scope_kind = ANY (ARRAY['account'::text, 'network_relationship'::text, 'resource'::text]));

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_plane_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_propagation_chk" CHECK (propagation_mode = ANY (ARRAY['none'::text, 'relationship_participants'::text, 'resource_only'::text]));

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_provenance_chk" CHECK (btrim(provenance_ref) <> ''::text);

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_resource_chk" CHECK (propagation_mode = 'none'::text OR propagation_mode = 'relationship_participants'::text AND scope_kind = 'network_relationship'::text OR propagation_mode = 'resource_only'::text AND scope_kind = 'resource'::text AND requires_resource_scope);

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_policy_version_chk" CHECK (policy_version > 0);

ALTER TABLE ONLY "mesh_control"."auth_plane"
  ADD CONSTRAINT "mesh_auth_plane_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."auth_plane"
  ADD CONSTRAINT "mesh_auth_plane_code_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."auth_plane"
  ADD CONSTRAINT "mesh_auth_plane_contract_version_chk" CHECK (auth_contract_version > 0);

ALTER TABLE ONLY "mesh_control"."auth_plane"
  ADD CONSTRAINT "mesh_auth_plane_entitlement_chk" CHECK (entitlement_semantics = 'product_and_account_eligibility'::text);

ALTER TABLE ONLY "mesh_control"."auth_plane"
  ADD CONSTRAINT "mesh_auth_plane_manifest_chk" CHECK (jsonb_typeof(capability_manifest) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."auth_plane"
  ADD CONSTRAINT "mesh_auth_plane_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."auth_plane"
  ADD CONSTRAINT "mesh_auth_plane_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_anomaly_disposition"
  ADD CONSTRAINT "mesh_authorization_anomaly_disposition_class_chk" CHECK (classification = ANY (ARRAY['repair_before_backfill'::text, 'quarantine'::text, 'intentional_cross_account'::text, 'intentional_platform_reference'::text, 'false_positive'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_anomaly_disposition"
  ADD CONSTRAINT "mesh_authorization_anomaly_disposition_evidence_chk" CHECK (jsonb_typeof(evidence) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."authorization_anomaly_disposition"
  ADD CONSTRAINT "mesh_authorization_anomaly_disposition_fingerprint_chk" CHECK (finding_fingerprint ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_anomaly_disposition"
  ADD CONSTRAINT "mesh_authorization_anomaly_disposition_kind_chk" CHECK (btrim(finding_kind) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_anomaly_disposition"
  ADD CONSTRAINT "mesh_authorization_anomaly_disposition_pk_chk" CHECK (source_primary_key IS NULL OR jsonb_typeof(source_primary_key) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."authorization_anomaly_disposition"
  ADD CONSTRAINT "mesh_authorization_anomaly_disposition_reason_chk" CHECK (btrim(reason) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_anomaly_disposition"
  ADD CONSTRAINT "mesh_authorization_anomaly_disposition_resolution_chk" CHECK (resolved_at IS NULL OR resolved_at >= approved_at);

ALTER TABLE ONLY "mesh_control"."authorization_anomaly_disposition"
  ADD CONSTRAINT "mesh_authorization_anomaly_disposition_scope_pair_chk" CHECK ((observed_scope_kind IS NULL AND observed_scope_value IS NULL OR observed_scope_kind = 'global'::text AND observed_scope_value IS NULL OR (observed_scope_kind = ANY (ARRAY['account_id'::text, 'account_code'::text, 'account_pair'::text])) AND observed_scope_value IS NOT NULL) AND (referenced_scope_kind IS NULL AND referenced_scope_value IS NULL OR referenced_scope_kind = 'global'::text AND referenced_scope_value IS NULL OR (referenced_scope_kind = ANY (ARRAY['account_id'::text, 'account_code'::text, 'account_pair'::text])) AND referenced_scope_value IS NOT NULL));

ALTER TABLE ONLY "mesh_control"."authorization_anomaly_disposition"
  ADD CONSTRAINT "mesh_authorization_anomaly_disposition_severity_chk" CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'high'::text, 'critical'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_anomaly_disposition"
  ADD CONSTRAINT "mesh_authorization_anomaly_disposition_source_chk" CHECK (source_schema ~ '^[a-z][a-z0-9_]*$'::text AND source_table ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_capture_source"
  ADD CONSTRAINT "mesh_authorization_capture_source_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."authorization_capture_source"
  ADD CONSTRAINT "mesh_authorization_capture_source_kind_chk" CHECK (source_kind = ANY (ARRAY['catalog'::text, 'identity'::text, 'authority'::text, 'scope'::text, 'record_acl'::text, 'rollout'::text, 'metadata'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_capture_source"
  ADD CONSTRAINT "mesh_authorization_capture_source_pk_chk" CHECK (cardinality(primary_key_columns) > 0 AND array_position(primary_key_columns, ''::text) IS NULL);

ALTER TABLE ONLY "mesh_control"."authorization_capture_source"
  ADD CONSTRAINT "mesh_authorization_capture_source_redaction_chk" CHECK (array_position(redacted_columns, ''::text) IS NULL);

ALTER TABLE ONLY "mesh_control"."authorization_capture_source"
  ADD CONSTRAINT "mesh_authorization_capture_source_retention_chk" CHECK (retention_days >= 30);

ALTER TABLE ONLY "mesh_control"."authorization_capture_source"
  ADD CONSTRAINT "mesh_authorization_capture_source_schema_chk" CHECK (source_schema ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_capture_source"
  ADD CONSTRAINT "mesh_authorization_capture_source_scope_columns_chk" CHECK (array_position(scope_columns, ''::text) IS NULL AND (scope_kind = 'global'::text AND cardinality(scope_columns) = 0 OR (scope_kind = ANY (ARRAY['account_id'::text, 'account_code'::text])) AND cardinality(scope_columns) = 1 OR scope_kind = 'account_pair'::text AND cardinality(scope_columns) = 2));

ALTER TABLE ONLY "mesh_control"."authorization_capture_source"
  ADD CONSTRAINT "mesh_authorization_capture_source_scope_kind_chk" CHECK (scope_kind = ANY (ARRAY['global'::text, 'account_id'::text, 'account_code'::text, 'account_pair'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_capture_source"
  ADD CONSTRAINT "mesh_authorization_capture_source_table_chk" CHECK (source_table ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_consumer_migration_v2"
  ADD CONSTRAINT "mesh_authorization_consumer_migration_v2_family_chk" CHECK (consumer_family = ANY (ARRAY['metadata'::text, 'records'::text, 'workflow'::text, 'documents'::text, 'session'::text, 'ai'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_consumer_migration_v2"
  ADD CONSTRAINT "mesh_authorization_consumer_migration_v2_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."authorization_consumer_migration_v2"
  ADD CONSTRAINT "mesh_authorization_consumer_migration_v2_plane_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."authorization_consumer_migration_v2"
  ADD CONSTRAINT "mesh_authorization_consumer_migration_v2_state_chk" CHECK (enforcement_state = ANY (ARRAY['not_started'::text, 'shadow'::text, 'enforced'::text, 'verified'::text, 'rolled_back'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_consumer_migration_v2"
  ADD CONSTRAINT "mesh_authorization_consumer_migration_v2_verified_chk" CHECK (enforcement_state <> 'verified'::text OR exact_catalog_ids_only AND approved_at IS NOT NULL AND btrim(COALESCE(approved_by, ''::text)) <> ''::text AND btrim(COALESCE(verification_report_ref, ''::text)) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_cohort_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_cohort_v2_code_chk" CHECK (cohort_code ~ '^[a-z][a-z0-9_.-]{2,127}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_cohort_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_cohort_v2_hash_chk" CHECK (golden_corpus_sha256 ~ '^[0-9a-f]{64}$'::text AND (active_user_parity_sha256 IS NULL OR active_user_parity_sha256 ~ '^[0-9a-f]{64}$'::text));

ALTER TABLE ONLY "mesh_control"."authorization_cutover_cohort_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_cohort_v2_path_chk" CHECK (cardinality(consumer_paths) > 0 AND consumer_paths <@ ARRAY['single'::text, 'batch'::text, 'session'::text, 'mesh'::text, 'workflow'::text, 'company_scope'::text, 'acl'::text]);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_cohort_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_cohort_v2_permission_chk" CHECK (cardinality(permission_codes) > 0 AND array_position(permission_codes, ''::text) IS NULL);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_cohort_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_cohort_v2_plane_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_cohort_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_cohort_v2_retired_chk" CHECK (state <> 'retired'::text AND retired_at IS NULL AND retired_by IS NULL OR state = 'retired'::text AND retired_at IS NOT NULL AND retired_by IS NOT NULL);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_cohort_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_cohort_v2_state_chk" CHECK (state = ANY (ARRAY['shadow'::text, 'enforce'::text, 'rolled_back'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_cutover_cohort_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_cohort_v2_transition_chk" CHECK (last_transition_ticket IS NULL AND last_transition_at IS NULL AND last_transition_by IS NULL OR last_transition_ticket IS NOT NULL AND last_transition_at IS NOT NULL AND last_transition_by IS NOT NULL);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_cohort_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_cohort_v2_watermark_chk" CHECK (minimum_applied_watermark >= 0);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_cohort_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_cohort_v2_window_chk" CHECK (observation_window_ends_at > effective_from AND approved_at <= effective_from);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_plane_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_plane_v2_epoch_chk" CHECK (writer_epoch >= 0 AND maximum_shadow_lag >= 0);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_plane_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_plane_v2_observation_chk" CHECK (observation_completed_at IS NULL OR observation_window_ends_at IS NOT NULL AND observation_completed_at >= observation_window_ends_at);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_plane_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_plane_v2_plane_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_plane_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_plane_v2_resolver_chk" CHECK (resolver_state = ANY (ARRAY['legacy'::text, 'shadow'::text, 'cohort_enforce'::text, 'all_enforce'::text, 'observation_complete'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_cutover_plane_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_plane_v2_reverse_chk" CHECK ((reverse_projector_status = ANY (ARRAY['none'::text, 'reviewed'::text, 'tested'::text, 'active'::text, 'retired'::text])) AND (reverse_projector_evidence_sha256 IS NULL OR reverse_projector_evidence_sha256 ~ '^[0-9a-f]{64}$'::text) AND (NOT instant_rollback_promised OR (reverse_projector_status = ANY (ARRAY['tested'::text, 'active'::text]))));

ALTER TABLE ONLY "mesh_control"."authorization_cutover_plane_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_plane_v2_target_writer_chk" CHECK (writer_authority <> 'target'::text OR (resolver_state = ANY (ARRAY['all_enforce'::text, 'observation_complete'::text])) AND legacy_write_frozen AND freeze_source_watermark = freeze_applied_watermark);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_plane_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_plane_v2_watermark_chk" CHECK (legacy_write_frozen = (legacy_write_frozen_at IS NOT NULL) AND (freeze_source_watermark IS NULL) = (freeze_applied_watermark IS NULL) AND COALESCE(freeze_source_watermark, 0::bigint) >= 0 AND COALESCE(freeze_applied_watermark, 0::bigint) >= 0);

ALTER TABLE ONLY "mesh_control"."authorization_cutover_plane_v2"
  ADD CONSTRAINT "mesh_authorization_cutover_plane_v2_writer_chk" CHECK (writer_authority = ANY (ARRAY['legacy'::text, 'target'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_approval_chk" CHECK (status = 'draft'::text OR approval_ticket IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL);

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_approved_window_chk" CHECK (status = 'draft'::text OR observation_started_at IS NOT NULL AND observation_ends_at IS NOT NULL);

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_capture_version_chk" CHECK (btrim(capture_contract_version) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_code_chk" CHECK (run_code ~ '^[a-z0-9][a-z0-9_.-]{2,127}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_manifest_chk" CHECK (snapshot_manifest_uri IS NULL AND snapshot_manifest_sha256 IS NULL OR snapshot_manifest_uri IS NOT NULL AND snapshot_manifest_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_objectives_chk" CHECK (authorization_rpo_seconds >= 0 AND authorization_rto_minutes > 0 AND (business_data_rpo_seconds IS NULL OR business_data_rpo_seconds >= 0) AND (business_data_rto_minutes IS NULL OR business_data_rto_minutes > 0));

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_observation_chk" CHECK (observation_started_at IS NULL AND observation_ends_at IS NULL OR observation_started_at IS NOT NULL AND observation_ends_at IS NOT NULL AND observation_ends_at > observation_started_at);

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_plane_chk" CHECK (plane_key = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_rollback_owner_chk" CHECK (btrim(rollback_owner) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'capturing'::text, 'backfilling'::text, 'replaying'::text, 'shadowing'::text, 'cutover_ready'::text, 'cutover'::text, 'observing'::text, 'rolled_back'::text, 'completed'::text, 'aborted'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_watermark_chk" CHECK (COALESCE(snapshot_watermark, 0::bigint) >= 0 AND COALESCE(last_applied_watermark, 0::bigint) >= 0 AND COALESCE(cutover_watermark, 0::bigint) >= 0 AND COALESCE(rollback_watermark, 0::bigint) >= 0);

ALTER TABLE ONLY "mesh_control"."authorization_migration_run"
  ADD CONSTRAINT "mesh_authorization_migration_run_watermark_order_chk" CHECK (snapshot_watermark IS NULL OR cutover_watermark IS NULL OR cutover_watermark >= snapshot_watermark);

ALTER TABLE ONLY "mesh_control"."authorization_runtime_release_v2"
  ADD CONSTRAINT "mesh_authorization_runtime_release_v2_activation_chk" CHECK (release_state = 'shadow'::text AND activated_at IS NULL AND activation_approval_ref IS NULL OR release_state <> 'shadow'::text AND activated_at IS NOT NULL AND btrim(COALESCE(activation_approval_ref, ''::text)) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_runtime_release_v2"
  ADD CONSTRAINT "mesh_authorization_runtime_release_v2_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."authorization_runtime_release_v2"
  ADD CONSTRAINT "mesh_authorization_runtime_release_v2_catalog_sha_chk" CHECK (catalog_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_runtime_release_v2"
  ADD CONSTRAINT "mesh_authorization_runtime_release_v2_catalog_version_chk" CHECK (catalog_version > 0);

ALTER TABLE ONLY "mesh_control"."authorization_runtime_release_v2"
  ADD CONSTRAINT "mesh_authorization_runtime_release_v2_contract_chk" CHECK (evaluator_contract_version = 'wave4.canonical-evaluator.v1'::text AND runtime_contract_version = 'wave5.canonical-runtime.v1'::text AND session_contract_version = 'wave5.authorization-session.v2'::text);

ALTER TABLE ONLY "mesh_control"."authorization_runtime_release_v2"
  ADD CONSTRAINT "mesh_authorization_runtime_release_v2_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."authorization_runtime_release_v2"
  ADD CONSTRAINT "mesh_authorization_runtime_release_v2_plane_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."authorization_runtime_release_v2"
  ADD CONSTRAINT "mesh_authorization_runtime_release_v2_revision_chk" CHECK (btrim(evaluator_revision) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_runtime_release_v2"
  ADD CONSTRAINT "mesh_authorization_runtime_release_v2_rollback_owner_chk" CHECK (btrim(rollback_owner) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_runtime_release_v2"
  ADD CONSTRAINT "mesh_authorization_runtime_release_v2_state_chk" CHECK (release_state = ANY (ARRAY['shadow'::text, 'active'::text, 'rollback'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_shadow_mismatch_disposition_v2"
  ADD CONSTRAINT "mesh_authorization_shadow_mismatch_approval_chk" CHECK (disposition = 'unreviewed'::text OR btrim(COALESCE(reason, ''::text)) <> ''::text AND btrim(COALESCE(remediation_ticket, ''::text)) <> ''::text AND approved_by IS NOT NULL AND approved_at IS NOT NULL);

ALTER TABLE ONLY "mesh_control"."authorization_shadow_mismatch_disposition_v2"
  ADD CONSTRAINT "mesh_authorization_shadow_mismatch_class_chk" CHECK (cardinality(mismatch_classes) > 0 AND mismatch_classes <@ ARRAY['capability'::text, 'scope'::text, 'precedence'::text, 'plane'::text, 'entitlement'::text, 'operation_mapping'::text, 'delegation'::text, 'acl'::text, 'data_defect'::text]);

ALTER TABLE ONLY "mesh_control"."authorization_shadow_mismatch_disposition_v2"
  ADD CONSTRAINT "mesh_authorization_shadow_mismatch_disposition_chk" CHECK (disposition = ANY (ARRAY['unreviewed'::text, 'expected'::text, 'bug'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_shadow_mismatch_disposition_v2"
  ADD CONSTRAINT "mesh_authorization_shadow_mismatch_evidence_chk" CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_shadow_mismatch_disposition_v2"
  ADD CONSTRAINT "mesh_authorization_shadow_mismatch_plane_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."authorization_shadow_mismatch_disposition_v2"
  ADD CONSTRAINT "mesh_authorization_shadow_mismatch_risk_chk" CHECK (risk_class = ANY (ARRAY['low'::text, 'high'::text, 'critical'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_target_guard_installation_v2"
  ADD CONSTRAINT "mesh_authorization_target_guard_installation_plane_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."authorization_target_guard_installation_v2"
  ADD CONSTRAINT "mesh_authorization_target_guard_installation_sha_chk" CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_target_guard_installation_v2"
  ADD CONSTRAINT "mesh_authorization_target_guard_installation_status_chk" CHECK (status = ANY (ARRAY['installed'::text, 'validated'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_target_guard_installation_v2"
  ADD CONSTRAINT "mesh_authorization_target_guard_installation_validation_chk" CHECK (status <> 'validated'::text AND validation_ticket IS NULL AND validated_at IS NULL AND validated_by IS NULL OR status = 'validated'::text AND validation_ticket IS NOT NULL AND validated_at IS NOT NULL AND validated_by IS NOT NULL OR status = 'retired'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_count_chk" CHECK (source_count >= 0 AND target_count >= 0 AND quarantined_count >= 0 AND rejected_count >= 0 AND source_count = (target_count + quarantined_count + rejected_count));

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_details_chk" CHECK (jsonb_typeof(details) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_hash_chk" CHECK (source_sha256 ~ '^[0-9a-f]{64}$'::text AND target_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_phase_chk" CHECK (phase = ANY (ARRAY['snapshot'::text, 'replay'::text, 'continuous_sync'::text, 'compare'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_reconciled_chk" CHECK ((status <> ALL (ARRAY['reconciled'::text, 'approved_exception'::text])) OR approval_ticket IS NOT NULL AND btrim(approval_ticket) <> ''::text AND reconciled_at IS NOT NULL AND reconciled_by IS NOT NULL);

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_relation_chk" CHECK (source_relation ~ '^(mesh|mesh_control)\.[a-z][a-z0-9_]*$'::text AND target_relation ~ '^(mesh|mesh_control)\.[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_status_chk" CHECK (status = ANY (ARRAY['observed'::text, 'reconciled'::text, 'mismatch'::text, 'approved_exception'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_transformer_chk" CHECK (transformer_version ~ '^wave1\.mesh-authz-transform\.v[0-9]+$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_txid_chk" CHECK (source_txid IS NULL OR source_txid > 0);

ALTER TABLE ONLY "mesh_control"."authorization_v2_deferred_constraint_registry"
  ADD CONSTRAINT "mesh_authorization_v2_deferred_constraint_registry_reason_chk" CHECK (btrim(defer_reason) <> ''::text AND btrim(owner_team) <> ''::text AND btrim(approval_ticket) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_deferred_constraint_registry"
  ADD CONSTRAINT "mesh_authorization_v2_deferred_constraint_registry_status_chk" CHECK (validation_status = ANY (ARRAY['pending'::text, 'validating'::text, 'validated'::text, 'failed'::text, 'waived'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v2_deferred_constraint_registry"
  ADD CONSTRAINT "mesh_authorization_v2_deferred_constraint_registry_type_chk" CHECK (constraint_type = ANY (ARRAY['c'::bpchar, 'f'::bpchar]));

ALTER TABLE ONLY "mesh_control"."authorization_v2_deferred_constraint_registry"
  ADD CONSTRAINT "mesh_authz_v2_deferred_constraint_registry_definition_chk" CHECK (btrim(expected_definition) <> ''::text AND expected_definition_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_deferred_constraint_registry"
  ADD CONSTRAINT "mesh_authz_v2_deferred_constraint_registry_identifier_chk" CHECK ((target_schema = ANY (ARRAY['mesh_control'::text, 'mesh'::text, 'mesh_log'::text])) AND target_table ~ '^[a-z][a-z0-9_]*$'::text AND constraint_name ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_deferred_constraint_registry"
  ADD CONSTRAINT "mesh_authz_v2_deferred_constraint_registry_validation_chk" CHECK (validation_status <> 'validated'::text OR validated_at IS NOT NULL AND validated_by IS NOT NULL);

ALTER TABLE ONLY "mesh_control"."authorization_v2_expand_installation"
  ADD CONSTRAINT "mesh_authorization_v2_expand_installation_database_chk" CHECK (btrim(target_database_name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_expand_installation"
  ADD CONSTRAINT "mesh_authorization_v2_expand_installation_ddl_chk" CHECK (jsonb_typeof(ordered_ddl) = 'array'::text AND jsonb_array_length(ordered_ddl) > 0);

ALTER TABLE ONLY "mesh_control"."authorization_v2_expand_installation"
  ADD CONSTRAINT "mesh_authorization_v2_expand_installation_sha_chk" CHECK (ordered_ddl_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_expand_installation"
  ADD CONSTRAINT "mesh_authorization_v2_expand_installation_source_pair_chk" CHECK ((source_database_id IS NULL) = (capture_contract_version IS NULL));

ALTER TABLE ONLY "mesh_control"."authorization_v2_expand_installation"
  ADD CONSTRAINT "mesh_authorization_v2_expand_installation_ticket_chk" CHECK (btrim(approval_ticket) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_expand_installation"
  ADD CONSTRAINT "mesh_authorization_v2_expand_installation_version_chk" CHECK (expand_contract_version ~ '^wave1\.mesh-authz-v2-expand\.v[0-9]+$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_frozen_legacy_object"
  ADD CONSTRAINT "mesh_authorization_v2_frozen_legacy_object_frozen_chk" CHECK (status = 'declared'::text OR object_contract_sha256 IS NOT NULL AND frozen_at IS NOT NULL AND frozen_by IS NOT NULL AND approval_ticket IS NOT NULL AND btrim(approval_ticket) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_frozen_legacy_object"
  ADD CONSTRAINT "mesh_authorization_v2_frozen_legacy_object_hash_chk" CHECK (object_contract_sha256 IS NULL OR object_contract_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_frozen_legacy_object"
  ADD CONSTRAINT "mesh_authorization_v2_frozen_legacy_object_identifier_chk" CHECK (source_schema = 'mesh'::text AND source_table ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_frozen_legacy_object"
  ADD CONSTRAINT "mesh_authorization_v2_frozen_legacy_object_kind_chk" CHECK (source_kind = ANY (ARRAY['catalog'::text, 'identity'::text, 'authority'::text, 'scope'::text, 'record_acl'::text, 'rollout'::text, 'metadata'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v2_frozen_legacy_object"
  ADD CONSTRAINT "mesh_authorization_v2_frozen_legacy_object_policy_chk" CHECK (freeze_policy = 'no_new_feature_reads_or_writes'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_frozen_legacy_object"
  ADD CONSTRAINT "mesh_authorization_v2_frozen_legacy_object_status_chk" CHECK (status = ANY (ARRAY['declared'::text, 'frozen'::text, 'exception'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v2_frozen_legacy_object"
  ADD CONSTRAINT "mesh_authorization_v2_frozen_legacy_object_version_chk" CHECK (freeze_contract_version = 'wave1.mesh-authz-legacy-freeze.v1'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_transformer_registry"
  ADD CONSTRAINT "mesh_authorization_v2_transformer_registry_approval_chk" CHECK (status <> 'approved'::text OR approval_ticket IS NOT NULL AND btrim(approval_ticket) <> ''::text AND approved_by IS NOT NULL AND approved_at IS NOT NULL);

ALTER TABLE ONLY "mesh_control"."authorization_v2_transformer_registry"
  ADD CONSTRAINT "mesh_authorization_v2_transformer_registry_disposition_chk" CHECK (disposition = ANY (ARRAY['map'::text, 'quarantine'::text, 'approved_noop'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v2_transformer_registry"
  ADD CONSTRAINT "mesh_authorization_v2_transformer_registry_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."authorization_v2_transformer_registry"
  ADD CONSTRAINT "mesh_authorization_v2_transformer_registry_key_chk" CHECK (transformer_key ~ '^[a-z][a-z0-9_.-]{2,127}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_transformer_registry"
  ADD CONSTRAINT "mesh_authorization_v2_transformer_registry_sha_chk" CHECK (transformer_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v2_transformer_registry"
  ADD CONSTRAINT "mesh_authorization_v2_transformer_registry_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v2_transformer_registry"
  ADD CONSTRAINT "mesh_authorization_v2_transformer_registry_version_chk" CHECK (btrim(capture_contract_version) <> ''::text AND transformer_version ~ '^wave1\.mesh-authz-transform\.v[0-9]+$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v3_scope_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_scope_mapping_anomaly_chk" CHECK (status = 'anomaly'::text AND anomaly_code IS NOT NULL OR status <> 'anomaly'::text AND anomaly_code IS NULL);

ALTER TABLE ONLY "mesh_control"."authorization_v3_scope_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_scope_mapping_disposition_chk" CHECK (disposition = ANY (ARRAY['scoped_group_role'::text, 'explicit_override'::text, 'retired'::text, 'anomaly'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v3_scope_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_scope_mapping_evidence_chk" CHECK (jsonb_typeof(evidence) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v3_scope_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_scope_mapping_exact_target_chk" CHECK (disposition = 'scoped_group_role'::text AND legacy_scope_kind IS NOT NULL AND legacy_scope_ref_id IS NOT NULL AND target_scope_id IS NOT NULL AND target_group_role_id IS NOT NULL AND target_override_id IS NULL OR disposition = 'explicit_override'::text AND target_scope_id IS NOT NULL AND target_group_role_id IS NULL AND target_override_id IS NOT NULL OR (disposition = ANY (ARRAY['retired'::text, 'anomaly'::text])) AND target_scope_id IS NULL AND target_group_role_id IS NULL AND target_override_id IS NULL);

ALTER TABLE ONLY "mesh_control"."authorization_v3_scope_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_scope_mapping_kind_chk" CHECK (legacy_scope_kind IS NULL OR (legacy_scope_kind = ANY (ARRAY['account'::text, 'network_relationship'::text, 'resource'::text])));

ALTER TABLE ONLY "mesh_control"."authorization_v3_scope_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_scope_mapping_plane_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v3_scope_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_scope_mapping_status_chk" CHECK (status = ANY (ARRAY['staged'::text, 'validated'::text, 'applied'::text, 'anomaly'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_anomaly_chk" CHECK (status = 'anomaly'::text AND anomaly_code IS NOT NULL OR status <> 'anomaly'::text AND anomaly_code IS NULL);

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_approval_chk" CHECK (btrim(approval_ticket) <> ''::text AND btrim(mapping_reason) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_disposition_chk" CHECK (disposition = ANY (ARRAY['mapped'::text, 'quarantined_zero_grant'::text, 'excluded_non_human'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_evidence_chk" CHECK (jsonb_typeof(evidence) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_plane_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_sha_chk" CHECK (source_row_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_status_chk" CHECK (status = ANY (ARRAY['staged'::text, 'validated'::text, 'applied'::text, 'anomaly'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_target_chk" CHECK ((disposition = ANY (ARRAY['mapped'::text, 'quarantined_zero_grant'::text])) AND target_membership_id IS NOT NULL AND cardinality(target_group_ids) > 0 OR (disposition = ANY (ARRAY['excluded_non_human'::text, 'retired'::text])) AND target_membership_id IS NULL AND cardinality(target_group_ids) = 0);

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_validation_chk" CHECK ((validated_at IS NULL) = (validated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."authorization_v4_legacy_exception_disposition"
  ADD CONSTRAINT "mesh_authorization_v4_exception_disposition_anomaly_chk" CHECK (status = 'anomaly'::text AND anomaly_code IS NOT NULL OR status <> 'anomaly'::text AND anomaly_code IS NULL);

ALTER TABLE ONLY "mesh_control"."authorization_v4_legacy_exception_disposition"
  ADD CONSTRAINT "mesh_authorization_v4_exception_disposition_class_chk" CHECK (classification = ANY (ARRAY['account_membership'::text, 'record_acl'::text, 'delegation'::text, 'principal_deny'::text, 'group_deny'::text, 'principal_allow_override'::text, 'intentionally_retired'::text, 'quarantined'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v4_legacy_exception_disposition"
  ADD CONSTRAINT "mesh_authorization_v4_exception_disposition_evidence_chk" CHECK (jsonb_typeof(evidence) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."authorization_v4_legacy_exception_disposition"
  ADD CONSTRAINT "mesh_authorization_v4_exception_disposition_reason_chk" CHECK (btrim(reason) <> ''::text AND affected_user_diff_count >= 0);

ALTER TABLE ONLY "mesh_control"."authorization_v4_legacy_exception_disposition"
  ADD CONSTRAINT "mesh_authorization_v4_exception_disposition_relation_chk" CHECK (source_relation = ANY (ARRAY['mesh.attachment_acl'::text, 'mesh.content_item_access_grant'::text, 'mesh.conversation_participant'::text, 'mesh.account_grant'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v4_legacy_exception_disposition"
  ADD CONSTRAINT "mesh_authorization_v4_exception_disposition_review_chk" CHECK ((status = ANY (ARRAY['reviewed'::text, 'applied'::text])) AND legacy_decision_sha256 IS NOT NULL AND canonical_decision_sha256 IS NOT NULL AND affected_user_diff_count = 0 AND approval_ticket IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL OR (status = ANY (ARRAY['staged'::text, 'anomaly'::text])));

ALTER TABLE ONLY "mesh_control"."authorization_v4_legacy_exception_disposition"
  ADD CONSTRAINT "mesh_authorization_v4_exception_disposition_sha_chk" CHECK (source_row_sha256 ~ '^[0-9a-f]{64}$'::text AND (legacy_decision_sha256 IS NULL OR legacy_decision_sha256 ~ '^[0-9a-f]{64}$'::text) AND (canonical_decision_sha256 IS NULL OR canonical_decision_sha256 ~ '^[0-9a-f]{64}$'::text));

ALTER TABLE ONLY "mesh_control"."authorization_v4_legacy_exception_disposition"
  ADD CONSTRAINT "mesh_authorization_v4_exception_disposition_status_chk" CHECK (status = ANY (ARRAY['staged'::text, 'reviewed'::text, 'applied'::text, 'anomaly'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_v4_legacy_exception_disposition"
  ADD CONSTRAINT "mesh_authorization_v4_exception_disposition_target_chk" CHECK ((classification = ANY (ARRAY['intentionally_retired'::text, 'quarantined'::text])) AND target_relation IS NULL AND cardinality(target_row_ids) = 0 OR (classification <> ALL (ARRAY['intentionally_retired'::text, 'quarantined'::text])) AND target_relation IS NOT NULL AND btrim(target_relation) <> ''::text AND cardinality(target_row_ids) > 0);

ALTER TABLE ONLY "mesh_control"."authorization_writer_registry"
  ADD CONSTRAINT "mesh_authorization_writer_registry_approval_chk" CHECK (status <> 'approved'::text OR approval_ticket IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL);

ALTER TABLE ONLY "mesh_control"."authorization_writer_registry"
  ADD CONSTRAINT "mesh_authorization_writer_registry_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."authorization_writer_registry"
  ADD CONSTRAINT "mesh_authorization_writer_registry_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."authorization_writer_registry"
  ADD CONSTRAINT "mesh_authorization_writer_registry_key_chk" CHECK (writer_key ~ '^[a-z][a-z0-9_.-]{2,127}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_writer_registry"
  ADD CONSTRAINT "mesh_authorization_writer_registry_operations_chk" CHECK (cardinality(allowed_operations) > 0 AND allowed_operations <@ ARRAY['I'::text, 'U'::text, 'D'::text, 'T'::text]);

ALTER TABLE ONLY "mesh_control"."authorization_writer_registry"
  ADD CONSTRAINT "mesh_authorization_writer_registry_path_chk" CHECK (btrim(write_path) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_writer_registry"
  ADD CONSTRAINT "mesh_authorization_writer_registry_patterns_chk" CHECK (btrim(db_role_pattern) <> ''::text AND btrim(application_name_pattern) <> ''::text AND btrim(source_schema_pattern) <> ''::text AND btrim(source_table_pattern) <> ''::text);

ALTER TABLE ONLY "mesh_control"."authorization_writer_registry"
  ADD CONSTRAINT "mesh_authorization_writer_registry_priority_chk" CHECK (priority >= 0);

ALTER TABLE ONLY "mesh_control"."authorization_writer_registry"
  ADD CONSTRAINT "mesh_authorization_writer_registry_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."authorization_writer_switch_receipt_v2"
  ADD CONSTRAINT "mesh_authorization_writer_switch_receipt_hash_chk" CHECK (gate_evidence_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."authorization_writer_switch_receipt_v2"
  ADD CONSTRAINT "mesh_authorization_writer_switch_receipt_plane_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."authorization_writer_switch_receipt_v2"
  ADD CONSTRAINT "mesh_authorization_writer_switch_receipt_rollback_chk" CHECK ((reverse_projector_status = ANY (ARRAY['none'::text, 'reviewed'::text, 'tested'::text, 'active'::text, 'retired'::text])) AND (NOT instant_rollback_promised OR (reverse_projector_status = ANY (ARRAY['tested'::text, 'active'::text])) AND reverse_projector_evidence_sha256 ~ '^[0-9a-f]{64}$'::text));

ALTER TABLE ONLY "mesh_control"."authorization_writer_switch_receipt_v2"
  ADD CONSTRAINT "mesh_authorization_writer_switch_receipt_watermark_chk" CHECK (writer_epoch > 0 AND source_watermark = applied_watermark AND switched_at >= freeze_started_at);

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_applied_chk" CHECK (applied_at IS NULL OR status = 'applied'::text);

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_code_chk" CHECK (btrim(request_code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_payload_chk" CHECK (jsonb_typeof(payload) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_review_pair_chk" CHECK ((reviewed_by_principal_id IS NULL) = (reviewed_at IS NULL));

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_status_chk" CHECK (status = ANY (ARRAY['submitted'::text, 'pending_review'::text, 'approved'::text, 'rejected'::text, 'applied'::text, 'cancelled'::text]));

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_target_chk" CHECK (btrim(target_table) <> ''::text);

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_type_chk" CHECK (change_type = ANY (ARRAY['create'::text, 'update'::text, 'disable'::text, 'enable'::text, 'delete'::text, 'rotate_secret'::text]));

ALTER TABLE ONLY "mesh_control"."connector_instance"
  ADD CONSTRAINT "mesh_control_connector_instance_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."connector_instance"
  ADD CONSTRAINT "mesh_control_connector_instance_config_chk" CHECK (jsonb_typeof(config) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."connector_instance"
  ADD CONSTRAINT "mesh_control_connector_instance_direction_chk" CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text, 'both'::text]));

ALTER TABLE ONLY "mesh_control"."connector_instance"
  ADD CONSTRAINT "mesh_control_connector_instance_health_chk" CHECK (health = ANY (ARRAY['unknown'::text, 'healthy'::text, 'degraded'::text, 'down'::text]));

ALTER TABLE ONLY "mesh_control"."connector_instance"
  ADD CONSTRAINT "mesh_control_connector_instance_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."connector_instance"
  ADD CONSTRAINT "mesh_control_connector_instance_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."connector_instance"
  ADD CONSTRAINT "mesh_control_connector_instance_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text, 'error'::text]));

ALTER TABLE ONLY "mesh_control"."connector_type"
  ADD CONSTRAINT "mesh_control_connector_type_category_chk" CHECK (category = ANY (ARRAY['api'::text, 'file_transfer'::text, 'messaging'::text, 'erp'::text, 'document_network'::text, 'object_store'::text, 'custom'::text]));

ALTER TABLE ONLY "mesh_control"."connector_type"
  ADD CONSTRAINT "mesh_control_connector_type_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."connector_type"
  ADD CONSTRAINT "mesh_control_connector_type_hc_chk" CHECK (jsonb_typeof(health_check_config) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."connector_type"
  ADD CONSTRAINT "mesh_control_connector_type_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."connector_type"
  ADD CONSTRAINT "mesh_control_connector_type_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."connector_type"
  ADD CONSTRAINT "mesh_control_connector_type_schema_chk" CHECK (jsonb_typeof(config_schema) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."connector_type"
  ADD CONSTRAINT "mesh_control_connector_type_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_concurrency_chk" CHECK (concurrency_limit IS NULL OR concurrency_limit > 0);

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_cron_chk" CHECK (btrim(cron_expression) <> ''::text);

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_handler_chk" CHECK (btrim(handler_type) <> ''::text);

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_payload_chk" CHECK (jsonb_typeof(payload_template) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_priority_chk" CHECK (priority >= '-10'::integer AND priority <= 10);

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_queue_chk" CHECK (btrim(target_queue) <> ''::text);

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_retries_chk" CHECK (max_retries >= 0);

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_window_chk" CHECK (effective_from IS NULL OR effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_attempts_chk" CHECK (max_attempts >= 1);

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_backoff_chk" CHECK (backoff_strategy = ANY (ARRAY['fixed'::text, 'linear'::text, 'exponential'::text]));

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_delay_chk" CHECK (initial_delay_seconds >= 0 AND max_delay_seconds >= initial_delay_seconds);

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_destination_chk" CHECK (destination_type IS NULL OR (destination_type = ANY (ARRAY['mesh_account'::text, 'http_endpoint'::text, 'neon_projection'::text, 'email'::text, 'queue'::text])));

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_redaction_chk" CHECK (jsonb_typeof(redaction_policy) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_timeout_chk" CHECK (timeout_ms > 0);

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_type_chk" CHECK (delivery_type = ANY (ARRAY['document'::text, 'webhook'::text, 'notification'::text, 'projection'::text, 'acknowledgement'::text]));

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_code_chk" CHECK (entity_code ~ '^[a-z][a-z0-9_]{1,127}$'::text);

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_definition_chk" CHECK (jsonb_typeof(definition) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_label_chk" CHECK (btrim(label_singular) <> ''::text);

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_provenance_kind_chk" CHECK (provenance_kind = ANY (ARRAY['seed'::text, 'catalog_manifest'::text, 'migration'::text, 'approved_import'::text]));

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_provenance_ref_chk" CHECK (btrim(provenance_ref) <> ''::text);

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_relation_name_chk" CHECK (relation_name IS NULL OR relation_name ~ '^[a-z][a-z0-9_]{0,62}$'::text);

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_relation_pair_chk" CHECK ((relation_schema IS NULL) = (relation_name IS NULL));

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_relation_schema_chk" CHECK (relation_schema IS NULL OR (relation_schema = ANY (ARRAY['mesh'::text, 'mesh_control'::text])));

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_sha256_chk" CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_version_chk" CHECK (catalog_version > 0);

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_code_chk" CHECK (operation_code ~ '^[a-z][a-z0-9_]{0,63}$'::text);

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_idempotency_chk" CHECK (idempotency_mode = ANY (ARRAY['none'::text, 'idempotent'::text, 'idempotency_key_required'::text]));

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_kind_chk" CHECK (operation_kind = ANY (ARRAY['read'::text, 'mutation'::text]));

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_provenance_chk" CHECK (btrim(provenance_ref) <> ''::text);

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_risk_chk" CHECK (risk_tier = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]));

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_sha256_chk" CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_version_chk" CHECK (contract_version > 0);

ALTER TABLE ONLY "mesh_control"."entity_operation_plane"
  ADD CONSTRAINT "mesh_auth_entity_operation_plane_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."entity_operation_plane"
  ADD CONSTRAINT "mesh_auth_entity_operation_plane_code_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."entity_operation_plane"
  ADD CONSTRAINT "mesh_auth_entity_operation_plane_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."entity_operation_plane"
  ADD CONSTRAINT "mesh_auth_entity_operation_plane_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."entity_operation_plane"
  ADD CONSTRAINT "mesh_auth_entity_operation_plane_variant_chk" CHECK (jsonb_typeof(policy_variant) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_config_chk" CHECK (jsonb_typeof(binding_config) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_kind_chk" CHECK (binding_kind = ANY (ARRAY['account_constant'::text, 'network_relationship_column'::text, 'resource_column'::text, 'resolver'::text]));

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_plane_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_scope_kind_chk" CHECK (scope_kind = ANY (ARRAY['account'::text, 'network_relationship'::text, 'resource'::text]));

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_shape_chk" CHECK (binding_kind = 'account_constant'::text AND scope_kind = 'account'::text AND source_column IS NULL AND resolver_key IS NULL OR binding_kind = 'network_relationship_column'::text AND scope_kind = 'network_relationship'::text AND source_column ~ '^[a-z][a-z0-9_]{0,62}$'::text AND resolver_key IS NULL OR binding_kind = 'resource_column'::text AND scope_kind = 'resource'::text AND source_column ~ '^[a-z][a-z0-9_]{0,62}$'::text AND resolver_key IS NULL OR binding_kind = 'resolver'::text AND source_column IS NULL AND resolver_key ~ '^[a-z][a-z0-9_.-]{1,127}$'::text);

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_definition_chk" CHECK (jsonb_typeof(definition) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_hash_chk" CHECK (version_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_no_chk" CHECK (version_no > 0);

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_provenance_chk" CHECK (btrim(provenance_ref) <> ''::text);

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."feature_flag"
  ADD CONSTRAINT "mesh_control_feature_flag_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."feature_flag"
  ADD CONSTRAINT "mesh_control_feature_flag_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."feature_flag"
  ADD CONSTRAINT "mesh_control_feature_flag_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."feature_flag"
  ADD CONSTRAINT "mesh_control_feature_flag_overrides_chk" CHECK (account_overrides IS NULL OR jsonb_typeof(account_overrides) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."feature_flag"
  ADD CONSTRAINT "mesh_control_feature_flag_rollout_chk" CHECK (rollout_pct IS NULL OR rollout_pct >= 0 AND rollout_pct <= 100);

ALTER TABLE ONLY "mesh_control"."feature_flag"
  ADD CONSTRAINT "mesh_control_feature_flag_type_chk" CHECK (flag_type = ANY (ARRAY['release_gate'::text, 'capability_toggle'::text, 'experiment'::text]));

ALTER TABLE ONLY "mesh_control"."notification_provider"
  ADD CONSTRAINT "mesh_control_notification_provider_adapter_chk" CHECK (btrim(adapter_key) <> ''::text);

ALTER TABLE ONLY "mesh_control"."notification_provider"
  ADD CONSTRAINT "mesh_control_notification_provider_channel_chk" CHECK (channel = ANY (ARRAY['in_app'::text, 'email'::text, 'sms'::text, 'push'::text, 'webhook'::text]));

ALTER TABLE ONLY "mesh_control"."notification_provider"
  ADD CONSTRAINT "mesh_control_notification_provider_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."notification_provider"
  ADD CONSTRAINT "mesh_control_notification_provider_config_chk" CHECK (jsonb_typeof(config) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."notification_provider"
  ADD CONSTRAINT "mesh_control_notification_provider_health_chk" CHECK (health = ANY (ARRAY['unknown'::text, 'healthy'::text, 'degraded'::text, 'down'::text]));

ALTER TABLE ONLY "mesh_control"."notification_provider"
  ADD CONSTRAINT "mesh_control_notification_provider_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."notification_provider"
  ADD CONSTRAINT "mesh_control_notification_provider_priority_chk" CHECK (priority >= 1);

ALTER TABLE ONLY "mesh_control"."notification_provider"
  ADD CONSTRAINT "mesh_control_notification_provider_rate_chk" CHECK (rate_limit IS NULL OR jsonb_typeof(rate_limit) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."notification_routing_rule"
  ADD CONSTRAINT "mesh_control_notification_route_channels_chk" CHECK (array_length(channels, 1) >= 1);

ALTER TABLE ONLY "mesh_control"."notification_routing_rule"
  ADD CONSTRAINT "mesh_control_notification_route_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."notification_routing_rule"
  ADD CONSTRAINT "mesh_control_notification_route_condition_chk" CHECK (condition_expr IS NULL OR jsonb_typeof(condition_expr) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."notification_routing_rule"
  ADD CONSTRAINT "mesh_control_notification_route_dedup_chk" CHECK (dedup_window_ms >= 0);

ALTER TABLE ONLY "mesh_control"."notification_routing_rule"
  ADD CONSTRAINT "mesh_control_notification_route_event_chk" CHECK (btrim(event_type) <> ''::text);

ALTER TABLE ONLY "mesh_control"."notification_routing_rule"
  ADD CONSTRAINT "mesh_control_notification_route_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."notification_routing_rule"
  ADD CONSTRAINT "mesh_control_notification_route_priority_chk" CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]));

ALTER TABLE ONLY "mesh_control"."notification_routing_rule"
  ADD CONSTRAINT "mesh_control_notification_route_recipient_chk" CHECK (jsonb_typeof(recipient_rules) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."notification_routing_rule"
  ADD CONSTRAINT "mesh_control_notification_route_template_chk" CHECK (btrim(template_key) <> ''::text);

ALTER TABLE ONLY "mesh_control"."notification_template"
  ADD CONSTRAINT "mesh_control_notification_template_body_chk" CHECK (num_nonnulls(body_text, body_html, body_json) >= 1);

ALTER TABLE ONLY "mesh_control"."notification_template"
  ADD CONSTRAINT "mesh_control_notification_template_body_json_chk" CHECK (body_json IS NULL OR jsonb_typeof(body_json) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."notification_template"
  ADD CONSTRAINT "mesh_control_notification_template_channel_chk" CHECK (channel = ANY (ARRAY['in_app'::text, 'email'::text, 'sms'::text, 'push'::text, 'webhook'::text]));

ALTER TABLE ONLY "mesh_control"."notification_template"
  ADD CONSTRAINT "mesh_control_notification_template_key_chk" CHECK (btrim(template_key) <> ''::text);

ALTER TABLE ONLY "mesh_control"."notification_template"
  ADD CONSTRAINT "mesh_control_notification_template_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."notification_template"
  ADD CONSTRAINT "mesh_control_notification_template_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text]));

ALTER TABLE ONLY "mesh_control"."notification_template"
  ADD CONSTRAINT "mesh_control_notification_template_vars_chk" CHECK (variables_schema IS NULL OR jsonb_typeof(variables_schema) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."notification_template"
  ADD CONSTRAINT "mesh_control_notification_template_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_action_chk" CHECK (btrim(action_code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_code_chk" CHECK (btrim(rule_code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_condition_chk" CHECK (jsonb_typeof(condition_expr) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_effect_chk" CHECK (effect = ANY (ARRAY['allow'::text, 'deny'::text, 'require_review'::text, 'quarantine'::text, 'rate_limit'::text]));

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_resource_chk" CHECK (btrim(resource_type) <> ''::text);

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_result_chk" CHECK (jsonb_typeof(result_payload) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_type_chk" CHECK (rule_type = ANY (ARRAY['authorization'::text, 'document_acceptance'::text, 'quota'::text, 'routing'::text, 'retention'::text, 'connector'::text]));

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_version_chk" CHECK (version_no >= 1);

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_window_chk" CHECK (effective_from IS NULL OR effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."policy_rule_version"
  ADD CONSTRAINT "mesh_control_policy_rule_version_code_chk" CHECK (btrim(rule_code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."policy_rule_version"
  ADD CONSTRAINT "mesh_control_policy_rule_version_no_chk" CHECK (version_no >= 1);

ALTER TABLE ONLY "mesh_control"."policy_rule_version"
  ADD CONSTRAINT "mesh_control_policy_rule_version_snapshot_chk" CHECK (jsonb_typeof(rule_snapshot) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."preserved_identity_migration_receipt_v2"
  ADD CONSTRAINT "mesh_preserved_identity_migration_receipt_v2_count_chk" CHECK (identity_count > 0 AND inserted_count >= 0 AND exact_match_count >= 0 AND (inserted_count + exact_match_count) = identity_count);

ALTER TABLE ONLY "mesh_control"."preserved_identity_migration_receipt_v2"
  ADD CONSTRAINT "mesh_preserved_identity_migration_receipt_v2_hash_chk" CHECK (source_snapshot_sha256 ~ '^[0-9a-f]{64}$'::text AND manifest_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "mesh_control"."preserved_identity_migration_receipt_v2"
  ADD CONSTRAINT "mesh_preserved_identity_migration_receipt_v2_plane_chk" CHECK (plane_code = 'mesh'::text);

ALTER TABLE ONLY "mesh_control"."preserved_identity_migration_receipt_v2"
  ADD CONSTRAINT "mesh_preserved_identity_migration_receipt_v2_ticket_chk" CHECK (btrim(approval_ticket) <> ''::text);

ALTER TABLE ONLY "mesh_control"."quota_policy"
  ADD CONSTRAINT "mesh_control_quota_policy_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."quota_policy"
  ADD CONSTRAINT "mesh_control_quota_policy_limit_chk" CHECK (limit_value >= 0);

ALTER TABLE ONLY "mesh_control"."quota_policy"
  ADD CONSTRAINT "mesh_control_quota_policy_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."quota_policy"
  ADD CONSTRAINT "mesh_control_quota_policy_metric_chk" CHECK (quota_metric = ANY (ARRAY['payload_size_bytes'::text, 'daily_document_count'::text, 'api_requests'::text, 'concurrent_uploads'::text, 'storage_bytes'::text, 'active_connections'::text]));

ALTER TABLE ONLY "mesh_control"."quota_policy"
  ADD CONSTRAINT "mesh_control_quota_policy_subject_chk" CHECK (quota_subject = ANY (ARRAY['account'::text, 'connection'::text, 'principal'::text]));

ALTER TABLE ONLY "mesh_control"."quota_policy"
  ADD CONSTRAINT "mesh_control_quota_policy_window_chk" CHECK (window_seconds IS NULL OR window_seconds > 0);

ALTER TABLE ONLY "mesh_control"."reference_sync_state"
  ADD CONSTRAINT "mesh_control_reference_sync_state_count_chk" CHECK (record_count IS NULL OR record_count >= 0);

ALTER TABLE ONLY "mesh_control"."reference_sync_state"
  ADD CONSTRAINT "mesh_control_reference_sync_state_error_chk" CHECK (status = 'error'::text OR error_message IS NULL);

ALTER TABLE ONLY "mesh_control"."reference_sync_state"
  ADD CONSTRAINT "mesh_control_reference_sync_state_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."reference_sync_state"
  ADD CONSTRAINT "mesh_control_reference_sync_state_status_chk" CHECK (status = ANY (ARRAY['current'::text, 'stale'::text, 'syncing'::text, 'error'::text]));

ALTER TABLE ONLY "mesh_control"."reference_sync_state"
  ADD CONSTRAINT "mesh_control_reference_sync_state_table_chk" CHECK (btrim(table_name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."retention_policy"
  ADD CONSTRAINT "mesh_control_retention_policy_action_chk" CHECK (action = ANY (ARRAY['archive'::text, 'delete'::text, 'anonymize'::text]));

ALTER TABLE ONLY "mesh_control"."retention_policy"
  ADD CONSTRAINT "mesh_control_retention_policy_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."retention_policy"
  ADD CONSTRAINT "mesh_control_retention_policy_days_chk" CHECK (retention_days >= 0);

ALTER TABLE ONLY "mesh_control"."retention_policy"
  ADD CONSTRAINT "mesh_control_retention_policy_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."retention_policy"
  ADD CONSTRAINT "mesh_control_retention_policy_resource_chk" CHECK (resource_type = ANY (ARRAY['document_payload'::text, 'attachment'::text, 'audit_log'::text, 'activity_log'::text, 'invitation'::text, 'idempotency_key'::text, 'dlq'::text, 'delivery_attempt'::text]));

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_condition_chk" CHECK (condition_expr IS NULL OR jsonb_typeof(condition_expr) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_event_chk" CHECK (event_type IS NULL OR btrim(event_type) <> ''::text);

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_topic_chk" CHECK (btrim(topic) <> ''::text);

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_type_chk" CHECK (route_type = ANY (ARRAY['network_event'::text, 'document'::text, 'webhook'::text, 'notification'::text, 'projection'::text]));

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_window_chk" CHECK (effective_from IS NULL OR effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "mesh_control"."auth_catalog_owner"
  ADD CONSTRAINT "mesh_auth_catalog_owner_account_fk" FOREIGN KEY (account_id) REFERENCES mesh.network_account(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_account_fk" FOREIGN KEY (account_id) REFERENCES mesh.network_account(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_category_fk" FOREIGN KEY (category_id) REFERENCES mesh_control.auth_permission_category(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_entity_fk" FOREIGN KEY (catalog_owner_id, account_scope_key, entity_id) REFERENCES mesh_control.entity(catalog_owner_id, account_scope_key, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."auth_permission"
  ADD CONSTRAINT "mesh_auth_permission_owner_scope_fk" FOREIGN KEY (catalog_owner_id, account_scope_key) REFERENCES mesh_control.auth_catalog_owner(id, account_scope_key) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."auth_permission_plane"
  ADD CONSTRAINT "mesh_auth_permission_plane_permission_fk" FOREIGN KEY (permission_id) REFERENCES mesh_control.auth_permission(id) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."auth_permission_plane"
  ADD CONSTRAINT "mesh_auth_permission_plane_plane_fk" FOREIGN KEY (plane_code) REFERENCES mesh_control.auth_plane(plane_code) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."auth_permission_scope_policy"
  ADD CONSTRAINT "mesh_auth_permission_scope_permission_plane_fk" FOREIGN KEY (permission_id, plane_code) REFERENCES mesh_control.auth_permission_plane(permission_id, plane_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."authorization_shadow_mismatch_disposition_v2"
  ADD CONSTRAINT "mesh_authorization_shadow_mismatch_disposition_evidence_fk" FOREIGN KEY (comparison_id, plane_code) REFERENCES mesh_log.authorization_shadow_comparison_v2(id, plane_code) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_marker_fk" FOREIGN KEY (snapshot_marker_id) REFERENCES mesh_log.authorization_snapshot_marker(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."authorization_v2_conservation_ledger"
  ADD CONSTRAINT "mesh_authorization_v2_conservation_ledger_run_fk" FOREIGN KEY (migration_run_id) REFERENCES mesh_control.authorization_migration_run(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."authorization_v2_frozen_legacy_object"
  ADD CONSTRAINT "mesh_authorization_v2_frozen_legacy_object_source_fk" FOREIGN KEY (source_schema, source_table) REFERENCES mesh_control.authorization_capture_source(source_schema, source_table) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."authorization_v2_transformer_registry"
  ADD CONSTRAINT "mesh_authorization_v2_transformer_registry_source_fk" FOREIGN KEY (source_schema, source_table) REFERENCES mesh_control.authorization_v2_frozen_legacy_object(source_schema, source_table) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."authorization_v3_scope_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_scope_mapping_group_role_fk" FOREIGN KEY (account_id, plane_code, target_group_role_id) REFERENCES mesh.auth_group_role_v2(account_id, plane_code, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "mesh_control"."authorization_v3_scope_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_scope_mapping_override_fk" FOREIGN KEY (account_id, plane_code, target_override_id) REFERENCES mesh.auth_override(account_id, plane_code, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "mesh_control"."authorization_v3_scope_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_scope_mapping_scope_fk" FOREIGN KEY (account_id, plane_code, target_scope_id) REFERENCES mesh.auth_scope_target(account_id, plane_code, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_account_fk" FOREIGN KEY (account_id) REFERENCES mesh.network_account(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_membership_fk" FOREIGN KEY (account_id, plane_code, target_membership_id) REFERENCES mesh.auth_plane_membership(account_id, plane_code, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "mesh_control"."authorization_v3_subject_mapping"
  ADD CONSTRAINT "mesh_authorization_v3_subject_mapping_principal_fk" FOREIGN KEY (principal_id) REFERENCES mesh.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_account_fk" FOREIGN KEY (account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_requested_by_fk" FOREIGN KEY (requested_by_principal_id) REFERENCES mesh.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "mesh_control"."change_request"
  ADD CONSTRAINT "mesh_control_change_request_reviewed_by_fk" FOREIGN KEY (reviewed_by_principal_id) REFERENCES mesh.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "mesh_control"."connector_instance"
  ADD CONSTRAINT "mesh_control_connector_instance_account_fk" FOREIGN KEY (account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."connector_instance"
  ADD CONSTRAINT "mesh_control_connector_instance_type_fk" FOREIGN KEY (connector_type_code) REFERENCES mesh_control.connector_type(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_account_fk" FOREIGN KEY (account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."cron_schedule"
  ADD CONSTRAINT "mesh_control_cron_schedule_timezone_fk" FOREIGN KEY (timezone_code) REFERENCES shared.timezone(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."delivery_policy"
  ADD CONSTRAINT "mesh_control_delivery_policy_account_fk" FOREIGN KEY (account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_account_fk" FOREIGN KEY (account_id) REFERENCES mesh.network_account(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity"
  ADD CONSTRAINT "mesh_auth_entity_owner_scope_fk" FOREIGN KEY (catalog_owner_id, account_scope_key) REFERENCES mesh_control.auth_catalog_owner(id, account_scope_key) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_account_fk" FOREIGN KEY (account_id) REFERENCES mesh.network_account(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_entity_fk" FOREIGN KEY (catalog_owner_id, account_scope_key, entity_id) REFERENCES mesh_control.entity(catalog_owner_id, account_scope_key, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_exact_permission_fk" FOREIGN KEY (catalog_owner_id, account_scope_key, entity_id, operation_code, permission_id) REFERENCES mesh_control.auth_permission(catalog_owner_id, account_scope_key, entity_id, operation_code, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_owner_scope_fk" FOREIGN KEY (catalog_owner_id, account_scope_key) REFERENCES mesh_control.auth_catalog_owner(id, account_scope_key) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_permission_fk" FOREIGN KEY (permission_id) REFERENCES mesh_control.auth_permission(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_operation"
  ADD CONSTRAINT "mesh_auth_entity_operation_version_fk" FOREIGN KEY (catalog_owner_id, account_scope_key, entity_id, entity_version_id) REFERENCES mesh_control.entity_version(catalog_owner_id, account_scope_key, entity_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_operation_plane"
  ADD CONSTRAINT "mesh_auth_entity_operation_plane_operation_fk" FOREIGN KEY (entity_operation_id, permission_id) REFERENCES mesh_control.entity_operation(id, permission_id) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."entity_operation_plane"
  ADD CONSTRAINT "mesh_auth_entity_operation_plane_permission_plane_fk" FOREIGN KEY (permission_id, plane_code) REFERENCES mesh_control.auth_permission_plane(permission_id, plane_code) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_operation_plane"
  ADD CONSTRAINT "mesh_auth_entity_operation_plane_plane_fk" FOREIGN KEY (plane_code) REFERENCES mesh_control.auth_plane(plane_code) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_account_fk" FOREIGN KEY (account_id) REFERENCES mesh.network_account(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_operation_fk" FOREIGN KEY (catalog_owner_id, account_scope_key, entity_id, entity_operation_id) REFERENCES mesh_control.entity_operation(catalog_owner_id, account_scope_key, entity_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_operation_plane_fk" FOREIGN KEY (entity_operation_id, permission_id, plane_code) REFERENCES mesh_control.entity_operation_plane(entity_operation_id, permission_id, plane_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_owner_scope_fk" FOREIGN KEY (catalog_owner_id, account_scope_key) REFERENCES mesh_control.auth_catalog_owner(id, account_scope_key) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_scope_binding"
  ADD CONSTRAINT "mesh_auth_entity_scope_binding_policy_fk" FOREIGN KEY (scope_policy_id, permission_id, plane_code, scope_kind) REFERENCES mesh_control.auth_permission_scope_policy(id, permission_id, plane_code, scope_kind) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_account_fk" FOREIGN KEY (account_id) REFERENCES mesh.network_account(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."entity_version"
  ADD CONSTRAINT "mesh_auth_entity_version_entity_fk" FOREIGN KEY (catalog_owner_id, account_scope_key, entity_id) REFERENCES mesh_control.entity(catalog_owner_id, account_scope_key, id) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."notification_provider"
  ADD CONSTRAINT "mesh_control_notification_provider_account_fk" FOREIGN KEY (account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."notification_routing_rule"
  ADD CONSTRAINT "mesh_control_notification_route_account_fk" FOREIGN KEY (account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."notification_template"
  ADD CONSTRAINT "mesh_control_notification_template_account_fk" FOREIGN KEY (account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."notification_template"
  ADD CONSTRAINT "mesh_control_notification_template_locale_fk" FOREIGN KEY (locale_code) REFERENCES shared.locale(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."policy_rule"
  ADD CONSTRAINT "mesh_control_policy_rule_account_fk" FOREIGN KEY (account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."policy_rule_version"
  ADD CONSTRAINT "mesh_control_policy_rule_version_account_fk" FOREIGN KEY (account_code) REFERENCES mesh.network_account(account_code) ON DELETE SET NULL;

ALTER TABLE ONLY "mesh_control"."policy_rule_version"
  ADD CONSTRAINT "mesh_control_policy_rule_version_rule_fk" FOREIGN KEY (policy_rule_id) REFERENCES mesh_control.policy_rule(id) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."quota_policy"
  ADD CONSTRAINT "mesh_control_quota_policy_account_fk" FOREIGN KEY (account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."retention_policy"
  ADD CONSTRAINT "mesh_control_retention_policy_account_fk" FOREIGN KEY (account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_account_fk" FOREIGN KEY (account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_document_type_fk" FOREIGN KEY (document_type_code) REFERENCES mesh.network_document_type(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_provider_fk" FOREIGN KEY (provider_code) REFERENCES mesh.network_provider(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_receiver_fk" FOREIGN KEY (receiver_account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;

ALTER TABLE ONLY "mesh_control"."routing_rule"
  ADD CONSTRAINT "mesh_control_routing_rule_sender_fk" FOREIGN KEY (sender_account_code) REFERENCES mesh.network_account(account_code) ON DELETE CASCADE;
