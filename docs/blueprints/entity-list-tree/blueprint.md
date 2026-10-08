# Entity list Tree — blueprint

**Status:** approved, revision 2 (9 October 2026). The project owner (nchandravel-atlas) approved all eleven decisions in section 14 on 9 October 2026, restating each decision and then: "All approved... updated the document for final review". Sections 5.1–5.3 (the grouping state, the hierarchy declaration, the `tree` mode and browser projection, and the list contract additions declared there: the `groupsOnly` flag, the `hierarchy` parameter and the `hasChildren` and `parentOutsideView` row fields; their shapes were written into section 5 after approval, at the final review, with no change of intent) are implementation authority for phases A1, P-T1 and B1. Phases B2–B5, A2 and A3 each need their own approval. Authoring storage (decision 9) is approved but built behind the metadata-cleanup gate.

**Scope and authority.**

- This is the design for **trees in the shared Entity list**, for any eligible Entity through governed, published Meta Entity properties. No entity name, allowlist or entity-specific branch appears in framework code.
- It covers two kinds of nesting, drawn by one shared tree renderer:
  - **Grouped tree** (Part A): records nested under group headings for up to three grouping fields (for example Region → Status → records). It upgrades today's single-level Group by in Table and Cards.
  - **Record hierarchy** (Part B): records nested under parent records of the same Entity, declared in metadata (for example a Chart of Accounts, Cost Centers, a project work breakdown, budget lines). It is a new list Layout, `tree`.
- **Why this matters.** Hierarchical master data is central to finance and project work: Chart of Accounts, Cost Centers, Profit Centers, Project Tasks (work breakdown) and Budgeting all present as trees with subtotals. Part B is designed so each of these is onboarded through metadata alone.
- **Authority.** Entity onboarding and shared Entity Framework work under [AGENTS.md](../../../AGENTS.md), on the same footing as Board, Calendar and Gantt. The record hierarchy concept is shared with the Gantt blueprint's Phase 2b (hierarchy): it is designed once, here, and Gantt consumes it.
- **Shared foundation.** The [shared list layout foundation](../entity-list-layouts/foundation.md) applies: the mode registry and renderer traits (section 7), `unavailableModes` with reason codes and no fall-through, per-viewer availability, the count-mode rule (section 5, including group headings) and the draft-comparison rule (section 6).
- **Authoring authority.** The [Entity Studio blueprint](../entity-studio/blueprint.md) remains the authority for authoring storage, the codec, the compiler and the composer.
- Update this document in place. Do not create competing tree plans.

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

1. **Metadata declares every nesting.** Grouping fields are chosen by the person from fields the surface publishes as groupable. A record hierarchy exists only when the Entity declares its parent field. The framework never infers a hierarchy from field names (`parent_id`, `parent_code`) or types.
2. **Every number is true for what it covers.** A group or node count shows only under exact counts (foundation section 5). A rollup is labelled as a total of the records the person can see. Rows loaded on one page never stand in for a total.
3. **Each node loads its own content.** A group or node fetches its children with a filter on that group or parent, so its count and its rows always come from the same filtered set. There is no global page that splits a group across page boundaries.
4. **No record is hidden.** A record whose parent the viewer cannot read still appears, at the top level, marked as having a parent outside their view. A group value outside the published choices appears under "Unmapped values". A row ceiling, when reached, says so.
5. **Authorization is never widened by the tree.** Children, ancestors, counts and rollups are computed only over records the viewer can read under the same tenant, collection and field controls as the flat list. Recursion runs inside the visible set, never through hidden records.
6. **No UUID and no synthesized identity.** Node labels are the published readable identity and, when declared, the title (the Gantt rule). Group headings use the published choice labels, or a neutral placeholder, never a raw value (step 1, `964533c7f`). The placeholder ("Unavailable reference") deliberately does not distinguish a deleted target from one the viewer cannot read: telling them apart would disclose that an unreadable record exists.
7. **Expanded state is location state, never saved.** Which groups or nodes are open lasts for the session, like Gantt's collapsed groups. Saved views keep the structure (grouping fields, the hierarchy layout), not the open nodes.
8. **Read-only first.** Moving a node to another parent changes data and comes with its own integrity guards and approval (Phase B4).

## 2. Eligibility for any Entity

### 2.1 Grouping fields (Part A)

A field can group for a viewer when all of the following hold. The list service enforces this per viewer; an ineligible field is not offered, and a saved grouping that names one is dropped with the existing "view changed" notice.

| Rule                                                                                                                                                                                                                                                                                                                                             | Source                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| The field is published as groupable on this list surface, and the viewer may use it for grouping                                                                                                                                                                                                                                                 | `field.list.groupable`, field authorization `group` use |
| The field is listed for the viewer and not masked                                                                                                                                                                                                                                                                                                | per-viewer field projection                             |
| The field is filterable with `eq`, and with `is_null` when it can be empty                                                                                                                                                                                                                                                                       | published filter operators                              |
| **Bounded by class:** a boolean field, or a field for which the viewer receives an authorized choice list (`filterOptions`) of at most 50 entries. This covers enums and bounded references, supplies the heading labels before any row loads, and excludes unbounded fields (free text, dates, references to large tables) without listing them | per-viewer choice projection                            |
| At most 3 grouping fields, each once, in order                                                                                                                                                                                                                                                                                                   | saved state                                             |

Three levels matches the bounds already used by Board lane fields and the Calendar and Gantt date ranges, so the authoring bound is the same across layouts.

### 2.2 Record hierarchy (Part B)

An Entity may declare a hierarchy when all of the following hold. Studio validation enforces every rule; the list service re-checks those marked † for each viewer.

| Rule                                                                                                                                                                                                                                                                                                               | Source                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| A **parent field**: a `reference` field whose published `referenceTargetEntity` is this same Entity, nullable (records without a parent are roots)                                                                                                                                                                 | entity field metadata                            |
| The parent field is readable, unmasked and filterable with `eq`, `in` and `is_null` for the viewer †                                                                                                                                                                                                               | per-viewer field projection                      |
| An optional **sibling order field**: an `integer` field; without it, siblings follow the surface's published default sort                                                                                                                                                                                          | entity field metadata                            |
| An optional **node kind field**: an entity-owned enum, with each choice declared as `branch` (may have children, for example a summary account) or `leaf` (may not, for example a posting account), and published choice tones                                                                                     | entity field metadata, choice rows               |
| A **maximum depth** between 1 and 16                                                                                                                                                                                                                                                                               | hierarchy declaration                            |
| Optional **rollups**: up to 5, each a numeric (`integer`, `decimal`, `money`) field with an aggregate (`sum` or `count`) the field already publishes in its `aggregations`. `minimum` and `maximum` are excluded: over the visible subset they are not the node's minimum or maximum, and no wording makes them so | entity field metadata, `field.list.aggregations` |
| The parent field is indexed with the tenant column (an onboarding check, reported by the DDL rehearsal)                                                                                                                                                                                                            | Entity onboarding                                |
| `tree` in `supported_modes` and a hierarchy declaration require each other †                                                                                                                                                                                                                                       | cross-row check                                  |

**Count mode** is not required to browse. Child counts and rollups show only under exact counts.

## 3. Current-state facts this design relies on

Verified against the repository on 9 October 2026.

| Fact                                                                                                                | Evidence                                                          | Consequence                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Group by is one level                                                                                               | `group?: string` (`types.ts:170`)                                 | Part A changes saved state (decision 2)                                                                             |
| Row order ignores the group field; the group query is a separate full-set `GROUP BY` ordered by raw value ascending | `orderBy`, `groupBuckets` (`kysely-record-repository.ts`)         | With one global page, groups split across pages. Part A replaces the global page with per-group loading (section 7) |
| Group counts now follow the count-mode rule, and rows never stand in for totals                                     | step 1, `ed27d4a82`; foundation section 5                         | Part A inherits the rule at every level                                                                             |
| Reference values never show raw identifiers; reference group labels come from the authorized label service          | step 1, `964533c7f`                                               | Group headings for bounded references are safe                                                                      |
| Per-viewer choice lists exist for enum and bounded reference fields                                                 | `filterOptions` (`types.ts`)                                      | The grouping bound and heading labels come from it (section 2.1)                                                    |
| Reference fields publish their target Entity                                                                        | `referenceTargetEntity` (`descriptors.ts:87`)                     | The parent field's self-reference is checkable                                                                      |
| Fields publish `aggregations` (count, sum, average, minimum, maximum), but nothing reads them                       | `types.ts:217`                                                    | Rollups use these existing declarations, not a new vocabulary                                                       |
| A bounded recursive query over a visible set exists in the codebase                                                 | `comment-descendants.ts` (`WITH RECURSIVE visible … depth < max`) | Ancestor and descendant queries follow the same "visible set first, then recurse, depth-bounded" pattern            |
| The registry declares per-layout list policy as traits                                                              | foundation section 7                                              | `tree` declares its traits; no mode comparisons are added                                                           |
| `tree` is not a reserved mode and no `tree` URL key exists                                                          | `view-modes.ts`, `url-state.ts`                                   | Reserving it is a contract change                                                                                   |
| Country and State Region publish no per-field list settings                                                         | Board decision 14.8                                               | Neither can group today; pilots use synthetic fixtures (section 12)                                                 |

## 4. Prerequisites

- **Step 1 (done).** Group counts only under exact counts, no page-count fallback, corrected comments (`ed27d4a82`); raw reference identifiers never shown (`964533c7f`).
- **P-T1, shared tree renderer.** A tree-grid module in `list-view/src/tree/` used by both parts: rows with level, expanded state, set size and position; lazy children; keyboard navigation; indentation; "expand all loaded" and "collapse all". Table's grouped rendering moves onto it; Cards keeps sections.
- **P-T2, Gantt alignment.** Gantt's Phase 2b (hierarchy) is re-pointed to this blueprint's Part B, so one parent concept serves both.

## 5. Contract properties

Studio authoring rows are typed and normalized; nothing is stored in `layout_config`. Compiled JSON is derived output.

### 5.1 Part A: grouping state (browser contract)

```ts
SaveableListStateV1.groups?: readonly string[];   // 1–3 field keys, ordered, unique
// state.group (one field) remains readable as groups: [group]
```

- **Old to new (guaranteed exactly).** A link or saved view with `group=x` reads as `groups: [x]`. URL: `group=` keeps working; `groups=a,b,c` is the new key.
- **New to old (degrades safely).** The state parser ignores unknown keys, so a build that predates `groups` opens such a view ungrouped. Grouping is display state, so this never widens results. Saving both `group` and `groups` for older builds is rejected (two competing sources).
- **On read,** the list is kept in order, deduplicated and capped at 3. A field that no longer qualifies (section 2.1) is dropped and the rest move up, with the existing "view changed" notice.

**Request flag `groupsOnly` (list operation, Part A).** A new optional query parameter on the existing entity list operation (`GET /api/entity-list/:entityCode`), declared in its route schema:

| Aspect             | Shape                                                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parameter          | `groupsOnly`, a string enum with the single value `"true"`; absent means false. The browser's `entityListQuery` sends it only from the grouped-tree loader                                                  |
| Accepted only with | `group` set **and** `countMode=exact`; no `cursor`. Any other combination is rejected with 400 `LIST_GROUPS_ONLY_INVALID`, never silently ignored, so a caller cannot believe it received counts it did not |
| Server behaviour   | Skips the row query; runs only the group query under the same authorization, scope, filters and search                                                                                                      |
| Response           | `rows: []`; `pagination: { pageSize: 0, hasNext: false, hasPrevious: false, countMode: "exact", total }` with `total` the sum of the group counts; `groups` as today (value, authorized label, count)       |
| Cursor and hashes  | Part of the request's `queryHash`; no cursor is issued                                                                                                                                                      |
| Who sees it        | Only the grouped tree. Table, Cards and the other layouts never send it, so their responses are unchanged                                                                                                   |

### 5.2 Part B: hierarchy declaration (published, entity level)

The hierarchy is a property of the Entity, not of one list surface, because the list, record pickers, the detail breadcrumb and Gantt all use it.

```ts
hierarchy?: {
  parentField: string;                 // reference to this Entity, nullable
  orderField?: string;                 // integer
  nodeKind?: {
    field: string;                     // entity-owned enum
    branchValues: readonly string[];   // choices that may have children; others are leaves
  };
  maxDepth: number;                    // 1–16
  rollups?: readonly {
    field: string;                     // integer, decimal or money
    aggregate: "sum" | "count";        // visible records only (section 7.4)
  }[];                                 // at most 5
};
```

### 5.3 Part B: list mode and browser projection

| Property                 | Shape                                                                                                                                    | Consequence                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ENTITY_LIST_VIEW_MODES` | adds `"tree"`                                                                                                                            | Offered only through its per-viewer resolver, like Board, Calendar and Gantt                                |
| Renderer traits          | `tree`: adapts when narrow, own paging, own grouping, own counts                                                                         | The list's pagination, Group drawer and title count are off in Tree                                         |
| `surface.tree`           | `{ parentField, orderField?, nodeKind?: { field, branchValues, tones }, maxDepth, rollups?: { field, aggregate, label }[] }`, per viewer | A masked rollup or node-kind field is omitted for that viewer; a masked parent field makes Tree unavailable |
| Saved state              | none beyond `mode = tree`                                                                                                                | Expanded nodes are session state                                                                            |
| URL                      | `view=tree`; `tree.node=<record>` selects and reveals a node (location only)                                                             | Deep links open with the path to that node expanded                                                         |
| Component catalogue data | the list host declares `tree`                                                                                                            | A publication gate, as for Calendar and Gantt                                                               |

**Request parameter `hierarchy` and row fields `hasChildren`, `parentOutsideView` (list operation, Part B).**

| Aspect                        | Shape                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parameter                     | `hierarchy`, a string enum: `"nodes"` or `"orphans"`; absent means a flat list request. Declared in the list operation's route schema                                                                                                                                                       |
| `hierarchy=nodes`             | Used for the roots query (`parentField is_null`) and each children query (`parentField eq <node>`). The filters are the list's ordinary filters; the parameter only adds the row fields below                                                                                               |
| `hierarchy=orphans`           | The server selects visible records whose parent field is set but whose parent is not in the viewer's visible set (computed inside the visible set, never by reading hidden records), sorted by readable identity, paged with a cursor                                                       |
| Accepted only when            | The surface publishes a hierarchy and the viewer can use its parent field (`eq`, `in`, `is_null`); otherwise 400 `LIST_TREE_PARENT_FIELD_UNAVAILABLE`, the same reason code the Layout availability uses                                                                                    |
| Row field `hasChildren`       | `readonly hasChildren?: boolean` on `EntityListRowV1`. **Present on every row of a `hierarchy` response and absent from every other response**, so flat lists and the other layouts are byte-for-byte unchanged. True when the row has at least one child the viewer can read (section 7.2) |
| Row field `parentOutsideView` | `readonly parentOutsideView?: true` on `EntityListRowV1`, present only on rows of a `hierarchy=orphans` response. It carries no information about the hidden parent                                                                                                                         |
| Child counts                  | Not on rows. A numeric child count, when shown under exact counts, comes from the children query's own `total` once a node is expanded                                                                                                                                                      |
| Cursor and hashes             | The `hierarchy` value is bound into the cursor and the `queryHash`, so a cursor from a roots page cannot continue an orphans page                                                                                                                                                           |
| Result parser                 | `parseEntityListResult` accepts the two optional row fields and rejects them on a response to a request without `hierarchy`                                                                                                                                                                 |

### 5.4 Later phases (shape only; each needs its own approval)

| Phase                     | Addition                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| B2 Search with context    | A tree query returning matches plus their ancestors (section 7.3)                                     |
| B3 Rollups                | Rollup values per node (section 7.4)                                                                  |
| B4 Reparent               | Moving a node through the existing update operation, with cycle and depth guards on the server        |
| B5 Pickers and breadcrumb | A tree record picker for references to hierarchical Entities; an ancestor breadcrumb on record detail |
| A2 Group aggregates       | Per-group totals from published `aggregations`, under exact counts                                    |
| A3 Date grouping          | Grouping a date field by month or quarter                                                             |

## 6. Validation, availability and finding codes

| Layer                       | Behaviour                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio validation           | `TREE_PARENT_FIELD_REQUIRED`, `TREE_PARENT_FIELD_NOT_SELF_REFERENCE`, `TREE_PARENT_FIELD_NOT_NULLABLE`, `TREE_ORDER_FIELD_INELIGIBLE`, `TREE_NODE_KIND_INELIGIBLE`, `TREE_DEPTH_OUT_OF_RANGE`, `TREE_ROLLUP_INELIGIBLE` (type, or the aggregate is not in the field's published `aggregations`), `TREE_ROLLUP_LIMIT`, `LIST_MODE_UNSUPPORTED` |
| Published-descriptor parser | A structurally invalid `hierarchy` rejects the descriptor at load; `tree` ⇔ a hierarchy declaration                                                                                                                                                                                                                                           |
| List service (per viewer)   | Tree moves to `unavailableModes` with `LIST_TREE_PARENT_FIELD_UNAVAILABLE` when the parent field is masked, unreadable or lacks `eq`, `in` or `is_null`. Grouping fields that fail section 2.1 are not offered; a saved one is dropped with the notice                                                                                        |
| Browser                     | The foundation behaviour: a disabled Layout option with its reason; fallback with notice; no fall-through                                                                                                                                                                                                                                     |
| Write (Phase B4)            | `HIERARCHY_CYCLE` and `HIERARCHY_DEPTH_EXCEEDED` (409) from the update operation; `HIERARCHY_LEAF_PARENT` when the new parent's node kind is a leaf                                                                                                                                                                                           |

## 7. Query semantics

### 7.1 Part A: grouped tree loading

- **Where the group headings come from.** Every grouping field has a published choice list (section 2.1), so the headings are known before any query.
  - **Under exact counts:** level 1 is one list query with `group = groups[0]` and a new request flag, `groupsOnly`, which tells the server to skip the row query and return only the groups with their counts. Without the flag the server would fetch a page of rows the tree never draws (the page size cannot be zero). Choices with no records are not shown.
  - **Under any other count mode:** the server runs no group query (foundation section 5), so the headings are the published choices in order, then "No value" and "Unmapped values", with no counts and no request. A heading whose group turns out to be empty reports "No records" when expanded. Lists that group by default are better served with exact counts; that is authoring guidance, not a requirement.
- **Expanding a group at level n < depth:** under exact counts, one `groupsOnly` list query with `group = groups[n]` and a filter `groups[n-1] eq value` (or `is_null` for "No value"), ANDed with every ancestor group's filter and the list's own filters, search and scope.
- **Expanding a last-level group:** one list query for that group's records with the same filters, paged with "Load more". Under exact counts its own total replaces the parent's bucket count once loaded, so a record changing between the two requests cannot leave them disagreeing.
- **Request budget:** each expansion sends exactly one request. Opening a third-level group costs at most three group requests and one page over the whole path. Requests in flight are aborted when the list state changes, as Board's lane requests are.
- **Group order:** fields with a choice list follow published choice order, then "No value", then "Unmapped values", even when the grouping field is also the sorted field; the sort direction applies only to fields without a choice list (booleans). A level with more than 50 groups shows the first 50 and a "more groups" notice.
- **Why not "sort by the group field".** With one global page, sorting rows by the grouping field makes a group's rows sit together but still puts a full total above a page-sized subset. It fixes the appearance, not the defect, so it is not the design.
- **Counts:** under exact counts, every level shows its count; otherwise no level does, and the "more groups" notice stays.

### 7.2 Part B: browsing a hierarchy

- **Roots:** the list query with `parentField is_null`, plus the list's own filters and scope, sorted by the order field (then the identity), paged with "Load more". Orphans are not mixed into the roots (below).
- **Children of a node:** the list query with `parentField eq <node>`, same sort, paged with "Load more".
- **Child existence:** the response for a hierarchy request gains, for each returned row, `hasChildren`: **true when the row has at least one child the viewer can read**, computed in the same request over the visible set. A node whose children are all hidden shows no expand control and looks like a leaf, deliberately: "has children" over all records would let a viewer infer records they cannot read, the inference the platform rules out elsewhere. The section 8 wording "No children you can see" applies when a node's visible children disappear between loading and expanding. A numeric child count shows only under exact counts. This is the one contract addition Phase B1 needs on the list response.
- **Orphans:** a visible record whose parent is not visible to the viewer is marked `parentOutsideView`, is never hidden and never shows the hidden parent's identity. Orphans form **their own group after the roots**, headed "Records whose parent is outside your view", fetched by a separate `hierarchy=orphans` query (section 5.3) and **sorted by readable identity**, not by the order field: an order value is meaningful only among real siblings, so mixing orphans into the root order would scatter or cluster them arbitrarily. Each orphan's own children browse normally. The orphan group's query uses the visible set and the parent field only, so it reveals nothing about the hidden parents.
- **Depth:** nothing deeper than `maxDepth` is requested.
- **Ceiling:** at most 500 loaded nodes, the Gantt rule (reached and truncated, with the same notice semantics).

### 7.3 Part B, Phase B2: search and filters in a tree

With a search or filter, the tree shows each matching record with its ancestor path, so a match is seen in context (for example account 6100 under Expenses › Operating). The server returns the matches and the ancestors needed to reach them, each ancestor marked as context rather than a match, computed with a depth-bounded recursive query **inside the visible set**. Matches are capped at the node ceiling and say so. This is a new server operation and needs its own approval.

### 7.4 Part B, Phase B3: rollups

A rollup is the declared aggregate (`sum` or `count`) of a declared field over a node and all its **visible** descendants, computed on the server with a depth-bounded recursive query inside the visible set, only under exact counts.

- **It is deliberately partial.** Hidden descendants contribute nothing, so a summary node's rollup can understate the full total. It is always labelled "Total of records you can see" (and "Records you can see" for `count`), and is never presented as the node's balance or full total.
- **Count stays benign** because it counts visible records only: it reflects what the viewer can already open, not records they cannot.
- **Minimum and maximum are excluded** (section 2.2): over a visible subset they are not the node's minimum or maximum. Financial balances that come from transactions (for example a ledger balance per account) are not rollups of an account field: they belong to a domain read model onboarded as its own Entity, and its tree reuses Part B.

## 8. Views and interaction

**Shared tree grid (both parts).**

- ARIA `treegrid`: each row has `aria-level`, `aria-expanded` (when it can expand), `aria-setsize` and `aria-posinset`. The first cell carries the label and the expand control, indented by level (mirrored right to left).
- Keyboard: Up and Down move between rows; Right expands or moves to the first child; Left collapses or moves to the parent; Home and End; Enter opens the record; `*` expands the siblings already loaded.
- "Expand all loaded" and "Collapse all" act only on nodes already loaded. Expanding everything on the server would send one request per node and break the request budget; Board's "collapsed lanes fetch no pages" applies the same reasoning.
- Selection selects loaded records only and says so; selecting a whole group or subtree on the server is deferred.
- Columns, density, sort (within siblings) and the row menu behave as in Table.

**Part A in Cards:** sections nested by level with the same headings, counts rule and loading.

**Part B, Tree layout:** the label column shows the identity and title; a node-kind tone dot with hidden kind text; a "parent outside your view" marker on orphans; rollup columns (Phase B3) right-aligned with the "visible total" wording; a deep link (`tree.node`) reveals and focuses its node.

**Narrow widths:** an indented list with the label and expand control; other columns move into the record card.

**Empty states:** "No records at the top level" with the active filters, and an expand control that reports "No children you can see" when a node's children are all hidden.

## 9. Studio authoring and composer homes

The hierarchy declaration is authored on the Entity (not on a list surface) in the existing Entity composer, after the metadata cleanup. Every property has a database location (section 5.2), a typed API, a save and load mapping, validation (section 6) and a compiler mapping, per the Entity Studio blueprint. Grouping needs no new authoring: it uses each field's published `groupable` setting and choice list.

## 10. Registration inventory for new authoring members

The same nine steps as Calendar section 10, for the hierarchy declaration storage (decision 9): the Studio dictionary section, contract members, generated output, hand-written guards (self-reference, depth range, rollup eligibility), reconciliation, storage and qualification sites, generated types, a forward upgrade, and no change for existing drafts.

## 11. Folder structure and test registration

| Path                                                                            | Content                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/platform/entity/runtime/list-view/src/tree/`                          | P-T1 shared tree grid, grouped-tree model, hierarchy model   |
| `packages/contracts/platform/entity-list/src/tree.ts`                           | Browser contract and parsers for `groups` and `surface.tree` |
| `server/packages/platform/metadata/src/entity-hierarchy-descriptor.ts` (+ test) | Published hierarchy parsing and validation                   |
| `server/packages/services/records/src/list-tree.ts` (+ test)                    | Per-viewer resolution and the child-existence projection     |
| `tests/foundation/entity-list-tree-model.test.ts`                               | Model tests                                                  |
| `tests/foundation-browser/entity-list-tree.spec.ts`                             | Browser spec, registered beside the other layout specs       |

Styles stay on the breakpoint scale and use design-system tokens; indentation is one local constant.

## 12. Delivery phases and acceptance

| Step      | Scope                                                                      | Acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1        | Grouped tree in Table and Cards                                            | Synthetic fixtures: (a) `group=x` links and saved views read as one level; a stored `groups` with an ineligible field drops it with the notice; (b) each expansion sends one request with the ancestor filters, and in-flight requests abort on state change; (c) group order is published choice order, then No value, then Unmapped values; (d) counts at every level only under exact counts; (e) a last-level group's loaded total matches its rows; (f) no raw identifier in any heading; (g) tree-grid keyboard and ARIA; (h) "expand all loaded" sends no request |
| P-T1      | Shared tree grid                                                           | Table's current grouping moves onto it with no visible regression                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| B1        | Tree layout: roots, children, child existence, orphans, deep link, ceiling | Synthetic hierarchical fixtures shaped like a Chart of Accounts (summary and posting accounts, 5 levels) and a project breakdown: (a) leaves show no expand control; (b) an orphan appears at the top with the marker and never the hidden parent's identity; (c) nothing deeper than `maxDepth` is requested; (d) a masked parent field makes Tree unavailable with its reason; (e) a deep link reveals its node; (f) RTL, narrow, keyboard; (g) no UUID in the DOM                                                                                                     |
| B2        | Search with ancestor context                                               | Matches show their path; ancestors are marked as context; hidden records never appear as ancestors                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B3        | Rollups                                                                    | On fixtures with hidden records: a sum equals the sum over visible descendants and a count the number of visible descendants, both deliberately partial and labelled "of records you can see"; never labelled as a balance; shown only under exact counts                                                                                                                                                                                                                                                                                                                |
| B4        | Reparent                                                                   | Cycle, depth and leaf-parent guards reject with their codes; audit and idempotency as for any update                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Authoring | Section 9, 10                                                              | Behind the metadata-cleanup gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Verification method (as for Board, Calendar and Gantt).** Each phase is verified on synthetic fixtures shaped like a Chart of Accounts (summary and posting accounts, 5 levels) and a project breakdown, through the real shared runtime and browser specs, until real Entities are onboarded. With the owner's approval (9 October 2026), AGENTS.md carries a pointer worded like the other layouts', linking this blueprint and the foundation by their stable paths.

**Fixture boundary.** Synthetic fixtures are test data. Chart of Accounts, Cost Center, Project Task and Budget pilots are Entity onboarding with their own approval; each then needs only its hierarchy declaration.

## 13. Dependencies and risks

| Dependency or risk                       | Consequence                                   | Handling                                                                                                                                                             |
| ---------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata cleanup                         | Hierarchy authoring and real publication wait | Runtime proceeds on fixtures, as for Calendar and Gantt                                                                                                              |
| Large trees (tens of thousands of nodes) | Recursive queries cost more at depth          | Browse needs no recursion; B2 and B3 are depth-bounded and run only under exact counts. A domain-maintained path column is a later option if measurements require it |
| Missing parent index                     | Slow children queries                         | An onboarding check in the DDL rehearsal (section 2.2)                                                                                                               |
| Orphans from authorization               | A partial tree                                | Shown at the top with a marker (principle 4)                                                                                                                         |
| Shared-reference products (Board 14.8)   | Country and State Region cannot group         | Unchanged until 14.8 lands                                                                                                                                           |
| Financial balances                       | Not a field rollup                            | Onboarded as a domain read model that reuses Part B (section 7.4)                                                                                                    |

## 14. Decisions required (project owner)

1. **Approved 9 October 2026 (owner wording in the status line).** **Scope.** Part A upgrades Group by in Table and Cards; Part B adds the `tree` Layout for record hierarchies; both share one tree grid (P-T1).
2. **Approved 9 October 2026 (owner wording in the status line).** **Saved-state change for grouping** (section 5.1): `groups: string[]` with `group=` still read as one level; the new-to-old behaviour (opens ungrouped) accepted; no dual write.
3. **Approved 9 October 2026 (owner wording in the status line).** **Count rule at every level:** counts only under exact counts, on three surfaces under the one foundation section 5 rule: group headings, child counts and rollups.
4. **Approved 9 October 2026 (owner wording in the status line).** **Three grouping levels.**
5. **Approved 9 October 2026 (owner wording in the status line).** **Grouping eligibility by class** (section 2.1): booleans, or fields with an authorized choice list of at most 50 entries.
6. **Approved 9 October 2026 (owner wording in the status line).** **Grouped-tree loading and request budget** (section 7.1), including group order and the reason "sort by group" is not the design.
7. **Approved 9 October 2026 (owner wording in the status line).** **Hierarchy declaration** (section 5.2) as an Entity-level property: parent field, optional order field, optional node kind with branch values, maximum depth, optional rollups from published aggregations.
8. **Approved 9 October 2026 (owner wording in the status line).** **Tree browsing** (section 7.2): the list query by parent; `hasChildren` meaning visible children only; orphans as their own group after the roots, sorted by identity; the 500-node ceiling. With Part A's `groupsOnly` request flag (section 7.1), these are the two list contract additions.
9. **Approved 9 October 2026 (owner wording in the status line).** **Authoring storage for the hierarchy declaration:** **recommendation:** one row per Entity in a new `entity_hierarchy` table (parent, order and node-kind field bindings, maximum depth) plus `entity_hierarchy_rollup` rows, with the parent-field index check (section 2.2) attached to the same declaration so the DDL rehearsal reports it; built behind the metadata-cleanup gate.
10. **Approved 9 October 2026 (owner wording in the status line).** **Phases:** A1, P-T1 and B1 first; B2 (search with context), B3 (rollups), B4 (reparent), B5 (pickers and breadcrumb), A2 and A3 each need their own approval.
11. **Approved 9 October 2026 (owner wording in the status line).** **Gantt alignment:** Gantt Phase 2b uses this Part B.

## 15. Rejected options

- **Grouping only the rows already loaded.** It is today's design and splits groups across pages.
- **Sorting rows by the group field as the fix.** It makes rows contiguous but leaves a full total above a page-sized subset (section 7.1).
- **A separate tree page or a finance-specific explorer.** AGENTS.md forbids bespoke applications; every hierarchical Entity uses the shared list.
- **Inferring a hierarchy** from field names or a reference to the same table without a declaration.
- **A third-party tree or tree-grid library.** It would not match the design system, the accessibility rules or the list query; the shared table and Board, Calendar and Gantt were built rather than delegated.
- **Loading a whole hierarchy at once.** It breaks the request budget and the ceiling on real Charts of Accounts; nodes load on demand.
- **Server-side "expand all".** One request per node; only loaded nodes expand.
- **Rollups over all records regardless of access.** It would disclose hidden records' values; rollups cover visible records only.
- **Treating ledger balances as field rollups.** Balances come from transactions and belong to a domain read model.
- **Saving expanded nodes in views.** Expanded state is session state, as in Gantt.

## 16. Review disposition

| Review item                                                                                                                                    | Disposition                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assessment: groups split across pages, raw-value order, counts regardless of count mode, false comment, unused aggregations, no tree semantics | Step 1 fixed the count rule, the fallback and the comment (`ed27d4a82`); Part A fixes page splitting and order (section 7.1); A2 uses aggregations                                                                                                                                                                                     |
| Review 1: the "collapse keyed by label" defect                                                                                                 | Not a defect: collapse uses the stable key. The misleading parameter name was renamed (`ed27d4a82`)                                                                                                                                                                                                                                    |
| Review 1: raw reference identifiers in headings                                                                                                | Fixed for cells, cards, detail values and headings with one shared rule (`964533c7f`)                                                                                                                                                                                                                                                  |
| Review 1: sort-by-group cannot meet published order with one global page                                                                       | Moved into Part A's per-group loading, with the reason stated (section 7.1)                                                                                                                                                                                                                                                            |
| Review 1: count rule and three levels                                                                                                          | Decisions 3 and 4, as recommended                                                                                                                                                                                                                                                                                                      |
| Review 2: unresolved reference labels must not fall back to the raw value                                                                      | One shared placeholder rule (`964533c7f`)                                                                                                                                                                                                                                                                                              |
| Review 2: record the count change                                                                                                              | Foundation section 5, group headings (`ed27d4a82`)                                                                                                                                                                                                                                                                                     |
| Review 2: compatibility in both directions; ordered, deduplicated, capped; unqualified fields on read                                          | Section 5.1                                                                                                                                                                                                                                                                                                                            |
| Review 2: ordering declared per class; testable reference rule; exclusion by class                                                             | Section 2.1 (choice-list rule) and section 7.1 (order)                                                                                                                                                                                                                                                                                 |
| Review 2: request budget; counts and rows agree                                                                                                | Section 7.1                                                                                                                                                                                                                                                                                                                            |
| Review 2: why "expand all" is local; group selection deferred                                                                                  | Section 8                                                                                                                                                                                                                                                                                                                              |
| Owner: trees for Chart of Accounts, Cost Center, Project Task, Budgeting                                                                       | Part B (record hierarchy), rollups (B3), node kinds for summary and posting accounts, ledger balances as a domain read model                                                                                                                                                                                                           |
| Review 3: `hasChildren` visibility semantics                                                                                                   | Visible children only, stated as the contract with the reason (section 7.2)                                                                                                                                                                                                                                                            |
| Review 3: orphans sorted by a field meaningful only among siblings                                                                             | Orphans form their own group after the roots, sorted by identity (section 7.2)                                                                                                                                                                                                                                                         |
| Review 3: rollups are deliberately partial; count and min/max                                                                                  | Wording fixed (section 7.4); aggregates restricted to `sum` and `count` (sections 2.2, 5.2)                                                                                                                                                                                                                                            |
| Review 3: level 1 needs groups without rows                                                                                                    | New `groupsOnly` request flag under exact counts; under other count modes the headings come from the published choice list with no query (section 7.1). This also resolves a gap the review did not name: after step 1 the server returns no groups without exact counts, so level 1 could not have used the group query in every mode |
| Review 3: the placeholder key's catalogue; deleted versus unreadable                                                                           | The key sits beside `entity.value.yes` and `entity.value.no` in the same catalogue, so it is consistent; the non-distinction is now stated as deliberate (principle 6)                                                                                                                                                                 |
| Review 3: verification and the AGENTS.md pointer are not decisions                                                                             | Moved to section 12 as the standing method; section 14 keeps the eleven contract decisions                                                                                                                                                                                                                                             |
| Final review: `groupsOnly` and `hasChildren` were named only in section 7                                                                      | Shapes declared in the contract sections: `groupsOnly` in section 5.1 (parameter, allowed combinations, response, hashes) and the `hierarchy` parameter with `hasChildren` and `parentOutsideView` in section 5.3 (when present, cursor binding, parser rule). The orphans query, previously unspecified, is `hierarchy=orphans`       |
