# Entity list Aggregate (Summary) — blueprint

**Status:** proposed, revision 2 (10 October 2026).
- **What revision 2 adds** (audit round 3, section 19):
  - the response bound stated as a checked constant, `LIST_AGGREGATE_MAX_CELLS` (section 7.2). It corrects the audit's reading that a Summary response counts against `MAX_LIST_PAGE_SIZE`;
  - section 9.2 rewritten. The A1 discovery the audit asked for is answered from the code: today's group aggregates already compute over an authorized identity set when record authorization is not covered in SQL. The Summary inherits that path instead of the refusal revision 1 proposed (decision 7);
  - the AGENTS.md entry, carrying the two Summary-specific rules.
- **Direction approved (10 October 2026).** The owner reviewed reference screenshots of an analytical report: a fact chosen as the data source, measures, row/column/page fields, and a Detail view and an Aggregate view of the same filtered fact. Two audit rounds reviewed the recommendation. The owner approved it in these words: "recommendation approved .. go head with blueprint creation". What was approved:
  - an Aggregate Layout of the shared Entity list, on the current PostgreSQL;
  - read-only fact Entities onboarded through the Entity Framework, backed by a `security_invoker` view, or by an `insight` projection table when volume or source shape needs one;
  - no second analytics engine, no GraphQL, no report-builder page;
  - phases in the order A0 → A1 → A3 → A2 → A4 → A5;
  - no FX conversion in phase 1;
  - `minimumGroupSize` as a declared floor, not a disclosure-control guarantee;
  - Approval assignment blocked on a separate owner instruction;
  - Chart deferred to A5, and Dashboard out of scope.
- **Not yet approved:** the contract properties in section 5 and the decisions in section 14. Implement nothing in section 5 until section 14 is approved.
- **Two approved conditions were corrected by revision 1.** Section 3 verified both against the code, and audit round 3 confirmed the corrections. Section 19 records the disposition, and section 14 asks for confirmation:
  - the "bucket-unit drift" does not exist;
  - the "group-level drift" is Tree's approved per-level design, not a defect.
- **Delivery:** nothing built.

**Scope and authority.**

- The design for showing an Entity's records **summarised**:
  - grouped by up to three declared dimensions;
  - optionally pivoted by one column dimension;
  - with declared measures in each cell;
  - with totals computed by the server, and every cell able to drill down to its records.
- It is available to any eligible Entity through governed, published Meta Entity properties, with no entity name, allowlist or branch in framework code.
- **Authority.** Entity onboarding and shared Entity Framework work under [AGENTS.md](../../../AGENTS.md), on the same footing as Board, Calendar, Gantt, Tree, Compare and Matrix.
- **Shared foundation.** The [shared list layout foundation](../entity-list-layouts/foundation.md) applies:
  - the mode registry and renderer traits (section 7);
  - per-viewer availability with reason codes and no fall-through;
  - the count-mode rule (section 5);
  - record-scoped layouts (section 8);
  - the policy gates before a layout lands (section 9).
- **Related.**
  - The [Entity list Tree blueprint](../entity-list-tree/blueprint.md) supplies the grouped-tree loading model (one request per expansion), the `groupsOnly` flag, date buckets (A3), group aggregates (A2) and the shared tree renderer (P-T1).
  - The [Entity list Matrix blueprint](../entity-list-matrix/blueprint.md) supplies the money/evaluation-amount rule, the record-authorization admission rule and the data-revision notice.
- **Authoring authority.** The [Entity Studio blueprint](../entity-studio/blueprint.md) governs authoring storage, codec, compiler and composer.
- Update this document in place. Do not create competing report, pivot or analytics plans.

## Contents

1. Principles
2. Eligibility
3. Current-state facts this design relies on
4. Placement: why a Layout, and why not Matrix
5. Contract properties
6. Validation, availability and finding codes
7. Query semantics, loading and request budget
8. Totals, additivity and currency
9. Disclosure rules
10. Fact backing: views and the `insight` projection
11. Views and interaction
12. Accessibility
13. Chart (A5, contract sketch)
14. Decisions required (project owner)
15. Studio authoring and registration inventory
16. Folder structure and test registration
17. Delivery phases and acceptance
18. Rejected and out-of-scope options
19. Review disposition

## 1. Principles

1. **Declared, never inferred.** Dimensions, measures, the aggregates each measure allows, and each measure's additivity are authored. The framework never groups on a field it guessed, and never decides that a balance may be summed.
2. **Server-side truth.** Every cell, subtotal and total is computed by the server over every record the viewer can read under the list's scope and filters. Totals come from the base rows, never from other totals or from loaded cells.
3. **One read path.** The aggregate read is a set of parameters on the existing list operation, with its scope, field masking, explicit denies and record-scope handling. There is no aggregate endpoint.
4. **Bounded screens.** Opening the Summary and each expansion cost a fixed number of requests and a bounded number of cells, whatever the size of the fact.
5. **Honest cells.** A cell that cannot be stated correctly says why in text: "Mixed currencies", "Not summed across Fiscal period", "Too few records". It never shows a number that could be wrong.
6. **No identifiers.** Dimension values are readable identities and reference labels, never record IDs.

## 2. Eligibility

A list surface may declare Aggregate when all of these hold (checked by Studio validation and the descriptor parser):

| Rule | Source |
| --- | --- |
| `aggregate` is in `supported_modes`, and a qualified `ui_component_contract` row declares `aggregate` | `entity_surface.supported_modes`, component catalogue |
| The list publishes exact counts | foundation section 5; the Summary's chrome is made of counts, as Board's is |
| 1–12 dimensions. Each is groupable and is one of: a reference to an Entity with a readable identity, a choice field, a boolean, or a date field with declared buckets | field metadata |
| 1–8 measures. Each is readable, unmasked number or money with declared additivity, or `count` (no field) | field metadata (section 8) |
| A money measure has a readable currency field, or is a declared evaluation amount | Matrix section 8 |
| A semi-additive measure's time fields are each a declared dimension or `eq`-filterable | section 8.2 |

## 3. Current-state facts this design relies on

Verified on 10 October 2026.

| Fact | Evidence | Consequence |
| --- | --- | --- |
| The shared list's operation is `entityList.list` (`GET /api/entity-runtime/:entityCode/list`). It already accepts one `group`, up to 5 `aggregate` values and `groupsOnly`. `records.list` carries the same parameters over the shared query service | `entity-list-routes.ts` (`list` route contract), `records-routes.ts` | The Summary is new parameters on this operation (section 7) |
| Group buckets are computed by `groupBuckets`: `GROUP BY` with `count(*)` and per-group `sum`/`avg`/`min`/`max`, capped at `LIST_GROUP_LIMIT` (50) plus the No value group. A money aggregate also counts its distinct currencies | `kysely-record-repository.ts`, `groupBuckets` | Cells extend this function. The cap and the currency rule are inherited |
| Group aggregates are `sum`, `average`, `minimum`, `maximum`. There is no `count distinct` | `records-routes.ts` (`LIST_GROUP_AGGREGATE_INVALID`) | `countDistinct` is new (section 5) |
| **Multi-level grouping is one request per level, by Tree's approved design.** The saved state holds up to `ENTITY_LIST_MAX_GROUP_LEVELS` (3) levels, checked by the browser's parser. Each expansion sends one `groupsOnly` request with `group = groups[n]` and the ancestors' values as filters | `parsers.ts` (`groups` parsing), Tree blueprint section 7 ("Expanding a group at level n") | The Summary adopts the same model (section 7). The server bounds each request, and the level constant bounds saved state. This is not drift |
| **Date bucket units agree in contract, browser and server:** a date field groups by `month` or `quarter` only. The contract's `week \| month \| quarter \| year` belongs to `EntityListRelativeDateRange`, the relative-date **filter** table, not grouping | `parsers.ts` (`unit === "month" \|\| unit === "quarter"`), `grouped-tree-model.ts` (`GroupLevel.unit`), `query-service.ts` (`LIST_GROUP_INVALID`), `records-routes.ts`; `types.ts` (`EntityListRelativeDateRange`) | No contract narrowing is needed. A new bucket unit is a contract change to both sides |
| Relative-date filters are a closed table: today, yesterday, tomorrow, last/next 7, 30, 90, 365 days, this week, month, quarter, last/this/next year. There is no two-year range | `ENTITY_LIST_RELATIVE_DATE_RANGES` | The pilots do not need one; adding one is a contract change |
| `ledger.v_trial_balance` is a `security_invoker, security_barrier` view over `ledger.gl_balance` joined to `master.fiscal_period`. It exposes company code, GL account, book, fiscal year, period number, currency, four optional dimension references, and opening, period and closing debit, credit and net | `ledger/09_views.sql` | The A0 pilot fact exists. It has no fiscal-period reference, only year and number (section 17, A0) |
| `opening_*` and `closing_*` are period-end balances; `period_*` are movements. `closing_*` are generated columns (opening + period) | `ledger/03_tables.sql` (`gl_balance`) | Balances are semi-additive over fiscal year and period (section 8.2) |
| `gl_balance` is unique per (tenant, company code, book, fiscal period, GL account, currency, cost centre, profit centre, project, dimension set), `NULLS NOT DISTINCT` | `gl_balance_coordinate_uq` | One row per coordinate. Currency is part of the grain, so a total across currencies needs the currency rule |
| **No onboarded Entity is backed by a view, and no finance Entity is onboarded.** `metadata/entities` holds 15 definitions (IAM principal family, reference data, person, address, employee, external worker) | `find metadata/entities -name definition.json` | A0 must prove view-backed read-only onboarding. The dimension Entities (company code, ledger book, GL account at minimum) must be onboarded first, or those dimensions stay unpublished |
| `document.purchase_invoice_line` carries company code, item, commodity category, currency, quantity and generated `net_amount`/`gross_amount`. **The supplier (`business_partner_id`) and the posting date are on the header**, `document.purchase_invoice` | `neon/document/03_tables.sql` | A3's fact is a `security_invoker` view joining header and line, a second view-backed Entity. The line has `(tenant_id, company_code_id)` and commodity indexes; supplier and date selectivity are on the header |
| `document.workflow_request` links to its record by `entity_type text` and `entity_id text`, with no foreign key. `workflow_stage` keeps approvers in `quorum jsonb`. No per-approver assignment table exists | `neon/document/03_tables.sql` | An Approval fact at assignment grain cannot be read today. It needs a typed assignment row, which is workflow DDL outside this workstream's authority |
| `event.outbox` is a common table: per-aggregate `aggregate_type`, `aggregate_id`, `event_version`, `correlation_id`. Its `status`, `attempts`, `locked_until`, `published_at` and `processed_at` describe delivery | `common/event/03_tables.sql` | A projector keeps its own watermark. The outbox holds no history from before the projector existed, so it cannot backfill (section 10.2) |
| Row-level security is applied per schema by a `FOREACH v_table IN ARRAY[…]` template enabling and forcing RLS with `tenant_access`. The same file adds `seed_write … TO CURRENT_USER USING (true) WITH CHECK (true)` | `ledger/10_rls.sql` | Insight tables reuse the template without `seed_write`, under a real-PostgreSQL gate (section 10.3) |
| **A `groupsOnly` request runs no row query.** The repository returns `data: []` with `pageSize: 0`. Its size is bounded by `LIST_GROUP_LIMIT`, not by `limit` or `MAX_LIST_PAGE_SIZE` (100), which bound record pages | `kysely-record-repository.ts` (the `groupsOnly` branch of `list`), `query-service.ts` (`INVALID_LIMIT`) | A Summary response needs its own checked bound (section 7.2) |
| **Group aggregates already handle record authorization that SQL cannot express.** When `aggregateAuthorizationCovered` is false, a grouped or counted list runs `executeAuthorizedAggregate`. It enumerates the matching IDs, authorizes each one (25 at a time), and has the repository aggregate over exactly that ID set. Past a 5-second budget it fails closed with 503 `ENTITY_AGGREGATE_AUTHORIZATION_UNAVAILABLE` | `authorized-aggregate.ts`, `query-service.ts` | The Summary inherits this path (section 9.2; decision 7) |
| Tree and Matrix refuse instead: `LIST_TREE_RECORD_AUTHORIZATION_UNSUPPORTED` and `LIST_MATRIX_RANK_RECORD_AUTHORIZATION_UNSUPPORTED`. Child existence, orphans and rank partitions are computed in SQL shapes the ID set does not restrict | `query-service.ts` | Not the precedent for a grouped aggregate, which A2 already covers |

## 4. Placement: why a Layout, and why not Matrix

- **A Layout.** The Summary shows the whole result set of a fact Entity under the list's scope, filters and search, reduced to groups. It is therefore a mode of the shared list beside Table, Cards, Board, Calendar, Gantt, Tree and Matrix. It inherits the list's scope, filters, search, saved views and export of the underlying records.
- **Not Matrix.** **In a Matrix a cell is one record, ranked against its peers. In a Summary a cell is a measure over many records.** Matrix needs a two-key fact with a unique key over its pivot. The Summary needs groupable dimensions and declared measures. The two share the money rule, the record-authorization admission and the revision notice, and nothing else.
- **The pivot of grouped Table.** The Summary is grouped Table's rows with group aggregates, plus an optional column dimension and totals. It reuses Tree's grouped-tree loading and renderer rather than drawing a third grid.

## 5. Contract properties (proposed; decision 1)

### 5.1 Published declaration (per list surface)

```ts
aggregate?: {
  dimensions: readonly {           // 1–12, in picker order
    field: string;                 // groupable: reference with readable identity, choice, boolean, or date
    buckets?: readonly ("month" | "quarter")[];  // required for a date field; never on another type
    column?: true;                 // may be the column dimension (A2)
  }[];
  measures: readonly {             // 1–8, in picker order
    field?: string;                // omitted only for the record count
    aggregates: readonly ("count" | "countDistinct" | "sum" | "average" | "minimum" | "maximum")[];
    minimumGroupSize?: number;     // 2–100; a declared floor (section 9.3)
  }[];
  defaults: {
    rows: readonly string[];       // 1–3 dimension entries: `field` or `field:month|quarter`
    column?: string;               // a dimension with `column` (A2)
    measures: readonly string[];   // 1–5 entries: `count`, or `field:aggregate`
  };
};
```

### 5.2 Additivity (field property, not surface property; decision 5)

Additivity is a fact about the data. It belongs to the field, so every surface that aggregates the field reads one declaration.

```ts
// on a number or money field's published descriptor
additivity?:
  | { kind: "additive" }
  | { kind: "semiAdditive"; timeFields: readonly string[] }  // e.g. fiscal year and period number
  | { kind: "nonAdditive" };
```

- A field with no `additivity` cannot be a `sum` measure. Publication refuses with `AGGREGATE_ADDITIVITY_REQUIRED`. The framework never assumes a number is additive.
- `count`, `countDistinct`, `minimum` and `maximum` need no additivity. `average` needs no additivity, but it is a plain average over records, never weighted.

### 5.3 Per-viewer projection

`surface.aggregate` carries only what the viewer may use:
- A masked or unreadable dimension or measure field is dropped, with the list's single restricted statement.
- A money measure whose currency field is unreadable is dropped (Matrix 5.6 point 1).
- A reference dimension whose target Entity's readable identity is unreadable for the viewer is dropped.
- No usable dimension: unavailable, `LIST_AGGREGATE_DIMENSION_UNAVAILABLE`. No usable measure: unavailable, `LIST_AGGREGATE_MEASURE_UNAVAILABLE`.
- The descriptor publishes the fact's freshness: `{ kind: "live" }`, or `{ kind: "projected" }` for an `insight` table (section 10).

### 5.4 Request parameters (on `entityList.list`)

| Parameter | Meaning |
| --- | --- |
| `group` | Unchanged: one dimension entry for this request's level |
| `groupsOnly=true` | Required: a Summary request returns groups, not records |
| `aggregate` | Repeated, up to 5: `count`, or `field:aggregate`. Extended with `count` and `countDistinct` |
| `pivot` (A2) | One dimension entry declared `column`; the cells are split by its values |
| `pivotValues` (A2) | On an expansion request: the column values fixed by the opening request, at most `LIST_AGGREGATE_MAX_COLUMNS` |
| `totals=true` | Also return this request's parent row (the total over all its groups) and, with `pivot`, the column totals. Computed in the same statement (section 8.1) |
| `filter`, `search`, scope | Unchanged; ancestor levels arrive as `eq` or `is_null` filters, as Tree sends them |

The server refuses a Summary request that names an undeclared dimension, measure or aggregate (`LIST_AGGREGATE_INVALID`), or one whose list does not publish exact counts (`LIST_AGGREGATE_COUNTS_UNAVAILABLE`).

### 5.5 Response

Added to the list response for a Summary request:

```ts
aggregate: {
  columns?: readonly { value: JsonValue; label: string }[];  // A2; ≤ LIST_AGGREGATE_MAX_COLUMNS, in order
  columnsTruncated?: true;                                   // more column values exist than were returned
  groups: readonly {
    value: JsonValue; label: string; count: number;
    cells: Readonly<Record<string, AggregateCell>>;          // key: column value key, or "total"
  }[];
  groupsTruncated?: true;                                    // this level had more than LIST_GROUP_LIMIT groups
  parent?: { count: number; cells: Readonly<Record<string, AggregateCell>> };  // with totals=true
  revision: string;                                          // digest of the aggregated set (section 7.4)
  asOf?: string;                                             // projected facts only (section 10.2)
};
type AggregateCell = Readonly<Record<string,                 // key: measure entry, e.g. "period_net:sum"
  | { value: string; currency?: string }                     // exact decimal as text
  | { state: "empty" | "mixedCurrency" | "notSummable" | "suppressed" }>>;
```

### 5.6 URL and saved state

- **Saved:** `aggregate.rows` (1–3 dimension entries), `aggregate.column`, `aggregate.measures`. URL keys `aggregate.rows`, `aggregate.column`, `aggregate.measures`. Invalid or undeclared entries are dropped by the parser, as `groups` entries are today.
- **Location only:** expanded groups (`aggregate.open`, a bounded list of value paths), so a shared link reopens the same expansions within the request budget.

## 6. Validation, availability and finding codes

| Code | When |
| --- | --- |
| `AGGREGATE_DIMENSION_INELIGIBLE` | A dimension is not groupable, is a date without `buckets`, has `buckets` without being a date, or is a reference whose target has no readable identity |
| `AGGREGATE_MEASURE_INELIGIBLE` | A measure of an unsupported type, or an aggregate the field's type does not support (`countDistinct` on money; `sum` or `average` on text) |
| `AGGREGATE_ADDITIVITY_REQUIRED` | `sum` on a field with no declared additivity |
| `AGGREGATE_SUM_NON_ADDITIVE` | `sum` on a `nonAdditive` field |
| `AGGREGATE_SEMI_ADDITIVE_TIME_UNBOUND` | A semi-additive field's time field is neither a declared dimension nor `eq`-filterable |
| `AGGREGATE_DEFAULTS_INVALID` | A default entry is undeclared, or there are more than 3 rows or 5 measures |
| `AGGREGATE_GROUP_SIZE_INVALID` | `minimumGroupSize` outside 2–100 |
| `LIST_AGGREGATE_COUNTS_UNAVAILABLE` (per viewer) | The list does not publish exact counts |
| `LIST_AGGREGATE_DIMENSION_UNAVAILABLE`, `LIST_AGGREGATE_MEASURE_UNAVAILABLE` (per viewer) | Section 5.3 |
| `LIST_AGGREGATE_INVALID` (request) | An undeclared dimension, measure or aggregate; `pivot` on a dimension without `column`; more than `LIST_AGGREGATE_MAX_COLUMNS` `pivotValues` |
| `ENTITY_AGGREGATE_AUTHORIZATION_UNAVAILABLE` (request, existing, 503) | Record authorization not covered in SQL could not authorize the matching set within its budget (section 9.2) |

## 7. Query semantics, loading and request budget

### 7.1 Loading model (Tree's, decision 2)

- **Opening** sends one request: `group = rows[0]`, `groupsOnly`, the chosen measures, `totals=true`, and with A2 `pivot`. It returns level 1's groups with their cells, the grand total row and, with `pivot`, the column values and column totals.
- **Expanding a group at level n** sends one request: `group = rows[n]`, the ancestors' values as filters, the same measures and `totals=true`, and with A2 `pivotValues` fixed to the opening's columns. It returns that group's children and recomputes the group's own row as `parent`.
- **A last-level group** drills down (section 11) rather than expanding into records. The Summary never draws records.
- **Why not one multi-level request.** Three levels of 50 groups is up to 125,000 rows with their cells. A cap on a single multi-level response would truncate somewhere arbitrary. One request per expansion keeps every response at one level of at most 50 groups. It also reuses the approved Tree loader and renderer, and leaves `ENTITY_LIST_MAX_GROUP_LEVELS` as a saved-state bound, where it already sits.

### 7.2 Bounds

| Bound | Value | Source |
| --- | --- | --- |
| Groups per response | `LIST_GROUP_LIMIT` (50) plus No value and Unmapped values, with `groupsTruncated` | Tree A2/A3 |
| Column values | `LIST_AGGREGATE_MAX_COLUMNS` = 12, with `columnsTruncated` | new; decision 3 |
| Measures per request | 5 | existing `aggregate` limit |
| Cells per response | `LIST_AGGREGATE_MAX_CELLS` = 3,600 measure values | new; decision 3 |
| Levels | `ENTITY_LIST_MAX_GROUP_LEVELS` (3) | saved state |

- **The response bound is checked, not implied.** A Summary request is `groupsOnly`, so `limit` and `MAX_LIST_PAGE_SIZE` do not bound it (section 3). Its largest response is:
  - 53 rows: 50 groups, No value, Unmapped values, and the parent total;
  - each row with 13 cells: 12 column values and the row total;
  - each cell with 5 measures;
  - plus the 13 column totals.

  That is 54 × 13 × 5 = 3,510 values at most. Rows and columns multiply; they do not add.
- **How it is enforced.** `LIST_AGGREGATE_MAX_CELLS` is a contract constant, set to the computed maximum rounded up to 3,600.
  - A contract test asserts `(LIST_GROUP_LIMIT + 4) × (LIST_AGGREGATE_MAX_COLUMNS + 1) × 5 ≤ LIST_AGGREGATE_MAX_CELLS`. Raising the group cap, the column cap or the measure limit therefore fails that test instead of silently enlarging responses.
  - This is the conversion `MATRIX_BLOCK_ABOVE_PAGE` made for Matrix.
  - The server does not set `limit` on a Summary request, because no record page is read.
- **Truncation is always stated.** A truncated level shows "Showing 50 of more {dimension}. Filter {dimension} to narrow." A truncated column dimension shows "Showing 12 {dimension} values. Filter {dimension} to choose which."
- **No "Other" bucket.** The grand total and the parent rows still cover every record, because they are computed from base rows. A truncated pivot therefore never shows totals that look complete without saying so.

### 7.3 Budget

- Opening: one Summary request.
- The list's own page query runs at a limit of one, once per filter change, to keep the list's authority check. This is Matrix 5.6 point 5, and the Summary is mounted the same way, before the list's loading state.
- Each expansion: one request. Requests in flight are aborted when the list state changes, as Tree's are.
- A development-only request-cost attribute, `data-aggregate-requests`, is set on the grid, as Matrix does.

### 7.4 Consistency across requests

- Every response carries `revision`, a digest of the aggregated set's count and latest change, as Matrix's rank revision does.
- An expansion's `parent` row replaces the row drawn from the earlier response. If a revision differs from the opening's, the Summary shows "Values changed since this summary opened. Refresh to see current totals." It never mixes revisions silently.

## 8. Totals, additivity and currency

### 8.1 Totals from base rows

- Each request runs one statement with `GROUPING SETS`. Without a pivot: `(group)` and `()`. With a pivot: `(group, pivot)`, `(group)`, `(pivot)` and `()`. That yields the cells, row totals, column totals and the parent total over exactly one predicate.
- An `average` total is the average of the base records, never an average of averages. A `countDistinct` total is the distinct count over the base records, never a sum of group counts.
- **`count` and `countDistinct` are different measures.** `count` counts fact records. `countDistinct` counts distinct values of a reference or choice field. Labels name which one: "Records", "Distinct {field}".

### 8.2 Additivity

- **Additive** measures sum anywhere.
- **Non-additive** measures never sum (refused at publication).
- **Semi-additive** measures sum only across records that share one value of every time field. A cell's sum is valid when each time field is either:
  - **grouped by value** at the cell's level, at an ancestor level, or as the column dimension. A date bucket does not count, because a month holds many dates; or
  - **pinned** to one value by an `eq` filter or the locked scope, checked at request time.
- Any other cell, including totals that roll up across a time field, carries `notSummable` and reads "Not summed across {time field labels}".
- `average`, `minimum` and `maximum` of a semi-additive measure are allowed anywhere and labelled as such ("Average closing net").
- **Example (A0).** In a Summary of `period_net:sum` and `closing_net:sum` by GL account, filtered to one fiscal year and grouped by period number:
  - the period cells show both measures;
  - the account's row total shows `period_net` and "Not summed across Fiscal period" for `closing_net`.

### 8.3 Currency (no conversion in this design)

- A money aggregate over more than one currency in a cell carries `mixedCurrency` ("Mixed currencies"), the existing A2 rule, counted per cell and total in the same statement. Grouping or pivoting by the currency field resolves it.
- A declared evaluation amount (Matrix section 8) is single-currency by declaration and aggregates freely.
- **FX conversion to a report currency is out of scope.** It is a governed business rule about which rate applies on which date, and it needs its own approved design with the FX snapshot model (`sourcing_event_demand.evaluation_amount`, `evaluation_currency_code`, `fx_rate_snapshot`).

## 9. Disclosure rules

### 9.1 Masked and unreadable fields

A field the viewer cannot read unmasked is neither a dimension nor a measure for that viewer (section 5.3). An aggregate of a masked field would reveal what masking hides.

### 9.2 Record authorization

- Every aggregate is computed over the list's full SQL conditions: tenant, scope, stored predicates, explicit denies, filters and search.
- When per-record authorization is not covered by that SQL (`aggregateAuthorizationCovered` is false), the Summary uses the path today's group aggregates already use: `executeAuthorizedAggregate`.
  - It enumerates the matching IDs and authorizes each one.
  - The `GROUPING SETS` statement then aggregates over exactly that authorized ID set.
  - Past its 5-second budget it fails closed with 503 `ENTITY_AGGREGATE_AUTHORIZATION_UNAVAILABLE`.

  A total over the wrong set is never computed, either way.
- **Why not refuse, as Tree and Matrix do.** Their computations (child existence, orphans, rank partitions) run in SQL shapes that the ID set does not restrict. A grouped aggregate is exactly the shape the ID restriction was built for, and refusing would make the Summary stricter than the Table's own group counts on the same list.
- **A1 acceptance:** the repository applies the ID restriction to every grouping set and to the column-value query. A real-PostgreSQL test checks this with an authorizer that denies some records.
- **Cost is stated, not hidden.** On a large fact with uncovered record authorization, every Summary request enumerates the set, and a set too large for the budget returns the 503 with a retry. A3's performance budget measures this case if A3's fact has such authorization.

### 9.3 `minimumGroupSize` is a floor, not a guarantee

- When a measure declares `minimumGroupSize`, any cell or total of that measure over fewer records carries `suppressed` ("Too few records").
- `count` itself is not suppressed.
- **What it does:** it stops the single-record case, for example an average salary over one person, which is that person's salary.
- **What it does not do:** with totals and sibling cells present, a suppressed value can sometimes be recovered by differencing. It is a declared floor that avoids the single-record case, not a disclosure-control guarantee. Real disclosure control is a separate design if a tenant needs it.

## 10. Fact backing: views and the `insight` projection

### 10.1 Live views (A0, A3)

- A fact Entity is a read-only Entity whose storage is a `security_invoker, security_barrier` view in the owning domain's schema. RLS on the base tables therefore applies to the viewer.
- The view carries readable references, not labels. Labels come from the referenced Entities through the existing reference hydration.
- Proving that the Entity Framework can onboard, publish, authorize and list a view-backed Entity end to end is A0's first acceptance criterion. Today no onboarded Entity is view-backed.

### 10.2 The `insight` projection (A4; built only if A3's evidence requires it)

- **When.** A fact gets a projection table when A3 shows a live view cannot meet the performance budget, or when its source is polymorphic or JSON-shaped and has to be resolved into typed columns and readable labels. Approval assignment would be such a source, once its typed row exists.
- **Where.** The `insight` schema in the Neon database (`server/db/ddl/planes/neon/insight/`, standard file numbering). Not a second engine, cluster or database.
- **Ownership.** The framework provides the projector runtime: watermark, idempotency, rebuild, freshness. What a fact contains is business logic. It lives in the owning domain package and is registered by capability contract through host composition (AGENTS.md, Domain ownership).
- **Backfill and increments.**
  - The first load and every rebuild read the **source tables**.
  - Only increments read `event.outbox`, idempotent per (`aggregate_id`, `event_version`).
  - The outbox's delivery state is never the projector's progress.
- **Watermark.** `insight` keeps its own watermark **per fact**, published as the Entity's `asOf` and shown as "As of {time}" in the Summary chrome. Two facts lag differently, so there is no global watermark.
- **Retention and rebuild.** A projection holds no history its source no longer holds. Retention follows the source. A per-tenant rebuild replaces that tenant's rows in one transaction. A projection that falls behind its freshness bound shows its `asOf` in a warning rather than hiding the lag.

### 10.3 Row-level security on `insight` tables

- Each table is created with the schema's `FOREACH` RLS template: `ENABLE` and `FORCE ROW LEVEL SECURITY`, and `tenant_access` using `shared.current_tenant_id_soft()` and `shared.current_tenant_id()`.
- There is **no `seed_write` policy**. Writes are granted to the projector role only, and viewers get `SELECT`.
- A real-PostgreSQL gate, `insight-rls.postgres.test.ts`, asserts for every relation in `insight`:
  - `relrowsecurity` and `relforcerowsecurity`;
  - exactly the template's `tenant_access` policy text;
  - no permissive `true` policy;
  - grants limited to the projector (write) and reader (read) roles.
- A new table that misses the template fails the gate, so the projection cannot become the weakest link in tenant isolation.

## 11. Views and interaction

1. **Chrome.** Mode label "Summary". A dimension bar: "Rows: GL account › Fiscal period", "Columns: Currency" (A2), "Measures: Period net (sum), Closing net (sum)". Each opens a picker of the declared choices. "As of …" appears for projected facts.
2. **Grid.**
   - Sticky first column: the group's readable label, indented by level, with an expand control.
   - Sticky header: the column values (A2) and "Total".
   - The first row is the grand total.
   - Each cell shows its measures, in declared order.
3. **Drill-down.**
   - Choosing a cell or a group's count switches to Table with filters for every ancestor value, the group's value and the column value.
   - A date bucket becomes its half-open range through the existing date operators. A "No value" group becomes `is_null`.
   - The browser's back action returns to the Summary with its state.
   - Drill-down uses the list's own filters, so it shows exactly the records the cell counted. The exception is a revision change between the two, which the Table's own count shows.
4. **Display options.** The measures picker (at most 5 at once), and a "Show empty" toggle that is off by default. Rows and columns with no records are not drawn.
5. **Export.** The existing data export exports the underlying records under the same filters. Exporting the summary grid itself is out of scope for this revision.
6. **Narrow screens.** One group per row as a list. With a column dimension, a group's columns become a labelled list inside it. Totals stay visible.
7. **Renderer traits** (foundation section 7): `adaptsWhenNarrow`, `ownPaging`, `ownGrouping` and `ownCounts` are all true.
8. **Record sections.** Allowed in a record-section host under foundation section 8, with the section's locked scope. Off in record pickers.

## 12. Accessibility

- The shared tree-grid renderer (Tree P-T1): ARIA `treegrid` with `aria-level`, `aria-expanded`, `aria-setsize`, `aria-posinset`, and column headers `th scope="col"`.
- A screen reader announces, for example: "Office supplies, level 2, expanded, Period net 12,450.00 SAR, Closing net not summed across fiscal period".
- Every cell state is text. Colour only supports it.
- Expand controls say what they load ("Show fiscal periods under Office supplies").

## 13. Chart (A5, contract sketch)

Recorded so that A1–A2 do not paint the chart into a corner. Its contract is proposed in a later revision and approved separately.

- **Same data.** A chart is a view of the Summary's own response, with no new request and no new aggregate. The toggle "Table | Chart" sits inside the Summary, and the table remains each chart's accessible equivalent.
- **Chart types:**
  - column and bar for one dimension;
  - line for an ordered dimension (a date bucket, or a choice or number dimension with a declared order);
  - grouped and stacked column for a row dimension with the column dimension;
  - pie or donut only for at most 5 slices of an additive, non-negative `sum` or `count` with no truncation.
- **Not offered:** area, "Combination" and 3-D.
- **Honest charts.** A truncated level or column dimension shows the truncation notice under the chart. A `notSummable`, `mixedCurrency` or `suppressed` cell is not plotted, and is listed under the chart.
- **Out of scope:** "Add to Dashboard". A dashboard is a different surface and needs its own owner instruction.

## 14. Decisions required (project owner)

Already approved (status block): the direction, the backing (views, then `insight` only on evidence), phase order, no FX, `minimumGroupSize` as a floor, Approval assignment blocked, Chart at A5, Dashboard out of scope.

Decisions for approval:

1. **The declaration** in sections 5.1, 5.3–5.6: dimensions, measures with `count` and `countDistinct`, defaults, request parameters and response.
2. **Loading model: one request per expansion, with `GROUPING SETS` per request** (section 7.1), as Tree loads grouped levels. This replaces the earlier wording "a multi-level GROUP BY, with `ENTITY_LIST_MAX_GROUP_LEVELS` enforced by the server". Section 3 shows that the single `group` per request is Tree's approved design, not drift. Under this model the server bounds every request, and the level constant bounds saved state.
3. **Bounds:** 50 groups per response (inherited), 12 column values, 5 measures per request, with truncation always stated and no "Other" bucket (section 7.2).
4. **No bucket-unit change.** Both sides already agree on `month | quarter` (section 3). This withdraws the A1 prerequisite "narrow the contract's grouping vocabulary".
5. **Additivity as a field property** (section 5.2), stored on the field in Studio (section 15). It includes `timeFields` as a list, because the A0 view exposes fiscal year and period number rather than one fiscal-period reference.
6. **A1 runs on fixtures in parallel with A0.** This is the same pattern as Board, Calendar, Gantt, Tree and Matrix: the runtime is proven on fixtures, and the real Entity waits for the metadata cleanup and for its dimension Entities (section 17).
7. **Record authorization not covered in SQL uses the existing authorized-aggregate path, not a refusal** (section 9.2; revision 2). This replaces revision 1's `LIST_AGGREGATE_RECORD_AUTHORIZATION_UNSUPPORTED`.

Audit round 3 recommended approving decisions 1–6 unchanged. Decision 7 and the checked response bound in decision 3 come from verifying that audit's two notes (section 19).

## 15. Studio authoring and registration inventory

The surface's Summary editor sets dimensions (with buckets and the column flag), measures (with aggregates and `minimumGroupSize`) and defaults. The Fields grid sets additivity. Proposed tables and columns, subject to the Entity Studio blueprint's rules (typed columns, no blobs in `entity_surface.layout_config`):

- `entity_surface_aggregate`: one per list surface. Default column dimension.
- `entity_surface_aggregate_dimension`: field, order, `bucket_month`, `bucket_quarter`, `column_eligible`, default row level (1–3 or none).
- `entity_surface_aggregate_measure`: field (null for the record count), order, allowed aggregates as typed boolean columns, `minimum_group_size`, default flag.
- `entity_field.aggregate_additivity` (`additive | semi_additive | non_additive`, null meaning not summable). `entity_field_additivity_time_field` rows (field, time field, order) for semi-additive fields.
- **View-backed storage.** A0 determines whether the Entity's existing storage binding already admits a view. If a typed relation kind is needed, it is added to the owning metadata table under Entity Studio section 2, not inferred from a name prefix.

The registration inventory follows the same nine steps as Calendar section 10. It is built after the metadata cleanup.

## 16. Folder structure and test registration

| Path | Content |
| --- | --- |
| `packages/contracts/platform/entity-list/src/aggregate.ts` | Browser contract, parser, URL keys, `LIST_AGGREGATE_MAX_COLUMNS` |
| `packages/platform/entity/runtime/list-view/src/aggregate/` | Summary grid on the shared tree renderer, pickers, drill-down |
| `server/packages/platform/metadata/src/list-aggregate-descriptor.ts` (+ test) | Published parsing and section 6 validation, additivity |
| `server/packages/services/records/src/list-aggregate.ts` (+ test) | Per-viewer projection and request admission |
| `server/packages/services/records/src/kysely-record-repository.ts` | `groupBuckets` extended with `GROUPING SETS`, pivot, `countDistinct`, cell states (+ a real-PostgreSQL test) |
| `tests/foundation/entity-list-aggregate.test.tsx`, `tests/foundation-browser/entity-list-aggregate.spec.ts` | Model, panel and browser tests |
| A4: `server/db/ddl/planes/neon/insight/`, a projector runtime package, `insight-rls.postgres.test.ts` | Projection storage, runtime and RLS gate. The new package gets its row in `docs/architecture/package-ownership-matrix.json` |

Foundation section 9's policy gates run before each commit.

## 17. Delivery phases and acceptance

| Phase | Delivers | Prerequisites |
| --- | --- | --- |
| **A0** | View-backed read-only Entity onboarding proven end to end on `ledger.v_trial_balance`: published, authorized, listed in Table, reference dimensions resolving to readable labels | Metadata cleanup. Company code, ledger book and GL account Entities onboarded (cost centre, profit centre and project join as they are onboarded; until then those dimensions stay unpublished). A decision on fiscal period: keep year and number as dimensions, or add a fiscal-period reference to the view through a forward migration |
| **A1** | Summary mode: rows at up to 3 levels with one request per expansion, `GROUPING SETS` totals, `count` and `countDistinct`, additivity and `notSummable`, currency states, `minimumGroupSize`, masked-field projection and the authorized-aggregate path (section 9.2), `LIST_AGGREGATE_MAX_CELLS` with its contract test, revision notice, drill-down to Table, saved and URL state, narrow layout, accessibility | Section 14 approved. On fixtures first; on A0's Entity once A0 lands |
| **A3** | `purchase_invoice_line` at OLTP volume through a header-and-line view (supplier and posting date from the header). A performance budget measured on representative volume, with index findings | A1. The business partner, item and commodity category Entities for readable dimensions |
| **A2** | Column dimension: `pivot`, `pivotValues`, column totals, `columnsTruncated` | A1; proven at volume after A3 |
| **A4** | `insight` schema, projector runtime, per-fact watermark and "As of", rebuild from source, RLS gate | Only if A3's evidence shows a live view cannot meet the budget, or a polymorphic or JSON source needs it |
| **A5** | Chart (section 13), after its contract is approved | A2 |
| — | Approval assignment fact | Owner instruction on a typed per-approver workflow row (AGENTS.md: this work does not authorize workflow/case execution) |
| — | FX report currency; Dashboard; summary-grid export | Separate approvals |

**Acceptance for every phase:**
- unit and real-PostgreSQL tests for each new repository path;
- a browser spec registered beside the Matrix spec;
- the request-cost attribute checked;
- foundation section 9's gates clean.

The status block distinguishes what is built, published and verified at runtime.

## 18. Rejected and out-of-scope options

| Option | Why not |
| --- | --- |
| A separate analytics database (warehouse, ClickHouse) | It would re-implement tenant isolation, record scope, masking, explicit denies and published permissions in a second engine, and add ETL lag. It is a parallel authorization path (AGENTS.md). Reconsider only on measured evidence (roughly 50–100M rows per tenant per fact), and even then behind the same repository port and metadata |
| GraphQL | It is an API shape, not storage or aggregation. It would be a second API stack beside the list operation, and open-ended nesting breaks the bounded request budget |
| A report-builder page or wizard | Bespoke screens are forbidden. Studio authors the fact; a saved view is the report |
| A separate aggregate endpoint | A parallel read path with its own scope and masking handling; the same objection, one step smaller |
| One multi-level aggregate request | Unbounded, or truncated arbitrarily; section 7.1 |
| An "Other" column or group summed from the remainder | A truncated pivot must say so. Totals already cover every record |
| Totals summed from loaded cells or group rows | Wrong for averages and distinct counts, and wrong whenever a level is truncated |
| Inferring additivity, or treating every number as additive | Sums balances across periods into a wrong number that looks right |
| Currency conversion in the browser or in phase 1 | A governed rate rule; separate design |
| Reading history from `event.outbox` | It holds no history from before the projector; backfill reads the source tables |
| Approval assignment as a phase of this work | Needs workflow DDL outside this workstream's authority |

## 19. Review disposition

| Review | Finding | Disposition |
| --- | --- | --- |
| Owner's screenshots (10 October 2026) | Fact, measures, row/column/page fields, Detail and Aggregate views, Chart tab, "last updated" | Fact Entities (section 10); Summary mode (sections 5–11); Detail is Table through drill-down; Chart at A5 (section 13); "last updated" only for projected facts, per fact (section 10.2) |
| Audit round 1 | Table counts wrong | Corrected: Neon plane files hold `document` 133, `master` 116, `ledger` 16 tables. Counts are not used as evidence here |
| Audit round 1 | Cite `groupBuckets`, not line numbers | Adopted throughout |
| Audit round 1 | Outbox is delivery state and cannot backfill | Adopted: section 10.2 |
| Audit round 1 | Aggregate is parameters on the existing list operation | Adopted: principle 3, section 5.4 |
| Audit round 1 | Server must enforce `ENTITY_LIST_MAX_GROUP_LEVELS` | **Corrected by verification:** the server receives one `group` per request by Tree's approved per-level design, so there is no drift to fix. The Summary adopts that design. Each request is bounded by the server, and the level constant bounds saved state (section 7.1; decision 2) |
| Audit round 1 | Per-level cap with `groupsTruncated`, also for the column dimension | Adopted: section 7.2 |
| Audit round 1 | Charts not in phase 1 | Adopted: A5 |
| Audit round 1 | Say why Aggregate is not Matrix | Adopted: section 4 |
| Audit round 1 | Derived, not hand-written, RLS on projections | Adopted as template plus real-PostgreSQL gate, without `seed_write` (section 10.3); no derivation mechanism exists to name |
| Audit round 1 | Retention, and a per-fact watermark | Adopted: section 10.2 |
| Audit round 1 | No FX in phase 1 | Adopted: section 8.3 |
| Audit round 1 | `purchase_invoice_line` carries supplier × company × item × commodity | **Corrected by verification:** supplier and posting date are on `purchase_invoice`. A3's fact is a header-and-line view |
| Audit round 2 | Workflow columns are `entity_type`/`entity_id` text; `target_entity_id` is `entity_case`'s | Adopted: section 3 |
| Audit round 2 | Fiscal period is a dimension, not a calendar bucket | Adopted: sections 3, 8.2, 17 |
| Audit round 2 | Contract/server bucket-unit drift; narrow the contract in A1 | **Withdrawn by verification.** The `week \| month \| quarter \| year` union is the relative-date filter type. Grouping is `month \| quarter` in contract, browser and server alike. The claim originated in this blueprint's author's review and both reviews accepted it (section 3; decision 4) |
| Audit round 2 | No two-year relative range | Adopted: section 3 |
| Audit round 2 | View-backed onboarding unproven; UUID dimensions need onboarded references | Adopted: A0 acceptance, section 10.1. Added: no finance dimension Entity is onboarded yet |
| Audit round 2 | Additivity, `GROUPING SETS` totals, count vs count distinct, disclosure rules | Adopted: sections 8 and 9 |
| Audit round 2 | Approval assignment is outside this workstream | Adopted: section 17 |
| Audit round 2 | Order A3 before A2 | Adopted: section 17 |
| Audit round 2 | `minimumGroupSize` is a floor, not a guarantee | Adopted: section 9.3 |
| Audit round 3 | Confirms the three revision-1 corrections (no bucket-unit drift; the single `group` per request is Tree's design; supplier and posting date are on the invoice header) and A0's cost | Recorded; no change |
| Audit round 3 | Recommends approving decisions 1–6 unchanged | Recorded in section 14. Approval remains the owner's |
| Audit round 3, note 1 | Name the request limit: about 65 rows against `MAX_LIST_PAGE_SIZE` (100), with about 35 rows of headroom | **Adopted in intent, corrected in substance.** A `groupsOnly` request reads no record page, so `limit` and `MAX_LIST_PAGE_SIZE` do not bound it. Rows and columns multiply rather than add, and the real bound is about 3,510 measure values. Stated as `LIST_AGGREGATE_MAX_CELLS` with a contract test over the caps (section 7.2), the conversion the audit asked for |
| Audit round 3, note 2 | A1 should discover how A2 group counts behave when per-record authorization is not expressible in SQL; A2 may need the refusal | **Answered from the code now, with the opposite finding.** A2 does not refuse, and needs no refusal: `executeAuthorizedAggregate` aggregates over an authorized ID set and fails closed with 503 past its budget. Revision 1's proposed refusal is withdrawn, and the Summary inherits this path (section 9.2; decision 7). What remains for A1 is a test that the ID restriction reaches every grouping set |
| Audit round 3 | Add an AGENTS.md entry carrying the operation rule and the additivity/base-rows rule | Adopted: "Entity list Aggregate (Summary)" in AGENTS.md, marked proposed. It names the shared list operation rather than `records.list`: the shared list calls `entityList.list`, and both use the same query service |
| Audit round 3 | Committing the documents as proposed is safe | Recorded. Committing is the owner's call |
