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
  components, editability, visibility, cascades, and asset metadata.
- `095_three_plane_runtime_contract.sql` owns the shared/control runtime access
  tail for the three product planes: permission aliases, entity-operation
  permission normalization, mesh permission catalogue rows, lifecycle-state
  edit/delete masks, and cross-plane entity tags.

Lookup domain/value seeds intentionally remain under `000_lookups/LookupDomain/*` because those files are maintained by lookup domain, not by physical table.

Some dependent child-table rows are still emitted from their parent table file when the SQL block needs locally resolved ids. Examples:

- lifecycle states and transitions are emitted by `030_lifecycle.sql`
- entity flow sections/steps/fields may be emitted by `046_entity_flow.sql`
- workflow stages/rules/definitions may be emitted by `060_workflow_template.sql`

The companion child-table files are retained as table-owned landing points for future standalone rows.

`042b_field_group_member.sql` intentionally runs after `042_entity_field.sql` because field group members point at canonical `control.entity_field` rows.

`042d_ap_purchase_invoice_contract.sql` intentionally runs after
`042_entity_field.sql` and before relations/operations/flows because it adds and
normalizes AP display config, field grouping, and fields that downstream entity
relation, operation, and flow seeds may reference.

When changing AP purchase invoice metadata, update `042d_ap_purchase_invoice_contract.sql`
instead of adding `020z_*`, `040b_*`, or `04x_*` patch files. Keep generic
control-table files generic; put AP-specific interpretation in the AP contract.

`045_entity_field_data_type_normalization.sql` is the final landing point for
entity-field metadata cleanup after coverage and canonical fields exist. Put
data-type alias repairs, final grouping flags, and descriptor invalidation there
instead of adding small `042c_*` or `094_*` patch files.

When changing three-plane runtime access behavior, update
`095_three_plane_runtime_contract.sql` instead of adding separate `095_*` through
`099_*` tail files. Keep the file ordered from vocabulary normalization to
runtime capability gates, then assertions.

`080_transaction_event_catalog.sql` intentionally runs before `081_transaction_flow_template.sql` because transaction flow templates FK into the event catalog by `event_code`.

For development rebuilds, prefer the full reset path so deleted patch files do
not leave old metadata behind:

```powershell
pnpm --dir server/db run db:setup:reset
```
