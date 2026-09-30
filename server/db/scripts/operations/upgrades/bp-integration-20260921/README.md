# DEV Business Partner collaboration upgrade

These are explicit, transactional upgrades from the pre-CA DEV baseline. They
are excluded from startup manifests. Canonical DDL remains the fresh-install
authority; the SQL checksums are registered in `migrations/inventory.json`.

- `studio.sql`: capability members, constraints, RLS, grants, graph validation,
  immutable published-graph guards and timestamps.
- `neon.sql`: comment revisions and capture, immutable history, attachment
  admission/version guards, folder locking, draft expiry, and parent-audience
  policies for mentions and reactions.

Before application, back up the target databases with `pg_dump -Fc` and restore
them to a container labelled `athyper.environment=disposable_local`. Preserve
roles when restoring (use `pg_dumpall --globals-only --no-role-passwords`).
Use the same PostgreSQL image as the target. Backups contain application data;
keep them outside the repository with owner-only permissions.

On the restored copies, apply each plane's SQL using `psql -X -v ON_ERROR_STOP=1`.
Run these fixtures against the disposable container:

```sh
pnpm exec tsx server/db/scripts/tests/integration/entity-capability-ca01.ts athyper-bp-integration-local-20260921
docker exec -i athyper-bp-integration-local-20260921 psql -U postgres -d athyper_neon -X -v ON_ERROR_STOP=1 < server/db/scripts/tests/integration/entity-collaboration-ca02.sql
pnpm exec tsx server/db/scripts/tests/integration/comment-draft-ca07.ts athyper-bp-integration-local-20260921
```

Only after those pass, verify the destination's Compose project is `athyper-dev`,
apply the exact rehearsed SQL, and capture schema catalogs and existing record
counts before/after. Each file checks its database name, holds an advisory lock,
and uses bounded lock/statement timeouts. A partial or already-upgraded baseline
fails transactionally; do not suppress errors or remove existing objects to retry.
Studio and Neon are separate transactions: if the second fails, retain the first
plane's receipt and resolve the second before publishing.

Existing comments receive one snapshot of their current value. Earlier revisions
cannot be reconstructed. Existing attachment bytes, links, and admission values
are preserved. No table is dropped and no migration receipt is reset.

The 2026-09-21 DEV application receipt is in
`docs/reports/bp-integration-20260921/schema-activation.json`. Schema application
does not publish metadata or qualify the application/browser journeys. Studio
and Mesh collaboration storage upgrades are outside these two scripts.
