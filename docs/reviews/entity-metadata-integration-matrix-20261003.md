# Per-entity source integration matrix

Date: 3 October 2026. Static source inventory; effective publication and runtime behavior are unverified. Exact operation, permission, policy, ownership, scope, profile, navigation and storage declarations are recorded with source JSON pointers in [the full matrix](entity-metadata-integration-matrix-20261003.json). Null evidence is not an authorization decision.

All rows retain platform-owned Studio product-release authorship and independent Platform Owner review as the required publication model. `ownershipModel` below is the separate entity graph property. Split `plane` is not proof of all intended publication targets.

| Entity / source home relative to `metadata/entities/` | Graph ownership | Declared native / split planes | Storage | Placement assessment |
| --- | --- | --- | --- | --- |
| country — `common/reference/country` | not explicitly declared | studio,neon,mesh / neon | `country` | declared placement; preserve exact module/planes |
| currency — `common/reference/currency` | not explicitly declared | studio,neon,mesh / neon | `currency` | declared placement; preserve exact module/planes |
| language — `common/reference/language` | not explicitly declared | studio,neon,mesh / neon | `language` | declared placement; preserve exact module/planes |
| locale — `common/reference/locale` | not explicitly declared | studio,neon,mesh / neon | `locale` | declared placement; preserve exact module/planes |
| state_region — `common/reference/state_region` | not explicitly declared | studio,neon,mesh / neon | `state_region` | declared placement; preserve exact module/planes |
| timezone — `common/reference/timezone` | not explicitly declared | studio,neon,mesh / neon | `timezone` | declared placement; preserve exact module/planes |
| business_partner — `mdg/bp/business_partner` | not explicitly declared |  / neon | `master.business_partner_identity_current` | declared placement; preserve exact module/planes |
| business_partner_alias — `mdg/bp/business_partner_alias` | not explicitly declared |  / neon | `master.business_partner_alias` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_bank_account_link — `mdg/bp/business_partner_bank_account_link` | not explicitly declared |  / neon | `master.payment_instrument_link` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_bank_provisional_reference — `mdg/bp/business_partner_bank_provisional_reference` | not explicitly declared |  / neon | `master.bank_provisional_reference` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_banking — `mdg/bp/business_partner_banking` | not explicitly declared |  / neon | `master.bank_account` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_commodity_classification — `mdg/bp/business_partner_commodity_classification` | not explicitly declared |  / neon | `master.business_partner_commodity_classification` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_governance_relation — `mdg/bp/business_partner_governance_relation` | not explicitly declared |  / neon | `master.business_partner_governance_relation` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_identifier — `mdg/bp/business_partner_identifier` | not explicitly declared |  / neon | `master.business_partner_identifier` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_industry_classification — `mdg/bp/business_partner_industry_classification` | not explicitly declared |  / neon | `master.business_partner_industry_classification` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_operating_organization_assignment — `mdg/bp/business_partner_operating_organization_assignment` | not explicitly declared |  / neon | `master.business_partner_operating_organization_assignment` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_qualification — `mdg/bp/business_partner_qualification` | not explicitly declared |  / neon | `control.business_partner_qualification` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_relationship — `mdg/bp/business_partner_relationship` | not explicitly declared |  / neon | `master.business_partner_relationship` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_request — `mdg/bp/business_partner_request` | not explicitly declared |  / neon | `document.entity_case` | declared placement; preserve exact module/planes |
| business_partner_restriction — `mdg/bp/business_partner_restriction` | not explicitly declared |  / neon | `control.business_partner_block` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_tax_registration — `mdg/bp/business_partner_tax_registration` | not explicitly declared |  / neon | `master.business_partner_tax_registration` | referenced supporting entity; standalone navigation intent unresolved |
| contact_channel — `mdg/bp/contact_channel` | not explicitly declared |  / neon | `master.contact_link` | referenced supporting entity; standalone navigation intent unresolved |
| contact_person — `mdg/bp/contact_person` | not explicitly declared |  / neon | `master.contact_person` | referenced supporting entity; standalone navigation intent unresolved |
| contact_person_role — `mdg/bp/contact_person_role` | not explicitly declared |  / neon | `master.contact_person_role` | referenced supporting entity; standalone navigation intent unresolved |
| customer — `mdg/bp/customer` | not explicitly declared |  / neon | `master.customer` | referenced supporting entity; standalone navigation intent unresolved |
| customer_company_profile — `mdg/bp/customer_company_profile` | not explicitly declared |  / neon | `master.company_code_customer_profile` | referenced supporting entity; standalone navigation intent unresolved |
| supplier — `mdg/bp/supplier` | not explicitly declared |  / neon | `master.supplier` | referenced supporting entity; standalone navigation intent unresolved |
| supplier_company_profile — `mdg/bp/supplier_company_profile` | not explicitly declared |  / neon | `master.company_code_supplier_profile` | referenced supporting entity; standalone navigation intent unresolved |
| address — `mdg/location/address` | system | neon / neon | `master.address` | declared placement; preserve exact module/planes |
| address_link — `mdg/location/address_link` | not explicitly declared |  / neon | `master.address_link` | referenced supporting entity; standalone navigation intent unresolved |
| person_address_use — `mdg/location/person_address_use` | system | neon /  | `master.person_address_use` | declared placement; preserve exact module/planes |
| bank_branch — `mdg/reference/bank_branch` | not explicitly declared |  / neon | `shared.bank_branch` | referenced supporting entity; standalone navigation intent unresolved |
| bank_identifier — `mdg/reference/bank_identifier` | not explicitly declared |  / neon | `shared.bank_identifier` | referenced supporting entity; standalone navigation intent unresolved |
| bank_institution — `mdg/reference/bank_institution` | not explicitly declared |  / neon | `shared.bank_institution` | referenced supporting entity; standalone navigation intent unresolved |
| certification — `mdg/reference/certification` | not explicitly declared |  / neon | `master.certification` | referenced supporting entity; standalone navigation intent unresolved |
| classification_scheme — `mdg/reference/classification_scheme` | not explicitly declared |  / neon | `shared.classification_scheme` | referenced supporting entity; standalone navigation intent unresolved |
| commodity_code — `mdg/reference/commodity_code` | not explicitly declared |  / neon | `shared.commodity_code` | referenced supporting entity; standalone navigation intent unresolved |
| commodity_crosswalk — `mdg/reference/commodity_crosswalk` | not explicitly declared |  / neon | `shared.commodity_crosswalk` | referenced supporting entity; standalone navigation intent unresolved |
| industry_code — `mdg/reference/industry_code` | not explicitly declared |  / neon | `shared.industry_code` | referenced supporting entity; standalone navigation intent unresolved |
| industry_crosswalk — `mdg/reference/industry_crosswalk` | not explicitly declared |  / neon | `shared.industry_crosswalk` | referenced supporting entity; standalone navigation intent unresolved |
| uom — `mdg/reference/uom` | not explicitly declared |  / neon | `shared.uom` | referenced supporting entity; standalone navigation intent unresolved |
| principal — `platform/iam/principal` | system | studio,neon,mesh /  | `master.principal` | declared placement; preserve exact module/planes |
| principal_notification_preference — `platform/iam/principal_notification_preference` | system | studio,neon,mesh /  | `master.principal_notification_preference` | relationship-backed embedded exposure; exclusive embedded-only intent not established |
| principal_profile — `platform/iam/principal_profile` | system | studio,neon,mesh /  | `master.principal_profile` | relationship-backed embedded exposure; exclusive embedded-only intent not established |
| principal_ui_profile — `platform/iam/principal_ui_profile` | system | studio,neon,mesh /  | `master.principal_ui_profile` | relationship-backed embedded exposure; exclusive embedded-only intent not established |
| employee — `ppl/workforce/employee` | system | neon /  | `master.employee` | declared placement; preserve exact module/planes |
| external_worker — `ppl/workforce/external_worker` | system | neon /  | `master.external_worker` | declared placement; preserve exact module/planes |
| person — `ppl/workforce/person` | system | neon /  | `master.person` | declared placement; preserve exact module/planes |
| workforce — `ppl/workforce/workforce` | not explicitly declared |  / neon | `master.employee` | referenced supporting entity; standalone navigation intent unresolved |

A missing placement is not repaired by copying Principal. Relationship-backed entities still need an explicit decision about standalone exposure. Remaining unresolved rows require owning-domain intent before adding or removing navigation. No entity is designated exclusively embedded-only from absence alone.
