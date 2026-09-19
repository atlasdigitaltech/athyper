# Neon business-partner pilot: authorization and scope design

Pilot scope accepted by the user: staging, Neon, `business_partner` owners, email verification, synthetic data. This document proposes the implementation; it neither publishes authority nor asserts IAM/domain review completion.

## Local verification implementation update (2026-09-07)

The verification path is implemented and qualified locally; see
`../local-contact-verification.md`. The five other routes now have canonical
root/sensitive checks and stored organization resolution implemented in code;
see `../master-data-canonical-authorization.md` for tests and activation gates.
The four sensitive capabilities and scoped grants are published and browser-tested
in local Neon for the selected actors; other environments still require review. No staging qualification or authority approval is asserted.

## Fixture and actor layout

Use one primary staging tenant containing approximately ten synthetic business partners, plus one distinct tenant for negative tests. Actual IDs remain pending. Split the primary tenant's partners between two operating organizations, A and B. Include two contacts with the same email on different partners to isolate contact-ID binding from contact-value binding.

For the first pilot, each partner must have exactly one distinct currently active operating-organization assignment. Multiple role assignments to the same organization may be deduplicated. Zero or multiple distinct organizations must fail closed until an explicit multi-organization authority model is reviewed. This is a proposed pilot limitation, not a claim that the business-partner model is globally single-organization.

| Actor | Proposed scope and behavior |
| --- | --- |
| User A | Root read/update plus selected contact/address overlays, organization A only |
| User B | Equivalent permissions, organization B only |
| Unauthorized user | Valid identity with none of these business permissions |
| Attestation principal | Exact contact-verification capability for the approved primary-tenant scope; no general partner update or address-write authority |

Human grants, service identity, entitlements, MFA/SoD settings, and scope propagation must go through the authorization review/release process. No role or grant is created by this design. The negative-test tenant is a fixture scope, not an additional trusted provider tenant. Keep production and staging signing keys separate.

## Proposed permission matrix

Existing reviewed inventory contains `neon.relationship.business_partner.read` and `.update` operation proposals with `operatingOrganizationId`. The new sensitive capabilities below are proposed names, not published definitions. Confirm their risk, assurance, entitlement/module association, and scope rules before generating release artifacts.

| Route | Proposed required authority |
| --- | --- |
| GET owner profile | Root `read` plus `neon.relationship.business_partner.read_contact_sensitive` and `.read_address_sensitive` |
| POST owner contacts | Root `update` plus `neon.relationship.business_partner.write_contact_sensitive` |
| POST owner addresses | Root `update` plus `neon.relationship.business_partner.write_address_sensitive` |
| POST contact deactivate | Root `update` plus `.write_contact_sensitive` |
| POST address-link deactivate | Root `update` plus `.write_address_sensitive` |
| PATCH contact verification | `neon.relationship.business_partner.verify_contact` capability, evaluated on the trusted owner organization; no implicit general-update grant |

Root operations must resolve through published descriptor/operation bindings. Sensitive capabilities must use the approved capability registry and compatible scopes. A capability invocation must not accidentally be treated as an incomplete entity-operation invocation by IAM. Contact/address deactivation is collection mutation, not the business partner's `deactivate` lifecycle transition. Do not reuse broad `address_contact.*.manage` capabilities or create aliases for legacy strings.

## Trusted scope resolver implementation

The intended resolver accepts verified tenant/plane context and one of: owner coordinate, contact ID, or address-link ID. It returns a minimal trusted authority target, without contact values or address contents:

```text
planeKey: neon
 tenantId: verified context tenant
 ownerTypeId: active control.owner_type entry
 ownerEntityCode: business_partner
 businessPartnerId: tenant-scoped owner ID
 operatingOrganizationId: unique effective trusted assignment
```

Implementation steps:

1. Admit only the selected plane and owner type for this pilot-specific authority path. Other owner types require separate reviewed resolution; do not silently fall back to legacy permission strings.
2. For contact/address-link IDs, read minimal tenant-scoped identity fields and resolve the owner through `control.owner_type`. Never obtain scope from request-body organization IDs.
3. Validate `master.business_partner` existence in that tenant and its metadata/storage binding. Do not trust a caller's entity code without matching the owner registry.
4. Resolve active assignments from `master.business_partner_operating_organization_assignment`, using tenant ID, partner ID, active status, and the effective date. Resolve distinct organization IDs, not an arbitrary first row or role. Validate the resolved organization is tenant-accessible.
5. Use current authority time for authorization, even if the profile request asks for historical data. A caller must not regain an expired grant by selecting an old `asOf`.
6. Pass `operatingOrganizationId` and the exact root operation/capability to IAM. Preserve explicit deny, scope containment, entitlement, MFA, SoD, and policy behavior; missing coordinates deny.
7. Ensure the authority target cannot change before mutation or response. Locking existing assignment rows alone cannot prevent insertion of another assignment. Choose and document a coordination mechanism honored by every assignment writer, or use a qualified serializable/revalidation design that also accounts for concurrent privilege revocation. Do not claim a new advisory lock solves this unless existing assignment writers participate.
8. Keep mutation, accepted proof, audit, and outbox in the same plane transaction. Verification additionally locks the contact value as already implemented.

The resolver and transaction coordination are now implemented in code. Sensitive capability mappings, grants, deployment and authenticated acceptance are complete locally; other environments require separate release steps; this document does not grant access.

## Minimum acceptance cases

- User A can manage partner A and read its profile; User B can manage partner B.
- User A cannot read, create, deactivate, or verify data for partner B merely because both are in the same tenant.
- A contact/address-link ID must not bypass the owning partner's scope checks.
- A foreign-tenant ID never returns PII or mutates state.
- No assignment, inactive/expired assignment, and multiple distinct active organizations deny without tenant-wide fallback.
- A caller-supplied organization ID cannot change the resolved target.
- A historical profile date does not substitute for current authorization.
- Changes to owner assignment during a request cannot result in a write under stale authority.
- The attestation principal can verify only its approved scope and cannot perform ordinary contact/address writes.
- Real published operation bindings and scoped evidence are exercised; mocks or an `allowed` string list alone do not qualify the pilot.

## Outstanding inputs

Primary and negative-test tenant IDs, selected staging target/database identities, provider or attestation bridge, controlled mailboxes, service principal, and named domain/integration/IAM/database/release owners remain pending. No external message delivery or provider account provisioning has been authorized or performed.
