# Wave 0 authorization source inventory

> Generated deterministically by `scripts/policy/authorization-inventory.ts` from the reviewed exact-object registry. Edit the registry or scanner, then regenerate; do not hand-edit this report.

Registry SHA-256: `2721cb7663a9b47d864957c02bd46d857d776da3d7a69cca566e0d306d08d042`
Files scanned: 4818
Registered authorization objects: 79
Aggregated object references: 1874
Writer references: 335
Permission definitions / uses: 150 / 638
Authorization-bearing routes: 394
Keycloak mappers: 102
Open gate findings: 231

## Gate status

| Gate | Findings |
|---|---:|
| Unknown authorization sources | 231 |
| Unknown authorization writers | 0 |
| Unowned objects | 0 |
| Unclassified writers | 0 |
| Missing source definitions | 0 |
| Generated artifact failures | 0 |

A non-zero finding is deliberately visible and blocks the Wave 0 completeness gate. Tests and documentation do not satisfy runtime ownership.

## Registered authorities

| ID | Exact object | Database | Class | Owner | Planes | Disposition | Definitions | Readers | Writers |
|---|---|---|---|---|---|---|---:|---:|---:|
| audit.attachment_access | `log.attachment_access_log` | neon | decision_evidence | document-platform | neon | retain | 1 | 8 | 2 |
| audit.field_access | `log.field_access_log` | neon | decision_evidence | policy-platform | neon | retain | 1 | 8 | 0 |
| audit.permission_decision | `log.permission_decision_log` | neon | decision_evidence | platform-iam | admin, neon | replace_persona_evidence_fields | 1 | 10 | 1 |
| audit.security_event | `log.security_event_log` | neon | audit | security-platform | admin, neon | retain | 1 | 10 | 2 |
| authentication.mfa_config | `control.mfa_config` | neon | authentication_assurance | platform-iam | admin, neon | keep_keycloak_authority_projection | 1 | 15 | 5 |
| authorization.group | `master.auth_group` | neon | authorization | platform-iam | admin, neon | replace_additively | 1 | 29 | 12 |
| authorization.group_member | `master.auth_group_member` | neon | authorization | platform-iam | admin, neon | replace_additively | 1 | 34 | 12 |
| authorization.group_role | `master.auth_group_role` | neon | authorization | platform-iam | admin, neon | replace_additively | 1 | 26 | 12 |
| catalog.enterprise_feature | `shared.enterprise_feature` | neon_and_mesh_legacy | entitlement_catalog | platform-catalog | admin, neon, mesh | replace_with_feature_catalog | 1 | 13 | 3 |
| catalog.module | `shared.module` | neon_and_mesh_legacy | entitlement_catalog | platform-catalog | admin, neon, mesh | keep_neon_reference_only_in_mesh | 1 | 42 | 5 |
| catalog.subscription_plan | `shared.subscription_plan` | neon_and_mesh_legacy | entitlement_catalog | commercial-platform | neon | keep_neon | 1 | 14 | 3 |
| catalog.subscription_plan_version | `shared.subscription_plan_version` | neon_and_mesh_legacy | entitlement_catalog | commercial-platform | neon | keep_neon | 1 | 15 | 4 |
| catalog.workspace | `shared.workspace` | neon_and_mesh_legacy | entitlement_catalog | platform-catalog | admin, neon, mesh | keep_neon_reference_only_in_mesh | 1 | 23 | 4 |
| compiled.entity | `snapshot.entity_compiled` | neon | authorization_projection | metadata-platform | admin, neon | regenerate | 1 | 21 | 4 |
| context.principal_relationship | `master.principal_relationship` | neon | context_only | platform-iam | admin, neon | keep_non_authorizing | 1 | 10 | 0 |
| context.team | `master.team` | neon | context_only | organization-platform | neon | keep_non_authorizing | 1 | 12 | 0 |
| context.team_member | `master.team_member` | neon | context_only | organization-platform | neon | keep_non_authorizing | 1 | 10 | 0 |
| context.tenant_relationship | `master.tenant_relationship` | neon | context_only | platform-iam | admin, neon | keep_non_authorizing | 1 | 11 | 0 |
| function.check_permission | `master.check_permission` | neon | legacy_evaluator | platform-iam | neon | remove_after_shadow | 1 | 0 | 0 |
| function.derive_effective_roles | `master.derive_effective_roles` | neon | legacy_evaluator | platform-iam | neon | remove_after_shadow | 1 | 0 | 0 |
| function.effective_scope | `master.resolve_effective_authorization_scope` | neon | legacy_scope_evaluator | platform-iam | neon | replace_with_scope_repository | 1 | 0 | 0 |
| function.resolve_allowed_companies | `master.resolve_allowed_companies` | neon | legacy_scope_evaluator | platform-iam | neon | remove_after_shadow | 2 | 0 | 0 |
| function.visibility_scope | `master.get_effective_visibility_scope` | neon | legacy_scope_evaluator | platform-iam | neon | remove_after_shadow | 1 | 0 | 0 |
| identity.principal | `master.principal` | neon | identity | platform-iam | admin, neon | keep | 1 | 105 | 35 |
| identity.principal_binding | `master.principal_identity_binding` | neon | identity_binding | platform-iam | admin, neon | keep | 1 | 34 | 17 |
| identity.principal_profile | `master.principal_profile` | neon | identity_profile | platform-iam | admin, neon | remove_duplicate_idp_fields | 1 | 31 | 10 |
| identity.tenant_domain | `master.tenant_identity_domain` | neon | authentication_configuration | platform-iam | admin, neon | keep | 1 | 5 | 0 |
| identity.tenant_provider | `master.tenant_identity_provider` | neon | authentication_configuration | platform-iam | admin, neon | keep | 1 | 9 | 3 |
| legacy.access_grant | `master.access_grant` | neon | legacy_authorization | platform-iam | admin, neon, mesh | split_into_role_scope_override_acl | 1 | 20 | 2 |
| legacy.attachment_acl | `master.attachment_acl` | neon | record_acl | document-platform | neon | merge_into_auth_record_acl | 1 | 9 | 2 |
| legacy.business_network | `master.business_network` | neon | legacy_mesh_context | mesh-platform | mesh, neon | remove_from_neon | 1 | 16 | 3 |
| legacy.business_network_membership | `master.business_network_membership` | neon | legacy_mesh_authorization | mesh-platform | mesh, neon | remove_from_neon | 1 | 17 | 3 |
| legacy.business_network_membership_role | `master.business_network_membership_role` | neon | legacy_mesh_authorization | mesh-platform | mesh, neon | remove_from_neon | 1 | 9 | 3 |
| legacy.company_code_access | `master.company_code_access` | neon | legacy_scope | platform-iam | neon | remove | 1 | 15 | 4 |
| legacy.content_item_access_grant | `master.content_item_access_grant` | neon | record_acl | content-platform | neon | merge_into_auth_record_acl | 1 | 12 | 2 |
| legacy.delegation_grant | `master.delegation_grant` | neon | delegation | platform-iam | neon | normalize | 1 | 23 | 5 |
| legacy.group_feature_grant | `master.group_feature_grant` | neon | legacy_entitlement | platform-iam | neon | remove | 1 | 9 | 0 |
| legacy.permission | `shared.permission` | neon_and_mesh_legacy | permission_catalog | platform-iam | admin, neon, mesh | move_to_control_auth_permission | 1 | 60 | 6 |
| legacy.permission_category | `shared.permission_category` | neon_and_mesh_legacy | permission_catalog | platform-iam | admin, neon, mesh | move_to_control_auth_permission | 1 | 19 | 2 |
| legacy.permission_scope_policy | `shared.permission_scope_policy` | neon_and_mesh_legacy | scope | platform-iam | neon | move_to_control_scope_policy | 3 | 10 | 1 |
| legacy.persona | `shared.persona` | neon_and_mesh_legacy | legacy_authorization | platform-iam | admin, neon, mesh | remove | 1 | 32 | 1 |
| legacy.persona_permission | `shared.persona_permission` | neon_and_mesh_legacy | legacy_authorization | platform-iam | admin, neon, mesh | remove | 1 | 18 | 2 |
| legacy.plan_feature_access | `shared.plan_feature_access` | neon_and_mesh_legacy | entitlement | commercial-platform | neon | replace_with_plan_version_feature_access | 1 | 11 | 4 |
| legacy.plan_module_access | `shared.plan_module_access` | neon_and_mesh_legacy | entitlement | commercial-platform | neon | replace_with_plan_version_module_access | 1 | 12 | 4 |
| legacy.plan_permission_access | `shared.plan_permission_access` | neon_and_mesh_legacy | entitlement | commercial-platform | neon | remove_permission_level_entitlement | 1 | 13 | 3 |
| legacy.principal_feature_grant | `master.principal_feature_grant` | neon | legacy_entitlement | platform-iam | neon | remove | 1 | 9 | 0 |
| legacy.principal_persona | `master.principal_persona` | neon | legacy_authorization | platform-iam | admin, neon | remove | 1 | 25 | 8 |
| legacy.role | `shared.role` | neon_and_mesh_legacy | legacy_authorization | platform-iam | admin, neon, mesh | replace_with_tenant_plane_role | 1 | 36 | 2 |
| legacy.tenant_admin_grant | `master.tenant_admin_grant` | neon | legacy_plane_admission | platform-iam | admin | replace_with_auth_plane_membership | 1 | 12 | 5 |
| legacy.tenant_feature_entitlement | `master.tenant_feature_entitlement` | neon | entitlement | commercial-platform | neon | replace_with_tenant_entitlement | 1 | 12 | 2 |
| legacy.tenant_module_subscription | `master.tenant_module_subscription` | neon | entitlement | commercial-platform | neon | replace_with_tenant_entitlement | 1 | 14 | 5 |
| legacy.tenant_permission_override | `master.tenant_permission_override` | neon | entitlement_override | commercial-platform | neon | replace_with_feature_entitlement_override | 1 | 13 | 2 |
| mesh.account | `mesh.network_account` | mesh | plane_membership_context | mesh-platform | mesh | keep_mesh_only | 1 | 25 | 3 |
| mesh.account_grant | `mesh.account_grant` | mesh | legacy_authorization | mesh-platform | mesh | replace_with_mesh_local_role_group_model | 3 | 18 | 5 |
| mesh.attachment_acl | `mesh.attachment_acl` | mesh | record_acl | mesh-platform | mesh | normalize_mesh_locally | 1 | 3 | 0 |
| mesh.audit.access_decision | `mesh_log.access_decision_log` | mesh | decision_evidence | mesh-platform | mesh | retain | 1 | 5 | 0 |
| mesh.audit.attachment_access | `mesh_log.attachment_access_log` | mesh | decision_evidence | mesh-platform | mesh | retain | 1 | 5 | 0 |
| mesh.audit.security_event | `mesh_log.security_event_log` | mesh | audit | mesh-platform | mesh | retain | 1 | 5 | 0 |
| mesh.content_access_grant | `mesh.content_item_access_grant` | mesh | record_acl | mesh-platform | mesh | normalize_mesh_locally | 1 | 3 | 0 |
| mesh.function.grant_fingerprint | `mesh.fn_account_grant_fingerprint` | mesh | authorization_cache | mesh-platform | mesh | replace_with_authorization_fingerprint | 1 | 0 | 0 |
| mesh.function.grant_revoke | `mesh.fn_account_grant_revoke_hook` | mesh | authorization_change_hook | mesh-platform | mesh | replace_with_mesh_local_change_capture | 1 | 0 | 0 |
| mesh.identity.binding | `mesh.principal_identity_binding` | mesh | identity_binding | mesh-platform | mesh | keep_mesh_only | 1 | 10 | 3 |
| mesh.identity.principal | `mesh.principal` | mesh | identity | mesh-platform | mesh | keep_mesh_only | 1 | 14 | 3 |
| mesh.relationship | `mesh.network_relationship` | mesh | context_only | mesh-platform | mesh | keep_non_authorizing | 1 | 10 | 1 |
| mesh.rollout.feature_flag | `mesh_control.feature_flag` | mesh | rollout_control | mesh-platform | mesh | keep_mesh_only | 1 | 5 | 0 |
| metadata.entity_action_rule | `control.entity_action_rule` | neon | authorization_metadata | metadata-platform | admin, neon | replace_permission_code_with_permission_id | 1 | 18 | 6 |
| metadata.entity_flow | `control.entity_flow` | neon | authorization_metadata | metadata-platform | admin, neon | normalize_permission_references | 1 | 25 | 9 |
| metadata.entity_flow_step | `control.entity_flow_step` | neon | authorization_metadata | metadata-platform | admin, neon | normalize_permission_references | 1 | 19 | 5 |
| metadata.entity_operation | `control.entity_operation` | neon | authorization_metadata | metadata-platform | admin, neon | replace_permission_code_with_permission_id | 1 | 53 | 28 |
| metadata.entity_policy | `control.entity_policy` | neon | resource_policy | policy-platform | neon | keep_as_non_granting_guard | 1 | 19 | 10 |
| metadata.entity_relation | `control.entity_relation` | neon | authorization_metadata | metadata-platform | admin, neon | normalize_permission_references | 1 | 32 | 21 |
| metadata.entity_surface | `control.entity_surface` | neon | authorization_metadata | metadata-platform | admin, neon | normalize_permission_references | 1 | 24 | 9 |
| metadata.entity_version_contract | `control.entity_version_contract` | neon | authorization_metadata | metadata-platform | admin, neon | keep_canonical_contract | 1 | 16 | 8 |
| metadata.field_security_policy | `control.field_security_policy` | neon | field_authorization | policy-platform | neon | normalize_permission_references | 1 | 14 | 2 |
| metadata.lifecycle_transition | `control.lifecycle_transition` | neon | authorization_metadata | workflow-platform | neon | bind_exact_permission_id | 1 | 29 | 8 |
| metadata.permission_alias | `control.permission_alias` | neon | compatibility | platform-iam | admin, neon | remove_after_shadow | 1 | 10 | 1 |
| rollout.feature_flag | `control.feature_flag` | neon | rollout_control | platform-runtime | admin, neon | keep | 1 | 21 | 5 |
| support.session | `master.atlas_support_session` | neon | delegated_support_access | ai-platform | admin | keep_bounded_by_new_evaluator | 1 | 9 | 2 |
| support.session_audit | `master.atlas_support_session_audit` | neon | audit | ai-platform | admin | retain | 1 | 6 | 1 |

## Unknown source findings

| Type | Identity | Path | Lines |
|---|---|---|---|
| database_object | `master.fn_lookup_tenant_for_auth` | server/db/ddl/master/05_functions.sql | 34 |
| database_object | `master.trg_access_grant_status_changed` | server/db/ddl/master/05_functions.sql | 3477 |
| database_object | `shared.trg_protect_system_persona` | server/db/ddl/shared/05_functions.sql | 368 |
| object | `log.attachment_access_log_default` | config/governance/authorization-data-disposition-inventory.v1.json | 5129 |
| object | `log.field_access_log_default` | config/governance/authorization-data-disposition-inventory.v1.json | 5384 |
| object | `log.permission_decision_log_default` | config/governance/authorization-data-disposition-inventory.v1.json | 5537 |
| object | `master.legal_entity_identity_binding` | config/governance/authorization-data-disposition-inventory.v1.json | 7615 |
| object | `mesh_log.access_decision_log_default` | config/governance/authorization-data-disposition-inventory.v1.json | 9451 |
| object | `mesh_log.attachment_access_log_default` | config/governance/authorization-data-disposition-inventory.v1.json | 9485 |
| object | `log.attachment_access_log_default` | server/db/ddl/log/01_tables.sql | 278 |
| object | `log.field_access_log_default` | server/db/ddl/log/01_tables.sql | 218 |
| object | `log.permission_decision_log_default` | server/db/ddl/log/01_tables.sql | 188 |
| object | `event.delegation_request` | server/db/ddl/master/01_tables_identity.sql | 1989, 2006 |
| object | `master.delegation_scope` | server/db/ddl/master/01_tables_identity.sql | 1987, 1997 |
| object | `master.legal_entity_identity_binding` | server/db/ddl/master/01b_tables_finance.sql | 99 |
| object | `master.legal_entity_identity_binding` | server/db/ddl/master/01i_tables_party_master.sql | 304 |
| object | `master.legal_entity_identity_binding` | server/db/ddl/master/01i_tables_party_master.sql | 360, 362, 365, 372, 374, 376 |
| object | `master.legal_entity_identity_binding` | server/db/ddl/master/03_constraints.sql | 2908, 2909, 2912, 2916 |
| object | `master.fn_lookup_tenant_for_auth` | server/db/ddl/master/05_functions.sql | 34 |
| object | `master.fn_lookup_tenant_for_auth` | server/db/ddl/master/05_functions.sql | 46 |
| object | `master.trg_access_grant_status_changed` | server/db/ddl/master/05_functions.sql | 3477 |
| object | `master.trg_access_grant_status_changed` | server/db/ddl/master/05_functions.sql | 3488 |
| object | `master.trg_guard_auth_binding_service_client` | server/db/ddl/master/05_functions.sql | 4923 |
| object | `master.trg_guard_auth_binding_service_client` | server/db/ddl/master/05_functions.sql | 4952 |
| object | `master.delegation_scope` | server/db/ddl/master/06_triggers.sql | 501 |
| object | `master.fn_bump_auth_epoch` | server/db/ddl/master/06_triggers.sql | 2081 |
| object | `master.fn_bump_auth_epoch` | server/db/ddl/master/06_triggers.sql | 2147, 2162, 2178, 2190, 2203, 2213 |
| object | `master.legal_entity_identity_binding` | server/db/ddl/master/06_triggers.sql | 3089, 3090 |
| object | `master.principal_relationship_type` | server/db/ddl/master/06_triggers.sql | 203 |
| object | `master.principal_relationship_verification_status` | server/db/ddl/master/06_triggers.sql | 208 |
| object | `master.principal_relationship_verified_method` | server/db/ddl/master/06_triggers.sql | 213 |
| object | `master.trg_access_grant_status_changed` | server/db/ddl/master/06_triggers.sql | 419 |
| object | `master.trg_guard_auth_binding_service_client` | server/db/ddl/master/06_triggers.sql | 2027 |
| object | `master.trg_guard_delegation_grant_mutation` | server/db/ddl/master/06_triggers.sql | 552 |
| object | `master.trg_guard_delegation_grant_mutation` | server/db/ddl/master/06_triggers.sql | 575, 585 |
| object | `master.trg_validate_delegation_permissions` | server/db/ddl/master/06_triggers.sql | 510 |
| object | `master.trg_validate_delegation_permissions` | server/db/ddl/master/06_triggers.sql | 533, 541 |
| object | `master.legal_entity_identity_binding` | server/db/ddl/master/08_rls.sql | 2277, 2278, 2279, 2280, 2281, 2282, 2283, 2284, 2285, 2286, 2287 |
| object | `mesh_log.access_decision_log_default` | server/db/ddl/mesh_log/01_tables.sql | 150 |
| object | `mesh_log.attachment_access_log_default` | server/db/ddl/mesh_log/01_tables.sql | 198 |
| object | `shared.plan_permission_access_uq` | server/db/ddl/mesh/_shared/03_constraints.sql | 177 |
| object | `shared.trg_protect_system_persona` | server/db/ddl/mesh/_shared/06_triggers.sql | 152 |
| object | `master.fn_lookup_tenant_for_auth` | server/db/ddl/security/800_security_hardening.sql | 48, 115, 161 |
| object | `shared.plan_permission_access_uq` | server/db/ddl/shared/03_constraints.sql | 196 |
| object | `shared.trg_protect_system_persona` | server/db/ddl/shared/05_functions.sql | 368 |
| object | `shared.persona_scope_mode` | server/db/ddl/shared/06_triggers.sql | 168 |
| object | `shared.trg_protect_system_persona` | server/db/ddl/shared/06_triggers.sql | 153 |
| object | `master.acl_access_level` | server/db/seed/platform/000_lookups/LookupDomain/000_lookup_domains.sql | 1382 |
| object | `master.delegation_scope` | server/db/seed/platform/000_lookups/LookupDomain/000_lookup_domains.sql | 319 |
| object | `master.principal_relationship_type` | server/db/seed/platform/000_lookups/LookupDomain/000_lookup_domains.sql | 234 |
| object | `master.principal_relationship_verification_status` | server/db/seed/platform/000_lookups/LookupDomain/000_lookup_domains.sql | 240 |
| object | `master.principal_relationship_verified_method` | server/db/seed/platform/000_lookups/LookupDomain/000_lookup_domains.sql | 246 |
| object | `shared.persona_scope_mode` | server/db/seed/platform/000_lookups/LookupDomain/000_lookup_domains.sql | 188 |
| object | `log.release_decision_log` | server/db/seed/platform/000_lookups/LookupDomain/log/close_activity_type.sql | 23 |
| object | `master.acl_access_level` | server/db/seed/platform/000_lookups/LookupDomain/master/acl_access_level.sql | 8, 9, 10, 11 |
| object | `master.delegation_scope` | server/db/seed/platform/000_lookups/LookupDomain/master/delegation_scope.sql | 3, 16, 24, 33, 42, 51 |
| object | `master.principal_relationship_type` | server/db/seed/platform/000_lookups/LookupDomain/master/principal_relationship_type.sql | 7, 11, 15, 19, 23, 27, 31, 35 |
| object | `master.principal_relationship_verification_status` | server/db/seed/platform/000_lookups/LookupDomain/master/principal_relationship_verification_status.sql | 7, 11, 15, 19, 23 |
| object | `master.principal_relationship_verified_method` | server/db/seed/platform/000_lookups/LookupDomain/master/principal_relationship_verified_method.sql | 7, 11, 15, 19, 23, 27, 31 |
| object | `shared.persona_scope_mode` | server/db/seed/platform/000_lookups/LookupDomain/shared/persona_scope_mode.sql | 7, 11, 15 |
| object | `master.acl_access_level` | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 5611 |
| object | `master.delegation_scope` | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 5463 |
| object | `master.principal_relationship_type` | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 5456 |
| object | `master.principal_relationship_verification_status` | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 5457 |
| object | `master.principal_relationship_verified_method` | server/db/seed/platform/003_control/044_control_entity_operation_contract.sql | 5458 |
| object | `master.legal_entity_identity_binding` | server/packages/adapters/db/src/generated/kysely-mesh/types.ts | 12704 |
| object | `master.legal_entity_identity_binding` | server/packages/adapters/db/src/generated/kysely/types.ts | 12704 |
| object | `master.persona` | server/packages/services/iam/routes/operator.routes.ts | 1608 |
| permission_code | `INVOICE.LINE.ADD_FROM_CATALOG` | packages/shared/runtime-domain/runtime-add-item/src/test-harness/synthetic-adapter.ts | 53 |
| permission_code | `INVOICE.LINE.ADD_FROM_PO` | packages/shared/runtime-domain/runtime-add-item/src/test-harness/synthetic-adapter.ts | 159 |
| permission_code | `INVOICE.LINE.ADD_FROM_CATALOG` | packages/shared/runtime-domain/runtime-line-item/src/adapters/catalog.ts | 145 |
| permission_code | `INVOICE.LINE.ADD_FROM_PO` | packages/shared/runtime-domain/runtime-line-item/src/adapters/open-po-line.ts | 148 |
| permission_code | `INVOICE.LINE.ADD_FROM_RECEIPT` | packages/shared/runtime-domain/runtime-line-item/src/adapters/open-receipt-line.ts | 167 |
| permission_code | `INVOICE.LINE.ADD_FROM_SERVICE_SHEET` | packages/shared/runtime-domain/runtime-line-item/src/adapters/open-service-sheet-line.ts | 182 |
| permission_code | `INVOICE.LINE.ADD_FROM_CATALOG` | packages/shared/runtime-line-item/src/adapters/catalog.ts | 145 |
| permission_code | `INVOICE.LINE.ADD_FROM_PO` | packages/shared/runtime-line-item/src/adapters/open-po-line.ts | 148 |
| permission_code | `INVOICE.LINE.ADD_FROM_RECEIPT` | packages/shared/runtime-line-item/src/adapters/open-receipt-line.ts | 167 |
| permission_code | `INVOICE.LINE.ADD_FROM_SERVICE_SHEET` | packages/shared/runtime-line-item/src/adapters/open-service-sheet-line.ts | 182 |
| permission_code | `PPL.PII.EDIT` | server/db/ddl/master/08_people_rls.sql | 73, 80, 86, 90, 96 |
| permission_code | `PPL.PII.VIEW` | server/db/ddl/master/08_people_rls.sql | 72 |
| permission_code | `AP.INVOICE.APPROVE` | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | 25 |
| permission_code | `SALES.OPPORTUNITY.CREATE` | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | 22, 66 |
| permission_code | `SALES.ORDER.CREATE` | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | 24 |
| permission_code | `SALES.QUOTATION.CREATE` | server/db/seed/platform/002_permission_model/017a_permission_scope_policy.sql | 23, 67 |
| permission_code | `AD.EDIT` | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 1918 |
| permission_code | `HEADER.APPROVE` | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 1908 |
| permission_code | `HEADER.POST` | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 1919 |
| permission_code | `HEADER.REJECT` | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 1909 |
| permission_code | `HEADER.REVERSE` | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 1926 |
| permission_code | `PC.ADD` | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 1910 |
| permission_code | `PC.REPLACE` | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 1927 |
| permission_code | `HEADER.AMEND` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 58, 73, 88 |
| permission_code | `HEADER.APPROVE` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 37 |
| permission_code | `HEADER.CANCEL` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 27, 41, 53, 66, 84 |
| permission_code | `HEADER.CLOSE` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 102 |
| permission_code | `HEADER.COPY` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 29, 43, 49, 61, 76, 91, 99, 105, 110, 114, 118 |
| permission_code | `HEADER.CREATE_RECEIPT` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 70, 85 |
| permission_code | `HEADER.CREATE_SERVICE_SHEET` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 71, 86 |
| permission_code | `HEADER.EXPIRE` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 56, 69 |
| permission_code | `HEADER.EXPORT` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 28, 42, 48, 60, 75, 90, 98, 104, 109, 113, 117 |
| permission_code | `HEADER.HOLD` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 55, 68, 83 |
| permission_code | `HEADER.IMPORT` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 30 |
| permission_code | `HEADER.PLACE_ORDER` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 52 |
| permission_code | `HEADER.PRINT` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 31, 44, 59, 74, 89, 97, 103, 108, 112, 116 |
| permission_code | `HEADER.REJECT` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 38 |
| permission_code | `HEADER.RELEASE_HOLD` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 96 |
| permission_code | `HEADER.RETURN` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 39 |
| permission_code | `HEADER.REVISE` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 47, 57, 72, 87 |
| permission_code | `HEADER.SHORT_CLOSE` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 54, 67, 82 |
| permission_code | `HEADER.SUBMIT` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 26 |
| permission_code | `HEADER.WITHDRAW` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 40 |
| permission_code | `LINE.ADD` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 32 |
| permission_code | `LINE.CANCEL` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 63, 79 |
| permission_code | `LINE.CLOSE` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 62, 78, 93 |
| permission_code | `LINE.DELETE` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 34 |
| permission_code | `LINE.EDIT` | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 33, 77, 92 |
| permission_code | `HEADER.ACCEPT_CHANGES` | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 488 |
| permission_code | `HEADER.AMEND` | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 472, 507 |
| permission_code | `HEADER.APPROVE` | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 470, 506, 526 |
| permission_code | `HEADER.CANCEL` | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 475, 497 |
| permission_code | `HEADER.CLOSE` | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 478 |
| permission_code | `HEADER.CONVERT` | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 474, 477 |
| permission_code | `HEADER.DENY` | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 471 |
| permission_code | `HEADER.MARK_ARRIVED` | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 496 |
| permission_code | `HEADER.POST` | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 509, 529 |
| permission_code | `HEADER.REJECT` | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 486 |
| permission_code | `HEADER.REJECT_CHANGES` | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 489 |
| permission_code | `HEADER.REVERSE` | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 511, 531 |
| permission_code | `MESH.BUYER.CONNECT` | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 80, 190 |
| permission_code | `MESH.BUYER.MANAGE` | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 192 |
| permission_code | `MESH.BUYER.RESPOND` | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 81, 191 |
| permission_code | `MESH.BUYER.VIEW` | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 79, 189 |
| permission_code | `MESH.PARTNER.VIEW` | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 193 |
| permission_code | `SOURCE.EVENT.EVALUATE` | server/db/seed/platform/003_control/099_sourcing_meta_entity_contract.sql | 122 |
| permission_code | `HEADER.PLACE_ORDER` | server/db/seed/platform/003_control/100_control_seed_contract_assertions.sql | 635 |
| permission_code | `SALES.ORDER.CREATE` | server/db/seed/platform/003_control/100_sales_meta_entity_contract.sql | 85 |
| permission_code | `SOURCE.DEMAND.AGGREGATE` | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | 132 |
| permission_code | `SOURCE.EVENT.CREATE` | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | 67, 71, 113 |
| permission_code | `SOURCE.EVENT.EVALUATE` | server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts | 147 |
| permission_code | `SALES.OPPORTUNITY.CREATE` | server/packages/services/business/sales/sales-authorization.service.ts | 40, 41 |
| permission_code | `SALES.ORDER.CREATE` | server/packages/services/business/sales/sales-authorization.service.ts | 74 |
| permission_code | `SALES.QUOTATION.CREATE` | server/packages/services/business/sales/sales-authorization.service.ts | 96, 97 |
| permission_code | `IAM.GRANT.MANAGE` | server/packages/services/iam/routes/company-code-access.routes.ts | 244, 323 |
| permission_code | `IAM.DELEGATION.MANAGE` | server/packages/services/iam/routes/operator.routes.ts | 652, 730 |
| permission_code | `IAM.GRANT.MANAGE` | server/packages/services/iam/routes/operator.routes.ts | 527, 600, 793, 1493 |
| permission_code | `IAM.GROUP.MANAGE` | server/packages/services/iam/routes/operator.routes.ts | 429, 491, 897, 1034, 1110, 1172, 1280, 1378 |
| permission_code | `IAM.PRINCIPAL.READ` | server/packages/services/iam/routes/operator.routes.ts | 174 |
| permission_code | `MESH.ACCOUNT.EDIT` | server/packages/services/iam/session/session.service.ts | 273 |
| permission_code | `MESH.ACCOUNT.MANAGE` | server/packages/services/iam/session/session.service.ts | 274 |
| permission_code | `MESH.ACCOUNT.VIEW` | server/packages/services/iam/session/session.service.ts | 272 |
| permission_code | `MESH.MEMBER.VIEW` | server/packages/services/iam/session/session.service.ts | 275 |
| permission_code | `MESH.BUYER.VIEW` | server/packages/services/metadata/routes/mesh-inbox.route.ts | 157, 278 |
| security_symbol | `requiredPermission` | apps/admin/app/(shell)/settings/SettingsClient.tsx | 93 |
| security_symbol | `requiredPermission` | apps/mesh/app/(shell)/settings/SettingsClient.tsx | 93 |
| security_symbol | `resolveAccessContext` | apps/neon/app/(shell)/app/[entity]/page.tsx | 81 |
| security_symbol | `requiredPermission` | apps/neon/app/(shell)/settings/SettingsClient.tsx | 76 |
| security_symbol | `resolveRecordWorkspacePermissions` | apps/neon/lib/server/record-workspace-manifest.ts | 121, 146 |
| security_symbol | `resolveAccessScope` | packages/apps/admin/src/list/adminAdapter.ts | 29 |
| security_symbol | `resolveAccessScope` | packages/apps/mesh/src/list/meshAdapter.ts | 43 |
| security_symbol | `resolveAccessContext` | packages/apps/neon/src/list/createNeonAdapter.ts | 66, 146 |
| security_symbol | `resolveAccessScope` | packages/apps/neon/src/list/createNeonAdapter.ts | 67, 141, 142, 143 |
| security_symbol | `resolveAccessibleCompany` | packages/domain/finance/finance-workbench/src/lib/company-selection.ts | 22 |
| security_symbol | `requiredPermissions` | packages/domain/finance/finance-workbench/src/lib/finance-setup.types.ts | 53 |
| security_symbol | `requiredPermissions` | packages/domain/finance/finance-workbench/src/lib/finance-setup.workspace.ts | 20, 30, 40, 50, 60, 78, 88, 98, 132, 151, 164, 177, 190 |
| security_symbol | `resolveAccessibleCompany` | packages/domain/finance/finance-workbench/src/views/company-hub/CompanyHubView.tsx | 24, 82 |
| security_symbol | `resolveAccessibleCompany` | packages/domain/finance/finance-workbench/src/views/foundation/FoundationView.tsx | 15, 29 |
| security_symbol | `requiredPermission` | packages/shared/data-integration/api-contracts/src/schemas/me.ts | 275 |
| security_symbol | `checkPermissionForEntity` | packages/shared/data-integration/session-plane/src/index.ts | 200 |
| security_symbol | `checkPermissions` | packages/shared/data-integration/session-plane/src/index.ts | 186 |
| security_symbol | `enforceAuthorized` | packages/shared/platform-auth/auth-bff/src/auth-pipeline.ts | 132, 151 |
| security_symbol | `resolveAuthFailureHref` | packages/shared/platform-auth/auth-bff/src/error-codes.ts | 317 |
| security_symbol | `enforceAuthorized` | packages/shared/platform-auth/auth-bff/src/index.ts | 1185 |
| security_symbol | `resolveAuthFailureHref` | packages/shared/platform-auth/auth-bff/src/index.ts | 215 |
| security_symbol | `resolveAuthSessionPolicy` | packages/shared/platform-auth/auth-bff/src/index.ts | 576, 1075, 2434, 2806, 3056, 3505, 3556, 3608 |
| security_symbol | `resolveAuthFailureHref` | packages/shared/platform-auth/identity-gate/src/auth-failure-handler.ts | 19, 130 |
| security_symbol | `resolveAuthFailureHref` | packages/shared/platform-auth/identity-gate/src/auth-failure-page.tsx | 18, 56 |
| security_symbol | `getAuthExperience` | packages/shared/platform-auth/identity-gate/src/components.tsx | 6, 929 |
| security_symbol | `getAuthExperience` | packages/shared/platform-auth/identity-gate/src/experience.ts | 210 |
| security_symbol | `getAuthExperience` | packages/shared/platform-auth/identity-gate/src/login-gate-client.tsx | 18, 193 |
| security_symbol | `checkPermissionForEntity` | packages/shared/platform-auth/session-plane/src/index.ts | 218 |
| security_symbol | `checkPermissions` | packages/shared/platform-auth/session-plane/src/index.ts | 204 |
| security_symbol | `resolveAuthoritativeSurfaces` | packages/shared/runtime-domain/runtime-contracts/src/compiler.ts | 487, 568 |
| security_symbol | `enforcePermissions` | packages/shared/runtime-domain/runtime-contracts/src/process-runtime.ts | 48, 160, 215, 265 |
| security_symbol | `enforcePermissions` | packages/shared/runtime-domain/runtime-contracts/src/record-workspace.ts | 245 |
| security_symbol | `requiredPermissions` | packages/shared/runtime-domain/runtime-contracts/src/setup-workspace.ts | 62 |
| security_symbol | `resolveProcureAuthoringColumnKeys` | packages/shared/runtime-domain/runtime-line-item/src/surface/lines-grid.tsx | 200, 377 |
| security_symbol | `resolveAccessScope` | packages/shared/runtime-domain/runtime-list/src/adapter/types.ts | 371 |
| security_symbol | `resolveAccessScopeConfig` | packages/shared/runtime-domain/runtime-list/src/core/access-scope.ts | 59, 114, 159, 172 |
| security_symbol | `resolveAccessScopeFields` | packages/shared/runtime-domain/runtime-list/src/core/access-scope.ts | 61, 115, 170 |
| security_symbol | `resolveAccessScope` | packages/shared/runtime-domain/runtime-list/src/core/presenter-props.ts | 77 |
| security_symbol | `checkPermissionForEntity` | packages/shared/runtime-domain/session-plane/src/index.ts | 200 |
| security_symbol | `checkPermissions` | packages/shared/runtime-domain/session-plane/src/index.ts | 186 |
| security_symbol | `resolveProcureAuthoringColumnKeys` | packages/shared/runtime-line-item/src/surface/lines-grid.tsx | 200, 377 |
| security_symbol | `getEffectiveModuleAccess` | packages/shared/ui-platform/me-ui/src/sections/tenant-context-section.tsx | 120 |
| security_symbol | `requiredPermission` | packages/shared/ui-platform/me-ui/src/settings-workspace.tsx | 28, 100, 101, 102, 103, 104, 141, 142 |
| security_symbol | `requiredPermissions` | packages/shared/ui-platform/setup-ui/src/setup-directory.tsx | 20 |
| security_symbol | `getAuthTag` | server/packages/foundation/crypto/credential-encryption.service.ts | 127 |
| security_symbol | `requireAuth` | server/packages/foundation/openapi/openapi-generator.ts | 531, 541, 559, 566 |
| security_symbol | `requiredPermissions` | server/packages/services/ai/tools/agent-read-only-tool-executor.ts | 149, 160, 409, 643, 833, 868, 869, 1041, 1042, 1051, 1098 |
| security_symbol | `resolvedAuthorization` | server/packages/services/ai/tools/agent-read-only-tool-executor.ts | 341, 1078 |
| security_symbol | `requiredPermissions` | server/packages/services/ai/tools/atlas-tool-schema.ts | 64, 106, 107, 108, 112, 113, 115, 127, 243, 269 |
| security_symbol | `requiredPermissions` | server/packages/services/ai/tools/atlas-tool.types.ts | 165, 294, 472, 555 |
| security_symbol | `requiredPermissions` | server/packages/services/ai/tools/catalog-help.tool.ts | 149 |
| security_symbol | `requiredPermissions` | server/packages/services/ai/tools/record-lookup.tool.ts | 133 |
| security_symbol | `requiredPermissions` | server/packages/services/ai/tools/sql-atlas-tool-authorization-revalidator.ts | 111, 141, 142, 143, 173, 192 |
| security_symbol | `requiredPermissions` | server/packages/services/ai/tools/sql-atlas-tool-execution-recorder.ts | 446, 447, 504, 609, 610 |
| security_symbol | `getPermissionDecisionHandler` | server/packages/services/audit/routes/audit.route.ts | 481, 515 |
| security_symbol | `getEffectiveModuleAccess` | server/packages/services/iam/index.ts | 42 |
| security_symbol | `getEffectiveModuleAccess` | server/packages/services/iam/permission/module-access.service.ts | 80 |
| security_symbol | `resolvePermissionMatchSource` | server/packages/services/iam/permission/permission.service.ts | 121, 466 |
| security_symbol | `getEffectiveModuleAccess` | server/packages/services/iam/session/session.service.ts | 22, 525 |
| security_symbol | `resolveCurrentAuthEpoch` | server/packages/services/iam/session/session.service.ts | 87, 335 |
| security_symbol | `getOAuth2Token` | server/packages/services/integration/http-connector-client.ts | 214, 233 |
| security_symbol | `getFcmAccessToken` | server/packages/services/jobs/adapters/push.adapter.ts | 162, 218, 411 |
| security_symbol | `getEffectiveModuleAccess` | server/packages/services/metadata/routes/compiled-entity.route.ts | 24, 78, 582, 591, 598 |
| security_symbol | `getEffectiveModuleAccess` | server/packages/services/metadata/routes/entity-flow.route.ts | 25, 51, 294, 303, 310 |
| security_symbol | `getEffectiveModuleAccess` | server/packages/services/metadata/routes/index.ts | 27, 74 |
| security_symbol | `requiredPermission` | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 533, 539, 540, 541, 542, 547 |
| security_symbol | `resolvePermissionId` | server/packages/services/platform/routes/commerce.route.ts | 136, 703, 751, 1161, 1205 |
| security_symbol | `getEffectiveModuleAccess` | server/packages/services/platform/routes/platform.route.ts | 47, 3023 |
| security_symbol | `getPlanAccessHandler` | server/packages/services/platform/routes/platform.route.ts | 3299, 3598 |
| security_symbol | `requiredPermission` | server/packages/services/platform/routes/platform.route.ts | 115, 118, 119, 122, 123, 126, 127, 130, 131, 134 |
| security_symbol | `requiredPermissions` | server/packages/services/platform/routes/platform.route.ts | 1472, 1474, 1494, 1518, 1564, 1584 |
| security_symbol | `requiredPermission` | server/packages/services/records/lifecycle/execute-lifecycle-transition.ts | 93, 427, 438, 449, 459, 461 |
| security_symbol | `getAttachmentAuthFlags` | server/packages/services/shared/route-helpers.ts | 166 |
| security_symbol | `checkAuthQualifierInvariant` | server/scripts/verify-contact-role-allowed-coverage.ts | 60, 163 |
| security_symbol | `enforceAuthorized` | server/src/auth/auth-pipeline.ts | 426, 512 |
| security_symbol | `enforceAuthorized` | server/src/runtimes/api.ts | 802 |
| security_symbol | `getEffectiveModuleAccess` | server/src/runtimes/api.ts | 24, 1121 |
| security_symbol | `requireAuth` | server/src/runtimes/api.ts | 1643 |
| security_symbol | `enforceAuthorized` | server/src/runtimes/require-platform-context.ts | 226 |

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
| `master.auth_group` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 118 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/001_demo_rbac.sql | 42, 80, 97 |
| `master.auth_group` | truncate | seed | server/db/seed/tenants/neon/010_demo/950_rbac/001_demo_rbac.sql | 37, 78 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/003_operating_organization_rbac.sql | 41 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1268, 1279 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/002_neon_le_groups.sql | 54 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/004_mesh_buyer_bindings.sql | 80 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/950_rbac/001_rbac.sql | 24 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/002_neon_le_groups.sql | 44 |
| `master.auth_group` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/004_mesh_buyer_bindings.sql | 80 |
| `master.auth_group` | insert | route | server/packages/services/iam/routes/operator.routes.ts | 918 |
| `master.auth_group` | update | route | server/packages/services/iam/routes/operator.routes.ts | 1086, 1135 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 157 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/002_demo_group_members.sql | 40, 67, 131 |
| `master.auth_group_member` | truncate | seed | server/db/seed/tenants/neon/010_demo/950_rbac/002_demo_group_members.sql | 32 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/004_operating_organization_members.sql | 15 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1387 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/002_neon_le_groups.sql | 142 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/004_mesh_buyer_bindings.sql | 123 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/950_rbac/001_rbac.sql | 55, 63, 71 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/002_neon_le_groups.sql | 86 |
| `master.auth_group_member` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/004_mesh_buyer_bindings.sql | 123 |
| `master.auth_group_member` | delete | route | server/packages/services/iam/routes/operator.routes.ts | 498 |
| `master.auth_group_member` | insert | route | server/packages/services/iam/routes/operator.routes.ts | 457 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 136, 145 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/001_demo_rbac.sql | 148, 171, 203, 225 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/003_operating_organization_rbac.sql | 57 |
| `master.auth_group_role` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1294, 1309, 1324, 1345 |
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
| `shared.subscription_plan` | insert | seed | server/db/seed/platform/002_permission_model/014_subscription_plan.sql | 4 |
| `shared.subscription_plan` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 226 |
| `shared.subscription_plan` | update | route | server/packages/services/platform/routes/commerce.route.ts | 298 |
| `shared.subscription_plan_version` | update | ddl | server/db/ddl/mesh/_shared/06_triggers.sql | 158 |
| `shared.subscription_plan_version` | update | ddl | server/db/ddl/shared/06_triggers.sql | 176 |
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
| `master.principal` | insert | ddl | server/db/ddl/master/05_functions.sql | 138 |
| `master.principal` | update | ddl | server/db/ddl/master/05_functions.sql | 289, 316 |
| `master.principal` | update | ddl | server/db/ddl/master/06_triggers.sql | 2117 |
| `master.principal` | insert | seed | server/db/seed/platform/000_bootstrap/000_bootstrap.sql | 32 |
| `master.principal` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 43 |
| `master.principal` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/001_demo_principals.sql | 41 |
| `master.principal` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/004_athq_principals.sql | 38 |
| `master.principal` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_demo_in_priya.sql | 61 |
| `master.principal` | delete | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_principal_users.sql | 41 |
| `master.principal` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_principal_users.sql | 89, 107 |
| `master.principal` | delete | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1109 |
| `master.principal` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1118 |
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
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 84 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/001_demo_principals.sql | 86 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_demo_in_priya.sql | 91 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_principal_users.sql | 227 |
| `master.principal_identity_binding` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1232 |
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
| `master.principal_profile` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_principal_users.sql | 161 |
| `master.principal_profile` | insert | seed | server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql | 1155 |
| `master.principal_profile` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/900_principals/001_principals.sql | 56 |
| `master.principal_profile` | insert | runtime | server/packages/services/iam/jit/jit.service.ts | 238 |
| `master.principal_profile` | update | runtime | server/packages/services/jobs/workers/kc-sync.worker.ts | 327 |
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
| `shared.plan_module_access` | insert | seed | server/db/seed/platform/002_permission_model/016_plan_module_access.sql | 33 |
| `shared.plan_module_access` | delete | route | server/packages/services/platform/routes/commerce.route.ts | 635 |
| `shared.plan_module_access` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 588 |
| `shared.plan_permission_access` | delete | ddl | server/db/ddl/shared/01_tables.sql | 970 |
| `shared.plan_permission_access` | delete | route | server/packages/services/platform/routes/commerce.route.ts | 759 |
| `shared.plan_permission_access` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 712 |
| `master.principal_persona` | delete | seed | server/db/seed/tenants/admin/999_tenant_admin_grants.sql | 65 |
| `master.principal_persona` | insert | seed | server/db/seed/tenants/admin/999_tenant_admin_grants.sql | 72 |
| `master.principal_persona` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/001_demo_principals.sql | 105 |
| `master.principal_persona` | insert | seed | server/db/seed/tenants/neon/010_demo/900_principals/006_principal_users.sql | 296 |
| `master.principal_persona` | insert | runtime | server/packages/services/iam/jit/jit.service.ts | 307 |
| `master.principal_persona` | delete | runtime | server/packages/services/iam/persona-registry.service.ts | 180, 264 |
| `master.principal_persona` | insert | runtime | server/packages/services/iam/persona-registry.service.ts | 186 |
| `master.principal_persona` | insert | runtime | server/packages/services/shared/route-helpers.ts | 611, 654 |
| `shared.role` | insert | seed | server/db/seed/platform/002_permission_model/019_role.sql | 4 |
| `shared.role` | insert | seed | server/db/seed/tenants/neon/010_demo/950_rbac/003_operating_organization_rbac.sql | 20 |
| `master.tenant_admin_grant` | insert | seed | server/db/seed/tenants/admin/000_platform_staff.sql | 101 |
| `master.tenant_admin_grant` | delete | seed | server/db/seed/tenants/admin/999_tenant_admin_grants.sql | 21 |
| `master.tenant_admin_grant` | insert | seed | server/db/seed/tenants/admin/999_tenant_admin_grants.sql | 42 |
| `master.tenant_admin_grant` | insert | seed | server/db/seed/tenants/neon/020_technostat/network/003_admin_plane_bindings.sql | 75 |
| `master.tenant_admin_grant` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/network/003_admin_plane_bindings.sql | 52 |
| `master.tenant_feature_entitlement` | delete | route | server/packages/services/platform/routes/commerce.route.ts | 1132 |
| `master.tenant_feature_entitlement` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 1089 |
| `master.tenant_module_subscription` | insert | seed | server/db/seed/tenants/neon/010_demo/800_subscriptions/001_demo_module_subscriptions.sql | 7 |
| `master.tenant_module_subscription` | insert | seed | server/db/seed/tenants/neon/020_technostat/800_subscriptions/001_module_subscriptions.sql | 24 |
| `master.tenant_module_subscription` | insert | seed | server/db/seed/tenants/neon/030_cirrusatlantic/800_subscriptions/001_module_subscriptions.sql | 24 |
| `master.tenant_module_subscription` | delete | route | server/packages/services/platform/routes/commerce.route.ts | 1052 |
| `master.tenant_module_subscription` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 1007 |
| `master.tenant_permission_override` | delete | route | server/packages/services/platform/routes/commerce.route.ts | 1209 |
| `master.tenant_permission_override` | insert | route | server/packages/services/platform/routes/commerce.route.ts | 1165 |
| `mesh.network_account` | update | ddl | server/db/ddl/mesh/01a_foundation_tables.sql | 254 |
| `mesh.network_account` | update | ddl | server/db/ddl/mesh/09_streamline.sql | 121, 169 |
| `mesh.network_account` | insert | seed | server/db/seed/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 48 |
| `mesh.account_grant` | insert | ddl | server/db/ddl/mesh/01a_foundation_tables.sql | 344 |
| `mesh.account_grant` | update | ddl | server/db/ddl/mesh/01z_account_grant_fingerprint.sql | 61 |
| `mesh.account_grant` | insert | seed | server/db/seed/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 145 |
| `mesh.account_grant` | insert | route | server/packages/services/metadata/routes/admin-partner-bindings.route.ts | 211 |
| `mesh.account_grant` | update | route | server/packages/services/metadata/routes/admin-partner-bindings.route.ts | 267 |
| `mesh.principal_identity_binding` | insert | seed | server/db/seed/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 125 |
| `mesh.principal_identity_binding` | insert | runtime | server/packages/services/iam/session/session.service.ts | 192 |
| `mesh.principal_identity_binding` | update | runtime | server/packages/services/jobs/workers/kc-sync.worker.ts | 404, 444 |
| `mesh.principal` | insert | seed | server/db/seed/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 107 |
| `mesh.principal` | insert | runtime | server/packages/services/iam/session/session.service.ts | 181 |
| `mesh.principal` | update | runtime | server/packages/services/jobs/workers/kc-sync.worker.ts | 423 |
| `mesh.network_relationship` | insert | seed | server/db/seed/tenants/mesh/000_exchange/001_demo_network_accounts.sql | 153 |
| `control.entity_action_rule` | insert | seed | server/db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql | 1872 |
| `control.entity_action_rule` | delete | seed | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 20 |
| `control.entity_action_rule` | insert | seed | server/db/seed/platform/003_control/046j_po_action_rule_contract.sql | 22 |
| `control.entity_action_rule` | insert | seed | server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql | 462, 551 |
| `control.entity_action_rule` | delete | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 480 |
| `control.entity_action_rule` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 676 |
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
| `control.lifecycle_transition` | insert | seed | server/db/seed/platform/003_control/030_control_lifecycle_contract.sql | 38, 85, 136, 194, 253, 309, 370, 430, 486, 539, 597, 653, 704, 757, 813, 870, 928, 983, 1036, 1091, 1147, 1215, 1236, 1305, 1366, 1431, 1499, 1582, 1641, 1751 |
| `control.lifecycle_transition` | insert | seed | server/db/seed/platform/003_control/030p_p2p_lifecycle_contract.sql | 36, 93, 143, 193, 244 |
| `control.lifecycle_transition` | insert | seed | server/db/seed/platform/003_control/060_control_workflow_contract.sql | 44 |
| `control.lifecycle_transition` | insert | route | server/packages/services/metadata/routes/studio-contract-v2.route.ts | 352 |
| `control.lifecycle_transition` | insert | test | server/packages/services/metadata/src/__tests__/studio-contract-v2-wiring.test.ts | 31 |
| `control.lifecycle_transition` | insert | runtime | server/packages/services/metadata/src/contract-application/postgres-contract-application.repository.ts | 828 |
| `control.lifecycle_transition` | delete | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 521 |
| `control.lifecycle_transition` | insert | test | server/packages/services/workflow/__tests__/workflow-runtime.integration.test.ts | 406 |
| `control.permission_alias` | insert | seed | server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql | 6 |
| `control.feature_flag` | insert | seed | server/db/seed/platform/003_control/054_control_feature_flag_contract.sql | 1 |
| `control.feature_flag` | update | seed | server/db/seed/platform/003_control/110_finance_phase2_stage_f_rollout.sql | 4 |
| `control.feature_flag` | insert | seed | server/db/seed/platform/003_control/111_finance_fx_navigation_rollout.sql | 5 |
| `control.feature_flag` | insert | seed | server/db/seed/platform/003_control/112_finance_settings_directory_rollout.sql | 6 |
| `control.feature_flag` | insert | seed | server/db/seed/platform/003_control/113_unified_experience_rollout.sql | 14 |
| `master.atlas_support_session` | insert | runtime | server/packages/services/iam/support/sql-atlas-support-session.repository.ts | 46 |
| `master.atlas_support_session` | update | runtime | server/packages/services/iam/support/sql-atlas-support-session.repository.ts | 70 |
| `master.atlas_support_session_audit` | insert | runtime | server/packages/services/iam/support/sql-atlas-support-session.repository.ts | 77 |

## Authorization-bearing routes

| Source | Route | Methods | Permissions | Security symbols |
|---|---|---|---|---|
| server/packages/services/ai/routes/ai-agent.route.ts | `/ai/agent/models` | GET | `ai.agent.use` | resolveVerifiedRequestContext |
| server/packages/services/ai/routes/ai-agent.route.ts | `/ai/agent/runs` | POST | `ai.agent.use` | resolveVerifiedRequestContext |
| server/packages/services/ai/routes/ai.route.ts | `/ai/actions/preview` | POST | `ai.agent.feedback.submit`<br>`ai.calibrate_thresholds`<br>`ai.review_ai_output`<br>`ai.use_extraction` | checkPermission<br>requireAllow |
| server/packages/services/ai/routes/ai.route.ts | `/ai/actions/run` | POST | `ai.agent.feedback.submit`<br>`ai.calibrate_thresholds`<br>`ai.review_ai_output`<br>`ai.use_extraction` | checkPermission<br>requireAllow |
| server/packages/services/ai/routes/ai.route.ts | `/ai/feedback` | POST | `ai.agent.feedback.submit`<br>`ai.calibrate_thresholds`<br>`ai.review_ai_output`<br>`ai.use_extraction` | checkPermission<br>requireAllow |
| server/packages/services/ai/routes/ai.route.ts | `/ai/policy/autonomy` | PUT | `ai.agent.feedback.submit`<br>`ai.calibrate_thresholds`<br>`ai.review_ai_output`<br>`ai.use_extraction` | checkPermission<br>requireAllow |
| server/packages/services/ai/routes/ai.route.ts | `/ai/policy/effective` | GET | `ai.agent.feedback.submit`<br>`ai.calibrate_thresholds`<br>`ai.review_ai_output`<br>`ai.use_extraction` | checkPermission<br>requireAllow |
| server/packages/services/ai/routes/ai.route.ts | `/ai/policy/threshold` | PUT | `ai.agent.feedback.submit`<br>`ai.calibrate_thresholds`<br>`ai.review_ai_output`<br>`ai.use_extraction` | checkPermission<br>requireAllow |
| server/packages/services/audit/routes/audit.route.ts | `/audit/events` | GET | — | getPermissionDecisionHandler |
| server/packages/services/audit/routes/audit.route.ts | `/audit/events/:id` | GET | — | getPermissionDecisionHandler |
| server/packages/services/audit/routes/audit.route.ts | `/audit/events/export` | GET | — | getPermissionDecisionHandler |
| server/packages/services/audit/routes/audit.route.ts | `/audit/permission-decisions` | GET | — | getPermissionDecisionHandler |
| server/packages/services/audit/routes/audit.route.ts | `/audit/permission-decisions/:id` | GET | — | getPermissionDecisionHandler |
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
| server/packages/services/metadata/routes/studio-contract-v2.route.ts | `/metadata/studio/entity-versions/:id/contract-v2` | GET, PUT | `metadata.contract.edit`<br>`metadata.contract.view` | requiredPermission |
| server/packages/services/metadata/routes/studio-contract-v2.route.ts | `${fromState}:${toState}` | GET | `metadata.contract.edit`<br>`metadata.contract.view` | requiredPermission |
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
| server/packages/services/platform/routes/platform.route.ts | `/notifications/unread-count` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/cache` | POST | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/cache/clear` | POST | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/enterprise-features` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/fx-rates` | POST | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/fx-rates/:id` | DELETE, PATCH | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/health` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/session/rebuild` | POST | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/subscription-plans` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/subscription-plans/:id/access` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/tenant` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/admin/user/sync-profile` | POST | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/blueprints` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/blueprints/:code/apply` | DELETE, POST | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/content-hub` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/dashboard` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/entities` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/entities/:name/fields` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/experience-flags` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/modules` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/notifications` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/notifications/:id/read` | POST | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/notifications/read-all` | POST | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/notifications/stream` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/notifications/unread-count` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/saved-views` | POST | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/saved-views/:entity` | GET, POST | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/saved-views/:entity/:viewId` | DELETE, PATCH | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/saved-views/:entity/:viewId/default` | PATCH | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/saved-views/:entity/default` | DELETE | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/setup-directory` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/setup-handoff` | POST | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/stats` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/surface-events` | POST | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/platform/tenant-admin` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
| server/packages/services/platform/routes/platform.route.ts | `/user/tenant-admin` | GET | — | getEffectiveModuleAccess<br>getPlanAccessHandler<br>requiredPermission<br>requiredPermissions |
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
| server/packages/services/records/routes/action-dispatcher.route.ts | `/records/:entity/:id/action/:code` | POST | `approve`<br>`confirm`<br>`copy`<br>`deny`<br>`PO.PLACE_ORDER`<br>`post`<br>`reject`<br>`request_info`<br>`return`<br>`reverse`<br>`submit`<br>`void`<br>`withdraw` | checkPermission<br>requireAllowedPermission |
| server/packages/services/records/routes/action-dispatcher.route.ts | `/runtime/v1/entities/:entity/:id/action/:code` | POST | `approve`<br>`confirm`<br>`copy`<br>`deny`<br>`PO.PLACE_ORDER`<br>`post`<br>`reject`<br>`request_info`<br>`return`<br>`reverse`<br>`submit`<br>`void`<br>`withdraw` | checkPermission<br>requireAllowedPermission |
| server/packages/services/records/routes/bulk-crud.route.ts | `/records/:entity/bulk` | DELETE, PATCH | — | resolveAuth |
| server/packages/services/records/routes/entity-mutation-guard.ts | `<dynamic-or-mounted>` | UNKNOWN | — | checkEntityMutationAuthorization<br>checkPermission |
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
| server/packages/services/records/routes/records.route.ts | `/records/:entity` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/_debug` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/approvals` | POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lines` | GET, POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lines/:lineId` | DELETE, PATCH | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lines/:lineId/copy` | POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lines/:lineId/distributions` | GET, POST, PUT | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lines/:lineId/distributions/:distId` | DELETE, PATCH | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lock` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/:id/lock/force` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/filter-presets/:presetId` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/records/:entity/op/:op` | POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity/:id/approvals` | POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity/:id/lines/:lineId/distributions/:distId` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity/:id/lock` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity/:id/lock/force` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity/filter-presets/:presetId` | DELETE | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/entities/:entity/op/:op` | POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `/runtime/v1/reference-labels/resolve` | POST | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `accounting_distribution` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `company_code_id` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `created_at` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `created_by` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `legal_entity_id` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `schedule_line` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
| server/packages/services/records/routes/records.route.ts | `site_id` | GET | `approve`<br>`create`<br>`edit`<br>`records.lock.force_release` | checkEntityMutationAuthorization<br>checkPermission<br>requireAllow |
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

## Classification contract

- SQL and Kysely access is classified as define, read, reference, insert, update, delete, truncate, execute, or generated mirror.
- Authorization-object discovery uses exact qualified identities. Bare words such as `role`, `group`, and `policy` are not discovery signals; `master.pay_group`, `control.tax_group`, and posting-role accounting tables are therefore not IAM authorities.
- A structurally strong unregistered authorization object, an unreviewed runtime security symbol, or an unknown permission code in a permission-check context is emitted as an open gate.
- Dynamic SQL must be represented by an exact reviewed source entry; it is not silently allowlisted.
- Generated files are projections and must name an existing generator.
