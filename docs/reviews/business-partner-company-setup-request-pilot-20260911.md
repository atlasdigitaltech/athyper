# Company-owned BP setup-request pilot

Status: ownership pilot selected by the user; profile and capability proposal authored, not installed or qualified.

The user selected “Use company-owned BP setup requests”. The separate entity is `master.business_partner_company_setup_request`, in NEON. Its proposed machine-readable profile is `governance/policy/reviews/business-partner-company-setup-request.profile.proposal.dev.json`. It uses the governed case lifecycle. Existing `entity_case` organization-owned requests retain their identity and policy.

## Ownership and scope

The tenant and mandatory company owner must be stored when the request is created and immutable thereafter. An operating organization is a validated workflow coordinate, not an alternative owner. The service must verify the company belongs to the tenant and the organization is compatible with it. Existing-record authorization reads stored ownership; URL, session, Atlas and form coordinates cannot replace it. Missing ownership fails closed. No company reassignment operation is proposed.

Directory population is company ownership scoped. A parent BP read does not grant child read; child read does not grant BP mutation. The BP association must be resolved from storage and checked separately when its data is used. No tenant-to-company, organization-to-company, or company-to-other-company propagation is implicit.

## Proposed capabilities and workflow

| Operation       | Target                              | Required behavior                                                                           |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Discover/read   | Company collection / stored request | Explicit company read authority; constrain SQL before rows or totals are returned           |
| Create          | Proposed company-owned request      | Validate ownership and compatible organization before persistence                           |
| Update          | Existing draft                      | Stored company authority; immutable owner; existing draft rules                             |
| Validate/submit | Existing request                    | Validate coherent BP setup payload and owner before submission; freeze approved snapshot    |
| Decide          | Existing submitted request          | Independent approver, normal MFA and existing workflow conditions                           |
| Materialize     | Existing approved request           | Reauthorize current grants and stored owner; apply only the independently approved snapshot |

The proposed dedicated permission definitions grant nobody access. Named test assignments, exact company IDs, dates and any grant changes require a separate proposal. Existing BP administrator roles do not become stewards. No import, export, reveal or direct master-data write capability is introduced by this pilot.

Identity fields use the read policy and are not directly writable. Payload fields require their own complete field-policy mapping before publication; the draft profile is not a complete release descriptor. Runtime registrations must bind real case handlers, stored-company resolution and workflow preflight. A profile fixture or callable stub is insufficient qualification.

## Required execution evidence

Qualify one signed release and exact API/worker image using authenticated sessions: create → validate → submit → independent approval → materialize. Prove wrong-company, missing-company, conflicting URL owner, incompatible organization, same-person approval, direct-write and revocation failures. Prove an independently owned child can be denied despite readable BP master data. Verify filtered lists, counts, nested fields and Atlas tools use the same policy. Record the exact authority fingerprint and test-data cleanup.

Global and legal-entity ownership remain separate resolver work. This company pilot does not establish those ownership models or platform-wide generality.

## Local implementation follow-up — 11 September, 15:00 MYT

The storage migration `server/db/migrations/20260911_company_owned_case_pilot.sql` adds an immutable `document.entity_case.owner_company_code_id`, tenant-matched company FK and a trigger for the pilot's stored entity identity `master.business_partner_company_setup_request`. The runtime authorization identity is `business_partner_company_setup_request`; the original dotted native-profile proposal is retained and needs an authored successor using this runtime identity.

The pilot is limited to `configure_company` requests with an existing parent BP. Its company owner, tenant, case ID, entity identity and parent cannot be changed. Snapshot company coordinates must match the stored owner. Creation and snapshot updates validate active company/organization compatibility. No existing organization-owned case is reclassified. Neither migration nor resolver creates grants or publishes the pilot.

`createBusinessPartnerStoredScopes` now recognizes the separate pilot identity. Existing-record resolution uses the stored company column; caller organization/company coordinates cannot substitute for ownership. Proposed requests require both company and compatible workflow organization. Existing company ownership does not acquire organization ownership. Generic `entity_case` resolution continues to select only existing `master.business_partner` cases, so it cannot resolve a pilot case as an organization-owned legacy case.

Validation: complete migration rehearsed against clone schema with rollback; the trigger body accepted a valid owner against the real clone catalog and rejected seven owner/snapshot mutations in a scratch table; four resolver regressions passed. Evidence: `governance/policy/reports/business-partner-company-owner-storage.dev.json`.

Still required: native authoring and complete payload-field policies; governed service/repository creation and lifecycle dispatch for the separate entity; real handler/preflight registration; exact grant proposal and authenticated independent approval/application; independently owned child denial; signed publication and image qualification. These local guards are not a completed ownership journey.

## Native draft persistence preview — 11 September, 16:09 MYT

`20260911_company_owned_case_draft.sql` extends the existing native draft command to persist `owner_company_code_id` at pilot creation from the validated company coordinate. Existing legacy case creation leaves this owner null. Subsequent snapshot revisions cannot change ownership because the stored-owner trigger validates each accepted draft revision. This migration depends on the separate owner-column/constraint migration; neither has been deployed.

`preview-company-draft-storage.mjs` ran six checks against real native command/function bodies in a rollback-only clone transaction: persisted company owner, rejected owner removal, rejected entity reclassification, rejected owner changes through native snapshot revision, rejected missing owner at creation, and unchanged legacy draft ownership. Its contract fixture is explicitly `UNSIGNED_LOCAL_SQL_FIXTURE`; this is not a native publication or an authenticated business journey. No fixture contracts, commands or ownership column remained after rollback; clone authorization fingerprints stayed unchanged.

Shared DEV authorization tables temporarily disappeared during this work, then reappeared with a changed authority fingerprint and no BP activation-head rows. Authenticated qualification and policy acceptance are paused pending confirmation of the new baseline. The clone-only SQL preview does not weaken or replace the original shared/clone authority guard.
