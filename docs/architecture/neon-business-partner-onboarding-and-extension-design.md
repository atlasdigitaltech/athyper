# NEON Business Partner onboarding, integration, and extension architecture

**Status:** Proposed target architecture and phased delivery plan

**Reviewed against repository state:** 2026-08-28

**Scope:** NEON Business Partner create, edit, view, approval, MESH intake and synchronization, STUDIO applicability, supplier/customer extension, company-code and operating-organization assignment, and MESH buyer/supplier account linkage

**Primary decision:** NEON owns the approved commercial master. A source-neutral onboarding/change request owns work in progress. MESH may publish evidence and propose changes, while STUDIO authors governed metadata and policy; neither system writes approved NEON partner master data directly.

## 1. Executive decision

Implement Business Partner as a governed aggregate with three deliberately separate layers:

```text
Request and evidence                     Approved operational truth
------------------------------------     ---------------------------------
document.business_partner_request   -->  master.business_partner
document.workflow_request                master.supplier / customer
document.work_item                        operating-organization assignment
source snapshots and validation          company-code role profiles
                                         qualification, risk and blocks

Configuration and contracts
------------------------------------
STUDIO metadata, workflow/policy versions,
validation schemas and integration mappings
```

The design has five capability phases:

1. Deliver reliable NEON create, edit, view, submit, approve, reject, return, activate, deactivate, and archive journeys for the core Business Partner.
2. Discover MESH requirements and data, then implement versioned MESH publication, recipient-local NEON projection, comparison, and selective acceptance. Use STUDIO only for governed definitions and mappings.
3. Extend an approved Business Partner into supplier and/or customer roles without duplicating identity data.
4. Assign the role to compatible operating organizations and configure the applicable company-code accounting profiles.
5. Link the NEON Business Partner to MESH buyer/supplier accounts and relationships through durable typed references. Do not implement this as a generic tag.

These phases are product waves, not permission to defer fundamental integrity. Phase 1 must capture an initial operating-organization context because current NEON list authorization and record visibility already depend on it. The recommended Phase 1B slice creates the minimum approved supplier role and procurement-organization assignment needed to make the partner visible and usable in that scope. Phase 3 generalizes independent supplier/customer extension, including adding the second role to an existing partner; Phase 4 adds complete company accounting setup.

## 2. Outcomes and non-goals

### 2.1 Outcomes

- One tenant-local commercial identity regardless of whether the partner is a supplier, customer, or both.
- Draft work that can be saved, validated, reviewed, returned, and resubmitted without contaminating approved master data.
- Explicit maker-checker approval with immutable evidence and no self-approval.
- A clear separation between tenant, legal entity, company code, operating organization, and MESH network account.
- Idempotent materialization and synchronization with full provenance.
- Field-level change control for sensitive identity, tax, address, contact, and bank data.
- A design that reuses the entity runtime for ordinary read/form behavior and the workflow engine for compound onboarding.

### 2.2 Non-goals

- MESH is not the NEON master-data authority.
- STUDIO is not a shared Business Partner database or transaction proxy.
- A company selection in the browser is not authorization.
- Supplier and customer are not partner categories and are not tags.
- MESH `network_role` does not automatically create a NEON supplier or customer.
- Approval does not automatically make a partner transaction-ready for every company and operation.
- Bank account details are not included in a general partner-profile event.
- Approved partners are not hard-deleted. Retention, deactivation, blocks, and archival preserve history.

## 3. Repository baseline and gap assessment

The current repository already establishes much of the structural foundation.

| Area | Current evidence | Assessment |
|---|---|---|
| Core identity | `master.business_partner` contains canonical identity, legal facts, hierarchy, aliases, status, and audit evidence | Strong base |
| Commercial roles | `master.supplier` and `master.customer` are thin one-to-one roles over a Business Partner | Correct target model |
| Organization scope | `master.business_partner_operating_organization_assignment` is role-specific and effective-dated | Correct responsibility boundary |
| Company scope | `master.company_code_supplier_profile` and `master.company_code_customer_profile` contain AP/AR defaults | Correct accounting boundary |
| Qualification and blocks | `control.business_partner_qualification` and `control.business_partner_block` support role/org/company/commodity coordinates | Good base; needs service-level eligibility resolver |
| Identity enrichment | identifiers, tax registrations, addresses, contacts, relationships, governance, commodities, risk, banks, and external references exist | Good aggregate foundation |
| Internal counterparty | `master.legal_entity_business_partner_link` permits only `partner_category=internal` | Must not be misused for external partners |
| List experience | A published development runtime provides scoped Business Partner list/read at `/app/business_partner` | Read/list foundation only |
| Runtime write surface | Current development descriptor declares `writeMode: none` and only the read operation | CREATE/EDIT/VIEW detail is not complete |
| Authorization | read, create, and update permission catalog entries exist with tenant/legal-entity/operating-organization compatibility | Approval, submit, role extension, company-profile, block, and bank permissions need explicit contracts |
| Import | A governed import adapter can directly upsert the Business Partner and create an active org assignment | Useful transport primitive, but bypasses the proposed onboarding approval model and must not be the production approval path |
| Workflow | NEON has `document.workflow_request`, `document.workflow_stage`, common `document.work_item`, audit and notification foundations | Reuse rather than creating a second workflow engine |
| MESH account | `mesh.network_account` and `mesh.network_relationship` model buyer/supplier direction | Strong account/relationship base |
| MESH profile | Profile, identifier, commodity, tax, and bank source tables exist | Publication/projection/onboarding remains explicitly parked in current DDL |
| MESH sync design | An archived locked DDL design defines publication, projection, onboarding, and bank disclosure concepts | Adopt its authority boundary; update it to the source-neutral request model below |
| STUDIO | Metadata contract authoring and plane-local runtime publication exist | Applicable to definitions, not partner-instance storage |

### 3.1 Important gaps to close

1. There is no production detail/form descriptor for core Business Partner create or edit.
2. There is no source-neutral Business Partner request aggregate with lifecycle, pinned evidence, validation report, and approval binding.
3. Existing master statuses do not represent the complete approval lifecycle. Approval state must remain on the request, not be overloaded into `master.business_partner.status`.
4. Current import materialization can activate organization assignment immediately. Production import must stage a request or invoke the same approval/materialization service as manual onboarding.
5. Create/update permissions are proposed, but lifecycle and extension operations lack a complete least-privilege permission set.
6. No one service currently answers “may this partner perform this operation for this role, organization, company, commodity, and business date?”
7. MESH publication, recipient projection, checkpoints, and selective update acceptance are not implemented.
8. The repository does not yet define field ownership and conflict policy for every MESH-to-NEON field.

### 3.2 Phase-sequencing constraint

The current list constraint resolves Business Partners through `master.business_partner_operating_organization_assignment`. That table requires `partner_role`, and its trigger requires the corresponding non-archived supplier/customer row. A role-less core partner therefore cannot appear in the current operating-organization-scoped list.

Use one of two coherent approaches:

1. **Recommended:** include a minimal supplier Phase 1B extension in the first production vertical slice: core partner + supplier role + procurement organization assignment. Phase 3 then provides reusable add-supplier/add-customer and dual-role journeys.
2. **Alternative:** keep Phase 1 identity-only, publish a separately authorized tenant-level “unassigned partners” steward queue, and do not claim that the resulting partner is visible in an operating-organization list until Phase 3/4.

Do not insert a fake organization assignment, weaken the role trigger, or store the responsible organization only in metadata to bridge the phases.

## 4. Canonical vocabulary and invariants

### 4.1 Coordinates

| Coordinate | Meaning | Authority |
|---|---|---|
| Tenant | Isolation and authenticated business context | NEON/MESH plane-local session and RLS |
| Business Partner | NEON tenant-local commercial counterparty identity | NEON |
| Supplier role | The tenant may procure from/pay the partner | NEON |
| Customer role | The tenant may sell to/collect from the partner | NEON |
| Operating organization | Operational team responsible for procurement or sales | NEON |
| Company code | Accounting, posting, settlement, credit, and statutory book boundary | NEON |
| Legal entity | Statutory person that owns company codes | NEON |
| MESH network account | A network participant account that can act as buyer, supplier, or both | MESH |
| MESH relationship | Directional buyer-account to supplier-account edge | MESH |
| STUDIO entity contract | Versioned definition of fields, behavior, permissions, and presentation | STUDIO authority, projected to target plane |

### 4.2 Locked invariants

1. A Business Partner belongs to exactly one NEON tenant.
2. `supplier` and `customer` share the same `business_partner_id`; identity, names, legal facts, addresses, contacts, identifiers, and canonical bank ownership are not copied into role tables.
3. One partner may have neither, one, or both roles. An approved core identity is not automatically transaction-ready.
4. A supplier assignment is valid only for a procurement/`both` operating organization; a customer assignment is valid only for a sales/`both` organization.
5. A company-code role profile is valid only when that company is effectively served by the chosen operating organization for the business date.
6. Company code is the accounting boundary. Operating organization is the process-responsibility boundary. Neither replaces the other.
7. `master.legal_entity_business_partner_link` represents the tenant's own legal entity as an internal counterparty. It is not a general external-partner-to-legal-entity assignment table.
8. Browser context narrows discovery; server-side permission and relationship predicates authorize every read and mutation.
9. Codes and immutable identity bindings do not change through ordinary edit. A correction requires a governed re-key/merge process.
10. MESH source identity is retained by typed external reference and version/hash evidence, never only in `metadata`.
11. At-least-once event delivery is expected. Consumers must be idempotent and monotonic by source sequence/publication version.
12. No active financial or commercial history is cascade-deleted when a partner is deactivated, a MESH relationship ends, or a source publication is withdrawn.

## 5. Target domain model

### 5.1 Source-neutral request aggregate

Add a NEON-owned request envelope. Prefer the general name `document.business_partner_request` over a MESH-specific onboarding table because manual creation, file import, MESH onboarding, amendments, and extensions require the same controls.

```text
document.business_partner_request
  id, tenant_id, request_no
  request_kind                 new_partner | amend_partner |
                               add_supplier | add_customer |
                               assign_organization | configure_company |
                               change_bank | deactivate | reactivate | archive
  source_kind                  manual | mesh | import | api
  target_business_partner_id   nullable for new partner
  base_row_version             nullable; required for amendment
  source_projection_id         nullable
  source_version / source_hash nullable pinned evidence
  requested_role               nullable supplier | customer
  operating_organization_id    nullable by request kind
  company_code_id              nullable by request kind
  proposed_payload             jsonb, schema-versioned
  validation_report            jsonb
  duplicate_report             jsonb
  change_impact                jsonb
  workflow_request_id          nullable until submitted
  status                       draft | validating | validation_failed |
                               pending_approval | returned | approved |
                               rejected | applying | applied | failed |
                               cancelled | superseded
  submitted/approved/applied evidence
  failure_code, support_reference
  row_version and audit evidence
```

Supporting records should hold large or repeatable information rather than making `proposed_payload` unbounded:

```text
document.business_partner_request_evidence
  request_id, evidence_kind, attachment_id or snapshot_id,
  source, hash, classification, verification status, audit evidence

document.business_partner_request_validation
  request_id, rule_code, severity, field_path, outcome,
  message_code, evidence_reference, evaluated_at, ruleset_version
```

The payload is a proposed canonical value set, not a dump of a source row. It uses field keys from the active request schema. The request pins the schema, workflow definition, validation ruleset, source version, and source hash used for the decision.

### 5.2 Approved aggregate

```text
master.business_partner
|-- master.business_partner_identifier
|-- master.business_partner_tax_registration
|-- master.address + master.address_link
|-- master.contact_person + roles/channels
|-- master.business_partner_relationship
|-- master.business_partner_governance_relation
|-- master.external_reference
|-- master.party_risk_assessment + evidence/mitigation
|
|-- master.supplier
|   |-- supplier commodity capabilities
|   |-- procurement operating-organization assignments
|   |-- company-code supplier profiles
|   `-- beneficiary bank links
|
`-- master.customer
    |-- customer commodity capabilities
    |-- sales operating-organization assignments
    `-- company-code customer profiles
```

### 5.3 Request versus master state

| Concern | Request state | Master state |
|---|---|---|
| User draft | `draft`/`returned` | No row change |
| In review | `pending_approval` | Existing master remains unchanged |
| Decision | `approved`/`rejected` | Still unchanged until apply |
| Atomic materialization | `applying` | Create draft rows, related children, then activate in one transaction |
| Ready identity | `applied` | Business Partner `active` |
| Temporary stop | New governed request/block | Partner or role `inactive`/`suspended`, or scoped block |
| Historical end | Archive request | `archived`; references/history retained |

This separation avoids exposing half-approved master rows and permits safe retry after an approved request fails to materialize.

## 6. Phase 1: NEON CREATE / EDIT / VIEW and approval

### 6.1 User journeys

#### Create

1. User opens Business Partners in an authorized operating-organization context.
2. User selects **New partner**; NEON creates a request draft, not an approved master row.
3. A guided form captures core identity and the reason/purpose for onboarding.
4. NEON runs synchronous format/reference checks and asynchronous duplicate, registry, tax, sanctions, and policy checks when configured.
5. The user saves and resumes the draft as needed.
6. Submission freezes the reviewed payload, creates a generic `document.workflow_request`, stages, and work items atomically, and records a snapshot/hash.
7. Reviewers approve, reject, or return for revision. The maker cannot approve their own request.
8. Final approval enqueues or invokes an idempotent materialization command.
9. In the recommended Phase 1B slice, materialization creates the Business Partner, supplier role, and initial approved procurement-organization assignment in one transaction, writes external references when applicable, emits outbox events, and marks the request `applied`.
10. The user lands on the Business Partner view with readiness shown separately from identity status.

#### Edit

1. User opens the approved partner and selects **Propose change**.
2. NEON captures the current aggregate version and produces a draft containing only proposed differences.
3. Fields are classified by change impact:
   - display/operational low risk;
   - legal identity, ownership, address, tax, payment, bank, role, organization, or company high risk;
   - immutable identity/code changes require merge/re-key administration.
4. Policy decides whether a low-risk change may be directly applied or still needs approval. High-risk changes always use workflow.
5. Submission pins the base version. If the master changes before apply, the request becomes `failed` with `STALE_BASE_VERSION`; it is rebased and re-approved, never silently merged.
6. Approved changes create a before/after snapshot and audit event.

#### View

The view page is an aggregate read model, not a raw table editor. Recommended tabs:

```text
Overview | Roles | Organizations | Companies | Identity & Tax |
Addresses & Contacts | Banking | Qualifications & Risk |
MESH Links | Requests & Changes | Audit
```

The header shows:

- partner code, display/legal name, category, and identity status;
- role badges derived from active supplier/customer rows;
- selected operating organization and compatible company context;
- readiness summary by supplier/customer and company;
- active blocks and urgent pending changes;
- source/provenance label without implying source authority.

Sensitive fields are omitted or masked unless the principal has field-level read permission. Audit and source evidence use separate permissions.

### 6.2 Phase 1 field scope

Core form sections:

| Section | Phase 1 fields | Rule |
|---|---|---|
| Identity | code, category, registered name, display name, legal name, aliases | Code/category immutable after creation |
| Registration | country, legal form, incorporation date, website | Country drives required rule set |
| Primary identifier | scheme, value, issuing authority | Normalize and duplicate-check by scheme/jurisdiction |
| Primary address | effective postal address | Store in address foundation, not JSON metadata |
| Primary contact | named contact and approved channels | Consent/privacy classification required |
| Request context | purpose, requested initial role, responsible operating organization | Recommended Phase 1B materializes supplier + procurement assignment after approval |
| Evidence | registration/tax attachments and source references | Virus scan, classification, retention, hash |

The recommended production path includes the thin supplier Phase 1B slice because it is required by the current organization-scoped list. If business owners choose identity-only Phase 1, the role is routing information only and the alternative tenant-level unassigned queue in section 3.2 becomes mandatory. In either case, Phase 3 owns the complete reusable role-extension capability.

### 6.3 Validation layers

1. **Client ergonomics:** required markers, formatting, conditional fields.
2. **API schema:** size/type/enumeration checks, unknown-field rejection.
3. **Domain validation:** country/identifier/tax/address rules, effective dates, role/org compatibility.
4. **Duplicate detection:** code exact match; normalized legal-name/country; registration/tax ID exact match; MESH/external reference; address similarity. Results are candidates, never automatic merges.
5. **Policy validation:** required evidence, qualification, risk, approval path, segregation of duties.
6. **Database constraints:** tenant-safe FKs, uniqueness, status transitions, immutable bindings, RLS.
7. **Pre-apply validation:** rerun volatile checks and confirm source/base versions immediately before materialization.

### 6.4 Approval policy

Default conditional stages:

| Stage | When required | Decision owner |
|---|---|---|
| Data stewardship | Always | Partner master-data steward |
| Compliance/tax | Legal identifiers, tax, regulated country, risk trigger | Compliance/tax reviewer |
| Procurement or sales owner | Requested role/organization | Authorized organization owner |
| Finance | Company-code supplier/customer profile | Company finance controller |
| Treasury | New or changed remittance bank account | Treasury/bank-data verifier |
| Security/privacy | Sensitive integration or identity evidence exception | Designated specialist |

Required workflow rules:

- no self-approval, including delegated identity equivalence;
- exact scoped permission at decision time, not only assignment time;
- one immutable decision per completed work item;
- return creates a new revision and invalidates prior approval decisions affected by changed fields;
- rejection and cancellation retain evidence;
- material changes after approval force reapproval;
- SLA reminders/escalations use existing notification infrastructure;
- final approval and request status update are transactionally consistent;
- apply is idempotent by request ID and payload hash.

### 6.5 API surface

Use dedicated workflow commands around the generic runtime rather than exposing arbitrary table CRUD.

```http
GET    /api/neon/business-partners
GET    /api/neon/business-partners/{partnerId}
GET    /api/neon/business-partners/{partnerId}/readiness
GET    /api/neon/business-partners/{partnerId}/timeline

POST   /api/neon/business-partner-requests
GET    /api/neon/business-partner-requests/{requestId}
PATCH  /api/neon/business-partner-requests/{requestId}
POST   /api/neon/business-partner-requests/{requestId}:validate
POST   /api/neon/business-partner-requests/{requestId}:submit
POST   /api/neon/business-partner-requests/{requestId}:withdraw
POST   /api/neon/business-partner-requests/{requestId}:rebase

POST   /api/neon/business-partner-requests/{requestId}:approve
POST   /api/neon/business-partner-requests/{requestId}:reject
POST   /api/neon/business-partner-requests/{requestId}:return
POST   /api/neon/business-partner-requests/{requestId}:retry-apply
```

Every mutation requires an idempotency key and expected request/master version where applicable. The BFF derives tenant and principal. Scope IDs in the command are validated against current permission and effective organization/company catalogs.

### 6.6 Permission contract

Proposed exact permissions:

```text
neon.relationship.business_partner.read
neon.relationship.business_partner.create
neon.relationship.business_partner.update
neon.relationship.business_partner.submit
neon.relationship.business_partner.approve
neon.relationship.business_partner.activate
neon.relationship.business_partner.deactivate
neon.relationship.business_partner.archive
neon.relationship.business_partner.audit.read
neon.relationship.business_partner.sensitive.read

neon.relationship.business_partner.supplier.extend
neon.relationship.business_partner.customer.extend
neon.relationship.business_partner.organization.assign
neon.relationship.business_partner.company.configure
neon.relationship.business_partner.block.manage
neon.relationship.business_partner.mesh.link
neon.supplier.banking.admin
neon.supplier.banking.verify
```

Create/update/submit are maker capabilities. Approve/apply and bank verification are independently assignable. Scope compatibility must be explicitly defined for tenant, legal entity, company code, operating organization, and resource where semantically supported.

### 6.7 Frontend architecture

- Continue using the Entity App list runtime for search, filtering, pagination, bookmarks, and view routing.
- Publish a production Business Partner descriptor from STUDIO with read and form presentation metadata.
- Use a dedicated onboarding controller for cross-entity draft, validation, duplicate resolution, evidence, and workflow behavior.
- Use a dedicated aggregate detail loader for tabs; do not make the browser join tables or infer eligibility.
- Route contracts must require an operating organization for scoped list/create. Company is optional for core identity and required for company configuration.
- Query keys include tenant, principal/auth epoch, partner/request ID, effective work scope, descriptor revision, and permission revision.
- Warn before navigation with unsaved draft changes; server drafts remain the recovery authority.

## 7. End-to-end onboarding lifecycle

```text
Requested
   |
   v
Draft --> Validate --> Validation failed --fix--> Draft
   |          |
   |          v
   |     Duplicate candidates --link/justify/new--> Draft
   |
   v
Submit --> Pending approval --> Returned --> Revised draft --> Resubmit
                 |     |
                 |     `--> Rejected
                 v
              Approved
                 |
                 v
              Applying --retryable failure--> Failed --> Retry/Rebase
                 |
                 v
               Applied --> Active Business Partner
                              |
                              +--> supplier/customer extension
                              +--> org assignment
                              +--> company profile
                              +--> qualification/readiness
                              `--> later amendment/block/deactivation/archive
```

### 7.1 Lifecycle guards

- Only draft/returned requests are editable.
- Submission creates an immutable reviewed revision.
- Pending approval is review-only; reviewers annotate, approve, reject, or return rather than edit business fields.
- Approval is not equivalent to apply. Approved requests can be safely retried.
- Apply takes an advisory/idempotency lock on `(tenant_id, request_id)` and rechecks duplicate keys and versions.
- A new-partner request either creates all mandatory rows or none.
- An amendment keeps the previous master visible until the replacement change commits.
- Deactivation stops new eligible use but does not rewrite historical documents.
- Archive requires dependency analysis and normally follows deactivation and retention policy.

## 8. Phase 2: MESH requirement discovery and governed synchronization

### 8.1 Requirement-collection method

Do not begin with a field-copy mapping. Collect decisions through six bounded workstreams:

1. **Stakeholder and process discovery**
   - MESH network-account owner, NEON data steward, procurement, sales, AP, AR, tax, compliance, treasury, security/privacy, integration operations, and STUDIO metadata owner.
   - Walk through new supplier, new customer, dual-role partner, profile update, relationship termination, bank change, duplicate, and disputed-data scenarios.

2. **Source data profiling**
   - Obtain sanitized representative MESH publications for simple, multi-address, multi-tax, multi-contact, both-role, multinational, and bank-change cases.
   - Measure completeness, null rates, code-system coverage, duplicates, maximum sizes, invalid dates, country/tax combinations, and update frequency.

3. **Field authority matrix**

   For every field capture:

   ```text
   semantic definition | source path | target path | authority |
   required-by-country/role | transform | validation | sensitivity |
   sharing visibility | conflict policy | update policy | retention |
   reviewer | evidence | accepted loss/rounding | example values
   ```

4. **Lifecycle and SLA discovery**
   - Publication, withdrawal, suspension, relationship request/activation/termination, onboarding, approval, refresh, failure, replay, and support ownership.
   - Expected volume, burst, payload size, freshness, replay window, RPO/RTO, and manual recovery.

5. **Security and legal review**
   - Purpose limitation, recipient consent/relationship basis, data residency, PII/tax/bank classification, encryption, masking, right-to-correct, retention, and deletion constraints.

6. **Contract simulation and sign-off**
   - Produce versioned JSON examples and run them through validation/mapping without writes.
   - Business owners sign the authority matrix, scenario outcomes, reconciliation report, and error runbook before enabling intake.

Required discovery artifacts:

- glossary and context diagram;
- as-is/to-be swim lanes;
- field authority and classification matrix;
- MESH publication JSON Schema and examples;
- code translation catalog with unmapped-value policy;
- duplicate/match decision table;
- state-transition and conflict matrix;
- volume/SLA/error budget;
- threat model and privacy assessment;
- reconciliation and support runbook;
- signed acceptance scenarios.

### 8.2 Authority matrix

| Data | Authoritative system | NEON behavior |
|---|---|---|
| Network account and buyer/supplier relationship | MESH | Project recipient-visible version and retain source identity |
| Published legal/profile facts | MESH for the publication | Treat as source evidence/proposal |
| Accepted Business Partner identity | NEON | Selectively materialize after approval |
| Supplier/customer role | NEON | Created only by explicit request |
| Operating organization assignment | NEON | Explicitly approved |
| Company-code AP/AR settings | NEON | Never mirrored from MESH |
| Qualification, risk decision, blocks | NEON | Never overwritten by MESH |
| Bank disclosure | MESH owner for offered instruction | Separate secure proposal and NEON verification |
| Accepted/verified remittance bank | NEON | Independent verification and activation |
| Entity/field/workflow/integration definitions | STUDIO | Publish signed/versioned definitions to the target plane |

### 8.3 Integration flow

```text
MESH owner tables
   -> immutable profile publication + snapshot
   -> recipient-filtered outbox event
   -> authenticated transport
   -> NEON inbox/dedupe/checkpoint
   -> runtime_meta.mesh_partner_profile_projection
   -> compare/match/validation
   -> document.business_partner_request (pinned version/hash)
   -> NEON approval
   -> idempotent materialization
   -> NEON master + external reference
```

Adopt the archived sync design's publication/projection concepts:

- immutable `mesh.network_account_profile_publication` pointing to a snapshot;
- recipient-safe event types for publish/update/withdraw/suspend;
- `runtime_meta.mesh_partner_profile_projection` and an integration checkpoint/inbox;
- separate bank disclosure and bank projection;
- `master.external_reference` as the durable accepted mapping.

Generalize its `document.business_partner_onboarding` into the source-neutral request described in section 5. Existing MESH-specific fields become optional source coordinates on that request.

### 8.4 Event and replay contract

Envelope minimum:

```text
event_id, event_type, schema_version, source_plane,
source_tenant_id, recipient_tenant_id,
network_account_id, relationship_id,
publication_id, publication_version, sequence_no,
payload_hash, occurred_at, trace_id
```

Rules:

- event ID deduplicates transport delivery;
- source account plus publication version enforces monotonic projection;
- payload hash is verified before storing;
- unsupported major schemas are quarantined, not partially applied;
- projection update and inbox completion/checkpoint occur transactionally;
- dead-letter entries retain only permitted data and a support reference;
- replay is safe from the last committed checkpoint;
- no integration consumer writes master tables directly;
- a newer publication marks `update_available`; it never rewrites an in-flight request or accepted master.

### 8.5 Match and conflict policy

Suggested ordered matching:

1. active `master.external_reference` for the MESH network account;
2. verified registration/tax identifier in the same jurisdiction;
3. verified global identifier such as LEI/DUNS/GLN;
4. normalized legal name + country + address similarity as a candidate only;
5. no confident match: propose a new partner.

Never auto-merge on fuzzy similarity. A steward chooses create, link, or reject and records evidence. One MESH account may map to at most one live NEON Business Partner per tenant unless a reviewed representation-purpose rule explicitly permits otherwise.

### 8.6 Post-onboarding updates

- Show a field-level source-versus-NEON diff with provenance, last accepted version, and local changes since acceptance.
- Default policy is selective acceptance, not full overwrite.
- NEON-owned fields are locked from source updates.
- Locally corrected source-owned facts raise a conflict requiring a human decision.
- Withdrawal or relationship termination updates projection state and may recommend a block/review; it does not deactivate master data automatically.
- A changed bank fingerprint always opens a separate bank-change request and requires fresh verification.

### 8.7 STUDIO applicability

STUDIO should own/version:

- Business Partner entity and form/list/view descriptors;
- field labels, conditional visibility, classification, and basic validation declarations;
- lifecycle transition definitions and workflow-template versions;
- approval routing policy declarations and SLA references;
- MESH publication schemas and NEON mapping contract versions;
- code-list mappings and compatibility rules;
- signed release manifests and rollout/rollback metadata.

STUDIO must not own:

- Business Partner instances or request decisions;
- MESH account/relationship instances;
- NEON company/org assignments, qualifications, blocks, risk decisions, or bank verification;
- runtime secrets, raw bank identifiers, or cross-plane transaction coordination.

Target planes consume a pinned, signed definition locally. Runtime continues using the last valid definition if STUDIO is unavailable. A definition release never mutates existing partner records automatically; migrations or revalidation are explicit operations.

## 9. Phase 3: supplier and customer extension

### 9.1 Extension principle

An extension adds commercial capability to an existing identity:

```text
Business Partner
  + Supplier role  = procurement/AP identity
  + Customer role  = sales/AR identity
```

Do not create a second Business Partner when an existing supplier becomes a customer. Reuse the same `business_partner_id` and add `master.customer` after duplicate and authority checks.

### 9.2 Supplier extension

Minimum approved materialization:

- one `master.supplier` row in onboarding then active state;
- supplier code and type;
- at least one compatible procurement operating-organization assignment;
- required commodity capabilities;
- required qualification decisions;
- optional company-code supplier profiles, delivered in Phase 4;
- bank setup remains separate and is never implied by supplier activation.

### 9.3 Customer extension

Minimum approved materialization:

- one `master.customer` row from prospect to active;
- customer code/type and governed key-account designation;
- at least one compatible sales operating-organization assignment;
- required commodity capabilities and qualifications;
- optional company-code customer profiles, delivered in Phase 4.

### 9.4 Readiness is derived, not a status shortcut

Return a server-computed matrix:

```text
role | organization | company | commodity | business date |
role active | assignment active | qualification effective |
company profile active | bank/payment ready | active blocks |
eligible operations | reason codes
```

A partner can therefore be active as an identity, approved as a supplier for one organization, ready for ordering in one company, and blocked for payment in another. UI must not collapse this into one green “Active” badge.

## 10. Phase 4: operating organization and company-code linkage

### 10.1 Correct relationship model

```text
Business Partner
  -> Supplier or Customer role
  -> role-specific Operating Organization assignment
  -> Operating Organization <-> Company Code effective assignment
  -> role-specific Company Code profile
```

The Business Partner is not directly assigned to a company code through a generic join. Accounting readiness is represented through the role-specific company profile:

- supplier -> `master.company_code_supplier_profile`;
- customer -> `master.company_code_customer_profile`.

### 10.2 Write validation

For every company-profile create/activate command, the server verifies:

1. tenant consistency;
2. Business Partner and requested role exist and are not archived;
3. operating organization has a compatible domain;
4. role assignment is effective for the business date;
5. company is an effective participant of that operating organization;
6. principal has the exact role/org/company permission intersection;
7. qualification requirements are approved/effective;
8. no applicable block prohibits configuration/activation;
9. referenced payment term, accounting profile, dimension set, currency, and bank link are tenant/company compatible;
10. no overlapping active profile violates uniqueness.

### 10.3 Supplier company profile

Owns company-specific AP behavior: transaction currency default, payment term, accounting profile, remittance bank link, and dimension defaults. Activation requires payment-readiness checks appropriate to policy. It does not own the partner's legal identity.

### 10.4 Customer company profile

Owns company-specific AR behavior: currency, credit limit/currency, payment term, accounting profile, dimensions, and statement cycle. Credit approval may require a separate stage based on amount/policy.

### 10.5 Context and authorization

- Core identity read can be operating-organization scoped and may support bounded all-permitted reads.
- Core partner creation requires an exact responsible operating organization.
- Company configuration requires an exact company and compatible operating organization.
- Mutations never use `all_permitted`.
- Legal entity is derived from company code; the browser must not submit an independently trusted pair.
- Authorization resource contains tenant, partner, role, organization, company, request, and operation coordinates as applicable.

## 11. Phase 5: buyer and supplier account linkage

### 11.1 Why this is not tagging

`buyer`, `supplier`, and `both` have business semantics, direction, lifecycle, scope, and evidence. A free-form tag cannot enforce them.

Use these distinct concepts:

| Concept | Model |
|---|---|
| What a MESH account can generally do | `mesh.network_account.network_role` |
| Who buys from whom in one network relationship | `mesh.network_relationship.buyer_account_id` and `supplier_account_id` |
| How the tenant treats the counterparty in NEON | `master.supplier` and/or `master.customer` |
| Durable accepted source mapping | `master.external_reference` plus recipient-local projection/link coordinates |

### 11.2 Directional mapping

From the recipient NEON tenant's perspective:

| MESH relationship position of recipient account | Counterparty position | Proposed NEON extension |
|---|---|---|
| Buyer | Supplier | Supplier role |
| Supplier | Buyer | Customer role |

Do not infer the NEON role from the counterparty's `network_role` alone. Use the active relationship and recipient account position. If multiple relationships imply both directions, present two explicit role-extension proposals against the same Business Partner.

### 11.3 Durable linkage

Use `master.external_reference` for the accepted account identity:

```text
owner_type/entity     business_partner
source_system_code    athyper_mesh
external_entity_code  network_account
external_id           MESH network_account UUID
external_code         MESH account code
```

Retain relationship-specific, publication, recipient-account, and version coordinates in the NEON projection/request integration records. Do not overload the external reference or general `metadata` with mutable relationship state.

Linking requires:

- an active/authorized MESH relationship visible to the recipient;
- exact account and tenant coordinates;
- duplicate mapping checks;
- steward approval when linking to an existing partner;
- source version/hash evidence;
- audit event showing old/new link state;
- no automatic role creation unless the submitted request explicitly includes it.

## 12. Eligibility resolver

Create one NEON domain service used by Procurement, Sales, AP, AR, payment, and reporting:

```ts
resolvePartnerEligibility({
  tenantId, principalId, businessPartnerId,
  role: "supplier" | "customer",
  operatingOrganizationId, companyCodeId,
  commodityCategoryId?, operationCode, businessDate
})
```

It returns `eligible`, structured reason codes, effective records, and a decision fingerprint. Example reasons:

```text
ROLE_MISSING
ROLE_INACTIVE
ORG_ASSIGNMENT_MISSING
ORG_COMPANY_INCOMPATIBLE
COMPANY_PROFILE_MISSING
COMPANY_PROFILE_INACTIVE
QUALIFICATION_PENDING
QUALIFICATION_EXPIRED
BLOCKED_FOR_OPERATION
BANK_NOT_READY
PAYMENT_TERM_INVALID
UNAUTHORIZED_SCOPE
```

Transactional commands re-evaluate eligibility under lock. A cached UI readiness result is explanatory only and cannot authorize a purchase order, invoice, payment, or sales order.

## 13. Data ownership and update policy

Recommended field policy classes:

| Class | Examples | Update policy |
|---|---|---|
| NEON immutable identity | partner code, category, accepted source binding | Re-key/merge workflow only |
| Approved legal fact | legal name, registration country, legal form | High-risk amendment and evidence |
| Source-proposed fact | MESH website, published address/contact | Selective acceptance |
| NEON operational | role, org assignment, commodity acceptance | NEON request only |
| NEON financial | payment terms, accounting, credit, dimensions | Company-scoped approval only |
| NEON control | qualification, risk, blocks | Control-owner command only |
| Sensitive bank | account identifier, verification | Separate vault/masked projection and treasury workflow |
| Presentation | display name, aliases | Policy-controlled lower-risk amendment |

Every accepted source value should retain source system, source entity/version/hash, accepted request, accepted timestamp/principal, and optional source field path. Provenance must be queryable without placing authority-bearing values in unrestricted JSON metadata.

## 14. Transaction, concurrency, and audit design

### 14.1 Materialization transaction

Within one NEON database transaction:

1. acquire request idempotency/advisory lock;
2. lock request and relevant duplicate/master keys;
3. confirm approved status, decision hash, and unapplied state;
4. reauthorize the system command and validate current policy/effective data;
5. check source and base versions;
6. create/update canonical and child records;
7. create before/after snapshot;
8. write business audit event and transactional outbox event;
9. mark request applied with resulting IDs;
10. commit.

### 14.2 Concurrency

- Request `row_version` protects draft edits.
- Business Partner aggregate version protects amendments.
- Partial unique indexes protect live codes, roles, identifiers, and effective assignments.
- Source projection uses monotonically increasing publication version/sequence.
- Duplicate simultaneous new requests are both reviewable, but only one can materialize the protected identity; the other becomes a resolvable duplicate conflict.

### 14.3 Audit events

Minimum event vocabulary:

```text
business_partner.request.created
business_partner.request.validated
business_partner.request.submitted
business_partner.request.returned
business_partner.request.approved
business_partner.request.rejected
business_partner.request.apply_failed
business_partner.created
business_partner.changed
business_partner.role_extended
business_partner.organization_assigned
business_partner.company_configured
business_partner.blocked
business_partner.deactivated
business_partner.mesh_linked
business_partner.mesh_update_available
```

Audit stores actor, effective scope, request/workflow/revision, correlation and idempotency IDs, before/after hashes, reason, source version, policy/descriptor versions, and outcome. Sensitive values remain redacted or separately protected.

## 15. Security, privacy, and controls

- Force RLS and tenant predicates on request, projection, workflow, evidence, and master tables.
- Derive tenant/principal from the verified session and system-worker context.
- Use resource-scoped authorization for requests and partners; lists use closed relation predicates.
- Encrypt sensitive data in transit and at rest; bank identifiers use tokenization/vaulting where available.
- Never send raw bank identifiers in general events, logs, traces, notifications, or browser analytics.
- Mask tax/registration/contact fields according to classification and permission.
- Scan attachments before reviewer access and use signed short-lived retrieval.
- Protect against spreadsheet formula injection in import/export.
- Bound JSON, strings, arrays, attachments, batch size, and query complexity.
- Require step-up/MFA for bank activation, high-risk merge/re-key, and policy-defined critical approvals.
- Record access to high-sensitivity evidence.
- Apply retention/legal-hold policy independently to source projections, requests, evidence, audit, and master history.
- Treat integration payloads as untrusted input even when signed.

## 16. Observability and operations

Metrics:

- requests created/submitted/applied by source and role;
- validation failure and duplicate-candidate rates by rule;
- approval stage age, SLA breach, return and rejection rates;
- apply latency/failure/retry count;
- MESH event lag, duplicates, gaps, quarantine, schema mismatch, and projection conflicts;
- linked projections with update available;
- readiness failure reasons by org/company;
- authorization denials and suspicious sensitive-field access;
- reconciliation differences between projection, external reference, and accepted master.

Every error returned to a user includes a stable code and support reference, not sensitive internals. Runbooks must cover stuck approvals, failed apply, stale base version, duplicate collision, unknown code mapping, event sequence gap, schema quarantine, source withdrawal, link correction, bank change, and replay.

## 17. Performance and scale

- Keep the list query on the scoped `master.business_partner` view/path; do not join every tab into the list.
- Load detail-tab summaries in bounded parallel calls and lazy-load expensive audit/evidence history.
- Use cursor pagination and the existing operating-organization relation constraint.
- Add search normalization/index strategy for code, legal/display name, identifiers, country, and aliases; use fuzzy matching in a dedicated candidate service, not the authorization query.
- Cache descriptors, catalogs, and readiness only with tenant/principal/auth epoch/scope/policy revision keys.
- Projection intake is asynchronous and back-pressure aware.
- Large imports create requests in bounded batches; approval and apply remain per logical aggregate unless a reviewed bulk policy explicitly preserves evidence and failure isolation.

## 18. Delivery plan and gates

### Phase 0 — decision closure

- Approve vocabulary, request/master separation, initial operating-organization requirement, role semantics, and authority matrix.
- Confirm the recommended supplier Phase 1B slice or explicitly fund the tenant-level unassigned-partner alternative.
- Agree country packs, evidence requirements, duplicate policy, approval stages, and retention.
- Publish ADRs for source-neutral request, STUDIO boundary, and directional MESH linkage.

**Exit:** signed domain invariants, field matrix, lifecycle, permission matrix, and acceptance scenarios.

### Phase 1 — NEON core create/edit/view

- Add request/evidence/validation DDL, constraints, RLS, grants, indexes, and migration.
- Add request service, validators, duplicate candidates, workflow adapter, idempotent materializer, snapshots, audit, outbox, and notifications.
- Publish production entity detail/form descriptor and permissions.
- Build list-to-detail, create wizard, amendment diff, approval review, timeline, and recovery states.
- Route production imports into requests; retain direct adapter only for explicitly disposable/local fixture paths or replace it.

**Exit:** a manual request proceeds from draft through independent approval to one active Business Partner plus the minimum supplier/organization assignment required by the current scoped list; edit conflicts and retries are proven. If the alternative identity-only path is approved, the partner is proven in the tenant-level unassigned queue instead.

### Phase 2 — MESH discovery and sync

- Complete the discovery artifacts in section 8.1.
- Implement immutable MESH publication/snapshot, recipient authorization, outbox, transport, NEON inbox/checkpoint, projection, compare, match, and selective acceptance.
- Implement schema evolution, replay, reconciliation, quarantine, and support runbooks.
- Publish mapping/validation definitions from STUDIO when the definition pipeline is ready.

**Exit:** duplicate/out-of-order events are harmless; a pinned MESH publication is selectively approved into NEON; later source updates do not overwrite master.

### Phase 3 — role extensions

- Add supplier/customer extension requests, role-specific validators, permissions, workflow routing, commodity capability, and readiness view.
- Prove same-partner dual-role behavior.

**Exit:** one Business Partner can independently become a qualified supplier and customer without identity duplication.

### Phase 4 — organization and company configuration

- Add organization assignment and company profile request kinds.
- Implement compatibility, effective-date, finance/credit/payment, qualification, block, and readiness checks.
- Integrate eligibility resolver into one Procurement and one Sales vertical slice.

**Exit:** transactions fail closed unless role, organization, company, qualification, profile, and blocks collectively allow the operation.

### Phase 5 — MESH account/relationship link and bank disclosure

- Add directional link review, durable external reference, dual-role proposals, relationship lifecycle response, and link correction.
- Implement separate bank disclosure projection, approval, independent NEON verification, and preferred-remittance switch.

**Exit:** MESH buyer/supplier direction maps explicitly to NEON roles; bank changes cannot silently replace active settlement details.

## 19. Required test matrix

### Domain and database

- tenant-safe FKs and RLS isolation for every new table;
- immutable code/category/source binding and valid state transitions;
- supplier/customer one-to-one uniqueness;
- role-to-organization-domain compatibility;
- effective assignment overlap and org/company compatibility;
- internal legal-entity link cannot reference external partner;
- materialization atomicity and idempotency;
- no hard delete after activation/history.

### Workflow and authorization

- maker cannot self-approve directly or through delegation;
- approver loses scope before decision and is denied;
- returned revision invalidates affected decisions;
- stale master/base version cannot apply;
- exact org/company intersection enforced;
- field-level sensitive read/write denial;
- step-up for configured high-risk actions.

### MESH integration

- valid publication, duplicate event, out-of-order event, gap, replay, unsupported schema, bad hash/signature, wrong recipient, relationship termination, publication withdrawal, source correction, and bank fingerprint change;
- fuzzy candidate never auto-merges;
- new source version does not alter in-flight request;
- accepted fields change only through approved request;
- raw bank identifier never appears in event/log/projection/browser.

### UX and accessibility

- create/save/resume/validate/submit/return/resubmit/approve/reject/apply/retry;
- detail tabs, masked fields, readiness reasons, source diff, audit timeline;
- invalid/missing operating organization and incompatible company recovery;
- unsaved-change guard and concurrent-edit conflict;
- keyboard, focus restoration, screen-reader labels/live regions, responsive layout, localization, and WCAG 2.2 AA.

### Performance and resilience

- representative small/medium/large tenant list and detail latency;
- high-volume import/request generation;
- event burst/back-pressure and consumer restart;
- workflow/materializer retry storm prevention;
- reconciliation after backup/restore and disaster recovery.

## 20. Acceptance criteria

The architecture is complete when all of the following are demonstrable:

1. A user with exact operating-organization create permission can save and submit a partner request but cannot approve it without the independent approval permission.
2. Approval creates the complete mandatory aggregate exactly once; failure creates no partial master.
3. An active partner edit is a versioned proposed change, with before/after review and conflict detection.
4. View shows identity, roles, organization/company readiness, qualifications/blocks, MESH provenance, and audit without leaking sensitive data.
5. Supplier and customer roles remain independent extensions of one identity.
6. Company configuration is role-specific and is rejected when organization/company compatibility is absent.
7. Procurement/Sales commands call the common eligibility resolver and fail closed with stable reason codes.
8. A MESH publication is recipient-authorized, versioned, hashed, deduplicated, projected, matched, and selectively accepted through the same request lifecycle.
9. MESH suspension/withdrawal/relationship termination never silently deletes or deactivates NEON master data.
10. Buyer/supplier account linkage is directional and auditable, not a tag or metadata convention.
11. STUDIO publishes definitions but is not a runtime dependency for partner transactions and stores no partner instance data.
12. Replay, reconciliation, security, privacy, accessibility, performance, rollback, and support evidence pass release gates.

## 21. Decisions still required from business owners

These questions materially affect implementation and should be closed in Phase 0/Phase 2 workshops:

1. Is core Business Partner approval mandatory for every tenant, or may policy auto-approve low-risk internal/import cases?
2. Must Phase 1 create a transaction-ready supplier, or is approved core identity sufficient until Phase 3?
3. Which countries and identifier/tax rules are in the first release?
4. Which fields can a maker change without reapproval, if any?
5. What duplicate confidence requires mandatory steward review, and who can authorize a merge/link?
6. What minimum evidence and qualifications are required by partner role, country, commodity, organization, and company?
7. Are supplier/customer codes shared with the Business Partner code or independently numbered?
8. Which operating organization is responsible when a partner serves several organizations?
9. Can one company profile be activated before all requested companies approve, or must onboarding be all-or-nothing?
10. What is the intended reaction to MESH account suspension, publication withdrawal, and relationship termination: notify, review, temporary block, or automatic block recommendation?
11. What MESH visibility/consent permits identifiers, contacts, tax registrations, certifications, and addresses to cross tenants?
12. What are the authoritative commodity and tax code systems and the unmapped-code workflow?
13. What are approval SLA, escalation, delegation, and emergency override rules?
14. What are data residency, retention, legal-hold, and subject-correction requirements?
15. Which bank-verification provider/process is authoritative in NEON, and which actions require step-up authentication?

## 22. Recommended immediate implementation slice

Build one thin but complete vertical slice before expanding field breadth:

```text
NEON manual organization-partner request
  -> code/name/category/country/primary identifier
  -> requested supplier role
  -> responsible procurement operating organization
  -> duplicate check
  -> data-steward approval with no self-approval
  -> atomic Business Partner + supplier + organization-assignment materialization
  -> active organization-scoped list and aggregate view
  -> amendment of display/legal name through versioned approval
  -> full audit and retry evidence
```

This slice closes the largest current gap—read-only list to governed lifecycle—while exercising the existing operating-organization authorization boundary. Supplier role, company profile, MESH projection, and bank data can then attach to a proven request/workflow/materialization kernel instead of each inventing a separate onboarding path.

## 23. Repository references

- `server/db/ddl/planes/neon/master/03_tables.sql` — core partner, role, organization, company-profile, external-reference, bank, risk, and related tables.
- `server/db/ddl/planes/neon/master/07_functions.sql` and `08_triggers.sql` — lifecycle, immutability, role, hierarchy, and compatibility guards.
- `server/db/ddl/planes/neon/control/03_tables.sql` — qualification and block controls.
- `server/db/ddl/planes/neon/document/03_tables.sql` and common document DDL — workflow request, stage, and work-item foundations.
- `server/packages/planes/neon/src/record-collection-scope.ts` — current operating-organization collection authorization.
- `server/packages/planes/neon/src/business-partner-import.ts` — current governed import adapter and production approval gap.
- `server/db/scripts/provision-development-business-partner-runtime.ts` — current read-only development descriptor.
- `server/db/ddl/planes/mesh/mesh/03_tables.sql` — MESH accounts, relationships, profile, tax, commodity, and bank source models.
- `docs/archive/database-ddl/reports/mesh-neon-business-partner-profile-sync-design.md` — prior publication/projection authority design adopted and generalized here.
- `docs/architecture/neon-operating-organization-build-design.md` — operating-organization/company compatibility and work-context rules.
- `docs/architecture/neon-company-context-and-identity-design.md` — company context, server authorization, and frontend context behavior.
