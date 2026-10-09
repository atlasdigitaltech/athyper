> Historical proposal, archived 10 October 2026. Not an executable cleanup plan. The [Entity Studio blueprint](../../blueprints/entity-studio/blueprint.md#meta-entity-legacy-cleanup-build-lifecycle) and [current runbook](../../runbooks/entity-foundation-qualification.md#current-local-native-build) supersede this proposal. No table deletion or repository replacement is authorized by this archive.

# DDL Trim Manifest — Phase 2 (copy + trim)

Source root in backup: `server/db/ddl/common/`
Target root in fresh repo: `db/ddl/`

This manifest records the **exact** shared-schema trim derived from the current
DDL. It is deterministic and dependency-safe (verified against `05_constraints.sql`).

## Shared schema — tables

`server/db/ddl/common/shared/03_tables.sql` defines 12 tables. Trim result:

| Table                          | Disposition | Reason                          |
| ------------------------------ | ----------- | ------------------------------- |
| `shared.country`               | **KEEP**    | reference entity (in scope)     |
| `shared.currency`              | **KEEP**    | lookup reference                |
| `shared.language`              | **KEEP**    | lookup reference                |
| `shared.locale`                | **KEEP**    | lookup reference                |
| `shared.timezone`              | **KEEP**    | lookup reference                |
| `shared.state_region`          | **KEEP**    | lookup reference (FK → country) |
| `shared.uom`                   | DROP        | not a country lookup            |
| `shared.classification_scheme` | DROP        | out of scope                    |
| `shared.commodity_code`        | DROP        | out of scope                    |
| `shared.industry_code`         | DROP        | out of scope                    |
| `shared.commodity_crosswalk`   | DROP        | out of scope                    |
| `shared.industry_crosswalk`    | DROP        | out of scope                    |

Bank master files are also **dropped entirely** (out of scope):

- `03_bank_master.sql`, `04_bank_master_views.sql` (`bank_institution`, `bank_identifier`, `bank_branch`).

## Shared schema — reference seeds

`server/db/ddl/common/shared/reference-data/`

| Seed                    | Disposition                   |
| ----------------------- | ----------------------------- |
| `001_country.sql`       | KEEP                          |
| `002_state_region.sql`  | KEEP                          |
| `003_currency.sql`      | KEEP                          |
| `004_language.sql`      | KEEP                          |
| `005_locale.sql`        | KEEP                          |
| `006_timezone.sql`      | KEEP                          |
| `007_uom.sql`           | DROP                          |
| `008a…008d` (commodity) | DROP                          |
| `009b…009e` (industry)  | DROP                          |
| `010_bank_master.sql`   | DROP                          |
| `provenance.v1.json`    | KEEP (seed provenance ledger) |

## Dependency safety (verified)

Foreign keys in `05_constraints.sql`:

- `state_region.country_code → country.code` ✅ within keep set
- `state_region(country_code, parent_code) → state_region` ✅ self-reference
- `locale.language_code → language.code` ✅ within keep set
- timezone `canonical_code → timezone.code` ✅ self-reference
- `…country_code → country.code` (×2, in keep set) ✅

All `classification_scheme` / `commodity_code` / `industry_code` FKs live only in
the **drop** set → removing them leaves no dangling references.

## Domains

`02_domains.sql` — **keep all**. Kept tables depend on `ref_status_d`,
`active_inactive_d`, `provenance_d`, etc. Drop-only domains
(`classification_kind_d`, `uom_quantity_type_d`, `mapping_type_d`) are harmless
to keep and cost nothing; keeping avoids a fragile partial-domain edit.

## Per-file trim (mechanical, during M1)

For `shared/` only:

- `05_constraints.sql` — delete FKs referencing dropped tables.
- `06_indexes.sql` — delete indexes on dropped tables.
- `07_functions.sql` — keep `fn_validate_phone()` (references `country`); delete
  commodity/industry/bank helper functions.
- `08_triggers.sql` — delete triggers owned by dropped tables.
- `10_rls.sql` — delete policies on dropped tables.
- `11_grants.sql` — delete grants on dropped tables.
- `12_reference_seed.sql` — trim entries to kept entities.
- `98/99_*` security-definer privilege files — trim grants naming dropped tables.

## Framework schemas — minimal surface (ground truth from source usage)

Reverse-traced table usage across the server source. The rebuild copies **only
the tables the read-only Country list/detail + publication path actually
touches**. Everything else in these schemas is enterprise bloat that the
"meta-entity only" build must **not** carry forward.

### `_database/` — KEEP all 4 files

`00_extensions.sql` (`citext`, `pgcrypto`, `btree_gist`), `01_database_settings.sql`,
`01_service_roles.sql`, `02_schema_provisions.sql`.

### `runtime_meta/` — KEEP the metadata spine (8 tables + their functions/triggers)

- **KEEP tables**: `entity_contract`, `entity_descriptor`, `applied_release`,
  `release_activation_head`, `release_activation_event`, `applied_release_payload`,
  `experience_surface_projection`, `authorization_epoch`.
- **KEEP functions**: `fn_active_entity_descriptor`, `fn_active_release`,
  `fn_stage_release`, `fn_stage_applied_release_payload`, `fn_stage_entity_projection`,
  `fn_stage_release_projection`, `fn_activate_release`, `fn_verify_release`,
  `fn_rollback_release`.
- **DROP**: `tenant_usage_counter`, `usage_reservation`, `entity_number_counter`,
  `entity_number_allocation` (write/counter features); `mfa_credential_projection`
  (MFA — out of scope); `fn_active_business_partner_definition` (bp — out of scope).

### `authz/` — DEFER to M7 (Country defines no list/read permission)

Reference entities with an **undefined** permission mean "everyone" (AGENTS.md).
Country's `definition.json` defines no list/read permission, so M0–M6 run with no
authz tables.

- **M7 minimal set** (only if a permission is later defined): `permission`,
  `permission_scope_kind`, `role`, `role_permission`, `entity_operation_binding`,
  `entity_operation_scope_binding` (+ `authorization_epoch`, already in runtime_meta).
- **DROP**: `plane_membership`, `scope_target`, `principal_group`, `group_member`,
  `group_role`, `deny_rule`, `delegation`, `delegation_grant`, `override`,
  `record_acl`, `trusted_device`, `application_projection`, `projection_provider`,
  `projection_scope`.

### `audit/` — DEFER to M7 (read-only reference list/detail)

- **M7 minimal (optional)**: `audit_log`, `hash_anchor`.
- **DROP**: `audit_reason_code`, `audit_event_contract`,
  `authorization_decision_evidence`, `security_event`, `export_request`,
  `export_manifest`, `integrity_check_evidence`, `legal_hold`, `legal_hold_manifest`,
  `retention_policy`.

### `control/` — KEEP only placement + domain lookup

- **KEEP**: `workspace`, `module`, `workspace_module` (placement resolution),
  `lookup_domain`, `lookup_value` (enum/domain fields like `ref_status_d`).
- **DEFER (optional M7)**: `ui_locale_catalog`.
- **DROP everything else**: `subscription_plan_module`, `connector_type`,
  `connector_instance`, `integration_endpoint`, `webhook_subscription`, `cycle_*`,
  `notification_*`, `numbering_policy`, `policy_*`, `rounding_*`, `feature_flag_*`,
  `usage_metric_catalog`, `subscription_plan_usage_limit`,
  `tenant_usage_limit_override`, `parameter_definition`, `tenant_parameter_value`,
  `cron_schedule*`, `bank_account_validation_rule`, `tenant_module_entitlement_override`,
  `process_selection_*`, `supplier_activation_policy`, `tenant_locale_activation`.

### NOT copied at all

`ai/`, `document/`, `event/`, `governance/`, `log/`, `master/`, `ops/`,
`snapshot/`, `planes/{mesh,neon,studio}/`.
