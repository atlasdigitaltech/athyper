# Business Partner permission cleanup — decision inventory

## Approved operational access applied

The user approved the eight group/role bundles. Applied in shared DEV NEON on
12 September 2026: eight groups, twelve roles split by supported scope, and 48
role-permission links. Admin has 45 distinct assigned permission codes; owner has
33. Company `catl` scope and the dedicated Finance BP activity read catalog entry
were registered. These are normal operational assignments without a temporary
test-window expiry; they remain revocable.

The rollback rehearsal and applied transaction verified that all prior authority
rows remained unchanged. The old preview assignment is still expired. Admin has
no case-decision permission; owner has no request-create, materialize, protected
reveal, Finance activity or target import/export permission.

This verifies assignments, not complete HTTP behavior. Both saved shared DEV
browser sessions failed authentication validation, so endpoint verification needs
a current session. Existing domain/resource checks and pending release bindings
still apply. In particular, legacy read bindings may also admit transfer actions;
absence of target transfer permissions alone is not proof of transfer denial
before target enforcement. No enforcement activation or compatibility retirement
was performed. Resource-scoped comment/attachment access was not broadened.

- [Concrete assignment proposal](../../governance/policy/reviews/business-partner-dev-operational-access-20260912.proposal.dev.json)
- [Applied receipt](../../governance/policy/reports/business-partner-dev-operational-access-applied-20260912.dev.json)
- [Assignment verification](../../governance/policy/reports/business-partner-dev-operational-access-verification-20260912.dev.json)

The original decision inventory below is retained as the basis for approval.

Captured: 2026-09-12T10:31:57.118Z. Read-only; no access or catalog changes.

## Entity linkage

User → active group membership → group/role assignment with scope and validity → role permissions → published entity operation → current authorization and owning-domain checks.

The signed business_partner profile links operation keys to permission codes, ownership scope, parent-read and preflight requirements. A group name does not establish that link. Cases, company setup, Finance, attachments and comments retain their own authority boundaries. Multiple operations may share a permission.

## Decisions

| Item | Recommended decision |
| --- | --- |
| Expired preview/test assignments | Retire operational use; preserve history. No renewal. |
| Legacy BP permissions | Keep until current descriptors and domain checks no longer depend on them; compatibility retirement is separate. |
| bp_target namespace | Keep reviewed target names for this release. Avoid renaming during cleanup. |
| Shared case permissions | Keep, with independent case scope and requester/approver separation. |
| Protected reveal | Separate admin-only role for positive tests; owner masked-only for denial tests. |
| Company access | Company catl and compatible operating organization; do not assume parent BP access grants children. |
| Finance activity | Independent company-scoped reader; no posting permissions implied. |
| Deferred operations | Keep disabled; do not grant generic create/update as a shortcut. |
| Studio | Separate author/reviewer access only when publication testing is required. |
| Mesh and broader Atlas | Outside selected scope. |

## Current DEV access

Both actors have active NEON membership but zero effective role-permission paths. Admin has an expired dev.neon.catl.preview-reader assignment; owner has no joined permission assignment. Published catalog entries alone grant nothing.

## Complete accepted root-profile mapping

42 operation bindings use 35 distinct permission codes; 9 additional operation keys are deferred. This is the accepted isolated artifact, not proof of shared DEV activation.

| BP operation | Permission | Scope resolver | Parent read | Preflight | DEV catalog | Source transition |
| --- | --- | --- | --- | --- | --- | --- |
| enter | `neon.relationship.bp_target.enter` | tenant.record.v1 | False | False | published | `neon.relationship.business_partner.enter` |
| discover | `neon.relationship.bp_target.discover` | tenant.record.v1 | False | False | published | `neon.relationship.business_partner.read` |
| read | `neon.relationship.bp_target.read` | tenant.record.v1 | False | False | published | `neon.relationship.business_partner.read` |
| navigate_manage | `neon.relationship.bp_target.navigate_manage` | tenant.record.v1 | False | False | published | `neon.relationship.business_partner.read` |
| navigate_overview | `neon.relationship.bp_target.navigate_overview` | tenant.record.v1 | False | False | published | `neon.relationship.business_partner.read` |
| export | `neon.relationship.bp_target.export` | tenant.record.v1 | False | True | published | `neon.relationship.business_partner.read` |
| navigate_review | `neon.relationship.entity_case.read` | organization.record.v1 | False | False | published | Shared/native operation |
| request_supplier | `neon.relationship.entity_case.create` | organization.record.v1 | False | True | published | Shared/native operation |
| add_role | `neon.relationship.entity_case.create` | organization.record.v1 | True | True | published | Shared/native operation |
| amend_partner | `neon.relationship.entity_case.create` | organization.record.v1 | True | True | published | Shared/native operation |
| assign_organization | `neon.relationship.entity_case.create` | organization.record.v1 | True | True | published | Shared/native operation |
| configure_company | `neon.relationship.bp_target.configure_company` | organization-company.record.v1 | True | True | published | `neon.relationship.entity_case.create` |
| change_bank | `neon.relationship.entity_case.create` | organization.record.v1 | True | True | published | Shared/native operation |
| lifecycle | `neon.relationship.entity_case.create` | organization.record.v1 | True | True | published | Shared/native operation |
| import | `neon.relationship.bp_target.import` | tenant.record.v1 | False | True | published | `neon.relationship.business_partner.read` |
| identity_read | `neon.relationship.bp_target.identity_read` | tenant.record.v1 | True | False | published | `neon.relationship.business_partner_identity.read` |
| contacts_read | `neon.relationship.bp_target.contacts_read` | tenant.record.v1 | True | False | published | `neon.relationship.business_partner_contact.read` |
| addresses_read | `neon.relationship.bp_target.addresses_read` | tenant.record.v1 | True | False | published | `neon.relationship.business_partner_address.read` |
| identifier_read | `neon.relationship.bp_target.identifier_read` | tenant.record.v1 | True | False | published | `neon.relationship.business_partner_identifier.read_masked` |
| tax_read | `neon.relationship.bp_target.tax_read` | tenant.record.v1 | True | False | published | `neon.relationship.business_partner_tax.read_masked` |
| bank_read | `neon.relationship.bp_target.bank_read` | tenant.record.v1 | True | False | published | `neon.relationship.business_partner_bank.read_masked` |
| qualification_read | `neon.relationship.bp_target.qualification_read` | tenant.record.v1 | True | False | published | `neon.relationship.business_partner_qualification.read` |
| certificate_read | `neon.relationship.bp_target.certificate_read` | tenant.record.v1 | True | False | published | `neon.relationship.business_partner_certificate.read` |
| credit_read | `neon.relationship.bp_target.credit_read` | organization-company.record.v1 | True | False | published | `neon.relationship.business_partner_credit.read` |
| requests_read | `neon.relationship.bp_target.requests_read` | tenant.record.v1 | True | False | published | `neon.relationship.entity_case.read` |
| activity_read | `neon.relationship.bp_target.activity_read` | tenant.record.v1 | True | False | published | `neon.relationship.business_partner_activity.read` |
| network_read | `neon.relationship.bp_target.network_read` | organization-company.record.v1 | True | False | published | `neon.relationship.business_partner_network.read` |
| comments_read | `neon.relationship.bp_target.comments_read` | tenant.record.v1 | True | False | published | `collaboration.comment.read` |
| attachments_read | `neon.relationship.bp_target.attachments_read` | tenant.record.v1 | True | False | published | `document.attachment.read` |
| bank_reveal | `neon.relationship.bp_target.bank_reveal` | tenant.record.v1 | True | True | published | `neon.relationship.business_partner_bank.reveal` |
| tax_reveal | `neon.relationship.bp_target.tax_reveal` | tenant.record.v1 | True | True | published | `neon.relationship.business_partner_tax.reveal` |
| case_create | `neon.relationship.entity_case.create` | organization.record.v1 | False | True | published | Shared/native operation |
| case_read | `neon.relationship.entity_case.read` | organization.record.v1 | False | False | published | Shared/native operation |
| case_update | `neon.relationship.entity_case.update` | organization.record.v1 | False | True | published | Shared/native operation |
| case_validate | `neon.relationship.entity_case.validate` | organization.record.v1 | False | True | published | Shared/native operation |
| case_submit | `neon.relationship.entity_case.submit` | organization.record.v1 | False | True | published | Shared/native operation |
| case_decide | `neon.relationship.entity_case.decide` | organization.record.v1 | False | True | published | Shared/native operation |
| case_materialize | `neon.relationship.entity_case.materialize` | organization.record.v1 | False | True | published | Shared/native operation |
| qualification | `neon.supplier.qualification.admin` | organization.record.v1 | False | True | published | Shared/native operation |
| qualification_company | `neon.relationship.bp_target.qualification_company` | organization-company.record.v1 | False | True | published | `neon.supplier.qualification.admin` |
| supplier_company_read | `neon.relationship.bp_target.supplier_company_read` | organization-company.record.v1 | True | False | published | `neon.relationship.business_partner.read` |
| customer_company_read | `neon.relationship.bp_target.customer_company_read` | organization-company.record.v1 | True | False | published | `neon.relationship.business_partner.read` |

## Deferred keys

`address_sensitive_read`, `certification`, `contact_sensitive_read`, `create`, `person_read`, `person_sensitive_read`, `section_propose_change`, `update`, `workforce_read`

## Relationship ownership

```json
[
  {
    "key": "company_configuration",
    "ownership": "independent",
    "readOperation": "read",
    "targetEntity": "business_partner_company"
  }
]
```

## Other BP catalog entries and source dependencies

These are not distinct target-profile permissions. They may support current DEV, native checks, other entities or deferred implementations. Catalog absence from this profile is not deletion evidence.

| Permission | Status | Classification |
| --- | --- | --- |
| `collaboration.comment.read` | published | Explicit source/domain transition dependency |
| `document.attachment.read` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner.activate` | published | Consumer review required |
| `neon.relationship.business_partner.create` | published | Consumer review required |
| `neon.relationship.business_partner.read` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner.update` | published | Consumer review required |
| `neon.relationship.business_partner_activity.read` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_address.read` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_amend.create` | published | Consumer review required |
| `neon.relationship.business_partner_bank.read_masked` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_bank.reveal` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_certificate.read` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_contact.read` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_credit.read` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_identifier.read_masked` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_identity.read` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_network.read` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_person.read` | published | Consumer review required |
| `neon.relationship.business_partner_person_sensitive.read` | published | Consumer review required |
| `neon.relationship.business_partner_qualification.read` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_tax.read_masked` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_tax.reveal` | published | Explicit source/domain transition dependency |
| `neon.relationship.business_partner_workforce.read` | published | Consumer review required |

## Proposed groups and roles — not applied

| Group / role | Members | Purpose |
| --- | --- | --- |
| dev.bp.readers / BP Reader | admin, owner | Tenant directory and ordinary masked sections |
| dev.bp.requesters / BP Requester | admin | Create/edit/validate/submit governed cases; company configuration at its own scope |
| dev.bp.approvers / BP Approver | owner | Read and independently decide cases |
| dev.bp.appliers / BP Application Operator | admin | Apply approved cases only |
| dev.bp.company-users / BP Company User | admin, owner | Company-scoped relationship reads |
| dev.bp.data-transfer / BP Import-Export | admin | Governed import/export |
| dev.bp.protected-readers / BP Protected Reveal | admin | MFA/purpose-gated bank and tax reveal |
| dev.bp.finance-readers / Finance Activity Reader | admin | Independently scoped journal activity |

Groups may receive multiple role assignments at different scopes; one group per permission is unnecessary. These are logical bundles, not a ready-to-execute grant manifest. Native source gates and deployed descriptors must be checked before applying.

## Cleanup sequence

1. Decide role bundles, actor membership and scopes.
2. Prepare operational assignments against actual DEV bindings.
3. Verify descriptor, company selection and requester/reviewer journeys.
4. Retire superseded test assignments through the supported authority path, preserving history.
5. Retire legacy compatibility only after consumers migrate and separate retirement approval.

Evidence: [inventory](../../governance/policy/reports/business-partner-permission-cleanup-inventory-20260912.dev.json).
