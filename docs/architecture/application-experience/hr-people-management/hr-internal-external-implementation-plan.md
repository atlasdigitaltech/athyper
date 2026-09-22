# Workforce implementation — Stage 1 Internal, Stage 2 External

Review date: 2026-09-21. Status: proposed implementation sequence; no DDL or deployed configuration changed.

This document supplies the detailed two-stage sequence for the [consolidated HR master plan](hr-module-delivery-plan.md), updated on 2026-09-22 with employee-profile, localization, local/foreign employee and HR-policy decisions. The master plan owns cross-cutting architecture and immediate priorities; this document owns the I0–I9 / E0–E7 breakdown. Internal recruitment belongs in Stage 1; supplier recruitment and external-worker conversion belong to Stage 2. Directly employed foreign nationals are part of Stage 1 regardless of nationality.

Companions: [SAP comparison and table/field analysis](hr-workforce-table-field-analysis.md), [current field inventory](hr-workforce-current-fields.csv), [original table inventory](hr-ddl-inventory.csv).

## Active working mode

Use the [local completion checks](hr-module-delivery-plan.md#working-mode--robust-local-build) for current implementation. The tables below describe full capability scope, not mandatory approval gates for each local increment. Build end-to-end slices, verify their correctness and keep incomplete scope in the backlog. For Wednesday, show completed attendance/leave/benefits/payroll work with a lean Employee 360; the user will cover remaining capabilities in the presentation.

Stage dependencies require the contracts used by a slice, not completion of every preceding screen. Seeded valid employees, organization and policy records can support processing before all lifecycle/setup UI is finished. Stage-wide pilot/sign-off/load/recovery requirements are deferred to [release readiness](hr-release-readiness-checklist.md); domain integrity, permissions and focused tests remain in the build.

## 1. Two stages, with separately accepted increments

| | Stage 1 — Internal Workforce | Stage 2 — External Workforce |
|---|---|---|
| Primary record experience | Employee 360 | External Worker 360 and Engagement 360 |
| Business owner | HR; payroll and finance for their respective outcomes | Procurement/workforce management; supplier and finance collaborators |
| Identity | person → employee → employment → work_assignment | person → external_worker → worker_engagement → worker_operational_placement |
| Relationship authority | Employment with legal employer/company | Supplier-backed work order or statement of work |
| Compensation/spend | Compensation, payroll, statutory contributions, reimbursement | Contract revision, bill rate, approved time/expense/deliverables, supplier invoice |
| User access | Optional principal, based on active authorized employment relationships | Optional principal, based on authorized engagement and time-bounded access |
| Financial completion | Payroll/claim approval → posting/payment/reconciliation | Service acceptance → invoice matching → posting/payment/reconciliation |
| SAP benchmark | Employee Central plus relevant SuccessFactors time, payroll and talent capabilities | Fieldglass, with Employee Central contingent-worker visibility as an integration reference |
| Independence | Must ship without external-worker procurement being enabled | Reuses the shared person, organization, IAM and governance infrastructure from Stage 1 |

This is a product delivery boundary. Do not delete or disable existing external-workforce implementation during Stage 1. Preserve its compatibility and tests. A shared person can hold both roles concurrently; closing one relationship must not erase the other or unconditionally disable the principal.

The SAP distinction is supported by [Employee Central concurrent employment documentation](https://help.sap.com/docs/successfactors-employee-central/implementing-employee-central-core/importing-concurrent-employments-for-employees) and [SAP's Fieldglass overview](https://learning.sap.com/products/intelligent-spend-management/fieldglass). These are capability benchmarks, not a claim that SAP uses Athyper's proposed physical schema.

## 2. Stage 1 — Internal Workforce

| Increment | Deliverable | DDL/contract focus | Dependency and acceptance |
|---|---|---|---|
| I0 | Baseline and Employee 360 readiness | Person-number fix, canonical reads, tenancy, scope/field policy, date conventions, migration preflight | Entry work; verify the required local schema/routes, fixtures and any changed local migration; record unrelated gaps |
| **I1** | **Employee directory and Employee 360 v1** | Aggregate person/employee/selected employment/assignment; section contracts and correct current/future/history views | I0; role-tested Employee 360 is the first usable release; no dependency on payroll or talent completion |
| I2 | Organization, User app and self-service | Position/job/grade configuration; typed event reasons; effective history; manager relationships; optional principal and identity bindings | I1 contracts; HR and access-admin roles separated, users without employment and employees without users supported |
| I3 | Employee lifecycle | Hire, rehire, probation, transfer, promotion, suspension, additional employment, global assignment, basic separation and checklists | I2; approved changes apply once, effective dates hold, remaining employment preserves appropriate access |
| I4 | Time, attendance and leave | Work schedules, employee pattern assignment, shifts/punches, internal timesheets, leave accounts/ledger/accrual/approval | I2–I3; time/leave reconcile, replay is safe, concurrent requests cannot overspend entitlement |
| I5 | Compensation and payroll | Pay component versions, employee component assignments/awards, payroll input snapshots, tax/statutory enrollment, payment instructions, payroll outputs | I3–I4 and selected payroll countries; verified calculation, payslips, posting, correction, payment and reconciliation |
| I6 | Employee services and complete exit | Expenses, travel, advances, benefits/dependants, grievance access, clearance, exit interview and final settlement | I3; final settlement depends on I4–I5 and finance; all screenshot services reach accepted end states |
| I7 | Recruitment and onboarding handoff | Internal hiring requisition, candidate/application, interview, approved offer; protected person matching | I2–I3; accepted offer creates one onboarding request; unsuccessful candidate does not become employee |
| I8 | Learning, performance and career development | Skills, training, results/feedback, goals/appraisals, calibration, compensation planning and succession | I2–I3; evidence-backed skills and reviews, scoped visibility; reward recommendations require independent pay approval |
| I9 | Internal Workforce local integration | Connect completed increments, reconcile their totals/history and record pending capabilities | Implemented I1–I8 slices; focused integration checks pass; broader release readiness is separate |

I4 time and leave can be separate work packages. I6 expense/benefit/case work and I7/I8 can progress once shared contracts are stable; their completion does not require waiting for every payroll UI. No team size or calendar estimate is assumed.

**Stage 1 done:** all internal capabilities in the screenshot are delivered, along with User administration, internal recruitment, reporting and operational readiness. Global assignments, compensation planning and succession are explicit SuccessFactors-inspired extensions in this plan; business scope can prioritize their detailed rollout, but any deferral must be recorded instead of claiming complete parity.

**Stage 1 does not claim:** supplier candidate distribution, external engagement commercial controls, SOW service acceptance or external supplier invoice processing. It supplies shared integration contracts and preserves existing external features.

## 3. Stage 2 — External Workforce

| Increment | Deliverable | Existing foundation and improvements | Dependency and acceptance |
|---|---|---|---|
| E0 | External schema/runtime qualification | Inventory requisition, work order/SOW revisions, rates, engagement, placement, compliance, IAM and finance commands | Stage 1 shared contracts; identify deployed versus source-only behavior and approve migration/preflight |
| **E1** | **External Worker 360 / Engagement 360** | Existing external_worker + person; engagement selector; supplier, buyer, contract revision, placement, compliance, access, time/expense/spend summaries | E0; supplier/manager/worker scopes tested; no employee payroll or private buyer data leaked |
| E2 | Demand, sourcing and candidate selection | workforce_requisition/supplier, external_candidate_submission/evaluation; add release waves, qualification criteria and budget evidence where needed | E1; suppliers see only their distributions/candidates; accepted selection does not bypass contract approval |
| E3 | Commercial contract and rate governance | contingent_work_order/revision, statement_of_work/revision/item, external_workforce_rate_card/rate | E2; approved supplier-accepted revisions, frozen rates/terms, NTE checks, renewal/change-order lineage; no editable duplicate commercial authority |
| E4 | Engagement onboarding, compliance, placement and access | worker_engagement, operational placement, compliance items, engagement onboarding and existing IAM intent/delivery | E3; tested activation gate, date/company/contract agreement, renewable evidence, aggregate tenure and expiring access; atomic placement capacity checks |
| E5 | Time, expenses, deliverables and supplier settlement | external_time_sheet/entry, external_expense_sheet/item, SOW items, canonical service_sheet/line/source_allocation and invoice matching | E3–E4; claims approved once, accepted quantity/amount reconciled, no over-consumption/NTE overspend, invoice/payment traceable to accepted source |
| E6 | Extension, termination, conversion and supplier measures | Explicit termination/closure task evidence, conversion linkage, tenure rollups and supplier quality/cost/time measures | E4–E5; one contract ending removes only its access, final claims stay payable, conversion preserves person and commercial history |
| E7 | External Workforce local integration | Connect completed supplier/engagement/acceptance slices and relevant reports | Implemented E1–E6 slices; relevant retry, scope, commercial and evidence checks pass; broader release readiness is separate |

**Stage 2 done:** two separately qualified journeys:

1. Requisition → supplier distribution → candidate selection → approved/accepted work order → compliant engagement → accepted time/expense → supplier invoice/payment → closure.
2. Approved/accepted SOW revision → permitted worker placement and/or deliverables → service acceptance → supplier invoice/payment → closure.

SOW services may have no named workers. Do not make person, employment or engagement creation mandatory for every deliverable-based SOW.

## 4. Shared foundation built once

- Stable person identity with controlled duplicate matching; no automatic cross-tenant deduplication or merge.
- Shared organization/location/costing references and effective-date conventions.
- Optional principal and provider identity bindings; user provisioning is separate from employment/engagement approval.
- Versioned metadata, authorization, requests/workflow, validation, audit/outbox, protected documents and replay handling.
- Canonical source-system mappings via existing master.external_reference; avoid separate HR/SAP identity maps.
- A permission-filtered workforce search projection with person, role, relationship and scope; distinct headcount, FTE, external worker counts and spend measures.
- Shared skills/certification vocabulary, with role-specific eligibility and privacy. Shared learning evidence can satisfy an external training requirement only through an explicit verifier.

## 5. First Employee 360 release

Ship overview, personal/contact information, selected employment, position/organization/manager, current and future assignment history, requests/checklists, permitted documents/activity and optional user/access summary. Existing data can be displayed with provenance; do not block the first read release on every new field in the analysis.

New mutations depend on their relevant model contract being stable. Keep compensation, medical/identity, grievance and banking fields behind their own scoped queries. Unknown legacy values remain unknown; backfill must not invent employment facts.

I1 acceptance includes future-dated hire, multi-employment, rehire, terminated employee, employee without login, manager transfer and denied-company/tenant cases. Section errors do not masquerade as zero counts. Effective-date history and recorded correction history must be distinguishable in the planned UI.

## 6. Priority improvements from the comparison

| Priority | Improvement | Stage |
|---|---|---|
| P0 | Correct as-of reads, nullable identifier uniqueness, canonical ownership, scoped PII and user lifecycle | I0–I2 |
| P1 | Effective revisions with same-day sequence, event reasons, matrix/HR relationships and global-assignment linkage | I2–I3 |
| P1 | Multi-valued identifiers/contact/dependants, employee pay components, leave accounts and payroll input traceability | I2–I6 |
| P1 | Commercial revision binding, evidence renewal, cumulative tenure, time-bounded access and budget/acceptance controls | E3–E5 |
| P2 | Learning/performance, internal recruitment, compensation planning and succession | I7–I8 |
| P2 | Supplier scorecards, sourcing waves, conversion and total-workforce reporting | E2, E6–E7 |

Priority indicates implementation order, not removal from the stated full-module outcome. These are improvements over the current Athyper baseline, not a claim of superiority over SAP.

## 7. Local build and later release discipline

For each increment: a clear field contract, applicable local DDL/migration and types, tenant-safe constraints, services/scoped APIs, required presentation/workflow definitions, working UI and focused tests. Keep a short note of working behavior and pending scope. Pilot activation, historical upgrade coverage and formal release evidence are handled later through the readiness checklist. Country-specific rules must be explicit and validated before operational use; engine development can proceed independently of formal country sign-off.

Migrate as expand → backfill → validate → switch canonical writes → switch reads → retire legacy only after consumer evidence. Never infer nationality from country_code, termination dates from status, or contractual hours from FTE alone. Preserve protected tokens and provenance. External commercial migration must preserve approved revision and invoice/acceptance lineage.

The earlier detailed stages map as follows: 0/1→I0/I1; 2→I2; 3→I3; 4/5→I4; 6/7→I5; 8/9/10→I6; internal recruitment from 12→I7; 11 plus career extensions→I8; internal 13→I9. External portions of 12 are expanded into E0–E7. Both stages progress through local increments and have separate operational readiness checks when preparing a wider release.
