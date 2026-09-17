# Version context drawer

The composition routes replace the large version card with a compact trigger using the shared platform ContextSelectionDrawer and Neon Drawer anatomy. Other routes retain their existing version controls.

- Neon-style icon header with refresh, Available/Current metrics, counted category tabs, compact grouped radio rows, and matching/selected footer. Dates use readable UTC formatting; Details retain exact catalog timestamps.
- Search by catalog text, revision and full ID; filter grouped change sets, releases and explicitly entered bundle IDs.
- Radio selection is pending until Open version. Current and selected values remain distinct. Details disclose full coordinates without filling the workspace header.
- Open performs an authorized inspection read first, then applies the existing dirty/busy guard. A successful read is reused when the selected route changes; a failure leaves the old workspace intact.
- Closing or cancelling aborts a pending read. Refresh list reloads only the catalog, without clearing the editor or draft.
- No new grants, edits, publication or activation are performed by selection.

Qualification: eight focused tests passed, including failed reads retaining the current graph, catalog-only refresh, cancellation/abort and explicit commit. Studio/product/UI typechecks pass. Browser fixture verifies keyboard category switching, search clearing with focus restoration, readable backend timestamps, ID search, desktop/mobile overflow, Escape focus restoration and failed-read handling, with zero axe violations and no page errors.

`browser-check.cjs` uses the real version adapter and platform drawer with clearly labelled sample data. `desktop.png`, `mobile.png`, and `results.json` are fixture evidence, not live backend verification.

Reproduce: `node docs/architecture/business-partner/version-drawer-evidence/browser-check.cjs`.

## Shared drawer styling alignment

Drawer tab presentation now lives in foundation UI. Filters and saved views no longer add list-specific navigation classes or CSS; Version context uses the same tabs and metrics toolbar. Version-only search and selection behavior remain scoped.

Qualification: version desktop/mobile fixture passed with no axe violations or overflow; list drawer selector browser test passed; foundation UI typecheck passed. The broader company/country filter browser fixtures could not start because their esbuild setup lacks an output path for the existing react-day-picker CSS import. No live backend verification was performed.

## Two-row composition header

Data Model, Validation and Workflows use the shared PageHeader action slot for version and identity controls, removing the separate context row. Their stable title is Business Partner configuration; active navigation identifies the current task. ManagementNavigation now offers a reusable flat appearance with horizontally scrolling tabs on narrow screens. Other routes retain their existing page titles.

`header-check.cjs` renders the real shared header/navigation and version/identity components with sample session data. Desktop/mobile captures have one H1 and no page overflow. Studio typecheck and 10 focused UI tests passed. These captures are isolated layout evidence, not live authenticated verification.

## Workspace spacing alignment

Native Data Model, Validation and Workflows inspection wrappers no longer add their own 24px margin and 24px card padding. The shared page frame owns outer spacing; EntitySectionWorkspace owns navigation/content spacing. Bundle inspections and other pages retain their existing containers. Search toolbar spacing uses the platform space-3 token.

`alignment-check.cjs` captures the shared workspace with sample content on desktop/mobile; both passed page-overflow checks. Product typecheck and seven workbench tests passed. The fixture is not a live authenticated page.
