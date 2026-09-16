# Evidence/status and workspace qualification

## Delivered

- Session evidence separates local structural findings, backend validation, backend tests, full-graph save/reread verification, and runtime activation.
- Backend validation/test responses identify their change set and checked revision in addition to the contract hash. Studio records a check only when these coordinates and a reread match the configuration submitted for checking.
- Evidence shows its revision, response-observation time, hash where supplied, and raw report. Changed graphs/revisions show Outdated. Reloaded sessions explicitly show Not observed; no persisted evidence is inferred from lifecycle state. An empty test suite is labelled No tests configured.
- Save preservation is recorded only after the acknowledged revision and full reread graph match. Failed or uncertain saves retain edits and block automatic retries. Reload requires confirmed discard of dirty changes.
- Linked navigation waits for the mobile properties pane before focusing it. Preview navigation now moves keyboard focus. Tree category controls are outside labelled tree widgets. Preview frames have labelled landmarks and headings. Responsive difference columns and local focus outlines use platform tokens.

## Qualification

`fixture-check.cjs` renders actual workspace/review components with an explicit isolated fixture. `fixture-results.json` records:

- 1440px desktop, 768px tablet, 390px mobile, and CSS 200% zoom: no document overflow.
- Mobile Inspect → Properties → Return to differences keyboard focus succeeds.
- axe audit: zero violations in the rendered fixture; no JavaScript errors.
- Only the fixture document GET was requested; no backend writes.

The zoom check uses CSS zoom, not browser chrome zoom. Automated checks do not constitute a full screen-reader or platform-wide accessibility certification.

Editor tests cover complete graph save/reread, unrelated-property preservation, undo, conflict and mismatch blocking, confirmed reload, revision advancement, fixed comparison baseline, and stale save evidence after further edits. Tests use an API fixture; they do not prove a new live database save. Backend route/qualification tests and package/host typechecks also pass.

## Live limitation

The saved catl.admin session was anonymous during this run. `browser-check.cjs` is ready for live read-only screenshots and accessibility checks after session refresh. No user draft or published release was changed for qualification. Existing live API verification from the previous delivery does not substitute for this pending check.

Reproduce from the repository root:

- `node docs/architecture/business-partner/workspace-qualification/fixture-check.cjs`
- `node docs/architecture/business-partner/workspace-qualification/browser-check.cjs` (requires refreshed Studio session)
