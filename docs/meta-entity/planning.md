# Planning and Budget Control

Planning is Neon-owned. Athyper and Mesh do not install finance-planning tables; Admin manages Neon through service APIs.

## Ownership

| Schema | Tables | Responsibility |
|---|---|---|
| `control` | `planning_model`, `planning_driver`, `planning_driver_dependency`, `budget_control_policy` | Reusable model and evaluation configuration |
| `document` | `planning_scenario`, `planning_scenario_line`, `budget_profile`, `budget_allocation` | Editable and governed planning/budget documents |
| `ledger` | `planning_run`, `planning_output`, `budget_transaction`, `budget_balance` | Calculation, movement evidence and projections |

The legacy tables `control.budget_check_config`, `control.forecast_budget_bridge`, and `control.forecast_line` are not installed by the three-plane DDL.

## Budget control

`control.budget_control_policy` defines deterministic evaluation behavior by optional Company, Ledger Book and source-document scope. It stores period scope, consumption basis, warning/block thresholds and an optional governed override policy. Scope precedence is Company, then Ledger Book, then document type. Overlapping active effective ranges for one exact scope are rejected.

Budget authority is not stored in policy rows:

- `document.budget_profile` owns the approved budget envelope.
- `document.budget_allocation` owns authorized WBS allocations and explicit overspend behavior.
- `ledger.budget_transaction` is append-only reservation, release, consumption and adjustment evidence.
- `ledger.budget_balance` is the concurrency-safe projection.

## Planning scenarios

`document.planning_scenario` is a versioned scenario header for one `control.planning_model`. Its normalized child `document.planning_scenario_line` stores one dimensional coordinate for one fiscal period. There is no `period_amounts` JSON and no line-level lifecycle competing with the scenario lifecycle.

Scenario lifecycle:

```text
draft -> in_review -> approved -> superseded
  |          |
  +----------+-> cancelled
```

Only draft scenarios permit line mutations. Approved scenario versions and their lines are immutable.

## Reproducible calculation

```text
document.planning_scenario_line
        | canonical SHA-256 input hash
        v
ledger.planning_run
        v
ledger.planning_output
```

A planning run must reference an approved or superseded scenario version. Its `input_hash` must equal `document.planning_scenario_input_hash(...)`; therefore every output is reproducible from an immutable input set. `ledger.planning_output` stores one immutable period result and can retain a baseline amount for variance analysis.

## Legacy disposition

| Legacy table | Disposition |
|---|---|
| `control.budget_check_config` | Replace with `control.budget_control_policy` |
| `control.forecast_budget_bridge` | Do not migrate; model versioning and approved planning runs provide the bridge |
| `control.forecast_line` | Transform to normalized `document.planning_scenario_line` rows |

The inspected Neon source tables contain zero rows, and Mesh contains none of the three tables, so the current cutover requires no row transformation.
