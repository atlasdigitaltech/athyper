# Wave 0 authorization source inventory

> Generated deterministically by `tooling/scripts/policy/authorization-inventory.ts` from the reviewed exact-object registry. Edit the registry or scanner, then regenerate; do not hand-edit this report.

Registry SHA-256: `e3178a368002e324e17bcd910d61730120efa30b559f722a7699a58d2e901088`
Files scanned / authorization-bearing: 5053 / 1197
Registered authorization objects: 470
Aggregated object references: 1120
Writer references: 136
Contract/UI field references: 1990
Permission definitions / uses: 85 / 501
Authorization-bearing routes: 17
Keycloak mappers: 145
Canonical capture sources: 0 ()
Keycloak REST writer paths: 10
Open gate findings: 0

## Gate status

| Gate | Findings |
|---|---:|
| Unknown authorization sources | 0 |
| Unknown authorization writers | 0 |
| Unowned objects | 0 |
| Unclassified writers | 0 |
| Missing source definitions | 0 |
| Generated artifact failures | 0 |
| Unknown capture sources | 0 |
| Stale capture-source registrations | 0 |
| Duplicate capture sources | 0 |
| Cross-plane capture-source drift | 0 |
| Unknown Keycloak REST writers | 0 |
| Stale Keycloak REST writer rules | 0 |
| Known source anomalies blocking strict certification | 0 |
| Zero-Mesh-specific-data Neon boundary findings | 0 |

Any non-zero structural finding blocks the Wave 0 inventory-completeness gate. Owned known anomalies remain visible and block strict certification, but are reported separately by structural-only verification. Tests and documentation do not satisfy runtime ownership.

## Registered authorities

| ID | Exact object | Database | Class | Owner | Planes | Disposition | Definitions | Readers | Writers |
|---|---|---|---|---|---|---|---:|---:|---:|
| audit.attachment_access | `log.attachment_access_log` | neon | decision_evidence | document-platform | neon | retain | 0 | 0 | 0 |
| audit.attachment_access.default_partition | `log.attachment_access_log_default` | neon | decision_evidence_partition | platform-iam | studio, neon | retain_with_parent | 0 | 0 | 0 |
| audit.field_access | `log.field_access_log` | neon | decision_evidence | policy-platform | neon | retain | 0 | 0 | 0 |
| audit.field_access.default_partition | `log.field_access_log_default` | neon | decision_evidence_partition | platform-iam | studio, neon | retain_with_parent | 0 | 0 | 0 |
| audit.permission_decision | `log.permission_decision_log` | neon | decision_evidence | platform-iam | studio, neon | replace_persona_evidence_fields | 0 | 1 | 0 |
| audit.permission_decision.default_partition | `log.permission_decision_log_default` | neon | decision_evidence_partition | platform-iam | studio, neon | retain_with_parent | 0 | 0 | 0 |
| audit.security_event | `log.security_event_log` | neon | audit | security-platform | studio, neon | retain | 0 | 0 | 0 |
| authentication.mfa_config | `control.mfa_config` | neon | authentication_assurance | platform-iam | studio, neon | keep_keycloak_authority_projection | 0 | 3 | 0 |
| authorization.group | `master.auth_group` | neon | authorization | platform-iam | studio, neon | replace_additively | 1 | 4 | 2 |
| authorization.group_member | `master.auth_group_member` | neon | authorization | platform-iam | studio, neon | replace_additively | 0 | 5 | 0 |
| authorization.group_role | `master.auth_group_role` | neon | authorization | platform-iam | studio, neon | replace_additively | 0 | 3 | 0 |
| authorization.invalidation_health | `event.authorization_invalidation_health` | neon | authorization_runtime_health | platform-iam | studio, neon, mesh | keep_as_runtime_health_projection | 1 | 2 | 0 |
| authorization.seed_staging | `control.auth_permission_seed_staging` | neon | seed_staging | platform-iam | studio, neon | ephemeral_seed_compilation_only | 0 | 1 | 0 |
| catalog.enterprise_feature | `shared.enterprise_feature` | neon_and_mesh_legacy | entitlement_catalog | platform-catalog | studio, neon, mesh | replace_with_feature_catalog | 0 | 1 | 0 |
| catalog.module | `shared.module` | neon_and_mesh_legacy | entitlement_catalog | platform-catalog | studio, neon, mesh | keep_neon_reference_only_in_mesh | 0 | 4 | 0 |
| catalog.subscription_plan | `shared.subscription_plan` | neon_and_mesh_legacy | entitlement_catalog | commercial-platform | neon | keep_neon | 0 | 3 | 0 |
| catalog.subscription_plan_version | `shared.subscription_plan_version` | neon_and_mesh_legacy | entitlement_catalog | commercial-platform | neon | keep_neon | 0 | 2 | 0 |
| catalog.workspace | `shared.workspace` | neon_and_mesh_legacy | entitlement_catalog | platform-catalog | studio, neon, mesh | keep_neon_reference_only_in_mesh | 0 | 3 | 1 |
| compiled.entity | `snapshot.entity_compiled` | neon | authorization_projection | metadata-platform | studio, neon | regenerate | 0 | 1 | 0 |
| context.company_code | `master.company_code` | neon | authorization_scope | finance-platform | neon | keep_as_non_granting_scope_source | 2 | 58 | 11 |
| context.legal_entity | `master.legal_entity` | neon | authorization_scope | organization-platform | neon | keep_as_non_granting_scope_source | 1 | 25 | 6 |
| context.operating_organization | `master.operating_organization` | neon | authorization_scope | organization-platform | neon | keep_as_non_granting_scope_source | 3 | 50 | 13 |
| context.operating_organization_company | `master.operating_organization_company` | neon | authorization_scope | organization-platform | neon | keep_as_non_granting_scope_membership | 0 | 1 | 0 |
| context.principal_relationship | `master.principal_relationship` | neon | context_only | platform-iam | studio, neon | keep_non_authorizing | 0 | 2 | 0 |
| context.team | `master.team` | neon | context_only | organization-platform | neon | keep_non_authorizing | 1 | 30 | 0 |
| context.team_member | `master.team_member` | neon | context_only | organization-platform | neon | keep_non_authorizing | 2 | 25 | 0 |
| context.tenant_relationship | `master.tenant_relationship` | neon | context_only | platform-iam | studio, neon | keep_non_authorizing | 1 | 24 | 0 |
| function.access_grant_status_changed | `master.trg_access_grant_status_changed` | neon | authorization_change_capture | platform-iam | neon | remove_with_legacy_access_grant | 0 | 0 | 0 |
| function.bump_auth_epoch | `master.fn_bump_auth_epoch` | neon | authorization_change_capture | platform-iam | studio, neon | replace_with_durable_change_watermark | 0 | 0 | 0 |
| function.check_permission | `master.check_permission` | neon | legacy_evaluator | platform-iam | neon | remove_after_shadow | 0 | 0 | 0 |
| function.derive_effective_roles | `master.derive_effective_roles` | neon | legacy_evaluator | platform-iam | neon | remove_after_shadow | 0 | 0 | 0 |
| function.effective_scope | `master.resolve_effective_authorization_scope` | neon | legacy_scope_evaluator | platform-iam | neon | replace_with_scope_repository | 0 | 0 | 0 |
| function.guard_auth_binding_service_client | `master.trg_guard_auth_binding_service_client` | neon | identity_invariant | platform-iam | studio, neon | keep_invariant | 0 | 0 | 0 |
| function.guard_delegation_grant_mutation | `master.trg_guard_delegation_grant_mutation` | neon | legacy_authorization_invariant | platform-iam | neon | remove_with_legacy_delegation | 0 | 0 | 0 |
| function.lookup_tenant_for_auth | `master.fn_lookup_tenant_for_auth` | neon | authorization_context | platform-iam | studio, neon | keep_until_session_context_replacement | 0 | 0 | 0 |
| function.protect_system_persona | `shared.trg_protect_system_persona` | neon_and_mesh_legacy | legacy_authorization_invariant | platform-iam | studio, neon, mesh | remove_with_persona | 0 | 0 | 0 |
| function.resolve_allowed_companies | `master.resolve_allowed_companies` | neon | legacy_scope_evaluator | platform-iam | neon | remove_after_shadow | 0 | 0 | 0 |
| function.validate_delegation_permissions | `master.trg_validate_delegation_permissions` | neon | legacy_authorization_invariant | platform-iam | neon | remove_with_legacy_delegation | 0 | 0 | 0 |
| function.visibility_scope | `master.get_effective_visibility_scope` | neon | legacy_scope_evaluator | platform-iam | neon | remove_after_shadow | 0 | 0 | 0 |
| identity.legal_entity_binding | `master.legal_entity_identity_binding` | neon | identity_binding | platform-iam | studio, neon | keep_as_non_granting_identity_projection | 0 | 2 | 0 |
| identity.principal | `master.principal` | neon | identity | platform-iam | studio, neon | keep | 4 | 210 | 34 |
| identity.principal_binding | `master.principal_identity_binding` | neon | identity_binding | platform-iam | studio, neon | keep | 1 | 46 | 9 |
| identity.principal_profile | `master.principal_profile` | neon | identity_profile | platform-iam | studio, neon | remove_duplicate_idp_fields | 1 | 24 | 0 |
| identity.tenant | `master.tenant` | neon | identity | platform-iam | studio, neon | keep | 5 | 153 | 26 |
| identity.tenant_domain | `master.tenant_identity_domain` | neon | authentication_configuration | platform-iam | studio, neon | keep | 0 | 2 | 0 |
| identity.tenant_provider | `master.tenant_identity_provider` | neon | authentication_configuration | platform-iam | studio, neon | keep | 0 | 2 | 0 |
| legacy.access_grant | `master.access_grant` | neon | legacy_authorization | platform-iam | studio, neon, mesh | split_into_role_scope_override_acl | 0 | 2 | 0 |
| legacy.attachment_acl | `master.attachment_acl` | neon | record_acl | document-platform | neon | merge_into_auth_record_acl | 0 | 2 | 0 |
| legacy.business_network | `master.business_network` | neon | legacy_mesh_context | mesh-platform | mesh, neon | remove_from_neon | 0 | 3 | 0 |
| legacy.business_network_membership | `master.business_network_membership` | neon | legacy_mesh_authorization | mesh-platform | mesh, neon | remove_from_neon | 0 | 2 | 0 |
| legacy.business_network_membership_role | `master.business_network_membership_role` | neon | legacy_mesh_authorization | mesh-platform | mesh, neon | remove_from_neon | 0 | 2 | 0 |
| legacy.company_code_access | `master.company_code_access` | neon | legacy_scope | platform-iam | neon | remove | 0 | 4 | 0 |
| legacy.content_item_access_grant | `master.content_item_access_grant` | neon | record_acl | content-platform | neon | merge_into_auth_record_acl | 0 | 3 | 0 |
| legacy.delegation_grant | `master.delegation_grant` | neon | delegation | platform-iam | neon | normalize | 0 | 4 | 0 |
| legacy.group_feature_grant | `master.group_feature_grant` | neon | legacy_entitlement | platform-iam | neon | remove | 0 | 1 | 0 |
| legacy.permission | `shared.permission` | neon_and_mesh_legacy | permission_catalog | platform-iam | studio, neon, mesh | move_to_control_auth_permission | 0 | 4 | 0 |
| legacy.permission_category | `shared.permission_category` | neon_and_mesh_legacy | permission_catalog | platform-iam | studio, neon, mesh | move_to_control_auth_permission | 0 | 2 | 0 |
| legacy.permission_scope_policy | `shared.permission_scope_policy` | neon_and_mesh_legacy | scope | platform-iam | neon | move_to_control_scope_policy | 0 | 2 | 0 |
| legacy.persona | `shared.persona` | neon_and_mesh_legacy | legacy_authorization | platform-iam | studio, neon, mesh | remove | 0 | 2 | 0 |
| legacy.persona_permission | `shared.persona_permission` | neon_and_mesh_legacy | legacy_authorization | platform-iam | studio, neon, mesh | remove | 0 | 2 | 0 |
| legacy.plan_feature_access | `shared.plan_feature_access` | neon_and_mesh_legacy | entitlement | commercial-platform | neon | replace_with_plan_version_feature_access | 0 | 2 | 0 |
| legacy.plan_module_access | `shared.plan_module_access` | neon_and_mesh_legacy | entitlement | commercial-platform | neon | replace_with_plan_version_module_access | 0 | 3 | 0 |
| legacy.plan_permission_access | `shared.plan_permission_access` | neon_and_mesh_legacy | entitlement | commercial-platform | neon | remove_permission_level_entitlement | 0 | 2 | 0 |
| legacy.principal_feature_grant | `master.principal_feature_grant` | neon | legacy_entitlement | platform-iam | neon | remove | 0 | 1 | 0 |
| legacy.principal_persona | `master.principal_persona` | neon | legacy_authorization | platform-iam | studio, neon | remove | 0 | 2 | 0 |
| legacy.role | `shared.role` | neon_and_mesh_legacy | legacy_authorization | platform-iam | studio, neon, mesh | replace_with_tenant_plane_role | 0 | 2 | 0 |
| legacy.tenant_admin_grant | `master.tenant_admin_grant` | neon | legacy_plane_admission | platform-iam | studio | replace_with_auth_plane_membership | 0 | 2 | 0 |
| legacy.tenant_feature_entitlement | `master.tenant_feature_entitlement` | neon | entitlement | commercial-platform | neon | replace_with_tenant_entitlement | 0 | 3 | 0 |
| legacy.tenant_module_subscription | `master.tenant_module_subscription` | neon | entitlement | commercial-platform | neon | replace_with_tenant_entitlement | 0 | 4 | 0 |
| legacy.tenant_permission_override | `master.tenant_permission_override` | neon | entitlement_override | commercial-platform | neon | replace_with_feature_entitlement_override | 0 | 2 | 0 |
| mesh.account | `mesh.network_account` | mesh | plane_membership_context | mesh-platform | mesh | keep_mesh_only | 2 | 33 | 12 |
| mesh.account_grant | `mesh.account_grant` | mesh | legacy_authorization | mesh-platform | mesh | replace_with_mesh_local_role_group_model | 0 | 2 | 0 |
| mesh.attachment_acl | `mesh.attachment_acl` | mesh | record_acl | mesh-platform | mesh | normalize_mesh_locally | 0 | 1 | 0 |
| mesh.audit.access_decision | `mesh_log.access_decision_log` | mesh | decision_evidence | mesh-platform | mesh | retain | 0 | 0 | 0 |
| mesh.audit.access_decision.default_partition | `mesh_log.access_decision_log_default` | mesh | decision_evidence_partition | mesh-platform | mesh | retain_with_parent | 0 | 0 | 0 |
| mesh.audit.attachment_access | `mesh_log.attachment_access_log` | mesh | decision_evidence | mesh-platform | mesh | retain | 0 | 0 | 0 |
| mesh.audit.attachment_access.default_partition | `mesh_log.attachment_access_log_default` | mesh | decision_evidence_partition | mesh-platform | mesh | retain_with_parent | 0 | 0 | 0 |
| mesh.audit.security_event | `mesh_log.security_event_log` | mesh | audit | mesh-platform | mesh | retain | 0 | 0 | 0 |
| mesh.authorization.account_entitlement | `mesh.auth_account_entitlement` | mesh | seed_projection_authority | mesh-platform | mesh | retain_as_compiled_seed_authority_identity | 0 | 2 | 0 |
| mesh.capture.anomaly_disposition | `mesh_control.authorization_anomaly_disposition` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 0 | 1 | 0 |
| mesh.capture.checkpoint | `mesh_log.authorization_projection_checkpoint` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 0 | 0 | 0 |
| mesh.capture.clock | `mesh_log.authorization_capture_clock` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 0 | 1 | 0 |
| mesh.capture.event | `mesh_log.authorization_change_event` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 0 | 0 | 0 |
| mesh.capture.function.evidence_guard | `mesh_log.trg_authorization_evidence_immutable` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 0 | 0 | 0 |
| mesh.capture.function.internal_guard | `mesh_log.trg_authorization_internal_guard` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 0 | 0 | 0 |
| mesh.capture.function.primary_key | `mesh_log.fn_authorization_capture_primary_key` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 0 | 0 | 0 |
| mesh.capture.function.record_change | `mesh_log.fn_record_authorization_change` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 0 | 0 | 0 |
| mesh.capture.function.redact | `mesh_log.fn_authorization_capture_redact` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 0 | 0 | 0 |
| mesh.capture.function.row_trigger | `mesh_log.trg_capture_authorization_change` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 0 | 0 | 0 |
| mesh.capture.function.safe_uuid | `mesh_log.fn_authorization_capture_safe_uuid` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 0 | 0 | 0 |
| mesh.capture.function.scope_value | `mesh_log.fn_authorization_capture_scope_value` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 0 | 0 | 0 |
| mesh.capture.function.sha256 | `mesh_log.fn_authorization_capture_sha256` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 0 | 0 | 0 |
| mesh.capture.function.snapshot_marker | `mesh_log.fn_record_authorization_snapshot_marker` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 0 | 0 | 0 |
| mesh.capture.function.truncate_trigger | `mesh_log.trg_capture_authorization_truncate` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 0 | 0 | 0 |
| mesh.capture.function.watermark | `mesh_log.fn_authorization_capture_watermark` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 0 | 0 | 0 |
| mesh.capture.health_view | `mesh_log.v_authorization_capture_health` | mesh | authorization_change_capture | mesh-platform | mesh | recreate_from_mesh_capture_evidence | 0 | 0 | 0 |
| mesh.capture.migration_run | `mesh_control.authorization_migration_run` | mesh | authorization_migration_control | mesh-platform | mesh | preserve_immutable_through_observation | 0 | 0 | 0 |
| mesh.capture.snapshot_marker | `mesh_log.authorization_snapshot_marker` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 0 | 0 | 0 |
| mesh.capture.source_registry | `mesh_control.authorization_capture_source` | mesh | authorization_change_capture | mesh-platform | mesh | retain_through_mesh_migration_observation | 0 | 1 | 1 |
| mesh.capture.transaction | `mesh_log.authorization_change_transaction` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 0 | 0 | 0 |
| mesh.capture.writer_registry | `mesh_control.authorization_writer_registry` | mesh | authorization_change_capture | mesh-platform | mesh | retain_through_mesh_migration_observation | 0 | 0 | 0 |
| mesh.capture.writer_view | `mesh_log.v_authorization_writer_telemetry` | mesh | authorization_change_capture | mesh-platform | mesh | recreate_from_mesh_capture_evidence | 0 | 0 | 0 |
| mesh.content_access_grant | `mesh.content_item_access_grant` | mesh | record_acl | mesh-platform | mesh | normalize_mesh_locally | 0 | 1 | 0 |
| mesh.conversation_participant | `mesh.conversation_participant` | mesh | conversation_acl | mesh-platform | mesh | keep_mesh_local_authorization_source | 0 | 1 | 0 |
| mesh.function.grant_fingerprint | `mesh.fn_account_grant_fingerprint` | mesh | authorization_cache | mesh-platform | mesh | replace_with_authorization_fingerprint | 0 | 0 | 0 |
| mesh.function.grant_revoke | `mesh.fn_account_grant_revoke_hook` | mesh | authorization_change_hook | mesh-platform | mesh | replace_with_mesh_local_change_capture | 0 | 0 | 0 |
| mesh.identity.binding | `mesh.principal_identity_binding` | mesh | identity_binding | mesh-platform | mesh | keep_mesh_only | 0 | 2 | 0 |
| mesh.identity.principal | `mesh.principal` | mesh | identity | mesh-platform | mesh | keep_mesh_only | 0 | 2 | 0 |
| mesh.relationship | `mesh.network_relationship` | mesh | context_only | mesh-platform | mesh | keep_non_authorizing | 1 | 40 | 10 |
| mesh.rollout.feature_flag | `mesh_control.feature_flag` | mesh | rollout_control | mesh-platform | mesh | keep_mesh_only | 0 | 0 | 0 |
| metadata.entity | `control.entity` | neon | authorization_metadata | metadata-platform | studio, neon | keep_canonical_entity_identity | 0 | 2 | 0 |
| metadata.entity_action_rule | `control.entity_action_rule` | neon | authorization_metadata | metadata-platform | studio, neon | replace_permission_code_with_permission_id | 0 | 1 | 0 |
| metadata.entity_field | `control.entity_field` | neon | field_authorization_metadata | metadata-platform | studio, neon | normalize_security_references | 0 | 1 | 0 |
| metadata.entity_flow | `control.entity_flow` | neon | authorization_metadata | metadata-platform | studio, neon | normalize_permission_references | 0 | 2 | 0 |
| metadata.entity_flow_step | `control.entity_flow_step` | neon | authorization_metadata | metadata-platform | studio, neon | normalize_permission_references | 0 | 1 | 0 |
| metadata.entity_lifecycle | `control.entity_lifecycle` | neon | authorization_metadata | workflow-platform | neon | keep_canonical_entity_lifecycle_binding | 0 | 1 | 0 |
| metadata.entity_lifecycle_state_mask | `control.entity_lifecycle_state_mask` | neon | authorization_guard | workflow-platform | neon | normalize_as_non_granting_state_capability_guard | 0 | 1 | 0 |
| metadata.entity_operation | `control.entity_operation` | neon | authorization_metadata | metadata-platform | studio, neon | replace_permission_code_with_permission_id | 0 | 4 | 0 |
| metadata.entity_policy | `control.entity_policy` | neon | resource_policy | policy-platform | neon | keep_as_non_granting_guard | 0 | 1 | 0 |
| metadata.entity_relation | `control.entity_relation` | neon | authorization_metadata | metadata-platform | studio, neon | normalize_permission_references | 0 | 1 | 0 |
| metadata.entity_surface | `control.entity_surface` | neon | authorization_metadata | metadata-platform | studio, neon | normalize_permission_references | 0 | 1 | 0 |
| metadata.entity_version | `control.entity_version` | neon | authorization_metadata | metadata-platform | studio, neon | keep_canonical_versioned_contract | 0 | 3 | 1 |
| metadata.entity_version_contract | `control.entity_version_contract` | neon | authorization_metadata | metadata-platform | studio, neon | keep_canonical_contract | 0 | 0 | 0 |
| metadata.field_security_policy | `control.field_security_policy` | neon | field_authorization | policy-platform | neon | normalize_permission_references | 0 | 1 | 0 |
| metadata.lifecycle | `control.lifecycle` | neon | authorization_metadata | workflow-platform | neon | keep_as_non_granting_workflow_context | 0 | 2 | 0 |
| metadata.lifecycle_state | `control.lifecycle_state` | neon | authorization_metadata | workflow-platform | neon | keep_as_non_granting_workflow_context | 0 | 1 | 0 |
| metadata.lifecycle_transition | `control.lifecycle_transition` | neon | authorization_metadata | workflow-platform | neon | bind_exact_permission_id | 0 | 1 | 0 |
| metadata.lifecycle_transition_gate | `control.lifecycle_transition_gate` | neon | authorization_guard | workflow-platform | neon | normalize_as_non_granting_transition_guard | 0 | 1 | 0 |
| metadata.permission_alias | `control.permission_alias` | neon | compatibility | platform-iam | studio, neon | remove_after_shadow | 0 | 2 | 0 |
| migration.anomaly_disposition | `control.authorization_anomaly_disposition` | neon_and_mesh_migration | migration_control | platform-iam | studio, neon, mesh | retain_as_migration_evidence | 0 | 2 | 0 |
| migration.capture_clock | `event.authorization_capture_clock` | neon_and_mesh_migration | durable_source_watermark | platform-iam | studio, neon, mesh | retain_until_all_consumers_retired | 0 | 2 | 0 |
| migration.capture_source | `control.authorization_capture_source` | neon_and_mesh_migration | migration_control | platform-iam | studio, neon, mesh | retain_through_authorization_cutover_and_observation | 0 | 2 | 1 |
| migration.change_event | `event.authorization_change_event` | neon_and_mesh_migration | authorization_change_capture | platform-iam | studio, neon, mesh | retain_per_approved_migration_evidence_policy | 0 | 1 | 0 |
| migration.change_transaction | `event.authorization_change_transaction` | neon_and_mesh_migration | authorization_change_capture | platform-iam | studio, neon, mesh | retain_per_approved_migration_evidence_policy | 0 | 1 | 0 |
| migration.function.capture_row_trigger | `event.trg_capture_authorization_change` | neon_and_mesh_migration | authorization_change_capture_trigger | platform-iam | studio, neon, mesh | remove_after_all_legacy_writers_are_retired | 0 | 0 | 0 |
| migration.function.capture_truncate_trigger | `event.trg_capture_authorization_truncate` | neon_and_mesh_migration | authorization_change_capture_trigger | platform-iam | studio, neon, mesh | remove_after_all_legacy_writers_are_retired | 0 | 0 | 0 |
| migration.function.immutable_event_trigger | `event.trg_authorization_change_event_immutable` | neon_and_mesh_migration | authorization_change_capture_invariant | platform-iam | studio, neon, mesh | retain_with_change_capture | 0 | 0 | 0 |
| migration.function.primary_key | `event.fn_authorization_capture_primary_key` | neon_and_mesh_migration | authorization_change_capture | platform-iam | studio, neon, mesh | retain_with_change_capture | 0 | 0 | 0 |
| migration.function.record_change | `event.fn_record_authorization_change` | neon_and_mesh_migration | authorization_change_capture_writer | platform-iam | studio, neon, mesh | retain_with_change_capture | 0 | 0 | 0 |
| migration.function.redact | `event.fn_authorization_capture_redact` | neon_and_mesh_migration | authorization_change_capture | platform-iam | studio, neon, mesh | retain_with_change_capture | 0 | 0 | 0 |
| migration.function.safe_uuid | `event.fn_authorization_capture_safe_uuid` | neon_and_mesh_migration | authorization_change_capture | platform-iam | studio, neon, mesh | retain_with_change_capture | 0 | 0 | 0 |
| migration.function.sha256 | `event.fn_authorization_capture_sha256` | neon_and_mesh_migration | authorization_change_capture | platform-iam | studio, neon, mesh | retain_with_change_capture | 0 | 0 | 0 |
| migration.function.snapshot_marker | `event.fn_record_authorization_snapshot_marker` | neon_and_mesh_migration | authorization_snapshot_control | platform-iam | studio, neon, mesh | retain_as_snapshot_and_cutover_evidence | 0 | 0 | 0 |
| migration.function.transaction_guard_trigger | `event.trg_authorization_change_transaction_guard` | neon_and_mesh_migration | authorization_change_capture_invariant | platform-iam | studio, neon, mesh | retain_with_change_capture | 0 | 0 | 0 |
| migration.function.watermark | `event.fn_authorization_capture_watermark` | neon_and_mesh_migration | durable_source_watermark | platform-iam | studio, neon, mesh | retain_until_all_consumers_retired | 0 | 0 | 0 |
| migration.health_view | `event.v_authorization_capture_health` | neon_and_mesh_migration | migration_telemetry | platform-iam | studio, neon, mesh | retain_until_all_consumers_retired | 0 | 0 | 0 |
| migration.projection_checkpoint | `event.authorization_projection_checkpoint` | neon_and_mesh_migration | authorization_projection_control | platform-iam | studio, neon, mesh | retain_until_all_consumers_retired | 0 | 1 | 0 |
| migration.run | `control.authorization_migration_run` | neon_and_mesh_migration | migration_control | platform-iam | studio, neon, mesh | retain_as_migration_evidence | 0 | 1 | 0 |
| migration.snapshot_marker | `event.authorization_snapshot_marker` | neon_and_mesh_migration | authorization_snapshot_control | platform-iam | studio, neon, mesh | retain_as_snapshot_and_cutover_evidence | 0 | 1 | 0 |
| migration.telemetry_view | `event.v_authorization_legacy_write_telemetry` | neon_and_mesh_migration | migration_telemetry | platform-iam | studio, neon, mesh | retain_through_post_cutover_observation | 0 | 0 | 0 |
| migration.writer_registry | `control.authorization_writer_registry` | neon_and_mesh_migration | migration_control | platform-iam | studio, neon, mesh | retain_through_authorization_cutover_and_observation | 0 | 1 | 0 |
| rollout.feature_flag | `control.feature_flag` | neon | rollout_control | platform-runtime | studio, neon | keep | 0 | 1 | 0 |
| studio.publication.entity_authorization_successor_link | `publication.entity_authorization_successor_link` | studio | authorization_publication | publication | studio | immutable_studio_release_provenance_not_runtime_authority | 2 | 5 | 3 |
| studio.publication.entity_authorization_successor_payload | `publication.entity_authorization_successor_payload` | studio | authorization_publication | publication | studio | immutable_hash_pinned_studio_publication_input_not_runtime_authority | 2 | 8 | 6 |
| studio.publication.fn_authorization_successor_compilation_source | `publication.fn_authorization_successor_compilation_source` | studio | authorization_publication | publication | studio | studio_compilation_reader_for_hash_pinned_approved_release | 2 | 0 | 0 |
| studio.publication.fn_prepare_authorization_successor | `publication.fn_prepare_authorization_successor` | studio | authorization_publication | publication | studio | studio_approved_release_materialization_with_maker_checker_and_tenant_checks | 3 | 0 | 0 |
| support.session | `ai.atlas_support_session` | neon | delegated_support_access | ai-platform | studio | keep_bounded_by_new_evaluator | 0 | 4 | 0 |
| support.session_audit | `ai.atlas_support_session_audit` | neon | audit | ai-platform | studio | retain | 0 | 0 | 0 |
| wave1.mesh.function.mesh_control.authorization_v2_is_effective | `mesh_control.authorization_v2_is_effective` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_control.authorization_v2_owner_aligned | `mesh_control.authorization_v2_owner_aligned` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_control.authorization_v2_window_contains | `mesh_control.authorization_v2_window_contains` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_entity | `mesh_control.trg_authorization_v2_guard_entity` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_entity_version | `mesh_control.trg_authorization_v2_guard_entity_version` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_operation | `mesh_control.trg_authorization_v2_guard_operation` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_operation_plane | `mesh_control.trg_authorization_v2_guard_operation_plane` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_permission | `mesh_control.trg_authorization_v2_guard_permission` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_permission_plane | `mesh_control.trg_authorization_v2_guard_permission_plane` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_scope_binding | `mesh_control.trg_authorization_v2_guard_scope_binding` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_scope_policy | `mesh_control.trg_authorization_v2_guard_scope_policy` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_auth_decision_evidence_sha256_v2 | `mesh_log.fn_auth_decision_evidence_sha256_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_begin_replay_v2 | `mesh_log.fn_authorization_begin_replay_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_bind_replay_v2 | `mesh_log.fn_authorization_bind_replay_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_bump_epoch_v2 | `mesh_log.fn_authorization_bump_epoch_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_claim_invalidations_v2 | `mesh_log.fn_authorization_claim_invalidations_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_complete_invalidation_v2 | `mesh_log.fn_authorization_complete_invalidation_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_complete_replay_v2 | `mesh_log.fn_authorization_complete_replay_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_emit_invalidation_v2 | `mesh_log.fn_authorization_emit_invalidation_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_fail_invalidation_v2 | `mesh_log.fn_authorization_fail_invalidation_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_set_replay_event_context_v2 | `mesh_log.fn_authorization_set_replay_event_context_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_stage_replay_v2 | `mesh_log.fn_authorization_stage_replay_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_supersede_scheduled_v2 | `mesh_log.fn_authorization_supersede_scheduled_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_v2_json_uuid_values | `mesh_log.fn_authorization_v2_json_uuid_values` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_v2_safe_bigint | `mesh_log.fn_authorization_v2_safe_bigint` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_v2_safe_timestamptz | `mesh_log.fn_authorization_v2_safe_timestamptz` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_v2_safe_uuid | `mesh_log.fn_authorization_v2_safe_uuid` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_v2_source_row_key | `mesh_log.fn_authorization_v2_source_row_key` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.trg_auth_decision_evidence_v2_immutable | `mesh_log.trg_auth_decision_evidence_v2_immutable` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.trg_auth_decision_evidence_v2_prepare | `mesh_log.trg_auth_decision_evidence_v2_prepare` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.trg_authorization_authority_invalidate_v2 | `mesh_log.trg_authorization_authority_invalidate_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.trg_authorization_invalidation_immutable_v2 | `mesh_log.trg_authorization_invalidation_immutable_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.trg_authorization_v2_replay_inbox_immutable | `mesh_log.trg_authorization_v2_replay_inbox_immutable` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh_log.trg_authorization_v2_replay_state_guard | `mesh_log.trg_authorization_v2_replay_state_guard` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.auth_v2_entity_is_eligible | `mesh.auth_v2_entity_is_eligible` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.auth_v2_permission_is_effective | `mesh.auth_v2_permission_is_effective` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.auth_v2_principal_has_plane | `mesh.auth_v2_principal_has_plane` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.auth_v2_scope_is_active | `mesh.auth_v2_scope_is_active` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.publish_auth_permission_set | `mesh.publish_auth_permission_set` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.publish_auth_role_compilation | `mesh.publish_auth_role_compilation` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_account_entitlement_override_guard | `mesh.trg_account_entitlement_override_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_compilation_child_guard | `mesh.trg_auth_compilation_child_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_delegation_child_guard | `mesh.trg_auth_delegation_child_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_delegation_guard | `mesh.trg_auth_delegation_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_deny_binding_guard | `mesh.trg_auth_deny_binding_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_deny_rule_guard | `mesh.trg_auth_deny_rule_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_group_guard | `mesh.trg_auth_group_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_group_member_guard | `mesh.trg_auth_group_member_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_group_role_guard | `mesh.trg_auth_group_role_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_override_guard | `mesh.trg_auth_override_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_permission_set_guard | `mesh.trg_auth_permission_set_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_permission_set_rule_guard | `mesh.trg_auth_permission_set_rule_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_plane_membership_guard | `mesh.trg_auth_plane_membership_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_record_acl_guard | `mesh.trg_auth_record_acl_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_record_acl_permission_guard | `mesh.trg_auth_record_acl_permission_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_role_compilation_guard | `mesh.trg_auth_role_compilation_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_role_guard | `mesh.trg_auth_role_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_scope_child_guard | `mesh.trg_auth_scope_child_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_scope_target_guard | `mesh.trg_auth_scope_target_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_v2_lifecycle_guard | `mesh.trg_auth_v2_lifecycle_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_v2_retention_guard | `mesh.trg_auth_v2_retention_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.auth_catalog_owner | `mesh_control.auth_catalog_owner` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.auth_permission | `mesh_control.auth_permission` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.auth_permission_category | `mesh_control.auth_permission_category` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.auth_permission_plane | `mesh_control.auth_permission_plane` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.auth_permission_scope_policy | `mesh_control.auth_permission_scope_policy` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.auth_plane | `mesh_control.auth_plane` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.authorization_v2_conservation_ledger | `mesh_control.authorization_v2_conservation_ledger` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh_control.authorization_v2_deferred_constraint_registry | `mesh_control.authorization_v2_deferred_constraint_registry` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh_control.authorization_v2_expand_installation | `mesh_control.authorization_v2_expand_installation` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh_control.authorization_v2_frozen_legacy_object | `mesh_control.authorization_v2_frozen_legacy_object` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh_control.authorization_v2_transformer_registry | `mesh_control.authorization_v2_transformer_registry` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh_control.entity | `mesh_control.entity` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.entity_operation | `mesh_control.entity_operation` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.entity_operation_plane | `mesh_control.entity_operation_plane` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.entity_scope_binding | `mesh_control.entity_scope_binding` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.entity_version | `mesh_control.entity_version` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_log.auth_decision_evidence_v2 | `mesh_log.auth_decision_evidence_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_log.auth_decision_evidence_v2_default | `mesh_log.auth_decision_evidence_v2_default` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_log.authorization_account_epoch_v2 | `mesh_log.authorization_account_epoch_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_log.authorization_global_epoch_v2 | `mesh_log.authorization_global_epoch_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_log.authorization_invalidation_outbox_v2 | `mesh_log.authorization_invalidation_outbox_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_log.authorization_plane_epoch_v2 | `mesh_log.authorization_plane_epoch_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_log.authorization_v2_replay_application | `mesh_log.authorization_v2_replay_application` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_log.authorization_v2_replay_binding | `mesh_log.authorization_v2_replay_binding` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_log.authorization_v2_replay_inbox | `mesh_log.authorization_v2_replay_inbox` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_log.authorization_v2_replay_transaction | `mesh_log.authorization_v2_replay_transaction` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.account_entitlement_override | `mesh.account_entitlement_override` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_delegation | `mesh.auth_delegation` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_delegation_permission | `mesh.auth_delegation_permission` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_delegation_permission_scope | `mesh.auth_delegation_permission_scope` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_deny_rule | `mesh.auth_deny_rule` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_deny_rule_group | `mesh.auth_deny_rule_group` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_deny_rule_hard_policy | `mesh.auth_deny_rule_hard_policy` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_deny_rule_principal | `mesh.auth_deny_rule_principal` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_group_member_v2 | `mesh.auth_group_member_v2` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_group_role_v2 | `mesh.auth_group_role_v2` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_group_v2 | `mesh.auth_group_v2` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_override | `mesh.auth_override` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_permission_set | `mesh.auth_permission_set` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_permission_set_rule | `mesh.auth_permission_set_rule` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_plane_membership | `mesh.auth_plane_membership` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_record_acl | `mesh.auth_record_acl` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_record_acl_permission | `mesh.auth_record_acl_permission` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_role | `mesh.auth_role` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_role_compilation | `mesh.auth_role_compilation` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_role_permission | `mesh.auth_role_permission` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_role_permission_set | `mesh.auth_role_permission_set` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_scope_account | `mesh.auth_scope_account` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_scope_network_relationship | `mesh.auth_scope_network_relationship` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_scope_resource | `mesh.auth_scope_resource` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_scope_target | `mesh.auth_scope_target` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh_control.v_authorization_v2_operation_publication | `mesh_control.v_authorization_v2_operation_publication` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh_log.v_auth_decision_evidence_v2 | `mesh_log.v_auth_decision_evidence_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh_log.v_authorization_invalidation_health_v2 | `mesh_log.v_authorization_invalidation_health_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh_log.v_authorization_migration_readiness_v2 | `mesh_log.v_authorization_migration_readiness_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh_log.v_authorization_replay_health_v2 | `mesh_log.v_authorization_replay_health_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh.auth_authority_readiness_v | `mesh.auth_authority_readiness_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh.auth_current_delegation_permission_scope_v | `mesh.auth_current_delegation_permission_scope_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh.auth_current_group_member_v | `mesh.auth_current_group_member_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh.auth_current_group_role_v | `mesh.auth_current_group_role_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh.auth_current_plane_membership_v | `mesh.auth_current_plane_membership_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh.auth_plane_membership_legacy_compare_v | `mesh.auth_plane_membership_legacy_compare_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh.auth_published_role_permission_v | `mesh.auth_published_role_permission_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh.auth_scope_target_resolved_v | `mesh.auth_scope_target_resolved_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.control.authorization_v2_catalog_entity_aligned | `control.authorization_v2_catalog_entity_aligned` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.control.authorization_v2_is_effective | `control.authorization_v2_is_effective` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.control.authorization_v2_window_contains | `control.authorization_v2_window_contains` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.control.trg_authorization_v2_guard_entity_operation | `control.trg_authorization_v2_guard_entity_operation` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.control.trg_authorization_v2_guard_operation_plane | `control.trg_authorization_v2_guard_operation_plane` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.control.trg_authorization_v2_guard_permission | `control.trg_authorization_v2_guard_permission` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.control.trg_authorization_v2_guard_scope_binding | `control.trg_authorization_v2_guard_scope_binding` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.control.trg_authorization_v2_guard_scope_policy | `control.trg_authorization_v2_guard_scope_policy` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_begin_replay_v2 | `event.fn_authorization_begin_replay_v2` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_bind_replay_v2 | `event.fn_authorization_bind_replay_v2` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_bump_epoch_v2 | `event.fn_authorization_bump_epoch_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_claim_invalidations_v2 | `event.fn_authorization_claim_invalidations_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_complete_invalidation_v2 | `event.fn_authorization_complete_invalidation_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_complete_replay_v2 | `event.fn_authorization_complete_replay_v2` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_emit_invalidation_v2 | `event.fn_authorization_emit_invalidation_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_fail_invalidation_v2 | `event.fn_authorization_fail_invalidation_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_set_replay_event_context_v2 | `event.fn_authorization_set_replay_event_context_v2` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_stage_replay_v2 | `event.fn_authorization_stage_replay_v2` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_supersede_scheduled_v2 | `event.fn_authorization_supersede_scheduled_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_v2_json_uuid_values | `event.fn_authorization_v2_json_uuid_values` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_v2_safe_timestamptz | `event.fn_authorization_v2_safe_timestamptz` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_v2_safe_uuid | `event.fn_authorization_v2_safe_uuid` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_v2_source_row_key | `event.fn_authorization_v2_source_row_key` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.trg_authorization_authority_invalidate_v2 | `event.trg_authorization_authority_invalidate_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.trg_authorization_invalidation_immutable_v2 | `event.trg_authorization_invalidation_immutable_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.trg_authorization_v2_replay_inbox_immutable | `event.trg_authorization_v2_replay_inbox_immutable` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.event.trg_authorization_v2_replay_state_guard | `event.trg_authorization_v2_replay_state_guard` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.log.trg_auth_decision_evidence_v2_immutable | `log.trg_auth_decision_evidence_v2_immutable` | neon | authorization_decision_evidence | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.auth_v2_entity_is_eligible | `master.auth_v2_entity_is_eligible` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.auth_v2_permission_is_effective | `master.auth_v2_permission_is_effective` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.auth_v2_permission_is_eligible | `master.auth_v2_permission_is_eligible` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.auth_v2_principal_has_plane | `master.auth_v2_principal_has_plane` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.current_auth_plane_code | `master.current_auth_plane_code` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.current_auth_plane_code_soft | `master.current_auth_plane_code_soft` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.publish_auth_role_compilation | `master.publish_auth_role_compilation` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_compilation_child_guard | `master.trg_auth_compilation_child_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_delegation_child_guard | `master.trg_auth_delegation_child_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_delegation_guard | `master.trg_auth_delegation_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_deny_binding_guard | `master.trg_auth_deny_binding_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_deny_rule_guard | `master.trg_auth_deny_rule_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_group_guard | `master.trg_auth_group_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_group_member_guard | `master.trg_auth_group_member_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_group_role_guard | `master.trg_auth_group_role_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_override_guard | `master.trg_auth_override_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_permission_set_guard | `master.trg_auth_permission_set_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_permission_set_rule_guard | `master.trg_auth_permission_set_rule_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_plane_membership_guard | `master.trg_auth_plane_membership_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_record_acl_guard | `master.trg_auth_record_acl_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_record_acl_permission_guard | `master.trg_auth_record_acl_permission_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_role_compilation_guard | `master.trg_auth_role_compilation_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_role_guard | `master.trg_auth_role_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_scope_child_guard | `master.trg_auth_scope_child_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_scope_target_guard | `master.trg_auth_scope_target_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_auth_v2_retention_guard | `master.trg_auth_v2_retention_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.function.master.trg_tenant_entitlement_override_guard | `master.trg_tenant_entitlement_override_guard` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.control.auth_catalog_owner | `control.auth_catalog_owner` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.control.auth_permission | `control.auth_permission` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 3 | 0 |
| wave1.neon.table.control.auth_permission_plane | `control.auth_permission_plane` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.control.auth_permission_scope_policy | `control.auth_permission_scope_policy` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.control.auth_plane | `control.auth_plane` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.control.authorization_v2_conservation_ledger | `control.authorization_v2_conservation_ledger` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.control.authorization_v2_deferred_constraint_registry | `control.authorization_v2_deferred_constraint_registry` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.control.authorization_v2_expand_installation | `control.authorization_v2_expand_installation` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.control.authorization_v2_frozen_legacy_object | `control.authorization_v2_frozen_legacy_object` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.control.authorization_v2_transformer_registry | `control.authorization_v2_transformer_registry` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.control.entity_operation_plane | `control.entity_operation_plane` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.control.entity_scope_binding | `control.entity_scope_binding` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.event.authorization_global_epoch_v2 | `event.authorization_global_epoch_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.event.authorization_invalidation_outbox_v2 | `event.authorization_invalidation_outbox_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.event.authorization_plane_epoch_v2 | `event.authorization_plane_epoch_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.event.authorization_tenant_epoch_v2 | `event.authorization_tenant_epoch_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.event.authorization_v2_replay_application | `event.authorization_v2_replay_application` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.event.authorization_v2_replay_binding | `event.authorization_v2_replay_binding` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.event.authorization_v2_replay_inbox | `event.authorization_v2_replay_inbox` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.event.authorization_v2_replay_transaction | `event.authorization_v2_replay_transaction` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.log.auth_decision_evidence_v2 | `log.auth_decision_evidence_v2` | neon | authorization_decision_evidence | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.log.auth_decision_evidence_v2_default | `log.auth_decision_evidence_v2_default` | neon | authorization_decision_evidence | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_delegation | `master.auth_delegation` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_delegation_permission | `master.auth_delegation_permission` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_delegation_permission_scope | `master.auth_delegation_permission_scope` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_deny_rule | `master.auth_deny_rule` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_deny_rule_group | `master.auth_deny_rule_group` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_deny_rule_hard_policy | `master.auth_deny_rule_hard_policy` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_deny_rule_principal | `master.auth_deny_rule_principal` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_group_member_v2 | `master.auth_group_member_v2` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_group_role_v2 | `master.auth_group_role_v2` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_group_v2 | `master.auth_group_v2` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_override | `master.auth_override` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_permission_set | `master.auth_permission_set` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_permission_set_rule | `master.auth_permission_set_rule` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_plane_membership | `master.auth_plane_membership` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.master.auth_record_acl | `master.auth_record_acl` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_record_acl_permission | `master.auth_record_acl_permission` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_role | `master.auth_role` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.master.auth_role_compilation | `master.auth_role_compilation` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_role_permission | `master.auth_role_permission` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.master.auth_role_permission_set | `master.auth_role_permission_set` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_scope_company | `master.auth_scope_company` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_scope_legal_entity | `master.auth_scope_legal_entity` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_scope_operating_organization | `master.auth_scope_operating_organization` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_scope_target | `master.auth_scope_target` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.master.auth_scope_tenant | `master.auth_scope_tenant` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.tenant_entitlement_override | `master.tenant_entitlement_override` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.shared.auth_permission_category | `shared.auth_permission_category` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.view.control.v_authorization_v2_deferred_constraints | `control.v_authorization_v2_deferred_constraints` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.view.control.v_authorization_v2_operation_publication | `control.v_authorization_v2_operation_publication` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.view.event.v_authorization_invalidation_health_v2 | `event.v_authorization_invalidation_health_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.view.event.v_authorization_replay_health_v2 | `event.v_authorization_replay_health_v2` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.view.master.auth_current_delegation_permission_scope_v | `master.auth_current_delegation_permission_scope_v` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.view.master.auth_current_group_member_v | `master.auth_current_group_member_v` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.view.master.auth_current_group_role_v | `master.auth_current_group_role_v` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.view.master.auth_current_plane_membership_v | `master.auth_current_plane_membership_v` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.view.master.auth_published_role_permission_v | `master.auth_published_role_permission_v` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.view.master.auth_scope_target_resolved_v | `master.auth_scope_target_resolved_v` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave2.mesh.table.mesh_control.auth_catalog_reference_v2 | `mesh_control.auth_catalog_reference_v2` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave2.mesh.table.mesh_control.auth_permission_alias_v2 | `mesh_control.auth_permission_alias_v2` | mesh | authorization_migration_control | mesh-platform | mesh | remove_after_certified_catalog_cutover | 0 | 0 | 0 |
| wave2.neon.table.control.auth_catalog_reference_v2 | `control.auth_catalog_reference_v2` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave2.neon.table.control.auth_permission_alias_v2 | `control.auth_permission_alias_v2` | neon | authorization_migration_control | platform-iam | studio, neon | remove_after_certified_catalog_cutover | 0 | 0 | 0 |
| wave3.mesh.function.mesh_control.trg_authorization_v3_scope_mapping_guard | `mesh_control.trg_authorization_v3_scope_mapping_guard` | mesh | authorization_migration_control | mesh-platform | mesh | retain_until_migration_evidence_is_sealed | 0 | 0 | 0 |
| wave3.mesh.function.mesh_control.trg_authorization_v3_subject_mapping_guard | `mesh_control.trg_authorization_v3_subject_mapping_guard` | mesh | authorization_migration_control | mesh-platform | mesh | retain_until_migration_evidence_is_sealed | 0 | 0 | 0 |
| wave3.mesh.table.mesh_control.authorization_v3_scope_mapping | `mesh_control.authorization_v3_scope_mapping` | mesh | authorization_migration_control | mesh-platform | mesh | retain_as_migration_evidence | 0 | 0 | 0 |
| wave3.mesh.table.mesh_control.authorization_v3_subject_mapping | `mesh_control.authorization_v3_subject_mapping` | mesh | authorization_migration_control | mesh-platform | mesh | retain_as_migration_evidence | 0 | 0 | 0 |
| wave3.neon.function.control.trg_authorization_v3_scope_mapping_guard | `control.trg_authorization_v3_scope_mapping_guard` | neon | authorization_migration_control | platform-iam | studio, neon | retain_until_migration_evidence_is_sealed | 0 | 0 | 0 |
| wave3.neon.function.control.trg_authorization_v3_subject_mapping_guard | `control.trg_authorization_v3_subject_mapping_guard` | neon | authorization_migration_control | platform-iam | studio, neon | retain_until_migration_evidence_is_sealed | 0 | 0 | 0 |
| wave3.neon.table.control.authorization_v3_scope_mapping | `control.authorization_v3_scope_mapping` | neon | authorization_migration_control | platform-iam | studio, neon | retain_as_migration_evidence | 0 | 0 | 0 |
| wave3.neon.table.control.authorization_v3_subject_mapping | `control.authorization_v3_subject_mapping` | neon | authorization_migration_control | platform-iam | studio, neon | retain_as_migration_evidence | 0 | 0 | 0 |
| wave4.mesh.function.mesh.resolve_account_permission_entitlement | `mesh.resolve_account_permission_entitlement` | mesh | canonical_entitlement_evaluator | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave4.mesh.table.mesh_control.auth_entitlement_policy | `mesh_control.auth_entitlement_policy` | mesh | canonical_entitlement_policy | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave4.mesh.table.mesh_control.authorization_v4_legacy_exception_disposition | `mesh_control.authorization_v4_legacy_exception_disposition` | mesh | authorization_migration_control | mesh-platform | mesh | retain_as_migration_evidence | 0 | 0 | 0 |
| wave4.mesh.table.mesh.account_entitlement | `mesh.account_entitlement` | mesh | canonical_entitlement_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave4.neon.function.control.resolve_admin_permission_entitlement | `control.resolve_admin_permission_entitlement` | neon | canonical_entitlement_evaluator | platform-iam | studio | promote_after_certified_cutover | 0 | 0 | 0 |
| wave4.neon.function.master.resolve_neon_permission_entitlement | `master.resolve_neon_permission_entitlement` | neon | canonical_entitlement_evaluator | platform-iam | neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave4.neon.table.control.auth_admin_entitlement_policy | `control.auth_admin_entitlement_policy` | neon | canonical_entitlement_policy | platform-iam | studio | promote_after_certified_cutover | 0 | 0 | 0 |
| wave4.neon.table.control.auth_entitlement_target_policy | `control.auth_entitlement_target_policy` | neon | canonical_entitlement_policy | platform-iam | neon | promote_after_certified_cutover | 0 | 2 | 0 |
| wave4.neon.table.control.authorization_v4_access_grant_disposition | `control.authorization_v4_access_grant_disposition` | neon | authorization_migration_control | platform-iam | studio, neon | retain_as_migration_evidence | 0 | 0 | 0 |
| wave4.neon.table.control.authorization_v4_feature_grant_disposition | `control.authorization_v4_feature_grant_disposition` | neon | authorization_migration_control | platform-iam | studio, neon | retain_as_migration_evidence | 0 | 0 | 0 |
| wave4.neon.table.control.authorization_v4_role_deny_disposition | `control.authorization_v4_role_deny_disposition` | neon | authorization_migration_control | platform-iam | studio, neon | retain_as_migration_evidence | 0 | 0 | 0 |
| wave5.mesh.function.mesh_control.trg_authorization_v5_consumer_guard | `mesh_control.trg_authorization_v5_consumer_guard` | mesh | authorization_v2_runtime | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave5.mesh.function.mesh_control.trg_authorization_v5_release_guard | `mesh_control.trg_authorization_v5_release_guard` | mesh | authorization_v2_runtime | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave5.mesh.table.mesh_control.authorization_consumer_migration_v2 | `mesh_control.authorization_consumer_migration_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave5.mesh.table.mesh_control.authorization_runtime_release_v2 | `mesh_control.authorization_runtime_release_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave5.neon.function.control.trg_authorization_v5_consumer_guard | `control.trg_authorization_v5_consumer_guard` | neon | authorization_v2_runtime | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave5.neon.function.control.trg_authorization_v5_release_guard | `control.trg_authorization_v5_release_guard` | neon | authorization_v2_runtime | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave5.neon.table.control.authorization_consumer_migration_v2 | `control.authorization_consumer_migration_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave5.neon.table.control.authorization_runtime_release_v2 | `control.authorization_runtime_release_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_freeze_legacy_writes_v2 | `mesh_control.fn_authorization_freeze_legacy_writes_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_install_legacy_freeze_guards_v2 | `mesh_control.fn_authorization_install_legacy_freeze_guards_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_install_target_guard_v2 | `mesh_control.fn_authorization_install_target_guard_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_set_cohort_state_v2 | `mesh_control.fn_authorization_set_cohort_state_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_set_resolver_state_v2 | `mesh_control.fn_authorization_set_resolver_state_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_switch_writer_v2 | `mesh_control.fn_authorization_switch_writer_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_validate_target_guard_v2 | `mesh_control.fn_authorization_validate_target_guard_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.function.mesh_control.trg_authorization_cohort_guard_v2 | `mesh_control.trg_authorization_cohort_guard_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.function.mesh_control.trg_authorization_cutover_state_guard_v2 | `mesh_control.trg_authorization_cutover_state_guard_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.function.mesh_control.trg_authorization_legacy_write_freeze_v2 | `mesh_control.trg_authorization_legacy_write_freeze_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.function.mesh_control.trg_authorization_target_writer_v2 | `mesh_control.trg_authorization_target_writer_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.function.mesh_control.trg_authorization_wave7_immutable_v2 | `mesh_control.trg_authorization_wave7_immutable_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.table.mesh_control.authorization_cutover_cohort_v2 | `mesh_control.authorization_cutover_cohort_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.table.mesh_control.authorization_cutover_plane_v2 | `mesh_control.authorization_cutover_plane_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.table.mesh_control.authorization_shadow_mismatch_disposition_v2 | `mesh_control.authorization_shadow_mismatch_disposition_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.table.mesh_control.authorization_target_guard_installation_v2 | `mesh_control.authorization_target_guard_installation_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.table.mesh_control.authorization_writer_switch_receipt_v2 | `mesh_control.authorization_writer_switch_receipt_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.table.mesh_log.authorization_cutover_load_evidence_v2 | `mesh_log.authorization_cutover_load_evidence_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.table.mesh_log.authorization_shadow_comparison_v2 | `mesh_log.authorization_shadow_comparison_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.mesh.view.mesh_log.v_authorization_wave7_readiness_v2 | `mesh_log.v_authorization_wave7_readiness_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_freeze_legacy_writes_v2 | `control.fn_authorization_freeze_legacy_writes_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_install_legacy_freeze_guards_v2 | `control.fn_authorization_install_legacy_freeze_guards_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_install_target_guard_v2 | `control.fn_authorization_install_target_guard_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_set_cohort_state_v2 | `control.fn_authorization_set_cohort_state_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_set_resolver_state_v2 | `control.fn_authorization_set_resolver_state_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_switch_writer_v2 | `control.fn_authorization_switch_writer_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_validate_target_guard_v2 | `control.fn_authorization_validate_target_guard_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.function.control.trg_authorization_cohort_guard_v2 | `control.trg_authorization_cohort_guard_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.function.control.trg_authorization_cutover_state_guard_v2 | `control.trg_authorization_cutover_state_guard_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.function.control.trg_authorization_legacy_write_freeze_v2 | `control.trg_authorization_legacy_write_freeze_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.function.control.trg_authorization_target_writer_v2 | `control.trg_authorization_target_writer_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.function.control.trg_authorization_wave7_immutable_v2 | `control.trg_authorization_wave7_immutable_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.table.control.authorization_cutover_cohort_v2 | `control.authorization_cutover_cohort_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.table.control.authorization_cutover_plane_v2 | `control.authorization_cutover_plane_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.table.control.authorization_shadow_mismatch_disposition_v2 | `control.authorization_shadow_mismatch_disposition_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.table.control.authorization_target_guard_installation_v2 | `control.authorization_target_guard_installation_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.table.control.authorization_writer_switch_receipt_v2 | `control.authorization_writer_switch_receipt_v2` | neon | authorization_cutover_control | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.table.event.authorization_cutover_load_evidence_v2 | `event.authorization_cutover_load_evidence_v2` | neon | authorization_decision_evidence | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.table.event.authorization_shadow_comparison_v2 | `event.authorization_shadow_comparison_v2` | neon | authorization_decision_evidence | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave7.neon.view.event.v_authorization_wave7_readiness_v2 | `event.v_authorization_wave7_readiness_v2` | neon | authorization_decision_evidence | platform-iam | studio, neon | retain_through_certified_observation | 0 | 0 | 0 |
| wave9.both.function.public.trg_authorization_contraction_receipt_v2_immutable | `public.trg_authorization_contraction_receipt_v2_immutable` | neon_and_mesh | authorization_contraction_evidence | platform-iam+mesh-platform | studio, neon, mesh | retain_with_contraction_receipt | 0 | 0 | 0 |
| wave9.both.table.public.authorization_contraction_receipt_v2 | `public.authorization_contraction_receipt_v2` | neon_and_mesh | authorization_contraction_evidence | platform-iam+mesh-platform | studio, neon, mesh | retain_as_immutable_contraction_evidence | 0 | 0 | 0 |

## Authorization-linked database functions, triggers, and views

| Kind | Exact identity | Classification | Owner | Disposition | Source | Dependencies |
|---|---|---|---|---|---|---|
| table | `audit.authorization_decision_d` | structural_dependency | audit-platform | review_with_registered_dependency | server/db/ddl/common/audit/02_domains.sql:74 | — |
| table | `audit.authorization_decision_evidence` | structural_dependency | audit-platform | review_with_registered_dependency | server/db/ddl/common/audit/03_tables.sql:219 | — |
| table | `audit.authorization_decision_evidence_default` | structural_dependency | audit-platform | review_with_registered_dependency | server/db/ddl/common/audit/03_tables.sql:309 | — |
| trigger | `audit.authorization_decision_evidence.trg_authorization_decision_05_prepare` | structural_dependency | audit-platform | review_with_registered_dependency | server/db/ddl/common/audit/08_triggers.sql:37 | — |
| trigger | `audit.authorization_decision_evidence.trg_authorization_decision_immutable` | structural_dependency | audit-platform | review_with_registered_dependency | server/db/ddl/common/audit/08_triggers.sql:41 | — |
| function | `audit.trg_prepare_audit_log` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/audit/07_functions.sql:117 | `master.principal` |
| function | `audit.trg_prepare_authorization_decision` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/audit/07_functions.sql:603 | `master.principal` |
| function | `audit.trg_prepare_security_event` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/audit/07_functions.sql:659 | `master.principal` |
| table | `authz.acl_status_d` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/02_domains.sql:147 | — |
| table | `authz.delegation` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/03_tables.sql:380 | — |
| table | `authz.delegation_grant` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/03_tables.sql:454 | — |
| trigger | `authz.delegation_grant.trg_delegation_grant_10_validate` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:278 | — |
| trigger | `authz.delegation_grant.trg_delegation_grant_20_parent_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:282 | — |
| trigger | `authz.delegation.trg_delegation_10_normalize` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:241 | — |
| trigger | `authz.delegation.trg_delegation_20_identity_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:247 | — |
| trigger | `authz.delegation.trg_delegation_21_natural_key_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:251 | — |
| trigger | `authz.delegation.trg_delegation_30_active_subject` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:255 | — |
| trigger | `authz.delegation.trg_delegation_35_audit_evidence` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:392 | — |
| trigger | `authz.delegation.trg_delegation_40_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:261 | — |
| trigger | `authz.delegation.trg_delegation_50_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:270 | — |
| trigger | `authz.delegation.trg_delegation_60_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:274 | — |
| trigger | `authz.delegation.trg_delegation_90_delete_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:437 | — |
| function | `authz.fn_internal_permission_is_assignable_at_scope` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:390 | — |
| function | `authz.fn_permission_is_assignable_at_scope` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:424 | — |
| function | `authz.fn_reconcile_expired_authority` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:1318 | `master.principal` |
| function | `authz.fn_stage_application_projection` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:1414 | `master.tenant` |
| table | `authz.permission` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/03_tables.sql:5 | — |
| table | `authz.permission_kind_d` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/02_domains.sql:12 | — |
| table | `authz.permission_scope_kind` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/03_tables.sql:40 | — |
| trigger | `authz.permission_scope_kind.trg_permission_scope_kind_50_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:23 | — |
| trigger | `authz.permission.trg_permission_10_normalize` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:2 | — |
| trigger | `authz.permission.trg_permission_20_definition_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:7 | — |
| trigger | `authz.permission.trg_permission_30_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:11 | — |
| trigger | `authz.permission.trg_permission_35_audit_evidence` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:360 | — |
| trigger | `authz.permission.trg_permission_40_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:15 | — |
| trigger | `authz.permission.trg_permission_50_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:19 | — |
| trigger | `authz.permission.trg_permission_90_delete_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:405 | — |
| table | `authz.record_acl` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/03_tables.sql:537 | — |
| trigger | `authz.record_acl.trg_record_acl_10_normalize` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:322 | — |
| trigger | `authz.record_acl.trg_record_acl_20_identity_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:327 | — |
| trigger | `authz.record_acl.trg_record_acl_21_natural_key_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:331 | — |
| trigger | `authz.record_acl.trg_record_acl_30_validate_permission` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:335 | — |
| trigger | `authz.record_acl.trg_record_acl_31_active_subject` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:340 | — |
| trigger | `authz.record_acl.trg_record_acl_35_audit_evidence` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:400 | — |
| trigger | `authz.record_acl.trg_record_acl_40_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:347 | — |
| trigger | `authz.record_acl.trg_record_acl_50_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:351 | — |
| trigger | `authz.record_acl.trg_record_acl_60_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:355 | — |
| trigger | `authz.record_acl.trg_record_acl_90_delete_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:445 | — |
| table | `authz.role_permission` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/03_tables.sql:192 | — |
| trigger | `authz.role_permission.trg_role_permission_10_identity_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:113 | — |
| trigger | `authz.role_permission.trg_role_permission_20_parent_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:117 | — |
| trigger | `authz.role_permission.trg_role_permission_50_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:121 | — |
| function | `authz.trg_guard_delegation_grant` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:952 | — |
| function | `authz.trg_guard_permission_definition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:200 | — |
| function | `authz.trg_guard_role_permission` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:536 | — |
| function | `authz.trg_validate_active_subject` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:841 | `master.principal`<br>`master.tenant` |
| function | `authz.trg_validate_delegation_activation` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:992 | `master.principal` |
| function | `authz.trg_validate_group_member` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:704 | `master.principal` |
| function | `authz.trg_validate_permission_publish` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:244 | — |
| function | `control.capture_entitlement_plan` | structural_dependency | metadata-platform+platform-iam+platform-runtime+policy-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/common/control/07_functions.sql:731 | — |
| function | `control.effective_tenant_entitlement` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/control/07_functions.sql:776 | `master.tenant` |
| function | `control.entitlement_plan_at` | structural_dependency | metadata-platform+platform-iam+platform-runtime+policy-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/common/control/07_functions.sql:760 | — |
| function | `control.fn_provision_external_workforce_exchange` | structural_dependency | mesh-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/control/07_functions.sql:695 | `master.principal`<br>`mesh.network_account` |
| function | `control.fn_validate_owner_type_target` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/control/07_functions.sql:1 | `master.tenant` |
| function | `control.fn_validate_owner_type_target` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/control/07_functions.sql:1 | `master.tenant` |
| function | `control.fn_validate_owner_type_target` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/control/07_functions.sql:1 | `master.tenant` |
| function | `control.generate_fiscal_periods` | structural_dependency | finance-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/control/07_functions.sql:3792 | `master.company_code`<br>`master.principal` |
| trigger | `control.subscription_plan.subscription_plan_entitlement_capture` | structural_dependency | metadata-platform+platform-iam+platform-runtime+policy-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/common/snapshot/08_triggers.sql:25 | — |
| trigger | `control.subscription_plan.subscription_plan_entitlement_version` | structural_dependency | metadata-platform+platform-iam+platform-runtime+policy-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/common/control/08_triggers.sql:270 | — |
| table | `control.tenant_module_entitlement_override` | structural_dependency | metadata-platform+platform-iam+platform-runtime+policy-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/common/control/03_tables.sql:1503 | — |
| trigger | `control.tenant_module_entitlement_override.tenant_module_entitlement_override_guard` | structural_dependency | metadata-platform+platform-iam+platform-runtime+policy-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/common/control/08_triggers.sql:277 | — |
| function | `control.trg_capture_entitlement_plan` | structural_dependency | metadata-platform+platform-iam+platform-runtime+policy-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/common/control/07_functions.sql:752 | — |
| function | `control.trg_guard_module_entitlement_override` | structural_dependency | metadata-platform+platform-iam+platform-runtime+policy-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/common/control/07_functions.sql:718 | — |
| function | `control.trg_guard_process_task_rule_release` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/control/17_process_task_rule_publication.sql:26 | `master.principal`<br>`master.principal_identity_binding` |
| function | `control.trg_validate_decision_scope` | structural_dependency | finance-platform+organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/control/07_functions.sql:856 | `master.company_code`<br>`master.operating_organization` |
| function | `control.trg_version_entitlement_plan` | structural_dependency | metadata-platform+platform-iam+platform-runtime+policy-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/common/control/07_functions.sql:688 | — |
| function | `control.trg_version_entitlement_plan_components` | structural_dependency | metadata-platform+platform-iam+platform-runtime+policy-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/common/control/07_functions.sql:696 | — |
| function | `document.command_process_task_escalate` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/document/07_task_interactions.sql:187 | `master.principal` |
| function | `document.fn_business_partner_request_approvers` | structural_dependency | finance-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/document/07_functions.sql:3941 | `master.company_code`<br>`master.operating_organization`<br>`master.principal` |
| function | `document.fn_company_setup_case_approvers` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/document/07_functions.sql:5453 | `master.principal` |
| function | `document.fn_company_setup_case_approvers` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260912_company_pilot_lifecycle.sql:212 | `master.principal` |
| function | `document.fn_company_setup_case_approvers` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/scripts/tests/integration/fixtures/legacy-upgrades/20260912_company_pilot_approver_visibility.sql:4 | `master.principal` |
| function | `document.fn_workflow_sla_due_tenants` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/document/07_functions.sql:181 | `master.tenant` |
| function | `document.fn_workflow_sla_due_tenants` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/document/07_task_interactions.sql:377 | `master.tenant` |
| function | `document.fn_workforce_request_approvers` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/document/07_functions.sql:3144 | `master.principal` |
| function | `document.process_case_reviewers` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/document/07_functions.sql:5897 | `master.principal` |
| function | `document.process_document_candidates` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/document/07_functions.sql:5858 | `master.principal` |
| function | `document.trg_company_owned_case` | structural_dependency | finance-platform+organization-platform | review_with_registered_dependency | server/db/ddl/common/document/07_functions.sql:212 | `master.company_code`<br>`master.operating_organization` |
| function | `document.trg_company_owned_case` | structural_dependency | finance-platform+organization-platform | review_with_registered_dependency | server/db/scripts/tests/integration/fixtures/legacy-upgrades/20260911_company_owned_case_pilot.sql:9 | `master.company_code`<br>`master.operating_organization` |
| table | `event.authorization_invalidation_outbox` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/event/03_tables.sql:409 | — |
| trigger | `event.authorization_invalidation_outbox.trg_authorization_invalidation_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/event/08_triggers.sql:69 | — |
| trigger | `event.authorization_invalidation_outbox.trg_authorization_invalidation_notify` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/event/08_triggers.sql:96 | — |
| function | `event.fn_authorization_bump_epoch` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/event/07_functions.sql:118 | — |
| function | `event.fn_authorization_claim_invalidations` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/event/07_functions.sql:212 | — |
| function | `event.fn_authorization_complete_invalidation` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/event/07_functions.sql:236 | — |
| function | `event.fn_authorization_emit_invalidation` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/event/07_functions.sql:171 | — |
| function | `event.fn_authorization_fail_invalidation` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/event/07_functions.sql:248 | — |
| function | `event.fn_notification_worker_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/event/07_functions.sql:326 | `master.principal` |
| function | `event.trg_authorization_invalidation_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/event/08_triggers.sql:50 | — |
| function | `event.trg_capture_authorization_invalidation` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/08_triggers.sql:457 | — |
| trigger | `master.company_code.trg_company_code_identity_immutable` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:359 | `master.company_code` |
| trigger | `master.company_code.trg_company_code_status_changed` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:361 | `master.company_code` |
| trigger | `master.company_code.trg_company_code_updated_at` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:363 | `master.company_code` |
| function | `master.fn_resolve_dimension_set` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:1327 | `master.company_code` |
| function | `master.fn_resolve_principal_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:854 | `master.principal`<br>`master.principal_identity_binding` |
| function | `master.fn_resolve_principal_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:899 | `master.principal`<br>`master.principal_identity_binding` |
| function | `master.fn_resolve_principal_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:895 | `master.principal`<br>`master.principal_identity_binding` |
| table | `master.identity_provider_d` | structural_dependency | commercial-platform+content-platform+document-platform+finance-platform+mesh-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/02_domains.sql:36 | — |
| table | `master.identity_provider_d` | structural_dependency | commercial-platform+content-platform+document-platform+finance-platform+mesh-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/02_domains.sql:38 | — |
| table | `master.identity_provider_d` | structural_dependency | commercial-platform+content-platform+document-platform+finance-platform+mesh-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/02_domains.sql:47 | — |
| trigger | `master.legal_entity.trg_legal_entity_hierarchy_cycle` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:353 | `master.legal_entity` |
| trigger | `master.legal_entity.trg_legal_entity_identity_immutable` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:347 | `master.legal_entity` |
| trigger | `master.legal_entity.trg_legal_entity_status_changed` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:349 | `master.legal_entity` |
| trigger | `master.legal_entity.trg_legal_entity_updated_at` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:351 | `master.legal_entity` |
| trigger | `master.legal_entity.wave6_legal_entity_amendment` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1556 | `master.legal_entity` |
| trigger | `master.legal_entity.wave6_legal_entity_lifecycle` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1554 | `master.legal_entity` |
| trigger | `master.legal_entity.wave6_legal_entity_scope` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1560 | `master.legal_entity` |
| view | `master.mv_company_postable_account` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/09_views.sql:26 | `master.company_code` |
| trigger | `master.operating_organization.trg_operating_organization_hierarchy_cycle` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:379 | `master.operating_organization` |
| trigger | `master.operating_organization.trg_operating_organization_identity_immutable` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:373 | `master.operating_organization` |
| trigger | `master.operating_organization.trg_operating_organization_status_changed` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:375 | `master.operating_organization` |
| trigger | `master.operating_organization.trg_operating_organization_updated_at` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:377 | `master.operating_organization` |
| trigger | `master.operating_organization.wave6_operating_organization_amendment` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1557 | `master.operating_organization` |
| trigger | `master.operating_organization.wave6_operating_organization_lifecycle` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1555 | `master.operating_organization` |
| trigger | `master.operating_organization.wave6_operating_organization_scope` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1561 | `master.operating_organization` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_10_normalize` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:204 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_10_normalize` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:204 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_10_normalize` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:214 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_20_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:211 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_20_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:211 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_20_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:221 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_30_validate_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:217 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_30_validate_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:217 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_30_validate_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:227 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_40_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:222 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_40_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:222 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_40_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:232 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:226 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:226 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_principal_identity_binding_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:236 | `master.principal_identity_binding` |
| trigger | `master.principal_profile.trg_principal_profile_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:196 | `master.principal_profile` |
| trigger | `master.principal_profile.trg_principal_profile_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:196 | `master.principal_profile` |
| trigger | `master.principal_profile.trg_principal_profile_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:206 | `master.principal_profile` |
| trigger | `master.principal_profile.trg_principal_profile_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:200 | `master.principal_profile` |
| trigger | `master.principal_profile.trg_principal_profile_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:200 | `master.principal_profile` |
| trigger | `master.principal_profile.trg_principal_profile_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:210 | `master.principal_profile` |
| trigger | `master.principal.trg_principal_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:182 | `master.principal` |
| trigger | `master.principal.trg_principal_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:182 | `master.principal` |
| trigger | `master.principal.trg_principal_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:192 | `master.principal` |
| trigger | `master.principal.trg_principal_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:188 | `master.principal` |
| trigger | `master.principal.trg_principal_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:188 | `master.principal` |
| trigger | `master.principal.trg_principal_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:198 | `master.principal` |
| trigger | `master.principal.trg_principal_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:192 | `master.principal` |
| trigger | `master.principal.trg_principal_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:192 | `master.principal` |
| trigger | `master.principal.trg_principal_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:202 | `master.principal` |
| function | `master.seed_audit_reason_catalog` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/audit/07_functions.sql:418 | `master.principal` |
| function | `master.seed_condition_type_catalog` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:2866 | `master.principal` |
| trigger | `master.team_member.trg_team_member_10_normalize` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:155 | `master.team_member` |
| trigger | `master.team_member.trg_team_member_10_normalize` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:155 | `master.team_member` |
| trigger | `master.team_member.trg_team_member_10_normalize` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:165 | `master.team_member` |
| trigger | `master.team_member.trg_team_member_20_guard` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:160 | `master.team_member` |
| trigger | `master.team_member.trg_team_member_20_guard` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:160 | `master.team_member` |
| trigger | `master.team_member.trg_team_member_20_guard` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:170 | `master.team_member` |
| trigger | `master.team.trg_team_10_normalize` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:137 | `master.team` |
| trigger | `master.team.trg_team_10_normalize` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:137 | `master.team` |
| trigger | `master.team.trg_team_10_normalize` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:147 | `master.team` |
| trigger | `master.team.trg_team_identity_immutable` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:142 | `master.team` |
| trigger | `master.team.trg_team_identity_immutable` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:142 | `master.team` |
| trigger | `master.team.trg_team_identity_immutable` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:152 | `master.team` |
| trigger | `master.team.trg_team_status_changed` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:147 | `master.team` |
| trigger | `master.team.trg_team_status_changed` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:147 | `master.team` |
| trigger | `master.team.trg_team_status_changed` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:157 | `master.team` |
| trigger | `master.team.trg_team_updated_at` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:151 | `master.team` |
| trigger | `master.team.trg_team_updated_at` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:151 | `master.team` |
| trigger | `master.team.trg_team_updated_at` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:161 | `master.team` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:25 | `master.tenant_relationship` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:25 | `master.tenant_relationship` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:31 | `master.tenant_relationship` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:30 | `master.tenant_relationship` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:30 | `master.tenant_relationship` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:36 | `master.tenant_relationship` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:35 | `master.tenant_relationship` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:35 | `master.tenant_relationship` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:41 | `master.tenant_relationship` |
| trigger | `master.tenant.trg_tenant_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:1 | `master.tenant` |
| trigger | `master.tenant.trg_tenant_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1 | `master.tenant` |
| trigger | `master.tenant.trg_tenant_identity_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:7 | `master.tenant` |
| trigger | `master.tenant.trg_tenant_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:5 | `master.tenant` |
| trigger | `master.tenant.trg_tenant_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:5 | `master.tenant` |
| trigger | `master.tenant.trg_tenant_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:11 | `master.tenant` |
| trigger | `master.tenant.trg_tenant_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/08_triggers.sql:9 | `master.tenant` |
| trigger | `master.tenant.trg_tenant_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:9 | `master.tenant` |
| trigger | `master.tenant.trg_tenant_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/08_triggers.sql:15 | `master.tenant` |
| function | `master.trg_guard_principal_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:649 | `master.principal` |
| function | `master.trg_guard_principal_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:694 | `master.principal` |
| function | `master.trg_guard_principal_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:690 | `master.principal` |
| function | `master.trg_guard_principal_identity_binding` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:747 | `master.principal_identity_binding` |
| function | `master.trg_guard_principal_identity_binding` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:792 | `master.principal_identity_binding` |
| function | `master.trg_guard_principal_identity_binding` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:788 | `master.principal_identity_binding` |
| function | `master.trg_guard_team_identity` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:489 | `master.team` |
| function | `master.trg_guard_team_identity` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:534 | `master.team` |
| function | `master.trg_guard_team_identity` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:530 | `master.team` |
| function | `master.trg_guard_team_member` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:524 | `master.team_member` |
| function | `master.trg_guard_team_member` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:569 | `master.team_member` |
| function | `master.trg_guard_team_member` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:565 | `master.team_member` |
| function | `master.trg_guard_tenant_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:1 | `master.tenant` |
| function | `master.trg_guard_tenant_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:1 | `master.tenant` |
| function | `master.trg_guard_tenant_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:42 | `master.tenant` |
| function | `master.trg_guard_tenant_relationship_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:164 | `master.tenant_relationship` |
| function | `master.trg_guard_tenant_relationship_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:205 | `master.tenant_relationship` |
| function | `master.trg_guard_tenant_relationship_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:205 | `master.tenant_relationship` |
| function | `master.trg_normalize_principal_identity_binding` | structural_dependency | commercial-platform+content-platform+document-platform+finance-platform+mesh-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:729 | — |
| function | `master.trg_normalize_principal_identity_binding` | structural_dependency | commercial-platform+content-platform+document-platform+finance-platform+mesh-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:774 | — |
| function | `master.trg_normalize_principal_identity_binding` | structural_dependency | commercial-platform+content-platform+document-platform+finance-platform+mesh-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:770 | — |
| function | `master.trg_sync_organization_scope_target` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:4918 | `master.tenant` |
| function | `master.trg_validate_employment_contract` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:4065 | `master.company_code` |
| function | `master.trg_validate_identity_binding_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:768 | `master.principal` |
| function | `master.trg_validate_identity_binding_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:813 | `master.principal` |
| function | `master.trg_validate_identity_binding_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:809 | `master.principal` |
| function | `master.trg_validate_operating_organization_profile` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:1081 | `master.operating_organization` |
| function | `master.trg_validate_partner_profile_references` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:3275 | `master.company_code` |
| function | `mesh.catalog_is_visible` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:217 | `mesh.network_relationship` |
| function | `mesh.catalog_price_is_visible` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:315 | `mesh.network_relationship` |
| function | `mesh.command_document_envelope_lifecycle` | structural_dependency | mesh-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:1209 | `master.tenant`<br>`mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.command_issue_registration_exchange` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:1783 | `mesh.network_account` |
| function | `mesh.command_issue_registration_exchange` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260906_mesh_exchange_readiness.sql:247 | `mesh.network_account` |
| function | `mesh.command_network_account_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:693 | `mesh.network_account` |
| function | `mesh.command_network_relationship_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:857 | `mesh.network_relationship` |
| function | `mesh.command_open_canonical_party_correlation_case` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:2181 | `mesh.network_account` |
| function | `mesh.command_registration_exchange_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:1799 | `mesh.network_account` |
| function | `mesh.command_relationship_capability_lifecycle` | structural_dependency | mesh-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:1672 | `master.tenant`<br>`mesh.network_relationship` |
| function | `mesh.command_relationship_capability_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260906_mesh_exchange_readiness.sql:215 | `mesh.network_relationship` |
| function | `mesh.command_relationship_capability_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260910_mesh_command_hardening.sql:35 | `mesh.network_relationship` |
| function | `mesh.command_request_network_relationship` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:762 | `mesh.network_relationship` |
| function | `mesh.command_request_relationship_capability` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:1647 | `mesh.network_relationship` |
| function | `mesh.command_request_relationship_capability` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260906_mesh_exchange_readiness.sql:190 | `mesh.network_relationship` |
| function | `mesh.command_resolve_canonical_party_correlation_case` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:2195 | `mesh.network_account` |
| function | `mesh.command_retrieve_bank_protected_token` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:2139 | `mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.command_retrieve_bank_protected_token` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260910_mesh_command_hardening.sql:149 | `mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.fn_catalog_publication_snapshot` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:416 | `mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.fn_upsert_network_scope` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:884 | `master.tenant` |
| function | `mesh.is_hardened_https_url` | structural_dependency | mesh-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:1924 | `master.principal`<br>`mesh.network_account` |
| function | `mesh.lock_profile_publication_relationship` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:954 | `mesh.network_account`<br>`mesh.network_relationship` |
| trigger | `mesh.network_account.trg_network_account_command_authority` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:1312 | `mesh.network_account` |
| trigger | `mesh.network_account.trg_network_account_identity_coordinates_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:1315 | `mesh.network_account` |
| trigger | `mesh.network_account.trg_network_account_status_changed` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:42 | `mesh.network_account` |
| trigger | `mesh.network_account.wave6_network_account_event` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:250 | `mesh.network_account` |
| trigger | `mesh.network_account.wave6_network_account_event` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:1305 | `mesh.network_account` |
| trigger | `mesh.network_account.wave6_network_account_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:248 | `mesh.network_account` |
| trigger | `mesh.network_account.wave6_network_account_scope` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:252 | `mesh.network_account` |
| trigger | `mesh.network_relationship.trg_network_relationship_command_authority` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:1318 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.trg_network_relationship_identity_coordinates_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:1321 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.trg_network_relationship_status_changed` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:46 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.wave6_network_relationship_event` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:251 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.wave6_network_relationship_event` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:1308 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.wave6_network_relationship_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:249 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.wave6_network_relationship_scopes` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:253 | `mesh.network_relationship` |
| function | `mesh.read_eligible_bank_disclosure_source` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:1012 | `mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.read_eligible_bank_disclosure_source_v2` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/15_bank_disclosure_source.sql:1 | `mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.trg_guard_network_identity_coordinates` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:573 | `mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.trg_sync_network_account_scope` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:903 | `mesh.network_account` |
| function | `mesh.trg_sync_network_relationship_scopes` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:913 | `mesh.network_relationship` |
| function | `mesh.trg_validate_bank_disclosure` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:731 | `mesh.network_relationship` |
| function | `mesh.trg_validate_bank_disclosure` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/11_grants.sql:2101 | `mesh.network_relationship` |
| function | `mesh.trg_validate_catalog_audience` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:127 | `mesh.network_relationship` |
| function | `mesh.trg_validate_catalog_owner` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:78 | `mesh.network_account` |
| function | `mesh.trg_validate_catalog_price` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:159 | `mesh.network_relationship` |
| function | `mesh.trg_validate_document_envelope` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:350 | `mesh.network_relationship` |
| function | `mesh.trg_validate_profile_trade_role` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:630 | `mesh.network_account` |
| table | `metadata.entity_operation_permission` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/planes/studio/metadata/03_tables.sql:946 | — |
| trigger | `metadata.entity_operation_permission.trg_entity_operation_permission_10_graph_guard` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/planes/studio/metadata/08_triggers.sql:181 | — |
| trigger | `metadata.entity_operation_permission.trg_entity_operation_permission_20_binding` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/planes/studio/metadata/08_triggers.sql:182 | — |
| trigger | `metadata.entity_operation_permission.trg_entity_operation_permission_90_updated_at` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/planes/studio/metadata/08_triggers.sql:188 | — |
| function | `onboarding.fn_create_case_with_target` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/onboarding/07_functions.sql:6 | `master.principal` |
| table | `ops.authorization_operation_cutover_drill` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/03_tables.sql:95 | — |
| trigger | `ops.authorization_operation_cutover_drill.authorization_operation_cutover_drill_immutable` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/08_triggers.sql:9 | — |
| table | `ops.authorization_operation_rollout` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/03_tables.sql:59 | — |
| trigger | `ops.authorization_operation_rollout.authorization_operation_rollout_guard` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/08_triggers.sql:5 | — |
| table | `ops.authorization_parity_certification` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/03_tables.sql:1 | — |
| trigger | `ops.authorization_parity_certification.authorization_parity_certification_immutable` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/08_triggers.sql:1 | — |
| table | `ops.authorization_qualification_cohort_requirement` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/03_tables.sql:42 | — |
| table | `ops.authorization_session_shadow_comparison` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/03_tables.sql:214 | — |
| table | `ops.authorization_shadow_comparison` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/03_tables.sql:117 | — |
| trigger | `ops.authorization_shadow_comparison.authorization_shadow_comparison_immutable` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/08_triggers.sql:12 | — |
| function | `ops.certify_authorization_operation_parity` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/07_functions.sql:1 | — |
| function | `ops.set_authorization_operation_rollout` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/07_functions.sql:36 | — |
| function | `ops.trg_guard_authorization_operation_cutover_drill` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/07_functions.sql:89 | — |
| function | `ops.trg_guard_authorization_parity_certification` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/07_functions.sql:76 | — |
| function | `ops.trg_guard_authorization_rollout_write` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/07_functions.sql:81 | — |
| function | `ops.trg_guard_authorization_shadow_comparison` | structural_dependency | operations-platform | review_with_registered_dependency | server/db/ddl/common/ops/07_functions.sql:94 | — |
| function | `pg_temp.decide` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/scripts/tests/integration/supplier-preference-normalized-scope.sql:25 | `master.operating_organization` |
| function | `pg_temp.expect_error` | structural_dependency | mesh-platform+platform-iam | review_with_registered_dependency | server/db/scripts/tests/integration/db-review/bank.sql:5 | `master.principal`<br>`mesh.network_account`<br>`mesh.network_relationship` |
| function | `pg_temp.expect_error` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/scripts/tests/integration/db-review/mesh.sql:15 | `mesh.network_relationship` |
| function | `pg_temp.r4_fail_outbox` | structural_dependency | finance-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/scripts/tests/integration/business-partner-r4-change-case.sql:3 | `master.company_code`<br>`master.legal_entity`<br>`master.operating_organization`<br>`master.principal` |
| function | `pg_temp.r4_fail_outbox` | structural_dependency | finance-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/scripts/tests/integration/business-partner-r6-amendment.sql:3 | `master.company_code`<br>`master.legal_entity`<br>`master.operating_organization`<br>`master.principal` |
| trigger | `publication.entity_authorization_successor_link.authorization_successor_link_immutable` | structural_dependency | publication | review_with_registered_dependency | server/db/ddl/planes/studio/metadata/13_authorization_successor.sql:35 | `publication.entity_authorization_successor_link` |
| trigger | `publication.entity_authorization_successor_link.authorization_successor_link_immutable` | structural_dependency | publication | review_with_registered_dependency | server/db/scripts/operations/upgrades/publication/20260910_authorization_successor_materializer.sql:37 | `publication.entity_authorization_successor_link` |
| trigger | `publication.entity_authorization_successor_payload.authorization_successor_payload_immutable` | structural_dependency | publication | review_with_registered_dependency | server/db/ddl/planes/studio/metadata/13_authorization_successor.sql:19 | `publication.entity_authorization_successor_payload` |
| trigger | `publication.entity_authorization_successor_payload.authorization_successor_payload_immutable` | structural_dependency | publication | review_with_registered_dependency | server/db/scripts/operations/upgrades/publication/20260910_authorization_successor_materializer.sql:21 | `publication.entity_authorization_successor_payload` |
| function | `publication.fn_authorization_successor_compilation_source` | registered | publication | studio_compilation_reader_for_hash_pinned_approved_release | server/db/ddl/planes/studio/metadata/13_authorization_successor.sql:89 | `publication.entity_authorization_successor_link` |
| function | `publication.fn_authorization_successor_compilation_source` | registered | publication | studio_compilation_reader_for_hash_pinned_approved_release | server/db/scripts/operations/upgrades/publication/20260910_authorization_successor_materializer.sql:86 | `publication.entity_authorization_successor_link` |
| function | `publication.fn_prepare_authorization_successor` | registered | publication | studio_approved_release_materialization_with_maker_checker_and_tenant_checks | server/db/ddl/planes/studio/metadata/13_authorization_successor.sql:41 | `publication.entity_authorization_successor_link`<br>`publication.entity_authorization_successor_payload` |
| function | `publication.fn_prepare_authorization_successor` | registered | publication | studio_approved_release_materialization_with_maker_checker_and_tenant_checks | server/db/scripts/operations/upgrades/publication/20260910_authorization_successor_materializer.sql:43 | `publication.entity_authorization_successor_link`<br>`publication.entity_authorization_successor_payload` |
| function | `publication.fn_prepare_authorization_successor` | registered | publication | studio_approved_release_materialization_with_maker_checker_and_tenant_checks | server/db/scripts/tests/integration/fixtures/legacy-upgrades/20260911_successor_active_baseline_sequence.sql:2 | `publication.entity_authorization_successor_link`<br>`publication.entity_authorization_successor_payload` |
| function | `publication.fn_successor_canonical_json` | structural_dependency | platform-iam+publication | review_with_registered_dependency | server/db/ddl/planes/studio/metadata/13_authorization_successor.sql:2 | `master.tenant`<br>`publication.entity_authorization_successor_link`<br>`publication.entity_authorization_successor_payload` |
| function | `publication.fn_successor_canonical_json` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/metadata/14_runtime_restoration.sql:3 | `master.tenant` |
| function | `publication.fn_successor_canonical_json` | structural_dependency | platform-iam+publication | review_with_registered_dependency | server/db/scripts/operations/upgrades/publication/20260910_authorization_successor_materializer.sql:4 | `master.tenant`<br>`publication.entity_authorization_successor_link`<br>`publication.entity_authorization_successor_payload` |
| table | `runtime_meta.authorization_epoch` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/common/runtime_meta/03_tables.sql:70 | — |
| trigger | `runtime_meta.authorization_epoch.trg_authorization_epoch_coordinates_immutable` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/common/event/08_triggers.sql:46 | — |
| function | `runtime_meta.trg_authorization_epoch_coordinates_immutable` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/common/event/07_functions.sql:107 | — |
| table | `snapshot.subscription_plan_entitlement` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/common/snapshot/03_tables.sql:128 | — |
| trigger | `snapshot.subscription_plan_entitlement.subscription_plan_entitlement_immutable` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/common/snapshot/08_triggers.sql:27 | — |

## Runtime authorization reader and evaluator symbols

| Symbol | Classification | Artifact class | Path | Lines |
|---|---|---|---|---|
| `authorizeAccess` | reviewed | runtime | server/apps/platform-host/src/composition/register-services.ts | 3022 |
| `authorizeAccess` | reviewed | test | server/packages/services/master-data/src/__tests__/master-data-repository.postgres.test.ts | 606, 1573 |
| `authorizeAccess` | reviewed | test | server/packages/services/master-data/src/__tests__/master-data-services.test.ts | 30, 38, 39, 113 |
| `authorizeAccess` | reviewed | runtime | server/packages/services/master-data/src/services.ts | 34, 53, 94, 106, 117, 128, 154, 155, 156 |
| `authorizeAdmin` | reviewed | runtime | server/apps/platform-host/src/composition/register-services.ts | 5858 |
| `authorizeAdmin` | reviewed | test | server/packages/platform/ai/src/__tests__/atlas-experience-runtime-review.test.ts | 13 |
| `authorizeAdmin` | reviewed | test | server/packages/platform/ai/src/__tests__/experience-routes.test.ts | 6 |
| `authorizeAdmin` | reviewed | route | server/packages/platform/ai/src/atlas-experience-routes.ts | 8, 10 |
| `authorizeAdmission` | reviewed | runtime | server/apps/platform-host/src/composition/register-services.ts | 6161 |
| `authorizeAdmission` | reviewed | test | server/packages/platform/ai/src/__tests__/local-generation.test.ts | 31 |
| `authorizeAdmission` | reviewed | runtime | server/packages/platform/ai/src/conversation-composition.ts | 20, 25, 80 |
| `authorizeAdmission` | reviewed | runtime | server/packages/platform/ai/src/local-generation-composition.ts | 31, 34, 38, 41 |
| `authorizeArtifact` | reviewed | runtime | server/apps/platform-host/src/composition/register-services.ts | 4901, 5793, 5810 |
| `authorizeArtifact` | reviewed | runtime | server/apps/platform-host/src/composition/supplier-process-communications.ts | 37, 273, 651 |
| `authorizeArtifact` | reviewed | runtime | server/apps/platform-host/src/composition/supplier-process-documents.ts | 275, 657 |
| `authorizeArtifact` | reviewed | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 169 |
| `authorizeArtifact` | reviewed | runtime | server/packages/services/documents/src/document-service.ts | 19, 102 |
| `authorizeAssignment` | reviewed | test | server/packages/services/master-data/src/__tests__/business-partner-company-relationships.test.ts | 9, 10 |
| `authorizeAssignment` | reviewed | runtime | server/packages/services/master-data/src/business-partner-360-service.ts | 212, 1110 |
| `authorizeAssignment` | reviewed | runtime | server/packages/services/master-data/src/kysely-business-partner-360-role-sections.ts | 341, 368 |
| `authorizeCase` | reviewed | test | server/packages/services/master-data/src/__tests__/business-partner-360-service.test.ts | 876, 916 |
| `authorizeCase` | reviewed | runtime | server/packages/services/master-data/src/business-partner-360-service.ts | 164, 246, 543, 993 |
| `authorizeCase` | reviewed | runtime | server/packages/services/master-data/src/kysely-business-partner-360-explainability.ts | 51, 125, 270, 273, 289 |
| `authorizeCase` | reviewed | runtime | server/packages/services/master-data/src/kysely-business-partner-360-repository.ts | 163, 280 |
| `authorizeCaseMutation` | reviewed | runtime | server/packages/services/master-data/src/business-partner-request-service.ts | 627, 691, 1065 |
| `authorizeCaseRead` | reviewed | runtime | server/apps/platform-host/src/composition/register-services.ts | 3426 |
| `authorizeCaseRead` | reviewed | test | server/packages/services/master-data/src/__tests__/business-partner-360-service.test.ts | 887 |
| `authorizeCaseRead` | reviewed | runtime | server/packages/services/master-data/src/business-partner-360-service.ts | 317, 544, 550, 994, 1000 |
| `authorizeCaseRead` | reviewed | tool | tooling/scripts/verification/deploy-business-partner-worker.mjs | 210 |
| `authorizeDelivery` | reviewed | runtime | server/apps/platform-host/src/composition/register-services.ts | 5024 |
| `authorizeDelivery` | reviewed | runtime | server/apps/platform-host/src/composition/supplier-process-communications.ts | 534 |
| `authorizeDelivery` | reviewed | test | server/packages/platform/notifications/src/__tests__/durable-notification-jobs.test.ts | 130 |
| `authorizeDelivery` | reviewed | runtime | server/packages/platform/notifications/src/durable-delivery.ts | 24 |
| `authorizeDescriptorOperation` | reviewed | runtime | server/packages/services/records/src/transfer/transfer-service.ts | 359, 458, 531, 656, 822, 913, 1229, 1335, 1370, 1584, 1717, 1936 |
| `authorizeEntityActivation` | reviewed | test | server/packages/services/publication/src/__tests__/authorization-activation-hold.test.ts | 7 |
| `authorizeEntityActivation` | reviewed | runtime | server/packages/services/publication/src/kysely-publication-authority-work.ts | 56, 613, 615 |
| `authorizeEntityRelationship` | reviewed | test | server/packages/services/records/src/__tests__/entity-authorization.test.ts | 17, 250 |
| `authorizeEntityRelationship` | reviewed | runtime | server/packages/services/records/src/entity-authorization.ts | 355 |
| `authorizeGateway` | reviewed | runtime | server/apps/platform-host/src/composition/business-partner-import-runtime.ts | 43 |
| `authorizeGateway` | reviewed | test | server/packages/services/master-data/src/__tests__/business-partner-governed-import.test.ts | 28, 30, 31, 54, 70 |
| `authorizeGateway` | reviewed | runtime | server/packages/services/master-data/src/business-partner-governed-import.ts | 37, 43 |
| `authorizeImportMode` | reviewed | runtime | server/packages/services/records/src/transfer/transfer-service.ts | 366, 465, 538, 829, 920, 1236, 1342, 1972 |
| `authorizeListContextDiscovery` | reviewed | test | server/packages/services/records/src/__tests__/list-context-discovery.test.ts | 7, 96, 109, 116, 129, 146, 161 |
| `authorizeListContextDiscovery` | reviewed | runtime | server/packages/services/records/src/entity-list-service.ts | 2, 248 |
| `authorizeListContextDiscovery` | reviewed | runtime | server/packages/services/records/src/list-context-discovery.ts | 16 |
| `authorizeParent` | reviewed | runtime | server/apps/platform-host/src/composition/atlas-attachment-knowledge.ts | 118, 146, 157 |
| `authorizeParent` | reviewed | runtime | server/apps/platform-host/src/composition/atlas-document-grounding.ts | 51, 88, 97 |
| `authorizeParent` | reviewed | runtime | server/apps/platform-host/src/composition/register-services.ts | 6283 |
| `authorizeParent` | reviewed | test | server/packages/services/attachments/src/retrieval-admission.test.ts | 57, 62, 64, 70, 99, 103, 107 |
| `authorizeParent` | reviewed | runtime | server/packages/services/attachments/src/retrieval-admission.ts | 32, 94 |
| `authorizeRecipient` | reviewed | runtime | server/apps/platform-host/src/composition/supplier-process-communications.ts | 521 |
| `authorizeRecipient` | reviewed | runtime | server/packages/platform/notifications/src/notification-planner.ts | 15, 49 |
| `authorizeRecordListRead` | reviewed | test | server/packages/services/records/src/__tests__/record-read-access.test.ts | 2, 19, 33, 42, 52 |
| `authorizeRecordListRead` | reviewed | runtime | server/packages/services/records/src/entity-list-service.ts | 64, 171, 255 |
| `authorizeRecordListRead` | reviewed | runtime | server/packages/services/records/src/query-service.ts | 25, 88, 297, 378 |
| `authorizeRecordListRead` | reviewed | runtime | server/packages/services/records/src/record-read-access.ts | 6 |
| `authorizeRun` | reviewed | runtime | server/apps/platform-host/src/composition/register-services.ts | 3717 |
| `authorizeRun` | reviewed | test | server/packages/platform/governance/src/cycles/cycle-execution-services.test.ts | 26, 35 |
| `authorizeRun` | reviewed | runtime | server/packages/platform/governance/src/cycles/cycle-execution-services.ts | 9, 48, 50, 67, 68, 70 |
| `authorizeSupplierActivationReadiness` | reviewed | runtime | server/apps/platform-host/src/composition/register-services.ts | 578, 3810 |
| `authorizeSupplierActivationReadiness` | reviewed | runtime | server/packages/services/master-data/src/index.ts | 73 |
| `authorizeSupplierActivationReadiness` | reviewed | runtime | server/packages/services/master-data/src/supplier-activation-readiness.ts | 9 |
| `authorizeVerification` | reviewed | runtime | server/apps/platform-host/src/composition/register-services.ts | 3023 |
| `authorizeVerification` | reviewed | test | server/packages/services/master-data/src/__tests__/master-data-repository.postgres.test.ts | 669, 779, 934, 1006 |
| `authorizeVerification` | reviewed | test | server/packages/services/master-data/src/__tests__/master-data-services.test.ts | 35, 38 |
| `authorizeVerification` | reviewed | runtime | server/packages/services/master-data/src/local-contact-challenge.ts | 38 |
| `authorizeVerification` | reviewed | runtime | server/packages/services/master-data/src/services.ts | 35, 70 |
| `checkAnyPermission` | reviewed | tool | tooling/scripts/policy/authorization-inventory.ts | 1132 |
| `checkPermission` | reviewed | tool | tooling/scripts/policy/authorization-inventory.ts | 1112, 1132 |
| `getEffectiveModuleAccess` | reviewed | tool | tooling/scripts/policy/authorization-inventory.ts | 828 |
| `requireAllow` | reviewed | tool | tooling/scripts/policy/authorization-inventory.ts | 1132 |
| `requireCatalogPermission` | unclassified | tool | server/db/scripts/provisioning/provision-cirrusatlantic-demo-authorization.ts | 57, 269 |
| `requirePermission` | reviewed | runtime | server/apps/platform-host/src/provisioning/supplier-process-catalog.ts | 225 |
| `requirePermission` | reviewed | route | server/packages/planes/neon/src/finance-http.ts | 80, 245, 342, 425 |
| `requirePermission` | reviewed | runtime | server/packages/platform/collaboration/src/collaboration-service.ts | 55, 146, 185, 210, 237, 253, 268, 291, 312, 467 |
| `requirePermission` | reviewed | runtime | server/packages/platform/control-admin/src/authorization-management-service.ts | 35, 243 |
| `requirePermission` | reviewed | runtime | server/packages/platform/control-admin/src/cycle/cycle-config-service.ts | 38, 67, 107, 442 |
| `requirePermission` | reviewed | runtime | server/packages/services/documents/src/document-service.ts | 37, 43, 103, 141 |
| `requirePermission` | reviewed | runtime | server/packages/services/finance/src/planning/planning-service.ts | 8, 9, 14, 15, 24 |
| `requirePermission` | reviewed | route | server/packages/services/publication/src/publication-routes.ts | 37, 46, 54, 62, 72, 81, 90, 107, 123, 136 |
| `requirePermission` | reviewed | tool | tooling/scripts/verification/master-data-prerequisites.mjs | 51 |
| `resolveAccessibleCompany` | reviewed | tool | tooling/scripts/policy/authorization-inventory.ts | 828 |
| `resolveAccessScope` | reviewed | tool | tooling/scripts/policy/authorization-inventory.ts | 828 |
| `resolveCurrentAuthEpoch` | reviewed | tool | tooling/scripts/policy/authorization-inventory.ts | 828 |

## Unknown source findings

None.

## Known source anomalies

| ID | Type | Identity | Owner | Current path | Lines | Disposition | Removal wave |
|---|---|---|---|---|---|---|---|

## Zero-Mesh-specific-data Neon boundary findings

These are owned current-state exceptions to the target boundary, not evidence that the boundary is already satisfied.

| ID | Boundary class | Identity | Owner | Current path | Lines | Disposition | Removal wave |
|---|---|---|---|---|---|---|---|

## Canonical capture-source parity

Capture DDLs:


| Plane | Exact source | Object ID | Owner | Disposition | DDL | Line |
|---|---|---|---|---|---|---:|

## Writer inventory

| Object | Access | Artifact class | Path | Lines |
|---|---|---|---|---|
| `master.auth_group` | insert | test | tooling/scripts/policy/authorization-inventory.test.ts | 145 |
| `master.auth_group` | update | test | tooling/scripts/policy/authorization-inventory.test.ts | 146 |
| `shared.workspace` | insert | test | server/db/scripts/__tests__/seed/seed-contract-lint.test.ts | 84 |
| `master.company_code` | insert | tool | server/db/scripts/provisioning/neon-scenario-foundation.ts | 30 |
| `master.company_code` | insert | test | server/db/scripts/tests/integration/business-partner-r4-change-case.sql | 56 |
| `master.company_code` | insert | test | server/db/scripts/tests/integration/business-partner-r5-fixture-foundation.sql | 11 |
| `master.company_code` | insert | test | server/db/scripts/tests/integration/business-partner-r6-amendment.sql | 57 |
| `master.company_code` | insert | test | server/db/scripts/tests/integration/certify-g2-hardening.mjs | 243 |
| `master.company_code` | insert | test | server/db/scripts/tests/integration/db-review/account-isolation.sql | 3 |
| `master.company_code` | insert | test | server/db/scripts/tests/integration/fixtures/asset_org_fixture.sql | 46 |
| `master.company_code` | insert | tool | tooling/scripts/local-dev/bp-provider-sql.integration.test.mts | 207 |
| `master.company_code` | update | tool | tooling/scripts/local-dev/bp-provider-sql.integration.test.mts | 316 |
| `master.company_code` | insert | tool | tooling/scripts/verification/isolated-enter/qualify-company-context-revocation.mjs | 91 |
| `master.company_code` | update | tool | tooling/scripts/verification/isolated-enter/qualify-company-context-revocation.mjs | 91 |
| `master.legal_entity` | insert | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 478 |
| `master.legal_entity` | insert | test | server/db/scripts/tests/integration/business-partner-r4-change-case.sql | 54 |
| `master.legal_entity` | insert | test | server/db/scripts/tests/integration/business-partner-r5-fixture-foundation.sql | 10 |
| `master.legal_entity` | insert | test | server/db/scripts/tests/integration/business-partner-r6-amendment.sql | 55 |
| `master.legal_entity` | insert | test | server/db/scripts/tests/integration/certify-g2-hardening.mjs | 239 |
| `master.legal_entity` | insert | test | server/db/scripts/tests/integration/fixtures/asset_org_fixture.sql | 33 |
| `master.operating_organization` | update | ddl | server/db/ddl/planes/neon/master/16_operating_organization_model.sql | 37 |
| `master.operating_organization` | update | tool | server/db/scripts/business-partner-360/provision-business-partner-360-acceptance-fixtures.ts | 45 |
| `master.operating_organization` | insert | tool | server/db/scripts/provisioning/neon-scenario-foundation.ts | 68 |
| `master.operating_organization` | insert | tool | server/db/scripts/provisioning/provision-business-partner-r2-fixtures.ts | 216 |
| `master.operating_organization` | update | tool | server/db/scripts/provisioning/provision-development-business-partner-fixtures.ts | 343 |
| `master.operating_organization` | insert | test | server/db/scripts/tests/integration/business-partner-r4-change-case.sql | 58 |
| `master.operating_organization` | insert | test | server/db/scripts/tests/integration/business-partner-r5-fixture-foundation.sql | 12 |
| `master.operating_organization` | insert | test | server/db/scripts/tests/integration/business-partner-r6-amendment.sql | 59 |
| `master.operating_organization` | insert | test | server/db/scripts/tests/integration/certify-g2-hardening.mjs | 247 |
| `master.operating_organization` | insert | test | server/packages/services/master-data/src/__tests__/master-data-repository.postgres.test.ts | 1157, 1265 |
| `master.operating_organization` | update | test | server/packages/services/master-data/src/__tests__/master-data-repository.postgres.test.ts | 1222, 1609 |
| `master.operating_organization` | insert | tool | tooling/scripts/local-dev/bp-provider-sql.integration.test.mts | 213 |
| `master.operating_organization` | insert | tool | tooling/scripts/verification/setup-local-master-data-authority.mjs | 39 |
| `master.principal` | insert | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/intent-feedback.mts | 131 |
| `master.principal` | insert | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-inbox.mts | 146 |
| `master.principal` | insert | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval.mts | 116 |
| `master.principal` | insert | test | server/apps/platform-host/scripts/db-verification/tests/integration/business-partner-case-contract-publication.ts | 56 |
| `master.principal` | insert | ddl | server/db/ddl/common/master/12_system_authority_reference_seed.sql | 46 |
| `master.principal` | delete | tool | server/db/scripts/business-partner-360/run-business-partner-s5-certification.ts | 206 |
| `master.principal` | insert | tool | server/db/scripts/business-partner-360/run-business-partner-s5-certification.ts | 55 |
| `master.principal` | update | tool | server/db/scripts/operations/authorization/reset-authorization-clean-slate.ts | 86 |
| `master.principal` | insert | tool | server/db/scripts/operations/studio/project-meta-entity-admin-identities.ts | 126, 145 |
| `master.principal` | insert | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 403, 770 |
| `master.principal` | insert | tool | server/db/scripts/provisioning/provision-business-partner-r3-applicant.ts | 42 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/business-partner-r4-change-case.sql | 25 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/business-partner-r6-amendment.sql | 26 |
| `master.principal` | delete | test | server/db/scripts/tests/integration/certify-g3-mesh-lifecycle.mjs | 530 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/certify-g3-mesh-lifecycle.mjs | 327 |
| `master.principal` | delete | test | server/db/scripts/tests/integration/certify-g4-data-protection.mjs | 430 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/certify-g4-data-protection.mjs | 270 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/ci-integrity.ts | 301, 408 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/db-review/bank.sql | 21 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/db-review/mesh.sql | 5 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/db-review/tenant-isolation.sql | 7 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/fixtures/asset_org_fixture.sql | 21 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/identity-replay-live.mjs | 396 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/meta-entity/schema.sql | 98 |
| `master.principal` | insert | test | server/packages/platform/control-admin/src/authorization-writers.postgres.test.ts | 105 |
| `master.principal` | insert | test | server/packages/platform/control-admin/src/control-repositories.postgres.test.ts | 124 |
| `master.principal` | insert | test | server/packages/platform/control-admin/src/kysely-entitlement-repository.postgres.test.ts | 343, 1081 |
| `master.principal` | insert | runtime | server/packages/platform/iam/src/kysely-identity-saga.ts | 314 |
| `master.principal` | update | runtime | server/packages/platform/iam/src/kysely-identity-saga.ts | 320, 408 |
| `master.principal` | insert | test | server/packages/services/master-data/src/__tests__/master-data-repository.postgres.test.ts | 912 |
| `master.principal` | insert | test | server/packages/services/publication/src/__tests__/integration/business-partner-case-contract-publication.ts | 56 |
| `master.principal` | insert | runtime | server/packages/test-utils/fixtures/rls-actors.sql | 23 |
| `master.principal` | insert | tool | tooling/scripts/iam/provision-business-partner-v1-local.mjs | 217 |
| `master.principal` | insert | tool | tooling/scripts/verification/isolated-enter/preview-company-lifecycle.mts | 122 |
| `master.principal_identity_binding` | delete | tool | server/db/scripts/operations/iam/reconcile-runtime-subjects.ts | 68 |
| `master.principal_identity_binding` | insert | tool | server/db/scripts/operations/iam/reconcile-runtime-subjects.ts | 72 |
| `master.principal_identity_binding` | insert | tool | server/db/scripts/operations/studio/project-meta-entity-admin-identities.ts | 153 |
| `master.principal_identity_binding` | insert | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 801 |
| `master.principal_identity_binding` | update | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 781 |
| `master.principal_identity_binding` | insert | tool | server/db/scripts/provisioning/provision-business-partner-r3-applicant.ts | 47 |
| `master.principal_identity_binding` | insert | runtime | server/packages/platform/iam/src/kysely-identity-saga.ts | 326 |
| `master.principal_identity_binding` | update | runtime | server/packages/platform/iam/src/kysely-identity-saga.ts | 401 |
| `master.principal_identity_binding` | insert | tool | tooling/scripts/iam/provision-business-partner-v1-local.mjs | 219 |
| `master.tenant` | insert | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/intent-feedback.mts | 124 |
| `master.tenant` | insert | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-inbox.mts | 139 |
| `master.tenant` | insert | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval.mts | 109 |
| `master.tenant` | insert | ddl | server/db/ddl/common/master/12_system_authority_reference_seed.sql | 29 |
| `master.tenant` | insert | tool | server/db/scripts/operations/studio/project-meta-entity-admin-identities.ts | 120, 137 |
| `master.tenant` | insert | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 420 |
| `master.tenant` | delete | test | server/db/scripts/tests/integration/certify-g2-hardening.mjs | 557 |
| `master.tenant` | insert | test | server/db/scripts/tests/integration/certify-g2-hardening.mjs | 199 |
| `master.tenant` | delete | test | server/db/scripts/tests/integration/certify-g3-mesh-lifecycle.mjs | 533 |
| `master.tenant` | insert | test | server/db/scripts/tests/integration/certify-g3-mesh-lifecycle.mjs | 315 |
| `master.tenant` | delete | test | server/db/scripts/tests/integration/certify-g4-data-protection.mjs | 431 |
| `master.tenant` | insert | test | server/db/scripts/tests/integration/certify-g4-data-protection.mjs | 256 |
| `master.tenant` | insert | test | server/db/scripts/tests/integration/db-review/mesh.sql | 3 |
| `master.tenant` | insert | test | server/db/scripts/tests/integration/db-review/tenant-isolation.sql | 5 |
| `master.tenant` | insert | test | server/db/scripts/tests/integration/fixtures/asset_org_fixture.sql | 11 |
| `master.tenant` | insert | test | server/db/scripts/tests/integration/fixtures/publication-authority.sql | 5 |
| `master.tenant` | insert | test | server/db/scripts/tests/integration/meta-entity/schema.sql | 90 |
| `master.tenant` | insert | test | server/packages/adapters/experience-postgres/src/localization.postgres.test.ts | 49 |
| `master.tenant` | insert | test | server/packages/platform/control-admin/src/authorization-writers.postgres.test.ts | 101 |
| `master.tenant` | insert | test | server/packages/platform/control-admin/src/control-repositories.postgres.test.ts | 121, 358 |
| `master.tenant` | insert | test | server/packages/platform/control-admin/src/kysely-entitlement-repository.postgres.test.ts | 340, 1078 |
| `master.tenant` | update | test | server/packages/platform/control-admin/src/kysely-entitlement-repository.postgres.test.ts | 617, 784, 831, 844, 877, 924, 997 |
| `master.tenant` | insert | test | server/packages/platform/control-admin/src/parameter-versions.postgres.test.ts | 46 |
| `master.tenant` | insert | test | server/packages/services/master-data/src/__tests__/master-data-repository.postgres.test.ts | 211 |
| `master.tenant` | insert | runtime | server/packages/test-utils/fixtures/rls-actors.sql | 18 |
| `master.tenant` | update | test | server/packages/test-utils/src/postgres-service-harness.postgres.test.ts | 48 |
| `mesh.network_account` | update | ddl | server/db/ddl/planes/mesh/mesh/11_grants.sql | 274, 753, 2206 |
| `mesh.network_account` | insert | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 523 |
| `mesh.network_account` | insert | tool | server/db/scripts/provisioning/provision-development-northwind-mesh-fixture.ts | 72 |
| `mesh.network_account` | insert | tool | server/db/scripts/provisioning/provision-development-phase1-list-fixtures.ts | 31 |
| `mesh.network_account` | delete | test | server/db/scripts/tests/integration/certify-g3-mesh-lifecycle.mjs | 526 |
| `mesh.network_account` | insert | test | server/db/scripts/tests/integration/certify-g3-mesh-lifecycle.mjs | 331 |
| `mesh.network_account` | delete | test | server/db/scripts/tests/integration/certify-g4-data-protection.mjs | 429 |
| `mesh.network_account` | insert | test | server/db/scripts/tests/integration/certify-g4-data-protection.mjs | 274 |
| `mesh.network_account` | update | test | server/db/scripts/tests/integration/certify-g4-data-protection.mjs | 137 |
| `mesh.network_account` | update | test | server/db/scripts/tests/integration/db-review/bank.sql | 63, 72 |
| `mesh.network_account` | insert | test | server/db/scripts/tests/integration/db-review/mesh.sql | 7 |
| `mesh.network_account` | insert | test | server/db/scripts/tests/integration/mesh-api-review.mjs | 87 |
| `mesh_control.authorization_capture_source` | insert | test | tooling/scripts/policy/authorization-inventory.test.ts | 383 |
| `mesh.network_relationship` | insert | ddl | server/db/ddl/planes/mesh/mesh/11_grants.sql | 836 |
| `mesh.network_relationship` | update | ddl | server/db/ddl/planes/mesh/mesh/11_grants.sql | 254, 269, 284, 942 |
| `mesh.network_relationship` | update | test | server/db/scripts/tests/integration/business-partner-profile-publication.sql | 3 |
| `mesh.network_relationship` | delete | test | server/db/scripts/tests/integration/certify-g3-mesh-lifecycle.mjs | 518 |
| `mesh.network_relationship` | delete | test | server/db/scripts/tests/integration/certify-g4-data-protection.mjs | 427 |
| `mesh.network_relationship` | insert | test | server/db/scripts/tests/integration/certify-g4-data-protection.mjs | 298 |
| `mesh.network_relationship` | update | test | server/db/scripts/tests/integration/db-review/bank.sql | 45, 54 |
| `mesh.network_relationship` | update | test | server/db/scripts/tests/integration/db-review/run.mjs | 192, 194 |
| `mesh.network_relationship` | insert | runtime | server/packages/planes/mesh/src/network-relationship-import.ts | 37 |
| `mesh.network_relationship` | update | runtime | server/packages/planes/mesh/src/network-relationship-import.ts | 31, 36 |
| `control.entity_version` | update | test | server/db/scripts/tests/integration/effective-lock-scenarios.ts | 108, 132, 190 |
| `control.authorization_capture_source` | insert | test | tooling/scripts/policy/authorization-inventory.test.ts | 335, 349, 353, 366 |
| `publication.entity_authorization_successor_link` | insert | ddl | server/db/ddl/planes/studio/metadata/13_authorization_successor.sql | 84 |
| `publication.entity_authorization_successor_link` | insert | tool | server/db/scripts/operations/upgrades/publication/20260910_authorization_successor_materializer.sql | 81 |
| `publication.entity_authorization_successor_link` | insert | test | server/db/scripts/tests/integration/fixtures/legacy-upgrades/20260911_successor_active_baseline_sequence.sql | 45 |
| `publication.entity_authorization_successor_payload` | insert | tool | tooling/scripts/verification/deploy-business-partner-successor-materializer.mjs | 56 |
| `publication.entity_authorization_successor_payload` | insert | tool | tooling/scripts/verification/qualify-business-partner-successor-sql.mjs | 13, 16 |
| `publication.entity_authorization_successor_payload` | update | tool | tooling/scripts/verification/qualify-business-partner-successor-sql.mjs | 20 |
| `publication.entity_authorization_successor_payload` | insert | tool | tooling/scripts/verification/qualify-business-partner-v2-successor-sql.mjs | 35, 38 |
| `publication.entity_authorization_successor_payload` | update | tool | tooling/scripts/verification/qualify-business-partner-v2-successor-sql.mjs | 42 |
| `publication.entity_authorization_successor_payload` | insert | tool | tooling/scripts/verification/stage-business-partner-v2-payload.mjs | 26 |

## Keycloak REST writer inventory

| Path | Classification | Owner | Operations | Disposition | Lines |
|---|---|---|---|---|---|
| tooling/tools/devtools/keycloackgen/configure-browser-flow.mjs | reviewed | platform-iam | `POST:authentication_flow`<br>`PUT:authentication_flow`<br>`PUT:realm`<br>`PUT:user` | replace_with_versioned_keycloak_seed_contract | 51, 88, 113, 119, 130, 147, 164 |
| tooling/tools/devtools/keycloackgen/configure-email.mjs | reviewed | platform-iam | `PUT:realm` | replace_with_versioned_keycloak_seed_contract | 67 |
| tooling/tools/devtools/keycloackgen/configure-magic-link.mjs | reviewed | platform-iam | `POST:authentication_flow`<br>`PUT:authentication_flow`<br>`PUT:realm`<br>`PUT:user_required_action` | replace_with_versioned_keycloak_seed_contract | 50, 68, 84, 93, 112 |
| tooling/tools/devtools/keycloackgen/enforce-mfa.mjs | reviewed | platform-iam | `PUT:user`<br>`PUT:user_required_action` | replace_with_versioned_keycloak_seed_contract | 66, 81 |
| tooling/tools/devtools/keycloackgen/smoke-test-email.mjs | reviewed | platform-iam | `PUT:user_required_action` | retain_as_non_production_smoke_test | 26 |
| tooling/tools/scripts/deploy-broker-flows.cjs | reviewed | platform-iam | `POST:authentication_flow`<br>`PUT:authentication_flow` | replace_with_versioned_keycloak_seed_contract | 115, 131, 138, 146 |
| tooling/tools/scripts/deploy-realm-demosetup.cjs | reviewed | platform-iam | `DELETE:client_role`<br>`DELETE:organization`<br>`DELETE:organization_membership`<br>`POST:identity_provider`<br>`POST:organization`<br>`POST:organization_membership`<br>`POST:protocol_mapper_or_realm_import`<br>`PUT:admin_other`<br>`PUT:identity_provider`<br>`PUT:organization`<br>`PUT:user` | replace_with_versioned_keycloak_seed_contract | 115, 139, 159, 189, 194, 223, 234, 257, 304, 359, 366, 395 |
| tooling/tools/scripts/deploy-users-groups-idps.cjs | reviewed | platform-iam | `DELETE:user`<br>`POST:client_role`<br>`POST:group`<br>`POST:group_role_mapping`<br>`POST:identity_provider`<br>`POST:organization_membership`<br>`POST:user`<br>`PUT:identity_provider`<br>`PUT:user_group_membership` | replace_with_versioned_keycloak_seed_contract | 134, 166, 183, 203, 236, 255, 279, 321, 324 |
| tooling/tools/scripts/fix-org-memberships.cjs | reviewed | platform-iam | `DELETE:organization_membership`<br>`POST:organization_membership` | replace_with_versioned_keycloak_seed_contract | 76, 111 |
| tooling/tools/scripts/rebuild-broker-flows.cjs | reviewed | platform-iam | `DELETE:authentication_flow`<br>`POST:authentication_flow`<br>`PUT:authentication_flow` | replace_with_versioned_keycloak_seed_contract | 49, 54, 60, 80, 89 |

## Permission seed inventory

| Code | Risk | Definition sources |
|---|---|---|
| `mesh.ai.agent.use` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:10 |
| `mesh.catalog.attachment.create` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:23 |
| `mesh.catalog.attachment.delete` | high | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:36 |
| `mesh.catalog.attachment.read` | low | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:49 |
| `mesh.catalog.attachment.share` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:62 |
| `mesh.catalog.bank_account.read` | low | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:75 |
| `mesh.catalog.bank_account.update` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:88 |
| `mesh.catalog.bank_account.verify` | high | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:101 |
| `mesh.catalog.catalog.publish` | high | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:114 |
| `mesh.catalog.catalog.read` | low | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:127 |
| `mesh.catalog.content_item.create` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:140 |
| `mesh.catalog.content_item.read` | low | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:153 |
| `mesh.catalog.content_item.share` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:166 |
| `mesh.catalog.content_item.update` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:179 |
| `mesh.catalog.conversation.add_participant` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:192 |
| `mesh.catalog.conversation.create` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:205 |
| `mesh.catalog.conversation.read` | low | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:218 |
| `mesh.catalog.conversation.remove_participant` | high | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:231 |
| `mesh.catalog.document_envelope.acknowledge` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:244 |
| `mesh.catalog.document_envelope.publish` | high | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:257 |
| `mesh.catalog.document_envelope.read` | low | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:270 |
| `mesh.catalog.document_envelope.replay` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:283 |
| `mesh.catalog.network_account.connect` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:296 |
| `mesh.catalog.network_account.invite` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:309 |
| `mesh.catalog.network_account.read` | low | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:322 |
| `mesh.catalog.network_account.update` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:335 |
| `mesh.catalog.network_relationship.accept` | high | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:348 |
| `mesh.catalog.network_relationship.read` | low | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:361 |
| `mesh.catalog.network_relationship.request` | medium | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:374 |
| `mesh.catalog.network_relationship.suspend` | high | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:387 |
| `mesh.catalog.network_relationship.terminate` | high | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:400 |
| `mesh.catalog.supplier_profile_verification.read` | low | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:413 |
| `mesh.catalog.supplier_profile_verification.reject` | high | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:426 |
| `mesh.catalog.supplier_profile_verification.verify` | high | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json:439 |
| `neon.address_contact.company_code.manage` | medium | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:10 |
| `neon.address_contact.legal_entity.manage` | high | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:23 |
| `neon.address_contact.tenant.manage` | high | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:36 |
| `neon.ai.agent_admin.support_session` | high | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:49 |
| `neon.ai.agent_feedback.submit` | low | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:62 |
| `neon.ai.agent_history.delete` | high | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:75 |
| `neon.ai.agent_history.export` | high | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:88 |
| `neon.ai.agent_history.manage` | medium | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:101 |
| `neon.ai.agent_history.read` | medium | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:114 |
| `neon.ai.agent_tools.read` | medium | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:127 |
| `neon.ai.agent.provider_diagnostics` | high | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:140 |
| `neon.ai.agent.use` | medium | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:153 |
| `neon.context.catalog.read` | low | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:166 |
| `neon.records.lock.force_release` | high | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:179 |
| `neon.relationship.business_partner.create` | medium | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:192 |
| `neon.relationship.business_partner.update` | medium | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:205 |
| `neon.supplier.banking.admin` | high | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:218 |
| `neon.supplier.banking.submit` | medium | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:231 |
| `neon.supplier.banking.verify` | high | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:244 |
| `neon.supplier.governance.write` | high | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:257 |
| `neon.supplier.qualification.admin` | critical | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:270 |
| `neon.supplier.tax.restricted` | high | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:283 |
| `neon.supplier.tax.submit` | low | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:296 |
| `neon.supplier.tax.verify` | medium | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json:309 |
| `studio.ai.agent.use` | medium | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:10 |
| `studio.iam.application_projection.read` | low | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:23 |
| `studio.iam.application_projection.replay` | high | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:36 |
| `studio.iam.idp.manage` | critical | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:49 |
| `studio.iam.idp.read` | low | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:62 |
| `studio.iam.parameter.manage` | high | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:75 |
| `studio.jobs.board.view` | medium | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:88 |
| `studio.jobs.queue.manage` | critical | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:101 |
| `studio.metadata.contract_draft.create` | medium | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:114 |
| `studio.metadata.contract.break_glass` | critical | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:127 |
| `studio.metadata.contract.edit` | high | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:140 |
| `studio.metadata.contract.export` | medium | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:153 |
| `studio.metadata.contract.import` | critical | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:166 |
| `studio.metadata.contract.publish` | critical | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:179 |
| `studio.metadata.contract.review` | high | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:192 |
| `studio.metadata.contract.rollback` | critical | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:205 |
| `studio.metadata.contract.submit` | high | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:218 |
| `studio.metadata.contract.view` | low | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:231 |
| `studio.metadata.overlay.edit` | high | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:244 |
| `studio.platform.catalog.manage` | high | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:257 |
| `studio.platform.catalog.view` | low | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:270 |
| `studio.platform.reference.import` | medium | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:283 |
| `studio.platform.reference.view` | low | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:296 |
| `studio.platform.subscriptions.manage` | critical | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:309 |
| `studio.platform.subscriptions.view` | low | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:322 |
| `studio.platform.taxonomy.import` | medium | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:335 |
| `studio.platform.taxonomy.view` | low | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json:348 |

## Authorization-bearing routes

| Source | Route | Methods | Permissions | Security symbols |
|---|---|---|---|---|
| server/packages/planes/neon/src/finance-http.ts | `<dynamic-or-mounted>` | UNKNOWN | — | requirePermission |
| server/packages/planes/studio/meta-entity-authoring/src/routes.ts | `/api/meta-entity-authoring/change-sets` | GET, POST | `studio.platform.catalog.manage` | — |
| server/packages/planes/studio/meta-entity-authoring/src/routes.ts | `/api/meta-entity-authoring/change-sets/:id/${name}` | POST | `studio.platform.catalog.manage` | — |
| server/packages/planes/studio/meta-entity-authoring/src/routes.ts | `/api/meta-entity-authoring/change-sets/:id/graph` | GET, PUT | `studio.platform.catalog.manage` | — |
| server/packages/planes/studio/meta-entity-authoring/src/routes.ts | `/api/meta-entity-authoring/change-sets/:id/history` | GET | `studio.platform.catalog.manage` | — |
| server/packages/planes/studio/meta-entity-authoring/src/routes.ts | `/api/meta-entity-authoring/change-sets/:id/history/:revision` | GET | `studio.platform.catalog.manage` | — |
| server/packages/planes/studio/meta-entity-authoring/src/routes.ts | `/api/meta-entity-authoring/inspection/address-preview-choices` | GET | `studio.platform.catalog.manage` | — |
| server/packages/planes/studio/meta-entity-authoring/src/routes.ts | `/api/meta-entity-authoring/inspection/releases` | GET | `studio.platform.catalog.manage` | — |
| server/packages/planes/studio/meta-entity-authoring/src/routes.ts | `/api/meta-entity-authoring/inspection/releases/:id` | GET | `studio.platform.catalog.manage` | — |
| server/packages/planes/studio/meta-entity-authoring/src/routes.ts | `/api/meta-entity-authoring/inspection/releases/:id/activation` | GET | `studio.platform.catalog.manage` | — |
| server/packages/planes/studio/meta-entity-authoring/src/routes.ts | `/api/meta-entity-authoring/releases/:id/activate` | POST | `studio.platform.catalog.manage` | — |
| server/packages/planes/studio/meta-entity-authoring/src/routes.ts | `/api/meta-entity-authoring/releases/:id/rollback` | POST | `studio.platform.catalog.manage` | — |
| server/packages/platform/ai/src/atlas-experience-routes.ts | `<dynamic-or-mounted>` | UNKNOWN | `studio.platform.catalog.manage` | authorizeAdmin |
| server/packages/platform/ai/src/atlas-routes.ts | `<dynamic-or-mounted>` | UNKNOWN | `neon.ai.agent.use` | — |
| server/packages/platform/ai/src/atlas-surface-draft-routes.ts | `<dynamic-or-mounted>` | UNKNOWN | `studio.platform.catalog.manage` | — |
| server/packages/platform/experience/src/routes.ts | `<dynamic-or-mounted>` | UNKNOWN | `studio.platform.catalog.manage` | — |
| server/packages/services/publication/src/publication-routes.ts | `<dynamic-or-mounted>` | UNKNOWN | — | requirePermission |

## Contract and UI field inventory

| Field | Artifact class | Path | Lines |
|---|---|---|---|
| `allowed` | keycloak | deploy/config/iam/realm-athyper-clean-slate.json | 2239, 2249, 2251, 2685, 2713, 2717, 2732, 2744, 2748 |
| `allowed` | keycloak | deploy/config/iam/realm-athyper.json | 2241, 2251, 2253, 2846, 2874, 2878, 2893, 2905, 2909 |
| `allowed` | keycloak | deploy/config/iam/realm-platform-control-clean-slate.json | 191, 200, 202 |
| `allowed` | keycloak | deploy/config/iam/realm-platform-control.json | 195, 204, 206 |
| `allowed` | runtime | governance/config/governance/authorization-data-disposition-inventory.v1.json | 1921 |
| `allowed` | runtime | governance/config/governance/authorization-data-disposition-policy.v1.json | 204 |
| `allowed` | runtime | governance/policy/reviews/business-partner-final-binding-66-dispositions-20260912.proposal.dev.json | 4083, 4316, 4326, 4356, 4366, 4378, 4388, 11793, 12078, 12088, 12118, 12128, 12140, 12150 |
| `allowed` | runtime | governance/policy/reviews/business-partner-policy-triage.dev.json | 15, 89, 122, 155, 188, 221, 258, 295, 328, 361, 394, 427, 460, 493, 526, 559, 592, 625, 658, 691, 724, 761, 794, 827, 860, 893, 926, 959 |
| `allowed` | runtime | governance/policy/reviews/business-partner-release-19-differences.proposal.dev.json | 60, 104, 148, 192, 264, 385, 429, 500, 544, 615, 659, 730, 774, 818, 862, 906, 950, 999, 1070, 1163, 1207, 1251, 1295, 1366, 1459, 1552, 1645, 1738, 1809, 1902, 1995, 2088, 2132, 2203, 2297, 2320, 2443, 2491, 2565, 2685, 2807, 2929, 3051, 3174, 3296, 3417, 3509, 3554, 3599, 3644, 3689, 3727, 3765, 3810, 3900, 3938, 3976, 4014, 4052, 4090, 4128, 4166, 4204, 4249, 4287, 4371, 4419, 4459, 4500, 4541, 4582, 4623, 4664, 4705, 4746, 4786, 4831 |
| `allowed` | runtime | governance/policy/reviews/business-partner-release-19-differences.successor-20260911.proposal.dev.json | 56, 92, 128, 164, 230, 335, 371, 434, 470, 533, 569, 632, 668, 704, 740, 776, 812, 857, 920, 1001, 1037, 1073, 1109, 1172, 1253, 1334, 1415, 1496, 1559, 1640, 1721, 1802, 1838, 1901, 1985, 2006, 2111, 2150, 2213, 2315, 2423, 2531, 2639, 2744, 2852, 2957, 3033, 3074, 3115, 3156, 3197, 3231, 3265, 3306, 3388, 3422, 3456, 3490, 3524, 3558, 3592, 3626, 3660, 3701, 3735, 3813, 3854, 3888, 3922, 3959, 3996, 4033, 4067, 4104, 4141, 4175, 4216 |
| `allowed` | runtime | governance/policy/reviews/entity-authorization-differences.dev.json | 161, 185, 521, 545, 569, 593, 617, 641, 665, 689 |
| `allowed` | runtime | packages/contracts/platform/authorization/src/index.ts | 2, 7, 18, 21 |
| `allowed` | runtime | packages/contracts/platform/entity-runtime/src/access-decision.ts | 3 |
| `allowed` | runtime | packages/contracts/platform/entity-runtime/src/intake-surface-authoring.ts | 155, 158, 160, 161, 162 |
| `allowed` | runtime | packages/contracts/platform/fixtures/authorization-snapshot.v1.json | 4 |
| `allowed` | runtime | packages/contracts/platform/fixtures/platform-bootstrap.v1.json | 23 |
| `allowed` | runtime | packages/planes/neon/business-partner/src/360/company-relationships.ts | 13 |
| `allowed` | test | packages/planes/neon/business-partner/src/entity-lookup.test.tsx | 378 |
| `allowed` | test | packages/planes/studio/business-partner/src/composition-configuration.test.ts | 136 |
| `allowed` | runtime | packages/platform/shell/shell-runtime/src/core.ts | 28 |
| `allowed` | runtime | packages/platform/shell/shell/src/home-personalization.ts | 51 |
| `allowed` | ui | packages/platform/shell/shell/src/home.tsx | 1772 |
| `allowed` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/intent-feedback.mts | 150 |
| `allowed` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-inbox.mts | 165 |
| `allowed` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval-qualification.mts | 16 |
| `allowed` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval.mts | 135 |
| `allowed` | test | server/apps/platform-host/scripts/db-verification/tests/integration/governed-internal-business-partner-http.mjs | 135 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/ai-vertical.test.ts | 81, 86 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/atlas-attachment-knowledge.test.ts | 69 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/atlas-document-grounding.test.ts | 11 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/atlas-entity-records-vertical.test.ts | 16, 25 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/bp-list-insights.test.ts | 41, 90, 91 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/business-partner-authorization-shadow.test.ts | 44, 112, 119, 149, 194, 199, 201, 203, 221, 225, 237, 245, 247, 262, 289, 295, 303, 310, 321, 326, 354, 390, 392, 414, 432, 448, 449, 513, 599, 617, 622, 653, 657 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/business-partner-bound-import.test.ts | 15 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/business-partner-case-authority.test.ts | 40, 47, 60, 79, 88, 115, 132, 142, 148, 157, 194 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/business-partner-company-native-authority.test.ts | 11, 27 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/business-partner-import-runtime.test.ts | 24, 67, 108, 110, 119 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-read-policy.test.ts | 37, 101, 103, 126 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-reveal-policy.test.ts | 100, 121, 129, 133, 143, 151 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/finance-http-review.test.ts | 110 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/iam-api-review.test.ts | 46, 163 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/master-data-authority.test.ts | 22, 46, 52 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/master-data-vertical.test.ts | 41 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/meta-entity-authoring-authorizer.test.ts | 5, 7, 10, 13, 17, 23, 24, 27, 32, 33, 34, 36 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/verification-routes.test.ts | 13, 189 |
| `allowed` | runtime | server/apps/platform-host/src/composition/atlas-attachment-knowledge.ts | 115, 288 |
| `allowed` | runtime | server/apps/platform-host/src/composition/atlas-document-grounding.ts | 87 |
| `allowed` | runtime | server/apps/platform-host/src/composition/business-partner-authorization-shadow.ts | 236, 359, 376, 488, 496 |
| `allowed` | runtime | server/apps/platform-host/src/composition/business-partner-case-authority.ts | 28, 65 |
| `allowed` | test | server/apps/platform-host/src/composition/business-partner-definition-authorizer.test.ts | 9, 17, 22, 25, 29, 34, 35 |
| `allowed` | runtime | server/apps/platform-host/src/composition/business-partner-definition-authorizer.ts | 9, 12, 14, 16 |
| `allowed` | runtime | server/apps/platform-host/src/composition/business-partner-export-runtime.ts | 13 |
| `allowed` | runtime | server/apps/platform-host/src/composition/business-partner-import-runtime.ts | 16, 56, 102 |
| `allowed` | route | server/apps/platform-host/src/composition/finance-routes.ts | 41, 295 |
| `allowed` | runtime | server/apps/platform-host/src/composition/local-graph-preview.ts | 59 |
| `allowed` | runtime | server/apps/platform-host/src/composition/meta-entity-authoring-authorizer.ts | 7, 9, 11, 15, 23, 25 |
| `allowed` | runtime | server/apps/platform-host/src/composition/register-platform.ts | 525, 833 |
| `allowed` | runtime | server/apps/platform-host/src/composition/register-services.ts | 1395, 2158, 2166, 2343, 3139, 3146, 3156, 3166, 3179, 3192, 3199, 3214, 3221, 3255, 3309, 3320, 3324, 5859, 5862, 5863, 6021, 6025, 6170, 6963, 7514 |
| `allowed` | runtime | server/apps/platform-host/src/composition/supplier-process-communications.ts | 172, 573, 589 |
| `allowed` | runtime | server/apps/platform-host/src/composition/supplier-process-edit-policy.ts | 66 |
| `allowed` | test | server/apps/platform-host/src/composition/supplier-process-task-authority.test.ts | 38 |
| `allowed` | runtime | server/apps/platform-host/src/composition/supplier-process-tasks.ts | 470 |
| `allowed` | runtime | server/apps/platform-host/src/composition/task-edit-policy-authoring.ts | 19 |
| `allowed` | tool | server/apps/platform-host/src/scripts/qualify-document-infrastructure.ts | 158 |
| `allowed` | tool | server/apps/platform-host/src/scripts/qualify-document-malware.ts | 250 |
| `allowed` | ddl | server/db/ddl/common/master/03_platform_tables.sql | 50 |
| `allowed` | tool | server/db/scripts/checks/seeds/authorization-release-gates.ts | 52, 187 |
| `allowed` | tool | server/db/scripts/seed/compile-mesh-authorization-inventory.ts | 228, 229 |
| `allowed` | tool | server/db/scripts/seed/compile-neon-authorization-inventory.ts | 207, 211 |
| `allowed` | test | server/db/scripts/tests/integration/atlas/tools-rls.ts | 175, 176, 279, 368, 422, 459 |
| `allowed` | test | server/db/scripts/tests/integration/business-partner-bank-verification.ts | 76 |
| `allowed` | test | server/db/scripts/tests/integration/external-worker-iam-cross-plane.mjs | 478 |
| `allowed` | test | server/db/scripts/tests/integration/identity-replay-live.mjs | 458, 464, 471 |
| `allowed` | runtime | server/packages/adapters/ai-ollama/src/index.ts | 192 |
| `allowed` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `allowed` | runtime | server/packages/contracts/ai/src/tools.ts | 115 |
| `allowed` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 20, 39 |
| `allowed` | runtime | server/packages/contracts/auth/src/authorization.ts | 7, 79, 122, 123 |
| `allowed` | runtime | server/packages/contracts/auth/src/management.ts | 204, 207 |
| `allowed` | test | server/packages/planes/mesh/src/business-partner-bank-disclosure.test.ts | 5 |
| `allowed` | runtime | server/packages/planes/mesh/src/business-partner-bank-disclosure.ts | 820 |
| `allowed` | test | server/packages/planes/mesh/src/business-partner-network-exchange.test.ts | 5 |
| `allowed` | runtime | server/packages/planes/mesh/src/business-partner-network-exchange.ts | 639 |
| `allowed` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3, 6 |
| `allowed` | runtime | server/packages/planes/mesh/src/business-partner-profile-publication.ts | 762 |
| `allowed` | test | server/packages/planes/mesh/src/network-account-context.test.ts | 8, 14 |
| `allowed` | test | server/packages/planes/neon/src/__tests__/integration/business-partner-bank-verification.ts | 79 |
| `allowed` | test | server/packages/planes/neon/src/business-partner-account-bank-linkage.test.ts | 6, 7 |
| `allowed` | runtime | server/packages/planes/neon/src/business-partner-account-bank-linkage.ts | 512, 536, 896, 1176 |
| `allowed` | test | server/packages/planes/neon/src/business-partner-intake-protection.test.ts | 8, 10 |
| `allowed` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6, 23 |
| `allowed` | runtime | server/packages/planes/neon/src/business-partner-profile-match.ts | 176 |
| `allowed` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7, 23 |
| `allowed` | runtime | server/packages/planes/neon/src/business-partner-profile-projection.ts | 147 |
| `allowed` | test | server/packages/planes/neon/src/finance-http.test.ts | 20 |
| `allowed` | route | server/packages/planes/neon/src/finance-http.ts | 445 |
| `allowed` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 47 |
| `allowed` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/durable-preview-adapter.test.ts | 22, 30, 96 |
| `allowed` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/graph-editor-routes.test.ts | 25 |
| `allowed` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/learning-inbox.test.ts | 36 |
| `allowed` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/learning-route-scope.test.ts | 11 |
| `allowed` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/release-inspection-routes.test.ts | 32, 69, 82, 98 |
| `allowed` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/reviewer-read-routes.test.ts | 28, 31, 32 |
| `allowed` | runtime | server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts | 521, 1228 |
| `allowed` | runtime | server/packages/planes/studio/meta-entity-authoring/src/entity-authorization.ts | 90 |
| `allowed` | runtime | server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.ts | 709, 711 |
| `allowed` | runtime | server/packages/planes/studio/meta-entity-authoring/src/learning-inbox.ts | 129, 177, 204, 205, 373, 407, 430, 437 |
| `allowed` | route | server/packages/planes/studio/meta-entity-authoring/src/routes.ts | 25, 30, 39, 46, 55, 59, 70, 78, 98, 119, 178, 195, 223, 236, 256, 342 |
| `allowed` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 26 |
| `allowed` | runtime | server/packages/planes/studio/onboarding/src/maintenance.ts | 24 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/business-context.test.ts | 19 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/business-partner-evaluations.test.ts | 12, 22, 87, 89, 120, 124, 146 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/business-partner-insight-tools.test.ts | 14 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/business-partner-list-insights.test.ts | 16 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/conversation-composition.test.ts | 16, 66 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/durable-message-lineage.test.ts | 22, 230, 260 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/entity-record-tool.test.ts | 14, 65, 120 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/entity-section-tool.test.ts | 11 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/inference-reauthorization.test.ts | 52 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/local-generation.test.ts | 11, 20, 26, 30, 31, 32 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/repository-review.test.ts | 180, 193 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/response-feedback.test.ts | 7 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/retrieval-f5.test.ts | 11 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/review-fixture.ts | 18 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/route-review.test.ts | 299 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7, 37 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15 |
| `allowed` | runtime | server/packages/platform/ai/src/context.ts | 22 |
| `allowed` | runtime | server/packages/platform/ai/src/conversation-composition.ts | 92 |
| `allowed` | runtime | server/packages/platform/ai/src/experience-configuration.ts | 19, 20, 28, 29, 30 |
| `allowed` | runtime | server/packages/platform/ai/src/knowledge.ts | 247, 249 |
| `allowed` | runtime | server/packages/platform/ai/src/local-generation-composition.ts | 38 |
| `allowed` | runtime | server/packages/platform/ai/src/surface-draft-generation.ts | 109 |
| `allowed` | runtime | server/packages/platform/ai/src/tool-service.ts | 61, 62, 84, 91, 134, 245 |
| `allowed` | runtime | server/packages/platform/audit/src/governance-service.ts | 101 |
| `allowed` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 357 |
| `allowed` | runtime | server/packages/platform/collaboration/src/collaboration-service.ts | 472 |
| `allowed` | test | server/packages/platform/control-admin/src/authorization-governance.postgres.test.ts | 110 |
| `allowed` | test | server/packages/platform/control-admin/src/authorization-management-service.test.ts | 41, 161, 356, 435, 441, 445, 454, 462 |
| `allowed` | runtime | server/packages/platform/control-admin/src/authorization-management-service.ts | 169, 170, 171, 172, 239, 248, 364 |
| `allowed` | test | server/packages/platform/control-admin/src/authorization-writers.postgres.test.ts | 41 |
| `allowed` | test | server/packages/platform/control-admin/src/bank-validation.test.ts | 98 |
| `allowed` | runtime | server/packages/platform/control-admin/src/bank-validation.ts | 9 |
| `allowed` | runtime | server/packages/platform/control-admin/src/connector-control.ts | 10 |
| `allowed` | test | server/packages/platform/control-admin/src/cycle/cycle-config-service.test.ts | 50 |
| `allowed` | runtime | server/packages/platform/control-admin/src/cycle/cycle-config-service.ts | 447 |
| `allowed` | runtime | server/packages/platform/control-admin/src/entitlement-control.ts | 10 |
| `allowed` | runtime | server/packages/platform/control-admin/src/feature-control.ts | 33 |
| `allowed` | runtime | server/packages/platform/control-admin/src/kysely-authorization-management-repository.ts | 227, 234 |
| `allowed` | test | server/packages/platform/control-admin/src/kysely-entitlement-repository.postgres.test.ts | 1100 |
| `allowed` | runtime | server/packages/platform/control-admin/src/lookup-control.ts | 26 |
| `allowed` | runtime | server/packages/platform/control-admin/src/parameter-control.ts | 33 |
| `allowed` | runtime | server/packages/platform/control-admin/src/rounding-control.ts | 40 |
| `allowed` | runtime | server/packages/platform/control-admin/src/runtime-command-service.ts | 829 |
| `allowed` | test | server/packages/platform/experience/src/entity-operation-dispatcher.test.ts | 10, 46 |
| `allowed` | runtime | server/packages/platform/experience/src/entity-operation-dispatcher.ts | 44 |
| `allowed` | test | server/packages/platform/experience/src/entity-section-service.test.ts | 9 |
| `allowed` | runtime | server/packages/platform/experience/src/entity-section-service.ts | 169 |
| `allowed` | test | server/packages/platform/experience/src/service.test.ts | 16, 109, 152, 314, 326, 335, 384 |
| `allowed` | runtime | server/packages/platform/experience/src/service.ts | 225, 272, 300, 1076 |
| `allowed` | runtime | server/packages/platform/governance/src/compliance/legal-hold-service.ts | 78 |
| `allowed` | runtime | server/packages/platform/governance/src/compliance/report-pack-service.ts | 368 |
| `allowed` | test | server/packages/platform/governance/src/cycles/cycle-execution-services.test.ts | 185 |
| `allowed` | runtime | server/packages/platform/governance/src/cycles/cycle-execution-services.ts | 153 |
| `allowed` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `allowed` | route | server/packages/platform/governance/src/routes/governance-routes.ts | 83 |
| `allowed` | runtime | server/packages/platform/iam/src/__fixtures__/authorization-golden-corpus.v1.json | 15, 24, 34, 44, 51, 58, 64, 71, 78, 84, 91, 97, 103 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/authorization-golden-corpus.test.ts | 12 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/iam-foundation.test.ts | 11, 12, 13, 14 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/iam-service.test.ts | 35, 39, 59, 61 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2, 4 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/identity-replay-approval.test.ts | 13, 21, 22, 23 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/identity-replay-routes.test.ts | 53, 68, 173, 183 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/legacy-compatibility.test.ts | 2 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 11, 17, 19, 24, 32, 50, 55, 60, 75, 77, 78, 79, 80, 81, 90, 93 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10, 22 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/shadow-authorizer.test.ts | 6, 22, 49, 53, 58, 65, 76, 84, 109, 122 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/source-permission-constraints.test.ts | 14, 43, 100 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6, 16 |
| `allowed` | runtime | server/packages/platform/iam/src/external-worker-identity-intent.ts | 206, 229 |
| `allowed` | route | server/packages/platform/iam/src/iam-routes.ts | 36 |
| `allowed` | runtime | server/packages/platform/iam/src/iam-service.ts | 173, 174, 180, 183, 225 |
| `allowed` | runtime | server/packages/platform/iam/src/identity-provisioning-service.ts | 24 |
| `allowed` | runtime | server/packages/platform/iam/src/identity-replay-approval.ts | 73, 132 |
| `allowed` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 342, 379 |
| `allowed` | runtime | server/packages/platform/iam/src/legacy-compatibility.ts | 1, 8 |
| `allowed` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 16, 46, 54, 63, 72, 75, 78, 81, 87, 89, 95, 96, 97, 107, 115, 118, 124, 132, 134, 138, 144, 301 |
| `allowed` | runtime | server/packages/platform/iam/src/provisioning-vertical.ts | 56 |
| `allowed` | runtime | server/packages/platform/iam/src/required-actions.ts | 2, 3, 14, 17, 19 |
| `allowed` | runtime | server/packages/platform/iam/src/trustiam-authority.ts | 117 |
| `allowed` | route | server/packages/platform/jobs/src/job-admin-routes.ts | 466, 471 |
| `allowed` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `allowed` | runtime | server/packages/platform/notifications/src/notification-operations.ts | 229 |
| `allowed` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `allowed` | route | server/packages/platform/policy/src/policy-routes.ts | 41, 81 |
| `allowed` | test | server/packages/platform/preferences/src/entity-views-routes.test.ts | 15 |
| `allowed` | test | server/packages/platform/search/src/__tests__/fixtures.ts | 1 |
| `allowed` | runtime | server/packages/platform/search/src/document-search-service.ts | 18 |
| `allowed` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 30, 87 |
| `allowed` | runtime | server/packages/platform/workflow/src/workflow-service.ts | 74, 82, 141 |
| `allowed` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 125, 163, 164, 263, 264 |
| `allowed` | route | server/packages/services/attachments/src/attachment-routes.ts | 330, 343, 364, 386 |
| `allowed` | runtime | server/packages/services/attachments/src/retrieval-admission.ts | 117 |
| `allowed` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `allowed` | runtime | server/packages/services/content/src/content-service.ts | 4, 5 |
| `allowed` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 36, 101, 117 |
| `allowed` | runtime | server/packages/services/documents/src/document-service.ts | 141 |
| `allowed` | runtime | server/packages/services/finance/src/ledger/cross-book-posting-service.ts | 10, 25 |
| `allowed` | runtime | server/packages/services/finance/src/planning/planning-service.ts | 9 |
| `allowed` | test | server/packages/services/integration/src/__tests__/integration-routes.test.ts | 183 |
| `allowed` | route | server/packages/services/integration/src/integration-routes.ts | 54 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-360-commercial-controls.test.ts | 9 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-360-explainability.test.ts | 4 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-360-policy.test.ts | 18, 20, 21, 104, 105 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-360-resources.test.ts | 132, 133 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-360-service.test.ts | 21, 274, 281, 383, 681, 682, 685, 686 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-case-service.test.ts | 29, 467, 504, 505, 506, 508, 509 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-eligibility-service.test.ts | 7, 9, 24, 31 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-invitation-service.test.ts | 9 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-provider-projection.test.ts | 33, 63, 73, 74, 117, 118, 122, 131, 141, 200, 201, 213 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-reveal-affordances.test.ts | 22, 44, 81 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-reveal-revocation.test.ts | 44, 45, 103, 104, 105, 106 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/customer-onboarding-service.test.ts | 209 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/governed-internal-business-partner-service.test.ts | 15, 26, 62 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/integration/governed-internal-business-partner-http.mjs | 133 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/master-data-repository.postgres.test.ts | 1176, 1454 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/master-data-services.test.ts | 32 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/worker-engagement-iam-service.test.ts | 25 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/workforce-service.test.ts | 6, 16 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-360-mesh-network-adapter.ts | 11 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-360-policy.ts | 75, 105, 121, 143, 159 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-360-service.ts | 402, 1558 |
| `allowed` | test | server/packages/services/master-data/src/business-partner-atlas-insights.test.ts | 9, 68 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-atlas-insights.ts | 24, 69, 70, 71 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-company-pilot.ts | 64, 75, 111 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-eligibility-service.ts | 1303 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-invitation-service.ts | 171 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-provider-projection.ts | 553, 561, 608, 609, 624, 632, 633, 635 |
| `allowed` | route | server/packages/services/master-data/src/business-partner-request-routes.ts | 361 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-request-service.ts | 432, 1835 |
| `allowed` | runtime | server/packages/services/master-data/src/governed-internal-business-partner-service.ts | 101 |
| `allowed` | runtime | server/packages/services/master-data/src/master-data-authority.ts | 84, 88 |
| `allowed` | runtime | server/packages/services/master-data/src/supplier-workforce-command-guard.ts | 51, 54 |
| `allowed` | runtime | server/packages/services/master-data/src/supplier-workforce-requisition-service.ts | 18 |
| `allowed` | runtime | server/packages/services/master-data/src/verification-authority.ts | 21 |
| `allowed` | runtime | server/packages/services/master-data/src/workforce-service.ts | 43 |
| `allowed` | route | server/packages/services/publication/src/business-partner-case-contract-routes.ts | 282 |
| `allowed` | route | server/packages/services/publication/src/business-partner-definition-routes.ts | 302 |
| `allowed` | route | server/packages/services/publication/src/publication-routes.ts | 138 |
| `allowed` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `allowed` | test | server/packages/services/records/src/__tests__/canonical-read-backend.test.ts | 90, 124, 172, 197 |
| `allowed` | test | server/packages/services/records/src/__tests__/canonical-read-diagnostics.test.ts | 90, 124, 180, 220, 239, 253 |
| `allowed` | test | server/packages/services/records/src/__tests__/entity-authorization.test.ts | 81, 97, 99, 100, 110, 123, 154, 180, 183, 184, 185, 188, 189, 211, 226, 239, 265, 323, 325, 330, 344, 379, 393, 397, 421, 438, 465, 519, 522 |
| `allowed` | test | server/packages/services/records/src/__tests__/entity-backend-authorizer.test.ts | 46, 89, 93, 145, 158, 166, 171, 178, 184, 200, 208, 209, 212, 223, 242, 255, 288, 299, 451, 452, 531, 541, 561, 583, 612, 613, 623, 627 |
| `allowed` | test | server/packages/services/records/src/__tests__/entity-backend-isolated-execution.test.ts | 46, 150, 153, 163 |
| `allowed` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20, 39, 47, 113, 141, 150, 195, 237, 238 |
| `allowed` | test | server/packages/services/records/src/__tests__/list-context-discovery.test.ts | 26, 71, 72, 73, 97, 150 |
| `allowed` | test | server/packages/services/records/src/__tests__/list-experience.test.ts | 88, 146, 288, 414, 549, 553 |
| `allowed` | test | server/packages/services/records/src/__tests__/navigation-context-discovery.test.ts | 44, 103, 120, 121 |
| `allowed` | test | server/packages/services/records/src/__tests__/record-read-access.test.ts | 6, 19, 31, 32, 36, 41, 50 |
| `allowed` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 44, 47, 141 |
| `allowed` | test | server/packages/services/records/src/__tests__/snapshot-routes.test.ts | 14 |
| `allowed` | test | server/packages/services/records/src/__tests__/snapshot-service.test.ts | 15 |
| `allowed` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8, 41 |
| `allowed` | runtime | server/packages/services/records/src/actions/action-service.ts | 12 |
| `allowed` | runtime | server/packages/services/records/src/entity-authorization.ts | 51, 215, 218, 234, 246, 262, 265, 289, 318, 349, 367, 372 |
| `allowed` | runtime | server/packages/services/records/src/entity-backend-authorizer.ts | 212, 213, 238, 246, 249, 256, 271, 332, 344, 345, 359, 361, 377, 391, 416, 418, 422, 425 |
| `allowed` | runtime | server/packages/services/records/src/entity-list-service.ts | 1085, 1090, 1102, 1107, 1108, 1144, 1148, 1178, 1255 |
| `allowed` | runtime | server/packages/services/records/src/field-validation.ts | 35 |
| `allowed` | runtime | server/packages/services/records/src/lifecycle-service.ts | 20 |
| `allowed` | runtime | server/packages/services/records/src/list-context-discovery.ts | 122 |
| `allowed` | runtime | server/packages/services/records/src/list-experience.ts | 104, 118, 128, 136 |
| `allowed` | runtime | server/packages/services/records/src/mutation-service.ts | 35, 57, 61, 77, 82, 98, 112, 129 |
| `allowed` | runtime | server/packages/services/records/src/navigation-context-discovery.ts | 65 |
| `allowed` | runtime | server/packages/services/records/src/query-service.ts | 45, 150, 271, 282, 593, 605 |
| `allowed` | runtime | server/packages/services/records/src/record-read-access.ts | 11, 33, 38, 42, 75 |
| `allowed` | route | server/packages/services/records/src/snapshots/snapshot-routes.ts | 18 |
| `allowed` | runtime | server/packages/services/records/src/standard-views.ts | 57 |
| `allowed` | test | server/packages/services/records/src/transfer/export-preflight.test.ts | 6, 10 |
| `allowed` | runtime | server/packages/services/records/src/transfer/transfer-jobs.ts | 1271 |
| `allowed` | runtime | server/packages/services/records/src/transfer/transfer-service.ts | 1997 |
| `allowed` | test | tests/contracts/access-consumption-phase9.test.ts | 13, 37, 41 |
| `allowed` | test | tests/contracts/api-client-transport.test.ts | 97 |
| `allowed` | test | tests/contracts/auth-session-foundation.test.ts | 35 |
| `allowed` | test | tests/contracts/business-partner-independent-child.test.ts | 20, 33, 73 |
| `allowed` | test | tests/contracts/home-personalization-phase3.test.ts | 26, 28, 30 |
| `allowed` | tool | tooling/scripts/local-dev/graph-preview.integration.test.mts | 255, 265, 279, 324 |
| `allowed` | tool | tooling/scripts/policy/authorization-inventory.ts | 891, 1112, 1132 |
| `allowed` | tool | tooling/scripts/policy/verify-api-client-phase2.mjs | 10, 13 |
| `allowed` | tool | tooling/scripts/verification/entity-authorization/canonical-execution-evidence.mjs | 36, 37 |
| `allowed` | tool | tooling/scripts/verification/entity-authorization/canonical-execution-evidence.test.mjs | 16, 18, 19, 26, 28, 29, 37, 48, 51, 69 |
| `allowed` | tool | tooling/scripts/verification/entity-authorization/policy-differences.mjs | 3, 24 |
| `allowed` | tool | tooling/scripts/verification/entity-authorization/policy-differences.test.mjs | 4, 5, 14 |
| `allowed` | tool | tooling/scripts/verification/isolated-enter/harness/ai-retrieval.mjs | 50 |
| `allowed` | tool | tooling/scripts/verification/isolated-enter/preview-summary-open-work.mts | 121 |
| `allowed` | tool | tooling/scripts/verification/isolated-execution/ai-retrieval.mjs | 14 |
| `allowed` | tool | tooling/scripts/verification/isolated-execution/case-bindings.mjs | 20 |
| `allowed` | tool | tooling/scripts/verification/isolated-execution/host.mjs | 52, 56 |
| `allowed` | tool | tooling/scripts/verification/isolated-execution/import-policy.mjs | 5 |
| `allowed` | tool | tooling/scripts/verification/isolated-execution/import-policy.test.mjs | 3 |
| `allowed` | tool | tooling/scripts/verification/qualify-business-partner-database-adapters.mts | 49, 61 |
| `allowed` | tool | tooling/scripts/verification/qualify-entity-authorization.mts | 82, 111, 125, 185, 202, 207, 209, 217, 241 |
| `allowed` | tool | tooling/scripts/verification/qualify-task-policy-authoring-db.mts | 25 |
| `allowed` | tool | tooling/scripts/verification/verify-local-atlas-conversations.mts | 65 |
| `allowed` | tool | tooling/scripts/verification/verify-local-atlas-generation-races.mts | 25 |
| `allowed` | tool | tooling/scripts/verification/verify-local-atlas-generation.mts | 22, 44 |
| `authorizationScopes` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/intent-feedback.mts | 155 |
| `authorizationScopes` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-inbox.mts | 170 |
| `authorizationScopes` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval.mts | 140 |
| `authorizationScopes` | test | server/apps/platform-host/src/composition/__tests__/atlas-entity-records-vertical.test.ts | 16 |
| `authorizationScopes` | test | server/apps/platform-host/src/composition/__tests__/bp-list-insights.test.ts | 46 |
| `authorizationScopes` | test | server/apps/platform-host/src/composition/__tests__/business-partner-authorization-shadow.test.ts | 49 |
| `authorizationScopes` | test | server/apps/platform-host/src/composition/__tests__/business-partner-company-native-authority.test.ts | 31 |
| `authorizationScopes` | test | server/apps/platform-host/src/composition/__tests__/business-partner-import-runtime.test.ts | 71 |
| `authorizationScopes` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-read-policy.test.ts | 41 |
| `authorizationScopes` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-reveal-policy.test.ts | 105 |
| `authorizationScopes` | test | server/apps/platform-host/src/composition/__tests__/iam-api-review.test.ts | 54 |
| `authorizationScopes` | test | server/apps/platform-host/src/composition/__tests__/master-data-authority.test.ts | 23 |
| `authorizationScopes` | test | server/apps/platform-host/src/composition/__tests__/master-data-vertical.test.ts | 41 |
| `authorizationScopes` | test | server/apps/platform-host/src/composition/__tests__/meta-entity-authoring-authorizer.test.ts | 5 |
| `authorizationScopes` | test | server/apps/platform-host/src/composition/business-partner-definition-authorizer.test.ts | 9 |
| `authorizationScopes` | runtime | server/apps/platform-host/src/composition/register-services.ts | 7519 |
| `authorizationScopes` | tool | server/apps/platform-host/src/scripts/qualify-document-infrastructure.ts | 161 |
| `authorizationScopes` | tool | server/apps/platform-host/src/scripts/qualify-document-malware.ts | 255 |
| `authorizationScopes` | test | server/db/scripts/tests/integration/business-partner-bank-verification.ts | 80 |
| `authorizationScopes` | test | server/db/scripts/tests/integration/identity-replay-live.mjs | 463 |
| `authorizationScopes` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `authorizationScopes` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 25 |
| `authorizationScopes` | runtime | server/packages/contracts/auth/src/authorization.ts | 84 |
| `authorizationScopes` | test | server/packages/planes/mesh/src/business-partner-bank-disclosure.test.ts | 5 |
| `authorizationScopes` | test | server/packages/planes/mesh/src/business-partner-network-exchange.test.ts | 5 |
| `authorizationScopes` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3 |
| `authorizationScopes` | test | server/packages/planes/neon/src/__tests__/integration/business-partner-bank-verification.ts | 83 |
| `authorizationScopes` | test | server/packages/planes/neon/src/business-partner-account-bank-linkage.test.ts | 6 |
| `authorizationScopes` | runtime | server/packages/planes/neon/src/business-partner-account-bank-linkage.ts | 512 |
| `authorizationScopes` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6 |
| `authorizationScopes` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7 |
| `authorizationScopes` | test | server/packages/planes/neon/src/finance-http.test.ts | 25 |
| `authorizationScopes` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 52 |
| `authorizationScopes` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 31 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/business-partner-evaluations.test.ts | 12 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/business-partner-insight-tools.test.ts | 14 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/review-fixture.ts | 23 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15 |
| `authorizationScopes` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 362 |
| `authorizationScopes` | test | server/packages/platform/control-admin/src/kysely-entitlement-repository.postgres.test.ts | 1105 |
| `authorizationScopes` | test | server/packages/platform/experience/src/service.test.ts | 16, 156, 169, 177, 185, 194, 206, 218, 229, 238, 274, 282, 290 |
| `authorizationScopes` | runtime | server/packages/platform/experience/src/service.ts | 700, 756, 757, 878, 943 |
| `authorizationScopes` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `authorizationScopes` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `authorizationScopes` | test | server/packages/platform/iam/src/__tests__/identity-replay-routes.test.ts | 72 |
| `authorizationScopes` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 12, 34 |
| `authorizationScopes` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10 |
| `authorizationScopes` | test | server/packages/platform/iam/src/__tests__/source-permission-constraints.test.ts | 18 |
| `authorizationScopes` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `authorizationScopes` | runtime | server/packages/platform/iam/src/iam-service.ts | 188 |
| `authorizationScopes` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 384 |
| `authorizationScopes` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 141 |
| `authorizationScopes` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `authorizationScopes` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `authorizationScopes` | test | server/packages/platform/search/src/__tests__/fixtures.ts | 1 |
| `authorizationScopes` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 87 |
| `authorizationScopes` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 130 |
| `authorizationScopes` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `authorizationScopes` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 36 |
| `authorizationScopes` | test | server/packages/services/master-data/src/__tests__/business-partner-360-resources.test.ts | 133 |
| `authorizationScopes` | test | server/packages/services/master-data/src/__tests__/business-partner-eligibility-service.test.ts | 24 |
| `authorizationScopes` | runtime | server/packages/services/master-data/src/business-partner-360-service.ts | 2187 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/canonical-read-backend.test.ts | 95 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/canonical-read-diagnostics.test.ts | 95 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/entity-authorization.test.ts | 86 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/entity-backend-authorizer.test.ts | 51 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/entity-backend-isolated-execution.test.ts | 51 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/list-context-discovery.test.ts | 31, 120 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/navigation-context-discovery.test.ts | 35, 94, 141, 143 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 44 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `authorizationScopes` | runtime | server/packages/services/records/src/list-context-discovery.ts | 79 |
| `authorizationScopes` | runtime | server/packages/services/records/src/navigation-context-discovery.ts | 43 |
| `authorizationScopes` | test | tests/contracts/business-partner-independent-child.test.ts | 25 |
| `authorizationScopes` | tool | tooling/scripts/verification/qualify-entity-authorization.mts | 89 |
| `denied` | runtime | governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-publication-save-repair.json | 7 |
| `denied` | runtime | governance/evidence/business-partner/r5-development-deployment-2026-09-05.json | 55 |
| `denied` | runtime | governance/policy/reviews/business-partner-final-66-dispositions-20260912.proposal.dev.json | 214, 216, 218, 240, 242, 244, 1441, 1443, 1445, 1469, 1471, 1473, 1759, 1761, 1763, 1785, 1787, 1789, 1832, 1834, 1836, 1858, 1860, 1862, 1905, 1907, 1909, 1931, 1933, 1935, 1978, 1980, 1982, 2004, 2006, 2008, 2051, 2053, 2055, 2077, 2079, 2081, 2124, 2126, 2128, 2150, 2152, 2154, 2219, 2267, 2391, 2621, 2731, 3053, 3113, 3181, 3257, 3333, 3385, 3437, 3489, 3549, 3625, 3704, 3706, 3708, 3732, 3734, 3736, 3801, 4041, 4068, 4070, 4072, 4096, 4098, 4100, 4143, 4145, 4147, 4169, 4171, 4173, 4215, 4217, 4219, 4241, 4243, 4245, 4287, 4289, 4291, 4313, 4315, 4317, 4333, 4359, 4361, 4363, 4385, 4387, 4389, 4431, 4433, 4435, 4457, 4459, 4461, 4503, 4505, 4507, 4529, 4531, 4533 |
| `denied` | runtime | governance/policy/reviews/business-partner-final-binding-66-dispositions-20260912.proposal.dev.json | 539, 541, 543, 559, 561, 563, 4087, 4220, 4222, 4224, 4230, 4232, 4234, 4260, 4262, 4264, 4270, 4272, 4274, 4318, 4320, 4328, 4330, 4358, 4360, 4368, 4370, 4380, 4382, 4390, 4392, 5599, 5601, 5603, 5619, 5621, 5623, 5655, 5657, 5659, 5675, 5677, 5679, 5711, 5713, 5715, 5731, 5733, 5735, 5767, 5769, 5771, 5787, 5789, 5791, 5823, 5825, 5827, 5843, 5845, 5847, 5879, 5881, 5883, 5899, 5901, 5903, 5973, 6028, 6158, 7375, 7810, 10140, 10315, 10570, 10905, 11240, 11335, 11430, 11525, 11700, 11797, 11806, 11928, 11930, 11932, 11938, 11940, 11942, 11968, 11970, 11972, 11978, 11980, 11982, 12051, 12080, 12082, 12090, 12092, 12120, 12122, 12130, 12132, 12142, 12144, 12152, 12154, 13342, 13369, 13371, 13373, 13379, 13381, 13383, 13409, 13411, 13413, 13419, 13421, 13423, 13454, 13456, 13458, 13474, 13476, 13478, 13509, 13511, 13513, 13529, 13531, 13533, 13564, 13566, 13568, 13584, 13586, 13588, 13602, 13619, 13621, 13623, 13639, 13641, 13643, 13674, 13676, 13678, 13694, 13696, 13698, 13729, 13731, 13733, 13749, 13751, 13753 |
| `denied` | runtime | governance/policy/reviews/business-partner-policy-triage.dev.json | 16, 90, 91, 123, 124, 156, 157, 189, 190, 222, 223, 259, 296, 297, 329, 330, 362, 363, 395, 396, 428, 429, 461, 462, 494, 495, 527, 528, 560, 561, 593, 594, 626, 627, 659, 660, 692, 693, 725, 726, 762, 763, 795, 796, 828, 829, 861, 862, 894, 895, 927, 928, 960, 961 |
| `denied` | runtime | governance/policy/reviews/business-partner-release-19-differences.proposal.dev.json | 38, 39, 40, 43, 46, 61, 62, 65, 68, 82, 83, 84, 87, 90, 105, 106, 109, 112, 126, 127, 128, 131, 134, 149, 150, 153, 156, 170, 171, 172, 175, 178, 193, 194, 197, 200, 241, 242, 243, 246, 249, 250, 265, 266, 269, 272, 273, 289, 290, 291, 294, 297, 298, 312, 313, 314, 317, 320, 363, 364, 365, 368, 371, 386, 387, 390, 393, 407, 408, 409, 412, 415, 430, 431, 434, 437, 478, 479, 480, 483, 486, 501, 502, 505, 508, 522, 523, 524, 527, 530, 545, 546, 549, 552, 593, 594, 595, 598, 601, 616, 617, 620, 623, 637, 638, 639, 642, 645, 660, 661, 664, 667, 708, 709, 710, 713, 716, 731, 732, 735, 738, 752, 753, 754, 757, 760, 775, 776, 779, 782, 796, 797, 798, 801, 804, 819, 820, 823, 826, 840, 841, 842, 845, 848, 863, 864, 867, 870, 884, 885, 886, 889, 892, 907, 908, 911, 914, 928, 929, 930, 933, 936, 951, 952, 955, 958, 1021, 1092, 1141, 1142, 1143, 1146, 1149, 1164, 1165, 1168, 1171, 1185, 1186, 1187, 1190, 1193, 1208, 1209, 1212, 1215, 1229, 1230, 1231, 1234, 1237, 1252, 1253, 1256, 1259, 1273, 1274, 1275, 1278, 1281, 1296, 1297, 1300, 1303, 1344, 1345, 1346, 1349, 1352, 1367, 1368, 1371, 1374, 1388, 1389, 1390, 1393, 1396, 1437, 1438, 1439, 1442, 1445, 1460, 1461, 1464, 1467, 1481, 1482, 1483, 1486, 1489, 1530, 1531, 1532, 1535, 1538, 1553, 1554, 1557, 1560, 1574, 1575, 1576, 1579, 1582, 1623, 1624, 1625, 1628, 1631, 1646, 1647, 1650, 1653, 1667, 1668, 1669, 1672, 1675, 1716, 1717, 1718, 1721, 1724, 1739, 1740, 1743, 1746, 1787, 1788, 1789, 1792, 1795, 1810, 1811, 1814, 1817, 1831, 1832, 1833, 1836, 1839, 1880, 1881, 1882, 1885, 1888, 1903, 1904, 1907, 1910, 1924, 1925, 1926, 1929, 1932, 1973, 1974, 1975, 1978, 1981, 1996, 1997, 2000, 2003, 2017, 2018, 2019, 2022, 2025, 2066, 2067, 2068, 2071, 2074, 2089, 2090, 2093, 2096, 2110, 2111, 2112, 2115, 2118, 2133, 2134, 2137, 2140, 2181, 2182, 2183, 2186, 2189, 2204, 2205, 2208, 2211, 2225, 2226, 2227, 2230, 2233, 2274, 2275, 2276, 2279, 2282, 2283, 2298, 2299, 2302, 2305, 2306, 2321, 2322, 2325, 2328, 2345, 2346, 2347, 2350, 2353, 2354, 2368, 2369, 2370, 2373, 2376, 2420, 2421, 2422, 2425, 2428, 2429, 2444, 2445, 2448, 2451, 2468, 2469, 2470, 2473, 2476, 2477, 2492, 2493, 2496, 2499, 2543, 2589, 2611, 2662, 2663, 2664, 2667, 2670, 2671, 2686, 2687, 2690, 2693, 2694, 2710, 2711, 2712, 2715, 2718, 2719, 2733, 2734, 2735, 2738, 2741, 2784, 2785, 2786, 2789, 2792, 2793, 2808, 2809, 2812, 2815, 2816, 2832, 2833, 2834, 2837, 2840, 2841, 2855, 2856, 2857, 2860, 2863, 2906, 2907, 2908, 2911, 2914, 2915, 2930, 2931, 2934, 2937, 2938, 2954, 2955, 2956, 2959, 2962, 2963, 2977, 2978, 2979, 2982, 2985, 3028, 3029, 3030, 3033, 3036, 3037, 3052, 3053, 3056, 3059, 3076, 3077, 3078, 3081, 3084, 3085, 3099, 3100, 3101, 3104, 3107, 3151, 3152, 3153, 3156, 3159, 3160, 3175, 3176, 3179, 3182, 3183, 3199, 3200, 3201, 3204, 3207, 3208, 3222, 3223, 3224, 3227, 3230, 3273, 3274, 3275, 3278, 3281, 3282, 3297, 3298, 3301, 3304, 3305, 3321, 3322, 3323, 3326, 3329, 3330, 3344, 3345, 3346, 3349, 3352, 3395, 3441, 3463, 3510, 3511, 3514, 3517, 3526, 3555, 3556, 3559, 3562, 3571, 3600, 3601, 3604, 3607, 3645, 3646, 3649, 3652, 3661, 3766, 3767, 3770, 3773, 3782, 3811, 3812, 3815, 3818, 3827, 3855, 3901, 3902, 3905, 3908, 3917, 3939, 3940, 3943, 3946, 3955, 3977, 3978, 3981, 3984, 3993, 4015, 4016, 4019, 4022, 4031, 4053, 4054, 4057, 4060, 4069, 4091, 4092, 4095, 4098, 4107, 4129, 4130, 4133, 4136, 4145, 4167, 4168, 4171, 4174, 4183, 4205, 4206, 4209, 4212, 4221, 4250, 4251, 4254, 4257, 4266, 4288, 4289, 4292, 4295, 4296, 4326, 4372, 4373, 4376, 4379, 4391, 4460, 4461, 4464, 4467, 4479, 4501, 4502, 4505, 4508, 4509, 4542, 4543, 4546, 4549, 4550, 4583, 4584, 4587, 4590, 4591, 4624, 4625, 4628, 4631, 4643, 4665, 4666, 4669, 4672, 4673, 4706, 4707, 4710, 4713, 4714, 4787, 4788, 4791, 4794, 4803, 4832, 4833, 4836, 4839, 4848, 4876, 4914, 4952, 4992 |
| `denied` | runtime | governance/policy/reviews/business-partner-release-19-differences.successor-20260911.proposal.dev.json | 38, 39, 40, 42, 43, 57, 58, 60, 61, 74, 75, 76, 78, 79, 93, 94, 96, 97, 110, 111, 112, 114, 115, 129, 130, 132, 133, 146, 147, 148, 150, 151, 165, 166, 168, 169, 209, 210, 211, 213, 215, 216, 231, 232, 234, 236, 237, 251, 252, 253, 255, 257, 258, 272, 273, 274, 276, 277, 317, 318, 319, 321, 322, 336, 337, 339, 340, 353, 354, 355, 357, 358, 372, 373, 375, 376, 416, 417, 418, 420, 421, 435, 436, 438, 439, 452, 453, 454, 456, 457, 471, 472, 474, 475, 515, 516, 517, 519, 520, 534, 535, 537, 538, 551, 552, 553, 555, 556, 570, 571, 573, 574, 614, 615, 616, 618, 619, 633, 634, 636, 637, 650, 651, 652, 654, 655, 669, 670, 672, 673, 686, 687, 688, 690, 691, 705, 706, 708, 709, 722, 723, 724, 726, 727, 741, 742, 744, 745, 758, 759, 760, 762, 763, 777, 778, 780, 781, 794, 795, 796, 798, 799, 813, 814, 816, 817, 875, 938, 983, 984, 985, 987, 988, 1002, 1003, 1005, 1006, 1019, 1020, 1021, 1023, 1024, 1038, 1039, 1041, 1042, 1055, 1056, 1057, 1059, 1060, 1074, 1075, 1077, 1078, 1091, 1092, 1093, 1095, 1096, 1110, 1111, 1113, 1114, 1154, 1155, 1156, 1158, 1159, 1173, 1174, 1176, 1177, 1190, 1191, 1192, 1194, 1195, 1235, 1236, 1237, 1239, 1240, 1254, 1255, 1257, 1258, 1271, 1272, 1273, 1275, 1276, 1316, 1317, 1318, 1320, 1321, 1335, 1336, 1338, 1339, 1352, 1353, 1354, 1356, 1357, 1397, 1398, 1399, 1401, 1402, 1416, 1417, 1419, 1420, 1433, 1434, 1435, 1437, 1438, 1478, 1479, 1480, 1482, 1483, 1497, 1498, 1500, 1501, 1541, 1542, 1543, 1545, 1546, 1560, 1561, 1563, 1564, 1577, 1578, 1579, 1581, 1582, 1622, 1623, 1624, 1626, 1627, 1641, 1642, 1644, 1645, 1658, 1659, 1660, 1662, 1663, 1703, 1704, 1705, 1707, 1708, 1722, 1723, 1725, 1726, 1739, 1740, 1741, 1743, 1744, 1784, 1785, 1786, 1788, 1789, 1803, 1804, 1806, 1807, 1820, 1821, 1822, 1824, 1825, 1839, 1840, 1842, 1843, 1883, 1884, 1885, 1887, 1888, 1902, 1903, 1905, 1906, 1919, 1920, 1921, 1923, 1924, 1964, 1965, 1966, 1968, 1970, 1971, 1986, 1987, 1989, 1991, 1992, 2007, 2008, 2010, 2011, 2024, 2025, 2026, 2028, 2030, 2031, 2045, 2046, 2047, 2049, 2050, 2090, 2091, 2092, 2094, 2096, 2097, 2112, 2113, 2115, 2116, 2129, 2130, 2131, 2133, 2135, 2136, 2151, 2152, 2154, 2155, 2195, 2231, 2249, 2294, 2295, 2296, 2298, 2300, 2301, 2316, 2317, 2319, 2321, 2322, 2336, 2337, 2338, 2340, 2342, 2343, 2357, 2358, 2359, 2361, 2362, 2402, 2403, 2404, 2406, 2408, 2409, 2424, 2425, 2427, 2429, 2430, 2444, 2445, 2446, 2448, 2450, 2451, 2465, 2466, 2467, 2469, 2470, 2510, 2511, 2512, 2514, 2516, 2517, 2532, 2533, 2535, 2537, 2538, 2552, 2553, 2554, 2556, 2558, 2559, 2573, 2574, 2575, 2577, 2578, 2618, 2619, 2620, 2622, 2624, 2625, 2640, 2641, 2643, 2644, 2657, 2658, 2659, 2661, 2663, 2664, 2678, 2679, 2680, 2682, 2683, 2723, 2724, 2725, 2727, 2729, 2730, 2745, 2746, 2748, 2750, 2751, 2765, 2766, 2767, 2769, 2771, 2772, 2786, 2787, 2788, 2790, 2791, 2831, 2832, 2833, 2835, 2837, 2838, 2853, 2854, 2856, 2858, 2859, 2873, 2874, 2875, 2877, 2879, 2880, 2894, 2895, 2896, 2898, 2899, 2939, 2975, 2993, 3034, 3035, 3037, 3038, 3046, 3075, 3076, 3078, 3079, 3087, 3116, 3117, 3119, 3120, 3157, 3158, 3160, 3161, 3169, 3266, 3267, 3269, 3270, 3278, 3307, 3308, 3310, 3311, 3319, 3347, 3389, 3390, 3392, 3393, 3401, 3423, 3424, 3426, 3427, 3435, 3457, 3458, 3460, 3461, 3469, 3491, 3492, 3494, 3495, 3503, 3525, 3526, 3528, 3529, 3537, 3559, 3560, 3562, 3563, 3571, 3593, 3594, 3596, 3597, 3605, 3627, 3628, 3630, 3631, 3639, 3661, 3662, 3664, 3665, 3673, 3702, 3703, 3705, 3706, 3714, 3736, 3737, 3739, 3741, 3742, 3772, 3814, 3815, 3817, 3818, 3826, 3889, 3890, 3892, 3893, 3901, 3923, 3924, 3926, 3928, 3929, 3960, 3961, 3963, 3965, 3966, 3997, 3998, 4000, 4002, 4003, 4034, 4035, 4037, 4038, 4046, 4068, 4069, 4071, 4073, 4074, 4105, 4106, 4108, 4110, 4111, 4176, 4177, 4179, 4180, 4188, 4217, 4218, 4220, 4221, 4229, 4257, 4291, 4325, 4359 |
| `denied` | runtime | governance/policy/reviews/entity-authorization-differences.dev.json | 161, 185, 521, 545, 569, 593, 617, 641, 665, 689 |
| `denied` | runtime | packages/contracts/platform/ai/src/intent.ts | 4, 36, 64 |
| `denied` | runtime | packages/contracts/platform/entity-runtime/src/access-decision.ts | 8 |
| `denied` | test | packages/planes/neon/business-partner/src/case-experience.test.ts | 105 |
| `denied` | test | packages/planes/studio/business-partner/src/authoring.test.tsx | 82 |
| `denied` | test | packages/planes/studio/business-partner/src/case-contract-authoring.test.tsx | 19 |
| `denied` | ui | packages/planes/studio/business-partner/src/case-contract-authoring.tsx | 32 |
| `denied` | test | packages/planes/studio/business-partner/src/workbench.test.tsx | 212 |
| `denied` | ui | packages/planes/studio/business-partner/src/workbench.tsx | 545 |
| `denied` | runtime | packages/platform/ai/agent-runtime/src/index.ts | 114 |
| `denied` | runtime | packages/platform/iam/auth-bff/package.json | 12, 13, 18, 19, 24, 25 |
| `denied` | runtime | packages/platform/iam/auth-bff/src/index.ts | 350 |
| `denied` | runtime | packages/platform/iam/governance-review/package.json | 10, 11, 16, 17, 21, 22, 26, 27, 31, 32 |
| `denied` | runtime | packages/platform/iam/session-store/package.json | 12, 13 |
| `denied` | runtime | packages/platform/shell/activity-center-data/src/index.ts | 24, 31, 32 |
| `denied` | ui | packages/platform/shell/app-foundation/src/boundaries.tsx | 98 |
| `denied` | runtime | packages/platform/shell/app-foundation/src/error-taxonomy.ts | 7, 52 |
| `denied` | runtime | packages/platform/shell/shell/src/messages.ts | 12 |
| `denied` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/intent-feedback.mts | 151 |
| `denied` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-inbox.mts | 166 |
| `denied` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval.mts | 136 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/ai-vertical.test.ts | 81 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/atlas-attachment-knowledge.test.ts | 69, 151 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/atlas-entity-records-vertical.test.ts | 16 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/bp-list-insights.test.ts | 42 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/business-partner-authorization-shadow.test.ts | 27, 45, 120, 121, 200, 202, 226, 247, 257, 434, 629, 678 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/business-partner-company-native-authority.test.ts | 28 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/business-partner-import-runtime.test.ts | 68, 110 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-read-policy.test.ts | 38, 104 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-reveal-policy.test.ts | 101, 134 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/finance-http-review.test.ts | 114 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/iam-api-review.test.ts | 50 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/master-data-authority.test.ts | 23, 45 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/master-data-vertical.test.ts | 41 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/mesh-exchange-readiness.postgres.test.ts | 33, 36 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/meta-entity-authoring-authorizer.test.ts | 5, 17, 33 |
| `denied` | test | server/apps/platform-host/src/composition/__tests__/verification-routes.test.ts | 186 |
| `denied` | runtime | server/apps/platform-host/src/composition/atlas-document-grounding.ts | 142, 185 |
| `denied` | runtime | server/apps/platform-host/src/composition/authorization-management-config.ts | 8, 99, 101 |
| `denied` | runtime | server/apps/platform-host/src/composition/business-partner-authorization-shadow.ts | 237, 359, 376, 488, 496 |
| `denied` | test | server/apps/platform-host/src/composition/business-partner-definition-authorizer.test.ts | 9 |
| `denied` | runtime | server/apps/platform-host/src/composition/register-services.ts | 1963, 6028, 7515 |
| `denied` | test | server/apps/platform-host/src/composition/supplier-process-task-authority.test.ts | 27 |
| `denied` | tool | server/apps/platform-host/src/scripts/qualify-document-infrastructure.ts | 159 |
| `denied` | tool | server/apps/platform-host/src/scripts/qualify-document-malware.ts | 251 |
| `denied` | ddl | server/db/ddl/common/ai/05_constraints.sql | 219 |
| `denied` | ddl | server/db/ddl/common/ai/07_functions.sql | 65 |
| `denied` | ddl | server/db/ddl/common/audit/02_domains.sql | 65 |
| `denied` | test | server/db/scripts/tests/integration/atlas/tools-rls.ts | 340, 341, 343, 345 |
| `denied` | test | server/db/scripts/tests/integration/business-partner-bank-verification.ts | 77 |
| `denied` | test | server/db/scripts/tests/integration/experience-foundation.mjs | 77 |
| `denied` | test | server/db/scripts/tests/integration/identity-replay-live.mjs | 459 |
| `denied` | runtime | server/db/seed/contracts/authorization/control/cross-plane-suspension-control.v1.json | 70 |
| `denied` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `denied` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 21 |
| `denied` | runtime | server/packages/contracts/auth/src/authorization.ts | 80 |
| `denied` | runtime | server/packages/contracts/auth/src/ports.ts | 35 |
| `denied` | test | server/packages/planes/mesh/src/business-partner-bank-disclosure.test.ts | 5 |
| `denied` | runtime | server/packages/planes/mesh/src/business-partner-bank-disclosure.ts | 825 |
| `denied` | test | server/packages/planes/mesh/src/business-partner-network-exchange.test.ts | 5 |
| `denied` | runtime | server/packages/planes/mesh/src/business-partner-network-exchange.ts | 644 |
| `denied` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3 |
| `denied` | runtime | server/packages/planes/mesh/src/business-partner-profile-publication.ts | 766 |
| `denied` | test | server/packages/planes/neon/src/__tests__/integration/business-partner-bank-verification.ts | 80 |
| `denied` | test | server/packages/planes/neon/src/business-partner-account-bank-linkage.test.ts | 6 |
| `denied` | runtime | server/packages/planes/neon/src/business-partner-account-bank-linkage.ts | 1178 |
| `denied` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6 |
| `denied` | runtime | server/packages/planes/neon/src/business-partner-profile-match.ts | 176 |
| `denied` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7 |
| `denied` | runtime | server/packages/planes/neon/src/business-partner-profile-projection.ts | 147 |
| `denied` | test | server/packages/planes/neon/src/finance-http.test.ts | 21 |
| `denied` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 48 |
| `denied` | runtime | server/packages/planes/studio/meta-entity-authoring/src/baseline-publication.ts | 24, 27, 29, 30, 32, 35, 52, 54, 65, 67, 69, 71, 73, 75 |
| `denied` | route | server/packages/planes/studio/meta-entity-authoring/src/routes.ts | 260 |
| `denied` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 27 |
| `denied` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `denied` | test | server/packages/platform/ai/src/__tests__/business-context.test.ts | 20 |
| `denied` | test | server/packages/platform/ai/src/__tests__/business-partner-evaluations.test.ts | 12, 123, 124, 125 |
| `denied` | test | server/packages/platform/ai/src/__tests__/business-partner-insight-tools.test.ts | 14, 105 |
| `denied` | test | server/packages/platform/ai/src/__tests__/conversation-composition.test.ts | 37 |
| `denied` | test | server/packages/platform/ai/src/__tests__/entity-record-tool.test.ts | 65, 66 |
| `denied` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `denied` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `denied` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `denied` | test | server/packages/platform/ai/src/__tests__/local-generation.test.ts | 13 |
| `denied` | test | server/packages/platform/ai/src/__tests__/missing-scope-runtime.test.ts | 105 |
| `denied` | test | server/packages/platform/ai/src/__tests__/repository-review.test.ts | 180, 189, 194, 198 |
| `denied` | test | server/packages/platform/ai/src/__tests__/retrieval-f5.test.ts | 84 |
| `denied` | test | server/packages/platform/ai/src/__tests__/review-fixture.ts | 19 |
| `denied` | test | server/packages/platform/ai/src/__tests__/route-review.test.ts | 298 |
| `denied` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `denied` | test | server/packages/platform/ai/src/__tests__/structured-intent.test.ts | 288 |
| `denied` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7 |
| `denied` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15, 57 |
| `denied` | runtime | server/packages/platform/ai/src/agent-runtime.ts | 326, 774, 1290 |
| `denied` | runtime | server/packages/platform/ai/src/context.ts | 23 |
| `denied` | runtime | server/packages/platform/ai/src/runtime-tool-coordinator.ts | 29 |
| `denied` | runtime | server/packages/platform/ai/src/tool-service.ts | 93, 136, 245 |
| `denied` | runtime | server/packages/platform/audit/src/governance-service.ts | 101 |
| `denied` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 358 |
| `denied` | route | server/packages/platform/control-admin/src/authorization-management-routes.ts | 14, 16 |
| `denied` | test | server/packages/platform/control-admin/src/bank-validation-routes.test.ts | 70, 71 |
| `denied` | test | server/packages/platform/control-admin/src/bank-validation.test.ts | 98 |
| `denied` | runtime | server/packages/platform/control-admin/src/bank-validation.ts | 9 |
| `denied` | test | server/packages/platform/control-admin/src/connector-control.test.ts | 98 |
| `denied` | test | server/packages/platform/control-admin/src/connector-routes.test.ts | 81 |
| `denied` | test | server/packages/platform/control-admin/src/entitlement-routes.test.ts | 59 |
| `denied` | test | server/packages/platform/control-admin/src/kysely-entitlement-repository.postgres.test.ts | 1101 |
| `denied` | test | server/packages/platform/experience/src/entity-section-service.test.ts | 12 |
| `denied` | route | server/packages/platform/experience/src/routes.ts | 35 |
| `denied` | test | server/packages/platform/experience/src/service.test.ts | 16 |
| `denied` | test | server/packages/platform/governance/src/cycles/cycle-execution-services.test.ts | 185 |
| `denied` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `denied` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `denied` | test | server/packages/platform/iam/src/__tests__/identity-replay-routes.test.ts | 69 |
| `denied` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 11, 23, 33 |
| `denied` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10 |
| `denied` | test | server/packages/platform/iam/src/__tests__/shadow-authorizer.test.ts | 104, 116 |
| `denied` | test | server/packages/platform/iam/src/__tests__/source-permission-constraints.test.ts | 15, 59, 63, 73, 95, 103 |
| `denied` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `denied` | runtime | server/packages/platform/iam/src/iam-service.ts | 73, 77, 84, 96, 101, 118, 184, 217, 239 |
| `denied` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 337, 344, 380 |
| `denied` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 74, 258, 262, 264, 272, 274, 276, 284, 286, 288, 293, 303, 307 |
| `denied` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `denied` | test | server/packages/platform/notifications/src/__tests__/email-canary.test.ts | 56 |
| `denied` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `denied` | test | server/packages/platform/search/src/__tests__/fixtures.ts | 1 |
| `denied` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 87 |
| `denied` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 126 |
| `denied` | test | server/packages/services/attachments/src/retrieval-admission.test.ts | 96 |
| `denied` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `denied` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 36, 117 |
| `denied` | test | server/packages/services/finance/src/ledger/business-partner-journal-activity.test.ts | 57, 58, 61 |
| `denied` | test | server/packages/services/master-data/src/__tests__/business-partner-360-commercial-controls.test.ts | 9 |
| `denied` | test | server/packages/services/master-data/src/__tests__/business-partner-360-policy.test.ts | 15, 17 |
| `denied` | test | server/packages/services/master-data/src/__tests__/business-partner-case-service.test.ts | 2079 |
| `denied` | test | server/packages/services/master-data/src/__tests__/business-partner-eligibility-service.test.ts | 24, 31, 32 |
| `denied` | test | server/packages/services/master-data/src/__tests__/business-partner-provider-projection.test.ts | 73, 118 |
| `denied` | test | server/packages/services/master-data/src/__tests__/business-partner-reveal-revocation.test.ts | 43, 44 |
| `denied` | test | server/packages/services/master-data/src/__tests__/master-data-repository.postgres.test.ts | 1448, 1456, 1480, 1485 |
| `denied` | runtime | server/packages/services/master-data/src/business-partner-eligibility-service.ts | 1307 |
| `denied` | runtime | server/packages/services/master-data/src/business-partner-request-service.ts | 1845 |
| `denied` | runtime | server/packages/services/master-data/src/governed-internal-business-partner-service.ts | 105 |
| `denied` | runtime | server/packages/services/master-data/src/master-data-authority.ts | 84, 88 |
| `denied` | runtime | server/packages/services/master-data/src/supplier-workforce-command-guard.ts | 52 |
| `denied` | runtime | server/packages/services/master-data/src/supplier-workforce-requisition-service.ts | 18 |
| `denied` | runtime | server/packages/services/master-data/src/verification-authority.ts | 21 |
| `denied` | runtime | server/packages/services/master-data/src/workforce-service.ts | 43 |
| `denied` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `denied` | test | server/packages/services/records/src/__tests__/canonical-read-backend.test.ts | 91, 106 |
| `denied` | test | server/packages/services/records/src/__tests__/canonical-read-diagnostics.test.ts | 91, 106, 223, 242, 256 |
| `denied` | test | server/packages/services/records/src/__tests__/entity-authorization.test.ts | 82, 131, 134, 151, 158, 192, 312, 341, 358, 363, 393, 420, 433, 437, 451 |
| `denied` | test | server/packages/services/records/src/__tests__/entity-backend-authorizer.test.ts | 47, 304, 445 |
| `denied` | test | server/packages/services/records/src/__tests__/entity-backend-isolated-execution.test.ts | 47, 154 |
| `denied` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `denied` | test | server/packages/services/records/src/__tests__/list-context-discovery.test.ts | 27 |
| `denied` | test | server/packages/services/records/src/__tests__/list-experience.test.ts | 286, 293 |
| `denied` | test | server/packages/services/records/src/__tests__/navigation-context-discovery.test.ts | 144 |
| `denied` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 44 |
| `denied` | test | server/packages/services/records/src/__tests__/snapshot-service.test.ts | 31 |
| `denied` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `denied` | runtime | server/packages/services/records/src/bookmarks/record-bookmark-service.ts | 225 |
| `denied` | runtime | server/packages/services/records/src/entity-authorization.ts | 98, 129, 135, 153, 161, 176, 181, 225, 236, 243, 253 |
| `denied` | runtime | server/packages/services/records/src/entity-backend-authorizer.ts | 216, 249, 344 |
| `denied` | runtime | server/packages/services/records/src/list-context-discovery.ts | 27, 44, 76, 124 |
| `denied` | runtime | server/packages/services/records/src/list-experience.ts | 64, 81, 83 |
| `denied` | test | tests/contracts/auth-session-foundation.test.ts | 96, 217 |
| `denied` | test | tests/contracts/business-partner-independent-child.test.ts | 21, 68 |
| `denied` | test | tests/contracts/home-personalization-phase3.test.ts | 27, 29, 30 |
| `denied` | test | tests/contracts/trusted-device-authentication.test.ts | 28, 29, 30, 31 |
| `denied` | test | tests/e2e/production/surface-matrix.spec.ts | 203 |
| `denied` | test | tests/foundation-browser/error-boundaries.spec.ts | 5 |
| `denied` | test | tests/foundation/error-boundaries.test.tsx | 59 |
| `denied` | tool | tooling/scripts/policy/authorization-inventory.ts | 892 |
| `denied` | tool | tooling/scripts/policy/verify-auth-session-phase3.mjs | 19, 20 |
| `denied` | tool | tooling/scripts/verification/bp-ai-authenticated-evidence.test.mjs | 26, 27, 31 |
| `denied` | tool | tooling/scripts/verification/entity-authorization/canonical-execution-evidence.mjs | 36, 37 |
| `denied` | tool | tooling/scripts/verification/entity-authorization/canonical-execution-evidence.test.mjs | 15, 30, 32, 42, 48, 57 |
| `denied` | tool | tooling/scripts/verification/entity-authorization/policy-differences.mjs | 3, 24 |
| `denied` | tool | tooling/scripts/verification/entity-authorization/policy-differences.test.mjs | 4, 5, 20, 21, 27 |
| `denied` | tool | tooling/scripts/verification/isolated-enter/prepare-affordance-count-execution.mjs | 142 |
| `denied` | tool | tooling/scripts/verification/isolated-enter/prepare-final-binding-dispositions.mjs | 62 |
| `denied` | tool | tooling/scripts/verification/prepare-business-partner-release-19-difference-review.mjs | 39, 40 |
| `denied` | tool | tooling/scripts/verification/provision-business-partner-r3-invitation.mjs | 81, 84 |
| `denied` | tool | tooling/scripts/verification/qualify-atlas-f6-personas.mjs | 25, 26 |
| `denied` | tool | tooling/scripts/verification/qualify-entity-authorization.mts | 85, 126, 136, 137, 152, 163, 164, 202, 207, 209, 217, 253 |
| `denied` | tool | tooling/scripts/verification/qualify-supplier-process-correction-db.mts | 218, 222 |
| `denied` | tool | tooling/scripts/verification/qualify-supplier-process-document-jobs-db.mts | 101, 107 |
| `denied` | tool | tooling/scripts/verification/qualify-task-information-db.mts | 146 |
| `denied` | tool | tooling/scripts/verification/qualify-task-policy-authoring-db.mts | 43 |
| `denied` | ui | tooling/scripts/verification/render-boundary-fixture.tsx | 9 |
| `denied` | tool | tooling/scripts/verification/review-business-partner-roles.mjs | 48 |
| `denied` | tool | tooling/scripts/verification/verify-local-atlas-generation.mts | 44, 45, 58 |
| `groupIds` | test | server/db/scripts/__tests__/provisioning/three-plane-provision.test.ts | 220, 229, 232 |
| `groupIds` | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 119, 145, 158 |
| `groupIds` | tool | server/db/scripts/seed/tenant-authority-projection.ts | 273, 282, 285 |
| `groupIds` | tool | tooling/scripts/policy/authorization-inventory.ts | 893, 916 |
| `groupIds` | tool | tooling/scripts/verification/isolated-enter/affordance-count-client.mjs | 56 |
| `matchedGrantId` | tool | tooling/scripts/policy/authorization-inventory.ts | 916 |
| `matchedGroupId` | tool | tooling/scripts/policy/authorization-inventory.ts | 916 |
| `matchedRoleId` | tool | tooling/scripts/policy/authorization-inventory.ts | 916 |
| `permissionCode` | runtime | apps/studio/app/(shell)/mdg/business-partner/ai-experience/experience-defaults.ts | 54, 64 |
| `permissionCode` | ui | apps/studio/app/(shell)/mdg/business-partner/ai-experience/experience-editor.tsx | 110, 113 |
| `permissionCode` | runtime | governance/config/governance/server-legacy-route-baseline.json | 407, 431, 7055, 7079 |
| `permissionCode` | runtime | governance/policy/reports/business-partner-accepted-operations.dev.json | 217, 221, 225, 229, 233, 237, 241, 245, 249, 253, 257, 261, 265, 269, 273, 277, 281, 285, 289, 293, 297, 301, 305, 309, 313, 317, 321, 325, 329, 333, 337, 341, 345, 349, 353, 357, 361, 365, 369, 373, 377, 381, 515, 551, 586, 622, 1533, 1542, 1551, 1560, 1569, 1578, 1587, 1597, 1607, 1617, 1627, 1637, 1647, 1657, 1667, 1677, 1687, 1697, 1707, 1717, 1727, 1737, 1747, 1757, 1767, 1777, 1787, 1797, 1806, 1815, 1825, 1835, 1845, 1855, 1865, 1875, 1885, 1895, 1905, 1915, 1925, 1935, 2821, 2854, 2887, 2920, 2953, 2986, 3021, 3054, 3089, 3124, 3159, 3194, 3236, 3271, 3306, 3341, 3374, 3407, 3440, 3473, 3506, 3539, 3572, 3605, 3645, 3678, 3711, 3751, 3784, 3817, 3851, 3885, 3920, 3953, 3988, 4023, 4058, 4093, 4128, 4162, 4203, 4243 |
| `permissionCode` | runtime | governance/policy/reports/business-partner-activation-publication.dev.json | 256, 260, 264, 268, 272, 276, 280, 284, 288, 292, 296, 300, 304, 308, 312, 316, 320, 324, 328, 332, 336, 340, 344, 348, 352, 356, 360, 364, 368, 372, 376, 380, 384, 388, 392, 396, 400, 404, 408, 412, 416, 420, 424, 428, 432, 436, 440, 444, 448, 452, 456, 589, 625, 660, 695, 1635, 1644, 1653, 1662, 1671, 1680, 1689, 1699, 1709, 1719, 1729, 1739, 1749, 1759, 1769, 1779, 1789, 1799, 1809, 1819, 1829, 1839, 1849, 1859, 1869, 1879, 1889, 1899, 1909, 1918, 1927, 1937, 1947, 1956, 1965, 1974, 1983, 1992, 2002, 2012, 2022, 2032, 2042, 2052, 2062, 2072, 2082, 2092, 2102, 2112, 2122, 2259, 2297, 2334, 2376, 2389, 2431, 2444, 2486, 2499, 2538, 2580, 2591, 2635, 2646, 2690, 2701, 2745, 2756, 2800, 2811, 2862, 2875, 2912, 2949, 2988, 3027, 3064, 3101, 3138, 3175, 3212, 3249, 3286, 3323, 3367, 3404, 3441, 3485, 3522, 3559, 3597, 3635, 3673, 3711, 3749, 3787, 3825, 3862, 3897, 3934, 3971, 4008, 4045, 4082, 4121, 4159, 4202, 4215, 4251, 4296, 4340 |
| `permissionCode` | runtime | governance/policy/reports/business-partner-child-storage-20260912.compilation.dev.json | 81, 90, 294, 301, 338, 346, 485, 494 |
| `permissionCode` | runtime | governance/policy/reports/business-partner-combined-persisted-approval.dev.json | 446, 455, 464, 473, 482, 491, 500, 510, 520, 530, 540, 550, 560, 570, 580, 590, 600, 610, 620, 630, 640, 650, 660, 670, 680, 690, 700, 710, 719, 728, 738, 748, 758, 768, 778, 788, 798, 808, 818, 828, 838, 848, 1244, 1253, 1262, 1271, 1280, 1289, 1298, 1308, 1318, 1328, 1338, 1348, 1358, 1368, 1378, 1388, 1398, 1408, 1418, 1428, 1438, 1448, 1458, 1468, 1478, 1488, 1498, 1508, 1517, 1526, 1536, 1546, 1556, 1566, 1576, 1586, 1596, 1606, 1616, 1626, 1636, 1646, 1971, 1984, 1997, 2010, 2023, 2036, 2049, 2062, 2075, 2088, 2101, 2114, 2127, 2140, 2153, 2166, 2179, 2192, 2205, 2218, 2231, 2244, 2257, 2270, 2283, 2296, 2309, 2322, 2335, 2348, 2361, 2374, 2387, 2400, 2413, 2426, 2439, 2452, 2465, 2478, 2491, 2504, 2582, 2590, 2598, 2606, 2614, 2622, 2630, 2638, 2646, 2654, 2662, 2670, 2678, 2686, 2694, 2702, 2710, 2718, 2726, 2734, 2742, 2750, 2758, 2766, 2774, 2782, 2790, 2798, 2806, 2814, 2822, 2830, 2838, 2846, 2854, 2862, 2870, 2878, 2886, 2894, 2902, 2910 |
| `permissionCode` | runtime | governance/policy/reports/business-partner-combined-source.dev.json | 327, 331, 335, 339, 343, 347, 351, 355, 359, 363, 367, 371, 504, 540, 575, 610, 1547, 1562, 1577, 1592, 1607, 1622, 1637, 1652, 1667, 1682, 1703, 1980, 2139, 2143, 2147, 2151, 3251, 3257, 3263, 3269, 3565, 3569, 3573, 3577, 3581, 3585, 3589, 3593, 3597, 3601, 3605, 3609, 3742, 3778, 3813, 3848, 4785, 4800, 4815, 4830, 4845, 4860, 4875, 4890, 4905, 4920 |
| `permissionCode` | runtime | governance/policy/reports/business-partner-combined-successor.dev.json | 298, 302, 306, 310, 314, 318, 322, 326, 330, 334, 338, 342, 346, 350, 354, 358, 362, 366, 370, 374, 378, 382, 386, 390, 394, 398, 402, 406, 410, 414, 418, 422, 426, 430, 434, 438, 442, 446, 450, 454, 458, 462, 596, 632, 667, 703, 1615, 1624, 1633, 1642, 1651, 1660, 1669, 1679, 1689, 1699, 1709, 1719, 1729, 1739, 1749, 1759, 1769, 1779, 1789, 1799, 1809, 1819, 1829, 1839, 1849, 1859, 1869, 1879, 1888, 1897, 1907, 1917, 1927, 1937, 1947, 1957, 1967, 1977, 1987, 1997, 2007, 2017 |
| `permissionCode` | runtime | governance/policy/reports/business-partner-corrected-release.dev.json | 216, 220, 224, 228, 232, 236, 240, 244, 248, 252, 256, 260, 264, 268, 272, 276, 280, 284, 288, 292, 296, 300, 304, 308, 312, 316, 320, 324, 328, 332, 336, 340, 344, 348, 352, 356, 360, 364, 368, 372, 376, 380, 514, 550, 585, 621, 1532, 1541, 1550, 1559, 1568, 1577, 1586, 1596, 1606, 1616, 1626, 1636, 1646, 1656, 1666, 1676, 1686, 1696, 1706, 1716, 1726, 1736, 1746, 1756, 1766, 1776, 1786, 1796, 1805, 1814, 1824, 1834, 1844, 1854, 1864, 1874, 1884, 1894, 1904, 1914, 1924, 1934, 2820, 2853, 2886, 2919, 2952, 2985, 3020, 3053, 3088, 3123, 3158, 3193, 3235, 3270, 3305, 3340, 3373, 3406, 3439, 3472, 3505, 3538, 3571, 3604, 3644, 3677, 3710, 3750, 3783, 3816, 3850, 3884, 3919, 3952, 3987, 4022, 4057, 4092, 4127, 4161, 4202, 4242 |
| `permissionCode` | runtime | governance/policy/reviews/bp-consolidated-20260912/company-operations-handlers.candidate.json | 90, 100, 109, 119, 129, 139, 148, 158, 195, 202, 209, 216, 223, 230, 237, 244 |
| `permissionCode` | runtime | governance/policy/reviews/bp-consolidated-20260912/company-operations-isolated-ids.candidate.json | 90, 98, 106, 114, 122, 130, 138, 146, 181, 188, 195, 202, 209, 216, 223, 230 |
| `permissionCode` | runtime | governance/policy/reviews/bp-consolidated-20260912/company-operations.candidate.json | 90, 98, 106, 114, 122, 130, 138, 146, 181, 188, 195, 202, 209, 216, 223, 230 |
| `permissionCode` | runtime | governance/policy/reviews/bp-dependencies-20260912/child-native.candidate.json | 102, 110, 119, 126, 188, 197 |
| `permissionCode` | runtime | governance/policy/reviews/bp-dependencies-20260912/child-process.candidate.json | 102, 110, 119, 126, 188, 197 |
| `permissionCode` | runtime | governance/policy/reviews/bp-dependencies-20260912/child-provenance-review.json | 180, 189, 268, 280, 318, 326 |
| `permissionCode` | runtime | governance/policy/reviews/bp-dependencies-20260912/child-provenance.candidate.json | 177, 186, 265, 277, 315, 323 |
| `permissionCode` | runtime | governance/policy/reviews/bp-dependencies-20260912/child-storage.candidate.json | 115, 123, 132, 139, 201, 210 |
| `permissionCode` | runtime | governance/policy/reviews/bp-dependencies-20260912/child-stored-review.json | 184, 193, 272, 284, 322, 330, 485, 494, 545, 549, 560, 575 |
| `permissionCode` | runtime | governance/policy/reviews/bp-dependencies-20260912/proposal.json | 2077, 2086, 2127, 2131, 2142, 2157 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-canonical-v2-native-graph.dev.json | 165, 173, 181, 189, 197, 205, 213, 221, 229, 237, 245, 253, 261, 269, 277, 285, 293, 301, 309, 317, 325, 333, 341, 349, 357, 365, 373, 381, 389, 397, 405, 413, 421, 429, 437, 445, 453, 461, 469, 477, 485, 493, 1067, 1080, 1093, 1106, 1119, 1132, 1145, 1158, 1171, 1184, 1197, 1210, 1223, 1236, 1249, 1262, 1275, 1288, 1301, 1314, 1327, 1340, 1353, 1366, 1379, 1392, 1405, 1418, 1431, 1444, 1457, 1470, 1483, 1496, 1509, 1522, 1535, 1548, 1561, 1574, 1587, 1600, 1806, 1815, 1824, 1833, 1842, 1851, 1861, 1871, 1881, 1891, 1901, 1911, 1921, 1931, 1941, 1951, 1961, 1971, 1981, 1991, 2001, 2011, 2021, 2031, 2041, 2051, 2061, 2070, 2079, 2089, 2099, 2109, 2119, 2129, 2139, 2149, 2159, 2169, 2179, 2189, 2199, 2209 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-canonical-v2-native-graph.pre-native-hash.dev.json | 165, 173, 181, 189, 197, 205, 213, 221, 229, 237, 245, 253, 261, 269, 277, 285, 293, 301, 309, 317, 325, 333, 341, 349, 357, 365, 373, 381, 389, 397, 405, 413, 421, 429, 437, 445, 453, 461, 469, 477, 485, 493, 1067, 1080, 1093, 1106, 1119, 1132, 1145, 1158, 1171, 1184, 1197, 1210, 1223, 1236, 1249, 1262, 1275, 1288, 1301, 1314, 1327, 1340, 1353, 1366, 1379, 1392, 1405, 1418, 1431, 1444, 1457, 1470, 1483, 1496, 1509, 1522, 1535, 1548, 1561, 1574, 1587, 1600, 1806, 1815, 1824, 1833, 1842, 1851, 1861, 1871, 1881, 1891, 1901, 1911, 1921, 1931, 1941, 1951, 1961, 1971, 1981, 1991, 2001, 2011, 2021, 2031, 2041, 2051, 2061, 2070, 2079, 2089, 2099, 2109, 2119, 2129, 2139, 2149, 2159, 2169, 2179, 2189, 2199, 2209 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-canonical-v2-native.proposal.dev.json | 144, 153, 162, 171, 180, 189, 199, 209, 219, 229, 239, 249, 259, 269, 279, 289, 299, 309, 319, 329, 339, 349, 359, 369, 379, 389, 399, 408, 417, 427, 437, 447, 457, 467, 477, 487, 497, 507, 517, 527, 537, 547, 1264, 1324, 1359, 1394, 1486, 1490, 1494, 1498, 1502, 1506, 1510, 1514, 1518, 1522, 1526, 1530, 1534, 1538, 1542, 1546, 1550, 1554, 1558, 1562, 1566, 1570, 1574, 1578, 1582, 1586, 1590, 1594, 1598, 1602, 1606, 1610, 1614, 1618, 1622, 1626, 1630, 1634, 1638, 1642, 1646, 1650 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-canonical-v2-native.proposal.pre-native-hash.dev.json | 144, 153, 162, 171, 180, 189, 199, 209, 219, 229, 239, 249, 259, 269, 279, 289, 299, 309, 319, 329, 339, 349, 359, 369, 379, 389, 399, 408, 417, 427, 437, 447, 457, 467, 477, 487, 497, 507, 517, 527, 537, 547, 1264, 1324, 1359, 1394, 1486, 1490, 1494, 1498, 1502, 1506, 1510, 1514, 1518, 1522, 1526, 1530, 1534, 1538, 1542, 1546, 1550, 1554, 1558, 1562, 1566, 1570, 1574, 1578, 1582, 1586, 1590, 1594, 1598, 1602, 1606, 1610, 1614, 1618, 1622, 1626, 1630, 1634, 1638, 1642, 1646, 1650 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-combined-native-graph.dev.json | 111, 120, 129, 138, 147, 156, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285, 295, 305, 315, 325, 335, 345, 355, 365, 375, 384, 393, 403, 413, 423, 433, 443, 453, 463, 473, 483, 493, 503, 513, 1154, 1163, 1172, 1181, 1190, 1199, 1208, 1218, 1228, 1238, 1248, 1258, 1268, 1278, 1288, 1298, 1308, 1318, 1328, 1338, 1348, 1358, 1368, 1378, 1388, 1398, 1408, 1418, 1427, 1436, 1446, 1456, 1466, 1476, 1486, 1496, 1506, 1516, 1526, 1536, 1546, 1556, 1953, 1963, 1973, 1983, 1993, 2003, 2013, 2023, 2033, 2043, 2053, 2063, 2073, 2083, 2093, 2103, 2113, 2123, 2133, 2143, 2153, 2163, 2173, 2183, 2193, 2203, 2213, 2223, 2233, 2243, 2253, 2263, 2273, 2283, 2293, 2303, 2313, 2323, 2333, 2343, 2353, 2363, 2443, 2451, 2459, 2467, 2475, 2483, 2491, 2499, 2507, 2515, 2523, 2531, 2539, 2547, 2555, 2563, 2571, 2579, 2587, 2595, 2603, 2611, 2619, 2627, 2635, 2643, 2651, 2659, 2667, 2675, 2683, 2691, 2699, 2707, 2715, 2723, 2731, 2739, 2747, 2755, 2763, 2771 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-company-setup-request.profile.proposal.dev.json | 14, 23, 32, 41, 50, 59, 68, 77 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-enter-correction-runtime-workflow.dev.json | 350, 638, 926, 1214, 1502, 1792, 2081, 2372, 2664, 2956, 3248, 3547, 3839, 4131, 4732, 4992, 5281, 5570, 5859, 6148, 6437, 6726, 7015, 7311, 7600, 7889, 8185, 8472, 8758, 9047, 9338, 11003, 11293, 11584, 11876, 12168, 12460, 12752, 13875, 14175, 14472, 14768 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-enter-correction.graph.dev.json | 165, 173, 181, 189, 197, 205, 213, 221, 229, 237, 245, 253, 261, 269, 277, 285, 293, 301, 309, 317, 325, 333, 341, 349, 357, 365, 373, 381, 389, 397, 405, 413, 421, 429, 437, 445, 453, 461, 469, 477, 485, 493, 1067, 1080, 1093, 1106, 1119, 1132, 1145, 1158, 1171, 1184, 1197, 1210, 1223, 1236, 1249, 1262, 1275, 1288, 1301, 1314, 1327, 1340, 1353, 1366, 1379, 1392, 1405, 1418, 1431, 1444, 1457, 1470, 1483, 1496, 1509, 1522, 1535, 1548, 1561, 1574, 1587, 1600, 1806, 1815, 1824, 1833, 1842, 1851, 1861, 1871, 1881, 1891, 1901, 1911, 1921, 1931, 1941, 1951, 1961, 1971, 1981, 1991, 2001, 2011, 2021, 2031, 2041, 2051, 2061, 2070, 2079, 2089, 2099, 2109, 2119, 2129, 2139, 2149, 2159, 2169, 2179, 2189, 2199, 2209, 2774, 2783, 2792, 2801, 2810, 2819, 2829, 2839, 2849, 2859, 2869, 2879, 2889, 2899, 2909, 2919, 2929, 2939, 2949, 2959, 2969, 2979, 2989, 2999, 3009, 3019, 3029, 3038, 3047, 3057, 3067, 3077, 3087, 3097, 3107, 3117, 3127, 3137, 3147, 3157, 3167, 3177, 3889, 3949, 3984, 4019, 4111, 4115, 4119, 4123, 4127, 4131, 4135, 4139, 4143, 4147, 4151, 4155, 4159, 4163, 4167, 4171, 4175, 4179, 4183, 4187, 4191, 4195, 4199, 4203, 4207, 4211, 4215, 4219, 4223, 4227, 4231, 4235, 4239, 4243, 4247, 4251, 4255, 4259, 4263, 4267, 4271, 4275, 5675, 5684, 5693, 5702, 5711, 5720, 5730, 5740, 5750, 5760, 5770, 5780, 5790, 5800, 5810, 5820, 5830, 5840, 5850, 5860, 5870, 5880, 5890, 5900, 5910, 5920, 5930, 5939, 5948, 5958, 5968, 5978, 5988, 5998, 6008, 6018, 6028, 6038, 6048, 6058, 6068, 6078, 6790, 6850, 6885, 6920, 7012, 7016, 7020, 7024, 7028, 7032, 7036, 7040, 7044, 7048, 7052, 7056, 7060, 7064, 7068, 7072, 7076, 7080, 7084, 7088, 7092, 7096, 7100, 7104, 7108, 7112, 7116, 7120, 7124, 7128, 7132, 7136, 7140, 7144, 7148, 7152, 7156, 7160, 7164, 7168, 7172, 7176 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-enter-correction.pre-row-rekey.graph.dev.json | 165, 173, 181, 189, 197, 205, 213, 221, 229, 237, 245, 253, 261, 269, 277, 285, 293, 301, 309, 317, 325, 333, 341, 349, 357, 365, 373, 381, 389, 397, 405, 413, 421, 429, 437, 445, 453, 461, 469, 477, 485, 493, 1067, 1080, 1093, 1106, 1119, 1132, 1145, 1158, 1171, 1184, 1197, 1210, 1223, 1236, 1249, 1262, 1275, 1288, 1301, 1314, 1327, 1340, 1353, 1366, 1379, 1392, 1405, 1418, 1431, 1444, 1457, 1470, 1483, 1496, 1509, 1522, 1535, 1548, 1561, 1574, 1587, 1600, 1806, 1815, 1824, 1833, 1842, 1851, 1861, 1871, 1881, 1891, 1901, 1911, 1921, 1931, 1941, 1951, 1961, 1971, 1981, 1991, 2001, 2011, 2021, 2031, 2041, 2051, 2061, 2070, 2079, 2089, 2099, 2109, 2119, 2129, 2139, 2149, 2159, 2169, 2179, 2189, 2199, 2209, 2774, 2783, 2792, 2801, 2810, 2819, 2829, 2839, 2849, 2859, 2869, 2879, 2889, 2899, 2909, 2919, 2929, 2939, 2949, 2959, 2969, 2979, 2989, 2999, 3009, 3019, 3029, 3038, 3047, 3057, 3067, 3077, 3087, 3097, 3107, 3117, 3127, 3137, 3147, 3157, 3167, 3177, 3889, 3949, 3984, 4019, 4111, 4115, 4119, 4123, 4127, 4131, 4135, 4139, 4143, 4147, 4151, 4155, 4159, 4163, 4167, 4171, 4175, 4179, 4183, 4187, 4191, 4195, 4199, 4203, 4207, 4211, 4215, 4219, 4223, 4227, 4231, 4235, 4239, 4243, 4247, 4251, 4255, 4259, 4263, 4267, 4271, 4275, 5675, 5684, 5693, 5702, 5711, 5720, 5730, 5740, 5750, 5760, 5770, 5780, 5790, 5800, 5810, 5820, 5830, 5840, 5850, 5860, 5870, 5880, 5890, 5900, 5910, 5920, 5930, 5939, 5948, 5958, 5968, 5978, 5988, 5998, 6008, 6018, 6028, 6038, 6048, 6058, 6068, 6078, 6790, 6850, 6885, 6920, 7012, 7016, 7020, 7024, 7028, 7032, 7036, 7040, 7044, 7048, 7052, 7056, 7060, 7064, 7068, 7072, 7076, 7080, 7084, 7088, 7092, 7096, 7100, 7104, 7108, 7112, 7116, 7120, 7124, 7128, 7132, 7136, 7140, 7144, 7148, 7152, 7156, 7160, 7164, 7168, 7172, 7176 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-operation-reviews.dev.json | 62, 111, 162, 213, 264, 315, 367, 418, 470, 522, 574, 627, 686, 738, 791, 844, 897, 948, 999, 1050, 1101, 1152, 1203, 1254, 1305, 1363, 1414, 1465, 1523, 1572, 1621, 1672, 1724, 1777, 1830, 1883, 1935, 1985, 2037, 2088, 2140, 2192, 2244, 2296, 2349, 2402, 2456, 2509, 2564, 2626, 2684 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-policy-triage.dev.json | 88, 121, 154, 187, 220, 257, 294, 327, 360, 393, 426, 459, 492, 525, 558, 591, 624, 657, 690, 723, 760, 793, 826, 859, 892, 925, 958 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-release-19-differences.proposal.dev.json | 37, 59, 81, 103, 125, 147, 169, 191, 240, 263, 288, 311, 362, 384, 406, 428, 477, 499, 521, 543, 592, 614, 636, 658, 707, 729, 751, 773, 795, 817, 839, 861, 883, 905, 927, 949, 998, 1020, 1069, 1091, 1140, 1162, 1184, 1206, 1228, 1250, 1272, 1294, 1343, 1365, 1387, 1436, 1458, 1480, 1529, 1551, 1573, 1622, 1644, 1666, 1715, 1737, 1786, 1808, 1830, 1879, 1901, 1923, 1972, 1994, 2016, 2065, 2087, 2109, 2131, 2180, 2202, 2224, 2273, 2296, 2319, 2344, 2367, 2419, 2442, 2467, 2490, 2542, 2564, 2588, 2610, 2661, 2684, 2709, 2732, 2783, 2806, 2831, 2854, 2905, 2928, 2953, 2976, 3027, 3050, 3075, 3098, 3150, 3173, 3198, 3221, 3272, 3295, 3320, 3343, 3394, 3416, 3440, 3462, 3508, 3553, 3598, 3643, 3688, 3726, 3764, 3809, 3854, 3899, 3937, 3975, 4013, 4051, 4089, 4127, 4165, 4203, 4248, 4286, 4325, 4370, 4418, 4458, 4499, 4540, 4581, 4622, 4663, 4704, 4745, 4785, 4830, 4875, 4913, 4951, 4991 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-release-19-differences.successor-20260911.proposal.dev.json | 37, 55, 73, 91, 109, 127, 145, 163, 208, 229, 250, 271, 316, 334, 352, 370, 415, 433, 451, 469, 514, 532, 550, 568, 613, 631, 649, 667, 685, 703, 721, 739, 757, 775, 793, 811, 856, 874, 919, 937, 982, 1000, 1018, 1036, 1054, 1072, 1090, 1108, 1153, 1171, 1189, 1234, 1252, 1270, 1315, 1333, 1351, 1396, 1414, 1432, 1477, 1495, 1540, 1558, 1576, 1621, 1639, 1657, 1702, 1720, 1738, 1783, 1801, 1819, 1837, 1882, 1900, 1918, 1963, 1984, 2005, 2023, 2044, 2089, 2110, 2128, 2149, 2194, 2212, 2230, 2248, 2293, 2314, 2335, 2356, 2401, 2422, 2443, 2464, 2509, 2530, 2551, 2572, 2617, 2638, 2656, 2677, 2722, 2743, 2764, 2785, 2830, 2851, 2872, 2893, 2938, 2956, 2974, 2992, 3032, 3073, 3114, 3155, 3196, 3230, 3264, 3305, 3346, 3387, 3421, 3455, 3489, 3523, 3557, 3591, 3625, 3659, 3700, 3734, 3771, 3812, 3853, 3887, 3921, 3958, 3995, 4032, 4066, 4103, 4140, 4174, 4215, 4256, 4290, 4324, 4358 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-release-19-qualification-grant-gaps.dev.json | 13, 22, 31, 40, 49, 58, 67, 77, 86, 95, 104, 113, 122, 131, 140, 149, 158, 168, 177, 186, 196, 205, 214, 223, 232, 242, 252 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-release-19-workflow.dev.json | 264, 462, 660, 858, 1056, 1256, 1455, 1656, 1858, 2060, 2262, 2471, 2673, 2875, 3296, 3466, 3665, 3864, 4063, 4262, 4461, 4660, 4859, 5065, 5264, 5463, 5669, 5866, 6062, 6261, 6462, 7587, 7787, 7988, 8190, 8392, 8594, 8796, 9559, 9769, 9976, 10182 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-release-20-workflow.dev.json | 357, 650, 943, 1236, 1529, 1824, 2118, 2414, 2711, 3008, 3305, 3609, 3906, 4203, 4814, 5079, 5373, 5667, 5961, 6255, 6549, 6843, 7137, 7438, 7732, 8026, 8327, 8619, 8910, 9204, 9500, 11195, 11490, 11786, 12083, 12380, 12677, 12974, 14117, 14422, 14724, 15025 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-release-20-workflow.pre-head-correction.dev.json | 353, 646, 939, 1232, 1525, 1820, 2114, 2410, 2707, 3004, 3301, 3605, 3902, 4199, 4810, 5075, 5369, 5663, 5957, 6251, 6545, 6839, 7133, 7434, 7728, 8022, 8323, 8615, 8906, 9200, 9496, 11191, 11486, 11782, 12079, 12376, 12673, 12970, 14113, 14418, 14720, 15021 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-request-native-candidate-20260912.json | 102, 110, 119, 126, 188, 197 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-reset-runtime.graph.dev.json | 165, 173, 181, 189, 197, 205, 213, 221, 229, 237, 245, 253, 261, 269, 277, 285, 293, 301, 309, 317, 325, 333, 341, 349, 357, 365, 373, 381, 389, 397, 405, 413, 421, 429, 437, 445, 453, 461, 469, 477, 485, 493, 1067, 1080, 1093, 1106, 1119, 1132, 1145, 1158, 1171, 1184, 1197, 1210, 1223, 1236, 1249, 1262, 1275, 1288, 1301, 1314, 1327, 1340, 1353, 1366, 1379, 1392, 1405, 1418, 1431, 1444, 1457, 1470, 1483, 1496, 1509, 1522, 1535, 1548, 1561, 1574, 1587, 1600, 1806, 1815, 1824, 1833, 1842, 1851, 1861, 1871, 1881, 1891, 1901, 1911, 1921, 1931, 1941, 1951, 1961, 1971, 1981, 1991, 2001, 2011, 2021, 2031, 2041, 2051, 2061, 2070, 2079, 2089, 2099, 2109, 2119, 2129, 2139, 2149, 2159, 2169, 2179, 2189, 2199, 2209, 2779, 2788, 2797, 2806, 2815, 2824, 2834, 2844, 2854, 2864, 2874, 2884, 2894, 2904, 2914, 2924, 2934, 2944, 2954, 2964, 2974, 2984, 2994, 3004, 3014, 3024, 3034, 3043, 3052, 3062, 3072, 3082, 3092, 3102, 3112, 3122, 3132, 3142, 3152, 3162, 3172, 3182, 3899, 3959, 3994, 4029, 4121, 4125, 4129, 4133, 4137, 4141, 4145, 4149, 4153, 4157, 4161, 4165, 4169, 4173, 4177, 4181, 4185, 4189, 4193, 4197, 4201, 4205, 4209, 4213, 4217, 4221, 4225, 4229, 4233, 4237, 4241, 4245, 4249, 4253, 4257, 4261, 4265, 4269, 4273, 4277, 4281, 4285, 5690, 5699, 5708, 5717, 5726, 5735, 5745, 5755, 5765, 5775, 5785, 5795, 5805, 5815, 5825, 5835, 5845, 5855, 5865, 5875, 5885, 5895, 5905, 5915, 5925, 5935, 5945, 5954, 5963, 5973, 5983, 5993, 6003, 6013, 6023, 6033, 6043, 6053, 6063, 6073, 6083, 6093, 6810, 6870, 6905, 6940, 7032, 7036, 7040, 7044, 7048, 7052, 7056, 7060, 7064, 7068, 7072, 7076, 7080, 7084, 7088, 7092, 7096, 7100, 7104, 7108, 7112, 7116, 7120, 7124, 7128, 7132, 7136, 7140, 7144, 7148, 7152, 7156, 7160, 7164, 7168, 7172, 7176, 7180, 7184, 7188, 7192, 7196 |
| `permissionCode` | runtime | governance/policy/reviews/business-partner-target-read-grants.proposal.dev.json | 127, 137, 147, 157, 167, 177, 187, 197, 207, 217, 227, 237, 247, 257, 267, 277, 287, 297, 307, 317, 327, 337, 347, 357, 367, 377, 387 |
| `permissionCode` | runtime | governance/policy/reviews/internal-bank-native-review-correction.graph.dev.json | 377, 390, 403, 416, 429, 442, 455, 468, 481, 494, 507, 520, 533, 546, 559, 572, 585, 598, 611, 624, 637, 650, 663, 676, 689, 702, 715, 728, 741, 754, 767, 780, 793, 806, 819, 832, 845, 858, 871, 884, 897, 910, 923, 931, 939, 947, 955, 963, 971, 979, 987, 995, 1003, 1011, 1019, 1027, 1035, 1043, 1051, 1059, 1067, 1075, 1083, 1091, 1099, 1107, 1115, 1123, 1131, 1139, 1147, 1155, 1163, 1171, 1179, 1187, 1195, 1203, 1211, 1219, 1227, 1235, 1243, 1251, 2114, 2123, 2132, 2141, 2150, 2159, 2168, 2178, 2188, 2198, 2208, 2218, 2228, 2238, 2248, 2258, 2268, 2278, 2288, 2298, 2308, 2318, 2328, 2338, 2348, 2358, 2368, 2378, 2387, 2396, 2406, 2416, 2426, 2436, 2446, 2456, 2466, 2476, 2486, 2496, 2506, 2516, 2859, 2863, 2867, 2871, 2875, 2879, 2883, 2887, 2891, 2895, 2899, 2903, 2907, 2911, 2915, 2919, 2923, 2927, 2931, 2935, 2939, 2943, 2947, 2951, 2955, 2959, 2963, 2967, 2971, 2975, 2979, 2983, 2987, 2991, 2995, 2999, 3003, 3007, 3011, 3015, 3019, 3023, 3122, 3131, 3140, 3149, 3158, 3167, 3176, 3186, 3196, 3206, 3216, 3226, 3236, 3246, 3256, 3266, 3276, 3286, 3296, 3306, 3316, 3326, 3336, 3346, 3356, 3366, 3376, 3386, 3395, 3404, 3414, 3424, 3434, 3444, 3454, 3464, 3474, 3484, 3494, 3504, 3514, 3524, 3875, 3911, 3946, 3982, 6525, 6529, 6533, 6537, 6541, 6545, 6549, 6553, 6557, 6561, 6565, 6569, 6573, 6577, 6581, 6585, 6589, 6593, 6597, 6601, 6605, 6609, 6613, 6617, 6621, 6625, 6629, 6633, 6637, 6641, 6645, 6649, 6653, 6657, 6661, 6665, 6669, 6673, 6677, 6681, 6685, 6689, 6788, 6797, 6806, 6815, 6824, 6833, 6842, 6852, 6862, 6872, 6882, 6892, 6902, 6912, 6922, 6932, 6942, 6952, 6962, 6972, 6982, 6992, 7002, 7012, 7022, 7032, 7042, 7052, 7061, 7070, 7080, 7090, 7100, 7110, 7120, 7130, 7140, 7150, 7160, 7170, 7180, 7190, 7541, 7577, 7612, 7648 |
| `permissionCode` | runtime | governance/policy/reviews/internal-bank-native-review.graph.dev.json | 377, 390, 403, 416, 429, 442, 455, 468, 481, 494, 507, 520, 533, 546, 559, 572, 585, 598, 611, 624, 637, 650, 663, 676, 689, 702, 715, 728, 741, 754, 767, 780, 793, 806, 819, 832, 845, 858, 871, 884, 897, 910, 923, 931, 939, 947, 955, 963, 971, 979, 987, 995, 1003, 1011, 1019, 1027, 1035, 1043, 1051, 1059, 1067, 1075, 1083, 1091, 1099, 1107, 1115, 1123, 1131, 1139, 1147, 1155, 1163, 1171, 1179, 1187, 1195, 1203, 1211, 1219, 1227, 1235, 1243, 1251, 2114, 2123, 2132, 2141, 2150, 2159, 2168, 2178, 2188, 2198, 2208, 2218, 2228, 2238, 2248, 2258, 2268, 2278, 2288, 2298, 2308, 2318, 2328, 2338, 2348, 2358, 2368, 2378, 2387, 2396, 2406, 2416, 2426, 2436, 2446, 2456, 2466, 2476, 2486, 2496, 2506, 2516, 2859, 2863, 2867, 2871, 2875, 2879, 2883, 2887, 2891, 2895, 2899, 2903, 2907, 2911, 2915, 2919, 2923, 2927, 2931, 2935, 2939, 2943, 2947, 2951, 2955, 2959, 2963, 2967, 2971, 2975, 2979, 2983, 2987, 2991, 2995, 2999, 3003, 3007, 3011, 3015, 3019, 3023, 3122, 3131, 3140, 3149, 3158, 3167, 3176, 3186, 3196, 3206, 3216, 3226, 3236, 3246, 3256, 3266, 3276, 3286, 3296, 3306, 3316, 3326, 3336, 3346, 3356, 3366, 3376, 3386, 3395, 3404, 3414, 3424, 3434, 3444, 3454, 3464, 3474, 3484, 3494, 3504, 3514, 3524, 3708, 3744, 3779, 3815, 6269, 6273, 6277, 6281, 6285, 6289, 6293, 6297, 6301, 6305, 6309, 6313, 6317, 6321, 6325, 6329, 6333, 6337, 6341, 6345, 6349, 6353, 6357, 6361, 6365, 6369, 6373, 6377, 6381, 6385, 6389, 6393, 6397, 6401, 6405, 6409, 6413, 6417, 6421, 6425, 6429, 6433, 6532, 6541, 6550, 6559, 6568, 6577, 6586, 6596, 6606, 6616, 6626, 6636, 6646, 6656, 6666, 6676, 6686, 6696, 6706, 6716, 6726, 6736, 6746, 6756, 6766, 6776, 6786, 6796, 6805, 6814, 6824, 6834, 6844, 6854, 6864, 6874, 6884, 6894, 6904, 6914, 6924, 6934, 7118, 7154, 7189, 7225 |
| `permissionCode` | runtime | packages/contracts/platform/entity-list/src/experience.ts | 23, 217 |
| `permissionCode` | runtime | packages/contracts/platform/entity-list/src/standard-views.ts | 17, 58 |
| `permissionCode` | runtime | packages/contracts/platform/fixtures/entity-authorization/business-partner-case.v1.json | 14, 23, 32, 41, 50, 59, 68, 77, 86 |
| `permissionCode` | runtime | packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json | 14, 23, 32, 41, 50, 59, 68, 78, 88, 98, 108, 118, 128, 138, 148, 158, 168, 178, 188, 198, 208, 218, 228, 238, 248, 258, 268, 278, 288, 297, 306, 316, 326, 335, 344, 353, 362, 371, 381, 391, 401, 411, 421, 431, 441, 451, 461, 471, 481, 491, 501 |
| `permissionCode` | runtime | packages/contracts/platform/fixtures/entity-authorization/company-invoice.v1.json | 14, 23, 33, 43 |
| `permissionCode` | runtime | packages/contracts/platform/fixtures/entity-authorization/independent-document.v1.json | 14, 23, 32 |
| `permissionCode` | ui | packages/planes/neon/business-partner/src/360/components/network-section.tsx | 224 |
| `permissionCode` | test | packages/planes/neon/business-partner/src/entity-lookup.test.tsx | 429 |
| `permissionCode` | runtime | packages/planes/studio/business-partner/src/composition-configuration.fixture.ts | 12 |
| `permissionCode` | test | packages/planes/studio/business-partner/src/composition-configuration.test.ts | 107, 112 |
| `permissionCode` | runtime | packages/planes/studio/business-partner/src/composition-configuration.ts | 131, 132, 133 |
| `permissionCode` | runtime | packages/planes/studio/business-partner/src/composition-model.ts | 24 |
| `permissionCode` | test | packages/planes/studio/business-partner/src/workbench-editor.test.tsx | 19 |
| `permissionCode` | runtime | packages/planes/studio/business-partner/src/workbench-model.ts | 162, 163 |
| `permissionCode` | test | packages/planes/studio/business-partner/src/workbench.test.tsx | 123, 128 |
| `permissionCode` | runtime | packages/platform/ai/agent-runtime/src/index.ts | 138, 1328, 1329 |
| `permissionCode` | runtime | packages/platform/shell/work-inbox/src/index.ts | 8, 15 |
| `permissionCode` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/attachment-admission-qualification.mts | 55 |
| `permissionCode` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-qualification.mts | 418, 425, 498 |
| `permissionCode` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval-qualification.mts | 63, 89, 133 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/ai-vertical.test.ts | 83, 84, 91, 95 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/atlas-attachment-knowledge.test.ts | 75, 126, 140 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/atlas-entity-records-vertical.test.ts | 21, 25 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/atlas-semantic-index.test.ts | 9, 23 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/bp-list-insights.test.ts | 83, 88, 89 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/business-partner-authorization-shadow.test.ts | 53, 90, 109, 152, 191, 219, 243, 254, 266, 301, 320, 331, 337, 356, 361, 400, 453, 528, 532, 544, 586, 605, 628, 640, 662 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/business-partner-backend-intents.test.ts | 29, 33 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/business-partner-backend-mapping.test.ts | 29, 33, 140, 159, 182 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/business-partner-case-authority.test.ts | 28, 105, 182 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/business-partner-company-native-authority.test.ts | 36, 43 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/business-partner-import-runtime.test.ts | 23, 24, 40, 59, 67, 74, 91, 110 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-read-policy.test.ts | 10, 15, 18, 23, 37, 46, 58, 67, 72, 104, 108, 137 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-reveal-policy.test.ts | 11, 20, 31, 46, 95, 100, 108, 134 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/documents-vertical.test.ts | 110 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/finance-http-review.test.ts | 186 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/iam-api-review.test.ts | 163, 164 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/master-data-authority.test.ts | 24, 26, 28, 33, 48 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/master-data-vertical.test.ts | 42, 43, 71 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/meta-entity-authoring-authorizer.test.ts | 5, 10, 13, 17, 22, 27, 32, 34, 36 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/metadata-records-vertical.test.ts | 35, 36, 37, 38, 40, 62 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/workflow-vertical.test.ts | 22 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/atlas-attachment-knowledge.ts | 100, 112, 234, 274, 281, 312, 329, 338 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/atlas-document-grounding.ts | 84, 137, 180 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/atlas-semantic-index.ts | 57, 141, 312, 339, 359, 363 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-action-runtime.ts | 22, 45 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-authorization-shadow.ts | 126, 209, 212, 244, 251, 257, 269, 272, 279, 285, 298, 301, 308, 324, 332, 528, 531 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-backend-mapping.ts | 25, 28, 29, 56, 60, 61, 72, 76, 97, 149, 155, 174, 179, 181, 183, 210, 214, 215 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-bound-import.ts | 9, 28 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-case-authority.ts | 22, 57 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-case-runtime.ts | 17, 42 |
| `permissionCode` | test | server/apps/platform-host/src/composition/business-partner-definition-authorizer.test.ts | 4, 9, 10, 16, 22, 25, 29, 34, 35 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-definition-authorizer.ts | 6, 7, 8, 10 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-export-runtime.ts | 16 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-import-runtime.ts | 17, 46, 93 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-permission-transitions.ts | 151 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-qualification-runtime.ts | 23 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-read-runtime.ts | 34, 44, 49 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-reveal-runtime.ts | 15 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/business-partner-target-read-policy.ts | 20, 32, 66, 67 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/entity-case-backend-mapping.ts | 22, 25 |
| `permissionCode` | route | server/apps/platform-host/src/composition/finance-routes.ts | 105 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/local-graph-preview.ts | 57, 152, 269 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/meta-entity-authoring-authorizer.ts | 6, 7, 8, 12, 14, 17, 22, 23, 27 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/register-platform.ts | 167, 188, 522, 830, 897 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/register-services.ts | 2157, 2163, 3076, 3089, 3096, 3100, 3105, 3133, 3144, 3150, 3162, 3171, 3184, 3197, 3205, 3219, 3227, 3248, 3251, 3252, 3263, 3306, 3317, 3500, 3505, 3721, 3879, 3901, 4817, 6089, 6167, 6304, 6961 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/supplier-process-communications.ts | 162 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/supplier-process-documents.ts | 90, 116, 318 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/supplier-process-edit-policy.ts | 62 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/supplier-process-selection.ts | 91 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/supplier-process-tasks.ts | 86 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/task-edit-policy-authoring.ts | 18 |
| `permissionCode` | tool | server/apps/platform-host/src/scripts/qualify-document-infrastructure.ts | 204 |
| `permissionCode` | tool | server/apps/platform-host/src/scripts/qualify-document-malware.ts | 442 |
| `permissionCode` | ddl | server/db/ddl/common/authz/07_functions.sql | 1720, 1721, 1722, 1723, 1724, 1732, 1750, 1765 |
| `permissionCode` | test | server/db/scripts/__tests__/authorization/entity-operation-projection-compiler.test.ts | 14, 31 |
| `permissionCode` | test | server/db/scripts/__tests__/authorization/exact-scope-compatibility.test.ts | 15 |
| `permissionCode` | test | server/db/scripts/__tests__/authorization/inventory-promotion.test.ts | 14, 40, 51 |
| `permissionCode` | test | server/db/scripts/__tests__/authorization/mesh-authorization-inventory.test.ts | 37, 149 |
| `permissionCode` | test | server/db/scripts/__tests__/authorization/neon-authorization-inventory.test.ts | 37 |
| `permissionCode` | test | server/db/scripts/__tests__/provisioning/development-business-partner-runtime.test.ts | 25, 29 |
| `permissionCode` | test | server/db/scripts/__tests__/provisioning/development-phase1-list-runtimes.test.ts | 18, 21 |
| `permissionCode` | tool | server/db/scripts/checks/seeds/authorization-release-gates.ts | 22, 34, 48, 52, 96, 104, 106, 109, 111, 112, 113, 115, 127, 128, 129, 130, 143, 151, 152, 161, 417, 418, 426, 437, 438, 439, 454, 461, 462, 464, 475, 476, 477, 481, 482 |
| `permissionCode` | tool | server/db/scripts/operations/studio/provision-meta-entity-authority.ts | 143, 151, 156, 158 |
| `permissionCode` | tool | server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260910_operation_projection_release_identity.sql | 18, 19, 20, 21, 22, 30, 48, 63 |
| `permissionCode` | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 648, 705, 706, 712, 713 |
| `permissionCode` | tool | server/db/scripts/provisioning/business-partner-entry-policy.ts | 20 |
| `permissionCode` | tool | server/db/scripts/provisioning/config/business-partner-request-standard-views.json | 44 |
| `permissionCode` | tool | server/db/scripts/provisioning/provision-development-business-partner-runtime.ts | 57, 95, 104 |
| `permissionCode` | tool | server/db/scripts/provisioning/provision-development-phase1-list-runtimes.ts | 18, 37, 62, 85, 87, 96, 99 |
| `permissionCode` | tool | server/db/scripts/provisioning/provision-three-tenant-demo-authorization.ts | 126, 128, 129, 136, 139, 140 |
| `permissionCode` | tool | server/db/scripts/provisioning/publish-development-list-experience.ts | 125, 265, 343, 347, 349, 367, 403, 405, 520, 522, 584, 602, 612 |
| `permissionCode` | tool | server/db/scripts/provisioning/publish-development-record-presentation.ts | 121, 124, 135, 136, 144, 152 |
| `permissionCode` | tool | server/db/scripts/provisioning/three-plane-model.ts | 179 |
| `permissionCode` | tool | server/db/scripts/reports/neon-authorization-quality.ts | 585, 610 |
| `permissionCode` | tool | server/db/scripts/seed/compile-final-authorization-seed-packs.ts | 15 |
| `permissionCode` | tool | server/db/scripts/seed/compile-inventory-promotion.ts | 20, 21 |
| `permissionCode` | tool | server/db/scripts/seed/compile-mesh-authorization-inventory.ts | 216, 222 |
| `permissionCode` | tool | server/db/scripts/seed/compile-neon-authorization-inventory.ts | 194, 201 |
| `permissionCode` | tool | server/db/scripts/seed/entity-operation-projection-compiler.ts | 21, 39, 48, 66, 78, 79, 80, 81, 82, 83, 90, 98, 102, 111 |
| `permissionCode` | tool | server/db/scripts/seed/exact-scope-compatibility-model.ts | 6, 30, 31, 33, 34, 60, 66, 67, 68, 77, 79, 80 |
| `permissionCode` | tool | server/db/scripts/seed/export-entity-operation-release.ts | 38 |
| `permissionCode` | tool | server/db/scripts/seed/inventory-promotion-model.ts | 11, 29, 36, 58, 59, 61, 62, 66, 86, 87, 90, 93, 99, 100, 101, 103 |
| `permissionCode` | tool | server/db/scripts/seed/mesh-authorization-inventory-model.ts | 44, 59, 232, 233, 234, 235, 237, 269, 372 |
| `permissionCode` | tool | server/db/scripts/seed/neon-authorization-inventory-model.ts | 37, 52, 218, 219, 220, 221, 223, 257, 350 |
| `permissionCode` | tool | server/db/scripts/seed/tenant-authority-projection.ts | 67, 144, 145, 151, 252 |
| `permissionCode` | test | server/db/scripts/tests/integration/identity-replay-live.mjs | 464, 465, 471, 472 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/catalog/mesh/scope-compatibility.v1.json | 8, 21, 38, 55, 72, 89, 106, 123, 140, 153, 166, 183, 200, 217, 234, 251, 268, 285, 302, 323, 344, 365, 386, 399, 412, 425, 438, 455, 472, 489, 506, 523, 540, 557 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/catalog/neon/scope-compatibility.v1.json | 8, 21, 34, 43, 52, 61, 70, 79, 92, 105, 118, 131, 140, 161, 174, 191, 208, 225, 242, 259, 276, 293, 310, 327 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/catalog/studio/scope-compatibility.v1.json | 8, 17, 26, 35, 44, 53, 62, 71, 80, 93, 106, 119, 132, 145, 158, 171, 184, 197, 210, 223, 236, 249, 262, 275, 284, 293, 306 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/mesh/compiled/table-authorization-coverage.v1.json | 1654, 1674, 1694, 1714, 1734, 1754, 1774, 1794, 1814, 1834, 1854, 1874, 1924, 1968, 2018, 2068, 2118, 2168, 2228, 2236, 2244, 2254, 2269, 2277, 2285, 2293, 2302 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/mesh/promotion/qualification-template.v1.json | 7, 26, 43, 60, 77, 94, 111, 130, 149, 166, 185, 202, 221, 238, 257, 274, 293, 312 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/mesh/reviewed-slices.v1.json | 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34, 42, 43, 44, 45, 53, 54, 55, 56, 57 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/neon/compiled/table-authorization-coverage.v1.json | 6608, 6625, 6642, 6659, 6676, 6693, 6710, 6727, 6744, 6761, 6778, 6795, 6812, 6829, 6846, 6863, 6880, 6897, 6914, 6931, 6948, 6965, 6982, 6999, 7016, 7033, 7050, 7067, 7084, 7101, 7118, 7135, 7152, 7169, 7186, 7203, 7220, 7237, 7256, 7275, 7292, 7309, 7326, 7355, 7365, 7381, 7389, 7399, 7415, 7423, 7432, 7448, 7456, 7465, 7474, 7490, 7498, 7507, 7516, 7532, 7540, 7549, 7558 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/neon/promotion-qualification.v1.json | 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/neon/promotion/operation-bindings.v1.candidate.json | 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107, 115, 123, 131, 139, 147, 155, 163, 171, 179, 187, 195, 203, 211, 219, 227, 235, 243, 251, 259, 267, 275, 283, 291, 299, 307, 315, 323, 331, 339, 347 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/neon/promotion/qualification-template.v1.json | 7, 26, 43, 60, 79, 96, 115, 132, 149, 168, 185, 202, 221, 238, 257, 276, 293, 312, 329, 348, 365, 384, 403, 420, 439, 456, 475, 492, 511, 530, 547, 564, 581, 600, 617, 636, 653, 670, 689, 708, 725, 744, 761 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/neon/promotion/scope-compatibility.v1.candidate.json | 8, 21, 34, 43, 52, 61, 70, 79, 92, 105, 118, 131, 140, 153, 166, 179, 192, 205, 218, 231, 244, 257, 270, 283, 296, 309, 330, 343, 356, 373, 386, 399, 412, 425, 438, 451, 464, 477, 490, 503, 516, 529, 542, 559, 572, 581, 594, 607, 620, 637, 650, 663, 680, 697, 714, 731, 748, 765, 782, 799, 816, 833, 850, 867, 884 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/neon/reviewed-slices.v1.json | 54, 55, 56, 57, 58, 60, 61, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72, 73, 74, 76, 77, 78, 79, 80, 81, 82, 84, 85, 86, 87, 88, 89, 90, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 109, 110, 119, 120, 121, 129, 130, 131, 139, 140, 141, 142, 150, 151, 152, 153, 161, 162, 163, 164 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/operation-lifecycle-contract.v1.json | 18, 39 |
| `permissionCode` | runtime | server/db/seed/packs/authorization-v2/mesh/seed-pack.v1.json | 586, 599, 616, 633, 650, 667, 684, 701, 718, 731, 744, 761, 778, 795, 812, 829, 846, 863, 880, 901, 922, 943, 964, 977, 990, 1003, 1016, 1033, 1050, 1067, 1084, 1101, 1118, 1135 |
| `permissionCode` | runtime | server/db/seed/packs/authorization-v2/neon/seed-pack.v1.json | 426, 439, 452, 461, 470, 479, 488, 497, 510, 523, 536, 549, 558, 579, 592, 609, 626, 643, 660, 677, 694, 711, 728, 745 |
| `permissionCode` | runtime | server/db/seed/packs/authorization-v2/studio/seed-pack.v1.json | 474, 483, 492, 501, 510, 519, 528, 537, 546, 559, 572, 585, 598, 611, 624, 637, 650, 663, 676, 689, 702, 715, 728, 741, 750, 759, 772 |
| `permissionCode` | runtime | server/packages/contracts/ai/src/experience-configuration.ts | 29 |
| `permissionCode` | runtime | server/packages/contracts/ai/src/operations.ts | 27, 30, 38 |
| `permissionCode` | runtime | server/packages/contracts/ai/src/runtime-schemas.ts | 8 |
| `permissionCode` | runtime | server/packages/contracts/auth/src/authorization.ts | 22, 33, 40, 54, 117 |
| `permissionCode` | runtime | server/packages/contracts/finance/src/foundation.ts | 118 |
| `permissionCode` | runtime | server/packages/contracts/finance/src/ports.ts | 79 |
| `permissionCode` | runtime | server/packages/contracts/master-data/src/business-partner-360-network.ts | 25 |
| `permissionCode` | runtime | server/packages/contracts/meta-entity-authoring/src/model.ts | 21, 32 |
| `permissionCode` | test | server/packages/contracts/metadata/src/__tests__/entity-authorization.test.ts | 28, 30, 67, 69, 81, 86 |
| `permissionCode` | test | server/packages/contracts/metadata/src/__tests__/entity-canonical-read-admission.test.ts | 9, 10, 76, 115, 124 |
| `permissionCode` | runtime | server/packages/contracts/metadata/src/descriptors.ts | 260, 266, 276 |
| `permissionCode` | runtime | server/packages/contracts/metadata/src/entity-authorization.ts | 19, 69, 144, 154, 332 |
| `permissionCode` | runtime | server/packages/contracts/metadata/src/entity-canonical-read-admission.ts | 84 |
| `permissionCode` | runtime | server/packages/contracts/records/src/mutation.ts | 70 |
| `permissionCode` | runtime | server/packages/contracts/workflow/src/work-items.ts | 86 |
| `permissionCode` | runtime | server/packages/planes/mesh/src/business-partner-bank-disclosure.ts | 806, 813, 825 |
| `permissionCode` | runtime | server/packages/planes/mesh/src/business-partner-network-exchange.ts | 629, 636, 644 |
| `permissionCode` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 6 |
| `permissionCode` | runtime | server/packages/planes/mesh/src/business-partner-profile-publication.ts | 759, 762, 766 |
| `permissionCode` | runtime | server/packages/planes/neon/src/business-partner-account-bank-linkage.ts | 511, 512, 535, 895, 1159, 1162, 1169, 1178 |
| `permissionCode` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 23 |
| `permissionCode` | runtime | server/packages/planes/neon/src/business-partner-profile-match.ts | 176 |
| `permissionCode` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 23 |
| `permissionCode` | runtime | server/packages/planes/neon/src/business-partner-profile-projection.ts | 147 |
| `permissionCode` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 27 |
| `permissionCode` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/entity-authorization.test.ts | 46, 49 |
| `permissionCode` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/graph-editor-routes.test.ts | 24, 25 |
| `permissionCode` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/graph-preview.test.ts | 227 |
| `permissionCode` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/learning-route-scope.test.ts | 11 |
| `permissionCode` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/list-experience.test.ts | 55, 84 |
| `permissionCode` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/release-inspection-routes.test.ts | 31, 32, 81, 82 |
| `permissionCode` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/reviewer-read-routes.test.ts | 26, 27 |
| `permissionCode` | runtime | server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts | 1017 |
| `permissionCode` | runtime | server/packages/planes/studio/meta-entity-authoring/src/entity-authorization.ts | 70 |
| `permissionCode` | runtime | server/packages/planes/studio/meta-entity-authoring/src/graph-dependencies.ts | 42 |
| `permissionCode` | runtime | server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.ts | 949, 966 |
| `permissionCode` | runtime | server/packages/planes/studio/meta-entity-authoring/src/learning-inbox.ts | 432, 436 |
| `permissionCode` | runtime | server/packages/planes/studio/meta-entity-authoring/src/list-experience.ts | 100 |
| `permissionCode` | route | server/packages/planes/studio/meta-entity-authoring/src/routes.ts | 250, 253, 340 |
| `permissionCode` | runtime | server/packages/planes/studio/onboarding/src/maintenance.ts | 23 |
| `permissionCode` | runtime | server/packages/planes/studio/src/catalog-metadata-reader.ts | 26 |
| `permissionCode` | test | server/packages/planes/studio/src/metadata-draft-import.test.ts | 3 |
| `permissionCode` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 24 |
| `permissionCode` | test | server/packages/platform/ai/src/__tests__/entity-record-tool.test.ts | 20 |
| `permissionCode` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 6 |
| `permissionCode` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 19 |
| `permissionCode` | test | server/packages/platform/ai/src/__tests__/repository-review.test.ts | 185 |
| `permissionCode` | test | server/packages/platform/ai/src/__tests__/retrieval-f5.test.ts | 27, 33, 143, 149 |
| `permissionCode` | test | server/packages/platform/ai/src/__tests__/route-review.test.ts | 191 |
| `permissionCode` | route | server/packages/platform/ai/src/atlas-admin-routes.ts | 13 |
| `permissionCode` | runtime | server/packages/platform/ai/src/entity-record-tool.ts | 15 |
| `permissionCode` | runtime | server/packages/platform/ai/src/experience-configuration.ts | 29, 84 |
| `permissionCode` | runtime | server/packages/platform/ai/src/knowledge.ts | 96, 224, 243, 278, 284, 516 |
| `permissionCode` | runtime | server/packages/platform/audit/src/governance-service.ts | 101 |
| `permissionCode` | runtime | server/packages/platform/collaboration/src/collaboration-service.ts | 470, 472, 476 |
| `permissionCode` | test | server/packages/platform/control-admin/src/authorization-management-service.test.ts | 160, 355 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/authorization-management-service.ts | 236, 238, 246, 248 |
| `permissionCode` | test | server/packages/platform/control-admin/src/bank-validation.test.ts | 104, 105, 106 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/bank-validation.ts | 8, 9 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/connector-control.ts | 10 |
| `permissionCode` | test | server/packages/platform/control-admin/src/cycle/cycle-config-service.test.ts | 50 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/cycle/cycle-config-service.ts | 445, 447 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/entitlement-control.ts | 9, 10 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/feature-control.ts | 30, 33 |
| `permissionCode` | test | server/packages/platform/control-admin/src/lookup-control.test.ts | 133 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/lookup-control.ts | 23, 26 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/parameter-control.ts | 30, 33 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/rounding-control.ts | 36 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/runtime-command-service.ts | 827, 829 |
| `permissionCode` | test | server/packages/platform/experience/src/entity-operation-dispatcher.test.ts | 7, 38 |
| `permissionCode` | runtime | server/packages/platform/experience/src/entity-operation-dispatcher.ts | 43 |
| `permissionCode` | test | server/packages/platform/experience/src/entity-page-planner.test.ts | 18 |
| `permissionCode` | runtime | server/packages/platform/experience/src/entity-page-planner.ts | 165 |
| `permissionCode` | test | server/packages/platform/experience/src/service.test.ts | 156, 169, 177, 185, 194, 206, 218, 229, 238, 250, 266, 268, 274, 282, 290 |
| `permissionCode` | runtime | server/packages/platform/experience/src/service.ts | 732, 756, 767, 797 |
| `permissionCode` | runtime | server/packages/platform/governance/src/compliance/legal-hold-service.ts | 78 |
| `permissionCode` | runtime | server/packages/platform/governance/src/compliance/report-pack-service.ts | 366 |
| `permissionCode` | runtime | server/packages/platform/governance/src/cycles/cycle-execution-services.ts | 153 |
| `permissionCode` | route | server/packages/platform/governance/src/routes/governance-routes.ts | 81 |
| `permissionCode` | runtime | server/packages/platform/iam/src/__fixtures__/authorization-golden-corpus.v1.json | 13, 14, 19, 21, 22, 28, 31, 32, 38, 41, 42, 48, 50, 55, 57, 62, 63, 68, 70, 75, 77, 82, 88, 90, 95, 96, 101, 102 |
| `permissionCode` | test | server/packages/platform/iam/src/__tests__/authorization-golden-corpus.test.ts | 9, 32 |
| `permissionCode` | test | server/packages/platform/iam/src/__tests__/iam-service.test.ts | 51 |
| `permissionCode` | test | server/packages/platform/iam/src/__tests__/identity-replay-routes.test.ts | 75 |
| `permissionCode` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 12, 18, 23, 36, 49, 53, 58, 69, 70, 74, 76, 78, 80, 86, 87, 89, 92 |
| `permissionCode` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 80, 89 |
| `permissionCode` | test | server/packages/platform/iam/src/__tests__/shadow-authorizer.test.ts | 4 |
| `permissionCode` | test | server/packages/platform/iam/src/__tests__/source-permission-constraints.test.ts | 22, 34 |
| `permissionCode` | runtime | server/packages/platform/iam/src/identity-provisioning-service.ts | 24 |
| `permissionCode` | runtime | server/packages/platform/iam/src/identity-replay-approval.ts | 66 |
| `permissionCode` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 318, 325, 327, 333, 357, 395, 409, 417, 436, 440, 453, 472, 483, 524, 527 |
| `permissionCode` | runtime | server/packages/platform/iam/src/local-graph-bindings.ts | 16, 27, 28, 29, 41 |
| `permissionCode` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 12, 29, 38, 57, 74, 77, 80, 84, 92, 96, 128, 142, 151, 173, 178, 245, 264, 267, 273, 275, 279, 280, 281, 297 |
| `permissionCode` | runtime | server/packages/platform/iam/src/provisioning-vertical.ts | 22, 51, 55, 56 |
| `permissionCode` | runtime | server/packages/platform/iam/src/trustiam-authority.ts | 117 |
| `permissionCode` | route | server/packages/platform/jobs/src/job-admin-routes.ts | 469, 471 |
| `permissionCode` | test | server/packages/platform/metadata/src/__tests__/entity-ai.test.ts | 5 |
| `permissionCode` | test | server/packages/platform/metadata/src/__tests__/entity-authorization.test.ts | 36, 38 |
| `permissionCode` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 5 |
| `permissionCode` | test | server/packages/platform/metadata/src/__tests__/native-list-application.test.ts | 14, 23 |
| `permissionCode` | runtime | server/packages/platform/metadata/src/descriptor-parser.ts | 36, 40, 94 |
| `permissionCode` | test | server/packages/platform/metadata/src/distributed-descriptor-cache.test.ts | 16 |
| `permissionCode` | runtime | server/packages/platform/metadata/src/native-runtime-projection.ts | 144, 148, 166 |
| `permissionCode` | runtime | server/packages/platform/notifications/src/notification-operations.ts | 227, 229, 233 |
| `permissionCode` | test | server/packages/platform/policy/src/__tests__/policy-routes.test.ts | 130 |
| `permissionCode` | route | server/packages/platform/policy/src/policy-routes.ts | 39, 79 |
| `permissionCode` | test | server/packages/platform/search/src/__tests__/document-search-service.test.ts | 28, 34, 43 |
| `permissionCode` | runtime | server/packages/platform/search/src/document-search-service.ts | 17, 51 |
| `permissionCode` | test | server/packages/platform/workflow/src/__tests__/workflow-routes.test.ts | 61 |
| `permissionCode` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 30, 90 |
| `permissionCode` | runtime | server/packages/platform/workflow/src/sla-automation.ts | 9, 12, 14 |
| `permissionCode` | runtime | server/packages/platform/workflow/src/workflow-service.ts | 141, 142 |
| `permissionCode` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 147, 156, 160, 219, 261, 262 |
| `permissionCode` | route | server/packages/services/attachments/src/attachment-routes.ts | 333, 340, 348, 361, 383, 385 |
| `permissionCode` | test | server/packages/services/attachments/src/retrieval-admission.test.ts | 23, 77 |
| `permissionCode` | runtime | server/packages/services/attachments/src/retrieval-admission.ts | 17, 103 |
| `permissionCode` | runtime | server/packages/services/content/src/content-service.ts | 4 |
| `permissionCode` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 37, 79, 101, 105, 116, 117 |
| `permissionCode` | runtime | server/packages/services/documents/src/document-service.ts | 43, 141 |
| `permissionCode` | runtime | server/packages/services/finance/src/ledger/business-partner-journal-activity.ts | 31 |
| `permissionCode` | runtime | server/packages/services/finance/src/ledger/gl-posting-service.ts | 17 |
| `permissionCode` | test | server/packages/services/finance/src/shared/finance-foundation.test.ts | 83 |
| `permissionCode` | runtime | server/packages/services/finance/src/shared/permission-checker.ts | 5, 6 |
| `permissionCode` | runtime | server/packages/services/finance/src/shared/posting-guard.ts | 9 |
| `permissionCode` | test | server/packages/services/integration/src/__tests__/integration-routes.test.ts | 186 |
| `permissionCode` | route | server/packages/services/integration/src/integration-routes.ts | 52 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-360-commercial-controls.test.ts | 9 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-360-explainability.test.ts | 4 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-360-mesh-network-adapter.test.ts | 5, 7 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-360-policy.test.ts | 17, 103 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-360-production-integrations.test.ts | 8 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-360-resources.test.ts | 132 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-360-service.test.ts | 280, 281, 378, 381, 679, 680 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-case-service.test.ts | 470, 502, 505 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-eligibility-service.test.ts | 9 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-invitation-service.test.ts | 13 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-provider-projection.test.ts | 34, 72, 86 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-reveal-affordances.test.ts | 23, 35, 44, 81 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-reveal-revocation.test.ts | 40, 43, 157 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/customer-onboarding-service.test.ts | 29, 208 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/governed-internal-business-partner-service.test.ts | 61 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/master-data-repository.postgres.test.ts | 1178, 1345, 1346, 1357, 1445, 1456, 1465, 1479, 1544 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/supplier-workforce-command-guard.test.ts | 33 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/workforce-service.test.ts | 16 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-360-mesh-network-adapter.ts | 8, 11, 35 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-360-policy.ts | 67, 82, 101, 112, 136, 151, 167 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-360-service.ts | 372, 399, 704, 1057, 1118, 1286, 1399, 1522, 1547, 1999, 2192, 2203 |
| `permissionCode` | test | server/packages/services/master-data/src/business-partner-atlas-insights.test.ts | 9 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-atlas-insights.ts | 24 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-company-pilot.ts | 56, 59, 113, 119, 129 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-eligibility-service.ts | 1294, 1299, 1301, 1307 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-invitation-service.ts | 171 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-provider-projection.ts | 223, 542, 612 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-request-service.ts | 332, 429, 1822, 1827, 1832, 1840, 1845 |
| `permissionCode` | runtime | server/packages/services/master-data/src/governed-internal-business-partner-service.ts | 88, 93, 105 |
| `permissionCode` | runtime | server/packages/services/master-data/src/kysely-business-partner-case-repository.ts | 2062 |
| `permissionCode` | runtime | server/packages/services/master-data/src/kysely-workforce-request-repository.ts | 61 |
| `permissionCode` | runtime | server/packages/services/master-data/src/master-data-authority.ts | 71, 75, 79, 82, 87 |
| `permissionCode` | runtime | server/packages/services/master-data/src/supplier-workforce-command-guard.ts | 25, 39, 44, 48 |
| `permissionCode` | runtime | server/packages/services/master-data/src/supplier-workforce-requisition-service.ts | 18 |
| `permissionCode` | runtime | server/packages/services/master-data/src/verification-authority.ts | 19 |
| `permissionCode` | runtime | server/packages/services/master-data/src/worker-engagement-iam-service.ts | 45 |
| `permissionCode` | runtime | server/packages/services/master-data/src/worker-engagement-lifecycle-service.ts | 119, 166 |
| `permissionCode` | runtime | server/packages/services/master-data/src/workforce-service.ts | 43 |
| `permissionCode` | test | server/packages/services/publication/src/__tests__/business-partner-company-case-contract.test.ts | 30, 103, 112, 136 |
| `permissionCode` | test | server/packages/services/publication/src/__tests__/compiled-entity-collection-compiler.test.ts | 46 |
| `permissionCode` | test | server/packages/services/publication/src/__tests__/entity-authorization-compiler.test.ts | 67, 76, 144, 193, 418, 608 |
| `permissionCode` | route | server/packages/services/publication/src/business-partner-case-contract-routes.ts | 273, 279 |
| `permissionCode` | runtime | server/packages/services/publication/src/business-partner-company-case-contract.ts | 16, 119, 131, 187 |
| `permissionCode` | route | server/packages/services/publication/src/business-partner-definition-routes.ts | 293, 299 |
| `permissionCode` | runtime | server/packages/services/publication/src/compiled-entity-collection-compiler.ts | 65, 94, 96, 118, 127 |
| `permissionCode` | runtime | server/packages/services/publication/src/entity-authorization-compiler.ts | 106, 181, 230 |
| `permissionCode` | route | server/packages/services/publication/src/publication-routes.ts | 136, 138 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 10 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/canonical-read-backend.test.ts | 25, 34, 99, 124, 161, 166, 175, 195 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/canonical-read-diagnostics.test.ts | 25, 34, 99, 124, 175, 219, 238, 252 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/document-collection-read.test.ts | 26 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/entity-authorization.test.ts | 51, 96, 97 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/entity-backend-authorizer.test.ts | 55, 71, 104, 239, 286, 327, 384, 486, 537, 542, 559, 564, 574, 579, 622 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/entity-backend-isolated-execution.test.ts | 55, 71, 104 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 18, 38, 39, 46, 47, 113, 119, 141, 146, 150, 190, 195, 199, 234, 236 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/list-context-discovery.test.ts | 9, 26, 33, 58 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/list-experience.test.ts | 31, 59, 73, 124 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/navigation-context-discovery.test.ts | 37, 68 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/record-read-access.test.ts | 13, 22, 35, 44, 53 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 32, 33, 34, 35, 37, 40, 47, 140, 141 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/snapshot-service.test.ts | 12, 15, 29 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/standard-views.test.ts | 38 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 9, 38, 49 |
| `permissionCode` | runtime | server/packages/services/records/src/actions/action-service.ts | 12 |
| `permissionCode` | runtime | server/packages/services/records/src/entity-authorization.ts | 118, 195, 206 |
| `permissionCode` | runtime | server/packages/services/records/src/entity-backend-authorizer.ts | 133, 198, 266, 267, 268, 279, 280, 312, 321 |
| `permissionCode` | runtime | server/packages/services/records/src/entity-list-service.ts | 355, 466, 742, 743, 747, 1086, 1093, 1174, 1175 |
| `permissionCode` | runtime | server/packages/services/records/src/field-validation.ts | 34, 35 |
| `permissionCode` | runtime | server/packages/services/records/src/lifecycle-service.ts | 17, 20 |
| `permissionCode` | runtime | server/packages/services/records/src/list-context-discovery.ts | 34, 36, 47, 80, 107 |
| `permissionCode` | runtime | server/packages/services/records/src/list-experience.ts | 31, 32, 43, 100, 112, 126, 134 |
| `permissionCode` | runtime | server/packages/services/records/src/mutation-service.ts | 34, 35, 57, 61, 76, 77, 97, 98, 115, 118, 120 |
| `permissionCode` | runtime | server/packages/services/records/src/navigation-context-discovery.ts | 16, 34, 44, 56 |
| `permissionCode` | runtime | server/packages/services/records/src/query-service.ts | 141, 260, 395, 591, 594, 602 |
| `permissionCode` | runtime | server/packages/services/records/src/record-read-access.ts | 14, 15, 21, 37, 41, 61, 62, 65 |
| `permissionCode` | route | server/packages/services/records/src/snapshots/snapshot-routes.ts | 10, 18, 19 |
| `permissionCode` | runtime | server/packages/services/records/src/snapshots/snapshot-service.ts | 16 |
| `permissionCode` | runtime | server/packages/services/records/src/standard-views.ts | 57 |
| `permissionCode` | test | server/packages/services/records/src/transfer/export-preflight.test.ts | 9 |
| `permissionCode` | runtime | server/packages/services/records/src/transfer/transfer-jobs.ts | 1227, 1229, 1233, 1263, 1268 |
| `permissionCode` | runtime | server/packages/services/records/src/transfer/transfer-service.ts | 1943, 1945, 1949, 1989, 1994 |
| `permissionCode` | test | tests/contracts/business-partner-independent-child.test.ts | 28 |
| `permissionCode` | test | tests/contracts/business-partner-r7-contracts.test.ts | 147 |
| `permissionCode` | test | tests/contracts/three-plane-list-scope.test.ts | 30 |
| `permissionCode` | runtime | tests/e2e/acceptance/governed-import-smoke.mjs | 299 |
| `permissionCode` | runtime | tests/e2e/acceptance/public-record-transfer-smoke.mjs | 304 |
| `permissionCode` | tool | tooling/scripts/local-dev/graph-preview.integration.test.mts | 48, 70, 71, 83, 175, 178, 254, 262, 276, 321 |
| `permissionCode` | tool | tooling/scripts/policy/authorization-inventory.ts | 1112, 1135 |
| `permissionCode` | tool | tooling/scripts/verification/atlas-baseline-adoption.test.mjs | 32 |
| `permissionCode` | tool | tooling/scripts/verification/attest-business-partner-shadow.mjs | 49 |
| `permissionCode` | tool | tooling/scripts/verification/capture-business-partner-causal-evidence.mjs | 24 |
| `permissionCode` | tool | tooling/scripts/verification/capture-business-partner-release-19-execution-readiness.mts | 21 |
| `permissionCode` | tool | tooling/scripts/verification/capture-business-partner-reset-catalog-dependencies.mjs | 12, 14 |
| `permissionCode` | tool | tooling/scripts/verification/entity-authorization/accepted-operation-selection.mjs | 41, 42, 53, 76 |
| `permissionCode` | tool | tooling/scripts/verification/entity-authorization/accepted-operation-selection.test.mjs | 20, 24, 29 |
| `permissionCode` | tool | tooling/scripts/verification/entity-authorization/case-runtime-correction.mjs | 24 |
| `permissionCode` | tool | tooling/scripts/verification/entity-authorization/combined-successor.test.mjs | 5, 9 |
| `permissionCode` | tool | tooling/scripts/verification/entity-authorization/governed-import-selection.mjs | 21 |
| `permissionCode` | tool | tooling/scripts/verification/entity-authorization/policy-differences.mjs | 18, 22 |
| `permissionCode` | tool | tooling/scripts/verification/entity-authorization/policy-differences.test.mjs | 5 |
| `permissionCode` | tool | tooling/scripts/verification/entity-authorization/publication-plan.mts | 63, 349, 359, 383, 387, 425, 455 |
| `permissionCode` | tool | tooling/scripts/verification/entity-authorization/publication-plan.test.mts | 24, 112, 279, 287, 295, 320 |
| `permissionCode` | tool | tooling/scripts/verification/isolated-enter/harness/ai-retrieval.mjs | 47 |
| `permissionCode` | tool | tooling/scripts/verification/isolated-enter/harness/case-bindings.mjs | 18, 20, 28, 61 |
| `permissionCode` | tool | tooling/scripts/verification/isolated-enter/harness/import-policy.mjs | 8 |
| `permissionCode` | tool | tooling/scripts/verification/isolated-enter/prepare-access.mjs | 27 |
| `permissionCode` | tool | tooling/scripts/verification/isolated-enter/test-document-publication-handoff.mjs | 70 |
| `permissionCode` | tool | tooling/scripts/verification/isolated-execution/ai-retrieval.mjs | 14 |
| `permissionCode` | tool | tooling/scripts/verification/isolated-execution/build-image.mjs | 22, 24 |
| `permissionCode` | tool | tooling/scripts/verification/isolated-execution/case-bindings.mjs | 6, 7, 9, 18 |
| `permissionCode` | tool | tooling/scripts/verification/isolated-execution/case-bindings.test.mjs | 2, 3, 4, 5 |
| `permissionCode` | tool | tooling/scripts/verification/isolated-execution/host.mjs | 56 |
| `permissionCode` | tool | tooling/scripts/verification/isolated-execution/import-policy.mjs | 5 |
| `permissionCode` | tool | tooling/scripts/verification/isolated-execution/import-policy.test.mjs | 2, 3 |
| `permissionCode` | tool | tooling/scripts/verification/master-data-prerequisites.mjs | 63 |
| `permissionCode` | tool | tooling/scripts/verification/plan-entity-authorization-migration.mjs | 71, 76 |
| `permissionCode` | tool | tooling/scripts/verification/plan-entity-authorization-migration.test.mjs | 25, 46, 47, 68 |
| `permissionCode` | tool | tooling/scripts/verification/prepare-atlas-baseline-native-graph.mts | 10, 14 |
| `permissionCode` | tool | tooling/scripts/verification/prepare-atlas-mesh-native-graph.mts | 14, 18 |
| `permissionCode` | tool | tooling/scripts/verification/prepare-business-partner-combined-successor.mts | 18, 19 |
| `permissionCode` | tool | tooling/scripts/verification/prepare-business-partner-enter-correction-runtime-review.mjs | 108, 125 |
| `permissionCode` | tool | tooling/scripts/verification/prepare-business-partner-exact-release-review.mjs | 28, 32 |
| `permissionCode` | tool | tooling/scripts/verification/prepare-business-partner-operation-reviews.mjs | 8, 11, 26 |
| `permissionCode` | tool | tooling/scripts/verification/prepare-business-partner-operation-workflow.mjs | 8 |
| `permissionCode` | tool | tooling/scripts/verification/prepare-business-partner-release-19-difference-review.mjs | 32 |
| `permissionCode` | tool | tooling/scripts/verification/prepare-business-partner-release-19-test-grants.mjs | 15 |
| `permissionCode` | tool | tooling/scripts/verification/prepare-business-partner-target-read-proposal.mjs | 50, 53, 69, 85 |
| `permissionCode` | tool | tooling/scripts/verification/prepare-business-partner-v2-exact-release-review.mjs | 105, 122 |
| `permissionCode` | tool | tooling/scripts/verification/prepare-entity-authorization-publication.mts | 55 |
| `permissionCode` | tool | tooling/scripts/verification/qualify-atlas-operation-projection-identity.sql | 18, 19, 20, 21, 22, 30, 48, 63 |
| `permissionCode` | tool | tooling/scripts/verification/qualify-entity-authorization.mts | 58, 94, 170, 172, 175, 188 |
| `permissionCode` | tool | tooling/scripts/verification/setup-local-master-data-authority.mjs | 18, 20, 22 |
| `permissionCodes` | test | server/apps/platform-host/src/composition/__tests__/finance-http-review.test.ts | 515 |
| `permissionCodes` | route | server/apps/platform-host/src/composition/finance-routes.ts | 295 |
| `permissionCodes` | runtime | server/apps/platform-host/src/composition/register-services.ts | 1395 |
| `permissionCodes` | test | server/db/scripts/__tests__/authorization/entity-operation-projection-compiler.test.ts | 89, 190 |
| `permissionCodes` | test | server/db/scripts/__tests__/authorization/exact-scope-compatibility.test.ts | 12, 28, 41, 62, 71, 97 |
| `permissionCodes` | tool | server/db/scripts/provisioning/provision-development-northwind-mesh-fixture.ts | 258, 267, 268 |
| `permissionCodes` | tool | server/db/scripts/seed/build-exact-scope-compatibility.ts | 20 |
| `permissionCodes` | tool | server/db/scripts/seed/exact-scope-compatibility-model.ts | 24, 28, 29 |
| `permissionCodes` | tool | server/db/scripts/seed/inventory-promotion-model.ts | 94 |
| `permissionCodes` | tool | server/db/scripts/seed/mesh-authorization-inventory-model.ts | 227, 232, 233 |
| `permissionCodes` | tool | server/db/scripts/seed/neon-authorization-inventory-model.ts | 213, 218, 219 |
| `permissionCodes` | runtime | server/packages/contracts/finance/src/commands.ts | 7 |
| `permissionCodes` | route | server/packages/planes/neon/src/finance-http.ts | 426, 445 |
| `permissionCodes` | test | server/packages/planes/neon/src/finance-jobs.test.ts | 6 |
| `permissionCodes` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 13, 87 |
| `permissionCodes` | runtime | server/packages/services/finance/src/shared/permission-checker.ts | 6 |
| `permissionCodes` | test | server/packages/services/master-data/src/__tests__/business-partner-case-view.test.ts | 62, 87, 96, 101, 113, 143, 147, 173, 186, 192, 217, 226 |
| `permissionCodes` | runtime | server/packages/services/master-data/src/business-partner-case-view.ts | 18, 201 |
| `permissionCodes` | route | server/packages/services/master-data/src/business-partner-request-routes.ts | 361 |
| `permissionCodes` | test | tests/contracts/business-partner-phase0-contracts.test.ts | 109 |
| `permissionCodes` | tool | tooling/scripts/policy/authorization-inventory.ts | 183, 1198, 1202, 1236, 2542 |
| `permissions` | ui | apps/neon/app/(shell)/mdg/operation-review/review.tsx | 10 |
| `permissions` | ui | apps/neon/lib/experience-runtime.tsx | 217, 227 |
| `permissions` | runtime | governance/config/governance/business-partner-authorization-bindings.v1.json | 235 |
| `permissions` | runtime | governance/config/governance/server-legacy-route-baseline.json | 404, 407, 428, 431, 1996, 1999, 2900, 2903, 3124, 3127, 7052, 7055, 7076, 7079 |
| `permissions` | runtime | governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-definition-publication-review.json | 1679, 1686 |
| `permissions` | runtime | governance/evidence/business-partner/v1-r2-r3-build-fix-2026-09-05.json | 95 |
| `permissions` | runtime | governance/policy/reports/business-partner-accepted-operations.dev.json | 512, 548, 583, 619, 3011, 3331 |
| `permissions` | runtime | governance/policy/reports/business-partner-activation-publication.dev.json | 586, 622, 657, 692, 2523, 3012 |
| `permissions` | runtime | governance/policy/reports/business-partner-case-correction-decisions.dev.json | 28, 34, 40, 46, 52, 83, 89, 95, 101, 107 |
| `permissions` | runtime | governance/policy/reports/business-partner-combined-source.dev.json | 501, 537, 572, 607, 3739, 3775, 3810, 3845 |
| `permissions` | runtime | governance/policy/reports/business-partner-combined-successor.dev.json | 593, 629, 664, 700 |
| `permissions` | runtime | governance/policy/reports/business-partner-corrected-release.dev.json | 511, 547, 582, 618, 3010, 3330 |
| `permissions` | runtime | governance/policy/reviews/bp-dependencies-20260912/studio-access.proposal.json | 29, 160, 216, 222 |
| `permissions` | runtime | governance/policy/reviews/business-partner-affordance-count-execution-20260912-r2.proposal.dev.json | 63, 354, 394, 685, 725, 773, 840, 878, 913 |
| `permissions` | runtime | governance/policy/reviews/business-partner-affordance-count-execution-20260912-r2.user-approval.dev.json | 13 |
| `permissions` | runtime | governance/policy/reviews/business-partner-affordance-count-execution-20260912.proposal.dev.json | 63, 354, 394, 685, 725, 773, 840, 878, 913 |
| `permissions` | runtime | governance/policy/reviews/business-partner-canonical-v2-native.proposal.dev.json | 1262, 1322, 1357, 1392 |
| `permissions` | runtime | governance/policy/reviews/business-partner-canonical-v2-native.proposal.pre-native-hash.dev.json | 1262, 1322, 1357, 1392 |
| `permissions` | runtime | governance/policy/reviews/business-partner-company-execution-bound-20260912.before-parent-correction.proposal.dev.json | 33, 94 |
| `permissions` | runtime | governance/policy/reviews/business-partner-company-execution-bound-20260912.proposal.dev.json | 34, 96 |
| `permissions` | runtime | governance/policy/reviews/business-partner-company-image-correction-20260912.proposal.dev.json | 24 |
| `permissions` | runtime | governance/policy/reviews/business-partner-company-image-correction-v2-20260912.proposal.dev.json | 24 |
| `permissions` | runtime | governance/policy/reviews/business-partner-company-pilot-execution-access-20260912.proposal.dev.json | 28, 40 |
| `permissions` | runtime | governance/policy/reviews/business-partner-consolidated-studio-access-20260912.proposal.dev.json | 29, 160, 213 |
| `permissions` | runtime | governance/policy/reviews/business-partner-dev-operational-access-20260912.proposal.dev.json | 34, 57, 82, 93, 108, 124, 140, 149, 164, 180, 188, 204, 216 |
| `permissions` | runtime | governance/policy/reviews/business-partner-enter-atlas-access-20260912.proposal.dev.json | 32, 64 |
| `permissions` | runtime | governance/policy/reviews/business-partner-enter-correction-runtime-workflow.dev.json | 1581 |
| `permissions` | runtime | governance/policy/reviews/business-partner-enter-correction.graph.dev.json | 3887, 3947, 3982, 4017, 6788, 6848, 6883, 6918 |
| `permissions` | runtime | governance/policy/reviews/business-partner-enter-correction.pre-row-rekey.graph.dev.json | 3887, 3947, 3982, 4017, 6788, 6848, 6883, 6918 |
| `permissions` | runtime | governance/policy/reviews/business-partner-enter-test-access-20260912.proposal.dev.json | 32, 323, 614, 665, 780, 828 |
| `permissions` | runtime | governance/policy/reviews/business-partner-enter-test-access.exact-case-rejected.proposal.dev.json | 32, 323, 614, 665, 780, 828 |
| `permissions` | runtime | governance/policy/reviews/business-partner-enter-test-access.proposal.dev.json | 32, 323, 614, 665, 780, 828 |
| `permissions` | runtime | governance/policy/reviews/business-partner-final-66-dispositions-20260912.proposal.dev.json | 2219, 2267, 2391, 2621, 2731, 3053, 3113, 3181, 3257, 3333, 3385, 3437, 3489, 3549, 3625, 3801, 4041, 4333 |
| `permissions` | runtime | governance/policy/reviews/business-partner-final-binding-66-dispositions-20260912.proposal.dev.json | 5973, 6028, 6158, 7375, 7810, 10140, 10315, 10570, 10905, 11240, 11335, 11430, 11525, 11700, 11806, 12051, 13342, 13602 |
| `permissions` | runtime | governance/policy/reviews/business-partner-final-closure-execution-20260912.proposal.dev.json | 63, 354, 394, 685, 725, 773, 840, 878 |
| `permissions` | runtime | governance/policy/reviews/business-partner-finance-reveal-execution-20260912.proposal.dev.json | 61, 352, 434, 469, 760, 842, 877, 928, 965, 1002, 1034, 1101, 1136 |
| `permissions` | runtime | governance/policy/reviews/business-partner-manual-ui-walkthrough-20260912.proposal.dev.json | 29, 320, 360, 651, 688, 723, 761 |
| `permissions` | runtime | governance/policy/reviews/business-partner-manual-ui-walkthrough-20260912.user-approval.dev.json | 9 |
| `permissions` | runtime | governance/policy/reviews/business-partner-named-role-recommendations.dev.json | 11966, 12053, 12140 |
| `permissions` | runtime | governance/policy/reviews/business-partner-neon-final-execution-20260912.proposal.dev.json | 84, 375, 457, 492, 783, 865, 900, 951, 988, 1025 |
| `permissions` | runtime | governance/policy/reviews/business-partner-operation-reviews.dev.json | 335, 864 |
| `permissions` | runtime | governance/policy/reviews/business-partner-operation-workflow.dev.json | 383, 997 |
| `permissions` | runtime | governance/policy/reviews/business-partner-release-19-differences.proposal.dev.json | 3526, 3571, 3661, 3782, 3827, 3917, 3955, 3993, 4031, 4069, 4107, 4145, 4183, 4221, 4266, 4391, 4479, 4643 |
| `permissions` | runtime | governance/policy/reviews/business-partner-release-19-differences.successor-20260911.proposal.dev.json | 3046, 3087, 3169, 3278, 3319, 3401, 3435, 3469, 3503, 3537, 3571, 3605, 3639, 3673, 3714, 3826, 3901, 4046 |
| `permissions` | runtime | governance/policy/reviews/business-partner-release-19-qualification-grant-gaps.dev.json | 9, 10 |
| `permissions` | runtime | governance/policy/reviews/business-partner-release-19-test-grants.proposal.dev.json | 22, 140, 183, 222 |
| `permissions` | runtime | governance/policy/reviews/business-partner-release-19-workflow.dev.json | 1135 |
| `permissions` | runtime | governance/policy/reviews/business-partner-release-20-workflow.dev.json | 1608 |
| `permissions` | runtime | governance/policy/reviews/business-partner-release-20-workflow.pre-head-correction.dev.json | 1604 |
| `permissions` | runtime | governance/policy/reviews/business-partner-release20-isolated-transfer-grants.proposal.dev.json | 24 |
| `permissions` | runtime | governance/policy/reviews/business-partner-reset-runtime.graph.dev.json | 3897, 3957, 3992, 4027, 6808, 6868, 6903, 6938 |
| `permissions` | runtime | governance/policy/reviews/business-partner-reset-studio-authoring-grants.proposal.dev.json | 17, 28 |
| `permissions` | runtime | governance/policy/reviews/business-partner-reveal-coordinates-execution-20260912.proposal.dev.json | 63, 354, 394, 685, 725, 773, 840, 878 |
| `permissions` | runtime | governance/policy/reviews/business-partner-successor-execution-image.amendment.7533ccd4.withdrawn.dev.json | 11 |
| `permissions` | runtime | governance/policy/reviews/business-partner-successor-execution-image.amendment.b893dafc.dev.json | 11 |
| `permissions` | runtime | governance/policy/reviews/business-partner-successor-execution-image.amendment.dev.json | 11 |
| `permissions` | runtime | governance/policy/reviews/business-partner-successor-import-policy-image.amendment.dev.json | 11 |
| `permissions` | runtime | governance/policy/reviews/business-partner-successor-isolated-transfer-grants.proposal.dev.json | 24 |
| `permissions` | runtime | governance/policy/reviews/business-partner-summary-context-execution-20260912.proposal.dev.json | 63, 354, 394, 685, 725, 773, 840, 878 |
| `permissions` | runtime | governance/policy/reviews/business-partner-summary-context-execution-20260912.user-approval.dev.json | 13 |
| `permissions` | runtime | governance/policy/reviews/business-partner-target-read-grants.proposal.dev.json | 14 |
| `permissions` | runtime | governance/policy/reviews/business-partner-two-reviewer-recommendations.dev.json | 12035, 12122, 12209 |
| `permissions` | runtime | governance/policy/reviews/business-partner-two-reviewer-recorded.dev.json | 13622, 13732, 13842 |
| `permissions` | runtime | governance/policy/reviews/business-partner-v2-studio-authoring-grants.proposal.dev.json | 18, 29, 44 |
| `permissions` | runtime | governance/policy/reviews/internal-bank-native-review-correction.graph.dev.json | 3872, 3908, 3943, 3979, 7538, 7574, 7609, 7645 |
| `permissions` | runtime | governance/policy/reviews/internal-bank-native-review.graph.dev.json | 3705, 3741, 3776, 3812, 7115, 7151, 7186, 7222 |
| `permissions` | test | packages/contracts/platform/ai/src/__tests__/business-context.test.ts | 35 |
| `permissions` | test | packages/contracts/platform/ai/src/__tests__/protocol.test.ts | 21, 72 |
| `permissions` | runtime | packages/contracts/platform/ai/src/intent.ts | 16 |
| `permissions` | runtime | packages/contracts/platform/entity-list/src/experience.ts | 21, 213, 220, 221, 222, 303 |
| `permissions` | ui | packages/planes/neon/business-partner/src/360/components/commercial-controls.tsx | 383 |
| `permissions` | ui | packages/planes/neon/business-partner/src/bank-verification-controls.tsx | 17, 19 |
| `permissions` | ui | packages/planes/neon/business-partner/src/banking-workspace.tsx | 14, 48 |
| `permissions` | ui | packages/planes/neon/business-partner/src/index.tsx | 453, 466, 2210, 2211 |
| `permissions` | ui | packages/planes/neon/business-partner/src/request-entry.tsx | 48, 57, 100, 138, 206 |
| `permissions` | ui | packages/planes/neon/business-partner/src/role-extension-experience.tsx | 95, 96 |
| `permissions` | ui | packages/planes/studio/business-partner/src/composition-configuration-controls.tsx | 54, 187 |
| `permissions` | test | packages/planes/studio/business-partner/src/composition-configuration.test.ts | 124 |
| `permissions` | runtime | packages/planes/studio/business-partner/src/composition-configuration.ts | 118, 130, 150, 151, 173 |
| `permissions` | runtime | packages/planes/studio/business-partner/src/composition-model.ts | 22 |
| `permissions` | ui | packages/planes/studio/business-partner/src/workbench-editor.tsx | 214 |
| `permissions` | runtime | packages/planes/studio/business-partner/src/workbench-model.ts | 150, 156 |
| `permissions` | ui | packages/planes/studio/business-partner/src/workbench-publication.tsx | 358 |
| `permissions` | ui | packages/planes/studio/business-partner/src/workbench.tsx | 545, 644 |
| `permissions` | runtime | packages/platform/ai/agent-runtime/src/index.ts | 120, 1278, 1279, 1281, 1287 |
| `permissions` | runtime | packages/platform/foundation/api-client/src/bootstrap.ts | 27, 50, 52 |
| `permissions` | runtime | packages/platform/iam/governance-review/src/named-role-recommendations.mjs | 103 |
| `permissions` | runtime | packages/platform/iam/identity-gate/src/workspace-showcase-data.ts | 664, 670, 672 |
| `permissions` | ui | packages/platform/shell/app-foundation/src/index.tsx | 99, 100, 107, 174 |
| `permissions` | runtime | packages/platform/shell/shell-runtime/src/core.ts | 8, 19, 32, 37, 38, 52, 53 |
| `permissions` | ui | packages/platform/shell/shell/src/atlas-context-inspector.tsx | 75, 176 |
| `permissions` | runtime | packages/platform/shell/shell/src/core.ts | 41, 133 |
| `permissions` | runtime | packages/platform/shell/shell/src/home-personalization.ts | 65 |
| `permissions` | ui | packages/platform/shell/shell/src/home.tsx | 446, 1471, 1772 |
| `permissions` | runtime | packages/platform/shell/shell/src/messages.ts | 12 |
| `permissions` | tool | server/apps/platform-host/scripts/db-verification/business-partner-360/verify-business-partner-360-reads.ts | 49, 166 |
| `permissions` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/intent-feedback.mts | 142, 298, 299, 313 |
| `permissions` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-inbox.mts | 157 |
| `permissions` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-qualification.mts | 62 |
| `permissions` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval-qualification.mts | 16, 145, 147 |
| `permissions` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval.mts | 127 |
| `permissions` | test | server/apps/platform-host/scripts/db-verification/tests/integration/governed-internal-business-partner-http.mjs | 135 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/ai-vertical.test.ts | 71, 81 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/atlas-attachment-knowledge.test.ts | 150 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/atlas-entity-records-vertical.test.ts | 16, 25, 51 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/authorization-management-api.test.ts | 35 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/bp-list-insights.test.ts | 33 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/business-partner-authorization-shadow.test.ts | 36, 87, 539, 540, 581 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/business-partner-backend-intents.test.ts | 56 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/business-partner-case-authority.test.ts | 100, 180 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/business-partner-company-native-authority.test.ts | 23 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/business-partner-import-runtime.test.ts | 63, 116 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-read-policy.test.ts | 33, 123, 133, 134 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-reveal-policy.test.ts | 96, 117, 135, 141 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/documents-vertical.test.ts | 46 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/finance-http-review.test.ts | 55, 109, 110, 304, 447, 579, 581 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/iam-api-review.test.ts | 42, 161, 162, 163 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/iam-audit-vertical.test.ts | 25, 54, 95 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/master-data-authority.test.ts | 22, 42, 44, 48, 51 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/master-data-vertical.test.ts | 39, 41, 42, 47, 52, 71 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/mesh-exchange-readiness.test.ts | 12 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/meta-entity-authoring-authorizer.test.ts | 5, 15, 17, 33 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/metadata-records-vertical.test.ts | 45, 48, 89, 93, 96 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/policy-vertical.test.ts | 19 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/verification-routes.test.ts | 13 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/workflow-vertical.test.ts | 20, 21 |
| `permissions` | runtime | server/apps/platform-host/src/composition/business-partner-authorization-shadow.ts | 229, 231, 235, 236, 237, 238, 239, 461, 462, 465 |
| `permissions` | runtime | server/apps/platform-host/src/composition/business-partner-case-authority.ts | 52 |
| `permissions` | test | server/apps/platform-host/src/composition/business-partner-definition-authorizer.test.ts | 8, 34, 35 |
| `permissions` | route | server/apps/platform-host/src/composition/finance-routes.ts | 41, 295 |
| `permissions` | runtime | server/apps/platform-host/src/composition/local-graph-preview.ts | 103, 121, 244 |
| `permissions` | runtime | server/apps/platform-host/src/composition/register-services.ts | 1292, 1321, 1329, 1341, 1395, 2341, 5859, 5862, 5863, 6025, 6028, 6031, 6034, 7506 |
| `permissions` | runtime | server/apps/platform-host/src/composition/supplier-process-communications.ts | 72, 77, 78 |
| `permissions` | runtime | server/apps/platform-host/src/composition/supplier-process-document-runtime.ts | 99, 129, 132 |
| `permissions` | tool | server/apps/platform-host/src/scripts/qualify-document-infrastructure.ts | 150 |
| `permissions` | tool | server/apps/platform-host/src/scripts/qualify-document-malware.ts | 242 |
| `permissions` | runtime | server/architecture/legacy-inventory-baseline.json | 1206, 4401, 4403, 4405, 4527, 4529, 4530, 5433, 5435, 5457, 5459, 7011, 7013, 7931, 7933, 8155, 8157, 11853, 11855, 11877, 11879 |
| `permissions` | ddl | server/db/ddl/common/authz/00_schema.sql | 4 |
| `permissions` | ddl | server/db/ddl/common/authz/07_functions.sql | 578 |
| `permissions` | ddl | server/db/ddl/common/master/03_platform_tables.sql | 53, 191 |
| `permissions` | runtime | server/db/ddl/governed-entity-lifecycle-minimal-schema-review.v1.json | 133 |
| `permissions` | ddl | server/db/ddl/planes/mesh/control/12_reference_seed.sql | 172 |
| `permissions` | ddl | server/db/ddl/planes/neon/authz/14_permission_reference_seed.sql | 97, 277, 299, 329, 351, 384, 401, 408, 460, 508, 522 |
| `permissions` | ddl | server/db/ddl/planes/neon/master/03_tables.sql | 1972 |
| `permissions` | ddl | server/db/ddl/planes/studio/authz/14_permission_reference_seed.sql | 142 |
| `permissions` | runtime | server/db/migrations/inventory.json | 562, 729 |
| `permissions` | test | server/db/scripts/__tests__/authorization/authorization-clean-slate.test.ts | 21, 23, 41, 46, 152, 166 |
| `permissions` | test | server/db/scripts/__tests__/authorization/cirrusatlantic-demo-authorization.test.ts | 37, 49, 54, 63 |
| `permissions` | test | server/db/scripts/__tests__/authorization/entity-operation-projection-compiler.test.ts | 76, 103, 131, 174 |
| `permissions` | test | server/db/scripts/__tests__/authorization/exact-scope-compatibility.test.ts | 14, 30, 43, 50, 82, 100 |
| `permissions` | test | server/db/scripts/__tests__/authorization/inventory-promotion.test.ts | 72, 122, 127 |
| `permissions` | test | server/db/scripts/__tests__/authorization/projection-reconciliation-authority.test.ts | 159 |
| `permissions` | test | server/db/scripts/__tests__/business-partner-360/business-partner-360-workforce-privacy.test.ts | 42, 53 |
| `permissions` | tool | server/db/scripts/checks/ddl/platform-catalog.ts | 60 |
| `permissions` | tool | server/db/scripts/checks/seeds/authorization-release-gates.ts | 22, 24, 94, 100, 106, 107, 148, 149, 151, 158, 215, 442 |
| `permissions` | tool | server/db/scripts/operations/authorization/reset-authorization-clean-slate.ts | 111, 120 |
| `permissions` | tool | server/db/scripts/operations/provision-cirrusatlantic-bp-qa.sql | 7, 15, 20, 21 |
| `permissions` | tool | server/db/scripts/operations/studio/provision-cirrusatlantic-meta-qa.sql | 21, 28, 31 |
| `permissions` | tool | server/db/scripts/operations/studio/provision-cirrusatlantic-preview-reader-session.sql | 23, 30, 33 |
| `permissions` | tool | server/db/scripts/operations/studio/provision-cirrusatlantic-preview-session.sql | 30, 37, 40 |
| `permissions` | tool | server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260906_mesh_exchange_readiness.sql | 313, 337 |
| `permissions` | tool | server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260912_company_pilot_lifecycle.sql | 239 |
| `permissions` | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 60, 644, 647, 693, 701, 713 |
| `permissions` | tool | server/db/scripts/provisioning/cirrusatlantic-demo-authorization-model.ts | 9, 26, 45, 54, 63, 146, 147 |
| `permissions` | tool | server/db/scripts/provisioning/provision-business-partner-r2-fixtures.ts | 318, 325, 338 |
| `permissions` | tool | server/db/scripts/provisioning/provision-business-partner-r3-applicant.ts | 87, 94, 95, 111 |
| `permissions` | tool | server/db/scripts/provisioning/provision-cirrusatlantic-demo-authorization.ts | 114, 117, 118, 120, 138, 149, 172, 175, 176, 178, 216, 219, 220, 222, 413, 418, 435, 437, 455, 456, 471 |
| `permissions` | tool | server/db/scripts/provisioning/provision-development-business-partner-runtime.ts | 347, 438, 450 |
| `permissions` | tool | server/db/scripts/provisioning/provision-development-northwind-mesh-fixture.ts | 40, 267, 268, 269 |
| `permissions` | tool | server/db/scripts/provisioning/provision-three-tenant-demo-authorization.ts | 135, 140, 161, 216, 226, 227 |
| `permissions` | tool | server/db/scripts/provisioning/publish-development-list-experience.ts | 341, 367, 403, 405 |
| `permissions` | tool | server/db/scripts/provisioning/three-plane-model.ts | 178 |
| `permissions` | tool | server/db/scripts/reports/neon-authorization-quality.ts | 613, 634, 637 |
| `permissions` | tool | server/db/scripts/seed/build-exact-scope-compatibility.ts | 17, 23 |
| `permissions` | tool | server/db/scripts/seed/canonical-catalog-v2-model.ts | 34, 40, 42, 55, 56, 63 |
| `permissions` | tool | server/db/scripts/seed/compile-final-authorization-seed-packs.ts | 15, 44, 161, 228 |
| `permissions` | tool | server/db/scripts/seed/compile-mesh-authorization-inventory.ts | 185 |
| `permissions` | tool | server/db/scripts/seed/entity-operation-projection-compiler.ts | 65, 66 |
| `permissions` | tool | server/db/scripts/seed/exact-scope-compatibility-model.ts | 12, 30, 39, 60, 65 |
| `permissions` | tool | server/db/scripts/seed/inventory-promotion-model.ts | 89, 90, 91, 92, 94, 95, 102 |
| `permissions` | tool | server/db/scripts/seed/validate-canonical-catalogs.ts | 28, 47, 74, 79 |
| `permissions` | test | server/db/scripts/tests/integration/atlas/tools-rls.ts | 175 |
| `permissions` | test | server/db/scripts/tests/integration/business-partner-bank-verification.ts | 72 |
| `permissions` | test | server/db/scripts/tests/integration/identity-replay-live.mjs | 450 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json | 7 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/mesh/scope-compatibility.v1.json | 6 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json | 7 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/neon/scope-compatibility.v1.json | 6 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json | 7 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/studio/scope-compatibility.v1.json | 6 |
| `permissions` | runtime | server/db/seed/contracts/authorization/control/cross-plane-suspension-control.v1.json | 13 |
| `permissions` | runtime | server/db/seed/contracts/authorization/inventory/neon/promotion/catalog.v2.candidate.json | 7 |
| `permissions` | runtime | server/db/seed/contracts/authorization/inventory/neon/promotion/scope-compatibility.v1.candidate.json | 6 |
| `permissions` | runtime | server/db/seed/packs/authorization-v2/mesh/seed-pack.v1.json | 584 |
| `permissions` | runtime | server/db/seed/packs/authorization-v2/neon/seed-pack.v1.json | 424 |
| `permissions` | runtime | server/db/seed/packs/authorization-v2/studio/seed-pack.v1.json | 472 |
| `permissions` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 42, 56 |
| `permissions` | runtime | server/packages/adapters/experience-postgres/src/index.ts | 249 |
| `permissions` | test | server/packages/contracts/ai/src/__tests__/business-context.test.ts | 35 |
| `permissions` | runtime | server/packages/contracts/ai/src/experience-configuration.ts | 9 |
| `permissions` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 12, 34, 35, 39 |
| `permissions` | runtime | server/packages/contracts/auth/src/authorization.ts | 91 |
| `permissions` | runtime | server/packages/contracts/experience/src/ports.ts | 154 |
| `permissions` | runtime | server/packages/contracts/finance/src/index.ts | 9 |
| `permissions` | test | server/packages/contracts/metadata/src/__tests__/entity-ai.test.ts | 16 |
| `permissions` | test | server/packages/planes/mesh/src/business-partner-bank-disclosure.test.ts | 5 |
| `permissions` | test | server/packages/planes/mesh/src/business-partner-network-exchange.test.ts | 5, 14 |
| `permissions` | runtime | server/packages/planes/mesh/src/business-partner-network-exchange.ts | 598 |
| `permissions` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3, 6, 7 |
| `permissions` | test | server/packages/planes/mesh/src/mesh-services-review.test.ts | 24 |
| `permissions` | test | server/packages/planes/mesh/src/network-account-context.test.ts | 8, 13, 14, 15, 28, 29 |
| `permissions` | runtime | server/packages/planes/mesh/src/network-account-context.ts | 18 |
| `permissions` | test | server/packages/planes/neon/src/__tests__/integration/business-partner-bank-verification.ts | 75 |
| `permissions` | test | server/packages/planes/neon/src/business-partner-account-bank-linkage.test.ts | 6 |
| `permissions` | runtime | server/packages/planes/neon/src/business-partner-account-bank-linkage.ts | 512 |
| `permissions` | test | server/packages/planes/neon/src/business-partner-intake-protection.test.ts | 8 |
| `permissions` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6, 23, 36 |
| `permissions` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7, 23, 35, 57 |
| `permissions` | test | server/packages/planes/neon/src/finance-http.test.ts | 19 |
| `permissions` | route | server/packages/planes/neon/src/finance-http.ts | 445 |
| `permissions` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 39 |
| `permissions` | test | server/packages/planes/neon/src/register-finance.test.ts | 7 |
| `permissions` | runtime | server/packages/planes/neon/src/register-finance.ts | 289, 336, 348, 355, 380, 386, 391, 411, 469 |
| `permissions` | test | server/packages/planes/studio/meta-entity-authoring/src/__tests__/list-experience.test.ts | 84 |
| `permissions` | runtime | server/packages/planes/studio/meta-entity-authoring/src/collection-relationship.ts | 30, 34, 38 |
| `permissions` | runtime | server/packages/planes/studio/meta-entity-authoring/src/list-experience.ts | 92 |
| `permissions` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 18 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/business-context.test.ts | 14, 169, 385 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/business-partner-evaluations.test.ts | 9, 12, 89, 93, 124, 137, 146 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/business-partner-insight-tools.test.ts | 11, 14, 17 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/business-partner-list-insights.test.ts | 16, 329 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/conversation-composition.test.ts | 13, 14, 43, 44, 64, 65 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/durable-message-lineage.test.ts | 20, 21 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/entity-record-tool.test.ts | 14, 65, 120 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/entity-section-tool.test.ts | 11 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/inference-reauthorization.test.ts | 136 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/local-generation.test.ts | 11, 13, 20, 26, 32 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/local-page-answer-budget.test.ts | 37 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/missing-scope-runtime.test.ts | 33, 66, 99, 129 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/redis-insight-cache.test.ts | 134 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/repository-review.test.ts | 191, 192 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/response-feedback.test.ts | 7 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/retrieval-f5.test.ts | 11, 84, 104, 108 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/review-fixture.ts | 10 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/route-review.test.ts | 305, 306 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7, 37 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15 |
| `permissions` | runtime | server/packages/platform/ai/src/business-partner-insight-tools.ts | 18 |
| `permissions` | runtime | server/packages/platform/ai/src/context.ts | 13, 14, 15, 16, 22, 23, 24, 25 |
| `permissions` | runtime | server/packages/platform/ai/src/experience-configuration.ts | 19, 20, 29, 87 |
| `permissions` | runtime | server/packages/platform/ai/src/surface-draft-generation.ts | 109 |
| `permissions` | runtime | server/packages/platform/ai/src/tool-service.ts | 85, 245 |
| `permissions` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 349 |
| `permissions` | test | server/packages/platform/control-admin/src/authorization-management-service.test.ts | 156 |
| `permissions` | test | server/packages/platform/control-admin/src/bank-validation.test.ts | 97 |
| `permissions` | test | server/packages/platform/control-admin/src/connector-control.test.ts | 98 |
| `permissions` | test | server/packages/platform/control-admin/src/control-admin-inventory.test.ts | 8 |
| `permissions` | test | server/packages/platform/control-admin/src/cycle/cycle-config-routes.test.ts | 31, 38 |
| `permissions` | test | server/packages/platform/control-admin/src/cycle/cycle-config-service.test.ts | 48 |
| `permissions` | test | server/packages/platform/control-admin/src/kysely-entitlement-repository.postgres.test.ts | 1092, 1137 |
| `permissions` | test | server/packages/platform/control-admin/src/rounding-control.test.ts | 205 |
| `permissions` | runtime | server/packages/platform/experience/src/contracts.ts | 74, 153, 185 |
| `permissions` | test | server/packages/platform/experience/src/entity-operation-dispatcher.test.ts | 10, 46 |
| `permissions` | runtime | server/packages/platform/experience/src/entity-operation-dispatcher.ts | 44 |
| `permissions` | test | server/packages/platform/experience/src/entity-section-service.test.ts | 9 |
| `permissions` | runtime | server/packages/platform/experience/src/entity-section-service.ts | 169 |
| `permissions` | test | server/packages/platform/experience/src/service.test.ts | 16, 23, 46, 71, 90, 93, 108, 109, 111, 114, 116, 131, 152, 156, 169, 177, 185, 194, 206, 218, 229, 238, 250, 266, 268, 274, 282, 290, 314, 326, 335, 384 |
| `permissions` | runtime | server/packages/platform/experience/src/service.ts | 218, 223, 225, 242, 251, 272, 300, 700, 756, 757, 796, 878, 943, 1056, 1076, 1095, 1112, 1114, 1115, 1242 |
| `permissions` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `permissions` | test | server/packages/platform/governance/src/routes/governance-routes.test.ts | 9 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/authorization-golden-corpus.test.ts | 23, 27, 28 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/iam-service.test.ts | 13, 35, 38, 39, 40, 44, 59, 61 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/identity-replay-routes.test.ts | 64 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 8, 30, 31, 67, 68, 85, 91 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10, 80, 83 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/source-permission-constraints.test.ts | 10, 49, 55, 85, 86, 88, 110, 115 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `permissions` | route | server/packages/platform/iam/src/iam-routes.ts | 36 |
| `permissions` | runtime | server/packages/platform/iam/src/iam-service.ts | 46, 105, 106, 108, 110, 113, 114, 173, 175, 201, 202 |
| `permissions` | runtime | server/packages/platform/iam/src/kysely-context-refresh.ts | 33, 38, 42, 43 |
| `permissions` | runtime | server/packages/platform/iam/src/kysely-identity-context-resolver.ts | 58, 63 |
| `permissions` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 39, 41, 42, 43, 56, 74, 77, 80, 83, 91, 96, 141, 150, 164, 165, 251 |
| `permissions` | test | server/packages/platform/metadata/src/__tests__/entity-ai.test.ts | 12 |
| `permissions` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `permissions` | test | server/packages/platform/metadata/src/__tests__/native-list-application.test.ts | 14 |
| `permissions` | runtime | server/packages/platform/metadata/src/descriptor-parser.ts | 39 |
| `permissions` | runtime | server/packages/platform/metadata/src/metadata-service.ts | 33 |
| `permissions` | runtime | server/packages/platform/metadata/src/native-runtime-projection.ts | 86, 143 |
| `permissions` | test | server/packages/platform/notifications/src/__tests__/notification-operations.test.ts | 44 |
| `permissions` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `permissions` | test | server/packages/platform/preferences/src/entity-views.test.ts | 8 |
| `permissions` | test | server/packages/platform/search/src/__tests__/fixtures.ts | 1 |
| `permissions` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 30, 87 |
| `permissions` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 117 |
| `permissions` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `permissions` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 36 |
| `permissions` | runtime | server/packages/services/finance/src/budget/budget-service.ts | 7, 12, 32, 48, 51, 56 |
| `permissions` | test | server/packages/services/finance/src/closing/closing-services.test.ts | 9, 17, 19, 21, 23, 25 |
| `permissions` | runtime | server/packages/services/finance/src/closing/closing-services.ts | 7, 12, 29, 41, 54, 56, 71 |
| `permissions` | test | server/packages/services/finance/src/inventory/f4-acceptance.test.ts | 9, 61 |
| `permissions` | runtime | server/packages/services/finance/src/inventory/inventory-service.ts | 53, 66, 76, 81, 137 |
| `permissions` | runtime | server/packages/services/finance/src/ledger/commitment-service.ts | 6, 8, 22 |
| `permissions` | runtime | server/packages/services/finance/src/ledger/cross-book-posting-service.ts | 8, 10, 25 |
| `permissions` | test | server/packages/services/finance/src/ledger/f3-acceptance.test.ts | 13, 30, 35, 40 |
| `permissions` | runtime | server/packages/services/finance/src/ledger/gl-posting-service.ts | 37 |
| `permissions` | test | server/packages/services/finance/src/numbering/numbering-service.test.ts | 40, 52 |
| `permissions` | runtime | server/packages/services/finance/src/numbering/numbering-service.ts | 22, 30, 50 |
| `permissions` | test | server/packages/services/finance/src/planning/planning-service.test.ts | 5, 7, 8 |
| `permissions` | runtime | server/packages/services/finance/src/planning/planning-service.ts | 7, 8, 9, 13, 14, 15 |
| `permissions` | runtime | server/packages/services/finance/src/shared/book-period-service.ts | 7, 10, 19 |
| `permissions` | test | server/packages/services/finance/src/shared/finance-foundation.test.ts | 65 |
| `permissions` | runtime | server/packages/services/finance/src/shared/posting-guard.ts | 6, 9 |
| `permissions` | runtime | server/packages/services/finance/src/tax/tax-calculation-service.ts | 11, 16 |
| `permissions` | runtime | server/packages/services/finance/src/tax/tax-credit-service.ts | 8, 13, 47 |
| `permissions` | test | server/packages/services/finance/src/tax/tax-services.test.ts | 11, 26, 42 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/business-partner-360-policy.test.ts | 118 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/business-partner-360-resources.test.ts | 133 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/business-partner-360-service.test.ts | 21 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/business-partner-case-service.test.ts | 29, 479, 502, 577, 648, 674, 770, 838, 846, 850, 902, 942, 954, 957, 970, 1277, 1620, 1660, 1776, 1794, 2012, 2065, 2069 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/business-partner-case-view.test.ts | 83 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/business-partner-eligibility-service.test.ts | 7, 9, 12, 15, 24, 28, 31 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/business-partner-invitation-service.test.ts | 2 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/customer-onboarding-service.test.ts | 40, 208, 234, 285, 471, 472 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/governed-internal-business-partner-service.test.ts | 15, 28, 61, 76, 122 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/integration/governed-internal-business-partner-http.mjs | 133 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/master-data-repository.postgres.test.ts | 1353 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/supplier-workforce-command-guard.test.ts | 14 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/supplier-workforce-requisition-service.test.ts | 2 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/worker-engagement-iam-service.test.ts | 11 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/worker-engagement-lifecycle-service.test.ts | 23 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/workforce-service.test.ts | 6, 16, 21, 22 |
| `permissions` | runtime | server/packages/services/master-data/src/business-partner-360-route-contracts.ts | 97 |
| `permissions` | runtime | server/packages/services/master-data/src/business-partner-360-service.ts | 171, 183, 558, 595, 2138, 2142, 2148, 2157, 2167, 2177, 2187 |
| `permissions` | runtime | server/packages/services/master-data/src/business-partner-atlas-insights.ts | 68, 70 |
| `permissions` | runtime | server/packages/services/master-data/src/business-partner-case-view.ts | 201, 222, 225, 231, 239, 249, 255 |
| `permissions` | route | server/packages/services/master-data/src/business-partner-request-routes.ts | 361 |
| `permissions` | runtime | server/packages/services/master-data/src/kysely-business-partner-360-repository.ts | 174, 176, 210, 343, 360 |
| `permissions` | runtime | server/packages/services/master-data/src/master-data-authority.ts | 78 |
| `permissions` | test | server/packages/services/publication/src/__tests__/business-partner-company-case-contract.test.ts | 11 |
| `permissions` | test | server/packages/services/publication/src/__tests__/studio-authority-ddl.test.ts | 9 |
| `permissions` | runtime | server/packages/services/publication/src/business-partner-company-case-contract.ts | 117, 123, 127 |
| `permissions` | runtime | server/packages/services/publication/src/compiled-entity-collection-compiler.ts | 68, 79 |
| `permissions` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `permissions` | test | server/packages/services/records/src/__tests__/canonical-read-backend.test.ts | 82 |
| `permissions` | test | server/packages/services/records/src/__tests__/canonical-read-diagnostics.test.ts | 82 |
| `permissions` | test | server/packages/services/records/src/__tests__/document-collection-read.test.ts | 35 |
| `permissions` | test | server/packages/services/records/src/__tests__/entity-authorization.test.ts | 72, 334, 335, 348, 349, 514 |
| `permissions` | test | server/packages/services/records/src/__tests__/entity-backend-authorizer.test.ts | 38, 169, 415 |
| `permissions` | test | server/packages/services/records/src/__tests__/entity-backend-isolated-execution.test.ts | 38, 152, 164 |
| `permissions` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `permissions` | test | server/packages/services/records/src/__tests__/list-context-discovery.test.ts | 18, 120, 165 |
| `permissions` | test | server/packages/services/records/src/__tests__/list-experience.test.ts | 31, 68, 139, 168, 260, 311, 312, 315, 441, 554, 559 |
| `permissions` | test | server/packages/services/records/src/__tests__/navigation-context-discovery.test.ts | 31, 94, 139, 140, 143 |
| `permissions` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 40, 44, 47, 134 |
| `permissions` | test | server/packages/services/records/src/__tests__/snapshot-service.test.ts | 25 |
| `permissions` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `permissions` | runtime | server/packages/services/records/src/entity-authorization.ts | 100 |
| `permissions` | runtime | server/packages/services/records/src/entity-backend-authorizer.ts | 228, 229, 230 |
| `permissions` | runtime | server/packages/services/records/src/entity-list-service.ts | 1171, 1172, 1174, 1521, 1524 |
| `permissions` | runtime | server/packages/services/records/src/list-context-discovery.ts | 40, 41, 42, 79 |
| `permissions` | runtime | server/packages/services/records/src/list-experience.ts | 26, 35 |
| `permissions` | runtime | server/packages/services/records/src/navigation-context-discovery.ts | 22 |
| `permissions` | runtime | server/packages/services/records/src/query-service.ts | 441, 444 |
| `permissions` | test | server/packages/services/records/src/transfer/export-preflight.test.ts | 6 |
| `permissions` | runtime | server/packages/services/records/src/transfer/transfer-jobs.ts | 1255, 1259, 1263 |
| `permissions` | runtime | server/packages/services/records/src/transfer/transfer-service.ts | 1979, 1983, 1989 |
| `permissions` | runtime | server/packages/test-utils/src/index.ts | 16, 22 |
| `permissions` | test | tests/contracts/access-consumption-phase9.test.ts | 6, 20, 25, 28, 29 |
| `permissions` | test | tests/contracts/app-composition-phase10.test.ts | 24 |
| `permissions` | test | tests/contracts/business-partner-independent-child.test.ts | 16, 73 |
| `permissions` | test | tests/contracts/first-business-module-readiness.test.ts | 11 |
| `permissions` | test | tests/contracts/home-personalization-phase3.test.ts | 19 |
| `permissions` | test | tests/contracts/platform-catalog-experience.test.ts | 192 |
| `permissions` | test | tests/contracts/query-provider-lifecycle.test.ts | 13 |
| `permissions` | test | tests/contracts/shared-shell-navigation.test.ts | 45, 117, 164, 194, 197, 261, 660, 663, 664 |
| `permissions` | test | tests/contracts/studio-publication-navigation.test.ts | 7, 11 |
| `permissions` | test | tests/foundation/access-gates-phase9.test.tsx | 6 |
| `permissions` | tool | tooling/scripts/local-dev/graph-preview.integration.test.mts | 67, 78, 87, 91, 94, 102, 111, 187, 193, 194, 270, 307, 345, 360, 379, 388, 390, 396 |
| `permissions` | tool | tooling/scripts/policy/authorization-inventory.ts | 894, 966, 968, 1112, 1138, 1139, 1180, 1184 |
| `permissions` | tool | tooling/scripts/policy/generate-development-url-catalogue.mjs | 208 |
| `permissions` | tool | tooling/scripts/policy/host-capability-registry.mjs | 98 |
| `permissions` | tool | tooling/scripts/policy/host-capability-registry.test.mjs | 32 |
| `permissions` | tool | tooling/scripts/policy/verify-access-consumption-phase9.mjs | 12 |
| `permissions` | tool | tooling/scripts/policy/verify-shared-shell-phase8.mjs | 14, 20 |
| `permissions` | ui | tooling/scripts/verification/appearance-browser-entry.tsx | 9 |
| `permissions` | tool | tooling/scripts/verification/apply-business-partner-release-19-test-grants.mjs | 26, 32 |
| `permissions` | tool | tooling/scripts/verification/approve-business-partner-canonical-v2.mts | 113 |
| `permissions` | tool | tooling/scripts/verification/approve-business-partner-case-correction.mts | 42 |
| `permissions` | tool | tooling/scripts/verification/approve-business-partner-combined-successor.mts | 35 |
| `permissions` | tool | tooling/scripts/verification/approve-business-partner-enter-correction.mts | 121 |
| `permissions` | tool | tooling/scripts/verification/approve-business-partner-reset-runtime.mts | 121 |
| `permissions` | tool | tooling/scripts/verification/assign-atlas-enablement-roles.mjs | 18, 21, 34 |
| `permissions` | tool | tooling/scripts/verification/capture-atlas-foundation-baseline.mjs | 228 |
| `permissions` | tool | tooling/scripts/verification/capture-business-partner-release-19-execution-readiness.mts | 18, 21 |
| `permissions` | tool | tooling/scripts/verification/dry-run-business-partner-release-19-test-grants.mjs | 19, 25 |
| `permissions` | tool | tooling/scripts/verification/dry-run-business-partner-target-read-grants.mjs | 22 |
| `permissions` | tool | tooling/scripts/verification/entity-authorization/accepted-operation-selection.mjs | 53 |
| `permissions` | tool | tooling/scripts/verification/entity-authorization/accepted-operation-selection.test.mjs | 11 |
| `permissions` | tool | tooling/scripts/verification/entity-authorization/governed-import-selection.test.mjs | 8 |
| `permissions` | tool | tooling/scripts/verification/entity-authorization/named-role-recommendations.test.mjs | 9 |
| `permissions` | tool | tooling/scripts/verification/entity-authorization/publication-plan.mts | 54, 382, 386, 389 |
| `permissions` | tool | tooling/scripts/verification/entity-authorization/publication-plan.test.mts | 127, 214, 218, 228 |
| `permissions` | tool | tooling/scripts/verification/entity-authorization/studio-authoring-grants.mjs | 73, 88, 99 |
| `permissions` | tool | tooling/scripts/verification/entity-authorization/studio-authoring-grants.test.mjs | 20 |
| `permissions` | tool | tooling/scripts/verification/entity-authorization/target-read-grants.mjs | 34, 39, 83 |
| `permissions` | tool | tooling/scripts/verification/entity-authorization/target-read-grants.test.mjs | 44 |
| `permissions` | tool | tooling/scripts/verification/install-business-partner-target-catalog.mjs | 32, 44, 53 |
| `permissions` | tool | tooling/scripts/verification/install-task-rules-canonical-dev.mjs | 33 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/access-dry-run.mjs | 97 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/access-sql.mjs | 10, 12 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/build-finance-reveal-candidate.mjs | 32, 33 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/prepare-access.mjs | 48, 121, 139 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/prepare-affordance-count-execution.mjs | 36, 38, 41, 61, 84, 142, 150 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/prepare-company-correction-candidate.mjs | 92 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/prepare-company-correction-only-candidate.mjs | 92 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/prepare-final-disposition-review.mjs | 218 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/prepare-finance-reveal-access.mjs | 47, 98 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/prepare-finance-reveal-candidate.mjs | 43 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/prepare-manual-ui-access.mjs | 25, 30, 31, 53, 86 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/prepare-neon-final-candidate.mjs | 108, 200 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/preview-summary-open-work.mts | 119 |
| `permissions` | tool | tooling/scripts/verification/isolated-enter/refresh-access.mjs | 42, 60, 99, 129 |
| `permissions` | tool | tooling/scripts/verification/isolated-execution/check-binding-selection.mjs | 5, 9 |
| `permissions` | tool | tooling/scripts/verification/isolated-release20/grants.mjs | 51, 53, 59, 85 |
| `permissions` | tool | tooling/scripts/verification/isolated-release20/qualify-revocation.mjs | 222 |
| `permissions` | tool | tooling/scripts/verification/isolated-successor/authority-check.mjs | 70, 80, 81 |
| `permissions` | tool | tooling/scripts/verification/isolated-successor/grants.mjs | 47, 49, 55, 81 |
| `permissions` | tool | tooling/scripts/verification/isolated-successor/qualify-revocation.mjs | 220 |
| `permissions` | tool | tooling/scripts/verification/manage-supplier-communications-dev-access.mts | 122, 130, 138, 141, 179 |
| `permissions` | tool | tooling/scripts/verification/manage-supplier-onboarding-dev-access.mts | 122, 130, 138, 141, 179 |
| `permissions` | tool | tooling/scripts/verification/master-data-prerequisites.mjs | 10, 11, 12, 13, 14, 15, 52, 60, 61, 62, 63, 65 |
| `permissions` | tool | tooling/scripts/verification/master-data-prerequisites.test.mjs | 8 |
| `permissions` | ui | tooling/scripts/verification/neon-context-browser-entry.tsx | 59 |
| `permissions` | tool | tooling/scripts/verification/prepare-bp-ai-release.mjs | 35 |
| `permissions` | tool | tooling/scripts/verification/prepare-business-partner-accepted-operations.mts | 44 |
| `permissions` | tool | tooling/scripts/verification/prepare-business-partner-operation-reviews.mjs | 8 |
| `permissions` | tool | tooling/scripts/verification/prepare-business-partner-publication-review.ts | 48, 49 |
| `permissions` | tool | tooling/scripts/verification/prepare-business-partner-release-19-difference-review.mjs | 39 |
| `permissions` | tool | tooling/scripts/verification/prepare-business-partner-release-19-test-grants.mjs | 12, 15, 19, 20, 32 |
| `permissions` | tool | tooling/scripts/verification/prepare-business-partner-target-read-proposal.mjs | 18, 48, 52, 81, 127, 185, 187 |
| `permissions` | tool | tooling/scripts/verification/prepare-entity-authorization-publication.mts | 53, 95 |
| `permissions` | tool | tooling/scripts/verification/provision-business-partner-r3-invitation.mjs | 75 |
| `permissions` | tool | tooling/scripts/verification/publish-business-partner-canonical-v2.mts | 77 |
| `permissions` | tool | tooling/scripts/verification/publish-business-partner-combined-successor.mts | 20 |
| `permissions` | tool | tooling/scripts/verification/publish-business-partner-enter-correction.mts | 46 |
| `permissions` | tool | tooling/scripts/verification/publish-business-partner-reset-runtime.mts | 46 |
| `permissions` | tool | tooling/scripts/verification/qualify-business-partner-approved-read-grants.mjs | 60, 62, 65 |
| `permissions` | tool | tooling/scripts/verification/qualify-business-partner-commands.mts | 144 |
| `permissions` | tool | tooling/scripts/verification/qualify-business-partner-database-adapters.mts | 49, 61 |
| `permissions` | tool | tooling/scripts/verification/qualify-entity-authorization.mts | 74 |
| `permissions` | tool | tooling/scripts/verification/retry-business-partner-release-19.mts | 10 |
| `permissions` | tool | tooling/scripts/verification/review-business-partner-roles.mjs | 34, 35, 36, 37, 38, 39, 40, 41 |
| `permissions` | tool | tooling/scripts/verification/setup-local-atlas-authority.mts | 24 |
| `permissions` | tool | tooling/scripts/verification/setup-local-contact-challenge.mjs | 35 |
| `permissions` | tool | tooling/scripts/verification/stage-business-partner-reset-draft.mts | 56 |
| `permissions` | tool | tooling/scripts/verification/submit-business-partner-enter-correction.mts | 56 |
| `permissions` | tool | tooling/scripts/verification/verify-local-atlas-conversations.mts | 60, 61, 115, 116 |
| `permissions` | tool | tooling/scripts/verification/verify-local-atlas-generation-races.mts | 25 |
| `permissions` | tool | tooling/scripts/verification/verify-local-atlas-generation.mts | 22, 44 |
| `permissions` | tool | tooling/scripts/verification/verify-local-master-data-six-routes.mjs | 57, 123, 124 |
| `permissions` | tool | tooling/tools/scripts/openapi-policy.test.mjs | 37 |
| `permissions` | tool | tooling/tools/scripts/verify-deployed-openapi.mjs | 37 |
| `persona` | keycloak | deploy/config/iam/realm-athyper-demosetup.json | 1703, 1745, 1778, 1811, 1848, 1881, 1914, 1947, 1989, 2022, 2055, 2092, 2125, 2158, 2191, 2233, 2266, 2299, 2336, 2369, 2402, 2435, 2477, 2510, 2543, 2580, 2613, 2646, 2679, 2721, 2754, 2787, 2824, 2857, 2890, 2923, 2965, 2998, 3031, 3068, 3101, 3134, 3167, 3209, 3242, 3275, 3312, 3345, 3378, 3411, 3453, 3486, 3519, 3556, 3589, 3622, 3655, 3697, 3730, 3763, 3800, 3833, 3866, 3899, 3941, 3974, 4007, 4044, 4077, 4110, 4143, 4185, 4218, 4251, 4288, 4321, 4354, 4387, 4429, 4462, 4495, 4532, 4565, 4598, 4631, 4673, 4706, 4739, 4776, 4809, 4842, 4875, 4917, 4950, 4983, 5020, 5053, 5086, 5119, 5161, 5194, 5227, 5264, 5297, 5330, 5367, 5400, 5433, 5470, 5507, 5549, 5582, 5615, 5652, 5685, 5718, 5751, 5793, 5826, 5859, 5896, 5929, 5962, 5995, 6037, 6070, 6103, 6140, 6173, 6206, 6749, 6782, 6815 |
| `persona` | runtime | governance/config/governance/authorization-data-disposition-policy.v1.json | 362 |
| `persona` | runtime | governance/config/governance/authorization-legacy-freeze-baseline.v1.json | 6497, 6649, 6663, 6664, 6671, 6672, 6679, 6680, 6687, 6688, 6695, 6696, 6703, 6704, 6711, 6712, 6719, 6720, 6727, 6728, 6735, 6736, 6743, 6744, 6751, 6752, 6753, 6759, 6760, 6767, 6768, 6775, 6776, 6783, 6784, 6791, 6792, 6799, 6800, 7041, 7049, 7057 |
| `persona` | runtime | governance/policy/reviews/business-partner-enter-atlas-access-20260912.proposal.dev.json | 70 |
| `persona` | runtime | governance/policy/reviews/business-partner-policy-triage.dev.json | 58 |
| `persona` | runtime | governance/policy/reviews/business-partner-release-19-differences.proposal.dev.json | 234 |
| `persona` | runtime | governance/policy/reviews/business-partner-release-19-differences.successor-20260911.proposal.dev.json | 202 |
| `persona` | runtime | governance/policy/reviews/entity-authorization-differences.dev.json | 41, 42, 66, 90, 114, 138, 162, 186, 210, 234, 258, 282, 306, 330, 354, 378, 402, 426, 450, 474, 498, 522, 546, 570, 594, 618, 642, 666, 690 |
| `persona` | test | server/db/scripts/__tests__/authorization/cirrusatlantic-demo-authorization.test.ts | 16, 19, 21, 23, 30 |
| `persona` | tool | server/db/scripts/checks/seeds/authorization.ts | 72 |
| `persona` | tool | server/db/scripts/provisioning/cirrusatlantic-demo-authorization-model.ts | 127, 128, 129, 130, 131, 133, 135 |
| `persona` | tool | server/db/scripts/provisioning/provision-cirrusatlantic-demo-authorization.ts | 38, 59, 60, 61, 62, 63, 64, 67, 103, 104, 107, 126, 162, 206, 309, 318, 319, 323, 324, 329, 332, 333, 339, 344, 345, 350, 353, 354, 358, 359, 369, 370, 382, 393, 394 |
| `persona` | tool | server/db/scripts/provisioning/provision-three-tenant-demo-authorization.ts | 68 |
| `persona` | tool | tooling/scripts/policy/authorization-inventory.ts | 634, 895, 900 |
| `persona` | tool | tooling/scripts/verification/business-partner-ai-qualification.test.mjs | 65, 205, 210, 213 |
| `persona` | tool | tooling/scripts/verification/complete-business-partner-ai-baseline.mjs | 108 |
| `persona` | tool | tooling/scripts/verification/deploy-atlas-f6-persona-api.cjs | 5, 27, 28, 30, 35 |
| `persona` | tool | tooling/scripts/verification/deploy-atlas-f6-persona-schema.mjs | 16, 22 |
| `persona` | tool | tooling/scripts/verification/entity-authorization/policy-differences.mjs | 12, 14 |
| `persona` | tool | tooling/scripts/verification/entity-authorization/policy-differences.test.mjs | 4 |
| `persona` | tool | tooling/scripts/verification/isolated-enter/refresh-access.mjs | 114 |
| `persona` | tool | tooling/scripts/verification/plan-entity-authorization-migration.mjs | 97 |
| `persona` | tool | tooling/scripts/verification/qualify-atlas-f6-personas.mjs | 13 |
| `persona` | tool | tooling/scripts/verification/qualify-business-partner-ai.mjs | 238, 240, 245 |
| `persona` | tool | tooling/scripts/verification/qualify-entity-authorization.mts | 69, 77, 118, 129, 140, 156, 205, 213 |
| `persona` | tool | tooling/tools/scripts/generate-athyper-demo-iam.cjs | 71, 85, 99, 100, 101, 117, 128, 132, 140, 141, 147, 148, 163, 254 |
| `persona` | tool | tooling/tools/scripts/verify-athyper-demo-iam.cjs | 107, 108, 110 |
| `personaId` | tool | tooling/scripts/policy/authorization-inventory.ts | 916 |
| `planeExcluded` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/intent-feedback.mts | 153 |
| `planeExcluded` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-inbox.mts | 168 |
| `planeExcluded` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval.mts | 138 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/__tests__/ai-vertical.test.ts | 81 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/__tests__/atlas-entity-records-vertical.test.ts | 16 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/__tests__/bp-list-insights.test.ts | 44 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/__tests__/business-partner-authorization-shadow.test.ts | 47 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/__tests__/business-partner-company-native-authority.test.ts | 30 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/__tests__/business-partner-import-runtime.test.ts | 70 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-read-policy.test.ts | 40 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-reveal-policy.test.ts | 103 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/__tests__/iam-api-review.test.ts | 52 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/__tests__/master-data-authority.test.ts | 23 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/__tests__/master-data-vertical.test.ts | 41 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/__tests__/meta-entity-authoring-authorizer.test.ts | 5 |
| `planeExcluded` | runtime | server/apps/platform-host/src/composition/business-partner-authorization-shadow.ts | 239 |
| `planeExcluded` | test | server/apps/platform-host/src/composition/business-partner-definition-authorizer.test.ts | 9 |
| `planeExcluded` | runtime | server/apps/platform-host/src/composition/register-services.ts | 6034, 7517 |
| `planeExcluded` | tool | server/apps/platform-host/src/scripts/qualify-document-infrastructure.ts | 163 |
| `planeExcluded` | tool | server/apps/platform-host/src/scripts/qualify-document-malware.ts | 253 |
| `planeExcluded` | test | server/db/scripts/tests/integration/business-partner-bank-verification.ts | 79 |
| `planeExcluded` | test | server/db/scripts/tests/integration/identity-replay-live.mjs | 461 |
| `planeExcluded` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `planeExcluded` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 23 |
| `planeExcluded` | runtime | server/packages/contracts/auth/src/authorization.ts | 82 |
| `planeExcluded` | test | server/packages/planes/mesh/src/business-partner-bank-disclosure.test.ts | 5 |
| `planeExcluded` | test | server/packages/planes/mesh/src/business-partner-network-exchange.test.ts | 5 |
| `planeExcluded` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3 |
| `planeExcluded` | test | server/packages/planes/neon/src/__tests__/integration/business-partner-bank-verification.ts | 82 |
| `planeExcluded` | test | server/packages/planes/neon/src/business-partner-account-bank-linkage.test.ts | 6 |
| `planeExcluded` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6 |
| `planeExcluded` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7 |
| `planeExcluded` | test | server/packages/planes/neon/src/finance-http.test.ts | 23 |
| `planeExcluded` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 50 |
| `planeExcluded` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 29 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/business-context.test.ts | 22 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/business-partner-evaluations.test.ts | 12 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/business-partner-insight-tools.test.ts | 14 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/conversation-composition.test.ts | 37 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/review-fixture.ts | 21 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/route-review.test.ts | 298 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15 |
| `planeExcluded` | runtime | server/packages/platform/ai/src/context.ts | 25 |
| `planeExcluded` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 360 |
| `planeExcluded` | test | server/packages/platform/control-admin/src/kysely-entitlement-repository.postgres.test.ts | 1103 |
| `planeExcluded` | test | server/packages/platform/experience/src/service.test.ts | 16 |
| `planeExcluded` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `planeExcluded` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `planeExcluded` | test | server/packages/platform/iam/src/__tests__/identity-replay-routes.test.ts | 71 |
| `planeExcluded` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 11 |
| `planeExcluded` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10 |
| `planeExcluded` | test | server/packages/platform/iam/src/__tests__/source-permission-constraints.test.ts | 17, 61 |
| `planeExcluded` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `planeExcluded` | runtime | server/packages/platform/iam/src/iam-service.ts | 186 |
| `planeExcluded` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 382 |
| `planeExcluded` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 80, 275 |
| `planeExcluded` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `planeExcluded` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `planeExcluded` | test | server/packages/platform/search/src/__tests__/fixtures.ts | 1 |
| `planeExcluded` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 87 |
| `planeExcluded` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 128 |
| `planeExcluded` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `planeExcluded` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 36 |
| `planeExcluded` | test | server/packages/services/master-data/src/__tests__/business-partner-eligibility-service.test.ts | 24 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/canonical-read-backend.test.ts | 93 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/canonical-read-diagnostics.test.ts | 93 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/entity-authorization.test.ts | 84 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/entity-backend-authorizer.test.ts | 49 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/entity-backend-isolated-execution.test.ts | 49 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/list-context-discovery.test.ts | 29 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 44 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `planeExcluded` | test | tests/contracts/business-partner-independent-child.test.ts | 23 |
| `planeExcluded` | tool | tooling/scripts/verification/qualify-entity-authorization.mts | 87 |
| `planLocked` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/intent-feedback.mts | 152 |
| `planLocked` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-inbox.mts | 167 |
| `planLocked` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval.mts | 137 |
| `planLocked` | test | server/apps/platform-host/src/composition/__tests__/ai-vertical.test.ts | 81 |
| `planLocked` | test | server/apps/platform-host/src/composition/__tests__/atlas-entity-records-vertical.test.ts | 16 |
| `planLocked` | test | server/apps/platform-host/src/composition/__tests__/bp-list-insights.test.ts | 43 |
| `planLocked` | test | server/apps/platform-host/src/composition/__tests__/business-partner-authorization-shadow.test.ts | 46 |
| `planLocked` | test | server/apps/platform-host/src/composition/__tests__/business-partner-company-native-authority.test.ts | 29 |
| `planLocked` | test | server/apps/platform-host/src/composition/__tests__/business-partner-import-runtime.test.ts | 69 |
| `planLocked` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-read-policy.test.ts | 39 |
| `planLocked` | test | server/apps/platform-host/src/composition/__tests__/business-partner-target-reveal-policy.test.ts | 102 |
| `planLocked` | test | server/apps/platform-host/src/composition/__tests__/iam-api-review.test.ts | 51 |
| `planLocked` | test | server/apps/platform-host/src/composition/__tests__/master-data-authority.test.ts | 23 |
| `planLocked` | test | server/apps/platform-host/src/composition/__tests__/master-data-vertical.test.ts | 41 |
| `planLocked` | test | server/apps/platform-host/src/composition/__tests__/meta-entity-authoring-authorizer.test.ts | 5 |
| `planLocked` | runtime | server/apps/platform-host/src/composition/business-partner-authorization-shadow.ts | 238 |
| `planLocked` | test | server/apps/platform-host/src/composition/business-partner-definition-authorizer.test.ts | 9, 35 |
| `planLocked` | runtime | server/apps/platform-host/src/composition/register-services.ts | 6031, 7516 |
| `planLocked` | tool | server/apps/platform-host/src/scripts/qualify-document-infrastructure.ts | 162 |
| `planLocked` | tool | server/apps/platform-host/src/scripts/qualify-document-malware.ts | 252 |
| `planLocked` | test | server/db/scripts/tests/integration/business-partner-bank-verification.ts | 78 |
| `planLocked` | test | server/db/scripts/tests/integration/identity-replay-live.mjs | 460 |
| `planLocked` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `planLocked` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 22 |
| `planLocked` | runtime | server/packages/contracts/auth/src/authorization.ts | 81 |
| `planLocked` | test | server/packages/planes/mesh/src/business-partner-bank-disclosure.test.ts | 5 |
| `planLocked` | test | server/packages/planes/mesh/src/business-partner-network-exchange.test.ts | 5 |
| `planLocked` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3 |
| `planLocked` | test | server/packages/planes/neon/src/__tests__/integration/business-partner-bank-verification.ts | 81 |
| `planLocked` | test | server/packages/planes/neon/src/business-partner-account-bank-linkage.test.ts | 6 |
| `planLocked` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6 |
| `planLocked` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7 |
| `planLocked` | test | server/packages/planes/neon/src/finance-http.test.ts | 22 |
| `planLocked` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 49 |
| `planLocked` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 28 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/business-context.test.ts | 21 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/business-partner-evaluations.test.ts | 12 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/business-partner-insight-tools.test.ts | 14 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/conversation-composition.test.ts | 37 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/review-fixture.ts | 20 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/route-review.test.ts | 298 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15 |
| `planLocked` | runtime | server/packages/platform/ai/src/context.ts | 24 |
| `planLocked` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 359 |
| `planLocked` | test | server/packages/platform/control-admin/src/kysely-entitlement-repository.postgres.test.ts | 1102 |
| `planLocked` | test | server/packages/platform/experience/src/service.test.ts | 16 |
| `planLocked` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `planLocked` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `planLocked` | test | server/packages/platform/iam/src/__tests__/identity-replay-routes.test.ts | 70 |
| `planLocked` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 11 |
| `planLocked` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10 |
| `planLocked` | test | server/packages/platform/iam/src/__tests__/source-permission-constraints.test.ts | 16, 60 |
| `planLocked` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `planLocked` | runtime | server/packages/platform/iam/src/iam-service.ts | 185 |
| `planLocked` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 336, 349, 381 |
| `planLocked` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 77, 273 |
| `planLocked` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `planLocked` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `planLocked` | test | server/packages/platform/search/src/__tests__/fixtures.ts | 1 |
| `planLocked` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 87 |
| `planLocked` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 127 |
| `planLocked` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `planLocked` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 36 |
| `planLocked` | test | server/packages/services/master-data/src/__tests__/business-partner-eligibility-service.test.ts | 24 |
| `planLocked` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `planLocked` | test | server/packages/services/records/src/__tests__/canonical-read-backend.test.ts | 92 |
| `planLocked` | test | server/packages/services/records/src/__tests__/canonical-read-diagnostics.test.ts | 92 |
| `planLocked` | test | server/packages/services/records/src/__tests__/entity-authorization.test.ts | 83 |
| `planLocked` | test | server/packages/services/records/src/__tests__/entity-backend-authorizer.test.ts | 48 |
| `planLocked` | test | server/packages/services/records/src/__tests__/entity-backend-isolated-execution.test.ts | 48 |
| `planLocked` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `planLocked` | test | server/packages/services/records/src/__tests__/list-context-discovery.test.ts | 28 |
| `planLocked` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 44 |
| `planLocked` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `planLocked` | test | tests/contracts/business-partner-independent-child.test.ts | 22 |
| `planLocked` | tool | tooling/scripts/policy/authorization-inventory.ts | 916 |
| `planLocked` | tool | tooling/scripts/verification/qualify-entity-authorization.mts | 86 |
| `principalFingerprint` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/intent-feedback.mts | 146 |
| `principalFingerprint` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-inbox.mts | 161 |
| `principalFingerprint` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval.mts | 131 |
| `principalFingerprint` | test | server/apps/platform-host/src/composition/__tests__/atlas-entity-records-vertical.test.ts | 16 |
| `principalFingerprint` | test | server/apps/platform-host/src/composition/__tests__/bp-list-insights.test.ts | 37 |
| `principalFingerprint` | test | server/apps/platform-host/src/composition/__tests__/business-partner-authorization-shadow.test.ts | 42 |
| `principalFingerprint` | test | server/apps/platform-host/src/composition/__tests__/meta-entity-authoring-authorizer.test.ts | 5 |
| `principalFingerprint` | test | server/apps/platform-host/src/composition/business-partner-definition-authorizer.test.ts | 8 |
| `principalFingerprint` | runtime | server/apps/platform-host/src/composition/register-services.ts | 7510 |
| `principalFingerprint` | tool | server/apps/platform-host/src/scripts/qualify-document-infrastructure.ts | 154 |
| `principalFingerprint` | tool | server/apps/platform-host/src/scripts/qualify-document-malware.ts | 246 |
| `principalFingerprint` | test | server/db/scripts/tests/integration/identity-replay-live.mjs | 454 |
| `principalFingerprint` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `principalFingerprint` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 16 |
| `principalFingerprint` | runtime | server/packages/contracts/auth/src/authorization.ts | 73 |
| `principalFingerprint` | test | server/packages/planes/mesh/src/business-partner-network-exchange.test.ts | 5 |
| `principalFingerprint` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3 |
| `principalFingerprint` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6 |
| `principalFingerprint` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7 |
| `principalFingerprint` | test | server/packages/planes/neon/src/finance-http.test.ts | 26 |
| `principalFingerprint` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 43 |
| `principalFingerprint` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 22 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/business-partner-evaluations.test.ts | 12 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/business-partner-insight-tools.test.ts | 14 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/review-fixture.ts | 15 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15 |
| `principalFingerprint` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 353 |
| `principalFingerprint` | test | server/packages/platform/control-admin/src/kysely-entitlement-repository.postgres.test.ts | 1096 |
| `principalFingerprint` | test | server/packages/platform/experience/src/service.test.ts | 16 |
| `principalFingerprint` | runtime | server/packages/platform/experience/src/service.ts | 1112 |
| `principalFingerprint` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `principalFingerprint` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `principalFingerprint` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 9 |
| `principalFingerprint` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10 |
| `principalFingerprint` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `principalFingerprint` | runtime | server/packages/platform/iam/src/iam-service.ts | 179 |
| `principalFingerprint` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 375 |
| `principalFingerprint` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `principalFingerprint` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `principalFingerprint` | test | server/packages/platform/search/src/__tests__/fixtures.ts | 1 |
| `principalFingerprint` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 87 |
| `principalFingerprint` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 121 |
| `principalFingerprint` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `principalFingerprint` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 36 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/canonical-read-backend.test.ts | 86 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/canonical-read-diagnostics.test.ts | 86 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/document-collection-read.test.ts | 35 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/entity-authorization.test.ts | 77 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/entity-backend-authorizer.test.ts | 44 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/entity-backend-isolated-execution.test.ts | 44 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/list-context-discovery.test.ts | 22 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 44, 134 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `principalFingerprint` | runtime | server/packages/services/records/src/entity-list-service.ts | 1521 |
| `principalFingerprint` | runtime | server/packages/services/records/src/query-service.ts | 441 |
| `principalFingerprint` | tool | tooling/scripts/verification/qualify-entity-authorization.mts | 78 |
| `profileHash` | runtime | governance/policy/reports/business-partner-activation-publication.dev.json | 4407 |
| `profileHash` | runtime | governance/policy/reports/business-partner-case-correction-decisions.dev.json | 16, 71 |
| `profileHash` | runtime | governance/policy/reports/business-partner-governed-import-decisions.dev.json | 16, 47 |
| `profileHash` | runtime | governance/policy/reports/business-partner-operation-decisions.dev.json | 16, 347 |
| `profileHash` | runtime | governance/policy/reviews/business-partner-canonical-v2-native-graph.dev.json | 2550, 2913 |
| `profileHash` | runtime | governance/policy/reviews/business-partner-canonical-v2-native-graph.pre-native-hash.dev.json | 2550, 2913 |
| `profileHash` | runtime | governance/policy/reviews/business-partner-canonical-v2-native.proposal.dev.json | 888 |
| `profileHash` | runtime | governance/policy/reviews/business-partner-canonical-v2-native.proposal.pre-native-hash.dev.json | 888 |
| `profileHash` | runtime | governance/policy/reviews/business-partner-enter-correction-runtime-workflow.dev.json | 55, 200, 255, 488, 543, 776, 831, 1064, 1119, 1352, 1407, 1642, 1697, 1931, 1986, 2222, 2277, 2514, 2569, 2806, 2861, 3098, 3153, 3397, 3452, 3689, 3744, 3981, 4036, 4273, 4328, 4586, 4641, 4842, 4897, 5131, 5186, 5420, 5475, 5709, 5764, 5998, 6053, 6287, 6342, 6576, 6631, 6865, 6920, 7161, 7216, 7450, 7505, 7739, 7794, 8035, 8090, 8322, 8377, 8608, 8663, 8897, 8952, 9188, 9243, 9479, 9534, 9754, 9809, 10029, 10084, 10303, 10358, 10577, 10632, 10853, 10908, 11143, 11198, 11438, 11493, 11730, 11785, 12022, 12077, 12314, 12369, 12606, 12661, 12894, 12949, 13171, 13226, 13448, 13503, 13725, 13780, 14025, 14080, 14322, 14377, 14618, 14673 |
| `profileHash` | runtime | governance/policy/reviews/business-partner-enter-correction.graph.dev.json | 2550, 3515, 5364, 6416 |
| `profileHash` | runtime | governance/policy/reviews/business-partner-enter-correction.pre-row-rekey.graph.dev.json | 2550, 3515, 5364, 6416 |
| `profileHash` | runtime | governance/policy/reviews/business-partner-release-19-workflow.dev.json | 59, 204, 402, 600, 798, 996, 1196, 1395, 1596, 1798, 2000, 2202, 2411, 2613, 2815, 3017, 3240, 3406, 3605, 3804, 4003, 4202, 4401, 4600, 4799, 5005, 5204, 5403, 5609, 5806, 6002, 6201, 6402, 6603, 6788, 6973, 7157, 7341, 7527, 7727, 7932, 8134, 8336, 8538, 8740, 8938, 9125, 9312, 9499, 9709, 9916, 10122 |
| `profileHash` | runtime | governance/policy/reviews/business-partner-release-20-workflow.dev.json | 57, 202, 257, 495, 550, 788, 843, 1081, 1136, 1374, 1429, 1669, 1724, 1963, 2018, 2259, 2314, 2556, 2611, 2853, 2908, 3150, 3205, 3454, 3509, 3751, 3806, 4048, 4103, 4345, 4400, 4663, 4718, 4924, 4979, 5218, 5273, 5512, 5567, 5806, 5861, 6100, 6155, 6394, 6449, 6688, 6743, 6982, 7037, 7283, 7338, 7577, 7632, 7871, 7926, 8172, 8227, 8464, 8519, 8755, 8810, 9049, 9104, 9345, 9400, 9641, 9696, 9921, 9976, 10201, 10256, 10480, 10535, 10759, 10814, 11040, 11095, 11335, 11390, 11635, 11690, 11932, 11987, 12229, 12284, 12526, 12581, 12823, 12878, 13116, 13171, 13398, 13453, 13680, 13735, 13962, 14017, 14267, 14322, 14569, 14624, 14870, 14925 |
| `profileHash` | runtime | governance/policy/reviews/business-partner-release-20-workflow.pre-head-correction.dev.json | 53, 198, 253, 491, 546, 784, 839, 1077, 1132, 1370, 1425, 1665, 1720, 1959, 2014, 2255, 2310, 2552, 2607, 2849, 2904, 3146, 3201, 3450, 3505, 3747, 3802, 4044, 4099, 4341, 4396, 4659, 4714, 4920, 4975, 5214, 5269, 5508, 5563, 5802, 5857, 6096, 6151, 6390, 6445, 6684, 6739, 6978, 7033, 7279, 7334, 7573, 7628, 7867, 7922, 8168, 8223, 8460, 8515, 8751, 8806, 9045, 9100, 9341, 9396, 9637, 9692, 9917, 9972, 10197, 10252, 10476, 10531, 10755, 10810, 11036, 11091, 11331, 11386, 11631, 11686, 11928, 11983, 12225, 12280, 12522, 12577, 12819, 12874, 13112, 13167, 13394, 13449, 13676, 13731, 13958, 14013, 14263, 14318, 14565, 14620, 14866, 14921 |
| `profileHash` | runtime | governance/policy/reviews/business-partner-reset-runtime.graph.dev.json | 2550, 3520, 5374, 6431 |
| `profileHash` | runtime | governance/policy/reviews/internal-bank-native-review-correction.graph.dev.json | 5118, 5450, 6146, 8784 |
| `profileHash` | runtime | governance/policy/reviews/internal-bank-native-review.graph.dev.json | 4951, 5283, 5890, 8361 |
| `profileHash` | test | packages/contracts/platform/ai/src/__tests__/business-context.test.ts | 36 |
| `profileHash` | runtime | packages/contracts/platform/authorization/src/index.ts | 2, 18 |
| `profileHash` | runtime | packages/contracts/platform/fixtures/authorization-snapshot.v1.json | 3 |
| `profileHash` | runtime | packages/contracts/platform/fixtures/platform-bootstrap.v1.json | 22 |
| `profileHash` | runtime | packages/platform/iam/governance-review/src/authenticated-operation-review.mjs | 138 |
| `profileHash` | runtime | packages/platform/iam/governance-review/src/authenticated-role-review.mjs | 107 |
| `profileHash` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/intent-feedback.mts | 141, 147 |
| `profileHash` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-inbox.mts | 156, 162 |
| `profileHash` | test | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/retrieval.mts | 126, 132 |
| `profileHash` | test | server/apps/platform-host/scripts/db-verification/tests/integration/governed-internal-business-partner-http.mjs | 134 |
| `profileHash` | test | server/apps/platform-host/src/composition/__tests__/ai-vertical.test.ts | 71, 81 |
| `profileHash` | test | server/apps/platform-host/src/composition/__tests__/atlas-entity-records-vertical.test.ts | 16 |
| `profileHash` | test | server/apps/platform-host/src/composition/__tests__/bp-list-insights.test.ts | 31, 38 |
| `profileHash` | test | server/apps/platform-host/src/composition/__tests__/business-partner-authorization-deployment.test.ts | 35 |
| `profileHash` | test | server/apps/platform-host/src/composition/__tests__/business-partner-authorization-shadow.test.ts | 24, 35, 40, 74, 96, 98, 141, 181, 183, 307, 594, 648 |
| `profileHash` | test | server/apps/platform-host/src/composition/__tests__/business-partner-company-native-authority.test.ts | 21 |
| `profileHash` | test | server/apps/platform-host/src/composition/__tests__/iam-api-review.test.ts | 41 |
| `profileHash` | test | server/apps/platform-host/src/composition/__tests__/master-data-vertical.test.ts | 40 |
| `profileHash` | test | server/apps/platform-host/src/composition/__tests__/meta-entity-authoring-authorizer.test.ts | 5 |
| `profileHash` | test | server/apps/platform-host/src/composition/__tests__/verification-routes.test.ts | 14 |
| `profileHash` | runtime | server/apps/platform-host/src/composition/business-partner-authorization-deployment.ts | 222 |
| `profileHash` | runtime | server/apps/platform-host/src/composition/business-partner-authorization-shadow.ts | 25, 69, 74, 104, 114, 229, 441 |
| `profileHash` | test | server/apps/platform-host/src/composition/business-partner-definition-authorizer.test.ts | 7, 9 |
| `profileHash` | runtime | server/apps/platform-host/src/composition/register-services.ts | 6122, 7494, 7503, 7510, 7511, 7512 |
| `profileHash` | runtime | server/apps/platform-host/src/composition/supplier-process-communications.ts | 78 |
| `profileHash` | runtime | server/apps/platform-host/src/composition/supplier-process-document-runtime.ts | 133 |
| `profileHash` | tool | server/apps/platform-host/src/scripts/qualify-document-infrastructure.ts | 148, 155 |
| `profileHash` | tool | server/apps/platform-host/src/scripts/qualify-document-malware.ts | 240, 247 |
| `profileHash` | tool | server/db/scripts/provisioning/business-partner-organization-identity.ts | 194 |
| `profileHash` | test | server/db/scripts/tests/integration/identity-replay-live.mjs | 455 |
| `profileHash` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `profileHash` | test | server/packages/contracts/ai/src/__tests__/business-context.test.ts | 36 |
| `profileHash` | runtime | server/packages/contracts/ai/src/replay.ts | 39 |
| `profileHash` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 17, 35 |
| `profileHash` | runtime | server/packages/contracts/auth/src/authorization.ts | 74, 92 |
| `profileHash` | test | server/packages/contracts/metadata/src/__tests__/entity-canonical-read-admission.test.ts | 18, 35, 148, 198 |
| `profileHash` | runtime | server/packages/contracts/metadata/src/entity-canonical-read-admission.ts | 9, 41, 48, 57, 58, 59 |
| `profileHash` | test | server/packages/planes/mesh/src/business-partner-network-exchange.test.ts | 5 |
| `profileHash` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3 |
| `profileHash` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6 |
| `profileHash` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7 |
| `profileHash` | test | server/packages/planes/neon/src/finance-http.test.ts | 18, 27 |
| `profileHash` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 37, 44 |
| `profileHash` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 16, 23 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 7, 8 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/business-context.test.ts | 12, 18, 167, 173 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/business-partner-case-tools.test.ts | 5 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/business-partner-evaluations.test.ts | 11, 12, 21, 43, 50, 159 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/business-partner-insight-tools.test.ts | 13, 14, 21, 40, 139 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/business-partner-list-insights.test.ts | 118, 312 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/durable-message-lineage.test.ts | 130, 227, 256 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/entity-section-tool.test.ts | 15, 48 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 8, 9 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/inference-reauthorization.test.ts | 134, 140 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/insight-disclosure.test.ts | 219 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/local-page-answer-budget.test.ts | 37 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/missing-scope-runtime.test.ts | 33, 66, 99, 129 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/retrieval-f5.test.ts | 103, 104 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/review-fixture.ts | 9, 14 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 6, 7 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 14, 15 |
| `profileHash` | runtime | server/packages/platform/ai/src/business-partner-insight-tools.ts | 35, 45 |
| `profileHash` | runtime | server/packages/platform/ai/src/business-partner-tools.ts | 34 |
| `profileHash` | runtime | server/packages/platform/ai/src/context.ts | 10, 16 |
| `profileHash` | runtime | server/packages/platform/ai/src/entity-record-tool.ts | 58 |
| `profileHash` | runtime | server/packages/platform/ai/src/entity-section-tool.ts | 25 |
| `profileHash` | runtime | server/packages/platform/ai/src/insight-reuse-policy.ts | 45 |
| `profileHash` | runtime | server/packages/platform/ai/src/knowledge.ts | 194 |
| `profileHash` | runtime | server/packages/platform/ai/src/kysely-tool-proposal-store.ts | 176 |
| `profileHash` | runtime | server/packages/platform/ai/src/message-lineage.ts | 45, 121 |
| `profileHash` | runtime | server/packages/platform/ai/src/record-data-gateway.ts | 40 |
| `profileHash` | runtime | server/packages/platform/ai/src/tool-service.ts | 81, 82, 85, 132, 141 |
| `profileHash` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 347, 354 |
| `profileHash` | test | server/packages/platform/control-admin/src/kysely-entitlement-repository.postgres.test.ts | 1091, 1097 |
| `profileHash` | test | server/packages/platform/experience/src/service.test.ts | 15, 16 |
| `profileHash` | runtime | server/packages/platform/experience/src/service.ts | 128, 1061, 1113 |
| `profileHash` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `profileHash` | test | server/packages/platform/iam/src/__tests__/authorization-golden-corpus.test.ts | 27 |
| `profileHash` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `profileHash` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 7, 10 |
| `profileHash` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 9, 10 |
| `profileHash` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `profileHash` | runtime | server/packages/platform/iam/src/iam-service.ts | 106, 114, 180, 202 |
| `profileHash` | runtime | server/packages/platform/iam/src/kysely-context-refresh.ts | 43 |
| `profileHash` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 299, 300, 364, 376 |
| `profileHash` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `profileHash` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `profileHash` | test | server/packages/platform/search/src/__tests__/fixtures.ts | 1 |
| `profileHash` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 87 |
| `profileHash` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 115, 122 |
| `profileHash` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `profileHash` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 36 |
| `profileHash` | test | server/packages/services/master-data/src/__tests__/business-partner-360-service.test.ts | 18 |
| `profileHash` | test | server/packages/services/master-data/src/__tests__/business-partner-case-service.test.ts | 28 |
| `profileHash` | test | server/packages/services/master-data/src/__tests__/business-partner-reveal-revocation.test.ts | 13, 20, 28, 60 |
| `profileHash` | test | server/packages/services/master-data/src/__tests__/governed-internal-business-partner-service.test.ts | 14 |
| `profileHash` | test | server/packages/services/master-data/src/__tests__/integration/governed-internal-business-partner-http.mjs | 132 |
| `profileHash` | test | server/packages/services/master-data/src/__tests__/supplier-workforce-command-guard.test.ts | 13 |
| `profileHash` | test | server/packages/services/master-data/src/__tests__/supplier-workforce-requisition-service.test.ts | 2 |
| `profileHash` | test | server/packages/services/master-data/src/__tests__/worker-engagement-iam-service.test.ts | 11 |
| `profileHash` | test | server/packages/services/master-data/src/__tests__/worker-engagement-lifecycle-service.test.ts | 22 |
| `profileHash` | runtime | server/packages/services/master-data/src/business-partner-360-service.ts | 719, 1631 |
| `profileHash` | test | server/packages/services/publication/src/__tests__/authenticated-entity-release-review.test.ts | 6 |
| `profileHash` | test | server/packages/services/publication/src/__tests__/canonical-read-catalog.test.ts | 14 |
| `profileHash` | test | server/packages/services/publication/src/__tests__/entity-authorization-compiler.test.ts | 598 |
| `profileHash` | test | server/packages/services/publication/src/__tests__/entity-authorization-publication-review.test.ts | 3 |
| `profileHash` | runtime | server/packages/services/publication/src/entity-authorization-compiler.ts | 41, 125 |
| `profileHash` | runtime | server/packages/services/publication/src/entity-authorization-publication-review.ts | 24 |
| `profileHash` | runtime | server/packages/services/publication/src/kysely-publication-authority-work.ts | 507 |
| `profileHash` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `profileHash` | test | server/packages/services/records/src/__tests__/canonical-read-backend.test.ts | 51, 80, 87, 113 |
| `profileHash` | test | server/packages/services/records/src/__tests__/canonical-read-diagnostics.test.ts | 51, 80, 87, 113 |
| `profileHash` | test | server/packages/services/records/src/__tests__/entity-authorization.test.ts | 70, 78, 389 |
| `profileHash` | test | server/packages/services/records/src/__tests__/entity-backend-authorizer.test.ts | 36, 42, 83, 522 |
| `profileHash` | test | server/packages/services/records/src/__tests__/entity-backend-isolated-execution.test.ts | 36, 42, 83 |
| `profileHash` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `profileHash` | test | server/packages/services/records/src/__tests__/list-context-discovery.test.ts | 16, 23 |
| `profileHash` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 43, 44 |
| `profileHash` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `profileHash` | runtime | server/packages/services/records/src/entity-authorization-rollout.ts | 24, 83, 93, 123 |
| `profileHash` | runtime | server/packages/services/records/src/entity-backend-authorizer.ts | 107, 161, 300, 347 |
| `profileHash` | runtime | server/packages/services/records/src/entity-list-service.ts | 1523 |
| `profileHash` | runtime | server/packages/services/records/src/query-service.ts | 443 |
| `profileHash` | runtime | server/packages/test-utils/src/index.ts | 15, 22 |
| `profileHash` | test | tests/contracts/api-client-transport.test.ts | 97 |
| `profileHash` | test | tests/contracts/frontend-spine-browser-contracts.test.ts | 21 |
| `profileHash` | tool | tooling/scripts/local-dev/graph-preview.integration.test.mts | 194, 308 |
| `profileHash` | tool | tooling/scripts/verification/attest-business-partner-shadow.mjs | 17, 23, 40, 53 |
| `profileHash` | tool | tooling/scripts/verification/capture-business-partner-causal-evidence.mjs | 23 |
| `profileHash` | tool | tooling/scripts/verification/capture-business-partner-enter-after-signing.mts | 76 |
| `profileHash` | tool | tooling/scripts/verification/capture-business-partner-enter-correction-exact-release.mts | 76 |
| `profileHash` | tool | tooling/scripts/verification/capture-business-partner-exact-release.mts | 15 |
| `profileHash` | tool | tooling/scripts/verification/capture-business-partner-reset-exact-release.mts | 76 |
| `profileHash` | tool | tooling/scripts/verification/capture-business-partner-v2-exact-release.mts | 76 |
| `profileHash` | tool | tooling/scripts/verification/entity-authorization/authenticated-operation-review.d.mts | 5 |
| `profileHash` | tool | tooling/scripts/verification/entity-authorization/authenticated-operation-review.test.mjs | 9 |
| `profileHash` | tool | tooling/scripts/verification/entity-authorization/authenticated-role-review.d.mts | 5 |
| `profileHash` | tool | tooling/scripts/verification/entity-authorization/authenticated-role-review.test.mjs | 10, 18 |
| `profileHash` | tool | tooling/scripts/verification/entity-authorization/publication-plan.mts | 501 |
| `profileHash` | tool | tooling/scripts/verification/isolated-enter/harness/host.mjs | 67 |
| `profileHash` | tool | tooling/scripts/verification/isolated-enter/prepare-artifacts.mjs | 49 |
| `profileHash` | tool | tooling/scripts/verification/isolated-execution/host.mjs | 34 |
| `profileHash` | tool | tooling/scripts/verification/isolated-successor/prepare-approved-execution.mjs | 74 |
| `profileHash` | tool | tooling/scripts/verification/prepare-business-partner-canonical-v2.mts | 63 |
| `profileHash` | tool | tooling/scripts/verification/qualify-business-partner-database-adapters.mts | 50, 63 |
| `profileHash` | tool | tooling/scripts/verification/qualify-entity-authorization.mts | 72, 79 |
| `profileHash` | tool | tooling/scripts/verification/qualify-supplier-onboarding-p9-minimum.mts | 49 |
| `profileHash` | tool | tooling/scripts/verification/qualify-supplier-process-submission-db.mts | 54 |
| `profileHash` | tool | tooling/scripts/verification/qualify-supplier-process-tasks-db.mts | 56 |
| `profileHash` | tool | tooling/scripts/verification/qualify-task-information-db.mts | 31 |
| `profileHash` | tool | tooling/scripts/verification/qualify-task-response-escalation-db.mts | 32 |
| `profileHash` | tool | tooling/scripts/verification/stage-business-partner-authorization-adapter.mjs | 133 |
| `profileHash` | tool | tooling/scripts/verification/stage-business-partner-v2-compiler.mjs | 133 |
| `required_permission` | tool | tooling/scripts/policy/authorization-inventory.ts | 1112, 1135 |
| `requiredPermission` | runtime | packages/contracts/platform/entity-list/src/parsers.ts | 507, 509, 510, 511 |
| `requiredPermission` | runtime | packages/contracts/platform/entity-list/src/types.ts | 165 |
| `requiredPermission` | runtime | server/packages/services/records/src/entity-list-service.ts | 1119, 1131 |
| `requiredPermission` | test | tests/contracts/entity-list-contract.test.ts | 118, 160 |
| `requiredPermission` | tool | tooling/scripts/policy/authorization-inventory.ts | 1135 |
| `requiredPermissions` | ui | apps/neon/lib/experience-runtime.tsx | 51, 60, 69, 90, 101, 112 |
| `requiredPermissions` | runtime | governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-publication-route-receipt.json | 8 |
| `requiredPermissions` | runtime | packages/planes/mesh/shell/src/navigation.ts | 11, 35 |
| `requiredPermissions` | runtime | packages/planes/neon/navigation/src/index.ts | 12 |
| `requiredPermissions` | runtime | packages/planes/studio/shell/src/navigation.ts | 12, 39, 47, 55, 63 |
| `requiredPermissions` | runtime | packages/platform/shell/shell-runtime/src/core.ts | 29, 51 |
| `requiredPermissions` | runtime | packages/platform/shell/shell/src/core.ts | 13, 97, 137 |
| `requiredPermissions` | runtime | packages/platform/shell/shell/src/home-personalization.ts | 9, 48, 60, 65 |
| `requiredPermissions` | runtime | server/packages/contracts/ai/src/tools.ts | 19 |
| `requiredPermissions` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 24, 33, 41 |
| `requiredPermissions` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 17 |
| `requiredPermissions` | runtime | server/packages/platform/ai/src/business-partner-case-tools.ts | 9 |
| `requiredPermissions` | runtime | server/packages/platform/ai/src/business-partner-insight-tools.ts | 19 |
| `requiredPermissions` | runtime | server/packages/platform/ai/src/business-partner-list-insights.ts | 75 |
| `requiredPermissions` | runtime | server/packages/platform/ai/src/business-partner-tools.ts | 24, 49 |
| `requiredPermissions` | runtime | server/packages/platform/ai/src/entity-record-tool.ts | 38 |
| `requiredPermissions` | runtime | server/packages/platform/ai/src/entity-section-tool.ts | 16 |
| `requiredPermissions` | runtime | server/packages/platform/ai/src/runtime-tool-coordinator.ts | 47 |
| `requiredPermissions` | runtime | server/packages/platform/ai/src/tool-service.ts | 60, 83, 106, 130, 190, 245 |
| `requiredPermissions` | test | tests/contracts/access-consumption-phase9.test.ts | 5, 31, 32 |
| `requiredPermissions` | test | tests/contracts/app-composition-phase10.test.ts | 24 |
| `requiredPermissions` | test | tests/contracts/first-business-module-readiness.test.ts | 12 |
| `requiredPermissions` | test | tests/contracts/home-personalization-phase3.test.ts | 26, 27, 34 |
| `requiredPermissions` | test | tests/contracts/shared-shell-navigation.test.ts | 19, 29, 39, 101, 111, 152, 249, 306, 320, 330 |
| `requiredPermissions` | test | tests/foundation/access-gates-phase9.test.tsx | 9 |
| `requiredPermissions` | test | tests/foundation/activity-center-interactions.test.tsx | 10 |
| `requiredPermissions` | test | tests/foundation/quick-access-interactions.test.tsx | 10 |
| `requiredPermissions` | tool | tooling/scripts/policy/verify-shared-shell-phase8.mjs | 12, 26 |
| `requiredPermissions` | tool | tooling/scripts/verification/capture-atlas-foundation-baseline.mjs | 101 |
| `requiredPermissions` | tool | tooling/scripts/verification/prepare-bp-ai-release.mjs | 35 |
| `requiredPermissions` | ui | tooling/scripts/verification/shell-browser-entry.tsx | 8 |
| `roleIds` | test | server/db/scripts/__tests__/provisioning/three-plane-provision.test.ts | 217, 227, 231 |
| `roleIds` | tool | server/db/scripts/checks/seeds/authorization-release-gates.ts | 121, 126 |
| `roleIds` | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 111, 117, 196, 198 |
| `roleIds` | tool | server/db/scripts/provisioning/three-plane-model.ts | 126 |
| `roleIds` | tool | server/db/scripts/seed/compile-final-authorization-seed-packs.ts | 80, 81, 82 |
| `roleIds` | tool | server/db/scripts/seed/tenant-authority-projection.ts | 24, 229, 272, 276, 285 |
| `roleIds` | runtime | server/db/seed/packs/authorization-v2/mesh/seed-pack.v1.json | 1163, 2011, 2035, 2059, 2083, 2107, 2131, 2155, 2179, 2203, 2227, 2251, 2275, 2299, 2323, 2347, 2371, 2395, 2419, 2443, 2467, 2491, 2515, 2539, 2563, 2587, 2611, 2635, 2659, 2683, 2707, 2731, 2755, 2779, 2803, 2827, 2851, 2875, 2899, 2923, 2947, 2971, 2995, 3019, 3043, 3067, 3091, 3115, 3139, 3163, 3187, 3211, 3235, 3259, 3283 |
| `roleIds` | runtime | server/db/seed/packs/authorization-v2/neon/seed-pack.v1.json | 773, 2979, 3003, 3027, 3051, 3075, 3099, 3123, 3147, 3171, 3195, 3219, 3243, 3267, 3291, 3315, 3339, 3363, 3387, 3411, 3435, 3459, 3483, 3507, 3531, 3555, 3579, 3603, 3627, 3651, 3675, 3699, 3723, 3747, 3771, 3795, 3819, 3843, 3867, 3891, 3915, 3939, 3963, 3987, 4011, 4035, 4059, 4083, 4107, 4131, 4155, 4179, 4203, 4227, 4251, 4275, 4299, 4323, 4347, 4371, 4395, 4419, 4443, 4467, 4491, 4515, 4539, 4563, 4587, 4611, 4635, 4659, 4683, 4707, 4731, 4755, 4779, 4803, 4827, 4851, 4875, 4899, 4923, 4947, 4971, 4995, 5019, 5043, 5067, 5091, 5115, 5139, 5163, 5187, 5211, 5235, 5259, 5283, 5307, 5331, 5355, 5379, 5403, 5427, 5451, 5475, 5499, 5523, 5547, 5571, 5595, 5619, 5643, 5667, 5691, 5715, 5739, 5763, 5787, 5811, 5835, 5859, 5883, 5907, 5931, 5955, 5979, 6003, 6027, 6051, 6075, 6099, 6123, 6147, 6171, 6195, 6219, 6243, 6267, 6291, 6315, 6339, 6363, 6387, 6411, 6435, 6459, 6483, 6507, 6531, 6555, 6579 |
| `roleIds` | runtime | server/db/seed/packs/authorization-v2/studio/seed-pack.v1.json | 796, 1280, 1304, 1328, 1352, 1376, 1400, 1424, 1448, 1472, 1496, 1520, 1544, 1568, 1592, 1616, 1640, 1664, 1688, 1712, 1736, 1760, 1784, 1808, 1832, 1856, 1880, 1904, 1928 |
| `roleIds` | tool | tooling/scripts/policy/authorization-inventory.ts | 896, 916 |
| `roleIds` | tool | tooling/tools/scripts/update-realm-neon.cjs | 94, 96 |

## Keycloak mapper inventory

| Source | JSON path | Name | Mapper | User attribute | Claim | Hardcoded role |
|---|---|---|---|---|---|---|
| deploy/config/iam/realm-athyper-clean-slate.json | clients.1.protocolMappers.0 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clients.10.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clients.11.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clients.12.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clients.13.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clients.3.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clients.5.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clients.6.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clients.8.protocolMappers.0 | locale | oidc-usermodel-attribute-mapper | locale | locale | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.0.protocolMappers.0 | role list | saml-role-list-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.1.protocolMappers.0 | Client ID | oidc-usersessionmodel-note-mapper | — | client_id | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.1.protocolMappers.1 | Client Host | oidc-usersessionmodel-note-mapper | — | clientHost | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.1.protocolMappers.2 | Client IP Address | oidc-usersessionmodel-note-mapper | — | clientAddress | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.10.protocolMappers.0 | allowed web origins | oidc-allowed-origins-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.11.protocolMappers.0 | client roles | oidc-usermodel-client-role-mapper | foo | resource_access.${client_id}.roles | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.11.protocolMappers.1 | realm roles | oidc-usermodel-realm-role-mapper | foo | realm_access.roles | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.11.protocolMappers.2 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.12.protocolMappers.0 | auth_time | oidc-usersessionmodel-note-mapper | — | auth_time | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.12.protocolMappers.1 | sub | oidc-sub-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.14.protocolMappers.0 | organization | saml-organization-membership-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.15.protocolMappers.0 | plane | oidc-hardcoded-claim-mapper | — | plane | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.15.protocolMappers.1 | realm_key | oidc-hardcoded-claim-mapper | — | realm_key | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.15.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.16.protocolMappers.0 | plane | oidc-hardcoded-claim-mapper | — | plane | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.16.protocolMappers.1 | realm_key | oidc-hardcoded-claim-mapper | — | realm_key | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.16.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.17.protocolMappers.0 | plane | oidc-hardcoded-claim-mapper | — | plane | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.17.protocolMappers.1 | realm_key | oidc-hardcoded-claim-mapper | — | realm_key | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.17.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.2.protocolMappers.0 | email verified | oidc-usermodel-property-mapper | emailVerified | email_verified | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.2.protocolMappers.1 | email | oidc-usermodel-attribute-mapper | email | email | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.3.protocolMappers.0 | phone number | oidc-usermodel-attribute-mapper | phoneNumber | phone_number | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.3.protocolMappers.1 | phone number verified | oidc-usermodel-attribute-mapper | phoneNumberVerified | phone_number_verified | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.4.protocolMappers.0 | groups | oidc-usermodel-realm-role-mapper | foo | groups | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.4.protocolMappers.1 | upn | oidc-usermodel-attribute-mapper | username | upn | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.5.protocolMappers.0 | acr loa level | oidc-acr-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.5.protocolMappers.1 | amr | oidc-amr-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.6.protocolMappers.0 | Athyper identity provider | oidc-usersessionmodel-note-mapper | — | athyper.identity_provider | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.6.protocolMappers.1 | Athyper external acr | oidc-usersessionmodel-note-mapper | — | athyper.external_acr | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.6.protocolMappers.2 | Athyper external amr | oidc-usersessionmodel-note-mapper | — | athyper.external_amr | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.6.protocolMappers.3 | Athyper SAML authentication context | oidc-usersessionmodel-note-mapper | — | athyper.saml_authn_context | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.6.protocolMappers.4 | Athyper MFA source | oidc-usersessionmodel-note-mapper | — | athyper.mfa_source | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.7.protocolMappers.0 | address | oidc-address-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.8.protocolMappers.0 | organization | oidc-organization-membership-mapper | — | organization | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.0 | given name | oidc-usermodel-attribute-mapper | firstName | given_name | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.1 | nickname | oidc-usermodel-attribute-mapper | nickname | nickname | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.10 | locale | oidc-usermodel-attribute-mapper | locale | locale | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.11 | family name | oidc-usermodel-attribute-mapper | lastName | family_name | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.12 | website | oidc-usermodel-attribute-mapper | website | website | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.13 | picture | oidc-usermodel-attribute-mapper | picture | picture | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.2 | birthdate | oidc-usermodel-attribute-mapper | birthdate | birthdate | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.3 | full name | oidc-full-name-mapper | — | — | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.4 | zoneinfo | oidc-usermodel-attribute-mapper | zoneinfo | zoneinfo | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.5 | username | oidc-usermodel-attribute-mapper | username | preferred_username | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.6 | gender | oidc-usermodel-attribute-mapper | gender | gender | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.7 | middle name | oidc-usermodel-attribute-mapper | middleName | middle_name | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.8 | profile | oidc-usermodel-attribute-mapper | profile | profile | — |
| deploy/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.9 | updated at | oidc-usermodel-attribute-mapper | updatedAt | updated_at | — |
| deploy/config/iam/realm-athyper.json | clients.1.protocolMappers.0 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clients.10.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clients.11.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clients.12.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clients.13.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clients.3.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clients.5.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clients.6.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clients.8.protocolMappers.0 | locale | oidc-usermodel-attribute-mapper | locale | locale | — |
| deploy/config/iam/realm-athyper.json | clientScopes.0.protocolMappers.0 | role list | saml-role-list-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clientScopes.1.protocolMappers.0 | Client ID | oidc-usersessionmodel-note-mapper | — | client_id | — |
| deploy/config/iam/realm-athyper.json | clientScopes.1.protocolMappers.1 | Client Host | oidc-usersessionmodel-note-mapper | — | clientHost | — |
| deploy/config/iam/realm-athyper.json | clientScopes.1.protocolMappers.2 | Client IP Address | oidc-usersessionmodel-note-mapper | — | clientAddress | — |
| deploy/config/iam/realm-athyper.json | clientScopes.10.protocolMappers.0 | allowed web origins | oidc-allowed-origins-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clientScopes.11.protocolMappers.0 | client roles | oidc-usermodel-client-role-mapper | foo | resource_access.${client_id}.roles | — |
| deploy/config/iam/realm-athyper.json | clientScopes.11.protocolMappers.1 | realm roles | oidc-usermodel-realm-role-mapper | foo | realm_access.roles | — |
| deploy/config/iam/realm-athyper.json | clientScopes.11.protocolMappers.2 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clientScopes.12.protocolMappers.0 | auth_time | oidc-usersessionmodel-note-mapper | — | auth_time | — |
| deploy/config/iam/realm-athyper.json | clientScopes.12.protocolMappers.1 | sub | oidc-sub-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clientScopes.14.protocolMappers.0 | organization | saml-organization-membership-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.0 | plane | oidc-hardcoded-claim-mapper | — | plane | — |
| deploy/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.1 | realm_key | oidc-hardcoded-claim-mapper | — | realm_key | — |
| deploy/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| deploy/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.0 | plane | oidc-hardcoded-claim-mapper | — | plane | — |
| deploy/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.1 | realm_key | oidc-hardcoded-claim-mapper | — | realm_key | — |
| deploy/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| deploy/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.0 | plane | oidc-hardcoded-claim-mapper | — | plane | — |
| deploy/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.1 | realm_key | oidc-hardcoded-claim-mapper | — | realm_key | — |
| deploy/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| deploy/config/iam/realm-athyper.json | clientScopes.2.protocolMappers.0 | email verified | oidc-usermodel-property-mapper | emailVerified | email_verified | — |
| deploy/config/iam/realm-athyper.json | clientScopes.2.protocolMappers.1 | email | oidc-usermodel-attribute-mapper | email | email | — |
| deploy/config/iam/realm-athyper.json | clientScopes.3.protocolMappers.0 | phone number | oidc-usermodel-attribute-mapper | phoneNumber | phone_number | — |
| deploy/config/iam/realm-athyper.json | clientScopes.3.protocolMappers.1 | phone number verified | oidc-usermodel-attribute-mapper | phoneNumberVerified | phone_number_verified | — |
| deploy/config/iam/realm-athyper.json | clientScopes.4.protocolMappers.0 | groups | oidc-usermodel-realm-role-mapper | foo | groups | — |
| deploy/config/iam/realm-athyper.json | clientScopes.4.protocolMappers.1 | upn | oidc-usermodel-attribute-mapper | username | upn | — |
| deploy/config/iam/realm-athyper.json | clientScopes.5.protocolMappers.0 | acr loa level | oidc-acr-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clientScopes.5.protocolMappers.1 | amr | oidc-amr-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clientScopes.6.protocolMappers.0 | Athyper identity provider | oidc-usersessionmodel-note-mapper | — | athyper.identity_provider | — |
| deploy/config/iam/realm-athyper.json | clientScopes.6.protocolMappers.1 | Athyper external acr | oidc-usersessionmodel-note-mapper | — | athyper.external_acr | — |
| deploy/config/iam/realm-athyper.json | clientScopes.6.protocolMappers.2 | Athyper external amr | oidc-usersessionmodel-note-mapper | — | athyper.external_amr | — |
| deploy/config/iam/realm-athyper.json | clientScopes.6.protocolMappers.3 | Athyper SAML authentication context | oidc-usersessionmodel-note-mapper | — | athyper.saml_authn_context | — |
| deploy/config/iam/realm-athyper.json | clientScopes.6.protocolMappers.4 | Athyper MFA source | oidc-usersessionmodel-note-mapper | — | athyper.mfa_source | — |
| deploy/config/iam/realm-athyper.json | clientScopes.7.protocolMappers.0 | address | oidc-address-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clientScopes.8.protocolMappers.0 | organization | oidc-organization-membership-mapper | — | organization | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.0 | given name | oidc-usermodel-attribute-mapper | firstName | given_name | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.1 | nickname | oidc-usermodel-attribute-mapper | nickname | nickname | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.10 | locale | oidc-usermodel-attribute-mapper | locale | locale | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.11 | family name | oidc-usermodel-attribute-mapper | lastName | family_name | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.12 | website | oidc-usermodel-attribute-mapper | website | website | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.13 | picture | oidc-usermodel-attribute-mapper | picture | picture | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.2 | birthdate | oidc-usermodel-attribute-mapper | birthdate | birthdate | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.3 | full name | oidc-full-name-mapper | — | — | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.4 | zoneinfo | oidc-usermodel-attribute-mapper | zoneinfo | zoneinfo | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.5 | username | oidc-usermodel-attribute-mapper | username | preferred_username | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.6 | gender | oidc-usermodel-attribute-mapper | gender | gender | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.7 | middle name | oidc-usermodel-attribute-mapper | middleName | middle_name | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.8 | profile | oidc-usermodel-attribute-mapper | profile | profile | — |
| deploy/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.9 | updated at | oidc-usermodel-attribute-mapper | updatedAt | updated_at | — |
| deploy/config/iam/realm-athyper.json | identityProviderMappers.0 | NEON_USER | oidc-hardcoded-role-idp-mapper | — | — | NEON_USER |
| deploy/config/iam/realm-athyper.json | identityProviderMappers.1 | AUTHORIZED | oidc-hardcoded-role-idp-mapper | — | — | neon-web.AUTHORIZED |
| deploy/config/iam/realm-athyper.json | identityProviderMappers.2 | NEON_USER | oidc-hardcoded-role-idp-mapper | — | — | NEON_USER |
| deploy/config/iam/realm-athyper.json | identityProviderMappers.3 | AUTHORIZED | oidc-hardcoded-role-idp-mapper | — | — | neon-web.AUTHORIZED |
| deploy/config/iam/realm-athyper.json | identityProviderMappers.4 | NEON_USER | oidc-hardcoded-role-idp-mapper | — | — | NEON_USER |
| deploy/config/iam/realm-athyper.json | identityProviderMappers.5 | AUTHORIZED | oidc-hardcoded-role-idp-mapper | — | — | neon-web.AUTHORIZED |
| deploy/config/iam/realm-athyper.json | identityProviderMappers.6 | github-avatar | hardcoded-attribute-idp-mapper | — | — | — |
| deploy/config/iam/realm-platform-control-clean-slate.json | clientScopes.0.protocolMappers.0 | allowed web origins | oidc-allowed-origins-mapper | — | — | — |
| deploy/config/iam/realm-platform-control-clean-slate.json | clientScopes.1.protocolMappers.0 | realm roles | oidc-usermodel-realm-role-mapper | foo | realm_access.roles | — |
| deploy/config/iam/realm-platform-control-clean-slate.json | clientScopes.1.protocolMappers.1 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| deploy/config/iam/realm-platform-control-clean-slate.json | clientScopes.1.protocolMappers.2 | client roles | oidc-usermodel-client-role-mapper | foo | resource_access.${client_id}.roles | — |
| deploy/config/iam/realm-platform-control-clean-slate.json | clientScopes.2.protocolMappers.0 | email verified | oidc-usermodel-property-mapper | emailVerified | email_verified | — |
| deploy/config/iam/realm-platform-control-clean-slate.json | clientScopes.2.protocolMappers.1 | email | oidc-usermodel-attribute-mapper | email | email | — |
| deploy/config/iam/realm-platform-control-clean-slate.json | clientScopes.3.protocolMappers.0 | full name | oidc-full-name-mapper | — | — | — |
| deploy/config/iam/realm-platform-control-clean-slate.json | clientScopes.3.protocolMappers.1 | username | oidc-usermodel-attribute-mapper | username | preferred_username | — |
| deploy/config/iam/realm-platform-control-clean-slate.json | clientScopes.4.protocolMappers.0 | acr loa level | oidc-acr-mapper | — | — | — |
| deploy/config/iam/realm-platform-control-clean-slate.json | clientScopes.5.protocolMappers.0 | sub | oidc-sub-mapper | — | — | — |
| deploy/config/iam/realm-platform-control-clean-slate.json | clientScopes.5.protocolMappers.1 | auth_time | oidc-usersessionmodel-note-mapper | — | auth_time | — |
| deploy/config/iam/realm-platform-control.json | clientScopes.0.protocolMappers.0 | allowed web origins | oidc-allowed-origins-mapper | — | — | — |
| deploy/config/iam/realm-platform-control.json | clientScopes.1.protocolMappers.0 | realm roles | oidc-usermodel-realm-role-mapper | foo | realm_access.roles | — |
| deploy/config/iam/realm-platform-control.json | clientScopes.1.protocolMappers.1 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| deploy/config/iam/realm-platform-control.json | clientScopes.1.protocolMappers.2 | client roles | oidc-usermodel-client-role-mapper | foo | resource_access.${client_id}.roles | — |
| deploy/config/iam/realm-platform-control.json | clientScopes.2.protocolMappers.0 | email verified | oidc-usermodel-property-mapper | emailVerified | email_verified | — |
| deploy/config/iam/realm-platform-control.json | clientScopes.2.protocolMappers.1 | email | oidc-usermodel-attribute-mapper | email | email | — |
| deploy/config/iam/realm-platform-control.json | clientScopes.3.protocolMappers.0 | full name | oidc-full-name-mapper | — | — | — |
| deploy/config/iam/realm-platform-control.json | clientScopes.3.protocolMappers.1 | username | oidc-usermodel-attribute-mapper | username | preferred_username | — |
| deploy/config/iam/realm-platform-control.json | clientScopes.4.protocolMappers.0 | acr loa level | oidc-acr-mapper | — | — | — |
| deploy/config/iam/realm-platform-control.json | clientScopes.5.protocolMappers.0 | sub | oidc-sub-mapper | — | — | — |
| deploy/config/iam/realm-platform-control.json | clientScopes.5.protocolMappers.1 | auth_time | oidc-usersessionmodel-note-mapper | — | auth_time | — |

## Generated authorization artifacts

| Artifact | Generator | Owner | Present | Generator present |
|---|---|---|---:|---:|
| deploy/config/iam/realm-athyper-demosetup.json | tooling/tools/scripts/generate-athyper-demo-iam.cjs | platform-iam | yes | yes |
| deploy/config/iam/realm-athyper.json | tooling/tools/scripts/prepare-keycloak-realm-import.cjs | platform-iam | yes | yes |
| deploy/config/iam/realm-platform-control-demosetup.json | tooling/tools/scripts/generate-athyper-demo-iam.cjs | platform-iam | yes | yes |
| deploy/config/iam/realm-platform-control.json | tooling/tools/scripts/prepare-keycloak-realm-import.cjs | platform-iam | yes | yes |
| server/db/prisma/schema.mesh.prisma | server/db/prisma/prisma-pull.mjs --target=mesh --schema prisma/schema.mesh.prisma | database-platform | yes | yes |
| server/db/prisma/schema.neon.prisma | server/db/prisma/prisma-pull.mjs --target=neon --schema prisma/schema.neon.prisma | database-platform | yes | yes |
| server/db/prisma/schema.studio.prisma | server/db/prisma/prisma-pull.mjs --target=studio --schema prisma/schema.studio.prisma | database-platform | yes | yes |

## Classification contract

- SQL and Kysely access is classified as define, read, reference, insert, update, delete, truncate, execute, or generated mirror.
- Authorization-object discovery uses exact qualified identities. Bare words such as `role`, `group`, and `policy` are not discovery signals; `master.pay_group`, `control.tax_group`, and posting-role accounting tables are therefore not IAM authorities.
- A structurally strong unregistered authorization object, an unreviewed runtime security symbol, or an unknown permission code in a permission-check context is emitted as an open gate.
- Dynamic SQL must be represented by an exact reviewed source entry; it is not silently allowlisted.
- Generated files are projections and must name an existing generator.
- Each plane in `captureSourceObjectIds` must match the exact relation set seeded by its `contract.captureSourceDdls` entry in both directions; moving a source between Neon and Mesh is an explicit cross-plane gate failure.
- Keycloak Admin REST writes are classified by exact source path plus the discovered HTTP-method/resource operation set; new or removed capabilities are gate failures.
- Machine-readable recomputation: `pnpm exec tsx tooling/scripts/policy/verify-authorization-inventory.ts --check --json --structural-only`. `structuralPassed` excludes owned known source and boundary anomalies; `strictPassed` includes them.
- JSON verification fields: `artifactDriftFailures`, `structuralGateFailures`, `knownAnomalyFailures`, `gateCounts`, `structuralPassed`, and `strictPassed`.
