# Application UI System Standard (all front-end surfaces)

Status (2026-10-01): **Phase 1 (baseline) implemented and verified. Phase 2a (controls:
B1–B4, ChoiceSelect, control-height and native-select at zero in the Entity Framework)
implemented and verified in browser fixtures with the real runtime; not yet verified in
the running app. Phase 2b (record and form width tiers, radii and layers) implemented; the Entity Framework is at zero for every layout rule. Record page, detail workspace and comment tiers are verified in browser fixtures; the Files panel tiers are not yet, because the Files width tests stop earlier on a stale "Add files" label. Phase 3a (record collaboration on the shared side panel; B5) implemented and verified in browser fixtures. Phase 3b (Notifications and Inbox on the shared side panel, one activity feed) implemented and verified in browser fixtures. Stages B (activity pages on the entity list frame), A (one collection controls panel and filter editor) C (reading pane at 80rem and wider) and D (activity centre parity with the pages) implemented and verified in browser fixtures.** The project owner authorised the scope on 2026-10-01: shell chrome, Home,
Atlas, IAM, Studio and the plane apps, as well as the Entity Framework.

This standard generalises the method proven on entity lists
([Entity List Responsive Presentation Standard](entity-list-responsive-standard.md)) to
the whole front end. It extends [System Design §7.1](system-design.md#71-layout-decision-ownership):
_"Responsive adaptation changes geometry, not task semantics."_

## 1. Why

Lists became consistent once every decision moved into one shared layer: tokens, width
tiers, one control kit and one panel anatomy. The rest of the front end still makes
those decisions page by page. Measured on 2026-10-01 with `pnpm report:ui-system`:

| Area                  | breakpoint-scale | control-height | raw-radius | raw-layer | native-select | colour | typography | total |
| --------------------- | ---------------- | -------------- | ---------- | --------- | ------------- | ------ | ---------- | ----- |
| Foundation UI         | 13               | 42             | 9          | 1         | 0             | 4      | 29         | 98    |
| Shell, Home, Activity | 77               | 101            | 33         | 5         | 9             | 10     | 16         | 251   |
| Entity runtime        | 36               | 83             | 10         | 1         | 17            | 0      | 9          | 156   |
| IAM (in app)          | 3                | 3              | 3          | 0         | 0             | 9      | 8          | 26    |
| IAM sign-in theme     | 8                | 10             | 5          | 0         | 0             | 0      | 0          | 23    |
| Plane packages        | 7                | 14             | 6          | 0         | 1             | 0      | 0          | 28    |
| Neon and Mesh apps    | 0                | 0              | 0          | 0         | 1             | 0      | 0          | 1     |
| Docs sites            | 0                | 0              | 0          | 0         | 0             | 74     | 0          | 74    |
| **All areas**         | 144              | 253            | 66         | 7         | 28            | 97     | 62         | 657   |

For example, 184 media and container queries use about 50 distinct widths. Only 37 of
them are on the scale; the most common are `760px` (33) and `600px` (18). The 74
colour literals under `apps` are all in the documentation sites, not the product UI.

## 2. The five layers

Every visual decision belongs to exactly one layer. A page combines layers; it does
not redefine them.

| Layer               | Source of truth                                                     | Examples                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Tokens           | `packages/platform/foundation/theme/src/tokens.ts` and `styles.css` | colour roles, type scale, `--a-space-*`, `--a-radius-*`, `--a-shadow-*`, `--a-z-*`, density tokens, `BREAKPOINT_SCALE`                                                                                                   |
| 2. Primitives       | `packages/platform/foundation/ui`                                   | Button, Input, SearchableSelect, SegmentedControl, ChoiceChips, FilterChipGroup, Checkbox, Tabs, Badge, Menu (portal), Dialog, PanelHeader/PanelContextRow/PanelFooter                                                   |
| 3. Patterns         | shared runtime packages                                             | side panel (`WorkspaceToolPanel`), data list (entity list-view), record page (`EntityPageLayout` + `EntityRecordHeader`), metadata form (`EntityDataSurface`), toolbar, context row, footer (Reset + one primary action) |
| 4. Responsive rules | `BREAKPOINT_SCALE`                                                  | content adapts to its container's width tiers; the viewport decides only overlays and page chrome                                                                                                                        |
| 5. Density          | `[data-density]` tokens                                             | compact / comfortable / spacious from Utilities, inherited by any subtree; a surface may override it only by an explicit user choice                                                                                     |

### 2.1 Breakpoint scale

`BREAKPOINT_SCALE` in `tokens.ts` holds the only allowed widths:

| Name      | rem | Meaning                                                                                                                                 |
| --------- | --- | --------------------------------------------------------------------------------------------------------------------------------------- |
| compact   | 24  | **container queries only**: a component inside a side panel at its narrowest (panels are 22.5–35rem); the policy rejects it in `@media` |
| narrow    | 40  | phone content (cards instead of tables, stacked fields)                                                                                 |
| medium    | 48  | overlays and page chrome (drawers become full-screen sheets, header condenses)                                                          |
| wide      | 64  | desktop content (full tables, multi-column forms)                                                                                       |
| extraWide | 80  | room for a pinned side panel beside wide content                                                                                        |

CSS cannot read custom properties inside `@media` or `@container`, so stylesheets write
these literals and the policy checks them. Scripts build the same queries with
`viewportQuery({ from, below })` from `@athyper/platform-theme/tokens`
(`viewportQuery({ below: "medium" })` is `(width < 48rem)`), and the policy rejects a
`matchMedia()` literal that is not on the scale, so a script and its stylesheet always
switch at the same width. A side panel can be pinned from `extraWide`
(`TOOL_PANEL_PIN_QUERY`); pages that offer a side mode, such as record collaboration, use
that same query. Sign-in pages (the Keycloak theme and the in-app identity gate) show the
workspace showcase beside the form from `wide` and stack below it, so tablets get one
column. Plain-script pages without the theme package (the Keycloak theme) write the scale
literal directly, for example `matchMedia("(width < 64rem)")`. Use range syntax at the boundary, for example
`@media (width < 48rem)` and `@media (width >= 48rem)`. Do not use off-by-one pairs such
as `760px`/`761px` or `52rem`/`52.001rem`. The entity list width tiers
(`presentation-tier.ts`) must equal `narrow` and `wide`, which
`tests/foundation/theme-contract.test.tsx` checks; it also checks that `compact` falls
inside the side panel's width range (`TOOL_PANEL_MIN_WIDTH`–`TOOL_PANEL_MAX_WIDTH`).

Two neighbouring layouts that change at different widths keep their order when they are
mapped. The record detail workspace collapses its summary column below `wide` and hides its
section rail below `extraWide`, so the summary returns before the rail as width grows,
instead of both returning at once into a cramped three-column page.

### 2.1.1 App frame and density

The app frame follows density from `medium` up (phones keep touch sizes in every density).
The header bar and the sidebar (rail rows, Favourites, Recent, account card) have three
sizes: Spacious is the roomiest, Comfortable sits between Spacious and Compact, Compact is
the tightest.

| Size                                   | Spacious | Comfortable | Compact |
| -------------------------------------- | -------- | ----------- | ------- |
| `--shell-topbar`                       | 3.5rem   | 3.25rem     | 3rem    |
| `--shell-control` (top bar actions)    | 2.25rem  | 2.125rem    | 2rem    |
| `--shell-field` (search, context)      | 2.5rem   | 2.375rem    | 2.25rem |
| `--shell-rail-row` (rail rows, Favourites, Recent) | 2.75rem | 2.5rem | 2.25rem |
| `--shell-account` (account card)       | 3.5rem   | 3.125rem    | 2.75rem |
| Rail label / current page label        | body / md | body / body | sm / sm |

Side panel headers follow the same three steps and line up with the app bar (3.5, 3.25, 3rem).
header lines up with the 3rem compact app bar). Page content follows density:
`--a-control-height`, `--a-density-control-height-small` and `--a-touch-target`, and taller
tabs are `calc(var(--a-control-height) + var(--a-space-2))`. Home's Atlas section is page content and uses the same three steps: Spacious is its
roomiest layout, Comfortable sits between, Compact is the tightest (padding, title, greeting,
composer, Send button and suggestion chips). The control-height rule judges the
element a rule sizes (its last compound selector), so an avatar inside a summary is a
media size, not a control.

The frame changes at the scale's widths:

| Width               | Frame                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------ |
| below `narrow`      | phone bar: menu, work context (truncates first) and every action; no action is hidden      |
| below `medium`      | rail becomes a drawer; overlays are full-screen sheets                                     |
| `medium`–`extraWide` | rail starts collapsed; quick access and side panels overlay the page; bar actions are icons |
| from `extraWide`    | quick access and pinned side panels sit beside the page; bar actions show labels           |

Home and workspace grids go to one column below `wide`.

### 2.1.2 Theme families in dark mode

Each family defines its own rail and story surfaces (`--a-story-*`) in dark mode rather than
deriving them from its brand colour: Modern's navy brand makes a dark navy rail, but Mono's
light-grey brand would make a grey rail with dark text. Mono dark therefore sets a rail
darker than the page (`#171717`→`#0b0b0b`), light rail text, a white selection marker, a
white wordmark and a flat `--a-brand-soft` (`#262626`) so tinted surfaces stay dark. axe
cannot judge text on a gradient, so a browser test checks rail text contrast (at least 4.5:1
against both gradient ends) and that the rail is not lighter than the page.

### 2.1.4 Page navigation bar

Every navigation bar under a page header uses one pattern: record sections, entity
application tabs, workspace and module tabs, and Notifications | Inbox. It is a flat band
across the page with a bottom rule; labels are body text at regular weight, muted until
current; the current item is primary with a 2px underline and no fill; the height is
`calc(var(--a-control-height) + var(--a-space-2))`, so it follows density. Counts are the
small one-line pill. Icons are 18px. `ManagementNavigation` takes `appearance="flat"` for
this pattern; a browser test checks that the workspace, module and activity bars share type
and height in every density.

- **Stable order.** Workspace and module tabs (and module cards) are pinned modules, then
  catalogue order. Recent use never reorders them; it only fills a "Recent" group at the
  top of More. A module opened from More takes the last visible slot and the module it
  displaces moves into More; nothing else shifts.
- **More is a tab.** Same type, weight, colour, height and icon size as the tabs, with the
  count pill; its list is at regular weight, marks the current module and keeps pin stars.
  Tabs fold into More rather than clip. Module labels give up only the width the row lacks,
  longest first: the bar measures one cap (`--module-tab-cap`, `labelCap`) applied to every
  label longer than it, so short labels stay whole (full name as the link's title and
  accessible name). Modules fold into More only when the cap would fall below 6rem. Search, the count and the "Recent" group appear
  only when More holds six or more modules; a shorter More is a plain list and opening it
  focuses the first module. (More is created only after every module failed to fit, so a
  lone overflowed module cannot take More's place.)
- **Phones (below 40rem): one switcher, one sheet.** The tabs and More give way to a
  full-width module switcher naming the current item ("Switch module, current: …"); it
  opens the phone sheet listing Home, Recent (from six modules) and every module with pins.
  Every menu that opens from a page bar on a phone (module switcher, record sections) is
  that same bottom sheet: full width, thumb reach, 44px rows, inside the viewport.
- **Phone breadcrumb** is one back link to the parent ("‹ Countries"); the page title names
  the current page. A single crumb stays as it is. Wider screens keep the full trail.
- **Phone header action:** a header whose one action is an icon-led button shows it as a
  44px icon button in the title row (text stays the accessible name), like list Controls.
- **Phone entity rows:** on a module home each entity is a compact row (icon, title,
  chevron) that opens the list; recent records and the create action stay on the row.
- **Record tabs** follow the same rules: current tab primary with underline at regular
  weight, 18px icons 8px from the label (Overview included), the shared height and inset.
  The section chevron stays outside the tablist (it opens a menu), but when the grouped tab
  ends the row it sits flush against it and shares its underline (`data-section-menu=joined`).
- **Notifications | Inbox** carry their icons (`ManagementNavigationItem.icon`) and the
  breadcrumb names the page, as a workspace landing does. Flat bars draw the underline with
  the 2px border only (no inset shadow on top).
- **Header actions do not move the header.** `PageHeader` actions span the title and
  description rows, so a page with actions (Notifications) has the same title, description
  and icon positions and height as one without (workspace); a browser test checks this in
  every density.

#### Icon resolution

Icons come from published metadata first; code supplies only a per-role fallback, never a
per-key choice. `resolveMetadataIcon(role, ...candidates)` (`@athyper/platform-icons`)
returns the first candidate that is a known semantic key, else `ICON_ROLE_FALLBACKS[role]`:

| Role | Metadata looked up | Fallback |
| --- | --- | --- |
| workspace | catalog workspace `iconKey` | `boxes` |
| module | catalog module `iconKey` | `package` |
| entity | entity `iconKey` (cards, list header and record header alike) | `database` |
| record-tab | tab `iconKey`, then its first section's | `layout` |
| record-section | section `iconKey` (presentation/page plan) | `clipboard-check` |
| comments / attachments / activity | none yet (capability metadata has no icon) | `message` / `file-text` / `history` |

Section and tab `iconKey` is authored on the product section definition, validated as
`^[a-z][a-z0-9-]{0,62}$` (`REFERENCE_PRODUCT_SECTION_ICON_INVALID`), and passed through the
page planner, the detail-navigation and record-presentation contracts and the browser
runtime client. An unknown key falls through to the role fallback rather than failing.
An entity shows one icon everywhere; it does not borrow its module's, because one entity
can be placed in several planes under different modules. Shared reference products
author it as `definition.iconKey` (validated, `REFERENCE_PRODUCT_ICON_INVALID`); it is
published to the list experience header (list header and directory cards) and the record
presentation (record header). Country publishes `globe`; entities without one show the
`database` fallback.

### 2.1.5 Density text roles

Density changes work content, never page chrome. Work content has three text roles, each
one density token pair (`DENSITY_TOKENS` / `--a-density-*`):

| Role | Used for | Compact | Comfortable | Spacious |
| --- | --- | --- | --- | --- |
| Value (`data`) | list cells, record values, form and filter text controls | 14/20 | 15/22 | 16/24 |
| Label (`label`) | list column headers, record field labels, form labels (muted, regular) | 13/18 | 14/20 | 15/22 |
| Section (`section`) | record and form section headings (medium) | 15/22 | 16/24 | 17/26 |

Page titles, navigation bars, tabs and buttons keep one size in every density. In the default (Comfortable) density, values equal the body size (15px), so content is never smaller than the frame around it; list cells and headers keep the density row height. A value has
the same size in a list cell, on the record page and in its edit control; a label reads
the same in view and edit. `policy:style-tokens` (`work-content-text-role`) rejects any
other `font-size` on those elements; browser tests compare list, record and edit in each
density and check chrome stays fixed.

### 2.1.6 Personal preferences and the account menu

- **Utilities › Appearance** holds every personal preference: Theme, Density, Design system
  and Language, one row each with the same label column and control height. Language is a
  segmented choice for up to three enabled languages, a select beyond that, and a read-only
  row ("the only language enabled for your organisation") when there is one.
- **Saved to the profile.** Theme, density and design system save to
  `master.principal_ui_profile` (`PATCH /api/platform/profile/appearance`; the design system
  in `metadata.themeFamily`) and come back in the bootstrap profile, so they follow the
  person to every device. The browser copy only paints the first frame; the profile wins.
  Language uses the existing locale endpoint and reloads the page.
- **Account menu:** the sidebar's initials, name and login id, and **My profile**; rows
  appear only with a value (email comes from the sign-in identity and is not editable
  here, so a missing email has no row: no "Not provided", no dead link); a context that
  cannot be switched has no trailing control. Language is in Utilities only.
- **My profile** is `/app/entity/principal/me`, the caller's own principal record with its
  Profile, Notifications and UI Profile sections (`/app/entity/principal` is the directory of
  all principals). The shared read route asks `GET /api/entity-runtime/:entityCode/own-record`
  and replaces the URL with the normal record route. When the owner field is the record id
  (as for `principal`) the id is the caller's principal id, confirmed by the governed record
  read; otherwise the authorized list execution filters by the owner field, which must be
  published filterable (as for the ownership view). No profile page, no guessed id.

### 2.1.7 Related record sections (view, edit, child records)

Every related section on a record (one record such as Profile, or a child list such as
Notifications) uses one pattern (`RelatedSection` in the form runtime):

| Mode | Heading row (title · actions) | Body | End of section |
| --- | --- | --- | --- |
| One record, view | Profile · **Edit** (secondary) | read-only fields | — |
| One record, empty | Profile (no action) | shared empty state: section icon, title, message, **Set up …** inside it | — |
| Child list | Notifications · **count** · **+ Add …** (primary) | the list with no panel of its own (one card); the same toolbar as every list; table to the card edges | paging only when there is more than one page |
| Child view | Notifications · **Edit** (secondary), plus "‹ Notifications / *record title*" | read-only fields | — |
| Edit / create | heading, plus "‹ Notifications / Edit · *title*" | form | **Save …** · **Cancel** |

- One primary action per section; section actions are small. Back is a link naming the
  list, never a button beside Save / Cancel; in edit it leaves like Cancel (unsaved
  changes ask first). Esc leaves the same way.
- The first field takes focus when editing starts; a save shows "Saved" beside the actions.
  A one-record form saves with **Save** (never the label of the button that opened it).
- On phones the Save / Cancel row sticks to the bottom of the screen while editing.
- In tab mode (one section at a time) a tab switch returns to the top of the page, so the
  record header stays in view.
- A published choice on a numeric field keeps its number type when selected.
- **Child lists** are the shared list runtime with its `section` option (no separate list
  component): one card (no inner panel), the section heading row carries the title, the
  record count and the create action (labelled from the child's create form, e.g. "Add
  preference"); row 2 is the same list toolbar as a full-page list (View, search with
  its "/" shortcut, Filters, Controls, same sizes): a child list differs only in its frame,
  never in its functions; the table runs to the card's edges; rows-per-page and Previous / Next
  appear only with more than one page. An empty child list shows its empty state with
  the create action inside it, and the heading row has no action.
- List cells and headers take the value and label sizes; their height stays the density
  row-height tokens.
- **Empty one-record sections** use the shared `PanelEmptyState` anatomy (as Files): the
  section's published `iconKey` (else the record-section fallback), the relationship's
  `emptyState.title` as heading with `emptyState.message` as description (without a title the
  message is the heading), and `emptyState.setupLabel` as the one action. Nothing is
  hard-coded; child lists keep the list's own empty state, which has the same anatomy.
- Empty-state texts (title, message, setup and edit labels) are plain text or published
  localized text (`{labelKey, defaultText}` in the definition, translations in the entity's
  `localization.json`, hydrated at authoring and rejected when a required locale is
  missing); the browser renders them in the person's language.

### 2.1.8 Reference values and the reference preview

- **Reference values** (a field pointing at another record) are primary-coloured at rest
  with no underline; hover and keyboard focus add the underline and a small preview cue.
  The weight never changes and the cue is always laid out, so nothing shifts.
- **The reference preview** uses the shared side-panel anatomy: the referenced entity's
  icon (metadata first) in the header tile, the record's published title with its status
  beside it, a subtitle "Entity · code", a context row that reads like the breadcrumb,
  "From *record title* › *section* › *field*" (record pages and sections publish their
  title and label through `ReferenceOrigin`; elsewhere "From *entity* › *field*"; one line,
  the record title truncates first, full path as the row's title), the
  summary fields, and a pinned footer action "Open *entity*". Esc closes it and returns
  focus to the reference that opened it.
- **Child-list context rows** name the parent by its published title (read through the
  governed parent read), falling back to the id only when the title is not readable.

### 2.1.3 Workspace and module homes

Workspace (`/{workspace}`) and module (`/{workspace}/{module}`) homes use the entity-list
page frame: shell breadcrumb, `PageHeader` (icon, title, description, counts) and the
workspace module tabs as the navigation bar (Home, modules, More; pin and to-do badges).

- **Entity placement is metadata.** Each entity's `placement.json`
  (`metadata/entities/<code>/`) names its plane, workspace, module and
  route slug. `pnpm catalog:generate` validates placements against the catalog and fills
  each module's entities; `catalog:check` keeps the generated catalog current.
- **Access is the server's.** Cards list only what `GET /api/entity-runtime/directory`
  returns: each placed entity compiled through the authorized list descriptor; entities the
  caller may not list, or that are not published on the plane, are left out.
- **Module card (workspace home):** module icon, name, description, pin, to-do count (the
  Inbox filtered to the module), up to four entity rows (icon, title, description, record
  count) with "n more entities", recent records opened in this module (browser-local), and
  New (only the create actions the directory authorized). A module without
  authorized entities says so; no placeholder links.
- **Entity card (module home):** entity icon, title, record count, description, recent
  records and its authorized create action.
- **The card is the link.** No Open module / Open list buttons: the title link covers the
  whole card (one focus stop; focus outlines the card); entity rows, recent chips, pins and
  create actions sit above it. Hover and focus lift the card 1px and show an arrow (no
  motion under reduced motion). A module with no entities for the caller is a compact card.
- **Record counts** come from the directory (`count`), through the same authorized list
  query with an exact count; a denied, inexact or slow (over 1.5s) count is left out, never
  shown as zero.
- **Breadcrumbs** for `/app/entity/{code}` and its records follow the placement through a
  module route the caller is entitled to: Workspace › Module › Entity › Record (the record
  page replaces the last crumb with the record's title).

### 2.2 Side panel

Every docked tool uses one frame, `WorkspaceToolPanel` (`@athyper/platform-shell/tool-panel`).
It owns the shell slot, geometry (360–560px, resizable, full width below `medium`),
modality, pin, focus return and preferences; the owner renders the panel anatomy
(`PanelHeader` → `PanelContextRow` → tabs → body → footer) and places the frame's pin and
close capabilities in its header.

| Mode      | When                                         | Semantics                                                       |
| --------- | -------------------------------------------- | --------------------------------------------------------------- |
| `pinned`  | pinned preference and room beside the page   | `region`, beside the page; the shell reserves its width         |
| `drawer`  | not pinned, or no room                       | modal `dialog` with backdrop; focus stays inside; Escape closes |
| `content` | owner's full view (`presentation="content"`) | `region` inside the page; Escape does not close                 |

Owners whose content must survive closing (comment drafts, uploads, reading position)
pass `persistent`; the same host node moves between page and dock, so content never
remounts. Users: list controls (Filters, Sort, Columns, Display, Views), record
collaboration (Comments, Files, Activity), the activity centre (Notifications, Inbox) and
Atlas. Atlas registers in the same shell slot (`id="atlas"`), so it shares the width,
pin, resize, backdrop, modality and focus return of every tool; its full view inside the
shell is the same panel moved into the full-view host (`presentation="content"`), so
drafts, history and scroll survive dock ↔ full view. Only the standalone `/atlas` page
renders its own frame.

**Atlas full view.** One header row: New, History (left panel), Context (right panel,
the shared `context` header action), Full view, Close; no separate toolbar row. Both
side panels remember the person's choice (otherwise history from 64rem, context from
80rem; below 1100px context opens as an overlay), and the conversation keeps a readable
48rem measure, centred. The context panel speaks business language — *What Atlas can
see*, *Where this answer came from*, *What you can ask here* (suggestions fill the
composer) — and its configuration detail is shown only with `atlas.admin.manage`.
History is searchable on the server (`GET /api/atlas/threads?q=`, titles and message
text), grouped Today / Yesterday / This week / Earlier, with Rename and Archive per
conversation; Atlas actions read as outcomes (Done, Couldn't complete, Not allowed…)
with a support reference, an All / Needs attention filter, and administrator-only
technical detail.

**Atlas answers.** Every answer has one layout, whatever produced it:

1. **The answer first.** A tool result never reaches the person as a field dump. Each
   result shape is registered in `atlas-result-views.tsx` with a one-sentence headline
   ("No saved comments you can see.", "1 field changed between the two snapshots.") and a
   readable body: a list, or a table with changed rows first and "Not captured" for
   missing values. Empty section envelopes are silent. A result with no registered view
   shows only to `atlas.admin.manage`, under *Details for administrators*.
2. **Scope in one collapsed line.** Coverage, partial results and date ranges go under
   *About this answer*, closed by default.
3. **Sources as chips.** Chips are grouped *From this workspace* (records, attachments)
   and *From outside* (an `External` badge, the publisher and the retrieval date). Repeated
   citations of one record merge into one chip ("3 versions"), and a record chip links to
   `/app/entity/{entity}/{id}`. Only https links are accepted for outside sources
   (`external.cited` stream event, `AtlasExternalCitation`).
4. **Statements carry numbered markers.** When the envelope has `statements`, each
   sentence names the evidence it rests on. The contract rejects a statement that cites
   evidence outside the answer's own references.
5. **Plain actions.** The answer offers Copy, Helpful and Not helpful. Not helpful asks
   *What was wrong?* with reason chips. The newest answer offers up to two follow-up
   questions, which fill the composer.

**Composers.** Comments and Atlas share `ComposerFrame` and one attachment chip
(`ComposerAttachments` / `ComposerAttachment`: name, size, status, Remove). Both put
Attach (paperclip) on the leading edge of the footer and Send on the trailing edge;
comments add formatting icons (Bold, Italic, Underline, Link) and visibility, Atlas adds
the prompt library and, with more than one agent, the agent choice. Neither shows a
title row inside the box, and no menu offers "coming soon" items. `ObjectSearch` clears
with an icon so narrow searches keep their text.

**Collection controls** use one panel on that frame, `CollectionControlPanel`
(`@athyper/platform-shell/tool-panel`): header, context row (collection and result
count), section tabs (`list.controls.*` text) and the apply rule (an overlay closes,
a pinned panel stays open). Entity lists (`ListDrawerHost`) and the Notifications and
Inbox pages open it. Its sections are shared too (`collection-controls`):
`CollectionFilterEditor` (Quick filters for the fields metadata promotes, All filters for
the rest), `CollectionSortEditor` (numbered levels, drag or ⋯ menu to reorder, direction in
the field's terms such as "Newest first", "Add sort level · n of max"),
`CollectionGroupEditor`, `CollectionDensitySettings` ("Use app density") and
`CollectionViewsManager` (Available views by Standard / My / Shared, Save current
configuration; each action only when the host supplies it). Entity lists render the
same sections: they pass their richer pieces through the extension points (searchable
field picker and field catalogue for Sort and Group, layout and search behaviour around
density, read-only and browser-local views), and `ReorderMenu` / `sortDirectionKeys` in
`list-view` are re-exports of the shared ones.

`interactionRoots` names elements that stay usable while the panel is a modal overlay
(the app bar buttons that switch Notifications and Inbox); focusing one of them makes it
the place focus returns to on close.

### 2.3 Activity feed (Notifications and Inbox)

The panel and the full pages (`/notifications`, `/inbox`) render one `ActivityFeed`
inside the same section tabs and toolbar, so they cannot drift apart. The full pages
use the entity list frame: `ManagementWorkspace` with a collection `PageHeader`
(description and result count), Notifications | Inbox as `ManagementNavigation`, then
one list panel (toolbar, quick views, grouped rows) across the workspace width.
Notification preferences open in the shared side panel.

- **Reading pane (80rem and wider, `extraWide`):** the list panel splits into the
  list (2fr) and the selected item in full (3fr). The first row is shown until the
  person picks another; the row title is the control (`aria-current`,
  `aria-controls`), a click elsewhere on the row selects, and Up/Down move the
  selection. The pane shows the whole summary, full date, record, source or task
  facts, collapsed copies ("Received N more times") and only the actions the
  collection publishes (Mark as read, Dismiss, the record or task link). Below
  80rem the feed stays one column and rows carry no selection control.

- **Rows** use the list-card anatomy: a type icon (comment, work, record change,
  warning, unavailable), the title and time, a summary clamped to two lines, then the
  action and the record it belongs to. Unread is a dot on the icon, a stronger title
  and ", Unread" for assistive technology, never a filled row. Sizes come from the
  density tokens.
- **Grouping:** readable date headings (server calendar dates become Today, Yesterday,
  This week, or month and year), sticky while scrolling, shown in the panel and on the
  page as the list's group rows (label and count band, no gaps, one surface); identical consecutive
  notifications collapse into one row with "Show N similar".
- **One toolbar and controls in both places:** the activity centre and the pages render
  the same `ActivityQueryControls`. Below 40rem (always in the activity centre) the
  toolbar is the entity list's narrow row: search, then icon-only Filters and Controls
  with the applied-filter count; views move under Controls. On the page Filters and
  Controls open `CollectionControlPanel`; in the activity centre, which already owns
  the side slot, the same `CollectionControlSections` (Filters, Sort, Group, Display,
  Views) take the panel body while open (section tabs, one scrolling body, Reset and
  Apply pinned at the bottom; the feed returns on Apply, Escape or the toolbar button).
- **No section tabs in the activity centre:** the app bar's Notifications and Inbox open
  it on their section and the header names it; the pages keep Notifications | Inbox as
  section navigation. The result count is in the page header
  and in the activity centre's context row.
- **Filters:** the shared filter editor;
  applied-filter chips show choice labels, and a view's own filters (the
  Inbox's open task statuses) are the view, not chips; "Clear all" returns to the view.
- **Settings:** browser alerts are a device setting in Notification preferences; the
  list keeps only "Mark all read".
- **Notification preferences** use the side panel anatomy: header, context row ("Your
  account", "Unsaved changes" while editing), section tabs (Preferences | Delivery status,
  the second only with `notifications.delivery.read`), one scrolling body and a pinned
  footer (Discard changes, Save preferences; enabled only after a change). Preferences has a
  "This browser" section (browser alerts) and one row per channel: the channel name is the
  checkbox's accessible name and a plain-language status from the server preview describes
  it (Available, Needs your permission, Needs browser alerts on this device, Not set up for
  your organisation, Saved, but not delivered). A channel that cannot be used and is not
  saved is disabled. Delivery status lists deliveries as rows with a status pill, the
  channel and attempts; Retry needs `notifications.delivery.replay`.
- **Density** follows the app (Utilities) unless the person chose another density in
  the feed's Display settings.
- **Collapsed copies act as one row:** Mark as read and Dismiss on a row that stands
  for N identical notifications ("Mark all N as read", "Dismiss all N") apply to every
  copy, in the row menu and the reading pane (`onMarkNotificationsRead`,
  `onDismissNotifications`, one refresh).
- **Language and direction:** every activity string comes from a catalog (shell
  messages en/ar; collection controls, the pages and Notification preferences from the
  entity catalog en/ms/ar). Date groups and due labels use `Intl` in the person's
  locale. Titles, summaries and record names are user content: `dir="auto"` keeps their
  punctuation, and they align with the interface; "go to" chevrons mirror in RTL. View
  names (All activity, Unread) are published collection metadata, not interface text.

## 3. Rules and enforcement

| Rule                 | Policy                                                          | What it rejects                                                                                                                              | Use instead                                                                                                                       |
| -------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| breakpoint-scale     | `policy:ui-system`                                              | `@media`/`@container` widths in px, em or off-scale rem                                                                                      | `BREAKPOINT_SCALE` rem values                                                                                                     |
| control-height       | `policy:ui-system`                                              | fixed `height`/`min-height`/`block-size` from 1.5rem to 4rem on interactive selectors (buttons, fields, options, rows, tabs, toggles, chips) | `--a-control-height`, `--a-density-control-height-small`, `--a-touch-target`, `--a-density-row-height`, `--a-density-icon-button` |
| brand-tint-text      | `policy:ui-system` (strict: zero)                               | text placed on `--a-brand-soft` (`background` tint plus `color:var(--a-primary)`)                                                            | `--a-selection-subtle` with `--a-selection-subtle-foreground` (identical in light themes, readable in every dark theme)           |
| brand-text           | `policy:ui-system` (strict: zero)                               | `color`/`fill`/`stroke: var(--a-brand)`; the identity fill does not adapt to dark mode                                                       | `--a-primary` (equal to brand in light and high contrast, readable in dark)                                                       |
| raw-radius           | `policy:ui-system`                                              | literal radii (0, inherit and 50% circles are allowed)                                                                                       | `--a-radius-sm/md/lg/xl/full`                                                                                                     |
| raw-layer            | `policy:ui-system`                                              | `z-index` of 10 or more                                                                                                                      | `--a-z-sticky/overlay/popover/drawer/dialog/toast`                                                                                |
| native-select        | `policy:ui-system`                                              | `<select>` / `<Select>` in components                                                                                                        | see §3.1                                                                                                                          |
| colour               | `policy:design-system`                                          | colour literals outside the token authorities                                                                                                | colour role tokens                                                                                                                |
| typography           | `policy:style-tokens:strict`                                    | raw `font-size`, `font-weight`, `line-height`, `letter-spacing`                                                                              | `--a-font-size-*`, `--a-font-weight-*`, `--a-line-height-*`, `--a-tracking-*`                                                     |
| entity list (strict) | `policy:entity-list-breakpoints`, `policy:entity-list-controls` | any breakpoint or native select in list sources                                                                                              | already at zero                                                                                                                   |

Media sizes (avatars, icons, thumbnails, skeleton blocks) are deliberately fixed and are
not controls, so `control-height` does not count them.

### 3.1 Choosing a choice control

| Situation                                                                             | Control                           | Notes                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two to four options shown together                                                    | `SegmentedControl`                | radiogroup; equal segments sized to the longest label                                                                                                                                                                                                                                                                |
| A short list, one choice (page size, period, order, reason, metadata `select` widget) | `ChoiceSelect`                    | ARIA select-only combobox: arrows, Home/End, PageUp/PageDown, type-ahead, Tab accepts; groups; disabled options; `name` submits with a form; `required` takes part in native validation; the list opens in the top layer and stays inside dialogs; focus returns to the button unless the change moved it on purpose |
| A long, remote or reference list                                                      | `SearchableSelect`                | search, recent choices, server paging                                                                                                                                                                                                                                                                                |
| Small sets shown inline, one or many                                                  | `ChoiceChips` / `FilterChipGroup` |                                                                                                                                                                                                                                                                                                                      |

Tests pick a ChoiceSelect option with `chooseOption(combobox, value)` from
`tests/foundation-browser/fixtures/choice.ts` (options carry `data-value`).

**Ratchet.** Existing debt is recorded per file and per rule in
`governance/config/governance/ui-system-ratchet.json` (keys are `<file>#<rule>`, so a file
cannot trade one rule for another). A file may only lower its count. After a cleanup, run
`pnpm policy:ui-system --update-ratchet` to lock in the lower count. The theme package is
the token authority and is exempt, and so is the `Select` primitive itself until it is
retired. `policy:ui-system` runs in the `workspace` and `ci` static-policy profiles.

**Scorecard.** `pnpm report:ui-system` prints the table in §1 for the current tree. Each
phase reports its before and after figures from it.

## 4. Visual and accessibility baseline

`tests/foundation-browser/ui-baseline.spec.ts` (`pnpm test:ui-baseline`, part of
`test:root` in CI) captures one entry per **page type**, not per page. Each capture uses
the real shared runtime, the real Neon stylesheet graph (`fixtures/app-styles.ts`),
deterministic data and a fixed clock.

| Page type     | Fixture (`tooling/scripts/verification/`) | What it renders                                                                                                      |
| ------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| kit           | `ui-baseline-entry.tsx?surface=kit`       | every primitive: buttons, fields, searchable select, search, segmented, chips, checkbox, tabs, badges, panel anatomy |
| shell         | `shell-browser-entry.tsx`                 | ShellChrome: rail, top bar, profile, footer                                                                          |
| list          | `ui-baseline-entry.tsx?surface=list`      | EntityListRuntime (table on desktop and tablet, cards on phone)                                                      |
| list-controls | same, then Filters                        | WorkspaceToolPanel with list controls                                                                                |
| record        | `ui-baseline-entry.tsx?surface=record`    | EntityPageLayout + EntityRecordHeader + EntityDataSurface                                                            |
| atlas         | `ui-baseline-entry.tsx?surface=atlas`     | AtlasWorkspace dock                                                                                                  |

Each page type is captured in seven ways: `phone` 390, `tablet` 768 and `desktop` 1440
(comfortable, light); `desktop-compact` and `desktop-spacious`; and `phone-dark` and
`desktop-dark`. That is 42 captures, about 3 MB.

- **Deterministic.** Geist, the production typeface, is embedded from the repo, so
  screenshots do not depend on installed fonts. Brand assets are served from
  `apps/neon/public`. The locale is en-GB, the time zone UTC, and the clock is fixed.
- **Accessibility.** axe (WCAG 2.0 A/AA and 2.1 AA) runs on every capture. Serious and
  critical rules are ratcheted in `tests/foundation-browser/ui-baseline.a11y.json`: a new
  rule on any capture fails, with the offending elements listed.
- **Accepting a change.** Review the diff images, then run
  `pnpm test:ui-baseline --update-snapshots`. For an accessibility fix, run
  `UI_BASELINE_UPDATE_A11Y=1 pnpm test:ui-baseline` to remove the fixed entry.
- **Not yet covered.** The IAM sign-in pages are FreeMarker templates, and the existing
  fixture uses a hand-written form in place of the real template, so a screenshot would
  prove nothing. They are left out until phase 6 can render the real templates; their CSS
  is already covered by the policy. Studio authoring, Home dashboards and the record
  collaboration panels are added in the phase that changes them.

### 4.1 Defects the baseline found

The first captures showed these product defects. B1–B4 are fixed in phase 2a at the
shared layer:

- **B1:** every text use of `--a-brand` (85 rules across shell, Home, planes and foundation) now uses `--a-primary`, and the `brand-text` rule holds it at zero. Light and high-contrast captures are pixel-identical; the accessibility baseline is empty.
- **B2:** one `:where(input[type=checkbox], input[type=radio])` rule gives raw runtime inputs the Checkbox primitive's size and colour.
- **B3:** `.a-form-field` aligns its rows to the start, so a field without a hint no longer stretches beside one with a hint.
- **B4:** SegmentedControl is an equal-column grid sized to the longest label.
- **B5 (phase 3a):** one `.a-disclosure-caret` around `ChevronDownIcon` for every disclosure: record header and management "More" menus, collection rows, collapsible form sections and list field groups. Leading carets point to the inline end while closed; menu carets flip while open; RTL mirrors.

| #   | Defect                                                                                                                                        | Evidence                                                     | Phase                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| B1  | The selected record section tab is nearly invisible in dark mode: contrast 1.71:1 (`#234b84` on `#122745`) against the required 4.5:1         | `record/desktop-dark` accessibility entry and screenshot     | 2a — fixed                                          |
| B2  | Row checkboxes (list rows, form checkbox field) are unstyled browser checkboxes beside the styled design-system checkbox in the list header   | `list-*`, `record-*`                                         | 2a — fixed                                          |
| B3  | SearchableSelect in a FormField sits about 10px lower than a text Input in the same row, and its chevron divider extends below the box        | `kit-desktop` (gallery composition; confirm in record forms) | 2a — fixed                                          |
| B4  | SegmentedControl truncates a short label ("Compact" becomes "Com…") while space is free                                                       | `kit-*`                                                      | 2a — fixed                                          |
| B5  | Disclosure carets are CSS text glyphs (`content:"▾"`) instead of icons, in the record header "More", collection rows and collapsible sections | `record-*`; `shell/src/styles.css`, `ui/src/styles.css`      | 3a — fixed                                          |
| B6  | The foundation snapshots (`foundation.spec.tsx`) depend on the fonts installed on the machine and fail on this workstation                    | 3 of 5 failing before this work                              | 1 follow-up: adopt `pinnedFontFace()` and re-record |

## 5. Phases

| #   | Phase                                                                                                                                                                 | Page types                                                                 | Done when                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Baseline: policy, ratchet, scorecard, visual and accessibility baseline                                                                                               | all                                                                        | **Done (this document)**                                                                                                                                         |
| 2a  | Record detail and forms, controls: B1–B4, ChoiceSelect replaces every native select, control heights on density tokens                                                | record, kit, list                                                          | **Done**: Entity runtime control-height 0 (was 49 interactive), native-select 0 (was 17); B1–B4 closed; baseline diffs reviewed                                  |
| 2b  | Record detail and forms, width tiers: 36 off-scale queries in form-detail onto `BREAKPOINT_SCALE` (new container-only `compact` tier); 10 raw radii; 1 raw layer      | record                                                                     | **Done**: Entity runtime breakpoint-scale 0 (was 36), raw-radius 0 (was 10), raw-layer 0 (was 1)                                                                 |
| 3a  | Side panels: record collaboration (Comments, Files, Activity) on `WorkspaceToolPanel`; one disclosure caret (B5)                                                      | list-controls, record                                                      | **Done**: one panel frame for list controls and collaboration; the unpinned collaboration overlay is now a modal dialog; glyph carets 0                          |
| 3b  | Notifications and Inbox: one activity workspace on `WorkspaceToolPanel`; rows, grouping, filters, settings, density; selection colours instead of brand tint for text | activity-panel, activity-page, activity-inbox (+ Atlas Mono dark captures) | **Done**: one frame and one feed; rows about half the height; Mono dark contrast violations cleared; raw filter values and view filters no longer shown as chips |
| 3b+ | Activity pages on the entity list frame (B), the shared collection controls (A), a reading pane at 80rem+ (C) and panel parity (D) | activity-panel, activity-page, activity-inbox, activity-controls | **B, A, C and D done**: panel and page share toolbar, controls sections, group bands and count placement; two-column reading pane with keyboard selection; overdue shown as a danger pill (contrast on any row tint); empty states flat on the list panel; full width with one list panel and list group rows; Filters/Controls open the same panel and filter editor as entity lists; activity native selects 0. Sort, Group, Display and Views are shared collection sections used by entity lists and activity alike |
| 3c  | Atlas on `WorkspaceToolPanel`: one frame for every side panel | atlas | **Done**: Atlas docks, pins, resizes and overlays like Comments, Files and Notifications; its own resize, scrim, `--atlas-panel` width and `data-atlas-pinned` margin are gone; full view keeps the same mounted workspace. Answers follow one layout (§2.2 *Atlas answers*): a headline and readable data instead of field dumps, collapsed scope, workspace and outside sources as merged chips, numbered statements, and Copy / Helpful / Not helpful with follow-ups |
| 4   | Shell chrome and Home: tokens, density-neutral chrome, breakpoint cleanup (77 queries)                                                                                | shell (+ Home capture)                                                     | **Done**: shell and plane-shell findings 0 (were breakpoint-scale 82, control-height 54, raw-radius 35, raw-layer 5, native-select 3, colour 11, typography 25); scripts use `viewportQuery`, and the policy now checks `matchMedia()` widths; Inbox stays in the phone bar down to 280px; the Atlas app bar mark is no longer blank when actions are icons; Home has its own baseline |
| 5   | Workspaces: import/export, transfers, data operations                                                                                                                 | list                                                                       | **Paused (owner decision, 2026-10-02)**: the transfers page is a bespoke list; aligning it needs a registered read-model provider in the Entity Framework (virtual entity list/read handlers registered by host composition) before Data transfer can be onboarded. Front-end-only re-skinning was rejected under AGENTS.md |
| 6   | IAM sign-in and in-app IAM, Studio authoring, plane packages; docs-site colours                                                                                       | + sign-in, studio captures                                                 | **Done**: ui-system 0 (was 70), colour 1 (was 103; the Atlas brand icon mask, kept inline because the icons package has no stylesheet), typography 0 (was 178). IAM sign-in and the identity gate split at `wide`; shared UI controls follow density; docs colours generated from the theme (`docs-theme:check`) |

Every phase uses the method that worked on lists:

1. Measure with the scorecard and the baseline.
2. Fix the shared layer, not individual screens.
3. Add a regression test for each defect.
4. Review before-and-after captures.
5. Retighten the ratchet.
6. Report implemented, published and verified-in-the-running-app separately.

## 6. Commands

| Command                                    | Purpose                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `pnpm policy:ui-system`                    | ratcheted layout and control rules (CI)                          |
| `pnpm policy:ui-system --update-ratchet`   | lock in lower counts after a cleanup                             |
| `pnpm report:ui-system`                    | per-area scorecard across all design-system rules                |
| `pnpm test:ui-baseline`                    | page-type visual and accessibility baseline (CI via `test:root`) |
| `pnpm test:ui-baseline --update-snapshots` | accept reviewed visual changes                                   |
