# Entity list Gantt — blueprint

**Status:** approved for build, revision 3 (8 October 2026). Decisions 1–7 and 9–12 were approved by the project owner (nchandravel-atlas) on 8 October 2026 by the instruction to build this blueprint, in these words: "start build \\wsl.localhost\Ubuntu-24.04\home\chandravel_natarajan\src\athyper\docs\blueprints\entity-list-gantt\blueprint; prototype attached in \\wsl.localhost\Ubuntu-24.04\home\chandravel_natarajan\src\athyper\docs\prototypes\Neon Gantt Prototype". Decision 8 (authoring storage) remains open; it is needed only for the authoring step, which waits behind the metadata cleanup. Revision 3 adds the build-time clarifications from the owner-supplied prototype (section 16) with no change of intent. It incorporates two audit rounds on the proposal, two reviews of revision 1 and 2, and the prototype review.
- **Authoring path today (reconciled 10 October 2026).** Until the Studio migration lands, this layout's published declaration travels in `entity_surface.layout_config`, the blob the [Entity Studio blueprint](../entity-studio/blueprint.md) forbids for new authoring. The normalized authoring tables this document proposes are behind the metadata-cleanup gate.

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
7. **No record is hidden silently.** Records without a start appear in the Unscheduled tray. A window with more rows than are loaded says so. The row ceiling (section 7) bounds what this view loads and draws: records beyond it are not reachable in Gantt, only by narrowing the period, filtering or switching to Table, and the notice says exactly that.
8. **No UUID and no synthesized identity.** The row label is the published readable identity and, when declared, the title role. The internal record ID is used only for ordering and the cursor.
9. **A navigable position is location state** (Calendar principle 8). The Gantt anchor lives in the URL only; saved views keep the date field and zoom.
10. **Read-only in Phase 1.** Dependencies, hierarchy and rescheduling are later phases, each with its own approval.

## 2. Eligibility for any Entity

A list surface may declare Gantt when all of the following hold. Studio validation enforces every rule. The list service re-checks the rules marked † for each viewer.

| Rule                                                                                                                                                                                                                                                                                                                      | Source                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `gantt` is in `supported_modes`, and a qualified `ui_component_contract` row for the list host declares `gantt`                                                                                                                                                                                                           | `entity_surface.supported_modes`, component catalogue |
| 1–3 date ranges, each a placement on this same list surface †; the same eligibility per field as Calendar section 2 (start `date` or `datetime`, readable, unmasked, sortable, `gte` and `lt`, `is_null` when nullable; an optional end of the same kind with `gte` (date) or `gt` and `eq` (datetime, decision 13), plus `is_null` and `is_not_null` when nullable) | Gantt date-range rows                                 |
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
| Calendar's model had 18 exports and its data module 2 (before P-G1; see the reconciliation under the section 4 map)                                                                                       | `calendar/calendar-model.ts`, `calendar/calendar-data.ts`                                                 | P-G1 names the split: 12 move, 4 generalize, 4 stay (section 4)    |
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

Two commits, each reviewable on its own:

1. **Move and rename the 12 generic exports.** They move to `date-range/` under layout-neutral names in the same commit, so no tree ever has `date-range/` exporting Calendar names. They are runtime-internal, not published contract types, so the rename carries no published-surface risk. Bodies are unchanged apart from the identifiers in the map below; the review checks the diff against that map. Every call site of a renamed identifier changes in the same commit, including `entriesByDay` and `weekLayout`, which stay in Calendar and consume `DatedEntry`, and `tests/foundation/entity-list-calendar-model.test.ts`. Calendar's model, browser and temporal tests pass unchanged.

   | #   | From (`calendar/`)                      | To (`date-range/`)                                   |
   | --- | --------------------------------------- | ---------------------------------------------------- |
   | 1   | `windowEdge` (`calendar-model.ts`)      | `windowEdge` (`date-range-model.ts`), name unchanged |
   | 2   | `windowFilters`                         | `windowFilters`, unchanged                           |
   | 3   | `openEndedFilters`                      | `openEndedFilters`, unchanged                        |
   | 4   | `trayFilters`                           | `trayFilters`, unchanged                             |
   | 5   | `calendarQueryState`                    | `dateRangeQueryState`                                |
   | 6   | `mergeRows`                             | `mergeRows`, unchanged                               |
   | 7   | `placeEntries`                          | `placeEntries`, unchanged                            |
   | 8   | `CalendarEntry`                         | `DatedEntry`                                         |
   | 9   | `compareWithinDay`                      | `compareWithinDay`, unchanged                        |
   | 10  | `agendaByDay`                           | `agendaByDay`, unchanged                             |
   | 11  | `useCalendarPages` (`calendar-data.ts`) | `useDateRangePages` (`date-range-data.ts`)           |
   | 12  | `CalendarPages` (`calendar-data.ts`)    | `DateRangePages` (`date-range-data.ts`)              |

   `calendar-data.ts` is removed, because both its exports move. `calendar-model.ts` keeps the four Calendar exports and, until commit 2, the four layout-bound helpers.

   *Reconciled (11 October 2026):* rows 11 and 12 shipped as mapped (`9bef62cfd`). `date-range-data.ts` was later removed when the shared secondary paging hook `useListPages` / `ListPages` (`list-view/src/list-pages.ts`, `8dfb17ec3`) replaced `useDateRangePages` and the Board lane's copy (layout foundation, secondary query paging). This map is the record of P-G1, not work to do; `calendar-model.ts` now has 8 exports.

2. **Rename and generalize the four layout-bound helpers.** `calendarSelection`, `CalendarContext`, `calendarPageState` and `calendarWindow` take the layout's date-range declaration and state as parameters instead of reading Calendar's, and get neutral names in the same change, because the rename and the parameter change touch the same hunks.

   | From (`calendar-model.ts`) | To                                           | Change                                                                                                                    |
   | -------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
   | `calendarSelection`        | `dateRangeSelection` (`date-range-model.ts`) | takes the layout's date-range declaration and its saved choice instead of reading `surface.calendar` and `state.calendar` |
   | `CalendarContext`          | `DateRangeContext`                           | unchanged fields (`timeZone`, `weekStart`, `today`)                                                                       |
   | `calendarPageState`        | `dateRangePageState`                         | takes the active layout's mode, declaration and window instead of testing `mode === "calendar"`                           |
   | `calendarWindow`           | `periodWindow` (`temporal/date-scale.ts`)    | one function over every period: Calendar's `month` and `agenda` and Gantt's `month`, `quarter` and `year` (P-G2)          |

   The contract type `ListCalendarDateFieldV1` gains the neutral name `ListDateRangeFieldV1`, and the Calendar name stays as an alias, so no published contract changes. Calendar's behaviour and tests are unchanged.

**P-G2 — Date-scale module.** `temporal/src/calendar-math.ts` now serves two layouts.

1. **Move-only rename** to `date-scale.ts`. The package re-exports it from its root, so no consumer import changes.
2. **Expansion, with tests:** quarter and year windows aligned as section 7 states, `periodWindow` over every Calendar and Gantt period (P-G1, commit 2), and a day-offset helper (`daysBetween`) for bar geometry.

**P-G3 — Shared progress reader (its own commit, before G-runtime).** One reader for percentage values replaces the inline reading in the `number.progress` card renderer: a number is used as is; a string only when it is non-empty after trimming and parses to a finite number; anything else is no value. Values clamp to 0–100 and round, as today. It lives beside the card renderers (`list-view/src/progress-value.ts`) and Gantt imports it.

- **This is a shared, user-visible correction, not a Gantt change.** `number.progress` reaches every list surface through `renderFieldValue`: Table, Cards, and the cards in Board and Calendar. Today blank or whitespace-only text renders as a 0% bar; after the change it renders as an empty value (the existing empty-value display), because the renderer returns no progress and the field falls back to its formatted display.
- It lands as its own commit, attributable on its own, before any Gantt runtime commit.

**Dependency (closed):** Calendar decision 12 (`endNullable`), landed as `21054d33a`. Gantt cites it and reopens nothing.

## 5. Contract properties

Studio authoring rows are typed and normalized; nothing is stored in `layout_config`. Compiled JSON is derived output.

### 5.1 Runtime reservation (Gantt runtime step)

| Property                 | Shape                                        | Consequence                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENTITY_LIST_VIEW_MODES` | adds `"gantt"`                               | The browser and server mode types, the parser lists and `unavailableModes` admit it. `ENTITY_LIST_RENDERABLE_MODES` is unchanged; Gantt is offered only through its per-viewer resolver, like Board and Calendar. |
| Component catalogue data | the list host component row declares `gantt` | A publication gate, as for Calendar: without it no real entity can publish Gantt                                                                                                                                  |

### 5.2 Studio authoring shape (Gantt authoring step, gated on the metadata cleanup)

| Table / column                                                           | Columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity_surface.supported_modes`                                         | admits `gantt` (typed guard regenerated)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **New** `entity_surface_gantt` (one row per surface that declares Gantt) | `entity_surface_id` (primary key), `default_zoom` (`month` \| `quarter` \| `year`), `group_field_binding_id` (nullable), `progress_field_binding_id` (nullable)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Date-range rows                                                          | Decision 8. **Recommended:** a shared `entity_surface_date_range` with `entity_surface_id`, `layout` (`calendar` \| `gantt`), `start_field_binding_id`, `end_field_binding_id` (nullable), `tone_field_binding_id` (nullable), `position`; unique `(entity_surface_id, layout, start_field_binding_id)`; `position` dense within `(entity_surface_id, layout)`. It amends Calendar section 5.2 before Calendar's authoring is built. **Alternative:** `entity_surface_gantt_field` with exactly the columns of `entity_surface_calendar_field` (`entity_surface_id`, `start_field_binding_id`, `end_field_binding_id`, `tone_field_binding_id`, `position`) |

### 5.3 Integrity rules

| Rule                                                                                            | Enforcement                             | Consequence                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gantt` ⇔ an `entity_surface_gantt` row ⇔ at least one Gantt date-range row                     | hand-written draft cross-row validation | No Gantt option without date ranges or a default zoom                                                                                                          |
| Unique start field per surface and layout; dense `position`                                     | generated (`unique`, `ordered`)         | A start field is declared once per layout, in a stable order. The same field declared in both Calendar and Gantt is valid and must not be rejected (section 2) |
| Every binding (date, tone, group, progress) is on the row's surface                             | hand-written deferred guard             | No cross-surface mappings                                                                                                                                      |
| End kind equals start kind; tone and group fields are enums; progress is `integer` or `decimal` | hand-written deferred guard             | No kind mixing                                                                                                                                                 |
| Bounds (1–3 date ranges); eligibility in section 2                                              | Studio completeness validation          | Bounded, explainable findings                                                                                                                                  |

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
- **Saved views** keep `dateField` and `zoom`, never the anchor. In Phase 1 they keep nothing else for Gantt: group collapse is display state for the session and is not saved. A saved or URL zoom the descriptor cannot render is normalized to `defaultZoom`; a date field that is no longer usable falls back to the first usable one with the existing notice. Display state only, so normalizing never widens results.
- **Query contract.** Calendar's applies unchanged (Calendar section 5.6): an explicit start-ascending sort on every query, constant sort and filters across pages, the largest allowed page size.

### 5.7 Later phases (shape only; each needs its own approval)

| Phase                  | Addition                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2a Dependencies        | A declared link between records of the entity, published as relation metadata, plus a server read path returning only links between records the viewer can already read. Arrows are a decorative overlay; the accessible text lists each record's predecessors. Critical path is out of scope.                          |
| 2b Hierarchy           | The record hierarchy of the [Entity list Tree blueprint](../entity-list-tree/blueprint.md), Part B (approved 9 October 2026, decision 11): one parent concept for the list, pickers, breadcrumbs and Gantt; indented, collapsible rows                                                                                  |
| 2c Extra label columns | Declared columns beside the label (for example assignee); a new property, raised then                                                                                                                                                                                                                                   |
| 3 Reschedule           | Drag or resize through the existing patch operation, with its authorization, audit and idempotency. It is not designed against the bar width: at the 0.75rem column minimum a bar is about 12px wide, so resizing needs a separate handle with an adequate hit target or a zoom-dependent minimum, decided with Phase 3 |

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

**The row set is a prefix in start order.** Rows are taken in start order, so a long-running or open-ended record that started long before the window takes a row before a record that starts inside the window. Under the ceiling, a record inside the window can therefore be left out while an older one is drawn. This follows from the list query, whose order is a sort over fields: there is no server order by relevance to the window. The ceiling notice names the remedy, and the window is usually narrowed by zoom before the ceiling is reached.

**Row budget.**

- Each query loads one page at the largest allowed page size; "Load more rows" loads the next page of each stream that has one.
- **Ceiling:** `GANTT_ROW_CEILING` = 500 bounds both loading and drawing. The model reports two facts: **reached** (the loaded rows fill the ceiling, so no further page is requested and Load more disappears) and **truncated** (rows past the ceiling were loaded and are not drawn). The first 500 rows in merged start order are drawn. The ceiling notice claims that records exist past the ceiling, so it shows only when rows were truncated, or when the ceiling is reached and more pages remain. Exactly 500 rows with nothing more to load shows neither the notice nor Load more (as built in `9820b2c6c`). It is a framework rendering budget, not entity configuration: a named exported constant, used by the loader, the drawing and the notice, with a test that they agree.
- **Relation to page sizes.** The ceiling is counted in rows, independent of `allowedPageSizes`. With a largest page size of 50, reaching it takes up to ten Load more presses; with 100, five. Loading stays manual, so a person never pulls 500 rows without asking for them.
- When more rows exist than are loaded: "More records than fit in this period. Showing the first N." At the ceiling: "Showing the first 500 records. Records after these are not shown here; narrow the period, add filters or open Table." With exact counts, the wording is "Showing N of M".

**Bars.** Bar geometry comes from the entry's first and last covered day (`placeEntries`), clipped to the window, with continuation markers where it is clipped. An open-ended record is hatched to the window end with the open-ended marker. Phase 1 draws at day granularity; a `datetime` bar's accessible name carries the exact times. A bar is never narrower than the minimum bar width (section 11), so a one-day bar stays visible at Year zoom, where a day is about 1/365 of the axis.

**Window-start point query: a zero-length `datetime` milestone exactly at the window start.** The window query's end condition is `end gt windowStart` for `datetime`, because the end is exclusive. A point whose start and end both equal `windowStart` fails it, and fails the previous window's `start lt` its end (which is this `windowStart`); the open-ended query does not match it because its end is set. Without a further query such a point appears in **no** window, although this section draws a zero-length `datetime` as a milestone. A third query per window closes the gap (decision 13):

- **Filters:** `start gte windowStart`, `start lt windowEnd`, `end eq windowStart`, plus `end is_not_null` when the end is nullable. `end eq` names only this window's own start instant, never its end, so a point at the window end is the next window's. Sent only for a `datetime` range with an end field; `date` ranges have no such gap (a date end is inclusive and matches `end gte windowStart`), nor do ranges without an end (`start gte`/`lt`).
- **Disjoint and exact:** its rows have `end = windowStart`, the window query's have `end > windowStart` and the open-ended query's have no end, so "N of M" adds its exact total without double counting. Rows merge through `mergeRows` and are drawn in start order with the rest.
- **Paging and failure:** the same as the open-ended query: its own cursor, included in Load more and the overflow notice, and a failure is shown with a retry.
- **Eligibility:** a `datetime` end field must also be filterable with `eq` (section 2). `eq` is in the default `datetime` operator set; only an end field whose published operators omit it becomes unusable, with `LIST_GANTT_DATE_FIELD_UNAVAILABLE` (Calendar: `LIST_CALENDAR_DATE_FIELD_UNAVAILABLE`). It applies to Calendar equally.
- **History.** First stated as an accepted edge that "falls into the previous window"; corrected in the 9 October 2026 layout code review (it fell into no window), then resolved by decision 13.

**Milestones.** Declared, never inferred:

- A date range declared **without** an end field draws each record as a milestone (a point) on its start.
- A `datetime` range whose end equals its start, to the instant, is a zero-length point and draws as a milestone.
- A `date` range whose end equals its start is a **one-day bar**, because a date end covers the whole day.

This costs nothing new: `placeEntries` already distinguishes "covers one day" from "zero length" through its inclusive and exclusive end rules, so the milestone rule is a predicate over values the shared helper already computes.

**Groups.** With a group field, rows are grouped in the renderer over the loaded rows, in published choice order, then a "No value" group, then one "Unmapped values" group for values that are not published choices, using Board's term. No row is hidden.

**Why this differs from Board.** Board's lanes are the partition itself: a card exists in Board only inside a lane, so an unpublished value would need an invented lane, and Board instead reports those records as an "Unmapped values" count with "View in table". In Gantt the rows are the window query's result and grouping is secondary presentation over them: each record is already in the view, and leaving it out because of its group value would hide a record the window returned (principle 7). The group header labels the remainder; it never presents an unpublished value as a declared choice. This is the same condition treated according to what each layout's primary content is, as the foundation's count-mode section does for counts. Group order never changes paging. A group's count is shown only under the count-mode rule and only when every row of the window is loaded, so a count is never partial.

**Progress.** The progress field holds a percentage. Its value is read as a number, clamped to 0–100 and rounded, the same bounds as the `number.progress` renderer. One shared reader serves both: a number is used as is; a string is used only when it is non-empty after trimming and parses to a finite number; anything else (null, blank or whitespace-only text, non-numeric text) is no value and draws no fill. Today the card renderer turns blank text into 0% because `Number(" ")` is 0; adopting the shared reader corrects that for cards too, which is part of decision 7. The bar's accessible name states the percentage. Gantt draws its own fill; it does not reuse the card markup.

**Unscheduled tray.** Calendar's, unchanged: a separate `start is_null` query, collapsed, one page and Load more, a count only under exact counts.

## 8. Views and interaction

**Design reference.** The visual design follows the owner-supplied [Neon Gantt prototype](../../prototypes/Neon%20Gantt%20Prototype.html), built in design-system tokens. Where they differ, this blueprint and the shared framework rules win: the Layout is chosen in Display settings (the prototype's toolbar switch was rejected for Calendar and stays out); rows are the shared label column, not the prototype's card layout; the prototype's inspector drawer is a review tool, not product. The prototype's "Only records starting in this period" remedy in the ceiling notice is not adopted in Phase 1: it would add a list filter that outlives the window it was made for, so it needs its own decision.

**Navigation (inside the Gantt body; not a mode switch).** The period title, then Today and ‹ ›, then a "Dates by" control when more than one date range is usable, and a Month | Quarter | Year zoom control. The mode itself is chosen in Display settings → Layout, as for Board and Calendar.

**Chart.**

- A label column (16rem in list containers of 64rem and wider, 12rem below; amended 9 October 2026, approved by the project owner: "go ahead") with the readable identity and, when declared, the title; the label opens the record, and the row menu sits beside it. A label that does not fit is truncated visually only: the row's accessible name carries the full identity and title, a `title` tooltip supplements it for pointers, and when the row has keyboard focus the label wraps to show the full text. When a tone is declared, the label carries a tone dot and visually hidden status text (the tone choice's label), because bars carry no text and tone is never the only signal. The column header names the active date range.
- A two-tier time scale, by zoom:

  | Zoom      | Upper tier         | Lower tier (columns)               | Period title   |
  | --------- | ------------------ | ---------------------------------- | -------------- |
  | `month`   | the month and year | days                               | "October 2026" |
  | `quarter` | months             | weeks, labelled by their first day | "Q4 2026"      |
  | `year`    | quarters           | months                             | "2026"         |

  The Quarter window is widened to whole weeks, so it can show days of the neighbouring quarters; it is still titled by its quarter, and rows that fall only in the widened days belong to the window.

- Bars in tone colour with a progress fill; milestones as diamonds; a today line; muted out-of-window context is not drawn.
- The chart fits the width at every zoom, so the page never scrolls sideways. The chart appears only at list container widths of 40rem and above (narrower containers show the phone list, section 8). The arithmetic depends on the tier:

  | Container | Label column | Time axis | Month (31 days) | Quarter (≤14 weeks) | Year (12 months) |
  | --------- | ------------ | --------- | --------------- | ------------------- | ---------------- |
  | 40rem     | 12rem        | ~26rem    | ~0.85rem        | ~1.9rem             | ~2.2rem          |
  | 48rem     | 12rem        | ~36rem    | ~1.15rem        | ~2.6rem             | ~3rem            |
  | 64rem     | 16rem        | ~48rem    | ~1.55rem        | ~3.4rem             | ~4rem            |

  Bars carry no text in Phase 1 (the label is in the label column), so a day column of 0.75rem or more holds a legible bar and a milestone. The minimum column width is 0.75rem; if a container ever leaves less, the time axis scrolls inside its own region with the label column fixed, and the page still never scrolls sideways.

- Rows follow the list density (comfortable or compact).
- Weekend shading is not inferred, as in Calendar.

**Phone (narrow tier).** The dated list from the shared `agendaByDay`, each record shown once on its first day in the window, as the shared record card with its "when" line. Zoom is hidden at this width; this is not an error.

**Right to left.** The time axis runs right to left; bars, markers and navigation mirror. Bidi-mirrored glyphs (‹ ›) are not flipped again.

**Keyboard and accessibility.**

- The chart is a `grid`: each row has a `rowheader` (the label) and a `gridcell` (the bar).
- Up and Down move between rows; Home and End go to the first and last row; Enter opens the record; PageUp and PageDown move the window by one step; group rows carry a toggle button with `aria-expanded`.
- Each bar's accessible name gives the label, then the dates: "{start} to {end}" for a range, "{date}, milestone" for a milestone, and "from {start}, open-ended" for an open-ended record, then the progress when declared. The today line and continuation markers are decorative.
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

Container tiers stay on the entity list breakpoint scale (40/48/64rem), and colours, spacing and type use design-system tokens only. The breakpoint scale governs container tiers, not every internal dimension: the chart has three local layout constants, the label column (16rem, overridden to 12rem by the `(width < 64rem)` container tier), the 0.75rem minimum column and the 0.375rem minimum bar width, declared once as custom properties in `gantt.css` (`--gantt-label-width`, `--gantt-min-column`, `--gantt-min-bar`), because no design-system token covers them.

## 12. Delivery phases and acceptance

| Step        | Scope                                                  | Acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-G1, P-G2  | Shared module and date-scale                           | P-G1 commits verified by diff against the two identifier maps in section 4, and the P-G2 rename as a pure move; Calendar's model, browser and temporal tests pass unchanged; new window and offset helpers tested, including DST weeks and leap years                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P-G3        | Shared progress reader                                 | Unit tests of the reader: finite numbers and numeric strings (including surrounding spaces) read as today and clamp to 0–100; `""`, `" "`, a tab, non-numeric text and null are no value. A list rendering test: a `number.progress` field with blank text shows the empty value, not a 0% bar, in Table and in Cards; numeric values render unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| G-runtime   | 5.1, 5.5, 5.6; resolver; chart, tray, phone list; i18n | Two **synthetic** entities, one `date` with nullable start and end and a group field, one `datetime` in a non-UTC zone with progress: **(a)** bars span their first to last covered day, clipped with markers at the window edges; **(b)** a date range with end = start is a one-day bar, a range without an end field draws milestones, a zero-length datetime draws a milestone; **(c)** an open-ended record is hatched to the window end and appears once; **(d)** rows follow start order across both streams, and Load more keeps sort and filters; **(e)** the overflow and ceiling notices appear at the right thresholds, the ceiling stops loading and drawing at 500 and the constant, drawing and notice agree, and "N of M" appears only under exact counts; **(f)** groups follow published choice order, then No value, then Unmapped values, and group counts appear only under the count rule when complete; **(g)** progress clamps to 0–100, blank or whitespace text draws no fill, and the percentage is in the accessible name; **(h)** a masked start field gives a disabled option with `LIST_GANTT_DATE_FIELD_UNAVAILABLE`, and masked group or progress fields degrade silently; **(i)** a published `defaultZoom` outside the set is rejected at parse, and a saved or URL zoom is normalized; **(j)** a saved view round-trips `dateField` and `zoom`, and the anchor appears only in the URL; **(k)** no UUID pattern appears in the DOM; **(l)** phone shows the dated list, RTL mirrors the axis, keyboard navigation works; **(m)** tones hold 4.5:1 contrast in light and dark |
| G-authoring | 5.2–5.4, sections 9 and 10                             | Behind the metadata-cleanup gate, as Calendar's authoring                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Fixture boundary.** The synthetic entities are test data, modelled like Board's and Calendar's. Any Gantt need for new entity metadata, a new table or a real pilot entity is Entity onboarding with its own approval, not a layout fixture.

**Delivery status (8 October 2026).** Implementation, not publication: no real entity publishes Gantt yet.

- P-G3, the shared progress reader: `594d42e85`.
- P-G2, the date-scale rename as a pure move: `c8b003122`; its expansion (`startOfQuarter`, `quarterOf`, `startOfYear`, `daysBetween`, `DatePeriod`, `periodWindow`): `3d0ca12d4`.
- P-G1 commit 1, move and rename the 12 generic exports per the section 4 map: `9bef62cfd`. Commit 2, rename and generalize the 4 layout-bound helpers: `c3650c2ee`. Calendar keeps thin adapters (`calendarSelection`, `calendarPeriod`, `calendarRange`).
- Shared date-layout parts, so Gantt reuses rather than duplicates Calendar's agenda, tray, "when" note and empty state: `61ecf4c94` (`date-range/date-range-parts.tsx`, `date-range.css`).
- G-runtime (sections 5.1, 5.5, 5.6 and the section 6 runtime codes): `6a0b53150`, verified on synthetic fixtures (`tests/foundation-browser/entity-list-gantt.spec.ts`, registered in `test:country-browser`). As built:
  - The published date-range parser and the per-viewer date-range resolution are shared with Calendar (`list-date-range-descriptor.ts`, `list-date-range.ts`), so both layouts apply one set of eligibility rules.
  - The group field's choices come from the field's authorized choice projection (`filterOptions`) and tones (`statusTones`); the two layers differ on purpose. The published `listPresentation.gantt` declares only `group.field`; the list service resolves it per viewer and sends the browser `surface.gantt.group` as `{ field, label, choices[] }`, with the authorized choices and their tones. The browser never derives choices itself. A masked field has no projection, so it is omitted.
  - Group counts appear only under exact counts with every row of the window loaded and the ceiling not reached.
  - Group collapse is display state for the session; it is not saved in Phase 1.
- Not landed: G-authoring (decision 8 open; behind the metadata-cleanup gate) and the component catalogue row (a publication gate, as for Calendar).

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

1. **Approved 8 October 2026 (owner wording in the status line).** **P-G1, shared date-range module.** Approve the split (12 move, 4 generalize, 4 stay, 20 in all) and the two commits: move and rename the 12 generic exports; rename and generalize the 4 layout-bound helpers.
2. **Approved 8 October 2026 (owner wording in the status line).** **P-G2, date-scale module.** Approve the move-only rename of `calendar-math.ts` to `date-scale.ts` and its expansion with quarter and year windows and `daysBetween`.
3. **Approved 8 October 2026 (owner wording in the status line).** **Gantt runtime contract.** Approve sections 5.1, 5.5 and 5.6 and the section 6 codes, including the row label from the existing identity and title (no new property) and the URL and saved-state split.
4. **Approved 8 October 2026 (owner wording in the status line).** **Zoom set and windows.** Month, Quarter and Year as defined in section 7. `default_zoom` stays required (section 5.3); the Studio composer suggests Quarter when an author first adds Gantt. That is an authoring suggestion, not a framework fallback.
5. **Approved 8 October 2026 (owner wording in the status line).** **Row budget.** `GANTT_ROW_CEILING` = 500 bounds both loading and drawing; records beyond it are reachable only by narrowing the period, filtering or Table, and the notice says so. Rows are a prefix in start order (section 7). A named constant with a test.
6. **Approved 8 October 2026 (owner wording in the status line).** **Milestones declared only** (section 7).
7. **Approved 8 October 2026 (owner wording in the status line).** **Group and progress fields.** Group by the Board lane-field rule, rendered over loaded rows, with an "Unmapped values" group (section 7 states why this differs from Board); progress as an `integer` or `decimal` percentage clamped to 0–100, read through the shared progress reader (decision 12).
8. **Open (needed only for authoring).** **Authoring storage for date ranges.** **Recommendation:** one shared `entity_surface_date_range` table with a `layout` discriminator, amending Calendar section 5.2 before Calendar's authoring is built (neither table exists yet), so the two layouts share one guard and registration set. **Alternative:** a separate `entity_surface_gantt_field` mirroring Calendar's. Either way, the build waits behind the metadata-cleanup gate.
9. **Approved 8 October 2026 (owner wording in the status line).** **Phase 1 scope.** Read-only; dependencies, hierarchy, extra columns and rescheduling are separate approvals.
10. **Approved 8 October 2026 (owner wording in the status line).** **Verification** on synthetic fixtures, with the fixture boundary in section 12.
11. **Approved 8 October 2026 (owner wording in the status line).** **AGENTS.md pointer**, worded like Calendar's, linking this blueprint and the foundation by their stable paths.
12. **Approved 8 October 2026 (owner wording in the status line).** **P-G3, shared progress reader.** Approve the reader and its user-visible correction outside Gantt: blank or whitespace-only progress text shows as an empty value instead of 0% in Table, Cards, Board and Calendar. It lands as its own commit with its own acceptance (section 12).
13. **Approved 9 October 2026 (owner instruction: "review and fix the same", on the review recommending option (a)).** **Window-start point query** (section 7). Options considered: (a) a third, single-instant query with `end eq windowStart`, adopted; (b) `end gte windowStart` on `datetime` window queries, which does include the point but also every range ending exactly at the window start, so those rows must be dropped in the browser and exact totals overstate; (c) keep the gap and state it in the UI, which contradicts the milestone rule above and Calendar principle 6; (d) refuse zero-length `datetime` ranges at authoring with a finding code, cheaper than (a) but it removes milestones this section promises. Cost of (a): one more request per window, not per page, and `eq` joins the `datetime` end field's required operators.

## 15. Rejected options

- **A third-party Gantt library** (for example Frappe Gantt or DHTMLX): licensing and bundle cost, a mismatch with the design system, weak accessibility, and a data model that would bypass the list query. Calendar's month grid was likewise built rather than delegated to `react-day-picker`.
- **A Gantt page, project app or separate API.** AGENTS.md forbids bespoke applications.
- **The mode name `timeline`.** It is a typed activity view.
- **Inferring milestones from start = end on a date range.** A one-day task is not a milestone.
- **A new row-label property.** The surface already publishes the readable identity and the title role.
- **Computing dependencies in the browser from loaded rows.** A viewer sees one page at a time, so links to other pages would be missing.
- **Reusing Calendar's `calendarAnchor` as a shared anchor.** It would rename an approved Calendar contract; Gantt mirrors the shape instead.
- **A horizontally scrolling page.** Every zoom fits the width at chart container sizes (section 8 gives the arithmetic); sideways page scroll is a layout defect.

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
| R1-1: the ceiling hides records, against principle 7                                                                  | Principle 7 reworded; the ceiling bounds loading and drawing, and the notice names the remedies (section 7)                                                                     |
| R1-2: a start-ordered prefix can push in-window records past the ceiling                                              | Stated in section 7, with why there is no window-aware server order                                                                                                             |
| R1-3 and R1-4: the three-commit sequence renames, then rewrites, and leaves Calendar names in `date-range/`           | Two commits: move and rename the 12; rename and generalize the 4 (section 4)                                                                                                    |
| R1-5: the integrity table must permit the same field in both layouts                                                  | Clause added to section 5.3                                                                                                                                                     |
| R1-6: whitespace progress draws 0%                                                                                    | One shared reader treats blank text as no value, also for cards (section 7, decision 7)                                                                                         |
| R1-7: "recommended default" is not a contract property                                                                | Decision 4: `default_zoom` stays required; Quarter is a composer suggestion                                                                                                     |
| R1-8: "Other values" is Board's "Unmapped" by another name                                                            | Renamed "Unmapped values"; section 7 states why Gantt shows the rows and Board counts them                                                                                      |
| R1-9: Month at 31 day columns                                                                                         | Section 8 gives the per-zoom arithmetic, the 0.75rem minimum and the in-region fallback                                                                                         |
| R1-10: date-range row columns unnamed                                                                                 | Section 5.2 names the columns for both options                                                                                                                                  |
| R1-11: ceiling versus page sizes                                                                                      | Section 7, "Relation to page sizes"                                                                                                                                             |
| R1-12: open-ended accessible name                                                                                     | Section 8 gives each form                                                                                                                                                       |
| R2-1: the card-renderer fix is outside Gantt and needs its own line                                                   | P-G3 with its own commit and acceptance (sections 4 and 12); decision 12                                                                                                        |
| R2-2: the rename map must be complete                                                                                 | Section 4 lists all 12 moves and all 4 generalizations with their target names                                                                                                  |
| R2-3: the 12rem label column is not on the breakpoint scale                                                           | Section 11: the scale governs container tiers; two local layout constants are named                                                                                             |
| R2-4: Phase 3 hit target at the minimum column                                                                        | Section 5.7, Phase 3 row                                                                                                                                                        |
| P1: tone is the only status signal on a bar                                                                           | The label carries a tone dot and hidden status text (section 8)                                                                                                                 |
| P1: short bars vanish at Year zoom                                                                                    | Minimum bar width, a third local constant (sections 7 and 11)                                                                                                                   |
| P1: which tier each zoom shows                                                                                        | Section 8 table                                                                                                                                                                 |
| P1: the Quarter window title and widened days                                                                         | Section 8                                                                                                                                                                       |
| P1: a zero-length datetime at the window start                                                                        | Corrected 9 October 2026 (it appeared in no window); resolved by the window-start point query, decision 13 (section 7)                                                          |
| P1: "Only records starting in this period" remedy                                                                     | Not adopted in Phase 1; needs its own decision (section 8)                                                                                                                      |
