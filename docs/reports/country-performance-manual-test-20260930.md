# Country / shared Entity Framework performance verification

## Scope and implementation

Country uses its published entity definition, shared Entity routes, the record
provider and the shared list/detail workspace. No separate Country UI or API was
added. Server admission and locked record scope remain mandatory.

- Entity HTTP reads share published metadata and refreshed IAM evidence only
  within the current request. Each field, action, record and attachment still
  receives its own authorization decision; mutations and subsequent requests
  refresh evidence. This removes repeated IAM round trips for every field.
- Direct attachment admission and collaboration-presence checks avoid projecting
  unrelated UI actions. Full projections deduplicate identical permission checks
  within one resolution and use at most four concurrent checks.
- Attachment search uses at most four concurrent per-hit admissions, preserves
  SQL result order and drops denied or mismatched record hits.
- Version-history browse is a trusted read preflight. It retains version permission,
  parent and stored attachment association checks without requiring version-upload
  revision/idempotency tokens. Upload commands still require their tokens.
- Search thumbnails use the same visible-tile component as Files. All thumbnail
  request paths use the shared limit of three. Ready signed capabilities are
  reused within the same client, identity, permissions, publication and record
  scope, only until five seconds before expiry. Cache size is bounded to 128;
  attachment IDs identify versions. Nothing is persisted to browser storage.
- Detail response timing exposes metadata, authorization, record, fields, actions,
  relationships, collaboration, summary, activity and total. The last three hooks
  run concurrently; their durations must not be summed as elapsed time.
- Preview timing exposes authorization, database and signing. Preview database
  time includes transaction acquisition/setup and commit. Search retains its
  separate acquisition, database and per-hit authorization stages.
- Activity errors distinguish unpublished configuration and access denial.
- Shared metadata authoring skips DELETE statements for empty execution-binding
  sections. Existing execution bindings still require their original write grants.
- Publication approval checks reuse the active tenant authority transaction.
  Studio authority and projection writes use one transaction, avoiding the
  two-connection worker pool deadlock while preserving approval and rollback.

## Live baseline before deployment

Authenticated Neon, existing Country record, sequential probes, 2026-09-30:

| Request | Before |
| --- | --- |
| Detail descriptor, three samples | 3409 / 3427 / 3462 ms |
| Record, three samples | 684 / 735 / 675 ms |
| List descriptor / list | 689 / 790 ms |
| Content search `bank` | 4282 ms |
| Search initial / hit authorization | 682.3 / 3541.2 ms |
| Search database | 2.6 ms |
| Thumbnail capability | 776 ms |
| File version history | 403, `ENTITY_CAPABILITY_DENIED` |
| Notifications / Inbox | 404, `COLLECTION_CONFIGURATION_NOT_PUBLISHED` |

These are individual DEV samples, not p95 or load-test measurements.

## Repeatable authenticated API probes

Use the normal saved DEV browser session (defaults to Neon `catl.owner`):

```sh
node tooling/scripts/verification/verify-entity-performance.dev.mjs \
  --record 01a0d433-806b-7874-862d-49a9b955f6a1 \
  --attachment f83f4445-bdc9-448c-8470-21c974703a54 \
  --query bank \
  --output /tmp/country-performance-after.json
```

The tool exercises actual BFF/Entity routes. It performs reads, including POST
search, browse and preview; no record mutation or snapshot capture. Reports
contain status, timings, safe error codes and request IDs, not record bodies,
credentials or signed URLs. A non-200 sample makes the command exit nonzero.
Use `--state <path>` for another existing saved session; `--plane` and `--entity`
allow the same checks for another onboarded entity.

## Browser manual acceptance

Open https://neon.dev.athyper.test/app/entity/country with Developer Tools Network
recording enabled. Sign in normally and select CirrusAtlantic.

1. Open the Country list. Exercise text search, real metadata filters, multi-sort,
   pagination and a saved view. Clear each control and verify the matching rows.
2. Open a Country record, reload and inspect the detail descriptor timing. Under
   a stable session expect one descriptor/record pair; context changes may cancel
   and replace a pair. Verify field labels, values and read-only Country actions.
3. Open Files and scroll. Thumbnails load only near the viewport, with no more
   than three active thumbnail API requests. Return to already viewed files:
   unexpired thumbnail capabilities should be reused.
4. Search contents for `bank`. Results must remain usable while thumbnails load.
   Switch back to Files and repeat the query. Matching unexpired thumbnails should
   reuse their capability. Inspect `hit_authorization` separately from database.
5. Open version history on the known test attachment. Expect 200 for an authorized
   user and correct version rows. A user without version permission must still
   receive 403; the UI must display access denial rather than a generic retry.
6. Check image and PDF preview/download, Comments thumbnails and comment history.
   Leave a thumbnail visible for over two minutes: it must renew without displaying
   an expired URL. Broken image delivery must evict the failed cached capability.
7. Change record, tenant or permissions. No previous-context image or data may
   appear in the new context. Reused attachment IDs must not bypass fresh admission
   in a changed security/record context. Verify denied search hits stay absent.
8. Switch Activity timeline, audit and snapshots; inspect snapshot and compare.
   Switch tabs within 30 seconds and check that the prerequisite descriptor is
   reused. Explicit Refresh must reload it. Check browser Back/Forward.
9. Open Notifications and Inbox. Both
   descriptors must return 200; real filters, views and pagination must work.
   Test separately with a restricted user: publication does not grant access.
10. Export a fresh HAR with response bodies and timing headers. Compare equivalent
    cold and warm interactions; do not infer UI rendering time from API time alone.

## Publication procedure

Run the existing authenticated preflight and workflow after refreshing sessions:

```sh
node tooling/scripts/verification/setup-activity-collections.dev.mjs --check
node tooling/scripts/verification/setup-activity-collections.dev.mjs
```

The existing script uses Studio admin authoring and independent owner review,
publishes through normal APIs and verifies activation in all three DEV planes.
It also exercises an Inbox successor revision. Never substitute database inserts
or weaken IAM/MFA/reviewer checks to clear a publication failure.

## Verification status

Focused checks passed for attachment discovery/admission, capability and Activity
policy, record services, request evidence isolation/revocation, metadata authoring,
empty execution-binding replacement, publication transaction rollback, thumbnail
expiry/context reuse and the browser thumbnail concurrency flow. Changed server
and UI packages passed typechecks. The root test reachability check passes.

Broader suites are **not fully green**: an existing Entity section-service test
expects two catalog arguments rather than the current third `undefined`; an
existing detail layout browser assertion expects less than 1px padding difference
but measures 16px. These are outside this performance change; no layout CSS was
modified. The broad browser run stopped after that failure, with 21 tests unrun.

DEV deployment uses rebuilt application images and the existing private runtime
configuration. Candidate API readiness and anonymous denial were checked before
replacement. The normal container helper rejected its historical schema baseline;
that baseline was preserved. No schema migration or permission grant was applied.
Current-schema qualification and rollback Compose/image manifests are retained
privately under `~/.athyper/instances/dev/workspace/country-performance-20260930`.

## Initial deployment result and manual test entry point

**Ready for manual testing:** https://neon.dev.athyper.test/app/entity/country

Reference record: Afghanistan (`01a0d433-806b-7874-862d-49a9b955f6a1`).
Use the refreshed DEV owner/admin sessions or sign in normally. All six application
containers are healthy. Initial runtime/UI build source identity:
`f48fd7bec3daa066295eb0f14cf81394af773a1602fa51bad3827db3369ab579`.
The later comment/context deployment is recorded below.

| Request | Before | Final sequential probe |
| --- | --- | --- |
| Detail descriptor, median of 3 | 3427 ms | 194 ms (94% lower) |
| Record, median of 3 | 684 ms | 145 ms |
| List descriptor / list | 689 / 790 ms | 133 / 131 ms |
| Content search | 4282 ms | 183 ms (96% lower) |
| Thumbnail capability | 776 ms | 140 ms |
| File history | 403 | 200, 140 ms |
| Notifications / Inbox descriptors | 404 / 404 | 200 / 200 |

Every final API probe returned 200. Browser smoke checks rendered the actual list
and Afghanistan detail, opened Files, Comments, Activity, Notifications and Inbox,
and observed zero JavaScript errors and zero failed relay API responses. The
browser smoke is a basic flow check, not a claim that every manual acceptance
step above has been executed.

A separate probe overlapping browser navigation measured detail at
274 / 441 / 1453 ms and search at 707 ms; all requests still succeeded. DEV load
and IAM latency vary. These are small samples of HTTP elapsed time, not p95,
rendering latency, a load-test result or a guarantee of zero lag. Both runs and
the baseline are retained in [the sanitized evidence](country-performance-evidence-20260930.json).

Notifications release `89a2a795-af73-40a0-a093-a71d87078d13` and Inbox successor
`398747c8-5bb0-465d-9981-b6005a45f08d` were verified active in Studio, Neon and
Mesh through the existing authenticated publication workflow. Independent admin
author / owner review was preserved. The original stuck Studio deployment was
replayed with the composed production orchestrator after the pool fix; signature,
release approval and tenant checks were retained. New Inbox and successor jobs
activated normally through the queue.

An existing DEV recovery-job privilege problem (`current_principal_id_soft`) and
an unallowlisted BFF deployment-retry endpoint prevented automatic/API replay of
the old stalled job. No grants or relay bypass were added. This is a separate
operations follow-up; the published collections and normal new-publication path
are verified. The original historical schema-baseline mismatch also remains
visible to the standard workspace container helper.

## Follow-up: comment editing/history and initial request restarts

The shared comment admission path now resolves only the requested action and
reuses metadata/IAM evidence within that admission read. The actual command
transaction remains outside the evidence boundary. Ownership, audience, stored
record association, mention validation and optimistic revision checks remain.
Collaboration responses now include total `Server-Timing`.

The Neon Entity route adapter waits for initial work context before mounting
record content, using the existing context gate. The same boundary applies to
catalog detail fallbacks. List loading keeps its existing behavior. Organization
catalog requests wait for the resolved context/preference key. Real context
changes still reset the record workspace.

Before deployment, authenticated history probes measured 838 / 831 ms. Three
edits of a temporary private plain-text comment measured 789 / 883 / 831 ms.
The fixture was removed; an intentionally stale edit returned 409. This simpler
fixture is a controlled comparison, separate from the 1.72-second HAR edit.
Three cold browser runs reproduced a cancelled descriptor/record pair and two
organization-catalog requests on every load.

Repeat read-only history checks with the refreshed saved Neon admin session:

```sh
node tooling/scripts/verification/verify-entity-comments.dev.mjs \
  --record 01a0d433-806b-7874-862d-49a9b955f6a1 \
  --comment 01a0e462-e848-7ce0-a928-ec74ae79371f \
  --comment 01a0e4c0-d5b2-7542-af9a-471fc452f471
```

Add `--edit-fixture` to create, edit and remove a clearly labelled temporary
private comment. This opt-in check verifies revision increments, stale-write
409 and history preservation. It never edits existing comments. Normal audit
and deleted-comment history remain. Reports omit comment bodies and credentials.
Use `--plane`, `--state`, `--entity` and `--record` for another published entity.

Manual acceptance: hard-reload Country detail with Network recording enabled;
expect one successful descriptor/record pair and one organization-catalog request
under a stable session. Check an existing comment's history and edit your own
comment, including rich text/attachments. Confirm saved content, revision history,
private visibility and stale-edit conflicts. A genuine tenant/company switch
must still discard old record state. Compare equivalent cold/warm captures.

### Follow-up deployment and verification result

The follow-up build is deployed to the existing DEV application containers;
all six are healthy. Source identity:
`2961883e6d6577f062ac585441c0636f39e9bce8289d8ac216eff13b85b49698`.
The candidate API returned readiness 200 and anonymous Entity access 401 before
replacement. No schema or metadata publication changes were needed. Rollback
configuration and image identities are retained privately in
`~/.athyper/instances/dev/workspace/comment-performance-20260930`.

| Check | Before | After |
| --- | --- | --- |
| Existing comment history, two samples | 838 / 831 ms | 189 / 151 ms |
| Temporary comment edit, three samples | 789 / 883 / 831 ms | 163 / 181 / 162 ms |
| Edit median | 831 ms | 163 ms (80% lower) |
| Stale edit | 409 | 409 |
| Cold-load descriptor + record | Cancelled pair then successful replacements | One successful pair |
| Organization catalog per cold load | Two requests | One request |

All three cold browser runs after deployment contained exactly one successful
request for each tracked endpoint and no cancellations or JavaScript errors.
The list/detail, Files, Comments, Activity, Notifications and Inbox smoke check
also passed without JavaScript errors or failed relay API responses.

The temporary private-comment flow confirmed three revision increments and
retained history, then removed its own fixture. Existing comment content was not
modified. Edit timings are for the same plain-text fixture before/after, not a
replay of the rich-content edit in the HAR; timing still varies with payload,
attachments and load. Server processing now has a total timing header.

Validation: 67 collaboration tests, 27 capability-policy tests, three context
browser tests and one three-plane route-adapter browser test passed. Host,
collaboration, Neon app and Neon shell typechecks passed. The context tests cover
initial mount, real company changes, unsaved-work confirmation and running-command
protection. The existing broader-suite limitations above were not reclassified.

[Sanitized comment and bootstrap evidence](country-comment-performance-evidence-20260930.json)
contains both runs and cleanup results; it contains no comment bodies or session
credentials. Shared server admission changes apply across Neon, Mesh and Studio;
these authenticated timing and cold-load measurements were taken in Neon.
