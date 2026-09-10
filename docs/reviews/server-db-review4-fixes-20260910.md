# Database review and fixes, round 4 — 2026-09-10

Five correctness issues were fixed in the current working tree. Earlier changes
were preserved. No application databases were changed or commits created.

| Issue | Fix and evidence |
|---|---|
| Missing JSON keys bypass experience CHECKs | [Release](../../server/db/ddl/common/ai/03_tables.sql) and [surface projection](../../server/db/ddl/common/runtime_meta/03_tables.sql) definition checks now require the entire expression to be TRUE. Missing or JSON-null `schema`, `scope`, and `id` cannot pass via SQL NULL. The isolated test inserted `{}` under the legacy definition, reproduced acceptance, and proved the upgrade rejects that data atomically. |
| Session context can contradict the physical projection plane | The local-plane CHECK now also compares `plane_code` with the physical database name and requires TRUE. Matching a spoofed session GUC is insufficient. All three planes rejected spoofed-plane and empty-context fixtures after hardening. |
| Ledger CLI truncates connection strings containing `=` | [Ledger repair](../../server/db/scripts/operations/repair/repair-tenant-ledger-hashes.ts) now uses the shared option parser. Both `--db=value` and `--db value` preserve complete URLs, including query parameters. Invalid plane names fail early instead of producing an empty misleading scan. Unit tests cover both forms. |
| Valid IPv6 loopback URLs are rejected | [Target helpers](../../server/db/scripts/lib/database-target.ts) now accept the bracketed `[::1]` hostname returned by URL parsing. Other IPv6 addresses remain rejected by the loopback guard. Unit tests reproduce the valid URL case. |
| Migration runner identities can collide across containers | [Forward runner](../../server/db/runtime/run-forward-migrations.sh) previously combined a second-resolution timestamp with a PID; separate containers can both have PID 1 in the same second and mistake each other's ledger claim for their own. It now uses 128 random bits and fails if identity generation fails. The actual forward-runner regression suite passed with the new identity format. The namespace-collision scenario was identified from source, not reproduced with simultaneous deployment containers. |

Additional cleanup:

- Removed the unused `sync-shared-to-mesh-cli.ts` helper after confirming no callers
  remained; the retired sync entrypoint still gives explicit migration guidance.
- Private-host parsing now requires dotted decimal octets, rejecting empty,
  whitespace, and hexadecimal components previously accepted through `Number()`.
- Experience integration tests no longer read development schema or require a
  running development container. They recreate the exact pinned legacy definitions
  inside isolated PostgreSQL.
- Documented current Atlas AI maintenance commands in the scripts README.

The pending experience migration was regenerated from canonical blocks. Its
catalog comparison still validates columns, indexes, grants, RLS, policies,
triggers, and constraints. It accepts only the complete known legacy or current
schema; known legacy checks are upgraded in the same transaction. Malformed data
aborts the upgrade without silently repairing payloads. Previously deployed
historical migrations were not changed.

Validation:

- **149 unit tests passed**.
- Experience canonical-generation and DDL-model checks passed.
- Experience integration suite passed fresh builds, repeated upgrades, missing
  tables, exact legacy upgrades, unrelated-drift rejection, invalid-data rollback,
  required JSON fields, tenant isolation, and physical-plane checks for all three
  planes.
- Full database-review integration suite passed, including three-plane foundation
  builds, actual migration-runner replay, AI compatibility diagnostics, view
  isolation, saved defaults, Mesh lifecycle/replay, bank retrieval, and receipt
  ownership assertions.
- Whitespace checks passed. Both disposable containers were removed.
- Package typecheck remains blocked by existing workspace `rootDir` errors and
  the existing typing errors in `business-partner-case-contract-publication.ts`
  and `business-partner-r6-delivery.ts`. No errors were reported in the TypeScript
  files changed this round.

Scope: reviewed the new experience schema/migration/generator and tests, the
previous fixes, migration orchestration, ledger tooling, target validation, and
selected wider DDL patterns. This is not a line-by-line certification of the
entire DDL/seed/backup tree or every historical deployment baseline. Logs use
`/tmp/athyper-db-review4-*.log`.
