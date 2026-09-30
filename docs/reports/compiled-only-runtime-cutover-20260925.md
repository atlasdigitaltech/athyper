# Compiled-only runtime cutover — 2026-09-25

Status: Athyper tenant adoption activated and compiled reader verified; **not fully cut over**.

## Direction correction

Native-plus-compiled paired adoption is no longer the target. There must be one
activated compiled release supplying the server query/authorization contract and
the UI Core, Operation, presentation and flow artifacts. Existing consumers may
retain the `EntityRuntimeDescriptor` DTO; that does not require a native table,
preview lookup, separately signed native artifact or separate activation head.

The DEV launcher rejects paired `--apply` with `PAIRED_NATIVE_ADOPTION_RETIRED`.
Its default candidate and supported `--apply` path are compiled-only.
Historical paired preflights remain available for diagnosis, not deployment.

## Implemented

- Added a server-only `runtime_contract` compiled member at `<entity>/runtime`.
  It declares Core/Operation dependencies and carries validated query, storage,
  presentation and authorization lowering output under the same release hash.
- The compiler accepts `runtimeContracts` lowering output and creates that member
  before hashing the release. Duplicate members and incompatible coordinates,
  storage, fields or overlapping permission definitions are rejected.
- The publication loader parses the server contract and qualifies its complete
  authorization bindings against the actual target runtime. A valid signature
  alone is not sufficient. Missing qualifiers or incompatible handlers fail.
- `createCompiledMetadataReader` resolves only admitted compiled releases and
  reads the server member from that pin. It does not query native descriptor rows,
  use local graph preview descriptors or cache a separate mutable descriptor head.
- Host composition shares its existing compiled reader with that MetadataReader.
  `METADATA_COMPILED_ONLY_PLANES=neon` selects this authority for **all** Neon
  MetadataReader consumers, not individual entities, pages or tabs. No fallback
  occurs on a missing compiled member. Other planes can remain on their existing
  authority during migration. The setting is deliberately not enabled in DEV yet.
- BP Core now explicitly names `master.business_partner_identity_current` as its
  read projection and includes `is_active` and `updated_at`. The old list contract
  used this view; treating its storage as the BP base table would be incorrect.
- A one-time migration tool builds a compiled-only candidate from the immutable
  reconciled descriptor and compiled baseline. The resulting candidate contains
  no standalone native descriptor or native publication member. Approvals are not
  inherited. This tool is not a substitute for Studio's normal authoring compiler.

## DEV evidence

Candidate: `b1fc1fdfae1e251e6197083cfae4631fd5b4261b7077cf7d12c25502984cef90`.
Review compiled release hash:
`sha256:ae163dbacd3fce817c8bfd193cdefd9386f8ad1a8fdd38cd86bda30fb9df74a0`.
Artifact count: 121. The earlier intermediate candidate was not activated.

```sh
pnpm exec tsx tooling/scripts/local-dev/prepare-bp-compiled-only-candidate.mts --write
pnpm exec tsx tooling/scripts/local-dev/deploy-bp-adoption.mts --check
```

Fresh signing promotes review members to published status, regenerates their
hashes and the release hash, and signs the complete envelope. This is qualification
only: the check does not store a durable approval or activate a release.

Actual target-host preflight:

```json
{
  "status": "qualified",
  "activationChanged": false,
  "readCatalogVerified": 21,
  "unresolvedOperations": [],
  "readyForApproval": true,
  "publicationMode": "compiled-only",
  "nativeArtifactCount": 0
}
```

Verification: metadata 75 tests; publication contract 45 tests; publication service
242 tests; host configuration 43 tests. Source/test typechecks passed for metadata,
publication contracts and publication service; host source typecheck passed.

## Required before claiming completion

1. Wire normal Studio MetaEntity lowering into the compiled compiler's
   `runtimeContracts` input. Later Studio publication must not omit this member
   or reconstruct it from a live native head.
2. Generalize the verified DEV single-release path into normal Studio emission
   and worker dispatch. The frozen candidate is Athyper-tenant scoped;
   it is **not** approval for a shared all-tenant baseline.
3. Inventory every Neon MetadataReader consumer/entity, including current preview
   consumers, and provide an executable compiled contract for each required root.
   Supporting child Core artifacts alone do not establish that coverage.
4. Activate the approved compiled baselines/adoptions, then enable the plane-wide
   switch. Verify CATL and Athyper list, record, context selection, protected
   values and governed operations. The new path has not had signed-in UI testing.
5. Remove legacy runtime reads/writers and preview descriptor admission after
   coverage and behavior are proven. Archive native publication evidence rather
   than dropping tables or historical releases during the transition.

## Follow-up implementation and live verification

The scoped DEV launcher now uses the standard `PublicationOrchestrator` for a
single compiled release. It persists the independent author/publisher approval,
fresh signed artifact, deployment and activation acknowledgement, reloads durable
object-store bytes, rechecks approval immediately before activation, and
invalidates the tenant's release cache. Historical paired candidates remain
check-only. Re-running `--apply` refuses duplicate candidates; `--check` verifies
the existing activation without creating another release.

Activated in Athyper only:

- Publication release: `1a47c9fc-9811-454f-80fd-fb120f881f86` (published).
- Deployment: `01a0d8a9-0355-7830-9f9e-2feef4fac148` (activated).
- Artifact kind: `compiled_entity_runtime`; no native artifact created.
- Outer artifact hash: `d1a0c72b6eb6415cc2e3cab7533d9892b9a9fa0b797dfb77eb85a1d8311209d9`.
- Published compiled release hash:
  `sha256:bb275438f86f3b85d82fd59eecb5f4b1dd0c987914710a676ffe074144de9d83`.
- Durable ledger confirms distinct author and approving/publishing principal.

Post-activation verification initially exposed a real fragment-read RLS bug:
release resolution stamped tenant context, but artifact reads did not. Fragment
reads now carry the admitted tenant/actor/plane, use the tenant transaction and
filter by tenant plus pinned release ID/hash. In-flight reads are tenant scoped.
After this correction, the actual host compiled reader resolved Athyper's
activated publication and loaded its runtime contract successfully (`--check`
reports `activatedReaderVerified: true`). Two new repository regressions cover
tenant context and wrong-plane rejection; existing reader tests also assert
coordinate propagation.

Follow-up validation: metadata 77 tests and publication service 242 tests passed;
metadata source/test and host source typechecks passed. The repeated DEV `--check`
passed against the already-activated release without further writes.

Coverage inventory: the DEV preview store currently exposes two root entities,
`business_partner` and `business_partner_request`, both for CATL. BP Requests is a
governed document collection with separately owned operation-scope bindings; its
current compiler intentionally does not emit `authorizationRuntime`. The compiled
runtime parser currently requires that property. Do not remove that guard or
invent handlers to make coverage appear complete: the collection's authorization
and binding publication must be migrated explicitly. The four live native
`entity_case_runtime` descriptors are workflow contracts, not replacements for
generic list/record metadata.

Normal Studio `KyselyPublicationAuthorityWork` still emits native entity artifacts
from its saved graph projections; simply enabling the reader flag cannot fix this.
Its immutable source preparation, emission, signing-review lookup, dispatch and
activation confirmation need coordinated changes. No runtime-authority flag or
actor grant was changed; CATL and the shared activation head remain unchanged.
Signed-in UI cutover verification is still pending. This adoption alone does not
fix the list-descriptor 404 while the plane-wide reader flag remains off.

## BP Requests collection migration — completed after the original report

The collection is now included in Athyper's same signed compiled release rather
than being treated as a normal record entity or given invented handlers. Its
`discover` and `read` operations retain the independently governed
`neon.relationship.entity_case.read` permission and the
`platform.document_relationship.v1` relation resolver.

- Publication release: `b0515908-244d-40e9-b518-12116ddb7354` (release 2).
- Applied release: `01a0d8bc-f18d-74a6-a39c-67ef1893995c`.
- Candidate: `77adde8e8e610196f099f776f6c121543dd8d47b571a0eb2fe99c7b8377e2492`.
- Runtime artifacts: 122, including `business_partner/runtime` and
  `business_partner_request/runtime`; no native artifact was created.

The generic projection lifecycle now stages compiled operation bindings with the
applied release and activates them only after the artifact activation succeeds.
The deployment preflight resolves and validates both the BP record runtime and
the BP Requests collection runtime. It does not regard a collection as a
normal entity authorization contract: collections must provide immutable source
coordinates and reviewed operation-scope bindings, while a regular record
runtime must still provide both authorization and authorizationRuntime.

Verification on 2026-09-25: the Athyper tenant compiled activation head points
to release `b0515908-244d-40e9-b518-12116ddb7354`; both BP Requests bindings
are `published`. Metadata tests (77) and publication service typechecks passed.

## Remaining release blockers

The plane-wide switch remains **off**. The shared global BP release currently
does not contain runtime-contract members, and CATL has not adopted a compatible
tenant release. Normal Studio publication also still lacks a durable full split
artifact source: `snapshot.compiled_artifact` is empty in DEV and the current
Studio authority only has native per-plane `entity_release_artifact` projections.
It would be unsafe to reconstruct a compiled release from a current active head
or from filesystem product files at publish time. The next implementation must
persist reviewed Core/Operation/presentation/flow inputs against the Studio
release, lower the runtime member from that exact source, then sign and dispatch
one compiled release through the ordinary publication worker.

Signed-in UI verification could not be run: the saved Athyper admin session was
rejected by `/api/auth/session`. A freshly authenticated Athyper session is
required before testing the deployed compiled release in the browser.

The session was refreshed later on 2026-09-25. Signed-in browser verification
then confirmed the multi-company working-context gate and the corrected missing
descriptor message. With no selected company, the workspace asks the user to
choose an authorized legal entity and company. After selecting an authorized
company, the list route displays **“Business Partners is not configured for this
workspace”**. It does not display the misleading “Record not found” message.
This is the expected result while that workspace has no active native descriptor
and the plane-wide compiled-only switch remains disabled.
