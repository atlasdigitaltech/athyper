# BP2 integration checkpoint — 2026-09-23

## Release 18 — compiled crosswalks and scoped Network browser acceptance

The two requested follow-up gaps are closed for the recorded local fixture.
This supersedes the compiled-surface and scoped-browser pending notes below;
it is not a claim that every unchecked BP2-04/05/06 package item was reconciled.

**Changed:**

- Network was present in the release's section registry but missing from the
  `360` tab's `sectionKeys`. It is now reachable through the published navigation
  using its existing label, **Governance & ownership**. Authorization still
  controls both navigation admission and section reads.
- Published `industry_crosswalk` and `commodity_crosswalk` reference cores and
  child bindings on Identity and Qualifications/Certificates. Both expose source
  and target domain/code, mapping type, confidence, provenance and verification.
  Reference cores have generic writes disabled. Compiled projections deduplicate
  evidence by ID and exclude undeclared fields; identity/qualification permissions
  independently gate their respective collections.
- Crosswalk selection includes either endpoint but always preserves the original
  stored source/target direction. An incoming mapping is reference evidence, not
  an assertion that the inverse mapping is valid. No classification was changed.
- The shared renderer now displays published child collections on fields surfaces
  as well as related-collection surfaces. The retained domain components are no
  longer the sole evidence of crosswalk UI integration.
- Publication exposed a reproducible stale-head cache failure: unpinned release
  resolution could retain release 17 while its artifacts were no longer active,
  producing `COMPILED_ENTITY_ARTIFACT_UNAVAILABLE` until TTL expiry. Unpinned
  coordinates now resolve the current authoritative head; immutable artifact
  caching and within-read release pins remain intact. Tests cover activation and
  withdrawal without serving the old unpinned cached envelope.

**Published and inspected:** signed DEV release **18**, 103 artifacts.

- Studio release: `9a068852-c7e9-5d6b-9c10-eb46ba625f2f`.
- Neon applied release: `01a0cc9d-75ad-70fa-8b29-f496ba875d50`.
- Activated envelope hash: `95fa9eec034a732acb8a610960520c66d347d0bfffd04f5ea0cb72881117ec53`.
- Compiled hash: `sha256:58d78319ef0be68afa8a4fccb3f9f1305f4e8dc6f614bab78c0284b3c5f91bc9`.
- Diff against release 17 is exactly three changed presentations (detail, identity,
  qualifications-certificates) and two added crosswalk reference cores. Other
  active artifacts were carried forward unchanged. Publication used the existing
  scoped DEV author/publisher and Ed25519 signature; no immutable release rewrite.

**Checked:** `tooling/scripts/verification/verify-bp2-compiled-surfaces.dev.mjs`
passes with normal saved CATL logins:

- Admin scoped Network API 200 and real browser affiliate row; commercial and
  governance collections remain separate.
- Owner same-scope Network API 404 and navigation omitted.
- Admin Identity compiled API and real browser show **18** reference mappings for
  the unchanged `isic:01` classification, including 15 AI-generated/unverified
  mappings. Both API sections report the release-18 compiled hash.
- Commodity compiled binding and array projection pass on this fixture, whose
  commodity evidence is empty. Populated commodity mappings remain covered by
  disposable application-role tests, not claimed as populated live acceptance.
- Final browser runs have no page errors or error-boundary surface. A prior run
  during source-runtime reload reproduced `Experience bootstrap failed (502)`;
  retry after reload succeeded. This transient bootstrap failure is distinct from
  the stale-head publication defect above; no authentication bypass was introduced.

All 68 metadata-package tests, 31 focused master-data tests, four focused grouped/
crosswalk UI tests, and ten disposable DB checks passed. Metadata, master-data,
BP product and shared form-detail typechecks passed. Disposable changes rolled
back; live BP record version remains 5 and no new grants were added.

**Remaining:** reconcile the older BP2-04/05 completion checkboxes and organization-
tax ownership disposition against the accumulated evidence, then continue BP2-06's
role/company/revocation acceptance. Do not rerun these now-passing publication and
browser checks merely because historical sections below retain their old status.

## Crosswalk and projection follow-up — 2026-09-23 04:50 UTC

This update supersedes the follow-up's expired cross-tenant session and missing
crosswalk-reader / closed certificate projection notes below. BP2-04/05 remain open.

**Implemented:** commodity and industry crosswalk readers resolve only active,
domain-qualified source/target catalog rows and active directed mappings. Evidence
retains mapping type, confidence, provenance and verification, and is explicitly
read-only; no selected classification is remapped. Commodity evidence remains
under category → code assignment → shared code. Closed provider field policies
retain these fields and routing-default/owner-primary distinctions. Retained BP
industry and commodity components display reference-only evidence with unverified
and provenance labels. No compiled metadata release was published in this update.

Closed certificate projection now requires a fresh native per-file authorization
callback before including allowlisted attachment fields; missing/denied admission
omits the attachment, even if all ordinary provider permissions are granted.
Storage coordinates and arbitrary metadata remain excluded.

Network paging now scans past denied counterpart rows instead of treating a
filtered SQL page as the end of results. The service passes the requested page
size to the repository rather than returning an extra row.

**Checked:**

- After the user refreshed NEON `athyper.admin`, the existing CATL certificate's
  download endpoint returned **403 `ENTITY_CAPABILITY_DENIED`**, with no URL.
  CATL admin still passed certificate read, published Files read, active file status
  and 642-byte synthetic PDF download. No new grants were added.
- Ten disposable application-role checks passed with rollback, including both
  populated seeded crosswalk catalogs, wrong-domain exclusion, deprecated mapping
  exclusion, and pagination past three denied newer counterparts. Existing
  masked/tax/audit/certificate checks remain passing.
- 31 focused backend tests and 7 UI rendering tests passed. The latter cover
  crosswalk labels, malformed evidence, existing identity cards, and actual compiled
  grouped Network rendering: separate commercial/governance groups, published
  fields only, no Mesh/internal data or editable inputs.
- Master-data source/test, BP product and form-detail typechecks passed.
- Live identity API returned 200 with unchanged selected `isic:01` and an empty
  outgoing crosswalk list. This is not populated live crosswalk evidence.
- Signed-in browser record and unscoped 360 navigation rendered. One scoped-query
  browser attempt reached the generic error boundary; another unscoped attempt
  rendered normally but did not admit Network in navigation. Grouped SSR tests
  therefore do **not** establish full signed-in scoped Network browser acceptance.

**Remaining:** wire/qualify crosswalk evidence on the currently published compiled
surface (retained domain-component rendering is not proof of metadata consumption),
complete scoped Network browser/context acceptance, and reconcile the remaining
organization-tax ownership disposition and broader BP2-05/06 checklist. Release 17
is retained, not republished. No live classification or reference data was changed.

## Governed children and certificate evidence — 2026-09-23 follow-up

This checkpoint supersedes the pending child-activation, populated local Network,
tax-reveal and positive certificate-attachment notes in the historical sections below.
BP2-04/05 remain in progress; no overall package closure is claimed.

### Changes

- Manual `amend_partner` cases now pin child-row fingerprints and validate them at
  approval and materialization. Supported child activation is separate from Mesh
  amendment resolution. Independent approval, parent version checks, immutable
  selection, idempotent replay and case/snapshot/audit lineage remain enforced.
- `certificate_evidence` binds an existing active certificate only to a completed,
  scanned, current attachment linked to the same BP. It does not create a qualification
  decision or silently change certificate verification/status.
- Local commercial relationships are projected separately from governance and Mesh
  exchange data. Incoming views preserve stored source/target and are read-only;
  counterpart access and independent governance identity permission are checked.
  Published child-collection rendering and closed Network field paths were extended.
- Certificate attachment admission now uses the current native per-file capability.
  A denied native capability cannot fall back to the legacy attachment permission.
- Canonical SQL changes were installed transactionally in the disposable acceptance
  database and explicitly confirmed local DEV database. No live child status was
  changed directly. CATL case contract `development-v6`, release 3, was provisioned
  using the existing DEV contract path: `014052cd-be86-568e-b126-623e9ffefc43`, hash
  `bf0636112a6e9c44759cb0b58a93875bf613f4c52614773f197e3e6aa7d07cc3`.
  This is distinct from signed compiled metadata release 17, which is retained;
  no new compiled metadata publication is claimed for these source/runtime changes.

### Checked

On BP `01a0cc2b-a958-7703-bade-306f61834dea`:

| Journey | Evidence |
| --- | --- |
| Child activation | Case `d7d90648-3981-4bac-a4b9-38b11f994ca4`: validated/submitted, both CATL owner approval stages completed, materialized; identifier, tax, relationship and industry children active |
| Local Network | Admin direct and compiled section 200 with affiliate row; owner 403 / omitted section 404; missing scope 403, invalid company 400 |
| Protected reads | Authorized identifier/tax reads 200, masked values only; identifier reveal remains unavailable |
| Tax reveal | Normal elevated admin reveal 200, synthetic-value equality checked without logging plaintext; reused reveal ID 409 `BP_360_REVEAL_REPLAYED` |
| Tax audit | `01a0cc75-9b24-7a70-8228-fa7f84d77e26`, `business_partner.tax_registration.revealed`, purpose `acceptance.synthetic`, raw value absent |
| Certificate binding | Case `e83da11d-637b-43ad-984c-13101b96ae4a`: independently approved and materialized; certificate `01a0cc2b-a997-7acb-af88-4000997b0d55` |
| Native file journey | File `5b5d0602-c199-49a7-9654-e6fe5b7773cc`: stage 201, object upload 200, finalization 200; active/scanned PDF, 642 bytes; certificate and published Files section include it; authorized download 200 with synthetic bytes verified |

Master-data source/test typechecks and 148 focused tests passed. After the final
closed Network projection change, source/test typechecks and all 14 provider
projection tests passed again. Form-detail typecheck passed. The expanded
disposable full-profile SQL fixture passed with rollback: real governed activation
and certificate binding, wrong parent, duplicate selection, forged fingerprint,
unlinked evidence, unapproved/self approval, stale row, lineage and replay checks.
Seven disposable projection checks passed, including incoming/outgoing direction,
governance/counterpart denial, protected reads, app-role audit and certificate expiry.

### Still open / retained fixtures

- Live cross-tenant download denial: saved NEON `athyper.admin` is anonymous/expired;
  positive download passed again. A refreshed normal login was requested; no grants
  or MFA bypass were used. CATL admin/owner refresh enabled the completed approvals
  and tax reveal; local source builds themselves do not require MFA.
- BP2-05 shared commodity/industry crosswalk evidence is not established by the
  passing tenant category/code mapping tests. Reconcile broader BP2-05/06 acceptance.
- Final grouped-collection browser acceptance, closed certificate evidence projection
  under backend enforcement, and Network pagination across filtered counterpart rows
  need review before claiming full surface closure. Organization-owned tax records
  remain outside BP child ownership; the plan's remaining disposition item stays open.
- Unsubmitted synthetic intake draft `bbe850ed-5021-4c3e-a852-8196b4b72687` remains
  from an entity-case attachment attempt rejected by capability admission. No file
  was uploaded to that draft; it was not submitted or deleted. The successful file
  is linked only to the existing BP. Preserve/cancel through governed paths if needed.

## Approved scoped Network transition — 2026-09-23 03:32 UTC

The user approved the scoped permission transition and governed child activation.
The **Network permission transition is implemented and published**; child activation
is still unimplemented. No child status was directly updated and no legacy
tenant-wide permission was granted.

The 360 Network policy and the two published presentation gates now use
`neon.relationship.bp_target.network_read`. The service sends the explicit
`business_partner` / `network_read` intent and the stored BP/selected scope to
authorization. There is no fallback to the legacy permission. The existing
temporary CATL admin grant remains limited to the exact organization/company;
CATL owner remains ungranted.

Signed DEV release **17** is active:

- Studio release: `fa27dca4-b641-5002-8cda-3f5aab8bd895`.
- Neon applied release: `01a0cc52-797e-7214-b8fb-2f239daf8500`.
- Envelope hash: `aab2ec866bfd8b447e26ee038b808aed892bcb201b08d5e9ffc093c45158ec50`.
- Compiled hash: `sha256:ba594f6b70c7ab7228353fa76211a40fa7e684ea222f98bf2ed9a2e45afc283c`.
- All 101 artifacts were carried forward from release 16. Inspection of the
  activated payload confirms only `business_partner/presentation.detail` and
  `business_partner/presentation.section.network` changed. Publication used the
  scoped DEV workload's separate author/publisher and Ed25519 signature.

Live checks against BP `01a0cc2b-a958-7703-bade-306f61834dea`:

| Actor/check | Direct 360 Network | Published Network section |
| --- | --- | --- |
| CATL admin, approved organization/company | 200 | 200, release 17 hash |
| CATL owner, same scope | 403 | 404 (omitted) |
| CATL admin, no scope | 403 | Not exercised |
| CATL admin, invalid company | 400 `BP_360_SCOPE_INVALID` | Not exercised |

The successful response is **empty Mesh exchange data**, not populated local
relationship evidence. The existing handler reads Mesh account links/snapshots,
whereas the presentation describes commercial and governance collections. That
provider/presentation mismatch is still open and must not be called BP2-04
relationship acceptance. Preserve the separate Mesh exchange contract when
implementing the local relationship projection.

Verification: 34 focused master-data policy/service tests pass, including scoped
Network admission, wrong-company denial, no-scope denial and legacy-only denial;
20 host backend-mapping/target-policy/read-runtime tests also pass, and
master-data source and test typechecks pass. This remains source-runtime DEV
evidence, not immutable-image qualification.

Next implementation: add a pinned, independently approved child-activation path,
with child ownership/version/status checks and command/audit lineage; the existing
`amend_partner` implementation is specifically tied to retained Mesh field
decisions and cannot safely be reused by merely changing a row's status. Then
verify active masked identifiers/tax and audited reveal, reconcile the local
relationship provider, and finish live certificate upload/read acceptance.

## BP2-04/05 diagnostic and repository acceptance — 2026-09-23

Historical checkpoint below; the Network permission blocker is superseded by
the release 17 result above.

The Network 404 is deliberate page-plan omission: both CATL actors initially lack
`neon.relationship.business_partner_network.read`. The user approved a temporary
CATL admin grant limited to the fixture's company/organization. Rehearsal rejected
the legacy permission because it cannot be assigned at those scopes; nothing
from that rehearsal committed. The applied 24-hour role grants only
`neon.relationship.bp_target.network_read` at the exact company and organization.
Owner is unchanged. IAM now exposes the target permission, but the current
published section and nested source provider still demand the separate legacy
permission. Consequently admin/owner section reads remain 404 and the admin's
direct provider read returns 403. A scoped transition is required; no tenant-wide
legacy grant or grant-alias bypass was added.

**Correction to earlier redaction interpretation:** identifiers/tax emits masking
notices even for an empty authorized result. Both fixture records are deliberately
`draft`, as required by current materialization tests. The reader selects `active`
records only. An approved parent intake is not an implemented child activation
command. No direct status updates or automatic activation were performed in DEV.
Live authorized masked-read/reveal acceptance therefore remains open pending the
governed child-lifecycle decision requested from the user.

Two source repairs are implemented: the restricted tax reader now resolves the
opaque metadata token rather than treating the stored value hash as a token
(recognized legacy token storage remains readable), and tax rows are queried only
when the independently evaluated tax-masked permission is granted. The exact
tax-reveal audit contract is now in the canonical seed (1.15.0, 40 records) and
installed in DEV Neon and the disposable BP2 database. Raw values are excluded
from its metadata audit.

BP2-05's real database exercise exposed and fixed an unmatched parenthesis in the
certificate-attachment reader. The new
`verify-bp2-projections.disposable.mts` refuses non-disposable containers and rolls
back every fixture. Under the application role it verifies masked identifier/tax
rows, tax-field denial, opaque-token resolution, reveal audit admission, current
versus expired/future certificates, and current-certificate evidence versus
certificate-denied/wrong-parent/expired evidence. Active rows and completed-file
metadata here are **disposable test fixtures**, not a DEV lifecycle bypass or
proof of an actual upload/scan workflow.

Expanded `business-partner-bp2-05-rejections.sql` passes cross-tenant categories,
wrong industry/commodity domains, hierarchy cycles, distinct owner-primary versus
routing-default mappings with provenance/confidence, and ambiguous routing/primary
mapping rejection. All changes roll back. Existing focused service and attachment
admission tests pass. This establishes repository/constraint acceptance, not full
live BP2-04/05 closure; governed child activation, Network transition, and a real
certificate-upload/read journey remain required.

## Corrected populated/tax case materialized — 2026-09-23

After the user refreshed sessions, both CATL actors report elevated assurance.
The assigned owner's task was already completed and the corrected case was
approved when rechecked; no second approval was attempted after discovering this.
Normal CATL admin materialization returned 201 for case
`3ab6fdd2-c9d6-4b9b-9058-dd4a4a93642e`, producing BP
`01a0cc2b-a958-7703-bade-306f61834dea`, supplier
`01a0cc2b-a958-71ff-84c2-191ce5915bc5` and snapshot
`01a0cc2b-a96e-7203-afa6-1ac6c64eff74`. Counts are one each for address, contact
person, contact channel, alias, relationship, identifier, tax registration,
classification and certification.

Signed-in identity, identifiers/tax, certifications, addresses and contacts
sections return 200. Identity contains the alias and certifications contains the
synthetic certificate. Identifiers/tax returns an empty collection with two
explicit redactions for this actor, **not** positive masked-read acceptance.
No raw fixture identifier/tax value or opaque tax token appears in these section
responses. Network returns 404, and business activity without selected context
returns 409 `ENTITY_RUNTIME_CONTEXT_REQUIRED`; supplying the case's authorized
organization/company context returns 200. These remaining projection,
authorization and role/context checks prevent declaring BP2-04/05/06 complete.

Local compilation does not require browser authentication. These live governed
commands do: ordinary token refresh is automated, while MFA elevation remains an
independent current-permission requirement. No MFA bypass was enabled.

## Audited capture repaired; corrected case submitted — 2026-09-23

The exact `business_partner.intake_value.protected` audit contract is now in the
canonical common seed (pack 1.14.0, 39 records) and installed incrementally in DEV
Neon and the existing disposable BP2 database. It admits only the exact event,
tenant scope, user actor and execute operation with metadata capture. Application-role
positive admission and an unregistered-event negative check pass with rollback
in both databases. The live successful tax capture resolves to this contract.

Capture now requires audit and compensatable immutable secret creation. It admits
the audit event inside the database transaction **before** creating external material;
an observed transaction/commit failure compensates that successful creation. The
adapter binds compensation to its creation receipt, checks the stored version,
and performs no delete on failed create or changed version. Repeated successful
discard is a no-op. Cleanup failure is a distinct 503 requiring operator
reconciliation, not a success. Process death and ambiguous external-write outcomes
still require reconciliation; this is not a distributed transaction guarantee.

The user-approved compensation repair adds delete to the isolated identity's
existing read/create grant, while narrowing all three to `athyper_ref_*` names in
that project's DEV root. No edit or publication access is added. A real TLS
create/read/discard check passes, with 404 read-back and idempotent discard.
The one historical failed tax-capture orphan was identified by exact secret name,
synthetic content, version 1 and creation timestamp, then deleted and verified 404.
It was not backed up; no business data or other secret was removed. The old
synthetic storage qualification probe remains untouched.

Corrected case `3ab6fdd2-c9d6-4b9b-9058-dd4a4a93642e` now has protected capture 200,
create 201, validation 200 and submission 201. An initial submission 409 was a
fixture idempotency-key collision; using the case ID in the key resolved it.
The protected receipt is retained privately to avoid recapturing on retries.
Independent CATL owner approval returns 403 `PROCESS_TASK_FORBIDDEN` /
`mfa_required`. Fresh normal owner/admin MFA was requested. The case is submitted,
**not approved or materialized**, and BP2-04/05/06 acceptance remains open.

The runtime initially returned 502 because an in-progress notification dependency
was unlinked. An offline frozen-lockfile install linked the already-declared
dependency, then the API was restarted. No unrelated source edits were changed.
Host typechecking remains blocked by the unrelated undefined `outcome` at
`collaboration-service.ts:146`. NEON production-source and secret-store adapter
typechecks pass; the broader NEON test typecheck also has existing integration
import and profile-match fixture errors. Focused capture/adapter checks pass.

## Dedicated DEV protected-value store configured — 2026-09-23

User-approved configuration is now active on the DEV source API only. A separate
Infisical project `e4db2aa3-a133-4d0d-bdbc-07a3a7e7d3e4` and machine identity
`76d3c741-619c-4ad8-bcc5-d4f54b5a78bc` use a `no-access` base role plus explicit
secret read/create privileges for environment `dev`, path `/`. There is no edit,
delete, staging or publication-project grant. Custom roles are unavailable in the
installed edition; the supported [identity-specific privilege API](https://infisical.com/docs/api-reference/endpoints/identity-specific-privilege/v2/create)
provides this narrower grant. The dedicated token expires after seven days and
is held in a private file mounted read-only; no token is committed or logged.

`setup-protected-value-store.dev.mjs` checkpoints native provisioning privately.
The DEV source-mode configuration retains the mount and separate coordinates.
Only the API was recreated; publication worker credentials and membership remain
unchanged. Protected-reference reads/writes use the new store; publication and
other reads retain the original authority. Legacy protected references fall back
to the original read store only on not-found, not on authorization/network errors.
New protected values use native create-only POST, without overwrite/retry fallback.

Live native checks: synthetic create/read 200 with matching content, edit 403,
staging read 403, publication key read 403. Seven adapter tests and 58 host
configuration/composition/signing tests pass; adapter and host typechecks pass.

The governed protected-capture retry now successfully writes its secret, but the
subsequent transactional audit insert rejects the unregistered event
`business_partner.intake_value.protected`. HTTP 500 is **not** passing capture
evidence. No replacement case was created/submitted/approved/materialized, and
no opaque token was returned to the fixture. One unreferenced synthetic capture
secret and one synthetic storage qualification probe remain in the isolated store;
retries stopped rather than producing additional orphans. The next source/DDL
repair is the exact audit contract and capture-failure lifecycle. BP2-04/05/06
acceptance remains open; this supersedes the secret-store authorization blocker.

## Corrected tax case retry — 2026-09-23, secret-store blocker

The corrected runner was retried through the normal CATL admin session. Both
CATL admin and owner can read the existing case (200). Explicit normal BFF
`POST /api/auth/refresh` clears the expired access-token failure before the
non-idempotent protected-capture POST; no assurance was fabricated and no MFA
requirement was removed. The temporary acceptance client now performs that refresh.

Protected capture then reaches the domain service but returns 500 with
`SECRET_STORE_WRITE_FAILED`. Read-only configuration reconciliation confirms the
DEV API's configured token is the existing publication worker identity's token;
the native Infisical membership API confirms that identity has only `viewer`.
No credentials or protected values were included in diagnostic output.

The corrected replacement case has **not** been created, submitted, approved or
materialized. A narrowly scoped protected-value writer/configuration decision is
required before retrying. The publication identity was not promoted and no secret
was inserted through an administrative workaround. This supersedes the login
renewal blocker below; BP2-04/05/06 acceptance remains open.

## Populated-child continuation — 2026-09-23, later session

Fresh NEON sessions allowed CATL owner to approve case
`f8bdbbff-069b-4096-93ed-00408f951664` through its assigned process task (200).
The decision-document gate subsequently became ready. Materialization then
correctly rejected the fixture's unregistered `synthetic_test` identifier scheme;
its proposed `commercial_partner` relationship code is also absent from the
published catalog. The approved snapshot was not rewritten and the materialization
transaction did not partially create the graph. This case is approved, **not**
materialized, and is retained as failed-reference evidence.

The live failure exposed a validation gap: catalog codes had been checked only
by materialization. The host now uses the materializer's
`control.lookup_value_is_active` authority during governed intake validation for
identifier schemes, relationship types, governance roles and tax-registration
types. Unknown/inactive references return 422 without exposing protected values.
The new helper's three tests pass; an application-role transaction confirms a
published scheme passes and the invalid synthetic scheme fails. Host typecheck passes.

Tax reference setup now exists: synthetic CATL jurisdiction
`c9d8f102-5c7b-4d5e-9a42-8d316feb4204`, code `BP2_TEST_MY`, explicitly marked as
DEV test data with no tax rates, real authority or compliance policy. The bounded
`setup-bp2-tax-reference.dev.sql` script was rehearsed with rollback before apply.
No organization tax registration or real financial configuration was created.

Protected capture's browser relay was missing its exact POST operation. Added
only `/api/neon/business-partner-intake/protected-values` to the NEON allowlist,
with tenant admission, CSRF and a 4-KiB body bound. Four relay/composition tests
pass, including denial of GET, missing CSRF and Studio access; relay typecheck
passes. The existing protected-store service remains the only capture authority.

A corrected fixture runner uses published `business_registration` and `affiliate`
codes and the synthetic jurisdiction. It has **not** created a replacement case:
protected capture currently returns `AUTH_TOKEN_INVALID` for saved NEON CATL
admin, despite the session page reporting authenticated/elevated. Normal login/MFA
renewal was requested. No protected token was fabricated or inserted directly.

Signed-in Studio CATL admin now authenticates and returns 404 for the NEON-only BP
comments resource, closing the previously anonymous Studio negative check. Earlier
Mesh negative evidence remains historical; its saved session is currently anonymous.
BP2-04 populated/tax checks, BP2-05 attachment/hierarchy/expiry acceptance and
BP2-06 complete role/context/revocation coverage remain open.

## Governed journey and mention acceptance — latest work

This section supersedes the pending first-journey and mention-admission statements
in the earlier checkpoints below. Signed metadata release 16 remains active.

### Existing supplier draft completed

Case `971f6388-7272-4d10-8ff7-b567590c44d9` is now **applied/materialized**, row
version 8. CATL admin submitted it (201), the independently assigned CATL owner
approved its pinned process task (200), and CATL admin materialized it (201).
The process retained its review-pack gate, maker/checker separation and approval
snapshot. It produced:

- BP `01a0caf1-3f6a-7819-afd7-76ba1e30cab8`.
- Supplier `01a0caf1-3f6a-7848-bb15-e94228078bf4`.
- One address, one contact person and one email channel, plus the organization
  assignment and materialization snapshot. Signed-in Addresses and Contacts reads
  return 200 and include the synthetic materialized data.

Two contract defects were repaired. Company context validation had used
`neon.relationship.entity_case.create`, which is intentionally organization-only;
it now independently uses `neon.context.catalog.read`, retaining the case action
authorization. Draft scope changes retain existing-record update admission and
add proposed-target create admission plus context validation; they no longer
attempt to treat an existing-target update binding as a proposed-target binding.
Context errors retain their domain HTTP status instead of becoming generic 500s.
Regression tests cover denied proposed authority and denied context without saves.

For the user-authorized CATL scope repair, `grant-catl-bp-context.dev.sql` was
rehearsed with rollback, then applied to DEV NEON. It grants only context-catalog
read to CATL admin at the exact selected company and its operating organization
(the catalog's required subtree mode). Membership and both assignments expire
after 24 hours; source reference is `bp2-catl-context-20260923`. No case approval,
materialization, tenant bypass or MFA exemption was granted.

### Cross-actor mentions now work

The directory and command-time principal resolver queried `master.principal`
through self-only RLS, preventing discovery of a valid collaborator. A bounded,
tenant-local `document.collaboration_principal_candidates` function now supplies
only active human principal ID/display-name/auth-epoch coordinates to the trusted
service. It requires current caller plane admission, excludes other tenants and
service accounts, and returns at most 50 candidates. PUBLIC execution is revoked.
The existing fresh baseline permission and parent-record admission checks still
filter every candidate and every submitted mention; requester elevation is never
copied to recipients.

The new common DDL is included in all three foundation manifests and installed
incrementally in DEV Neon/Mesh/Studio. Application-role SQL checks pass with
rollback on all three DEV planes and on disposable Neon: same-tenant discovery,
cross-tenant denial, unadmitted-caller denial, missing-tenant denial and the bound.
The live CATL admin → CATL owner rich mention was created (201), received in the
owner's normal notification inbox, then deleted (204). The successful comment was
`01a0caf7-7df2-7069-9e89-56f23434508a`; receipt is `ca-mention.json` in the temporary
completion directory. Earlier short polling/reload interruptions were not counted
as delivery success; their synthetic comments were also cleaned up.

Checks: case service 78 tests; host context/backend/case authority 23 tests;
experience 104 tests; collaboration 57 tests. Platform-host and master-data
source/test typechecks pass. These checks do not establish immutable-image deployment.
The updated fresh Neon foundation installs all 249 manifest entries with receipts
in a new disposable container. A rerun against the earlier populated disposable
was correctly refused by the fresh-only guard; no reset was used. Read-only DEV
reconciliation remains release 16 / 101 artifacts, zero source mismatches/Core
gaps and seven draft/active differences.

### Remaining scope

Populated-child case `f8bdbbff-069b-4096-93ed-00408f951664` was created, validated
and submitted through the same governed path. It contains an alias, commercial
relationship to the first synthetic BP, masked identifier, domain-qualified ISIC
classification and a custom certificate fact. The review pack is ready and CATL
owner is assigned, but the approval endpoint currently returns `mfa_required`.
Fresh NEON admin/owner step-up was requested; no gate was bypassed. This case is
not yet materialized, and the certificate has no attachment: neither populated
BP2-04 acceptance nor BP2-05 certificate/attachment parity is claimed.

DEV has zero `master.tax_jurisdiction` rows, so the protected tax-reference journey
requires an approved reference-catalog setup; no jurisdiction was invented.
Studio admin remains anonymous pending normal login renewal. BP2-05 crosswalk,
hierarchy/expiry/attachment checks and BP2-06 full role/context/revocation matrix
remain open. The completed initial supplier role materialization is evidence for
BP2-06, not completion of that broader matrix. CA-10 remains open for the remaining
cross-plane/integration checks.

## Latest continuation — release 16

### Subsequent user-approved company grants

The user explicitly requested “grant all authorization for athyper.admin and
athyper.owner for all company”. Applied in DEV NEON to both existing Athyper-tenant
principals: all 23 currently published company-compatible permissions, with exact
assignments to all 19 currently active Athyper companies. Inactive companies,
other tenants, other planes and future catalog additions are not automatically
included. Tenant/organization-only permissions retain their existing contracts;
MFA, separation-of-duties and deny checks remain enforced.

The dedicated role/group is `dev.athyper.all_active_companies.20260923`, with
source reference `user-approved-athyper-company-access-20260923`. Two missing
company scope targets (`athq.shared`, `amre.projects`) were added beneath their
existing legal-entity parents; existing ancestor/subtree grants therefore also
follow the normal scope-tree semantics for these targets. No existing role,
membership, permission compatibility or deny rule was edited.

Reproducible runner: `tooling/scripts/verification/grant-athyper-company-access.dev.mjs`.
The default rehearsal passed and rolled back before explicit `--apply` committed;
reruns fail closed when the dedicated grant already exists. To withdraw these
grants, revoke only the dedicated group's assignments through the authorization
management path using the source reference above; do not delete shared scope
targets or alter pre-existing assignments.

Both normal signed-in accounts now report 19 permitted companies for workforce
read and comment creation. The re-run multi-actor acceptance passes, including
workforce comment creation (201), own deletion (204), BP public/private isolation,
private history denial and cross-tenant BP denial (403). Synthetic comments were
removed through the API, leaving ordinary tombstones. This resolves the missing
workforce company-comment grant blocker below. CATL maker/process scope, CATL
owner mention admission and Studio authentication remain separate pending work;
the Athyper grant does not authorize cross-tenant access to resolve those checks.

This section supersedes the release-14 runtime snapshot and remaining-blocker
statements below; those sections retain the earlier implementation history.

Signed release 15 published BP identity/network/identifier sections, identifier
and tax Cores, workforce Core/operation, and alias/relationship Core/operation
artifacts. Signed release 16 then corrected the supplier intake form: canonical
`name` remains required; unsupported `legalName`/`displayName` inputs are removed.
Release 16 preserves the other 100 release-15 artifact hashes.

| Coordinate | Current activated value |
| --- | --- |
| Studio release | 16 — `6f8966ff-39aa-5e0a-9c17-6c035be4a98b` |
| Neon applied release | `01a0cac1-eef9-7a4c-a4cb-6b1570f8c77d` |
| Envelope hash | `8662087ea8aed7cf934158c6d10d22cb64cf6a75ebfa8146c80b10c6259a4306` |
| Compiled release hash | `sha256:1b8002a2c20df317f6fba20a75058ab06349e923c3caf5d6766d48558c9ff5b8` |
| Artifacts | 101 |

Fresh read-only BP2-00 reconciliation confirms release 16, 248 manifest entries,
592 reviewed tables, zero source mismatches, zero Core binding gaps and seven
draft/active differences. This remains source-runtime DEV evidence, not immutable
image qualification.

Additional implementation and checks:

- Native case schema/workflow coordinates now use the pinned, active publication
  UUID/version and validated bare artifact hash, not the logical compiled IR ID.
  Release discovery admits exact Core members of a bundled manifest, including
  workforce, while retaining tenant and active-head constraints.
- Permission-filtered empty navigation no longer raises an internal error; an
  invalid source definition with no tabs still fails. Empty mention arrays no
  longer require the mentions feature; nonempty mentions still require admission.
- Metadata suite: 67 passed; experience suite: 104 passed. Metadata source/test
  typechecks and experience source typecheck passed. Supplier source-admission
  tests: seven passed; offline metadata validation: 113 artifacts passed.
- Fresh disposable Neon foundation (248 entries), canonical authorization and
  finance defaults installed. The broad BP fixture now succeeds twice: 73 partners,
  72 organization assignments. It no longer invents preferred-remittance company
  acceptance from a verified account, and supplies designation organization scope.
  All 649 company profiles have no fixture-selected preferred remittance account.
  Classification rejection and bank-company-usage SQL fixtures pass with rollback.
- Studio/Mesh web services are running again. Normal NEON admin/owner and
  cross-tenant admin sessions authenticate; Mesh admin authenticates through normal
  SSO. Signed-in Mesh requests for NEON-only BP sections return 404. Studio admin
  remains anonymous, so its signed-in cross-plane check is still pending.
- NEON identity, identifiers/tax and comments reads return 200. Network returns
  404 for the current actor; this is not positive relationship acceptance. Existing
  CATL partners have no identifier/alias children, so empty reads do not prove
  populated protected-child materialization.
- Real multi-actor BP checks pass: collaborator sees public but not private
  comments, author sees private, direct private history returns 403 to collaborator,
  and cross-tenant parent read returns 404. Synthetic comments were deleted through
  the governed API (normal tombstones retained).

Remaining blockers — no grants or governance requirements were bypassed:

1. The synthetic supplier request `971f6388-7272-4d10-8ff7-b567590c44d9`
   was created and validated (13 passed, zero failed, five skipped). It remains a
   draft: submit returns `PROCESS_SELECTION_BINDING_UNAVAILABLE`. Read-only catalog
   inspection confirms the only supplier publication requires company
   `793b6cb3-3c61-57c0-9562-2cbc288bd4cf`; the current maker's action context admits
   organization scope but no company. A company-scoped attempt also exposes an
   unmapped business-context error as HTTP 500. No approval/materialization occurred.
2. Workforce metadata is published, but the available workforce reader has no
   shared collaboration comment grants at company scope: create correctly returns
   `ENTITY_CAPABILITY_DENIED` (403). A suitably authorized test actor or an explicitly
   approved, narrowly scoped role configuration is required for positive acceptance.
3. The mention directory does not admit CATL owner, despite that actor's successful
   signed-in parent read. Recipient admission uses fresh baseline authority; the
   cause remains unresolved. No recipient elevation or admission bypass was added.
   Mention delivery and full CA-07/CA-10 closure remain pending.
4. BP2-04 publication is complete, not its governed populated-child acceptance.
   BP2-05/06 remain partially implemented and require the plan's full acceptance
   matrix; passing classification rejection checks does not close either package.

Sanitized receipts and temporary runners are under `/tmp/athyper-bp2-completion/`;
the release-16 candidate is under its `intake/` subdirectory. Local timestamps in
the generated reconciliation are UTC; this checkpoint uses the workspace date.

## C01/C02 and BP2-02/03 publication

The request Core now declares a read-only `handler_projection` over
`document.entity_case`. Request identity remains the case ID; `request_no` uses
`case_code`, `request_kind` derives from `operation_code`, and the target uses
`target_entity_id`. Request kind and status remain service interpretations, not
generic editable column aliases. The request adapter retains its `register` →
`new_partner` and case/decision/validation status mappings; the case-history
reader retains its own typed projection. Snapshot payloads remain server-only
dependencies. Case row versions and amendment target-baseline versions remain
separate.

The unused `base_record_version` Core/display field was removed after checking
its consumers. The amendment flow's `baseRecordVersion` required path is retained;
it is a governed command contract, not an alias for the case row version.

The actual local publisher now supplies `CompiledEntityRegistry.sourceObjects`
from the target PostgreSQL catalog for both broad and frozen-candidate publication.
It rejects a retired source in a carried-forward artifact before signing or
writing publication state. The offline column catalog was refreshed for cases,
snapshots and the already-present commercial relationship table; retired request
DDL fallbacks were removed. Live column verification now includes `snapshot`.

The signed release replaces seven artifacts and adds contact-role/channel Cores:

- `business_partner_request/core` and `business_partner/presentation.section.requests`
- `address/core`, `address_link/core`, `contact_person/core`
- `business_partner/presentation.section.addresses` and `business_partner/presentation.section.contacts`
- Added `contact_person_role/core` and `contact_channel/core`

The other 88 release-13 artifact hashes are preserved. The candidate uses the
publisher's canonical key ordering; the initial preparation check caught a
different key-ordering implementation before publication. Existing collaboration
and native intake definitions were carried forward.

| Coordinate | Activated value |
| --- | --- |
| Publication key | `metadata.compiled_entity.business_partner` |
| Studio release | 14 — `67267c38-1f06-5eb8-8da7-d28843edf74a` |
| Neon applied release | `01a0caa4-2f19-7805-930a-16041cfc43ad` |
| Envelope hash | `dcce59fe31c8e64b241a4e799b6c1fb66f0ebad0cd235f53dc2d08b7e2c71461` |
| Compiled release hash | `sha256:0969b548b9aca78c7d5c0a9676a13dc027577726e2ea2864e5117ef794d51cde` |
| Artifacts | 97 |
| Signature | Ed25519 through the configured DEVFULL workload authority |

Direct Neon read-back confirms the case storage binding and no remaining
`document.business_partner_request` source in the activated payload. This is a
local source-runtime publication; it does not qualify an immutable deployment
image. The frozen candidate and preparation diagnostics are in
`/tmp/athyper-bp2-integration/`.

## Checks run

- Full fresh Neon foundation: all 248 canonical manifest entries installed with receipts.
- Canonical three-tenant Neon authorization seed applied to the disposable database.
- Address subdivision/timezone/structured-field persistence passed under `athyperapp`; the fixture rolls back.
- Environment-gated master-data PostgreSQL repository suite: 25 passed in a separate empty disposable database.
- Address/contact governed service and related-presentation checks: 86 passed; BP UI checks: 18 passed.
- Case explanation/view/history checks: 15 passed.
- Publisher/source admission and compiler checks: 6 host tests and 9 publication tests passed.
- Offline metadata validator, 35 mutation tests and metadata-layout check passed.
- Platform-host typecheck passed.

The broad development BP fixture provisioner's retired
`operating_organization.domain` dependency was repaired: it now requires an active,
effective procurement capability from the canonical authorization seed instead of
altering organization authority. Its three deterministic tests pass. The next
disposable run reached a separate banking prerequisite and rolled back:
`Preferred remittance requires company acceptance of a current account`.
This broad fixture is not acceptance evidence; its banking setup still needs repair.
The canonical seed and focused application-role address fixture above passed independently.

## Remaining acceptance

After the user refreshed the normal CATL admin login, addresses, contacts,
requests, comments and attachments all returned HTTP 200 against the active
release, and the Addresses page rendered. The initial expired-session 401 is
resolved. The full governed requester/approver/materializer journey remains open;
successful reads do not prove it. No session or authorization bypass was used.

The read-only BP2-00 reconciliation was regenerated against release 14: 248
manifest entries, 592 reviewed tables, 97 active artifacts, zero source mismatches,
zero Core binding gaps and 14 remaining draft/active artifact differences.

## CA acceptance progress

CA-03's contradictory status is corrected to complete. The revision/atomicity/
reporting/application-role isolation SQL fixture passes and rolls back on fresh
Neon, Mesh and Studio databases. Collaboration service tests (57) and attachment
tests (85) pass.

The refreshed signed-in NEON browser passed private comment creation, composer
clearing, reaction add/remove, rich revision editing, immutable revision history
and deletion of the synthetic comment. The first cleanup assertion used an
obsolete dialog selector; the correct confirmation was exercised and both test
comments were removed through the UI (ordinary tombstones retained).

Notification inbox read returns 200; the separate workflow inbox returns 403.
Neither result establishes cross-actor mention delivery. Anonymous NEON comment
access returns 401. Studio and Mesh web endpoints still return 503, which is
infrastructure unavailability, **not** successful cross-plane authorization denial.
The second-entity activation/check, cross-actor restricted-audience and mention
journey, and browser-level cross-plane acceptance remain open. CA-07/CA-10 are
not closed. No grants were widened to make acceptance pass.

Sanitized local diagnostics: `browser-inspection.json`, `ca-journey.json` and
`access-check.json` under `/tmp/athyper-bp2-integration/`.

## BP2-04/05/06 reconciliation

BP2-04 has existing alias/relationship and identifier/tax reference materialization.
Identifier values remain masked; there is no registered identifier reveal command
or reveal permission. The repository and section service now explicitly suppress
identifier `revealable`, even when a provider supplies a protected-storage flag.
Tax reveal retains its separate permission, elevated assurance, purpose/replay
checks, current-authority recheck and audit. Projection tests exclude raw identifier
and tax fields and protected tokens. The six focused protection/company/policy
test files pass (38 tests); master-data source and test typechecks pass.
Identity/relationship/tax child metadata still needs its own publication and
signed-in acceptance before BP2-04 can close. Organization tax registrations
remain outside BP-owned collections.

BP2-05 is partially implemented: tenant-category → code-assignment projections,
domain-qualified industry constraints, provenance/primary-versus-routing flags,
and certificate attachment admission already exist. Its five DDL source tests
pass, but source assertions are not the required application-role materialization
or certificate/attachment journey. Crosswalk presentation, hierarchy selection,
expiry and attachment access parity still require reconciliation and acceptance.

BP2-06 reuses existing role/company readers and per-assignment authorization.
Company relationship tests prove denied names/rows are filtered and missing
profiles remain unextended. Its complete metadata/context/role extension and
revocation matrix has not been accepted. These packages should not be described
as wholly unstarted or complete.
