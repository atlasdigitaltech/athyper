# Shared list layout foundation

**Status:** established on 8 October 2026 by a move-only commit, under decision 1 of the [Entity list Calendar blueprint](../entity-list-calendar/blueprint.md), approved by the project owner (nchandravel-atlas) on 8 October 2026. Every section below is text moved verbatim from the [Entity list Board blueprint](../entity-list-board/blueprint.md), revision 4, which the project owner approved on 8 October 2026. Whether that approval covers the moved text is decided by the project owner after an independent diff check (Calendar blueprint, decision 2). **Owner confirmation (8 October 2026):** the project owner (nchandravel-atlas) approved Calendar decision 2, confirming that Board's revision-4 approval covers the moved text, in these words: "send decision 2 and decisions 5, 6, 8 and 9 country shaped fixture on status and calendar based on updated date as now... later we go in detail during project management.. go ahead with count mode rule commit.." The moved sections therefore carry Board revision 4's approval. **Reviewer attestation (8 October 2026):** the independent diff verification of the move commit `f3cfd6783` against Board revision 4 found no substantive change to the moved text; the only differences are table-column padding. This is a verification finding, not an approval.

**Scope.** Runtime rules shared by every list layout (Table, Cards, Board, Calendar and later layouts): the mode registry and reserved modes, `unavailableModes` and reason codes, no renderer fall-through, the shared record card and card-content precedence, and per-viewer availability in the browser. Authoring storage, the codec, the compiler and the composer stay in the [Entity Studio blueprint](../entity-studio/blueprint.md). Layout-specific behaviour stays in each layout's blueprint.

**Owner.** The project owner. Change this document in place; layout blueprints reference it rather than restating it.

**Reading the moved text.** Section numbers, decision numbers and phase names inside the moved text refer to the Board blueprint revision 4, where the text was approved. Review history stays in the Board blueprint (section 16).

## 1. Phase 0: framework pre-work (moved from Board section 4)

Phase 0 is two commits so that pure moves and behaviour changes are reviewed separately.

**0a — pure moves (no observable behaviour change):**

1. **One mode source.** `packages/contracts/platform/entity-list/src/view-modes.ts` exports `ENTITY_LIST_VIEW_MODES` (the five reserved modes) and `ENTITY_LIST_RENDERABLE_MODES` (currently `table`, `compact`).
   - The six five-mode literals derive from `ENTITY_LIST_VIEW_MODES`: `types.ts:4`, `parsers.ts:39–45`, `descriptors.ts:37`, `descriptor-parser.ts:439–444`, `descriptor-parser.ts:539–543`, `deterministic.ts:701`. In 0a, `deterministic.ts:701` keeps its current five-mode behaviour; 0b-1 narrows it.
   - The `table`/`compact` allow-lists switch to `ENTITY_LIST_RENDERABLE_MODES` with identical values: `normalizeModes` (`entity-list-service.ts:1446`), `native-list-settings.ts` (19, 35, 74, 114), `normalized-core-contract.ts:288`, `graph-builder.ts:263`, `deterministic.ts:751`.
   - Out of scope, and stated so the grep gate is precise: the default-view mode set (`reference-member-contract.ts:193`, `native-list-view.ts:245`; `table` only, no `supportedModes`) and the lookup layout (`packages/contracts/platform/entity-runtime/src/lookup-options.ts`, a browser contract for a different concept).
   - Generated DDL guards regenerate from the contract with unchanged output.
   - `rules.modes` changes from a local literal to the frozen imported `ENTITY_LIST_VIEW_MODES`, so the 0a diff is larger than a text substitution; its values are identical.
2. `EntityRecordCard` moves from `index.tsx` to `list-view/src/record-card.tsx`.
3. A mode → renderer registry (`list-view/src/mode-renderers.ts`) replaces the inline branch in `EntityRows`. In 0a it registers `table` and `compact` and keeps today's fall-through, so behaviour is identical.

**0b — deliberate corrections (each a recorded behaviour change with tests):**

1. **Mode availability.** `normalizeModes` no longer drops modes silently. The list service publishes `surface.supportedModes` = modes that have a registered server projection and are usable by this viewer, plus `surface.unavailableModes: [{ mode, code }]` for declared modes that are not (codes in section 6). `deterministic.ts:700–701` admits only renderable modes and reports the others as a compile finding. This adds a browser contract field; it is approved separately from the Phase 1 contract (decision 1).
2. **No renderer fall-through.** The browser registry renders only registered modes. A mode in `supportedModes` without a renderer, or without its required descriptor projection, is treated as unavailable (`LIST_MODE_RENDERER_MISSING`) and never renders as another layout.
3. **URL validation.** `url-state.ts` validates `view=` against `ENTITY_LIST_VIEW_MODES` at decode; unknown values are ignored, and the existing notice pattern applies.
4. **Exact tone lookup.** `resolveEntityStatusTone` looks up the exact key with `Object.hasOwn`. The compiler guarantees tone keys equal choice `value_text`. List-view status rendering uses the shared resolver. Mixed-case values that silently resolved to `neutral` now resolve correctly. The record header is affected and covered by tests.
5. **No synthesized identity.** `deterministic.ts:747` and `entity-list-service.ts:958–965` stop falling back to the first column, the title field or the first readable field. A missing or unreadable configured `identityField` is a configuration error (`ENTITY_LIST_IDENTITY_REQUIRED`): Studio blocks publication, and the list service returns the existing 503 presentation-required response (`entity-list-service.ts:950–955`). **Precondition:** scan active published list descriptors for a missing or unreadable `identityField`, and correct the governed metadata before this ships.

## 2. Phase 0b browser contract (moved from Board section 5.1)

| Property                                          | Shape                                                        | Consequence                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `EntityListDescriptorV1.surface.unavailableModes` | `readonly { mode: ListViewMode; code: string }[]` (optional) | Declared but unusable modes are reported, never silently dropped; drives disabled Layout options |

## 3. Browser availability behaviour (moved from Board section 6, "Browser" row)

The header row is repeated so the moved row forms a table; the row itself is unchanged.

| Layer   | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser | Display settings → Layout lists every declared mode. Unavailable modes use the existing `SegmentedControl` option `disabled` (a native disabled button, skipped by arrow keys). Because a disabled button is not focusable, the reason is **not** attached to the option. Instead: (1) `SegmentedControl` gains one additive optional prop, `describedBy`, which sets `aria-describedby` on its `radiogroup` root. Existing consumers do not pass it and are unchanged. (2) The list's Display settings renders one explanation block beneath the control, listing each unavailable mode with its reason, and passes that block's id as `describedBy`, so the reason is announced when focus enters the group. (3) The disabled option's accessible name carries a visually hidden "unavailable" suffix. If a saved view or URL selects an unavailable mode, the list falls back to the surface default mode and shows the existing `list.notice.viewUnavailable*` notice. An unregistered renderer (`LIST_MODE_RENDERER_MISSING`) is handled the same way. |

## 4. Card content precedence (moved from Board section 8)

Board and Cards share one card resolution, in this precedence:

1. **Published `cardContent.fields`.** This is the compiled projection of the surface's `binding_kind = summary` placements, authored in the existing "Cards and summaries" editor. Fields appear in placement order, with each placement's qualified display component as `rendererKey`. When present, it defines the card body exactly, and `cardPriority` is ignored for that surface.
2. **Otherwise, today's behaviour:** `recordCardLayout()` over the user's visible columns, ordered by `cardPriority`. This is explicit list metadata (columns and card priority), not inference.

## 5. Count mode in list chrome (approved under Calendar decision 1, 8 October 2026)

**Approval.** The project owner (nchandravel-atlas) approved Calendar decision 1 on 8 October 2026: "Approve decisions 1, 3 and 4 of the Calendar blueprint". Decision 1's approved text names this rule as P1's final step, added in its own commit after the move; it landed as `84e8a5b0c`. The move sections (1–4) carry Board revision 4's approval; this section carries decision 1's.

**Rule.** A count shown in list chrome requires exact counts (`limits.countMode = "exact"`). Without exact counts, the chrome never shows a number that could be wrong. Its wording relies on `hasNext` instead, for example "More records than fit in this period. Showing the first N."

**How each layout applies it.**

- **Board** shows lane counts and a distribution summary as part of its chrome, so it requires exact counts. Without them, Board is unavailable with `LIST_BOARD_COUNTS_UNAVAILABLE` (Board blueprint, section 6).
- **Calendar** shows no count in its chrome, so it does not require exact counts. The Unscheduled tray count, any per-period summary, and the "N of M" wording appear only under exact counts. Otherwise the overflow notice uses `hasNext` (Calendar blueprint, section 7).
- **Table and Cards** keep their existing record-count display, which already reports the list's count mode.

**Why the layouts differ.** A layout whose chrome is made of counts needs real totals. A layout without count chrome would only exclude large tables, for no benefit, if it required them. The difference is this rule applied to different chrome, not an inconsistency to correct.

**The list title in date layouts (added 9 October 2026, approved by the project owner: "go ahead").** Calendar and Gantt show no record count in the list title, under either count mode. Their page query is only the date-window stream, so its count omits open-ended records (a second stream), Unscheduled records (the tray) and, in Gantt, rows past the row ceiling; under non-exact counts the fallback counts only that stream's single page. Each layout reports what it can stand behind in its own chrome: "Showing N of M", the Unscheduled count and Gantt group counts, all under this rule. Table and Cards keep their title count, which is accurate for them.

- **Rejected: summing the streams.** The browser could add the window total, the open-ended total and the tray total, since the streams are disjoint by construction and `mergeRows` deduplicates. A title number is not worth a three-term sum whose correctness depends on that disjointness holding forever, and it would still disagree with the Gantt rows drawn at the ceiling.

**Group headings (added 9 October 2026; applies this section's approved rule).** Group by in Table and Cards follows the same rule at every level: a group heading shows a count only under exact counts, where the server runs its full-set group query. Under any other count mode the server does not run that query and the heading shows no number; the rows loaded on the current page never stand in for a group total.

## 6. Comparing drafts and states (approved 8 October 2026)

**Approval.** The project owner (nchandravel-atlas) approved this section on 8 October 2026: "Foundation section 6 (draft-comparison rule): approved".

**Rule.** A "modified" or "unsaved changes" comparison is order-normalized only where the underlying request is order-insensitive. This rule describes current behaviour; it changes nothing.

| Comparison                                                          | Order meaningful?                                              | Current comparator                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| Saved view vs the active view or default state (toolbar "modified") | No; both sides are normalized through `parseSaveableListState` | normalized state                                |
| Filter editor draft vs applied filters                              | No; filters are ANDed                                          | `filterDraftFingerprint` vs `filterFingerprint` |
| Sort editor draft vs applied sort                                   | **Yes**; sort levels are applied in order                      | exact, order-sensitive                          |
| Columns editor draft vs visible columns                             | **Yes**; column order is displayed                             | exact, order-sensitive                          |

Sort and column comparisons must stay order-sensitive. Normalizing them would hide a reorder that changes the request or the display. The test `tests/foundation/entity-list-draft-comparison.test.ts` (`69b12937b`) locks this against the comparators in `draft-comparison.ts`.

**Clarification (8 October 2026, after approval).** "Normalized" in the table means shape and value normalization, not order. `parseSaveableListState` and `filterInputValue` put values into one form, but neither reorders filters. So today all four comparisons are order-sensitive in practice. For filters this errs safe: reordering filters alone can show "modified", but a real change is never hidden. The rule permits order normalization for filters and saved-view state; it does not require it. This corrects the table's description and changes neither the rule nor the code.

## 7. Renderer traits (approved 9 October 2026)

**Approval.** The project owner (nchandravel-atlas) approved this section on 9 October 2026: "e new foundation section 7 documents behaviour you already approved go ahead".

Section 1's mode → renderer registry (`list-view/src/mode-renderers.ts`) now also carries each renderer's traits: what the layout takes over from the shared list chrome. A new layout declares its traits in the registry; the list reads `listModeTraits(mode)` and never compares mode names for these decisions. The trait record is required for every renderer kind, so a new layout cannot be registered without declaring them, and a mode without a renderer gets no traits.

| Trait              | When true                                                                                                                                       | Table | Cards | Board | Calendar | Gantt | Tree |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----- | ----- | -------- | ----- | ---- |
| `adaptsWhenNarrow` | The layout adapts itself at narrow widths instead of becoming cards                                                                             | no    | no    | yes   | yes      | yes   | yes  |
| `ownPaging`        | The list pagination is hidden; the layout pages its own rows                                                                                    | no    | no    | yes   | yes      | yes   | yes  |
| `ownGrouping`      | The Group drawer is hidden; a saved group stays for Table and Cards                                                                             | no    | no    | yes   | yes      | yes   | yes  |
| `ownCounts`        | The list title shows no record count, because the page query is only one of the layout's streams; the layout reports its counts under section 5 | no    | no    | no    | yes      | yes   | yes  |

`ownCounts` is where the section 5 title rule lives in code (`7314e12cd`, `9eb1ae1b6`). Layout-specific code that is not policy stays per layout: each layout's own page-query inputs and the choice of its component.

`tree` was registered with all four traits on 9 October 2026 (Tree blueprint B1, `c3cbd5d9f`); the column above records it.

## 8. Record-scoped layouts (approved 9 October 2026)

**Approval.** The project owner (nchandravel-atlas) approved this rule as T3 of the [Entity list Tree blueprint](../entity-list-tree/blueprint.md) revision 3, to be decided once for every layout: "pilot 1, T1, T2, T3 and the B2 design entry as per recommendation... approved all five with with T2 and B4 amend below".

Board, Calendar, Gantt and Tree are switched off only in record pickers: `withRenderableModes(…, { board: !embedding, calendar: !embedding, gantt: !embedding, tree: !embedding })`, where `embedding` is the picker. Record sections (`related-entity-section.tsx`) pass a parent `scopeCoordinate` and `section`, not `embedding`, so rule 1 already holds in code. (Corrected at the Tree T1–T3 build on 9 October 2026; the first text of this section said every embedded host.) The rule:

1. **Record-section hosts may offer a layout; record pickers may not.** An embedded list shown as a section of a record (a record-scoped collection) may offer Board, Calendar, Gantt and Tree when its descriptor supports them. A list embedded to choose records keeps Table and Cards only.
2. **The scope comes only from the section's locked record scope,** resolved and enforced on the server exactly as embedded lists already are. A layout never takes its scope from a filter the browser supplies, so a caller cannot widen it.
3. **Fail closed.** A layout that needs a scope (Tree with a `scopeField`) is unavailable in a section whose locked scope does not bind that field, with its reason code, never drawn over the wider set.
4. **Each layout adopts the rule in its own build step.** Tree adopted it as T3 on 9 October 2026: the server publishes `scopeLocked` when the parent scope fixes the scope field and otherwise reports `LIST_TREE_SCOPE_UNBOUND` (Tree blueprint section 12); Board, Calendar and Gantt adopt it when each needs an embedded variant, with no further decision on the rule itself.

