# Database pre-change baseline — 2026-09-03

## Decision

**Status: NOT READY FOR NEW DATABASE ARCHITECTURE WORK**

The current Studio, NEON and MESH canonical DDL manifests provision successfully and the canonical authorization seed profile converges. However, the repository-wide database command surface is not yet internally consistent. Existing failing or misleading commands must be repaired or explicitly retired before this baseline can be called certified.

This report covers the current working tree on branch `stack-v2-foundation`, based on commit `29ec62fa115c776b907a0eba52c67745b6e94abb`. The working tree already contains substantial database changes; this is therefore a baseline of the current worktree, not a clean-commit certification.

## Isolated test environment

- Container: `athyper-bs360-prechange-20260903`
- Image/database: PostgreSQL 16.13, Debian build
- Label: `athyper.environment=disposable_local`
- Purpose label: `business-partner-360-integration-baseline`
- Databases: `athyper_studio`, `athyper_neon`, `athyper_mesh`
- Shared development and QA databases were not modified.
- Shared Keycloak/IAM and external services were not modified.

## Canonical DDL foundation result

All ordered files in the three current DDL manifests executed successfully on fresh databases.

| Plane | Manifest entries | Manifest SHA-256 | Result | Installed table parents |
| --- | ---: | --- | --- | ---: |
| Studio | 228 | `0eb3fb4c9653c5bda2a2af201dae8e4f35a36a144b6456ba9655809b965a4f9d` | PASS | 321 |
| NEON | 207 | `f46cc3f0b673f68ad3f6db88c56c60b80b59c3391bb970ce1628d07800a7b216` | PASS | 576 |
| MESH | 206 | `cb78946ce9ae4dbf38411f2f2aaa78edf8bcb6304adcefe40deeea35638613e8` | PASS | 290 |

Every DDL and migration manifest entry resolves to an existing file and no manifest contains a duplicate:

| Plane | Foundation entries | Migration entries | Missing | Duplicates |
| --- | ---: | ---: | ---: | ---: |
| Studio | 228 | 38 | 0 | 0 |
| NEON | 207 | 81 | 0 | 0 |
| MESH | 206 | 43 | 0 | 0 |

The migration manifests were statically reconciled but were not applied end-to-end. A versioned oldest-supported pre-migration database or dump is not present, so a valid upgrade-path execution cannot yet be constructed. Applying historical migrations to a database already built from final canonical DDL would not be valid upgrade evidence.

## Canonical seed result

The current three-plane seed manifest passed planning and repeated application:

- Contract: `athyper.three-plane-provision.v1`
- Manifest version: `2.0.2`
- Manifest SHA-256: `1dedeb4c5f5b3e355da81e9da498a91c1e87118c876d5ce6a3c62883e1164d4e`
- Studio: 28 assignments/contexts
- NEON: 151 assignments/contexts and 22 legal-entity resources
- MESH: 54 assignments/contexts and 46 network-account resources
- Context verification: exact match on all three planes
- Repeated application: PASS
- Plane ledger registrations: one immutable pack per plane
- Recorded seed executions during certification: six per plane
- Top-level three-plane receipts: two

Individual plane provision commands and individual authorization-pack application commands also passed for Studio, NEON and MESH.

## Passing checks

- TypeScript database package typecheck
- Hermetic database tests: 223/223
- Seed contract tests: 8/8
- Document foundation synchronization
- Three-plane DDL model contract
- Business Partner canonical DDL disposition/parity
- Identity-header command execution on all planes; no active descriptors existed before development runtime publication
- Forced-RLS catalog verification:
  - Studio: 232/232 tenant tables
  - NEON: 506/506 tenant tables
  - MESH: 207/207 tenant tables
- SECURITY DEFINER verification:
  - Studio: 75 functions, zero failures
  - NEON: 81 functions, zero failures
  - MESH: 85 functions, zero failures
- Studio field-security catalog consistency
- Authorization catalog, exact-scope and final-pack hashes
- Authorization seed contract lint: 72 files, including 22 baseline-bound pre-contract files
- Shared-reference contract: 15 payloads across all three manifests
- Authorization pack double-apply/idempotency verification
- Development Studio Entity list fixtures
- Studio and MESH development runtime publication commands
- NEON Business Partner runtime publication command
- Business Partner S4 live certification
- Business Partner S5 role, negative, concurrency and atomicity certification
- Business Partner request materialization and exact-replay certification

## Blocking command defects

### Runner and evidence defects

1. `db:foundation:plan` and the primary foundation commands require `powershell`, which is unavailable in the Linux environment. The TypeScript disposable runner works, but the supported package commands are not portable.
2. `public.schema_provisions` exists but has zero rows on every successfully built database. The foundation runners do not write per-manifest receipts.
3. No oldest-supported baseline artifact is available for executing the 38 Studio, 81 NEON and 43 MESH forward migrations and proving clean-versus-upgrade parity.
4. The live Business Partner parity checker accepts the same database URL as both clean and upgrade inputs, allowing invalid evidence to pass.

### Stale or missing seed inputs

1. `db:seed:meta-entity:check` references missing active `seed/meta-entity/pack.v1.json`.
2. `db:seed:blueprints:check` references missing `seed/blueprints/universal/010_spend_taxonomy`.
3. `db:verify:blueprint-packs` references missing `seed/packs/blueprints-v2/pack-ledger.v1.json`.
4. NEON inventory strict check expects 290 tables but discovers 302.
5. MESH inventory strict check expects 82 tables but discovers 65.
6. NEON promotion artifacts are stale or missing.
7. MESH promotion remains blocked by 18 unqualified operations.

### Verifier defects

1. `db:verify:archetypes` checks legacy nonexistent directories, examines zero files, prints errors, and incorrectly exits successfully.
2. `db:verify:platform-catalog` targets nonexistent `ddl/planes/athyper/_manifest.txt`.
3. `db:verify:audit-contract` fails the IAM seed-coverage and Alloy metadata assertions.
4. `db:verify:authorization:release` in strict static mode cannot pass while its live double-apply gate is `not_run`.
5. `db:verify:authorization:release:live` likewise fails because the double-apply gate is not part of that command; the separate idempotency command passes.
6. Three-plane behavioral RLS expects a seeded role for every tenant, while the current clean-slate pack intentionally has zero role grants; it fails at `studio/authz.role`.
7. The MESH authorization-quality report returns exit zero while its own report says `gate.passed=false`.
8. Strict database drift reports 152 runtime SQL references even when target and live URLs are identical.

### Fixture and integration drift

1. MESH phase-1 list fixtures use an `ON CONFLICT` target that no longer matches a unique/exclusion constraint (`42P10`).
2. NEON Business Partner fixtures directly create a self-approved qualification and now violate `business_partner_qualification_no_self_approval_chk` (`23514`).
3. Business Partner 360 acceptance fixtures consequently cannot find a required MESH relationship.
4. Business Partner 360 performance evidence cannot find its required fixture coordinates.
5. Notification acceptance expects an active global `control.owner_type(code='principal')`, which is absent on all three canonical builds.
6. Atlas conversation and tool RLS tests fail because the test role cannot execute `document.fn_is_atlas_conversation` (`42501`).
7. Effective-lock integration still references retired `control.entity_version`.
8. End-to-end cache invalidation still references retired `log.descriptor_cache_invalidation`.
9. Publication-repository integration cannot resolve `packages/contracts/publication/src/artifact.js`.
10. Both Business Partner profile SQL package commands require a host `psql` executable, which is not installed.
11. Unified Meta Entity audit expects retired/missing `control.v_meta_entity_contract_audit`.
12. NEON authorization-quality report expects missing `control.authorization_anomaly_disposition`.
13. NEON finance-FX report expects missing `control.payment_method_company_policy`.

## Deliberately excluded commands

The following are not part of an automatic pre-change database baseline and were not executed against shared environments:

- Keycloak reconciliation, because it mutates the shared IAM service.
- Rollout, observation-recording, clean-slate reset, repair, credential rotation and synchronization operations.
- Production/live reports without an explicitly approved production target.
- Generator/build commands that overwrite checked-in artifacts while the worktree contains existing user modifications. Their non-writing `--check` forms were used where available.
- Demo authorization commands beyond the isolated canonical three-plane seed profile.
- Performance/load execution whose required fixture provisioner failed.

These commands require an explicit disposable test scenario or operator-approved target; blindly executing every state-changing utility is not valid certification.

## Required closure order

1. Reconcile every `server/db/package.json` entry as supported, replaced, or retired.
2. Make foundation execution cross-platform and persist exact ordered DDL receipts.
3. Reconcile or retire missing meta-entity and blueprint seed packs.
4. Regenerate/review authorization inventories and promotion artifacts from the current canonical manifests.
5. Correct the fixture, RLS, Atlas and report contracts listed above.
6. Add a versioned oldest-supported database baseline and execute all three migration manifests twice where replay is supported.
7. Require distinct clean and upgrade databases in parity tools.
8. Rerun the complete clean, upgrade, seed, RLS, negative, concurrency and atomicity suite and publish a passing replacement for this report.

New Business Partner journey/case/snapshot DDL work must not begin until these baseline defects have an explicit disposition and the applicable release profile passes.
