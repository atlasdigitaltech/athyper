-- ============================================================================
-- mesh_control/01_tables.sql
-- Tables reconstructed from the live catalog.
-- Generated from the live Mesh database mesh_control schema. Do not hand-edit.
-- ============================================================================

CREATE TABLE "mesh_control"."auth_catalog_owner" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_kind" text NOT NULL,
  "account_id" uuid,
  "account_scope_key" uuid GENERATED ALWAYS AS (COALESCE(account_id, id)) STORED,
  "owner_code" text NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "catalog_version" integer DEFAULT 1 NOT NULL,
  "provenance_ref" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."auth_catalog_owner" IS 'Mandatory platform or network-account owner of each Mesh catalog row.';

CREATE TABLE "mesh_control"."auth_entitlement_policy" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_code" text NOT NULL,
  "capability_code" text,
  "allow_override" boolean DEFAULT false NOT NULL,
  "policy_version" bigint NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "reason" text NOT NULL,
  "approval_ticket" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL
);

CREATE TABLE "mesh_control"."auth_permission" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "catalog_owner_id" uuid NOT NULL,
  "account_id" uuid,
  "account_scope_key" uuid GENERATED ALWAYS AS (COALESCE(account_id, catalog_owner_id)) STORED,
  "category_id" uuid NOT NULL,
  "canonical_code" text NOT NULL,
  "entity_id" uuid,
  "operation_code" text,
  "product_code" text,
  "capability_code" text,
  "risk_tier" text DEFAULT 'low'::text NOT NULL,
  "requires_mfa" boolean DEFAULT false NOT NULL,
  "requires_sod" boolean DEFAULT false NOT NULL,
  "is_shareable" boolean DEFAULT false NOT NULL,
  "is_delegable" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "catalog_version" integer NOT NULL,
  "provenance_kind" text NOT NULL,
  "provenance_ref" text NOT NULL,
  "definition_sha256" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."auth_permission" IS 'Exact Mesh-local permission catalog with product/account eligibility metadata.';

CREATE TABLE "mesh_control"."auth_permission_category" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "provenance_kind" text NOT NULL,
  "provenance_ref" text NOT NULL,
  "catalog_version" integer NOT NULL,
  "definition_sha256" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."auth_permission_category" IS 'Mesh-local, non-authorizing permission taxonomy.';

CREATE TABLE "mesh_control"."auth_permission_plane" (
  "permission_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "status" text DEFAULT 'inactive'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "policy_version" integer DEFAULT 1 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."auth_permission_plane" IS 'Explicit Mesh-plane eligibility for one exact local permission.';

CREATE TABLE "mesh_control"."auth_permission_scope_policy" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "permission_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "scope_kind" text NOT NULL,
  "propagation_mode" text DEFAULT 'none'::text NOT NULL,
  "requires_resource_scope" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "policy_version" integer NOT NULL,
  "provenance_ref" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."auth_permission_scope_policy" IS 'Canonical permission/plane policy for account, relationship, or resource scope.';

CREATE TABLE "mesh_control"."auth_plane" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "plane_code" text NOT NULL,
  "name" text NOT NULL,
  "entitlement_semantics" text NOT NULL,
  "auth_contract_version" integer NOT NULL,
  "capability_manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."auth_plane" IS 'Mesh-local plane and authorization contract. The plane code is sealed to mesh.';

CREATE TABLE "mesh_control"."authorization_anomaly_disposition" (
  "finding_fingerprint" text NOT NULL,
  "finding_kind" text NOT NULL,
  "severity" text NOT NULL,
  "source_schema" text NOT NULL,
  "source_table" text NOT NULL,
  "source_primary_key" jsonb,
  "observed_scope_kind" text,
  "observed_scope_value" jsonb,
  "referenced_scope_kind" text,
  "referenced_scope_value" jsonb,
  "classification" text NOT NULL,
  "owner_team" text NOT NULL,
  "reason" text NOT NULL,
  "remediation" text,
  "approval_ticket" text NOT NULL,
  "approved_by" text NOT NULL,
  "approved_at" timestamp with time zone NOT NULL,
  "resolved_at" timestamp with time zone,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT SESSION_USER NOT NULL
);

COMMENT ON TABLE "mesh_control"."authorization_anomaly_disposition" IS 'Owner-approved classifications for Mesh identity, grant, ACL, and cross-account findings. Unclassified findings block Wave 0.';

CREATE TABLE "mesh_control"."authorization_capture_source" (
  "source_schema" text NOT NULL,
  "source_table" text NOT NULL,
  "source_kind" text NOT NULL,
  "owner_team" text DEFAULT 'mesh-platform'::text NOT NULL,
  "primary_key_columns" text[] DEFAULT ARRAY['id'::text] NOT NULL,
  "scope_kind" text DEFAULT 'global'::text NOT NULL,
  "scope_columns" text[] DEFAULT '{}'::text[] NOT NULL,
  "redacted_columns" text[] DEFAULT '{}'::text[] NOT NULL,
  "capture_enabled" boolean DEFAULT true NOT NULL,
  "retention_days" integer DEFAULT 180 NOT NULL,
  "notes" text,
  "registered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "registered_by" text DEFAULT SESSION_USER NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."authorization_capture_source" IS 'Exact Mesh-local authorization input registry. Every enabled source must have ENABLE ALWAYS row and TRUNCATE capture triggers before W0.';

COMMENT ON COLUMN "mesh_control"."authorization_capture_source"."scope_columns" IS 'Ordered source columns encoded as a privacy-safe JSON scope_value. Global sources use an empty array.';

COMMENT ON COLUMN "mesh_control"."authorization_capture_source"."redacted_columns" IS 'Top-level JSON keys replaced with [REDACTED] before persistence/hashing.';

CREATE TABLE "mesh_control"."authorization_consumer_migration_v2" (
  "plane_code" text DEFAULT 'mesh'::text NOT NULL,
  "consumer_family" text NOT NULL,
  "enforcement_state" text DEFAULT 'not_started'::text NOT NULL,
  "collection_enforced" boolean DEFAULT false NOT NULL,
  "resource_enforced" boolean DEFAULT false NOT NULL,
  "record_acl_enforced" boolean DEFAULT false NOT NULL,
  "delegation_enforced" boolean DEFAULT false NOT NULL,
  "exact_catalog_ids_only" boolean DEFAULT false NOT NULL,
  "verification_report_ref" text,
  "approved_at" timestamp with time zone,
  "approved_by" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "mesh_control"."authorization_consumer_migration_v2" IS 'Mesh-local consumer enforcement ledger; it has no dependency on Neon.';

CREATE TABLE "mesh_control"."authorization_cutover_cohort_v2" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "plane_code" text DEFAULT 'mesh'::text NOT NULL,
  "cohort_code" text NOT NULL,
  "permission_codes" text[] NOT NULL,
  "consumer_paths" text[] NOT NULL,
  "state" text DEFAULT 'shadow'::text NOT NULL,
  "source_database_id" uuid NOT NULL,
  "minimum_applied_watermark" bigint NOT NULL,
  "golden_corpus_sha256" text NOT NULL,
  "catalog_version" text NOT NULL,
  "active_user_parity_sha256" text,
  "high_risk" boolean DEFAULT true NOT NULL,
  "owner_team" text NOT NULL,
  "effective_from" timestamp with time zone NOT NULL,
  "observation_window_ends_at" timestamp with time zone NOT NULL,
  "approval_ticket" text NOT NULL,
  "approved_by" text NOT NULL,
  "approved_at" timestamp with time zone NOT NULL,
  "rollback_owner" text NOT NULL,
  "retired_at" timestamp with time zone,
  "retired_by" text,
  "last_transition_ticket" text,
  "last_transition_at" timestamp with time zone,
  "last_transition_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT SESSION_USER NOT NULL
);

CREATE TABLE "mesh_control"."authorization_cutover_plane_v2" (
  "plane_code" text NOT NULL,
  "resolver_state" text DEFAULT 'legacy'::text NOT NULL,
  "writer_authority" text DEFAULT 'legacy'::text NOT NULL,
  "writer_epoch" bigint DEFAULT 0 NOT NULL,
  "legacy_write_frozen" boolean DEFAULT false NOT NULL,
  "legacy_write_frozen_at" timestamp with time zone,
  "source_database_id" uuid,
  "maximum_shadow_lag" bigint DEFAULT 0 NOT NULL,
  "freeze_source_watermark" bigint,
  "freeze_applied_watermark" bigint,
  "instant_rollback_promised" boolean DEFAULT false NOT NULL,
  "reverse_projector_status" text DEFAULT 'none'::text NOT NULL,
  "reverse_projector_evidence_sha256" text,
  "observation_window_ends_at" timestamp with time zone,
  "observation_completed_at" timestamp with time zone,
  "policy_revision" text DEFAULT 'wave7-default-legacy'::text NOT NULL,
  "approval_ticket" text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "rollback_owner" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text DEFAULT SESSION_USER NOT NULL
);

CREATE TABLE "mesh_control"."authorization_migration_run" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "run_code" text NOT NULL,
  "plane_key" text DEFAULT 'mesh'::text NOT NULL,
  "capture_contract_version" text NOT NULL,
  "transformation_version" text,
  "source_database_id" uuid NOT NULL,
  "target_database_id" uuid,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "capture_installed_at" timestamp with time zone,
  "snapshot_started_at" timestamp with time zone,
  "snapshot_completed_at" timestamp with time zone,
  "snapshot_watermark" bigint,
  "snapshot_manifest_uri" text,
  "snapshot_manifest_sha256" text,
  "last_applied_watermark" bigint,
  "cutover_watermark" bigint,
  "rollback_watermark" bigint,
  "authorization_rpo_seconds" integer NOT NULL,
  "authorization_rto_minutes" integer NOT NULL,
  "business_data_rpo_seconds" integer,
  "business_data_rto_minutes" integer,
  "rollback_owner" text NOT NULL,
  "observation_started_at" timestamp with time zone,
  "observation_ends_at" timestamp with time zone,
  "approval_ticket" text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT SESSION_USER NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."authorization_migration_run" IS 'Mesh-local durable migration contract. Mesh and Neon source UUIDs and watermarks remain independent; this table never asserts a global order.';

CREATE TABLE "mesh_control"."authorization_runtime_release_v2" (
  "plane_code" text NOT NULL,
  "release_state" text DEFAULT 'shadow'::text NOT NULL,
  "evaluator_contract_version" text NOT NULL,
  "runtime_contract_version" text NOT NULL,
  "session_contract_version" text NOT NULL,
  "evaluator_revision" text NOT NULL,
  "catalog_version" integer NOT NULL,
  "catalog_sha256" text NOT NULL,
  "activated_at" timestamp with time zone,
  "activation_approval_ref" text,
  "observation_window_until" timestamp with time zone,
  "rollback_owner" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT SESSION_USER NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."authorization_runtime_release_v2" IS 'Mesh-local fail-closed publication record for the Wave 5 evaluator/runtime/session tuple.';

CREATE TABLE "mesh_control"."authorization_shadow_mismatch_disposition_v2" (
  "comparison_id" uuid NOT NULL,
  "plane_code" text DEFAULT 'mesh'::text NOT NULL,
  "risk_class" text NOT NULL,
  "mismatch_classes" text[] NOT NULL,
  "disposition" text DEFAULT 'unreviewed'::text NOT NULL,
  "owner_team" text NOT NULL,
  "reason" text,
  "remediation_ticket" text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "evidence_sha256" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT SESSION_USER NOT NULL
);

CREATE TABLE "mesh_control"."authorization_target_guard_installation_v2" (
  "target_relation" regclass NOT NULL,
  "plane_code" text DEFAULT 'mesh'::text NOT NULL,
  "status" text DEFAULT 'installed'::text NOT NULL,
  "approval_ticket" text NOT NULL,
  "approved_by" text NOT NULL,
  "installed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "installed_by" text DEFAULT SESSION_USER NOT NULL,
  "definition_sha256" text NOT NULL,
  "validation_ticket" text,
  "validated_at" timestamp with time zone,
  "validated_by" text
);

CREATE TABLE "mesh_control"."authorization_v2_conservation_ledger" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "migration_run_id" uuid NOT NULL,
  "snapshot_marker_id" uuid NOT NULL,
  "source_database_id" uuid NOT NULL,
  "source_txid" bigint,
  "phase" text NOT NULL,
  "source_relation" text NOT NULL,
  "target_relation" text NOT NULL,
  "transformer_version" text NOT NULL,
  "source_count" bigint NOT NULL,
  "target_count" bigint NOT NULL,
  "quarantined_count" bigint DEFAULT 0 NOT NULL,
  "rejected_count" bigint DEFAULT 0 NOT NULL,
  "source_sha256" text NOT NULL,
  "target_sha256" text NOT NULL,
  "status" text DEFAULT 'observed'::text NOT NULL,
  "approval_ticket" text,
  "reconciled_at" timestamp with time zone,
  "reconciled_by" text,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT SESSION_USER NOT NULL
);

COMMENT ON TABLE "mesh_control"."authorization_v2_conservation_ledger" IS 'Count and deterministic-hash conservation evidence for snapshot, replay, synchronization, and comparison.';

CREATE TABLE "mesh_control"."authorization_v2_deferred_constraint_registry" (
  "target_schema" text NOT NULL,
  "target_table" text NOT NULL,
  "constraint_name" text NOT NULL,
  "constraint_type" character(1) NOT NULL,
  "expected_definition" text NOT NULL,
  "expected_definition_sha256" text NOT NULL,
  "initially_validated" boolean NOT NULL,
  "validation_status" text NOT NULL,
  "defer_reason" text NOT NULL,
  "owner_team" text NOT NULL,
  "validation_deadline" timestamp with time zone NOT NULL,
  "approval_ticket" text NOT NULL,
  "registered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "registered_by" text DEFAULT SESSION_USER NOT NULL,
  "validated_at" timestamp with time zone,
  "validated_by" text
);

COMMENT ON TABLE "mesh_control"."authorization_v2_deferred_constraint_registry" IS 'Exact live-definition registry for every Wave 1 CHECK or FK deliberately installed NOT VALID.';

CREATE TABLE "mesh_control"."authorization_v2_expand_installation" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "target_database_name" text NOT NULL,
  "target_database_oid" oid NOT NULL,
  "source_database_id" uuid,
  "capture_contract_version" text,
  "expand_contract_version" text NOT NULL,
  "ordered_ddl_sha256" text NOT NULL,
  "ordered_ddl" jsonb NOT NULL,
  "approval_ticket" text NOT NULL,
  "installed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "installed_by" text DEFAULT SESSION_USER NOT NULL
);

COMMENT ON TABLE "mesh_control"."authorization_v2_expand_installation" IS 'Immutable receipt for an explicitly approved Mesh Wave 1 expand install.';

CREATE TABLE "mesh_control"."authorization_v2_frozen_legacy_object" (
  "source_schema" text NOT NULL,
  "source_table" text NOT NULL,
  "source_kind" text NOT NULL,
  "freeze_contract_version" text NOT NULL,
  "freeze_policy" text DEFAULT 'no_new_feature_reads_or_writes'::text NOT NULL,
  "capture_required" boolean DEFAULT true NOT NULL,
  "object_contract_sha256" text,
  "status" text DEFAULT 'declared'::text NOT NULL,
  "frozen_at" timestamp with time zone,
  "frozen_by" text,
  "approval_ticket" text,
  "notes" text,
  "declared_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "mesh_control"."authorization_v2_frozen_legacy_object" IS 'Exact eight-relation Wave 0 Mesh capture boundary frozen against new feature reads and writes.';

CREATE TABLE "mesh_control"."authorization_v2_transformer_registry" (
  "source_schema" text NOT NULL,
  "source_table" text NOT NULL,
  "capture_contract_version" text NOT NULL,
  "transformer_version" text NOT NULL,
  "transformer_key" text NOT NULL,
  "transformer_sha256" text NOT NULL,
  "disposition" text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "approval_ticket" text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT SESSION_USER NOT NULL
);

COMMENT ON TABLE "mesh_control"."authorization_v2_transformer_registry" IS 'Fail-closed transform registry: every source in a replayed transaction needs one effective approved disposition.';

CREATE TABLE "mesh_control"."authorization_v3_scope_mapping" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "plane_code" text DEFAULT 'mesh'::text NOT NULL,
  "legacy_grant_id" uuid NOT NULL,
  "source_watermark_id" uuid NOT NULL,
  "legacy_scope_kind" text,
  "legacy_scope_ref_id" uuid,
  "disposition" text NOT NULL,
  "target_scope_id" uuid,
  "target_group_role_id" uuid,
  "target_override_id" uuid,
  "status" text DEFAULT 'staged'::text NOT NULL,
  "anomaly_code" text,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL
);

CREATE TABLE "mesh_control"."authorization_v3_subject_mapping" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "plane_code" text DEFAULT 'mesh'::text NOT NULL,
  "principal_id" uuid NOT NULL,
  "source_watermark_id" uuid NOT NULL,
  "source_row_sha256" text NOT NULL,
  "disposition" text NOT NULL,
  "target_membership_id" uuid,
  "target_group_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "approval_ticket" text NOT NULL,
  "mapping_reason" text NOT NULL,
  "status" text DEFAULT 'staged'::text NOT NULL,
  "anomaly_code" text,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "validated_at" timestamp with time zone,
  "validated_by" text
);

CREATE TABLE "mesh_control"."authorization_v4_legacy_exception_disposition" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "source_relation" text NOT NULL,
  "source_row_id" uuid NOT NULL,
  "source_watermark_id" uuid NOT NULL,
  "source_row_sha256" text NOT NULL,
  "classification" text NOT NULL,
  "target_relation" text,
  "target_row_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "affected_principal_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "legacy_decision_sha256" text,
  "canonical_decision_sha256" text,
  "affected_user_diff_count" bigint DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'staged'::text NOT NULL,
  "reason" text NOT NULL,
  "approval_ticket" text,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "anomaly_code" text,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL
);

CREATE TABLE "mesh_control"."authorization_writer_registry" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "writer_key" text NOT NULL,
  "owner_team" text NOT NULL,
  "db_role_pattern" text NOT NULL,
  "application_name_pattern" text NOT NULL,
  "source_schema_pattern" text DEFAULT '%'::text NOT NULL,
  "source_table_pattern" text DEFAULT '%'::text NOT NULL,
  "allowed_operations" text[] DEFAULT ARRAY['I'::text, 'U'::text, 'D'::text, 'T'::text] NOT NULL,
  "write_path" text NOT NULL,
  "priority" smallint DEFAULT 100 NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "approval_ticket" text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT SESSION_USER NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."authorization_writer_registry" IS 'Approved Mesh authorization writers. No rows are seeded by Wave 0. A captured write must declare app.authorization_writer_key and match an active approved registry row or it remains an unknown writer.';

CREATE TABLE "mesh_control"."authorization_writer_switch_receipt_v2" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "plane_code" text DEFAULT 'mesh'::text NOT NULL,
  "writer_epoch" bigint NOT NULL,
  "source_database_id" uuid NOT NULL,
  "source_watermark" bigint NOT NULL,
  "applied_watermark" bigint NOT NULL,
  "freeze_started_at" timestamp with time zone NOT NULL,
  "switched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "legacy_writer_key" text NOT NULL,
  "target_writer_key" text NOT NULL,
  "instant_rollback_promised" boolean NOT NULL,
  "reverse_projector_status" text NOT NULL,
  "reverse_projector_evidence_sha256" text,
  "gate_evidence_sha256" text NOT NULL,
  "approval_ticket" text NOT NULL,
  "approved_by" text NOT NULL,
  "rollback_owner" text NOT NULL,
  "created_by" text DEFAULT SESSION_USER NOT NULL
);

CREATE TABLE "mesh_control"."change_request" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "account_code" text,
  "request_code" text NOT NULL,
  "requested_by_principal_id" uuid,
  "change_type" text NOT NULL,
  "target_table" text NOT NULL,
  "target_id" uuid,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'submitted'::text NOT NULL,
  "reviewed_by_principal_id" uuid,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "applied_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."change_request" IS 'Optional approval workflow for risky Mesh control changes.';

CREATE TABLE "mesh_control"."connector_instance" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "account_code" text NOT NULL,
  "connector_type_code" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "direction" text DEFAULT 'both'::text NOT NULL,
  "endpoint_uri" text,
  "secret_ref" text,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "health" text DEFAULT 'unknown'::text NOT NULL,
  "last_health_check_at" timestamp with time zone,
  "last_success_at" timestamp with time zone,
  "last_failure_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."connector_instance" IS 'Account-scoped Mesh connector instance. secret_ref stores a vault/key reference, not the secret value.';

CREATE TABLE "mesh_control"."connector_type" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "icon_key" text,
  "config_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "auth_types" text[] DEFAULT '{}'::text[] NOT NULL,
  "capabilities" text[] DEFAULT '{}'::text[] NOT NULL,
  "health_check_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."connector_type" IS 'Mesh connector type catalog: API, SFTP, AS2, Peppol, ERP adapters, and object stores.';

CREATE TABLE "mesh_control"."cron_schedule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "account_code" text,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "handler_type" text NOT NULL,
  "cron_expression" text NOT NULL,
  "timezone_code" text DEFAULT 'UTC'::text NOT NULL,
  "target_queue" text NOT NULL,
  "payload_template" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "priority" smallint DEFAULT 0 NOT NULL,
  "max_retries" smallint DEFAULT 3 NOT NULL,
  "concurrency_limit" smallint,
  "effective_from" timestamp with time zone,
  "effective_until" timestamp with time zone,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "lock_key" text,
  "last_run_at" timestamp with time zone,
  "next_run_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."cron_schedule" IS 'Runtime-configurable Mesh jobs: retention, hash anchoring, DLQ retry, replay, scan sweeps.';

CREATE TABLE "mesh_control"."delivery_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "account_code" text,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "delivery_type" text NOT NULL,
  "destination_type" text,
  "max_attempts" smallint DEFAULT 5 NOT NULL,
  "initial_delay_seconds" integer DEFAULT 30 NOT NULL,
  "max_delay_seconds" integer DEFAULT 3600 NOT NULL,
  "backoff_strategy" text DEFAULT 'exponential'::text NOT NULL,
  "timeout_ms" integer DEFAULT 30000 NOT NULL,
  "dlq_enabled" boolean DEFAULT true NOT NULL,
  "redaction_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."delivery_policy" IS 'Retry, timeout, and DLQ policy for Mesh delivery paths.';

CREATE TABLE "mesh_control"."entity" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "catalog_owner_id" uuid NOT NULL,
  "account_id" uuid,
  "account_scope_key" uuid GENERATED ALWAYS AS (COALESCE(account_id, catalog_owner_id)) STORED,
  "entity_code" text NOT NULL,
  "relation_schema" text,
  "relation_name" text,
  "label_singular" text NOT NULL,
  "label_plural" text,
  "description" text,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "catalog_version" integer NOT NULL,
  "provenance_kind" text NOT NULL,
  "provenance_ref" text NOT NULL,
  "definition_sha256" text NOT NULL,
  "definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."entity" IS 'Mesh-local protected entity identity; it does not duplicate resource rows.';

CREATE TABLE "mesh_control"."entity_operation" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "catalog_owner_id" uuid NOT NULL,
  "account_id" uuid,
  "account_scope_key" uuid GENERATED ALWAYS AS (COALESCE(account_id, catalog_owner_id)) STORED,
  "entity_id" uuid NOT NULL,
  "entity_version_id" uuid,
  "operation_code" text NOT NULL,
  "permission_id" uuid NOT NULL,
  "operation_kind" text NOT NULL,
  "idempotency_mode" text NOT NULL,
  "risk_tier" text NOT NULL,
  "requires_mfa" boolean DEFAULT false NOT NULL,
  "requires_sod" boolean DEFAULT false NOT NULL,
  "is_shareable" boolean DEFAULT false NOT NULL,
  "is_delegable" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "contract_version" integer NOT NULL,
  "provenance_ref" text NOT NULL,
  "definition_sha256" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."entity_operation" IS 'Exact Mesh entity operation. Publication requires one aligned active permission.';

CREATE TABLE "mesh_control"."entity_operation_plane" (
  "entity_operation_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "policy_variant" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."entity_operation_plane" IS 'Mesh-plane exposure for one exact operation/permission pair.';

CREATE TABLE "mesh_control"."entity_scope_binding" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "catalog_owner_id" uuid NOT NULL,
  "account_id" uuid,
  "account_scope_key" uuid GENERATED ALWAYS AS (COALESCE(account_id, catalog_owner_id)) STORED,
  "entity_id" uuid NOT NULL,
  "entity_operation_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "scope_policy_id" uuid NOT NULL,
  "scope_kind" text NOT NULL,
  "binding_kind" text NOT NULL,
  "source_column" text,
  "resolver_key" text,
  "binding_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."entity_scope_binding" IS 'Typed account, relationship, or resource extraction for an exact Mesh operation.';

CREATE TABLE "mesh_control"."entity_version" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "catalog_owner_id" uuid NOT NULL,
  "account_id" uuid,
  "account_scope_key" uuid GENERATED ALWAYS AS (COALESCE(account_id, catalog_owner_id)) STORED,
  "entity_id" uuid NOT NULL,
  "version_no" integer NOT NULL,
  "version_hash" text NOT NULL,
  "definition" jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "provenance_ref" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."entity_version" IS 'Versioned Mesh entity contract. Operations may bind one version or the current contract.';

CREATE TABLE "mesh_control"."feature_flag" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "flag_type" text DEFAULT 'release_gate'::text NOT NULL,
  "is_enabled" boolean DEFAULT false NOT NULL,
  "account_overrides" jsonb,
  "rollout_pct" smallint,
  "expires_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."feature_flag" IS 'Mesh feature flag registry. Used for writer cutover gates, shadow mode, and capability toggles.';

COMMENT ON COLUMN "mesh_control"."feature_flag"."account_overrides" IS 'JSON object mapping Mesh BNA account_code to boolean override.';

CREATE TABLE "mesh_control"."notification_provider" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "account_code" text,
  "channel" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "adapter_key" text NOT NULL,
  "priority" smallint DEFAULT 1 NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rate_limit" jsonb,
  "health" text DEFAULT 'unknown'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."notification_provider" IS 'Optional Mesh notification provider registry. Use only when Mesh sends its own network notifications.';

CREATE TABLE "mesh_control"."notification_routing_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "account_code" text,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "event_type" text NOT NULL,
  "entity_type" text,
  "condition_expr" jsonb,
  "template_key" text NOT NULL,
  "channels" text[] NOT NULL,
  "priority" text DEFAULT 'normal'::text NOT NULL,
  "recipient_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedup_window_ms" integer DEFAULT 300000 NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."notification_routing_rule" IS 'Optional Mesh network-notification routing rule. account_code NULL means platform-global.';

CREATE TABLE "mesh_control"."notification_template" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "account_code" text,
  "template_key" text NOT NULL,
  "channel" text NOT NULL,
  "locale_code" text DEFAULT 'en'::text NOT NULL,
  "version" smallint DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "subject" text,
  "body_text" text,
  "body_html" text,
  "body_json" jsonb,
  "variables_schema" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."notification_template" IS 'Optional Mesh notification template. account_code NULL means platform default.';

CREATE TABLE "mesh_control"."policy_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "account_code" text,
  "rule_code" text NOT NULL,
  "name" text NOT NULL,
  "rule_type" text NOT NULL,
  "resource_type" text NOT NULL,
  "action_code" text NOT NULL,
  "effect" text NOT NULL,
  "condition_expr" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "priority" smallint DEFAULT 0 NOT NULL,
  "version_no" integer DEFAULT 1 NOT NULL,
  "effective_from" timestamp with time zone,
  "effective_until" timestamp with time zone,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."policy_rule" IS 'Mesh business/security policy rule. Not an ERP accounting/tax/control rule.';

CREATE TABLE "mesh_control"."policy_rule_version" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "policy_rule_id" uuid NOT NULL,
  "account_code" text,
  "rule_code" text NOT NULL,
  "version_no" integer NOT NULL,
  "rule_snapshot" jsonb NOT NULL,
  "superseded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "superseded_by" text DEFAULT 'system'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "mesh_control"."policy_rule_version" IS 'Immutable version history for mesh_control.policy_rule updates.';

CREATE TABLE "mesh_control"."preserved_identity_migration_receipt_v2" (
  "manifest_id" text NOT NULL,
  "plane_code" text DEFAULT 'mesh'::text NOT NULL,
  "source_snapshot_sha256" text NOT NULL,
  "manifest_sha256" text NOT NULL,
  "identity_count" integer NOT NULL,
  "inserted_count" integer NOT NULL,
  "exact_match_count" integer NOT NULL,
  "approval_ticket" text NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL,
  "applied_by" text DEFAULT SESSION_USER NOT NULL
);

CREATE TABLE "mesh_control"."quota_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "account_code" text,
  "code" text NOT NULL,
  "quota_subject" text DEFAULT 'account'::text NOT NULL,
  "quota_metric" text NOT NULL,
  "limit_value" bigint NOT NULL,
  "window_seconds" integer,
  "hard_limit" boolean DEFAULT true NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."quota_policy" IS 'Mesh account quota policy. account_code NULL means platform default.';

CREATE TABLE "mesh_control"."reference_sync_state" (
  "table_name" text NOT NULL,
  "source_version" text,
  "source_checksum" text,
  "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "record_count" integer,
  "status" text DEFAULT 'current'::text NOT NULL,
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."reference_sync_state" IS 'Admin-published reference snapshot freshness and version state for Mesh-local shared.* reference tables.';

CREATE TABLE "mesh_control"."retention_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "account_code" text,
  "code" text NOT NULL,
  "resource_type" text NOT NULL,
  "retention_days" integer NOT NULL,
  "action" text DEFAULT 'delete'::text NOT NULL,
  "legal_hold_enabled" boolean DEFAULT false NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."retention_policy" IS 'Retention controls for Mesh payloads, logs, invitations, idempotency rows, and DLQs.';

CREATE TABLE "mesh_control"."routing_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "account_code" text,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "route_type" text NOT NULL,
  "event_type" text,
  "document_type_code" text,
  "sender_account_code" text,
  "receiver_account_code" text,
  "provider_code" text,
  "topic" text NOT NULL,
  "handler_key" text,
  "condition_expr" jsonb,
  "priority" smallint DEFAULT 0 NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "effective_from" timestamp with time zone,
  "effective_until" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'system'::text NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

COMMENT ON TABLE "mesh_control"."routing_rule" IS 'Mesh event/document routing map. account_code NULL means platform-global rule.';
