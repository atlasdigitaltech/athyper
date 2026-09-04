# Supplier-provided Workforce journeys

Status: product and architecture baseline; commercial and privacy decisions required

## 1. Purpose

This document covers people supplied by a Supplier to perform work for a recipient organization. It does not cover the Supplier organization's onboarding, and it does not automatically include the recipient's internal employee onboarding.

The capability begins only after the supplier relationship and applicable commercial capability are valid. Where MESH is used, `services_procurement` or its approved successor must be active; a requested capability grants nothing.

## 2. Subject boundaries

| Subject | Meaning | Authority implication |
| --- | --- | --- |
| Supplier Business Partner | The supplying organization | Must be approved and sufficiently ready for the requested service |
| MESH relationship/capability | The permitted cross-tenant exchange relationship | Bounds disclosure; does not create a worker |
| Workforce requisition | Recipient demand for people/skills/time | Authorizes sourcing activity, not engagement or access |
| Candidate submission | Supplier's purpose-bound proposal of a person | Remains a proposal until recipient decision |
| Candidate snapshot | Recipient-specific disclosed candidate data | Must not become a reusable global profile |
| Work order/SOW | Commercial instrument defining supplied work | Does not itself create Person identity or IAM access |
| Worker engagement | Approved relationship between recipient, person and commercial instrument | Preconditions Person/external-worker materialization |
| Person | Recipient-local natural-person identity | Separate from Supplier and login identity |
| External worker | Contingent role held by a Person | Separate from an active placement or entitlement |
| Operational placement | Company/site/project/role/dates assignment | Defines operational scope; does not replace IAM policy |
| IAM projection | Desired bounded identity/access state | Created only from approved engagement/placement and reconciled independently |

## 3. Personas

| Persona | Trust context | Responsibilities | Prohibited |
| --- | --- | --- | --- |
| Workforce requester/hiring manager | Internal tenant/org context | Create requisition, evaluate business fit, confirm placement need | See protected data unrelated to evaluation; grant IAM directly |
| Procurement/engagement owner | Internal commercial scope | Approve supplier, work order/SOW and commercial terms | Select candidate by changing protected evidence |
| Supplier recruiter/coordinator | Supplier MESH account and active capability | View permitted requisitions, disclose candidates, answer correction requests | Browse other suppliers or recipient-internal data |
| Candidate | Restricted candidate-bound session | Consent, provide permitted identity/evidence, correct own data | View internal rankings, other candidates or recipient systems |
| Compliance reviewer | Purpose-bound/elevated role | Verify identity, eligibility and policy evidence | Use protected attributes outside approved purpose |
| Evaluator | Assigned requisition/selection scope | Record evaluation against published criteria | Change candidate identity/evidence |
| Engagement approver | Maker/checker governed task | Approve/reject engagement | Self-approve or exceed commercial/delegated scope |
| Site/security administrator | Approved placement context | Complete site/security readiness and monitor provisioning | Expand access beyond placement ceiling |
| Auditor/support | Purpose-bound read or recorded support path | Inspect evidence and lifecycle | Unrecorded reveal or mutation |

## 4. Preconditions

Before a requisition can be issued to a Supplier:

- Supplier Business Partner and Supplier role exist;
- relationship and required capability are active for the effective period;
- Supplier qualification covers the service, category and recipient scope;
- commercial framework permits the intended work model;
- approved requisition, candidate disclosure and engagement definitions exist;
- privacy purpose, retention, residency and recipient field set are published;
- recipient owners, approvers and SLA are assigned.

A lapse may block new submissions while allowing governed handling of already-engaged workers according to legal and operational policy. The policy must be explicit; it cannot be inferred from UI state.

## 5. Requisition journey

```text
workforce demand
  -> create governed requisition draft
  -> choose approved supplier(s), scope and disclosure purpose
  -> define role/skills, quantity, location, dates and evaluation criteria
  -> validate budget/commercial/qualification prerequisites
  -> independent approval where required
  -> publish recipient-specific request through MESH
  -> supplier acknowledgement
  -> monitor expiry, fulfilment and amendments
```

Requisition publication creates no candidate, Person, engagement, placement or IAM authority.

Amendment after candidate submission must identify whether the change is compatible, requires candidate reconfirmation or invalidates submissions. Closure and cancellation retain submitted evidence and acknowledgements.

## 6. Candidate disclosure and application

### 6.1 Supplier submission

The Supplier selects a requisition and prepares a candidate disclosure using the exact published contract and field set. The envelope identifies sender, recipient, relationship, capability, requisition, purpose, contract release, classification ceiling, correlation, idempotency and signature/hash evidence.

Only purpose-required candidate data may be disclosed. Organization profile publication is not a valid channel for candidate information.

### 6.2 Candidate participation

Where direct candidate action is required, IAM establishes a short-lived, candidate-bound restricted session. The candidate can:

- see the recipient, purpose and requested information;
- acknowledge privacy/terms and provide consent where legally required;
- complete permitted fields;
- upload or replace required evidence;
- save/resume and respond to corrections;
- see a safe status summary;
- withdraw where policy permits.

The candidate cannot access Supplier administration, NEON navigation, other candidates, internal comments, ranking, decisions or eventual worker systems.

### 6.3 Receive and quarantine

The recipient authenticates, verifies signature/hash, checks relationship/capability/purpose, resolves the contract, transforms compatibly, validates classification and scans evidence. Failure produces a rejected or quarantined acknowledgement; it does not partially create Person or Workforce authority.

## 7. Evaluation and selection

Evaluation uses published, job-related criteria with assigned evaluators and immutable evidence. The experience must separate:

- objective eligibility or compliance finding;
- evaluator score/comment;
- commercial comparison;
- selection recommendation;
- governed selection decision.

AI may summarize disclosed evidence or draft a comparison only after bias, privacy and model-risk approval. It may not infer protected attributes, rank candidates autonomously, reject a candidate or execute selection.

A selection outcome records requisition, candidate submission/snapshot, criteria release, evaluators, conflicts of interest, decision reason and expected next action. Non-selected candidate retention and notification follow published policy.

## 8. Work order/SOW and engagement

Selected candidates proceed only when the required commercial instrument is approved and effective. The engagement binds:

- recipient and Supplier;
- candidate/Person coordinate;
- requisition and selection evidence;
- work order or statement of work;
- role/service and commercial scope;
- start/end dates;
- company, site/project and manager;
- compliance and readiness requirements;
- termination and extension terms.

Engagement approval is maker/checker controlled where policy requires. An approved engagement may request materialization; it does not directly write Person, external-worker, placement or IAM rows.

## 9. Person, external worker and placement

Materialization must resolve an existing Person before creating one. Person identity resolution is purpose-bound and separate from organization matching.

On approval, governed commands create or link:

- recipient-local Person;
- protected profile and approved evidence references;
- external-worker role;
- engagement;
- operational placement;
- result snapshot, lineage, mutation evidence, audit and outbox.

Historical Person identifiers, engagements and placements are preserved. A renewed or subsequent engagement should reuse Person identity after governed resolution rather than create another person.

## 10. IAM provisioning

IAM provisioning starts from an approved, effective engagement and ready placement. The access ceiling is the intersection of:

- recipient tenant and application projection;
- worker type and permitted role;
- company/operating organization;
- site/project/assignment;
- effective dates;
- policy and required-action state;
- current engagement and placement status.

Provisioning is an observable saga with desired state, attempts, external-provider correlation, result and reconciliation. A successful engagement command does not imply successful IAM delivery.

The user experience exposes pending, required action, provisioned, partially failed, suspended, deprovisioning, deprovisioned and reconciliation-needed states without leaking provider secrets.

## 11. Workforce lifecycle

Supported governed changes include:

- engagement extension or early end;
- work order/SOW amendment;
- placement transfer or changed manager/site/project;
- compliance or credential renewal;
- temporary suspension;
- return from suspension;
- supplier or commercial-instrument change where policy allows;
- security termination;
- normal end and offboarding.

Every change is effective-dated and versioned. It identifies its consequences for evidence, access, physical/site readiness, downstream projections and notifications.

### 11.1 Suspension and termination

Security termination and normal end may have different notification and evidence handling, but both must deterministically converge IAM and operational state.

Termination must:

1. record the authorized reason and effective time;
2. close or end affected placement/engagement according to policy;
3. increment or otherwise invalidate the authorization epoch;
4. issue bounded deprovisioning requests;
5. reconcile provider results and escalate failures;
6. retain audit, evidence and legal-hold coverage;
7. prevent an old invitation, confirmation token or idempotent replay from restoring access.

Deleting Person history is not a termination mechanism.

## 12. UI experiences

Required experiences are:

- requisition create/approve/publish/track;
- Supplier requisition inbox and candidate submission;
- restricted candidate consent/application/evidence workspace;
- recipient receive/quarantine and correction console;
- candidate comparison and evaluation;
- selection decision;
- work order/SOW and engagement workspace;
- Person identity resolution;
- placement/readiness workspace;
- IAM provisioning and reconciliation status;
- extension, transfer, suspension, termination and offboarding;
- evidence, snapshot, lineage, audit and legal-hold views.

Protected information is hidden by default and omitted entirely when the viewer lacks purpose and permission. Masking is not a substitute for server-side field omission.

## 13. Notifications

Minimum events include requisition published/amended/expiring/closed, candidate disclosure received/quarantined/correction-required/withdrawn, evaluation assigned, selection outcome, commercial instrument pending/approved, engagement ready/blocked/starting/ending, compliance expiring, placement changed, IAM action required/provisioned/failed, suspension, termination and deprovisioning failure/complete.

Candidate communications must be legally reviewed, accessible and free of internal scoring or protected data. Security termination notifications follow a restricted policy and must not alert an account before required containment action.

## 14. Acceptance traceability

This journey is proven by `BP-WRK-001` through `BP-WRK-010` and applicable `BP-X-*` scenarios in [acceptance-scenarios.md](acceptance-scenarios.md).

