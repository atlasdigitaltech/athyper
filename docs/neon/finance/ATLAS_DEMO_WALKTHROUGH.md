# Atlas Intelligence — Demo Walkthrough

> **Purpose**: End-to-end demo scenario showcasing Atlas intelligence capabilities
> from late close detection through forecasting and longitudinal analysis.
> **Audience**: Product demos, investor presentations, sales engineering.
> **Date**: 2026-03-07

---

## Demo Setup

### Tenant & Entities

| Entity | Code | Type | Parent | Country |
|--------|------|------|--------|---------|
| Canada Group | `LE-CA` | PARENT | — | CA |
| Ontario Operations | `LE-CA-ON` | SUBSIDIARY | LE-CA | CA |
| Quebec Operations | `LE-CA-QC` | SUBSIDIARY | LE-CA | CA |
| Alberta Energy | `LE-CA-AB` | SUBSIDIARY | LE-CA | CA |
| BC Resources | `LE-CA-BC` | SUBSIDIARY | LE-CA | CA |

### Period Context

- **Fiscal Year**: 2026
- **Period**: P3 (March)
- **Book**: STAT (Statutory)
- P1 and P2 are fully completed (hard-closed, released)
- P3 close is in progress

### Starting State

| Entity | Close Status | Elapsed Days | Failed Tasks | Anomalies |
|--------|-------------|-------------|-------------|-----------|
| LE-CA-ON | IN_PROGRESS | 8.3 | 0 | 1 warning |
| LE-CA-QC | IN_PROGRESS | 9.1 | 2 | 3 (1 critical, 2 warning) |
| LE-CA-AB | IN_PROGRESS | 7.5 | 1 | 2 (1 critical, 1 warning) |
| LE-CA-BC | SOFT_CLOSED | 6.2 | 0 | 0 |

**Narrative**: Quebec (LE-CA-QC) is running late with 2 failed tasks and a
critical anomaly. Alberta has a critical anomaly that triggered a risk signal.
BC is ahead of schedule. Ontario is on track.

---

## Act 1: Late Close Detection

### Scene 1.1 — Global Close Monitor Overview

**Navigate to**: Global Close Monitor → set Parent: `LE-CA`, FY: `2026`, P: `3`

**What the audience sees**:

The Overview tab loads with the group risk assessment:

```
Group Risk Score: 47 (MEDIUM)
Entities: 4 | Hard-Closed: 0 | Soft-Closed: 1 | In Progress: 3

Delayed Close Ranking:
  1. LE-CA-QC — 9.1 days elapsed, risk score 68
  2. LE-CA-ON — 8.3 days elapsed, risk score 22
  3. LE-CA-AB — 7.5 days elapsed, risk score 51

Critical Path Entity: LE-CA-QC (risk 68)
  Top drivers: Critical anomalies (15 pts), Failed close tasks (16 pts),
               Warning anomalies (10 pts)
```

**Demo talking point**: "Atlas automatically identifies Quebec as the critical
path entity — it's driving the group risk score up with 2 failed tasks and a
critical anomaly. The group can't fully close until Quebec is resolved."

### Scene 1.2 — Entity Grid Deep Dive

**Click**: Entity Grid tab

**What the audience sees**:

Sortable grid showing all 4 entities. Sort by risk score descending:

| Entity | Risk | Status | Anomalies | Tasks | Recon | Elapsed |
|--------|------|--------|-----------|-------|-------|---------|
| LE-CA-QC | 68 | IN_PROGRESS | 1C 2W | 8/12 done, 2 failed | 2/3 | 9.1d |
| LE-CA-AB | 51 | IN_PROGRESS | 1C 1W | 6/10 done, 1 failed | 1/1 | 7.5d |
| LE-CA-ON | 22 | IN_PROGRESS | 0C 1W | 9/10 done | 2/2 | 8.3d |
| LE-CA-BC | 0 | SOFT_CLOSED | 0 | 10/10 done | 1/1 | 6.2d |

**Expand LE-CA-QC row** to show:
- Risk drivers: Critical anomalies (15), Failed tasks (16), Warning anomalies (10), Outstanding recon (5)
- Gate blockers: 1 (EXCEPTION_SIGNOFF gate blocked by critical anomaly)
- Release: Not started (readiness too low)

**Demo talking point**: "You can see exactly why Quebec scores 68 — the risk
score is decomposed into weighted drivers. The critical anomaly is blocking
the EXCEPTION_SIGNOFF gate, which prevents release certification."

---

## Act 2: Atlas Anomaly Detection

### Scene 2.1 — Cross-Entity Anomaly Patterns

**Click**: Anomaly Patterns tab

**What the audience sees**:

```
Repeated Patterns:
  AMOUNT_OUTLIER — appearing in 3 entities (LE-CA-QC, LE-CA-AB, LE-CA-ON)
    → 5 total occurrences across group

Hotspot Accounts:
  4100 (Revenue - Consulting) — anomalies in 2 entities (LE-CA-QC, LE-CA-AB)
  5200 (COGS - Materials) — anomalies in 2 entities (LE-CA-QC, LE-CA-ON)

Severity Distribution:
  CRITICAL: 2 | WARNING: 4 | INFO: 0
```

**Demo talking point**: "Atlas doesn't just detect anomalies per entity — it
identifies cross-entity patterns. AMOUNT_OUTLIER appearing in 3 out of 4
entities suggests a systemic issue, not isolated errors. Account 4100
(Revenue - Consulting) is a hotspot across Quebec and Alberta."

### Scene 2.2 — Single-Entity Atlas Console

**Navigate to**: Atlas Console → set Entity: `LE-CA-QC`, FY: `2026`, P: `3`

**Click**: Anomalies tab

**What the audience sees**:

3 anomalies for Quebec:

| Severity | Type | Title | Account | Z-Score |
|----------|------|-------|---------|---------|
| CRITICAL | AMOUNT_OUTLIER | Revenue balance 2.8σ above baseline | 4100 | 2.83 |
| WARNING | UNUSUAL_ADJUSTMENT | Adjustment ratio 2.4x historical average | 5200 | — |
| WARNING | OVERRIDE_SPIKE | 4 overrides in period (2x average) | — | — |

**Demo talking point**: "The critical AMOUNT_OUTLIER on account 4100 has a
z-score of 2.83 — nearly 3 standard deviations from the historical baseline.
This fired automatically from Atlas's rolling 6-period baseline comparison."

---

## Act 3: Control Tower Gate Block

### Scene 3.1 — Risk Signal Escalation

**Navigate to**: Atlas Console → Overview tab (still on LE-CA-QC)

**What the audience sees**:

```
Atlas Risk Score: 68 (HIGH)

Drivers:
  Critical anomalies: 15 pts (1 anomaly)
  Warning anomalies: 10 pts (2 anomalies)
  Failed close tasks: 16 pts (2 tasks)
  Outstanding reconciliations: 5 pts (1 remaining)
  Blocked close tasks: 4 pts (1 blocked by gate)

Atlas Risk Signals:
  [FIRED] atlas_anomaly_amount_outlier — Critical — "Revenue anomaly on 4100"
```

**Demo talking point**: "Atlas's critical anomaly automatically fired a close
risk signal through the atlas_anomaly rule type. This signal is evaluated by
the Control Tower's gate system — specifically the EXCEPTION_SIGNOFF gate."

### Scene 3.2 — Gate Block in Action

**Navigate to**: Release Control Tower for LE-CA-QC (or reference it)

**What the audience sees**:

The EXCEPTION_SIGNOFF gate shows:
```
Gate: EXCEPTION_SIGNOFF
Status: BLOCKED
Blockers:
  - atlas_anomaly_amount_outlier: Critical anomaly on account 4100
    (Revenue balance 2.8σ above baseline)
```

**Demo talking point**: "This is the governance bridge. Atlas detected the
anomaly, escalated it to a risk signal, and the Control Tower's gate system
blocked the release certification. The accountant must resolve or acknowledge
the anomaly before the release can proceed. Atlas is advisory, but its signals
flow into the authoritative gate system."

---

## Act 4: Atlas Recommendations

### Scene 4.1 — Recommended Actions

**Navigate to**: Atlas Console → Overview tab (LE-CA-QC)

**Scroll to**: Recommended Actions section

**What the audience sees**:

```
Recommended Actions (4 items):

[CRITICAL] Resolve Revenue balance 2.8σ above baseline
  Rationale: Review account balance and recent journal entries for unusual postings.
  Suggested owner: ACCOUNTANT
  Evidence: anomaly z-score: 2.83
  Impact: Blocks EXCEPTION_SIGNOFF gate until resolved or acknowledged.

[HIGH] Resolve 2 failed close tasks
  Rationale: Failed close tasks reduce release readiness. Investigate and resolve
  or request waivers.
  Suggested owner: CLOSE_MANAGER
  Evidence: 8/12 tasks complete
  Impact: Release readiness at 42%.

[HIGH] Review Adjustment ratio 2.4x historical average
  Rationale: Check adjustment entries for proper approval and supporting documentation.
  Suggested owner: ACCOUNTANT
  Evidence: anomaly - UNUSUAL_ADJUSTMENT
  Impact: May escalate to a close risk signal if unresolved.

[MEDIUM] Complete 1 outstanding reconciliation session
  Rationale: 2 of 3 sessions complete.
  Suggested owner: RECONCILIATION_ANALYST
  Impact: —
```

**Demo talking point**: "Every recommendation is deterministic, evidence-backed,
and priority-ranked. The system tells you exactly what to fix, who should fix
it, and what the impact is if it's not fixed. These are not AI hallucinations —
they're computed from actual anomaly data, task status, and gate requirements."

### Scene 4.2 — Insight Graph Visualization

**Click**: Insight Graph tab

**What the audience sees**:

A force-directed graph showing the causal chain:

```
  [PERIOD P3] ←DERIVED_FROM← [CLOSE_RUN #1]
                                    |
                              DERIVED_FROM
                                    |
                              [RELEASE DRAFT]
                                    |
                               BLOCKED_BY
                                    |
                 [ANOMALY: Revenue 2.8σ] ←AFFECTS→ [ACCOUNT 4100]
                         |
                    ESCALATED_TO
                         |
                 [RISK_SIGNAL: atlas_anomaly]
                         |
                    TRIGGERED_BY
                         |
                 [TASK: Exception signoff] ←DEPENDS_ON← [TASK: GL recon]
```

**Demo interaction**:
- Click the ANOMALY node → highlights all connected edges
- Edge labels appear: "BLOCKED BY", "ESCALATED TO", "AFFECTS"
- Scroll to zoom into the blocking chain
- Drag to pan around the graph

**Demo talking point**: "The insight graph visualizes the causal chain. You
can see the release is blocked BY the anomaly, which affects account 4100 and
escalated TO a risk signal. This isn't a static diagram — it's computed from
live data with 8 node types and 7 edge types."

---

## Act 5: Global Close Monitor — Critical Path

### Scene 5.1 — Narratives

**Navigate to**: Global Close Monitor → Narratives tab (LE-CA, FY 2026, P3)

**What the audience sees**:

**Group Dashboard Summary**:
> Canada Group close for P3 FY2026 is in moderate risk status across 4 entities.
> 1 of 4 entities has reached close (0 hard-closed, 1 soft-closed), 3 remain
> in progress. Atlas detected 6 active anomalies across the group, 2 critical.
> AMOUNT_OUTLIER is repeating across 3 entities — potential systemic issue.
> Projected group close duration: 14.2 days. 2 intercompany transactions
> remain pending (45,000.00 unsettled).

**Group CFO Brief**:
> 1. Canada Group P3 FY2026: Attention needed (Group Risk Score: 47).
> 2. Close progress: 1/4 entities closed.
> 3. Critical path: Quebec Operations (LE-CA-QC) — projected 14.2 days total.
> 4. Key risks: 2 critical anomalies, 1 gate blocker, 5 overrides (MEDIUM concentration).
> 5. Cross-entity patterns: AMOUNT_OUTLIER (3 entities).
> 6. IC settlement: 2 pending (45,000.00 unsettled).

**Demo talking point**: "These narratives are auto-generated from live data —
no manual writing needed. The CFO brief is structured as numbered bullets that
can be dropped directly into a board report. Every fact is traceable back to
the underlying data."

### Scene 5.2 — Enhanced Critical Path

**Scroll to**: Entity Projections in Narratives tab

**What the audience sees**:

```
Entity Close Projections:

Entity          | Elapsed | Projected Remaining | Projected Total | SLA Breach
LE-CA-QC        | 9.1d    | 5.1d               | 14.2d           | YES
LE-CA-AB        | 7.5d    | 4.8d               | 12.3d           | NO
LE-CA-ON        | 8.3d    | 2.1d               | 10.4d           | NO
LE-CA-BC        | 6.2d    | 0.0d (closed)      | 6.2d            | NO

Projected Group Completion: 14.2 days (driven by LE-CA-QC)
SLA Breach Count: 1 entity projected to breach

Delay Explanation:
Quebec Operations (LE-CA-QC) is the slowest entity with 14.2 projected total
days. 2 entities have active blockers: LE-CA-QC, LE-CA-AB. 1 entity is
projected to breach SLA.
```

**Demo talking point**: "The critical path engine projects completion for
every entity based on current task completion rate plus penalties for failures
and blockers. Quebec's 2 failed tasks add 3 days of penalty, pushing it past
the SLA target."

---

## Act 6: Forecast + Longitudinal Explanation

### Scene 6.1 — Group Close Forecast

**Click**: Forecast tab

**What the audience sees**:

**Group Forecast Hero Card**:
```
  13.5d predicted group completion | 72% confidence
  Critical path: LE-CA-QC (13.5d predicted)
  4 open entities
```

**Breach Risk Distribution**:
- Critical (≥70%): 1 entity (LE-CA-QC at 78%)
- High (50–70%): 1 entity (LE-CA-AB at 55%)
- Medium (30–50%): 0
- Low (<30%): 2 entities

**Readiness Trajectory**:
- Improving: 1 (LE-CA-BC — already soft-closed)
- Stable: 2 (LE-CA-ON, LE-CA-AB)
- Worsening: 1 (LE-CA-QC)

**Per-Entity Forecast Table**:

| Entity | Hist Avg | Pace | Predicted | Conf | Breach | Done | Trend |
|--------|----------|------|-----------|------|--------|------|-------|
| LE-CA-QC | 10.2d | 13.7d | 13.5d | 68% | 78% | 67% | ↑ worsening |
| LE-CA-AB | 9.5d | 12.5d | 11.8d | 72% | 55% | 60% | — stable |
| LE-CA-ON | 8.8d | 9.2d | 9.4d | 78% | 12% | 90% | — stable |
| LE-CA-BC | 7.1d | — | 6.2d | 82% | 0% | 100% | ↓ improving |

**Demo talking point**: "The forecast blends 60% historical average with 40%
current pace, then adds risk penalties for failures and blockers. Quebec's
historical average is 10.2 days, but current pace suggests 13.7 days. The
blended prediction of 13.5 days puts it at 78% SLA breach probability.
The confidence score reflects how much historical data we have and how
consistent the entity's past performance has been."

### Scene 6.2 — SLA Breach Risk Warning

**Scroll to**: SLA Breach Risk Entities card (red background)

**What the audience sees**:

```
SLA Breach Risk Entities:

  LE-CA-QC — Quebec Operations
    78% breach risk | 13.5d predicted

  LE-CA-AB — Alberta Energy
    55% breach risk | 11.8d predicted
```

**Demo talking point**: "The breach probability isn't just a guess — it's
computed from the `vw_sla_breach_forecast` view which factors in prediction
buffer hours, blocker counts, slippage trend, and confidence level."

### Scene 6.3 — Longitudinal Intelligence

**Click**: Longitudinal tab

**What the audience sees**:

**Entity Behavior Profiles**:

| Entity | Avg Days | Median | Periods | Breaches | Breach % | Trend |
|--------|----------|--------|---------|----------|----------|-------|
| LE-CA-QC | 10.2d | 9.8d | 6 | 3 | 50% | ↑ worsening |
| LE-CA-AB | 9.5d | 9.2d | 6 | 1 | 17% | — stable |
| LE-CA-ON | 8.8d | 8.5d | 6 | 0 | 0% | ↓ improving |
| LE-CA-BC | 7.1d | 7.0d | 6 | 0 | 0% | ↓ improving |

**Demo talking point**: "This is longitudinal intelligence — Atlas analyzes
behavior across all completed periods, not just the current one. Quebec has
breached SLA in 3 out of 6 periods (50% breach rate), and the trend is
worsening. This is a structural problem, not a one-time event."

**Persistent Anomaly Patterns**:
```
  AMOUNT_OUTLIER — 4 periods, 3 entities, 12 total occurrences
  UNUSUAL_ADJUSTMENT — 3 periods, 2 entities, 7 total occurrences
```

**Entity Trends**:

| Entity | Close Speed | Anomalies | Overall |
|--------|------------|-----------|---------|
| LE-CA-QC | ↑ worsening | ↑ worsening | Needs Attention |
| LE-CA-AB | — stable | — stable | Stable |
| LE-CA-ON | ↓ improving | ↓ improving | Improving |
| LE-CA-BC | ↓ improving | — stable | Improving |

**Demo talking point**: "The trends show Quebec is getting worse on both
axes — close speed and anomaly count. Ontario and BC are improving. This
kind of longitudinal analysis is unique to Atlas."

### Scene 6.4 — Delay Explanations

**Scroll to**: "Why Do These Entities Delay?" section

**What the audience sees**:

```
Quebec Operations (LE-CA-QC) shows repeated delay patterns:
  breached SLA in 3 of 6 periods (50% breach rate);
  close duration trend is worsening (recent periods are slower than
  historical average);
  recurring anomaly patterns: AMOUNT_OUTLIER, UNUSUAL_ADJUSTMENT;
  anomaly count is increasing across recent periods.
```

**Demo talking point**: "Atlas doesn't just say 'this entity is slow' — it
explains why. Quebec has a 50% SLA breach rate, a worsening duration trend,
recurring anomaly types across multiple periods, and increasing anomaly counts.
This is deterministic reasoning from computed data, not an LLM response. Same
data always produces the same explanation."

---

## Demo Narrative Arc (Summary)

```
ACT 1: DETECTION
  Global Close Monitor shows Quebec as critical path (risk 68)
                              |
                              v
ACT 2: ANOMALY ANALYSIS
  Cross-entity pattern: AMOUNT_OUTLIER in 3 entities (systemic)
  Quebec has critical anomaly on Revenue (z=2.83)
                              |
                              v
ACT 3: GOVERNANCE BRIDGE
  Anomaly → Risk Signal → Gate Block
  EXCEPTION_SIGNOFF gate blocked for Quebec
  "Atlas is advisory, but signals flow into authoritative gates"
                              |
                              v
ACT 4: ACTIONABLE INTELLIGENCE
  4 prioritized recommendations with evidence and owners
  Insight graph shows causal chain: Release ← Anomaly → Signal
                              |
                              v
ACT 5: GROUP INTELLIGENCE
  Auto-generated CFO brief with all key facts
  Critical path projects Quebec at 14.2d (SLA breach)
                              |
                              v
ACT 6: PREDICTIVE + LONGITUDINAL
  Forecast: 78% breach probability for Quebec
  Longitudinal: 50% breach rate across 6 periods, worsening trend
  Delay explanation: systemic, not one-time
```

---

## Key Demo Messages

1. **Native, not bolted on**: Atlas is embedded in the same platform as close
   management, reconciliation, and release governance. No separate product.

2. **Grounded in governed data**: Every Atlas insight reads from data that has
   passed through close gates and reconciliation checks. This is auditable truth.

3. **Advisory with governance bridge**: Atlas never bypasses gates. But its
   anomaly signals flow into the Control Tower's gate system, creating a
   governance bridge between intelligence and action.

4. **Deterministic, not probabilistic**: Same data always produces the same
   anomalies, narratives, recommendations, and forecasts. No LLM randomness.
   Fully auditable.

5. **Multi-entity intelligence**: Group-level forecasting, cross-entity
   anomaly patterns, and longitudinal behavior profiles — capabilities no
   competitor offers natively.

6. **Self-improving**: Operator feedback drives threshold calibration with
   human-in-the-loop governance. Atlas gets more accurate over time.

---

## Technical Notes for Demo Setup

### API Calls for Verification

**Global Close Monitor**:
```
GET /api/fin/atlas/global-close?parentEntityCode=LE-CA&fiscalYear=2026&periodNumber=3
```

Check response for:
- `X-Atlas-Cache: MISS` header on first call, `HIT` on rapid refresh
- `_profiling.totalMs` for query performance
- `_profiling.queryCount: 19`

**Single-Entity Dashboard**:
```
GET /api/fin/atlas/dashboard?entityCode=LE-CA-QC&fiscalYear=2026&periodNumber=3
```

**Insight Graph**:
```
GET /api/fin/atlas/insight-graph?entityCode=LE-CA-QC&fiscalYear=2026&periodNumber=3&nodeLimit=50
```

### Graph Visualization Demo Tips

- Start zoomed out to show the full graph
- Click the RELEASE node first to show blocking edges
- Then click the ANOMALY node to show the escalation chain
- Use the "Clear selection" button to reset
- Point out the controls hint: "Scroll to zoom · Drag to pan · Click node to select"

### Seed Data Requirements

Ensure the following seed data exists for a successful demo:
- 4 legal entities under LE-CA parent hierarchy
- Completed close runs for P1 and P2 (both hard-closed)
- P3 close runs in progress with varying task completion
- Atlas anomaly baselines for all entities (from P1/P2 data)
- Detected anomalies for P3 (at least 1 critical for LE-CA-QC)
- Close calendar entries with SLA targets for all entities
- At least 2 intercompany transactions between group entities
- Reconciliation sessions (mix of completed and pending)
