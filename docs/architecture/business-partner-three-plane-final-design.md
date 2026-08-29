# Business Partner foundation: final three-plane design and build plan

**Decision status:** Accepted for implementation

**Design milestone:** Step 1 — DDL and end-to-end architecture closure

**Scope:** Supplier onboarding, customer onboarding, workforce-person onboarding, MESH Network Account linkage, Keycloak organization projection, and STUDIO-managed definitions

**Reviewed baseline:** Repository state on 2026-08-29

## 1. Executive decision

Athyper will use one party identity pattern with distinct plane-local representations:

```text
                         STUDIO
              master.canonical_party (optional)
                   stable reconciliation ID
                    /          |          \
                   /           |           \
                  v            v            v
        NEON Business      MESH Network    TrustIAM / Keycloak
        Partner master       Account        Organization
             |
       +-----+-------------------+
       |             |           |
    Supplier      Customer    Person profile
       role          role          |
                                  Employee
                                     |
                                  Employment
                                     |
                               Work assignment
```

The four representations are not interchangeable:

- `master.business_partner` in NEON is the tenant's operational party identity.
- `mesh.network_account` is a network participation account, not a Business Partner.
- `trustiam.organization` is desired IAM administration state whose Keycloak projection authenticates and groups users; it grants no NEON or MESH business permission.
- `master.canonical_party` in STUDIO is an optional cross-plane reconciliation coordinate for organizations. It is not a runtime foreign-key authority and is not required for local-only natural persons.

Supplier, customer, and workforce are roles or capabilities of a party. They never create a second identity for the same real-world party. Each governed request changes exactly one role or scope so that approval evidence, segregation of duties, retry, and rollback stay unambiguous.

## 2. Decisions borrowed from SAP patterns

The design takes principles, not product-specific schemas, from current SAP material:

- SAP Business Partner separates the stable BP category from BP roles and makes the category immutable. Athyper adopts immutable `organization | person | group` category semantics and keeps supplier/customer/workforce outside the category. See [SAP Business Partner Category](https://help.sap.com/docs/SAP_S4HANA_CLOUD/f86dc2eb1f8b48c880a7607213104b27/abc58f7afcfb4a37bdcd9ea8a838f09c.html).
- SAP Ariba separates supplier registration, qualification/requalification, and preferred-supplier decisions. Athyper retains the current independent request, qualification, and preference aggregates. See [Managing Suppliers and Supplier Lifecycles](https://help.sap.com/docs/ARIBA_SOURCING/managing-suppliers-and-supplier-lifecycles) and [Supplier Qualification and Requalification](https://help.sap.com/docs/ARIBA_SOURCING/f081c6c38fb7466a84d746a7998bfe0e/supplier-qualification-and-requalification-using-supplier-qualification-projects).
- SAP Business Network separates company account registration from the trading relationship and performs duplicate-account checks. Athyper retains separate MESH accounts, participant relationships, immutable publications, matching, and selective acceptance. See [SAP Business Network Registration](https://help.sap.com/docs/business-network-for-procurement/introduction-to-business-network/registering-on-sap-business-network) and [How Buyers and Suppliers Connect](https://help.sap.com/docs/business-network-for-procurement/business-network-buyer-administration/how-buyers-and-suppliers-connect).
- SAP's workforce model distinguishes a natural person from employment-specific records and supports multiple employments. Athyper keeps `person`, `employee`, `employment`, and effective-dated work assignment separate. See [Employee Central Employment Information](https://help.sap.com/docs/successfactors-employee-central/implementing-employee-central-core/employment-information) and [Employee Central Payroll data models](https://help.sap.com/docs/successfactors-employee-central-payroll/implementing-employee-central-payroll-based-on-sap-human-capital-management-for-sap-s4hana/data-models-in-employee-central-and-in-employee-central-payroll).

## 3. Current-state review

### 3.1 What is already implemented and should be retained

| Area | Current state | Decision |
|---|---|---|
| NEON BP root and commercial roles | `master.business_partner`, one-to-one supplier/customer roles, identifiers, tax, commodity, relationship, organization assignment, and company profiles exist | Retain |
| Governed request kernel | Source-neutral request, invitation, append-only evidence and validation, workflow, idempotent materialization, snapshot, audit, and outbox exist | Retain and generalize |
| Supplier readiness | Qualification, blocks, preference, risk hooks, bank verification, and stable reason codes exist | Retain |
| Customer role | Customer extension and company configuration are implemented | Retain; add first-class new-customer onboarding UX and policy |
| MESH | Account, relationship, safe publication, inbox, match/diff, acceptance, account linkage, bank disclosure, delivery, and reconciliation exist | Retain |
| STUDIO | Immutable Business Partner definition bundle, signing/publication, plane-local activation, and rollback exist | Retain and add customer/workforce definitions |
| IAM | Provider-neutral principal/binding, STUDIO TrustIAM organization/projection, and Keycloak responsibility boundary exist | Retain |
| Workforce persistence | `person`, sensitive profile, employee, employment, work assignment, HR request, onboarding, and offboarding tables exist | Retain and join to BP governance |

### 3.2 Gaps that prevent a complete three-journey model

1. `master.business_partner_category_d`, BP/supplier/customer lifecycle domains, and several related domains are created as unconstrained `text`; the intended values are enforced only in service code or not at all.
2. Current BP category values mix party kind (`organization`, `individual`) with legal/sector classification (`government`, `nonprofit`) and ownership (`internal`).
3. `master.person` has no one-to-one link to `master.business_partner`, so a natural person can acquire a second identity.
4. `master.partner_role_d` correctly covers commercial roles only, but `document.business_partner_request.requested_role` reuses it and therefore cannot represent workforce onboarding.
5. Request materialization requires exactly one supplier/customer plus an operating-organization assignment. That invariant rejects a workforce result and makes person-category customer onboarding incomplete.
6. The external invitation aggregate and permissions are supplier-specific.
7. The NEON create experience is supplier-first. New customer creation and workforce-person onboarding do not have equivalent complete routes.
8. `document.people_request` and NEON `document.onboarding_case` are broad persistence shells; neither is wired to the governed BP request, deterministic validation, materialization, or IAM provisioning saga.
9. STUDIO's active BP bundle covers the commercial foundation but not a complete customer and workforce definition set.
10. Existing Keycloak fixtures carry network-account codes as organization attributes. These are discovery hints and must not become the durable BP/account link or an authorization input.

## 4. Canonical vocabulary and invariants

| Term | Final meaning |
|---|---|
| Party category | Immutable structural kind: `organization`, `person`, or reserved `group` |
| Ownership class | `external` or `internal`; replaces use of `internal` as a category |
| Commercial role | `supplier` or `customer`; used by procurement/sales qualification, assignment, company profile, and blocks |
| Workforce role | An optional role of a person-category BP, materialized as person + employee + employment + work assignment |
| Canonical party | Optional STUDIO reconciliation identity shared by organization projections; no cross-database FK |
| Network account | MESH participant account owned by one tenant; can be buyer, supplier, or both |
| IAM organization | TrustIAM desired state projected to Keycloak; user administration boundary only |
| Principal | Authenticated application actor; not the person master and not a Business Partner role |

Locked invariants:

1. A BP category never changes after creation. Correction means merge/supersede under governance.
2. `government`, `nonprofit`, and `sole_proprietor` are legal/business classifications, not BP categories.
3. `internal` is an ownership class. Intercompany supplier/customer roles require `ownership_class=internal`.
4. A person-category BP has exactly one active `master.person`; an organization-category BP has none.
5. A workforce role requires a person-category BP. Supplier and customer roles may apply to an organization or person subject to policy.
6. A request applies one role/scope intent only. Dual-role partners use two independently approved requests against one BP.
7. No browser, import, MESH consumer, IAM worker, or STUDIO deployment writes BP master tables directly.
8. MESH never publishes a workforce profile or `person_sensitive_profile` data.
9. A Keycloak user or organization membership never grants a business permission.
10. Cross-plane coordinates are opaque UUID values copied into local records; cross-database foreign keys are forbidden.
11. Bank, tax identifiers, national IDs, dates of birth, credentials, and unmasked account values never enter general profile JSON, logs, metrics, or browser bootstrap payloads.
12. Activation/readiness is derived from authoritative component state; no `is_ready` Boolean is stored.

## 5. Final logical model

### 5.1 Cardinality

```text
STUDIO canonical_party 1 ---- 0..* NEON business_partner representations
STUDIO canonical_party 1 ---- 0..* MESH network_account purposes
STUDIO canonical_party 1 ---- 0..* TrustIAM organizations/realms

NEON business_partner 1 ---- 0..1 supplier
NEON business_partner 1 ---- 0..1 customer
NEON business_partner 1 ---- 0..1 person
NEON person           1 ---- 0..1 employee
NEON person           1 ---- 0..* employment
NEON employee         1 ---- 0..* work_assignment

MESH buyer account    1 ---- * network_relationship * ---- 1 supplier account
NEON business_partner 1 ---- 0..* approved MESH account links

BP request            1 ---- * evidence
BP request            1 ---- * validation findings
BP request            1 ---- 0..1 workflow request
BP request            1 ---- 0..1 immutable application result
```

### 5.2 Authority matrix

| Data | Authoritative owner | Other-plane treatment |
|---|---|---|
| BP identity and tenant-local roles | NEON | Published/mapped selectively |
| Person PII and workforce facts | NEON | Never projected to MESH; only minimum IAM subject data to provider |
| Network account/profile/relationship | MESH | Immutable recipient-safe projection to NEON |
| Definition schemas/forms/views/mappings/workflows | STUDIO | Signed, immutable local projection in NEON/MESH |
| Canonical organization reconciliation | STUDIO `master.canonical_party` | Opaque copied ID only |
| Credentials, MFA, provider sessions | Keycloak | Provider subject bound to local principal |
| Desired IAM organization/projection | STUDIO `trustiam` | Reconciled to Keycloak and plane-local authorization state |
| Permissions and effective business scope | Each plane PostgreSQL authorization model | Never inferred from Keycloak attributes |

## 6. Final NEON DDL contract

### 6.1 Seal structural domains

The target values are normative:

```sql
master.business_partner_category_d = organization | person | group
master.business_partner_ownership_d = external | internal
master.business_partner_status_d = draft | active | inactive | archived
master.supplier_status_d = onboarding | active | suspended | inactive | archived
master.customer_status_d = prospect | active | suspended | inactive | archived
master.partner_role_d = supplier | customer
document.business_partner_requested_role_d = supplier | customer | workforce
document.business_partner_request_kind_d =
  new_partner | amend_partner | add_supplier | add_customer | add_workforce |
  assign_organization | configure_company | change_bank |
  change_employment | deactivate | reactivate | archive
```

`master.partner_role_d` remains deliberately commercial. Workforce must not leak into supplier/customer qualification, purchasing/sales organization assignment, preference, company-profile, or MESH role checks.

`group` is reserved in the structural domain for forward compatibility but is rejected by Release 1 request validation until a category-specific profile and materializer are published. Operational blocking remains in `control.business_partner_block`; it is not a BP lifecycle status.

Migration mapping for current category values:

| Current value | `partner_category` | `ownership_class` | Additional classification |
|---|---|---|---|
| `organization` | `organization` | `external` | none |
| `government` | `organization` | `external` | business/legal classification `government` |
| `nonprofit` | `organization` | `external` | business/legal classification `nonprofit` |
| `individual` | `person` | `external` | create/link `master.person` |
| `internal` | `organization` | `internal` | preserve intercompany role constraint |

The migration must first inventory unexpected values, fail if any remain unmapped, backfill, validate `NOT VALID` constraints, and only then seal the domains.

### 6.2 Business Partner root

Retain `master.business_partner` and add:

```text
ownership_class       master.business_partner_ownership_d NOT NULL
category_locked_at    timestamptz NOT NULL
category_locked_by    uuid NOT NULL
record_version        bigint NOT NULL DEFAULT 1
```

Rules:

- `partner_category`, `ownership_class`, `canonical_party_id`, `representation_purpose_code`, and creation evidence are immutable after activation.
- `legal_form`, registration country, incorporation date, and website are organization facts and must be null for a person-category BP unless a published exception explicitly applies.
- `name` remains the normalized search label. Organization legal name stays on BP; person legal-name components remain in `master.person`.
- `canonical_party_id` remains nullable. It is required before an organization BP is activated for MESH/TrustIAM projection, not for local-only workforce people.
- Existing live uniqueness on `(tenant_id, canonical_party_id, representation_purpose_code)` remains.

### 6.3 Person and workforce linkage

Add a direct, tenant-safe, one-to-one BP coordinate to `master.person`:

```text
master.person.business_partner_id uuid NOT NULL
UNIQUE (tenant_id, business_partner_id)
FOREIGN KEY (tenant_id, business_partner_id)
  REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT
```

Database guards must enforce:

- the referenced BP category is `person`;
- an active person-category BP has exactly one person row;
- a non-person BP cannot be linked;
- `business_partner_id`, `person.id`, tenant, and creation evidence are immutable;
- one active primary employment and one active primary work assignment may exist per applicable effective date, with non-overlapping `[from, until)` ranges;
- employment legal entity/company and assignment company are compatible;
- employee/principal is optional until the access-provisioning step succeeds.

Retain current tables with these responsibilities:

| Table | Responsibility |
|---|---|
| `master.person` | Natural-person identity and ordinary contact data |
| `master.person_sensitive_profile` | Restricted PII; purpose-specific HR/payroll read path only |
| `master.employee` | Tenant workforce role and optional principal link |
| `master.employment` | Legal employer, contract, employment number, hire/termination facts |
| `master.work_assignment` | Effective organization, position, manager, cost object, site, and FTE |

The existing `employee` flattened company, manager, title, department, hire, and termination columns become read compatibility fields. New writes derive them from employment/work assignment; they are retired after consumer migration.

### 6.4 Commercial roles and scope

Retain:

- `master.supplier` and `master.customer` as one-to-one thin roles;
- `master.business_partner_operating_organization_assignment` for procurement/sales responsibility;
- `master.company_code_supplier_profile` and `master.company_code_customer_profile` for exact-company finance readiness;
- qualifications, blocks, supplier preference, risk assessment, and bank verification as independent aggregates.

Update `master.trg_validate_commercial_role()` to use `ownership_class`, not category. An internal BP requires an intercompany role type, and an intercompany role type requires an internal BP.

### 6.5 Governed request aggregate

Keep `document.business_partner_request` as the single request header and add a request-specific role domain. Do not broaden `master.partner_role_d`.

Add typed workforce scope/result columns:

```text
requested_role                  document.business_partner_requested_role_d
legal_entity_id                 uuid
org_unit_id                     uuid
position_id                     uuid
materialized_person_id          uuid
materialized_employee_id        uuid
materialized_employment_id      uuid
materialized_work_assignment_id uuid
materialized_principal_id       uuid nullable
```

The applied-result constraint becomes role-aware:

| Requested role | Mandatory result | Forbidden result |
|---|---|---|
| Supplier | BP, supplier, procurement organization assignment, snapshot | customer, employee/employment/work assignment |
| Customer | BP, customer, sales organization assignment, snapshot | supplier, employee/employment/work assignment |
| Workforce | BP(category person), person, employee, employment, work assignment, snapshot | supplier, customer, commercial organization assignment |

`configure_company` additionally requires exactly one role-specific company profile. `change_employment` requires a new effective employment/work-assignment snapshot and never rewrites historical rows.

Request scope rules:

- supplier/customer requires `operating_organization_id` compatible with procurement/sales respectively;
- workforce requires legal entity and company; organization unit and position are policy-dependent;
- `company_code_id` must be reachable from the selected organization or legal entity;
- each request changes one role or scope; combined supplier+customer or commercial+workforce application is prohibited;
- `proposed_payload` remains bounded, schema-versioned, and hash-pinned; restricted person attributes live in restricted evidence or encrypted PII handling, not general JSON.

### 6.6 Invitation model

Generalize `document.supplier_registration_invitation` to `document.business_partner_invitation` after the application has moved to the new name. Preserve a compatibility view during rollout.

```text
journey_kind        supplier | customer | workforce
registration_mode   self_service | on_behalf | integration
requested_role      supplier | customer | workforce
operating_organization_id nullable
legal_entity_id     nullable
company_code_id     nullable
invitee_email_hash  char(64)
token_hash          char(64)
expires_at, accepted_at, cancelled_at
applicant_principal_id, business_partner_request_id
row_version, idempotency_key, audit columns
```

The raw invitation token is never stored. Acceptance, restricted principal creation/linkage, and draft-request creation are one recoverable saga with separate idempotency and audit evidence.

### 6.7 Workforce onboarding case

`document.onboarding_case` remains the workforce execution checklist after the BP request is approved; it is not the approval authority. Add `business_partner_request_id NOT NULL UNIQUE` and bind the resulting person/employee coordinates.

```text
BP request approval
  -> atomic BP/person/employee/employment/work-assignment materialization
  -> create workforce onboarding case
  -> execute equipment, policy, training, payroll, and IAM steps
  -> independently activate employment and access when their gates pass
```

`document.people_request` remains for post-hire employee changes. New-hire creation must not use it as a parallel BP materializer.

## 7. Final MESH contract

The current MESH model is structurally correct and remains organization-account based:

- `mesh.network_account` owns network identity and `buyer | supplier | both` capability.
- `mesh.network_relationship` owns the buyer-to-supplier edge and participant lifecycle.
- account profile, identifiers, tax registration, commodity, industry, publication, withdrawal, bank disclosure, inbox, replay, and reconciliation retain their existing authorities.
- active accounts intended for cross-plane reconciliation require `canonical_party_id`; pending walk-up accounts may remain unlinked until duplicate review.
- one canonical party may have multiple accounts only when `account_purpose_code` differs; the existing live unique index enforces this.
- NEON's `control.mesh_business_partner_account_link` is the approved directional local mapping. Neither Keycloak attributes nor `master.external_reference` alone authorize the mapping.
- only organization/sole-proprietor profiles are publishable in Release 1. Person/workforce payloads are denied at service and database boundaries.

MESH relationship status and NEON commercial readiness remain independent. Suspension or termination emits a review/block recommendation; it never silently deletes or deactivates a NEON BP.

## 8. Final Keycloak and TrustIAM contract

### 8.1 Organization mapping

For an organization participating in a portal or network, the intended mapping is:

```text
STUDIO master.canonical_party.id
  = NEON master.business_partner.canonical_party_id
  = MESH mesh.network_account.canonical_party_id
  = STUDIO trustiam.organization.canonical_party_id
```

This is a reconciliation equality, not a distributed foreign key. Each projection stores its own external/provider ID and status evidence.

Cardinality is optional:

- a local NEON BP may have no MESH account and no Keycloak organization;
- an active MESH organization with portal users normally has one TrustIAM organization per realm;
- a workforce person is a member of the employer's Keycloak organization, never a Keycloak organization of their own;
- a BP contact without application access has neither a principal nor a Keycloak user.

### 8.2 Authority boundary

- Keycloak owns credentials, MFA, federation, required actions, sessions, and provider membership.
- STUDIO `trustiam.organization`, provider, application projection, projection scope, and provisioning attempts own desired/observed IAM state.
- plane-local PostgreSQL owns principals, identity bindings, tenant memberships, roles, permissions, scope targets, denials, and delegations.
- Keycloak organization attributes may carry opaque reconciliation hints only. `business_partner_id`, network role, organization/company scope, and permission lists must not be accepted as authorization claims.
- workforce access provisioning occurs after person/employment materialization and can fail/retry without rolling back the HR master. Employment activation and application-access activation have independent readiness gates.

## 9. Final STUDIO setup

STUDIO authors and publishes definitions; it stores no BP request or master instance.

Extend `snapshot.business_partner_definition_revision.bundle_json` with complete versioned definitions for:

1. `supplier.new`, `supplier.add_role`, `supplier.qualify`, `supplier.company_setup`, and supplier bank change;
2. `customer.new`, `customer.add_role`, `customer.credit_review`, and `customer.company_setup`;
3. `workforce.new`, `workforce.add_role`, `workforce.change_employment`, and workforce offboarding;
4. organization/person category schemas and category-specific field visibility;
5. internal, portal, MESH, import, and API source mappings;
6. duplicate rules by category and jurisdiction;
7. workflow stages, SoD requirements, SLA/escalation, and activation gates;
8. NEON form/list/detail/review descriptors and MESH-safe publication schemas;
9. compatibility rules and source contract hashes for NEON and MESH consumers.

Publication remains immutable and signed. NEON and MESH read only their verified active local projection and do not call STUDIO synchronously during a transaction. An incompatible bundle stages but cannot activate.

STUDIO's generic `onboarding.onboarding_case` is reserved for provisioning a tenant/organization across application planes. It must not be confused with NEON's workforce `document.onboarding_case` or the BP request lifecycle.

## 10. End-to-end journeys

### 10.1 Supplier onboarding

```text
Internal maker / external invite / MESH projection / governed import
  -> create supplier BP request
  -> validate identity, identifiers, tax, duplicates, evidence, and scope
  -> independent data/compliance/procurement approval
  -> materialize BP + supplier + procurement-org assignment atomically
  -> qualify by commodity/region/organization
  -> configure company AP profile
  -> independently verify and apply remittance bank
  -> derive purchasing/payment readiness
  -> optionally link MESH account and provision supplier-portal IAM organization/users
```

No qualification or bank decision is implied by registration approval.

### 10.2 Customer onboarding

```text
Internal maker / customer portal / MESH buyer projection / governed import
  -> create customer BP request
  -> validate identity, identifiers, tax, duplicates, consent, and sales scope
  -> independent data/compliance/sales approval
  -> materialize BP + customer + sales-org assignment atomically
  -> credit review / commercial qualification
  -> configure company AR profile, payment terms, statement cycle, and credit limit
  -> derive order/invoice/credit readiness
  -> optionally link MESH buyer account and provision customer-portal IAM organization/users
```

A sole proprietor or consumer may be a person-category customer. That path creates the BP and person profile plus customer role, but not an employee/workforce role.

### 10.3 Workforce-person onboarding

```text
Recruiter / HR import / approved API / invited candidate
  -> create workforce BP request with person category
  -> validate identity, duplicates, consent, right-to-work/background evidence,
     legal employer, company, position, manager, dates, and FTE
  -> independent HR + hiring manager + compliance approval as policy requires
  -> atomically materialize BP + person + employee + employment + work assignment
  -> create workforce onboarding checklist/case
  -> provision payroll/benefits/resources through governed steps
  -> create/reconcile principal and Keycloak user only when application access is required
  -> add membership to employer IAM organization and plane-local scoped roles
  -> activate employment and access independently after their gates pass
```

Workforce-person data is NEON-local. It is never published as a MESH Business Partner profile.

## 11. Lifecycle model

Request state remains:

```text
draft -> validating -> validation_failed -> draft
draft -> pending_approval -> returned -> draft
pending_approval -> rejected
pending_approval -> approved -> applying -> applied
approved/applying -> failed -> applying
draft/returned -> cancelled
eligible prior states -> superseded
```

All transitions require expected `row_version`. Submission pins request revision, evidence manifest, validation evaluation, duplicate resolution, definition/ruleset versions, scope, source coordinates, and payload hash. Decision and application fingerprints are immutable.

Role lifecycles are independent:

- supplier: `onboarding -> active | suspended -> inactive -> archived`;
- customer: `prospect -> active | suspended -> inactive -> archived`;
- employee: `pending -> active | suspended -> terminated` through employment facts;
- MESH account: `pending -> active | suspended -> retired`;
- Keycloak/TrustIAM organization: `draft -> provisioning -> active | suspended -> deprovisioned`.

## 12. API and event wiring

One command surface is reused by all sources:

| Capability | API family | Authoritative service |
|---|---|---|
| BP request CRUD/validate/submit/decide/apply | `/api/neon/business-partner-requests` | NEON master-data/BP request service |
| BP aggregate/readiness | `/api/neon/business-partners` | NEON master-data read model |
| Invitations/respond | `/api/neon/business-partner-invitations` | NEON invitation service |
| Qualification/preference/block/bank | Existing bounded NEON endpoints | Dedicated control/banking services |
| MESH account/relationship/profile publication | Existing `/api/mesh/...` endpoints | MESH plane services |
| MESH match/selective acceptance | Existing `/api/neon/business-partner-profile-*` | NEON adapter over verified local projection |
| Workforce onboarding/checklist | `/api/neon/workforce-onboarding` | NEON people service, after BP apply |
| IAM desired state/reconciliation | STUDIO onboarding/trustiam endpoints | STUDIO TrustIAM service |
| Definition author/publish/activate | Existing STUDIO BP definition endpoints | STUDIO publication service |

Required event families:

```text
business_partner.request.{created,validated,submitted,returned,approved,rejected,applied,failed}
business_partner.role.{supplier_added,customer_added,workforce_added}
business_partner.scope.{organization_assigned,company_configured,employment_changed}
business_partner.profile_publication.{published,withdrawn}
business_partner.account_link.{requested,approved,rejected,revoked}
workforce.onboarding.{created,step_completed,activated,failed}
iam.organization_projection.{requested,applied,failed,reconciled}
iam.identity_projection.{requested,invited,active,suspended,deprovisioned}
```

Events carry IDs, versions, hashes, status, and safe reason codes only. Consumers dereference authorized local state; events never carry restricted person or bank payloads.

## 13. Authorization model

Retain the existing seven BP request permissions and enforce role/scope policy inside the service. Add journey-specific permissions only where authority differs materially:

| Permission family | Scope | Strong controls |
|---|---|---|
| `neon.relationship.business_partner_request.*` | Operating organization for supplier/customer; legal entity for workforce | Decide/apply SoD; decide MFA |
| `neon.business_partner_invitation.*` | Operating organization or legal entity | Create/cancel high risk; token-safe response |
| `neon.supplier.qualification.*` / preference / bank | Existing org/company/relationship scope | Existing MFA/SoD |
| `neon.customer.credit.*` | Sales organization + company | Independent credit decision, MFA/SoD |
| `neon.workforce.onboarding.*` | Legal entity / HR organization | Restricted PII, maker-checker, purpose binding |
| `studio.business_partner_definition.*` | Tenant exact | Publish critical, MFA/SoD |
| MESH profile/account/bank families | Network account/relationship | Participant-only, publish/withdraw/approve MFA |
| TrustIAM provisioning/replay | Authority tenant / exact projection | Critical replay and deprovision controls |

RLS remains mandatory and forced on every tenant/participant table. Service authorization is still required; RLS is the terminal isolation guard, not the complete policy engine.

## 14. Build plan

### Wave 0 — contract closure and inventory

- Freeze the vocabulary and decisions in this document.
- Inventory actual domain values and person/BP duplicate candidates in all environments.
- Record current API, events, permissions, descriptors, jobs, dashboards, migrations, and feature flags.
- Publish Architecture Decision Records for category/ownership split, person-to-BP linkage, and IAM/network projection boundaries.

**Exit:** no unmapped category/domain value; named owners approve the migration rules.

### Wave 1 — DDL hardening

- Seal BP, supplier, customer, and workforce lifecycle domains.
- Add ownership class and immutable category evidence.
- Add BP-to-person one-to-one linkage and category guards.
- Add effective-range uniqueness/overlap guards for primary employment/work assignment.
- Backfill in shadow columns, validate, switch reads, then make required columns non-null.

**Exit:** clean three-plane DDL build, migration replay, rollback rehearsal, tenant/RLS tests, and zero duplicate identity coordinates.

### Wave 2 — request and invitation generalization

- Add request-specific `supplier | customer | workforce` role domain and workforce scope/result FKs.
- Replace the fixed supplier/customer application constraint with the role-aware invariant.
- Generalize invitation table, service, permissions, and compatibility view.
- Pin new STUDIO schema hashes in request creation and validation.

**Exit:** database proves each applied request has one valid complete result and no incompatible coordinates.

### Wave 3 — supplier/customer experience completion

- Retain the current supplier E2E path and regression suite.
- Add first-class new-customer create/edit/review/aggregate routes and customer portal invitation.
- Complete credit/commercial qualification and customer readiness reasons.
- Make list/search/detail category- and role-aware without role-specific identity duplication.

**Exit:** supplier and customer journeys pass equivalent internal, portal, import/API, approval, materialization, company setup, and negative authorization tests.

### Wave 4 — workforce-person vertical slice

- Implement workforce request contracts, repository, validation, workflow, and atomic materializer.
- Create the workforce onboarding case from applied immutable coordinates.
- Wire employee/employment/work assignment aggregate views and effective-dated changes.
- Protect sensitive fields with purpose-specific services, field security, redaction, and audit.

**Exit:** new hire and existing-person add-workforce paths are idempotent, rollback-safe, accessible, and cannot leak PII to MESH/general BP views.

### Wave 5 — IAM organization and identity saga

- Drive organization and identity desired state through STUDIO TrustIAM.
- Remove network-account business authority from Keycloak organization attributes.
- Reconcile provider subject to `master.principal_identity_binding` and employer organization membership.
- Implement retry, fencing, dead-letter, manual replay, suspension, and deprovision reconciliation.

**Exit:** Keycloak reset/rebuild recreates provider state from durable desired state without changing BP, employment, or permissions.

### Wave 6 — MESH and STUDIO completeness

- Keep the current MESH publication/link/bank path and add customer/buyer mapping rules.
- Ensure all person/workforce fields are denied from MESH artifacts at schema, service, DB, event, and telemetry layers.
- Publish signed STUDIO definition bundles for all three journeys and test incompatible activation/rollback.
- Add drift reconciliation across canonical party, BP, account, and TrustIAM organization coordinates.

**Exit:** offline NEON/MESH runtime, exact signed definitions, zero unsafe fields, and zero unexplained projection drift.

### Wave 7 — production qualification

- Run load, concurrency, retry-storm, security, privacy, accessibility, backup/restore, DR, and rollback gates.
- Stage delivery and reconciliation flags before production activation.
- Complete live supplier, customer, and workforce canaries with immutable evidence.
- Obtain Product, Procurement, Sales, HR, Privacy, Security, IAM, MESH, NEON, STUDIO, and Database/DR sign-off.

**Exit:** release certificate changes from candidate to approved.

## 15. Complete wiring matrix

“100% wired” means every required cell has implementation and evidence; it does not mean every BP must have every projection.

| Layer | Supplier | Customer | Workforce person |
|---|---:|---:|---:|
| Sealed DDL/domain constraints | Required | Required | Required |
| Tenant-safe FK/RLS/grants | Required | Required | Required |
| STUDIO schema/form/view/workflow bundle | Required | Required | Required |
| Internal create/edit/view | Required | Required | Required |
| External/on-behalf invitation | Required | Required by product policy | Required |
| Import/API adapter through request | Required | Required | Required |
| Duplicate detection and merge review | Required | Required | Required |
| Ruleset-pinned validation | Required | Required | Required |
| Workflow, MFA, SoD, row version | Required | Required | Required |
| Atomic idempotent materialization | Required | Required | Required |
| Scope/company/employment configuration | Required | Required | Required |
| Readiness with stable reasons | Required | Required | Required |
| MESH account/profile/link | Optional | Optional | Prohibited |
| TrustIAM/Keycloak organization | Optional portal org | Optional portal org | Employer org membership only |
| Keycloak user/principal | Optional contacts | Optional contacts | Optional/usually required employee |
| Audit/outbox/jobs/reconciliation | Required | Required | Required |
| Metrics/alerts/runbook/DR | Required | Required | Required |
| Unit/contract/DB/E2E/accessibility/load evidence | Required | Required | Required |

## 16. Verification and release gates

### Database

- clean bootstrap and forward migration on STUDIO, NEON, and MESH;
- migration checksum/ledger match and idempotent reference-seed replay;
- no unknown category/lifecycle values before domain sealing;
- same-tenant composite FKs, forced RLS, least-privilege grants, no application delete on governed evidence;
- category/person and role/result mismatch denial;
- primary employment/work-assignment overlap denial;
- immutable evidence, source, category, canonical, decision, and application coordinates.

### Service and workflow

- exact idempotency replay versus changed-command conflict;
- optimistic concurrency, no-self-approval, decision-time authorization, and step-up MFA;
- atomic materialization rollback leaves no partial role/person/employment state;
- duplicate candidate never auto-merges without policy-authorized exact proof;
- stale STUDIO definition, source projection, evidence, qualification, or account link fails closed.

### Cross-plane/IAM

- no cross-database FK or synchronous STUDIO dependency;
- monotonic delivery, dedupe, quarantine, replay, dead letter, and drift reconciliation;
- person/workforce data rejected from MESH profile, event, log, metric, and browser payloads;
- Keycloak membership alone yields no application permission;
- provider rebuild and deprovision preserve BP/employment history.

### UX and operations

- save/resume/validate/submit/return/resubmit/approve/reject/apply/retry for all three journeys;
- role/category-specific forms and readable readiness/recovery reasons;
- keyboard, focus, screen reader, responsive, localization, and WCAG 2.2 AA gates;
- representative tenant-size latency, burst/back-pressure, backup/restore comparison, flag rollback, and support runbook rehearsal.

## 17. Definition of done

The Business Partner foundation is complete only when all of the following are demonstrated:

1. One real-world party has one NEON BP identity per representation purpose and can independently acquire supplier, customer, and—if category person—workforce roles.
2. A supplier, customer, or workforce request creates its complete mandatory aggregate exactly once; failure creates no partial master.
3. Supplier/customer organization/company scope and workforce legal-employer/work-assignment scope are validated and authorized at write time.
4. Registration, qualification/credit/workforce checks, preference, banking, employment, and access activation remain separate decisions.
5. An organization BP can be reconciled to a MESH account and TrustIAM/Keycloak organization through the canonical-party coordinate without making either projection authoritative for NEON.
6. A workforce person can receive a principal and employer organization membership without becoming a MESH account or Keycloak organization.
7. STUDIO definitions are signed, versioned, locally activated, reversible, and never contain partner instances.
8. All UI routes call bounded BFF/API operations; no generic CRUD or integration adapter writes a protected master directly.
9. Authorization, RLS, privacy, audit, idempotency, concurrency, telemetry, reconciliation, accessibility, performance, DR, and rollback evidence pass for all three journeys.
10. The production release certificate contains live canary evidence and named cross-functional approval.

## 18. Repository implementation map

| Concern | Current implementation location |
|---|---|
| NEON BP/commercial/person/workforce DDL | `server/db/ddl/planes/neon/master/*` |
| Request/invitation/evidence/workforce case DDL | `server/db/ddl/planes/neon/document/*` |
| Qualification/preference/block/MESH projection links | `server/db/ddl/planes/neon/control/*` |
| MESH accounts/relationships/publications/bank | `server/db/ddl/planes/mesh/mesh/*` |
| STUDIO canonical party and TrustIAM | `server/db/ddl/planes/studio/master/*`, `trustiam/*` |
| STUDIO BP definitions and signed release | `server/db/ddl/planes/studio/snapshot/*`, `publication/*` |
| NEON BP services/contracts | `server/packages/services/master-data`, `server/packages/planes/neon` |
| NEON BP experience | `packages/planes/neon/business-partner`, `apps/neon/app/(shell)/app/business_partner` |
| MESH services | `server/packages/planes/mesh` |
| STUDIO publication/onboarding services | `server/packages/services/publication`, `server/packages/planes/studio` |
| IAM configuration/reconciliation | `stack/config/iam`, `tools/scripts`, STUDIO `trustiam` services |
| Existing production build evidence | `docs/architecture/neon-mesh-studio-business-partner-production-build-plan.md` |

This document closes the Step 1 architecture. Implementation starts with Wave 0 inventory and Wave 1 additive DDL hardening; the existing supplier/customer release-candidate work remains the regression baseline, not a migration target to discard.
