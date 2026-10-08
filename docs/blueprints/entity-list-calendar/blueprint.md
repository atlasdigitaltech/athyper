# Entity list Calendar — blueprint

**Status:** proposed, revision 3 (8 October 2026). Not implementation authority. It incorporates five design-review rounds (section 16). Owner decisions are listed in section 14. Decisions 1, 3 and 4 were approved by the project owner (nchandravel-atlas) on 8 October 2026: "Approve decisions 1, 3 and 4 of the Calendar blueprint". The remaining decisions are open, and the blueprint as a whole is not implementation authority beyond P1 and P2.

**Scope and authority.**

- This is the design for the shared Entity list **Calendar** view mode. Calendar is available to **any** eligible Entity through governed, published Meta Entity properties. No entity name, allowlist or entity-specific branch appears in framework code.
- **Authority.** Calendar is a list view mode of the shared Entity Framework. It stands on the same footing as Board: Entity onboarding and shared Entity Framework work under [AGENTS.md](../../../AGENTS.md).
  - The Studio blueprint's §11.6.1 "Calendar/Gantt" row is parked ("future integration requirements, not current-phase implementation approval"). It is **not** cited as authorization.
  - This design is consistent with the calendar half of that row only: explicit date/range mappings. Calendar adds no query provider; the existing list query is the provider. Gantt stays parked.
- **Shared foundation.** Calendar builds on the shared list layout foundation. That foundation covers:
  - the mode registry and reserved modes;
  - `unavailableModes` with reason codes, and no renderer fall-through;
  - `cardContent` and the shared record card;
  - the saved-state shape, per-viewer availability and the count-mode rule.

  Until the restructure in section 4 (P1) is approved and done, those rules are stated in the [Entity list Board blueprint](../entity-list-board/blueprint.md) (sections 1, 4, 5.1, 6, 8). Calendar depends on them as shared rules, not as Board behaviour.

- **Authoring authority.** The [Entity Studio blueprint](../entity-studio/blueprint.md) remains the authority for authoring storage, the codec, the compiler and the composer.
- Update this document in place. Do not create competing Calendar plans.

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

1. **Calendar is a view mode of the shared list.**
   - It is a renderer over the existing list query. It has no page, route, provider stack or calendar service of its own.
   - The UI keeps the existing "Layout" label; documents and contracts say "list view mode". `layout_kind` remains a Studio term.
2. **Metadata declares every date mapping.**
   - Start fields, end fields, tone fields and the default view are explicit Meta Entity properties.
   - The framework never picks a date field from its type or name, never uses `created_at` by default and never infers ranges.
3. **The field kind decides the calendar semantics.**
   - A `date` field is a calendar day and never passes through a time zone.
   - A `datetime` field is an instant, shown in the person's time zone.
4. **The server owns the window, the total order and the cursor; the renderer owns presentation.**
   - Within-day ordering, "+N more" selection and multi-day bars are renderer concerns.
   - None of them changes the paging order.
5. **Fail closed and say why.**
   - An unusable Calendar is reported per viewer with a reason code and is never drawn as another mode.
   - A malformed date filter value is rejected, never silently widened.
6. **No record is hidden.**
   - Records without a start date appear in an Unscheduled tray.
   - A period with more records than one page holds says so.
   - A record with a start date and no end date is **open-ended**: it appears in every period from its start onward.
7. **No UUID and no synthesized identity** appear on entries, popovers, trays or notices.
   - The internal record ID (`storage.idField`) is used only for ordering and the cursor.
   - The readable identity (`entity.identityField`) is the published display identity.
   - These two are never interchanged.
8. **A navigable position is location state, never saved state.**
   - The calendar anchor (`calendarAnchor`) lives in the URL only; saved views keep the date field and calendar view, never the anchor.
   - Any future layout with a navigable position follows the same split.

## 2. Eligibility for any Entity

A list surface may declare Calendar when all of the following hold. Studio validation enforces every rule. The list service re-checks the rules marked † for each viewer.

| Rule                                                                                                                                                                    | Source                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `calendar` is in `supported_modes`, and a qualified `ui_component_contract` row for the list host declares `calendar`                                                   | `entity_surface.supported_modes`, component catalogue     |
| 1–3 date fields, each a placement on this same list surface †                                                                                                           | `entity_surface_calendar_field`                           |
| Each start field is `date` or `datetime`, readable, unmasked, sortable, and filterable with `gte` and `lt`; a nullable start field also needs `is_null` †               | field and placement metadata, published `filterOperators` |
| An optional end field has the **same kind** as its start field and is filterable with `gte` (date) or `gt` (datetime), plus `is_null` and `is_not_null` when nullable † | field and placement metadata                              |
| An optional tone field is an entity-owned enum with published choice tones; if it is unreadable or masked for a viewer, entries render in the neutral tone †            | `entity_field_choice`                                     |
| `calendar_default_view` is set and is a view this release can render (Phase 1: `month` or `agenda`)                                                                     | `entity_surface.calendar_default_view`                    |
| `calendar` in `supported_modes` and at least one date-field row require each other †                                                                                    | cross-row check                                           |

**Count mode is not required.** Calendar shows no counts in its chrome unless the list uses exact counts (section 7, "Counts"). This diverges from Board deliberately, under the foundation's count-mode rule.

## 3. Current-state facts this design relies on

Verified against the repository on 8 October 2026.

| Fact                                                                                                                                    | Evidence                                                                                                               | Consequence                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The foundation exists and is proven by Board                                                                                            | `view-modes.ts`, `mode-renderers.ts` (deduplicated `unavailableModes`, `a086ca46f`), `resolveListBoard`, `cardContent` | Calendar adds one reserved mode, one renderer and one resolver                                                                                                                                                                                                                                          |
| `calendar` is not a reserved mode                                                                                                       | `ENTITY_LIST_VIEW_MODES` = table, compact, board, dashboard, spreadsheet                                               | Reserving it is a contract change (section 5.1)                                                                                                                                                                                                                                                         |
| The person's localization carries `timeZone` (validated with `Intl.DateTimeFormat`, default UTC) and `weekStart` (default 1)            | `i18n/index.ts:46, 49, 152`                                                                                            | Window edges and week rows use the person's settings                                                                                                                                                                                                                                                    |
| `platform-temporal` separates business dates from instants                                                                              | `parseBusinessDate`, `parseInstant`, `parseDatabaseInstant`                                                            | Date and datetime semantics stay separate end to end                                                                                                                                                                                                                                                    |
| Date and datetime fields support `gte`, `gt`, `lt`, `between`, `relative`, `is_null`                                                    | `entityFieldFilterOperators` (`descriptors.ts`)                                                                        | No new query operators are needed                                                                                                                                                                                                                                                                       |
| List filters are AND-only                                                                                                               | `filterCondition`, `ListFilterV1`                                                                                      | A range with a nullable end needs two window queries (section 7)                                                                                                                                                                                                                                        |
| A sort item is only `{field, direction, nulls}`; ordering appends the storage ID, and the cursor mirrors it                             | `types.ts:110–114`; `kysely-record-repository.ts:155–165`                                                              | The server order is start ascending, then internal record ID. Richer ordering is client-side within a day.                                                                                                                                                                                              |
| The server checks only that a date filter value is a scalar, then passes it into SQL                                                    | `filter-value-validation.ts:13–17`; `filterCondition`                                                                  | Datetime values without an offset are read in the session time zone. Prerequisite P2 hardens this.                                                                                                                                                                                                      |
| List-state parsing validates filter structure, not filter values                                                                        | `parsers.ts:753–770` (`json(item.value)`)                                                                              | A saved view with a malformed value decodes and then fails with 400 on every load (P2)                                                                                                                                                                                                                  |
| Saved views live in `master.saved_view` (default in `master.saved_view_default`) and in browser storage keyed without a descriptor hash | `kysely-saved-view-repository.ts:11, 136`; `preferences.ts:34–64`                                                      | Stale browser views are normal. Read-time handling is load-bearing.                                                                                                                                                                                                                                     |
| A browser saved view that fails to decode is dropped with its own catch                                                                 | `preferences.ts:45–64`                                                                                                 | P2 adds value validation there so a bad view is retired whole                                                                                                                                                                                                                                           |
| A server-stored view is `compatible` only when `descriptor.validate(view.state)` succeeds, and an incompatible view is not offered      | `entity-views-routes.ts:89–90, 201`                                                                                    | P2 adds the strict rule to that validator, so server and browser views share one rule and no server view can be offered and then fail with 400                                                                                                                                                          |
| `react-day-picker` 9.14.0 is already shipped, but only as a single-selection picker                                                     | `ui/package.json:24`; `date-picker-calendar.tsx:4, 105–108`                                                            | No new dependency. The month grid is built here; the week and locale maths are extracted for sharing.                                                                                                                                                                                                   |
| `entity_surface_view.mode` is the saved default view's mode and admits only `table`                                                     | `reference-member-contract.ts:193`                                                                                     | The calendar default view is **not** stored there                                                                                                                                                                                                                                                       |
| `ui_component_contract.supported_modes` is free text with length and uniqueness checks only                                             | `ui-component-contract.ts:87`                                                                                          | The catalogue row is data and can land with the runtime step                                                                                                                                                                                                                                            |
| The cursor binding hashes the filters, sort, group, search and projection, but **not** the page size                                    | `record-cursor.ts:35–49`                                                                                               | The calendar can use the largest page size and page with Load more. Changing the sort or filters between pages makes the server reject the cursor as stale; that is why section 5.6 fixes both per query. Each calendar query (window, open-ended, tray) has its own cursor, because its filters differ |
| List filters can only be ANDed; there is no OR                                                                                          | `ListFilterV1`, `filterCondition`                                                                                      | "End on or after the window start, or no end" needs two disjoint queries (section 7)                                                                                                                                                                                                                    |
| `cal` is unused in URL state                                                                                                            | `url-state.ts`                                                                                                         | `cal`, `cal.view` and `cal.field` are free                                                                                                                                                                                                                                                              |

## 4. Prerequisites

**P1 — Shared list layout foundation (owner decision).**

1. Create `docs/blueprints/entity-list-layouts/foundation.md`, beside the Studio blueprint.
2. **Move-only commit.** It moves the shared rules out of the Board blueprint **verbatim** and leaves pointers in Board. The shared rules are:
   - the mode registry and reserved modes;
   - `unavailableModes` and reason codes, and no fall-through;
   - `cardContent` and the shared card;
   - the saved-state shape and per-viewer availability.

   Board keeps only Board-specific material, and Board's section 16 history stays in Board with a pointer. The commit contains no wording edits.

3. **Independent verification.** A diff-level check confirms that the moved text is substantively identical to Board revision 4. It reports cosmetic reflow separately from changes in meaning.
4. **Owner approval commit.** The project owner records that Board's revision-4 approval covers the moved text, and approves the foundation's scope and ownership.
5. **Separate commit, after approval.** Add the count-mode rule to the foundation:
   - "A count shown in list chrome requires exact counts; otherwise the wording relies on `hasNext`."
   - Board's lane counts and distribution, and Calendar's tray and any period summary, all follow it.

Until step 4, Board's build authority rests on its existing approval, and Calendar cites the shared rules in the Board blueprint.

**P2 — Typed date filter values (shared framework hardening).**

- **Rule.** It is keyed on the field's declared type, not the operator:
  - `date` values are `YYYY-MM-DD` only;
  - `datetime` values are RFC 3339 with `Z` or an explicit offset. A value with no offset is **invalid**, not merely unrecognized.
  - The rule applies to `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `between` and `in` on date and datetime fields. `relative` is already a closed key set and is unchanged.
- **Server.** `validateFilterValue` rejects with 400 (`INVALID_FILTER_VALUE`), as today. The server stays fail-closed.
- **Before the check goes live: scan and correct.** The scan covers:
  - `master.saved_view` and `master.saved_view_default`;
  - DEV and test fixtures, and persisted saved-view rows in test databases;
  - metadata default filters.

  It also corrects offsets that are present but wrong. The scan results come to the owner before the change.

- **Scan record, DEV, 8 October 2026 (read-only; no corrections needed, so there is nothing to reconcile before the check goes live):**
  - `master.saved_view` (Neon, Mesh, Studio): one row in Neon, an archived personal `activity.inbox` view with no filters; none in Mesh or Studio. `master.saved_view_default`: no rows.
  - Published and draft default filters, found by a recursive search of every JSON column holding `defaultState` (runtime descriptors, contracts, release payloads, Studio snapshots, compilations and `layout_config`): 40 filters in total, all `status in [open, claimed, in_progress, blocked]`. None is on a date or datetime field. The date-shape test ran on each filter's whole serialized value, so it covers scalars, `in` and `between` arrays, and value objects.
  - Repository fixtures and seeds: one date-shaped filter value, in `records-query-contract.test.ts`, which already asserts rejection for its bound count and stays rejected under P2.
  - Not scannable centrally: filters in each person's browser storage. These are handled by the strict decode below.
- **Stored views: applied exactly as saved, or retired whole.** Today the list-state parser silently skips a stored filter whose field no longer exists, or whose operator the field no longer permits (`parsers.ts:756–765`). Each skip widens the view's results without telling the person, and it is more common than a malformed value. P2 therefore covers all three cases: an unknown field, an operator the field does not permit, and a malformed value.
  - **Browser-stored views:** a strict decode in `readSavedViews` throws on any of the three. The existing per-view catch then removes the view whole, with a notice ("This saved view is out of date and was removed").
  - **Server-stored views:** the same strict rule is added to `descriptor.validate`, which already decides `compatible` (`entity-views-routes.ts:89–90`). A server view whose filters cannot be applied exactly is marked incompatible and not offered, instead of being offered and then rejected with 400 on every load.
  - A filter is never dropped from a stored view on its own.
- **URL state.** Malformed values, unknown fields and disallowed operators are still dropped field by field, as today. This differs deliberately from stored views: a URL is a transient, hand-built intent that the person can see and edit, while a stored view is a persisted promise about what it shows.
- **Metadata defaults.** These are validated at publication, where the compiled surface is validated.
- **Tests.** The test set covers each rejection case explicitly: no offset, a wrong offset format, a malformed date, a datetime value on a date field, and (for stored views) an unknown field and a disallowed operator.

## 5. Contract properties

Studio authoring rows are typed and normalized; nothing is stored in `layout_config`. Compiled JSON is derived output.

### 5.1 Runtime reservation (Calendar runtime step)

| Property                 | Shape                                                                              | Consequence                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENTITY_LIST_VIEW_MODES` | adds `"calendar"`                                                                  | The browser and server mode types, the parser lists and `unavailableModes` admit it. `ENTITY_LIST_RENDERABLE_MODES` is unchanged; Calendar is offered only through its per-viewer resolver, like Board. |
| Component catalogue data | the list host component row declares `calendar` (free-text array, data not schema) | Calendar can be declared legitimately before the authoring guard regenerates                                                                                                                            |

### 5.2 Studio authoring shape (Calendar authoring step)

| Table / column                          | Columns                                                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `entity_surface.supported_modes`        | admits `calendar` (typed guard regenerated)                                                                                            |
| `entity_surface.calendar_default_view`  | nullable `text` enumeration of the views this release can render. Phase 1: `month`, `agenda`. `week` joins only when Week is approved. |
| **New** `entity_surface_calendar_field` | `entity_surface_id`, `start_field_binding_id`, `end_field_binding_id` (nullable), `tone_field_binding_id` (nullable), `position`       |

### 5.3 Integrity rules

| Rule                                                                          | Enforcement                                                                         | Consequence                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| `calendar` ⇔ at least one date-field row                                      | hand-written draft cross-row validation (`39_reference_predicate_native_types.sql`) | No Calendar option without date fields            |
| `calendar` ⇔ `calendar_default_view` set                                      | hand-written draft cross-row validation                                             | Every Calendar has a renderable default           |
| Unique `(entity_surface_id, start_field_binding_id)`; dense `position`        | generated (`unique`, `ordered`)                                                     | A start field is declared once, in a stable order |
| Every binding is on the row's surface                                         | hand-written deferred guard (`25_reference_member_guards.sql`)                      | No cross-surface mappings                         |
| The end field has the same kind as the start field; the tone field is an enum | hand-written deferred guard                                                         | No date/datetime mixing; tones only from choices  |
| Bounds (1–3 rows); eligibility in section 2                                   | Studio completeness validation                                                      | Bounded, explainable findings                     |

### 5.4 Component catalogue data

The list host declares `calendar`. Entry chips and popover cards reuse the shared record card and the existing tone tokens; no new display component is required.

### 5.5 Published runtime descriptor

Added to `EntityListPresentationDescriptor` and parsed explicitly by `parseListPresentation`:

```ts
calendar?: {
  defaultView: "month" | "agenda";
  dateFields: readonly {
    start: string;                 // field key, date or datetime
    end?: string;                  // same kind as start
    tone?: { field: string;
             choices: readonly { value: string; label: string; tone: EntityStatusTone }[] };
  }[];
};
```

### 5.6 Browser descriptor and state

```ts
surface.calendar?: {
  defaultView: "month" | "agenda";
  dateFields: readonly {
    start: string; end?: string; label: string;
    kind: "date" | "datetime";
    unscheduled: boolean;          // start is nullable, so the tray exists
    tone?: { field: string; tones: Readonly<Record<string, EntityStatusTone>> };
  }[];
};
SaveableListStateV1.calendar?: { dateField: string; view: "month" | "agenda" };
ListLocationStateV1.calendarAnchor?: string;   // YYYY-MM-DD; location only, never saved
```

- URL: `view=calendar` selects the mode. `cal=YYYY-MM-DD` is the anchor, used by every calendar view. `cal.view=` and `cal.field=` carry the calendar view and date field.
- Saved views keep `dateField` and `view`, but never the anchor. A saved view opens on today. A saved or URL `view` that the descriptor cannot render (for example `week` in Phase 1) is normalized to the descriptor's `defaultView`. It is display state, so normalizing it never widens results.
- **Query contract.** Every calendar query (window, open-ended and tray) sends an explicit `sort: [{ field: <start>, direction: "asc" }]`. It keeps that sort and its filters unchanged across "Load more" pages: the cursor is bound to both, so changing either makes the server reject the cursor as stale. The saved sort is not sent in Calendar; it is kept for Table and Cards.
- **Page size.** Calendar queries always use the largest allowed page size, overriding the person's page-size choice for this mode only. The choice stays in state and still applies to Table and Cards. A truncated period is reported (section 7), never paged silently.

### 5.7 Later phases (shape only; each needs its own approval)

| Phase                             | Addition                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| Week                              | `week` joins the `calendar_default_view` enumeration and the browser view union; time grid |
| Reschedule (drag)                 | No new authoring. It uses the existing patch operation (section 12).                       |
| Resource rows / period aggregates | Per-day count aggregates need a repository change and their own contract                   |

## 6. Validation, availability and finding codes

| Layer                       | Behaviour                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio validation           | `CALENDAR_DATE_FIELD_REQUIRED`, `CALENDAR_DATE_FIELD_INELIGIBLE` (kind, readability, operators, sortable), `CALENDAR_DATE_FIELD_SURFACE_MISMATCH`, `CALENDAR_END_FIELD_KIND_MISMATCH`, `CALENDAR_TONE_FIELD_INELIGIBLE`, `CALENDAR_DATE_FIELD_LIMIT`, `CALENDAR_DEFAULT_VIEW_REQUIRED`, `CALENDAR_DEFAULT_VIEW_UNSUPPORTED`, `LIST_MODE_UNSUPPORTED`                                         |
| Published-descriptor parser | Structurally invalid `calendar` (unknown keys, unknown fields, kind mismatch, missing default view) rejects the descriptor at load; `calendar` ⇔ `supportedModes` includes `calendar`. A `defaultView` outside the renderable set (Phase 1: `month`, `agenda`) is rejected with `listPresentation.calendar.defaultView must be a renderable view`. It is never received and then downgraded. |
| List service (per viewer)   | Calendar moves to `unavailableModes` with `LIST_CALENDAR_DATE_FIELD_UNAVAILABLE` when no declared date field is usable. Only usable date fields are offered. An unreadable tone field degrades to the neutral tone. There is no count-mode reason code, because Calendar requires no counts (section 7).                                                                                     |
| Browser                     | The shared foundation behaviour applies: a disabled Layout option with its reason through `describedBy`; a fallback with notice for saved or URL state; no fall-through. A saved or URL calendar `view` that the descriptor cannot render is normalized to `defaultView` (section 5.6).                                                                                                      |

## 7. Query semantics

**Window.** Both Month and Agenda use the anchor's month.

- **Month view:** the whole weeks covering that month, starting on the person's `weekStart`.
- **Agenda view:** the month itself.
- **Window edges:** `windowStart` is inclusive and `windowEnd` exclusive.

**Wire format (hard rules).**

| Field kind | Window edge value                                                                                                                                                                | Never                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `date`     | `YYYY-MM-DD`                                                                                                                                                                     | through a time zone, or as an instant |
| `datetime` | RFC 3339 instant with explicit offset (sent as `Z`) for the person's local midnight at each edge, computed with `Intl` in the person's `timeZone` so DST days are 23 or 25 hours | a local time without an offset        |

**Filters, ANDed with the current list query.**

- **Start only:** `start gte windowStart AND start lt windowEnd`.
- **Start and end:** for `date` fields `end` is inclusive; for `datetime` fields it is exclusive. A null start means unscheduled (tray); a null end means **open-ended** (principle 6). A record with a null start but a set end is still unscheduled: it appears only in the tray, labelled "Ends {end}", and is never placed on the grid with a guessed start.
  - **Window query:** `start lt windowEnd AND end gte windowStart` (date) or `end gt windowStart` (datetime), plus `end is_not_null` whenever the end field is nullable. The explicit `is_not_null` is what makes this query return closed ranges only; disjointness never rests on how SQL compares with null.
  - **Open-ended query (only when `end` is nullable):** `start lt windowEnd AND end is_null`. It returns ranges that started before the window ends and have no end, so they span the rest of the window.
  - The two queries are disjoint (`end is_not_null` versus `end is_null`), so no record appears twice. They cannot be merged into one, because list filters have no OR (section 3). Adding OR to the query contract is rejected (section 15).
- **Request budget:** at most two window queries (window and open-ended) and one tray query. All are aborted when the state changes.

**Order.**

- **Server order:** `start ascending`, then the internal record ID (`storage.idField`). It is never the published display identity. Calendar imposes this order by sending it explicitly (section 5.6, query contract).
- **Within a day cell (renderer):**
  1. multi-day and all-day entries;
  2. timed entries by start;
  3. then server order.

  The first three entries in that order show, and the rest are behind "+N more".

**Overflow.** Each window query asks for the largest allowed page size (section 5.6). Each query reports its own `hasNext`; the notice appears when either does.

- When `hasNext`, the view shows: "More records than fit in this period. Showing the first N."
- That notice links to Agenda, which pages with "Load more" by cursor, and to Filters.
- With exact counts, the wording is "Showing N of M".

**Unscheduled tray.**

- **Query:** a separate `start is_null` query over the current list query, independent of the window.
- **Paging:** one page, then "Load more" by cursor.
- **Count:** shown only with exact counts.
- **Presentation:** collapsed by default.

**Counts.** No count is required. A count appears only under exact counts, per the foundation's count-mode rule.

## 8. Views and interaction

**Calendar navigation (inside the calendar body; not a mode switch).**

- Today, Previous and Next buttons, and the period title (month and year via `Intl`, in the person's locale and numbering system).
- A "Dates by" segmented control when more than one date field is usable.
- A Month | Agenda segmented control.
- The mode itself is chosen only in Display settings → Layout, as for Board.

**Month.**

- A 7-column grid of whole weeks. Weekday headers are localized and start on `weekStart`.
- Each day shows its number. Today is marked, and days outside the anchor month are muted.
- Up to three entry chips per day. The chip label is the title role, otherwise the readable identity.
  - `datetime` chips show the time in the person's time zone and 12/24-hour format.
  - Tone comes from the declared tone field, applied to the chip only.
- Multi-day entries draw as bars within each week row, continuing across rows. Open-ended entries draw to the end of the window with an "open-ended" marker (an arrow plus visually hidden text), never with a guessed end date.
- "+N more" opens a day popover listing that day's records as shared record cards (`cardContent` precedence).
- Weekend shading is not inferred in Phase 1.

**Agenda.**

- Records grouped under sticky day headings for the month, each shown as the shared record card.
- "Load more" pages by cursor.
- The default view on phones.

**Empty states.**

- An empty period shows "Nothing scheduled in {period}", with a pointer to the Unscheduled tray when it has records.
- A list with no records at all uses the existing list empty state.

**Phone (narrow tier).** Agenda only. The Month option is hidden at this width; this is not an error.

**Right to left.** The grid and navigation icons mirror.

**Keyboard and accessibility.**

- Month is a `grid` with `gridcell` days and a roving tab stop:
  - arrow keys move by day;
  - Home and End move within the week;
  - PageUp and PageDown move by month;
  - Enter opens the day popover.
- Entry chips are links whose accessible name includes the date and time.
- Tone is never the only signal.
- Each of the four tones keeps a 4.5:1 text contrast in light and dark themes, asserted in the browser spec.

**Display settings.** In Calendar mode the Group drawer is hidden, as in Board. Density applies to chips and cards.

## 9. Studio authoring and composer homes

| Property                                                      | Composer home (only home)                                                                                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supported_modes` (including `calendar`)                      | Experience › surface inspector › **List settings** (Studio 7.7)                                                                                                                                |
| `calendar_default_view`, `entity_surface_calendar_field` rows | **New** Experience › **Calendar** editor (Studio 7.6), for list surfaces with a qualified `calendar` mode. It edits date fields (start, end, tone) and the default view, with findings inline. |
| Card content                                                  | Existing **Cards and summaries** editor                                                                                                                                                        |

The Studio blueprint's 7.2 and 7.6 tables gain the matching rows **in the Calendar authoring change**. The prerequisite chain is the same as Board Phase 1b.

## 10. Registration inventory for new authoring members

This is the same inventory as Board section 10, applied to `entity_surface_calendar_field` and the `calendar_default_view` column.

1. **First:** the Studio dictionary section `### metadata.entity_surface_calendar_field`, with its column table. Without it, `referenceDdlStatus` throws.
2. **Contract members:**
   - a `define(...)` member with `unique` and `ordered` in `reference-member-contract.ts`;
   - `referenceConstraintNames` and the manifest;
   - the column in `normalized-core-contract.ts`.
3. **Generated output:** `pnpm entity:foundation:generate`, which must leave `entity:foundation:check` passing.
4. **Hand-written guards:**
   - `25_reference_member_guards.sql`;
   - `39_reference_predicate_native_types.sql`;
   - `40_native_snapshot_guard.sql` (the final guard and the trigger loop);
   - the `44_reference_command_privileges.sql` grant loop.
5. **Reconciliation:** the `NativeReferenceWriteTable` union entry, covered by the existing union-coverage test.
6. **Storage and qualification:** storage, load and qualification sites.
7. **Generated types:** regenerate the Kysely/Prisma types.
8. **Forward upgrade:** listed in `manifests/studio.txt`, with `runner-transactions.sha256` and `inventory.json`.
9. **Existing drafts:** unaffected. No `reference_contract_version` change and no backfill.

## 11. Folder structure and test registration

```
packages/platform/foundation/temporal/src/calendar-math.ts        week rows, weekStart, tz day edges (DST-safe); shared with the date picker
packages/platform/foundation/temporal/src/calendar-math.test.ts   colocated; the package "test" script is extended to run it
packages/contracts/platform/entity-list/src/calendar.ts           browser types + parser (wired into parsers.ts, url-state.ts)
packages/platform/entity/runtime/list-view/src/calendar/
  calendar-view.tsx  calendar-month.tsx  calendar-agenda.tsx
  calendar-model.ts  calendar-data.ts  calendar.css
server/packages/contracts/metadata/src/descriptors.ts             calendar on EntityListPresentationDescriptor
server/packages/platform/metadata/src/list-calendar-descriptor.ts (+ .test.ts)  called by parseListPresentation
server/packages/services/records/src/list-calendar.ts             per-viewer resolution (+ .test.ts)
server/packages/services/records/src/filter-value-validation.ts   P2 typed date values (+ tests)
server/packages/planes/studio/meta-entity-authoring/src/native-list-calendar.ts  compile/convert (authoring step)
packages/platform/foundation/i18n/src/catalogs/entity-runtime.ts  list.mode.calendar, list.calendar.* (en/ms/ar)
tests/foundation/entity-list-calendar-model.test.ts                windows, edges, DST, ordering, chip selection
tests/foundation-browser/entity-list-calendar.spec.ts              registered in test:country-browser
```

`calendar.css` is added to `LIST_STYLESHEETS` in the breakpoint policy. The temporal package's `test` script currently runs only `src/index.test.ts`; it becomes `node --import tsx --test src/index.test.ts src/calendar-math.test.ts`. Its `tsconfig.json` already excludes `src/**/*.test.ts`, so no tsconfig change is needed.

## 12. Delivery phases and acceptance

| Step        | Scope                                                             | Acceptance (objective)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1          | Foundation restructure (section 4)                                | The move-only commit passes the diff verification; the owner approval commit is recorded; then the count-mode rule commit lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| P2          | Typed date filter values; stored views applied exactly or retired | Scan reported with zero unresolved rows. Server rejects: no offset, wrong shape, datetime on a date field. A browser view with a bad value, an unknown field or a disallowed operator is removed whole with the notice. URL behaviour is unchanged. Existing list suites pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| C-runtime   | 5.1, 5.5, 5.6; server resolution; Month and Agenda; tray; i18n    | Two **synthetic** entities, one `date` with nullable end and nullable start, one `datetime` in a non-UTC zone: **(a)** date edges are sent as `YYYY-MM-DD`, and datetime edges are offset instants equal to local midnight, including a DST-transition week; **(b)** closed ranges spanning the window appear through the window query; an open-ended record that started before the window appears through the open-ended query, drawn to the window end with the open-ended marker, and no record appears twice; **(c)** the within-day order and "+N more" count, and the popover lists the rest; **(d)** the overflow notice appears when `hasNext`, with "N of M" only under exact counts; **(e)** the tray pages; **(f)** a masked start field gives a disabled option with `LIST_CALENDAR_DATE_FIELD_UNAVAILABLE` and its reason; **(g)** a published `defaultView: "week"` is rejected at parse with `listPresentation.calendar.defaultView must be a renderable view`, and a saved or URL `week` view is normalized to the default view; every window, open-ended and tray request carries `sort` start ascending, and a Load more page keeps the same sort and filters; **(h)** no UUID pattern appears in the DOM; **(i)** phone shows Agenda, RTL mirrors, and grid keyboard navigation works; **(j)** tone chips hold 4.5:1 contrast in light and dark; **(k)** a saved view round-trips `dateField` and `view`, and the anchor appears only in the URL; **(l)** ms and ar month and weekday names come from `Intl` |
| C-authoring | 5.2–5.4, section 10, compiler                                     | Lossless compiler round-trip; DDL rehearsal of guards, grants and snapshots; findings for each section 6 code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| C-editor    | Studio Calendar editor                                            | Every Calendar column has one composer home; findings deep-link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Week        | Time grid, all-day row, current-time line                         | Separate approval; DST and time-zone axis tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Reschedule  | Drag and keyboard move                                            | Separate approval. Rules decided now: (1) the existing patch operation, with If-Match, the idempotency key and every `RecordMutationResult` kind handled; (2) a drop that changes nothing sends no request; (3) a day change sends exactly one field change; (4) a `datetime` keeps its time of day and duration in the person's zone, and a `date` moves by whole days; (5) dropping a timed entry on the all-day row is refused with the visible message "Timed records can't become all-day here"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 13. Dependencies and risks

| Item                      | Effect                                                                  | Handling                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| P1 owner decision         | Calendar cites Board for the shared rules until it is approved          | Section 4 sequence; Board's approval stays intact throughout                                                                            |
| P2 scan                   | Stored views with malformed values would fail once the check is live    | Scan and correct first; browser views are retired whole                                                                                 |
| Parallel metadata cleanup | Authoring files, generators and the Studio blueprint are in active edit | C-authoring waits behind the same gate as Board step D                                                                                  |
| Native list activation    | Calendar cannot be published live through Studio                        | Synthetic fixtures until activation                                                                                                     |
| Composer host chain       | No editor host                                                          | C-editor after the composer host chain in Board section 13. That chain is Board-specific Studio sequencing and stays in Board after P1. |
| Large windows             | Truncated periods                                                       | The overflow notice, Agenda paging and the largest page size; per-day aggregates later                                                  |
| Time zone correctness     | Shifted windows or days                                                 | Kind-based wire rules, `Intl`-based edges and DST tests                                                                                 |

## 14. Decisions required (project owner)

Each decision needs the owner's own wording and date, recorded in this document, as Board's were. A reviewer's sign-off does not count as approval.

1. **Approved 8 October 2026 by the project owner (nchandravel-atlas): "Approve decisions 1, 3 and 4 of the Calendar blueprint".** **P1, foundation restructure.** Approve creating the shared list layout foundation by a move-only commit, independent verification, an owner approval commit, and then the count-mode rule as its own commit.
2. **P1, Board approval carries over.** After the move-only commit and its verification, confirm that Board's revision-4 approval covers the moved text. (This decision can only be made after step 3 of P1.)
3. **Approved 8 October 2026 by the project owner (same wording).** **P2, typed date filter values.** Approve the server-side rule (date `YYYY-MM-DD`; datetime with a required offset) as a shared-framework prerequisite.
4. **Approved 8 October 2026 by the project owner (same wording).** **P2, stored views applied exactly or retired whole.** Approve retiring a stored view whose filters cannot be applied exactly as saved (unknown field, disallowed operator or malformed value). This changes today's silent dropping for stored views; URL state keeps today's behaviour.
5. **Calendar runtime contract.** Approve sections 5.1, 5.5 and 5.6 (including the query contract and the page-size override) and the section 6 codes.
6. **Open-ended rule.** Approve that a null end date means open-ended (section 7), with two disjoint queries rather than an OR in the query contract.
7. **Calendar authoring contract.** Approve sections 5.2–5.4; implementation waits behind the metadata-cleanup gate.
8. **Phase 1 scope.** Month and Agenda only; Week and Reschedule are separate approvals.
9. **No exact counts required** (section 7).
10. **Verification** by fixture-based real-runtime testing until native list activation.
11. **AGENTS.md pointer** to this blueprint, like Board's.

## 15. Rejected options

- Inferring date fields from type or name, or defaulting to `created_at`.
- Fetching all records and laying them out in the browser.
- Putting "all-day first" ordering into the query contract (a sort item has no computed key; within-day order is presentation).
- Storing the default view in `entity_surface_view.mode` (that is the saved view's mode, and it is `table` only).
- Allowing `calendar_default_view` values the release cannot render (the enumeration grows with the renderer instead).
- Dropping a malformed filter value from a stored view (that widens the results); rejecting on the server and retiring the view is fail-closed.
- Hosting the month grid in `react-day-picker` (a single-selection picker with no slot for multiple entries, overflow or range bars). Only the week and locale maths are shared.
- A toolbar mode switch (Layout stays in Display settings, as for Board).
- Recurring-event expansion (needs a recurrence capability); Gantt (needs dependencies and stays parked).
- Weekend shading inferred from locale (for example `Intl.Locale.weekInfo`). If weekend shading returns, it is an authored property, like every other presentation choice.
- Adding OR (or filter groups) to the list query contract to merge the window and open-ended queries. Two disjoint AND queries cost one extra request and leave the contract unchanged.
- Treating a null end as a single-day entry, which guesses an end date. Open-ended is the stated rule.

## 16. Review disposition

| Review item                                                                | Disposition                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1: `react-day-picker` is already shipped; the picker grid is not reusable | Corrected: no new dependency; build the grid; extract the week and locale maths (sections 3, 11, 15)                                                                                                                                                                                                                                                    |
| R1: §11.6.1 is parked and not authority                                    | Authority is AGENTS.md shared-framework work; the 11.6.1 row is consumed for its calendar half only (header)                                                                                                                                                                                                                                            |
| R1: home for the default view                                              | `entity_surface.calendar_default_view`, renderable values only (sections 5.2, 6); the runtime fallback was superseded in revision 2 by parse-time rejection (R4-2)                                                                                                                                                                                      |
| R1: deterministic order                                                    | Start ascending, then internal record ID (not the display identity); the saved sort is ignored in Calendar (section 7)                                                                                                                                                                                                                                  |
| R1: wire format per field kind                                             | Hard rules in section 7; framework hardening P2                                                                                                                                                                                                                                                                                                         |
| R1: tray bound; count-mode decision; tone precedence                       | One page plus Load more; exact counts not required; the tone field colours entry chips only (sections 7, 8)                                                                                                                                                                                                                                             |
| R1/R2: `withRenderableModes` dedupe                                        | Already fixed in `a086ca46f`; removed from the prerequisites                                                                                                                                                                                                                                                                                            |
| R2: "all-day first" not expressible in SQL                                 | Moved to a within-day renderer concern; server order unchanged (section 7)                                                                                                                                                                                                                                                                              |
| R2: foundation restructure conditions                                      | Move don't copy; Board approval preserved by an owner commit; history stays in Board; foundation has its own owner and approval; named "shared list layout foundation" (section 4)                                                                                                                                                                      |
| R2: count-mode rule placement                                              | One rule in the foundation, added in its own commit after approval (section 4)                                                                                                                                                                                                                                                                          |
| R2: tone contrast; catalogue row as data; Phase 2 drag rules               | Sections 8, 5.1, 12                                                                                                                                                                                                                                                                                                                                     |
| R3: filter values are not validated at decode; dropping widens results     | P2: the server rejects; server-stored views are scanned and corrected (including fixtures); browser views are retired whole; URL behaviour unchanged                                                                                                                                                                                                    |
| R3: no offset must be invalid                                              | An explicit rejection case in P2 tests; the scan also corrects wrong offsets                                                                                                                                                                                                                                                                            |
| R3: the reviewer cannot grant the owner's approvals                        | Section 14 lists them as owner decisions; the reviewer supplies the diff verification for P1                                                                                                                                                                                                                                                            |
| R3: the restructure commit must be move-only                               | Section 4, step 2; the count-mode rule lands separately                                                                                                                                                                                                                                                                                                 |
| R4-1: nullable-end semantics contradicted the tray rule                    | A null end means open-ended (principle 6). The review's single-query fix (`OR end IS NULL`) cannot be expressed, because list filters have no OR, so the window and open-ended queries stay as two disjoint AND queries; OR in the query contract is rejected (sections 3, 7, 15)                                                                       |
| R4-2: acceptance (g) was unreachable                                       | The parser rejects a non-renderable `defaultView`; (g) now asserts the rejection and the normalization of saved or URL `view` (sections 5.6, 6, 12)                                                                                                                                                                                                     |
| R4-3: P2 missed silently dropped filters                                   | P2 widened: a stored view whose filters cannot be applied exactly (unknown field, disallowed operator, malformed value) is retired whole; URL keeps field-by-field dropping, with the reason recorded (section 4)                                                                                                                                       |
| R4-4: the explicit sort belongs in the contract                            | Section 5.6 query contract: explicit start-ascending sort on every calendar query, constant sort and filters across pages                                                                                                                                                                                                                               |
| R4-5: composer chain cross-reference                                       | Points to Board section 13 and states the chain stays in Board after P1 (section 13)                                                                                                                                                                                                                                                                    |
| R4: `entity_surface_calendar_field` has no duplicated surface ID           | Correction to the review: the table keeps `entity_surface_id` as the ordering scope for `position` (the generator's `ordered` needs a scope column), and a deferred guard requires every binding to be on that surface, the same pattern as Board (sections 5.2, 5.3)                                                                                   |
| R4: smaller points                                                         | Temporal test script extended (section 11); no count-mode reason code stated (section 6); "qualified query provider" replaced by "the existing list query is the provider" (header); page-size override stated (section 5.6); weekend shading must return as an authored property (section 15); anchor as location state made a principle (principle 8) |
| R5: disjointness rested on null-comparison semantics                       | The window query adds an explicit `end is_not_null` when the end is nullable; `is_not_null` joins the end-field eligibility (sections 2, 7)                                                                                                                                                                                                             |
| R5: the cursor mechanism behind the fixed sort                             | Section 3 states that changing sort or filters between pages invalidates the cursor                                                                                                                                                                                                                                                                     |
| R5: scanned value shapes                                                   | The scan record states the date-shape test covered scalars, arrays and value objects (section 4)                                                                                                                                                                                                                                                        |
| R5: server views could be offered then rejected                            | The strict rule is added to `descriptor.validate`, which already decides `compatible`; server and browser share one rule (sections 3, 4)                                                                                                                                                                                                                |
| R5: start null with end set                                                | Unscheduled: shown only in the tray, labelled "Ends {end}", never placed with a guessed start (section 7)                                                                                                                                                                                                                                               |
| R5: owner decisions 1, 3 and 4                                             | Reviewer reports no technical objection; recording them remains the owner's act (section 14)                                                                                                                                                                                                                                                            |
