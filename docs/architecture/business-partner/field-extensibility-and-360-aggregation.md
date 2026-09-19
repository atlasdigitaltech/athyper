# Business Partner field extensibility and 360 aggregation

Status: current implementation boundary and target design

Last verified: 2026-09-06

## Purpose

This document defines when a Business Partner field can be introduced through Meta Entity configuration and when database or server implementation is required. It also explains how Business Partner 360 currently aggregates canonical NEON data and local MESH projections.

The governing principle is:

> Meta Entity defines the semantic contract and approved configuration. Typed NEON materializers and resolvers execute canonical persistence and aggregation.

Meta Entity publication does not authorize arbitrary tenant SQL or writes to unknown database columns.

## Field decision matrix

| Requirement | Persistence | Database/server change? | Tenant publication? |
| --- | --- | --- | --- |
| Request-only information | Pinned Entity Case snapshot | No | Yes |
| Existing canonical field added to a form | Existing approved column or relationship | No, when its mapping exists | Yes |
| New universal Business Partner attribute | `master.business_partner` or canonical relationship | Yes | Yes |
| New tenant-specific authoritative attribute | Governed typed-extension store | Generic extension capability required; individual fields should then be configuration-only | Yes |
| New repeating component or relationship | Typed entity and relationship tables | Yes, unless an approved generic component exists | Yes |
| Calculated or presentation-only field | Resolver output | Only when no approved resolver exists | Usually |

## Request-only fields

Examples include requester comments, an onboarding reason or a tenant-local questionnaire answer that is not authoritative master data.

```text
published form field
  -> pinned Entity Case snapshot
  -> validation and approval history
  -> request and activity presentation
```

These fields do not require a column in `master.business_partner`. They remain attributable to the case and can appear in the Business Partner `requests` section.

## Existing canonical fields

If an approved mapping already exists, Studio can expose the field on another form or surface without changing server code. For example:

```json
{
  "fieldCode": "partner.websiteUrl",
  "binding": {
    "target": "master.business_partner.website_url"
  }
}
```

Publication changes the form and validation contract. The existing materializer continues to own the write.

## New universal canonical fields

A genuinely new shared attribute on `master.business_partner` requires engineering work:

1. Add and migrate the canonical column or relationship.
2. Update the shared field contract and classification.
3. Add an explicit materialization mapping.
4. Update the applicable read and 360 resolver.
5. Add permissions, validation and tests.
6. Publish compatible Meta Entity and case-contract revisions.

The runtime must fail closed when a published mapping names a persistence target it does not recognize.

## Tenant-specific authoritative fields

Tenant-specific fields should not continuously widen `master.business_partner`. The target is a governed typed-extension store with coordinates such as:

```text
tenant_id
business_partner_id
definition_field_id
typed value
classification
effective dates
source case and snapshot
materialization lineage
```

After this generic capability exists, a tenant should be able to publish additional approved scalar fields without a migration for every field. The current runtime supports tenant request-only fields. A new tenant-specific field that must become authoritative still needs an approved persistence capability.

## Repeating and relationship data

Addresses, contacts, communication channels, tax registrations, certifications and bank accounts are not scalar Business Partner columns. They have identity, purpose, primary selection, effective dates, lifecycle, permissions and lineage.

```text
Business Partner
  -> typed relationship
     -> related entity or component
```

A new relationship type requires a typed materializer and 360 resolver unless it reuses an approved generic component.

## Current aggregation architecture

Business Partner 360 is a read-time composition. It is not a second master aggregate and does not persist a duplicate copy of Business Partner data.

```text
Published Meta Entity definition
  |- field, section and classification contract
  |- form and operation descriptors
  |- completeness requirements
  |- governed action metadata
  `- immutable version and hash
                 |
                 v
Business Partner 360 service
  |- tenant, record and scope authorization
  |- role and section applicability
  |- completeness evaluation
  |- masking and response limits
  `- response composition
                 |
                 v
Registered typed resolvers
  `- explicit, reviewed reads from NEON and local MESH projections
```

Meta Entity currently influences what is applicable, visible and complete. It does not dynamically generate the repository SQL joins.

## Aggregation sequence

### Resolve the anchor and scope

The runtime starts from `master.business_partner`, the authenticated tenant and the requested scope. An invisible and a nonexistent record produce the same safe not-found response.

Supported scope coordinates include:

- `operatingOrganizationId`;
- `companyCodeId`;
- `legalEntityId`;
- `roleLens=all|supplier|customer`;
- `asOf=YYYY-MM-DD`.

Invalid scope or a role lens the partner does not hold fails before section data is loaded.

### Determine roles

Supplier and Customer roles come from materialized canonical role tables, not from request answers:

```text
master.business_partner
  |- master.supplier
  `- master.customer
```

Active roles determine whether Supplier company, banking and qualification sections or Customer company and credit sections are applicable.

### Read bounded domain fragments

| Concern | Sources |
| --- | --- |
| Core identity | `master.business_partner` |
| Addresses | `master.address_link`, `master.address` |
| Contacts and channels | `master.contact_person`, `master.contact_link` |
| Identifiers and tax | `master.business_partner_identifier`, `master.business_partner_tax_registration` |
| Roles and organization scope | `master.supplier`, `master.customer`, organization assignments |
| Supplier company | `master.company_code_supplier_profile` |
| Customer company | `master.company_code_customer_profile` |
| Banking | `master.bank_account_link`, `master.bank_account` |
| Qualification and certificates | qualification, preference and block controls; `master.certification` |
| Customer credit | credit review and decision-scope controls |
| Requests and activity | Entity Cases, snapshots, command evidence, lineage and audit activity |
| Network | approved local MESH account links, received snapshots, matches and acceptance projections |

The summary reads only bounded fragments, counts and completeness evidence. Detailed and paginated data is loaded when a section is requested.

## Query responsibilities

### Legacy aggregate

```http
GET /api/neon/business-partners/{businessPartnerId}?operatingOrganizationId={id}
```

This compatibility query returns the canonical partner, roles, company profiles, organization assignments and onboarding cases in one object. New experiences should prefer Business Partner 360.

### 360 summary

```http
GET /api/neon/business-partners/{businessPartnerId}/360/summary
```

The summary supplies identity, roles, primary address/contact, masked identifiers, completeness, open work, recent activity, provenance and an authorized section manifest. Denied sections are omitted instead of being disclosed as inaccessible.

### 360 section

```http
GET /api/neon/business-partners/{businessPartnerId}/360/{section}
```

Section resolvers independently load common, role/company, commercial-control, explainability, business-activity or network data. Paginated sections use an opaque cursor bound to the record, section and snapshot time.

### Restricted reveals

Tax and bank values remain masked during normal aggregation. Reveal is a separate purpose-bound, permission-controlled and replay-protected command. Audit records contain the actor, purpose, resource and expiry but never the value or protected-store token.

## Target descriptor-driven design

Studio should publish references to approved runtime resolvers rather than arbitrary joins:

```json
{
  "section": "banking",
  "resolver": "businessPartner360.banking.v1",
  "roles": ["supplier"],
  "scope": "company",
  "permission": "neon.relationship.business_partner_bank.read_masked",
  "fields": [
    "bankName",
    "countryCode",
    "currencyCode",
    "lastFour",
    "verificationStatus"
  ]
}
```

Studio may select approved resolvers, fields, conditions and presentation. The resolver registry retains control of SQL, temporal behavior, scope validation, classifications and query budgets. Arbitrary tenant SQL remains prohibited.

## Decision rule

Before adding a field, ask whether it must remain authoritative and reusable after the request completes:

- If no, publish a request-only field.
- If yes and an approved canonical mapping exists, reuse it through publication.
- If yes and it is tenant-specific, use the typed-extension capability.
- If yes and it is universally canonical, change the schema, contract, materializer and resolver.
- If it repeats or owns lifecycle, model a typed component or relationship.
