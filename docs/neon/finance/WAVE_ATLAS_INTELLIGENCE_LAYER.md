# Athyper Finance -- Atlas Intelligence Layer

**Wave Name**: Atlas Intelligence Layer
**Version**: 7.0.0 (Platform Hardening + Documentation + Demo)
**Date**: 2026-03-07
**Prerequisite**: Governed Release Control Tower v2.0.0 (Production Ready)
**Phase 1 Status**: Implemented
**Phase 2 Status**: Implemented
**Phase 3A Status**: Implemented
**Phase 3B Status**: Implemented
**Phase 4 Status**: Implemented
**Phase 5 Status**: Implemented
**Phase 6 Status**: Implemented
**Console Status**: Implemented

---

## 1. Strategic Position

The Governed Release Control Tower answers: **"Is this financial period correct,
consistent, and safe to release?"**

The Atlas Intelligence Layer answers: **"What does this financial data mean,
what should we worry about, and what should we do next?"**

Atlas sits *above* the Control Tower. It consumes the governed, certified
outputs (GL balances, reconciliation results, close snapshots, risk signals)
and produces intelligence: anomalies, predictions, narratives, and recommended
actions. It never bypasses the Control Tower's gates — it reads from the
certified truth that those gates protect.

```
  +-----------------------------------------------+
  |         Atlas Intelligence Layer               |
  |  Anomalies | Predictions | Narratives | Actions|
  +-----------------------------------------------+
                       |
              reads certified data
                       |
  +-----------------------------------------------+
  |       Governed Release Control Tower           |
  |  Close | Certify | Reconcile | Release | Audit |
  +-----------------------------------------------+
                       |
              writes governed data
                       |
  +-----------------------------------------------+
  |            Core Posting Pipeline               |
  |  Journal | GL Balance | Dimensions | Events    |
  +-----------------------------------------------+
```

---

## 2. Implementation Architecture

### Folder: `framework/runtime/src/services/business/engines/atlas-ai/`

Atlas AI is an existing engine in the Athyper runtime, registered under
engine code `atlas-ai` in the meta entity system.

### Schema: `fin` (no separate schema)

All Atlas tables live in the `fin` schema alongside the posting engine,
close orchestration, and reconciliation tables. This follows the existing
Athyper pattern where financial domain tables share a single schema.

### Existing Infrastructure (pre-Phase 1)

| Component | File | Status |
|-----------|------|--------|
| `fin.ai_model_registry` | `166_atlas_ai.sql` | Schema ready |
| `fin.ai_prediction` | `166_atlas_ai.sql` | Schema ready |
| `fin.ai_action` | `166_atlas_ai.sql` | Schema ready |
| `fin.ai_drift_monitor` | `166_atlas_ai.sql` | Schema ready |
| Domain types | `atlas-ai/domain/types.ts` | Implemented |
| Action service | `atlas-ai/services/action-service.ts` | Implemented |
| DI tokens | `kernel/tokens.ts` | 11 tokens registered |

---

## 3. Phase 1: Anomaly Detection (Implemented)

### 3.1 New Schema

**Migration**: `210_atlas_anomaly.sql`

| Table | Purpose |
|-------|---------|
| `fin.atlas_anomaly_baseline` | Rolling statistical baselines per account × metric |
| `fin.atlas_anomaly` | Detected anomalies with evidence and lifecycle |

**Migration**: `211_atlas_anomaly_rule_type.sql`

Extends `fin.close_risk_rule.rule_type` CHECK constraint to include `atlas_anomaly`.

### 3.2 Anomaly Types

| Type | Detection Method | Example |
|------|-----------------|---------|
| `AMOUNT_OUTLIER` | Z-score of net movement vs 12-period baseline | "Utilities expense 3.2σ above baseline" |
| `UNUSUAL_ADJUSTMENT` | Adjustment JE count vs historical count baseline | "Account 5100 has 8 adjustments (3.1σ above baseline)" |
| `RECON_VARIANCE` | Reconciliation discrepancy outside tolerance | "Bank 1020 — $3,200 reconciliation variance" |
| `EXCEPTION_PATTERN` | Override/exception count analysis | (Future) |
| `TIMING_ANOMALY` | Posting date cadence break | (Future) |
| `MISSING_RECURRENCE` | Expected recurring entry absent | (Future) |

### 3.3 Severity Assignment

| Z-Score | Severity |
|---------|----------|
| < 2.5 | Not flagged (below detection threshold) |
| >= 2.5 | `WARNING` |
| >= 3.0 | `CRITICAL` |

Reconciliation variances use absolute thresholds:
- > $10,000 → `CRITICAL`
- > $1,000 → `WARNING`
- <= $1,000 → `INFO` (not escalated)

### 3.4 Risk Signal Integration

Atlas anomalies feed into the existing close risk signal system:

```
Atlas Anomaly Detector
        ↓
  fin.atlas_anomaly (OPEN)
        ↓
Risk Signal Dispatcher (scheduled)
  evaluates atlas_anomaly rules
        ↓
  fin.close_risk_signal (fired)
        ↓
EXCEPTION_SIGNOFF gate
```

Eight seed rules for the demo entity (ACME):

| Rule Code | Name | Triggers On |
|-----------|------|-------------|
| `ATLAS_AMOUNT_OUTLIER` | Atlas: GL Amount Outlier | WARNING+ AMOUNT_OUTLIER or UNUSUAL_ADJUSTMENT |
| `ATLAS_RECON_VARIANCE` | Atlas: Reconciliation Variance | WARNING+ RECON_VARIANCE |
| `ATLAS_CRITICAL` | Atlas: Critical Anomaly Escalation | CRITICAL any type, escalates to Controller |
| `ATLAS_PERIOD_END_SPIKE` | Atlas: Period-End Journal Spike | WARNING+ PERIOD_END_SPIKE |
| `ATLAS_MANUAL_RATIO` | Atlas: Manual Journal Ratio | WARNING+ MANUAL_JOURNAL_RATIO |
| `ATLAS_LATE_CLOSE` | Atlas: Close Task Duration Anomaly | WARNING+ LATE_CLOSE_TASK |
| `ATLAS_OVERRIDE_SPIKE` | Atlas: Override/Waiver Spike | WARNING+ OVERRIDE_SPIKE, escalates to Controller |
| `ATLAS_LARGE_ADJUSTMENT` | Atlas: Large Adjustment Size | WARNING+ LARGE_ADJUSTMENT |

The evaluator is a pure function in `close-risk-evaluator.ts` that checks
`RiskEvaluationContext.atlasAnomalies` (populated by the context loader when
atlas_anomaly rules exist).

### 3.5 Runtime Services

| Service | File | DI Token |
|---------|------|----------|
| `BaselineComputeService` | `atlas-ai/services/baseline-compute.service.ts` | `engine.atlas.baselineComputeService` |
| `AnomalyDetectorService` | `atlas-ai/services/anomaly-detector.service.ts` | `engine.atlas.anomalyService` |
| `ActionService` | `atlas-ai/services/action-service.ts` | `engine.atlas.actionService` |

**BaselineComputeService**: Queries trailing N-period GL balance data, computes
mean + stddev per account × metric type, upserts into `fin.atlas_anomaly_baseline`.
Registered as a scheduled job (`atlas.job.baselineCompute`), runs post-close.

**AnomalyDetectorService**: Compares current period data against baselines using
z-score analysis. Produces anomalies in `fin.atlas_anomaly`. Runs on a 4-hour
schedule during close window (`atlas.schedule.anomalyDetection`).

### 3.6 API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fin/atlas/anomalies` | List anomalies with filters |
| POST | `/api/fin/atlas/anomalies` | Trigger anomaly detection for entity/period |
| GET | `/api/fin/atlas/anomalies/{id}` | Anomaly detail with baseline + risk signal |
| PATCH | `/api/fin/atlas/anomalies/{id}` | Acknowledge, resolve, or mark false positive |
| GET | `/api/fin/atlas/dashboard` | Composite intelligence dashboard payload |

### 3.7 Dashboard Payload

`GET /api/fin/atlas/dashboard` returns:

```json
{
  "summary": {
    "activeCount": 3,
    "criticalCount": 1,
    "warningCount": 2,
    "resolvedCount": 1,
    "totalCount": 4
  },
  "riskScore": "HIGH",
  "topAnomalies": [...],
  "baselineHealth": {
    "accountsWithBaseline": 42,
    "totalAccounts": 55
  },
  "atlasSignals": [...]
}
```

Risk score computation:
- `HIGH` — any CRITICAL anomaly active
- `MEDIUM` — 3+ WARNING anomalies active
- `LOW` — any active anomalies
- `NONE` — no active anomalies

---

## 4. Anomaly Lifecycle

```
OPEN → ACKNOWLEDGED → RESOLVED
OPEN → FALSE_POSITIVE
ACKNOWLEDGED → FALSE_POSITIVE
```

Terminal states: `RESOLVED`, `FALSE_POSITIVE`

When an anomaly is resolved/marked false positive and the corresponding
risk signal's condition clears, the risk signal auto-resolves on the
next evaluation cycle.

---

## 5. Design Principles

1. **Atlas is advisory** — it observes, analyzes, and suggests. It never
   posts, certifies, or releases. Those remain under Control Tower governance.

2. **Deterministic first** — Phase 1 uses statistical methods only (z-score,
   aggregate comparison). No LLM. Every anomaly is explainable with a
   specific z-score, baseline, and evidence payload.

3. **Existing integration only** — Atlas anomalies route through the existing
   risk signal system. No new gates, no new governance infrastructure. The
   `EXCEPTION_SIGNOFF` gate handles Atlas signals identically to all others.

4. **Separate schema namespace** — Atlas tables use `fin.atlas_*` prefix to
   distinguish from core financial tables, while remaining in the same schema
   for FK integrity.

5. **Graceful degradation** — If no baselines exist (first period, new entity),
   anomaly detection skips gracefully. If the Atlas module is not registered,
   the Control Tower operates normally.

---

## 6. Phase 2: Predictive Analytics (Implemented)

### 6.1 Prediction Types

| Prediction | Methodology | Key Inputs |
|------------|------------|------------|
| **Close Duration Forecast** | 70% historical avg + 30% pace-based estimate, risk/recon penalties | `fin.close_run` trailing 12 periods, task completion rate, risk signal count |
| **Release Readiness Probability** | Multiplicative probability from gate factors | Task completion, risk signals, critical anomalies, reconciliation status, GL consistency |
| **Reconciliation Completion Forecast** | Session-based forecast from historical completion times | `fin.reconciliation_session` completion durations, remaining session count |

### 6.2 Confidence Scoring

- **Close Duration**: Based on coefficient of variation (CV) of historical data + sample size. Higher CV = lower confidence. Range: 30–95%.
- **Release Readiness**: Based on checklist depth. More tasks = higher confidence. Range: 30–90%.
- **Reconciliation**: Based on historical session count. More history = higher confidence. Range: 40–90%.

### 6.3 Runtime Service

| Service | File | DI Token |
|---------|------|----------|
| `DefaultPredictionService` | `atlas-ai/services/prediction.service.ts` | `engine.atlas.predictionService` |

The service runs all 3 predictions in parallel via `Promise.all()`. Each prediction
gracefully returns `null` when insufficient historical data exists. Uses parameterized
SQL queries via container-resolved DB — no ORM, no Kysely dependency at the runtime layer.

### 6.4 API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fin/atlas/predictions` | Compute all 3 predictions for entity/period |
| GET | `/api/fin/atlas/dashboard` | Extended — now includes `predictions` in response payload |

### 6.5 Dashboard Integration

The `/api/fin/atlas/dashboard` response now includes a `predictions` key:

```json
{
  "summary": { ... },
  "riskScore": "HIGH",
  "topAnomalies": [...],
  "baselineHealth": { ... },
  "atlasSignals": [...],
  "predictions": {
    "closeDuration": {
      "expectedCloseDays": "4.2",
      "confidencePercent": 78,
      "historicalAvgDays": "3.8"
    },
    "releaseReadiness": {
      "probability": 0.65,
      "confidencePercent": 72,
      "blockers": ["2 failed task(s)"]
    },
    "reconCompletion": {
      "sessionsRemaining": 2,
      "totalSessions": 5,
      "completedSessions": 3
    },
    "computedAt": "2026-03-07T12:00:00.000Z"
  }
}
```

### 6.6 Design Principles (Phase 2)

1. **Deterministic** — linear averaging and weighted formulas only. No ML models, no LLM.
2. **Explainable** — every prediction includes `factors` showing exactly what drove the result.
3. **Graceful** — returns `null` for any prediction with insufficient data (< 2 historical periods).
4. **MC-4 compliant** — all monetary/numeric outputs as strings in TypeScript responses.
5. **Advisory only** — predictions inform human decision-making, never trigger automated gates.

---

## 7. Phase 3A: Template-based Narratives (Implemented)

### 7.1 Narrative Types

| Type | Purpose | Example Output |
|------|---------|----------------|
| `DASHBOARD_SUMMARY` | One-paragraph period health overview | "ACME March 2026 is in elevated risk status. Atlas detected 3 active anomalies (1 critical, 2 warning). Release readiness is at 65%." |
| `RELEASE_SUMMARY` | Release readiness explanation with blockers | "ACME March 2026 is not yet ready (42% probability). Blockers: 2 failed task(s). 1 critical anomaly must be resolved before the EXCEPTION_SIGNOFF gate can clear." |
| `ANOMALY_EXPLANATION` | Per-anomaly human-readable explanation | "Utilities expense 3.2σ above baseline. The observed value of 45.2K is 3.2 standard deviations from the baseline mean of 28.1K (computed over 11 periods)." |
| `CFO_BRIEF` | Executive digest: 3-5 numbered bullet points | "1. ACME March 2026: Attention needed. 2. Release readiness: 65% — 2 blockers. 3. Expected close: 4.2 days. 4. Key risks: 1 critical anomaly, 2 open reconciliations." |

### 7.2 Architecture

```
Governed Data (GL, Close, Recon, Risk Signals, Anomalies)
        |
    7 parallel queries (data gathering)
        |
    NarrativeInput (structured typed data)
        |
    Pure template functions (no side effects)
        |
    NarrativeOutput[] (text + metadata)
```

Template functions are pure: `(NarrativeInput) => string`. They receive fully
resolved data and produce deterministic text. No DB access, no external calls.
This makes them trivially testable and guarantees reproducibility.

### 7.3 Runtime Service

| Service | File | DI Token |
|---------|------|----------|
| `DefaultNarrativeService` | `atlas-ai/services/narrative.service.ts` | `engine.atlas.narrativeService` |

Methods:
- `generate(ctx, input)` — produces all requested narrative types for a period
- `explainAnomaly(ctx, anomalyId)` — produces a detailed explanation for a single anomaly with baseline context

### 7.4 Template Engine

| File | Purpose |
|------|---------|
| `atlas-ai/services/narrative-templates.ts` | Pure rendering functions |
| `atlas-ai/domain/narrative-types.ts` | Domain types and interfaces |

Template functions:
- `renderDashboardSummary(input)` — health status, anomalies, predictions, recon
- `renderReleaseSummary(input)` — probability, blockers, gates, consistency
- `renderAnomalyExplanation(input)` — z-score evidence, severity, guidance
- `renderCfoBrief(input)` — numbered executive bullets

Per-anomaly guidance is type-specific:

| Anomaly Type | Guidance |
|-------------|----------|
| `AMOUNT_OUTLIER` | "Review the account balance and recent journal entries for unusual postings." |
| `RECON_VARIANCE` | "Investigate the reconciliation discrepancy and ensure bank and GL balances align." |
| `OVERRIDE_SPIKE` | "Elevated waiver/override activity may indicate process gaps. Escalate to Controller for review." |
| *(8 more)* | *(type-specific actionable guidance)* |

### 7.5 API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fin/atlas/narratives` | Generate narratives for entity/period (filterable by `types` param) |
| GET | `/api/fin/atlas/dashboard` | Extended — now includes `narratives` in response payload |

### 7.6 Dashboard Integration

The `/api/fin/atlas/dashboard` response now includes a `narratives` key:

```json
{
  "summary": { ... },
  "riskScore": "HIGH",
  "topAnomalies": [...],
  "predictions": { ... },
  "narratives": {
    "dashboardSummary": "ACME March 2026 is in elevated risk status. Atlas detected 3 active anomalies (1 critical, 2 warning). Release readiness is at 65%. Expected close duration: 4.2 days.",
    "cfoBrief": "1. ACME March 2026: Immediate attention required.\n2. Release readiness: 65% — 2 blocker(s).\n3. Expected close: 4.2 days.\n4. Top concern: Utilities expense 3.2σ above baseline (5100).",
    "generatedAt": "2026-03-07T12:00:00.000Z",
    "provider": "template"
  }
}
```

### 7.7 Design Principles (Phase 3A)

1. **Deterministic** — pure string templates, no LLM, no randomness. Same input always produces same output.
2. **Structured inputs** — templates receive typed `NarrativeInput`, not raw DB rows. Data gathering is separate from rendering.
3. **Actionable** — every anomaly explanation includes type-specific guidance (what to check, who to escalate to).
4. **Layered** — Phase 3B (LLM) will add a `NarrativeProvider` interface with `"template"` and `"llm"` implementations. Template rendering remains the fallback.
5. **Read-only** — narratives never write to governed tables. They consume the same certified data the Control Tower protects.

---

## 8. Phase 3B: Optional LLM Provider (Implemented)

### 8.1 Provider Architecture

```
NarrativeInput (structured data)
        |
  TemplateNarrativeProvider (always runs first)
        |
  template text  ──→  NarrativeOutput { provider: "template" }
        |
        └── (if LLM configured) ──→ LlmNarrativeProvider
                                          |
                                     polish/rephrase
                                          |
                                   NarrativeOutput { provider: "llm",
                                     provenance.templateText = original }
                                          |
                                   (if LLM fails → template fallback)
```

### 8.2 NarrativeProvider Interface

```typescript
interface NarrativeProvider {
  readonly name: "template" | "llm";
  render(type: NarrativeType, input: NarrativeInput): Promise<NarrativeProviderResult>;
  renderAnomaly(input: AnomalyExplanationInput): Promise<NarrativeProviderResult>;
}
```

Two implementations:
- **TemplateNarrativeProvider** — deterministic, always available (default)
- **LlmNarrativeProvider** — wraps template output, sends to LLM for polishing

### 8.3 LLM Constraints

The LLM system prompt enforces strict rules:
1. **Preserve all numbers, codes, percentages, and dates exactly**
2. **Never invent new facts or metrics**
3. **Never change risk classifications, gate statuses, or release assessments**
4. **Never add recommendations beyond what the input states**
5. **Return only polished text, no commentary**

### 8.4 Narrative Provenance

Every `NarrativeOutput` now includes a `provenance` object:

```typescript
interface NarrativeProvenance {
  provider: "template" | "llm";
  deterministic: boolean;              // template=true, llm=false
  completeness: "full" | "partial" | "minimal";
  sourceCounts: {
    anomalies: number;
    closeTasksTotal: number;
    riskSignals: number;
    reconSessions: number;
    predictionsAvailable: number;      // 0-3
  };
  templateText?: string;               // original template output (LLM only)
}
```

Completeness is computed from source data availability:
- `full` — 3+ data sources returned data
- `partial` — 1-2 data sources returned data
- `minimal` — no source data (empty period)

### 8.5 Fallback Behavior

| Scenario | Result |
|----------|--------|
| No LLM configured | Template provider used, `provider: "template"` |
| LLM configured, call succeeds | LLM output used, `provider: "llm"`, `templateText` preserved |
| LLM configured, call times out | Template output returned transparently, `provider: "template"` |
| LLM configured, call errors | Template output returned transparently, `provider: "template"` |
| LLM returns empty response | Template output returned transparently, `provider: "template"` |

### 8.6 DI Wiring

To enable LLM narratives, register a `NarrativeProvider` at token `engine.atlas.narrativeProvider`:

```typescript
container.register("engine.atlas.narrativeProvider", () => {
  return new LlmNarrativeProvider({
    invoke: async (systemPrompt, userMessage) => {
      // Call Claude API, OpenAI, or any LLM
      return await callLlm(systemPrompt, userMessage);
    },
    timeoutMs: 10_000,
  });
}, "singleton");
```

If not registered, `DefaultNarrativeService` uses `TemplateNarrativeProvider` automatically.

### 8.7 Test Coverage

Snapshot tests in `atlas-ai/__tests__/narrative-templates.test.ts`:
- 4 template rendering functions × 2 scenarios each (high-risk + healthy)
- Edge cases: GL imbalance, missing predictions, WARNING severity
- Provenance metadata: full/partial/minimal completeness, LLM provenance with templateText

### 8.8 Runtime Files (Phase 3B)

| File | Purpose |
|------|---------|
| `atlas-ai/services/narrative-provider.ts` | NarrativeProvider interface + Template/LLM implementations |
| `atlas-ai/domain/narrative-types.ts` | Extended with `NarrativeProvenance`, `buildProvenance()`, `buildAnomalyProvenance()` |
| `atlas-ai/__tests__/narrative-templates.test.ts` | 15 snapshot + provenance tests |

### 8.9 Design Principles (Phase 3B)

1. **Template always available** — LLM is optional polish layer, never sole source of truth
2. **LLM never invents** — receives template output as input, can only rephrase/polish
3. **LLM never decides** — cannot change gates, risk levels, or release assessments
4. **Transparent fallback** — LLM failure returns template output with no user-visible degradation
5. **Provenance audit trail** — every output declares its provider and preserves the template source

---

## 9. Phase 4: Recommended Actions (Implemented)

### 9.1 Distinction from Close Recommendation Engine

Atlas recommendations are **intelligence-driven advisory actions** — distinct from the posting-engine's close-recommendation-engine which handles **operational workflow automation**.

| Layer | Close Recommendations (posting-engine) | Atlas Recommendations (Phase 4) |
|-------|-------|------|
| Domain | Operational workflow | Intelligence-driven advisory |
| Examples | "Start ready tasks", "Rerun failed handler" | "Resolve recon variance before certification" |
| Trigger | Graph state, SLA, blockers | Anomalies, predictions, risk score |
| Execution | Can auto-execute safe actions | **Never auto-execute** — advisory only |

### 9.2 Recommendation Types

| Type | Purpose | Priority Range |
|------|---------|---------------|
| `ANOMALY_RESPONSE` | Investigate / resolve / escalate an anomaly | CRITICAL–HIGH |
| `RELEASE_GATE` | Action needed before a gate can clear | CRITICAL–HIGH |
| `RECON_FOLLOWUP` | Reconciliation action needed | HIGH–MEDIUM |
| `CLOSE_DURATION` | Close timeline concern | HIGH–MEDIUM |
| `RISK_MITIGATION` | General risk reduction advice | HIGH–MEDIUM |

### 9.3 Recommendation Shape

```typescript
interface AtlasRecommendation {
  key: string;                        // deterministic dedup key
  type: AtlasRecommendationType;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;                      // human-readable action
  rationale: string;                  // why this was generated
  suggestedOwnerRole: AtlasOwnerRole; // who should act
  linkedEvidence: AtlasLinkedEvidence[];
  estimatedImpact: string | null;     // what happens if unresolved
}
```

### 9.4 Owner Role Assignment

| Anomaly / Condition | Assigned Role |
|---------------------|---------------|
| `OVERRIDE_SPIKE`, `EXCEPTION_PATTERN` | Controller |
| `RECON_VARIANCE` | Reconciliation Analyst |
| `LATE_CLOSE_TASK`, blocked tasks, close duration | Close Manager |
| Low release readiness with blockers | Close Manager |
| All other anomalies | Accountant |
| GL imbalance | Accountant |
| High/critical risk signals | Controller |

### 9.5 Generation Rules

Recommendations are generated deterministically from:
- **Active anomalies**: CRITICAL → CRITICAL priority, WARNING → HIGH priority
- **Gate blockers**: Critical anomalies (blocks EXCEPTION_SIGNOFF), GL imbalance (blocks certification), failed tasks
- **Reconciliation**: Incomplete sessions → MEDIUM/HIGH based on remaining count
- **Close duration**: Expected close > 1 day above historical baseline
- **Risk signals**: Active high/critical signals
- **Release readiness**: Below 50% with blockers

A healthy period with no anomalies, no failed tasks, complete reconciliation, balanced GL, and good readiness produces **zero recommendations**.

### 9.6 Dashboard API Integration

The `/api/fin/atlas/dashboard` response now includes `recommendations`:

```json
{
  "summary": { ... },
  "riskScore": "HIGH",
  "topAnomalies": [...],
  "predictions": { ... },
  "narratives": { ... },
  "recommendations": {
    "items": [
      {
        "key": "anomaly:critical:AMOUNT_OUTLIER:4100",
        "type": "ANOMALY_RESPONSE",
        "priority": "CRITICAL",
        "title": "Resolve Account 4100 balance exceeds 3σ threshold",
        "rationale": "Review account balance and recent journal entries...",
        "suggestedOwnerRole": "ACCOUNTANT",
        "linkedEvidence": [{ "evidenceType": "anomaly", "label": "...", "detail": "z-score: 4.2" }],
        "estimatedImpact": "Blocks EXCEPTION_SIGNOFF gate until resolved or acknowledged."
      }
    ],
    "computedAt": "2026-03-07T12:00:00.000Z"
  }
}
```

### 9.7 UI: Atlas Insights Panel

**Component**: `AtlasInsightsPanel.tsx` — embedded in `ReleaseDetail`

Sections:
1. **Header** — "Atlas Insights" with risk badge + provenance indicator (deterministic/llm-polished, completeness)
2. **Dashboard Summary** — one-paragraph narrative from Phase 3A
3. **KPI Strip** — 4 cells: Active Anomalies, Release Readiness %, Expected Close Days, Risk Signals
4. **Recommended Actions** — expandable list sorted by priority, each showing:
   - Priority badge + type label + suggested owner role
   - Expandable rationale, estimated impact, linked evidence badges
5. **CFO Brief** — expandable numbered executive bullets

Supports `compact` mode (3 recommendations, no CFO brief) for embedding in dashboards.

**Data Hook**: `useAtlasDashboard({ entityCode, fiscalYear, periodNumber })` — fetches from `/api/fin/atlas/dashboard`.

### 9.8 Runtime Service

| Service | File | DI Token |
|---------|------|----------|
| `DefaultRecommendationService` | `atlas-ai/services/recommendation.service.ts` | `engine.atlas.recommendationService` |

The `generateRecommendations()` function is also exported as a pure function for inline use (dashboard API uses it directly with already-fetched data).

### 9.9 Test Coverage

Tests in `atlas-ai/__tests__/recommendations.test.ts` (15 tests):
- High-risk input generates all recommendation types
- Correct priority assignment and sorting
- Owner role assignment per anomaly type
- Gate blockers (GL imbalance, critical anomalies, failed tasks)
- Recon followup and close duration recommendations
- Healthy input produces zero recommendations
- All recommendations have required fields
- Unique keys for deduplication

### 9.10 Recommendation Provenance

Similar to narrative provenance, every recommendation result includes provenance metadata:

```typescript
interface RecommendationProvenance {
  generator: "atlas.recommendation.deterministic";
  generatorVersion: string;      // semver, e.g. "1.0.0" — bump on rule changes
  deterministic: true;
  evidenceCount: number;         // total linked evidence items across all recs
  evidenceKeys: string[];        // flat, deduplicated, sorted evidence identifiers
  recommendationHash: string;    // djb2 fingerprint for stability/drift detection
  generatedAt: string;           // ISO-8601 timestamp
}
```

- **`generator`** — fixed identifier for the deterministic rule engine
- **`generatorVersion`** — semver for the rule engine (e.g. `"1.0.0"`); bump when rules change behavior; helps debugging recommendation differences across deployments
- **`deterministic: true`** — always true; recommendations are rule-based, never ML-generated
- **`evidenceCount`** — sum of `linkedEvidence.length` across all recommendations; enables UI to show "12 evidence items" at a glance
- **`evidenceKeys`** — flat list of `TYPE:REF` identifiers (e.g. `["ANOMALY:anomaly:critical:AMOUNT_OUTLIER:4100", "GL_CONSISTENCY:gate:gl_consistency"]`); enables deeper UI drilldown and explainability
- **`recommendationHash`** — djb2 fingerprint computed from `type+key+entity+period`; enables deduplication across runs, comparison between periods, and rule engine drift detection
- **`generatedAt`** — ISO timestamp for cache invalidation and audit trails

Provenance is returned by `buildRecommendationProvenance(recs, context?)` (pure function) and included in:
- `RecommendationComputeResult.provenance` (runtime service)
- Dashboard API response `recommendations.provenance`
- Atlas Insights Panel header ("deterministic · N evidence items · engine v1.0.0")

### 9.11 Design Principles (Phase 4)

1. **Advisory only** — recommendations never auto-trigger workflow state changes
2. **Deterministic** — same input → same recommendations, no randomness
3. **Evidence-backed** — every recommendation links to source anomalies, signals, or predictions
4. **Prioritized** — CRITICAL > HIGH > MEDIUM > LOW, sorted for operator attention
5. **Non-persisted** — computed on-demand, ephemeral, no new database tables
6. **Complementary** — Atlas recommendations sit alongside (not replace) the close-recommendation-engine
7. **Provenance-tracked** — every result carries provenance metadata for auditability

---

## 10. Phase 5: Financial Insight Graph (Implemented)

### 10.1 Overview

Phase 5 transforms Atlas from **rule intelligence** into **relationship intelligence** by materializing implicit relationships across the finance domain into a traversable heterogeneous graph. The graph is computed on-demand with no new database tables — it queries existing `fin.*` tables and assembles nodes and edges.

### 10.2 Architecture Decision: Computed View, Not Persisted

The insight graph follows Atlas's established ephemeral-compute pattern (same as narratives and recommendations):

| Approach | Decision | Rationale |
|----------|----------|-----------|
| New DB tables | Rejected | Relationships already exist implicitly in `fin.*` schema |
| Materialized view | Rejected | Graph changes frequently; stale data risk |
| On-demand computation | **Accepted** | Consistent with Atlas ephemeral pattern; always fresh |
| Heterogeneous graph | **Accepted** | 8 node types require discriminated unions, not homogeneous DAG |

### 10.3 Node Types (8)

| Type | Source Table | Key Identifier | Key Properties |
|------|-------------|----------------|----------------|
| `PERIOD` | `fin.fiscal_period` | entity+fy+pn | status, periodLabel |
| `CLOSE_RUN` | `fin.close_run` | UUID | runNumber, elapsedDays |
| `RELEASE` | `fin.pack_release` | release_code | releaseType, isCleanClose, overrideCount |
| `ANOMALY` | `fin.atlas_anomaly` | UUID | anomalyType, severity, accountCode, zScore |
| `RISK_SIGNAL` | `fin.close_risk_signal` | UUID | ruleCode, severity, signalState, firedAt |
| `TASK` | `fin.period_close_checklist` | task_code | requiredBefore, assignedTo |
| `ACCOUNT` | `fin.chart_of_accounts` | account_code | accountType, anomalyCount (only accounts with anomalies) |
| `RECONCILIATION` | `fin.reconciliation_session` | UUID | statementNumber, totalLines, matchedLines, discrepancy |

### 10.4 Edge Types (7)

| Edge Type | Source → Target | Meaning | Example |
|-----------|-----------------|---------|---------|
| `BLOCKED_BY` | task→task, release→anomaly | Blocking relationship | Release blocked by critical anomaly |
| `TRIGGERED_BY` | risk_signal→anomaly | Signal caused by anomaly | Atlas anomaly rule fired |
| `AFFECTS` | anomaly→account, anomaly→period | Impact relationship | AMOUNT_OUTLIER affects account 4100 |
| `DERIVED_FROM` | release→close_run, close_run→period | Provenance chain | Release derived from close run #1 |
| `RECONCILES` | reconciliation→account | Bank reconciliation | Recon session reconciles account 1020 |
| `ESCALATED_TO` | anomaly→risk_signal | Escalation link | Anomaly escalated to risk signal |
| `DEPENDS_ON` | task→task | Close dependency | Post-close review depends on GL reconciliation |

### 10.5 Graph Statistics & Hotspots

Every graph result includes computed statistics:
- **nodesByType** — count per node type
- **hotspots** — top 5 most-connected nodes (by total inbound+outbound edges)

Hotspots answer: "Which entities are at the center of the most relationships?" — key for identifying systemic issues.

### 10.6 Causal Queries Enabled

The graph structure enables answering:
1. **Why did this close delay?** — Follow BLOCKED_BY edges from release/tasks to find root cause chain
2. **Which accounts generate most anomalies?** — Find ACCOUNT nodes with highest anomalyCount / most AFFECTS inbound edges
3. **Which anomalies escalated to risk signals?** — Follow ESCALATED_TO edges from anomaly nodes
4. **What's the dependency chain for a blocked task?** — Traverse DEPENDS_ON + BLOCKED_BY edges
5. **Is this release blocked?** — Check BLOCKED_BY edges from release nodes to critical anomalies

### 10.7 Data Gathering Pattern

Same `Promise.all()` parallel query pattern as narrative and recommendation services:
- 10 parallel queries gather period, close runs, releases, anomalies, risk signals, tasks, reconciliations, task dependencies, anomaly-account links, and anomaly-signal links
- All data assembled into typed rows, then materialized into nodes and edges
- Deduplication via `Set<string>` for both node IDs and edge IDs

### 10.8 API Endpoint

```
GET /api/fin/atlas/insight-graph?entityCode=ACME&fiscalYear=2026&periodNumber=3&nodeLimit=50
```

Response shape:
```typescript
{
  nodes: InsightGraphNode[],
  edges: InsightGraphEdge[],
  stats: InsightGraphStats,
  provenance: InsightGraphProvenance
}
```

### 10.9 Provenance

```typescript
interface InsightGraphProvenance {
  generator: "atlas.insight-graph.deterministic";
  generatorVersion: string;   // INSIGHT_GRAPH_VERSION constant
  deterministic: true;
  graphHash: string;           // djb2 fingerprint of node IDs + context
  generatedAt: string;
}
```

### 10.10 Precedent: Period Close Orchestration Graph

The insight graph follows the pattern established by the period-close-graph-service:
- **Adjacency-based** — nodes reference neighbors, not separate edge tables at runtime
- **Computed stats** — hotspots mirror the close graph's "downstream impact" concept
- **Deterministic** — same data produces same graph
- **Provenance-tracked** — version, hash, timestamp

Key difference: the close orchestration graph is a **homogeneous DAG** (task nodes only), while the insight graph is a **heterogeneous graph** (8 node types, 7 edge types) requiring discriminated unions.

### 10.11 Design Principles (Phase 5)

1. **No new tables** — computed from existing `fin.*` schema
2. **Heterogeneous** — 8 node types with discriminated unions, not a single node shape
3. **Causal edges** — edges answer "why" questions, not just "what" relationships
4. **Hotspot detection** — identifies most-connected nodes for systemic analysis
5. **Scoped** — materialized per entity+period (nodeLimit for scale control)
6. **Deterministic** — same data → same graph, with provenance hash for drift detection
7. **Consistent** — follows Atlas ephemeral-compute, parallel-query, provenance patterns

---

## 11. Phase 6: Adaptive Learning (Implemented)

### 11.1 Overview

Adaptive Learning is a strictly bounded tuning layer that improves Atlas's
detection accuracy over time through user feedback, without violating any
governance constraints. Key boundaries:

- **No auto state changes** — calibrations are SUGGESTED, never auto-applied
- **No bypass of gates** — feedback tunes sensitivity, not close decisions
- **No mutation of finance truth** — only detection thresholds are adjusted
- **Append-only feedback** — immutable for audit, like `close_action_log`
- **Enum-based reason codes** — follows `close_override.reason_code` pattern

### 11.2 Architecture Decision

**Feedback-driven calibration loop:**
```
User reviews anomaly/recommendation
  → Submits feedback (verdict + structured reason code)
    → System computes false positive rates per anomaly type
      → Generates calibration suggestions (pure function)
        → Human approves/rejects suggestion
          → Approved calibration used by anomaly detector
```

This mirrors the `close_override` governance pattern: system suggests,
human decides, decision is audited.

### 11.3 Feedback Model

#### Feedback Targets
- **ANOMALY** — feedback on detected anomalies (z-score outliers, recon variances)
- **RECOMMENDATION** — feedback on suggested actions (Phase 4 recommendations)

#### Verdicts
| Verdict | Target | Meaning |
|---------|--------|---------|
| `CONFIRMED` | ANOMALY | User confirms this is a real issue |
| `FALSE_POSITIVE` | ANOMALY | User marks as false positive |
| `ACCEPTED` | RECOMMENDATION | User accepts the recommendation |
| `DISMISSED` | RECOMMENDATION | User dismisses the recommendation |
| `DEFERRED` | Both | User defers action to a later time |

#### Reason Codes (Enum Taxonomy)
| Code | Description |
|------|-------------|
| `SEASONAL_PATTERN` | Normal seasonal variation |
| `ONE_TIME_EVENT` | Non-recurring, expected |
| `KNOWN_ADJUSTMENT` | Pre-approved adjustment |
| `DATA_QUALITY` | Source data issue, not real anomaly |
| `THRESHOLD_TOO_SENSITIVE` | Z-score threshold too low |
| `THRESHOLD_TOO_LOOSE` | Threshold too high, missed real issue |
| `NOT_ACTIONABLE` | Recommendation cannot be acted upon |
| `ALREADY_ADDRESSED` | Issue was already resolved |
| `INCORRECT_OWNER` | Wrong owner role suggested |
| `IMMATERIAL` | Below materiality threshold |
| `OTHER` | Free-text in `reason_detail` |

### 11.4 Threshold Calibration

#### Calibration Algorithm (Pure Function)

The `generateCalibrationSuggestions()` function operates on false positive
rate data and produces advisory threshold adjustments:

1. **Loosen** (FP rate >= 30%): Raise z-score threshold by up to 0.5σ
   - Adjustment = min(0.5, (fpRate - 0.2) × 1.5)
   - Reduces noise from false positives
2. **Tighten** (Confirmed rate >= 90%, 10+ samples): Lower z-score threshold by up to 0.3σ
   - Adjustment = min(0.3, (confirmedRate - 0.85) × 1.0)
   - Catches more real anomalies
3. **Guard rails**: Warning >= 1.5σ, Critical >= 2.0σ (never below)
4. **Minimum samples**: 5 before any suggestion

#### Calibration Governance
| Status | Meaning |
|--------|---------|
| `SUGGESTED` | Computed from feedback, awaiting human approval |
| `APPROVED` | Human-approved, active in anomaly detection |
| `REJECTED` | Human-rejected with documented reason |
| `SUPERSEDED` | Replaced by newer calibration |

#### Confidence Scoring
Confidence = min(95, 50 + min(sampleSize, 30) × 1.5)
- 5 samples → 57% confidence
- 15 samples → 72% confidence
- 30+ samples → 95% confidence

### 11.5 Effectiveness Metrics

The effectiveness computation provides two-axis analysis:

1. **Anomaly Effectiveness**: Confirmed rate, false positive rate, breakdown by anomaly type
2. **Recommendation Effectiveness**: Acceptance rate, dismissal rate, breakdown by recommendation type

These metrics are computed on-demand (ephemeral, not persisted) — same
pattern as narratives, recommendations, and insight graphs.

### 11.6 Evidence Snapshot

Each feedback record captures an immutable `evidence_snapshot` (JSONB) at
submission time, preserving the context that was visible to the user when
they made their judgment. This prevents retroactive context loss.

### 11.7 Database Schema

Two new tables, one convenience view:

- `fin.atlas_feedback` — Append-only feedback log with FK to `fin.fiscal_period`
- `fin.atlas_threshold_calibration` — Per-entity/account threshold overrides
  with approval governance
- `fin.vw_atlas_false_positive_rates` — Aggregated FP rates per anomaly type/account

### 11.8 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/fin/atlas/feedback` | Submit feedback on anomaly or recommendation |
| GET | `/api/fin/atlas/feedback?entityCode=ACME` | Compute effectiveness + calibration suggestions |
| PATCH | `/api/fin/atlas/feedback/calibrations` | Approve or reject a suggested calibration |

### 11.9 Existing Pattern Precedents

| Atlas Feature | Existing Precedent | Shared Pattern |
|---|---|---|
| Feedback verdicts | `close_action_log.was_effective` | Boolean outcome tracking |
| Reason codes (enum) | `close_override.reason_code` | Structured taxonomy, not free-text |
| Approval governance | `close_override` approve/reject | Human-in-the-loop gating |
| Evidence snapshot | `close_override.evidence` (JSONB) | Immutable context capture |
| Status state machine | `CalibrationStatus` | SUGGESTED → APPROVED/REJECTED |
| Append-only log | `audit_event` | Immutable for audit |

### 11.10 Design Principles

1. **Advisory only** — Suggestions inform, never auto-apply
2. **Human-in-the-loop** — Every threshold change requires explicit approval
3. **Transparent rationale** — Every suggestion includes sample sizes and reasoning
4. **Bounded adjustment** — Guard rails prevent overly aggressive tuning
5. **Audit-complete** — Full feedback trail from submission through outcome verification

---

## 12. Atlas Intelligence Console (Implemented)

### 12.1 Overview

The Atlas Intelligence Console is the unified workspace that surfaces
all Atlas capabilities as a coherent product. It follows the same
tab-based layout pattern as the Release Control Tower.

**Route**: `/app/atlas-console`

### 12.2 Console Tabs

| Tab | Component | Data Source |
|-----|-----------|-------------|
| **Overview** | `AtlasInsightsPanel` | `useAtlasDashboard` |
| **Anomalies** | `AnomalyExplorer` | `/api/fin/atlas/anomalies` |
| **Predictions** | `PredictionsPanel` | Dashboard predictions |
| **Narratives** | `NarrativesPanel` | Dashboard narratives |
| **Insight Graph** | `InsightGraphExplorer` | `useInsightGraph` |
| **Feedback & Calibration** | `FeedbackCalibrationPanel` | `useAtlasFeedback` |

### 12.3 Entity / Period Context

All tabs share a context selector (entity code, fiscal year, period number)
at the console header level. Changing the context refreshes all active tabs.

### 12.4 Tab Capabilities

**Overview** — Existing `AtlasInsightsPanel` in full mode:
dashboard summary narrative, KPI strip, recommended actions, CFO brief.

**Anomalies** — Full anomaly list with filtering (severity, status),
summary counts, expandable detail rows, and on-demand detection trigger.

**Predictions** — Three prediction cards: close duration (days + confidence),
release readiness (probability + blockers), reconciliation completion
(progress bar + remaining).

**Narratives** — Dashboard summary, CFO brief, and narrative provenance
metadata (provider, mode, completeness, source data counts).

**Insight Graph** — Node distribution by type (filterable), three views
(nodes, edges, hotspots), node detail expansion, edge connectivity,
and graph provenance (hash, version, generation timestamp).

**Feedback & Calibration** — Detection effectiveness KPIs (confirmed rate,
false positive rate, acceptance rate), per-type breakdowns, calibration
suggestions with rationale, approval queue with approve/reject workflow,
active calibrations list.

### 12.5 Architecture Decision

The console follows the `release-control-tower` page pattern:
- Tab-based `useState` navigation (not router-based)
- Shared context at page level, passed to tab components
- Each tab component is self-contained with its own data hooks
- Tab components placed in `components/finance/atlas/` directory

This keeps the console as a single page load with tab switching
being instant (no route transitions), while each tab manages
its own loading state independently.

### 12.6 Composite Risk Score

The Overview tab displays a **numeric Atlas Risk Score (0–100)** with
a weighted driver breakdown. This replaces the simple categorical
`riskScore` for executive visibility.

**Weighting:**
| Driver | Points per Item | Max |
|--------|----------------|-----|
| Critical anomalies | 15 | 45 |
| Warning anomalies | 5 | 20 |
| High/critical risk signals | 8 | 24 |
| Other risk signals | 3 | 12 |
| Outstanding reconciliations | 5 | 15 |
| Failed close tasks | 8 | 16 |
| Blocked close tasks | 4 | 12 |
| GL imbalance | 20 (binary) | 20 |

**Score levels:** 70+ = HIGH, 40–69 = MEDIUM, 1–39 = LOW, 0 = NONE

The score is computed from data already gathered by the dashboard API
(anomaly counts, risk signal counts, close progress, recon status,
GL consistency) — no additional queries required.

### 12.7 Force-Directed Graph Visualization

The Insight Graph tab includes a Canvas-based **force-directed graph view**
as the default view mode. Zero external dependencies — uses
`requestAnimationFrame` with a simple force simulation:

- **Repulsion**: Charge force between all node pairs
- **Attraction**: Spring force along edges (ideal distance: 80px)
- **Center gravity**: Gentle pull toward canvas center
- **200 iterations**: Simulation converges then freezes for performance
- **Node sizing**: Proportional to edge count (6–18px radius)
- **Node coloring**: By type (8 distinct colors matching the type palette)
- **Edge arrows**: Directed edges with arrowheads
- **Hover tooltip**: Node label, type, and connection count
- **Color legend**: All 8 node types displayed below the canvas

This visualization is powerful for demos — it visually shows release →
close run → anomaly → account → risk signal relationship chains.

---

## 13. Global Close Monitor — Phase 7: Cross-Entity Intelligence (Implemented)

### 13.1 Overview

Multi-entity close intelligence workspace. Provides a consolidated, read-only advisory
view of close progress across a parent entity and all its subsidiaries within a fiscal period.

**Design Rule**: Group intelligence is advisory. Local Control Towers remain authoritative —
no mutations, no bypass of entity-level gates.

### 13.2 Entity Hierarchy Resolution

Uses a recursive CTE on `fin.legal_entity` (`parent_entity_id` self-referencing FK) to resolve
the full entity tree from a given parent. Returns each entity with depth, consolidation method,
ownership percentage, entity type, country code, and functional currency.

### 13.3 Data Gathering (19 Parallel Queries)

All data for the period is gathered in a single `Promise.all()` pass:

| # | Source Table | Data | Phase |
|---|-------------|------|-------|
| 1 | `fin.close_run` | Close status, run number, elapsed days | 1 |
| 2 | `fin.fiscal_period` | Period status per entity | 1 |
| 3 | `fin.atlas_anomaly` | Anomaly counts (active, critical, warning) | 1 |
| 4 | `fin.close_risk_signal` | Risk signal counts (active, high/critical) | 1 |
| 5 | `fin.pack_release` | Release status, clean close, overrides | 1 |
| 6 | `fin.close_readiness_snapshot` | Readiness score, completion %, SLA status | 1 |
| 7 | `fin.close_exception` | Exception counts (open, critical, gate blockers) | 1 |
| 8 | `fin.close_calendar` | SLA targets (soft/hard close dates) | 1 |
| 9 | `fin.intercompany_transaction` | IC settlement progress (counts) | 1 |
| 10 | `fin.reconciliation_session` | Reconciliation completion | 1 |
| 11 | `fin.period_close_checklist` | Task progress (completed, failed, blocked) | 1 |
| 12 | `fin.atlas_anomaly` + `fin.chart_of_accounts` | Anomaly detail for cross-entity pattern analysis | 2 |
| 13 | `fin.intercompany_transaction` | IC detail (amounts, dates, status) for aging/exposure | 2 |
| 14 | `fin.pack_release` | Override counts per entity | 2 |
| 15 | `fin.close_calendar` | Calendar detail (start dates, target working days) | 2 |
| 16 | `fin.close_run` + `fin.close_calendar` | Historical close run outcomes (last 12 completed periods) for statistical forecasting | 3 |
| 17 | `fin.vw_sla_breach_forecast` | SLA breach probability, buffer hours, slippage count, confidence | 3 |
| 18 | `fin.close_orchestration_snapshot` | Latest prediction, confidence, critical path minutes | 3 |
| 19 | `fin.atlas_anomaly` | Cross-period anomaly history (aggregated counts per entity/period/type) | 4 |

### 13.4 Per-Entity Composite Risk Score

Reuses the same weighted algorithm as the single-entity Atlas dashboard, with an additional
driver for gate blockers (12 pts each, max 24). Score 0–100, levels: NONE/LOW/MEDIUM/HIGH.

### 13.5 Consolidated Group Metrics

- **Group Risk Score**: Average of all entity risk scores (capped at 100)
- **Status Distribution**: Count of entities per close status
- **Delayed Close Ranking**: Top 5 entities sorted by elapsed days (descending)
- **Critical Path Entity**: Highest risk score among non-closed entities with top 3 drivers
- **Aggregate Totals**: Total anomalies, critical anomalies, open exceptions, gate blockers

### 13.6 IC Settlement Progress

Intercompany transaction settlement status grouped by source/destination entity pair.
Shows total transactions, settled count, and pending count per pair.

### 13.7 Console Architecture

Tab-based workspace (same pattern as Atlas Intelligence Console):

| Tab | Content | Phase |
|-----|---------|-------|
| Overview | Group risk score hero card, KPI row, status distribution bar, delayed ranking, critical path | 1 |
| Entity Grid | Sortable grid with per-entity risk, status, anomalies, tasks, reconciliation, elapsed days. Expandable rows showing risk drivers, exceptions, release, SLA targets | 1 |
| Anomaly Patterns | Cross-entity repeated anomaly types, hotspot accounts, severity distribution, override concentration | 2 |
| IC Intelligence | Aging buckets (0–3d, 4–7d, 8–14d, 15–30d, 30d+), net exposure per entity pair, exception markers, settlement by pair | 2 |
| Narratives | Group dashboard summary, CFO brief, delay explanation, entity close projections with SLA breach indicators | 2 |
| Forecast | Group predicted completion with confidence, per-entity forecast table (historical avg + pace blended), breach risk distribution, readiness trajectory, confidence intervals | 3 |
| Longitudinal | Entity behavior profiles (avg/median close days, SLA breach rate, trend), persistent anomaly patterns, entity trends (close speed + anomaly), delay explanations | 4 |

### 13.8 Phase 2: Cross-Entity Dependency Intelligence (Implemented)

#### 13.8.1 Cross-Entity Anomaly Aggregation

Computes from individual anomaly records across all entities:
- **Repeated Patterns**: Anomaly types appearing in 2+ entities (systemic risk indicator)
- **Hotspot Accounts**: Accounts with anomalies in 2+ entities (shared risk concentration)
- **Severity Distribution**: CRITICAL/WARNING/INFO breakdown across group
- **Override Concentration**: Per-entity override counts with concentration risk level (HIGH/MEDIUM/LOW/NONE)

#### 13.8.2 IC Settlement Intelligence

Upgrades the Phase 1 settlement table with:
- **Aging Buckets**: 5 buckets (0–3d, 4–7d, 8–14d, 15–30d, 30d+) with transaction counts and amounts
- **Net Exposure**: Per entity pair, unsettled amount and currency
- **Exception Markers**: Pairs with 3+ pending transactions or >100K net exposure
- **Settlement Summary**: Total/settled/pending amounts, netted count

#### 13.8.3 Enhanced Critical Path Engine

Computes projected completion for each open entity:
- **Projected Remaining Days**: Based on task completion rate + penalty for blockers/failures/gate blockers
- **Projected Group Completion**: Max of all entity projections
- **Slowest Entity**: Entity with longest projected total duration
- **Blocking Chain**: Entities with active gate blockers, critical anomalies, or failed tasks
- **SLA Breach Detection**: Cross-references projected completion against `hard_close_target`
- **Delay Explanation**: Human-readable explanation of why group close is delayed

#### 13.8.4 Group Narrative

Pure template functions (same pattern as `narrative-templates.ts`):
- **Group Dashboard Summary**: One-paragraph group health overview with status distribution, anomaly counts, cross-entity patterns, projected completion, IC settlement status
- **Group CFO Brief**: Numbered bullet points — status, close progress, critical path, key risks, systemic patterns, IC settlement
- **Delay Explanation**: Identifies slowest entity, blocker count, SLA breach projections

No new database tables — all computation is ephemeral over existing data.

### 13.9 Phase 3: Global Close Forecasting (Implemented)

Historical-data-driven group-level forecasting using existing `close_run`, `close_calendar`,
`vw_sla_breach_forecast`, and `close_orchestration_snapshot` data.

#### 13.9.1 Per-Entity Statistical Forecast

For each open entity, `computeGroupForecast()` computes:
- **Historical Average**: Mean close duration from up to 12 prior completed periods
- **Historical Variance**: Standard deviation, P75, P95 from historical distribution
- **Current Pace Estimate**: Elapsed days / completion rate (extrapolation)
- **Blended Prediction**: 60% historical average + 40% current pace + risk penalties
  - Failed task penalty: 1.5d per failed task
  - Blocked task penalty: 1.0d per blocked task
  - Gate blocker penalty: 2.0d per gate blocker
- **Confidence Score**: Based on sample size (historical periods) and coefficient of variation
- **Trend Detection**: Compares recent half vs older half of historical durations (improving/stable/worsening)

#### 13.9.2 SLA Breach Probability

Leverages the existing `fin.vw_sla_breach_forecast` view which computes breach probability (0–100) from:
- Prediction buffer hours (time between predicted_ready_at and hard_close_target)
- Prediction confidence (low/medium/high penalty)
- Blocked and failed task counts
- Slippage trend (count of consecutive prediction slippages)

#### 13.9.3 Group Forecast Aggregation

- **Group Predicted Completion**: Driven by slowest entity projection
- **Group Confidence**: Average of per-entity confidence scores
- **Breach Risk Distribution**: Entities grouped by breach probability (critical ≥70%, high 50–70%, medium 30–50%, low <30%)
- **Trajectory Summary**: Count of entities improving, stable, or worsening

No new database tables — reads from existing predictive intelligence views.

### 13.10 Phase 4: Longitudinal Intelligence (Implemented)

Cross-period analysis using historical anomaly data and close run outcomes.
Transforms Atlas from current-state intelligence to **longitudinal intelligence**.

#### 13.10.1 Entity Behavior Profiles

Computed from `fin.close_run` + `fin.close_calendar` across all completed periods:
- **Average Close Days**: Mean close-to-completion duration
- **Median Close Days**: P50 duration (less sensitive to outliers)
- **SLA Breach Rate**: Percentage of periods where hard close target was missed
- **Trend Direction**: Compares recent half vs older half of close durations

#### 13.10.2 Persistent Anomaly Patterns

Queries `fin.atlas_anomaly` across all historical periods (excluding current):
- **Multi-Period Patterns**: Anomaly types appearing across 2+ distinct periods
- **Entity Spread**: Number of entities affected by each pattern
- **Total Occurrences**: Aggregate count across all periods and entities
- Filtered and sorted by persistence (period count) then occurrence count

#### 13.10.3 Entity Trends

Combined analysis of close speed trend and anomaly trend per entity:
- **Close Speed Trend**: From entity behavior profile (improving/stable/worsening)
- **Anomaly Trend**: Compares recent vs older period anomaly counts
- **Overall Direction**: Composite assessment (improving / stable / needs_attention)
  - `needs_attention` if either close speed or anomaly trend is worsening

#### 13.10.4 Delay Explanations

Template-based reasoning for entities with SLA breach rate ≥30% or worsening trend:
- Identifies contributing factors: breach rate, worsening duration trend, recurring anomaly patterns, increasing anomaly counts
- Generates deterministic explanations (same data → same text)
- No LLM dependency — pure template rendering from computed data

No new database tables — all computation is ephemeral over existing data.

### 13.11 Platform Hardening (Implemented)

#### Response Caching
Process-level in-memory cache with TTL (same pattern as `resolveTenantUuid` cache):

| Endpoint | TTL | Cache Key |
|----------|-----|-----------|
| Global Close Monitor | 30s | `atlas:gcm:{tenant}:{parent}:{fy}:{pn}` |
| Atlas Dashboard | 60s | `atlas:dash:{tenant}:{entity}:{fy}:{pn}` |

Cache headers: `X-Atlas-Cache: HIT/MISS`, `Cache-Control: private, max-age=N`.
Automatic stale entry eviction every 60 seconds via `setInterval().unref()`.

#### Performance Profiling
Global Close Monitor response includes `_profiling` object:
```json
{
  "hierarchyMs": 12,
  "queriesMs": 187,
  "computeMs": 8,
  "totalMs": 207,
  "queryCount": 19,
  "entityCount": 5
}
```
Dashboard route includes `_profiling.totalMs`.

#### Graph Visualization Enhancement
`InsightGraphVisualizer` upgraded with:
- **Zoom/pan**: Mouse wheel zoom toward cursor + drag-to-pan
- **Node interaction**: Click to select with connected edge highlighting, drag to reposition
- **Edge labels**: Edge type shown on highlighted (selected) edges
- **Dark mode**: Detects `dark` class on `<html>` via MutationObserver
- **Label pills**: Background rectangles behind node labels for readability
- **Selection panel**: Detailed side panel showing selected node + connected edges
- **Grid background**: Subtle grid lines that scale with zoom
- **Zoom indicator**: Bottom-right percentage when zoomed

### 13.12 Phase 5 (Planned)
- Consolidated recommendation bundle
- Cross-entity task dependency graph (parent consolidation blocked by subsidiary IC elimination)

---

## 14. Future Phases

### Phase 8: Advanced Cross-Entity Intelligence
- Cross-entity pattern learning from insight graph data
- Model-based confidence scoring for predictions
- Recommendation hash drift detection across periods

---

## 15. File Index

### SQL Migrations
- `framework/adapters/db/src/sql/07_finance/166_atlas_ai.sql` — Model registry, prediction, action, drift
- `framework/adapters/db/src/sql/07_finance/210_atlas_anomaly.sql` — Anomaly baseline + anomaly tables
- `framework/adapters/db/src/sql/07_finance/211_atlas_anomaly_rule_type.sql` — Risk rule type extension
- `framework/adapters/db/src/sql/07_finance/212_atlas_adaptive_learning.sql` — Feedback + calibration tables (Phase 6)
- `framework/adapters/db/src/sql/10_seed_standard/311_seed_atlas_anomaly_rules.sql` — 8 atlas risk rules

### Runtime Engine
- `framework/runtime/src/services/business/engines/atlas-ai/domain/types.ts` — ML model types
- `framework/runtime/src/services/business/engines/atlas-ai/domain/anomaly-types.ts` — Anomaly domain types
- `framework/runtime/src/services/business/engines/atlas-ai/persistence/anomaly-repo.ts` — Repo interfaces
- `framework/runtime/src/services/business/engines/atlas-ai/services/action-service.ts` — L3 action governance
- `framework/runtime/src/services/business/engines/atlas-ai/services/baseline-compute.service.ts` — Baseline computation
- `framework/runtime/src/services/business/engines/atlas-ai/services/anomaly-detector.service.ts` — Anomaly detection
- `framework/runtime/src/services/business/engines/atlas-ai/services/prediction.service.ts` — Predictive analytics (Phase 2)
- `framework/runtime/src/services/business/engines/atlas-ai/domain/prediction-types.ts` — Prediction domain types
- `framework/runtime/src/services/business/engines/atlas-ai/domain/narrative-types.ts` — Narrative domain types (Phase 3A)
- `framework/runtime/src/services/business/engines/atlas-ai/services/narrative-templates.ts` — Pure template functions (Phase 3A)
- `framework/runtime/src/services/business/engines/atlas-ai/services/narrative.service.ts` — Narrative generation service (Phase 3A)
- `framework/runtime/src/services/business/engines/atlas-ai/services/narrative-provider.ts` — NarrativeProvider interface + implementations (Phase 3B)
- `framework/runtime/src/services/business/engines/atlas-ai/__tests__/narrative-templates.test.ts` — Snapshot tests (Phase 3B)
- `framework/runtime/src/services/business/engines/atlas-ai/domain/recommendation-types.ts` — Recommendation domain types (Phase 4)
- `framework/runtime/src/services/business/engines/atlas-ai/services/recommendation.service.ts` — Recommendation generator (Phase 4)
- `framework/runtime/src/services/business/engines/atlas-ai/__tests__/recommendations.test.ts` — Recommendation tests (Phase 4)
- `framework/runtime/src/services/business/engines/atlas-ai/domain/insight-graph-types.ts` — Insight graph domain types (Phase 5)
- `framework/runtime/src/services/business/engines/atlas-ai/services/insight-graph.service.ts` — Insight graph service (Phase 5)
- `framework/runtime/src/services/business/engines/atlas-ai/__tests__/insight-graph.test.ts` — Insight graph tests (Phase 5)
- `framework/runtime/src/services/business/engines/atlas-ai/domain/feedback-types.ts` — Feedback domain types (Phase 6)
- `framework/runtime/src/services/business/engines/atlas-ai/services/feedback.service.ts` — Feedback + calibration service (Phase 6)
- `framework/runtime/src/services/business/engines/atlas-ai/__tests__/feedback.test.ts` — Feedback tests (Phase 6)
- `framework/runtime/src/services/business/engines/atlas-ai/index.ts` — Module registration

### UI Components (Phase 4 + 5 + 6 + Console)
- `products/neon/apps/web/components/finance/AtlasInsightsPanel.tsx` — Atlas Insights panel (embedded + console overview)
- `products/neon/apps/web/components/finance/atlas/AnomalyExplorer.tsx` — Anomaly list with filters (Console)
- `products/neon/apps/web/components/finance/atlas/PredictionsPanel.tsx` — Prediction cards (Console)
- `products/neon/apps/web/components/finance/atlas/NarrativesPanel.tsx` — Narratives + provenance (Console)
- `products/neon/apps/web/components/finance/atlas/InsightGraphExplorer.tsx` — Graph explorer (Console)
- `products/neon/apps/web/components/finance/atlas/InsightGraphVisualizer.tsx` — Force-directed graph visualization (Console)
- `products/neon/apps/web/components/finance/atlas/FeedbackCalibrationPanel.tsx` — Feedback + calibration admin (Console)
- `products/neon/apps/web/lib/finance/use-atlas-dashboard.ts` — Dashboard data-fetching hook
- `products/neon/apps/web/lib/finance/use-insight-graph.ts` — Insight graph data-fetching hook (Phase 5)
- `products/neon/apps/web/lib/finance/use-atlas-feedback.ts` — Feedback + calibration hook (Phase 6)
- `products/neon/apps/web/lib/finance/use-global-close-monitor.ts` — Global close monitor hook (Phase 7)

### Global Close Monitor Components (Phase 7)
- `products/neon/apps/web/components/finance/atlas/EntityReadinessGrid.tsx` — Sortable entity readiness grid (Phase 1)
- `products/neon/apps/web/components/finance/atlas/ConsolidatedRiskPanel.tsx` — Group risk + status distribution (Phase 1)
- `products/neon/apps/web/components/finance/atlas/CrossEntityAnomalyPanel.tsx` — Cross-entity anomaly patterns + override concentration (Phase 2)
- `products/neon/apps/web/components/finance/atlas/ICIntelligencePanel.tsx` — IC aging, exposure, exceptions (Phase 2)
- `products/neon/apps/web/components/finance/atlas/GroupNarrativePanel.tsx` — Group narrative + projections (Phase 2)
- `products/neon/apps/web/components/finance/atlas/GlobalForecastPanel.tsx` — Group close forecast, per-entity predictions, breach distribution (Phase 3)
- `products/neon/apps/web/components/finance/atlas/LongitudinalIntelligencePanel.tsx` — Entity profiles, persistent patterns, trends, delay explanations (Phase 4)

### Console Pages
- `products/neon/apps/web/app/(shell)/app/atlas-console/page.tsx` — Atlas Intelligence Console (tab-based workspace)
- `products/neon/apps/web/app/(shell)/app/global-close-monitor/page.tsx` — Global Close Monitor (multi-entity workspace)

### Documentation
- `docs/neon/finance/CAPABILITY_ATLAS_FINANCIAL_INTELLIGENCE.md` — Capability specification (executive + technical)
- `docs/neon/finance/ATLAS_OPERATOR_GUIDE.md` — Operator guide (close managers, controllers)
- `docs/neon/finance/ATLAS_ADMIN_CALIBRATION_GUIDE.md` — Admin calibration guide (threshold tuning, feedback governance)
- `docs/neon/finance/ATLAS_DEMO_WALKTHROUGH.md` — Demo walkthrough (6-act late close scenario)

### Risk Signal Integration
- `framework/runtime/src/services/business/engines/posting-engine/domain/types.ts` — `CloseRiskRuleType` + `atlas_anomaly`
- `framework/runtime/src/services/business/engines/posting-engine/domain/close-risk-evaluator.ts` — `evaluateAtlasAnomaly()`

### API Routes
- `products/neon/apps/web/app/api/fin/atlas/anomalies/route.ts` — List + trigger detection
- `products/neon/apps/web/app/api/fin/atlas/anomalies/[anomalyId]/route.ts` — Detail + status transition
- `products/neon/apps/web/app/api/fin/atlas/dashboard/route.ts` — Intelligence dashboard (+ predictions + narratives)
- `products/neon/apps/web/app/api/fin/atlas/predictions/route.ts` — Standalone predictions API
- `products/neon/apps/web/app/api/fin/atlas/narratives/route.ts` — Narrative generation API (Phase 3A)
- `products/neon/apps/web/app/api/fin/atlas/insight-graph/route.ts` — Insight graph API (Phase 5)
- `products/neon/apps/web/app/api/fin/atlas/feedback/route.ts` — Feedback submission + effectiveness API (Phase 6)
- `products/neon/apps/web/app/api/fin/atlas/feedback/calibrations/route.ts` — Calibration governance API (Phase 6)
- `products/neon/apps/web/app/api/fin/atlas/global-close/route.ts` — Global close monitor API (Phase 7)

---

## 16. Competitive Positioning

| Capability | SAP S/4 | Oracle ERP | BlackLine | Workiva | Athyper Atlas |
|------------|---------|------------|-----------|---------|---------------|
| Anomaly Detection | Add-on (SAP Analytics Cloud) | Separate (OACS) | Limited | No | Native, Phase 1 live |
| Financial Narratives | No | No | No | Manual | Native, Phase 3B live (template + optional LLM) |
| Close Forecasting | No | No | Partial | No | Native, Phase 2 live (single-entity), Phase 3 live (group-level statistical) |
| Recommended Actions | No | No | No | No | Native, Phase 4 live |
| Financial Insight Graph | No | No | No | No | Native, Phase 5 live |
| Adaptive Learning | No | No | No | No | Native, Phase 6 live (feedback-driven calibration) |
| Multi-Entity Close Intelligence | SAP Group Reporting (separate) | Oracle FCCS (separate) | No | No | Native, Phase 7 live (advisory, read-only) |
| Integrated Risk Signals | No | No | Yes (separate) | No | Same system |
| Intelligence UI Panel | No | No | No | No | Native, embedded in Release Detail |
| Causal Relationship Analysis | No | No | No | No | Native, graph-based hotspot detection |
| Longitudinal Intelligence | No | No | No | No | Native, Phase 4 live (cross-period behavior profiles, persistent patterns, delay reasoning) |
| Threshold Self-Tuning | No | No | No | No | Human-approved, evidence-based calibration |
| Unified Intelligence Console | No | No | No | No | Native, 6-tab workspace with admin calibration |
| Grounded in Governed Data | N/A | N/A | N/A | N/A | By architecture |

Atlas is the only intelligence layer that reads exclusively from a
governed, gate-protected data pipeline. Competitors bolt analytics
onto ungoverned data or require separate products.
