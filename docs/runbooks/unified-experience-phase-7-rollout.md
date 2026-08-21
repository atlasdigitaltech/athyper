# Unified experience Phase 7 rollout

## Scope

This runbook governs the eight unified experience release gates across Admin,
Neon and Mesh. The gates are registered by
`113_unified_experience_rollout.sql` and resolve server-side through
`GET /api/platform/experience-flags`. Unknown flags, missing infrastructure and
invalid plane/account contexts fail closed.

The controlled flags are:

- `unified_shell_v2`
- `work_inbox_v2`
- `settings_workspace_v2`
- `saved_views_hub_v2`
- `dashboard_host_v2`
- `setup_directory_v2`
- `content_hub_v2`
- `document_workspace_v2`

`document_workspace_v2` is limited to Neon and Mesh. Account overrides are
evaluated only on the server and are not returned as an override directory.

## Promotion order

1. Enable an internal Admin cohort and observe authentication, navigation,
   permission-denied and telemetry behavior.
2. Enable one selected Neon tenant.
3. Enable selected Mesh buyer and supplier accounts.
4. Expand to a wider canary cohort after all gates below pass.
5. Change the global default only after the canary observation is accepted.

Disable the affected context override to roll back. Do not remove the legacy
path during rollback or during the observation window.

## Release evidence

Before each promotion:

```powershell
pnpm policy:plane-boundaries
pnpm policy:experience-cleanup
pnpm perf:verify:experience-contracts
pnpm perf:verify:shell-bundle
pnpm test:e2e:production
```

Production performance evidence must also pass
`pnpm perf:verify:experience-production` with
`ATHYPER_EXPERIENCE_GATE_EVIDENCE` pointing to the captured p75, request-count,
list-bound and bundle measurements.

Reject promotion when:

- LCP p75 exceeds 2.5 seconds or INP p75 exceeds 200 ms.
- Dashboard or Settings bootstrap introduces more than one aggregate request.
- A list request exceeds the bounded page-size contract.
- WCAG 2.2 AA, keyboard, mobile or session-expiry checks fail.
- Plane/scope isolation, server authorization or redaction checks fail.
- Required telemetry is missing or contains record/field values.

## Observation and cleanup

Observe each default-on surface for at least 14 days with no unresolved Sev-1
or Sev-2 incident. Review `surface_load_failed`, `widget_load_failed`, action
failure/conflict rates, Web Vitals and rollback counts per plane and active
scope.

After acceptance, update `config/legacy-experience-cleanup.json` in the same
change that removes each legacy target. The cleanup policy must stay green.
Migration flags are removed only after all consuming wrappers are gone and the
observation record is attached to the release.
