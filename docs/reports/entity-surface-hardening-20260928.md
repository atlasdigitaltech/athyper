# Entity surface hardening — 2026-09-28

Status: implemented and locally verified in the working tree. No publication,
activation, database migration, QA operation, or signed-payload edit was performed.
Existing Country release settings, audience defaults and capability limits are unchanged.
No Business Partner metadata was introduced.

## Correctness and security

- Optional list URL state falls back to validated defaults on invalid typed values.
  Descriptor validation and saved-base validation remain outside that recovery boundary;
  invalid metadata is not silently accepted. Existing per-filter normalization remains.
- Repository writes map only declared logical field keys. Unknown keys and undeclared
  raw storage columns fail with `RECORD_INPUT_FIELD_UNKNOWN` (400) before SQL. Tenant
  injection, version increments, existing writable-field authorization, and transaction
  boundaries remain server-owned.
- Metadata field patterns use one bounded validator at descriptor admission and record
  validation. Compilation and signed target admission both reject unsupported patterns.
  Pattern source is at most 256 characters, anchored, and limited to concatenations of
  literals, classes, approved escapes and repetitions. Groups, alternatives, backreferences,
  lookarounds and competing variable repetitions are rejected. Fixed repetition minimums
  are capped at 256 and maxima at 4096. Patterned inputs are capped at 4096 characters
  (or the lower declared maximum); length rejection skips matching entirely.
  Error code: `METADATA_FIELD_PATTERN_INVALID`. This deliberately narrows authoring syntax:
  arbitrary JavaScript regexes are not supported. Complex future requirements should use
  a separately qualified linear-time engine or typed validator, not relax this guard casually.
- Publication workload routes authenticate both mounted credentials, establish the verified
  workload identity, then pass through the existing authenticated tenant/principal limiter
  before database reads or execution. Existing source limiting, policy pins, IAM checks,
  revocation checks and maker/checker separation remain. No new authorization grant is
  inferred from request context; no new independent limiter was invented.
- Record navigation delegates tab and section selection to its owner, with one history
  writer. An explicit section selection produces one push; Back/Forward restore it.
- Comments and Files reject invalid collection envelopes. Individual malformed rows are
  excluded, valid rows remain visible, and a localized partial-response warning is shown.
- Preview state uses the validated, canonical URL. Same-origin, non-HTTPS and executable
  URLs remain rejected. No unqualified iframe sandbox flag was added. The existing PDF
  strategy is isolated-origin delivery of scanned raster-only derivatives, no-referrer,
  short leases and reauthorization, documented in
  `deploy/config/preview-renderer/README.md`. A sandboxed native-PDF viewer is not a newly
  supported mode; broad browser PDF compatibility was not requalified in this pass.

## Shared UI foundation

- Corrected three record CSS token references; removed CSS-generated “Controls” copy and
  rendered the localized label in JSX.
- Added reusable safe optional browser storage helpers; migrated list preferences, filter
  recents and entity lookup recents. Disabled storage, SSR and quota errors do not become
  application failures. Preferences remain distinct from protected record data.
- Added reusable render error containment to list/detail surfaces, with safe localized
  fallback and retry. Detail reset identity includes tenant, principal, authorization epoch,
  entity and record. Async errors remain the responsibility of request handlers.
- Localized import workspace chrome and export validation/status/error messages in the
  existing English/Malay/Arabic catalogs. Import descriptor requests now abort on cleanup;
  locale changes do not restart the request or discard the wizard.
- Form/detail request failures use the shared safe error mapping rather than raw exception
  text. This is an incremental migration: remaining wizard labels and unrelated legacy
  surfaces are not claimed to be fully localized or storage-migrated.

## Verification

| Check | Result |
| --- | --- |
| Publication service suite | 368 passed |
| Records service suite | 313 passed; 3 existing skipped |
| Metadata contract suite | 63 passed |
| Metadata platform suite | 83 passed; 2 existing skipped |
| Publication workload route suite | 8 passed |
| List URL/descriptor contract suite | 16 passed |
| Country detail/collaboration browser suite | 23 passed |
| Metadata navigation browser suite, including two new checks | 14 passed |
| Surface hardening, file discovery and tooltip browser suites | 60 passed |

Publication regression independently simulates an older compiler accepting an unsafe
pattern, signs the resulting self-consistent publication with a real Ed25519 key, and
asserts target rejection with `RUNTIME_INCOMPATIBLE` caused by
`METADATA_FIELD_PATTERN_INVALID`. The workload negative test proves throttled requests
perform no database work, while invalid credentials remain unauthenticated.

Browser coverage includes malformed rows/envelopes, safe boundary reset, denied storage,
canonical preview URLs, light/dark/high-contrast themes, forced colors, Arabic/RTL,
tenant switches, drafts, file history refresh, full/side transitions and tooltips.
The older navigation fixture was corrected to lower authoring localized labels to the
string-label presentation contract; compiled localization retains separate Country tests.

Typechecks passed for UI, list, detail, collection controls, metadata, records, publication
and the platform host. Relevant whitespace checks passed.

Fresh controlled detail-hook measurement (12 runs): median 70.76 ms, p95 71.30 ms.
The performance gate passed using that fresh measurement and the existing 10,000-series
attachment report. Attachment SQL/indexes did not change and were not rebenchmarked.

## Rollout boundary

Deploy compatible server/UI changes through the existing workflow. Publication/compiler
changes must undergo normal fingerprint qualification before any successor publication;
do not edit accepted signed payloads or bypass approvals. No successor is needed merely
to change browser error presentation. Broader localization and native-PDF browser-matrix
qualification remain explicit follow-up scope, not silently reported as completed.
