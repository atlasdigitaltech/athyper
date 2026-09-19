# Mesh authorization inventory review

Status: inventory-only and non-enforcing. This artifact creates no permissions, roles, grants, or runtime bindings.

## Coverage

- Physical business-data tables: 70 (29 master, 9 document, 32 mesh)
- Reviewed network-topology tables: 9
- Pending business review: 61
- Proposed operations: 18
- Proposed lifecycles: 2
- Studio-to-Mesh provisionable resources: 1
- Roles: 0
- Grants: 0

## Reviewed classifications

| Classification | Tables |
| --- | ---: |
| aggregate_child | 5 |
| aggregate_root | 2 |
| immutable_evidence | 1 |
| sensitive_overlay | 1 |

## Reviewed tables

| Table | Classification | Aggregate roots | Writer owner | Scope |
| --- | --- | --- | --- | --- |
| mesh.network_account | aggregate_root | mesh.network_account | @athyper/server-plane-mesh | network_account |
| mesh.network_account_commodity_capability | aggregate_child | mesh.network_account | @athyper/server-plane-mesh | network_account |
| mesh.network_account_identifier | aggregate_child | mesh.network_account | @athyper/server-plane-mesh | network_account |
| mesh.network_account_industry_classification | aggregate_child | mesh.network_account | @athyper/server-plane-mesh | network_account |
| mesh.network_account_profile | aggregate_child | mesh.network_account | @athyper/server-plane-mesh | network_account |
| mesh.network_account_reference | aggregate_child | mesh.network_account | @athyper/server-plane-mesh | network_account |
| mesh.network_account_tax_registration | sensitive_overlay | mesh.network_account | @athyper/server-plane-mesh | network_account |
| mesh.network_lifecycle_event | immutable_evidence | mesh.network_account, mesh.network_relationship | mesh.trg_record_network_lifecycle | network_account, network_relationship |
| mesh.network_relationship | aggregate_root | mesh.network_relationship | @athyper/server-plane-mesh | network_relationship, network_account |

## Proposed operations

Definitions are review inputs only. An asterisk marks an authorization-bearing coordinate; other coordinates are obligatory participant context.

| Permission | Coordinates | Participant rule | Risk | MFA | SoD |
| --- | --- | --- | --- | --- | --- |
| mesh.network.network_account.read | network_account:networkAccountId* | single_owner | low | false | false |
| mesh.network.network_account.create | tenant:tenantId* | single_owner | medium | false | false |
| mesh.network.network_account.update | network_account:networkAccountId* | single_owner | medium | false | false |
| mesh.network.network_account.configure_profile | network_account:networkAccountId* | single_owner | medium | false | false |
| mesh.network.network_account.add_identifier | network_account:networkAccountId* | single_owner | medium | false | false |
| mesh.network.network_account.revoke_identifier | network_account:networkAccountId* | single_owner | high | true | false |
| mesh.network.network_account.change_network_role | network_account:networkAccountId* | single_owner | critical | true | true |
| mesh.network.network_account.activate | network_account:networkAccountId* | single_owner | high | true | true |
| mesh.network.network_account.suspend | network_account:networkAccountId* | single_owner | high | true | false |
| mesh.network.network_account.reinstate | network_account:networkAccountId* | single_owner | high | true | true |
| mesh.network.network_account.retire | network_account:networkAccountId* | single_owner | critical | true | true |
| mesh.network.network_relationship.read | network_relationship:networkRelationshipId*, network_account:actorNetworkAccountId*, network_account:buyerNetworkAccountId, network_account:supplierNetworkAccountId, tenant:buyerTenantId, tenant:supplierTenantId | either_participant | low | false | false |
| mesh.network.network_relationship.request | network_account:actorNetworkAccountId*, network_account:buyerNetworkAccountId, network_account:supplierNetworkAccountId, tenant:buyerTenantId, tenant:supplierTenantId | initiator_only | medium | false | false |
| mesh.network.network_relationship.accept | network_relationship:networkRelationshipId*, network_account:actorNetworkAccountId*, network_account:buyerNetworkAccountId, network_account:supplierNetworkAccountId, tenant:buyerTenantId, tenant:supplierTenantId | counterparty_only | high | true | true |
| mesh.network.network_relationship.reject | network_relationship:networkRelationshipId*, network_account:actorNetworkAccountId*, network_account:buyerNetworkAccountId, network_account:supplierNetworkAccountId, tenant:buyerTenantId, tenant:supplierTenantId | counterparty_only | medium | false | false |
| mesh.network.network_relationship.suspend | network_relationship:networkRelationshipId*, network_account:actorNetworkAccountId*, network_account:buyerNetworkAccountId, network_account:supplierNetworkAccountId, tenant:buyerTenantId, tenant:supplierTenantId | either_participant | high | true | false |
| mesh.network.network_relationship.resume | network_relationship:networkRelationshipId*, network_account:actorNetworkAccountId*, network_account:buyerNetworkAccountId, network_account:supplierNetworkAccountId, tenant:buyerTenantId, tenant:supplierTenantId | both_participants | high | true | true |
| mesh.network.network_relationship.terminate | network_relationship:networkRelationshipId*, network_account:actorNetworkAccountId*, network_account:buyerNetworkAccountId, network_account:supplierNetworkAccountId, tenant:buyerTenantId, tenant:supplierTenantId | either_participant | critical | true | true |

## Proposed lifecycle transitions

| Entity | Transition | From | To | Permission |
| --- | --- | --- | --- | --- |
| network_account | activate | pending | active | mesh.network.network_account.activate |
| network_account | suspend | active | suspended | mesh.network.network_account.suspend |
| network_account | reinstate | suspended | active | mesh.network.network_account.reinstate |
| network_account | retire | pending, active, suspended | retired | mesh.network.network_account.retire |
| network_relationship | accept | requested | active | mesh.network.network_relationship.accept |
| network_relationship | reject | requested | terminated | mesh.network.network_relationship.reject |
| network_relationship | suspend | active | suspended | mesh.network.network_relationship.suspend |
| network_relationship | resume | suspended | active | mesh.network.network_relationship.resume |
| network_relationship | terminate | active, suspended | terminated | mesh.network.network_relationship.terminate |

## Studio / TrustIAM / Mesh boundary

Keycloak supplies identity, organization/client admission and assurance only. Studio owns onboarding orchestration. TrustIAM supplies the exact network-account and role ceiling. Mesh owns account activation, relationships and exchange authority.

- Direct Studio SQL into Mesh: forbidden
- Studio relationship mutation: forbidden
- Mesh applier: @athyper/server-plane-mesh (required_not_implemented)
- Provisioned account status: pending
- TrustIAM ceiling: network_account/exact with networkRoleCeiling
- Relationship scope: derived_descendant_per_participant

Required before enforcement:

- Implement a Mesh-only network-account provisioner with an allowlist for pending account and profile state.
- Bind every command to source authority tenant, onboarding case, canonical party, target tenant, desired version and desired hash with verifiable provenance.
- Reject unknown command codes, wrong plane, wrong tenant, stale version, same-version hash conflict, network-role ceiling violations and non-pending target mutation.
- Prevent Studio provisioning from creating, accepting, suspending, resuming or terminating network relationships.
- Replace participant FOR ALL mutation RLS with participant SELECT policies and function-only, side-aware lifecycle transitions.
- Remove or qualify CURRENT_USER broad-write policies under actual runtime, provisioner, worker and administrator roles.
- Persist mutation, lifecycle evidence, receipt, audit record and outbox event atomically under non-owner, non-BYPASSRLS identities.
- Define durable two-party consent evidence for relationship resume and decide whether same-tenant buyer/supplier relationships are permitted.
- Prove wrong-side acceptance, missing coordinates, inactive account, suspended projection, role-ceiling, replay, cross-tenant and double-apply behavior against live databases.

## Static RLS findings

- Reviewed tables with participant FOR ALL mutation policy: mesh.network_relationship
- Reviewed tables with CURRENT_USER broad-write policy: mesh.network_account, mesh.network_account_commodity_capability, mesh.network_account_identifier, mesh.network_account_industry_classification, mesh.network_account_profile, mesh.network_account_reference, mesh.network_account_tax_registration, mesh.network_lifecycle_event, mesh.network_relationship

## Pending tables

- document.conversation
- document.conversation_participant
- document.entity_case
- document.entity_case_command_evidence
- document.entity_case_materialization
- document.entity_case_validation
- document.multipart_upload
- document.multipart_upload_part
- document.work_item
- master.address
- master.address_event
- master.address_link
- master.brand_profile
- master.contact_email
- master.contact_link
- master.contact_person
- master.contact_person_role
- master.contact_phone
- master.external_reference
- master.letterhead
- master.module
- master.principal
- master.principal_identity_binding
- master.principal_notification_preference
- master.principal_profile
- master.principal_ui_preference
- master.principal_ui_profile
- master.print_profile
- master.record_bookmark
- master.saved_view
- master.team
- master.team_member
- master.template
- master.template_binding
- master.tenant
- master.tenant_profile
- master.tenant_relationship
- master.workspace
- mesh.bank_account
- mesh.bank_account_disclosure
- mesh.bank_account_disclosure_event
- mesh.bank_account_link
- mesh.bank_provisional_reference
- mesh.business_partner_delivery_acknowledgement
- mesh.catalog
- mesh.catalog_audience
- mesh.catalog_availability
- mesh.catalog_item
- mesh.catalog_item_classification
- mesh.catalog_item_identifier
- mesh.catalog_item_uom
- mesh.catalog_price
- mesh.certification
- mesh.certification_type
- mesh.document_acknowledgement
- mesh.document_business_status_projection
- mesh.document_envelope
- mesh.document_event
- mesh.document_payload
- mesh.network_account_profile_publication
- mesh.network_account_profile_publication_event

## Release conclusion

Blocked: 61 tables still require business classification and 3 implementation/RLS qualification item(s) remain. Inventory compilation may continue; release compilation must fail.

