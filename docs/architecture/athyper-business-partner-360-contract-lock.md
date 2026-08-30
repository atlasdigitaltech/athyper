# Athyper Business Partner 360 Phase 1 contract lock

**Status:** Implemented; technical review passed; owner approval pending  
**Prepared:** 2026-08-30  

Fresh three-plane build, exact source baseline, migration and seven-family fixture evidence are recorded in the [P0 integration baseline evidence](./athyper-business-partner-360-integration-baseline-evidence.md). Technical validation does not replace the required business/data, security/privacy, architecture/contract and release-owner approvals.
**Build slice:** `BS360-00`  
**Build sequence:** [Business Partner 360 view build sequence plan](./athyper-business-partner-360-view-build-sequence-plan.md)  
**Build design:** [Business Partner 360 view build design](./athyper-business-partner-360-view-build-design.md)  
**Runtime contract:** `server/packages/contracts/master-data/src/business-partner-360.ts`

## 1. Locked decisions

- The public contract version is numeric `schemaVersion: 1`; the STUDIO descriptor version is `1.0.0`.
- The canonical page remains `/mdg/business-partner/[recordId]`.
- The canonical summary route is `GET /api/neon/business-partners/:id/360/summary`.
- Section and scope query state uses `section`, `roleLens`, `operatingOrganizationId`, `companyCodeId`, `legalEntityId`, and `asOf`.
- List sections use opaque `cursor` and `limit`; default `25`, maximum `100`.
- Effective ranges use `[effective_from, effective_until)` at the tenant business date unless `asOf` is supplied.
- Root visibility always requires `neon.relationship.business_partner.read` before a section permission is evaluated.
- Phase 1 denied sections are hidden. `authorization=restricted` remains in the envelope for a later explicitly approved discoverability policy; no Phase 1 section opts into it.
- Restricted reveals are separate purpose-bound commands, never query flags.
- Phase 1 contracts reject risk assessment, score, band, incident, trend, and exposure field families.
- The existing aggregate remains read-only compatibility surface until the retirement signal `bp360_legacy_aggregate_consumers_zero` is met.

## 2. Field authority and sensitivity ledger

Sensitivity classes are `ordinary`, `confidential`, `restricted`, and `highly restricted`. “Masked” happens at or before the repository mapping boundary so application logs never observe the raw value.

| Section/domain | Locked displayed fields | Authority/source | Sensitivity | Scope/effective rule | Presentation and provenance |
|---|---|---|---|---|---|
| Header / identity | `id`, `code`, `name`, `displayName`, `legalName`, `partnerCategory`, `status`, `createdAt`, `updatedAt` | NEON `master.business_partner` | Ordinary | Tenant; global identity; BP version | Canonical NEON badge and last-change time |
| Identity / organization | `legalForm`, `registrationCountryCode`, `incorporationDate`, `websiteUrl`, `description`, `aliases` | NEON `master.business_partner` | Ordinary | Tenant; current BP version | Canonical NEON provenance |
| Identity / amendment | prior safe labels, request and amendment coordinates | NEON `master.organization_amendment` plus request evidence | Confidential | Tenant and caller-visible BP | Safe diff only; no raw audit JSON |
| Classification | commodity/industry domain, code, name, trade/assignment kind, primary, confidence, effective dates | NEON classification tables plus shared catalogs | Ordinary | Selected role/scope; current at `asOf` | NEON source row and catalog version |
| External references | system code, external entity type/ID, status | NEON `master.external_reference` | Confidential | Tenant and BP | Coordinate only; no copied external payload |
| Contacts / person | display name, role, title, department, primary, verification and effective state | NEON contact-person/role/link tables | Confidential | Registered owner type + owner ID; current at `asOf` | NEON source and verification time |
| Contacts / channels | channel type, masked/ordinary email or phone, primary, verification, effective dates | NEON contact email/phone tables | Confidential | Contact and BP visibility; current at `asOf` | Never included in telemetry or URL |
| Addresses | purpose, lines, locality, region, postal code, country, primary, validation, effective dates | NEON address/link/event tables | Confidential | Registered owner type + owner ID; current at `asOf` | Validation source/time; historical event deep link |
| Identifiers | scheme, issuing country/authority, masked value, verification, primary, effective dates | NEON `master.business_partner_identifier` | Restricted | Tenant/BP; current at `asOf` | Mask/presence at repository boundary; audited reveal if approved |
| Tax | type, jurisdiction, masked value, verification, effective dates | NEON `master.business_partner_tax_registration` | Highly restricted | Tenant/BP; current at `asOf` | Masked by default; separate MFA/purpose-bound reveal |
| Roles | supplier/customer/workforce code, type, status, created/updated | NEON role tables | Ordinary | Tenant/BP; role lens | Separate additive roles; never merged |
| Organization scope | role, operating organization, status, effective dates | NEON BP operating-organization assignment | Confidential | Explicit authorized organization; current at `asOf` | Scope coordinate and source row |
| Supplier company | company, currency, payment terms, accounting profile, default dimensions, status | NEON company-code supplier profile | Confidential | Supplier + explicit organization/company | NEON authority; no customer merge |
| Customer company | company, currency, payment terms, statement cycle, accounting profile, default dimensions, status | NEON company-code customer profile | Confidential | Customer + explicit organization/company | NEON authority; no supplier merge |
| Banking | bank/country, holder, currency, purpose, company scope, primary, last four, verification, effective dates | NEON bank link, masked bank view, bank-verification service | Highly restricted | Explicit role/company; current at `asOf` | Raw account value never selected; separate MFA reveal |
| Qualifications | type, decision, scope, effective/expiry/review dates, evidence manifest | NEON qualification control service | Confidential | Supplier role and selected scope; current at `asOf` | Owning decision authority and evidence coordinate |
| Preference and blocks | designation/block type, scope, status, effective dates | NEON preference/block control services | Confidential | Supplier role and selected scope; current at `asOf` | Owning control provenance |
| Certificates | type, masked/ordinary certificate number, issuer, location, status, effective dates, attachment manifest | NEON certification and authorized content services | Restricted | Owner type/ID; current at `asOf` | Content never embedded; authorized expiring link |
| Credit review | review type, company, requested/approved limit and currency, decision, conditions, effective dates, reviewer evidence | NEON customer credit service | Confidential | Customer + explicit organization/company | Label is “Credit review”; no external risk enrichment |
| Person | legal/preferred names, locale, ordinary contact, consent state | NEON `master.person` | Restricted | Person permission; tenant/BP | No sensitive-profile prefetch |
| Person-sensitive | identifier presence/last characters, operational age/status | NEON protected person reader | Highly restricted | Purpose, permission, step-up, expiry | Exact values omitted by default; access audited/no-store |
| Employment | employee/external-worker code, employer, status/type, start/end | NEON employment/external-worker tables | Restricted | Explicit legal entity; current at `asOf` | Effective range and NEON source |
| Assignments | organization, company, org unit, position, manager, site, cost object, FTE, effective dates | NEON work-assignment table | Restricted | Explicit legal entity/company; current at `asOf` | Effective range and NEON source |
| Onboarding/offboarding | case/status, checklist counts, overdue state, evidence/access status | NEON onboarding case/task services | Restricted | Workforce permission and legal entity | Safe evidence coordinates only |
| Engagements | SOW/work-order coordinate, placement, status, effective dates | NEON worker engagement/placement services | Restricted | External worker and authorized scope | No employee implication |
| Requests | request number/kind/status, scope, workflow/decision, validation summary, evidence manifest, application coordinates | NEON governed request/workflow services | Confidential | BP plus request permission/scope | No general payload or evidence content |
| Governance activity | category, event code/title/safe summary, actor display, time, source, request/entity links, masked changes | NEON allowlisted activity mapper | Confidential | BP and section permission; `asOf`/cursor | No raw old/new values or metadata |
| Business activity | count, value/currency, status breakdown, last activity, owning-module deep links | Owning procurement/finance/sales/project/contract readers | Confidential | Owning module and selected role/scope | Provider and observed time; unavailable if unsupported |
| Network local | link/relationship coordinate, received schema/version/hash, accepted/ignored paths, publication state, freshness | NEON MESH link/projection/acceptance evidence | Confidential | Organization commercial role and network permission | Local first; accepted versus reported clearly separated |
| Network live | account/relationship/publication summaries | MESH service adapter | Confidential | Independent NEON and MESH authorization | `authority=mesh`, observed time and schema version |
| Completeness | status, percentage/counts, restricted-present count, missing field codes/actions, definition version/hash/fingerprint | NEON calculator + verified local STUDIO definition | Confidential | Party/role/scope/date/policy/BP version | Never persisted as authority; risk excluded |

No field planned for the Phase 1 UI is outside this ledger. A new displayed field requires a ledger and contract revision before implementation.

## 3. Section, route, applicability, and permission contract

| Code | Route(s) after summary | Applicable to | Scope | Permission after root visibility |
|---|---|---|---|---|
| `overview` | Summary payload | Organization/person | Global plus selected context | Root record read |
| `identity` | `/360/identity` | Organization/person | Global | BP identity read |
| `contacts` | `/360/contacts` | Organization/person | Global/owner-aware | BP contact read |
| `addresses` | `/360/addresses` | Organization/person | Global/owner-aware | BP address read |
| `identifiers-tax` | `/360/identifiers` | Organization/person | Global | Identifier masked read; tax fields additionally require tax masked read |
| `roles-scope` | `/360/roles` | Organization/person | Global plus explicit organization | Root record read |
| `supplier-company` | `/360/company-configuration` | Supplier role | Organization/company | Root record read plus scope authorization |
| `customer-company` | `/360/company-configuration` | Customer role | Organization/company | Root record read plus scope authorization |
| `banking` | `/360/banking` | Supplier role under policy | Organization/company | BP bank masked read |
| `qualifications-certificates` | `/360/qualifications`, `/360/certificates` | Supplier role under policy | Organization/company/commodity | Qualification and certificate read respectively |
| `credit` | `/360/credit` | Customer role | Organization/company | BP credit read |
| `workforce` | `/360/workforce` | Person with workforce role | Legal entity/company | BP workforce read; person rules apply |
| `requests` | `/360/requests` | Organization/person | Authorized BP scope | Existing BP request read |
| `activity` | `/360/activity` | Organization/person | Authorized BP scope | BP activity read |
| `business-activity` | `/360/business-activity` | Supplier/customer | Organization/company | Root plus owning-module permissions |
| `network` | `/360/network` | MESH-linked organization commercial role | Relationship coordinate | BP network read plus independent MESH authorization |

The executable registry in the runtime contract is normative. The STUDIO `neonPartner360` descriptor must publish the same ordered section codes and routes.

## 4. Permission reconciliation

The platform catalog requires exactly `plane.domain.entity.operation`. Design examples with five segments were reconciled by folding the field domain into the entity token.

| Concern | Final permission | Catalog state in BS360-00 | Denied behavior |
|---|---|---|---|
| Root record | `neon.relationship.business_partner.read` | Existing | BP returns non-enumerating 404 |
| Identity | `neon.relationship.business_partner_identity.read` | New reference seed | Hidden |
| Contacts | `neon.relationship.business_partner_contact.read` | New reference seed | Hidden |
| Addresses | `neon.relationship.business_partner_address.read` | New reference seed | Hidden |
| Identifier masked | `neon.relationship.business_partner_identifier.read_masked` | New reference seed | Hidden |
| Tax masked/reveal | `neon.relationship.business_partner_tax.read_masked` / `.reveal` | New; reveal high-risk + MFA | Hidden; reveal denied and audited |
| Bank masked/reveal | `neon.relationship.business_partner_bank.read_masked` / `.reveal` | New; reveal high-risk + MFA | Hidden; reveal denied and audited |
| Qualification | `neon.relationship.business_partner_qualification.read` | New reference seed | Hidden |
| Certificate | `neon.relationship.business_partner_certificate.read` | New reference seed | Hidden |
| Credit | `neon.relationship.business_partner_credit.read` | New reference seed | Hidden |
| Person | `neon.relationship.business_partner_person.read` | New; legal-entity compatible | Hidden |
| Person sensitive | `neon.relationship.business_partner_person_sensitive.read` | New; high-risk + MFA | Hidden; reveal denied and audited |
| Workforce | `neon.relationship.business_partner_workforce.read` | New; legal-entity compatible | Hidden |
| Requests | `neon.relationship.business_partner_request.read` | Existing | Hidden |
| Activity | `neon.relationship.business_partner_activity.read` | New reference seed | Hidden |
| Network | `neon.relationship.business_partner_network.read` | New reference seed | Hidden |
| Propose change | `neon.relationship.business_partner_amend.create` | New reference seed; delegates to governed request | Action absent |

New section permissions are staged in `22_business_partner_360_permission_reference_seed.sql`. No route may rely on a new permission until its service authorization, scope checks, RLS behavior, and negative tests land in the same vertical slice.

## 5. Acceptance fixtures

| Fixture | Category/roles | Required applicable sections beyond common | Required exclusions |
|---|---|---|---|
| Organization base | Organization; no commercial role | None | Banking, credit, workforce, network |
| Supplier organization | Organization; supplier | Supplier company, banking, qualifications/certificates, business activity | Customer company, credit, workforce |
| Customer organization | Organization; customer | Customer company, credit, business activity | Supplier company, banking, qualification, workforce |
| Dual-role organization | Organization; supplier + customer | Both company sections, banking, qualifications/certificates, credit, business activity | Workforce unless separately held |
| Person | Person; no commercial/workforce role | Common only | Supplier/customer controls, workforce, network |
| Internal workforce | Person; workforce | Workforce | Network and commercial controls unless separately approved |
| External worker | Person; workforce/external engagement | Workforce including engagement/placement | Employee implication, network |
| MESH-linked organization | Organization; commercial role; approved link | Network plus role sections | Person/workforce payload fields |

Common sections are Overview, Identity, Contacts, Addresses, Identifiers & Tax, Roles & Scope, Requests, and Activity. Executable contract tests resolve every fixture and lock the negative risk-field matrix.

## 6. Error, pagination, and version contract

| Condition | Locked behavior |
|---|---|
| BP not visible | `404 BP_360_NOT_FOUND` |
| Scope missing for scoped section | Summary state with `BP_360_SCOPE_REQUIRED`; no false empty result |
| Invalid organization/company relationship | `400 BP_360_SCOPE_INVALID` |
| Direct non-applicable section call | `404 BP_360_SECTION_NOT_APPLICABLE` |
| Direct denied section call after BP visibility | `403 BP_360_SECTION_FORBIDDEN` |
| Definition incompatible/absent | Canonical identity remains available; affected section unavailable |
| MESH provider unavailable/stale | HTTP 200 Network envelope with local projection and explicit state |
| Stale cursor/BP version | `409 BP_360_CURSOR_STALE` |

Cursors are opaque and bind tenant, BP, section, scope, `asOf`, sort coordinate, BP version, definition hash, and redaction policy. A caller may request `1..100` rows; absent limit resolves to `25`.

## 7. Legacy aggregate compatibility and retirement

Known consumers at contract lock:

| Consumer | Current dependency | Migration target |
|---|---|---|
| `BusinessPartnerAggregateDetail` | Aggregate + supplier eligibility loaded together | BS360-02 summary shell, then section readers |
| `customer-controls.tsx` | Aggregate for customer/company coordinates | BS360-04 role/company reader |
| NEON record page | Renders `BusinessPartnerAggregateDetail` | BS360-02 shell at same route |
| BFF relay operation `neon.business-partners.aggregate.read` | `GET /api/neon/business-partners/:id` | Add bounded 360 operations; retain old operation during migration |
| Master-data aggregate route/service/repository | Seven row-family response | Read-only compatibility adapter until all consumers move |

Compatibility rules:

1. Do not expand the old aggregate with 360 domains.
2. Existing route and response remain stable during rollout.
3. The legacy readiness presentation no longer displays a risk band.
4. New code consumes only `/360/*` contracts once its slice lands.
5. Instrument old route call count by consumer/release without PII.
6. Emit `bp360_legacy_aggregate_consumers_zero` only after code search, runtime telemetry, and supported-client review show zero consumers for the agreed observation window.
7. Endpoint/component retirement is a separate BS360-10 change with rollback approval.

## 8. Risk-negative lock

The runtime assertion rejects these keys recursively in any Phase 1 360 payload or fixture:

```text
risk
riskAssessment
riskScore
overallRiskScore
riskBand
riskIncident / riskIncidents / riskIncidentCount
riskTrend
riskExposure
```

Credit review is allowed only as the capability-owned commercial decision described in the field ledger. A value named or sourced as external risk enrichment is not allowed. The STUDIO descriptor publishes `excludedCapabilities=["risk"]`, and the legacy aggregate descriptor uses `readinessWithoutRisk`.

## 9. BS360-00 evidence

| Evidence | Location |
|---|---|
| v1 scope, envelope, reason, permission and section contracts | `server/packages/contracts/master-data/src/business-partner-360.ts` |
| Acceptance fixture and risk-negative tests | `server/packages/contracts/master-data/src/business-partner-360.test.ts` |
| STUDIO Phase 1 descriptor | `server/packages/services/publication/src/business-partner-foundation-definition.ts` |
| Definition compatibility tests | `server/packages/services/publication/src/__tests__/business-partner-definition.test.ts` |
| Permission catalog reference seed | `server/db/ddl/planes/neon/authz/22_business_partner_360_permission_reference_seed.sql` |
| DDL/descriptor contract guard | `server/db/scripts/__tests__/business-partner-360-contract-lock.test.ts` |
| Legacy risk presentation removal | `packages/planes/neon/business-partner/src/index.tsx` |

Review approval of this document and its executable contracts closes BS360-00. Implementation must not begin BS360-02 route exposure or BS360-03 readers by changing these public decisions without a reviewed contract revision.

### Verification run — 2026-08-30

| Check | Result |
|---|---|
| Master-data contract typecheck | Passed |
| Master-data contract tests | 10 passed |
| Publication service typecheck | Passed |
| Publication service tests | 53 passed |
| NEON Business Partner package typecheck/tests | Passed; 5 tests passed |
| Database package typecheck | Passed |
| Database contract suite | 151 passed |
| Seed contract lint | 71 files passed; 22 baseline-bound pre-contract files unchanged |
| Three-plane DDL model/manifest check | Passed; NEON manifest contains 213 unique ordered entries |
| Patch whitespace validation | `git diff --check` passed |
