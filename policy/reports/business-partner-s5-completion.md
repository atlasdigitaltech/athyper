# Business Partner S5 completion record

Recorded: 2026-09-03 (Asia/Kuala_Lumpur)

## Decision

S5 security and mutation ownership is certified closed. The clean canonical database and supported-baseline upgrade both pass the same live security, failure-mode, concurrency, atomicity, forced-RLS, tenant-FK, and privilege tests, and their normalized S0–S5 catalogs have zero drift.

## Evidence

- Formal matrix: `config/governance/business-partner-s5-role-permission-matrix.v1.json`
- Clean live certification: `policy/reports/business-partner-s5-live-certification.json`
- Upgrade live certification: `policy/reports/business-partner-s5-upgrade-live-certification.json`
- Clean-versus-upgrade parity: `policy/reports/business-partner-s0-s5-live-catalog-parity.json`

| Gate | Result |
| --- | ---: |
| Role/permission assertions across `athyperapp`, `athyperadmin`, object owners, and `PUBLIC` | 80/80 passed |
| Behavioral security and failure-mode probes | 17/17 passed |
| Lifecycle and decision concurrency races | 4/4 passed |
| Commit/rollback atomicity bundles | 2/2 passed |
| Forced-RLS governed tables | 10/10 passed |
| Tenant-FK governed tables | 10/10 passed |
| Normalized parity categories with drift | 0 |
| Business Partner foundation source tests | 72/72 passed |

The atomicity test verifies that projection state, immutable mutation evidence, audit evidence, and the outbox event all commit together. Its rollback case leaves the projection unchanged and creates no evidence, audit, or outbox row.

## Certification corrections

Live execution found and corrected these issues before closure:

1. The decision command's `RETURNS TABLE row_version` output conflicted with unqualified decision-table `row_version` expressions. The function now has a deterministic `plpgsql.variable_conflict=use_column` contract in canonical and upgrade DDL.
2. Mutation evidence was size-bounded but did not recursively reject protected identity keys. A command-owned insert trigger now uses the existing restricted-key classifier and is inaccessible to runtime, admin, and `PUBLIC` callers.
3. The upgrade path had two pre-existing normalized drifts: the S2 workforce lifecycle correction was absent from the manifest, and the S4 Business Partner normalizer still listed the compatibility alias cache. Both are now upgrade-owned and parity is zero.

## Reproduction

Run only against confirmed loopback disposable `athyper_neon` databases:

```sh
pnpm --dir server/db db:verify:neon:business-partner-s5 -- --neon-database-url=<loopback-url> --confirm=RUN-BP-S5-CERTIFICATION --output=policy/reports/business-partner-s5-live-certification.json
pnpm --dir server/db db:verify:business-partner-live-catalog-parity -- --clean-url=<clean-loopback-url> --upgrade-url=<upgrade-loopback-url> --json=../../policy/reports/business-partner-s0-s5-live-catalog-parity.json
```
