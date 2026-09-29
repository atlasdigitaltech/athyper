# Toolbar-first Comments and Files

Full record view now uses the existing record header and navigation as its context. Comments and Files omit the duplicate feature heading/context row and outer card frame. Commands render beside feature filters through reusable `PanelHeaderActions` and `RecordPanelToolbarActions`; the same feature callbacks remain behind both full and side controls.

Comments keeps All/Mentions/Internal as filters, with sorting, grouping and icon commands in the toolbar. Side view retains one compact title/action header and record context, without a cross-feature tab switcher. The permanent Add comment footer is removed in managed panels; an open composer or minimized draft/reply retains its contextual dock. Minimizing an empty composer returns focus to its New action. Full-view comments use bordered cards.

Files retains one full-view Add files control and its upload disclosure. New folder, Filters and view controls remain together. In side view, Add files belongs to the shared header; the duplicate footer is removed. Repeated added/created timestamp display is reduced to one date when attribution already supplies it; file size and version/status remain. Uploads still use the existing component and authorization.

No entity-specific components, metadata publications or permission changes. Activity keeps its meaningful Timeline/Audit log/Saved snapshots navigation. Full/side views preserve mounted feature state and use existing theme tokens and responsive layouts.

Validation: all 71 targeted browser tests passed in one run; UI and form-detail typechecks and `git diff --check` passed. Browser fixtures include desktop, tablet, mobile, light/dark, Arabic RTL, draft focus and persistence, single creation entry points, absent duplicate headings/context, scroll behavior and Activity regression.

Visual review: inspected the 390px light-theme Files capture. Fixture screenshots are saved under `/tmp/record-tools-{390,768,1440}-{light,dark}.png`. Authenticated DEV tenant acceptance remains a manual refresh check.

## Filter alignment polish

Comments now uses equally spaced scope buttons, consistent control heights, and trailing sort/group controls adjacent to view actions. Compact layouts stack filters with deliberate spacing beneath the record context. Files side view places folder filters, count and discovery actions on one wrapping row instead of reserving a separate mostly empty action row. All added CSS uses existing spacing/control/theme tokens. Validated with all 31 detail-collaboration browser cases and form-detail typecheck; inspected desktop Comments and side Files screenshots. Added equal-width filter and adjacent-control spacing assertions across responsive/theme fixtures.

## Bottom action docks

The next refinement replaces the top creation shortcuts with one shared `RecordActionDock` in both views. Comments shows the actual mounted rich editor in a compact one-line presentation with attachment and Send controls. Focus expands that same editor; minimizing retains its document, and empty Send is disabled. The record-aware prompt is localized in English, Malay and Arabic. Files moves its existing upload area and entry point into the bottom dock, retaining its queue and policies. No second editor or upload provider is created.

Full view uses a sticky dock constrained to the record tool, with minimum viewport fill for short records. Side view reserves dock space outside content scrolling. Existing keyboard viewport adjustment and safe-area padding remain. The final 31 record-browser cases passed, including dock position, light/dark responsive layouts, permission denial, empty Send and draft state; both affected packages passed typecheck. Rich-editor regression result is recorded below.

Editor regression: all nine cases passed across targeted runs (links, attachment picker cancellation, pointer/keyboard mentions, dismissal and callback stability). Updated stale mention-test selectors to the existing combobox/option roles and keyboard selection behavior. Total validated for the bottom-dock refinement: 40 browser cases. Visually inspected the compact Comments dock positioned at the viewport bottom; authenticated live tenant review remains a manual refresh check.

## Side-view scrolling

Comments filters now scroll with the comment feed. Files search/folder filters and results share a single scroll area; the header and bottom action dock remain outside it. Updated scroll restoration to use that region. Scrollbars use a thin transparent track and subdued theme-derived thumb, with stronger contrast on hover and native colors in forced-color mode. All 31 detail-browser checks and form-detail typecheck passed; the Files scroll regression confirms filters move while the dock remains stationary.
