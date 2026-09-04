# Business Partner capability documentation

Status: Phase 0 architecture accepted; later product scope decisions remain open

Scope: Business Partner organizations, Supplier and Customer commercial roles, and supplier-provided Workforce

This documentation defines the product, architecture and evidence-backed execution baseline. It consolidates the repository audit in
[`../business-partner-experience-plan.md`](../business-partner-experience-plan.md), the governed lifecycle ADR, and the detailed working proposals reviewed on 2026-09-04.

It does not claim that every described capability is implemented or production-qualified. Current-state claims must be backed by repository or target-environment evidence.

## Read this first

The capability contains three related but distinct subject types:

1. A **Business Partner** is a recipient-local external organization in NEON.
2. A **Supplier** or **Customer** is a commercial role held by that organization. A dual-role organization remains one Business Partner.
3. A **supplier-provided worker** is a person supplied under a relationship, requisition, work order or statement of work. The person is not a Business Partner.

The word **workforce** is also used for internal employees operating the product. Documentation must therefore distinguish:

- workforce requester, steward or approver: an internal user;
- supplier administrator or recruiter: a user acting for a supplier organization;
- candidate or external worker: a person proposed or engaged through that supplier.

## Document map

| Document | Purpose |
| --- | --- |
| [Scope and domain model](scope-and-domain-model.md) | Subject boundaries, authority, shared lifecycle, data movement and invariants |
| [Supplier journeys](supplier-journeys.md) | Supplier onboarding, qualification, activation and lifecycle |
| [Customer journeys](customer-journeys.md) | Customer onboarding, credit/designation, activation and lifecycle |
| [Supplier Workforce journeys](supplier-workforce-journeys.md) | Requisition, candidate disclosure, engagement, placement and deprovisioning |
| [Acceptance scenarios](acceptance-scenarios.md) | Stable scenario identifiers, expected outcomes and cross-cutting quality requirements |
| [Decision register](decision-register.md) | Decisions already made, decisions requiring approval, and known source inconsistencies |
| [Implementation status](implementation-status.md) | Point-in-time repository evidence by capability and delivery level |
| [Build plan](build-plan.md) | Workstreams, scenario mapping and the first executable vertical slice |
| [Phase 0 baseline](phase-0-baseline.md) | Frontend health, route/catalog/operation inventory, relay corrections and release status |
| [Protected documents](protected-documents.md) | Classification floors and target-environment storage qualification checklist |
| [Notification matrix](notifications.md) | Event, recipient, delivery, template and deep-link policy |

Supporting sources:

- [`../decisions/governed-entity-lifecycle.md`](../decisions/governed-entity-lifecycle.md) remains normative for the governed entity lifecycle.
- [`../decisions/business-partner-phase-0.md`](../decisions/business-partner-phase-0.md) records the accepted authority, applicant, workflow UI, document, notification and release decisions.
- [`../business-partner-experience-plan.md`](../business-partner-experience-plan.md) is the point-in-time repository audit and experience proposal.
- [`../frontend-first-business-module.md`](../frontend-first-business-module.md) governs frontend module composition.

If this package conflicts with the governed lifecycle ADR, the ADR wins until a new architectural decision is approved. If a current-state statement conflicts with executable repository evidence, the evidence wins and this package must be corrected.

## Capability map

```text
Business Partner organization
├── Supplier role
│   ├── onboarding and identity resolution
│   ├── qualification, banking and activation
│   └── profile, qualification and relationship lifecycle
├── Customer role
│   ├── onboarding and identity resolution
│   ├── credit, designation and activation
│   └── credit, account and status lifecycle
└── Supplier relationship
    └── Supplier-provided Workforce
        ├── requisition and candidate disclosure
        ├── evaluation, selection and engagement
        ├── Person/external-worker materialization
        └── placement, IAM provisioning and deprovisioning
```

## Documentation rules

Every journey specification identifies:

- actors and their trust context;
- the owning authority for each mutation;
- prerequisites and terminal outcomes;
- happy, return, rejection, conflict and replay paths;
- evidence and sensitive-data boundaries;
- notifications and operational signals;
- required UI experiences without treating UI visibility as authorization;
- stable acceptance-scenario identifiers.

The build plan traces workstreams and the first vertical slice to acceptance scenarios. A screen, route or component is not complete merely because it renders.

## Delivery dependency summary

This is the dependency summary; detailed workstreams and relative sizing are in [build-plan.md](build-plan.md):

```text
Baseline and approved contracts
  -> governed case/evidence/decision foundation
     -> Supplier onboarding
        -> Supplier lifecycle
        -> Supplier-provided Workforce
     -> Customer onboarding
        -> Customer lifecycle
  -> Studio authoring, operational proof and legacy retirement
```

Customer work may proceed in parallel with Supplier lifecycle work after the common foundation is proven. Supplier-provided Workforce must not begin as a Business Partner extension; it depends on an approved supplier relationship and the People/Workforce authority model.

## Readiness for implementation commitment

The proposed build plan is ready to become an implementation commitment when:

- the decisions required for the selected release slice are approved;
- the remaining disputed product semantics have accountable-owner decisions;
- product owners approve the journey outcomes and personas;
- security and privacy approve applicant, candidate and protected-profile boundaries;
- every Phase 1 candidate scenario has an accountable owner and test fixture;
- the target release boundary is chosen: internal supplier, invited supplier, Customer, or supplier Workforce.
