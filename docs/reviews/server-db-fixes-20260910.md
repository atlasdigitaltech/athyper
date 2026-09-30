# Database review fixes and execution — 2026-09-10

All seven actionable findings in [the review](server-db-review-20260909.md) are addressed.

- Corrected the AI model-call constraint; tool-only completion remains a run-level exception.
- Bank-token retrieval now locks and revalidates the relationship, its date interval, both participant accounts, purpose, capability, and bank-account status before serving either new retrievals or retries.
- Registration acceptance rejects expired invitations under its existing row lock.
- A requester can end an unapproved capability without fabricating approval. The counterparty must use rejection; activated capabilities still require bilateral approval.
- Discovery persists its input fingerprint and result in a private, immutable receipt table. New episodes share one resolved date, retries remain stable across calendar boundaries, and every new child key is derived with SHA-256 using distinct prefixes. Caller keys retain the 8–200 character contract. Legacy successful commands retain their existing child keys and dates.
- CirrusAtlantic provisioning validates the required reviewer permission set instead of an obsolete count; maker/checker validation also avoids a TypeScript literal-comparison error.
- Identity replay's two principal casts now return the domain error `23514` for malformed context, rather than leaking the UUID cast error.
- Updated the three stale BS360 assertions to follow the current route contract, navigation location, and formatting. Added upgrade-definition drift checks without changing historical migrations.

## Executed validation

| Check | Result |
|---|---|
| `pnpm --dir server/db test` | **145 passed, 0 failed** |
| `pnpm --dir server/db run db:verify:ddl-model` | Passed |
| Fresh PostgreSQL 16.13 foundation manifests | Studio, Neon, and Mesh passed with receipts |
| `pnpm --dir server/db run test:integration:db-review` | Passed fresh builds, behavioral probes, upgrade parity, repeat migration application, legacy retry, concurrent suspension, and RLS catalog checks |
| Pre-G4 migration variant, added after deployment preflight | Separately executed against isolated PostgreSQL; absent feature skipped, full G4 upgrade and reapplication passed |
| Development installed-definition verification | All applicable function bodies matched canonical DDL; AI constraints and private receipt permissions verified |
| `git diff --check server/db` | Passed |
| `pnpm --dir server/db typecheck` | Not clean: workspace `rootDir`/external-source errors and unrelated integration typing errors remain; no errors reported in the changed model or new tests after the model correction |

Behavioral checks cover 200-character keys, invalid keys, altered-input retries,
matching new episode dates, cross-date retry, requester withdrawal and replay,
counterparty withdrawal denial, expired acceptance, explicit expiry, retrieval
and replay after suspension/reactivation, expired/future relationships, suspended
participants/capabilities, termination, and concurrent committed suspension.
The bank fixture bypasses triggers while constructing synthetic approval evidence;
retrieval and lifecycle checks use normal triggers, with a non-superuser retrieval
role. This is command-boundary coverage, not complete onboarding certification.

## Development execution

Applied using `psql -v ON_ERROR_STOP=1` in `athyper-dev-db-1`:

1. `20260910_ai_call_usage_constraint.sql` — committed in `athyper_studio`, `athyper_neon`, and `athyper_mesh`.
2. `20260910_identity_replay_context_hardening.sql` — committed in `athyper_studio`.
3. `20260910_mesh_command_hardening.sql` — committed in `athyper_mesh`.

The first Mesh attempt rolled back because development predates G4. The migration
was then updated and tested to skip the wholly absent protected-retrieval feature
and reject partial G4 installations. The second attempt committed. Development
has neither the protected-retrieval function nor its supporting purpose/evidence
tables, so there was no existing retrieval function to replace there. The corrected
function is installed by fresh G4 builds and upgrades of existing complete G4 databases.

Pre-change function and constraint definitions are saved at
`/tmp/athyper-db-fix-before-20260910/`. Execution and verification logs use the
`/tmp/athyper-db-fix-*` prefix. QA was not changed. Disposable test containers were
removed. No commits were created; unrelated working-tree edits were preserved.

The repeatable isolated runner and its usage are documented in
[the regression README](../../server/db/scripts/tests/integration/db-review/README.md).
