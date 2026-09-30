# Business Partner publication recovery and Atlas remediation

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](meta-entity-onboarding.md)); do not treat this as current instruction.

Tracking ID: `APP-READINESS-001` — owner: Platform Publication / Atlas.

The follow-up persona and scoped-role proposal, consumer-map requirements and
prototype acceptance gates are consolidated in the
[Partner Access Model](../architecture/application-experience/partner-access-model.md).
That proposal does not authorize live grant changes.

Current status (2026-09-24): DEV compiled application and legacy descriptor are
both active. The reviewed permission catalog is restored without human grants.
Authenticated application descriptor is 200; list descriptor/list remain 403,
and the Partners screen remains unavailable. Access review is still required;
this is not a claim of full application readiness. QA is unchanged.

## Incident

On 2026-09-24, after a clean DEV/QA database rebuild, DEV CirrusAtlantic's
`GET /api/entity-runtime/business_partner/application-descriptor` failed with
`COMPILED_ENTITY_APPLICATION_RELEASE_UNAVAILABLE` (request
`2ed5be6c-6bc5-4354-a515-471ec53e1e1e`). DDL and tenant/access seeding passed,
but Studio publication sources and Neon activated metadata were empty.
Container health and API readiness did not establish application readiness.

## Recovery performed

- User selected recovery of the last working metadata, not fresh repository authoring.
- Restored DEV Studio/Neon archives into an isolated, network-disabled temporary
  PostgreSQL container. No archive was restored wholesale over a live database.
- Recovered compiled Business Partner release 25:
  `bc6cc765-4ccf-55ea-95ad-155deef86112`, artifact SHA-256
  `6b2334393845724c870c60a51067c57f3f498162d14baf7a9426e7409e399e02`.
- Validated its contract, document/payload hashes, Ed25519 signature against the
  configured trusted key, 110 artifacts and existence of 37 referenced database
  objects. Object-existence checks alone do not prove every column or user journey.
- Rehearsed staging/verification/activation with rollback, then applied through
  the publication database functions with a new deployment and activation receipt.
- Recreated the two existing scoped DEV publication machine identities using
  `dev-publish.mjs --setup`. No human grants, IAM credentials or business records
  were restored. Archived approval attribution was retained, not fabricated.
- Missing compiled application releases now map to HTTP 503 with code
  `ENTITY_APPLICATION_UNAVAILABLE`. The UI explains the administrator action;
  transient outages remain retryable, and unrelated integrity failures stay 500.

Private backups and deployment configurations:
`~/.athyper/backups/bp-publication-recovery-20260924/`.
Original source archives:
`~/.athyper/backups/dev-qa-pre-rebuild-20260924-hg6ZwJ/`.

The temporary recovery container was removed after inspection; both original
archives and before-recovery backups remain. Re-running read-only archive tools
requires recreating that isolated restore, not reconnecting the old live databases.
The active deployment configuration is `verified-source-active.compose.json` in the
recovery backup directory; the DEV workspace mode pointer also references it.
API/worker/scheduler use `provenance-verified-source-20260924`; Neon retains the earlier
error-handling image. Do not use the older rebuild Compose file to restart these
services. Legacy workspace mode switching remains unqualified.

The scripts under `tooling/scripts/local-dev/` are incident-scoped to these exact
DEV containers, release IDs and hashes, not a general migration facility:

- `inspect-business-partner-recovery.mts`: read-only source/signature preflight.
- `recover-business-partner-publication.mts`: rollback rehearsal by default;
  `--apply` restores the pinned compiled publication and activates it.
- `inspect-business-partner-provenance.mts`: read-only dependency inventory for
  the legacy list descriptor's archived approval/authoring provenance.
- `deploy-business-partner-recovery.mjs`: preserves prior Compose configuration;
  installs only the DEV API/worker/scheduler and Neon recovery images.

Do not blindly rerun recovery after partial failure. Check both Studio deployment
and Neon activation receipts first; these are separate databases, not one atomic
cross-database transaction. Existing target state intentionally prevents replay.
Never disable signature, RLS, permission or approval checks to make recovery pass.

## Acceptance checklist

- [x] Compiled release signature, hashes and contract validation.
- [x] Compiled release rollback rehearsal and live activation acknowledgement.
- [x] Server regression tests: missing configuration 503, no-store, authentication
  first, authorization unchanged, integrity failures 500, successful response unchanged.
- [x] Focused browser error-classification tests; records package typecheck.
- [x] DEV server and Neon production images built and deployed.
- [x] Authenticated application descriptor returns 200 using the refreshed
  CirrusAtlantic `catl.admin` session.
- [ ] Authenticated list descriptor and list return 200 (currently both 403).
- [ ] Partners list renders without the unavailable error for CirrusAtlantic.
- [ ] Relevant detail/intake screens verified with current user permissions/context.
- [ ] Source-definition/authoring dependencies checked before subsequent publication.

Saved test sessions were anonymous after the rebuild. The user refreshed the
session through normal login/MFA; never reconstruct sessions from Redis or mint
a human identity.
The wider error-boundary test file has an unrelated loader-markup expectation
failure (`a-app-loader__secondary-grid`); 17/18 tests passed, including the new case.

QA is not recovered by this incident's DEV-scoped scripts. Do not interpret this
recovery as QA application readiness or as restoration of deleted business data.

## Legacy list descriptor provenance

The original application-descriptor 500 is resolved, but the Partners screen is
not fully recovered. The legacy signed descriptor
`7bdb29f6-6b01-4385-867d-06357504f6ca` has artifact hash
`654c378b5336674cc7c4f827a77a0c497408f379fdcc5ee9348bba7d824c51e3`.
Its activation requires the pinned DEV runtime approval and historical authoring
provenance. The dependency inventory found 13 missing rows: three entity releases,
three change sets, one entity, four snapshot revisions and two workload audit rows.
No missing non-metadata dependency was found.

A source-restoration transaction was rehearsed with rollback. The database
rejected inserting a historical published change set: **“A change set must be
created in draft status.”** No live provenance/legacy descriptor rows were restored.
The experimental write script was removed; the read-only inventory remains.
Do not work around this by disabling triggers or manufacturing approval transitions.
An initial standalone loader check also lacked the real runtime qualifier; this
does **not** establish that the running application itself is incompatible.

The archive-provenance facility below is now implemented. Live activation remains
blocked by missing permission-catalog prerequisites, detailed below. Preserve the
successfully recovered compiled release.
The current 403 alone does not prove a missing user grant; do not add grants simply
to suppress it. Restore/validate the descriptor dependency before changing access.

Authenticated browser evidence: the Partners route renders the “Business Partners”
heading followed by “This list is unavailable”; network capture confirms application
descriptor 200 and list descriptor 403. A screenshot is retained privately as
`partners-after-recovery.png` in the recovery backup directory. All four redeployed
DEV containers are healthy; that does not close this application incident.

## Supported recovery path (implemented 2026-09-24)

Recovery uses `metadata.publication_recovery_archive`, not inserts of published
change sets into live authoring tables. Existing authoring guards are unchanged.
Historical approval and dispatch events remain archived evidence; they are not
reinserted into the live audit stream. A new critical recovery event is recorded.

The operator function `metadata.fn_import_publication_recovery` is executable only
by database administrators, never application roles. It binds tenant, entity,
release, exact signed artifact hash, backup hash, catalog hash and source evidence
to an immutable permit lasting at most one hour. Imports are idempotent only for
identical bytes/coordinates/expiry; conflicting imports fail. Revocation is an
append-only record through `metadata.fn_revoke_publication_recovery`.

The activation adapter rechecks the permit's scope/expiry/revocation, current
author/publisher identities and epochs, current permission-catalog hash, trusted
signing key, historical qualification hash, contract/profile/runtime coordinates,
original audit identities and the receipt hash embedded in the signed manifest.
The ordinary publication loader and real runtime registration qualifier still run.
The original time-limited development qualification is historical evidence only:
the fresh operator permit authorizes replay of the exact artifact, not new content
or a renewal of old authoring approval. Invalid recovery evidence fails closed;
it cannot fall through to the normal authoring approval path.

Operator sequence (DEV only; restore the source archives into the isolated
container documented above first):

1. Run `pnpm exec tsx tooling/scripts/local-dev/recover-business-partner-provenance.mts`
   for the read-only plan. Check the exact artifact, backup and current catalog hashes.
2. Take a current target backup. Apply the registered Studio forward migration
   `20260924_publication_provenance_recovery.sql` using the normal migration runner.
3. Deploy the matching server image before activating; the recovery helper is
   `dist/scripts/recover-dev-publication.js` inside the server image.
4. Run the operator command with `--apply` and
   `--approved-artifact-sha256=654c378b5336674cc7c4f827a77a0c497408f379fdcc5ee9348bba7d824c51e3`.
   This archives provenance, restores the exact signed publication authority rows,
   creates a new deployment, then calls the configured publication orchestrator.
5. Check the activation and acknowledgement, authenticated descriptors/list,
   and the browser. Retain the private receipt and do not claim success from
   container health alone.

The incident command is pinned to DEV/CirrusAtlantic/Business Partner. It is not
an API or Atlas tool, does not start background queue consumers, and grants no
human access. A partial failure retains durable source/deployment evidence;
inspect it before retrying. Expired/revoked permits require fresh operator review
and a designed successor workflow, not an UPDATE of immutable evidence.

The Atlas proposal below remains future work. This manual, auditable path is its
prerequisite, not authorization for autonomous production recovery.

### First DEV attempt and permission prerequisite gap

The registered Studio migration was applied through the forward-migration runner,
after taking `before-provenance-schema.dump`. PostgreSQL integration checks passed
in both an isolated restored database and DEV (transactional fixtures rolled back),
covering immutable evidence, tenant RLS, administrator-only import/revocation and
denial of application-role writes. Host tests: 42 passed; prerequisite tests: 7
passed. The production server image built successfully.

The operator command must run through `start-runtime.sh recover-dev-publication`
to load the normal secret-file, database and object-storage environment. Calling
the Node script directly through `docker exec` omits entrypoint-derived settings.
The allowlisted command composes services but does not start queue consumers.

The live attempt loaded the signed artifact through the normal loader, then failed
at projection staging with `OPERATION_BINDING_PERMISSION_UNRESOLVED`. It did **not**
reach activation authorization or create a successful recovery audit event. The
rebuilt Neon catalog lacks 27 distinct `neon.relationship.bp_target.*` permissions
covering 33 signed scope coordinates. Existing case/qualification permissions
resolve; the missing BP permission definitions must not be replaced with invented
IDs or ignored. Preflight now detects exact ID/code/kind/scope mismatches before
any authority/archive writes.

The original compiled release remains active. The new descriptor deployment
`01a0d13b-8913-7b16-a529-017accaf0e9e` remains pending; no descriptor activation head
was created. One provenance archive and three publication authority rows are
retained, with zero live authoring change sets replayed. The unused recovery permit
was explicitly revoked after diagnosis. Do not rerun it: a reviewed successor
permit design is required before a new attempt; immutable evidence is not editable.

Fresh authenticated checks after the attempt: session authenticated, application
descriptor 200, list descriptor and list both 403. Screen recovery remains open.
Private evidence: `provenance-activation-retry.log`,
`provenance-prerequisite-check.log`, and `provenance-recovery-receipt.json`.

The next scope identified was: inventory the archived permission definitions and their
dependencies against the current catalog, review exact-ID recovery through a
supported catalog publication/import workflow (without restoring human grants),
then issue a separately reviewed successor recovery permit and retry normal
publication. This is an authorization-catalog change, not a provenance-only repair.
QA was not changed. Atlas automation is not implemented.

### Reviewed permission-catalog recovery

The user subsequently approved recovery of the permission definitions explicitly
without human grants. `recover-business-partner-permissions.mjs` performs a
rollback rehearsal by default; applying requires the exact reviewed plan digest.
It is an incident-scoped administrator seed-catalog importer, not an application
permission-management API. Existing triggers and foreign keys remain enabled.

The committed plan restored 27 exact-ID permission definitions and 33 active
scope-compatibility rows from the archived Neon database. Existing active module
dependencies (`bp`, `fnd`) matched and were not changed. MFA requirements for
bank/tax reveal, separation of duties for company qualification, risk tiers and
exact propagation settings were preserved. No delegation, sharing or override
flags were enabled. Plan SHA-256:
`1450400a4de2a7c053057a6c11ab0416fdc97987d27cd2f9a2c4641ba95e9b5d`.

The transaction locked all authorization tables, compared fingerprints before
and after for all 19 non-catalog authorization tables, and committed only after
they matched. No roles, role permissions, user memberships, ACLs, overrides or
delegations were restored. Consequently this catalog recovery does not itself
authorize any human to use the restored permissions. All 27 recovered permissions
currently have zero role-permission grants.

Private evidence: `before-permission-catalog.dump`, `permission-recovery-plan.json`,
`permission-recovery-rehearsal.json`, and `permission-recovery-receipt.json`.
The source archive was inspected in a network-disabled disposable PostgreSQL
container; no full archive was restored over live DEV. QA remains unchanged.

The registered `20260924_publication_recovery_successor.sql` migration adds an
append-only successor chain. Only an administrator can issue a successor to a
revoked/expired terminal permit. Historical evidence and artifact coordinates
must remain identical; only the current catalog hash may be rebound. Forks are
rejected, and activation selects only the terminal permit, never an older valid
one when the terminal permit is revoked/expired. New authoring remains unaffected.
The operator command accepts `--supersedes=<prior-permit-id>`, persists a separate
receipt and creates a new deployment attempt. It never un-revokes an old permit.

Successor PostgreSQL tests cover active-predecessor rejection, immutable evidence,
idempotence, fork rejection, preserved revocation, terminal selection and denial
of runtime issuance. Both the DDL rollback rehearsal and live transactional tests
passed. The original root-import API remains idempotent against the root only.

### Successful descriptor activation and access boundary

The signed descriptor activated through the composed production orchestrator:

- Deployment attempt 2: `01a0d1a6-4bf5-7c6c-9238-b3ae015d5b10` (`activated`).
- Applied release: `01a0d1ac-06d5-7a73-8c1b-f2faeede739d`.
- Artifact SHA-256: `654c378b5336674cc7c4f827a77a0c497408f379fdcc5ee9348bba7d824c51e3`.
- Matching Studio acknowledgement and Neon activation head verified.
- Successor permit: `507ec2d5-4de4-4ab9-becd-9f8d22971d05`; the original permit
  remains revoked. The original pending attempt was closed through
  `publication.fn_transition_deployment` as failed/`RECOVERY_SUPERSEDED`.
- New audit event `metadata.publication_recovery.activation_authorized` has
  service-account attribution, success outcome and critical severity.

The guard originally compared authoring and contract-only signatures. These sign
different payloads: `MetaEntityArtifactSigner` signs the complete compiled artifact,
whereas the authorization compiler signs the contract. The corrected guard compares
the archived revision's contract content and revision/tenant/entity coordinates
against the verified published contract, while retaining normal signature checks.
Regression tests use different signatures and reject changed revision content.
The distinct audit contract was registered through
`20260924_publication_recovery_audit.sql`; its PostgreSQL test accepts workload
events and rejects human attribution, with test rows rolled back.

Verification: 47 focused host tests, 7 preflight tests, host typecheck, production
build, archive/successor/audit PostgreSQL checks and migration inventory validation
passed. A final comparison with `before-permission-catalog.dump` found all 14
non-projection/non-catalog authorization tables unchanged. Zero live authoring
change sets were replayed. Compiled release 25 remains active with its original hash.

Authenticated session and application descriptor return 200; list descriptor and
list return 403. Browser verification confirms the Partners unavailable state.
No role grants exist for the recovered permission definitions, and no human grants
were added to suppress the denial. Further access changes require separate review.
Private evidence: `provenance-final-activation.log`, successor receipt,
`grant-preservation-verification.json`, and `partners-after-permission-recovery.png`.
The isolated recovery container was removed after verification; backups remain.

## Prevention and Atlas self-repair proposal

Track these as separate deliverables; none of the automation below is implemented
by the manual recovery scripts.

1. **Application-readiness inventory.** Maintain expected publications by
   environment, tenant, plane and application, including definition, compiled
   runtime, descriptor, permissions and work-context prerequisites. Classify
   readiness as `schema_ready`, `configuration_missing`, `configuration_invalid`,
   `context_missing` or `ready`; do not overload process liveness.
2. **Durable incidents.** Deduplicate on environment/tenant/plane/application/code.
   Record request IDs, expected versus observed release/hash, first/last seen,
   affected endpoints, owner, remediation plan and verification evidence. Capture
   no tokens, credentials, raw user records or unrestricted database dumps.
3. **Atlas diagnosis first.** An allowlisted, read-only tool checks publication
   source, trusted signatures, activation heads and dependency readiness. It
   proposes a specific runbook and displays its scope and risk to an operator.
4. **Approval-gated recovery.** Bind approval to exact source artifact hashes,
   tenant, environment, target state, plan version and expiry. Rehearse and lock
   the target, recheck the plan, and use supported publication services with
   separate machine identities. Missing source, invalid signature, schema drift,
   permission changes or destructive actions require escalation, not improvisation.
5. **Verify before closure.** Require fresh deployment/activation receipts plus
   authenticated endpoint and browser smoke checks. Retain before-state and
   rollback evidence. A successful container restart cannot close the incident.
6. **Bound automation.** Start with DEV suggestions/manual approval. Later allow
   only policy-approved, idempotent reapplication of an already trusted release,
   with one bounded attempt, cooldown and failure escalation. QA/production need
   explicit environment policy. Atlas must not modify DDL, invent approvals,
   grant itself access or restore unrelated data as a hidden recovery step.

Add the authenticated application-readiness checklist to the clean-rebuild
handover so missing metadata is detected before reporting a usable environment.
