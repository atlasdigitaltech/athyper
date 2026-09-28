# Country read-only entity app

Permission contract: [common reference viewing](../contracts/common-reference-permission.md).

Fresh read-only DEV inventory: [2026-09-26 Country inventory](country-inventory-20260926.md).
That inventory is historical. All three planes retain 247 reference rows; record
UUIDs differ across planes and are preserved. See the current checkpoint below.

## Current DEV checkpoint — 2026-09-26

Country is **not activated**. The following changes have actually been committed
to DEV, rather than only prepared offline:

- One global Studio entity: `b7e5b981-2227-4720-ba5d-040a48ab6842`.
- One draft change set: `28e155d7-9f18-48fd-9f4d-847ff80f7e87`, revision 1.
- One canonical Studio storage profile over the existing `shared.country`.
- Persisted validation snapshot; zero validation issues. Contract-test evaluation
  returned passed with **zero embedded test cases**. The existing repository does
  not persist contract-test runs for global sources; this is not persisted test
  evidence or release approval. Package tests separately exercise the generic paths.
- Product hash: `2e6cc1eeec0dd357c1db0b5ec139ccd58c800532932985bb3a3fbaabdb00ff0f`.
- Stored graph compiler hash: `259eb6b00119e4f685d43fa72806d78c8845422c4df79b34acc20dc262d12cae`.
- The exact `common.platform.reference.view` catalog migration is applied in all
  three planes. The two approved DEV test-admin tenant roles receive this single
  additional permission. Collaboration permissions are **not** installed by it.
- Studio operation-plane constraints and the five missing normalized execution
  binding tables are installed. Those tables have forced RLS, application SELECT
  only and no application INSERT/UPDATE/DELETE privileges. Governed-command
  authoring writes remain gated; this does not enable the unresolved preflight path.

The importer uses the existing authoring repository and attributes maintenance to
the real DEV provisioning service principal, not a human admin. A repeat import
was checked in a rollback transaction and reused the same entity/change set.
No approvals, signatures, publication releases or activations were created.

Three unsigned target candidates now derive from that **same persisted source**:

| Target | Descriptor hash |
| --- | --- |
| Studio | `aa8be223e5b28ed65a916404366a47e90910fda71f879141eb23609c453d1e2e` |
| Neon | `8ca61ede7dbba2dc2ddd51b0c6091a5343106c8a3cd0404a15ce58ed87cfa835` |
| Mesh | `a182df42bbfa949bd3ccbc97efcd2c3a0e28b32611957358ea013ff387c367ce` |

The lowering compiler changes only plane coordinates, retains authored identities,
and requires an explicit target enrollment marker. This is not yet wired into
the approved-release preparation callback or worker compilation source.

Fresh verification: Studio typecheck passed / 161 tests passed; publication
typecheck passed / 301 tests passed; host tests 537 passed / 25 skipped. Host
typecheck retains the single deliberately gated `entity-case-preflight.ts` import
error. Database import/migration rollback checks and importer idempotency passed.
No authenticated browser acceptance, signed-release or rollback claim is made.

Country now also has a **source-only** comment/attachment capability candidate.
See [common collaboration boundary and current gates](../contracts/common-collaboration-capabilities.md).
Its signed split-artifact publication and runtime qualification remain pending;
the native list/detail descriptor alone does not enable collaboration.

## Implemented source setup

`metadata/products/shared/entities/country/definition.json` and `capabilities.json`
hold the entity-specific declarations. The generic product parser and
`buildSharedReferenceGraph` authoring factory replace the old executable
`country-graph.ts` definition. They are independent of the MDG `country/core`
lookup dependency. Generic services contain no Country-specific branch.

Storage is each plane's local `shared.country`. It has no tenant column. `id`
(UUID) is record identity; `code` is the ISO alpha-2 display/search identity.
The app exposes list/read only: no create, update, delete, import, materialization,
workflow or BP handlers. Phone/postal patterns are displayed as data, not executed.

The graph contains search fields, keys, field labels, default columns, record
sections, the common `common.platform.reference.view` permission and exact-plane operation
scope bindings. Tenant scope
on those bindings gates the caller through IAM; it does not imply tenant-owned
physical rows. No grants are created by graph generation.

Shared route entry points on all three apps support:

- `/app/entity/country/manage`
- `/app/entity/country/<UUID>`

The APIs must authorize and supply an activated descriptor before either works.
The routes intentionally do not contain Country data or schema definitions.

## Offline compilation (no tests, DB writes, signing or activation)

From the repository root, run for each plane:

```sh
pnpm exec tsx server/db/scripts/provisioning/prepare-reference-runtime.ts --product=metadata/products/shared/entities/country --plane=neon
```

Use `--plane=mesh` or `--plane=studio` for the other planes. Add `--json` to emit
the source graph, native compiled artifact, runtime projection and permission
requirements. The result is explicitly an **unsigned candidate**, not a release.

## Remaining activation gates

1. Bind `ReferenceFirstPublicationWorkflow` to authenticated DEV workload identities,
   a verified onboarding policy, durable evidence storage and real per-target runtime
   qualification. Its implementation is in the Studio authoring package's
   `publication/publication-workflow.ts`; it calls the existing authoring service
   for validation, submission, independent review, signing and dispatch. The ports
   have no default allow implementation. The existing DEV classifier remains
   assessment-only and cannot be treated as authority. No approver identity may be
   fabricated. This workflow is not yet mounted in the live host.
2. Wire `publication/prepare-release.ts`'s `prepareSystemReferenceRelease` into the
   trusted global-source publication transaction and the worker's split-artifact
   compilation path. The preparation implementation now checks the approved global
   snapshot, exact signed source and all enrolled targets, and writes immutable
   per-plane compilation sources plus the ordinary publication ledger/link. It does
   not insert runtime projection rows or perform activation. Its repository tests
   use a simulated PostgreSQL driver; this new path has not been executed on DEV.
3. `common.platform.reference.view` is now installed in each plane's local IAM catalog
   with tenant scope and granted to the approved DEV test-admin groups. Reuse it for
   Country and other explicitly published, non-sensitive
   shared reference entities. Permission IDs and role grants remain plane-local;
   a grant in Neon does not grant access in Studio or Mesh. Use existing IAM role
   administration for approved readers. This is not wildcard access to every table
   in the `shared` schema, and grants no write/import/export permission. Sensitive
   entities must use separate policies rather than this shared-reference factory.
   Catalog sources, generated packs and fresh-install DDL now include this capability.
   Existing databases use `20260926_common_reference_permission.sql`; its migration
   updates staging validation and installs the catalog row, but creates no grants.
   The separate DEV operation `grant-dev-reference-view.sql` adds only this permission
   to the existing `test.full_admin` roles, preserving their scoped assignments.
   `common` is not a plane: tenant membership, entitlements, roles and denies are
   still evaluated independently in Studio, Neon and Mesh. This permission is for
   reference-app browsing; address dropdowns still need their own authorized parent
   operation and published lookup binding. It is not automatic dropdown admission.
4. Complete validation/review, sign using the configured signer, deploy using the
   publication orchestrator and verify each plane's activation receipt. Wire the
   native-to-runtime projection into the release's compilation source; this offline
   preparation script is not yet registered as a publication source.
5. Check `compiledMetadataPlanes` before deploying. This candidate uses the native
   `entity_runtime` path. A plane cut over to `compiled_entity_runtime` will not
   fall back to it: it needs a compatible split-artifact publication first. Do not
   disable cutover or insert a fake locally verified projection to work around it.
6. Once active, add catalog/navigation bindings for the desired reference-data module
   and verify authorized list/detail access and denied writes in each plane.

This source change does **not** claim a live Country app. Existing host compilation
issues from the BP cleanup and publication-source/cutover integration must be
resolved before end-to-end activation can be confirmed.

### First-publication integrity contract

The implementations use responsibility-based folders in the Studio
meta-entity-authoring package:

```text
authoring/
  product.ts
  graph-builder.ts
compilation/
  target-compiler.ts
publication/
  publication-workflow.ts
  prepare-release.ts
```

Product parsing belongs to authoring, target derivation belongs to compilation,
and release orchestration/preparation belong to publication. No per-entity
implementation or entity-name dispatch is introduced. Existing public API names
and versioned metadata schema identifiers remain unchanged; relocating code is
not a schema migration or an expansion of the supported entity category.
The host workload adapter is `composition/shared/publication/workload.ts`.
Tests, relative imports, export paths and dependency-boundary assertions follow
these locations. This is a naming-only correction: existing reference-only
restrictions are migration debt, not completed generic MetaEntity behavior.
These modules are reused by reference entities; releases are persisted records,
not new source files. The workflow class remains `ReferenceFirstPublicationWorkflow`
because its current policy admits only first publication. Broader naming must
follow tested subsequent-release support, not precede it. `prepareSystemReferenceRelease`
retains its existing exported name. This organization change does not activate
anything or change publication authority.

- Onboarding pins the persisted change set/entity IDs, product hash, canonical
  contract/descriptor hashes and the exact enrolled target set. Hashes are not
  copied from an unsigned request or substituted for historical ledger hashes.
- `expectedSourceReleaseId: null` means **no prior release**. Omitting the property
  retains existing publication behavior; it does not mean first publication.
- The repository checks that condition after taking its release advisory lock.
  First publication also requires `expectedContractHash` and a preparation adapter.
- The authoring service checks the reviewed contract hash before invoking the
  signer; the repository checks it again against the validated snapshot before
  inserting a release. Concurrent changes roll back rather than becoming a new
  implicitly approved release.
- Every target must qualify before submission. A failed Mesh qualification is not
  ignored because Studio and Neon compiled successfully. Declared collaboration
  capabilities must be included in that qualification.
- Review attribution explicitly says `development_auto_approval`; the workflow
  authenticates separate author/publisher workloads and uses ordinary independent
  reviewer checks. It does not impersonate a human approver or alter the existing
  authenticated release-review evidence format.
- `dispatched` means queued publication work, **not activation**. Verified target
  receipts and live acceptance are still required for manual-testing handover.

The new focused tests exercise real authoring-service transitions and an Ed25519
signature, plus negative cases for policy denial, wrong workload, changed source,
target qualification failure, failed evidence persistence and concurrent first
publication. This is source-level verification, not a live publication receipt.

Fresh verification for this implementation (2026-09-26):

| Gate | Result |
| --- | --- |
| Authoring contracts typecheck | Passed; package has no test files |
| Studio authoring typecheck / tests | Passed / 181 passed |
| Publication typecheck / tests | Passed / 301 passed |
| Host typecheck | Unchanged single `entity-case-preflight.ts` missing repository import |
| Host tests | 537 passed, 25 skipped |
| DEV container status | API, worker and all three web containers healthy |
| New workflow live execution | Not performed; host adapters and split-artifact worker connection still pending |

No database, IAM, secret-store, approval or activation changes were made by this
implementation checkpoint. The remaining blocker is implementation wiring, not
another request for the operator's already-granted DEV rollout approval.

## Recheck persisted source without writes

### Persisted machine-policy adapter checkpoint (2026-09-26)

The host workload can now select an exact persisted machine policy using
`machinePolicy: { id, version, hash }`. Its adapter lives at
`composition/shared/publication/machine-policy.ts` and reuses the existing policy
repository, definition hashing, rule evaluator and permission authorizer. It
requires the exact active, effective definition and rejects a newer active
version, altered hash, wrong tenant/source, or a non-independent activation actor.
The actual policy-authoring repository uses `status='active'` and `updated_by`
after its maker/checker check; this adapter follows that storage contract rather
than assuming that generic policy activation writes a publication head.

Machine publishing selects the distinct proposed capability
`studio.metadata.contract.publish_automated`. It still requires actual IAM grants
and a persisted independently reviewed change set. It never weakens or aliases
the human `studio.metadata.contract.publish` permission. The new capability has
**not** been added to the live catalog or assigned to any account.

QA (including local QA), staging and production are rejected before policy-store
access. These negative tests do not constitute trust provisioning for those
environments. Six new machine-policy tests pass, including revocation/tampering,
environment separation and denial without IAM grants. Fresh host suite: 569 passed,
25 skipped; the existing single preflight typecheck error remains.

**Still unfinished:** audited enrollment tooling and its authenticated bootstrap
approver, live catalog/grant enrollment, live workload mounting, concrete
collaboration readiness/admission providers, and the split worker's live provider
registration. The existing generic policy HTTP routes expose evaluation and
simulation, not this enrollment workflow. This is an implementation gap as well
as a live enrollment prerequisite; it is not resolved by another operator saying
"go ahead". No approvals, grants, schema changes or activations were performed.

### Native-to-split lowering checkpoint (2026-09-26)

`services/publication/src/compilation/native-runtime.ts` now reuses
`compileNativeRuntimeProjection` to lower native metadata into core, operation and
runtime-contract members for the existing split compiler. Its inputs require an
independently qualified storage registration and permission catalog. It retains
comment/attachment declarations and bindings using `capabilityArtifactMembers`.
Unsupported relation/flow/materialization and notification dependency lowering
fails explicitly rather than silently dropping behavior. This helper has not yet
been connected to a live worker registration provider.

Seven focused tests pass: target projection and full split compilation across the
three planes; missing catalog/columns and changed targets; dependency boundaries;
capability policy preservation and rejection of absent handlers/admission; and
unsupported materialization rejection. These tests are not live collaboration
qualification or activation receipts.
Fresh package gates: publication typecheck clean, 309 tests passed; host 563 tests
passed / 25 skipped, with the same single preflight repository typecheck error.

Read-only DEV verification found no publication policy in
`control.policy_definition` by publication entity type/name. Both
`studio.metadata.contract.publish` and `publication.release.publish` are critical
permissions requiring MFA and separation of duties. The assessment-only DEV
classifier does not supply missing activation authority. No policy, grant or
approval was fabricated to bridge that gap.

Environment boundaries remain unchanged: the workload currently admits only the
explicit local DEV coordinates. Local QA is not implicitly authorized because it
also uses `ATHYPER_ENV=local`. Staging and production must not consume DEV machine
authority. This checkpoint does not claim independent QA/staging/production trust
provisioning or a completed machine-publication policy path. Human MFA/SoD remain
intact. Live policy enrollment, host workload mounting, concrete collaboration
readiness providers and worker lowering/provider integration remain unfinished.

### Handler, target qualification and IAM connection (2026-09-26)

- Product configuration now explicitly declares `entity.record.list.v1` and
  `entity.record.read.v1`, both with `tenant.record.v1`. The existing Studio
  compiler emits these through `authorizationRuntime`; no new compiler is used.
  Historical unbound candidates still reproduce their original hashes. The new
  definition is a new candidate, **not** a rewrite of a persisted release. Its
  draft/source/policy pins must be refreshed before publication.
- Host publication qualification now gets callable registrations from the same
  `RecordQueryService` instance used by generic HTTP record routes. The host fixes
  allowed operation semantics and handler keys; candidate metadata does not
  manufacture callable availability. This registry is not a backend scope adapter.
- `shared/publication/target-qualification.ts` checks each target's actual columns,
  SELECT access and published permission/scope catalog before callable and
  capability qualification. It performs read-only transactions; no rows are
  granted, activated or fabricated. Capability qualification is still mandatory
  and its concrete provider is not yet connected to the live workload.
- The workload uses `createKyselyPermissionResolver` for fresh plane-local IAM
  snapshots and the supplied platform `Authorizer`, replacing the generic
  `authorize` callback. Workflow verbs map to the existing canonical
  `studio.metadata.contract.{edit,submit,review,publish}` permissions. Policy,
  credential and author/publisher separation checks remain additional requirements.

Read-only DEV database checks confirmed active `dev.metadata.author` and
`dev.metadata.publisher` service accounts (in multiple tenants; selection must be
tenant-qualified). All four canonical permission definitions are published.
`studio.metadata.contract.publish` is **critical**, with `requires_mfa=true` and
`requires_sod=true`. A baseline machine credential does not satisfy that human
permission. No MFA claim, grant, permission flag or policy exception was fabricated.
The workflow's reviewed policy hash cannot override IAM. Live automation needs an
explicitly governed machine-publication authorization path; alternatively publication
must use an independently authorized MFA-authenticated reviewer. The existing BP
workload's permission-name allowlist is not a replacement for this authorization.

Verification: Studio typecheck clean and 185 tests passed; publication typecheck
clean and 309 tests passed; host 556 passed / 25 skipped, with only the existing
preflight repository typecheck error. New checks cover malformed bindings, altered
handler keys, denied reads, wrong-plane admission, missing target storage/catalog,
capability failure and real IAM denial when grants are absent. Database-dependent
workflow tests use a simulated driver; live identity/catalog checks above are
separate read-only observations, not successful publication evidence.

**Not completed:** live workload mounting/policy authority, capability qualification
provider, native-to-split lowering/provider wiring, refreshed persisted source pins,
signed publication and activation. No DEV schema/identity/grant/release mutation or
manual-test readiness is claimed by this checkpoint.

### Workload and split-worker implementation checkpoint (2026-09-26)

This supersedes the earlier statement that the split-worker connection is wholly
unimplemented. It does **not** establish live publication or activation.

- `composition/shared/publication/workload.ts` authenticates distinct
  author/publisher service accounts, checks active principal/auth-epoch state,
  establishes tenant/actor context, and records workload-attributed audit evidence.
  It requires explicit policy-authority, IAM and target-qualification providers;
  it has no permissive defaults and is not yet mounted in the live configuration.
- `services/publication/src/compilation/compiled-runtime.ts` connects the existing
  split-artifact compiler to worker compilation, signing and dispatch. Source pins,
  target coordinates, member hashes, registries and qualification receipts are
  rechecked. Missing lowering/qualification providers deny publication.
- The host authoring preparation callback now invokes the reference release
  preparation adapter. This creates publication work through the normal release
  path; it does not insert active runtime projections.
- The scoped compilation-source function and service-account-only evidence audit
  contract have a forward migration:
  `server/db/migrations/20260926_compiled_runtime_publication_source.sql`.
  Installation was verified against DEV PostgreSQL **inside a rolled-back
  transaction**. The migration remains undeployed. Missing tenant context is
  rejected; PUBLIC cannot execute the source function.

Fresh independent gates:

| Gate | Result |
| --- | --- |
| Studio authoring typecheck / tests | Passed / 181 passed |
| Publication typecheck / tests | Passed / 309 passed |
| Host typecheck | Same single deliberately gated preflight repository import |
| Host tests | 546 passed, 25 skipped |
| Migration SQL installation | Passed in DEV rollback transaction; not deployed |
| Country approval / publication / activation | Not performed |

The current persisted graph still lacks the explicit runtime handler bindings
required by split runtime contracts. Concrete native-graph lowering, callable
registrations and persisted runtime-qualification providers must be connected
before this worker path can succeed live. The workload adapter also needs actual
policy/IAM provider wiring. Shared-parent collaboration qualification and per-target
activation receipts remain acceptance requirements. A successful compile/sign test
with a fixture registry is not proof of these live dependencies. No handler is
inferred from Country's entity name, and no missing requirement is bypassed.

```sh
pnpm exec tsx server/db/scripts/operations/publication/import-dev-reference-product.ts --product=metadata/products/shared/entities/country --check
```

The command authenticates to the named DEV database and performs its check in a
rollback transaction. Applying the draft importer requires
`--confirm=DEV-IMPORT-REFERENCE-DRAFT`; it does not authorize publication. New rows
and schema changes above can be inspected/recovered through normal audited
maintenance. No Country business data or historical signed hashes were changed.

## DEV policy enrollment implementation (2026-09-26)

This checkpoint implements enrollment, not Country activation. It makes no live
permission grants, enrollments, source refreshes or runtime activations.

- `composition/shared/publication/policy-enrollment.ts` uses the existing policy
  authoring repository/service. Proposing persists six executable tests and a
  pending revision. Activation checks the exact hash, mandatory test inputs and
  expectations, then uses the repository's maker/checker transition. Both actions
  require an active authenticated human; neither workload may enroll itself.
- `policy-enrollment-routes.ts` is connected by Studio authoring registration in
  the existing explicitly configured DEV API only. Authentication is normal IAM;
  body-supplied actor/tenant coordinates never replace the verified context.
  QA, staging and production are not enabled by this wiring.
- Policy activation is **not** entity release activation. No signature, release
  pin, human MFA evidence, grant or runtime activation receipt is fabricated.
- Human enrollment uses distinct permissions:
  `studio.metadata.publication_policy.create` and
  `studio.metadata.publication_policy.activate`. These are proposed source
  identifiers, **not installed catalog entries or grants**. Catalog rollout must
  require MFA for both and independent-review SoD for activation. Existing
  `studio.metadata.contract.publish` checks are unchanged. The separate machine
  permission remains `studio.metadata.contract.publish_automated`.
- The audit contract `metadata_publication_policy` is added to canonical DDL;
  it has **not been deployed**. Enrollment and its audit record share one
  transaction; audit failure rolls back the operation.
- `scripts/operations/enroll-publication-policy.mjs` calls the authenticated API.
  It requires a private bearer-token file, an exact DEV HTTPS origin and
  `--confirm=DEV-PUBLICATION-POLICY-ENROLLMENT`. It never writes database rows,
  mints credentials, disables TLS verification or follows redirects. Separate
  real identities run `--phase=propose` and `--phase=activate`; the latter consumes
  the returned policy pin as its document. Local output is a convenience receipt,
  not immutable audit storage.

Fresh verification:

| Gate | Result |
| --- | --- |
| Enrollment service and HTTP tests | 10 passed (included in host suite) |
| Host tests | 579 passed, 25 skipped |
| Host typecheck | Only the existing `entity-case-preflight.ts` repository import error |
| Studio authoring typecheck / tests | Passed / 185 passed |
| Publication typecheck / tests | Passed / 309 passed |
| Operator script syntax / diff whitespace | Passed |
| Live policy enrollment / Country activation | Not performed |

The enrollment tests exercise real repository/evaluator code with a simulated
PostgreSQL driver, plus HTTP tests. They do not establish live RLS or grant
correctness. Live catalog/grant rollout and independent authenticated enrollment
remain outstanding. Workload mounting, concrete shared-parent/collaboration
qualification, and the live split-artifact worker provider also remain unfinished;
the enrollment implementation does not close those boundaries.

## DEV catalog, grants and pinned parent admission (2026-09-26)

This checkpoint supersedes the preceding **undeployed catalog/grants** status,
not its outstanding enrollment/activation requirements. Country is not activated.

### Applied to DEV

- Canonical Studio catalog and exact-scope seed artifacts now include
  `studio.metadata.publication_policy.create`,
  `studio.metadata.publication_policy.activate`, and
  `studio.metadata.contract.publish_automated`. All three are tenant/exact only.
  Human proposal and activation require MFA; activation and automated publication
  retain separation-of-duties requirements. Human publication is unchanged.
- `server/db/scripts/operations/authorization/provision-dev-publication-authority.mjs`
  applied these definitions and the enrollment audit contract to DEV Studio.
  It extended only the existing approved Test Full Admin roles in the two DEV
  tenants. It created exact author/publisher workload roles and groups for
  `cirrusatlantic`, with Studio plane admission and separate existing service
  principals. No new human memberships, cross-tenant bypass or policy approval
  was created. The script defaults to rollback and checks existing assignments
  for drift; applying requires `--confirm=DEV-PUBLICATION-AUTHORITY`.
- Live inspection confirmed the three published definitions, four exact workload
  permission grants and **zero** `metadata.publication` policy definitions.
- Restarted the existing DEV API after confirming the earlier duplicate-import
  startup fault was already corrected. A live unauthenticated POST to the policy
  endpoint returned 401 (`AUTH_TOKEN_REQUIRED`). The operator client now supplies
  `x-plane: studio`; real bearer authentication and TLS verification remain required.
  The DEV worker remains stopped. No QA/staging/production processes changed.
- Refreshed the metadata product through the existing generic DEV draft importer.
  It persisted a new unapproved draft with explicit runtime handler bindings;
  older drafts and physical Country records were preserved:

| Coordinate | Persisted value |
| --- | --- |
| Entity | `b7e5b981-2227-4720-ba5d-040a48ab6842` |
| Change set | `bded3c66-95b6-43b9-b8fd-df8e003e54e9` |
| Product hash | `fc8be6632cf1c3c0ef0f741bbe519120a99171fd2a95582e322393edd40af8b7` |
| Contract hash | `a9d1b21360b9ac72a181b52a13e0975e67e6370b25105ad3f7399d50c9257454` |
| Source descriptor hash | `5d46ec092a33a02c117fd46c54d13216da91f481aa2ff1c0bd6b9cac75fe40e0` |

Importer validation reported zero issues. Its contract-test count was zero, so
that result is not evidence of executed acceptance tests or runtime qualification.

### Implemented and verified in source

- `composition/shared/entity-runtime/published-parent-admission.ts` admits a
  qualified read-only published parent using the same release as capability
  authorization and an actual generic authorized record read. Explicit registered
  scope providers take precedence; their denial never falls through to this path.
  Collaboration scope is the authenticated tenant, not a caller-supplied tenant.
- The metadata parser now preserves the exact validated `referenceCapability`
  marker in its returned descriptor. Previously it validated but discarded it.
  This changes no historical signed JSON or stored release hash.
- Eight parent-admission tests cover release pinning, missing publication,
  unreadable parent, tenant/principal/plane mismatch, separate tenant scopes for
  the same parent UUID, and AST import/product-branch boundaries. They are not
  live collaboration/RLS acceptance tests.

| Fresh gate | Result |
| --- | --- |
| Provisioning script tests | 4 passed |
| Catalog validation / scope and seed-pack regeneration checks | Passed |
| Studio authoring typecheck / tests | Passed / 185 passed |
| Publication typecheck / tests | Passed / 309 passed |
| Metadata typecheck / tests | Passed / 77 passed |
| Experience `tsc --noEmit` / tests | Passed / 124 passed |
| Host typecheck | Only the existing gated preflight repository import error |
| Host tests | 587 passed, 25 skipped |

### Still required—not implied by the grants or passing tests

1. Two distinct real MFA-authenticated humans must propose and activate the exact
   DEV machine policy through the mounted API. Role assignment does not supply
   authentication or constitute approval. No human session was synthesized.
2. Reconcile the persisted draft maker with machine policy source checks: the
   trusted importer stamps the maintenance principal as `created_by`, while the
   current machine policy query requires the workload author there. Preserve
   independent review and submitter checks; do not relabel the recorded creator.
3. Mount the authenticated workload configuration and execution path using the
   resulting active policy pin. The existing factory alone is not live mounting.
4. Complete concrete collaboration readiness (including action providers,
   attachment storage/scanning) and live tenant-isolation/happy-path acceptance.
   Parent admission closes only one part of that boundary.
5. Install and connect the scoped compilation source, real split-artifact worker
   lowering/qualification providers, then start and verify the DEV worker. Its
   forward migration remains undeployed by this checkpoint.
6. Publish through the signed pipeline and verify three separate activation
   receipts, list/detail/collaboration behavior and rollback before manual handover.

The remaining engineering gaps are separate from the human enrollment requirement.
Neither API startup nor these unit suites establish Country activation, full
collaboration readiness, isolated-profile readiness or production security.

## Workload mounting and source reconciliation (2026-09-26)

- Reconciled machine-policy source checks with trusted importers. The recorded
  creator is preserved; the enrolled author must submit, the enrolled publisher
  must approve, and publisher must differ from both creator and submitter.
  Missing/ambiguous persisted rows deny. Twelve machine-policy tests pass.
- Mounted `POST /api/studio/publication-policies/:id/execute` in the configured
  DEV API. It requires both mounted workload credentials and an exact persisted
  policy revision/hash. Caller-provided source graphs, tenant coordinates and
  policies are rejected. Execution rechecks active enrollment and real IAM.
  Live unauthenticated probing returned 401; authenticated execution has not run.
- Added generic pinned read-only record headers through the authorized query
  service. No entity-name branches or native-descriptor fallback. Content hashes
  identify header revisions; they are not mutation concurrency tokens.
- Wired capability qualification to actual host methods, section providers,
  parent/header readiness, published tenant-scope permissions, required table
  privileges/RLS-policy presence, common comment lookup defaults, object-storage
  access probes and ClamAV health. Unsupported features remain unavailable.
  `document.comment_intent` is a lookup-domain key, **not a table**. Source inspection
  corrected an initial diagnostic assumption; no such table was created.
- Applied `20260926_compiled_runtime_publication_source.sql` to DEV Studio after
  rollback rehearsal. The source function and workload evidence audit contract
  now exist. PUBLIC execution is denied and absent tenant context throws.
  This creates no approval, release or activation.
- Restarted the existing DEV worker: fresh logs confirm successful startup.
  Both API and worker run. Concrete split-artifact lowering plus the persisted
  qualification-evidence provider are still not installed as a default worker
  adapter; startup does not imply that path can publish.
- Latest host suite: **616 passed, 25 skipped**. Host typecheck still has only
  the deliberately held preflight import error. New HTTP boundary, capability
  prerequisite and header tests are unit/in-process tests, not live tenant
  collaboration acceptance. No Country activation receipts exist from this work.

### Publication authority decision held

The existing DEV workload mount belongs to `cirrusatlantic`; that explains the
earlier suggestion of its administrators for enrollment, but it is **not** an
architectural requirement for a global metadata product. The user challenged
this coupling before any policy was enrolled. Enrollment is held pending proper
platform-operator authority wiring. Do not turn customer administrators into
global product publishers or silently change authority/grants to make the call
pass. Global product ownership, publication authority and tenant-local application
access are separate coordinates. The earlier DEV test grants are unchanged;
there are still no active machine publication policies from this rollout.
