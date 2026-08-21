# Neon live-view migration

Date: 2026-08-01

The read-only live Neon inventory contained 47 ordinary views and one
materialized view. Every live contract now has an explicit desired-state
disposition.

## Preserved contracts

Twenty-eight views retain their live qualified name and result contract. Four
were already present (`master.mv_company_postable_account`,
`master.v_bank_account_resolved`, `master.v_bank_account_link_resolved`, and
`master.v_employee`). Twenty-four compatible definitions were moved into the
active phase-09 Neon layer:

- nine document finance/reporting views;
- two ledger views;
- twelve master directory/business-partner views; and
- `control.v_authorization_v2_deferred_constraints`.

Migrated ordinary views use `security_invoker=true` and
`security_barrier=true`, so base-table RLS remains authoritative.

## Canonical replacements

| Live contract/group | Desired-state replacement |
| --- | --- |
| `control.v_acct_profile_full` | `control.accounting_profile_policy_catalog` |
| `control.v_active_flow_templates` | `snapshot.active_flow_template` |
| `control.v_authorization_v2_operation_publication` | `authz.permission_catalog` |
| `control.v_blueprint_catalogue` | `snapshot.blueprint_catalog` |
| Four mutable Meta Entity audit views | `snapshot.latest_entity_snapshot` and `snapshot.entity_contract_inventory` |
| Six `master.auth_*` views | `authz.current_plane_membership`, `authz.current_group_member`, `authz.current_group_role`, `authz.published_role_permission`, `authz.current_delegation_grant`, and `authz.scope_target_catalog` |
| `master.v_business_partner_governance_summary` | `master.business_partner_governance_summary` |
| `master.v_entity_commodity` | `master.entity_commodity_assignment` |
| `master.v_tenant_risk_source_config` | `control.v_risk_source_config` |
| `event.v_authorization_invalidation_health_v2` | `event.authorization_invalidation_health` |
| `log.v_resolution_pipeline` | `audit.resolution_pipeline` |
| `snapshot.v_p2p_audit_timeline` | `audit.p2p_timeline` |

The removed names are not recreated as indefinite compatibility aliases.
Application/UI consumers should switch through an explicit adapter or API
contract before the database cutover.

## Verification

- All live view dependencies were read from `pg_rewrite`/`pg_depend`.
- Preserved definitions were admitted only when every underlying relation is
  declared by the active Neon foundation manifest.
- Common replacements are installed in Athyper, Neon, and Mesh where the
  owning tables are common; Neon business replacements remain Neon-only.
- The three-plane foundation dry-run resolves every new phase-09 and phase-11
  file. No SQL was applied to the live database.
