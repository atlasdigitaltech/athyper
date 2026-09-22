# Phase 1: comments and attachments code review

Date: 2026-09-22. Scope: the supplied CA-00–CA-08 implementation checklist. Phase 2 visual/UX redesign has not started. Browser changes in this review concern upload correctness and opaque revision tokens only.

**Assessment: several security and durability defects are fixed, but the checklist is not sufficient evidence of production readiness. The remaining findings below prevent phase 1 sign-off.**

Baseline HEAD: `47fb08a74358c146d906f2f90b0a92f7debbe777`. The workspace already contained extensive tracked and untracked work. Its tracked patch, status and untracked inventory were captured under `/tmp/athyper-phase1-review/`; no reset, checkout, commit, release activation or application-database deployment was performed. Other work changed the same workspace during review, including preview/search metadata and host composition. Validation therefore describes the observed workspace, not an isolated immutable release candidate.

## Findings fixed in this review

| Severity | Trigger and consequence | Implemented correction |
| --- | --- | --- |
| High | Rename/category bodies could override the path attachment ID used for admission while the mutation still used the path ID. | Path IDs take precedence. Rename/archive use the same parent-scoped admission as other record operations. Regression coverage exercises conflicting IDs and scoped permissions. |
| High | Category/folder/version operations could admit stored record A while retaining caller-supplied record B for mutation. | Extracted a testable host admission boundary. Supplied owner coordinates must equal stored owner coordinates. Caller-supplied comment audience evidence is discarded. |
| High | Download admission could use stale attachment metadata after the last association disappeared. | Non-uploaders require a persisted record or comment association; owner-scoped draft access remains distinct. |
| High | An owned, draftless file from another record could be attached to a comment. SQL also did not explicitly require a clean scan. | Association and its fallback lookup require matching stored record coordinates, active state, uploader ownership and completed scanning. Verified against PostgreSQL through `athyperapp`. |
| High | Generic attachment creation dropped the admitted draft ID and could create a record link instead of a private draft upload. | Generic staging preserves the draft ID. Staging admission rejects expired drafts. |
| High | Generic rename returned the whole internal attachment record, including its storage key. | Generic rename projects only attachment ID, series ID and display name. |
| High | Finalization admitted policy before a potentially lengthy scan but did not re-admit current record access/policy before committing. | Direct and generic paths provide a post-scan admission callback. Commit also checks cancellation. A revoked-policy regression verifies no quota or clean-byte commit. |
| High | Purge swallowed object-store deletion errors, overwrote the original storage key and reported success, preventing recovery. | Storage errors fail the job before the purge marker, quota release or success event. Original keys remain retryable. |
| High | Purge checks occurred in separate transactions; series-level retention was not loaded by the production repository. | Maintenance loads lock attachment and series; checks, object deletion and the durable marker share one transaction. Effective retention includes the series. Link/hold inserts with parent FKs and series retention updates serialize against these locks. This is not an atomic transaction across PostgreSQL and object storage: a DB failure after object deletion still requires an idempotent retry. |
| Medium | Completed purge markers and currently ineligible records could occupy bounded reconciliation batches indefinitely. Deferred successful jobs retained their deterministic job IDs. | Candidate queries exclude purge markers, linked series and active series retention. Purge replay is a no-op. Successful purge jobs are removed from the queue so deferred work can be submitted again; failed jobs remain operator-visible. |
| Medium | Final context unlink orphaned only the selected version, leaving older active versions outside maintenance. It also emitted only one of the promised unlink/orphan events. | Every active version in a now-unreferenced series becomes orphaned. The transaction records unlink and, when applicable, orphan events. PostgreSQL verifies a two-version series. |
| Medium | Version staging looked up the new nonexistent ID and validated the old file's MIME/size. Shared concurrency validation ignored the actual version/rename fields. | Admission loads the parent but validates the new bytes; version policy uses `expectedSeriesVersion`. Repository staging also checks the parent's record and clean state. The content-version route carries the required expected version. |
| Medium | Rename compared a JavaScript millisecond timestamp to a PostgreSQL timestamp that can contain microseconds. | Readers issue the existing integer `series.revision_no` as an opaque string. Rename compares and increments it atomically; version promotion increments it too. Real SQL verifies successful rename and stale-token rejection. Existing browser caches need refreshing after deployment. |
| Medium | A lost finalize response followed by failed recovery caused a retry to stage an already-active attachment, which correctly rejects new PUT URLs. | Both the shared composer client and record upload queue probe status before retrying stage/PUT. An active outcome completes the retry; an unavailable outcome is not mistaken for permission to restart. The shared client has a network-loss regression. |
| Medium | A legitimate collaborator's status request hit an uploader-only lookup before record admission. | Legacy/Atlas checks are lazy. An admitted entity request uses a dedicated authorized status read; legacy owner checks remain intact. |
| Medium | Original download URLs did not request safe response headers. | Original downloads explicitly request binary attachment disposition with a sanitized filename; preview remains a separate protocol. |
| Low | Non-finite or fractional upload sizes passed the shared policy's numeric comparison. | Policy requires a safe integer byte count. |

## Remaining production blockers

These are confirmed source gaps, not completed work or hypothetical risks.

1. **Folder concurrency and command idempotency are incomplete.** `entity-capabilities.ts` requires revision concurrency for `folder`, and `entity-capability-policy.ts` enforces it. `createFolder`, `move` and `deleteFolder` in `compiled-section-content.tsx` do not send that revision. `AttachmentRepository.manageFolder` has no revision input or compare-and-swap. Supplying a dummy number would satisfy the gate without providing concurrency protection. Folder creation also generates a new ID when the caller does not provide one; the direct route does not persist an idempotency receipt. The required fix is a consistent folder/association revision and command-receipt contract through metadata, reader, routes, repository and browser, with concurrent move/delete and lost-response tests. Do not work around this by adding a constant revision or weakening admission.

2. **Removing a file from an edited comment does not schedule its eventual cleanup.** `replaceRelations` deletes old comment attachment links and inserts the selected set, but does not transition newly unreferenced series to orphaned state. Their draft marker has already been cleared. The retention candidate queries only consider expired/deleted/orphaned rows. Such active, detached objects can therefore remain indefinitely. Reconcile removed versus retained series in the association transaction, preserve other references/holds, and record durable orphan intent. Cover removing the final pin, retaining a pin and another comment sharing the series.

3. **Object cleanup is incomplete beyond the original file.** `purgeAttachment` deletes the original key. Failed-finalization candidate cleanup and staging-source cleanup still swallow deletion failures without persisting the failed key. Generated derivative keys are not included in the purge manifest. Add durable cleanup intent or a bounded object inventory reconciler covering candidate/staging/derivative objects, with storage failure/restart and retained-reference tests. The purge fixes above prevent false success for the original; they do not claim to solve every object orphan.

4. **Some declared attachment idempotency is nominal.** The stage/finalize identities are durable, but category/folder commands do not consume a command receipt. Category events use a static attachment/category event key, so cycling between categories can reuse an earlier event identity. Specify replay/conflict behavior for each declared action and tie events to accepted command/revision identities. Repeated commands must not create duplicate folders or lose distinct category transitions.

## Verification

The new PostgreSQL fixture is `server/db/scripts/tests/integration/collaboration-phase1-review.ts`. It refuses containers outside the designated disposable naming/label contract, uses `athyperapp`, and rolls back all fixtures. It verifies foreign-record association rejection, successful same-record association, two successive rename revisions, stale revision rejection, effective series retention, candidate exclusion and orphaning all versions after final unlink.

The existing `entity-collaboration-ca02.sql` fixture also passed on the disposable Neon database: revisions, transactional capture, canonical reports and same-/cross-tenant application-role visibility. This review did not recreate all three planes or replay migrations.

Focused validation passed during the review:

- Attachment service tests, including route identity, purge retry, cancellation and post-scan admission regressions.
- Collaboration service/repository tests.
- Experience policy/resource tests.
- Extracted host attachment-admission tests.
- Shared attachment client coordinate and uncertain-outcome retry tests.
- Attachment, collaboration, collaboration UI and form-detail TypeScript checks.
- Real PostgreSQL checks described above.
- `git diff --check`.

Broader validation observations and final counts are recorded below. No source validation is a claim about the currently deployed release, live object storage, malware provider qualification or end-to-end browser behavior. Phase 2 remains deferred.

### Final observed validation results

| Check | Result |
| --- | --- |
| Attachments package | 71 tests passed |
| Collaboration package | 52 tests passed |
| Experience package | 100 tests passed |
| Publication package | 206 tests passed |
| Host package, broad run | 487 passed, 1 failed, 1 skipped; the failure was the search-readiness expectation |
| Host readiness test file after concurrent correction | 15 tests passed |
| Extracted attachment admission (included in host count) | 8 tests passed |
| Shared client network/coordinate regressions | 2 tests passed |
| Host and experience source typechecks | Passed |
| Attachments and collaboration source/test typechecks | Passed |
| Collaboration UI and form-detail typechecks | Passed |
| Disposable PostgreSQL application-role review fixture | Passed; fixtures rolled back |
| Existing CA-02 PostgreSQL revision/report/RLS fixture | Passed; fixtures rolled back |

The earlier registry mismatch and unrelated workforce interface type errors disappeared as concurrent workspace edits landed; the final publication and host typechecks passed. The full host suite was not rerun after its readiness test correction; only the affected 15-test file was rerun. Review logs are under `/tmp/athyper-phase1-review/`. The four remaining source findings above are independent of those passing checks and must be resolved before production sign-off.
