# Neon authorization inventory review

Status: inventory-only and non-enforcing. This artifact creates no roles, grants, or runtime bindings.

## Coverage

- Physical tables: 307 (145 master, 162 document)
- Reviewed tables: 45
- Pending business review: 262
- Proposed operations: 43
- Proposed lifecycles: 6
- Studio-to-Neon organization resource contracts: 3
- Roles: 0
- Grants: 0

## Reviewed classifications

| Classification | Tables |
| --- | ---: |
| aggregate_child | 21 |
| aggregate_root | 13 |
| immutable_evidence | 1 |
| projection_derived_state | 3 |
| sensitive_overlay | 5 |
| technical_work_state | 2 |

## Reviewed tables

| Table | Slice | Classification | Aggregate root | Writer owner | Scope |
| --- | --- | --- | --- | --- | --- |
| document.attachment | attachment_content | aggregate_root | document.attachment | @athyper/svc-attachments | resource |
| document.attachment_derivative | attachment_content | projection_derived_state | document.attachment | @athyper/svc-document-derivatives | resource |
| document.attachment_folder | attachment_content | aggregate_root | document.attachment_folder | @athyper/svc-attachments | resource |
| document.attachment_legal_hold | attachment_content | sensitive_overlay | document.attachment | @athyper/svc-attachments | resource |
| document.attachment_legal_hold_event | attachment_content | immutable_evidence | document.attachment | @athyper/svc-attachments | resource |
| document.attachment_link | attachment_content | aggregate_child | document.attachment | @athyper/svc-attachments | resource |
| document.attachment_series | attachment_content | aggregate_child | document.attachment | @athyper/svc-attachments | resource |
| document.business_partner_invitation | business_partner_onboarding | aggregate_root | document.business_partner_invitation | @athyper/server-service-master-data | tenant |
| document.business_partner_request | business_partner_onboarding | aggregate_root | document.business_partner_request | @athyper/server-plane-neon | operating_organization |
| document.business_partner_request_evidence | business_partner_onboarding | sensitive_overlay | document.business_partner_request | @athyper/server-plane-neon | operating_organization |
| document.business_partner_request_validation | business_partner_onboarding | aggregate_child | document.business_partner_request | @athyper/server-plane-neon | operating_organization |
| document.comment | attachment_content | aggregate_root | document.comment | @athyper/platform-collaboration | resource |
| document.comment_draft | attachment_content | aggregate_child | document.comment | @athyper/platform-collaboration | resource |
| document.comment_feed_cursor | attachment_content | projection_derived_state | document.comment | @athyper/platform-collaboration | resource |
| document.comment_mention | attachment_content | aggregate_child | document.comment | @athyper/platform-collaboration | resource |
| document.comment_reaction | attachment_content | aggregate_child | document.comment | @athyper/platform-collaboration | resource |
| document.content_item | attachment_content | aggregate_root | document.content_item | @athyper/svc-content | resource |
| document.content_item_link | attachment_content | aggregate_child | document.content_item | @athyper/svc-content | resource |
| document.conversation | attachment_content | aggregate_root | document.conversation | @athyper/platform-collaboration | resource |
| document.conversation_participant | attachment_content | aggregate_child | document.conversation | @athyper/platform-collaboration | resource |
| document.multipart_upload | attachment_content | technical_work_state | document.attachment | @athyper/svc-attachments | resource |
| document.multipart_upload_part | attachment_content | technical_work_state | document.attachment | @athyper/svc-attachments | resource |
| document.render_output | attachment_content | projection_derived_state | document.content_item | @athyper/svc-document-processing | resource |
| master.business_partner | business_partner | aggregate_root | master.business_partner | @athyper/svc-records | operating_organization |
| master.business_partner_commodity_capability | business_partner | aggregate_child | master.business_partner | @athyper/svc-records | operating_organization |
| master.business_partner_governance_relation | business_partner | aggregate_child | master.business_partner | @athyper/svc-records | operating_organization |
| master.business_partner_identifier | business_partner | aggregate_child | master.business_partner | @athyper/svc-records | operating_organization |
| master.business_partner_industry_classification | business_partner | aggregate_child | master.business_partner | @athyper/svc-records | operating_organization |
| master.business_partner_operating_organization_assignment | business_partner | aggregate_child | master.business_partner | @athyper/svc-records | operating_organization |
| master.business_partner_relationship | business_partner | aggregate_root | master.business_partner_relationship | @athyper/svc-records | operating_organization |
| master.business_partner_tax_registration | business_partner | sensitive_overlay | master.business_partner | @athyper/svc-records | legal_entity |
| master.certification | business_partner | aggregate_child | master.business_partner | @athyper/svc-records | operating_organization |
| master.company_code | organization_topology | aggregate_root | master.company_code | @athyper/server-service-master-data | company_code |
| master.company_code_customer_profile | business_partner | sensitive_overlay | master.business_partner | @athyper/svc-records | company_code |
| master.company_code_supplier_profile | business_partner | sensitive_overlay | master.business_partner | @athyper/svc-records | company_code |
| master.contact_person_identity_link | business_partner | aggregate_child | master.business_partner | @athyper/svc-master-data | operating_organization |
| master.customer | business_partner | aggregate_child | master.business_partner | @athyper/svc-records | operating_organization |
| master.intercompany_trading_pair | business_partner | aggregate_root | master.intercompany_trading_pair | @athyper/svc-records | legal_entity |
| master.legal_entity | organization_topology | aggregate_root | master.legal_entity | @athyper/server-service-master-data | legal_entity |
| master.legal_entity_internal_partner_link | business_partner | aggregate_child | master.business_partner | @athyper/svc-records | legal_entity |
| master.operating_organization | organization_topology | aggregate_root | master.operating_organization | @athyper/server-service-master-data | operating_organization |
| master.operating_organization_company_assignment | organization_topology | aggregate_child | master.operating_organization | @athyper/server-service-master-data | operating_organization, company_code |
| master.procurement_organization_profile | organization_topology | aggregate_child | master.operating_organization | @athyper/server-service-master-data | operating_organization |
| master.sales_organization_profile | organization_topology | aggregate_child | master.operating_organization | @athyper/server-service-master-data | operating_organization |
| master.supplier | business_partner | aggregate_child | master.business_partner | @athyper/svc-records | operating_organization |

## Proposed operations

These definitions are review inputs only; they are not published to `authz.permission` or granted to a role.

| Permission | Kind | Storage root | Scope | Risk | MFA | SoD |
| --- | --- | --- | --- | --- | --- | --- |
| neon.collaboration.attachment.read | entity_operation | document.attachment | resource | low | false | false |
| neon.collaboration.attachment.create | entity_operation | document.attachment | resource | medium | false | false |
| neon.collaboration.attachment.finalize | entity_operation | document.attachment | resource | medium | false | false |
| neon.collaboration.attachment.download | entity_operation | document.attachment | resource | medium | false | false |
| neon.collaboration.attachment.archive | entity_operation | document.attachment | resource | high | true | false |
| neon.content.content_item.read | entity_operation | document.content_item | resource | low | false | false |
| neon.content.content_item.create | entity_operation | document.content_item | resource | medium | false | false |
| neon.content.content_item.update | entity_operation | document.content_item | resource | medium | false | false |
| neon.content.content_item.submit | entity_operation | document.content_item | resource | medium | false | false |
| neon.content.content_item.publish | entity_operation | document.content_item | resource | high | true | true |
| neon.content.content_item.archive | entity_operation | document.content_item | resource | high | true | false |
| neon.content.content_item.grant_access | entity_operation | document.content_item | resource | high | true | false |
| neon.content.content_item.revoke_access | entity_operation | document.content_item | resource | high | true | false |
| neon.relationship.business_partner.read | entity_operation | master.business_partner | operating_organization | low | false | false |
| neon.relationship.business_partner.create | entity_operation | master.business_partner | operating_organization | medium | false | false |
| neon.relationship.business_partner.update | entity_operation | master.business_partner | operating_organization | medium | false | false |
| neon.relationship.business_partner.activate | entity_operation | master.business_partner | operating_organization | high | true | true |
| neon.relationship.business_partner.deactivate | entity_operation | master.business_partner | operating_organization | high | true | true |
| neon.relationship.business_partner.archive | entity_operation | master.business_partner | operating_organization | high | true | true |
| neon.organization.legal_entity.read | entity_operation | master.legal_entity | legal_entity | low | false | false |
| neon.organization.legal_entity.create | entity_operation | master.legal_entity | tenant | medium | false | false |
| neon.organization.legal_entity.update | entity_operation | master.legal_entity | legal_entity | medium | false | false |
| neon.organization.legal_entity.activate | entity_operation | master.legal_entity | legal_entity | high | true | true |
| neon.organization.legal_entity.deactivate | entity_operation | master.legal_entity | legal_entity | high | true | true |
| neon.organization.legal_entity.retire | entity_operation | master.legal_entity | legal_entity | critical | true | true |
| neon.organization.legal_entity.archive | entity_operation | master.legal_entity | legal_entity | high | true | true |
| neon.organization.company_code.read | entity_operation | master.company_code | company_code | low | false | false |
| neon.organization.company_code.create | entity_operation | master.company_code | legal_entity | medium | false | false |
| neon.organization.company_code.update | entity_operation | master.company_code | company_code | medium | false | false |
| neon.organization.company_code.activate | entity_operation | master.company_code | company_code | high | true | true |
| neon.organization.company_code.deactivate | entity_operation | master.company_code | company_code | high | true | true |
| neon.organization.company_code.retire | entity_operation | master.company_code | company_code | critical | true | true |
| neon.organization.company_code.archive | entity_operation | master.company_code | company_code | high | true | true |
| neon.organization.operating_organization.read | entity_operation | master.operating_organization | operating_organization | low | false | false |
| neon.organization.operating_organization.create | entity_operation | master.operating_organization | tenant | medium | false | false |
| neon.organization.operating_organization.update | entity_operation | master.operating_organization | operating_organization | medium | false | false |
| neon.organization.operating_organization.configure_profile | entity_operation | master.operating_organization | operating_organization | medium | false | false |
| neon.organization.operating_organization.assign_company_code | entity_operation | master.operating_organization | operating_organization, company_code | high | true | true |
| neon.organization.operating_organization.unassign_company_code | entity_operation | master.operating_organization | operating_organization, company_code | high | true | true |
| neon.organization.operating_organization.activate | entity_operation | master.operating_organization | operating_organization | high | true | true |
| neon.organization.operating_organization.deactivate | entity_operation | master.operating_organization | operating_organization | high | true | true |
| neon.organization.operating_organization.retire | entity_operation | master.operating_organization | operating_organization | critical | true | true |
| neon.organization.operating_organization.archive | entity_operation | master.operating_organization | operating_organization | high | true | true |

## Proposed lifecycle transitions

| Entity | Transition | From | To | Permission |
| --- | --- | --- | --- | --- |
| attachment | finalize | pending, uploading, uploaded | active | neon.collaboration.attachment.finalize |
| attachment | archive | active, orphaned, expired | archived | neon.collaboration.attachment.archive |
| content_item | submit | DRAFT | REVIEW | neon.content.content_item.submit |
| content_item | publish | REVIEW | PUBLISHED | neon.content.content_item.publish |
| content_item | archive | DRAFT, REVIEW, PUBLISHED | ARCHIVED | neon.content.content_item.archive |
| business_partner | activate | draft, inactive | active | neon.relationship.business_partner.activate |
| business_partner | deactivate | active | inactive | neon.relationship.business_partner.deactivate |
| business_partner | archive | draft, inactive | archived | neon.relationship.business_partner.archive |
| legal_entity | activate | draft, inactive | active | neon.organization.legal_entity.activate |
| legal_entity | deactivate | active | inactive | neon.organization.legal_entity.deactivate |
| legal_entity | retire | active, inactive | retired | neon.organization.legal_entity.retire |
| legal_entity | archive | draft, retired | archived | neon.organization.legal_entity.archive |
| company_code | activate | draft, inactive | active | neon.organization.company_code.activate |
| company_code | deactivate | active | inactive | neon.organization.company_code.deactivate |
| company_code | retire | active, inactive | retired | neon.organization.company_code.retire |
| company_code | archive | draft, retired | archived | neon.organization.company_code.archive |
| operating_organization | activate | draft, inactive | active | neon.organization.operating_organization.activate |
| operating_organization | deactivate | active | inactive | neon.organization.operating_organization.deactivate |
| operating_organization | retire | active, inactive | retired | neon.organization.operating_organization.retire |
| operating_organization | archive | draft, retired | archived | neon.organization.operating_organization.archive |

## Studio onboarding / Neon organization boundary

Keycloak proves identity, organization/client admission and assurance only. Studio owns onboarding orchestration and desired-state evidence. TrustIAM projection rows are authorization scope ceilings only. Neon owns the legal-entity, company-code and operating-organization records and their business lifecycle.

- Direct Studio SQL into Neon: forbidden
- Keycloak meaning: identity_organization_and_assurance_only
- Studio projection grants Neon authority: no
- Neon applier: @athyper/server-service-master-data (required_not_implemented)
- Provisioned status: draft; business activation by provisioner: forbidden

| Resource kind | Neon aggregate | Create scope | Apply rule | Activation permission |
| --- | --- | --- | --- | --- |
| legal_entity | master.legal_entity | tenant/tenantId | create_draft_or_update_existing_draft | neon.organization.legal_entity.activate |
| company_code | master.company_code | legal_entity/legalEntityId | create_draft_or_update_existing_draft | neon.organization.company_code.activate |
| operating_organization | master.operating_organization | tenant/tenantId | create_draft_or_update_existing_draft | neon.organization.operating_organization.activate |

Required before enforcement:

- Implement a Neon-only master-data provisioner with an allowlist for the three resource kinds and their desired-state fields.
- Bind every command to source authority tenant, onboarding case, canonical party, exact target tenant, desired version and desired hash with verifiable provenance.
- Reject unknown command codes, target-plane mismatch, target-tenant mismatch, stale version, same-version hash conflict and non-draft target mutation.
- Persist resource mutation, command receipt, audit evidence and outbox event in one Neon transaction under a non-BYPASSRLS provisioner role.
- Prove replay, suspension, provenance, wrong-plane, cross-tenant and double-apply behavior with live databases.
- Keep Neon activation behind the plane-local MFA, SoD, policy and exact-scope operation; Studio convergence must never imply business activation.

## Pending tables

- document.accounting_distribution
- document.asset_transaction
- document.attendance_adjustment_request
- document.attendance_day
- document.bank_recon_case
- document.bank_recon_case_line
- document.bank_statement
- document.bank_statement_line
- document.budget_allocation
- document.budget_profile
- document.business_partner_bank_verification
- document.business_partner_duplicate_resolution
- document.business_partner_invitation_recovery
- document.business_partner_request_address
- document.business_partner_request_certification
- document.business_partner_request_classification
- document.business_partner_request_contact_channel
- document.business_partner_request_contact_person
- document.business_partner_request_identifier
- document.business_partner_request_materialization_item
- document.business_partner_request_tax_registration
- document.catalog_import
- document.catalog_import_line
- document.commitment
- document.commitment_line
- document.commitment_release_allocation
- document.compensation_change
- document.contingent_work_order
- document.contingent_work_order_revision
- document.delivery_note
- document.delivery_note_line
- document.depreciation_run
- document.depreciation_run_line
- document.depreciation_schedule
- document.employee_tax_declaration
- document.employee_tax_declaration_line
- document.engagement_onboarding_case
- document.entity_case
- document.entity_case_command_evidence
- document.entity_case_materialization
- document.entity_case_validation
- document.external_candidate_evaluation
- document.external_candidate_submission
- document.external_expense_item
- document.external_expense_sheet
- document.external_service_entry
- document.external_service_entry_line
- document.external_time_entry
- document.external_time_sheet
- document.external_workforce_invoice_allocation
- document.fx_revaluation_run
- document.hr_case
- document.ic_elimination
- document.import_request
- document.import_request_chunk
- document.intercompany_agreement
- document.intercompany_transaction
- document.invoice_match_case
- document.journal_entry
- document.journal_line
- document.journal_line_reference
- document.leave_balance_entry
- document.leave_request
- document.match_exception
- document.mesh_business_partner_acceptance
- document.mesh_business_partner_acceptance_event
- document.mesh_business_partner_match
- document.netting_batch
- document.obligation_horizon
- document.offboarding_case
- document.onboarding_case
- document.payment_entry
- document.payment_entry_allocation
- document.payment_remittance_output
- document.payment_term_application
- document.payment_term_discount_result
- document.payroll_period
- document.payroll_result
- document.payroll_result_line
- document.payroll_run
- document.payroll_run_employee
- document.people_request
- document.planning_scenario
- document.planning_scenario_line
- document.policy_acknowledgment
- document.pricing_component
- document.production_order
- document.production_order_component
- document.project_task
- document.project_task_requirement
- document.punchout_cart
- document.punchout_cart_line
- document.purchase_invoice
- document.purchase_invoice_line
- document.purchase_order_confirmation
- document.purchase_order_confirmation_line
- document.purchase_requisition
- document.purchase_requisition_line
- document.receipt
- document.receipt_line
- document.sales_opportunity
- document.sales_opportunity_company
- document.sales_order
- document.sales_order_intercompany_fulfillment
- document.sales_order_line
- document.sales_quotation
- document.sales_quotation_allocation
- document.sales_quotation_company
- document.schedule_line
- document.service_sheet
- document.service_sheet_line
- document.service_sheet_source_allocation
- document.shift_assignment
- document.sourcing_event
- document.sourcing_event_award
- document.sourcing_event_award_allocation
- document.sourcing_event_company
- document.sourcing_event_demand
- document.sourcing_event_intercompany_allocation
- document.statement_of_work
- document.statement_of_work_item
- document.statement_of_work_revision
- document.stocktake
- document.stocktake_line
- document.supplier_activation_evidence
- document.time_punch
- document.user_profile_update_request
- document.wht_certificate
- document.work_item
- document.worker_compliance_item
- document.worker_engagement
- document.worker_operational_placement
- document.workflow_request
- document.workflow_stage
- document.workforce_iam_projection
- document.workforce_request
- document.workforce_request_validation
- document.workforce_requisition
- document.workforce_requisition_supplier
- master.accounting_profile
- master.address
- master.address_event
- master.address_link
- master.asset
- master.asset_assignment_history
- master.asset_book
- master.asset_class
- master.asset_component
- master.bank_account
- master.bank_account_house_config
- master.bank_account_link
- master.bank_party
- master.bom
- master.bom_component
- master.brand_profile
- master.business_intent
- master.business_partner_alias
- master.career_band
- master.career_level
- master.catalog
- master.catalog_item
- master.catalog_price
- master.certification_type
- master.chart_of_account
- master.commodity_category
- master.commodity_code_assignment
- master.company_code_book_assignment
- master.company_code_chart_assignment
- master.company_code_dimension_default
- master.company_code_gl_account
- master.compensation_assignment
- master.condition_type
- master.contact_email
- master.contact_link
- master.contact_person
- master.contact_person_role
- master.contact_phone
- master.cost_center
- master.designation
- master.dimension_set
- master.dimension_set_item
- master.dimension_type
- master.dimension_value
- master.employee
- master.employee_leave_enrollment
- master.employee_statutory_enrollment
- master.employment
- master.external_reference
- master.external_worker
- master.fiscal_period
- master.fx_rate
- master.gl_account
- master.holiday_calendar
- master.holiday_calendar_day
- master.item
- master.job
- master.job_family
- master.job_function
- master.leave_plan
- master.leave_plan_rule
- master.leave_type
- master.ledger_book
- master.letterhead
- master.module
- master.org_unit
- master.organization_amendment
- master.organization_tax_registration
- master.party_risk_assessment
- master.party_risk_dimension_score
- master.party_risk_driver
- master.party_risk_evidence
- master.party_risk_mitigation
- master.party_risk_review_event
- master.pay_component
- master.pay_grade
- master.pay_group
- master.pay_structure
- master.pay_structure_line
- master.payment_method
- master.payment_term
- master.payment_term_clause
- master.payment_term_discount_tier
- master.person
- master.person_business_partner_legacy_link
- master.person_sensitive_profile
- master.position
- master.principal
- master.principal_identity_binding
- master.principal_notification_preference
- master.principal_profile
- master.principal_ui_preference
- master.principal_ui_profile
- master.print_profile
- master.product
- master.profit_center
- master.project
- master.project_item
- master.project_wbs
- master.record_bookmark
- master.risk_dimension
- master.risk_driver_registry
- master.risk_model
- master.risk_model_dimension
- master.risk_source
- master.saved_view
- master.shift_type
- master.site
- master.statutory_scheme
- master.tax_jurisdiction
- master.tax_type
- master.team
- master.team_member
- master.template
- master.template_binding
- master.tenant
- master.tenant_profile
- master.tenant_relationship
- master.warehouse
- master.work_assignment
- master.work_pattern
- master.work_pattern_day
- master.workspace

## Release conclusion

Blocked: 262 tables still require business classification and 1 implementation qualification item(s) remain. Inventory compilation may continue; release compilation must fail.

