# Country entity route: code review

Date: 2026-09-30. Scope: the shared Entity Framework path serving
`/app/entity/country`, `/app/entity/country/manage` and
`/app/entity/country/<uuid>` on Neon, Mesh and Studio, reviewed against
[system-design.md](../architecture/application-experience/system-design.md),
[entity-onboarding-boundaries.md](../architecture/application-experience/entity-onboarding-boundaries.md),
[localization-guidance-and-build-plan.md](../architecture/application-experience/localization-guidance-and-build-plan.md)
and `AGENTS.md`.

## Method and limits

- This was a static source review of the current working tree, which includes
  uncommitted changes (for example the Neon `NeonWorkContextGate` wrapper, the
  `Server-Timing`/`withReadEvidence` read-route change and thumbnail request
  changes). Nothing was deployed, published or run in a browser.
- One bug (D1-1) was reproduced by running the same arithmetic in Node. All
  other findings come from reading the code. **Confirmed** means the code path
  was traced end to end. **Plausible** means the defect depends on runtime
  state that was not exercised.
- Depth was uneven. The request path was read line by line: route adapters,
  read surface, detail runtime and workspace, list runtime and chrome,
  pagination and location, the records routes and services, i18n formatting and
  catalogs, and the Country metadata. The other inventory packages
  (publication, meta-entity-authoring, metadata, experience, collaboration,
  attachments) were only scanned for patterns. They are not certified clean.
- No finding proposes a Country-specific branch. Every fix belongs in the
  shared framework or in metadata, as `AGENTS.md` requires.

### Path correction

The actual files differ from the paths given in the review request:

| Requested path | Actual file |
| --- | --- |
| `form-detail/src/routes/entity-read-page.tsx` | [`form-detail/src/routes/entity-read-route.tsx`](../../packages/platform/entity/runtime/form-detail/src/routes/entity-read-route.tsx) (`createEntityReadRoute`) |
| `form-detail/src/entity-read-runtime.tsx` | [`form-detail/src/entity-read-surface.tsx`](../../packages/platform/entity/runtime/form-detail/src/entity-read-surface.tsx) (`EntityReadSurface`) |

Neon wraps record reads in `NeonWorkContextGate` (uncommitted). Mesh and Studio
export `createEntityReadRoute(notFound)` directly.

## Priority summary

| # | Severity | Dimension | Finding |
| --- | --- | --- | --- |
| D1-1 | High | Bug | Negative decimals between −1 and 0 lose their sign (`-0.25` → `0.25`) |
| D1-2 | High | Bug | A failed comments/files refresh or "load more" unmounts the workspace, discarding drafts and upload queues |
| D1-3 | Medium | Bug | Grouped list sections sort alphabetically by formatted label, merge distinct values, and misreport counts |
| D2-1 | Medium | Improvement | List → detail navigation is a full document load, so the shell remounts |
| D2-2 | Medium | Improvement | Every sort, filter or page change clears the rows to a skeleton instead of keeping the authorized data |
| D2-3 | Medium | Improvement | Opening a detail page reads the record twice and authorizes every field three times |
| D8-1 | Medium | Localization | About 230 hard-coded English strings remain in the shared runtime, including sentence concatenation |
| D6-1 | Medium | Reuse | Three hand-rolled tablists, four clipboard helpers and two value formatters duplicate shared primitives |

---

## Dimension 1 — Bug fixes

| ID | Status | Location | Finding | Fix |
| --- | --- | --- | --- | --- |
| D1-1 | Confirmed (reproduced) | [entity-value.ts:67](../../packages/platform/foundation/i18n/src/entity-value.ts#L67) | `formatExactDecimal` formats the integer part with `BigInt("-0")`, which is `0n`, so the sign disappears. `-0.25` renders as `0.25`. This affects `integer`/`decimal`/`money` values in both list and detail. | Format the absolute integer part, then prefix the locale's minus sign (from `formatToParts(-1)`) when `negative` is true. Add `-0.25`, `-0`, `-1.5` cases to `tests/foundation/entity-localization.test.ts`. |
| D1-2 | Confirmed | [detail-collaboration.tsx:59-64](../../packages/platform/entity/runtime/form-detail/src/detail-collaboration.tsx#L59-L64) | `CapabilityContent.load` sets `resource` to undefined and `error` to true on any failure, including a cursor "load more" and the post-mutation refresh (`onChanged`). The error branch replaces `CompiledEntitySectionContent`, which unmounts comment drafts and upload queues. The comment on line 54 states the opposite intent, and the design (§5.4, §7.4) requires preserving drafts on failure. | Keep the existing `resource` on refresh and page failures, and surface the error inline (a refresh-error attribute or a retry control). Replace the content only when the initial load fails. |
| D1-3 | Confirmed | [list-view index.tsx:5079-5112](../../packages/platform/entity/runtime/list-view/src/index.tsx#L5079-L5112) | `groupedRows` buckets by formatted label and re-sorts with `label.localeCompare`. (a) Date groups sort alphabetically by month name and ignore sort direction. (b) `null`, `""` and missing values merge into "—". (c) When distinct server buckets share a label (for example datetimes in the same minute), `authoritativeCounts` keeps only the last bucket's count. (d) Collapse state is keyed by label, so it resets when the locale changes. | Group by a stable key (`JSON.stringify(value)`) and keep the server's bucket order. Format labels only for display. |
| D1-4 | Confirmed | [list-pagination.tsx:50](../../packages/platform/entity/runtime/list-view/src/list-pagination.tsx#L50), [index.tsx:1001-1004](../../packages/platform/entity/runtime/list-view/src/index.tsx#L1001-L1004) | `Previous` is enabled only when `cursorHistory` is non-empty. `cursorHistory` resets to `[]` on popstate and on the initial load, while `cursor`/`page` are restored from the URL. After a reload or Back on page 3, the summary reads "41–60" but Previous is disabled. | Persist the cursor stack in list location state (or the session token), or offer "First page" when history is unknown. |
| D1-5 | Plausible | [list-view index.tsx:344-358](../../packages/platform/entity/runtime/list-view/src/index.tsx#L344-L358) | `EntityListRuntime` replaces the caller's `onScopeCoordinateChange` with a local `selection` setter, and that selection overrides later `scopeCoordinate` prop changes for the same entity. After a Neon context change, the list can keep querying the previous organization. The public prop is silently ignored and has no callers. | Make scope either controlled (the prop wins, and the callback notifies the parent) or uncontrolled with an explicit reset on prop change. Remove the dead prop if it stays uncontrolled. |
| D1-6 | Confirmed (localization bug) | [list-view index.tsx:4203](../../packages/platform/entity/runtime/list-view/src/index.tsx#L4203) | The empty-state sentence embeds `surface.title.toLocaleLowerCase()`. This is wrong for languages that capitalize nouns (German) and uses the runtime default locale rather than the governed one. | Pass the title unchanged, or use a whole-sentence message per entity (localization rule 4). |
| D1-7 | Plausible | [detail-workspace.tsx:341-342](../../packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx#L341-L342) | `presentation.entityRelationships!.find(...)!` throws inside render if a section's `relationshipKey` is unresolved, which takes down the whole detail body boundary. | Confirm that `parseEntityRecordPresentation` rejects unresolved keys. Otherwise skip the section with a local unavailable state. |

## Dimension 2 — Improvements

| ID | Location | Finding | Recommendation |
| --- | --- | --- | --- |
| D2-1 | [index.tsx:4265, 4317, 2075](../../packages/platform/entity/runtime/list-view/src/index.tsx#L4317), [data-operations.tsx:32-33](../../packages/platform/entity/runtime/list-view/src/data-operations.tsx#L32) | Record links are plain `<a href>`, and row Enter and page actions use `window.location.assign`. `useApplicationNavigation` exists but the entity runtime never uses it. Every list → detail open reloads the document and re-runs bootstrap, which breaks the "Shell remains mounted during ordinary page navigation" invariant. `EntityApplicationContent` already intercepts plain clicks with `onNavigate`. | Route same-origin, unmodified clicks through the app navigation contract in one shared link helper, and keep `href` for new-tab behavior. |
| D2-2 | [index.tsx:905-908](../../packages/platform/entity/runtime/list-view/src/index.tsx#L905-L908) | `setPage(undefined)` on every query change shows a skeleton and drops the rows. The comment's intent (stale cursors) is valid, but the design (§7.2, "Refresh retains previously authorized data") asks for retained data with a refreshing state. | Keep the previous rows while loading. Mark them `aria-busy`, disable pagination until the new page arrives, and discard them on authority or scope change (already keyed by `authorityKey`). |
| D2-3 | [entity-list-service.ts:442-455, 589](../../server/packages/services/records/src/entity-list-service.ts#L442-L455), [detail-requests.ts:61-64](../../packages/platform/entity/runtime/form-detail/src/detail-requests.ts#L61-L64) | The detail page calls `detail-descriptor` (which runs `queries.get`) and `records/:id` (which runs `queries.get` again). `readableRecordFields` issues one authorization per field and runs three times: 22 fields × 3 = 66 decisions per Country open. The uncommitted `withReadEvidence` deliberately shares evidence but not decisions. | Return the projected record from the detail read (one endpoint, or `recordId` → `{descriptor, record}`), or pass the readable projection between the two calls within a request. |
| D2-4 | [entity-list-service.ts:273-298, 512-516](../../server/packages/services/records/src/entity-list-service.ts#L273-L298) | Independent awaits run sequentially: readable fields, data operations, actions and navigation. The relationship check is an N+1 sequential loop. | Use `Promise.all` after authorization, which is safe because all are read-only decisions for the same context. |
| D2-5 | [index.tsx:1340-1390](../../packages/platform/entity/runtime/list-view/src/index.tsx#L1340-L1390) → `descriptor()` | Loading one filter's choices recompiles the whole list descriptor: authorization, data operations, actions, navigation and standard views. | Add a narrow `filter-choices` read, or short-circuit `descriptor()` when `filterChoiceField` is set. |
| D2-6 | [entity-value.ts:61-70](../../packages/platform/foundation/i18n/src/entity-value.ts#L61-L70) | `formatExactDecimal` builds 12 `Intl.NumberFormat` instances per cell. | Cache the formatters per `(formatLocale, numberingSystem)`. |
| D2-7 | [detail-workspace.tsx:199-260](../../packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx#L199-L260), Country `navigation.tabs` | Country publishes a single "Overview" tab, so a one-tab tablist renders above the section navigation. | Framework rule: render no record-mode tablist when `tabs.length <= 1`. This fixes the behavior for every entity rather than editing Country metadata. |
| D2-8 | [entity-detail-runtime.tsx:170-188](../../packages/platform/entity/runtime/form-detail/src/entity-detail-runtime.tsx#L170-L188) | While the record loads, the header shows `humanizeIdentifier(entityCode)` at collection level. The loading state is a text line in a card, not a geometry-matched skeleton (§7.4). | Use the published entity label once known, a record-level header, and a detail skeleton. |
| D2-9 | [entity-list-routes.ts:142-147](../../server/packages/services/records/src/entity-list-routes.ts#L142-L147), [bff-relay index.ts:133-134](../../packages/platform/gateway/bff-relay/src/index.ts#L133-L134) | The uncommitted change emits a stage-level `Server-Timing` header on every read, and the relay forwards it to browsers. It exposes internal stage structure and timings. | Gate emission behind a development or diagnostics setting. |
| D2-10 | [entity-list-routes.ts:222](../../server/packages/services/records/src/entity-list-routes.ts#L222) | Response schemas are `additionalProperties: true` with no shape, so OpenAPI cannot validate serialized responses (§10). The detail descriptor is parsed server-side; list and record are not. | Reference the contract schemas, or at minimum parse `list`/`record` results with the contract parsers before sending. |

## Dimension 3 — Coding standards

| ID | Location | Finding |
| --- | --- | --- |
| D3-1 | [list-view/src/index.tsx](../../packages/platform/entity/runtime/list-view/src/index.tsx) (5,419 lines) | 30+ components in one module. `EntityCollectionRuntime` is about 1,000 lines with about 25 `useState` hooks, and `ListChrome` is about 660 lines. Extract the dialogs (`FilterDialog`, `SortDialog`, `ColumnsDialog`, `SavedViewsDialog`, `DisplaySettingsDialog`), `EntityRows`, `SelectionBar` and the helpers into `dialogs/`, `rows/` and `format/`, keeping the barrel exports stable. `dialogs/group-dialog.tsx` is already the precedent. |
| D3-2 | [data-operations.tsx:122](../../packages/platform/entity/runtime/list-view/src/data-operations.tsx#L122), [location.ts:71](../../packages/platform/entity/runtime/list-view/src/location.ts#L71), [detail-collaboration.tsx:25-38](../../packages/platform/entity/runtime/form-detail/src/detail-collaboration.tsx#L25-L38), [record-fields.tsx](../../packages/platform/entity/runtime/form-detail/src/record-fields.tsx) | Single-line blocks of 300 to 1,000+ characters and inconsistent indentation. Per the repository's isolated-format-sweep rule, reformat these in a separate PR, not mixed with fixes. |
| D3-3 | [index.tsx:1649, 1709-1716](../../packages/platform/entity/runtime/list-view/src/index.tsx#L1709-L1716) | `searchBehavior` reads `localStorage` during render, and `displayVersion` exists only to force re-renders. Hold the preference in state that is updated on change. |
| D3-4 | [index.tsx:313-315](../../packages/platform/entity/runtime/list-view/src/index.tsx#L313-L315) | `navigationOnly`, `applicationOnly`, `contentOnly` (and `headerOnly` on `ListFrame`) are independent booleans that allow invalid combinations. Replace them with one discriminated `presentation` prop. |
| D3-5 | [entity-list-routes.ts:210-213](../../server/packages/services/records/src/entity-list-routes.ts#L210-L213) | An error is classified by matching `error.message === "COMPILED_ENTITY_APPLICATION_RELEASE_UNAVAILABLE"`. Throw a typed `RecordServiceError` at the source instead. |
| D3-6 | [entity-detail-runtime.tsx:95](../../packages/platform/entity/runtime/form-detail/src/entity-detail-runtime.tsx#L95), [detail-workspace.tsx:183](../../packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx#L183) | `status=""` is passed to a prop that is only rendered when truthy, which is dead API surface. |
| D3-7 | [detail-workspace.tsx:268-292](../../packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx#L268-L292) | `RecordModeNavigation` receives stubs (`sections: []`, `preloadSection: () => {}`, `renderSection: () => null`). The component contract is wider than this consumer needs. Split it or make those members optional. |
| D3-8 | [index.tsx:289-291](../../packages/platform/entity/runtime/list-view/src/index.tsx#L289-L291), [entity-list-service.ts:121](../../server/packages/services/records/src/entity-list-service.ts#L121) | Inline `import("…").Type` expressions inside interfaces. Use top-level type imports. |
| D3-9 | [neon list-view index.tsx:19-20](../../packages/planes/neon/list-view/src/index.tsx#L19-L20) | A `const` is declared between import statements. |
| D3-10 | Runtime-wide | There are 49 non-null assertions (`!.`) in the entity runtime. Most follow parser guarantees, but the render-path ones (D1-7) need a documented invariant or a guard. |

## Dimension 4 — File and method naming

| ID | Finding | Recommendation |
| --- | --- | --- |
| D4-1 | `ENTITY_LIST_MAX_SORT_LEVELS` is exported with value **10** from `@athyper/contract-platform-entity-list` ([types.ts:49](../../packages/contracts/platform/entity-list/src/types.ts#L49)) and value **3** from the records service ([entity-list-service.ts:106](../../server/packages/services/records/src/entity-list-service.ts#L106)). The default 3 is also repeated as a literal in [query-service.ts:184](../../server/packages/services/records/src/query-service.ts#L184) and `descriptor-parser.ts:228`, and `list()` checks a literal `10`. | Rename the server constant `DEFAULT_LIST_SORT_LEVELS`, keep `MAX_*` for the hard cap, and reference both from one place. |
| D4-2 | The same concept has three names: "favourites" (UI keys, `overview-favourites.tsx`, the `favourite` prop), "bookmarks" (API: `recordBookmarkMembershipOperation`, `record-bookmark-routes.ts`, `BookmarkButton`), and "Favorites" (design §5.2). | Choose one domain term for new code. Do not rename existing public contracts merely to conform (`AGENTS.md`). |
| D4-3 | Detail components use three prefixes: `EntityDetailRuntime` → `MetadataDetailWorkspace` → `EntityRecordFields`/`EntityRelatedSection`, while the dispatcher is `EntityReadSurface`. | Use the `Entity*` prefix for new components. `MetadataDetailWorkspace` is internal, so it can be renamed `EntityDetailWorkspace` without a contract change. |
| D4-4 | `routes/entity-read-route.ts` (contract resolver) and `routes/entity-read-route.tsx` (runtime factory) share a basename but have different roles. The test is already named `entity-read-route-adapter.spec.ts`. | Rename the runtime file `entity-read-route-adapter.tsx` and keep the `./read-route` export path. |
| D4-5 | File names are otherwise consistent kebab-case, and new server tests in the diff follow the colocated `*.test.ts` rule (for example the `meta-entity-authoring-authorizer.test.ts` move). | No action. |

## Dimension 5 — CSS and the design system

| ID | Location | Finding |
| --- | --- | --- |
| D5-1 | [form-detail styles.css:769-779](../../packages/platform/entity/runtime/form-detail/src/styles.css#L769-L779) and about 100 other rules | Raw `8px`/`12px`/`16px` spacing overrides the `--a-space-*` tokens (`--a-space-2` = .5rem, `--a-space-4` = 1rem). Pixel values do not scale with root font size or density (`--a-space` changes per density). Replace them with tokens. |
| D5-2 | [record.css:224, 386, 403](../../packages/platform/entity/runtime/form-detail/src/record/record.css#L224), [list-view styles.css:5, 32, 139](../../packages/platform/entity/runtime/list-view/src/styles.css#L5), form-detail styles.css (8 places) | The runtime uses literal z-indexes (1, 2, 3, 4, 5, 6, 8, 16) although the theme defines `--a-z-sticky/overlay/drawer/popover/dialog/toast`. Define local steps as `calc(var(--a-z-sticky) + n)` so layers cannot cross shell overlays. |
| D5-3 | [record.css:221-229](../../packages/platform/entity/runtime/form-detail/src/record/record.css#L221-L229) | Sticky offsets hard-code `+ 3rem` and a `4.5rem` topbar fallback. The design requires "Tokens/measurements determine offsets; no per-route hard-coded offsets". Measure them as `detail-workspace.tsx` already does for `--detail-navigation-height`. |
| D5-4 | record.css (4 places) | `border-radius: 999px` should use `var(--a-radius-round)`. |
| D5-5 | Runtime CSS | Breakpoints are 600, 960/961 and 999/1000 px across files. Align them to one shared set (shared `@custom-media` or documented values) so list and detail adapt together. |
| D5-6 | [detail-workspace.css:41](../../packages/platform/entity/runtime/form-detail/src/detail-workspace.css#L41) | `left: auto` counters a physical `left` set elsewhere. Remove the physical source rule and use logical properties only, for RTL. |
| D5-7 | [list-view styles.css](../../packages/platform/entity/runtime/list-view/src/styles.css) | 592 lines of minified one-line rules, next to formatted `record.css`. Reformat in the isolated format PR. |
| D5-8 | — | Positive: colors come entirely from tokens (no hex or rgb literals in runtime CSS), and logical properties dominate. |

## Dimension 6 — Reusable components

| ID | Duplication | Consolidate into |
| --- | --- | --- |
| D6-1 | Hand-rolled `role="tablist"` with manual arrow-key handling in [detail-workspace.tsx:199-259](../../packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx#L199-L259), `record-360-panel.tsx` and `collaboration-surface.tsx` | `Tabs`/`PanelTabs` from `@athyper/platform-ui` |
| D6-2 | Four clipboard implementations: list `copyText` (index.tsx:5002), `attachments/collection.tsx`, `related-record.tsx`, shell `record-information.tsx` | One `copyToClipboard` in platform-ui with the failure semantics required by §5.3 |
| D6-3 | [field-format.ts](../../packages/platform/entity/runtime/list-view/src/field-format.ts) duplicates `formatEntityValue` as an "offline fallback" (English Yes/No, browser locale), and two `humanizeIdentifier` copies differ: the i18n copy does not split on `.` | `formatEntityValue` only (`useEntityI18n` always returns a runtime) and the contract `humanizeIdentifier` |
| D6-4 | The `[sessionScopeKey, revision, sorted permissions]` identity key is built in [entity-detail-runtime.tsx:159-160](../../packages/platform/entity/runtime/form-detail/src/entity-detail-runtime.tsx#L159-L160) and [thumbnail-scope.ts:14-20](../../packages/platform/entity/runtime/form-detail/src/thumbnail-scope.ts#L14-L20) | One `useRecordIdentityKey(entityCode, recordId)` hook |
| D6-5 | Page-action rendering is written twice with different behavior: [index.tsx:535-578](../../packages/platform/entity/runtime/list-view/src/index.tsx#L535-L578) uses `onNavigate` and `disabled`, [index.tsx:1179-1207](../../packages/platform/entity/runtime/list-view/src/index.tsx#L1179-L1207) uses a plain anchor with `aria-disabled` and `aria-describedby`. Title and description resolution is also duplicated (496-503 vs 1148-1157). | One `EntityPageActions` component and one `resolveSurfaceHeader` helper |
| D6-6 | The list location query-key allowlist ([location.ts:71](../../packages/platform/entity/runtime/list-view/src/location.ts#L71)) duplicates knowledge held by the contract encoder | Export the key set from `@athyper/contract-platform-entity-list` |
| D6-7 | The scope-coordinate JSON schema is repeated in `entity-list-routes.ts:223-235`, `record-bookmark-routes.ts:175, 216` and `list-scope-coordinate.ts` | One exported schema and parser |

## Dimension 7 — Generalization and further reuse

| ID | Finding | Direction |
| --- | --- | --- |
| D7-1 | There are two detail stacks. Country uses `detail-descriptor` + `records/:id` → `MetadataDetailWorkspace`. The compiled path (`/records/:id/bootstrap` in experience → `EntityRecordPage`) has no production consumer, only test fixtures. [record-360-panel.tsx:65](../../packages/platform/entity/runtime/form-detail/src/record-360-panel.tsx#L65) still says "New entity pages use EntityRecordPage", which contradicts the reference implementation. | The owner should decide which detail stack is canonical. Then converge or retire the other and fix the doc comment. The next entity should not have to choose. |
| D7-2 | [capabilities.json](../../metadata/products/shared/entities/country/capabilities.json) is 7.8 KB of fully inlined comment and attachment bindings, while `activity.json` references `platform.activity.standard`. The next reference entity would copy the file. | Implement the capability-profile resolver from `capability-profiles-and-runtime-controls-design.md` so entities reference a profile. |
| D7-3 | Business Partner vocabulary sits in generic contracts and services: `partnerRole` (`supplier`/`customer`) and `eligibleOperation` enums in [entity-list-routes.ts:229-230](../../server/packages/services/records/src/entity-list-routes.ts#L229-L230), bookmark routes and `list-scope-coordinate.ts`; the BP alias in `collaboration/src/entity-coordinate.ts:3-9`; the `"Supplier"`/`"Customer"` labels in `compiled-entity-flow-reader.ts:272-273`; and Atlas `directory` publishing in the list runtime (index.tsx:1043-1059). Design §14.0.1 already lists the scope-adapter extraction as planned. | Keep it on the framework backlog: a registered scope adapter with descriptor-declared coordinates, so the generic API accepts validated opaque coordinates. |
| D7-4 | Server-generated UI text: `"Edit"`, `"Overview"`, `` `Create ${label}` ``, `` `Save ${label}` ``, humanized transition labels ([entity-list-service.ts:400-401, 482, 499, 525-535](../../server/packages/services/records/src/entity-list-service.ts#L482)) | Emit `{labelKey, defaultText}` from shared platform keys so metadata-free entities localize the same way. |
| D7-5 | [data-operations.tsx:122](../../packages/platform/entity/runtime/list-view/src/data-operations.tsx#L122) embeds a draft-import template with a fixed UUID and the `athyper.meta-entity-contract/2.1` schema. [import-workspace.tsx:44, 48](../../packages/platform/entity/runtime/list-view/src/import-workspace.tsx#L44) hard-codes `/operations/data-transfers`. | Have the server supply the template, and resolve the route from the published route catalog. |
| D7-6 | Framework rules that should be generic: suppress one-tab navigation (D2-7), keep rows during refresh (D2-2), and use one link and navigation helper (D2-1). | Implement once in the runtime. There are no per-entity toggles. |

## Dimension 8 — Localization of the shared framework

The localization plan (L10N-00…08) is formally deferred until Business Partner
completes. The items below are framework defects against its rules, and fixing
hard-coded strings in shared components is within the Entity Framework scope.

| ID | Location | Finding |
| --- | --- | --- |
| D8-1 | About 230 English literals across the runtime. The heaviest areas: [list-pagination.tsx](../../packages/platform/entity/runtime/list-view/src/list-pagination.tsx) (all copy), `ListChrome` (`"None"`, `` `${n} active` ``, manual `level/levels` plural, `"Organization: "`, `"Remove … filter"`, the scope drawer), `EntityRows` (`"Select record"`, `"Favourite"`, `"Actions"`, `"Expand/Collapse … group"`), `"Loading list"`/`"Loading application"`/`"This section is unavailable."`, [record-header.tsx](../../packages/platform/entity/runtime/form-detail/src/record-header.tsx) (`"More actions"`, `"Historical read-only view"`, `"Technical details"`, `"Section"`, `"More sections"`), and [detail-workspace.tsx:202, 325](../../packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx#L202) (`"Record modes"`, `"Record sections"`) | Move them to `entityRuntimeMessages` with ICU plurals. |
| D8-2 | [state.ts:217-222](../../packages/platform/entity/runtime/list-view/src/state.ts#L217-L222) | `describeFilter` builds `label + English operator + value` (with `"Yes"`/`"No"`), which is sentence concatenation (rule 4). Use one ICU message per operator with `{field}` and `{value}` arguments. |
| D8-3 | [list-pagination.tsx:32, 38](../../packages/platform/entity/runtime/list-view/src/list-pagination.tsx#L32), [index.tsx:1092](../../packages/platform/entity/runtime/list-view/src/index.tsx#L1092), [field-format.ts:22, 35](../../packages/platform/entity/runtime/list-view/src/field-format.ts#L22) | Number and date formatting bypass the governed formatting locale: `new Intl.NumberFormat()` uses the browser locale, and `uiLocale` is used where `formatLocale` is required. Use `intl.number`/`intl.date` everywhere. |
| D8-4 | `humanizeIdentifier` as display text: the detail loading title, server entity label fallback, enum fallback, transition labels, and display-mode values (`index.tsx:2059`) | The contract's own doc says "never a substitute for a localized label". Use platform keys for platform values, and require metadata labels for entity values. |
| D8-5 | [detail-workspace.tsx:77](../../packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx#L77) | Summary card label keys are synthesized as `summary.${card.key}` with no entity namespace, so cards from different entities collide. Publish `labelKey` from metadata instead. |
| D8-6 | [country/localization.json](../../metadata/products/shared/entities/country/localization.json), [definition.json](../../metadata/products/shared/entities/country/definition.json) | The un-namespaced `navigation.overview` key translates to Malay "Ikhtisar", while the platform's `detail.overview` uses "Gambaran keseluruhan" for the same concept. The tab also uses `label` + `localizedLabel` while sections use `label: {labelKey, defaultText}`. Namespace the key (`entity.country.navigation.overview`) or reference the platform key, and accept one label shape in the parser. |
| D8-7 | [catalogs/entity-runtime.ts](../../packages/platform/foundation/i18n/src/catalogs/entity-runtime.ts), [entity-catalogs.ts](../../packages/platform/foundation/i18n/src/entity-catalogs.ts) | Catalogs are positional arrays `[en, ms, ar]`, so a missing element misaligns silently. `entityEnglishMessages` (validation, reference picker, related sections) has no ms/ar entries. Framework keys (`entity.retry`, `entity.controls`, `error.unavailable`) live in `collaboration.ts`. Arabic plurals define only `other`. Track these under L10N-01. |
| D8-8 | [entity-labels.ts](../../packages/platform/foundation/i18n/src/entity-labels.ts) | `localizeEntityLabels` covers the entity, fields, surface title, sections and tabs, but not presentation actions, summary cards, relationships or header badges. |
| D8-9 | — | Positive: every `intl.message` key used by the runtime resolves in a catalog (a scripted check found no missing keys), and the Country catalog covers all its field and section keys in en, ms and ar. |

---

## Suggested order

1. **Correctness:** D1-1, D1-2 and D1-3, each with a focused regression in
   `tests/foundation*`.
2. **Framework behavior:** D2-1 (navigation), D2-2 (retain rows), D2-7 (one-tab
   suppression) and D1-4 (pagination).
3. **Server efficiency:** D2-3, D2-4 and D2-5 together with the in-flight
   `withReadEvidence` work.
4. **Localization sweep of shared components:** D8-1 to D8-5.
5. **Structure:** D3-1 (split the list module), D6-1 to D6-7 (consolidate
   helpers), and the D5 token cleanup.
6. **Owner decisions:** D7-1 (canonical detail stack), D7-2 (capability
   profiles) and D7-3 (scope adapter).
7. **Isolated format PR:** D3-2 and D5-7.
