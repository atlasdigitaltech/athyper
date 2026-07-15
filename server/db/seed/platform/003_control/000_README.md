# Control Seed Layout

`003_control` owns platform-global seed data for `control.*` tables.
Default layout is one table-owned file per table.

During active development, a tightly coupled domain contract may live in one
cohesive file when that is easier to reset, review, and understand than several
small patch files. Keep those files idempotent, sorted into the point where their
dependencies exist, and add assertions for the contract they own.

Current cohesive contract exceptions:

- `042d_ap_purchase_invoice_contract.sql` owns the AP purchase invoice metadata
  cluster for PI (`purchase_invoice`), PIL (`purchase_invoice_line`), PC
  (`pricing_component`), and AD (`accounting_distribution`). It replaces the
  older AP patch-style files for display/list columns, field groups, pricing
  components, editability, visibility, cascades, and asset metadata. Also owns
  PI form-visibility rules (Â§11 phase-3 resolver outputs, Â§12 system/audit/
  derived fields) â€” formerly the standalone `042e_` and `042f_` files â€” and
  PI action rules (Â§13 state matrix) â€” formerly `050_document_runtime_action_rules.sql`.
- `044b_site_warehouse_contract.sql` owns the site + warehouse domain contract
  (master.site, master.warehouse) across entity, entity_field, entity_relation,
  entity_operation, and field grouping â€” the multi-table pattern parallel to
  042d for the logistics master cluster.
- `072p_p2p_runtime_contract.sql` owns the P2P entity cluster runtime metadata
  (PR / POC / DN / receipt / service_sheet / schedule_line, plus PI/PO
  cross-refs): relations, operations, numbering configs, action rules, field
  security, workflows, lifecycle transition hooks (after + workflow-start),
  notification templates, notification routing, and lifecycle state masks.
  Replaces 10 prior P2P parity patch files (`043z_`, `050z_`, `050z2_`,
  `055z_`, `060z_`, `070z_`, `070z2_`, `082z_`, `083z_`, `095z_`).
  Companion: `030p_p2p_lifecycle_contract.sql` owns the P2P lifecycle definitions
  themselves, kept at position 030 so `045_control_entity_lifecycle_contract.sql` can bind to
  them before the runtime contract runs.
- `095_control_three_plane_runtime_contract.sql` owns the shared/control runtime access
  tail for the three product planes: permission aliases, entity-operation
  permission normalization, mesh permission catalogue rows, lifecycle-state
  edit/delete masks, and cross-plane entity tags.
- `080_control_transaction_event_contract.sql` owns the transaction event vocabulary
  (`control.transaction_event_catalog`) and the flow templates that consume it
  (`control.transaction_flow_template`). Replaces the prior 080/081 pair â€”
  events and flows must reset together because 081 has an `event_code` FK
  into 080.
- `091_control_print_contract.sql` owns platform print configuration: the per-tenant
  default print profile (`master.print_profile`), entity-level print layout
  (`control.entity.display_config.print_config` for site + warehouse), and
  print field-masking (`control.entity_field.ui_hint.display.hide_in`).
  Replaces the prior 091/092/093 trio.
- `092_control_entity_surface_contract.sql` derives normalized runtime surfaces from
  existing entity/field metadata after list, field-group, visibility, and print
  contracts have landed. It seeds `control.entity_surface` and
  `control.entity_field_surface` for active/deprecated platform entities while
  legacy `display_config` and `ui_hint` remain compatibility inputs.
- `082_control_notification_contract.sql` owns platform notification configuration:
  templates (`control.notification_template`) and routing rules
  (`control.notification_routing_rule`). Replaces the prior 082/083 pair.
  Mirrors the Â§7/Â§8 structure inside 072p so notifications can be reviewed in
  one place. P2P-specific templates and routes live in 072p Â§7/Â§8.
- `060_control_workflow_contract.sql` owns platform workflow configuration: templates +
  stages + rules + workflow definitions (Â§1) and SLA policies (Â§2). Replaces
  the prior 060_workflow_template + 063_workflow_sla_policy pair. P2P-specific
  workflow templates live in 072p Â§5; this file's Â§2 owns the platform-default
  SLA timer ladders consumed by both AP and P2P.

Lookup domain/value seeds intentionally remain under `000_lookups/LookupDomain/*` because those files are maintained by lookup domain, not by physical table.

### Parent owns child (no landing files)

When child rows need a locally-resolved parent id (`lifecycle_id`, `entity_flow_id`, `workflow_template_id`, â€¦), they live inside the parent file so the id is in scope. Empty child-table landing files are *not* kept â€” readers would grep, open them, find four lines of comments, and miss where the rows actually live.

Each parent declares its children in its `-- Also writes:` header. Today:

- `030_control_lifecycle_contract.sql` also writes `control.lifecycle_state`, `control.lifecycle_transition`
- `030p_p2p_lifecycle_contract.sql` also writes the same children for the P2P cluster
- `046_control_entity_flow_contract.sql` also writes `control.entity_flow_section`, `control.entity_flow_step`, `control.entity_flow_field`
- `060_control_workflow_contract.sql` also writes `control.workflow_template_stage`, `control.workflow_template_rule`, `control.workflow_definition`, and `control.workflow_sla_policy`
- `072p_p2p_runtime_contract.sql` also writes `control.lifecycle_transition_hook`, `control.field_security_policy`, and the P2P workflow stage/rule/definition rows

Child tables with no platform-level seed (runtime-only or tenant-only): `control.lifecycle_transition_gate`, `lifecycle_timer_policy`, `lifecycle_hook_override`, `entity_numbering_counter`, `entity_policy`, `entity_publish_state`, `forecast_budget_bridge`, `forecast_line`, `formula_expression`, `formula_expression_version`. Do not add empty placeholder files for these â€” the absence is the documentation.

`042b_control_field_group_member_contract.sql` intentionally runs after `042_control_entity_field_contract.sql` because field group members point at canonical `control.entity_field` rows.

`042d_ap_purchase_invoice_contract.sql` intentionally runs after
`042_control_entity_field_contract.sql` and before relations/operations/flows because it adds and
normalizes AP display config, field grouping, and fields that downstream entity
relation, operation, and flow seeds may reference.

When changing AP purchase invoice metadata, update `042d_ap_purchase_invoice_contract.sql`
instead of adding `020z_*`, `040b_*`, or `04x_*` patch files. Keep generic
control-table files generic; put AP-specific interpretation in the AP contract.

When changing P2P runtime metadata (PR / POC / DN / receipt / service_sheet,
plus PI/PO cross-cluster wiring), update `072p_p2p_runtime_contract.sql`
(runtime) or `030p_p2p_lifecycle_contract.sql` (lifecycle definitions) instead of
adding new `04xz_*`, `05xz_*`, `08xz_*`, `09xz_*` patch files. Keep generic
control-table files generic; put P2P-specific interpretation in the contract.

`045_control_entity_field_data_type_normalization_contract.sql` is the final landing point for
entity-field metadata cleanup after coverage and canonical fields exist. Put
data-type alias repairs, final grouping flags, document-runtime filterability
overrides, and descriptor invalidation there instead of adding small `042c_*`,
`051_*`, or `094_*` patch files.

When changing three-plane runtime access behavior, update
`095_control_three_plane_runtime_contract.sql` instead of adding separate `095_*` through
`099_*` tail files. Keep the file ordered from vocabulary normalization to
runtime capability gates, then assertions.

For development rebuilds, prefer the full reset path so deleted patch files do
not leave old metadata behind:

```powershell
pnpm --dir server/db run db:setup:reset
```

## Integrity Guardrail

`099_control_entity_module_workspace_integrity_contract.sql` validates the cross-table contract:

- Every `control.entity.module_id` resolves to `shared.module.id`
- Every resolved module has a `shared.workspace` link

Keep this file as the last assertion point for Workspace -> Module -> Entity mapping checks in
`003_control` seed ordering.

## File Naming Convention (New files only)

For consistency across future seed additions, use this naming pattern:

`[execution_order]_[module]_[entity]_[purpose].sql`

- `execution_order`: 3â€“4 digit order token with optional single letter suffix only when
  splitting a large contract into intentional shards (`a`, `b`, `c`, etc.).
- `module`: short domain key (`ap`, `po`, `p2p`, `ledger`, `control`, etc.).
- `entity`: primary object family (`purchase_invoice`, `purchase_order`, `field_group`, `entity_field`, `workflow`, ...).
- `purpose`: action noun (`contract`, `fields`, `mappings`, `runtime`, `assertions`, `visibility`, ...).

Examples:
- `042d_ap_purchase_invoice_contract.sql` (existing PI contract; no change required)
- `042i_po_purchase_order_contract.sql` (if added as a PO split shard)
- `030p_p2p_lifecycle_contract.sql` (existing lifecycle shard pattern; acceptable because `_p2p_` is the module bucket)
- `050_control_entity_numbering_config_contract.sql` (legacy compact form; keep as-is for compatibility)

Recommendation for this folder:
- Prefer the full noun entity in filenames (`purchase_invoice`) over abbreviated aliases.
- Keep one responsibility per file; avoid combining unrelated table purpose suffixes.
- Preserve execution order when renaming or adding files so dependent seeds remain deterministic.






