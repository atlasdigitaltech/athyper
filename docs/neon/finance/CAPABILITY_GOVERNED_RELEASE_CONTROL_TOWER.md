# Athyper Finance -- Governed Release Control Tower

## Capability Package Definition

**Package**: `athyper.finance.governed-release-control-tower`
**Version**: 2.0.0
**Status**: Production Ready
**Owner**: Finance Platform Team
**Last Updated**: 2026-03-07
**Classification**: Core Financial Governance

---

## 1. Purpose

Provides controlled release of financial data through governed workflows,
certification chains, reconciliation validation, consistency enforcement,
and immutable audit trails.

Ensures that all financial outputs (reports, packs, exports, disclosures) are
verified, approved, mathematically consistent, and auditable before distribution.

No financial data leaves the system without passing through the Control Tower.

---

## 2. Scope

Controls the lifecycle of:

- Period closes (month-end, quarter-end, year-end, interim)
- Financial report packs (management, board, regulatory, ad-hoc)
- Certification workflows (prepare, review, approve, certify)
- Distribution governance (send, track, recall)
- Reconciliation validation (bank, subledger, cross-book)
- Financial truth consistency (GL balance, journal lines, statement snapshots)
- Audit evidence (immutable timeline, hash chain, legal holds)
- Release gating (multi-gate preflight with consistency enforcement)

---

## 3. Architecture Overview

```
                        Release Control Tower
                               |
          +--------------------+--------------------+
          |                    |                    |
    Close Engine         Pack Engine        Consistency Engine
          |                    |                    |
    +-----+-----+      +------+------+      +------+------+
    |     |     |      |      |      |      |      |      |
   DAG  Tasks  Risk  Cert   Dist  Activity  GL   Recon  Snapshot
   Graph Check Signal Chain  Gov   Timeline Truth  Gate   Hash
```

### Bounded Context

| Context               | Schema     | Engine Code              |
|-----------------------|-----------|--------------------------|
| Close Orchestration   | `fin`     | `posting-engine`         |
| Certification         | `fin`     | `report-pack-engine`     |
| Distribution          | `fin`     | `report-pack-engine`     |
| Risk Signals          | `fin`     | `posting-engine`         |
| Consistency           | `fin`     | `posting-engine` + API   |
| Bank Reconciliation   | `fin`     | `banking`                |
| GL Balance            | `fin`     | `posting-engine`         |
| Audit Trail           | `audit`   | `event-store`            |
| Legal Hold            | `core`    | `audit-governance`       |
| Reporting             | `fin`     | `statement-engine`       |
| Document Registry     | `fin`     | `document-registry`      |

---

## 4. Supported Workflows

### 4.1 Period Close

```
FUTURE --> OPEN --> SOFT_CLOSE --> HARD_CLOSE
                     |
                     +--> REOPENED (with approval)
```

**Task lifecycle**: PENDING --> IN_PROGRESS --> COMPLETED | WAIVED | FAILED | BLOCKED

**Capabilities**:
- DAG-based task dependency graph with critical path computation
- 4 concrete system handlers: Trial Balance, Depreciation, FX Revaluation, Bank Recon
- Waiver governance with approval chain
- Close readiness snapshots with weighted scoring (60% checklist + 25% exception-free + 15% SLA)
- Orchestration trend analytics with confidence forecasting
- 8-rule risk signal evaluator with fingerprint deduplication

### 4.2 Financial Pack Certification

```
PENDING --> IN_REVIEW --> REVIEWED --> APPROVED --> CERTIFIED
                                          |
                                          +--> REJECTED
```

**Capabilities**:
- Sign-off chain with actor attribution (name, timestamp, notes)
- Disclosure and disclaimer notes
- Context capture at APPROVED/CERTIFIED (readiness snapshot, override counts, period status)
- Publication manifest with per-artifact SHA-256 hash
- Supersession governance with optional certification invalidation

### 4.3 Pack Distribution

```
DRAFT --> SENDING --> SENT --> PARTIAL | FAILED
                                  |
                                  +--> RECALLED
```

**Capabilities**:
- Multi-format distribution (LINK, PDF, EXCEL, ZIP, EMAIL_BODY)
- Secure link token generation (256-bit crypto-random)
- Per-recipient delivery tracking (view count, download count)
- Distribution recall with reason capture
- Certification guard prevents sending uncertified packs

### 4.4 Release Orchestration

```
ASSEMBLING --> READY --> RELEASED --> SUPERSEDED
                 |
                 +--> CANCELLED
```

**Release types**: MANAGEMENT_PACK, BOARD_PACK, REGULATORY, AD_HOC, INTERIM

**Capabilities**:
- Multi-component binding (pack instance, publication batch, certification, close run)
- Exception governance (requires signoff if overrides present)
- Clean close determination with readiness score
- Multi-tier approval (CFO, Controller, Board, Compliance)
- Supersession chain with correction audit trail
- Integrity verification (manifest hash comparison)
- Consistency gate enforcement at mark-ready

### 4.5 Release Supersession

```
Detect Issue --> Assemble Correction --> Release Corrected Pack --> Mark Previous SUPERSEDED
```

### 4.6 Financial Truth Consistency

```
Journal Lines (ground truth)
       |
       v
  GL Balance (projection)  <--compare--> Statement Snapshot (certified)
       |
       v
  Bank Reconciliation (completeness)
       |
       v
  Release Gate (PASS / FAIL)
```

**4 consistency checks**:
1. **GL_BALANCE_VS_JOURNAL** -- Pre-aggregated GL matches raw journal line sums
2. **DOUBLE_ENTRY_BALANCE** -- Total debits equal total credits invariant
3. **SNAPSHOT_VS_GL** -- Certified statement snapshot matches GL balance
4. **BANK_RECONCILIATION** -- All period bank statements fully reconciled

---

## 5. Release Gating Model

Five gates enforced through the release lifecycle:

| Gate                    | Enforced By                                                    | Stage               |
|-------------------------|----------------------------------------------------------------|----------------------|
| DATA_INTEGRITY          | Consistency validator (GL vs journal, snapshot vs GL, double-entry) | `mark-ready` |
| RECONCILIATION          | Bank reconciliation completeness check                         | `mark-ready`         |
| TASK_COMPLETION         | `checkGate()` with structured denial                           | Period transition    |
| EXCEPTION_SIGNOFF       | `requires_exception_signoff` + signoff chain                   | `release`            |
| CERTIFICATION           | `pack_certification.status = CERTIFIED`                        | `mark-ready`         |

Release proceeds only when all gates pass. DATA_INTEGRITY and RECONCILIATION
gates are evaluated inline during `mark-ready` command execution and block
transition to READY status on failure.

---

## 6. Risk Signal System

**8 rule types** with tenant-configurable thresholds:

| Rule Type               | Detects                                          |
|--------------------------|--------------------------------------------------|
| `forecast_slipped`       | Close prediction shifted beyond threshold        |
| `confidence_dropped`     | Confidence level decreased                       |
| `blocker_stale`          | Same blockers persist across N snapshots          |
| `failed_task_unresolved` | Failed task unresolved beyond threshold hours     |
| `ready_queue_aging`      | READY tasks idle beyond threshold hours           |
| `sla_warning`            | Task approaching SLA deadline                    |
| `sla_breach`             | Task past SLA deadline                           |
| `close_target_at_risk`   | Close target at risk given current forecast       |

**Signal lifecycle**: fired --> acknowledged --> resolved | suppressed

**Advanced features**:
- Deterministic fingerprint (v1:rule_code:target_status:sorted_task_codes)
- Cooldown policy (minutes between firings)
- Suppression scopes (instance, rule_period, until_fingerprint_change)
- Auto-resolution when condition clears
- Escalation with SLA timers and multi-level chains
- Domain event emission for notification rules

---

## 7. Immutable Audit Infrastructure

| Component              | Table / Function                              | Purpose                        |
|------------------------|-----------------------------------------------|--------------------------------|
| Audit Log              | `audit.audit_log`                             | Append-only platform audit     |
| Workflow Events        | `audit.workflow_event_log` (partitioned)      | Monthly-partitioned events     |
| Hash Anchors           | `audit.hash_anchor`                           | Daily tamper-evidence points   |
| Close Activity         | `fin.period_close_activity`                   | 18+ close activity types       |
| Pack Activity          | `fin.pack_activity`                           | 20+ pack activity types        |
| Legal Hold             | `core.legal_hold` + `core.legal_hold_manifest`| Litigation/regulatory holds    |
| Purge Certificate      | `evt.purge_certificate`                       | Immutable deletion proof       |
| Document Registry      | `fin.financial_document`                      | Unified audit spine            |
| Release Decision Log   | `fin.release_decision_log`                    | Every command with evidence    |

**Security**: RLS with tenant isolation, role-based immutability bypass for retention/key rotation.

---

## 8. Required Dependencies

| Dependency           | Engine / Service                    | Status           |
|----------------------|-------------------------------------|------------------|
| Posting Engine       | `posting-engine`                    | Production       |
| GL Balance Repo      | `DefaultGLBalanceRepo`              | Production       |
| Event Store          | `event-store`                       | Production       |
| Workflow Engine      | `workflow-engine`                   | Production       |
| Notification Service | `notification`                      | Production       |
| Finance Accounting   | `finance.accounting` (37 endpoints) | Production       |
| Bank Reconciliation  | `finance.banking`                   | Production       |
| GL Inquiry Service   | `DefaultGLInquiryService`           | Production       |
| Federation Engine    | `federation-engine`                 | Ready (unwired)  |
| Statement Engine     | `statement-engine`                  | Partial          |
| Report Pack Engine   | `report-pack-engine`                | Partial          |

---

## 9. Domain Events

| Event Type                        | Source              | Consumers              |
|-----------------------------------|---------------------|------------------------|
| `fin.risk_signal.fired`           | Risk evaluator      | Notification, Audit    |
| `fin.risk_signal.acknowledged`    | Operator action     | Audit                  |
| `fin.risk_signal.resolved`        | Auto/manual         | Notification, Audit    |
| `fin.risk_signal.suppressed`      | Operator action     | Audit                  |
| `fin.risk_signal.escalated`       | SLA timer           | Notification, Audit    |
| `fin.close.transition_succeeded`  | Period close        | Pack Engine, Audit     |
| `fin.close.transition_denied`     | Gate check          | Notification, Audit    |
| `fin.certification.advanced`      | Pack governance     | Release, Audit         |
| `fin.distribution.sent`           | Pack distribution   | Audit                  |
| `fin.distribution.recalled`       | Pack distribution   | Notification, Audit    |
| `fin.release.marked_ready`        | Release command     | Notification, Audit    |
| `fin.release.released`            | Release command     | Distribution, Audit    |
| `fin.release.superseded`          | Release command     | Notification, Audit    |

---

## 10. API Surface

### 10.1 Release Orchestration

| Method | Endpoint                                  | Purpose                    |
|--------|-------------------------------------------|----------------------------|
| GET    | `/api/fin/releases`                       | Dashboard list + KPIs      |
| GET    | `/api/fin/releases?releaseId=...`         | Release detail             |
| GET    | `/api/fin/releases?view=audit-chain`      | Audit chain view           |
| GET    | `/api/fin/releases?view=manifest`         | Publication manifest       |
| GET    | `/api/fin/releases?view=timeline`         | Filtered timeline          |
| GET    | `/api/fin/releases?view=kpis`             | Aggregated KPIs            |
| GET    | `/api/fin/releases?view=preflight`        | Preflight with gates       |
| GET    | `/api/fin/releases?view=audit-package`    | Audit package export       |
| POST   | `/api/fin/releases`                       | Execute commands           |

### 10.2 Period Close

| Method | Endpoint                                     | Purpose                 |
|--------|----------------------------------------------|-------------------------|
| GET    | `/api/fin/period-close`                      | Checklist + progress    |
| POST   | `/api/fin/period-close`                      | Run checks / execute    |
| GET    | `/api/fin/period-close/graph`                | Full graph + views      |
| POST   | `/api/fin/period-close/graph`                | Capture snapshot        |
| GET    | `/api/fin/period-close/risk-signals`         | Active signals          |
| POST   | `/api/fin/period-close/risk-signals`         | Evaluate / transition   |

### 10.3 Pack Governance

| Method | Endpoint                                            | Purpose              |
|--------|-----------------------------------------------------|----------------------|
| GET    | `/api/fin/packs/instances/{id}/certification`       | Certification status |
| PATCH  | `/api/fin/packs/instances/{id}/certification`       | Advance lifecycle    |
| GET    | `/api/fin/packs/instances/{id}/distributions`       | List distributions   |
| GET    | `/api/fin/packs/instances/{id}/activity`             | Activity timeline    |
| POST   | `/api/fin/packs/distributions`                      | Create distribution  |
| GET    | `/api/fin/packs/distributions/{id}`                 | Detail + recipients  |

### 10.4 GL Reporting

| Method | Endpoint                                      | Purpose                      |
|--------|-----------------------------------------------|------------------------------|
| GET    | `/api/fin/gl/summary`                         | GL balance summary           |
| GET    | `/api/fin/gl/detail`                          | Journal line detail          |
| GET    | `/api/fin/gl/trial-balance`                   | Trial balance aggregate      |
| GET    | `/api/fin/gl/consistency`                     | Consistency validation       |

### 10.5 Bank Reconciliation

| Method | Endpoint                                             | Purpose                  |
|--------|------------------------------------------------------|--------------------------|
| GET    | `/api/fin/bank-statements`                           | List statements          |
| POST   | `/api/fin/bank-statements`                           | Import statement         |
| GET    | `/api/fin/bank-statements/{id}`                      | Detail + lines + session |
| POST   | `/api/fin/bank-statements/{id}/reconcile`            | Start reconciliation     |
| GET    | `/api/fin/reconciliation/{id}`                       | Session report           |
| POST   | `/api/fin/reconciliation/{id}`                       | Commands (match/unmatch/auto-match/complete) |

### 10.6 Dimensional Reporting

| Method | Endpoint                                      | Purpose               |
|--------|-----------------------------------------------|------------------------|
| GET    | `/api/fin/reporting/statement`                | Live render            |
| GET    | `/api/fin/reporting/statement/snapshot`        | Snapshot retrieval     |
| GET    | `/api/fin/reporting/statement/compare`         | Period comparison      |
| GET    | `/api/fin/reporting/pnl`                       | Multi-dimensional P&L |
| GET    | `/api/fin/reporting/drilldown`                 | Account drilldown     |
| GET    | `/api/fin/reporting/dimensions`               | Dimension metadata     |
| GET    | `/api/fin/reporting/cubes`                    | Cube definitions       |
| GET    | `/api/fin/reporting/presets`                  | Report presets CRUD    |

### 10.7 Operational Governance

| Method | Endpoint                                     | Purpose              |
|--------|----------------------------------------------|----------------------|
| GET    | `/api/admin/governance/quotas`               | Quota utilization    |
| GET    | `/api/admin/governance/archive`              | Archive lifecycle    |
| GET    | `/api/admin/governance/legal-holds`          | Legal hold console   |
| GET    | `/api/admin/governance/explain`              | Policy explainability|
| GET    | `/api/admin/governance/pii-inventory`        | PII field inventory  |

---

## 11. Neon UI Surfaces

### 11.1 Release Control Tower (`/app/release-control-tower`)

| Tab               | Component                         | Purpose                       |
|-------------------|-----------------------------------|-------------------------------|
| Overview          | `ReleaseDashboard`                | KPIs + release cards          |
| Release Detail    | `ReleaseDetail`                   | 6-tab detail (decisions, overrides, manifest, alerts, SLA) |
| Certification     | `PackGovernance`                  | Sign-off chain + actions      |
| Distribution      | `PackGovernance`                  | Distribution tracking         |
| Audit Timeline    | `ReleaseTimeline`                 | Unified chronological view    |

### 11.2 Close Operations (Admin)

| Component                      | Purpose                          |
|--------------------------------|----------------------------------|
| `CloseOrchestrationDashboard`  | Ready queue, blockers, critical path, forecast |
| `PeriodCloseGovernance`        | Checklist, handler execution, waivers |
| `BookCloseHistoryViewer`       | Historical close runs            |

### 11.3 Reporting Suite

| Component                | Purpose                     |
|--------------------------|-----------------------------|
| `ReportingDashboard`     | Multi-view reporting hub    |
| `StatementViewer`        | Statement rendering + export|
| `StatementCompareViewer` | Period comparison           |
| `PnLReport`              | Dimensional P&L             |
| `DrilldownExplorer`      | Account-level drill         |

### 11.4 Reconciliation

| Component                  | Purpose                           |
|----------------------------|-----------------------------------|
| `BankReconciliation`       | Split-view reconciliation UI      |
| `ReconciliationReport`     | Completed session report          |
| `GLBalanceReportContainer` | GL balance reporting              |

### 11.5 Governance Console

| Component                   | Purpose                     |
|-----------------------------|---------------------------  |
| `LegalHoldConsole`          | Hold lifecycle management   |
| `ArchiveLifecycleMonitor`   | Archive state machine       |
| `PurgeCertificateRegister`  | Deletion audit trail        |
| `QuotaUtilizationDashboard` | Resource quota enforcement  |
| `RetentionPolicyExplorer`   | Retention schedule          |
| `PrivacyFieldInventory`     | PII classification          |

---

## 12. SQL Migration Inventory

### Foundation (01_foundation/)

| File | Purpose |
|------|---------|
| 074_data_retention_policy.sql | Per-entity retention, PII classification |
| 075_tenant_resource_quota.sql | Tenant operational isolation |
| 076_legal_hold.sql | Legal hold as first-class governance object |

### Platform (06_platform/)

| File | Purpose |
|------|---------|
| 151_event_tiering.sql | Event store HOT/WARM/COLD tiering |
| 152_purge_certificate.sql | Immutable deletion proof |
| 153_restore_approval_governance.sql | Role-based restore authorization |

### Finance (07_finance/)

| File | Purpose |
|------|---------|
| 190_posting.sql | GL accounts, journal entries, period control, GL balance |
| 191_ledger_dimensions.sql | Universal dimension engine, dimension sets, GL balance v2 grain |
| 192_ledger_book.sql | Multi-book accounting, book posting rules, GL balance v3 grain |
| 191_period_close_governance.sql | Task catalogue, checklist, gates |
| 192_period_close_phase3.sql | Waiver approval, task ownership, activity |
| 193_reporting_analytics.sql | Cube aggregation for dimensional reporting |
| 194_statement_engine.sql | Governed metadata-driven rendering |
| 195_statement_snapshot.sql | Immutable snapshots with SHA-256 hash |
| 196_management_pack.sql | Statement bundle engine |
| 197_pack_governance.sql | Certification, distribution, forecast |
| 198_financial_document_registry.sql | Unified audit spine |
| 199_period_close_orchestration_graph.sql | DAG-based task ordering |
| 202_close_orchestration.sql | Calendar, run wrapper, dependencies |
| 204_close_orchestration_snapshot.sql | Graph-derived intelligence |
| 205_close_risk_signals.sql | Rule-driven risk detection |
| 206_close_risk_hardening.sql | Deduplication, fingerprinting, cooldown |
| 206_publication_certification_integrity.sql | End-to-end audit chain |
| 207_governed_release_orchestration.sql | Release lifecycle + policy |
| 208_release_operations_runtime.sql | Notifications, event sourcing |
| 209_domain_event_outbox.sql | BFF to EventBus bridge |

---

## 13. Control Gates (Lifecycle Events)

### Period Transition Gates

| Event                | Gate                 | Evidence Required              |
|----------------------|----------------------|--------------------------------|
| OPEN -> SOFT_CLOSE   | TASK_COMPLETION      | All SOFT_CLOSE tasks done/waived |
| SOFT_CLOSE -> HARD   | TASK_COMPLETION      | All HARD_CLOSE tasks done/waived |
| Any -> transition    | RISK_SIGNAL          | No critical/high active signals |

### Release Lifecycle Gates

| Event                  | Gate                 | Evidence Required                    |
|------------------------|----------------------|--------------------------------------|
| ASSEMBLING -> READY    | CERTIFICATION        | Pack certification APPROVED/CERTIFIED|
| ASSEMBLING -> READY    | DATA_INTEGRITY       | GL matches journal, snapshot matches GL |
| ASSEMBLING -> READY    | RECONCILIATION       | All bank statements reconciled       |
| READY -> RELEASED      | EXCEPTION_SIGNOFF    | If overrides present, signoff required |
| READY -> RELEASED      | CERTIFICATION        | Certification still valid            |

---

## 14. Remaining Work (Non-Blocking)

| Item | Severity | Notes |
|------|----------|-------|
| Statement Engine module wiring (DI registration) | MEDIUM | Services done, module scaffold only |
| Report Pack Engine module wiring | MEDIUM | Services done, module scaffold only |
| Federation Engine module wiring | MEDIUM | Ready, needs contribute() |
| Event Store tiering (migrateToWarm/Cold/purge) | MEDIUM | Schema done, service stubs |
| PaymentQueryRepo real integration in banking | LOW | Currently stubbed |
| Explicit configurable gate registry table | LOW | Gates implicit, works well |

None of these block the package from production use. They affect depth, not function.

---

## 15. Extension Roadmap

### Wave: Reporting Consistency -- COMPLETE

- GLBalanceRepo persistence (DefaultGLBalanceRepo with atomic increment)
- GL reporting APIs (summary, detail, trial balance)
- Bank reconciliation API routes (9 endpoints)
- Consistency validator (4 checks across 2 gates)
- Release preflight enforcement (mark-ready blocks on gate failure)

### Wave: Atlas Intelligence (next strategic wave -- see separate doc)

- Release risk scoring engine
- Narrative audit commentary generation
- Anomaly detection (unusual adjustments, late postings)
- CFO summary auto-generation
- Close readiness insights and recommendations

### Wave: External Compliance (future)

- Regulatory template binding (IFRS, US GAAP, local GAAP)
- XBRL/iXBRL tagging engine
- Auditor workspace (external read-only view with scoped access)
- SOX control evidence binding

---

## 16. Competitive Positioning

| Vendor    | Capability              | Athyper Advantage                       |
|-----------|-------------------------|-----------------------------------------|
| SAP       | Close Cockpit           | Full DAG + risk signals + consistency   |
| Oracle    | Financial Close Manager | Integrated certification + distribution |
| BlackLine | Reconciliation Cloud    | Unified with close + release + audit    |
| Workiva   | Reporting Governance    | End-to-end audit chain + hash integrity |
| Trintech  | Cadency                 | Multi-book + dimension-aware balances   |

**Differentiator**: Athyper combines Close + Reporting + Distribution + Reconciliation
+ Consistency Enforcement + Audit inside one governed platform. Competitors require
2-4 separate products to achieve equivalent coverage.

---

## 17. Capability Maturity

| Dimension          | Score | Notes                                              |
|--------------------|-------|----------------------------------------------------|
| Architecture       | 100%  | All schemas, engines, patterns defined              |
| Runtime            | 95%   | GL balance, consistency, reconciliation complete    |
| Governance         | 100%  | Full audit, legal hold, retention, purge            |
| Consistency        | 100%  | 4-check validator + preflight gate enforcement      |
| Operator UX        | 95%   | Control Tower + all governance components           |
| Intelligence       | 0%    | Atlas layer is next strategic wave                  |
| **Overall**        | **95%** | Production Ready                                 |
