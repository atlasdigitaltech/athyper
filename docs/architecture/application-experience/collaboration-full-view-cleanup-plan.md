# Collaboration full-view cleanup plan

Status: implemented, 2026-09-22. Validation results are recorded below.

## Original review findings

- `EntityCollaborationSurface` already preserves a single portal tree across pinned,
  overlay and content presentations. Keep this mechanism and the shared Atlas slot.
- Full view is local surface state; Business Partner record navigation does not receive
  that state. Its collaboration controls remain icon-only and do not select a record tab.
- Full view repeats the Collaboration heading, description and internal tab switcher.
  It inherits constrained panel height/scroll rules, which can crowd the conversation.
- Comment edit dialogs already provide save/cancel, history and conflict recovery.
  Attachment picking, comment pins, preview/download and capability checks already exist.
- Comments lack a visible Edited indicator. Replies identify the action but not the
  person being replied to.
- Rename has save/cancel. Category buttons and folder selection currently commit
  immediately. New folder is an inline details form rather than a focused dialog.
- Replacement uploads and separate unlink/archive actions already exist.
- Record editing uses existing application/workflow routes. Integrate with their actual
  edit/dirty state; do not infer editing from a URL label or create a second edit mode.

## Agreed behavior

Keep collaboration available in record View and Edit, subject to capabilities.
Opening collaboration does not edit record fields or change comment editability.
Record Save/Cancel affects record fields only. Show during record editing:
“Comments and files save separately from record changes.”

Maintain the existing font family, sizes, weights, colors and theme tokens. Use
layout, labels, borders and explicit actions to communicate state changes.

## Implementation sequence

### 1. Navigation and presentation state

- Expose controlled presentation mode from the shared surface to the record host.
  Keep business-record routing outside the reusable panel content.
- Track selected collaboration section, presentation mode, prior record section/view,
  prior side-panel pin preference and per-section scroll positions.
- Expanding Comments/Files activates its record navigation item with icon, label,
  underline and accessible selected/current state. Deactivate the prior record tab.
- In full view, selecting the other collaboration navigation item switches content
  in place. In record view, either collaboration icon opens its side-panel tab.
- Encode full-view mode and selected section in URL state; support refresh, deep links
  and browser Back/Forward. Remember the previous record context for restoration;
  use the configured default record section for a direct link without prior context.
- Selecting a normal record tab exits full view and restores that record content.
  Preserve the hidden collaboration tree and its state without reopening it implicitly.
- Return to side panel, including the full-view close action, restores the prior record
  context and pin preference. A compact viewport applies its overlay fallback.
- Keep the record edit form mounted while full view is presented so unsaved fields survive.

### 2. Full-view shell and distinct layouts

- Remove only in content mode: outer panel card/border, repeated Collaboration title,
  description and internal Comments/Files switcher.
- Keep a compact Return to side panel action row; record navigation identifies the section.
- Keep the existing header and two tabs for pinned/overlay modes.
- Comments: centered 800–960 px reading column, compact filters, date/thread grouping,
  and one growing composer. Use the page's content scroll rather than a short nested feed.
  The composer stays accessible near the viewport bottom without reducing the feed to
  a few lines; cap its growing height and allow editor scrolling beyond that cap.
  Wide tables scroll within the comment, without widening the page.
- Files: use available width for the list; on wide content views show one selected-file
  preview beside it. Keep row actions compact. Stack preview on narrower screens.
  Close/unmount hidden preview viewers and stop their polling; preserve file selection.
- Drawer: retain its independent feed scrolling and accessible bottom composer.

### 3. Explicit collaboration action states

- Comments default to reading. Retain explicit Edit comment / Save changes / Cancel
  with conflict protection. Record Edit must not open a comment editor.
- Show Edited only for a saved content revision, with a timestamp and History action
  where authorized. Do not use reaction or moderation timestamps as edit evidence.
- Replies show Replying to [display name] and retain the correct parent/reply audience.
- File rename, category and folder moves use focused themed forms with Save/Cancel;
  selection alone does not mutate the file. Retain form values and errors on failure.
- New folder uses a focused form with Create folder/Cancel.
- Keep Upload new version explicit with version history preserved.
- Keep Remove from record and Archive globally separately labelled and confirmed.

### 4. Cleanup and validation

- Consolidate mode-specific CSS; remove obsolete full-view sizing, duplicate headers
  and conflicting sticky/overflow rules after replacements are verified.
- Extract focused presentation/action components where useful; keep shared upload,
  preview, authorization and draft services unchanged.
- Test navigation selection, deep links, refresh and Back/Forward; full-view return;
  small-screen fallback; Atlas handoff; keyboard focus and selected-tab semantics.
- Verify drafts, uploads, expanded replies, filters, scroll and unsaved record fields
  survive mode/tab switches. Maintain one composer per draft.
- Verify record Cancel does not undo an already posted comment or completed upload.
- Verify Edited/reply context, file Save/Cancel, versioning and separate destructive actions.
- Signed-in acceptance must open actual previews in both Comments and Files, not merely
  assert that preview buttons exist. Retain existing unsupported-format fallbacks.
- Check light/dark themes, a narrow viewport, a wide viewport and browser zoom without
  changing typography or introducing page-wide horizontal scrolling.

## Completion criteria

One selected navigation item and one collaboration presentation; no duplicated tab
bar in full view; a readable conversation area with accessible composer; one selected
file preview; explicit save/cancel for management actions; preserved record and draft
state; no change to authorization, scanning, preview qualification or theme typography.


## Implementation and validation, 2026-09-22

- Business Partner record navigation now owns `collaborationMode=content` and the
  selected collaboration section. Full-view Comments/Files have labelled active
  navigation controls. History navigation and refresh restore the selection; returning
  to the side panel retains the original record section and tab.
- Controlled full view removes the outer panel chrome and duplicate section tabs.
  Standalone consumers without record navigation retain their section switcher.
- The same portal tree retains drafts and section state. Comments use a centered
  reading column and compact sticky composer. Files use a selected adjacent preview
  on wide screens, stacked on narrow screens; hidden viewers unmount.
- Saved comment revisions display Edited; reply composers identify the participant.
  Rename, category, folder moves and folder creation use explicit themed forms.
- Existing-record request editing keeps the governed form mounted while full view is
  open. Collaboration is outside that form and displays the separate-save note.
  New requests without a target record do not expose record-scoped collaboration.
- Existing font sizes, weights and theme colors are retained.

Validation completed:

- TypeScript checks passed for platform entity form-detail and NEON business-partner.
- Seven foundation browser tests passed: mode/tab/Atlas draft preservation, keyboard
  resizing, compact drawer behavior, controlled full-view navigation, unsaved field
  preservation, audience selection, edit conflict recovery, history/report/reactions,
  Edited/reply context, comment file picking and explicit file Save/Cancel.
- Signed-in local acceptance passed for Comments/Files active navigation, browser
  Back/Forward, refresh, draft retention, return to the prior Identity section, and
  390px responsive drawer restoration.
- Actual authorized preview delivery from both Files and comment attachments returned
  successful PDF responses with valid PDF signatures. No preview qualification,
  permission, scan policy or unsupported-format behavior was changed.
- Live destructive file actions and submitting governed record changes were not used
  for acceptance. Cancel/save mutation behavior was checked through browser fixtures.
