# Entity list Board (Kanban) — blueprint

**Status:** proposed, revision 2 (8 October 2026). This revision resolves the review of revision 1 (see the review disposition at the end). Owner approval of the contract properties in section 5 and the decisions in section 14 is pending. This blueprint is not implementation authority until approved.

**Scope and authority.**

- This is the active design for the shared Entity list **Board** (Kanban) Layout. Board is available to **any** eligible Entity through governed, published Meta Entity properties. No entity name, entity allowlist or entity-specific branch appears in framework code.
- Repository rules in [AGENTS.md](../../../AGENTS.md) apply throughout: Entity onboarding and shared Entity Framework work only, no hardcoded entities, permissions from Meta Entity properties, no synthesized identity, no UUID display and no MFA changes.
- The [Entity Studio blueprint](../entity-studio/blueprint.md) remains the authority for DDL-led authoring storage, the codec, the compiler and the composer. Every authoring property here has its canonical home recorded there; the two documents are updated in the same change wherever they meet (section 9).
- Update this document in place. Do not create competing Board plans or companion design reports.

## Contents

1. Principles
2. Eligibility for any Entity
3. Current-state facts this design relies on
4. Phase 0: framework pre-work (moves and corrections)
5. Contract properties
6. Validation, availability and finding codes
7. Runtime behaviour (Phase 1)
8. Card content
9. Studio authoring and composer homes
10. Registration inventory for new reference members
11. Folder structure and test registration
12. Delivery phases and acceptance
13. Dependencies and risks
14. Decisions required
15. Rejected options
16. Review disposition (revision 1 → 2)

## 1. Principles

1. **Board is a Layout of the shared list**, beside Table and Cards (`ListViewMode` already reserves `board`). It is not a route, page, provider stack or component family of its own.
2. **Metadata declares everything visible.** Lane fields, lanes, lane labels, collapse, terminal lanes and card content are explicit Meta Entity properties. The framework never makes a board from a `status` role, never picks a lane field, never treats a date as "due" and never synthesizes lanes from choices.
3. **Fail closed at every layer.** Studio validation blocks publication of invalid board metadata. The published-descriptor parser rejects structurally invalid board projections. The list service never offers a mode it cannot render for this viewer, and reports why (section 6). The browser never falls through to another renderer.
4. **No record is hidden.** Every published choice belongs to exactly one lane; nullable lane fields add a "No value" lane; values outside the published choices surface as an "Unmapped values" warning, subject to the disclosure rule in section 7.
5. **One vocabulary.** Lanes, labels, tones and coverage validation all use the compiled projection of the typed `entity_field_choice` rows. Nothing re-reads legacy `validation.options` or the list's `filterOptions`.
6. **Existing controls stay authoritative.** Read authorization, field masking, tenant and record scope, explicit denies, audit and publication controls apply unchanged. Board adds no permission and no MFA requirement. Moves (Phase 2) run only through the published lifecycle-transition or patch operations.
7. **No UUID and no synthesized identity** on a card, lane, chip, count, hint or empty state. The list Board renders inside must not synthesize identity either (section 4, item 0b-5).

## 2. Eligibility for any Entity

A list surface may declare Board when **all** of the following hold. Studio validation enforces every rule. The published-descriptor parser and list service re-check the rules marked † at runtime.

| Rule                                                                                                                                                                 | Source                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `board` is in `supported_modes`, and a qualified `ui_component_contract` row for the list host declares `board`                                                      | `entity_surface.supported_modes`, component catalogue                |
| 1–3 lane fields, each a placement on this same list surface †                                                                                                        | `entity_surface_board_lane_field`                                    |
| Each lane field is an entity-owned enum (string `value_text` choices), groupable, filterable with `eq` and `in`, not the identity field, not a UUID and not `json` † | field, choice and placement metadata                                 |
| Each lane field has ≤ 50 published choices; each lane-field configuration has 1–12 lanes †                                                                           | `entity_field_choice`, lane rows                                     |
| Every published choice of the lane field belongs to exactly one lane (coverage is complete; no duplicates) †                                                         | lane value rows (uniqueness enforced in DDL, coverage by validation) |
| A lane with more than one value declares `label_id`; a single-value lane uses the choice label unless it declares one                                                | `entity_surface_board_lane.label_id`                                 |
| `limits.countMode` is `exact` (lane counts are exact full-set aggregates; section 7) †                                                                               | surface `count_mode`                                                 |
| `board` in `supported_modes` and at least one lane-field row require each other †                                                                                    | cross-row check                                                      |

**"Readable" for a viewer** means the lane field is present in the authorized list field set for that viewer, is not masked, and carries its published choice projection. This is the same rule the list service applies when it builds field options (`entity-list-service.ts` field mapping: masked fields receive no options).

Entities without a bounded entity-owned enum are not eligible in Phase 1. Catalogue-domain enums and bounded reference lanes come in Phase 3.

## 3. Current-state facts this design relies on

Verified against the repository on 8 October 2026.

| Fact                                                                                                                                                           | Evidence                                                                                                         | Consequence                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `board` is reserved in both mode types; the browser `MODES` and the server descriptor parser already admit it                                                  | `types.ts:3–4`, `descriptors.ts:36`, `parsers.ts` `MODES`, `descriptor-parser.ts:431–446`                        | No new mode value; the gates are elsewhere                       |
| The server gate drops `board`                                                                                                                                  | `normalizeModes` allows only `table`/`compact` (`entity-list-service.ts:1443–1452`, called at 1059)              | Phase 0b replaces silent dropping (section 4)                    |
| Studio legacy compilation admits all five modes                                                                                                                | `deterministic.ts:700–701`                                                                                       | Phase 0b restricts it to renderable modes                        |
| Native column exists but is pending; DDL guard rejects `board`                                                                                                 | `26_native_column_preparation.generated.sql:66, 81`; `33_native_typed_row_guards.generated.sql:129`              | Live Studio publication waits on native activation (section 13)  |
| `entity_surface_view.mode` admits only `table`                                                                                                                 | `reference-member-contract.ts:203`                                                                               | A Board default view is a later, separate change                 |
| `view=` from the URL is cast without validation                                                                                                                | `url-state.ts:57`; narrowing happens later in `parsers.ts:784–787`                                               | Phase 0b validates at decode                                     |
| `EntityRows` has no renderer registry; unknown modes render as a table                                                                                         | `index.tsx` `EntityRows`                                                                                         | Phase 0a adds a registry; 0b removes the fall-through            |
| Group buckets always use an exact full-set `GROUP BY … count(*)`, independent of `countMode` (which only affects `total`)                                      | `kysely-record-repository.ts:58–66`                                                                              | Lane counts are exact; Board requires `countMode = exact`        |
| A lane with no matching rows produces no bucket                                                                                                                | `groupBuckets`                                                                                                   | Lanes come from metadata and default to 0                        |
| `entity_field_choice` has `value_text` (string only), `label_id`, `tone`, `position`                                                                           | Studio blueprint `entity_field_choice`                                                                           | Lane labels and tones need no new concept                        |
| Compiled `statusTones` are keyed by the raw choice value, but `resolveEntityStatusTone` lowercases before lookup                                               | `graph-builder.ts:381`; `runtime-values.ts:18`                                                                   | Phase 0b makes tone lookup exact                                 |
| List-view's inline tone lookup lacks the `Object.hasOwn` guard                                                                                                 | `index.tsx:4757–4766`                                                                                            | Phase 0b uses the shared resolver                                |
| `EntityRecordCard` and `recordCardLayout()` render Cards mode                                                                                                  | `index.tsx:4256`, `record-card-layout.ts`                                                                        | Board reuses them; no board card component                       |
| Card content already has a Studio concept: `binding_kind = summary` placements in the "Cards and summaries" editor, rendered by qualified catalogue components | Studio blueprint section 7.6                                                                                     | No new `card_slot` column (section 8)                            |
| `groupedRows()` keys groups by raw value                                                                                                                       | `grouped-rows.ts:14`                                                                                             | Board reuses `keyFor`                                            |
| No server producer exists for entity-list `facets` (Activity Centre has its own)                                                                               | `parsers.ts:622`; `activity-center-data`                                                                         | Board does not use `facets`                                      |
| Two native drag-reorder implementations exist                                                                                                                  | `collection-sections.tsx:197`, `index.tsx:3253`                                                                  | Phase 2 extracts one shared helper                               |
| `list.mode.board` exists in en/ms/ar                                                                                                                           | `entity-runtime.ts:348`                                                                                          | Only `list.board.*` keys are new                                 |
| `parseListPresentation` ignores unknown keys                                                                                                                   | `descriptor-parser.ts:412`                                                                                       | New keys must be parsed explicitly, or they are silently dropped |
| Identity fallbacks synthesize a display identity                                                                                                               | `deterministic.ts:747` (`columns[0]`); `entity-list-service.ts:958–965` (`titleField`, then `readableFields[0]`) | Corrected in Phase 0b                                            |
| CI runs browser specs only from explicit lists                                                                                                                 | `test:root` → `test:country-browser` file list (`package.json`)                                                  | The Board spec is registered there                               |

## 4. Phase 0: framework pre-work (moves and corrections)

Phase 0 is two commits so that pure moves and behaviour changes are reviewed separately.

**0a — pure moves (no observable behaviour change):**

1. `packages/contracts/platform/entity-list/src/view-modes.ts` exports `ENTITY_LIST_VIEW_MODES` (the five reserved modes) and `ENTITY_LIST_RENDERABLE_MODES` (currently `table`, `compact`). The browser `ListViewMode`, browser `MODES`, server `EntityListViewMode` and descriptor-parser mode list derive from `ENTITY_LIST_VIEW_MODES`. These sites currently restate `table`/`compact` and switch to `ENTITY_LIST_RENDERABLE_MODES` with identical values: `normalizeModes` (`entity-list-service.ts:1446`), `native-list-settings.ts` (19, 35, 74, 114), `normalized-core-contract.ts:288`, `graph-builder.ts:263`, `deterministic.ts:751`. `native-list-view.ts:241` and `reference-member-contract.ts:203` (default view mode `table` only) are a separate view-mode set and stay as they are. `lookup-options.ts` `layout` is a different concept (lookup layout) and is out of scope. Generated DDL guards regenerate from the contract with unchanged output.
2. `EntityRecordCard` moves from `index.tsx` to `list-view/src/record-card.tsx`.
3. A mode → renderer registry (`list-view/src/mode-renderers.ts`) replaces the inline branch in `EntityRows`. In 0a it registers `table` and `compact` and keeps today's fall-through, so behaviour is identical.

**0b — deliberate corrections (each a recorded behaviour change with tests):**

1. **Mode availability.** `normalizeModes` no longer drops modes silently. The list service publishes `surface.supportedModes` = modes that have a registered server projection and are usable by this viewer, plus `surface.unavailableModes: [{ mode, code }]` for declared modes that are not (codes in section 6). `deterministic.ts:700–701` admits only renderable modes and reports the others as a compile finding.
2. **No renderer fall-through.** The browser registry renders only registered modes. A mode in `supportedModes` without a renderer, or without its required descriptor projection, is treated as unavailable (`LIST_MODE_RENDERER_MISSING`) and never renders as another layout.
3. **URL validation.** `url-state.ts` validates `view=` against `ENTITY_LIST_VIEW_MODES` at decode; unknown values are ignored, and the existing notice pattern applies.
4. **Exact tone lookup.** `resolveEntityStatusTone` looks up the exact key with `Object.hasOwn`. The compiler guarantees tone keys equal choice `value_text`. List-view status rendering uses the shared resolver. Mixed-case values that silently resolved to `neutral` now resolve correctly. The record header is affected and covered by tests.
5. **No synthesized identity.** `deterministic.ts:747` and `entity-list-service.ts:958–965` stop falling back to the first column, the title field or the first readable field. A missing or unreadable configured `identityField` is a configuration error (`ENTITY_LIST_IDENTITY_REQUIRED`): Studio blocks publication, and the list service returns the existing 503 presentation-required response. **Precondition:** scan active published list descriptors for a missing or unreadable `identityField`, and correct the governed metadata before this ships.

## 5. Contract properties

Studio authoring rows are typed and normalized; nothing is stored in `layout_config`. Compiled JSON is derived output. Every authoring property has a composer home (section 9) and a registration entry (section 10).

### Phase 1

**Studio authoring (DDL).**

| Table / column                            | Columns                                                                                                  | Integrity                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity_surface.supported_modes`          | admits `board`                                                                                           | typed guard regenerated; `board` ⇔ lane-field rows                                                                                                                                                                                                                                                                                                                               |
| **New** `entity_surface_board_lane_field` | `entity_surface_id`, `field_binding_id`, `position`                                                      | `entity_surface_id` is retained only as the ordering scope, and a deferred guard requires it to equal the binding's `entity_surface_id`. Unique `(entity_surface_id, field_binding_id)`, dense `position` per surface. The bound field must satisfy section 2.                                                                                                                   |
| **New** `entity_surface_board_lane`       | `board_lane_field_id`, `lane_key`, `label_id` (nullable), `position`, `collapsed_by_default`, `terminal` | Unique `(board_lane_field_id, lane_key)`; dense `position` per lane field; unique `(id, board_lane_field_id)` as a composite-FK target                                                                                                                                                                                                                                           |
| **New** `entity_surface_board_lane_value` | `board_lane_id`, `board_lane_field_id`, `field_choice_id`                                                | Composite FK `(board_lane_id, board_lane_field_id)` → lane. **Unique `(board_lane_field_id, field_choice_id)`**, so a choice is in at most one lane. A deferred guard (the `entity_surface_field_binding` pattern) requires `field_choice_id` to belong to the lane field's bound `entity_field_id`. Coverage (every choice in some lane) is a completeness check in validation. |

No column is added to `entity_surface_field_binding`. Card content uses existing `binding_kind = summary` placements (section 8).

**Component catalogue data** (platform-owned catalogue release, not schema): the list host component declares `board`; display components `date.due` (date/datetime) and `number.progress` (numeric 0–100) qualify for summary placements.

**Published runtime descriptor** (`EntityListPresentationDescriptor` in `descriptors.ts`, parsed explicitly by `parseListPresentation`):

```ts
board?: { laneFields: readonly {
  field: string;
  choices: readonly { value: string; label: string; localizedLabel?: EntityLocalizedTextV1;
                      tone: "neutral" | "success" | "warning" | "danger"; position: number }[];
  lanes: readonly { key: string; label: string; localizedLabel?: EntityLocalizedTextV1;
                    values: readonly string[]; collapsed: boolean; terminal: boolean }[];
}[] };
card?: { fields: readonly { field: string; rendererKey?: string }[] };   // from summary placements, in order
```

**Browser descriptor and state** (`EntityListDescriptorV1`, `board.ts` wired into `parsers.ts` and `url-state.ts`):

```ts
surface.board?: { laneFields: readonly { field: string; label: string; noValueLane: boolean;
  lanes: readonly { key: string; label: string; values: readonly string[];
                    tone: EntityStatusTone; collapsed: boolean; terminal: boolean }[] }[] };
surface.card?: { fields: readonly { field: string; rendererKey?: string }[] };
surface.unavailableModes?: readonly { mode: ListViewMode; code: string }[];   // Phase 0b
SaveableListStateV1.board?: { laneField: string; collapsed: readonly string[] };
```

`EntityListResultV1` is unchanged; lanes use the existing `groups` and `rows`.

### Later phases (shape only; each needs its own approval)

| Phase | Authoring                                                                                                                                                                                                  | Published                                                                         | Browser                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2     | lane `drop_choice_id` (required for multi-value lanes when moves are on); surface `board_move_mode` (`none`/`lifecycle`/`patch`); embedded collection surfaces may declare `board`                         | `board.move`, `lane.dropValue`                                                    | `surface.board.moves[]` evaluated per viewer                                                    |
| 3     | **new** `entity_surface_board_swimlane_field`; lane `wip_limit`, `recent_window_field_id`, `recent_window_days`; surface board summary field and aggregation; catalogue-domain and bounded reference lanes | `board.swimlaneFields`, `lane.wipLimit`, `lane.recentWindow`, `board.laneSummary` | two-level `groups`, `groups[].aggregates` (repository change), `current_principal` filter token |
| 4     | board rank field (optional); lane quick create                                                                                                                                                             | `board.rankField`, `lane.quickCreate`                                             | —                                                                                               |

## 6. Validation, availability and finding codes

| Layer                                     | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio validation (authoring and compile) | Findings block qualification and publication and deep-link to the row: `BOARD_MODE_COMPONENT_UNQUALIFIED`, `BOARD_LANE_FIELD_REQUIRED`, `BOARD_LANE_FIELD_INELIGIBLE`, `BOARD_LANE_FIELD_SURFACE_MISMATCH`, `BOARD_CHOICE_UNASSIGNED`, `BOARD_CHOICE_DUPLICATE`, `BOARD_CHOICE_FOREIGN`, `BOARD_LANE_LABEL_REQUIRED`, `BOARD_LANE_LIMIT`, `BOARD_COUNT_MODE_REQUIRED`, `CARD_RENDERER_INCOMPATIBLE`, `LIST_MODE_UNSUPPORTED`                                                                                     |
| Published-descriptor parser               | Structurally invalid `board`/`card` (unknown keys, wrong types, unknown lane values, missing labels) rejects the descriptor at load (existing fail-closed parser behaviour). Semantic eligibility is re-checked by the list service.                                                                                                                                                                                                                                                                             |
| List service (per viewer)                 | Declared modes that are unusable move from `supportedModes` to `unavailableModes`: `LIST_MODE_UNSUPPORTED` (no server projection, e.g. `dashboard`/`spreadsheet`), `LIST_BOARD_LANE_FIELD_UNAVAILABLE` (masked, not readable or missing its choice projection), `LIST_BOARD_COUNTS_UNAVAILABLE` (`countMode` ≠ `exact`). If no lane field remains usable, Board is unavailable. If some remain, only those are offered.                                                                                          |
| Browser                                   | Display settings → Layout lists every declared mode. Unavailable modes are **disabled options with the reason** beneath the control. This requires per-option `disabled` and description support in the shared `SegmentedControl`, added there for every consumer. If a saved view or URL selects an unavailable mode, the list falls back to the surface default mode and shows the existing `list.notice.viewUnavailable*` notice. Unregistered renderer → `LIST_MODE_RENDERER_MISSING`, handled the same way. |

## 7. Runtime behaviour (Phase 1)

**Data.**

- **Counts.** One request: the current list query plus `group=<laneField>`. Lane counts are exact full-set aggregates (the existing `groupBuckets` behaviour). Their cost equals that of today's group-by in Table/Cards; this is why Board requires `countMode = exact`.
- **Zero lanes.** Lanes come from metadata. A lane with no bucket shows 0.
- **Indexes.** Board qualification requires storage-catalogue evidence of an index whose leading columns cover the tenant column and the lane column. Where the catalogue cannot yet supply index evidence, a capacity test on representative volume is the qualification evidence.
- **Pages.** One page request per expanded, visible lane: the current query AND `laneField in lane.values` (or `is_null` for "No value"). Page size is `limits.defaultPageSize`; "Load more" uses the cursor.
- **Request budget.** Collapsed lanes fetch no pages. Lanes load as they scroll into view. Requests are aborted on state change, so at most `1 + lanes` interactive requests are made.
- **Unmapped values.** Buckets whose value is not a published choice appear as one "Unmapped values" warning with counts and a "View in table" action, and never as lanes. They are shown **only** when the lane field's published projection is available to this viewer. If the field is masked or the projection is missing, those buckets are dropped and no count or value is shown. The server applies this rule before the response.

**Interaction with existing controls.**

- Search, filters, quick filters, scope filters, saved and standard views work unchanged.
- Sort orders cards within each lane.
- Group-by is disabled in Board; a saved view's `group` is retained for Table/Cards.
- Columns becomes "Card fields" when no published `card` exists (section 8). Density applies to cards.
- The lane-field picker appears only when more than one usable lane field exists.

**Layout and accessibility.**

- Lanes are about 300 px wide, with a sticky header (tone, label, exact count, collapse). Each lane scrolls vertically; the board scrolls horizontally with scroll-snap.
- In right-to-left locales, lanes flow right to left.
- Lanes are labelled regions and cards are focusable. Arrow keys move between cards and lanes, and a live region announces load and refresh.
- At narrow width: one lane at a time with a lane-chip strip showing counts.
- Each lane virtualizes above about 100 loaded cards with an internal windowing helper; a new dependency needs separate approval.
- No UUID appears in the DOM.

## 8. Card content

Board and Cards share one card resolution, in this precedence:

1. **Published `card.fields`.** These compile from the surface's `binding_kind = summary` placements, authored in the existing "Cards and summaries" editor, in placement order, with the placement's qualified display component as `rendererKey`. When present, they define the card body exactly, and `cardPriority` is ignored for that surface.
2. **Otherwise, today's behaviour:** `recordCardLayout()` over the user's visible columns, ordered by `cardPriority`. This is explicit list metadata (columns and card priority), not inference.

**Always applied:**

- the identity and `title` role head the card;
- a field equal to the active lane field is omitted from the card body (the lane already shows it);
- `date.due` suppresses overdue emphasis in `terminal` lanes;
- `binding_kind = badge` remains a detail-header concept and does not affect cards.

## 9. Studio authoring and composer homes

The Studio blueprint is updated in the same change as this revision (section 7.2 module map, section 7.6 editors, `entity_surface.supported_modes` and the Cards and summaries note).

| Property                                                                                          | Composer home                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supported_modes` (including `board`)                                                             | Experience › List settings (existing 7.7 surface "List settings" panel)                                                                                                                                                                              |
| `entity_surface_board_lane_field`, `entity_surface_board_lane`, `entity_surface_board_lane_value` | **New** Experience › Board editor (7.6), list surfaces with qualified `board` mode: ordered lane fields chosen from eligible placements; lanes with "Add all choices", drag ordering, labels, collapsed and terminal flags; coverage findings inline |
| Card content                                                                                      | Existing Experience › Cards and summaries editor (`binding_kind = summary` placements and their display components)                                                                                                                                  |

**Scope note (decision 4).** No front-end List settings or Cards and summaries editor exists today. Phase 1b delivers the Experience-module host for List settings plus the Board editor. It reuses the shared field-placement inspector and composer frame, saves typed rows only, and previews with the shared list renderer.

## 10. Registration inventory for new reference members

Adding the three member tables touches generated and hand-written registries. Each site below must be updated in the same change, and the PostgreSQL rehearsal must prove grants, guards and snapshots for the new tables.

| Site                                                                                                                             | Change                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reference-member-contract.ts`                                                                                                   | three `define(...)` members, constraint names (`referenceConstraintNames`)                                                                                                                                                                                                                 |
| `reference-foundation-manifest.ts`                                                                                               | manifest entries                                                                                                                                                                                                                                                                           |
| `24_reference_members.generated.sql`, `33_native_typed_row_guards.generated.sql`, `reference-members.generated.json`             | regenerated by `pnpm entity:foundation:generate`                                                                                                                                                                                                                                           |
| `25_reference_member_guards.sql`                                                                                                 | deferred guards: lane-field surface equality and choice-belongs-to-field (section 5)                                                                                                                                                                                                       |
| `39_reference_predicate_native_types.sql`                                                                                        | draft cross-row validation (the same function that restricts navigation groups to detail surfaces): lane fields only on `list` surfaces (embedded collection from Phase 2), and `board` in `supported_modes` ⇔ lane-field rows                                                             |
| `40_native_snapshot_guard.sql`                                                                                                   | `native_snapshot_final_guard` table list and constraint-trigger loop                                                                                                                                                                                                                       |
| `44_reference_command_privileges.sql`                                                                                            | grant loop                                                                                                                                                                                                                                                                                 |
| `graph-reconciliation.ts`, `normalized-reference-storage.ts`, `kysely-authoring-repository.ts`, `native-schema-qualification.ts` | member registration, storage, reconciliation and qualification                                                                                                                                                                                                                             |
| Studio blueprint field dictionary                                                                                                | three new `metadata.entity_surface_board_*` entries with generated `reference-ddl` markers                                                                                                                                                                                                 |
| Kysely/Prisma generated types                                                                                                    | regenerate after the schema change                                                                                                                                                                                                                                                         |
| Forward upgrade                                                                                                                  | a dated file following the existing `server/db/migrations` sequence (date fixed at implementation), listed in `manifests/studio.txt`, with `runner-transactions.sha256` and `inventory.json` updated. Canonical DDL files carry the final state; applied upgrade checksums stay untouched. |

## 11. Folder structure and test registration

```
packages/contracts/platform/entity-list/src/view-modes.ts            0a  mode sources
packages/contracts/platform/entity-list/src/board.ts                 1   types + parser (wired into parsers.ts, url-state.ts)
packages/platform/foundation/ui/src/segmented-control.tsx            0b  per-option disabled + description
packages/platform/entity/runtime/list-view/src/record-card.tsx         0a  extracted EntityRecordCard
packages/platform/entity/runtime/list-view/src/mode-renderers.ts       0a  registry (0b: no fall-through)
packages/platform/entity/runtime/list-view/src/card-content.ts         1   card precedence (section 8) + tests
packages/platform/entity/runtime/list-view/src/card-renderers.tsx      1   date.due, number.progress
packages/platform/entity/runtime/list-view/src/board/
  board-view.tsx  board-lane.tsx  board-model.ts  board-data.ts
  board.css  board-model.test.ts  board-data.test.ts                 1
packages/platform/entity/runtime/collection-controls/src/drag-reorder.ts  2  shared drag helper
packages/platform/foundation/i18n/src/catalogs/entity-runtime.ts     1   list.board.* only (en/ms/ar)
server/packages/contracts/metadata/src/descriptors.ts                1   board + card on EntityListPresentationDescriptor
server/packages/platform/metadata/src/list-board-descriptor.ts       1   called by parseListPresentation (+ .test.ts)
server/packages/services/records/src/list-board.ts                   1   per-viewer board, unavailableModes, unmapped rule (+ .test.ts)
server/packages/planes/studio/meta-entity-authoring/src/native-list-board.ts  1  compile/convert (+ .test.ts)
server/db/migrations/<dated forward upgrade>                         1   per section 10
tests/foundation/entity-list-board.test.tsx                          1   jsdom (picked up by tests/foundation/*.test.tsx)
tests/foundation-browser/entity-list-board.spec.ts                   1   added to the test:country-browser list in package.json (run by test:root in CI)
```

## 12. Delivery phases and acceptance

| Phase | Scope                                                                                                                                                                    | Acceptance (objective)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0a    | Section 4 moves                                                                                                                                                          | All existing list/foundation suites and `test:ui-baseline` pass unchanged; mode literals exist only in `view-modes.ts`, the default-view set and generated output (verified by grep)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 0b    | Section 4 corrections                                                                                                                                                    | Tests prove: an unsupported published mode appears in `unavailableModes` with its code and is not rendered; an invalid `view=` is ignored with the notice; a mixed-case choice resolves its compiled tone; a descriptor without a usable `identityField` returns `ENTITY_LIST_IDENTITY_REQUIRED` and renders no fallback identity. The active-descriptor identity scan is recorded with zero unresolved entries.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 1     | Board read-only (contracts, validation, compiler, parser, list service, runtime, i18n, saved/standard views)                                                             | Two **synthetic** entities with different field shapes, each from a published-descriptor fixture: (a) each lane's count equals the server bucket count, and lanes without a bucket show 0; (b) each lane's cards satisfy the lane filter; (c) no UUID pattern appears in the DOM; (d) removing lane rows yields Studio finding `BOARD_LANE_FIELD_REQUIRED` and no Board option; (e) a masked lane field yields a disabled Board option with `LIST_BOARD_LANE_FIELD_UNAVAILABLE` and no unmapped counts; (f) an unmapped value shows the warning only when the projection is available; (g) a saved view round-trips `mode = board`, the lane field and collapsed lanes; (h) phone, Arabic (RTL order) and keyboard navigation pass; (i) compiler round-trip of typed rows ↔ published `board`/`card` is lossless, and legacy conversion reports unsupported board-like paths; (j) DDL rehearsal proves grants, guards, uniqueness, composite FK and snapshot inclusion for the three tables. |
| 1b    | Studio List settings host + Board editor                                                                                                                                 | Every Board column has exactly one composer home; each finding code deep-links to its control; keyboard reordering works for lane fields and lanes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2     | Moves + embedded collection Board                                                                                                                                        | Tests prove each `RecordMutationResult` kind returns the card to its lane with the matching message: `Forbidden`, `InvalidTransition`, `VersionConflict`, `VersionRequired`, `FieldsNotWritable`, `ValidationFailed`, `LockRequired`, `IdempotencyConflict`, `NotFound`. `Committed` moves the card and appends exactly one history entry. Repeating the same `Idempotency-Key` returns `replayed: true` with no second entry. A mismatched `If-Match` returns `VersionConflict`. A lifecycle move is offered only when exactly one published transition matches. An embedded Board cannot widen the server-locked record scope.                                                                                                                                                                                                                                                                                                                                                             |
| 3     | Swimlanes, lane totals (repository aggregation), WIP warnings, terminal recent window, `current_principal`, preview drawer, staleness refresh, catalogue/reference lanes | Totals equal server aggregates across pages; a likelihood × impact matrix is configured by metadata alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4     | Quick create, bulk move, inline card edit, live updates, optional rank                                                                                                   | Every write uses existing create/patch/transition controls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Live publication for a real Entity waits on native list authoring activation (section 13).

## 13. Dependencies and risks

| Item                                                                                                                | Effect                                                       | Handling                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Native list columns pending (`entity_surface_native_pending_ck`); compiler admits only the default list/detail pair | Board cannot be published live through Studio                | Build all layers; verify with fixtures; live pilot after activation                        |
| No front-end List settings / Cards and summaries editor                                                             | Board editor has no host                                     | Phase 1b (decision 4)                                                                      |
| Exact lane counts on large tables                                                                                   | `GROUP BY` cost per board load                               | `countMode = exact` requirement, index evidence or capacity test, lazy and collapsed lanes |
| Identity-fallback correction (0b-5)                                                                                 | Lists relying on the fallback stop rendering until corrected | Precondition scan and governed metadata correction before release                          |
| Tone exact-match (0b-4)                                                                                             | Some statuses change colour (to their intended tone)         | Recorded behaviour change with header and list tests                                       |
| Concurrent edits (Phase 2+)                                                                                         | Stale cards                                                  | `If-Match` conflicts roll back; Phase 3 staleness indicator                                |

## 14. Decisions required

1. Approve the Phase 1 contract properties in section 5: three new reference members, `board` in `supported_modes`, the published `board`/`card` projections, `surface.unavailableModes` and `SaveableListStateV1.board`. No binding column is added.
2. Approve Phase 0 as two commits: 0a moves and 0b corrections.
3. Verification: fixture-based real-runtime testing until native list activation (recommended), versus waiting for activation.
4. Approve Phase 1b: the Studio List settings host and Board editor (recommended), or defer both to native activation.
5. Approve correcting the identity fallbacks in 0b (recommended; required by AGENTS.md), including the precondition scan.
6. Board requires `countMode = exact` (recommended), versus a later repository change to make lane counts optional.

## 15. Rejected options

- A board made automatically from a `status` role or any groupable field, or user-chosen lane fields outside the declared list.
- Lanes sourced from `filterOptions` or legacy `validation.options`.
- A new `card_slot` column (it duplicates summary placements and `cardPriority`).
- Client-side grouping of the current page; using `facets` for counts.
- A raw status patch on lifecycle entities.
- A separate board route, component stack or risk-matrix view.
- Browser-computed totals or scores; Gantt/timeline inside Board; flow and cycle-time charts in the list (dashboard scope); WIP limits that block work.

Project management is a motivating example, not a design input. Project and task tables exist in Neon DDL but have no published Entity metadata, so no field-level examples are quoted. Enabling Board for them, or for new issue or risk registers, is ordinary Entity onboarding followed by Board metadata.

## 16. Review disposition (revision 1 → 2)

| Review item                                            | Disposition                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1 incomplete mode inventory                           | Complete inventory in sections 3–4; `normalizeModes` identified as the runtime gate; `deterministic.ts:700`, the parser list, browser `MODES`, the URL cast and the default-view set added |
| B2 Phase 0 "no behaviour change"                       | Split into 0a (moves) and 0b (named corrections); availability reporting specified as `surface.unavailableModes` with codes, plus Studio findings                                          |
| B3 mode without renderer                               | Section 6 and 0b-2: unavailable, never a fall-through                                                                                                                                      |
| B4 `card_slot` without a home / overlap                | Dropped; card content uses existing summary placements in "Cards and summaries"; precedence against `cardPriority` and `binding_kind = badge` stated (section 8); Studio blueprint updated |
| B5 lanes from `filterOptions`                          | Lanes use a compiled `choices` projection of `entity_field_choice`; exact tone keys (0b-4)                                                                                                 |
| B6 counts vs "no repository change"                    | Counts are exact full-set aggregates; Board requires `countMode = exact`; index evidence; zero-bucket lanes show 0                                                                         |
| B7 unmapped-value disclosure                           | Shown only when the lane field projection is available to the viewer; otherwise dropped server-side                                                                                        |
| Composer host                                          | Studio 7.2/7.6 updated; Phase 1b scope stated                                                                                                                                              |
| Registration inventory                                 | Section 10                                                                                                                                                                                 |
| Composite FK invariant; lane-field surface duplication | Section 5 integrity column                                                                                                                                                                 |
| Migration placeholder                                  | Section 10 forward-upgrade rule                                                                                                                                                            |
| Unavailable-board UI conflict                          | One mechanism (section 6): disabled option with reason; the notice applies only after fallback from a saved view or URL                                                                    |
| Browser spec registration                              | Section 11                                                                                                                                                                                 |
| Unverifiable acceptance                                | Section 12 lists objective assertions, including mutation kinds and idempotency                                                                                                            |
| `list.mode.board` exists                               | Only `list.board.*` is added                                                                                                                                                               |
| Parser silently drops new keys                         | `board`/`card` parsed explicitly                                                                                                                                                           |
| URL mode validation                                    | 0b-3                                                                                                                                                                                       |
| Section 9 field examples                               | Removed; no Entity metadata exists for project or task                                                                                                                                     |
| Mixed rejected options and decisions                   | Split into sections 14 and 15                                                                                                                                                              |
| "Readable" undefined                                   | Defined in section 2                                                                                                                                                                       |
| Identity fallbacks                                     | Corrected in 0b-5 (recommended), not tracked separately                                                                                                                                    |
