# Review: Entity list runtime and list contracts (Country list)

Area: `packages/platform/entity/runtime/list-view/src/**`,
`packages/contracts/platform/entity-list/src/**`,
`packages/platform/entity/runtime/collection-controls/src/**`,
`packages/platform/entity/runtime/descriptor-client/src/**`.

Route under test: `https://{neon,mesh,studio}.dev.athyper.test/app/entity/country/` and its detail route
`/app/entity/country/<recordId>`, both served by the shared Entity Framework.

Method: inventory (`find` + `wc -l`), then full reads of the files on the Country request path, then targeted
`grep` sweeps for the specific hazards requested (URL codec, pagination cursor, selection, saved views,
bookmarks, DOM ids, keyboard nav, i18n, tokens, dead code, test health). Every line number below was re-read in
the current working tree before being quoted.

## Measured inventory (this is what the sizes really are)

| Package | files | lines | notes |
| --- | --- | --- | --- |
| `packages/platform/entity/runtime/list-view/src` | 29 | 8 789 | `index.tsx` = 5 589 lines (read in full, in 17 passes) |
| `packages/contracts/platform/entity-list/src` | 8 (task said 7) | 2 548 | `parsers.ts` 1 372, `experience.ts` 451, `types.ts` 378, `url-state.ts` 174, `standard-views.ts` 71, `filter-defaults.ts` 62, `scope-filters.ts` 31, `index.ts` 9 |
| `packages/platform/entity/runtime/collection-controls/src` | 4 | 885 | `filter-editor.tsx` 695 |
| `packages/platform/entity/runtime/descriptor-client/src` | 6 | 894 | detail/record client, not on the list path |

`git status` shows the working tree already contains substantial in-flight edits to files in this area
(`contracts/platform/entity-list/src/{parsers,types,url-state,index}.ts`,
`runtime/list-view/src/{index.tsx,preferences.ts,browser-storage.ts,styles.css}`,
`collection-controls/src/filter-editor.tsx`; `index.tsx` alone: +1 178 lines changed). All findings below are
against the **current working tree**, and section "Already fixed / changed by the in-flight work" records what
that in-flight work has already repaired.

---

# Findings

## F1 — HIGH — Cross-page selection is counted from `selectedIds` but every action uses only the current page's rows

`packages/platform/entity/runtime/list-view/src/index.tsx:1248-1249`
```tsx
  const selectedRows =
    page?.rows.filter((row) => selectedIds.has(row.id)) ?? [];
```
`packages/platform/entity/runtime/list-view/src/index.tsx:1561-1571`
```tsx
        {!embedding && selectionEnabled && selectedIds.size ? (
          <SelectionBar
            descriptor={descriptor}
            page={page}
            selectedRows={selectedRows}
            bookmarkedIds={bookmarkedIds}
            selectedCount={selectedIds.size}
            allMatching={allMatchingSelected}
            onBookmarks={(operation) =>
              void mutateBookmarks(operation, selectedRows)
            }
```
`packages/platform/entity/runtime/list-view/src/index.tsx:4677-4679`
```tsx
          {new Intl.NumberFormat().format(effectiveCount)}
          {allMatching ? " matching records selected" : " selected"}
```
`packages/platform/entity/runtime/list-view/src/data-operations.tsx:51,57`
```tsx
  const count = scope === "selected" ? props.selectedRows.length : scope === "page" ? props.page?.rows.length ?? 0 : props.page?.pagination.total;
...
      const scopedRows=scope==="selected"?props.selectedRows:scope==="page"?props.page?.rows??[]:[];
```

Why it is wrong: selection is deliberately *cumulative* across pages — the row checkbox and the page checkbox
merge into the existing set (`new Set(singleSelection ? [] : selectedIds)`, `index.tsx:4351` and `index.tsx:4542`)
— and the bar advertises `selectedCount = selectedIds.size`, i.e. the whole cross-page set. But the rows handed
to every action (`selectedRows`) are filtered from `page?.rows`, and `page` is always only the current result
page (the fetch effect sets `setPage(undefined)` on every new query, `index.tsx:902`). So the number shown and
the set acted on are different sets as soon as the user pages after selecting. `useAtlasBusinessContextPublisher`
even publishes the *full* `selectedIds` (`index.tsx:1024-1031`), so analysis and export disagree with each other.

Consequence on the shipped Country route: select a few countries on page 1, click Next, select more, then
"Add selected to favourites" / "Remove selected from favourites" or "Export → Selected records": only the rows
of the page currently displayed are affected while the bar said (for example) "7 selected". The export dialog
then shows the smaller number ("Selected records 2"), so a user who trusts the bar exports bookmarks/exports
fewer records than they believe — a silent partial operation on real reference data.

Mitigating code checked: `mutateBookmarks` guards `allMatchingSelected` (`index.tsx:1254`) and the favourites menu
is hidden when `allMatching` is true (`index.tsx:4697`), so the *select-all-matching* path is consistent. The
partial-selection path has no such guard, and `SelectionBar` receives `page` only to render text
(`index.tsx:4668`), never to validate the acted-on set. Test coverage: nothing asserts cross-page action
semantics (`tests/foundation/entity-list-phase1a.test.tsx` exercises rendering, not this path).

Fix (shared framework): resolve the acted-on set from the selection identity, not the page. Either keep a row
cache keyed by id for every row ever displayed (`Map<string, EntityListRowV1>`) and materialise `selectedRows`
from `selectedIds`, or restrict the selection model to the current page: reset `selectedIds` on cursor change and
make the bar say "records on this page". If the id-only set is kept, the bookmark mutation and export must take
ids plus a label lookup instead of rows, and the count shown must come from the same source.

## F2 — HIGH — "Any of" (`in`) filters accept unlimited values, then throw inside the click handler and are rejected by the API

`packages/platform/entity/runtime/collection-controls/src/filter-state.ts:34-41`
```ts
  if (operator === "in" || operator === "between")
    return Object.freeze(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map(convert),
    );
```
`packages/platform/entity/runtime/list-view/src/index.tsx:987-988`
```tsx
        setState(next);
        if (!embedding) writeLocation(next, descriptor, history);
```
`packages/contracts/platform/entity-list/src/url-state.ts:69`
```ts
  const normalized = parseListLocationState(state, descriptor);
```
`packages/contracts/platform/entity-list/src/parsers.ts:1084-1086`
```ts
  if (Array.isArray(value)) {
    if (value.length > 100)
      throw new TypeError(`${name} exceeds maximum array length`);
```
`server/packages/services/records/src/records-routes.ts:90`
```ts
  if (operator === "in" && (!Array.isArray(parsed["value"]) || parsed["value"].length === 0 || parsed["value"].length > 100)) throw new RecordServiceError(400, "INVALID_FILTER", `filter[${index}].value must be a non-empty array of at most 100 values`);
```

Why it is wrong: the value editor's only bound on `in` is "non-empty", checked by
`filterValidationError` (`collection-controls/src/filter-editor.tsx:133-141`), which never counts elements.
For a plain string field the control is a free-text input whose placeholder is literally
"Enter values separated by commas" (`filter-editor.tsx:630-634`). Country's identity/list fields
(`code`, `code3`, `region`, `name`, …) are plain `string` fields with **no** `filterOptions`, so this is exactly
the control the Country filter drawer renders. Pasting 101 comma-separated codes produces a 101-element filter
value. `Apply` is enabled (validation passes), `update()` calls `setState(next)` and then
`writeLocation(...)` → `encodeListLocationState` → `parseListLocationState` → `json()`, which throws
`TypeError("filters[0].value exceeds maximum array length")`. That throw happens **inside the React click
handler**, so it is not caught by any error boundary; `FilterDialog.apply` never reaches
`onOpenChange(false)` (`index.tsx:2493-2495`), the URL is left with the previous state, and the already-queued
`setState` still triggers the list request, which the server rejects with `400 INVALID_FILTER`
(`records-routes.ts:90`).

Consequence on the shipped Country route: the list is replaced by the error card
(`index.tsx:5500-5514`) with an uncaught exception in the console; the filter drawer stays open on top of a
broken list; a page reload is needed because the bad filter was never written to the URL. Nothing in the
network/server path recovers automatically.

Mitigating code checked: `filterValidationError` does bound other operators (numbers, dates, choices,
`between` length) — only the `in` cardinality is missing. The server *does* enforce the 100-value limit, so
this is not a bypass; it is a client-side crash plus a guaranteed failed request. The descriptor parser's
`filterOptions` bound (500) does not apply because these fields have no `filterOptions`.

Fix (shared framework): bound `in` in `filterValidationError` (e.g. `parts.length > 100` →
"Any of supports at most 100 values"), and clamp in `filterValueFromInput` as a second line of defence. In
`update()` (`index.tsx:987-988`) wrap `writeLocation` so a codec rejection cannot escape an event handler, and
normalise state through `parseListLocationState` before `setState`.

## F3 — MEDIUM — Search uses unescaped `LIKE` wildcards, unlike filters, and disagrees with the in-memory repository (dev/test vs production)

`server/packages/services/records/src/kysely-record-repository.ts:167-169`
```ts
function filterCondition(descriptor: EntityRuntimeDescriptor, filter: RecordFilter): RawBuilder<unknown> { ... case "contains": return sql`${ref}::text ILIKE ${`%${escapeLike(String(filter.value ?? ""))}%`} ESCAPE '\\'`; ...
function searchCondition(descriptor: EntityRuntimeDescriptor, search: string): RawBuilder<unknown> { const fields = descriptor.fields.filter((field) => field.searchable); if (!fields.length) return sql`FALSE`; return sql`(${sql.join(fields.map((field) => sql`${sql.ref(field.storagePath)}::text ILIKE ${`%${search}%`}`), sql` OR `)})`; }
function escapeLike(value: string): string { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
```
`server/packages/services/records/src/in-memory-record-repository.ts:34`
```ts
if (input.search) { const needle = input.search.toLowerCase(); ... rows.filter((row) => fields.some((field) => String(row[field.storagePath] ?? "").toLowerCase().includes(needle))); }
```

Why it is wrong: the identical predicate is written two ways. Filters escape `%`, `_` and `\` via `escapeLike`
and declare `ESCAPE '\'`; search interpolates the raw user string into an `ILIKE` pattern with no escaping and no
`ESCAPE` clause, so `%` and `_` act as wildcards. The in-memory repository (used by unit/integration tests and
any non-SQL plane) does a literal `includes`, so the two implementations return different rows for the same
search. The client's `highlightText` (`list-view/src/index.tsx:5182-5193`) also matches literally, so the
highlight and the row set disagree.

Consequence on the shipped Country route: typing `%` in the Country search box matches every row in the
authorized set (the query is a superset, not an empty result), and `_` matches any single character in any
position, so result sets are wrong for those inputs and can never be reproduced in the test suite. Row-level
authorization is still applied separately (`query-service.ts:294-310`), so this is a wrong-results bug, not a
data-exposure bug.

Mitigating code checked: the search string is parameterised (no SQL injection), bounded to 512 characters
(`entity-list-routes.ts:243`, `query-service.ts:198-203`) and length-checked against
`minimumQueryLength`; `escapeLike` exists and is used by the sibling filter path. No test asserts `%`/`_`
behaviour in either repository (`grep` for `"%"` search fixtures found none).

Fix (shared framework): `searchCondition` should use the same `escapeLike` and `ESCAPE '\'` as
`filterCondition`. Add a contract test that pins the semantics for `%`, `_` and `\` on both repositories.

## F4 — MEDIUM — "Previous" is disabled after a refresh/deep link/Back into a paginated page, and shared links are one-way

`packages/platform/entity/runtime/list-view/src/list-pagination.tsx:50`
```tsx
          <Button size="small" variant="secondary" disabled={!cursorHistory.length || loading} onClick={onPrevious}>Previous</Button>
```
`packages/platform/entity/runtime/list-view/src/index.tsx:1529-1543`
```tsx
              onPrevious={() => {
                const cursor = cursorHistory.at(-1);
                setCursorHistory(cursorHistory.slice(0, -1));
```
`packages/platform/entity/runtime/list-view/src/index.tsx:996-999`
```tsx
    const restore = () => {
      setCursorHistory([]);
      setState(readListLocation(descriptor));
    };
```
`server/packages/services/records/src/entity-list-service.ts:707`
```ts
          hasPrevious: false,
```

Why it is wrong: backward navigation exists only in the in-memory `cursorHistory` array. `state.pageIndex` is
decoded from the URL and used to render the correct range (`list-pagination.tsx:30`) but never enables
`Previous`; the server always returns `hasPrevious: false`, so there is no other source of a previous cursor.
Every path that rehydrates state from the URL (browser refresh, a shared/copied link, `popstate` restore at
`index.tsx:996`, or the entity-switch path) resets `cursorHistory` to `[]`.

Consequence on the shipped Country route: open page 3 of the Country list, refresh (or open the copied
"Copy link to this view" URL), and the page renders the correct third page with the correct `Showing 51–75 of …`
label but `Previous` is disabled — the user must edit the URL or click Back to leave the page. The copied
portable link (`location.ts:38-43`, which deliberately includes `cursor`/`page`, `url-state.ts:91-92`) is
one-way for the recipient.

Mitigating code checked: `hasPrevious`/`previousCursor` exist in the result contract
(`contracts/platform/entity-list/src/types.ts:315-316`) and are parsed (`parsers.ts:645-659`) but never
consumed — the server never populates them. `withoutNavigation` (`state.ts:3-5`) correctly clears the cursor on
filter/sort/view changes, so this affects only deep-linking/refresh, not normal paging.

Fix (shared framework, two options): (a) have the repository return a real `previousCursor` (it already has
the keyset values) and drive `Previous` from it when `cursorHistory` is empty; or (b) make the client
reconstruct the history by walking `pageIndex` and re-querying, or disable `Previous` visually only when
neither `cursorHistory.length` nor `state.pageIndex` indicates a previous page — and, if (b), stop emitting
`cursor`+`page` in the portable link since it cannot be navigated.

## F5 — MEDIUM — Fixed DOM ids (and duplicate global shortcuts) when more than one entity list is mounted

`packages/platform/entity/runtime/list-view/src/index.tsx:1630`
```tsx
  const searchId = embedding ? generatedSearchId : "entity-list-search";
```
`packages/platform/entity/runtime/list-view/src/index.tsx:3281,3290,3369`
```tsx
          id="entity-list-column-search"
...
              <h3 id="visible-columns-heading">Visible columns</h3>
...
              <h3 id="available-columns-heading">Available fields</h3>
```
`packages/platform/entity/runtime/list-view/src/index.tsx:3645,3648,3664,3666`
```tsx
              <Label htmlFor="entity-list-view-name">View name</Label>
...
                  id="entity-list-view-name"
...
                  <Label htmlFor="entity-view-visibility">Visibility</Label>
                  <Select
                    id="entity-view-visibility"
```
`packages/platform/entity/runtime/list-view/src/index.tsx:1755-1771`
```tsx
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      ...
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
```
`packages/platform/entity/runtime/form-detail/src/related-entity-section.tsx:254-261`
```tsx
      <EntityListRuntime
        key={revision}
        client={client}
        entityCode={entityCode}
        scopeCoordinate={scope}
        contentOnly
        viewNamespace={`${scope.parentEntityCode}.${scope.relationshipKey}`}
```

Why it is wrong: the unique-id workaround is keyed on `embedding`, but `EntityRelatedSection` (record-scoped
embedded list, part of the shared framework) mounts the runtime with `contentOnly` and **no** `embedding`, and
`EntityApplicationSection` does the same for application sections (`index.tsx:254-274`). Those instances take
the non-embedded branch: hardcoded `entity-list-search`, hardcoded Columns/Saved-views dialog ids, and a global
`keydown` listener each. Two such lists on one page (two related sections on a record page, or an application
section plus a list) produce duplicate `id`/`htmlFor` pairs — the `Label` associations in the Columns and Saved
views drawers then point at whichever element the browser resolves first — and pressing `/` or `Ctrl/Cmd+K`
focuses an arbitrary one of the search boxes (the last listener registered wins; `Ctrl/Cmd+K` is not gated on
`editing`, so it can steal focus out of another search box).

Consequence on the shipped Country route: the Country list route itself mounts exactly one
`EntityListRuntime` (`form-detail/src/entity-read-surface.tsx:21`), and the Country detail route currently
renders no related section (Country's published sections have no `relationshipKey`), so this does **not** bite
Country today. It is a latent framework defect that will bite the first entity whose detail page has two child
collections — exactly the "record-scoped embedded lists through the same framework" pattern AGENTS.md requires.

Mitigating code checked: `EntityRows` uses `useId()` for its radio group name (`index.tsx:4296`) and
`ColumnFilter`/`FieldSearchInput` use `useId()` where the id is generated internally, so this is confined to the
hand-written literals above. The lookup dialog path does pass `embedding` (`form-detail/src/entity-lookup.tsx:467`)
and is therefore safe.

Fix: base uniqueness on identity that always exists — `useId()` for the search field and every dialog id
(drop the fixed `entity-list-search`), and skip the URL-writing/popstate/global-shortcut behaviour for
`contentOnly`/`viewNamespace` mounts (see F6) rather than only for `embedding`.

## F6 — MEDIUM — Embedded record-scoped lists write their state into the host record URL and fight over it

`packages/platform/entity/runtime/list-view/src/index.tsx:856-857`
```tsx
        if (!embedding && !navigationOnly && !applicationOnly)
          writeLocation(nextState, next, "replace");
```
`packages/platform/entity/runtime/list-view/src/index.tsx:988`
```tsx
        if (!embedding) writeLocation(next, descriptor, history);
```
`packages/platform/entity/runtime/list-view/src/index.tsx:994-1001`
```tsx
  useEffect(() => {
    if (!descriptor || embedding) return;
    const restore = () => {
      setCursorHistory([]);
      setState(readListLocation(descriptor));
    };
    window.addEventListener("popstate", restore);
```
with `related-entity-section.tsx:254-261` mounting without `embedding` (quoted in F5).

Why it is wrong: all URL ownership and browser-history behaviour is gated on `embedding`, not on "is this list
the page's primary collection". A record-scoped related list is neither, yet it calls
`writeListLocation(nextState, next, "replace")` on mount, which replaces `window.location.search` for the
*record detail* URL via `relativeHref` (`location.ts:50`). With two related sections on one record page, each
section's mount/refresh replaces the same query string, so only the last writer's filters/columns/`vid` survive
and the other section's state is silently lost; both sections also attach a `popstate` listener that re-reads
the same shared URL and overwrite each other's state. `readListLocation` (`location.ts:8-21`) also reads
`window.location.search` for these sections, so a link with one section's `cols=`/`filter.*` is interpreted as
the other section's state.

Consequence on the shipped Country route: none today (Country has no related sections; its list route is the
primary collection and legitimately owns the URL). For any entity with a child collection, opening the record
page mutates the URL into entity-list parameters and multi-section pages are non-deterministic.

Mitigating code checked: `lookupInitialState`/`lookup-directory` exist for the `embedding` path and bypass URL
writing entirely; `EntityApplicationSection` passes `contentOnly` and its own `viewNamespace`
(`index.tsx:254-274`) but still gets the non-embedded URL behaviour, which is the same class of bug.

Fix: introduce an explicit `ownsLocation` (or reuse `viewNamespace !== undefined`) flag and gate
`writeLocation`, the `popstate` listener and `readListLocation` on it; embedded/related sections should keep
state in component memory (and, if persistence is wanted, in the display-preference store keyed by
`viewNamespace`).

## F7 — MEDIUM — `onNavigate` is not plumbed to rows, so the record-scoped list's in-place open never happens

`packages/platform/entity/runtime/list-view/src/index.tsx:620` (`onNavigate` destructured) with only two uses:
`packages/platform/entity/runtime/list-view/src/index.tsx:543-551` (page-level action anchors) and
`index.tsx:587` (`<EntityNavigation onNavigate=…>`); `grep -n "onNavigate" index.tsx` returns lines
316, 386, 543, 551, 587, 620 only.
`packages/platform/entity/runtime/list-view/src/index.tsx:4445-4448`
```tsx
  const openRecord = (row: EntityListRowV1) => {
    const href = chooser ? recordLink?.(row) : recordHref(descriptor, row);
    if (href) window.location.assign(href);
  };
```
`packages/platform/entity/runtime/form-detail/src/related-entity-section.tsx:260-264`
```tsx
        onNavigate={(href) => {
          const prefix = `/app/entity/${entityCode}/`;
          if (href.startsWith(prefix)) {
            const id = href.slice(prefix.length);
            if (/^[0-9a-f-]{36}$/i.test(id)) setEditing(id);
```
(and the identity cell renders a plain `<a href>` at `index.tsx:4498-4501`, plus `RowMenu → View` at
`index.tsx:4787-4791`).

Why it is wrong: `EntityRelatedSection` asks the runtime to intercept record navigation (to open the child
record inline), but `EntityRows` never receives `onNavigate`; row activation and row links therefore perform a
full `window.location.assign`/document navigation. The handler that was written for exactly this purpose is
dead for row clicks.

Consequence on the shipped Country route: Country's own list works (a full page navigation to the country
detail is the intended behaviour for a top-level list), so no Country regression. For any entity with a
record-scoped child list, clicking a child row leaves the record page and loses the inline-editor flow the code
intends — the "same framework, record-scoped embedded list" requirement is only cosmetically met.

Mitigating code checked: `recordHref` is derived from `descriptor.entity.detailRouteTemplate`
(`index.tsx:4816-4824`) and is `encodeURIComponent`-encoded, so the destination itself is safe; the defect is
only the missing interception.

Fix: pass `onNavigate` into `EntityRows`, and in `openRecord`/the identity anchor call
`onNavigate(href)` (with `preventDefault`) when it is supplied, exactly as the page-level actions already do at
`index.tsx:541-552`.

## F8 — MEDIUM — Descriptor publishes up to 10 sort levels; the list endpoint rejects more than 3 unless metadata declares a limit

`server/packages/services/records/src/entity-list-service.ts:961-962`
```ts
  const maxSortLevels =
    configuredLimits?.maxSortLevels ?? ENTITY_LIST_MAX_SORT_LEVELS;
```
`server/packages/services/records/src/query-service.ts:174-181`
```ts
      const maxSortLevels =
        descriptor.listPresentation?.limits?.maxSortLevels ?? 3;
      if ((query.sort?.length ?? 0) > maxSortLevels)
        throw new RecordServiceError(
          400,
          "TOO_MANY_SORT_FIELDS",
          `Record lists support at most ${maxSortLevels} sort fields`,
        );
```
`packages/platform/entity/runtime/list-view/src/index.tsx:5276` (client builder uses the descriptor value)
```ts
  if (!additive || maximum <= 1) return nextPrimarySort(current, field);
```
with `maximum` = `descriptor.limits.maxSortLevels` (`index.tsx:1512`).

Why it is wrong: the two layers fall back to different numbers (10 vs 3) when an entity's `listPresentation`
has no `limits`. The descriptor therefore advertises 10 (and `SortDialog` fills its `Maximum` metric and
`maximum = Math.min(descriptor.limits.maxSortLevels, fields.length)` from it, `index.tsx:2933`), the client
sends what the user asks for, and the API answers `400 TOO_MANY_SORT_FIELDS`.

Consequence on the shipped Country route: **none.** Country's compiled list surface declares
`maxSortLevels: 3` (`server/packages/planes/studio/meta-entity-authoring/src/authoring/graph-builder.ts:68`:
`limits: { defaultPageSize: 25, allowedPageSizes: [10, 25, 50, 100], maxSortLevels: 3, countMode: "exact" }`),
so descriptor and server agree at 3. This is reported because it is a broken-gate class defect for any entity
onboarded without an explicit `limits` block: shift-clicking one sort level too many yields a persistent 400
error state and, because sort is in the URL, a shareable link that breaks the list for everyone.

Mitigating code checked: `entity-list-service.ts:614-619` caps at 10 before delegating; the route schema caps at
`MAX_LIST_SORT_LEVELS` = 10 (`entity-list-routes.ts:261-270`); the client-side `parseListLocationState` also
drops levels beyond the descriptor value (`parsers.ts:748-749`). All three agree on 10; only `query-service`
disagrees at 3.

Fix: derive one number. Either default both to the same constant, or have `entity-list-service` publish
`descriptor.listPresentation?.limits?.maxSortLevels ?? 3` so the browser can never offer what
`query-service` rejects.

## F9 — MEDIUM — The whole list chrome is hardcoded English while field and entity labels are localized

`packages/platform/entity/runtime/list-view/src/index.tsx:1125`
```tsx
          title="Loading list"
```
`packages/platform/entity/runtime/list-view/src/index.tsx:1930,1936,1943`
```tsx
            placeholder={`Search by ${searchHint(descriptor)}…`}
...
          name={activeView?.name ?? "System default"}
...
            <MenuItem onClick={reset}>System default</MenuItem>
```
`packages/platform/entity/runtime/list-view/src/index.tsx:4332-4344`
```tsx
            (query?.trim()
              ? `No results for “${query.trim()}”`
              : constrained
                ? "No matching records"
                : `No ${descriptor.surface.title.toLocaleLowerCase()} to display`)}
        </h2>
        <p>
          {constrained
            ? (emptyContent?.noMatchesDescription ??
              "Try another search term or adjust your filters.")
            : emptyAction
              ? (emptyContent?.emptyDescription ??
                "You can request a new record below.")
              : "There are no records to display."}
```
`packages/platform/entity/runtime/list-view/src/list-pagination.tsx:37-38,44,50-51`
```tsx
        ? `Showing ${formattedRange}${page.pagination.hasNext ? " · more available" : ""}`
        : `Showing ${formattedRange} of ${countPrefix}${new Intl.NumberFormat().format(total)}`;
...
          <span>Rows per page</span>
...
          <Button size="small" variant="secondary" disabled={!cursorHistory.length || loading} onClick={onPrevious}>Previous</Button>
          <Button size="small" variant="secondary" disabled={!page.pagination.hasNext || !page.pagination.nextCursor || loading} onClick={onNext}>Next</Button>
```
`packages/platform/entity/runtime/list-view/src/drawer-registry.tsx:10-15`
```tsx
  { key: "filters", label: "Filters", ... description: (d) => `Refine the authorized ${d.entity.pluralLabel.toLocaleLowerCase()} list.` },
  { key: "sort", label: "Sort", ... },
```

Why it is wrong: the framework has a working message catalogue and uses it for transient notices and errors
(`entityIntl.message("list.notice.…")`, `index.tsx:1920` (the notice text is rendered there and set at `:2138`, `:1725`, `:1731`); catalogue at
`packages/platform/foundation/i18n/src/catalogs/entity-runtime.ts:3-15`), and it *does* localize metadata labels
(`localizeEntityLabels`, `index.tsx:630-634`, driven by the descriptor's `localizedLabels` which the server
publishes from the same `layoutConfig`, `entity-list-service.ts:1004`). Everything else in the list chrome is a
literal. Measured in `index.tsx` alone: **44** distinct capitalised `label`/`title`/`placeholder`/`aria-label`
attribute strings and **37** distinct JSX text nodes, in addition to the same pattern in `list-pagination.tsx`,
`drawer-registry.tsx`, `columns.ts` (`:10` "Date and time", `:14` the six group labels), `state.ts:24`
(the `describeFilter` operator words) and `data-operations.tsx` (its own `title()`/`formatLabel()` helpers).

Consequence on the shipped Country route: the Country catalogue ships `Negara`/`Wilayah`/`Alamat` etc.
(`packages/platform/foundation/i18n/src/catalogs/country.ts`), so in the `ms` and `ar` locales the Country list
renders localized column headings and entity name inside English chrome — "Search by iso alpha-2, nama…",
"Filters", "Sort", "Columns", "Showing 1–25 of 247", "Previous"/"Next", "No results for …" — a mixed-language
screen and a WCAG 3.1.1/3.1.2 (language of parts) problem.

Mitigating code checked: `list-notice.ts:11-13` deliberately makes only one notice visible; the catalogue simply
has no list-chrome keys (`grep -rn` over `packages/platform/foundation/i18n/src/catalogs/**` and `packages/platform/shell/shell/src/messages.ts` matches "Filters" only in `activity.filters`/`files.filters`, and finds no `Rows per page`/`Previous`/`Showing` entries), so this is missing
coverage rather than a wrong lookup. No hardcoded string renders a raw key.

Fix: move the chrome strings into `entity-runtime.ts` (or a new `list.chrome.*` catalogue) and resolve them via
`useEntityI18n()`/`useOptionalI18n()`, including `aria-label`s; keep entity-specific text in metadata as it is
today.

## F10 — MEDIUM — Locale-less `Intl` formatting in the same view that formats the same number with the app locale

`packages/platform/entity/runtime/list-view/src/index.tsx:1087` (locale-aware)
```tsx
          ? new Intl.NumberFormat(locale).format(page.rows.length)
```
`packages/platform/entity/runtime/list-view/src/index.tsx:1790-1797` (same count, default locale)
```tsx
      : `${page?.pagination.countMode === "approximate" ? "≈" : ""}${new Intl.NumberFormat().format(count)}`;
  const resultCountLabel =
    countLabel ??
    (page
      ? `${new Intl.NumberFormat().format(page.rows.length)}${page.pagination.hasNext ? "+" : ""}`
      : undefined);
```
also `index.tsx:4677`, `index.tsx:4693`, `index.tsx:5219`, `list-pagination.tsx:32,38`,
`data-operations.tsx:41,66,70,93,103`.

Why it is wrong: `useOptionalI18n()?.localization.uiLocale` is already read (`index.tsx:626` as `locale`,
`index.tsx:1657` as `viewLocale`) and used for `Intl.NumberFormat(locale)` at `index.tsx:1087` and for
`resolveEntityText(..., locale)`, but every other count is formatted with the runtime default locale. The same
number is therefore rendered two ways on one screen.

Consequence on the shipped Country route: with an `ar`/`ms` UI locale, the page header count uses the app
locale while the filter/sort drawer "Records" metric, the selection bar count, the `N records` suffix and the
pagination range use the browser locale — different digit shapes / separators for the same figure, and a
screenshot-visible inconsistency. `formatFieldValue` has the same problem for dates
(`index.tsx:5136`, `new Intl.DateTimeFormat(undefined, …)`) and for region names on `country_code` fields
(`index.tsx:5149`, `Intl.DisplayNames(undefined, {type:"region"})`).

Mitigating code checked: `formatFieldValue` takes no locale parameter at all, so the fix has to thread one
through `renderFieldValue`; no test asserts formatting for a non-default locale.

Fix: thread `locale` (already in scope) into `listCountLabel`, `SelectionBar`, `EntityListPagination`,
`DataOperationsControl` and `formatFieldValue`/`renderFieldValue`, or centralise an
`useEntityFormatters()` hook.

## F11 — LOW — Localized entity label is interpolated into a `RegExp` without escaping

`packages/platform/entity/runtime/list-view/src/index.tsx:5205-5213`
```tsx
  return [...descriptor.fields]
    .sort((left, right) => priority(left) - priority(right))
    .slice(0, 3)
    .map((field) =>
      field.label
        .replace(new RegExp(`^${descriptor.entity.label}\\s+`, "i"), "")
        .toLocaleLowerCase(),
    )
    .join(", ");
```
and the producer of that label, `packages/platform/foundation/i18n/src/entity-labels.ts:24-25`
```ts
    entity: { ...descriptor.entity,
      label: intl.text(labels?.entity ?? descriptor.entity.label),
```

Why it is wrong: `descriptor.entity.label` at render time is the **translated catalogue string**, not the
metadata code. A translation containing an unbalanced `(`, `[`, `+` or `\` makes `new RegExp` throw a
`SyntaxError` during `ListChrome` render (the placeholder at `index.tsx:1930`), which is a render-phase error
and therefore reaches `SurfaceErrorBoundary` (`index.tsx:357-367`) and replaces the entire Country list with the
error surface.

Consequence on the shipped Country route: latent. The shipped catalogue values are
`["Country", "Negara", "البلد"]` (`packages/platform/foundation/i18n/src/catalogs/country.ts:5`), none of which
contain regex metacharacters, and the untranslated metadata label is derived from the canonical entity code
(`entity-list-service.ts:928`, `humanize("country")`), so today the pattern is always safe. The failure needs a
future translation string; when it happens it takes down the primary screen for that locale only, which is
exactly the kind of defect that is hard to attribute.

Mitigating code checked: the descriptor's `entity.label` cannot come from arbitrary metadata (it is either
`humanize(entityCode)` or the `localizedLabels.entity` translation), and `parsePresentationLocalization`
validates the message key but not the message text. So the only escape-free input is a catalogue string.

Fix: escape the interpolated label (`label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`) or drop the RegExp and use
`startsWith`/`slice` on the lower-cased values.

## F12 — LOW — The list-state parser accepts filters that the list endpoint rejects, and the saved-view validator reuses it

`packages/contracts/platform/entity-list/src/parsers.ts:722-745`
```ts
    const operator = oneOf(
      item.operator,
      FILTER_OPERATORS,
      `filters[${index}].operator`,
    );
    if (!descriptor.filterOperators.includes(operator)) continue;
    const value =
      item.value === undefined
        ? undefined
        : json(item.value, `filters[${index}].value`);
    filters.push(
      Object.freeze({
        field,
        operator,
        ...(value !== undefined ? { value } : {}),
      }),
    );
```
`server/packages/services/records/src/records-routes.ts:86-89`
```ts
  const hasValue = Object.hasOwn(parsed, "value");
  const presence = operator === "is_null" || operator === "is_not_null";
  if (presence && hasValue) throw new RecordServiceError(400, "INVALID_FILTER", `filter[${index}] must not contain a value`);
  if (!presence && !hasValue) throw new RecordServiceError(400, "INVALID_FILTER", `filter[${index}].value is required`);
```
`server/packages/platform/preferences/src/entity-views-routes.ts:264`
```ts
  const parsed = parseSaveableListState(raw, descriptor),
```

Why it is wrong: `parseState` validates the operator against the field but never validates value *presence*
against the operator. `{operator:"eq"}` with no value and `{operator:"is_null",value:"x"}` are both accepted by
`decodeListLocationState` and by `parseSaveableListState`; the query endpoint rejects both with
`400 INVALID_FILTER`. Because `validateViewState` is built on the same parser (plus a length-equality check that
these filters pass), a saved view can be stored with such a filter.

Consequence on the shipped Country route: a hand-edited or third-party link such as
`/app/entity/country/?filter.code={"operator":"eq"}` (or a saved view created while such a URL was loaded)
loads client state that the API always rejects, so the Country list presents the generic error card and retry
never helps until the filter is removed. The UI itself cannot produce this shape (`filterValidationError`
requires a value, `filter-editor.tsx:126`), so this is a robustness gap, not a normal-path bug.

Mitigating code checked: the server rejects it loudly (no silent widening), the client-side parser drops
operators the field does not publish, and unknown fields are dropped, so there is no injection or elevation path.

Fix: enforce presence/absence in `parseState` (`presence === (value === undefined)` → drop the filter), so both
the URL codec and the saved-view validator match the query endpoint exactly; keep the server check as defence in
depth.

## F13 — LOW — Dead CSS: five class families with no producer in the runtime

`packages/platform/entity/runtime/list-view/src/styles.css:6-7`
```css
.a-entity-list__context-row,.a-management-toolbar.a-entity-list__query-row{display:flex; ...
.a-entity-list__context-row{min-height:2.75rem;justify-content:space-between}
```
`styles.css:50-53` (`.a-entity-list__chips` ×3 rules + the `@media` override at `:311`),
`styles.css:37` (`.a-entity-list__search-icon`), `styles.css:198-203`
(`.a-entity-list__relative-date-options`, 6 rules), `styles.css:485-488` (`.a-entity-list__choice-options`,
4 rules).

Why it is wrong: `grep -l` across all `.tsx` in the package returns no file containing
`a-entity-list__context-row`, `a-entity-list__chips`, `a-entity-list__search-icon`,
`a-entity-list__relative-date-options` or `a-entity-list__choice-options`. The date/choice option popovers were
replaced by design-system `SearchableSelect`/`Select` (`collection-controls/src/filter-editor.tsx:365,592`), and
the toolbar markup was replaced by `ManagementToolbar` (`index.tsx:1922`), but their CSS remains.

Consequence on the shipped Country route: no runtime effect (dead selectors); it inflates the list stylesheet
and hides which rules are load-bearing during the next regression.

Mitigating code checked: the remaining 27 raw `px` occurrences and the class names referenced from the TSX
were checked; only the five above have zero producers.

Fix: delete the five selector groups.

## F14 — LOW — CSS token bypasses and arbitrary values in the list stylesheet

`packages/platform/entity/runtime/list-view/src/styles.css:484-488`
```css
.a-entity-list__choice-chips button{border:1px solid var(--a-border);...}
.a-entity-list__choice-options{position:absolute;z-index:calc(var(--a-z-popover) + 1);...max-height:15rem;...}
```
`styles.css:492`
```css
.a-directory-filter{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(0,2.5fr);gap:1.5rem}.a-directory-filter aside{...border-inline-end:1px solid var(--a-border);...font-weight:600}
```
`styles.css:5,32,61,81,139` hardcode `z-index:4`, `8`, `2`, `3`, `6` while `var(--a-z-popover)` /
`calc(var(--a-z-popover) + 1)` is used at `:198` and `:485`, and `var(--a-z-popover,1000)` only at `:451`.

Why it is wrong: `--a-border-width` exists and is used elsewhere in the same file, `--a-font-weight-strong`
exists (`:61`) while `:492` writes `600`, `--a-radius-*` exists while `:496` writes `.5rem`, and stacking is
partly tokenised and partly magic-numbered. The sticky-header script
(`sticky-table-header.ts:25`) depends on those stacking relationships, so the values cannot be changed locally
without cross-file reasoning.

Consequence on the shipped Country route: no functional bug today; it is a design-system ratchet violation and a
maintenance hazard (`governance/config/governance/design-system-ratchet.json` is already modified in this
working tree).

Mitigating code checked: 334 of the stylesheet's declarations use `var(--…)`; the offenders are the ~12 listed
above, not the whole file.

Fix: replace with `var(--a-border-width)`, `var(--a-font-weight-strong)`, `var(--a-radius-*)`, `var(--a-space-*)`
and `var(--a-z-*)` equivalents.

## F15 — LOW — Spreadsheet/board/dashboard list state is contract-complete but unreachable, and unsupported modes render as a table

`packages/platform/entity/runtime/list-view/src/index.tsx:4432-4444` (compact branch) and `:4524-4525` (the only
other branch)
```tsx
  if (mode === "compact")
    return group ? ( ... ) : ( cards(page.rows) );
...
  return (
    <StickyListTable sticky={!chooser} aria-busy={loading}>
```
`packages/contracts/platform/entity-list/src/url-state.ts:146-165` (full `sheet`/`pinned`/`width.*` codec)
with `grep -n "widths\|pinned" packages/platform/entity/runtime/list-view/src/*` returning **no** producer;
`state.spreadsheet` is only ever set to `undefined` (`index.tsx:1812,1953,3527`) and copied
(`preferences.ts:26`). Mode options are offered from the descriptor at `index.tsx:4057-4061`.

Why it is wrong: `mode` accepts `board`, `dashboard` and `spreadsheet`, the codec round-trips
`sheet`/`pinned`/`width.*`, and the saved-state type carries `SpreadsheetStateV1`, but no renderer or control
exists; any non-`compact` mode falls through to the plain table, and no UI can ever set spreadsheet state.

Consequence on the shipped Country route: none — Country publishes `supportedModes: ["table","compact"]`
(`graph-builder.ts:67`), both of which are implemented. For an entity that publishes `board`/`dashboard`, the
Display settings dialog offers the mode and the user silently gets a table with no explanation, and the
spreadsheet half of the URL contract is dead weight.

Mitigating code checked: `parseListLocationState` clamps to `supportedModes` (`parsers.ts:778-781`), so a
hand-written `?view=board` for Country is normalised to `table` — there is no broken state, just a misleading
option for other entities.

Fix: either implement the modes or fail descriptor validation when `supportedModes` contains a mode with no
renderer, and delete the unreachable spreadsheet codec/state until a control produces it.

## F16 — LOW — Stale query-parameter names in the "did the URL carry explicit state" check

`packages/platform/entity/runtime/list-view/src/location.ts:15`
```ts
  const explicit=[...parameters.keys()].some(key=>["standardView","vid","bvid","q","sort","group","group.clear","density","view","columns","cols","col.remove","col.move","filters","page","pageSize","cursor","lst"].includes(key)||key.startsWith("filter.")||key.startsWith("col.")||key.startsWith("sheet"));
```
`packages/contracts/platform/entity-list/src/url-state.ts:55,113-121`
```ts
  if (parameters.has("cols") || parameters.has("col.rm") || parameters.has("col.at")) apply({ columns: decodeColumns(parameters, state.columns) });
...
  const removed = new Set(split(parameters.get("col.rm")));
```

Why it is wrong: the codec writes and reads `col.rm` / `col.at`; `col.remove` / `col.move` do not exist
anywhere in the codebase, and `columns` is not a URL parameter either. The check silently relies on the
`key.startsWith("col.")` fallback for those, so it works by accident and documents a contract that was replaced.

Consequence on the shipped Country route: none (the fallback covers it); it is a correctness trap — a future
edit that narrows the `startsWith` clauses, or a reader who trusts the list, gets the personal/shared default
view applied on top of explicit column state.

Fix: build the explicit-key list from the codec (export the parameter-name set from `url-state.ts`) or drop the
literal list and use the `filter.`/`col.`/`sheet`/`width.` prefixes plus the scalar keys the encoder can emit.

## F17 — LOW — Two near-identical "saveable state" helpers with opposite `query` behaviour

`packages/contracts/platform/entity-list/src/url-state.ts:97-104`
```ts
export function toSaveableListState(state: ListLocationStateV1): SaveableListStateV1 {
  return Object.freeze({
    ...(state.standardViewKey ? { standardViewKey: state.standardViewKey } : {}),
    ...(state.query ? { query: state.query } : {}), filters: state.filters, sort: state.sort,
```
`packages/platform/entity/runtime/list-view/src/preferences.ts:17-28`
```ts
export function saveableViewState(state: ListLocationStateV1): SaveableListStateV1 {
  return Object.freeze({
    ...(state.standardViewKey?{standardViewKey:state.standardViewKey}:{}),
    filters: state.filters,
    sort: state.sort,
```
Why it is wrong: names differ by two characters, bodies are otherwise the same, and the only semantic
difference is `query` (kept by the contract helper, intentionally dropped by the runtime helper so that search
is not saved — see the UI copy at `index.tsx:3682-3683`). `toSaveableListState` has exactly one caller, a test
(`tests/contracts/entity-list-contract.test.ts:12,240`).

Consequence on the shipped Country route: none directly; it is a duplicate-logic hazard where a future caller
picking the wrong one would persist/restore the Country search term unexpectedly.

Fix: rename `toSaveableListState` to make the difference explicit (e.g. `toPortableSaveableListState`) and add
the `query`-dropping variant there, or delete it and export the runtime helper.

## F18 — LOW — `StickyListTable` rebuilds its observers and scroll listeners on every render

`packages/platform/entity/runtime/list-view/src/sticky-table.tsx:7`
```tsx
  useEffect(() => sticky && ref.current ? attachStickyTableHeader(ref.current) : undefined, [children, sticky]);
```
`packages/platform/entity/runtime/list-view/src/sticky-table-header.ts:38-47` (creates a `ResizeObserver`,
observes 5 elements, adds capture-phase `scroll` + `resize` listeners, and removes them on cleanup).

Why it is wrong: `children` is a new React element tree on every render of `EntityRows`, so the effect cleanup
and setup run on every re-render — including selection toggles and page/layout changes. Between teardown and
the `requestAnimationFrame` update the sticky heading has no offset, which can produce a one-frame jump, and
the observer/listener churn is unnecessary work in the primary list view.

Consequence on the shipped Country route: no incorrect output observed by reading the code (the `update()`
inside `attachStickyTableHeader` runs synchronously and re-applies the offset), so this is a perf/robustness
issue, not a functional break.

Mitigating code checked: the effect returns the detach function correctly and `update()` is called immediately
on attach (`sticky-table-header.ts:42`), so the header is not left stranded.

Fix: key the effect on stable inputs (`[sticky]`) and observe the table element for content changes, or pass a
memoised `children`.

## F19 — LOW — Column-filter Apply replaces every filter on the same field

`packages/platform/entity/runtime/list-view/src/index.tsx:4915-4918`
```tsx
  const apply = (next: readonly ListFilterV1[]) => {
    rememberFilters(recentFilterKey(descriptor), next, descriptor.fields);
    onApply([...filters.filter((item) => item.field !== field.key), ...next]);
```
Why it is wrong: the parser and the server both allow more than one filter per field (no de-duplication in
`parseState`, `parsers.ts:722-745`; the FilterDialog can hold several rows for the same field because
`setQuickFilter` uses `draft.find(...)` on only the first match, `index.tsx:2514`), but the inline column
filter drops all existing filters for the field before adding its own. A second condition on the same column
disappears without a message.

Consequence on the shipped Country route: a user who configured two conditions on, say, `code` in the Filters
drawer and then uses the column filter icon on `code` silently loses the other condition (and the result set
silently widens). Recoverable by reopening the Filters drawer.

Mitigating code checked: `describeFilter`/`AppliedFilters` render each filter as its own chip with an
individual remove action (`index.tsx:1859-1867`), which confirms multiple filters per field are a supported
state — so this is a real inconsistency, not an unsupported state.

Fix: merge instead of replace (append `next`, or replace only the filters whose operator matches the ones being
edited), consistent with `FilterDialog.apply`.

---

# Verified healthy (do not churn)

1. **URL codec round-trip for the state the UI actually produces.** I traced encode/decode symmetry by hand for
   the column delta encoding (`col.rm` + `col.at` with base-36 indices, `lastIndexOf(":")` split, catalog-code
   charset that excludes `:`) at `url-state.ts:109-144`; for explicit clearing (`q=`, `filters=none`,
   `sort=none`, `group.clear=1`, `sheet=none`, empty `standardView=`, `pageSize`) at
   `url-state.ts:72-93` against `:52-64`; and for the saved-view base-relative encoding
   (`{baseState}`/`includeViewIds:false`) at `location.ts:23-43`. All are covered by real assertions in
   `tests/contracts/entity-list-contract.test.ts:229-368`.
2. **Malformed/hostile URL input is normalised, not fatal.** Every optional parameter is applied through the
   `apply` helper, which catches `TypeError` and keeps the settings that were already valid
   (`url-state.ts:32-40`), and a URL longer than `ENTITY_LIST_MAX_URL_LENGTH` (8 192) falls back to the base
   state instead of failing (`url-state.ts:18`). Descriptor errors and a bad `baseState` are deliberately
   *not* swallowed (`url-state.ts:15,17`, asserted at `entity-list-contract.test.ts:28-29`).
3. **Request cancellation and out-of-order responses.** Each descriptor/list/bookmark effect owns an
   `AbortController`, aborts on cleanup, and re-checks `controller.signal.aborted` before every `setState`
   (`index.tsx:729-883`, `885-942`, `945-967`); the filter-choice loader additionally guards with a scope
   token (`activeChoiceScope`, `index.tsx:695-700,1350-1354`), and stale descriptor responses are rejected when
   the scope/descriptor hash moved (`index.tsx:1355-1374`).
4. **Authority verification and retry classification.** The list response must match the descriptor hash and
   scope fingerprint or it is converted into a parse error (`index.tsx:912-918`, `5342-5355`), and
   `retryRequiresDescriptor` routes parse/401/403/409 failures back through a descriptor reload
   (`retry-policy.ts:2-4`, `index.tsx:659-662`) — a good fail-closed pattern that should be preserved.
5. **Cursor binding.** The server cursor is bound to descriptor hash, plane, tenant, cursor scope (which itself
   hashes principal/profile/schema/collection constraints, `query-service.ts:440-457`), filters, sort, group,
   search and projection, and a mismatch is a 400 `INVALID_CURSOR` rather than wrong rows
   (`record-cursor.ts:24,30-32,35-48`). The client clears the cursor on every filter/sort/view/page-size change
   through `withoutNavigation` (`index.tsx:1237-1243`, `state.ts:3-5`).
6. **Bookmark optimistic updates.** The mutation is applied optimistically with an epoch token, deduplicated
   per record, rolled back only for its own ids (`bookmark-state.ts:2-6`, `index.tsx:1250-1328`), and the
   in-flight map is guarded against stale epochs. Concurrent unrelated results are preserved.
7. **Saved views are not optimistically mutated.** `SavedViewsDialog.command` awaits the server, disables the
   controls with `busy`, surfaces the error text, and only adopts the returned catalog
   (`index.tsx:3537-3571,3815-3879`). Locally stored views are re-validated against the live descriptor on read,
   inside a `try/catch`, so a metadata change cannot inject a stale state (`preferences.ts:42-65`).
8. **Server-side filter admission is independent of the descriptor.** `validateQueryFields` re-checks
   `field.filterable`, readability and `recordFieldFilterOperators(field)` per filter/sort/group/projection
   (`query-service.ts:494-554`), and `list-query-policy.ts:12-16` intersects metadata-configured operators with
   the field-type policy, so the browser's published `filterOperators` are never the only enforcement. The
   `country_code` narrowing (`entity-list-service.ts:1382-1391`) is applied on both sides.
9. **Scope/work-context contracts are strict.** `parseEntityWorkContextRequirement` rejects unknown properties
   and empty coordinates (`parsers.ts:1347-1372`), digests must match `sha256`/64-hex (`parsers.ts:1189-1194`)
   and localized text must carry its default locale (`experience.ts:154-167`) — descriptor failures are loud,
   which is the correct direction for a configuration error.
10. **Accessibility basics.** The table has a `<caption>`, `aria-sort` on sortable headers, labelled selection
    checkboxes, `role="status"`/`aria-live` for the count and the selection bar, a labelled sort-target
    `aria-label` per column, and Escape/outside-click handling on the column-filter popover
    (`index.tsx:4526-4535,4561-4567,4481-4489,4674,4919-4931,4880-4895`).

# Checked but not a defect

- **Duplicate-field filters** are accepted by the parser and the server (`parsers.ts:722-745` has no
  per-field de-duplication; `records-routes.ts:62` maps every `filter` entry) — the only client-side
  inconsistency is F19.
- **Empty-string edge cases in the codec**: `q=""`, `standardView=""`, `group=""`, `view=` and
  `page=0` all normalise to "unset"/base, and the encoder deliberately omits page 0 and metadata defaults
  (`url-state.ts:72-93`), asserted at `entity-list-contract.test.ts:250-259`.
- **`sort=name` (missing direction)** throws inside `oneOf`, is caught by `apply`, and leaves the rest of the
  URL intact (`url-state.ts:45-51`); the duplicate/unknown sort entries in the same parameter are dropped
  individually by `parseState` (`parsers.ts:748-769`).
- **`decodeColumns` bounds**: `cols` is split to at most 100 entries, unknown fields are dropped in
  `parseState`, and the identity field is re-inserted and the list truncated to 100
  (`url-state.ts:109-124`, `parsers.ts:770-776`).
- **`width.<field>=abc`** produces `NaN`, which `parseSpreadsheet` rejects via `integer(...)`; the patch is
  discarded and the URL round-trip still works (`url-state.ts:152-155`, `parsers.ts:1024-1045`).
- **`pageSize` outside `allowedPageSizes`** falls back to the descriptor default on both encode and decode
  (`parsers.ts:835-837`, `url-state.ts:93`), and Country's sizes `[10,25,50,100]` are inside the server's
  1–100 admission window (`query-service.ts:167-173`), so no `INVALID_LIMIT` is reachable for Country.
- **`resolveEntityText` fallback** always has the default locale present because `parseEntityLocalizedText`
  requires it (`experience.ts:164-165`).
- **`parseEntityNavigationHref`** rejects any href containing `.`, `?`, `#`, `:` or `%`
  (`experience.ts:178-186`). That is a deliberate static-same-origin allowlist and it fails loudly at
  descriptor-parse time, not silently; Country publishes no navigation actions on the list surface, so it is
  not exercised.
- **Bulk `Select all N matching records`** is gated on `descriptor.dataOperations.export.filtered.state ===
  "enabled"` and `pagination.total`, and the favourites menu is hidden in that mode
  (`index.tsx:4688-4695,4697-4721`) — the all-matching path is consistent (unlike the partial-selection path,
  F1).
- **`Select`/`ChoicePicker` "select all"**: `SearchableSelect` has no bulk-select affordance (its `all` message
  is a group label, `packages/platform/foundation/ui/src/searchable-select.tsx:554-578`), so F2's trigger is the
  free-text comma input, not one click on a 247-entry country picker.
- **Grouped-row keyboard navigation**: ArrowUp/Down move to `nextElementSibling` and `.focus()` is a no-op on
  the non-focusable group header row (`index.tsx:4469-4476`, `4626-4632`). I checked reachability: no Country
  field is `groupable` (the shared-reference graph never sets `list.groupable`, and the Group drawer gates on
  `d.some(f => f.groupable)`, `drawer-registry.tsx:13`), so grouping is unavailable for Country and this is not
  reachable.
- **`describeFilter`/`formatFieldValue` output** is a plain string built from the descriptor value kind; no
  record value is interpolated into HTML (`highlightText` returns React nodes, `index.tsx:5182-5193`), so no
  injection path via filter chips or highlighting.
- **Test health for this area**: the three suites that touch these modules import only existing files —
  `tests/foundation/entity-list-columns.test.ts:4` → `list-view/src/columns` (exists),
  `tests/foundation/entity-list-phase1a.test.tsx:24` → `list-view/src/index` (exports
  `EntityListRuntime`, `EntityApplicationSection`, `DirectoryFilterContext`; all present at
  `index.tsx:27-31,228,341`), `tests/contracts/entity-list-contract.test.ts:13,21` →
  `contracts/platform/entity-list/src/index` and `list-view/src/state` (both exist). No missing-module import
  and no non-collecting suite found in this area.
- **`descriptor-client/src/**`**: it is the record-detail/record client (`runtime-client.ts`), not on the list
  path; its parsers validate ids, hashes, layouts and capability bounds before use
  (`runtime-client.ts:202-368`). `collaboration`/`section` accept an unvalidated `cursor`/`limit`
  (`runtime-client.ts:157-178`), but those are bounded server-side like the list cursor and are outside the
  Country list path, so I am not raising them beyond this note.

# Already fixed / changed by the in-flight working-tree work

- **Whole-link loss on one bad parameter is fixed.** `git show HEAD` had a single monolithic
  `try { return parseListLocationState({...}) } catch { return locationFromBase(base, descriptor) }` in
  `decodeListLocationState`, so one invalid parameter (`density=bad`) discarded the entire shared link. The
  current tree replaces it with the per-parameter `apply` helper and the `filters` accumulator
  (`url-state.ts:19-65`), which preserves every independently valid setting and explicitly comments why. The
  existing test at `entity-list-contract.test.ts:31-41` now documents that behaviour, and
  `tests/foundation/entity-list-phase1a.test.tsx` covers URL/state handling around it.
- **`spreadsheet` decoding on decode** is now only applied when `sheet`/`pinned`/`width.*` is actually present
  (`url-state.ts:58-59`), instead of being computed unconditionally, so an unrelated parameter cannot silently
  reset widths.
- Changes to `parsers.ts`/`types.ts` (`+45`/`+22`) are within the limits/validation area I audited; the
  behaviours I verified above (presence validation gap, F12; 100-element JSON bound, F2) are present in both
  HEAD and the working tree, so they are pre-existing, not introduced.
- The pre-existing nature of F1, F5, F9, F10, F15, F18 and F19 was confirmed against `git show HEAD:` (e.g.
  `selectedRows` and `selectedCount={selectedIds.size}` exist identically at HEAD lines 1096-1097 and 1367).

# Suggested order of work

1. F1 (silent partial actions on a selection the UI over-reports) and F2 (client crash + guaranteed 400) —
   both are reachable from the Country list without any hostile input.
2. F3 (search semantics), F4 (backward pagination after refresh) and F9/F10 (the list chrome's language and
   number formatting) — visible on every Country list screen.
3. F5–F7 (embedded record-scoped lists: DOM ids, URL ownership, `onNavigate`) — do these together, they are the
   same missing "this list is embedded" boundary.
4. F8, F11, F12 — contract/validation alignment.
5. F13–F19 — dead code, tokens and duplication; batch them as a cleanup with the design-system ratchet.
