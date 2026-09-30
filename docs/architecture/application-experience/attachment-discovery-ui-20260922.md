# Attachment discovery UI — 2026-09-22

Implemented a single discovery area for Files in the reusable collaboration panel.

- Prominent File names / File contents scope selection, with a remembered preference.
  Name/type filtering applies to loaded files; content search uses the existing exact
  record-scoped API and cursor. Folder/category filters remain browsing filters, are
  retained while searching contents, and are restored on Clear search.
- Content results replace the browsing list, with safe text highlighting, three-line
  excerpts, Show more, type labels, thumbnails and immediate Preview/Download actions.
  Counts describe returned matches (loaded matches while a cursor remains), not an
  invented server total. No page locations or file sizes are inferred from snippets.
- Upload, upload limits, New folder and Filters share a compact toolbar. Active filters
  have removable chips. Upload validation, retries, duplicate/version choices and
  queue handling use the existing upload component. Empty/drag states expose a larger
  drop target. Processing guidance appears only when loaded files have pending states.
- The side panel/mobile drawer opens one focused viewer with Back to results, restoring
  query, filters, scroll and focus. Full view places a single selected viewer beside
  results when enough width exists; constrained content widths stack it above results.
- Aborted/obsolete search responses cannot replace newer results. Clear search, error,
  retry, empty and pagination states are explicit. Snippets render as React text, never
  interpreted HTML. Closing the viewer unmounts preview delivery and renewal.
- Removed the obsolete independent text-search component. Authorization, extraction,
  scan policy, preview qualification and existing typography/theme colors are unchanged.

Validation:

- Both form-detail and business-partner package TypeScript checks passed.
- Ten focused browser tests passed, including existing collaboration/comment actions
  and new search scope, safe highlighting, cursor pagination, stale response rejection,
  errors, empty results, filter/query retention, keyboard focus and narrow-width checks.
- Signed-in local acceptance searched `instarem` in the Business Partner record, opened
  an actual authorized PDF preview and verified its response/PDF signature, switched
  side/full/mobile modes, returned to the results and confirmed the preserved query.
- Inspected 1440px desktop and 390px mobile screenshots; checked no horizontal overflow
  in mobile full view or the drawer. Upload mutations were not repeated in live data.

## Drop-zone alignment follow-up

- Replaced the compact upload button with an always-visible dashed drop region, a
  browse picker and concise file requirements. Dropping works anywhere within the
  region, including its guidance; nested drag events retain a stable highlight.
- Search and upload sit beside each other on wide content layouts and stack on narrow
  content/drawers. File-management actions occupy their own aligned row. Search scope
  options share a common baseline. Typography and theme tokens are retained.
- Empty drops are ignored; additional drops during an active upload explain that the
  user should wait. Existing file type, size, batch, scan and finalize rules still apply.
- Eight browser tests passed, including a synthetic DataTransfer drop through the
  mocked staging/finalization API and intercepted byte PUT, invalid-file rejection,
  nested drag highlighting and mobile overflow checks. TypeScript passed. Signed-in
  search/preview acceptance also passed and desktop/mobile screenshots were inspected.

## Compact actions follow-up

- File rows align type icon, two-line filename/metadata, and Preview/Download/More in
  one row. On very narrow lists the action group wraps below metadata. The filename
  has a focus/hover tooltip; each row has an accessible filename group label.
- Shared FileAction buttons use existing theme tooltips and 44px targets. Labels appear
  in content mode when the containing list is wide enough; icons remain in the drawer
  and narrow content/preview layouts. Toolbar folder/filter and preview-close actions
  use the same component. The active filter count remains visible.
- Overflow actions retain text and now include icons and separators between version,
  organization, sharing and removal actions. Existing confirmations remain unchanged.
- Added determinate upload progress and indeterminate scanning/finalization progress.
  The persistent drop zone remains visible and file validation is unchanged.
- Verified package typechecks, responsive icon/label switching, focus tooltips, touch
  target dimensions, overflow-menu Escape/focus return, and mobile overflow. Signed-in
  search and PDF preview checks passed; inspected compact side and full-view file rows.

## Empty states, file types, version lifecycle and preview-close correction

Reviewed the supplied 54-second recording at
`/home/chandravel_natarajan/work/experiments/Recording 2026-09-22 174053.mp4`.
The URL retained `file=` while the preview was dismissed/reopened. The file-list effect
reapplied that selection on every refreshed items array. Closing now removes the query
parameter with replaceState; initial deep links are applied once, with explicit browser
history navigation still supported. Mode switches and resource refreshes no longer undo
an explicit close. Clear search also removes the preview deep link.

Added centered initial-content-search and no-files guidance, broad extension-based
file icons with MIME fallback, Cancel upload for each duplicate decision, and Dismiss
completed uploads. Cancelling a duplicate removes only that pending choice and performs
no staging or upload. Icons do not grant format/preview support.

Lifecycle findings: each clean retained version can remain active. The series pointer
selects the current version; a record/comment can instead pin a particular version.
History now distinguishes Current/Pinned, Previous and Pending versions from lifecycle
availability. Active historical versions expose authorized download actions. Preview
continues to require the version linked to the record, respecting the existing preview
query's current/pinned constraint. No lifecycle or authorization rules were weakened.

Validation: both UI package typechecks passed; regression coverage includes deep-link
close followed by refresh/mode switching, duplicate cancellation without mutation,
version labels/actions, centered empty states and common extension families. Existing
search/upload/comment/shell regressions passed. A signed-in historical-version download
returned HTTP 200 through the normal authorized endpoint.

## Folder organization and modal consistency

Reviewed `Recording 2026-09-22 175751.mp4` and system-design.md overlay guidance.
Use viewport-level modal dialogs for folder/file editing and destructive confirmations;
use inline status feedback for completed operations. No floating mutation footer was
introduced. Added opt-in portal support to the shared DialogContent primitive so file
forms escape collaboration containment without changing other dialog consumers.

Folders are now visible by default through All files / Unfiled / named folder navigation.
Folder controls have separate management disclosures. Each file shows its folder location.
Create/move/rename/category success refreshes the resource and reports a local status.
Rename/move/category dialogs identify their file, keep Save/Cancel explicit and retain
errors on failure. Destructive confirmations now stay open while running or on failure,
with an explicit danger action and secondary Cancel. File UI state is keyed by record.

Scope investigation: live attachment-section requests for P2 and P6 returned distinct
folder sets (P2: none; P6: its own test folders). No cross-record folder-read leak was
reproduced; the reader already filters tenant/entity/record. Repository mutations now
also verify destination/parent folder tenant and exact record before move/nested create.
No user folder data was reassigned or deleted during investigation.

Validation: scoped-folder rejection tests plus lifecycle/routes tests passed (36 server
tests); browser regressions cover default folder visibility, creation refresh, move
placement/filtering, rename/category feedback and viewport-centered/mobile dialogs.
Signed-in side/full dialog placement was checked without mutating user records. Server,
form-detail and business-partner typechecks passed.

## Navigation, archived folders and content filters follow-up

- Record navigation always renders Comments and Files labels; labels no longer depend on how full view was entered. File-row actions continue adapting to presentation width.
- Removed the visible "Folders for this record" heading while retaining the accessible Record folders navigation.
- Folder deletion locks the record-scoped folder and clears folder placement only for links whose resolved current/pinned attachment is deleted and inactive. Links, versions and retained bytes are preserved. Existing live links and subfolders remain deletion blockers; failure returns ATTACHMENT_CONFLICT (409), not an internal error. All changes remain in the workspace transaction.
- Folder/category filters and removable chips are available in content search. The server applies validated filters to record links before cursor pagination and still authorizes each hit. Changing filters aborts pending results and clears the old cursor, retaining the query for an explicit Search.
- Validation: all three affected package typechecks passed; 50 attachment backend tests passed; 18 existing browser tests passed, followed by all 12 file-discovery tests including the new filter regression. No destructive validation was performed on the user's live record. Archived-folder coverage uses the repository SQL test driver; production database replay remains unverified.

## Upload-first responsive layout

Files now use a single reading order across page content, docked/overlay panels and mobile: compact full-width drop target, search and scope/actions, optional Folder/Category controls, folder shortcuts, then files/results. At wide container widths the search, labelled scopes and labelled actions share a row; narrow layouts place scope and action icons below the full-width input. Filters start collapsed and retain selections when collapsed. Empty collections show "No files yet" without a redundant zero count.

Folder shortcuts scroll horizontally without wrapping into multiple rows. Folder action disclosures opt into a body portal so scrolling does not clip their actions; outside-click, Escape, keyboard entry and scroll dismissal are covered. Existing file action menus retain their default presentation.

Validation: form-detail typecheck passed; 19 existing browser tests passed, then all 14 file-discovery tests passed including two new layout/keyboard regressions (21 distinct browser tests total). Inspected generated full-width and 390px screenshots. Verified ordered filters, synchronized folder selection and no document overflow across full/side/mobile fixture presentations. No backend behavior changed in this layout pass.

## Menu, clear control and preview tooltip polish

- Folder deletion uses the shared ghost Button with a trash icon. The portalled disclosure measures its actual dimensions, aligns its trailing edge with the trigger, and flips above it near the viewport bottom.
- The search input uses a text input with searchbox semantics and a search keyboard hint, plus one explicit accessible Clear search action. This avoids browser-native cancel buttons duplicating the application action.
- File-action tooltips dismiss on activation and stay dismissed during programmatic focus restoration after preview close. A new pointer entry or keyboard Tab visit enables the tooltip again; focus restoration remains intact.
- Upload has its dashed boundary; search, optional filters and folder shortcuts share a bordered themed surface; results occupy a separate open region. Side-preview mode hides upload/discovery and result counts.
- Added browser regressions for the single clear control, tooltip close/rehover in side and full views, and measured folder-menu alignment/themed touch target. Reviewed the mobile folder-menu screenshot.

## Global success notifications

The global contract is now specified in system-design.md §5.4 and Appendix A. Existing shell ToastProvider/useToasts is extended through toasts.tsx rather than introducing a feature-owned notification system. Successes expire after five seconds with manual dismissal and hover/focus/hidden-page/modal pauses. The five-entry stack deduplicates active outcomes, protects persistent warnings from success eviction, and is reset by the existing authenticated keyed foundation boundary. Disposed publishers are ignored.

Entity comment/reply creation, comment edit/delete, folder create/delete, and file rename/move/category/unlink/archive now publish success toasts. Attachment inline success banners are removed. Reporting retains its local confirmation workflow; upload progress and mutation failures remain local.

Verification: both affected package typechecks passed; 24 browser checks passed across toast lifecycle, comments and files, plus the migration assertion verifies rename produces a global toast with no inline duplicate. Modal isolation and mobile centered placement are covered. No deployment or live-record mutation was performed.

## Automatic upload queue cleanup

Finalized uploads now show "Uploaded · Processing" until the refreshed authorized attachment list contains the same attachment ID with active status. Processing queues request a refresh every five seconds. Once confirmed active, show ready briefly and automatically remove the queue row after two seconds; the file remains in the record list. Removed the manual "Dismiss completed uploads" action.

Each submitted batch produces one global upload-success toast (or a successful-count summary with a partial-failure explanation). Failed rows retain Retry where supported and gain "Remove from queue", which only dismisses local queue state. Upload progress and errors remain local. Batch busy state covers all uploads in progress, and the uploader is keyed by record context.

Validation: form-detail typecheck and all 18 file-discovery browser tests passed. New checks cover batch toast aggregation, preserving processing rows beyond the toast timeout, delaying cleanup until list confirmation, and retaining/removing failed queue rows. Backend upload/scanning policy is unchanged.

## Bottom-center global outcomes

Updated the shared host and system-design contract to viewport bottom-center at every width. Routine transient success messages replace earlier successes, leaving warnings/persistent messages intact within the existing overall bound. The surrounding region stays click-through; only toast cards accept pointer interaction. Success titles clamp to two visible lines with full text retained for accessibility. Safe-area and fixed-control offsets, dismissal, timers, modal isolation and context clearing remain unchanged.

Validation: foundation typecheck and 18 file-discovery browser checks passed; all five toast checks passed, including consecutive desktop actions without waiting, centered desktop/mobile placement, latest-success replacement, warning preservation, and long-title clamping.

## File action placement

File action disclosures now use the shared themed tooltip instead of a browser-native title. Tooltips align to the action edge and hide while the disclosure is open. File menus render in a body portal, measure their dimensions, align with the trigger, and flip upward when needed. Their height is bounded by the viewport with internal scrolling on short screens, so opening the last row's menu does not grow the page. Portalled menus register as branches of their owning modal to preserve overlay accessibility and use the theme popover layer.

Validation: both UI/form-detail typechecks passed; 22 existing comments/files checks and a new last-row regression passed (23 total). The regression covers side/full/mobile widths, unchanged document height, viewport fit, themed tooltip and Escape focus restoration.

## Comments presentation follow-up

Comments now use the centered themed empty-state card with a conversation icon. Composer attachment and mention controls use shared tooltips and centered hit areas. Audience disclosure uses an aligned SVG chevron. Public/Send/Cancel reply share an action group that can move as a unit below formatting controls on narrow layouts. Disabled Send uses muted foreground/background tokens with full opacity; enabled hover retains primary contrast.

Reply toggling is part of the same action row as Reply and Like. The record comment reader now includes replyCount using the same tenant, record, context and audience predicates as the reply list (including retained tombstones). Known zero shows "No replies"; positive counts show Show/Hide N replies; absent counts remain unknown rather than displaying zero.

Validation: collaboration-ui, form-detail and platform-host typechecks passed; five comments checks and three panel checks passed. Added assertions for the empty state, reply count/action alignment, grouped reply controls, themed attachment/mention tooltips and disabled Send contrast. Inspected the rendered empty-state screenshot. Database count behavior has not been replayed against a live record.


## Shared reply composer and compact threads

Replaced the reply popup with the bottom composer, preserving separate in-session new-comment/reply drafts and showing the selected parent excerpt. Cancel restores the root draft. Reply submission reveals its thread; expanded threads refresh their loaded pages. Reply-to-reply relationships remain intact while all descendants render at one indentation with parent references. The reader counts/loads descendants through visible ancestors, retaining tenant/record scope and the five-level depth limit.

Pinned comment files now use a compact type-icon, filename, size/version and download card. Filename opens the authorized preview on demand; closing unmounts it. Rich attachment placeholders are suppressed when a matching pinned file card exists. Composer styling uses one outline; internal replies retain subtle audience styling.

Validation: collaboration-ui, form-detail and platform-host typechecks passed. Ten comments/panel browser checks passed, including draft switching/cancellation, reply-to-reply submission, flat descendant rendering, attachment card de-duplication and on-demand preview. Backend descendant SQL has not been replayed against a live database; live record verification remains necessary.


## Comments toolbar and reply action refinement

Send reply is last, after audience and Cancel reply. Zero reply counts no longer add a No replies label. Filters, sort, and Date/User grouping share a responsive toolbar. Grouping operates on loaded root comments and retains each thread; ordering applies within user groups. Full-view navigation is portalled into the toolbar without remounting the comments tree, with the existing side header retained.

Validation: both affected package typechecks and 11 comments/panel browser checks passed, including send-button order, zero-count suppression, author grouping, and oldest/newest ordering.


## Inline comment edits, reactions and reporting

Reactions now display a thumbs-up icon and nonzero count, with a pressed highlight and themed Like/Remove like tooltip. Report comment uses a required reason and optional context, neutral Cancel and primary Submit report. Editing replaces the selected comment body in place, retains its header, and offers Cancel before Save changes. Revision review appears after a conflict; separate bottom drafts remain mounted. Filters and grouping are disabled during editing to avoid hiding the editor.

Validation: form-detail typecheck and 12 browser checks passed, covering like toggling, report validation, edit conflict resolution, attachment editing, and cancelling an edit without mutating the comment or losing the bottom draft.


## Comment deletion and full-view presentation

Delete now opens an explicit confirmation. Cancel is nonmutating; failed deletion keeps the dialog and comment visible. Success leaves a compact Comment deleted tombstone with existing replies. Owner-only history can retrieve deletion metadata, but the repository returns no revision text for deleted comments and retains tenant/owner checks. Capability lookup includes deleted targets only for history.

Full view uses one bordered panel per root thread, a constrained reading width and an in-flow composer. Side view retains its compact structure. Wrapping, sizing and an end-aligned file tooltip eliminate horizontal overflow, including long attachment names.

Validation: 14 browser checks passed across comments and panel tests; 56 collaboration tests and 19 capability-policy tests passed. Affected form-detail/collaboration/host typechecks passed. Added regressions for confirmation/cancellation/failure recovery, deletion metadata without revision access, narrow overflow and full-view composer overlap.


## Reply identity, ordering and bounded loading

Verified the reply command and repository preserve the selected parent ID; no stored relationships are rewritten. Thread pages now use ascending created_at/id cursors and a maximum of 20 items. Parent metadata includes a visibility-scoped excerpt; deleted parents never return an excerpt. Reply rows skip unused recursive descendant counts. The existing tenant/parent index is present in each plane DDL; the visibility CTE is nonmaterialized to allow indexed parent lookups. Automatic thread refresh is capped at five pages; parent navigation never fetches pages automatically.

Parent references now identify the specific comment, align left, and focus/highlight loaded parents. Depth-five replies offer an explicit Reply to main comment. Deleted replies place View deletion details next to Comment deleted, hide empty action rows, and retain parent context without revealing deleted text.

Validation: 15 browser checks passed across comments and panel tests, including exact-parent reply submission, parent navigation, deleted-parent redaction, depth limits and no extra fetches on parent navigation. Form-detail and host typechecks passed. The reported live record and large-thread database execution plans have not been inspected; live-volume timing remains unverified.


## Subtle reply surfaces

Main comment surfaces remain unchanged. Replies at every depth now share a theme-derived pale blue-grey/light slate fill, 12px padding, small corners and no border. Internal replies retain their audience tint; deleted replies remain compact without a fill. Parent references use a two-line clamped quote strip while preserving their full accessible text and navigation.

Validation: 15 browser checks and form-detail typecheck passed. Rendered light/dark fixtures confirmed theme-derived fills, zero reply borders and consistent padding; inspected the dark reply layout.

## Composer effect stability

Mention searches and busy notifications now read the latest parent callbacks through React effect events. Callback identity changes no longer restart searches or re-emit unchanged busy state. Empty mention results retain their existing state reference; query/audience/record/parent changes cancel stale delivery and clear prior results.

Validation: collaboration-ui and form-detail typechecks passed; 16 browser checks passed. The new regression recreates callbacks on every parent render, uses a busy callback that updates parent state, verifies stable search counts, and rejects late results from an older query.


## Report details and toolbar label sizing

Sort/group controls now reserve label and chevron width with equal heights and wrap on narrow layouts. Report submission closes its dialog and uses the global success toast, removing the persistent feed notice. Comments display a friendly report status and View your report; existing reports replace the submission menu action. The private read model selects only the current tenant/comment/reporter report, joins its moderation state and outcome, and excludes internal decision notes/evidence. The read-only details dialog shows reason, context, submission time and available outcome. No public reviewer-response field currently exists, so it states that no response has been shared.

Validation: 16 browser checks and form-detail/host typechecks passed, including submission-to-toast, report details, replacement of the report menu action, and narrow layout overflow. Live database report retrieval has not been replayed.


## Atlas-aligned comment composer presentation

New-comment/reply cards and inline editors now share Atlas’s rounded frame, themed border/shadow and focus treatment. A dedicated footer groups formatting, attachment, mention, audience and submit controls behind a subtle fill and divider. Labels, reply context, drafts, uploads, permissions and submission behavior remain intact. The footer wraps naturally on narrow layouts.

Validation: collaboration-ui/form-detail typechecks and 16 browser checks passed. Inspected the rendered narrow composer screenshot for frame, divider and wrapped control alignment.

## File search mode guidance and recovery

Fresh Files sessions and record changes default to file-name browsing; the old persistent content-search preference is no longer restored. Existing mounted work retains its mode across side/full presentation changes. The content-search welcome card offers Show files. File-name no-results now uses the centered empty-state card, hides the zero-count line, and offers Search file contents (preserving the query) and Show all files (clearing the query/folder/category filters).

Validation: form-detail typecheck passed. All 20 file-discovery checks passed across the full run and targeted rerun after updating the welcome-copy assertion, including a regression for legacy saved preferences and both recovery actions.
