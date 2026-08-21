# Finance FX certification and navigation rollout

## Contract

Finance certification consumes the server-produced setup status. Currency and
FX rate health is returned beside setup status for operational attention, but
missing or stale rates do not change certification readiness.

Production posting never consumes browser state. The posting gate reads the
latest attested `FINANCE_POSTING_READY` snapshot whose
`fourDomainReadiness.summary.readyForCertification` value was produced by the
Finance certification service. Mandatory tasks and unresolved critical
deviations are checked again when posting is attempted.

The `finance.fx_entity_navigation` release gate changes navigation only:

- enabled: rate maintenance links target `/app/fx_rate`;
- disabled: links return to the tenant Currency & FX settings page;
- rate and policy writes continue through the governed services in either mode;
- disabling the flag does not require a database migration or data rollback.

## Pre-rollout checks

Run the read-only tenant-default report from the repository root:

```powershell
pnpm.cmd --dir server/db run db:report:finance-fx-tenant-defaults
pnpm.cmd --dir server/db run db:report:finance-fx-tenant-defaults -- --all --csv
```

The default JSON output includes only active tenants requiring review.
`missing_default` means there is no effective or scheduled tenant default;
`scheduled_only` means an administrator should verify the effective date. The
report also includes company exposure counts and policy/rate history counts so
support can distinguish missing setup from missing data.

For every exposed tenant reported as `missing_default`, configure a tenant
default through Finance Setup before certification. Do not insert or update
`control.fx_policy` directly.

## Rollout

1. Apply the seed containing `finance.fx_entity_navigation`.
2. Run the tenant-default report and resolve exposed tenants with no default.
3. Confirm certification payloads show setup blockers under `domains[].checks`
   and rate-health attention under `domains[].operationalHealth`.
4. Start with a tenant override if a staged rollout is required.
5. Enable the flag globally after Entity rate maintenance parity is accepted.
6. Monitor navigation, certification, and posting-gate events.

Tenant overrides use the tenant UUID as the JSON key:

```sql
UPDATE control.feature_flag
   SET tenant_overrides =
       coalesce(tenant_overrides, '{}'::jsonb) ||
       jsonb_build_object('<tenant-uuid>', true),
       updated_at = now()
 WHERE code = 'finance.fx_entity_navigation';
```

## Observability

Structured events:

- `finance_fx_navigation_resolved`: flag code, tenant, and selected mode;
- `finance_certification_readiness_evaluated`: company setup blockers,
  certification status, and separate FX operational-attention count;
- `finance_certification_readiness_rollup_evaluated`: tenant or Legal Entity
  company totals;
- `finance_posting_readiness_gate_evaluated`: snapshot source, rollout mode,
  decision, and certification result.

Alert or investigate when:

- navigation resolution errors increase after the switch;
- exposed tenants remain in `missing_default`;
- a company repeatedly produces setup blockers after configuration;
- posting decisions are blocked with
  `FINANCE_POSTING_READINESS_REQUIRED`;
- the gate event source differs from `certification_service_snapshot`.

Rate-health warnings by themselves are operational work, not a certification
failure. Investigate rate dates, source, purpose, and currency pairs in the
governed `fx_rate` Entity.

## Support checks

Confirm policy history remains readable:

```sql
SELECT tenant_id, company_code_id, ledger_book_id, version_no, status,
       effective_from, effective_to, supersedes_id
  FROM control.fx_policy
 WHERE tenant_id = '<tenant-uuid>'
 ORDER BY created_at DESC;
```

Confirm rate history remains readable:

```sql
SELECT tenant_id, id, source, rate_type, from_currency, to_currency,
       effective_date, effective_time, status, version_no, supersedes_id
  FROM master.fx_rate
 WHERE tenant_id = '<tenant-uuid>'
 ORDER BY created_at DESC;
```

Use policy commands and Add/Replace/Import Rate commands for corrections.
Historical rows must not be edited or deleted.

## Navigation rollback

Disable only the navigation flag globally:

```sql
UPDATE control.feature_flag
   SET is_enabled = false, updated_at = now()
 WHERE code = 'finance.fx_entity_navigation';
```

Or set the affected tenant override to `false`. Verify
`finance_fx_navigation_resolved` reports `mode=legacy`, then confirm links
return to tenant Currency & FX settings. Prefer the governed feature-flag
control path because it invalidates the cache. A direct SQL change can take up
to the 60-second feature-flag cache TTL to become visible.

Do not roll back policy or rate migrations and do not restore historical rows
from backup. The navigation seed deliberately preserves the current enabled
state on re-application, so an operational rollback is not undone by routine
seed reconciliation.
