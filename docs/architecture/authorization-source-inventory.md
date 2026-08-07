# Wave 0 authorization source inventory

> Generated deterministically by `scripts/policy/authorization-inventory.ts` from the reviewed exact-object registry. Edit the registry or scanner, then regenerate; do not hand-edit this report.

Registry SHA-256: `a277d9a71f22ed5a671cbc9dd70f5dcf659ef458cc4a5bf1c3dce0d165eabd67`
Files scanned / authorization-bearing: 5073 / 1117
Registered authorization objects: 463
Aggregated object references: 6085
Writer references: 700
Contract/UI field references: 819
Permission definitions / uses: 168 / 954
Authorization-bearing routes: 401
Keycloak mappers: 102
Canonical capture sources: 74 (neon=66, mesh=8)
Keycloak REST writer paths: 11
Open gate findings: 45

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
| Known source anomalies blocking strict certification | 29 |
| Zero-Mesh-specific-data Neon boundary findings | 16 |

Any non-zero structural finding blocks the Wave 0 inventory-completeness gate. Owned known anomalies remain visible and block strict certification, but are reported separately by structural-only verification. Tests and documentation do not satisfy runtime ownership.

## Registered authorities

| ID | Exact object | Database | Class | Owner | Planes | Disposition | Definitions | Readers | Writers |
|---|---|---|---|---|---|---|---:|---:|---:|
| audit.attachment_access | `log.attachment_access_log` | neon | decision_evidence | document-platform | neon | retain | 1 | 8 | 2 |
| audit.attachment_access.default_partition | `log.attachment_access_log_default` | neon | decision_evidence_partition | platform-iam | admin, neon | retain_with_parent | 1 | 1 | 0 |
| audit.field_access | `log.field_access_log` | neon | decision_evidence | policy-platform | neon | retain | 1 | 8 | 0 |
| audit.field_access.default_partition | `log.field_access_log_default` | neon | decision_evidence_partition | platform-iam | admin, neon | retain_with_parent | 1 | 1 | 0 |
| audit.permission_decision | `log.permission_decision_log` | neon | decision_evidence | platform-iam | admin, neon | replace_persona_evidence_fields | 1 | 10 | 1 |
| audit.permission_decision.default_partition | `log.permission_decision_log_default` | neon | decision_evidence_partition | platform-iam | admin, neon | retain_with_parent | 1 | 1 | 0 |
| audit.security_event | `log.security_event_log` | neon | audit | security-platform | admin, neon | retain | 1 | 10 | 2 |
| authentication.mfa_config | `control.mfa_config` | neon | authentication_assurance | platform-iam | admin, neon | keep_keycloak_authority_projection | 1 | 16 | 5 |
| authorization.group | `master.auth_group` | neon | authorization | platform-iam | admin, neon | replace_additively | 2 | 34 | 13 |
| authorization.group_member | `master.auth_group_member` | neon | authorization | platform-iam | admin, neon | replace_additively | 1 | 40 | 11 |
| authorization.group_role | `master.auth_group_role` | neon | authorization | platform-iam | admin, neon | replace_additively | 1 | 33 | 12 |
| catalog.enterprise_feature | `shared.enterprise_feature` | neon_and_mesh_legacy | entitlement_catalog | platform-catalog | admin, neon, mesh | replace_with_feature_catalog | 2 | 23 | 3 |
| catalog.module | `shared.module` | neon_and_mesh_legacy | entitlement_catalog | platform-catalog | admin, neon, mesh | keep_neon_reference_only_in_mesh | 2 | 49 | 5 |
| catalog.subscription_plan | `shared.subscription_plan` | neon_and_mesh_legacy | entitlement_catalog | commercial-platform | neon | keep_neon | 3 | 21 | 4 |
| catalog.subscription_plan_version | `shared.subscription_plan_version` | neon_and_mesh_legacy | entitlement_catalog | commercial-platform | neon | keep_neon | 3 | 22 | 5 |
| catalog.workspace | `shared.workspace` | neon_and_mesh_legacy | entitlement_catalog | platform-catalog | admin, neon, mesh | keep_neon_reference_only_in_mesh | 1 | 24 | 4 |
| compiled.entity | `snapshot.entity_compiled` | neon | authorization_projection | metadata-platform | admin, neon | regenerate | 1 | 21 | 4 |
| context.company_code | `master.company_code` | neon | authorization_scope | finance-platform | neon | keep_as_non_granting_scope_source | 1 | 206 | 32 |
| context.legal_entity | `master.legal_entity` | neon | authorization_scope | organization-platform | neon | keep_as_non_granting_scope_source | 1 | 58 | 25 |
| context.operating_organization | `master.operating_organization` | neon | authorization_scope | organization-platform | neon | keep_as_non_granting_scope_source | 1 | 27 | 2 |
| context.operating_organization_company | `master.operating_organization_company` | neon | authorization_scope | organization-platform | neon | keep_as_non_granting_scope_membership | 1 | 10 | 1 |
| context.principal_relationship | `master.principal_relationship` | neon | context_only | platform-iam | admin, neon | keep_non_authorizing | 1 | 12 | 0 |
| context.team | `master.team` | neon | context_only | organization-platform | neon | keep_non_authorizing | 1 | 14 | 0 |
| context.team_member | `master.team_member` | neon | context_only | organization-platform | neon | keep_non_authorizing | 1 | 12 | 0 |
| context.tenant_relationship | `master.tenant_relationship` | neon | context_only | platform-iam | admin, neon | keep_non_authorizing | 1 | 13 | 0 |
| function.access_grant_status_changed | `master.trg_access_grant_status_changed` | neon | authorization_change_capture | platform-iam | neon | remove_with_legacy_access_grant | 1 | 0 | 0 |
| function.bump_auth_epoch | `master.fn_bump_auth_epoch` | neon | authorization_change_capture | platform-iam | admin, neon | replace_with_durable_change_watermark | 1 | 0 | 0 |
| function.check_permission | `master.check_permission` | neon | legacy_evaluator | platform-iam | neon | remove_after_shadow | 1 | 0 | 0 |
| function.derive_effective_roles | `master.derive_effective_roles` | neon | legacy_evaluator | platform-iam | neon | remove_after_shadow | 1 | 0 | 0 |
| function.effective_scope | `master.resolve_effective_authorization_scope` | neon | legacy_scope_evaluator | platform-iam | neon | replace_with_scope_repository | 1 | 0 | 0 |
| function.guard_auth_binding_service_client | `master.trg_guard_auth_binding_service_client` | neon | identity_invariant | platform-iam | admin, neon | keep_invariant | 1 | 0 | 0 |
| function.guard_delegation_grant_mutation | `master.trg_guard_delegation_grant_mutation` | neon | legacy_authorization_invariant | platform-iam | neon | remove_with_legacy_delegation | 1 | 0 | 0 |
| function.lookup_tenant_for_auth | `master.fn_lookup_tenant_for_auth` | neon | authorization_context | platform-iam | admin, neon | keep_until_session_context_replacement | 1 | 0 | 0 |
| function.protect_system_persona | `shared.trg_protect_system_persona` | neon_and_mesh_legacy | legacy_authorization_invariant | platform-iam | admin, neon, mesh | remove_with_persona | 1 | 0 | 0 |
| function.resolve_allowed_companies | `master.resolve_allowed_companies` | neon | legacy_scope_evaluator | platform-iam | neon | remove_after_shadow | 2 | 0 | 0 |
| function.validate_delegation_permissions | `master.trg_validate_delegation_permissions` | neon | legacy_authorization_invariant | platform-iam | neon | remove_with_legacy_delegation | 1 | 0 | 0 |
| function.visibility_scope | `master.get_effective_visibility_scope` | neon | legacy_scope_evaluator | platform-iam | neon | remove_after_shadow | 1 | 0 | 0 |
| identity.legal_entity_binding | `master.legal_entity_identity_binding` | neon | identity_binding | platform-iam | admin, neon | keep_as_non_granting_identity_projection | 1 | 10 | 0 |
| identity.principal | `master.principal` | neon | identity | platform-iam | admin, neon | keep | 3 | 122 | 37 |
| identity.principal_binding | `master.principal_identity_binding` | neon | identity_binding | platform-iam | admin, neon | keep | 2 | 42 | 18 |
| identity.principal_profile | `master.principal_profile` | neon | identity_profile | platform-iam | admin, neon | remove_duplicate_idp_fields | 1 | 32 | 10 |
| identity.tenant | `master.tenant` | neon | identity | platform-iam | admin, neon | keep | 3 | 244 | 30 |
| identity.tenant_domain | `master.tenant_identity_domain` | neon | authentication_configuration | platform-iam | admin, neon | keep | 1 | 7 | 0 |
| identity.tenant_provider | `master.tenant_identity_provider` | neon | authentication_configuration | platform-iam | admin, neon | keep | 1 | 11 | 3 |
| legacy.access_grant | `master.access_grant` | neon | legacy_authorization | platform-iam | admin, neon, mesh | split_into_role_scope_override_acl | 1 | 27 | 2 |
| legacy.attachment_acl | `master.attachment_acl` | neon | record_acl | document-platform | neon | merge_into_auth_record_acl | 1 | 12 | 2 |
| legacy.business_network | `master.business_network` | neon | legacy_mesh_context | mesh-platform | mesh, neon | remove_from_neon | 1 | 21 | 3 |
| legacy.business_network_membership | `master.business_network_membership` | neon | legacy_mesh_authorization | mesh-platform | mesh, neon | remove_from_neon | 1 | 20 | 3 |
| legacy.business_network_membership_role | `master.business_network_membership_role` | neon | legacy_mesh_authorization | mesh-platform | mesh, neon | remove_from_neon | 1 | 12 | 3 |
| legacy.company_code_access | `master.company_code_access` | neon | legacy_scope | platform-iam | neon | remove | 1 | 19 | 4 |
| legacy.content_item_access_grant | `master.content_item_access_grant` | neon | record_acl | content-platform | neon | merge_into_auth_record_acl | 1 | 15 | 2 |
| legacy.delegation_grant | `master.delegation_grant` | neon | delegation | platform-iam | neon | normalize | 1 | 28 | 5 |
| legacy.group_feature_grant | `master.group_feature_grant` | neon | legacy_entitlement | platform-iam | neon | remove | 1 | 13 | 0 |
| legacy.permission | `shared.permission` | neon_and_mesh_legacy | permission_catalog | platform-iam | admin, neon, mesh | move_to_control_auth_permission | 1 | 68 | 6 |
| legacy.permission_category | `shared.permission_category` | neon_and_mesh_legacy | permission_catalog | platform-iam | admin, neon, mesh | move_to_control_auth_permission | 2 | 26 | 2 |
| legacy.permission_scope_policy | `shared.permission_scope_policy` | neon_and_mesh_legacy | scope | platform-iam | neon | move_to_control_scope_policy | 3 | 15 | 1 |
| legacy.persona | `shared.persona` | neon_and_mesh_legacy | legacy_authorization | platform-iam | admin, neon, mesh | remove | 1 | 41 | 1 |
| legacy.persona_permission | `shared.persona_permission` | neon_and_mesh_legacy | legacy_authorization | platform-iam | admin, neon, mesh | remove | 1 | 27 | 2 |
| legacy.plan_feature_access | `shared.plan_feature_access` | neon_and_mesh_legacy | entitlement | commercial-platform | neon | replace_with_plan_version_feature_access | 3 | 21 | 4 |
| legacy.plan_module_access | `shared.plan_module_access` | neon_and_mesh_legacy | entitlement | commercial-platform | neon | replace_with_plan_version_module_access | 3 | 22 | 5 |
| legacy.plan_permission_access | `shared.plan_permission_access` | neon_and_mesh_legacy | entitlement | commercial-platform | neon | remove_permission_level_entitlement | 1 | 18 | 3 |
| legacy.principal_feature_grant | `master.principal_feature_grant` | neon | legacy_entitlement | platform-iam | neon | remove | 1 | 13 | 0 |
| legacy.principal_persona | `master.principal_persona` | neon | legacy_authorization | platform-iam | admin, neon | remove | 1 | 32 | 6 |
| legacy.role | `shared.role` | neon_and_mesh_legacy | legacy_authorization | platform-iam | admin, neon, mesh | replace_with_tenant_plane_role | 1 | 42 | 2 |
| legacy.tenant_admin_grant | `master.tenant_admin_grant` | neon | legacy_plane_admission | platform-iam | admin | replace_with_auth_plane_membership | 1 | 15 | 4 |
| legacy.tenant_feature_entitlement | `master.tenant_feature_entitlement` | neon | entitlement | commercial-platform | neon | replace_with_tenant_entitlement | 3 | 21 | 2 |
| legacy.tenant_module_subscription | `master.tenant_module_subscription` | neon | entitlement | commercial-platform | neon | replace_with_tenant_entitlement | 3 | 23 | 6 |
| legacy.tenant_permission_override | `master.tenant_permission_override` | neon | entitlement_override | commercial-platform | neon | replace_with_feature_entitlement_override | 1 | 17 | 2 |
| mesh.account | `mesh.network_account` | mesh | plane_membership_context | mesh-platform | mesh | keep_mesh_only | 4 | 47 | 5 |
| mesh.account_grant | `mesh.account_grant` | mesh | legacy_authorization | mesh-platform | mesh | replace_with_mesh_local_role_group_model | 4 | 36 | 5 |
| mesh.attachment_acl | `mesh.attachment_acl` | mesh | record_acl | mesh-platform | mesh | normalize_mesh_locally | 1 | 13 | 0 |
| mesh.audit.access_decision | `mesh_log.access_decision_log` | mesh | decision_evidence | mesh-platform | mesh | retain | 1 | 5 | 0 |
| mesh.audit.access_decision.default_partition | `mesh_log.access_decision_log_default` | mesh | decision_evidence_partition | mesh-platform | mesh | retain_with_parent | 1 | 1 | 0 |
| mesh.audit.attachment_access | `mesh_log.attachment_access_log` | mesh | decision_evidence | mesh-platform | mesh | retain | 1 | 5 | 0 |
| mesh.audit.attachment_access.default_partition | `mesh_log.attachment_access_log_default` | mesh | decision_evidence_partition | mesh-platform | mesh | retain_with_parent | 1 | 1 | 0 |
| mesh.audit.security_event | `mesh_log.security_event_log` | mesh | audit | mesh-platform | mesh | retain | 1 | 5 | 0 |
| mesh.capture.anomaly_disposition | `mesh_control.authorization_anomaly_disposition` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 1 | 5 | 0 |
| mesh.capture.checkpoint | `mesh_log.authorization_projection_checkpoint` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 1 | 9 | 2 |
| mesh.capture.clock | `mesh_log.authorization_capture_clock` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 1 | 18 | 3 |
| mesh.capture.event | `mesh_log.authorization_change_event` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 1 | 12 | 2 |
| mesh.capture.function.evidence_guard | `mesh_log.trg_authorization_evidence_immutable` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 1 | 0 | 0 |
| mesh.capture.function.internal_guard | `mesh_log.trg_authorization_internal_guard` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 1 | 0 | 0 |
| mesh.capture.function.primary_key | `mesh_log.fn_authorization_capture_primary_key` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 1 | 0 | 0 |
| mesh.capture.function.record_change | `mesh_log.fn_record_authorization_change` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 1 | 0 | 0 |
| mesh.capture.function.redact | `mesh_log.fn_authorization_capture_redact` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 1 | 0 | 0 |
| mesh.capture.function.row_trigger | `mesh_log.trg_capture_authorization_change` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 1 | 0 | 0 |
| mesh.capture.function.safe_uuid | `mesh_log.fn_authorization_capture_safe_uuid` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 1 | 0 | 0 |
| mesh.capture.function.scope_value | `mesh_log.fn_authorization_capture_scope_value` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 1 | 0 | 0 |
| mesh.capture.function.sha256 | `mesh_log.fn_authorization_capture_sha256` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 1 | 0 | 0 |
| mesh.capture.function.snapshot_marker | `mesh_log.fn_record_authorization_snapshot_marker` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 1 | 0 | 0 |
| mesh.capture.function.truncate_trigger | `mesh_log.trg_capture_authorization_truncate` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 1 | 0 | 0 |
| mesh.capture.function.watermark | `mesh_log.fn_authorization_capture_watermark` | mesh | authorization_change_capture | mesh-platform | mesh | retain_with_mesh_capture | 1 | 0 | 0 |
| mesh.capture.health_view | `mesh_log.v_authorization_capture_health` | mesh | authorization_change_capture | mesh-platform | mesh | recreate_from_mesh_capture_evidence | 1 | 1 | 0 |
| mesh.capture.migration_run | `mesh_control.authorization_migration_run` | mesh | authorization_migration_control | mesh-platform | mesh | preserve_immutable_through_observation | 1 | 14 | 1 |
| mesh.capture.snapshot_marker | `mesh_log.authorization_snapshot_marker` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 1 | 13 | 1 |
| mesh.capture.source_registry | `mesh_control.authorization_capture_source` | mesh | authorization_change_capture | mesh-platform | mesh | retain_through_mesh_migration_observation | 1 | 17 | 2 |
| mesh.capture.transaction | `mesh_log.authorization_change_transaction` | mesh | authorization_migration_evidence | mesh-platform | mesh | preserve_immutable_through_observation | 1 | 12 | 1 |
| mesh.capture.writer_registry | `mesh_control.authorization_writer_registry` | mesh | authorization_change_capture | mesh-platform | mesh | retain_through_mesh_migration_observation | 1 | 6 | 0 |
| mesh.capture.writer_view | `mesh_log.v_authorization_writer_telemetry` | mesh | authorization_change_capture | mesh-platform | mesh | recreate_from_mesh_capture_evidence | 1 | 2 | 0 |
| mesh.content_access_grant | `mesh.content_item_access_grant` | mesh | record_acl | mesh-platform | mesh | normalize_mesh_locally | 1 | 13 | 0 |
| mesh.conversation_participant | `mesh.conversation_participant` | mesh | conversation_acl | mesh-platform | mesh | keep_mesh_local_authorization_source | 1 | 12 | 0 |
| mesh.function.grant_fingerprint | `mesh.fn_account_grant_fingerprint` | mesh | authorization_cache | mesh-platform | mesh | replace_with_authorization_fingerprint | 1 | 0 | 0 |
| mesh.function.grant_revoke | `mesh.fn_account_grant_revoke_hook` | mesh | authorization_change_hook | mesh-platform | mesh | replace_with_mesh_local_change_capture | 1 | 0 | 0 |
| mesh.identity.binding | `mesh.principal_identity_binding` | mesh | identity_binding | mesh-platform | mesh | keep_mesh_only | 2 | 22 | 4 |
| mesh.identity.principal | `mesh.principal` | mesh | identity | mesh-platform | mesh | keep_mesh_only | 3 | 31 | 6 |
| mesh.relationship | `mesh.network_relationship` | mesh | context_only | mesh-platform | mesh | keep_non_authorizing | 2 | 20 | 2 |
| mesh.rollout.feature_flag | `mesh_control.feature_flag` | mesh | rollout_control | mesh-platform | mesh | keep_mesh_only | 1 | 5 | 0 |
| metadata.entity | `control.entity` | neon | authorization_metadata | metadata-platform | admin, neon | keep_canonical_entity_identity | 3 | 148 | 30 |
| metadata.entity_action_rule | `control.entity_action_rule` | neon | authorization_metadata | metadata-platform | admin, neon | replace_permission_code_with_permission_id | 1 | 23 | 6 |
| metadata.entity_field | `control.entity_field` | neon | field_authorization_metadata | metadata-platform | admin, neon | normalize_security_references | 1 | 83 | 37 |
| metadata.entity_flow | `control.entity_flow` | neon | authorization_metadata | metadata-platform | admin, neon | normalize_permission_references | 1 | 30 | 9 |
| metadata.entity_flow_step | `control.entity_flow_step` | neon | authorization_metadata | metadata-platform | admin, neon | normalize_permission_references | 1 | 24 | 5 |
| metadata.entity_lifecycle | `control.entity_lifecycle` | neon | authorization_metadata | workflow-platform | neon | keep_canonical_entity_lifecycle_binding | 1 | 44 | 14 |
| metadata.entity_lifecycle_state_mask | `control.entity_lifecycle_state_mask` | neon | authorization_guard | workflow-platform | neon | normalize_as_non_granting_state_capability_guard | 1 | 18 | 6 |
| metadata.entity_operation | `control.entity_operation` | neon | authorization_metadata | metadata-platform | admin, neon | replace_permission_code_with_permission_id | 3 | 77 | 29 |
| metadata.entity_policy | `control.entity_policy` | neon | resource_policy | policy-platform | neon | keep_as_non_granting_guard | 1 | 20 | 10 |
| metadata.entity_relation | `control.entity_relation` | neon | authorization_metadata | metadata-platform | admin, neon | normalize_permission_references | 1 | 37 | 21 |
| metadata.entity_surface | `control.entity_surface` | neon | authorization_metadata | metadata-platform | admin, neon | normalize_permission_references | 1 | 29 | 9 |
| metadata.entity_version | `control.entity_version` | neon | authorization_metadata | metadata-platform | admin, neon | keep_canonical_versioned_contract | 2 | 127 | 13 |
| metadata.entity_version_contract | `control.entity_version_contract` | neon | authorization_metadata | metadata-platform | admin, neon | keep_canonical_contract | 1 | 16 | 8 |
| metadata.field_security_policy | `control.field_security_policy` | neon | field_authorization | policy-platform | neon | normalize_permission_references | 1 | 19 | 2 |
| metadata.lifecycle | `control.lifecycle` | neon | authorization_metadata | workflow-platform | neon | keep_as_non_granting_workflow_context | 1 | 45 | 9 |
| metadata.lifecycle_state | `control.lifecycle_state` | neon | authorization_metadata | workflow-platform | neon | keep_as_non_granting_workflow_context | 1 | 44 | 9 |
| metadata.lifecycle_transition | `control.lifecycle_transition` | neon | authorization_metadata | workflow-platform | neon | bind_exact_permission_id | 1 | 34 | 8 |
| metadata.lifecycle_transition_gate | `control.lifecycle_transition_gate` | neon | authorization_guard | workflow-platform | neon | normalize_as_non_granting_transition_guard | 1 | 11 | 0 |
| metadata.permission_alias | `control.permission_alias` | neon | compatibility | platform-iam | admin, neon | remove_after_shadow | 1 | 14 | 1 |
| migration.anomaly_disposition | `control.authorization_anomaly_disposition` | neon_and_mesh_migration | migration_control | platform-iam | admin, neon, mesh | retain_as_migration_evidence | 1 | 6 | 0 |
| migration.capture_clock | `event.authorization_capture_clock` | neon_and_mesh_migration | durable_source_watermark | platform-iam | admin, neon, mesh | retain_until_all_consumers_retired | 1 | 19 | 3 |
| migration.capture_source | `control.authorization_capture_source` | neon_and_mesh_migration | migration_control | platform-iam | admin, neon, mesh | retain_through_authorization_cutover_and_observation | 1 | 17 | 2 |
| migration.change_event | `event.authorization_change_event` | neon_and_mesh_migration | authorization_change_capture | platform-iam | admin, neon, mesh | retain_per_approved_migration_evidence_policy | 1 | 13 | 1 |
| migration.change_transaction | `event.authorization_change_transaction` | neon_and_mesh_migration | authorization_change_capture | platform-iam | admin, neon, mesh | retain_per_approved_migration_evidence_policy | 1 | 13 | 1 |
| migration.function.capture_row_trigger | `event.trg_capture_authorization_change` | neon_and_mesh_migration | authorization_change_capture_trigger | platform-iam | admin, neon, mesh | remove_after_all_legacy_writers_are_retired | 1 | 0 | 0 |
| migration.function.capture_truncate_trigger | `event.trg_capture_authorization_truncate` | neon_and_mesh_migration | authorization_change_capture_trigger | platform-iam | admin, neon, mesh | remove_after_all_legacy_writers_are_retired | 1 | 0 | 0 |
| migration.function.immutable_event_trigger | `event.trg_authorization_change_event_immutable` | neon_and_mesh_migration | authorization_change_capture_invariant | platform-iam | admin, neon, mesh | retain_with_change_capture | 1 | 0 | 0 |
| migration.function.primary_key | `event.fn_authorization_capture_primary_key` | neon_and_mesh_migration | authorization_change_capture | platform-iam | admin, neon, mesh | retain_with_change_capture | 1 | 0 | 0 |
| migration.function.record_change | `event.fn_record_authorization_change` | neon_and_mesh_migration | authorization_change_capture_writer | platform-iam | admin, neon, mesh | retain_with_change_capture | 1 | 0 | 0 |
| migration.function.redact | `event.fn_authorization_capture_redact` | neon_and_mesh_migration | authorization_change_capture | platform-iam | admin, neon, mesh | retain_with_change_capture | 1 | 0 | 0 |
| migration.function.safe_uuid | `event.fn_authorization_capture_safe_uuid` | neon_and_mesh_migration | authorization_change_capture | platform-iam | admin, neon, mesh | retain_with_change_capture | 1 | 0 | 0 |
| migration.function.sha256 | `event.fn_authorization_capture_sha256` | neon_and_mesh_migration | authorization_change_capture | platform-iam | admin, neon, mesh | retain_with_change_capture | 1 | 0 | 0 |
| migration.function.snapshot_marker | `event.fn_record_authorization_snapshot_marker` | neon_and_mesh_migration | authorization_snapshot_control | platform-iam | admin, neon, mesh | retain_as_snapshot_and_cutover_evidence | 1 | 0 | 0 |
| migration.function.transaction_guard_trigger | `event.trg_authorization_change_transaction_guard` | neon_and_mesh_migration | authorization_change_capture_invariant | platform-iam | admin, neon, mesh | retain_with_change_capture | 1 | 0 | 0 |
| migration.function.watermark | `event.fn_authorization_capture_watermark` | neon_and_mesh_migration | durable_source_watermark | platform-iam | admin, neon, mesh | retain_until_all_consumers_retired | 1 | 0 | 0 |
| migration.health_view | `event.v_authorization_capture_health` | neon_and_mesh_migration | migration_telemetry | platform-iam | admin, neon, mesh | retain_until_all_consumers_retired | 1 | 3 | 0 |
| migration.projection_checkpoint | `event.authorization_projection_checkpoint` | neon_and_mesh_migration | authorization_projection_control | platform-iam | admin, neon, mesh | retain_until_all_consumers_retired | 1 | 12 | 3 |
| migration.run | `control.authorization_migration_run` | neon_and_mesh_migration | migration_control | platform-iam | admin, neon, mesh | retain_as_migration_evidence | 1 | 12 | 1 |
| migration.snapshot_marker | `event.authorization_snapshot_marker` | neon_and_mesh_migration | authorization_snapshot_control | platform-iam | admin, neon, mesh | retain_as_snapshot_and_cutover_evidence | 1 | 12 | 1 |
| migration.telemetry_view | `event.v_authorization_legacy_write_telemetry` | neon_and_mesh_migration | migration_telemetry | platform-iam | admin, neon, mesh | retain_through_post_cutover_observation | 1 | 3 | 0 |
| migration.writer_registry | `control.authorization_writer_registry` | neon_and_mesh_migration | migration_control | platform-iam | admin, neon, mesh | retain_through_authorization_cutover_and_observation | 1 | 7 | 0 |
| rollout.feature_flag | `control.feature_flag` | neon | rollout_control | platform-runtime | admin, neon | keep | 1 | 21 | 5 |
| support.session | `master.atlas_support_session` | neon | delegated_support_access | ai-platform | admin | keep_bounded_by_new_evaluator | 1 | 9 | 2 |
| support.session_audit | `master.atlas_support_session_audit` | neon | audit | ai-platform | admin | retain | 1 | 6 | 1 |
| wave1.mesh.function.mesh_control.authorization_v2_is_effective | `mesh_control.authorization_v2_is_effective` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_control.authorization_v2_owner_aligned | `mesh_control.authorization_v2_owner_aligned` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_control.authorization_v2_window_contains | `mesh_control.authorization_v2_window_contains` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_entity | `mesh_control.trg_authorization_v2_guard_entity` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_entity_version | `mesh_control.trg_authorization_v2_guard_entity_version` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_operation | `mesh_control.trg_authorization_v2_guard_operation` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_operation_plane | `mesh_control.trg_authorization_v2_guard_operation_plane` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_permission | `mesh_control.trg_authorization_v2_guard_permission` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_permission_plane | `mesh_control.trg_authorization_v2_guard_permission_plane` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_scope_binding | `mesh_control.trg_authorization_v2_guard_scope_binding` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_control.trg_authorization_v2_guard_scope_policy | `mesh_control.trg_authorization_v2_guard_scope_policy` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_auth_decision_evidence_sha256_v2 | `mesh_log.fn_auth_decision_evidence_sha256_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_begin_replay_v2 | `mesh_log.fn_authorization_begin_replay_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_bind_replay_v2 | `mesh_log.fn_authorization_bind_replay_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_bump_epoch_v2 | `mesh_log.fn_authorization_bump_epoch_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_claim_invalidations_v2 | `mesh_log.fn_authorization_claim_invalidations_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_complete_invalidation_v2 | `mesh_log.fn_authorization_complete_invalidation_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_complete_replay_v2 | `mesh_log.fn_authorization_complete_replay_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_emit_invalidation_v2 | `mesh_log.fn_authorization_emit_invalidation_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_fail_invalidation_v2 | `mesh_log.fn_authorization_fail_invalidation_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_set_replay_event_context_v2 | `mesh_log.fn_authorization_set_replay_event_context_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_stage_replay_v2 | `mesh_log.fn_authorization_stage_replay_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_supersede_scheduled_v2 | `mesh_log.fn_authorization_supersede_scheduled_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_v2_json_uuid_values | `mesh_log.fn_authorization_v2_json_uuid_values` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_v2_safe_bigint | `mesh_log.fn_authorization_v2_safe_bigint` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_v2_safe_timestamptz | `mesh_log.fn_authorization_v2_safe_timestamptz` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_v2_safe_uuid | `mesh_log.fn_authorization_v2_safe_uuid` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.fn_authorization_v2_source_row_key | `mesh_log.fn_authorization_v2_source_row_key` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh_log.trg_auth_decision_evidence_v2_immutable | `mesh_log.trg_auth_decision_evidence_v2_immutable` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 2 | 0 | 0 |
| wave1.mesh.function.mesh_log.trg_auth_decision_evidence_v2_prepare | `mesh_log.trg_auth_decision_evidence_v2_prepare` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 2 | 0 | 0 |
| wave1.mesh.function.mesh_log.trg_authorization_authority_invalidate_v2 | `mesh_log.trg_authorization_authority_invalidate_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 2 | 0 | 0 |
| wave1.mesh.function.mesh_log.trg_authorization_invalidation_immutable_v2 | `mesh_log.trg_authorization_invalidation_immutable_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 2 | 0 | 0 |
| wave1.mesh.function.mesh_log.trg_authorization_v2_replay_inbox_immutable | `mesh_log.trg_authorization_v2_replay_inbox_immutable` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 2 | 0 | 0 |
| wave1.mesh.function.mesh_log.trg_authorization_v2_replay_state_guard | `mesh_log.trg_authorization_v2_replay_state_guard` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 2 | 0 | 0 |
| wave1.mesh.function.mesh.auth_v2_entity_is_eligible | `mesh.auth_v2_entity_is_eligible` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.auth_v2_permission_is_effective | `mesh.auth_v2_permission_is_effective` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.auth_v2_principal_has_plane | `mesh.auth_v2_principal_has_plane` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.auth_v2_scope_is_active | `mesh.auth_v2_scope_is_active` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.publish_auth_permission_set | `mesh.publish_auth_permission_set` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.publish_auth_role_compilation | `mesh.publish_auth_role_compilation` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_account_entitlement_override_guard | `mesh.trg_account_entitlement_override_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_compilation_child_guard | `mesh.trg_auth_compilation_child_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_delegation_child_guard | `mesh.trg_auth_delegation_child_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_delegation_guard | `mesh.trg_auth_delegation_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_deny_binding_guard | `mesh.trg_auth_deny_binding_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_deny_rule_guard | `mesh.trg_auth_deny_rule_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_group_guard | `mesh.trg_auth_group_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_group_member_guard | `mesh.trg_auth_group_member_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_group_role_guard | `mesh.trg_auth_group_role_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_override_guard | `mesh.trg_auth_override_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_permission_set_guard | `mesh.trg_auth_permission_set_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_permission_set_rule_guard | `mesh.trg_auth_permission_set_rule_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_plane_membership_guard | `mesh.trg_auth_plane_membership_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_record_acl_guard | `mesh.trg_auth_record_acl_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_record_acl_permission_guard | `mesh.trg_auth_record_acl_permission_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_role_compilation_guard | `mesh.trg_auth_role_compilation_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_role_guard | `mesh.trg_auth_role_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_scope_child_guard | `mesh.trg_auth_scope_child_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_scope_target_guard | `mesh.trg_auth_scope_target_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_v2_lifecycle_guard | `mesh.trg_auth_v2_lifecycle_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.function.mesh.trg_auth_v2_retention_guard | `mesh.trg_auth_v2_retention_guard` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.mesh.table.mesh_control.auth_catalog_owner | `mesh_control.auth_catalog_owner` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 3 | 12 | 2 |
| wave1.mesh.table.mesh_control.auth_permission | `mesh_control.auth_permission` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 4 | 25 | 3 |
| wave1.mesh.table.mesh_control.auth_permission_category | `mesh_control.auth_permission_category` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 2 | 6 | 0 |
| wave1.mesh.table.mesh_control.auth_permission_plane | `mesh_control.auth_permission_plane` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 3 | 16 | 2 |
| wave1.mesh.table.mesh_control.auth_permission_scope_policy | `mesh_control.auth_permission_scope_policy` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 2 | 10 | 0 |
| wave1.mesh.table.mesh_control.auth_plane | `mesh_control.auth_plane` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 2 | 12 | 2 |
| wave1.mesh.table.mesh_control.authorization_v2_conservation_ledger | `mesh_control.authorization_v2_conservation_ledger` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 1 | 10 | 0 |
| wave1.mesh.table.mesh_control.authorization_v2_deferred_constraint_registry | `mesh_control.authorization_v2_deferred_constraint_registry` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 1 | 8 | 0 |
| wave1.mesh.table.mesh_control.authorization_v2_expand_installation | `mesh_control.authorization_v2_expand_installation` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 1 | 6 | 1 |
| wave1.mesh.table.mesh_control.authorization_v2_frozen_legacy_object | `mesh_control.authorization_v2_frozen_legacy_object` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 1 | 10 | 1 |
| wave1.mesh.table.mesh_control.authorization_v2_transformer_registry | `mesh_control.authorization_v2_transformer_registry` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 1 | 8 | 0 |
| wave1.mesh.table.mesh_control.entity | `mesh_control.entity` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 3 | 15 | 2 |
| wave1.mesh.table.mesh_control.entity_operation | `mesh_control.entity_operation` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 3 | 19 | 1 |
| wave1.mesh.table.mesh_control.entity_operation_plane | `mesh_control.entity_operation_plane` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 3 | 11 | 1 |
| wave1.mesh.table.mesh_control.entity_scope_binding | `mesh_control.entity_scope_binding` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 2 | 7 | 0 |
| wave1.mesh.table.mesh_control.entity_version | `mesh_control.entity_version` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 2 | 9 | 0 |
| wave1.mesh.table.mesh_log.auth_decision_evidence_v2 | `mesh_log.auth_decision_evidence_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 2 | 11 | 0 |
| wave1.mesh.table.mesh_log.auth_decision_evidence_v2_default | `mesh_log.auth_decision_evidence_v2_default` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 2 | 4 | 0 |
| wave1.mesh.table.mesh_log.authorization_account_epoch_v2 | `mesh_log.authorization_account_epoch_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 6 | 1 |
| wave1.mesh.table.mesh_log.authorization_global_epoch_v2 | `mesh_log.authorization_global_epoch_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 5 | 2 |
| wave1.mesh.table.mesh_log.authorization_invalidation_outbox_v2 | `mesh_log.authorization_invalidation_outbox_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 2 | 11 | 2 |
| wave1.mesh.table.mesh_log.authorization_plane_epoch_v2 | `mesh_log.authorization_plane_epoch_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 6 | 1 |
| wave1.mesh.table.mesh_log.authorization_v2_replay_application | `mesh_log.authorization_v2_replay_application` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 2 | 8 | 2 |
| wave1.mesh.table.mesh_log.authorization_v2_replay_binding | `mesh_log.authorization_v2_replay_binding` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 2 | 11 | 1 |
| wave1.mesh.table.mesh_log.authorization_v2_replay_inbox | `mesh_log.authorization_v2_replay_inbox` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 2 | 11 | 1 |
| wave1.mesh.table.mesh_log.authorization_v2_replay_transaction | `mesh_log.authorization_v2_replay_transaction` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 2 | 11 | 2 |
| wave1.mesh.table.mesh.account_entitlement_override | `mesh.account_entitlement_override` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 2 | 7 | 1 |
| wave1.mesh.table.mesh.auth_delegation | `mesh.auth_delegation` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 10 | 1 |
| wave1.mesh.table.mesh.auth_delegation_permission | `mesh.auth_delegation_permission` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 7 | 1 |
| wave1.mesh.table.mesh.auth_delegation_permission_scope | `mesh.auth_delegation_permission_scope` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 7 | 0 |
| wave1.mesh.table.mesh.auth_deny_rule | `mesh.auth_deny_rule` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 10 | 1 |
| wave1.mesh.table.mesh.auth_deny_rule_group | `mesh.auth_deny_rule_group` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 6 | 0 |
| wave1.mesh.table.mesh.auth_deny_rule_hard_policy | `mesh.auth_deny_rule_hard_policy` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 5 | 0 |
| wave1.mesh.table.mesh.auth_deny_rule_principal | `mesh.auth_deny_rule_principal` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 6 | 0 |
| wave1.mesh.table.mesh.auth_group_member_v2 | `mesh.auth_group_member_v2` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 8 | 0 |
| wave1.mesh.table.mesh.auth_group_role_v2 | `mesh.auth_group_role_v2` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 2 | 9 | 0 |
| wave1.mesh.table.mesh.auth_group_v2 | `mesh.auth_group_v2` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 12 | 0 |
| wave1.mesh.table.mesh.auth_override | `mesh.auth_override` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 2 | 10 | 1 |
| wave1.mesh.table.mesh.auth_permission_set | `mesh.auth_permission_set` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 8 | 2 |
| wave1.mesh.table.mesh.auth_permission_set_rule | `mesh.auth_permission_set_rule` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 9 | 1 |
| wave1.mesh.table.mesh.auth_plane_membership | `mesh.auth_plane_membership` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 2 | 15 | 2 |
| wave1.mesh.table.mesh.auth_record_acl | `mesh.auth_record_acl` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 9 | 1 |
| wave1.mesh.table.mesh.auth_record_acl_permission | `mesh.auth_record_acl_permission` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 9 | 1 |
| wave1.mesh.table.mesh.auth_role | `mesh.auth_role` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 10 | 2 |
| wave1.mesh.table.mesh.auth_role_compilation | `mesh.auth_role_compilation` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 9 | 3 |
| wave1.mesh.table.mesh.auth_role_permission | `mesh.auth_role_permission` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 7 | 1 |
| wave1.mesh.table.mesh.auth_role_permission_set | `mesh.auth_role_permission_set` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 4 | 0 |
| wave1.mesh.table.mesh.auth_scope_account | `mesh.auth_scope_account` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 7 | 1 |
| wave1.mesh.table.mesh.auth_scope_network_relationship | `mesh.auth_scope_network_relationship` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 8 | 1 |
| wave1.mesh.table.mesh.auth_scope_resource | `mesh.auth_scope_resource` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 8 | 1 |
| wave1.mesh.table.mesh.auth_scope_target | `mesh.auth_scope_target` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 2 | 11 | 2 |
| wave1.mesh.view.mesh_control.v_authorization_v2_operation_publication | `mesh_control.v_authorization_v2_operation_publication` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 3 | 0 |
| wave1.mesh.view.mesh_log.v_auth_decision_evidence_v2 | `mesh_log.v_auth_decision_evidence_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | promote_after_certified_cutover | 1 | 3 | 0 |
| wave1.mesh.view.mesh_log.v_authorization_invalidation_health_v2 | `mesh_log.v_authorization_invalidation_health_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 4 | 0 |
| wave1.mesh.view.mesh_log.v_authorization_migration_readiness_v2 | `mesh_log.v_authorization_migration_readiness_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | promote_after_certified_cutover | 1 | 4 | 0 |
| wave1.mesh.view.mesh_log.v_authorization_replay_health_v2 | `mesh_log.v_authorization_replay_health_v2` | mesh | authorization_migration_control | mesh-platform | mesh | promote_after_certified_cutover | 1 | 4 | 0 |
| wave1.mesh.view.mesh.auth_authority_readiness_v | `mesh.auth_authority_readiness_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 3 | 0 |
| wave1.mesh.view.mesh.auth_current_delegation_permission_scope_v | `mesh.auth_current_delegation_permission_scope_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 2 | 0 |
| wave1.mesh.view.mesh.auth_current_group_member_v | `mesh.auth_current_group_member_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 4 | 0 |
| wave1.mesh.view.mesh.auth_current_group_role_v | `mesh.auth_current_group_role_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 5 | 0 |
| wave1.mesh.view.mesh.auth_current_plane_membership_v | `mesh.auth_current_plane_membership_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 5 | 0 |
| wave1.mesh.view.mesh.auth_plane_membership_legacy_compare_v | `mesh.auth_plane_membership_legacy_compare_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 3 | 0 |
| wave1.mesh.view.mesh.auth_published_role_permission_v | `mesh.auth_published_role_permission_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 4 | 0 |
| wave1.mesh.view.mesh.auth_scope_target_resolved_v | `mesh.auth_scope_target_resolved_v` | mesh | canonical_authorization_authority | mesh-platform | mesh | promote_after_certified_cutover | 1 | 3 | 0 |
| wave1.neon.function.control.authorization_v2_catalog_entity_aligned | `control.authorization_v2_catalog_entity_aligned` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.control.authorization_v2_is_effective | `control.authorization_v2_is_effective` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.control.authorization_v2_window_contains | `control.authorization_v2_window_contains` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.control.trg_authorization_v2_guard_entity_operation | `control.trg_authorization_v2_guard_entity_operation` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.control.trg_authorization_v2_guard_operation_plane | `control.trg_authorization_v2_guard_operation_plane` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.control.trg_authorization_v2_guard_permission | `control.trg_authorization_v2_guard_permission` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.control.trg_authorization_v2_guard_scope_binding | `control.trg_authorization_v2_guard_scope_binding` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.control.trg_authorization_v2_guard_scope_policy | `control.trg_authorization_v2_guard_scope_policy` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_begin_replay_v2 | `event.fn_authorization_begin_replay_v2` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_bind_replay_v2 | `event.fn_authorization_bind_replay_v2` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_bump_epoch_v2 | `event.fn_authorization_bump_epoch_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_claim_invalidations_v2 | `event.fn_authorization_claim_invalidations_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_complete_invalidation_v2 | `event.fn_authorization_complete_invalidation_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_complete_replay_v2 | `event.fn_authorization_complete_replay_v2` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_emit_invalidation_v2 | `event.fn_authorization_emit_invalidation_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_fail_invalidation_v2 | `event.fn_authorization_fail_invalidation_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_set_replay_event_context_v2 | `event.fn_authorization_set_replay_event_context_v2` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_stage_replay_v2 | `event.fn_authorization_stage_replay_v2` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_supersede_scheduled_v2 | `event.fn_authorization_supersede_scheduled_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_v2_json_uuid_values | `event.fn_authorization_v2_json_uuid_values` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_v2_safe_timestamptz | `event.fn_authorization_v2_safe_timestamptz` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_v2_safe_uuid | `event.fn_authorization_v2_safe_uuid` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.fn_authorization_v2_source_row_key | `event.fn_authorization_v2_source_row_key` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.event.trg_authorization_authority_invalidate_v2 | `event.trg_authorization_authority_invalidate_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 0 | 0 |
| wave1.neon.function.event.trg_authorization_invalidation_immutable_v2 | `event.trg_authorization_invalidation_immutable_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 0 | 0 |
| wave1.neon.function.event.trg_authorization_v2_replay_inbox_immutable | `event.trg_authorization_v2_replay_inbox_immutable` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 0 | 0 |
| wave1.neon.function.event.trg_authorization_v2_replay_state_guard | `event.trg_authorization_v2_replay_state_guard` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 0 | 0 |
| wave1.neon.function.log.trg_auth_decision_evidence_v2_immutable | `log.trg_auth_decision_evidence_v2_immutable` | neon | authorization_decision_evidence | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.auth_v2_entity_is_eligible | `master.auth_v2_entity_is_eligible` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.auth_v2_permission_is_effective | `master.auth_v2_permission_is_effective` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.auth_v2_permission_is_eligible | `master.auth_v2_permission_is_eligible` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.auth_v2_principal_has_plane | `master.auth_v2_principal_has_plane` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.current_auth_plane_code | `master.current_auth_plane_code` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.current_auth_plane_code_soft | `master.current_auth_plane_code_soft` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.publish_auth_role_compilation | `master.publish_auth_role_compilation` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_compilation_child_guard | `master.trg_auth_compilation_child_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_delegation_child_guard | `master.trg_auth_delegation_child_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_delegation_guard | `master.trg_auth_delegation_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_deny_binding_guard | `master.trg_auth_deny_binding_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_deny_rule_guard | `master.trg_auth_deny_rule_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_group_guard | `master.trg_auth_group_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_group_member_guard | `master.trg_auth_group_member_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_group_role_guard | `master.trg_auth_group_role_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_override_guard | `master.trg_auth_override_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_permission_set_guard | `master.trg_auth_permission_set_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_permission_set_rule_guard | `master.trg_auth_permission_set_rule_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_plane_membership_guard | `master.trg_auth_plane_membership_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_record_acl_guard | `master.trg_auth_record_acl_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_record_acl_permission_guard | `master.trg_auth_record_acl_permission_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_role_compilation_guard | `master.trg_auth_role_compilation_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_role_guard | `master.trg_auth_role_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_scope_child_guard | `master.trg_auth_scope_child_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_scope_target_guard | `master.trg_auth_scope_target_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_auth_v2_retention_guard | `master.trg_auth_v2_retention_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.function.master.trg_tenant_entitlement_override_guard | `master.trg_tenant_entitlement_override_guard` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave1.neon.table.control.auth_catalog_owner | `control.auth_catalog_owner` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 3 | 15 | 3 |
| wave1.neon.table.control.auth_permission | `control.auth_permission` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 4 | 26 | 3 |
| wave1.neon.table.control.auth_permission_plane | `control.auth_permission_plane` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 3 | 19 | 2 |
| wave1.neon.table.control.auth_permission_scope_policy | `control.auth_permission_scope_policy` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 13 | 0 |
| wave1.neon.table.control.auth_plane | `control.auth_plane` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 13 | 1 |
| wave1.neon.table.control.authorization_v2_conservation_ledger | `control.authorization_v2_conservation_ledger` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 9 | 0 |
| wave1.neon.table.control.authorization_v2_deferred_constraint_registry | `control.authorization_v2_deferred_constraint_registry` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 8 | 1 |
| wave1.neon.table.control.authorization_v2_expand_installation | `control.authorization_v2_expand_installation` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 6 | 1 |
| wave1.neon.table.control.authorization_v2_frozen_legacy_object | `control.authorization_v2_frozen_legacy_object` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 8 | 2 |
| wave1.neon.table.control.authorization_v2_transformer_registry | `control.authorization_v2_transformer_registry` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 6 | 0 |
| wave1.neon.table.control.entity_operation_plane | `control.entity_operation_plane` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 3 | 14 | 1 |
| wave1.neon.table.control.entity_scope_binding | `control.entity_scope_binding` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 10 | 0 |
| wave1.neon.table.event.authorization_global_epoch_v2 | `event.authorization_global_epoch_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 5 | 2 |
| wave1.neon.table.event.authorization_invalidation_outbox_v2 | `event.authorization_invalidation_outbox_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 10 | 2 |
| wave1.neon.table.event.authorization_plane_epoch_v2 | `event.authorization_plane_epoch_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 6 | 1 |
| wave1.neon.table.event.authorization_tenant_epoch_v2 | `event.authorization_tenant_epoch_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 6 | 1 |
| wave1.neon.table.event.authorization_v2_replay_application | `event.authorization_v2_replay_application` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 8 | 2 |
| wave1.neon.table.event.authorization_v2_replay_binding | `event.authorization_v2_replay_binding` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 9 | 1 |
| wave1.neon.table.event.authorization_v2_replay_inbox | `event.authorization_v2_replay_inbox` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 9 | 1 |
| wave1.neon.table.event.authorization_v2_replay_transaction | `event.authorization_v2_replay_transaction` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 10 | 2 |
| wave1.neon.table.log.auth_decision_evidence_v2 | `log.auth_decision_evidence_v2` | neon | authorization_decision_evidence | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 9 | 0 |
| wave1.neon.table.log.auth_decision_evidence_v2_default | `log.auth_decision_evidence_v2_default` | neon | authorization_decision_evidence | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 4 | 0 |
| wave1.neon.table.master.auth_delegation | `master.auth_delegation` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 12 | 1 |
| wave1.neon.table.master.auth_delegation_permission | `master.auth_delegation_permission` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 11 | 1 |
| wave1.neon.table.master.auth_delegation_permission_scope | `master.auth_delegation_permission_scope` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 11 | 0 |
| wave1.neon.table.master.auth_deny_rule | `master.auth_deny_rule` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 12 | 1 |
| wave1.neon.table.master.auth_deny_rule_group | `master.auth_deny_rule_group` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 10 | 0 |
| wave1.neon.table.master.auth_deny_rule_hard_policy | `master.auth_deny_rule_hard_policy` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 10 | 0 |
| wave1.neon.table.master.auth_deny_rule_principal | `master.auth_deny_rule_principal` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 10 | 0 |
| wave1.neon.table.master.auth_group_member_v2 | `master.auth_group_member_v2` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 12 | 0 |
| wave1.neon.table.master.auth_group_role_v2 | `master.auth_group_role_v2` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 13 | 0 |
| wave1.neon.table.master.auth_group_v2 | `master.auth_group_v2` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 16 | 0 |
| wave1.neon.table.master.auth_override | `master.auth_override` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 13 | 1 |
| wave1.neon.table.master.auth_permission_set | `master.auth_permission_set` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 11 | 1 |
| wave1.neon.table.master.auth_permission_set_rule | `master.auth_permission_set_rule` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 11 | 1 |
| wave1.neon.table.master.auth_plane_membership | `master.auth_plane_membership` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 14 | 1 |
| wave1.neon.table.master.auth_record_acl | `master.auth_record_acl` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 11 | 1 |
| wave1.neon.table.master.auth_record_acl_permission | `master.auth_record_acl_permission` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 11 | 1 |
| wave1.neon.table.master.auth_role | `master.auth_role` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 14 | 2 |
| wave1.neon.table.master.auth_role_compilation | `master.auth_role_compilation` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 12 | 2 |
| wave1.neon.table.master.auth_role_permission | `master.auth_role_permission` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 11 | 1 |
| wave1.neon.table.master.auth_role_permission_set | `master.auth_role_permission_set` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 10 | 0 |
| wave1.neon.table.master.auth_scope_company | `master.auth_scope_company` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 11 | 0 |
| wave1.neon.table.master.auth_scope_legal_entity | `master.auth_scope_legal_entity` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 11 | 0 |
| wave1.neon.table.master.auth_scope_operating_organization | `master.auth_scope_operating_organization` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 11 | 0 |
| wave1.neon.table.master.auth_scope_target | `master.auth_scope_target` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 15 | 1 |
| wave1.neon.table.master.auth_scope_tenant | `master.auth_scope_tenant` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 11 | 0 |
| wave1.neon.table.master.tenant_entitlement_override | `master.tenant_entitlement_override` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 2 | 10 | 1 |
| wave1.neon.table.shared.auth_permission_category | `shared.auth_permission_category` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 9 | 0 |
| wave1.neon.view.control.v_authorization_v2_deferred_constraints | `control.v_authorization_v2_deferred_constraints` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 6 | 0 |
| wave1.neon.view.control.v_authorization_v2_operation_publication | `control.v_authorization_v2_operation_publication` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 4 | 0 |
| wave1.neon.view.event.v_authorization_invalidation_health_v2 | `event.v_authorization_invalidation_health_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 2 | 0 |
| wave1.neon.view.event.v_authorization_replay_health_v2 | `event.v_authorization_replay_health_v2` | neon | authorization_migration_control | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 3 | 0 |
| wave1.neon.view.master.auth_current_delegation_permission_scope_v | `master.auth_current_delegation_permission_scope_v` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 3 | 0 |
| wave1.neon.view.master.auth_current_group_member_v | `master.auth_current_group_member_v` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 4 | 0 |
| wave1.neon.view.master.auth_current_group_role_v | `master.auth_current_group_role_v` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 5 | 0 |
| wave1.neon.view.master.auth_current_plane_membership_v | `master.auth_current_plane_membership_v` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 5 | 0 |
| wave1.neon.view.master.auth_published_role_permission_v | `master.auth_published_role_permission_v` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 4 | 0 |
| wave1.neon.view.master.auth_scope_target_resolved_v | `master.auth_scope_target_resolved_v` | neon | canonical_authorization_authority | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 4 | 0 |
| wave2.mesh.table.mesh_control.auth_catalog_reference_v2 | `mesh_control.auth_catalog_reference_v2` | mesh | canonical_authorization_catalog | mesh-platform | mesh | promote_after_certified_cutover | 1 | 4 | 1 |
| wave2.mesh.table.mesh_control.auth_permission_alias_v2 | `mesh_control.auth_permission_alias_v2` | mesh | authorization_migration_control | mesh-platform | mesh | remove_after_certified_catalog_cutover | 1 | 7 | 1 |
| wave2.neon.table.control.auth_catalog_reference_v2 | `control.auth_catalog_reference_v2` | neon | canonical_authorization_catalog | platform-iam | admin, neon | promote_after_certified_cutover | 1 | 5 | 1 |
| wave2.neon.table.control.auth_permission_alias_v2 | `control.auth_permission_alias_v2` | neon | authorization_migration_control | platform-iam | admin, neon | remove_after_certified_catalog_cutover | 1 | 8 | 1 |
| wave3.mesh.function.mesh_control.trg_authorization_v3_scope_mapping_guard | `mesh_control.trg_authorization_v3_scope_mapping_guard` | mesh | authorization_migration_control | mesh-platform | mesh | retain_until_migration_evidence_is_sealed | 1 | 0 | 0 |
| wave3.mesh.function.mesh_control.trg_authorization_v3_subject_mapping_guard | `mesh_control.trg_authorization_v3_subject_mapping_guard` | mesh | authorization_migration_control | mesh-platform | mesh | retain_until_migration_evidence_is_sealed | 1 | 0 | 0 |
| wave3.mesh.table.mesh_control.authorization_v3_scope_mapping | `mesh_control.authorization_v3_scope_mapping` | mesh | authorization_migration_control | mesh-platform | mesh | retain_as_migration_evidence | 1 | 5 | 1 |
| wave3.mesh.table.mesh_control.authorization_v3_subject_mapping | `mesh_control.authorization_v3_subject_mapping` | mesh | authorization_migration_control | mesh-platform | mesh | retain_as_migration_evidence | 1 | 5 | 1 |
| wave3.neon.function.control.trg_authorization_v3_scope_mapping_guard | `control.trg_authorization_v3_scope_mapping_guard` | neon | authorization_migration_control | platform-iam | admin, neon | retain_until_migration_evidence_is_sealed | 1 | 0 | 0 |
| wave3.neon.function.control.trg_authorization_v3_subject_mapping_guard | `control.trg_authorization_v3_subject_mapping_guard` | neon | authorization_migration_control | platform-iam | admin, neon | retain_until_migration_evidence_is_sealed | 1 | 0 | 0 |
| wave3.neon.table.control.authorization_v3_scope_mapping | `control.authorization_v3_scope_mapping` | neon | authorization_migration_control | platform-iam | admin, neon | retain_as_migration_evidence | 1 | 5 | 1 |
| wave3.neon.table.control.authorization_v3_subject_mapping | `control.authorization_v3_subject_mapping` | neon | authorization_migration_control | platform-iam | admin, neon | retain_as_migration_evidence | 1 | 5 | 1 |
| wave4.mesh.function.mesh.resolve_account_permission_entitlement | `mesh.resolve_account_permission_entitlement` | mesh | canonical_entitlement_evaluator | mesh-platform | mesh | promote_after_certified_cutover | 1 | 0 | 0 |
| wave4.mesh.table.mesh_control.auth_entitlement_policy | `mesh_control.auth_entitlement_policy` | mesh | canonical_entitlement_policy | mesh-platform | mesh | promote_after_certified_cutover | 1 | 4 | 0 |
| wave4.mesh.table.mesh_control.authorization_v4_legacy_exception_disposition | `mesh_control.authorization_v4_legacy_exception_disposition` | mesh | authorization_migration_control | mesh-platform | mesh | retain_as_migration_evidence | 1 | 4 | 0 |
| wave4.mesh.table.mesh.account_entitlement | `mesh.account_entitlement` | mesh | canonical_entitlement_authority | mesh-platform | mesh | promote_after_certified_cutover | 2 | 6 | 1 |
| wave4.neon.function.control.resolve_admin_permission_entitlement | `control.resolve_admin_permission_entitlement` | neon | canonical_entitlement_evaluator | platform-iam | admin | promote_after_certified_cutover | 1 | 0 | 0 |
| wave4.neon.function.master.resolve_neon_permission_entitlement | `master.resolve_neon_permission_entitlement` | neon | canonical_entitlement_evaluator | platform-iam | neon | promote_after_certified_cutover | 1 | 0 | 0 |
| wave4.neon.table.control.auth_admin_entitlement_policy | `control.auth_admin_entitlement_policy` | neon | canonical_entitlement_policy | platform-iam | admin | promote_after_certified_cutover | 1 | 7 | 1 |
| wave4.neon.table.control.auth_entitlement_target_policy | `control.auth_entitlement_target_policy` | neon | canonical_entitlement_policy | platform-iam | neon | promote_after_certified_cutover | 1 | 3 | 0 |
| wave4.neon.table.control.authorization_v4_access_grant_disposition | `control.authorization_v4_access_grant_disposition` | neon | authorization_migration_control | platform-iam | admin, neon | retain_as_migration_evidence | 1 | 4 | 1 |
| wave4.neon.table.control.authorization_v4_feature_grant_disposition | `control.authorization_v4_feature_grant_disposition` | neon | authorization_migration_control | platform-iam | admin, neon | retain_as_migration_evidence | 1 | 4 | 0 |
| wave4.neon.table.control.authorization_v4_role_deny_disposition | `control.authorization_v4_role_deny_disposition` | neon | authorization_migration_control | platform-iam | admin, neon | retain_as_migration_evidence | 1 | 4 | 0 |
| wave5.mesh.function.mesh_control.trg_authorization_v5_consumer_guard | `mesh_control.trg_authorization_v5_consumer_guard` | mesh | authorization_v2_runtime | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave5.mesh.function.mesh_control.trg_authorization_v5_release_guard | `mesh_control.trg_authorization_v5_release_guard` | mesh | authorization_v2_runtime | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave5.mesh.table.mesh_control.authorization_consumer_migration_v2 | `mesh_control.authorization_consumer_migration_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | retain_through_certified_observation | 1 | 4 | 1 |
| wave5.mesh.table.mesh_control.authorization_runtime_release_v2 | `mesh_control.authorization_runtime_release_v2` | mesh | authorization_v2_runtime | mesh-platform | mesh | retain_through_certified_observation | 1 | 4 | 1 |
| wave5.neon.function.control.trg_authorization_v5_consumer_guard | `control.trg_authorization_v5_consumer_guard` | neon | authorization_v2_runtime | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave5.neon.function.control.trg_authorization_v5_release_guard | `control.trg_authorization_v5_release_guard` | neon | authorization_v2_runtime | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave5.neon.table.control.authorization_consumer_migration_v2 | `control.authorization_consumer_migration_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | retain_through_certified_observation | 1 | 4 | 1 |
| wave5.neon.table.control.authorization_runtime_release_v2 | `control.authorization_runtime_release_v2` | neon | authorization_v2_runtime | platform-iam | admin, neon | retain_through_certified_observation | 1 | 4 | 1 |
| wave7.mesh.function.mesh_control.fn_authorization_freeze_legacy_writes_v2 | `mesh_control.fn_authorization_freeze_legacy_writes_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_install_legacy_freeze_guards_v2 | `mesh_control.fn_authorization_install_legacy_freeze_guards_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_install_target_guard_v2 | `mesh_control.fn_authorization_install_target_guard_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_set_cohort_state_v2 | `mesh_control.fn_authorization_set_cohort_state_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_set_resolver_state_v2 | `mesh_control.fn_authorization_set_resolver_state_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_switch_writer_v2 | `mesh_control.fn_authorization_switch_writer_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.mesh.function.mesh_control.fn_authorization_validate_target_guard_v2 | `mesh_control.fn_authorization_validate_target_guard_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.mesh.function.mesh_control.trg_authorization_cohort_guard_v2 | `mesh_control.trg_authorization_cohort_guard_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.mesh.function.mesh_control.trg_authorization_cutover_state_guard_v2 | `mesh_control.trg_authorization_cutover_state_guard_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.mesh.function.mesh_control.trg_authorization_legacy_write_freeze_v2 | `mesh_control.trg_authorization_legacy_write_freeze_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.mesh.function.mesh_control.trg_authorization_target_writer_v2 | `mesh_control.trg_authorization_target_writer_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.mesh.function.mesh_control.trg_authorization_wave7_immutable_v2 | `mesh_control.trg_authorization_wave7_immutable_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.mesh.table.mesh_control.authorization_cutover_cohort_v2 | `mesh_control.authorization_cutover_cohort_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 5 | 1 |
| wave7.mesh.table.mesh_control.authorization_cutover_plane_v2 | `mesh_control.authorization_cutover_plane_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 5 | 2 |
| wave7.mesh.table.mesh_control.authorization_shadow_mismatch_disposition_v2 | `mesh_control.authorization_shadow_mismatch_disposition_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 4 | 0 |
| wave7.mesh.table.mesh_control.authorization_target_guard_installation_v2 | `mesh_control.authorization_target_guard_installation_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 3 | 2 |
| wave7.mesh.table.mesh_control.authorization_writer_switch_receipt_v2 | `mesh_control.authorization_writer_switch_receipt_v2` | mesh | authorization_cutover_control | mesh-platform | mesh | retain_through_certified_observation | 1 | 3 | 1 |
| wave7.mesh.table.mesh_log.authorization_cutover_load_evidence_v2 | `mesh_log.authorization_cutover_load_evidence_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | retain_through_certified_observation | 1 | 4 | 0 |
| wave7.mesh.table.mesh_log.authorization_shadow_comparison_v2 | `mesh_log.authorization_shadow_comparison_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | retain_through_certified_observation | 1 | 6 | 0 |
| wave7.mesh.view.mesh_log.v_authorization_wave7_readiness_v2 | `mesh_log.v_authorization_wave7_readiness_v2` | mesh | authorization_decision_evidence | mesh-platform | mesh | retain_through_certified_observation | 1 | 3 | 0 |
| wave7.neon.function.control.fn_authorization_freeze_legacy_writes_v2 | `control.fn_authorization_freeze_legacy_writes_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_install_legacy_freeze_guards_v2 | `control.fn_authorization_install_legacy_freeze_guards_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_install_target_guard_v2 | `control.fn_authorization_install_target_guard_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_set_cohort_state_v2 | `control.fn_authorization_set_cohort_state_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_set_resolver_state_v2 | `control.fn_authorization_set_resolver_state_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_switch_writer_v2 | `control.fn_authorization_switch_writer_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.neon.function.control.fn_authorization_validate_target_guard_v2 | `control.fn_authorization_validate_target_guard_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.neon.function.control.trg_authorization_cohort_guard_v2 | `control.trg_authorization_cohort_guard_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.neon.function.control.trg_authorization_cutover_state_guard_v2 | `control.trg_authorization_cutover_state_guard_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.neon.function.control.trg_authorization_legacy_write_freeze_v2 | `control.trg_authorization_legacy_write_freeze_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.neon.function.control.trg_authorization_target_writer_v2 | `control.trg_authorization_target_writer_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.neon.function.control.trg_authorization_wave7_immutable_v2 | `control.trg_authorization_wave7_immutable_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 0 | 0 |
| wave7.neon.table.control.authorization_cutover_cohort_v2 | `control.authorization_cutover_cohort_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 5 | 1 |
| wave7.neon.table.control.authorization_cutover_plane_v2 | `control.authorization_cutover_plane_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 5 | 2 |
| wave7.neon.table.control.authorization_shadow_mismatch_disposition_v2 | `control.authorization_shadow_mismatch_disposition_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 4 | 0 |
| wave7.neon.table.control.authorization_target_guard_installation_v2 | `control.authorization_target_guard_installation_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 3 | 2 |
| wave7.neon.table.control.authorization_writer_switch_receipt_v2 | `control.authorization_writer_switch_receipt_v2` | neon | authorization_cutover_control | platform-iam | admin, neon | retain_through_certified_observation | 1 | 3 | 1 |
| wave7.neon.table.event.authorization_cutover_load_evidence_v2 | `event.authorization_cutover_load_evidence_v2` | neon | authorization_decision_evidence | platform-iam | admin, neon | retain_through_certified_observation | 1 | 4 | 0 |
| wave7.neon.table.event.authorization_shadow_comparison_v2 | `event.authorization_shadow_comparison_v2` | neon | authorization_decision_evidence | platform-iam | admin, neon | retain_through_certified_observation | 1 | 6 | 0 |
| wave7.neon.view.event.v_authorization_wave7_readiness_v2 | `event.v_authorization_wave7_readiness_v2` | neon | authorization_decision_evidence | platform-iam | admin, neon | retain_through_certified_observation | 1 | 3 | 0 |
| wave9.both.function.public.trg_authorization_contraction_receipt_v2_immutable | `public.trg_authorization_contraction_receipt_v2_immutable` | neon_and_mesh | authorization_contraction_evidence | platform-iam+mesh-platform | admin, neon, mesh | retain_with_contraction_receipt | 2 | 0 | 0 |
| wave9.both.table.public.authorization_contraction_receipt_v2 | `public.authorization_contraction_receipt_v2` | neon_and_mesh | authorization_contraction_evidence | platform-iam+mesh-platform | admin, neon, mesh | retain_as_immutable_contraction_evidence | 2 | 4 | 2 |

## Authorization-linked database functions, triggers, and views

| Kind | Exact identity | Classification | Owner | Disposition | Source | Dependencies |
|---|---|---|---|---|---|---|
| function | `control.advance_workflow_state` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/control/05_functions.sql:589 | `control.lifecycle_state`<br>`control.lifecycle_transition`<br>`control.lifecycle_transition_gate` |
| trigger | `control.auth_permission_scope_policy.trg_auth_permission_scope_publish_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_authorization_v2_catalog_triggers.sql:17 | `control.auth_permission_scope_policy` |
| trigger | `control.auth_permission.trg_auth_permission_publish_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_authorization_v2_catalog_triggers.sql:9 | `control.auth_permission` |
| trigger | `control.authorization_consumer_migration_v2.trg_authorization_v5_consumer_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_authorization_v5_runtime_triggers.sql:11 | `control.authorization_consumer_migration_v2` |
| trigger | `control.authorization_cutover_cohort_v2.trg_authorization_cohort_guard_v2` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_authorization_v7_shadow_cutover_triggers.sql:10 | `control.authorization_cutover_cohort_v2` |
| trigger | `control.authorization_cutover_plane_v2.trg_authorization_cutover_state_guard_v2` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_authorization_v7_shadow_cutover_triggers.sql:3 | `control.authorization_cutover_plane_v2` |
| trigger | `control.authorization_runtime_release_v2.trg_authorization_v5_release_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_authorization_v5_runtime_triggers.sql:3 | `control.authorization_runtime_release_v2` |
| function | `control.authorization_v2_catalog_entity_aligned` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/control/05_authorization_v2_catalog_functions.sql:44 | `control.auth_catalog_owner`<br>`control.entity` |
| function | `control.authorization_v2_is_effective` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/control/05_authorization_v2_catalog_functions.sql:6 | — |
| function | `control.authorization_v2_window_contains` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/control/05_authorization_v2_catalog_functions.sql:21 | — |
| trigger | `control.authorization_v3_scope_mapping.trg_authorization_v3_scope_mapping_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06zu_authorization_v3_mapping_triggers.sql:11 | `control.authorization_v3_scope_mapping` |
| trigger | `control.authorization_v3_subject_mapping.trg_authorization_v3_subject_mapping_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06zu_authorization_v3_mapping_triggers.sql:3 | `control.authorization_v3_subject_mapping` |
| trigger | `control.authorization_writer_switch_receipt_v2.trg_authorization_writer_switch_receipt_immutable_v2` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_authorization_v7_shadow_cutover_triggers.sql:17 | `control.authorization_writer_switch_receipt_v2` |
| trigger | `control.entity_action_rule.trg_ear_contract_scope` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06zz_meta_entity_contract_m1.sql:70 | `control.entity_action_rule` |
| trigger | `control.entity_field.trg_ef_invalidate` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:231 | `control.entity_field` |
| trigger | `control.entity_field.trg_entity_field_flag_defaults` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:42 | `control.entity_field` |
| trigger | `control.entity_flow_step.trg_efs_contract_scope` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06zz_meta_entity_contract_m1.sql:76 | `control.entity_flow_step` |
| trigger | `control.entity_flow_step.trg_efs_updated_at` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:91 | `control.entity_flow_step` |
| trigger | `control.entity_flow.trg_eflow_contract_scope` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06zz_meta_entity_contract_m1.sql:82 | `control.entity_flow` |
| trigger | `control.entity_flow.trg_eflow_status_changed` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:86 | `control.entity_flow` |
| trigger | `control.entity_flow.trg_eflow_updated_at` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:81 | `control.entity_flow` |
| trigger | `control.entity_lifecycle_state_mask.trg_elsm_contract_scope` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/control/06zz_meta_entity_contract_m1.sql:64 | `control.entity_lifecycle_state_mask` |
| trigger | `control.entity_lifecycle_state_mask.trg_elsm_invalidate` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:217 | `control.entity_lifecycle_state_mask` |
| trigger | `control.entity_lifecycle.trg_el_contract_scope` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/control/06zz_meta_entity_contract_m1.sql:58 | `control.entity_lifecycle` |
| trigger | `control.entity_lifecycle.trg_el_invalidate` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:241 | `control.entity_lifecycle` |
| trigger | `control.entity_lifecycle.trg_el_validate_entity_binding` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:506 | `control.entity_lifecycle` |
| trigger | `control.entity_operation_plane.trg_entity_operation_plane_publish_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_authorization_v2_catalog_triggers.sql:33 | `control.entity_operation_plane` |
| trigger | `control.entity_operation.trg_entity_operation_v2_publish_guard` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06_authorization_v2_catalog_triggers.sql:25 | `control.entity_operation` |
| trigger | `control.entity_operation.trg_eo_contract_scope` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06zz_meta_entity_contract_m1.sql:34 | `control.entity_operation` |
| trigger | `control.entity_operation.trg_eo_invalidate` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:212 | `control.entity_operation` |
| trigger | `control.entity_operation.trg_eo_validate_entity_binding` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:513 | `control.entity_operation` |
| trigger | `control.entity_policy.trg_ep_contract_scope` | structural_dependency | policy-platform | review_with_registered_dependency | server/db/ddl/control/06zz_meta_entity_contract_m1.sql:40 | `control.entity_policy` |
| trigger | `control.entity_policy.trg_ep_invalidate` | structural_dependency | policy-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:226 | `control.entity_policy` |
| trigger | `control.entity_relation.trg_er_contract_scope` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06zz_meta_entity_contract_m1.sql:46 | `control.entity_relation` |
| trigger | `control.entity_relation.trg_er_invalidate` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:246 | `control.entity_relation` |
| trigger | `control.entity_relation.trg_er_validate_target_entity` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:520 | `control.entity_relation` |
| trigger | `control.entity_scope_binding.trg_entity_scope_binding_publish_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_authorization_v2_catalog_triggers.sql:41 | `control.entity_scope_binding` |
| trigger | `control.entity_surface.trg_es_contract_scope` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06zz_meta_entity_contract_m1.sql:28 | `control.entity_surface` |
| trigger | `control.entity_version.trg_ev_block_mutation` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:361 | `control.entity_version` |
| trigger | `control.entity_version.trg_ev_bump_latest_version_no` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:35 | `control.entity_version` |
| trigger | `control.entity_version.trg_ev_contract_guard` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06zz_meta_entity_contract_m1.sql:6 | `control.entity_version` |
| trigger | `control.entity_version.trg_ev_maintain_publish_state` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06zz_meta_entity_contract_m1.sql:17 | `control.entity_version` |
| trigger | `control.entity.trg_entity_ensure_publish_state` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:29 | `control.entity` |
| trigger | `control.field_security_policy.trg_fsp_invalidate` | structural_dependency | policy-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:236 | `control.field_security_policy` |
| function | `control.fn_authorization_freeze_legacy_writes_v2` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql:246 | `control.authorization_cutover_plane_v2`<br>`event.v_authorization_wave7_readiness_v2` |
| function | `control.fn_authorization_install_legacy_freeze_guards_v2` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql:462 | `control.authorization_capture_source`<br>`control.trg_authorization_legacy_write_freeze_v2` |
| function | `control.fn_authorization_install_target_guard_v2` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql:584 | `control.authorization_target_guard_installation_v2`<br>`control.trg_authorization_target_writer_v2` |
| function | `control.fn_authorization_set_cohort_state_v2` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql:166 | `control.authorization_cutover_cohort_v2`<br>`control.authorization_cutover_plane_v2`<br>`event.v_authorization_wave7_readiness_v2` |
| function | `control.fn_authorization_set_resolver_state_v2` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql:65 | `control.authorization_cutover_cohort_v2`<br>`control.authorization_cutover_plane_v2`<br>`event.v_authorization_wave7_readiness_v2` |
| function | `control.fn_authorization_switch_writer_v2` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql:298 | `control.authorization_cutover_plane_v2`<br>`control.authorization_target_guard_installation_v2`<br>`control.authorization_writer_registry`<br>`control.authorization_writer_switch_receipt_v2`<br>`event.v_authorization_wave7_readiness_v2` |
| function | `control.fn_authorization_validate_target_guard_v2` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql:664 | `control.authorization_target_guard_installation_v2`<br>`control.fn_authorization_freeze_legacy_writes_v2`<br>`control.fn_authorization_install_legacy_freeze_guards_v2`<br>`control.fn_authorization_install_target_guard_v2`<br>`control.fn_authorization_set_cohort_state_v2`<br>`control.fn_authorization_set_resolver_state_v2`<br>`control.fn_authorization_switch_writer_v2` |
| function | `control.fn_block_effective_version_mutation` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:284 | `control.entity`<br>`control.entity_version` |
| function | `control.fn_invalidate_all_execution_descriptors` | structural_dependency | metadata-platform+policy-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:190 | `control.entity_field`<br>`control.entity_lifecycle`<br>`control.entity_lifecycle_state_mask`<br>`control.entity_operation`<br>`control.entity_policy`<br>`control.entity_relation`<br>`control.field_security_policy`<br>`control.lifecycle`<br>`control.lifecycle_state`<br>`control.lifecycle_transition` |
| function | `control.fn_invalidate_by_entity_id` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:67 | `control.entity` |
| function | `control.fn_invalidate_by_entity_version_id` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:128 | `control.entity`<br>`control.entity_version` |
| function | `control.fn_invalidate_by_overlay_id` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:149 | `control.entity` |
| function | `control.fn_invalidate_by_overlay_row` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:169 | `control.entity` |
| function | `control.generate_fiscal_periods` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/control/05_functions_fiscal_calendar.sql:237 | `master.company_code` |
| trigger | `control.lifecycle_state.trg_lifecycle_state_execdesc_invalidate` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:271 | `control.lifecycle_state` |
| trigger | `control.lifecycle_transition.trg_lifecycle_transition_execdesc_invalidate` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:276 | `control.lifecycle_transition` |
| trigger | `control.lifecycle.trg_lifecycle_execdesc_invalidate` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/control/06z_three_plane_triggers.sql:266 | `control.lifecycle` |
| trigger | `control.mfa_config.trg_mfa_config_contact_link_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:53 | `control.mfa_config` |
| trigger | `control.mfa_config.trg_mfa_config_method_type_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:60 | `control.mfa_config` |
| trigger | `control.mfa_config.trg_mfa_config_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:49 | `control.mfa_config` |
| function | `control.next_entity_number` | structural_dependency | finance-platform+metadata-platform+platform-iam | review_with_registered_dependency | server/db/ddl/control/05_functions.sql:2622 | `control.entity`<br>`master.company_code`<br>`master.tenant` |
| function | `control.provision_asset_policies` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/control/05_functions.sql:3318 | `master.company_code` |
| function | `control.resolve_admin_permission_entitlement` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/control/05zv_authorization_v4_entitlement_functions.sql:1 | `control.auth_admin_entitlement_policy`<br>`control.auth_permission`<br>`control.auth_permission_plane` |
| function | `control.trg_authorization_cohort_guard_v2` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql:23 | — |
| function | `control.trg_authorization_cutover_state_guard_v2` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql:1 | — |
| function | `control.trg_authorization_legacy_write_freeze_v2` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql:426 | `control.authorization_cutover_plane_v2` |
| function | `control.trg_authorization_target_writer_v2` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql:525 | `control.authorization_cutover_plane_v2`<br>`control.authorization_writer_registry` |
| function | `control.trg_authorization_v2_guard_entity_operation` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/control/05_authorization_v2_catalog_functions.sql:206 | `control.auth_catalog_owner`<br>`control.auth_permission`<br>`control.authorization_v2_catalog_entity_aligned`<br>`control.authorization_v2_is_effective`<br>`control.authorization_v2_window_contains` |
| function | `control.trg_authorization_v2_guard_operation_plane` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/control/05_authorization_v2_catalog_functions.sql:335 | `control.auth_catalog_owner`<br>`control.auth_permission`<br>`control.auth_permission_plane`<br>`control.auth_plane`<br>`control.authorization_v2_catalog_entity_aligned`<br>`control.authorization_v2_is_effective`<br>`control.authorization_v2_window_contains`<br>`control.entity_operation` |
| function | `control.trg_authorization_v2_guard_permission` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/control/05_authorization_v2_catalog_functions.sql:74 | `control.auth_catalog_owner`<br>`control.authorization_v2_catalog_entity_aligned`<br>`shared.auth_permission_category` |
| function | `control.trg_authorization_v2_guard_scope_binding` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/control/05_authorization_v2_catalog_functions.sql:441 | `control.auth_catalog_owner`<br>`control.auth_permission`<br>`control.auth_permission_plane`<br>`control.auth_permission_scope_policy`<br>`control.auth_plane`<br>`control.authorization_v2_catalog_entity_aligned`<br>`control.authorization_v2_is_effective`<br>`control.authorization_v2_window_contains`<br>`control.entity_operation`<br>`control.entity_operation_plane` |
| function | `control.trg_authorization_v2_guard_scope_policy` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/control/05_authorization_v2_catalog_functions.sql:127 | `control.auth_catalog_owner`<br>`control.auth_permission`<br>`control.auth_permission_plane`<br>`control.auth_plane`<br>`control.authorization_v2_is_effective`<br>`control.authorization_v2_window_contains` |
| function | `control.trg_authorization_v3_scope_mapping_guard` | registered | platform-iam | retain_until_migration_evidence_is_sealed | server/db/ddl/control/05zu_authorization_v3_mapping_functions.sql:70 | `control.trg_authorization_v3_subject_mapping_guard`<br>`master.auth_group_role_v2`<br>`master.auth_override`<br>`master.auth_scope_target` |
| function | `control.trg_authorization_v3_subject_mapping_guard` | registered | platform-iam | retain_until_migration_evidence_is_sealed | server/db/ddl/control/05zu_authorization_v3_mapping_functions.sql:1 | `master.auth_current_group_role_v`<br>`master.auth_group_member_v2`<br>`master.auth_group_v2`<br>`master.auth_plane_membership` |
| function | `control.trg_authorization_v5_consumer_guard` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v5_runtime_functions.sql:52 | `control.authorization_runtime_release_v2` |
| function | `control.trg_authorization_v5_release_guard` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v5_runtime_functions.sql:3 | `control.authorization_consumer_migration_v2` |
| function | `control.trg_authorization_wave7_immutable_v2` | registered | platform-iam | retain_through_certified_observation | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql:54 | — |
| function | `control.trg_ensure_entity_publish_state` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/05_functions.sql:1386 | `control.entity` |
| function | `control.trg_ev_bump_latest_version_no` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/05_functions.sql:1403 | `control.entity_version` |
| function | `control.trg_field_flag_defaults` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/05_functions.sql:1421 | `control.entity`<br>`control.entity_version` |
| function | `control.trg_fn_flow_field_one_writer` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/01_tables.sql:7280 | `control.entity_flow`<br>`control.entity_flow_step` |
| function | `control.trg_fn_flow_field_one_writer` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06_triggers__flow_hardening.sql:51 | `control.entity_flow`<br>`control.entity_flow_step` |
| function | `control.trg_fn_flow_field_validate_perm` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/01_tables.sql:7257 | `shared.permission` |
| function | `control.trg_fn_flow_field_validate_perm` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_triggers__flow_hardening.sql:20 | `shared.permission` |
| function | `control.trg_fn_flow_section_validate_entity_code` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/06_triggers__flow_hardening.sql:140 | `control.entity` |
| function | `control.trg_fn_validate_contract_projection_scope` | structural_dependency | metadata-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/control/05zz_meta_entity_contract_m1.sql:154 | `control.entity`<br>`control.entity_field`<br>`control.entity_flow`<br>`control.entity_flow_step`<br>`control.entity_lifecycle`<br>`control.entity_surface`<br>`control.entity_version`<br>`control.lifecycle_state` |
| function | `control.trg_fn_validate_entity_binding` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/05_functions.sql:3757 | `control.entity` |
| function | `control.trg_fn_validate_entity_publish_state` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/05zz_meta_entity_contract_m1.sql:67 | `control.entity_version` |
| function | `control.trg_fn_validate_ready_publish_state` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/05zzn_meta_entity_contract_m3.sql:15 | `control.entity_version` |
| function | `control.trg_fn_validate_target_entity` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/05_functions.sql:3788 | `control.entity`<br>`control.entity_relation` |
| function | `control.trg_fn_version_policy_rule` | structural_dependency | metadata-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/control/06_triggers.sql:434 | `control.entity_lifecycle`<br>`control.entity_operation`<br>`control.entity_relation` |
| view | `control.v_entity_field_contract_audit` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/07z_v_entity_field_contract_audit.sql:9 | `control.entity`<br>`control.entity_field`<br>`control.entity_version` |
| view | `control.v_entity_surface_contract_audit` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/control/07z_v_entity_surface_contract_audit.sql:10 | `control.entity`<br>`control.entity_field`<br>`control.entity_surface`<br>`control.entity_version` |
| view | `control.v_meta_entity_contract_audit` | structural_dependency | metadata-platform+workflow-platform | review_with_registered_dependency | server/db/ddl/control/07zz_meta_entity_contract_m7_audit.sql:7 | `control.entity`<br>`control.entity_action_rule`<br>`control.entity_flow`<br>`control.entity_flow_step`<br>`control.entity_lifecycle_state_mask`<br>`control.entity_operation`<br>`control.entity_relation`<br>`control.entity_version` |
| function | `document.trg_je_finance_readiness_gate_fn` | structural_dependency | finance-platform+platform-runtime | review_with_registered_dependency | server/db/ddl/document/05_functions.sql:2910 | `control.feature_flag`<br>`master.company_code` |
| function | `document.trg_je_finance_readiness_gate_fn` | structural_dependency | finance-platform+platform-runtime | review_with_registered_dependency | server/db/ddl/document/07z_finance_certification_rollout.sql:3 | `control.feature_flag`<br>`master.company_code` |
| function | `document.trg_je_lifecycle_log` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/document/05_functions.sql:2076 | `control.lifecycle`<br>`control.lifecycle_state`<br>`control.lifecycle_transition` |
| function | `document.trg_je_sync_base_currency` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/document/05_functions.sql:420 | `master.company_code` |
| function | `document.trg_je_sync_base_currency` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/document/05_functions.sql:1896 | `master.company_code` |
| function | `document.trg_jl_validate_party` | structural_dependency | finance-platform+platform-iam | review_with_registered_dependency | server/db/ddl/document/05_functions.sql:678 | `master.company_code`<br>`master.principal` |
| function | `document.trg_pi_lifecycle_log` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/document/05_functions.sql:2194 | `control.lifecycle`<br>`control.lifecycle_state`<br>`control.lifecycle_transition` |
| function | `document.trg_seed_gift_athq_only` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/document/03_constraints.sql:698 | `master.company_code` |
| function | `document.trg_upupr_before_insert` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/document/05_functions.sql:17 | `master.principal`<br>`master.principal_profile` |
| function | `document.trg_upupr_lifecycle_log` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/document/05_functions.sql:149 | `control.lifecycle` |
| function | `document.trg_upupr_status_change` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/document/05_functions.sql:72 | `master.auth_group`<br>`master.auth_group_member`<br>`master.principal_profile` |
| trigger | `event.authorization_capture_clock.trg_authorization_capture_clock_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/event/06_authorization_change_capture_triggers.sql:33 | `event.authorization_capture_clock` |
| trigger | `event.authorization_change_event.trg_authorization_change_event_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/event/06_authorization_change_capture_triggers.sql:12 | `event.authorization_change_event` |
| trigger | `event.authorization_change_transaction.trg_authorization_change_transaction_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/event/06_authorization_change_capture_triggers.sql:26 | `event.authorization_change_transaction` |
| trigger | `event.authorization_cutover_load_evidence_v2.trg_authorization_cutover_load_evidence_immutable_v2` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_authorization_v7_shadow_cutover_triggers.sql:31 | `event.authorization_cutover_load_evidence_v2` |
| trigger | `event.authorization_invalidation_outbox_v2.trg_authorization_invalidation_immutable_v2` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/event/06_authorization_v2_runtime_triggers.sql:216 | `event.authorization_invalidation_outbox_v2` |
| trigger | `event.authorization_projection_checkpoint.trg_authorization_projection_checkpoint_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/event/06_authorization_change_capture_triggers.sql:40 | `event.authorization_projection_checkpoint` |
| trigger | `event.authorization_shadow_comparison_v2.trg_authorization_shadow_comparison_immutable_v2` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/control/06_authorization_v7_shadow_cutover_triggers.sql:24 | `event.authorization_shadow_comparison_v2` |
| trigger | `event.authorization_snapshot_marker.trg_authorization_snapshot_marker_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/event/06_authorization_change_capture_triggers.sql:19 | `event.authorization_snapshot_marker` |
| trigger | `event.authorization_v2_replay_inbox.trg_authorization_v2_replay_inbox_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/event/06_authorization_v2_runtime_triggers.sql:233 | `event.authorization_v2_replay_inbox` |
| function | `event.fn_authorization_begin_replay_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_replay_functions.sql:481 | `control.authorization_v2_transformer_registry`<br>`event.authorization_projection_checkpoint`<br>`event.authorization_v2_replay_application`<br>`event.authorization_v2_replay_binding`<br>`event.authorization_v2_replay_inbox`<br>`event.authorization_v2_replay_transaction` |
| function | `event.fn_authorization_bind_replay_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_replay_functions.sql:6 | `control.authorization_migration_run`<br>`control.authorization_v2_frozen_legacy_object`<br>`control.authorization_v2_transformer_registry`<br>`event.authorization_capture_clock`<br>`event.authorization_projection_checkpoint`<br>`event.authorization_snapshot_marker`<br>`event.authorization_v2_replay_binding` |
| function | `event.fn_authorization_bump_epoch_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql:134 | `event.authorization_global_epoch_v2`<br>`event.authorization_plane_epoch_v2`<br>`event.authorization_tenant_epoch_v2` |
| function | `event.fn_authorization_capture_primary_key` | registered | platform-iam | retain_with_change_capture | server/db/ddl/event/05_authorization_change_capture_functions.sql:61 | — |
| function | `event.fn_authorization_capture_redact` | registered | platform-iam | retain_with_change_capture | server/db/ddl/event/05_authorization_change_capture_functions.sql:24 | — |
| function | `event.fn_authorization_capture_safe_uuid` | registered | platform-iam | retain_with_change_capture | server/db/ddl/event/05_authorization_change_capture_functions.sql:6 | — |
| function | `event.fn_authorization_capture_sha256` | registered | platform-iam | retain_with_change_capture | server/db/ddl/event/05_authorization_change_capture_functions.sql:88 | — |
| function | `event.fn_authorization_capture_watermark` | registered | platform-iam | retain_until_all_consumers_retired | server/db/ddl/event/05_authorization_change_capture_functions.sql:399 | `event.authorization_capture_clock` |
| function | `event.fn_authorization_claim_invalidations_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql:405 | `event.authorization_invalidation_outbox_v2`<br>`event.fn_authorization_bump_epoch_v2` |
| function | `event.fn_authorization_complete_invalidation_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql:492 | `event.authorization_invalidation_outbox_v2` |
| function | `event.fn_authorization_complete_replay_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_replay_functions.sql:711 | `control.authorization_migration_run`<br>`control.authorization_v2_conservation_ledger`<br>`event.authorization_projection_checkpoint`<br>`event.authorization_v2_replay_application`<br>`event.authorization_v2_replay_binding`<br>`event.authorization_v2_replay_inbox`<br>`event.authorization_v2_replay_transaction` |
| function | `event.fn_authorization_emit_invalidation_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql:254 | `event.authorization_invalidation_outbox_v2`<br>`event.fn_authorization_bump_epoch_v2` |
| function | `event.fn_authorization_fail_invalidation_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql:536 | `event.authorization_invalidation_outbox_v2` |
| function | `event.fn_authorization_set_replay_event_context_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_replay_functions.sql:646 | `event.authorization_v2_replay_application`<br>`event.authorization_v2_replay_inbox`<br>`event.authorization_v2_replay_transaction` |
| function | `event.fn_authorization_stage_replay_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_replay_functions.sql:229 | `control.authorization_v2_transformer_registry`<br>`event.authorization_change_event`<br>`event.authorization_change_transaction`<br>`event.authorization_v2_replay_binding`<br>`event.authorization_v2_replay_inbox`<br>`event.authorization_v2_replay_transaction` |
| function | `event.fn_authorization_supersede_scheduled_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql:375 | `event.authorization_invalidation_outbox_v2` |
| function | `event.fn_authorization_v2_json_uuid_values` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql:48 | `event.fn_authorization_v2_safe_uuid` |
| function | `event.fn_authorization_v2_safe_timestamptz` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql:27 | — |
| function | `event.fn_authorization_v2_safe_uuid` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql:6 | — |
| function | `event.fn_authorization_v2_source_row_key` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql:82 | — |
| function | `event.fn_record_authorization_change` | registered | platform-iam | retain_with_change_capture | server/db/ddl/event/05_authorization_change_capture_functions.sql:104 | `control.authorization_capture_source`<br>`event.authorization_capture_clock`<br>`event.authorization_change_event`<br>`event.authorization_change_transaction`<br>`event.fn_authorization_capture_primary_key`<br>`event.fn_authorization_capture_redact`<br>`event.fn_authorization_capture_safe_uuid`<br>`event.fn_authorization_capture_sha256` |
| function | `event.fn_record_authorization_snapshot_marker` | registered | platform-iam | retain_as_snapshot_and_cutover_evidence | server/db/ddl/event/05_authorization_change_capture_functions.sql:429 | `control.authorization_migration_run`<br>`event.authorization_capture_clock`<br>`event.authorization_snapshot_marker`<br>`event.fn_authorization_capture_primary_key`<br>`event.fn_authorization_capture_redact`<br>`event.fn_authorization_capture_safe_uuid`<br>`event.fn_authorization_capture_sha256`<br>`event.fn_authorization_capture_watermark`<br>`event.fn_record_authorization_change`<br>`event.trg_authorization_change_event_immutable`<br>`event.trg_authorization_change_transaction_guard`<br>`event.trg_capture_authorization_change`<br>`event.trg_capture_authorization_truncate` |
| function | `event.trg_authorization_authority_invalidate_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql:637 | `control.auth_catalog_owner`<br>`control.auth_permission`<br>`control.entity_operation`<br>`event.fn_authorization_bump_epoch_v2`<br>`event.fn_authorization_claim_invalidations_v2`<br>`event.fn_authorization_complete_invalidation_v2`<br>`event.fn_authorization_emit_invalidation_v2`<br>`event.fn_authorization_fail_invalidation_v2`<br>`event.fn_authorization_supersede_scheduled_v2`<br>`event.fn_authorization_v2_json_uuid_values`<br>`event.fn_authorization_v2_safe_timestamptz`<br>`event.fn_authorization_v2_safe_uuid`<br>`event.fn_authorization_v2_source_row_key`<br>`event.trg_authorization_invalidation_immutable_v2` |
| function | `event.trg_authorization_change_event_immutable` | registered | platform-iam | retain_with_change_capture | server/db/ddl/event/05_authorization_change_capture_functions.sql:367 | `event.authorization_change_event` |
| function | `event.trg_authorization_change_transaction_guard` | registered | platform-iam | retain_with_change_capture | server/db/ddl/event/05_authorization_change_capture_functions.sql:381 | — |
| function | `event.trg_authorization_invalidation_immutable_v2` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql:592 | — |
| function | `event.trg_authorization_v2_replay_inbox_immutable` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_replay_functions.sql:873 | — |
| function | `event.trg_authorization_v2_replay_state_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/event/05_authorization_v2_replay_functions.sql:884 | `event.fn_authorization_begin_replay_v2`<br>`event.fn_authorization_bind_replay_v2`<br>`event.fn_authorization_complete_replay_v2`<br>`event.fn_authorization_set_replay_event_context_v2`<br>`event.fn_authorization_stage_replay_v2`<br>`event.trg_authorization_v2_replay_inbox_immutable` |
| function | `event.trg_capture_authorization_change` | registered | platform-iam | remove_after_all_legacy_writers_are_retired | server/db/ddl/event/05_authorization_change_capture_functions.sql:321 | `event.fn_record_authorization_change` |
| function | `event.trg_capture_authorization_truncate` | registered | platform-iam | remove_after_all_legacy_writers_are_retired | server/db/ddl/event/05_authorization_change_capture_functions.sql:351 | `event.fn_record_authorization_change` |
| function | `event.trg_sync_comment_moderation` | structural_dependency | finance-platform+organization-platform+platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:848 | `master.access_grant`<br>`master.auth_group_role`<br>`master.company_code`<br>`master.company_code_access`<br>`master.legal_entity`<br>`master.principal_identity_binding`<br>`master.trg_guard_auth_binding_service_client` |
| function | `governance.invalidate_finance_setup_certification` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/governance/09_finance_setup_certification_invalidation.sql:5 | `master.company_code` |
| function | `governance.trg_certification_snapshot_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/governance/01_tables.sql:820 | `master.principal` |
| function | `governance.trg_invalidate_finance_setup_certification` | structural_dependency | finance-platform+organization-platform | review_with_registered_dependency | server/db/ddl/governance/09_finance_setup_certification_invalidation.sql:32 | `master.company_code`<br>`master.legal_entity` |
| function | `governance.trg_invalidate_finance_setup_certification` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/governance/09z_finance_phase2_domain_invalidation.sql:5 | `master.company_code` |
| trigger | `log.attachment_access_log.trg_aal_access_type_lookup` | structural_dependency | document-platform | review_with_registered_dependency | server/db/ddl/log/06_triggers.sql:38 | `log.attachment_access_log` |
| trigger | `log.auth_decision_evidence_v2.trg_auth_decision_evidence_v2_immutable` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/log/06_authorization_v2_decision_evidence_triggers.sql:14 | `log.auth_decision_evidence_v2` |
| trigger | `log.field_access_log.trg_fal_field_classification_lookup` | structural_dependency | policy-platform | review_with_registered_dependency | server/db/ddl/log/06_triggers.sql:30 | `log.field_access_log` |
| trigger | `log.security_event_log.trg_sel_event_category_lookup` | structural_dependency | security-platform | review_with_registered_dependency | server/db/ddl/log/06_triggers.sql:21 | `log.security_event_log` |
| function | `log.trg_auth_decision_evidence_v2_immutable` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/log/05_authorization_v2_decision_evidence_functions.sql:5 | `log.auth_decision_evidence_v2` |
| trigger | `master.access_grant.trg_access_grant_bump_auth_epoch` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:2182 | `master.access_grant` |
| trigger | `master.access_grant.trg_access_grant_delete_bump_auth_epoch` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:2195 | `master.access_grant` |
| trigger | `master.access_grant.trg_access_grant_iam_outbox` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:423 | `master.access_grant` |
| trigger | `master.access_grant.trg_access_grant_insert_bump_auth_epoch` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:2170 | `master.access_grant` |
| trigger | `master.access_grant.trg_access_grant_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:417 | `master.access_grant` |
| trigger | `master.access_grant.trg_access_grant_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:412 | `master.access_grant` |
| trigger | `master.access_grant.trg_bi_bu_validate_assignment_scope` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:2044 | `master.access_grant` |
| trigger | `master.auth_delegation_permission_scope.trg_auth_delegation_scope_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:218 | `master.auth_delegation_permission_scope` |
| trigger | `master.auth_delegation_permission.trg_auth_delegation_permission_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:211 | `master.auth_delegation_permission` |
| trigger | `master.auth_delegation.trg_auth_delegation_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:204 | `master.auth_delegation` |
| trigger | `master.auth_deny_rule_group.trg_auth_deny_rule_group_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:169 | `master.auth_deny_rule_group` |
| trigger | `master.auth_deny_rule_hard_policy.trg_auth_deny_rule_hard_policy_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:176 | `master.auth_deny_rule_hard_policy` |
| trigger | `master.auth_deny_rule_principal.trg_auth_deny_rule_principal_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:162 | `master.auth_deny_rule_principal` |
| trigger | `master.auth_deny_rule.trg_auth_deny_rule_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:155 | `master.auth_deny_rule` |
| trigger | `master.auth_group_member_v2.trg_auth_group_member_v2_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:141 | `master.auth_group_member_v2` |
| trigger | `master.auth_group_member.trg_agm_iam_outbox` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:372 | `master.auth_group_member` |
| trigger | `master.auth_group_role_v2.trg_auth_group_role_v2_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:148 | `master.auth_group_role_v2` |
| trigger | `master.auth_group_role.trg_auth_group_role_iam_outbox` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:378 | `master.auth_group_role` |
| trigger | `master.auth_group_role.trg_auth_group_role_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:355 | `master.auth_group_role` |
| trigger | `master.auth_group_role.trg_bi_bu_validate_assignment_scope` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:2036 | `master.auth_group_role` |
| trigger | `master.auth_group_v2.trg_auth_group_v2_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:134 | `master.auth_group_v2` |
| trigger | `master.auth_group.trg_auth_group_iam_outbox_insert` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:401 | `master.auth_group` |
| trigger | `master.auth_group.trg_auth_group_iam_outbox_update` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:406 | `master.auth_group` |
| trigger | `master.auth_group.trg_auth_group_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:351 | `master.auth_group` |
| trigger | `master.auth_group.trg_auth_group_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:348 | `master.auth_group` |
| trigger | `master.auth_override.trg_auth_override_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:183 | `master.auth_override` |
| trigger | `master.auth_permission_set_rule.trg_auth_permission_set_rule_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:99 | `master.auth_permission_set_rule` |
| trigger | `master.auth_permission_set.trg_auth_permission_set_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:92 | `master.auth_permission_set` |
| trigger | `master.auth_plane_membership.trg_auth_plane_membership_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:49 | `master.auth_plane_membership` |
| trigger | `master.auth_record_acl_permission.trg_auth_record_acl_permission_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:197 | `master.auth_record_acl_permission` |
| trigger | `master.auth_record_acl.trg_auth_record_acl_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:190 | `master.auth_record_acl` |
| trigger | `master.auth_role_compilation.trg_auth_role_compilation_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:113 | `master.auth_role_compilation` |
| trigger | `master.auth_role_permission_set.trg_auth_role_permission_set_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:120 | `master.auth_role_permission_set` |
| trigger | `master.auth_role_permission.trg_auth_role_permission_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:127 | `master.auth_role_permission` |
| trigger | `master.auth_role.trg_auth_role_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:106 | `master.auth_role` |
| trigger | `master.auth_scope_company.trg_auth_scope_company_child_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:70 | `master.auth_scope_company` |
| trigger | `master.auth_scope_legal_entity.trg_auth_scope_legal_entity_child_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:77 | `master.auth_scope_legal_entity` |
| trigger | `master.auth_scope_operating_organization.trg_auth_scope_operating_org_child_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:84 | `master.auth_scope_operating_organization` |
| trigger | `master.auth_scope_target.trg_auth_scope_target_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:56 | `master.auth_scope_target` |
| trigger | `master.auth_scope_tenant.trg_auth_scope_tenant_child_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:63 | `master.auth_scope_tenant` |
| function | `master.auth_v2_entity_is_eligible` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:121 | `control.entity` |
| function | `master.auth_v2_permission_is_effective` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:41 | `control.auth_permission`<br>`control.auth_permission_plane` |
| function | `master.auth_v2_permission_is_eligible` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:77 | `control.auth_catalog_owner`<br>`control.auth_permission`<br>`control.auth_permission_plane` |
| function | `master.auth_v2_principal_has_plane` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:139 | `master.auth_plane_membership`<br>`master.principal` |
| function | `master.backfill_people_from_employee` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/master/05_people_functions.sql:6 | `master.company_code` |
| trigger | `master.business_network_membership_role.trg_bnmrole_status_changed` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3085 | `master.business_network_membership_role` |
| trigger | `master.business_network_membership_role.trg_bnmrole_updated_at` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3081 | `master.business_network_membership_role` |
| trigger | `master.business_network_membership.trg_bnm_status_changed` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3070 | `master.business_network_membership` |
| trigger | `master.business_network_membership.trg_bnm_updated_at` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3066 | `master.business_network_membership` |
| trigger | `master.business_network_membership.trg_bnm_validate` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3074 | `master.business_network_membership` |
| trigger | `master.business_network.trg_bn_status_changed` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3061 | `master.business_network` |
| trigger | `master.business_network.trg_bn_updated_at` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3057 | `master.business_network` |
| function | `master.check_permission` | registered | platform-iam | remove_after_shadow | server/db/ddl/master/05_functions.sql:2341 | `master.access_grant`<br>`master.auth_group_member`<br>`master.auth_group_role`<br>`master.principal_persona`<br>`master.tenant`<br>`master.tenant_permission_override`<br>`shared.permission`<br>`shared.persona_permission`<br>`shared.plan_permission_access`<br>`shared.role`<br>`shared.subscription_plan`<br>`shared.subscription_plan_version` |
| trigger | `master.company_code_access.trg_cca_entity_type_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:2052 | `master.company_code_access` |
| trigger | `master.company_code.trg_company_code_framework_lookup` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:1011 | `master.company_code` |
| trigger | `master.company_code.trg_company_code_fy_variant_lookup` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:1006 | `master.company_code` |
| trigger | `master.company_code.trg_company_code_status_changed` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:1002 | `master.company_code` |
| trigger | `master.company_code.trg_company_code_updated_at` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:998 | `master.company_code` |
| trigger | `master.company_code.trg_fin_ready_company` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/governance/09_finance_setup_certification_invalidation.sql:108 | `master.company_code` |
| function | `master.current_auth_plane_code` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:20 | — |
| function | `master.current_auth_plane_code_soft` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:6 | — |
| trigger | `master.delegation_grant.trg_delegation_grant_bump_auth_epoch` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:2208 | `master.delegation_grant` |
| trigger | `master.delegation_grant.trg_dg_mutation_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:583 | `master.delegation_grant` |
| trigger | `master.delegation_grant.trg_dg_permissions_validate` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:539 | `master.delegation_grant` |
| trigger | `master.delegation_grant.trg_dg_scope_type_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:498 | `master.delegation_grant` |
| trigger | `master.delegation_grant.trg_dg_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:488 | `master.delegation_grant` |
| function | `master.derive_effective_roles` | registered | platform-iam | remove_after_shadow | server/db/ddl/master/05_functions.sql:2302 | `master.auth_group_member`<br>`master.auth_group_role` |
| function | `master.fn_bump_auth_epoch` | registered | platform-iam | replace_with_durable_change_watermark | server/db/ddl/master/06_triggers.sql:2081 | `master.access_grant`<br>`master.delegation_grant`<br>`master.principal` |
| function | `master.fn_check_tenant_code_available` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:53 | `master.tenant` |
| function | `master.fn_guard_mesh_network_provider` | structural_dependency | finance-platform+mesh-platform | review_with_registered_dependency | server/db/ddl/master/01m_bp_core_hardening.sql:201 | `master.business_network`<br>`master.business_network_membership`<br>`master.business_network_membership_role`<br>`master.company_code` |
| function | `master.fn_le_hierarchy_sync` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/01m_bp_core_hardening.sql:1114 | `master.legal_entity` |
| function | `master.fn_lookup_tenant_for_auth` | registered | platform-iam | keep_until_session_context_replacement | server/db/ddl/master/05_functions.sql:34 | `master.tenant` |
| function | `master.fn_migrate_principal_identity_bindings` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:4958 | `master.principal_identity_binding`<br>`master.principal_profile`<br>`master.tenant` |
| function | `master.fn_network_connect_validation` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/01m_bp_core_hardening.sql:1304 | `master.legal_entity` |
| function | `master.fn_refresh_mv_cpa` | structural_dependency | finance-platform+platform-iam | review_with_registered_dependency | server/db/ddl/master/07_views.sql:513 | `master.company_code`<br>`master.principal`<br>`master.principal_profile` |
| function | `master.fn_register_tenant` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:74 | `master.principal`<br>`master.principal_profile`<br>`master.tenant` |
| function | `master.fn_resolve_le_subtree_companies` | structural_dependency | finance-platform+organization-platform | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:5525 | `master.company_code`<br>`master.legal_entity` |
| function | `master.fn_resolve_principal_ui` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:5062 | `master.principal`<br>`master.principal_profile` |
| function | `master.fn_resolve_scope_companies` | structural_dependency | finance-platform+organization-platform | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:5447 | `master.company_code`<br>`master.legal_entity` |
| function | `master.fn_self_bp_registration_guard` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/01m_bp_core_hardening.sql:1252 | `master.legal_entity` |
| function | `master.fn_sync_principal_login_email` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:235 | `master.principal` |
| function | `master.fn_update_tenant_profile` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:2242 | `master.derive_effective_roles`<br>`master.tenant` |
| function | `master.get_effective_visibility_scope` | registered | platform-iam | remove_after_shadow | server/db/ddl/master/05_functions.sql:2756 | `master.access_grant`<br>`master.auth_group_member`<br>`master.auth_group_role`<br>`master.principal_persona`<br>`shared.persona_permission`<br>`shared.role` |
| trigger | `master.group_feature_grant.trg_gfg_iam_outbox` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:429 | `master.group_feature_grant` |
| function | `master.guard_organization_tax_registration_scope` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/master/05_functions_finance_tax_setup.sql:1 | `master.company_code` |
| trigger | `master.legal_entity_identity_binding.trg_leib_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3090 | `master.legal_entity_identity_binding` |
| trigger | `master.legal_entity.trg_fin_ready_legal_entity` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/governance/09_finance_setup_certification_invalidation.sql:116 | `master.legal_entity` |
| trigger | `master.legal_entity.trg_le_hierarchy_sync` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/01m_bp_core_hardening.sql:1154 | `master.legal_entity` |
| trigger | `master.legal_entity.trg_legal_entity_consolidation_lookup` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:985 | `master.legal_entity` |
| trigger | `master.legal_entity.trg_legal_entity_framework_lookup` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:991 | `master.legal_entity` |
| trigger | `master.legal_entity.trg_legal_entity_status_changed` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:974 | `master.legal_entity` |
| trigger | `master.legal_entity.trg_legal_entity_type_lookup` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:979 | `master.legal_entity` |
| trigger | `master.legal_entity.trg_legal_entity_updated_at` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:970 | `master.legal_entity` |
| view | `master.mv_company_postable_account` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/seed/tenants/neon/010_demo/100_org_structure/199_gl_preseed.sql:26 | `master.company_code` |
| trigger | `master.operating_organization_company.trg_ooc_bump_scope` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3620 | `master.operating_organization_company` |
| trigger | `master.operating_organization_company.trg_ooc_status_changed` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3610 | `master.operating_organization_company` |
| trigger | `master.operating_organization_company.trg_ooc_updated_at` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3606 | `master.operating_organization_company` |
| trigger | `master.operating_organization_company.trg_ooc_validate` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3614 | `master.operating_organization_company` |
| trigger | `master.operating_organization.trg_oo_domain_immutable` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3595 | `master.operating_organization` |
| trigger | `master.operating_organization.trg_oo_hierarchy` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3589 | `master.operating_organization` |
| trigger | `master.operating_organization.trg_oo_scope_version` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3600 | `master.operating_organization` |
| trigger | `master.operating_organization.trg_oo_status_changed` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3585 | `master.operating_organization` |
| trigger | `master.operating_organization.trg_oo_updated_at` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3581 | `master.operating_organization` |
| trigger | `master.principal_feature_grant.trg_pfg_iam_outbox` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:434 | `master.principal_feature_grant` |
| trigger | `master.principal_identity_binding.trg_pib_service_client` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:2025 | `master.principal_identity_binding` |
| trigger | `master.principal_identity_binding.trg_pib_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:2019 | `master.principal_identity_binding` |
| trigger | `master.principal_persona.trg_principal_persona_iam_outbox` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:384 | `master.principal_persona` |
| trigger | `master.principal_profile.trg_freeze_keycloak_profile_columns` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3024 | `master.principal_profile` |
| trigger | `master.principal_profile.trg_principal_profile_ou_iam_outbox` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:390 | `master.principal_profile` |
| trigger | `master.principal_profile.trg_principal_profile_service_client` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:40 | `master.principal_profile` |
| trigger | `master.principal_profile.trg_principal_profile_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:36 | `master.principal_profile` |
| trigger | `master.principal_relationship.trg_principal_relationship_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:57 | `master.principal_relationship` |
| trigger | `master.principal_relationship.trg_principal_relationship_type_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:201 | `master.principal_relationship` |
| trigger | `master.principal_relationship.trg_principal_relationship_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:54 | `master.principal_relationship` |
| trigger | `master.principal_relationship.trg_principal_relationship_verification_status_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:206 | `master.principal_relationship` |
| trigger | `master.principal_relationship.trg_principal_relationship_verified_method_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:211 | `master.principal_relationship` |
| trigger | `master.principal.trg_principal_bump_auth_epoch` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:2157 | `master.principal` |
| trigger | `master.principal.trg_principal_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:32 | `master.principal` |
| trigger | `master.principal.trg_principal_type_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:179 | `master.principal` |
| trigger | `master.principal.trg_principal_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:29 | `master.principal` |
| function | `master.publish_auth_role_compilation` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:641 | `master.auth_permission_set`<br>`master.auth_permission_set_rule`<br>`master.auth_role`<br>`master.auth_role_compilation`<br>`master.auth_role_permission`<br>`master.auth_role_permission_set`<br>`master.auth_v2_permission_is_eligible`<br>`master.auth_v2_principal_has_plane` |
| function | `master.resolve_allowed_companies` | registered | platform-iam | remove_after_shadow | server/db/ddl/master/05_functions.sql:2493 | `master.access_grant`<br>`master.auth_group_member`<br>`master.auth_group_role`<br>`master.company_code`<br>`master.principal_persona`<br>`shared.persona_permission`<br>`shared.role` |
| function | `master.resolve_allowed_companies` | registered | platform-iam | remove_after_shadow | server/db/ddl/master/05_zz_authorization_scope.sql:78 | `master.access_grant`<br>`master.auth_group_member`<br>`master.auth_group_role`<br>`master.company_code`<br>`master.operating_organization`<br>`shared.permission_scope_policy`<br>`shared.persona_permission`<br>`shared.role` |
| function | `master.resolve_effective_authorization_scope` | registered | platform-iam | replace_with_scope_repository | server/db/ddl/master/05_zz_authorization_scope.sql:261 | `master.access_grant`<br>`master.auth_group_member`<br>`master.auth_group_role`<br>`master.get_effective_visibility_scope`<br>`master.operating_organization`<br>`master.resolve_allowed_companies`<br>`shared.permission_scope_policy`<br>`shared.persona_permission`<br>`shared.role` |
| function | `master.resolve_neon_permission_entitlement` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05zzd_authorization_v4_entitlement_functions.sql:1 | `control.auth_entitlement_target_policy`<br>`control.auth_permission`<br>`control.auth_permission_plane`<br>`master.tenant`<br>`master.tenant_entitlement_override`<br>`master.tenant_feature_entitlement`<br>`master.tenant_module_subscription`<br>`shared.plan_feature_access`<br>`shared.plan_module_access`<br>`shared.subscription_plan`<br>`shared.subscription_plan_version` |
| function | `master.resolve_operating_organization_companies` | structural_dependency | finance-platform+organization-platform | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:5818 | `master.company_code`<br>`master.operating_organization`<br>`master.operating_organization_company` |
| trigger | `master.team.trg_team_status_changed` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:362 | `master.team` |
| trigger | `master.team.trg_team_updated_at` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:359 | `master.team` |
| trigger | `master.tenant_admin_grant.trg_tenant_admin_grant_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:25 | `master.tenant_admin_grant` |
| trigger | `master.tenant_admin_grant.trg_tenant_admin_grant_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:22 | `master.tenant_admin_grant` |
| trigger | `master.tenant_entitlement_override.trg_tenant_entitlement_override_guard` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_authorization_v2_integrity_triggers.sql:226 | `master.tenant_entitlement_override` |
| trigger | `master.tenant_module_subscription.trg_tms_updated_at` | structural_dependency | commercial-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:332 | `master.tenant_module_subscription` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_direction_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:190 | `master.tenant_relationship` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:50 | `master.tenant_relationship` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_status_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:195 | `master.tenant_relationship` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_type_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:185 | `master.tenant_relationship` |
| trigger | `master.tenant_relationship.trg_tenant_relationship_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:47 | `master.tenant_relationship` |
| trigger | `master.tenant.trg_tenant_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:14 | `master.tenant` |
| trigger | `master.tenant.trg_tenant_status_transition` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:18 | `master.tenant` |
| trigger | `master.tenant.trg_tenant_subscription_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:167 | `master.tenant` |
| trigger | `master.tenant.trg_tenant_type_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:173 | `master.tenant` |
| trigger | `master.tenant.trg_tenant_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:10 | `master.tenant` |
| function | `master.trg_access_grant_status_changed` | registered | platform-iam | remove_with_legacy_access_grant | server/db/ddl/master/05_functions.sql:3477 | — |
| function | `master.trg_auth_compilation_child_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:588 | `master.auth_role_compilation`<br>`master.auth_v2_permission_is_eligible` |
| function | `master.trg_auth_delegation_child_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:1479 | `master.auth_delegation`<br>`master.auth_v2_permission_is_eligible` |
| function | `master.trg_auth_delegation_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:1396 | `master.auth_delegation_permission`<br>`master.auth_delegation_permission_scope`<br>`master.auth_scope_target`<br>`master.auth_v2_permission_is_eligible`<br>`master.auth_v2_principal_has_plane` |
| function | `master.trg_auth_deny_binding_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:1183 | `master.auth_deny_rule` |
| function | `master.trg_auth_deny_rule_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:1060 | `master.auth_deny_rule_group`<br>`master.auth_deny_rule_hard_policy`<br>`master.auth_deny_rule_principal`<br>`master.auth_group_v2`<br>`master.auth_scope_target`<br>`master.auth_v2_permission_is_eligible`<br>`master.auth_v2_principal_has_plane` |
| function | `master.trg_auth_group_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:890 | `master.auth_group_v2`<br>`master.auth_v2_principal_has_plane` |
| function | `master.trg_auth_group_member_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:936 | `master.auth_group_v2`<br>`master.auth_v2_principal_has_plane` |
| function | `master.trg_auth_group_role_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:992 | `master.auth_group_v2`<br>`master.auth_role`<br>`master.auth_scope_target`<br>`master.auth_v2_principal_has_plane` |
| function | `master.trg_auth_override_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:1208 | `master.auth_scope_target`<br>`master.auth_v2_permission_is_eligible`<br>`master.auth_v2_principal_has_plane` |
| function | `master.trg_auth_permission_set_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:376 | `master.auth_permission_set_rule`<br>`master.auth_v2_permission_is_eligible` |
| function | `master.trg_auth_permission_set_rule_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:441 | `master.auth_permission_set`<br>`master.auth_v2_permission_is_eligible` |
| function | `master.trg_auth_plane_membership_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:171 | `master.auth_v2_principal_has_plane`<br>`master.principal` |
| function | `master.trg_auth_record_acl_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:1264 | `control.auth_permission`<br>`master.auth_group_v2`<br>`master.auth_record_acl_permission`<br>`master.auth_v2_entity_is_eligible`<br>`master.auth_v2_permission_is_eligible`<br>`master.auth_v2_principal_has_plane` |
| function | `master.trg_auth_record_acl_permission_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:1355 | `master.auth_record_acl`<br>`master.auth_v2_permission_is_eligible` |
| function | `master.trg_auth_role_compilation_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:541 | — |
| function | `master.trg_auth_role_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:482 | `master.auth_role_compilation`<br>`master.auth_v2_principal_has_plane` |
| function | `master.trg_auth_scope_child_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:347 | `master.auth_scope_target` |
| function | `master.trg_auth_scope_target_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:283 | `master.auth_scope_company`<br>`master.auth_scope_legal_entity`<br>`master.auth_scope_operating_organization`<br>`master.auth_scope_tenant` |
| function | `master.trg_auth_v2_retention_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:228 | — |
| function | `master.trg_bump_operating_organization_membership_scope` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:5996 | `master.operating_organization` |
| function | `master.trg_fn_freeze_keycloak_profile_columns` | structural_dependency | mesh-platform+platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:2984 | `master.business_network`<br>`master.business_network_membership`<br>`master.business_network_membership_role`<br>`master.legal_entity_identity_binding`<br>`master.principal_identity_binding`<br>`master.principal_profile` |
| function | `master.trg_guard_auth_binding_service_client` | registered | platform-iam | keep_invariant | server/db/ddl/master/05_functions.sql:4923 | `master.principal` |
| function | `master.trg_guard_delegation_grant_mutation` | registered | platform-iam | remove_with_legacy_delegation | server/db/ddl/master/06_triggers.sql:552 | `master.delegation_grant` |
| function | `master.trg_guard_service_client` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:608 | `master.principal` |
| function | `master.trg_ictp_ic_enabled_guard_fn` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3147 | `master.company_code` |
| function | `master.trg_prd_child_consistency_fn` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:3508 | `master.operating_organization`<br>`master.operating_organization_company` |
| function | `master.trg_tenant_entitlement_override_guard` | registered | platform-iam | promote_after_certified_cutover | server/db/ddl/master/05_authorization_v2_functions.sql:1522 | `master.auth_v2_entity_is_eligible`<br>`master.auth_v2_permission_is_effective`<br>`master.auth_v2_permission_is_eligible`<br>`master.auth_v2_principal_has_plane`<br>`master.current_auth_plane_code`<br>`master.current_auth_plane_code_soft`<br>`master.publish_auth_role_compilation`<br>`master.trg_auth_compilation_child_guard`<br>`master.trg_auth_delegation_child_guard`<br>`master.trg_auth_delegation_guard`<br>`master.trg_auth_deny_binding_guard`<br>`master.trg_auth_deny_rule_guard`<br>`master.trg_auth_group_guard`<br>`master.trg_auth_group_member_guard`<br>`master.trg_auth_group_role_guard`<br>`master.trg_auth_override_guard`<br>`master.trg_auth_permission_set_guard`<br>`master.trg_auth_permission_set_rule_guard`<br>`master.trg_auth_plane_membership_guard`<br>`master.trg_auth_record_acl_guard`<br>`master.trg_auth_record_acl_permission_guard`<br>`master.trg_auth_role_compilation_guard`<br>`master.trg_auth_role_guard`<br>`master.trg_auth_scope_child_guard`<br>`master.trg_auth_scope_target_guard`<br>`master.trg_auth_v2_retention_guard`<br>`shared.enterprise_feature`<br>`shared.module` |
| function | `master.trg_validate_assignment_scope` | structural_dependency | finance-platform+mesh-platform+organization-platform | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:2846 | `master.business_network`<br>`master.business_network_membership`<br>`master.company_code`<br>`master.legal_entity`<br>`master.operating_organization` |
| function | `master.trg_validate_business_network_membership` | structural_dependency | mesh-platform+platform-iam | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:2932 | `master.business_network`<br>`master.tenant_relationship` |
| function | `master.trg_validate_delegation_permissions` | registered | platform-iam | remove_with_legacy_delegation | server/db/ddl/master/06_triggers.sql:510 | `master.delegation_grant`<br>`shared.permission` |
| function | `master.trg_validate_operating_organization_company` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:5900 | `master.operating_organization` |
| function | `master.trg_validate_operating_organization_hierarchy` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:5858 | `master.operating_organization` |
| function | `master.trg_validate_operating_organization_profile` | structural_dependency | organization-platform | review_with_registered_dependency | server/db/ddl/master/05_functions.sql:5939 | `master.operating_organization` |
| view | `master.v_business_partner_bank_account` | structural_dependency | finance-platform | review_with_registered_dependency | server/db/ddl/master/01c_tables_extended.sql:1669 | `master.company_code` |
| view | `master.v_effective_principal_ui` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/07_views.sql:1227 | `master.principal`<br>`master.principal_profile` |
| trigger | `mesh_control.auth_permission_plane.trg_mesh_auth_permission_plane_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v2_catalog_triggers.sql:32 | `mesh_control.auth_permission_plane` |
| trigger | `mesh_control.auth_permission_scope_policy.trg_mesh_auth_scope_policy_publish_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v2_catalog_triggers.sql:40 | `mesh_control.auth_permission_scope_policy` |
| trigger | `mesh_control.auth_permission.trg_mesh_auth_permission_publish_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v2_catalog_triggers.sql:24 | `mesh_control.auth_permission` |
| trigger | `mesh_control.authorization_consumer_migration_v2.trg_mesh_authorization_v5_consumer_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v5_runtime_triggers.sql:11 | `mesh_control.authorization_consumer_migration_v2` |
| trigger | `mesh_control.authorization_cutover_cohort_v2.trg_authorization_cohort_guard_v2` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v7_shadow_cutover_triggers.sql:10 | `mesh_control.authorization_cutover_cohort_v2` |
| trigger | `mesh_control.authorization_cutover_plane_v2.trg_authorization_cutover_state_guard_v2` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v7_shadow_cutover_triggers.sql:3 | `mesh_control.authorization_cutover_plane_v2` |
| trigger | `mesh_control.authorization_runtime_release_v2.trg_mesh_authorization_v5_release_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v5_runtime_triggers.sql:3 | `mesh_control.authorization_runtime_release_v2` |
| function | `mesh_control.authorization_v2_is_effective` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_control/05_authorization_v2_catalog_functions.sql:7 | — |
| function | `mesh_control.authorization_v2_owner_aligned` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_control/05_authorization_v2_catalog_functions.sql:45 | `mesh_control.auth_catalog_owner` |
| function | `mesh_control.authorization_v2_window_contains` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_control/05_authorization_v2_catalog_functions.sql:22 | — |
| trigger | `mesh_control.authorization_v3_scope_mapping.trg_authorization_v3_scope_mapping_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06zu_authorization_v3_mapping_triggers.sql:11 | `mesh_control.authorization_v3_scope_mapping` |
| trigger | `mesh_control.authorization_v3_subject_mapping.trg_authorization_v3_subject_mapping_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06zu_authorization_v3_mapping_triggers.sql:3 | `mesh_control.authorization_v3_subject_mapping` |
| trigger | `mesh_control.authorization_writer_switch_receipt_v2.trg_authorization_writer_switch_receipt_immutable_v2` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v7_shadow_cutover_triggers.sql:18 | `mesh_control.authorization_writer_switch_receipt_v2` |
| trigger | `mesh_control.entity_operation_plane.trg_mesh_auth_operation_plane_publish_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v2_catalog_triggers.sql:56 | `mesh_control.entity_operation_plane` |
| trigger | `mesh_control.entity_operation.trg_mesh_auth_operation_publish_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v2_catalog_triggers.sql:48 | `mesh_control.entity_operation` |
| trigger | `mesh_control.entity_scope_binding.trg_mesh_auth_scope_binding_publish_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v2_catalog_triggers.sql:64 | `mesh_control.entity_scope_binding` |
| trigger | `mesh_control.entity_version.trg_mesh_auth_entity_version_publish_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v2_catalog_triggers.sql:16 | `mesh_control.entity_version` |
| trigger | `mesh_control.entity.trg_mesh_auth_entity_publish_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v2_catalog_triggers.sql:8 | `mesh_control.entity` |
| trigger | `mesh_control.feature_flag.trg_feature_flag_updated_at` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_triggers.sql:7 | `mesh_control.feature_flag` |
| function | `mesh_control.fn_authorization_freeze_legacy_writes_v2` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql:233 | `mesh_control.authorization_cutover_plane_v2`<br>`mesh_log.v_authorization_wave7_readiness_v2` |
| function | `mesh_control.fn_authorization_install_legacy_freeze_guards_v2` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql:423 | `mesh_control.authorization_capture_source`<br>`mesh_control.trg_authorization_legacy_write_freeze_v2` |
| function | `mesh_control.fn_authorization_install_target_guard_v2` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql:532 | `mesh_control.authorization_target_guard_installation_v2`<br>`mesh_control.trg_authorization_target_writer_v2` |
| function | `mesh_control.fn_authorization_set_cohort_state_v2` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql:156 | `mesh_control.authorization_cutover_cohort_v2`<br>`mesh_control.authorization_cutover_plane_v2`<br>`mesh_log.v_authorization_wave7_readiness_v2` |
| function | `mesh_control.fn_authorization_set_resolver_state_v2` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql:61 | `mesh_control.authorization_cutover_cohort_v2`<br>`mesh_control.authorization_cutover_plane_v2`<br>`mesh_log.v_authorization_wave7_readiness_v2` |
| function | `mesh_control.fn_authorization_switch_writer_v2` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql:275 | `mesh_control.authorization_cutover_plane_v2`<br>`mesh_control.authorization_target_guard_installation_v2`<br>`mesh_control.authorization_writer_registry`<br>`mesh_control.authorization_writer_switch_receipt_v2`<br>`mesh_log.v_authorization_wave7_readiness_v2` |
| function | `mesh_control.fn_authorization_validate_target_guard_v2` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql:607 | `mesh_control.authorization_target_guard_installation_v2`<br>`mesh_control.fn_authorization_freeze_legacy_writes_v2`<br>`mesh_control.fn_authorization_install_legacy_freeze_guards_v2`<br>`mesh_control.fn_authorization_install_target_guard_v2`<br>`mesh_control.fn_authorization_set_cohort_state_v2`<br>`mesh_control.fn_authorization_set_resolver_state_v2`<br>`mesh_control.fn_authorization_switch_writer_v2` |
| function | `mesh_control.trg_authorization_cohort_guard_v2` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql:22 | — |
| function | `mesh_control.trg_authorization_cutover_state_guard_v2` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql:1 | — |
| function | `mesh_control.trg_authorization_legacy_write_freeze_v2` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql:393 | `mesh_control.authorization_cutover_plane_v2` |
| function | `mesh_control.trg_authorization_target_writer_v2` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql:481 | `mesh_control.authorization_cutover_plane_v2`<br>`mesh_control.authorization_writer_registry` |
| function | `mesh_control.trg_authorization_v2_guard_entity` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_control/05_authorization_v2_catalog_functions.sql:66 | `mesh_control.auth_catalog_owner`<br>`mesh_control.authorization_v2_owner_aligned` |
| function | `mesh_control.trg_authorization_v2_guard_entity_version` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_control/05_authorization_v2_catalog_functions.sql:104 | `mesh_control.auth_catalog_owner`<br>`mesh_control.authorization_v2_is_effective`<br>`mesh_control.authorization_v2_owner_aligned`<br>`mesh_control.authorization_v2_window_contains`<br>`mesh_control.entity` |
| function | `mesh_control.trg_authorization_v2_guard_operation` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_control/05_authorization_v2_catalog_functions.sql:390 | `mesh_control.auth_catalog_owner`<br>`mesh_control.auth_permission`<br>`mesh_control.authorization_v2_is_effective`<br>`mesh_control.authorization_v2_owner_aligned`<br>`mesh_control.authorization_v2_window_contains`<br>`mesh_control.entity`<br>`mesh_control.entity_version` |
| function | `mesh_control.trg_authorization_v2_guard_operation_plane` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_control/05_authorization_v2_catalog_functions.sql:543 | `mesh_control.auth_catalog_owner`<br>`mesh_control.auth_permission`<br>`mesh_control.auth_permission_plane`<br>`mesh_control.auth_plane`<br>`mesh_control.authorization_v2_is_effective`<br>`mesh_control.authorization_v2_window_contains`<br>`mesh_control.entity_operation` |
| function | `mesh_control.trg_authorization_v2_guard_permission` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_control/05_authorization_v2_catalog_functions.sql:174 | `mesh_control.auth_catalog_owner`<br>`mesh_control.auth_permission_category`<br>`mesh_control.authorization_v2_is_effective`<br>`mesh_control.authorization_v2_owner_aligned`<br>`mesh_control.entity` |
| function | `mesh_control.trg_authorization_v2_guard_permission_plane` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_control/05_authorization_v2_catalog_functions.sql:248 | `mesh_control.auth_catalog_owner`<br>`mesh_control.auth_permission`<br>`mesh_control.auth_plane`<br>`mesh_control.authorization_v2_is_effective`<br>`mesh_control.authorization_v2_window_contains` |
| function | `mesh_control.trg_authorization_v2_guard_scope_binding` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_control/05_authorization_v2_catalog_functions.sql:649 | `mesh_control.auth_catalog_owner`<br>`mesh_control.auth_permission`<br>`mesh_control.auth_permission_plane`<br>`mesh_control.auth_permission_scope_policy`<br>`mesh_control.auth_plane`<br>`mesh_control.authorization_v2_is_effective`<br>`mesh_control.authorization_v2_owner_aligned`<br>`mesh_control.authorization_v2_window_contains`<br>`mesh_control.entity_operation`<br>`mesh_control.entity_operation_plane` |
| function | `mesh_control.trg_authorization_v2_guard_scope_policy` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_control/05_authorization_v2_catalog_functions.sql:310 | `mesh_control.auth_catalog_owner`<br>`mesh_control.auth_permission`<br>`mesh_control.auth_permission_plane`<br>`mesh_control.auth_plane`<br>`mesh_control.authorization_v2_is_effective`<br>`mesh_control.authorization_v2_window_contains` |
| function | `mesh_control.trg_authorization_v3_scope_mapping_guard` | registered | mesh-platform | retain_until_migration_evidence_is_sealed | server/db/ddl/mesh_control/05zu_authorization_v3_mapping_functions.sql:70 | `mesh_control.trg_authorization_v3_subject_mapping_guard`<br>`mesh.auth_group_role_v2`<br>`mesh.auth_override`<br>`mesh.auth_scope_target` |
| function | `mesh_control.trg_authorization_v3_subject_mapping_guard` | registered | mesh-platform | retain_until_migration_evidence_is_sealed | server/db/ddl/mesh_control/05zu_authorization_v3_mapping_functions.sql:1 | `mesh.auth_current_group_role_v`<br>`mesh.auth_group_member_v2`<br>`mesh.auth_group_v2`<br>`mesh.auth_plane_membership` |
| function | `mesh_control.trg_authorization_v5_consumer_guard` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v5_runtime_functions.sql:48 | `mesh_control.authorization_runtime_release_v2` |
| function | `mesh_control.trg_authorization_v5_release_guard` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v5_runtime_functions.sql:3 | `mesh_control.authorization_consumer_migration_v2` |
| function | `mesh_control.trg_authorization_wave7_immutable_v2` | registered | mesh-platform | retain_through_certified_observation | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql:51 | — |
| trigger | `mesh_log.access_decision_log.trg_access_decision_log_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06_triggers.sql:17 | `mesh_log.access_decision_log` |
| trigger | `mesh_log.attachment_access_log.trg_attachment_access_log_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06_triggers.sql:22 | `mesh_log.attachment_access_log` |
| trigger | `mesh_log.auth_decision_evidence_v2_default.trg_auth_decision_evidence_v2_default_truncate_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06_authorization_v2_runtime_triggers.sql:474 | `mesh_log.auth_decision_evidence_v2_default` |
| trigger | `mesh_log.auth_decision_evidence_v2.trg_auth_decision_evidence_v2_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06_authorization_v2_runtime_triggers.sql:449 | `mesh_log.auth_decision_evidence_v2` |
| trigger | `mesh_log.auth_decision_evidence_v2.trg_auth_decision_evidence_v2_prepare` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06_authorization_v2_runtime_triggers.sql:438 | `mesh_log.auth_decision_evidence_v2` |
| trigger | `mesh_log.auth_decision_evidence_v2.trg_auth_decision_evidence_v2_truncate_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06_authorization_v2_runtime_triggers.sql:461 | `mesh_log.auth_decision_evidence_v2` |
| trigger | `mesh_log.authorization_capture_clock.trg_mesh_authorization_capture_clock_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06z_authorization_change_capture_triggers.sql:30 | `mesh_log.authorization_capture_clock` |
| trigger | `mesh_log.authorization_change_event.trg_mesh_authorization_change_event_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06z_authorization_change_capture_triggers.sql:9 | `mesh_log.authorization_change_event` |
| trigger | `mesh_log.authorization_change_transaction.trg_mesh_authorization_change_transaction_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06z_authorization_change_capture_triggers.sql:23 | `mesh_log.authorization_change_transaction` |
| trigger | `mesh_log.authorization_cutover_load_evidence_v2.trg_authorization_cutover_load_evidence_immutable_v2` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v7_shadow_cutover_triggers.sql:33 | `mesh_log.authorization_cutover_load_evidence_v2` |
| trigger | `mesh_log.authorization_invalidation_outbox_v2.trg_authorization_invalidation_immutable_v2` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06_authorization_v2_runtime_triggers.sql:342 | `mesh_log.authorization_invalidation_outbox_v2` |
| trigger | `mesh_log.authorization_invalidation_outbox_v2.trg_authorization_invalidation_truncate_guard_v2` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06_authorization_v2_runtime_triggers.sql:353 | `mesh_log.authorization_invalidation_outbox_v2` |
| trigger | `mesh_log.authorization_projection_checkpoint.trg_mesh_authorization_projection_checkpoint_updated_at` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06z_authorization_change_capture_triggers.sql:37 | `mesh_log.authorization_projection_checkpoint` |
| trigger | `mesh_log.authorization_shadow_comparison_v2.trg_authorization_shadow_comparison_immutable_v2` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_control/06_authorization_v7_shadow_cutover_triggers.sql:26 | `mesh_log.authorization_shadow_comparison_v2` |
| trigger | `mesh_log.authorization_snapshot_marker.trg_mesh_authorization_snapshot_marker_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06z_authorization_change_capture_triggers.sql:16 | `mesh_log.authorization_snapshot_marker` |
| trigger | `mesh_log.authorization_v2_replay_inbox.trg_authorization_v2_replay_inbox_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06_authorization_v2_runtime_triggers.sql:365 | `mesh_log.authorization_v2_replay_inbox` |
| trigger | `mesh_log.authorization_v2_replay_inbox.trg_authorization_v2_replay_inbox_truncate_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06_authorization_v2_runtime_triggers.sql:378 | `mesh_log.authorization_v2_replay_inbox` |
| function | `mesh_log.fn_auth_decision_evidence_sha256_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_evidence_functions.sql:6 | — |
| function | `mesh_log.fn_authorization_begin_replay_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql:545 | `mesh_control.authorization_v2_transformer_registry`<br>`mesh_log.authorization_projection_checkpoint`<br>`mesh_log.authorization_v2_replay_application`<br>`mesh_log.authorization_v2_replay_binding`<br>`mesh_log.authorization_v2_replay_inbox`<br>`mesh_log.authorization_v2_replay_transaction` |
| function | `mesh_log.fn_authorization_bind_replay_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql:6 | `mesh_control.authorization_migration_run`<br>`mesh_control.authorization_v2_frozen_legacy_object`<br>`mesh_control.authorization_v2_transformer_registry`<br>`mesh_log.authorization_capture_clock`<br>`mesh_log.authorization_projection_checkpoint`<br>`mesh_log.authorization_snapshot_marker`<br>`mesh_log.authorization_v2_replay_binding` |
| function | `mesh_log.fn_authorization_bump_epoch_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:157 | `mesh_log.authorization_account_epoch_v2`<br>`mesh_log.authorization_global_epoch_v2`<br>`mesh_log.authorization_plane_epoch_v2` |
| function | `mesh_log.fn_authorization_capture_primary_key` | registered | mesh-platform | retain_with_mesh_capture | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql:61 | — |
| function | `mesh_log.fn_authorization_capture_redact` | registered | mesh-platform | retain_with_mesh_capture | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql:24 | — |
| function | `mesh_log.fn_authorization_capture_safe_uuid` | registered | mesh-platform | retain_with_mesh_capture | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql:6 | — |
| function | `mesh_log.fn_authorization_capture_scope_value` | registered | mesh-platform | retain_with_mesh_capture | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql:92 | — |
| function | `mesh_log.fn_authorization_capture_sha256` | registered | mesh-platform | retain_with_mesh_capture | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql:127 | — |
| function | `mesh_log.fn_authorization_capture_watermark` | registered | mesh-platform | retain_with_mesh_capture | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql:447 | `mesh_log.authorization_capture_clock` |
| function | `mesh_log.fn_authorization_claim_invalidations_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:452 | `mesh_log.authorization_invalidation_outbox_v2`<br>`mesh_log.fn_authorization_bump_epoch_v2` |
| function | `mesh_log.fn_authorization_complete_invalidation_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:552 | `mesh_log.authorization_invalidation_outbox_v2` |
| function | `mesh_log.fn_authorization_complete_replay_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql:778 | `mesh_control.authorization_migration_run`<br>`mesh_control.authorization_v2_conservation_ledger`<br>`mesh_log.authorization_invalidation_outbox_v2`<br>`mesh_log.authorization_projection_checkpoint`<br>`mesh_log.authorization_v2_replay_application`<br>`mesh_log.authorization_v2_replay_binding`<br>`mesh_log.authorization_v2_replay_inbox`<br>`mesh_log.authorization_v2_replay_transaction` |
| function | `mesh_log.fn_authorization_emit_invalidation_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:286 | `mesh_log.authorization_invalidation_outbox_v2`<br>`mesh_log.fn_authorization_bump_epoch_v2` |
| function | `mesh_log.fn_authorization_fail_invalidation_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:599 | `mesh_log.authorization_invalidation_outbox_v2` |
| function | `mesh_log.fn_authorization_set_replay_event_context_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql:712 | `mesh_log.authorization_v2_replay_application`<br>`mesh_log.authorization_v2_replay_inbox`<br>`mesh_log.authorization_v2_replay_transaction` |
| function | `mesh_log.fn_authorization_stage_replay_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql:249 | `mesh_control.authorization_v2_transformer_registry`<br>`mesh_log.authorization_change_event`<br>`mesh_log.authorization_change_transaction`<br>`mesh_log.authorization_v2_replay_binding`<br>`mesh_log.authorization_v2_replay_inbox`<br>`mesh_log.authorization_v2_replay_transaction`<br>`mesh_log.fn_authorization_v2_safe_uuid`<br>`mesh.network_account` |
| function | `mesh_log.fn_authorization_supersede_scheduled_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:422 | `mesh_log.authorization_invalidation_outbox_v2` |
| function | `mesh_log.fn_authorization_v2_json_uuid_values` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:69 | `mesh_log.fn_authorization_v2_safe_uuid` |
| function | `mesh_log.fn_authorization_v2_safe_bigint` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:27 | — |
| function | `mesh_log.fn_authorization_v2_safe_timestamptz` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:48 | — |
| function | `mesh_log.fn_authorization_v2_safe_uuid` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:6 | — |
| function | `mesh_log.fn_authorization_v2_source_row_key` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:103 | — |
| function | `mesh_log.fn_record_authorization_change` | registered | mesh-platform | retain_with_mesh_capture | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql:143 | `mesh_control.authorization_capture_source`<br>`mesh_log.authorization_capture_clock`<br>`mesh_log.authorization_change_event`<br>`mesh_log.authorization_change_transaction`<br>`mesh_log.fn_authorization_capture_primary_key`<br>`mesh_log.fn_authorization_capture_redact`<br>`mesh_log.fn_authorization_capture_safe_uuid`<br>`mesh_log.fn_authorization_capture_scope_value`<br>`mesh_log.fn_authorization_capture_sha256` |
| function | `mesh_log.fn_record_authorization_snapshot_marker` | registered | mesh-platform | retain_with_mesh_capture | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql:477 | `mesh_control.authorization_migration_run`<br>`mesh_log.authorization_capture_clock`<br>`mesh_log.authorization_snapshot_marker`<br>`mesh_log.fn_authorization_capture_primary_key`<br>`mesh_log.fn_authorization_capture_redact`<br>`mesh_log.fn_authorization_capture_safe_uuid`<br>`mesh_log.fn_authorization_capture_scope_value`<br>`mesh_log.fn_authorization_capture_sha256`<br>`mesh_log.fn_authorization_capture_watermark`<br>`mesh_log.fn_record_authorization_change`<br>`mesh_log.trg_authorization_evidence_immutable`<br>`mesh_log.trg_authorization_internal_guard`<br>`mesh_log.trg_capture_authorization_change`<br>`mesh_log.trg_capture_authorization_truncate` |
| trigger | `mesh_log.security_event_log.trg_security_event_log_immutable` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh_log/06_triggers.sql:12 | `mesh_log.security_event_log` |
| function | `mesh_log.trg_auth_decision_evidence_v2_immutable` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_evidence_functions.sql:44 | `mesh_log.fn_auth_decision_evidence_sha256_v2`<br>`mesh_log.trg_auth_decision_evidence_v2_prepare` |
| function | `mesh_log.trg_auth_decision_evidence_v2_prepare` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_evidence_functions.sql:26 | `mesh_log.fn_auth_decision_evidence_sha256_v2` |
| function | `mesh_log.trg_authorization_authority_invalidate_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:710 | `mesh_control.auth_catalog_owner`<br>`mesh_control.auth_permission`<br>`mesh_control.entity`<br>`mesh_control.entity_operation`<br>`mesh_log.fn_authorization_bump_epoch_v2`<br>`mesh_log.fn_authorization_claim_invalidations_v2`<br>`mesh_log.fn_authorization_complete_invalidation_v2`<br>`mesh_log.fn_authorization_emit_invalidation_v2`<br>`mesh_log.fn_authorization_fail_invalidation_v2`<br>`mesh_log.fn_authorization_supersede_scheduled_v2`<br>`mesh_log.fn_authorization_v2_json_uuid_values`<br>`mesh_log.fn_authorization_v2_safe_bigint`<br>`mesh_log.fn_authorization_v2_safe_timestamptz`<br>`mesh_log.fn_authorization_v2_safe_uuid`<br>`mesh_log.fn_authorization_v2_source_row_key`<br>`mesh_log.trg_authorization_invalidation_immutable_v2` |
| function | `mesh_log.trg_authorization_evidence_immutable` | registered | mesh-platform | retain_with_mesh_capture | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql:415 | — |
| function | `mesh_log.trg_authorization_internal_guard` | registered | mesh-platform | retain_with_mesh_capture | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql:429 | — |
| function | `mesh_log.trg_authorization_invalidation_immutable_v2` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql:656 | — |
| function | `mesh_log.trg_authorization_v2_replay_inbox_immutable` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql:977 | — |
| function | `mesh_log.trg_authorization_v2_replay_state_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql:989 | `mesh_log.fn_authorization_begin_replay_v2`<br>`mesh_log.fn_authorization_bind_replay_v2`<br>`mesh_log.fn_authorization_complete_replay_v2`<br>`mesh_log.fn_authorization_set_replay_event_context_v2`<br>`mesh_log.fn_authorization_stage_replay_v2`<br>`mesh_log.trg_authorization_v2_replay_inbox_immutable` |
| function | `mesh_log.trg_capture_authorization_change` | registered | mesh-platform | retain_with_mesh_capture | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql:369 | `mesh_log.fn_record_authorization_change` |
| function | `mesh_log.trg_capture_authorization_truncate` | registered | mesh-platform | retain_with_mesh_capture | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql:399 | `mesh_log.fn_record_authorization_change` |
| trigger | `mesh.account_entitlement_override.mesh_account_entitlement_override_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:224 | `mesh.account_entitlement_override` |
| trigger | `mesh.account_grant.trg_account_grant_updated_at` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_triggers.sql:172 | `mesh.account_grant` |
| trigger | `mesh.account_grant.trg_mag_fingerprint` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/01z_account_grant_fingerprint.sql:53 | `mesh.account_grant` |
| trigger | `mesh.account_grant.trg_mag_revoke` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/01z_account_grant_fingerprint.sql:123 | `mesh.account_grant` |
| trigger | `mesh.auth_delegation.mesh_auth_delegation_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:189 | `mesh.auth_delegation` |
| trigger | `mesh.auth_deny_rule.mesh_auth_deny_rule_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:132 | `mesh.auth_deny_rule` |
| trigger | `mesh.auth_group_member_v2.mesh_auth_group_member_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:117 | `mesh.auth_group_member_v2` |
| trigger | `mesh.auth_group_role_v2.mesh_auth_group_role_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:125 | `mesh.auth_group_role_v2` |
| trigger | `mesh.auth_group_v2.mesh_auth_group_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:109 | `mesh.auth_group_v2` |
| trigger | `mesh.auth_override.mesh_auth_override_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:167 | `mesh.auth_override` |
| trigger | `mesh.auth_permission_set_rule.mesh_auth_permission_set_rule_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:61 | `mesh.auth_permission_set_rule` |
| trigger | `mesh.auth_permission_set.mesh_auth_permission_set_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:53 | `mesh.auth_permission_set` |
| trigger | `mesh.auth_plane_membership.mesh_auth_plane_membership_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:9 | `mesh.auth_plane_membership` |
| trigger | `mesh.auth_record_acl_permission.mesh_auth_record_acl_permission_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:182 | `mesh.auth_record_acl_permission` |
| trigger | `mesh.auth_record_acl.mesh_auth_record_acl_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:174 | `mesh.auth_record_acl` |
| trigger | `mesh.auth_role_compilation.mesh_auth_role_compilation_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:75 | `mesh.auth_role_compilation` |
| trigger | `mesh.auth_role.mesh_auth_role_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:68 | `mesh.auth_role` |
| trigger | `mesh.auth_scope_target.mesh_auth_scope_target_guard` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_authorization_v2_authority_triggers.sql:17 | `mesh.auth_scope_target` |
| function | `mesh.auth_v2_entity_is_eligible` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:61 | `mesh_control.entity` |
| function | `mesh.auth_v2_permission_is_effective` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:33 | `mesh_control.auth_permission`<br>`mesh_control.auth_permission_plane` |
| function | `mesh.auth_v2_principal_has_plane` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:6 | `mesh.auth_plane_membership`<br>`mesh.network_account`<br>`mesh.principal` |
| function | `mesh.auth_v2_scope_is_active` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:82 | `mesh.auth_scope_target` |
| trigger | `mesh.conversation_participant.trg_conversation_participant_updated_at` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_triggers.sql:125 | `mesh.conversation_participant` |
| function | `mesh.fn_account_grant_fingerprint` | registered | mesh-platform | replace_with_authorization_fingerprint | server/db/ddl/mesh/01z_account_grant_fingerprint.sql:32 | `mesh.account_grant` |
| function | `mesh.fn_account_grant_revoke_hook` | registered | mesh-platform | replace_with_mesh_local_change_capture | server/db/ddl/mesh/01z_account_grant_fingerprint.sql:76 | `mesh.account_grant`<br>`mesh.network_account` |
| trigger | `mesh.network_account.trg_network_account_updated_at` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_triggers.sql:17 | `mesh.network_account` |
| trigger | `mesh.network_relationship.trg_network_relationship_updated_at` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_triggers.sql:190 | `mesh.network_relationship` |
| trigger | `mesh.network_relationship.trg_network_relationship_updated_at` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/09_streamline.sql:501 | `mesh.network_relationship` |
| trigger | `mesh.principal_identity_binding.trg_principal_identity_binding_updated_at` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_triggers.sql:167 | `mesh.principal_identity_binding` |
| trigger | `mesh.principal.trg_principal_updated_at` | structural_dependency | mesh-platform | review_with_registered_dependency | server/db/ddl/mesh/06_triggers.sql:162 | `mesh.principal` |
| function | `mesh.publish_auth_permission_set` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:353 | `mesh.auth_permission_set`<br>`mesh.auth_permission_set_rule`<br>`mesh.auth_v2_permission_is_effective`<br>`mesh.auth_v2_principal_has_plane` |
| function | `mesh.publish_auth_role_compilation` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:542 | `mesh.auth_role`<br>`mesh.auth_role_compilation`<br>`mesh.auth_role_permission`<br>`mesh.auth_v2_permission_is_effective`<br>`mesh.auth_v2_principal_has_plane` |
| function | `mesh.resolve_account_permission_entitlement` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05za_authorization_v4_entitlement_functions.sql:1 | `mesh_control.auth_entitlement_policy`<br>`mesh_control.auth_permission`<br>`mesh_control.auth_permission_plane`<br>`mesh.account_entitlement`<br>`mesh.account_entitlement_override`<br>`mesh.network_account` |
| function | `mesh.trg_account_entitlement_override_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:1012 | `mesh_control.auth_permission`<br>`mesh_control.auth_permission_plane`<br>`mesh.auth_v2_entity_is_eligible`<br>`mesh.auth_v2_permission_is_effective`<br>`mesh.auth_v2_principal_has_plane`<br>`mesh.auth_v2_scope_is_active`<br>`mesh.publish_auth_permission_set`<br>`mesh.publish_auth_role_compilation`<br>`mesh.trg_auth_compilation_child_guard`<br>`mesh.trg_auth_delegation_child_guard`<br>`mesh.trg_auth_delegation_guard`<br>`mesh.trg_auth_deny_binding_guard`<br>`mesh.trg_auth_deny_rule_guard`<br>`mesh.trg_auth_group_guard`<br>`mesh.trg_auth_group_member_guard`<br>`mesh.trg_auth_group_role_guard`<br>`mesh.trg_auth_override_guard`<br>`mesh.trg_auth_permission_set_guard`<br>`mesh.trg_auth_permission_set_rule_guard`<br>`mesh.trg_auth_plane_membership_guard`<br>`mesh.trg_auth_record_acl_guard`<br>`mesh.trg_auth_record_acl_permission_guard`<br>`mesh.trg_auth_role_compilation_guard`<br>`mesh.trg_auth_role_guard`<br>`mesh.trg_auth_scope_child_guard`<br>`mesh.trg_auth_scope_target_guard`<br>`mesh.trg_auth_v2_lifecycle_guard`<br>`mesh.trg_auth_v2_retention_guard` |
| function | `mesh.trg_auth_compilation_child_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:487 | `mesh.auth_permission_set`<br>`mesh.auth_role_compilation`<br>`mesh.auth_v2_permission_is_effective` |
| function | `mesh.trg_auth_delegation_child_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:962 | `mesh.auth_delegation`<br>`mesh.auth_v2_permission_is_effective`<br>`mesh.auth_v2_scope_is_active` |
| function | `mesh.trg_auth_delegation_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:916 | `mesh.auth_delegation_permission`<br>`mesh.auth_delegation_permission_scope`<br>`mesh.auth_v2_principal_has_plane` |
| function | `mesh.trg_auth_deny_binding_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:772 | `mesh.auth_deny_rule` |
| function | `mesh.trg_auth_deny_rule_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:730 | `mesh.auth_deny_rule_group`<br>`mesh.auth_deny_rule_hard_policy`<br>`mesh.auth_deny_rule_principal`<br>`mesh.auth_v2_permission_is_effective`<br>`mesh.auth_v2_scope_is_active` |
| function | `mesh.trg_auth_group_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:631 | `mesh.auth_group_v2`<br>`mesh.auth_v2_principal_has_plane` |
| function | `mesh.trg_auth_group_member_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:676 | `mesh.auth_group_v2`<br>`mesh.auth_v2_principal_has_plane` |
| function | `mesh.trg_auth_group_role_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:702 | `mesh.auth_group_v2`<br>`mesh.auth_role`<br>`mesh.auth_v2_scope_is_active` |
| function | `mesh.trg_auth_override_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:801 | `mesh.auth_v2_permission_is_effective`<br>`mesh.auth_v2_principal_has_plane`<br>`mesh.auth_v2_scope_is_active` |
| function | `mesh.trg_auth_permission_set_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:283 | `mesh.auth_v2_principal_has_plane` |
| function | `mesh.trg_auth_permission_set_rule_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:314 | `mesh.auth_permission_set`<br>`mesh.auth_v2_permission_is_effective` |
| function | `mesh.trg_auth_plane_membership_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:102 | `mesh.network_account`<br>`mesh.principal` |
| function | `mesh.trg_auth_record_acl_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:834 | `mesh_control.entity`<br>`mesh.auth_group_v2`<br>`mesh.auth_record_acl_permission`<br>`mesh.auth_v2_entity_is_eligible`<br>`mesh.auth_v2_principal_has_plane` |
| function | `mesh.trg_auth_record_acl_permission_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:882 | `mesh.auth_record_acl`<br>`mesh.auth_v2_permission_is_effective` |
| function | `mesh.trg_auth_role_compilation_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:462 | `mesh.auth_v2_principal_has_plane` |
| function | `mesh.trg_auth_role_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:426 | `mesh.auth_v2_principal_has_plane` |
| function | `mesh.trg_auth_scope_child_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:225 | `mesh_control.entity`<br>`mesh.auth_scope_target`<br>`mesh.network_account`<br>`mesh.network_relationship` |
| function | `mesh.trg_auth_scope_target_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:187 | `mesh.auth_scope_account`<br>`mesh.auth_scope_network_relationship`<br>`mesh.auth_scope_resource` |
| function | `mesh.trg_auth_v2_lifecycle_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:135 | — |
| function | `mesh.trg_auth_v2_retention_guard` | registered | mesh-platform | promote_after_certified_cutover | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql:166 | — |
| trigger | `public.authorization_contraction_receipt_v2.trg_authorization_contraction_receipt_v2_immutable` | structural_dependency | platform-iam+mesh-platform | review_with_registered_dependency | server/db/migrations/contraction/mesh/001_authorization_v2_wave9_tombstone.sql:47 | `public.authorization_contraction_receipt_v2` |
| trigger | `public.authorization_contraction_receipt_v2.trg_authorization_contraction_receipt_v2_immutable` | structural_dependency | platform-iam+mesh-platform | review_with_registered_dependency | server/db/migrations/contraction/neon/001_authorization_v2_wave9_tombstone.sql:47 | `public.authorization_contraction_receipt_v2` |
| function | `public.trg_authorization_contraction_receipt_v2_immutable` | registered | platform-iam+mesh-platform | retain_with_contraction_receipt | server/db/migrations/contraction/mesh/001_authorization_v2_wave9_tombstone.sql:36 | `mesh_control.auth_permission_alias_v2`<br>`mesh.account_grant`<br>`mesh.attachment_acl`<br>`mesh.content_item_access_grant`<br>`mesh.fn_account_grant_fingerprint`<br>`mesh.fn_account_grant_revoke_hook`<br>`public.authorization_contraction_receipt_v2`<br>`shared.enterprise_feature`<br>`shared.permission`<br>`shared.permission_category`<br>`shared.permission_scope_policy`<br>`shared.persona`<br>`shared.persona_permission`<br>`shared.plan_feature_access`<br>`shared.plan_module_access`<br>`shared.plan_permission_access`<br>`shared.role`<br>`shared.trg_protect_system_persona` |
| function | `public.trg_authorization_contraction_receipt_v2_immutable` | registered | platform-iam+mesh-platform | retain_with_contraction_receipt | server/db/migrations/contraction/neon/001_authorization_v2_wave9_tombstone.sql:36 | `control.auth_permission_alias_v2`<br>`control.permission_alias`<br>`master.access_grant`<br>`master.attachment_acl`<br>`master.auth_group`<br>`master.auth_group_member`<br>`master.auth_group_role`<br>`master.business_network`<br>`master.business_network_membership`<br>`master.business_network_membership_role`<br>`master.check_permission`<br>`master.company_code_access`<br>`master.content_item_access_grant`<br>`master.delegation_grant`<br>`master.derive_effective_roles`<br>`master.fn_bump_auth_epoch`<br>`master.get_effective_visibility_scope`<br>`master.group_feature_grant`<br>`master.principal_feature_grant`<br>`master.principal_persona`<br>`master.resolve_allowed_companies`<br>`master.resolve_effective_authorization_scope`<br>`master.tenant_admin_grant`<br>`master.tenant_feature_entitlement`<br>`master.tenant_module_subscription`<br>`master.tenant_permission_override`<br>`master.trg_access_grant_status_changed`<br>`master.trg_guard_delegation_grant_mutation`<br>`master.trg_validate_delegation_permissions`<br>`public.authorization_contraction_receipt_v2`<br>`shared.enterprise_feature`<br>`shared.permission`<br>`shared.permission_category`<br>`shared.permission_scope_policy`<br>`shared.persona`<br>`shared.persona_permission`<br>`shared.plan_feature_access`<br>`shared.plan_module_access`<br>`shared.plan_permission_access`<br>`shared.role`<br>`shared.trg_protect_system_persona` |
| function | `shared.fn_close_prior_plan_version` | structural_dependency | commercial-platform | review_with_registered_dependency | server/db/ddl/mesh/_shared/06_triggers.sql:155 | `shared.subscription_plan_version` |
| function | `shared.fn_close_prior_plan_version` | structural_dependency | commercial-platform | review_with_registered_dependency | server/db/ddl/shared/06_triggers.sql:173 | `shared.subscription_plan_version` |
| trigger | `shared.module.trg_module_status_changed` | structural_dependency | platform-catalog | review_with_registered_dependency | server/db/ddl/mesh/_shared/06_triggers.sql:82 | `shared.module` |
| trigger | `shared.module.trg_module_status_changed` | structural_dependency | platform-catalog | review_with_registered_dependency | server/db/ddl/shared/06_triggers.sql:79 | `shared.module` |
| trigger | `shared.module.trg_module_updated_at` | structural_dependency | platform-catalog | review_with_registered_dependency | server/db/ddl/mesh/_shared/06_triggers.sql:42 | `shared.module` |
| trigger | `shared.module.trg_module_updated_at` | structural_dependency | platform-catalog | review_with_registered_dependency | server/db/ddl/shared/06_triggers.sql:41 | `shared.module` |
| trigger | `shared.persona.trg_persona_protect_system` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/mesh/_shared/06_triggers.sql:152 | `shared.persona` |
| trigger | `shared.persona.trg_persona_protect_system` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/shared/06_triggers.sql:153 | `shared.persona` |
| trigger | `shared.persona.trg_persona_scope_mode_lookup` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/shared/06_triggers.sql:166 | `shared.persona` |
| trigger | `shared.persona.trg_persona_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/mesh/_shared/06_triggers.sql:85 | `shared.persona` |
| trigger | `shared.persona.trg_persona_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/shared/06_triggers.sql:82 | `shared.persona` |
| trigger | `shared.persona.trg_persona_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/mesh/_shared/06_triggers.sql:45 | `shared.persona` |
| trigger | `shared.persona.trg_persona_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/shared/06_triggers.sql:44 | `shared.persona` |
| trigger | `shared.role.trg_role_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:344 | `shared.role` |
| trigger | `shared.role.trg_role_status_changed` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/mesh/_shared/06_triggers.sql:88 | `shared.role` |
| trigger | `shared.role.trg_role_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/master/06_triggers.sql:341 | `shared.role` |
| trigger | `shared.role.trg_role_updated_at` | structural_dependency | platform-iam | review_with_registered_dependency | server/db/ddl/mesh/_shared/06_triggers.sql:48 | `shared.role` |
| trigger | `shared.subscription_plan_version.trg_subscription_plan_version_gate` | structural_dependency | commercial-platform | review_with_registered_dependency | server/db/ddl/mesh/_shared/06_triggers.sql:169 | `shared.subscription_plan_version` |
| trigger | `shared.subscription_plan_version.trg_subscription_plan_version_gate` | structural_dependency | commercial-platform | review_with_registered_dependency | server/db/ddl/shared/06_triggers.sql:187 | `shared.subscription_plan_version` |
| function | `shared.trg_protect_system_persona` | registered | platform-iam | remove_with_persona | server/db/ddl/shared/05_functions.sql:368 | — |
| trigger | `shared.workspace.trg_workspace_status_changed` | structural_dependency | platform-catalog | review_with_registered_dependency | server/db/ddl/mesh/_shared/06_triggers.sql:79 | `shared.workspace` |
| trigger | `shared.workspace.trg_workspace_status_changed` | structural_dependency | platform-catalog | review_with_registered_dependency | server/db/ddl/shared/06_triggers.sql:76 | `shared.workspace` |
| trigger | `shared.workspace.trg_workspace_updated_at` | structural_dependency | platform-catalog | review_with_registered_dependency | server/db/ddl/mesh/_shared/06_triggers.sql:39 | `shared.workspace` |
| trigger | `shared.workspace.trg_workspace_updated_at` | structural_dependency | platform-catalog | review_with_registered_dependency | server/db/ddl/shared/06_triggers.sql:38 | `shared.workspace` |
| function | `snapshot.compile_lifecycle` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/control/05_functions.sql:225 | `control.lifecycle`<br>`control.lifecycle_state`<br>`control.lifecycle_transition`<br>`control.lifecycle_transition_gate` |
| function | `snapshot.compile_lifecycle_route` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/control/05_functions.sql:370 | `control.lifecycle`<br>`control.lifecycle_state`<br>`control.lifecycle_transition` |
| function | `snapshot.compile_status_route` | structural_dependency | workflow-platform | review_with_registered_dependency | server/db/ddl/control/05_functions.sql:473 | `control.lifecycle_state`<br>`control.lifecycle_transition` |
| trigger | `snapshot.entity_compiled.trg_ec_immutable` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/snapshot/06_triggers.sql:11 | `snapshot.entity_compiled` |
| function | `snapshot.trg_compiled_immutable` | structural_dependency | metadata-platform | review_with_registered_dependency | server/db/ddl/snapshot/05_functions.sql:9 | `snapshot.entity_compiled` |

## Runtime authorization reader and evaluator symbols

| Symbol | Classification | Artifact class | Path | Lines |
|---|---|---|---|---|
| `authorizeAttachmentAccess` | reviewed | runtime | server/packages/services/documents/index.ts | 11 |
| `authorizeAttachmentAccess` | reviewed | test | server/packages/services/documents/routes/__tests__/attachments.route.test.ts | 32 |
| `authorizeAttachmentAccess` | reviewed | route | server/packages/services/documents/routes/attachments.route.ts | 37, 303 |
| `authorizeAttachmentAccess` | reviewed | test | server/packages/services/documents/services/__tests__/attachment-authorization.service.test.ts | 6, 22, 30, 65, 84, 103, 124 |
| `authorizeAttachmentAccess` | reviewed | runtime | server/packages/services/documents/services/attachment-authorization.service.ts | 39 |
| `authorizeCompanyCodeRead` | reviewed | runtime | server/src/atlas-record-data-gateway.ts | 32, 47 |
| `authorizeEntityMutation` | reviewed | test | server/packages/services/records/__tests__/classic-patch-safety.test.ts | 36 |
| `authorizeEntityMutation` | reviewed | test | server/packages/services/records/__tests__/phase0-mutation-characterization.test.ts | 182 |
| `authorizeEntityMutation` | reviewed | route | server/packages/services/records/routes/entity-mutation-guard.ts | 256 |
| `authorizeEntityMutation` | reviewed | route | server/packages/services/records/routes/records.route.ts | 82, 4212, 4855, 6414, 6691, 9294, 9580 |
| `authorizeLineMutation` | reviewed | test | server/packages/services/records/__tests__/document-edit-session-retirement.test.ts | 36, 37 |
| `authorizeLineMutation` | reviewed | route | server/packages/services/records/routes/records.route.ts | 5442, 5469, 5473, 5477 |
| `authorizeMutation` | reviewed | route | server/packages/services/master/routes/addresses.route.ts | 33, 118, 332, 378 |
| `authorizeMutation` | reviewed | runtime | server/src/runtimes/api.ts | 1197 |
| `authorizeRuntimeOperation` | reviewed | test | apps/neon/app/api/runtime/v1/entities/[entity]/[id]/__tests__/route.test.ts | 27, 43, 280, 292, 298 |
| `authorizeRuntimeOperation` | reviewed | route | apps/neon/app/api/runtime/v1/entities/[entity]/[id]/route.ts | 13, 308 |
| `authorizeRuntimeOperation` | reviewed | runtime | apps/neon/lib/server/meta-entity-write-validation.ts | 56, 265 |
| `authorizeSalesContext` | reviewed | runtime | server/packages/services/business/sales/sales-authorization.service.ts | 56, 72, 83 |
| `authorizeSalesOperation` | reviewed | runtime | server/packages/services/business/sales/sales-authorization.service.ts | 59 |
| `authorizeSalesOperation` | reviewed | runtime | server/packages/services/business/sales/sales-document.service.ts | 4, 78, 105 |
| `authorizeSalesOpportunityCreation` | reviewed | runtime | server/packages/services/business/sales/sales-authorization.service.ts | 30 |
| `authorizeSalesOpportunityCreation` | reviewed | runtime | server/packages/services/business/sales/sales-document.service.ts | 3, 34 |
| `authorizeSalesQuotationCreation` | reviewed | runtime | server/packages/services/business/sales/sales-authorization.service.ts | 45 |
| `authorizeSalesQuotationCreation` | reviewed | runtime | server/packages/services/business/sales/sales-document.service.ts | 5, 56 |
| `authorizeSourcingEventCreation` | reviewed | runtime | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | 49 |
| `authorizeSourcingEventCreation` | reviewed | runtime | server/packages/services/business/procurement/sourcing/sourcing-document.service.ts | 3, 58 |
| `authorizeSourcingOperation` | reviewed | runtime | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | 85 |
| `authorizeSourcingOperation` | reviewed | runtime | server/packages/services/business/procurement/sourcing/sourcing-document.service.ts | 4, 91, 115, 145 |
| `authorizeWorkItemAction` | reviewed | runtime | server/packages/services/workflow/engine.ts | 470, 639 |
| `checkAnyPermission` | reviewed | contract | packages/shared/data-integration/session-plane/src/index.ts | 193 |
| `checkAnyPermission` | reviewed | contract | packages/shared/platform-auth/session-plane/src/index.ts | 211 |
| `checkAnyPermission` | reviewed | contract | packages/shared/runtime-domain/session-plane/src/index.ts | 193 |
| `checkAnyPermission` | reviewed | tool | scripts/policy/authorization-inventory.ts | 911 |
| `checkDelegationPermission` | reviewed | contract | packages/shared/data-integration/session-plane/src/index.ts | 210 |
| `checkDelegationPermission` | reviewed | contract | packages/shared/platform-auth/session-plane/src/index.ts | 228 |
| `checkDelegationPermission` | reviewed | contract | packages/shared/runtime-domain/session-plane/src/index.ts | 210 |
| `checkEntityMutationAuthorization` | reviewed | test | server/packages/services/records/__tests__/classic-patch-safety.test.ts | 37 |
| `checkEntityMutationAuthorization` | reviewed | route | server/packages/services/records/routes/entity-mutation-guard.ts | 131, 154, 260 |
| `checkEntityMutationAuthorization` | reviewed | route | server/packages/services/records/routes/records.route.ts | 83, 5394, 5446, 10088, 10104 |
| `checkPermission` | reviewed | runtime | apps/neon/lib/server/meta-entity-write-validation.ts | 32, 251, 272 |
| `checkPermission` | reviewed | contract | packages/shared/data-integration/session-plane/src/index.ts | 179, 190, 197, 206 |
| `checkPermission` | reviewed | contract | packages/shared/platform-auth/session-plane/src/index.ts | 197, 208, 215, 224 |
| `checkPermission` | reviewed | contract | packages/shared/runtime-domain/session-plane/src/index.ts | 179, 190, 197, 206 |
| `checkPermission` | reviewed | tool | scripts/policy/authorization-inventory.ts | 894, 911 |
| `checkPermission` | reviewed | test | server/packages/services/ai/routes/__tests__/ai-feedback.route.test.ts | 6, 15, 169, 182, 212, 225, 335 |
| `checkPermission` | reviewed | route | server/packages/services/ai/routes/ai.route.ts | 22, 66, 101, 181, 331 |
| `checkPermission` | reviewed | test | server/packages/services/business/__tests__/phase6-7-document.integration.test.ts | 174, 175, 188, 215, 231, 248 |
| `checkPermission` | reviewed | runtime | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | 30, 54, 67, 113, 132, 147 |
| `checkPermission` | reviewed | runtime | server/packages/services/business/procurement/sourcing/sourcing-document.service.ts | 14, 44, 60 |
| `checkPermission` | reviewed | runtime | server/packages/services/business/sales/sales-authorization.service.ts | 34, 40, 49, 56, 65, 72, 74, 90, 96 |
| `checkPermission` | reviewed | runtime | server/packages/services/business/sales/sales-document.service.ts | 15, 34, 56, 78, 105 |
| `checkPermission` | reviewed | test | server/packages/services/documents/services/__tests__/attachment-authorization.service.test.ts | 3, 4, 24, 25, 45, 53, 79, 96, 115, 116, 120 |
| `checkPermission` | reviewed | runtime | server/packages/services/documents/services/attachment-authorization.service.ts | 2, 81 |
| `checkPermission` | reviewed | test | server/packages/services/finance/__tests__/finance-fx-slice2.contract.test.ts | 58 |
| `checkPermission` | reviewed | route | server/packages/services/finance/routes/ap.route.ts | 35, 3260 |
| `checkPermission` | reviewed | route | server/packages/services/finance/routes/finance-fx-setup.route.ts | 4, 75, 138 |
| `checkPermission` | reviewed | route | server/packages/services/finance/routes/finance-setup.route.ts | 25, 965 |
| `checkPermission` | reviewed | runtime | server/packages/services/iam/index.ts | 41 |
| `checkPermission` | reviewed | runtime | server/packages/services/iam/permission/permission.service.ts | 64 |
| `checkPermission` | reviewed | route | server/packages/services/iam/routes/company-code-access.routes.ts | 39, 244, 323 |
| `checkPermission` | reviewed | route | server/packages/services/iam/routes/identity-provider.routes.ts | 11, 71 |
| `checkPermission` | reviewed | route | server/packages/services/iam/routes/operator.routes.ts | 40, 174, 429, 491, 527, 600, 652, 730, 793, 897, 1034, 1110, 1172, 1280, 1378, 1493 |
| `checkPermission` | reviewed | route | server/packages/services/iam/routes/parameter.routes.ts | 12, 119 |
| `checkPermission` | reviewed | route | server/packages/services/jobs/routes/jobs.board.route.ts | 52, 166, 179 |
| `checkPermission` | reviewed | runtime | server/packages/services/platform/platform-guard.ts | 16, 59 |
| `checkPermission` | reviewed | runtime | server/packages/services/records/lifecycle/execute-lifecycle-transition.ts | 10, 445 |
| `checkPermission` | reviewed | route | server/packages/services/records/routes/action-dispatcher.route.ts | 62, 424, 1370 |
| `checkPermission` | reviewed | route | server/packages/services/records/routes/entity-mutation-guard.ts | 4, 224 |
| `checkPermission` | reviewed | route | server/packages/services/records/routes/entity-op.registry.ts | 50, 254, 263, 270, 277, 284, 294, 301, 308 |
| `checkPermission` | reviewed | route | server/packages/services/records/routes/records.route.ts | 45, 9956, 10125 |
| `checkPermission` | reviewed | route | server/packages/services/records/routes/snapshots.route.ts | 33, 441 |
| `checkPermission` | reviewed | route | server/packages/services/records/routes/supplier-intake.route.ts | 37, 393 |
| `checkPermission` | reviewed | runtime | server/packages/services/workflow/operation-authorizer.ts | 23, 71, 79 |
| `checkPermission` | reviewed | runtime | server/packages/services/workflow/runtime.ts | 44, 93 |
| `checkPermission` | reviewed | runtime | server/src/runtimes/api.ts | 22, 1205, 1222 |
| `checkPermissionBatch` | reviewed | route | server/packages/services/finance/routes/ap.route.ts | 480, 2596 |
| `checkPermissionBatch` | reviewed | route | server/packages/services/finance/routes/finance.route.ts | 40 |
| `checkPermissionBatch` | reviewed | runtime | server/packages/services/iam/index.ts | 41 |
| `checkPermissionBatch` | reviewed | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 23, 89 |
| `checkPermissionBatch` | reviewed | runtime | server/packages/services/iam/permission/permission.service.ts | 295 |
| `checkPermissionBatch` | reviewed | route | server/packages/services/iam/routes/operator.routes.ts | 40, 171 |
| `checkPermissionBatch` | reviewed | route | server/packages/services/metadata/routes/entity-flow.route.ts | 50, 294, 628, 638 |
| `checkPermissionBatch` | reviewed | route | server/packages/services/metadata/routes/entity-operations.route.ts | 40, 110, 159, 204, 213 |
| `checkPermissionBatch` | reviewed | route | server/packages/services/metadata/routes/index.ts | 73 |
| `checkPermissionBatch` | reviewed | route | server/packages/services/records/routes/export.route.ts | 52, 222, 247 |
| `checkPermissionBatch` | reviewed | route | server/packages/services/records/routes/import.route.ts | 51, 287, 320, 420 |
| `checkPermissionBatch` | reviewed | route | server/packages/services/records/routes/index.ts | 65, 194 |
| `checkPermissionBatch` | reviewed | runtime | server/packages/services/shared/operation-guard.ts | 50, 52, 78 |
| `checkPermissionBatch` | reviewed | test | server/src/runtimes/__tests__/api.test.ts | 21 |
| `checkPermissionBatch` | reviewed | runtime | server/src/runtimes/api.ts | 23, 1120, 1166, 1324 |
| `checkPermissionForEntity` | reviewed | contract | packages/shared/data-integration/session-plane/src/index.ts | 200 |
| `checkPermissionForEntity` | reviewed | contract | packages/shared/platform-auth/session-plane/src/index.ts | 218 |
| `checkPermissionForEntity` | reviewed | contract | packages/shared/runtime-domain/session-plane/src/index.ts | 200 |
| `checkPermissions` | reviewed | contract | packages/shared/data-integration/session-plane/src/index.ts | 186 |
| `checkPermissions` | reviewed | contract | packages/shared/platform-auth/session-plane/src/index.ts | 204 |
| `checkPermissions` | reviewed | contract | packages/shared/runtime-domain/session-plane/src/index.ts | 186 |
| `checkWriteAccess` | reviewed | runtime | server/packages/services/policy/field-security-foundation.middleware.ts | 180, 227 |
| `createPermissionResolverRegistry` | reviewed | test | server/packages/services/iam/__tests__/permission-context-resolvers.test.ts | 15, 85, 91, 103 |
| `createPermissionResolverRegistry` | reviewed | runtime | server/packages/services/iam/index.ts | 120 |
| `createPermissionResolverRegistry` | reviewed | runtime | server/packages/services/iam/permission-context/index.ts | 39 |
| `createPermissionResolverRegistry` | reviewed | runtime | server/packages/services/iam/permission-context/resolvers/registry.ts | 23 |
| `createPermissionResolverRegistry` | reviewed | runtime | server/src/runtimes/api.ts | 25, 1052 |
| `enforceAuthorizedRole` | reviewed | test | server/src/auth/__tests__/auth-pipeline.test.ts | 19, 257, 259, 267, 277 |
| `enforceAuthorizedRole` | reviewed | runtime | server/src/auth/auth-pipeline.ts | 328, 513 |
| `enforceAuthPipeline` | reviewed | test | server/src/auth/__tests__/auth-pipeline.test.ts | 18, 360, 380, 404, 430, 454 |
| `enforceAuthPipeline` | reviewed | runtime | server/src/auth/auth-pipeline.ts | 458 |
| `enforceAuthPipeline` | reviewed | runtime | server/src/runtimes/api.ts | 124, 782 |
| `enforceAuthPipeline` | reviewed | runtime | server/src/runtimes/require-platform-context.ts | 24, 210 |
| `enforceSessionAuthorizedRole` | reviewed | runtime | packages/shared/platform-auth/auth-bff/src/auth-pipeline.ts | 98, 152 |
| `enforceSessionAuthorizedRole` | reviewed | runtime | packages/shared/platform-auth/auth-bff/src/index.ts | 196 |
| `getEffectiveModuleAccess` | reviewed | ui | packages/shared/ui-platform/me-ui/src/sections/tenant-context-section.tsx | 120 |
| `getEffectiveModuleAccess` | reviewed | tool | scripts/policy/authorization-inventory.ts | 681 |
| `getEffectiveModuleAccess` | reviewed | runtime | server/packages/services/iam/index.ts | 42 |
| `getEffectiveModuleAccess` | reviewed | runtime | server/packages/services/iam/permission/module-access.service.ts | 80 |
| `getEffectiveModuleAccess` | reviewed | runtime | server/packages/services/iam/session/session.service.ts | 22, 525 |
| `getEffectiveModuleAccess` | reviewed | route | server/packages/services/metadata/routes/compiled-entity.route.ts | 24, 78, 582, 591, 598 |
| `getEffectiveModuleAccess` | reviewed | route | server/packages/services/metadata/routes/entity-flow.route.ts | 25, 51, 294, 303, 310 |
| `getEffectiveModuleAccess` | reviewed | route | server/packages/services/metadata/routes/index.ts | 27, 74 |
| `getEffectiveModuleAccess` | reviewed | route | server/packages/services/platform/routes/platform.route.ts | 47, 3023 |
| `getEffectiveModuleAccess` | reviewed | runtime | server/src/runtimes/api.ts | 24, 1121 |
| `requireAllow` | reviewed | tool | scripts/policy/authorization-inventory.ts | 911 |
| `requireAllow` | reviewed | test | server/packages/services/ai/routes/__tests__/ai-feedback.route.test.ts | 8, 16, 170, 213 |
| `requireAllow` | reviewed | route | server/packages/services/ai/routes/ai.route.ts | 22, 67, 102, 189, 332 |
| `requireAllow` | reviewed | route | server/packages/services/finance/routes/ap.route.ts | 37, 3261 |
| `requireAllow` | reviewed | runtime | server/packages/services/iam/index.ts | 41 |
| `requireAllow` | reviewed | runtime | server/packages/services/iam/permission/permission.service.ts | 565 |
| `requireAllow` | reviewed | route | server/packages/services/iam/routes/company-code-access.routes.ts | 39, 245, 324 |
| `requireAllow` | reviewed | route | server/packages/services/iam/routes/identity-provider.routes.ts | 11, 72 |
| `requireAllow` | reviewed | route | server/packages/services/iam/routes/operator.routes.ts | 40, 430, 492, 528, 601, 653, 731, 794, 898, 1035, 1111, 1173, 1281, 1379, 1494 |
| `requireAllow` | reviewed | route | server/packages/services/iam/routes/parameter.routes.ts | 12, 120 |
| `requireAllow` | reviewed | route | server/packages/services/records/routes/records.route.ts | 47, 9957 |
| `requireAllow` | reviewed | route | server/packages/services/records/routes/snapshots.route.ts | 33, 442 |
| `requireAllowedPermission` | reviewed | route | server/packages/services/records/routes/action-dispatcher.route.ts | 435, 1369 |
| `requirePlatformPermission` | reviewed | runtime | server/packages/services/platform/platform-guard.ts | 39 |
| `requirePlatformPermission` | reviewed | route | server/packages/services/platform/routes/ref.route.ts | 57, 1370 |
| `requirePlatformPermission` | reviewed | route | server/packages/services/platform/routes/taxonomy.route.ts | 50, 742 |
| `requireProviderPermission` | reviewed | route | server/packages/services/iam/routes/identity-provider.routes.ts | 64, 82, 102, 127, 145, 162 |
| `requireStepUp` | reviewed | route | server/packages/services/finance/routes/ap.route.ts | 38, 496 |
| `requireStepUp` | reviewed | runtime | server/packages/services/iam/index.ts | 8 |
| `requireStepUp` | reviewed | runtime | server/packages/services/iam/mfa/step-up.service.ts | 202 |
| `requireStepUp` | reviewed | route | server/packages/services/iam/routes/company-code-access.routes.ts | 40, 240, 319 |
| `requireStepUp` | reviewed | route | server/packages/services/iam/routes/identity-provider.routes.ts | 12, 101, 126, 144, 161 |
| `requireStepUp` | reviewed | route | server/packages/services/iam/routes/operator.routes.ts | 41, 428, 490, 526, 599, 651, 729, 792, 896, 1033, 1109, 1171, 1279, 1377, 1492 |
| `requireStepUp` | reviewed | route | server/packages/services/iam/routes/parameter.routes.ts | 11, 118 |
| `requireStepUp` | reviewed | route | server/packages/services/workflow/routes/workflow.route.ts | 27, 195, 490 |
| `requireTenantAuth` | reviewed | route | server/packages/services/records/routes/line-source.route.ts | 242, 317, 384, 449, 533, 624, 676 |
| `resolveAccessibleCompany` | reviewed | runtime | packages/domain/finance/finance-workbench/src/lib/company-selection.ts | 22 |
| `resolveAccessibleCompany` | reviewed | ui | packages/domain/finance/finance-workbench/src/views/company-hub/CompanyHubView.tsx | 24, 82 |
| `resolveAccessibleCompany` | reviewed | ui | packages/domain/finance/finance-workbench/src/views/foundation/FoundationView.tsx | 15, 29 |
| `resolveAccessibleCompany` | reviewed | tool | scripts/policy/authorization-inventory.ts | 681 |
| `resolveAccessibleCompany` | reviewed | test | server/packages/services/finance/__tests__/finance-settings-slice7-rollout.contract.test.ts | 11, 106, 107 |
| `resolveAccessibleCompany` | reviewed | test | server/packages/services/finance/__tests__/finance-setup-company-ux.test.ts | 4, 28, 29, 30 |
| `resolveAccessScope` | reviewed | runtime | packages/apps/admin/src/list/adminAdapter.ts | 29 |
| `resolveAccessScope` | reviewed | runtime | packages/apps/mesh/src/list/meshAdapter.ts | 43 |
| `resolveAccessScope` | reviewed | runtime | packages/apps/neon/src/list/createNeonAdapter.ts | 67, 141, 142, 143 |
| `resolveAccessScope` | reviewed | runtime | packages/shared/runtime-domain/runtime-list/src/adapter/types.ts | 371 |
| `resolveAccessScope` | reviewed | test | packages/shared/runtime-domain/runtime-list/src/core/__tests__/presenter-features.test.ts | 111 |
| `resolveAccessScope` | reviewed | runtime | packages/shared/runtime-domain/runtime-list/src/core/presenter-props.ts | 77 |
| `resolveAccessScope` | reviewed | tool | scripts/policy/authorization-inventory.ts | 681 |
| `resolveAdminAccessScope` | reviewed | runtime | packages/apps/admin/src/list/adminAdapter.ts | 9 |
| `resolveAdminAccessScope` | reviewed | runtime | packages/apps/admin/src/list/index.ts | 1 |
| `resolveAttachmentAuthContext` | reviewed | route | server/packages/services/collab/routes/collab-attachments.route.ts | 28, 143 |
| `resolveAttachmentAuthContext` | reviewed | test | server/packages/services/shared/__tests__/resolve-attachment-auth-context.test.ts | 3, 5, 78, 89, 103, 117, 128, 140, 153, 168, 184 |
| `resolveAttachmentAuthContext` | reviewed | test | server/packages/services/shared/__tests__/verified-request-context-resolution-policy.test.ts | 7 |
| `resolveAttachmentAuthContext` | reviewed | runtime | server/packages/services/shared/route-helpers.ts | 508 |
| `resolveAuth` | reviewed | route | server/packages/services/iam/routes/company-code-access.routes.ts | 59, 136, 158, 234, 313 |
| `resolveAuth` | reviewed | route | server/packages/services/iam/routes/iam-admin.routes.ts | 54, 93, 189, 305 |
| `resolveAuth` | reviewed | route | server/packages/services/jobs/routes/jobs.board.route.ts | 85, 152 |
| `resolveAuth` | reviewed | route | server/packages/services/records/routes/bulk-crud.route.ts | 159, 217, 330 |
| `resolveCallerAuth` | reviewed | route | server/packages/services/iam/routes/mfa.routes.ts | 94, 183, 225, 263, 343, 399, 444, 542, 606, 645, 718, 746, 791, 836, 888 |
| `resolveCurrentAuthEpoch` | reviewed | tool | scripts/policy/authorization-inventory.ts | 681 |
| `resolveCurrentAuthEpoch` | reviewed | runtime | server/packages/services/iam/session/session.service.ts | 87, 335 |
| `resolvedAuthorization` | reviewed | runtime | server/packages/services/ai/tools/agent-read-only-tool-executor.ts | 341, 1078 |
| `resolveEntityOperationPermission` | reviewed | runtime | server/packages/services/documents/services/attachment-authorization.service.ts | 78, 99 |
| `resolveMeshAccessScope` | reviewed | runtime | packages/apps/mesh/src/list/index.ts | 1 |
| `resolveMeshAccessScope` | reviewed | runtime | packages/apps/mesh/src/list/meshAdapter.ts | 20 |
| `resolveNeonAccessScope` | reviewed | runtime | packages/apps/neon/src/list/createNeonAdapter.ts | 92 |
| `resolveNeonAccessScope` | reviewed | runtime | packages/apps/neon/src/list/index.ts | 3 |
| `resolveOperatorAuth` | reviewed | route | server/packages/services/iam/routes/operator.routes.ts | 65, 152, 189, 239, 283, 332, 370, 423, 485, 521, 594, 646, 724, 787, 829, 891, 947, 1028, 1104, 1166, 1274, 1372, 1414, 1487, 1576 |
| `resolveParameterAuth` | reviewed | route | server/packages/services/iam/routes/parameter.routes.ts | 115, 245 |
| `resolvePermission` | reviewed | runtime | server/packages/services/iam/authorization-runtime/sql-repository.ts | 128, 195 |
| `resolvePermissionId` | reviewed | route | server/packages/services/platform/routes/commerce.route.ts | 136, 703, 751, 1161, 1205 |
| `resolvePermissionMatchSource` | reviewed | runtime | server/packages/services/iam/permission/permission.service.ts | 121, 466 |
| `resolveProviderAuth` | reviewed | route | server/packages/services/iam/routes/identity-provider.routes.ts | 38, 80, 99, 124, 142, 159 |
| `resolveReadAuth` | reviewed | route | server/packages/services/iam/routes/parameter.routes.ts | 57, 71, 220, 251 |
| `resolveRecordWorkspacePermissions` | reviewed | test | apps/neon/lib/server/__tests__/record-workspace-manifest.test.ts | 8, 24, 56 |
| `resolveRecordWorkspacePermissions` | reviewed | runtime | apps/neon/lib/server/record-workspace-manifest.ts | 121, 146 |
| `resolveRuntimeAccessScope` | reviewed | runtime | packages/apps/admin/src/list/adminAdapter.ts | 7, 13 |
| `resolveRuntimeAccessScope` | reviewed | runtime | packages/apps/mesh/src/list/meshAdapter.ts | 9, 24 |
| `resolveRuntimeAccessScope` | reviewed | runtime | packages/apps/neon/src/list/createNeonAdapter.ts | 20, 96, 163 |
| `resolveRuntimeAccessScope` | reviewed | runtime | packages/shared/runtime-domain/runtime-list/src/core/access-scope.ts | 54 |
| `resolveUserCompanyAccess` | reviewed | route | server/packages/services/finance/routes/finance.route.ts | 1158, 1254, 1334 |
| `resolveVerifiedRequestContext` | reviewed | test | server/packages/services/ai/routes/__tests__/ai-agent.route.test.ts | 9, 19, 274, 327, 332 |
| `resolveVerifiedRequestContext` | reviewed | route | server/packages/services/ai/routes/ai-agent.route.ts | 15, 298 |
| `resolveVerifiedRequestContext` | reviewed | test | server/packages/services/documents/routes/__tests__/attachments.route.test.ts | 7, 24, 168 |
| `resolveVerifiedRequestContext` | reviewed | route | server/packages/services/documents/routes/attachments.route.ts | 25, 282 |
| `resolveVerifiedRequestContext` | reviewed | test | server/packages/services/records/__tests__/canonical-request-context-boundary.test.ts | 20, 58 |
| `resolveVerifiedRequestContext` | reviewed | test | server/packages/services/records/__tests__/p2p-authoritative-operation-boundary.test.ts | 20, 23, 24 |
| `resolveVerifiedRequestContext` | reviewed | test | server/packages/services/records/__tests__/phase0-mutation-characterization.test.ts | 135 |
| `resolveVerifiedRequestContext` | reviewed | route | server/packages/services/records/routes/index.ts | 43, 107 |
| `resolveVerifiedRequestContext` | reviewed | route | server/packages/services/records/routes/line-source.route.ts | 38, 256 |
| `resolveVerifiedRequestContext` | reviewed | test | server/packages/services/shared/__tests__/route-helpers.test.ts | 3, 8, 10, 31, 50 |
| `resolveVerifiedRequestContext` | reviewed | test | server/packages/services/shared/__tests__/verified-request-context-resolution-policy.test.ts | 6 |
| `resolveVerifiedRequestContext` | reviewed | runtime | server/packages/services/shared/route-helpers.ts | 221, 514 |

## Unknown source findings

None.

## Known source anomalies

| ID | Type | Identity | Owner | Current path | Lines | Disposition | Removal wave |
|---|---|---|---|---|---|---|---|
| drift.legacy-master-persona-reader | object | `master.persona` | platform-iam | server/packages/services/iam/routes/operator.routes.ts | 1608 | replace_reader_with_principal_profile_or_idp_projection | Wave 1 authorization model replacement |
| drift.permission-ap-invoice-approve | permission_code | `AP.INVOICE.APPROVE` | platform-iam+finance-platform | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | 25, 44, 45 | define_in_canonical_permission_seed_or_remove_scope_policy | Wave 1 seed replacement |
| drift.permission-iam-delegation-manage | permission_code | `IAM.DELEGATION.MANAGE` | platform-iam | server/packages/services/iam/routes/operator.routes.ts | 652, 730 | define_in_canonical_permission_seed_or_remove_legacy_route | Wave 1 authorization model replacement |
| drift.permission-iam-grant-manage | permission_code | `IAM.GRANT.MANAGE` | platform-iam | server/packages/services/iam/routes/company-code-access.routes.ts | 244, 323 | define_in_canonical_permission_seed_or_remove_legacy_routes | Wave 1 authorization model replacement |
| drift.permission-iam-grant-manage | permission_code | `IAM.GRANT.MANAGE` | platform-iam | server/packages/services/iam/routes/operator.routes.ts | 527, 600, 793, 1493 | define_in_canonical_permission_seed_or_remove_legacy_routes | Wave 1 authorization model replacement |
| drift.permission-iam-group-manage | permission_code | `IAM.GROUP.MANAGE` | platform-iam | server/packages/services/iam/routes/operator.routes.ts | 429, 491, 897, 1034, 1110, 1172, 1280, 1378 | define_in_canonical_permission_seed_before_group_cutover | Wave 1 authorization model replacement |
| drift.permission-iam-principal-read | permission_code | `IAM.PRINCIPAL.READ` | platform-iam | server/packages/services/iam/routes/operator.routes.ts | 174 | define_in_canonical_permission_seed_or_remove_legacy_route | Wave 1 authorization model replacement |
| drift.permission-invoice-line-add-from-catalog | permission_code | `INVOICE.LINE.ADD_FROM_CATALOG` | runtime-domain+platform-iam | packages/shared/runtime-domain/runtime-line-item/src/adapters/catalog.ts | 145 | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-catalog | permission_code | `INVOICE.LINE.ADD_FROM_CATALOG` | runtime-domain+platform-iam | packages/shared/runtime-line-item/src/adapters/catalog.ts | 145 | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-po | permission_code | `INVOICE.LINE.ADD_FROM_PO` | runtime-domain+platform-iam | packages/shared/runtime-domain/runtime-line-item/src/adapters/open-po-line.ts | 148 | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-po | permission_code | `INVOICE.LINE.ADD_FROM_PO` | runtime-domain+platform-iam | packages/shared/runtime-line-item/src/adapters/open-po-line.ts | 148 | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-receipt | permission_code | `INVOICE.LINE.ADD_FROM_RECEIPT` | runtime-domain+platform-iam | packages/shared/runtime-domain/runtime-line-item/src/adapters/open-receipt-line.ts | 167 | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-receipt | permission_code | `INVOICE.LINE.ADD_FROM_RECEIPT` | runtime-domain+platform-iam | packages/shared/runtime-line-item/src/adapters/open-receipt-line.ts | 167 | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-service-sheet | permission_code | `INVOICE.LINE.ADD_FROM_SERVICE_SHEET` | runtime-domain+platform-iam | packages/shared/runtime-domain/runtime-line-item/src/adapters/open-service-sheet-line.ts | 182 | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-invoice-line-add-from-service-sheet | permission_code | `INVOICE.LINE.ADD_FROM_SERVICE_SHEET` | runtime-domain+platform-iam | packages/shared/runtime-line-item/src/adapters/open-service-sheet-line.ts | 182 | define_in_canonical_permission_seed_or_replace_adapter_contract | Wave 1 seed replacement |
| drift.permission-ppl-pii-edit | permission_code | `PPL.PII.EDIT` | people-platform+platform-iam | server/db/ddl/master/08_people_rls.sql | 73, 80, 86, 90, 96 | define_in_canonical_permission_seed_before_rls_certification | Wave 1 seed replacement |
| drift.permission-ppl-pii-view | permission_code | `PPL.PII.VIEW` | people-platform+platform-iam | server/db/ddl/master/08_people_rls.sql | 72 | define_in_canonical_permission_seed_before_rls_certification | Wave 1 seed replacement |
| drift.permission-sales-opportunity-create | permission_code | `SALES.OPPORTUNITY.CREATE` | sales-platform+platform-iam | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | 22, 66 | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-sales-opportunity-create | permission_code | `SALES.OPPORTUNITY.CREATE` | sales-platform+platform-iam | server/packages/services/business/sales/sales-authorization.service.ts | 40, 41 | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-sales-order-create | permission_code | `SALES.ORDER.CREATE` | sales-platform+platform-iam | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | 24, 43 | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-sales-order-create | permission_code | `SALES.ORDER.CREATE` | sales-platform+platform-iam | server/packages/services/business/sales/sales-authorization.service.ts | 74, 77 | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-sales-quotation-create | permission_code | `SALES.QUOTATION.CREATE` | sales-platform+platform-iam | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | 23, 67 | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-sales-quotation-create | permission_code | `SALES.QUOTATION.CREATE` | sales-platform+platform-iam | server/packages/services/business/sales/sales-authorization.service.ts | 96, 97 | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-source-demand-aggregate | permission_code | `SOURCE.DEMAND.AGGREGATE` | procurement-platform+platform-iam | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | 20, 64 | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-source-demand-aggregate | permission_code | `SOURCE.DEMAND.AGGREGATE` | procurement-platform+platform-iam | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | 132, 138 | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-source-event-create | permission_code | `SOURCE.EVENT.CREATE` | procurement-platform+platform-iam | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | 19, 63 | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-source-event-create | permission_code | `SOURCE.EVENT.CREATE` | procurement-platform+platform-iam | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | 67, 71, 113, 118 | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-source-event-evaluate | permission_code | `SOURCE.EVENT.EVALUATE` | procurement-platform+platform-iam | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | 21, 65 | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |
| drift.permission-source-event-evaluate | permission_code | `SOURCE.EVENT.EVALUATE` | procurement-platform+platform-iam | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | 147, 152 | define_in_canonical_permission_seed_or_remove_scope_and_runtime_use | Wave 1 seed replacement |

## Zero-Mesh-specific-data Neon boundary findings

These are owned current-state exceptions to the target boundary, not evidence that the boundary is already satisfied.

| ID | Boundary class | Identity | Owner | Current path | Lines | Disposition | Removal wave |
|---|---|---|---|---|---|---|---|
| boundary.mesh-runtime-athyperadmin-app-pool | mesh_runtime_rls_bypass_app_pool | `mesh.runtime.athyperadmin_app_pool` | database-platform+mesh-platform | server/.env.example | 27 | replace_mesh_runtime_pool_with_dedicated_nobypassrls_login | Wave 0 Mesh boundary hardening |
| boundary.mesh-runtime-athyperadmin-app-pool | mesh_runtime_rls_bypass_app_pool | `mesh.runtime.athyperadmin_app_pool` | database-platform+mesh-platform | stack/env/.env.example | 399 | replace_mesh_runtime_pool_with_dedicated_nobypassrls_login | Wave 0 Mesh boundary hardening |
| boundary.mesh-runtime-superuser-app-pool | mesh_runtime_rls_bypass_app_pool | `mesh.runtime.postgres_superuser_app_pool` | database-platform+mesh-platform | stack/scripts/setup/write-env-staging.sh | 173 | replace_mesh_runtime_pool_with_dedicated_nobypassrls_login | Wave 0 Mesh boundary hardening |
| boundary.neon-legacy-mesh-business-network-membership-role-table | neon_legacy_mesh_table | `master.business_network_membership_role` | mesh-platform+database-platform | server/db/ddl/master/01m_bp_core_hardening.sql | 335 | migrate_or_classify_rows_then_drop_from_neon | Wave 1E network cleanup |
| boundary.neon-legacy-mesh-business-network-membership-table | neon_legacy_mesh_table | `master.business_network_membership` | mesh-platform+database-platform | server/db/ddl/master/01m_bp_core_hardening.sql | 279 | migrate_or_classify_rows_then_drop_from_neon | Wave 1E network cleanup |
| boundary.neon-legacy-mesh-business-network-table | neon_legacy_mesh_table | `master.business_network` | mesh-platform+database-platform | server/db/ddl/master/01m_bp_core_hardening.sql | 229 | migrate_or_classify_rows_then_drop_from_neon | Wave 1E network cleanup |
| boundary.neon-legacy-mesh-network-seeds | neon_legacy_mesh_seed | `neon.seed.legacy_mesh_network_authorization` | mesh-platform+database-platform | server/db/seed/tenants/neon/010_demo/network/001_buyer_networks.sql | 5, 5, 6, 29, 35, 36, 40, 46, 47, 51 | remove_mesh_authorization_rows_from_neon_seed_contract | Wave 2 deterministic seed replacement |
| boundary.neon-legacy-mesh-network-seeds | neon_legacy_mesh_seed | `neon.seed.legacy_mesh_network_authorization` | mesh-platform+database-platform | server/db/seed/tenants/neon/020_technostat/network/001_buyer_networks.sql | 22, 28, 29, 31, 37, 38, 40 | remove_mesh_authorization_rows_from_neon_seed_contract | Wave 2 deterministic seed replacement |
| boundary.neon-legacy-mesh-network-seeds | neon_legacy_mesh_seed | `neon.seed.legacy_mesh_network_authorization` | mesh-platform+database-platform | server/db/seed/tenants/neon/020_technostat/network/004_mesh_buyer_bindings.sql | 64, 65, 71, 72 | remove_mesh_authorization_rows_from_neon_seed_contract | Wave 2 deterministic seed replacement |
| boundary.neon-legacy-mesh-network-seeds | neon_legacy_mesh_seed | `neon.seed.legacy_mesh_network_authorization` | mesh-platform+database-platform | server/db/seed/tenants/neon/030_cirrusatlantic/network/001_buyer_networks.sql | 22, 28, 29, 31, 37, 38, 40 | remove_mesh_authorization_rows_from_neon_seed_contract | Wave 2 deterministic seed replacement |
| boundary.neon-legacy-mesh-network-seeds | neon_legacy_mesh_seed | `neon.seed.legacy_mesh_network_authorization` | mesh-platform+database-platform | server/db/seed/tenants/neon/030_cirrusatlantic/network/004_mesh_buyer_bindings.sql | 64, 65, 71, 72 | remove_mesh_authorization_rows_from_neon_seed_contract | Wave 2 deterministic seed replacement |
| boundary.neon-runtime-derived-mesh-database-url | neon_mesh_connection_fallback | `neon.runtime.derived_mesh_database_url` | runtime-platform+mesh-platform | server/src/config.ts | 735 | remove_cross_plane_database_url_derivation | Wave 0 plane boundary hardening |
| boundary.neon-runtime-direct-mesh-database-config | neon_direct_mesh_configuration | `neon.runtime.direct_mesh_database_config` | runtime-platform+mesh-platform | server/production.env.example | 38 | split_neon_and_mesh_runtime_process_credentials | Wave 0 plane boundary hardening |
| boundary.neon-runtime-direct-mesh-database-config | neon_direct_mesh_configuration | `neon.runtime.direct_mesh_database_config` | runtime-platform+mesh-platform | server/staging.env.example | 38 | split_neon_and_mesh_runtime_process_credentials | Wave 0 plane boundary hardening |
| boundary.neon-runtime-mesh-reader-fallback | neon_direct_mesh_reader | `neon.runtime.mesh_reader_fallback` | platform-iam+mesh-platform | server/packages/services/iam/context/context-resolver.service.ts | 76 | require_explicit_mesh_plane_repository_without_neon_fallback | Wave 0 plane boundary hardening |
| boundary.neon-runtime-mesh-reader-fallback | neon_direct_mesh_reader | `neon.runtime.mesh_reader_fallback` | platform-iam+mesh-platform | server/packages/services/iam/discovery/discovery.service.ts | 372 | require_explicit_mesh_plane_repository_without_neon_fallback | Wave 0 plane boundary hardening |

## Canonical capture-source parity

Capture DDLs:

- neon: `server/db/ddl/control/01zzo_authorization_migration_controls.sql` -> `control.authorization_capture_source`
- mesh: `server/db/ddl/mesh_control/01z_authorization_migration_controls.sql` -> `mesh_control.authorization_capture_source`

| Plane | Exact source | Object ID | Owner | Disposition | DDL | Line |
|---|---|---|---|---|---|---:|
| mesh | `mesh.account_grant` | mesh.account_grant | mesh-platform | replace_with_mesh_local_role_group_model | server/db/ddl/mesh_control/01z_authorization_migration_controls.sql | 411 |
| mesh | `mesh.attachment_acl` | mesh.attachment_acl | mesh-platform | normalize_mesh_locally | server/db/ddl/mesh_control/01z_authorization_migration_controls.sql | 425 |
| mesh | `mesh.content_item_access_grant` | mesh.content_access_grant | mesh-platform | normalize_mesh_locally | server/db/ddl/mesh_control/01z_authorization_migration_controls.sql | 431 |
| mesh | `mesh.conversation_participant` | mesh.conversation_participant | mesh-platform | keep_mesh_local_authorization_source | server/db/ddl/mesh_control/01z_authorization_migration_controls.sql | 437 |
| mesh | `mesh.network_account` | mesh.account | mesh-platform | keep_mesh_only | server/db/ddl/mesh_control/01z_authorization_migration_controls.sql | 397 |
| mesh | `mesh.network_relationship` | mesh.relationship | mesh-platform | keep_non_authorizing | server/db/ddl/mesh_control/01z_authorization_migration_controls.sql | 419 |
| mesh | `mesh.principal` | mesh.identity.principal | mesh-platform | keep_mesh_only | server/db/ddl/mesh_control/01z_authorization_migration_controls.sql | 379 |
| mesh | `mesh.principal_identity_binding` | mesh.identity.binding | mesh-platform | keep_mesh_only | server/db/ddl/mesh_control/01z_authorization_migration_controls.sql | 388 |
| neon | `control.entity` | metadata.entity | metadata-platform | keep_canonical_entity_identity | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 356 |
| neon | `control.entity_action_rule` | metadata.entity_action_rule | metadata-platform | replace_permission_code_with_permission_id | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 371 |
| neon | `control.entity_field` | metadata.entity_field | metadata-platform | normalize_security_references | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 362 |
| neon | `control.entity_flow` | metadata.entity_flow | metadata-platform | normalize_permission_references | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 373 |
| neon | `control.entity_flow_step` | metadata.entity_flow_step | metadata-platform | normalize_permission_references | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 374 |
| neon | `control.entity_lifecycle` | metadata.entity_lifecycle | workflow-platform | keep_canonical_entity_lifecycle_binding | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 369 |
| neon | `control.entity_lifecycle_state_mask` | metadata.entity_lifecycle_state_mask | workflow-platform | normalize_as_non_granting_state_capability_guard | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 370 |
| neon | `control.entity_operation` | metadata.entity_operation | metadata-platform | replace_permission_code_with_permission_id | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 359 |
| neon | `control.entity_policy` | metadata.entity_policy | policy-platform | keep_as_non_granting_guard | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 364 |
| neon | `control.entity_relation` | metadata.entity_relation | metadata-platform | normalize_permission_references | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 372 |
| neon | `control.entity_surface` | metadata.entity_surface | metadata-platform | normalize_permission_references | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 361 |
| neon | `control.entity_version` | metadata.entity_version | metadata-platform | keep_canonical_versioned_contract | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 358 |
| neon | `control.field_security_policy` | metadata.field_security_policy | policy-platform | normalize_permission_references | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 363 |
| neon | `control.lifecycle` | metadata.lifecycle | workflow-platform | keep_as_non_granting_workflow_context | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 365 |
| neon | `control.lifecycle_state` | metadata.lifecycle_state | workflow-platform | keep_as_non_granting_workflow_context | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 366 |
| neon | `control.lifecycle_transition` | metadata.lifecycle_transition | workflow-platform | bind_exact_permission_id | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 367 |
| neon | `control.lifecycle_transition_gate` | metadata.lifecycle_transition_gate | workflow-platform | normalize_as_non_granting_transition_guard | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 368 |
| neon | `control.mfa_config` | authentication.mfa_config | platform-iam | keep_keycloak_authority_projection | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 357 |
| neon | `control.permission_alias` | metadata.permission_alias | platform-iam | remove_after_shadow | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 360 |
| neon | `master.access_grant` | legacy.access_grant | platform-iam | split_into_role_scope_override_acl | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 341 |
| neon | `master.attachment_acl` | legacy.attachment_acl | document-platform | merge_into_auth_record_acl | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 345 |
| neon | `master.auth_group` | authorization.group | platform-iam | replace_additively | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 335 |
| neon | `master.auth_group_member` | authorization.group_member | platform-iam | replace_additively | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 337 |
| neon | `master.auth_group_role` | authorization.group_role | platform-iam | replace_additively | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 336 |
| neon | `master.business_network` | legacy.business_network | mesh-platform | remove_from_neon | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 351 |
| neon | `master.business_network_membership` | legacy.business_network_membership | mesh-platform | remove_from_neon | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 352 |
| neon | `master.business_network_membership_role` | legacy.business_network_membership_role | mesh-platform | remove_from_neon | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 353 |
| neon | `master.company_code` | context.company_code | finance-platform | keep_as_non_granting_scope_source | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 348 |
| neon | `master.company_code_access` | legacy.company_code_access | platform-iam | remove | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 334 |
| neon | `master.content_item_access_grant` | legacy.content_item_access_grant | content-platform | merge_into_auth_record_acl | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 346 |
| neon | `master.delegation_grant` | legacy.delegation_grant | platform-iam | normalize | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 344 |
| neon | `master.group_feature_grant` | legacy.group_feature_grant | platform-iam | remove | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 342 |
| neon | `master.legal_entity` | context.legal_entity | organization-platform | keep_as_non_granting_scope_source | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 347 |
| neon | `master.legal_entity_identity_binding` | identity.legal_entity_binding | platform-iam | keep_as_non_granting_identity_projection | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 327 |
| neon | `master.operating_organization` | context.operating_organization | organization-platform | keep_as_non_granting_scope_source | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 349 |
| neon | `master.operating_organization_company` | context.operating_organization_company | organization-platform | keep_as_non_granting_scope_membership | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 350 |
| neon | `master.principal` | identity.principal | platform-iam | keep | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 322 |
| neon | `master.principal_feature_grant` | legacy.principal_feature_grant | platform-iam | remove | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 343 |
| neon | `master.principal_identity_binding` | identity.principal_binding | platform-iam | keep | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 324 |
| neon | `master.principal_persona` | legacy.principal_persona | platform-iam | remove | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 338 |
| neon | `master.principal_profile` | identity.principal_profile | platform-iam | remove_duplicate_idp_fields | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 323 |
| neon | `master.principal_relationship` | context.principal_relationship | platform-iam | keep_non_authorizing | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 329 |
| neon | `master.team` | context.team | organization-platform | keep_non_authorizing | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 339 |
| neon | `master.team_member` | context.team_member | organization-platform | keep_non_authorizing | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 340 |
| neon | `master.tenant` | identity.tenant | platform-iam | keep | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 321 |
| neon | `master.tenant_admin_grant` | legacy.tenant_admin_grant | platform-iam | replace_with_auth_plane_membership | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 333 |
| neon | `master.tenant_feature_entitlement` | legacy.tenant_feature_entitlement | commercial-platform | replace_with_tenant_entitlement | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 331 |
| neon | `master.tenant_identity_domain` | identity.tenant_domain | platform-iam | keep | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 326 |
| neon | `master.tenant_identity_provider` | identity.tenant_provider | platform-iam | keep | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 325 |
| neon | `master.tenant_module_subscription` | legacy.tenant_module_subscription | commercial-platform | replace_with_tenant_entitlement | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 330 |
| neon | `master.tenant_permission_override` | legacy.tenant_permission_override | commercial-platform | replace_with_feature_entitlement_override | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 332 |
| neon | `master.tenant_relationship` | context.tenant_relationship | platform-iam | keep_non_authorizing | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 328 |
| neon | `shared.enterprise_feature` | catalog.enterprise_feature | platform-catalog | replace_with_feature_catalog | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 307 |
| neon | `shared.module` | catalog.module | platform-catalog | keep_neon_reference_only_in_mesh | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 306 |
| neon | `shared.permission` | legacy.permission | platform-iam | move_to_control_auth_permission | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 314 |
| neon | `shared.permission_category` | legacy.permission_category | platform-iam | move_to_control_auth_permission | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 313 |
| neon | `shared.permission_scope_policy` | legacy.permission_scope_policy | platform-iam | move_to_control_scope_policy | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 315 |
| neon | `shared.persona` | legacy.persona | platform-iam | remove | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 316 |
| neon | `shared.persona_permission` | legacy.persona_permission | platform-iam | remove | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 317 |
| neon | `shared.plan_feature_access` | legacy.plan_feature_access | commercial-platform | replace_with_plan_version_feature_access | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 312 |
| neon | `shared.plan_module_access` | legacy.plan_module_access | commercial-platform | replace_with_plan_version_module_access | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 310 |
| neon | `shared.plan_permission_access` | legacy.plan_permission_access | commercial-platform | remove_permission_level_entitlement | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 311 |
| neon | `shared.role` | legacy.role | platform-iam | replace_with_tenant_plane_role | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 318 |
| neon | `shared.subscription_plan` | catalog.subscription_plan | commercial-platform | keep_neon | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 308 |
| neon | `shared.subscription_plan_version` | catalog.subscription_plan_version | commercial-platform | keep_neon | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 309 |
| neon | `shared.workspace` | catalog.workspace | platform-catalog | keep_neon_reference_only_in_mesh | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 305 |

## Writer inventory

| Object | Access | Artifact class | Path | Lines |
|---|---|---|---|---|
| `log.attachment_access_log` | insert | route | server/packages/services/collab/routes/collab-attachments.route.ts | 573 |
| `log.attachment_access_log` | insert | runtime | server/packages/services/documents/services/attachment.service.ts | 1082 |
| `log.permission_decision_log` | insert | runtime | server/packages/services/iam/permission/permission.service.ts | 639 |
| `log.security_event_log` | insert | route | server/packages/services/iam/routes/logout.routes.ts | 191 |
| `log.security_event_log` | insert | route | server/packages/services/iam/routes/mfa.routes.ts | 320 |
| `control.mfa_config` | update | ddl | server/db/ddl/control/02_mfa_keycloak_authority.sql | 13 |
| `control.mfa_config` | delete | runtime | server/packages/services/iam/mfa/mfa-sync.service.ts | 418 |
| `control.mfa_config` | insert | runtime | server/packages/services/iam/mfa/mfa-sync.service.ts | 315 |
| `control.mfa_config` | update | runtime | server/packages/services/iam/mfa/mfa-sync.service.ts | 297, 352 |
| `control.mfa_config` | delete | route | server/packages/services/iam/routes/mfa.routes.ts | 312 |
| `master.auth_group` | insert | test | scripts/policy/authorization-inventory.test.ts | 99 |
| `master.auth_group` | update | test | scripts/policy/authorization-inventory.test.ts | 100 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 118 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/001_demo_rbac.sql | 43, 60 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/003_operating_organization_rbac.sql | 41 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1274, 1285 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/002_neon_le_groups.sql | 54 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/004_mesh_buyer_bindings.sql | 80 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/950_rbac/001_rbac.sql | 24 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/002_neon_le_groups.sql | 44 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/004_mesh_buyer_bindings.sql | 80 |
| `master.auth_group` | insert | route | server/packages/services/iam/routes/operator.routes.ts | 918 |
| `master.auth_group` | update | route | server/packages/services/iam/routes/operator.routes.ts | 1086, 1135 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 157 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/002_demo_group_members.sql | 39, 66, 130 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/004_operating_organization_members.sql | 15 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1393 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/002_neon_le_groups.sql | 142 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/004_mesh_buyer_bindings.sql | 123 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/950_rbac/001_rbac.sql | 55, 63, 71 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/002_neon_le_groups.sql | 86 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/004_mesh_buyer_bindings.sql | 123 |
| `master.auth_group_member` | delete | route | server/packages/services/iam/routes/operator.routes.ts | 498 |
| `master.auth_group_member` | insert | route | server/packages/services/iam/routes/operator.routes.ts | 457 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 136, 145 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/001_demo_rbac.sql | 111, 134, 166, 188 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/003_operating_organization_rbac.sql | 57 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1300, 1315, 1330, 1351 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/002_neon_le_groups.sql | 82, 97, 112, 127 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/004_mesh_buyer_bindings.sql | 97, 110 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/950_rbac/001_rbac.sql | 41, 47 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/002_neon_le_groups.sql | 60, 73 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/004_mesh_buyer_bindings.sql | 97, 110 |
| `master.auth_group_role` | delete | route | server/packages/services/iam/routes/operator.routes.ts | 1385 |
| `master.auth_group_role` | insert | route | server/packages/services/iam/routes/operator.routes.ts | 1241 |
| `master.auth_group_role` | update | route | server/packages/services/iam/routes/operator.routes.ts | 1336 |
| `shared.enterprise_feature` | insert | seed | server/db/seed/platform/002_permission_model/013_enterprise_feature.sql | 3 |
| `shared.enterprise_feature` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 396 |
| `shared.enterprise_feature` | update | route | server/packages/services/platform/routes/commerce.route.ts | 452 |
| `shared.module` | insert | seed | server/db/seed/platform/002_permission_model/_mesh/workspace_module.sql | 36 |
| `shared.module` | update | seed | server/db/seed/platform/002_permission_model/_mesh/workspace_module.sql | 72 |
| `shared.module` | delete | seed | server/db/seed/platform/002_permission_model/012_module.sql | 104 |
| `shared.module` | insert | seed | server/db/seed/platform/002_permission_model/012_module.sql | 21 |
| `shared.module` | update | seed | server/db/seed/platform/002_permission_model/012_module.sql | 85 |
| `shared.subscription_plan` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 154 |
| `shared.subscription_plan` | insert | seed | server/db/seed/platform/002_permission_model/014_subscription_plan.sql | 4 |
| `shared.subscription_plan` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 226 |
| `shared.subscription_plan` | update | route | server/packages/services/platform/routes/commerce.route.ts | 298 |
| `shared.subscription_plan_version` | update | ddl | server/db/ddl/mesh/_shared/06_triggers.sql | 158 |
| `shared.subscription_plan_version` | update | ddl | server/db/ddl/shared/06_triggers.sql | 176 |
| `shared.subscription_plan_version` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 156 |
| `shared.subscription_plan_version` | insert | seed | server/db/seed/platform/002_permission_model/016_plan_module_access.sql | 20 |
| `shared.subscription_plan_version` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 495 |
| `shared.workspace` | insert | seed | server/db/seed/platform/002_permission_model/_mesh/workspace_module.sql | 24 |
| `shared.workspace` | insert | seed | server/db/seed/platform/002_permission_model/011_workspace.sql | 4 |
| `shared.workspace` | delete | seed | server/db/seed/platform/002_permission_model/012_module.sql | 105, 108 |
| `shared.workspace` | insert | seed | server/db/seed/platform/002_permission_model/012_module.sql | 10 |
| `snapshot.entity_compiled` | delete | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 448 |
| `snapshot.entity_compiled` | delete | seed | server/db/seed/platform/003_control/045_control_entity_field_data_type_normalization_contract.sql | 494 |
| `snapshot.entity_compiled` | insert | runtime | server/packages/services/metadata/src/catalog-compiler.ts | 219 |
| `snapshot.entity_compiled` | insert | runtime | server/packages/services/metadata/src/entity-compiler.service.ts | 2292 |
| `master.company_code` | update | seed | server/db/seed/blueprints/universal/060_org_structure/303_company_code_tax_fx_links.sql | 19, 33 |
| `master.company_code` | insert | seed | server/db/seed/tenants/neon/010_demo/100_org_structure/199_gl_preseed.sql | 275 |
| `master.company_code` | update | seed | server/db/seed/tenants/neon/010_demo/100_org_structure/199_gl_preseed.sql | 319 |
| `master.company_code` | insert | seed | server/db/seed/tenants/neon/010_demo/100_org_structure/200_demo_legal_entities.sql | 45 |
| `master.company_code` | insert | seed | server/db/seed/tenants/neon/010_demo/100_org_structure/201_athyper_subsidiaries.sql | 187 |
| `master.company_code` | update | seed | server/db/seed/tenants/neon/010_demo/100_org_structure/201_athyper_subsidiaries.sql | 283 |
| `master.company_code` | update | seed | server/db/seed/tenants/neon/010_demo/100_org_structure/311_ledger_books.sql | 140 |
| `master.company_code` | update | seed | server/db/seed/tenants/neon/010_demo/party_master/004_athq_intercompany.sql | 53 |
| `master.company_code` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 221 |
| `master.company_code` | update | seed | server/db/seed/tenants/neon/020_technostat/006_technostat_intercompany_master.sql | 53 |
| `master.company_code` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/100_org_structure/200_legal_entities.sql | 63 |
| `master.company_code` | update | seed | server/db/seed/tenants/neon/030_cirrusatlantic/100_org_structure/311_ledger_books.sql | 147 |
| `master.company_code` | delete | test | server/packages/services/business/__tests__/_fixtures/budget-fixture.ts | 915 |
| `master.company_code` | insert | test | server/packages/services/business/__tests__/_fixtures/budget-fixture.ts | 181 |
| `master.company_code` | delete | test | server/packages/services/business/__tests__/commitment-from-requisition.integration.test.ts | 392 |
| `master.company_code` | insert | test | server/packages/services/business/__tests__/commitment-from-requisition.integration.test.ts | 307 |
| `master.company_code` | delete | test | server/packages/services/business/__tests__/invoice-from-receipt.integration.test.ts | 394 |
| `master.company_code` | insert | test | server/packages/services/business/__tests__/invoice-from-receipt.integration.test.ts | 274 |
| `master.company_code` | delete | test | server/packages/services/business/__tests__/p2p-immutability-guards.integration.test.ts | 327 |
| `master.company_code` | insert | test | server/packages/services/business/__tests__/p2p-immutability-guards.integration.test.ts | 211 |
| `master.company_code` | delete | test | server/packages/services/business/__tests__/payment-from-invoice.integration.test.ts | 367 |
| `master.company_code` | insert | test | server/packages/services/business/__tests__/payment-from-invoice.integration.test.ts | 240 |
| `master.company_code` | delete | test | server/packages/services/business/__tests__/purchase-invoice-lifecycle.integration.test.ts | 767 |
| `master.company_code` | insert | test | server/packages/services/business/__tests__/purchase-invoice-lifecycle.integration.test.ts | 451 |
| `master.company_code` | delete | test | server/packages/services/business/__tests__/receipt-from-commitment.integration.test.ts | 367 |
| `master.company_code` | insert | test | server/packages/services/business/__tests__/receipt-from-commitment.integration.test.ts | 247 |
| `master.company_code` | update | runtime | server/packages/services/finance/services/finance-setup-mutations.service.ts | 861 |
| `master.company_code` | update | runtime | server/packages/services/finance/services/fiscal-calendar.service.ts | 511 |
| `master.company_code` | delete | test | server/packages/services/jobs/__tests__/p2p-notification-outbox.handler.integration.test.ts | 552 |
| `master.company_code` | insert | test | server/packages/services/jobs/__tests__/p2p-notification-outbox.handler.integration.test.ts | 446 |
| `master.company_code` | delete | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 524 |
| `master.company_code` | insert | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 333 |
| `master.legal_entity` | update | ddl | server/db/ddl/master/01m_bp_core_hardening.sql | 1346 |
| `master.legal_entity` | insert | seed | server/db/seed/tenants/neon/010_demo/100_org_structure/199_gl_preseed.sql | 142, 189 |
| `master.legal_entity` | insert | seed | server/db/seed/tenants/neon/010_demo/100_org_structure/200_demo_legal_entities.sql | 28 |
| `master.legal_entity` | insert | seed | server/db/seed/tenants/neon/010_demo/100_org_structure/201_athyper_subsidiaries.sql | 67 |
| `master.legal_entity` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 139, 157, 170, 185 |
| `master.legal_entity` | update | seed | server/db/seed/tenants/neon/020_technostat/004_technostat_finance_controls.sql | 41, 54, 67, 80 |
| `master.legal_entity` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/100_org_structure/200_legal_entities.sql | 32 |
| `master.legal_entity` | delete | test | server/packages/services/business/__tests__/_fixtures/budget-fixture.ts | 916 |
| `master.legal_entity` | insert | test | server/packages/services/business/__tests__/_fixtures/budget-fixture.ts | 171 |
| `master.legal_entity` | delete | test | server/packages/services/business/__tests__/commitment-from-requisition.integration.test.ts | 393 |
| `master.legal_entity` | insert | test | server/packages/services/business/__tests__/commitment-from-requisition.integration.test.ts | 306 |
| `master.legal_entity` | delete | test | server/packages/services/business/__tests__/invoice-from-receipt.integration.test.ts | 395 |
| `master.legal_entity` | insert | test | server/packages/services/business/__tests__/invoice-from-receipt.integration.test.ts | 273 |
| `master.legal_entity` | delete | test | server/packages/services/business/__tests__/p2p-immutability-guards.integration.test.ts | 328 |
| `master.legal_entity` | insert | test | server/packages/services/business/__tests__/p2p-immutability-guards.integration.test.ts | 206 |
| `master.legal_entity` | delete | test | server/packages/services/business/__tests__/payment-from-invoice.integration.test.ts | 368 |
| `master.legal_entity` | insert | test | server/packages/services/business/__tests__/payment-from-invoice.integration.test.ts | 239 |
| `master.legal_entity` | delete | test | server/packages/services/business/__tests__/purchase-invoice-lifecycle.integration.test.ts | 768 |
| `master.legal_entity` | insert | test | server/packages/services/business/__tests__/purchase-invoice-lifecycle.integration.test.ts | 433 |
| `master.legal_entity` | delete | test | server/packages/services/business/__tests__/receipt-from-commitment.integration.test.ts | 368 |
| `master.legal_entity` | insert | test | server/packages/services/business/__tests__/receipt-from-commitment.integration.test.ts | 242 |
| `master.legal_entity` | delete | test | server/packages/services/jobs/__tests__/p2p-notification-outbox.handler.integration.test.ts | 553 |
| `master.legal_entity` | insert | test | server/packages/services/jobs/__tests__/p2p-notification-outbox.handler.integration.test.ts | 445 |
| `master.legal_entity` | delete | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 525 |
| `master.legal_entity` | insert | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 314 |
| `master.operating_organization` | update | ddl | server/db/ddl/master/05_functions.sql | 6026, 6035 |
| `master.operating_organization` | insert | seed | server/db/seed/tenants/neon/010_demo/100_org_structure/202_operating_organizations.sql | 43 |
| `master.operating_organization_company` | insert | seed | server/db/seed/tenants/neon/010_demo/100_org_structure/202_operating_organizations.sql | 81 |
| `master.principal` | insert | ddl | server/db/ddl/master/05_functions.sql | 138 |
| `master.principal` | update | ddl | server/db/ddl/master/05_functions.sql | 289, 316 |
| `master.principal` | update | ddl | server/db/ddl/master/06_triggers.sql | 2117 |
| `master.principal` | insert | tool | server/db/scripts/migrate/migrate-preserved-identities.ts | 184 |
| `master.principal` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave3-authority.mjs | 83 |
| `master.principal` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 126 |
| `master.principal` | insert | tool | server/db/scripts/verify/verify-authorization-v2-wave6.ts | 124 |
| `master.principal` | insert | seed | server/db/seed/platform/000_bootstrap/000_bootstrap.sql | 32 |
| `master.principal` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 43 |
| `master.principal` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/001_demo_principals.sql | 41 |
| `master.principal` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/004_athq_principals.sql | 38 |
| `master.principal` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_demo_in_priya.sql | 61 |
| `master.principal` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_principal_users.sql | 94, 112 |
| `master.principal` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1124 |
| `master.principal` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/900_principals/001_principals.sql | 46 |
| `master.principal` | delete | test | server/packages/services/business/__tests__/_fixtures/budget-fixture.ts | 917 |
| `master.principal` | insert | test | server/packages/services/business/__tests__/_fixtures/budget-fixture.ts | 163 |
| `master.principal` | delete | test | server/packages/services/business/__tests__/commitment-from-requisition.integration.test.ts | 394 |
| `master.principal` | insert | test | server/packages/services/business/__tests__/commitment-from-requisition.integration.test.ts | 303 |
| `master.principal` | delete | test | server/packages/services/business/__tests__/invoice-from-receipt.integration.test.ts | 396 |
| `master.principal` | insert | test | server/packages/services/business/__tests__/invoice-from-receipt.integration.test.ts | 272 |
| `master.principal` | delete | test | server/packages/services/business/__tests__/p2p-immutability-guards.integration.test.ts | 329 |
| `master.principal` | insert | test | server/packages/services/business/__tests__/p2p-immutability-guards.integration.test.ts | 201 |
| `master.principal` | delete | test | server/packages/services/business/__tests__/payment-from-invoice.integration.test.ts | 369 |
| `master.principal` | insert | test | server/packages/services/business/__tests__/payment-from-invoice.integration.test.ts | 238 |
| `master.principal` | delete | test | server/packages/services/business/__tests__/purchase-invoice-lifecycle.integration.test.ts | 769 |
| `master.principal` | insert | test | server/packages/services/business/__tests__/purchase-invoice-lifecycle.integration.test.ts | 419 |
| `master.principal` | delete | test | server/packages/services/business/__tests__/receipt-from-commitment.integration.test.ts | 369 |
| `master.principal` | insert | test | server/packages/services/business/__tests__/receipt-from-commitment.integration.test.ts | 237 |
| `master.principal` | insert | runtime | server/packages/services/iam/jit/jit.service.ts | 179, 208 |
| `master.principal` | update | route | server/packages/services/iam/routes/operator.routes.ts | 1513 |
| `master.principal` | delete | test | server/packages/services/jobs/__tests__/p2p-notification-outbox.handler.integration.test.ts | 554 |
| `master.principal` | insert | test | server/packages/services/jobs/__tests__/p2p-notification-outbox.handler.integration.test.ts | 440 |
| `master.principal` | update | runtime | server/packages/services/jobs/workers/kc-sync.worker.ts | 268, 341 |
| `master.principal` | insert | runtime | server/packages/services/shared/route-helpers.ts | 638 |
| `master.principal` | delete | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 526 |
| `master.principal` | insert | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 299 |
| `master.principal_identity_binding` | insert | ddl | server/db/ddl/master/05_functions.sql | 5003 |
| `master.principal_identity_binding` | insert | tool | server/db/scripts/migrate/migrate-preserved-identities.ts | 204 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 84 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/001_demo_principals.sql | 86 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_demo_in_priya.sql | 91 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_principal_users.sql | 232 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1238 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/003_admin_plane_bindings.sql | 52 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/004_mesh_buyer_bindings.sql | 41 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/900_principals/001_principals.sql | 70 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/003_admin_plane_bindings.sql | 38 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/004_mesh_buyer_bindings.sql | 41 |
| `master.principal_identity_binding` | update | runtime | server/packages/services/iam/context/context-resolver.service.ts | 227 |
| `master.principal_identity_binding` | insert | runtime | server/packages/services/iam/jit/jit.service.ts | 253 |
| `master.principal_identity_binding` | update | runtime | server/packages/services/iam/jit/jit.service.ts | 154 |
| `master.principal_identity_binding` | update | runtime | server/packages/services/jobs/workers/kc-sync.worker.ts | 250, 304 |
| `master.principal_identity_binding` | update | route | server/packages/services/platform/routes/platform.route.ts | 3431 |
| `master.principal_identity_binding` | insert | runtime | server/packages/services/shared/route-helpers.ts | 642 |
| `master.principal_profile` | insert | ddl | server/db/ddl/master/05_functions.sql | 147 |
| `master.principal_profile` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 62 |
| `master.principal_profile` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/001_demo_principals.sql | 65 |
| `master.principal_profile` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/004_athq_principals.sql | 64 |
| `master.principal_profile` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_demo_in_priya.sql | 74 |
| `master.principal_profile` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_principal_users.sql | 166 |
| `master.principal_profile` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1161 |
| `master.principal_profile` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/900_principals/001_principals.sql | 56 |
| `master.principal_profile` | insert | runtime | server/packages/services/iam/jit/jit.service.ts | 238 |
| `master.principal_profile` | update | runtime | server/packages/services/jobs/workers/kc-sync.worker.ts | 327 |
| `master.tenant` | insert | ddl | server/db/ddl/master/05_functions.sql | 124 |
| `master.tenant` | update | ddl | server/db/ddl/master/05_functions.sql | 2268 |
| `master.tenant` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 162 |
| `master.tenant` | insert | seed | server/db/seed/platform/000_bootstrap/000_bootstrap.sql | 10 |
| `master.tenant` | insert | seed | server/db/seed/platform/006_system_tenant/000_athyper_tenant.sql | 12 |
| `master.tenant` | insert | seed | server/db/seed/tenants/neon/_template/000_tenant.sql | 16 |
| `master.tenant` | insert | seed | server/db/seed/tenants/neon/010_demo/000_tenant.sql | 18 |
| `master.tenant` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_demo_in_priya.sql | 12 |
| `master.tenant` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 74 |
| `master.tenant` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/000_tenant.sql | 52 |
| `master.tenant` | update | seed | server/db/seed/tenants/neon/030_cirrusatlantic/000_tenant.sql | 31 |
| `master.tenant` | delete | test | server/packages/services/business/__tests__/_fixtures/budget-fixture.ts | 918 |
| `master.tenant` | insert | test | server/packages/services/business/__tests__/_fixtures/budget-fixture.ts | 155 |
| `master.tenant` | delete | test | server/packages/services/business/__tests__/commitment-from-requisition.integration.test.ts | 395 |
| `master.tenant` | insert | test | server/packages/services/business/__tests__/commitment-from-requisition.integration.test.ts | 297 |
| `master.tenant` | delete | test | server/packages/services/business/__tests__/invoice-from-receipt.integration.test.ts | 397 |
| `master.tenant` | insert | test | server/packages/services/business/__tests__/invoice-from-receipt.integration.test.ts | 271 |
| `master.tenant` | delete | test | server/packages/services/business/__tests__/p2p-immutability-guards.integration.test.ts | 330 |
| `master.tenant` | insert | test | server/packages/services/business/__tests__/p2p-immutability-guards.integration.test.ts | 196 |
| `master.tenant` | delete | test | server/packages/services/business/__tests__/payment-from-invoice.integration.test.ts | 370 |
| `master.tenant` | insert | test | server/packages/services/business/__tests__/payment-from-invoice.integration.test.ts | 237 |
| `master.tenant` | delete | test | server/packages/services/business/__tests__/purchase-invoice-lifecycle.integration.test.ts | 770 |
| `master.tenant` | insert | test | server/packages/services/business/__tests__/purchase-invoice-lifecycle.integration.test.ts | 404 |
| `master.tenant` | delete | test | server/packages/services/business/__tests__/receipt-from-commitment.integration.test.ts | 370 |
| `master.tenant` | insert | test | server/packages/services/business/__tests__/receipt-from-commitment.integration.test.ts | 232 |
| `master.tenant` | delete | test | server/packages/services/jobs/__tests__/p2p-notification-outbox.handler.integration.test.ts | 555 |
| `master.tenant` | insert | test | server/packages/services/jobs/__tests__/p2p-notification-outbox.handler.integration.test.ts | 429 |
| `master.tenant` | update | route | server/packages/services/platform/routes/commerce.route.ts | 961 |
| `master.tenant` | delete | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 527 |
| `master.tenant` | insert | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 283 |
| `master.tenant_identity_provider` | update | ddl | server/db/ddl/master/01w_tables_tenant_identity_registry.sql | 124 |
| `master.tenant_identity_provider` | insert | runtime | server/packages/services/iam/providers/tenant-identity-provider.service.ts | 103 |
| `master.tenant_identity_provider` | update | runtime | server/packages/services/iam/providers/tenant-identity-provider.service.ts | 147, 184, 202 |
| `master.access_grant` | insert | route | server/packages/services/iam/routes/operator.routes.ts | 566 |
| `master.access_grant` | update | route | server/packages/services/iam/routes/operator.routes.ts | 623 |
| `master.attachment_acl` | delete | route | server/packages/services/content/routes/content.route.ts | 1361 |
| `master.attachment_acl` | insert | route | server/packages/services/content/routes/content.route.ts | 1328 |
| `master.business_network` | insert | seed | server/db/seed/tenants/neon/010_demo/network/001_buyer_networks.sql | 29 |
| `master.business_network` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/001_buyer_networks.sql | 22 |
| `master.business_network` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/001_buyer_networks.sql | 22 |
| `master.business_network_membership` | insert | seed | server/db/seed/tenants/neon/010_demo/network/001_buyer_networks.sql | 40 |
| `master.business_network_membership` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/001_buyer_networks.sql | 31 |
| `master.business_network_membership` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/001_buyer_networks.sql | 31 |
| `master.business_network_membership_role` | insert | seed | server/db/seed/tenants/neon/010_demo/network/001_buyer_networks.sql | 51 |
| `master.business_network_membership_role` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/001_buyer_networks.sql | 40 |
| `master.business_network_membership_role` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/001_buyer_networks.sql | 40 |
| `master.company_code_access` | delete | runtime | server/packages/services/iam/permission/company-code-scope.service.ts | 104, 148 |
| `master.company_code_access` | insert | runtime | server/packages/services/iam/permission/company-code-scope.service.ts | 112 |
| `master.company_code_access` | delete | route | server/packages/services/iam/routes/company-code-access.routes.ts | 281, 330 |
| `master.company_code_access` | insert | route | server/packages/services/iam/routes/company-code-access.routes.ts | 290 |
| `master.content_item_access_grant` | delete | route | server/packages/services/content/routes/content.route.ts | 800 |
| `master.content_item_access_grant` | insert | route | server/packages/services/content/routes/content.route.ts | 781 |
| `master.delegation_grant` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/003_demo_delegation_grants.sql | 67 |
| `master.delegation_grant` | insert | route | server/packages/services/iam/routes/mfa.routes.ts | 513 |
| `master.delegation_grant` | update | route | server/packages/services/iam/routes/mfa.routes.ts | 580 |
| `master.delegation_grant` | insert | route | server/packages/services/iam/routes/operator.routes.ts | 698 |
| `master.delegation_grant` | update | route | server/packages/services/iam/routes/operator.routes.ts | 753 |
| `shared.permission` | insert | seed | server/db/seed/blueprints/modules/ap_non_po/090_entity_operations_delta.sql | 17 |
| `shared.permission` | insert | seed | server/db/seed/platform/002_permission_model/017_permission.sql | 10 |
| `shared.permission` | insert | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 7257, 8078, 8112, 8122 |
| `shared.permission` | insert | seed | server/db/seed/platform/003_control/044p6_p2p_entity_operation_contract.sql | 9 |
| `shared.permission` | insert | seed | server/db/seed/platform/003_control/046_control_entity_flow_contract.sql | 5, 21, 1515 |
| `shared.permission` | insert | seed | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 57 |
| `shared.permission_category` | insert | seed | server/db/seed/platform/002_permission_model/015_permission_category.sql | 3 |
| `shared.permission_category` | insert | seed | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 47 |
| `shared.permission_scope_policy` | insert | seed | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | 5, 36, 56 |
| `shared.persona` | insert | seed | server/db/seed/platform/002_permission_model/010_persona.sql | 3 |
| `shared.persona_permission` | insert | seed | server/db/seed/platform/002_permission_model/018_persona_permission.sql | 163 |
| `shared.persona_permission` | insert | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 7278, 8135 |
| `shared.plan_feature_access` | delete | ddl | server/db/ddl/shared/01_tables.sql | 984 |
| `shared.plan_feature_access` | insert | seed | server/db/seed/platform/002_permission_model/016_plan_module_access.sql | 61 |
| `shared.plan_feature_access` | delete | route | server/packages/services/platform/routes/commerce.route.ts | 882 |
| `shared.plan_feature_access` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 835 |
| `shared.plan_module_access` | delete | ddl | server/db/ddl/shared/01_tables.sql | 956 |
| `shared.plan_module_access` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 159 |
| `shared.plan_module_access` | insert | seed | server/db/seed/platform/002_permission_model/016_plan_module_access.sql | 33 |
| `shared.plan_module_access` | delete | route | server/packages/services/platform/routes/commerce.route.ts | 635 |
| `shared.plan_module_access` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 588 |
| `shared.plan_permission_access` | delete | ddl | server/db/ddl/shared/01_tables.sql | 970 |
| `shared.plan_permission_access` | delete | route | server/packages/services/platform/routes/commerce.route.ts | 759 |
| `shared.plan_permission_access` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 712 |
| `master.principal_persona` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/001_demo_principals.sql | 105 |
| `master.principal_persona` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_principal_users.sql | 301 |
| `master.principal_persona` | insert | runtime | server/packages/services/iam/jit/jit.service.ts | 307 |
| `master.principal_persona` | delete | runtime | server/packages/services/iam/persona-registry.service.ts | 180, 264 |
| `master.principal_persona` | insert | runtime | server/packages/services/iam/persona-registry.service.ts | 186 |
| `master.principal_persona` | insert | runtime | server/packages/services/shared/route-helpers.ts | 611, 654 |
| `shared.role` | insert | seed | server/db/seed/platform/002_permission_model/019_role.sql | 4 |
| `shared.role` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/003_operating_organization_rbac.sql | 20 |
| `master.tenant_admin_grant` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 101 |
| `master.tenant_admin_grant` | insert | seed | server/db/seed/tenants/admin/999_tenant_admin_grants.sql | 31 |
| `master.tenant_admin_grant` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/003_admin_plane_bindings.sql | 75 |
| `master.tenant_admin_grant` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/003_admin_plane_bindings.sql | 52 |
| `master.tenant_feature_entitlement` | delete | route | server/packages/services/platform/routes/commerce.route.ts | 1132 |
| `master.tenant_feature_entitlement` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 1089 |
| `master.tenant_module_subscription` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 164 |
| `master.tenant_module_subscription` | insert | seed | server/db/seed/tenants/neon/010_demo/800_subscriptions/001_demo_module_subscriptions.sql | 7 |
| `master.tenant_module_subscription` | insert | seed | server/db/seed/tenants/neon/020_technostat/800_subscriptions/001_module_subscriptions.sql | 24 |
| `master.tenant_module_subscription` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/800_subscriptions/001_module_subscriptions.sql | 24 |
| `master.tenant_module_subscription` | delete | route | server/packages/services/platform/routes/commerce.route.ts | 1052 |
| `master.tenant_module_subscription` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 1007 |
| `master.tenant_permission_override` | delete | route | server/packages/services/platform/routes/commerce.route.ts | 1209 |
| `master.tenant_permission_override` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 1165 |
| `mesh.network_account` | update | ddl | server/db/ddl/mesh/01a_foundation_tables.sql | 254 |
| `mesh.network_account` | update | ddl | server/db/ddl/mesh/09_streamline.sql | 121, 169 |
| `mesh.network_account` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 274 |
| `mesh.network_account` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 150 |
| `mesh.network_account` | insert | seed | server/db/seed/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 48 |
| `mesh.account_grant` | insert | ddl | server/db/ddl/mesh/01a_foundation_tables.sql | 344 |
| `mesh.account_grant` | update | ddl | server/db/ddl/mesh/01z_account_grant_fingerprint.sql | 61 |
| `mesh.account_grant` | insert | seed | server/db/seed/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 145 |
| `mesh.account_grant` | insert | route | server/packages/services/metadata/routes/admin-partner-bindings.route.ts | 211 |
| `mesh.account_grant` | update | route | server/packages/services/metadata/routes/admin-partner-bindings.route.ts | 267 |
| `mesh_log.authorization_projection_checkpoint` | insert | ddl | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql | 206 |
| `mesh_log.authorization_projection_checkpoint` | update | ddl | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql | 937 |
| `mesh_log.authorization_capture_clock` | insert | ddl | server/db/ddl/mesh_log/01z_authorization_change_capture.sql | 39 |
| `mesh_log.authorization_capture_clock` | update | ddl | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql | 246 |
| `mesh_log.authorization_capture_clock` | update | tool | server/db/scripts/verify/verify-mesh-authorization-change-capture.ts | 221 |
| `mesh_log.authorization_change_event` | insert | ddl | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql | 295 |
| `mesh_log.authorization_change_event` | insert | tool | server/db/scripts/verify/verify-mesh-authorization-change-capture.ts | 233 |
| `mesh_control.authorization_migration_run` | update | ddl | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql | 950 |
| `mesh_log.authorization_snapshot_marker` | insert | ddl | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql | 529 |
| `mesh_control.authorization_capture_source` | insert | test | scripts/policy/authorization-inventory.test.ts | 298 |
| `mesh_control.authorization_capture_source` | insert | ddl | server/db/ddl/mesh_control/01z_authorization_migration_controls.sql | 368 |
| `mesh_log.authorization_change_transaction` | insert | ddl | server/db/ddl/mesh_log/05z_authorization_change_capture_functions.sql | 266 |
| `mesh.principal_identity_binding` | insert | tool | server/db/scripts/migrate/migrate-preserved-identities.ts | 241 |
| `mesh.principal_identity_binding` | insert | seed | server/db/seed/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 125 |
| `mesh.principal_identity_binding` | insert | runtime | server/packages/services/iam/session/session.service.ts | 192 |
| `mesh.principal_identity_binding` | update | runtime | server/packages/services/jobs/workers/kc-sync.worker.ts | 404, 444 |
| `mesh.principal` | insert | tool | server/db/scripts/migrate/migrate-preserved-identities.ts | 229 |
| `mesh.principal` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 153 |
| `mesh.principal` | insert | tool | server/db/scripts/verify/verify-authorization-v2-wave6.ts | 125 |
| `mesh.principal` | insert | seed | server/db/seed/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 107 |
| `mesh.principal` | insert | runtime | server/packages/services/iam/session/session.service.ts | 181 |
| `mesh.principal` | update | runtime | server/packages/services/jobs/workers/kc-sync.worker.ts | 423 |
| `mesh.network_relationship` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 157 |
| `mesh.network_relationship` | insert | seed | server/db/seed/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 153 |
| `control.entity` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 63 |
| `control.entity` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 134 |
| `control.entity` | insert | seed | server/db/seed/platform/003_control/040_control_entity_contract.sql | 518 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/040_control_entity_contract.sql | 627, 649, 660 |
| `control.entity` | insert | seed | server/db/seed/platform/003_control/040a_control_all_schema_entity_coverage_contract.sql | 336 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/040a_control_all_schema_entity_coverage_contract.sql | 618, 657 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/042_control_entity_field_contract.sql | 1049, 5172, 5186, 5200, 5217 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/042c_commitment_contract.sql | 458, 648, 1008 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 153, 232, 259, 338 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/042i_po_purchase_order_contract.sql | 60, 509, 668 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/042j_document_create_flow_contract.sql | 15, 52 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/042p_p2p_foundation_contract.sql | 117, 153, 271 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/043_control_entity_relation_contract.sql | 620 |
| `control.entity` | delete | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 468, 5734 |
| `control.entity` | insert | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 232, 480, 501 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 4494, 4939, 5780, 5809, 6294, 9756, 9768, 9809 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/044b_site_warehouse_contract.sql | 16, 31 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/046_control_entity_flow_contract.sql | 1462, 1779 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/091_control_print_contract.sql | 73, 93 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 148 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/099_sourcing_meta_entity_contract.sql | 14 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/100_sales_meta_entity_contract.sql | 9 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/105_finance_stage7_ui_contract.sql | 129 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql | 118, 201 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/107_finance_phase2_stage_c_tax_contract.sql | 21 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/108_finance_phase2_stage_d_payments_contract.sql | 5 |
| `control.entity` | update | seed | server/db/seed/platform/003_control/109_finance_phase2_stage_e_banking_contract.sql | 5 |
| `control.entity` | update | seed | server/db/seed/tenants/neon/010_demo/002_bank_account_display_fix.sql | 19 |
| `control.entity` | update | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 198 |
| `control.entity` | update | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 1346 |
| `control.entity_action_rule` | insert | seed | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 1872 |
| `control.entity_action_rule` | delete | seed | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 20 |
| `control.entity_action_rule` | insert | seed | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 22 |
| `control.entity_action_rule` | insert | seed | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 462, 551 |
| `control.entity_action_rule` | delete | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 480 |
| `control.entity_action_rule` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 676 |
| `control.entity_field` | insert | seed | server/db/seed/platform/003_control/042_control_entity_field_contract.sql | 63, 230, 272, 321, 356, 384, 448, 676, 743, 879, 1102, 1148, 1284, 1400, 1460, 1508, 1567, 1615, 1717, 1825, 1924, 1980, 2070, 2116, 2221, 2277, 2336, 2398, 2512, 2581, 2649, 2724, 2798, 2859, 2951, 3016, 3118, 3186, 3438, 3534, 4058, 4161, 4296, 4639, 4701, 4948, 4997, 5072, 5242, 5467 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/042_control_entity_field_contract.sql | 637, 652, 803, 821, 861, 933, 946, 959, 989, 1081, 1204, 1216, 1231, 1268, 1329, 1365, 1382, 1444, 1662, 1682, 1701, 1783, 1870, 1890, 1902, 2025, 2047, 2059, 2161, 2172, 2186, 2454, 2463, 2472, 2481, 2491, 2694, 2769, 2843, 2903, 2937, 3095, 3249, 3261, 3273, 3289, 3311, 3333, 3357, 3370, 3384, 3396, 3414, 3494, 3514, 3582, 3615, 3649, 3685, 3717, 3745, 3775, 3794, 3824, 3843, 3879, 3902, 3934, 3953, 3971, 3999, 4020, 4044, 4107, 4122, 4136, 4214, 4234, 4255, 4277, 4395, 4407, 4422, 4474, 4543, 4573, 4622, 4794, 4831, 4893, 4912, 4930, 5046, 5304, 5319, 5340, 5361, 5382, 5404, 5426, 5451, 5510, 5542, 5569, 5588, 5614 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/042c_commitment_contract.sql | 17, 54, 100, 123, 140, 172, 228, 269, 294, 321, 348, 385, 413, 559, 598, 1084 |
| `control.entity_field` | insert | seed | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 555, 754, 1508 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 438, 470, 860, 914, 1022, 1077, 1119, 1152, 1196, 1231, 1264, 1284, 1298, 1563, 1609, 1622, 1640, 1670, 1698, 1715, 1740, 1965, 1986, 2007, 2037, 2078, 2124 |
| `control.entity_field` | insert | seed | server/db/seed/platform/003_control/042e_control_projection_alias_contract.sql | 14 |
| `control.entity_field` | insert | seed | server/db/seed/platform/003_control/042i_po_purchase_order_contract.sql | 72 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/042i_po_purchase_order_contract.sql | 28, 188, 213, 265, 301, 325, 361, 382, 399, 420, 442, 472, 490, 528, 550, 580, 616, 643 |
| `control.entity_field` | insert | seed | server/db/seed/platform/003_control/042p_p2p_foundation_contract.sql | 581, 674 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/042p_p2p_foundation_contract.sql | 329, 566, 758, 786, 857, 1454 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/043_control_entity_relation_contract.sql | 742, 783 |
| `control.entity_field` | insert | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 329, 394, 598, 616, 638, 666, 692, 718, 736, 754, 771, 788, 807, 838, 883, 910, 941, 989, 1040, 1090, 1119, 1145, 1171, 1194, 1220, 1252, 1280, 1305, 1331, 1357, 1382, 1405, 1431, 1456, 1481, 1506, 1532, 1561, 1587, 1613, 1648, 1681, 1718, 1744, 1769, 1794, 1819, 1843, 1867, 1891, 1915, 1946, 1968, 1992, 2016, 2041, 2067, 2092, 2117, 2151, 2179, 2211, 2236, 2281, 2306, 2337, 2363, 2387, 2418, 2443, 2476, 2509, 2551, 2580, 2605, 2627, 2662, 2697, 2726, 2761, 2798, 2840, 2868, 2901, 2930, 2958, 3011, 3041, 3073, 3099, 3127, 3154, 3216, 3245, 3274, 3313, 3351, 3389, 3429, 3460, 3490, 3521, 3553, 3593, 3621, 3649, 3692, 3743, 3792, 3820, 3853, 3904, 3935, 3960, 3991, 4018, 4049, 4078, 4107, 4133, 4310, 4783, 5742, 5794, 9697, 9729, 9780 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 2263, 2532, 2692, 2987, 3178, 3770, 3778, 3874, 4443, 4476, 4903, 4922, 5112, 5147, 5195, 5248, 5281, 5333, 5349, 5365, 5396, 5405, 5442, 5544, 5590, 5651, 5688, 5820, 5844, 5853, 5866, 5875, 5891, 5900, 5909, 5918, 5927, 5940, 5949, 5965, 5974, 5983, 5992, 6003, 6014, 6027, 6038, 6050, 6059, 6072, 6083, 6095, 6104, 6113, 6122, 6133, 6142, 6154, 6163, 6172, 6183, 6195, 6207, 6219, 6228, 6240, 6249, 6261, 6273, 6282, 6300, 6455, 6474, 9827, 9859, 9889 |
| `control.entity_field` | insert | seed | server/db/seed/platform/003_control/044b_site_warehouse_contract.sql | 61, 177 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/044b_site_warehouse_contract.sql | 211, 232, 300, 345, 372, 540 |
| `control.entity_field` | insert | seed | server/db/seed/platform/003_control/045_control_entity_field_data_type_normalization_contract.sql | 139 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/045_control_entity_field_data_type_normalization_contract.sql | 228, 254, 265, 281, 298, 335, 363, 392 |
| `control.entity_field` | insert | seed | server/db/seed/platform/003_control/046_control_entity_flow_contract.sql | 1332, 1831, 2142, 2612 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/046_control_entity_flow_contract.sql | 1347, 1847, 2152, 2685, 2710 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/091_control_print_contract.sql | 116 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/099b_control_runtime_contract_repair.sql | 61, 97 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/101_control_meta_entity_contract_v2.sql | 115 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/102_meta_entity_contract_v2_pilots.sql | 139, 156, 186, 199, 216, 248, 260 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/104_control_entity_field_semantic_metadata_repair.sql | 11, 28, 97, 119, 178, 197, 223, 239, 253, 260 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/105_finance_stage7_ui_contract.sql | 149 |
| `control.entity_field` | insert | seed | server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql | 27, 75, 107 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql | 154, 225, 241, 263 |
| `control.entity_field` | delete | seed | server/db/seed/platform/003_control/107_finance_phase2_stage_c_tax_contract.sql | 6 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/107_finance_phase2_stage_c_tax_contract.sql | 40 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/108_finance_phase2_stage_d_payments_contract.sql | 22 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/109_finance_phase2_stage_e_banking_contract.sql | 15, 21, 28 |
| `control.entity_field` | update | seed | server/db/seed/platform/003_control/999_control_catalog_field_cleanup.sql | 9, 31 |
| `control.entity_field` | delete | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 1477, 1483 |
| `control.entity_field` | insert | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 425, 1180 |
| `control.entity_field` | delete | test | server/packages/services/metadata/src/__tests__/studio-contract-v2-wiring.test.ts | 42 |
| `control.entity_field` | delete | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 494 |
| `control.entity_field` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 547 |
| `control.entity_flow` | insert | seed | server/db/seed/platform/003_control/042j_document_create_flow_contract.sql | 162, 229 |
| `control.entity_flow` | insert | seed | server/db/seed/platform/003_control/046_control_entity_flow_contract.sql | 71, 522, 733, 859, 1028, 1119, 1207, 1568, 1856, 2168, 2293, 2989 |
| `control.entity_flow` | update | seed | server/db/seed/platform/003_control/046_control_entity_flow_contract.sql | 102, 1477, 1485, 1602, 1883, 2198, 2322, 2436, 3023, 3236 |
| `control.entity_flow` | delete | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 1392, 1399 |
| `control.entity_flow` | insert | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 1374 |
| `control.entity_flow` | update | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 382 |
| `control.entity_flow` | insert | test | server/packages/services/metadata/src/__tests__/studio-contract-v2-wiring.test.ts | 37 |
| `control.entity_flow` | delete | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 479 |
| `control.entity_flow` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 886 |
| `control.entity_flow_step` | insert | seed | server/db/seed/platform/003_control/042j_document_create_flow_contract.sql | 203, 274 |
| `control.entity_flow_step` | delete | seed | server/db/seed/platform/003_control/046_control_entity_flow_contract.sql | 3329 |
| `control.entity_flow_step` | insert | seed | server/db/seed/platform/003_control/046_control_entity_flow_contract.sql | 126, 554, 762, 880, 1049, 1140, 1228, 1631, 1911, 2222, 2345, 3060 |
| `control.entity_flow_step` | update | seed | server/db/seed/platform/003_control/046_control_entity_flow_contract.sql | 141, 144, 148, 568, 571, 772, 1380, 1906, 2217, 2340, 2599, 3242 |
| `control.entity_flow_step` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 907 |
| `control.entity_lifecycle` | update | seed | server/db/seed/platform/003_control/030_control_lifecycle_contract.sql | 1319 |
| `control.entity_lifecycle` | delete | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 5727 |
| `control.entity_lifecycle` | insert | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 367 |
| `control.entity_lifecycle` | delete | seed | server/db/seed/platform/003_control/045_control_entity_lifecycle_contract.sql | 391, 392 |
| `control.entity_lifecycle` | insert | seed | server/db/seed/platform/003_control/045_control_entity_lifecycle_contract.sql | 60, 65, 72, 83, 90, 96, 101, 107, 114, 123, 133, 139, 145, 153, 159, 166, 172, 179, 189, 196, 243, 292, 300, 308, 316, 324, 335, 349, 363, 372, 381, 396, 404, 412, 420, 428 |
| `control.entity_lifecycle` | insert | seed | server/db/seed/platform/003_control/099_sourcing_meta_entity_contract.sql | 68 |
| `control.entity_lifecycle` | insert | seed | server/db/seed/platform/003_control/100_sales_meta_entity_contract.sql | 42 |
| `control.entity_lifecycle` | delete | route | server/packages/services/metadata/routes/metadata-admin.route.ts | 681 |
| `control.entity_lifecycle` | insert | route | server/packages/services/metadata/routes/metadata-admin.route.ts | 625 |
| `control.entity_lifecycle` | update | route | server/packages/services/metadata/routes/metadata-admin.route.ts | 661 |
| `control.entity_lifecycle` | delete | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 277 |
| `control.entity_lifecycle` | insert | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 368 |
| `control.entity_lifecycle` | delete | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 482 |
| `control.entity_lifecycle` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 849 |
| `control.entity_lifecycle_state_mask` | delete | seed | server/db/seed/platform/003_control/046i_po_state_mask_contract.sql | 20 |
| `control.entity_lifecycle_state_mask` | insert | seed | server/db/seed/platform/003_control/046i_po_state_mask_contract.sql | 23 |
| `control.entity_lifecycle_state_mask` | insert | seed | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 1659 |
| `control.entity_lifecycle_state_mask` | insert | seed | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 100 |
| `control.entity_lifecycle_state_mask` | delete | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 481 |
| `control.entity_lifecycle_state_mask` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 863 |
| `control.entity_operation` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 67 |
| `control.entity_operation` | insert | seed | server/db/seed/blueprints/modules/ap_non_po/090_entity_operations_delta.sql | 44 |
| `control.entity_operation` | update | seed | server/db/seed/blueprints/modules/ap_non_po/090_entity_operations_delta.sql | 34 |
| `control.entity_operation` | delete | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 421, 5720, 7931, 9682, 9918 |
| `control.entity_operation` | insert | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 371, 6512, 6545, 6583, 6617, 6650, 6682, 6715, 6747, 6781, 6813, 6852, 6913, 6949, 6984, 7032, 7066, 7102, 7139, 7177, 7214, 7307, 7415, 7480, 7534, 7582, 7634, 7650, 7685, 7719, 7752, 7790, 7820, 7854, 7891, 7937, 7971, 8019, 8090, 8258, 8309, 8348, 8383, 8417, 8451, 8486, 8523, 8559, 8593, 8642, 8677, 8737, 8775, 8812, 8849, 8883, 8917, 8975, 9018, 9060, 9092, 9123, 9156, 9189, 9223, 9264, 9305, 9370, 9404, 9439, 9481, 9522, 9555, 9601, 9637, 9955 |
| `control.entity_operation` | update | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 7351, 7365, 7392, 7468, 7515, 7616, 8003, 8048, 8098, 8176, 8197, 8229, 9938 |
| `control.entity_operation` | insert | seed | server/db/seed/platform/003_control/044b_site_warehouse_contract.sql | 443, 481 |
| `control.entity_operation` | insert | seed | server/db/seed/platform/003_control/044p6_p2p_entity_operation_contract.sql | 49 |
| `control.entity_operation` | insert | seed | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 243 |
| `control.entity_operation` | update | seed | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 333 |
| `control.entity_operation` | delete | seed | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 24 |
| `control.entity_operation` | update | seed | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 37 |
| `control.entity_operation` | insert | seed | server/db/seed/platform/003_control/099_sourcing_meta_entity_contract.sql | 110 |
| `control.entity_operation` | update | seed | server/db/seed/platform/003_control/099b_control_runtime_contract_repair.sql | 15 |
| `control.entity_operation` | insert | seed | server/db/seed/platform/003_control/100_sales_meta_entity_contract.sql | 76 |
| `control.entity_operation` | update | seed | server/db/seed/platform/003_control/101_control_meta_entity_contract_v2.sql | 176 |
| `control.entity_operation` | update | seed | server/db/seed/platform/003_control/102_meta_entity_contract_v2_pilots.sql | 371 |
| `control.entity_operation` | delete | seed | server/db/seed/platform/003_control/105_finance_stage7_ui_contract.sql | 12, 31 |
| `control.entity_operation` | insert | seed | server/db/seed/platform/003_control/105_finance_stage7_ui_contract.sql | 59 |
| `control.entity_operation` | delete | seed | server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql | 143, 150, 168 |
| `control.entity_operation` | insert | seed | server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql | 172 |
| `control.entity_operation` | delete | route | server/packages/services/metadata/routes/metadata-admin.route.ts | 904 |
| `control.entity_operation` | insert | route | server/packages/services/metadata/routes/metadata-admin.route.ts | 822 |
| `control.entity_operation` | update | route | server/packages/services/metadata/routes/metadata-admin.route.ts | 884 |
| `control.entity_operation` | delete | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 1445, 1451 |
| `control.entity_operation` | insert | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 508, 1342 |
| `control.entity_operation` | delete | test | server/packages/services/metadata/src/__tests__/studio-contract-v2-wiring.test.ts | 40 |
| `control.entity_operation` | delete | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 491 |
| `control.entity_operation` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 651 |
| `control.entity_policy` | insert | seed | server/db/seed/tenants/neon/010_demo/entity_engine/010_entity_policies.sql | 40, 69 |
| `control.entity_policy` | update | seed | server/db/seed/tenants/neon/010_demo/entity_engine/010_entity_policies.sql | 82 |
| `control.entity_policy` | insert | seed | server/db/seed/tenants/neon/020_technostat/entity_engine/001_entity_policies.sql | 44, 74 |
| `control.entity_policy` | update | seed | server/db/seed/tenants/neon/020_technostat/entity_engine/001_entity_policies.sql | 87 |
| `control.entity_policy` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/entity_engine/001_entity_policies.sql | 44, 74 |
| `control.entity_policy` | update | seed | server/db/seed/tenants/neon/030_cirrusatlantic/entity_engine/001_entity_policies.sql | 87 |
| `control.entity_policy` | delete | route | server/packages/services/metadata/routes/metadata-admin.route.ts | 1492 |
| `control.entity_policy` | insert | route | server/packages/services/metadata/routes/metadata-admin.route.ts | 1418 |
| `control.entity_policy` | update | route | server/packages/services/metadata/routes/metadata-admin.route.ts | 1471 |
| `control.entity_policy` | insert | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 1275 |
| `control.entity_relation` | insert | seed | server/db/seed/platform/003_control/042j_document_create_flow_contract.sql | 88 |
| `control.entity_relation` | update | seed | server/db/seed/platform/003_control/042j_document_create_flow_contract.sql | 147 |
| `control.entity_relation` | delete | seed | server/db/seed/platform/003_control/043_control_entity_relation_contract.sql | 326 |
| `control.entity_relation` | insert | seed | server/db/seed/platform/003_control/043_control_entity_relation_contract.sql | 18, 369, 413, 496 |
| `control.entity_relation` | update | seed | server/db/seed/platform/003_control/043_control_entity_relation_contract.sql | 343, 586, 636 |
| `control.entity_relation` | update | seed | server/db/seed/platform/003_control/044b_site_warehouse_contract.sql | 389, 407, 424 |
| `control.entity_relation` | insert | seed | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 45 |
| `control.entity_relation` | update | seed | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 189 |
| `control.entity_relation` | insert | seed | server/db/seed/platform/003_control/099_sourcing_meta_entity_contract.sql | 82 |
| `control.entity_relation` | insert | seed | server/db/seed/platform/003_control/100_sales_meta_entity_contract.sql | 51 |
| `control.entity_relation` | update | seed | server/db/seed/platform/003_control/101_control_meta_entity_contract_v2.sql | 144 |
| `control.entity_relation` | update | seed | server/db/seed/platform/003_control/102_meta_entity_contract_v2_pilots.sql | 116 |
| `control.entity_relation` | insert | seed | server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql | 300 |
| `control.entity_relation` | update | seed | server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql | 289 |
| `control.entity_relation` | insert | seed | server/db/seed/platform/003_control/107_finance_phase2_stage_c_tax_contract.sql | 67 |
| `control.entity_relation` | insert | seed | server/db/seed/platform/003_control/108_finance_phase2_stage_d_payments_contract.sql | 45 |
| `control.entity_relation` | delete | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 1461, 1467 |
| `control.entity_relation` | insert | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 445, 1224 |
| `control.entity_relation` | delete | test | server/packages/services/metadata/src/__tests__/studio-contract-v2-wiring.test.ts | 41 |
| `control.entity_relation` | delete | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 493 |
| `control.entity_relation` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 574 |
| `control.entity_surface` | insert | seed | server/db/seed/platform/003_control/092_control_entity_surface_contract.sql | 240, 339, 421 |
| `control.entity_surface` | update | seed | server/db/seed/platform/003_control/101_control_meta_entity_contract_v2.sql | 158 |
| `control.entity_surface` | delete | seed | server/db/seed/platform/003_control/102_meta_entity_contract_v2_pilots.sql | 285 |
| `control.entity_surface` | insert | seed | server/db/seed/platform/003_control/102_meta_entity_contract_v2_pilots.sql | 319 |
| `control.entity_surface` | delete | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 1429, 1435 |
| `control.entity_surface` | insert | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 465, 1296 |
| `control.entity_surface` | delete | test | server/packages/services/metadata/src/__tests__/studio-contract-v2-wiring.test.ts | 39 |
| `control.entity_surface` | delete | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 492 |
| `control.entity_surface` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 598 |
| `control.entity_version` | update | ddl | server/db/ddl/control/01zz_meta_entity_contract_m1.sql | 30, 62 |
| `control.entity_version` | update | tool | server/db/scripts/verify/verify-effective-lock-scenarios.ts | 108, 132, 190 |
| `control.entity_version` | insert | seed | server/db/seed/platform/003_control/041_control_entity_version_contract.sql | 5, 15, 24, 36, 48, 60, 72, 83, 94, 105, 116, 127, 138, 149, 160, 171, 183, 195, 207, 223, 235, 251, 263, 274, 285, 297, 313, 324, 335, 346, 357, 369, 382, 403, 415, 502, 540, 594, 633 |
| `control.entity_version` | update | seed | server/db/seed/platform/003_control/041_control_entity_version_contract.sql | 443, 617 |
| `control.entity_version` | insert | seed | server/db/seed/platform/003_control/042p_p2p_foundation_contract.sql | 301 |
| `control.entity_version` | insert | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 524 |
| `control.entity_version` | update | seed | server/db/seed/platform/003_control/046_control_entity_flow_contract.sql | 1766 |
| `control.entity_version` | insert | seed | server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql | 11 |
| `control.entity_version` | update | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 1136 |
| `control.entity_version` | insert | route | server/packages/services/metadata/routes/studio-version.route.ts | 223 |
| `control.entity_version` | update | route | server/packages/services/metadata/routes/studio-version.route.ts | 309, 339, 455, 466, 545 |
| `control.entity_version` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 1162, 1510 |
| `control.entity_version` | update | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 976, 1049, 1089, 1330, 1335 |
| `control.entity_version_contract` | insert | seed | server/db/seed/platform/003_control/041_control_entity_version_contract.sql | 656 |
| `control.entity_version_contract` | insert | seed | server/db/seed/platform/003_control/101_control_meta_entity_contract_v2.sql | 9 |
| `control.entity_version_contract` | update | seed | server/db/seed/platform/003_control/102_meta_entity_contract_v2_pilots.sql | 26 |
| `control.entity_version_contract` | update | seed | server/db/seed/platform/003_control/103_meta_entity_contract_v2_identity_repair.sql | 5 |
| `control.entity_version_contract` | update | seed | server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql | 211 |
| `control.entity_version_contract` | insert | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 407 |
| `control.entity_version_contract` | update | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 1161 |
| `control.entity_version_contract` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 498 |
| `control.field_security_policy` | insert | seed | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 614 |
| `control.field_security_policy` | insert | seed | server/db/seed/tenants/neon/010_demo/entity_engine/020_field_security_policies.sql | 45, 59, 73, 83, 94, 105, 116 |
| `control.lifecycle` | update | ddl | server/db/ddl/control/05_functions.sql | 324, 346 |
| `control.lifecycle` | insert | seed | server/db/seed/platform/003_control/030_control_lifecycle_contract.sql | 16, 59, 108, 163, 225, 280, 339, 401, 455, 511, 566, 628, 676, 729, 782, 842, 897, 955, 1008, 1063, 1118, 1281, 1342, 1399, 1470, 1537, 1611, 1690 |
| `control.lifecycle` | update | seed | server/db/seed/platform/003_control/030_control_lifecycle_contract.sql | 1270, 1792 |
| `control.lifecycle` | insert | seed | server/db/seed/platform/003_control/030p_p2p_lifecycle_contract.sql | 12, 70, 120, 171, 220 |
| `control.lifecycle` | insert | seed | server/db/seed/platform/003_control/060_control_workflow_contract.sql | 17 |
| `control.lifecycle` | insert | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 287 |
| `control.lifecycle` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 782 |
| `control.lifecycle` | delete | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 523 |
| `control.lifecycle` | insert | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 353 |
| `control.lifecycle_state` | insert | seed | server/db/seed/platform/003_control/030_control_lifecycle_contract.sql | 25, 69, 117, 172, 234, 289, 348, 410, 464, 520, 575, 637, 685, 738, 791, 851, 906, 964, 1017, 1072, 1127, 1186, 1290, 1351, 1408, 1479, 1562, 1620, 1698 |
| `control.lifecycle_state` | update | seed | server/db/seed/platform/003_control/030_control_lifecycle_contract.sql | 1549, 1574, 1818, 1828, 1838, 1850, 1863, 1881 |
| `control.lifecycle_state` | insert | seed | server/db/seed/platform/003_control/030p_p2p_lifecycle_contract.sql | 20, 78, 128, 179, 228 |
| `control.lifecycle_state` | insert | seed | server/db/seed/platform/003_control/060_control_workflow_contract.sql | 26 |
| `control.lifecycle_state` | insert | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 310 |
| `control.lifecycle_state` | insert | test | server/packages/services/metadata/src/__tests__/studio-contract-v2-wiring.test.ts | 30 |
| `control.lifecycle_state` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 808 |
| `control.lifecycle_state` | delete | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 522 |
| `control.lifecycle_state` | insert | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 368, 387 |
| `control.lifecycle_transition` | insert | seed | server/db/seed/platform/003_control/030_control_lifecycle_contract.sql | 38, 85, 136, 194, 253, 309, 370, 430, 486, 539, 597, 653, 704, 757, 813, 870, 928, 983, 1036, 1091, 1147, 1215, 1236, 1305, 1366, 1431, 1499, 1582, 1641, 1751 |
| `control.lifecycle_transition` | insert | seed | server/db/seed/platform/003_control/030p_p2p_lifecycle_contract.sql | 36, 93, 143, 193, 244 |
| `control.lifecycle_transition` | insert | seed | server/db/seed/platform/003_control/060_control_workflow_contract.sql | 44 |
| `control.lifecycle_transition` | insert | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 352 |
| `control.lifecycle_transition` | insert | test | server/packages/services/metadata/src/__tests__/studio-contract-v2-wiring.test.ts | 31 |
| `control.lifecycle_transition` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 828 |
| `control.lifecycle_transition` | delete | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 521 |
| `control.lifecycle_transition` | insert | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 406 |
| `control.permission_alias` | insert | seed | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 6 |
| `event.authorization_capture_clock` | insert | ddl | server/db/ddl/event/01g_authorization_change_capture.sql | 41 |
| `event.authorization_capture_clock` | update | ddl | server/db/ddl/event/05_authorization_change_capture_functions.sql | 206 |
| `event.authorization_capture_clock` | update | tool | server/db/scripts/verify/verify-authorization-change-capture.ts | 75 |
| `control.authorization_capture_source` | insert | test | scripts/policy/authorization-inventory.test.ts | 247, 261, 265, 279 |
| `control.authorization_capture_source` | insert | ddl | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 294 |
| `event.authorization_change_event` | insert | ddl | server/db/ddl/event/05_authorization_change_capture_functions.sql | 253 |
| `event.authorization_change_transaction` | insert | ddl | server/db/ddl/event/05_authorization_change_capture_functions.sql | 226 |
| `event.authorization_projection_checkpoint` | insert | ddl | server/db/ddl/event/05_authorization_v2_replay_functions.sql | 190 |
| `event.authorization_projection_checkpoint` | update | ddl | server/db/ddl/event/05_authorization_v2_replay_functions.sql | 847 |
| `event.authorization_projection_checkpoint` | update | tool | server/db/scripts/verify/verify-authorization-v2-wave1.ts | 439 |
| `control.authorization_migration_run` | update | ddl | server/db/ddl/event/05_authorization_v2_replay_functions.sql | 861 |
| `event.authorization_snapshot_marker` | insert | ddl | server/db/ddl/event/05_authorization_change_capture_functions.sql | 478 |
| `control.feature_flag` | insert | seed | server/db/seed/platform/003_control/054_control_feature_flag_contract.sql | 1 |
| `control.feature_flag` | update | seed | server/db/seed/platform/003_control/110_finance_phase2_stage_f_rollout.sql | 4 |
| `control.feature_flag` | insert | seed | server/db/seed/platform/003_control/111_finance_fx_navigation_rollout.sql | 5 |
| `control.feature_flag` | insert | seed | server/db/seed/platform/003_control/112_finance_settings_directory_rollout.sql | 6 |
| `control.feature_flag` | insert | seed | server/db/seed/platform/003_control/113_unified_experience_rollout.sql | 14 |
| `master.atlas_support_session` | insert | runtime | server/packages/services/iam/support/sql-atlas-support-session.repository.ts | 46 |
| `master.atlas_support_session` | update | runtime | server/packages/services/iam/support/sql-atlas-support-session.repository.ts | 70 |
| `master.atlas_support_session_audit` | insert | runtime | server/packages/services/iam/support/sql-atlas-support-session.repository.ts | 77 |
| `mesh_control.auth_catalog_owner` | insert | ddl | server/db/ddl/mesh_control/01zz_authorization_v2_catalog.sql | 174 |
| `mesh_control.auth_catalog_owner` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 141 |
| `mesh_control.auth_permission` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 145 |
| `mesh_control.auth_permission` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 276 |
| `mesh_control.auth_permission` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 167 |
| `mesh_control.auth_permission_plane` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 282 |
| `mesh_control.auth_permission_plane` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 179 |
| `mesh_control.auth_plane` | insert | ddl | server/db/ddl/mesh_control/01zz_authorization_v2_catalog.sql | 47 |
| `mesh_control.auth_plane` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 138 |
| `mesh_control.authorization_v2_expand_installation` | insert | tool | server/db/scripts/install/install-mesh-authorization-v2-expand.ts | 275 |
| `mesh_control.authorization_v2_frozen_legacy_object` | insert | ddl | server/db/ddl/mesh_control/01zzz_authorization_v2_migration_state.sql | 147 |
| `mesh_control.entity` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 143 |
| `mesh_control.entity` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 161 |
| `mesh_control.entity_operation` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 147 |
| `mesh_control.entity_operation_plane` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 151 |
| `mesh_log.authorization_account_epoch_v2` | insert | ddl | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql | 215, 239 |
| `mesh_log.authorization_global_epoch_v2` | insert | ddl | server/db/ddl/mesh_log/01zz_authorization_v2_runtime.sql | 21 |
| `mesh_log.authorization_global_epoch_v2` | update | ddl | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql | 184 |
| `mesh_log.authorization_invalidation_outbox_v2` | insert | ddl | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql | 337 |
| `mesh_log.authorization_invalidation_outbox_v2` | update | ddl | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql | 409, 436, 479, 531, 585, 635 |
| `mesh_log.authorization_plane_epoch_v2` | insert | ddl | server/db/ddl/mesh_log/05_authorization_v2_invalidation_functions.sql | 253 |
| `mesh_log.authorization_v2_replay_application` | insert | ddl | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql | 691 |
| `mesh_log.authorization_v2_replay_application` | update | ddl | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql | 669, 922 |
| `mesh_log.authorization_v2_replay_binding` | insert | ddl | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql | 184 |
| `mesh_log.authorization_v2_replay_inbox` | insert | ddl | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql | 453 |
| `mesh_log.authorization_v2_replay_transaction` | insert | ddl | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql | 429 |
| `mesh_log.authorization_v2_replay_transaction` | update | ddl | server/db/ddl/mesh_log/05_authorization_v2_replay_functions.sql | 684, 929 |
| `mesh.account_entitlement_override` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 305 |
| `mesh.auth_delegation` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 243 |
| `mesh.auth_delegation_permission` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 367, 403 |
| `mesh.auth_deny_rule` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 336 |
| `mesh.auth_override` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 346 |
| `mesh.auth_permission_set` | update | ddl | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql | 414 |
| `mesh.auth_permission_set` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 200, 304 |
| `mesh.auth_permission_set_rule` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 203, 309 |
| `mesh.auth_plane_membership` | delete | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 443 |
| `mesh.auth_plane_membership` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 184 |
| `mesh.auth_record_acl` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 234, 381 |
| `mesh.auth_record_acl_permission` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 359, 393 |
| `mesh.auth_role` | update | ddl | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql | 620 |
| `mesh.auth_role` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 210, 316, 414 |
| `mesh.auth_role_compilation` | update | ddl | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql | 614 |
| `mesh.auth_role_compilation` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 216, 322, 420 |
| `mesh.auth_role_compilation` | update | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 435 |
| `mesh.auth_role_permission` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 224, 329 |
| `mesh.auth_scope_account` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 195 |
| `mesh.auth_scope_network_relationship` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 279 |
| `mesh.auth_scope_resource` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 293 |
| `mesh.auth_scope_target` | insert | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 191, 254, 262, 271, 288 |
| `mesh.auth_scope_target` | update | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 198 |
| `control.auth_catalog_owner` | insert | ddl | server/db/ddl/control/01zzp_authorization_v2_catalog.sql | 134 |
| `control.auth_catalog_owner` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 61 |
| `control.auth_catalog_owner` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 129 |
| `control.auth_permission` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 65 |
| `control.auth_permission` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 145 |
| `control.auth_permission` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 139 |
| `control.auth_permission_plane` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 149 |
| `control.auth_permission_plane` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 150 |
| `control.auth_plane` | insert | ddl | server/db/ddl/control/01zzp_authorization_v2_catalog.sql | 58 |
| `control.authorization_v2_deferred_constraint_registry` | insert | tool | server/db/scripts/install/install-authorization-v2-expand.ts | 467 |
| `control.authorization_v2_expand_installation` | insert | tool | server/db/scripts/install/install-authorization-v2-expand.ts | 591 |
| `control.authorization_v2_frozen_legacy_object` | insert | ddl | server/db/ddl/control/01zzr_authorization_v2_migration_state.sql | 120 |
| `control.authorization_v2_frozen_legacy_object` | update | tool | server/db/scripts/install/install-authorization-v2-expand.ts | 450 |
| `control.entity_operation_plane` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 71 |
| `event.authorization_global_epoch_v2` | insert | ddl | server/db/ddl/event/01h_authorization_v2_runtime.sql | 22 |
| `event.authorization_global_epoch_v2` | update | ddl | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql | 161 |
| `event.authorization_invalidation_outbox_v2` | insert | ddl | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql | 289 |
| `event.authorization_invalidation_outbox_v2` | update | ddl | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql | 361, 389, 471, 521, 571 |
| `event.authorization_plane_epoch_v2` | insert | ddl | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql | 223 |
| `event.authorization_tenant_epoch_v2` | insert | ddl | server/db/ddl/event/05_authorization_v2_invalidation_functions.sql | 184, 209 |
| `event.authorization_v2_replay_application` | insert | ddl | server/db/ddl/event/05_authorization_v2_replay_functions.sql | 625 |
| `event.authorization_v2_replay_application` | update | ddl | server/db/ddl/event/05_authorization_v2_replay_functions.sql | 602, 830 |
| `event.authorization_v2_replay_binding` | insert | ddl | server/db/ddl/event/05_authorization_v2_replay_functions.sql | 168 |
| `event.authorization_v2_replay_inbox` | insert | ddl | server/db/ddl/event/05_authorization_v2_replay_functions.sql | 423 |
| `event.authorization_v2_replay_transaction` | insert | ddl | server/db/ddl/event/05_authorization_v2_replay_functions.sql | 399 |
| `event.authorization_v2_replay_transaction` | update | ddl | server/db/ddl/event/05_authorization_v2_replay_functions.sql | 617, 838 |
| `master.auth_delegation` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 188 |
| `master.auth_delegation_permission` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 209, 265 |
| `master.auth_deny_rule` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 235 |
| `master.auth_override` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 245 |
| `master.auth_permission_set` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 163 |
| `master.auth_permission_set_rule` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 196, 218 |
| `master.auth_plane_membership` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave3-authority.mjs | 87 |
| `master.auth_record_acl` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 181, 279 |
| `master.auth_record_acl_permission` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 205, 257 |
| `master.auth_role` | update | ddl | server/db/ddl/master/05_authorization_v2_functions.sql | 877 |
| `master.auth_role` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 168 |
| `master.auth_role_compilation` | update | ddl | server/db/ddl/master/05_authorization_v2_functions.sql | 860, 868 |
| `master.auth_role_compilation` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 174 |
| `master.auth_role_permission` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 200, 226 |
| `master.auth_scope_target` | insert | tool | server/db/scripts/verify/smoke-neon-authorization-v2-catalog-ownership.mjs | 156 |
| `master.tenant_entitlement_override` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 185 |
| `mesh_control.auth_catalog_reference_v2` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 156 |
| `mesh_control.auth_permission_alias_v2` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 172 |
| `control.auth_catalog_reference_v2` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 85 |
| `control.auth_permission_alias_v2` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave2-catalog.mjs | 76, 101 |
| `mesh_control.authorization_v3_scope_mapping` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave3-authority.mjs | 184 |
| `mesh_control.authorization_v3_subject_mapping` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave3-authority.mjs | 197 |
| `control.authorization_v3_scope_mapping` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave3-authority.mjs | 121 |
| `control.authorization_v3_subject_mapping` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave3-authority.mjs | 92, 107 |
| `mesh.account_entitlement` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 258, 265, 287 |
| `control.auth_admin_entitlement_policy` | insert | ddl | server/db/ddl/control/01zzv_authorization_v4_entitlement_migration.sql | 78 |
| `control.authorization_v4_access_grant_disposition` | insert | tool | server/db/scripts/verify/smoke-authorization-v2-wave4-entitlement.mjs | 124 |
| `mesh_control.authorization_consumer_migration_v2` | insert | ddl | server/db/ddl/mesh_control/01zzw_authorization_v5_runtime.sql | 123 |
| `mesh_control.authorization_runtime_release_v2` | insert | ddl | server/db/ddl/mesh_control/01zzw_authorization_v5_runtime.sql | 101 |
| `control.authorization_consumer_migration_v2` | insert | ddl | server/db/ddl/control/01zzw_authorization_v5_runtime.sql | 139 |
| `control.authorization_runtime_release_v2` | insert | ddl | server/db/ddl/control/01zzw_authorization_v5_runtime.sql | 106 |
| `mesh_control.authorization_cutover_cohort_v2` | update | ddl | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql | 220 |
| `mesh_control.authorization_cutover_plane_v2` | insert | ddl | server/db/ddl/mesh_control/01zzy_authorization_v7_shadow_cutover.sql | 80 |
| `mesh_control.authorization_cutover_plane_v2` | update | ddl | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql | 128, 260, 358 |
| `mesh_control.authorization_target_guard_installation_v2` | insert | ddl | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql | 587 |
| `mesh_control.authorization_target_guard_installation_v2` | update | ddl | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql | 638 |
| `mesh_control.authorization_writer_switch_receipt_v2` | insert | ddl | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql | 374 |
| `control.authorization_cutover_cohort_v2` | update | ddl | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql | 232 |
| `control.authorization_cutover_plane_v2` | insert | ddl | server/db/ddl/control/01zzy_authorization_v7_shadow_cutover.sql | 89 |
| `control.authorization_cutover_plane_v2` | update | ddl | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql | 136, 282, 388 |
| `control.authorization_target_guard_installation_v2` | insert | ddl | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql | 643 |
| `control.authorization_target_guard_installation_v2` | update | ddl | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql | 695 |
| `control.authorization_writer_switch_receipt_v2` | insert | ddl | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql | 405 |
| `public.authorization_contraction_receipt_v2` | insert | runtime | server/db/migrations/contraction/mesh/001_authorization_v2_wave9_tombstone.sql | 126 |
| `public.authorization_contraction_receipt_v2` | insert | runtime | server/db/migrations/contraction/neon/001_authorization_v2_wave9_tombstone.sql | 167 |

## Keycloak REST writer inventory

| Path | Classification | Owner | Operations | Disposition | Lines |
|---|---|---|---|---|---|
| server/packages/services/iam/mfa/mfa-sync.service.ts | reviewed | platform-iam | `DELETE:user_credential` | retain_runtime_mfa_credential_revocation | 203 |
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
| `accept` | low | server/db/seed/platform/002_permission_model/017_permission.sql:168 |
| `accept_changes` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:162 |
| `add_attachment` | low | server/db/seed/platform/002_permission_model/017_permission.sql:91 |
| `add_comment` | low | server/db/seed/platform/002_permission_model/017_permission.sql:90 |
| `add_line` | low | server/db/seed/platform/002_permission_model/017_permission.sql:40 |
| `ADDRESS_CONTACT.COMPANY_CODE.MANAGE` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:118 |
| `ADDRESS_CONTACT.LEGAL_ENTITY.MANAGE` | high | server/db/seed/platform/002_permission_model/017_permission.sql:119 |
| `ADDRESS_CONTACT.TENANT.MANAGE` | high | server/db/seed/platform/002_permission_model/017_permission.sql:120 |
| `ai.agent.admin.support_session` | high | server/db/seed/platform/002_permission_model/017_permission.sql:130 |
| `ai.agent.feedback.submit` | low | server/db/seed/platform/002_permission_model/017_permission.sql:124 |
| `ai.agent.history.delete` | high | server/db/seed/platform/002_permission_model/017_permission.sql:127 |
| `ai.agent.history.export` | high | server/db/seed/platform/002_permission_model/017_permission.sql:128 |
| `ai.agent.history.manage` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:126 |
| `ai.agent.history.read` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:125 |
| `ai.agent.provider_diagnostics` | high | server/db/seed/platform/002_permission_model/017_permission.sql:123 |
| `ai.agent.tools.read` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:129 |
| `ai.agent.use` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:122 |
| `ai.calibrate_thresholds` | high | server/db/seed/platform/002_permission_model/017_permission.sql:133 |
| `ai.review_ai_output` | low | server/db/seed/platform/002_permission_model/017_permission.sql:132 |
| `ai.use_extraction` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:131 |
| `amend` | low | server/db/seed/platform/002_permission_model/017_permission.sql:46 |
| `ap.override_tax_mode` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:70 |
| `ap.promote_proforma` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:71 |
| `ap.run_matching` | low | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql:7265 |
| `approve` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:53 |
| `attachment.create` | low | server/db/seed/platform/002_permission_model/017_permission.sql:93 |
| `attachment.delete` | high | server/db/seed/platform/002_permission_model/017_permission.sql:95 |
| `attachment.read` | low | server/db/seed/platform/002_permission_model/017_permission.sql:92 |
| `attachment.reindex` | high | server/db/seed/platform/002_permission_model/017_permission.sql:96 |
| `attachment.update` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:94 |
| `bulk_delete` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:84 |
| `bulk_export` | high | server/db/seed/platform/002_permission_model/017_permission.sql:82 |
| `bulk_import` | high | server/db/seed/platform/002_permission_model/017_permission.sql:81 |
| `bulk_update` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:83 |
| `cancel` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:48 |
| `cancel_line` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:43 |
| `clear` | high | server/db/seed/platform/002_permission_model/017_permission.sql:63 |
| `close` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:49 |
| `close_line` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:42 |
| `confirm` | low | server/db/seed/platform/002_permission_model/017_permission.sql:159 |
| `convert` | low | server/db/seed/platform/002_permission_model/017_permission.sql:158 |
| `copy` | low | server/db/seed/platform/002_permission_model/017_permission.sql:73 |
| `create` | low | server/db/seed/platform/002_permission_model/017_permission.sql:32 |
| `create_commitment` | low | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql:7267 |
| `create_invoice` | low | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql:7270 |
| `create_payment` | low | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql:7271 |
| `create_receipt` | low | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql:7268 |
| `create_service_sheet` | low | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql:7269 |
| `del_others_attach` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:98 |
| `del_others_comment` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:97 |
| `delegate` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:86 |
| `delete` | high | server/db/seed/platform/002_permission_model/017_permission.sql:38 |
| `delete_draft` | low | server/db/seed/platform/002_permission_model/017_permission.sql:37 |
| `deny` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:54 |
| `dispatch` | low | server/db/seed/platform/002_permission_model/017_permission.sql:164 |
| `DN.MARK_ARRIVED` | low | server/db/seed/platform/002_permission_model/017_permission.sql:182 |
| `edit` | low | server/db/seed/platform/002_permission_model/017_permission.sql:34 |
| `edit_line` | low | server/db/seed/platform/002_permission_model/017_permission.sql:41 |
| `escalate` | low | server/db/seed/platform/002_permission_model/017_permission.sql:52 |
| `exit` | low | server/db/seed/platform/002_permission_model/017_permission.sql:36 |
| `export` | low | server/db/seed/platform/002_permission_model/017_permission.sql:78 |
| `extend` | medium | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql:7264 |
| `feature_diagnostic` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:103 |
| `feature_edit` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:106 |
| `feature_theme` | low | server/db/seed/platform/002_permission_model/017_permission.sql:104 |
| `feature_view` | low | server/db/seed/platform/002_permission_model/017_permission.sql:105 |
| `FINANCE_SETUP.ADVANCED_CONFIGURE` | high | server/db/seed/platform/002_permission_model/017_permission.sql:117 |
| `FINANCE_SETUP.CONFIGURE` | high | server/db/seed/platform/002_permission_model/017_permission.sql:116 |
| `FINANCE_SETUP.VIEW` | low | server/db/seed/platform/002_permission_model/017_permission.sql:115 |
| `follow` | low | server/db/seed/platform/002_permission_model/017_permission.sql:99 |
| `hold` | medium | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql:7261 |
| `IAM.IDP.MANAGE` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:16,111 |
| `IAM.IDP.READ` | low | server/db/seed/platform/002_permission_model/017_permission.sql:16,110 |
| `IAM.PARAMETER.MANAGE` | high | server/db/seed/platform/002_permission_model/017_permission.sql:16,109 |
| `IAM.SESSION.VIEW` | unknown | server/db/seed/platform/002_permission_model/017_permission.sql:23 |
| `import` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:77 |
| `JOBS.BOARD.VIEW` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:20,107 |
| `JOBS.QUEUE.MANAGE` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:20,108 |
| `mark_arrived` | low | server/db/seed/platform/002_permission_model/017_permission.sql:165 |
| `merge` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:74 |
| `MESH.BUYER.CONNECT` | medium | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql:80 |
| `MESH.BUYER.MANAGE` | high | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql:82 |
| `MESH.BUYER.RESPOND` | medium | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql:81 |
| `MESH.BUYER.VIEW` | low | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql:79 |
| `MESH.PARTNER.MANAGE` | high | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql:85 |
| `MESH.PARTNER.RESPOND` | medium | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql:84 |
| `MESH.PARTNER.VIEW` | low | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql:83 |
| `metadata.contract.break_glass` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:155 |
| `metadata.contract.draft.create` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:146 |
| `metadata.contract.edit` | high | server/db/seed/platform/002_permission_model/017_permission.sql:147 |
| `metadata.contract.export` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:153 |
| `metadata.contract.import` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:152 |
| `metadata.contract.publish` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:150 |
| `metadata.contract.review` | high | server/db/seed/platform/002_permission_model/017_permission.sql:149 |
| `metadata.contract.rollback` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:151 |
| `metadata.contract.submit` | high | server/db/seed/platform/002_permission_model/017_permission.sql:148 |
| `metadata.contract.view` | low | server/db/seed/platform/002_permission_model/017_permission.sql:145 |
| `metadata.overlay.edit` | high | server/db/seed/platform/002_permission_model/017_permission.sql:154 |
| `PI.APPROVE` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:190 |
| `PI.DISCARD_SESSION` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:200 |
| `PI.MATCH_OVERRIDE` | high | server/db/seed/platform/002_permission_model/017_permission.sql:193 |
| `PI.POST` | high | server/db/seed/platform/002_permission_model/017_permission.sql:191 |
| `PI.REVERSE` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:192 |
| `PI.REVERT_TO_BASELINE` | high | server/db/seed/platform/002_permission_model/017_permission.sql:201 |
| `PI.SNAPSHOT_RESTORE` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:199 |
| `PLATFORM.CATALOG.MANAGE` | high | server/db/seed/platform/002_permission_model/017_permission.sql:18,140 |
| `PLATFORM.CATALOG.VIEW` | low | server/db/seed/platform/002_permission_model/017_permission.sql:18,139 |
| `PLATFORM.REFERENCE.IMPORT` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:16,136 |
| `PLATFORM.REFERENCE.VIEW` | low | server/db/seed/platform/002_permission_model/017_permission.sql:16,135 |
| `PLATFORM.SUBSCRIPTIONS.MANAGE` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:19,142 |
| `PLATFORM.SUBSCRIPTIONS.VIEW` | low | server/db/seed/platform/002_permission_model/017_permission.sql:19,141 |
| `PLATFORM.TAXONOMY.IMPORT` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:17,138 |
| `PLATFORM.TAXONOMY.VIEW` | low | server/db/seed/platform/002_permission_model/017_permission.sql:17,137 |
| `PO.APPROVE` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:173 |
| `PO.EXPIRE` | high | server/db/seed/platform/002_permission_model/017_permission.sql:179 |
| `PO.HOLD` | high | server/db/seed/platform/002_permission_model/017_permission.sql:177 |
| `PO.PLACE_ORDER` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:174 |
| `PO.RELEASE_HOLD` | high | server/db/seed/platform/002_permission_model/017_permission.sql:178 |
| `PO.RETRY_SEND` | low | server/db/seed/platform/002_permission_model/017_permission.sql:175 |
| `PO.SHORT_CLOSE` | high | server/db/seed/platform/002_permission_model/017_permission.sql:176 |
| `POC.ACCEPT` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:180 |
| `POC.DISPUTE` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:181 |
| `post` | high | server/db/seed/platform/002_permission_model/017_permission.sql:59 |
| `PR.APPROVE` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:171 |
| `PR.CONVERT` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:172 |
| `print` | low | server/db/seed/platform/002_permission_model/017_permission.sql:76 |
| `propose_changes` | low | server/db/seed/platform/002_permission_model/017_permission.sql:160 |
| `read` | low | server/db/seed/platform/002_permission_model/017_permission.sql:31 |
| `receipt` | low | server/db/seed/platform/002_permission_model/017_permission.sql:166 |
| `RECEIPT.APPROVE` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:183 |
| `RECEIPT.POST` | high | server/db/seed/platform/002_permission_model/017_permission.sql:184 |
| `RECEIPT.QUALITY_HOLD` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:186 |
| `RECEIPT.REVERSE` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:185 |
| `reconcile` | high | server/db/seed/platform/002_permission_model/017_permission.sql:61 |
| `records.lock.force_release` | high | server/db/seed/platform/002_permission_model/017_permission.sql:101 |
| `reject` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:161 |
| `reject_acceptance` | low | server/db/seed/platform/002_permission_model/017_permission.sql:169 |
| `reject_changes` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:163 |
| `release_hold` | medium | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql:7262 |
| `reopen` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:50 |
| `replace` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:35 |
| `report` | low | server/db/seed/platform/002_permission_model/017_permission.sql:75 |
| `request_info` | low | server/db/seed/platform/002_permission_model/017_permission.sql:57 |
| `return` | low | server/db/seed/platform/002_permission_model/017_permission.sql:56 |
| `reverse` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:60 |
| `revise` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:47 |
| `SERVICE_SHEET.APPROVE` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:187 |
| `SERVICE_SHEET.POST` | high | server/db/seed/platform/002_permission_model/017_permission.sql:188 |
| `SERVICE_SHEET.REVERSE` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:189 |
| `share_edit` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:88 |
| `share_read` | low | server/db/seed/platform/002_permission_model/017_permission.sql:87 |
| `submit` | low | server/db/seed/platform/002_permission_model/017_permission.sql:45 |
| `submit_for_acceptance` | low | server/db/seed/platform/002_permission_model/017_permission.sql:167 |
| `supplier.banking.admin` | high | server/db/seed/platform/002_permission_model/017_permission.sql:69 |
| `supplier.banking.submit` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:67 |
| `supplier.banking.verify` | high | server/db/seed/platform/002_permission_model/017_permission.sql:68 |
| `supplier.governance.write` | high | server/db/seed/platform/002_permission_model/017_permission.sql:112 |
| `supplier.qualification.admin` | critical | server/db/seed/platform/002_permission_model/017_permission.sql:113 |
| `supplier.tax.restricted` | high | server/db/seed/platform/002_permission_model/017_permission.sql:66 |
| `supplier.tax.submit` | low | server/db/seed/platform/002_permission_model/017_permission.sql:64 |
| `supplier.tax.verify` | medium | server/db/seed/platform/002_permission_model/017_permission.sql:65 |
| `tag` | low | server/db/seed/platform/002_permission_model/017_permission.sql:100 |
| `transmit` | high | server/db/seed/platform/002_permission_model/017_permission.sql:62 |
| `update` | low | server/db/seed/platform/002_permission_model/017_permission.sql:33 |
| `view_je` | low | server/db/seed/platform/002_permission_model/017_permission.sql:79 |
| `view_match` | low | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql:7263 |
| `void` | high | server/db/seed/platform/002_permission_model/017_permission.sql:55 |
| `withdraw` | low | server/db/seed/platform/002_permission_model/017_permission.sql:51 |

## Authorization-bearing routes

| Source | Route | Methods | Permissions | Security symbols |
|---|---|---|---|---|
| apps/neon/app/api/runtime/v1/entities/[entity]/[id]/route.ts | `/api/runtime/v1/entities/:entity/:id` | DELETE, GET, PATCH | — | authorizeRuntimeOperation |
| apps/neon/app/api/runtime/v1/entities/[entity]/[id]/route.ts | `Idempotency-Key` | GET | — | authorizeRuntimeOperation |
| apps/neon/app/api/runtime/v1/entities/[entity]/[id]/route.ts | `If-Match` | GET | — | authorizeRuntimeOperation |
| server/packages/services/ai/routes/ai-agent.route.ts | `/ai/agent/models` | GET | `ai.agent.use` | resolveVerifiedRequestContext |
| server/packages/services/ai/routes/ai-agent.route.ts | `/ai/agent/runs` | POST | `ai.agent.use` | resolveVerifiedRequestContext |
| server/packages/services/ai/routes/ai.route.ts | `/ai/actions/preview` | POST | `ai.agent.feedback.submit`<br>`ai.calibrate_thresholds`<br>`ai.review_ai_output`<br>`ai.use_extraction` | checkPermission<br>requireAllow |
| server/packages/services/ai/routes/ai.route.ts | `/ai/actions/run` | POST | `ai.agent.feedback.submit`<br>`ai.calibrate_thresholds`<br>`ai.review_ai_output`<br>`ai.use_extraction` | checkPermission<br>requireAllow |
| server/packages/services/ai/routes/ai.route.ts | `/ai/feedback` | POST | `ai.agent.feedback.submit`<br>`ai.calibrate_thresholds`<br>`ai.review_ai_output`<br>`ai.use_extraction` | checkPermission<br>requireAllow |
| server/packages/services/ai/routes/ai.route.ts | `/ai/policy/autonomy` | PUT | `ai.agent.feedback.submit`<br>`ai.calibrate_thresholds`<br>`ai.review_ai_output`<br>`ai.use_extraction` | checkPermission<br>requireAllow |
| server/packages/services/ai/routes/ai.route.ts | `/ai/policy/effective` | GET | `ai.agent.feedback.submit`<br>`ai.calibrate_thresholds`<br>`ai.review_ai_output`<br>`ai.use_extraction` | checkPermission<br>requireAllow |
| server/packages/services/ai/routes/ai.route.ts | `/ai/policy/threshold` | PUT | `ai.agent.feedback.submit`<br>`ai.calibrate_thresholds`<br>`ai.review_ai_output`<br>`ai.use_extraction` | checkPermission<br>requireAllow |
| server/packages/services/collab/routes/collab-attachments.route.ts | `/collab/attachments` | POST | — | resolveAttachmentAuthContext |
| server/packages/services/collab/routes/collab-attachments.route.ts | `/collab/attachments/:attachmentId` | DELETE | — | resolveAttachmentAuthContext |
| server/packages/services/collab/routes/collab-attachments.route.ts | `/collab/attachments/:attachmentId/download` | GET | — | resolveAttachmentAuthContext |
| server/packages/services/collab/routes/collab-attachments.route.ts | `/collab/attachments/:attachmentId/link` | DELETE, POST | — | resolveAttachmentAuthContext |
| server/packages/services/collab/routes/collab-attachments.route.ts | `/collab/attachments/:attachmentId/properties` | PATCH | — | resolveAttachmentAuthContext |
| server/packages/services/collab/routes/collab-attachments.route.ts | `/collab/entity-attachments` | GET | — | resolveAttachmentAuthContext |
| server/packages/services/content/routes/content.route.ts | `*` | GET | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/admin/attachments/:id` | DELETE | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/admin/attachments/:id/release` | POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/admin/quarantined` | GET | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/attachments/:id` | GET | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/attachments/:id/access` | GET, POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/attachments/:id/access/:grantId` | DELETE | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/attachments/:id/download` | GET | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/attachments/:id/links` | GET, POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/attachments/:id/versions` | GET | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/attachments/links/:linkId` | DELETE | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/entities/:entityType/:entityId/attachments` | GET | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/grants/:id` | DELETE | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items` | GET, POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items/:id` | GET, PATCH | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items/:id/archive` | POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items/:id/attachments` | GET, POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items/:id/attachments/:attachmentId` | DELETE | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items/:id/attachments/:attachmentId/versions` | POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items/:id/grants` | GET, POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items/:id/links` | GET, POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items/:id/publish` | POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items/:id/submit` | POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items/:id/versions` | GET, POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items/:id/versions/:versionId` | GET | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/items/:id/versions/:versionId/restore` | POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/links/:id` | DELETE | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/quota/config` | GET, POST | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/quota/config/:kind` | DELETE | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/quota/usage` | GET | `delete`<br>`read` | — |
| server/packages/services/content/routes/content.route.ts | `/content/search` | GET | `delete`<br>`read` | — |
| server/packages/services/documents/routes/attachments.route.ts | `/documents/:docType/:id/attachment-workspace` | GET | — | authorizeAttachmentAccess<br>resolveVerifiedRequestContext |
| server/packages/services/documents/routes/attachments.route.ts | `/documents/:docType/:id/attachments` | GET, POST | — | authorizeAttachmentAccess<br>resolveVerifiedRequestContext |
| server/packages/services/documents/routes/attachments.route.ts | `/documents/:docType/:id/attachments/:attachmentId` | DELETE, PATCH | — | authorizeAttachmentAccess<br>resolveVerifiedRequestContext |
| server/packages/services/documents/routes/attachments.route.ts | `/documents/:docType/:id/attachments/:attachmentId/download` | GET | — | authorizeAttachmentAccess<br>resolveVerifiedRequestContext |
| server/packages/services/documents/routes/attachments.route.ts | `/documents/:docType/:id/attachments/:attachmentId/reindex` | POST | — | authorizeAttachmentAccess<br>resolveVerifiedRequestContext |
| server/packages/services/documents/routes/attachments.route.ts | `/documents/:docType/:id/attachments/upload/complete` | POST | — | authorizeAttachmentAccess<br>resolveVerifiedRequestContext |
| server/packages/services/documents/routes/attachments.route.ts | `/documents/:docType/:id/attachments/upload/initiate` | POST | — | authorizeAttachmentAccess<br>resolveVerifiedRequestContext |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/aging` | GET | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices` | GET, POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id` | GET, PATCH | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id/discard-session` | POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id/lines` | POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id/lines/:lid` | DELETE, PATCH | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id/lines/:lid/classify` | POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id/lines/suggest` | GET | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id/party` | GET | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id/pricing-components` | POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id/pricing-components/:pcId` | DELETE, PATCH | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id/pricing-components/:pcId/apportionment` | GET | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id/pricing-components/apportionment-summary` | GET | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id/pricing-components/line-rollup` | GET | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/:id/revert-to-baseline` | POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/draft-lines/classify` | POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/invoices/extract` | POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/payment-methods` | GET | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/payments` | GET, POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/payments/:id/post` | POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/payments/:id/submit` | POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ap/payments/:id/void` | POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ar/aging` | GET | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ar/invoices` | GET | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ar/payment-methods` | GET | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/ar/receipts` | GET, POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/pricing-components` | POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/pricing-components/:pcId` | DELETE, PATCH | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/ap.route.ts | `/finance/tax/resolve` | POST | `export`<br>`PI.REVERT_TO_BASELINE` | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/company/:companyCode/fx` | GET | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/company/:companyCode/fx/book-overrides` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/company/:companyCode/fx/book-overrides/:policyId/end` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/company/:companyCode/fx/book-overrides/:policyId/replace` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/company/:companyCode/fx/overrides` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/company/:companyCode/fx/overrides/:policyId/end` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/company/:companyCode/fx/overrides/:policyId/replace` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/company/:companyCode/fx/resolution-trace` | GET | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/tenant/:tenantCode/fx` | GET | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/tenant/:tenantCode/fx/policies` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/tenant/:tenantCode/fx/policies/:policyId/replace` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/tenant/:tenantCode/fx/rates` | GET, POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/tenant/:tenantCode/fx/rates/:rateId` | GET | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/tenant/:tenantCode/fx/rates/:rateId/replace` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/tenant/:tenantCode/fx/rates/export` | GET | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/tenant/:tenantCode/fx/rates/import` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/tenant/:tenantCode/fx/rates/imports` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/tenant/:tenantCode/fx/rates/imports/validate` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-fx-setup.route.ts | `/finance/setup/tenant/:tenantCode/fx/rates/validate-import` | POST | `FINANCE_SETUP.ADVANCED_CONFIGURE`<br>`FINANCE_SETUP.CONFIGURE`<br>`FINANCE_SETUP.VIEW` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/certification-readiness` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/company/:companyCode/book-assignments` | POST | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/company/:companyCode/book-assignments/:assignmentId` | DELETE, PUT | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/company/:companyCode/book-assignments/:bookId/set-default` | POST | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/company/:companyCode/chart-assignments` | POST | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/company/:companyCode/chart-assignments/:assignmentId` | DELETE, PUT | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/company/:companyCode/chart-assignments/:assignmentId/set-primary` | POST | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/company/:companyCode/fiscal-calendar-assignments/:calendarId` | POST | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/company/:companyCode/fiscal-periods/:fiscalYear/generate` | POST | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/company/:companyCode/foundation` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/company/:companyCode/gl-controls` | POST | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/company/:companyCode/gl-controls/:controlId` | DELETE, PATCH | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/company/:companyCode/gl-controls/bulk` | POST | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/configure/book-assignments` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/configure/book-options` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/configure/chart-assignments` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/configure/chart-options` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/configure/fiscal-calendar` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/configure/fiscal-calendar/:calendarId/preview` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/configure/fiscal-calendar/period-matrix` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/configure/gl-controls` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/configure/posting-role-coverage` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/configure/posting-role-resolution-trace` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/conflicts` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/explore/books` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/explore/chart-tree` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/explore/gl-accounts` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/explore/house-banks` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/mutations/chart-assignment/:assignmentId/set-primary` | POST | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/mutations/fiscal-calendar` | POST | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/mutations/fiscal-calendar/:calendarId` | DELETE, PUT | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/mutations/house-bank/:configId/toggle` | POST | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/mutations/posting-role-account-map` | POST | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/mutations/posting-role-account-map/:mappingId` | DELETE, PUT | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/operate/blockers` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/operate/reconciliation-signals` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/posting-preview` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance-setup.route.ts | `/finance/setup/readiness` | GET | `FINANCE_SETUP.CONFIGURE` | checkPermission |
| server/packages/services/finance/routes/finance.route.ts | `/finance/accounts/search` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/gl-detail` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/master/charts` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/master/charts/:chartCode/accounts` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/master/companies` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/master/controls` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/master/entities` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/master/ledger-books` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/master/periods` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/master/scope-options` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/period-status` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/statements/balance-sheet` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/statements/profit-loss` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/tax-groups/search` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/finance/routes/finance.route.ts | `/finance/trial-balance` | GET | — | checkPermissionBatch<br>resolveUserCompanyAccess |
| server/packages/services/iam/routes/company-code-access.routes.ts | `/iam/admin/company-code-access` | GET, POST | — | checkPermission<br>requireAllow<br>requireStepUp<br>resolveAuth |
| server/packages/services/iam/routes/company-code-access.routes.ts | `/iam/admin/company-code-access/:id` | DELETE | — | checkPermission<br>requireAllow<br>requireStepUp<br>resolveAuth |
| server/packages/services/iam/routes/company-code-access.routes.ts | `/iam/admin/company-codes` | GET | — | checkPermission<br>requireAllow<br>requireStepUp<br>resolveAuth |
| server/packages/services/iam/routes/iam-admin.routes.ts | `/iam/admin/idp-sync/health` | GET | — | resolveAuth |
| server/packages/services/iam/routes/iam-admin.routes.ts | `/iam/admin/idp-sync/trigger` | POST | — | resolveAuth |
| server/packages/services/iam/routes/iam-admin.routes.ts | `/iam/admin/permission-log` | GET | — | resolveAuth |
| server/packages/services/iam/routes/identity-provider.routes.ts | `/iam/identity-providers` | GET, POST | `IAM.IDP.MANAGE`<br>`IAM.IDP.READ` | checkPermission<br>requireAllow<br>requireProviderPermission<br>requireStepUp<br>resolveProviderAuth |
| server/packages/services/iam/routes/identity-provider.routes.ts | `/iam/identity-providers/:id/activate` | POST | `IAM.IDP.MANAGE`<br>`IAM.IDP.READ` | checkPermission<br>requireAllow<br>requireProviderPermission<br>requireStepUp<br>resolveProviderAuth |
| server/packages/services/iam/routes/identity-provider.routes.ts | `/iam/identity-providers/:id/disable` | POST | `IAM.IDP.MANAGE`<br>`IAM.IDP.READ` | checkPermission<br>requireAllow<br>requireProviderPermission<br>requireStepUp<br>resolveProviderAuth |
| server/packages/services/iam/routes/identity-provider.routes.ts | `/iam/identity-providers/:id/mfa-trust-policy` | PATCH | `IAM.IDP.MANAGE`<br>`IAM.IDP.READ` | checkPermission<br>requireAllow<br>requireProviderPermission<br>requireStepUp<br>resolveProviderAuth |
| server/packages/services/iam/routes/mfa.routes.ts | `/iam/delegations/:id/revoke-own` | POST | — | resolveCallerAuth |
| server/packages/services/iam/routes/mfa.routes.ts | `/iam/delegations/my` | GET, POST | — | resolveCallerAuth |
| server/packages/services/iam/routes/mfa.routes.ts | `/iam/mfa` | GET | — | resolveCallerAuth |
| server/packages/services/iam/routes/mfa.routes.ts | `/iam/mfa/:methodId` | DELETE | — | resolveCallerAuth |
| server/packages/services/iam/routes/mfa.routes.ts | `/iam/mfa/elevate` | POST | — | resolveCallerAuth |
| server/packages/services/iam/routes/mfa.routes.ts | `/iam/mfa/sync` | POST | — | resolveCallerAuth |
| server/packages/services/iam/routes/mfa.routes.ts | `/iam/mfa/totp/begin` | POST | — | resolveCallerAuth |
| server/packages/services/iam/routes/mfa.routes.ts | `/iam/mfa/webauthn/start` | POST | — | resolveCallerAuth |
| server/packages/services/iam/routes/mfa.routes.ts | `/iam/trusted-devices` | DELETE, GET, POST | — | resolveCallerAuth |
| server/packages/services/iam/routes/mfa.routes.ts | `/iam/trusted-devices/:id` | DELETE | — | resolveCallerAuth |
| server/packages/services/iam/routes/mfa.routes.ts | `/iam/trusted-devices/verify` | POST | — | resolveCallerAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/admin/migrate-bindings` | POST | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/admin/principals/:id/invalidate-sessions` | POST | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/admin/sessions` | GET | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/delegations` | POST | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/delegations/:grantId/revoke` | PATCH | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/effective-access/:principalId` | GET | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/grants` | POST | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/grants/:grantId/revoke` | PATCH | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/groups` | GET, POST | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/groups/:groupId/members` | POST | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/groups/:groupId/members/:memberId` | DELETE | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/groups/:id` | DELETE, GET, PATCH | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/groups/:id/roles` | POST | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/groups/:id/roles/:rid` | DELETE, PATCH | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/principals` | GET | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/principals/:principalId/auth-bindings` | GET | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/principals/:principalId/delegations` | GET | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/principals/:principalId/grants` | GET | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/principals/:principalId/groups` | GET | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/operator.routes.ts | `/iam/principals/:principalId/mfa` | GET | — | checkPermission<br>checkPermissionBatch<br>requireAllow<br>requireStepUp<br>resolveOperatorAuth |
| server/packages/services/iam/routes/parameter.routes.ts | `/iam/parameters` | GET | `create`<br>`IAM.PARAMETER.MANAGE`<br>`update` | checkPermission<br>requireAllow<br>requireStepUp<br>resolveParameterAuth<br>resolveReadAuth |
| server/packages/services/iam/routes/parameter.routes.ts | `/iam/parameters/:code` | PATCH | `create`<br>`IAM.PARAMETER.MANAGE`<br>`update` | checkPermission<br>requireAllow<br>requireStepUp<br>resolveParameterAuth<br>resolveReadAuth |
| server/packages/services/iam/routes/parameter.routes.ts | `/iam/parameters/effective` | GET | `create`<br>`IAM.PARAMETER.MANAGE`<br>`update` | checkPermission<br>requireAllow<br>requireStepUp<br>resolveParameterAuth<br>resolveReadAuth |
| server/packages/services/jobs/routes/jobs.board.route.ts | `<dynamic-or-mounted>` | UNKNOWN | `JOBS.BOARD.VIEW`<br>`JOBS.QUEUE.MANAGE` | checkPermission<br>resolveAuth |
| server/packages/services/master/routes/addresses.route.ts | `/master/addresses` | GET | — | authorizeMutation |
| server/packages/services/master/routes/addresses.route.ts | `/master/addresses/candidates` | GET | — | authorizeMutation |
| server/packages/services/master/routes/addresses.route.ts | `/master/addresses/default` | POST | — | authorizeMutation |
| server/packages/services/master/routes/addresses.route.ts | `/master/addresses/links/:linkId/end-date` | PATCH | — | authorizeMutation |
| server/packages/services/master/routes/addresses.route.ts | `/master/addresses/links/:linkId/set-primary` | PATCH | — | authorizeMutation |
| server/packages/services/master/routes/owner-address-contact.route.ts | `/master/contact-links/:linkId/deactivate` | POST | `ADDRESS_CONTACT.COMPANY_CODE.MANAGE`<br>`ADDRESS_CONTACT.LEGAL_ENTITY.MANAGE`<br>`ADDRESS_CONTACT.TENANT.MANAGE` | — |
| server/packages/services/master/routes/owner-address-contact.route.ts | `/master/contact-links/:linkId/set-primary` | POST | `ADDRESS_CONTACT.COMPANY_CODE.MANAGE`<br>`ADDRESS_CONTACT.LEGAL_ENTITY.MANAGE`<br>`ADDRESS_CONTACT.TENANT.MANAGE` | — |
| server/packages/services/master/routes/owner-address-contact.route.ts | `/master/contact-links/:linkId/verify` | POST | `ADDRESS_CONTACT.COMPANY_CODE.MANAGE`<br>`ADDRESS_CONTACT.LEGAL_ENTITY.MANAGE`<br>`ADDRESS_CONTACT.TENANT.MANAGE` | — |
| server/packages/services/master/routes/owner-address-contact.route.ts | `/master/owners/:ownerType/:ownerId/address-contact-profile` | GET | `ADDRESS_CONTACT.COMPANY_CODE.MANAGE`<br>`ADDRESS_CONTACT.LEGAL_ENTITY.MANAGE`<br>`ADDRESS_CONTACT.TENANT.MANAGE` | — |
| server/packages/services/master/routes/owner-address-contact.route.ts | `/master/owners/:ownerType/:ownerId/addresses` | POST | `ADDRESS_CONTACT.COMPANY_CODE.MANAGE`<br>`ADDRESS_CONTACT.LEGAL_ENTITY.MANAGE`<br>`ADDRESS_CONTACT.TENANT.MANAGE` | — |
| server/packages/services/master/routes/owner-address-contact.route.ts | `/master/owners/:ownerType/:ownerId/contact-channels` | POST | `ADDRESS_CONTACT.COMPANY_CODE.MANAGE`<br>`ADDRESS_CONTACT.LEGAL_ENTITY.MANAGE`<br>`ADDRESS_CONTACT.TENANT.MANAGE` | — |
| server/packages/services/metadata/routes/compiled-entity.route.ts | `/metadata/catalog/:entity` | GET | — | getEffectiveModuleAccess |
| server/packages/services/metadata/routes/compiled-entity.route.ts | `/metadata/entities/:entity/compiled` | GET | — | getEffectiveModuleAccess |
| server/packages/services/metadata/routes/compiled-entity.route.ts | `/metadata/entities/:entity/execution-descriptor` | GET | — | getEffectiveModuleAccess |
| server/packages/services/metadata/routes/entity-flow.route.ts | `/metadata/entities/:entity/flow` | GET | — | checkPermissionBatch<br>getEffectiveModuleAccess |
| server/packages/services/metadata/routes/entity-operations.route.ts | `/metadata/entities/:entity/operations` | GET | `approve`<br>`cancel`<br>`confirm`<br>`delete`<br>`delete_draft`<br>`deny`<br>`post`<br>`reject`<br>`reopen`<br>`request_info`<br>`return`<br>`reverse`<br>`submit`<br>`void` | checkPermissionBatch |
| server/packages/services/metadata/routes/entity-operations.route.ts | `/metadata/entities/:entity/record-operations` | GET | `approve`<br>`cancel`<br>`confirm`<br>`delete`<br>`delete_draft`<br>`deny`<br>`post`<br>`reject`<br>`reopen`<br>`request_info`<br>`return`<br>`reverse`<br>`submit`<br>`void` | checkPermissionBatch |
| server/packages/services/metadata/routes/index.ts | `<dynamic-or-mounted>` | UNKNOWN | — | checkPermissionBatch<br>getEffectiveModuleAccess |
| server/packages/services/metadata/routes/mesh-inbox.route.ts | `/mesh/bindings` | GET | `MESH.BUYER.VIEW` | — |
| server/packages/services/metadata/routes/mesh-inbox.route.ts | `/mesh/documents/:entity/:id` | GET | `MESH.BUYER.VIEW` | — |
| server/packages/services/metadata/routes/mesh-inbox.route.ts | `/mesh/inbox` | GET | `MESH.BUYER.VIEW` | — |
| server/packages/services/metadata/routes/mesh-inbox.route.ts | `/mesh/notifications/preferences` | GET | `MESH.BUYER.VIEW` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/entities` | GET | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/entities/:id` | GET | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/entities/:id/contracts` | PATCH | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/entity-fields/:id/contracts` | PATCH | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/entity-operations` | GET, POST | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/entity-operations/:id` | DELETE, PATCH | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/entity-policies` | GET, POST | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/entity-policies/:id` | DELETE, PATCH | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/erd` | GET | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/field-groups` | GET, POST | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/field-groups/:key` | DELETE, PATCH | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/lifecycle-bindings` | GET, POST | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/lifecycle-bindings/:id` | DELETE, PATCH | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/lifecycles` | GET | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/lookup-domains` | GET, POST | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/lookup-domains/:code` | PATCH | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/lookup-domains/:code/values` | GET, POST | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `/metadata/admin/lookup-domains/:code/values/:id` | DELETE, PATCH | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/metadata-admin.route.ts | `${entity}:${permissionCode}` | GET | `create`<br>`delete`<br>`edit`<br>`read` | — |
| server/packages/services/metadata/routes/studio-contract-v2.route.ts | `/metadata/studio/entity-versions/:id/contract-v2` | GET, PUT | `metadata.contract.edit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v2.route.ts | `${fromState}:${toState}` | GET | `metadata.contract.edit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/contracts/v2.1/diff` | POST | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/contracts/v2.1/drafts` | POST | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/contracts/v2.1/validate` | POST | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/entity-versions/:id/contract-v2.1` | GET, PUT | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/entity-versions/:id/contract-v2.1/:owner` | PATCH | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/entity-versions/:id/contract-v2.1/approve` | POST | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/entity-versions/:id/contract-v2.1/diff` | GET | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/entity-versions/:id/contract-v2.1/dry-run` | POST | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/entity-versions/:id/contract-v2.1/export` | GET | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/entity-versions/:id/contract-v2.1/publish` | POST | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/entity-versions/:id/contract-v2.1/reject` | POST | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/entity-versions/:id/contract-v2.1/rollback` | POST | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/entity-versions/:id/contract-v2.1/submit` | POST | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-contract-v21.route.ts | `/metadata/studio/entity-versions/:id/contract-v2.1/validate` | POST | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.export`<br>`metadata.contract.import`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.rollback`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/metadata/routes/studio-version.route.ts | `<dynamic-or-mounted>` | UNKNOWN | `metadata.contract.break_glass`<br>`metadata.contract.draft.create`<br>`metadata.contract.edit`<br>`metadata.contract.publish`<br>`metadata.contract.review`<br>`metadata.contract.submit`<br>`metadata.contract.view` | — |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/features` | GET, POST | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/features/:featureCode` | PATCH | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/plans` | GET, POST | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/plans/:planCode` | PATCH | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/plans/:planCode/features` | GET | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/plans/:planCode/features/:featureCode` | DELETE, PUT | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/plans/:planCode/modules` | GET | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/plans/:planCode/modules/:moduleCode` | DELETE, PUT | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/plans/:planCode/permissions` | GET | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/plans/:planCode/permissions/:permissionCode` | DELETE, PUT | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/plans/:planCode/versions` | POST | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/tenants/:tenantId/entitlements/effective` | GET | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/tenants/:tenantId/entitlements/preview` | POST | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/tenants/:tenantId/features/:featureCode` | DELETE, PUT | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/tenants/:tenantId/modules/:moduleCode` | DELETE, PUT | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/tenants/:tenantId/permissions/:permissionCode/override` | DELETE, PUT | — | resolvePermissionId |
| server/packages/services/platform/routes/commerce.route.ts | `/platform/control/commerce/tenants/:tenantId/plan` | GET, POST | — | resolvePermissionId |
| server/packages/services/platform/routes/platform.route.ts | `/notifications/unread-count` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/cache` | POST | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/cache/clear` | POST | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/enterprise-features` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/fx-rates` | POST | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/fx-rates/:id` | DELETE, PATCH | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/health` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/session/rebuild` | POST | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/subscription-plans` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/subscription-plans/:id/access` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/tenant` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/user/sync-profile` | POST | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/blueprints` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/blueprints/:code/apply` | DELETE, POST | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/content-hub` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/dashboard` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/entities` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/entities/:name/fields` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/experience-flags` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/modules` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/notifications` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/notifications/:id/read` | POST | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/notifications/read-all` | POST | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/notifications/stream` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/notifications/unread-count` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/saved-views` | POST | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/saved-views/:entity` | GET, POST | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/saved-views/:entity/:viewId` | DELETE, PATCH | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/saved-views/:entity/:viewId/default` | PATCH | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/saved-views/:entity/default` | DELETE | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/setup-directory` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/setup-handoff` | POST | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/stats` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/surface-events` | POST | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/platform/tenant-admin` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/platform.route.ts | `/user/tenant-admin` | GET | — | getEffectiveModuleAccess |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/:family/import` | POST | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/certification-types` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/commodity-codes` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/commodity-codes/:code/children` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/commodity-codes/search` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/countries` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/currencies` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/fx-rates` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/fx-rates/history` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/fx-rates/lookup` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/industry-codes` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/industry-codes/:code/children` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/industry-codes/search` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/languages` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/locales` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/modules` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/permission-categories` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/permissions` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/personas` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/roles` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/state-regions` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/timezones` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/uom` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/ref.route.ts | `/platform/ref/workspaces` | GET | `PLATFORM.REFERENCE.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/taxonomy.route.ts | `/platform/taxonomy/:family/crosswalks/browse` | GET | `PLATFORM.TAXONOMY.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/taxonomy.route.ts | `/platform/taxonomy/:family/crosswalks/import` | POST | `PLATFORM.TAXONOMY.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/taxonomy.route.ts | `/platform/taxonomy/:family/crosswalks/resolve` | GET | `PLATFORM.TAXONOMY.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/taxonomy.route.ts | `/platform/taxonomy/:family/crosswalks/reverse` | GET | `PLATFORM.TAXONOMY.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/taxonomy.route.ts | `/platform/taxonomy/:family/domains` | GET | `PLATFORM.TAXONOMY.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/taxonomy.route.ts | `/platform/taxonomy/:family/domains/:domain/nodes/:code` | GET | `PLATFORM.TAXONOMY.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/taxonomy.route.ts | `/platform/taxonomy/:family/domains/:domain/nodes/:code/children` | GET | `PLATFORM.TAXONOMY.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/taxonomy.route.ts | `/platform/taxonomy/:family/domains/:domain/nodes/:code/path` | GET | `PLATFORM.TAXONOMY.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/taxonomy.route.ts | `/platform/taxonomy/:family/domains/:domain/roots` | GET | `PLATFORM.TAXONOMY.IMPORT` | requirePlatformPermission |
| server/packages/services/platform/routes/taxonomy.route.ts | `/platform/taxonomy/:family/domains/:domain/search` | GET | `PLATFORM.TAXONOMY.IMPORT` | requirePlatformPermission |
| server/packages/services/records/routes/action-dispatcher.route.ts | `/records/:entity/:id/action/:code` | POST | `approve`<br>`confirm`<br>`copy`<br>`deny`<br>`hold`<br>`PO.PLACE_ORDER`<br>`post`<br>`reject`<br>`release_hold`<br>`request_info`<br>`return`<br>`reverse`<br>`submit`<br>`void`<br>`withdraw` | checkPermission<br>requireAllowedPermission |
| server/packages/services/records/routes/action-dispatcher.route.ts | `/runtime/v1/entities/:entity/:id/action/:code` | POST | `approve`<br>`confirm`<br>`copy`<br>`deny`<br>`hold`<br>`PO.PLACE_ORDER`<br>`post`<br>`reject`<br>`release_hold`<br>`request_info`<br>`return`<br>`reverse`<br>`submit`<br>`void`<br>`withdraw` | checkPermission<br>requireAllowedPermission |
| server/packages/services/records/routes/bulk-crud.route.ts | `/records/:entity/bulk` | DELETE, PATCH | — | resolveAuth |
| server/packages/services/records/routes/entity-mutation-guard.ts | `<dynamic-or-mounted>` | UNKNOWN | — | authorizeEntityMutation<br>checkEntityMutationAuthorization<br>checkPermission |
| server/packages/services/records/routes/entity-op.registry.ts | `<dynamic-or-mounted>` | UNKNOWN | — | checkPermission |
| server/packages/services/records/routes/export.route.ts | `/records/:entity/export` | POST | `export` | checkPermissionBatch |
| server/packages/services/records/routes/export.route.ts | `/records/:entity/export/download` | GET | `export` | checkPermissionBatch |
| server/packages/services/records/routes/import.route.ts | `/records/:entity/import` | GET, POST | `import` | checkPermissionBatch |
| server/packages/services/records/routes/import.route.ts | `/records/:entity/import/:jobId` | GET | `import` | checkPermissionBatch |
| server/packages/services/records/routes/import.route.ts | `/records/:entity/import/upload` | POST | `import` | checkPermissionBatch |
| server/packages/services/records/routes/index.ts | `<dynamic-or-mounted>` | UNKNOWN | — | checkPermissionBatch<br>resolveVerifiedRequestContext |
| server/packages/services/records/routes/line-source.route.ts | `/p2p/catalog/items` | GET | — | requireTenantAuth<br>resolveVerifiedRequestContext |
| server/packages/services/records/routes/line-source.route.ts | `/p2p/open-invoices` | GET | — | requireTenantAuth<br>resolveVerifiedRequestContext |
| server/packages/services/records/routes/line-source.route.ts | `/p2p/open-po-lines` | GET | — | requireTenantAuth<br>resolveVerifiedRequestContext |
| server/packages/services/records/routes/line-source.route.ts | `/p2p/open-receipt-lines` | GET | — | requireTenantAuth<br>resolveVerifiedRequestContext |
| server/packages/services/records/routes/line-source.route.ts | `/p2p/open-requisition-lines` | GET | — | requireTenantAuth<br>resolveVerifiedRequestContext |
| server/packages/services/records/routes/line-source.route.ts | `/p2p/open-service-sheet-lines` | GET | — | requireTenantAuth<br>resolveVerifiedRequestContext |
| server/packages/services/records/routes/records.route.ts | `/records/:entity` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/_debug` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/approvals` | POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lines` | GET, POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lines/:lineId` | DELETE, PATCH | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lines/:lineId/copy` | POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lines/:lineId/distributions` | GET, POST, PUT | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lines/:lineId/distributions/:distId` | DELETE, PATCH | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lock` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lock/force` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/filter-presets/:presetId` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/op/:op` | POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity/:id/approvals` | POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity/:id/lines/:lineId/distributions/:distId` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity/:id/lock` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity/:id/lock/force` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity/filter-presets/:presetId` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity/op/:op` | POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/reference-labels/resolve` | POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `accounting_distribution` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `company_code_id` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `created_at` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `created_by` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `legal_entity_id` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `schedule_line` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `site_id` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | authorizeEntityMutation<br>authorizeLineMutation<br>checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/snapshots.route.ts | `<dynamic-or-mounted>` | UNKNOWN | `PI.SNAPSHOT_RESTORE` | checkPermission<br>requireAllow |
| server/packages/services/records/routes/supplier-intake.route.ts | `/records/supplier/check-duplicates` | POST | `supplier.banking.submit`<br>`supplier.governance.write`<br>`supplier.tax.submit` | checkPermission |
| server/packages/services/records/routes/supplier-intake.route.ts | `/records/supplier/intake` | POST | `supplier.banking.submit`<br>`supplier.governance.write`<br>`supplier.tax.submit` | checkPermission |
| server/packages/services/workflow/routes/workflow.route.ts | `/workflow/inbox` | GET | — | requireStepUp |
| server/packages/services/workflow/routes/workflow.route.ts | `/workflow/inbox/count` | GET | — | requireStepUp |
| server/packages/services/workflow/routes/workflow.route.ts | `/workflow/items/:id/action` | POST | — | requireStepUp |
| server/packages/services/workflow/routes/workflow.route.ts | `/workflow/reports/compliance` | GET | — | requireStepUp |
| server/packages/services/workflow/routes/workflow.route.ts | `/workflow/requests/:id` | GET | — | requireStepUp |
| server/packages/services/workflow/routes/workflow.route.ts | `/workflow/requests/:id/action` | POST | — | requireStepUp |
| server/packages/services/workflow/routes/workflow.route.ts | `/workflow/requests/:id/activity` | GET | — | requireStepUp |
| server/packages/services/workflow/routes/workflow.route.ts | `/workflow/requests/:id/context` | GET | — | requireStepUp |

## Contract and UI field inventory

| Field | Artifact class | Path | Lines |
|---|---|---|---|
| `accessScope` | runtime | packages/apps/neon/src/list/createNeonAdapter.ts | 55, 74, 79, 169, 171, 177, 179, 190, 199, 213 |
| `accessScope` | runtime | packages/shared/runtime-domain/runtime-list/src/adapter/types.ts | 379, 385, 395, 453 |
| `accessScope` | runtime | packages/shared/runtime-domain/runtime-list/src/core/access-scope.ts | 167 |
| `accessScope` | runtime | packages/shared/runtime-domain/runtime-list/src/core/lazy-list.ts | 87, 88, 90, 91, 92, 93, 94, 95 |
| `accessScope` | runtime | packages/shared/runtime-domain/runtime-list/src/core/presenter-props.ts | 79, 80, 81, 82, 85, 111, 112, 114, 127, 190, 203, 286, 561, 586, 603, 619, 659 |
| `accessScope` | ui | packages/shared/runtime-domain/runtime-list/src/server/runtime-list-presenter.tsx | 35, 49 |
| `accessScope` | ui | packages/shared/runtime-domain/runtime-list/src/server/runtime-list-scope-chips.tsx | 4, 7, 8, 10 |
| `activeDelegation` | contract | packages/shared/data-integration/session-plane/src/index.ts | 211, 214 |
| `activeDelegation` | runtime | packages/shared/platform-auth/auth-bff/src/index.ts | 91, 3926, 3965, 3967, 3968, 3969, 3970 |
| `activeDelegation` | contract | packages/shared/platform-auth/session-plane/src/index.ts | 229, 232 |
| `activeDelegation` | contract | packages/shared/runtime-domain/session-plane/src/index.ts | 211, 214 |
| `allowed` | ui | apps/admin/app/(shell)/setup/metadata/[entityId]/_components/StructuredContractEditor.tsx | 68 |
| `allowed` | test | apps/neon/lib/server/__tests__/record-workspace-manifest.test.ts | 22, 26 |
| `allowed` | runtime | apps/neon/lib/server/record-workspace-manifest.ts | 149, 159, 162, 195 |
| `allowed` | runtime | packages/domain/finance/finance-workbench/src/hooks/useCurrencyFxSetup.ts | 133 |
| `allowed` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyCurrencyFxSettingsPage.tsx | 57 |
| `allowed` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxAdvancedAdministration.tsx | 18 |
| `allowed` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxPolicySummary.tsx | 14 |
| `allowed` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxRateRequirements.tsx | 39 |
| `allowed` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/FxRateSettingsSection.tsx | 30, 37, 44 |
| `allowed` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/TenantFxPolicyEditor.tsx | 99 |
| `allowed` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/TenantFxSummaryPanels.tsx | 59, 68 |
| `allowed` | contract | packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v21.ts | 155 |
| `allowed` | test | packages/shared/data-integration/auth-bff/src/__tests__/required-actions-translation.test.ts | 128, 133 |
| `allowed` | contract | packages/shared/data-integration/session-plane/src/index.ts | 373 |
| `allowed` | test | packages/shared/platform-auth/auth-bff/src/__tests__/required-actions-translation.test.ts | 128, 133 |
| `allowed` | runtime | packages/shared/platform-auth/auth-bff/src/error-codes.ts | 268 |
| `allowed` | runtime | packages/shared/platform-auth/auth-bff/src/index.ts | 785, 4976, 4980 |
| `allowed` | ui | packages/shared/platform-auth/identity-gate/src/context-select-client.tsx | 281, 343 |
| `allowed` | runtime | packages/shared/platform-auth/identity-gate/src/errors.ts | 6 |
| `allowed` | contract | packages/shared/platform-auth/session-plane/src/index.ts | 395 |
| `allowed` | runtime | packages/shared/runtime-domain/runtime-canvas/src/document-runtime/use-document-affordance.ts | 35, 36, 99, 127, 137, 143, 149, 153, 156 |
| `allowed` | runtime | packages/shared/runtime-domain/runtime-canvas/src/document-runtime/use-document-rules.ts | 29 |
| `allowed` | test | packages/shared/runtime-domain/runtime-contracts/src/__tests__/effective-record-workspace.test.ts | 75, 78, 185, 188 |
| `allowed` | contract | packages/shared/runtime-domain/runtime-contracts/src/process-runtime.ts | 308, 309, 310, 311, 312, 313, 314 |
| `allowed` | contract | packages/shared/runtime-domain/runtime-contracts/src/record-workspace.ts | 168, 244, 380, 384, 386, 389 |
| `allowed` | ui | packages/shared/runtime-domain/runtime-list/src/islands/organize/group-control.tsx | 115 |
| `allowed` | contract | packages/shared/runtime-domain/session-plane/src/index.ts | 373 |
| `allowed` | tool | scripts/policy/authorization-inventory.ts | 730, 894, 911 |
| `allowed` | ddl | server/db/ddl/control/01r_tables_document_runtime_action_rules.sql | 57, 91 |
| `allowed` | ddl | server/db/ddl/log/01_tables.sql | 183 |
| `allowed` | ddl | server/db/ddl/master/05_functions.sql | 2745 |
| `allowed` | tool | server/db/scripts/authority/compile-authorization-authority.ts | 278, 280 |
| `allowed` | tool | server/db/scripts/reports/capture-authorization-golden-corpus.ts | 453, 454, 455, 456, 457, 458, 460, 461, 467, 505, 506, 507, 508, 509, 511, 512, 518, 2020, 2021 |
| `allowed` | tool | server/db/scripts/verify/verify-atlas-tools-rls.ts | 175, 176, 279, 368, 422, 459 |
| `allowed` | seed | server/db/seed/platform/003_control/042c_commitment_contract.sql | 853, 856 |
| `allowed` | seed | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 1907, 1918 |
| `allowed` | seed | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 469, 472, 473, 475, 476, 478, 487, 490, 495, 497, 507 |
| `allowed` | test | server/packages/services/ai/__tests__/ai-service-bundle.test.ts | 118 |
| `allowed` | test | server/packages/services/ai/__tests__/atlas-data-gateway.test.ts | 27, 111, 134, 167 |
| `allowed` | test | server/packages/services/ai/agent/__tests__/model-catalog.test.ts | 107, 333, 339 |
| `allowed` | runtime | server/packages/services/ai/agent/model-catalog.ts | 350, 352, 384, 386, 390, 601 |
| `allowed` | runtime | server/packages/services/ai/atlas-data-gateway.ts | 113, 123 |
| `allowed` | test | server/packages/services/ai/conversation/__tests__/atlas-thread.service.test.ts | 42 |
| `allowed` | runtime | server/packages/services/ai/conversation/atlas-thread.service.ts | 986 |
| `allowed` | test | server/packages/services/ai/retrieval/__tests__/atlas-retrieval.service.test.ts | 19, 27, 76, 78 |
| `allowed` | test | server/packages/services/ai/routes/__tests__/ai-agent.route.test.ts | 66, 489, 497, 504, 512 |
| `allowed` | route | server/packages/services/ai/routes/ai-agent.route.ts | 378 |
| `allowed` | test | server/packages/services/ai/tools/__tests__/agent-read-only-tool-executor.test.ts | 40, 46 |
| `allowed` | test | server/packages/services/ai/tools/__tests__/sql-atlas-tool-adapters.test.ts | 619, 908, 917 |
| `allowed` | runtime | server/packages/services/ai/tools/agent-read-only-tool-executor.ts | 1356, 1387 |
| `allowed` | runtime | server/packages/services/ai/tools/sql-atlas-tool-authorization-revalidator.ts | 206 |
| `allowed` | runtime | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | 34, 166, 198, 199 |
| `allowed` | runtime | server/packages/services/business/sales/sales-authorization.service.ts | 106, 107 |
| `allowed` | test | server/packages/services/documents/routes/__tests__/attachments.route.test.ts | 32 |
| `allowed` | route | server/packages/services/documents/routes/attachments.route.ts | 311 |
| `allowed` | test | server/packages/services/documents/services/__tests__/attachment-authorization.service.test.ts | 43, 78, 95, 114, 119, 135 |
| `allowed` | runtime | server/packages/services/documents/services/attachment-authorization.service.ts | 14, 15, 96, 113 |
| `allowed` | test | server/packages/services/finance/__tests__/finance-fx-slice2.integration.test.ts | 110 |
| `allowed` | test | server/packages/services/finance/__tests__/finance-fx-slice3.contract.test.ts | 50 |
| `allowed` | test | server/packages/services/finance/__tests__/finance-fx-slice6.contract.test.ts | 40, 41, 52, 53 |
| `allowed` | test | server/packages/services/finance/__tests__/finance-settings-slice7-rollout.contract.test.ts | 118, 119 |
| `allowed` | route | server/packages/services/finance/routes/ap.route.ts | 2598 |
| `allowed` | runtime | server/packages/services/finance/services/finance-fx-company-summary.service.ts | 131, 132, 133, 134 |
| `allowed` | runtime | server/packages/services/finance/services/finance-fx-contracts.ts | 6, 46, 53, 59 |
| `allowed` | test | server/packages/services/iam/__tests__/permission-context-base.test.ts | 54, 71, 72, 73, 78, 79, 80, 86 |
| `allowed` | test | server/packages/services/iam/__tests__/permission-context-matrix-tier1.test.ts | 99, 100, 115, 116, 126, 133, 134, 152, 153, 169, 171, 183, 184, 195, 196, 206, 207, 234, 246, 247 |
| `allowed` | test | server/packages/services/iam/__tests__/permission-context-resolvers.test.ts | 50, 79 |
| `allowed` | test | server/packages/services/iam/__tests__/session.integration.test.ts | 107 |
| `allowed` | test | server/packages/services/iam/__tests__/verified-request-context.test.ts | 31 |
| `allowed` | runtime | server/packages/services/iam/authorization-evaluator/evaluator.ts | 259, 302 |
| `allowed` | runtime | server/packages/services/iam/authorization-evaluator/scope.ts | 87, 101, 103 |
| `allowed` | runtime | server/packages/services/iam/authorization-evaluator/types.ts | 196 |
| `allowed` | test | server/packages/services/iam/authorization-rollout/__tests__/authorization-wave7-shadow.test.ts | 62, 278, 294, 313, 325 |
| `allowed` | runtime | server/packages/services/iam/authorization-rollout/authorization-cutover-gates.ts | 33, 96 |
| `allowed` | runtime | server/packages/services/iam/authorization-rollout/authorization-rollout.policy.ts | 416, 420, 431, 435, 438 |
| `allowed` | runtime | server/packages/services/iam/context/context-resolver.service.ts | 146, 147, 148 |
| `allowed` | runtime | server/packages/services/iam/parameters/parameter-resolver.service.ts | 224, 243 |
| `allowed` | runtime | server/packages/services/iam/permission-context/resolvers/admin-resolver.ts | 71, 83, 84, 103, 116 |
| `allowed` | runtime | server/packages/services/iam/permission-context/resolvers/mesh-resolver.ts | 95, 113, 114, 131, 144 |
| `allowed` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 96, 103, 108, 119, 280, 286, 302, 303, 321 |
| `allowed` | runtime | server/packages/services/iam/permission-context/types.ts | 48, 115 |
| `allowed` | runtime | server/packages/services/iam/permission/permission.service.ts | 427 |
| `allowed` | test | server/packages/services/iam/providers/__tests__/tenant-identity-provider.test.ts | 51, 58, 59 |
| `allowed` | route | server/packages/services/iam/routes/company-code-access.routes.ts | 244, 245, 323, 324 |
| `allowed` | route | server/packages/services/iam/routes/identity-provider.routes.ts | 107 |
| `allowed` | route | server/packages/services/iam/routes/parameter.routes.ts | 369, 370, 371 |
| `allowed` | test | server/packages/services/iam/support/__tests__/atlas-support-session.service.test.ts | 67, 74 |
| `allowed` | runtime | server/packages/services/iam/support/atlas-support-session.service.ts | 353 |
| `allowed` | route | server/packages/services/metadata/routes/document-runtime-registry.route.ts | 93, 312 |
| `allowed` | route | server/packages/services/metadata/routes/entity-operations.route.ts | 101, 104, 186 |
| `allowed` | route | server/packages/services/metadata/routes/mesh-runtime.route.ts | 329, 343, 364 |
| `allowed` | route | server/packages/services/metadata/routes/runtime-bootstrap.route.ts | 195, 349, 358, 373, 381 |
| `allowed` | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 539 |
| `allowed` | route | server/packages/services/metadata/routes/studio-contract-v21.route.ts | 78 |
| `allowed` | route | server/packages/services/metadata/routes/studio-version.route.ts | 104, 416 |
| `allowed` | test | server/packages/services/metadata/src/execution-descriptor/__tests__/runtime-bootstrap.test.ts | 109 |
| `allowed` | runtime | server/packages/services/metadata/src/tenant-overlay-resolver.ts | 145, 146, 148 |
| `allowed` | test | server/packages/services/records/__tests__/entity-mutation-service.test.ts | 22 |
| `allowed` | runtime | server/packages/services/records/lifecycle/execute-lifecycle-transition.ts | 433 |
| `allowed` | runtime | server/packages/services/records/mutation/entity-mutation.service.ts | 123, 159, 173, 288, 396, 433, 457, 514, 549, 579, 639 |
| `allowed` | route | server/packages/services/records/routes/entity-mutation-guard.ts | 214, 238, 246, 264 |
| `allowed` | route | server/packages/services/records/routes/records.route.ts | 5405, 5457, 10093, 10109 |
| `allowed` | tool | server/scripts/verify-contact-role-allowed-coverage.ts | 214 |
| `allowed` | test | server/src/__tests__/atlas-record-data-gateway.test.ts | 37 |
| `allowed` | runtime | server/src/atlas-record-data-gateway.ts | 57, 63, 65 |
| `allowed` | test | server/src/auth/__tests__/auth-pipeline.test.ts | 331, 336 |
| `allowed` | test | server/src/kernel/__tests__/auth-flag-validator.test.ts | 596, 610 |
| `allowed` | runtime | server/src/kernel/auth-flag-validator.ts | 222, 223 |
| `allowed` | keycloak | stack/config/iam/protocol-mappers/allowed-tenants.mapper.json | 2 |
| `allowed` | keycloak | stack/config/iam/realm-athyper.json | 2276, 2286, 2288, 3237, 3265, 3269, 3284, 3296, 3300 |
| `allowed` | keycloak | stack/config/iam/realm-platform-control.json | 213, 222, 224 |
| `authorizationScopes` | test | server/packages/services/ai/__tests__/ai-service-bundle.test.ts | 123 |
| `authorizationScopes` | test | server/packages/services/ai/__tests__/atlas-data-gateway.test.ts | 32 |
| `authorizationScopes` | test | server/packages/services/ai/agent/__tests__/model-catalog.test.ts | 112 |
| `authorizationScopes` | test | server/packages/services/ai/conversation/__tests__/atlas-thread.service.test.ts | 47 |
| `authorizationScopes` | test | server/packages/services/ai/retrieval/__tests__/atlas-retrieval.service.test.ts | 21 |
| `authorizationScopes` | test | server/packages/services/ai/routes/__tests__/ai-agent.route.test.ts | 71 |
| `authorizationScopes` | test | server/packages/services/ai/tools/__tests__/agent-read-only-tool-executor.test.ts | 51 |
| `authorizationScopes` | test | server/packages/services/ai/tools/__tests__/sql-atlas-tool-adapters.test.ts | 632, 652, 880, 920 |
| `authorizationScopes` | runtime | server/packages/services/ai/tools/sql-atlas-tool-authorization-revalidator.ts | 23, 196, 197 |
| `authorizationScopes` | runtime | server/packages/services/iam/permission-context/resolvers/admin-resolver.ts | 121 |
| `authorizationScopes` | runtime | server/packages/services/iam/permission-context/resolvers/mesh-resolver.ts | 149 |
| `authorizationScopes` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 99, 124 |
| `authorizationScopes` | runtime | server/packages/services/iam/permission-context/types.ts | 125 |
| `authorizationScopes` | test | server/packages/services/iam/support/__tests__/atlas-support-session.service.test.ts | 79 |
| `authorizationScopes` | test | server/src/__tests__/atlas-record-data-gateway.test.ts | 42 |
| `authorizationScopes` | runtime | server/src/atlas-record-data-gateway.ts | 59 |
| `delegatorPersona` | runtime | packages/shared/platform-auth/auth-bff/src/index.ts | 95, 836, 3918, 3970 |
| `denied` | ui | apps/admin/app/(shell)/setup/metadata/[entityId]/_components/PolicyTab.tsx | 89 |
| `denied` | test | apps/neon/lib/server/__tests__/record-workspace-manifest.test.ts | 22, 27 |
| `denied` | runtime | apps/neon/lib/server/document-edit-workspace-validation.ts | 103 |
| `denied` | runtime | apps/neon/lib/server/record-workspace-manifest.ts | 150, 157, 162, 196 |
| `denied` | contract | packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v21.ts | 155 |
| `denied` | runtime | packages/shared/runtime-domain/runtime-canvas/src/document-runtime/use-document-rules.ts | 29 |
| `denied` | test | packages/shared/runtime-domain/runtime-contracts/src/__tests__/effective-record-workspace.test.ts | 76, 79, 186, 188 |
| `denied` | contract | packages/shared/runtime-domain/runtime-contracts/src/record-workspace.ts | 159, 381, 385, 386, 389 |
| `denied` | test | packages/shared/runtime-domain/runtime-line-item/src/adapters/__tests__/catalog.integration.test.tsx | 145 |
| `denied` | test | packages/shared/runtime-domain/runtime-line-item/src/adapters/__tests__/open-po-line.integration.test.tsx | 156 |
| `denied` | test | packages/shared/runtime-domain/runtime-line-item/src/adapters/__tests__/open-receipt-line.integration.test.tsx | 174 |
| `denied` | test | packages/shared/runtime-domain/runtime-line-item/src/adapters/__tests__/open-service-sheet-line.integration.test.tsx | 183 |
| `denied` | runtime | packages/shared/runtime-domain/runtime-list/src/core/access-scope.ts | 90, 95, 262, 266, 270, 381 |
| `denied` | test | packages/shared/runtime-line-item/src/adapters/__tests__/catalog.integration.test.tsx | 145 |
| `denied` | test | packages/shared/runtime-line-item/src/adapters/__tests__/open-po-line.integration.test.tsx | 156 |
| `denied` | test | packages/shared/runtime-line-item/src/adapters/__tests__/open-receipt-line.integration.test.tsx | 174 |
| `denied` | test | packages/shared/runtime-line-item/src/adapters/__tests__/open-service-sheet-line.integration.test.tsx | 183 |
| `denied` | test | packages/shared/ui-platform/atlas-agent-ui/src/shell/atlas-shell-wrapper.test.tsx | 120 |
| `denied` | ui | packages/shared/ui-platform/dashboard-ui/src/dashboard.tsx | 122 |
| `denied` | runtime | packages/platform/communications/notifications-client/src/hooks/use-push-subscription.ts | 52, 73 |
| `denied` | tool | scripts/policy/authorization-inventory.ts | 731 |
| `denied` | ddl | server/db/ddl/control/01r_tables_document_runtime_action_rules.sql | 57, 92, 97 |
| `denied` | ddl | server/db/ddl/event/01f_tables_ai_tool_invocation.sql | 129 |
| `denied` | ddl | server/db/ddl/event/06c_triggers_ai_tool_invocation.sql | 123 |
| `denied` | tool | server/db/scripts/reports/capture-authorization-golden-corpus.ts | 390, 391, 392, 393, 394, 395, 396, 397, 398, 399, 489, 490, 491, 492, 493, 494 |
| `denied` | tool | server/db/scripts/verify/verify-atlas-tools-rls.ts | 340, 341, 343, 345 |
| `denied` | seed | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 1910, 1925, 1927 |
| `denied` | seed | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 31, 44 |
| `denied` | test | server/packages/services/ai/__tests__/ai-service-bundle.test.ts | 119 |
| `denied` | test | server/packages/services/ai/__tests__/atlas-data-gateway.test.ts | 28 |
| `denied` | test | server/packages/services/ai/agent/__tests__/model-catalog.test.ts | 108 |
| `denied` | runtime | server/packages/services/ai/agent/model-catalog.ts | 602 |
| `denied` | runtime | server/packages/services/ai/atlas-data-gateway.ts | 110 |
| `denied` | test | server/packages/services/ai/conversation/__tests__/atlas-thread.service.test.ts | 43 |
| `denied` | runtime | server/packages/services/ai/conversation/atlas-thread.service.ts | 987 |
| `denied` | test | server/packages/services/ai/retrieval/__tests__/atlas-retrieval.service.test.ts | 20 |
| `denied` | test | server/packages/services/ai/routes/__tests__/ai-agent.route.test.ts | 67, 486, 490 |
| `denied` | route | server/packages/services/ai/routes/ai-agent.route.ts | 379 |
| `denied` | test | server/packages/services/ai/tools/__tests__/agent-read-only-tool-executor.test.ts | 47, 418, 419, 425, 426 |
| `denied` | test | server/packages/services/ai/tools/__tests__/sql-atlas-tool-adapters.test.ts | 430, 439, 909 |
| `denied` | runtime | server/packages/services/ai/tools/agent-read-only-tool-executor.ts | 77, 647, 837, 892, 902, 1093, 1094, 1346, 1357, 1388, 1542, 1543 |
| `denied` | runtime | server/packages/services/ai/tools/atlas-tool.types.ts | 466, 521 |
| `denied` | runtime | server/packages/services/ai/tools/sql-atlas-tool-authorization-revalidator.ts | 207 |
| `denied` | runtime | server/packages/services/ai/tools/sql-atlas-tool-execution-recorder.ts | 107 |
| `denied` | test | server/packages/services/iam/__tests__/permission-context-resolvers.test.ts | 51 |
| `denied` | test | server/packages/services/iam/__tests__/verified-request-context.test.ts | 32 |
| `denied` | runtime | server/packages/services/iam/authorization-evaluator/scope.ts | 90, 93 |
| `denied` | runtime | server/packages/services/iam/authorization-runtime/consumer-enforcement.ts | 51 |
| `denied` | runtime | server/packages/services/iam/permission-context/resolvers/admin-resolver.ts | 72, 77, 87, 117 |
| `denied` | runtime | server/packages/services/iam/permission-context/resolvers/mesh-resolver.ts | 94, 101, 107, 118, 145 |
| `denied` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 96, 120, 281, 287, 306, 321 |
| `denied` | runtime | server/packages/services/iam/permission-context/types.ts | 117 |
| `denied` | runtime | server/packages/services/iam/permission/permission.service.ts | 615 |
| `denied` | route | server/packages/services/iam/routes/discovery.routes.ts | 72 |
| `denied` | test | server/packages/services/iam/support/__tests__/atlas-support-session.service.test.ts | 75, 214, 217 |
| `denied` | runtime | server/packages/services/iam/support/atlas-support-session.service.ts | 354 |
| `denied` | route | server/packages/services/metadata/routes/document-runtime-registry.route.ts | 93, 312 |
| `denied` | route | server/packages/services/metadata/routes/entity-operations.route.ts | 101, 105, 186 |
| `denied` | route | server/packages/services/metadata/routes/mesh-runtime.route.ts | 329, 343, 363 |
| `denied` | route | server/packages/services/metadata/routes/runtime-bootstrap.route.ts | 195, 349, 357, 373, 379, 380 |
| `denied` | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 540 |
| `denied` | route | server/packages/services/metadata/routes/studio-contract-v21.route.ts | 79 |
| `denied` | route | server/packages/services/metadata/routes/studio-version.route.ts | 105, 417 |
| `denied` | test | server/packages/services/metadata/src/execution-descriptor/__tests__/runtime-bootstrap.test.ts | 109, 134 |
| `denied` | test | server/packages/services/records/__tests__/entity-mutation-service.test.ts | 23 |
| `denied` | runtime | server/packages/services/records/lifecycle/execute-lifecycle-transition.ts | 430 |
| `denied` | route | server/packages/services/records/routes/action-dispatcher.route.ts | 1391 |
| `denied` | test | server/src/__tests__/atlas-record-data-gateway.test.ts | 38 |
| `denied` | test | tests/e2e/production/surface-matrix.spec.ts | 113 |
| `groupIds` | tool | scripts/policy/authorization-inventory.ts | 732, 752 |
| `groupIds` | test | server/packages/services/iam/__tests__/permission-context-base.test.ts | 22, 27, 33, 34, 39, 40, 45, 46, 47 |
| `groupIds` | test | server/packages/services/iam/__tests__/permission-context-matrix-tier1.test.ts | 83, 88, 97, 129, 130, 139, 140, 145, 146, 151 |
| `groupIds` | runtime | server/packages/services/iam/outbox/iam-outbox-worker.ts | 161, 162, 167, 192, 202, 215, 219, 221 |
| `groupIds` | runtime | server/packages/services/iam/permission-context/resolvers/admin-resolver.ts | 68 |
| `groupIds` | runtime | server/packages/services/iam/permission-context/resolvers/base.ts | 45, 49 |
| `groupIds` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 82 |
| `groupIds` | runtime | server/packages/services/iam/permission/company-code-scope.service.ts | 263, 266, 272 |
| `groupIds` | route | server/packages/services/platform/routes/platform.route.ts | 2787, 2789, 2795, 2836, 2848 |
| `groupIds` | runtime | server/packages/services/workflow/active-approver.service.ts | 78, 81, 87 |
| `matchedGrantId` | tool | scripts/policy/authorization-inventory.ts | 752 |
| `matchedGrantId` | route | server/packages/services/audit/routes/audit.route.ts | 118 |
| `matchedGroupId` | tool | scripts/policy/authorization-inventory.ts | 752 |
| `matchedGroupId` | route | server/packages/services/audit/routes/audit.route.ts | 120 |
| `matchedRoleId` | tool | scripts/policy/authorization-inventory.ts | 752 |
| `matchedRoleId` | route | server/packages/services/audit/routes/audit.route.ts | 119 |
| `permissionCode` | test | apps/neon/lib/server/__tests__/record-workspace-manifest.test.ts | 59, 60 |
| `permissionCode` | runtime | apps/neon/lib/server/meta-entity-descriptor-health.ts | 150 |
| `permissionCode` | runtime | apps/neon/lib/server/meta-entity-write-validation.ts | 252, 270, 272, 348, 349 |
| `permissionCode` | runtime | apps/neon/lib/server/record-workspace-manifest.ts | 153 |
| `permissionCode` | runtime | config/governance/authorization-golden-corpus.schema.json | 172, 194, 998, 1008, 1031, 1062 |
| `permissionCode` | runtime | config/governance/authorization-supplemental-decision-evidence.schema.json | 164, 174, 197, 228 |
| `permissionCode` | ui | packages/product-deprecated/runtime-ui/document-runtime/src/composite/ChildRecordRepeater.tsx | 49, 74, 87 |
| `permissionCode` | ui | packages/product-deprecated/runtime-ui/document-runtime/src/composite/CompositeFlowWizard.tsx | 338 |
| `permissionCode` | ui | packages/product-deprecated/runtime-ui/document-runtime/src/intake/FlowWizard.tsx | 140, 141 |
| `permissionCode` | ui | packages/product-deprecated/runtime-ui/entity-runtime/src/actions/ActionBar.tsx | 144, 177, 179, 220, 223, 254, 257, 281 |
| `permissionCode` | runtime | packages/product-deprecated/runtime-ui/entity-runtime/src/header/builders/buildMasterHeaderModel.ts | 43, 44 |
| `permissionCode` | contract | packages/shared/data-integration/api-contracts/src/schemas/metadata.ts | 886 |
| `permissionCode` | runtime | packages/shared/data-integration/metadata-client/src/operation-reader.ts | 13, 45 |
| `permissionCode` | contract | packages/shared/data-integration/session-plane/src/index.ts | 181, 183, 202, 206, 212, 214 |
| `permissionCode` | contract | packages/shared/platform-auth/session-plane/src/index.ts | 199, 201, 220, 224, 230, 232 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-add-item/src/adapter/__tests__/registry.test.ts | 104, 123, 127 |
| `permissionCode` | runtime | packages/shared/runtime-domain/runtime-add-item/src/adapter/registry.ts | 134 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-add-item/src/controller/__tests__/controller.test.tsx | 47 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-add-item/src/test-harness/synthetic-adapter.ts | 53, 159 |
| `permissionCode` | runtime | packages/shared/runtime-domain/runtime-bulk-actions/src/map-operations-to-actions.ts | 23 |
| `permissionCode` | ui | packages/shared/runtime-domain/runtime-canvas/src/address-contact/address-contact-panel.tsx | 62 |
| `permissionCode` | ui | packages/shared/runtime-domain/runtime-canvas/src/index.tsx | 799, 800 |
| `permissionCode` | ui | packages/shared/runtime-domain/runtime-canvas/src/list/runtime-list-page.tsx | 497, 498 |
| `permissionCode` | runtime | packages/shared/runtime-domain/runtime-canvas/src/operation-utils.ts | 8 |
| `permissionCode` | ui | packages/shared/runtime-domain/runtime-canvas/src/record/runtime-header-model.tsx | 929, 930 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-contracts/src/__tests__/compiler.test.ts | 808 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-contracts/src/__tests__/effective-record-workspace.test.ts | 72, 100, 110, 140, 141, 179 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-contracts/src/__tests__/process-runtime.test.ts | 153, 154, 155, 197, 199 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-contracts/src/__tests__/schemas-phase1.test.ts | 12, 243 |
| `permissionCode` | contract | packages/shared/runtime-domain/runtime-contracts/src/compiler.ts | 185, 1552, 1557, 1558, 1669, 2240, 2245, 2250 |
| `permissionCode` | contract | packages/shared/runtime-domain/runtime-contracts/src/process-runtime.ts | 247, 309, 310, 341, 342, 376, 377 |
| `permissionCode` | contract | packages/shared/runtime-domain/runtime-contracts/src/record-workspace.ts | 151, 152, 158, 162, 171, 175, 182, 189, 190, 251, 292, 293, 296, 297 |
| `permissionCode` | contract | packages/shared/runtime-domain/runtime-contracts/src/schemas.ts | 221, 386, 817, 830, 903, 915, 1028 |
| `permissionCode` | contract | packages/shared/runtime-domain/runtime-contracts/src/source-adapter.ts | 222 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-line-item/src/adapters/__tests__/catalog.integration.test.tsx | 63, 73, 74, 169, 170 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-line-item/src/adapters/__tests__/open-po-line.integration.test.tsx | 73, 84, 85 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-line-item/src/adapters/__tests__/open-receipt-line.integration.test.tsx | 84, 95, 96 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-line-item/src/adapters/__tests__/open-service-sheet-line.integration.test.tsx | 87, 98, 99, 100 |
| `permissionCode` | runtime | packages/shared/runtime-domain/runtime-line-item/src/adapters/catalog.ts | 128, 144, 145 |
| `permissionCode` | runtime | packages/shared/runtime-domain/runtime-line-item/src/adapters/manual-invoice-line.ts | 70 |
| `permissionCode` | runtime | packages/shared/runtime-domain/runtime-line-item/src/adapters/open-po-line.ts | 132, 147, 148 |
| `permissionCode` | runtime | packages/shared/runtime-domain/runtime-line-item/src/adapters/open-receipt-line.ts | 152, 166, 167 |
| `permissionCode` | runtime | packages/shared/runtime-domain/runtime-line-item/src/adapters/open-service-sheet-line.ts | 162, 179, 180, 181 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-line-item/src/surface/__tests__/resolve-line-selection-actions.test.ts | 8, 36, 54 |
| `permissionCode` | runtime | packages/shared/runtime-domain/runtime-line-item/src/surface/resolve-line-selection-actions.ts | 33, 66 |
| `permissionCode` | runtime | packages/shared/runtime-domain/runtime-list/src/adapter/meta-entity-descriptor.ts | 566 |
| `permissionCode` | runtime | packages/shared/runtime-domain/runtime-list/src/core/presenter-props.ts | 361, 373, 376, 378 |
| `permissionCode` | test | packages/shared/runtime-domain/runtime-shared/src/meta-entity/__tests__/runtime-contract-adapters.test.ts | 40 |
| `permissionCode` | runtime | packages/shared/runtime-domain/runtime-shared/src/meta-entity/runtime-contract-adapters.ts | 118 |
| `permissionCode` | contract | packages/shared/runtime-domain/session-plane/src/index.ts | 181, 183, 202, 206, 212, 214 |
| `permissionCode` | test | packages/shared/runtime-line-item/src/adapters/__tests__/catalog.integration.test.tsx | 63, 73, 74, 169, 170 |
| `permissionCode` | test | packages/shared/runtime-line-item/src/adapters/__tests__/open-po-line.integration.test.tsx | 73, 84, 85 |
| `permissionCode` | test | packages/shared/runtime-line-item/src/adapters/__tests__/open-receipt-line.integration.test.tsx | 84, 95, 96 |
| `permissionCode` | test | packages/shared/runtime-line-item/src/adapters/__tests__/open-service-sheet-line.integration.test.tsx | 87, 98, 99, 100 |
| `permissionCode` | runtime | packages/shared/runtime-line-item/src/adapters/catalog.ts | 128, 144, 145 |
| `permissionCode` | runtime | packages/shared/runtime-line-item/src/adapters/manual-invoice-line.ts | 70 |
| `permissionCode` | runtime | packages/shared/runtime-line-item/src/adapters/open-po-line.ts | 132, 147, 148 |
| `permissionCode` | runtime | packages/shared/runtime-line-item/src/adapters/open-receipt-line.ts | 152, 166, 167 |
| `permissionCode` | runtime | packages/shared/runtime-line-item/src/adapters/open-service-sheet-line.ts | 162, 179, 180, 181 |
| `permissionCode` | test | packages/shared/runtime-line-item/src/surface/__tests__/resolve-line-selection-actions.test.ts | 8, 36, 54 |
| `permissionCode` | runtime | packages/shared/runtime-line-item/src/surface/resolve-line-selection-actions.ts | 33, 66 |
| `permissionCode` | tool | scripts/policy/authorization-inventory.ts | 894, 912 |
| `permissionCode` | tool | server/db/scripts/reports/capture-authorization-golden-corpus.ts | 63, 75, 602, 766, 768, 1443, 1460, 1461, 1462, 1505, 1546, 1547, 1548, 1552, 1613 |
| `permissionCode` | tool | server/db/scripts/reports/report-authorization-data-quality.ts | 624, 649 |
| `permissionCode` | tool | server/db/scripts/reports/verify-authorization-golden-corpus.ts | 727, 768, 792, 855 |
| `permissionCode` | test | server/packages/services/ai/__tests__/atlas-data-gateway.test.ts | 13, 27, 134, 135 |
| `permissionCode` | runtime | server/packages/services/ai/agent/model-catalog.ts | 586, 601, 602, 603, 604 |
| `permissionCode` | runtime | server/packages/services/ai/atlas-data-gateway.ts | 15, 110, 111, 112, 113, 118, 180 |
| `permissionCode` | test | server/packages/services/ai/retrieval/__tests__/atlas-retrieval.service.test.ts | 36 |
| `permissionCode` | runtime | server/packages/services/ai/retrieval/atlas-retrieval.service.ts | 64 |
| `permissionCode` | runtime | server/packages/services/ai/retrieval/atlas-retrieval.types.ts | 8 |
| `permissionCode` | route | server/packages/services/ai/routes/ai-agent.route.ts | 376, 378, 379, 380, 381 |
| `permissionCode` | test | server/packages/services/ai/tools/__tests__/agent-read-only-tool-executor.test.ts | 830, 863 |
| `permissionCode` | test | server/packages/services/ai/tools/__tests__/record-lookup.tool.test.ts | 36 |
| `permissionCode` | test | server/packages/services/ai/tools/__tests__/sql-atlas-tool-adapters.test.ts | 887 |
| `permissionCode` | runtime | server/packages/services/ai/tools/agent-read-only-tool-executor.ts | 926 |
| `permissionCode` | runtime | server/packages/services/ai/tools/record-lookup.tool.ts | 189 |
| `permissionCode` | runtime | server/packages/services/ai/tools/sql-atlas-tool-authorization-revalidator.ts | 218 |
| `permissionCode` | route | server/packages/services/audit/routes/audit.route.ts | 108, 443, 463 |
| `permissionCode` | runtime | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | 19, 191, 193 |
| `permissionCode` | runtime | server/packages/services/business/sales/sales-authorization.service.ts | 13, 101, 102 |
| `permissionCode` | runtime | server/packages/services/documents/services/attachment-authorization.service.ts | 80, 81, 85 |
| `permissionCode` | route | server/packages/services/finance/routes/finance-setup.route.ts | 909, 965, 969 |
| `permissionCode` | test | server/packages/services/iam/authorization-rollout/__tests__/authorization-decision-router.test.ts | 23 |
| `permissionCode` | test | server/packages/services/iam/authorization-rollout/__tests__/authorization-rollout.service.test.ts | 126, 141, 151, 160, 170, 193, 210, 261, 294, 323, 354 |
| `permissionCode` | test | server/packages/services/iam/authorization-rollout/__tests__/authorization-wave7-shadow.test.ts | 24, 46 |
| `permissionCode` | runtime | server/packages/services/iam/authorization-rollout/authorization-decision-router.ts | 130 |
| `permissionCode` | runtime | server/packages/services/iam/authorization-rollout/authorization-rollout.policy.ts | 177, 208, 357, 398 |
| `permissionCode` | runtime | server/packages/services/iam/authorization-rollout/authorization-rollout.service.ts | 103 |
| `permissionCode` | runtime | server/packages/services/iam/authorization-rollout/authorization-rollout.types.ts | 80, 110 |
| `permissionCode` | runtime | server/packages/services/iam/authorization-rollout/authorization-shadow-comparison.ts | 82, 337, 385 |
| `permissionCode` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 262 |
| `permissionCode` | runtime | server/packages/services/iam/permission-context/types.ts | 59 |
| `permissionCode` | runtime | server/packages/services/iam/permission/permission.service.ts | 68, 78, 174, 185, 627, 644 |
| `permissionCode` | route | server/packages/services/iam/routes/iam-admin.routes.ts | 97, 109 |
| `permissionCode` | route | server/packages/services/iam/routes/iam.routes.ts | 83, 84, 93, 97 |
| `permissionCode` | route | server/packages/services/master/routes/owner-address-contact.route.ts | 20, 58, 60, 140, 396 |
| `permissionCode` | route | server/packages/services/metadata/routes/compiled-entity.route.ts | 1027 |
| `permissionCode` | route | server/packages/services/metadata/routes/entity-operations.route.ts | 609, 610 |
| `permissionCode` | route | server/packages/services/metadata/routes/metadata-admin.route.ts | 104, 105, 163, 164, 183, 192, 196, 199, 747, 748, 750, 751, 752, 763 |
| `permissionCode` | route | server/packages/services/metadata/routes/runtime-bootstrap.route.ts | 353 |
| `permissionCode` | test | server/packages/services/metadata/src/__tests__/entity-capability-manifest.test.ts | 31, 32, 33, 128, 217, 230 |
| `permissionCode` | runtime | server/packages/services/metadata/src/entity-capability-manifest.ts | 14, 126, 250, 388, 393, 462, 479 |
| `permissionCode` | runtime | server/packages/services/metadata/src/entity-compiler.service.ts | 2137 |
| `permissionCode` | test | server/packages/services/metadata/src/execution-descriptor/__tests__/compiler.test.ts | 88, 89, 154, 155, 156 |
| `permissionCode` | test | server/packages/services/metadata/src/execution-descriptor/__tests__/runtime-bootstrap.test.ts | 176, 181 |
| `permissionCode` | runtime | server/packages/services/metadata/src/execution-descriptor/contract.ts | 11 |
| `permissionCode` | runtime | server/packages/services/platform/platform-guard.ts | 45, 59, 63 |
| `permissionCode` | route | server/packages/services/platform/routes/commerce.route.ts | 691, 703, 706, 736, 747, 751, 766, 1152, 1161, 1162, 1191, 1202, 1205, 1206, 1216, 1465, 1466, 1478, 1479 |
| `permissionCode` | test | server/packages/services/records/__tests__/entity-mutation-service.test.ts | 39, 40, 156, 179, 180, 253, 254, 270, 271, 272 |
| `permissionCode` | runtime | server/packages/services/records/lifecycle/execute-lifecycle-transition.ts | 461 |
| `permissionCode` | runtime | server/packages/services/records/mutation/entity-mutation-http.ts | 39 |
| `permissionCode` | runtime | server/packages/services/records/mutation/entity-mutation.service.ts | 638, 639 |
| `permissionCode` | runtime | server/packages/services/records/mutation/entity-mutation.types.ts | 63 |
| `permissionCode` | route | server/packages/services/records/routes/action-dispatcher.route.ts | 209, 226, 1350, 1351, 1365, 1366 |
| `permissionCode` | route | server/packages/services/records/routes/entity-mutation-guard.ts | 632, 633, 638, 639 |
| `permissionCode` | route | server/packages/services/records/routes/entity-op.registry.ts | 238, 246 |
| `permissionCode` | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 94 |
| `permissionCode` | test | server/packages/services/workflow/__tests__/workflow-runtime.test.ts | 50, 109 |
| `permissionCode` | runtime | server/packages/services/workflow/operation-authorizer.ts | 13, 31, 83, 100, 151 |
| `permissionCode` | test | server/src/__tests__/atlas-record-data-gateway.test.ts | 17, 103, 140 |
| `permissionCode` | runtime | server/src/atlas-record-data-gateway.ts | 55 |
| `permissionCode` | runtime | server/src/runtimes/api.ts | 1200, 1205, 1226 |
| `permissionCodes` | contract | packages/shared/data-integration/session-plane/src/index.ts | 188, 190, 195, 197 |
| `permissionCodes` | contract | packages/shared/platform-auth/session-plane/src/index.ts | 206, 208, 213, 215 |
| `permissionCodes` | contract | packages/shared/runtime-domain/session-plane/src/index.ts | 188, 190, 195, 197 |
| `permissionCodes` | tool | scripts/policy/authorization-inventory.ts | 180, 971, 973, 1003, 2038 |
| `permissionCodes` | tool | server/db/scripts/catalog/compile-authorization-catalog.ts | 398, 410, 517 |
| `permissionCodes` | test | server/packages/services/ai/agent/__tests__/model-catalog.test.ts | 100, 107 |
| `permissionCodes` | test | server/packages/services/ai/tools/__tests__/agent-read-only-tool-executor.test.ts | 787 |
| `permissionCodes` | test | server/packages/services/ai/tools/__tests__/record-lookup.tool.test.ts | 68 |
| `permissionCodes` | runtime | server/packages/services/ai/tools/agent-read-only-tool-executor.ts | 925 |
| `permissionCodes` | runtime | server/packages/services/ai/tools/atlas-tool-schema.ts | 257, 261, 262, 266, 268, 271 |
| `permissionCodes` | runtime | server/packages/services/ai/tools/atlas-tool.types.ts | 90 |
| `permissionCodes` | runtime | server/packages/services/ai/tools/record-lookup.tool.ts | 164 |
| `permissionCodes` | test | server/packages/services/iam/authorization-rollout/__tests__/authorization-rollout.service.test.ts | 55, 228, 308 |
| `permissionCodes` | test | server/packages/services/iam/authorization-rollout/__tests__/authorization-wave7-shadow.test.ts | 60, 98, 120, 127, 135, 136, 208 |
| `permissionCodes` | runtime | server/packages/services/iam/authorization-rollout/authorization-rollout.policy.ts | 61, 237, 238, 240, 242, 288, 357 |
| `permissionCodes` | runtime | server/packages/services/iam/authorization-rollout/authorization-rollout.types.ts | 56 |
| `permissionCodes` | runtime | server/packages/services/iam/authorization-rollout/authorization-shadow-comparison.ts | 64, 279, 294, 330, 337 |
| `permissionCodes` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 239, 241 |
| `permissionCodes` | route | server/packages/services/metadata/routes/entity-flow.route.ts | 615, 628, 639 |
| `permissionCodes` | route | server/packages/services/metadata/routes/metadata-admin.route.ts | 286, 288 |
| `permissionCodes` | test | server/packages/services/metadata/src/__tests__/contract-application-v21.test.ts | 306 |
| `permissionCodes` | runtime | server/packages/services/metadata/src/contract-application/contract-application.service.ts | 45 |
| `permissionCodes` | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 267, 278, 279, 304 |
| `permissions` | ui | apps/admin/app/(shell)/settings/SettingsClient.tsx | 23, 44, 60, 77 |
| `permissions` | ui | apps/admin/app/(shell)/setup/metadata/[entityId]/_components/MetaEntityContractWorkspace.tsx | 34, 60, 108, 130, 140, 141 |
| `permissions` | ui | apps/admin/app/(shell)/setup/metadata/[entityId]/_components/StructuredContractEditor.tsx | 43 |
| `permissions` | ui | apps/mesh/app/(shell)/settings/SettingsClient.tsx | 23, 44, 60, 77 |
| `permissions` | ui | apps/neon/app/(shell)/settings/SettingsClient.tsx | 22, 42, 58, 71 |
| `permissions` | test | apps/neon/app/api/runtime/v1/__tests__/document-edit-workspace.test.ts | 195, 251 |
| `permissions` | route | apps/neon/app/api/runtime/v1/entities/[entity]/[id]/edit/open/route.ts | 84 |
| `permissions` | test | apps/neon/lib/server/__tests__/record-workspace-manifest.test.ts | 24, 26, 27, 28, 56 |
| `permissions` | test | apps/neon/lib/server/__tests__/runtime-saved-views.test.ts | 35 |
| `permissions` | runtime | apps/neon/lib/server/document-edit-coordinator-identity.ts | 57 |
| `permissions` | runtime | apps/neon/lib/server/document-edit-runtime-security.ts | 58, 66 |
| `permissions` | runtime | apps/neon/lib/server/document-edit-workspace-validation.ts | 111, 113 |
| `permissions` | runtime | apps/neon/lib/server/record-workspace-manifest.ts | 121, 128, 135, 171, 195, 196 |
| `permissions` | runtime | config/governance/meta-entity-contract-v2-coverage.json | 6998, 7042 |
| `permissions` | runtime | packages/domain/finance/finance-workbench/src/hooks/useCurrencyFxSetup.ts | 127, 175 |
| `permissions` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyCurrencyFxSettingsPage.tsx | 51, 57 |
| `permissions` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxAdvancedAdministration.tsx | 18 |
| `permissions` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxPolicySummary.tsx | 14 |
| `permissions` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxRateRequirements.tsx | 39 |
| `permissions` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/FxRateSettingsSection.tsx | 8, 11, 30, 31, 37, 38, 44, 45 |
| `permissions` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/TenantCurrencyFxSettingsPage.tsx | 55 |
| `permissions` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/TenantFxPolicyEditor.tsx | 99, 172 |
| `permissions` | ui | packages/domain/finance/finance-workbench/src/views/currency-fx/TenantFxSummaryPanels.tsx | 59, 64, 68, 73 |
| `permissions` | ui | packages/product-deprecated/runtime-ui/document-runtime/src/pages/DocumentDetailPage.tsx | 1207 |
| `permissions` | runtime | packages/product-deprecated/runtime-ui/entity-runtime/src/header/types.ts | 441 |
| `permissions` | contract | packages/shared/data-integration/api-contracts/src/query-keys.ts | 309 |
| `permissions` | contract | packages/shared/data-integration/api-contracts/src/schemas/dashboard.ts | 27 |
| `permissions` | contract | packages/shared/data-integration/api-contracts/src/schemas/iam.ts | 43, 76 |
| `permissions` | contract | packages/shared/data-integration/api-contracts/src/schemas/me.ts | 125 |
| `permissions` | contract | packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v2.ts | 682, 683 |
| `permissions` | contract | packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v21-upgrade.ts | 203 |
| `permissions` | contract | packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v21.ts | 81, 645 |
| `permissions` | contract | packages/shared/data-integration/api-contracts/src/schemas/platform.ts | 21 |
| `permissions` | contract | packages/shared/data-integration/session-plane/src/index.ts | 154, 172, 180, 183, 187, 190, 194, 197, 201, 206 |
| `permissions` | runtime | packages/shared/platform-auth/identity-gate/src/experience.ts | 120 |
| `permissions` | contract | packages/shared/platform-auth/session-plane/src/index.ts | 172, 190, 198, 201, 205, 208, 212, 215, 219, 224 |
| `permissions` | test | packages/shared/runtime-domain/runtime-canvas/src/__tests__/document-edit-coordinator.test.ts | 387 |
| `permissions` | ui | packages/shared/runtime-domain/runtime-canvas/src/address-contact/address-contact-panel.tsx | 62, 175, 192, 197 |
| `permissions` | runtime | packages/shared/runtime-domain/runtime-canvas/src/document-runtime/use-document-affordance.ts | 61, 95, 141, 144, 147, 169 |
| `permissions` | runtime | packages/shared/runtime-domain/runtime-canvas/src/header/types.ts | 160 |
| `permissions` | test | packages/shared/runtime-domain/runtime-contracts/src/__tests__/effective-record-workspace.test.ts | 103, 105, 113, 133, 137, 138, 161, 171 |
| `permissions` | test | packages/shared/runtime-domain/runtime-contracts/src/__tests__/process-runtime.test.ts | 133, 148, 234 |
| `permissions` | contract | packages/shared/runtime-domain/runtime-contracts/src/process-runtime.ts | 47, 64, 159, 166, 264, 265 |
| `permissions` | contract | packages/shared/runtime-domain/runtime-contracts/src/record-workspace.ts | 45, 135, 244, 278, 288, 290, 379, 384, 385, 386 |
| `permissions` | contract | packages/shared/runtime-domain/session-plane/src/index.ts | 154, 172, 180, 183, 187, 190, 194, 197, 201, 206 |
| `permissions` | ui | packages/shared/ui-platform/dashboard-ui/src/dashboard.tsx | 39, 41, 122, 202, 203 |
| `permissions` | ui | packages/shared/ui-platform/me-ui/src/delegations/delegations-mutation-tab.tsx | 116, 120, 175, 179 |
| `permissions` | ui | packages/shared/ui-platform/me-ui/src/delegations/grant-delegation-dialog.tsx | 63, 64, 69, 70, 93, 134, 227 |
| `permissions` | ui | packages/shared/ui-platform/me-ui/src/sections/identity-section.tsx | 203, 254, 258 |
| `permissions` | ui | packages/shared/ui-platform/me-ui/src/settings-workspace.tsx | 36, 57, 65, 68, 76, 77, 92, 137, 142, 249, 251 |
| `permissions` | ui | packages/shared/ui-platform/setup-ui/src/setup-directory.tsx | 96 |
| `permissions` | tool | scripts/policy/authorization-inventory.ts | 733, 894, 913, 914, 953, 957 |
| `permissions` | runtime | server/db/seed/contracts/authorization/authority/mesh/authority.v1.json | 22 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/mesh/compiled/verification-report.v1.json | 11 |
| `permissions` | runtime | server/db/seed/contracts/authorization/catalog/neon-admin/compiled/verification-report.v1.json | 11 |
| `permissions` | ddl | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 372 |
| `permissions` | ddl | server/db/ddl/control/01zzp_authorization_v2_catalog.sql | 236 |
| `permissions` | ddl | server/db/ddl/control/05_authorization_v7_shadow_cutover_functions.sql | 39 |
| `permissions` | ddl | server/db/ddl/control/07z_v_entity_surface_contract_audit.sql | 48 |
| `permissions` | ddl | server/db/ddl/master/01_tables_identity.sql | 1232, 1948, 1988, 2002, 2004 |
| `permissions` | ddl | server/db/ddl/master/01b_tables_finance.sql | 607 |
| `permissions` | ddl | server/db/ddl/master/01zzc_authorization_v2_expand.sql | 1041 |
| `permissions` | ddl | server/db/ddl/master/05_authorization_v2_functions.sql | 717, 758, 781, 808, 1347, 1370, 1381 |
| `permissions` | ddl | server/db/ddl/master/05_functions.sql | 2477, 2479 |
| `permissions` | ddl | server/db/ddl/master/06_triggers.sql | 515, 516, 522, 534, 536, 540, 559, 580 |
| `permissions` | ddl | server/db/ddl/master/07_authorization_v2_views.sql | 248 |
| `permissions` | ddl | server/db/ddl/master/08_people_rls.sql | 72, 73, 80, 86, 90, 96 |
| `permissions` | ddl | server/db/ddl/mesh_control/05_authorization_v7_shadow_cutover_functions.sql | 38 |
| `permissions` | ddl | server/db/ddl/mesh/01zz_authorization_v2_authority.sql | 964 |
| `permissions` | ddl | server/db/ddl/mesh/05_authorization_v2_authority_functions.sql | 598, 904, 984 |
| `permissions` | ddl | server/db/ddl/shared/01_tables.sql | 729, 903 |
| `permissions` | generated | server/db/generated/authorization-catalog/mesh/verification-report.v1.json | 11 |
| `permissions` | generated | server/db/generated/authorization-catalog/neon-admin/verification-report.v1.json | 11 |
| `permissions` | tool | server/db/scripts/authority/compile-authorization-authority.ts | 101, 104, 145, 153, 158, 169, 205, 216 |
| `permissions` | tool | server/db/scripts/catalog/compile-authorization-catalog.ts | 507, 685 |
| `permissions` | tool | server/db/scripts/reports/report-authorization-data-quality.ts | 652, 673, 676 |
| `permissions` | tool | server/db/scripts/verify/smoke-mesh-authorization-v2-authority.mjs | 430 |
| `permissions` | tool | server/db/scripts/verify/verify-atlas-tools-rls.ts | 175 |
| `permissions` | tool | server/db/scripts/verify/verify-authorization-v2-wave2.ts | 22, 105, 137 |
| `permissions` | seed | server/db/seed/platform/003_control/010_control_entity_class_profile_contract.sql | 28 |
| `permissions` | seed | server/db/seed/platform/003_control/100_control_seed_contract_assertions.sql | 650 |
| `permissions` | seed | server/db/seed/platform/003_control/112_setup_workspace_plane_registry.sql | 33, 55 |
| `permissions` | seed | server/db/seed/tenants/neon/010_demo/900_principals/003_demo_delegation_grants.sql | 65, 72, 84 |
| `permissions` | generated | server/packages/adapters/db/src/generated/kysely-mesh/types.ts | 3959 |
| `permissions` | generated | server/packages/adapters/db/src/generated/kysely/types.ts | 3959 |
| `permissions` | generated | server/packages/adapters/db/src/prisma/schema.mesh.prisma | 16096 |
| `permissions` | generated | server/packages/adapters/db/src/prisma/schema.prisma | 14035 |
| `permissions` | test | server/packages/services/ai/__tests__/ai-service-bundle.test.ts | 113, 135, 137 |
| `permissions` | test | server/packages/services/ai/__tests__/atlas-data-gateway.test.ts | 22, 42, 44, 109, 110, 132, 133 |
| `permissions` | test | server/packages/services/ai/agent/__tests__/model-catalog.test.ts | 102, 124, 126 |
| `permissions` | runtime | server/packages/services/ai/agent/model-catalog.ts | 597, 598, 599, 600, 601, 602, 603, 604 |
| `permissions` | runtime | server/packages/services/ai/atlas-data-gateway.ts | 110, 111, 112, 113, 166, 167, 168, 169 |
| `permissions` | test | server/packages/services/ai/conversation/__tests__/atlas-thread.service.test.ts | 36, 57, 310, 311 |
| `permissions` | runtime | server/packages/services/ai/conversation/atlas-thread.service.ts | 954, 968, 969, 970, 971, 985, 986, 987, 988, 989 |
| `permissions` | test | server/packages/services/ai/retrieval/__tests__/atlas-retrieval.service.test.ts | 14, 76, 78 |
| `permissions` | test | server/packages/services/ai/routes/__tests__/ai-agent.route.test.ts | 487, 495, 502, 510, 518, 519 |
| `permissions` | route | server/packages/services/ai/routes/ai-agent.route.ts | 325, 336, 360 |
| `permissions` | test | server/packages/services/ai/tools/__tests__/agent-read-only-tool-executor.test.ts | 37, 40, 64, 418, 423, 424, 434 |
| `permissions` | test | server/packages/services/ai/tools/__tests__/sql-atlas-tool-adapters.test.ts | 518, 526, 562, 577, 605, 615, 618, 631, 645, 648, 662, 898, 934, 940 |
| `permissions` | runtime | server/packages/services/ai/tools/agent-read-only-tool-executor.ts | 1064, 1123, 1356, 1357, 1358, 1359, 1371, 1381, 1382, 1383, 1384, 1385, 1386, 1387, 1388, 1389, 1390 |
| `permissions` | runtime | server/packages/services/ai/tools/atlas-tool-schema.ts | 260, 266, 267, 272 |
| `permissions` | runtime | server/packages/services/ai/tools/sql-atlas-tool-authorization-revalidator.ts | 108, 154, 155, 156, 157, 158, 159, 160, 164, 165, 175 |
| `permissions` | test | server/packages/services/finance/__tests__/finance-fx-slice2.contract.test.ts | 54, 56, 63, 64 |
| `permissions` | test | server/packages/services/finance/__tests__/finance-fx-slice2.integration.test.ts | 11, 30, 84, 87, 110 |
| `permissions` | test | server/packages/services/finance/__tests__/finance-fx-slice3.contract.test.ts | 50 |
| `permissions` | test | server/packages/services/finance/__tests__/finance-fx-slice6.contract.test.ts | 40, 41, 52, 53 |
| `permissions` | test | server/packages/services/finance/__tests__/finance-settings-slice7-rollout.contract.test.ts | 74, 118, 119 |
| `permissions` | route | server/packages/services/finance/routes/finance-fx-setup.route.ts | 162, 170 |
| `permissions` | runtime | server/packages/services/finance/services/finance-certification-readiness.service.ts | 99 |
| `permissions` | runtime | server/packages/services/finance/services/finance-fx-company-summary.service.ts | 61, 131, 132, 133, 134, 164 |
| `permissions` | runtime | server/packages/services/finance/services/finance-fx-tenant-summary.service.ts | 11, 97 |
| `permissions` | test | server/packages/services/iam/__tests__/session.integration.test.ts | 202, 203, 204 |
| `permissions` | test | server/packages/services/iam/__tests__/verified-request-context.test.ts | 48, 49, 52, 66, 84, 93, 104 |
| `permissions` | test | server/packages/services/iam/authorization-evaluator/__tests__/canonical-evaluator.test.ts | 273 |
| `permissions` | test | server/packages/services/iam/authorization-rollout/__tests__/authorization-decision-router.test.ts | 13, 46, 52, 70, 75, 85, 100, 124, 129, 146, 163, 169 |
| `permissions` | test | server/packages/services/iam/authorization-rollout/__tests__/authorization-rollout.service.test.ts | 218 |
| `permissions` | test | server/packages/services/iam/authorization-rollout/__tests__/authorization-wave7-shadow.test.ts | 117 |
| `permissions` | runtime | server/packages/services/iam/permission-context/verified-request-context.ts | 19, 45, 70, 71, 74, 77, 88, 90 |
| `permissions` | runtime | server/packages/services/iam/permission/permission.service.ts | 427 |
| `permissions` | runtime | server/packages/services/iam/persona-registry.service.ts | 37, 55, 142, 294, 311, 351, 356, 368 |
| `permissions` | route | server/packages/services/iam/routes/iam.routes.ts | 162 |
| `permissions` | route | server/packages/services/iam/routes/mfa.routes.ts | 408, 420, 463, 482, 483, 520 |
| `permissions` | route | server/packages/services/iam/routes/operator.routes.ts | 179, 302, 660, 682, 683, 705 |
| `permissions` | runtime | server/packages/services/iam/session/session.service.ts | 271, 304, 519, 521, 642, 658, 666, 711, 712, 719, 734 |
| `permissions` | runtime | server/packages/services/iam/session/session.types.ts | 117, 139 |
| `permissions` | test | server/packages/services/iam/support/__tests__/atlas-support-session.service.test.ts | 66, 94, 199 |
| `permissions` | runtime | server/packages/services/iam/support/atlas-support-session.service.ts | 353, 354, 355, 356 |
| `permissions` | route | server/packages/services/master/routes/owner-address-contact.route.ts | 140 |
| `permissions` | route | server/packages/services/metadata/routes/runtime-bootstrap.route.ts | 194, 197, 349, 354, 357, 358, 361, 373, 376, 379, 380, 381 |
| `permissions` | route | server/packages/services/metadata/routes/studio-contract-v21.route.ts | 68, 83, 84, 90, 124, 131, 353, 356 |
| `permissions` | test | server/packages/services/metadata/src/__tests__/contract-publication-m3.test.ts | 46 |
| `permissions` | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 591 |
| `permissions` | route | server/packages/services/platform/routes/commerce.route.ts | 682, 738, 768, 1193, 1218, 1243, 1252, 1255, 1362, 1391, 1438, 1464, 1465, 1466, 1478, 1479 |
| `permissions` | route | server/packages/services/platform/routes/platform.route.ts | 149, 150, 153, 1273, 1415, 1439, 1440, 1570, 1571, 2868, 2880, 3314, 3335 |
| `permissions` | route | server/packages/services/platform/routes/ref.route.ts | 682 |
| `permissions` | test | server/packages/services/records/__tests__/canonical-request-context-boundary.test.ts | 19 |
| `permissions` | test | server/packages/services/records/__tests__/entity-mutation-service.test.ts | 17 |
| `permissions` | test | server/packages/services/records/__tests__/lifecycle-command-seed-contract.test.ts | 140 |
| `permissions` | test | server/packages/services/records/__tests__/lifecycle-control-plane-contract.integration.test.ts | 115 |
| `permissions` | runtime | server/packages/services/records/mutation/entity-mutation.service.ts | 123, 159, 173, 288, 396, 433, 457, 514, 549, 579 |
| `permissions` | test | server/packages/services/records/query/__tests__/entity-query.service.test.ts | 40 |
| `permissions` | route | server/packages/services/records/routes/index.ts | 130, 141 |
| `permissions` | tool | server/scripts/verify-permissions.ts | 107 |
| `permissions` | test | server/src/__tests__/atlas-record-data-gateway.test.ts | 32, 53, 55 |
| `permissions` | runtime | server/src/atlas-record-data-gateway.ts | 59 |
| `permissions` | test | server/src/kernel/__tests__/request-context.test.ts | 106 |
| `permissions` | runtime | server/src/kernel/request-context.ts | 146, 147, 148 |
| `permissions` | runtime | server/src/runtimes/api.ts | 1060, 1063, 1064, 1065, 1066, 1067, 1068 |
| `persona` | runtime | config/governance/authorization-data-disposition-inventory.v1.json | 14132, 14134 |
| `persona` | runtime | config/governance/authorization-data-disposition-policy.v1.json | 260 |
| `persona` | runtime | config/governance/authorization-legacy-freeze-baseline.v1.json | 6496, 6648, 6662, 6663, 6670, 6671, 6678, 6679, 6686, 6687, 6694, 6695, 6702, 6703, 6710, 6711, 6718, 6719, 6726, 6727, 6734, 6735, 6742, 6743, 6750, 6751, 6752, 6758, 6759, 6766, 6767, 6774, 6775, 6782, 6783, 6790, 6791, 6798, 6799, 7040, 7048, 7056 |
| `persona` | runtime | config/governance/authorization-wave3-authority-contract.v1.json | 33 |
| `persona` | runtime | config/governance/authorization-wave9-legacy-removal-manifest.v1.json | 27, 77, 78 |
| `persona` | runtime | packages/shared/data-integration/navigation-core/src/workbench-resolver.ts | 14, 25 |
| `persona` | contract | packages/shared/data-integration/session-plane/src/index.ts | 167 |
| `persona` | contract | packages/shared/platform-auth/session-plane/src/index.ts | 185 |
| `persona` | contract | packages/shared/runtime-domain/session-plane/src/index.ts | 167 |
| `persona` | tool | scripts/policy/authorization-inventory.ts | 555, 734, 739 |
| `persona` | runtime | server/db/seed/contracts/authorization/authority/authorization-authority-semantic-contract.v1.json | 13 |
| `persona` | runtime | server/db/seed/contracts/authorization/authority/neon-admin/authority.v1.json | 14, 46, 47, 48, 74 |
| `persona` | runtime | server/db/seed/contracts/authorization/authority/neon-admin/compiled/compiled-authority.v1.json | 13, 93, 97, 180, 184, 552, 556, 1078, 1082, 1642, 1646, 2246, 2250, 2850, 2922, 3009, 3099, 3474, 4003, 4570, 5177, 5861, 5871, 5881, 5891, 5901, 5911, 5921, 25498 |
| `persona` | runtime | server/db/seed/contracts/authorization/authority/neon-admin/compiled/existing-user-group-manifest.v1.json | 12 |
| `persona` | runtime | server/db/seed/contracts/authorization/catalog/neon-admin/catalog.v1.json | 32 |
| `persona` | ddl | server/db/ddl/control/01zzo_authorization_migration_controls.sql | 316 |
| `persona` | ddl | server/db/ddl/master/01_tables_identity.sql | 1484 |
| `persona` | ddl | server/db/ddl/master/01q_tables_plane_access.sql | 44 |
| `persona` | ddl | server/db/ddl/master/05_functions.sql | 2479, 2748 |
| `persona` | ddl | server/db/ddl/master/05_zz_authorization_scope.sql | 258 |
| `persona` | ddl | server/db/ddl/mesh/_shared/03_constraints.sql | 57, 71 |
| `persona` | ddl | server/db/ddl/shared/01_tables.sql | 837 |
| `persona` | ddl | server/db/ddl/shared/03_constraints.sql | 81, 107 |
| `persona` | runtime | server/db/seed/contracts/authorization/evaluator/mesh/repository-contract.v1.json | 25 |
| `persona` | runtime | server/db/seed/contracts/authorization/evaluator/neon-admin/repository-contract.v1.json | 24 |
| `persona` | runtime | server/db/migrations/contraction/mesh/001_authorization_v2_wave9_tombstone.sql | 67, 109 |
| `persona` | runtime | server/db/migrations/contraction/neon/001_authorization_v2_wave9_tombstone.sql | 71, 132 |
| `persona` | tool | server/db/scripts/authority/compile-authorization-authority.ts | 136, 137, 151, 152, 154, 173, 174 |
| `persona` | tool | server/db/scripts/install/install-mesh-authorization-v2-expand.ts | 784 |
| `persona` | tool | server/db/scripts/reports/capture-authorization-golden-corpus.ts | 342, 344, 345, 346, 347 |
| `persona` | tool | server/db/scripts/reports/report-authorization-wave9-repository-readiness.ts | 43, 67, 76 |
| `persona` | tool | server/db/scripts/verify/verify-authorization-v2-wave3.ts | 93, 182 |
| `persona` | tool | server/db/scripts/verify/verify-authorization-v2-wave4.ts | 142 |
| `persona` | tool | server/db/scripts/verify/verify-authorization-v2-wave5.ts | 119 |
| `persona` | tool | server/db/scripts/verify/verify-authorization-v2-wave9.ts | 84 |
| `persona` | tool | server/db/scripts/verify/verify-mesh-authorization-v2-wave1.ts | 188 |
| `persona` | seed | server/db/seed/platform/000_lookups/LookupDomain/000_lookup_domains.sql | 190 |
| `persona` | seed | server/db/seed/platform/002_permission_model/010_persona.sql | 3 |
| `persona` | seed | server/db/seed/platform/002_permission_model/018_persona_permission.sql | 166 |
| `persona` | seed | server/db/seed/platform/002_permission_model/019_role.sql | 11, 58 |
| `persona` | seed | server/db/seed/platform/003_control/040_control_entity_contract.sql | 199 |
| `persona` | seed | server/db/seed/platform/003_control/040a_control_all_schema_entity_coverage_contract.sql | 113 |
| `persona` | seed | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 7280, 8137 |
| `persona` | seed | server/db/seed/platform/003_control/100_control_seed_contract_assertions.sql | 1813 |
| `persona` | generated | server/packages/adapters/db/src/generated/kysely-mesh/types.ts | 12809 |
| `persona` | generated | server/packages/adapters/db/src/generated/kysely/types.ts | 12809 |
| `persona` | generated | server/packages/adapters/db/src/prisma/schema.mesh.prisma | 485 |
| `persona` | generated | server/packages/adapters/db/src/prisma/schema.prisma | 19441 |
| `persona` | test | server/packages/services/finance/__tests__/finance-fx-slice2.integration.test.ts | 45, 47 |
| `persona` | test | server/packages/services/iam/__tests__/permission-context-base.test.ts | 32, 44 |
| `persona` | test | server/packages/services/iam/__tests__/permission-context-matrix-tier1.test.ts | 81, 86, 95, 125 |
| `persona` | test | server/packages/services/iam/__tests__/session.integration.test.ts | 59, 85, 199, 286, 371 |
| `persona` | runtime | server/packages/services/iam/bootstrap/bootstrap.service.ts | 317 |
| `persona` | runtime | server/packages/services/iam/context/context-resolver.service.ts | 396 |
| `persona` | runtime | server/packages/services/iam/jit/jit.service.ts | 299, 300, 304, 311, 335 |
| `persona` | runtime | server/packages/services/iam/permission-context/resolvers/admin-resolver.ts | 138, 172, 199 |
| `persona` | runtime | server/packages/services/iam/permission-context/resolvers/base.ts | 51 |
| `persona` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 141, 204 |
| `persona` | runtime | server/packages/services/iam/permission/permission.service.ts | 327, 334, 416, 460, 473, 532 |
| `persona` | runtime | server/packages/services/iam/persona-registry.service.ts | 78, 111, 112, 123, 134, 135, 136, 137, 138, 139, 140, 141, 165, 166, 172, 204, 205, 223, 331 |
| `persona` | route | server/packages/services/iam/routes/iam.routes.ts | 142 |
| `persona` | route | server/packages/services/iam/routes/operator.routes.ts | 162, 1608 |
| `persona` | runtime | server/packages/services/iam/session/session.service.ts | 295, 498, 637, 725 |
| `persona` | runtime | server/packages/services/iam/session/session.types.ts | 132 |
| `persona` | route | server/packages/services/platform/routes/platform.route.ts | 2752 |
| `persona` | test | server/src/kernel/__tests__/request-context.test.ts | 107 |
| `persona` | runtime | server/src/kernel/bootstrap.ts | 96 |
| `persona` | keycloak | stack/config/iam/realm-athyper-demosetup.json | 1405, 1446, 1479, 1512, 1553, 1586, 1619, 1652, 1693, 1726, 1759, 1800, 1833, 1866, 1899, 1940, 1973, 2006, 2047, 2080, 2113, 2146, 2187, 2220, 2253, 2294, 2327, 2360, 2393, 2434, 2467, 2500, 2541, 2574, 2607, 2640, 2681, 2714, 2747, 2788, 2821, 2854, 2887, 2928, 2961, 2994, 3035, 3068, 3101, 3134, 3175, 3208, 3241, 3282, 3315, 3348, 3381, 3422, 3455, 3488, 3529, 3562, 3595, 3628, 3669, 3702, 3735, 3776, 3809, 3842, 3875, 3916, 3949, 3982, 4023, 4056, 4089, 4122, 4163, 4196, 4229, 4270, 4303, 4336, 4369, 4410, 4443, 4476, 4517, 4550, 4583, 4616, 4657, 4690, 4723, 4764, 4797, 4830, 4863, 4904, 4945, 4986, 5019, 5052, 5093, 5126, 5159, 5192, 5233, 5266, 5299, 5340, 5373, 5406, 5439, 5480, 5513, 5546, 5587, 5620, 5653 |
| `persona` | keycloak | stack/config/iam/realm-athyper.json | 76, 131, 2515, 2523, 2526, 2603, 2697, 2705, 2708, 2785, 2879, 2887, 2890 |
| `persona` | tool | tools/scripts/generate-athyper-demo-iam.cjs | 51, 52, 71, 82, 86, 94, 95, 101, 102, 115, 155 |
| `persona` | tool | tools/scripts/verify-athyper-demo-iam.cjs | 76, 77, 78, 80, 82 |
| `personaId` | runtime | config/governance/authorization-golden-corpus.schema.json | 212 |
| `personaId` | tool | scripts/policy/authorization-inventory.ts | 752 |
| `personaId` | tool | server/db/scripts/reports/capture-authorization-golden-corpus.ts | 605 |
| `personaId` | test | server/packages/services/ai/tools/__tests__/sql-atlas-tool-adapters.test.ts | 651, 905 |
| `personaId` | runtime | server/packages/services/ai/tools/sql-atlas-tool-authorization-revalidator.ts | 184 |
| `personaId` | test | server/packages/services/iam/__tests__/permission-context-base.test.ts | 20, 25, 33, 34, 39, 40, 45, 46, 47 |
| `personaId` | test | server/packages/services/iam/__tests__/permission-context-matrix-tier1.test.ts | 81, 86, 95, 128, 129, 130, 139, 140, 145, 146, 151 |
| `personaId` | runtime | server/packages/services/iam/permission-context/resolvers/admin-resolver.ts | 66, 113 |
| `personaId` | runtime | server/packages/services/iam/permission-context/resolvers/base.ts | 43, 51 |
| `personaId` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 80, 116 |
| `personaId` | runtime | server/packages/services/iam/permission-context/types.ts | 93 |
| `personaId` | runtime | server/packages/services/iam/permission/permission.service.ts | 299, 331 |
| `personaId` | runtime | server/packages/services/iam/persona-registry.service.ts | 44, 53, 110, 117, 130, 160, 168, 173, 190, 203, 247, 292, 304, 309, 354, 366 |
| `personaId` | route | server/packages/services/iam/routes/operator.routes.ts | 168, 171 |
| `personaId` | runtime | server/packages/services/iam/session/session.service.ts | 505, 512 |
| `personaId` | route | server/packages/services/metadata/routes/entity-flow.route.ts | 50, 635, 638 |
| `personaId` | route | server/packages/services/metadata/routes/entity-operations.route.ts | 45 |
| `personaId` | route | server/packages/services/metadata/routes/index.ts | 73 |
| `personaId` | runtime | server/packages/services/metadata/src/execution-descriptor/validation.ts | 28 |
| `personaId` | runtime | server/packages/services/metadata/src/tenant-overlay-resolver.ts | 66 |
| `personaId` | route | server/packages/services/platform/routes/ref.route.ts | 703, 708 |
| `personaId` | runtime | server/packages/services/shared/operation-guard.ts | 30, 76, 78 |
| `personaId` | test | server/src/kernel/__tests__/request-context.test.ts | 107 |
| `personaId` | runtime | server/src/kernel/request-context.ts | 43, 146, 183 |
| `personaId` | runtime | server/src/runtimes/api.ts | 1066 |
| `planeExcluded` | test | server/packages/services/ai/__tests__/ai-service-bundle.test.ts | 121 |
| `planeExcluded` | test | server/packages/services/ai/__tests__/atlas-data-gateway.test.ts | 30, 125 |
| `planeExcluded` | test | server/packages/services/ai/agent/__tests__/model-catalog.test.ts | 110 |
| `planeExcluded` | runtime | server/packages/services/ai/agent/model-catalog.ts | 604 |
| `planeExcluded` | runtime | server/packages/services/ai/atlas-data-gateway.ts | 112 |
| `planeExcluded` | test | server/packages/services/ai/conversation/__tests__/atlas-thread.service.test.ts | 45 |
| `planeExcluded` | runtime | server/packages/services/ai/conversation/atlas-thread.service.ts | 989 |
| `planeExcluded` | test | server/packages/services/ai/retrieval/__tests__/atlas-retrieval.service.test.ts | 20 |
| `planeExcluded` | test | server/packages/services/ai/routes/__tests__/ai-agent.route.test.ts | 69, 513 |
| `planeExcluded` | route | server/packages/services/ai/routes/ai-agent.route.ts | 381 |
| `planeExcluded` | test | server/packages/services/ai/tools/__tests__/agent-read-only-tool-executor.test.ts | 49 |
| `planeExcluded` | test | server/packages/services/ai/tools/__tests__/sql-atlas-tool-adapters.test.ts | 911 |
| `planeExcluded` | runtime | server/packages/services/ai/tools/agent-read-only-tool-executor.ts | 1359, 1390 |
| `planeExcluded` | runtime | server/packages/services/ai/tools/sql-atlas-tool-authorization-revalidator.ts | 209 |
| `planeExcluded` | test | server/packages/services/iam/__tests__/permission-context-matrix-tier1.test.ts | 163, 169, 172, 173, 177, 183, 185, 186, 189, 195, 197, 198, 206, 209 |
| `planeExcluded` | test | server/packages/services/iam/__tests__/permission-context-resolvers.test.ts | 53, 80 |
| `planeExcluded` | test | server/packages/services/iam/__tests__/verified-request-context.test.ts | 34 |
| `planeExcluded` | runtime | server/packages/services/iam/permission-context/resolvers/admin-resolver.ts | 73, 79, 119 |
| `planeExcluded` | runtime | server/packages/services/iam/permission-context/resolvers/mesh-resolver.ts | 96, 109, 147 |
| `planeExcluded` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 96, 122, 283, 289, 295, 321 |
| `planeExcluded` | runtime | server/packages/services/iam/permission-context/types.ts | 121 |
| `planeExcluded` | test | server/packages/services/iam/support/__tests__/atlas-support-session.service.test.ts | 77 |
| `planeExcluded` | runtime | server/packages/services/iam/support/atlas-support-session.service.ts | 356 |
| `planeExcluded` | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 542 |
| `planeExcluded` | route | server/packages/services/metadata/routes/studio-contract-v21.route.ts | 81 |
| `planeExcluded` | route | server/packages/services/metadata/routes/studio-version.route.ts | 107, 419 |
| `planeExcluded` | test | server/packages/services/records/__tests__/entity-mutation-service.test.ts | 25 |
| `planeExcluded` | test | server/src/__tests__/atlas-record-data-gateway.test.ts | 40 |
| `planLocked` | tool | scripts/policy/authorization-inventory.ts | 752 |
| `planLocked` | test | server/packages/services/ai/__tests__/ai-service-bundle.test.ts | 120 |
| `planLocked` | test | server/packages/services/ai/__tests__/atlas-data-gateway.test.ts | 29, 124 |
| `planLocked` | test | server/packages/services/ai/agent/__tests__/model-catalog.test.ts | 109 |
| `planLocked` | runtime | server/packages/services/ai/agent/model-catalog.ts | 603 |
| `planLocked` | runtime | server/packages/services/ai/atlas-data-gateway.ts | 111 |
| `planLocked` | test | server/packages/services/ai/conversation/__tests__/atlas-thread.service.test.ts | 44 |
| `planLocked` | runtime | server/packages/services/ai/conversation/atlas-thread.service.ts | 988 |
| `planLocked` | test | server/packages/services/ai/retrieval/__tests__/atlas-retrieval.service.test.ts | 20 |
| `planLocked` | test | server/packages/services/ai/routes/__tests__/ai-agent.route.test.ts | 68, 505 |
| `planLocked` | route | server/packages/services/ai/routes/ai-agent.route.ts | 380 |
| `planLocked` | test | server/packages/services/ai/tools/__tests__/agent-read-only-tool-executor.test.ts | 48, 428 |
| `planLocked` | test | server/packages/services/ai/tools/__tests__/sql-atlas-tool-adapters.test.ts | 910 |
| `planLocked` | runtime | server/packages/services/ai/tools/agent-read-only-tool-executor.ts | 1358, 1389 |
| `planLocked` | runtime | server/packages/services/ai/tools/sql-atlas-tool-authorization-revalidator.ts | 208 |
| `planLocked` | test | server/packages/services/iam/__tests__/permission-context-matrix-tier1.test.ts | 206, 208 |
| `planLocked` | test | server/packages/services/iam/__tests__/permission-context-resolvers.test.ts | 52, 67 |
| `planLocked` | test | server/packages/services/iam/__tests__/verified-request-context.test.ts | 33 |
| `planLocked` | runtime | server/packages/services/iam/permission-context/resolvers/admin-resolver.ts | 118 |
| `planLocked` | runtime | server/packages/services/iam/permission-context/resolvers/mesh-resolver.ts | 146 |
| `planLocked` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 96, 121, 282, 288, 311, 321 |
| `planLocked` | runtime | server/packages/services/iam/permission-context/types.ts | 119 |
| `planLocked` | test | server/packages/services/iam/support/__tests__/atlas-support-session.service.test.ts | 76 |
| `planLocked` | runtime | server/packages/services/iam/support/atlas-support-session.service.ts | 355 |
| `planLocked` | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 541 |
| `planLocked` | route | server/packages/services/metadata/routes/studio-contract-v21.route.ts | 80 |
| `planLocked` | route | server/packages/services/metadata/routes/studio-version.route.ts | 106, 418 |
| `planLocked` | test | server/packages/services/records/__tests__/entity-mutation-service.test.ts | 24 |
| `planLocked` | test | server/src/__tests__/atlas-record-data-gateway.test.ts | 39 |
| `principalFingerprint` | test | server/packages/services/ai/__tests__/ai-service-bundle.test.ts | 117 |
| `principalFingerprint` | test | server/packages/services/ai/__tests__/atlas-data-gateway.test.ts | 26 |
| `principalFingerprint` | test | server/packages/services/ai/agent/__tests__/model-catalog.test.ts | 106 |
| `principalFingerprint` | test | server/packages/services/ai/tools/__tests__/agent-read-only-tool-executor.test.ts | 45 |
| `principalFingerprint` | test | server/packages/services/ai/tools/__tests__/sql-atlas-tool-adapters.test.ts | 601, 906 |
| `principalFingerprint` | runtime | server/packages/services/ai/tools/sql-atlas-tool-authorization-revalidator.ts | 183 |
| `principalFingerprint` | test | server/packages/services/iam/__tests__/permission-context-base.test.ts | 58, 63, 72, 73, 79, 80, 88, 92 |
| `principalFingerprint` | test | server/packages/services/iam/__tests__/permission-context-matrix-tier1.test.ts | 101, 102, 133, 134, 152, 153 |
| `principalFingerprint` | test | server/packages/services/iam/__tests__/verified-request-context.test.ts | 30 |
| `principalFingerprint` | runtime | server/packages/services/iam/permission-context/resolvers/admin-resolver.ts | 102, 114 |
| `principalFingerprint` | runtime | server/packages/services/iam/permission-context/resolvers/base.ts | 27, 33 |
| `principalFingerprint` | runtime | server/packages/services/iam/permission-context/resolvers/mesh-resolver.ts | 130, 143 |
| `principalFingerprint` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 107, 117 |
| `principalFingerprint` | runtime | server/packages/services/iam/permission-context/types.ts | 104 |
| `principalFingerprint` | test | server/packages/services/iam/support/__tests__/atlas-support-session.service.test.ts | 73 |
| `principalFingerprint` | test | server/packages/services/records/__tests__/entity-mutation-service.test.ts | 21 |
| `principalFingerprint` | test | server/src/__tests__/atlas-record-data-gateway.test.ts | 36 |
| `principalFingerprint` | test | server/src/kernel/__tests__/request-context.test.ts | 108 |
| `principalFingerprint` | runtime | server/src/kernel/request-context.ts | 54, 148, 185 |
| `principalFingerprint` | runtime | server/src/runtimes/api.ts | 1068 |
| `profileHash` | runtime | apps/mesh/lib/server/mesh-runtime.ts | 34 |
| `profileHash` | test | server/packages/services/ai/__tests__/ai-service-bundle.test.ts | 124, 137 |
| `profileHash` | test | server/packages/services/ai/__tests__/atlas-data-gateway.test.ts | 33, 44 |
| `profileHash` | test | server/packages/services/ai/agent/__tests__/model-catalog.test.ts | 113, 126 |
| `profileHash` | runtime | server/packages/services/ai/atlas-data-gateway.ts | 152, 163, 169 |
| `profileHash` | test | server/packages/services/ai/conversation/__tests__/atlas-thread.service.test.ts | 41, 56 |
| `profileHash` | runtime | server/packages/services/ai/conversation/atlas-thread.service.ts | 966, 967, 971 |
| `profileHash` | test | server/packages/services/ai/retrieval/__tests__/atlas-retrieval.service.test.ts | 13, 18 |
| `profileHash` | test | server/packages/services/ai/routes/__tests__/ai-agent.route.test.ts | 65 |
| `profileHash` | test | server/packages/services/ai/tools/__tests__/agent-read-only-tool-executor.test.ts | 52, 63 |
| `profileHash` | test | server/packages/services/ai/tools/__tests__/sql-atlas-tool-adapters.test.ts | 174, 184, 218, 228, 599, 924, 942 |
| `profileHash` | runtime | server/packages/services/ai/tools/agent-read-only-tool-executor.ts | 88, 243, 255, 267, 942, 1053, 1063, 1069, 1102, 1122, 1128, 1378, 1385, 1404 |
| `profileHash` | runtime | server/packages/services/ai/tools/atlas-tool.types.ts | 474, 484 |
| `profileHash` | runtime | server/packages/services/ai/tools/sql-atlas-tool-authorization-revalidator.ts | 158, 159, 180, 181 |
| `profileHash` | runtime | server/packages/services/ai/tools/sql-atlas-tool-execution-recorder.ts | 406, 408, 451, 484, 506, 516, 682 |
| `profileHash` | test | server/packages/services/iam/__tests__/permission-context-matrix-tier1.test.ts | 72, 93, 125 |
| `profileHash` | test | server/packages/services/iam/__tests__/verified-request-context.test.ts | 36, 68 |
| `profileHash` | runtime | server/packages/services/iam/permission-context/resolvers/admin-resolver.ts | 101, 122 |
| `profileHash` | runtime | server/packages/services/iam/permission-context/resolvers/mesh-resolver.ts | 129, 150 |
| `profileHash` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 106, 125 |
| `profileHash` | runtime | server/packages/services/iam/permission-context/types.ts | 132 |
| `profileHash` | runtime | server/packages/services/iam/permission-context/verified-request-context.ts | 23, 90 |
| `profileHash` | test | server/packages/services/iam/support/__tests__/atlas-support-session.service.test.ts | 80, 96 |
| `profileHash` | route | server/packages/services/metadata/routes/mesh-runtime.route.ts | 26, 74, 224 |
| `profileHash` | runtime | server/packages/services/metadata/src/execution-descriptor/validation.ts | 29 |
| `profileHash` | test | server/packages/services/records/__tests__/entity-mutation-service.test.ts | 27 |
| `profileHash` | test | server/packages/services/records/__tests__/generic-kernel-verified-context-policy.test.ts | 45 |
| `profileHash` | test | server/packages/services/records/query/__tests__/entity-query.service.test.ts | 39 |
| `profileHash` | runtime | server/packages/services/records/query/entity-query.service.ts | 348, 354 |
| `profileHash` | route | server/packages/services/records/routes/entity-mutation-guard.ts | 143 |
| `profileHash` | route | server/packages/services/records/routes/records.route.ts | 3695 |
| `profileHash` | test | server/src/__tests__/atlas-record-data-gateway.test.ts | 43, 55 |
| `profileHash` | test | server/src/kernel/__tests__/request-context.test.ts | 105, 119 |
| `profileHash` | runtime | server/src/kernel/request-context.ts | 60, 144, 186 |
| `profileHash` | runtime | server/src/runtimes/api.ts | 1065 |
| `required_permission` | ui | apps/admin/app/(shell)/setup/metadata/[entityId]/_components/StructuredContractEditor.tsx | 69 |
| `required_permission` | contract | packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v21.ts | 156, 161, 164, 165 |
| `required_permission` | runtime | packages/shared/runtime-domain/runtime-canvas/src/document-runtime/use-document-affordance.ts | 135, 144, 147, 150 |
| `required_permission` | runtime | packages/shared/runtime-domain/runtime-canvas/src/document-runtime/use-document-rules.ts | 30 |
| `required_permission` | tool | scripts/policy/authorization-inventory.ts | 894, 912 |
| `required_permission` | runtime | server/db/seed/contracts/authorization/catalog/neon-admin/catalog.v1.json | 59 |
| `required_permission` | runtime | server/db/seed/contracts/authorization/catalog/neon-admin/compiled/compiled-catalog.v1.json | 45 |
| `required_permission` | ddl | server/db/ddl/control/01r_tables_document_runtime_action_rules.sql | 39, 62, 64, 93 |
| `required_permission` | ddl | server/db/ddl/control/03zz_meta_entity_contract_m1.sql | 146 |
| `required_permission` | ddl | server/db/ddl/control/06zz_meta_entity_contract_m1.sql | 71 |
| `required_permission` | generated | server/db/generated/authorization-catalog/neon-admin/compiled-catalog.v1.json | 45 |
| `required_permission` | seed | server/db/seed/platform/003_control/042c_commitment_contract.sql | 835, 838, 839 |
| `required_permission` | seed | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 1877, 1948 |
| `required_permission` | seed | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 23 |
| `required_permission` | seed | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 463, 545, 552, 560, 570 |
| `required_permission` | seed | server/db/seed/platform/003_control/100_control_seed_contract_assertions.sql | 637, 1751 |
| `required_permission` | generated | server/packages/adapters/db/src/generated/kysely-mesh/types.ts | 4642 |
| `required_permission` | generated | server/packages/adapters/db/src/generated/kysely/types.ts | 4642 |
| `required_permission` | generated | server/packages/adapters/db/src/prisma/schema.mesh.prisma | 3724, 3736 |
| `required_permission` | generated | server/packages/adapters/db/src/prisma/schema.prisma | 1358, 1370 |
| `required_permission` | route | server/packages/services/metadata/routes/document-runtime-registry.route.ts | 78, 94, 212, 281, 316 |
| `required_permission` | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 547 |
| `required_permission` | test | server/packages/services/metadata/src/__tests__/contract-application-v21.test.ts | 151 |
| `required_permission` | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 271, 678, 683 |
| `required_permission` | runtime | server/packages/services/records/lifecycle/execute-lifecycle-transition.ts | 415, 421, 427 |
| `required_permission` | route | server/packages/services/records/routes/supplier-intake.route.ts | 674, 681, 688 |
| `required_permission` | tool | server/scripts/verify-permissions.ts | 32, 54, 57, 60, 93, 96, 98 |
| `required_permissions` | ui | apps/admin/app/(shell)/setup/metadata/[entityId]/_components/StructuredContractEditor.tsx | 29, 50, 99, 104, 110 |
| `required_permissions` | contract | packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v21-upgrade.ts | 226 |
| `required_permissions` | contract | packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v21.ts | 125, 320, 334, 652, 698, 701 |
| `required_permissions` | runtime | server/db/seed/contracts/authorization/catalog/neon-admin/catalog.v1.json | 49 |
| `required_permissions` | runtime | server/db/seed/contracts/authorization/catalog/neon-admin/compiled/compiled-catalog.v1.json | 31 |
| `required_permissions` | ddl | server/db/ddl/control/01_tables.sql | 2623, 2711 |
| `required_permissions` | ddl | server/db/ddl/control/01zz_setup_workspace_registry.sql | 54, 80 |
| `required_permissions` | ddl | server/db/ddl/control/07z_v_entity_surface_contract_audit.sql | 48 |
| `required_permissions` | generated | server/db/generated/authorization-catalog/neon-admin/compiled-catalog.v1.json | 31 |
| `required_permissions` | tool | server/db/scripts/verify/verify-authorization-v2-wave2-live.ts | 102 |
| `required_permissions` | seed | server/db/seed/platform/003_control/092_control_entity_surface_contract.sql | 70, 233, 257, 281, 302 |
| `required_permissions` | seed | server/db/seed/platform/003_control/111_setup_workspace_registry.sql | 84, 102, 216, 232 |
| `required_permissions` | seed | server/db/seed/platform/003_control/112_setup_workspace_plane_registry.sql | 51, 65 |
| `required_permissions` | generated | server/packages/adapters/db/src/generated/kysely-mesh/types.ts | 5151, 10727 |
| `required_permissions` | generated | server/packages/adapters/db/src/generated/kysely/types.ts | 5151, 10727 |
| `required_permissions` | generated | server/packages/adapters/db/src/prisma/schema.mesh.prisma | 4369, 6307 |
| `required_permissions` | generated | server/packages/adapters/db/src/prisma/schema.prisma | 1967, 20348 |
| `required_permissions` | route | server/packages/services/metadata/routes/mesh-runtime.route.ts | 328, 342 |
| `required_permissions` | route | server/packages/services/metadata/routes/runtime-bootstrap.route.ts | 386 |
| `required_permissions` | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 468, 472 |
| `required_permissions` | route | server/packages/services/metadata/routes/studio-contract-v21.route.ts | 90 |
| `required_permissions` | route | server/packages/services/metadata/routes/studio-version.route.ts | 112 |
| `required_permissions` | test | server/packages/services/metadata/src/__tests__/contract-application-v21.test.ts | 131, 216, 221 |
| `required_permissions` | test | server/packages/services/metadata/src/__tests__/mesh-runtime-m6.test.ts | 14, 25 |
| `required_permissions` | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 272, 274, 275, 602, 614, 897, 916 |
| `required_permissions` | route | server/packages/services/platform/routes/platform.route.ts | 1457, 1463, 1472, 1494, 1518, 1550, 1553, 1564, 1565 |
| `requiredPermission` | ui | apps/admin/app/(shell)/settings/SettingsClient.tsx | 93 |
| `requiredPermission` | ui | apps/mesh/app/(shell)/settings/SettingsClient.tsx | 93 |
| `requiredPermission` | ui | apps/neon/app/(shell)/settings/SettingsClient.tsx | 76 |
| `requiredPermission` | contract | packages/shared/data-integration/api-contracts/src/schemas/me.ts | 275 |
| `requiredPermission` | ui | packages/shared/ui-platform/me-ui/src/settings-workspace.tsx | 28, 100, 101, 102, 103, 104, 141, 142 |
| `requiredPermission` | tool | scripts/policy/authorization-inventory.ts | 912 |
| `requiredPermission` | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 533, 539, 540, 541, 542, 547 |
| `requiredPermission` | route | server/packages/services/platform/routes/platform.route.ts | 115, 118, 119, 122, 123, 126, 127, 130, 131, 134 |
| `requiredPermission` | runtime | server/packages/services/records/lifecycle/execute-lifecycle-transition.ts | 93, 427, 438, 449, 459, 461 |
| `requiredPermissions` | runtime | packages/domain/finance/finance-workbench/src/lib/finance-setup.types.ts | 53 |
| `requiredPermissions` | runtime | packages/domain/finance/finance-workbench/src/lib/finance-setup.workspace.ts | 20, 30, 40, 50, 60, 78, 88, 98, 132, 151, 164, 177, 190 |
| `requiredPermissions` | test | packages/shared/runtime-domain/runtime-contracts/src/__tests__/setup-workspace.test.ts | 27, 43 |
| `requiredPermissions` | contract | packages/shared/runtime-domain/runtime-contracts/src/setup-workspace.ts | 62 |
| `requiredPermissions` | test | packages/shared/ui-platform/setup-ui/src/setup-directory.test.ts | 7 |
| `requiredPermissions` | ui | packages/shared/ui-platform/setup-ui/src/setup-directory.tsx | 20 |
| `requiredPermissions` | test | server/packages/services/ai/tools/__tests__/agent-read-only-tool-executor.test.ts | 484, 777 |
| `requiredPermissions` | test | server/packages/services/ai/tools/__tests__/record-lookup.tool.test.ts | 64 |
| `requiredPermissions` | test | server/packages/services/ai/tools/__tests__/sql-atlas-tool-adapters.test.ts | 172, 216, 274, 535, 569, 582, 594, 611, 626, 641, 664 |
| `requiredPermissions` | runtime | server/packages/services/ai/tools/agent-read-only-tool-executor.ts | 149, 160, 409, 643, 833, 868, 869, 1041, 1042, 1051, 1098 |
| `requiredPermissions` | runtime | server/packages/services/ai/tools/atlas-tool-schema.ts | 64, 106, 107, 108, 112, 113, 115, 127, 243, 269 |
| `requiredPermissions` | runtime | server/packages/services/ai/tools/atlas-tool.types.ts | 165, 294, 472, 555 |
| `requiredPermissions` | runtime | server/packages/services/ai/tools/catalog-help.tool.ts | 149 |
| `requiredPermissions` | runtime | server/packages/services/ai/tools/record-lookup.tool.ts | 133 |
| `requiredPermissions` | runtime | server/packages/services/ai/tools/sql-atlas-tool-authorization-revalidator.ts | 111, 141, 142, 143, 173, 192 |
| `requiredPermissions` | runtime | server/packages/services/ai/tools/sql-atlas-tool-execution-recorder.ts | 446, 447, 504, 609, 610 |
| `requiredPermissions` | test | server/packages/services/finance/__tests__/finance-settings-directory.contract.test.ts | 39 |
| `requiredPermissions` | test | server/packages/services/finance/__tests__/finance-settings-slice7-rollout.contract.test.ts | 85 |
| `requiredPermissions` | route | server/packages/services/platform/routes/platform.route.ts | 1472, 1474, 1494, 1518, 1564, 1584 |
| `roleIds` | tool | scripts/policy/authorization-inventory.ts | 735, 752 |
| `roleIds` | runtime | server/db/seed/contracts/authorization/authority/mesh/compiled/compiled-authority.v1.json | 282, 292, 302, 312, 322 |
| `roleIds` | runtime | server/db/seed/contracts/authorization/authority/neon-admin/compiled/compiled-authority.v1.json | 5863, 5873, 5883, 5893, 5903, 5913, 5923, 5933, 5941 |
| `roleIds` | tool | server/db/scripts/authority/compile-authorization-authority.ts | 92, 181, 187, 195, 199, 221, 229, 231, 264, 294, 307 |
| `roleIds` | tool | server/db/scripts/verify/verify-authorization-v2-wave3.ts | 39, 157, 158, 161, 204, 240 |
| `roleIds` | test | server/packages/services/iam/__tests__/permission-context-base.test.ts | 21, 26, 33, 34, 39, 40, 45, 46, 47 |
| `roleIds` | test | server/packages/services/iam/__tests__/permission-context-matrix-tier1.test.ts | 82, 87, 96, 129, 130, 139, 140, 145, 146, 151 |
| `roleIds` | runtime | server/packages/services/iam/outbox/iam-outbox-worker.ts | 175, 176, 181, 193, 203, 218 |
| `roleIds` | runtime | server/packages/services/iam/permission-context/resolvers/admin-resolver.ts | 67 |
| `roleIds` | runtime | server/packages/services/iam/permission-context/resolvers/base.ts | 44, 48 |
| `roleIds` | runtime | server/packages/services/iam/permission-context/resolvers/neon-resolver.ts | 81 |
| `roleIds` | tool | tools/scripts/update-realm-neon.cjs | 94, 96 |

## Keycloak mapper inventory

| Source | JSON path | Name | Mapper | User attribute | Claim | Hardcoded role |
|---|---|---|---|---|---|---|
| stack/config/iam/protocol-mappers/allowed-tenants.mapper.json |  | allowed-tenants | oidc-usermodel-attribute-mapper | allowed_tenants | allowed_tenants | — |
| stack/config/iam/protocol-mappers/required-actions.mapper.json |  | required-actions | oidc-usermodel-attribute-mapper | kc.required_actions | required_actions | — |
| stack/config/iam/protocol-mappers/tenant-id.mapper.json |  | tenant-id | oidc-usermodel-attribute-mapper | tenant_id | tenant_id | — |
| stack/config/iam/realm-athyper.json | clients.1.protocolMappers.0 | audience resolve | oidc-audience-resolve-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.10.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.11.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.12.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.13.protocolMappers.0 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.3.protocolMappers.0 | group-membership | oidc-group-membership-mapper | — | groups | — |
| stack/config/iam/realm-athyper.json | clients.3.protocolMappers.1 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
| stack/config/iam/realm-athyper.json | clients.5.protocolMappers.0 | group-membership | oidc-group-membership-mapper | — | groups | — |
| stack/config/iam/realm-athyper.json | clients.5.protocolMappers.1 | athyper-api-runtime audience | oidc-audience-mapper | — | — | — |
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
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.0 | realm_key | oidc-usermodel-attribute-mapper | realm_key | athyper.realm_key | — |
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.1 | plane_access | oidc-usermodel-attribute-mapper | plane_access | athyper.plane_access | — |
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.3 | tenant_type | oidc-usermodel-attribute-mapper | tenant_type | athyper.tenant_type | — |
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.4 | principal_type | oidc-usermodel-attribute-mapper | principal_type | athyper.principal_type | — |
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.5 | persona | oidc-usermodel-attribute-mapper | persona | athyper.persona | — |
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.6 | tenant_admin_surface | oidc-usermodel-attribute-mapper | tenant_admin_surface | athyper.tenant_admin_surface | — |
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.7 | partner_access | oidc-usermodel-attribute-mapper | partner_access | athyper.partner_access | — |
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.8 | mesh_access_model | oidc-usermodel-attribute-mapper | mesh_access_model | athyper.mesh_access_model | — |
| stack/config/iam/realm-athyper.json | clientScopes.15.protocolMappers.9 | admin_plane_access | oidc-usermodel-attribute-mapper | admin_plane_access | athyper.admin_plane_access | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.0 | realm_key | oidc-usermodel-attribute-mapper | realm_key | athyper.realm_key | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.1 | plane_access | oidc-usermodel-attribute-mapper | plane_access | athyper.plane_access | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.3 | tenant_type | oidc-usermodel-attribute-mapper | tenant_type | athyper.tenant_type | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.4 | principal_type | oidc-usermodel-attribute-mapper | principal_type | athyper.principal_type | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.5 | persona | oidc-usermodel-attribute-mapper | persona | athyper.persona | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.6 | tenant_admin_surface | oidc-usermodel-attribute-mapper | tenant_admin_surface | athyper.tenant_admin_surface | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.7 | partner_access | oidc-usermodel-attribute-mapper | partner_access | athyper.partner_access | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.8 | mesh_access_model | oidc-usermodel-attribute-mapper | mesh_access_model | athyper.mesh_access_model | — |
| stack/config/iam/realm-athyper.json | clientScopes.16.protocolMappers.9 | admin_plane_access | oidc-usermodel-attribute-mapper | admin_plane_access | athyper.admin_plane_access | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.0 | realm_key | oidc-usermodel-attribute-mapper | realm_key | athyper.realm_key | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.1 | plane_access | oidc-usermodel-attribute-mapper | plane_access | athyper.plane_access | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.2 | tenant_code | oidc-usermodel-attribute-mapper | tenant_code | athyper.tenant_code | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.3 | tenant_type | oidc-usermodel-attribute-mapper | tenant_type | athyper.tenant_type | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.4 | principal_type | oidc-usermodel-attribute-mapper | principal_type | athyper.principal_type | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.5 | persona | oidc-usermodel-attribute-mapper | persona | athyper.persona | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.6 | tenant_admin_surface | oidc-usermodel-attribute-mapper | tenant_admin_surface | athyper.tenant_admin_surface | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.7 | partner_access | oidc-usermodel-attribute-mapper | partner_access | athyper.partner_access | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.8 | mesh_access_model | oidc-usermodel-attribute-mapper | mesh_access_model | athyper.mesh_access_model | — |
| stack/config/iam/realm-athyper.json | clientScopes.17.protocolMappers.9 | admin_plane_access | oidc-usermodel-attribute-mapper | admin_plane_access | athyper.admin_plane_access | — |
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
| server/db/seed/contracts/authorization/authority/mesh/compiled/compiled-authority.v1.json | server/db/scripts/authority/compile-authorization-authority.ts --authority=mesh | mesh-platform | yes | yes |
| server/db/seed/contracts/authorization/authority/mesh/compiled/existing-user-group-manifest.v1.json | server/db/scripts/authority/compile-authorization-authority.ts --authority=mesh | mesh-platform | yes | yes |
| server/db/seed/contracts/authorization/authority/mesh/compiled/reconciliation-report.md | server/db/scripts/authority/compile-authorization-authority.ts --authority=mesh | mesh-platform | yes | yes |
| server/db/seed/contracts/authorization/authority/mesh/compiled/reconciliation-report.v1.json | server/db/scripts/authority/compile-authorization-authority.ts --authority=mesh | mesh-platform | yes | yes |
| server/db/seed/contracts/authorization/authority/neon-admin/compiled/compiled-authority.v1.json | server/db/scripts/authority/compile-authorization-authority.ts --authority=neon-admin | platform-iam | yes | yes |
| server/db/seed/contracts/authorization/authority/neon-admin/compiled/existing-user-group-manifest.v1.json | server/db/scripts/authority/compile-authorization-authority.ts --authority=neon-admin | platform-iam | yes | yes |
| server/db/seed/contracts/authorization/authority/neon-admin/compiled/reconciliation-report.md | server/db/scripts/authority/compile-authorization-authority.ts --authority=neon-admin | platform-iam | yes | yes |
| server/db/seed/contracts/authorization/authority/neon-admin/compiled/reconciliation-report.v1.json | server/db/scripts/authority/compile-authorization-authority.ts --authority=neon-admin | platform-iam | yes | yes |
| server/db/seed/contracts/authorization/catalog/mesh/compiled/catalog-preflight.sql | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=mesh | mesh-platform | yes | yes |
| server/db/seed/contracts/authorization/catalog/mesh/compiled/compiled-catalog.v1.json | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=mesh | mesh-platform | yes | yes |
| server/db/seed/contracts/authorization/catalog/mesh/compiled/contextual-aliases.v1.json | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=mesh | mesh-platform | yes | yes |
| server/db/seed/contracts/authorization/catalog/mesh/compiled/verification-report.v1.json | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=mesh | mesh-platform | yes | yes |
| server/db/seed/contracts/authorization/catalog/neon-admin/compiled/catalog-preflight.sql | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=neon-admin | platform-iam | yes | yes |
| server/db/seed/contracts/authorization/catalog/neon-admin/compiled/compiled-catalog.v1.json | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=neon-admin | platform-iam | yes | yes |
| server/db/seed/contracts/authorization/catalog/neon-admin/compiled/contextual-aliases.v1.json | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=neon-admin | platform-iam | yes | yes |
| server/db/seed/contracts/authorization/catalog/neon-admin/compiled/verification-report.v1.json | server/db/scripts/catalog/compile-authorization-catalog.ts --catalog=neon-admin | platform-iam | yes | yes |
| server/db/seed/contracts/generated/resolver-contracts.json | server/scripts/export-resolver-contracts.ts | metadata-platform | yes | yes |
| server/packages/adapters/db/src/prisma/schema.mesh.prisma | server/packages/adapters/db/scripts/prisma-generate.mjs --schema server/packages/adapters/db/src/prisma/schema.mesh.prisma | database-platform | yes | yes |
| server/packages/adapters/db/src/prisma/schema.prisma | server/packages/adapters/db/scripts/prisma-generate.mjs | database-platform | yes | yes |
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
