# Athyper Business Partner architecture design

**Status:** Accepted target architecture  
**Effective:** 2026-08-29  
**Authority:** Normative for Business Partner work across NEON, MESH, STUDIO, and TrustIAM/Keycloak  
**Delivery companion:** [Business Partner pending build plan](./athyper-business-partner-pending-build-plan.md)

This document supersedes the former three-plane foundation, supplier-onboarding, and NEON onboarding/extension documents. It reconciles those decisions into one architecture. Historical delivery evidence remains in the [production build plan](./neon-mesh-studio-business-partner-production-build-plan.md); unfinished work is tracked only in the delivery companion above.

## 1. Executive decision

Athyper uses one party identity with independently governed roles and projections:

```text
                         STUDIO
        definitions, policy, mappings, canonical reconciliation
                              |
                  signed/versioned projections
                              |
                              v
Intake -----------------> NEON Business Partner ----------------> MESH
manual, portal, API,     identity, supplier/customer/person       account,
import, MESH             roles, workforce, qualification,         profile,
                        scope, readiness and local truth          relationship
                              |
                              v
                     TrustIAM / Keycloak
                  desired IAM state / credentials,
                   MFA, sessions and membership
```

The core decisions are:

1. `master.business_partner` is NEON's tenant-local party root.
2. Supplier, customer, and workforce are roles, not separate identities.
3. `document.business_partner_request` is the only governed creation and change aggregate, regardless of intake channel.
4. MESH owns network accounts and relationships; it proposes data to NEON but cannot mutate NEON master data.
5. STUDIO owns definitions and optional canonical organization reconciliation; it does not own operational BP instances.
6. TrustIAM owns desired IAM projections and Keycloak owns authentication. Neither is a business authorization authority.
7. Readiness is derived from independently authoritative facts and never stored as a shortcut Boolean.

This follows the durable patterns used by SAP Business Partner, SAP Ariba, SAP Business Network, and SAP HANA: one identity, additive roles, organization-specific scope, effective-dated extensions, and governed replication. Athyper contracts remain authoritative where product behavior differs.

## 2. Scope and outcomes

This architecture covers:

- supplier onboarding, qualification, activation, organization/company configuration, banking, blocking, and lifecycle;
- customer onboarding, sales scope, credit/commercial review, company configuration, and lifecycle;
- person and workforce onboarding, employment, work assignment, onboarding execution, and optional application access;
- internal, invited self-service, MESH, import, and API intake;
- cross-plane identity, publication, IAM, authorization, events, reconciliation, and operational controls.

It does not make MESH an employee directory, STUDIO an operational master, Keycloak an entitlement store, or general JSON a home for restricted PII or bank data.

## 3. Canonical vocabulary and invariants

| Term | Meaning |
|---|---|
| Party category | Immutable structural kind: `organization`, `person`, or reserved `group` |
| Ownership class | `external` or `internal`; never encoded as a party category |
| Commercial role | Independently governed `supplier` or `customer` role |
| Workforce role | A person BP with either an internal employment role, an external-worker role, or both over time |
| Canonical party | Optional STUDIO reconciliation identity; never a distributed foreign key |
| Network account | MESH participant account with buyer, supplier, or both capability |
| IAM organization | TrustIAM desired-state projection to Keycloak for user administration |
| Principal | Authenticated application actor; not a person master or BP role |

Locked invariants:

1. Party category is immutable. Correction requires governed merge or supersession.
2. `government`, `nonprofit`, and `sole_proprietor` are classifications, not categories.
3. `internal` is an ownership class. Intercompany supplier/customer roles require it.
4. A person BP has exactly one `master.person`; an organization BP has none.
5. Workforce requires a person BP. Supplier/customer may apply to organization or person when policy permits.
6. One request applies one role or scope intent. Dual-role partners use independently approved requests against one BP.
7. Every source uses the same validation, workflow, and idempotent materialization boundary.
8. No browser, import, MESH consumer, IAM worker, or STUDIO deployment writes BP master tables directly.
9. MESH never receives workforce profiles or restricted person data.
10. Keycloak membership never grants a plane-local business permission.
11. Cross-plane IDs are opaque copied coordinates; cross-database foreign keys are forbidden.
12. Bank data, tax/national identifiers, birth dates, credentials, and unmasked accounts stay out of general JSON, logs, metrics, events, and browser bootstrap data.
13. Activation/readiness is computed from current authoritative components.

## 4. Authority and identity model

### 4.1 Cardinality

```text
STUDIO canonical_party 1 ---- 0..* NEON business_partner representations
STUDIO canonical_party 1 ---- 0..* MESH network_account purposes
STUDIO canonical_party 1 ---- 0..* TrustIAM organizations/realms

NEON business_partner 1 ---- 0..1 supplier
NEON business_partner 1 ---- 0..1 customer
NEON business_partner 1 ---- 0..1 person
NEON person           1 ---- 0..1 employee
NEON person           1 ---- 0..1 external_worker
NEON person           1 ---- 0..* employment
NEON employee         1 ---- 0..* work_assignment
NEON external_worker  1 ---- 0..* worker_engagement

MESH buyer account    1 ---- * network_relationship * ---- 1 supplier account
NEON business_partner 1 ---- 0..* approved MESH account links

BP request            1 ---- * evidence and validation findings
BP request            1 ---- 0..1 workflow request
BP request            1 ---- 0..1 immutable application result
```

### 4.2 Authority matrix

| Data | Authority | Treatment elsewhere |
|---|---|---|
| BP identity and tenant-local roles | NEON | Selective publication or mapping |
| Person PII and workforce facts | NEON | Never sent to MESH; minimum subject data to IAM only |
| Network account/profile/relationship | MESH | Verified recipient-safe projection to NEON |
| Schemas, forms, views, mappings, workflows | STUDIO | Signed immutable local projection |
| Canonical organization reconciliation | STUDIO `master.canonical_party` | Optional opaque ID |
| Credentials, MFA, sessions | Keycloak | Provider subject bound to a local principal |
| Desired IAM organization/projection | STUDIO TrustIAM | Reconciled to Keycloak |
| Permissions and effective scope | Each plane's PostgreSQL authorization model | Never inferred from provider attributes |

For a reconciled organization, the intended equality is:

```text
STUDIO master.canonical_party.id
  = NEON master.business_partner.canonical_party_id
  = MESH mesh.network_account.canonical_party_id
  = STUDIO trustiam.organization.canonical_party_id
```

The equality is a reconciliation rule, not referential integrity across databases. Local-only BPs may have no canonical party, MESH account, IAM organization, or application principal.

## 5. NEON domain contract

### 5.1 Sealed domains

```text
business_partner_category = organization | person | group
business_partner_ownership = external | internal
business_partner_status = draft | active | inactive | archived
supplier_status = onboarding | active | suspended | inactive | archived
customer_status = prospect | active | suspended | inactive | archived
commercial_partner_role = supplier | customer
requested_role = supplier | customer | workforce
request_kind =
  new_partner | amend_partner | add_supplier | add_customer | add_workforce |
  assign_organization | configure_company | change_bank |
  change_employment | deactivate | reactivate | archive
```

`group` is reserved and rejected by Release 1 validation. Workforce is deliberately excluded from the commercial role domain. Operational blocking belongs in `control.business_partner_block`, not the BP status.

### 5.2 Business Partner root

`master.business_partner` owns identity, category, ownership, normalized display label, lifecycle, optional canonical-party coordinate, representation purpose, and record version. Category, ownership, canonical-party purpose, and creation evidence become immutable at activation.

Organization legal facts belong on the BP and its typed extensions. Person legal-name components belong on `master.person`. Duplicate detection uses category, jurisdiction, identifiers, normalized names, source evidence, and steward resolution; it must not silently merge records.

### 5.3 Commercial roles and scope

- `master.supplier` and `master.customer` are thin one-to-one extensions.
- `master.business_partner_operating_organization_assignment` owns procurement or sales responsibility.
- company-code supplier/customer profiles own exact-company finance configuration.
- qualification, credit/risk review, preference, blocks, and bank verification are separate aggregates.
- internal BPs and intercompany role types are mutually constrained.

Supplier/customer role creation does not imply readiness. A dual-role BP has independent requests, approvals, lifecycle, scope, and readiness per role.

### 5.4 Person and workforce

`master.person.business_partner_id` is tenant-safe, unique, required, and immutable. Database guards enforce that it points to a person-category BP and that an organization BP cannot acquire a person row.

| Table | Responsibility |
|---|---|
| `master.person` | Natural-person identity and ordinary contact data |
| `master.person_sensitive_profile` | Restricted, purpose-bound PII |
| `master.employee` | Tenant workforce role and optional principal link |
| `master.employment` | Legal employer, contract, employee number, hire/termination facts |
| `master.work_assignment` | Effective organization, position, manager, cost object, site, and FTE |
| `master.external_worker` | Reusable non-employee workforce role; never implies buyer employment or payroll |
| `document.worker_engagement` | Supplier, buyer, work-order/SOW, dates, commercial terms, compliance and lifecycle |
| `document.worker_operational_placement` | Effective buyer manager, organization, site and cost allocation without employee headcount |

Employment and assignment use non-overlapping `[from, until)` effective ranges with at most one applicable active primary record. Company/legal-entity compatibility is checked at write time. Flattened employee compatibility fields are derived until their consumers migrate.

External workforce is governed independently. A supplier-employed or independent worker creates or reuses a person BP and `master.external_worker`, but does not create `master.employee`, `master.employment`, payroll, benefits, statutory enrollment, or buyer headcount. Each commercial relationship is an effective-dated `document.worker_engagement` authorized by exactly one contingent work order or statement of work. A person may hold internal employment and external engagements concurrently when policy permits.

### 5.5 Governed request aggregate

`document.business_partner_request` is source-neutral. Typed coordinates include source kind, registration mode, invitation/applicant, target BP, requested role, operating organization, legal entity, company, definition/ruleset versions, payload hash, evidence manifest, and optimistic row version.

Sources are `manual | portal | mesh | import | api`; registration modes are `self_service | on_behalf | integration`. Tenant and actor always come from verified context. On-behalf intake records the actual internal submitter and representation evidence; it never impersonates the represented party.

Applied results are role- and request-kind-aware:

| Intent | Required result | Forbidden result |
|---|---|---|
| New/add supplier | BP, supplier, procurement assignment, snapshot | customer/workforce rows |
| New/add customer | BP, customer, sales assignment, snapshot | supplier/workforce rows |
| New/add workforce | Person BP, person, employee, employment, assignment, snapshot | commercial role/assignment rows |
| Configure company | Exactly one role-specific company profile and snapshot | unrelated role profile |
| Change employment | New effective employment/assignment snapshot | rewrite of historical rows |
| Lifecycle command | Targeted role/BP transition, impact evidence, snapshot | cascade deletion |

Materialization is one transaction. It reruns volatile validation and base-version checks, writes master/extension rows, immutable snapshot, audit, outbox, and application fingerprint, then marks the request applied. Retry uses the same request ID and idempotency fingerprint.

### 5.6 Request lifecycle and workflow

```text
draft -> validating -> validation_failed -> draft
draft -> pending_approval -> returned -> draft
pending_approval -> rejected
pending_approval -> approved -> applying -> applied
approved/applying -> failed -> applying
draft/returned -> cancelled
eligible prior states -> superseded
```

Every mutation checks `row_version`. Submission pins the reviewed revision, scope, evidence, validation, duplicate resolution, definition/ruleset versions, and payload hash. Relevant stages include data stewardship, compliance/tax, procurement or sales ownership, finance/credit, treasury, HR/hiring management, and security/privacy. Maker/applicant self-approval is prohibited and permissions are re-evaluated at decision and apply time.

### 5.7 Invitations and external access

The target `document.business_partner_invitation` supports `supplier | customer | workforce` journeys and `self_service | on_behalf | integration` modes. It stores requested scope, invitee email hash, token hash, expiry, acceptance/cancellation, applicant principal, request, idempotency key, and row version.

Raw tokens are never persisted. Acceptance, restricted principal binding, and draft creation form a recoverable, audited saga. The external facade permits only invitation response, owned draft maintenance, evidence upload, submit, returned-request correction, and status. It exposes no generic decision, apply, qualification, finance, HR, or master-data command.

## 6. Onboarding journeys

### 6.1 Supplier

```text
internal maker / external invitation / MESH / import / API
  -> new or add-supplier BP request
  -> identity, tax, duplicate, evidence and procurement-scope validation
  -> stewardship + compliance + procurement approval
  -> atomic BP + supplier + procurement assignment
  -> qualification by organization/company/commodity/region
  -> AP company configuration
  -> independent remittance-bank verification
  -> derived purchasing/payment readiness
  -> authorized supplier activation
  -> optional MESH link and supplier-portal IAM projection
```

Registration, qualification, company setup, bank verification, and activation remain separate authorities. Preferred does not mean qualified. Emergency blocks can prohibit operations without rewriting identity or history.

### 6.2 Customer

```text
internal maker / customer invitation / MESH buyer / import / API
  -> new or add-customer BP request
  -> identity, tax, duplicate, consent and sales-scope validation
  -> stewardship + compliance + sales approval
  -> atomic BP + customer + sales assignment
  -> credit/commercial review
  -> AR company profile, terms, statements and credit configuration
  -> derived order/invoice/credit readiness
  -> authorized activation
  -> optional MESH buyer link and customer-portal IAM projection
```

A policy-approved sole proprietor or consumer can be a person customer. That request creates BP + person + customer, not employee/workforce records.

### 6.3 Workforce person

```text
recruiter / HR import / approved API / invited candidate
  -> new or add-workforce BP request
  -> identity, duplicate, consent, right-to-work/background evidence,
     employer, company, position, manager, dates and FTE validation
  -> HR + manager + compliance approval as policy requires
  -> internal: atomic BP + person + employee + employment + assignment
  -> external: person BP + external worker + supplier-backed engagement
  -> workforce onboarding case/checklist
  -> governed payroll, benefits, equipment, policy and training steps
  -> optional principal/Keycloak user and employer-organization membership
  -> independent employment and access activation gates
```

`document.onboarding_case` executes post-approval tasks and binds one applied BP request; it is not an approval authority. `document.people_request` handles post-hire changes and is not a parallel new-hire materializer.

## 7. Readiness, banking, and lifecycle

Readiness evaluators return Boolean eligibility plus stable reason codes and evidence versions. Typical supplier readiness requires active BP, effective procurement assignment, required company profile, current qualification, no prohibitive block, and a verified bank link when payment is requested. Customer and workforce evaluators use their own role-specific components.

`document.business_partner_bank_verification` is the sole authority for remittance changes. A generic `change_bank` request may only orchestrate that aggregate; it cannot create a second decision path.

Lifecycle actions preserve history:

| Action | Architectural effect |
|---|---|
| Block | Immediately prohibit selected operations without changing identity |
| Suspend role | Stop new role use while preserving documents and BP identity |
| Deactivate BP | Stop new business after governed dependency/impact review |
| Reactivate | Re-evaluate blocks, scope, qualification, company and bank gates |
| Archive | Terminal lifecycle after deactivation, retention and dependency approval |

No lifecycle action cascade-deletes roles, employment, orders, invoices, payments, evidence, workflow, snapshots, or audit history.

## 8. MESH contract

- `mesh.network_account` owns network identity and buyer/supplier/both capability.
- `mesh.network_relationship` owns the buyer-to-supplier edge and participant lifecycle.
- profile, identifiers, tax, commodity, industry, publication, withdrawal, bank disclosure, inbox, replay, and reconciliation stay within their existing MESH authorities.
- active cross-plane organization accounts require a canonical-party coordinate; pending accounts can remain unmatched through duplicate review.
- one canonical party may have multiple accounts only for different account purposes.
- `control.mesh_business_partner_account_link` is NEON's approved directional mapping.
- only organization and policy-approved sole-proprietor profiles are publishable in Release 1. Person/workforce payloads are rejected at service and database boundaries.

MESH relationship lifecycle and NEON readiness are independent. MESH suspension emits review/block recommendations and never silently deactivates a NEON BP.

## 9. STUDIO and IAM contract

### 9.1 STUDIO

STUDIO publishes signed, immutable, versioned bundles for supplier, customer, and workforce schemas; category-specific fields; forms/list/detail/review views; source mappings; duplicate rules; workflow/SoD/SLA policy; activation gates; and MESH-safe publication contracts.

NEON and MESH verify and activate compatible local projections. They do not call STUDIO synchronously inside operational transactions. Incompatible bundles may stage but cannot activate. STUDIO's tenant-provisioning onboarding case is distinct from NEON's workforce onboarding case.

### 9.2 TrustIAM and Keycloak

Keycloak owns credentials, MFA, federation, required actions, sessions, and provider memberships. TrustIAM owns desired/observed organization and application projections plus provisioning attempts. Plane-local databases own principals, identity bindings, tenant memberships, roles, permissions, scope targets, denials, and delegations.

A workforce person joins the employer IAM organization; the person does not become an IAM organization. IAM provisioning is retryable and may fail without rolling back HR master data. Employment activation and application access have independent gates. Provider attributes are reconciliation hints only and cannot be accepted as business authorization claims.

## 10. APIs, events, and asynchronous wiring

| Capability | Boundary | Authority |
|---|---|---|
| Request CRUD/validate/submit/decide/apply | `/api/neon/business-partner-requests` | NEON BP request service |
| BP aggregate/readiness | `/api/neon/business-partners` | NEON read model/evaluator |
| Invitations | `/api/neon/business-partner-invitations` | NEON invitation service |
| Qualification/block/preference/bank/credit | Bounded NEON endpoints | Dedicated domain services |
| MESH account/relationship/publication | `/api/mesh/...` | MESH services |
| MESH match/selective acceptance | NEON profile-discovery endpoints | NEON adapter over verified projection |
| Workforce onboarding | `/api/neon/workforce-onboarding` | NEON people service after apply |
| IAM projection/reconciliation | STUDIO TrustIAM endpoints/jobs | TrustIAM service |
| Definition publish/activate | STUDIO definition endpoints | STUDIO publication service |

Required event families include request lifecycle, role addition, scope assignment, publication/withdrawal, account-link decisions, workforce onboarding, and IAM organization/identity projection. Events contain IDs, versions, hashes, statuses, and safe reason codes only. Outbox delivery is at-least-once; consumers deduplicate, enforce ordering/version rules, quarantine invalid contracts, and support replay.

## 11. Authorization, privacy, and operations

- Every command requires service-level permission and effective scope; forced RLS is the final tenant/participant isolation guard.
- Request create/update/validate/submit/decide/apply permissions remain separate. Invitation, qualification, activation, credit, HR, bank, block, definition publication, MESH, and IAM authorities remain distinct.
- Decision/apply, bank, credit, HR-sensitive, publication, replay, and deprovision actions enforce maker-checker, MFA, or both according to policy.
- Restricted person and banking stores use purpose-bound authorization, column/row controls, encryption where required, redaction, retention, and audited access.
- Optimistic concurrency protects mutable aggregates. Application, publication, and provisioning use stable idempotency keys and immutable fingerprints.
- Metrics use tenant-safe dimensions and exclude payload values. Correlation spans request, workflow, snapshot, outbox, projection, IAM attempt, and reconciliation records.
- Reconciliation detects orphaned/mismatched projections without treating a remote system as authority for local state.

## 12. Definition of done

The architecture is fully realized only when:

1. Supplier, customer, and workforce paths all use the governed request boundary from every supported source.
2. Category, ownership, person cardinality, effective ranges, role compatibility, and tenant-safe references are database-enforced.
3. Every request kind has one idempotent materializer or an explicit orchestration authority.
4. All three journeys have internal and applicable external UI, evidence, review, aggregate/readiness, and lifecycle flows.
5. MESH cannot accept workforce data and cannot bypass NEON governance.
6. STUDIO bundles for all journeys compile, sign, project, canary, roll back, and work from the last verified local copy.
7. IAM organization/user sagas reconcile, retry, fence stale work, deprovision, and never grant business permissions by provider attributes.
8. Security, privacy, concurrency, load, replay, reconciliation, backup/restore, rollback, accessibility, and disaster-recovery evidence passes.
9. Named NEON, MESH, STUDIO/IAM, security/privacy, operations, and product owners certify the release.

Current completion and remaining work are intentionally not embedded here. See the [pending build plan](./athyper-business-partner-pending-build-plan.md) for the live gap-to-target ledger.

## 13. Repository implementation map

| Concern | Primary location |
|---|---|
| Canonical DDL | `server/db/ddl/` |
| Forward migrations | `server/db/migrations/` |
| NEON BP services/routes/repositories | `server/src/modules/neon/` |
| MESH services/routes/repositories | `server/src/modules/mesh/` |
| STUDIO/TrustIAM services | `server/src/modules/studio/` and `server/src/modules/trustiam/` |
| Shared contracts | `server/src/modules/common/` and generated schema clients |
| NEON web journeys | `apps/neon/` |
| Database and contract tests | `server/tests/` |
| Cross-plane and browser acceptance | `tests/e2e/` |
