# Entity list Board (Kanban) — blueprint

**Status:** proposed, 8 October 2026. Owner approval of the contract properties in section 4 and the decisions in section 11 is pending. This blueprint is not implementation authority until approved.

**Scope and authority.**

- This is the active design for the shared Entity list **Board** (Kanban) Layout. Board is available to **any** eligible Entity through governed, published Meta Entity properties. No entity name, entity allowlist or entity-specific branch appears in framework code. Project management is one illustration (section 9), not the design driver.
- Repository rules in [AGENTS.md](../../../AGENTS.md) apply throughout: Entity onboarding and shared Entity Framework work only, no hardcoded entities, permissions from Meta Entity properties, and no MFA changes.
- The [Entity Studio blueprint](../entity-studio/blueprint.md) remains the authority for DDL-led authoring storage, the codec, the compiler and the composer. Board authoring rows, generated DDL, validation and composer controls in this document must conform to it. Where the two documents meet (for example `entity_surface.supported_modes`), update both together.
- Update this document in place. Do not create competing Board plans or companion design reports.

## Contents

1. Principles
2. Eligibility for any Entity
3. Reuse map and pre-work
4. Contract properties
5. Runtime behaviour (Phase 1)
6. Folder structure
7. Delivery phases and acceptance
8. Studio composer
9. Illustration: project management on the generic Board
10. Dependencies and risks
11. Rejected options and decisions required

## 1. Principles

1. **Board is a Layout of the shared list**, beside Table and Cards (`ListViewMode` already reserves `board`). It is not a route, page, provider stack or component family of its own.
2. **Metadata declares everything visible.** Lane fields, lanes, lane labels, collapse, terminal lanes and card slots are explicit Meta Entity properties. The framework never makes a board from a `status` role, never picks a lane field, never treats a date as "due" and never synthesizes lanes from choices.
3. **Fail closed, report clearly.** Missing or invalid board metadata removes the Board option and produces an actionable Studio validation finding. A Board that one viewer cannot use (for example, the lane field is masked) is shown as unavailable, with a reason, in Display settings.
4. **No record is hidden.** Every published choice belongs to exactly one lane; nullable lane fields add a "No value" lane; stored values outside the published choices surface as an "Unmapped values" warning with counts.
5. **Reuse before adding.** Board reuses the list query, grouping counts, record cards, choice/tone resolution, saved views, URL state and i18n catalogues (section 3). It adds only lane mapping, lane rendering and board metadata.
6. **Existing controls stay authoritative.** Read authorization, field masking, tenant/record scope, explicit denies, audit and publication controls apply unchanged. Board adds no permission and no MFA requirement. Moves (Phase 2) run only through the published lifecycle-transition or patch operations.
7. **No UUID is ever displayed** on a card, lane, chip, count, hint or empty state.

## 2. Eligibility for any Entity

An Entity list surface can declare Board when **all** of the following hold. Studio validation and `descriptor-parser` enforce the same rules.

| Rule                                                                                                                                                                                                   | Source                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `board` is in the surface's `supported_modes`, and a qualified `ui_component_contract` row for the list host declares `board`                                                                          | `entity_surface.supported_modes`, component catalogue |
| 1–3 lane fields are declared, each bound on this list surface                                                                                                                                          | `entity_surface_board_lane_field`                     |
| Each lane field is `enum` (Phase 1), groupable, filterable with `eq` and `in`, readable, not the identity field, not a UUID and not `json`                                                             | field and binding metadata                            |
| Its published choices are bounded (≤ 50), and lanes number 1–12                                                                                                                                        | `entity_field_choice`                                 |
| Every published choice belongs to exactly one lane, and no choice appears twice                                                                                                                        | lane value rows                                       |
| A lane with more than one value declares its own label; a single-value lane uses the choice label unless it declares one                                                                               | `entity_surface_board_lane.label_id`                  |
| Card slots reference fields with a compatible type: `due` → date/datetime, `progress` → numeric with published bounds 0–100, `badge` → enum with published tones, `meta` → any readable non-UUID field | `entity_surface_field_binding.card_slot`              |
| `board` in `supported_modes` and board rows require each other                                                                                                                                         | cross-row check                                       |

Entities whose lists can use Board purely through metadata, once their own metadata declares it (illustrations, not enablement):

| Kind of Entity                  | Typical lane field                           | Examples in this repository                                   |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Status-driven work and requests | lifecycle status                             | project tasks, business-partner requests, change cases        |
| Master-data lifecycle           | record status (draft/active/inactive/closed) | project, WBS, project items, catalogue members                |
| Classification boards           | an enum category or type                     | task type, project type, entity class in the Studio catalogue |
| Registers                       | status, severity or response                 | issue/risk registers, if onboarded (section 9)                |

Entities without a bounded enum field are not eligible in Phase 1. Bounded reference lanes (for example an owner or team) arrive in Phase 3.

## 3. Reuse map and pre-work (from the duplicate-code review)

There is no existing board/kanban code and no drag-and-drop or virtualization dependency. The plan reuses these existing assets:

| Need                     | Reuse                                                                                                                           | Rule                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Card rendering           | `EntityRecordCard` and `recordCardLayout()` (list-view)                                                                         | Extract `EntityRecordCard` from `index.tsx` into `record-card.tsx`; Cards and Board both use it. No `board-card.tsx`.       |
| Lane data                | `entityListOperation` and `parseEntityListResult` (api-client)                                                                  | `board-data.ts` is a thin wrapper; no new operation or endpoint in Phases 1–2.                                              |
| Lane counts              | `group=` on the list query; `groupBuckets` (Kysely and in-memory repositories) counts the full filtered set                     | No repository change in Phase 1. `facets` is not used (no producer exists).                                                 |
| Lane keying              | `groupedRows()` raw-value keying                                                                                                | `board-model.ts` reuses the same `keyFor`, so "No value"/"Unmapped" agree with grouped Table and Cards.                     |
| Lane labels and choices  | `ListFieldDescriptorV1.filterOptions` (server `filterOptions()`/`enumOptionLabel()`) and `compileNativeFieldChoices()` (Studio) | Server `list-board.ts` resolves lanes from the already-authorized field descriptor; it never re-reads `validation.options`. |
| Tones                    | `resolveEntityStatusTone()`                                                                                                     | List-view's inline tone lookup is replaced by the shared resolver (it lacks the `Object.hasOwn` guard).                     |
| Published parse/validate | `descriptor-parser.ts`                                                                                                          | `list-board-descriptor.ts` is a helper called by it, not a second entry point.                                              |
| Browser contract         | `parsers.ts`, `url-state.ts`                                                                                                    | `board.ts` is wired into both; no separate URL encoding.                                                                    |
| Drag (Phase 2)           | two native reorder implementations (`collection-sections.tsx`, list-view column picker)                                         | Extract one shared `drag-reorder.ts` in collection-controls and use it for columns, sort levels and board moves.            |
| i18n                     | `list.mode.*`, `list.card.*`, `list.group.*`                                                                                    | Add only `list.mode.board` and `list.board.*` (en/ms/ar).                                                                   |

**Phase 0 framework refactor (no behaviour change, its own commit):**

1. A single `ENTITY_LIST_VIEW_MODES` constant in `packages/contracts/platform/entity-list/src/view-modes.ts`. The server `EntityListViewMode` derives from it. The six literal `table/compact` allow-lists import it: `normalizeModes`, `native-list-settings.ts`, `normalized-core-contract.ts`, `native-list-view.ts`, `deterministic.ts`, `graph-builder.ts`. Generated DDL guards regenerate from the contract. `normalizeModes` reports unsupported published modes as a configuration finding instead of silently dropping them.
2. List-view status rendering uses `resolveEntityStatusTone()`.
3. `EntityRecordCard` moves to `list-view/src/record-card.tsx`.
4. A mode → renderer registry (`list-view/src/mode-renderers.ts`) replaces the inline `mode === "compact" || narrow` branch in `EntityRows`.

Pre-existing first-field identity fallbacks (`deterministic.ts` `columns[0]`; `entity-list-service.ts` `readableFields[0]`) conflict with the readable-identity rule. Their correction is a separate decision (section 11) and is not bundled silently.

## 4. Contract properties (raised for approval)

Studio authoring rows are typed and normalized; nothing is stored in `layout_config`. Compiled JSON is derived output.

| Phase | Studio authoring (DDL)                                                                                                                                                                                                                                                                                                                                                                                                                                               | Published `listPresentation`                                                                                        | Browser descriptor and state                                                                                                                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                   | `ENTITY_LIST_VIEW_MODES` (constant only)                                                                                                                                                                                     |
| 1     | `entity_surface.supported_modes` admits `board`. **New** `entity_surface_board_lane_field` (`entity_surface_id`, `field_binding_id`, `position`). **New** `entity_surface_board_lane` (`board_lane_field_id`, `lane_key`, `label_id` nullable, `position`, `collapsed_by_default`, `terminal`). **New** `entity_surface_board_lane_value` (`board_lane_id`, `field_choice_id`). `entity_surface_field_binding.card_slot` (`badge`/`due`/`progress`/`meta`, nullable) | `board: { laneFields: [{ field, lanes: [{ key, label, values[], collapsed, terminal }] }] }`; field `list.cardSlot` | `surface.board: { laneFields: [{ field, label, lanes: [{ key, label, values[], tone?, collapsed, terminal }], noValueLane: boolean }] }`; field `cardSlot`; `SaveableListStateV1.board?: { laneField, collapsed: string[] }` |
| 2     | lane `drop_choice_id` (required for multi-value lanes when moves are on); board `move_mode` (`none`/`lifecycle`/`patch`) on the surface; embedded collection surfaces may declare `board`                                                                                                                                                                                                                                                                            | `board.move`, `lane.dropValue`                                                                                      | `surface.board.moves: [{ fromLane, toLane, kind, transitionCode?, state, reason? }]`, evaluated per viewer                                                                                                                   |
| 3     | **New** `entity_surface_board_swimlane_field`; lane `wip_limit`, `recent_window_field_id`, `recent_window_days`; board `summary_field_id`, `summary_aggregation`; bounded reference lane fields; card slot `avatar`                                                                                                                                                                                                                                                  | `board.swimlaneFields`, `lane.wipLimit`, `lane.recentWindow`, `board.laneSummary`                                   | `groups[].aggregates`, two-level `groups`; filter value token `current_principal` (server-resolved)                                                                                                                          |
| 4     | board `rank_field_id` (optional); lane `quick_create`                                                                                                                                                                                                                                                                                                                                                                                                                | `board.rankField`, `lane.quickCreate`                                                                               | —                                                                                                                                                                                                                            |

Each property needs a database location, typed API, save/load mapping, validation, compiler mapping and composer control ([Entity Studio blueprint](../entity-studio/blueprint.md), section 7). Phase 1 adds three reference members through the reference-member contract and a forward migration with regenerated generated-DDL regions; applied migration hashes are preserved. The legacy conversion adapter reports any legacy board-like path as unsupported; it never invents board rows.

## 5. Runtime behaviour (Phase 1)

**Data.**

- One count request: the current list query plus `group=<laneField>`. Counts follow `limits.countMode`; with `none`, a lane shows loaded cards with "+" while `hasNext`.
- One page request per expanded, visible lane: the current query AND `laneField in lane.values` (or `is_null` for "No value"), page size `limits.defaultPageSize`, "Load more" by cursor.
- Collapsed lanes fetch counts only. Lanes load as they scroll into view. Requests are aborted when state changes, so at most `1 + lanes` interactive requests are made.
- Unmapped values come from count buckets whose values are not published choices. They appear as a warning with counts and a "View in table" action, never as fabricated lanes.

**Interaction with existing controls.**

- Search, filters, quick filters, scope filters, saved and standard views work unchanged.
- Sort orders cards within each lane.
- Group-by is disabled in Board; a saved view's group is retained for Table/Cards.
- Columns becomes "Card fields", and density applies to cards.
- The lane-field picker appears only when more than one lane field is declared.

**Card.** Card content comes from the shared `EntityRecordCard`: identity + title, card slots (`badge` toned chips, `due` with overdue emphasis suppressed in terminal lanes, `progress` bar, `meta` line), then body fields by `cardPriority`. The status chip is omitted when it equals the lane field. Opening a card uses the existing record link, and its row actions are the existing row actions.

**Layout and accessibility.**

- Lanes are about 300 px wide, with a sticky header (tone, label, count, collapse). Each lane scrolls vertically; the board scrolls horizontally with scroll-snap.
- In right-to-left locales, lanes flow right to left.
- Lanes are labelled regions, and cards are focusable. Arrow keys move between cards and lanes, and a live region announces load and refresh.
- At narrow width: one lane at a time with a lane-chip strip showing counts.
- Each lane virtualizes above about 100 loaded cards, using an internal windowing helper; no new dependency without separate approval.

**Availability.** If Board is declared but unusable for this viewer (lane field masked or unreadable), the Board option is disabled with a reason, and Table remains.

## 6. Folder structure

```
packages/contracts/platform/entity-list/src/view-modes.ts          P0  single mode source
packages/contracts/platform/entity-list/src/board.ts               P1  types + parser (wired into parsers.ts, url-state.ts)
packages/platform/entity/runtime/list-view/src/record-card.tsx       P0  extracted EntityRecordCard (Cards + Board)
packages/platform/entity/runtime/list-view/src/mode-renderers.ts     P0  mode → renderer registry
packages/platform/entity/runtime/list-view/src/board/
  board-view.tsx  board-lane.tsx  board-model.ts  board-data.ts
  board.css  board-model.test.ts  board-data.test.ts               P1
packages/platform/entity/runtime/collection-controls/src/drag-reorder.ts  P2  shared drag helper
packages/platform/foundation/i18n/src/catalogs/entity-runtime.ts   P1  list.mode.board, list.board.*
server/packages/contracts/metadata/src/descriptors.ts              P1  EntityListBoardDescriptor
server/packages/contracts/meta-entity-authoring/src/reference-member-contract.ts  P1  3 members
server/packages/platform/metadata/src/list-board-descriptor.ts     P1  helper called by descriptor-parser.ts (+ .test.ts)
server/packages/services/records/src/list-board.ts                 P1  effective board per viewer (+ .test.ts)
server/packages/planes/studio/meta-entity-authoring/src/native-list-board.ts  P1  compile/convert (+ .test.ts)
server/db/migrations/<date>_entity_surface_board_members.sql       P1  forward migration + regenerated studio/metadata regions
tests/foundation/entity-list-board.test.tsx                        P1  jsdom
tests/foundation-browser/entity-list-board.spec.ts                 P1  real-runtime Playwright
```

## 7. Delivery phases and acceptance

| Phase              | Scope                                                                                                                                                                                                                                                                                                                     | Accepted when                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Refactor         | section 3 items 1–4                                                                                                                                                                                                                                                                                                       | Existing list suites and browser baselines unchanged; mode literals exist only in `view-modes.ts` and generated output                                                                                                                                                                                                 |
| 1 Read-only Board  | section 4 Phase 1 contracts, validation, compiler, server resolution, runtime, narrow/RTL/accessibility, i18n, saved/standard views                                                                                                                                                                                       | Two **synthetic** entities with different field shapes render boards purely from published fixtures. Removing board metadata removes the option with an actionable finding. Masked lane field → Board unavailable with a reason. No-value and unmapped cases are covered. No entity code appears in framework modules. |
| 2 Moves + embedded | Drag/keyboard/"Move to…" via lifecycle transition (exactly one published match) or patch (writable field); If-Match, idempotency, optimistic update with rollback and a message for each `RecordMutationResult` kind; transition input opens the existing form; embedded collection Board with server-locked record scope | Every move re-authorizes on the server; a forbidden or invalid move never changes the board; embedded scope cannot be widened by the client                                                                                                                                                                            |
| 3 Analysis         | Swimlanes (including likelihood × impact matrices), lane totals from server aggregation, WIP warnings, terminal-lane recent window, `current_principal` filter token, shared preview drawer, staleness refresh, reference lanes, avatar slot                                                                              | Totals equal server aggregates across pages; the matrix is configured by metadata alone                                                                                                                                                                                                                                |
| 4 Productivity     | Quick create in lane (prefilled create form), bulk move, inline card edit, live updates, optional rank ordering                                                                                                                                                                                                           | Every write uses existing create/patch/transition controls                                                                                                                                                                                                                                                             |

**Verification across phases:**

- colocated unit tests (model, parser, validation, compiler round-trip, legacy-conversion rejection);
- the jsdom list suite;
- real-runtime Playwright: desktop, phone, Arabic, keyboard, empty/no-value/unmapped lanes, unavailable Board, saved-view round-trip;
- a published-descriptor fixture for each synthetic entity.

Live publication for a real entity waits on native list authoring activation (section 10).

## 8. Studio composer

The Experience module ([Entity Studio blueprint](../entity-studio/blueprint.md), sections 7.2 and 7.6) gains a Board editor under List settings:

- `supported_modes` selection;
- lane-field list (choose from bound enum fields that meet section 2);
- lanes with an "Add all choices" action, drag ordering, labels, collapsed and terminal flags;
- card-slot assignment in the field-placement inspector.

Coverage findings (unassigned choice, duplicate choice, incompatible card slot) block qualification and point to the exact row. Preview uses the shared list renderer. The editor saves typed rows only.

## 9. Illustration: project management on the generic Board

Using only metadata:

- **Project** (`master.project`): lanes on status, with Done = completed + closed and Cancelled collapsed and terminal; due = `planned_end`.
- **Task** (`document.project_task`): lanes on status, with task type as an alternate lane field; due = `planned_end_at`; progress = `completion_pct`; meta = effort hours.
- Phase 2: a Project detail embedded Tasks board.
- Phase 3: swimlanes by assignee or WBS.

Issue and Risk registers do not exist. If onboarded, they are ordinary Entity onboarding (new tables, owning domain package, registered score computation), and their boards need no framework change. A likelihood × impact risk matrix is a Phase 3 Board with swimlanes, not a separate view.

## 10. Dependencies and risks

| Item                                                                                                                                                                        | Effect                                                                      | Handling                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Native list columns are pending (`entity_surface_native_pending_ck`) and the compiler admits only the default list/detail pair, with `surface_view.mode` limited to `table` | Board cannot be published for a live entity through Studio until activation | Build every layer; verify with fixtures; live pilot after activation            |
| No Studio list-settings editor exists                                                                                                                                       | Board editor has no host                                                    | Build the List settings editor host with the Board editor (section 11 decision) |
| Request fan-out on wide boards                                                                                                                                              | Up to 13 interactive requests                                               | Lazy lanes, collapsed lanes count-only, abort on change, 12-lane cap            |
| Large lanes                                                                                                                                                                 | Rendering cost                                                              | Paging plus per-lane windowing                                                  |
| Concurrent edits (Phase 2+)                                                                                                                                                 | Stale cards                                                                 | If-Match conflicts roll back with a message; Phase 3 staleness indicator        |

## 11. Rejected options and decisions required

Rejected: a board made automatically from a `status` role or any groupable field; user-chosen lane fields outside the declared list; client-side grouping of the current page; using `facets` for counts; a raw status patch on lifecycle entities; a separate board route, component stack or risk-matrix view; browser-computed totals or scores; Gantt/timeline inside Board; flow/cycle-time charts in the list (dashboard scope); WIP limits that block work.

Decisions required from the project owner:

1. Approve the Phase 1 contract properties in section 4, including the three new reference members and `card_slot`.
2. Approve the Phase 0 refactor as a separate, behaviour-preserving commit.
3. Verification: fixture-based real-runtime testing until native list authoring activation (recommended), versus waiting for activation.
4. Studio editor: build the List settings editor host with the Board editor in Phase 1 (recommended, so each property has its composer control), or defer both to native list activation.
5. Whether to correct the two first-field identity fallbacks now or track them separately.
6. Whether Issue and Risk registers are to be onboarded, and their owning domain package.
