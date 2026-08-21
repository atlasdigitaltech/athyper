# Record workspace observability — Phase 0

Status: instrumentation and capture harness implemented. An authenticated
four-archetype capture is required to close the Phase 0 exit gate.

## Scope

The baseline covers the common record workspace used by classic master/ledger
records and document object pages. It records existing behavior without
changing fetch, React Query, retry, cache, or prefetch semantics.

The required archetypes are:

1. Journal Entry
2. Purchase Invoice
3. One master entity
4. One ledger entity

## Browser telemetry

Both record workspaces mount a Resource Timing observer and emit the custom
event `athyper:record-workspace-observability`. The event contains no raw
record, comment, attachment, tenant, or principal identifier. Identifiers are
represented by an eight-character non-cryptographic correlation hash.

The event payload is cumulative for the mounted record and contains:

- request counts and total/max duration by canonical resource;
- request counts and total/max duration by active surface;
- redacted request families;
- exact repeated-request counts;
- N+1 families and distinct item counts;
- transfer, encoded-body, and decoded-body byte counts;
- same-origin `Server-Timing` entries when exposed by the response.

Canonical resources are `core`, `process`, `approvals`, `lifecycle`,
`collections`, `versions`, `comments`, `attachments`, `activity`, and
`support`.

The root workspace carries `data-athyper-record-workspace=<entityCode>`, which
is the stable readiness selector used by the capture harness.

## Server telemetry

The record RSC route writes one structured completion log:

```text
[runtime-record-observability] {
  event: "runtime_record_workspace_baseline",
  entityCode: "journal_entry",
  renderer: "document",
  recordKeyHash: "...",
  totalMs: 0,
  operations: [
    { operation: "descriptor", calls: 1, durationMs: 0 },
    { operation: "record_core", calls: 1, durationMs: 0 },
    { operation: "process_state", calls: 1, durationMs: 0 },
    { operation: "snapshot_child_contracts", calls: 1, durationMs: 0 }
  ]
}
```

This separates the server loader chain from browser-visible resource timing.
No raw record ID is logged.

## Current known baseline finding

The supplied Journal Entry trace contained 21 business API calls after record
navigation. Comments accounted for 12 calls. Three rendered comments produced
three attachment calls and three reaction calls, which is the current `2N`
enrichment pattern. The trace also contained two overlapping comment list
requests: one large count-oriented request and one page-oriented request.

The lifecycle client request overlaps process information already resolved by
the initial server record chain. Snapshot history remains a distinct resource
and must not be counted as a lifecycle duplicate.

The doubled development static chunks are reported separately by DevTools and
are deliberately excluded from record-workspace business-resource metrics.

## Capture procedure

Copy the matrix template and replace all placeholders with disposable seeded
records available to the performance principal:

```powershell
Copy-Item `
  perf/baselines/record-workspace-matrix.example.json `
  perf/baselines/record-workspace-matrix.local.json
```

Set the environment and run the capture:

```powershell
$env:PERF_NEON_BASE_URL = 'https://neon.athyper.local'
$env:PERF_NEON_STORAGE_STATE = 'tests/e2e/.auth/storage-state.json'
$env:PERF_RECORD_WORKSPACE_MATRIX = 'perf/baselines/record-workspace-matrix.local.json'
$env:PERF_REPETITIONS = '3'
$env:PERF_SETTLE_MS = '1000'
$env:PERF_SURFACE_TIMEOUT_MS = '10000'
pnpm perf:capture:record-workspace
```

The harness refuses partial matrices. It requires exactly one profile for each
required archetype and rejects placeholder record IDs. Each profile declares
its supported canonical resources. Calls to an undeclared resource have a
zero-call budget, which makes the comparison capability-aware. A surface may
declare `telemetrySurface` when its visible label/id differs from the runtime
surface key (for example, `Line Items` maps to `lines`).

Surface readiness comes from the matching
`record-workspace:<surface>:activated` performance mark. The subsequent
`PERF_SETTLE_MS` observation window collects requests but is not included in
the readiness duration.

Outputs:

```text
perf/artifacts/record-workspace/record-workspace-phase0-<timestamp>.json
perf/artifacts/record-workspace/record-workspace-phase0-<timestamp>.md
```

The JSON is the authoritative raw evidence. The Markdown file is the baseline
dashboard for review and release evidence.

Phase 0 records budget violations without failing the run. Set
`PERF_ENFORCE_BUDGETS=true` only when the corresponding optimization phases
are ready to use these budgets as a gate.

## Dashboard definition

The generated dashboard has one row per entity/archetype and the following
primary panels:

| Panel | Source | Primary split |
|---|---|---|
| Record usable p50/p95/max | capture action timing | entity, renderer |
| Calls per record workspace | browser snapshot | entity, resource |
| Resource duration p95 | browser snapshot | resource, surface |
| Duplicate calls | browser snapshot | entity, request family |
| N+1 calls and distinct instances | browser snapshot | entity, family |
| Server loader duration | structured RSC log | entity, operation |
| Response bytes | browser snapshot | entity, resource |
| Surface first-open duration | capture actions | entity, surface |

The dashboard must always retain renderer/entity filters so an entity without
approvals, collections, versions, or collaboration is evaluated with zero
calls for unsupported resources rather than compared with document entities.

## Budgets

The machine-readable source of truth is
`perf/budgets/record-workspace.v1.json`.

| Metric | Budget |
|---|---:|
| Initial record usable | 3,000 ms |
| Warm record navigation | 500 ms |
| First surface ready | 1,000 ms |
| Exact duplicate extra calls | 0 |
| N+1 families | 0 |
| Per-item enrichment calls | 0 |
| Comments first open | 2 calls maximum |
| Attachments first open | 1 call maximum |
| Activity first open | 1 call maximum |
| Lifecycle first open | 1 call maximum |
| Versions first open | 1 call maximum |

Unsupported resources have a hard budget of zero calls.

## Exit gate

Phase 0 is complete when:

- all four archetypes have three successful captures;
- the JSON and Markdown artifacts are retained;
- server structured logs are present for matching record opens;
- duplicate and N+1 findings are recorded, not manually inferred;
- current budget violations have named follow-up phases;
- captures are repeated against a production build to exclude dev-server
  module revalidation noise.
