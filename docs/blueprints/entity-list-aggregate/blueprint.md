# Entity list Aggregate (Summary) — blueprint

**Status:** approved, revision 10 (10 October 2026).
- **A5.3 built (10 October 2026), on synthetic fixtures:** "go ahead with Next: A5.3". Summary has its Table | Chart toggle, its chart adapter and decision 14's published choice order. Section 13.9 records the build. No real Entity uses Summary yet, because A0 and A3 wait for the metadata cleanup.
- **The shared chart moved to its own blueprint (10 October 2026).** On the owner's instruction ("go ahead"), the reusable chart moved verbatim to the [Chart blueprint](../chart/blueprint.md) in a move-only commit (`6d9510f29`). That covers its data contract, component, colour tokens, "Others" rule and other consumers, with decisions 9, 10, 11, 13 and 15. This document keeps how Summary uses it: 13.6, A5.3, decisions 12 and 14, and A6. **Coupled:** a change to the chart contract that Summary relies on updates both documents together.
- **Decision 15 amended, A5 approved as amended (10 October 2026).** After audit round 10, the owner approved the contract with decision 15 in its separated form, in these words: "Approved". The category axis of a categorical dimension mirrors with the document direction. A time axis stays earliest on the left in every locale. Labels are localized and bidi-correct either way (13.3). Revision 8 also links each unavailable-type reason to its message (13.3) and states A6's inherited authorization constraint (section 17).
- **A5 contract approved (10 October 2026).** The owner approved section 14 decisions 9–15 in these words: "Decisions (section 14, 9–15): Approved". Section 13 is the approved A5 contract. No build instruction for A5 is recorded yet; when one is given, A5.1 (chart colour tokens) comes first (13.8). **Update (10 October 2026):** A5.1 and A5.2 are built and recorded in the [Chart blueprint](../chart/blueprint.md) (13.4a.6–13.4a.13). A5.3, Summary's adapter and its use of the chart, is not started and needs its own instruction.
- **Delivery (10 October 2026): A2 built, on synthetic fixtures, before A3.** Section 5.9 records the build, including the measured response size and statement time A2's acceptance asks for. A3 remains the gate before any real Entity publishes a pivot. Still not verified: a real Entity, and the server's real responses in a browser.
- **Revision 6 (10 October 2026): A5 contract proposed.** Section 13 now holds the A5 contract for review: a reusable chart in three layers, and Summary's use of it. Decisions 9–15 in section 14 ask for approval. Nothing in section 13 is approved or built. The 5.9 build record now names the test that refutes the rejected source restriction.
- **A2 before A3 approved (10 October 2026).** The owner approved building A2 on fixtures ahead of A3, whose prerequisites (the metadata cleanup and the business partner, item and commodity Entities) are no design dependency of A2. The approved order existed to prove the pivot at volume before it ships, which is about what may ship, not what may be built. Four conditions, recorded in section 17 (the fourth added by audit round 8):
  - A3 stays the gate before any real Entity publishes a pivot;
  - A2 carries a real-PostgreSQL test of its own SQL path;
  - A2's acceptance measures the pivot's response size against `LIST_AGGREGATE_MAX_CELLS`, and the statement's cost;
  - A3 measures the service path the pilot Entity actually takes: the authorized-aggregate path (2,000-record capacity) or SQL-covered authorization. A3 states its budget as a go/no-go number that decides A4. The number itself is for the owner to set; the audit suggested "above 500 ms at the expected fact size, A4 is required".
- **Coupled with the Tree blueprint.** Since decision 8, one server rule (`applyAggregateRules`) governs every grouped total, in Summary and in grouped Table. A change to additivity updates this document and the [Entity list Tree blueprint](../entity-list-tree/blueprint.md) together.
- **Decision 8 approved and built (10 October 2026).** The owner approved applying additivity to grouped Table's sums: "decision 8 approved". It is built as its own change before A2 (section 5.8).
- **Build authority (10 October 2026).** After section 14 was approved, the owner gave the build instruction: "go ahead". Under decision 6, that authorizes A1 on synthetic fixtures. A0 still waits for the metadata cleanup and its dimension Entities.
- **Delivery (10 October 2026): A1 built, on synthetic fixtures.** Section 5.7 records what the build decided. What is verified and what is not:
  - **Verified by tests:**
    - publication parsing and the section 6 codes, and field additivity (`list-aggregate-descriptor.test.ts`, 6 tests);
    - per-viewer projection, admission, totals from base rows, the semi-additive rule and the floor, end to end on the in-memory repository (`list-aggregate.test.ts`, 9 tests);
    - `GROUPING SETS` totals, distinct counts, mixed currencies, the zoned date bucket and the authorized ID set restricting groups and total alike, on real PostgreSQL 16 temporary tables (`aggregate-summary.postgres.test.ts`, 4 tests). These are not the Neon DDL;
    - the browser contract, the checked response bound and URL state (`entity-list-aggregate-contract.test.ts`, 6 tests);
    - the model and a rendered Summary with a fake client (`entity-list-aggregate.test.tsx`, 9 tests).
  - **Verified in a real browser:** `tests/foundation-browser/entity-list-aggregate.spec.ts`, 5 tests, registered in `test:country-browser` beside the Matrix spec. It runs the real list runtime and Neon CSS against a fixture that plays the server's part. It checks:
    - one Summary request on opening (`data-aggregate-requests` = 1), with the list's own page query at a limit of one;
    - the total row first, withheld values as text, and no identifier on the page;
    - expansion with the ancestor's value, and the tree-grid keyboard model;
    - drill-down to Table and Back;
    - the pickers and the URL;
    - the phone layout with no horizontal scroll.
  - **Not verified:** a real Entity (none publishes a Summary until A0), and the server's real responses in a browser. The fixture plays the server.
- **Section 14 approved (10 October 2026).** The project owner approved decisions 1–7 in these words: "approved decisions 1–7 with the five already-checked decisions unchanged and decision 7 adopted as written". The owner added one recorded precondition, which changes no decision. The owner said nothing in section 5 is to be built until it is in this status block. It is:
  - **Precondition: fact size under uncovered record authorization.** When a list's per-record authorization is not covered by its SQL scope (`aggregateAuthorizationCovered` is false), `executeAuthorizedAggregate` pages through the whole matching set 100 IDs at a time and authorizes every ID under one 5-second deadline. Its cost is linear in the matching set, and past the deadline it returns 503 rather than a total. A fact is therefore aggregate-eligible at volume only when its list's record authorization is SQL-covered; otherwise the authorized-aggregate path bounds the fact's size. A0 and A3 each check this for their fact before they are called done.
  - **Correction found at the A1 build (revision 4):** the bound is also a hard capacity. The same function refuses a matching set larger than 2,000 records with 503 `ENTITY_AGGREGATE_CAPACITY`, whatever the deadline. Under uncovered record authorization, a fact is therefore limited to 2,000 matching records per Summary request. The precondition's conclusion is unchanged, and stricter.
- **Revision 3** records that approval and the precondition (here, in section 9.2 and in A0's and A3's acceptance). Revision 2 was committed first as proposed (`a1b518a5f`), so the approval is a separate, auditable step, as Compare did at revision 2.
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
- **Two approved conditions were corrected by revision 1.** Section 3 verified both against the code, and audit round 3 confirmed the corrections. Section 19 records the disposition, and section 14's approval confirmed them:
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
13. Chart: Summary's use of the shared chart (A5.3)
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

### 5.7 Build record (A1, 10 October 2026)

What the build decided inside the approved contract, so a reviewer can check each point against the code.

1. **The response extends the list response, rather than adding an `aggregate` object.**
   - Section 5.5's content travels in the shape grouped Table already parses. Each group gains `states` (aggregate key → `notSummable` or `suppressed`). The result gains `parentGroup`, the total over every group of the request.
   - **Additions to the shared group result are expected to be rare and named.** Every layout that groups reads this one shape. A new per-group attribute needs a named owner in its blueprint and a parser entry, so the shape does not become the union of several layouts' concerns.
   - There is no `revision` digest. A digest of one level's set cannot be compared with another level's, so section 7.4 is implemented by comparing an expansion's `parentGroup` with the row already drawn (`sameTotals`). A difference shows the refresh notice.
   - `asOf` arrives with A4.
2. **Request.**
   - `totals=true` on the list operation (`entityList.list` and `records.list`) is valid only with `groupsOnly`; otherwise 400 `LIST_AGGREGATE_INVALID`.
   - `countDistinct` is accepted only on a Summary request; otherwise `LIST_GROUP_AGGREGATE_INVALID`.
   - The record count is every group's own `count`, so it is never sent as an aggregate.
3. **Admission order** (`admitAggregateRequest`, `list-aggregate.ts`).
   - The list's own grouping rules run first. An ungroupable field is `GROUP_FIELD_NOT_ALLOWED`; a date without a bucket is `LIST_GROUP_INVALID`.
   - Then the declaration: an undeclared dimension, bucket or measure is `LIST_AGGREGATE_INVALID`; an unreadable or masked one is `LIST_AGGREGATE_DIMENSION_UNAVAILABLE` or `LIST_AGGREGATE_MEASURE_UNAVAILABLE`; no exact counts is `LIST_AGGREGATE_COUNTS_UNAVAILABLE`.
   - A sum on a field whose additivity is undeclared or non-additive is refused again at request time, in case a descriptor slipped past publication.
4. **Withheld values are removed on the server.** `applyAggregateRules` runs in the query service before the response projection. It deletes the value, its currency and its mixed or unknown marker, and records the state, so a withheld number never leaves the server.
5. **What pins a time field.** An `eq` or `is_null` filter pins it; ancestor levels arrive as these. So does the request's group by value; a date bucket never does. A locked record scope on the time field is not yet read as a pin, so such cells show "Not summed across …". That fails safe.
6. **The floor** applies to every aggregate of its measure. The record count is never suppressed.
7. **SQL.** Only a Summary request uses the `GROUPING SETS` statement, with the key computed once in a subquery so `GROUPING()` names the grouped expression even with a bound time zone. A grouped request without `totals` takes the single-level statement, unchanged. The anchor is the source-string assertions in `server/packages/services/records/src/kysely-record-repository.test.ts` (the A3 quarter-bucket test, which asserts `sum("amount") AS "__aggregate_0"` and the currency columns on the plain statement), together with `list-group-aggregates.test.ts` for grouped Table's results.
8. **Rows and labels.**
   - Every bucket is a row, in server order with No value last. Nothing is folded into Unmapped values, because a reference dimension has no published choice list.
   - Labels come from the server's authorized label service. A choice value uses its published choice label, and a bucket is formatted as a month or quarter.
9. **No identifier on the page, even in an attribute.** Rows are keyed by position (`/1/2`), never by value. The jsdom test found the first draft putting filter values, record IDs among them, into `data-tree-key`.
10. **Accessibility.** The grid is a `treegrid` driven by the shared tree keyboard model (`handleTreeKeyDown`):
    - rows carry `aria-level`, `aria-setsize`, `aria-posinset` and, when expandable, `aria-expanded`;
    - Enter drills down through `data-tree-open`;
    - the Total row stays outside the roving focus and keeps its own tabbable drill-down button.
11. **Drill-down** switches to Table, or to Cards when the surface offers no Table, with the row's filters added. It pushes history, so Back returns to the Summary. A surface offering neither shows no drill-down.
12. **Pickers.**
    - Three `ChoiceSelect` controls for the row levels. Levels 2 and 3 offer None, and a field is offered once.
    - One design-system `Checkbox` per measure, at most five, kept in declared order.
13. **Not built in A1:**
    - the location key `aggregate.open` (section 5.6). Expansions reset whenever the levels, measures or filters change;
    - the column dimension (A2);
    - Studio authoring (section 15, after the cleanup). `field.list.additivity` is parsed from published metadata, and its Studio column is not yet built.
14. **Left as found at A1, then decision 8.** Grouped Table's own A2 sums followed `field.list.aggregations` and ignored additivity, so on a fact with a semi-additive balance "Closing net total" in grouped Table was a wrong number while Summary withheld it. The A1 build did not change behaviour approved under the Tree blueprint; the owner then approved decision 8, built as section 5.8.
15. **Test runs outside this work, at the build.**
    - `tree.postgres.test.ts` was run here against the provisioned `athyper_neon` database as its owner: 18 pass, and one fails. The failure is the move test's foreign-key error-shape assertion, which this work does not touch; it was not investigated.
    - The Matrix PostgreSQL test's typecheck error (`ids.bids.indexOf`, a typed-UUID array) was fixed with the A1 commit.
    - Four foundation files fail: two reference provisioning files removed by other sessions' commits, and two are Atlas tests.

### 5.8 Build record (decision 8, 10 October 2026)

Grouped Table's sums now follow additivity, with the Summary's rule and words.

1. **Undeclared stays additive.** A field without `field.list.additivity` is untouched: its grouped totals are exactly what they were. An explicit test pins this (`list-aggregate.test.ts`, "leaves a field that declares no additivity exactly as it was"). No real Entity declares additivity yet, so no published number changes.
2. **One server rule.** `admitAggregateRequest` adds a grouped Table request's sums of semi-additive fields to the plan, and the same `applyAggregateRules` withholds them before the response. Floors stay a Summary declaration.
3. **A safe cell is still a number.** A sum is withheld only when a time field is neither the request's group by value nor pinned by an `eq` or `is_null` filter. Grouped by the period, each period's balance is summed; tests check this on the server and in the browser.
4. **One wording.** The list descriptor publishes `sumWithin` (the time fields, with their labels) on a semi-additive field that offers a sum. Grouped Table renders a withheld total with the Summary's own message, `list.aggregate.notSummable`.
5. **Unmapped values.**
   - Grouped Table's Unmapped values heading combines several buckets in the browser. A value withheld in any bucket stays withheld.
   - A semi-additive sum whose time field is the level's own field is withheld when buckets combine, because the combination crosses values of that field (`combineAggregates`, `sumsAcross`).
6. **Publication.** A field declared `nonAdditive` may not offer `sum` in `field.list.aggregations` (`AGGREGATE_SUM_NON_ADDITIVE`).
7. **Verified:**
   - the server end to end on the in-memory repository: 4 tests, including a grouped page that also returns rows;
   - the publication check;
   - the browser model;
   - the browser contract;
   - a real-browser test in the Summary spec with grouped Table over the same fixture.

### 5.9 Build record (A2, 10 October 2026)

The column dimension, built on fixtures ahead of A3 under the owner's approval and its three conditions.

1. **Request.** `pivot` (a declared column entry: `field` or `field:month|quarter`) is valid only with `totals`. An expansion repeats the opening's columns as `pivotValue`, at most 12, each a JSON scalar or `null` for the No value column.
   - Refused with `LIST_AGGREGATE_INVALID`: a column not declared `column`, a bucket the declaration does not offer, or the row level's own field.
   - A masked or unreadable column is refused with `LIST_AGGREGATE_DIMENSION_UNAVAILABLE`.
   - A datetime column needs a valid viewer time zone.
2. **Response.** It extends the shared group result as section 5.7 point 1 allows, with this blueprint as the named owner:
   - `pivotColumns` (value and label, in order) and `pivotColumnsTruncated`;
   - `cells` on every group and on `parentGroup`, aligned with `pivotColumns`, `null` where a group has no records in a column. The parent's cells are the column totals.
   - Column values travel as text, because the statement compares them as text. A boolean column's value is restored to a boolean in the response.
3. **The statement** (`pivotBuckets`). One statement with `GROUPING SETS ((row, column), (row), (column), ())` over a CTE of the filtered records.
   - Rows keep 50 values plus No value, as A1 does.
   - Columns are the expansion's kept values, or the first 12 in order with No value last. No value counts within the 12, so the section 7.2 bound (12 columns plus the total) holds.
   - **Rows and columns treat No value differently, by design.** On rows, No value sorts first so the cap never drops it, and it is drawn beside the 50. On columns, No value is the last of the 12. When there are more than 11 values and a No value, it is No value that is pushed out, and the truncation notice says columns were cut.
   - A `HAVING` keeps only the shown rows' and columns' cells and column totals. Row totals and the total still cover every record.
4. **Cell rules.** `applyAggregateRules` treats each total by what groups it:
   - a cell is grouped by its row and its column;
   - a row total by its row;
   - a column total by its column;
   - the parent by neither.

   So a balance sums within one period's column, and is withheld in a row total that crosses periods. Floors apply to every cell.
5. **Browser.**
   - A Columns picker offers the declared columns not used by a row level, and None. The saved state carries `column` ("" for none) and the URL carries `aggregate.column`.
   - The grid has two header rows: each column's label over its measures (`scope="colgroup"`), then the Total group.
   - Each column cell's first measure drills down with the row's and the column's filters.
   - On narrow screens, each group lists a block per column, then the Total block.
6. **Condition: a real-PostgreSQL test of A2's own SQL** (`aggregate-summary.postgres.test.ts`, 4 new tests). It covers:
   - cells, row totals, column totals and the total in one statement, with No value last among the columns;
   - kept columns in their order, a missing one as no cell, and an authorized ID set restricting cells and totals alike;
   - a zoned date bucket as the column;
   - the caps.
7. **Condition: the response size and the statement's cost.**
   - At the caps (60 accounts × 20 periods, five measures), the response held 50 rows × 12 columns × 5 measures: **3,315 measure values**, under `LIST_AGGREGATE_MAX_CELLS` (3,600). The test asserts both figures.
   - **First measurement: 114.6 ms** over 1,205 records. The plan (`EXPLAIN ANALYZE`) showed the cause. The `GROUPING SETS` aggregation over the whole fact took about 1–2 ms. About 105 ms went to a correlated `EXISTS` against the column list: it re-ran that list's sort and limit once per grouped row (`loops=1040`).
   - **Fix (revision 5):** the source, rows and columns CTEs are `MATERIALIZED`, and the column test is a hashed `IN` with an uncorrelated check for the No value column. **Re-measured: 5.3 ms** in three runs, with the same 3,315 values. The test now fails above 50 ms.
   - **Not adopted: restricting the source to the shown rows and columns.** The audit proposed it, but row totals must include records in columns not shown, column totals records in rows not shown, and the total every record. Restricting the source would make all three wrong. The aggregation over the whole fact was not the cost.
   - **The test that refutes it:** the caps test asserts `expect(result.parentGroup?.count).toBe(1200)`, that the total covers every record while only 50 rows and 12 columns are shown. A source restricted to the shown rows and columns fails that assertion, so the rejected change cannot land unnoticed.
8. **Not built:** column paging (more than 12 values are filtered, never paged, as section 7.2 says), the location key `aggregate.open`, and Studio authoring.

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
| `ENTITY_AGGREGATE_CAPACITY` (request, existing, 503) | The same path found more than 2,000 matching records (status block, correction) |

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
  - Past its 5-second budget it fails closed with 503 `ENTITY_AGGREGATE_AUTHORIZATION_UNAVAILABLE`, and above 2,000 matching records with 503 `ENTITY_AGGREGATE_CAPACITY` (found at the A1 build; status block).

  A total over the wrong set is never computed, either way.
- **Why not refuse, as Tree and Matrix do.** Their computations (child existence, orphans, rank partitions) run in SQL shapes that the ID set does not restrict. A grouped aggregate is exactly the shape the ID restriction was built for, and refusing would make the Summary stricter than the Table's own group counts on the same list.
- **A1 acceptance:** the repository applies the ID restriction to every grouping set and to the column-value query. A real-PostgreSQL test checks this with an authorizer that denies some records.
- **Cost is stated, not hidden.** On a large fact with uncovered record authorization, every Summary request enumerates the set, and a set too large for the budget returns the 503 with a retry. A3's performance budget measures this case if A3's fact has such authorization.
- **Precondition: fact size under uncovered record authorization.** When a list's per-record authorization is not covered by its SQL scope (`aggregateAuthorizationCovered` is false), `executeAuthorizedAggregate` pages through the whole matching set 100 IDs at a time and authorizes every ID under one 5-second deadline. Its cost is linear in the matching set, and past the deadline it returns 503 rather than a total. A fact is therefore aggregate-eligible at volume only when its list's record authorization is SQL-covered; otherwise the authorized-aggregate path bounds the fact's size. A0 and A3 each check this for their fact before they are called done.

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

## 13. Chart: Summary's use of the shared chart (A5.3)

**Moved (10 October 2026):** the reusable chart (its data contract, component, colour tokens, "Others" rule and other consumers) now lives in the [Chart blueprint](../chart/blueprint.md), sections 13.1–13.5 and 13.7, with decisions 9, 10, 11, 13 and 15. This section keeps Summary's use of it (13.6), A5.3 (13.8), decisions 12 and 14, and A6.

### 13.6 Summary's use of the chart

- **One toggle, same data.** The Summary toolbar gains "Table | Chart". The chart reads the opening response (level 1) that the grid already holds; it sends no request. Expansions stay in the grid.
- **What is charted:**
  - categories are the level-1 rows, with the grid's labels and in the grid's order, and No value labelled as in the grid;
  - one chosen measure is charted (`chart.measure`, default the first shown). Without a column dimension it is one series; with one, the series are the columns.
  - `categoryAxis.ordered` is true for a date bucket. Otherwise it is false, since a reference or choice order is a listing order, not a sequence.
  - `partOfWhole` is true for the record count, and for a sum of an additive field whose cells share one currency.
  - `total` is the server's parent total, or the column's total for each column series.
  - `rest` follows 13.5 when the level is truncated.
- **Saved state and URL.** `aggregate.chart` holds `{ type, measure, label }`. The URL keys are `aggregate.view=chart`, `aggregate.chartType`, `aggregate.chartMeasure` and `aggregate.chartLabel`.
- **Drill-down.** Selecting a point opens Table with the row's filters (and the column's, for a column series), exactly as the grid's cell does.
- **Withheld values** use the Summary's own messages (`list.aggregate.notSummable`, `.suppressed`, `list.group.mixedCurrencies`), passed through `stateLabel`.
- **Narrow screens** draw the chart at full width, with bar instead of column when categories exceed what fits, and the legend below.
- **Right to left.** The Summary spec asserts decision 15 as amended: in Arabic, a categorical column chart's first category is on the right, and a month-bucket line's earliest month is on the left. That rule silently inverts if someone later "fixes RTL" by flipping a container.

### 13.8 Phases inside A5

| Step | Delivers | Acceptance |
| --- | --- | --- |
| **A5.3** | Summary adoption (13.6) and the published choice order for Summary rows (decision 14) | Adapter tests including "Others" exactness and its refusals; the Summary spec gains chart tests at desktop and phone widths, including RTL |

The status block of this document records each step as it is built.

### 13.9 Build record (A5.3, 10 October 2026)

**What was built**

- **State and URL.**
  - `ListAggregateStateV1` gains `view` (`"chart"`, absent for Table) and `chart` (`{ type, measure, label }`), normalized by `parseListAggregateState`. The charted measure is always one of the shown measures, and an unknown type or label falls back.
  - The URL keys are `aggregate.view`, `aggregate.chartType`, `aggregate.chartMeasure` and `aggregate.chartLabel`. The default (Table, no chart chosen) writes nothing; returning to Table from a shared chart link writes `aggregate.view=table`.
- **Decision 14.** `summaryRows` orders a choice or boolean dimension by its published order (true, then false, for a boolean). Values outside that order follow in the server's order, and No value stays last. A reference or date bucket keeps the server's order.
- **The adapter, `summaryChartData`** (`list-view/src/aggregate/aggregate-chart.ts`). It reads the opening response the grid holds and sends nothing. Every payload passes `parseChartData`.
  - Categories are the level-1 rows, with the grid's labels and order. Their keys are positions (`row:n`), as the grid's rows are, so no record identity enters the chart data.
  - The series are the chosen measure, or one series per column (at most 8 of the up to 12 columns, with `truncated.series` set).
  - `partOfWhole` is true for the record count, and for a sum without time fields (not a semi-additive balance) in one currency with the server's total.
  - **"Others"** is the server's total minus the given points, by exact decimal subtraction. It is given only when the level is truncated, the series is part of a whole, the total is a value, and every given point is a value or empty.
  - Colour by meaning uses the dimension's `statusTones`, own key only, through `resolveEntityStatusTone`. A choice's palette position is its published-order index.
  - A point's drill-down applies its row's filters, plus its column's filters for a column series, exactly as the grid's cell does.
- **The view.**
  - The toolbar gains "Table | Chart". In Chart, a fieldset offers the chart type (unavailable types disabled, with their reasons listed beneath, as the list's unavailable modes are), the charted measure, and the data labels ("Percentages" only when every series is part of a whole).
  - With no type chosen, the first available of column, grouped column, line, bar, stacked column, pie and donut is used.
  - The chart's own data table is off, because the grid is the table. With more than one row level, a note says the chart shows the first level.
  - Withheld points use the Summary's own messages; an empty point reads "No value".
  - On a narrow screen, a column chart of more than 6 categories is drawn as bars.

**Build notes**

1. **One unit per chart.** When the charted values span more than one currency, every value point is shown as "In more than one currency" and nothing is charted. Plotting MYR and EUR on one axis would be wrong, and the grid still shows each row's own figure.
2. **The chart is laid out at its measured width,** with a `ResizeObserver` in the shared component (recorded in the Chart blueprint, 13.4a.13). Before this, the SVG scaled with the page, and at desktop width its text doubled in size.

**Verified**

- **Contract:** a URL, saved-state and normalization test for the chart state (9 tests in the aggregate contract file).
- **jsdom** (`tests/foundation/entity-list-aggregate.test.tsx`, 20 tests, 8 new):
  - decision 14's order;
  - the adapter's order, labels, total and drill-down;
  - "Others" exactness past a double's precision, and its refusals: a complete level, a semi-additive balance, an average, a withheld point;
  - mixed currencies;
  - own-key tones and published-order positions, and an ordered month axis;
  - Chart with no further request and a point's drill-down;
  - the Table toggle's saved state and withheld wording;
  - the column series and their drill-down.
- **Browser** (`tests/foundation-browser/entity-list-aggregate.spec.ts`, 12 tests, 4 new, on the real list runtime and Neon CSS):
  - one request, and a point drilling down to Table;
  - the keyboard;
  - a phone with no horizontal scroll;
  - right to left: a categorical column chart's first category is on the right, and a month line's earliest month is on the left.

  Screenshots are in `tooling/config/test-results/entity-list-aggregate-chart*.png`.
- **Other suites and gates:** the 24 entity-list foundation files and the contract suites pass, except `detail-navigation`'s import-boundary test, which fails on the form-detail package and predates this change. The design-system, UI-system, strict style-token, deployment-profile and workspace gates pass.
- **Not verified:**
  - a real Entity, which waits for A0 and A3;
  - an Arabic-language page. The right-to-left test sets the document direction with English text.

## 14. Decisions required (project owner)

Already approved (status block): the direction, the backing (views, then `insight` only on evidence), phase order, no FX, `minimumGroupSize` as a floor, Approval assignment blocked, Chart at A5, Dashboard out of scope.

Decisions (all seven approved on 10 October 2026; status block):

1. **The declaration** in sections 5.1, 5.3–5.6: dimensions, measures with `count` and `countDistinct`, defaults, request parameters and response.
2. **Loading model: one request per expansion, with `GROUPING SETS` per request** (section 7.1), as Tree loads grouped levels. This replaces the earlier wording "a multi-level GROUP BY, with `ENTITY_LIST_MAX_GROUP_LEVELS` enforced by the server". Section 3 shows that the single `group` per request is Tree's approved design, not drift. Under this model the server bounds every request, and the level constant bounds saved state.
3. **Bounds:** 50 groups per response (inherited), 12 column values, 5 measures per request, with truncation always stated and no "Other" bucket (section 7.2).
4. **No bucket-unit change.** Both sides already agree on `month | quarter` (section 3). This withdraws the A1 prerequisite "narrow the contract's grouping vocabulary".
5. **Additivity as a field property** (section 5.2), stored on the field in Studio (section 15). It includes `timeFields` as a list, because the A0 view exposes fiscal year and period number rather than one fiscal-period reference.
6. **A1 runs on fixtures in parallel with A0.** This is the same pattern as Board, Calendar, Gantt, Tree and Matrix: the runtime is proven on fixtures, and the real Entity waits for the metadata cleanup and for its dimension Entities (section 17).
7. **Record authorization not covered in SQL uses the existing authorized-aggregate path, not a refusal** (section 9.2; revision 2). This replaces revision 1's `LIST_AGGREGATE_RECORD_AUTHORIZATION_UNSUPPORTED`.

Audit round 3 recommended approving decisions 1–6 unchanged; the owner approved 1–7. Decision 7 and the checked response bound in decision 3 come from verifying that audit's two notes (section 19).

**Raised at the A1 build:**

8. **Approved and built: apply additivity to grouped Table's sums.** It is the same field property, the same rule and the same withheld-value rendering ("Not summed across …"). Before it, the same list could show a closing-balance total in grouped Table that Summary withholds as meaningless, and the surface showing the wrong number was the one that appeared to work. The owner approved it, as its own change before A2: "decision 8 approved". Section 5.8 records the build.

**Raised for A5 (revision 6; all seven approved on 10 October 2026, status block):**

12. **Top / Bottom N as its own phase, A6, after A5.** It is a server capability that orders groups by a measure across every group the viewer can read. Matrix's deferred "Lowest on n items" needs the same capability, so it is designed once for both (section 17). Until then, a chart shows the first groups by key, says so, and offers no "top N".
14. **Summary rows follow the published choice order** for a choice or boolean dimension, as grouped Table does, so the grid, its chart and grouped Table agree. References and date buckets keep the server's order.

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
| **A0** | View-backed read-only Entity onboarding proven end to end on `ledger.v_trial_balance`: published, authorized, listed in Table, reference dimensions resolving to readable labels | Metadata cleanup. Company code, ledger book and GL account Entities onboarded (cost centre, profit centre and project join as they are onboarded; until then those dimensions stay unpublished). A decision on fiscal period: keep year and number as dimensions, or add a fiscal-period reference to the view through a forward migration. Acceptance includes the fact-size precondition (status block): whether the list's record authorization is SQL-covered |
| **A1** | Summary mode: rows at up to 3 levels with one request per expansion, `GROUPING SETS` totals, `count` and `countDistinct`, additivity and `notSummable`, currency states, `minimumGroupSize`, masked-field projection and the authorized-aggregate path (section 9.2), `LIST_AGGREGATE_MAX_CELLS` with its contract test, revision notice, drill-down to Table, saved and URL state, narrow layout, accessibility | Section 14 approved. On fixtures first; on A0's Entity once A0 lands |
| **A3** | `purchase_invoice_line` at OLTP volume through a header-and-line view (supplier and posting date from the header). A performance budget measured on representative volume, through the service path the Entity takes (authorized-aggregate or SQL-covered), with index findings, and the fact-size precondition (status block) checked for this fact. The budget is a go/no-go number, set by the owner, that decides A4 | A1. The business partner, item and commodity category Entities for readable dimensions |
| **A2** | Column dimension: `pivot`, `pivotValues`, column totals, `columnsTruncated`. Built before A3 by the owner's approval (status block), with three conditions: a real-PostgreSQL test of its own SQL path; acceptance that measures the pivot's response size against `LIST_AGGREGATE_MAX_CELLS` and the statement's cost; and A3 kept as the gate before any real Entity publishes a pivot | A1. A3 gates publication on a real Entity, not the build |
| **A4** | `insight` schema, projector runtime, per-fact watermark and "As of", rebuild from source, RLS gate | Only if A3's evidence shows a live view cannot meet the budget, or a polymorphic or JSON source needs it |
| **A5** | The reusable chart and Summary's use of it, in three steps. A5.1 (chart colour tokens) and A5.2 (the chart contract and component) are specified and recorded in the [Chart blueprint](../chart/blueprint.md); A5.3 (Summary adoption with the published choice order) is here (section 13.8) | A2; decisions 9–15 approved |
| **A6** | Top / Bottom N: a server capability ordering groups by a measure across every group the viewer can read, with the same scope, filters and authorization as the aggregate, and the row cap, totals and paging rules restated for it. Matrix's deferred "Lowest on n items" uses the same capability. **It inherits the aggregate's authorization constraint:** on an Entity whose record authorization is not SQL-covered, it runs on the authorized-aggregate path, with its 2,000-record capacity refusal. Its acceptance states which path each adopting Entity takes | A5; its own approval, acceptance criteria and real-PostgreSQL test |
| — | Approval assignment fact | Owner instruction on a typed per-approver workflow row (AGENTS.md: this work does not authorize workflow/case execution) |
| — | FX report currency; Dashboard; summary-grid export | Separate approvals |

**Status (10 October 2026).** A1 (section 5.7), decision 8 (section 5.8) and A2 (section 5.9) are built on fixtures. A0, A3, A4 and A5 are not started; A3 gates a real Entity's pivot.

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
| Top / Bottom N over the first 50 groups by key | Looks right and is wrong; it needs ordering by the measure across every group (A6) |

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
| Audit round 3 | Committing the documents as proposed is safe | Committed as revision 2, proposed (`a1b518a5f`), with its three companions in one commit |
| Audit round 4 | Both round-3 notes withdrawn as corrected; `executeAuthorizedAggregate` is linear in the matching set under one 5-second deadline, so it bounds the fact size when record authorization is not SQL-covered | Adopted as a recorded precondition at the owner's request: status block, section 9.2, A0 and A3 acceptance. It changes no decision |
| Owner (10 October 2026) | Section 14 decisions 1–7 | Approved; status block |
| Owner (10 October 2026) | "go ahead" | A1 built on fixtures; status block and section 5.7 |
| Audit round 5 (A1 build review) | The 2,000-record capacity correction; whether a view's authorization is SQL-covered decides if the ceiling applies at all | Confirmed in the status block; A0's acceptance already asks it first |
| Audit round 5 | Grouped Table sums ignore additivity, so two surfaces disagree | Raised as decision 8 (section 14), recommended before A2; not implemented without the owner |
| Audit round 5 | The "unchanged statement" claim needs an anchor that cannot be deleted | The cited test exists; the build record now names `kysely-record-repository.test.ts` and `list-group-aggregates.test.ts` explicitly (5.7 point 7) |
| Audit round 5 | Additions to the shared group result should be rare and named | Recorded in 5.7 point 1 |
| Audit round 5 | Fix the Matrix PostgreSQL typecheck error before committing | Fixed (5.7 point 15) |
| Owner (10 October 2026) | "decision 8 approved" | Built as its own change before A2 (section 5.8) |
| Audit round 6 | The default stays additive, with an explicit test; a safe cell is still summed; one source for the wording | Section 5.8 points 1, 3 and 4 |
| Audit round 6 | The lesson: grouped Table's sums were verified for arithmetic, not for meaning | Recorded in the Tree blueprint's status as the missing half of its A2 contract |
| Owner and audit round 7 | A2 before A3, with A3 kept as the publication gate, a real-PostgreSQL test of A2's SQL, and the response size and statement cost in A2's acceptance | Status block and section 17; built as section 5.9, with points 6 and 7 meeting the two build conditions |
| Audit round 7 | Note the coupling between the Aggregate and Tree blueprints in each | Status block here; Tree status |
| Audit round 8 | The pivot's cost is GROUPING SETS over the whole fact plus HAVING; restrict the source CTE to the shown rows and columns | **Corrected by measurement.** The aggregation took about 1–2 ms. The cost was a correlated `EXISTS` re-running the column query per grouped row. Fixed by materializing and hashing: 114.6 → 5.3 ms. Restricting the source would make row, column and overall totals wrong, so it was not adopted (5.9 point 7) |
| Audit round 8 | A3 must measure the service path the Entity takes, with a go/no-go budget that decides A4 | Adopted as the fourth condition; the number awaits the owner |
| Audit round 8 | No value is protected by the row cap but not the column cap | Recorded (5.9 point 3) |
| Audit round 9 | Name the test that refutes the rejected source restriction | Recorded (5.9 point 7) |
| Audit round 10 | A6 inherits the aggregate's authorization constraint and 2,000-record capacity | Recorded in A6's row (section 17) |
