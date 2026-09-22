# DEVFULL integration checkpoint — 2026-09-21

**The native DEVFULL intake release is now signed, activated in Neon, and
acknowledged in Studio using workload approval.** The separate 113-artifact
compiled package and its authenticated browser journeys remain incomplete.

## Current DEVFULL workload publication result

[Verified activation evidence](devfull-runtime-activation.json) ties source release
`7bdb29f6-6b01-4385-867d-06357504f6ca` to signed artifact
`4294242d-8348-404b-a685-5a5f22085b69`, activated deployment
`01a0c34c-e68c-7613-b3c4-ba3fc01f78a5`, and Neon applied release
`01a0c34f-4e80-7acd-9b88-020244be18b5`. The artifact, active head and Studio
acknowledgement share hash
`654c378b5336674cc7c4f827a77a0c497408f379fdcc5ee9348bba7d824c51e3`.
The active native descriptor contains 19 intake surfaces and one flow.
The separate authority release lifecycle row still says `approved`; deployment
activation and its acknowledgement are independently verified above.

Routine publication for this explicitly qualified DEVFULL workload does **not**
require `catl.owner` or `catl.admin` MFA receipts. The new adapter uses durable
workload maker/checker audit records, fresh principal epochs, an exact release
coordinate, a 24-hour qualification pin, and unchanged build/test/source evidence.
It preserves real runtime registration qualification, Ed25519 signing, artifact
verification, and a final authority recheck before activation/acknowledgement.
Human review adapters and business-request approvals were not replaced.

Qualification passed 110 build tasks and 786 tests; 25 integration tests were
skipped. Evidence and the 468 checked file hashes are in
[runtime-workload-v4](runtime-workload-v4/qualification.json). Earlier workload
qualification directories are superseded and were not used for this signature.
The machine qualification is deliberately narrow: it does not publish the 129
outstanding provider references of the separate compiled package.

Activation exposed a missing, already-canonical entity-code identity upgrade in
DEV Neon. Runtime metadata was backed up, the existing upgrade was rehearsed
inside a transaction and rolled back, then applied without deleting records.
See [rehearsal](runtime-identity-rehearsal.log) and
[application](runtime-identity-upgrade.log). The legacy native BP head remains
separate. API, worker and scheduler are healthy. QA/STG/PROD were not changed.

The sections below retain the earlier integration work and historical handoff.
Their human-MFA blocker has been superseded for the scoped DEVFULL workload.

## Completed

- Full workspace build: **110/110 tasks successful** (66 cached).
- Eight backend packages: **1,691 tests passed**, 29 skipped; publication CLI:
  two tests passed. All eight package typechecks passed.
- Metadata authoring validation: 113 artifacts; layout validation: 132 relocated
  files and 114 entity JSON files. Migration inventory and diff whitespace checks
  passed.
- Reconciled two published BP read permissions missing from the review registry.
- Fixed optional BP composition preventing metadata-only Records hosts from
  starting. BP request handlers continue to fail closed without their descriptor.
- Fixed publication test typechecking: canonicalizer package dependency, typed
  immutable-store input, and an optional workflow-stage access.
- Created explicit Studio capability and Neon collaboration upgrade scripts,
  including graph guards and parent-audience mention/reaction policies. The first
  restored-copy fixture caught the missing audience policies before DEV application.
- Backed up DEV Studio and Neon outside Git, restored both to a disposable
  PostgreSQL container, and rehearsed the final SQL against those restored copies.
- Passed real database fixtures for persisted capability compilation/signature
  verification/local activation, revision concurrency/privacy/rollback, and
  concurrent draft expiry/attachment retention. Fixture fixes provide database
  plane context and correctly remap a synthetic entity's attachment binding.
- Applied the exact rehearsed SQL to DEV Studio and Neon. Catalog postflight
  passed; existing tracked record counts were preserved, including 162 attachments.

The disposable signed capability proof uses a synthetic entity and test key; it
is **not** a signature or activation receipt for the Business Partner release.
See [schema receipt](schema-activation.json), [verification totals](verification.json),
and [unchanged Neon release heads](unchanged-neon-release-heads.json).

## Earlier publication checkpoint (superseded for native activation)

The native intake prerequisite has now been published through DEV workload
maker/checker authoring as native release **3**, ID
`7bdb29f6-6b01-4385-867d-06357504f6ca`. Its native signature is present.
The separate publication authority is still `approved`: it has **zero runtime
artifacts and zero deployments**, so this is not Neon activation.
[Exact source and catalog](native-intake-exact-release.json) records the boundary.
A repeat dry run returns `unchanged`; no duplicate release is created.

The generic `request_intake` provider is composed into the authenticated host.
It checks published descriptor/flow/answer coordinates and saved-request access,
forwards optimistic concurrency, maps commands through the owning request service,
and uses the existing protected-value port. Preview does not create protected
secrets. Unsupported discard/undo fail explicitly. Shared browser/server profile
mapping remains covered by its existing tests. The running API rejects an
unauthenticated valid intake request with 401. Authenticated end-to-end journeys
remain unqualified against the pending release.

The [complete compiled review](compiled-review/compilation.json) now contains
**113 artifacts** and matching compiler-derived hashes. It passes metadata
validation. It remains explicitly unsigned review-only. The
[readiness output](compiled-release-blockers.txt) no longer reports missing
artifacts or mismatched hashes; it still requires approval, signature, and
published evidence for the referenced provider registrations. Intake provider
composition alone does not qualify every handler, renderer, resolver or evaluator
referenced by the complete package.

The [review page](https://neon.dev.athyper.test/mdg/operation-review) serves the
exact new release packet: 42 included operations and nine explicit deferrals.
That earlier human-review path required fresh MFA-authenticated decisions from
`catl.owner` and `catl.admin`; the DEVFULL workload now uses the separate machine
approval path described above. No receipts were fabricated or reused. Packet v1
is superseded by `business-partner-intake-runtime-workflow-v2.dev.json`; its
revision and expiration are in [current status](publication-completion.json).
The review app returns 401 anonymously and its page returns 200.

This gate is enforced by
`server/packages/services/publication/src/authenticated-entity-release-review.ts`:
it validates exact coordinate/evidence hashes, two independent authenticated
receipts, elevated assurance, expiry, and current reviewer authority. The worker
reported `Publication review missing, expired or unauthorized` before compilation.
After actual decisions, the prepared
`tooling/scripts/verification/seal-business-partner-intake-review.mjs` can seal
receipts; the worker must then pin that seal, recheck authority, and retry native
compilation/signing. Complete provider qualification and signed compiled-envelope
publication must follow, with activation receipts and authenticated journey tests.

The follow-up full build passed **110/110 tasks** (69 cached; [log](publication-build.log)).
The follow-up checks passed **854 tests** with **25 integration tests skipped**,
plus host/master-data/Studio/party typechecks, schema postflight, and migration
layout checks. The explicit workload audit contract upgrade was registered in the
migration inventory and applied to DEV Studio. See
[follow-up status](publication-completion.json) and the accompanying logs.

The DEV API and isolated review application were restarted, and the DEV gateway
was configured to route the review page. Gateway rollback uses the existing
owner-only compose file
`~/.athyper/deployments/infra-remediation-20260912/athyper-dev-gateway-1.next.private.json`.
The active gateway review configuration is
`~/.athyper/instances/dev/deployments/bp-intake-review-v2-20260921/gateway.review.private.json`.
QA/STG/PROD were unchanged. Existing working-tree work was retained; no commit,
merge or push was made. The integrated release is **not yet complete**.

## Reproduction and recovery

```sh
pnpm build
python3 tooling/scripts/metadata/validate.py
python3 tooling/scripts/metadata/verify_bp_release_schema.py --container athyper-dev-db-1
pnpm --dir server/db db:verify:migration-layout
pnpm dev:publish --intake-prerequisite --dry-run
```

The last command now returns `unchanged` for native release 3. Upgrade SQL and rehearsal instructions are in
`server/db/scripts/operations/upgrades/bp-integration-20260921/`.
Owner-only database backups remain under
`~/.athyper/backups/bp-integration-20260921/`. Do not restore over a live database
without a separate recovery decision; these additive upgrades preserve the old
release's columns. The disposable rehearsal container is removed after evidence
capture.
