# Three-plane master catalogue recommendation

Date: 2026-07-30

## Decision summary

Neon is the richest source catalogue, but its `master` schema must not be
copied wholesale into Athyper or Mesh.

The recommended model is:

1. Reuse canonical **table blueprints**, lifecycle rules, and audit conventions.
2. Create plane-local tables in each database; do not make one database the
   runtime owner for another plane.
3. Keep only mutable identity, party, organisation, and local reference masters
   in `master`.
4. Route authorization, documents, events, audit, and operations to their
   dedicated schemas.
5. Preserve plane-specific ownership:
   - Neon uses tenant and legal-entity ownership.
   - Mesh uses network-account and relationship ownership.
   - Athyper uses platform tenant/workspace ownership.
6. Exchange cross-plane projections by UUID plus explicit source references or
   events. Do not introduce cross-database foreign keys.

`shared` remains limited to universal read-only code lists and reusable
functions/domains. Mutable principals, addresses, contacts, subscriptions,
workspaces, and modules do not belong in `shared`.

## Inventory findings

- Repository Neon `master` DDL contains 195 physical tables/partitions.
- Repository Mesh DDL contains 66 physical tables/partitions.
- The supplied live Mesh inventory contains additional authorization tables
  that are not represented by the base Mesh table files.
- Only 31 repository table names overlap exactly.
- Those 31 names are not identical contracts:
  - Neon generally scopes rows with `tenant_id`.
  - Mesh generally scopes participant data with `account_code`.
  - Neon audit actors are UUIDs; several Mesh tables use text actors.
  - Link ownership and principal fields differ.
  - `external_reference` has entirely different meanings in the two planes.

The common result must therefore be designed and reviewed, not obtained by
copying the Neon SQL.

### Exact Neon/Mesh name overlap

The 31 overlapping names are:

- Identity: `principal`, `principal_identity_binding`,
  `principal_notification_preference`
- Party/contact: `address`, `address_link`, `contact_link`, `contact_email`,
  `contact_phone`
- Finance/compliance: `bank_party`, `bank_account`, `bank_account_link`,
  `certification_type`, `certification`
- Document/collaboration: `attachment`, `attachment_folder`,
  `attachment_comment`, `comment`, `comment_draft`, `comment_feed_cursor`,
  `comment_mention`, `comment_reaction`, `content_item`, `content_item_link`,
  `conversation`, `conversation_participant`, `multipart_upload`
- Utility: `external_reference`, `holiday_calendar`, `holiday_calendar_day`,
  `network_provider`, `saved_view`

They require these dispositions:

| Overlap family | Recommendation |
|---|---|
| Principal | Converge names and identity fields; retain plane-specific membership |
| Address/contact | Reuse value model; implement plane-specific owner FKs |
| Bank/certification | Use a reviewed Neon-derived optional pack for Neon and Mesh |
| Collaboration | Converge the content model and relocate it to `document` |
| Holiday | Optional calendar pack, not minimum three-plane foundation |
| External reference | Redesign as separate source projection and business-reference concepts |
| Network provider | Mesh owns network-provider semantics; Neon stores only its required projection |
| Saved view | Reuse through the experience pack with local scope ownership |

Collaboration operational data belongs in `document`, but its configurable
vocabulary uses the plane-local control lookup catalog:

- `document.comment_type` is a platform-locked lookup domain.
- `document.comment_intent` and `document.reaction_type` are tenant-extensible
  lookup domains.
- Values are stored in `control.lookup_value`; the `document.*` prefix records
  semantic ownership.
- Do not create dedicated `document.comment_type`, `document.comment_intent`,
  or `document.reaction_type` tables and do not model these values as
  PostgreSQL enums or master data.

## Target schema routing

| Capability | Target schema | Reason |
|---|---|---|
| Principal, party, address, contact, organisation | `master` | Mutable plane-owned master data |
| Workspace and module | `master` | Plane-local product structure |
| Subscription plan and commercial configuration | `control` | Plane-level control catalogue |
| Roles, grants, scopes, ACLs, delegation, entitlement | `authz` | Security authority, not business master data |
| Attachment, content, comments, conversation, templates | `document` | Content/document lifecycle |
| Notifications, outbox and domain/network events | `event` | Delivery and event processing |
| Security and business audit evidence | `audit` | Append-only evidence |
| Idempotency and synchronization checkpoints | `runtime_meta` | Runtime coordination |
| Operational jobs and repair state | `ops` | Operational control |
| Historical versions | `snapshot` | Immutable historical state |
| Ledger and accounting postings | `ledger` (Neon) | ERP accounting authority |
| Aggregations and reporting projections | `aggregate` (Neon) | Derived data |
| Policy/governance evidence | `governance` (Neon) | Governance lifecycle |

## Tier 1: canonical foundation for all three planes

These concepts should have a reviewed canonical blueprint and exist locally
where the plane uses them.

### Master identity and party core

- `workspace`
- `module`
- `principal`
- `principal_identity_binding`
- `principal_profile`
- `principal_relationship`
- `principal_notification_preference`
- `address`
- `address_link`
- `contact_link`
- `contact_email`
- `contact_phone`
- `contact_marketing_consent`
- `external_reference`

`principal_ui_profile` and `principal_ui_preference` are reusable but belong to
the optional experience pack rather than the minimum identity foundation.

`owner_type` is a supporting Neon polymorphic-link catalogue. Reuse the concept
only in planes that intentionally adopt polymorphic owners; it is not required
for Mesh's account-FK model.

### Document/collaboration core

These are reusable across the three products but should move to `document`,
not remain in `master`:

- `attachment`
- `attachment_folder`
- `attachment_comment`
- `multipart_upload`
- `comment`
- `comment_draft`
- `comment_feed_cursor`
- `comment_mention`
- `comment_reaction`
- `content_item`
- `content_item_link`
- `conversation`
- `conversation_participant`
- `entity_document_link`

The generic `document` table needs a separate review. Neon uses it as a business
master while Mesh uses envelope/payload/event objects. Those are different
concepts and should not share one ambiguous table.

### Experience and configuration pack

These are reusable where the product UI needs them:

- `dashboard`
- `dashboard_widget`
- `filter_preset`
- `saved_view`
- `record_bookmark`
- `label`
- `label_entity_type`
- `scoped_setting`
- `template`
- `template_binding`
- `notification`

`notification` should be routed to `event`; templates may remain in `document`
unless they are strictly control-plane configuration.
`principal_notification_preference` remains in `master` for the current wave.

## Canonical principal decision

Neon's `principal` is the better starting blueprint. Mesh's current principal is
too small and uses different names.

Canonical columns should be:

- `id`
- `code`
- `name`
- `principal_type`
- `is_locked`
- `is_service_account`
- `auth_epoch`
- `login_email`
- `external_ref`
- `principal_source`
- `metadata`
- lifecycle columns
- UUID audit columns

Recommended convergence:

- Rename Mesh `principal_code` to `code`.
- Rename Mesh `display_name` to `name`.
- Use UUID audit actors in all three planes.
- Add the lock, service-account, source, external-reference, and auth-epoch
  fields to Athyper and Mesh.
- Keep `principal_identity_binding` as the IAM/IdP shadow contract.
- Use the same principal UUID in each plane projection when it represents the
  same IAM actor.
- Do not put `account_code` on Mesh principal. Relate principals to network
  accounts through the authorization/membership model.
- Do not force Neon's `tenant_id` into Mesh. Plane membership owns scope.

The system principal must be seeded before tables that require non-null UUID
audit actors.

## Address and contact decision

Reuse Neon's address value model:

- postal lines and attention line
- city, region, postal code, country
- coordinates and formatted cache
- metadata, lifecycle, and UUID audit columns

Do not reuse Neon's ownership columns blindly:

- Neon: tenant-scoped, polymorphic owner links are appropriate.
- Mesh: network-account ownership must be enforced with real account FKs.
- Athyper: ownership should be tenant/workspace based after that boundary is
  locked.

The canonical rule is “address owns address values; address_link owns purpose
and owner association.” The same rule applies to contacts.

Mesh's current `contact_link` combines the channel value with the link. Neon
separates the generic link from `contact_email` and `contact_phone`. Adopt the
separated Neon model in new desired-state DDL because it validates and extends
channels more cleanly.

## Cross-plane capability packs

### Party finance and compliance: Neon + Mesh

Useful for ERP and network commerce, but not required in Athyper foundation:

- `bank_party`
- `bank_account`
- `bank_account_house_config`
- `bank_account_link`
- `certification_type`
- `certification`
- `holiday_calendar`
- `holiday_calendar_day`
- `network_provider`

Certification placement is plane-owned, not a standalone schema:

- Neon stores the canonical tenant master contract in `master.certification_type`
  and `master.certification`, including optional company-code and site scope.
- Mesh reuses the tenant/owner/type core in `mesh.certification_type` and
  `mesh.certification`; `owner_type = 'network_account'` is the participant
  certification convention.
- Athyper has no physical certification tables. Admin experiences may operate
  Neon or Mesh records through plane-routed APIs without becoming data owners.
- The platform certification-type catalog is authored once from the Neon
  canonical catalog and synchronized into the Mesh optional pack.

Mesh-specific disclosure/verification remains in Mesh:

- `bank_account_disclosure`
- `supplier_profile_verification`
- `supplier_service_coverage`
- `supplier_commodity_capability`

### Organisation and people: Neon, optionally Athyper

- `tenant`
- `tenant_profile`
- `tenant_identity_domain`
- `tenant_identity_provider`
- `tenant_parameter_definition`
- `tenant_parameter_value`
- `tenant_relationship`
- `person`
- `person_sensitive_profile`
- `team`
- `team_member`
- `trusted_device`
- `brand_profile`

Mesh should continue to use `network_account` for participant organisations.
Do not rename or reinterpret a network account as a Neon tenant.

### Business-party pack: Neon + Mesh projection

Neon remains authoritative for:

- `business_partner`
- `business_partner_relation`
- `party_contact_person`
- `party_contact_role`
- `party_identifier`
- `party_tax_profile`
- `legal_entity_business_partner_link`
- `business_partner_network_link`
- `business_partner_network_capability`

Mesh should receive only the participant/network projection needed for Buy,
Source, and Sell. It should not replicate the complete ERP business-partner
record.

## Neon-specific master domains

Keep these in Neon unless a separate product requirement proves otherwise.

### Finance, accounting and planning

- `accounting_profile`
- `chart_of_account`
- `company_code`
- `company_code_book_assignment`
- `company_code_chart_assignment`
- `company_code_dimension_default`
- `company_code_gl_account`
- `dimension_set`
- `dimension_set_item`
- `dimension_type`
- `dimension_value`
- `fiscal_period`
- `fx_rate`
- `gl_account`
- `intercompany_trading_pair`
- `ledger_book`
- `planning_model`
- `profit_center`
- `cost_center`
- `budget_profile`
- `budget_allocation`

### Legal entity and operating structure

- `legal_entity`
- `legal_entity_identity_binding`
- `legal_entity_network_account`
- `operating_organization`
- `operating_organization_company`
- `org_unit`
- `site`
- `warehouse`
- `organization_tax_registration`
- `company_code_customer_profile`
- `company_code_supplier_profile`
- `procurement_organization_profile`
- `sales_organization_profile`

### Procurement, sales, product and partner master

- `business_partner`
- `business_partner_relation`
- `commodity_category`
- `commodity_classification`
- `condition_type`
- `customer`
- `customer_app_index`
- `customer_block`
- `customer_qualification`
- `item`
- `product`
- `supplier`
- `supplier_app_index`
- `supplier_block`
- `supplier_commodity_category`
- `supplier_qualification`
- `payment_method`
- `payment_term`
- `payment_term_clause`
- `payment_term_discount_tier`

### Asset management

- `asset`
- `asset_assignment_history`
- `asset_book`
- `asset_class`
- `asset_component`

### Projects

- `project`
- `project_item`

### Human resources and payroll

- `career_band`
- `career_level`
- `designation`
- `employee`
- `employee_leave_enrollment`
- `employee_statutory_enrollment`
- `employment`
- `job`
- `job_family`
- `job_function`
- `leave_plan`
- `leave_plan_rule`
- `leave_type`
- `pay_component`
- `pay_grade`
- `pay_group`
- `pay_structure`
- `pay_structure_line`
- `position`
- `shift_type`
- `statutory_scheme`
- `work_assignment`
- `work_pattern`
- `work_pattern_day`

### Tax and risk/governance

- `change_reason_code`
- `tax_jurisdiction`
- `tax_type`
- `party_governance_relation`
- `party_risk_assessment`
- `party_risk_dimension_score`
- `party_risk_driver`
- `party_risk_evidence`
- `party_risk_mitigation`
- `party_risk_review_event`
- `risk_dimension`
- `risk_driver_registry`
- `risk_model`
- `risk_model_dimension`
- `risk_source`
- `tenant_risk_source_config`

## Athyper-specific domains

Athyper should own Studio and Telemetry concepts rather than inheriting ERP
masters. From the current Neon list, the Atlas objects are candidates for an
Athyper document/knowledge capability:

- `atlas_knowledge_source`
- `atlas_knowledge_revision`
- `atlas_knowledge_chunk`
- `atlas_thread`
- `atlas_message`
- `atlas_support_session`

Recommended routing:

- knowledge and conversation content -> `document`
- BYOK and support-session security evidence -> namespaced events in the
  partitioned `audit.audit_log`; do not create parallel
  `atlas_byok_audit` or `atlas_support_session_audit` tables
- telemetry series, signals, traces, and measurements -> a later reviewed
  Athyper domain, not generic `master`

`business_intent`, `lifecycle_instance`, `brand_profile`, `letterhead`, and
`print_profile` should be adopted only when Studio requirements call for them.

## Mesh-specific domains

Keep the following Mesh-owned. They model network participation and commerce,
not universal master data.

### Network identity and relationship

- `network_account`
- `network_account_identifier`
- `network_account_reference`
- `network_relationship`
- `network_invitation`
- `connection_request`
- `connection_acceptance`
- `network_document_type`

### Commerce, sourcing and catalog

- `catalog`
- `catalog_item`
- `catalog_item_classification`
- `catalog_item_uom`
- `catalog_price`
- `catalog_availability`
- `supplier_commodity_capability`
- `supplier_profile_verification`
- `supplier_service_coverage`
- `bank_account_disclosure`

### Logistics

- `carrier`
- `logistics_zone`
- `logistics_zone_member`
- `logistics_rate`
- `logistics_rate_break`

### Document exchange and integration

- `document_envelope`
- `document_payload`
- `document_event`
- `document_acknowledgement`
- `network_event`
- `outbox_event`
- `idempotency_key`
- `sync_checkpoint`

Route event/outbox objects to `event`, idempotency/checkpoint objects to
`runtime_meta`, and document exchange objects to `document`.

Mesh `activity_log` and `audit_event` belong in `audit`; they are not master
data and should remain append-oriented evidence.

## Authorization finding

Do not use either live inventory as the source of truth for the new
authorization DDL.

The inventories contain multiple generations:

- Neon legacy names such as `auth_group`, `auth_group_member`, and
  `auth_group_role`.
- Mesh versioned names such as `auth_group_v2`, permission sets, compiled roles,
  account grants, and account entitlements.
- Repository contraction scripts explicitly retire several legacy Neon and Mesh
  authority/ACL relations.

All `auth_*`, grants, scopes, ACLs, delegation, permission sets, role
compilations, membership, deny rules, overrides, and entitlement tables must be
reviewed as one authorization authority slice and moved to `authz`.

The current Neon names in scope include:

- `auth_delegation`
- `auth_delegation_grant`
- `auth_deny_rule`
- `auth_group`
- `auth_group_member`
- `auth_group_role`
- `auth_override`
- `auth_plane_membership`
- `auth_record_acl`
- `auth_role`
- `auth_role_permission`
- `auth_scope_target`

The supplied live Mesh authority inventory additionally includes:

- `account_entitlement`
- `account_entitlement_override`
- `account_grant`
- `auth_delegation_permission`
- `auth_delegation_permission_scope`
- `auth_deny_rule_group`
- `auth_deny_rule_hard_policy`
- `auth_deny_rule_principal`
- `auth_group_v2`
- `auth_group_member_v2`
- `auth_group_role_v2`
- `auth_permission_set`
- `auth_permission_set_rule`
- `auth_record_acl_permission`
- `auth_role_compilation`
- `auth_role_permission_set`
- `auth_scope_account`
- `auth_scope_network_relationship`
- `auth_scope_resource`
- `attachment_acl`
- `content_item_access_grant`

`notification_default` and `network_event_default` are physical default
partitions, not independent business concepts; define them with their
partitioned parent tables.

The authorization slice must be sourced from the canonical authorization
semantic contract and current compiled authority artifacts, not from a live
table-name dump.

## Recommended implementation waves

1. **Master identity**
   - principal
   - principal identity binding
   - principal profile/relationship
2. **Address and contact**
   - address
   - address link
   - contact link/email/phone
3. **Document collaboration**
   - attachment/content/comment/conversation families in `document`
4. **Experience**
   - saved views, filters, dashboards, labels, templates, settings
5. **Party finance/compliance**
   - Neon + Mesh bank, certification, provider, calendar pack
6. **Plane domains**
   - Neon ERP
   - Mesh network/commerce/logistics
   - Athyper Studio/Telemetry
7. **Authorization**
   - separately reviewed canonical `authz` slice

For every wave, complete the full desired-state sequence before execution:

`03_tables -> 04_pre_constraints -> 05_constraints -> 06_indexes ->
07_functions -> 08_triggers -> 09_views -> 10_rls -> 11_grants ->
12_reference_seed`.

## Immediate recommendation

Start with `principal`, `principal_identity_binding`, `principal_profile`,
`address`, `address_link`, `contact_link`, `contact_email`, and
`contact_phone`.

Review and lock one canonical field contract, then create three plane-local
variants with only their ownership/scope relationships differing. Do not move
authorization or the full Neon ERP catalogue in the same review wave.

## Parked decisions

- Keep `master.principal_notification_preference` in `master`.
- Do not introduce a new `principal_work_context` table in the current wave.
- Remove principal-level ERP, employee, navigation, company, book, and
  dashboard defaults from the new desired-state principal contracts. Resolve
  employee/manager relationships from `master.employee`; require business
  context explicitly from requests and workflows.
