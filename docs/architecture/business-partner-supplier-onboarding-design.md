# Business Partner and Supplier Onboarding Design

**Status:** In implementation

**Plane:** Neon

**Scope:** Business Partner creation and maintenance, supplier registration, approval, qualification, banking, activation, and deactivation

**Foundation:** [Business Partner foundation: final three-plane design and build plan](./business-partner-three-plane-final-design.md) is the authoritative cross-plane DDL and supplier/customer/workforce-person decision record. This document remains the supplier-specific process design.

## 1. Decisions

1. `master.business_partner` is the canonical counterparty identity. A supplier is a role of that identity, not a second identity.
2. `document.business_partner_request` is the single governed request aggregate for identity creation, identity amendment, role extension, organization assignment, company configuration, and lifecycle changes.
3. “Supplier request” is a journey and UI label over `business_partner_request`; no separate `supplier_request` table is introduced.
4. External self-registration and internal on-behalf registration use the same request lifecycle. Their source channel, actor, invitation, and attestation evidence differ.
5. Clients and integration adapters never write Business Partner master tables directly. An authorized domain command may persist a low-risk change directly only when policy explicitly permits it. Governed changes are applied by the request materializer after approval.
6. Supplier qualification is an independent, renewable decision in `control.business_partner_qualification`. Registration does not imply qualification.
7. Bank changes use `document.business_partner_bank_verification`. Raw or proposed bank identifiers never belong in `business_partner_request.proposed_payload`.
8. Deactivation preserves historical references. Emergency blocking and lifecycle deactivation are different actions.

## 2. Domain boundaries

| Concept | Authority | Meaning |
|---|---|---|
| Business Partner | `master.business_partner` | Shared legal/commercial counterparty identity |
| Supplier role | `master.supplier` | Tenant may procure from or pay the partner |
| Organization assignment | `master.business_partner_operating_organization_assignment` | Procurement organization responsible for the supplier |
| Company configuration | `master.company_code_supplier_profile` | AP, accounting, payment-term, dimension, and remittance configuration |
| Registration request | `document.business_partner_request` | Proposed identity/role/scope/lifecycle change |
| Request evidence | `document.business_partner_request_evidence` | Append-only registration and review evidence manifest |
| Validation result | `document.business_partner_request_validation` | Append-only, ruleset-pinned findings |
| Approval workflow | `document.workflow_request`, `document.workflow_stage` | Review and segregation-of-duties execution |
| Qualification | `control.business_partner_qualification` | Effective-dated eligibility decision by role and scope |
| Block | `control.business_partner_block` | Immediate or scheduled prohibition of specific operations |
| Supplier preference | `control.supplier_preference_designation` | Ranking among already eligible suppliers |
| Bank verification | `document.business_partner_bank_verification` | Independent verification and activation of remittance changes |

### 2.1 Table ownership and write map

| Phase | Tables | Write owner |
|---|---|---|
| Request header and proposed change | `document.business_partner_request` | Business Partner request service |
| Submitted evidence manifest | `document.business_partner_request_evidence` | Evidence service through the request aggregate |
| Validation findings | `document.business_partner_request_validation` | Validation engine; append-only by request revision and ruleset |
| Approval | `document.workflow_request`, `document.workflow_stage` | Workflow service |
| Canonical identity and supplier role | `master.business_partner`, `master.supplier` | Request materializer only for governed onboarding |
| Identity details | `master.business_partner_identifier`, `master.business_partner_tax_registration`, address/contact link tables | Request materializer or an authorized governed amendment handler |
| Procurement and AP scope | `master.business_partner_operating_organization_assignment`, `master.company_code_supplier_profile` | Request materializer |
| Bank proposal and decision | `document.business_partner_bank_verification` | Bank-verification service |
| Verified bank master/link | `master.bank_account`, `master.bank_account_link`, `master.bank_party` | Banking domain service after verification |
| Qualification, preference, and blocks | `control.business_partner_qualification`, `control.supplier_preference_designation`, `control.business_partner_block` | Their dedicated control services |

Cardinality and responsibility:

```text
business_partner_request 1 ---- * business_partner_request_evidence
business_partner_request 1 ---- * business_partner_request_validation
business_partner_request 1 ---- 0..1 workflow_request ---- * workflow_stage
business_partner_request 1 ---- 0..1 applied Business Partner change

business_partner 1 ---- 0..1 supplier role
business_partner 1 ---- * organization assignments
business_partner 1 ---- * qualification decisions
business_partner 1 ---- * blocks
```

`business_partner_bank_verification` is a parallel specialized aggregate, not another request-evidence child. It may reference the relevant Business Partner request for traceability, but it alone owns the bank-change decision.

## 3. Direct command versus governed request

“Direct update” means an authenticated domain-service transaction with authorization, optimistic concurrency, audit, and outbox effects. It never means browser SQL, generic CRUD, or integration writes to master tables.

| Operation | Write path | Approval rule |
|---|---|---|
| Create Business Partner | `business_partner_request:new_partner` | Always governed |
| Add supplier role to existing partner | `business_partner_request:add_supplier` | Always governed |
| Legal name, registration, tax, identifier, ownership, primary address | `business_partner_request:amend_partner` | Always governed |
| Low-risk display description or non-authoritative label | Policy-authorized domain command, or `amend_partner` | Direct only when a published policy permits it |
| Assign procurement organization | `business_partner_request:assign_organization` | Governed |
| Configure company supplier profile | `business_partner_request:configure_company` | Governed; finance approval required |
| Change remittance bank | `business_partner_bank_verification` | Independent treasury verification; never generic master update |
| Qualify supplier | `business_partner_qualification` command | Independent qualification decision |
| Apply emergency operational block | `business_partner_block` command | High-risk permission and reason required; may be immediate |
| Deactivate/reactivate/archive | Business Partner lifecycle request | Governed with dependency analysis |

All approved request applications must be idempotent and atomic. The master remains unchanged while a request is draft, validating, or awaiting approval.

## 4. Business Partner request versus supplier request

The persisted aggregate is always `document.business_partner_request`. The requested outcome determines its kind.

| User journey | `request_kind` | `requested_role` | Target partner |
|---|---|---|---|
| Register a new supplier and new identity | `new_partner` | `supplier` | `NULL` |
| Add supplier role to an existing customer/partner | `add_supplier` | `supplier` | Existing Business Partner |
| Correct approved identity information | `amend_partner` | Role optional | Existing Business Partner |
| Add procurement organization | `assign_organization` | `supplier` | Existing Business Partner |
| Configure AP/company details | `configure_company` | `supplier` | Existing Business Partner |
| Deactivate or reactivate | `deactivate` / `reactivate` | Scope in command | Existing Business Partner |
| Archive after retention/dependency review | `archive` | Scope in command | Existing Business Partner |

The UI may call the first two journeys “Supplier request,” but the API and database use the canonical Business Partner request contract.

## 5. Registration channels

### 5.1 External supplier self-registration

1. An authorized internal requester creates a supplier-registration invitation for a procurement organization and optional company.
2. Only a hash of the invitation secret is stored. The invitation is single-use, expires, and is tenant-bound.
3. The external applicant authenticates through the approved B2B identity flow and receives a restricted tenant-local applicant principal.
4. The applicant completes a `new_partner` request with `requested_role=supplier`, uploads evidence, and submits it.
5. Neon validates the request, performs duplicate detection, and creates the internal approval workflow.
6. The applicant may view status and respond to returned requests but cannot approve, qualify, configure company finance, or verify banking.

Recommended invitation contract:

```text
document.supplier_registration_invitation
  id, tenant_id, invitation_no
  requested_operating_organization_id, optional_company_code_id
  intended_supplier_name, invitee_email_hash
  token_hash, expires_at, status
  applicant_principal_id, business_partner_request_id
  accepted_at, cancelled_at
  idempotency_key, row_version, audit fields
```

No raw token is stored. Invitation acceptance and request creation occur atomically.

### 5.2 Internal on-behalf registration

1. An authorized internal maker starts the same `new_partner` supplier request.
2. The maker records that the request is on behalf of the supplier and attaches the supplier's instruction, consent, or source evidence.
3. Neon runs the same schema validation and duplicate detection used for self-registration.
4. The maker cannot approve their own request or supplier qualification.
5. Returned requests go back to the internal maker, who coordinates corrections with the supplier.

On-behalf registration must not impersonate an external applicant. The internal maker remains the auditable submitter.

### 5.3 MESH, import, and API intake

MESH, governed import, and approved APIs create the same request with pinned source identifiers, version, and hash. They propose data; they never write Business Partner master tables.

## 6. Required request-channel coordinates

Extend the source contract so channel and representation evidence are typed rather than hidden in `proposed_payload`:

```text
source_kind
  manual | portal | mesh | import | api

registration_mode
  self_service | on_behalf | integration

invitation_id                 nullable; required for invited self-service
applicant_principal_id        nullable; required for self-service
represented_party_name        nullable; required for on-behalf when identity is not yet materialized
representation_evidence_id    nullable; required by on-behalf policy
```

`portal` is a required addition to the current `source_kind` constraint and TypeScript contract. The tenant and authenticated principal always come from verified context.

## 7. End-to-end supplier onboarding

```text
Initiate
   |
   +-- external invitation --> supplier self-registration --+
   |                                                       |
   `-- internal maker -----> on-behalf registration -------+
                                                           |
                                                           v
                    Draft -> Validate -> Duplicate review -> Submit
                                                           |
                                                           v
                    Returned <------ Approval workflow ----> Rejected
                                           |
                                           v
                                        Approved
                                           |
                                           v
                                  Atomic materialization
                                           |
                    +----------------------+----------------------+
                    |                      |                      |
             Business Partner       Supplier role         Org assignment
                 active              onboarding               active
                    |                      |
                    +----------------------+
                                           |
                                           v
                                  Supplier qualification
                                           |
                         +-----------------+----------------+
                         |                                  |
                    approved/conditional                rejected/expired
                         |                                  |
                         v                                  v
                 readiness evaluation                  not eligible
                         |
                         v
                  Supplier activation
```

## 8. Workflow design

Submission freezes the reviewed request revision and creates the generic workflow aggregate atomically.

| Stage | Condition | Reviewer |
|---|---|---|
| Data stewardship | Always | Business Partner master-data steward |
| Compliance/tax | Legal identifiers, tax registrations, regulated country, or risk trigger | Compliance/tax reviewer |
| Procurement owner | Supplier role or procurement organization assignment | Authorized organization owner |
| Finance | Company-code supplier profile | Company finance controller |
| Treasury | Bank proposal/change | Treasury verifier through the bank-verification process |
| Security/privacy | Exception involving restricted evidence or integration | Designated specialist |

Rules:

- Maker and applicant cannot approve their own request.
- Permissions and effective scope are checked again at decision time.
- Returned changes create a new reviewed revision and invalidate affected approvals.
- Approval does not update master data; apply is a separate idempotent transaction.
- Materialization reruns volatile validation, duplicate, scope, and base-version checks.
- Workflow decisions and rejected/cancelled requests remain immutable evidence.

## 9. Materialization design

For `new_partner + supplier`, one transaction creates:

1. `master.business_partner` with status `active`.
2. `master.supplier` with status `onboarding`.
3. `master.business_partner_operating_organization_assignment` for the approved procurement organization.
4. Typed identifiers, addresses, contacts, tax registrations, evidence references, and external references approved in the request.
5. An immutable `snapshot.entity_snapshot_identity` plus payload snapshot of the applied aggregate.
6. Outbox and audit evidence.
7. The request's materialized IDs, application fingerprint, and final `applied` status.

Failure rolls back all master changes. Retry uses the same request ID, application idempotency key, and payload fingerprint.

Company configuration should normally be a subsequent `configure_company` request because finance settings and bank readiness have different approvers. A tenant policy may combine it with onboarding only when the same reviewed payload, workflow stages, and atomicity guarantees remain explicit.

## 10. Supplier qualification

Qualification is deliberately separate from registration:

- A supplier can require different qualification decisions by operating organization, company, commodity capability, and qualification type.
- Qualification expires, is reviewed periodically, and may be conditional.
- Requalification must not reopen or rewrite the original registration request.
- Preference is evaluated only after qualification; preferred does not mean qualified.

The current `control.business_partner_qualification` requires an existing Business Partner, so qualification begins after request materialization. Until required qualifications pass, `master.supplier.status` remains `onboarding`.

Recommended readiness rule:

```text
supplier_ready =
  business_partner.status = active
  AND supplier.status IN (onboarding, active)
  AND effective procurement organization assignment exists
  AND required company profile exists when company-scoped operation is requested
  AND every required qualification is approved or accepted-conditional and effective
  AND no effective business_partner_block prohibits the operation
  AND a verified remittance bank link exists when payment readiness is required
```

Only an authorized activation command may transition the supplier from `onboarding` to `active` after the readiness evaluator passes.

## 11. Banking

`document.business_partner_bank_verification` remains the authority for accepting a proposed remittance change. It must:

1. Pin the masked MESH disclosure or other approved source evidence.
2. Require an independently verified local `master.bank_account_link` candidate.
3. Enforce maker/verifier segregation of duties.
4. Recheck the disclosure fingerprint and current company profile before apply.
5. Update `preferred_remittance_bank_link_id` atomically and preserve prior-link evidence.

The generic `business_partner_request:change_bank` kind should be deprecated unless it is retained only as an orchestration parent that links to `business_partner_bank_verification`. There must not be two independent bank-change authorities.

## 12. Deactivation, blocking, and archive

| Action | Effect |
|---|---|
| Emergency block | Immediately prohibits selected operations without rewriting identity or history |
| Supplier suspension | Stops new supplier use while retaining the Business Partner identity and historical documents |
| Business Partner deactivation | Stops new commercial use after governed impact analysis |
| Reactivation | Revalidates blocks, qualifications, scope, company profile, and banking before restoring use |
| Archive | Terminal business lifecycle state after deactivation, dependency checks, and retention approval |

Deactivation never cascade-deletes supplier/customer roles, invoices, orders, payments, snapshots, workflow, evidence, or audit records.

## 13. API boundaries

Internal Neon APIs:

```http
POST   /api/neon/business-partner-requests
PATCH  /api/neon/business-partner-requests/{requestId}
POST   /api/neon/business-partner-requests/{requestId}:validate
POST   /api/neon/business-partner-requests/{requestId}:submit
POST   /api/neon/business-partner-requests/{requestId}:decide
POST   /api/neon/business-partner-requests/{requestId}:apply

POST   /api/neon/supplier-registration-invitations
POST   /api/neon/supplier-registration-invitations/{invitationId}:cancel
GET    /api/neon/suppliers/{supplierId}/readiness
POST   /api/neon/suppliers/{supplierId}:activate

POST   /api/neon/business-partners/{partnerId}/qualifications
POST   /api/neon/business-partner-qualifications/{qualificationId}:decide
POST   /api/neon/business-partner-qualifications/{qualificationId}:renew

POST   /api/neon/business-partners/{partnerId}/blocks
POST   /api/neon/business-partner-blocks/{blockId}:lift
```

External registration APIs use a restricted facade and never expose internal workflow, qualification, master-data, or generic request-decision commands.

## 14. Permissions

Keep permissions separate by responsibility:

```text
neon.relationship.business_partner_request.create
neon.relationship.business_partner_request.update
neon.relationship.business_partner_request.validate
neon.relationship.business_partner_request.submit
neon.relationship.business_partner_request.decide
neon.relationship.business_partner_request.apply

neon.supplier_registration.invitation.create
neon.supplier_registration.invitation.cancel
neon.supplier_registration.external.respond

neon.business_partner_qualification.create
neon.business_partner_qualification.decide
neon.business_partner_qualification.renew

neon.business_partner_block.create
neon.business_partner_block.lift
neon.supplier.activate
```

Decision, apply, qualification, supplier activation, block management, and bank verification must not be implied by request-create access.

## 15. Implementation gaps in the current codebase

1. `source_kind` currently accepts only `manual`, `mesh`, `import`, and `api`; add `portal` plus typed registration-mode coordinates.
2. No secure supplier-registration invitation aggregate currently exists.
3. The materializer currently implements new partner, supplier/customer role extension, organization assignment, and company configuration. Dedicated apply handlers are still needed for amendment, deactivation, reactivation, and archive.
4. The current applied-request constraint assumes exactly one materialized role and organization assignment for every request kind. Make it request-kind-aware before enabling amendment and lifecycle request kinds.
5. `change_bank` overlaps the dedicated bank-verification aggregate; deprecate it or make it a non-authoritative orchestration parent.
6. Supplier activation after qualification/readiness needs an explicit command and permission.
7. External applicant identity, request visibility, evidence upload, returned-request correction, rate limiting, and abuse controls require a restricted portal boundary.

## 16. Acceptance criteria

- A new external or on-behalf supplier produces one Business Partner request, not parallel request aggregates.
- No external actor, adapter, or browser writes `master.business_partner`, `master.supplier`, company profiles, qualifications, blocks, or bank links directly.
- Approved application creates complete mandatory rows or none.
- Supplier remains `onboarding` until qualification and readiness pass.
- An applicant/maker cannot approve, qualify, activate, or verify their own submission.
- Duplicate, stale source, invalid scope, changed bank fingerprint, and stale base-version cases fail closed.
- Every decision is tied to the exact schema, validation results, evidence hashes, workflow revision, source version, and reviewed payload.
- Deactivation and archive preserve all historical and financial references.

## 17. Build progress

Phase 1 foundation implemented on 2026-08-29:

- Added the secure `document.supplier_registration_invitation` persistence contract with hashed secrets, single-use lifecycle, tenant isolation, immutable authority coordinates, optimistic concurrency, indexes, grants, and RLS.
- Added typed request channels: `direct`, `self_service`, `on_behalf`, and `integration`; added `portal` as a request source.
- Added typed invitation, applicant, represented-party, and representation-evidence coordinates to `document.business_partner_request` and the TypeScript/API contracts.
- Added database and service guards preventing invalid channel combinations, on-behalf submission without evidence, and self-service submission without the accepted invitation binding.
- Added the forward migration `20260829_neon_supplier_registration_channel.sql` and focused regression coverage.

Phase 2 invitation lifecycle implemented on 2026-08-29:

- Added permission-gated create, read, cancel, and external-response operations.
- Added one-time cryptographically random invitation tokens; only token and normalized-email hashes are persisted, and replayed create commands do not return a token.
- Added atomic token acceptance, email binding, applicant binding, and `new_partner + supplier` portal-request creation.
- Added restricted internal and external HTTP routes, transactional audit/outbox effects, readiness health, and host composition.
- Added tenant-scoped, idempotent expiry processing using row locks and `SKIP LOCKED` for concurrent workers.
- Added authorization reference seeds, forward migrations, authorization-inventory classification, and service/database regression coverage.

Next phase: implement amendment, deactivation, reactivation, and archive materializers; then add the supplier readiness activation command.
