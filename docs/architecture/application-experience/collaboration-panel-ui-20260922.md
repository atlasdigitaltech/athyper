# Collaboration panel UI — 2026-09-22

Implemented one persistent Collaboration workspace with pinned, overlay drawer
and page-content presentations. The shell owns a single right-side slot shared
with Atlas. Opening either record tool selects Comments or Files. Default width
is 420 px, resize bounds are 360–560 px, and pin/width preferences are stored
locally. Compact viewports use the overlay presentation.

The same portal host moves between the page-content mount and the document body;
React children are not recreated during a mode change. This also prevents page
container stacking contexts from putting the mobile drawer behind navigation.
Visited tabs remain mounted, preserving drafts, pending uploads, filters and
expanded threads. Hidden preview controls release their iframe and renewal timer.
Full-view close returns to the side panel. Side-panel close releases shell space.

Atlas and Collaboration share shell-slot coordination and the existing modal
isolation hook. The old simultaneous rail/drawer render and BP-specific rail grid
were removed. Opening Collaboration no longer overrides the record summary-view
preference. Responsive changes cannot reclaim the slot from an active Atlas tool.

Comments now have compact author/avatar/time/audience rows, inline reply and
reaction actions, disclosure menus, thread guides, audience/mention filters over
loaded comments, ordering, and a sticky composer. Formatting, mentions, attachment
chips and audience/send controls share a compact footer. Link entry uses an inline
form instead of a browser prompt; attachment chips show names and can be removed.

Files now have a compact upload area, name/type and folder/category filters, a
secondary text-search disclosure, collapsible folder creation, compact file
metadata, preview/download controls and a management disclosure. Unlink and global
archive remain distinct commands. Full-view open previews use the extra width.

All component colors, type weights, font sizes, surfaces, borders and focus states
use the existing semantic theme utilities/tokens. The compact body uses the small
text token; full-view comments use the body token; headings use medium/large tokens.
No independent palette or font family was introduced.

## Verification

- `pnpm exec playwright test --config tooling/config/playwright.foundation.config.ts tests/foundation-browser/collaboration-panel.spec.ts`
  passes both mode/state-preservation and keyboard/mobile tests.
- Affected form-detail, collaboration-ui, shell and BP TypeScript checks pass.
- Signed-in local NEON browser checks pass for pinned/overlay/full transitions,
  Atlas handoff, tab draft/filter preservation, single composer, preview teardown,
  dark mode, mobile viewport fit, visible composer/send controls and Escape close.
- Browser checks intercepted draft writes and did not submit comments or change
  the user's existing record data. Previously qualified backend functionality was
  preserved; no capability publication or database changes were needed.

Comment filter results are limited to already loaded authorized pages; the
existing pagination controls remain available. Office/encrypted previews remain
unsupported as documented in CA-09.

## Comment-area refinement acceptance

The comment feed scrolls independently of the bottom composer. Audience choices
are capability-limited, keyboard accessible, described in the picker, and persisted
with drafts. Existing font sizes, weights and colors remain unchanged. Reactions
show a thumbs-up icon, count and pressed state instead of the raw reaction code.

Report, History and Edit now open focused themed dialogs instead of rendering
above an off-screen thread. Reporting shows explicit confirmation; history has
loading, empty, error and pagination states. Edit conflicts retain unsaved text
and require explicit adoption of the reviewed revision before retrying. Section
refreshes preserve the mounted conversation so drafts and dialogs survive refresh.

Validation: both affected packages pass TypeScript checks. Four browser tests cover
panel state preservation, responsive sizing, audience keyboard/draft behavior,
reaction toggling, edit conflict recovery, history and report confirmation. A local
signed-in browser check created a disposable comment, liked/unliked it, edited it,
read its history, reported it and deleted it. All actions succeeded without comment
API or browser errors. The service retains its normal deletion/moderation audit.

## Comment file picker and PDF finalization follow-up

The composer now offers a paperclip picker in new comments, replies and editing.
It reads the authorized attachment policy before upload, prepares or reuses a
principal-scoped draft, and pins only finalized file IDs. PDFs use an additive
`attachmentFile` rich-text leaf, retained through clipboard serialization, drafts,
edit and submission. Existing relation-only attachment pins are included when
opening legacy comments for editing. Posted file rows expose the existing
reauthorizing preview and download operations. Draft writes are awaited before
upload preparation and submission to prevent stale autosaves deleting a new draft.

The reported PDF finalize error was traced to the ClamAV embedded-file guard:
“Encrypted or incremental PDF is unsupported.” This is not the MIME policy
rejection. Unsupported inspection now returns `422 MALWARE_DOCUMENT_UNSUPPORTED`
with an export-new-unencrypted-PDF instruction. The UI does not offer a blind retry
for this response. No scanner checks or accepted PDF structures were relaxed.

Validation: 77 scanner tests, 75 attachment service tests and 54 collaboration tests
passed, including the unsupported-document response and generic attachment leaf.
Five browser tests passed, including draft-scoped PDF picking during create/edit.
A signed-in local run uploaded and scanned a clean PDF, posted its comment, edited
it to add a second PDF while retaining the first, verified preview/download controls,
and deleted the disposable comment. No browser errors occurred. Normal orphan and
moderation audit retention applies to acceptance fixtures.

## Comment preview follow-up

Comment previews now accept the exact stored comment pin returned by capability
admission, rechecking its tenant, record, live comment and attachment version in
the preview query. Browser-supplied comment IDs remain ignored. The former query
accepted only direct record links, excluding comment-only files.

Draft finalization may precede comment submission, leaving derivative jobs failed
with `source_not_found`. After an authorized live comment pin exists, missing or
missing-source derivatives receive a deduplicated rebuild. Quarantined, skipped
and other failed renders are not retried by this recovery path. The narrow comment
file layout also gives preview/status content room instead of squeezing it beside
the filename.

Validation: 77 attachment-service tests and 9 admission tests passed, with service
TypeScript checks. Signed-in browser verification returned ready comment thumbnails
and opened the inline preview viewer. All four renditions for the existing image
attachments reached ready, including the earlier pasted image.
