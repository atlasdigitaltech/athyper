# Planning & Budget Engine

The planning engine supports driver-based financial forecasting and budget management. Drivers define the business metrics that feed forecast calculations. Assumptions capture the concrete values for each driver per fiscal period. Versions provide immutable audit snapshots. The budget bridge connects planning driver versions to named, lockable budget baselines.

---

## Table Map

| Table | Purpose |
|---|---|
| `control.forecast_line` | Individual forecast line items per scenario |
| `control.planning_driver` | Named, reusable business metric definitions |
| `control.planning_driver_formula` | Calculation formula for derived drivers |
| `control.planning_driver_assumption` | Concrete values for input drivers per period |
| `control.planning_driver_version` | Immutable snapshot of driver assumptions |
| `control.forecast_budget_bridge` | Planning driver version → budget baseline link |

---

## `control.forecast_line`

Individual forecast line within a scenario. One line = one account + dimension combination for a period range. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `scenario_id` | `uuid NOT NULL` | FK → `document.forecast_scenario` |
| `line_no` | `smallint NOT NULL` | Unique within scenario |
| `gl_account_id` | `uuid` | |
| `commodity_category_id` | `uuid` | |
| `intent_id` | `uuid` | |
| `cost_center_id` | `uuid` | |
| `profit_center_id` | `uuid` | |
| `project_id` | `uuid` | |
| `budget_allocation_id` | `uuid` | Narrows to a specific fund center |
| `dimension_set_id` | `uuid` | |
| `company_code_id` | `uuid` | |
| `fiscal_year` | `smallint NOT NULL` | |
| `period_from` | `smallint NOT NULL DEFAULT 1` | 1–16 |
| `period_to` | `smallint NOT NULL DEFAULT 12` | 1–16; `>= period_from` |
| `currency_code` | `character(3) NOT NULL` | |
| `total_amount` | `numeric(18,4) NOT NULL DEFAULT 0` | |
| `period_amounts` | `jsonb` | Per-period breakdown: `{"1": amount, "2": amount, ...}` |
| `spread_method` | `text NOT NULL DEFAULT 'EVEN'` | `EVEN` / `FRONT_LOADED` / `BACK_LOADED` / `SEASONAL` / `STEP` / `CUSTOM` |
| `driver_id` | `uuid` | FK → `control.planning_driver` |
| `planning_driver_assumption_id` | `uuid` | FK → `control.planning_driver_assumption` |
| `is_driver_calculated` | `bool NOT NULL DEFAULT false` | Recalculated when assumptions change |
| `prior_year_amount` | `numeric(18,4)` | |
| `variance_amount` | `numeric(18,4) GENERATED` | `GENERATED ALWAYS AS (total_amount - COALESCE(prior_year_amount, 0))` |
| `variance_pct` | `numeric(8,4)` | |
| `confidence` | `numeric(3,2) NOT NULL DEFAULT 1.00` | 0.0–1.0 |
| `probability_weight` | `numeric(5,4) NOT NULL DEFAULT 1.0000` | 0.0–1.0 |
| `description` | `text` | |
| `justification` | `text` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `excluded` / `superseded` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, scenario_id, line_no)`

---

## `control.planning_driver`

Named, reusable business metrics feeding planning calculations. `ARCHETYPE=B;SCOPE=T`.

Input drivers are user-entered. Derived drivers are formula-calculated (see `planning_driver_formula`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `code` | `text NOT NULL` | Non-empty; unique per `(tenant, planning_model_id, code, version)` |
| `name` | `text NOT NULL` | |
| `planning_model_id` | `uuid NOT NULL` | FK → `document.planning_model` |
| `description` | `text` | |
| `driver_type` | `text NOT NULL DEFAULT 'QUANTITY'` | `QUANTITY` / `RATE` / `PERCENTAGE` / `CURRENCY` / `INDEX` / `RATIO` / `HEADCOUNT` / `GROWTH_RATE` |
| `driver_category` | `text` | Business category label |
| `data_type` | `text NOT NULL DEFAULT 'NUMERIC'` | `NUMERIC` / `INTEGER` / `PERCENTAGE` / `CURRENCY` / `BOOLEAN` |
| `uom_code` | `text` | Unit of measure |
| `aggregation_method` | `text NOT NULL DEFAULT 'SUM'` | `SUM` / `AVERAGE` / `WEIGHTED_AVG` / `LAST` / `FIRST` / `MIN` / `MAX` / `COUNT` |
| `time_allocation` | `text NOT NULL DEFAULT 'PERIOD_END'` | `PERIOD_END` / `PERIOD_START` / `PERIOD_AVG` / `POINT_IN_TIME` |
| `is_input` | `bool NOT NULL DEFAULT true` | User-entered |
| `is_derived` | `bool NOT NULL DEFAULT false` | Formula-calculated; mutually exclusive with `is_input` |
| `default_value` | `numeric(18,4)` | |
| `min_value` / `max_value` | `numeric(18,4)` | Optional bounds |
| `depends_on_drivers` | `uuid[] NOT NULL DEFAULT '{}'` | Topological dependency graph for recalculation; no DB FK — enforced at service layer |
| `version` | `int NOT NULL DEFAULT 1` | `>= 1` |
| `sort_order` | `smallint NOT NULL DEFAULT 0` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `deprecated` / `draft` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Constraint:** `NOT (is_input AND is_derived)` — a driver cannot be both.

---

## `control.planning_driver_formula`

Calculation formula for derived planning drivers. Versioned + effective-dated. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `driver_id` | `uuid NOT NULL` | FK → `control.planning_driver` |
| `formula_type` | `text NOT NULL DEFAULT 'EXPRESSION'` | `EXPRESSION` / `LOOKUP_TABLE` / `CONDITIONAL` / `RULE_SET` / `SCRIPT` |
| `expression` | `text` | Arithmetic string referencing driver codes |
| `formula_json` | `jsonb` | Lookup table or conditional rule set |
| `input_driver_ids` | `uuid[] NOT NULL DEFAULT '{}'` | IDs of input drivers used in this formula |
| `rounding_mode` | `text NOT NULL DEFAULT 'HALF_UP'` | `HALF_UP` / `HALF_DOWN` / `HALF_EVEN` / `CEILING` / `FLOOR` / `TRUNCATE` |
| `decimal_places` | `smallint NOT NULL DEFAULT 2` | 0–8 |
| `condition_expression` | `text` | Guard condition; formula only applies when truthy |
| `fallback_value` | `numeric(18,4)` | Value when condition fails |
| `version` | `int NOT NULL DEFAULT 1` | `>= 1`; unique per `(driver_id, version)` |
| `effective_from` | `date NOT NULL DEFAULT CURRENT_DATE` | |
| `effective_to` | `date` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `deprecated` / `draft` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**CHECK:** `expression IS NOT NULL OR formula_json IS NOT NULL` — at least one formula variant must be set.

### Formula Types

| Type | Description |
|---|---|
| `EXPRESSION` | Arithmetic string: `headcount * cost_per_head * (1 + inflation_rate)` |
| `LOOKUP_TABLE` | Interpolation table in `formula_json` |
| `CONDITIONAL` | Expression with condition guard |
| `RULE_SET` | Multiple conditional rules evaluated in order |
| `SCRIPT` | Extended scripted logic (future) |

---

## `control.planning_driver_assumption`

Concrete values for input planning drivers per fiscal period. `ARCHETYPE=B;SCOPE=T`.

Multiple assumptions per driver enable scenario modelling. Dimensional scope narrows applicability.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `driver_id` | `uuid NOT NULL` | FK → `control.planning_driver` |
| `scenario_id` | `uuid` | FK → `document.forecast_scenario`; NULL = global/default assumption |
| `assumption_name` | `text NOT NULL` | |
| `fiscal_year` | `smallint NOT NULL` | |
| `period_from` | `smallint NOT NULL DEFAULT 1` | 1–16 |
| `period_to` | `smallint NOT NULL DEFAULT 12` | 1–16; `>= period_from` |
| `assumption_value` | `numeric(18,4) NOT NULL` | Base value |
| `period_values` | `jsonb` | Per-period override: `{"1": val, "2": val, ...}` |
| `company_code_id` | `uuid` | NULL = all companies |
| `cost_center_id` | `uuid` | NULL = all cost centers |
| `project_id` | `uuid` | NULL = all projects |
| `growth_rate` | `numeric(8,4)` | |
| `growth_method` | `text` | `COMPOUND` / `LINEAR` / `STEP` / `SEASONAL` / `CUSTOM` |
| `confidence` | `numeric(3,2) NOT NULL DEFAULT 1.00` | 0.0–1.0 |
| `source` | `text NOT NULL DEFAULT 'MANUAL'` | `MANUAL` / `HISTORICAL` / `STATISTICAL` / `EXTERNAL` / `MODEL_OUTPUT` / `IMPORTED` |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `superseded` / `draft` / `excluded` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

---

## `control.planning_driver_version`

Immutable point-in-time snapshot of all driver assumptions. Insert-only. `ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `driver_id` | `uuid NOT NULL` | FK → `control.planning_driver` |
| `version_number` | `int NOT NULL` | `>= 1`; unique per `(driver_id, version_number)` |
| `version_label` | `text` | Human-readable label (e.g. `FY2026 Approved Budget`) |
| `assumptions_snapshot` | `jsonb NOT NULL` | Captured state of all assumptions at version time |
| `computed_output` | `jsonb` | Pre-computed output values (NULL until computed) |
| `snapshot_reason` | `text NOT NULL DEFAULT 'MANUAL'` | `MANUAL` / `APPROVAL` / `PERIOD_CLOSE` / `REFORECAST` / `IMPORT` / `ROLLBACK` |
| `triggered_by` | `text` | System event or principal that triggered the snapshot |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |

**No `updated_at`** — rows are immutable after INSERT. `log.trg_prevent_mutation()` should be applied.

---

## `control.forecast_budget_bridge`

Links a planning driver version snapshot to a named, lockable budget baseline. `ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `name` | `text NOT NULL` | Non-empty; unique per `(tenant, name, fiscal_year)` |
| `fiscal_year` | `smallint NOT NULL` | 2000–2099 |
| `budget_period_type` | `text NOT NULL DEFAULT 'annual'` | `annual` / `quarterly` / `monthly` |
| `planning_driver_version_id` | `uuid` | FK → `control.planning_driver_version` ON DELETE SET NULL; NULL = standalone baseline |
| `status` | `text NOT NULL DEFAULT 'draft'` | `draft` → `locked` → `approved` → `superseded` |
| `locked_at` | `timestamptz` | |
| `locked_by` | `uuid` | |
| `approved_at` | `timestamptz` | Must be after `locked_at` |
| `approved_by` | `uuid` | |
| `superseded_by_id` | `uuid` | FK → self; history chain |
| `superseded_at` | `timestamptz` | |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Constraints:**
- `(locked_at IS NULL) = (locked_by IS NULL)` — lock fields must be paired
- `(approved_at IS NULL) = (approved_by IS NULL)` — approval fields must be paired
- `approved_at IS NULL OR locked_at IS NOT NULL` — must be locked before approved
- `(superseded_by_id IS NULL) = (superseded_at IS NULL)`

**GL Gate:** Period-close reads `status = 'approved'` before allowing closing entries.

---

## Planning Recalculation Flow

```
planning_driver_assumption updated
        │ (is_driver_calculated lines in forecast_line reference driver)
        ▼
PlanningService.recalculate(driverId)
        │
        ├── Resolve topological order via depends_on_drivers[]
        ├── For each derived driver in order:
        │       evaluate planning_driver_formula.expression
        │       apply rounding_mode + decimal_places
        │       compute period_values from spread_method
        │
        └── Update forecast_line.total_amount + period_amounts
```

---

## Related Docs

- [Overview](./overview.md)
- [Accounting Profiles](./accounting-profiles.md)
- [Lifecycle Engine](./lifecycle.md)
