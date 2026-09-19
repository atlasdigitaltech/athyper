# Business Partner 360: child-entity model and publication boundary

Status: recommended target model based on a source review on 2026-09-19. This is not a claim that every section is already a standalone published meta entity.

## Current finding

Business Partner 360 is a hybrid implementation. The Business Partner record and some presentation configuration are published, but Neon currently owns the section registry fallback, API routes, SQL readers, redaction, context checks, and materialization rules. Address and Certification are child collections; neither has an active standalone `runtime_meta.entity_descriptor` in the local Neon runtime.

The default fallback panel is currently code-defined in [panel-definition.ts](../../../packages/planes/neon/business-partner/src/360/panel-definition.ts). The readers are code-defined in [kysely-business-partner-360-sections.ts](../../../server/packages/services/master-data/src/kysely-business-partner-360-sections.ts), [kysely-business-partner-360-role-sections.ts](../../../server/packages/services/master-data/src/kysely-business-partner-360-role-sections.ts), and [kysely-business-partner-360-commercial-controls.ts](../../../server/packages/services/master-data/src/kysely-business-partner-360-commercial-controls.ts). Published record presentation can control labels, placement, and field/surface presentation; it must not replace those server controls.

## Current child-table map

| 360 area | Current Neon tables and projections | Current implementation owner | Recommended publication level |
| --- | --- | --- | --- |
| Identity | `master.business_partner`, `business_partner_alias`, `business_partner_industry_classification`, `external_reference` | Neon reader and policy | Published root fields plus identity child collection |
| Contacts | `master.contact_person`, `contact_person_role`, `contact_link`, `contact_email`, `contact_phone` | Neon reader; contact privacy and effective-date rules | Published child surface; Neon-owned resolver and validation |
| Addresses | `master.address`, `address_link`, `address_event`; request draft `document.business_partner_request_address` | Neon reader, normalization, primary-address and materialization rules | Published child surface; Neon-owned address handler |
| Identifiers and tax | `business_partner_identifier`, `business_partner_tax_registration` | Neon reader; restricted-value reveal path | Published child surface and masking metadata; Neon-owned reveal handler |
| Governance | `business_partner_relationship`, `business_partner_governance_relation` | Neon reader and effective-date rules | Published child collection and relationship presentation |
| Roles and organization scope | `supplier`, `customer`, `business_partner_operating_organization_assignment` | Neon context/role reader and capability validation | Published role workspace; Neon-owned eligibility resolver |
| Supplier by Company Code | `company_code_supplier_profile`, plus `supplier` and effective organization assignment | Neon reader and accounting/payment validation | Published company-profile surface; Neon command handler |
| Customer by Company Code | `company_code_customer_profile`, `control.customer_account_designation`, decision scopes, plus `customer` | Neon reader and commercial-policy validation | Published company-profile surface; Neon command handler |
| Banking | `bank_account_link`, `bank_account`, `bank_account_usage`, `bank_account_company_usage`, verification records | Neon reader, protected-value reveal, company eligibility and disclosure logic | Published summary surface only; Neon-owned sensitive-data handler |
| Attachments | `document.attachment_series`, `attachment`, `attachment_link`, `attachment_folder`, derivative and legal-hold records | Neon document service owns upload, scan, versioning, link guard, download and retention | Published child surface and attachment policy; Neon-owned document handler |
| Qualifications, commodity capability, certification | `business_partner_commodity_capability`, `control.business_partner_qualification`, `business_partner_decision_scope`, `certification`, `certification_type`, attachments | Neon reader, qualification admission, attachment and effective-date checks | Published child surfaces; Neon-owned qualification/certification handlers |
| Credit and risk | `party_risk_assessment`, dimension scores, evidence, drivers, mitigations, review events | Neon reader and risk-policy controls | Published read surface; dedicated risk service controls writes |
| Requests, activity and materialization | `document.entity_case`, snapshots, command evidence, validation, materialization and audit records | Neon governed-case service | Published navigation/presentation; Neon-owned lifecycle and evidence |
| Network | Mesh received-profile, match and acceptance projections | Mesh/Neon boundary adapter | Published availability/label metadata; Mesh disclosure contract remains authoritative |

## Recommended Business Partner aggregate

```text
Business Partner [tenant-wide canonical identity]
├── Identity and legal profile
│   ├── aliases, identifiers, tax registrations, classifications
│   ├── governance relationships and external references
│   └── addresses and contacts
├── Supplier role [one role identity per Business Partner]
│   ├── Operating Organization participation [effective dated]
│   ├── Company Code supplier profile [one per Supplier + Company Code]
│   ├── procurement capability, qualification and commodity controls
│   └── banking usage and remittance eligibility
├── Customer role [one role identity per Business Partner]
│   ├── Operating Organization participation [effective dated]
│   ├── Company Code customer profile [one per Customer + Company Code]
│   ├── sales designations and commercial eligibility
│   └── credit and risk controls
└── Shared compliance evidence
    ├── certifications and supporting attachments
    └── scoped applicability by Company Code and, when needed, derived Operating Organization eligibility
```

`Business Partner` itself remains Type C tenant-wide. It must not receive a synthetic Company Code or Operating Organization owner merely to make the 360 screen filterable. Supplier and Customer are role identities. Company and Operating Organization data are effective, separately authorized extensions.

## Scope and eligibility model

| Layer | Persisted coordinate | Rule |
| --- | --- | --- |
| Base Business Partner | `tenant_id`, Business Partner ID | Tenant-wide identity. Global LE changes do not rewrite it. |
| Supplier / Customer role | Role ID plus Business Partner ID | A role is necessary but does not provide Company Code or Operating Organization authority. |
| Operating Organization participation | `business_partner_operating_organization_assignment`: Business Partner, Organization, `partner_role`, effective dates | Supplier requires an active `procurement` capability; Customer requires an active `sales` capability. This is the admission edge for operational activity. |
| Company profile | Supplier/Customer role ID plus Company Code ID | Profile stores company-specific finance/commercial defaults. It is valid only when the user, Company Code, role participation, and applicable Operating Organization are all eligible. |
| Legal Entity | Derived from the selected/persisted Company Code, when Company Code exists | Legal Entity is never inferred from every company served by a shared Operating Organization. |
| Address | Address is canonical; `address_link` gives owner, purpose, primary flag and effective dates | An address normally applies to the tenant-wide BP. A company-specific correspondence address needs an explicit address-link scope rule; do not duplicate canonical addresses per Company Code. |
| Certification | Certification has optional `company_code_id`; null applies to the whole owner | Operating Organization eligibility is derived through the selected Company Code and role participation. Add a direct Organization scope only when a business rule cannot be represented by Company Code plus role participation. |

For every supplier/company workspace action, Neon should admit this complete coordinate together:

```text
principal has command permission and scope
AND selected Legal Entity owns selected Company Code
AND Company Code is active
AND Supplier role is active
AND Supplier has effective procurement participation in selected Operating Organization
AND selected Operating Organization has an active assignment to selected Company Code
AND supplier Company Code profile is absent for creation or belongs to the same Supplier + Company Code
```

The customer path is the same, substituting Customer role, sales capability, customer profile, and customer designation rules.

## What Studio should publish

Studio should publish declarative metadata only. The target is an entity descriptor with a versioned `businessContext` extension and child-surface declarations.

```json
{
  "businessContext": {
    "scopeKind": "tenant",
    "extensions": [
      {
        "key": "supplier_organization_participation",
        "scopeKind": "organization",
        "requiredCapability": "procurement",
        "requiredCoordinates": ["legalEntityId", "operatingOrganizationId"]
      },
      {
        "key": "supplier_company_profile",
        "scopeKind": "company",
        "requiredCapability": "procurement",
        "requiredCoordinates": ["legalEntityId", "companyCodeId", "operatingOrganizationId"]
      }
    ]
  },
  "childCollections": [
    {
      "key": "addresses",
      "owner": "business_partner",
      "presentation": "address-link.v1",
      "handlerKey": "neon.business_partner.address.v1"
    },
    {
      "key": "certifications",
      "owner": "business_partner",
      "presentation": "certification.v1",
      "handlerKey": "neon.business_partner.certification.v1"
    }
  ]
}
```

Publishable properties include labels, help text, field order, form/list layout, visible columns, supported actions, required context coordinates, required capabilities, standard views, draft-change policy, and resolver/handler keys. Studio may declare that an action requires `procurement`; it cannot decide that a user has procurement authority.

### Complete child-collection descriptor example

The following is a review sample of the proposed `childCollections` section in
the published Business Partner descriptor. `sourceObjects` documents the Neon
storage/projection behind the surface; it is not a browser query instruction.
The browser receives a bounded response from `readHandlerKey`, and mutations
are accepted only by `writeHandlerKey` after server-side authorization and
validation.

```json
{
  "childCollections": [
    {
      "key": "contacts",
      "label": "Contacts",
      "owner": "business_partner",
      "sourceObjects": [
        "master.contact_person",
        "master.contact_person_role",
        "master.contact_link",
        "master.contact_email",
        "master.contact_phone"
      ],
      "presentation": "contact-person.v1",
      "readHandlerKey": "neon.business_partner.contact.read.v1",
      "writeHandlerKey": "neon.business_partner.contact.write.v1",
      "scope": { "kind": "tenant", "requiredCoordinates": [] },
      "rules": ["effective_dates", "primary_contact", "contact_privacy", "channel_verification"]
    },
    {
      "key": "addresses",
      "label": "Addresses",
      "owner": "business_partner",
      "sourceObjects": [
        "master.address",
        "master.address_link",
        "master.address_event",
        "document.business_partner_request_address"
      ],
      "presentation": "address-link.v1",
      "readHandlerKey": "neon.business_partner.address.read.v1",
      "writeHandlerKey": "neon.business_partner.address.write.v1",
      "scope": { "kind": "tenant", "requiredCoordinates": [] },
      "rules": ["country_subdivision_postal_validation", "normalization", "duplicate_detection", "primary_address", "effective_dates", "governed_materialization"]
    },
    {
      "key": "identifiers",
      "label": "Identifiers",
      "owner": "business_partner",
      "sourceObjects": ["master.business_partner_identifier"],
      "presentation": "business-partner-identifier.v1",
      "readHandlerKey": "neon.business_partner.identifier.read.v1",
      "writeHandlerKey": "neon.business_partner.identifier.write.v1",
      "scope": { "kind": "tenant", "requiredCoordinates": [] },
      "rules": ["effective_dates", "verification", "restricted_value_masking"]
    },
    {
      "key": "taxRegistrations",
      "label": "Tax registrations",
      "owner": "business_partner",
      "sourceObjects": ["master.business_partner_tax_registration"],
      "presentation": "business-partner-tax-registration.v1",
      "readHandlerKey": "neon.business_partner.tax.read.v1",
      "writeHandlerKey": "neon.business_partner.tax.write.v1",
      "scope": { "kind": "company", "requiredCoordinates": ["legalEntityId", "companyCodeId"] },
      "rules": ["jurisdiction_validation", "effective_dates", "highly_restricted_value_masking"]
    },
    {
      "key": "governanceRelationships",
      "label": "Governance",
      "owner": "business_partner",
      "sourceObjects": ["master.business_partner_relationship", "master.business_partner_governance_relation"],
      "presentation": "business-partner-governance.v1",
      "readHandlerKey": "neon.business_partner.governance.read.v1",
      "writeHandlerKey": "neon.business_partner.governance.write.v1",
      "scope": { "kind": "tenant", "requiredCoordinates": [] },
      "rules": ["relationship_integrity", "effective_dates", "privacy_classification"]
    },
    {
      "key": "supplierOrganizationParticipation",
      "label": "Supplier organization participation",
      "owner": "supplier_role",
      "sourceObjects": ["master.supplier", "master.business_partner_operating_organization_assignment"],
      "presentation": "partner-organization-participation.v1",
      "readHandlerKey": "neon.business_partner.supplier.organization.read.v1",
      "writeHandlerKey": "neon.business_partner.supplier.organization.write.v1",
      "scope": { "kind": "organization", "requiredCoordinates": ["legalEntityId", "operatingOrganizationId"], "requiredCapability": "procurement" },
      "rules": ["supplier_role_active", "effective_dates", "organization_procurement_capability", "organization_company_assignment"]
    },
    {
      "key": "supplierCompanyProfiles",
      "label": "Supplier company profiles",
      "owner": "supplier_role",
      "sourceObjects": ["master.company_code_supplier_profile"],
      "presentation": "supplier-company-profile.v1",
      "readHandlerKey": "neon.business_partner.supplier.company.read.v1",
      "writeHandlerKey": "neon.business_partner.supplier.company.write.v1",
      "scope": { "kind": "company", "requiredCoordinates": ["legalEntityId", "companyCodeId", "operatingOrganizationId"], "requiredCapability": "procurement" },
      "rules": ["supplier_organization_participation", "organization_company_assignment", "accounting_profile", "payment_terms", "remittance_bank_eligibility"]
    },
    {
      "key": "customerOrganizationParticipation",
      "label": "Customer organization participation",
      "owner": "customer_role",
      "sourceObjects": ["master.customer", "master.business_partner_operating_organization_assignment"],
      "presentation": "partner-organization-participation.v1",
      "readHandlerKey": "neon.business_partner.customer.organization.read.v1",
      "writeHandlerKey": "neon.business_partner.customer.organization.write.v1",
      "scope": { "kind": "organization", "requiredCoordinates": ["legalEntityId", "operatingOrganizationId"], "requiredCapability": "sales" },
      "rules": ["customer_role_active", "effective_dates", "organization_sales_capability", "organization_company_assignment"]
    },
    {
      "key": "customerCompanyProfiles",
      "label": "Customer company profiles",
      "owner": "customer_role",
      "sourceObjects": ["master.company_code_customer_profile", "control.customer_account_designation", "control.business_partner_decision_scope"],
      "presentation": "customer-company-profile.v1",
      "readHandlerKey": "neon.business_partner.customer.company.read.v1",
      "writeHandlerKey": "neon.business_partner.customer.company.write.v1",
      "scope": { "kind": "company", "requiredCoordinates": ["legalEntityId", "companyCodeId", "operatingOrganizationId"], "requiredCapability": "sales" },
      "rules": ["customer_organization_participation", "organization_company_assignment", "customer_designation", "accounting_profile", "payment_terms"]
    },
    {
      "key": "banking",
      "label": "Banking",
      "owner": "business_partner",
      "sourceObjects": ["master.bank_account_link", "master.bank_account", "master.bank_account_usage", "master.bank_account_company_usage"],
      "presentation": "business-partner-banking.v1",
      "readHandlerKey": "neon.business_partner.bank.read.v1",
      "writeHandlerKey": "neon.business_partner.bank.write.v1",
      "scope": { "kind": "company", "requiredCoordinates": ["legalEntityId", "companyCodeId"], "requiredCapability": "finance" },
      "rules": ["protected_value_reveal", "bank_verification", "company_eligibility", "remittance_usage", "effective_dates"]
    },
    {
      "key": "qualifications",
      "label": "Qualifications and commodity capability",
      "owner": "supplier_role",
      "sourceObjects": ["master.business_partner_commodity_capability", "control.business_partner_qualification", "control.business_partner_decision_scope"],
      "presentation": "supplier-qualification.v1",
      "readHandlerKey": "neon.business_partner.qualification.read.v1",
      "writeHandlerKey": "neon.business_partner.qualification.write.v1",
      "scope": { "kind": "organization", "requiredCoordinates": ["legalEntityId", "operatingOrganizationId"], "requiredCapability": "procurement" },
      "rules": ["commodity_scope", "qualification_decision", "effective_dates"]
    },
    {
      "key": "certifications",
      "label": "Certifications",
      "owner": "business_partner",
      "sourceObjects": ["master.certification", "master.certification_type", "document.business_partner_request_certification"],
      "presentation": "certification.v1",
      "readHandlerKey": "neon.business_partner.certification.read.v1",
      "writeHandlerKey": "neon.business_partner.certification.write.v1",
      "scope": { "kind": "company_optional", "requiredCoordinates": [] },
      "rules": ["type_or_custom_name", "effective_dates", "attachment_admissibility", "company_applicability", "governed_materialization"]
    },
    {
      "key": "attachments",
      "label": "Attachments",
      "owner": "business_partner",
      "sourceObjects": [
        "document.attachment_series",
        "document.attachment",
        "document.attachment_link",
        "document.attachment_folder",
        "document.attachment_derivative",
        "document.attachment_legal_hold"
      ],
      "presentation": "attachment-collection.v1",
      "readHandlerKey": "neon.document.attachment.read.v1",
      "writeHandlerKey": "neon.document.attachment.write.v1",
      "scope": { "kind": "inherited_from_owner", "requiredCoordinates": [] },
      "ownerBinding": {
        "entityTypes": ["business_partner", "master.business_partner"],
        "linkKinds": ["context", "evidence", "supporting_document"],
        "entityIdSource": "persisted_business_partner_id"
      },
      "attachmentPolicy": {
        "allowedContentTypes": ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        "maxFileBytes": 26214400,
        "requireVirusScan": true,
        "requireCurrentSeriesVersion": true,
        "allowDownload": true,
        "allowDelete": "draft_or_unlinked_only",
        "allowReplace": "new_attachment_version_only",
        "retentionPolicyKey": "business_partner_evidence.v1",
        "legalHoldAware": true
      },
      "rules": ["owner_authorization", "attachment_link_guard", "virus_scan", "quarantine_and_expiry", "immutable_version_history", "legal_hold", "download_disclosure"]
    },
    {
      "key": "creditRisk",
      "label": "Credit and risk",
      "owner": "business_partner",
      "sourceObjects": ["master.party_risk_assessment", "master.party_risk_dimension_score", "master.party_risk_evidence", "master.party_risk_driver", "master.party_risk_mitigation", "master.party_risk_review_event"],
      "presentation": "business-partner-credit-risk.v1",
      "readHandlerKey": "neon.business_partner.risk.read.v1",
      "writeHandlerKey": "neon.business_partner.risk.write.v1",
      "scope": { "kind": "company_optional", "requiredCoordinates": [] },
      "rules": ["risk_policy", "evidence_access", "review_lifecycle"]
    },
    {
      "key": "requests",
      "label": "Requests and activity",
      "owner": "business_partner",
      "sourceObjects": ["document.entity_case", "snapshot.entity_snapshot", "document.entity_case_command_evidence", "document.entity_case_validation", "document.entity_case_materialization"],
      "presentation": "business-partner-request-history.v1",
      "readHandlerKey": "neon.business_partner.request-history.read.v1",
      "scope": { "kind": "tenant", "requiredCoordinates": [] },
      "rules": ["case_authorization", "evidence_redaction", "snapshot_provenance"]
    }
  ]
}
```

The current descriptor parser does not yet support `childCollections`,
`readHandlerKey`, or `writeHandlerKey`. This is the proposed compiler target.
Until that contract exists, the same behavior remains in the current Neon 360
section readers and published Business Partner presentation configuration.

### Attachment design notes

An attachment is not a child row stored inside `master.business_partner` or
`master.certification`. It is a reusable document asset with an immutable
version (`document.attachment`), a version series
(`document.attachment_series`), and an owner-specific link
(`document.attachment_link`). The descriptor must therefore publish the owner
binding and attachment policy, never a direct storage-path write operation.

The same document series may be linked to a Business Partner, a governed
Business Partner Request entry, or retained as evidence for a Certification.
The link determines why the document is visible; the parent entity's current
authorization and context determine whether it may be listed or downloaded.
For example, a certificate attachment is visible only when the Certification is
visible for the selected Company Code and effective date. A file uploaded for a
Business Partner Request remains governed case evidence until the request's
materialization rules explicitly link it to the resulting record.

Studio can publish allowed file classes, labels, required/optional evidence,
maximum size, link kinds, retention-policy key, and whether a collection is
visible in a section. Neon must continue to enforce malware scanning, storage
integrity, content access, signed download, quarantine, current-version checks,
legal hold, retention, deletion, and attachment-link ownership.

## What must remain Neon-owned

Neon must own and enforce the following behavior even after metadata publication:

- address normalization, country/subdivision/postal validation, duplicate detection, primary-address rule, address event history, and materialization;
- certification type/custom-name exclusivity, effective-date checks, attachment admissibility, Company Code applicability, and materialization;
- role activation, effective Operating Organization participation, Company Code profile eligibility, procurement/sales capability validation, and action admission;
- bank disclosure, account eligibility, remittance selection, verification and protected-value reveal;
- tax identifier and registration masking/reveal; risk, qualification, credit, workflow, case lifecycle, audit, and evidence;
- all authorization, record-level restrictions, tenant isolation, and persisted-context validation.

## Recommended delivery sequence

1. Publish the 360 panel, section labels, action placements, and child collection declarations from Studio; retain the existing Neon section readers.
2. Add `businessContext` to the descriptor compiler and parse it in the Neon runtime. Compile its operation scope declarations into `authz` bindings.
3. Make supplier/customer organization participation and company profiles explicit workspace context extensions, using one shared Company Code / Operating Organization control.
4. Publish Address and Certification child surfaces with handler keys. Do not make either a generic writable table endpoint.
5. Add standalone Address or Certification entity descriptors only if there is a real cross-owner management workspace. Keep their Neon handlers for validation, linkage, authorization, and materialization.

This preserves a single canonical Business Partner identity while allowing procurement, sales, finance, and compliance teams to work at the correct organization/company level.
