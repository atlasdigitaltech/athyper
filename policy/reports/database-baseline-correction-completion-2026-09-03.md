# Database baseline correction completion — 2026-09-03

## Decision

**Baseline engineering defects are corrected. New architecture work may begin, but authorization publication remains fail-closed until the named governance reviews are approved.**

This artifact supersedes the remediation status in `database-prechange-baseline-2026-09-03.md`. It certifies the current working tree, not a release commit. Existing unrelated user changes and the already-removed `.codex-phase6-deploy` worktree were not modified or restored.

## Corrected command and evidence surfaces

- Replaced the PowerShell-only foundation entrypoints with the cross-platform TypeScript foundation runner. It supports planning, URL/Docker application, ordered `\\ir` expansion, transaction boundaries, fresh-database checks, reconciliation and durable `public.schema_provisions` receipts.
- Added a versioned supported-upgrade baseline at commit `29ec62fa115c776b907a0eba52c67745b6e94abb`, including exact manifest hashes, per-plane forward deltas and an explicit retired-historical-migration disposition.
- Made clean-versus-upgrade Business Partner parity reject the same physical PostgreSQL database and normalize catalog ordering deterministically.
- Retired package commands for missing Meta Entity/blueprint inputs and obsolete effective-lock, cache-invalidation, audit and report contracts. Historical sources were retained where deletion was not required.
- Rebuilt NEON and MESH authorization inventories from canonical DDL rather than hard-coded table counts; regenerated the NEON promotion artifacts.
- Corrected archetype, platform-catalog, audit/Alloy, forced-RLS and drift verification behavior. Verifiers can no longer succeed vacuously or count runtime SQL hints as catalog drift.
- Corrected MESH relationship fixtures to use the command-owned mutation boundary and corrected NEON qualification fixtures for separation of duties.
- Added the global `principal` owner reference, repaired Atlas function execution grants, replaced host-`psql` integration entrypoints, and made publication integration execute current TypeScript sources.
- Added `20260903_canonical_baseline_cleanup.sql` to every forward manifest for upgrade parity.

## Executed evidence

| Gate | Result |
| --- | --- |
| Cross-platform foundation plan, all planes | PASS |
| Fresh Studio / NEON / MESH foundation application | PASS |
| Durable foundation receipts | PASS: Studio 228, NEON 207, MESH 206 |
| Supported-upgrade baseline validation | PASS: Studio 35 + 3, NEON 80 + 2, MESH 39 + 4 |
| Full clean-versus-upgrade normalized catalog comparison | PASS: zero drift on columns, domains, constraints, indexes, RLS, policies, functions and triggers |
| Business Partner clean-versus-upgrade catalog and privilege parity | PASS on physically distinct databases |
| Business Partner canonical disposition | PASS: all 39 relations classified |
| Seed contract lint | PASS: 72 files; 22 unchanged pre-contract files baseline-bound |
| Database TypeScript typecheck | PASS |
| Hermetic database suite | PASS: 223/223 |
| Archetype verifier | PASS: 147 tables across 6 canonical files |
| Platform catalog verifier | PASS: Studio, NEON and MESH |
| Common audit contract | PASS: 70 checks |
| Forced-RLS behavioral probe | PASS on all three disposable planes |
| Notification fixtures | PASS on all three disposable planes |
| NEON Business Partner fixtures | PASS: 71 partners |
| MESH list fixtures and exact replay | PASS: 49 relationships, including repeat execution |
| Business Partner S4 certification | PASS |
| Business Partner S5 security/concurrency/atomicity certification | PASS |
| NEON authorization promotion | PASS: 43 qualified, zero blockers |

The disposable clean and upgrade PostgreSQL containers were isolated from shared development, QA, IAM and external services.

## Deliberate fail-closed governance backlog

These are not executable defects and were not auto-approved:

1. MESH promotion has 18 operations awaiting qualification decisions. Its non-strict report correctly returns `ready=false`; its release gate remains blocked.
2. Physical authorization review remains incomplete: NEON has 257 pending tables and MESH has 56 pending tables.
3. The authorization release report still identifies operation-binding and application permission-demand review. Runtime roles/grants remain at the intentional zero-grant quarantine baseline.

The release checker now distinguishes static construction from live certification, includes double-apply in the live command, and reports these blockers honestly. A release must not bypass them by fabricating approvals or broad grants.

## Start condition for the governed BP journey

The database foundation is safe to use for the next design/build wave. Any feature that publishes new runtime permissions must remain disabled until the relevant inventory rows, MESH operation qualifications and application permission demands receive accountable review and the strict authorization release gate passes.
