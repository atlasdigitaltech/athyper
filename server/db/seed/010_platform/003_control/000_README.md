# Control Seed Layout

`003_control` owns platform-global seed data for `control.*` tables, one table-owned file per table.

Lookup domain/value seeds intentionally remain under `000_lookups/LookupDomain/*` because those files are maintained by lookup domain, not by physical table.

Some dependent child-table rows are still emitted from their parent table file when the SQL block needs locally resolved ids. Examples:

- lifecycle states and transitions are emitted by `030_lifecycle.sql`
- entity flow sections/steps/fields may be emitted by `046_entity_flow.sql`
- workflow stages/rules/definitions may be emitted by `060_workflow_template.sql`

The companion child-table files are retained as table-owned landing points for future standalone rows.

`042b_field_group_member.sql` intentionally runs after `042_entity_field.sql` because field group members point at canonical `control.entity_field` rows.

`080_transaction_event_catalog.sql` intentionally runs before `081_transaction_flow_template.sql` because transaction flow templates FK into the event catalog by `event_code`.
