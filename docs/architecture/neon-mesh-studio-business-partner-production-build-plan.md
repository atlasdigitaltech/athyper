# NEON, MESH, and STUDIO Business Partner production build plan

**Status:** In progress

**Started:** 2026-08-28

**Architecture:** [NEON Business Partner onboarding, integration, and extension architecture](./neon-business-partner-onboarding-and-extension-design.md)

## 1. Delivery rule

Build one production path and reuse it for both intake modes:

```text
NEON manual/API/import ---------+
                                +-> NEON Business Partner request
MESH recipient projection ------+        -> validation and duplicate review
                                         -> workflow approval
                                         -> idempotent materialization
                                         -> qualification/readiness
                                         -> approved NEON master

STUDIO -> versioned definitions, schemas, mappings, workflow policy
```

No MESH consumer, import adapter, generic record mutation, or STUDIO publication may bypass the request, authorization, approval, and materialization boundary.

## 2. Sequence and dependencies

| Order | Work package | Plane | Depends on | Exit evidence |
|---:|---|---|---|---|
| 1 | Request, evidence, and validation persistence | NEON | Existing master/workflow/snapshot foundation | DDL, migration, RLS, lifecycle and database tests |
| 2 | Request contracts and authorization catalog | NEON/common | 1 | Typed commands, exact permissions/scopes, negative tests |
| 3 | Request service and repository | NEON | 1–2 | Create/read/patch/validate with idempotency and optimistic concurrency |
| 4 | Workflow submit and decisions | NEON | 3, existing workflow engine | Atomic submission, no-self-approval, return/reject/approve tests |
| 5 | Registration materializer | NEON | 4 | Atomic partner + Phase 1B supplier/org assignment, snapshots/outbox, retry tests |
| 6 | Aggregate view and onboarding UI | NEON Web | 3–5 | Create/edit/view/review journeys, accessibility and E2E evidence |
| 7 | Qualification and readiness | NEON | 5 | Scoped qualification, risk hook, eligibility reason codes |
| 8 | Preferred supplier designation | NEON | 7 | Effective-dated org/company/commodity preference; approval and expiry tests |
| 9 | MESH publication contract | MESH | Approved field/authority matrix | Immutable recipient-safe publication, snapshot, outbox and withdrawal |
| 10 | Recipient projection and inbox | NEON | 9 | Dedupe, ordering, schema/hash verification, replay and quarantine |
| 11 | MESH match/diff/request adapter | NEON | 3, 10 | Pinned selective-acceptance request; no direct master write |
| 12 | STUDIO definitions | STUDIO | Stable contracts from 2, 7, 9–11 | Signed schemas, form/view descriptors, mapping and workflow versions |
| 13 | Supplier/customer extensions | NEON | 5, 7 | Independent add-role and dual-role flows |
| 14 | Organization/company configuration | NEON | 7, 13 | Compatibility and company-profile readiness gates |
| 15 | MESH account and bank linkage | MESH/NEON | 10–14 | Directional account link and separately verified bank change |
| 16 | Production hardening and rollout | All | All prior packages | Load, security, privacy, DR, reconciliation, rollback, and release certification |

## 3. Build increments

### Increment A — persistence and lifecycle kernel

- `document.business_partner_request` for manual, MESH, import, and API sources.
- Append-only evidence and ruleset-pinned validation records.
- Tenant-safe foreign keys, bounded JSON, source pinning, request idempotency, lifecycle guard, forced RLS, and non-delete application grants.
- Forward migration and schema/client projection.

### Increment B — commands and workflow

- Commands: create draft, patch draft, validate, submit, withdraw, return, approve, reject, retry apply, and supersede.
- Expected request version on every patch/transition.
- Transactional workflow request/stage/work-item creation.
- Decision fingerprint binds payload, evidence manifest, validation run, duplicate resolution, ruleset, workflow, scope, and source/base version.
- Self-approval denial and exact decision-time authorization.

### Increment C — Phase 1B registration materializer

- Normalize and lock the approved request.
- Recheck duplicates, scope compatibility, source/base versions, and volatile validations.
- Create Business Partner, supplier in the approved lifecycle state, and procurement operating-organization assignment atomically.
- Capture immutable snapshot, audit event, outbox event, and result IDs.
- A failed transaction leaves no partial master and remains safely retryable.

### Increment D — NEON experience

- Production Business Partner descriptor and aggregate detail contract.
- Draft wizard, duplicate review, evidence, validation summary, submission, review diff, decisions, recovery, and audit timeline.
- List/detail visibility matches current operating-organization scope.
- Identity-only fallback uses an explicitly authorized unassigned queue if chosen by product owners.

### Increment E — qualification, risk, and preference

- Registration approval and commercial qualification remain distinct decisions.
- Existing `control.business_partner_qualification` owns scoped eligibility.
- Existing `master.party_risk_assessment` provides evidence to qualification and blocks.
- Add an effective-dated supplier preference designation; do not use a supplier/global Boolean or metadata flag.
- Readiness resolver becomes the only eligibility answer used by Procurement, Sales, AP, AR, and payment commands.

### Increment F — MESH

- Profile publication is immutable, versioned, hashed, recipient-filtered, and bank-free.
- Bank disclosure is a separate recipient grant and transport.
- NEON stores recipient-local projections and checkpoints; it never uses cross-database FKs.
- Projection changes create/update a request proposal and never overwrite approved NEON master data.
- Recipient relationship direction proposes supplier/customer role explicitly.

### Increment G — STUDIO

- Author and publish entity/form/view descriptors, request payload schemas, validation declarations, workflow definitions, code mappings, and integration compatibility.
- Target planes consume signed pinned definitions locally.
- STUDIO outage cannot stop existing NEON or MESH transactions.
- Publishing a definition never mutates partner instances automatically.

## 4. Mandatory gates per work package

Each package must include:

1. canonical DDL and forward migration when persistence changes;
2. generated/client schema consistency or a documented projection boundary;
3. exact permission and scope compatibility;
4. unit, contract, database integration, negative authorization, and idempotency tests;
5. tenant/RLS, sensitive-data, payload-bound, and audit checks;
6. telemetry, stable error codes, operational runbook, and reconciliation evidence;
7. backwards compatibility, rollback strategy, and release qualification;
8. updated architecture/build status.

## 5. Current checkpoint

| Item | Status |
|---|---|
| Pre-build all-changes baseline | Complete — commit `8000cbbe` |
| Target architecture | Complete |
| Production sequence | Complete |
| NEON canonical request/evidence/validation DDL | Complete — tables, constraints, indexes, lifecycle guards, forced RLS and grants |
| Forward migration | Complete — `20260828_neon_business_partner_request_foundation.sql`, NEON-only manifest entry |
| Database/runtime contract tests | Complete — application-role draft insert, lifecycle denial, forced-RLS tenant isolation, grants and schema contract verified against local `athyper_neon` |
| Three-plane reference seeds | Complete — 19 Studio, 28 NEON and 21 MESH manifest seed entrypoints applied twice; plane counts and migration ledgers verified with zero gaps |
| Seed and master-data regression gates | Complete — 71-file seed contract lint, 98 database tests and 8 master-data tests passing |
| Request authorization catalog | Complete — seven deterministic, operating-organization-scoped permissions; live migration and idempotent replay verified |
| Request contracts/repository/service/API | Complete — host-composed create/read/list/patch/validate API, exact-plane transactions, idempotency, optimistic concurrency, ruleset-pinned append-only findings, duplicate candidates, audit/outbox, readiness and HTTP telemetry |
| Work Package 3 live gate | Complete — authenticated create `201`; get/list/patch/validate `200`; stale validation `409`; missing token `401`; scoped permission denial `403`; six validation rows plus governed audit/outbox events verified in NEON |
| Validation transition migration | Complete — `20260828_neon_business_partner_request_validation_transition.sql` applied through the forward-migration ledger; all recorded migrations are `applied` |
| Business Partner audit event contract | Complete — governed lifecycle event contract seeded and verified in Studio, NEON and MESH |
| Request workflow | Work Package 4 feature implementation complete — atomic submit, canonical workflow request/stage/work item, return/reject/approve, correction/resubmission, submission/decision fingerprints, exact-version and no-self-approval enforcement |
| Work Package 4 runtime gate | Complete — authenticated BFF submission `201`, self-approval `403`, baseline-assurance decision `403`, and independent elevated-MFA approval `200` verified live |
| Request materializer | Work Package 5 complete — approved Phase 1 supplier request atomically creates the Business Partner, supplier, operating-organization assignment and immutable snapshot; exact replay and conflict behavior verified live |
| Aggregate view/onboarding UI | Work Package 6 complete — organization-scoped request queue, create/edit/view/review commands, materialized aggregate, deep links, permission-aware actions and live accessibility/API evidence |
| Qualification and readiness | Work Package 7 complete — scoped maker-checker qualification, deterministic readiness, risk/block hooks, stable reason codes, NEON UI and live authenticated evidence |
| Preferred supplier designation | Work Package 8 complete — governed effective-dated organization/company/commodity designation, independent approval, revocation, expiry, overlap resolution and readiness signal |
| MESH publication contract | Work Package 9 complete — immutable recipient-safe profile publication, snapshot/outbox, authorization and governed withdrawal |
| MESH recipient projection/inbox | Work Package 10 complete — immutable recipient inbox/snapshots, dedupe, serialized monotonic ordering, schema/hash verification, replay and quarantine |
| STUDIO definitions | Work Package 12 complete — immutable authored revisions, signed artifact type, bounded author/read/publish API, and verified local offline projections on all three planes |
| Organization/company configuration | Work Package 14 complete — governed role assignment and exact-company supplier/customer finance profiles, qualification and compatibility gates, stable readiness reasons, NEON UI, forward migration and production images |
| MESH account and bank linkage | Work Package 15 complete — directional approved account mapping, separately approved masked disclosure, recipient projection, independent local bank verification, explicit preferred-remittance application, database payload guards and production runtime image |
| Production hardening and rollout | Work Package 16 release candidate complete — durable delivery/reconciliation workers, staged flags, governed replay, load/security/privacy gates, alerts/dashboard, DR/rollback runbook and immutable runtime image; live staged rollout and owner certification remain release gates |

## 6. First release acceptance path

```text
Authorized NEON maker
  -> creates manual supplier-onboarding request
  -> saves and validates registration evidence
  -> resolves or justifies duplicate candidates
  -> submits in procurement organization scope
  -> independent steward approves
  -> materializer creates partner + supplier + organization assignment once
  -> partner appears in the scoped list and aggregate view
  -> later amendment repeats the governed diff/approval path
```

The equivalent MESH release path begins from a pinned recipient projection and converges at the same request validation step.

## 7. Work Package 3 completion evidence

- Runtime readiness: `business-partner-requests.neon=healthy` validates the request/validation tables and all seven permission definitions.
- API surface: `POST/GET/PATCH /api/neon/business-partner-requests`, list query, and `POST /:requestId/validate` are registered behind verified IAM context.
- Validation finalization uses one NEON transaction: draft/version claim, ruleset evaluation and duplicate lookup, append-only finding inserts, request summary/status update, audit and outbox.
- The live validation evaluation used ruleset `neon.business_partner_request.phase1@1`, persisted six findings, and advanced row version `2 -> 4`; replay with version `2` returned `409`.
- Audit events `business_partner.request.created`, `.updated`, and `.validated` resolved to the active `business_partner_request_event` contract and each produced a matching outbox event.
- Positive authorization used a temporary operating-organization-scoped local test assignment. That assignment is retained as revoked authority evidence after the test; production tenant role binding remains an onboarding/configuration responsibility rather than a global reference seed.

## 8. Work Package 4 completion evidence

- API contracts and routes now expose `POST /:requestId/submit` and `POST /:requestId/decisions` with explicit request/work-item versions and command idempotency keys.
- Submission runs in one exact-plane NEON transaction: it locks the validated draft, pins the compiled workflow artifact, creates the canonical workflow request/stage/work item, binds the immutable review fingerprint and advances the request to `pending_approval`.
- The Phase 1 workflow resolver discovers active, in-scope holders of the exact decision permission, excludes the submitter and denied/inactive authority, and refuses submission when no independent approver exists. STUDIO publication replaces the pinned Phase 1 artifact at Work Package 12 without changing the runtime persistence boundary.
- Approver discovery crosses authorization RLS only through `document.fn_business_partner_request_approvers`: a tenant/scope-checked, public-revoked, bounded security-definer function installed by `20260828_neon_business_partner_workflow_resolver.sql`. The migration is ledger-applied and its second run is idempotent across all three plane manifests.
- Decision commands require elevated authentication through the permission contract, re-evaluate organization/company scope, verify pinned workflow/work-item coordinates and eligibility, apply optimistic concurrency, and persist a command fingerprint in the terminal work-item outcome.
- Maker-checker separation is enforced by the workflow candidate set, the Business Partner policy gate, the repository predicate, and the database `approved_by IS DISTINCT FROM submitted_by` constraint.
- Return maps the approval iteration to a cancelled terminal state and the Business Partner request to `returned`; the maker can correct and revalidate it, then resubmit on the immutable workflow binding with a new stage/work item so prior decision evidence remains preserved. Reject maps both to rejected; approve records immutable approval evidence. Audit and outbox effects remain in the same transaction.
- Focused verification passes: master-data contracts typecheck; service build/typecheck; 16 service tests including approve, reject, return/correct/resubmit and self-approval denial; 88 host tests; 13 hardened-relay tests; and 71-file seed lint. The package-wide database run is 98/99 because a concurrently changing development Business Partner publication fixture currently emits five rows while its assertion expects six; the five Work Package 4 database contracts pass independently.
- Live `athyper_neon` verification exercised draft → validating → pending approval → approved with canonical workflow/stage/work-item rows and row versions `4 → 6 → 7`, plus return → correction → revalidation → resubmission on the same workflow binding through version 12. Both transactions were rolled back and the retained request remains draft at version 4.
- The deployed authenticated path then submitted retained request `01a04686-9285-7cb0-8c1e-5368fe891622` with HTTP `201`, producing workflow `01a046b1-b10f-7e7e-8370-e2faa1985e5a`, request version 6, governed audit/outbox evidence and an open work item. Self-approval returned the domain-specific `403`; an independent baseline session returned fail-closed `403` because the decision permission requires MFA. The temporary test authority assignments were revoked and their local test role suspended after verification.
- Runtime image `athyper/runtime-server:business-partner-wp4-20260828` is healthy for API, worker and scheduler; `athyper/neon-web:business-partner-wp4-20260828` is healthy with the bounded Business Partner BFF relay allowlist. Readiness reports `business-partner-requests.neon=healthy`.

The Work Package 4 release gate is closed: interactive TOTP step-up produced an elevated NEON session and the independent approval completed through the authenticated BFF. Work Package 5 then materialized that approved request through the production API path.

## 9. Work Package 5 completion evidence

- Contracts, repository, service and API now expose `POST /:requestId/apply` with expected-version and command-idempotency keys. The BFF allowlist contains only the bounded Business Partner operation.
- The repository locks the request, idempotency key and material master coordinates; rechecks approval, validation, duplicates, source version and organization/company compatibility; and moves `approved -> applying -> applied` inside one NEON transaction.
- Phase 1B creates one active `master.business_partner`, one onboarding `master.supplier`, one active supplier operating-organization assignment and one immutable `snapshot.entity_snapshot` aggregate. Later-wave customer and add-role materialization remain fail-closed for Work Package 13.
- The request records all four result IDs, application key/fingerprint, actor and timestamp. Exact replay returns the stable coordinates without new rows; a different key or stale evidence returns `409 BUSINESS_PARTNER_REQUEST_APPLICATION_CONFLICT`.
- Forward migration `20260828_neon_business_partner_request_materializer.sql` is applied in the NEON migration ledger with checksum `d9cdd6da165368f8f0f2155e956e38abb66bb3c50fdfa00cd8be6338ca3170d8`. No MESH or STUDIO schema/seed was changed for this NEON-only package. The full three-plane runner remains independently blocked before NEON by checksum drift in the concurrently changed, already-applied `20260828_record_transfer_notifications.sql`; its ledger was not rewritten.
- Focused verification passes: contracts and service typechecks/build, 18 master-data service tests, 88 host tests, 13 hardened-relay security tests, NEON web typecheck and six focused database contracts. A repository-level forced rollback proved that partner, supplier, assignment and snapshot all roll back with the request.
- Live authenticated verification approved request `01a04686-9285-7cb0-8c1e-5368fe891622` under elevated MFA (`200`), applied it (`201`), replayed the same command (`200`) with identical coordinates, and rejected a conflicting key (`409`). The persisted request is `applied` at row version 9 and links partner `01a046d3-16ba-7240-9e08-1f8ad8df3414`, supplier `01a046d3-16be-7559-935d-65c0aa286817`, assignment `01a046d3-16c1-7bce-9fbf-b88adc056a91` and snapshot `01a046d3-16c4-76ca-b27a-2c6fef38ea5f`.
- Database verification confirms matching `business_partner.request.applied` snapshot, audit and outbox evidence. The temporary approver group-role grant is revoked. Its now-unassigned local verification role remains as immutable authorization evidence because the audit-evidence guard correctly rejected an attempted status mutation after use.
- Runtime image `athyper/runtime-server:business-partner-wp5-20260828` is healthy for API, worker and scheduler; `athyper/neon-web:business-partner-wp5-20260828` is healthy with the apply relay operation.

## 10. Work Package 6 completion evidence

- The master-data read model now exposes an organization-authorized request view and materialized Business Partner aggregate. The aggregate joins the partner identity, supplier roles, active operating-organization assignments and related onboarding requests without bypassing repository authorization or tenant/RLS controls.
- The platform host and bounded NEON BFF relay expose `GET /api/neon/business-partner-requests/:requestId/view` and `GET /api/neon/business-partners/:businessPartnerId?operatingOrganizationId=...`. Anonymous access fails with `401`; an ungranted organization fails with `403`.
- NEON now has production routes for the Business Partner master, onboarding queue, internal supplier request, request detail, draft edit and aggregate detail. The request experience exposes validation evidence, workflow coordinates, duplicate/change evidence and only those lifecycle actions allowed by status, permission and MFA assurance. Draft edit links and create entry points are permission-aware; the API remains the final enforcement boundary.
- Runtime metadata release 7 publishes `detailRouteTemplate=/app/business_partner/:recordId`; active release `face6585-3810-5f06-aed1-e229ea327e5b` has compiled hash `f15ddb21fee1f32f94d4939c1dab0fccfe35a945caf3ad2ede2d352cf68932e5`.
- The disposable authorization provisioner now converges its managed context roles by removing stale permission links. Business Partner and onboarding request reads are isolated in the operating-organization-scoped `demo.neon.business-partner-reader` role. The three-plane demo authorization projection was applied successfully (`NEON 150 users/816 assignments`, `MESH 47/192`, `STUDIO 4/4`), then the NEON Business Partner runtime/reader projection was reapplied. No MESH or STUDIO schema or reference-seed change was required.
- Focused verification passes: five Business Partner UI action-policy tests; package and NEON typechecks; production Next build with all six Business Partner routes; 20 master-data service tests; 88 platform-host tests; five authorization/runtime provisioning tests; and nine foundation interaction tests.
- Production images `athyper/runtime-server:business-partner-wp6-20260828` and `athyper/neon-web:business-partner-wp6-20260828` built successfully and passed healthy deployment checks. The WP6 NEON image remains deployed; a concurrent governed-import deployment subsequently replaced API/worker/scheduler with its own healthy runtime image, which retains the WP6 endpoints. Live authenticated BFF verification returned `200` for request `01a04686-9285-7cb0-8c1e-5368fe891622` with six validation findings and `200` for partner `01a046d3-16ba-7240-9e08-1f8ad8df3414` with one supplier, one organization assignment and one onboarding request. The aggregate page rendered the selected organization and Identity panel.
- An authenticated Playwright/axe run against the deployed aggregate page found no critical or serious accessibility violations; three lower-impact shell-level findings remain for the broader accessibility backlog. The shared toast live region was corrected to use an explicit `region` role after axe identified its labelled generic container.

## 11. Work Package 7 completion evidence

- Registration approval and commercial qualification are separate governed decisions. The approved onboarding request created the supplier in `onboarding`; qualification `01a04725-f32a-7f27-82ba-9fab187a1220` independently advanced it to `active` only after an independent approver accepted the qualification evidence.
- `control.business_partner_qualification` now has create and decision idempotency keys, a 64-hex decision fingerprint and exact optimistic `row_version`. Creation evidence and terminal decision evidence are immutable. The migration also backfills deterministic evidence for legacy terminal rows without an extension dependency.
- Forward migration `20260828_neon_business_partner_qualification_readiness.sql` is applied only in `athyper_neon` and recorded `applied` with SHA-256 `14ac305fbc74b42d4370ae2dfdad635b4b10ddc27caa2291d8dc94f2e0ce80bd`. The unrelated record-transfer checksum drift and its ledger remain untouched.
- The eligibility resolver evaluates partner/role state, organization assignment, organization-company compatibility, scoped effective qualification, active operation blocks, approved risk evidence and company/payment readiness. Risk is a hook rather than a second authority: missing assessment is a warning, while expired or critical approved evidence blocks the operation.
- Stable reason codes are contract values: `PARTNER_INACTIVE`, `ROLE_MISSING`, `ROLE_INACTIVE`, `ORG_ASSIGNMENT_MISSING`, `ORG_COMPANY_INCOMPATIBLE`, `QUALIFICATION_PENDING`, `QUALIFICATION_REJECTED`, `QUALIFICATION_SUSPENDED`, `QUALIFICATION_EXPIRED`, `BLOCKED_FOR_OPERATION`, `RISK_ASSESSMENT_MISSING`, `RISK_ASSESSMENT_EXPIRED`, `RISK_CRITICAL`, `COMPANY_PROFILE_MISSING`, `COMPANY_PROFILE_INACTIVE`, `BANK_NOT_READY` and `PAYMENT_TERM_INVALID`. Results and reasons are deterministically ordered and bound to a SHA-256 decision fingerprint.
- Production APIs and the bounded NEON relay expose eligibility read, qualification create and qualification decision operations. The host policy gate requires `neon.supplier.qualification.admin`, operating-organization scope and maker-checker separation; it rejects self-approval before persistence. Dedicated HTTP count/duration telemetry and `business-partner-eligibility.neon` readiness are healthy.
- The NEON aggregate includes a Readiness tab with eligibility, decision fingerprint, risk band and stable reasons. The final authenticated Playwright/axe run rendered the eligible supplier and reported no critical or serious accessibility violations; three pre-existing shell landmark findings remain outside this slice.
- Focused verification passes: 23 master-data service tests, 88 platform-host tests, five Business Partner UI tests, two qualification persistence/seed contracts, and all affected contracts/service/host/BFF/product/NEON typechecks. Production images `athyper/runtime-server:business-partner-wp7-r2-20260828` and `athyper/neon-web:business-partner-wp7-r2-20260828` are deployed healthy.
- Live authenticated evidence covers missing session `401`, baseline manage denial `403`, qualification create `201`, exact create replay `200`, self-approval `403`, independent approval `200`, exact decision replay `200`, row version `1 -> 2`, supplier `onboarding -> active`, and final readiness `eligible=true` with only `RISK_ASSESSMENT_MISSING` as a warning. Two schema-version-2 audit rows and two outbox rows bind the create/approve decisions.
- The updated schema-version-2 audit contract was executed and verified in STUDIO, NEON and MESH: each plane has the same 25-row reference set and qualification-aware Business Partner event pattern. Temporary live verification group membership and authority are revoked and their role/group are suspended as retained authorization evidence.

## 12. Work Package 8 completion evidence

- `control.supplier_preference_designation` is the authoritative governed record. It requires an operating organization and supports optional company-code and commodity-category refinement, an effective `[from, until)` range, immutable creation/scope coordinates, exact row-version advancement, independent decision evidence and separately idempotent revocation. No supplier Boolean or metadata flag was introduced.
- Scope validation proves that the supplier belongs to the Business Partner and that supplier organization assignment, organization-company compatibility and commodity capability cover the full preference period. Approval re-runs the central purchasing-readiness resolver at the effective start; preference ranks a supplier but never substitutes for qualification, blocks, risk or company readiness.
- Approval rejects self-approval at both service and database boundaries. A transaction-scoped supplier/organization advisory lock serializes decisions, while the database rejects intersecting date ranges whose company or commodity scopes overlap through either an exact match or a wildcard. Rejected and revoked decisions are terminal; approved designations may only be revoked.
- APIs expose list/create, approve/reject and revoke operations with bounded NEON relay entries, idempotency keys, decision fingerprints, stable conflict codes, audit/outbox effects, authorization scope and HTTP telemetry. Permission `neon.supplier.preference.admin` is high-risk, MFA- and SoD-required, and propagates only through an operating-organization subtree.
- Eligibility now returns `preferredSupplier` and deterministically ordered `effectivePreferenceIds`; these fields participate in the decision fingerprint. NEON displays a Preferred/Standard supplier badge and effective preference evidence in the existing Readiness tab. Expiry is resolved by business date rather than an unsafe background status mutation.
- Forward migrations are ledger-applied in NEON: `20260828_neon_supplier_preference.sql` SHA-256 `62afcf530354f0fc3442a6570132dda5e05ad3db9b8579577861488230908697` and full-range hardening `20260828_neon_supplier_preference_scope_coverage.sql` SHA-256 `6888c7a5b6b642cd2674e3e360f3ae7596ac4aa584889005e0b6177921d6ded9`. The Business Partner audit contract v3 migration SHA-256 `8fe69c0d886a23d03fd452ad8d2decf1cdebfe8fcc07d76bf7d4e2ac603fe50a` is applied in STUDIO, NEON and MESH.
- The canonical audit reference seed was executed successfully in all three databases and retains the exact 25-row set with the Business Partner event pattern extended for preference create/approve/reject/revoke. The exact one-row preference permission seed was executed in NEON. No MESH/STUDIO instance or demo data was added.
- Focused verification passes: 24 master-data service tests, 88 platform-host tests, five Business Partner UI tests, four qualification/preference database contracts, and all affected contract/service/host/BFF/product typechecks. Live transactional database checks proved self-approval denial, independent approval, current/expired resolution, wildcard overlap rejection, row versions `1 -> 2 -> 3` and revocation; the test rows were rolled back.
- Deployed authenticated readiness returned `eligible=true`, `preferredSupplier=true` and the exact active designation ID for `2026-08-28`; at the exclusive end date `2026-08-29`, it remained eligible but returned `preferredSupplier=false` with no effective designation. The temporary API-read fixture was deleted after verification. Runtime readiness reports `business-partner-eligibility.neon=healthy`.
- Production images `athyper/runtime-server:business-partner-wp8-r2-20260828` and `athyper/neon-web:business-partner-wp8-r2-20260828` are deployed healthy for API, worker, scheduler and NEON Web. The r2 NEON image contains the four bounded preference relay operations; the r2 runtime contains the full-range hardening migration and stable scope-error mapping.

## 13. Work Package 9 completion evidence

- MESH owns three new persistence boundaries: immutable `snapshot.network_account_profile_publication`, immutable recipient binding `mesh.network_account_profile_publication`, and append-only `mesh.network_account_profile_publication_event`. Withdrawal adds a lifecycle event and never deletes or rewrites a published snapshot.
- Publication is directional for Phase 1: the relationship supplier publishes to the relationship buyer, and the payload explicitly proposes the NEON `supplier` role. The recipient is derived from the active MESH relationship rather than accepted from caller JSON.
- The `recipient_safe_v1` field set is constructed server-side from an allowlist: account identity/presentation, active legal profile facts, and active commodity capabilities. Identifiers, tax registrations, addresses, contacts, arbitrary metadata/capabilities, and all bank data are excluded. A recursive database guard independently rejects sensitive key families.
- Every recipient snapshot is canonical-hashed with SHA-256 and binds source/recipient tenant and account, relationship, schema/field-set version, publication version, previous publication and actor. The transaction appends a recipient-partitioned outbox envelope and governed audit evidence.
- Exact permissions are `mesh.business_partner_profile.publish`, `.read`, and `.withdraw`, scoped to `network_relationship`; publish and withdrawal are high-risk MFA operations. Participant-only forced RLS protects publication, lifecycle and snapshot tables, while service authorization remains fail-closed.
- Runtime routes are `POST/GET /api/mesh/business-partner-profile-publications`, `GET /:publicationId`, and `POST /:publicationId/withdrawals`. The MESH BFF exposes only those four bounded operations, with tenant, CSRF, idempotency and body-size enforcement inherited from the hardened relay.
- Permission evaluation precedes idempotency lookup for publish and withdrawal, so a known command key cannot become a replay-based authorization side channel.
- Forward migrations are ledger-recorded: audit contract v4 on Studio, NEON and MESH (`f76809218e029a4b59464fb18ca8fcfd19944217bed4b36170d5a8a361d82228`) and MESH persistence/permissions (`c4b94a731ac8742f0e22cfe2835aa11371a57d6716c032e872b3835bfe310c94`). The common audit seed was executed successfully in all three databases; no existing migration checksum was changed.
- Verification passes: MESH service typecheck/build and 4 tests; WP9 database contracts 2/2; host typecheck/build and 88/88 tests; hardened relay typecheck; MESH Web production build; 71-file seed lint; three-plane DDL model checks; and a rollback-only live database proof of bank-key rejection, immutability, owner/recipient visibility and unrelated-tenant isolation.
- Production images `athyper/runtime-server:business-partner-wp9-20260828` and `athyper/mesh-web:business-partner-wp9-20260828` are deployed healthy for API, worker, scheduler and MESH Web. Runtime readiness reports `business-partner-profile-publications.mesh=healthy`; direct runtime and bounded BFF routes both fail anonymous access with `401`.
- The generated Prisma client is intentionally not used for this boundary: repository SQL pins all three schema coordinates in one MESH transaction. The checked-in client projection will be refreshed by the normal database-sync pipeline once its environment URL is available; runtime correctness does not depend on that projection.
- The global audit verifier remains independently blocked because the concurrently changed worktree lacks `stack/config/telemetry/logging/alloy.alloy`. The full database suite is 107/108 after the WP9 audit expectation update; its remaining failure is the concurrently changed development Business Partner descriptor release assertion (`8` emitted versus `7` expected), unrelated to MESH publication.

## 14. Work Package 10 completion evidence

- NEON now owns four recipient-local persistence boundaries: immutable `control.mesh_business_partner_profile_inbox`, append-only `control.mesh_business_partner_profile_processing_attempt`, immutable `snapshot.mesh_business_partner_profile_received`, and mutable-pointer-only `control.mesh_business_partner_profile_projection`. There are no cross-database foreign keys.
- Delivery deduplication is exact on `(tenant_id,event_id)` and compares the canonical envelope hash. Concurrent first delivery uses conflict-safe insert semantics, while receipt and relationship coordinates are transaction-serialized before ordering or replay decisions.
- The consumer accepts only MESH publication/withdrawal envelopes addressed to the authenticated NEON tenant. It verifies source plane, schema `mesh.business_partner_profile@1`, field set `recipient_safe_v1`, canonical SHA-256 payload hash, recipient tenant/account/relationship binding, lifecycle form, and the recursive sensitive-key guard.
- Ordering is monotonic per recipient relationship: initial publication must be version 1; successor publication must be exactly current + 1; withdrawal must target the current publication and exactly current lifecycle + 1. Old events become stable `MESH_PROFILE_EVENT_STALE` evidence, while gaps/conflicts are quarantined with stable codes and never advance the projection.
- Replay never changes a receipt or prior attempt. It appends a new `replay` attempt and applies only if current state now satisfies the same validation and ordering gates. A successfully replayed quarantine is therefore fully reconstructable.
- Withdrawal changes the projection pointer state to `withdrawn` and retains its immutable last verified snapshot. No table, foreign key, repository statement, route, or import adapter in WP10 inserts, updates, deletes, or binds to `master.business_partner`; selective acceptance remains Work Package 11.
- Exact tenant-scoped permissions are `neon.business_partner_profile_projection.receive`, `.read`, and `.replay`; replay is high-risk and MFA-bound. Forced tenant RLS protects all four tables. The transport-only receive endpoint is deliberately excluded from NEON Web's BFF allowlist.
- Runtime routes are `POST /api/neon/business-partner-profile-events`, `GET /api/neon/business-partner-profile-projections`, `GET /api/neon/business-partner-profile-events/quarantine`, and `POST /api/neon/business-partner-profile-events/:eventId/replays`. Only projection read, quarantine read, and governed replay are exposed through the bounded NEON relay.
- Forward migrations are ledger-recorded: NEON inbox/projection persistence and permissions (`0c240cbb46aa2041b5fd4f7e896ea625f5923d3385c6abbd10065c47d5ad43a2`) and a forward-only MESH payload-guard correction (`b0888dc66ea43ece11fac4b9be600453a85378cf67eb6e03850e66225f3696bd`). The latter permits the explicitly approved `commodityCapabilities` field while continuing to reject bank and other prohibited key families; the applied WP9 migration and ledger were not rewritten.
- The WP10 NEON authorization seed was executed in the NEON database after migration and converged to three published permissions. Live rollback verification proved immutable inbox/snapshot evidence, sensitive-field rejection, append-only delivery/replay attempts, recipient visibility, unrelated-tenant isolation, and zero retained fixture rows.
- Verification passes: NEON plane typecheck/build and 20/20 tests; WP10 database contracts 3/3; complete database suite 111/111; platform-host typecheck/build and 88/88 tests; BFF relay typecheck; NEON Web typecheck and production build; 71-file seed lint; and the three-plane DDL model.
- Production images `athyper/runtime-server:business-partner-wp10-20260828` and `athyper/neon-web:business-partner-wp10-20260828` are deployed healthy for API, worker, scheduler and NEON Web. Runtime readiness reports `business-partner-profile-projections.neon=healthy`; direct runtime and bounded BFF projection routes both fail anonymous access with `401`.

## 15. Work Package 11 completion evidence

- NEON now owns three immutable adapter records: `document.mesh_business_partner_match`, `document.mesh_business_partner_acceptance`, and append-only `document.mesh_business_partner_acceptance_event`. The match pins the verified snapshot/projection, source hash/version, organization/company scope, selected candidate fingerprint, algorithm revision/hash, ranked candidates, field diff and diff hash.
- Candidate discovery is tenant- and operating-organization-scoped and reads only active Business Partners with active organization assignments. Ranking is deterministic (`mesh_business_partner_candidate_v1`): exact account code, normalized legal/display name, website host and country weights, followed by stable code/ID tie-breaking. A selected candidate must belong to that bounded result set.
- Selective acceptance is database-allowlisted to eight non-sensitive profile paths. Paths are unique, sorted and explicitly chosen; legal name must be explicitly accepted because the governed onboarding schema requires it. Bank, tax, address, contact, arbitrary metadata and commodity data cannot enter the request payload through this adapter.
- The exact derived canonical payload and acceptance hash are immutable. A two-step recoverable saga writes `prepared`, calls the existing source-neutral `BusinessPartnerRequestService.create`, then appends `request_created`. A crash after request creation is recovered by the request service's idempotency key and the stable acceptance link; reused keys with changed match or acceptance coordinates return `409`.
- A match without a local candidate proposes `new_partner` plus supplier role; a selected local candidate proposes `amend_partner`. Both use source kind `mesh`, system `athyper_mesh`, entity `business_partner_profile`, publication ID/version/hash and the immutable received snapshot ID. Approval, validation, workflow and materialization remain entirely inside the existing request lifecycle.
- The request's `source_projection_id` now has a typed tenant-local foreign key to `snapshot.mesh_business_partner_profile_received`. There is still no cross-database foreign key. Static enforcement verifies that the adapter contains no insert, update or delete against `master.business_partner`, `master.supplier`, or `master.customer`.
- APIs are `POST /api/neon/business-partner-profile-matches`, `GET /:matchId`, and `POST /:matchId/requests`. All three are in the bounded NEON relay with tenant, CSRF, body-size and idempotency controls. HTTP count/duration telemetry and readiness check `business-partner-profile-matches.neon` are registered.
- Exact operating-organization-scoped permissions are `.create`, `.read`, and `.request`; request creation is high-risk and MFA-required. Authorization is evaluated before persistence, while the downstream request service independently re-authorizes ordinary request creation. Forced tenant RLS permits application reads/inserts only; triggers reject all updates and deletes.
- Forward migration `20260828_neon_mesh_business_partner_match_request.sql` is applied only in `athyper_neon` and ledgered with SHA-256 `47acc83ff2014a7d3ebe86c91d0d0d3c3bd989fbadc1f198f889815dca16fa9f`. Its canonical three-permission seed was executed in NEON and converged to three published permissions. MESH and STUDIO required no WP11 schema or seed execution.
- Verification passes: 24/24 NEON plane tests, 115/115 database contract tests, 88/88 platform-host tests, affected package/host/BFF/NEON typechecks, 71-file seed lint and the three-plane DDL model. Tests cover deterministic ranking, pinned diffs, exact replay, changed-command collision, explicit selective acceptance, saga recovery, unsupported fields and negative authorization.
- Production images `athyper/runtime-server:business-partner-wp11-20260828` and `athyper/neon-web:business-partner-wp11-20260828` are deployed healthy for API, worker, scheduler and NEON Web. Runtime readiness reports `business-partner-profile-matches.neon=healthy`; direct runtime and bounded BFF match routes reject anonymous access with `401`.
- The adapter intentionally uses its narrow Kysely repository rather than generated Prisma models; the runtime build regenerates the existing client projection, but correctness depends on the pinned SQL contract and not a broad generic master-data client.

## 16. Work Package 12 completion evidence

- STUDIO now owns immutable `snapshot.business_partner_definition_revision` records and immutable `publication.business_partner_definition_release_link` coordinates. The source bundle is canonical-hashed, semantic-versioned, idempotent, tenant-bound and explicitly targeted to Studio, NEON and/or MESH. It contains definitions only; validation rejects bank/account, tax-value and partner-instance data.
- The foundation bundle versions both onboarding paths: internal NEON intake and pinned MESH selective acceptance. It includes request schemas, validation declarations, onboarding/qualification forms, list/detail/aggregate views, MESH-to-request and request-to-master mappings, onboarding/qualification/preference/risk-hook workflows, compatibility rules and source contract hashes.
- Publication artifact v1 is now a backward-compatible discriminated union: existing `entity_runtime` artifacts are unchanged, while `business_partner_definition_bundle` artifacts use the same immutable object store, Ed25519 signer/verifier, compilation ledger, deployment jobs, acknowledgement and rollback machinery. Artifact keys include their kind and manifest/envelope kind mismatch is rejected.
- Each plane persists the received definition as an immutable `business_partner_definition_bundle` artifact in the generic `runtime_meta.applied_release_payload`. `applied_release`, `release_activation_head`, and `release_activation_event` exclusively own lifecycle, activation, and rollback state. Stage verifies source coordinates and database plane, while verification pins payload hash/schema and signature evidence. `fn_active_business_partner_definition` remains the typed offline-safe read and never calls STUDIO.
- API routes are `POST /api/studio/business-partner-definitions`, `GET /:revisionId`, and `POST /:revisionId/publish`, exposed only through three bounded STUDIO relay operations. Author and publish commands require idempotency keys. Publish allocation is transaction/advisory-lock serialized and enqueues the existing compile job.
- Exact tenant-scoped permissions are `.read`, `.author`, and `.publish`; publish is critical, MFA- and SoD-required. Both service and database reject author self-publication. A rollback-only live proof demonstrated self-publish denial and successful independent publication without retaining fixture rows.
- Forward migrations are ledger-applied: the all-plane local projection (`e2b40e2ce531015900b646685e62247f383699b41056e5f6e0525db96bb7b8a1`), STUDIO authority (`e8b869b3b0cc8d999df3019c10e4946d31547eccd3afd2f4e97e8bb80371920e`) and STUDIO SoD hardening (`93858f8b109cb081ee84b8f9d162105e4545853d5bcd729fca388b49767e844d`). The three-permission reference seed executed successfully in `athyper_studio`; no NEON or MESH seed was required.
- Verification passes: 5 publication-contract tests, 49 publication-service tests including a real Ed25519-signed definition artifact, 89 platform-host tests, 68 Stack v2 tests, two WP12 database contracts, all affected typechecks, 71-file seed lint and the three-plane DDL model. Live readback confirms all tables, permissions and matching migration ledger hashes.
- Production images `athyper/runtime-server:business-partner-wp12-20260828-r3` and `athyper/studio-web:business-partner-wp12-20260828` are deployed healthy for API, worker, scheduler and STUDIO Web. Readiness returns `200` with `publication.database=healthy`; direct API and bounded STUDIO relay both reject anonymous access with `401`.
- The development rollout intentionally enables the authoring API only. Compile/sign/dispatch/apply/recovery remain fail-closed until the role-separated Infisical Ed25519 references are provisioned and the existing publication rollout canary is authorized; the signed artifact behavior is covered by production code and the cryptographic contract test, but no synthetic active definition release was retained.

## 17. Work Package 13 completion evidence

- One approved request now materializes exactly one commercial role. Supported coordinates are `new_partner + supplier`, `new_partner + customer`, `add_supplier + supplier`, and `add_customer + customer`; kind/role mismatches fail before authorization or persistence. Dual-role onboarding is deliberately two independently validated, approved, fingerprinted and applied requests against one `business_partner_id`, never a combined approval shortcut or duplicate identity.
- Role-neutral application evidence returns `partnerRole` and `roleId`, plus exactly one of `supplierId` or `customerId`. `document.business_partner_request.materialized_customer_id` is tenant-FK-bound to `master.customer`, mutually exclusive with `materialized_supplier_id`, and immutable after apply. Existing WP5 supplier responses remain backward compatible.
- Materialization is request- and role-key serialized. Extension apply locks the target Business Partner, rejects missing/archived targets and existing role/code conflicts, rechecks the latest validation evidence, verifies procurement/`both` scope for suppliers or sales/`both` scope for customers, creates the role and matching operating-organization assignment atomically, captures the next immutable Business Partner snapshot, and finalizes replay evidence in the same transaction.
- Supplier extensions begin in `onboarding`; customer extensions begin in `prospect`. Neither state bypasses WP7 qualification, risk hooks, blocks or readiness calculation. Bank data and company-code profiles remain outside role activation and are not inferred from the role.
- A partial unique index prevents more than one open `add_supplier` or `add_customer` request for the same tenant, Business Partner and role. Database one-to-one constraints remain the terminal concurrency guard, and application idempotency returns the same role coordinates on replay.
- The aggregate API now returns independent `suppliers` and `customers` collections and all role-specific organization assignments. NEON Web exposes `/app/business_partner/{businessPartnerId}/roles/new`, linked from the partner detail route, with supplier/customer codes, types, key-account intent and organization/company scope submitted through the existing source-neutral request API.
- Forward migration `20260828_neon_business_partner_role_extensions.sql` is applied only in `athyper_neon` and ledgered with SHA-256 `3ce4735740a9af1441057c23b6a55bfed72b7ea637e065f884ef388b6bbf2bfe`. Live readback confirms the customer evidence column, tenant FK, open-role guard and matching ledger hash. WP13 adds no permission/reference seed, so no seed execution is required in NEON, MESH or STUDIO; MESH and STUDIO have no WP13 migration.
- A rollback-only live database proof added a customer role and sales-compatible assignment to a Business Partner that retained its supplier role: `supplier_roles=1`, `customer_roles=1`, `assigned_roles=2`; rollback left zero proof rows. This proves same-identity dual-role behavior without retaining synthetic partner data.
- Verification passes: 25/25 master-data service tests, 119/119 database contract tests, 89/89 platform-host tests, focused WP13 database contracts, affected typechecks, host/NEON production builds, 71-file seed lint and the three-plane DDL model. Tests cover role-kind mismatch, independent customer approval/apply, role-neutral evidence, idempotent supplier compatibility and static same-identity/no-shortcut assertions.
- Production images `athyper/runtime-server:business-partner-wp13-20260828` (`sha256:e1b328ab21f54aec0bdb2112148fff2911e725b06cbe345d6e6a8f0d269ead94`) and `athyper/neon-web:business-partner-wp13-20260828` (`sha256:c36156aed6c03232968e91023da1a982e466354d591bb0f72abdfe2a69c18460`) are built. The currently running development services were not switched because they are carrying a concurrently deployed transfer release; WP13 packaging did not overwrite that unrelated rollout.

## 18. Work Package 14 completion evidence

- The existing source-neutral request lifecycle now supports `assign_organization` and `configure_company` for either supplier or customer. Both require a target Business Partner, role and operating organization; company configuration additionally requires an exact company-code coordinate. Creation-time advisory locks and partial unique indexes prevent concurrent open requests for the same governed scope.
- Apply remains one atomic, replay-safe transaction. It rechecks approved immutable evidence, active partner and role, role-compatible active organization, effective organization/company membership and the latest passing validation. Organization assignment creates only the effective role assignment. Company configuration requires an existing active assignment and an effective approved/conditional qualification before creating exactly one role-specific company profile.
- Finance activation is fail-closed. Both profiles require ISO currency, payment term and accounting profile references. Supplier payment readiness additionally requires a preferred remittance bank link. Customer credit limits must be non-negative and carry an explicit credit currency. Tenant foreign keys remain the terminal reference guard; materialized profile coordinates are role-consistent and immutable after apply.
- `BusinessPartnerAggregate` now carries supplier and customer company-profile collections. Existing WP7 eligibility remains the single derived readiness answer and retains stable blockers including `ORG_COMPANY_INCOMPATIBLE`, `COMPANY_PROFILE_MISSING`, `COMPANY_PROFILE_INACTIVE`, `PAYMENT_TERM_INVALID`, and `BANK_NOT_READY`. Approval of a customer qualification now correctly activates a WP13 `prospect` customer as well as the legacy `onboarding` state.
- NEON Web exposes `/app/business_partner/{businessPartnerId}/scope/new`, linked from partner detail. The form creates an organization-assignment or company-configuration request, pins company configuration to the selected NEON work context, and sends it through validate, submit, independent approval and apply; it has no direct master-data write path.
- Forward migration `20260828_neon_business_partner_company_configuration.sql` is applied only in `athyper_neon` and ledgered with SHA-256 `9b0d89793ad8fcc3696d87599ffc6032ff28d9a7d6badb3b9543a1a2c2e0a09c`. Live readback confirms both profile-evidence columns and both open-scope indexes. A rollback-only live proof verified the exact-company duplicate-open guard and retained zero fixture rows.
- WP14 adds no permission or reference seed. The already-applied NEON request catalog was read back as seven published permissions and seven active operating-organization scope declarations. No MESH or STUDIO migration/seed is applicable. Seed contract lint passes all 71 active files.
- Verification passes: 26/26 master-data service tests, 120/120 database contract tests, 89/89 platform-host tests, five NEON Business Partner UI tests, all affected typechecks, the focused WP13/WP14/readiness contracts and the three-plane DDL model. The production build includes the new NEON route and runtime migration/materializer markers.
- Production images `athyper/runtime-server:business-partner-wp14-20260828` (`sha256:cf1f32546d33c001c38316eb40c3d76437aea2f3c732375e842794f79263df4d`) and `athyper/neon-web:business-partner-wp14-20260828` (`sha256:c673767fd4e49c64d7e821bfb3d86e0ff98412e1a52dd5e9131499c7262de8fe`) are built. The currently running API/worker/scheduler and NEON Web were not replaced because they carry the concurrent transfer release; WP14 packaging did not overwrite that rollout.

## 19. Work Package 15 completion evidence

- Account identity and banking remain separate governed aggregates. An approved NEON account link maps one recipient-visible MESH network account to one existing Business Partner through `master.external_reference(source_system_code='athyper_mesh', external_entity_code='network_account')`; relationship/version coordinates remain in the tenant-local link. The MESH relationship direction explicitly proposes `supplier` for a buyer recipient or `customer` for a supplier recipient, and the matching NEON role must already exist through the ordinary onboarding lifecycle.
- MESH bank disclosure requires an active effective directional relationship, an active verified bank account and effective settlement/refund link. Request and decision idempotency are separate, approval rechecks volatile eligibility, requester and approver must differ, and immutable decision fingerprints/lifecycle events preserve approve, reject and revoke evidence.
- The recipient snapshot is `masked_retrieval_v1`: holder name, identifier type, last four, currency, bank identity, account fingerprint and a separately authorized secure-retrieval reference. The general WP9 profile remains bank-free. Service allowlists and database `CHECK` constraints reject raw account identifiers, account numbers, IBAN and routing-number keys in MESH snapshots, NEON inbox envelopes and NEON received snapshots.
- NEON accepts a bank disclosure only after an active account mapping. Its immutable inbox deduplicates event IDs and compares canonical envelope hashes; monotonic disclosure/lifecycle ordering rejects stale events and quarantines gaps. The local projection contains only masked data and a fingerprint and has no direct write path to `master.bank_account`, `master.bank_account_link` or a company profile.
- Remittance change is a second NEON workflow. It pins the MESH fingerprint and prior preferred-remittance link, requires an independently verified active local Business Partner bank link, rejects self-verification, and applies only when both pins still match under row locks. Application explicitly updates `master.company_code_supplier_profile.preferred_remittance_bank_link_id`; concurrent MESH or NEON bank changes fail closed.
- APIs are registered for MESH request/read/decision/revocation and NEON account-link request/read/decision, bank-event receipt, verification decision and application. Exact relationship/company permissions, MFA/SoD requirements, bounded problem codes, HTTP metrics and readiness probes are registered in `platform-host`.
- Forward migrations are live and ledgered: MESH foundation `6434acabdcb4d88c6de53042e6f7fae155943369e4b7372ddfaa1c96369b4409`, MESH payload guard `2ae27577bf97feb329eb545e816738be97eaecd10bb2c262ca62c66855026f42`, NEON foundation `c812935e27b24c6605cc67a267b161f167421ab0d1fc014e5cce5552b6436838`, NEON mutation guards `fc4ab56005310d1a2ba304b0c44e26cb6b00cdcf800a71563d85b638de0da888`, and NEON payload guard `14c48586e65e9c667b4cd4784e19b92b3a42b66c884180157579e2c75c188d37`. Shared audit contract v5 `638edacd96309acd5c1b5725344202e89979ebaf684f5fe698c1cc25db4b19ab` is applied in STUDIO, NEON and MESH.
- The canonical audit reference seed executed successfully in all three databases and converged to the same 25-row set at Business Partner contract schema v5. Plane-local migrations converged four MESH and six NEON published permissions; no STUDIO WP15 permission is required.
- Verification passes: MESH plane tests 6/6, NEON plane tests 27/27, database contracts 122/122, 71-file seed lint, three-plane DDL model, affected plane/host typechecks, rollback-only migration execution and live raw-payload denial in both databases. Live trigger readback confirms immutable evidence and aggregate guards.
- Production image `athyper/runtime-server:business-partner-wp15-20260828` (`sha256:3bcea98d46670466a4a79ea2a8c57b41673168250b9ad59408dc055ad43a13ba`) built successfully and contains the routes and forward migrations. API/worker/scheduler were not switched because they carry the concurrently deployed transfer release; WP15 packaging did not overwrite that rollout.

## 20. Work Package 16 release-candidate evidence

- The MESH-to-NEON gap is closed by production job handlers `mesh.business-partner.deliver` and `mesh.business-partner.reconcile`. Delivery claims only five allowlisted `mesh-business-partner` outbox event types with `FOR UPDATE SKIP LOCKED`, a 90-second lease, bounded 100-row sweeps, attempt limits and exponential retry. Successful, duplicate and stale recipient results complete the source event; unsafe quarantine and exhausted/permanent failures enter dead letter.
- Recipient writes reuse the WP10/WP15 NEON services rather than introducing a cross-plane master writer. Every envelope is rechecked for event/schema/hash/recipient/order/privacy constraints, and bank receipt additionally requires the approved directional account mapping. The worker has no repository or SQL path to `master.business_partner`, supplier/customer roles, company profiles, bank accounts or remittance application.
- Reconciliation compares exact completed MESH event IDs with their typed NEON inbox. A missing receipt reopens the original source event without changing its immutable payload. Reviewed dead-letter replay is available only through the governed job-administration path with an exact outbox UUID and mandatory reason; it resets delivery attempts and then passes through the same recipient validation and deduplication gates.
- Rollout is fail-closed and independently staged with `BUSINESS_PARTNER_MESH_DELIVERY_ENABLED=false` and `BUSINESS_PARTNER_MESH_RECONCILIATION_ENABLED=false` by default. This preserves the NEON-only onboarding flow while MESH transport remains disabled. Delivery, reconciliation, and runtime image rollback procedures are documented in `docs/runbooks/business-partner-production-rollout.md`.
- Telemetry counter `athyper_business_partner_mesh_delivery_total` uses only operation, profile/bank kind, and outcome labels. It deliberately excludes tenants, partners, relationships, event IDs, payloads, bank fields and errors. Prometheus carries failure, dead-letter/quarantine, and reconciliation-drift alerts; Grafana provisioning includes the Business Partner delivery dashboard. `promtool` validates all three new rule files and the active seven-rule-file telemetry configuration; the dashboard JSON parses successfully.
- Load/security/privacy verification passes: the focused worker drains a bounded 100-event batch once, exposes no envelope coordinate in telemetry, retries transient dependencies deterministically, stops quarantined data, deduplicates success, and reopens missing receipts. Plane and host gates pass: MESH 11/11 tests, NEON 27/27 tests, platform host 89/89 tests, all affected typechecks, database contracts 122/122, and 71-file seed lint.
- Live database state is clean for this release candidate: Studio has 24 applied/0 failed migrations, NEON 38/0, and MESH 27/0. WP16 introduces no DDL or reference seed, so there is no new seed SQL to apply; the existing three-plane seed ledgers remain present and the complete seed contract passes. No migration checksum or seed ledger was rewritten.
- Production image `athyper/runtime-server:business-partner-wp16-20260828` is built at immutable digest `sha256:258498c76645cb3fe4cfff6e71501fc266d01f6fed2a39dbff61a67ab9295e20`. It runs as non-root user `node`, has the pinned Node `v24.19.0`, retains its liveness health check and forward-migration runner, and contains no npm/corepack executables.
- The image was intentionally not deployed over the running transfer release. The release certificate remains `candidate` until a staged environment completes live profile/bank delivery and reconciliation, isolated restore/replay comparison, rollback rehearsal, immutable evidence attachment and named Product/Procurement, Privacy, Security, MESH, NEON and Database/DR approval. These are external rollout gates, not unresolved implementation defects.

The production build sequence is complete through release-candidate packaging. The next authorized activity is the staged WP16 rollout and certification exercise described in the runbook and release certificate.
