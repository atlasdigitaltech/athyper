# Entity collaboration acceptance — 2026-09-28

## Author-name resolution correction

The generic comment provider now resolves root/reply authors and reply-parent
names through exact-ID calls to the existing tenant/membership-scoped
`document.collaboration_principal_candidates` function. Direct principal joins
were self-only under RLS and returned NULL to other readers, triggering the
Participant fallback. No new directory function, grants or metadata were added.

Eight provider regression tests passed, including display-name projection,
missing-name fallback, scoped lookups and retained comment visibility predicates.
Read-only PostgreSQL verification under `athyper_runtime` with catl.owner's
tenant/principal context returns Catl Admin for the existing public comment;
the same direct principal read still returns zero rows. Athyper tenant lookup
of that author returns zero names. The transaction rolled back. Live catl.admin
API read also passes. Owner's saved browser session remains anonymous, so a
signed-in owner browser retest is not claimed.

## Search correction and isolation follow-up

The shared search query now selects the UUID `a.id` without casting it to text,
matching DISTINCT ordering and the existing UUID cursor predicate. Live Neon
search returned HTTP 200 and found synthetic attachment
`54c350d2-9590-403f-b7a6-d471425b82b2` using its unique content-only marker.
The earlier HTTP 500 described below is fixed; tenant/parent/scan predicates and
per-result download admission were not broadened.

Search failure now reuses `PanelEmptyState` with the same `a-files-empty-state`
card as no-matching-files, icon, title, description, shared Retry search and
Search file names buttons. Duplicate status text was removed. Two browser
regressions passed at 390px and 1440px, including keyboard retry and recovery.
Attachment-service tests: 93 passed; form-detail typecheck passed.
Attachment-service source/test typechecks also passed. In the live signed-in
Neon browser at 550px, an explicitly intercepted simulated HTTP 503 displayed
the styled alert card; after removing interception, Retry search reached the
real backend, found the test document and removed the error card. This separates
failure-presentation simulation from successful real content-search execution.

Isolation evidence (read-only database checks, not signed-in second-user tests):

- The exact synthetic comment/file exist in Neon only, not Mesh or Studio.
- Under `athyper_runtime`, Athyper tenant context sees zero rows for both IDs;
  the CirrusAtlantic positive control sees one of each. Transaction rolled back.
- This matches `entity-comments-and-attachments-design.md`: no automatic
  cross-plane sharing. Entity-definition publication does not replicate content.
- Saved Neon athyper.admin/catl.owner and Mesh/Studio catl.admin sessions still
  return anonymous. Signed-in foreign-tenant/second-user/other-plane acceptance
  is not claimed. No grants, sharing rules or metadata were changed.

## Live Neon result after session capture

At 2026-09-27T16:35–16:41Z, verified elevated CirrusAtlantic catl.admin
(`cca94907-7519-5871-8e3c-6b11aa545c93`) exercised Country
`01a0d433-806b-7874-862d-49a9b955f6a1` through the real Neon BFF.
Both collaboration resources returned release 4 and authorized advanced actions.

Passed live:

- Comment creation, threaded reply and reaction: HTTP 201.
- Own-comment edit: HTTP 200/revision 2; stale revision rejected with HTTP 409
  `COMMENT_EDIT_CONFLICT`; history returned revisions 2 and 1.
- Supported synthetic PDF upload/finalization: HTTP 201/200, active status,
  text extraction `extracted`.
- Generated PDF preview: `ready`; signed delivery HTTP 200, 34,356 bytes.
  The real browser displayed its document-preview iframe, fetched the PDF with
  HTTP 200 and returned to Files. Initial image-only test selector was corrected
  to the PDF iframe; it was not an application preview failure.
- Unsupported compressed-object PDF rejected at finalization with HTTP 422
  `MALWARE_DOCUMENT_UNSUPPORTED`. Subsequent download returned HTTP 410
  `ATTACHMENT_DOWNLOAD_UNAVAILABLE`, without issuing a URL. No scanner bypass.

Failed live:

- `POST /api/attachments/search` returned HTTP 500 `INTERNAL_ERROR` for the
  unique marker present in the supported PDF's content, not its filename.
- API logs locate the failure at
  `server/packages/services/attachments/src/attachment-discovery-routes.ts:78`:
  `for SELECT DISTINCT, ORDER BY expressions must appear in select list`.
  The query selects `a.id::text` but orders by `a.id` (UUID). These are different
  expressions under PostgreSQL DISTINCT rules. This is a shared query defect,
  not missing metadata or failed extraction. Runtime code was not changed during
  this acceptance task. A fix must retain UUID cursor ordering, tenant/parent
  filters, scan checks and per-result download authorization.

Reproduction data retained (only synthetic test data was changed):

- Supported PDF: `54c350d2-9590-403f-b7a6-d471425b82b2`,
  `acceptance-54c350d2.pdf`; content marker
  `COLLABACCEPTANCEBBFFFAEC5B5548749DD641BE19712DD9`.
- Rejected staged PDF: `7913fab7-4aac-4ce2-bbf6-12e2e5483747`.
- Test root comments: `01a0e3ba-df1a-757b-8c99-fa6687e952f9` and
  `01a0e3bb-4b43-705a-b859-55eef3f09234`.
- Test replies: `01a0e3ba-df84-7f14-8f9c-5478e61f8169` and
  `01a0e3bb-4b9e-761f-a257-bfc57b01426a`.

No existing user files/comments were modified. The generic live harness is
`tooling/scripts/verification/qualify-entity-collaboration-live.mjs`; it creates
new labeled fixtures on each run. Its initial CSRF-cookie lookup was corrected
for development cookie names before writes succeeded.

Still pending: search after correction; live drafts/mentions/reporting,
folder/version/rename and interrupted-upload checks; a second user for ownership
denial; Athyper tenant and Mesh/Studio acceptance. Their saved sessions were
rechecked and remain anonymous. The historical session gate below is resolved
only for Neon catl.admin. The 47 fixture checks are not a substitute for these
remaining live checks.

Country release 4 is active on Neon, Mesh and Studio (see compilation recovery
activation baseline). This report distinguishes fixture regressions from live
signed-in acceptance; a passing fixture is not proof of file processing.

## Shared browser regressions

22 Playwright checks passed across detail collaboration, panel modes, entity
wiring, pagination and tooltips. Coverage includes draft preservation across
mode/tab/history changes, keyboard focus/restoration, resize persistence,
responsive layout, consistent full-view edges, lazy capability loading and
denied-capability UI. These use fixture sessions and responses.

Another 25 comment action/composer browser checks passed: reply pagination,
mention matching, autosave, attachment previews/focus restoration, reaction
counts, report/history dialogs, audience restrictions, edit failure retention,
explicit folder/category saves and deletion confirmation. Total: 47 fixture
browser checks passed. Actual preview processing and content indexing are not
covered by these mocked responses.

## Live session gate

Existing saved application sessions were checked using the real
`/api/auth/session` endpoint for Neon catl.admin, Neon athyper.admin, Mesh
catl.admin and Studio catl.admin. All returned HTTP 200 with state `anonymous`.
Refresh attempts returned HTTP 403 and remained anonymous. No configured
Playwright login credentials were available in the execution environment.
Platform-control publication approval sessions are not application sessions.

No comments, attachments, folders, business records or grants were created,
changed or deleted during these checks. Live acceptance is blocked on a fresh
application browser capture, not claimed as passed.

## Remaining live matrix

- Verify tenant/principal and Country release 4 descriptor/capabilities in each
  plane; use both CirrusAtlantic and Athyper on Neon.
- Create clearly labeled synthetic comments/files only through authorized APIs
  or UI. Record their IDs for cleanup through supported operations.
- Exercise replies, reactions, edits/history, drafts, mention discovery and
  reporting where the signed capability and current permissions allow them.
- Verify folders, rename, versions and concurrency/ownership denials with a
  second authorized account; do not expand grants to make a test pass.
- Upload supported harmless content, observe scanner and processing completion,
  open generated preview, and find a unique marker present only inside the file.
- Check unsupported/failed processing states and prohibited delivery, including
  foreign-tenant access denial. Do not download existing user content for tests.
- Verify drafts/uploads survive panel mode changes and keyboard focus behavior
  against the deployed application, rather than fixture responses alone.

Use the existing interactive capture helper from a graphical repository terminal:

```sh
node tooling/scripts/verification/capture-atlas-elevated-session.cjs --environment dev --plane neon --actor catl.admin --fresh
```

It verifies the selected tenant/principal, lets the user complete password/MFA
in the issuer UI, and saves session state privately. Do not paste credentials,
cookies, tokens or MFA values into chat or retained reports.

## Composer link correction and Public default source change

The link form's synthetic clipboard adapter returned ordinary text for the
internal rich-document MIME type, causing JSON parsing of URLs. It now supplies
only HTML/plain text, preserves selected text, validates HTTP(S) URLs, and reports
insertion failures inline. Cancel/Escape restore editor focus. The URL field is
bounded to 28rem with adjacent, wrapping actions and shared spacing tokens.

Country's source `capabilities.json` now declares `defaultAudience: public`.
Existing draft precedence and reply audience restrictions are unchanged. This
source amendment is **not a publication receipt**: a signed successor must be
approved and activated before the live metadata-driven default changes. No
existing signed payloads, comments, drafts, or BP definitions were modified.

## Deferred follow-up: file categories on another entity

User requested deferring this live test until another entity is selected.
The Country screenshot shows the General/Evidence category filter but no
“Set category” file action. The UI exposes assignment only when the attachment
capability includes `category`; the reason for its absence in the live session
has not been verified. Do not change Country capabilities as part of this note.

For the later test, select an entity whose capability and user permissions allow
category assignment. Verify “Set category” → General/Evidence → Save, persistence
after refresh, filtering by the saved category, and independence from the file's
folder. Also verify that users without the assignment capability cannot change
categories. This follow-up has not been run.
