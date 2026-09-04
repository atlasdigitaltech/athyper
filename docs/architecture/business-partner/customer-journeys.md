# Customer journeys

Status: product and architecture baseline; lifecycle implementation must be verified

## 1. Outcomes

Customer capability must let an organization become and remain a Customer without duplicating Business Partner identity and without allowing application data to become approved credit, designation or lifecycle authority.

The capability covers:

- internal or permitted external Customer initiation;
- new, existing and dual-role Business Partners;
- organization identity resolution;
- Customer role materialization;
- credit review and conditions;
- account designation and applicable scope;
- readiness-gated activation;
- credit, designation, profile and status lifecycle.

## 2. Personas

| Persona | Responsibilities | Must not do |
| --- | --- | --- |
| Internal requester/account owner | Start application and provide permitted business context | Approve own governed decision without authority |
| Customer applicant/admin | Provide permitted organization/application information | Browse NEON or another organization's case |
| Data steward | Validate organization identity and resolve duplicates | Set approved credit or lifecycle state indirectly |
| Credit analyst | Assess requested credit and prepare decision | Mutate organization identity as part of credit review |
| Credit approver | Approve/reject/condition credit within delegated scope | Exceed authority or self-approve where prohibited |
| Account designation reviewer | Decide classification/designation and scope | Use designation as a hidden lifecycle transition |
| Customer lifecycle operator | Execute permitted activation/status command | Bypass readiness, version or transition checks |
| Auditor/support | Inspect purpose-bound evidence and history | Unrecorded reveal or mutation |

## 3. Preconditions and triggers

A Customer journey begins when:

1. an internal requester proposes a new Customer organization;
2. an existing Business Partner needs the Customer role;
3. an existing Supplier becomes dual-role;
4. an accepted external/MESH proposal requires recipient-local Customer onboarding.

Every trigger pins a definition release, recipient tenant, intended role and applicable organization/company/geographic context. External data is a proposal, not Customer authority.

## 4. Customer onboarding

```text
request/application
  -> establish authorized context
  -> instantiate journey, case and tasks
  -> resolve existing Business Partner candidates
  -> collect missing organization and Customer application data
  -> collect and validate evidence
  -> link / no-match / merge decision when needed
  -> submit immutable checkpoint
  -> organization/role approval
  -> materialize BP if absent and one Customer role
  -> credit review
  -> account designation
  -> deterministic readiness
  -> activate through Customer lifecycle command
  -> project permitted portal/IAM state and notify
```

If an existing Business Partner is selected, organization identity is reused and only the missing Customer role and approved Customer-specific data are created. If it already has a Supplier role, the result is one dual-role Business Partner.

## 5. Credit review

Credit review is the sole authority for approved credit limit and currency. It records separately:

- requested limit/currency;
- approved limit/currency, only for approved or conditional outcomes;
- conditions and expiry/review date;
- evidence and risk inputs;
- decision scope;
- maker, checker and delegated authority evidence;
- decision and ruleset versions.

Application fields, enrichment, risk narratives and AI output are inputs. They must never write an approved credit limit directly.

Outcomes must distinguish pending, approved, conditional and rejected. A conditional outcome must expose machine-readable conditions so readiness can evaluate them deterministically.

## 6. Account designation and scope

Customer classification/designation is governed separately from credit. Effective-dated scope may include operating organization, company, geography, channel or another approved target. Scope rules are normalized, explicit and non-overlapping where policy requires.

The UI must show which decision applies to the selected work context and why. It must not hide a missing designation by falling back to an unrelated scope.

## 7. Readiness and activation

The readiness resolver evaluates approved identity, required evidence, credit, designation, scope, policy and other deterministic prerequisites. It emits stable reason codes.

The product maps each blocking reason to:

- responsible owner;
- evidence or decision required;
- case/action that can clear it;
- relevant scope and effective date.

Atlas may explain the path and draft cases. Only the Customer lifecycle command may change Customer status.

## 8. Customer lifecycle

The target lifecycle contains five explicit actions:

```text
activate -> active
suspend -> suspended
reactivate -> active
deactivate -> inactive/deactivated
archive -> archived
```

Exact source and target state names must be reconciled with the implemented command under `BP-Q002`. Each action must define:

- allowed source states;
- required permission/elevation;
- expected version and idempotency behavior;
- readiness fingerprint where required;
- reason and evidence requirements;
- effects on portal/IAM and downstream projections;
- notification policy;
- audit, mutation evidence and outbox event;
- rollback and reconciliation behavior.

Wrong-tenant, not-found, stale-version, invalid-transition and denied outcomes remain distinguishable.

## 9. Ongoing controls

Ongoing Customer operations include:

- periodic or event-triggered credit review;
- credit-condition monitoring;
- account redesignation;
- organization/profile change proposals;
- tax and address changes;
- suspension and reactivation;
- deactivation and archival;
- portal access reconciliation;
- point-in-time evidence and audit access.

A changed credit decision or designation does not silently change Customer lifecycle state. The readiness resolver and explicit lifecycle command determine the operational consequence.

## 10. UI experiences

Required experiences are:

- Customer case inbox and onboarding workspace;
- existing-BP and dual-role resolution;
- evidence and identity candidate review;
- credit application/review/decision workspace;
- designation and effective-scope workspace;
- readiness and lifecycle controls;
- credit/designation history;
- point-in-time Business Partner 360 with Customer lens;
- audit, snapshot, evidence and lineage views;
- portal/IAM projection status where applicable.

The Customer lens must reuse the common record and case contracts while retaining Customer-specific decisions and terminology.

## 11. Notifications and Atlas

Minimum events include application submitted/returned/decided, credit review required/conditional/expiring, designation changed/expiring, activation blocked/complete, suspension, reactivation, deactivation and archive.

Atlas may provide cited explanations, validation assistance, evidence extraction, identity candidates and readiness guidance. It may not approve credit, assign designation or execute a lifecycle transition autonomously.

## 12. Acceptance traceability

This journey is proven by `BP-CUS-001` through `BP-CUS-008` and applicable `BP-X-*` scenarios in [acceptance-scenarios.md](acceptance-scenarios.md).

