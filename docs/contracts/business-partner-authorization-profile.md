# Business Partner profile of entity and record authorization

Status: proposed first adoption profile; not an activated metadata release.
Depends on [entity-record-authorization/v1](entity-record-authorization.md).

This profile applies the generic contract to Business Partner without adding
Business Partner branches to the generic evaluator. The existing
[Business Partner architecture](../architecture/business-partner/README.md)
and plane authority boundaries remain authoritative.

## 1. Ownership model

NEON owns the tenant-local Business Partner master. Supplier and customer are
commercial relationships, not IAM roles. Organization assignments and company
configurations are separately governed resources. A company context does not own
the global partner identity. People/workforce are outside this entity profile.

| Resource or field group | Owner/target boundary | Required context |
| --- | --- | --- |
| Partner identity, global lifecycle | Tenant-local partner | Partner |
| Shared contact/address | Partner-owned child, with declared inheritance | Partner + child for detail/change |
| Contact/address usage | Explicit organization/company usage resource | Partner + usage owner |
| Identifiers/tax registrations | Partner, jurisdiction and sensitive-field policy | Partner + registration for reveal/change |
| Supplier/customer role | Partner commercial relationship | Partner + role |
| Organization assignment | Target operating organization | Partner + role + organization |
| Buying/payables configuration | Company configuration | Partner + supplier role + organization + company |
| Selling/receivables configuration | Company configuration | Partner + customer role + organization + company |
| Bank-account data | Account authority under existing bank/disclosure model | Partner association + account/source |
| Bank usage/preference/acceptance | Company usage resource | Partner + company + account usage; organization if operation requires |
| Qualification/credit decision | Explicit decision coverage | Partner + declared coverage |
| Request | Proposed change target | Scope resolved by request kind |
| Transactions | Owning business service/company | Explicit transaction context |
| Network content | MESH relationship/disclosure authority | Validated source/recipient relationship |

Bank account storage and disclosure authority MUST remain compatible with the
[bank disclosure contract](bank-account-disclosure-acceptance.md). This table does
not relocate shared account data or import MESH authority into NEON. Shared entity
records and partner links require their declared traversal checks.

## 2. Application-to-field mapping

| Experience | Target rule |
| --- | --- |
| Application entry | Published BP app-entry capability; no implicit data grant |
| Directory | Explicit tenant-directory discovery profile with safe fields |
| Requests workspace | Request-workspace entry and applicable request visibility |
| Global record | Specific partner admission and permitted global projection |
| Roles & scope | Partner roles plus individually authorized assignment/configuration rows |
| Company configuration | Explicit validated company/organization context |
| Banking | Separate account, company usage, acceptance and reveal capabilities |
| Transactions | Business-service authority and eligibility, independent of directory read |
| Fields | Common field-policy groups applied to every projection and command |

Directory filters narrow results; they do not change the shell or grant authority.
Supplier/customer is a filter or applicability input. Eligibility for order,
invoice or payment requires a single valid transaction target and the existing
domain eligibility decision, which is rechecked at transaction commitment.

## 3. Context experience

The default record is labelled **Partner-wide**. The shell company is a suggested
default only when a company-specific surface explicitly adopts and validates it.
An overview filter is labelled **Overview company filter** and remains local.
Company configuration shows its actual **Company / Operating organization**.

Missing company context MUST NOT remove global identity or shared-data sections.
It MUST NOT silently remove an operation that the user can safely discover and
start by selecting an authorized target. Scope selectors offer only authorized
candidates; final commands revalidate them.

A unique valid candidate may be selected automatically with visible context.
Ambiguous candidates require selection. Selecting a company must not invent an
organization assignment, supplier activation, or payment eligibility.

## 4. Operation targets

The labels below define semantic operations. Final canonical keys must be mapped
to the existing metadata operation graph rather than added as component strings.

| Operation | Admission and target | Execution boundary |
| --- | --- | --- |
| Propose global identity change | Partner admission + global-change proposal capability | Global-steward workflow |
| Apply global identity change | Global master mutation capability | Partner version + approved change |
| Add supplier/customer role | Partner admission + role-proposal capability | New role target; no existing role requirement |
| Assign organization | Partner admission + authority over proposed organization | New assignment; no existing assignment requirement |
| Configure company | Authority over target organization/company and relevant role | Domain prerequisites + configuration version |
| Propose bank change | Authorized account/link target + bank-change capability | Existing bank governance |
| Accept bank usage | Company usage acceptance capability | Company-specific evidence and state |
| Reveal protected value | Specific account/registration reveal capability | Purpose, assurance, audit and expiry |
| Submit/approve/apply request | Separate workflow capability over request target | State, maker/checker, approval and policy checks |
| Add comment/attachment | Specific collaboration/document target authority | Existing owning-service policy |

For local users proposing changes to global master data, an explicit proposal
capability can route to a global steward. Organization administration alone does
not authorize global mutation. Grant migration must explicitly decide who gains
proposal authority and who retains steward approval/apply authority.

## 5. Responsibilities and field groups

| Responsibility | Typical scope |
| --- | --- |
| Directory reader | Explicit directory discovery coverage |
| Global steward | Tenant-local global master-data capabilities |
| Relationship manager | Assigned organizations |
| Supplier/customer configuration administrator | Assigned company/organization targets |
| Bank custodian | Explicit sensitive account and usage capabilities |
| Reviewer/approver | Applicable request target and separation-of-duties rules |
| Auditor | Explicit read/disclosure coverage |

These are responsibility templates, not automatically provisioned roles.

Field groups should distinguish directory identity, shared master details,
restricted contacts, masked tax values, masked bank values, company commercial
terms, governance evidence and system-managed values. Each group maps to exact
read/reveal/change/query policies. Related section providers, summaries, exports
and AI tools must use the same policy outcome. Missing values and restricted
values must not contribute identically to completeness or displayed counts.

## 6. Current implementation gaps to migrate

| Current behavior | Target correction |
| --- | --- |
| Tenant directory reads accommodate missing organization via fallback | Explicit directory admission profile and reviewed grant semantics |
| Header action resolver omits `scope_not_contained` decisions | Shared safe discovery decision with context selection |
| Header and section propose-change paths use different permissions | One operation binding used by both surfaces |
| Shell, URL and Overview selectors have different effects | Explicit context ownership and visible local-filter labels |
| Generic field checks and custom BP projections are separate paths | Shared policy mapping with provider parity checks |
| Some section policies use a single `scoped` boolean | Operation-specific typed coordinate requirements |
| Global/transaction data coexist within broad section labels | Independently authorized subresources |

These are observed design gaps, not evidence that every deployment or principal
has the same failure. The preceding root-cause investigation confirmed missing
organization coordinates deny organization-scoped header actions; it did not
validate the user's exact browser session.

## 7. Adoption sequence and qualification

1. Map current published operations, field groups, directory rules and grants to
   the generic profile. Pin baseline descriptor and binding revisions.
2. Resolve proposal versus apply authority for global data, first-role creation,
   target assignments, bank authority and credit/qualification coverage.
3. Implement the generic contract/compiler/resolvers and shared decision adapter.
4. Adapt BP list, record, tabs, sections, fields and command targets; avoid a
   header-only change that leaves execution and section rules inconsistent.
5. Compare shadow decisions for global reader/steward, single-company user,
   multi-company user, organization manager, bank custodian and approver.
6. Rehearse grant and publication changes; activate compatible artifacts using
   existing deployment governance, with explicit rollback evidence.

Minimum BP acceptance journeys:

- Discover Northwind without transaction context; read only permitted global data.
- Select an overview company without changing header command target implicitly.
- Configure an authorized company; reject an unauthorized or incompatible one.
- Create the first role/assignment while preserving parent and target checks.
- Show safe context-required actions; never expose targets under explicit denial.
- Show a company matrix with only authorized rows and safely derived counts.
- Read masked bank/tax data; separately authorize reveal and company usage.
- Propose global changes as a local requester; require global steward authority
  for approval/apply according to the published workflow.
- Revoke authority between opening a record and executing/approving a request.
- Preserve restrictions across direct APIs, exports, search, AI and historical views.

Acceptance means all relevant layers conform to the generic contract. Restoring
the four header buttons alone is not completion of this adoption.

## Shadow integration supplement (unapproved candidate only)

The runtime shadow adapter observes the installed permission gates and the
candidate profile independently. Legacy results remain authoritative. Candidate
operation bindings are projected only into a cloned verified snapshot; grants,
denials, ACLs, assurance and entitlements are unchanged. An installed-binding
result is recorded separately from this candidate-binding preview.

BP request create/read/update/validate/submit/decide/materialize gateways use an
organization coordinate verified by the existing owning request service and a
read-only catalog check. These gateway previews do not establish independent
case-record ownership, maker/checker execution parity or workflow eligibility.
Their candidate keys are `case_*`; create and subsequent mutations always require
preflight before execution. The BP Requests tab remains a parent-gated master
record section and is distinct from the organization-owned case directory.

Person/contact/address sensitive reads are separate capabilities; revealing bank
or tax values remains distinct from reading their masked representation. The
candidate includes person/workforce and sensitive master-data capabilities so
these existing provider gates can be compared. Capability grants remain subject
to named review. No new sensitive grant follows from general BP read access.

Unmapped or ambiguous installed operations are recorded as mapping gaps, never
silently mapped to a broader permission or counted as parity. Generic create/update now have preflight-required candidate mappings described
below. Unpublished direct-write operations remain unmapped. No candidate mapping
is approved for enforcement before the steward/requester review.

### Mapping decisions for the remaining observed DEV gates

These are shadow-only candidate mappings, not approved grants or activation:

- Canonical BP `create` is a proposed tenant-owned master operation. Canonical
  `update` (including the generic handler's `patch` key) is an existing tenant-owned
  master operation. Both require preflight; update also requires parent read.
  A candidate `preflight_required` result does not confer stewardship, prove an
  approved change, or authorize direct writes. Named role review remains mandatory
  before enforcing these candidate bindings.
- `neon.supplier.qualification.admin` retains the qualification service's coverage:
  organization coverage without a company, organization/company coverage when a
  company is specified. The candidate keys are `qualification` and
  `qualification_company`. These are proposed qualification gateways, not global
  BP master writes. The observer preserves the verified qualification control,
  maker/checker and creator facts supplied by the owning service. It never runs
  qualification creation/approval or its preflight a second time.
- Observation metadata identifies qualification service calls even when their
  authorization resources contain only scope coordinates. No BP ID is invented
  for an independently governed qualification. This qualifies gateway comparison,
  not independent record ownership or command execution parity.

### Authenticated provider qualification refinements

Supplier/customer company sections and per-assignment reads use explicit
`supplier_company_read` / `customer_company_read` candidates with validated
organization/company coordinates and parent admission. Sharing the canonical BP
read permission does not collapse those provider gates into global master reads.
The Requests tab preserves its `requests_read` identity through legacy directory
retries; it must not be compared as the separate organization-owned case directory.
These refinements affect advisory comparison only.
