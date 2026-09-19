# Business Partner runtime completion evidence

This is an engineering progress record, not a release or enforcement approval.
All changes described here are local. No deployment, grant migration, signed BP
artifact, policy-difference acceptance or activation was performed.

## Runtime registrations

Production composition now supplies 42 of the selected 42 registrations from
owning services: seven case operations, 21 read operations, eight governed
action/navigation variants, governed import, export, two restricted-value reveals and two qualification creation variants. Application entry uses the application descriptor;
directory and record operations use the normalized entity surface service.
Sections use the BP 360 service with fixed provider coordinates, retaining its
nested projection and independent-child checks. Governed aliases reject an
unrelated request kind, require parent admission where specified and delegate to
the existing case service. Proposed first-assignment scopes remain distinct from
existing BP assignments.

[Contract evidence](../../governance/policy/reports/business-partner-runtime-contract.dev.json)
pins the selected draft and implementation sources. It deliberately identifies
itself as a fixture: no fixture callable can execute a live service, and this
evidence cannot qualify a deployment or authorize signing. The native registry now passes all 42 selected binding semantics. This does not
prove an authenticated journey or confer permission to sign a new release.

The two qualification creation bindings use a read-only owning-service preflight
backed by the deployed repository. It checks a commercial parent, active
organization and optional active company/organization compatibility. It never
calls a command or authorization recursively. The actual create owner retains
specific role/content validation, idempotency, authorization and audit/outbox.

[Database evidence](../../governance/policy/reports/business-partner-qualification-readiness.dev.json)
records six successful read-only DEV checks under the runtime database role,
including valid organization/company targets and unknown tenant/parent/scope.
This is adapter evidence, not authenticated exact-release qualification.

The import implementation and deployment adapter now use the reviewed dedicated
handler in a separate prepared selection. Its review
packet is [here](../../governance/policy/reviews/business-partner-governed-import-workflow.dev.json).
Subsequent authenticated import approval is recorded in the
[decision export](../../governance/policy/reports/business-partner-governed-import-decisions.dev.json).
Only the isolated review endpoint was redeployed for this approval; the local
runtime implementation remains undeployed and the other completion gates stand.

## Import API and export integration

The [reviewed import selection](../../governance/policy/reports/business-partner-import-release.dev.json)
consumes both exact MFA receipts and adds native `authorizationRuntime` references,
including `business_partner.import.governed_requests.v1`. Its preparer refreshes
the live activation heads, checks nomination and implementation/test hashes and
preserves historical selections and the case correction receipts. Full native
descriptor parsing passes. This is a draft selection, not an authored/signed new
publication release.

`POST /api/neon/business-partner-imports` accepts an envelope with `schemaVersion: 1`,
`release: {releaseId, compiledHash}` and the approved versioned `batch` payload.
The NEON BFF allowlist includes this exact path with tenant, CSRF and idempotency
requirements. Only this API receives a 4 MiB batch plus 4 KiB envelope transport
limit; unrelated APIs keep their existing JSON limit. The intake owner still
enforces its approved 4 MiB batch limit.

The bound service requires matching active metadata, the exact reviewed handler,
permission, scope and preflight, and a matching enforced profile. Legacy/shadow,
missing or incompatible combinations remain unavailable. It pins the release
and rechecks it before every row, stopping on a change without claiming rollback
of already created drafts. The global import workflow preflight performs only
read-only availability checks; the owning intake validates every row before writes.

Export now shares its owning transfer preparation between workflow preflight and
execution. Preflight checks privacy, selected operation, scope and projection
readiness without recursive export authorization, state writes or enqueueing.
Execution still authorizes the exact export and preserves worker/result checks.
Authenticated start/worker/download qualification remains outstanding.

The provider capability transition is now implemented locally for the exact 27
approved source/target permission pairs. Trusted composition supplies the pairs;
HTTP resource hints cannot add them. The backend requires BOTH legacy domain
permission and selected target permission using refreshed authority and target
ownership. Missing target grants remain denied, and arbitrary or duplicate
transitions fail closed. Legacy/shadow execution remains unchanged. This closes
the reproduced mapping failure for identity, contacts and masked banking at the
local adapter boundary; it does not establish live parity or grant new access.

## Restricted-value runtime integration

`bank_reveal` and `tax_reveal` now invoke the same BP 360 owners as HTTP. Native
bindings pin existing tenant-owned resources and reject cross-kind commands.
Read-only preflight checks stored parent existence, audit/replay infrastructure,
historical state and the existing elevated-assurance requirement for tax.
It never reads restricted values, claims a replay key or authorizes recursively.
Execution retains purpose/expiry validation, child lookup, replay protection and
value-free auditing, and now refreshes authorization context before starting.
Command-specific success still requires authenticated qualification.

Qualification service requests now carry explicit operation and stored-parent
coordinates. Existing-child decisions use `qualification_decide`, which cannot
be remapped into either proposed-resource creation binding. It has no selected
binding, so target enforcement denies it; legacy/shadow authorization is unchanged.
The two selected creation registrations now have owning-service workflow
preflights. The [existing-child decision proposal](business-partner-qualification-decision-proposal.md)
sets out two separate bindings, stored ownership cardinality, parent checks and
MFA/SoD conditions. It remains a proposal, without fabricated review receipts or
changes to the selected operation set.

## Current publication refresh

The read-only refresh found activation head 17 unchanged, including its release,
compiled hash, contract hash and eligible-head hash. Original approved candidate
`12203b304945675c8697105ff94319b41c2e1dbdbba4aa42cc225be479aa3900`
became candidate
`fede6e4e5b79dfd3d75ac43fa85378588a5f5a9b1a2202967c726738681e24d1`.

At that earlier capture, the only candidate difference was the request-owner source hash after adding the
non-writing import preflight. Substituting the previous source hash
`1fe5275c2741b5e4beed0b66d5a6fd585da28f8779210fa99c93b587485614af`
in an in-memory comparison reproduces the original candidate hash. No source or
approval was reverted to perform this comparison.

The normal historical accepted-selection preparer correctly fails with
`ACTIVATION_HEAD_OR_CANDIDATE_CHANGED`. The historical accepted selection and five
correction approvals remain intact. A new release review must bind the changed
implementation; removing this check or rewriting old approval hashes would be
incorrect. The latest isolated read-only publication capture is
[`business-partner-import-integration-publication.dev.json`](../../governance/policy/reports/business-partner-import-integration-publication.dev.json);
it confirms the same head 17 and includes the subsequent export source change.
Its 36 original blueprint review classifications are not 36 new pending approvals.
Full native compilation remains blocked by authored native release coordinates
and release-bound authenticated review evidence; the 42 selected runtime binding
contracts now pass. No signing attempt was made past these gates.

## Qualification and policy differences

The preceding integration passed 15 runtime tests, 54 case/import/API tests, 16 transfer
tests, 32 relay-security tests, three import-selection tests and one HTTP body-limit
test. Affected typechecks passed. Earlier publication regression evidence remains
separate. These checks establish local implementation behavior.
They do not establish authenticated success against a new signed release.

The subsequent transition/reveal/qualification-boundary work passed 64 targeted
tests: 20 backend authorization, 11 BP mapping, 25 reveal/provider, five eligibility
and three native reveal binding tests. At that stage the contract fixture registered 40/42 operations.

The subsequent qualification creation work passed 10 targeted tests, 23 native
compiler/review regressions and six live read-only database checks. Host and
master-data typechecks passed. The fixture now registers all 42 selected operations,
with no unresolved runtime binding diagnostic. No signer, authenticated review
receipt or exact-release qualification was substituted with these fixtures.

All 29 recorded policy differences remain unresolved. Earlier legacy/shadow
recapture is retained as historical evidence; it is not reclassified as target
qualification or reviewer acceptance. New gateway permissions have no automatic
grants. Positive target journeys need a separately reviewed exact assignment or
an existing appropriately authorized principal, within the approved window.

Completion still requires the remaining runtime work and permission-transition integration,
release-bound authenticated review storage, compatible native signing,
qualification of that exact release, and explicit disposition acceptance.
Enforcement activation and revocation-preserving rollback approval follow
separately.

## Native release review integration and sequencing

The authenticated release-review adapter now consumes the durable NEON operation
review format only when a new packet pins the exact native release coordinate
and each operation's proposal includes that same release review. It validates
both elevated reviewers, nomination, dates, exact decisions, implementation/test
hashes, current reviewer authority and the unchanged source. Historical packets
without these coordinates cannot authorize signing.

A read-only file loader requires a deployment-pinned manifest for the release ID
and hashes every packet/state/nomination file. It rejects changed bytes, symlink
files and group/world-writable evidence. Host composition now accepts explicit
wiring of this adapter. It is local implementation, not a deployed review or a
new receipt. Thirty-seven targeted publication tests and affected typechecks
passed.

[Current authoring readiness](../../governance/policy/reports/business-partner-native-authoring-readiness.dev.json)
records authenticated Studio sessions for `catl.admin` (author/publisher) and
`catl.owner` (reviewer), with their distinct Studio principal IDs. Those existing
capabilities do not constitute approval of a particular graph. No new grants
were assigned.

A fresh NEON capture still selects head 17. Studio already contains approved
Atlas release 18 under the same publication key, sourced from change set
`28081bdb-5b6e-43aa-8c63-2f60ceeb6aeb`. The authorization successor must preserve
that work: follow release 18 or combine its changes under a new exact review.
The sequencing question is pending; no authoring write, publication, activation
or signing was performed while it remains unresolved. All 29 difference groups
remain unaccepted pending exact-release evidence and explicit dispositions.

## Combined successor prepared for review

The user selected a combined successor preserving Atlas 18. The
[combined review package](business-partner-combined-successor.md) is now backed by
native change set `9f8b8fd7-cd6e-4af7-a08b-7a650d70437b`, revision 2,
**in_review**. Authenticated staging, validation, contract tests and submission
succeeded; no approval was recorded. A compiler-only API compatibility patch was
necessary and is deployed with rollback evidence. Other implementation described
above remains local unless explicitly identified as part of that patch.

The current head is now 18, advanced during preparation outside this workflow.
Its descriptor matches the preserved Atlas predecessor. The sequencing question
is resolved. The combined materializer, exact-release review/signing and
qualification remain separate gates; all 29 differences remain unaccepted.

## Combined successor independently approved

`catl.owner` approved the exact combined successor through the Studio API after
normal login with issuer MFA. The change set is now **approved**, revision **3**.
A read-only database check confirmed the distinct author/submitter and reviewer,
unchanged native contract hash, and preservation of Atlas and authorization
content. The application reported baseline assurance; this graph approval does
not represent elevated release-signing authorization.

The [approval receipt](../../governance/policy/reports/business-partner-combined-approval.dev.json)
and [durable verification](../../governance/policy/reports/business-partner-combined-persisted-approval.dev.json)
record this step. Native materialization, exact-release review/signing,
qualification and acceptance of all 29 differences remain outstanding.
No grants, publication or activation were changed by this approval workflow.

## Combined materialization content rehearsal

The production authoring package now exports
`compileAuthorizationSuccessorDescriptor`. It checks the exact predecessor and
approved descriptor hashes, preserved Atlas content, native authorization and
handler bindings, and absence of reused legacy scope-binding identities. This
is a content gate only; it is not yet wired into a transactional SQL materializer.
Two targeted regressions and package source/test typechecks passed. A fresh
read-only verification confirms that revision 3 remains independently approved.

The [materialization rehearsal](../../governance/policy/reports/business-partner-combined-materialization.dev.json)
passes against that snapshot and explicitly reports no signed release. The
transactional materializer, deployment, exact release coordinates and catalog,
authenticated release-bound review, signed compilation and authenticated
qualification remain required. All 29 differences remain unresolved; neither
their acceptance nor enforcement activation is implied by the content rehearsal.

## Transactional successor materializer deployed

The separate successor ledger and immutable, hash-checked payload store are now
installed in DEV Studio. The materializer rechecks independent native approval,
the exact predecessor and payload, publisher identity, and successor sequencing
inside the release transaction. The API checks the current NEON predecessor and
passes its head coordinates for the signed activation precondition. It does not
reuse the initial-baseline link, whose provenance permits only one successor.

Seven [SQL rehearsal checks](../../governance/policy/reports/business-partner-successor-sql.dev.json)
passed in a rollback-only transaction, including materialization and native
compilation-source retrieval. That test used a deliberately invalid synthetic
signature; it is not signing or authenticated qualification evidence. Source/test
typechecks, host typechecking and 24 publication regressions passed.

The [targeted API deployment](../../governance/policy/reports/business-partner-successor-deployment.dev.json)
is healthy and retains the current Atlas image as its rollback base. The new
Atlas base had omitted the earlier authorization compiler patch; the candidate
reapplied that patch and reproduced the approved native contract hash before
deployment. The native publication worker source adapter is implemented locally
but is not deployed by this API-only patch.

The authenticated native publication script is prepared for the exact approved
revision. Studio login for `catl.admin` is waiting for MFA. No native release has
yet been created by this workflow. Exact runtime compilation/signing still needs
the deployed worker adapter and authenticated release-bound review; authenticated
qualification and acceptance of all 29 differences follow. Business grants and
enforcement activation are unchanged.

## Authenticated native release created

`catl.admin` completed Studio login with MFA and the authenticated native publish
request returned HTTP 202. Read-only verification confirms release
`ba383d04-9a18-4e59-ab4e-3d9726e934c6`: native sequence **2**, publication sequence
**19**, publication status **approved**, and change-set status **published**.
The native signature is present, the independent reviewer remains `catl.owner`,
and successor provenance was materialized successfully.

The [native publication receipt](../../governance/policy/reports/business-partner-combined-native-publication.dev.json)
and [exact release capture](../../governance/policy/reports/business-partner-exact-release.dev.json)
pin the release, native contract, 42 selected operations and current permission
catalog for the next authenticated release review. The capture reports **zero
runtime compilations, artifacts and deployments**. A native signature does not
establish a signed runtime artifact or qualification. Worker integration,
release-bound authenticated review, runtime signing, exact-release qualification
and acceptance of all 29 differences remain outstanding. Grants and activation
are unchanged.

## Release 19 signing review prepared

The [new exact-release packet](../../governance/policy/reviews/business-partner-release-19-workflow.dev.json)
pins release `ba383d04-9a18-4e59-ab4e-3d9726e934c6`, its native contract, profile,
runtime bindings and current permission catalog. Revision
`d78669b00d4ce71f64d5aaf0443576987055bb45c0ba2c21a1dd0275a8706e01`
contains 42 included operations and nine deferrals. Historical operation,
case-correction and import approvals remain provenance; none were copied as
approvals of this new packet. Its review window is explicitly recorded in the
packet and grants no effective responsibilities.

All 17 tests across seven runtime-registration suites passed. Those are local
regressions, not authenticated deployment qualification. The separate same-origin
NEON review service now serves this packet and stores new receipts separately
from the historical import review. `catl.owner` reached the normal MFA step-up;
no new receipt has been recorded yet. Worker signing integration, exact-release
qualification and explicit policy-difference acceptance remain separate gates.

## Release 19 owner review recorded

`catl.owner` recorded all 51 release-bound decisions with elevated MFA assurance
for packet `d78669b00d4ce71f64d5aaf0443576987055bb45c0ba2c21a1dd0275a8706e01`.
Durable receipt: `neon-operation-review:76318a27-8e00-40d2-b6c0-10e65834428e`.
The [review-state capture](../../governance/policy/reports/business-partner-release-19-review-state.dev.json)
contains the authenticated receipt. The review remains incomplete until
`catl.admin` records the independent decisions; that session is waiting for MFA.
No policy differences were accepted and no grants or activation changed.

## Release 19 dual review complete

`catl.admin` recorded receipt
`neon-operation-review:71893488-b534-4726-94fc-acb40c12ac30` with elevated MFA.
Both nominated reviewers now have all 51 decisions recorded against packet
`d78669b00d4ce71f64d5aaf0443576987055bb45c0ba2c21a1dd0275a8706e01`:
42 included operations and nine deferrals, with zero unresolved review rows.
The durable state was verified and sealed into immutable deployment files for the
read-only signing adapter. The [seal report](../../governance/policy/reports/business-partner-release-19-review-seal.dev.json)
pins their manifest hash. Sealing does not establish current reviewer authority;
the signing adapter must recheck that authority, evidence, source and catalog.
Worker signing integration, signed runtime artifact qualification and acceptance
of the 29 policy differences remain outstanding. Grants and activation are unchanged.

## Live signing-review adapter qualified; worker deployment gap confirmed

The deployment adapter now loads a pinned sealed manifest and rechecks active
reviewer identities, exact authorization epochs, the active predecessor, native
release status and immutable evidence hashes. Seven live checks passed using
runtime-role read-only database transactions, including rejection of changed
reviewer epochs, predecessor coordinates and evidence. Epoch zero is valid in
this platform; the implementation now preserves that convention. RLS reads use
the exact nominated principal context.

[Adapter qualification evidence](../../governance/policy/reports/business-partner-release-19-adapter-qualification.dev.json)
records verified review receipt hash
`78bd9a49e5d791182721ed44453f482eb05f09fe540b831aa7a656b3cf815e73`.
Optional worker deployment configuration is implemented locally and host build
and typechecking passed. It has not been installed into the running worker.

[Live worker inspection](../../governance/policy/reports/business-partner-release-19-worker-gap.dev.json)
identified the remaining concrete deployment mismatch: requests and transfers
exist, but record surfaces, BP 360 providers and governed import do not; target
authorization compiler wiring is also absent. The local composition contains
these registrations. Deploy their owner implementations and compiler/review
integration as a compatible worker release before retrying signing. No runtime
artifact or authenticated qualification was claimed, and all 29 differences
remain unresolved. Grants and activation are unchanged.

## Missing worker services and compiler wiring deployed

The [qualified worker deployment](../../governance/policy/reports/business-partner-worker-deployment.dev.json)
is now running and healthy at image
`sha256:b8b1675e0ebf7ec53394f43ac5a332c0241b3682574692810a0d9f66b866bde2`.
A bounded 69-file dependency patch preserves the existing Atlas worker
composition while exposing record surfaces, BP section providers and governed
import, updating their owner implementations, and wiring native authorization
compilation and the sealed review adapter. The old image and compose selection
are retained for rollback.

Candidate checks exercised the real service composition without starting queue
consumers. All eight required capabilities were present; all 42 selected runtime
bindings qualified; both current reviewer identities and the exact review receipt
passed; the live catalog contained 143 entries. Ninety-two affected tests passed,
including signing-review revocation and activation-hold regressions. Package
builds and publication source/test typechecking passed.

The publication job chain previously proceeded from signing directly to dispatch.
Authorization releases now require an explicit activation authorization callback
before dispatch or recovery; absent authorization stays closed. Signing rechecks
current release review and catalog rather than trusting compilation-time approval.
The native predecessor precondition is retained in the final signed manifest.
DEV also has an exact release-19 database activation hold, covering other apply
paths. Rollback retains that hold and never restores a grant snapshot.

The active BP head remains release 18. The post-deployment check found zero
release-19 runtime compilations and signed runtime artifacts. The deployed-worker
blocker is closed; retrying native runtime compilation/signing, authenticated
business-journey qualification and acceptance of all 29 policy differences remain
separate work. Business grants and activation are unchanged.

## Release 19 runtime signing completed; authenticated shadow recaptured

Release 19 now has one native runtime compilation and signed artifact
`7b4f3eb7-e214-45dc-9968-89fc6cae0ff9`, content hash
`a1b5c585802eab7c5a0c3c83b85033a066607476070bfb4e7efb3201618620fa`.
The [stored artifact verification](../../governance/policy/reports/business-partner-release-19-signed-verification.dev.json)
used the running worker's real object store, signature verifier and receiving
runtime registry. Signature, content hashes, manifest and runtime compatibility
passed for 42 operations and 48 scope bindings. The sealed review receipt is
unchanged. This supersedes the earlier runtime-signing blocker.

Two compiler integration defects were corrected:
- PostgreSQL custom enum arrays were delivered as strings. The catalog query now
  casts scope kinds to text before aggregation. The real catalog exactly matches
  the reviewed 143-entry catalog hash.
- Permission compatibility was incorrectly required to equal the operation's
  selected scope set. After authenticated review pins the exact catalog and
  profile, the compiler verifies that every selected scope is supported and emits
  only those selected scopes. It rejects unsupported scopes, duplicate scopes
  and undecoded arrays. Qualification emits only operating_organization, despite
  its retained permission supporting other scopes. No definitions or grants changed.

Twenty-seven compiler/activation tests passed, including two new regressions;
publication build and source/test typechecking passed.
[Worker deployment and rollback](../../governance/policy/reports/business-partner-worker-compiler-deployment.dev.json)
record the installed image. Automatic dispatch was rejected with
ENTITY_AUTHORIZATION_ACTIVATION_APPROVAL_REQUIRED as intended. Release 18 remains
the active head; the database activation hold remains installed.

Authenticated NEON catl.admin login was refreshed and
[40 read/UI checks passed](../../governance/policy/reports/business-partner-release-19-shadow-browser.admin.dev.json).
Selecting the signed profile initially exposed an older API parser; the
incompatible selection was rolled back immediately. A bounded API parser,
evaluator and observer dependency update was tested against both old and new
profiles, with 33 shadow/evaluator regression tests passing, then deployed.
The [healthy API deployment](../../governance/policy/reports/business-partner-release-19-api-deployment.dev.json)
now observes the exact release-19 profile in shadow while retaining legacy enforcement.

These browser checks do not establish full exact-release execution qualification:
the active descriptor is still release 18. The causal comparison checker rejected
the recapture because the observer matches legacy permission codes against the
new dedicated permission codes.
[Correlated gap evidence](../../governance/policy/reports/business-partner-release-19-shadow-gaps.dev.json)
preserves 34 mapping-gap groups and 14 decision groups. These observer groups are
distinct from the existing 29 policy-difference groups; none were accepted.

Remaining work: qualify explicit legacy-to-target observation mappings (including
deferrals), recapture complete causal comparisons, qualify command/import/export/AI
and revocation journeys against the signed release through a compatible diagnostic
deployment, and obtain separate policy-difference acceptance. Grants and activation
are unchanged. Rollbacks retain current denials, revocations and the activation hold.

## Release-19 shadow observation mappings fixed and two personas recaptured

The observer now loads a separately hash-pinned predecessor profile solely to
identify legacy observations by operation. Target evaluation uses only the signed
release-19 profile and its bindings; it never translates legacy grants. Explicit
deferrals produce their real unavailable state and deferred trace. The capture
checker distinguishes those reviewed deferrals from unexpected unavailability.

[Deployment evidence](../../governance/policy/reports/business-partner-release-19-observation-deployment.dev.json)
records the bounded observer patch and rollback. Nineteen observer tests passed,
including dedicated-permission non-inheritance and no execution for deferrals.
Host build and eleven difference-checker tests passed.

Fresh authenticated captures passed 40 admin checks and 29 owner checks, including
the owner's denied network/activity APIs and UI. The initial owner run assumed an
administrator's access and failed at network; the explicit existing restricted
persona expectations passed without grant changes.
[Admin capture](../../governance/policy/reports/business-partner-release-19-causal-shadow.admin.v2.dev.json)
and [owner capture](../../governance/policy/reports/business-partner-release-19-causal-shadow.owner.v3.dev.json)
contain 1,686 correlated observations, zero mapping gaps and zero unexpected
unavailable observations. Expected deferrals remain in the evidence. These are
shadow discovery/read comparisons, not full exact-release command qualification.

The [revision-bound policy proposal](../../governance/policy/reviews/business-partner-release-19-differences.proposal.dev.json)
covers all 29 historical rows and 37 distinct current difference groups. Revision:
1b85b834ee0c8016a312a7f635388771ffbcf9d2f063e867174fe7123430b0c4.
It proposes accepting the two explicit synthetic semantics, preserving the 27
historical aggregates with their unprovable original per-event causes, replacing
their use as current qualification evidence with the linked traced captures, and
accepting the separately enumerated current discovery differences. Historical
evidence replacement is explicitly a review choice, not retrospective proof.
All acceptance fields remain null. The original difference ledger is unchanged.

Grants and active release 18 remain unchanged. Explicit policy acceptance and
full signed-release command/import/export/AI/revocation qualification remain
separate gates; passing this observer milestone does not establish execution parity.

## Explicit policy-disposition acceptance recorded

The user accepted proposal revision
`1b85b834ee0c8016a312a7f635388771ffbcf9d2f063e867174fe7123430b0c4`
in direct response to the presented review packet. The
[receipt](../../governance/policy/reviews/business-partner-release-19-differences.acceptance.dev.json)
records all 29 historical and 37 current dispositions as explicit conversation-user
acceptance. It does not claim an authenticated catl.owner/catl.admin approval.

The [successor review checker](../../governance/policy/reports/business-partner-release-19-difference-acceptance.dev.json)
verified proposal revision, source and regression hashes, signed artifact identity,
historical row coverage and every accepted disposition. Zero reviewed dispositions
remain unresolved. Seventeen tests passed, including source/proposal changes,
missing or duplicate decisions, and refusal to treat acceptance as activation.

The original historical ledger remains intact. Its unknown per-event causes were
not relabeled as confirmed: their replacement as current evidence was explicitly
accepted. Use the successor review result for this release's accepted shadow
discovery/read scope; the original report remains historical evidence. The proposal
generator now refuses to overwrite the accepted packet.

Policy-disposition acceptance is complete for this revision. Full exact-release
command/import/export/AI/revocation qualification, enforcement approval and activation
remain separate gates. No grants or activation settings were changed.

## Execution qualification started; retained command paused at normal MFA

Authenticated IAM capture confirms both existing qualification accounts lack the
27 dedicated BP target permissions. Their live sessions and existing command
permissions were verified without edits to grants.
[Readiness evidence](../../governance/policy/reports/business-partner-release-19-execution-readiness.dev.json)
and the [permission-gap proposal](../../governance/policy/reviews/business-partner-release-19-qualification-grant-gaps.dev.json)
identify exact permission IDs and supported scope kinds. This proposal assigns
nothing and is not grant-migration ready; positive target import/export/global-read
journeys need separate approved qualification scopes and grants.

An isolated case `7f2d0fc5-b86d-4483-babd-218313f0cd42` was created, validated and
submitted through authenticated BFF APIs. Anonymous creation, requester/approver
separation, premature application, and incompatible internal/general subtype
validation were exercised. The invalid subtype was rejected before approval.
[Command evidence](../../governance/policy/reports/business-partner-release-19-retained-commands.dev.json)
preserves every result. Assigned owner approval returned
BUSINESS_PARTNER_REQUEST_STEP_UP_REQUIRED; the normal issuer MFA flow is pending.
No approval or application is claimed. This journey uses retained enforcement,
so it does not establish full target-release execution parity.

Thirty-six backend authorizer/evaluator tests passed as regression evidence;
they are not authenticated revocation or deployment qualification.

## Retained authenticated command journey applied successfully

After normal catl.owner MFA step-up, both assigned approval stages returned 200.
catl.admin materialization returned 201. A separate authenticated case-view read
confirmed persisted status applied for case
`7f2d0fc5-b86d-4483-babd-218313f0cd42`.
[Command evidence](../../governance/policy/reports/business-partner-release-19-retained-commands.dev.json)
preserves the original MFA rejection alongside the successful resumed stages.
The incompatible internal/general request remains rejected before submission;
the valid approved snapshot was preserved.

This completes the retained-enforcement command journey, not target-release
execution qualification. Neither account has the 27 dedicated target permissions.
Positive target import/export/AI/global-read paths need a separately reviewed
qualification grant/deployment plan. Live target revocation qualification also
requires an approved allowed baseline; library revocation tests are not a substitute.
No grants or activation settings changed.

## Exact temporary test-grant proposal rehearsed; approval pending

[The separate grant proposal](business-partner-release-19-test-grants.md) specifies
27 dedicated permissions for catl.admin only: 21 tenant permissions and six
organization/company permissions at both exact coordinates. It creates three
dedicated roles/groups with 33 role-permission rows and an explicit four-hour
window ending 2026-09-10T10:35:00Z. Tenant permissions cover all DEV tenant BP
records; they are not a test-record ACL. catl.owner receives no new permissions.

The actual database rehearsal validated named-principal admission, published
permission IDs, scope compatibility, role/group identity conflicts and constraints.
Every existing captured authority row remained unchanged. ROLLBACK completed and
a subsequent read found zero proposed roles/groups. Nothing was applied.
Proposal revision:
`a4ef0dbcc40af46758034a70698463b5f6ec9bfbbe07a43497eefad1fe5c9176`.

This separate proposal requires explicit grant approval because earlier reviews
excluded grant changes. It does not authorize release activation or itself prove
target execution qualification. The original accepted policy evidence is unchanged.

## Temporary qualification grants approved and applied

The user approved exact proposal
`a4ef0dbcc40af46758034a70698463b5f6ec9bfbbe07a43497eefad1fe5c9176`.
The [application receipt](../../governance/policy/reports/business-partner-release-19-test-grants-applied.dev.json)
confirms three assignments and 33 role-permission rows committed at 06:37 UTC,
covering 27 unique permissions for catl.admin. Authenticated IAM shows every
missing target permission now present; catl.owner is unchanged. Existing authority
rows remained unchanged. These temporary grants expire at 10:35 UTC / 18:35 Malaysia
time today; no permanent steward responsibility was assigned.

The scoped cleanup tool rehearsed revoking only the three new memberships and
three new group-role assignments, then rolled back successfully. No prior grants,
denials, ACLs, delegations or revocations are restored by cleanup.

Fresh [browser checks](../../governance/policy/reports/business-partner-release-19-granted-shadow-browser.admin.dev.json)
passed all 40 checks. [Post-grant shadow evidence](../../governance/policy/reports/business-partner-release-19-granted-causal-shadow.admin.dev.json)
captures 1,204 decisions; target entry/read allows and import/export preflight
requirements now appear. Remaining provider/context denials are retained for
qualification, not accepted automatically under the old unchanged-grant review.
The old accepted evidence and proposal are preserved. Full target execution
qualification remains open, and release 18 stays active with release-19 hold intact.

## 2026-09-10 — isolated release-19 execution deployment

Deployed dedicated API/worker processes, PostgreSQL plane snapshots, Redis and object storage on an internal Docker network with no published ports. Native signed-artifact loading qualifies the concrete runtime registrations in both processes; the cloned NEON head is release 19. Shared DEV remains release 18 with its activation hold enabled. No additional business-user grants were assigned or extended.

An operator-authenticated API request and a queued worker job independently read the active release-19 native descriptor and emitted matching artifact receipts. Missing operator authentication and mismatched requested artifacts are rejected. See the [deployment report](../../governance/policy/reports/business-partner-release-19-isolated-deployment.dev.json) and [isolated execution runbook](../runbooks/business-partner-release-19-isolated-execution.md).

This closes the isolated deployment/descriptor-execution milestone. It does not close full target execution qualification: business-user IAM trust transport, command/import/export/AI journeys and revocation synchronization against the isolated snapshot remain to be qualified. The operator diagnostic token cannot authorize BP commands or account approvals.


## 2026-09-10 — isolated commands and governed import qualified

The [commands/import gate](../../governance/policy/reports/business-partner-release-19-isolated-commands-import-gate.dev.json) now passes on the exact signed release-19 artifact and final isolated API/worker image. catl.admin completed create → validate → submit; catl.owner independently approved with MFA; catl.admin applied with MFA. Persisted case `4e9c4bc0-0568-44e0-b11b-0e0588dd561c` records successful materialization and distinct submitter/approver principals.

Governed JSON import creates draft requests with preserved import provenance. Retry identity is verified against immutable creation evidence; identical retries replay and conflicting payloads are rejected. Incompatible supplier data is rejected before a request is created. Direct create/update, legacy direct import, premature application and self-approval are denied. All nine deferred operations remain absent from signed native bindings.

Engineering corrections cover native decision modes, case ownership/binding adapters, owning-service target authorization, import route/parser/validator registration and persisted import replay semantics. The isolated host uses real runtime handlers, stored ownership resolvers and workflow preflights. The gate records 105 passing regression tests and source/clone authority equality. See the [runbook](../runbooks/business-partner-release-19-isolated-execution.md) for trust expiry and execution limits.

This closes the isolated commands/governed JSON import milestone. It does not close export, AI, full provider/field and live revocation qualification, or authorize shared activation. Shared DEV stays on release 18 with the activation hold enabled. No additional grants were assigned or extended, and existing policy acceptance evidence was not rewritten.


## 2026-09-10 — export, AI retrieval and local live revocation qualified

The [new gate report](../../governance/policy/reports/business-partner-release-19-export-ai-revocation-gate.dev.json) passes on the recorded successor image and signed release-19 artifact. An authenticated export completed through the worker and downloaded 125 rows with exactly the authorized fields. The real entity record AI handler/gateway returned the published summary and source citation; invalid projections and unauthorized reads were rejected. 101 focused regression tests passed.

Local live revocation is qualified: three temporary clone memberships/assignments were revoked after a job was queued. Subsequent record reads, AI retrieval, export requests and download-link issuance were denied. The stale queued job failed for revoked authority without producing an artifact. The clone remains revoked; shared DEV's authority hash, release 18 and activation hold are unchanged.

The IAM fix selects operation bindings from the active tenant artifact, excluding incompatible global bindings and preventing fallback when a selected binding is retired. Collection field checks now authorize the directory and retain per-record reads. Export authorization and worker projections share one field selection; conflicts fail before queueing.

AI evidence is limited to the actual retrieval handler/gateway through the authenticated isolated harness. Full Atlas conversations, continuous cross-instance revocation synchronization and immediate invalidation of previously issued presigned URLs are not qualified. Earlier command/import evidence still identifies its original execution image. No claim of full migration closure or enforcement activation is made. See the [runbook](../runbooks/business-partner-release-19-isolated-execution.md) for the exact boundaries and read-only checker.


## 2026-09-10 — isolated qualification phase closed

Status: **Closed for the agreed isolated qualification scope**, as requested by the user. Closure is supported by the [commands/import evidence](../../governance/policy/reports/business-partner-release-19-isolated-commands-import-gate.dev.json) and [export/AI retrieval/local revocation evidence](../../governance/policy/reports/business-partner-release-19-export-ai-revocation-gate.dev.json). Each receipt retains its own execution image; closure does not assert that all journeys ran on one successor image.

The completed scope covers isolated signed release-19 execution, authenticated governed commands and JSON import, export execution/download, AI record retrieval, and local live revocation including queued stale authority.

At the recorded qualification boundary, shared DEV remains on release 18 with unchanged grants and its activation hold enabled. Clone test grants remain revoked. This documentation change does not modify grants, activation or runtime state.

Full Atlas conversations, continuous cross-instance revocation synchronization, immediate invalidation of previously issued presigned URLs, remaining provider/field coverage, and qualification of every journey on one activation candidate remain separate work. Shared enforcement approval, grant migration and compatibility retirement remain separate gates. This is phase closure, not full migration closure or release activation approval.
