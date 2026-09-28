# Generic entity list styling parity

Studio now imports the entity list stylesheet after theme, identity, shell and
activity-center styles, matching Neon and Mesh (already in that order).
The shared list stylesheet uses component-specific selectors for toolbar layout,
button sizing and the hidden standalone Sort/Columns controls. Responsive and
embedded selectors retain their relative specificity. No entity-name checks,
metadata changes, publication changes or authorization changes were introduced.

## Fresh verification

- Shared entity-list package: `pnpm --filter @athyper/platform-entity-list-view typecheck` passed.
- Chromium: `entity-list-plane-parity.spec.ts` — 9 passed; actual shared React
  runtime with each application's recursively resolved CSS imports, deterministic
  API fixtures, 1440px/390px layouts and deliberately reversed desktop CSS order.
- Checks include hidden standalone Sort/Columns, visible Filters/Controls,
  desktop vertical alignment, viewport containment, search request, applied filter
  request, sort request, header sort cycling, Columns drawer and Escape dismissal.
- Existing `entity-drawer-selector.spec.ts` — 1 passed. Combined run: 10 passed.
- Scoped `git diff --check` passed.
- Attempting the older `country-filter-layout.spec.ts` alongside these was blocked
  at test discovery by its esbuild handling of `react-day-picker/style.css`.
  That existing harness was not changed and is not reported as passing.

These are browser component regressions using real plane styles, not authenticated
live end-to-end tests. The DEV web containers source-mount this checkout; manual
refresh is required to confirm the browser's newly served styling. No container
restart or release republication was performed.
