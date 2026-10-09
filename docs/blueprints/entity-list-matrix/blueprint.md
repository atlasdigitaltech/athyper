# Entity list Matrix — blueprint

**Status:** approved, revision 3 (10 October 2026).
- **Section 14 approval.** The project owner approved section 14 in these words: "Matrix section 14 approved".
- **Build authority.** The owner authorized the build: "Go ahead with the build ... build based on revised prototype with your recommendation".
- **What revision 3 adds:**
  - audit 9's two conditions (section 2.1, and M3's rehearsal work), with the code facts corrected in section 16;
  - the revised prototype, `docs/prototypes/Neon Matrix Prototype.html`;
  - the author's recommendations on the items that prototype raised (section 5.3).
- **Phases now authorized:** M1 and M2. M3 needs the metadata cleanup.

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
| A database unique key contains both the row and the column field, and every **extra dimension** of that key is covered (section 2.1) | DDL (onboarding rehearsal, `matrixKeyFinding`) and the surface's published scope |
| 1–6 measures: readable, unmasked number, money, date or text fields | field metadata |
| A ranked measure is integer, decimal, or a declared evaluation amount; money ranks only through an evaluation amount or one currency | field metadata |
| The surface is used under one common parent: an event's record section, or one `eq` filter on the parent field | foundation section 8 |
| `rows.pageSize × columns.pageSize ≤ MAX_LIST_PAGE_SIZE` (100) | publication rule (section 7) |
| Every ranked measure has a declared evaluation amount (`evaluation`), or the currency rule proves one currency | field metadata (section 8) |

### 2.1 Key coverage: the pivot's dimensions (audit 8, finding 1)

The question is not "is there a unique key on the two pivot fields?". It is: **given the pivot's declared dimensions and the dimensions the list's scope pins, is (row, column) unique?** The rule is dimension-agnostic and names no field in code.

1. Take the database unique key that contains both pivot columns. If none does: `MATRIX_KEY_NOT_UNIQUE`.
2. Subtract the pivot columns and the tenant column. What remains are the key's **extra dimensions**. For `sourcing_event_award_allocation_uq` (tenant, award, demand, company code), the extra dimension is `company_code_id`, found from the key with no literal in the framework.
3. Every extra dimension must be **covered**. The two checkpoints prove different things (audit 9, condition 1); the check is not symmetric:
   - **Publication proves bindability.** It refuses with `MATRIX_KEY_DIMENSION_UNCOVERED`, naming the field, unless each extra dimension is either:
     - **declared** in `pivotDimensions`. It then becomes part of the column identity, for example "award × company"; or
     - **bound** by the read operation's published scope resolver. The runtime descriptor's authorization operations carry a resolver key with named coordinates, for example `company.record.v1` → `companyCodeId` (`entityScopeResolvers`). A locked parent predicate or a declared `eq` filter also binds it.

     Publication cannot see whether a request will resolve the binding to one value, so it does not claim to.
   - **Request time proves pinning.** Before the cell request, the runtime checks that the applied scope and filters resolve every bound dimension to exactly one value. `EntityListScopeCoordinateV1.companyCodeIds` can hold several. If a dimension is not pinned, the grid shows "Choose one company code to compare allocations", using the field's label, and never sums or picks an amount.
4. **Coverage is checked per request, not per link.** The same shared link can be covered for a viewer whose session pins one company and uncovered for a viewer whose session pins four. The "choose one" prompt is a state a shared link can produce, and that is correct.
5. Publication's finding comes from `matrixKeyFinding({ rowKey, columnKey, pivotDimensions, boundDimensions, uniqueKeys, tenantColumn })`. It returns `undefined`, `MATRIX_KEY_NOT_UNIQUE`, or `MATRIX_KEY_DIMENSION_UNCOVERED` with the field named, the same shape as `hierarchyParentKeyFinding`. Wiring it into the onboarding DDL rehearsal is part of M3's work (audit 9, condition 2).

## 3. Current-state facts this design relies on

Verified on 10 October 2026.

| Fact | Evidence | Consequence |
| --- | --- | --- |
| The list operation pages at most 100 rows and accepts `recordIds` up to 100 | `MAX_LIST_PAGE_SIZE`, records routes | One cell block is at most 100 rows (section 7) |
| The `in` filter has no published value limit | `filter-value-validation.ts` | Matrix depends on `MAX_LIST_FILTER_VALUES` = 100, which Compare C4 publishes (Compare 5.8 point 8) |
| Group totals exist under exact counts (A2), and group queries are capped at 50 | Tree blueprint A2/A3, `LIST_GROUP_LIMIT` | Column totals reuse group totals; rank needs a new capability (section 8) |
| The procurement master list exists: `sourcing_event_demand`, unique per (event, requisition line) | `sourcing_event_demand_uq` | Rows have no dimension problem; only the pairing needs the coverage rule |
| One award per supplier per event | `sourcing_event_award_uq` (tenant, event, business partner) | A supplier cannot hold two awards in one event; this is the intended business rule |
| One allocation per award × demand × company code | `sourcing_event_award_allocation_uq` | One award can be split across the tenant's company codes. The pilot covers `company_code_id` by pinning it or by declaring it as a pivot dimension (section 2.1); no schema change |
| A zero awarded amount is valid | `sourcing_event_award_allocation_amount_chk` permits `awarded_amount = 0` when `awarded_quantity > 0` | Difference to best must handle a best of zero (section 8) |
| The scope vocabulary already exists | the operation scope binding's `scopeKind` (`tenant`, `company_code`, `legal_entity`, `operating_organization`, …; `operation-projection.ts`) and `EntityListScopeCoordinateV1` (`companyCodeIds`, `legalEntityId`, parent coordinates) | Coverage consumes the published scope; no new concept |
| Evaluation amounts exist on demand lines | `sourcing_event_demand.evaluation_amount`, `evaluation_currency_code`, `fx_rate_snapshot` | The evaluation-amount pattern is already in the data model |
| No supplier response or response-line Entity exists | Neon DDL | The bid-tabulation use case needs those Entities onboarded first |
| The real-PostgreSQL readiness suite already reads each unique index's columns | `entity-hierarchy-readiness.postgres.test.ts` joins `index.indkey` to `pg_attribute` (`AS columns`) | `matrixKeyFinding` can be fed today; what remains is the function and its wiring into the onboarding DDL rehearsal (M3) |
| Scope bindings are on the runtime descriptor | `EntityAuthorizationProfileV1.operations[].scope` with `entityScopeResolvers` coordinates | Publication can see which dimensions a read binds (section 2.1) |

## 4. Placement: why a Layout

Compare shows two to four **chosen** records in detail. The Matrix shows the **whole result set** of a fact Entity, page by page, pivoted. That is what a list Layout is, so the Matrix is a mode of the shared list beside Table, Cards, Board, Calendar, Gantt and Tree. It inherits the list's scope, filters, search, saved views and export.

## 5. Contract properties (proposed; not approved)

### 5.1 Published declaration (per list surface)

```ts
matrix?: {
  parentField: string;             // section 5.4: the fact's reference to the common parent (e.g. sourcing event)
  rows: {
    field: string;                 // reference to the master Entity (e.g. demand)
    parentField: string;           // the master Entity's reference to the same parent
    pageSize: 20;                  // rows per page; fixed for revision 1
  };
  columns: {
    field: string;                 // reference to the column Entity (e.g. supplier response)
    parentField: string;           // the column Entity's reference to the same parent
    pageSize: 5;                   // columns per page; rows.pageSize × columns.pageSize ≤ MAX_LIST_PAGE_SIZE
    headerFields?: readonly string[];   // column Entity fields shown in its header (e.g. total, status), max 3
    declined?: { field: string; values: readonly string[] };  // column Entity state meaning "declined to participate"
  };
  /** Extra key dimensions that become part of the column identity, beyond
   * (rows × columns), when the surface does not pin them (section 2.1). */
  pivotDimensions?: readonly string[];   // 0–4, default none
  measures: readonly {             // 1–6, in display order; the first is the cell's primary value
    field: string;
    rank?: true;                   // show rank and difference to best (section 8)
    better?: "lower" | "higher";   // required with rank
    evaluation?: true;             // this field is the evaluation amount (one currency)
    unitField?: string;            // rank only when units are equal
  }[];
  absentLabel?: string;            // a row with no record for a column, e.g. "Not quoted"
  /** Revision 3 (section 5.3): */
  rankEligibility?: { field: string; values: readonly string[] };  // column Entity state that may be ranked
  basisLabel?: string;             // authored, e.g. "normalized for unit and quantity"; shown with the evaluation currency
  columnOrder?: readonly { field: string; direction: "asc" | "desc" }[];  // column Entity sort, e.g. items quoted desc, total asc
};
```

### 5.2 Per-viewer projection

`surface.matrix` carries only readable fields:
- a masked or unreadable measure is dropped, with the list's single restricted statement;
- an unreadable row or column key makes Matrix unavailable for this viewer (`LIST_MATRIX_KEY_UNAVAILABLE`).

### 5.3 Items the revised prototype raised (revision 3; author's recommendations, adopted under the owner's build instruction)

| Item | Recommendation adopted | Phase |
| --- | --- | --- |
| **A disqualified bid ranks first.** A technically disqualified bidder would be "Lowest" on every item and push every real bidder down a rank | `rankEligibility`: an authored state on the column Entity, part of `rankWithin`'s canonical predicate. Ineligible records are not ranked and do not count in "of N"; their cells read "Not ranked · not eligible" and the column header shows "Not eligible" | M2 |
| **A partial bid looks cheapest.** A total over 11 of 12 items understates the price | Each column header shows coverage ("11 of 12 items quoted") from exact counts, and a "Partial bid" chip when coverage is short. `columnOrder` lets the author order full bids first, through the column Entity's own sort (no new capability) | M1 |
| **Ranks can shift while the person pages.** Two pages could be ranked from different data | `rankWithin` returns a data revision (a digest of the partition's latest change and count). The banner shows it, and a later page with a different revision shows "A bid changed. Refresh to see current ranks" | M2 |
| **Publish the evaluation basis** so a rank can be defended | The banner reads "Basis: {evaluation currency} · {basisLabel}", and the rank column tooltip repeats it | M1 |
| **Allocation is a second fact** | One grid reads one fact Entity, so measures are fields of that Entity only. Allocation shows only when the fact Entity carries it (the M3 pilot reads the allocation Entity). There are no join measures | — |
| **Declined column** | One merged cell visually; every cell keeps "Declined to participate" as accessible text | M1 |
| **Dense cells** | Display presets derived from the declaration, with no metadata: "Price and rank" (the primary measure and its rank), "Everything". The primary measure stays first | M1 |
| **Key metadata unavailable** | `LIST_MATRIX_KEY_UNAVAILABLE` in `unavailableModes`; the list shows Table, as every unavailable layout does | M1 |
| **A cell filter** | With a fact-level filter applied, an empty cell shows "—" (the line may exist) instead of the absence label | M1 |
| **"Lowest on n items" in the header** | Deferred: it needs a small server aggregate beside `rankWithin`, and is a later decision | — |
| **Best in Compare is not rank in the Matrix** | The Compare panel says that "Best" is among the 2–4 chosen, and the Matrix ranks every visible participant | C4 |

### 5.4 Build-time specifics (revision 3, recorded at the start of the M1/M2 build)

These close three points sections 5.1–8 leave open. They are decided within the approved direction, with no new contract beyond what is listed.

1. **The common parent comes from a fact field, scoped like Tree's `scopeField`.**
   - The declaration gains `parentField`: a required reference on the fact Entity to the parent both master lists belong to, for example the sourcing event.
   - `rows.parentField` and `columns.parentField` name each master list's reference to the same parent.
   - The Matrix draws only for one parent value: a locked record scope on `parentField`, or exactly one `eq` filter on it. Otherwise it shows "Choose a {parent label}" with that field's filter, as Tree does.
   - **Consequence for the M3 pilot:** `sourcing_event_award_allocation` has no sourcing-event column, so the pilot needs the allocation Entity to expose its event (a published derived field) or a different fact. Recorded for M3.
2. **Eligibility is resolved on the server.**
   - `rankEligibility` names a field of the **column** Entity.
   - `rankWithin` excludes facts whose column record is not eligible, through a subquery on the column Entity's own table and tenant, read from its published descriptor with no entity name in code.
   - Eligibility therefore applies to every participant, not only those on screen.
3. **Rank travels on the existing list operation.**
   - A cell request may carry `rank=<field>`, which must be a declared ranked measure, and `matrixColumns=<ids>` (the participant page, at most 100).
   - The server ranks over the request's filters and scope, which include the page's row keys and the participant filter. It applies `matrixColumns` only to the rows it returns, never to the rank predicate.
   - The response adds `ranks` (per returned fact: rank, count ranked, best value) and `revision` (a digest of the ranked set's count and latest version).
   - One request therefore carries both the cells and their ranks. The budget per screen is 3 requests (rows, columns, cells with ranks) and one count request for coverage.
4. **Coverage per column** ("11 of 12 items quoted") comes from an A2 group count of facts by column, under the parent and exact counts. It is never summed from loaded cells. Above the 50-group cap, coverage is not shown for the remaining columns.
5. **Pivot dimensions in M1/M2.** M1 and M2 draw a Matrix whose extra key dimensions are pinned by scope or filter at request time (section 2.1). Drawing declared `pivotDimensions` as part of the column identity (award × company) lands with the M3 pilot, which needs it.
6. **Drill-down.** "Compare selected" opens the column Entity's comparison inline, using that Entity's own published `compare` declaration and list descriptor, with the selected columns as the compared records. It is offered only when the column Entity declares Compare.

### 5.5 URL and saved state

- **Saved:** `matrix.measures` (which measures show) and `matrix.columns` (the participant filter: pinned column ids, kept as routing identities, never displayed).
- **Location only:** `matrix.rowPage` and `matrix.columnPage`.

## 6. Validation, availability and finding codes

| Code | When |
| --- | --- |
| `MATRIX_ROW_FIELD_INELIGIBLE` / `MATRIX_COLUMN_FIELD_INELIGIBLE` | The key is not a required reference with `eq` and `in` |
| `MATRIX_KEY_NOT_UNIQUE` | No database unique key contains both the row and the column field; from `matrixKeyFinding` in the DDL rehearsal |
| `MATRIX_KEY_DIMENSION_UNCOVERED` | A key contains both pivot fields, but one of its extra dimensions is neither pinned by the surface's scope nor declared in `pivotDimensions`; the finding names the field (section 2.1) |
| `MATRIX_BLOCK_ABOVE_PAGE` | `rows.pageSize × columns.pageSize` exceeds `MAX_LIST_PAGE_SIZE` |
| `MATRIX_RANK_WITHOUT_EVALUATION` | A ranked measure with no declared evaluation amount and no single-currency proof; the direction is never inferred |
| `MATRIX_MEASURE_INELIGIBLE` | A measure of an unsupported type (audit 9: narrowed to this one mistake) |
| `MATRIX_RANK_DIRECTION_REQUIRED` | A ranked measure without `better` |
| `MATRIX_SCOPE_UNBOUND` (runtime) | No common parent fixes the master list; the prompt asks for the event |
| `LIST_MATRIX_KEY_UNAVAILABLE` (per viewer) | A key field is unreadable or masked for this viewer |

## 7. Query semantics and paging

- **Rows:** one request for a page of the master list (20 rows), scoped to the common parent and narrowed by the master's own search and filters.
- **Columns:** one request for a page of the column Entity (5 columns), with the participant filter.
- **Cells:** one request per screen to the fact Entity: `row in (20 ids)` and `column in (5 ids)`, plus each pivot dimension in its page values, with the measures. The request sets `limit` explicitly to `rows.pageSize × columns.pageSize` (100 here, never the list's default of 50) and `countMode` none.
- **Block size is a publication rule, not a fact (audit 8, finding 2).** `rows.pageSize × columns.pageSize ≤ MAX_LIST_PAGE_SIZE` is checked at publication (`MATRIX_BLOCK_ABOVE_PAGE`). With the key covered (section 2.1), the block then holds at most one fact per cell, so it is complete in one page.
- **A short or overfull block fails closed.**
  - If the response has `hasNext`, or more than one fact for any cell, the grid does not draw that block. It shows "This page couldn't be read completely" with a retry.
  - An incomplete block is never rendered with the absence label: that would call real records "Not quoted" or "Not allocated". Compare C4 has the same rule for "Not quoted" (Compare 5.8 point 3).
- **Coverage at request time.** Before the cell request, the runtime checks that the applied scope and filters cover every extra key dimension (section 2.1, point 5). If they do not, for example when a viewer filtered to two company codes, the grid shows "Choose one company code to compare allocations", naming the field's label, instead of summing or choosing an amount.
- **Budget:** 3 requests per screen, plus the rank request (section 8). Paging sideways repeats the column and cell requests; paging down repeats the row and cell requests.
- **Absence.** A row with no fact for a column reads `absentLabel` only under the Compare 5.8 point 3 conditions: no fact-level filters beyond the pivot keys and covered dimensions, a complete block, and fact access following the parent's. A declined column reads "Declined to participate" in every cell. An unreadable column keeps the unavailable-column rule.
- **Totals.** A column-header total is either a declared header field or an A2 group total by column under exact counts. It is never summed from loaded cells.

## 8. Rank and difference to best (server capability; owner's decision 2)

- **New repository capability, `rankWithin`,** kept in the record repository beside `measureHierarchy` (as audit 8 recommends).
- **It takes the canonical predicate** (audit 8, finding 3), not a measure plus a page of IDs. The predicate is the pivot's row key and declared dimensions, the scope and the applied filter set, exactly as applied to the cell request. A rank therefore always describes the same set of records as the cells beside it.
- **Partition.** It partitions by the row key plus every declared pivot dimension; pinned dimensions are fixed by the predicate. With `company_code` declared as a pivot dimension, ranks are per (demand, company); with it pinned by scope, per demand.
- **What it returns, per cell:**
  - the rank among **all** records in that partition that the viewer can read, never only the columns on screen;
  - the partition's best value;
  - the count ranked.

  It is one window query bounded to the page's row keys, so its cost does not depend on the number of columns shown.
- **Rank is always on the evaluation amount.** `better` gives the direction. A ranked measure with no evaluation amount (and no single-currency proof) is refused at publication (`MATRIX_RANK_WITHOUT_EVALUATION`); the framework never infers "lower is better". `unitField` gates only the **display** of a unit price's rank. The rank itself is computed on the evaluation amount, which is already normalized, so a mixed-unit row stays comparable, and a cell whose unit differs shows "Units differ" in place of its rank.
- **Exact only.** Rank shows only where the list publishes exact counts (foundation section 5); otherwise the cell shows the value without a rank. Ties share a rank, and empty values are never ranked.
- **Difference to best** (audit 8, finding 4), computed on the server with exact decimals:
  - **Sign:** the figure always means "how much worse than the best": `|value − best| / |best|`, shown as "+16.2%" for both directions. Rank 1 shows "Lowest" or "Highest" (from `better`) and no percentage.
  - **Best of zero:** when the best value is 0 (valid for awarded amounts), the cell shows its value and rank with no percentage. It never shows ∞ or NaN.

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
| M1 | Contract, per-viewer projection, the grid on fixtures, paging, measures, participant filter, absence and declined states, drill-down to Compare, and a development-only request-cost diagnostic (audit 8) | Runtime on fixtures: no. A real Entity: yes |
| M2 | `rankWithin` and difference to best, `rankEligibility`, and the data revision, with a real-PostgreSQL test | No |
| M3 | Pilot: `sourcing_event_award_allocation` as demand × award (awarded quantity and amount). The company dimension is covered in one of two authored ways: pinned by a locked company-code scope, or declared as a pivot dimension so that columns are award × company. Also builds `matrixKeyFinding` and wires it into the onboarding DDL rehearsal (audit 9) | Yes |
| — | RFP bid tabulation: needs the supplier response and response-line Entities onboarded first | Onboarding |

## 14. Decisions (project owner)

All five were approved on 10 October 2026: "Matrix section 14 approved". Audit 9's two conditions are written into section 2.1 and M3.

1. **Approved.** **The declaration** in section 5.1, with `pivotDimensions` and the key-coverage rule in section 2.1 (publication and request time).
2. **Approved.** **Page sizes of 20 rows by 5 columns,** with the block rule `rows.pageSize × columns.pageSize ≤ MAX_LIST_PAGE_SIZE` and short blocks failing closed (section 7).
3. **Approved.** **`rankWithin`** as a shared repository capability beside `measureHierarchy`, taking the canonical predicate and ranking only on the evaluation amount (section 8). The direction is approved.
4. **Approved.** **Ranking only on an evaluation amount or a proven single currency** (the direction is approved; AGENTS.md carries the rule), with the zero-best rule and the sign convention for difference to best.
5. **Approved.** **Phases M1–M3,** and the award-allocation pilot with the company dimension pinned or declared.

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
| Audit 8, first finding 1 (withdrawn by the auditor) | The allocation key's company code was called a schema defect | Withdrawn: one award per supplier per event and one allocation per award × demand × company are the intended rules; no DDL change |
| Audit 8, finding 1 (rewritten) | The matcher asked the wrong question; dimensions must come from the published scope | Adopted: section 2.1 (extra dimensions derived from the key, covered by scope or `pivotDimensions`, `MATRIX_KEY_DIMENSION_UNCOVERED`), checked at request time as well (section 7) |
| Audit 8, finding 2 | The cell block can exceed or fall short of a page | Adopted: block rule at publication, explicit `limit`, and short or overfull blocks failing closed without the absence label (section 7) |
| Audit 8, finding 3 | `rankWithin` under-specifies its predicate | Adopted: canonical predicate, partition by row key plus declared dimensions, always on the evaluation amount, refused without one (section 8) |
| Audit 8, finding 4 | Difference to best at best = 0, and its sign | Adopted: always "worse than best" as a positive figure, and no percentage at a best of zero (section 8) |
| Audit 9 | Publication cannot evaluate "pinned to one value" | Adopted as the publication/request split (section 2.1). Corrected reason: publication *can* see bindings, because the runtime descriptor's authorization operations carry scope resolvers and coordinates; what it cannot see is whether a request resolves to one value |
| Audit 9 | The rehearsal reads unique indexes without their columns | Corrected: `entity-hierarchy-readiness.postgres.test.ts` already reads the columns (`indkey` → `pg_attribute`). The missing parts are `matrixKeyFinding` and the rehearsal wiring, both in M3 |
| Audit 9 | Overlapping codes | `MATRIX_MEASURE_INELIGIBLE` narrowed to unsupported types; `MATRIX_RANK_DIRECTION_REQUIRED` added; `MATRIX_RANK_CURRENCY` dropped (covered by `MATRIX_RANK_WITHOUT_EVALUATION`) |
| Audit 9 | Coverage is per request, not per link | Section 2.1, point 4 |
| Owner's revised prototype (10 October 2026) | Eligibility, partial bids, data revision, evaluation basis, a second fact, declined cells, presets, Table fallback, cell filters, header aggregate | Section 5.3 |
| Audit 8, prototype | Keep the request-cost strip as a development diagnostic; units gate display per cell; 6-row demo paging | Recorded: the strip is proposed as a development-only diagnostic for M1; the unit rule in section 8; product sizes are 20 × 5 |
