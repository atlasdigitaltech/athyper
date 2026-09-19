# Global field controls: implementation and rollout plan

Status: implemented and deployed to the shared DEV source stack, with signed Studio preview revision 34 verified on 2026-09-13. See `global-field-controls-implementation.md` for delivered changes, measured checks and deployment/rollout steps. Performance budgets below remain acceptance targets; measured results are recorded separately.

## Objective

Provide consistent field appearance across Neon forms, filters, sort panels, display settings, saved views, and reference dialogs. Select behavior from authorized metadata and data size. Preserve the current design tokens, form semantics, authorization, and submitted values.

The reference screenshots establish three distinct trailing actions: chevron opens options, calendar opens date selection, and Browse opens a richer reference dialog. Use Athyper styling rather than copying screenshot typography or borders.

## Existing foundation and implementation locations

- `packages/platform/foundation/ui/src/index.tsx`: shared Input and native Select primitives. Preserve ref forwarding and native form attributes when extending presentation.
- `packages/platform/foundation/ui/src/styles.css`: shared control tokens and existing 2.5rem reference-toggle area.
- `packages/platform/foundation/ui/src/searchable-select.tsx`: bounded searchable choices, separate search, selected-value preservation, recents and portal popup.
- `packages/platform/entity/runtime/form-detail/src/reference-select.tsx`: browser/server history integration; currently each mounted control can read history and refresh on window focus.
- `packages/platform/entity/runtime/form-detail/src/data-surface.tsx`: metadata-driven form rendering.
- `packages/platform/entity/runtime/form-detail/src/entity-lookup.tsx`: compact reference search and full chooser with selection adapters.
- `packages/platform/entity/runtime/list-view/src/filter-editor.tsx` and `directory-filters.tsx`: filter value editors and directory controls.
- `packages/contracts/platform/entity-list/src/types.ts` and `parsers.ts`: authorized filter options, value kinds, semantic roles and operator validation. The parser currently caps inline filter options at 500.
- `docs/contracts/reference-select.md`: existing reference/history contract and deployment requirements. Extend this contract instead of creating competing history behavior.

Inventory raw selects, date inputs and local picker implementations across the workspace before migration; include shell and product-specific controls. Record every occurrence as migrated, already compliant, or an intentional exception with a reason.

## Global presentation and behavior

| Control | Behavior | Trailing action |
| --- | --- | --- |
| Short fixed choices | Native single select, no recents | Shared chevron decoration |
| Bounded country/language/currency catalogue | Search names and codes locally; authorized recents when enabled | Chevron opens searchable popup |
| Large entity reference | Server search and paginated results | Distinct Browse button opens chooser |
| Hierarchical reference | Expandable chooser only with explicit hierarchy metadata and a supporting adapter | Browse |
| Date | Locale-aware presentation, validated date-only value | Calendar opens date selection |
| Date/time | Explicit date/time and timezone semantics from existing contract | Appropriate date/time picker |
| Text/number/textarea | Existing typed input and validation | No artificial dropdown action |

Use common height, border, radius, typography, disabled/error/read-only states, focus treatment, and trailing-action width tokens. Preserve existing density variants and RTL support. Use a subtle divider for actual trailing controls. For native selects, render a noninteractive chevron overlay with pointer events disabled; the select remains the single interaction and tab stop. Do not introduce a second button to simulate opening a native select.

Searchable choices retain the committed display value while a separate popup search receives focus. Show up to five recents by default, then remaining alphabetical choices without duplicates; retain configured policy limits. Search by label/code and mark the selected row. Clear history must never clear the field. Field clearing remains a separate action governed by required/optional semantics.

Keep plain selects for Ownership, Supplier type, Qualification type, operators, sort direction, layout, density, search behavior and visibility. Enable search for longer field/view/organization lists according to the presentation policy. A provisional short-list default is 15 choices, adjustable after validation; an explicit country/reference semantic takes precedence over this heuristic. Never change widget type while the user is interacting because a filtered result count changed.

Use single-select radio semantics and confirmation for single-reference dialogs; checkboxes and confirmation for multiple selection. Cancel preserves the committed selection. Do not infer a delivery-location hierarchy from the screenshot or from its label. Load children only when an authorized hierarchy is expanded.

Dates keep a date-only serialized value where the domain expects a date; avoid timezone conversion that shifts the day. Audit native date support before choosing an implementation. Prefer native behavior where it meets the requirements; if a custom calendar is necessary, load one shared accessible calendar on demand. Avoid simultaneous native and custom calendar triggers.

## Metadata and filter integration

Centralize a pure presentation resolver used by form and filter renderers. Keep it independent of network access and per-entity names. Reuse existing lookup, recent, semantic-role, value-kind and filter-option contracts; add narrowly scoped optional metadata only where capabilities are missing, with parser/compiler tests and backwards-compatible defaults.

The resolver must distinguish source identity, local versus remote choices, single versus multiple selection, supported operators, optional hierarchy and registered adapter availability. Missing reference data must show unavailable/retry feedback instead of permitting arbitrary text as a valid reference.

Publish Registration country as a country reference for filters, retaining its submitted country code. Status and Partner Category use authorized enum choices. Country defaults to Equals; expose Is one of only when the backend contract supports it. Preserve existing saved filters and their operators: never silently rewrite Contains to Equals. Define an explicit compatibility path or a visible migration message where old semantics cannot be preserved.

Dates support authorized relative periods and explicit date/range inputs; boolean and numeric fields retain typed editors. Is empty/Is not empty operators need no value input. Field and operator selectors remain separate from the value editor. Extend server history to a new reference source only after its eligibility adapter is registered; existing country support is not generic authorization for other catalogues.

## Performance design

1. **Keep the closed form inexpensive.** No new network calls for styling, simple selects, dates or unopened Browse dialogs. Mount popup contents only while open. Keep chooser/calendar code out of the initial bundle where dependency boundaries permit; check built chunks, not just dynamic-import syntax.
2. **Bound local catalogues.** Reuse authorized option data already delivered to the surface. Deduplicate additional fetches by source and authorization scope. Keep the existing 500-option filter cap; larger sources use a remote adapter rather than raising the cap. Precompute normalized labels/codes and alphabetical order per stable options/locale identity; memoize query results and key lookups. Do not debounce small local searches unnecessarily.
3. **Share history work.** Introduce a runtime-scoped history service and hook with one in-flight read per effective history scope, a bounded cache, and one focus listener. Read cache immediately; fetch lazily on first interaction, with a proposed 60-second freshness interval to coalesce rapid focus/open cycles. Deduplicate only when both policy and eligibility are compatible; otherwise retain distinct binding keys. This lazy refresh changes the documented mount behavior and requires a contract update.
4. **Preserve history correctness.** Include tenant, principal, plane, source, applicable business context, policy and eligibility/version identity in cache decisions. Clear on sign-out or identity changes. Never share authorized records across scopes. Serialize selection/clear mutations per scope; retain revision guards and nonblocking failures. Reuse existing retention limits. A component unmount removes its subscription; abort shared requests only when no consumers need them. Revalidate labels and eligibility against current authorized choices.
5. **Bound remote search.** Start with 250ms debounce and a configured two-character minimum where suitable; allow explicit Browse without a query. Respect existing explicit-search preferences. Cancel superseded requests and ignore stale results. Reuse identical in-flight queries. Request a bounded page, initially 50 rows where supported, with server-side search/sort and pagination. Cache only within authorization context using bounded size and freshness. Fetch hierarchy children on expansion, never the full tree.
6. **Avoid unnecessary list work.** Do not issue main-list or preview-count queries on each local country-search keystroke. Preserve Apply filters semantics. Do not prefetch every filter source when a drawer opens. Add virtualization only if profiling shows a need for the bounded rendered result set, and preserve keyboard accessibility.

## Delivery phases

| Phase | Deliverable | Exit condition |
| --- | --- | --- |
| 0: Baseline | Control inventory; representative screenshots, request traces and bundle/interaction measurements | Agree test fixtures and record reproducible baseline |
| 1: Shared styling | Tokens and native select presentation; date/action appearance; migrate shared consumers and raw-select exceptions | Visual consistency, native semantics and no added network requests |
| 2: Metadata-driven filters | Shared presentation resolver; country/enum/date editors; descriptor authoring and publishing updates | Correct values/operators, authorization and saved-filter compatibility |
| 3: References and performance | Reuse searchable control across eligible surfaces; shared history service; deferred Browse/calendar; remote bounds | Request budgets and selection/history correctness pass |
| 4: Controlled expansion | Business Partner create/edit and list drawers first, then remaining runtime consumers and product-specific exceptions | Browser/accessibility/performance checks pass at each expansion |

Split changes into reviewable commits or PRs by phase. Use existing rollout/version mechanisms where available, with independently reversible metadata and renderer changes. Retain previous published descriptors and compatible readers for rollback. Do not globally switch all fields to a custom searchable widget.

## Verification and release gates

Extend relevant existing browser suites (`reference-select`, `country-filter-layout`, `entity-drawer-selector`, `company-filter-groups`) and add focused coverage for new metadata/cache behavior. Do not treat existing tests as evidence for changes until run.

- Keyboard: Tab order, opening, arrow navigation, Enter selection, Escape preservation, focus restoration, disabled/required validation, and clear-history separation. Inside nested popups, Escape dismisses the active popup before the parent drawer. Verify screen-reader labels, expanded state and selection announcements.
- Layout: supported desktop browsers, mobile/touch, keyboard viewport, RTL, zoom, narrow columns, long translated labels and scrolling. Use an overlay host compatible with dialog focus/inert boundaries; a portal must neither clip nor become inaccessible outside a modal's allowed focus area. Reposition on scroll without scrolling the form unexpectedly.
- Values: unchanged country codes, date-only round trips including timezone boundaries, multi-select serialization, current eligibility and unavailable prior selections, cancel behavior and saved-view/filter compatibility.
- Requests: zero added requests from styling; zero search requests for a loaded local country catalogue; zero chooser directory requests before interaction; at most one concurrent history GET for an equivalent effective scope; zero repeated history GETs within freshness after completion unless explicitly invalidated. One remote search per settled query/page under the configured search mode; selection/clear writes remain explicit background operations.
- Races/outages: rapid query changes, out-of-order responses, repeated focus, multiple same-source fields, unmounts, identity changes, two tabs, storage failure, history transport failure, and selection racing with clear. History failure must not block selection or form submission.
- Performance: use fixed fixtures for one country control, 20 repeated same-source controls, and a paginated large directory. Measure production builds under the same device/network conditions for baseline and candidate. Proposed target: p95 local popup/search response within 100ms, no control-attributable main-thread tasks above 50ms, and no initial form render regression above 5% beyond measured noise. Review initial JS/compressed chunk sizes; richer unopened choosers should add no eager chooser payload. Investigate any budget failure before expanding rollout.

Completion means inventory coverage is recorded, supported consumers use shared primitives/resolver, metadata is published where required, measured budgets pass, and rollback is verified. Report real measurements separately from these planned targets.
