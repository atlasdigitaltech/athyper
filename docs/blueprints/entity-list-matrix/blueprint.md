# Entity list Matrix — blueprint

**Status:** proposed, revision 1 (10 October 2026). The direction is approved; the contract properties in section 5 are not, and none may be implemented until the project owner approves them.

- **Direction approved (10 October 2026).** The owner reviewed a reference screenshot of a bid-award grid (items as rows, every participant as a column, price, rank, % above lowest and allocation per cell) and the recommendation to build it as a list Layout. The owner approved in these words: "totally agreeed". The recommendation was:
  - Matrix as a new list Layout with its own blueprint, not a stretched Compare;
  - a server-side rank capability;
  - ranking only on a declared evaluation amount.
- **Prototype:** `docs/prototypes/Neon Bid Evaluation Prototype.html` (Matrix view), requested by the owner: "prepare two view C4 remaining ... and proposed new Matrix View".
- **What this is not.** A Matrix is a Layout of the shared Entity list. It adds no route, page, provider stack or entity-specific grid, and no bid-tabulation screen. Award allocation editing is workflow, not part of this design.

**Scope and authority.**

- The design for showing an Entity's records **pivoted**: one row per member of a master list, one column per member of a second list, and declared measures in each cell. It is available to any eligible Entity through governed, published Meta Entity properties, with no entity name, allowlist or branch in framework code.
- The motivating case is bid evaluation: response lines (supplier × RFP item) shown as items × suppliers. The same Layout fits any two-key fact Entity, for example price-catalogue prices (item × catalogue) or allocations (demand × award).
- **Authority.** Entity onboarding and shared Entity Framework work under [AGENTS.md](../../../AGENTS.md), on the same footing as Board, Calendar, Gantt and Tree.
- **Shared foundation.** The [shared list layout foundation](../entity-list-layouts/foundation.md) applies:
  - the mode registry and renderer traits (section 7);
  - per-viewer availability with reason codes and no fall-through;
  - the count-mode rule (section 5);
  - record-scoped layouts (section 8).
- **Related.** The [Entity list Compare blueprint](../entity-list-compare/blueprint.md) is the drill-down: choosing 2–4 columns opens Compare on the column Entity (section 9.5). The shared comparison core supplies equality, the currency rule and best-value ranking.
- **Authoring authority.** The [Entity Studio blueprint](../entity-studio/blueprint.md) governs authoring storage, codec, compiler and composer.
- Update this document in place. Do not create competing matrix plans.

## Contents

1. Principles
2. Eligibility
3. Current-state facts this design relies on
4. Placement: why a Layout
5. Contract properties
6. Validation, availability and finding codes
7. Query semantics and paging
8. Rank and difference to best (server capability)
9. Views and interaction
10. Accessibility
11. Studio authoring and registration inventory
12. Folder structure and test registration
13. Delivery phases and acceptance
14. Decisions required (project owner)
15. Rejected and out-of-scope options
16. Review disposition

## 1. Principles

1. **Declared, never inferred.** The row key, column key and measures are authored. The framework never pivots on a field it guessed.
2. **Server-side truth.** Rank, best value and "% above lowest" are computed by the server across every record the viewer can read under the list's scope and filters. They are never computed from the columns on screen.
3. **One evaluation amount.** Ranking compares like with like: a declared evaluation-amount field in one currency. The browser never converts currencies.
4. **Bounded screens.** Every screen costs a fixed number of requests, whatever the size of the event.
5. **Text, not colour.** "Lowest", rank, "Declined" and "Not quoted" are text; colour only supports them.
6. **No identifiers.** Rows and columns are labelled by readable identities and reference labels, never record IDs.

## 2. Eligibility

A list surface may declare Matrix when all of these hold (checked by Studio validation and the descriptor parser):

| Rule | Source |
| --- | --- |
| `matrix` is in `supported_modes`, and a qualified `ui_component_contract` row declares `matrix` | `entity_surface.supported_modes`, component catalogue |
| The row field is a required reference to a master Entity (for example `sourcing_event_demand`), filterable with `eq` and `in`, and sortable | field metadata |
| The column field is a required reference to a second Entity (for example the supplier response), filterable with `eq` and `in` | field metadata |
| (row field, column field) is unique per tenant by a database unique key | DDL (onboarding rehearsal, `matrixKeyFinding`) |
| 1–6 measures: readable, unmasked number, money, date or text fields | field metadata |
| A ranked measure is integer, decimal, or a declared evaluation amount; money ranks only through an evaluation amount or one currency | field metadata |
| The surface is used under one common parent: an event's record section, or one `eq` filter on the parent field | foundation section 8 |

## 3. Current-state facts this design relies on

Verified on 10 October 2026.

| Fact | Evidence | Consequence |
| --- | --- | --- |
| The list operation pages at most 100 rows and accepts `recordIds` up to 100 | `MAX_LIST_PAGE_SIZE`, records routes | One cell block is at most 100 rows (section 7) |
| The `in` filter has no published value limit | `filter-value-validation.ts` | Matrix depends on `MAX_LIST_FILTER_VALUES` = 100, which Compare C4 publishes (Compare 5.8 point 8) |
| Group totals exist under exact counts (A2), and group queries are capped at 50 | Tree blueprint A2/A3, `LIST_GROUP_LIMIT` | Column totals reuse group totals; rank needs a new capability (section 8) |
| The procurement master list exists: `sourcing_event_demand`, unique per event | Neon DDL | Rows can be onboarded today |
| Award allocation per (award, demand, company) exists | `sourcing_event_award_allocation_uq` | A pilot Matrix today: demand lines × awards, measure awarded quantity and amount |
| Evaluation amounts exist on demand lines | `sourcing_event_demand.evaluation_amount`, `evaluation_currency_code`, `fx_rate_snapshot` | The evaluation-amount pattern is already in the data model |
| No supplier response or response-line Entity exists | Neon DDL | The bid-tabulation use case needs those Entities onboarded first |

## 4. Placement: why a Layout

Compare shows two to four **chosen** records in detail. The Matrix shows the **whole result set** of a fact Entity, page by page, pivoted. That is what a list Layout is, so the Matrix is a mode of the shared list beside Table, Cards, Board, Calendar, Gantt and Tree. It inherits the list's scope, filters, search, saved views and export.

## 5. Contract properties (proposed; not approved)

### 5.1 Published declaration (per list surface)

```ts
matrix?: {
  rows: {
    field: string;                 // reference to the master Entity (e.g. demand)
    pageSize: 20;                  // rows per page; fixed for revision 1
  };
  columns: {
    field: string;                 // reference to the column Entity (e.g. supplier response)
    pageSize: 5;                   // columns per page
    headerFields?: readonly string[];   // column Entity fields shown in its header (e.g. total, status), max 3
    declined?: { field: string; values: readonly string[] };  // column Entity state meaning "declined to participate"
  };
  measures: readonly {             // 1–6, in display order; the first is the cell's primary value
    field: string;
    rank?: true;                   // show rank and difference to best (section 8)
    better?: "lower" | "higher";   // required with rank
    evaluation?: true;             // this field is the evaluation amount (one currency)
    unitField?: string;            // rank only when units are equal
  }[];
  absentLabel?: string;            // a row with no record for a column, e.g. "Not quoted"
};
```

### 5.2 Per-viewer projection

`surface.matrix` carries only readable fields:
- a masked or unreadable measure is dropped, with the list's single restricted statement;
- an unreadable row or column key makes Matrix unavailable for this viewer (`LIST_MATRIX_KEY_UNAVAILABLE`).

### 5.3 URL and saved state

- **Saved:** `matrix.measures` (which measures show) and `matrix.columns` (the participant filter: pinned column ids, kept as routing identities, never displayed).
- **Location only:** `matrix.rowPage` and `matrix.columnPage`.

## 6. Validation, availability and finding codes

| Code | When |
| --- | --- |
| `MATRIX_ROW_FIELD_INELIGIBLE` / `MATRIX_COLUMN_FIELD_INELIGIBLE` | The key is not a required reference with `eq` and `in` |
| `MATRIX_KEY_NOT_UNIQUE` | No database unique key on (row, column); from `matrixKeyFinding` in the DDL rehearsal |
| `MATRIX_MEASURE_INELIGIBLE` | A measure of an unsupported type, or ranked without `better` |
| `MATRIX_RANK_CURRENCY` | A ranked money measure without `evaluation` or a single-currency guarantee |
| `MATRIX_SCOPE_UNBOUND` (runtime) | No common parent fixes the master list; the prompt asks for the event |
| `LIST_MATRIX_KEY_UNAVAILABLE` (per viewer) | A key field is unreadable or masked for this viewer |

## 7. Query semantics and paging

- **Rows:** one request for a page of the master list (20 rows), scoped to the common parent and narrowed by the master's own search and filters.
- **Columns:** one request for a page of the column Entity (5 columns), with the participant filter.
- **Cells:** one request per screen to the fact Entity, `row in (20 ids)` and `column in (5 ids)`, with the measures. That is at most 100 rows (unique key), so it is complete in one page.
- **Budget:** 3 requests per screen, plus the rank request (section 8). Paging sideways repeats the column and cell requests; paging down repeats the row and cell requests.
- **Absence.** A row with no fact for a column reads `absentLabel` only under the Compare 5.8 point 3 conditions: no fact-level filters, a complete response, and fact access following the parent's. A declined column reads "Declined to participate" in every cell. An unreadable column keeps the unavailable-column rule.
- **Totals.** A column-header total is either a declared header field or an A2 group total by column under exact counts. It is never summed from loaded cells.

## 8. Rank and difference to best (server capability; owner's decision 2)

- **New repository capability,** `rankWithin`. For the shown rows and columns it returns, per cell:
  - the rank of that record's measure among **all** records of the same row key the viewer can read under the list's scope and filters;
  - the best value of that row;
  - the count of ranked records.

  It is one window query (`rank() over (partition by row order by measure)`) bounded to the page's row keys, so its cost does not depend on the number of columns shown.
- **Exact only.** Rank shows only where the list publishes exact counts (foundation section 5). Otherwise the cell shows the value without a rank.
- **What is ranked.** Only a measure with `evaluation`, or one proven single-currency by the currency rule. Ties share a rank. Empty values are never ranked.
- **Difference to best:** `(value − best) / best`, shown as "+16.2%", with "Lowest" (or "Highest") on rank 1. It is computed on the server with exact decimals.

## 9. Views and interaction

1. **Header strip:** the event context, "Showing 11 responses from 11 participants", and "Filter participants".
2. **Toolbar:** search the rows (the master's own search), Display (choose measures), Filter, Export (existing data export of the fact Entity under the same filters) and Compare (enabled when 2–4 columns are selected).
3. **Grid:**
   - The first column is sticky: the row's readable identity and title, with the primary measure's label.
   - The header row is sticky: each column's readable identity, the declared header fields and a selection checkbox.
   - Each cell shows the primary measure, its rank and difference to best, and up to two further measures.
4. **Paging:** "Items 1–20 of 2,000" (exact counts only) with next and previous, and "Participants 1–5 of 11" with next and previous.
5. **Compare drill-down:** select 2–4 column checkboxes and choose Compare. Compare opens on the column Entity with C4 line items in master-list mode, scoped to the same event.
6. **Narrow screens:** one row at a time, as a list of participants and values; the rank stays visible.

## 10. Accessibility

- A `<table>` with a caption, `th scope="col"` participants and `th scope="row"` items. A screen reader announces, for example: "1.3 Frit filter, Pacific Alloy, 98.70 USD, rank 1, lowest".
- Rank, "Lowest", "Declined" and "Not quoted" are text.
- Paging buttons say what they show ("Next participants, 6 to 10").

## 11. Studio authoring and registration inventory

The surface's Matrix editor sets the row field, column field, header fields, declined state and measures. Proposed tables:
- `entity_surface_matrix` (row and column field bindings, absent label, declined field and values);
- `entity_surface_matrix_measure` (field, order, rank, better, evaluation, unit field).

The registration inventory follows the same nine steps as Calendar section 10. It is built after the metadata cleanup.

## 12. Folder structure and test registration

| Path | Content |
| --- | --- |
| `packages/contracts/platform/entity-list/src/matrix.ts` | Browser contract, parser, URL keys |
| `packages/platform/entity/runtime/list-view/src/matrix/` | Runtime grid, paging, drill-down |
| `server/packages/platform/metadata/src/list-matrix-descriptor.ts` (+ test) | Published parsing and section 6 validation |
| `server/packages/services/records/src/list-matrix.ts` (+ test) | Per-viewer projection |
| `server/packages/services/records/src/kysely-record-repository.ts` | `rankWithin` (+ a real-PostgreSQL test) |
| `tests/foundation/entity-list-matrix.test.tsx`, `tests/foundation-browser/entity-list-matrix.spec.ts` | Model, panel and browser tests |

## 13. Delivery phases and acceptance

| Phase | Delivers | Needs the cleanup? |
| --- | --- | --- |
| M1 | Contract, per-viewer projection, the grid on fixtures, paging, measures, participant filter, absence and declined states, drill-down to Compare | Runtime on fixtures: no. A real Entity: yes |
| M2 | `rankWithin` and difference to best, with a real-PostgreSQL test | No |
| M3 | Pilot: `sourcing_event_award_allocation` as demand × award (awarded quantity and amount) | Yes |
| — | RFP bid tabulation: needs the supplier response and response-line Entities onboarded first | Onboarding |

## 14. Decisions required (project owner)

1. The declaration in section 5.1 (row, column, measures, declined, absent label).
2. Fixed page sizes of 20 rows by 5 columns for revision 1.
3. `rankWithin` as a shared repository capability (direction approved).
4. Ranking only on an evaluation amount or a proven single currency (direction approved).
5. Phases M1–M3, and the pilot on award allocations.

## 15. Rejected and out-of-scope options

| Option | Why not |
| --- | --- |
| Stretching Compare to many columns | Compare is a chosen-few detail view; a pivot over a result set is a Layout |
| A bid-tabulation page or app | Bespoke screens are forbidden; the Layout serves every two-key fact Entity |
| Rank computed in the browser from visible columns | Wrong whenever columns are paged or filtered |
| Converting currencies in the browser | Rates and timing are business facts; rank on a declared evaluation amount |
| Editing allocations in the grid | Award workflow and its controls, not a list Layout |
| 200 × 2,000 cells on one screen | Not readable; paged screens and export serve it |

## 16. Review disposition

| Review | Finding | Disposition |
| --- | --- | --- |
| Owner's screenshot review (10 October 2026) | Bid-award grid with rank, % above lowest, declined and allocation | Mapped in sections 5–9; allocation shown as a measure; editing out of scope |
| Audit 7 | Rank must count all bidders, not just visible columns | Section 8, a server capability |
