# Atlas Intelligence — Admin Calibration Guide

> **Audience**: Platform Administrators, Controllers, Finance System Owners
> **Product**: Athyper Neon — Atlas Intelligence Layer (Adaptive Learning)
> **Date**: 2026-03-07

---

## 1. Purpose

This guide covers the administration of Atlas's adaptive learning system:
threshold calibration, feedback governance, effectiveness monitoring, and
performance tuning. These capabilities allow you to fine-tune Atlas's
anomaly detection accuracy over time while maintaining auditability.

---

## 2. Calibration Architecture

```
  User reviews anomaly
    |
    v
  Submits feedback (CONFIRMED / FALSE_POSITIVE + reason code)
    |
    v
  System computes false positive rates per anomaly type × entity
    |
    v
  Generates calibration suggestions (pure function, deterministic)
    |
    v
  Admin approves or rejects suggestion (with documented reason)
    |
    v
  Approved calibration applied to anomaly detection thresholds
```

**Key principle**: The system suggests, the human decides, the decision is
audited. No auto-application of threshold changes.

---

## 3. Feedback Management

### 3.1 Feedback Targets

| Target | When to use |
|--------|------------|
| `ANOMALY` | Feedback on a detected anomaly (z-score outlier, recon variance, etc.) |
| `RECOMMENDATION` | Feedback on a suggested action from the Atlas Recommendations panel |

### 3.2 Verdicts

| Verdict | Target | Meaning | Impact |
|---------|--------|---------|--------|
| `CONFIRMED` | ANOMALY | This is a real issue | Increases confirmed rate — may trigger threshold tightening |
| `FALSE_POSITIVE` | ANOMALY | This is noise, not a real issue | Increases FP rate — may trigger threshold loosening |
| `ACCEPTED` | RECOMMENDATION | User accepted the recommendation | Increases acceptance rate |
| `DISMISSED` | RECOMMENDATION | User dismissed the recommendation | Increases dismissal rate |
| `DEFERRED` | Both | Action deferred to later | Neutral — tracked but does not affect calibration |

### 3.3 Reason Codes

Always select a reason code when submitting feedback. This structured taxonomy
enables pattern analysis across feedback.

| Code | Use when... |
|------|------------|
| `SEASONAL_PATTERN` | The flagged amount is normal seasonal variation (e.g., Q4 revenue spike) |
| `ONE_TIME_EVENT` | Non-recurring event that won't repeat (e.g., acquisition adjustment) |
| `KNOWN_ADJUSTMENT` | Pre-approved adjustment with documented authorization |
| `DATA_QUALITY` | Source data issue, not a real accounting anomaly |
| `THRESHOLD_TOO_SENSITIVE` | Z-score threshold is too low for this account/entity |
| `THRESHOLD_TOO_LOOSE` | Threshold is too high — real issues are being missed |
| `NOT_ACTIONABLE` | Recommendation cannot be acted upon in current context |
| `ALREADY_ADDRESSED` | The issue was already resolved before Atlas flagged it |
| `INCORRECT_OWNER` | Wrong owner role suggested in recommendation |
| `IMMATERIAL` | Below materiality threshold for this entity |
| `OTHER` | Use sparingly — provide detail in `reason_detail` free-text field |

**Best practice**: Avoid `OTHER` when possible. Structured codes enable
automated analysis. Use `OTHER` only for genuinely novel situations.

### 3.4 Evidence Snapshot

Each feedback record captures an immutable `evidence_snapshot` at submission
time. This preserves what the user saw when making their judgment — even if
the underlying data changes later.

Snapshots include:
- Anomaly severity, z-score, observed/expected values
- Account code and name
- Period context (entity, fiscal year, period number)

---

## 4. Threshold Calibration

### 4.1 How Suggestions Are Generated

The calibration algorithm is a pure function that operates on aggregated
false positive rate data. It runs automatically when you view the
Feedback & Calibration tab.

**Loosening (reduce sensitivity)**:
- Trigger: False positive rate >= 30% for an anomaly type (minimum 5 samples)
- Action: Suggest raising z-score threshold by up to 0.5σ
- Formula: `adjustment = min(0.5, (fpRate - 0.2) × 1.5)`
- Example: 40% FP rate → suggest raising threshold by 0.30σ

**Tightening (increase sensitivity)**:
- Trigger: Confirmed rate >= 90% with 10+ samples
- Action: Suggest lowering z-score threshold by up to 0.3σ
- Formula: `adjustment = min(0.3, (confirmedRate - 0.85) × 1.0)`
- Example: 95% confirmed rate → suggest lowering threshold by 0.10σ

### 4.2 Guard Rails

Hard limits prevent overly aggressive tuning:

| Severity | Minimum Z-Score Threshold |
|----------|--------------------------|
| WARNING | 1.5σ |
| CRITICAL | 2.0σ |

No calibration suggestion will ever set a threshold below these floors.

### 4.3 Confidence Scoring

Each suggestion includes a confidence score based on sample size:

```
confidence = min(95, 50 + min(sampleSize, 30) × 1.5)
```

| Samples | Confidence |
|---------|-----------|
| 5 | 57% |
| 10 | 65% |
| 15 | 72% |
| 20 | 80% |
| 30+ | 95% |

**Recommendation**: Only approve calibrations with 70%+ confidence (≥15 samples).
Lower-confidence suggestions should be deferred until more feedback accumulates.

### 4.4 Calibration Lifecycle

| Status | Meaning | Action |
|--------|---------|--------|
| `SUGGESTED` | Computed from feedback, awaiting admin review | Review rationale and confidence |
| `APPROVED` | Admin-approved, active in anomaly detection | Applied to next detection run |
| `REJECTED` | Admin-rejected with documented reason | No effect on detection |
| `SUPERSEDED` | Replaced by a newer calibration for same scope | Automatically set when new suggestion approved |

### 4.5 Approving a Calibration

**API**: `PATCH /api/fin/atlas/feedback/calibrations`

```json
{
  "calibrationId": "<uuid>",
  "action": "approve"
}
```

To reject:
```json
{
  "calibrationId": "<uuid>",
  "action": "reject",
  "reason": "Insufficient sample size — deferring to next quarter"
}
```

**In the UI**: Navigate to the Feedback & Calibration tab in the Atlas Console.
The Calibration Queue section shows pending suggestions with confidence scores,
current thresholds, and proposed new thresholds.

### 4.6 Scope

Calibrations are scoped by:
- **Tenant** (always)
- **Entity code** (optional — can be entity-specific or global)
- **Account ID** (optional — can be account-specific)
- **Anomaly type** (always)

More specific scopes take precedence. For example, an entity+account-specific
calibration overrides a global calibration for the same anomaly type.

---

## 5. Effectiveness Monitoring

### 5.1 Detection Effectiveness

The Feedback tab shows two-axis effectiveness metrics:

**Anomaly Effectiveness**:
- **Confirmed Rate**: % of reviewed anomalies marked CONFIRMED
- **False Positive Rate**: % of reviewed anomalies marked FALSE_POSITIVE
- **Per-Type Breakdown**: FP rates by anomaly type (AMOUNT_OUTLIER, RECON_VARIANCE, etc.)

**Recommendation Effectiveness**:
- **Acceptance Rate**: % of reviewed recommendations marked ACCEPTED
- **Dismissal Rate**: % of reviewed recommendations marked DISMISSED
- **Per-Type Breakdown**: Acceptance by recommendation type

### 5.2 Target Metrics

| Metric | Target | Action if not met |
|--------|--------|-------------------|
| Anomaly confirmed rate | > 70% | Review and approve loosening calibrations |
| Anomaly FP rate | < 25% | System will auto-suggest threshold loosening |
| Recommendation acceptance | > 60% | Review recommendation types being dismissed |
| Feedback coverage | > 50% of anomalies | Encourage operators to submit feedback |

### 5.3 Monitoring Cadence

| Frequency | Activity |
|-----------|----------|
| Weekly | Review pending calibration suggestions |
| Monthly | Review effectiveness metrics by entity |
| Quarterly | Review persistent anomaly patterns and adjust entity-specific thresholds |

---

## 6. Performance Tuning

### 6.1 Response Caching

Atlas caches API responses at the process level:

| Endpoint | TTL | Key |
|----------|-----|-----|
| Global Close Monitor | 30s | `atlas:gcm:{tenant}:{parent}:{fy}:{pn}` |
| Atlas Dashboard | 60s | `atlas:dash:{tenant}:{entity}:{fy}:{pn}` |

**To clear cache**: Caches auto-expire. No manual flush needed. Changing entity
or period in the UI creates a new cache key. Cache eviction runs every 60 seconds.

### 6.2 Query Performance

The Global Close Monitor executes 19 parallel SQL queries. Response includes
profiling data:

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

**Performance targets**:
| Entity Count | Expected `totalMs` |
|-------------|-------------------|
| 1–5 entities | < 300ms |
| 5–15 entities | < 800ms |
| 15–50 entities | < 2000ms |

If performance degrades, check:
1. **Database indexes**: Ensure indexes on `fin.close_run(tenant_id, entity_code, fiscal_year, period_number)` and `fin.atlas_anomaly(tenant_id, entity_code, fiscal_year, period_number)` exist
2. **Entity hierarchy depth**: Very deep hierarchies increase the recursive CTE cost
3. **Historical data volume**: The Q16 historical close runs query scans all completed periods — index on `status` helps

### 6.3 Insight Graph Scale

The insight graph API accepts a `nodeLimit` parameter (default: 50).
For large entities with many anomalies/tasks, reduce the limit:

```
GET /api/fin/atlas/insight-graph?entityCode=ACME&fiscalYear=2026&periodNumber=3&nodeLimit=30
```

This reduces graph computation time and improves visualization performance.

---

## 7. Database Tables

### Feedback & Calibration Schema

| Table | Purpose | Growth Pattern |
|-------|---------|---------------|
| `fin.atlas_feedback` | Append-only feedback log | Grows with operator feedback (typically 10–50 per period per entity) |
| `fin.atlas_threshold_calibration` | Per-entity/account threshold overrides | Grows slowly (typically 1–5 per quarter per entity) |
| `fin.vw_atlas_false_positive_rates` | Aggregated FP rates (view, not table) | Computed on-demand |

### Anomaly Schema

| Table | Purpose | Growth Pattern |
|-------|---------|---------------|
| `fin.atlas_anomaly_baseline` | Rolling statistical baselines | One row per account × metric × entity |
| `fin.atlas_anomaly` | Detected anomalies | Grows with detection runs (typically 0–20 per period per entity) |

### Retention

- **Feedback**: Retained indefinitely (audit requirement)
- **Calibrations**: Retained indefinitely (audit trail of threshold changes)
- **Anomalies**: Retained per data retention policy (linked to fiscal period lifecycle)
- **Baselines**: Rolling — updated each period, no unbounded growth

---

## 8. Security & Access Control

### Role-Based Access

| Action | Required Role |
|--------|--------------|
| View Atlas Console | Any authenticated user |
| Submit anomaly feedback | `ACCOUNTANT`, `CONTROLLER`, `CLOSE_MANAGER` |
| Submit recommendation feedback | `ACCOUNTANT`, `CONTROLLER`, `CLOSE_MANAGER` |
| Approve calibration | `CONTROLLER`, `ADMIN` |
| Reject calibration | `CONTROLLER`, `ADMIN` |
| View Global Close Monitor | Any authenticated user |

### Audit Trail

All feedback and calibration actions are recorded with:
- User ID and timestamp
- Full evidence snapshot at time of submission
- Approval/rejection reason for calibrations
- Immutable — feedback records cannot be deleted or modified

---

## 9. Glossary

| Term | Definition |
|------|-----------|
| **Z-score** | Number of standard deviations from the historical mean. Higher = more unusual. |
| **Baseline** | Rolling 6-period statistical average for an account × metric |
| **Calibration** | Adjustment to anomaly detection threshold based on feedback data |
| **False positive rate** | Percentage of detected anomalies that operators mark as FALSE_POSITIVE |
| **Confirmed rate** | Percentage of detected anomalies that operators mark as CONFIRMED |
| **Ephemeral compute** | Intelligence computed on-demand per request, not stored in database |
| **Provenance** | Metadata tracking how and when intelligence was generated |
| **Guard rail** | Hard minimum threshold that prevents over-loosening of anomaly detection |
| **SLA breach probability** | Predicted likelihood (0–100%) of missing hard close target date |
