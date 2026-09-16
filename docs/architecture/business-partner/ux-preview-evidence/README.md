# UX-2 — Preview redesign

Implements the preview delivery in the [refinement plan](../studio-composition-ux-refinement-plan.md).

## Delivered

- Visible preview with source context, surface selection, Split and Unified layouts.
- Fixed loaded comparison base by default. An explicit saved-base option supports saved-versus-working review; its label explains that it advances after saving. No fork lineage or publication is inferred.
- Surface selector includes base-only surfaces so removals can still be inspected.
- Shared platform `PreviewFrame` uses a same-origin document and React portal with host styles/theme. Widths are actual CSS viewports (1024px desktop, 390px mobile), not compressed form containers. Narrow hosts scroll inside the frame.
- Unified presents the candidate at full available panel width. Small-screen Base/Candidate switching preserves both mounted forms and their local answers.
- Reset preview clears both sample forms. Existing compiler/Neon renderer remain authoritative; unsupported surfaces and compilation errors retain explanatory states.
- Existing identity differences, finding navigation and edit/save protection remain in place.

## Verification

- Studio and shared UI type checks passed.
- 10 tests passed across review model, review UI and composition editor suites, including fixed-base preservation after save and base-only surface selection.
- Browser fixture runs the actual compiler, production intake renderer and shared shell styles. It verifies label differences, actual viewport widths, input preservation, reset, narrow side switching and unsupported-surface messaging.
- No page errors, outer-page mobile overflow or preview network requests. Only the harness document was requested; no live configuration was read or written.
- [Desktop](desktop.png), [mobile](mobile.png), [machine-readable results](results.json).

Reproduce from repository root: `node docs/architecture/business-partner/ux-preview-evidence/browser-check.cjs`.

## Boundaries

Fixture-browser evidence is not an authenticated live deployment check. No release was published or activated. Preview answers remain independent per side and are not shared across schema versions. Rich difference markers, grouped human-readable changes, guided Previous/Next navigation, synchronized scenarios/scrolling and evidence-panel redesign remain subsequent deliveries. This preview does not assert backend validation or graph-preservation success.
