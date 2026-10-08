# Entity list Gantt — blueprint

**Status:** proposed, revision 1 (8 October 2026). Not implementation authority. Owner decisions are listed in section 14; none is approved yet. It incorporates two audit rounds on the proposal that preceded it (section 16).

**Scope and authority.**

- This is the design for the shared Entity list **Gantt** view mode: records as rows, each drawn as a bar across a time scale. Gantt is available to **any** eligible Entity through governed, published Meta Entity properties. No entity name, allowlist or entity-specific branch appears in framework code.
- **Authority.** Gantt is a list view mode of the shared Entity Framework, on the same footing as Board and Calendar: Entity onboarding and shared Entity Framework work under [AGENTS.md](../../../AGENTS.md).
  - The Studio blueprint's §11.6.1 "Calendar/Gantt" row is parked and is **not** cited as authorization.
  - Gantt adds no query provider; the existing list query is the provider.
- **Shared foundation.** Gantt builds on the [shared list layout foundation](../entity-list-layouts/foundation.md): the mode registry, `unavailableModes` with reason codes and no fall-through, `cardContent` and the shared record card, per-viewer availability, the count-mode rule (section 5) and the draft-comparison rule (section 6).
- **Sibling layout.** Gantt shares Calendar's date-range semantics, queries and paging. Those are factored into a shared runtime module first (section 4, P-G1). The [Entity list Calendar blueprint](../entity-list-calendar/blueprint.md) stays the authority for Calendar; nothing in this document changes an approved Calendar property.
- **Authoring authority.** The [Entity Studio blueprint](../entity-studio/blueprint.md) remains the authority for authoring storage, the codec, the compiler and the composer.
- Update this document in place. Do not create competing Gantt plans.

## Contents

1. Principles
2. Eligibility for any Entity
3. Current-state facts this design relies on
4. Prerequisites
5. Contract properties
6. Validation, availability and finding codes
7. Query semantics
8. Views and interaction
9. Studio authoring and composer homes
10. Registration inventory for new authoring members
11. Folder structure and test registration
12. Delivery phases and acceptance
13. Dependencies and risks
14. Decisions required
15. Rejected options
16. Review disposition

## 1. Principles

1. **Gantt is a view mode of the shared list.** It is a renderer over the existing list query, with no page, route, provider stack or project service of its own. The mode key is `gantt`; `timeline` is already a typed activity view (`ActivityView`).
2. **Metadata declares every mapping.** Date ranges, the group field, the progress field and the default zoom are explicit Meta Entity properties. The framework never picks a field by type or name.
3. **Calendar's date semantics apply unchanged.** A `date` end is inclusive and a `datetime` end exclusive; a null start is unscheduled; a null end is open-ended. Gantt reuses the shared helper that implements these rules (P-G1) rather than restating them.
4. **Milestones are declared, never inferred** (section 7, "Milestones"). A one-day date range is a one-day bar.
5. **The server owns the window, the order and the cursor; the renderer owns presentation.** Grouping, bar geometry and the today line never change the paging order.
6. **Fail closed and say why.** An unusable Gantt is reported per viewer with a reason code and is never drawn as another mode.
7. **No record is hidden.** Records without a start appear in the Unscheduled tray. A window with more rows than are loaded says so, and the row ceiling says so (section 7).
8. **No UUID and no synthesized identity.** The row label is the published readable identity and, when declared, the title role. The internal record ID is used only for ordering and the cursor.
9. **A navigable position is location state** (Calendar principle 8). The Gantt anchor lives in the URL only; saved views keep the date field and zoom.
10. **Read-only in Phase 1.** Dependencies, hierarchy and rescheduling are later phases, each with its own approval.

## 2. Eligibility for any Entity

A list surface may declare Gantt when all of the following hold. Studio validation enforces every rule. The list service re-checks the rules marked † for each viewer.

| Rule                                                                                                                                                                                                                                                                                                                      | Source                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `gantt` is in `supported_modes`, and a qualified `ui_component_contract` row for the list host declares `gantt`                                                                                                                                                                                                           | `entity_surface.supported_modes`, component catalogue |
| 1–3 date ranges, each a placement on this same list surface †; the same eligibility per field as Calendar section 2 (start `date` or `datetime`, readable, unmasked, sortable, `gte` and `lt`, `is_null` when nullable; an optional end of the same kind with `gte`/`gt`, plus `is_null` and `is_not_null` when nullable) | Gantt date-range rows                                 |
| An optional tone, as Calendar's (an entity-owned enum with published choice tones); unreadable or masked degrades to neutral †                                                                                                                                                                                            | `entity_field_choice`                                 |
| An optional group field: an entity-owned enum with a published choice projection and at most 50 choices, readable, unmasked, groupable — the Board lane-field rule (Board section 2) †; unusable for a viewer means rows are shown ungrouped                                                                              | field metadata                                        |
| An optional progress field of kind `integer` or `decimal`, readable and unmasked, holding a percentage (section 7, "Progress") †; unusable for a viewer means no progress fill                                                                                                                                            | field metadata                                        |
| A default zoom from the renderable set (Phase 1: `month`, `quarter`, `year`)                                                                                                                                                                                                                                              | Gantt surface row                                     |
| `gantt` in `supported_modes` and at least one date-range row require each other †                                                                                                                                                                                                                                         | cross-row check                                       |

**Count mode is not required,** for the same reason as Calendar: Gantt shows counts only under the foundation's count-mode rule.

**Calendar and Gantt declarations are independent.** An entity may declare Calendar, Gantt, both or neither, and may declare the same date field in both. That is not a duplicate: each layout owns its own list (for example, Calendar by due date and Gantt by start to end). Validators must not forbid it.

## 3. Current-state facts this design relies on

Verified against the repository on 8 October 2026.

| Fact                                                                                                                                        | Evidence                                                                                                  | Consequence                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `gantt` is not a reserved mode                                                                                                              | `ENTITY_LIST_VIEW_MODES` = table, compact, board, dashboard, spreadsheet, calendar (`view-modes.ts`)      | Reserving it is a contract change (section 5.1)                    |
| `timeline` is a typed activity view                                                                                                         | `ActivityView = "timeline" \| "auditLog" \| "versions" \| "snapshots"` (`entity-runtime/src/activity.ts`) | The mode is named `gantt`                                          |
| Calendar's model has 18 exports and its data module 2                                                                                       | `calendar/calendar-model.ts`, `calendar/calendar-data.ts`                                                 | P-G1 names the split: 12 move, 4 generalize, 4 stay (section 4)    |
| `placeEntries` already applies inclusive date ends, exclusive datetime ends and open-ended ends, and computes each entry's last covered day | `calendar-model.ts`                                                                                       | Bars and the milestone predicate reuse it (section 7)              |
| End-field nullability is published                                                                                                          | Calendar decision 12, landed `21054d33a`                                                                  | No wasted open-ended query when the end is required                |
| The temporal package has month and week windows but no quarter or year windows and no day-offset helper                                     | `temporal/src/calendar-math.ts`                                                                           | P-G2 expands the module and renames it                             |
| `number.progress` reads a number, clamps it to 0–100 and rounds it, then emits card markup                                                  | `card-renderers.tsx:27–35`                                                                                | Gantt reuses the reading and bounds, not the markup (section 7)    |
| Page sizes are declared per entity                                                                                                          | `limits.allowedPageSizes` (for example `[10, 25, 50]`)                                                    | The row ceiling is counted in rows, not pages (section 7)          |
| Relation authoring tables exist, but published relationships are empty and there is no relation read route                                  | `entity_relation*` DDL; `relationships: []` (`split-read-runtime.ts:198`)                                 | Dependencies need published link metadata and a read path: Phase 2 |
| `gantt` is unused in URL state                                                                                                              | `url-state.ts`                                                                                            | `gantt`, `gantt.zoom` and `gantt.field` are free                   |

## 4. Prerequisites

**P-G1 — Shared date-range runtime module.** Calendar's generic helpers move to `packages/platform/entity/runtime/list-view/src/date-range/`, beside `board/` and `calendar/`. The rules stay in the foundation document; only code moves. The split covers all 20 exports:

| Group            | Count | Exports                                                                                                                                                                                                                     |
| ---------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Move unchanged   | 12    | `windowEdge`, `windowFilters`, `openEndedFilters`, `trayFilters`, `calendarQueryState`, `mergeRows`, `placeEntries`, `CalendarEntry`, `compareWithinDay`, `agendaByDay` (model); `useCalendarPages`, `CalendarPages` (data) |
| Generalize       | 4     | `calendarSelection`, `CalendarContext`, `calendarPageState` (read `surface.calendar` and `mode === "calendar"`); `calendarWindow` (Calendar-shaped by its view)                                                             |
| Stay in Calendar | 4     | `entriesByDay`, `weekLayout`, `WeekBar`, `CALENDAR_LANES_PER_WEEK`                                                                                                                                                          |

Three commits, each reviewable on its own:

1. **Move-only.** The 12 exports move with their names and tests unchanged; Calendar imports them from `date-range/`. No behaviour change; the Calendar browser spec passes unchanged.
2. **Rename.** Mechanical renames to layout-neutral names (for example `CalendarEntry` → `DatedEntry`, `calendarQueryState` → `dateRangeQueryState`, `useCalendarPages` → `useDateRangePages`). The contract type `ListCalendarDateFieldV1` gains the neutral name `ListDateRangeFieldV1`, and the Calendar name stays as an alias, so no published contract changes.
3. **Generalize.** The four layout-bound helpers take the layout's date-range declaration and state as parameters instead of reading Calendar's. Calendar's behaviour and tests are unchanged.

**P-G2 — Date-scale module.** `temporal/src/calendar-math.ts` now serves two layouts.

1. **Move-only rename** to `date-scale.ts`. The package re-exports it from its root, so no consumer import changes.
2. **Expansion, with tests:** quarter and year windows aligned as section 7 states, and a day-offset helper (`daysBetween`) for bar geometry.

**Dependency (closed):** Calendar decision 12 (`endNullable`), landed as `21054d33a`. Gantt cites it and reopens nothing.

## 5. Contract properties

Studio authoring rows are typed and normalized; nothing is stored in `layout_config`. Compiled JSON is derived output.

### 5.1 Runtime reservation (Gantt runtime step)

| Property                 | Shape                                        | Consequence                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENTITY_LIST_VIEW_MODES` | adds `"gantt"`                               | The browser and server mode types, the parser lists and `unavailableModes` admit it. `ENTITY_LIST_RENDERABLE_MODES` is unchanged; Gantt is offered only through its per-viewer resolver, like Board and Calendar. |
| Component catalogue data | the list host component row declares `gantt` | A publication gate, as for Calendar: without it no real entity can publish Gantt                                                                                                                                  |

### 5.2 Studio authoring shape (Gantt authoring step, gated on the metadata cleanup)

| Table / column                                                           | Columns                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity_surface.supported_modes`                                         | admits `gantt` (typed guard regenerated)                                                                                                                                                                                                                                      |
| **New** `entity_surface_gantt` (one row per surface that declares Gantt) | `entity_surface_id` (primary key), `default_zoom` (`month` \| `quarter` \| `year`), `group_field_binding_id` (nullable), `progress_field_binding_id` (nullable)                                                                                                               |
| Date-range rows                                                          | Decision 8: either a shared `entity_surface_date_range` table with a `layout` discriminator (`calendar` \| `gantt`), amending Calendar section 5.2 before Calendar's authoring is built, or a separate `entity_surface_gantt_field` mirroring `entity_surface_calendar_field` |

### 5.3 Integrity rules

| Rule                                                                                            | Enforcement                             | Consequence                                                  |
| ----------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| `gantt` ⇔ an `entity_surface_gantt` row ⇔ at least one Gantt date-range row                     | hand-written draft cross-row validation | No Gantt option without date ranges or a default zoom        |
| Unique start field per surface and layout; dense `position`                                     | generated (`unique`, `ordered`)         | A start field is declared once per layout, in a stable order |
| Every binding (date, tone, group, progress) is on the row's surface                             | hand-written deferred guard             | No cross-surface mappings                                    |
| End kind equals start kind; tone and group fields are enums; progress is `integer` or `decimal` | hand-written deferred guard             | No kind mixing                                               |
| Bounds (1–3 date ranges); eligibility in section 2                                              | Studio completeness validation          | Bounded, explainable findings                                |

### 5.4 Component catalogue data

The list host declares `gantt`. Row labels reuse the shared identity and title formatting; the phone list reuses the shared record card. No new display component is registered.

### 5.5 Published runtime descriptor

Added to `EntityListPresentationDescriptor` and parsed explicitly by `parseListPresentation`:

```ts
gantt?: {
  defaultZoom: "month" | "quarter" | "year";
  dateFields: readonly {           // the same shape as calendar.dateFields
    start: string;
    end?: string;
    tone?: { field: string;
             choices: readonly { value: string; label: string; tone: EntityStatusTone }[] };
  }[];
  group?: { field: string };       // entity-owned enum, Board lane-field rule
  progress?: { field: string };    // integer or decimal, a percentage
};
```

### 5.6 Browser descriptor and state

```ts
surface.gantt?: {
  defaultZoom: "month" | "quarter" | "year";
  dateFields: readonly ListDateRangeFieldV1[];   // Calendar's shape, incl. endNullable and unscheduled
  group?: { field: string; label: string;
            choices: readonly { value: string; label: string; tone?: EntityStatusTone }[] };
  progress?: { field: string; label: string };
};
SaveableListStateV1.gantt?: { dateField: string; zoom: "month" | "quarter" | "year" };
ListLocationStateV1.ganttAnchor?: string;        // YYYY-MM-DD; location only, never saved
```

- **Row label.** No new property: the label is the published `entity.identityField` and, when declared, the field with `semanticRole: "title"`. Both are already published and validated, including the no-UUID rule, and the existing descriptor validation fails closed when they are invalid.
- **URL.** `view=gantt` selects the mode; `gantt=YYYY-MM-DD` is the anchor; `gantt.zoom=` and `gantt.field=` carry the zoom and date field. This mirrors Calendar's split and leaves Calendar's approved `calendarAnchor` untouched.
- **Saved views** keep `dateField` and `zoom`, never the anchor. A saved or URL zoom the descriptor cannot render is normalized to `defaultZoom`; a date field that is no longer usable falls back to the first usable one with the existing notice. Display state only, so normalizing never widens results.
- **Query contract.** Calendar's applies unchanged (Calendar section 5.6): an explicit start-ascending sort on every query, constant sort and filters across pages, the largest allowed page size.

### 5.7 Later phases (shape only; each needs its own approval)

| Phase                  | Addition                                                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2a Dependencies        | A declared link between records of the entity, published as relation metadata, plus a server read path returning only links between records the viewer can already read. Arrows are a decorative overlay; the accessible text lists each record's predecessors. Critical path is out of scope. |
| 2b Hierarchy           | A declared parent reference; indented, collapsible rows                                                                                                                                                                                                                                        |
| 2c Extra label columns | Declared columns beside the label (for example assignee); a new property, raised then                                                                                                                                                                                                          |
| 3 Reschedule           | Drag or resize through the existing patch operation, with its authorization, audit and idempotency                                                                                                                                                                                             |

## 6. Validation, availability and finding codes

| Layer                       | Behaviour                                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Studio validation           | `GANTT_DATE_FIELD_REQUIRED`, `GANTT_DATE_FIELD_INELIGIBLE`, `GANTT_DATE_FIELD_SURFACE_MISMATCH`, `GANTT_END_FIELD_KIND_MISMATCH`, `GANTT_DATE_FIELD_LIMIT`, `GANTT_TONE_FIELD_INELIGIBLE`, `GANTT_GROUP_FIELD_INELIGIBLE`, `GANTT_PROGRESS_FIELD_INELIGIBLE`, `GANTT_DEFAULT_ZOOM_REQUIRED`, `GANTT_DEFAULT_ZOOM_UNSUPPORTED`, `LIST_MODE_UNSUPPORTED` |
| Published-descriptor parser | Structurally invalid `gantt` rejects the descriptor at load; `gantt` ⇔ `supportedModes` includes `gantt`. A `defaultZoom` outside the renderable set is rejected, never downgraded.                                                                                                                                                                    |
| List service (per viewer)   | Gantt moves to `unavailableModes` with `LIST_GANTT_DATE_FIELD_UNAVAILABLE` when no declared date range is usable. Only usable date ranges are offered. An unusable tone, group or progress field is omitted for that viewer, so rows render neutral, ungrouped or without fill; the viewer cannot read that field, so nothing about it is shown.       |
| Browser                     | The shared foundation behaviour applies: a disabled Layout option with its reason; a fallback with notice for saved or URL state; no fall-through.                                                                                                                                                                                                     |

## 7. Query semantics

**Zoom and window.** The zoom names the span the chart shows; the columns are one step finer. Window edges are inclusive start, exclusive end.

| Zoom      | Window                                                                                     | Columns | ‹ › step    |
| --------- | ------------------------------------------------------------------------------------------ | ------- | ----------- |
| `month`   | the anchor's month                                                                         | days    | one month   |
| `quarter` | the anchor's calendar quarter, widened to whole weeks starting on the person's `weekStart` | weeks   | one quarter |
| `year`    | the anchor's calendar year                                                                 | months  | one year    |

The wire format, the window and open-ended queries, their disjointness, the tray query and the request budget are Calendar's (Calendar section 7), through the shared helpers (P-G1).

**Rows and order.** One row per record returned by the window and open-ended queries, merged without duplicates (`mergeRows`). Server order is start ascending, then the internal record ID. A record from the open-ended stream started before the window, so when its page loads it can land among rows already shown; the view keeps start order rather than appending, and this is expected behaviour.

**Row budget.**

- Each query loads one page at the largest allowed page size; "Load more rows" loads the next page of each stream that has one.
- **Ceiling:** at most `GANTT_ROW_CEILING` = 500 rows are drawn. It is a framework rendering budget, not entity configuration: a named exported constant, used by both the loader and the notice, with a test that the two agree.
- When more rows exist than are loaded: "More records than fit in this period. Showing the first N." At the ceiling: "Showing the first 500 records. Narrow the period or add filters." With exact counts, the wording is "Showing N of M".

**Bars.** Bar geometry comes from the entry's first and last covered day (`placeEntries`), clipped to the window, with continuation markers where it is clipped. An open-ended record is hatched to the window end with the open-ended marker. Phase 1 draws at day granularity; a `datetime` bar's accessible name carries the exact times.

**Milestones.** Declared, never inferred:

- A date range declared **without** an end field draws each record as a milestone (a point) on its start.
- A `datetime` range whose end equals its start, to the instant, is a zero-length point and draws as a milestone.
- A `date` range whose end equals its start is a **one-day bar**, because a date end covers the whole day.

This costs nothing new: `placeEntries` already distinguishes "covers one day" from "zero length" through its inclusive and exclusive end rules, so the milestone rule is a predicate over values the shared helper already computes.

**Groups.** With a group field, rows are grouped in the renderer over the loaded rows, in published choice order, then a "No value" group, then one "Other values" group for values that are not published choices. No row is hidden. Group order never changes paging. A group's count is shown only under the count-mode rule and only when every row of the window is loaded, so a count is never partial.

**Progress.** The progress field holds a percentage. Its value is read as a number, clamped to 0–100 and rounded, the same reading and bounds as the `number.progress` renderer. A null or non-numeric value draws no fill. The bar's accessible name states the percentage. Gantt draws its own fill; it does not reuse the card markup.

**Unscheduled tray.** Calendar's, unchanged: a separate `start is_null` query, collapsed, one page and Load more, a count only under exact counts.

## 8. Views and interaction

**Navigation (inside the Gantt body; not a mode switch).** The period title, then Today and ‹ ›, then a "Dates by" control when more than one date range is usable, and a Month | Quarter | Year zoom control. The mode itself is chosen in Display settings → Layout, as for Board and Calendar.

**Chart.**

- A label column with the readable identity and, when declared, the title; the label opens the record, and the row menu sits beside it.
- A two-tier time scale: the upper tier names months (or quarters, or years), the lower tier the columns.
- Bars in tone colour with a progress fill; milestones as diamonds; a today line; muted out-of-window context is not drawn.
- The chart fits the width at every zoom, so the page never scrolls sideways. Rows follow the list density (comfortable or compact).
- Weekend shading is not inferred, as in Calendar.

**Phone (narrow tier).** The dated list from the shared `agendaByDay`, each record shown once on its first day in the window, as the shared record card with its "when" line. Zoom is hidden at this width; this is not an error.

**Right to left.** The time axis runs right to left; bars, markers and navigation mirror. Bidi-mirrored glyphs (‹ ›) are not flipped again.

**Keyboard and accessibility.**

- The chart is a `grid`: each row has a `rowheader` (the label) and a `gridcell` (the bar).
- Up and Down move between rows; Home and End go to the first and last row; Enter opens the record; PageUp and PageDown move the window by one step; group rows carry a toggle button with `aria-expanded`.
- Each bar's accessible name gives the label, the dates (or "milestone", or "open-ended"), and the progress when declared. The today line and continuation markers are decorative.
- Tone is never the only signal, and each tone keeps 4.5:1 text contrast in light and dark themes.

**Empty states.** As Calendar: "Nothing scheduled in {period}", the reason, and a pointer to the tray when it has records.

**Display settings.** In Gantt mode the Group drawer is hidden; grouping comes only from the declared group field.

## 9. Studio authoring and composer homes

Gantt properties are authored in the existing list-surface composer, beside Calendar's, after the metadata cleanup. Every property has a database location (section 5.2), a typed API, a save and load mapping, validation (section 6) and a compiler mapping (section 5.5), per the Entity Studio blueprint. The composer chain is the one recorded in Board section 13.

## 10. Registration inventory for new authoring members

The same nine steps as Calendar section 10, for `entity_surface_gantt` and the date-range rows: the Studio dictionary section, contract members, generated output, hand-written guards, reconciliation, storage and qualification sites, generated types, a forward upgrade listed in `manifests/studio.txt`, and no change for existing drafts.

## 11. Folder structure and test registration

| Path                                                                      | Content                                                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/contracts/platform/entity-list/src/gantt.ts`                    | Gantt browser contract, parser and state normalization                                  |
| `packages/platform/foundation/temporal/src/date-scale.ts` (+ test)        | P-G2                                                                                    |
| `packages/platform/entity/runtime/list-view/src/date-range/`              | P-G1 shared helpers                                                                     |
| `packages/platform/entity/runtime/list-view/src/gantt/`                   | `gantt-model.ts` (geometry, milestones, groups, ceiling), `gantt-view.tsx`, `gantt.css` |
| `server/packages/platform/metadata/src/list-gantt-descriptor.ts` (+ test) | published-descriptor parsing                                                            |
| `server/packages/services/records/src/list-gantt.ts` (+ test)             | per-viewer resolver                                                                     |
| `tests/foundation/entity-list-gantt-model.test.ts`                        | model tests                                                                             |
| `tests/foundation-browser/entity-list-gantt.spec.ts`                      | browser spec, registered beside the Calendar spec                                       |

Styles stay on the entity list breakpoint scale (40/48/64rem) and use design-system tokens only.

## 12. Delivery phases and acceptance

| Step        | Scope                                                  | Acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P-G1, P-G2  | Shared module and date-scale                           | Move-only commits verified by diff; Calendar's model, browser and temporal tests pass unchanged; new window and offset helpers tested, including DST weeks and leap years                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| G-runtime   | 5.1, 5.5, 5.6; resolver; chart, tray, phone list; i18n | Two **synthetic** entities, one `date` with nullable start and end and a group field, one `datetime` in a non-UTC zone with progress: **(a)** bars span their first to last covered day, clipped with markers at the window edges; **(b)** a date range with end = start is a one-day bar, a range without an end field draws milestones, a zero-length datetime draws a milestone; **(c)** an open-ended record is hatched to the window end and appears once; **(d)** rows follow start order across both streams, and Load more keeps sort and filters; **(e)** the overflow and ceiling notices appear at the right thresholds, the ceiling constant and notice agree, and "N of M" appears only under exact counts; **(f)** groups follow published choice order, then No value, then Other values, and group counts appear only under the count rule when complete; **(g)** progress clamps to 0–100 and its percentage is in the accessible name; **(h)** a masked start field gives a disabled option with `LIST_GANTT_DATE_FIELD_UNAVAILABLE`, and masked group or progress fields degrade silently; **(i)** a published `defaultZoom` outside the set is rejected at parse, and a saved or URL zoom is normalized; **(j)** a saved view round-trips `dateField` and `zoom`, and the anchor appears only in the URL; **(k)** no UUID pattern appears in the DOM; **(l)** phone shows the dated list, RTL mirrors the axis, keyboard navigation works; **(m)** tones hold 4.5:1 contrast in light and dark |
| G-authoring | 5.2–5.4, sections 9 and 10                             | Behind the metadata-cleanup gate, as Calendar's authoring                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**Fixture boundary.** The synthetic entities are test data, modelled like Board's and Calendar's. Any Gantt need for new entity metadata, a new table or a real pilot entity is Entity onboarding with its own approval, not a layout fixture.

## 13. Dependencies and risks

| Dependency or risk                              | Consequence                                                                                   | Handling                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Metadata cleanup                                | Gantt authoring and real publication wait                                                     | G-runtime proceeds on fixtures, as Calendar did                                          |
| Component catalogue row                         | Without it no real entity can publish Gantt                                                   | A publication gate, listed with Calendar's                                               |
| Shared-reference products (Board decision 14.8) | Country and State Region compile their list in code without per-field flags or declared modes | Gantt for them waits for the 14.8 work; their data has no business date ranges anyway    |
| No meaningful pilot data today                  | Country has no ranges; `updated_at` would draw only milestones                                | The real pilot comes with project-management onboarding (tasks with start and due dates) |
| Dependencies need relation metadata             | Not published and no read route today                                                         | Phase 2a, its own approval                                                               |
| Rows reorder as open-ended pages load           | Mild visual movement after Load more                                                          | Stated as expected behaviour (section 7)                                                 |

## 14. Decisions required (project owner)

1. **P-G1, shared date-range module.** Approve the split (12 move, 4 generalize, 4 stay, 20 in all) and the three commits: move-only, rename, generalize.
2. **P-G2, date-scale module.** Approve the move-only rename of `calendar-math.ts` to `date-scale.ts` and its expansion with quarter and year windows and `daysBetween`.
3. **Gantt runtime contract.** Approve sections 5.1, 5.5 and 5.6 and the section 6 codes, including the row label from the existing identity and title (no new property) and the URL and saved-state split.
4. **Zoom set and windows.** Month, Quarter and Year as defined in section 7, with Quarter as the recommended default for new declarations.
5. **Row budget.** Load more rows up to `GANTT_ROW_CEILING` = 500, a named constant with a test, with the notices in section 7.
6. **Milestones declared only** (section 7).
7. **Group and progress fields.** Group by the Board lane-field rule, rendered over loaded rows; progress as an `integer` or `decimal` percentage clamped to 0–100.
8. **Authoring storage for date ranges.** **Recommendation:** one shared `entity_surface_date_range` table with a `layout` discriminator, amending Calendar section 5.2 before Calendar's authoring is built (neither table exists yet), so the two layouts share one guard and registration set. **Alternative:** a separate `entity_surface_gantt_field` mirroring Calendar's. Either way, the build waits behind the metadata-cleanup gate.
9. **Phase 1 scope.** Read-only; dependencies, hierarchy, extra columns and rescheduling are separate approvals.
10. **Verification** on synthetic fixtures, with the fixture boundary in section 12.
11. **AGENTS.md pointer**, worded like Calendar's, linking this blueprint and the foundation by their stable paths.

## 15. Rejected options

- **A third-party Gantt library** (for example Frappe Gantt or DHTMLX): licensing and bundle cost, a mismatch with the design system, weak accessibility, and a data model that would bypass the list query. Calendar's month grid was likewise built rather than delegated to `react-day-picker`.
- **A Gantt page, project app or separate API.** AGENTS.md forbids bespoke applications.
- **The mode name `timeline`.** It is a typed activity view.
- **Inferring milestones from start = end on a date range.** A one-day task is not a milestone.
- **A new row-label property.** The surface already publishes the readable identity and the title role.
- **Computing dependencies in the browser from loaded rows.** A viewer sees one page at a time, so links to other pages would be missing.
- **Reusing Calendar's `calendarAnchor` as a shared anchor.** It would rename an approved Calendar contract; Gantt mirrors the shape instead.
- **A horizontally scrolling chart.** Every zoom fits the width; sideways page scroll is a layout defect.

## 16. Review disposition

| Review item                                                                                                           | Disposition                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1: reuse claims verified (queries, date helpers, `timeline` taken, relation read path missing, phone list, grouping) | Recorded as section 3 facts                                                                                                                                                     |
| A1: name the helper split                                                                                             | Section 4, P-G1 table. The audit's 11/7 split was corrected in A2: `placeEntries`, `agendaByDay` and the paging hook move; four layout-bound helpers are generalized; four stay |
| A1: shared code belongs in the runtime, rules in the foundation                                                       | P-G1 module at `list-view/src/date-range/`; rules stay in the foundation document                                                                                               |
| A1: rename the temporal module and expand it                                                                          | P-G2                                                                                                                                                                            |
| A1: the left label column is a new property                                                                           | Withdrawn in A2: the identity and title role are already published and validated (section 5.6)                                                                                  |
| A1: `endNullable` is a prerequisite                                                                                   | Closed dependency: Calendar decision 12, landed `21054d33a` (section 4)                                                                                                         |
| A1: five missing decisions (row budget, label column, milestones, zoom and anchor state, multiple ranges)             | Sections 5.6 and 7; decisions 3–6                                                                                                                                               |
| A2: milestone rule costs nothing because `placeEntries` already knows one day from zero length                        | Stated in section 7                                                                                                                                                             |
| A2: the ceiling must be a named constant with a test                                                                  | Section 7 and decision 5                                                                                                                                                        |
| A2: state the progress field's type and bounds                                                                        | Section 2 and section 7                                                                                                                                                         |
| A2: Calendar and Gantt lists are independent                                                                          | Section 2                                                                                                                                                                       |
| A2: fixture boundary                                                                                                  | Section 12                                                                                                                                                                      |
