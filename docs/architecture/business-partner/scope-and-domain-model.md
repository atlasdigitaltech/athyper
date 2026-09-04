# Scope and domain model

Status: proposed architecture baseline

## 1. Purpose

This document defines the boundary between Business Partner organization management, Supplier and Customer commercial roles, and supplier-provided Workforce. It prevents the shared onboarding mechanics from collapsing distinct authorities into one aggregate or one application.

## 2. Subject model

### 2.1 Business Partner

A Business Partner is NEON's recipient-local representation of an external organization. It owns organization identity and approved organization-level attributes. It is not:

- a natural person;
- a tenant or login identity;
- a MESH network account;
- a Supplier or Customer role duplicated as another organization;
- proof that a network relationship or IAM grant exists.

One Business Partner may hold neither, one or both commercial roles. Adding a role must reuse the organization after governed identity resolution.

### 2.2 Supplier

A Supplier is a thin commercial role of a Business Partner. Supplier-specific authorities include qualification, preference, company or operating-organization configuration, banking readiness and supplier activation. Supplier state must not duplicate legal name, organization identity or unrelated Customer control data.

### 2.3 Customer

A Customer is a thin commercial role of a Business Partner. Customer-specific authorities include credit review, account designation, applicable scope and the Customer lifecycle. Customer state must not duplicate the organization or Supplier control data.

### 2.4 Supplier-provided Workforce

A supplier-provided worker is a person proposed and, if selected, engaged through an approved supplier relationship. The lifecycle may involve:

- workforce requisition;
- candidate disclosure;
- evaluation and selection;
- work order or statement of work;
- engagement;
- Person and external-worker materialization;
- operational placement;
- IAM projection and access lifecycle.

The supplier organization, candidate, Person, external-worker role, engagement, placement and IAM projection are separate coordinates. Creating one must not silently create or authorize the others.

## 3. Authority model

| Concern | Sole authority | Permitted input | Prohibited shortcut |
| --- | --- | --- | --- |
| Semantic fields, forms, rules, journeys and releases | Studio | Human or Atlas-authored drafts | Runtime plane silently changes a published definition |
| Network account, relationship, capability and disclosure | MESH | Counterparty request and Studio release | Requested capability treated as active authority |
| Operational Business Partner and roles | NEON | Internal case or accepted MESH proposal | MESH or Studio writes NEON master rows directly |
| Supplier qualification and preference | NEON control authority | Evidence and approved scope | AI or MESH grants qualification |
| Customer credit and designation | NEON control authority | Application, evidence and approved scope | Form data writes an approved credit limit |
| Workflow/case decision | Owning plane's governed command | Human decision over evidence | UI, Atlas or notification handler changes status directly |
| Person and protected profile | People/Workforce authority | Approved candidate and engagement data | General BP/profile exchange publishes protected Person data |
| External-worker engagement and placement | People/Workforce authority | Approved requisition, selection and commercial instrument | Supplier relationship alone creates worker access |
| Authentication and authorization context | IAM/runtime policy | Desired-state projection with bounded scope | Canonical party, BP or MESH account ID grants access |
| Attachment metadata and evidence linkage | Document domain in owning plane | Upload/extraction results through commands | Object key or reusable signed URL exposed as domain data |
| Attachment bytes | Object Storage | Document service-controlled access | Object Storage becomes workflow authority |
| Notification delivery | Notification Channel | Committed domain event and recipient policy | Delivery result implies domain success |
| Explanation and draft action | Atlas | Authorized, cited reads | Atlas owns state or bypasses confirmation/command |

Studio, MESH and NEON are the three authoritative data planes for this capability. IAM, Object Storage, Notification Channel and Atlas are shared capabilities with bounded authority; they are not an additional Business Partner data plane.

## 4. Identity and correlation

The following identifiers answer different questions and must not be used interchangeably:

| Identifier | Answers | Does not prove |
| --- | --- | --- |
| Canonical party | Which real-world party records may correlate? | authorization, tenancy or a commercial role |
| IAM organization/principal | Who is authenticated and in what context? | NEON master ownership or MESH relationship |
| MESH network account | Which tenant-owned endpoint exchanges data? | a recipient-local Business Partner exists |
| Business Partner | Which external organization does this NEON recipient operate with? | supplier/customer qualification or network access |
| Supplier/Customer role | Which commercial role does the BP hold locally? | Person identity or supplier relationship capability |
| Person | Which natural person is represented locally? | active employment, engagement or login access |
| External worker | Which contingent-worker role does a Person hold? | a current engagement, placement or IAM entitlement |

Identity resolution produces an attributable candidate set and a governed link, merge or no-match decision. A correlation hint is not an authorization decision.

## 5. Common governed lifecycle

All organization, role and Workforce proposals use the common governance principles even when their owning aggregates differ:

```text
definition release
  -> journey/case instantiation
  -> collect draft and evidence
  -> deterministic validation
  -> identity/match or conflict review
  -> human decision
  -> governed materialization
  -> readiness/activation or engagement
  -> operation, monitoring and controlled change
  -> suspension/termination/archive with retained history
```

Every active case is pinned to an immutable definition release. An upgrade requires an explicit compatible transform or a governed migration decision.

## 6. Command invariants

Every mutation must:

1. Authenticate and authorize at the exact-plane server route.
2. Validate tenant, organization/company scope, actor and command arguments.
3. Carry an idempotency key and, for an existing aggregate, an expected version.
4. Recheck the pinned contract and deterministic policy.
5. Commit the state change with applicable snapshot, evidence, audit, lineage and outbox records atomically.
6. Return distinguishable outcomes for accepted, exact replay, stale version, invalid transition, wrong scope, not found and denied.

UI visibility is never authorization. Cross-plane messages remain proposals until the receiving authority accepts them.

## 7. Evidence and data classification

Evidence requirements derive from the pinned journey definition and purpose. At minimum, distinguish:

- public organization profile;
- internal operational information;
- confidential commercial information;
- tax and bank information;
- identity and immigration evidence;
- protected Person and workforce information;
- security and IAM evidence.

Notifications and Atlas conversations must reference authorized evidence rather than copy protected payloads into generic history. Sensitive reveals require purpose, permission, optional recent elevation and audit evidence.

Candidate or worker data must never be published through general Supplier profile disclosure. Only a purpose-bound, recipient-specific Workforce disclosure may cross MESH.

## 8. Shared experience model

The product presents several bounded experiences over the governed lifecycle:

- NEON Business Partner and decision workspaces for internal users;
- MESH account, relationship, capability, disclosure and exchanged-proposal workspaces;
- a restricted invitation-bound applicant surface;
- a restricted candidate/worker surface distinct from Supplier organization onboarding;
- Studio definition, test, simulation and publication workspaces;
- the shared activity center and existing Atlas workspace.

Generic case, evidence and decision components may be extracted only after their contracts are proven in a real vertical slice. Plane packages retain plane-specific adapters, authority language and commands.

## 9. Cross-cutting lifecycle states

Concrete database states remain defined by their owning authority. Product documentation uses these common concepts:

| Concept | Meaning |
| --- | --- |
| Draft | Editable proposal; no operational authority |
| Submitted | Immutable submission checkpoint awaiting governed work |
| In review | Assigned validation, matching or decision work exists |
| Returned | Specific permitted fields/evidence reopened for correction |
| Approved/Rejected | Human decision recorded with evidence |
| Materializing | Governed projection into operational authority is running |
| Materialized | Operational aggregate/role/person result exists and is linked |
| Conflicted/Quarantined | No automatic progress; explicit resolution required |
| Cancelled/Expired | Proposal cannot progress without a new governed action |

These are experience concepts, not permission to create a second status column outside the owning command model.

## 10. Out of scope for this baseline

- Autonomous approval, merge, qualification, credit or worker selection.
- A new cross-plane Business Partner application or database.
- Replacing IAM with canonical-party correlation.
- Publishing protected Person data as organization profile data.
- Treating notification delivery as workflow completion.
- A new Atlas conversation or confirmation container.
- Production certification based solely on local code coverage.

