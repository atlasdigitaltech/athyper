/**
 * Single repository contract for the physically separate Mesh Wave 1 expand.
 *
 * This manifest intentionally excludes the Wave 0 capture DDL. Capture must
 * already be installed and healthy before the expand installer is allowed to
 * run. It also excludes every Neon/Admin schema and every snapshot, backfill,
 * replay-bind, selector, cutover, and contraction operation.
 */

export const meshAuthorizationV2ExpandContractVersion =
  "wave1.mesh-authz-v2-expand.v1";

export const meshAuthorizationV2AdvisoryLockKey =
  "athyper.mesh-authorization-v2.wave1";

export const meshAuthorizationV2OrderedDdl = [
  "ddl/mesh_control/01zz_authorization_v2_catalog.sql",
  "ddl/mesh_control/01zzz_authorization_v2_migration_state.sql",
  "ddl/mesh/01zz_authorization_v2_authority.sql",
  "ddl/mesh_log/01zz_authorization_v2_runtime.sql",

  "ddl/mesh_control/03_authorization_v2_catalog_constraints.sql",
  "ddl/mesh/03_authorization_v2_authority_constraints.sql",
  "ddl/mesh_log/03_authorization_v2_runtime_constraints.sql",

  "ddl/mesh_control/04_authorization_v2_catalog_indexes.sql",
  "ddl/mesh/04_authorization_v2_authority_indexes.sql",
  "ddl/mesh_log/04_authorization_v2_runtime_indexes.sql",

  "ddl/mesh_control/05_authorization_v2_catalog_functions.sql",
  "ddl/mesh/05_authorization_v2_authority_functions.sql",
  "ddl/mesh_log/05_authorization_v2_invalidation_functions.sql",
  "ddl/mesh_log/05_authorization_v2_replay_functions.sql",
  "ddl/mesh_log/05_authorization_v2_evidence_functions.sql",

  "ddl/mesh_control/06_authorization_v2_catalog_triggers.sql",
  "ddl/mesh/06_authorization_v2_authority_triggers.sql",
  "ddl/mesh_log/06_authorization_v2_runtime_triggers.sql",

  "ddl/mesh_control/07_authorization_v2_catalog_views.sql",
  "ddl/mesh/07_authorization_v2_authority_views.sql",
  "ddl/mesh_log/07_authorization_v2_runtime_views.sql",

  "ddl/mesh_control/08_authorization_v2_catalog_rls.sql",
  "ddl/mesh_control/08_authorization_v2_migration_state_rls.sql",
  "ddl/mesh/08_authorization_v2_authority_rls.sql",
  "ddl/mesh_log/08_authorization_v2_runtime_rls.sql",
] as const;

export const meshAuthorizationV2RequiredSchemas = [
  "shared",
  "mesh_control",
  "mesh",
  "mesh_log",
] as const;

/**
 * These are Neon-owned schemas whose presence makes a database an invalid
 * Mesh authorization target. "shared" is intentionally not included: Mesh
 * owns a narrow local reference snapshot and UUID helper in that schema.
 */
export const meshAuthorizationV2ForbiddenNeonSchemas = [
  "control",
  "master",
  "event",
  "log",
  "document",
  "audit",
  "ledger",
] as const;

export const meshAuthorizationV2Wave0Sources = [
  "mesh.account_grant",
  "mesh.attachment_acl",
  "mesh.content_item_access_grant",
  "mesh.conversation_participant",
  "mesh.network_account",
  "mesh.network_relationship",
  "mesh.principal",
  "mesh.principal_identity_binding",
] as const;

export const meshAuthorizationV2CatalogTables = [
  "mesh_control.auth_plane",
  "mesh_control.auth_catalog_owner",
  "mesh_control.entity",
  "mesh_control.entity_version",
  "mesh_control.auth_permission",
  "mesh_control.auth_permission_plane",
  "mesh_control.auth_permission_scope_policy",
  "mesh_control.entity_operation",
  "mesh_control.entity_operation_plane",
  "mesh_control.entity_scope_binding",
] as const;

export const meshAuthorizationV2AuthorityTables = [
  "mesh.auth_plane_membership",
  "mesh.auth_scope_target",
  "mesh.auth_scope_account",
  "mesh.auth_scope_network_relationship",
  "mesh.auth_scope_resource",
  "mesh.auth_permission_set",
  "mesh.auth_permission_set_rule",
  "mesh.auth_role",
  "mesh.auth_role_compilation",
  "mesh.auth_role_permission_set",
  "mesh.auth_role_permission",
  "mesh.auth_group_v2",
  "mesh.auth_group_member_v2",
  "mesh.auth_group_role_v2",
  "mesh.auth_deny_rule",
  "mesh.auth_deny_rule_principal",
  "mesh.auth_deny_rule_group",
  "mesh.auth_deny_rule_hard_policy",
  "mesh.auth_override",
  "mesh.auth_record_acl",
  "mesh.auth_record_acl_permission",
  "mesh.auth_delegation",
  "mesh.auth_delegation_permission",
  "mesh.auth_delegation_permission_scope",
  "mesh.account_entitlement_override",
] as const;

export const meshAuthorizationV2MigrationTables = [
  "mesh_control.authorization_v2_expand_installation",
  "mesh_control.authorization_v2_frozen_legacy_object",
  "mesh_control.authorization_v2_transformer_registry",
  "mesh_control.authorization_v2_deferred_constraint_registry",
  "mesh_control.authorization_v2_conservation_ledger",
] as const;

export const meshAuthorizationV2RuntimeTables = [
  "mesh_log.authorization_global_epoch_v2",
  "mesh_log.authorization_account_epoch_v2",
  "mesh_log.authorization_plane_epoch_v2",
  "mesh_log.authorization_invalidation_outbox_v2",
  "mesh_log.authorization_v2_replay_binding",
  "mesh_log.authorization_v2_replay_transaction",
  "mesh_log.authorization_v2_replay_inbox",
  "mesh_log.authorization_v2_replay_application",
  "mesh_log.auth_decision_evidence_v2",
  "mesh_log.auth_decision_evidence_v2_default",
] as const;

export const meshAuthorizationV2AllTables = [
  ...meshAuthorizationV2CatalogTables,
  ...meshAuthorizationV2AuthorityTables,
  ...meshAuthorizationV2MigrationTables,
  ...meshAuthorizationV2RuntimeTables,
] as const;

/**
 * Existing Mesh identity/account relations are read by the v2 admission and
 * scope guards. They remain legacy objects; Wave 1 adds only its named
 * invalidation trigger so lifecycle changes cannot leave v2 cache state stale.
 */
export const meshAuthorizationV2ExistingDecisionDependencies = [
  "mesh.network_account",
  "mesh.network_relationship",
  "mesh.principal",
  "mesh.principal_identity_binding",
] as const;

/**
 * Every catalog, authority, or existing decision-input mutation must invalidate
 * Mesh authorization state. The runtime installer enforces exact set equality
 * against these 40 targets.
 */
export const meshAuthorizationV2InvalidationTargets = [
  ...meshAuthorizationV2ExistingDecisionDependencies,
  ...meshAuthorizationV2CatalogTables,
  ...meshAuthorizationV2AuthorityTables,
] as const;

export const meshAuthorizationV2AuthorityViews = [
  "mesh.auth_scope_target_resolved_v",
  "mesh.auth_current_plane_membership_v",
  "mesh.auth_published_role_permission_v",
  "mesh.auth_current_group_member_v",
  "mesh.auth_current_group_role_v",
  "mesh.auth_current_delegation_permission_scope_v",
  "mesh.auth_plane_membership_legacy_compare_v",
  "mesh.auth_authority_readiness_v",
] as const;

export const meshAuthorizationV2CatalogViews = [
  "mesh_control.v_authorization_v2_operation_publication",
] as const;

export const meshAuthorizationV2RuntimeViews = [
  "mesh_log.v_authorization_invalidation_health_v2",
  "mesh_log.v_authorization_replay_health_v2",
  "mesh_log.v_authorization_migration_readiness_v2",
  "mesh_log.v_auth_decision_evidence_v2",
] as const;

export const meshAuthorizationV2AllViews = [
  ...meshAuthorizationV2CatalogViews,
  ...meshAuthorizationV2AuthorityViews,
  ...meshAuthorizationV2RuntimeViews,
] as const;

/**
 * Exact names are used by the guarded pre-backfill rollback. Signatures are
 * resolved from pg_proc at runtime, so overloaded functions are all removed
 * without guessing their argument types.
 */
export const meshAuthorizationV2FunctionNames = [
  "authorization_v2_is_effective",
  "authorization_v2_window_contains",
  "authorization_v2_owner_aligned",
  "trg_authorization_v2_guard_entity",
  "trg_authorization_v2_guard_entity_version",
  "trg_authorization_v2_guard_permission",
  "trg_authorization_v2_guard_permission_plane",
  "trg_authorization_v2_guard_scope_policy",
  "trg_authorization_v2_guard_operation",
  "trg_authorization_v2_guard_operation_plane",
  "trg_authorization_v2_guard_scope_binding",
  "auth_v2_principal_has_plane",
  "auth_v2_permission_is_effective",
  "auth_v2_entity_is_eligible",
  "auth_v2_scope_is_active",
  "trg_auth_plane_membership_guard",
  "trg_auth_v2_lifecycle_guard",
  "trg_auth_v2_retention_guard",
  "trg_auth_scope_target_guard",
  "trg_auth_scope_child_guard",
  "trg_auth_permission_set_guard",
  "trg_auth_permission_set_rule_guard",
  "publish_auth_permission_set",
  "trg_auth_role_guard",
  "trg_auth_role_compilation_guard",
  "trg_auth_compilation_child_guard",
  "publish_auth_role_compilation",
  "trg_auth_group_guard",
  "trg_auth_group_member_guard",
  "trg_auth_group_role_guard",
  "trg_auth_deny_rule_guard",
  "trg_auth_deny_binding_guard",
  "trg_auth_override_guard",
  "trg_auth_record_acl_guard",
  "trg_auth_record_acl_permission_guard",
  "trg_auth_delegation_guard",
  "trg_auth_delegation_child_guard",
  "trg_account_entitlement_override_guard",
  "fn_authorization_v2_safe_uuid",
  "fn_authorization_v2_safe_bigint",
  "fn_authorization_v2_safe_timestamptz",
  "fn_authorization_v2_json_uuid_values",
  "fn_authorization_v2_source_row_key",
  "fn_authorization_bump_epoch_v2",
  "fn_authorization_emit_invalidation_v2",
  "fn_authorization_supersede_scheduled_v2",
  "fn_authorization_claim_invalidations_v2",
  "fn_authorization_complete_invalidation_v2",
  "fn_authorization_fail_invalidation_v2",
  "trg_authorization_invalidation_immutable_v2",
  "trg_authorization_authority_invalidate_v2",
  "fn_authorization_bind_replay_v2",
  "fn_authorization_stage_replay_v2",
  "fn_authorization_begin_replay_v2",
  "fn_authorization_set_replay_event_context_v2",
  "fn_authorization_complete_replay_v2",
  "trg_authorization_v2_replay_inbox_immutable",
  "trg_authorization_v2_replay_state_guard",
  "fn_auth_decision_evidence_sha256_v2",
  "trg_auth_decision_evidence_v2_prepare",
  "trg_auth_decision_evidence_v2_immutable",
] as const;

export const meshAuthorizationV2Sentinels = {
  planeId: "00000000-0000-7000-8000-000000000021",
  catalogOwnerId: "00000000-0000-7000-8000-000000000030",
  planeCode: "mesh",
  captureContractVersion: "wave0.mesh-authz-capture.v1",
} as const;

export function splitQualifiedName(
  qualifiedName: string,
): { schema: string; table: string } {
  const [schema, table, extra] = qualifiedName.split(".");
  if (!schema || !table || extra) {
    throw new Error(`Invalid qualified relation name: ${qualifiedName}`);
  }
  return { schema, table };
}
