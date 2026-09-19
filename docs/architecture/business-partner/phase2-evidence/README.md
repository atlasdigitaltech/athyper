# Phase 2 — safe composition editing

## Delivered

Native sources in `draft` lifecycle state now expose supported presentation settings inside the selected composition object's properties. Published/in-review/approved sources remain read-only in this workspace. The existing fork/open-draft control remains available for eligible sources.

Supported properties reuse the existing allowlist: surface title/description; section title/description/columnCount; placement labelOverride/helpText/placeholder/columnSpan. IDs, field definitions, permissions, widgets, required rules, and visibility are not added to editable scope.

- Edits resolve stable IDs against the current graph and reject missing/ambiguous identities.
- Unknown properties and unrelated branches are preserved.
- Intake choice-card and entity-lookup spans are constrained to 12.
- Undo restores previous local graph snapshots.
- Save sends full graph + expectedRevision, rereads the stored draft and compares full graph and returned revision.
- Save failures and reread mismatches retain local edits, block retry, and offer a non-destructive latest-stored comparison.
- Reload requires confirmation when discarding edits, then adopts current server revision and lifecycle.
- Dirty/busy state participates in the shared workbench source-switch/publication guards; unload and link navigation protect unsaved work.
- The duplicate legacy focused editor is suppressed for editable native drafts on Data Model. It remains available in other established workbench contexts.
- New editor layout CSS is scoped and controls use the shared UI library.

## Verification

- 23 focused tests passed across composition editor/model/workspace and existing workbench/editor/publication suites.
- Tests exercise stable-ID preservation, full-width widget restrictions, undo, expected revision/full-graph save, conflict retention, latest-stored comparison and mismatched reread handling.
- Product package and Studio application typechecks passed.
- Live DEV UI loaded the actual revision-59 draft. Browser interaction exercised undo and save/reload with PUT and subsequent graph GET intercepted locally. No write reached the backend.
- `browser-check.json` and `editor-desktop.png` record this browser verification. Screenshot saved state is an intercepted test response, not evidence of a persisted revision 60.

## Limitations / next gate

An actual persisted-save round trip on a dedicated authorized test draft remains to be exercised. This change does not establish publication or Neon target activation. The existing save endpoint can initiate development preview; its outcome is intentionally distinguished from graph persistence in the success message. Full preview/difference reviewer UX belongs to Phase 3.

Permission enforcement remains on the backend; the UI uses source lifecycle and supported-property restrictions, and retains edits on denied writes. No roles/grants were changed during this task.
