# Wave 0 authorization source inventory

> Generated deterministically by `scripts/policy/authorization-inventory.ts` from the reviewed exact-object registry. Edit the registry or scanner, then regenerate; do not hand-edit this report.

Registry SHA-256: `7ff88dfec14af9d43ad0c7036634b5fd11aa44f40a900f196cd1fb2c9be35700`
Files scanned / authorization-bearing: 3115 / 712
Registered authorization objects: 463
Aggregated object references: 1394
Writer references: 118
Contract/UI field references: 892
Permission definitions / uses: 0 / 0
Authorization-bearing routes: 0
Keycloak mappers: 145
Canonical capture sources: 0 (neon=0, mesh=0)
Keycloak REST writer paths: 10
Open gate findings: 534

## Gate status

| Gate | Findings |
|---|---:|
| Unknown authorization sources | 163 |
| Unknown authorization writers | 2 |
| Unowned objects | 0 |
| Unclassified writers | 0 |
| Missing source definitions | 135 |
| Generated artifact failures | 38 |
| Unknown capture sources | 2 |
| Stale capture-source registrations | 74 |
| Duplicate capture sources | 0 |
| Cross-plane capture-source drift | 74 |
| Unknown Keycloak REST writers | 0 |
| Stale Keycloak REST writer rules | 1 |
| Known source anomalies blocking strict certification | 29 |
| Zero-Mesh-specific-data Neon boundary findings | 16 |

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
| authorization.group | `master.auth_group` | neon | authorization | platform-iam | studio, neon | replace_additively | 1 | 7 | 3 |
| authorization.group_member | `master.auth_group_member` | neon | authorization | platform-iam | studio, neon | replace_additively | 0 | 7 | 1 |
| authorization.group_role | `master.auth_group_role` | neon | authorization | platform-iam | studio, neon | replace_additively | 0 | 7 | 1 |
| catalog.enterprise_feature | `shared.enterprise_feature` | neon_and_mesh_legacy | entitlement_catalog | platform-catalog | studio, neon, mesh | replace_with_feature_catalog | 0 | 2 | 0 |
| catalog.module | `shared.module` | neon_and_mesh_legacy | entitlement_catalog | platform-catalog | studio, neon, mesh | keep_neon_reference_only_in_mesh | 0 | 7 | 0 |
| catalog.subscription_plan | `shared.subscription_plan` | neon_and_mesh_legacy | entitlement_catalog | commercial-platform | neon | keep_neon | 0 | 6 | 0 |
| catalog.subscription_plan_version | `shared.subscription_plan_version` | neon_and_mesh_legacy | entitlement_catalog | commercial-platform | neon | keep_neon | 0 | 2 | 0 |
| catalog.workspace | `shared.workspace` | neon_and_mesh_legacy | entitlement_catalog | platform-catalog | studio, neon, mesh | keep_neon_reference_only_in_mesh | 0 | 6 | 1 |
| compiled.entity | `snapshot.entity_compiled` | neon | authorization_projection | metadata-platform | studio, neon | regenerate | 0 | 0 | 0 |
| context.company_code | `master.company_code` | neon | authorization_scope | finance-platform | neon | keep_as_non_granting_scope_source | 1 | 138 | 14 |
| context.legal_entity | `master.legal_entity` | neon | authorization_scope | organization-platform | neon | keep_as_non_granting_scope_source | 1 | 46 | 10 |
| context.operating_organization | `master.operating_organization` | neon | authorization_scope | organization-platform | neon | keep_as_non_granting_scope_source | 1 | 41 | 7 |
| context.operating_organization_company | `master.operating_organization_company` | neon | authorization_scope | organization-platform | neon | keep_as_non_granting_scope_membership | 0 | 1 | 1 |
| context.principal_relationship | `master.principal_relationship` | neon | context_only | platform-iam | studio, neon | keep_non_authorizing | 0 | 2 | 0 |
| context.team | `master.team` | neon | context_only | organization-platform | neon | keep_non_authorizing | 1 | 33 | 0 |
| context.team_member | `master.team_member` | neon | context_only | organization-platform | neon | keep_non_authorizing | 1 | 27 | 0 |
| context.tenant_relationship | `master.tenant_relationship` | neon | context_only | platform-iam | studio, neon | keep_non_authorizing | 1 | 27 | 0 |
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
| identity.principal | `master.principal` | neon | identity | platform-iam | studio, neon | keep | 1 | 184 | 20 |
| identity.principal_binding | `master.principal_identity_binding` | neon | identity_binding | platform-iam | studio, neon | keep | 1 | 43 | 12 |
| identity.principal_profile | `master.principal_profile` | neon | identity_profile | platform-iam | studio, neon | remove_duplicate_idp_fields | 1 | 29 | 5 |
| identity.tenant | `master.tenant` | neon | identity | platform-iam | studio, neon | keep | 1 | 234 | 17 |
| identity.tenant_domain | `master.tenant_identity_domain` | neon | authentication_configuration | platform-iam | studio, neon | keep | 0 | 2 | 0 |
| identity.tenant_provider | `master.tenant_identity_provider` | neon | authentication_configuration | platform-iam | studio, neon | keep | 0 | 2 | 0 |
| legacy.access_grant | `master.access_grant` | neon | legacy_authorization | platform-iam | studio, neon, mesh | split_into_role_scope_override_acl | 0 | 4 | 0 |
| legacy.attachment_acl | `master.attachment_acl` | neon | record_acl | document-platform | neon | merge_into_auth_record_acl | 0 | 3 | 0 |
| legacy.business_network | `master.business_network` | neon | legacy_mesh_context | mesh-platform | mesh, neon | remove_from_neon | 0 | 4 | 0 |
| legacy.business_network_membership | `master.business_network_membership` | neon | legacy_mesh_authorization | mesh-platform | mesh, neon | remove_from_neon | 0 | 3 | 0 |
| legacy.business_network_membership_role | `master.business_network_membership_role` | neon | legacy_mesh_authorization | mesh-platform | mesh, neon | remove_from_neon | 0 | 3 | 0 |
| legacy.company_code_access | `master.company_code_access` | neon | legacy_scope | platform-iam | neon | remove | 0 | 5 | 0 |
| legacy.content_item_access_grant | `master.content_item_access_grant` | neon | record_acl | content-platform | neon | merge_into_auth_record_acl | 0 | 5 | 0 |
| legacy.delegation_grant | `master.delegation_grant` | neon | delegation | platform-iam | neon | normalize | 0 | 5 | 0 |
| legacy.group_feature_grant | `master.group_feature_grant` | neon | legacy_entitlement | platform-iam | neon | remove | 0 | 3 | 0 |
| legacy.permission | `shared.permission` | neon_and_mesh_legacy | permission_catalog | platform-iam | studio, neon, mesh | move_to_control_auth_permission | 0 | 5 | 0 |
| legacy.permission_category | `shared.permission_category` | neon_and_mesh_legacy | permission_catalog | platform-iam | studio, neon, mesh | move_to_control_auth_permission | 0 | 3 | 0 |
| legacy.permission_scope_policy | `shared.permission_scope_policy` | neon_and_mesh_legacy | scope | platform-iam | neon | move_to_control_scope_policy | 0 | 3 | 0 |
| legacy.persona | `shared.persona` | neon_and_mesh_legacy | legacy_authorization | platform-iam | studio, neon, mesh | remove | 0 | 5 | 0 |
| legacy.persona_permission | `shared.persona_permission` | neon_and_mesh_legacy | legacy_authorization | platform-iam | studio, neon, mesh | remove | 0 | 5 | 0 |
| legacy.plan_feature_access | `shared.plan_feature_access` | neon_and_mesh_legacy | entitlement | commercial-platform | neon | replace_with_plan_version_feature_access | 0 | 3 | 0 |
| legacy.plan_module_access | `shared.plan_module_access` | neon_and_mesh_legacy | entitlement | commercial-platform | neon | replace_with_plan_version_module_access | 0 | 4 | 0 |
| legacy.plan_permission_access | `shared.plan_permission_access` | neon_and_mesh_legacy | entitlement | commercial-platform | neon | remove_permission_level_entitlement | 0 | 3 | 0 |
| legacy.principal_feature_grant | `master.principal_feature_grant` | neon | legacy_entitlement | platform-iam | neon | remove | 0 | 3 | 0 |
| legacy.principal_persona | `master.principal_persona` | neon | legacy_authorization | platform-iam | studio, neon | remove | 0 | 4 | 0 |
| legacy.role | `shared.role` | neon_and_mesh_legacy | legacy_authorization | platform-iam | studio, neon, mesh | replace_with_tenant_plane_role | 0 | 3 | 0 |
| legacy.tenant_admin_grant | `master.tenant_admin_grant` | neon | legacy_plane_admission | platform-iam | studio | replace_with_auth_plane_membership | 0 | 3 | 0 |
| legacy.tenant_feature_entitlement | `master.tenant_feature_entitlement` | neon | entitlement | commercial-platform | neon | replace_with_tenant_entitlement | 0 | 5 | 0 |
| legacy.tenant_module_subscription | `master.tenant_module_subscription` | neon | entitlement | commercial-platform | neon | replace_with_tenant_entitlement | 0 | 6 | 0 |
| legacy.tenant_permission_override | `master.tenant_permission_override` | neon | entitlement_override | commercial-platform | neon | replace_with_feature_entitlement_override | 0 | 3 | 0 |
| mesh.account | `mesh.network_account` | mesh | plane_membership_context | mesh-platform | mesh | keep_mesh_only | 1 | 43 | 5 |
| mesh.account_grant | `mesh.account_grant` | mesh | legacy_authorization | mesh-platform | mesh | replace_with_mesh_local_role_group_model | 0 | 6 | 0 |
| mesh.attachment_acl | `mesh.attachment_acl` | mesh | record_acl | mesh-platform | mesh | normalize_mesh_locally | 0 | 2 | 0 |
| mesh.audit.access_decision | `mesh_log.access_decision_log` | mesh | decision_evidence | mesh-platform | mesh | retain | 0 | 0 | 0 |
| mesh.audit.access_decision.default_partition | `mesh_log.access_decision_log_default` | mesh | decision_evidence_partition | mesh-platform | mesh | retain_with_parent | 0 | 0 | 0 |
| mesh.audit.attachment_access | `mesh_log.attachment_access_log` | mesh | decision_evidence | mesh-platform | mesh | retain | 0 | 0 | 0 |
| mesh.audit.attachment_access.default_partition | `mesh_log.attachment_access_log_default` | mesh | decision_evidence_partition | mesh-platform | mesh | retain_with_parent | 0 | 0 | 0 |
| mesh.audit.security_event | `mesh_log.security_event_log` | mesh | audit | mesh-platform | mesh | retain | 0 | 0 | 0 |
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
| mesh.capture.source_registry | `mesh_control.authorization_capture_source` | mesh | authorization_change_capture | mesh-platform | mesh | retain_through_mesh_migration_observation | 0 | 2 | 1 |
| mesh.capture.transaction | `mesh_log.authorization_change_transaction` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 0 | 0 | 0 |
| mesh.capture.writer_registry | `mesh_control.authorization_writer_registry` | mesh | authorization_change_capture | mesh-platform | mesh | retain_through_mesh_migration_observation | 0 | 0 | 0 |
| mesh.capture.writer_view | `mesh_log.v_authorization_writer_telemetry` | mesh | authorization_change_capture | mesh-platform | mesh | recreate_from_mesh_capture_evidence | 0 | 0 | 0 |
| mesh.content_access_grant | `mesh.content_item_access_grant` | mesh | record_acl | mesh-platform | mesh | normalize_mesh_locally | 0 | 2 | 0 |
| mesh.conversation_participant | `mesh.conversation_participant` | mesh | conversation_acl | mesh-platform | mesh | keep_mesh_local_authorization_source | 0 | 1 | 0 |
| mesh.function.grant_fingerprint | `mesh.fn_account_grant_fingerprint` | mesh | authorization_cache | mesh-platform | mesh | replace_with_authorization_fingerprint | 0 | 0 | 0 |
| mesh.function.grant_revoke | `mesh.fn_account_grant_revoke_hook` | mesh | authorization_change_hook | mesh-platform | mesh | replace_with_mesh_local_change_capture | 0 | 0 | 0 |
| mesh.identity.binding | `mesh.principal_identity_binding` | mesh | identity_binding | mesh-platform | mesh | keep_mesh_only | 0 | 6 | 0 |
| mesh.identity.principal | `mesh.principal` | mesh | identity | mesh-platform | mesh | keep_mesh_only | 0 | 6 | 0 |
| mesh.relationship | `mesh.network_relationship` | mesh | context_only | mesh-platform | mesh | keep_non_authorizing | 1 | 40 | 8 |
| mesh.rollout.feature_flag | `mesh_control.feature_flag` | mesh | rollout_control | mesh-platform | mesh | keep_mesh_only | 0 | 0 | 0 |
| metadata.entity | `control.entity` | neon | authorization_metadata | metadata-platform | studio, neon | keep_canonical_entity_identity | 0 | 8 | 1 |
| metadata.entity_action_rule | `control.entity_action_rule` | neon | authorization_metadata | metadata-platform | studio, neon | replace_permission_code_with_permission_id | 0 | 3 | 0 |
| metadata.entity_field | `control.entity_field` | neon | field_authorization_metadata | metadata-platform | studio, neon | normalize_security_references | 0 | 1 | 0 |
| metadata.entity_flow | `control.entity_flow` | neon | authorization_metadata | metadata-platform | studio, neon | normalize_permission_references | 0 | 4 | 0 |
| metadata.entity_flow_step | `control.entity_flow_step` | neon | authorization_metadata | metadata-platform | studio, neon | normalize_permission_references | 0 | 3 | 0 |
| metadata.entity_lifecycle | `control.entity_lifecycle` | neon | authorization_metadata | workflow-platform | neon | keep_canonical_entity_lifecycle_binding | 0 | 3 | 0 |
| metadata.entity_lifecycle_state_mask | `control.entity_lifecycle_state_mask` | neon | authorization_guard | workflow-platform | neon | normalize_as_non_granting_state_capability_guard | 0 | 1 | 0 |
| metadata.entity_operation | `control.entity_operation` | neon | authorization_metadata | metadata-platform | studio, neon | replace_permission_code_with_permission_id | 0 | 8 | 0 |
| metadata.entity_policy | `control.entity_policy` | neon | resource_policy | policy-platform | neon | keep_as_non_granting_guard | 0 | 3 | 4 |
| metadata.entity_relation | `control.entity_relation` | neon | authorization_metadata | metadata-platform | studio, neon | normalize_permission_references | 0 | 3 | 0 |
| metadata.entity_surface | `control.entity_surface` | neon | authorization_metadata | metadata-platform | studio, neon | normalize_permission_references | 0 | 3 | 0 |
| metadata.entity_version | `control.entity_version` | neon | authorization_metadata | metadata-platform | studio, neon | keep_canonical_versioned_contract | 0 | 5 | 1 |
| metadata.entity_version_contract | `control.entity_version_contract` | neon | authorization_metadata | metadata-platform | studio, neon | keep_canonical_contract | 0 | 0 | 0 |
| metadata.field_security_policy | `control.field_security_policy` | neon | field_authorization | policy-platform | neon | normalize_permission_references | 0 | 4 | 1 |
| metadata.lifecycle | `control.lifecycle` | neon | authorization_metadata | workflow-platform | neon | keep_as_non_granting_workflow_context | 0 | 2 | 0 |
| metadata.lifecycle_state | `control.lifecycle_state` | neon | authorization_metadata | workflow-platform | neon | keep_as_non_granting_workflow_context | 0 | 1 | 0 |
| metadata.lifecycle_transition | `control.lifecycle_transition` | neon | authorization_metadata | workflow-platform | neon | bind_exact_permission_id | 0 | 3 | 0 |
| metadata.lifecycle_transition_gate | `control.lifecycle_transition_gate` | neon | authorization_guard | workflow-platform | neon | normalize_as_non_granting_transition_guard | 0 | 1 | 0 |
| metadata.permission_alias | `control.permission_alias` | neon | compatibility | platform-iam | studio, neon | remove_after_shadow | 0 | 3 | 0 |
| migration.anomaly_disposition | `control.authorization_anomaly_disposition` | neon_and_mesh_migration | migration_control | platform-iam | studio, neon, mesh | retain_as_migration_evidence | 0 | 2 | 0 |
| migration.capture_clock | `event.authorization_capture_clock` | neon_and_mesh_migration | durable_source_watermark | platform-iam | studio, neon, mesh | retain_until_all_consumers_retired | 0 | 2 | 0 |
| migration.capture_source | `control.authorization_capture_source` | neon_and_mesh_migration | migration_control | platform-iam | studio, neon, mesh | retain_through_authorization_cutover_and_observation | 0 | 3 | 1 |
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
| support.session | `ai.atlas_support_session` | neon | delegated_support_access | ai-platform | studio | keep_bounded_by_new_evaluator | 0 | 5 | 0 |
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
| wave1.mesh.table.mesh_control.auth_permission | `mesh_control.auth_permission` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh_control.auth_permission_category | `mesh_control.auth_permission_category` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.auth_permission_plane | `mesh_control.auth_permission_plane` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh_control.auth_permission_scope_policy | `mesh_control.auth_permission_scope_policy` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.auth_plane | `mesh_control.auth_plane` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.authorization_v2_conservation_ledger | `mesh_control.authorization_v2_conservation_ledger` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh_control.authorization_v2_deferred_constraint_registry | `mesh_control.authorization_v2_deferred_constraint_registry` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh_control.authorization_v2_expand_installation | `mesh_control.authorization_v2_expand_installation` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh_control.authorization_v2_frozen_legacy_object | `mesh_control.authorization_v2_frozen_legacy_object` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh_control.authorization_v2_transformer_registry | `mesh_control.authorization_v2_transformer_registry` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh_control.entity | `mesh_control.entity` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh_control.entity_operation | `mesh_control.entity_operation` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 3 | 0 |
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
| wave1.mesh.table.mesh.auth_delegation | `mesh.auth_delegation` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 2 | 0 |
| wave1.mesh.table.mesh.auth_delegation_permission | `mesh.auth_delegation_permission` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_delegation_permission_scope | `mesh.auth_delegation_permission_scope` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_deny_rule | `mesh.auth_deny_rule` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh.auth_deny_rule_group | `mesh.auth_deny_rule_group` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_deny_rule_hard_policy | `mesh.auth_deny_rule_hard_policy` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_deny_rule_principal | `mesh.auth_deny_rule_principal` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_group_member_v2 | `mesh.auth_group_member_v2` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_group_role_v2 | `mesh.auth_group_role_v2` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_group_v2 | `mesh.auth_group_v2` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_override | `mesh.auth_override` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh.auth_permission_set | `mesh.auth_permission_set` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_permission_set_rule | `mesh.auth_permission_set_rule` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_plane_membership | `mesh.auth_plane_membership` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 3 | 0 |
| wave1.mesh.table.mesh.auth_record_acl | `mesh.auth_record_acl` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 2 | 0 |
| wave1.mesh.table.mesh.auth_record_acl_permission | `mesh.auth_record_acl_permission` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.table.mesh.auth_role | `mesh.auth_role` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_role_compilation | `mesh.auth_role_compilation` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_role_permission | `mesh.auth_role_permission` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_role_permission_set | `mesh.auth_role_permission_set` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.table.mesh.auth_scope_account | `mesh.auth_scope_account` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 2 | 0 |
| wave1.mesh.table.mesh.auth_scope_network_relationship | `mesh.auth_scope_network_relationship` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 2 | 0 |
| wave1.mesh.table.mesh.auth_scope_resource | `mesh.auth_scope_resource` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 2 | 0 |
| wave1.mesh.table.mesh.auth_scope_target | `mesh.auth_scope_target` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh_control.v_authorization_v2_operation_publication | `mesh_control.v_authorization_v2_operation_publication` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh_log.v_auth_decision_evidence_v2 | `mesh_log.v_auth_decision_evidence_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh_log.v_authorization_invalidation_health_v2 | `mesh_log.v_authorization_invalidation_health_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh_log.v_authorization_migration_readiness_v2 | `mesh_log.v_authorization_migration_readiness_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh_log.v_authorization_replay_health_v2 | `mesh_log.v_authorization_replay_health_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh.auth_authority_readiness_v | `mesh.auth_authority_readiness_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh.auth_current_delegation_permission_scope_v | `mesh.auth_current_delegation_permission_scope_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh.auth_current_group_member_v | `mesh.auth_current_group_member_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.view.mesh.auth_current_group_role_v | `mesh.auth_current_group_role_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.view.mesh.auth_current_plane_membership_v | `mesh.auth_current_plane_membership_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.mesh.view.mesh.auth_plane_membership_legacy_compare_v | `mesh.auth_plane_membership_legacy_compare_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.mesh.view.mesh.auth_published_role_permission_v | `mesh.auth_published_role_permission_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 0 | 1 | 0 |
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
| wave1.neon.table.control.auth_permission | `control.auth_permission` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 6 | 0 |
| wave1.neon.table.control.auth_permission_plane | `control.auth_permission_plane` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.control.auth_permission_scope_policy | `control.auth_permission_scope_policy` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.control.auth_plane | `control.auth_plane` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.control.authorization_v2_conservation_ledger | `control.authorization_v2_conservation_ledger` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.control.authorization_v2_deferred_constraint_registry | `control.authorization_v2_deferred_constraint_registry` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 2 | 0 |
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
| wave1.neon.table.master.auth_delegation | `master.auth_delegation` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.master.auth_delegation_permission | `master.auth_delegation_permission` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_delegation_permission_scope | `master.auth_delegation_permission_scope` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_deny_rule | `master.auth_deny_rule` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.master.auth_deny_rule_group | `master.auth_deny_rule_group` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_deny_rule_hard_policy | `master.auth_deny_rule_hard_policy` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_deny_rule_principal | `master.auth_deny_rule_principal` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_group_member_v2 | `master.auth_group_member_v2` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.master.auth_group_role_v2 | `master.auth_group_role_v2` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.master.auth_group_v2 | `master.auth_group_v2` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.master.auth_override | `master.auth_override` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.master.auth_permission_set | `master.auth_permission_set` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_permission_set_rule | `master.auth_permission_set_rule` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_plane_membership | `master.auth_plane_membership` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 3 | 1 |
| wave1.neon.table.master.auth_record_acl | `master.auth_record_acl` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.master.auth_record_acl_permission | `master.auth_record_acl_permission` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.table.master.auth_role | `master.auth_role` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 5 | 1 |
| wave1.neon.table.master.auth_role_compilation | `master.auth_role_compilation` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_role_permission | `master.auth_role_permission` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 3 | 1 |
| wave1.neon.table.master.auth_role_permission_set | `master.auth_role_permission_set` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_scope_company | `master.auth_scope_company` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_scope_legal_entity | `master.auth_scope_legal_entity` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_scope_operating_organization | `master.auth_scope_operating_organization` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.auth_scope_target | `master.auth_scope_target` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 6 | 1 |
| wave1.neon.table.master.auth_scope_tenant | `master.auth_scope_tenant` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.master.tenant_entitlement_override | `master.tenant_entitlement_override` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.table.shared.auth_permission_category | `shared.auth_permission_category` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.view.control.v_authorization_v2_deferred_constraints | `control.v_authorization_v2_deferred_constraints` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 2 | 0 |
| wave1.neon.view.control.v_authorization_v2_operation_publication | `control.v_authorization_v2_operation_publication` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.view.event.v_authorization_invalidation_health_v2 | `event.v_authorization_invalidation_health_v2` | neon | authorization_v2_runtime | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.view.event.v_authorization_replay_health_v2 | `event.v_authorization_replay_health_v2` | neon | authorization_migration_control | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave1.neon.view.master.auth_current_delegation_permission_scope_v | `master.auth_current_delegation_permission_scope_v` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.view.master.auth_current_group_member_v | `master.auth_current_group_member_v` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.view.master.auth_current_group_role_v | `master.auth_current_group_role_v` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.view.master.auth_current_plane_membership_v | `master.auth_current_plane_membership_v` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.view.master.auth_published_role_permission_v | `master.auth_published_role_permission_v` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 1 | 0 |
| wave1.neon.view.master.auth_scope_target_resolved_v | `master.auth_scope_target_resolved_v` | neon | canonical_authorization_authority | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave2.mesh.table.mesh_control.auth_catalog_reference_v2 | `mesh_control.auth_catalog_reference_v2` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 0 | 0 | 0 |
| wave2.mesh.table.mesh_control.auth_permission_alias_v2 | `mesh_control.auth_permission_alias_v2` | mesh | authorization_migration_control | mesh-platform | mesh | remove_after_certified_catalog_cutover | 0 | 1 | 0 |
| wave2.neon.table.control.auth_catalog_reference_v2 | `control.auth_catalog_reference_v2` | neon | canonical_authorization_catalog | platform-iam | studio, neon | promote_after_certified_cutover | 0 | 0 | 0 |
| wave2.neon.table.control.auth_permission_alias_v2 | `control.auth_permission_alias_v2` | neon | authorization_migration_control | platform-iam | studio, neon | remove_after_certified_catalog_cutover | 0 | 1 | 0 |
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
| wave4.neon.table.control.auth_admin_entitlement_policy | `control.auth_admin_entitlement_policy` | neon | canonical_entitlement_policy | platform-iam | studio | promote_after_certified_cutover | 0 | 1 | 0 |
| wave4.neon.table.control.auth_entitlement_target_policy | `control.auth_entitlement_target_policy` | neon | canonical_entitlement_policy | platform-iam | neon | promote_after_certified_cutover | 0 | 3 | 0 |
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
| trigger | `audit.authorization_decision_evidence.trg_authorization_decision_05_prepare` | unclassified | — | requires_review | server/db/ddl/common/audit/08_triggers.sql:37 | — |
| trigger | `audit.authorization_decision_evidence.trg_authorization_decision_immutable` | unclassified | — | requires_review | server/db/ddl/common/audit/08_triggers.sql:41 | — |
| function | `audit.trg_prepare_audit_log` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/audit/07_functions.sql:117 | `master.principal` |
| function | `audit.trg_prepare_authorization_decision` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/audit/07_functions.sql:603 | `master.principal` |
| function | `audit.trg_prepare_security_event` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/audit/07_functions.sql:659 | `master.principal` |
| trigger | `authz.delegation_grant.trg_delegation_grant_10_validate` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:278 | — |
| trigger | `authz.delegation_grant.trg_delegation_grant_20_parent_guard` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:282 | — |
| trigger | `authz.delegation.trg_delegation_10_normalize` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:241 | — |
| trigger | `authz.delegation.trg_delegation_20_identity_guard` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:247 | — |
| trigger | `authz.delegation.trg_delegation_21_natural_key_guard` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:251 | — |
| trigger | `authz.delegation.trg_delegation_30_active_subject` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:255 | — |
| trigger | `authz.delegation.trg_delegation_35_audit_evidence` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:392 | — |
| trigger | `authz.delegation.trg_delegation_40_status_transition` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:261 | — |
| trigger | `authz.delegation.trg_delegation_50_status_changed` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:270 | — |
| trigger | `authz.delegation.trg_delegation_60_updated_at` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:274 | — |
| trigger | `authz.delegation.trg_delegation_90_delete_guard` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:437 | — |
| function | `authz.fn_internal_permission_is_assignable_at_scope` | unclassified | — | requires_review | server/db/ddl/common/authz/07_functions.sql:390 | — |
| function | `authz.fn_permission_is_assignable_at_scope` | unclassified | — | requires_review | server/db/ddl/common/authz/07_functions.sql:424 | — |
| function | `authz.fn_reconcile_expired_authority` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:1318 | `master.principal` |
| function | `authz.fn_stage_application_projection` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:1414 | `master.tenant` |
| trigger | `authz.permission_scope_kind.trg_permission_scope_kind_50_updated_at` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:23 | — |
| trigger | `authz.permission.trg_permission_10_normalize` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:2 | — |
| trigger | `authz.permission.trg_permission_20_definition_guard` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:7 | — |
| trigger | `authz.permission.trg_permission_30_status_transition` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:11 | — |
| trigger | `authz.permission.trg_permission_35_audit_evidence` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:360 | — |
| trigger | `authz.permission.trg_permission_40_status_changed` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:15 | — |
| trigger | `authz.permission.trg_permission_50_updated_at` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:19 | — |
| trigger | `authz.permission.trg_permission_90_delete_guard` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:405 | — |
| trigger | `authz.record_acl.trg_record_acl_10_normalize` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:322 | — |
| trigger | `authz.record_acl.trg_record_acl_20_identity_guard` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:327 | — |
| trigger | `authz.record_acl.trg_record_acl_21_natural_key_guard` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:331 | — |
| trigger | `authz.record_acl.trg_record_acl_30_validate_permission` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:335 | — |
| trigger | `authz.record_acl.trg_record_acl_31_active_subject` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:340 | — |
| trigger | `authz.record_acl.trg_record_acl_35_audit_evidence` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:400 | — |
| trigger | `authz.record_acl.trg_record_acl_40_status_transition` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:347 | — |
| trigger | `authz.record_acl.trg_record_acl_50_status_changed` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:351 | — |
| trigger | `authz.record_acl.trg_record_acl_60_updated_at` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:355 | — |
| trigger | `authz.record_acl.trg_record_acl_90_delete_guard` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:445 | — |
| trigger | `authz.role_permission.trg_role_permission_10_identity_guard` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:113 | — |
| trigger | `authz.role_permission.trg_role_permission_20_parent_guard` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:117 | — |
| trigger | `authz.role_permission.trg_role_permission_50_updated_at` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:121 | — |
| function | `authz.trg_guard_delegation_grant` | unclassified | — | requires_review | server/db/ddl/common/authz/07_functions.sql:952 | — |
| function | `authz.trg_guard_permission_definition` | unclassified | — | requires_review | server/db/ddl/common/authz/07_functions.sql:200 | — |
| function | `authz.trg_guard_role_permission` | unclassified | — | requires_review | server/db/ddl/common/authz/07_functions.sql:536 | — |
| function | `authz.trg_validate_active_subject` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:841 | `master.principal`<br>`master.tenant` |
| function | `authz.trg_validate_delegation_activation` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:992 | `master.principal` |
| function | `authz.trg_validate_group_member` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/authz/07_functions.sql:704 | `master.principal` |
| function | `authz.trg_validate_permission_publish` | unclassified | — | requires_review | server/db/ddl/common/authz/07_functions.sql:244 | — |
| function | `control.fn_provision_external_workforce_exchange` | structural_dependency | mesh-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/control/07_functions.sql:695 | `master.principal`<br>`mesh.network_account` |
| function | `control.fn_provision_external_workforce_exchange` | structural_dependency | mesh-platform+platform-iam | review_with_registered_dependency | server/db/migrations/20260830_mesh_external_workforce_exchange.sql:70 | `master.principal`<br>`mesh.network_account` |
| function | `control.fn_validate_owner_type_target` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/control/07_functions.sql:1 | `master.tenant` |
| function | `control.fn_validate_owner_type_target` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/control/07_functions.sql:1 | `master.tenant` |
| function | `control.fn_validate_owner_type_target` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/control/07_functions.sql:1 | `master.tenant` |
| function | `control.generate_fiscal_periods` | structural_dependency | finance-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/control/07_functions.sql:3541 | `master.company_code`<br>`master.principal` |
| function | `control.trg_guard_mesh_business_partner_profile_projection` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/migrations/20260828_neon_mesh_business_partner_profile_projection.sql:19 | `master.principal`<br>`master.tenant` |
| function | `control.trg_validate_decision_scope` | structural_dependency | finance-platform+organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/control/07_functions.sql:826 | `master.company_code`<br>`master.operating_organization` |
| function | `control.trg_validate_decision_scope` | structural_dependency | finance-platform+organization-platform | review_with_registered_dependency | server/db/migrations/20260903_neon_business_partner_integrity_hardening.sql:199 | `master.company_code`<br>`master.operating_organization` |
| function | `document.fn_business_partner_request_approvers` | structural_dependency | finance-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/document/07_functions.sql:3941 | `master.company_code`<br>`master.operating_organization`<br>`master.principal` |
| function | `document.fn_business_partner_request_approvers` | structural_dependency | finance-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/migrations/20260828_neon_business_partner_workflow_resolver.sql:9 | `master.company_code`<br>`master.operating_organization`<br>`master.principal` |
| function | `document.fn_workflow_sla_due_tenants` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/document/07_functions.sql:22 | `master.tenant` |
| function | `document.fn_workforce_request_approvers` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/document/07_functions.sql:3144 | `master.principal` |
| function | `document.fn_workforce_request_approvers` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/migrations/20260902_neon_workforce_request_lifecycle.sql:41 | `master.principal` |
| function | `document.trg_guard_business_partner_request_payload_boundary` | structural_dependency | finance-platform+platform-iam | review_with_registered_dependency | server/db/migrations/20260830_neon_business_partner_typed_request_extensions.sql:47 | `master.company_code`<br>`master.principal` |
| function | `document.trg_guard_supplier_activation_evidence` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/migrations/20260829_neon_supplier_readiness_lifecycle.sql:23 | `master.principal` |
| trigger | `event.authorization_invalidation_outbox.trg_authorization_invalidation_immutable` | unclassified | — | requires_review | server/db/ddl/common/event/08_triggers.sql:69 | — |
| trigger | `event.authorization_invalidation_outbox.trg_authorization_invalidation_notify` | unclassified | — | requires_review | server/db/ddl/common/event/08_triggers.sql:96 | — |
| function | `event.fn_authorization_bump_epoch` | unclassified | — | requires_review | server/db/ddl/common/event/07_functions.sql:118 | — |
| function | `event.fn_authorization_claim_invalidations` | unclassified | — | requires_review | server/db/ddl/common/event/07_functions.sql:212 | — |
| function | `event.fn_authorization_complete_invalidation` | unclassified | — | requires_review | server/db/ddl/common/event/07_functions.sql:236 | — |
| function | `event.fn_authorization_emit_invalidation` | unclassified | — | requires_review | server/db/ddl/common/event/07_functions.sql:171 | — |
| function | `event.fn_authorization_fail_invalidation` | unclassified | — | requires_review | server/db/ddl/common/event/07_functions.sql:248 | — |
| function | `event.fn_notification_worker_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/common/event/07_functions.sql:326 | `master.principal` |
| function | `event.fn_notification_worker_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/migrations/20260828_notification_worker_principal_tenant_guard.sql:4 | `master.principal` |
| function | `event.fn_notification_worker_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/migrations/20260828_notification_worker_principal.sql:4 | `master.principal` |
| function | `event.trg_authorization_invalidation_immutable` | unclassified | — | requires_review | server/db/ddl/common/event/08_triggers.sql:50 | — |
| function | `event.trg_capture_authorization_invalidation` | unclassified | — | requires_review | server/db/ddl/common/authz/08_triggers.sql:457 | — |
| trigger | `master.company_code.trg_company_code_identity_immutable` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:359 | `master.company_code` |
| trigger | `master.company_code.trg_company_code_status_changed` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:361 | `master.company_code` |
| trigger | `master.company_code.trg_company_code_updated_at` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:363 | `master.company_code` |
| function | `master.fn_resolve_dimension_set` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:1291 | `master.company_code` |
| function | `master.fn_resolve_principal_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:854 | `master.principal`<br>`master.principal_identity_binding` |
| function | `master.fn_resolve_principal_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:861 | `master.principal`<br>`master.principal_identity_binding` |
| function | `master.fn_resolve_principal_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:892 | `master.principal`<br>`master.principal_identity_binding` |
| trigger | `master.legal_entity.trg_legal_entity_hierarchy_cycle` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:353 | `master.legal_entity` |
| trigger | `master.legal_entity.trg_legal_entity_identity_immutable` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:347 | `master.legal_entity` |
| trigger | `master.legal_entity.trg_legal_entity_status_changed` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:349 | `master.legal_entity` |
| trigger | `master.legal_entity.trg_legal_entity_updated_at` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:351 | `master.legal_entity` |
| trigger | `master.legal_entity.wave6_legal_entity_amendment` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1553 | `master.legal_entity` |
| trigger | `master.legal_entity.wave6_legal_entity_lifecycle` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1551 | `master.legal_entity` |
| trigger | `master.legal_entity.wave6_legal_entity_scope` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1557 | `master.legal_entity` |
| view | `master.mv_company_postable_account` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/09_views.sql:26 | `master.company_code` |
| view | `master.mv_company_postable_account` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/seed-backup/tenants/neon/010_demo/100_org_structure/199_gl_preseed.sql:26 | `master.company_code` |
| trigger | `master.operating_organization.trg_operating_organization_hierarchy_cycle` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:379 | `master.operating_organization` |
| trigger | `master.operating_organization.trg_operating_organization_hierarchy_cycle` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/migrations/20260818_neon_operating_organization_hardening.sql:281 | `master.operating_organization` |
| trigger | `master.operating_organization.trg_operating_organization_identity_immutable` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:373 | `master.operating_organization` |
| trigger | `master.operating_organization.trg_operating_organization_status_changed` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:375 | `master.operating_organization` |
| trigger | `master.operating_organization.trg_operating_organization_updated_at` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:377 | `master.operating_organization` |
| trigger | `master.operating_organization.wave6_operating_organization_amendment` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1554 | `master.operating_organization` |
| trigger | `master.operating_organization.wave6_operating_organization_lifecycle` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1552 | `master.operating_organization` |
| trigger | `master.operating_organization.wave6_operating_organization_scope` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/08_triggers.sql:1558 | `master.operating_organization` |
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
| function | `master.seed_condition_type_catalog` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:2793 | `master.principal` |
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
| function | `master.trg_assert_active_person_business_partner` | structural_dependency | organization-platform+platform-iam | review_with_registered_dependency | server/db/migrations/20260829_neon_person_workforce_onboarding.sql:19 | `master.legal_entity`<br>`master.principal` |
| function | `master.trg_guard_principal_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:649 | `master.principal` |
| function | `master.trg_guard_principal_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:656 | `master.principal` |
| function | `master.trg_guard_principal_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:687 | `master.principal` |
| function | `master.trg_guard_principal_identity_binding` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:747 | `master.principal_identity_binding` |
| function | `master.trg_guard_principal_identity_binding` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:754 | `master.principal_identity_binding` |
| function | `master.trg_guard_principal_identity_binding` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:785 | `master.principal_identity_binding` |
| function | `master.trg_guard_team_identity` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:489 | `master.team` |
| function | `master.trg_guard_team_identity` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:496 | `master.team` |
| function | `master.trg_guard_team_identity` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:527 | `master.team` |
| function | `master.trg_guard_team_member` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:524 | `master.team_member` |
| function | `master.trg_guard_team_member` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:531 | `master.team_member` |
| function | `master.trg_guard_team_member` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:562 | `master.team_member` |
| function | `master.trg_guard_tenant_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:1 | `master.tenant` |
| function | `master.trg_guard_tenant_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:1 | `master.tenant` |
| function | `master.trg_guard_tenant_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:39 | `master.tenant` |
| function | `master.trg_guard_tenant_relationship_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:164 | `master.tenant_relationship` |
| function | `master.trg_guard_tenant_relationship_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:169 | `master.tenant_relationship` |
| function | `master.trg_guard_tenant_relationship_identity` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:202 | `master.tenant_relationship` |
| function | `master.trg_normalize_principal_identity_binding` | unclassified | — | requires_review | server/db/ddl/planes/mesh/master/07_functions.sql:729 | — |
| function | `master.trg_normalize_principal_identity_binding` | unclassified | — | requires_review | server/db/ddl/planes/neon/master/07_functions.sql:736 | — |
| function | `master.trg_normalize_principal_identity_binding` | unclassified | — | requires_review | server/db/ddl/planes/studio/master/07_functions.sql:767 | — |
| function | `master.trg_reject_person_business_partner_legacy_link_mutation` | structural_dependency | finance-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/migrations/20260902_neon_business_partner_organization_boundary.sql:107 | `master.company_code`<br>`master.legal_entity`<br>`master.principal`<br>`master.tenant` |
| function | `master.trg_sync_organization_scope_target` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:4853 | `master.tenant` |
| function | `master.trg_validate_business_partner_role` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:3752 | `master.operating_organization` |
| function | `master.trg_validate_employment_contract` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:4000 | `master.company_code` |
| function | `master.trg_validate_employment_contract` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/migrations/20260829_neon_workforce_effective_range_hardening.sql:87 | `master.company_code` |
| function | `master.trg_validate_identity_binding_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/master/07_functions.sql:768 | `master.principal` |
| function | `master.trg_validate_identity_binding_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:775 | `master.principal` |
| function | `master.trg_validate_identity_binding_principal` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/master/07_functions.sql:806 | `master.principal` |
| function | `master.trg_validate_operating_organization_profile` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:1043 | `master.operating_organization` |
| function | `master.trg_validate_operating_organization_profile` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/migrations/20260818_neon_operating_organization_hardening.sql:218 | `master.operating_organization` |
| function | `master.trg_validate_partner_profile_references` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/planes/neon/master/07_functions.sql:3204 | `master.company_code` |
| function | `master.trg_validate_partner_profile_references` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/migrations/20260903_neon_business_partner_integrity_hardening.sql:190 | `master.company_code` |
| function | `mesh.catalog_is_visible` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:217 | `mesh.network_relationship` |
| function | `mesh.catalog_price_is_visible` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:315 | `mesh.network_relationship` |
| function | `mesh.command_document_envelope_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql:1060 | `mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.command_document_envelope_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql:1061 | `mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.command_network_account_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql:544 | `mesh.network_account` |
| function | `mesh.command_network_account_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql:545 | `mesh.network_account` |
| function | `mesh.command_network_relationship_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql:708 | `mesh.network_relationship` |
| function | `mesh.command_network_relationship_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql:709 | `mesh.network_relationship` |
| function | `mesh.command_request_network_relationship` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql:613 | `mesh.network_relationship` |
| function | `mesh.command_request_network_relationship` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql:614 | `mesh.network_relationship` |
| function | `mesh.fn_catalog_publication_snapshot` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql:267 | `mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.fn_catalog_publication_snapshot` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql:268 | `mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.fn_upsert_network_scope` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:884 | `master.tenant` |
| trigger | `mesh.network_account.trg_network_account_command_authority` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql:1163 | `mesh.network_account` |
| trigger | `mesh.network_account.trg_network_account_command_authority` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql:1164 | `mesh.network_account` |
| trigger | `mesh.network_account.trg_network_account_identity_coordinates_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql:1166 | `mesh.network_account` |
| trigger | `mesh.network_account.trg_network_account_identity_coordinates_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql:1167 | `mesh.network_account` |
| trigger | `mesh.network_account.trg_network_account_status_changed` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:42 | `mesh.network_account` |
| trigger | `mesh.network_account.wave6_network_account_event` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:259 | `mesh.network_account` |
| trigger | `mesh.network_account.wave6_network_account_event` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql:1156 | `mesh.network_account` |
| trigger | `mesh.network_account.wave6_network_account_event` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql:1157 | `mesh.network_account` |
| trigger | `mesh.network_account.wave6_network_account_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:257 | `mesh.network_account` |
| trigger | `mesh.network_account.wave6_network_account_scope` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:261 | `mesh.network_account` |
| trigger | `mesh.network_relationship.trg_network_relationship_command_authority` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql:1169 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.trg_network_relationship_command_authority` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql:1170 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.trg_network_relationship_identity_coordinates_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql:1172 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.trg_network_relationship_identity_coordinates_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql:1173 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.trg_network_relationship_status_changed` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:46 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.wave6_network_relationship_event` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:260 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.wave6_network_relationship_event` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql:1159 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.wave6_network_relationship_event` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql:1160 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.wave6_network_relationship_lifecycle` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:258 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.wave6_network_relationship_scopes` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/08_triggers.sql:262 | `mesh.network_relationship` |
| function | `mesh.trg_guard_network_identity_coordinates` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql:424 | `mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.trg_guard_network_identity_coordinates` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql:425 | `mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.trg_sync_network_account_scope` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:903 | `mesh.network_account` |
| function | `mesh.trg_sync_network_relationship_scopes` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:913 | `mesh.network_relationship` |
| function | `mesh.trg_validate_bank_disclosure` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:731 | `mesh.network_relationship` |
| function | `mesh.trg_validate_catalog_audience` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:127 | `mesh.network_relationship` |
| function | `mesh.trg_validate_catalog_owner` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:78 | `mesh.network_account` |
| function | `mesh.trg_validate_catalog_price` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:159 | `mesh.network_relationship` |
| function | `mesh.trg_validate_document_envelope` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:350 | `mesh.network_relationship` |
| function | `mesh.trg_validate_profile_trade_role` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/planes/mesh/mesh/07_functions.sql:630 | `mesh.network_account` |
| trigger | `metadata.entity_operation_permission.trg_entity_operation_permission_10_graph_guard` | unclassified | — | requires_review | server/db/ddl/planes/studio/metadata/08_triggers.sql:181 | — |
| trigger | `metadata.entity_operation_permission.trg_entity_operation_permission_20_binding` | unclassified | — | requires_review | server/db/ddl/planes/studio/metadata/08_triggers.sql:182 | — |
| trigger | `metadata.entity_operation_permission.trg_entity_operation_permission_90_updated_at` | unclassified | — | requires_review | server/db/ddl/planes/studio/metadata/08_triggers.sql:188 | — |
| function | `onboarding.fn_create_case_with_target` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/planes/studio/onboarding/07_functions.sql:6 | `master.principal` |
| trigger | `ops.authorization_operation_cutover_drill.authorization_operation_cutover_drill_immutable` | unclassified | — | requires_review | server/db/ddl/common/ops/08_triggers.sql:9 | — |
| trigger | `ops.authorization_operation_rollout.authorization_operation_rollout_guard` | unclassified | — | requires_review | server/db/ddl/common/ops/08_triggers.sql:5 | — |
| trigger | `ops.authorization_parity_certification.authorization_parity_certification_immutable` | unclassified | — | requires_review | server/db/ddl/common/ops/08_triggers.sql:1 | — |
| trigger | `ops.authorization_shadow_comparison.authorization_shadow_comparison_immutable` | unclassified | — | requires_review | server/db/ddl/common/ops/08_triggers.sql:12 | — |
| function | `ops.certify_authorization_operation_parity` | unclassified | — | requires_review | server/db/ddl/common/ops/07_functions.sql:1 | — |
| function | `ops.set_authorization_operation_rollout` | unclassified | — | requires_review | server/db/ddl/common/ops/07_functions.sql:36 | — |
| function | `ops.trg_guard_authorization_operation_cutover_drill` | unclassified | — | requires_review | server/db/ddl/common/ops/07_functions.sql:89 | — |
| function | `ops.trg_guard_authorization_parity_certification` | unclassified | — | requires_review | server/db/ddl/common/ops/07_functions.sql:76 | — |
| function | `ops.trg_guard_authorization_rollout_write` | unclassified | — | requires_review | server/db/ddl/common/ops/07_functions.sql:81 | — |
| function | `ops.trg_guard_authorization_shadow_comparison` | unclassified | — | requires_review | server/db/ddl/common/ops/07_functions.sql:94 | — |
| trigger | `runtime_meta.authorization_epoch.trg_authorization_epoch_coordinates_immutable` | unclassified | — | requires_review | server/db/ddl/common/event/08_triggers.sql:46 | — |
| function | `runtime_meta.trg_authorization_epoch_coordinates_immutable` | unclassified | — | requires_review | server/db/ddl/common/event/07_functions.sql:107 | — |
| function | `snapshot.trg_reject_network_profile_publication_mutation` | structural_dependency | mesh-platform+platform-iam | review_with_registered_dependency | server/db/migrations/20260828_mesh_business_partner_profile_publication.sql:18 | `master.principal`<br>`mesh.network_account`<br>`mesh.network_relationship` |

## Runtime authorization reader and evaluator symbols

| Symbol | Classification | Artifact class | Path | Lines |
|---|---|---|---|---|
| `authorizeAdmin` | unclassified | runtime | server/packages/platform/ai/src/atlas-experience-routes.ts | 10 |
| `authorizeDescriptorOperation` | unclassified | runtime | server/packages/services/records/src/transfer/transfer-service.ts | 67, 84, 94, 101, 140, 159, 225, 242, 270, 314 |
| `authorizeImportMode` | unclassified | runtime | server/packages/services/records/src/transfer/transfer-service.ts | 68, 84, 94, 141, 160, 225, 315 |
| `authorizeRecordListRead` | unclassified | test | server/packages/services/records/src/__tests__/record-read-access.test.ts | 19 |
| `authorizeRecordListRead` | unclassified | runtime | server/packages/services/records/src/entity-list-service.ts | 28 |
| `authorizeRecordListRead` | unclassified | runtime | server/packages/services/records/src/query-service.ts | 37 |
| `authorizeRecordListRead` | unclassified | runtime | server/packages/services/records/src/record-read-access.ts | 5 |
| `checkAnyPermission` | reviewed | tool | scripts/policy/authorization-inventory.ts | 911 |
| `checkPermission` | reviewed | tool | scripts/policy/authorization-inventory.ts | 894, 911 |
| `getEffectiveModuleAccess` | reviewed | tool | scripts/policy/authorization-inventory.ts | 681 |
| `requireAllow` | reviewed | tool | scripts/policy/authorization-inventory.ts | 911 |
| `requireCatalogPermission` | unclassified | tool | server/db/scripts/provisioning/provision-cirrusatlantic-demo-authorization.ts | 54, 109 |
| `requirePermission` | unclassified | runtime | server/packages/platform/collaboration/src/collaboration-service.ts | 26, 39, 51, 58, 59, 60, 61, 62, 63, 73 |
| `requirePermission` | unclassified | runtime | server/packages/platform/control-admin/src/authorization-management-service.ts | 8, 85 |
| `requirePermission` | unclassified | runtime | server/packages/platform/control-admin/src/cycle/cycle-config-service.ts | 17, 34, 45, 123 |
| `requirePermission` | unclassified | runtime | server/packages/services/documents/src/document-service.ts | 29, 34, 80, 120 |
| `requirePermission` | unclassified | runtime | server/packages/services/finance/src/planning/planning-service.ts | 8, 9, 14, 15, 24 |
| `requirePermission` | unclassified | runtime | server/packages/services/master-data/src/services.ts | 46, 60, 70, 79, 93, 102, 103, 104, 124 |
| `requirePermission` | unclassified | runtime | server/packages/services/publication/src/publication-routes.ts | 37, 46, 54, 62, 72, 81, 90, 107, 123, 136 |
| `resolveAccessibleCompany` | reviewed | tool | scripts/policy/authorization-inventory.ts | 681 |
| `resolveAccessScope` | reviewed | tool | scripts/policy/authorization-inventory.ts | 681 |
| `resolveCurrentAuthEpoch` | reviewed | tool | scripts/policy/authorization-inventory.ts | 681 |

## Unknown source findings

| Type | Identity | Path | Lines |
|---|---|---|---|
| database_object | `audit.authorization_decision_evidence.trg_authorization_decision_05_prepare` | server/db/ddl/common/audit/08_triggers.sql | 37 |
| database_object | `audit.authorization_decision_evidence.trg_authorization_decision_immutable` | server/db/ddl/common/audit/08_triggers.sql | 41 |
| database_object | `authz.fn_internal_permission_is_assignable_at_scope` | server/db/ddl/common/authz/07_functions.sql | 390 |
| database_object | `authz.fn_permission_is_assignable_at_scope` | server/db/ddl/common/authz/07_functions.sql | 424 |
| database_object | `authz.trg_guard_delegation_grant` | server/db/ddl/common/authz/07_functions.sql | 952 |
| database_object | `authz.trg_guard_permission_definition` | server/db/ddl/common/authz/07_functions.sql | 200 |
| database_object | `authz.trg_guard_role_permission` | server/db/ddl/common/authz/07_functions.sql | 536 |
| database_object | `authz.trg_validate_permission_publish` | server/db/ddl/common/authz/07_functions.sql | 244 |
| database_object | `authz.delegation_grant.trg_delegation_grant_10_validate` | server/db/ddl/common/authz/08_triggers.sql | 278 |
| database_object | `authz.delegation_grant.trg_delegation_grant_20_parent_guard` | server/db/ddl/common/authz/08_triggers.sql | 282 |
| database_object | `authz.delegation.trg_delegation_10_normalize` | server/db/ddl/common/authz/08_triggers.sql | 241 |
| database_object | `authz.delegation.trg_delegation_20_identity_guard` | server/db/ddl/common/authz/08_triggers.sql | 247 |
| database_object | `authz.delegation.trg_delegation_21_natural_key_guard` | server/db/ddl/common/authz/08_triggers.sql | 251 |
| database_object | `authz.delegation.trg_delegation_30_active_subject` | server/db/ddl/common/authz/08_triggers.sql | 255 |
| database_object | `authz.delegation.trg_delegation_35_audit_evidence` | server/db/ddl/common/authz/08_triggers.sql | 392 |
| database_object | `authz.delegation.trg_delegation_40_status_transition` | server/db/ddl/common/authz/08_triggers.sql | 261 |
| database_object | `authz.delegation.trg_delegation_50_status_changed` | server/db/ddl/common/authz/08_triggers.sql | 270 |
| database_object | `authz.delegation.trg_delegation_60_updated_at` | server/db/ddl/common/authz/08_triggers.sql | 274 |
| database_object | `authz.delegation.trg_delegation_90_delete_guard` | server/db/ddl/common/authz/08_triggers.sql | 437 |
| database_object | `authz.permission_scope_kind.trg_permission_scope_kind_50_updated_at` | server/db/ddl/common/authz/08_triggers.sql | 23 |
| database_object | `authz.permission.trg_permission_10_normalize` | server/db/ddl/common/authz/08_triggers.sql | 2 |
| database_object | `authz.permission.trg_permission_20_definition_guard` | server/db/ddl/common/authz/08_triggers.sql | 7 |
| database_object | `authz.permission.trg_permission_30_status_transition` | server/db/ddl/common/authz/08_triggers.sql | 11 |
| database_object | `authz.permission.trg_permission_35_audit_evidence` | server/db/ddl/common/authz/08_triggers.sql | 360 |
| database_object | `authz.permission.trg_permission_40_status_changed` | server/db/ddl/common/authz/08_triggers.sql | 15 |
| database_object | `authz.permission.trg_permission_50_updated_at` | server/db/ddl/common/authz/08_triggers.sql | 19 |
| database_object | `authz.permission.trg_permission_90_delete_guard` | server/db/ddl/common/authz/08_triggers.sql | 405 |
| database_object | `authz.record_acl.trg_record_acl_10_normalize` | server/db/ddl/common/authz/08_triggers.sql | 322 |
| database_object | `authz.record_acl.trg_record_acl_20_identity_guard` | server/db/ddl/common/authz/08_triggers.sql | 327 |
| database_object | `authz.record_acl.trg_record_acl_21_natural_key_guard` | server/db/ddl/common/authz/08_triggers.sql | 331 |
| database_object | `authz.record_acl.trg_record_acl_30_validate_permission` | server/db/ddl/common/authz/08_triggers.sql | 335 |
| database_object | `authz.record_acl.trg_record_acl_31_active_subject` | server/db/ddl/common/authz/08_triggers.sql | 340 |
| database_object | `authz.record_acl.trg_record_acl_35_audit_evidence` | server/db/ddl/common/authz/08_triggers.sql | 400 |
| database_object | `authz.record_acl.trg_record_acl_40_status_transition` | server/db/ddl/common/authz/08_triggers.sql | 347 |
| database_object | `authz.record_acl.trg_record_acl_50_status_changed` | server/db/ddl/common/authz/08_triggers.sql | 351 |
| database_object | `authz.record_acl.trg_record_acl_60_updated_at` | server/db/ddl/common/authz/08_triggers.sql | 355 |
| database_object | `authz.record_acl.trg_record_acl_90_delete_guard` | server/db/ddl/common/authz/08_triggers.sql | 445 |
| database_object | `authz.role_permission.trg_role_permission_10_identity_guard` | server/db/ddl/common/authz/08_triggers.sql | 113 |
| database_object | `authz.role_permission.trg_role_permission_20_parent_guard` | server/db/ddl/common/authz/08_triggers.sql | 117 |
| database_object | `authz.role_permission.trg_role_permission_50_updated_at` | server/db/ddl/common/authz/08_triggers.sql | 121 |
| database_object | `event.trg_capture_authorization_invalidation` | server/db/ddl/common/authz/08_triggers.sql | 457 |
| database_object | `event.fn_authorization_bump_epoch` | server/db/ddl/common/event/07_functions.sql | 118 |
| database_object | `event.fn_authorization_claim_invalidations` | server/db/ddl/common/event/07_functions.sql | 212 |
| database_object | `event.fn_authorization_complete_invalidation` | server/db/ddl/common/event/07_functions.sql | 236 |
| database_object | `event.fn_authorization_emit_invalidation` | server/db/ddl/common/event/07_functions.sql | 171 |
| database_object | `event.fn_authorization_fail_invalidation` | server/db/ddl/common/event/07_functions.sql | 248 |
| database_object | `runtime_meta.trg_authorization_epoch_coordinates_immutable` | server/db/ddl/common/event/07_functions.sql | 107 |
| database_object | `event.authorization_invalidation_outbox.trg_authorization_invalidation_immutable` | server/db/ddl/common/event/08_triggers.sql | 69 |
| database_object | `event.authorization_invalidation_outbox.trg_authorization_invalidation_notify` | server/db/ddl/common/event/08_triggers.sql | 96 |
| database_object | `event.trg_authorization_invalidation_immutable` | server/db/ddl/common/event/08_triggers.sql | 50 |
| database_object | `runtime_meta.authorization_epoch.trg_authorization_epoch_coordinates_immutable` | server/db/ddl/common/event/08_triggers.sql | 46 |
| database_object | `ops.certify_authorization_operation_parity` | server/db/ddl/common/ops/07_functions.sql | 1 |
| database_object | `ops.set_authorization_operation_rollout` | server/db/ddl/common/ops/07_functions.sql | 36 |
| database_object | `ops.trg_guard_authorization_operation_cutover_drill` | server/db/ddl/common/ops/07_functions.sql | 89 |
| database_object | `ops.trg_guard_authorization_parity_certification` | server/db/ddl/common/ops/07_functions.sql | 76 |
| database_object | `ops.trg_guard_authorization_rollout_write` | server/db/ddl/common/ops/07_functions.sql | 81 |
| database_object | `ops.trg_guard_authorization_shadow_comparison` | server/db/ddl/common/ops/07_functions.sql | 94 |
| database_object | `ops.authorization_operation_cutover_drill.authorization_operation_cutover_drill_immutable` | server/db/ddl/common/ops/08_triggers.sql | 9 |
| database_object | `ops.authorization_operation_rollout.authorization_operation_rollout_guard` | server/db/ddl/common/ops/08_triggers.sql | 5 |
| database_object | `ops.authorization_parity_certification.authorization_parity_certification_immutable` | server/db/ddl/common/ops/08_triggers.sql | 1 |
| database_object | `ops.authorization_shadow_comparison.authorization_shadow_comparison_immutable` | server/db/ddl/common/ops/08_triggers.sql | 12 |
| database_object | `master.trg_normalize_principal_identity_binding` | server/db/ddl/planes/mesh/master/07_functions.sql | 729 |
| database_object | `master.trg_normalize_principal_identity_binding` | server/db/ddl/planes/neon/master/07_functions.sql | 736 |
| database_object | `master.trg_normalize_principal_identity_binding` | server/db/ddl/planes/studio/master/07_functions.sql | 767 |
| database_object | `metadata.entity_operation_permission.trg_entity_operation_permission_10_graph_guard` | server/db/ddl/planes/studio/metadata/08_triggers.sql | 181 |
| database_object | `metadata.entity_operation_permission.trg_entity_operation_permission_20_binding` | server/db/ddl/planes/studio/metadata/08_triggers.sql | 182 |
| database_object | `metadata.entity_operation_permission.trg_entity_operation_permission_90_updated_at` | server/db/ddl/planes/studio/metadata/08_triggers.sql | 188 |
| object | `event.authorization_invalidation_outbox` | config/governance/authorization-data-disposition-inventory.v1.json | 6093 |
| object | `master.identity_provider_d` | server/apps/platform-host/src/composition/register-platform.ts | 256 |
| object | `event.fn_authorization_emit_invalidation` | server/db/ddl/common/authz/08_triggers.sql | 473 |
| object | `event.trg_capture_authorization_invalidation` | server/db/ddl/common/authz/08_triggers.sql | 457 |
| object | `event.authorization_invalidation_outbox` | server/db/ddl/common/event/03_tables.sql | 409 |
| object | `event.authorization_invalidation_outbox` | server/db/ddl/common/event/03_tables.sql | 447 |
| object | `event.authorization_invalidation_outbox` | server/db/ddl/common/event/05_constraints.sql | 67 |
| object | `event.authorization_invalidation_outbox` | server/db/ddl/common/event/06_indexes.sql | 37, 40, 42, 44 |
| object | `event.authorization_invalidation_outbox` | server/db/ddl/common/event/07_functions.sql | 192 |
| object | `event.authorization_invalidation_outbox` | server/db/ddl/common/event/07_functions.sql | 200, 214, 216, 221, 243 |
| object | `event.authorization_invalidation_outbox` | server/db/ddl/common/event/07_functions.sql | 205, 228, 239, 252 |
| object | `event.fn_authorization_bump_epoch` | server/db/ddl/common/event/07_functions.sql | 118 |
| object | `event.fn_authorization_bump_epoch` | server/db/ddl/common/event/07_functions.sql | 204, 226 |
| object | `event.fn_authorization_claim_invalidations` | server/db/ddl/common/event/07_functions.sql | 212 |
| object | `event.fn_authorization_complete_invalidation` | server/db/ddl/common/event/07_functions.sql | 236 |
| object | `event.fn_authorization_emit_invalidation` | server/db/ddl/common/event/07_functions.sql | 171 |
| object | `event.fn_authorization_fail_invalidation` | server/db/ddl/common/event/07_functions.sql | 248 |
| object | `event.authorization_invalidation_outbox` | server/db/ddl/common/event/08_triggers.sql | 70, 95, 96 |
| object | `event.trg_authorization_invalidation_immutable` | server/db/ddl/common/event/08_triggers.sql | 50 |
| object | `event.trg_authorization_invalidation_immutable` | server/db/ddl/common/event/08_triggers.sql | 71 |
| object | `event.authorization_invalidation_health` | server/db/ddl/common/event/09_views.sql | 1, 16 |
| object | `event.authorization_invalidation_outbox` | server/db/ddl/common/event/09_views.sql | 13 |
| object | `event.authorization_invalidation_outbox` | server/db/ddl/common/event/10_rls.sql | 73, 74, 75, 77 |
| object | `event.authorization_invalidation_outbox` | server/db/ddl/common/event/11_grants.sql | 38, 41, 44 |
| object | `event.fn_authorization_bump_epoch` | server/db/ddl/common/event/11_grants.sql | 42 |
| object | `event.fn_authorization_claim_invalidations` | server/db/ddl/common/event/11_grants.sql | 42 |
| object | `event.fn_authorization_complete_invalidation` | server/db/ddl/common/event/11_grants.sql | 42 |
| object | `event.fn_authorization_emit_invalidation` | server/db/ddl/common/event/11_grants.sql | 42 |
| object | `event.fn_authorization_fail_invalidation` | server/db/ddl/common/event/11_grants.sql | 42 |
| object | `master.identity_provider_d` | server/db/ddl/common/master/03_platform_tables.sql | 735 |
| object | `event.trg_authorization_invalidation_immutable` | server/db/ddl/common/shared/09_function_search_path_hardening.sql | 19 |
| object | `event.authorization_invalidation_health` | server/db/ddl/common/shared/11_migrated_view_grants.sql | 8, 24, 35 |
| object | `master.identity_provider_d` | server/db/ddl/planes/mesh/master/02_domains.sql | 36, 156, 157, 168 |
| object | `master.identity_provider_d` | server/db/ddl/planes/mesh/master/07_functions.sql | 856, 885 |
| object | `master.trg_guard_principal_identity_binding` | server/db/ddl/planes/mesh/master/07_functions.sql | 747 |
| object | `master.trg_normalize_principal_identity_binding` | server/db/ddl/planes/mesh/master/07_functions.sql | 729 |
| object | `master.trg_guard_principal_identity_binding` | server/db/ddl/planes/mesh/master/08_triggers.sql | 215 |
| object | `master.trg_normalize_principal_identity_binding` | server/db/ddl/planes/mesh/master/08_triggers.sql | 209 |
| object | `master.identity_provider_d` | server/db/ddl/planes/mesh/master/11_grants.sql | 60 |
| object | `master.identity_provider_d` | server/db/ddl/planes/neon/master/02_domains.sql | 38, 311, 312, 323 |
| object | `event.fn_authorization_emit_invalidation` | server/db/ddl/planes/neon/master/07_functions.sql | 4888 |
| object | `master.identity_provider_d` | server/db/ddl/planes/neon/master/07_functions.sql | 863, 892 |
| object | `master.trg_guard_principal_identity_binding` | server/db/ddl/planes/neon/master/07_functions.sql | 754 |
| object | `master.trg_normalize_principal_identity_binding` | server/db/ddl/planes/neon/master/07_functions.sql | 736 |
| object | `master.trg_guard_principal_identity_binding` | server/db/ddl/planes/neon/master/08_triggers.sql | 215 |
| object | `master.trg_normalize_principal_identity_binding` | server/db/ddl/planes/neon/master/08_triggers.sql | 209 |
| object | `master.identity_provider_d` | server/db/ddl/planes/neon/master/11_grants.sql | 161 |
| object | `master.identity_provider_d` | server/db/ddl/planes/studio/master/02_domains.sql | 47, 167, 168, 179 |
| object | `master.identity_provider_d` | server/db/ddl/planes/studio/master/07_functions.sql | 894, 923 |
| object | `master.trg_guard_principal_identity_binding` | server/db/ddl/planes/studio/master/07_functions.sql | 785 |
| object | `master.trg_normalize_principal_identity_binding` | server/db/ddl/planes/studio/master/07_functions.sql | 767 |
| object | `master.trg_guard_principal_identity_binding` | server/db/ddl/planes/studio/master/08_triggers.sql | 225 |
| object | `master.trg_normalize_principal_identity_binding` | server/db/ddl/planes/studio/master/08_triggers.sql | 219 |
| object | `master.identity_provider_d` | server/db/ddl/planes/studio/master/11_grants.sql | 75 |
| object | `event.fn_authorization_bump_epoch` | server/db/scripts/operations/authorization/reset-authorization-clean-slate.ts | 94 |
| object | `mesh.auth_account_entitlement` | server/db/scripts/seed/compile-final-authorization-seed-packs.ts | 139 |
| object | `control.auth_permission_seed_staging` | server/db/seed-backup/contracts/base/seed-contract.v1.json | 57 |
| object | `control.auth_permission_seed_staging` | server/db/seed-backup/migration/legacy-lint-report.v1.json | 64038, 64224 |
| object | `master.acl_access_level` | server/db/seed-backup/migration/lookup-ledger.v1.json | 2253 |
| object | `master.delegation_scope` | server/db/seed-backup/migration/lookup-ledger.v1.json | 3940 |
| object | `master.principal_relationship_type` | server/db/seed-backup/migration/lookup-ledger.v1.json | 5541 |
| object | `master.principal_relationship_verification_status` | server/db/seed-backup/migration/lookup-ledger.v1.json | 5566 |
| object | `master.principal_relationship_verified_method` | server/db/seed-backup/migration/lookup-ledger.v1.json | 5591 |
| object | `control.auth_permission_seed_staging` | server/db/seed-backup/migration/migration-ledger.v1.json | 2337, 2464 |
| object | `master.acl_access_level` | server/db/seed-backup/migration/migration-ledger.v1.json | 10078 |
| object | `master.content_item_access_grant_access_level` | server/db/seed-backup/migration/migration-ledger.v1.json | 13695 |
| object | `master.content_item_access_grant_subject_type` | server/db/seed-backup/migration/migration-ledger.v1.json | 13751 |
| object | `master.delegation_scope` | server/db/seed-backup/migration/migration-ledger.v1.json | 14199 |
| object | `master.principal_identity_binding_sync_status` | server/db/seed-backup/migration/migration-ledger.v1.json | 17795 |
| object | `master.principal_relationship_type` | server/db/seed-backup/migration/migration-ledger.v1.json | 17907 |
| object | `master.principal_relationship_verification_status` | server/db/seed-backup/migration/migration-ledger.v1.json | 17963 |
| object | `master.principal_relationship_verified_method` | server/db/seed-backup/migration/migration-ledger.v1.json | 18019 |
| object | `master.tenant_feature_entitlement_status` | server/db/seed-backup/migration/migration-ledger.v1.json | 19759 |
| object | `mesh.auth_account_entitlement` | server/db/seed-backup/packs/authorization-v2/mesh/seed-pack.v1.json | 3573 |
| object | `control.auth_permission_seed_staging` | server/db/seed/contracts/base/seed-contract.v1.json | 70 |
| object | `mesh.auth_account_entitlement` | server/db/seed/packs/authorization-v2/mesh/seed-pack.v1.json | 3265 |
| object | `event.authorization_invalidation_outbox` | server/packages/adapters/database/athyper-postgres/src/generated/kysely-studio/types.ts | 6121 |
| object | `event.authorization_invalidation_outbox` | server/packages/adapters/database/mesh-postgres/src/generated/kysely-mesh/types.ts | 5563 |
| object | `event.authorization_invalidation_outbox` | server/packages/adapters/database/neon-postgres/src/generated/kysely/types.ts | 12782 |
| object | `master.identity_provider_d` | server/packages/platform/iam/src/kysely-identity-context-resolver.ts | 39 |
| object | `event.authorization_invalidation_outbox` | server/packages/platform/metadata/src/invalidation.ts | 13 |
| object | `event.fn_authorization_claim_invalidations` | server/packages/platform/metadata/src/invalidation.ts | 10 |
| object | `event.fn_authorization_complete_invalidation` | server/packages/platform/metadata/src/invalidation.ts | 11 |
| security_symbol | `authorizeAdmin` | server/packages/platform/ai/src/atlas-experience-routes.ts | 10 |
| security_symbol | `requirePermission` | server/packages/platform/collaboration/src/collaboration-service.ts | 26, 39, 51, 58, 59, 60, 61, 62, 63, 73 |
| security_symbol | `requirePermission` | server/packages/platform/control-admin/src/authorization-management-service.ts | 8, 85 |
| security_symbol | `requirePermission` | server/packages/platform/control-admin/src/cycle/cycle-config-service.ts | 17, 34, 45, 123 |
| security_symbol | `requirePermission` | server/packages/services/documents/src/document-service.ts | 29, 34, 80, 120 |
| security_symbol | `requirePermission` | server/packages/services/finance/src/planning/planning-service.ts | 8, 9, 14, 15, 24 |
| security_symbol | `requirePermission` | server/packages/services/master-data/src/services.ts | 46, 60, 70, 79, 93, 102, 103, 104, 124 |
| security_symbol | `requirePermission` | server/packages/services/publication/src/publication-routes.ts | 37, 46, 54, 62, 72, 81, 90, 107, 123, 136 |
| security_symbol | `authorizeRecordListRead` | server/packages/services/records/src/entity-list-service.ts | 28 |
| security_symbol | `authorizeRecordListRead` | server/packages/services/records/src/query-service.ts | 37 |
| security_symbol | `authorizeRecordListRead` | server/packages/services/records/src/record-read-access.ts | 5 |
| security_symbol | `authorizeDescriptorOperation` | server/packages/services/records/src/transfer/transfer-service.ts | 67, 84, 94, 101, 140, 159, 225, 242, 270, 314 |
| security_symbol | `authorizeImportMode` | server/packages/services/records/src/transfer/transfer-service.ts | 68, 84, 94, 141, 160, 225, 315 |

## Known source anomalies

| ID | Type | Identity | Owner | Current path | Lines | Disposition | Removal wave |
|---|---|---|---|---|---|---|---|
| drift.legacy-master-persona-reader | object | `master.persona` | platform-iam | server/packages/services/iam/routes/operator.routes.ts | not observed | replace_reader_with_principal_profile_or_idp_projection | Wave 1 authorization model replacement |
| drift.permission-ap-invoice-approve | permission_code | `AP.INVOICE.APPROVE` | platform-iam+finance-platform | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | not observed | define_in_canonical_permission_seed_or_remove_scope_policy | Wave 1 seed replacement |
| drift.permission-iam-delegation-manage | permission_code | `IAM.DELEGATION.MANAGE` | platform-iam | server/packages/services/iam/routes/operator.routes.ts | not observed | define_in_canonical_permission_seed_or_remove_legacy_route | Wave 1 authorization model replacement |
| drift.permission-iam-grant-manage | permission_code | `IAM.GRANT.MANAGE` | platform-iam | server/packages/services/iam/routes/company-code-access.routes.ts | not observed | define_in_canonical_permission_seed_or_remove_legacy_routes | Wave 1 authorization model replacement |
| drift.permission-iam-grant-manage | permission_code | `IAM.GRANT.MANAGE` | platform-iam | server/packages/services/iam/routes/operator.routes.ts | not observed | define_in_canonical_permission_seed_or_remove_legacy_routes | Wave 1 authorization model replacement |
| drift.permission-iam-group-manage | permission_code | `IAM.GROUP.MANAGE` | platform-iam | server/packages/services/iam/routes/operator.routes.ts | not observed | define_in_canonical_permission_seed_before_group_cutover | Wave 1 authorization model replacement |
| drift.permission-iam-principal-read | permission_code | `IAM.PRINCIPAL.READ` | platform-iam | server/packages/services/iam/routes/operator.routes.ts | not observed | define_in_canonical_permission_seed_or_remove_legacy_route | Wave 1 authorization model replacement |
| drift.permission-invoice-line-add-from-catalog | permission_code | `INVOICE.LINE.ADD_FROM_CATALOG` | runtime-domain+platform-iam | packages/shared/runtime-domain/runtime-line-item/src/adapters/catalog.ts | not observed | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-catalog | permission_code | `INVOICE.LINE.ADD_FROM_CATALOG` | runtime-domain+platform-iam | packages/shared/runtime-line-item/src/adapters/catalog.ts | not observed | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-po | permission_code | `INVOICE.LINE.ADD_FROM_PO` | runtime-domain+platform-iam | packages/shared/runtime-domain/runtime-line-item/src/adapters/open-po-line.ts | not observed | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-po | permission_code | `INVOICE.LINE.ADD_FROM_PO` | runtime-domain+platform-iam | packages/shared/runtime-line-item/src/adapters/open-po-line.ts | not observed | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-receipt | permission_code | `INVOICE.LINE.ADD_FROM_RECEIPT` | runtime-domain+platform-iam | packages/shared/runtime-domain/runtime-line-item/src/adapters/open-receipt-line.ts | not observed | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-receipt | permission_code | `INVOICE.LINE.ADD_FROM_RECEIPT` | runtime-domain+platform-iam | packages/shared/runtime-line-item/src/adapters/open-receipt-line.ts | not observed | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-service-sheet | permission_code | `INVOICE.LINE.ADD_FROM_SERVICE_SHEET` | runtime-domain+platform-iam | packages/shared/runtime-domain/runtime-line-item/src/adapters/open-service-sheet-line.ts | not observed | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-service-sheet | permission_code | `INVOICE.LINE.ADD_FROM_SERVICE_SHEET` | runtime-domain+platform-iam | packages/shared/runtime-line-item/src/adapters/open-service-sheet-line.ts | not observed | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-ppl-pii-edit | permission_code | `PPL.PII.EDIT` | people-platform+platform-iam | server/db/ddl/master/08_people_rls.sql | not observed | define_in_canonical_permission_seed_before_rls_certification | Wave 1 seed replacement |
| drift.permission-ppl-pii-view | permission_code | `PPL.PII.VIEW` | people-platform+platform-iam | server/db/ddl/master/08_people_rls.sql | not observed | define_in_canonical_permission_seed_before_rls_certification | Wave 1 seed replacement |
| drift.permission-sales-opportunity-create | permission_code | `SALES.OPPORTUNITY.CREATE` | sales-platform+platform-iam | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | not observed | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-sales-opportunity-create | permission_code | `SALES.OPPORTUNITY.CREATE` | sales-platform+platform-iam | server/packages/services/business/sales/sales-authorization.service.ts | not observed | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-sales-order-create | permission_code | `SALES.ORDER.CREATE` | sales-platform+platform-iam | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | not observed | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-sales-order-create | permission_code | `SALES.ORDER.CREATE` | sales-platform+platform-iam | server/packages/services/business/sales/sales-authorization.service.ts | not observed | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-sales-quotation-create | permission_code | `SALES.QUOTATION.CREATE` | sales-platform+platform-iam | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | not observed | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-sales-quotation-create | permission_code | `SALES.QUOTATION.CREATE` | sales-platform+platform-iam | server/packages/services/business/sales/sales-authorization.service.ts | not observed | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-source-demand-aggregate | permission_code | `SOURCE.DEMAND.AGGREGATE` | procurement-platform+platform-iam | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | not observed | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-source-demand-aggregate | permission_code | `SOURCE.DEMAND.AGGREGATE` | procurement-platform+platform-iam | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | not observed | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-source-event-create | permission_code | `SOURCE.EVENT.CREATE` | procurement-platform+platform-iam | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | not observed | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-source-event-create | permission_code | `SOURCE.EVENT.CREATE` | procurement-platform+platform-iam | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | not observed | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-source-event-evaluate | permission_code | `SOURCE.EVENT.EVALUATE` | procurement-platform+platform-iam | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | not observed | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-source-event-evaluate | permission_code | `SOURCE.EVENT.EVALUATE` | procurement-platform+platform-iam | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | not observed | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |

## Zero-Mesh-specific-data Neon boundary findings

These are owned current-state exceptions to the target boundary, not evidence that the boundary is already satisfied.

| ID | Boundary class | Identity | Owner | Current path | Lines | Disposition | Removal wave |
|---|---|---|---|---|---|---|---|
| boundary.mesh-runtime-athyperadmin-app-pool | mesh_runtime_rls_bypass_app_pool | `mesh.runtime.athyperadmin_app_pool` | database-platform+mesh-platform | server/.env.example | not observed | replace_mesh_runtime_pool_with_dedicated_nobypassrls_login | Wave 0 Mesh boundary hardening |
| boundary.mesh-runtime-athyperadmin-app-pool | mesh_runtime_rls_bypass_app_pool | `mesh.runtime.athyperadmin_app_pool` | database-platform+mesh-platform | stack/env/.env.example | not observed | replace_mesh_runtime_pool_with_dedicated_nobypassrls_login | Wave 0 Mesh boundary hardening |
| boundary.mesh-runtime-superuser-app-pool | mesh_runtime_rls_bypass_app_pool | `mesh.runtime.postgres_superuser_app_pool` | database-platform+mesh-platform | stack/scripts/setup/write-env-staging.sh | not observed | replace_mesh_runtime_pool_with_dedicated_nobypassrls_login | Wave 0 Mesh boundary hardening |
| boundary.neon-legacy-mesh-business-network-membership-role-table | neon_legacy_mesh_table | `master.business_network_membership_role` | mesh-platform+database-platform | server/db/ddl/master/01m_bp_core_hardening.sql | not observed | migrate_or_classify_rows_then_drop_from_neon | Wave 1E network cleanup |
| boundary.neon-legacy-mesh-business-network-membership-table | neon_legacy_mesh_table | `master.business_network_membership` | mesh-platform+database-platform | server/db/ddl/master/01m_bp_core_hardening.sql | not observed | migrate_or_classify_rows_then_drop_from_neon | Wave 1E network cleanup |
| boundary.neon-legacy-mesh-business-network-table | neon_legacy_mesh_table | `master.business_network` | mesh-platform+database-platform | server/db/ddl/master/01m_bp_core_hardening.sql | not observed | migrate_or_classify_rows_then_drop_from_neon | Wave 1E network cleanup |
| boundary.neon-legacy-mesh-network-seeds | neon_legacy_mesh_seed | `neon.seed.legacy_mesh_network_authorization` | mesh-platform+database-platform | server/db/seed/tenants/neon/010_demo/network/001_buyer_networks.sql | not observed | remove_mesh_authorization_rows_from_neon_seed_contract | Wave 2 deterministic seed replacement |
| boundary.neon-legacy-mesh-network-seeds | neon_legacy_mesh_seed | `neon.seed.legacy_mesh_network_authorization` | mesh-platform+database-platform | server/db/seed/tenants/neon/020_technostat/network/001_buyer_networks.sql | not observed | remove_mesh_authorization_rows_from_neon_seed_contract | Wave 2 deterministic seed replacement |
| boundary.neon-legacy-mesh-network-seeds | neon_legacy_mesh_seed | `neon.seed.legacy_mesh_network_authorization` | mesh-platform+database-platform | server/db/seed/tenants/neon/020_technostat/network/004_mesh_buyer_bindings.sql | not observed | remove_mesh_authorization_rows_from_neon_seed_contract | Wave 2 deterministic seed replacement |
| boundary.neon-legacy-mesh-network-seeds | neon_legacy_mesh_seed | `neon.seed.legacy_mesh_network_authorization` | mesh-platform+database-platform | server/db/seed/tenants/neon/030_cirrusatlantic/network/001_buyer_networks.sql | not observed | remove_mesh_authorization_rows_from_neon_seed_contract | Wave 2 deterministic seed replacement |
| boundary.neon-legacy-mesh-network-seeds | neon_legacy_mesh_seed | `neon.seed.legacy_mesh_network_authorization` | mesh-platform+database-platform | server/db/seed/tenants/neon/030_cirrusatlantic/network/004_mesh_buyer_bindings.sql | not observed | remove_mesh_authorization_rows_from_neon_seed_contract | Wave 2 deterministic seed replacement |
| boundary.neon-runtime-derived-mesh-database-url | neon_mesh_connection_fallback | `neon.runtime.derived_mesh_database_url` | runtime-platform+mesh-platform | server/src/config.ts | not observed | remove_cross_plane_database_url_derivation | Wave 0 plane boundary hardening |
| boundary.neon-runtime-direct-mesh-database-config | neon_direct_mesh_configuration | `neon.runtime.direct_mesh_database_config` | runtime-platform+mesh-platform | server/production.env.example | 40 | split_neon_and_mesh_runtime_process_credentials | Wave 0 plane boundary hardening |
| boundary.neon-runtime-direct-mesh-database-config | neon_direct_mesh_configuration | `neon.runtime.direct_mesh_database_config` | runtime-platform+mesh-platform | server/staging.env.example | 40 | split_neon_and_mesh_runtime_process_credentials | Wave 0 plane boundary hardening |
| boundary.neon-runtime-mesh-reader-fallback | neon_direct_mesh_reader | `neon.runtime.mesh_reader_fallback` | platform-iam+mesh-platform | server/packages/services/iam/context/context-resolver.service.ts | not observed | require_explicit_mesh_plane_repository_without_neon_fallback | Wave 0 plane boundary hardening |
| boundary.neon-runtime-mesh-reader-fallback | neon_direct_mesh_reader | `neon.runtime.mesh_reader_fallback` | platform-iam+mesh-platform | server/packages/services/iam/discovery/discovery.service.ts | not observed | require_explicit_mesh_plane_repository_without_neon_fallback | Wave 0 plane boundary hardening |

## Canonical capture-source parity

Capture DDLs:

- neon: `server/db/ddl/control/01zzo_authorization_migration_controls.sql` -> `control.authorization_capture_source`
- mesh: `server/db/ddl/mesh_control/01z_authorization_migration_controls.sql` -> `mesh_control.authorization_capture_source`

| Plane | Exact source | Object ID | Owner | Disposition | DDL | Line |
|---|---|---|---|---|---|---:|

## Writer inventory

| Object | Access | Artifact class | Path | Lines |
|---|---|---|---|---|
| `master.auth_group` | insert | test | scripts/policy/authorization-inventory.test.ts | 99 |
| `master.auth_group` | update | test | scripts/policy/authorization-inventory.test.ts | 100 |
| `master.auth_group` | insert | runtime | server/db/seed-backup/blueprints/universal/990_validation/998_canonical_neon_authority.sql | 77 |
| `master.auth_group_member` | insert | runtime | server/db/seed-backup/blueprints/universal/990_validation/998_canonical_neon_authority.sql | 151 |
| `master.auth_group_role` | insert | runtime | server/db/seed-backup/blueprints/universal/990_validation/998_canonical_neon_authority.sql | 101 |
| `shared.workspace` | insert | test | server/db/scripts/__tests__/seed/seed-contract-lint.test.ts | 77 |
| `master.company_code` | insert | tool | server/db/scripts/business-partner-360/run-business-partner-s4-migration-evidence.ts | 33 |
| `master.company_code` | insert | tool | server/db/scripts/provisioning/neon-scenario-foundation.ts | 30 |
| `master.company_code` | insert | test | server/db/scripts/tests/integration/fixtures/asset_org_fixture.sql | 46 |
| `master.company_code` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/100_org_structure/199_gl_preseed.sql | 275 |
| `master.company_code` | update | runtime | server/db/seed-backup/tenants/neon/010_demo/100_org_structure/199_gl_preseed.sql | 319 |
| `master.company_code` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/100_org_structure/200_demo_legal_entities.sql | 45 |
| `master.company_code` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/100_org_structure/201_athyper_subsidiaries.sql | 187 |
| `master.company_code` | update | runtime | server/db/seed-backup/tenants/neon/010_demo/100_org_structure/201_athyper_subsidiaries.sql | 283 |
| `master.company_code` | update | runtime | server/db/seed-backup/tenants/neon/010_demo/100_org_structure/311_ledger_books.sql | 140 |
| `master.company_code` | update | runtime | server/db/seed-backup/tenants/neon/010_demo/party_master/004_athq_intercompany.sql | 53 |
| `master.company_code` | insert | runtime | server/db/seed-backup/tenants/neon/020_technostat/000_tenant.sql | 188 |
| `master.company_code` | update | runtime | server/db/seed-backup/tenants/neon/020_technostat/000_tenant.sql | 209 |
| `master.company_code` | update | runtime | server/db/seed-backup/tenants/neon/020_technostat/006_technostat_intercompany_master.sql | 53 |
| `master.company_code` | insert | runtime | server/db/seed-backup/tenants/neon/030_cirrusatlantic/100_org_structure/200_legal_entities.sql | 84 |
| `master.legal_entity` | insert | tool | server/db/scripts/business-partner-360/run-business-partner-s4-migration-evidence.ts | 32 |
| `master.legal_entity` | insert | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 478 |
| `master.legal_entity` | insert | test | server/db/scripts/tests/integration/fixtures/asset_org_fixture.sql | 33 |
| `master.legal_entity` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/100_org_structure/199_gl_preseed.sql | 142, 189 |
| `master.legal_entity` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/100_org_structure/200_demo_legal_entities.sql | 28 |
| `master.legal_entity` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/100_org_structure/201_athyper_subsidiaries.sql | 67 |
| `master.legal_entity` | insert | runtime | server/db/seed-backup/tenants/neon/020_technostat/000_tenant.sql | 127 |
| `master.legal_entity` | update | runtime | server/db/seed-backup/tenants/neon/020_technostat/000_tenant.sql | 156, 174 |
| `master.legal_entity` | update | runtime | server/db/seed-backup/tenants/neon/020_technostat/004_technostat_finance_controls.sql | 41, 54, 67, 80 |
| `master.legal_entity` | insert | runtime | server/db/seed-backup/tenants/neon/030_cirrusatlantic/100_org_structure/200_legal_entities.sql | 32 |
| `master.operating_organization` | update | tool | server/db/scripts/business-partner-360/provision-business-partner-360-acceptance-fixtures.ts | 45 |
| `master.operating_organization` | delete | tool | server/db/scripts/business-partner-360/run-business-partner-s4-certification.ts | 95 |
| `master.operating_organization` | insert | tool | server/db/scripts/business-partner-360/run-business-partner-s4-certification.ts | 49, 75 |
| `master.operating_organization` | insert | tool | server/db/scripts/business-partner-360/run-business-partner-s4-migration-evidence.ts | 31 |
| `master.operating_organization` | insert | tool | server/db/scripts/provisioning/neon-scenario-foundation.ts | 68 |
| `master.operating_organization` | update | tool | server/db/scripts/provisioning/provision-development-business-partner-fixtures.ts | 97 |
| `master.operating_organization` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/100_org_structure/202_operating_organizations.sql | 43 |
| `master.operating_organization_company` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/100_org_structure/202_operating_organizations.sql | 81 |
| `master.principal` | insert | ddl | server/db/ddl/common/master/12_system_authority_reference_seed.sql | 46 |
| `master.principal` | delete | tool | server/db/scripts/business-partner-360/run-business-partner-s5-certification.ts | 206 |
| `master.principal` | insert | tool | server/db/scripts/business-partner-360/run-business-partner-s5-certification.ts | 55 |
| `master.principal` | update | tool | server/db/scripts/operations/authorization/reset-authorization-clean-slate.ts | 86 |
| `master.principal` | insert | tool | server/db/scripts/operations/studio/project-meta-entity-admin-identities.ts | 126, 145 |
| `master.principal` | insert | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 403, 770 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/fixtures/asset_org_fixture.sql | 21 |
| `master.principal` | insert | test | server/db/scripts/tests/integration/meta-entity/schema.sql | 98 |
| `master.principal` | insert | runtime | server/db/seed-backup/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 24 |
| `master.principal` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/900_principals/001_demo_principals.sql | 41 |
| `master.principal` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/900_principals/004_athq_principals.sql | 38 |
| `master.principal` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/900_principals/006_demo_in_priya.sql | 60 |
| `master.principal` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/900_principals/006_principal_users.sql | 94, 112 |
| `master.principal` | insert | runtime | server/db/seed-backup/tenants/neon/020_technostat/000_tenant.sql | 96 |
| `master.principal` | update | runtime | server/db/seed-backup/tenants/neon/020_technostat/000_tenant.sql | 113 |
| `master.principal` | insert | runtime | server/db/seed-backup/tenants/neon/030_cirrusatlantic/000_tenant.sql | 102 |
| `master.principal` | insert | runtime | server/db/seed-backup/tenants/studio/000_platform_staff.sql | 22 |
| `master.principal` | insert | runtime | server/packages/platform/iam/src/kysely-identity-saga.ts | 125 |
| `master.principal` | update | runtime | server/packages/platform/iam/src/kysely-identity-saga.ts | 127, 159 |
| `master.principal` | insert | runtime | server/packages/test-utils/fixtures/rls-actors.sql | 23 |
| `master.principal_identity_binding` | delete | tool | server/db/scripts/operations/iam/reconcile-runtime-subjects.ts | 68 |
| `master.principal_identity_binding` | insert | tool | server/db/scripts/operations/iam/reconcile-runtime-subjects.ts | 72 |
| `master.principal_identity_binding` | insert | tool | server/db/scripts/operations/studio/project-meta-entity-admin-identities.ts | 153 |
| `master.principal_identity_binding` | insert | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 801 |
| `master.principal_identity_binding` | update | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 781 |
| `master.principal_identity_binding` | insert | runtime | server/db/seed-backup/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 38 |
| `master.principal_identity_binding` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/900_principals/001_demo_principals.sql | 86 |
| `master.principal_identity_binding` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/900_principals/006_demo_in_priya.sql | 90 |
| `master.principal_identity_binding` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/900_principals/006_principal_users.sql | 232 |
| `master.principal_identity_binding` | insert | runtime | server/db/seed-backup/tenants/studio/000_platform_staff.sql | 51 |
| `master.principal_identity_binding` | insert | runtime | server/packages/platform/iam/src/kysely-identity-saga.ts | 130 |
| `master.principal_identity_binding` | update | runtime | server/packages/platform/iam/src/kysely-identity-saga.ts | 158 |
| `master.principal_profile` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/900_principals/001_demo_principals.sql | 65 |
| `master.principal_profile` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/900_principals/004_athq_principals.sql | 64 |
| `master.principal_profile` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/900_principals/006_demo_in_priya.sql | 73 |
| `master.principal_profile` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/900_principals/006_principal_users.sql | 166 |
| `master.principal_profile` | insert | runtime | server/db/seed-backup/tenants/studio/000_platform_staff.sql | 37 |
| `master.tenant` | insert | ddl | server/db/ddl/common/master/12_system_authority_reference_seed.sql | 29 |
| `master.tenant` | insert | tool | server/db/scripts/operations/studio/project-meta-entity-admin-identities.ts | 120, 137 |
| `master.tenant` | insert | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 420 |
| `master.tenant` | insert | test | server/db/scripts/tests/integration/fixtures/asset_org_fixture.sql | 11 |
| `master.tenant` | insert | test | server/db/scripts/tests/integration/fixtures/publication-authority.sql | 5 |
| `master.tenant` | insert | test | server/db/scripts/tests/integration/meta-entity/schema.sql | 90 |
| `master.tenant` | insert | runtime | server/db/seed-backup/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 9 |
| `master.tenant` | insert | runtime | server/db/seed-backup/tenants/neon/_template/000_tenant.sql | 15 |
| `master.tenant` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/000_tenant.sql | 18 |
| `master.tenant` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/900_principals/006_demo_in_priya.sql | 12 |
| `master.tenant` | insert | runtime | server/db/seed-backup/tenants/neon/020_technostat/000_tenant.sql | 57 |
| `master.tenant` | update | runtime | server/db/seed-backup/tenants/neon/020_technostat/000_tenant.sql | 78 |
| `master.tenant` | insert | runtime | server/db/seed-backup/tenants/neon/030_cirrusatlantic/000_tenant.sql | 46 |
| `master.tenant` | insert | runtime | server/db/seed-backup/tenants/studio/000_platform_staff.sql | 11 |
| `master.tenant` | update | runtime | server/db/seed-backup/tenants/studio/005_canonical_party_fixtures.sql | 14 |
| `master.tenant` | insert | runtime | server/packages/test-utils/fixtures/rls-actors.sql | 18 |
| `master.tenant` | update | test | server/packages/test-utils/src/postgres-service-harness.postgres.test.ts | 24, 29 |
| `mesh.network_account` | update | ddl | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql | 125, 604 |
| `mesh.network_account` | update | runtime | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql | 126, 605 |
| `mesh.network_account` | insert | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 523 |
| `mesh.network_account` | insert | tool | server/db/scripts/provisioning/provision-development-phase1-list-fixtures.ts | 31 |
| `mesh.network_account` | insert | runtime | server/db/seed-backup/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 57 |
| `mesh_control.authorization_capture_source` | insert | test | scripts/policy/authorization-inventory.test.ts | 298 |
| `mesh.network_relationship` | insert | ddl | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql | 687 |
| `mesh.network_relationship` | update | ddl | server/db/ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql | 105, 120, 135, 793 |
| `mesh.network_relationship` | insert | runtime | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql | 688 |
| `mesh.network_relationship` | update | runtime | server/db/migrations/20260903_mesh_exchange_integrity_hardening.sql | 106, 121, 136, 794 |
| `mesh.network_relationship` | update | test | server/db/scripts/tests/integration/business-partner-profile-publication.sql | 3 |
| `mesh.network_relationship` | insert | runtime | server/db/seed-backup/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 194 |
| `mesh.network_relationship` | insert | runtime | server/packages/planes/mesh/src/network-relationship-import.ts | 37 |
| `mesh.network_relationship` | update | runtime | server/packages/planes/mesh/src/network-relationship-import.ts | 31, 36 |
| `control.entity` | update | runtime | server/db/seed-backup/tenants/neon/010_demo/002_bank_account_display_fix.sql | 19 |
| `control.entity_policy` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/entity_engine/010_entity_policies.sql | 40, 69 |
| `control.entity_policy` | update | runtime | server/db/seed-backup/tenants/neon/010_demo/entity_engine/010_entity_policies.sql | 82 |
| `control.entity_policy` | insert | runtime | server/db/seed-backup/tenants/neon/020_technostat/entity_engine/001_entity_policies.sql | 44, 74 |
| `control.entity_policy` | update | runtime | server/db/seed-backup/tenants/neon/020_technostat/entity_engine/001_entity_policies.sql | 87 |
| `control.entity_version` | update | test | server/db/scripts/tests/integration/effective-lock-scenarios.ts | 108, 132, 190 |
| `control.field_security_policy` | insert | runtime | server/db/seed-backup/tenants/neon/010_demo/entity_engine/020_field_security_policies.sql | 45, 59, 73, 83, 94, 105, 116 |
| `control.authorization_capture_source` | insert | test | scripts/policy/authorization-inventory.test.ts | 247, 261, 265, 279 |
| `master.auth_plane_membership` | insert | runtime | server/db/seed-backup/blueprints/universal/990_validation/998_canonical_neon_authority.sql | 133 |
| `master.auth_role` | insert | runtime | server/db/seed-backup/blueprints/universal/990_validation/998_canonical_neon_authority.sql | 34 |
| `master.auth_role_permission` | insert | runtime | server/db/seed-backup/blueprints/universal/990_validation/998_canonical_neon_authority.sql | 58 |
| `master.auth_scope_target` | insert | runtime | server/db/seed-backup/blueprints/universal/990_validation/998_canonical_neon_authority.sql | 14 |

## Keycloak REST writer inventory

| Path | Classification | Owner | Operations | Disposition | Lines |
|---|---|---|---|---|---|
| tools/devtools/keycloackgen/configure-browser-flow.mjs | reviewed | platform-iam | `POST:authentication_flow`<br>`PUT:authentication_flow`<br>`PUT:realm`<br>`PUT:user` | replace_with_versioned_keycloak_seed_contract | 51, 88, 113, 119, 130, 147, 164 |
| tools/devtools/keycloackgen/configure-email.mjs | reviewed | platform-iam | `PUT:realm` | replace_with_versioned_keycloak_seed_contract | 67 |
| tools/devtools/keycloackgen/configure-magic-link.mjs | reviewed | platform-iam | `POST:authentication_flow`<br>`PUT:authentication_flow`<br>`PUT:realm`<br>`PUT:user_required_action` | replace_with_versioned_keycloak_seed_contract | 50, 68, 84, 93, 112 |
| tools/devtools/keycloackgen/enforce-mfa.mjs | reviewed | platform-iam | `PUT:user`<br>`PUT:user_required_action` | replace_with_versioned_keycloak_seed_contract | 66, 81 |
| tools/devtools/keycloackgen/smoke-test-email.mjs | reviewed | platform-iam | `PUT:user_required_action` | retain_as_non_production_smoke_test | 26 |
| tools/scripts/deploy-broker-flows.cjs | reviewed | platform-iam | `POST:authentication_flow`<br>`PUT:authentication_flow` | replace_with_versioned_keycloak_seed_contract | 115, 131, 138, 146 |
| tools/scripts/deploy-realm-demosetup.cjs | reviewed | platform-iam | `DELETE:client_role`<br>`DELETE:organization`<br>`DELETE:organization_membership`<br>`POST:identity_provider`<br>`POST:organization`<br>`POST:organization_membership`<br>`POST:protocol_mapper_or_realm_import`<br>`PUT:admin_other`<br>`PUT:identity_provider`<br>`PUT:organization`<br>`PUT:user` | replace_with_versioned_keycloak_seed_contract | 115, 139, 159, 189, 194, 223, 234, 257, 304, 359, 366, 395 |
| tools/scripts/deploy-users-groups-idps.cjs | reviewed | platform-iam | `DELETE:user`<br>`POST:client_role`<br>`POST:group`<br>`POST:group_role_mapping`<br>`POST:identity_provider`<br>`POST:organization_membership`<br>`POST:user`<br>`PUT:identity_provider`<br>`PUT:user_group_membership` | replace_with_versioned_keycloak_seed_contract | 134, 166, 183, 203, 236, 255, 279, 321, 324 |
| tools/scripts/fix-org-memberships.cjs | reviewed | platform-iam | `DELETE:organization_membership`<br>`POST:organization_membership`<br>`PUT:organization_membership` | replace_with_versioned_keycloak_seed_contract | 78, 84, 90, 126 |
| tools/scripts/rebuild-broker-flows.cjs | reviewed | platform-iam | `DELETE:authentication_flow`<br>`POST:authentication_flow`<br>`PUT:authentication_flow` | replace_with_versioned_keycloak_seed_contract | 49, 54, 60, 80, 89 |

## Permission seed inventory

| Code | Risk | Definition sources |
|---|---|---|

## Authorization-bearing routes

| Source | Route | Methods | Permissions | Security symbols |
|---|---|---|---|---|

## Contract and UI field inventory

| Field | Artifact class | Path | Lines |
|---|---|---|---|
| `allowed` | runtime | config/governance/authorization-data-disposition-inventory.v1.json | 1929 |
| `allowed` | runtime | config/governance/authorization-data-disposition-policy.v1.json | 150 |
| `allowed` | runtime | packages/contracts/platform/authorization/src/index.ts | 2, 7, 18, 21 |
| `allowed` | runtime | packages/contracts/platform/fixtures/authorization-snapshot.v1.json | 4 |
| `allowed` | runtime | packages/contracts/platform/fixtures/platform-bootstrap.v1.json | 23 |
| `allowed` | runtime | packages/platform/shell/shell-runtime/src/core.ts | 28 |
| `allowed` | runtime | packages/platform/shell/shell/src/home-personalization.ts | 50 |
| `allowed` | ui | packages/platform/shell/shell/src/home.tsx | 339 |
| `allowed` | tool | scripts/policy/authorization-inventory.ts | 730, 894, 911 |
| `allowed` | tool | scripts/policy/verify-api-client-phase2.mjs | 10, 13 |
| `allowed` | test | server/apps/platform-host/src/composition/__tests__/verification-routes.test.ts | 7 |
| `allowed` | runtime | server/apps/platform-host/src/composition/finance-routes.ts | 19 |
| `allowed` | runtime | server/apps/platform-host/src/composition/register-platform.ts | 144, 145 |
| `allowed` | runtime | server/apps/platform-host/src/composition/register-services.ts | 309, 404, 492, 493, 494, 495, 496, 497, 499, 501, 502, 503, 783, 812, 848, 918 |
| `allowed` | ddl | server/db/ddl/common/master/03_platform_tables.sql | 50 |
| `allowed` | tool | server/db/scripts/checks/seeds/authorization-release-gates.ts | 52, 187 |
| `allowed` | tool | server/db/scripts/seed/compile-mesh-authorization-inventory.ts | 228, 229 |
| `allowed` | tool | server/db/scripts/seed/compile-neon-authorization-inventory.ts | 207, 211 |
| `allowed` | test | server/db/scripts/tests/integration/atlas/tools-rls.ts | 175, 176, 279, 368, 422, 459 |
| `allowed` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `allowed` | runtime | server/packages/contracts/ai/src/tools.ts | 103 |
| `allowed` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 20, 39 |
| `allowed` | runtime | server/packages/contracts/auth/src/authorization.ts | 7, 75, 101, 102 |
| `allowed` | runtime | server/packages/contracts/auth/src/management.ts | 78 |
| `allowed` | test | server/packages/planes/mesh/src/business-partner-bank-disclosure.test.ts | 5, 6 |
| `allowed` | runtime | server/packages/planes/mesh/src/business-partner-bank-disclosure.ts | 58 |
| `allowed` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3, 6 |
| `allowed` | runtime | server/packages/planes/mesh/src/business-partner-profile-publication.ts | 41 |
| `allowed` | test | server/packages/planes/neon/src/business-partner-account-bank-linkage.test.ts | 6, 7 |
| `allowed` | runtime | server/packages/planes/neon/src/business-partner-account-bank-linkage.ts | 45 |
| `allowed` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6, 20 |
| `allowed` | runtime | server/packages/planes/neon/src/business-partner-profile-match.ts | 79 |
| `allowed` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7, 23 |
| `allowed` | runtime | server/packages/planes/neon/src/business-partner-profile-projection.ts | 132 |
| `allowed` | test | server/packages/planes/neon/src/finance-http.test.ts | 7 |
| `allowed` | runtime | server/packages/planes/neon/src/finance-http.ts | 54 |
| `allowed` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 13 |
| `allowed` | runtime | server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts | 222 |
| `allowed` | runtime | server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.ts | 87 |
| `allowed` | runtime | server/packages/planes/studio/meta-entity-authoring/src/routes.ts | 7, 8, 13, 14, 16, 17 |
| `allowed` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 5 |
| `allowed` | runtime | server/packages/planes/studio/onboarding/src/maintenance.ts | 24 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7, 37 |
| `allowed` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15 |
| `allowed` | runtime | server/packages/platform/ai/src/context.ts | 22 |
| `allowed` | runtime | server/packages/platform/ai/src/experience-configuration.ts | 18, 19, 27, 28, 29 |
| `allowed` | runtime | server/packages/platform/ai/src/knowledge.ts | 20 |
| `allowed` | runtime | server/packages/platform/ai/src/surface-draft-generation.ts | 109 |
| `allowed` | runtime | server/packages/platform/ai/src/tool-service.ts | 57, 59, 79, 86, 122, 196 |
| `allowed` | runtime | server/packages/platform/audit/src/governance-service.ts | 101 |
| `allowed` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 58 |
| `allowed` | runtime | server/packages/platform/collaboration/src/collaboration-service.ts | 73 |
| `allowed` | test | server/packages/platform/control-admin/src/authorization-management-service.test.ts | 10, 70, 96, 124, 127, 128, 129, 130 |
| `allowed` | runtime | server/packages/platform/control-admin/src/authorization-management-service.ts | 55, 56, 57, 58, 84, 85, 101 |
| `allowed` | runtime | server/packages/platform/control-admin/src/control-services.ts | 144 |
| `allowed` | test | server/packages/platform/control-admin/src/cycle/cycle-config-service.test.ts | 48 |
| `allowed` | runtime | server/packages/platform/control-admin/src/cycle/cycle-config-service.ts | 123 |
| `allowed` | runtime | server/packages/platform/control-admin/src/runtime-command-service.ts | 344 |
| `allowed` | test | server/packages/platform/experience/src/service.test.ts | 15, 53, 96, 156, 168 |
| `allowed` | runtime | server/packages/platform/experience/src/service.ts | 64, 76, 77, 235 |
| `allowed` | runtime | server/packages/platform/governance/src/compliance/legal-hold-service.ts | 71 |
| `allowed` | runtime | server/packages/platform/governance/src/compliance/report-pack-service.ts | 96 |
| `allowed` | runtime | server/packages/platform/governance/src/cycles/cycle-execution-services.ts | 128 |
| `allowed` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `allowed` | route | server/packages/platform/governance/src/routes/governance-routes.ts | 7 |
| `allowed` | runtime | server/packages/platform/iam/src/__fixtures__/authorization-golden-corpus.v1.json | 15, 24, 34, 44, 51, 58, 64, 71, 78, 84, 91, 97, 103 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/authorization-golden-corpus.test.ts | 12 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/iam-foundation.test.ts | 11, 12, 13, 14 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/iam-service.test.ts | 35, 39, 59, 61 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2, 4 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/identity-saga.test.ts | 123, 126, 127 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/legacy-compatibility.test.ts | 2 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 11, 17, 19, 24, 32, 50, 55, 60, 75, 77, 78, 79, 80, 81, 90, 93 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10, 22 |
| `allowed` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6, 16 |
| `allowed` | runtime | server/packages/platform/iam/src/iam-routes.ts | 34 |
| `allowed` | runtime | server/packages/platform/iam/src/iam-service.ts | 172, 173, 179, 182, 224 |
| `allowed` | runtime | server/packages/platform/iam/src/identity-provisioning-service.ts | 24 |
| `allowed` | runtime | server/packages/platform/iam/src/identity-saga.ts | 197 |
| `allowed` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 265, 281 |
| `allowed` | runtime | server/packages/platform/iam/src/legacy-compatibility.ts | 1, 8 |
| `allowed` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 4, 14, 17, 21, 25, 28, 31, 34, 37, 38, 40, 41, 42, 46, 49, 51, 52, 55, 56, 60 |
| `allowed` | runtime | server/packages/platform/iam/src/provisioning-vertical.ts | 52 |
| `allowed` | runtime | server/packages/platform/iam/src/required-actions.ts | 2, 3, 14, 17, 19 |
| `allowed` | runtime | server/packages/platform/iam/src/trustiam-authority.ts | 117 |
| `allowed` | runtime | server/packages/platform/jobs/src/job-admin-routes.ts | 94, 95 |
| `allowed` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `allowed` | runtime | server/packages/platform/notifications/src/notification-operations.ts | 47 |
| `allowed` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `allowed` | runtime | server/packages/platform/policy/src/policy-routes.ts | 19, 28 |
| `allowed` | test | server/packages/platform/search/src/__tests__/document-search-service.test.ts | 3 |
| `allowed` | runtime | server/packages/platform/search/src/document-search-service.ts | 3 |
| `allowed` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 22, 79 |
| `allowed` | runtime | server/packages/platform/workflow/src/workflow-service.ts | 69, 76, 127 |
| `allowed` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 3, 5 |
| `allowed` | runtime | server/packages/services/attachments/src/attachment-routes.ts | 37, 38 |
| `allowed` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `allowed` | runtime | server/packages/services/content/src/content-service.ts | 4, 5 |
| `allowed` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 35 |
| `allowed` | runtime | server/packages/services/documents/src/document-service.ts | 120 |
| `allowed` | runtime | server/packages/services/finance/src/ledger/cross-book-posting-service.ts | 10, 25 |
| `allowed` | runtime | server/packages/services/finance/src/planning/planning-service.ts | 9 |
| `allowed` | runtime | server/packages/services/integration/src/integration-routes.ts | 2 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-360-commercial-controls.test.ts | 9 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-360-explainability.test.ts | 4 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-360-service.test.ts | 2, 6, 14 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-eligibility-service.test.ts | 6, 8 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/business-partner-request-service.test.ts | 8, 39, 43 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/customer-onboarding-service.test.ts | 10 |
| `allowed` | test | server/packages/services/master-data/src/__tests__/workforce-service.test.ts | 6, 16 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-360-mesh-network-adapter.ts | 10 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-360-policy.ts | 16, 18, 21 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-360-service.ts | 77, 93 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-eligibility-service.ts | 25 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-invitation-service.ts | 148 |
| `allowed` | runtime | server/packages/services/master-data/src/business-partner-request-service.ts | 297 |
| `allowed` | runtime | server/packages/services/master-data/src/services.ts | 124 |
| `allowed` | runtime | server/packages/services/master-data/src/workforce-service.ts | 42 |
| `allowed` | runtime | server/packages/services/publication/src/business-partner-definition-consumer-routes.ts | 8 |
| `allowed` | runtime | server/packages/services/publication/src/business-partner-definition-routes.ts | 20 |
| `allowed` | runtime | server/packages/services/publication/src/publication-routes.ts | 138 |
| `allowed` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `allowed` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20, 39, 47, 113, 141, 150 |
| `allowed` | test | server/packages/services/records/src/__tests__/record-read-access.test.ts | 6, 19 |
| `allowed` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 43, 46, 140 |
| `allowed` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `allowed` | runtime | server/packages/services/records/src/actions/action-service.ts | 12 |
| `allowed` | runtime | server/packages/services/records/src/entity-list-service.ts | 40, 56, 106, 173, 175, 177, 183, 185, 188, 205 |
| `allowed` | runtime | server/packages/services/records/src/field-validation.ts | 35 |
| `allowed` | runtime | server/packages/services/records/src/lifecycle-service.ts | 20 |
| `allowed` | runtime | server/packages/services/records/src/mutation-service.ts | 34, 56, 75, 95, 109 |
| `allowed` | runtime | server/packages/services/records/src/query-service.ts | 20, 139, 142 |
| `allowed` | runtime | server/packages/services/records/src/record-read-access.ts | 10, 28, 31, 59 |
| `allowed` | runtime | server/packages/services/records/src/snapshots/snapshot-routes.ts | 8 |
| `allowed` | runtime | server/packages/services/records/src/transfer/transfer-jobs.ts | 120, 121 |
| `allowed` | runtime | server/packages/services/records/src/transfer/transfer-service.ts | 314, 315 |
| `allowed` | keycloak | stack/config/iam/realm-athyper-clean-slate.json | 2248, 2258, 2260, 2694, 2722, 2726, 2741, 2753, 2757 |
| `allowed` | keycloak | stack/config/iam/realm-athyper.json | 2259, 2269, 2271, 2864, 2892, 2896, 2911, 2923, 2927 |
| `allowed` | keycloak | stack/config/iam/realm-platform-control-clean-slate.json | 209, 218, 220 |
| `allowed` | keycloak | stack/config/iam/realm-platform-control.json | 213, 222, 224 |
| `allowed` | test | tests/contracts/access-consumption-phase9.test.ts | 13, 37, 41 |
| `allowed` | test | tests/contracts/api-client-transport.test.ts | 97 |
| `allowed` | test | tests/contracts/auth-session-foundation.test.ts | 35 |
| `allowed` | test | tests/contracts/home-personalization-phase3.test.ts | 26, 28, 30 |
| `authorizationScopes` | runtime | server/apps/platform-host/src/composition/register-services.ts | 918 |
| `authorizationScopes` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `authorizationScopes` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 25 |
| `authorizationScopes` | runtime | server/packages/contracts/auth/src/authorization.ts | 80 |
| `authorizationScopes` | test | server/packages/planes/mesh/src/business-partner-bank-disclosure.test.ts | 5 |
| `authorizationScopes` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3 |
| `authorizationScopes` | test | server/packages/planes/neon/src/business-partner-account-bank-linkage.test.ts | 6 |
| `authorizationScopes` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6 |
| `authorizationScopes` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7 |
| `authorizationScopes` | test | server/packages/planes/neon/src/finance-http.test.ts | 7 |
| `authorizationScopes` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 13 |
| `authorizationScopes` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 5 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7 |
| `authorizationScopes` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15 |
| `authorizationScopes` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 58 |
| `authorizationScopes` | test | server/packages/platform/experience/src/service.test.ts | 15, 100, 113, 125, 132 |
| `authorizationScopes` | runtime | server/packages/platform/experience/src/service.ts | 159, 177, 194 |
| `authorizationScopes` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `authorizationScopes` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `authorizationScopes` | test | server/packages/platform/iam/src/__tests__/identity-saga.test.ts | 123 |
| `authorizationScopes` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 12, 34 |
| `authorizationScopes` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10 |
| `authorizationScopes` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `authorizationScopes` | runtime | server/packages/platform/iam/src/iam-service.ts | 187 |
| `authorizationScopes` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 286 |
| `authorizationScopes` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 58 |
| `authorizationScopes` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `authorizationScopes` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `authorizationScopes` | test | server/packages/platform/search/src/__tests__/document-search-service.test.ts | 3 |
| `authorizationScopes` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 79 |
| `authorizationScopes` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 3 |
| `authorizationScopes` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `authorizationScopes` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 35 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 43 |
| `authorizationScopes` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `denied` | runtime | packages/platform/ai/agent-runtime/src/index.ts | 18, 132 |
| `denied` | runtime | packages/platform/iam/auth-bff/package.json | 12, 13, 18, 19 |
| `denied` | runtime | packages/platform/iam/auth-bff/src/index.ts | 252, 253, 327 |
| `denied` | runtime | packages/platform/iam/session-store/package.json | 12, 13 |
| `denied` | runtime | packages/platform/shell/activity-center-data/src/index.ts | 24, 31, 32 |
| `denied` | runtime | packages/platform/shell/app-foundation/src/error-taxonomy.ts | 6, 50 |
| `denied` | runtime | packages/platform/shell/shell/src/messages.ts | 9 |
| `denied` | tool | scripts/policy/authorization-inventory.ts | 731 |
| `denied` | tool | scripts/policy/verify-auth-session-phase3.mjs | 10 |
| `denied` | ui | scripts/verification/render-boundary-fixture.tsx | 9 |
| `denied` | runtime | server/apps/platform-host/src/composition/register-services.ts | 382, 918 |
| `denied` | ddl | server/db/ddl/common/ai/05_constraints.sql | 218 |
| `denied` | ddl | server/db/ddl/common/ai/07_functions.sql | 64 |
| `denied` | ddl | server/db/ddl/common/audit/02_domains.sql | 65 |
| `denied` | test | server/db/scripts/tests/integration/atlas/tools-rls.ts | 340, 341, 343, 345 |
| `denied` | runtime | server/db/seed/contracts/authorization/control/cross-plane-suspension-control.v1.json | 70 |
| `denied` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `denied` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 21 |
| `denied` | runtime | server/packages/contracts/auth/src/authorization.ts | 76 |
| `denied` | test | server/packages/planes/mesh/src/business-partner-bank-disclosure.test.ts | 5 |
| `denied` | runtime | server/packages/planes/mesh/src/business-partner-bank-disclosure.ts | 58 |
| `denied` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3 |
| `denied` | runtime | server/packages/planes/mesh/src/business-partner-profile-publication.ts | 41 |
| `denied` | test | server/packages/planes/neon/src/business-partner-account-bank-linkage.test.ts | 6 |
| `denied` | runtime | server/packages/planes/neon/src/business-partner-account-bank-linkage.ts | 45 |
| `denied` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6 |
| `denied` | runtime | server/packages/planes/neon/src/business-partner-profile-match.ts | 79 |
| `denied` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7 |
| `denied` | runtime | server/packages/planes/neon/src/business-partner-profile-projection.ts | 132 |
| `denied` | test | server/packages/planes/neon/src/finance-http.test.ts | 7 |
| `denied` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 13 |
| `denied` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 5 |
| `denied` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `denied` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `denied` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `denied` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `denied` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `denied` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7 |
| `denied` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15, 57 |
| `denied` | runtime | server/packages/platform/ai/src/atlas-experience-routes.ts | 15 |
| `denied` | runtime | server/packages/platform/ai/src/context.ts | 23 |
| `denied` | runtime | server/packages/platform/ai/src/tool-service.ts | 88, 124, 196 |
| `denied` | runtime | server/packages/platform/audit/src/governance-service.ts | 101 |
| `denied` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 58 |
| `denied` | runtime | server/packages/platform/control-admin/src/authorization-management-routes.ts | 14, 16 |
| `denied` | runtime | server/packages/platform/experience/src/routes.ts | 32 |
| `denied` | test | server/packages/platform/experience/src/service.test.ts | 15 |
| `denied` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `denied` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `denied` | test | server/packages/platform/iam/src/__tests__/identity-saga.test.ts | 123 |
| `denied` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 11, 23, 33 |
| `denied` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10 |
| `denied` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `denied` | runtime | server/packages/platform/iam/src/iam-service.ts | 73, 77, 84, 97, 114, 183, 216, 238 |
| `denied` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 263, 266, 282 |
| `denied` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 27 |
| `denied` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `denied` | test | server/packages/platform/notifications/src/__tests__/email-canary.test.ts | 56 |
| `denied` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `denied` | test | server/packages/platform/search/src/__tests__/document-search-service.test.ts | 3 |
| `denied` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 79 |
| `denied` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 3 |
| `denied` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `denied` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 35 |
| `denied` | runtime | server/packages/services/master-data/src/business-partner-eligibility-service.ts | 25 |
| `denied` | runtime | server/packages/services/master-data/src/business-partner-request-service.ts | 297 |
| `denied` | runtime | server/packages/services/master-data/src/services.ts | 124 |
| `denied` | runtime | server/packages/services/master-data/src/workforce-service.ts | 42 |
| `denied` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `denied` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `denied` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 43 |
| `denied` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `denied` | runtime | server/packages/services/records/src/bookmarks/record-bookmark-service.ts | 60 |
| `denied` | test | tests/contracts/auth-session-foundation.test.ts | 96, 171 |
| `denied` | test | tests/contracts/home-personalization-phase3.test.ts | 27, 29, 30 |
| `denied` | test | tests/e2e/production/surface-matrix.spec.ts | 197 |
| `denied` | test | tests/foundation-browser/error-boundaries.spec.ts | 5 |
| `denied` | test | tests/foundation/error-boundaries.test.tsx | 13 |
| `groupIds` | tool | scripts/policy/authorization-inventory.ts | 732, 752 |
| `groupIds` | test | server/db/scripts/__tests__/provisioning/three-plane-provision.test.ts | 220, 229, 232 |
| `groupIds` | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 119, 145, 158 |
| `groupIds` | tool | server/db/scripts/seed/tenant-authority-projection.ts | 273, 282, 285 |
| `matchedGrantId` | tool | scripts/policy/authorization-inventory.ts | 752 |
| `matchedGroupId` | tool | scripts/policy/authorization-inventory.ts | 752 |
| `matchedRoleId` | tool | scripts/policy/authorization-inventory.ts | 752 |
| `permissionCode` | ui | apps/studio/app/(shell)/mdg/business-partner/ai-experience/experience-editor.tsx | 13, 14, 32 |
| `permissionCode` | runtime | config/governance/authorization-golden-corpus.schema.json | 172, 194, 998, 1008, 1031, 1062 |
| `permissionCode` | runtime | config/governance/authorization-supplemental-decision-evidence.schema.json | 164, 174, 197, 228 |
| `permissionCode` | ui | packages/planes/neon/business-partner/src/360/components/network-section.tsx | 222 |
| `permissionCode` | runtime | packages/platform/ai/agent-runtime/src/index.ts | 21, 137 |
| `permissionCode` | runtime | packages/platform/shell/work-inbox/src/index.ts | 7, 14 |
| `permissionCode` | tool | scripts/policy/authorization-inventory.ts | 894, 912 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/documents-vertical.test.ts | 20 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/metadata-records-vertical.test.ts | 35, 36, 37, 38, 40 |
| `permissionCode` | test | server/apps/platform-host/src/composition/__tests__/workflow-vertical.test.ts | 22 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/finance-routes.ts | 9 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/register-platform.ts | 144, 145 |
| `permissionCode` | runtime | server/apps/platform-host/src/composition/register-services.ts | 404, 492, 493, 494, 495, 496, 497, 498, 499, 500, 501, 502, 848 |
| `permissionCode` | ddl | server/db/ddl/common/authz/07_functions.sql | 1720, 1721, 1722, 1723, 1724, 1732, 1750, 1764 |
| `permissionCode` | test | server/db/scripts/__tests__/authorization/entity-operation-projection-compiler.test.ts | 14, 31 |
| `permissionCode` | test | server/db/scripts/__tests__/authorization/exact-scope-compatibility.test.ts | 15 |
| `permissionCode` | test | server/db/scripts/__tests__/authorization/inventory-promotion.test.ts | 14, 40, 51 |
| `permissionCode` | test | server/db/scripts/__tests__/authorization/mesh-authorization-inventory.test.ts | 37, 149 |
| `permissionCode` | test | server/db/scripts/__tests__/authorization/neon-authorization-inventory.test.ts | 37 |
| `permissionCode` | test | server/db/scripts/__tests__/provisioning/development-business-partner-runtime.test.ts | 22, 26 |
| `permissionCode` | tool | server/db/scripts/checks/seeds/authorization-release-gates.ts | 22, 34, 48, 52, 96, 104, 106, 109, 111, 112, 113, 115, 127, 128, 129, 130, 143, 151, 152, 161, 417, 418, 426, 437, 438, 439, 454, 461, 462, 464, 475, 476, 477, 481, 482 |
| `permissionCode` | tool | server/db/scripts/operations/studio/provision-meta-entity-authority.ts | 143, 151, 156, 158 |
| `permissionCode` | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 648, 705, 706, 712, 713 |
| `permissionCode` | tool | server/db/scripts/provisioning/provision-development-business-partner-runtime.ts | 54, 93, 102 |
| `permissionCode` | tool | server/db/scripts/provisioning/provision-development-phase1-list-runtimes.ts | 18, 43, 66, 68, 77, 80 |
| `permissionCode` | tool | server/db/scripts/provisioning/provision-three-tenant-demo-authorization.ts | 126, 128, 129, 136, 139, 140 |
| `permissionCode` | tool | server/db/scripts/provisioning/three-plane-model.ts | 179 |
| `permissionCode` | tool | server/db/scripts/reports/neon-authorization-quality.ts | 585, 610 |
| `permissionCode` | tool | server/db/scripts/seed/compile-final-authorization-seed-packs.ts | 15 |
| `permissionCode` | tool | server/db/scripts/seed/compile-inventory-promotion.ts | 20, 21 |
| `permissionCode` | tool | server/db/scripts/seed/compile-mesh-authorization-inventory.ts | 216, 222 |
| `permissionCode` | tool | server/db/scripts/seed/compile-neon-authorization-inventory.ts | 194, 201 |
| `permissionCode` | tool | server/db/scripts/seed/entity-operation-projection-compiler.ts | 21, 39, 48, 66, 78, 79, 80, 81, 82, 83, 90, 98, 102, 111 |
| `permissionCode` | tool | server/db/scripts/seed/exact-scope-compatibility-model.ts | 6, 30, 31, 33, 34, 60, 66, 67, 68, 77, 79, 80 |
| `permissionCode` | tool | server/db/scripts/seed/export-entity-operation-release.ts | 38 |
| `permissionCode` | tool | server/db/scripts/seed/inventory-promotion-model.ts | 10, 28, 35, 57, 58, 60, 61, 65, 85, 86, 89, 92, 98, 99, 100, 102 |
| `permissionCode` | tool | server/db/scripts/seed/mesh-authorization-inventory-model.ts | 44, 59, 232, 233, 234, 235, 237, 269, 372 |
| `permissionCode` | tool | server/db/scripts/seed/neon-authorization-inventory-model.ts | 37, 52, 218, 219, 220, 221, 223, 257, 350 |
| `permissionCode` | tool | server/db/scripts/seed/tenant-authority-projection.ts | 67, 144, 145, 151, 252 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/catalog/mesh/scope-compatibility.v1.json | 8, 25, 42, 59, 76, 93, 110, 127, 140, 153, 170, 187, 204, 221, 238, 255, 272, 289, 310, 331, 352, 373, 386, 399, 412, 425, 442, 459, 476, 493, 510, 527, 544 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/catalog/neon/scope-compatibility.v1.json | 8, 21, 34, 43, 52, 61, 70, 79, 92, 105, 118, 131, 140, 161, 174, 191, 208, 225, 242, 259, 276, 293, 310, 327 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/catalog/studio/scope-compatibility.v1.json | 8, 17, 26, 35, 44, 53, 62, 71, 84, 97, 110, 123, 136, 149, 162, 175, 188, 201, 214, 227, 240, 253, 266, 275, 284, 297 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/mesh/compiled/table-authorization-coverage.v1.json | 1498, 1518, 1538, 1558, 1578, 1598, 1618, 1638, 1658, 1678, 1698, 1718, 1768, 1812, 1862, 1912, 1962, 2012, 2072, 2080, 2088, 2098, 2113, 2121, 2129, 2137, 2146 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/mesh/promotion/qualification-template.v1.json | 7, 26, 43, 60, 77, 94, 111, 130, 149, 166, 185, 202, 221, 238, 257, 274, 293, 312 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/mesh/reviewed-slices.v1.json | 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34, 42, 43, 44, 45, 53, 54, 55, 56, 57 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/neon/compiled/table-authorization-coverage.v1.json | 6450, 6467, 6484, 6501, 6518, 6535, 6552, 6569, 6586, 6603, 6620, 6637, 6654, 6671, 6688, 6705, 6722, 6739, 6756, 6773, 6790, 6807, 6824, 6841, 6858, 6875, 6892, 6909, 6926, 6943, 6960, 6977, 6994, 7011, 7028, 7045, 7062, 7079, 7098, 7117, 7134, 7151, 7168, 7197, 7207, 7223, 7231, 7241, 7257, 7265, 7274, 7290, 7298, 7307, 7316, 7332, 7340, 7349, 7358, 7374, 7382, 7391, 7400 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/neon/promotion-qualification.v1.json | 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/neon/promotion/operation-bindings.v1.candidate.json | 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107, 115, 123, 131, 139, 147, 155, 163, 171, 179, 187, 195, 203, 211, 219, 227, 235, 243, 251, 259, 267, 275, 283, 291, 299, 307, 315, 323, 331, 339, 347 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/neon/promotion/qualification-template.v1.json | 7, 26, 43, 60, 79, 96, 115, 132, 149, 168, 185, 202, 221, 238, 257, 276, 293, 312, 329, 348, 365, 384, 403, 420, 439, 456, 475, 492, 511, 530, 547, 564, 581, 600, 617, 636, 653, 670, 689, 708, 725, 744, 761 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/neon/promotion/scope-compatibility.v1.candidate.json | 8, 21, 34, 43, 52, 61, 70, 79, 92, 105, 118, 131, 140, 153, 166, 179, 192, 205, 218, 231, 244, 257, 270, 283, 296, 309, 330, 343, 356, 373, 386, 399, 412, 425, 438, 451, 464, 477, 490, 503, 516, 529, 542, 559, 572, 581, 594, 607, 620, 637, 650, 663, 680, 697, 714, 731, 748, 765, 782, 799, 816, 833, 850, 867, 884 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/neon/reviewed-slices.v1.json | 54, 55, 56, 57, 58, 60, 61, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72, 73, 74, 76, 77, 78, 79, 80, 81, 82, 84, 85, 86, 87, 88, 89, 90, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 109, 110, 119, 120, 121, 129, 130, 131, 139, 140, 141, 142, 150, 151, 152, 153, 161, 162, 163, 164 |
| `permissionCode` | runtime | server/db/seed/contracts/authorization/inventory/operation-lifecycle-contract.v1.json | 18, 39 |
| `permissionCode` | runtime | server/db/seed/packs/authorization-v2/mesh/seed-pack.v1.json | 570, 587, 604, 621, 638, 655, 672, 689, 702, 715, 732, 749, 766, 783, 800, 817, 834, 851, 872, 893, 914, 935, 948, 961, 974, 987, 1004, 1021, 1038, 1055, 1072, 1089, 1106 |
| `permissionCode` | runtime | server/db/seed/packs/authorization-v2/neon/seed-pack.v1.json | 426, 439, 452, 461, 470, 479, 488, 497, 510, 523, 536, 549, 558, 579, 592, 609, 626, 643, 660, 677, 694, 711, 728, 745 |
| `permissionCode` | runtime | server/db/seed/packs/authorization-v2/studio/seed-pack.v1.json | 458, 467, 476, 485, 494, 503, 512, 521, 534, 547, 560, 573, 586, 599, 612, 625, 638, 651, 664, 677, 690, 703, 716, 725, 734, 747 |
| `permissionCode` | runtime | server/packages/contracts/ai/src/experience-configuration.ts | 29 |
| `permissionCode` | runtime | server/packages/contracts/ai/src/operations.ts | 27, 30, 32 |
| `permissionCode` | runtime | server/packages/contracts/ai/src/runtime-schemas.ts | 6 |
| `permissionCode` | runtime | server/packages/contracts/auth/src/authorization.ts | 22, 33, 40, 53, 96 |
| `permissionCode` | runtime | server/packages/contracts/finance/src/foundation.ts | 102 |
| `permissionCode` | runtime | server/packages/contracts/finance/src/ports.ts | 31 |
| `permissionCode` | runtime | server/packages/contracts/master-data/src/business-partner-360-network.ts | 25 |
| `permissionCode` | runtime | server/packages/contracts/meta-entity-authoring/src/model.ts | 21, 32 |
| `permissionCode` | runtime | server/packages/contracts/metadata/src/descriptors.ts | 131, 137, 147 |
| `permissionCode` | runtime | server/packages/contracts/records/src/mutation.ts | 70 |
| `permissionCode` | runtime | server/packages/contracts/workflow/src/work-items.ts | 85 |
| `permissionCode` | runtime | server/packages/planes/mesh/src/business-partner-bank-disclosure.ts | 58 |
| `permissionCode` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 6 |
| `permissionCode` | runtime | server/packages/planes/mesh/src/business-partner-profile-publication.ts | 41 |
| `permissionCode` | runtime | server/packages/planes/neon/src/business-partner-account-bank-linkage.ts | 45 |
| `permissionCode` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 20 |
| `permissionCode` | runtime | server/packages/planes/neon/src/business-partner-profile-match.ts | 79 |
| `permissionCode` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 23 |
| `permissionCode` | runtime | server/packages/planes/neon/src/business-partner-profile-projection.ts | 132 |
| `permissionCode` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 11 |
| `permissionCode` | runtime | server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts | 187 |
| `permissionCode` | runtime | server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.ts | 98 |
| `permissionCode` | runtime | server/packages/planes/studio/meta-entity-authoring/src/routes.ts | 17 |
| `permissionCode` | runtime | server/packages/planes/studio/onboarding/src/maintenance.ts | 23 |
| `permissionCode` | runtime | server/packages/planes/studio/src/catalog-metadata-reader.ts | 26 |
| `permissionCode` | test | server/packages/planes/studio/src/metadata-draft-import.test.ts | 3 |
| `permissionCode` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 24 |
| `permissionCode` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 6 |
| `permissionCode` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 19 |
| `permissionCode` | runtime | server/packages/platform/ai/src/atlas-admin-routes.ts | 11 |
| `permissionCode` | runtime | server/packages/platform/ai/src/experience-configuration.ts | 28, 83 |
| `permissionCode` | runtime | server/packages/platform/ai/src/knowledge.ts | 17, 20, 26, 34 |
| `permissionCode` | runtime | server/packages/platform/audit/src/governance-service.ts | 101 |
| `permissionCode` | runtime | server/packages/platform/collaboration/src/collaboration-service.ts | 73 |
| `permissionCode` | test | server/packages/platform/control-admin/src/authorization-management-service.test.ts | 70, 96 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/authorization-management-service.ts | 84, 85 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/control-services.ts | 144 |
| `permissionCode` | test | server/packages/platform/control-admin/src/cycle/cycle-config-service.test.ts | 48 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/cycle/cycle-config-service.ts | 123 |
| `permissionCode` | runtime | server/packages/platform/control-admin/src/runtime-command-service.ts | 343, 344 |
| `permissionCode` | test | server/packages/platform/experience/src/service.test.ts | 100, 113, 125, 132 |
| `permissionCode` | runtime | server/packages/platform/experience/src/service.ts | 168 |
| `permissionCode` | runtime | server/packages/platform/governance/src/compliance/legal-hold-service.ts | 71 |
| `permissionCode` | runtime | server/packages/platform/governance/src/compliance/report-pack-service.ts | 96 |
| `permissionCode` | runtime | server/packages/platform/governance/src/cycles/cycle-execution-services.ts | 128 |
| `permissionCode` | route | server/packages/platform/governance/src/routes/governance-routes.ts | 7 |
| `permissionCode` | runtime | server/packages/platform/iam/src/__fixtures__/authorization-golden-corpus.v1.json | 13, 14, 19, 21, 22, 28, 31, 32, 38, 41, 42, 48, 50, 55, 57, 62, 63, 68, 70, 75, 77, 82, 88, 90, 95, 96, 101, 102 |
| `permissionCode` | test | server/packages/platform/iam/src/__tests__/authorization-golden-corpus.test.ts | 9, 32 |
| `permissionCode` | test | server/packages/platform/iam/src/__tests__/iam-service.test.ts | 51 |
| `permissionCode` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 12, 18, 23, 36, 49, 53, 58, 69, 70, 74, 76, 78, 80, 86, 87, 89, 92 |
| `permissionCode` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 73 |
| `permissionCode` | runtime | server/packages/platform/iam/src/identity-provisioning-service.ts | 24 |
| `permissionCode` | runtime | server/packages/platform/iam/src/identity-saga.ts | 196 |
| `permissionCode` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 256, 258, 259, 260, 270, 294, 297, 302, 316, 317, 321, 333, 334 |
| `permissionCode` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 4, 10, 19, 27, 30, 33, 36, 39, 41, 54, 59, 65, 73, 76 |
| `permissionCode` | runtime | server/packages/platform/iam/src/provisioning-vertical.ts | 22, 51, 52 |
| `permissionCode` | runtime | server/packages/platform/iam/src/trustiam-authority.ts | 117 |
| `permissionCode` | runtime | server/packages/platform/jobs/src/job-admin-routes.ts | 94, 95 |
| `permissionCode` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 5 |
| `permissionCode` | runtime | server/packages/platform/metadata/src/descriptor-parser.ts | 27, 53 |
| `permissionCode` | test | server/packages/platform/metadata/src/distributed-descriptor-cache.test.ts | 16 |
| `permissionCode` | runtime | server/packages/platform/notifications/src/notification-operations.ts | 47 |
| `permissionCode` | runtime | server/packages/platform/policy/src/policy-routes.ts | 18, 28 |
| `permissionCode` | runtime | server/packages/platform/search/src/document-search-service.ts | 3 |
| `permissionCode` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 22, 82 |
| `permissionCode` | runtime | server/packages/platform/workflow/src/sla-automation.ts | 8, 11, 13 |
| `permissionCode` | runtime | server/packages/platform/workflow/src/workflow-service.ts | 127, 128 |
| `permissionCode` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 5 |
| `permissionCode` | runtime | server/packages/services/attachments/src/attachment-routes.ts | 37, 38 |
| `permissionCode` | runtime | server/packages/services/content/src/content-service.ts | 4 |
| `permissionCode` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 36 |
| `permissionCode` | runtime | server/packages/services/documents/src/document-service.ts | 34, 120 |
| `permissionCode` | runtime | server/packages/services/finance/src/ledger/gl-posting-service.ts | 17 |
| `permissionCode` | test | server/packages/services/finance/src/shared/finance-foundation.test.ts | 83 |
| `permissionCode` | runtime | server/packages/services/finance/src/shared/permission-checker.ts | 5, 6 |
| `permissionCode` | runtime | server/packages/services/finance/src/shared/posting-guard.ts | 9 |
| `permissionCode` | runtime | server/packages/services/integration/src/integration-routes.ts | 2 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-360-commercial-controls.test.ts | 9 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-360-explainability.test.ts | 4 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-360-mesh-network-adapter.test.ts | 5, 7 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-360-production-integrations.test.ts | 8 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-360-service.test.ts | 6, 14 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-eligibility-service.test.ts | 8 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/business-partner-request-service.test.ts | 43 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/customer-onboarding-service.test.ts | 10 |
| `permissionCode` | test | server/packages/services/master-data/src/__tests__/workforce-service.test.ts | 16 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-360-mesh-network-adapter.ts | 7, 10, 34 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-360-policy.ts | 15, 18, 20 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-360-service.ts | 29, 68, 69, 72, 76, 93 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-eligibility-service.ts | 25 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-invitation-service.ts | 148 |
| `permissionCode` | runtime | server/packages/services/master-data/src/business-partner-request-service.ts | 297 |
| `permissionCode` | runtime | server/packages/services/master-data/src/kysely-business-partner-request-repository.ts | 210 |
| `permissionCode` | runtime | server/packages/services/master-data/src/kysely-workforce-request-repository.ts | 61 |
| `permissionCode` | runtime | server/packages/services/master-data/src/services.ts | 124 |
| `permissionCode` | runtime | server/packages/services/master-data/src/workforce-service.ts | 42 |
| `permissionCode` | runtime | server/packages/services/publication/src/business-partner-definition-consumer-routes.ts | 8 |
| `permissionCode` | runtime | server/packages/services/publication/src/business-partner-definition-routes.ts | 20 |
| `permissionCode` | runtime | server/packages/services/publication/src/publication-routes.ts | 136, 138 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 10 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 18, 38, 39, 46, 47, 113, 119, 141, 146, 150 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/record-read-access.test.ts | 13, 22 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 31, 32, 33, 34, 36, 39, 46, 139, 140 |
| `permissionCode` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 9, 38, 49 |
| `permissionCode` | runtime | server/packages/services/records/src/actions/action-service.ts | 12 |
| `permissionCode` | runtime | server/packages/services/records/src/entity-list-service.ts | 40, 56, 106, 174, 175, 188 |
| `permissionCode` | runtime | server/packages/services/records/src/field-validation.ts | 34, 35 |
| `permissionCode` | runtime | server/packages/services/records/src/lifecycle-service.ts | 17, 20 |
| `permissionCode` | runtime | server/packages/services/records/src/mutation-service.ts | 33, 34, 56, 74, 75, 94, 95, 112, 115, 117 |
| `permissionCode` | runtime | server/packages/services/records/src/query-service.ts | 79, 137, 140, 141 |
| `permissionCode` | runtime | server/packages/services/records/src/record-read-access.ts | 11, 12, 16, 30, 50 |
| `permissionCode` | runtime | server/packages/services/records/src/snapshots/snapshot-routes.ts | 8 |
| `permissionCode` | runtime | server/packages/services/records/src/transfer/transfer-jobs.ts | 120, 121 |
| `permissionCode` | runtime | server/packages/services/records/src/transfer/transfer-service.ts | 314, 315 |
| `permissionCode` | test | tests/contracts/three-plane-list-scope.test.ts | 30 |
| `permissionCode` | runtime | tests/e2e/acceptance/governed-import-smoke.mjs | 296 |
| `permissionCode` | runtime | tests/e2e/acceptance/public-record-transfer-smoke.mjs | 301 |
| `permissionCodes` | tool | scripts/policy/authorization-inventory.ts | 180, 971, 973, 1003, 2038 |
| `permissionCodes` | runtime | server/apps/platform-host/src/composition/finance-routes.ts | 19 |
| `permissionCodes` | runtime | server/apps/platform-host/src/composition/register-services.ts | 309 |
| `permissionCodes` | test | server/db/scripts/__tests__/authorization/entity-operation-projection-compiler.test.ts | 89, 190 |
| `permissionCodes` | test | server/db/scripts/__tests__/authorization/exact-scope-compatibility.test.ts | 12, 28, 41, 62, 71, 97 |
| `permissionCodes` | tool | server/db/scripts/seed/build-exact-scope-compatibility.ts | 20 |
| `permissionCodes` | tool | server/db/scripts/seed/exact-scope-compatibility-model.ts | 24, 28, 29 |
| `permissionCodes` | tool | server/db/scripts/seed/inventory-promotion-model.ts | 93 |
| `permissionCodes` | tool | server/db/scripts/seed/mesh-authorization-inventory-model.ts | 227, 232, 233 |
| `permissionCodes` | tool | server/db/scripts/seed/neon-authorization-inventory-model.ts | 213, 218, 219 |
| `permissionCodes` | runtime | server/packages/contracts/finance/src/commands.ts | 7 |
| `permissionCodes` | runtime | server/packages/planes/neon/src/finance-http.ts | 54 |
| `permissionCodes` | test | server/packages/planes/neon/src/finance-jobs.test.ts | 6 |
| `permissionCodes` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 13, 79 |
| `permissionCodes` | runtime | server/packages/services/finance/src/shared/permission-checker.ts | 6 |
| `permissions` | runtime | config/governance/meta-entity-contract-v2-coverage.json | 6998, 7042 |
| `permissions` | ui | packages/planes/neon/business-partner/src/customer-controls.tsx | 11, 71, 72 |
| `permissions` | ui | packages/planes/neon/business-partner/src/index.tsx | 44, 54, 58, 85 |
| `permissions` | test | packages/planes/neon/business-partner/src/workflow.test.ts | 5, 8, 9, 10, 11 |
| `permissions` | runtime | packages/planes/neon/business-partner/src/workflow.ts | 3 |
| `permissions` | ui | packages/planes/neon/list-view/src/index.tsx | 10, 14 |
| `permissions` | runtime | packages/platform/ai/agent-runtime/src/index.ts | 19, 136 |
| `permissions` | runtime | packages/platform/foundation/api-client/src/bootstrap.ts | 27, 50, 52 |
| `permissions` | ui | packages/platform/shell/app-foundation/src/index.tsx | 52, 53, 60, 119 |
| `permissions` | runtime | packages/platform/shell/shell-runtime/src/core.ts | 8, 19, 32, 37, 38, 52, 53 |
| `permissions` | runtime | packages/platform/shell/shell/src/core.ts | 24, 51 |
| `permissions` | runtime | packages/platform/shell/shell/src/home-personalization.ts | 64 |
| `permissions` | ui | packages/platform/shell/shell/src/home.tsx | 134, 296, 339 |
| `permissions` | runtime | packages/platform/shell/shell/src/messages.ts | 9 |
| `permissions` | tool | scripts/policy/authorization-inventory.ts | 733, 894, 913, 914, 953, 957 |
| `permissions` | tool | scripts/policy/host-capability-registry.mjs | 98 |
| `permissions` | tool | scripts/policy/host-capability-registry.test.mjs | 32 |
| `permissions` | tool | scripts/policy/verify-access-consumption-phase9.mjs | 12 |
| `permissions` | tool | scripts/policy/verify-shared-shell-phase8.mjs | 14, 20 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/documents-vertical.test.ts | 16 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/iam-audit-vertical.test.ts | 25, 54, 77 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/metadata-records-vertical.test.ts | 45, 48, 87, 90 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/policy-vertical.test.ts | 19 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/verification-routes.test.ts | 7 |
| `permissions` | test | server/apps/platform-host/src/composition/__tests__/workflow-vertical.test.ts | 20, 21 |
| `permissions` | runtime | server/apps/platform-host/src/composition/finance-routes.ts | 19 |
| `permissions` | runtime | server/apps/platform-host/src/composition/register-services.ts | 303, 306, 307, 308, 309, 783, 812, 918 |
| `permissions` | ddl | server/db/ddl/common/authz/00_schema.sql | 4 |
| `permissions` | ddl | server/db/ddl/common/authz/07_functions.sql | 578 |
| `permissions` | ddl | server/db/ddl/common/master/03_platform_tables.sql | 53, 191 |
| `permissions` | ddl | server/db/ddl/planes/neon/authz/14_permission_reference_seed.sql | 97, 277, 299, 324, 346, 379, 396, 403 |
| `permissions` | ddl | server/db/ddl/planes/neon/master/03_tables.sql | 1990 |
| `permissions` | ddl | server/db/ddl/planes/studio/authz/14_permission_reference_seed.sql | 142 |
| `permissions` | runtime | server/db/migrations/20260828_mesh_business_partner_profile_publication.sql | 77 |
| `permissions` | runtime | server/db/migrations/20260828_neon_business_partner_request_permissions.sql | 5, 15, 18, 30 |
| `permissions` | runtime | server/db/migrations/20260828_neon_mesh_business_partner_profile_projection.sql | 52 |
| `permissions` | runtime | server/db/migrations/20260829_neon_supplier_registration_permissions.sql | 2, 15, 16, 19 |
| `permissions` | runtime | server/db/migrations/20260831_neon_business_partner_catalog_ownership.sql | 144, 190 |
| `permissions` | test | server/db/scripts/__tests__/authorization/authorization-clean-slate.test.ts | 21, 23, 41, 46, 152, 166 |
| `permissions` | test | server/db/scripts/__tests__/authorization/canonical-catalog-v2.test.ts | 24, 28, 30, 48, 61, 77, 87, 100, 106 |
| `permissions` | test | server/db/scripts/__tests__/authorization/entity-operation-projection-compiler.test.ts | 76, 103, 131, 174 |
| `permissions` | test | server/db/scripts/__tests__/authorization/exact-scope-compatibility.test.ts | 14, 30, 43, 50, 82, 100 |
| `permissions` | test | server/db/scripts/__tests__/authorization/inventory-promotion.test.ts | 72, 122, 127 |
| `permissions` | test | server/db/scripts/__tests__/authorization/projection-reconciliation-authority.test.ts | 159 |
| `permissions` | test | server/db/scripts/__tests__/business-partner-360/business-partner-360-workforce-privacy.test.ts | 42, 53 |
| `permissions` | test | server/db/scripts/__tests__/business-partner-foundation/business-partner-customer-onboarding-parity.test.ts | 17, 75 |
| `permissions` | test | server/db/scripts/__tests__/business-partner-foundation/business-partner-definition-publication.test.ts | 57 |
| `permissions` | test | server/db/scripts/__tests__/business-partner-foundation/business-partner-supplier-registration-channel.test.ts | 17, 91 |
| `permissions` | test | server/db/scripts/__tests__/business-partner-foundation/business-partner-typed-materialization.test.ts | 114, 132 |
| `permissions` | tool | server/db/scripts/checks/ddl/platform-catalog.ts | 60 |
| `permissions` | tool | server/db/scripts/checks/seeds/authorization-release-gates.ts | 22, 24, 94, 100, 106, 107, 148, 149, 151, 158, 215, 442 |
| `permissions` | tool | server/db/scripts/operations/authorization/reset-authorization-clean-slate.ts | 111, 120 |
| `permissions` | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 60, 644, 647, 693, 701, 713 |
| `permissions` | tool | server/db/scripts/provisioning/provision-development-business-partner-runtime.ts | 190, 213, 225 |
| `permissions` | tool | server/db/scripts/provisioning/provision-three-tenant-demo-authorization.ts | 135, 140, 161, 216, 226, 227 |
| `permissions` | tool | server/db/scripts/provisioning/three-plane-model.ts | 178 |
| `permissions` | tool | server/db/scripts/reports/neon-authorization-quality.ts | 613, 634, 637 |
| `permissions` | tool | server/db/scripts/seed/build-exact-scope-compatibility.ts | 17, 23 |
| `permissions` | tool | server/db/scripts/seed/canonical-catalog-v2-model.ts | 34, 40, 42, 55, 56, 63 |
| `permissions` | tool | server/db/scripts/seed/compile-final-authorization-seed-packs.ts | 15, 44, 161, 228 |
| `permissions` | tool | server/db/scripts/seed/compile-mesh-authorization-inventory.ts | 185 |
| `permissions` | tool | server/db/scripts/seed/entity-operation-projection-compiler.ts | 65, 66 |
| `permissions` | tool | server/db/scripts/seed/exact-scope-compatibility-model.ts | 12, 30, 39, 60, 65 |
| `permissions` | tool | server/db/scripts/seed/inventory-promotion-model.ts | 88, 89, 90, 91, 93, 94, 101 |
| `permissions` | tool | server/db/scripts/seed/validate-canonical-catalogs.ts | 28, 47, 74, 79 |
| `permissions` | test | server/db/scripts/tests/integration/atlas/tools-rls.ts | 175 |
| `permissions` | runtime | server/db/seed-backup/contracts/authorization/authority/mesh/authority.v1.json | 22 |
| `permissions` | runtime | server/db/seed-backup/contracts/authorization/catalog/mesh/compiled/verification-report.v1.json | 11 |
| `permissions` | runtime | server/db/seed-backup/contracts/authorization/catalog/neon-admin/catalog.v1.json | 13 |
| `permissions` | runtime | server/db/seed-backup/contracts/authorization/catalog/neon-admin/compiled/verification-report.v1.json | 11, 102, 103, 104, 105, 106 |
| `permissions` | runtime | server/db/seed-backup/meta-entity/990_assertions/010_contract_assertions.sql | 153 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/mesh/catalog.v2.json | 7 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/mesh/scope-compatibility.v1.json | 6 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/neon/catalog.v2.json | 7 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/neon/scope-compatibility.v1.json | 6 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/studio/catalog.v2.json | 7 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/studio/scope-compatibility.v1.json | 6 |
| `permissions` | runtime | server/db/seed/contracts/authorization/control/cross-plane-suspension-control.v1.json | 13 |
| `permissions` | runtime | server/db/seed/contracts/authorization/inventory/neon/promotion/catalog.v2.candidate.json | 7 |
| `permissions` | runtime | server/db/seed/contracts/authorization/inventory/neon/promotion/scope-compatibility.v1.candidate.json | 6 |
| `permissions` | runtime | server/db/seed/packs/authorization-v2/mesh/seed-pack.v1.json | 568 |
| `permissions` | runtime | server/db/seed/packs/authorization-v2/neon/seed-pack.v1.json | 424 |
| `permissions` | runtime | server/db/seed/packs/authorization-v2/studio/seed-pack.v1.json | 456 |
| `permissions` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 42, 56 |
| `permissions` | runtime | server/packages/adapters/experience-postgres/src/index.ts | 111 |
| `permissions` | runtime | server/packages/contracts/ai/src/experience-configuration.ts | 9 |
| `permissions` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 12, 34, 35, 39 |
| `permissions` | runtime | server/packages/contracts/auth/src/authorization.ts | 87 |
| `permissions` | runtime | server/packages/contracts/finance/src/index.ts | 9 |
| `permissions` | test | server/packages/planes/mesh/src/business-partner-bank-disclosure.test.ts | 5 |
| `permissions` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3, 6, 7 |
| `permissions` | test | server/packages/planes/neon/src/business-partner-account-bank-linkage.test.ts | 6 |
| `permissions` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6, 20 |
| `permissions` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7, 23, 30 |
| `permissions` | test | server/packages/planes/neon/src/finance-http.test.ts | 7 |
| `permissions` | runtime | server/packages/planes/neon/src/finance-http.ts | 54 |
| `permissions` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 13 |
| `permissions` | test | server/packages/planes/neon/src/register-finance.test.ts | 7 |
| `permissions` | runtime | server/packages/planes/neon/src/register-finance.ts | 73, 91, 95, 98, 99, 102, 106 |
| `permissions` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 5 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7, 37 |
| `permissions` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15 |
| `permissions` | runtime | server/packages/platform/ai/src/context.ts | 13, 14, 15, 16, 22, 23, 24, 25 |
| `permissions` | runtime | server/packages/platform/ai/src/experience-configuration.ts | 18, 19, 28, 86 |
| `permissions` | runtime | server/packages/platform/ai/src/knowledge.ts | 20 |
| `permissions` | runtime | server/packages/platform/ai/src/surface-draft-generation.ts | 109 |
| `permissions` | runtime | server/packages/platform/ai/src/tool-service.ts | 80, 196 |
| `permissions` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 58 |
| `permissions` | test | server/packages/platform/control-admin/src/authorization-management-service.test.ts | 69 |
| `permissions` | test | server/packages/platform/control-admin/src/cycle/cycle-config-service.test.ts | 46 |
| `permissions` | runtime | server/packages/platform/experience/src/contracts.ts | 74, 140, 172 |
| `permissions` | runtime | server/packages/platform/experience/src/ports.ts | 105 |
| `permissions` | test | server/packages/platform/experience/src/service.test.ts | 15, 22, 34, 37, 52, 53, 55, 58, 60, 75, 96, 100, 113, 125, 132, 156, 168 |
| `permissions` | runtime | server/packages/platform/experience/src/service.ts | 63, 64, 70, 71, 76, 77, 159, 177, 194, 228, 235, 237, 240, 265 |
| `permissions` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `permissions` | test | server/packages/platform/governance/src/routes/governance-routes.test.ts | 9 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/authorization-golden-corpus.test.ts | 23, 27, 28 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/iam-service.test.ts | 13, 35, 38, 39, 40, 44, 59, 61 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/identity-saga.test.ts | 123 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 8, 30, 31, 67, 68, 85, 91 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10 |
| `permissions` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `permissions` | runtime | server/packages/platform/iam/src/iam-routes.ts | 34 |
| `permissions` | runtime | server/packages/platform/iam/src/iam-service.ts | 46, 101, 102, 104, 106, 109, 110, 172, 174, 200, 201 |
| `permissions` | runtime | server/packages/platform/iam/src/kysely-identity-context-resolver.ts | 58, 63 |
| `permissions` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 11, 12, 13, 19, 27, 30, 33, 36, 39, 41, 58, 65, 70, 71 |
| `permissions` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `permissions` | test | server/packages/platform/notifications/src/__tests__/notification-operations.test.ts | 12 |
| `permissions` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `permissions` | test | server/packages/platform/search/src/__tests__/document-search-service.test.ts | 3 |
| `permissions` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 22, 79 |
| `permissions` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 3 |
| `permissions` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `permissions` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 35 |
| `permissions` | runtime | server/packages/services/finance/src/budget/budget-service.ts | 7, 12, 32, 48, 51, 56 |
| `permissions` | test | server/packages/services/finance/src/closing/closing-services.test.ts | 9, 17, 19, 21, 23, 25 |
| `permissions` | runtime | server/packages/services/finance/src/closing/closing-services.ts | 7, 12, 29, 41, 54, 56, 71 |
| `permissions` | test | server/packages/services/finance/src/inventory/f4-acceptance.test.ts | 9, 61 |
| `permissions` | runtime | server/packages/services/finance/src/inventory/inventory-service.ts | 52, 65, 75, 80, 136 |
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
| `permissions` | test | server/packages/services/master-data/src/__tests__/business-partner-360-service.test.ts | 2 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/business-partner-eligibility-service.test.ts | 6, 8, 11, 14 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/business-partner-request-service.test.ts | 8, 40, 43, 52, 72, 78, 98, 121, 126, 128, 140, 162, 164, 168 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/customer-onboarding-service.test.ts | 10, 12 |
| `permissions` | test | server/packages/services/master-data/src/__tests__/workforce-service.test.ts | 6, 16, 21, 22 |
| `permissions` | runtime | server/packages/services/master-data/src/business-partner-360-service.ts | 22, 40, 42 |
| `permissions` | runtime | server/packages/services/master-data/src/kysely-business-partner-360-repository.ts | 27, 54, 55 |
| `permissions` | test | server/packages/services/publication/src/__tests__/studio-authority-ddl.test.ts | 9 |
| `permissions` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `permissions` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `permissions` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 39, 43, 46, 133 |
| `permissions` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `permissions` | runtime | server/packages/services/records/src/entity-list-service.ts | 188, 299 |
| `permissions` | runtime | server/packages/services/records/src/query-service.ts | 93 |
| `permissions` | runtime | server/packages/services/records/src/transfer/transfer-jobs.ts | 121 |
| `permissions` | runtime | server/packages/services/records/src/transfer/transfer-service.ts | 315 |
| `permissions` | runtime | server/packages/test-utils/src/index.ts | 16, 22 |
| `permissions` | test | tests/contracts/access-consumption-phase9.test.ts | 6, 20, 25, 28, 29 |
| `permissions` | test | tests/contracts/app-composition-phase10.test.ts | 24 |
| `permissions` | test | tests/contracts/first-business-module-readiness.test.ts | 11 |
| `permissions` | test | tests/contracts/home-personalization-phase3.test.ts | 19 |
| `permissions` | test | tests/contracts/platform-catalog-experience.test.ts | 192 |
| `permissions` | test | tests/contracts/query-provider-lifecycle.test.ts | 13 |
| `permissions` | test | tests/contracts/shared-shell-navigation.test.ts | 11, 28, 37, 47, 48, 74 |
| `permissions` | test | tests/foundation/access-gates-phase9.test.tsx | 6 |
| `persona` | runtime | config/governance/authorization-data-disposition-policy.v1.json | 308 |
| `persona` | runtime | config/governance/authorization-legacy-freeze-baseline.v1.json | 6496, 6648, 6662, 6663, 6670, 6671, 6678, 6679, 6686, 6687, 6694, 6695, 6702, 6703, 6710, 6711, 6718, 6719, 6726, 6727, 6734, 6735, 6742, 6743, 6750, 6751, 6752, 6758, 6759, 6766, 6767, 6774, 6775, 6782, 6783, 6790, 6791, 6798, 6799, 7040, 7048, 7056 |
| `persona` | runtime | config/governance/authorization-wave9-legacy-removal-manifest.v1.json | 24, 74, 75 |
| `persona` | tool | scripts/policy/authorization-inventory.ts | 555, 734, 739 |
| `persona` | test | server/db/scripts/__tests__/authorization/cirrusatlantic-demo-authorization.test.ts | 14, 17, 19, 21, 28 |
| `persona` | tool | server/db/scripts/checks/seeds/authorization.ts | 72 |
| `persona` | tool | server/db/scripts/provisioning/cirrusatlantic-demo-authorization-model.ts | 64, 65, 66, 67, 68, 70, 72 |
| `persona` | tool | server/db/scripts/provisioning/provision-cirrusatlantic-demo-authorization.ts | 35, 56, 57, 58, 59, 60, 61, 64, 149, 158, 159, 163, 164, 169, 172, 173, 179, 184, 185, 190, 193, 194, 198, 199, 209, 210, 222, 233, 234 |
| `persona` | tool | server/db/scripts/provisioning/provision-three-tenant-demo-authorization.ts | 68 |
| `persona` | runtime | server/db/seed-backup/contracts/authorization/evaluator/mesh/repository-contract.v1.json | 25 |
| `persona` | runtime | server/db/seed-backup/contracts/authorization/evaluator/neon-admin/repository-contract.v1.json | 24 |
| `persona` | keycloak | stack/config/iam/realm-athyper-demosetup.json | 1703, 1745, 1778, 1811, 1848, 1881, 1914, 1947, 1989, 2022, 2055, 2092, 2125, 2158, 2191, 2233, 2266, 2299, 2336, 2369, 2402, 2435, 2477, 2510, 2543, 2580, 2613, 2646, 2679, 2721, 2754, 2787, 2824, 2857, 2890, 2923, 2965, 2998, 3031, 3068, 3101, 3134, 3167, 3209, 3242, 3275, 3312, 3345, 3378, 3411, 3453, 3486, 3519, 3556, 3589, 3622, 3655, 3697, 3730, 3763, 3800, 3833, 3866, 3899, 3941, 3974, 4007, 4044, 4077, 4110, 4143, 4185, 4218, 4251, 4288, 4321, 4354, 4387, 4429, 4462, 4495, 4532, 4565, 4598, 4631, 4673, 4706, 4739, 4776, 4809, 4842, 4875, 4917, 4950, 4983, 5020, 5053, 5086, 5119, 5161, 5194, 5227, 5264, 5297, 5330, 5367, 5400, 5433, 5470, 5507, 5549, 5582, 5615, 5652, 5685, 5718, 5751, 5793, 5826, 5859, 5896, 5929, 5962, 5995, 6037, 6070, 6103, 6140, 6173, 6206, 6749, 6782, 6815 |
| `persona` | tool | tools/scripts/generate-athyper-demo-iam.cjs | 71, 85, 99, 100, 101, 117, 128, 132, 140, 141, 147, 148, 163, 254 |
| `persona` | tool | tools/scripts/verify-athyper-demo-iam.cjs | 107, 108, 110 |
| `personaId` | runtime | config/governance/authorization-golden-corpus.schema.json | 212 |
| `personaId` | tool | scripts/policy/authorization-inventory.ts | 752 |
| `planeExcluded` | runtime | server/apps/platform-host/src/composition/register-services.ts | 918 |
| `planeExcluded` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `planeExcluded` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 23 |
| `planeExcluded` | runtime | server/packages/contracts/auth/src/authorization.ts | 78 |
| `planeExcluded` | test | server/packages/planes/mesh/src/business-partner-bank-disclosure.test.ts | 5 |
| `planeExcluded` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3 |
| `planeExcluded` | test | server/packages/planes/neon/src/business-partner-account-bank-linkage.test.ts | 6 |
| `planeExcluded` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6 |
| `planeExcluded` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7 |
| `planeExcluded` | test | server/packages/planes/neon/src/finance-http.test.ts | 7 |
| `planeExcluded` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 13 |
| `planeExcluded` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 5 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7 |
| `planeExcluded` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15 |
| `planeExcluded` | runtime | server/packages/platform/ai/src/context.ts | 25 |
| `planeExcluded` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 58 |
| `planeExcluded` | test | server/packages/platform/experience/src/service.test.ts | 15 |
| `planeExcluded` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `planeExcluded` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `planeExcluded` | test | server/packages/platform/iam/src/__tests__/identity-saga.test.ts | 123 |
| `planeExcluded` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 11 |
| `planeExcluded` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10 |
| `planeExcluded` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `planeExcluded` | runtime | server/packages/platform/iam/src/iam-service.ts | 185 |
| `planeExcluded` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 284 |
| `planeExcluded` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 33 |
| `planeExcluded` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `planeExcluded` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `planeExcluded` | test | server/packages/platform/search/src/__tests__/document-search-service.test.ts | 3 |
| `planeExcluded` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 79 |
| `planeExcluded` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 3 |
| `planeExcluded` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `planeExcluded` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 35 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 43 |
| `planeExcluded` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `planLocked` | tool | scripts/policy/authorization-inventory.ts | 752 |
| `planLocked` | runtime | server/apps/platform-host/src/composition/register-services.ts | 918 |
| `planLocked` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `planLocked` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 22 |
| `planLocked` | runtime | server/packages/contracts/auth/src/authorization.ts | 77 |
| `planLocked` | test | server/packages/planes/mesh/src/business-partner-bank-disclosure.test.ts | 5 |
| `planLocked` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3 |
| `planLocked` | test | server/packages/planes/neon/src/business-partner-account-bank-linkage.test.ts | 6 |
| `planLocked` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6 |
| `planLocked` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7 |
| `planLocked` | test | server/packages/planes/neon/src/finance-http.test.ts | 7 |
| `planLocked` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 13 |
| `planLocked` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 5 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7 |
| `planLocked` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15 |
| `planLocked` | runtime | server/packages/platform/ai/src/context.ts | 24 |
| `planLocked` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 58 |
| `planLocked` | test | server/packages/platform/experience/src/service.test.ts | 15 |
| `planLocked` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `planLocked` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `planLocked` | test | server/packages/platform/iam/src/__tests__/identity-saga.test.ts | 123 |
| `planLocked` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 11 |
| `planLocked` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10 |
| `planLocked` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `planLocked` | runtime | server/packages/platform/iam/src/iam-service.ts | 184 |
| `planLocked` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 262, 267, 283 |
| `planLocked` | runtime | server/packages/platform/iam/src/permission-authorizer.ts | 30 |
| `planLocked` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `planLocked` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `planLocked` | test | server/packages/platform/search/src/__tests__/document-search-service.test.ts | 3 |
| `planLocked` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 79 |
| `planLocked` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 3 |
| `planLocked` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `planLocked` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 35 |
| `planLocked` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `planLocked` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `planLocked` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 43 |
| `planLocked` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `principalFingerprint` | runtime | server/apps/platform-host/src/composition/register-services.ts | 918 |
| `principalFingerprint` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `principalFingerprint` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 16 |
| `principalFingerprint` | runtime | server/packages/contracts/auth/src/authorization.ts | 69 |
| `principalFingerprint` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3 |
| `principalFingerprint` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6 |
| `principalFingerprint` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7 |
| `principalFingerprint` | test | server/packages/planes/neon/src/finance-http.test.ts | 7 |
| `principalFingerprint` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 13 |
| `principalFingerprint` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 5 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 8 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 9 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 7 |
| `principalFingerprint` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 15 |
| `principalFingerprint` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 58 |
| `principalFingerprint` | test | server/packages/platform/experience/src/service.test.ts | 15 |
| `principalFingerprint` | runtime | server/packages/platform/experience/src/service.ts | 240 |
| `principalFingerprint` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `principalFingerprint` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `principalFingerprint` | test | server/packages/platform/iam/src/__tests__/identity-saga.test.ts | 123 |
| `principalFingerprint` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 9 |
| `principalFingerprint` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 10 |
| `principalFingerprint` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `principalFingerprint` | runtime | server/packages/platform/iam/src/iam-service.ts | 178 |
| `principalFingerprint` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 277 |
| `principalFingerprint` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `principalFingerprint` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `principalFingerprint` | test | server/packages/platform/search/src/__tests__/document-search-service.test.ts | 3 |
| `principalFingerprint` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 79 |
| `principalFingerprint` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 3 |
| `principalFingerprint` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `principalFingerprint` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 35 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 43, 133 |
| `principalFingerprint` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `principalFingerprint` | runtime | server/packages/services/records/src/entity-list-service.ts | 299 |
| `principalFingerprint` | runtime | server/packages/services/records/src/query-service.ts | 93 |
| `profileHash` | runtime | packages/contracts/platform/authorization/src/index.ts | 2, 18 |
| `profileHash` | runtime | packages/contracts/platform/fixtures/authorization-snapshot.v1.json | 3 |
| `profileHash` | runtime | packages/contracts/platform/fixtures/platform-bootstrap.v1.json | 22 |
| `profileHash` | test | server/apps/platform-host/src/composition/__tests__/verification-routes.test.ts | 7 |
| `profileHash` | runtime | server/apps/platform-host/src/composition/register-services.ts | 917, 918 |
| `profileHash` | test | server/packages/adapters/experience-postgres/src/experience.postgres.test.ts | 56 |
| `profileHash` | test | server/packages/contracts/auth/src/__tests__/api.test.ts | 17, 35 |
| `profileHash` | runtime | server/packages/contracts/auth/src/authorization.ts | 70, 88 |
| `profileHash` | test | server/packages/planes/mesh/src/business-partner-profile-publication.test.ts | 3 |
| `profileHash` | test | server/packages/planes/neon/src/business-partner-profile-match.test.ts | 6 |
| `profileHash` | test | server/packages/planes/neon/src/business-partner-profile-projection.test.ts | 7 |
| `profileHash` | test | server/packages/planes/neon/src/finance-http.test.ts | 7 |
| `profileHash` | test | server/packages/planes/neon/src/record-collection-scope.test.ts | 13 |
| `profileHash` | test | server/packages/planes/studio/onboarding/src/case-lifecycle.test.ts | 5 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/a2-operations.test.ts | 7, 8 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/experience-configuration.test.ts | 8 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/failover.test.ts | 6 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 8, 9 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/runtime.test.ts | 6 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/surface-draft-generation.test.ts | 6, 7 |
| `profileHash` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 14, 15 |
| `profileHash` | runtime | server/packages/platform/ai/src/context.ts | 10, 16 |
| `profileHash` | runtime | server/packages/platform/ai/src/kysely-tool-proposal-store.ts | 176 |
| `profileHash` | runtime | server/packages/platform/ai/src/record-data-gateway.ts | 36 |
| `profileHash` | runtime | server/packages/platform/ai/src/tool-service.ts | 76, 77, 80, 120, 129 |
| `profileHash` | test | server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 58 |
| `profileHash` | test | server/packages/platform/experience/src/service.test.ts | 14, 15 |
| `profileHash` | runtime | server/packages/platform/experience/src/service.ts | 31, 229, 240 |
| `profileHash` | test | server/packages/platform/governance/src/moderation/moderation-service.test.ts | 18 |
| `profileHash` | test | server/packages/platform/iam/src/__tests__/authorization-golden-corpus.test.ts | 27 |
| `profileHash` | test | server/packages/platform/iam/src/__tests__/identity-provisioning-lifecycle.test.ts | 2 |
| `profileHash` | test | server/packages/platform/iam/src/__tests__/identity-saga.test.ts | 123 |
| `profileHash` | test | server/packages/platform/iam/src/__tests__/permission-authorizer.test.ts | 7, 10 |
| `profileHash` | test | server/packages/platform/iam/src/__tests__/provisioning-vertical.test.ts | 9, 10 |
| `profileHash` | test | server/packages/platform/iam/src/__tests__/trustiam-authority.test.ts | 6 |
| `profileHash` | runtime | server/packages/platform/iam/src/iam-service.ts | 102, 110, 179, 201 |
| `profileHash` | runtime | server/packages/platform/iam/src/kysely-permission-resolver.ts | 272, 278 |
| `profileHash` | test | server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 6 |
| `profileHash` | test | server/packages/platform/policy/src/__tests__/policy-service.test.ts | 9 |
| `profileHash` | test | server/packages/platform/search/src/__tests__/document-search-service.test.ts | 3 |
| `profileHash` | test | server/packages/platform/workflow/src/__tests__/workflow-service.test.ts | 79 |
| `profileHash` | test | server/packages/services/attachments/src/attachment-routes.test.ts | 3 |
| `profileHash` | test | server/packages/services/content/src/content-service.test.ts | 2 |
| `profileHash` | test | server/packages/services/documents/src/__tests__/document-service.test.ts | 35 |
| `profileHash` | test | server/packages/services/master-data/src/__tests__/business-partner-360-service.test.ts | 2 |
| `profileHash` | test | server/packages/services/master-data/src/__tests__/business-partner-request-service.test.ts | 8 |
| `profileHash` | test | server/packages/services/records/src/__tests__/advanced-records.test.ts | 9 |
| `profileHash` | test | server/packages/services/records/src/__tests__/entity-list-service.test.ts | 20 |
| `profileHash` | test | server/packages/services/records/src/__tests__/records-vertical.test.ts | 42, 43 |
| `profileHash` | test | server/packages/services/records/src/__tests__/transfer-jobs.test.ts | 8 |
| `profileHash` | runtime | server/packages/services/records/src/entity-list-service.ts | 299 |
| `profileHash` | runtime | server/packages/services/records/src/query-service.ts | 93 |
| `profileHash` | runtime | server/packages/test-utils/src/index.ts | 15, 22 |
| `profileHash` | test | tests/contracts/api-client-transport.test.ts | 97 |
| `profileHash` | test | tests/contracts/frontend-spine-browser-contracts.test.ts | 21 |
| `required_permission` | tool | scripts/policy/authorization-inventory.ts | 894, 912 |
| `required_permission` | runtime | server/db/seed-backup/contracts/authorization/catalog/neon-admin/catalog.v1.json | 76 |
| `required_permission` | runtime | server/db/seed-backup/contracts/authorization/catalog/neon-admin/compiled/compiled-catalog.v1.json | 45 |
| `required_permissions` | runtime | server/db/seed-backup/contracts/authorization/catalog/neon-admin/catalog.v1.json | 66 |
| `required_permissions` | runtime | server/db/seed-backup/contracts/authorization/catalog/neon-admin/compiled/compiled-catalog.v1.json | 31 |
| `requiredPermission` | runtime | packages/contracts/platform/entity-list/src/parsers.ts | 140 |
| `requiredPermission` | runtime | packages/contracts/platform/entity-list/src/types.ts | 110 |
| `requiredPermission` | tool | scripts/policy/authorization-inventory.ts | 912 |
| `requiredPermission` | runtime | server/packages/services/records/src/entity-list-service.ts | 178, 179 |
| `requiredPermission` | test | tests/contracts/entity-list-contract.test.ts | 41, 46 |
| `requiredPermissions` | ui | apps/neon/lib/experience-runtime.tsx | 20, 21, 22, 25, 26, 27 |
| `requiredPermissions` | runtime | packages/planes/mesh/shell/src/navigation.ts | 11 |
| `requiredPermissions` | runtime | packages/planes/neon/navigation/src/index.ts | 12 |
| `requiredPermissions` | runtime | packages/planes/studio/shell/src/navigation.ts | 11 |
| `requiredPermissions` | runtime | packages/platform/shell/shell-runtime/src/core.ts | 29, 51 |
| `requiredPermissions` | runtime | packages/platform/shell/shell/src/core.ts | 10, 39, 51 |
| `requiredPermissions` | runtime | packages/platform/shell/shell/src/home-personalization.ts | 8, 47, 59, 64 |
| `requiredPermissions` | tool | scripts/policy/verify-shared-shell-phase8.mjs | 12, 26 |
| `requiredPermissions` | ui | scripts/verification/shell-browser-entry.tsx | 6 |
| `requiredPermissions` | runtime | server/packages/contracts/ai/src/tools.ts | 19 |
| `requiredPermissions` | test | server/packages/platform/ai/src/__tests__/governance.test.ts | 24, 33, 41 |
| `requiredPermissions` | test | server/packages/platform/ai/src/__tests__/tool-ledger-lifecycle.test.ts | 17 |
| `requiredPermissions` | runtime | server/packages/platform/ai/src/runtime-tool-coordinator.ts | 17 |
| `requiredPermissions` | runtime | server/packages/platform/ai/src/tool-service.ts | 56, 78, 118, 196 |
| `requiredPermissions` | test | tests/contracts/access-consumption-phase9.test.ts | 5, 31, 32 |
| `requiredPermissions` | test | tests/contracts/app-composition-phase10.test.ts | 24 |
| `requiredPermissions` | test | tests/contracts/first-business-module-readiness.test.ts | 12 |
| `requiredPermissions` | test | tests/contracts/home-personalization-phase3.test.ts | 26, 27, 34 |
| `requiredPermissions` | test | tests/contracts/shared-shell-navigation.test.ts | 7, 8, 9, 25, 26, 36, 74, 83 |
| `requiredPermissions` | test | tests/foundation/access-gates-phase9.test.tsx | 9 |
| `requiredPermissions` | test | tests/foundation/activity-center-interactions.test.tsx | 10 |
| `requiredPermissions` | test | tests/foundation/quick-access-interactions.test.tsx | 10 |
| `roleIds` | tool | scripts/policy/authorization-inventory.ts | 735, 752 |
| `roleIds` | test | server/db/scripts/__tests__/provisioning/three-plane-provision.test.ts | 217, 227, 231 |
| `roleIds` | tool | server/db/scripts/checks/seeds/authorization-release-gates.ts | 121, 126 |
| `roleIds` | tool | server/db/scripts/provisioning/authorization-pack-applicator.ts | 111, 117, 196, 198 |
| `roleIds` | tool | server/db/scripts/provisioning/three-plane-model.ts | 126 |
| `roleIds` | tool | server/db/scripts/seed/compile-final-authorization-seed-packs.ts | 80, 81, 82 |
| `roleIds` | tool | server/db/scripts/seed/tenant-authority-projection.ts | 24, 229, 272, 276, 285 |
| `roleIds` | runtime | server/db/seed-backup/contracts/authorization/authority/mesh/compiled/compiled-authority.v1.json | 282, 292, 302, 312, 322 |
| `roleIds` | runtime | server/db/seed-backup/contracts/authorization/authority/neon-admin/compiled/compiled-authority.v1.json | 2661, 2671, 2681, 2691, 2701, 2711, 2721, 2731, 2739, 2749 |
| `roleIds` | runtime | server/db/seed-backup/contracts/authorization/authority/neon-admin/compiled/development-existing-user-group-manifest.v1.json | 26, 54, 82, 110, 138, 160, 190, 220, 250, 280, 308, 327, 346, 376, 395, 414, 444, 472, 571, 590, 700, 799, 818, 928, 958, 988, 1018, 1048, 1078, 1177, 1196, 1306, 1405, 1424, 1534, 1564, 1594, 1624, 1654, 1684, 1703, 1722, 1752, 1771, 1790, 1820, 1850, 1880, 1910, 1940, 1970, 1989, 2008, 2038, 2057, 2076, 2106, 2136, 2166, 2196, 2226, 2256, 2275, 2294, 2324, 2343, 2362, 2392, 2422, 2452, 2482, 2512, 2542, 2561, 2580, 2610, 2629, 2648, 2678, 2708, 2738, 2768, 2798, 2828, 2847, 2866, 2896, 2915, 2934, 2964, 2994, 3024, 3054, 3084, 3114, 3133, 3152, 3182, 3201, 3220, 3250, 3280, 3310, 3340, 3370, 3400, 3419, 3438, 3468, 3487, 3506, 3536, 3566, 3596, 3626, 3656, 3686, 3705, 3724, 3754, 3773, 3792, 3822, 3852, 3882, 3912, 3942, 3972, 3991, 4010, 4040, 4059, 4078, 4108, 4138, 4168, 4198, 4228, 4258, 4277, 4296, 4326, 4345, 4364, 4394, 4424, 4454, 4484, 4514, 4544, 4563, 4582, 4612, 4631, 4650, 4680, 4710, 4740, 4770, 4800, 4830, 4849, 4868, 4898, 4917, 4936, 4966, 4996, 5026, 5056, 5086, 5116, 5135, 5154, 5184, 5203, 5222, 5252, 5282, 5312, 5342, 5372, 5402, 5421, 5440, 5470, 5489, 5508, 5538, 5568, 5598, 5628, 5658, 5688, 5707, 5726, 5756, 5775, 5794, 5824, 5854, 5884, 5914, 5944, 5974, 5993, 6012, 6042, 6061, 6080, 6110, 6144, 6163, 6208, 6242, 6261, 6306, 6325, 6355, 6374, 6404, 6423, 6453, 6483, 6513, 6543, 6573, 6603, 6633, 6663, 6693, 6723 |
| `roleIds` | runtime | server/db/seed-backup/packs/authorization-v2/mesh/seed-pack.v1.json | 1159, 1169, 1179, 1189, 1199, 1825, 1855, 1885, 1995, 2105, 2215, 2325, 2355, 2385, 2415, 2445, 2475, 2505, 2535, 2565, 2595, 2625, 2655, 2685, 2715, 2745, 2775, 2805, 2835, 2865, 2895, 2925, 2955, 2985, 3015, 3045, 3075, 3105, 3135, 3165, 3195, 3225, 3255, 3285, 3330, 3375, 3405, 3435, 3465, 3495, 3525, 3555 |
| `roleIds` | runtime | server/db/seed-backup/packs/authorization-v2/neon-admin/seed-pack.v1.json | 2704, 2714, 2724, 2734, 2744, 2754, 2764, 2774, 2782, 2792, 20442, 20470, 20498, 20526, 20554, 20576, 20606, 20636, 20666, 20696, 20724, 20743, 20773, 20792, 20822, 20850, 20949, 20979, 21078, 21108, 21138, 21168, 21198, 21228, 21258, 21357, 21387, 21486, 21516, 21546, 21576, 21606, 21636, 21666, 21685, 21715, 21734, 21764, 21794, 21824, 21854, 21884, 21914, 21933, 21963, 21982, 22012, 22042, 22072, 22102, 22132, 22162, 22181, 22211, 22230, 22260, 22290, 22320, 22350, 22380, 22410, 22429, 22459, 22478, 22508, 22538, 22568, 22598, 22628, 22658, 22677, 22707, 22726, 22756, 22786, 22816, 22846, 22876, 22906, 22925, 22955, 22974, 23004, 23034, 23064, 23094, 23124, 23154, 23173, 23203, 23222, 23252, 23282, 23312, 23342, 23372, 23402, 23421, 23451, 23470, 23500, 23530, 23560, 23590, 23620, 23650, 23669, 23699, 23718, 23748, 23778, 23808, 23838, 23868, 23898, 23917, 23947, 23966, 23996, 24026, 24056, 24086, 24116, 24146, 24165, 24195, 24214, 24244, 24274, 24304, 24334, 24364, 24394, 24413, 24443, 24462, 24492, 24522, 24552, 24582, 24612, 24642, 24661, 24691, 24710, 24740, 24770, 24800, 24830, 24860, 24890, 24909, 24939, 24958, 24988, 25018, 25048, 25078, 25108, 25138, 25157, 25187, 25206, 25236, 25266, 25296, 25326, 25356, 25386, 25405, 25435, 25454, 25484, 25518, 25548, 25582, 25612, 25631, 25661, 25680, 25710, 25729, 25759, 25789, 25819 |
| `roleIds` | runtime | server/db/seed/packs/authorization-v2/mesh/seed-pack.v1.json | 1134, 1982, 2006, 2030, 2054, 2078, 2102, 2126, 2150, 2174, 2198, 2222, 2246, 2270, 2294, 2318, 2342, 2366, 2390, 2414, 2438, 2462, 2486, 2510, 2534, 2558, 2582, 2606, 2630, 2654, 2678, 2702, 2726, 2750, 2774, 2798, 2822, 2846, 2870, 2894, 2918, 2942, 2966, 2990, 3014, 3038, 3062, 3086, 3110, 3134, 3158, 3182, 3206, 3230, 3254 |
| `roleIds` | runtime | server/db/seed/packs/authorization-v2/neon/seed-pack.v1.json | 773, 2979, 3003, 3027, 3051, 3075, 3099, 3123, 3147, 3171, 3195, 3219, 3243, 3267, 3291, 3315, 3339, 3363, 3387, 3411, 3435, 3459, 3483, 3507, 3531, 3555, 3579, 3603, 3627, 3651, 3675, 3699, 3723, 3747, 3771, 3795, 3819, 3843, 3867, 3891, 3915, 3939, 3963, 3987, 4011, 4035, 4059, 4083, 4107, 4131, 4155, 4179, 4203, 4227, 4251, 4275, 4299, 4323, 4347, 4371, 4395, 4419, 4443, 4467, 4491, 4515, 4539, 4563, 4587, 4611, 4635, 4659, 4683, 4707, 4731, 4755, 4779, 4803, 4827, 4851, 4875, 4899, 4923, 4947, 4971, 4995, 5019, 5043, 5067, 5091, 5115, 5139, 5163, 5187, 5211, 5235, 5259, 5283, 5307, 5331, 5355, 5379, 5403, 5427, 5451, 5475, 5499, 5523, 5547, 5571, 5595, 5619, 5643, 5667, 5691, 5715, 5739, 5763, 5787, 5811, 5835, 5859, 5883, 5907, 5931, 5955, 5979, 6003, 6027, 6051, 6075, 6099, 6123, 6147, 6171, 6195, 6219, 6243, 6267, 6291, 6315, 6339, 6363, 6387, 6411, 6435, 6459, 6483, 6507, 6531, 6555, 6579 |
| `roleIds` | runtime | server/db/seed/packs/authorization-v2/studio/seed-pack.v1.json | 771, 1255, 1279, 1303, 1327, 1351, 1375, 1399, 1423, 1447, 1471, 1495, 1519, 1543, 1567, 1591, 1615, 1639, 1663, 1687, 1711, 1735, 1759, 1783, 1807, 1831, 1855, 1879, 1903 |
| `roleIds` | tool | tools/scripts/update-realm-neon.cjs | 94, 96 |

## Keycloak mapper inventory

| Source | JSON path | Name | Mapper | User attribute | Claim | Hardcoded role |
|---|---|---|---|---|---|---|
| stack/config/iam/realm-athyper-clean-slate.json | clients.1.protocolMappers.0 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clients.10.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clients.11.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clients.12.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clients.13.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clients.3.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clients.5.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clients.6.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clients.8.protocolMappers.0 | locale | oidc-usermodel-attribute-mapper | locale | locale | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.0.protocolMappers.0 | role list | saml-role-list-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.1.protocolMappers.0 | Client ID | oidc-usersessionmodel-note-mapper | — | client_id | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.1.protocolMappers.1 | Client Host | oidc-usersessionmodel-note-mapper | — | clientHost | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.1.protocolMappers.2 | Client IP Address | oidc-usersessionmodel-note-mapper | — | clientAddress | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.10.protocolMappers.0 | allowed web origins | oidc-allowed-origins-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.11.protocolMappers.0 | client roles | oidc-usermodel-client-role-mapper | foo | resource_access.${client_id}.roles | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.11.protocolMappers.1 | realm roles | oidc-usermodel-realm-role-mapper | foo | realm_access.roles | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.11.protocolMappers.2 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.12.protocolMappers.0 | auth_time | oidc-usersessionmodel-note-mapper | — | auth_time | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.12.protocolMappers.1 | sub | oidc-sub-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.14.protocolMappers.0 | organization | saml-organization-membership-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.15.protocolMappers.0 | plane | oidc-hardcoded-claim-mapper | — | plane | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.15.protocolMappers.1 | realm_key | oidc-hardcoded-claim-mapper | — | realm_key | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.15.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.16.protocolMappers.0 | plane | oidc-hardcoded-claim-mapper | — | plane | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.16.protocolMappers.1 | realm_key | oidc-hardcoded-claim-mapper | — | realm_key | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.16.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.17.protocolMappers.0 | plane | oidc-hardcoded-claim-mapper | — | plane | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.17.protocolMappers.1 | realm_key | oidc-hardcoded-claim-mapper | — | realm_key | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.17.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.2.protocolMappers.0 | email verified | oidc-usermodel-property-mapper | emailVerified | email_verified | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.2.protocolMappers.1 | email | oidc-usermodel-attribute-mapper | email | email | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.3.protocolMappers.0 | phone number | oidc-usermodel-attribute-mapper | phoneNumber | phone_number | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.3.protocolMappers.1 | phone number verified | oidc-usermodel-attribute-mapper | phoneNumberVerified | phone_number_verified | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.4.protocolMappers.0 | groups | oidc-usermodel-realm-role-mapper | foo | groups | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.4.protocolMappers.1 | upn | oidc-usermodel-attribute-mapper | username | upn | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.5.protocolMappers.0 | acr loa level | oidc-acr-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.5.protocolMappers.1 | amr | oidc-amr-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.6.protocolMappers.0 | Athyper identity provider | oidc-usersessionmodel-note-mapper | — | athyper.identity_provider | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.6.protocolMappers.1 | Athyper external acr | oidc-usersessionmodel-note-mapper | — | athyper.external_acr | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.6.protocolMappers.2 | Athyper external amr | oidc-usersessionmodel-note-mapper | — | athyper.external_amr | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.6.protocolMappers.3 | Athyper SAML authentication context | oidc-usersessionmodel-note-mapper | — | athyper.saml_authn_context | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.6.protocolMappers.4 | Athyper MFA source | oidc-usersessionmodel-note-mapper | — | athyper.mfa_source | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.7.protocolMappers.0 | address | oidc-address-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.8.protocolMappers.0 | organization | oidc-organization-membership-mapper | — | organization | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.0 | given name | oidc-usermodel-attribute-mapper | firstName | given_name | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.1 | nickname | oidc-usermodel-attribute-mapper | nickname | nickname | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.10 | locale | oidc-usermodel-attribute-mapper | locale | locale | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.11 | family name | oidc-usermodel-attribute-mapper | lastName | family_name | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.12 | website | oidc-usermodel-attribute-mapper | website | website | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.13 | picture | oidc-usermodel-attribute-mapper | picture | picture | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.2 | birthdate | oidc-usermodel-attribute-mapper | birthdate | birthdate | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.3 | full name | oidc-full-name-mapper | — | — | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.4 | zoneinfo | oidc-usermodel-attribute-mapper | zoneinfo | zoneinfo | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.5 | username | oidc-usermodel-attribute-mapper | username | preferred_username | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.6 | gender | oidc-usermodel-attribute-mapper | gender | gender | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.7 | middle name | oidc-usermodel-attribute-mapper | middleName | middle_name | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.8 | profile | oidc-usermodel-attribute-mapper | profile | profile | — |
| stack/config/iam/realm-athyper-clean-slate.json | clientScopes.9.protocolMappers.9 | updated at | oidc-usermodel-attribute-mapper | updatedAt | updated_at | — |
| stack/config/iam/realm-athyper.json | clients.1.protocolMappers.0 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.10.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.11.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.12.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.13.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.3.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.5.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.6.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.8.protocolMappers.0 | locale | oidc-usermodel-attribute-mapper | locale | locale | — |
| stack/config/iam/realm-athyper.json | clientScopes.0.protocolMappers.0 | role list | saml-role-list-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clientScopes.1.protocolMappers.0 | Client ID | oidc-usersessionmodel-note-mapper | — | client_id | — |
| stack/config/iam/realm-athyper.json | clientScopes.1.protocolMappers.1 | Client Host | oidc-usersessionmodel-note-mapper | — | clientHost | — |
| stack/config/iam/realm-athyper.json | clientScopes.1.protocolMappers.2 | Client IP Address | oidc-usersessionmodel-note-mapper | — | clientAddress | — |
| stack/config/iam/realm-athyper.json | clientScopes.10.protocolMappers.0 | allowed web origins | oidc-allowed-origins-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clientScopes.11.protocolMappers.0 | client roles | oidc-usermodel-client-role-mapper | foo | resource_access.${client_id}.roles | — |
| stack/config/iam/realm-athyper.json | clientScopes.11.protocolMappers.1 | realm roles | oidc-usermodel-realm-role-mapper | foo | realm_access.roles | — |
| stack/config/iam/realm-athyper.json | clientScopes.11.protocolMappers.2 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clientScopes.12.protocolMappers.0 | auth_time | oidc-usersessionmodel-note-mapper | — | auth_time | — |
| stack/config/iam/realm-athyper.json | clientScopes.12.protocolMappers.1 | sub | oidc-sub-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clientScopes.14.protocolMappers.0 | organization | saml-organization-membership-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.0 | plane | oidc-hardcoded-claim-mapper | — | plane | — |
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.1 | realm_key | oidc-hardcoded-claim-mapper | — | realm_key | — |
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.0 | plane | oidc-hardcoded-claim-mapper | — | plane | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.1 | realm_key | oidc-hardcoded-claim-mapper | — | realm_key | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.0 | plane | oidc-hardcoded-claim-mapper | — | plane | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.1 | realm_key | oidc-hardcoded-claim-mapper | — | realm_key | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| stack/config/iam/realm-athyper.json | clientScopes.2.protocolMappers.0 | email verified | oidc-usermodel-property-mapper | emailVerified | email_verified | — |
| stack/config/iam/realm-athyper.json | clientScopes.2.protocolMappers.1 | email | oidc-usermodel-attribute-mapper | email | email | — |
| stack/config/iam/realm-athyper.json | clientScopes.3.protocolMappers.0 | phone number | oidc-usermodel-attribute-mapper | phoneNumber | phone_number | — |
| stack/config/iam/realm-athyper.json | clientScopes.3.protocolMappers.1 | phone number verified | oidc-usermodel-attribute-mapper | phoneNumberVerified | phone_number_verified | — |
| stack/config/iam/realm-athyper.json | clientScopes.4.protocolMappers.0 | groups | oidc-usermodel-realm-role-mapper | foo | groups | — |
| stack/config/iam/realm-athyper.json | clientScopes.4.protocolMappers.1 | upn | oidc-usermodel-attribute-mapper | username | upn | — |
| stack/config/iam/realm-athyper.json | clientScopes.5.protocolMappers.0 | acr loa level | oidc-acr-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clientScopes.5.protocolMappers.1 | amr | oidc-amr-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clientScopes.6.protocolMappers.0 | Athyper identity provider | oidc-usersessionmodel-note-mapper | — | athyper.identity_provider | — |
| stack/config/iam/realm-athyper.json | clientScopes.6.protocolMappers.1 | Athyper external acr | oidc-usersessionmodel-note-mapper | — | athyper.external_acr | — |
| stack/config/iam/realm-athyper.json | clientScopes.6.protocolMappers.2 | Athyper external amr | oidc-usersessionmodel-note-mapper | — | athyper.external_amr | — |
| stack/config/iam/realm-athyper.json | clientScopes.6.protocolMappers.3 | Athyper SAML authentication context | oidc-usersessionmodel-note-mapper | — | athyper.saml_authn_context | — |
| stack/config/iam/realm-athyper.json | clientScopes.6.protocolMappers.4 | Athyper MFA source | oidc-usersessionmodel-note-mapper | — | athyper.mfa_source | — |
| stack/config/iam/realm-athyper.json | clientScopes.7.protocolMappers.0 | address | oidc-address-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clientScopes.8.protocolMappers.0 | organization | oidc-organization-membership-mapper | — | organization | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.0 | given name | oidc-usermodel-attribute-mapper | firstName | given_name | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.1 | nickname | oidc-usermodel-attribute-mapper | nickname | nickname | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.10 | locale | oidc-usermodel-attribute-mapper | locale | locale | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.11 | family name | oidc-usermodel-attribute-mapper | lastName | family_name | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.12 | website | oidc-usermodel-attribute-mapper | website | website | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.13 | picture | oidc-usermodel-attribute-mapper | picture | picture | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.2 | birthdate | oidc-usermodel-attribute-mapper | birthdate | birthdate | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.3 | full name | oidc-full-name-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.4 | zoneinfo | oidc-usermodel-attribute-mapper | zoneinfo | zoneinfo | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.5 | username | oidc-usermodel-attribute-mapper | username | preferred_username | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.6 | gender | oidc-usermodel-attribute-mapper | gender | gender | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.7 | middle name | oidc-usermodel-attribute-mapper | middleName | middle_name | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.8 | profile | oidc-usermodel-attribute-mapper | profile | profile | — |
| stack/config/iam/realm-athyper.json | clientScopes.9.protocolMappers.9 | updated at | oidc-usermodel-attribute-mapper | updatedAt | updated_at | — |
| stack/config/iam/realm-athyper.json | identityProviderMappers.0 | NEON_USER | oidc-hardcoded-role-idp-mapper | — | — | NEON_USER |
| stack/config/iam/realm-athyper.json | identityProviderMappers.1 | AUTHORIZED | oidc-hardcoded-role-idp-mapper | — | — | neon-web.AUTHORIZED |
| stack/config/iam/realm-athyper.json | identityProviderMappers.2 | NEON_USER | oidc-hardcoded-role-idp-mapper | — | — | NEON_USER |
| stack/config/iam/realm-athyper.json | identityProviderMappers.3 | AUTHORIZED | oidc-hardcoded-role-idp-mapper | — | — | neon-web.AUTHORIZED |
| stack/config/iam/realm-athyper.json | identityProviderMappers.4 | NEON_USER | oidc-hardcoded-role-idp-mapper | — | — | NEON_USER |
| stack/config/iam/realm-athyper.json | identityProviderMappers.5 | AUTHORIZED | oidc-hardcoded-role-idp-mapper | — | — | neon-web.AUTHORIZED |
| stack/config/iam/realm-athyper.json | identityProviderMappers.6 | github-avatar | hardcoded-attribute-idp-mapper | — | — | — |
| stack/config/iam/realm-platform-control-clean-slate.json | clientScopes.0.protocolMappers.0 | allowed web origins | oidc-allowed-origins-mapper | — | — | — |
| stack/config/iam/realm-platform-control-clean-slate.json | clientScopes.1.protocolMappers.0 | realm roles | oidc-usermodel-realm-role-mapper | foo | realm_access.roles | — |
| stack/config/iam/realm-platform-control-clean-slate.json | clientScopes.1.protocolMappers.1 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| stack/config/iam/realm-platform-control-clean-slate.json | clientScopes.1.protocolMappers.2 | client roles | oidc-usermodel-client-role-mapper | foo | resource_access.${client_id}.roles | — |
| stack/config/iam/realm-platform-control-clean-slate.json | clientScopes.2.protocolMappers.0 | email verified | oidc-usermodel-property-mapper | emailVerified | email_verified | — |
| stack/config/iam/realm-platform-control-clean-slate.json | clientScopes.2.protocolMappers.1 | email | oidc-usermodel-attribute-mapper | email | email | — |
| stack/config/iam/realm-platform-control-clean-slate.json | clientScopes.3.protocolMappers.0 | full name | oidc-full-name-mapper | — | — | — |
| stack/config/iam/realm-platform-control-clean-slate.json | clientScopes.3.protocolMappers.1 | username | oidc-usermodel-attribute-mapper | username | preferred_username | — |
| stack/config/iam/realm-platform-control-clean-slate.json | clientScopes.4.protocolMappers.0 | acr loa level | oidc-acr-mapper | — | — | — |
| stack/config/iam/realm-platform-control-clean-slate.json | clientScopes.5.protocolMappers.0 | sub | oidc-sub-mapper | — | — | — |
| stack/config/iam/realm-platform-control-clean-slate.json | clientScopes.5.protocolMappers.1 | auth_time | oidc-usersessionmodel-note-mapper | — | auth_time | — |
| stack/config/iam/realm-platform-control.json | clientScopes.0.protocolMappers.0 | allowed web origins | oidc-allowed-origins-mapper | — | — | — |
| stack/config/iam/realm-platform-control.json | clientScopes.1.protocolMappers.0 | realm roles | oidc-usermodel-realm-role-mapper | foo | realm_access.roles | — |
| stack/config/iam/realm-platform-control.json | clientScopes.1.protocolMappers.1 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| stack/config/iam/realm-platform-control.json | clientScopes.1.protocolMappers.2 | client roles | oidc-usermodel-client-role-mapper | foo | resource_access.${client_id}.roles | — |
| stack/config/iam/realm-platform-control.json | clientScopes.2.protocolMappers.0 | email verified | oidc-usermodel-property-mapper | emailVerified | email_verified | — |
| stack/config/iam/realm-platform-control.json | clientScopes.2.protocolMappers.1 | email | oidc-usermodel-attribute-mapper | email | email | — |
| stack/config/iam/realm-platform-control.json | clientScopes.3.protocolMappers.0 | full name | oidc-full-name-mapper | — | — | — |
| stack/config/iam/realm-platform-control.json | clientScopes.3.protocolMappers.1 | username | oidc-usermodel-attribute-mapper | username | preferred_username | — |
| stack/config/iam/realm-platform-control.json | clientScopes.4.protocolMappers.0 | acr loa level | oidc-acr-mapper | — | — | — |
| stack/config/iam/realm-platform-control.json | clientScopes.5.protocolMappers.0 | sub | oidc-sub-mapper | — | — | — |
| stack/config/iam/realm-platform-control.json | clientScopes.5.protocolMappers.1 | auth_time | oidc-usersessionmodel-note-mapper | — | auth_time | — |

## Generated authorization artifacts

| Artifact | Generator | Owner | Present | Generator present |
|---|---|---|---:|---:|
| server/db/seed/contracts/authorization/authority/mesh/compiled/compiled-authority.v1.json | server/db/scripts/authority/compile-authorization-authority.ts --authority=mesh | mesh-platform | no | no |
| server/db/seed/contracts/authorization/authority/mesh/compiled/existing-user-group-manifest.v1.json | server/db/scripts/authority/compile-authorization-authority.ts --authority=mesh | mesh-platform | no | no |
| server/db/seed/contracts/authorization/authority/mesh/compiled/reconciliation-report.md | server/db/scripts/authority/compile-authorization-authority.ts --authority=mesh | mesh-platform | no | no |
| server/db/seed/contracts/authorization/authority/mesh/compiled/reconciliation-report.v1.json | server/db/scripts/authority/compile-authorization-authority.ts --authority=mesh | mesh-platform | no | no |
| server/db/seed/contracts/authorization/authority/neon-admin/compiled/compiled-authority.v1.json | server/db/scripts/authority/compile-authorization-authority.ts --authority=neon-admin | platform-iam | no | no |
| server/db/seed/contracts/authorization/authority/neon-admin/compiled/existing-user-group-manifest.v1.json | server/db/scripts/authority/compile-authorization-authority.ts --authority=neon-admin | platform-iam | no | no |
| server/db/seed/contracts/authorization/authority/neon-admin/compiled/reconciliation-report.md | server/db/scripts/authority/compile-authorization-authority.ts --authority=neon-admin | platform-iam | no | no |
| server/db/seed/contracts/authorization/authority/neon-admin/compiled/reconciliation-report.v1.json | server/db/scripts/authority/compile-authorization-authority.ts --authority=neon-admin | platform-iam | no | no |
| server/db/seed/contracts/authorization/catalog/mesh/compiled/catalog-preflight.sql | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=mesh | mesh-platform | no | no |
| server/db/seed/contracts/authorization/catalog/mesh/compiled/compiled-catalog.v1.json | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=mesh | mesh-platform | no | no |
| server/db/seed/contracts/authorization/catalog/mesh/compiled/contextual-aliases.v1.json | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=mesh | mesh-platform | no | no |
| server/db/seed/contracts/authorization/catalog/mesh/compiled/verification-report.v1.json | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=mesh | mesh-platform | no | no |
| server/db/seed/contracts/authorization/catalog/neon-admin/compiled/catalog-preflight.sql | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=neon-admin | platform-iam | no | no |
| server/db/seed/contracts/authorization/catalog/neon-admin/compiled/compiled-catalog.v1.json | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=neon-admin | platform-iam | no | no |
| server/db/seed/contracts/authorization/catalog/neon-admin/compiled/contextual-aliases.v1.json | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=neon-admin | platform-iam | no | no |
| server/db/seed/contracts/authorization/catalog/neon-admin/compiled/verification-report.v1.json | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=neon-admin | platform-iam | no | no |
| server/db/seed/contracts/generated/resolver-contracts.json | server/scripts/export-resolver-contracts.ts | metadata-platform | no | no |
| server/packages/adapters/db/src/prisma/schema.mesh.prisma | server/packages/adapters/db/scripts/prisma-generate.mjs --schema server/packages/adapters/db/src/prisma/schema.mesh.prisma | database-platform | no | no |
| server/packages/adapters/db/src/prisma/schema.prisma | server/packages/adapters/db/scripts/prisma-generate.mjs | database-platform | no | no |
| stack/config/iam/realm-athyper-demosetup.json | tools/scripts/generate-athyper-demo-iam.cjs | platform-iam | yes | yes |
| stack/config/iam/realm-athyper.json | tools/scripts/prepare-keycloak-realm-import.cjs | platform-iam | yes | yes |
| stack/config/iam/realm-platform-control-demosetup.json | tools/scripts/generate-athyper-demo-iam.cjs | platform-iam | yes | yes |
| stack/config/iam/realm-platform-control.json | tools/scripts/prepare-keycloak-realm-import.cjs | platform-iam | yes | yes |

## Classification contract

- SQL and Kysely access is classified as define, read, reference, insert, update, delete, truncate, execute, or generated mirror.
- Authorization-object discovery uses exact qualified identities. Bare words such as `role`, `group`, and `policy` are not discovery signals; `master.pay_group`, `control.tax_group`, and posting-role accounting tables are therefore not IAM authorities.
- A structurally strong unregistered authorization object, an unreviewed runtime security symbol, or an unknown permission code in a permission-check context is emitted as an open gate.
- Dynamic SQL must be represented by an exact reviewed source entry; it is not silently allowlisted.
- Generated files are projections and must name an existing generator.
- Each plane in `captureSourceObjectIds` must match the exact relation set seeded by its `contract.captureSourceDdls` entry in both directions; moving a source between Neon and Mesh is an explicit cross-plane gate failure.
- Keycloak Admin REST writes are classified by exact source path plus the discovered HTTP-method/resource operation set; new or removed capabilities are gate failures.
- Machine-readable recomputation: `pnpm exec tsx scripts/policy/verify-authorization-inventory.ts --check --json --structural-only`. `structuralPassed` excludes owned known source and boundary anomalies; `strictPassed` includes them.
- JSON verification fields: `artifactDriftFailures`, `structuralGateFailures`, `knownAnomalyFailures`, `gateCounts`, `structuralPassed`, and `strictPassed`.
