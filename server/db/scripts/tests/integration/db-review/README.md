# Database review regressions

Run from the repository root:

```sh
pnpm --dir server/db run test:integration:db-review
```

The runner creates a PostgreSQL 16.13 container with no network and temporary
storage, provisions all three canonical foundation manifests, runs behavioral
checks, applies the three September 10 repair migrations twice, and compares
upgraded function definitions with fresh-install definitions. It also recreates
the historical discovery command to verify pre-upgrade NULL-date retries, and
checks retrieval against a concurrent relationship suspension. The container is
removed on success or failure. Docker and the existing PostgreSQL image are needed.

The bank fixture seeds synthetic approval evidence with replication triggers
disabled. Retrieval and lifecycle assertions run with normal triggers; protected
retrieval executes under a dedicated non-superuser role. These are command-boundary
tests, not a full onboarding workflow.

`--container=athyper-db-fix-<id>` may reuse an already provisioned disposable target
for debugging. Its network must be `none` and its PostgreSQL storage must be tmpfs.
This mode retains fixtures and the container and is intended for one run per fresh
target. The runner refuses dev/QA container names.

Upgrade deployment order: apply `20260910_ai_call_usage_constraint.sql` to each
plane; apply `20260910_identity_replay_context_hardening.sql` only to Studio and
`20260910_mesh_command_hardening.sql` only to Mesh. Historical migrations are kept
unchanged. Mesh deployments predating G4 skip the absent protected-retrieval
feature; partial G4 installations fail closed. The unit suite checks the latest upgrade definitions against canonical
DDL; the integration suite checks actual PostgreSQL upgrade behavior.

The current-review regressions also verify same-tenant visibility and rejection
of cross-tenant reads through document views and the accounting cache wrapper.
They exercise saved-default reads/writes as `athyperapp`, including normal audit
capture. Synthetic fixture setup bypasses unrelated FK/fixture triggers only.
The suite recreates vulnerable views and missing saved-default storage, applies
upgrades, and repeats the behavioral checks. It also runs the actual deployment
entrypoint twice with historical baseline receipts and checks every manifest row.

Applications must read `master.v_company_postable_account`. Direct access to
`master.mv_company_postable_account` is reserved for privileged cache maintenance.

Discovery replays stable relationship/capability IDs but returns the capability's
current status at query time. Replays do not change lifecycle state. The
replay-after-withdrawal regression checks that the result reports `ended` and the
persisted capability remains ended. Other Mesh command response contracts are
unchanged.

The AI usage preflight takes a table lock, reports incompatible completed calls
with a capped sample count and up to 20 IDs, and rolls back without altering data. Constraint
preparation migrations use `DROP CONSTRAINT IF EXISTS` and recreate validated
constraints before the unchanged historical repairs. Use the ordered deployment
manifests so these preparatory migrations run first. The suite covers missing
constraint names, incompatible data diagnostics, rollback, and repeated execution.

Optional-role migrations are tested before `athyperapp` exists and again after
creating it, including repeated application. PUBLIC cache access is revoked in
both cases. Legacy `athyper_runtime` saved-default grants are removed through a
separate forward migration and canonical DDL cleanup.

The AI diagnostic query collects at most 20 incompatible IDs without a global
count or sort. Its 15-minute statement timeout accommodates larger histories;
proving that a clean table has no violations still requires a full scan, and the
CHECK is still fully validated. This is not an online or constant-time migration.

Receipt ownership invariant: `command_discover_network_relationship` executes as
its owner. Under FORCE RLS, a non-BYPASSRLS owner must be covered by the private
receipt policy. Any future owner transfer must update that policy deliberately;
never grant receipt access to runtime roles to bypass this requirement. The
integration catalog check enforces owner coverage after the upgrade chain.
