# Atlas AI Runtime Configuration

The Atlas AI runtime uses three `control` schema tables to govern autonomy ceilings, confidence thresholds, and drift monitoring for the `AIRuntime` service (`server/packages/services/ai/`).

---

## Architecture

```
AIRuntime.invoke(action, docClass, context)
        │
        ▼
ai_action_policy  ─── Resolve autonomy ceiling for (tenant, action, doc_class)
        │
        ▼
ai_confidence_threshold  ─── Resolve tier gates (suggest/assist/auto) for scope
        │
        ▼
AutonomyResolver.ceiling() + ConfidenceResolver.gates()
        │
        ├── L1 (suggest): confidence >= min_for_suggest → surface suggestion to user
        ├── L2 (assist):  confidence >= min_for_assist  → pre-fill + show confirm dialog
        └── L3 (auto):    confidence >= min_for_auto    → execute without human confirmation
        │
        ▼
ai_drift_baseline  ─── Monitor rolling confidence vs. reference distribution
```

---

## Layered Lookup Pattern

All three tables use the same layered resolution:

1. `(tenant_id, action_code, doc_class)` — most specific match
2. `(tenant_id, action_code, NULL)` — action-level catch-all
3. Platform default (seed row) — fallback

First enabled match wins.

---

## `ai.ai_action_policy`

Autonomy ceiling per tenant × action × document class. The runtime **never exceeds** this ceiling regardless of confidence score. `ARCHETYPE=C;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `action_code` | `text NOT NULL` | e.g. `classify`, `extract`, `suggest`, `autofill`, `approve`, `fx_rate` |
| `doc_class` | `text` | NULL = catch-all for all document classes |
| `autonomy_level` | `text NOT NULL DEFAULT 'suggest'` | Ceiling: `disabled` / `suggest` / `assist` / `auto` |
| `min_confidence_for_auto` | `numeric(5,4)` | NULL = defer to `ai_confidence_threshold.min_for_auto` |
| `requires_human_confirmation` | `bool NOT NULL DEFAULT true` | Show confirmation dialog even in `assist` mode |
| `override_policy_definition_id` | `uuid` | FK → `control.policy_definition`; used when confidence < threshold or action blocked |
| `is_active` | `bool NOT NULL DEFAULT true` | Manual boolean (no `status` column) |
| `effective_from` | `timestamptz NOT NULL DEFAULT now()` | |
| `effective_to` | `timestamptz` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, action_code, doc_class) NULLS NOT DISTINCT`

### Autonomy Levels

| Level | Behavior |
|---|---|
| `disabled` | Atlas AI feature is off for this action/tenant |
| `suggest` | L1 — Atlas surfaces suggestion; human always decides |
| `assist` | L2 — Atlas pre-fills/pre-selects; human confirms before commit |
| `auto` | L3 — Atlas acts without human confirmation when `confidence >= threshold` |

---

## `ai.ai_confidence_threshold`

Tiered confidence gates governing L1/L2/L3 autonomy. `ARCHETYPE=C;SCOPE=T`.

The three gate values must satisfy: `min_for_suggest ≤ min_for_assist ≤ min_for_auto`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `action_code` | `text NOT NULL` | |
| `doc_class` | `text` | NULL = catch-all |
| `model_id` | `text` | NULL = all model versions; e.g. `atlas-classifier-v3` |
| `min_for_suggest` | `numeric(5,4) NOT NULL DEFAULT 0.5000` | L1 gate: show suggestion if confidence ≥ this |
| `min_for_assist` | `numeric(5,4) NOT NULL DEFAULT 0.7000` | L2 gate: pre-fill if confidence ≥ this |
| `min_for_auto` | `numeric(5,4) NOT NULL DEFAULT 0.9000` | L3 gate: auto-execute if confidence ≥ this |
| `drift_alert_below` | `numeric(5,4)` | Trigger drift alert when rolling-window avg drops below this |
| `drift_window_hours` | `smallint NOT NULL DEFAULT 24` | Lookback window for rolling-average confidence computation |
| `is_active` | `bool NOT NULL DEFAULT true` | Manual boolean |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, action_code, doc_class, model_id) NULLS NOT DISTINCT`

**Constraint:** `min_for_suggest <= min_for_assist AND min_for_assist <= min_for_auto`

---

## `ai.ai_drift_baseline`

Statistical reference distributions for drift monitoring. One row per `(tenant, action_code, doc_class, model_id, baseline_date)`. Multiple baselines are retained; `is_current = true` marks the active reference. `ARCHETYPE=C;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `action_code` | `text NOT NULL` | |
| `doc_class` | `text` | NULL = applies to all classes |
| `model_id` | `text NOT NULL` | Specific model version that produced this baseline |
| `baseline_date` | `date NOT NULL DEFAULT CURRENT_DATE` | |
| `sample_size` | `int NOT NULL` | Number of predictions used to compute distribution (`> 0`) |
| `mean_confidence` | `numeric(7,6) NOT NULL` | 0.000000–1.000000 |
| `std_dev_confidence` | `numeric(7,6) NOT NULL` | `>= 0` |
| `p5_confidence` | `numeric(7,6)` | 5th percentile |
| `p95_confidence` | `numeric(7,6)` | 95th percentile |
| `feature_stats` | `jsonb` | Per-field distributional stats: `{"field_name": {"mean": ..., "std_dev": ...}}` |
| `is_current` | `bool NOT NULL DEFAULT false` | `true` = active reference for live drift comparison |
| `superseded_at` | `timestamptz` | Set when a newer baseline supersedes this one |
| `superseded_by_id` | `uuid` | FK → self; history chain |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Partial unique index:** `adb_current_uq` on `(tenant_id, action_code, doc_class, model_id)` WHERE `is_current = true` — enforces at most one current baseline per scope.

### Drift Monitoring Flow

1. Atlas AI model produces predictions with confidence scores
2. Rolling average over `drift_window_hours` computed by drift monitoring service
3. If `rolling_avg < drift_alert_below` → alert triggered (Sentry `captureMessage`)
4. Periodically (on `snapshot_reason = 'PERIOD_CLOSE'` or `'APPROVAL'`) → new baseline row inserted, `is_current` toggled, `superseded_by_id` chain updated

### Baseline Supersession

When a new baseline is established:
```sql
UPDATE ai.ai_drift_baseline
   SET is_current = false, superseded_at = now(), superseded_by_id = <new_id>
 WHERE tenant_id = :t AND action_code = :a AND model_id = :m AND is_current = true;

INSERT INTO ai.ai_drift_baseline (..., is_current = true) VALUES (...);
```

---

## Runtime Service Integration

**Location:** `server/packages/services/ai/`

**Key classes:**
- `AIRuntime` — orchestrator; dispatches to providers, resolves autonomy
- `AutonomyResolver` — reads `ai_action_policy`; Redis 60s cache
- `ConfidenceResolver` — reads `ai_confidence_threshold`; Redis 60s cache
- `InvoiceExtractionCapability` — uses `autonomy_level = 'assist'` ceiling

**API Routes:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/ai/action-policies` | List policies for tenant |
| `POST` | `/api/ai/action-policies` | Create/update policy |
| `GET` | `/api/ai/confidence-thresholds` | List thresholds |
| `POST` | `/api/ai/confidence-thresholds` | Create/update threshold |
| `GET` | `/api/ai/drift-baselines` | List baselines |
| `POST` | `/api/ai/drift-baselines` | Create new baseline |

---

## Related Docs

- [Overview](./overview.md)
- [Policy Engine](./policy.md)
- [Platform Governance](./platform-governance.md)
