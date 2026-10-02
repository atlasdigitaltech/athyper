# Entity List — Responsive Presentation Standard (Desktop, Tablet, Phone)

Status (2026-09-30): **P0 verified in the running Neon app. P1–P3 implemented and verified in
browser fixtures with the real runtime and Neon CSS; not yet verified in the running app.**
Owner surface: `packages/platform/entity/runtime/list-view` (shared Entity Framework).
Reference entity: Country (`metadata/products/shared/entities/country/definition.json`).

This document extends [System Design §7.1](system-design.md#71-layout-decision-ownership):
*"Responsive adaptation changes geometry, not task semantics."* Every entity
list, on every plane, uses the same runtime, the same metadata and the same
rules below. There is no entity-specific list page, stylesheet or breakpoint.

## 1. Flow as built

```
metadata definition (codeField, titleField, columns, searchFields, fields[].list)
  └─ Studio authoring graph            server/packages/planes/studio/meta-entity-authoring/src/authoring/graph-builder.ts
       list surface: identityField, defaultState{density,mode}, supportedModes["table","compact"]
  └─ publication → compiled descriptor
  └─ list descriptor compilation       server/packages/services/records/src/entity-list-service.ts
       fields[]: label, valueKind, semanticRole, statusTones, defaultVisible, defaultOrder, defaultWidth
  └─ contract (browser)                packages/contracts/platform/entity-list/src/types.ts  (EntityListDescriptorV1)
  └─ EntityListRuntime                 packages/platform/entity/runtime/list-view/src/index.tsx
       mode === "compact" → <Card class="a-entity-list__card"> (real card markup, dl/dt/dd)
       otherwise          → <StickyListTable><table class="a-entity-list__table"> with td[data-label]
  └─ CSS                               packages/platform/entity/runtime/list-view/src/styles.css
       ≤ 48rem viewport: the *table* is restyled into stacked "cards" (tr → grid, td::before = data-label)
```

So phones do **not** get the card presentation. They get the desktop table,
reshaped by CSS. The two "card" implementations (compact mode and phone table)
have different markup, different anatomy and different defects.

## 2. Desktop vs phone — findings (Country, 2026-09-30)

| # | Finding | Cause | Status |
|---|---|---|---|
| D1 | Phone cards overlap; each card shows only "S" and the previous card's fields spill into it | Density rules `.a-entity-list--{density} .a-entity-list__table tr{height:…}` still apply after `tr` becomes a grid card, clamping every card to 2.5–3.75rem | **Fixed (P0)** |
| D2 | "Select" label truncated to "S" | Desktop selection-cell `width/max-width:3rem` + `overflow:hidden` survive on phones (only the embedded variant was reset) | **Fixed (P0)** |
| D3 | "View: System default" wraps to three lines, search squeezes it, actions drop to a second row | Phone toolbar grid is `minmax(0,1fr) auto` with implicit placement: the view menu gets the `1fr` track and the search input takes `auto` | **Fixed (P0)** |
| D4 | Phone card has no hierarchy: identity, title and status look like every other field; select/favourite/actions become full label rows | CSS cannot reorder or group table cells by meaning | **Done (P1)** |
| D5 | Two card anatomies (compact-mode `Card` vs stacked table) | No shared record-card renderer | **Done (P1)** |
| D6 | Literal English in list markup: `data-label="Select"`, `"Favourite"`, `"Select record"`, `"Select current page"`, `"Actions"`; `ViewSelector` renders `"View:"` and `" (modified)"` | Strings not routed through `entityIntl` | **Done (P1)** |
| D7 | Narrow hosts on desktop (embedded lists, side panels) keep the wide table; wide tablets in landscape get phone rules at the wrong time | Layout keyed to **viewport** `@media`, not to the list's own width | **Done (P3)** |
| D8 | ~30 distinct breakpoint values across platform CSS (`760px`, `600px`, `48rem`, `961px`, `52rem`, …); `styles.css` has three overlapping `max-width:48rem` blocks | No breakpoint scale | **Done for list stylesheets (P3)** |
| D9 | Only `identity` is known to the list; Country's `titleField: "name"` reaches the detail presentation but not the list, so a card cannot show "AF · Afghanistan" as its heading | `titleField` not projected as list `semanticRole: "title"` | **Done (P2)** |

## 3. The standard

### 3.1 Presentation tiers (geometry only)

The tier is chosen from the **list container's inline size**, never from the
entity, the device name or the row count.

| Tier | List width | Presentation | Density |
|---|---|---|---|
| Wide | ≥ 64rem | Table, all chosen columns, sticky heading, sticky favourite/actions | Applies |
| Medium (tablet) | 40rem – 64rem | Same table, horizontal scroll, identity column sticky at inline-start; toolbar wraps (search full row) | Applies |
| Narrow (phone, narrow panels) | < 40rem | **Record cards** (§3.3) from the same page of rows | Ignored — cards size to content |

Rules:

1. A user's explicit `mode` (`table` / `compact`) and column, sort, filter
   and view choices are preserved across tiers. Only the narrow tier renders a
   `table` state as cards; switching back to wide restores the table unchanged.
2. Selection, favourites, row actions, record links, keyboard open (Enter) and
   pagination behave identically in every tier.
3. Hidden representations are not focusable; the table header stays available
   to assistive technology.

### 3.2 Metadata contract (no hard-coding)

Card anatomy is resolved from metadata roles, with safe defaults so that
every onboarded entity works without extra configuration.

| Card slot | Source (existing unless marked) | Default when absent |
|---|---|---|
| Heading (link) | `descriptor.entity.identityField` | required today |
| Title | field with `semanticRole: "title"`; when metadata declares none, the list service derives it from the published `recordPresentation.titleField` (never for the identity field) | omitted |
| Status badge | field with `semanticRole: "status"` + `statusTones` | omitted |
| Body fields | `fields[].list.cardPriority` (`primary` \| `secondary` \| `hidden`): primary first, hidden omitted | the currently visible columns in view order, excluding the slots above, capped by the runtime at 4 |
| Remaining fields | visible via "Show all fields" disclosure in the card | — |

Constraints:

- `cardPriority` belongs to `fields[].list` in
  `server/packages/contracts/metadata/src/descriptors.ts`, is validated by the
  metadata descriptor parser, compiled by `entity-list-service.ts` into
  `ListFieldDescriptorV1`, and parsed by
  `packages/contracts/platform/entity-list/src/parsers.ts`. Unknown values fail
  publication; they are never ignored silently.
- A card shows only fields present in the authorized list projection. Priority
  never widens what the server returns.
- A user who hides a column also hides it from their cards; `cardPriority`
  orders the fields, it doesn't override user choices.
- The cap (4) and tier widths are runtime policy, owned by the framework, not
  entity metadata.

Country needs no new metadata or republication: `codeField` → heading and the
already-published `recordPresentation.titleField` → title. Its `status` field
becomes a badge once its definition declares `semanticRole: "status"`; until
then it is an ordinary body field.

### 3.3 Record card anatomy (one renderer)

```
┌──────────────────────────────────────────────┐
│ [☐]  AF  ·  Afghanistan           [☆]  [⋮]   │  select · identity link · title · favourite · actions
│ ● Active                                     │  status badge (statusTones)
│ ISO alpha-3   AFG                            │  body: priority fields, label/value grid
│ Region        Asia                           │
│ Calling code  93                             │
│ ▸ Show all fields                            │  only when more visible fields exist
└──────────────────────────────────────────────┘
```

A single `EntityRecordCard` in `list-view` renders both `compact` mode and the
narrow tier. It reuses `renderFieldValue`, `BookmarkButton`, `RowMenu`,
`EntityLink` and `highlightText` exactly as the table does. It has no
per-entity branches.

### 3.4 Narrow toolbar (one row)

Below 40rem the list toolbar is a single sticky row: **search · Filters · Controls**.

- The labelled view selector is hidden. Views stay reachable from Controls →
  Manage views, which shows the current view name.
- When a saved or standard view other than System default is active, a view
  status (`View: {name}`, or `· modified`) appears under the row. Tapping it
  opens the views drawer; ✕ returns to System default. With System default it
  is not rendered, so the default case costs no extra row. Applied-filter chips
  and "Clear all" are unchanged and still mean filters only.
- The search placeholder shortens to `Search {plural label}` (`list.searchLabel`);
  the full "Search by …" hint remains as the input's accessible description.
- The Filters icon carries the active-filter count badge.
- From 40rem up the labelled selector returns; the view status is never shown.

**Quick-return toolbar** (`list-scroll.ts`, narrow tier, not embedded lists):
the list chrome is sticky under the shell app bar. It slides out of view while
the reader scrolls down and returns after 24px of upward scroll
(`QUICK_RETURN_REVEAL_PX`). It stays visible at the list start, while focus is
inside it and while one of its menus is open. State is a `data-toolbar`
attribute on the panel; CSS owns the motion, and reduced motion removes it.

**Land on the first result** (all tiers, not embedded lists): after a user
change that alters the result set (search, filters, sort, grouping, view, page
or page size, but not columns, density or refresh), the page scrolls so the
list start sits under the app bar, but only if the reader had scrolled past it.
Focus does not move.

## 4. CSS design rules

1. **Tokens only.** Colour, spacing, radius, type, shadow, motion, control
   height and touch target come from `--a-*` tokens. No raw hex or px values
   except hairline adjustments already expressed as tokens.
2. **Breakpoint scale.** List content uses the container tiers
   `@container entity-list (width < 40rem)` and `(width < 64rem)`, which must equal
   `LIST_NARROW_MAX_REM` / `LIST_WIDE_MIN_REM` in `presentation-tier.ts`.
   Viewport queries are allowed only for overlays and page chrome (drawers,
   dialogs, fixed menus, page header) and may use only `40rem`, `48rem` or
   `64rem`. Pixel and `em` widths are not allowed. Custom properties cannot
   appear in query conditions, so `pnpm policy:entity-list-breakpoints` (in the
   `workspace` and `ci` static-policy profiles) enforces this for the list-view
   and collection-controls stylesheets.
3. **Container over viewport.** `.a-entity-list__panel` declares
   `container: entity-list / inline-size`, and the runtime measures the same
   element (`useListWidthTier`), so embedded lists adapt to their host. A
   container does not capture `position: fixed` descendants, so popovers and
   phone menus keep viewport positioning.
4. **Density is a table concern.** Fixed `height` on rows or cells is
   permitted only inside the wide/medium table tier. Content containers
   (cards, dialogs, drawers, toolbars) never get a fixed block size.
5. **One block per tier.** Each stylesheet has at most one rule block per
   tier. Later overrides of an earlier block for the same tier are refactored
   into it, not appended.
6. **Logical properties** (`inline-start`, `block-end`, `inset-inline`) for
   RTL. Touch targets use `min-block-size: var(--a-touch-target)` under
   `pointer: coarse`.
7. **No `!important`** in new rules, and no selectors keyed to entity codes,
   field keys or labels.
8. **Preserve** `prefers-reduced-motion`, `forced-colors` and focus-visible
   treatments in every tier.

## 5. Delivery

| Phase | Scope | Status |
|---|---|---|
| P0 | D1–D3 layout fix for the old phone rules | Verified in the running Neon app |
| P1 | `EntityRecordCard` for compact mode and the narrow tier; `list.row.*`, `list.group.*`, `list.card.moreFields` (en/ms/ar); `ViewSelector` copy through `UiMessages` (`ui.selectView`, `ui.viewName`, `ui.viewNameModified`) | Implemented; fixture-verified |
| P2 | `cardPriority` in server metadata (`descriptors.ts`, `descriptor-parser.ts`, `native-runtime-projection.ts`), list service, browser contract (`types.ts`, `parsers.ts`); title role derived from `recordPresentation.titleField` in `entity-list-service.ts` | Implemented; unit-tested; needs platform-host restart, no republication |
| P3 | Panel container, tier rules, table-stacking rules removed, px breakpoints snapped to the scale, breakpoint policy check | Implemented; fixture-verified |
| Tool panel | Docked, pinnable list controls; shared panel anatomy; SegmentedControl, ChoiceChips, operator chip; controls policy check (§7) | Implemented; fixture-verified |

Implementation notes:

- The title role is derived when the list descriptor is compiled, not in the
  Studio authoring graph as first planned. Every entity with a published
  record title gains it without republication.
- Because `isRecordLinkField` already links `title` fields, the title column
  (Country: Name) becomes a record link in the desktop table too.
- Compact mode now uses the same card, so it shows at most four body fields
  plus a disclosure and gains the row actions menu.
- Tablet widths (list 40–64rem) keep the table with horizontal scroll; the old
  CSS stacking below 48rem viewport is gone.
- Breakpoints snapped to the scale change a few thresholds slightly:
  `760px`/`720px`/`700px` → `48rem` (768px), `600px`/`480px` → `40rem` (640px),
  `761–1100px` → `48–64rem`.
- Follow-up outside this change: `form-detail` stylesheets still use their own
  container and pixel breakpoints.

## 6. Verification matrix

Run at 390, 768, 1024 and 1440 CSS px, plus an embedded list in a record
detail at 1440:

- all three densities; grouped rows; selection (single/multiple); chooser mode;
- favourite toggle, row menu, Enter-to-open, record link;
- RTL (`entity-rtl.spec.ts`), forced colours, 200% zoom;
- no horizontal page scroll in the narrow tier; no card overlap
  (`entity-list-mobile-cards.spec.ts`); sticky heading unaffected on wide
  (`entity-list-sticky-heading.spec.ts`); all planes at 390/1440px
  (`entity-list-plane-parity.spec.ts`).

Status reports distinguish **implemented**, **published** and **verified in
the running app** per [AGENTS.md](../../../AGENTS.md).

## 7. List controls tool panel (Filters, Sort, Columns, Group, Display, Views)

Status (2026-09-30): implemented and verified in browser fixtures with the real
runtime and Neon CSS; not yet verified in the running app.

List controls use the same side-panel family as Atlas, record collaboration and
the Activity center. There is one anatomy and one frame, shared by every entity.

```
PanelHeader      icon · section title · description · [pin] [close]
Context row      list (· organization scope) ········ record count / Updating…   (PanelContextRow, as in Files)
Section tabs     Filters 2 | Sort | Columns | Group | Display | Views   (PanelTabs; Filters shows active count)
Body             section content
Footer           [what Apply will do, only for a changed draft] · Reset (leading) ···· one primary action
```

**Frame — `WorkspaceToolPanel` (`platform-shell`).** Claims the shell's single
workspace side-panel slot (opening it closes Atlas or collaboration; Atlas
opening closes it), docks at the right edge under the app bar, resizes between
360 and 560px by pointer or keyboard, and remembers width and pin per tool in
browser storage. It is pinnable only at ≥1101px, where the shell reserves room
(`data-workspace-panel-pinned`); below that, and on phones (full width under the
app bar), it is an overlay.

| Mode | Semantics | Behaviour |
|---|---|---|
| Overlay | `role="dialog"`, `aria-modal`, focus trapped, backdrop | Applying a section closes the panel; ✕, Escape or the backdrop discard drafts |
| Pinned | `role="region"`, no backdrop | The list stays usable; applying keeps the panel open beside the refreshed list |

**Sections — `CollectionControlSections` (`collection-controls`).** Tabs replace
the former title menu; visited sections keep drafts until the panel closes.
The frame around them is `CollectionControlPanel`
(`@athyper/platform-shell/tool-panel`): entity lists (`ListDrawerHost`) and the
Notifications and Inbox pages open the same panel, with the same header,
context row, tabs, footer, pin and resize. Only the Activity center's own side
panel shows its filters inline, because it already owns the slot.

**Each fact once.** The context row is panel-level and identical on every tab:
it names the list and its record count, like the Files panel names the record
and its entity. Sections have no stats strip; a fact lives where it is used —
the active filter count on the Filters tab, the sort limit on "Add sort level ·
1 of 3", visible columns in the Columns list heading, the active view in the
Views footer.

**Footer grammar.** Every section: **Reset** on the leading edge and one primary
action (Show results, Apply sort, Apply columns, Apply grouping, Save settings,
Save view). The summary line describes only what the primary action will do
("1 filter ready to apply", "Sort changed · 2 levels", "3 columns will be
visible") and appears only for a changed draft or an error; the current state
belongs to the context row. There is no Cancel; closing is the panel's job.

**Controls — design-system choices only** (enforced by
`pnpm policy:entity-list-controls`, in the `workspace` and `ci` profiles):

| Choice | Control |
|---|---|
| 2–4 options: sort direction, layout, density, search behaviour, view visibility | `SegmentedControl` (`platform-ui`) — radio group, arrow keys, RTL |
| Field pickers: sort field, filter field, grouping | `SearchableFieldSelect` → `SearchableSelect`, whatever the field count |
| Filter values with ≤ 8 published choices, Yes/No | `ChoiceChips` — one or none for equals / not equals, several for "any of" |
| Larger or server-loaded value lists, relative periods | `SearchableSelect` |
| Filter operator | `FilterOperatorMenu` chip beside the field name; plain text when only one operator is allowed |
| Recent filter values | chips under the value, with Clear recent |

**Ordered rows (Sort levels, visible Columns).** One compact row: drag handle ·
position · content · one "⋯" menu (Move to top, Move up, Move down, Remove / Hide
column). The menu is the keyboard and touch alternative to dragging, so rows do
not carry separate arrow and delete buttons.

- *Sort:* grip · priority · field · direction · ⋯ on one line; direction and
  menu wrap below the field only in a narrow panel. Visible direction wording
  follows the field's `valueKind` — text A→Z / Z→A, numbers 1→9 / 9→1, dates
  Oldest / Newest first, Yes/No No / Yes first — while the accessible names
  stay Ascending / Descending. The level limit is on the button
  ("Add sort level · 1 of 3"). The field picker never offers `uuid` fields and
  lists fields already used as "In use".
- *Columns:* the identity column shows a lock and "Always shown" instead of a
  disabled checkbox and cannot be hidden.
- *Field pickers:* fields are grouped with the `columns.ts` categories; the
  "Audit and system fields" group is collapsed until opened or searched; rows
  show the field code, not its technical type.

**Toolbar beside a pinned panel.** Below the wide tier (`width < 64rem`) the
Filters and Controls actions are icons with their count badges, so a list
narrowed by a pinned panel keeps one toolbar row.

**Context row scope.** The server's tenant-wide fallback scope label
(`key: "access"`) is not repeated; real collection scopes are shown
("Business Partners · Operations"). Record counts use `list.controls.recordOne`
/ `list.controls.records` ("1 record", "247 records") in the page header and
the context row.

**Metadata-driven, no new metadata.** Section availability comes from the list
descriptor; quick filter fields from `surface.filterPresentation.quickFields`;
the editor per field from `valueKind`, `filterOperators`, `filterOptions` and
`semanticRole`. Display settings follow the width tier: in the narrow tier,
Layout and Density are replaced by a note because records always show as cards.
Views offer Visibility only when shared views may be created; otherwise the
panel states that the view is personal. Section titles and descriptions come
from `list.controls.<key>.*` (en/ms/ar).

**Tests.** `entity-list-mobile-cards.spec.ts` (docking, pinning, keyboard resize,
remembered pin, phone presentation, no horizontal overflow in any section at
the narrowest panel and on phones, untruncated segment labels),
`entity-drawer-selector.spec.ts` (anatomy geometry and tab reachability) and
the jsdom list suite (drafts across tabs, focus trap, close discards drafts).

**Follow-ups.** Record collaboration can adopt `WorkspaceToolPanel` in place of
its own docking code; a live "Show N results" count needs a draft-count API;
remaining English literals in the Views section move to the catalog.

## 8. Density (Compact · Comfortable · Spacious)

Status (2026-10-01): stages 1, 2 and 4 implemented and fixture-verified;
stages 3 and 5 proposed.

**Problem found.** Five unrelated density mechanisms existed (global
`data-density` on the page, list density, Activity density, choice-card density,
intake field density). The global one changed four tokens, one of them unused,
and none of the spacing scale. List rows were sized by the 40px row-menu button,
so rows measured 57 / 65 / 73px and "compact" could never be compact.

**Design.** One density system, expressed as tokens (`--a-density-*` plus
`--a-control-height`, `--a-touch-target`) defined in
`packages/platform/foundation/theme/src/styles.css` and mirrored in
`DENSITY_TOKENS` (`tokens.ts`; a test keeps them equal). Any element may carry
`data-density`; its subtree follows. The page level is the app default
(Utilities / profile); lists, panels, sections and intake fields override
locally.

| Token | Compact | Comfortable (default) | Spacious |
|---|---|---|---|
| Row height | 32px | 44px | 56px |
| Header height | 32px | 40px | 48px |
| Cell padding (block / inline) | 2 / 8px | 4 / 12px | 6 / 16px |
| Data text | 13px | 14px | 15px |
| Row icon button | 24px | 32px | 36px |
| Control height | 32px | 40px | 48px |
| Stack gap / section gap / panel gutter | 8 / 16 / 12px | 12 / 24 / 16px | 16 / 32 / 20px |

On touch screens (`pointer: coarse`) rows and row targets keep a 44px floor;
24px desktop targets meet WCAG 2.2 target size (minimum). Chrome (app bar,
navigation rail, page and panel headers) does not change with density.

**Stages.**
1. Token foundation and scoped `[data-density]` — done.
2. Lists and tables: the list root carries `data-density`; exact row and
   header heights, cell padding, data text and row icon buttons from tokens;
   touch floor; old per-density row rules removed — done.
3. Forms, record detail, panels, Activity, Files, intake adopt the tokens;
   their own density attributes map to the same mechanism.
4. Settings wiring — done. Utilities → Density is the app density on the page
   root and every list follows it. A list overrides only when the person
   unticks "Use app density (…)" in Display settings and picks a density (saved
   per list, per device), or opens a non-default `?density=`; only then does
   the list root carry its own `data-density`. Host-configured lookups keep
   their explicit density. Density is a display preference, not view data: it
   never marks a view "(modified)".
5. Policy ratchet against fixed control heights in platform CSS (84 today).

**Tests.** `theme-contract.test.tsx` (complete, monotonic token sets; CSS equals
TS); `entity-list-mobile-cards.spec.ts` (exact 32/44/56 rows, 32/40/48 headers,
13/14/15px text, 24/32/36px row buttons; 44px touch floor; no ellipsis in icon
cells).
