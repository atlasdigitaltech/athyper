# Entity list Compare — blueprint

**Status:** approved, revision 6 (10 October 2026). Revision 5 sets C4's design (sections 5.8 and 5.9). Revision 6 records the build authority and the build-time specifics (section 5.8, point 10a).

- **Matrix drill-down (10 October 2026).** The Matrix Layout's "Compare selected" opens this panel unchanged, on the column Entity's own descriptor and `compare` declaration (Matrix blueprint 5.4 point 6 and 5.6 point 10). No comparison rule changed.

- **Origin.** The project owner asked to explore a Comparison view while the metadata cleanup is in progress: "current we have this view in Audit Log Snapshot...to compare the version... can we make this as generic to compare records in list view .. in future we can extend the same for quotation comparison, material master, Price Catalog List comparison".
- **Review so far.** A first recommendation (Compare as a selection action, not a Layout) was audited against the code; revision 1 was then audited again. Both audits' findings and their disposition are in section 17. Two statements of the first audit were corrected against the code, and the second audit confirmed both corrections.
- **Approval (9 October 2026).** The project owner (nchandravel-atlas) approved decisions 15.1 through 15.10 in these words: "APPROVED 15.1 through 15.10 as written with finding 2 folded into 8.2 and finding 3 into 5.1, and to note finding 1 as a specification clarification APPROVED". Revision 2 makes exactly those changes:
  - **Finding 2,** folded into section 8.2: money is compared only when its currency cells are comparable values and equal; a masked, absent or unreadable currency makes the row `not_comparable` ("Currency not compared").
  - **Finding 3,** folded into section 5.1: the binding constraint is stated, and 60 is recorded as a measured budget against the candidate tables (section 3).
  - **Finding 1,** a specification clarification in section 5.3 and section 3: the masked signal's source is the authorization field policy, through the existing `maskedPresentationField`, and the existing prohibition on masked fields in queries is cited.
- **Approved for build (implementation authority):** C1 and C2 (decision 9). C1b, C3 and C4 each need their own approval. C2 runs on synthetic fixtures until the metadata cleanup lands; publishing a real Entity's comparison waits for the authoring storage (section 12) and a pilot.
- **Revision 3 approval (10 October 2026).** After the third audit, the project owner approved decisions 11–17 in these words: "Proposals 11–17 are technically sound and approved by owner", with these conditions, each written in below:
  - "approved 11 as written; add the assertion that a not_captured row is still not_comparable, so C1's behaviour is pinned as unchanged." The assertion is in `tests/foundation/entity-comparison-model.test.ts`; decision 11 is built (section 8.3).
  - "approved 12, 14, 15 as written."
  - "approved 13 with finding 4's fact recorded in section 3, so the C2 build does not spend time discovering that the label service cannot answer." Recorded in section 3 and section 8.6.
  - "approved 16 with finding 1 resolved: decide whether absent is a line-level state or an extended cell state, and say whether C4 reuses comparisonRowOutcome." Resolved in sections 5.7 and 8.1: `absent` is a line-level state, and C4 wraps `comparisonRowOutcome` unchanged.
  - "approved 17 as written; it is the one amendment that changes already-shipped snapshot behaviour, and its proof (the rendering test updated deliberately, in its own commit, with the new output reviewed) is the right control."
- **Revision 3, as proposed (10 October 2026).** These come from the owner's review of the Neon Compare Prototype (`docs/prototypes/Neon Compare Prototype.html`) and a check of the shipped snapshot comparison against the code. The owner asked for them to be written up for audit: "write them into the blueprint as revision 3 for audit". Each amendment is marked "Proposed, revision 3" where it changes a section, and listed as decisions 11–17 in section 15:
  1. Row outcomes leave out a whole unavailable column (8.3), so one missing record no longer turns every row into "Not compared".
  2. A comparison section may be collapsed by default (5.2, 12).
  3. Two different referenced records with the same label are told apart by a readable code, never an identifier (8.6).
  4. Differing words in long text are highlighted against the baseline (8.7).
  5. C3 adds authored summary chips for best values (5.6, 8.5).
  6. C4 adds the "Not in this record" and "Not in baseline" states and match-key line labels (5.7, 8.1).
  7. C1b moves the snapshot onto the shared table view with the earlier snapshot as a fixed baseline, and removes identifiers from snapshot comparisons (9.6, 11.3).

  Revision 3 also records presentation details from the prototype that fit inside the approved C2 contract and need no new metadata (9.2): previous and next difference, the summary line, the per-column baseline counts and the status chip in column headers.
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
| **The shipped snapshot comparison can show identifiers** (revision 3 finding, from the code; not reproduced on a live page) | The server builds snapshot fields from every readable field (`readableRecordFields` in `server/packages/services/records/src/record-read-access.ts`, used by `activity-provider.ts:66` and `:155`), without leaving out the storage identity, the version field or UUID-typed fields. The browser formats a captured reference as its stored value ("references retain captured identity", `formatComparisonValue`), and neither `activity-workspace.tsx` nor `activity-comparison.tsx` filters identifiers. `activity-comparison-model.test.ts` groups `id` into "Additional fields" | C1b removes identifiers from snapshot comparisons (section 9.6, decision 17) |
| The reference label service returns labels only (audit 3, finding 4) | `EntityReferencePage.options` is `{ value, label, recordId, entityCode }` (`server/packages/services/records/src/entity-reference-reader.ts:28–33`), and the reader's output is `{ displayValues, references }` (`:277`). There is no readable code or business identity in the contract | Decision 13 ships "Different record". Carrying a readable identity would widen a shared reference contract and needs its own approval; it is not a C2 detail (section 8.6) |
| The list descriptor declares the status field explicitly (audit 3, finding 3) | `storage.statusField` on the runtime descriptor (`server/packages/contracts/metadata/src/descriptors.ts:468`); tones are per field (`ListFieldDescriptorV1.statusTones`) | The column-header status chip uses `storage.statusField`, never a field found by name or by having tones (section 9.2) |
| One unavailable record would blank a comparison (revision 3 finding) | Section 8.3 as approved, implemented by `comparisonRowOutcome` in C1: any `unavailable` cell makes the row `not_comparable` | With three records of which one was deleted, every row would read "Not compared". Decision 11 amends section 8.3 |
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
    collapsed?: true;            // revision 3, proposed: the section starts collapsed
  }[];                           // 1–12 sections
};
```

**Revision 3 (approved 10 October 2026):** a section may declare `collapsed: true`, so it starts collapsed, for example an audit section ("Record details": created and updated). The author decides; the framework never guesses that a section is "technical" from its key or its fields. The viewer's own collapse and expand choices still apply for the life of the panel. A collapsed section still counts its differences in its heading and in the summary line, so a difference is never hidden without a trace.

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
      /** Money: that currency field is masked for this viewer (the revision 2
       * "own masked flag"), so amounts are not compared. */
      currencyMasked?: true;
    }[];
  }[];                                 // sections left with no readable field are dropped
  /** Some declared fields are not shown to this viewer. No names, no count. */
  fieldsRestricted?: true;
  /** Revision 3 (section 9.2): storage.statusField, only when it is declared,
   * readable for this viewer and among the comparison's fields. */
  statusField?: string;
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

**Revision 3 (approved 10 October 2026):** summary chips for best values.

```ts
compare?: { better: "lower" | "higher"; summaryLabel?: string };   // summaryLabel: a published, localizable label
```

- A field with `better` may declare `summaryLabel` ("Lowest total price"). For each such field with a best value, the panel shows one chip above the table: "Lowest total price: Q-1003 · MYR 1,192,300.00".
- Ties show every tied record ("Q-1001, Q-1004 · 30 Nov 2026"), marked "(tie)". A row with mixed currencies, no comparable values, or every value equal shows no chip.
- At most six chips, in declaration order. The chips summarise row marks that are already in the table: they add no information that the table does not also show, so they are not needed to read the comparison.
- `summaryLabel` without `better` is refused at publication (`COMPARE_SUMMARY_WITHOUT_BETTER`).

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
- **Revision 3 (approved 10 October 2026):** two line-cell states and line labels:
  - **"Not in this record"** (`absent`): the line's match key does not occur in this column's record.
  - **"Not in baseline"**: with a baseline, a line present in this column but absent from the baseline. A line absent from this column but present in the baseline reads "Differs from baseline", because the record lacks something the baseline has.
  - A line's row is labelled by the line's own readable label from the first record that has it, with the match key's published label as the group heading ("Material"). When a line compares several fields, each field is a sub-row under that label.
  - **Line outcome (decision 16, resolving audit 3 finding 1).** C4 owns one small wrapper in the shared core, `comparisonLineOutcome`. It takes the line cells (`absent` or a `ComparisonCell`) for every column:
    - when the line is absent from any available column, the line `differs`;
    - otherwise it calls `comparisonRowOutcome` **unchanged** on the present cells.

    Relative to a baseline, it gives "Same as baseline" when both are absent, "Not in baseline" when only the baseline is absent, and "Differs from baseline" when only this column is absent; otherwise it calls `comparisonRelativeToBaseline` unchanged. `comparisonRowOutcome` never sees `absent`.
  - Counts read "6 of 8 lines differ", next to the field summary.
- **Server contract.** The list response carries no child collections. C4 needs either one record-scoped list request per compared record (at most four, each under the section's locked scope) or a new bounded collection read. Choosing between them is part of C4's own design (section 5.8).

### 5.8 C4 design (revision 5, approved direction 10 October 2026)

**Approval.** The owner reviewed revision 4, the RFP worked example (section 5.9), the reference screenshot of a bid-award grid and audit 7. The owner approved the five recommendations of that review in these words: "totally agreeed". The five were:
1. Matrix as a new list Layout with its own blueprint ([Entity list Matrix blueprint](../entity-list-matrix/blueprint.md)), not a stretched Compare.
2. A server-side rank capability.
3. Ranking only on a declared evaluation amount.
4. The pilot sequence (point 10 below).
5. This revision 5, with the audit 7 corrections.

Revision 5 replaces revision 4's decisions 18–22 with decisions 23–30 (section 15). The owner asked for the C4 view to be prototyped next ("prepare two view"). The prototype is `docs/prototypes/Neon Bid Evaluation Prototype.html`. **Build authority (10 October 2026):** after the revised prototype (`docs/prototypes/Neon Matrix Prototype.html`), the owner instructed: "Go ahead with the build ... build based on revised prototype with your recommendation".

**Facts it relies on** (verified in the code and the Neon DDL on 10 October 2026):
- **Existing related-record path.** Record sections read related lines through the existing list operation with a parent scope coordinate (`parentEntityCode`, `parentRecordId`, `relationshipKey`, `parentDescriptorHash`). The server resolves and authorizes it on every request (`resolveCollectionScope`).
- **Relationship metadata.** Relationships are published on the parent's record presentation (`entityRelationships`: `key`, `targetEntity`, `cardinality`, field mappings, `readOperation`).
- **Limits.** `MAX_LIST_PAGE_SIZE` and `recordIds` are both 100. The `in` filter has no published value limit today (`filter-value-validation.ts` checks only that the array is non-empty and scalar).
- **Selection in record sections.** Record sections offer selection and the selection bar (selection is enabled for every list that is not a picker). Not checked in a browser.
- **Procurement tables that exist:**
  - `document.sourcing_event` is the RFP header.
  - `document.sourcing_event_demand` is the RFP's item list, unique per event (`sourcing_event_demand_uq`).
  - `document.sourcing_event_award` is unique per (event, business partner).
  - `document.sourcing_event_award_allocation` is unique per (award, demand, company code).
- **Procurement tables that do not exist:** the supplier response header, response lines (price per demand line), questions and answers.
- **Not suitable as a comparison key.** `document.purchase_requisition_line` is unique per (requisition, `line_no`) and its `item_id` is not unique. Requisition line numbers are not comparable across requisitions.
- **Not competing quotations.** `document.sourcing_event_company` holds the participating buyer company codes.

**1. Two collection modes, declared in metadata.**

```ts
collections?: readonly {                // 0–2 per comparison
  key: string;
  label: string;
  relationship: string;                 // published entityRelationships key, cardinality "many"
  matchKey: readonly string[];          // 1–2 line fields
  fields: readonly string[];            // 1–12 line fields
  master?: {                            // master-list mode
    entity: string;                     // the Entity the match key references (e.g. sourcing_event_demand)
    parentField: string;                // the master's reference to the compared records' common parent
  };
  absentLabel?: string;                 // authored wording for a missing line, e.g. "Not quoted"
}[];
```

- **Master-list mode** (large, shared item list; an RFP's 2,000 items). The first match-key field references the master Entity. The compared records must share one parent: Compare is opened from that parent's record section, whose locked scope fixes it. Otherwise the collection is unavailable: "Line items compare within one {parent}" (`COMPARE_MASTER_SCOPE_UNBOUND`).
- **Small mode** (no master; a record's few addresses). All lines of each compared record are read, up to 500 (five pages of 100), and aligned in the browser. More than 500 in any record fails closed with "Too many lines to compare: {record} has more than 500".

**2. Paging in master-list mode.**
- **Each page:**
  1. One request for a page of the master list (50 rows): the existing list operation on the master Entity, scoped to the common parent and sorted by its published order.
  2. One request per available compared record: the line Entity filtered by `matchKey in (the page's 50 master ids)`, under that record's parent scope coordinate, with the match key plus the compared fields, `limit` 100 and `countMode` none.
- **Budget:** 1 + N (N ≤ 4) requests per page, whatever the RFP's size. Once per opening there is also the line Entity's list descriptor, and the coverage counts in point 6.

**3. When absence means "not quoted"** (audit 7, with the corrections recorded in section 17). A master row with no line in a record's response is absent, shown with `absentLabel` or "Not in this record", only when all of these hold:
- the line request carries no filter other than the match key and the parent scope (narrowing is applied to the master list only, never to lines);
- the response is complete: `hasNext` false and at most one line per master row (the runtime duplicate refusal, point 5);
- the line Entity's read access follows its parent's access.

  A line Entity that publishes its own record-level read policy (owner access, record predicates or field-row policies independent of the parent) is refused at publication with `COMPARE_LINE_ACCESS_INDEPENDENT`. A hidden line would otherwise read as "Not quoted". An unavailable compared record keeps the existing unavailable-column rule and is never shown as absent.

  **Shared with the Matrix Layout** (audit 8): an incomplete or overfull response (`hasNext`, or two lines for one key) is never drawn with the absence label. The page shows "This page couldn't be read completely" with a retry. The [Entity list Matrix blueprint](../entity-list-matrix/blueprint.md) section 7 applies the same rule to its cell blocks.

**4. Narrowing first, paging second.**
- The panel opens the collection collapsed, with its counts. Expanded, it offers the master list's own published search and filters (for example item category), and **pinned items**: master rows the user picks, kept in the URL as `compareItems`.
- These are server-side filters on the master list, so "steel products only" narrows 2,000 items to 140 before any line is read.
- **"Differences only"** applies to line rows within the loaded pages and is worded for what is loaded: "3 items differ among items 1–150". No server-side differences count is built.
- **"Not quoted by at least one" is not a list filter today.** List filters act on an Entity's own fields, and this is an existence test against another Entity. It needs either a new framework existence filter or a maintained count on the master row. Recorded as a later decision, not part of C4.

**Key coverage is the same rule as the Matrix's** ([Entity list Matrix blueprint](../entity-list-matrix/blueprint.md) section 2.1), so it has one home. A line Entity's unique key may hold extra dimensions beyond the parent and the match key's first field, for example the company code in `sourcing_event_award_allocation_uq`. They are covered by including them in `matchKey`, which allows two fields, or by the read scope pinning them to one value at request time.

**5. Keys and duplicates.**
- In master-list mode, the match key's first field must be a reference to the master Entity (`COMPARE_MATCH_KEY_NOT_SHARED` otherwise). In small mode it must be a reference or a declared business code, never a per-parent sequence such as a line number.
- Uniqueness per parent is checked against the DDL by `compareMatchKeyFinding`, wired into the onboarding DDL rehearsal after the metadata cleanup.
- The runtime still refuses a page in which one record holds two lines for the same key: "Lines can't be aligned: {item} repeats in {record}". A duplicate would otherwise double a price.

**6. Coverage in column headers.** "1,946 of 2,000 items quoted" comes from two exact counts, shown only when both Entities publish exact counts (foundation section 5): the master list's total under the parent, and each record's line count. It is never computed from loaded pages.

**7. Best value on lines (replaces revision 4's deferral).**
- The per-viewer list field descriptor gains an optional `compare { better, summaryLabel? }`, carried from the line Entity's `field.compare` (C3). This is a contract widening of `ListFieldDescriptorV1`.
- **Unit rule, aligned with the Matrix (audit 8, finding 3):**
  - When the line measure has a declared evaluation amount (already normalized for unit and currency), best value is computed on that amount. `compare.unitField` then gates only the **display**: a line whose unit differs shows "Units differ" in place of a best mark, while still counting in the comparison.
  - Without an evaluation amount, a unit difference ranks nothing on that line.
- Money follows the currency rule (section 8.2). Ranking across currencies is allowed only on a declared evaluation-amount field (owner's decision 3), never converted in the browser.

**8. The `in` filter limit.** `MAX_LIST_FILTER_VALUES` = 100 is published in the shared list contract and enforced by the server (`INVALID_FILTER`). It lands with C4.

**9. Outcomes and baseline.** `comparisonLineOutcome` (decision 16) handles absence and then calls `comparisonRowOutcome` unchanged. Baseline marks follow section 5.7. Line rows are labelled by the master row's readable label (reference labels through the authorized label service, never an identifier).

**10a. Build-time specifics (revision 6).**
- **Server-resolved collections.** The parent's per-viewer projection resolves each collection on the server, inside the existing list-descriptor call: the relationship, the target Entity, and the target's readable fields for this viewer (labels, value kinds, best value, unit field). The browser therefore reads no separate line descriptor.
  - Each projected collection carries `relationshipKey`, `targetEntity`, `parentDescriptorHash` (the parent's compiled hash, which the parent-scope resolver checks), `matchKey` and readable `fields`.
  - When unavailable, it carries a reason instead: `LINE_ACCESS_INDEPENDENT`, `MATCH_KEY_UNAVAILABLE`, `RELATIONSHIP_UNAVAILABLE` or `NO_READABLE_FIELDS`.
- **Line access, from published metadata.** The parent's authorization profile publishes each relationship's `ownership: "inherited" | "independent"`. An `independent` relationship, or a target that declares its own `recordPredicates`, `ownerAccess` or a non-tenant `directoryScope` mode, makes the collection `LINE_ACCESS_INDEPENDENT`: offered without absence claims ("—" instead of "Not quoted"), never as "Not quoted".
- **Compare panel note.** "Best is among the responses you chose; the bid tabulation ranks every visible participant" (Matrix 5.3).

**10. Pilot and prerequisites.**
- **Pilot on existing tables:** compare 2–4 awards of one sourcing event (`sourcing_event_award`) by their allocation lines (`sourcing_event_award_allocation`). The match key is (`sourcing_event_demand_id`, `company_code_id`), and the master list is `sourcing_event_demand` under the event.
- **The RFP case** needs the supplier response, response line (price per demand line, with an evaluation amount), question and answer Entities to be onboarded against `sourcing_event_demand` and the event. That is Entity onboarding, not part of C4.

### 5.9 Worked example: an RFP with 200 suppliers, 2,000 items, 100 questions

| Question the buyer asks | View | Built from |
| --- | --- | --- |
| Who is cheapest on this item, across all 200? | "Bids" section on the RFP item: the response-line list scoped to the item, sorted by evaluation amount, with group totals | Existing list and record sections |
| Which suppliers belong on the shortlist? | The responses list in the RFP: sort, filter, a "Shortlisted" status | Existing list |
| What does the whole field look like, item by item? | Matrix Layout (bid tabulation) on the response lines: items as rows, participants as columns, rank and % above lowest | [Entity list Matrix blueprint](../entity-list-matrix/blueprint.md) |
| How do these 2–4 responses differ in detail? | Compare: header sections, the line items in master-list mode, the answers | This blueprint |

Comparing 200 responses side by side is out of scope by design: side by side reads up to four, and the Matrix and the lists answer the many-way questions.

## 6. Validation, availability and finding codes## 6. Validation, availability and finding codes

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
| `COMPARE_SUMMARY_WITHOUT_BETTER` (C3, revision 3) | `compare.summaryLabel` on a field without `compare.better` |

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

**Line comparison (C4) — a line-level state, not a row-cell state** (decision 16, resolving audit 3 finding 1). `absent` ("Not in this record") is not one of the cell states above, and no root-field row can hold it. It is produced only by C4's line collector, for a line whose match key does not occur in a record (section 5.7). Line outcomes are computed by C4 before any row outcome is asked for, and `comparisonRowOutcome` is reused **unchanged** for the cells that are present (section 5.7).

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
- **Revision 3 (approved 10 October 2026):** a column whose whole record is unavailable (`unavailable` with `record_unavailable`) is **left out** of every row's outcome, instead of making every row `not_comparable`. The outcome is decided over the available columns.
  - Masked and not-captured cells keep the approved rule: they make the row `not_comparable`, because they belong to a record that is present.
  - When fewer than two columns are available, the existing "Only one of these records is available" state applies (section 9.4).
  - The unavailable column still shows "Record not available" in its header (9.4), and its marks relative to the baseline read "Not compared".
  - The summary reads "12 of 40 fields differ across 2 available records", so leaving the column out is visible.
  - **Why.** As approved, with three records of which one has since been deleted, every row reads "Not compared", and the two remaining records cannot be compared at all.
  - **Effect on built code (built 10 October 2026).** `comparisonRowOutcome` leaves `record_unavailable` columns out and returns `not_comparable` when fewer than two columns remain. `comparisonRelativeToBaseline` inherits the rule, because it compares pairs.
  - **Owner's condition.** A test asserts that a snapshot-shaped row with a `not_captured` cell is still `not_comparable`, so C1's snapshot behaviour is pinned as unchanged. The snapshot adapter can produce only `value`, `empty` and `unavailable (not_captured)`, never `record_unavailable` (audit 3). The pinned rendering test passes unedited.
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
- **Revision 3 (approved 10 October 2026):** the summary chips of section 5.6 are drawn from these marks.

### 8.6 Same label, different record (revision 3, approved)

- When a reference row `differs` and two or more of its cells show **the same label for different records** (the prototype's material group "Steel" for two different groups), each such cell also shows the referenced record's **published readable identity** (its list identity field, for example the group code "MG-77"), in a secondary style.
- The identity comes through the authorized reference label service, like the label itself. If that service cannot return a readable identity for the target Entity, the cell shows the text **"Different record"** instead.
- **Never an identifier.** The prototype prints the reference's identifier here. In production that would be a UUID, which this rule forbids.
- **Shipped behaviour: "Different record"** (decision 13, with audit 3 finding 4 recorded in section 3). The reference label service returns labels only, so the readable-identity variant is not available today, and the C2 build does not try to discover it. Widening the service to carry a readable identity is a new contract on a shared reference path and needs its own approval. Until then, every same-label pair of different records reads "Different record". Showing an identifier stays rejected (section 16).

### 8.7 Highlighting differing words (revision 3, approved)

- For **`text`** fields only (long text, not `string`), with a baseline set, each non-baseline cell that differs from the baseline highlights the words not in the baseline's value.
  - The highlight carries visually hidden text "(differs from baseline)", so the difference is announced, not only coloured.
  - It is computed as a word-level longest common subsequence in the browser, over values already loaded, so it sends no request.
- **Bounds.** Above 400 words in either value, the cell is marked "Differs from baseline" without word highlighting, so a long clause never stalls the panel.
- **Controls.** A switch, "Highlight differing words", is on by default when the comparison includes a `text` field and a baseline is set. It is not offered otherwise.
- **Why no metadata property.** The behaviour follows from the published value kind, as date and number formatting do, and asks for no authored field set. A per-field property would add authoring with no decision in it.
- Never applied to masked, not-captured or unavailable cells.

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
- **Within the approved C2 contract, recorded in revision 3 from the prototype** (presentation only; no new metadata):
  - **Previous / Next difference.** Moves focus to the previous or next differing row's header, opening its section if collapsed, and announces "Difference 3 of 15: Payment terms". At the ends it stops and announces "First difference" or "Last difference".
  - **Summary line.** "15 of 19 fields differ · 1 not compared", plus "· 6 of 8 lines differ" with C4.
  - **Baseline counts.** Each non-baseline column header reads "3 differ from baseline", repeated as a chip above the table ("C-1004 v3 · 3 of 18 differ from baseline").
  - **Status chip (clarified by audit 3, finding 3).** Each column header shows the value of the descriptor's declared status field, **`storage.statusField`**, with that field's own `statusTones`, the same chip as the list. The panel never discovers the status field by its name or by which field happens to have tones; that would be inference. The chip is omitted, not substituted, when:
    - the Entity declares no `storage.statusField`;
    - the field is not readable for the viewer;
    - the field is not among the comparison's declared fields.

    The per-viewer projection (section 5.3) carries `statusField` only when all three hold. There is no Compare-specific status property.
  - **Section headings.** "3 differ" and "1 not compared", and "No differences in this section." when a section has none.
  - **Formatting by kind.** Money is shown with its currency, dates and datetimes in the viewer's zone, choice and reference labels. A field with a published renderer (`rendererKey`, for example the address-format tokens) uses that renderer, never a Compare-specific format.

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

**Open point for the C2 build: answered from the code (10 October 2026).**
- **What the code does.** A section's list (`related-entity-section.tsx`) is rendered with `contentOnly` and a `viewNamespace`, but without `embedding`. The list runtime writes the window location for every list without `embedding` (`update` and the descriptor load in `list-view/src/index.tsx`). So a section's list already owns the page's location, unnamespaced (`viewNamespace` namespaces saved views, not URL keys).
- **What Compare does.** The comparison is location state (section 5.4), so in a record section it follows the same existing ownership: its keys go into the page URL like the section list's other state. A comparison opened in a section is therefore shareable by URL. It adds no namespacing of its own.
- **Pre-existing behaviour, recorded rather than changed.** Two lists on one page would write the same URL keys. That predates Compare, applies to every list key (filters, sort, view), and is not changed here. Not yet verified in a browser on a real record page.

### 9.6 Snapshot comparison

Unchanged in C1 (section 11). It keeps its entry point ("Compare selected snapshots"), its two columns and its wording. Moving it onto the N-column table view is a separate, visible change (C1b in section 14).

**Revision 3 (approved 10 October 2026):** C1b scope.
- **Table view.** The snapshot comparison uses the shared table view (sections 9.2 and 10): sections, counts, "Not compared" group, previous and next difference.
- **Fixed baseline.** The earlier snapshot is the baseline, fixed: the server already orders the pair by snapshot sequence, so the column menus do not offer "Set as baseline". The wording is relative: "Differs from the earlier snapshot", never "changed".
- **Column headers.** "Snapshot 1 · Baseline · Earlier snapshot", the capture time, and "captured by" the capturing person's published name. Never a principal identifier.
- **No identifiers (the section 3 finding).**
  - The server leaves the storage identity, the version field and UUID-typed fields out of snapshot comparisons.
  - A captured reference is compared by its stored identity but displayed as **"Linked record"**, with its "Same" or "Differs from the earlier snapshot" mark.
  - It is never resolved against today's label: the snapshot records what was true then, and today's label could be wrong for it.
- **Values formatted by kind** (section 9.2), replacing today's raw strings for decimals.
- **Proof.** The pinned rendering test is deliberately updated in C1b, in its own commit, with the new expected output reviewed. This is the visible change C1b exists for.

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
| The current `<details>` / `<dl>` markup of `activity-comparison.tsx` | Kept in C1 so its rendering is unchanged; replaced only by C1b (revision 3 scope in section 9.6) |

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
| `metadata.entity_surface_compare_section` | One per section of a list surface's declaration | standard draft-owned columns; `surface_id` (list surface), `section_key`, `label_id`, `sort_order`; revision 3 adds `collapsed boolean NOT NULL DEFAULT false` (decision 12) |
| `metadata.entity_surface_compare_field` | One per field in a section | standard draft-owned columns; `compare_section_id`, `field_id`, `sort_order`; unique (`surface_id`, `field_id`) across the declaration |
| `metadata.entity_field.compare_better` (C3) | Column on the existing field table | `text`, check `IN ('lower','higher')`, nullable |
| `metadata.entity_field.compare_summary_label_id` (C3, revision 3) | Column on the existing field table | nullable reference to `entity_label`; check: null unless `compare_better` is set |
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
| **C1b** Snapshot on the table view | The snapshot comparison adopts the N-column table view (visible change: table semantics, section 10); with decision 17: fixed earlier-snapshot baseline and no identifiers (section 9.6) | No | Snapshot browser spec updated deliberately; accessibility checks; owner sees the change |
| **C2** Record comparison | `compare` declaration parsing and validation, per-viewer projection, selection-bar action, panel, URL state, baseline, narrow pair picker; the section 9.2 presentation recorded in revision 3. If approved: the unavailable-column rule (decision 11), `collapsed` sections (12), the same-label marker (13) and word highlighting (14) | **Runtime and tests: no** (synthetic fixtures, as Tree did). **A real Entity: yes** (authoring storage and a pilot's publication) | Fixtures prove: projection lists only readable fields; `fieldsRestricted` without names; masked cells not compared; one request with no excluded parameters; reload from URL; unavailable record column; baseline cleared on removal; decimal and money equality; Back closes; record-section scope kept; no UUID shown anywhere |
| **C3** Best value | `field.compare.better`, best marks, currency rule via `currencyField`; with decision 15: `summaryLabel` chips | **Runtime on fixtures: no. Authoring: yes**, because `compare_better` is new per-field authoring | Ties, empty cells, mixed currencies, no currency field |
| **C4** Line items | Collection declaration, match-key alignment, the chosen server read; with decision 16: the `absent` and "Not in baseline" states | Yes | Its own design and approval first |

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
- **Decision 11, built (10 October 2026):** `comparisonRowOutcome` leaves whole-record-unavailable columns out, with tests including the owner's not-captured assertion. All three comparison test files pass: the core 7/7, the pinned rendering test 3/3 unedited, and the snapshot model 4/4.
- **C2, built (10 October 2026), verified on synthetic fixtures, nothing published:**
  - **Server and contract (`88f6f2dff`):**
    - `listPresentation.compare` is parsed and validated at publication with the section 6 codes; the request limit counts the identity, title and currency fields.
    - The per-viewer `surface.compare` projection (`list-compare.ts`) lists only readable fields, drops hidden ones without names or a count (`fieldsRestricted`), and marks masked fields and masked currencies from the authorization field policy. It names `storage.statusField` only when that field is readable, unmasked and compared.
    - The browser contract adds the `COMPARE_*` bounds, `parseListCompare` and the URL keys.
    - Tests: metadata 224, records 633, contracts 4 and 27 pass.
  - **Browser:**
    - The comparison is location state (`ListLocationStateV1.compare`, never saved), so list state changes keep it in the URL.
    - The selection-bar Compare action is disabled with its reason for 1 or more than 4 records, or "all matching". Opening pushes one history entry, and Close goes back through it.
    - The panel (`list-view/src/compare/`) sends one standalone request (record IDs and fields only, `countMode` none) and renders through the shared `ComparisonTable` (`platform-entity-comparison`). It covers:
      - differences only and the summary line;
      - previous and next difference with focus and announcement;
      - collapsed sections;
      - baseline set, clear and removal without promotion, with per-column counts;
      - the status chip from `storage.statusField`;
      - "Different record" (decision 13);
      - word highlighting for `text` fields (decision 14);
      - the narrow pair picker with the baseline fixed first;
      - the restricted, loading, access-changed, failed, only-one-available and invalid-URL states.
    - Messages are in English, Malay and Arabic.
  - **Tests:** `tests/foundation/entity-list-compare.test.tsx`, 8 of 8, covering:
    - the request shape (no cursor, hierarchy, group, search, filter, sort or standard view);
    - the section 8 rules on cells, including a masked currency and an unavailable record;
    - no record identifier rendered;
    - baseline and removal, and next difference;
    - the access, failure and only-one states, and the narrow pair;
    - through the real list runtime: the selection-bar reason, column order by selection, one request without a list refetch, Close going back, and reopening from a shared URL with its baseline.
  - **Foundation suite:** 79 files pass and 7 fail. The same 7 failed before C2, unrelated.
  - **Not done:**
    - no browser spec, and no check in a real browser;
    - no real Entity declares a comparison (that needs the authoring storage in section 12 and a pilot);
    - Studio authoring storage is not built.
- **C2 review fixes (`3bcb4ca22`, audit 4):**
  1. Whether Close goes back is now decided by a marker in the history entry pushed to open the comparison. Other pushes strip it and replaces keep it, so Back, navigation or a comparison opened from a link never make Close pop an entry it did not create. A test covers browser Back followed by a link-opened comparison closing in place.
  2. A declared currency field the viewer cannot read now sets `fieldsRestricted`, so "Currency not compared" is explained.
  3. The narrow pair returns to the first two columns when the compared set or the baseline changes.
- **C1b, built (10 October 2026).** Owner approval: "C1b approved for build...", after audit 4.
  - `a474ddab4`, the implementation:
    - the snapshot comparison renders through the shared `ComparisonTable`: sections with counts, the "Not compared" group, differences only with a summary, previous and next difference, collapse and expand;
    - the earlier snapshot is the fixed baseline, with no column menu;
    - marks read "Same as / Differs from the earlier snapshot";
    - the server leaves the storage identity, the version field and UUID-typed fields out of snapshot comparisons, and marks captured references (`ActivityComparisonField.reference`), shown as "Linked record";
    - exact decimals are formatted by kind;
    - the provider test proves the exclusions and the reference mark (17 of 17).
  - `598591107` updates the pinned rendering test deliberately, in its own commit, with the new output reviewed. It asserts that no record identifier appears in the markup and that the difference wording never says "changed", and it passes in UTC and Asia/Kuala_Lumpur.
  - **One deviation from section 9.6, recorded here:** the headers do not say "captured by". The snapshot contract's `capturedBy` is the capturing principal's identifier (`snapshot.*.captured_by` is a UUID), and no published name is available, so the approved rule ("never a principal identifier") leaves it out. Showing a name needs an actor-label contract on the snapshot read, which is a separate decision.
- **Identifier follow-up (`82296f274`). Provenance (corrected after audit 6): built before the project owner had approved this scope.** The owner's message said "review audit comments"; audit 5 judged the scope technically sound and recommended approving it, but a technical judgment is not an approval. The author should have asked and waited. Nothing was reverted, and the audit had no objection to the outcome.
  - One rule, `technicalFieldKeys` (server metadata contract), now decides which fields are technical identities. It is used by Compare publication validation, the per-viewer projection and the activity provider (audit 5's consolidation).
  - The single-snapshot view applies the same exclusions, because they are applied in the provider's `load`, and shows captured references as "Linked record".
  - The event list (line and table), the versions list and the saved-snapshot list no longer render the acting or capturing principal's identifier. A recorded principal reads "Name not available"; no principal reads "System".
  - Tests: provider 17 of 17 (single snapshot and comparison), `activity-actor.test.tsx` 2 of 2 (no identifier in the event list or its table), metadata 225, records 634.
  - **Deliberate gap, recorded:** "Name not available" stands in for the acting or capturing principal's display name on four surfaces. Resolving that name once on the server, as an authorized label lookup like the reference label service with the raw identity never leaving the server, is the next decision (audit 5). Until it is decided, the gap is intended, not silent.
- **C3, built (`7ca939381`), on synthetic fixtures.** Owner approval: "also c3 and c4 approved".
  - `field.compare { better, summaryLabel? }` is parsed at publication (`COMPARE_BETTER_INELIGIBLE`, `COMPARE_SUMMARY_WITHOUT_BETTER`) and carried by the projection and the browser contract.
  - `comparisonBestColumns` in the shared core:
    - ranks only comparable rows and leaves unavailable columns out;
    - never ranks empty cells, and marks every tie;
    - ranks nothing when all values are equal (a clarification of section 8.5, matching the summary-chip rule in 5.6);
    - ranks no money with more than one currency (row note "Mixed currencies").
  - The panel marks "Best" in text and shows up to six summary chips, with ties named.
  - Tests: core 8, panel and model 10, contract 4, metadata 227, records 635; foundation 80 files pass and the same 7 pre-existing failures.
  - Authoring storage waits for the cleanup.
- **Not verified in a real browser:** C2, C1b, C3 and the identifier follow-up are all synthetic-only so far. Their evidence is the test suites above.
- **Identifier exposures found next to C1b (since fixed by the follow-up above):**
  - The saved-snapshot list in the activity workspace prints "Captured by: {capturedBy}", which is the principal UUID (`activity-workspace.tsx`, the capture-actor line).
  - The single-snapshot view (one snapshot, not a comparison) still builds its fields from every readable field (`activity-provider.ts` `load`), so the storage identity and UUID-typed fields can appear there.
  - The same exclusions and the same "no captured-by identifier" rule would close both. Found by reading the code; not reproduced on a live page.

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

**Revision 3, approved 10 October 2026** (owner wording and conditions in the status line). Each condition is written into the section it governs.

11. **Approved 10 October 2026 (built).** **Unavailable columns leave row outcomes** (section 8.3). A whole unavailable record no longer makes every row "Not compared"; masked and not-captured cells keep the approved rule. Amends approved decision 1's section 8.3 and the built `comparisonRowOutcome`.
12. **Approved 10 October 2026.** **`collapsed` comparison sections** (sections 5.2 and 12): an authored per-section default; collapsed sections still count their differences.
13. **Approved 10 October 2026, with audit 3 finding 4 recorded.** **Same label, different record** (section 8.6): "Different record" is the shipped behaviour, because the label service returns labels only; never an identifier.
14. **Approved 10 October 2026.** **Highlight differing words** (section 8.7): `text` fields only, against the baseline, 400-word bound, announced by hidden text; no new metadata.
15. **Approved 10 October 2026.** **C3 summary chips** (section 5.6): authored `summaryLabel` on fields with `better`; ties shown; at most six; storage `compare_summary_label_id`. Part of C3, which still needs its own approval.
16. **Approved 10 October 2026, with audit 3 finding 1 resolved.** **C4 line states** (sections 5.7 and 8.1): `absent` ("Not in this record") as a line-level state; "Not in baseline", match-key line labels and line counts; C4 wraps `comparisonRowOutcome` unchanged through `comparisonLineOutcome`. Part of C4, which still needs its own design and approval.
17. **Approved 10 October 2026.** **C1b scope** (section 9.6): shared table view, fixed earlier-snapshot baseline with relative wording, published names in headers, and no identifiers (storage identity, version and UUID-typed fields left out on the server; captured references shown as "Linked record"). C1b still needs its own approval to build; this decision fixes its scope.

**Revision 4 (10 October 2026), superseded by revision 5:** decisions 18–22 (per-record pages capped at 100 lines; best value on lines deferred) are replaced by 23–30.

**Revision 5, approved direction 10 October 2026** (owner wording in section 5.8):

23. **Two collection modes:** master-list paging (50 master rows per page; 1 + N requests) and small collections read whole up to 500 lines.
24. **When absence means "not quoted":** no line filters, complete responses, and line access following the parent's (`COMPARE_LINE_ACCESS_INDEPENDENT` otherwise).
25. **Narrowing first:** master-list search, filters and pinned items (`compareItems`); "Differences only" applies within loaded pages; no server-side differences count.
26. **Shared match key:** a reference to the master Entity (`COMPARE_MATCH_KEY_NOT_SHARED`). Uniqueness is checked against the DDL, with a runtime duplicate refusal as well.
27. **Exact coverage counts** in column headers, from two exact counts.
28. **Best value on lines:** `ListFieldDescriptorV1.compare`, the unit rule, and evaluation-amount ranking.
29. **`MAX_LIST_FILTER_VALUES` = 100,** published and enforced.
30. **Pilot and prerequisites:** award allocations first; RFP response Entities onboarded separately; many-way questions answered by the lists and the Matrix Layout.

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
| A per-field property for word highlighting (revision 3) | The behaviour follows from the published value kind and holds no authored decision |
| Inferring a "technical" section from its key or fields (revision 3) | Forbidden inference; `collapsed` is authored instead (decision 12) |
| Resolving a snapshot's captured reference against today's label (revision 3) | Would present today's name as if it were true when the snapshot was taken |
| Comparing the visible part of a masked value (revision 3) | A masked value cannot be compared; the approved rule stands |
| Showing a reference's identifier to tell two same-label records apart (revision 3, from the prototype) | Displays a UUID in production; the published readable identity or "Different record" is used instead (decision 13) |
| The prototype's Inspector, request log, density and theme switches | Prototype review tooling, not product features |

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
| Audit 3 | Confirms the section 3 facts: `readableRecordFields` filters no identity (storage `idField` is an eligible descriptor field), and one `record_unavailable` column made every row `not_comparable` in the built core. Confirms decision 11 is additive for snapshots, which never produce `record_unavailable` | Decision 11 built with the owner's not-captured assertion (section 8.3) |
| Audit 3, finding 1 | `absent` was comparable in 8.1 but not comparable under 8.3 and the built `comparisonRowOutcome` | Resolved (decision 16): `absent` is a line-level state, out of the row-cell table; C4's `comparisonLineOutcome` handles it and calls `comparisonRowOutcome` unchanged on present cells (sections 5.7 and 8.1) |
| Audit 3, finding 2 | The masked-currency rule is already built in C1 | Recorded, no action: `comparisonRowOutcome` requires every currency cell to be a `value` cell, so a masked currency is `not_comparable` |
| Audit 3, finding 3 | Name the status field the chip uses | `storage.statusField` with its own `statusTones`; omitted, never substituted, when undeclared, unreadable or not among the comparison's fields; carried in the projection (sections 3, 5.3 and 9.2) |
| Audit 3, finding 4 | The label service cannot return a readable identity | Recorded as a fact in section 3; "Different record" is the shipped behaviour; widening the service needs its own approval (section 8.6) |
| Audit 6 | C3 "ties marked as none": `best.length === values.length` conflates all-equal with a tie | Not a defect: every value equal to the best is the same condition as all values equal. A tie with a column outside it is marked, pinned by the test "best = columns 1 and 3, chip (tie)". No change |
| Audit 6, C4 presentation gaps | Differences only by default, collapsed lines with counts, a line-subset control, `countMode` none on line reads | Adopted in revision 5 (section 5.8, points 2, 4 and 6) |
| Audit 7 | "Page 2 absence is ambiguous" | Corrected: the line request names exactly the page's master rows, and one line per row is guaranteed, so a complete response makes absence exact. The real conditions are no line-level filters and line access following the parent's. Both are now in point 3, with `COMPARE_LINE_ACCESS_INDEPENDENT` |
| Audit 7 | "Not quoted by at least one" is an ordinary master-list filter | Corrected: it is an existence test against another Entity, not a filter on the master's own fields. Recorded as a later decision (point 4) |
| Audit 7 | Pilot on `purchase_requisition_line` / `sourcing_event_company` | Corrected against the DDL: requisition lines are unique by line number (not comparable) and `sourcing_event_company` holds buyer company codes. Pilot instead on `sourcing_event_award` and `sourcing_event_award_allocation` with `sourcing_event_demand` as the master list (point 10) |
| Audit 8 | Revision 5 sound; decisions 24, 27 and 29 close the earlier gaps; keep "Differences only" within loaded pages; C4 ready to build once the prototype is accepted | Recorded. The complete-response rule is now shared with the Matrix (point 3), and best value on lines follows the Matrix's evaluation-amount rule (point 7) |
| Audit 7 | Publish an `in` limit; keep the runtime duplicate refusal; record sections need multi-select | Adopted (points 5 and 8); record sections already offer selection (facts above) |
| Audit 4, finding 1 | The pushed-history flag was a ref the URL did not agree with | Fixed (`3bcb4ca22`): the marker lives in the history entry itself |
| Audit 4, finding 2 | An unreadable currency field gave "Currency not compared" without the restricted statement | Fixed: `fieldsRestricted` is set when a declared currency field is dropped |
| Audit 4, finding 3 | The narrow pair was not reset when membership or the baseline changed | Fixed: the pair resets on either change |
| Audit 4, shared-tree commit | Say in that commit that the work was not the author's and was verified first | Already stated in `8dfb17ec3`'s message ("Uncommitted layout work found in the shared worktree and committed at the owner's request. Verified before commit: …") |
| Owner's prototype review, revision 3 (10 October 2026) | The Neon Compare Prototype was read in code, not only in screenshots, and checked against the shipped snapshot comparison and the server | Two findings from the code: identifiers can appear in snapshot comparisons (section 3; decision 17), and one unavailable record would blank every row (section 3; decision 11). Prototype features: within C2 presentation (9.2), or proposed as decisions 12–16. The prototype's own "Current" view is not the shipped view: the shipped view already groups by sections and tabs, defaults to changes only, and shows labels, choice labels and formatted dates (pinned in `activity-comparison-view.test.tsx`). Any before-and-after review should use the shipped view |

## 18. AGENTS.md entry

Added under the Entity list rules with the approval (decision 10):

> **Entity list Compare**
>
> - The active design is the [Entity list Compare blueprint](docs/blueprints/entity-list-compare/blueprint.md). Read it before implementing record comparison or changing the shared comparison core, and update it in place. Implement only phases the project owner has approved.
> - Compare is a selection action of the shared Entity list, offered only when the list surface declares a comparison in governed, published Meta Entity properties. Do not infer a comparison field set, and do not create a comparison route, page, provider stack or entity-specific comparison.
> - Never align related records by array position. Line comparison requires a declared match key backed by a database unique key.
> - The snapshot comparison and record comparison share one core package; fix comparison rules there, not in a consumer.
