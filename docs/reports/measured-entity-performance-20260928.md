# Phase D — measured collaboration and detail performance

## Outcome

Implemented a bounded attachment-page enrichment query and parallel independent
detail hooks. No new index or database migration was needed. Authorization,
tenant RLS, scan/expiry restrictions and explicit history admission remain in
place. Country capability settings and existing signed payloads were not edited.

Publication status: Country release 7 (`3a3d4961-0103-45c9-b2b0-eef85d950fc3`)
is active on Studio, Neon and Mesh. The exact policy was submitted with real
platform.admin OTP authentication and independently activated by platform.owner
with OTP. All target receipts report verified Ed25519 signatures, valid manifests
and compatible runtimes. The performance changes are
server implementation changes, not mutable settings in the compiled payload.
The DEV API, worker and control API were reloaded and reported healthy.

## Database measurements

The reproducible harness runs production-generated SQL against local DEV Neon,
as `athyper_runtime` (neither superuser nor BYPASSRLS). Fixture creation uses a
single rollback-only transaction with normal constraints and audit triggers.
Fixtures and their audit events are rolled back; real-table statistics are
restored with ANALYZE afterward. QA was not touched.

The large fixture has 10,000 series on the target record and 10,000 on another
record, three versions and three links each: 60,000 attachments and 60,000 links.
Each series has two pinned versions and an unpinned current version. Creation
timestamps deliberately tie across groups of ten. Text is roughly 1.8 KB per
attachment; one in ten contains the search term. Categories are mixed. All folder
values are NULL, so this does not qualify large populated-folder distributions.

Paired baseline/candidate SQL was measured five times against the same fixture.
These are local, mostly warm-cache samples, not production SLOs or statistically
robust tail estimates; the reported p95 is the maximum of five samples.

| Scenario | Baseline median ms | Candidate median ms |
| --- | ---: | ---: |
| Browse | 1585.337 | 93.025 |
| Name filter | 85.607 | 49.396 |
| Category | 330.871 | 32.270 |
| Unfiled | 1549.738 | 87.803 |
| Cursor page | 797.385 | 84.549 |
| Version history | 14.407 | 13.778 |
| Content search | 21.035 | 19.989 |
| Content search cursor | 19.239 | 18.425 |

Browse improved about 94%. Its first measured plan performed 30,000 principal
candidate function calls before the change versus 51 afterward. Shared buffer
hits fell from 335,011 to 5,296. Content search was not rewritten; its small timing
variation is not attributed to this optimization. The measured bottleneck was
row enrichment, not a missing index; an extra write-cost index was not justified.

Query stages are now: authorized record/filter candidates → deterministic winner
per series → cursor and ordered 51-row page → display names and optional history.
The materialized page ensures enrichment is bounded. DISTINCT is not replaced by
an early LIMIT. The UUID tie-breaker remains explicit in the final ordering.

The old cursor predicate ran before winner selection, allowing an older pin from
an already-consumed series to reappear. The cursor now applies to the selected
series winners. The PostgreSQL check traversed all 10,000 winners without missing
or duplicate series, checked expected pinned IDs/record ownership, retained all
three history versions, and returned no rows under a different tenant context.
This is stable-data keyset pagination, not a snapshot guarantee across concurrent
link edits between HTTP requests.

Two initial 10,000-series setup attempts timed out in fixture construction and
rolled back. Intermediate ANALYZE and a bounded longer setup timeout allowed the
full run without disabling audit triggers. These were not application latency
measurements.

## Detail hooks

The actual detail service was measured with independent controlled dependencies:
40 ms collaboration and 70 ms summary. Across twelve samples, sequential median
was 110.804 ms and parallel median 70.749 ms (about 36% lower); parallel maximum
was 72.616 ms. This measures eliminated serial waiting, not a production-wide
latency claim. Actual providers independently resolve authorized metadata; no
shared transaction is passed between them.

After reader reload, twelve authenticated Neon relay detail-descriptor reads
returned valid descriptors: median 131.163 ms, maximum 212.225 ms. There is no
matching live before-baseline, so no live percentage improvement is claimed.

Both hooks remain after record admission and readable-field projection. Missing
records invoke neither hook. Hook failure rejects the descriptor rather than
returning a silently incomplete response. Deterministic barrier tests ensure
concurrency without relying on timing assertions in normal unit tests.

## Regression gate and reproduction

```sh
pnpm exec tsx tooling/scripts/performance/measure-attachment-discovery.mts --series 10000 --runs 5 --baseline docs/archive/attachment-discovery-20260928/attachment-discovery-baseline-20260928.json --output docs/archive/attachment-discovery-20260928/attachment-discovery-volume-20260928.json
pnpm exec tsx tooling/scripts/performance/measure-detail-hooks.mts docs/reports/detail-hook-candidate-20260928.json
pnpm exec tsx tooling/scripts/performance/check-performance-budgets.mts docs/archive/attachment-discovery-20260928/attachment-discovery-volume-20260928.json docs/reports/detail-hook-candidate-20260928.json
```

The saved baseline contains the original SQL. Scaling adjusts only its synthetic
midpoint cursor. The gate requires paired evidence and all correctness checks:
browse/unfiled/cursor median ≤ half the baseline + 5 ms; other medians and all
tails ≤ twice baseline + 5 ms. Controlled hook median ≤ 95 ms, maximum ≤ 130 ms,
and hook start spread < 20 ms. These thresholds passed and apply to this DEV
benchmark, not arbitrary loaded CI hosts. They preserve substantial headroom
while catching the original enrichment and sequential-hook regressions.
At 10,000 series, additional candidate-tail ceilings prevent regressions relative
to the new baseline: browse 200 ms, name 105, category 80, unfiled 205, cursor 185,
history 35, content 50 and content-cursor 45. These are rounded approximately 2x
observed candidate maxima. Browse attribution loops must also stay ≤ 51.

## Verification and publication preparation

- Attachments: 94 tests passed; typecheck passed.
- Records: 311 passed, three environment-dependent tests skipped; typecheck passed.
- Studio authoring: 212 tests passed; typecheck passed.
- Publication service: 367 tests passed.
- Targeted host compiler/enrollment: 26 tests passed.
- Browser regressions: 28 passed, including English/Malay/Arabic, drafts, tenant
  changes, header alignment, tooltips, side/full view and pagination. Four stale
  fixtures were updated to current side/full-view controls and the actual shared
  PanelHeader component; no production UI behavior was changed for those tests.
- SQL query-shape tests retain deduplication-before-cursor and bounded enrichment.

The successor amendment copies only validated localization references onto the
predecessor graph. Changed fallback labels, entity/storage identity, field sets
and navigation structure are rejected. It does not import the source's Public
default proposal or change permissions, storage, Summary or capability limits.
Tests cover every plane, idempotency and preservation of the Private default.

Prepared draft: `f557e313-c627-4873-9774-2745e6b2a192`, revision 2. Explicit targets:
Studio, Neon, Mesh. Baseline, draft and candidate policy are in the adjacent
`localized-successor-*-20260928.json` evidence files. The current compiler
fingerprint is `2c889aa8d28ff32de892234a82287f04eee4c65f8a12ed16641590de1c24d86c`,
independently matched in local/control/worker processes. This is qualification
evidence, not approval. Normal independent policy approval, signed publication
and per-plane guarded activation subsequently succeeded on 2026-09-27 at
22:48:41 UTC. Release 7 supersedes release 6; neither historical payload was edited.

Submitted policy: `cbbb34f8-fe06-4a5e-a33e-fbe72de19e59`, version 1, definition hash
`72791fc7d2390d47bb9226b334f0f962df026fdf4e3908038279edd3463295ff`.
The original proposal receipt records `pending_approval`; the separate policy
activation and target receipts now confirm completion. The first admin callback
failed on local TLS trust; the replacement used the explicit DEV certificate and
successfully verified password plus OTP. No certificate verification was disabled
for control-plane publication requests.

Final evidence: `localized-successor-policy-activation-20260928.json`,
`localized-successor-execution-20260928.json`,
`localized-successor-target-receipts-20260928.json`, and
`localized-successor-signed-in-20260928.json`.
Direct JSON comparison confirms both collaboration bindings equal release 6 on
every plane, including Private default and attachment limits. Both list and detail
compiled projections contain 22 localized field references on every target.
Authenticated Neon catl.admin detail/Comments/Files reads returned 200; collaboration
responses identify release 7. Studio/Mesh signed-in acceptance remains with the
user as requested. No test business records were created during these checks.
