# Meta Entity Contract v2

Status: approved implementation contract

This document is the property-by-property source of truth for the Meta Entity
Framework cleanup. A property is authored in exactly one owner. Compiled
responses may expose derived compatibility fields, but those fields are never
valid v2 input and must not be read as independent metadata.

## Ownership model

| Owner | Owns | Does not own |
|---|---|---|
| `control.entity` | stable catalog identity and classification | storage, runtime capability, layout, feature flags |
| `control.entity_version_contract` | runtime, storage, identity, search, data policy, concurrency | UI layout and domain actions |
| `control.entity_field` | data semantics and query capabilities | search membership, relation target, placement |
| `control.entity_relation` | cross-entity structure | field value formatting and UI picker layout |
| `control.entity_surface` | surface composition and renderer choice | field intrinsic semantics and authorization |
| `control.entity_field_surface` | field placement and surface overrides | physical type and business identity |
| `control.entity_operation` | commands and action presentation | lifecycle state definitions and domain policy |
| lifecycle metadata | states, transitions, state masks | generic display layout |
| `control.entity_numbering_config` | number generation | generic identity and feature flags |
| policy/flow/domain services | authorization, process, and business rules | generic entity layout |

## Canonical property registry

The machine-readable registry is exported as
`META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY` from
`@athyper/api-contracts/meta-entity-contract-v2`. Every entry records owner,
requiredness, default, runtime consumer, UI consumer, authorization impact,
precedence, validation, and deprecation behavior.

### Catalog: `control.entity`

| Property | Type | Required/default | Decision |
|---|---|---|---|
| `id` | stable id | yes / generated | keep |
| `tenant_id` | id/null | yes / null | keep |
| `module_id` | code | yes | keep |
| `entity_code` | snake_case code | yes | canonical replacement for `name` |
| `slug` | kebab-case | yes | keep |
| `entity_class` | registered class | yes / `MASTER` | keep |
| `ownership_model` | enum | yes / `system` | keep |
| `label_singular`, `label_plural` | text | yes | keep |
| `description` | text/null | no | keep |
| `icon_key`, `color_token` | code/null | no | keep |
| `plane_eligibility` | `neon[]`, `admin[]`, `mesh[]` | yes / `[neon]` | keep |
| `status`, `is_active` | lifecycle/generated | yes | keep |
| `status_changed_at`, `status_changed_by` | audit | no | keep |
| `created_at`, `created_by`, `updated_at`, `updated_by` | audit | yes | keep |

Delete from the authored catalog: `name`, `entity_short`, `kind`,
`backing_type`, `runtime_enabled`, `primary_key`, `tenant_column`,
`read_capability`, `write_capability`, `governance_level`, `security_tier`,
`mutability`, `mapping_mode`, `engine_tag`, `table_schema`, `table_name`,
`display_config`, `feature_flags`, `create_mode`, `draft_ttl_hours`,
`numbering_strategy`, `data_policy`, `identity_config`, `search_config`,
`composite_indexes`, discriminator columns, partition columns, and external
source columns. They are either version contract, numbering, surface, policy,
or storage properties.

### Version contract: `control.entity_version_contract`

Required scalar properties are `id`, `tenant_id`, `entity_version_id`,
`runtime_enabled`, `api_exposure`, `backing_type`, `table_schema`,
`table_name`, `primary_key`, `tenant_column`, `read_capability`,
`write_capability`, `create_mode`, `draft_ttl_hours`, `governance_level`,
`security_tier`, `mutability`, `source_kind`, and `contract_hash`.

The strict JSON properties are:

- `identity_config`: `primary_key_field`, `business_key_fields`,
  `natural_key_fields`, `display_identity`, `parent`, `identity_via`,
  `list_entity_code`, `duplicate_check`, `replacement`.
- `search_config`: `enabled`, `mode`, weighted `fields`,
  `minimum_query_length`, `operator`.
- `data_policy`: `classification`, `retention`, `deletion`, `pii_fields`.
- `concurrency_config`: strategy, rollout, row-version field, lock requirement.
- `storage_config`: discriminator, partition, external source, and indexes.

`primary_key`, `tenant_column`, and `table_*` are physical facts. Business
identity is only `identity_config`; human identity is only
`identity_config.display_identity`.

### Fields: `control.entity_field`

Keep identity/audit, `name`, `column_name`, `projection_alias_of`, `label`,
`description`, `data_type`, `cardinality`, `origin`, required/unique/read-only/
deprecated/computed/write-once/runtime flags, compute/default values, and
`is_filterable`, `is_sortable`, `is_groupable`, `is_aggregatable`.

Use only `semantic_roles[]`; the singular role and amount/currency booleans are
deleted. Use one discriminated `type_config`:

| `data_type` family | `type_config.kind` | Structural owner |
|---|---|---|
| scalar | `scalar` | field |
| reference | `reference` | relation code in `type_config.relation` |
| money | `money` | field; currency source may be another field |
| enum | `enum` | lookup domain code |
| date/time | `temporal` | field |
| JSON | `json` | field |

Delete `is_searchable` (search contract owns membership), `is_pii` (data
policy owns PII), enum/reference/money/json/datetime config columns,
foreign-key target columns, temporal presentation columns, lookup profile,
collection behavior, `group_key`, and field UI layout columns.

### Relations, surfaces, operations, lifecycle, numbering, policy, flows

Relations use `relation_code`, `relation_kind`, `target_entity_code`,
`resolution_kind`, source/target fields, polymorphic fields, runtime role,
delete behavior, record filter, mutation owner, and mutation permissions.

Surfaces own list, compact card, spreadsheet, detail, create, edit, picker,
print, line editor, child collection, and header compositions. A field appears
on a surface only through `entity_field_surface`; default list columns are
derived from the default list surface.

Operations own `operation_code`, permission, surface, placement, handler,
record requirement, label, icon, intent, confirmation, reason requirement,
selection behavior, order, and enabled state. Lifecycle states own state
labels/badges/icons/colors and allowed transitions.

Numbering has one owner: `control.entity_numbering_config` with
`number_field`, company scope, prefix/prefix configurability,
separator/segments, reset strategy, uniqueness scope, max length, allowed
characters, metadata, and status.

The policy owner also includes `cache_flags`; it is a typed policy object and
is not a generic entity feature bag.

## Precedence

`server authorization → version runtime contract → lifecycle state mask →
operation/flow rules → entity surface → field-surface override → saved view →
URL session state`.

User state may reorder or hide fields in the allowed surface field set. It may
never expose a field absent from that set.

## Migration and cleanup decisions

1. `101_control_meta_entity_contract_v2.sql` materializes v2 columns and
   converts existing metadata once during the reset seed.
2. The server compiler reads v2 columns as the canonical source and emits old
   response keys only as derived compatibility projections.
3. Studio writes the strict v2 contract only on DRAFT versions and validates
   the complete graph before approval.
4. Unknown v2 properties, duplicate owners, unresolved fields, unresolved PII,
   search fields, relation fields, row-version fields, and numbering fields
   fail validation.
5. Legacy aliases are accepted only by the migration boundary. New persisted
   metadata and v2 API input are canonical snake_case.
6. After the full reset and downstream client cutover, the legacy columns and
   alias normalizer are removed by the retirement migration. No new seed may
   reference them.

## Pilot acceptance

Journal Entry and Purchase Invoice are the reference entities. Both must
compile with no domain-specific property in the generic contract, with list
columns derived from surfaces, search owned by `search_config`, PII owned by
`data_policy`, supplier structure owned by relations, and actions owned by
operations.

## Retirement status

The v2 contract is locked for the Journal Entry and Purchase Invoice pilots.
The following cleanup gates remain before deleting the remaining compatibility
surface:

1. Cut all internal runtime/compiler readers to `contract_v2`; retain old
   response fields only in the outer API projection.
2. Promote descriptor rollout to `full` and require zero compatibility
   fallbacks, parity mismatches, and permission mismatches over the agreed
   observation window.
3. Complete Purchase Invoice interaction smoke coverage: supplier labels,
   line edit/save, distributions, workflow, saved views, spreadsheet, and
   mobile presentation.
4. Replace legacy reads in the canonical graph validator, metadata compliance,
   flow route, execution descriptor fallbacks, and records runtime helpers.
5. Remove legacy records routes, filter aliases, operation aliases, and the
   no-provider compiler path only after route-usage telemetry is zero.
6. Remove compatibility seeds, aliases, and physical legacy columns last,
   followed by a clean reset and full contract/consumer-parity test run.

The retired metadata-admin contract implementation and its validator have
already been removed. The HTTP 410 endpoints remain intentionally as a clear
migration boundary until all external callers have moved to the v2 Studio
route.
