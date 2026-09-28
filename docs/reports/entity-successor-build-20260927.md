# Entity successor build — 2026-09-27

## Actual progress

| Step | Status |
| --- | --- |
| Baseline | Captured authoring/publication/snapshot coordinates, independent target heads and hashes of overlapping working files. |
| Versioned policy | Strict, detached/immutable DEV-only successor contract and exact target-head comparator implemented and tested. Not connected to enrollment or activation yet. |
| Fresh source | Persisted one draft, linked to the predecessor at INSERT time; idempotent preparation verified. |
| Independent enrollment | Not performed. The existing endpoint still accepts only the existing onboarding policy. |
| Guarded successor release | Not implemented. Existing first-release restrictions remain. |
| Compile/deploy successor | Not performed. No signed successor or activation receipt exists. |
| Acceptance | Not performed. Country remains unavailable pending a real successor. |

## Evidence

- [Read-only baseline](entity-successor-baseline-20260927.json), captured before edits to overlapping implementation files.
- [Persistent draft receipt](entity-successor-draft-20260927.json).
- New change set: `f1135ec8-d2f9-4a90-ac3a-b28b0ca97c45`.
- Base authoring release: `1efcf86a-75e3-4a79-9154-ea62f5abdc7d`.
- Status `draft`, submitter/approver NULL, authoring release count for this change set **0**.
- Canonical graph hash: `6d79253f39802ec1d9bbb01ce676b1b7d6dc2ab3e8a8e834167b0e36cd408fc2`.
- Compiler descriptor hash: `bb718be97e682356579c0c175f2c13e0cf54a5450f3bfb1b915f7d8f97c9e048`.

These local files are diagnostic receipts, not immutable approval evidence. The
baseline is sequential read-only snapshots, not a cross-database atomic snapshot.
Pins still need checking under source/allocation and target/activation locks.

## Implemented ownership boundaries

- `server/packages/contracts/publication/src/policy/entity-successor-policy.ts`:
  `athyper.dev-entity-successor-policy/1`, separate from the existing onboarding
  contract. Pins authority tenant, fresh source, distinct workload actors,
  authoring and publication predecessors, compiler name/version/build hash,
  exact target instance/environment and each applied-release/head version/hash.
  Parsing supplies no authority. The comparator is not itself a deployed CAS gate.
- `server/packages/planes/studio/meta-entity-authoring/src/publication/prepare-successor.ts`:
  trusted, draft-only preparation from a persisted approved predecessor; source
  and authority checked before cloning. Same source-release lock namespace as
  release allocation. Fresh internal graph IDs, preserved external dependencies.
- Existing authoring repository/port: optional explicit base-release pin, checked
  for the same entity/tenant and current published head, set during insertion.
  No immutable ancestry UPDATE or widened RLS policy.
- `server/db/scripts/operations/publication/capture-dev-publication-baseline.mjs`:
  generic DEV read-only inventory and overlapping-file fingerprints.
- `server/db/scripts/operations/publication/prepare-dev-entity-successor.ts`:
  explicit DEV maintenance command; default rolled-back rehearsal, confirmation
  required to persist. Uses the real maintenance principal, not either human's
  identity or a fabricated approval. Checks target heads, source pins, replay
  identity and stale-predecessor rejection.

No entity-name branch, product-specific service, permission grant, approval,
signing operation or activation shortcut was introduced. First-release workflow,
machine enrollment and restricted release-creation commands remain unchanged.

## Two rehearsal findings

1. Stored snapshot contract hashes use PostgreSQL `jsonb::text` SHA-256; compiler
   graph hashes use the compiler's canonicalization. The initial implementation
   incorrectly compared those domains. The source query now verifies stored
   hashes using `snapshot.fn_compute_entity_contract_hash`, its original domain.
   Historical stored hash `5504c45b...` independently reproduces; compiler hash
   `a9d1b213...` is different without implying corruption. No hash was rewritten.
2. The database correctly forbids changing a draft's base release after creation.
   The initial rehearsal rolled back when it attempted that sequence. Corrected
   repository insertion carries the explicit, validated base from the outset.

The corrected rehearsal succeeded, including replay idempotency and denial of
a changed predecessor hash. Only after that was the fresh draft committed.

## Verification

- Publication contracts: typecheck clean, **122 tests passed**.
- Studio authoring: typecheck clean, **188 tests passed**.
- Publication service: **331 tests passed**.
- Host: **676 passed, 25 skipped**; source typecheck still has only the known
  gated preflight repository import error.
- Real DEV preparation rehearsal passed; persistent draft subsequently read
  back with exact base, no submitter/approver and zero releases.
- Script syntax and `git diff --check` passed.

Repeat draft preparation without creating another source:

```sh
pnpm --filter @athyper/server-db exec tsx \
  scripts/operations/publication/prepare-dev-entity-successor.ts \
  --baseline=/home/chandravel_natarajan/src/athyper/docs/reports/entity-successor-baseline-20260927.json \
  --request=aa2737dc-8f61-4195-9d7c-7b512a7824f6 --check
```

## Next implementation boundary

Wire the distinct contract into independently authenticated proposal/activation,
without upgrading old onboarding enrollment. Add predecessor-pinned release
allocation commands and actual target-head checks under activation locks. Bind
the measured compiler build and resulting artifact hashes into persisted/signed
evidence; do not invent the required compiler build hash to form an enrollment.
Then enroll through the two human actors, execute with workloads, and verify
each target. None of those remaining steps is satisfied by this draft receipt.
