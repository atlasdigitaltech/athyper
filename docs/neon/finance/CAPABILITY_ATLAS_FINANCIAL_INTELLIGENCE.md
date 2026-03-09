# Capability: Atlas Financial Intelligence

> **Product**: Athyper Neon
> **Module**: Atlas Intelligence Layer
> **Version**: 7.0.0 (Global Close Monitor + Longitudinal Intelligence)
> **Date**: 2026-03-07
> **Classification**: Product Capability Specification

---

## Executive Summary

Atlas is a native financial intelligence layer embedded within the Athyper Neon
platform. It reads exclusively from governed, gate-protected data produced by the
Release Control Tower and transforms it into actionable intelligence: anomaly
detection, close forecasting, causal relationship graphs, cross-entity risk
analysis, and deterministic recommended actions.

Unlike bolt-on analytics solutions, Atlas operates on the same certified
financial data that passes through close gates, reconciliation checks, and
release governance. This means every Atlas insight is grounded in auditable,
governed truth.

---

## Capability Matrix

| Capability | Description | Data Source | Compute Model |
|------------|-------------|-------------|---------------|
| **Anomaly Detection** | Statistical outlier detection across GL balances, reconciliation results, and journal patterns | `fin.atlas_anomaly_baseline`, `fin.atlas_anomaly` | Batch + on-demand |
| **Close Duration Prediction** | Historical-average-based close duration forecasting with confidence scoring | `fin.close_run`, `fin.close_task_duration_history` | Ephemeral |
| **Release Readiness Prediction** | Multiplicative probability model for release certification readiness | `fin.period_close_checklist`, `fin.pack_release` | Ephemeral |
| **Reconciliation Completion** | Session-based time estimate for bank reconciliation completion | `fin.reconciliation_session`, `fin.bank_statement` | Ephemeral |
| **Financial Narratives** | Deterministic template-based dashboard summaries and CFO briefing bullets | Multiple `fin.*` tables | Ephemeral |
| **Recommended Actions** | Priority-ranked, evidence-backed action items for close operators | Anomalies, signals, progress, consistency | Ephemeral |
| **Financial Insight Graph** | 8-node-type heterogeneous relationship graph with causal edge semantics | 10 parallel queries across `fin.*` | Ephemeral |
| **Adaptive Learning** | Feedback-driven threshold calibration with human-in-the-loop governance | `fin.atlas_feedback`, `fin.atlas_threshold_calibration` | Feedback loop |
| **Global Close Monitor** | Multi-entity close intelligence across parent/subsidiary hierarchies | 19 parallel queries, recursive CTE hierarchy | Ephemeral |
| **Close Forecasting** | Group-level statistical forecasting with SLA breach probability | Historical close runs + `fin.vw_sla_breach_forecast` | Ephemeral |
| **Longitudinal Intelligence** | Cross-period entity behavior profiling, persistent anomaly detection, delay reasoning | Historical `close_run` + `atlas_anomaly` | Ephemeral |

---

## Architecture Position

```
  +----------------------------------------------------------+
  |              Atlas Intelligence Layer                      |
  |  Anomalies | Predictions | Narratives | Graph | Forecast  |
  +----------------------------------------------------------+
                          |
                 reads certified data (never writes)
                          |
  +----------------------------------------------------------+
  |            Governed Release Control Tower                  |
  |  Close | Certify | Reconcile | Release | Audit            |
  +----------------------------------------------------------+
                          |
                 writes governed data
                          |
  +----------------------------------------------------------+
  |               Core Posting Pipeline                       |
  |  Journal | GL Balance | Dimensions | Events               |
  +----------------------------------------------------------+
```

**Key architectural principle**: Atlas sits above the Control Tower. It never
bypasses close gates, never mutates financial data, and never auto-triggers
workflow state changes. All intelligence is advisory.

---

## Anomaly Detection

### Detection Methods

| Anomaly Type | Method | Trigger |
|-------------|--------|---------|
| `AMOUNT_OUTLIER` | Z-score against rolling 6-period baseline | \|z\| > 2.5 (critical) or > 2.0 (warning) |
| `UNUSUAL_ADJUSTMENT` | Adjustment entry ratio vs baseline | Ratio > 3x historical average |
| `RECON_VARIANCE` | Bank reconciliation discrepancy | Unmatched amount > materiality threshold |
| `OVERRIDE_SPIKE` | Waiver/override count in current period | Count > 2x historical average |
| `MANUAL_JOURNAL_RATIO` | Manual vs automated journal proportion | Manual > 40% of period entries |
| `LARGE_ADJUSTMENT` | Single entry size vs account average | Entry > 5x account period average |

### Risk Signal Integration

Critical anomalies automatically fire close risk signals via the
`atlas_anomaly` rule type in the close risk evaluator. These signals
can block release certification gates — the only mutation path Atlas
influences, and even this is mediated by the Control Tower's gate system.

### Adaptive Thresholds

Operators can submit feedback on anomaly verdicts (CONFIRMED, FALSE_POSITIVE).
When false positive rates exceed 30% for an anomaly type, the system generates
calibration suggestions to adjust z-score thresholds. All calibration changes
require human approval.

---

## Close Forecasting

### Single-Entity Predictions

| Prediction | Algorithm | Confidence |
|------------|-----------|------------|
| Close Duration | 70% historical average + 30% current pace | Based on CV + sample size |
| Release Readiness | Multiplicative: task completion × (0.3 if failures) | Based on task count |
| Reconciliation | Linear extrapolation from session completion rate | Based on session count |

### Group-Level Forecasting (Global Close Monitor)

For multi-entity groups, Atlas computes a blended statistical forecast:

- **60% historical average** from up to 12 prior completed periods
- **40% current pace** extrapolated from task completion rate
- **Risk penalties**: +1.5d per failed task, +1.0d per blocked task, +2.0d per gate blocker
- **Confidence scoring**: Based on coefficient of variation and historical sample size
- **Trend detection**: Recent-half vs older-half comparison (improving/stable/worsening)
- **SLA breach probability**: Leverages `fin.vw_sla_breach_forecast` (buffer hours, slippage, blockers)

Group completion is driven by the slowest entity (critical path).

---

## Financial Insight Graph

### Node Types (8)

| Type | Source | Purpose |
|------|--------|---------|
| PERIOD | `fin.fiscal_period` | Fiscal period context |
| CLOSE_RUN | `fin.close_run` | Close execution instance |
| RELEASE | `fin.pack_release` | Release governance artifact |
| ANOMALY | `fin.atlas_anomaly` | Detected statistical anomaly |
| RISK_SIGNAL | `fin.close_risk_signal` | Close risk signal |
| TASK | `fin.period_close_checklist` | Close task |
| ACCOUNT | `fin.chart_of_accounts` | GL account with anomalies |
| RECONCILIATION | `fin.reconciliation_session` | Bank reconciliation session |

### Edge Types (7)

| Edge | Meaning | Example |
|------|---------|---------|
| BLOCKED_BY | Blocking relationship | Release blocked by critical anomaly |
| TRIGGERED_BY | Causal trigger | Risk signal triggered by anomaly |
| AFFECTS | Impact relationship | Anomaly affects account 4100 |
| DERIVED_FROM | Provenance chain | Release derived from close run |
| RECONCILES | Reconciliation link | Session reconciles account 1020 |
| ESCALATED_TO | Escalation path | Anomaly escalated to risk signal |
| DEPENDS_ON | Task dependency | GL recon depends on sub-ledger close |

### Causal Questions Answered

1. **Why did this close delay?** — Follow BLOCKED_BY edges from release/tasks
2. **Which accounts generate most anomalies?** — Find ACCOUNT nodes with highest edge count
3. **Which anomalies escalated?** — Follow ESCALATED_TO edges
4. **What blocks this release?** — Check BLOCKED_BY edges from release nodes

### Visualization

Canvas-based force-directed graph with zero external dependencies:
- Mouse wheel zoom + drag-to-pan
- Node click selection with connected edge highlighting
- Edge type labels on selected connections
- Dark mode awareness
- Responsive resize

---

## Global Close Monitor

### Multi-Entity Intelligence

The Global Close Monitor provides consolidated close intelligence across
a parent entity and all subsidiaries, resolved via recursive CTE on
`fin.legal_entity.parent_entity_id`.

### Data Architecture

19 parallel SQL queries gathered in a single `Promise.all()`:

| Phase | Queries | Data |
|-------|---------|------|
| Phase 1 (Core) | Q1–Q11 | Close status, anomalies, risk signals, releases, readiness, exceptions, calendar, IC settlement, reconciliation, task progress |
| Phase 2 (Cross-Entity) | Q12–Q15 | Anomaly detail, IC detail, override counts, calendar detail |
| Phase 3 (Forecasting) | Q16–Q18 | Historical close runs, SLA breach forecasts, orchestration snapshots |
| Phase 4 (Longitudinal) | Q19 | Cross-period anomaly history |

### Console Tabs (7)

| Tab | Intelligence |
|-----|-------------|
| Overview | Group risk score, status distribution, delayed ranking, critical path |
| Entity Grid | Per-entity risk, status, anomalies, tasks, reconciliation |
| Anomaly Patterns | Cross-entity repeated types, hotspot accounts, severity distribution |
| IC Intelligence | Aging buckets, net exposure, exception markers |
| Narratives | Group summary, CFO brief, delay explanation, projections |
| Forecast | Group predicted completion, per-entity forecasts, breach distribution |
| Longitudinal | Entity behavior profiles, persistent patterns, trends, delay explanations |

### Performance

- **Response caching**: 30-second TTL process-level cache prevents redundant query execution
- **Performance profiling**: Response includes `_profiling` with hierarchy, query, compute, and total timing
- **Cache headers**: `X-Atlas-Cache: HIT/MISS` and `Cache-Control: private, max-age=30`

---

## Longitudinal Intelligence

### Entity Behavior Profiles

Historical analysis across all completed close periods per entity:
- Average and median close duration
- SLA breach rate (% of periods missing hard close target)
- Trend direction (improving / stable / worsening)

### Persistent Anomaly Patterns

Anomaly types that appear across 2+ distinct fiscal periods — indicators
of systemic process issues rather than one-time events.

### Delay Explanations

Deterministic template-based reasoning for entities with SLA breach rate
≥30% or worsening trend. Composes contributing factors:
- High SLA breach rate
- Worsening duration trend
- Recurring anomaly patterns
- Increasing anomaly counts

No LLM dependency — pure deterministic text from computed data.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fin/atlas/dashboard` | Single-entity intelligence dashboard |
| GET | `/api/fin/atlas/anomalies` | Anomaly list with filters |
| POST | `/api/fin/atlas/anomalies` | Trigger anomaly detection |
| GET | `/api/fin/atlas/predictions` | Standalone predictions |
| GET | `/api/fin/atlas/narratives` | Narrative generation |
| GET | `/api/fin/atlas/insight-graph` | Insight graph materialization |
| POST | `/api/fin/atlas/feedback` | Submit feedback on anomaly/recommendation |
| GET | `/api/fin/atlas/feedback` | Compute effectiveness + calibration suggestions |
| PATCH | `/api/fin/atlas/feedback/calibrations` | Approve/reject calibration |
| GET | `/api/fin/atlas/global-close` | Multi-entity close intelligence |

---

## Design Principles

1. **Advisory only** — Atlas never auto-triggers workflow state changes
2. **Grounded in governed data** — reads exclusively from gate-protected, certified data
3. **Deterministic** — same input produces same output (template-based, no randomness)
4. **Evidence-backed** — every insight links to source anomalies, signals, or predictions
5. **Ephemeral compute** — intelligence computed on-demand, not persisted (except anomalies and feedback)
6. **Provenance-tracked** — every result carries generation metadata for auditability
7. **Human-in-the-loop** — calibration changes require explicit approval
8. **No new schema overhead** — forecasting, graphs, narratives, and recommendations add zero database tables
9. **Performance-conscious** — parallel queries, response caching, profiling telemetry

---

## Competitive Positioning

| Capability | SAP S/4 | Oracle ERP | BlackLine | Workiva | Athyper Atlas |
|------------|---------|------------|-----------|---------|---------------|
| Anomaly Detection | Add-on | Separate | Limited | No | Native |
| Financial Narratives | No | No | No | Manual | Native (template + optional LLM) |
| Close Forecasting | No | No | Partial | No | Native (single + group-level) |
| Recommended Actions | No | No | No | No | Native |
| Financial Insight Graph | No | No | No | No | Native |
| Adaptive Learning | No | No | No | No | Native (feedback-driven) |
| Multi-Entity Intelligence | Separate product | Separate product | No | No | Native |
| Longitudinal Intelligence | No | No | No | No | Native |
| Grounded in Governed Data | N/A | N/A | N/A | N/A | By architecture |

Atlas is the only intelligence layer that reads exclusively from a governed,
gate-protected data pipeline. Competitors bolt analytics onto ungoverned data
or require separate products.
