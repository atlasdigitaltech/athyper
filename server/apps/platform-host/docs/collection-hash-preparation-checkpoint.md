# Descriptor hash and collection preparation compatibility

Date: 2026-09-26.

Follow-up: history/tests-after-live-collection-preparation.txt records 16/16 passing
real PostgreSQL tests of the repository preparation/hash/transition functions
against minimal fixture tables. Container teardown confirmed. This closes the
bounded SQL preparation verification gate, not full-schema deployment or activation.

## Exact hash delta confirmed

The invoice fixture has no collection declaration. Its new descriptor includes
these five intentionally normalized empty governance arrays:

- changeCaseBindings
- operationContextRequirements
- fieldReferenceBindings
- materializationBindings
- materializationFieldMappings

The test now asserts each array is present and empty, asserts collectionCompilation
is absent, and hashes a copy with exactly those five keys removed. That reproduces
the original hash b95907f0dc3f6b3c2e90a6ed1bd2cbecdbf4540fae93abfe73416ec44e99356c.
The current descriptor hash is
bb8f34e8cc6817778c06ae40ebe999495ab0f794df2fc25e2800ad8d140bb332.
The source contract hash remains unchanged. This proves the stale expectation
was caused by cumulative governance-array additions, not collectionCompilation
emission and not a flaky test.

The new expected hash applies to newly compiled output only. No historical
artifact, contract hash, signature, release pin or active head was modified.
Recompiling an old graph is not equivalent to reading its immutable old artifact.
An old signed descriptor cannot be silently reinterpreted as the new shape;
preparation must reject mismatched hashes until a separately reviewed new release
exists. Existing signed-artifact reading/rollback logic was not changed here.

## Preparation compatibility work

- SQL preparation now recognizes all five arrays and compares them to the approved
  snapshot through its existing branch equality check.
- The read-only collection path rejects non-empty governance declarations in Studio,
  the shared publication compiler and SQL. This does not enable case workflows,
  materializers or reference hooks by dropping unsupported policy.
- The TypeScript preparation adapter additionally requires the persisted release
  contract hash to match the compiled snapshot, a nonempty persisted signature/key,
  and Ed25519. Existing artifact hash, descriptor equality, signature/key correspondence,
  independent review and target checks remain.
- New mocked-connection tests verify the exact prepared descriptor and reject changed
  persisted/artifact/descriptor hashes, empty signature, changed key/algorithm, and
  modified approved binding before calling database preparation.

These adapter tests do not execute PostgreSQL functions or cryptographically verify
signatures; signing/verification remains owned by existing publication controls.
DDL was edited but NOT deployed or live-tested. The existing BP/Neon-specific
preparation admission remains; generic activation and live rollback are not complete.
Case-contract behavior, preflight and authenticated release review are untouched.

## Fresh verification (separate commands)

| Package | Typecheck | Full test suite |
| --- | --- | --- |
| Studio meta-entity-authoring | Exit 0 | 36 files / 140 tests passed, exit 0 |
| Publication | Exit 0 | 33 files / 270 tests passed, exit 0 |
| Platform host | Exit 2: only known preflight missing repository export | 73 files passed, 2 skipped; 532 passed, 9 skipped, exit 0 |

Commands: pnpm --dir <package-directory> typecheck, then the separate test command.
Diff integrity passed. No live service, DDL deployment or product activation occurred.

The bounded disposable SQL preparation check is now complete (see follow-up above).
Next: review deployment against the complete schema/roles/triggers and signed
publication pipeline; the fixture run does not establish production readiness.
Generic multi-product activation requires an explicit replacement for the retained
BP/Neon admission guards; do not remove them merely to make another entity pass.
