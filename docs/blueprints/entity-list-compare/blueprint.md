# Entity list Compare — blueprint

**Status:** approved, revision 2 (9 October 2026).

- **Origin.** The project owner asked to explore a Comparison view while the metadata cleanup is in progress: "current we have this view in Audit Log Snapshot...to compare the version... can we make this as generic to compare records in list view .. in future we can extend the same for quotation comparison, material master, Price Catalog List comparison".
- **Review so far.** A first recommendation (Compare as a selection action, not a Layout) was audited against the code; revision 1 was then audited again. Both audits' findings and their disposition are in section 17. Two statements of the first audit were corrected against the code, and the second audit confirmed both corrections.
- **Approval (9 October 2026).** The project owner (nchandravel-atlas) approved decisions 15.1 through 15.10 in these words: "APPROVED 15.1 through 15.10 as written with finding 2 folded into 8.2 and finding 3 into 5.1, and to note finding 1 as a specification clarification APPROVED". Revision 2 makes exactly those changes:
  - **Finding 2,** folded into section 8.2: money is compared only when its currency cells are comparable values and equal; a masked, absent or unreadable currency makes the row `not_comparable` ("Currency not compared").
  - **Finding 3,** folded into section 5.1: the binding constraint is stated, and 60 is recorded as a measured budget against the candidate tables (section 3).
  - **Finding 1,** a specification clarification in section 5.3 and section 3: the masked signal's source is the authorization field policy, through the existing `maskedPresentationField`, and the existing prohibition on masked fields in queries is cited.
- **Approved for build (implementation authority):** C1 and C2 (decision 9). C1b, C3 and C4 each need their own approval. C2 runs on synthetic fixtures until the metadata cleanup lands; publishing a real Entity's comparison waits for the authoring storage (section 12) and a pilot.
- **What this is not.** Compare is not a list Layout. It adds no route, page, provider stack or entity-specific comparison, and no mode to the registry.

**Scope and authority.**

- This is the design for **comparing chosen records side by side in the shared Entity list**, for any eligible Entity through governed, published Meta Entity properties. No entity name, allowlist or entity-specific branch appears in framework code.
- It also defines the **shared comparison core**: one model and one view used by both the record comparison and the existing Audit Log snapshot comparison.
- **Authority.** Entity onboarding and shared Entity Framework work under [AGENTS.md](../../../AGENTS.md), on the same footing as Board, Calendar, Gantt and Tree.
- **Shared foundation.** The [shared list layout foundation](../entity-list-layouts/foundation.md) applies where it speaks to every list: per-viewer availability, no fall-through, and the record-scoped rule (section 8) for lists inside a record's section. Compare is not a layout, so the renderer traits (section 7) do not change. Foundation section 6 ("Comparing drafts and states") is about editor drafts and is unrelated despite the name.
- **Authoring authority.** The [Entity Studio blueprint](../entity-studio/blueprint.md) remains the authority for authoring storage, the codec, the compiler and the composer. Its proposed entries for Compare (section 9) are written into it when this design is approved.
- Update this document in place. Do not create competing comparison plans.

## Contents

1. Principles
2. Use cases and what each phase serves
3. Current-state facts this design relies on
4. Placement: why a selection action and not a Layout
5. Contract properties
6. Validation, availability and finding codes
7. Request and data semantics
8. Comparison semantics: cell states, equality, differences and baseline
9. Views and interaction
10. Accessibility
11. The shared comparison core (C1 extraction inventory)
12. Studio authoring and registration inventory
13. Folder structure and test registration
14. Delivery phases and acceptance
15. Decisions required (project owner)
16. Rejected and out-of-scope options
17. Review disposition
18. Proposed AGENTS.md entry

## 1. Principles

1. **Authored, never inferred.** Which fields make a meaningful comparison is a presentation decision. The Entity declares it in Meta Entity properties. Without the declaration, Compare is not offered. The framework never picks a field set, as the rules against a synthesized identity and an inferred hierarchy already require.
2. **One request, existing controls.** A comparison reads its records through the existing list operation (`recordIds` plus a field projection). Authorization, field restriction, masking, tenant isolation and locked record scope are therefore enforced by construction, not re-implemented.
3. **Nothing vanishes without a trace, nothing restricted is disclosed.** Invalid declarations are refused at publication. Fields hidden from this viewer are left out without disclosing their names, with a single visible statement that some fields are not shown. A record the viewer cannot read shows as unavailable.
4. **Equals, not before and after.** Record columns are peers. A row "differs", never "changed". With a baseline, cells are marked relative to the baseline.
5. **No technical identities on screen.** Columns are headed by the published readable identity and title. Record IDs live only in requests and the URL.
6. **Never compare by position.** Related collections are aligned only by a declared match key (C4), never by array index.
7. **One comparison core.** The snapshot comparison and the record comparison share one model, so a rule fixed once is fixed in both.

## 2. Use cases and what each phase serves

| Use case | What the user compares | Phase that serves it |
| --- | --- | --- |
| Master data review (Material, Supplier, Customer) | 2–4 records' header fields, to spot inconsistent setup | C2 |
| Price catalogue headers | Validity, currency, terms across 2–4 price lists | C2 |
| Quotation evaluation, headers | Supplier, validity, payment terms, totals | C2, with C3 marking the best total |
| Quotation evaluation, lines | Price per material across quotations | C4 (line alignment by material) and C3 |
| Price catalogue lines | Price per item across catalogues | C4 and C3 |
| Record history (exists today) | Two snapshots of one record | Existing view; C1 moves it onto the shared core |

Out of scope, recorded in section 16: more than four records; comparing records of two different Entities (for example a quotation against a purchase order); a record against its own draft.

## 3. Current-state facts this design relies on

Verified against the repository on 9 October 2026.

| Fact | Evidence | Consequence |
| --- | --- | --- |
| The snapshot comparison model is small and mostly layout-neutral | `packages/platform/entity/runtime/form-detail/src/activity-comparison-model.ts` (99 lines): `groupActivityFields` (sections and tabs, an "additional" bucket for fields outside the layout) and `formatActivityValue` (choice labels, exact numbers, dates through Intl) take one field and one cell | They can move to a shared core (section 11) |
| Two functions are snapshot-specific | `comparable` (both cells captured) and `changed` (the server's directional `changed` flag) in the same file | They stay with the snapshot adapter |
| The snapshot contract is two-column and directional | `ActivityComparisonField { before, after, changed }`, `ActivityComparison { from, to, fields }` (`packages/contracts/platform/entity-runtime/src/activity.ts`) | The shared core defines its own N-column type; the snapshot view becomes an adapter onto it |
| The snapshot contract forbids position-based collections | "Related collections require a separately qualified identity/coverage contract; never infer them from JSON array positions" (`activity.ts`) | C4 needs a declared match key and its own server contract |
| The snapshot view is tested in the browser, not by a rendering test | `tests/foundation-browser/entity-activity.spec.ts` ("comparison expansion"); `tests/foundation/activity-comparison-model.test.ts` (model only, 134 lines) | C1 first adds a rendering test pinning the view's output, then extracts (section 14) |
| `form-detail` depends on `list-view` | `packages/platform/entity/runtime/form-detail/package.json`: `@athyper/platform-entity-list-view` | The shared core cannot live in `list-view`; it needs its own package (section 11) |
| The list operation reads chosen records | `recordIds`, at most 100 (`entity-list-routes.ts` schema; `records-routes.ts:68`; `query-service.ts:250`), deduplicated | Compare needs no new endpoint |
| `recordIds` is part of the query hash and is refused with `hierarchy=matches` | `entity-list-service.ts` `queryHash`; `records-routes.ts:103–104` | Compare sends a standalone request with no cursor and no `hierarchy` (section 7.1) |
| A requested field the viewer cannot read is **refused**, not dropped | `validateQueryFields` in `query-service.ts`: `PROJECTION_FIELD_NOT_ALLOWED` for an unknown or unreadable field, `TOO_MANY_PROJECTION_FIELDS` above 100; the route schema caps `fields` at `MAX_LIST_FIELDS` = 100 (`INVALID_FIELDS`) | A comparison must request only fields readable for this viewer, known in advance from the per-viewer descriptor (section 5.3); the response's own filtering in `responseProjection` runs after that validation |
| The projection always adds the identity, and the group field when grouping | `responseProjection` (`query-service.ts`): the configured identity, or the storage identity when the configured one is unreadable, plus `query.group` | The Compare request asks for its title field explicitly and never sends `group` |
| Masked fields return masked values | `projectEffectiveReadRow` applies the field's mask (`entity-effective-read-projection.ts`) | A masked cell is shown as returned and never compared (section 8.1) |
| "Masked" is a property of the authorization field policy, not of the field descriptor | `EntityFieldPolicyV1.representation: "plain" \| "masked"` (`server/packages/contracts/metadata/src/entity-authorization.ts:31`); the list descriptor already uses it through `maskedPresentationField` (`entity-list-service.ts:2355`) to keep masked fields out of list chrome, including a money field's currency (`entity-list-service.ts:1472`) | The Compare projection derives `masked` from the same function: one source of truth (section 5.3) |
| Masked fields may not take part in queries | "Masked raw fields cannot participate in queries; publish a safe projection field" (`entity-authorization.ts:250`), refused when a masked policy declares any query use | Written policy for what section 8.1 does: a masked value is displayed, never filtered, sorted or compared |
| Candidate tables have far fewer than 60 comparable fields | Measured on the real Neon DDL (9 October 2026), excluding identity, tenant, version and audit columns: `gl_account` 26 columns in total (16 non-reference), `catalog` 24, `cost_center` 23, `catalog_price` 22, `catalog_item` 21, `item` 21, `profit_center` 21, `chart_of_account` 19, `product` 17, `commodity_category` 16, `customer` 15, `supplier` 15. No quotation table exists yet | 60 is a budget with more than twice the headroom of the widest candidate (section 5.1) |
| A money field may name its currency field | `field.list.currencyField` (`server/packages/contracts/metadata/src/descriptors.ts:141`); authoring column `entity_field.currency_field_id` (`normalized-core-contract.ts:215`) | Money equality and C3 ranking reuse it; no second currency declaration |
| Exact decimal helpers exist | `addDecimals`, `compareDecimals` in `packages/contracts/platform/entity-list/src/decimal.ts` | Decimal and money equality is exact |
| The selection bar already hosts framework actions | `SelectionBar` in `list-view/src/index.tsx` (bookmarks, Export, select all matching), shown only outside pickers (`!embedding`) | Compare is one more selection-bar action |
| Record sections are not pickers | `related-entity-section.tsx` passes a locked `scopeCoordinate`, not `embedding` (Tree blueprint section 3) | Compare is available in a record's sections, for example quotations under a request for quotation |
| Presentation caps are named constants with tests | `LIST_GROUP_LIMIT` (`entity-list/src/tree.ts`), `GANTT_ROW_CEILING` (`gantt-model.ts`) | Compare's caps follow the same pattern (section 5.1) |

## 4. Placement: why a selection action and not a Layout

A Layout (Table, Cards, Board, Calendar, Gantt, Tree) draws the **whole result set** of the list's query, page by page. A comparison draws a **chosen handful** of records, chosen from any layout. These are different things:

- The compared set is not a query result. It survives filter, sort and page changes only as an explicit selection, so it cannot be a mode of the result set.
- A Layout would need its own empty, loading, pagination and count behaviour. A comparison has none of them: it is one bounded request.
- The selection bar already hosts actions over chosen records (bookmarks, Export). Compare joins them with the same availability rules.

Compare opens as a **comparison panel inside the list page**: full width on wide screens, full screen on narrow screens. It is not a route. Its state is in the list's URL (section 5.4), so a comparison can be shared, reloaded and closed with Back.

**Where Compare is offered:** wherever the shared selection bar appears, which today is Table, Cards, grouped lists and Tree, including Tree's search view. Board, Calendar and Gantt do not offer multi-selection today; this design does not add it. Not in record pickers (the selection bar is not shown there). Available in record sections, under the section's locked record scope.

## 5. Contract properties

Studio authoring rows are typed and normalized; nothing is stored in `layout_config`. Compiled JSON is derived output.

### 5.1 Named presentation bounds (browser contract)

```ts
// packages/contracts/platform/entity-list/src/compare.ts
export const COMPARE_MIN_RECORDS = 2;
export const COMPARE_MAX_RECORDS = 4;       // selection bound; the server accepts up to 100 recordIds
export const COMPARE_NARROW_COLUMNS = 2;    // columns visible at once at the narrow breakpoint
export const COMPARE_MAX_FIELDS = 60;       // declared comparison fields per surface
```

These are presentation bounds of the UI, not contract bounds of the server. Each has a test. If one ever needs to vary per Entity, it becomes a published property then, not now.

**The binding constraint** is the server's projection limit: declared fields + identity + title + the currency field of each declared money field ≤ `MAX_LIST_FIELDS` (100). Publication validation checks exactly this sum (`COMPARE_FIELDS_ABOVE_CAP`, section 6).

**`COMPARE_MAX_FIELDS` = 60 is the declared-field budget inside that constraint,** chosen to leave headroom for the identity, title and currency fields. It is measured, not round: the widest candidate table, `gl_account`, has 26 columns in total once technical columns are excluded, and no candidate exceeds 26 (section 3). A comparison wider than 60 fields would also stop being readable as a side-by-side view. If a real Entity needs more, raising the budget is a change to this section, not a per-Entity exception.

### 5.2 The comparison declaration (published, per list surface)

Compare is declared on a **list surface**, like Board lanes, because it is a presentation of that list and a record section's list may compare differently from the main list.

```ts
// Published on the list surface (compiled from authoring rows, section 12).
compare?: {
  sections: readonly {
    key: string;                 // catalog code, unique within the declaration
    label: string;               // published label (localizable like other surface labels)
    fields: readonly string[];   // ordered field keys of this Entity, unique across the declaration
  }[];                           // 1–12 sections
};
```

- **Present** means Compare is offered on this surface (subject to the viewer's access, section 5.3). **Absent** means Compare is not offered. There is no default.
- **Sections** group the comparison rows. They are authored for comparison and are not a reference to the detail page's sections: detail sections contain components, computed panels and collections that are not comparable. The composer may *start* a declaration by copying detail sections at authoring time (section 12); the runtime never reads detail sections for Compare.
- **Fields** must be root fields of the Entity. No related collections (C4 adds them separately), no technical identities, no UUID-typed fields (section 6).
- The surface's readable identity and title are not listed: they head each column automatically (section 9.2).

C3 adds one field-level property (section 5.6). C4 adds collection declarations (section 5.7).

### 5.3 Per-viewer projection (browser contract)

The list descriptor already carries per-viewer projections for Board, Calendar, Gantt and Tree. Compare adds one, resolved on the server when the descriptor is compiled for the viewer:

```ts
// EntityListDescriptorV1.surface.compare, present only when the surface declares Compare
// and at least one declared field is readable for this viewer.
compare?: {
  sections: readonly {
    key: string;
    label: string;
    fields: readonly {
      key: string;
      label: string;
      valueKind: ListValueKind;
      /** Choice labels for enum fields, as in filterOptions. */
      options?: readonly { value: string | number | boolean; label: string }[];
      /** This viewer receives a masked value: shown, never compared. */
      masked?: true;
      /** Money: the readable currency field, when declared and readable. */
      currencyField?: string;
    }[];
  }[];                                 // sections left with no readable field are dropped
  /** Some declared fields are not shown to this viewer. No names, no count. */
  fieldsRestricted?: true;
  maxRecords: typeof COMPARE_MAX_RECORDS;
};
```

- **This projection is load-bearing, not defensive.** The server refuses a request naming any field the viewer cannot read (`PROJECTION_FIELD_NOT_ALLOWED`), so a single unreadable field would fail the whole comparison. The projection lists **only readable fields**, so the browser requests nothing the server would refuse.
- A field hidden from the viewer is left out **without its name, label or count**, following the snapshot rule that layout metadata never discloses restricted fields. Its existence is acknowledged only by the boolean `fieldsRestricted`, which the panel states in one line (section 9.4).
- **Source of `masked` (specification clarification, revision 2).** `masked` is not a field-descriptor property: it comes from the authorization field policy (`EntityFieldPolicyV1.representation`). The projection sets it exactly where the existing `maskedPresentationField(descriptor, key)` returns true, the same function that keeps masked fields out of list chrome. There is one source of truth for "this viewer sees this field masked", and Compare adds no second one. Masked fields are already barred from queries (`entity-authorization.ts:250`); Compare extends the same rule to comparison.
- A declared money field's `currencyField` is listed with its own `masked` flag when the policy masks it, so the browser can apply the currency rule in section 8.2.
- If no declared field is readable, `compare` is absent and Compare is not offered to this viewer. This is a per-viewer outcome, not an error.

### 5.4 URL state (browser contract)

| Key | Value | Rules |
| --- | --- | --- |
| `compare` | 2–4 record routing IDs, comma-separated, in column order | Present while the panel is open. Never displayed. Deduplicated; more than `COMPARE_MAX_RECORDS` or fewer than `COMPARE_MIN_RECORDS` valid IDs is ignored and removed (replace), with the "comparison could not be opened" notice |
| `compareBaseline` | One record routing ID from `compare` | Optional. Ignored and removed (replace) when not in `compare` |
| `compareAll` | `true` | Optional: shows every row instead of differences only. Absent means differences only |

- **Not saved state.** These keys are not part of `SaveableListStateV1`. Saved views never store a comparison; opening a saved view closes the panel.
- **History.** Opening the panel pushes one history entry; Back closes it. Changing the baseline, removing a column or toggling all rows replaces the entry.
- **Reload.** On load with `compare`, the list renders normally underneath and the panel opens with one request (section 7.1). Records that are no longer readable become unavailable columns (section 8.1).
- **Surface change.** If the current surface has no `compare` projection for this viewer, the keys are removed (replace) and the notice "Compare isn't available for this list" is shown. Nothing falls through to another surface.

### 5.5 Comparison row model (shared runtime type, C1)

This is the shared core's type (section 11), not a server contract.

```ts
export type ComparisonCell =
  | { readonly state: "value"; readonly value: JsonValue; readonly display: string }
  | { readonly state: "empty" }                                   // "Not set"
  | { readonly state: "masked"; readonly display: string }        // shown, never compared
  | { readonly state: "unavailable"; readonly reason: "not_captured" | "record_unavailable" };

export interface ComparisonColumn {
  readonly key: string;           // internal (record ID or snapshot ID); never displayed
  readonly heading: string;       // readable identity · title, or the snapshot title
  readonly baseline?: true;
}

export interface ComparisonRow {
  readonly key: string;           // field key
  readonly label: string;
  readonly cells: readonly ComparisonCell[];   // one per column, in column order
  /** "differs" | "same" | "not_comparable"; the snapshot adapter supplies the
   * server's flag, the record comparison computes it (section 8). */
  readonly outcome: ComparisonOutcome;
  /** Present only with a baseline: per-column "same" | "differs" | "not_comparable". */
  readonly relativeToBaseline?: readonly ComparisonOutcome[];
  /** C3 only: columns holding the best value. */
  readonly best?: readonly number[];
}
```

### 5.6 C3: best value (published, per field)

```ts
// EntityFieldDescriptor.compare (new, optional)
compare?: { better: "lower" | "higher" };
```

- Eligible types: integer, decimal, money, date, datetime. Anything else is refused at publication (`COMPARE_BETTER_INELIGIBLE`).
- This is **new authoring**: a per-field property with its own Studio storage (section 12). It cannot be inferred from a name or type.
- Money is ranked only when every compared cell carries the same currency through the field's existing `field.list.currencyField`, by the section 8.2 rule. Without a declared, readable and unmasked currency field, money is never ranked. With mixed currencies, the row shows "Mixed currencies" and no best mark. No second currency declaration is introduced.

### 5.7 C4: related collections (shape only; needs its own approval and server contract)

```ts
// On the comparison declaration (5.2), added in C4:
collections?: readonly {
  key: string;
  label: string;
  relation: string;              // a published relation from this Entity to the line Entity
  matchKey: readonly string[];   // 1–2 field keys of the line Entity that identify a line within its parent
  fields: readonly string[];     // line fields to compare, in order
}[];
```

- **Identity domain.** Lines are aligned by the **stored values** of `matchKey` within one parent record, never by label, display text or position. For a reference match key (for example a material), that is the referenced record's identity; for a code, the exact stored code. Lines from different parents match when their match-key values are equal.
- **Uniqueness is a database fact.** Onboarding must show a database unique key on (tenant, parent, match key). Without one, the collection is refused at publication (`COMPARE_MATCH_KEY_NOT_UNIQUE`), because duplicate keys would make alignment ambiguous.
- **Unmatched lines** appear as their own rows with "Not in this record" in the other columns. They are never paired with a neighbour.
- **Server contract.** The list response carries no child collections. C4 needs either one record-scoped list request per compared record (at most four, each under the section's locked scope) or a new bounded collection read. Choosing between them is part of C4's own design.

## 6. Validation, availability and finding codes

**Publication (refused; the declaration is not published):**

| Code | When |
| --- | --- |
| `COMPARE_FIELD_UNKNOWN` | A listed field is not a field of the Entity |
| `COMPARE_FIELD_TECHNICAL` | A listed field is the storage identity, the version field, or UUID-typed (no-UUID rule). Reference fields are allowed: they display labels |
| `COMPARE_FIELD_DUPLICATE` | A field appears twice in the declaration |
| `COMPARE_SECTION_EMPTY` | A section lists no field, or the declaration has no section |
| `COMPARE_FIELDS_ABOVE_CAP` | More than `COMPARE_MAX_FIELDS` fields, or the request the declaration implies (fields, identity, title, currency fields) exceeds `MAX_LIST_FIELDS` |
| `COMPARE_IDENTITY_REQUIRED` | The surface has no published readable identity to head the columns |
| `COMPARE_BETTER_INELIGIBLE` (C3) | `compare.better` on an ineligible type |
| `COMPARE_MATCH_KEY_NOT_UNIQUE` (C4) | No database unique key backs the match key |

**Per viewer (not errors):** no readable declared field means `surface.compare` is absent; some hidden fields mean `fieldsRestricted: true`.

**At runtime:**

| Situation | Behaviour |
| --- | --- |
| 1 or more than 4 records selected | Compare is shown disabled with its reason: "Select 2 to 4 records to compare" |
| "All matching records" selected | Compare is disabled: "Choose specific records to compare". A comparison is of named records, not a query |
| Access changed between descriptor and request (`PROJECTION_FIELD_NOT_ALLOWED`) | The panel shows "Your access to this list changed. Reload to compare." with a Reload action. No partial comparison |
| Request fails otherwise | The panel shows the list's standard retryable error, inside the panel |
| A requested record is not returned | Its column is unavailable (section 8.1) |

## 7. Request and data semantics

### 7.1 The Compare request

One request on the existing list operation:

| Parameter | Value |
| --- | --- |
| `recordIds` | The compared IDs (2–4) |
| `fields` | The projection's readable fields, plus the title field, plus each money field's `currencyField` |
| `limit` | The number of IDs |
| `countMode` | `none` |
| reference labels | Requested as the list does for its rows, so references show authorized labels (`displayValues`) |
| locked record scope, work context | Carried as for the list itself (record sections keep their parent scope) |
| `cursor`, `hierarchy`, `group`, `search`, filters, sort, standard view | **Never sent** |

- **Why standalone.** The comparison must reload from the URL regardless of the list's current filters, and `recordIds` is bound into the cursor hash and refused with `hierarchy=matches`. A standalone request avoids both by construction, so Compare also works from Tree's search view. A test asserts the request carries none of the excluded parameters.
- **Why not the user's filters.** A selected record that the user later filters out is still a record they chose to compare. Scope and authorization still apply: the locked record scope and work context are always sent, and the server enforces them.
- **Column order** is the order of `compare` in the URL (the selection order), not the response's order. Rows are matched to columns by ID.

### 7.2 Request budget

One request per opening, and one per Reload or Retry. Changing the baseline, toggling all rows, collapsing sections or removing a column sends nothing: the panel already holds every value. Adding a record is not offered inside the panel (the user closes, changes the selection and compares again), so the budget stays one.

### 7.3 Record identity in the panel

The response always includes the identity (`responseProjection`). When the configured identity is unreadable, the server substitutes the storage identity for routing. The panel uses it only as the column key and the "Open record" link, never as a heading. A column whose readable identity is unavailable is headed "Record not available" (section 8.1), never by its ID.

## 8. Comparison semantics: cell states, equality, differences and baseline

### 8.1 Cell states

| State | Shown as | Compared? | Produced by |
| --- | --- | --- | --- |
| `value` | The formatted value | Yes | A returned non-empty value |
| `empty` | "Not set" | Yes: equal to another `empty`, different from a `value` | `null`, missing key, or empty string in a returned record |
| `masked` | The masked value as returned | **No** | A field the projection marks `masked` |
| `unavailable` (`record_unavailable`) | "Not available" for the whole column | **No** | A requested record not returned: deleted, out of scope or not readable. These are deliberately indistinguishable |
| `unavailable` (`not_captured`) | "Not captured" | **No** | Snapshot adapter only: the existing uncaptured state |

This replaces the snapshot vocabulary `uncaptured` / `capturedEmpty` with `unavailable (not_captured)` / `empty` in the shared core. The snapshot view keeps its current wording through its adapter's labels (section 11), so C1 changes no visible text.

### 8.2 Equality by value kind

| Value kind | Equal when |
| --- | --- |
| string, text | Exactly equal. No case folding, trimming or locale collation |
| integer | Numerically equal |
| decimal | `compareDecimals` returns 0 (exact; "1.50" equals "1.5") |
| money | Amounts equal by `compareDecimals` **and** every currency cell is a `value` cell and all are equal, through the field's `currencyField`. In every other case the row is `not_comparable`, shown as "Currency not compared": no `currencyField` declared; the currency field unreadable; the currency field masked (a masked currency cannot tell MYR from USD, so equality is unknowable, not satisfied); or a currency cell `empty` or `unavailable`. Different currencies make the row `differs`. The framework never converts currencies and never assumes two are equal |
| boolean, enum | Same stored value |
| date | Same calendar date string |
| datetime | Same instant |
| reference | Same referenced record identity. The label is display only: two different records with the same label differ |
| JSON object or array | Canonical JSON equal (keys sorted) |

### 8.3 Row outcome

- `not_comparable` when any cell is `masked` or `unavailable`, or a money row fails the currency rule in section 8.2. The row is shown in "all rows", and in "differences only" it is listed under a separate "Not compared" group at the end of its section, so it is never silently hidden.
- `differs` when the comparable cells are not all equal.
- `same` otherwise.

### 8.4 Baseline

- With a baseline, each non-baseline cell is marked **relative to the baseline**: "Same as baseline", "Differs from baseline", or "Not compared". The vocabulary is relative, never "changed".
- The row's outcome is unchanged by the baseline. "Differences only" still means rows where any comparable cell differs.
- **Removing the baseline column** clears the baseline and its marks, and the panel announces "Baseline cleared". A neighbour is never promoted.
- The baseline is marked in its column header by **text** ("Baseline"), not by colour alone.

### 8.5 Best value (C3)

- Among comparable cells, the best by `compare.better` gets the text mark "Best" (and an icon). Ties are all marked. `empty` cells are never best. A row with fewer than two comparable values shows no mark.
- Best and baseline are independent: the baseline column may or may not hold the best value.

## 9. Views and interaction

### 9.1 Opening

1. The user selects 2–4 records. The selection bar shows **Compare** beside bookmarks and Export.
2. **Compare** opens the panel and pushes the URL state. Focus moves to the panel heading.
3. The heading reads "Comparing 3 Materials" (the Entity's plural label).

### 9.2 Panel layout (wide)

- **Header row:** one column per record, headed by its readable identity and title, with a menu per column: **Set as baseline** / **Clear baseline**, **Remove from comparison** (disabled when only two remain), **Open record** (opens the detail page in the same tab; Back returns to the comparison).
- **Toolbar:** "Differences only" switch (on by default), with the summary "12 of 40 fields differ"; **Collapse all** / **Expand all** sections; **Close**.
- **Body:** a table with a sticky first column of field labels and a sticky header row. Sections are collapsible row groups headed by their label and their difference count ("3 differ").
- **Differences** are marked in each differing row by a text badge ("Differs") and a subtle row tone. Equal rows are plain.

### 9.3 Narrow screens

- The panel is full screen. `COMPARE_NARROW_COLUMNS` (2) columns are visible at once.
- Two column selectors at the top choose which pair is shown ("Material 100 · Steel bar" with "Material 205 · Steel rod"). With a baseline, it is fixed in the first slot.
- Rows stay rows: the field label above, the two values side by side below.

### 9.4 States inside the panel

| State | Shown |
| --- | --- |
| Loading | Skeleton rows; the toolbar is disabled |
| Some fields restricted | One line under the toolbar: "Some fields aren't shown because of your access." No names, no count |
| No differences | "These records match on every compared field." with a button to show all rows |
| A column unavailable | Its header reads "Record not available"; its cells are blank; its menu offers only Remove |
| All columns but one unavailable | "Only one of these records is available, so there's nothing to compare." with Close |
| Access changed | Section 6 runtime table |

### 9.5 Record sections

In a record's section (for example Quotations under a request for quotation), Compare works the same. The request carries the section's locked parent scope, so records outside that parent are never returned.

**Open point for the C2 build (not assumed here).** A section's list (`related-entity-section.tsx`, `contentOnly` with a `viewNamespace`) shares the page with the detail record, and how it owns URL state today was not confirmed for this revision. The C2 build checks it first. If the section's list owns namespaced URL state, the `compare` keys follow that namespace. If it does not, a comparison opened in a section is not shareable by URL: it opens without URL keys, Escape and Close dismiss it, and the blueprint is amended to say so before the build continues.

### 9.6 Snapshot comparison

Unchanged in C1 (section 11). It keeps its entry point ("Compare selected snapshots"), its two columns and its wording. Moving it onto the N-column table view is a separate, visible change (C1b in section 14).

## 10. Accessibility

- **Table semantics.** The body is a `<table>` with a caption ("Comparison of 3 Materials"), `<th scope="col">` record headers and `<th scope="row">` field labels, so a screen reader announces "Unit of measure, Material 205 · Steel rod, KG" for each cell.
- **Sections** are row groups whose heading row contains a button with `aria-expanded`.
- **Differences and baseline are text.** "Differs", "Same as baseline", "Differs from baseline", "Not compared", "Best" and "Baseline" are visible or visually hidden text, never colour alone. Tones meet contrast on both themes.
- **Differences only** is a labelled switch. Toggling it updates a polite live region with the new summary ("Showing 12 of 40 fields").
- **Keyboard.** Tab reaches the toolbar, then each column menu, then the table. Arrow keys are not hijacked in the table. Escape closes the panel and returns focus to the Compare button (or to the list when opened from the URL).
- **Announcements.** "Baseline set to Material 205", "Baseline cleared", "Material 100 removed from comparison".
- **Narrow selectors** are labelled ("First record shown", "Second record shown").

## 11. The shared comparison core (C1 extraction inventory)

### 11.1 Package

A new runtime package, `@athyper/platform-entity-comparison`, at `packages/platform/entity/runtime/comparison/`. Both `@athyper/platform-entity-form-detail` (snapshots) and `@athyper/platform-entity-list-view` (records) depend on it. It depends only on contracts, `@athyper/platform-i18n` and `@athyper/platform-ui`, never on either consumer.

It cannot live in `list-view`: `form-detail` already depends on `list-view`, so putting the core there would make the snapshot view reach into the list package for a non-list concern and invite a cycle when `list-view` later uses form-detail pieces. It cannot live in `form-detail` for the mirror reason.

### 11.2 What moves, renamed

| From `form-detail/src/activity-comparison-model.ts` | To the comparison package | Change |
| --- | --- | --- |
| `ActivityPresentation` | `ComparisonPresentation` | Same shape (`fields`, `presentation`) |
| `ActivityFieldGroup` | `ComparisonFieldGroup` | Same shape |
| `groupActivityFields` | `groupComparisonFields` | Generic over any row with a `key`; behaviour unchanged (sections in tab order, then remaining sections, then "additional") |
| `formatActivityValue` | `formatComparisonValue` | Takes a `ComparisonCell` (section 5.5). Its two state messages become parameters, so the snapshot adapter passes its current wording |
| — | `ComparisonCell`, `ComparisonColumn`, `ComparisonRow`, `ComparisonOutcome` | New types (section 5.5) |
| — | `compareCells`, `rowOutcome`, `relativeToBaseline`, `bestColumns` | New: section 8 rules, with tests |

### 11.3 What stays snapshot-side

| Stays in `form-detail` | Why |
| --- | --- |
| `comparable`, `changed` | Directional; they read the server's `before`, `after` and `changed` |
| `activityComparisonRows` (new adapter) | Maps `ActivityComparison` to two `ComparisonColumn`s and `ComparisonRow`s, passing the server's `changed` as the outcome |
| Snapshot titles, `ActivityCollectionSection` | Snapshot-specific presentation and collections |
| The current `<details>` / `<dl>` markup of `activity-comparison.tsx` | Kept in C1 so its rendering is unchanged; replaced only by C1b |

### 11.4 Proof of no visible change

C1 is done in three commits:

1. Add a jsdom rendering test of `ActivityComparison` against a fixture: grouped sections, tab labels, differences-only on and off, an uncaptured cell, an empty cell, choice labels, a decimal, a date, the limited-section note. Run it and `entity-activity.spec.ts`.
2. Extract the core and add the adapter.
3. Show both tests passing unchanged. The rendering test's assertions are not edited in commit 2 or 3.

## 12. Studio authoring and registration inventory

The comparison declaration is authored on the list surface in the existing Entity composer, after the metadata cleanup: *Experience › surface tree › List surface › Compare*. Every property has a database location, a typed API, a save and load mapping, validation (section 6) and a compiler mapping, per the Entity Studio blueprint.

**Proposed storage (decision 6):**

| Table | Rows | Columns |
| --- | --- | --- |
| `metadata.entity_surface_compare_section` | One per section of a list surface's declaration | standard draft-owned columns; `surface_id` (list surface), `section_key`, `label_id`, `sort_order` |
| `metadata.entity_surface_compare_field` | One per field in a section | standard draft-owned columns; `compare_section_id`, `field_id`, `sort_order`; unique (`surface_id`, `field_id`) across the declaration |
| `metadata.entity_field.compare_better` (C3) | Column on the existing field table | `text`, check `IN ('lower','higher')`, nullable |
| C4 collection rows | Designed with C4 | — |

- The composer's **Start from detail sections** copies the detail surface's field placements into compare rows once, at authoring time, for the author to edit. Nothing at runtime reads detail sections for Compare.
- **Registration inventory:** the same nine steps as Calendar section 10: the Studio dictionary section, contract members, generated output, hand-written guards (section 6 codes), reconciliation, storage and qualification sites, generated types, a forward upgrade, and no change for existing drafts.
- **Studio blueprint.** Added with this approval: the Compare editor row in its section 7.6 table and the two tables in its composer map, both marked proposed (built behind the metadata-cleanup gate). Their field-dictionary entries are written when the storage is built, with the registration inventory above.

## 13. Folder structure and test registration

| Path | Content |
| --- | --- |
| `packages/platform/entity/runtime/comparison/src/` | C1 shared core: model, equality, formatting, grouping; C2 N-column table view |
| `packages/contracts/platform/entity-list/src/compare.ts` | Constants (5.1), `surface.compare` type and parser, URL keys |
| `packages/platform/entity/runtime/form-detail/src/activity-comparison*.ts(x)` | Snapshot adapter and view (C1) |
| `packages/platform/entity/runtime/list-view/src/compare/` | Selection-bar action, panel, URL state wiring (C2) |
| `server/packages/platform/metadata/src/entity-compare-descriptor.ts` (+ test) | Published declaration parsing and section 6 validation |
| `server/packages/services/records/src/list-compare.ts` (+ test) | Per-viewer projection (5.3) |
| `tests/foundation/activity-comparison-view.test.tsx` | C1 rendering test (written first) |
| `tests/foundation/entity-comparison-model.test.ts` | Section 8 rules |
| `tests/foundation-browser/entity-list-compare.spec.ts` | Browser spec on synthetic fixtures |

Styles stay on the breakpoint scale and use design-system tokens.

## 14. Delivery phases and acceptance

| Phase | Delivers | Needs the metadata cleanup? | Acceptance |
| --- | --- | --- | --- |
| **C1** Shared core | Package, extraction, snapshot adapter, rendering test first | No | Section 11.4: rendering test and `entity-activity.spec.ts` pass unchanged; model tests for section 8 rules |
| **C1b** Snapshot on the table view | The snapshot comparison adopts the N-column table view (visible change: table semantics, section 10) | No | Snapshot browser spec updated deliberately; accessibility checks; owner sees the change |
| **C2** Record comparison | `compare` declaration parsing and validation, per-viewer projection, selection-bar action, panel, URL state, baseline, narrow pair picker | **Runtime and tests: no** (synthetic fixtures, as Tree did). **A real Entity: yes** (authoring storage and a pilot's publication) | Fixtures prove: projection lists only readable fields; `fieldsRestricted` without names; masked cells not compared; one request with no excluded parameters; reload from URL; unavailable record column; baseline cleared on removal; decimal and money equality; Back closes; record-section scope kept; no UUID shown anywhere |
| **C3** Best value | `field.compare.better`, best marks, currency rule via `currencyField` | **Runtime on fixtures: no. Authoring: yes**, because `compare_better` is new per-field authoring | Ties, empty cells, mixed currencies, no currency field |
| **C4** Line items | Collection declaration, match-key alignment, the chosen server read | Yes | Its own design and approval first |

**Order of work.** C1, then C2 on fixtures, in parallel with the cleanup. After the cleanup: authoring storage (section 12), then a pilot. **Pilot proposal:** a master-data Entity already onboarded with a readable identity and enough comparable fields; the candidate is chosen with the owner when the cleanup lands. Quotation comparison waits for C3, C4 and the quotation Entities' onboarding.

**Delivery status (9 October 2026).** Implementation only; nothing is published and no Entity declares a comparison.

- **C1, built.** Three steps, as section 11.4 requires:
  1. `ac3ed62ca` pins the snapshot comparison's rendered output in `tests/foundation/activity-comparison-view.test.tsx`: the full rendered outline, grouping, choice labels, decimals, dates, empty and uncaptured cells, the changes-only toggle, collapse, and the no-differences state. Datetimes are pinned in UTC, and the test also passes in another zone.
  2. `dcb3e2fe0` extracts the core into `@athyper/platform-entity-comparison`:
     - `groupComparisonFields` and `formatComparisonValue` (the two state labels are now parameters);
     - the section 5.5 types;
     - the section 8 rules: `equalComparisonValues`, `comparisonRowOutcome` (including the revision 2 money rule) and `comparisonRelativeToBaseline`.

     The snapshot model is now an adapter: `comparable`, `changed` and `activityCell` stay with it, and its wording is unchanged. The core's tests are in `tests/foundation/entity-comparison-model.test.ts`.
  3. This status: the pinned rendering test is unedited since step 1 and passes after the extraction, as does `activity-comparison-model.test.ts`.
- **Not run:** `tests/foundation-browser/entity-activity.spec.ts`. It does not load on this branch ("exports is not defined in ES module scope", from `tooling/scripts/metadata/source-workspace.mjs`), the same pre-existing breakage as `metadata-detail-navigation.spec.ts`. The jsdom rendering test is the evidence for "no visible change".
- **Foundation suite:** 78 files pass and 7 fail. The 7 failures (reference choice policy, Atlas answer and history, related presentation, error boundaries, header context identity, public auth surface) are unrelated to comparison. The related-presentation failure was confirmed to fail with the pre-extraction model as well.
- **Deferred within the inventory:** `bestColumns` (section 11.2) belongs to C3 and is not built until C3 is approved. Boolean values still use the snapshot's `activity.yes` / `activity.no` messages through the core, unchanged; record comparison wording is settled in C2.
- **C2:** not started.

## 15. Decisions (project owner)

All ten were approved on 9 October 2026 (owner wording in the status line). Decision 9 makes C1 and C2 the approved build; C1b, C3 and C4 each need their own approval.

1. **Approved 9 October 2026.** **Placement.** Compare is a selection-bar action opening an in-page panel, not a Layout or a route (section 4).
2. **Approved 9 October 2026.** **Opt-in per list surface.** Absent declaration means Compare is not offered (section 5.2). Same precedent as Board lanes, Calendar and Gantt dates, and Tree hierarchies.
3. **Approved 9 October 2026.** **Caps.** `COMPARE_MAX_RECORDS` = 4, `COMPARE_NARROW_COLUMNS` = 2, `COMPARE_MAX_FIELDS` = 60, as named constants with tests (section 5.1).
4. **Approved 9 October 2026.** **Baseline.** Supported, marked by text, in the URL, cleared explicitly on removal, relative vocabulary (section 8.4).
5. **Approved 9 October 2026.** **C1 may change the snapshot view's code,** on the condition in section 11.4 (rendering test first, passing unchanged). C1b's visible change is a separate approval.
6. **Approved 9 October 2026.** **Authoring storage:** two new tables on the list surface plus one field column for C3 (section 12).
7. **Approved 9 October 2026.** **Restricted-field rule:** omit hidden fields without names or count, with the single `fieldsRestricted` statement (section 5.3).
8. **Approved 9 October 2026.** **Standalone request:** Compare ignores the list's filters and search, keeps scope and work context (section 7.1).
9. **Approved 9 October 2026.** **Phases:** C1 and C2 first; C1b, C3 and C4 each need their own approval.
10. **Approved 9 October 2026.** **AGENTS.md entry** (section 18), added with this approval.

## 16. Rejected and out-of-scope options

| Option | Why not |
| --- | --- |
| Compare as a list Layout | A Layout draws the result set across pages; a comparison is a chosen handful (section 4) |
| A quotation comparison page or app | Bespoke pages are forbidden; each later use case would need its own |
| Comparing list rows in the browser | Rows carry only visible columns; comparison needs declared, authorized detail fields |
| A generic JSON diff | Shows raw values and UUIDs, ignores labels, sections, masking and equality by kind |
| Reusing detail-page sections at runtime | Detail sections hold components and collections that are not comparable; reading them would be inferring a field set. Copying them at authoring time is offered instead |
| Requesting every declared field and letting the server sort it out | The server refuses an unreadable field, failing the whole comparison; the per-viewer projection avoids that |
| **More than four records** (out of scope) | Beyond four, columns become too narrow to read and the narrow pair picker stops scaling. Many records side by side is what Table with chosen columns is for |
| **Comparing records of different Entities** (out of scope), for example a quotation against a purchase order | Needs a declared mapping between two Entities' fields, units and identities, a different contract with its own design |
| A record against its own draft, or a release against a release | Studio territory; not a list action |
| Saving comparisons in saved views | A comparison is of named records, not a view of a query |
| Exporting a comparison | Possible later through the existing data operations; not designed here |

## 17. Review disposition

| Review | Finding | Disposition |
| --- | --- | --- |
| Audit 1 | Verified: the snapshot core is abstractable; only `comparable` and `changed` are snapshot-specific | Section 11.2–11.3 |
| Audit 1 | Verified: the snapshot contract is two-column and directional, so the core needs its own N-column type | Section 5.5; adapter in 11.3 |
| Audit 1 | Verified: `recordIds` is real and bounded (100), bound into the cursor hash, refused with `hierarchy=matches` | Section 3; the standalone request (7.1) avoids both constraints by construction, so Compare is also offered from Tree's search view. The audit proposed excluding the search view; with a standalone request that exclusion is unnecessary, and a test pins the request shape |
| Audit 1, finding 1 | The core cannot live in `list-view`, because `form-detail` depends on it | Accepted: new package (11.1) |
| Audit 1, finding 2 | "Silent field omission": `responseProjection` drops unreadable keys and the 100-field cap gives no error | **Corrected against the code:** `validateQueryFields` refuses an unknown or unreadable requested field (`PROJECTION_FIELD_NOT_ALLOWED`) and more than 100 (`TOO_MANY_PROJECTION_FIELDS`), and the route schema refuses more than `MAX_LIST_FIELDS` (`INVALID_FIELDS`). The filtering in `responseProjection` runs after validation. The underlying concern stands in a different form: one unreadable field would fail the whole comparison, and a viewer must not learn restricted field names. Resolved by the per-viewer projection (5.3), publication validation (6) and the `fieldsRestricted` statement |
| Audit 1, finding 3 | Passing `fields` keeps the identity but adds the group field; no other field is kept | Accepted: the request asks for its title and currency fields explicitly and never sends `group` (7.1); the storage-identity fallback is used only as a key (7.3) |
| Audit 1, finding 4 | C3's best value is new authored metadata | Accepted: `field.compare.better` with storage `entity_field.compare_better`; the phase table marks C3's authoring as needing the cleanup (14) |
| Audit 1, finding 5 | Reuse `field.list.currencyField` for the currency rule | Accepted: sections 5.6 and 8.2 |
| Audit 1, finding 6 | Cursor binding and `hierarchy=matches` refusal | Accepted as constraints; handled by the standalone request (7.1) |
| Audit 1 | The view has no rendering test, so "no visible change" is unfalsifiable | **Partly corrected:** `entity-activity.spec.ts` exercises the comparison in the browser ("comparison expansion"), but nothing pins its rendered output. Accepted: rendering test first (11.4) |
| Audit 1 | Decisions 1–4 (opt-in, caps, baseline, C1) | Recorded as recommendations in section 15, decisions 2–5 |
| Audit 1 | Blueprint contents (extraction inventory, property, placement, URL, caps and omission rule, cell vocabulary, line-item omissions, match-key identity domain, accessibility, phase gates) | Sections 5–14 |
| Audit 1 | AGENTS.md entry under the Entity list rules, with opt-in and no-position rules | Section 18 |
| Audit 1 | Record more than four records and cross-entity comparison as out of scope | Section 16 |
| Audit 2 | Confirms both corrections to audit 1: the server refuses unreadable and excess fields rather than dropping them, so the real risk is one unreadable field failing the whole comparison; the browser spec exercises the snapshot flow but nothing pins its rendered output. Confirms Compare stays available from Tree's search view, because the Compare request carries no `hierarchy` | Section 5.3 now states that the per-viewer projection is load-bearing; section 3 and 11.4 unchanged |
| Audit 2, finding 1 | `masked` needs a named source: it is a property of the authorization field policy, not of the field descriptor; cite the existing prohibition on masked fields in queries | Specification clarification (owner's wording): sections 3 and 5.3 name `EntityFieldPolicyV1.representation` through `maskedPresentationField` as the single source, and cite `entity-authorization.ts:250` |
| Audit 2, finding 2 | A masked currency field could produce a false "same" for money | Folded into section 8.2 (owner's wording): money is compared only when every currency cell is an equal `value` cell; masked, unreadable, undeclared, empty or unavailable currency makes the row `not_comparable` ("Currency not compared"). Section 5.6 (C3 ranking) follows the same rule |
| Audit 2, finding 3 | 60 is an unverified budget | Folded into section 5.1 (owner's wording): the binding constraint is stated, and 60 is measured against the candidate tables (section 3; widest is `gl_account` at 26 columns) |
| Audit 2 | Record-section URL ownership may not exist (`contentOnly`, `scopeCoordinate`, `viewNamespace`, no `embedding`) | Already the first check of C2 (section 9.5), with the caveat to be written there if the section list owns no location state |

## 18. AGENTS.md entry

Added under the Entity list rules with the approval (decision 10):

> **Entity list Compare**
>
> - The active design is the [Entity list Compare blueprint](docs/blueprints/entity-list-compare/blueprint.md). Read it before implementing record comparison or changing the shared comparison core, and update it in place. Implement only phases the project owner has approved.
> - Compare is a selection action of the shared Entity list, offered only when the list surface declares a comparison in governed, published Meta Entity properties. Do not infer a comparison field set, and do not create a comparison route, page, provider stack or entity-specific comparison.
> - Never align related records by array position. Line comparison requires a declared match key backed by a database unique key.
> - The snapshot comparison and record comparison share one core package; fix comparison rules there, not in a consumer.
