# Supplier journeys

Status: product and architecture baseline; implementation status requires evidence

## 1. Outcomes

Supplier capability must let an organization become and remain an approved supplier without creating duplicate organization identity or allowing MESH, a form, an AI proposal or a browser action to bypass NEON authority.

The capability covers:

- internal Supplier initiation;
- invitation-backed onboarding;
- MESH-existing and MESH-new Supplier onboarding;
- supplier self-registration subject to sponsorship policy;
- organization identity resolution;
- qualification, banking readiness and activation;
- profile, qualification, relationship and status changes;
- controlled suspension, reactivation, deactivation or archival as approved by product policy.

## 2. Personas

| Persona | Trust context | Responsibilities | Must not do |
| --- | --- | --- | --- |
| Internal requester | Workforce tenant/plane/org context | Request Supplier onboarding and provide internal assertions | Approve own request without authority |
| Supplier applicant | Restricted invitation-bound context | Provide permitted organization fields and evidence | Browse NEON, other invitations or internal comments |
| Supplier administrator | MESH account and relationship scope | Maintain published profile, disclosures and proposals | Directly mutate recipient NEON records |
| Data steward | NEON scoped role, elevated when required | Validate, resolve identity and request correction | Circumvent maker/checker or reveal policy |
| Qualification reviewer | NEON decision scope | Decide qualification with evidence and review date | Activate Supplier or change organization identity incidentally |
| Approver | Assigned governed task and scope | Approve/reject materialization or lifecycle transition | Edit evidence to manufacture approval |
| Bank verifier | Purpose-bound financial permission/elevation | Verify protected banking evidence | Expose full bank values through general profile UI |
| Auditor/support | Purpose-bound read or recorded support path | Inspect evidence, lineage and audit | Unrecorded reveal or mutation |

## 3. Preconditions

An onboarding journey starts from one of four triggers:

1. An internal requester nominates an organization.
2. A buyer sends a bounded, expiring invitation to a known or new MESH account.
3. A supplier responds to a permitted self-registration path.
4. An accepted MESH profile proposal requires a recipient-local Supplier role.

Every trigger must identify the recipient tenant, intended role, requested relationship/capability, pinned definition release and permitted applicant identity claims. A trigger creates no Supplier authority by itself.

## 4. Supplier onboarding

### 4.1 Journey

```text
request or invitation
  -> authenticate and establish bounded context
  -> instantiate journey, case and required tasks
  -> resolve existing organization/canonical-party candidates
  -> collect only required organization and Supplier data
  -> stage, scan and activate evidence
  -> deterministic validation
  -> link / no-match / merge review when needed
  -> submit immutable checkpoint
  -> independent approval or return/reject
  -> materialize Business Partner if absent
  -> add one Supplier role
  -> create approved children and recipient-local MESH link
  -> qualification and bank verification
  -> readiness-gated activation
  -> notify authorized participants and acknowledge MESH
```

### 4.2 Progressive collection

The runtime derives required fields and evidence from:

- pinned Supplier onboarding definition;
- country, organization type and requested commodity/category;
- recipient operating organization/company scope;
- already approved NEON data;
- authorized and sufficiently fresh MESH disclosures;
- qualification, banking and risk policies.

The user is asked only for missing, changed or expired information. Previously approved data is read-only unless the user explicitly proposes a change. A progressive form must not silently omit a requirement because a source is unavailable or stale.

### 4.3 Identity resolution

Identity resolution runs before new organization materialization and again when evidence materially changes identity attributes. Candidate presentation includes:

- stable candidate identifier;
- matched normalized identifiers and aliases;
- attributable score features;
- source and freshness;
- conflicting fields;
- protected-field treatment;
- policy threshold and model/ruleset version where applicable.

The steward records link, merge, no-match or dispute. A merge is maker/checker controlled, retains before/after snapshots and never rewrites historical identifiers.

### 4.4 Evidence

Typical evidence may include organization registration, tax registration, insurance, certification, beneficial ownership and protected banking proof. The exact list is definition- and jurisdiction-driven.

Uploads move through staged, uploading, scanning, extracting, active, quarantined, replaced and expired conditions. Only active evidence may satisfy a deterministic requirement. Extraction output is a proposal with confidence and source spans; it never silently becomes approved master data.

### 4.5 Decision and materialization

Submission revalidates against the pinned release and creates an immutable submitted snapshot. Approval requires an assigned task, authorized scope and maker/checker separation. Materialization reads the approved decision snapshot, not mutable form state.

Materialization must be idempotent and produce:

- one recipient-local Business Partner if identity resolution approved creation;
- one Supplier role for that Business Partner's lifetime;
- approved normalized children;
- an approved recipient-local MESH account link when applicable;
- result snapshot and lineage;
- mutation evidence, audit and outbox events.

## 5. Qualification, banking and activation

Qualification is a scoped decision. Scope may include category/commodity, industry, operating organization, company, geography or an approved combination. The decision records evidence, reviewer, effective period, conditions and next review date.

Banking data follows a protected verification workflow. General UI and MESH projections expose only approved masked values or fingerprints. A bank change invalidates affected readiness until the governing policy is satisfied.

Supplier activation is permitted only when the deterministic readiness resolver reports no blocking reason. The UI may explain reason codes and prepare the cases that clear them; it cannot override the resolver.

## 6. Supplier lifecycle

### 6.1 Governed changes

Changes to organization profile, tax, banking, capability, qualification or commercial scope create proposals or decisions under their owning authority. An incoming MESH profile update uses three coordinates:

- A: previously accepted baseline;
- B: current recipient-local approved state;
- C: incoming disclosed proposal.

B-only changes remain local, C-only changes may be proposed, identical changes are accepted as unchanged, conflicts require explicit resolution, and locally governed fields are never overwritten by profile exchange.

### 6.2 Qualification monitoring

Deterministic events—such as certificate expiry, bank change, risk-policy change or a new qualification release—may open a scoped requalification case and assign work. AI may summarize the trigger and prepare missing-information requests. It cannot grant or revoke qualification.

### 6.3 Status transitions

The exact Supplier states and transition names require product approval under `BP-Q003`. The minimum behavior to specify and test is:

```text
onboarding -> active
active -> suspended -> active
active/suspended -> deactivated
deactivated -> archived, when retention policy permits
```

No transition deletes historical evidence. Suspension/deactivation consequences for MESH capabilities, procurement access and IAM projections must be explicit and independently reconciled.

## 7. UI experiences

Required experiences are:

- internal Supplier case inbox and workspace;
- restricted applicant onboarding workspace;
- MESH relationship detail and capability management;
- evidence/extraction review;
- identity candidate and merge/link/no-match decision;
- approval/return/reject workspace;
- qualification, banking and readiness workspaces;
- profile-change three-way comparison;
- history, snapshot, lineage and audit views;
- activity/notification center;
- operational exception and acknowledgement console.

Every experience covers loading, empty, restricted, scope-required, partial-provider, stale, conflict, validation, error and historical read-only states as applicable.

## 8. Notifications

Minimum domain events include invitation issued/expiring/cancelled, draft resumed, evidence quarantined, submitted, returned, approved, rejected, materialized, qualification expiring/expired, banking reverification required, activation blocked/complete, profile proposal quarantined/accepted and relationship capability changed.

Recipients and channels are policy-driven. Notifications contain safe summaries and deep links, never protected tax, bank or identity payloads. Delivery failure does not roll back or repeat the domain command.

## 9. Atlas assistance

Initial allowed assistance:

- cited readiness and decision explanation;
- validation finding explanation;
- evidence extraction review;
- draft correction proposal;
- attributable duplicate candidates;
- three-way conflict resolution draft;
- requalification summary.

All output is untrusted input. Mutations require schema validation, policy checks, affected-entity and version preview, explicit confirmation, and server-side reauthorization.

## 10. Acceptance traceability

This journey is proven by `BP-SUP-001` through `BP-SUP-010` and applicable `BP-X-*` scenarios in [acceptance-scenarios.md](acceptance-scenarios.md).

