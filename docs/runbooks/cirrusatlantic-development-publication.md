# CirrusAtlantic development publication

The development test uses `catl.admin` as author and `catl.owner` as independent
reviewer in tenant `44444444-4444-4444-8444-444444444444`. This does not activate a
definition for the separate `athyper` tenant used by the existing V1/R2/R3 fixtures.

The [preflight record](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-publication-preflight.json)
retains the initial account and worker observations. Both actors now have OTP
enrolled and active Studio database membership. The
[committed provisioning receipt](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-publication-authority-receipt.json)
records the separated grants and 49 database audit event IDs. Keycloak's
`studio.access.quarantine` group name alone does not establish effective access.

Use native Studio authorization management to give the author exactly
`studio.business_partner_definition.read` and `.author`, and the reviewer exactly
`.read` and `.publish`, with tenant scope and `exact` propagation. The provisioning script suspended the admin group's old broad testing-role
assignment and assigned a copy excluding definition publish. Other admin
permissions and the shared source role remain intact. The owner now receives
read/publish through a dedicated reviewer group and role. Review inherited grants
when changing these assignments. Do not
modify shared role grants without checking their other members, or remove
Keycloak quarantine membership as a substitute for native authorization.

The [refreshed review input](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-definition-publication-review.json)
uses version `2.1.1` and current source hashes. Request and MESH profile hashes
match the original packet; eligibility and NEON profile-match hashes differ.
The current foundation generator produces the same definition sections as the
old candidate. Eligibility changes include Customer designation contracts;
profile-match changes include governed MESH amendment resolution. Review these
semantics and the source coordinate mapping before approval. Compilation checks
are not a substitute for that review or live schema/migration validation.

The package build and 60 publication tests passed. NEON and MESH compilation was
deterministic with explicit expected source hashes. The earlier candidate stays
unchanged. A fresh packet can be generated from the repository root with:

```sh
pnpm exec tsx tooling/scripts/verification/prepare-business-partner-publication-review.ts --output=<new-review-packet.json>
```

## Worker configuration

Add `deploy/compose/instance/compose.publication.yaml` after the base and parity
Compose files using the existing instance deployment environment. It enables
signed compilation, dispatch and application only on the worker. The overlay
requires these references rather than selecting another environment's defaults:

- `PUBLICATION_TARGET_PLANES` (`neon,mesh` for this candidate) and the actual
  `PUBLICATION_RUNTIME_VERSION`.
- `PUBLICATION_SIGNING_KEY_ID`, `PUBLICATION_PRIVATE_KEY_REFERENCE`, and
  `PUBLICATION_PUBLIC_KEY_REFERENCE` for the development Ed25519 key pair.
- `INFISICAL_URL`, `INFISICAL_WORKSPACE_ID`, `INFISICAL_ENVIRONMENT`, and
  `INFISICAL_SECRET_PATH` for the development secret store.
- `PUBLICATION_INFISICAL_TOKEN_FILE`, a secure local token-file reference mounted
  as a Docker secret. The runtime loads it through `INFISICAL_TOKEN_FILE`.

The overlay keeps `PUBLICATION_REQUIRE_SIGNATURE=true`. Private key material
remains in Infisical. The overlay is now deployed on the rebuilt development worker, with compile,
dispatch, apply and signature enforcement enabled. Its health is healthy. Native
secret-store resolution and Ed25519 signing/verification passed over verified TLS.
No publication jobs were waiting before enablement. The
[worker receipt](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-publication-worker-receipt.json)
retains the image and configuration coordinates.

## Native execution and evidence

MFA enrollment is complete. Verify effective author and reviewer permissions in
fresh separate sessions. Follow the
[native publication workflow](business-partner-release-operations.md): simulate
the complete bundle against the latest approved revision, save it as the author,
and review the saved immutable revision as the owner before approving and queuing.

Retain the actual revision ID, author and reviewer IDs, source hash, approval
audit coordinate, release ID and compilation job ID. After worker processing,
retain signed artifact coordinates, key ID, signature and verification evidence,
deployment acknowledgements, and each consumer's active release/projection ID and
compiled hash. Verify every receipt belongs to the same tenant and release.
No native approval, signed release or consumer activation receipt exists for this
attempt yet. Do not fill those fields with simulations or fabricated IDs.

BP-Q004/BP-Q006 remain pending. This publication test does not approve candidate
or commercial Workforce processing, or production qualification.

## Applied local authorization provisioning

The local operation uses the existing `seed.three-plane-provisioner` service
principal and retains database audit events. It does not impersonate either human
actor or record a publication approval. It first passed a transaction with rollback,
then committed, then passed an idempotent replay with rollback.

```sh
docker exec -i athyper-dev-db-1 psql -X -qAt -U postgres -d athyper_studio -v ON_ERROR_STOP=1 -v apply=false < server/db/scripts/operations/studio/provision-cirrusatlantic-publication.sql
```

`apply=true` commits the same guarded local operation. The script refuses a shared
admin group, uses immutable assignment coordinates, and verifies the four expected
definition grants before commit. Native signed-in sessions must still verify all
other admission, scope, MFA and policy checks.

## Development signing setup commands

The optional database initializer created `athyper_infisical` with its dedicated
owner; service secrets are owner-only files under the development secret directory.
The native bootstrap and worker setup completed successfully. These commands
repeat the checkpointed setup without creating new identities or rotating keys:

```sh
node tooling/scripts/verification/start-development-publication.mjs --phase=secretstore --confirm=LOCAL-DEV-PUBLICATION
node tooling/scripts/verification/bootstrap-development-publication-signing.mjs --confirm=LOCAL-DEV-PUBLICATION-SIGNING
node tooling/scripts/verification/start-development-publication.mjs --phase=check
node tooling/scripts/verification/start-development-publication.mjs --phase=worker --confirm=LOCAL-DEV-PUBLICATION
```

Bootstrap uses [Infisical's native bootstrap API](https://infisical.com/docs/api-reference/endpoints/admin/bootstrap-instance),
a dedicated development signing project, and a viewer machine identity for the
worker. Administrative bootstrap credentials stay in a separate protected file.
The worker receives only its token-file reference and signing-key references.
The 30-day worker token must be rotated before expiry. The local TLS proxy uses
the existing development certificate, which is explicitly trusted by the worker.
A key health probe is not a signed release or an approval receipt.

The [current progress record](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-publication-progress.json)
now lists only native actor-session execution and resulting release/activation
evidence as outstanding. Both browser sessions must be authenticated independently;
MFA enrollment alone does not give the automation access to them. Open
[Studio Publication](https://studio.dev.athyper.test/mdg/business-partner/publication)
and follow the author/save and owner/review/approve workflow, or supply protected
local Playwright storage-state file references for those sessions. Never paste
session cookies, passwords or OTP seeds into retained evidence.

Infisical's owner-only secret mounts required a startup-wrapper repair: the
wrapper reads files as root, then uses `setpriv` to run the native entrypoint as
UID 1001. The running Node process was verified as UID 1001; Docker's init process
remains root. Its native startup command is explicit because Compose clears the
image command when overriding the entrypoint. The TLS proxy runs as the local
secret-file owner and the worker trusts only the mounted development certificate.
All 18 Compose structure tests passed after these changes. A restricted database
backup is retained outside the repository; a restore rehearsal has not been claimed.

## Publication page access and manual approval

The Business Partner publication URL was missing from Studio's shell route registry,
which caused the shell to deny access before rendering the authoring page. The route
is now registered under the publication module, requiring its entitlement and
`studio.business_partner_definition.read`. Author and reviewer grants remain separate.
The app image also includes the governance configuration imported by Studio pages.

After deploying the corrected Studio image, refresh the page or sign in again to
refresh session permissions. Use separate browser profiles for the two accounts:

1. As `catl.admin` in CirrusAtlantic, open `/mdg/business-partner/publication`.
   Replace **Definition bundle JSON** with the complete contents of
   [the bundle-only 2.1.1 file](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-definition-bundle-2.1.1.json).
   Uncheck STUDIO; retain NEON and MESH. Leave comparison revision blank for the
   first revision. Select **Simulate proposed revision**, then **Save immutable revision**.
   Retain the saved revision ID and bundle hash.
2. As `catl.owner`, open the same URL and enter that ID under **Review and approve release**.
   Select **Load revision for review** and review immutable content, author, version,
   source hash and NEON/MESH consumers. Set minimum runtime version to `1.0.0`.
   If approved, check the review confirmation and select **Approve and queue release**.
   Retain the release ID and compilation job ID.
3. The configured workers compile, sign, dispatch and apply asynchronously. Verify
   native approval, signed release and both consumer activation records against
   the same tenant and release before marking completion. A queued job alone does
   not establish activation. Manual browser execution needs no exported session file.


## Definition save database repair

Request `f18f2003-1888-4a96-b71d-b490c47a876a` authenticated the admin but failed
because the runtime login lacked `athyper_publication_service` membership. Local
role membership was reconciled using
`server/db/scripts/operations/studio/reconcile-development-publication-access.sql`
(first with `apply=false`, then `apply=true`). Foundation provisioning now assigns
these service memberships; publication snapshot grants include schema usage.
Neither runtime login has superuser or BYPASSRLS privileges.

Definition save, read and approval now use a transaction-local tenant/principal
context. Approval release creation and transition share that transaction. The API
image was rebuilt and deployed. A real service-level save probe used the provisioning
service principal, rolled back its insert, verified cross-tenant read denial and
verified context cleanup. It created no human approval or retained revision.
Publication tests (60), Compose tests (18), typecheck and image build passed.

The authenticated browser must retry **Save immutable revision**. The publication
database health check passes, but broader API readiness still reports MESH network
exchange contract and Business Partner case-age context failures. See the retained
[repair receipt](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-publication-save-repair.json).

The admin subsequently saved version `2.1.1` at `2026-09-05T04:25:40.243622Z`.
Revision `4849ea52-4e91-4c09-b06a-22e511362050` exactly matches the reviewed bundle,
source hash and NEON/MESH targets. Its native snapshot coordinates are retained in
[the revision receipt](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-definition-revision-receipt.json).
Request `be660b97-0c12-44d7-9a45-9216465fa058` attempted another save of that version
and hit the version uniqueness constraint. This specific conflict now maps to HTTP
409 with a review-existing-revision message; unrelated database errors remain on
the internal error path. Owner review must use the saved ID; do not save or advance
the version merely to bypass the duplicate. Native owner approval remains pending.

## Native reviewer authorization wiring

The initial owner publish attempt returned a generic 403. The API used the general
permission authorizer without a policy evaluator, so the publication permission's
required SoD evidence could never pass. Publication routes now use a dedicated
policy evaluator: it reads the revision in the verified tenant and compares its
immutable `createdBy` against the reviewer principal. Caller-supplied author fields
cannot satisfy separation. MFA, entitlements, grants and scope checks remain in
the central authorizer; self-publication is also rejected by the service.

A denied route now returns its bounded authorization `reason` alongside FORBIDDEN,
including `mfa_required` when the token lacks elevated assurance. Policy tests cover
independent review, self-approval, invisible revisions, MFA, grants and entitlement.
Native owner approval still requires the user's authenticated browser action.

## Completed native publication and activation

Owner approval committed at `2026-09-05T04:43:24.118509Z` for release
`e0abaddf-5319-4393-a0a9-a30a9507d4ac` (release 1). The subsequent response failed
because BullMQ custom IDs cannot contain colons. Publication now uses semantic
`enqueueKey` values, which the jobs runtime hashes into deterministic transport IDs.
Repeated publish requests reuse the revision's existing release.

Authority jobs retain tenant coordinates through compile, sign and dispatch.
Their database operations set transaction-local RLS context. Apply uses worker
connections and tenant-scoped transactions on the authority and target planes.
The configured `PUBLICATION_APPLIER_PRINCIPAL_CODE` is resolved to each target's
active service-account ID; the development instance uses its existing
`seed.three-plane-provisioner` principals. No human actor was impersonated during
recovery. Original failed job evidence is retained.

The guarded recovery scripts enqueue only this already-approved release and its
signed deployments. NEON and MESH activated successfully at approximately
`2026-09-05T04:54:13Z`. The verification script independently fetched stored objects,
verified Ed25519 signatures and runtime compatibility, compared active consumer
hashes and revision IDs, checked native acknowledgements, and transitioned the
approved release to published through the native authority API. Re-running that
verification is idempotent.

- [Native owner approval](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-native-publication-approval-receipt.json)
- [Signed release and consumer activation receipts](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-signed-release-and-activation-receipts.json)
- [Native job evidence, including recovery history](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-publication-native-job-receipts.json)

These are local development receipts (the runtime deployment environment is named
`local`, with signing references in Infisical `dev`). Production qualification and
BP-Q004/BP-Q006 are separate and are not claimed by this publication.

The final worker replay verified target-principal resolution and completed dispatch
and apply on both planes. Principal discovery uses a tenant-filtered SELECT policy
for service-account rows only, granted to `athyper_publication_service`. A live RLS
probe returned one intended service account, zero human principals and zero
cross-tenant principals. Exhausted historical jobs remain in the evidence; replay
uses fresh deterministic recovery IDs rather than exceeding their attempt limits.
See [final native job receipts](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-publication-final-job-receipts.json).
