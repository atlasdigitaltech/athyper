# Internal bank verification: withdrawn design

**Withdrawn on 2026-09-13 at the user's request.** The Bank-specific design below is retained only as historical context. Its dedicated review ledger, draft Bank proposal/handoff and policy-publication plan are no longer the recommended design or instructions for further implementation/publication. A replacement Bank design has not been selected.

This withdrawal changes documentation only. It does not revert source code, installed database objects, permissions, drafts, approvals or publication history. Implementation history is recorded separately in [the implementation record](internal-bank-verification-implementation.md).

The remaining content records the original 2026-09-13 source review and proposal; statements about what existed or had been applied refer to that review, not the current environment.

## Audit conclusions

1. **The existing review table is structurally supplier/MESH-specific — confirmed.** `document.business_partner_bank_verification` has non-null `bank_projection_id` and `supplier_company_profile_id`. Composite tenant FKs point to `control.mesh_bank_account_projection` and `master.company_code_supplier_profile`. `master.pin_bank_disclosure_review` reads the projection and pins its disclosure coordinates. An internal/customer path cannot legitimately omit those references or substitute fabricated records. Correction: PostgreSQL BEFORE ROW triggers run before row constraint checks, not after them. This trigger does not supply either mandatory source FK, so the schema restriction remains.
2. **Non-MESH account verification already exists — confirmed and stronger than the audit states.** `master.bank_account` has an all-or-nothing verification tuple (`is_verified`, `verified_at`, `verified_by`, `verification_method`) and requires verification for active status. The UPDATE trigger `master.trg_guard_bank_verification` checks principal context/actor attribution for athyperapp and sets verification timestamps. It does not impose reviewer-versus-maker independence. Use the authorized service command rather than recommending an unrestricted SQL UPDATE.
3. **The internal supplier service already performs verification and rejection.** `registerProtectedBankAccount`, `decideProtectedBankRegistration` and `applyProtectedBankRegistration` implement protected capture, pending-only decisions, company-scoped authorization, self-verification rejection, nonempty verification evidence and separate application. The service calls its injected audit recorder and writes evidence/decision hash or rejection reason into account metadata. Therefore “no internal verification, SoD or history exists” is too broad. This review establishes the code paths, not that every deployment wires its optional audit sink or that all callers use these paths.
4. **The durable gap is a dedicated, database-enforced review-attempt contract.** Account scalar fields and mutable metadata expose current state. The service’s SoD check and general audit events do not provide the same typed per-attempt ledger, pinned document/subject/policy versions and database-enforced decision independence as the desired internal review model. The current supplier/MESH review row also is not intrinsically append-only history: repeat attempts require retained rows/events and guarded terminal decisions. A sibling must implement those properties explicitly rather than simply copying columns.
5. **Company-use/acceptance storage already supports both origins — confirmed, with a constraint defect.** `master.bank_account_company_usage` permits an internal row with all five MESH source fields null and a MESH row with disclosure/source coordinates. `master.bank_account_company_ready` checks verified active identity and explicit acceptance, plus disclosure freshness when source_account_id is present. No extra company-use table is needed. However, the MESH CHECK branch lacks `accepted_account_fingerprint IS NOT NULL`: four populated source fields plus a null fingerprint produce SQL NULL, which satisfies a CHECK. Tighten this constraint; “all five guaranteed or all null” currently overstates its enforcement.
6. **Customer workflow support remains separate work.** `protectedRegistrationSource` and `applyProtectedRegistration` join supplier/company-supplier profiles. Dual-origin company-use storage is not proof of customer-refund end-to-end support. Add customer-aware source eligibility and application/readiness adapters without pretending a customer has a supplier profile.

## Corrected gap statement

Company-level bank eligibility and acceptance already support internally maintained and MESH-sourced accounts. Account-level verification state is source-neutral, and an authorized internal supplier service already provides verification/rejection, service-level maker/checker protection and audit recording. The remaining work is a retained, versioned internal review-attempt ledger with database-enforced reviewer independence and evidence linkage, integration of that ledger into the existing commands, and customer-specific eligibility/application support. The supplier/MESH verification table remains dedicated to its actual source. Company-use storage is reused, with a focused NULL-safety correction to its source-coordinate CHECK.

## Phase 1 — preserve and tighten the existing invariants

- Reuse account identity, protected storage, partner-account links, company-use assignments and separate acceptance/application commands.
- Retain existing MESH projection/profile FKs and disclosure pinning. Do not relax NOT NULL constraints to accommodate internal rows.
- Correct company-use source completeness with explicit null-safe checks: all five source fields null, or all five non-null with a positive disclosure version and valid fingerprint. `num_nonnulls(...) IN (0,5)` plus format/version checks is one implementable formulation.
- Before applying that constraint, inspect existing source-coordinate combinations. Flag incomplete source records for review; never invent a fingerprint or convert them to internal origin to make validation pass.
- Keep verified/linked account coordinates immutable. Changes create a replacement account/proposal and a new decision; existing accepted payment details remain in place until authorized replacement.

## Phase 2 — add the concrete internal review sibling

Proposed new table: **`document.business_partner_internal_bank_verification`**. This name is a proposal, not an existing table. Create a review attempt once canonical account/link coordinates exist; earlier onboarding captures a protected proposal against the draft entity case.

| Field group | Proposed contract |
|---|---|
| Identity | id, tenant_id, business_partner_id, bank_account_id, bank_account_link_id |
| Business context | partner_role (supplier/customer), company_code_id, purpose, optional source_entity_case_id; no required MESH projection or supplier-company-profile FK |
| Attempt identity | attempt_no or explicit supersedes_verification_id, idempotency_key, request_fingerprint |
| Pinned subject | expected account identity fingerprint plus the relevant proposal/facts version/hash; do not assume bank_account already has a record_version column |
| Pinned policy/evidence | policy ID/version/hash, immutable evidence manifest reference/hash, exact attachment versions/hashes and relevant subject identity |
| Attribution | initiated_by / submitted_by identifying the human maker, created_by for actual persistence actor, requested_at |
| Decision | pending / verified / rejected / superseded, verification_method, nonempty evidence for verification, rejection reason, decision actor/time/fingerprint |
| Concurrency | row_version, update actor/time; retained previous attempts and terminal decisions |

Required invariants:

- Tenant-aware FKs and owner/link/account/company consistency checks through controlled commands and database guards where appropriate. A valid UUID alone is not a valid association.
- For a decision, require complete actor/time/method/evidence or rejection-reason tuples, using predicates that cannot accidentally return NULL.
- Enforce reviewer independence from the actual maker at database level. Include a `verified_by IS NULL OR verified_by IS DISTINCT FROM initiated_by` pattern; do not rely only on `created_by` if a service actor inserts on behalf of a human. Apply the appropriate independent-review rule to rejection as well.
- Preserve actor-context validation and scoped authorization; a CHECK comparing two IDs cannot establish that the caller is an authorized reviewer.
- One retained row per attempt; immutable completed decision fields, with any supersession separately recorded. Replays return the same attempt/result; retries after a rejection create a linked new attempt.
- Approval attaches to exact evidence/subject versions. Replacement, stale account identity, superseded evidence or expired required evidence invalidates the pending decision rather than silently applying it.
- Evidence manifests reference existing attachment storage/links and governed snapshots. Do not add a second binary-document store or place raw bank numbers in the ledger.
- Record application/acceptance separately through existing company-use and governed command evidence. Do not add a global is_applied flag that implies acceptance for every company/purpose.

The account verification tuple remains the current-state projection. Successful internal verification updates that tuple and the attempt atomically. The attempt ledger becomes the source of the internal decision’s justification/history.

## Phase 3 — integrate existing commands, rather than creating a parallel service

- Extend protected registration to open/reference the new attempt after the required partner/account setup exists.
- Extend `decideProtectedBankRegistration` to lock and validate the attempt/account, enforce expected versions and policy, commit the decision, update the scalar tuple and record command/audit evidence atomically.
- Maintain the existing pending-state, nonempty-evidence and maker/checker checks. Add idempotent decision requests and precise replay/conflict handling.
- Prevent bypass: a sibling table alone does not stop direct updates of account verification fields. Define a database-controlled mutation path/guard and least-privilege writes that require valid review evidence for the internal Business Partner path, while preserving legitimate MESH and other bank-owner verification workflows. Cover initially verified INSERTs and later ownership/link creation, not only UPDATEs. Do not grant broader generic table access.
- Retain existing company-use storage and the explicit acceptance step. Acceptance must verify the decision/fingerprint, scope, validity and the active account; current remittance replacement continues through its governed change command.

## Phase 4 — support customer and pre-onboarding contexts explicitly

- Make the new review contract role-aware and free of supplier-only foreign keys.
- Keep role-specific eligibility adapters: supplier company profile for supplier use; authorized customer/company context for customer refunds or other applicable operations.
- Resolve operational role server-side. Customer-optional onboarding never waives the supplier-payment requirement for a dual-role partner; customer refund policy can require a bank account later.
- Draft Bank rows capture protected references and supporting documents without assuming canonical partner/company profiles exist. Preserve stable item keys; hand off to the review attempt once identities and eligible scope exist.
- Do not automatically use an approved customer account for supplier remittance, or one company’s acceptance for another. Use explicit policy-permitted reuse and separate company/purpose acceptance.

## Phase 5 — metadata and evidence policy

Publish Bank section fields, document kinds, cardinalities, applicability, capture deadline, verification deadline, review authority, exception rules and messages through Meta Entity and the versioned policy contract. Prototype visibility does not enable payment readiness. Reuse the supporting-document component proposed for registration/tax/governance/certification records; pin exact file versions in the review manifest.

## Verification plan

1. Existing MESH verification with real projection/profile coordinates and pinned disclosure remains valid; non-MESH/customer rows cannot be inserted into that table without those coordinates.
2. Company-use source groups: all-null internal and complete MESH accepted; partial groups, missing fingerprint and invalid version/hash rejected. Demonstrate the current null-fingerprint issue before tightening, and its rejection afterward.
3. New sibling: tenant mismatch, account/link mismatch, missing company authority, same maker/reviewer and forged reviewer attribution rejected at the relevant database/service boundaries.
4. Verify/reject decisions retain evidence and reasons; completed attempts cannot be rewritten; retries and replay are deterministic; concurrent reviewers cannot both decide the same version.
5. Direct verification-state bypass, verified INSERT and attaching an unreviewed verified account are covered, without regressing other legitimate bank owners and existing MESH processing.
6. Evidence/account changes between review and application reject stale decisions; immutable account identity replacement preserves the prior accepted destination until explicit change approval.
7. Customer onboarding optional, customer refund required, supplier payment required and dual-role cases use the correct policy and source profile. Internal rows never require fabricated disclosure coordinates.
8. Complete transaction rollback on failure; no plaintext bank details in snapshots, metadata, audit or read models; document originals retain restricted retrieval rules.

## Rollout boundary

This is an updated implementation plan, not approval to apply schema changes during this review. For the local environment, implementation can follow the established canonical-DDL workflow without introducing a migration file if that remains the requested approach. New metadata and database changes should activate together only after the relevant checks pass. Existing historical decision facts must not be reconstructed or attributed to an invented reviewer; if any legacy verified accounts lack adequate decision evidence, use explicit compatibility handling or re-verification according to the agreed rollout policy.

## Evidence

- `server/db/ddl/planes/neon/master/03_tables.sql:1338` — verification tuple and active-state CHECK.
- `server/db/ddl/planes/neon/master/07_functions.sql:1866` and `:1904` — account identity and verification guards; `08_triggers.sql:908` wires the UPDATE guard.
- `server/db/ddl/planes/neon/document/03_tables.sql:5090` and `05_constraints.sql:1910` — MESH/supplier review structure and FKs.
- `server/db/ddl/planes/neon/master/15_bank_account_company_usage.sql:10`, `:68`, `:91` — dual-origin company-use CHECK, disclosure pinning and readiness.
- `server/packages/planes/neon/src/business-partner-account-bank-linkage.ts:99`, `:122`, `:128`, `:578` — existing supplier source eligibility, verification, application and service SoD/audit.
- [PostgreSQL CREATE TRIGGER](https://www.postgresql.org/docs/16/sql-createtrigger.html) — BEFORE triggers precede constraint checks.
- [PostgreSQL CHECK constraints](https://www.postgresql.org/docs/16/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS) — true or NULL satisfies a CHECK.
- Read-only expression probe on local PostgreSQL returned `mesh_branch_yields_null=true`, `check_accepts_null_fingerprint=true`. This confirms expression semantics; it is not a full constrained-row insertion test or a live-data audit.
