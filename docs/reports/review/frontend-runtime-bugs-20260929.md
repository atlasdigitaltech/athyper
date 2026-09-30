# Frontend Entity Framework review — `/app/entity/country` (list + detail)

Scope: the frontend request path for `apps/neon` `/app/entity/[entityCode]/[[...segments]]/page.tsx`
through the shared Entity Framework list/detail runtimes, the entity-list URL-state contract,
the plane wrappers and the app adapters. Read-only review: no source file was modified.

Line numbers refer to the **current working tree** (`packages/platform/entity/runtime/list-view/src/index.tsx`
was edited by concurrent work while this review was in progress; every citation below was
re-checked against the file as it stands now — 5,703 lines). Findings were first identified and
then re-verified after the file changed; the code in every cited region is unchanged.

Findings are ordered by severity.

---

## Bugs

### [high] One malformed URL parameter silently discards the whole list state and rewrites the URL

- Location: `packages/contracts/platform/entity-list/src/url-state.ts:35-53`, with the throwing
  validators at `packages/contracts/platform/entity-list/src/parsers.ts:776-780`, `:806`,
  `:811-814`, `:1170-1174`; the persisting write at
  `packages/platform/entity/runtime/list-view/src/index.tsx:859-860`.
- What is wrong: `decodeListLocationState` wraps the *URL-derived* state parse in
  `try { … } catch (error) { if (!(error instanceof TypeError)) throw error; return locationFromBase(base, descriptor); }`.
  Every URL-input validator inside `parseState` throws `TypeError` for a value it dislikes
  (`mode`, `density`, `pageSize`, `page`, and a query longer than 512 chars), so a single bad
  parameter makes the whole parsed state fall back to the saved-view/default base — filters,
  search, sort, columns, group and spreadsheet included. The comment above the function claims the
  opposite contract ("Descriptor and saved-base failures are programming/configuration errors, not
  optional URL input. Never swallow them in the normalization boundary."), but the `try` block
  starts *after* `parseEntityListDescriptor` (line 15) and `normalizedBase` (line 17), so the catch
  only ever sees optional URL input. The caller then immediately persists the loss.
- Evidence:
  ```ts
  // url-state.ts:35-53
  try { return parseListLocationState({
    standardViewKey: parameters.has("standardView") ? parameters.get("standardView") || undefined : base.standardViewKey,
    …
    ...(parameters.has("page") ? { pageIndex: Number(parameters.get("page")) } : {}),
    ...(parameters.has("pageSize") ? { pageSize: Number(parameters.get("pageSize")) } : {}),
  }, descriptor); } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return locationFromBase(base, descriptor);
  }
  ```
  ```ts
  // parsers.ts:776-780 / :806 / :811-814 / :1173
  const requestedMode = oneOf(record.mode, MODES, "mode");              // throws on "?view=grid"
  density: oneOf(record.density, DENSITIES, "density") as ListDensity,  // throws on "?density=wide"
  const pageSize = record.pageSize === undefined ? undefined
    : integer(record.pageSize, "pageSize", 1, 500);                     // throws on "?pageSize=0"
  …
  throw new TypeError("query exceeds 512 characters");
  ```
  ```ts
  // index.tsx:859-860
  if (!embedding && !navigationOnly && !applicationOnly)
    writeLocation(nextState, next, "replace");
  ```
- Concrete failure scenario: a user opens
  `/app/entity/country?filter.iso_code=…&sort=name_ms%3Aasc&q=mal&density=wide` (a colleague's link,
  a bookmark created by an older build, or a hand-edited URL). The page renders the **unfiltered,
  unsorted, unsearched** list with no message, and `history.replaceState` rewrites the URL to the
  default state, so refresh/back-forward cannot recover it either. The user reasonably concludes the
  filter is broken or their authorization changed. Note `?page=abc` behaves the same way because
  `Number("abc")` is `NaN` and `optionalInteger` throws (`parsers.ts:1201-1210`).
- Suggested fix: validate each URL parameter forgivingly (drop only the offending value —
  `oneOf` with a fallback, `integer` guarded by `Number.isSafeInteger`), keep the strict parse for
  *descriptor* and *saved-view* input, and never substitute `base` for a parse of URL parameters.
  Keep `TypeError` propagation for descriptor/base failures only.

---

### [medium] Search text over 512 characters throws an uncaught `TypeError` and desynchronizes URL from list state

- Location: `packages/contracts/platform/entity-list/src/parsers.ts:1170-1174`,
  `packages/contracts/platform/entity-list/src/url-state.ts:57`,
  `packages/platform/entity/runtime/list-view/src/index.tsx:970-990` (`setState` line 988,
  `writeLocation` line 989), `:1726-1746` (debounce), `:1764-1777` (submit);
  the input itself: `packages/platform/foundation/ui/src/index.tsx:242`.
- What is wrong: the search box has no `maxLength` (`ObjectSearch` renders a bare
  `type="search"` `Input`), the contract enforces `query <= 512` by *throwing*, and
  `encodeListLocationState` calls `parseListLocationState` on the way to `history.pushState` with no
  `try`. Because the list state is set before the URL write, the two diverge silently.
- Evidence:
  ```ts
  // parsers.ts:1170-1174
  function optionalQuery(value: unknown): string | undefined {
    const result = optionalText(value, "query");
    if (result && result.length > 512)
      throw new TypeError("query exceeds 512 characters");
    return result;
  }
  ```
  ```ts
  // url-state.ts:57 — encodeListLocationState, no try/catch around it
  const normalized = parseListLocationState(state, descriptor);
  ```
  ```tsx
  // index.tsx:988-989
  setState(next);
  if (!embedding) writeLocation(next, descriptor, history);
  ```
  ```tsx
  // index.tsx:1726-1738 — only a *minimum* length is enforced before the 350 ms write
  if (searchBehavior !== "instant" || normalized === (state.query ?? "") ||
      (normalized.length > 0 && normalized.length < descriptor.surface.search.minimumQueryLength)) return;
  const timer = window.setTimeout(() => onChange({ query: normalized || undefined }), 350);
  ```
- Concrete failure scenario: with the default "search as I type" behaviour, a user pastes a long
  identifier list or log line (≥513 chars) into the search box. The debounce timer raises
  `TypeError: query exceeds 512 characters` from inside a `setTimeout` callback (uncaught, never
  surfaced in the UI), the query string is never updated, so a refresh or a copied link silently
  loses the search while the on-screen results remain filtered. Conversely, loading such a `?q=`
  URL hits finding 1: the search is silently dropped and the URL rewritten.
- Suggested fix: cap the input (`maxLength` on the search control, or clamp in the debounce with a
  visible "search is limited to 512 characters" status), and make `encodeListLocationState` degrade
  rather than throw (truncate/skip the query, or catch, keep the previous URL, and surface a status
  message).

---

### [medium] A failed refresh leaves the previous page's rows and cursors live, so "Next" paginates with a stale cursor

- Location: `packages/platform/entity/runtime/list-view/src/index.tsx:921-923` (results-effect error
  path), `:1442-1448` (error card), `:1449-1513` (stale rows still rendered), `:1514-1550`
  (stale footer), `:4892-4898` (Next disabled condition).
- What is wrong: the list-result effect only sets `error`; it never clears `page`. Rendering then
  shows the error card *and* the stale `page` rows *and* the stale `ListFooter`. `loading` is `false`
  once the request settles, and the footer's enabled state plus `onNext` read
  `page.pagination.hasNext` / `page.pagination.nextCursor` — i.e. cursors belonging to the
  *previous* query, applied to the *new* filter/sort state.
- Evidence:
  ```tsx
  // index.tsx:1442-1448
  {error ? (<ErrorState error={error} retry={retryResults} compact={Boolean(page)} />) : null}
  {loading && !page ? (<LoadingTable columns={fields.length} />) : page ? ( … <EntityRows … /> ) : null}
  {page ? (<ListFooter descriptor={descriptor} state={state} page={page} loading={loading} … />) : loading ? <LoadingFooter /> : null}
  ```
  ```tsx
  // index.tsx:4892-4898
  disabled={!page.pagination.hasNext || !page.pagination.nextCursor || loading}
  onClick={onNext}
  ```
  ```tsx
  // index.tsx:921-923 — the error path does not touch `page`
  .catch((cause) => { if (!controller.signal.aborted) setError(asTransportError(cause)); })
  ```
- Concrete failure scenario: on `/app/entity/country` the user changes the sort (or applies a
  filter) and the list request fails (500, descriptor-hash mismatch, gateway error). The error card
  appears above the *old* rows, and the footer still reads "Showing 1–25 of 1,234" with "Next"
  enabled. Clicking Next issues a request carrying the new sort plus the old cursor; the server
  returns a page positioned by an ordering that no longer applies, so records are skipped or
  repeated — an error banner and contradictory data at the same time.
- Suggested fix: make the error state authoritative for the results region on error (hide/mark the
  stale rows and disable the footer controls), or store the query key with `page` and use
  `page.pagination.*` only when `pageContextKey === \`${authorityKey}:${serverQueryKey}\``. The
  runtime already computes that key at `index.tsx:920-921` and uses it for `visibleIds` and the
  header count, just not for the footer.

---

### [medium] In-page "Previous" is permanently disabled after any reload or deep link on page ≥ 2

- Location: `packages/platform/entity/runtime/list-view/src/index.tsx:652-654` (`cursorHistory`
  state), `:1521-1536` (`onPrevious`), `:4887` (Previous disabled); `page` is persisted in the URL
  at `packages/contracts/platform/entity-list/src/url-state.ts:80`.
- What is wrong: the cursor stack that backs "Previous" is component state only, while `pageIndex`
  (and `cursor`) *are* serialized into the query string. After any remount (reload, deep link,
  in-app navigation back to the URL), `cursorHistory` is empty, so
  `disabled={!cursorHistory.length || loading}` is always true even though the URL and the range
  label say the user is on page 2+.
- Evidence:
  ```tsx
  // index.tsx:652-654
  const [cursorHistory, setCursorHistory] = useState<readonly (string | undefined)[]>([]);
  ```
  ```tsx
  // index.tsx:1521-1536
  onPrevious={() => {
    const cursor = cursorHistory.at(-1);
    setCursorHistory(cursorHistory.slice(0, -1));
    update({ ...state, cursor, pageIndex: Math.max(0, (state.pageIndex ?? cursorHistory.length) - 1) }, "push");
  }}
  // index.tsx:4887
  disabled={!cursorHistory.length || loading}
  ```
  ```ts
  // url-state.ts:80 — pageIndex is part of the URL
  if (normalized.pageIndex !== undefined && normalized.pageIndex > 0) parameters.set("page", String(normalized.pageIndex));
  ```
- Concrete failure scenario: the user clicks Next on `/app/entity/country` (URL becomes
  `?cursor=<c1>&page=1`), presses F5, and the list shows "Showing 26–50 of …" with **Previous greyed
  out**. The only way back is the browser Back button (which navigates by history entry, not by list
  state) or editing the URL. The same happens for any shared `?cursor=…&page=2` link. Note that
  `pagination.hasPrevious`/`previousCursor` exist in the contract
  (`packages/contracts/platform/entity-list/src/types.ts:293-294`) but the server always sends
  `hasPrevious: false` (`server/packages/services/records/src/entity-list-service.ts:704`), so the
  fix must be client-side.
- Suggested fix: persist the cursor stack (e.g. reuse the session-storage mechanism in
  `location.ts:53-67`, keyed by descriptor hash + authority), or derive Previous's enabled state
  from `pageIndex > 0` and offer an explicit "Back to first page" instead of relying on an
  in-memory array.

---

### [medium] Row selection survives paging/query changes, so bulk favourites silently no-op or act on a subset

- Location: `packages/platform/entity/runtime/list-view/src/index.tsx:704-706` (`selectedIds`),
  `:719-735` (the only resets), `:888-943` (query/page effect — no reset), `:1249-1263`
  (`selectedRows`, `mutateBookmarks` early return), `:4694-4712` and `:4734-4739` (selection bar
  summary and menu items); export-side counts at
  `packages/platform/entity/runtime/list-view/src/data-operations.tsx:57` and `:77`.
- What is wrong: `selectedIds` is only reset inside the *descriptor* effect (authority key, client,
  or retry changes). The list-result effect that runs for every query/page change does not reset it,
  but `selectedRows` — the payload of every bulk action — is derived from the **current page only**.
  `mutateBookmarks` returns early when that derived list is empty, while the selection bar keeps
  rendering enabled favourite menu items sized from `selectedIds.size`.
- Evidence:
  ```tsx
  // index.tsx:1249-1256
  const selectedRows = page?.rows.filter((row) => selectedIds.has(row.id)) ?? [];
  const mutateBookmarks = async (operation: "add" | "remove", rows: readonly EntityListRowV1[]) => {
    if (!rows.length || allMatchingSelected) return;
  ```
  ```tsx
  // index.tsx:729 — reset happens only in the descriptor effect
  setSelectedIds(new Set());
  ```
  ```tsx
  // index.tsx:4703-4705 / 4734-4737
  {new Intl.NumberFormat().format(effectiveCount)}
  {allMatching ? " matching records selected" : " selected"}
  …
  <MenuItem onClick={() => onBookmarks("add")}>Add selected to favourites</MenuItem>
  ```
- Concrete failure scenario: select 3 countries on page 1, click Next, then choose
  "Favourites → Add selected to favourites". The bar still claims "3 selected", but page 2 contains
  no selected row, so `mutateBookmarks` returns immediately: the click does nothing, no status
  message, no error. Select one row on page 2 first and only that row is added while the bar still
  claims 4 selected. The selection bar's Export button shows the same mismatch (the export dialog's
  own counts are page-scoped, `data-operations.tsx:57`/`:77`, so the two surfaces disagree about
  what will be exported).
- Suggested fix: either cache selected rows (so off-page rows can be actioned), or clear the
  selection on every query/page change, or disable the bulk actions whenever
  `selectedIds.size !== selectedRows.length` and explain why ("selection includes rows on other
  pages"). At minimum `mutateBookmarks` must not return silently.

---

### [medium] Detail-record load failure is a dead end: error text is rendered as a loading `role="status"` with no retry

- Location: `packages/platform/entity/runtime/form-detail/src/index.tsx:259-291` (effect and error
  path at `:272-277`, failure render at `:282-291`); the `SurfaceErrorBoundary` only wraps the
  loaded branch at `:315-329`.
- What is wrong: a failed `Promise.all([detail, record])` sets `status` to the localized error and
  leaves `loaded` undefined. The `!loaded` render branch is the same one used while loading: a
  `PageWorkspace` with `<p role="status">{status}</p>` and no retry control. The only reset
  affordance (`SurfaceErrorBoundary`) wraps the *loaded* branch, so it never sees this failure.
- Evidence:
  ```tsx
  .catch((error) => {
    if (active) { setLoaded(undefined); setStatus(safeError(error)); }
  });
  …
  if (!loaded || loaded.key !== key)
    return (
      <PageWorkspace header={{ level: "collection", title: humanize(entityCode) }}>
        <Card><p role="status">{status}</p></Card>
      </PageWorkspace>
    );
  ```
- Concrete failure scenario: opening `/app/entity/country/<uuid>` while the descriptor or record
  request fails (500, expired session, transient gateway error) shows a card whose only content is
  an error sentence inside loading-styled chrome, announced politely (`role="status"`, not
  `role="alert"`), with no "Try again". The user must reload the whole app shell to retry.
- Suggested fix: give the detail runtime an explicit error state (as the list has via
  `ListFrame`/`ErrorState`) with a retry that re-runs the effect (e.g. an `attempt` counter in the
  dependency array) and `role="alert"`.

---

### [low] Grouped table: Arrow Up/Down keyboard navigation silently stalls at group header rows

- Location: `packages/platform/entity/runtime/list-view/src/index.tsx:4480-4505` (row `tabIndex` at
  `:4484`, arrow handling at `:4494-4503`), `:4650-4659` (interleaved group header rows).
- What is wrong: the row key handler moves focus with `sibling?.focus()`, but only elements with a
  `tabIndex` can receive it; data rows get `tabIndex={href ? 0 : undefined}` while the injected group
  header `<tr>` has none (only the button inside it is focusable). `HTMLElement.focus()` on a
  non-focusable `<tr>` is a silent no-op.
- Evidence:
  ```tsx
  <tr key={row.id} tabIndex={href ? 0 : undefined}
      onKeyDown={(event) => { …
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const sibling = event.key === "ArrowDown" ? event.currentTarget.nextElementSibling
                                                    : event.currentTarget.previousElementSibling;
          (sibling as HTMLElement | null)?.focus();
        } }}>
  ```
  ```tsx
  {group ? groups.flatMap((item) => [
      <tr className="a-entity-list__group-row" key={`group-${item.label}`}>
        <th colSpan={columnCount} scope="rowgroup">{groupHeading(item)}</th>
      </tr>,
      …(collapsedGroups.has(item.label) ? [] : tableRows(item.rows)),
    ]) : tableRows(page.rows)}
  ```
- Concrete failure scenario: on `/app/entity/country`, group by a groupable field and drive the
  table from the keyboard: focus the last row of a group and press Arrow Down — focus does not move
  (the next sibling is the group header row), and pressing Arrow Down again still does nothing.
  The user is stuck with no focus change until they Tab out.
- Suggested fix: give group header rows `tabIndex={-1}`, or walk siblings until a focusable element
  is found.

---

### [low] Export file name cannot contain spaces and cannot be cleared

- Location: `packages/platform/entity/runtime/list-view/src/data-operations.tsx:48`, `:69`, `:111`.
- What is wrong: a sanitizer that also `trim()`s and substitutes a fallback for the empty string is
  applied on every keystroke of a controlled `<Input>`, so intermediate values are destroyed while
  the user types.
- Evidence:
  ```tsx
  const [fileName, setFileName] = useState(safeFileName(props.descriptor.surface.title));
  …
  <Label>File name<Input value={fileName} maxLength={120}
      onChange={(event) => setFileName(safeFileName(event.currentTarget.value))}/></Label>
  …
  function safeFileName(value: string) { return value.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").trim().slice(0, 120) || "records"; }
  ```
- Concrete failure scenario: in the export dialog (list toolbar → "Data operations…" / "Export") the
  user types `Q3 report`: after `Q3 ` the trailing space is trimmed away and the caret sits at the
  end, so the result is `Q3report`. Selecting all and pressing Backspace snaps the value to
  `records`, and the next keystroke appends to it (`recordsx`).
- Suggested fix: keep the raw value in state and sanitize only on blur/submit (and when building the
  request), and surface emptiness as a validation message instead of silently substituting
  `records`. The same helper is used for template file names at `:117`.

---

### [low] Related-record capability probes swallow errors, silently removing "Add"/"Edit" affordances

- Location: `packages/platform/entity/runtime/form-detail/src/related-entity-section.tsx:104-112`
  and `:206-219`.
- What is wrong: `entityDescriptorClient.form(...)` doubles as a permission probe, and a failure —
  including a transient transport/5xx failure — is swallowed by `catch {}` / `.catch(() => …)` and
  interpreted as "no create permission".
- Evidence:
  ```tsx
  if (!row) {
    let allowed = false;
    try { await entityDescriptorClient.form(client, entityCode, "create"); allowed = true; } catch {}
    if (current) { setValue(null); setCanCreate(allowed); }
    return;
  }
  ```
  ```tsx
  entityDescriptorClient.form(client, entityCode, "create")
    .then(() => { if (current) setCanCreate(true); })
    .catch(() => { if (current) setCanCreate(false); });
  ```
- Concrete failure scenario: on a record detail page with an embedded related collection, a
  transient failure of the form-descriptor request makes the "Add" button disappear with no message
  and no retry, so the user concludes they lack permission while the section's own list request may
  have succeeded and the page otherwise looks healthy.
- Suggested fix: distinguish a 401/403 (cacheable "not permitted") from transport/5xx failures; on
  the latter render a retryable status instead of hiding the action.

---

### [low] Hard-coded DOM ids make the list controls ambiguous when more than one list is mounted

- Location: `packages/platform/entity/runtime/list-view/src/index.tsx:1621-1622` (search input),
  `:3307` (column search), `:3674`, `:3692` (saved-view dialog fields).
- What is wrong: the embedded case correctly derives the search id with `useId()`, but the
  non-embedded (page) case reuses the literal id `entity-list-search`, and the dialog/search ids are
  literals too, so two list instances on one URL produce duplicate ids and `label[for]` /
  `aria-*` resolution binds to whichever element the browser finds first.
- Evidence:
  ```tsx
  const generatedSearchId = useId();
  const searchId = embedding ? generatedSearchId : "entity-list-search";
  …
  <FieldSearchInput id="entity-list-column-search" … />
  <Input id="entity-list-view-name" … />
  <Select id="entity-view-visibility" … />
  ```
- Concrete failure scenario: an entity-application surface that renders a task list next to an
  embedded collection renders two inputs with `id="entity-list-search"`; a screen reader announcing
  the label, or a `<label for="entity-list-search">`, targets the first list while the user is in
  the second. Not reachable on `/app/entity/country` today (one list per route), hence low.
- Suggested fix: always use `useId()`-derived ids (the pattern already exists in this file) rather
  than literal ids.

---

## Checked and clean (suspicions that turned out to be fine)

- **Route resolution (`/app/entity/country` vs `/app/entity/country/<id>` vs `…/manage`).**
  `packages/contracts/platform/entity-runtime/src/routes/entity-read-route.ts:11-21` maps `[]` and
  `["manage"]` to the list and a single UUID segment to the detail record, rejecting
  `segments.length > 1` and any non-UUID segment via `notFound()`. `isCanonicalEntityCode`
  (`validation/entity-code.ts:5-8`) accepts `country`. The detail/list switch in
  `entity-read-runtime.tsx:18-22` tests `recordId` truthiness, which cannot collide with the
  `"manage"` sentinel because the resolver already converts it to `undefined`. Only caveat found
  (not a defect in this chain): the URL grammar is deliberately UUID-only while `row.id` is
  `String(rawId)` (`server/packages/services/records/src/entity-list-service.ts:655`), so an entity
  with a non-UUID identity would produce dead detail links; the Postgres repository used for these
  entities casts ids to `uuid`, and I could not demonstrate a reachable non-UUID identity.
- **`useEntityI18n` identity.** `packages/platform/foundation/i18n/src/entity-react.ts:12-23`
  memoizes the runtime on `localization`, so the `useMemo(() => localizeEntityLabels(...), [sourceDescriptor, entityIntl])`
  descriptors in both runtimes are stable and the fetch effects do not re-run on every render.
- **`readBrowserStorage` and SSR.** `packages/platform/foundation/ui/src/browser-storage.ts:2-14`
  guards `typeof window === "undefined"` and wraps every access in try/catch, so
  `readDisplayPreferences` during render in `ListChrome` (`index.tsx:1694`) is safe on the server and
  its value only feeds effects, not markup (no hydration mismatch).
- **`MetadataDetailWorkspace` `window` access.** `detail-workspace.tsx:55-76` touches `window` in
  `useState` initializers, but the component is only reachable after `EntityDetailRuntime`'s effect
  sets `loaded` (`form-detail/src/index.tsx:282-291`), so it never runs during SSR; `record-url-state.ts`
  additionally guards `typeof window`.
- **List fetch cancellation.** All four list-side async effects use `AbortController` with a cleanup
  abort (`index.tsx:718-877`, `:888-929`, `:944-968`, `:1324-1581`), every `.then`/`.catch` re-checks
  `controller.signal.aborted`, and the results effect additionally rejects a response whose
  `descriptorHash`/`scopeFingerprint` no longer matches (`:912-916`). No out-of-order overwrite found.
- **`serverQueryKey`.** `index.tsx:668-681` covers standardViewKey, query, filters, sort, group,
  columns, cursor and pageSize — exactly what `entityListQuery` sends
  (`packages/platform/foundation/api-client/src/entity-list.ts:53-67`); `columns` correctly triggers a
  refetch because it is sent as `fields`.
- **Saved-view storage round-trip.** `readSavedViews` (`preferences.ts:34-57`) validates each entry
  with `parseSaveableListState` inside try/catch and drops invalid items, so `savedViewBase`
  (`location.ts:45-48`) can never hand `decodeListLocationState` a state that throws.
- **`nextSort` / `nextPrimarySort` / `moveItem` / `reorderColumn` boundaries.**
  `state.ts:7-12`, `index.tsx:5379-5417`, `columns.ts:29-35`: the asc → desc → cleared cycle,
  max-level slicing, and splice index handling all behave for first/last/out-of-range cases traced.
- **`parseState` invariants.** `sort` is deduplicated and capped, `columns` is filtered to known
  fields, the identity field is re-added and the list re-capped at 100, `group` is dropped when not
  groupable, and `pageSize` falls back to `limits.defaultPageSize`. Consequently
  `descriptor.surface.defaultState.sort` (required by `SaveableListStateV1`,
  `types.ts:101-111`) can never be `undefined` at `SortDialog`'s `setDraft(descriptor.surface.defaultState.sort)`
  (`index.tsx:3161`).
- **Filter value codec.** `filterInputValue`/`filterValueFromInput`
  (`collection-controls/src/filter-state.ts:7-69`) round-trip numbers, booleans, enum/reference
  options and `datetime-local` (local → ISO → local) consistently, and `filterValidationError`
  (`collection-controls/src/filter-editor.tsx:118-195`) rejects non-numeric, non-date, one-sided
  `between` and inverted ranges before `apply`, so the dialogs cannot write a value the contract
  rejects.
- **Bookmark optimistic updates.** `mutateBookmarks` (`index.tsx:1251-1321`) dedupes in-flight ids
  per epoch, rolls back only its own ids on failure, clears pending ids, and ignores responses from a
  superseded epoch; the epoch ref is also reset when the authority key changes.
- **Near-miss not reported as a bug:** the instant-search effect depends on `onChange`, whose
  identity changes on every `EntityCollectionRuntime` render (`index.tsx:1238-1245`), restarting the
  350 ms timer. I could not construct a path where the parent re-renders faster than 350 ms while the
  user types (typing re-renders only `ListChrome`), so this is latent churn rather than a
  demonstrated defect.
- **Also checked, no defect found:** `EntityDetailRuntime`'s `loaded.key !== key` guard prevents
  showing a stale record after an identity change; `entityLocationSearch` (`entity-location.ts:2-4`)
  correctly drops inherited list state on an in-place entity switch while preserving deep links;
  `constrainEmbeddedViewState`/`isListViewAllowed` (`view-policy.ts`) keep an embedded lookup inside
  its allowed view set; `bookmark-state.ts` rollback restores exactly the failed ids.

---

## Highest-risk 5

1. **[high] A malformed URL parameter wipes the entire list state** — `url-state.ts:35-53` +
   `parsers.ts:776/806/811/1173`; silent, immediate, and the stripped URL is persisted
   (finding 1).
2. **[medium] Stale page rows and cursors stay live after a failed refresh** — "Next" then paginates
   with a cursor from the previous query (`index.tsx:921-923`, `:1442-1550`, `:4892-4898`)
   (finding 3).
3. **[medium] Previous page is unrecoverable after reload/deep link on page ≥ 2** —
   `index.tsx:652-654`, `:1521-1536`, `:4887` versus the URL-persisted `page` (finding 4).
4. **[medium] A >512-character search throws uncaught and desynchronizes URL from list state** —
   `parsers.ts:1170-1174`, `url-state.ts:57`, no `maxLength` in `ObjectSearch`
   (`foundation/ui/src/index.tsx:242`) (finding 2).
5. **[medium] Cross-page selection makes bulk favourite actions silently no-op or act on a subset** —
   `index.tsx:1249-1256`, `:4703-4705`, `:4734-4737` (finding 5).
