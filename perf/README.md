# Athyper performance baselines

## P0 meta-entity baseline

The P0 harness measures descriptor bootstrap, list, detail, create, PATCH, and
aggregate-save behavior. Read scenarios are enabled by default. Write scenarios
require `WRITE_MODE=enabled` and must run only against a disposable performance
tenant.

Dataset sizes are defined in
[`datasets/meta-entity-profiles.json`](./datasets/meta-entity-profiles.json).
Record the selected profile, database statistics timestamp, API replica count,
DB/Redis topology, commit SHA, and environment variables with every result.

Example read baseline:

```powershell
k6 run `
  -e BASE_URL=http://localhost:3001/api `
  -e TOKEN_TENANT_A=$env:PERF_TOKEN `
  -e ORG_TENANT_A=demo-org `
  -e ENTITY=supplier `
  -e RECORD_ID=00000000-0000-0000-0000-000000000001 `
  perf/k6/p0-meta-entity-baseline.k6.js
```

Write inputs are complete API request bodies, supplied as JSON:

```text
WRITE_MODE=enabled
CREATE_BODY_JSON={...}
PATCH_BODY_JSON={...}
PATCH_RECORD_IDS=<id-1>,<id-2>
AGGREGATE_BODY_JSON={...}
AGGREGATE_RECORD_IDS=<id-1>,<id-2>
DOCUMENT_EDIT_WORKSPACE=<signed workspace capability when required>
```

The API `/metrics` endpoint exposes `athyper_framework_*` histograms and
counters. Capture it immediately before and after every k6 run. Calculate
p50/p95/p99 from the histograms in Prometheus and correlate them with:

- `pg_stat_statements` total/mean time, calls, rows, and temporary bytes;
- database pool waiting and acquisition duration;
- Redis operations and latency;
- Node event-loop lag, heap, and garbage collection;
- descriptor cache state and response payload bytes;
- transaction duration and outbox lag.

Run the same scenario three times after warm-up. A baseline is repeatable when
throughput and p50/p95/p99 are each within 10% across all three runs. Store raw
k6 JSON, the `/metrics` snapshots, and the top-20 `pg_stat_statements` export as
release artifacts. Later performance changes must include before/after artifacts
from the same dataset profile and topology.

Use [`baselines/p0-meta-entity-template.md`](./baselines/p0-meta-entity-template.md)
for the result record and [`sql/top-framework-statements.sql`](./sql/top-framework-statements.sql)
for the top SQL export.
