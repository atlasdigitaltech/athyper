# Runtime-list cache observability — Phase 1

Status: instrumentation implemented; authenticated environment capture required before caching behavior changes.

## What is measured

The Journal Entry runtime-list path now records these operations without changing their behavior:

| Diagnostic | `Server-Timing` name | Current cache classification |
| --- | --- | --- |
| Search and lazy-list configuration | `session_config` | `bypass` (`fetch` remains `no-store`) |
| Saved views/default view | `saved_views` | `bypass` |
| Runtime descriptor | `descriptor` | `hit` or `miss` when the scoped descriptor cache is used; otherwise `bypass` |
| Access-context resolution | `access_context` | `bypass` |
| Authoritative record scope | `record_scope` | `bypass` |
| Record query | `records` | `hit`, `miss`, or `bypass` from the Records projection cache |
| Record upstream wait / decode | `records_http`, `records_decode` | inherits the Records projection-cache state |
| Reference and lookup hydration | `reference_hydration`, `lookup_hydration` | `bypass`; lookup-domain loads report their own cache state |
| Presenter resolution | `presenter_build` | `bypass` |
| Browser page cache | browser event | `hit`, `miss`, `stale`, or `bypass` |
| Completed RSC response | `rsc_total` in the structured server record | n/a |

`GET /api/runtime/v1/entities/:entity` exposes:

```text
X-Athyper-Cache: bypass
X-Athyper-Record-Cache: hit | miss | bypass
Server-Timing: descriptor;dur=..., record_scope;dur=..., records;dur=..., reference_hydration;dur=..., lookup_hydration;dur=..., total;dur=...
```

The RSC route writes one structured completion record after the streamed response finishes:

```text
[runtime-list-observability] {
  event: "runtime_list_baseline",
  entityCode: "journal_entry",
  routeKind: "rsc",
  cacheState: "hit | miss | stale | bypass",
  totalMs: 0,
  serverTiming: "descriptor;dur=..., records;dur=..., rsc_total;dur=...",
  operations: [],
  spans: []
}
```

`spans` preserves start offsets, parent operations, and non-sensitive counts so
parallel work can be distinguished from a serial waterfall. Cache keys, IDs,
filter values, and record values are never included.

The rendered list also carries a hidden `data-athyper-runtime-list-diagnostics` snapshot at presenter resolution time. The capture harness reads this snapshot for the per-operation RSC breakdown; browser navigation timing remains the authoritative end-to-end route measurement.

No tenant ID, principal ID, filter value, record value, or raw query string is logged.

The browser emits `athyper:runtime-list-cache` with this detail shape:

```json
{
  "cache": "hit | miss | stale | bypass",
  "cacheKeyHash": "f1a2b3c4",
  "entityCode": "journal_entry",
  "pageCount": 1,
  "observedAt": 0
}
```

## Capture the five-scenario baseline

The capture refuses to run without authenticated browser state and explicit context-switch, restore, and mutation requests. This prevents a partial or synthetic baseline and ensures the selected context is restored even when a later scenario fails.

Required inputs:

- `PERF_NEON_BASE_URL`: reachable Neon origin.
- `PERF_NEON_STORAGE_STATE`: Playwright storage-state JSON for a test principal.
- `PERF_CONTEXT_SWITCH_URL`, `PERF_CONTEXT_SWITCH_BODY`: request that switches to a second valid organization context.
- `PERF_CONTEXT_RESTORE_URL`, `PERF_CONTEXT_RESTORE_BODY`: request that restores the original context.
- `PERF_MUTATION_URL`, `PERF_MUTATION_BODY`: safe seeded-fixture mutation that affects Journal Entry results.

The canonical context endpoint is `PATCH /api/auth/session/context`. A typical body is `{"type":"operating_organization","id":"<fixture-id>"}`; use IDs from the selected performance fixture, not production records.

PowerShell example:

```powershell
$env:PERF_NEON_BASE_URL = 'https://neon.athyper.local'
$env:PERF_NEON_STORAGE_STATE = 'tests/visual/.auth/storage-state.json'
$env:PERF_CONTEXT_SWITCH_URL = '/api/auth/session/context'
$env:PERF_CONTEXT_SWITCH_METHOD = 'PATCH'
$env:PERF_CONTEXT_SWITCH_BODY = '{"type":"operating_organization","id":"<alternate-fixture-id>"}'
$env:PERF_CONTEXT_RESTORE_URL = '/api/auth/session/context'
$env:PERF_CONTEXT_RESTORE_METHOD = 'PATCH'
$env:PERF_CONTEXT_RESTORE_BODY = '{"type":"operating_organization","id":"<original-fixture-id>"}'
$env:PERF_MUTATION_URL = '/api/runtime/v1/entities/<fixture-entity>/<fixture-record-id>'
$env:PERF_MUTATION_METHOD = 'PATCH'
$env:PERF_MUTATION_BODY = '{"data":{"<safe-field>":"baseline-{{RUN}}"}}'
pnpm perf:capture:cache-observability
```

The default is three repetitions. Output is written to `perf/artifacts/cache-observability/<entity>-phase8-<timestamp>.json` and contains, for every scenario. First visit and immediate revisit use shell-preserving client navigation; this is required to measure the in-memory browser cache rather than a new document:

1. First Journal Entry visit.
2. Immediate revisit.
3. Different query/filter.
4. Context switch.
5. Mutation followed by revisit.

Each result includes browser navigation timing, the RSC operation snapshot, the API diagnostic headers, browser-cache state events, and matching diagnostic response headers. Keep the resulting artifact with the rollout evidence and compare the same three-run sequence after each caching phase.
