# Neon live-master inventory cross-check

Scope: supplied Neon live table inventory compared with the desired-state manifests under `server/db/ddl/planes`. This is a DDL placement report, not a data-migration report.

## Live catalog refresh — 2026-08-01

This report was rechecked read-only against the live `athyper_neon` database
(PostgreSQL 16.13) and the current
`server/db/ddl/planes/neon/_manifest.txt`.

The live catalog contains 566 ordinary/partitioned tables. Seven are provisioning
or rehearsal infrastructure in `public` and `wave9_guard`; excluding those leaves
559 application-domain tables. The current Neon manifest declares 404 tables:

- 288 live application tables have an exact qualified-name match in the manifest.
- 271 live application tables do not have an exact-name match.
- 115 manifest tables are not present under the same name in the legacy live
  database, mostly because the new layer adds, renames, splits, or relocates
  contracts.
- 118 of the 271 unmatched live tables contain rows; 153 are empty. Partitioned
  parents and their default partitions are counted as separate physical tables,
  so row totals must not be added across a parent and its partition.

The 271 exact-name misses are **not** 271 tables to copy. The authorization
tables moving from `master.auth_*` to `authz.*`, collaboration tables moving from
`master` to `document`, governance definition tables moving from `governance` to
`control`, and the clean accounting-policy replacement are intentional examples.
The following are the remaining high-confidence work items after accounting for
those semantic moves.

### P0 — add these contracts to the new Neon DDL

1. **Metadata/entity catalog.** The new manifest has no target for the canonical
   `control.entity` aggregate even though the runtime and metadata documentation
   continue to use it. Move the complete contract, not just its table layer:
   `entity`, `entity_version`, `entity_version_contract`, `entity_field`,
   `entity_surface`, `entity_field_surface`, `entity_relation`,
   `entity_operation`, `entity_policy`, `entity_publish_state`,
   `entity_class_profile`, `entity_action_rule`, `entity_scope_binding`,
   `entity_flow`, `entity_flow_step`, `entity_flow_section`, `entity_flow_field`,
   `entity_lifecycle`, `entity_lifecycle_state_mask`, `field_group`,
   `field_group_member`, `entity_numbering_config`, and
   `entity_numbering_counter`. Live evidence includes 612 entities, 612 entity
   versions, 12,956 fields, 53,154 field-surface rows, 3,525 surfaces, 917
   operations, 1,128 policies, and 284 relations. These are approved
   seed/catalog authorities, not disposable legacy data.

2. **Workflow and lifecycle authoring/runtime.** Add the still-live
   `control.lifecycle*`, `control.workflow_definition`,
   `control.workflow_template`, `control.workflow_template_stage`,
   `control.workflow_template_rule`, and `control.workflow_sla_policy` contracts,
   plus the required runtime relations such as `event.lifecycle_timer_schedule`,
   `event.orchestration_run`, and `event.orchestration_node`. Current server code
   reads and writes these exact contracts. The live database contains 34
   lifecycles, 188 states, 256 transitions, 436 transition hooks, 15 workflow
   templates, and their stage/rule/SLA configuration.

3. **Authorization invalidation runtime.** The new manifest contains the
   canonical `authz` catalog but omits `event.authorization_global_epoch_v2`,
   `event.authorization_plane_epoch_v2`, `event.authorization_tenant_epoch_v2`,
   and `event.authorization_invalidation_outbox_v2`. These are active runtime
   state, not superseded catalog tables. The outbox currently contains 12,331
   rows and is referenced by the authorization rollout/runtime code. Keep the
   outbox in `event` and place epoch/cache state in `runtime_meta` or `event`
   according to the locked authorization ownership decision.

4. **Notification runtime and configuration.** The common event pack adds
   message/delivery/inbox contracts but omits live dependencies still used by
   notification routes and workers: `control.notification_provider`,
   `control.notification_template`, `control.notification_routing_rule`,
   `event.notification_delivery_claim`, `event.digest_staging`, and
   `event.push_subscription`. Move these as one reviewed capability slice with
   constraints, indexes, workers' claim semantics, RLS, grants, and seed data.

The three-plane ownership decision and migration design for items 3 and 4 is
documented in
[`authorization-notification-three-plane-ddl-plan.md`](authorization-notification-three-plane-ddl-plan.md).

### P0 — migrate and cut over; do not duplicate the legacy table

- `log.audit_log` contains 31,869 logical rows and has a declared successor in
  `audit.audit_log`, but active services still read and write `log.audit_log`.
  Migrate retained evidence and switch runtime consumers before contracting the
  legacy `log` schema.
- `log.entity_lifecycle_log` contains 11,416 rows and remains the source for
  lifecycle, version, and activity APIs. Give it an explicit target in
  `audit`/`snapshot` and complete the runtime cutover. The current common audit
  pack alone does not establish that mapping.
- `master.change_reason_code` contains all six legacy seed rows. Follow the
  compatibility migration to `master.audit_reason_code`; do not create another
  legacy copy in the new manifests.

### P1 — explicit retain-or-retire decisions

- The Neon manifest creates the `aggregate` schema but no aggregate tables.
  Decide whether `aggregate.tax_credit_summary` and
  `aggregate.wht_supplier_accumulator` remain supported rebuildable projections.
  If yes, move their full DDL into the Neon aggregate overlay; if no, remove the
  unused schema provision and record their retirement.
- Review unmatched operational tables that still have direct runtime consumers,
  especially document import/render/idempotency relations and the remaining
  event/log worker tables. They must receive a named successor or an explicit
  retirement decision before legacy contraction.

### Exclusions

Do not move `public.database_reset_guard_v2`, `public.seed_pack_ledger_v2`,
`public.seed_pack_execution_v2`, or the three `wave9_guard` rehearsal tables into
the layered domain DDL. They are provisioning/sentinel infrastructure managed by
the safe-provision and rehearsal scripts. `public.schema_provisions` is already
declared by the common database layer.

Status vocabulary:

- **Implemented** - canonical table is present in the new manifest.
- **Renamed/split** - the legacy responsibility remains, under the listed new table(s).
- **Retired by decision** - intentionally not recreated.
- **Parked / pending** - no table is present in the new manifests yet; do not migrate it until its target model is approved.

`Admin` below means the `athyper` plane. `All three` means Admin, Neon, and Mesh have the same tenant-local foundation table.

## Implemented in all three planes

| Live Neon table(s) | New DDL target | Status / plane ownership |
| --- | --- | --- |
| `address`, `address_link`, `contact_email`, `contact_link`, `contact_phone` | same names in `master` | **Implemented** - All three. `control.owner_type` governs permitted polymorphic owners. |
| `attachment`, `attachment_folder`, `attachment_comment` | `document.attachment`, `document.attachment_folder`, `document.comment` | **Renamed/split** - All three. Attachment comments use the common comment model. |
| `comment`, `comment_draft`, `comment_feed_cursor`, `comment_mention`, `comment_reaction` | same names in `document` | **Implemented** - All three. |
| `content_item`, `content_item_link` | same names in `document` | **Implemented** - All three; versions are in `snapshot.content_item_version`. |
| `entity_document_link` | `document.attachment_link` | **Renamed** - All three; canonical entity-to-attachment relation. |
| `multipart_upload` | `document.multipart_upload` | **Implemented** - All three. |
| `brand_profile`, `letterhead`, `template`, `template_binding`, `print_profile` | same names in `master`; `snapshot.template_version` | **Implemented/split** - All three. Immutable render versions are snapshots. |
| `saved_view` | `master.saved_view` | **Implemented** - All three, with view state only. |
| `record_bookmark` | `master.record_bookmark` | **Implemented** - All three. |
| `external_reference` | `master.external_reference` | **Implemented** - All three. |
| `team`, `team_member` | same names in `master` | **Implemented** - All three. |
| `tenant`, `tenant_profile`, `tenant_relationship` | same names in `master` | **Implemented** - All three. |
| `principal`, `principal_profile`, `principal_identity_binding`, `principal_ui_profile`, `principal_ui_preference`, `principal_notification_preference` | same names in `master` | **Implemented** - All three. Identity binding is the plane-local Keycloak subject binding. |
| `owner_type` | `control.owner_type`, `control.owner_type_purpose` | **Moved** - All three. It is configurable control data, not master data. |
| `trusted_device` | `authz.trusted_device` | **Moved** - All three. Retained as an application self-service device record; it does not replace Keycloak authentication. |

## Authorization: unified canonical model in all three planes

| Live Neon table | New DDL target | Status |
| --- | --- | --- |
| `auth_delegation` | `authz.delegation` | **Renamed** |
| `auth_delegation_grant` | `authz.delegation_grant` | **Renamed** |
| `auth_deny_rule` | `authz.deny_rule` | **Renamed** |
| `auth_group` | `authz.principal_group` | **Renamed** |
| `auth_group_member` | `authz.group_member` | **Renamed** |
| `auth_group_role` | `authz.group_role` | **Renamed** |
| `auth_override` | `authz.override` | **Renamed** |
| `auth_plane_membership` | `authz.plane_membership` | **Renamed** |
| `auth_record_acl` | `authz.record_acl` | **Renamed** |
| `auth_role` | `authz.role` | **Renamed** |
| `auth_role_permission` | `authz.role_permission` | **Renamed** |
| `auth_scope_target` | `authz.scope_target` | **Renamed** |
| n/a | `authz.permission`, `authz.permission_scope_policy` | **Added** canonical permission and scope-policy model |

## Neon-only: implemented business, finance, organization, asset, HR, risk, and product model

| Live Neon table(s) | New DDL target | Status |
| --- | --- | --- |
| `accounting_profile`, `chart_of_account`, `gl_account`, `ledger_book`, `fiscal_period`, `fx_rate` | same names in `master` | **Implemented** — Neon only. |
| `company_code`, `company_code_chart_assignment`, `company_code_book_assignment`, `company_code_dimension_default`, `company_code_gl_account` | same names in `master` | **Implemented** — Neon only. |
| `legal_entity`, `organization_tax_registration` | same names in `master` | **Implemented** — Neon statutory hierarchy. |
| `operating_organization`, `procurement_organization_profile`, `sales_organization_profile` | same names in `master` | **Implemented** — Neon operational hierarchy. |
| `operating_organization_company` | `master.operating_organization_company_assignment` | **Renamed** — explicit assignment to `company_code`. |
| `org_unit` | `master.org_unit` plus `control.org_unit_type` | **Implemented/split** — flexible tenant-defined workforce hierarchy. |
| `cost_center`, `profit_center`, `dimension_type`, `dimension_value`, `dimension_set`, `dimension_set_item` | same names in `master` | **Implemented** — Neon management dimensions. |
| `bank_party`, `bank_account`, `bank_account_link`, `bank_account_house_config` | same names in `master` | **Implemented** — Neon only. |
| `payment_term`, `payment_term_clause`, `payment_term_discount_tier` | same names in `master` | **Implemented** — Neon only. |
| `condition_type`, `tax_jurisdiction`, `tax_type` | same names in `master` | **Implemented** — Neon only. |
| `business_partner`, `supplier`, `customer` | same names in `master` | **Implemented** — Neon party core. |
| `asset`, `asset_assignment_history`, `asset_book`, `asset_class`, `asset_component` | same names in `master` | **Implemented** — Neon only. |
| `commodity_category`, `commodity_classification`, `product`, `item` | same names in `master` | **Implemented** — Neon product/item master. |
| — | `master.catalog`, `master.catalog_item`, `master.catalog_price` | **Added** Neon procurement/catalog normalization. |
| — | `master.bom`, `master.bom_component`, `snapshot.bom`, `snapshot.bom_component` | **Added** manufactured-product/BOM foundation. |
| `project`, `project_item` | `master.project`, `master.project_item`, `master.project_wbs` | **Implemented/expanded** — WBS is now the scope and financial hierarchy. |
| `budget_profile`, `budget_allocation` | `document.budget_profile`, `document.budget_allocation` | **Moved** from master to governed documents. |
| `planning_model` | `control.planning_model`, `control.planning_driver`, `control.planning_driver_dependency` | **Moved/expanded** — model configuration is control data. |
| — | `ledger.budget_transaction`, `ledger.budget_balance`, `ledger.planning_run`, `ledger.planning_output` | **Added** financial evidence, projection, and planning output. |
| `person`, `person_sensitive_profile`, `site`, `career_band`, `career_level`, `designation`, `job`, `job_family`, `job_function`, `pay_component`, `pay_grade`, `pay_group`, `pay_structure`, `pay_structure_line`, `position` | same names in `master` | **Implemented** — Neon HR foundation. |
| `holiday_calendar`, `holiday_calendar_day`, `shift_type`, `work_pattern`, `work_pattern_day`, `leave_type`, `leave_plan`, `leave_plan_rule`, `statutory_scheme` | same names in `master` | **Implemented** — Neon HR foundation. |
| `employee`, `employment`, `work_assignment`, `employee_leave_enrollment`, `employee_statutory_enrollment` | same names in `master` | **Implemented** — Neon HR foundation. |
| `risk_dimension`, `risk_driver_registry`, `risk_model`, `risk_model_dimension`, `risk_source`, `party_risk_assessment`, `party_risk_dimension_score`, `party_risk_driver`, `party_risk_evidence`, `party_risk_mitigation`, `party_risk_review_event` | same names in `master` | **Implemented** — Neon risk foundation. |

## Mesh ownership and cross-plane disposition

| Live Neon table / responsibility | New DDL target | Status |
| --- | --- | --- |
| `business_partner_network_capability`, `business_partner_network_link` | `mesh.network_account`, `mesh.network_relationship` | **Re-modelled for Mesh** — network identity is account-based, not a Neon business-partner extension. A Neon-to-Mesh link table is still pending. |
| `legal_entity_network_account` | intended Neon-to-Mesh account reference | **Parked / pending** — no target table is in the current Neon manifest. |
| Mesh catalog responsibility | `mesh.catalog`, `mesh.catalog_item`, `mesh.catalog_item_identifier`, `mesh.catalog_item_classification`, `mesh.catalog_item_uom`, `mesh.catalog_audience`, `mesh.catalog_price`, `mesh.catalog_availability` | **Implemented** — Mesh owns supplier publication and audience/rate availability. Neon owns its accepted/local catalog. |
| `network_provider` | none | **Retired by decision** — add only when a concrete provider integration requires it. |

## Explicitly retired or parked legacy tables

| Live Neon table(s) | New status / reason |
| --- | --- |
| `filter_preset` | **Retired** — absorbed into `master.saved_view`; no separate `view_kind` was added. |
| `tenant_identity_domain`, `tenant_identity_provider` | **Retired** — Keycloak organization/realm is the identity authority. |
| `tenant_parameter_definition`, `tenant_parameter_value` | **Retired** — no generic tenant parameter store in the new foundation. |
| `tenant_risk_source_config` | **Replaced by Neon `control.risk_source_config`**; connector-owned transport configuration, no Admin/Mesh copy. |
| `dashboard`, `dashboard_widget` | **Parked** — no new table. |
| `label`, `label_entity_type` | **Parked** with tags. |
| `contact_marketing_consent` | **Parked** — consent model intentionally deferred. |
| `principal_relationship` | **Parked in every plane** — duplicate resolution, same-human evidence, merge, and transfer require separately approved capability models. |
| `notification` | **Parked** — notification delivery/default model not yet approved. |
| `scoped_setting` | **Parked** — do not recreate as an ungoverned generic setting table. |
| `lifecycle_instance` | **Pending relocation** to `runtime_meta.lifecycle_instance`; no table exists in the current manifest yet. |
| `document` | **Parked** — the current foundation uses attachment/content/template records; a general document business object is not yet defined. |

## Still absent: requires a later approved wave

The following live tables have no current desired-state target and are neither safely equivalent to an existing table nor approved for automatic migration:

- `business_partner_relation`
- `company_code_customer_profile`, `company_code_supplier_profile`
- `customer_app_index`, `customer_block`, `customer_qualification`
- `supplier_app_index`, `supplier_block`, `supplier_commodity_category`, `supplier_qualification`
- `intercompany_trading_pair`
- `legal_entity_business_partner_link`, `legal_entity_identity_binding`
- `party_contact_person`, `party_contact_role`, `party_governance_relation`, `party_identifier`, `party_tax_profile`
- `payment_method`
- `warehouse`
- `change_reason_code` — evaluate against common `master.audit_reason_code`; not yet a confirmed one-to-one replacement.

## Recommended migration order

1. Treat all **Implemented** and **Renamed/split** rows as the current DDL destination map.
2. Migrate Mesh network/account and catalog data separately from Neon party/master data; they have different ownership and lifecycle.
3. Do not migrate retired or parked tables into placeholder tables.
4. Approve the missing party, counterparty-control, warehouse, payment-method, legal-entity-link, lifecycle, and notification waves before data migration.
