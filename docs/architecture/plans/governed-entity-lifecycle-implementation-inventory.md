# Governed entity lifecycle implementation inventory

**Status:** Temporary implementation inventory. Retire after every open item is implemented, rejected by an ADR, or represented in `governed-entity-lifecycle-backlog.md`.

**Status:** Proposed two-way experience over the current DDL
**Reviewed:** 2026-09-02
**Scope:** NEON organization Business Partner 360, Supplier, Customer, and supplier-linked External Workforce

## 1. Reading this inventory

This inventory maps the current post-migration NEON schema to the Business Partner UI. It uses the common and NEON canonical DDL under `server/db/ddl`, active NEON migrations, and the current Business Partner 360 section contract and readers. Archived DDL and the legacy tables removed by the table-streamlining migration are excluded.

| Coverage | Meaning |
|---|---|
| **Live** | The current 360 service has a reader and the UI has a section component. |
| **Composed** | The section is derived from several live readers; it has no table of its own. |
| **DDL available** | The table exists, but the current 360 section does not yet read it. |
| **Provider gap** | The UI contract exists, but its owning business-module provider is not configured. |

## 2. Two-way product model

The Business Partner module is split into two deliberately different experiences:

| Way | User intent | Experience | Write behavior |
|---|---|---|---|
| **A. Display DDL data in 360 views** | Understand one organization across all applicable tables | Business Partner, Supplier, and Customer 360 views | Read-first. Changes launch an authorized maintenance action or request. |
| **B. Collect and maintain information** | Register, extend, correct, or administer an organization | Supplier/Customer requests, MESH registration, self-registration, and BP Administrator entity lists | Governed request for onboarding/protected changes; authorized direct entity operation for eligible administrative maintenance. |

The two ways use the same canonical records. A 360 view is a composed read model and never becomes a second persistence authority.

```text
                         NEON canonical DDL
                    master / control / document
                         /                 \
                        v                   v
              A. 360 read views       B. collection/maintenance
              BP / Supplier /         Requests / MESH / Admin
              Customer                entity operations
                        \                   /
                         v                 v
                    Audit, comments, attachments
```

# Part A — Display DDL tables in 360 views

## 3. Shared Business Partner 360 representation

The record route is `/mdg/business-partner/{businessPartnerId}`. The UI applies a role lens (`all`, `supplier`, `customer`, or `workforce`) and, where required, an operating-organization/company/legal-entity scope.

| UI section | Current tables | Coverage and UI content |
|---|---|---|
| **Overview** | `master.business_partner`, `master.supplier`, `master.customer`, `master.address_link`, `master.address`, `master.contact_person`, `master.contact_link`, `master.business_partner_identifier`, `document.business_partner_request`, `audit.audit_log` | **Composed.** Organization identity header, roles, primary address/contact, masked identifiers, completeness, open work, and recent activity. |
| **Identity** | `master.business_partner`, `master.business_partner_industry_classification`, `master.external_reference` | **Live.** Canonical/parent organization identity, legal facts, aliases, ownership class, industry classifications, and external-system coordinates. `master.organization_amendment` is DDL history evidence but is not selected by the current reader. |
| **Contacts** | `master.contact_person`, `master.contact_person_role`, `master.contact_link`, `master.contact_email`, `master.contact_phone`, `control.owner_type` | **Live.** Named business contacts, effective roles, email/phone channels, primary and verification state. A contact person is not an HR `master.person`. |
| **Addresses** | `master.address`, `master.address_link`, `master.address_event`, `control.owner_type` | **Live.** Effective usage/purpose, primary address, validation result, and recent safe event metadata. |
| **Identifiers & tax** | `master.business_partner_identifier`, `master.business_partner_tax_registration`, `master.tax_jurisdiction`, `master.tax_type`, `master.external_reference` | **Live.** Masked identifiers and tax registrations. Protected tax reveal is a separate purpose-bound command. |
| **Governance & ownership** | `master.business_partner_governance_relation` | **Live.** Directors, officers, shareholders, owners, voting/beneficial ownership, and related member BP references. `master.business_partner_relationship` and the root `parent_business_partner_id` are **DDL available** but are not returned by this section today. |
| **Roles & scope** | `master.supplier`, `master.customer`, `master.business_partner_operating_organization_assignment`, `master.legal_entity_internal_partner_link` | **Live.** Supplier/customer role cards plus effective operating-organization, internal legal-entity, and company relationships. The former `master.legal_entity_business_partner_link` name remains a deprecated read-only compatibility view. |
| **Banking** | `master.bank_party`, `master.bank_account`, `master.bank_account_link`, `document.business_partner_bank_verification`, `control.owner_type` | **Live for supplier role.** Masked accounts, owner link/purpose, primary state, company scope, and verification workflow. `master.bank_account_house_config` is internal house-bank configuration and is not a BP record section. |
| **Qualifications & certificates** | `master.business_partner_commodity_capability`, `master.commodity_category`, `master.commodity_code_assignment`, `shared.commodity_code`, `control.business_partner_qualification`, `control.supplier_preference_designation`, `control.business_partner_block`, `master.certification_type`, `master.certification`, `document.attachment_series`, `document.attachment` | **Live for supplier role.** Commodity capabilities and standard codes, qualification decisions and their commodity scope, preference, blocks, certification metadata, and authorized evidence coordinates. |
| **Requests** | See section 10 | **Live.** Governed onboarding, role, scope, company, bank, and lifecycle requests. |
| **Activity** | `audit.audit_log`, `document.business_partner_request`, `document.business_partner_request_evidence`, `document.business_partner_request_materialization_item` | **Live.** Governance/request/audit timeline. Domain lifecycle tables listed under each role remain additional evidence sources. |
| **Business activity** | See appendices A–C | **Provider gap.** The UI and API section exist, but `procurement`, `finance`, `sales`, `projects`, and `contracts` currently return `PROVIDER_NOT_CONFIGURED` unless an owning module injects a reader. |
| **Network** | `control.mesh_business_partner_profile_inbox`, `control.mesh_business_partner_profile_processing_attempt`, `snapshot.mesh_business_partner_profile_received`, `control.mesh_business_partner_profile_projection`, `document.mesh_business_partner_match`, `document.mesh_business_partner_acceptance`, `document.mesh_business_partner_acceptance_event`, `control.mesh_business_partner_account_link`, `control.mesh_bank_account_disclosure_inbox`, `snapshot.mesh_bank_account_disclosure_received`, `control.mesh_bank_account_projection` | **Live.** Recipient-local MESH projection, match/acceptance evidence, approved account link, bank disclosure state, provenance, and freshness. There is no cross-plane SQL join. |

Applicability rules:

- `Governance & ownership` is organization-only.
- `Banking` and `Qualifications & certificates` require a supplier role.
- `Credit review` requires a customer role.
- `Business activity` and `Network` require a supplier or customer role.

## 4. Three 360 views

The route may share one technical 360 shell, but the user sees three explicit organization views. Role-specific views filter the navigation and data; they are not separate copies of the Business Partner.

### 4.1 Business Partner 360 View

This is the cross-role record. It answers “who is this party?” before “what role does it perform?”.

| Navigation | Content |
|---|---|
| Overview | Identity header, party category, lifecycle, all role chips, completeness, open work, recent activity |
| Identity | Canonical/legal identity, aliases, classification, ownership class, parent and external references |
| Contacts | Named contacts and communication channels |
| Addresses | Registered and purpose-specific addresses |
| Identifiers & tax | Masked registration identifiers and tax registrations |
| Governance & ownership | Governance members and ownership percentages for organizations |
| Roles & scope | Supplier, customer, workforce, organization, company, and legal-entity relationships |
| Relationships | BP-to-BP and intercompany relationships when the missing reader is delivered |
| Requests | All requests that created or changed the partner |
| Audit History | Unified request, lifecycle, and audit timeline |
| Comments | Entity-bound discussion |
| Attachments | Entity-bound documents and versions |
| Network | MESH account link, relationship, match/acceptance, projection, and freshness |

### 4.2 BP — Supplier 360 View

The Supplier view fixes `roleLens=supplier` and adds supplier-specific scope and commercial sections.

| Navigation | Supplier content |
|---|---|
| Overview | Shared identity plus supplier code/type/status and readiness |
| Supplier profile | `master.supplier` and operating-organization assignment |
| Procurement & AP | Company-code supplier profile, payment terms, accounting profile, dimensions, remittance bank |
| Banking | Masked account links and independent bank verification |
| Qualifications & certificates | Qualifications, preference, blocks, certificates and evidence attachments |
| Business activity | Requisitions, orders, confirmations, receipts, service sheets, invoices, payments, sourcing, contracts when providers are configured |
| Requests and onboarding | Supplier request, registration, role/scope/company/bank changes, activation evidence |
| Relationships, Audit History, Comments, Attachments, Network | Shared record capabilities filtered to the supplier role |

### 4.3 BP — Customer 360 View

The Customer view fixes `roleLens=customer`.

| Navigation | Customer content |
|---|---|
| Overview | Shared identity plus customer code/type/key-account/status |
| Customer profile | `master.customer` and operating-organization assignment |
| Sales & AR | Company-code customer profile, currency, payment terms, accounting profile, dimensions and statement cycle |
| Credit review | Independent company-scoped credit/commercial decision; never labelled Risk |
| Business activity | Opportunities, quotations, orders, fulfilment, invoices and receipts when providers are configured |
| Requests and onboarding | Customer request, registration, role/scope/company and lifecycle changes |
| Relationships, Audit History, Comments, Attachments, Network | Shared record capabilities filtered to the customer role |

## 5. Business Partner relationship tables

These are relationships or scoped child collections, not editable fields on the BP root.

| Relationship table | From | To / child | UI placement |
|---|---|---|---|
| `master.business_partner_relationship` | source BP | target BP | Governance/Network relationship collection; **DDL available**, not in the current reader. |
| `master.business_partner_governance_relation` | organization BP | named member or `member_business_partner_id` | Governance & ownership; **Live**. |
| `master.business_partner_operating_organization_assignment` | BP | operating organization + partner role | Roles & scope; **Live**. |
| `master.legal_entity_internal_partner_link` | legal entity | internal BP counterparty identity | Roles & scope; **Live**. The mapping remains separate because it is optional and independently effective-dated. |
| `master.company_code_supplier_profile` | supplier role | company code | Procurement & AP; **Live**. |
| `master.company_code_customer_profile` | customer role | company code | Sales & AR; **Live**. |
| `master.address_link` | typed owner/BP | address | Addresses; **Live**. |
| `master.contact_person` | typed owner/BP | named business contact | Contacts; **Live**. |
| `master.contact_person_role` | named contact | contact role | Contacts; **Live**. |
| `master.contact_link` | typed owner/contact person | communication channel | Contacts; **Live**. |
| `master.contact_person_identity_link` | business contact | HR/person identity | Person reconciliation; **DDL available**, not exposed by the ordinary Contacts reader. |
| `master.bank_account_link` | typed owner/BP | bank account | Banking; **Live**, masked by default. |
| `master.external_reference` | typed owner/BP | external-system coordinate | Identity / Identifiers & tax; **Live**. |
| `master.business_partner_commodity_capability` | BP + role | commodity category and assigned standard codes | Supplier/customer classification and scope; supplier capabilities are **Live** in Qualifications & certificates. |
| `master.business_partner_industry_classification` | BP | industry code | Identity; **Live**. |
| `master.intercompany_trading_pair` | source company | supplier profile and optional mirror customer profile | Procurement & AP / Sales & AR for internal counterparties; **DDL available**. |
| `control.mesh_business_partner_account_link` | NEON BP | MESH account/relationship projection | Network; **Live**. |
| `document.mesh_business_partner_match` | received profile | candidate NEON BP | Network onboarding evidence; **Live**. |
| `document.mesh_business_partner_acceptance` | match | accepted field set | Network onboarding evidence; **Live**. |

Structural one-to-one roles are:

```text
master.business_partner (organization)
  +-- master.supplier        (optional commercial role)
  +-- master.customer        (optional commercial role)
```

People/workforce identity is separate and connects to a supplier only through sourcing and engagement records.

## 6. NEON, MESH, and Keycloak/TrustIAM linkage

### 6.1 Stable organization spine

Use `canonical_party_id` as the opaque cross-plane organization correlation key:

```text
master.canonical_party.id
        |
        +-- NEON  master.business_partner.canonical_party_id
        +-- MESH  mesh.network_account.canonical_party_id
        +-- STUDIO trustiam.organization.canonical_party_id
                         |
                         +-- Keycloak organization/provider projection
```

The three records are not interchangeable:

| Authority | Owns | Must not own |
|---|---|---|
| **NEON Business Partner** | Buyer-local supplier/customer master, scopes, AP/AR configuration, qualifications, bank verification, engagements and transactions | Login credentials or cross-tenant network identity |
| **MESH Network Account** | Participant-controlled network profile, buyer/supplier graph relationship, selective publication and cross-tenant exchange | NEON approval, local supplier activation, or user authorization |
| **TrustIAM + Keycloak** | Organization identity boundary, federation route, authentication subject and session lifecycle | Supplier/customer master data, commercial role, bank/tax data, or engagement state |

`canonical_party_id` correlates organization identity; it never grants access. NEON additionally requires an approved `control.mesh_business_partner_account_link`, and every user requires a local principal plus authorization.

### 6.2 Organization onboarding and MESH link

```text
MESH network account publishes organization profile
  -> NEON immutable inbox and snapshot
  -> recipient-local projection
  -> deterministic match against NEON organization BPs
  -> selective field acceptance
  -> ordinary Supplier or Customer Request
  -> approved NEON BP and role materialization
  -> control.mesh_business_partner_account_link approval
  -> master.external_reference for safe external coordinates
```

Relevant tables are `mesh.network_account`, `mesh.network_relationship`, `mesh.network_account_profile`, `snapshot.network_account_profile_publication`, `control.mesh_business_partner_profile_inbox`, `snapshot.mesh_business_partner_profile_received`, `control.mesh_business_partner_profile_projection`, `document.mesh_business_partner_match`, `document.mesh_business_partner_acceptance`, `document.business_partner_request`, and `control.mesh_business_partner_account_link`.

### 6.3 Keycloak/TrustIAM user link

Organization linking and human login linking are separate:

```text
trustiam.organization (canonical_party_id)
  -> trustiam.organization_provider
  -> Keycloak organization / federation route

Keycloak subject
  -> master.principal_identity_binding
  -> master.principal
  -> plane-local roles, permissions and scope targets
```

`master.principal_identity_binding` stores the provider, realm and immutable Keycloak subject coordinate. It must not store a BP ID as an IAM subject, and a Keycloak organization membership must not automatically create a Supplier/Customer role or MESH relationship.

TrustIAM `application_projection` and `projection_scope` express desired application reach. NEON remains authoritative for the effective permission decision and must cap external access to the approved tenant, network account/relationship, operating organization, company, and record coordinates.

### 6.4 External workforce through a supplier

```text
NEON organization BP
  -> master.supplier
      -> workforce_requisition_supplier / candidate_submission
      -> contingent_work_order or statement_of_work
      -> document.worker_engagement
           +-- master.external_worker -> master.person
           +-- buyer company/legal entity
           +-- worker_operational_placement
           +-- compliance and onboarding
```

The `worker_engagement` is the authoritative link between supplier organization and contractor. The person is not a Business Partner and does not inherit supplier-wide access.

For contractor access, add or generalize an engagement-scoped IAM projection:

```text
worker_engagement
  -> workforce access projection
  -> TrustIAM identity projection
  -> Keycloak invitation/federation
  -> NEON principal_identity_binding
  -> access ceiling: engagement + company + site/project + effective dates
```

The current `document.workforce_iam_projection` is employee-only, and `trustiam.identity_projection.relationship_kind` currently supports only `employer` and `contact`. External-worker access therefore needs an explicit `external_worker` relationship kind and a `worker_engagement:<id>` source reference, or a new generalized workforce-access projection. Engagement suspension/termination must increment `principal.auth_epoch` and drive deprovisioning.

### 6.5 Effective operating rules

1. MESH identifies organizations and transports approved business documents; it is not the login authority.
2. Keycloak authenticates humans and services; it is not the Business Partner authority.
3. NEON authorizes each operation from the local principal, permission, scope, BP/account link, and engagement state.
4. Never infer user access from matching email domains, `canonical_party_id`, MESH membership, or supplier affiliation alone.
5. Publish only recipient-safe organization fields to MESH. Do not publish unrestricted person, rate, bank, tax, compliance, or IAM payloads.
6. External time sheets, expenses and supplier invoices may cross MESH through the workforce claim inbox; NEON validates their network relationship and engagement before materialization.
7. Suspend access when either the Keycloak identity, MESH relationship, NEON account link, supplier role, or worker engagement becomes inactive.

# Part B — Collect and maintain Business Partner information

## 7. Collection entry points

The collection experience exposes the following top-level entries:

| Entry | Initiator | Purpose | Authority |
|---|---|---|---|
| **Supplier Request** | Internal requester or BP Administrator | Create a supplier, add the supplier role, assign scope, configure company/AP, or change banking | `document.business_partner_request` |
| **Customer Request** | Internal requester or BP Administrator | Create a customer, add the customer role, assign scope, configure company/AR, or change lifecycle data | `document.business_partner_request` |
| **Supplier Partner Registration through MESH** | Internal user selects a MESH network account/profile | Match or create a NEON supplier from accepted network data | MESH projection/acceptance followed by an ordinary supplier request |
| **Supplier Partner Self Registration through its MESH Network Account** | External supplier principal | Supply and correct registration information under an accepted invitation/account binding | Restricted invitation route followed by an ordinary supplier request |
| **Customer Partner Registration through MESH** | Internal user selects a MESH network account/profile | Match or create a NEON customer from accepted network data | MESH projection/acceptance followed by an ordinary customer request |
| **Customer Partner Self Registration through its MESH Network Account** | External customer principal | Supply and correct registration information under an accepted invitation/account binding | Restricted invitation route followed by an ordinary customer request |
| **Entity List maintenance** | BP Administrator | Search and maintain eligible canonical or relationship records | Authorized entity runtime operation with audit; no raw SQL/table access |

## 8. Supplier collection journeys

### 8.1 Supplier Request → onboarding registration through MESH

This flow starts inside NEON when an internal user wants to onboard a known MESH participant.

```text
Supplier Request
  -> search/select MESH network account and published BP profile
  -> recipient-local profile inbox/snapshot/projection
  -> deterministic candidate match and field diff
  -> user selects accepted fields
  -> mesh_business_partner_acceptance
  -> ordinary business_partner_request(requested_role='supplier')
  -> validate -> submit -> approve -> apply
  -> NEON BP + supplier role + organization/company scope
  -> approved MESH account link
  -> qualification/bank/readiness controls -> activation
```

Primary tables are `control.mesh_business_partner_profile_inbox`, `snapshot.mesh_business_partner_profile_received`, `control.mesh_business_partner_profile_projection`, `document.mesh_business_partner_match`, `document.mesh_business_partner_acceptance`, `document.mesh_business_partner_acceptance_event`, `document.business_partner_request`, and `control.mesh_business_partner_account_link`.

MESH supplies candidate data and provenance; it never writes NEON master tables directly.

### 8.2 Supplier self-registration through its MESH Network Account

This flow starts with the external supplier and a restricted registration channel.

```text
Supplier MESH Network Account
  -> invitation/registration link bound to supplier journey
  -> external principal accepts invitation
  -> self-registration draft
  -> supplier enters/corrects typed addresses, contacts, IDs, tax and certificates
  -> evidence attachments
  -> validate -> submit
  -> internal review -> approve -> apply
  -> MESH account link approval
  -> readiness controls -> supplier activation
```

The external principal may access only its bound invitation/request while the request is in an editable state. It cannot browse NEON entity lists, alter approval evidence, or update materialized master rows.

### 8.3 Direct internal supplier request

When no MESH participant is selected, the same Supplier Request begins with `source_kind='manual'` and `registration_mode='direct'` or `on_behalf`. It uses the same typed children, validation, approval, materialization, and activation controls as the MESH journeys.

## 9. Customer collection journeys

### 9.1 Customer Request

```text
Customer Request
  -> new partner or add customer role
  -> typed identity/contact/address/identifier/tax/classification data
  -> operating-organization and optional company/AR configuration
  -> validate -> submit -> approve -> apply
  -> independent credit review and customer lifecycle decision
```

Registration approval cannot approve credit or activate the customer lifecycle.

### 9.2 Customer onboarding through MESH

```text
Customer Request
  -> search/select customer MESH network account and published profile
  -> recipient-local projection -> match/diff -> selective acceptance
  -> business_partner_request(requested_role='customer')
  -> validate -> submit -> approve -> apply
  -> NEON organization BP + customer role + organization/company scope
  -> approved MESH account link
  -> independent credit review and lifecycle decision
```

### 9.3 Customer self-registration through its MESH Network Account

```text
Customer MESH Network Account
  -> customer invitation bound to account/relationship
  -> Keycloak-authenticated external principal accepts invitation
  -> restricted customer registration draft and evidence
  -> validate -> submit -> internal approval -> apply
  -> customer role + MESH account link
  -> independent credit review and lifecycle decision
```

The same restricted ownership, expiry, correction, audit, and no-direct-master-write rules used by supplier self-registration apply to customers.

## 10. Shared request and onboarding model

### 10.1 Supported request types

`document.business_partner_request` is the single governed request authority for:

- `new_partner`
- `amend_partner`
- `add_supplier`
- `add_customer`
- `assign_organization`
- `configure_company`
- `change_bank`
- `deactivate`
- `reactivate`
- `archive`

Pre-S2 DDL also admitted `add_workforce`, `change_employment`, and workforce-shaped `new_partner` requests. S2 preserves terminal rows as immutable compatibility evidence, rejects non-terminal rows during migration, and routes new person onboarding and employment lifecycle changes through `document.workforce_request` under People/Workforce authority. Candidate invitation separation remains a channel-layer follow-up; it cannot create a workforce-shaped Business Partner request after S2.

Its principal lifecycle is:

```text
draft -> validating -> validation_failed/draft -> pending_approval
      -> returned/draft | rejected | approved -> applying -> applied/failed
```

### 10.2 Request and workflow tables

| Concern | Tables |
|---|---|
| Invitation/channel | `document.business_partner_invitation`, `document.business_partner_invitation_recovery` |
| Request header and result coordinates | `document.business_partner_request` |
| Typed registration children | `document.business_partner_request_address`, `document.business_partner_request_contact_person`, `document.business_partner_request_contact_channel`, `document.business_partner_request_identifier`, `document.business_partner_request_tax_registration`, `document.business_partner_request_classification`, `document.business_partner_request_certification` |
| Evidence and validation | `document.business_partner_request_evidence`, `document.business_partner_request_validation` |
| Immutable child-to-master result | `document.business_partner_request_materialization_item` |
| Approval workflow | `document.workflow_request`, `document.workflow_stage`, `document.work_item` |
| Attachments | `document.attachment_series`, `document.attachment`, `document.attachment_link` |
| Duplicate resolution | `document.business_partner_duplicate_resolution` |
| Audit | `audit.audit_log` |

The seven typed child tables and `business_partner_request_materialization_item` are currently supplied by `20260830_neon_business_partner_typed_request_extensions.sql`. They are part of the effective schema even though they are not yet consolidated into the canonical NEON document table file.

### 10.3 Registration channels

| Journey | Invitation value | Resulting request role | Required scope |
|---|---|---|---|
| Supplier registration | `journey_kind='supplier'` | `supplier` | Operating organization; company code optional by stage |
| Customer registration | `journey_kind='customer'` | `customer` | Operating organization; company code optional by stage |

Candidate/person registration is removed from the target BP module and handled by the People/Workforce onboarding authority.

Modes are `self_service`, `on_behalf`, and `integration`; direct internal creation uses request `registration_mode='direct'`.

## 11. BP Administrator entity-list maintenance

A user holding the BP Administrator role receives an **Entity List View** in addition to the three 360 views.

### 11.1 Navigation

```text
Business Partner Administration
  +-- Business Partners
  +-- Suppliers
  +-- Customers
  +-- Relationship Tables
  |     +-- BP relationships
  |     +-- Governance/ownership
  |     +-- Organization assignments
  |     +-- Legal-entity links
  |     +-- Supplier company profiles
  |     +-- Customer company profiles
  |     +-- Address links
  |     +-- Contact roles/channels
  |     +-- Bank-account links
  |     +-- Classifications/capabilities
  |     +-- External references
  |     +-- MESH account links
  +-- Requests
  +-- Audit History
```

Every list is definition-driven and tenant/scope filtered. It provides search, filter, sort, column selection, export where allowed, record navigation, and an authorized Create/Edit action.

### 11.2 Meaning of direct update

“Direct update” means a synchronous, permission-checked entity API operation from the administrator UI. It does **not** mean browser SQL, unrestricted table access, bypassing RLS, or bypassing audit.

Every successful update must:

1. validate tenant, organization/company scope, field policy, foreign keys, effective dates, and current row version;
2. require a reason code/comment when policy requires it;
3. execute through the owning domain/entity service;
4. write old/new field evidence to `audit.audit_log`, with protected values redacted;
5. update `row_version`/audit columns and reject stale edits;
6. refresh the 360 view from the canonical record.

### 11.3 Direct-update versus request-required policy

| Change class | BP Administrator behavior |
|---|---|
| Ordinary descriptive metadata and aliases | Direct entity operation when the published field policy permits it |
| Contact people, contact roles/channels, address usage links, classifications, external references, and ordinary BP relationships | Direct entity/relationship operation when permitted; effective dating and audit required |
| Canonical legal identity, ownership class, supplier/customer role creation, organization/company assignment | Governed Business Partner Request |
| Tax/regulated identifiers and sensitive person data | Protected command or governed request; never generic inline editing |
| Bank account or preferred remittance change | `change_bank` request plus independent verification |
| Supplier activation, customer lifecycle/credit decision, deactivation/reactivation/archive, duplicate merge | Dedicated governed command/request with separation of duties |
| MESH match, acceptance, or account link | Network-specific approval command; never generic row editing |
| Immutable evidence, materialization receipts, lifecycle events, audit rows | Read-only |

This is a proposed expansion from the current “every master change is a request” 360 contract. It requires explicit entity-operation permissions and field-policy publication before any table is marked directly editable.

## 12. Shared Audit History, Comments, and Attachments

These capabilities appear consistently on Business Partner, Supplier, Customer, Person, Request, and eligible relationship-record pages.

| Tab | Tables | Behavior |
|---|---|---|
| **Audit History** | `audit.audit_log` | Append-only actor, operation, reason, changed-field, request/correlation, and timestamp history. Restricted old/new values are redacted or omitted. |
| **Comments** | `document.comment`, `document.comment_draft`, `document.comment_feed_cursor`, `document.comment_mention`, `document.comment_reaction` | Entity-bound threaded discussion, drafts, unread cursor, mentions, reactions, visibility, resolution, and retention. Comments are collaboration, not master-data fields. |
| **Attachments** | `document.attachment_series`, `document.attachment`, `document.attachment_link`, `document.attachment_folder`, `document.attachment_derivative`, `document.attachment_legal_hold`, `document.attachment_legal_hold_event` | Versioned, scanned, policy-authorized entity documents with folders, derived files, retention, and legal hold. |

The binding coordinate is `(tenant_id, entity_type, entity_id)`. The BP root uses `entity_type='business_partner'`; requests and relationship records use their own stable entity type. Supplier and Customer 360 may display BP-root attachments plus role-specific links without duplicating file content.

# Appendix A — Supplier table inventory

## A.1 Supplier UI sections and tables

| Supplier area | Tables | Current coverage |
|---|---|---|
| Identity | Shared BP identity tables + `master.supplier` | **Live** |
| Roles & scope | `master.supplier`, `master.business_partner_operating_organization_assignment` | **Live** |
| Procurement & AP | `master.company_code_supplier_profile`, `master.company_code`, `master.payment_term`, `master.accounting_profile`, `master.dimension_set`, `master.bank_account_link` | **Live** for stored IDs/status. Human-readable reference expansion is incomplete. |
| Banking | `master.bank_party`, `master.bank_account`, `master.bank_account_link`, `document.business_partner_bank_verification` | **Live**, masked/reveal-separated |
| Qualifications & certificates | `master.business_partner_commodity_capability`, `master.commodity_category`, `master.commodity_code_assignment`, `shared.commodity_code`, `control.business_partner_qualification`, `control.supplier_preference_designation`, `control.business_partner_block`, `master.certification_type`, `master.certification`, attachment tables | **Live**, including tenant categories and assigned standard commodity codes |
| Activation | `document.supplier_activation_evidence` | **DDL available** as immutable readiness evidence; not a dedicated 360 card today. |
| Business activity | Tables in A.4 | **Provider gap** |

## A.2 Supplier request flow

```text
Create request
  -> business_partner_request (+ typed children)
  -> business_partner_request_validation
  -> workflow_request / workflow_stage / work_item
  -> approve -> apply atomically
  -> business_partner + supplier + operating-organization assignment
     + optional supplier company profile + typed master rows
  -> business_partner_request_materialization_item
  -> readiness evaluation -> supplier_activation_evidence -> supplier active
```

Registration approval does not itself activate a supplier. Qualification, bank, company-profile, block, and other readiness evidence are evaluated independently before activation.

## A.3 Supplier onboarding registration flow

```text
business_partner_invitation (supplier/self_service|on_behalf|integration)
  -> accepted applicant binding or representation evidence
  -> business_partner_request(requested_role='supplier')
  -> typed registration sections
  -> validate -> submit -> review -> approve -> apply
  -> supplier role + organization assignment
  -> company/AP configuration
  -> bank verification + qualification/certificate checks
  -> supplier_activation_evidence
```

## A.4 Supplier business activity and Procurement/AP tables

These tables exist, but the 360 Business activity providers are not configured yet:

| Activity family | Header/relationship tables | Child/detail tables |
|---|---|---|
| Requisition and order | `document.purchase_requisition`, `document.commitment` (`commitment_type='purchase_order'`) | `document.purchase_requisition_line`, `document.commitment_line`, `document.commitment_release_allocation` |
| Supplier confirmation and delivery | `document.purchase_order_confirmation`, `document.delivery_note` | `document.purchase_order_confirmation_line`, `document.delivery_note_line` |
| Receipt and service acceptance | `document.receipt`, `document.service_sheet` | `document.receipt_line`, `document.service_sheet_line` |
| Invoice and match | `document.purchase_invoice`, `document.invoice_match_case` | `document.purchase_invoice_line`, `document.accounting_distribution` |
| Payment and remittance | `document.payment_entry`, `document.payment_remittance_output` | `document.payment_entry_allocation`, `document.payment_term_application`, `document.payment_term_discount_result` |
| Sourcing | `document.sourcing_event`, `document.sourcing_event_company`, `document.sourcing_event_award` | `document.sourcing_event_demand`, `document.sourcing_event_award_allocation`, `document.sourcing_event_intercompany_allocation` |
| External workforce procurement | `document.workforce_requisition`, `document.workforce_requisition_supplier`, `document.external_candidate_submission`, `document.contingent_work_order`, `document.statement_of_work`, `document.worker_engagement` | Revisions, SOW items, evaluations, placements, compliance, time, expense, service-entry, and invoice-allocation tables listed in Appendix C |

# Appendix B — Customer table inventory

| Customer area | Tables | Current coverage |
|---|---|---|
| Identity | Shared BP identity tables + `master.customer` | **Live** |
| Roles & scope | `master.customer`, `master.business_partner_operating_organization_assignment` | **Live** |
| Sales & AR | `master.company_code_customer_profile`, `master.company_code`, `master.payment_term`, `master.accounting_profile`, `master.dimension_set`, `control.customer_account_designation` | **Live** for stored IDs/status. Governed account designations are DDL available; human-readable reference expansion is incomplete. |
| Credit review | `control.customer_credit_review` | **Live** |
| Customer lifecycle | `control.customer_lifecycle_event` | **DDL available** as append-only lifecycle evidence; not a separate section. |
| Business activity | `document.sales_opportunity`, `document.sales_opportunity_company`, `document.sales_quotation`, `document.sales_quotation_company`, `document.sales_quotation_allocation`, `document.sales_order`, `document.sales_order_line`, `document.delivery_note`, `document.delivery_note_line`, `document.payment_entry`, `document.payment_entry_allocation` | **Provider gap** |

Customer onboarding reuses the shared invitation, typed children, validation, workflow, evidence, and materialization tables. Applying an approved `new_partner`/`add_customer` request creates `master.customer`, the operating-organization assignment, and optionally `master.company_code_customer_profile`. Credit review and lifecycle activation remain independent controls; registration approval cannot decide them.

# Appendix C — Supplier-linked External Workforce and People boundary

| Area | Tables | Target placement |
|---|---|---|
| Contractor identity | `master.person`, `master.person_sensitive_profile`, `master.external_worker` | People/Workforce authority; Supplier 360 receives only an authorized safe projection. |
| Supplier-to-worker link | `document.external_candidate_submission`, `document.worker_engagement` | Supplier 360 External Workforce section. `worker_engagement` is authoritative after selection. |
| Commercial sourcing | `control.external_workforce_rate_card`, `control.external_workforce_rate`, `document.workforce_requisition`, `document.workforce_requisition_supplier`, `document.external_candidate_submission`, `document.external_candidate_evaluation`, `document.contingent_work_order`, `document.contingent_work_order_revision`, `document.statement_of_work`, `document.statement_of_work_revision`, `document.statement_of_work_item` | Services Procurement under the Supplier domain. |
| Placement and compliance | `document.worker_operational_placement`, `document.worker_compliance_item`, `document.engagement_onboarding_case` | Engagement-scoped workforce operations; safe status may appear in Supplier 360. |
| Work claims | `document.external_time_sheet`, `document.external_time_entry`, `document.external_expense_sheet`, `document.external_expense_item`, `document.external_service_entry`, `document.external_service_entry_line`, `document.external_workforce_invoice_allocation`, `document.service_sheet_source_allocation` | Services Procurement execution and AP integration. |
| MESH workforce bridge | `control.mesh_workforce_claim_inbox`, `control.mesh_workforce_claim_processing_attempt` | Cross-tenant time, expense, and supplier-invoice transport evidence. |
| IAM | `document.workforce_iam_projection`, `trustiam.identity_projection`, `master.principal`, `master.principal_identity_binding` | Current employee-only foundation; generalize to external-worker engagement scope. |
| Internal employee | `master.employee`, `master.employment`, `master.work_assignment`, `document.onboarding_case`, `document.offboarding_case` | People/HR only; excluded from Business Partner navigation. |

S2 removes `master.person.business_partner_id` and its FK, uniqueness, and cardinality triggers. Retired coordinates are copied to immutable, admin-read-only `master.person_business_partner_legacy_link` evidence before the column is removed. New workforce changes use `document.workforce_request`; supplier linkage remains authoritative through `external_candidate_submission` and `worker_engagement`.

# Appendix D — SAP capability benchmark and recommended improvements

## D.1 Interpretation and product boundaries

In this comparison, “SAP HANA” means the SAP S/4HANA Business Partner application model. SAP HANA itself is a database platform and does not define a Business Partner product model.

The SAP products are complementary, not four competing versions of one master:

| Product | Capability used as the benchmark | Closest NEON/MESH boundary |
|---|---|---|
| SAP S/4HANA | Common party identity, immutable category, multiple business roles, and role-specific data | NEON `master.business_partner` plus supplier/customer and company/organization scope |
| SAP Ariba Supplier Lifecycle and Performance | Registration, modular questionnaires, qualification, preference, disqualification, requalification, performance, and corrective action | NEON BP requests, qualification/readiness, and the proposed supplier-lifecycle layer |
| SAP Fieldglass | Contingent and services procurement: requisition, supplier distribution, candidate, work order/SOW, worker, onboarding, tenure, time, expense, and invoice | NEON Services Procurement plus People/Workforce |
| SAP Business Network | Network account/profile, buyer-supplier relationship, discovery/invitation, publication, and transaction exchange | MESH network account, relationship, profile publication, and exchange documents |

SAP S/4HANA allows one Business Partner to carry multiple roles while common data is stored once and role-dependent data remains separate. Its party category is exactly one of Person, Organization, or Group and cannot be changed after creation. NEON’s root-plus-thin-role design follows the first principle. The selected organization-only NEON boundary deliberately narrows the second: people stay in People/Workforce rather than becoming Business Partners. [SAP Business Partner Role](https://help.sap.com/docs/SAP_S4HANA_CLOUD/f86dc2eb1f8b48c880a7607213104b27/981e51b7ed7349c693d54587acf3b2a4.html), [SAP Business Partner Category](https://help.sap.com/docs/SAP_S4HANA_CLOUD/f86dc2eb1f8b48c880a7607213104b27/abc58f7afcfb4a37bdcd9ea8a838f09c.html)

## D.2 Current position

| Capability | NEON today | SAP benchmark | Assessment |
|---|---|---|---|
| Common organization identity and multiple roles | One canonical BP with thin supplier/customer rows and scoped extensions | S/4HANA common BP data plus multiple roles | **Strong parity** |
| Party category | The compatibility domain can still read historical organization/person/group values, but an S2 table constraint permits only organization on new or changed BP rows; `master.person` has no BP key | S/4HANA supports three immutable categories | **Intentional target divergence implemented at DDL authority** |
| Company and operating-organization scope | Supplier/customer company profiles and operating-organization assignments | S/4HANA role and organizational-area data | **Strong foundation** |
| Relationship model | Effective-dated BP relationship exists, but type is a pattern-checked string and the 360 reader is absent | S/4HANA models categorized BP relationships; Business Network separately governs trading relationships | **Partial** |
| Supplier registration and approvals | Invitation, typed request sections, validation, workflow, evidence, atomic materialization, and readiness | Ariba registration and lifecycle projects | **Strong governed flow** |
| Supplier questionnaires | Registration payload sections exist, but no reusable/versioned questionnaire definition and response model | Ariba modular questionnaires can be reused and selected by business context | **Major gap** |
| Qualification and preference | Qualification is effective-dated and can scope to organization, company, and commodity capability; preference can scope to organization, company, and commodity category | Ariba qualification/preference is commonly scoped by commodity, region, and department, with expiry and requalification | **Good base; scope/orchestration gap** |
| Disqualification and phase-out | Blocks, qualification decisions, and preference revocation exist as separate controls | Ariba supports scoped disqualification and future-effective phase-out behavior | **Partial; no unified derived eligibility** |
| Supplier performance | No dedicated scorecard period, survey, metric result, or corrective-action plan | Ariba Supplier Performance Management uses scorecards and supplier performance projects | **Major gap** |
| Network profile and onboarding | MESH profile publication, recipient inbox/snapshot, match, selective acceptance, account link, invitations, and bank disclosure | Business Network supports supplier profiles, invitations, self-nomination, and trading relationships | **Strong and privacy-forward** |
| Network relationship capabilities | One buyer-supplier relationship with free-form `relationship_kind` | Business Network distinguishes sourcing and fulfillment relationships and may associate different network accounts | **Material gap** |
| External workforce sourcing | Requisition, supplier distribution, candidate submission/evaluation, work order/revision, SOW/revision/items, and engagement | Fieldglass contingent workflow creates a work order from a selected candidate and has supplier acceptance/activation | **Strong parity** |
| Worker operations | Placement, compliance, onboarding case, time, expense, service entry, and invoice allocation exist | Fieldglass activity items, time/expense approval, work-order revisions, and worker lifecycle | **Strong base** |
| Tenure | Engagement has `maximum_tenure_days` only | Fieldglass tenure policies consider jurisdiction, site, business unit, legal entity, category, worker type, duration, period, and required gaps | **Major policy gap** |
| External-worker IAM | Employee-only IAM projection; engagement-scoped external-worker projection is not implemented | Fieldglass maintains worker assignment/access lifecycle independently of supplier identity | **Critical gap** |

Ariba’s process-project model is the most important missing business capability: it supports reusable modular questionnaires, independent approvals, process statuses, expiration, reminders, and context-sensitive qualification. [Ariba process projects](https://help.sap.com/docs/strategic-sourcing/supplier-management-setup-and-administration/overview-of-process-projects-efe53420f56d4c6c8c6171833506e7ee?locale=en-US&source=redirect), [Ariba qualification and requalification](https://help.sap.com/docs/strategic-sourcing/supplier-management-setup-and-administration/about-supplier-qualification-and-requalification-using-supplier-qualification-projects)

MESH already captures the safe replication and recipient-local acceptance pattern well. The key Business Network lesson is to treat sourcing and fulfillment as separately governed relationship capabilities and to handle distinct network accounts without creating duplicate local Business Partners. [SAP Business Network sourcing and fulfillment relationships](https://help.sap.com/docs/strategic-sourcing/managing-suppliers-and-supplier-lifecycles/sourcing-and-fulfillment-trading-relationships-with-suppliers), [setting up trading relationships](https://help.sap.com/docs/business-network-for-supply-chain/enabling-suppliers-on-business-network/setting-up-trading-relationships)

NEON’s external-workforce transaction chain already matches the main Fieldglass flow. The most valuable additions are configurable activity tasks and tenure policies rather than a second worker master. Fieldglass defines work-order activity items as assigned pre-start tasks and applies revisions to assignment terms; its tenure policies can span assignments and apply jurisdictional and organizational rules. [Fieldglass work orders and activity items](https://help.sap.com/docs/SAP_Fieldglass/83ee364ad6f849fc82ad6e5dd1bef38a/ad36023564e244d4b03e250b2c98ca6e.html), [Fieldglass tenure policy requirements](https://help.sap.com/docs/SAP_Fieldglass/b3510b491fdc4f50b7b2627ea07af24c/c7c6aaf6e8ab47dabdf1f14a78eca9cc.html?locale=en-US&state=PRODUCTION&version=Cloud)

### D.2.1 Field-level review and target ownership

The review uses four decisions:

- **Keep** — the field has one clear authority and appropriate scope.
- **Harden** — keep the field, but add typing, bounds, provenance, or lifecycle rules.
- **Move/derive** — another record is the authority; expose this value only as a projection.
- **Replace** — remove the field after migration because it duplicates or contradicts a governed record.

#### Common Business Partner identity

| Current field or family | Decision | Recommended improvement |
|---|---|---|
| `id`, `tenant_id`, `code`, `canonical_party_id`, `representation_purpose_code` | **Keep** | Retain tenant-local identity and opaque cross-plane correlation. Require uniqueness for an active `(tenant_id, canonical_party_id, representation_purpose_code)` representation without treating the correlation as authorization. |
| `name`, `display_name`, `legal_name` | **Harden** | Define an explicit display-name fallback and normalization policy. Preserve the asserted source, observed time, confidence, and accepted-by evidence in field assertions instead of overwriting silently. |
| `partner_category` | **Replace** | Enforce `organization` for new NEON BPs and remove `person`/`group` after workforce decoupling. Category locking is then unnecessary on the organization-only table. |
| `ownership_class` | **Keep** | Retain `external`/internal-counterparty meaning, but prevent it from driving supplier/customer eligibility or IAM access. Internal legal-entity identity remains in `legal_entity_internal_partner_link`. |
| `legal_classification`, `legal_form` | **Harden** | Replace free-text `legal_form` with a country-aware reference catalog; constrain legal classification and legal form combinations by registration country. |
| `registration_country_code`, `incorporation_date` | **Harden** | Reference a governed ISO country catalog, prohibit future incorporation dates, and require country for registered legal organizations. Do not duplicate tax registrations here. |
| `website_url` | **Harden** | Normalize scheme/host, reject credentials and local/private targets, and store verification state and last-verified time separately. A syntactically valid URL is not a verified supplier channel. |
| `parent_business_partner_id` | **Move/derive** | Replace the single parent shortcut with typed `business_partner_relationship` edges. Retain a derived primary hierarchy parent only if a hierarchy type enforces acyclicity and cardinality. |
| `aliases text[]` | **Replace** | Move aliases to typed, effective-dated name/assertion rows with language, script, alias type, source, validity, and search normalization. Arrays cannot carry stewardship evidence. |
| `description` | **Keep** | Keep as bounded internal narrative; do not publish it to MESH by default. |
| `metadata jsonb` | **Harden** | Set a size limit, prohibit protected-value keys, and reserve it for non-authoritative extensions. Searchable or decision-bearing values require typed columns or child tables. |
| `status`, `record_version`, actor/timestamp fields | **Keep** | Make lifecycle transitions function-owned, require reason and idempotency evidence, and emit a versioned outbox event for every accepted state change. |

#### Supplier role and organization/company scope

| Current field or family | Decision | Recommended improvement |
|---|---|---|
| `supplier.business_partner_id`, `supplier_code` | **Keep** | Preserve the thin one-to-one role. Codes remain tenant-local and must not be used as a MESH identity. |
| `supplier_type` | **Harden** | Replace the closed domain with a governed catalog carrying applicability and lifecycle; avoid adding a column for every supplier segment. |
| `supplier.status` | **Move/derive** | Keep the stored operational state, but allow changes only through an activation/lifecycle command that evaluates blocks, required qualifications, company setup, verified bank evidence, and active process cases. Registration approval alone must not activate the supplier. |
| `business_partner_operating_organization_assignment` | **Keep** | Preserve effective-dated role scope. Add exclusion constraints for overlapping active coordinates and require the selected role row to exist. |
| `company_code_supplier_profile.currency_code` | **Harden** | Reference the currency catalog and define whether it is document, settlement, or default ordering currency. Do not use one ambiguous currency for all three. |
| `payment_term_id`, `default_accounting_profile_id`, `default_dimension_set_id` | **Keep** | Retain typed FKs and return display code/name plus effective status in the 360 reader. Validate that referenced configurations are active for the same company. |
| `preferred_remittance_bank_link_id` | **Keep** | Require an active, verified supplier-owned bank link for the same company/purpose; clear or block the preference when verification expires. Never expose the underlying account value in ordinary reads. |
| Supplier qualification and preference scope | **Harden** | Replace the growing set of nullable scope columns with normalized include/exclude rows for operating organization, company, commodity hierarchy, country/region or tax jurisdiction, and department/org unit. Pin hierarchy version and resolution fingerprint. |
| Qualification review/approval fields | **Keep** | Preserve independent reviewer/approver evidence, but link every decision to the exact process case, questionnaire response revisions, attachments, ruleset version, and scope-resolution fingerprint. |
| `next_review_at`, effective dates | **Harden** | Add explicit requalification state, reminder schedule, grace/phase-out dates, and an idempotent expiry job. `next_review_at` alone cannot distinguish scheduled, started, overdue, waived, or completed requalification. |

#### Customer role and organization/company scope

| Current field or family | Decision | Recommended improvement |
|---|---|---|
| `customer.business_partner_id`, `customer_code` | **Keep** | Preserve the thin one-to-one role and tenant-local code. |
| `customer_type` | **Harden** | Use a governed customer-type catalog with applicability; do not encode sales segmentation, credit, or service priority into this field. |
| `customer.is_key_account` | **Replace** | Migrate to `control.customer_account_designation(designation_type='key_account')`, then remove the boolean. The boolean has no organization/company scope, validity, rationale, approval, or revocation evidence. |
| `customer.status` | **Move/derive** | Retain the operational projection, but make `customer_lifecycle_event` the transition evidence and require readiness/credit/block checks in the command. |
| `company_code_customer_profile.currency_code` | **Harden** | Type the business meaning and reference the currency catalog. Sales document, account, and settlement currency must not be conflated. |
| `credit_limit`, `credit_limit_currency_code` | **Replace** | Make the effective approved outcome of `control.customer_credit_review` authoritative. Rename `requested_credit_limit` to distinguish the request from the approved result, add approved amount/currency fields, and expose the current limit through a read-only resolver. |
| `payment_term_id`, accounting and dimension defaults | **Keep** | Validate same-company applicability and resolve display values in the API. Changes should be effective-dated or request-governed when financially material. |
| `statement_cycle_code` | **Harden** | Reference a governed statement-cycle catalog rather than accepting an unverified code. |
| `customer_account_designation` | **Keep** | This is the correct replacement for role-level flags. Extend normalized scope to sales region/territory and org unit; preserve reason, effective dates, independent approval, revocation, idempotency, and overlap protection. |
| `customer_credit_review.conditions jsonb` | **Harden** | Add a strict schema/version/hash, size bound, and typed condition rows for enforceable limits or covenants. JSON may retain a rendered snapshot but must not be the only executable authority. |
| `customer_lifecycle_event.readiness_evidence jsonb` | **Harden** | Store typed references to the credit review, blocks, company profile, required assessments, and ruleset; retain bounded JSON only as an immutable decision snapshot. |

#### Contacts, addresses, identifiers, banking, and evidence

| Field family | Decision | Recommended improvement |
|---|---|---|
| Typed `owner_type` links | **Keep** | Preserve the shared model, but validate role/company purpose compatibility so an address or channel cannot silently serve every context. |
| Contact names, roles, email, and phone | **Harden** | Add consent/legal-basis where required, verification source/time, effective role, language/time zone, and purpose. Keep business contacts separate from `master.person`. |
| Address fields | **Harden** | Add normalized postal validation result/version, deliverability, tax-jurisdiction resolution, and source assertion. Do not overwrite supplier-provided and verified addresses without history. |
| Identifiers and tax registrations | **Keep** | Preserve typed issuer/country/type, validity, uniqueness, masking, and purpose-bound reveal. Add verification method, verified time, and supersession linkage. |
| Bank links and verification | **Keep** | Preserve party/account/link separation. Add verification method, verification expiry, change-risk signal, beneficiary-name match result, and dual-control evidence without storing raw values in workflow payloads. |
| Attachments and certificates | **Keep** | Link answers and lifecycle decisions to immutable attachment versions. Certificate expiry should create a lifecycle signal; it must not directly mutate supplier status. |

### D.2.2 Functions to adopt from the SLP reference

Adopt these functions, expressed through Athyper’s existing control/document/master boundaries:

1. **Reusable modular questionnaires.** Define once, version immutably, target internal or external respondents, and reuse an approved response only while its scope, version, validity, and classification remain compatible.
2. **Context-selected lifecycle processes.** Resolve questionnaires from supplier/customer role plus commodity, geography/jurisdiction, operating organization, company, and org unit. Record the exact resolver inputs, selected versions, exclusions, and fingerprint.
3. **Independent questionnaire approvals.** A process case aggregates questionnaire outcomes, but each questionnaire retains its own respondent, submission revision, reviewer, decision, and evidence.
4. **Expiry, reminders, and re-evaluation.** Store due, reminder, expiry, grace, and next-review schedules explicitly; jobs emit idempotent events instead of editing master status directly.
5. **Supplier and internal perspectives.** External responses and internal assessments share a definition model but use separate assignments, permissions, classifications, and attestations.
6. **Field mapping through governed commands.** A question may propose a typed master-data assertion. It must never map arbitrary answer JSON directly into a table column; validation, survivorship, approval, and audit remain mandatory.
7. **Scoped qualification and preference.** Resolve decisions across commodity and organizational/geographic matrices with explicit inheritance and exclusions. Preserve per-scope outcomes instead of flattening them into one supplier flag.

Do not adopt Ariba’s project identity or reporting limitations. Athyper should keep direct relational links from a lifecycle case to every assigned questionnaire and response revision, enabling one query to explain which evidence produced a qualification or designation decision. SAP’s own reporting documentation notes that some analytical reports cannot show process-project-to-questionnaire relationships; the Athyper model should make that relationship first-class. [Ariba lifecycle reports](https://help.sap.com/docs/buying-invoicing/prepackaged-report-reference/supplier-lifecycle-reports)

## D.3 Prioritized DDL and service improvements

### P0 — Enforce the selected ownership boundary

1. Make NEON Business Partner organization-only. Add an enforced `partner_category = 'organization'` invariant for newly created BPs, migrate person-backed BPs, remove the mandatory `master.person.business_partner_id`, and move workforce request types out of `document.business_partner_request`.
2. Generalize `document.workforce_iam_projection` to a subject-and-engagement model. It must support `external_worker`, use `worker_engagement:<id>` as the source, carry effective dates and company/site/project scope ceilings, and deprovision on engagement, supplier-role, or MESH-relationship suspension.
3. Publish a versioned lifecycle event/outbox contract for BP, role, network-relationship, and worker-engagement changes so MESH and TrustIAM consume replayable facts rather than table-specific integration logic.

### P1 — Add the reusable Business Partner lifecycle layer missing from the present DDL

Use one definition-driven framework for Supplier and Customer processes; do not hard-code every questionnaire into role columns:

| Proposed table family | Responsibility |
|---|---|
| `control.business_partner_process_definition` and `control.business_partner_process_definition_version` | Role-aware registration, qualification, requalification, due-diligence, performance, corrective-action, and offboarding templates |
| `control.business_partner_questionnaire_definition`, `control.business_partner_questionnaire_version`, `control.business_partner_question_definition` | Reusable, immutable-versioned internal/external questionnaires, conditional questions, classifications, and safe proposed-field mappings |
| `control.business_partner_process_scope` | Include/exclude applicability by role, operating organization/company, commodity hierarchy, geography/jurisdiction, department/org unit, and governed segment |
| `document.business_partner_process_case` and `document.business_partner_process_questionnaire` | One supplier/customer lifecycle execution and direct links to every selected questionnaire version |
| `document.business_partner_questionnaire_assignment`, `document.business_partner_questionnaire_response`, and `document.business_partner_question_answer` | Recipient/audience, due/expiry schedule, immutable response revisions, typed answers, attestations, and evidence attachment versions |
| `document.business_partner_process_milestone` | Approval gates, owner, due date, reminder/escalation, expiration, completion, and waiver evidence |

Reuse the existing workflow, comment, attachment, audit, invitation, and request machinery. A lifecycle case may propose a master-data change, qualification, preference, designation, or credit review, but it must not itself become the Supplier/Customer master or decision authority.

Minimum field contract for the new lifecycle layer:

| Record | Required field groups and invariants |
|---|---|
| Process definition/version | Tenant, stable code, applicable role, process kind, immutable version number, content hash, status, effective range, default owner role, workflow definition/version, response due interval, expiry interval, reminder offsets, publication actor/time, and replacement version. Only one published effective version may resolve for a coordinate. |
| Questionnaire definition/version | Tenant, stable code, audience (`internal`/`external`), reuse policy, classification ceiling, immutable version/hash, title/instructions, response validity interval, approval requirement, status, publication evidence, and supersession. Reuse requires the exact version or an explicit compatibility declaration. |
| Question definition | Questionnaire version, stable question code, section/order, localized prompt key, answer type, required flag, classification, choice-set version, validation-rule version, conditional-expression version, optional proposed target field code, and evidence requirement. Published questions are immutable. |
| Process scope | Definition version, include/exclude mode, scope kind, typed scope ID/code, hierarchy mode, hierarchy version, effective range, priority, and resolver fingerprint input. Exactly one typed scope coordinate is allowed per row. |
| Process case | BP and role, process definition/version, initiating request/source, owner, resolved scope fingerprint, opened/due/reminder/expiry/grace times, status, decision, reason, row version, idempotency keys, and audit actors/times. Supplier/customer role existence and tenant ownership are mandatory. |
| Questionnaire assignment | Case, questionnaire version, audience, respondent principal or external contact, due/reminder/expiry times, reuse source response, status, and assignment fingerprint. Exactly one valid respondent coordinate is required. |
| Response revision | Assignment, revision number, status, attestation text/version, submitted actor/source/time, content hash, review decision/reason/actor/time, approval actor/time, and superseded revision. Submitted revisions are append-only. |
| Typed answer | Response revision, question definition, exactly one typed value family, normalized display value, classification, source, assertion time, evidence attachment version, and value hash. Enforce answer type against the pinned question definition. |
| Milestone | Case, stable milestone code, sequence/dependencies, owner role/principal, due/escalation times, status, completion/waiver actor and reason, workflow work-item reference, and evidence reference. Completed or waived milestones are immutable. |

Cross-cutting constraints:

- All foreign keys include `tenant_id`; all runtime tables force RLS and revoke `PUBLIC` access.
- Definition publication, case decisions, response submission, review, expiry, and reuse are idempotent commands with immutable fingerprints.
- JSON is limited to bounded display snapshots or versioned rule inputs. Identity, scope, status, money, dates, decisions, and executable mappings remain typed.
- Answer and evidence classification can only become more restrictive through projection; external questionnaires cannot request fields above their configured classification ceiling.
- A reused response never silently changes a new case. The assignment records its source response, compatibility decision, validity window, and approver.
- Qualification, preference, customer designation, credit, block, readiness, and performance remain separate authorities linked to the case that produced them.

Extend `control.business_partner_qualification` and `control.supplier_preference_designation` with normalized scope rows rather than more nullable columns. The scope should support commodity/category nodes, region or tax jurisdiction, department/org unit, company, and operating organization, including hierarchy inheritance and explicit exclusions. Add requalification due/started/completed events, future-effective phase-out, disqualification reason/evidence, and a read-only resolver that derives overall and per-scope eligibility. Ariba’s model distinguishes these scoped lifecycle decisions and can use qualification/preferred status as sourcing eligibility criteria. [Ariba disqualification](https://help.sap.com/docs/strategic-sourcing/managing-suppliers-and-supplier-lifecycles/5036eb6f301c4ed383d3a526e970d3de.html), [Ariba supplier eligibility criteria](https://help.sap.com/docs/strategic-sourcing/event-rules-reference/supplier-eligibility-criteria)

### P1 — Type the organization and network relationship graphs

1. Add `master.business_partner_relationship_type` with direction, inverse type, allowed source/target roles, cardinality, hierarchy behavior, and cycle policy. Reference it from `master.business_partner_relationship`; add the missing 360/entity-list reader.
2. Keep the MESH buyer-supplier edge, but add `mesh.network_relationship_capability` with controlled capabilities such as `sourcing`, `procurement`, `invoicing`, `payments`, `services_procurement`, and `profile_exchange`. Each capability needs its own requested/active/suspended/ended state, effective dates, initiator, approvals, and document-routing policy.
3. Add `mesh.network_account_endpoint` or an equivalent purpose-bound alias so sourcing and transactional account identifiers can resolve to one `canonical_party_id` without duplicating the NEON BP.
4. Add parent/child network-account links and governed duplicate-account merge/link decisions. Preserve the source account and endpoint on every received profile or document.
5. Generalize invitation/self-nomination to a `potential_relationship` record and allow a PO, RFQ, invoice, payment proposal, or services request to be the invitation trigger. Business Network supports registered-party search, invitations to unregistered suppliers, and document-led quick enablement. [Business Network trading relationships](https://help.sap.com/docs/business-network-for-supply-chain/enabling-suppliers-on-business-network/setting-up-trading-relationships)

### P1 — Complete external-workforce policy controls

Add the following without moving the Person into Business Partner:

| Proposed table family | Responsibility |
|---|---|
| `control.worker_activity_template` and `control.worker_activity_template_item` | Reusable onboarding/offboarding/compliance tasks with dependencies and applicability |
| `document.worker_engagement_activity` | Assigned owner, supplier/buyer responsibility, due date, completion, waiver, evidence, and escalation for one engagement |
| `control.worker_tenure_policy` and `control.worker_tenure_policy_scope` | Effective policy by jurisdiction, legal entity, company/site, org unit, category, and worker type |
| `document.worker_tenure_counter` and `document.worker_tenure_event` | Cross-engagement accumulated duration, required gaps, warning/violation, override reason, and immutable evidence |
| `document.worker_lifecycle_event` | Register, activate, close, replace, no-show, suspend, and reinstate actions, including predecessor/replacement linkage |

Keep commercial term changes in `contingent_work_order_revision` or `statement_of_work_revision`; do not overwrite the worker identity. Fieldglass likewise sends material changes such as dates and bill rate through work-order revisions. [Fieldglass updating worker records](https://help.sap.com/docs/SAP_Fieldglass/3b75472dc6104b0e8224345605250b54/a7d1b013bb2b4c75b6318b60d507c50a.html)

### P2 — Add supplier performance and corrective action

Add `control.supplier_metric_definition`, `document.supplier_performance_period`, `document.supplier_scorecard`, `document.supplier_metric_result`, `document.supplier_survey_response`, and `document.supplier_corrective_action`. Scope them to supplier, organization/company, commodity, contract/category, and evaluation period. Separate measured performance from qualification, preference, readiness, and future risk modules; a resolver may consume them but must retain provenance.

### P2 — Strengthen master-data stewardship and 360 usability

1. Add field-level source assertions and survivorship rules: `control.bp_source_precedence`, `document.bp_field_assertion`, `document.bp_match_candidate`, `document.bp_merge_case`, and immutable merge/split events. `canonical_party_id` correlates records; it does not by itself resolve conflicting values.
2. Add role/scope-aware address and contact usage. The same address/contact may serve legal, ordering, remittance, sales, collections, or workforce purposes for different roles and companies without duplication.
3. Add data-quality issue/remediation records with rule, severity, owner, due date, disposition, and evidence. Completeness percentage alone is insufficient stewardship.
4. Add a role-aware 360 “source and freshness” panel, supplier lifecycle workspace, relationship-capability cards, qualification matrix, and external-workforce engagement roster.
5. Configure Business Activity providers so the 360 view links the master to the procurement/AP, sales/AR, services-procurement, contract, project, and finance facts already present in DDL.

## D.4 What should not be copied from SAP

- Do not add Person as a NEON Business Partner merely to resemble S/4HANA. The cleaner NEON boundary is organization BP plus separately governed People/Workforce identity.
- Do not create a second MESH supplier/customer master. MESH owns network identity, relationship, publication, and transport; NEON owns the recipient-local accepted master.
- Do not copy a large SAP field list into the BP root. Keep common identity small, use typed role/scope extensions, and introduce definition-driven fields only when a governed business process requires them.
- Do not combine qualification, preference, readiness, performance, credit, and risk into one status. Present a derived summary, but retain each decision, scope, evidence, and authority separately.
- Do not make `canonical_party_id` an authentication credential or authorization grant. Keycloak subject binding and TrustIAM projections remain explicit and revocable.

# Appendix E — Current gaps and decisions

1. Configure Business activity providers for procurement, finance/AP, sales/AR, projects, and contracts. The present UI shell correctly reports them unavailable.
2. Decide whether `master.business_partner_relationship` belongs under Governance, Network, or a new Relationships subsection; it currently has no 360 reader.
3. Fold the eight typed request/materialization tables from the active migration into canonical `document/03_tables.sql` so schema inventory has one source of truth.
4. Add display-name joins for payment terms, accounting profiles, dimensions, companies, organizations, and classification catalogs; current role/company cards mostly expose identifiers.
5. Decide whether supplier activation evidence and customer lifecycle events appear as Overview readiness cards or only in Activity.
6. Keep risk out of this Phase 1 representation. Existing party-risk tables are intentionally not Business Partner 360 sources.
7. Publish an explicit BP Administrator entity-operation/field policy before enabling direct record editing; the current 360 contract routes edits through governed requests.
8. Add relationship entity-list descriptors and readers so every relationship family in section 5 can be searched and opened consistently.
9. Add BP-root and role-aware Comments and Attachments tabs over the existing collaboration tables; today only selected evidence/certificate attachment paths are wired into BP 360.
10. Define and implement the external-principal-to-MESH-network-account binding required by supplier and customer self-registration; invitation ownership alone must not imply network-account authority.
11. Enforce one governed `canonical_party_id` correlation across NEON BP, MESH network account, and TrustIAM organization projections, with reconciliation for missing or conflicting links.
12. Decouple `master.person` from mandatory `master.business_partner` ownership and move `add_workforce`, `change_employment`, and candidate registration out of the BP request/UI boundary.
13. Generalize the employee-only workforce IAM projection for `external_worker` subjects with `worker_engagement:<id>` source, effective-date, company, site/project, and supplier/network scope ceilings.
14. Make supplier-role, MESH relationship/account-link, and worker-engagement suspension drive Keycloak/NEON access deprovisioning and `principal.auth_epoch` invalidation.

## E.1 DDL stabilization backlog and build order

This order is mandatory. Do not add questionnaire, performance, or corrective-action features until waves S0–S5 are closed.

| Wave | DDL activity | Current evidence | Exit gate |
|---|---|---|---|
| **S0 — Freeze and reconcile** | Freeze new BP tables; inventory the final schema produced by every active NEON migration; classify each migration object as canonical, intentionally retired, compatibility-only, or missing from canonical DDL. | Eight active typed request/materialization tables from `20260830_neon_business_partner_typed_request_extensions.sql` are not present in canonical `document/03_tables.sql`. Migration scans also report legacy tables later removed by streamlining, which must be classified rather than copied back. | A generated object inventory has an explicit disposition for every BP-related table, domain, constraint, function, trigger, index, policy, and grant. No unexplained migration-only object remains. |
| **S1 — Canonical parity** | Fold the final eight typed request/materialization tables into canonical document DDL, including constraints, FKs, indexes, functions, triggers, RLS, and grants. Fold any other final-state migration-only objects into their owning canonical schema files. | Clean provisioning currently depends on canonical files while upgrade history contains additional final-state BP objects. | A clean disposable database and a database upgraded through the complete manifest expose the same normalized `pg_catalog` model and privilege surface. |
| **S2 — Organization-only boundary** | Inventory person-backed BP rows; decouple `master.person.business_partner_id`; move workforce request types/materialization fields to a People/Workforce request authority; enforce organization-only NEON BP creation; retire person/group BP constraints only after backfill. | **DDL gate implemented.** Person is decoupled; immutable legacy-link evidence preserves retired coordinates; `document.workforce_request` owns onboarding/employment requests; NOT VALID boundary constraints preserve terminal history while rejecting new person/group BP and workforce-shaped BP requests. | No Person requires a BP row, no workforce request writes through BP authority, and every new BP is an organization. Migration has preflight counts, exception output, rollback/forward-fix strategy, and no data loss. |
| **S3 — Remove duplicate Customer authority** | Backfill governed key-account designations, migrate `customer.is_key_account`, make effective approved credit review the credit-limit authority, and turn customer status into a lifecycle-command projection. | **Implemented and upgrade-qualified.** Governed designations and approved/conditional credit-review outcomes are the only writable designation/limit authorities. The tenant-bound lifecycle command is the only writer of Customer status and immutable lifecycle evidence. | One authoritative source exists for designation, effective credit limit, and lifecycle transition. Compatibility views may remain read-only for one release, with usage telemetry and a removal gate. |
| **S4 — Core integrity hardening (built 2026-09-03)** | Supplier/customer type, relationship type, legal form, and statement cycle are active catalog validated; currency/geography retain typed FKs; aliases are authoritative effective-dated child rows; decisions receive normalized typed scope rows; BP authority JSON is bounded; active references, overlap, hierarchy-cycle, and scope-cardinality rules are database enforced. | `business_partner.aliases` remains only as a trigger-maintained read cache for supported clients; direct writes are rejected and application writes use `business_partner_alias`. Flattened scope columns remain immutable compatibility input while normalized rows are the resolution surface. | Closed at DDL level. Upgrade migration `20260903_neon_business_partner_integrity_hardening.sql` backfills aliases/scopes and rejects dirty authority metadata before hardening. |
| **S5 — Security and mutation ownership (certified 2026-09-03)** | Business Partner, Supplier, Customer, and relationship lifecycle changes plus qualification, preference, designation, and credit decisions are command/function-owned. Direct runtime status/decision updates are revoked; the unified evidence ledger has forced RLS, tenant-composite actor/partner FKs, bounded and protected-key-safe JSON, optimistic versions, SoD, idempotency, immutable rows, and atomic versioned outbox publication. | `control.business_partner_mutation_evidence` is the append-only mutation contract. Existing Customer lifecycle events are preserved during upgrade; repositories invoke the lifecycle/decision commands instead of updating authoritative columns. | **Closed.** Clean and upgraded databases each pass 80 role assertions, 17 behavioral probes, four command races, commit/rollback atomicity, and forced-RLS/tenant-FK checks across all 10 governed tables. Normalized S0–S5 catalog and privilege drift is zero. |
| **S6 — Lifecycle/questionnaire foundation** | Add the generic process definition/version, questionnaire definition/version/question, normalized process scope, case, assignment, response revision, typed answer, and milestone tables defined in D.3. | All proposed lifecycle/questionnaire objects are absent. | Definitions are immutable after publication; cases pin exact versions and scope fingerprints; submitted responses are append-only; reusable answers require explicit compatibility and validity evidence. |
| **S7 — Derived decision resolvers** | Add read-only qualification, preference, designation, credit, block, and supplier/customer readiness resolvers. Link each decision to its process case and evidence rather than merging statuses. | Current controls are separate, but no single explainable per-scope resolver contract exists. | For any BP/scope/as-of coordinate, one query returns each independent authority, its provenance, conflicts, expiry, and a deterministic derived eligibility/readiness result. |
| **S8 — Performance and stewardship extensions** | Add scorecards, metric results, corrective actions, source assertions, match/merge cases, and data-quality remediation only after S0–S7 stabilize. | These table families are absent. | Extensions reuse stable BP identity, scope, evidence, security, and lifecycle contracts without adding duplicate master or decision columns. |

Implementation status through 2026-09-03:

- **S0 relation reconciliation is implemented.** `business-partner-ddl-disposition.v1.json` records the explicit exceptions, `business-partner-ddl-inventory.generated.json` inventories all 37 active BP/supplier/customer relations found through the canonical and migration manifests, and `db:verify:business-partner-ddl-parity` rejects an unexplained migration-only relation or a stale inventory.
- **S1 canonical source parity is implemented for BS360-01.** The eight typed request/materialization relations now exist in canonical tables, constraints, indexes, functions, triggers, RLS, and grants. A forward migration aligns function privileges for already-upgraded databases.
- **S0/S1 are certified closed.** A disposable clean canonical NEON build and a disposable upgrade from the supported ledger-backed development baseline both completed on 2026-09-02. The upgrade consumed the complete active manifest, and a second runner pass skipped every applied migration. `db:verify:business-partner-live-catalog-parity` reported zero normalized drift for S0 relation dispositions and the BS360-01 typed-request columns, extension columns, constraint semantics, supporting indexes, RLS, policies, triggers, functions, table owners, table grants, function grants, and comments.
- **Baseline note:** the supported snapshot already contained all 23 external-workforce service objects without the corresponding migration-ledger row. The disposable upgrade database adopted that one verified migration checksum before continuing; the shared development database was not modified. The older pre-ledger Git snapshot is not a supported executable baseline because its historical canonical index source contains orphaned predicates.
- **Scope note:** the broader whole-database drift report can still expose historical differences outside the normalized S0–S5 surfaces. Those are not hidden by this certificate; the live parity gate now covers S0 inventory, S1 typed requests, S2 organization/workforce boundaries, S3 Customer authority, S4 integrity hardening, and S5 security/mutation ownership.
- **S2 DDL authority is implemented and upgrade-qualified.** `20260902_neon_business_partner_organization_boundary.sql` blocks migration when non-terminal workforce/person BP requests exist, captures every retired Person/BP coordinate before dropping the operational column, installs the organization-only and BP-request boundary constraints, and creates the tenant-isolated `document.workforce_request` authority. A clean build, supported-baseline upgrade, normalized S0-S2 catalog comparison, and live negative probes passed on 2026-09-02.
- **S2 application intake and workflow cutover are implemented.** Workforce request creation, lookup, listing, import adaptation, validation, submission, approval/return/rejection, authorization, audit, and outbox publication now execute through the People/Workforce service and `document.workforce_request`. Ruleset-pinned findings are append-only in `document.workforce_request_validation`; submission creates a People-owned workflow stage and work item; maker-checker and optimistic version checks govern decisions. Applying an approved request atomically materializes the applicable Person, Employee, Employment, Work Assignment, and Onboarding Case records and captures an immutable Person snapshot. Business Partner request contracts accept only organization/commercial request kinds, candidate-person intake and acceptance fail closed, Business Partner 360 resolves organizations only, and the NEON workflow UI is exposed under `/people/workforce/requests`. Restricted identity values are read only from published protected content evidence and are rejected from request JSON. No Business Partner materialization fallback remains.
- **S3 Customer authority convergence is implemented and upgrade-qualified.** Governed, effective-dated `control.customer_account_designation` rows replace `master.customer.is_key_account`. Approved or conditional `control.customer_credit_review` outcomes now carry the approved amount, currency, scope, provenance, and effective range; `master.company_code_customer_profile` no longer stores credit authority. `control.command_customer_lifecycle` is now the sole tenant/actor-bound writer of `master.customer.status`: it validates active organization/company scope and activation readiness, serializes per Customer, rejects idempotency collisions, atomically appends the immutable lifecycle event, and projects status. Runtime and administrative roles have no direct Customer-status update or lifecycle-event insert grant. Application repositories invoke the command rather than writing either relation. The clean-versus-supported-baseline normalized S0-S3 catalog and privilege comparison reports zero drift. **S3 is closed.**
- **S5 security and mutation ownership is live-certified.** `control.command_business_partner_lifecycle` owns Business Partner, Supplier, and relationship status; the existing Customer lifecycle command feeds the same S5 evidence/outbox contract. `control.command_business_partner_decision` owns qualification, supplier-preference, customer-designation, and credit decisions. Runtime/admin roles retain request creation and non-authoritative field updates but cannot directly write protected lifecycle or decision columns. Every accepted command is tenant/actor-bound, serialized, stale-version-safe, idempotent, maker/checker enforced, recorded in immutable bounded and protected-key-safe evidence, and paired with `event.outbox` in one transaction. Clean and upgraded disposable databases passed the complete role matrix, negative/security matrix, lifecycle and decision races, atomic commit/rollback bundles, and forced-RLS/tenant-composite-FK inventory on 2026-09-03. Normalized clean-versus-upgrade S0–S5 catalog and privilege parity reports zero drift. Durable evidence is recorded in `policy/reports/business-partner-s5-completion.md`. **S5 is closed.**

### E.1.1 S0 object dispositions required now

| Object family | Required disposition |
|---|---|
| `document.business_partner_request_address` | Fold into canonical document DDL. |
| `document.business_partner_request_contact_person` | Fold into canonical document DDL. |
| `document.business_partner_request_contact_channel` | Fold into canonical document DDL. |
| `document.business_partner_request_identifier` | Fold into canonical document DDL. |
| `document.business_partner_request_tax_registration` | Fold into canonical document DDL. |
| `document.business_partner_request_classification` | Fold into canonical document DDL. |
| `document.business_partner_request_certification` | Fold into canonical document DDL. |
| `document.business_partner_request_materialization_item` | Fold into canonical document DDL. |
| `document.supplier_registration_invitation`, `document.supplier_registration_recovery`, `document.business_partner_invitation_applicant_policy` | Confirm as retired legacy objects; retain only the generalized invitation replacements and forward cleanup migration. Do not restore to canonical DDL. |
| `master.legal_entity_business_partner_link` | Keep only as a read-only compatibility view; all new FKs and queries use `master.legal_entity_internal_partner_link`. |

### E.1.2 Required database-level verification

1. **Canonical build:** create a disposable NEON database only from canonical manifests and run all schema checks.
2. **Upgrade build:** create the previous supported baseline, apply every forward migration once, then apply all rerunnable migrations a second time where idempotency is claimed.
3. **Parity comparison:** normalize and compare tables, columns, types, defaults, generated expressions, constraints, indexes, functions, triggers, RLS policies, owners, grants, and comments between canonical and upgraded databases.
4. **Data migration probes:** seed organization BPs, person-backed legacy rows, dual-role supplier/customers, scoped qualifications, key accounts, credit limits, bank links, and pending workflows before applying boundary migrations; verify row counts and exception ledgers afterward.
5. **Negative integrity probes:** attempt cross-tenant FKs, overlapping effective scopes, hierarchy cycles, duplicate active roles, invalid lifecycle transitions, direct status updates, stale row versions, repeated idempotency keys, self-approval, and protected values in JSON.
6. **Concurrency probes:** race role creation, qualification/preference decisions, customer designation approval, bank change, and lifecycle activation; require one deterministic winner or idempotent replay.
7. **Security probes:** verify forced RLS, `PUBLIC` revocation, least-privilege grants, definer search paths, command-only mutations, and masked/reveal-separated protected values.
8. **Rollback policy:** schema changes remain forward-fix by default. Every destructive contraction requires usage evidence, a compatibility window, preflight counts, backup/restore rehearsal, and explicit approval.

### E.1.3 Stable-foundation completion certificate

The DDL foundation is stable only when all of the following are true:

- S0–S5 are complete; S6+ feature tables are not required for the stability certificate.
- Clean-build and full-upgrade catalog hashes match after normalization.
- The canonical manifest contains no missing final-state BP object and no retired legacy table.
- Every BP table has an owner, tenant-composite FKs, indexes for supported access paths, forced RLS where tenant data is stored, explicit grants, audit rules, and a tested mutation owner.
- Organization BP, Supplier, Customer, Person/Workforce, MESH account, and TrustIAM identity boundaries are mechanically enforced rather than documented conventions.
- Supplier/customer roles, organization/company scope, qualification, preference, designation, credit, block, banking, and lifecycle authorities have no duplicated writable field.
- Disposable integration tests cover clean build, upgrade, backfill, integrity, concurrency, and security—not only SQL source-text matching.

# Appendix F — Removed legacy tables

These are not part of the current model and must not be shown in UI or new integrations:

- `document.supplier_registration_invitation_legacy`
- `document.supplier_registration_recovery`
- `document.business_partner_invitation_applicant_policy`

Their replacements are `document.business_partner_invitation`, `document.business_partner_invitation_recovery`, and centralized authorization policy.
