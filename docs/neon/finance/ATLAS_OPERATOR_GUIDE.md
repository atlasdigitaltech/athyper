# Atlas Intelligence Layer — Operator Guide

> **Audience**: Close Managers, Controllers, Finance Operators
> **Product**: Athyper Neon — Atlas Intelligence Layer
> **Date**: 2026-03-07

---

## 1. Overview

Atlas is your financial intelligence companion during the close process. It
monitors GL balances, reconciliation results, close progress, and release
readiness — then surfaces anomalies, predictions, and recommended actions.

**Important**: Atlas is advisory. It does not auto-close periods, auto-approve
releases, or bypass any Control Tower gate. Your judgment is authoritative.

---

## 2. Atlas Intelligence Console

**Route**: Navigate to **Atlas Console** in the application shell.

The console has 6 tabs, all sharing the same entity/period context selector at
the top of the page.

### 2.1 Context Selector

Set your working context:
- **Entity Code**: The legal entity (e.g., `ACME`, `LE-CA-ON`)
- **Fiscal Year**: The fiscal year (e.g., `2026`)
- **Period**: The period number (1–12)

Changing any value refreshes all tabs.

### 2.2 Overview Tab

The primary landing view showing:

- **Atlas Risk Score** (0–100) — Weighted composite score with driver breakdown:
  - Critical anomalies: 15 pts each (max 45)
  - Warning anomalies: 5 pts each (max 20)
  - High/critical risk signals: 8 pts each (max 24)
  - Failed close tasks: 8 pts each (max 16)
  - GL imbalance: 20 pts (binary)
  - See driver table for full breakdown

- **Dashboard Summary** — One-paragraph health assessment
- **CFO Brief** — Numbered bullet points for executive reporting
- **Recommended Actions** — Priority-ranked (CRITICAL > HIGH > MEDIUM > LOW)
  - Each recommendation includes rationale, suggested owner role, linked evidence
  - Actions are advisory — they do not trigger any workflow

**Operator action**: Review the risk score drivers. If risk is HIGH, focus on
the CRITICAL recommendations first.

### 2.3 Anomalies Tab

Full anomaly list with filtering by severity and status.

- **Severity levels**: CRITICAL (red), WARNING (amber), INFO (blue)
- **Statuses**: OPEN, ACKNOWLEDGED, RESOLVED, FALSE_POSITIVE

**Key anomaly types**:
| Type | What it means | What to do |
|------|--------------|------------|
| AMOUNT_OUTLIER | Account balance significantly different from historical pattern | Review recent journal entries for the flagged account |
| UNUSUAL_ADJUSTMENT | Higher-than-normal adjustment activity | Check adjustment approvals and supporting documents |
| RECON_VARIANCE | Bank reconciliation discrepancy | Investigate unmatched items in reconciliation session |
| OVERRIDE_SPIKE | Elevated waiver/override count | Escalate to Controller for process review |
| MANUAL_JOURNAL_RATIO | Too many manual entries vs automated | Verify manual entries against source documents |
| LARGE_ADJUSTMENT | Single large entry flagged for size | Verify amount and authorization |

**Operator action**: For each CRITICAL anomaly, either resolve the underlying
issue or acknowledge it with a reason. Critical anomalies fire risk signals
that can block release certification gates.

### 2.4 Predictions Tab

Three prediction cards:

1. **Close Duration** — Expected days to complete close based on historical average
   - Confidence % shown (higher = more historical data available)
2. **Release Readiness** — Probability of successful release certification
   - Lists blockers if any (failed tasks, etc.)
3. **Reconciliation Completion** — Remaining sessions and estimated time

**Operator action**: If close duration prediction exceeds your SLA target,
investigate blockers and failed tasks.

### 2.5 Narratives Tab

Auto-generated text summaries:
- **Dashboard Summary**: Paragraph-form health assessment
- **CFO Brief**: Numbered bullets suitable for management reporting
- **Provenance**: Shows whether narrative was template-generated and data sources used

**Operator action**: Use the CFO Brief for status reporting. Copy the text
directly — it updates automatically as data changes.

### 2.6 Insight Graph Tab

Visual relationship map showing how anomalies, risk signals, tasks, accounts,
reconciliations, releases, and close runs are connected.

**Navigation**:
- **Scroll** to zoom in/out
- **Drag** empty space to pan
- **Click** a node to select it and see connected edges
- **Drag** a node to reposition it

**What to look for**:
- **Hotspot nodes** (large circles) — entities at the center of many relationships
- **BLOCKED_BY edges** (red) — blocking chains preventing release
- **ESCALATED_TO edges** (purple) — anomalies that triggered risk signals

**Operator action**: If a release node has BLOCKED_BY edges to anomaly nodes,
those anomalies must be resolved before release certification.

### 2.7 Feedback & Calibration Tab

For tuning Atlas's detection accuracy over time.

**Submitting Feedback**:
- On any anomaly: mark as CONFIRMED (real issue) or FALSE_POSITIVE (noise)
- On any recommendation: mark as ACCEPTED or DISMISSED
- Select a structured reason code (e.g., SEASONAL_PATTERN, ONE_TIME_EVENT)

**Calibration Suggestions**:
- When false positive rate exceeds 30% for an anomaly type, Atlas suggests
  threshold adjustments (e.g., raise z-score from 2.0 to 2.3)
- Suggestions require Controller/Admin approval before taking effect
- Guard rails prevent thresholds from going below safe minimums

**Operator action**: Submit feedback regularly. It improves detection accuracy
for your entity over time.

---

## 3. Global Close Monitor

**Route**: Navigate to **Global Close Monitor** in the application shell.

This is a read-only, multi-entity view for parent entities with subsidiaries.

### 3.1 Context Selector

- **Parent Entity**: The parent entity code (e.g., `LE-CA`)
- **Fiscal Year** and **Period**: Same as Atlas Console

### 3.2 Overview Tab

Group-level risk assessment:
- **Group Risk Score**: Average of all entity risk scores
- **Status Distribution**: How many entities are in each close status
- **Delayed Close Ranking**: Top 5 entities by elapsed days
- **Critical Path Entity**: The highest-risk non-closed entity

### 3.3 Entity Grid Tab

Sortable table with every entity in the group:
- Risk score, close status, anomaly counts, task progress, reconciliation status
- Click to expand and see risk score drivers, exceptions, release status, SLA targets

**Operator action**: Sort by risk score descending. Focus on the top entities.

### 3.4 Anomaly Patterns Tab

Cross-entity pattern analysis:
- **Repeated Patterns**: Anomaly types appearing in 2+ entities (systemic risk)
- **Hotspot Accounts**: Accounts with anomalies in 2+ entities
- **Override Concentration**: Which entities have elevated override counts

**Operator action**: If the same anomaly type appears across 3+ entities,
investigate whether it's a systemic issue (e.g., incorrect chart of accounts
mapping, shared data source problem).

### 3.5 IC Intelligence Tab

Intercompany settlement status:
- **Aging Buckets**: 0–3d (current), 4–7d, 8–14d, 15–30d, 30d+
- **Net Exposure**: Unsettled amounts per entity pair
- **Exception Markers**: Pairs with high pending counts or large exposure

**Operator action**: Aging transactions over 14 days may delay entity close.
Coordinate with counterparty entities.

### 3.6 Narratives Tab

Group-level summaries:
- **Group Dashboard Summary**: Full paragraph with anomaly counts, patterns, projections
- **Group CFO Brief**: Numbered bullets covering status, critical path, key risks, IC settlement
- **Entity Projections**: Per-entity projected completion with SLA breach indicators

### 3.7 Forecast Tab

Group close forecasting:
- **Group Predicted Completion**: Days until all entities complete (driven by slowest)
- **Per-Entity Forecast Table**: Historical avg, current pace, blended prediction, confidence, breach risk
- **Breach Risk Distribution**: Entities grouped by breach probability (critical/high/medium/low)
- **Readiness Trajectory**: Count of entities improving, stable, or worsening
- **Confidence Intervals**: P75 and P95 estimates for entities with 4+ historical periods

**How to read the forecast**:
- `Predicted Days` = blended estimate (60% historical + 40% current pace + risk penalties)
- `Breach %` = probability of missing hard close target (from predictive intelligence view)
- `Trend` arrow shows whether entity is getting faster or slower at closing

**Operator action**: Focus on entities with >50% breach risk. Review their
blocked/failed tasks and gate blockers.

### 3.8 Longitudinal Tab

Cross-period intelligence:
- **Entity Behavior Profiles**: Historical close performance across all completed periods
  - Average and median close days, SLA breach count and rate, trend direction
- **Persistent Anomaly Patterns**: Anomaly types appearing across 2+ periods (systemic)
- **Entity Trends**: Combined close speed + anomaly trend assessment
  - "Needs Attention" = either speed worsening OR anomaly count increasing
- **Delay Explanations**: "Why does this entity repeatedly delay?" with contributing factors

**Operator action**: Entities with "Needs Attention" status require process
improvement, not just period-by-period firefighting.

---

## 4. Performance Notes

### Response Caching

Atlas caches responses for a short period to prevent redundant database
queries during rapid interactions:

| Endpoint | Cache TTL | Header |
|----------|-----------|--------|
| Global Close Monitor | 30 seconds | `X-Atlas-Cache: HIT/MISS` |
| Atlas Dashboard | 60 seconds | `X-Atlas-Cache: HIT/MISS` |

Click the **Refresh** button to force a cache miss and get fresh data.

### Performance Profiling

API responses include a `_profiling` object showing query timing:
```json
{
  "_profiling": {
    "hierarchyMs": 12,
    "queriesMs": 187,
    "computeMs": 8,
    "totalMs": 207,
    "queryCount": 19,
    "entityCount": 5
  }
}
```

If `totalMs` exceeds 2000ms, consider:
- Reducing the entity hierarchy depth (fewer subsidiaries in scope)
- Ensuring database indexes are current (check `fin.close_run`, `fin.atlas_anomaly` indexes)

---

## 5. Key Concepts

### Advisory vs Authoritative

| System | Role | Mutations |
|--------|------|-----------|
| Control Tower | Authoritative | Creates close runs, certifies releases, enforces gates |
| Atlas | Advisory | Reads data, computes intelligence, suggests actions |

Atlas anomalies can fire risk signals that influence gate decisions, but
the gate system (not Atlas) makes the final call.

### Ephemeral Compute

Most Atlas intelligence is computed on-demand and not persisted:
- Predictions, narratives, recommendations, insight graphs, forecasts,
  and longitudinal analysis are all computed fresh per request
- Only anomalies and feedback are persisted to database tables

### Provenance

Every Atlas result carries provenance metadata:
- `deterministic: true` — same input always produces same output
- `generatedAt` — timestamp of computation
- `provider: "template"` — indicates template-based generation
- `graphHash` / `recommendationHash` — fingerprint for drift detection

---

## 6. Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| No anomalies shown | No baseline data for this entity/period | Run anomaly detection (POST to anomalies endpoint) |
| Risk score is 0 | No active anomalies, signals, or blockers | This is healthy — no action needed |
| Forecast shows "—" | Fewer than 2 historical close periods | Complete more close periods to enable forecasting |
| Longitudinal tab empty | Fewer than 2 completed periods per entity | Historical data builds automatically over time |
| Stale data after changes | Response cache not expired | Click Refresh or wait 30–60 seconds |
| Graph has no edges | No relationships found for this period | Ensure close run exists, tasks are assigned, anomalies detected |
