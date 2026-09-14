# Personal DEV workspace

This workflow keeps the existing `*.dev.athyper.test` URLs, DEV IAM realm, users,
grants, authoring databases and supporting services. Application source watchers
run in development containers connected to those same Docker networks. The
original image containers remain stopped and recoverable.

## Daily commands

```sh
pnpm devfull                      # API, worker, scheduler, Studio, NEON and Mesh source watchers
pnpm devsimple                    # API, worker, scheduler and NEON source watchers
pnpm dev:workspace status
pnpm dev:workspace recover        # Recover an abandoned controller lock after checking its process
pnpm dev:preview status
pnpm dev:preview reset            # Return to the signed local preview baseline; keep drafts
pnpm dev:workspace build          # Build development images from the exact checkout tree
pnpm dev:workspace container      # Run those images with the same local preview
pnpm env:dev                      # Alias for the same workspace image mode
pnpm dev:workspace legacy         # Explicit recovery to the original pre-workspace images
```

The presets change application concurrency/resource limits and selected frontend
watchers. They currently retain the existing DEV infrastructure services; they are
not a new infrastructure sizing qualification for 16 GB hardware.

Source mode requires an installed checkout and the local development toolchain
image `node:24.19.0-bookworm-slim`. The switch resolves this tag to an immutable
local image ID before starting applications. Obtain it with `docker pull` if absent.

Source and original application containers must not run simultaneously. The
controller stops the competing applications, serializes switches with Stack v2,
waits for infrastructure and source health, and preserves the original container
IDs and images. Ordinary Stack v2 DEV mutations are rejected while source mode
owns the applications. Direct manual Docker commands can bypass the controller;
`status` identifies a conflicting running state.

If the original application containers have been removed, `devfull` and
`devsimple` can resume the saved source workspace after validating its checkout,
DEV configuration and existing baseline. The controller retains a complete source
configuration so both presets remain available. Legacy recovery and image-mode
switches still require the original containers and their compatibility checks.

The first switch backs up Studio, NEON and Mesh with `pg_dump -Fc` and captures a
schema fingerprint under `~/.athyper/instances/dev/workspace`. It never resets or
initializes these databases. Returning to original images is refused if their
recorded identity or the database schema changed. Startup failure stops source
applications and restores original images only when the schema still matches.
The same compatibility protection does not prove every business contract is
backward compatible; image qualification remains required.

Image mode uses the production Dockerfiles and an explicit development build
receipt. The build refuses adoption if the source tree changes while images are
building. Images carry a `working-tree-<hash>` provenance label and are **not**
release-qualified images. Source and image consumers use the same preview mount;
only the API receives the signing key. Source mode mounts the checkout and starts
watchers; image mode removes that mount and runs the built application entrypoints.

`legacy` is a recovery path to the original image containers. Those older images
do not consume the new local preview; their original publication behavior applies.
The workspace must enter legacy mode before ordinary Stack v2 can replace the
original DEV deployment. Do not use legacy mode for everyday metadata preview.

The former isolated runner is retained as `pnpm dev:isolated` / `pnpm dev:local`
for explicit disposable-environment work. Its application startup is rejected
while the shared source workspace is selected. Do not use it as a metadata
promotion stage.

## Fast BP metadata preview

In Studio, open **Business Partner → Publication**. An authorized reader loads the
current local BP definition automatically. Change an existing form/view text
value, then select **Save and preview locally**. A separate manual simulation is
not required in local preview. The response shows the saved revision, active
revision and failure details. Refresh the affected NEON view to read its metadata.

The implemented slice permits existing form/view labels, titles, descriptions,
help text, placeholders and button labels; reordering existing sections, fields,
columns, panels and options; widths from 1–12; and text/textarea changes. It also
supports bounded workflow stage/SLA changes while retaining independent approval,
and narrowing the supported request sources. These saves use the native compiler,
local signing and the existing runtime consumers; no image build, candidate freeze
or QA qualification is part of this editing loop.

New fields, arbitrary bindings, ownership/permission changes and generic Meta Entity
graph changes are **not yet supported by this preview coordinator**. Adding their
local compiler/consumer support is development work, not a reason to require QA
qualification after every edit. Do not assume all Meta Entity edits have a fast
preview simply because BP form preview is active.

The current preview targets NEON. A cosmetic NEON edit does not publish Mesh.
Runtime code changes in source mode use watchers. Container mode runs the last
built application code; rebuild it when code or compiler support changes, not
when supported metadata changes in the shared authoring database.

Artifacts activate through an atomic file replacement shared by the local API and
workers. Presentation reads verify the artifact and its baseline. Text previews leave
request-schema and workflow coordinates on the baseline, so a label edit does
not invalidate in-progress BP requests. Failed compilation
keeps the previous active artifact. Superseded verification cannot replace a
newer saved revision. Reset changes the preview generation and archives active
artifacts/status so in-flight old verification cannot reactivate them.

The baseline was explicitly initialized from existing Studio draft
`0bf6281b-0740-436c-8de5-c42963be2835` because DEV had no active published BP
onboarding definition bundle. The signed baseline is development evidence. No
publication release, approval, or release-20 evidence was rewritten. The private
signing key is mounted only into the API in either mode; worker/scheduler preview mounts
are read-only and do not contain that private key.

A reference-only migration restored six missing NEON account/bank permission
catalog definitions: `server/db/scripts/operations/repair/reference-permissions/20260911_restore_neon_account_bank_permission_reference.sql`.
It assigns no roles, memberships or principal grants.

## Candidate handoff

```sh
pnpm candidate:export <saved-Studio-revision> <authoring.json>
pnpm candidate:freeze <authoring.json> <candidate-images.yaml> <new-candidate-directory>
pnpm candidate:verify <candidate-directory>
pnpm candidate:import <candidate-directory> https://api.qa.athyper.test
pnpm candidate:qualify <candidate-directory>
pnpm candidate:staging-plan <candidate-directory>
```

Export reads the selected local Studio definition into a portable package. It
contains definition coordinates, target planes and source content, not local
users, credentials, business records or approval evidence.

Choose the next milestone semantic version in Studio before release qualification.
Local build suffixes do not bypass the normal no-downgrade publication check.

Freeze requires a clean committed checkout, tracked authoring/ImageSet inputs and
an immutable candidate ImageSet matching that commit. It uses the existing Stack
v2 ImageSet promotion validator, compiles the selected definitions, and binds
checksums of authoring, compiled outputs, image references and migration manifest.
It does not build images or apply migrations. Candidate output belongs outside
the checkout. The existing release image build path also requires committed,
clean source; development preview remains usable with uncommitted changes.

QA import requires `ATHYPER_QA_AUTHOR_TOKEN_FILE`, containing an authenticated QA
author bearer token, and the normal trusted HTTPS connection. It calls the native
Studio authoring API and records source-to-QA revision mapping. It does not copy
DEV identity/grants, overwrite an existing draft or fabricate publication approval.
Publish/activate the imported revision through QA's native release path.

`candidate:qualify` currently checks **metadata handoff only**: exact running QA
image digests/source labels/health and active native definition hashes for the
selected planes. It explicitly reports `releaseQualified: false`. The complete
authenticated BP success/denial journey suite and independent release acceptance
are still required. A frozen candidate has now been imported, signed and activated in isolated local
QA. Full qualification is still pending the entity descriptor/operation dependency
set and authenticated journeys; see the [QA report](../reviews/qa-publication-qualification-20260912.md).

`candidate:staging-plan` emits the unchanged image digests and associated package
paths plus outstanding gates. It does not deploy. Staging is not yet configured.

## Verification and recovery

```sh
pnpm test:local-runner
pnpm test:dev-workspace            # Live source → image → source round trip
pnpm --filter @athyper/server-service-publication exec vitest run \
  src/__tests__/local-definition-preview.test.ts \
  src/__tests__/business-partner-definition.test.ts \
  src/__tests__/business-partner-definition-routes.test.ts
```

`tooling/scripts/local-dev/preview-integration.mts` is a real database/service
exercise run inside the source API. It creates immutable development revisions,
checks cross-tenant read rejection and last-working-revision retention, and
restores original labels. It uses ordinary runtime database privileges, but it is
not an authenticated browser or human acceptance test. Its evidence says so.

Runtime state, backups, source Compose configuration and operation logs are private
under `~/.athyper/instances/dev/workspace`. Use `pnpm dev:workspace recover` after an interrupted operation. It verifies the
workspace ownership token and process start identity, refuses live controller or
Docker Compose/build processes, and removes only its own abandoned locks. It does
not reset data or silently choose an application mode.

## 12 September extension and current QA prerequisite

Preview now also permits bounded existing-layout changes, validated workflow
stages/SLA settings and narrowing existing request input sources. It does not
permit arbitrary ownership, field policy, binding or new-field changes. See the
[current implementation and QA report](../reviews/shared-dev-workspace-20260912.md)
for exact scope, candidate evidence and outstanding qualification work.

Before retrying the retained QA database, run `pnpm qa:migrations:preflight`.
It rehearses pending migrations inside rollback transactions and records private
per-plane evidence. A passing rehearsal is not migration application or release
qualification. The current retained baseline fails NEON and Mesh prerequisites.

After QA becomes healthy, use `pnpm qa:session --plane studio --actor catl.admin`
(and the corresponding `catl.owner` and `neon` combinations) from a graphical
terminal. Complete normal login and MFA in the opened browser. The helper verifies
existing Cirrus account IDs before privately saving sessions. Use `--check` to
revalidate; session capture does not grant roles or approve any release.

## Fresh isolated QA is now running

See [the fresh QA report](../reviews/fresh-local-qa-20260912.md) for the exact
candidate, existing-user identity checks, private recovery locations and pending
release qualification. The isolated QA lifecycle must use
`~/.athyper/candidates/20260912-bp/deployment`, whose QA template selects the new
Compose project. The ordinary repository QA template still refers to the retained
old project. DEV URLs and its source-mode project are unchanged.

For Windows PowerShell capture followed by WSL validation, use the
[QA authentication capture commands](qa-auth-capture.md). Existing DEV commands
remain valid; add the explicit QA environment option to capture QA sessions.

## Native graph working drafts

The DEV source-mode host now wires the native graph preview adapter. Open
`https://studio.dev.athyper.test/entity/graphs`, select a published graph, create a
working draft, edit it and save. The page shows the saved change-set revision and
active preview revision separately. Local activation retains real author grants
and the existing permission's MFA requirement; it creates no release approvals.

The current adapter supports registered runtime projections and the registered BP
request collection. Policy/lifecycle/numbering lowering and other unsupported
semantics fail with an explicit error while the prior preview remains active.
This is not yet an arbitrary-graph or fully qualified QA workflow. See the
[current native preview report](../reviews/meta-entity-preview-and-dependencies-20260912.md)
for the remaining integration and authenticated verification work.
