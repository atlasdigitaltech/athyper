# NEON external workforce and services-procurement DDL design

**Status:** Additive target DDL foundation

**Effective:** 2026-08-29

**Parent:** [Athyper Business Partner architecture](./athyper-business-partner-architecture-design.md)

## Decision

NEON distinguishes internal employment from external commercial engagement:

```text
master.person
  +-- master.employee -> master.employment -> master.work_assignment
  `-- master.external_worker -> document.worker_engagement
                                  `-- document.worker_operational_placement
```

The two roles are independently optional. No exclusion constraint exists between `employee.person_id` and `external_worker.person_id`; the same natural person may be an employee and an external worker concurrently or at different times. External engagement never creates buyer employment, payroll eligibility, statutory enrollment, benefits, or employee headcount.

## Reused authority

| Existing authority | Reuse |
|---|---|
| `master.business_partner`, `master.person` | Natural-person identity and protected PII boundary |
| `master.supplier` | Staffing agency, employer of record, independent-contractor supplier, or SOW supplier |
| legal entity, company, org unit, position, manager, site, cost/profit center, project | Buyer operational and accounting scope |
| `document.purchase_requisition` | Optional upstream spend authorization; not the workforce sourcing lifecycle |
| `document.workflow_request` | Pinned approval execution for each governed aggregate |
| `document.commitment` | Purchase-order/contract commitment produced from an accepted work order or SOW |
| `document.content_item` and attachments | Protected CV, receipt, certificate and compliance evidence content |
| `document.purchase_invoice` and line | AP invoice authority |
| snapshots, audit, outbox and RLS | Version evidence, event delivery and tenant isolation |

`document.business_partner_request` remains the only identity/role creation boundary. It does not approve requisitions, work orders, SOWs, time, expenses, service entry, or invoices.

## Added aggregates

| Stage | Tables | Authority |
|---|---|---|
| Reusable worker role | `master.external_worker` | Non-employee workforce role for one person |
| Rate policy | `control.external_workforce_rate_card`, `control.external_workforce_rate` | Effective buyer pricing policy; accepted rates are snapshotted |
| Sourcing | `document.workforce_requisition`, `workforce_requisition_supplier`, `external_candidate_submission`, `external_candidate_evaluation` | Demand, supplier distribution, pseudonymous submission and append-only evaluation |
| Contingent labor | `document.contingent_work_order`, `contingent_work_order_revision` | Supplier-accepted commercial authority for one selected worker |
| Services procurement | `document.statement_of_work`, `statement_of_work_revision`, `statement_of_work_item` | Versioned SOW plus deliverable, event, fee and schedule items |
| Engagement | `document.worker_engagement`, `worker_operational_placement` | Central worker/supplier/buyer/source contract and effective operational placement |
| Compliance/onboarding | `document.worker_compliance_item`, `engagement_onboarding_case` | Engagement-specific readiness and execution; protected values remain in content/person stores |
| Consumption | `document.external_time_sheet`, `external_time_entry`, `external_expense_sheet`, `external_expense_item` | Correctable time and expense documents with immutable approved history |
| Acceptance/AP | `document.external_service_entry`, `external_service_entry_line`, `external_workforce_invoice_allocation` | Buyer service acceptance and append-only bridge to purchase-invoice lines |

## Locked invariants

1. An engagement has exactly one commercial source: contingent work order or SOW.
2. Engagement supplier, buyer company and legal entity must equal its source contract.
3. Candidate submissions must originate from an open distribution for the same requisition and supplier.
4. Contingent work orders require a selected submission from that supplier.
5. Commercial revisions preserve prior terms and become immutable after approval except for controlled supplier-acceptance/effectivity transitions.
6. Compliance decisions, candidate evaluations and invoice allocations are append-only evidence.
7. Worker activation requires completed onboarding and hashed positive readiness evidence.
8. Operational placement is not `master.work_assignment` and never changes employee headcount.
9. Time, expense and SOW items reach AP only through an approved service entry.
10. Candidate PII, CVs, receipts and compliance documents are never stored in metadata, logs or MESH projections.

## Still required above DDL

- aggregate services and explicit lifecycle state machines with optimistic concurrency;
- approval definitions, SoD, permissions and scope targets per aggregate;
- rate selection, budget/tenure evaluation and non-overlap enforcement under transaction locks;
- service-entry amount/currency reconciliation and prevention of over-invoicing;
- restricted supplier portal APIs without generic NEON table access;
- outbox events, snapshot writers, replay/idempotency workers and MESH-safe envelopes;
- retention, legal hold, redaction and audited purpose access for candidate and compliance content;
- integration mappings for procurement, finance, IAM and external VMS connectors;
- migration/backfill and live RLS/concurrency qualification before deployment.
