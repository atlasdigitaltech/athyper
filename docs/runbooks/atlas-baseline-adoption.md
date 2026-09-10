# Tenant baseline adoption and initial AI publication

The DEV CirrusAtlantic Neon BP baseline was adopted into Studio on 2026-09-10.
Import ID: `5ca0968a-f81f-42b4-8333-dd54c1b02cbb`.
The imported source is release **17** under
`metadata.entity.business_partner.local-master-data.cirrusatlantic`.

The application bridge is deployed to the DEV API and worker. On 2026-09-10,
`catl.admin` authored and published the AI change after independent authenticated
approval by `catl.owner`. Native Studio release **1** maps to runtime release **18**,
ID `126721f6-a2e5-45e2-91bf-0d6a1b660c56`. Neon verified the Ed25519 signature and
activated it; Studio's authenticated activation confirmation returned HTTP 200
with generation 18. Release 17 is retained as superseded.

The verification receipt is
[`cirrus-baseline-roundtrip.verified.json`](../examples/atlas-f5/cirrus-baseline-roundtrip.verified.json).
It records image digests and health, actual reviewer/publisher IDs, signature
verification evidence and exact contract/non-AI preservation. The global BP
publication remains release 25. Full authenticated action history, including
resolved failed attempts, is in `cirrus-baseline-authenticated-publication.json`.

The import is an immutable `metadata.entity_baseline_import` record. It retains
the original contract, descriptor, release and activation coordinates, source
hashes, source signature and observed provenance. The import's canonical content
hash is separate from the original hashes. The original development signature is
recorded as unverified by this importer. No historical approval or Studio release
was fabricated. The import does not change entity classifications or role grants.

## Operator adoption

From the repository root, with access to the DEV database container:

```sh
node tooling/scripts/verification/adopt-atlas-neon-baseline.mjs
node tooling/scripts/verification/adopt-atlas-neon-baseline.mjs --apply
pnpm exec tsx tooling/scripts/verification/prepare-atlas-initial-publication.mts
```

The first command is a complete transaction rehearsal that rolls back. Apply is
restricted to DEV CirrusAtlantic and the recorded BP publication coordinate.
It locks the selected Neon contract, descriptor, applied release and activation
head through the Studio commit. Missing, changed, conflicting or revoked baselines
fail closed. Repeating adoption with identical content returns the same import.
The Studio migration is recorded with its exact checksum in the existing forward
migration ledger, in the same transaction as adoption.

The applied receipt is `docs/examples/atlas-f5/cirrus-baseline-adoption.applied.json`.
The source capture is `cirrus-baseline-import.json` in the same directory. These
contain metadata and provenance, not BP record data or browser credentials.

## Initial publication workflow

The source implementation is in `baseline-publication.ts`, the Studio host
composition and the publication worker/loader. It uses the ordinary authenticated
authoring, validation, submission and independent approval flow. It does not grant
permissions or expose an alternate approval endpoint.

1. Deploy the qualified host/worker changes and apply the Neon forward migration
   `20260910_baseline_activation_precondition.sql`. The source-current check refuses
   initial publication until the activation trigger is enabled. These changes are
   now deployed in DEV; adoption alone does not deploy them.
2. Prepare a native AI authoring graph for the selected Studio entity. Its single
   AI surface must include both `layoutConfig.ai` and the exact
   `layoutConfig.baselineImport` marker from
   `docs/examples/atlas-f5/cirrus-initial-ai-publication-plan.json`.
   The marker binds import ID, imported source entity ID, import content hash and
   proposed runtime descriptor hash. Native graph fields/search bindings must
   support the AI references and pass the ordinary graph validator. The runtime
   descriptor in the review packet is **not** a native graph replacement payload.
3. `catl.admin` authors, validates, tests and submits. `catl.owner` reviews the
   actual change independently. The bridge requires the recorded reviewer to
   differ from the author and submitter; it preserves the reviewer on publication.
4. Publish to Neon. The bridge checks the active source again, compiles the AI delta
   against the imported runtime fields and operations, and checks the reviewed
   candidate hash. The original contract and every non-AI descriptor property are
   preserved. An existing successor blocks another initial publication.
5. The first genuine native Studio release remains number 1 for that Studio
   entity. `publication.entity_baseline_release_link` explicitly links it to the
   imported predecessor and runtime publication number 18. The worker uses the
   original source entity ID and tenant-specific publication key. This separation
   avoids inventing native Studio releases 1–17 or overwriting the global BP key.
6. The worker signs the actual preserved contract and complete new envelope with
   the configured Ed25519 signer. The verified loader checks both signatures,
   canonical content hashes and runtime descriptor references. The signed manifest
   includes the expected activation head. Neon checks the head ID, version, release
   number and artifact hash atomically during activation; a changed baseline
   rejects activation. Generation lookup uses the publication key and runtime
   sequence from the publication record.

The review packet was executed as release 18, changes only `ai`, and retains the
original descriptor as the rollback payload. Approval and signatures belong to
the native release and publication evidence, not the import or review packet.

The deployment also includes narrow database functions for approved baseline
materialization, scoped worker compilation reads and acknowledged activation
confirmation. General API snapshot writes and arbitrary publication outbox
emission remain denied. The host uses tenant transactions for activation reads
and generation-event confirmation. The reviewer gate checks actual change-set
author/submitter/reviewer evidence while retaining normal grant, deny and MFA checks.

A delivery failure exposed stable operation-binding IDs being reused as projection
primary keys. `20260910_operation_projection_release_identity.sql` gives internal
projection rows deterministic IDs scoped to the applied release; signed source
IDs and permissions are preserved. After this migration, the exact failed apply
job was operationally retried with its original tenant/deployment coordinate and
existing approval. No replacement approval or descriptor was introduced.

Applied Studio follow-up migrations: `20260910_baseline_publication_locking.sql`,
`20260910_baseline_publication_materializer.sql`,
`20260910_baseline_compilation_source.sql`, and
`20260910_metadata_activation_confirmation.sql`. Neon received the activation
precondition and operation projection identity migrations. Each applied migration
has its exact checksum recorded in the database ledger.

Read-only verification can be repeated with:

```sh
node tooling/scripts/verification/verify-atlas-baseline-roundtrip.mjs
```

Do not rerun graph staging or initial publication for this consumed baseline.

## Rollback

For a future **unused** import, rehearse revocation with its import ID:

```sh
node tooling/scripts/verification/adopt-atlas-neon-baseline.mjs \
  --rollback 'UNUSED_IMPORT_UUID'
```

Add `--apply` to commit revocation. This records an immutable revocation and blocks
further use; it retains the import evidence and leaves Neon unchanged. A revoked
import cannot be silently re-adopted. Once linked to a publication, import
revocation is refused: runtime rollback must be a separately reviewed publication
using the retained rollback payload and a fresh head precondition. Import rollback
does not claim to undo an activated release.

The current import is consumed and cannot be revoked. Restore the retained
original descriptor through a separately authored, independently reviewed forward
release with a precondition against the current head. Do not reset the head to
release 17 or delete approval/history rows. Runtime rollback was not performed.

Previous API/worker image and Compose rollback specifications are retained in the
owner-only directory `~/.athyper/instances/dev/deployments/atlas-baseline-bridge-20260910/`
under each process's `rollback.json`. These private files contain deployment
configuration and must not be committed or printed. Application rollback does not
reverse the published metadata or database migrations.

## Validation evidence

- 16 Node model tests: scope, head races, same-release mutation, payload integrity,
  deterministic hashing and exact AI/rollback preservation.
- Studio authoring suite: 33 tests passed, including imported AI reference checks.
- Publication suite: 144 tests passed, including real Ed25519 artifact verification,
  invalid inner signatures and invalid AI field references.
- Host authoring policy: 10 tests passed; host TypeScript check passed.
- Live PostgreSQL projection regression: successive release coexists, original
  operation semantics remain intact, and repeat staging is idempotent (10 operations).
- Live API database-role checks: general snapshot/event privileges denied,
  unreviewed payload rejected, unacknowledged plane rejected and cross-tenant
  materialization/confirmation rejected. Valid confirmation fixture rolled back.
- PostgreSQL qualification: immutable rows, tenant RLS, denied API writes, import
  revocation, accepted current activation head and rejected stale head. All
  qualification mutations rolled back; see `cirrus-baseline-qualification.json`.
- Repeated adoption returned the existing import; revocation rehearsal rolled back.

This work does not upload attachments or enable retrieval. Those steps follow
reviewed publication and runtime admission qualification.
