# Business Partner 360 P0 integration baseline evidence

**Status:** Technical baseline established; organizational approval pending  
**Captured:** 2026-08-30  
**Source branch:** `stack-v2-foundation`  
**Source HEAD:** `9c5b0d53c4f3b82904fc86ff5ffab7e87e728706`

## Technical review

The BS360-00 contract, authority/sensitivity ledger, permission reference, risk exclusion, compatibility plan, STUDIO descriptor and acceptance-family definition were reviewed against their executable contracts and fresh-database behavior.

Technical result: **pass with corrections**.

The fresh build identified and corrected three baseline blockers:

1. orphaned partial-index predicates in `common/master/06_indexes.sql` made fresh desired-state builds invalid;
2. a PL/pgSQL `RAISE` statement in `common/master/07_functions.sql` used an invalid extra positional parameter instead of `USING ERRCODE`;
3. feature code `neon.business_partner.360` violated the canonical dotted-code grammar, so the contract was consistently changed to `neon.business_partner.view_360` without weakening the catalog constraint.

Risk-negative contract and fixture scans pass. The feature remains active in the catalog but dark at `rollout_pct = 0`. The compatibility aggregate remains installed.

This technical result is not organizational approval. The following sign-offs remain required and are represented separately in the machine-readable [P0 approval packet](./evidence/business-partner-360-p0-approvals.json):

| Approval | Status |
| --- | --- |
| Business/data owner | Pending |
| Architecture/contract owner | Pending |
| Release owner | Pending |
| Integration baseline owner | Pending |
| Master-data materialization/legacy-policy owner | Pending |
| Independent security owner | Pending |
| Independent privacy/data-protection owner | Pending |

The evaluator validates exact gate cardinality, durable evidence references,
approval actor/timestamp/reference syntax, and distinct security and privacy
approvers. It also rejects security/privacy approval while authenticated
browser leakage evidence remains pending. The current packet has no structural
errors, but correctly returns `p0Closed: false`, one pending technical evidence
item and seven pending accountable approvals.

## Source baseline

The user worktree was not committed because it contains a broad set of existing modified and untracked files. Instead, it is sealed by a deterministic content baseline over every changed/untracked file except this evidence document.

| Coordinate | Value |
| --- | --- |
| Git HEAD | `9c5b0d53c4f3b82904fc86ff5ffab7e87e728706` |
| Changed/untracked/deleted entries covered | `264` |
| Worktree content SHA-256 | `f726b383c26e5775a10e322fd31aa0cdf98afa3678930588cbdc51ecf10174e2` |
| Contract-lock SHA-256 | `bc8c9447f779c391a8ebc7344074b886e1cc27894cb42e4af0296eff6a60a0e0` |
| v1 contract SHA-256 | `71cb64121910f3f3a97becd955ab4102d084945941c3e14df3c35973860540e3` |
| Permission reference SHA-256 | `f4971de925f5546eef722730aa0f34a8a0b8fe92302448fbfe6a06ce065952c7` |
| STUDIO definition SHA-256 | `5535c4937d6b3c92f8568f26860d86d4a3b8267e743f1b38a2f7f309ab08f523` |
| Disposable manifest runner SHA-256 | `3dd6f8d3d8c1e906e438dd8ee4b3f168d8917159358d04b0867a954063237848` |
| Acceptance fixture runner SHA-256 | `a9e67ff937548b61340ee46ccde6c0e4abdfa3578b4da97d114f76e2552ad267` |
| Production-repository materialization runner SHA-256 | `d1e3cc5988d7a429b285bf92ae692ca1d51dbd5c59bf498122d88264d2cc4d8d` |
| Retained materialization evidence SHA-256 | `05de7f7f655f06798d17e092565d42767f67854de21f451259a0a3820ebe35ab` |
| P0 approval evaluator SHA-256 | `8d4256c21deeb52b4374926a5083844101854e9956a46ebee43042873b6dd66f` |
| P0 approval packet SHA-256 | `b1870c0d73dc3b2cf011596817063d6cf4a91f78bdfa4f890a65293d4c75e228` |

The baseline hash is computed from sorted records in the form `status NUL path NUL file-sha256 newline`, using `git status --porcelain=v1 -z --untracked-files=all`. Deleted paths use the SHA-256 of empty bytes. This evidence document itself is excluded to avoid a self-referential digest.

## Disposable environment

No shared development or production database was modified.

| Resource | Value |
| --- | --- |
| Container | `athyper-bs360-baseline-db` |
| Container label | `athyper.environment=disposable_local` |
| Purpose label | `athyper.purpose=business-partner-360-integration-baseline` |
| Persistent volume | `athyper-bs360-baseline-pgdata` |
| Local endpoint | `127.0.0.1:55432` |
| PostgreSQL image | `postgres:16.13-bookworm` |

The reusable Linux manifest runner refuses containers outside the `athyper-bs360-*` namespace and requires both disposable labels plus an explicit confirmation token.

### Desired-state manifest evidence

| Plane | Files | Manifest SHA-256 | Expanded file-set SHA-256 | Applied at UTC |
| --- | ---: | --- | --- | --- |
| Studio | 227 | `12dca7565bc5549ec4bd9f899be004ab79106deba4b455b363bccf6b90e845f5` | `46547964b8e26cf687e6bfd758ac46ec4544776106cf59b294fd6b21c5e49af3` | 2026-08-30T04:00:22.810Z |
| NEON | 214 | `925d0233f31aaf1590672c95d934922bd1d2422fcccbb1167fcea11e89836f3f` | `fd81820cd67df6f872cf8fd4c040c9f745a557c7a4e2e984b25a340636dc8683` | 2026-08-30T03:58:50.267Z |
| MESH | 203 | `1da6fedad1f6a4b3889ba5443670401340ab7d3964eca7895403260b75f5ae0a` | `9983650ea1df64ad27ea0b726e3c2a6cf741cd538488b40c4483ab01e21d5f94` | 2026-08-30T03:59:33.047Z |

Three-plane manifest version `2.0.2` was applied with manifest SHA-256 `1dedeb4c5f5b3e355da81e9da498a91c1e87118c876d5ce6a3c62883e1164d4e`. Immutable Studio receipt: `da0bd571-31e3-41f2-9890-622861dd1ea8`. Keycloak reconciliation was deliberately skipped; this baseline qualifies database and authorization-context integration, not IAM-provider deployment.

Stored disposable schema fingerprints:

| Plane | Fingerprint SHA-256 |
| --- | --- |
| Studio | `bf1477375d5dd09cf7da011e054ffca42ec924ad8568ce5b088fdbdf152c8fa4` |
| NEON | `2ce281b20e6b47a7c9cbf58a896d90f6e14a326bc1a43fa9d3f1b08314c0e502` |
| MESH | `c37d8e993472728a0707c8b757f272de89c4a7dd28ce2fce8fab9614691b0610` |

## Migration evidence

The following forward migrations were applied to the fresh NEON desired-state database:

| Migration | SHA-256 | Result |
| --- | --- | --- |
| `20260830_neon_business_partner_typed_request_extensions.sql` | `8da840a01e0015afcaab4a91c600a58fc47ef19f22f73aa52857611b6d8ff16d` | Applied; eight typed/evidence tables present |
| `20260830_neon_business_partner_360_release_indexes.sql` | `12b061c971f63f8a7ff7402552c6711cca89199959c9e56bea2f9d249bfea663` | Applied idempotently; three release indexes present |

Database assertions returned `typed_tables=8`, `release_indexes=3`, `feature_dark=1`, and `risk_keys=0`.

## Acceptance fixtures

Fixture pack `business-partner-360.acceptance.v1` was applied twice with identical deterministic coordinates.

| Family | Business Partner ID | Evidence |
| --- | --- | --- |
| Organization | `ef0b4270-c6ad-543d-9f75-d5b742b5730e` | Organization identity with no commercial/workforce role |
| Supplier | `780ea749-0b4a-52e9-985e-734c90146445` | Supplier role and procurement organization assignment |
| Customer | `06a72735-8e10-56b2-9995-7de169c88aa5` | Customer role and customer-compatible organization assignment |
| Dual role | `7d983581-d417-5c4e-bc86-2308fde4789b` | Independent supplier and customer roles/assignments |
| Person/workforce | `32f74897-5164-5ae4-a34e-6b3fcd4f52a9` | Person, employee and effective employment |
| External worker | `b7be168e-6282-5f1d-9ec0-5e4e13067f21` | Person and independent external-worker role |
| MESH-linked | `7a580475-57dd-5a78-8357-40b8f76491be` | Supplier plus received snapshot, local projection and account link backed by a MESH relationship coordinate |

The fixture pack contains no sensitive person profile or risk field family.

## Verification results

- Studio contexts: 28 of 28; application projections: 3.
- NEON contexts: 151 of 151; application projections: 3.
- MESH contexts: 54 of 54; application projections: 3.
- Database/static suite: 189 tests passed.
- DDL model: all three manifests and authorization checks passed.
- Master-data contracts: typecheck and 10 tests passed.
- Master-data services: typecheck and 79 tests passed.
- NEON Business Partner UI: typecheck and 30 tests passed.
- Fixture replay: seven families retained identical IDs.

## P0 decision

The reproducible technical integration baseline is established. The production-repository typed materialization and explicit legacy-read-policy probes also pass with rollback-only evidence. P0 remains **approval pending**, not fully closed, until authenticated browser leakage evidence is retained and all seven named accountable approvals are recorded in the P0 packet.
