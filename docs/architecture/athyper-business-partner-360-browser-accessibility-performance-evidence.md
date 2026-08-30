# Business Partner 360 browser, accessibility and performance evidence

**Evidence date:** 2026-08-30  
**Status:** Qualification implementation complete; high-cardinality database gate passed; authenticated release-browser certification pending

## Implemented qualification surface

The production Playwright suite now automates canonical URL coordinates,
deep-link history, back/forward focus, superseded-request abort, role and scope
switching, historical read-only state, and governed-action destination checks.
It also covers purpose-bound person reveal close, response expiry, navigation,
permission-loss cleanup, and negative scans of rendered text, console output,
request/response telemetry, local/session storage and Cache Storage.

The accessibility journey runs keyboard reachability, semantic landmarks and
labels, Axe WCAG 2.2 AA tags, target-size/focus contracts, 200% reflow, mobile
responsive layout and RTL overflow checks on the supported Chromium desktop
and Pixel 7 profiles. Manual screen-reader interaction, translated-catalog
review and final UX/accessibility owner certification remain release-environment
activities; automated results must not be presented as that approval.

The opt-in performance journey records 30 summary and section samples, eight
first-use samples and ten cached switches. It fails above these budgets:

| Measure | Budget |
| --- | ---: |
| Summary p95 | 500 ms |
| Section p95 | 750 ms |
| First useful identity p75 | 1,500 ms |
| Cached section switch maximum | 100 ms |
| Summary transfer payload | 75 KiB |
| Default section transfer payload | 100 KiB |

Content-Length is used when exposed by the response. Decoded body size is the
conservative fallback when a browser does not expose compressed transfer size.

## Retained high-cardinality database evidence

The disposable NEON run inserted 25,000 sanitized identifiers and 25,000
sanitized requests for the acceptance supplier inside a transaction, analyzed
the affected relations, captured `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, and
rolled the transaction back. The full plans are retained in
`perf/qualification/evidence/business-partner-360-high-cardinality.json`.

| Query | Execution | Rows returned | Maximum loops | Plan evidence |
| --- | ---: | ---: | ---: | --- |
| Identifier page | 0.071 ms | 101 | 1 | Tenant-leading current cursor index scan |
| Open-work aggregate | 5.869 ms | 1 | 1 | Single bounded aggregate scan |
| Recent governance activity | 8.383 ms | 5 | 1 | Single scan, sort and limit |

The contact role/channel and address-event readers were changed from per-row
queries to bounded batched queries. Static evidence confirms both use typed
array selection and neither retains an asynchronous per-parent query map.

The aggregate/activity planner correctly chose a sequential scan because every
one of the 25,000 synthetic requests belonged to the probed partner. Separate
tenant-leading indexes remain available for selective production distributions;
the evidence does not force an index when the measured planner cost rejects it.

## Reproduction

Apply `20260830_neon_business_partner_360_performance_indexes.sql` to a local,
disposable `athyper_neon` database containing the acceptance pack, then run:

```sh
pnpm --filter @athyper/server-db db:verify:neon:business-partner-360-performance -- \
  --neon-database-url=postgresql://postgres@127.0.0.1:55432/athyper_neon \
  --confirm=RUN-BS360-PERFORMANCE-EVIDENCE \
  --rows=25000 \
  --output=perf/qualification/evidence/business-partner-360-high-cardinality.json
```

The runner refuses non-local or differently named databases, requires the
explicit confirmation phrase, bounds its seed to 10,000–100,000 rows, and
always rolls back its data transaction.

Run browser qualification using the environment contract documented in
`tests/e2e/README.md`. At this evidence date no reachable release URL,
authenticated browser storage state, or BP360 fixture coordinates were supplied.
The latest local invocation on 2026-08-30 set the production-matrix switch and
discovered five journeys across desktop and mobile, producing ten test cases;
all ten were explicitly skipped because authenticated release credentials and
fixture coordinates were absent. They are not represented as executed
certification evidence.

## Gate decision

The production-shaped database and no-N+1 portion of this P1 item passes. The
browser, HTTP p95/payload, manual screen-reader, localization and approval
portions remain pending until the release environment and authorized fixture
account are provided.

The structured [P1 qualification packet](./evidence/business-partner-360-p1-qualification.json)
records `executedCases: 0`, `skippedCases: 10`, null release performance
measurements and incomplete manual certification. Its evaluator refuses a
browser pass when any case is skipped, when fewer than ten cases execute, or
when any of the seven fixture families is absent.
