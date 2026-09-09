# Business Partner Manage insights (BP-AI-06)

Implemented in the working tree. Deployment and authenticated browser/live-model qualification remain BP-AI-09 release gates.

`bp_read_list_insights` is a NEON read capability registered when the Business Partner insight owner is available. Existing Atlas read admission and Business Partner read permissions apply. Agent profile allowlists must include the capability before it is available to that profile.

The runtime binds the validated Manage context before preview persistence. The model can supply only an optional `target`: `selection`, `visible_page`, or `filtered_set`. The default is the page analysis target. Explicit all-filtered requests can override selection without changing the filters or authorization. Record and historical contexts cannot invoke this capability. Replay retains the exact bound arguments and re-runs authorization, population queries and owner assessment; changed results withhold the prior answer.

Population comes from the same `EntityListService.list` used by Manage, including standard views, search, filters, sort, group, projection-field checks, directory role/organization/company predicates and tenant admission. Filtered analysis starts at the beginning of the filtered population, independently of the displayed cursor. Selection adds the Records ID restriction. Visible-page analysis verifies the requested IDs against a fresh read at the current cursor before restricting the population. IDs, totals and comparison values are never taken from model prose.

Assessment uses the existing readiness read handler, including Records identity admission, explicit organization/company/role admission, owner scope validation and disclosure projection. It evaluates saved completeness, not transaction eligibility. Directory supplier/customer role and explicit work organization/company supply assessment coordinates. Missing scope, unavailable definitions/providers and incomplete evidence remain unevaluated; no zero-issue all-clear is inferred. Withheld findings cannot leave complete assessment coverage behind.

## Bounds and count meanings

- At most 20 distinct authorized partners receive owner assessments per invocation, with one model tool call. No unbounded pagination or one model call per partner.
- The owner-read admission budget is 3.5 seconds; cancellation is checked between reads and after awaited operations. The existing tool service enforces the outer 5-second timeout. An in-flight owner read may finish after cancellation but cannot start further reads or disclose a result.
- Evidence is capped at 100 entries and the tool result at 32 KiB. Evidence-cap and elapsed admission-budget exhaustion return partial coverage; protocol/byte-limit failures fail closed through the existing tool service. Narrow the filters/selection for complete results.
- `authorizedTotalCount` is included only when Records reports an exact count. Approximate/cached totals are omitted. No browser count or denied-selection count is exposed.
- `examinedCount` counts distinct partners whose disclosed assessments were retained. `evaluatedCount` counts current, complete assessments with evaluated owner findings. A provider-unavailable or missing-scope partner can be examined without being evaluated.
- `distinctPartnersWithFindings` counts each examined partner with at least one disclosed failed finding once. Each issue count counts distinct partners for that issue code, even if an owner repeats the same code. Issue counts explicitly overlap and must not be summed to obtain a partner total.
- `complete` requires exhaustion of the authorized population and complete assessments for every retained partner. Empty authorized populations are complete with zero counts; they establish no partner readiness.
- Reads reflect current authorized state, not a cross-service point-in-time snapshot. Changes between reads may cause the request to fail closed or require refresh.

The structured insight stream renders coverage, issue counts and an accessible partner comparison table. A server-authored completion states the authoritative counts and narrowing guidance without putting the full comparison through another model pass. Existing live/replay insight rendering and evidence reauthorization remain in use.

## Local verification

The added platform tests exercise 0/2/20/21/100,000 candidate populations, overlap/deduplication, target overrides, visible-page checks, exact-count downgrades, partial/provider/restricted evidence, query denial, descriptor changes, cancellation, budgets and replay. Host composition tests run the tool against real in-memory Records query/list services over 2,000 partners, testing population/count parity, tenant isolation and denied filter/sort/group/projection/search operations. UI tests verify authoritative coverage and accessible escaped comparison cells. These synthetic tests do not establish live database latency or deployed persona qualification.
