# Athyper Business Partner 360 view build design

**Status:** Proposed Phase 1 build design  
**Prepared:** 2026-08-30  
**Parent architecture:** [Athyper Business Partner architecture design](./athyper-business-partner-architecture-design.md)  
**Delivery backlog:** [Business Partner pending build plan](./athyper-business-partner-pending-build-plan.md)  
**Build sequence:** [Business Partner 360 view build sequence plan](./athyper-business-partner-360-view-build-sequence-plan.md)  
**Phase 1 contract lock:** [Business Partner 360 contract lock](./athyper-business-partner-360-contract-lock.md)  
**Inspiration:** SAP Supplier 360 information architecture supplied with this design request; Athyper terminology, authority boundaries, and interaction patterns remain authoritative.

## 1. Executive decision

Phase 1 will deliver one role-aware Business Partner 360 experience in NEON for organization and person parties. It will compose the full authorized view of identity, roles, organization and company scope, addresses, contacts, identifiers, tax registrations, banking, qualifications, certificates, governed requests, lifecycle activity, workforce data, and MESH network relationships.

Risk is explicitly deferred to Phase 2. Phase 1 must not display a risk score, risk band, risk incident count, risk trend, or a misleading empty Risk tab. Existing risk values currently surfaced in the aggregate readiness panel must be removed from the Phase 1 page contract. A later risk section will plug into the same section-provider contract without changing Business Partner identity or role APIs.

The 360 experience is a read composition, not a new master-data authority:

```text
                                       STUDIO
                           signed view/field/completeness
                                    definitions
                                        |
                                        v
Browser --> NEON BP 360 BFF --> NEON section readers --> NEON authoritative tables
                 |                      |
                 |                      +--> governed request commands for every edit
                 |
                 +--> NEON MESH projections/link --> MESH adapter when live detail is allowed

No browser-to-MESH call
No NEON-to-MESH database join
No bp_360 JSON source-of-truth table
No direct UI update of BP master tables
```

## 2. Product outcome

A user opening `/mdg/business-partner/{businessPartnerId}` must be able to answer, within their authorized scope:

1. Who is this party and which identifiers prove the identity?
2. Is the party a supplier, customer, person/workforce member, or a valid combination?
3. In which operating organizations and company codes is each role configured?
4. Which addresses and contacts are current, primary, verified, restricted, or expired?
5. Which banking, qualification, certificate, and commercial controls exist?
6. Which onboarding or change requests created the current state?
7. What changed, when, by whom, through which source, and under which request?
8. Is this party connected through MESH, and what was received, accepted, or published?
9. Which required data is missing for the selected party category, role, organization, and company scope?

“Complete 360” means complete coverage of the authoritative data domains applicable to the selected party and role. It does not mean that every field must contain a value, nor that all external systems must be synchronously available.

## 3. Current implementation baseline

The repository already has a useful first aggregate, but it is not yet a 360 view.

### 3.1 What exists

- The NEON record route and `BusinessPartnerAggregateDetail` already exist.
- The aggregate contract returns the BP root, supplier/customer roles, company profiles, operating-organization assignments, and onboarding requests.
- Supplier eligibility and customer credit/lifecycle services exist.
- Canonical tables already exist for contacts, addresses, identifiers, tax, banks, certifications, qualifications, workforce, relationships, external references, requests, evidence, and audit.
- MESH has network accounts, relationships, profiles, immutable publications, selective acceptance, and a NEON account-link projection.
- STUDIO publishes the `neonPartnerAggregate` view descriptor and party-category field policies.

### 3.2 Gaps to close

| Gap | Current effect | Phase 1 response |
|---|---|---|
| Aggregate is limited to seven row families | Contacts, addresses, IDs, tax, banks, certificates, activity, workforce, and MESH are invisible | Replace it with summary plus section readers |
| One large component owns the page | Difficult to extend, test, authorize, or lazy-load | Split into a 360 shell and bounded section components |
| Supplier readiness is always loaded | Customer/person views are supplier-shaped | Resolve party capabilities first and load only applicable sections |
| Risk band is included in readiness | Violates the requested Phase 1 boundary | Remove it from the 360 Phase 1 response and UI |
| Onboarding applies only a subset of submitted identity data | A request may collect fields that never reach typed master rows | Complete typed materialization for address/contact/identifier/tax children |
| General request JSON is the visible identity source | Restricted identifiers could be mishandled | Use typed restricted request children/evidence and redacted readers |
| MESH publication currently contains profile/classification data only | Network section cannot claim full MESH identity parity | Show exactly the received/published field set and provenance; never infer missing data |
| No unified activity read model | Users cannot explain current state | Compose audit, request, lifecycle, verification, and publication events |

### 3.3 Plane delivery status for this design

This is repository evidence as of the prepared date, not a production-environment certification and not a percentage inferred from file count.

| Plane/capability | Status | Evidence and remaining work |
|---|---|---|
| NEON canonical BP and roles | Foundation available | BP, supplier, customer, person, workforce, scope, company, identifier, tax, classification, bank, certification, qualification, credit, and lifecycle tables exist |
| NEON governed request kernel | Foundation available | Request lifecycle, validation, workflow, materialization results, evidence, audit, outbox, and idempotency exist; typed repeating identity-extension materialization remains to be closed |
| NEON current record UI | Partial | Current aggregate renders identity, readiness, roles, organizations, and onboarding only; it is supplier-shaped and loads risk-bearing eligibility |
| NEON 360 read API | Not built | Summary manifest, section readers, field redaction, completeness, activity composition, and pagination are the primary Phase 1 build |
| MESH account/relationship model | Foundation available | Network account, profile, relationship, identifier, tax, classification, bank, publication, and lifecycle tables exist |
| MESH-to-NEON governance | Foundation available | Immutable publication, received snapshot, match/diff, selective acceptance, account link, bank disclosure, delivery, and reconciliation foundations exist |
| MESH 360 composition | Not built | NEON has no role-aware Network section or independently degradable live adapter; current safe profile publication includes profile/classification fields only |
| STUDIO definition publication | Foundation available | Signed/versioned definition bundle, field policy, request schemas, workflows, mappings, and safe MESH schema exist |
| STUDIO 360 definition | Partial | `neonPartnerAggregate` lists initial panels; the Phase 1 section manifest, field presentation rules, completeness packs, and risk exclusion need a new definition version |
| Risk capability | Existing foundation, deferred | Risk configuration/assessment data and current eligibility coupling exist, but no risk contract or UI is included in Phase 1 |

The dominant effort is therefore not creating foundational BP tables. It is closing typed request materialization and delivering the secure composed experience across existing authorities.

## 4. Phase boundaries

### 4.1 Phase 1 — complete data view

Phase 1 includes:

- party identity and lifecycle;
- supplier, customer, and workforce role summaries;
- operating-organization, legal-entity, org-unit, and company-code scope;
- postal addresses and validation state;
- named business contacts, contact roles, and communication channels;
- registration identifiers, external-system references, and masked tax registrations;
- commodity and industry classifications;
- supplier AP and customer AR/company configuration;
- masked bank accounts and verification status;
- qualifications, preference designation, blocks, and certifications;
- customer credit/commercial review without external risk enrichment;
- requests, approvals, evidence manifests, and materialization provenance;
- audit and lifecycle activity;
- role-specific business activity summaries where authoritative transaction readers exist;
- MESH account link, relationship, accepted publication, and freshness details;
- person/workforce data with strong field-level privacy controls;
- definition-driven completeness and missing-data guidance;
- governed “propose change” actions.

### 4.2 Phase 2 — risk plug-in

Phase 2 may add:

- risk exposure and trend;
- risk incidents and alerts;
- enriched corporate information;
- engagement requests, controls, and issues;
- external-source freshness, confidence, and adverse-media evidence;
- export of a separately authorized risk profile.

Risk will remain capability-owned. The core summary may later show a risk teaser only when the risk provider is enabled and the caller has explicit permission. Risk data must never become a field on `master.business_partner` or a required component of the Phase 1 completeness score.

### 4.3 Explicit non-goals

- Copying the SAP navigation or styling exactly.
- Building a questionnaire authoring engine in the 360 page.
- Treating MESH as a complete copy of NEON.
- Sending person/workforce data to MESH.
- Revealing raw bank account, tax, national identifier, birth-date, or compensation values in the normal page payload.
- Mutating canonical rows directly from inline form controls.
- Computing risk from incomplete proxy fields.
- Loading all history and all transaction rows into the first response.

## 5. Information architecture

The SAP example uses a persistent supplier context card and left navigation. Athyper already has application-shell and module navigation, so duplicating another permanent sidebar would reduce usable width. The Athyper design uses a sticky identity header, a scoped context bar, and a responsive section rail.

### 5.1 Page frame

```text
+--------------------------------------------------------------------------------+
| Breadcrumbs                                      Actions: Propose change  More |
+--------------------------------------------------------------------------------+
| Avatar | Display/legal name | BP code | Role chips | lifecycle | bookmark       |
| Primary IDs | primary address | primary contact | source/freshness              |
+--------------------------------------------------------------------------------+
| Operating organization | Company | As-of date | Role lens                       |
+--------------------------------------------------------------------------------+
| Overview | Identity | Contacts | Addresses | IDs & Tax | Role data | ...         |
+--------------------------------------------------------------------------------+
|                                                                                |
|                              Active section                                    |
|                                                                                |
+--------------------------------------------------------------------------------+
```

The identity header remains visible while changing sections. Organization/company scope is a mandatory query coordinate for scoped sections and is never inferred from the first returned row.

### 5.2 Common sections

| Section | Purpose |
|---|---|
| Overview | High-value identity, role, scope, completeness, request, and activity cards |
| Identity | Canonical name, aliases, category, ownership, legal facts, parent, classification, source references |
| Contacts | Named contacts, roles, title/department, email/phone channels, primary and verification state |
| Addresses | Registered, remit-to, ship-from/to, billing, office, home or work usage as policy permits |
| Identifiers & tax | Registration schemes, issuing authority/country, verification, external ERP IDs, masked tax registrations |
| Roles & scope | Supplier/customer/workforce roles and effective organization/company/legal-entity assignments |
| Requests | Onboarding, role addition, amendment, scope, company, bank, employment, and lifecycle requests |
| Activity | Unified governance/lifecycle timeline plus role-specific business-activity summaries |
| Network | MESH account link, relationships, accepted source snapshot, publications, recipient and freshness |

### 5.3 Supplier lens

Additional supplier sections are:

- **Procurement & AP:** supplier code/type/status, procurement organization assignments, company profile, currency, payment terms, accounting profile, default dimensions, commodity capabilities, preference, and blocks.
- **Banking:** masked accounts, holder, bank/country, currency, purpose, company scope, primary flag, verification, effective dates, and pending change request.
- **Qualifications & certificates:** qualification decisions, scope, expiry/review, evidence links, certificate type/number/issuer/location/effective dates and attachment.
- **Business activity:** purchase-order, receipt/service-entry, invoice, payment, contract, and sourcing-event summary when the owning modules expose supported readers.

### 5.4 Customer lens

Additional customer sections are:

- **Sales & AR:** customer code/type/key-account flag/status, sales organization assignment, company profile, currency, payment terms, statement cycle, accounting and dimensions.
- **Credit:** current company-scoped credit/commercial review, approved/conditional state, limit and currency, conditions, effective dates, reviewer evidence, and lifecycle state. Phase 1 must label this “Credit review,” not “Risk.”
- **Business activity:** quotations, sales orders, fulfilment, invoices, receipts, contracts, and project/engagement summary when supported readers exist.

### 5.5 Person and workforce lens

A person is not presented as a supplier-shaped record. Applicable sections are:

- **Personal:** preferred and legal names, locale, ordinary contact data, consent state; restricted identifiers are masked.
- **Employment:** employee or external-worker role, employer, dates, contract/status, and current effective record.
- **Assignments:** operating organization, company, org unit, position, manager, site, cost object, FTE, and effective range.
- **Onboarding/offboarding:** case status, checklist progress, evidence references, overdue tasks, and access-provisioning status.
- **Engagements:** external-worker SOW/work-order engagement and operational placement where applicable.

The Network, supplier bank, qualification, and future risk sections are absent unless the same person legitimately holds an approved commercial role and policy explicitly enables the corresponding section. `person_sensitive_profile` is never prefetched.

### 5.6 Overview layout

The overview is optimized for recognition and action, not for duplicating every field:

1. **About:** category, ownership, lifecycle, role states, created/updated timestamps.
2. **IDs:** BP code, supplier/customer/employee codes, primary registration ID, external ERP/MESH references.
3. **Primary contact and address:** value, purpose, verification, effective date.
4. **Scope readiness:** configuration state by selected role and scope, without Phase 2 risk.
5. **Data completeness:** percentage, missing required fields, restricted-field count, definition version.
6. **Open work:** active requests, returned items, expiring certificates/qualifications, pending bank verification.
7. **Recent activity:** last five authorized timeline events.
8. **Network:** linked/not linked, relationship count, last accepted snapshot, last publication.

## 6. “100% data” and table coverage

There is no meaningful fixed table count for a full BP because contacts, addresses, identifiers, scopes, bank links, certificates, requests, and activity are repeating children. Completion must be evaluated by required domain coverage, not by counting populated tables.

For planning, the minimum canonical row sets are:

| Scenario | Minimum identity/role rows | Operationally complete row families |
|---|---:|---|
| Supplier organization | 3: BP, supplier, operating-organization assignment | Add address/link, contact/person/channel, identifier, tax, company supplier profile, bank/link/verification, qualification, certificate/evidence, classifications, requests and activity as applicable |
| Customer organization | 3: BP, customer, operating-organization assignment | Add address/link, contact/person/channel, identifier, tax, company customer profile, credit review, classifications, requests and activity as applicable |
| Person identity | 2: BP, person | Add contacts/addresses/identifiers under privacy policy |
| Internal workforce person | 6: BP, person, employee, employment, work assignment, onboarding case | Add sensitive profile, onboarding tasks, external references, requests and activity only as applicable |
| External worker | BP + person + external worker + engagement | Add operational placement, contacts, evidence, requests and activity |
| MESH-linked organization | NEON BP + approved MESH account link | Add received snapshot, match/acceptance evidence, relationship/publication projection as available |

### 6.1 Authoritative table-to-section map

| 360 domain | Primary source tables | Notes |
|---|---|---|
| Identity | `master.business_partner`, `master.organization_amendment` | BP root is authoritative; amendment is history evidence |
| Person | `master.person`, `master.person_sensitive_profile` | Sensitive profile is separate, purpose-bound, and never part of bootstrap |
| Commercial roles | `master.supplier`, `master.customer` | Thin one-to-one role rows |
| Workforce roles | `master.employee`, `master.employment`, `master.work_assignment`, `master.external_worker` | Effective-dated current and history views |
| External engagements | `document.worker_engagement`, `document.worker_operational_placement` | No employee implication |
| Addresses | `master.address_link`, `master.address`, `master.address_event` | Resolve the registered owner type; use effective/current purpose |
| Contacts | `master.contact_person`, `master.contact_person_role`, `master.contact_link`, `master.contact_email`, `master.contact_phone` | Named contact and channel are separate concerns |
| Identifiers | `master.business_partner_identifier`, `master.external_reference` | External references show integration coordinates, not copied payloads |
| Tax | `master.business_partner_tax_registration` | Mask by default; restricted reveal is separate |
| Classification | `master.business_partner_commodity_capability`, `master.business_partner_industry_classification` | Resolve reference names from shared catalogs |
| Organization scope | `master.business_partner_operating_organization_assignment` | Role and effective dates are required coordinates |
| Supplier company | `master.company_code_supplier_profile` | AP configuration |
| Customer company | `master.company_code_customer_profile` | AR configuration |
| Banking | `master.bank_account_link`, masked `master.bank_account`, `document.business_partner_bank_verification` | Raw `account_id_value` is never selected by the normal reader |
| Qualification | `control.business_partner_qualification`, `control.supplier_preference_designation`, `control.business_partner_block` | Risk assessment join excluded in Phase 1 |
| Credit | `control.customer_credit_review`, `control.customer_lifecycle_event` | Internal credit/commercial decision only |
| Certificates | `master.certification_type`, `master.certification`, `document.attachment`/content authorization | Attachment access remains capability-owned |
| Requests | `document.business_partner_request`, request evidence and validation, workflow records | Current and historical request states |
| Activity | `audit.audit_log`, request/lifecycle/activation/address events | Redact old/new values before presentation |
| MESH link | `control.mesh_business_partner_account_link`, received profile projection/snapshot, match/acceptance events | NEON local projection is the first source |
| MESH live detail | `mesh.network_account`, `mesh.network_relationship`, profile/publication tables | Access only through MESH service adapter; no cross-plane SQL |

### 6.2 No duplicate 360 persistence

Do not create a table containing a large denormalized BP JSON document. It would introduce stale authority, restricted-data duplication, and ambiguous update ownership.

Permitted optimizations are:

- ordinary SQL views for stable joins;
- a non-authoritative summary projection containing IDs, counts, timestamps, and fingerprints only;
- HTTP caching keyed by tenant, caller scope, BP record version, STUDIO definition hash, and redaction policy;
- short-lived MESH section cache carrying its source timestamp and projection version.

## 7. Scope and applicability model

Every request to the 360 API has these effective coordinates:

```ts
interface BusinessPartner360Scope {
  tenantId: string;                    // from verified context only
  businessPartnerId: string;           // route
  operatingOrganizationId?: string;    // selected or absent for global identity
  companyCodeId?: string;              // must belong to selected organization
  legalEntityId?: string;              // workforce lens
  roleLens?: "all" | "supplier" | "customer" | "workforce";
  asOf: string;                        // ISO date; default tenant business date
}
```

Rules:

1. Global identity data may load without a company, but all scoped commercial and workforce data requires an authorized scope.
2. A selected company must resolve under the selected operating organization and tenant.
3. Effective-dated data uses `[effective_from, effective_until)` at `asOf`.
4. Historical mode is read-only and visibly labeled.
5. `all` shows role summary cards but does not merge supplier and customer company configuration.
6. A missing scope produces a scope-selection state, not an empty “no data” result.

## 8. API design

### 8.1 Route set

The first response is intentionally small. Sections are independently authorized and lazy-loaded.

```text
GET /api/neon/business-partners/:id/360/summary
GET /api/neon/business-partners/:id/360/identity
GET /api/neon/business-partners/:id/360/contacts
GET /api/neon/business-partners/:id/360/addresses
GET /api/neon/business-partners/:id/360/identifiers
GET /api/neon/business-partners/:id/360/roles
GET /api/neon/business-partners/:id/360/company-configuration
GET /api/neon/business-partners/:id/360/banking
GET /api/neon/business-partners/:id/360/qualifications
GET /api/neon/business-partners/:id/360/certificates
GET /api/neon/business-partners/:id/360/credit
GET /api/neon/business-partners/:id/360/workforce
GET /api/neon/business-partners/:id/360/requests
GET /api/neon/business-partners/:id/360/activity
GET /api/neon/business-partners/:id/360/business-activity
GET /api/neon/business-partners/:id/360/network
```

All routes accept the applicable `operatingOrganizationId`, `companyCodeId`, `legalEntityId`, `roleLens`, `asOf`, `cursor`, and `limit` query values. List sections use opaque cursor pagination; maximum page size is 100 and the UI default is 25.

The existing aggregate endpoint stays as a compatibility adapter during rollout and is retired after all record-detail consumers move to the 360 contract.

### 8.2 Summary contract

```ts
interface BusinessPartner360Summary {
  schemaVersion: 1;
  asOf: string;
  generatedAt: string;
  businessPartnerVersion: number;
  definition: {
    code: "business_partner.onboarding";
    version: string;
    hash: string;
  };
  scope: BusinessPartner360PublicScope;
  identity: BusinessPartnerIdentitySummary;
  roles: readonly BusinessPartnerRoleSummary[];
  primaryAddress?: AddressSummary;
  primaryContact?: ContactSummary;
  identifiers: readonly MaskedIdentifierSummary[];
  completeness: CompletenessSummary;
  openWork: OpenWorkSummary;
  recentActivity: readonly ActivitySummary[];
  sections: readonly SectionManifest[];
  provenance: readonly SourceFreshness[];
}

interface SectionManifest {
  code: string;
  applicable: boolean;
  authorization: "granted" | "restricted";
  state: "ready" | "empty" | "partial" | "stale" | "unavailable";
  count?: number;
  href?: string;
  reasonCode?: string;
  lastChangedAt?: string;
}
```

The client renders navigation only from the returned manifest. A hidden section is not distinguishable from a nonexistent capability. A restricted but discoverable section uses `authorization: restricted` only when policy intentionally allows the user to know that the domain exists.

### 8.3 Section envelope

```ts
interface BusinessPartner360Section<T> {
  schemaVersion: 1;
  sectionCode: string;
  asOf: string;
  generatedAt: string;
  businessPartnerVersion: number;
  definitionHash: string;
  state: "ready" | "empty" | "partial" | "stale" | "unavailable";
  data: T;
  page?: { nextCursor?: string; limit: number };
  provenance: readonly SourceFreshness[];
  redactions: readonly RedactionNotice[];
}
```

Every value returned from a non-NEON source carries plane, source object, observed time, schema version, and freshness. The UI must never visually merge a MESH-reported value into the canonical NEON identity without a source label.

### 8.4 Error behavior

| Condition | Response |
|---|---|
| BP not visible in tenant/scope | `404 BP_360_NOT_FOUND` to avoid enumeration |
| Invalid organization/company relationship | `400 BP_360_SCOPE_INVALID` |
| Section not applicable | `404 BP_360_SECTION_NOT_APPLICABLE` for direct calls |
| Section authorization denied | `403 BP_360_SECTION_FORBIDDEN` after BP visibility is established |
| MESH unavailable | `200` section with `state=unavailable` and last local projection when safe |
| Definition incompatible | Summary loads canonical identity; affected sections return `state=unavailable` and safe reason |
| Stale cursor/version | `409 BP_360_CURSOR_STALE` |

## 9. Repository and service design

### 9.1 Server packages

Add the following bounded implementation:

```text
server/packages/contracts/master-data/src/business-partner-360.ts
server/packages/services/master-data/src/business-partner-360-service.ts
server/packages/services/master-data/src/business-partner-360-policy.ts
server/packages/services/master-data/src/kysely-business-partner-360-repository.ts
server/packages/services/master-data/src/business-partner-360-activity.ts
server/packages/services/master-data/src/business-partner-360-completeness.ts
server/packages/services/master-data/src/business-partner-360-mesh-adapter.ts
```

The route composition belongs beside existing master-data route registration. The service orchestrates section readers; repositories remain plane-local. MESH access is through a typed adapter implemented by a local projection reader and, only where required, a MESH service client.

### 9.2 Reader rules

- Begin every query with tenant and BP visibility predicates.
- Resolve registered owner-type IDs once and pass them into address/contact/bank queries; never compare polymorphic records only by `owner_id`.
- Select explicit columns. Never use `SELECT *` in a browser-facing mapper.
- Use masked database views or explicit last-four projections for banking.
- Mask identifier/tax values in SQL or the repository boundary before application logs can observe them.
- Select current rows by status and effective range; include history only when the route requests it.
- Batch reference-data names to avoid N+1 queries.
- Keep section failures isolated after the caller passes summary authorization.

### 9.3 Optional SQL read views

Only stable, security-neutral joins should become views:

```text
master.v_business_partner_360_identity
master.v_business_partner_360_role_scope
master.v_business_partner_360_primary_address
master.v_business_partner_360_primary_contact
master.v_business_partner_bank_account_masked
```

The views must retain `tenant_id` and scope keys so existing RLS policies remain the final guard. Completeness, permissions, role applicability, and MESH freshness remain service logic because they depend on caller and definition context.

## 10. Materialization closure

A read view cannot be complete if onboarding collects data that is never materialized. Phase 1 therefore includes a materialization closure slice.

### 10.1 Typed request children

The unrestricted `proposed_payload` may continue to carry ordinary schema-versioned fields, but restricted or repeating data needs typed request children or protected evidence references. Additive request tables should cover:

```text
document.business_partner_request_address
document.business_partner_request_contact_person
document.business_partner_request_contact_channel
document.business_partner_request_identifier
document.business_partner_request_tax_registration
document.business_partner_request_certification
```

Exact storage rules:

- Address fields may be typed columns plus normalized hash and validation evidence.
- Ordinary contact channels may be typed, normalized values.
- General identifiers are typed and classification-aware.
- Restricted tax/national identifier values use the repository's protected-data pattern; they must not be duplicated into `proposed_payload`, audit JSON, metrics, or events.
- Certificate documents are referenced through authorized attachment/content coordinates, not embedded payloads.
- Each child carries tenant, request, client item key, definition field code, status/version, and provenance.

If an existing protected evidence aggregate already satisfies a field group's ownership and lifecycle, reuse it instead of adding a competing table.

### 10.2 Atomic apply

Applying an approved request must, in one transaction:

1. rerun volatile validation and scope authorization;
2. check the target BP base record version;
3. create/update the BP and applicable role/scope rows;
4. materialize typed address, contact, identifier, tax, classification, and certificate records;
5. create immutable application snapshot and amendment evidence;
6. write audit and outbox records containing safe coordinates only;
7. record a deterministic application fingerprint;
8. mark the request applied.

Retry returns the original result. Partial typed children must roll back with the request application.

### 10.3 Editing from the 360 page

Every “Edit” interaction is labeled **Propose change**. It creates or opens a governed request:

| User action | Request/command |
|---|---|
| Change identity, address, contact, identifier, tax, classification | `amend_partner` with typed field-group changes |
| Add supplier/customer role | `add_supplier` / `add_customer` |
| Add organization scope | `assign_organization` |
| Configure AP/AR company data | `configure_company` |
| Change supplier bank | `change_bank` then bank verification |
| Change employment/assignment | `change_employment` |
| Deactivate/reactivate/archive | governed lifecycle request |
| Add/renew qualification or certificate | bounded qualification/certification command and evidence workflow |

No section component receives a repository update mutation.

## 11. Completeness design

### 11.1 Definition-driven calculation

Completeness is evaluated against the active, locally verified STUDIO definition and the selected context:

```text
party category
  + active roles
  + selected operating organization/company/legal entity
  + operation/journey
  + business date
  + caller-visible field set
  = applicable requirement set
```

```ts
interface CompletenessSummary {
  status: "complete" | "incomplete" | "not_applicable" | "definition_unavailable";
  percent: number;
  requiredCount: number;
  completeCount: number;
  restrictedCount: number;
  missing: readonly {
    code: string;
    sectionCode: string;
    severity: "required" | "recommended";
    action?: { label: string; requestKind: string };
  }[];
  evaluatedAt: string;
  definitionVersion: string;
  definitionHash: string;
  fingerprint: string;
}
```

Rules:

- Required and recommended fields are scored separately; only required fields determine `complete`.
- Expired, prohibited, inactive, invalid, or unverified values fail a requirement when the definition demands current/verified evidence.
- A restricted value can satisfy completeness without revealing its value. The caller sees “verified restricted value present.”
- Risk is not a Phase 1 completeness requirement.
- Readiness and completeness are different. Completeness says data exists; readiness evaluates whether an operation is allowed.
- The result may be cached by BP version, scope, as-of date, definition hash, and policy hash. It is never persisted as an authoritative Boolean.

### 11.2 Initial requirement packs

| Pack | Required domains |
|---|---|
| Organization base | Legal/display name, category, country, primary registration ID, registered address, primary business contact |
| Supplier scope | Supplier role, effective procurement assignment, classification, qualification policy status |
| Supplier payable | Supplier scope plus company profile, payment terms/currency, verified effective bank link when required |
| Customer scope | Customer role, effective sales assignment, company profile |
| Customer credit | Customer scope plus current credit review where credit sales require it |
| Person base | Person row, names, consent/contact according to privacy policy |
| Workforce active | Person base, employee/external-worker role, effective employment/engagement, effective primary assignment/placement, onboarding state |

## 12. Security and privacy

### 12.1 Permission model

Keep `neon.relationship.business_partner.read` as the root record permission and add section/action permissions such as:

```text
neon.relationship.business_partner.identity.read
neon.relationship.business_partner.contact.read
neon.relationship.business_partner.address.read
neon.relationship.business_partner.identifier.read_masked
neon.relationship.business_partner.tax.read_masked
neon.relationship.business_partner.tax.reveal
neon.relationship.business_partner.bank.read_masked
neon.relationship.business_partner.bank.reveal
neon.relationship.business_partner.qualification.read
neon.relationship.business_partner.certificate.read
neon.relationship.business_partner.credit.read
neon.relationship.business_partner.person.read
neon.relationship.business_partner.person_sensitive.read
neon.relationship.business_partner.workforce.read
neon.relationship.business_partner.request.read
neon.relationship.business_partner.activity.read
neon.relationship.business_partner.network.read
neon.relationship.business_partner.amend.create
```

Names must be reconciled with the platform permission catalog before migration; the separation of concerns is normative even if final codes change.

### 12.2 Redaction matrix

| Data | Default view | Elevated view |
|---|---|---|
| Bank account | Bank, currency, holder, last four, verification | Audited, purpose-bound reveal; never cached in browser persistence |
| Tax registration | Type, jurisdiction, masked value, verification | Audited reveal with step-up where policy requires |
| Person national ID | Presence/type/last characters only | Privacy-purpose-bound, step-up, audited reveal |
| Date of birth | Age/status only when operationally needed | Purpose-bound exact date |
| Compensation | Absent | Dedicated HR capability only; not generic BP 360 |
| Audit old/new values | Safe field labels and masked diff | Dedicated audit evidence reader |
| MESH publication | Recipient-safe published fields | No hidden source fields can be revealed through NEON |

Reveal endpoints are commands, not query flags. They require reason/purpose, short-lived response handling, no-store headers, security audit, and explicit UI timeout.

### 12.3 Browser protections

- Do not place restricted data in server-rendered bootstrap JSON.
- Use `Cache-Control: private, no-store` for person-sensitive and reveal responses.
- Prevent values from appearing in telemetry, toast messages, error objects, URLs, or analytics.
- Abort in-flight requests when scope or BP changes.
- Clear sensitive component state on close and route change.
- Exports require a separate governed export request and manifest.

## 13. Activity and provenance

### 13.1 Unified timeline

The activity service maps heterogeneous evidence into a safe event contract:

```ts
interface BusinessPartnerActivityItem {
  id: string;
  occurredAt: string;
  category: "identity" | "role" | "scope" | "request" | "workflow" |
            "bank" | "qualification" | "certificate" | "lifecycle" |
            "network" | "workforce" | "system";
  eventCode: string;
  title: string;
  summary?: string;
  actor?: { type: string; displayName?: string };
  source: { plane: "neon" | "mesh" | "studio"; service: string };
  correlationId?: string;
  requestLink?: string;
  entityLink?: string;
  changes?: readonly { field: string; before?: string; after?: string }[];
}
```

Sources include `audit.audit_log`, BP requests and workflow, organization amendments, address events, qualification decisions, supplier activation evidence, customer lifecycle events, bank verification, certification changes, workforce range changes, and MESH acceptance/publication projections.

The service does not expose raw `old_values`, `new_values`, metadata, or event payloads. Each event code has an allowlisted presentation mapper.

### 13.2 Business activity

Governance activity and commercial transaction activity are separate tabs/filters. Business activity is an aggregation provided by owning procurement, finance, sales, project, and contract services. The BP 360 module may display counts, value, currency, last activity, status breakdown, and deep links; it must not duplicate or mutate transaction records.

If a module does not yet expose a supported reader, the section manifest reports `unavailable` or omits that tile. It must not query undocumented tables directly to simulate coverage.

## 14. MESH composition

### 14.1 Local-first network section

NEON first reads:

- `control.mesh_business_partner_account_link`;
- received profile projection and immutable snapshot;
- match and selective-acceptance evidence;
- accepted field paths and request link;
- bank disclosure projection status where applicable.

This is enough to show which MESH data entered NEON and how it was governed, even when MESH is unavailable.

### 14.2 Live MESH detail

When the caller has NEON network permission and the relationship coordinate is valid, the NEON adapter may request current account/relationship/publication summaries from MESH. MESH independently authorizes the request. The response is labeled `authority=mesh` and has its own observed timestamp.

Phase 1 network cards show:

- source and recipient network accounts;
- relationship type/status/effective dates;
- linked NEON BP and proposed/accepted role;
- last received profile schema/field-set/version/hash;
- accepted versus ignored fields;
- last publication/withdrawal status;
- commodity and industry capabilities published through the safe schema;
- bank disclosure presence/status only, never undisclosed bank data.

Person and workforce BPs cannot invoke this adapter unless they also have a separately approved organization/commercial representation satisfying the architecture policy. No person/workforce field is included in MESH requests or responses.

## 15. Frontend design

### 15.1 Package structure

Refactor the current monolithic record detail into:

```text
packages/planes/neon/business-partner/src/360/
  business-partner-360.tsx
  business-partner-360-client.ts
  business-partner-360-context.tsx
  section-registry.ts
  components/
    identity-header.tsx
    scope-bar.tsx
    section-navigation.tsx
    section-state.tsx
    completeness-card.tsx
    provenance-badge.tsx
    redacted-value.tsx
  sections/
    overview.tsx
    identity.tsx
    contacts.tsx
    addresses.tsx
    identifiers-tax.tsx
    roles-scope.tsx
    supplier-company.tsx
    customer-company.tsx
    banking.tsx
    qualifications-certificates.tsx
    credit.tsx
    workforce.tsx
    requests.tsx
    activity.tsx
    business-activity.tsx
    network.tsx
```

The Next.js route remains `/mdg/business-partner/[recordId]`. Section state is deep-linkable with `?section=contacts`; role and scope selections use query parameters so browser back/forward and shared links are deterministic.

### 15.2 Section registry

```ts
interface BusinessPartner360SectionDefinition {
  code: string;
  label: string;
  order: number;
  appliesTo(summary: BusinessPartner360Summary): boolean;
  requiredManifestPermission: string;
  load(scope: BusinessPartner360Scope, signal: AbortSignal): Promise<unknown>;
  emptyState: string;
}
```

Phase 2 risk registers a new provider. No Phase 1 component imports risk contracts.

### 15.3 Interaction rules

- Use skeletons matching the final card/table geometry.
- Preserve the identity header while a section reloads.
- Scope changes invalidate only scoped section queries.
- Empty means “authorized and no applicable records”; restricted, unavailable, and not applicable are visually distinct.
- Tables support search/filter/sort only on server-supported fields.
- Row details open a drawer with provenance, effective dates, and evidence link.
- Attachments use the existing authorized content download flow.
- Actions appear from server-provided capabilities, not hard-coded role guesses.
- Destructive lifecycle actions require reason, impact preview, and governed request creation.

### 15.4 Responsive and accessible behavior

- Desktop uses a sticky header and compact vertical section rail where width permits.
- Tablet uses a horizontal scrollable section bar.
- Mobile collapses identity details into a disclosure and uses an accessible section picker.
- Tabs/section controls have proper `aria-current` or tab semantics; do not use a tab widget when navigation changes the URL and content route.
- All status meaning includes text, not color alone.
- Tables have captions and responsive card fallbacks.
- Focus moves to the active section heading after navigation.
- Meet WCAG 2.2 AA keyboard, contrast, target size, error, and reflow requirements.

## 16. Performance and resilience

### 16.1 Targets

| Measure | Target |
|---|---:|
| Summary API p95, warm database | <= 500 ms |
| NEON section API p95 | <= 750 ms |
| First useful identity render p75 | <= 1.5 s on enterprise broadband |
| Section switch with cached data | <= 100 ms |
| Default list payload | <= 100 KB compressed |
| Summary payload | <= 75 KB compressed |
| MESH adapter timeout | 1.5 s, then local projection fallback |

### 16.2 Query and cache strategy

- Summary executes bounded parallel queries after one authorization/scope resolution.
- Primary contact/address and counts use indexed current-row predicates.
- Section readers paginate and batch lookup labels.
- HTTP ETags derive from BP record version, section max-change fingerprint, definition hash, scope, and redaction policy.
- Client query keys include tenant, BP, section, role, organization, company/legal entity, as-of date, and permission epoch.
- Never share cached responses between callers or permission epochs.
- MESH failure cannot fail identity, contacts, role, or workforce sections.
- STUDIO outage uses the last valid locally verified definition; incompatible or absent definitions fail the completeness panel closed without hiding canonical identity.

### 16.3 Index review

Before release, confirm or add tenant-leading indexes for:

- all BP extension tables by `(tenant_id, business_partner_id, status/effective range)`;
- address/contact links by registered owner coordinates and primary/current filters;
- company profiles by role ID and company;
- bank links by owner coordinates, company, purpose, and effective range;
- certifications by owner type/owner/status/effective dates;
- requests by target/materialized BP and updated time;
- audit by tenant/entity type/entity ID/occurred time;
- MESH account link by tenant/BP/status.

Use `EXPLAIN (ANALYZE, BUFFERS)` against representative high-cardinality fixtures before adding redundant indexes.

## 17. Delivery plan

### WP360-0 — Contract and authority lock

- Inventory every displayed field and assign authority, table, sensitivity, scope, and effective-date behavior.
- Freeze Phase 1 section codes and v1 API envelopes.
- Extend the STUDIO `neonPartnerAggregate` descriptor to the Phase 1 section set.
- Remove risk from the Phase 1 aggregate descriptor/readiness presentation.

**Exit:** No UI field lacks an authority/sensitivity entry.

### WP360-1 — Summary shell

- Implement summary contract, scope resolver, identity header, role lens, section manifest, completeness placeholder, and deep-link navigation.
- Preserve the existing aggregate as a compatibility adapter.

**Exit:** Supplier, customer, dual-role, and person fixtures render the correct section manifest.

### WP360-2 — Identity materialization and sections

- Add/reuse typed request children.
- Materialize addresses, named contacts/channels, identifiers, tax, and classifications atomically.
- Deliver Identity, Contacts, Addresses, and Identifiers & Tax readers/UI.

**Exit:** An approved organization request appears in all applicable typed sections with provenance and masking.

### WP360-3 — Roles, scope, and company data

- Deliver role/scope reader and supplier AP/customer AR company sections.
- Complete role-aware company and organization actions.

**Exit:** Dual-role records keep procurement and sales/company configuration independent.

### WP360-4 — Banking, qualifications, certificates, and credit

- Deliver masked banking and verification flow.
- Deliver qualification/preference/block and certificate/attachment sections.
- Deliver customer credit review under the Credit label, excluding risk enrichment.

**Exit:** No raw bank/tax value reaches the default response, logs, snapshots, or browser cache.

### WP360-5 — Requests, activity, and business activity

- Deliver governed request history, open-work summary, and allowlisted audit timeline.
- Integrate supported transaction-summary readers from owning modules.

**Exit:** Every current-state change in acceptance fixtures has an explainable timeline link or an explicit unmapped-event test failure.

### WP360-6 — MESH network section

- Deliver local accepted-projection view and optional live MESH adapter.
- Show relationship/publication provenance and degradation states.

**Exit:** MESH outage degrades only Network; person/workforce payload leak tests pass.

### WP360-7 — Person/workforce privacy view

- Deliver personal, employment, assignment, onboarding, engagement, and offboarding sections.
- Add purpose-bound restricted readers and audited reveal flow where required.

**Exit:** HR and non-HR permission matrices prove both allowed access and non-enumeration.

### WP360-8 — Completeness and governed change actions

- Activate definition-driven requirement packs and missing-data actions.
- Route every proposed change to the appropriate request/command.

**Exit:** Completeness fingerprints change deterministically when relevant data, scope, date, or definition changes.

### WP360-9 — Hardening and release

- Accessibility, responsive, localization/RTL, performance, RLS, redaction, export, and failure-mode testing.
- Telemetry dashboards and phased tenant rollout.
- Retire the old aggregate component after compatibility evidence.

**Exit:** Release gates in section 19 pass.

## 18. Testing strategy

### 18.1 Database and repository tests

- tenant isolation and owner-type collision tests;
- current/effective-date and primary selection tests;
- person-versus-organization applicability tests;
- bank/tax/identifier mask snapshots;
- materializer rollback and replay tests for typed request children;
- pagination stability under concurrent inserts;
- query-plan tests on large synthetic BP children.

### 18.2 Service and contract tests

- summary/manifest permutations for supplier, customer, dual-role, person, workforce, and MESH-linked organization;
- organization/company/legal-entity scope rejection;
- independent section authorization and non-enumeration;
- completeness definition version and fingerprint cases;
- MESH timeout/fallback/stale projection;
- STUDIO last-valid-definition fallback;
- activity mapper allowlist and restricted-value leakage tests;
- risk fields absent from every Phase 1 contract and fixture.

### 18.3 Browser tests

- open each party lens and preserve deep links;
- change organization/company and verify scoped data invalidation;
- contacts, addresses, identifiers, banking, certificates, and request drawers;
- restricted section and reveal flows with step-up/audit;
- propose change and return to the originating section/request;
- attachment authorization, expiry, and download failure;
- offline/timeout behavior for Network only;
- keyboard navigation, focus, zoom/reflow, screen-reader labels, RTL layout;
- mobile identity/header/section behavior.

### 18.4 Security tests

- direct object reference and cross-tenant/cross-scope attempts;
- permission removal while client cache is populated;
- raw bank/tax/national ID scans over API responses, logs, audit JSON, telemetry, events, and HTML;
- person/workforce MESH publication rejection;
- export governance and legal-hold behavior;
- purpose expiry and reveal replay rejection.

## 19. Release gates and definition of done

Phase 1 is complete only when:

1. Organization supplier, organization customer, dual-role organization, person customer, internal workforce person, external worker, and MESH-linked organization fixtures each render the correct applicable sections.
2. All Phase 1 authoritative table families in section 6 have a supported reader or an explicitly accepted exclusion.
3. New onboarding materializes typed identity extensions; no collected required field exists only in request JSON.
4. Every edit path creates a governed request or bounded governed command.
5. Default responses contain no raw bank, tax, national identifier, birth-date, compensation, or unrestricted audit payload.
6. Risk score, band, exposure, incidents, trend, and enrichment are absent from Phase 1 UI and API.
7. MESH is local-projection-first, live detail is independently authorized, and its outage cannot fail NEON core sections.
8. Person/workforce data is never published to MESH.
9. Completeness is definition-, role-, scope-, date-, and verification-aware; it is not a stored Boolean.
10. All list sections paginate; the page does not perform an N+1 query per row.
11. RLS, service authorization, field redaction, and client capability rendering all agree in the permission matrix.
12. WCAG 2.2 AA, localization/RTL, performance, resilience, observability, and browser journeys pass release gates.

## 20. Observability and operations

Record only safe dimensions:

```text
bp360.summary.duration_ms
bp360.section.duration_ms{section,state}
bp360.section.failure_total{section,reason_code}
bp360.mesh.fallback_total{reason_code}
bp360.completeness.status_total{pack,status}
bp360.redaction.total{field_class}
bp360.reveal.request_total{field_class,outcome}
bp360.materialization.extension_total{extension,outcome}
```

Logs include request/correlation ID, tenant-safe hashed BP coordinate, section code, scope type, definition version, permission decision ID, and safe reason code. Logs exclude names, emails, phones, addresses, identifiers, tax numbers, bank values, evidence content, request payloads, and audit diffs.

Operational dashboards should expose section latency/error, MESH fallback, definition compatibility, missing materialization, completeness distribution, and reveal-denial anomalies. Alerts must use safe aggregate dimensions.

## 21. Key design decisions

| Decision | Rationale |
|---|---|
| One role-aware page, not separate supplier/customer masters | Matches the accepted one-party/additive-role architecture |
| Summary plus section APIs, not one mega aggregate | Independent authorization, lazy load, pagination, and failure isolation |
| Sticky identity header, not a copied SAP sidebar | Fits Athyper shell and preserves content width |
| Definition-driven section manifest | Keeps UI aligned with party category, role, tenant policy, and STUDIO version |
| Local-projection-first MESH composition | Preserves plane autonomy and works during MESH outage |
| Completeness separate from readiness | Data presence is not permission to transact |
| Masked-by-default restricted fields | Minimizes sensitive-data exposure and cache risk |
| Propose-change workflow for edits | Preserves the single governed request boundary |
| Risk plug-in deferred to Phase 2 | Delivers a trustworthy data foundation before scoring/enrichment |

This design gives Athyper the useful recognition, navigation, and explainability of the SAP-inspired supplier view while preserving Athyper's stronger invariants: one canonical NEON Business Partner, additive roles, independently authoritative controls, governed changes, selective MESH projection, definition-driven STUDIO behavior, and purpose-bound privacy.
