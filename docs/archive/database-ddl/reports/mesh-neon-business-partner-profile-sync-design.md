# Mesh-to-Neon Business Partner Profile Sync - Locked DDL Design

## Decision

Mesh owns the network identity and the partner profile that an account elects to
publish. Neon owns every accepted business-partner record, supplier/customer
role, operational assignment, qualification decision, block, and company-code
accounting profile.

There are no cross-database foreign keys. Mesh publishes a versioned contract;
Neon stores a recipient-local projection and materializes a selected publication
only through an explicit onboarding workflow.

## Authority boundary

| Data | System of record |
|---|---|
| Network account, relationship and published profile | Mesh |
| Published identifiers, addresses, contacts, tax registrations and commodity capabilities | Mesh |
| Business partner and supplier/customer roles | Neon |
| Operating-organization partner assignment | Neon |
| Commodity capability accepted into the tenant master | Neon |
| Qualification, risk decision and blocks | Neon |
| Company-code AP/AR profile | Neon |
| Payment terms, accounting profile, tax determination and credit limit | Neon |
| Bank account offered for settlement | Mesh owner, recipient-specific disclosure |
| Accepted bank account, verification and payment readiness | Neon |

Mesh changes never directly update an accepted Neon master record.

## Locked final table inventory

```text
MESH - source and publisher
|-- mesh.network_account
|-- mesh.network_account_profile
|-- mesh.network_account_identifier
|-- mesh.network_account_commodity_capability
|-- mesh.network_account_tax_registration
|-- master.contact_person
|   `-- master.contact_person_role
|-- master.address / address_link
|-- master.contact_link / contact_email / contact_phone
|-- mesh.network_account_profile_publication
|-- mesh.bank_party
|-- mesh.bank_account
|-- mesh.bank_account_link
|-- mesh.bank_account_disclosure
|-- snapshot.entity_snapshot_identity / entity_snapshot
`-- event.outbox_event / integration_event
                     |
                     | versioned recipient-safe profile publication
                     | and separately authorized bank disclosure
                     v
NEON - recipient projections and review
|-- runtime_meta.mesh_partner_profile_projection
|-- runtime_meta.mesh_bank_account_projection
|-- runtime_meta.integration_checkpoint
|-- document.business_partner_onboarding
`-- document.business_partner_bank_onboarding
                     |
                     | reviewed and atomically materialized
                     v
NEON - authoritative tenant master
|-- master.business_partner
|-- master.supplier / customer
|-- master.business_partner_relationship
|-- master.business_partner_governance_relation
|-- master.business_partner_identifier
|-- master.business_partner_tax_registration
|-- master.business_partner_commodity_capability
|-- master.business_partner_operating_organization_assignment
|-- master.contact_person / contact_person_role
|-- master.contact_person_identity_link (Neon only, optional)
|-- master.address / address_link
|-- master.contact_link / contact_email / contact_phone
|-- master.company_code_supplier_profile
|-- master.company_code_customer_profile
|-- master.bank_party / bank_account / bank_account_link
|-- master.external_reference
|-- master.legal_entity_business_partner_link
|-- master.intercompany_trading_pair
|-- control.business_partner_qualification
`-- control.business_partner_block
```

### Final Neon responsibility split

| Table | Responsibility |
|---|---|
| `master.business_partner` | Canonical local commercial identity |
| `master.supplier` / `master.customer` | Thin AP/procurement and AR/sales roles |
| `master.business_partner_commodity_capability` | Declared commodity capability per `supplier` or `customer` role |
| `master.business_partner_operating_organization_assignment` | Procurement/sales organization that manages the relationship |
| `master.company_code_supplier_profile` | Company-specific AP, payment and remittance defaults |
| `master.company_code_customer_profile` | Company-specific AR, credit and collection defaults |
| `control.business_partner_qualification` | Tenant/org/company/commodity approval decision |
| `control.business_partner_block` | Active operational prohibition at tenant/org/company scope |

`master.supplier_commodity_category` is retired. Both trading directions are
represented by separate rows in
`master.business_partner_commodity_capability`:

```text
partner_role = supplier  -> tenant procures from the partner
partner_role = customer  -> tenant sells to the partner
```

Do not drive commercial eligibility only from `company_code`.
`operating_organization` is the procurement/sales execution boundary;
`company_code` is the statutory accounting and settlement boundary. A
transaction carries both and validates the company through
`master.operating_organization_company_assignment`.

## Mesh source model

### Existing tables retained

```text
mesh.network_account
mesh.network_account_identifier
mesh.network_account_reference
mesh.network_relationship

master.address
master.address_link
master.contact_link
master.contact_email
master.contact_phone

snapshot.entity_snapshot_identity
snapshot.entity_snapshot
```

`master.address_link` and `master.contact_link` use the seeded Mesh
`control.owner_type = network_account`.

The common contact foundation adds:

```text
master.contact_person
master.contact_person_role
```

`master.contact_person` is owner-based. In Mesh its owner is
`mesh.network_account`; after Neon onboarding the new local row is owned by
`master.business_partner`. These are separate plane-local records.

`master.contact_person_role` is only the contact-to-role assignment. Its
`role_code` is validated through the existing tenant-extensible lookup domain:

```text
control.lookup_domain.code = master.contact_role
control.lookup_value       = platform and tenant role values
```

Contact channels are attached through `master.contact_link` with
`owner_type = contact_person`.

The common contact tables are:

```text
master.contact_person
  id
  tenant_id
  owner_type_id
  owner_id
  contact_name
  business_title
  department_name
  is_primary
  metadata
  status and evidence
  creation/update evidence

master.contact_person_role
  id
  tenant_id
  contact_person_id
  role_code
  effective_from
  effective_until
  is_primary
  creation/update evidence
```

Neon may optionally link an internal contact assignment to its natural-person
identity through:

```text
master.contact_person_identity_link
  tenant_id
  contact_person_id
  person_id
  link_type = same_person
  effective_from
  effective_until
  creation evidence
```

There is no direct contact-to-employee or contact-to-principal FK. Neon resolves
an internal employee/login through `contact_person -> person -> employee ->
principal`. External Mesh/business-partner contacts have no identity-link row.

### New Mesh tables

#### `mesh.network_account_profile`

One current editable profile per network account.

```text
tenant_id                    uuid
network_account_id           uuid              PK with tenant_id
legal_form                   text              nullable
incorporation_date           date              nullable
website_url                  text              nullable
description                  text              nullable
preferred_language_code      text              nullable
profile_completeness_pct     smallint          worker-maintained
sharing_visibility           profile_visibility_d
status                       profile_status_d
status evidence
creation/update evidence
```

Identity fields already present on `mesh.network_account` are not duplicated:
`account_code`, `display_name`, `legal_name`, `network_role`, `country_code`,
and `default_currency`.

#### `mesh.network_account_commodity_capability`

```text
id                           uuid
tenant_id                    uuid
network_account_id           uuid
commodity_code               text
trade_role                   supplier | customer
effective_from               date
effective_until              date nullable
status                       active | inactive
status evidence
creation/update evidence
```

`trade_role = supplier` means the account supplies the commodity to another
network participant. `trade_role = customer` means it purchases that commodity.
Both directions are represented by two rows.

Mesh uses a stable published commodity code because Mesh and Neon are separate
databases. Neon resolves that code to its tenant-local
`master.commodity_category`.

#### `mesh.network_account_tax_registration`

```text
id                           uuid
tenant_id                    uuid
network_account_id           uuid
country_code                 char(2)
registration_type_code       text
registration_number          text
issuing_authority            text nullable
effective_from               date nullable
effective_until              date nullable
verified_at                  timestamptz nullable
status                       active | inactive | revoked
creation/update evidence
```

One row represents one registration. VAT, GST, sales-tax and other identifiers
are not separate columns.

#### `mesh.network_account_profile_publication`

Immutable publication header for a composed profile.

```text
id                           uuid
tenant_id                    uuid
network_account_id           uuid
snapshot_id                  uuid
publication_version          bigint
contract_version             integer
payload_hash                 text
visibility                   private | relationship | connected | public
published_at / published_by
withdrawn_at / withdrawn_by  nullable evidence pair
status                       published | withdrawn | superseded
```

The payload is stored once in the existing generic
`snapshot.entity_snapshot`. It contains the permitted account header,
identifiers, addresses, contacts, tax registrations, certifications and
commodity capabilities. It excludes IAM identities, unrestricted metadata,
bank-account secrets, qualification decisions, internal risk data and private
documents.

Only one current published row is allowed per network account. Publication and
withdrawal emit an outbox event in the same database transaction.

### Mesh bank and disclosure model

Bank data is not embedded in `mesh.network_account_profile_publication`. A
network account discloses a selected settlement account only to an authorized
counterparty through an active relationship.

#### `mesh.bank_party`

Bank institution or branch identity:

```text
id
tenant_id                    nullable only for platform registry entries
code
name
country_code
institution_type
bic
national_bank_code_type / national_bank_code
branch_code / branch_name
clearing capabilities
status and evidence
```

#### `mesh.bank_account`

Network-account-owned settlement instruction:

```text
id
tenant_id
network_account_id
bank_party_id                nullable when override identity is supplied
account_holder_name
account_id_type              iban | local
account_identifier_token     secure-vault/token reference
account_fingerprint          non-reversible duplicate/change detector
account_last4
currency_code
bank identity overrides
provider_account_ref
verification evidence
status                       draft | pending_verification | active |
                             suspended | retired
status and creation/update evidence
```

The raw account identifier is not readable from ordinary application SQL and is
never placed in a general profile or event payload.

#### `mesh.bank_account_link`

Defines purpose, primary selection and effective range for an account owned by
the network account.

#### `mesh.bank_account_disclosure`

Explicit recipient grant:

```text
id
tenant_id
network_account_id
bank_account_id
network_relationship_id
disclosed_to_account_id
purpose                      settlement | refund
disclosure_version
payload_hash
disclosed_at / disclosed_by
expires_at
revoked_at / revoked_by
status                       active | expired | revoked | superseded
creation/update evidence
```

The account owner, relationship supplier and disclosed-to buyer must match. A
disclosure event contains masked bank identity plus a signed, short-lived secure
retrieval coordinate; it never contains the raw account number.

### Mesh event contract

Add a generic append-only outbox/event foundation in the new Mesh path:

```text
event.outbox_event
event.integration_event
```

Partner-profile event types:

```text
mesh.partner_profile.published
mesh.partner_profile.updated
mesh.partner_profile.withdrawn
mesh.partner_profile.suspended
mesh.bank_account.disclosed
mesh.bank_account.changed
mesh.bank_account.revoked
```

Each recipient event carries only:

```text
event_id
sequence_no
source_tenant_id
network_account_id
network_account_code
network_relationship_id nullable
publication_id
publication_version
contract_version
payload_hash
snapshot payload or signed retrieval coordinate
occurred_at
```

Events are recipient-filtered by publication visibility and active network
relationship. A private internal snapshot is never placed directly on the
cross-tenant stream.

## Neon projection and onboarding model

### `runtime_meta.mesh_partner_profile_projection`

Recipient-local mirror of the latest Mesh publication.

```text
id                              uuid
tenant_id                       uuid
source_system_code              text fixed to athyper_mesh
source_tenant_id                uuid
mesh_network_account_id         uuid
mesh_network_account_code       text
mesh_network_relationship_id    uuid nullable
publication_id                  uuid
publication_version             bigint
contract_version                integer
payload_hash                    text
profile_payload                 jsonb
published_at                    timestamptz
received_at                     timestamptz
last_event_id                   uuid
last_sequence_no                bigint
linked_business_partner_id      uuid nullable
last_applied_version            bigint nullable
last_applied_hash               text nullable
sync_state                      available | onboarding | linked |
                                update_available | withdrawn | error
sync_error                      text nullable
created_at / updated_at
```

Required uniqueness:

```text
UNIQUE (tenant_id, mesh_network_account_id)
UNIQUE (tenant_id, last_event_id)
```

The projection accepts an event only when its sequence/version is newer.
Duplicate or out-of-order delivery is harmless. Payload hash and contract
version are validated before replacement.

The projection is not business master data and is not referenced by finance
documents.

### `runtime_meta.mesh_bank_account_projection`

Recipient-local mirror of a currently disclosed Mesh settlement instruction:

```text
id
tenant_id
mesh_profile_projection_id
mesh_bank_account_id
mesh_disclosure_id
disclosure_version
payload_hash
account_holder_name
account_id_type
account_last4
account_fingerprint
currency_code
bank_name / country / bic
secure_retrieval_reference
disclosed_at / expires_at
last_event_id / last_sequence_no
linked_bank_account_id        nullable
sync_state                    available | onboarding | linked |
                              change_pending | revoked | expired | error
created_at / updated_at
```

No raw account identifier is stored in this projection.

### `runtime_meta.integration_checkpoint`

Generic consumer checkpoint:

```text
consumer_code
stream_code
last_sequence_no
last_event_id
updated_at
```

Unique on `(consumer_code, stream_code)`.

### `document.business_partner_onboarding`

Neon-owned review and materialization workflow.

```text
id                              uuid
tenant_id                       uuid
mesh_profile_projection_id      uuid
source_publication_version      bigint
source_payload_hash             text
requested_partner_role          supplier | customer
operating_organization_id       uuid
company_code_id                 uuid nullable
matched_business_partner_id     uuid nullable
created_business_partner_id     uuid nullable
onboarding_payload              jsonb
validation_report               jsonb
status                          draft | pending_review | approved |
                                rejected | applying | applied | failed |
                                cancelled
submitted_at / submitted_by     nullable evidence pair
approved_at / approved_by       nullable evidence pair
applied_at / applied_by         nullable evidence pair
failure_code / failure_detail   nullable
creation/update evidence
```

The onboarding row pins one publication version and hash. Later Mesh updates do
not silently change an in-flight review.

An approved onboarding is applied by one guarded, idempotent database function.
It either commits every required Neon record or commits none.

### `document.business_partner_bank_onboarding`

Separate bank review with segregation of duties:

```text
id
tenant_id
business_partner_id
supplier_id
mesh_bank_projection_id
parent_partner_onboarding_id  nullable
source_disclosure_version
source_payload_hash
company_code_id               nullable
proposed_bank_account_id      nullable
proposed_bank_account_link_id nullable
validation_report
status                        draft | pending_review | approved | rejected |
                              verifying | applied | failed | cancelled
submitted evidence
approved evidence
verified evidence
applied evidence
failure details
creation/update evidence
```

Approval creates a Neon `master.bank_account` in `pending_verification` and a
beneficiary `master.bank_account_link`. Independent Neon verification is
required before the account becomes `active` or can be selected as the
supplier's preferred remittance account.

`master.bank_account_house_config` is not used for supplier/customer accounts.
It remains Neon-only configuration for tenant/company-owned holder or
operational bank accounts, GL linkage, payment-file usage and reconciliation.

### Existing Neon mapping table

Use `master.external_reference`; do not add a second source-binding table.

```text
owner                         master.business_partner
source_system_code            athyper_mesh
external_entity_code          network_account
external_id                   Mesh network_account UUID
external_code                 Mesh account_code
```

Only one active Mesh-account mapping is allowed per Neon tenant. The external
reference is the durable reconciliation coordinate after onboarding.

## Materialization mapping

| Published Mesh data | Neon target |
|---|---|
| Account header | `master.business_partner` |
| Selected supplier role | `master.supplier` |
| Selected customer role | `master.customer` |
| Account identifiers | `master.business_partner_identifier` |
| Postal addresses | `master.address` + `master.address_link` |
| Named contacts and roles | `master.contact_person` + `master.contact_person_role` |
| Contact channels | `master.contact_link` and channel enrichment |
| Tax registrations | `master.business_partner_tax_registration` |
| Commodity capabilities | `master.business_partner_commodity_capability` |
| Mesh source identity | `master.external_reference` |
| Selected operating organization | `master.business_partner_operating_organization_assignment` |
| Disclosed bank institution | matched/created `master.bank_party` |
| Approved settlement account | `master.bank_account` + beneficiary `master.bank_account_link` |

Mesh `network_role = both` does not automatically create both Neon roles.
The onboarding request explicitly selects supplier or customer; the other role
can be onboarded later against the same business partner.

## Neon-owned data that is never mirrored

```text
master.company_code_supplier_profile
master.company_code_customer_profile
control.business_partner_qualification
control.business_partner_block
master.party_risk_assessment and evidence
payment terms and methods
accounting/tax determination profiles
credit limits and collection policy
bank verification and payment readiness
internal notes, classifications and metadata
```

Mesh currency, tax, address and identifier values are suggestions/source
evidence until Neon approves them.

Mesh bank verification is source evidence only. It does not satisfy Neon
verification or automatically populate
`master.company_code_supplier_profile.preferred_remittance_bank_link_id`.

## Post-onboarding update rule

1. Mesh publishes a newer profile version.
2. Neon updates only `runtime_meta.mesh_partner_profile_projection`.
3. If it is linked, Neon marks `sync_state = update_available`.
4. UI compares the new publication against the linked Neon business partner.
5. A user accepts selected changes through a new onboarding/update review.
6. Accepted changes create a new generic entity snapshot before master update.

Withdrawal, relationship termination or account suspension does not delete or
deactivate Neon master data. It updates projection state and can open a review
or block recommendation according to Neon policy.

A changed Mesh bank fingerprint always creates `change_pending` and a new bank
onboarding review. It never mutates an active Neon bank account identifier.
After approval and verification, the company-code supplier profile can switch
to the new link; the old link is then ended rather than overwritten.

## Transaction-selection rule

For supplier procurement:

```text
linked Mesh account
  -> Neon business partner has supplier role
  -> active operating-organization assignment
  -> matching commodity capability
  -> applicable qualification approved
  -> no applicable active block
  -> company-code supplier profile exists
  -> procurement/AP transaction allowed
```

The customer/sales path applies the equivalent customer role and company-code
customer profile.

## Security and hardening

- Force tenant RLS on every Neon projection/onboarding row.
- Mesh cross-tenant profile reads are allowed only through publication/event
  functions, never direct owner-table grants.
- Event consumers cannot supply a Neon tenant context arbitrarily; the recipient
  is resolved from the active Mesh relationship/account mapping.
- All application-facing sync functions bind to `shared.current_tenant_id()`.
- No direct application insert/update grants on projection identity coordinates.
- Publication payload size, JSON object shape, contract version and hash are
  constrained.
- Bank disclosure is relationship- and recipient-bound, short-lived and
  revocable.
- Raw bank identifiers are excluded from general JSON/event payloads and
  ordinary application SELECT grants.
- Partner-profile approval and bank approval use separate permission checks;
  bank changes support maker-checker segregation.
- Onboarding materialization uses advisory locking on
  `(tenant_id, mesh_network_account_id)`.
- Generic snapshots capture the source version and accepted Neon result.

## Locked implementation wave

1. Add the common contact-person tables, contact-role lookup domain/values and
   owner-type seeds for all three planes.
2. Add Mesh profile/tax/commodity/publication domains and tables.
3. Add Mesh bank-party/account/link/disclosure tables and secure functions.
4. Add Mesh constraints, indexes, publication functions, immutable publication
   guards, forced RLS, grants and manifest entries.
5. Add the generic Mesh event outbox/stream foundation.
6. Add Neon partner/bank projections, checkpoint and onboarding tables.
7. Add Neon idempotent ingestion, comparison and materialization functions.
8. Add the finalized Neon business-partner tables from the party-foundation
   design.
9. Add reference seeds and permissions.
10. Validate clean builds for Mesh and Neon, replay/out-of-order delivery,
   cross-tenant isolation, duplicate onboarding and post-onboarding update
   behavior, unauthorized bank disclosure, revoked disclosures, bank-change
   maker-checker enforcement and immutable active bank identifiers.
