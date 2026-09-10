# Current database review fixes — 2026-09-10

All seven findings in [the current-tree review](server-db-review-20260910-current.md)
are addressed in source and verified in isolated PostgreSQL. These changes have
not been deployed to development, QA, or production.

- Document views use invoker privileges in all three planes, preserving table RLS.
- Application roles cannot directly read the global account materialized cache.
  They can read the tenant-filtered `master.v_company_postable_account` view.
  Privileged cache refresh and existing administrative seed workflows keep the
  original materialized-view name.
- Every fresh foundation installs saved-view defaults after its dependencies.
  The table grants SELECT/INSERT/UPDATE to `athyperapp`.
- Every dated migration is registered for its applicable planes, including the
  earlier September 10 repairs and the September 8 feature migrations. New
  upgrade files repair document-view isolation, account-cache access, and
  saved-default privileges. Historical migration contents were preserved.
- The legacy Neon-to-Mesh reference-sync package command is retired. A direct
  invocation fails immediately with migration guidance, before connecting to a
  database. All planes already consume the same common layer-12 reference pack;
  existing installations receive changes through reviewed forward migrations.
- Ledger repair derives its seed root from the script location, supports
  `--seed-root`, and fails incomplete source scans before applying changes.
  Trigger suspension and hash updates now execute in one transaction; dry-run
  cleanup no longer creates a trigger.

Validation:

| Check | Result |
|---|---|
| Database unit suite | 147 passed, 0 failed |
| Manifest/model and shared-reference checks | Passed |
| Fresh Studio, Neon, Mesh foundations with receipts | Passed |
| Same-tenant and cross-tenant document/account view probes | Passed |
| Application saved-default reads/writes with audit triggers | Passed |
| Upgrade from vulnerable views and missing saved-default storage | Passed |
| Actual forward runner, then a second run using its receipts | Passed |
| Previous Mesh/identity/AI regressions and upgrade parity | Passed |
| Git whitespace checks | Passed |
| Package typecheck | Existing workspace rootDir errors and two unrelated integration typing errors remain; no errors in files changed for these fixes |

The security fixtures bypass unrelated FK/fixture triggers only during setup;
application operations run with normal triggers, a real tenant/actor fixture,
and the non-superuser application role. This validates the database boundary,
not every HTTP endpoint or historical production baseline. The forward-runner
test marks pre-existing historical definitions as baseline receipts, then executes
all newly registered upgrades and verifies a second run skips them safely.

The disposable PostgreSQL 16.13 container was removed. Logs use
`/tmp/athyper-db-fix-current-*.log`. No commits were created, and existing unrelated
working-tree changes were preserved.
