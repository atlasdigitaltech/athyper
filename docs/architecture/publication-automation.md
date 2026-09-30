# Metadata publication automation

## Implementation status

The reusable workflow and promotion policy are implemented and exported:

- `DevelopmentPublicationWorkflow` in Studio MetaEntity authoring.
- `ReleasePromotionService` and `evaluatePromotion` in the publication service.

The DEVFULL workflow is registered in platform-host and exposed through
`pnpm dev:publish`. Cross-environment promotion is **not wired**; QA/STG/PROD
approval and qualification storage remain a separate implementation.
Existing human routes retain authentication and MFA checks.

### Local DEV setup and usage

```sh
pnpm dev:publish:setup
pnpm devfull
pnpm dev:publish --dry-run
pnpm dev:publish
```

Setup provisions two `service_account` principals (`dev.metadata.author` and
`dev.metadata.publisher`) in the existing DEV Studio and Neon principal
registries. It is idempotent, refuses conflicting/revoked identities, and never
changes a human account. Bootstrap uses the explicitly checked DEV database
container's administrator; ordinary publication uses the runtime's scoped DB
transactions, existing authoring service, signer and dispatcher.

The initial configuration is intentionally limited to CATL (`cirrusatlantic`),
`business_partner`, Neon, and the code-owned `intake-presentation` overlay.
This is not a global product release. Supporting other overlays/entities/planes
requires an explicit server configuration and compatible published source.

Two independent random machine secrets live in owner-only `client.json` under
`~/.athyper/instances/dev/secrets/dev-publication/`. Only credential hashes,
principal IDs/auth epochs and scope configuration are mounted read-only into
the API as `server.json`; client secrets are never mounted into applications.
The API checks principal type, active status, epoch and DEV role on every
operation. Revoking either principal or incrementing its epoch disables the
command. Setup does not reactivate it or silently rotate credentials.

Both source DEVFULL and rebuilt container mode receive this configuration via
`dev-workspace.mjs`; `devsimple` removes it. For a standalone local turbo API,
set `ATHYPER_DEV_PUBLICATION_CONFIG` to the server file and
`ATHYPER_DEV_PRESET=devfull`, with the normal DEV environment (`ATHYPER_ENV=local`,
`ATHYPER_DOMAIN_SUFFIX=dev.athyper.test`). Then use:

```sh
pnpm dev:publish --url http://127.0.0.1:4000 --dry-run
```

The default CLI calls container loopback through Docker stdin (no secrets in
argv). URL overrides accept only loopback and refuse redirects. The endpoint
`POST /api/dev-publication/publish` requires BOTH machine credentials and cannot
be enabled by request parameters. These are dedicated local workload
credentials, not human sessions, fabricated MFA or general OAuth grants.

Automatic approval is attributed as `development_auto_approval` in existing
transaction-backed audit storage, alongside the existing changeset reviewer
and release history. Author and publisher IDs, source/proposed/saved hashes,
changeset and release IDs are recorded. A changed source release is rejected
under the repository's publication advisory lock. A `dispatched` response does
not imply activation: check the release's activation receipt in Studio.

### Scoped DEVFULL runtime approval

The native intake prerequisite has now reached signed runtime activation; see
[the exact receipt](../reports/bp-integration-20260921/devfull-runtime-activation.json).
DEVFULL authoring approval continues through a separate workload runtime adapter.
It does not manufacture human MFA receipts or use the human review adapter to
label machine approval as business/security reviewer decisions.

The owner-only `server.json` may pin `runtimeApproval` with `releaseId`, absolute
qualification `path`, and `sha256`. The qualification binds the complete native
release coordinate, catalog/profile/runtime hashes, selected operations and local
signing key to successful build/test evidence and source-file hashes. It expires
within 24 hours. Configured author/publisher identities, epochs, native changeset
provenance and append-only automation audit records are checked on every use.
Missing, modified, expired or revoked evidence fails closed. A changed source or
qualification requires fresh qualification; existing immutable signatures are not
rewritten. No endpoint accepts these authority fields from a browser.

For the currently scoped native intake release, generate and install qualification
with a fresh output directory (the command runs the actual checks):

```sh
pnpm exec tsx tooling/scripts/local-dev/qualify-runtime-publication.mts docs/reports/bp-integration-20260921/runtime-workload-next --install
```

The initial capture tool intentionally pins the selected intake release. General
entity/overlay expansion needs explicit configuration and corresponding capture
support; this is not a blanket DEV approval of arbitrary artifacts. Once pinned,
the existing publication jobs perform compilation, signing, dispatch and apply.
Apply rechecks workload authority after signature verification, including on
resumption, and verifies the signed approval receipt before activation. Human
review remains in use for unrelated releases; business-request approvals and
QA/STG/PROD policies are unchanged. The broader split-artifact provider registry
is not certified by the native runtime qualification.

API, worker and scheduler receive only the read-only server configuration in
DEVFULL. Client credentials remain outside containers. Only the API installs the
authoring endpoint; workers consume the scoped runtime approval policy.

## DEVFULL authoring

The host supplies explicit `environment: dev`, `instance: dev`, `preset:
devfull`, and `enabled: true`, plus distinct author/publisher principal IDs.
`local` alone is insufficient: the host currently uses it for more than DEV.

The workflow loads the current published graph in the requested scope, applies
a code-registered overlay, validates and compiles, and returns `unchanged` if
the contract is identical. A dry run returns hashes without mutating storage.

Apply creates a separate `dev-publication` draft through the authoring service.
It clones row identities and adjusts positional tests using the existing graph
helpers. It does not reuse or overwrite a user's `local-preview` draft.
After save, the persisted graph must match the expected hash. Validation,
contract tests, submission, independent review, signing and dispatch use the
existing authoring service. Receipts distinguish `dispatched` from `activated`.
Automation is attributed as `development_auto_approval`, not human review.

The required host adapters are:

| Port          | Required behavior                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `current`     | Read the immutable published graph for the exact entity/scope and its supported target planes.                                                    |
| `withCurrent` | Serialize publication for that entity/scope and reject a changed source release.                                                                  |
| `asWorkload`  | Authenticate the configured machine identity, establish its real request context, and authorize every operation. Never forge human MFA assurance. |
| `overlays`    | Register `withBusinessPartnerIntakePresentations` as a code-owned overlay; accept no executable request payload.                                  |
| `record`      | Write durable audit evidence including identities, graph hashes, changeset and release IDs.                                                       |

If validation or authorization fails after a draft is created, its ID remains
in the audit/authoring history for recovery. This initial implementation does
not automatically resume partially submitted authoring drafts.

## Immutable promotion

Promotion takes an existing release ID and content hash. It has no compiler,
release-creation, or artifact-creation port. Per-plane signed artifact hashes
and IDs must come from trusted release storage.

| Destination       | Required evidence                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| DEVFULL automatic | Validated, trusted artifacts; separate authenticated author/publisher workloads; explicit DEVFULL host policy.                          |
| QA                | Reviewed candidate, successful validation and trusted signatures.                                                                       |
| STG               | QA qualification for the same release/content/scope/planes and current independent human approval of the exact destination coordinate.  |
| PROD              | STG qualification for the same release/content/scope/planes and current independent human approval of the exact destination coordinate. |

The host policy supplies destination allowlists. Request coordinates cannot
change the host environment or enable automatic approval. Approvals expire and
bind the full target-instance selection, scope and content hash. Qualification
is plane-specific; it cannot qualify additional planes by implication.

`loadVerified` must load authenticated approval and CI evidence, revalidate
authority, and verify that the artifact set belongs to the given release hash.
It must not trust request JSON that merely claims approval or signature trust.
Environment signing-key trust remains the responsibility of the configured
verifier; development signatures are not implicitly accepted elsewhere.

Promotion creates deployments using the existing authority repository and calls
the existing dispatcher through its adapter. Stable command IDs are based on
the artifact, scope, environment and destination, so retries reuse deployments
even if the requested subset of targets changes. Activated destinations are
skipped. The returned status is `activated` only when every destination reports
activation; queued and failed destinations produce `incomplete`.

Approval and current authority are checked again before each target. Audit
failure prevents subsequent dispatch. Dispatch failures are summarized without
leaking transport credentials; protected dispatcher logs retain diagnostics.

## Required platform integration

1. Provide trusted approval/qualification storage and cross-environment artifact
   transport for `ReleasePromotionService`. Wire target-environment workers to
   the existing signature verifier and activation protocol.
2. Expose cross-environment orchestration only after those adapters are present;
   never silently substitute database admin access.
3. Qualify activation against DEVFULL before enabling other environments.

Global product publication needs a separate integration qualification. The
current publication release contract and worker execution path require a
tenant authority context; a null graph tenant is not by itself a global
deployment mechanism. The new workflow rejects tenant/global scope mismatches
and does not translate one into the other. Tenant overrides, product admission,
canary cohorts and rollback compatibility remain governed by their owning
runtime/deployment services; they are not implemented by this policy module.
