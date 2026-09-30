# Generic Summary and advanced collaboration enablement

## Owner activation and blocked worker compilation

Fresh `platform.owner` password/OTP authentication verified at
2026-09-27T15:44:36.067Z. Policy `d0d42aa2-a76f-4c84-8835-7bc055b2be9b`
activated at version 1 with the same approved hash. The activation receipt is
`country-collaboration-successor-policy-activation-20260927.json`.

The first execute attempt failed before changing the draft:
`PUBLICATION_CAPABILITY_EXTRACTION_PROBE_FAILED`. A live synthetic request showed
that the parser returns HTTP 200 but escapes underscores in its text output.
Changed only the probe sentinel to `ATHYPERCONTENTQUALIFICATION`; the real parser
returned it, and the enrolled compiler fingerprint was unchanged at that point.
The strict expected-content check remains. Host typecheck passed.

The next execution passed real target prerequisites and returned HTTP 200,
`dispatched`, allocating release **4**, `2ce95226-0b30-4137-aaa0-3594ec946547`.
Worker compilation then failed with `ENTITY_CAPABILITY_INVALID`:
`country/operation: unregistered handler/permission for reply`. The closed worker
registry in `shared/publication/compiled-runtime.ts` still listed only basic
actions despite the advanced qualification and common permission mappings. This
was a missed integration boundary, not a user permission failure.

Corrected that product-free registry to include the implemented advanced actions.
Added tests that lower and compile the advanced declarations through the actual
worker registry on all three planes, then reject missing reply handlers and
download permissions. All 10 tests in the worker-adapter suite pass, as does host
typecheck. No grants, approved source or signed payload were changed.

**Not activated:** read-only inspection found zero release-4 publication artifacts
and release 3 active on Studio, Neon and Mesh. The diagnostic inventory is
`country-collaboration-publication-blocked-20260927.json`. Worker retries exhausted
with the registry error before this correction. No queue or runtime-table state
was manually changed.

The registry correction changes the compiler fingerprint from the enrolled
`d5c0c79639e3bcf73e4f0c9e36deadc09798dd11ad9402006135289372aa35b2` to
`66c40d30f00dacba8acc11cb5b4d74f6948bbc9e59ba13df3dbae6f551842906`.
The old approval cannot authorize it. Existing provenance recovery applies to an
already signed runtime artifact and is not suitable for this pre-artifact
failure. A governed failed-compilation retry/recovery with an independently
approved new compiler pin is needed; do not edit immutable release 4, reuse its
old compiler approval, pretend target heads reached 4, or restore BP.
Work stops at that new recovery-authority/design boundary. Signed-in processing
and feature acceptance remain pending.

## Admin proposal checkpoint

Fresh `platform.admin` password/OTP authentication verified at
2026-09-27T15:42:25.116Z. Compiler identity and all three release-3 predecessor
heads were unchanged. Initial proposal returned HTTP 500 while the control API
still had pre-change modules loaded; after restarting only that API, the same
candidate returned `pending_approval`. Proposal ID:
`d0d42aa2-a76f-4c84-8835-7bc055b2be9b`, version 1, hash
`6c89b8fcb1577cb3bec9b9c1edfd581ecee1d1f9a14410c51f7ca2d4f4398c17`.
The proposal receipt is `country-collaboration-successor-policy-proposal-20260927.json`.
Independent owner activation and workload execution remain pending. No successor
release or activation has occurred. The owner browser-login helper is started.

## Follow-up: BP-free host recovery and successor preparation

- Removed the unused host `entity-case-preflight.ts` adapter that imported the
  deleted BP repository. No BP implementation or metadata was restored. Generic
  scope and backend authorization remain unchanged. Historical BP harnesses are
  retired references, not generic-runtime verification tools.
- Host typecheck and build now pass. Fresh host tests: **685 passed, 25 skipped**.
  Experience tests: **145 passed**. Authoring tests: **204 passed**, including
  five new narrow-amendment tests; source and test typechecks pass. Capability
  qualification tests: **16 passed** (included in the host suite).
- Recreated only DEV API/worker with their existing complete Compose overlay
  set. Both are healthy; the worker now has preview and parser endpoints. This
  is configuration readiness, not proof of an uploaded file's processing.
- Captured release 3 and all three activation heads read-only. Rehearsed the
  collaboration-only successor amendment in a rolled-back transaction, then
  persisted draft `0ae377c2-c1d3-4bfc-b87b-30d021426448`, revision 2. Replay and
  stale-predecessor rejection passed. Only `comments` and `attachments` were
  amended; no Summary cards, fields, operations or navigation were invented.
- Prepared `country-collaboration-successor-policy-candidate-20260927.json` with
  exact source/compiler/predecessor pins. It is structurally valid but **not
  proposed, approved, signed or activated**. Baseline and draft receipts have the
  same `country-collaboration-successor-` prefix in this report directory.
- Both saved platform-control sessions returned HTTP 401 `AUTH_TOKEN_INVALID`.
  Fresh real `platform.admin` proposal and independent `platform.owner`
  activation are required before workload execution. No authentication evidence,
  policy approval or grant was manufactured. No need to restore BP or obtain
  another model's help to address this authentication gate.

Next: refresh the control sessions using the existing browser password/OTP
helper, recheck compiler/source/head pins, propose and activate this exact policy,
then run normal workload publication and inspect three activation receipts.
Live authorized upload → scan → preview/extraction → content-search acceptance,
cross-tenant denial and draft/upload preservation remain pending. Release 3 and
all business records remain unchanged. The earlier checkpoint below is historical;
its build/configuration blockers are superseded, not its activation limits.

## Implemented source changes

- Normalized generic detail and legacy compiled record composition share the lazy
  Summary panel. Content remains present; Section and Summary are independent
  settings. Requests abort on close/unmount and data is isolated by session scope,
  record and resource context. Loading, empty, context-required, per-provider
  failure and retry states are supported.
- Normalized signed runtime contracts resolve Summary without requiring the old
  presentation-surface artifact. Discovery requires a registered provider with an
  explicit authorization callback and current parent admission. Reads reauthorize
  against one resolved signed release. Unsupported/denied cards are omitted.
- The optional generic `platform.record.identity.v1` provider reads only published
  title/code/context fields through the authorized query service. Shared-reference
  authoring accepts optional `summaryView`; Country declares no cards, so it does
  not gain a meaningless Summary panel. Domain-specific summary providers remain
  host registrations, not executable metadata or copied BP code.
- Common collaboration actions now have exact action/permission/handler mappings.
  Advanced actions reuse existing collaboration permission codes, not reference
  read permission or a namespace-wide grant. No role grants were changed.
- Country's successor **source candidate** enables replies, reactions, mentions,
  durable drafts, reporting, history, folders, rename, versions, preview,
  extraction and content search. Private default, public/private audience choices,
  5 MiB/file, three files, allowed types and mandatory scanning remain unchanged.
  Duplicate handling remains reject; new versions are explicit.
- Publication qualification checks callable actions, live catalog membership,
  tables/RLS and required privileges, processing columns, storage/scanner probes,
  real preview conversion and text extraction plus configured schedulers. An
  unavailable provider fails qualification; no signed artifact is patched.
- DEV preview overlay now supplies the qualified parser endpoint and bounded
  extraction limits to API and worker, matching the existing processing overlay.

## Verification

- Publication contracts: 137 tests passed.
- Studio authoring: 199 tests passed, including deterministic preservation of
  historical reviewed candidate hashes and advanced source compilation on all
  three planes.
- Experience/runtime: 145 tests passed, including normalized Summary authorization,
  release/scope checks, provider isolation and safe identity projection.
- Capability prerequisite qualification: 16 tests passed, including all three
  planes and failed conversion/extraction/missing-provider rejection.
- Attachments: 92 tests passed. Collaboration service: 63 tests passed.
- Entity list/detail service: 15 tests passed.
- Browser regressions: all 92 distinct tests across record navigation, collaboration
  modes, comments and files passed across focused runs. Two older tooltip tests
  were updated to dismiss a deliberately focused tooltip before the next action,
  matching the established Escape-first-tooltip behavior. New Summary tests cover
  lazy reads, independent Section setting, disabled/absent Summary and cancellation.
- Real local provider probes passed: PDF/image thumbnails and PDF previews (four
  HTTP 200 results); encrypted PDF, over-limit PDF and Office rejection (three
  HTTP 422 results); PDF extraction, image OCR and the 20-page extraction bound.
  Synthetic fixtures only; no business files were changed.
- Read-only catalog inspection found the ten checked advanced collaboration
  tables with RLS enabled in Neon, Mesh and Studio. This was database-owner
  inspection, not proof of effective end-user grants or live action acceptance.
- Form-detail, experience, records, authoring and publication-contract typechecks
  passed. Host-wide typecheck remains blocked by the unrelated missing
  `KyselyBusinessPartnerCaseRepository` export used by `entity-case-preflight.ts`.

## Activation and acceptance boundary

**Not published or activated. Existing signed releases and business data were not
modified.** Offline preparation reports `unsigned_candidate` and
`requires_signed_split_artifacts`. No successful end-to-end live Country upload,
scan, derivative, extracted-content search or tenant-user action is claimed here.

The running DEV API and worker had preview configured but no `DOCPARSER_URL`.
The corrected source overlay has not been applied by container recreation, to
avoid restarting the host while its unrelated build error remains unresolved.
Real parser probes reached the existing qualified service directly; they do not
prove that the running worker has started consuming extraction jobs.

Remaining activation sequence:

1. Resolve the existing host build/export inconsistency and apply the reviewed
   DEV overlay to API/worker; verify their effective configuration and health.
2. Run the governed successor publication with the new live prerequisite checks.
   Preserve release 3 and all previous signed releases; no runtime table edits.
3. Accept the activated feature set as authorized Athyper and CirrusAtlantic
   users on each plane: clean upload → scan → preview/extraction → content search,
   processing failures, denied downloads/snippets, cross-tenant/parent denial,
   ownership, drafts/uploads across modes and keyboard/focus restoration.

Country still requires an explicit useful Summary declaration before a Summary
setting should be shown. Contact/address/governance summaries for other entities
require their corresponding registered, authorizing domain providers.
