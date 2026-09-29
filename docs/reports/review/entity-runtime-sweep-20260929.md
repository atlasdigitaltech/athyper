# Entity Framework runtime — exhaustive per-file sweep (read-only)

Snapshot: `HEAD = 63fc9492b` + dirty worktree, 2026-09-29. Read-only; no source file modified.

This is the consolidated record of the exhaustive per-file sweep of the shared Entity Framework
frontend runtime, contracts, gateway and support packages for the `/app/entity/country` surface.
It was produced as eleven group passes (`G1`–`G11`); each group's full coverage table and findings are
reproduced below under their own heading. Four findings are rated **high**:

| Sev | Finding | Group |
| --- | --- | --- |
| high | Filter editor offers **17** relative periods; the entity list API accepts **9** → 8 options always answer `HTTP 400 INVALID_FILTER` | G10 |
| high | `SearchableSelect` refetches the reference directory **forever** when a saved value cannot be resolved (unaborted requests, no attempt guard) | G3 |
| high | Permission-projected presentation keeps navigation/panel references that the re-parse then rejects | G8 |
| high | Filter editor relative periods rejected by the API (same defect as the first row, from the contract side) | G2 |

The first two are independently re-verified in the master review
([country-route-comprehensive-review-20260929.md](../country-route-comprehensive-review-20260929.md) §2.18, §2.24).

---


# Group G1

# Sweep G1

Group G1 - form-detail activity/collaboration/comments/collection surfaces (16 files).
Read-only review; evidence re-verified with grep/sed against the current working tree.

## Coverage
| path | lines | verdict |
| --- | --- | --- |
| packages/platform/entity/runtime/form-detail/src/activity-collection-section.tsx | 306 | clean |
| packages/platform/entity/runtime/form-detail/src/activity-comparison-model.ts | 99 | clean |
| packages/platform/entity/runtime/form-detail/src/activity-comparison.tsx | 230 | clean |
| packages/platform/entity/runtime/form-detail/src/activity-date-range.tsx | 52 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/activity-events.tsx | 227 | clean |
| packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx | 585 | findings 3 |
| packages/platform/entity/runtime/form-detail/src/collaboration-actions.tsx | 108 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/collaboration-operations.tsx | 153 | clean |
| packages/platform/entity/runtime/form-detail/src/collaboration-read-models.ts | 103 | clean |
| packages/platform/entity/runtime/form-detail/src/collaboration-route.ts | 4 | clean |
| packages/platform/entity/runtime/form-detail/src/collaboration-surface.tsx | 345 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/collaboration-visibility.ts | 10 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx | 2100 | findings 6 |
| packages/platform/entity/runtime/form-detail/src/collection-section.tsx | 628 | findings 2 |
| packages/platform/entity/runtime/form-detail/src/collection-continuation.tsx | 39 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/compiled-section-content.tsx | 194 | clean |

## Findings

### [medium] Comment boundary validation is discarded: rejected rows are still rendered
Location: packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:234
What is wrong: `CompiledEntitySectionContent` parses every comments item with `asComment`, drops the ones that throw, and counts them in `rejected` (which renders the "partial response" warning). The comments workspace then ignores that result and re-derives the raw rows straight from `resource.data`, so exactly the rows the boundary rejected still reach the render path. The comment inside `CommentItem` asserts the opposite invariant.
Evidence: `      try { return [parser(item)]; } catch { rejected++; return []; }` (compiled-section-content.tsx:63), `  const warning = parsed?.rejected ? <p role="status">{intl.message("collaboration.partialResponse")}</p> : null;` (compiled-section-content.tsx:68), `  const commentItems = useMemo(() => collectionItems(resource.data), [resource.data]);` (comments-workspace.tsx:234), and `  // Root comments are validated by the section boundary and replies by` / `  // CommentThread.load(), before either can reach the render path.` (comments-workspace.tsx:1742-1743).
Impact scenario: a comment row whose `id` is missing/non-string is dropped by `asComment` and reported as "some rows were omitted", yet it renders as `<article id="comment-undefined">` with React key `"undefined"` (comments-workspace.tsx:1288, 1777). Two such rows produce duplicate DOM ids and duplicate React keys (reconciliation can attach state/focus to the wrong comment), deep links and `document.getElementById("comment-…")` land on the first match, and a row with a missing `visibility` renders the literal i18n id `comments.undefined` (comments-workspace.tsx:1790). The reply path is safe because `CommentThread.load()` runs `asComment` (comments-workspace.tsx:1415).
Suggested fix: pass the already-validated `parsed.items` into `CommentsWorkspace` (or run `asComment` on the collection inside the workspace) and render the partial-response warning from the same result.

### [medium] Unguarded `intl.date(...)` on comment timestamps crashes the whole comment list
Location: packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:1274
What is wrong: with the default `groupBy === "date"` grouping, each row's `createdAt` is converted with `intl.date(String(item.createdAt), …)`. `IntlRuntime.date` builds `new Date(value)` and hands it to `Intl.DateTimeFormat.format`, which throws `RangeError: Invalid time value` for an invalid date. `asComment` (the declared boundary) does not validate or require `createdAt` at all, and the sibling helper `collaborationTime` in the same feature does guard this case, so the guard exists but is not used here.
Evidence: `                  : intl.date(String(item.createdAt),` (comments-workspace.tsx:1274) and `                  : intl.date(String(visibleComments[index - 1]?.createdAt), {` (comments-workspace.tsx:1280); contrast `export function collaborationTime(value: unknown, intl?: IntlRuntime) {` / `  const date = new Date(String(value));` / `  return Number.isNaN(date.getTime())` / `    ? ""` (collaboration-actions.tsx:87-90).
Impact scenario: a server shape change (renamed field, epoch number, empty string) makes the first render of the comments section throw an uncaught `RangeError`, blanking the whole collaboration panel instead of the intended "partial response" degradation; the same value goes through `collaborationTime` elsewhere and degrades quietly, so the failure is inconsistent.
Suggested fix: format group headers with `collaborationTime(item.createdAt, intl)` (or validate `Date.parse` first) and let `asComment` require a parseable `createdAt`.

### [medium] Activity workspace keeps the previous record's snapshot selection and comparison
Location: packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx:175
What is wrong: the only place that clears `selected`, `snapshot` and `comparison` on a refresh is guarded by a release-hash comparison, and `releaseHash` identifies the published release, not the record (`ActivityPage.releaseHash` / `ActivityDescription.releaseHash` come from the same `admission.releaseHash`). The workspace is not remounted per record: the app route is a single catch-all `[entityCode]/[[...segments]]` page that re-renders with new params (`apps/neon/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx` -> `renderEntityReadRoute` -> `EntityReadRuntime` -> `EntityDetailRuntime`, none of which key on `recordId`). Sibling collaborators in the same feature are keyed per record (`CommentsWorkspace key={`${entityCode}:${recordId}`}`, compiled-section-content.tsx:110), so the activity path is the outlier.
Evidence: `      if (page && page.releaseHash !== next.releaseHash) {` / `        setSelected([]);` / `        setSnapshot(undefined);` / `        setComparison(undefined);` / `        captureKey.current = undefined;` (activity-workspace.tsx:175-180), `      setPage((previous) =>` / `        cursor && previous?.releaseHash === next.releaseHash` (activity-workspace.tsx:170-171).
Impact scenario: the user opens record A's snapshots, selects two and compares, then navigates to record B under the same release. `load()` fetches B's page, the hash is unchanged, so record A's `ComparisonView` stays mounted inside B's panel showing A's captured field values, `selected` still holds A's snapshot ids (the footer reads "2/2"), and each `ActivityCollectionSection` remounts with B's coordinates but A's `from`/`to` ids (activity-workspace.tsx:555), producing per-section 409/404 errors. Historical values of one record are displayed as if they belonged to the record on screen.
Suggested fix: reset `selected`/`snapshot`/`comparison`/`collectionSections`/`defaultView` whenever `entityCode` or `recordId` changes (an effect keyed on the coordinates), or key `ActivityWorkspace` with `${entityCode}:${recordId}` like the comments workspace.

### [medium] Capture idempotency key survives a record change and permanently blocks the next capture
Location: packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx:287
What is wrong: `captureKey` is generated once per failed capture and cleared only on success (or on a release-hash change, which does not fire for a record change). The same record-less reset gap as above applies, so a key minted for record A is reused for record B. The server fingerprints the key with `entityId`, and a fingerprint mismatch is a conflict, not a replay.
Evidence: `    captureKey.current ??= crypto.randomUUID();` (activity-workspace.tsx:287) and `              captureKey.current = undefined;` only inside the success branch (activity-workspace.tsx:297); server: `          input.entityId,` inside the fingerprint (server/packages/services/records/src/snapshots/activity-snapshot-repository.ts:91), `      if (row.request_fingerprint.trim() !== input.requestFingerprint) return { kind: "conflict" };` (server/packages/services/records/src/kysely-command-execution-store.ts:42), `        if (command.kind !== "started")` / `          throw new RecordServiceError(` / `            409,` / `            "ACTIVITY_CAPTURE_CONFLICT",` (activity-snapshot-repository.ts:125-128).
Impact scenario: a capture on record A times out after the server committed it (the exact case the retained key is designed for). The user navigates to record B (no remount) and presses Capture: the request carries A's key, the fingerprint differs, the server answers 409 `ACTIVITY_CAPTURE_CONFLICT`, and the workspace shows only "activity.unavailable" while still keeping the key - every retry keeps failing until a full page reload. A first capture for record B can never succeed on that session.
Suggested fix: clear `captureKey.current` when `entityCode`/`recordId` change (same reset as the finding above), and/or derive the key per record scope.

### [low] `filters` state is write-only: activity filters are never sent
Location: packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx:51
What is wrong: `filters` is declared with `setFilters` and read when building the audit/timeline request, but `setFilters` is never called anywhere in the repository, so the value is permanently `{}`. The `ActivityEventFilters` contract field is dead plumbing, and any user-facing filter control for activity is absent while the request shape pretends to support it.
Evidence: `  const [filters,setFilters]=useState<ActivityEventFilters>({});` (activity-workspace.tsx:51), `        ...(["auditLog","timeline"].includes(effective)?{filters}:{}),` (activity-workspace.tsx:166); `grep -rn "setFilters" packages apps --include=*.ts --include=*.tsx` returns only this declaration (the other `setFiltersOpen` hit is an unrelated attachments file).
Impact scenario: no functional regression today, but a dead filter pipeline invites a caller to assume filtering works; any future `setFilters` call silently re-runs the load effect with untested parameters.
Suggested fix: delete the state and pass no filters, or wire the control that sets it.

### [low] Comment snapshots write `hasDraft` that nothing ever reads
Location: packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:291
What is wrong: `hasDraft` is declared and assigned from three callbacks but never read, so every draft snapshot triggers a state update that re-renders the whole comments workspace (filter bar, list, dialogs, portal tree) for a value no branch consumes.
Evidence: `  const [hasDraft, setHasDraft] = useState(() => Boolean(valueRecord(valueRecord(resource.data)?.draft)));` (comments-workspace.tsx:291); `setHasDraft` at comments-workspace.tsx:400, 405 and 433; `grep -n "hasDraft"` matches only line 291, i.e. the value is never referenced.
Impact scenario: needless re-renders of a long comment list on every debounced keystroke; a future reader assumes a draft indicator exists when it does not.
Suggested fix: remove the state (and the three setters) or render the intended draft indicator.

### [low] Unreachable scroll-to-new-reply branch: `reveal` is never assigned an id
Location: packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:1442
What is wrong: `reveal` is created as `undefined` and only ever written with `undefined`; both branches that read it can never be true, so the "reveal the just-posted reply" behaviour is dead code. The `sent` refresh path explicitly resets it to `undefined` instead of setting the new reply id.
Evidence: `    reveal = useRef<string | undefined>(undefined);` (comments-workspace.tsx:1385), `      if (` / `        reveal.current &&` / `        (reveal.current === rootId ||` / `          replies.some((item) => item.id === reveal.current))` (comments-workspace.tsx:1442-1445), `      reveal.current = undefined;` (comments-workspace.tsx:1537); `grep -n "reveal"` shows no other assignment.
Impact scenario: after posting a reply the new reply is never scrolled into view (the toast's "View" action is the only way to find it), and the "Reply posted. Use Load more replies…" notice at line 1455 can never fire, so a reply appended on a later page gives no feedback.
Suggested fix: set `reveal.current = event.id` in the `sent` effect when an id is available, or delete the dead branch and its notice.

### [low] `Number(editing.revision)` coerces a missing revision to `null` on the wire
Location: packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:1065
What is wrong: the edit request builds `expectedRevision` with `Number(...)` from a raw row. `CommentRow` marks `revision` optional and `asComment` validates it only when present, so a row without it yields `NaN`, which `JSON.stringify` turns into `null` - exactly the silent coercion the server rejects with a generic 400 instead of the intended 409 conflict path.
Evidence: `                expectedRevision: Number(editing.revision),` (comments-workspace.tsx:1065); contract `  readonly revision?: number;` (collaboration-read-models.ts:4); server ` if (!Number.isSafeInteger(value) || Number(value)<1) throw new CollaborationError(400,"COMMENT_REVISION_REQUIRED","A positive expectedRevision is required");` (server/packages/platform/collaboration/src/collaboration-routes.ts:303).
Impact scenario: editing a comment whose `revision` is absent (drifted or legacy row) fails with "A positive expectedRevision is required" instead of the designed conflict/refresh flow, and the same NaN feeds the `history.items[0]?.revision > editing.revision` comparison at line 996, which is then always false.
Suggested fix: require `revision` in `asComment` (or guard the edit action), and refuse to submit the edit when it is not a safe integer rather than sending `null`.

### [low] `CollaborationToolbarContext` is never provided, so toolbar registration is inert
Location: packages/platform/entity/runtime/form-detail/src/collaboration-visibility.ts:10
What is wrong: the context documents "Register the comments toolbar without moving or remounting its editing tree", and the comments workspace consumes it as a `ref` on the filter-toolbar div, but no provider exists anywhere in the repository, so the default no-op callback is always used and the registration never happens.
Evidence: `export const CollaborationToolbarContext = createContext<(node: HTMLDivElement | null) => void>(() => {});` (collaboration-visibility.ts:10), `        <div className="a-comment-view-controls" ref={toolbarRef}><RecordPanelToolbarActions/></div>` (comments-workspace.tsx:1159); `grep -rn "CollaborationToolbarContext" packages apps --include=*.ts --include=*.tsx` returns only this definition and the `useContext` at comments-workspace.tsx:739 - no `.Provider`.
Impact scenario: the feature it advertises (hosting the comments toolbar elsewhere) silently does nothing; a future caller that renders a toolbar slot gets an empty element with no diagnostics.
Suggested fix: provide the context where the toolbar slot is rendered, or delete the context and the ref.

### [low] Hardcoded English UI strings in shared collaboration components
Location: packages/platform/entity/runtime/form-detail/src/collection-continuation.tsx:31
What is wrong: this shared component renders user-visible sentences as literals even though it already receives an `intl`-produced `label` prop, and the comments workspace does the same in several places. The module ships full `en`/`ms`/`ar` catalogs (`packages/platform/foundation/i18n/src/catalogs/collaboration.ts`), so these strings are the only untranslated surface in these panels.
Evidence: collection-continuation.tsx:31-37 `<p role="status" aria-live="polite">{failed` / `      ? "Could not load more records. Your loaded records are still available."` / `      : loading ? "Loading more records…" : automatic ? "More records load as you scroll." : "More records are available."}</p>` and `>{loading ? "Loading…" : failed ? "Try again" : label}</Button>`; also comments-workspace.tsx:1203 (`{busy ? "Deleting…" : …}`), 1252 (`{busy ? "Submitting…" : …}`), 1875/1885 (`"Not available"`), 1971/1976 (`<Tooltip label={liked ? "Remove like" : "Like"}>` / `aria-label={liked ? "Remove like" : "Like comment"}`), and 1417/1455/1511/1524/1546 which set `parentNotice` to literals.
Impact scenario: Malay and Arabic users see English dialog status text, aria-labels and screen-reader announcements in the middle of an otherwise localized record panel.
Suggested fix: add catalog ids (e.g. `collection.loadMore`, `collection.loadingMore`, `collection.loadFailed`, `comments.deleting`, `comments.like`) and render them through `intl.message`.

### [low] Section tabs point `aria-controls` at panels that are not rendered until visited
Location: packages/platform/entity/runtime/form-detail/src/collaboration-surface.tsx:312
What is wrong: `PanelTabs` renders a tab for every declared section with `aria-controls="collaboration-section-<key>"`, but the panel bodies are filtered by `visited`, which is only populated when a section becomes active. On first open every inactive tab references a non-existent id.
Evidence: collaboration-surface.tsx:312 ``id:`collaboration-tab-${section.key}`,panelId:`collaboration-section-${section.key}`}``; collaboration-surface.tsx:313-314 `.filter((section) => visited.includes(section.key))`; the platform tab implementation forwards it: `aria-controls={item.panelId}` (packages/platform/foundation/ui/src/panel/index.tsx:48).
Impact scenario: assistive technology that resolves `aria-controls` when a tab is activated has no panel to move to for any section the user has not opened yet, so the tab/panel relationship is announced as broken; the same gap exists in the activity view while `page` is still loading or after an error, where the tabs render but `id="activity-results"` does not (activity-workspace.tsx:355 vs 415-417).
Suggested fix: render a placeholder panel per tab (with the same id) while unvisited/loading, or omit `aria-controls` for panes that do not exist yet.

### [low] Custom date-range inputs are seeded once and never resynced with the URL state
Location: packages/platform/entity/runtime/form-detail/src/activity-date-range.tsx:14
What is wrong: `start`/`end` initialize from `selection` only on mount. The activity workspace re-reads the range from the URL on every `popstate`, so a Back/Forward navigation changes `selection` while the pickers keep the stale text; applying afterwards writes those stale dates back into the URL.
Evidence: activity-date-range.tsx:14 `  const [custom,setCustom]=useState(false),[start,setStart]=useState(selection.startDate??""),[end,setEnd]=useState(selection.endDate??"");` and activity-workspace.tsx:107 `      setRangeSelection(readActivityRange());` inside the `popstate` handler; `Apply` writes the local values: `onClick={()=>{onChange({period:"custom",startDate:start,endDate:end},days);setCustom(false);}}` (activity-date-range.tsx:48).
Impact scenario: the user opens the custom pickers, presses Back (which restores the previous range), and then clicks Apply - the picker's stale values override the restored selection and the activity list silently loads a range the URL history did not ask for.
Suggested fix: sync `start`/`end` from `selection` in an effect (or key the control on `selection.startDate`/`endDate`).

### [low] Tab key can be swallowed when the first menu action is disabled
Location: packages/platform/entity/runtime/form-detail/src/collaboration-actions.tsx:79
What is wrong: the portal menu intercepts Tab from the disclosure summary and moves focus to the first `<button>` in the menu. If that button is disabled (`disabled={itemBusy}` in the comment action menu), `focus()` is a no-op while `preventDefault()` has already cancelled the browser's tab move, so the keystroke does nothing.
Evidence: `    <summary aria-label={label} onKeyDown={event=>{` / `      if(portal && event.key==="Tab" && !event.shiftKey && ref.current?.open && menuRef.current){` / `        event.preventDefault();menuRef.current.querySelector<HTMLButtonElement>("button")?.focus();` (collaboration-actions.tsx:78-80), with callers passing disabled first actions: `                    disabled={itemBusy}` (comments-workspace.tsx:1805) and `<CollaborationActions label={intl.message("comments.actions")}>` (comments-workspace.tsx:1801).
Impact scenario: while a reaction/delete is pending (`itemBusy`), a keyboard user opening the comment menu and pressing Tab gets no focus move and must press Escape or Shift+Tab to escape the menu - a small keyboard trap.
Suggested fix: select the first non-disabled button (`:not(:disabled)`), or only call `preventDefault()` when a focusable candidate was found.

### [low] Unused `React` default import
Location: packages/platform/entity/runtime/form-detail/src/collection-section.tsx:2
What is wrong: the file imports the `React` namespace but never references `React.*`; with the automatic JSX runtime the binding is dead. `grep -n "React\." collection-section.tsx` returns nothing.
Evidence: `import React, {` (collection-section.tsx:2).
Impact scenario: dead import in a hot intake component; nothing functional, but it obscures which runtime features the file uses.
Suggested fix: change the import to the named-only form: `import { useId, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";`.

### [low] Exported collaboration helpers with no consumer outside their own file
Location: packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:1701
What is wrong: `commentCanReply`, `CommentEditContext`, `ReplyComposerPlacement` and `prepareCommentFiles` are exported but only referenced inside `comments-workspace.tsx`; `collectionSummary` (collection-section.tsx:42) is the same. None of them is re-exported from the package entry (`packages/platform/entity/runtime/form-detail/src/index.tsx` exports only `EntityCollaborationSurface`, `CompiledEntitySectionContent`, `isCollaborationRequested`, …) and `grep -rn "<symbol>" apps packages server --include=*.ts --include=*.tsx` finds no external use.
Evidence: `export function commentCanReply(item: Readonly<Record<string, unknown>>, maxDepth?: number): boolean {` (comments-workspace.tsx:1701), `export const CommentEditContext = createContext<{` (comments-workspace.tsx:693), `export function ReplyComposerPlacement({` (comments-workspace.tsx:195), `export async function prepareCommentFiles(` (comments-workspace.tsx:98), `export function collectionSummary(` (collection-section.tsx:42).
Impact scenario: the package API surface implies reuse that does not exist, so refactors look breaking and dead paths stay alive.
Suggested fix: drop `export` where the symbol is internal, or move deliberately shared helpers (e.g. `prepareCommentFiles`) to the package entry with consumers.

### [low] Collection summary reveals the last four characters of password and masked fields
Location: packages/platform/entity/runtime/form-detail/src/collection-section.tsx:107
What is wrong: the summary builder documents "Password values are always masked" but the masked branch keeps the final four characters of the raw value for every `format: "masked"` binding and for every `widget: "password"` input, writing them into the collapsed row summary.
Evidence: `/** Only declared, visible fields enter summaries. Password values are always masked. */` (collection-section.tsx:41) and `    if (binding.format === "masked" || input.widget === "password")` / `      return [raw.length > 4 ? `•••• ${raw.slice(-4)}` : "••••"];` (collection-section.tsx:107-108).
Impact scenario: a password or masked secret typed into a repeatable collection is partially rendered in the row summary (visible on screen and in screenshots/over-the-shoulder review) even though the documented intent is full masking.
Suggested fix: render a fixed mask for `widget === "password"` (no suffix), keeping the last-four convention only for explicitly declared `format: "masked"` reference fields.

## Checked and clean
- packages/platform/entity/runtime/form-detail/src/activity-collection-section.tsx:43-45 - every `load` aborts the previous request via `request.current` and stores a fresh controller.
- packages/platform/entity/runtime/form-detail/src/activity-collection-section.tsx:66-86 - the aborted branch returns before any `setPage`/`setError`, and both `catch` and `finally` re-check `signal.aborted`, so a stale page cannot overwrite fresh state.
- packages/platform/entity/runtime/form-detail/src/activity-collection-section.tsx:67-73 - cursor pagination refuses a changed release hash and a repeated page instead of silently duplicating rows.
- packages/platform/entity/runtime/form-detail/src/activity-collection-section.tsx:199-233 - `details` keyed by `row.id`, field rows keyed by `field.key`; no placeholder identities are invented from layout metadata.
- packages/platform/entity/runtime/form-detail/src/activity-comparison-model.ts:31-63 - `remaining` is consumed via `delete`, so each field lands in exactly one group and `additional` cannot duplicate a section.
- packages/platform/entity/runtime/form-detail/src/activity-comparison-model.ts:71-98 - uncomparable/empty values are labelled, never coerced into a comparison; dates use UTC for date-only kinds.
- packages/platform/entity/runtime/form-detail/src/activity-comparison.tsx:62-71 - sections keyed by stable `group.key`; the controlled `details` toggle state is identity-preserving.
- packages/platform/entity/runtime/form-detail/src/activity-events.tsx:99-103 and 155-174 - day buckets and correlation groups produce unique keys within the rendered list; duplicate ids would have needed equal `id`/`correlation` values.
- packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx:104-128 - the `popstate` listener is removed symmetrically; the handler re-reads view/days/range from the URL.
- packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx:129-137 - `load` aborts both request refs, resets `busy`/`error`/`incompatible` and never writes state after abort.
- packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx:205-208 - the capture request is aborted on unmount and on coordinate change.
- packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx:245-280 - `compare`/`inspect` share a controller, discard stale responses and map 409 to the "incompatible" status instead of a generic error.
- packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx:557-581 - snapshot selection is capped at two inputs and the checkbox disables additional picks.
- packages/platform/entity/runtime/form-detail/src/collaboration-actions.tsx:22-53 - pointerdown/keydown/resize/scroll listeners are all added and removed in one cleanup; no leak across re-renders of `portal`.
- packages/platform/entity/runtime/form-detail/src/collaboration-actions.tsx:54-56 - returning `registerModalBranch(...)` from `useLayoutEffect` is valid: the helper always returns a cleanup function (packages/platform/foundation/ui/src/modal-isolation.ts:58-71).
- packages/platform/entity/runtime/form-detail/src/collaboration-actions.tsx:37-44 - the portal menu repositions on scroll/resize and closes when the anchor leaves the viewport.
- packages/platform/entity/runtime/form-detail/src/collaboration-operations.tsx:15-22,47,53,78,106,124,141,152 - mutating operations that create rows require an idempotency key; PATCH/DELETE use revisions or are naturally repeatable.
- packages/platform/entity/runtime/form-detail/src/collaboration-read-models.ts:24-39 - malformed rows throw instead of being coerced; `text`/`pinnedFiles`/`reactions`/`revision` are validated and never silently reinterpreted.
- packages/platform/entity/runtime/form-detail/src/collaboration-route.ts:3 - visibility is an exact `panel=collaboration` match, so no viewport or storage state can open the panel.
- packages/platform/entity/runtime/form-detail/src/collaboration-surface.tsx:79-84 - the portal host node is created and removed in the same effect.
- packages/platform/entity/runtime/form-detail/src/collaboration-surface.tsx:136-147 - the media-query listener is removed and the saved width is clamped to the allowed range.
- packages/platform/entity/runtime/form-detail/src/collaboration-surface.tsx:182-220 - the rAF, scroll listeners and `ResizeObserver` are all torn down; the effect re-arms on `mode`/`active`.
- packages/platform/entity/runtime/form-detail/src/collaboration-surface.tsx:221 - the early return happens after every hook, so no conditional-hook violation.
- packages/platform/entity/runtime/form-detail/src/collaboration-surface.tsx:286-305 - the resize separator is a focusable `role="separator"` with pointer capture and Arrow/Home/End support, direction-aware.
- packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:498-503 - the draft debounce timer is cleared on unmount.
- packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:574-624 - the submission intent key is retained per signature so a retried POST stays idempotent, and it is cleared on success.
- packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:750-775 - mentions load through a dedicated AbortController that is aborted on filter change and unmount; page items are merged through an id-keyed Map.
- packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:1400-1472 - thread pagination guards stale requests with `threadEpoch`/`requestEpoch`, never releases a newer request's lock, and merges cursor pages by id.
- packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:1413-1420 - replies are validated with `asComment` and malformed ones are omitted with a notice.
- packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:1553-1560 - the parent-locate highlight respects `prefers-reduced-motion`.
- packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:2016-2079 - preview button ids come from `useId`, the preview is only rendered while the section is visible, and focus returns to the trigger on close.
- packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:1288 - the comment list key is the item id and the thread wrapper keys off the root id, so a root change remounts the thread (refs are not carried over).
- packages/platform/entity/runtime/form-detail/src/collection-continuation.tsx:16-29 - the IntersectionObserver is disconnected on cleanup, re-armed for each new cursor, and the `attempted` ref prevents a duplicate auto-load for the same cursor.
- packages/platform/entity/runtime/form-detail/src/collection-section.tsx:230-236 - the checked-row set is pruned against the current row keys, so removed rows cannot leave stale selection.
- packages/platform/entity/runtime/form-detail/src/collection-section.tsx:239-254 - the newly added row is opened and its first control focused via a unique `crypto.randomUUID` key.
- packages/platform/entity/runtime/form-detail/src/collection-section.tsx:529-563 - the removal dialog relies on the platform modal isolation, which restores focus to the previously focused control on close (packages/platform/foundation/ui/src/modal-isolation.ts:196-201), so no extra focus restore is needed.
- packages/platform/entity/runtime/form-detail/src/collection-section.tsx:605-628 - the named presentation wrappers are all registered in `collectionPresentations`; they are not dead.
- packages/platform/entity/runtime/form-detail/src/compiled-section-content.tsx:54-66 - the parse memo depends only on `resource.data` and the renderer key, and both comment/attachment parsers are the validated read-model constructors.
- packages/platform/entity/runtime/form-detail/src/compiled-section-content.tsx:69-77 - a non-array `items` envelope degrades to an explicit invalid-response state instead of rendering undefined rows.
- packages/platform/entity/runtime/form-detail/src/compiled-section-content.tsx:83-84 and 164-168 - `hasMore` tests the same `nextCursor` that is passed as the cursor, so the cursor can never be the string "undefined".
- packages/platform/entity/runtime/form-detail/src/compiled-section-content.tsx:144-181 - file controls are gated on the capability action keys (`create`+`finalize` for upload, `preview`/`download`/`unlink`/… per action) rather than on presentation.
- packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx:340-392 - every `intl.message` key used in the group exists in the catalog, including the dynamically composed `activity.collection.*`, `activity.period.*` and `comments.<visibility>` ids (checked against packages/platform/foundation/i18n/src/catalogs/collaboration.ts; zero missing).

## Notes
- No polling exists anywhere in these 16 files; the only timer is the 600 ms composer draft debounce, which is cleared on unmount. The "polling never stops" concern does not apply to this group.
- `ActivityCollectionSection` intentionally fails closed when the collection release hash changes mid-pagination (throws, clears the loaded pages, shows Retry). I did not file it: it is a deliberate guard, and the shipped page-1 data is re-fetched on retry.
- `CommentThread` registers four document listeners (`pointerdown`, `keydown`, `wheel`, `touchstart`) per root comment just to disable deep-link auto-paging. They are removed on unmount, but a 100-comment page attaches 400 listeners; a single shared listener would be equivalent.
- `collaboration-surface.tsx:328` creates a new `RecordPanelActionContext` value object on every parent render (including each `width` change during a pointer drag). Consumers only re-render and the registration callback is stable (`useCallback`), so I did not file it as a defect, but it is avoidable churn.
- `detail-collaboration.tsx:37` passes `preloadSection={() => {}}`, an inline no-op that makes the surface's preload effect re-run on every render of the parent. Harmless today (no-op), but the effect dependency is unstable by construction.
- Not reviewed per the task split: the single Country request path (`list-view/src/index.tsx`, `form-detail/src/index.tsx`, `entity-read-runtime.tsx`, `routes/entity-read-route.tsx`, `apps/*/lib/relay.ts`). I only read `entity-read-runtime.tsx`/`entity-read-route.tsx` to confirm record navigation does not remount the collaboration tree, which is the precondition for the two record-scoped reset findings.
- Line counts are from `wc -l` on the current working tree; the findings and quotes above were re-checked against the same tree after the uncommitted edits (several files, e.g. `activity-workspace.tsx` and `activity-date-range.tsx`, are in a compressed formatting style in the working copy).


# Group G2

# Sweep G2

Recovered by the coordinating reviewer from the first sweep run (2026-09-29 23:1x). This group
succeeded in the first fan-out; its structured result was truncated in transport, so the coverage
table, findings and cleared-suspicion list below are transcribed from that result verbatim.
The two medium findings were independently re-verified by the coordinator against the working
tree at 23:5x (quotes below are from that re-check).

## Coverage
| path | lines | verdict |
|---|---|---|
| packages/platform/entity/runtime/form-detail/src/data-surface.tsx | 901 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/data-validation.tsx | 139 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/detail-collaboration.tsx | 73 | clean |
| packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx | 361 | clean |
| packages/platform/entity/runtime/form-detail/src/entity-edit-collaboration.tsx | 123 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/entity-lookup.tsx | 748 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/entity-runtime-workspace.tsx | 208 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/form-layout.tsx | 101 | clean |
| packages/platform/entity/runtime/form-detail/src/form-values.ts | 37 | clean |
| packages/platform/entity/runtime/form-detail/src/record-360-panel.tsx | 262 | clean |
| packages/platform/entity/runtime/form-detail/src/record-action-dock.tsx | 8 | clean |
| packages/platform/entity/runtime/form-detail/src/record-action.tsx | 49 | clean |
| packages/platform/entity/runtime/form-detail/src/record-fields.tsx | 62 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/record-header.tsx | 194 | clean |
| packages/platform/entity/runtime/form-detail/src/panel-header-action.tsx | 25 | clean |
| packages/platform/entity/runtime/form-detail/src/protected-value.tsx | 112 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/intake.tsx | 784 | findings 2 |

## Findings

### [medium] Reveal purpose format guard is not reflected in the enable check, so a valid metadata purpose silently does nothing
Location: packages/platform/entity/runtime/form-detail/src/protected-value.tsx:66
What is wrong: `reveal()` aborts unless the selected purpose also matches a private lowercase/triple-character regex, but the dialog's submit button only checks that the purpose is one of the configured options. Metadata purposes are validated by a much looser rule, so a purpose such as `ID`, `DOB` or `NationalId` renders an enabled "Reveal value" button that no-ops: no request, no spinner, no error, dialog stays open.
Evidence (re-verified by coordinator):
```
if (!request || !allowed || !purposes.some(option => option.value === purpose) || !/^[a-z][a-z0-9_.-]{2,62}$/.test(purpose)) return;
```
versus
```
<Button type="submit" disabled={busy || (allowed && !purposes.some(option => option.value === purpose))}>
```
and the descriptor parser that admits the purpose value
(`packages/platform/entity/runtime/descriptor-client/src/runtime-client.ts:360`):
```
function key(value: unknown, name: string): string { const result = text(value, name); if (!/^[A-Za-z][A-Za-z0-9_.-]{0,126}$/.test(result)) invalid(name); return result; }
```
Impact scenario: a protected value becomes unrevealable with no operator-visible explanation whenever metadata authors a purpose outside the renderer's private regex (the only feedback is a click that appears to do nothing).
Suggested fix: use one source of truth - validate the purpose value with the same rule in the descriptor parser, or drop the regex from `reveal()` and derive the guard from the options list; show an inline error when a form value cannot be submitted instead of returning silently.

### [medium] Optional adapter hooks (resolveActions/validateSelection) are de facto required; conforming adapters get disabled or blocked lookups
Location: packages/platform/entity/runtime/form-detail/src/entity-lookup.tsx:174
What is wrong: `EntityLookupAdapter` declares `resolveActions?` and `validateSelection?` as optional, but `decisions` is only populated from `resolveActions` and every selection/creation control requires `decisions` to exist and be `enabled`. An adapter that follows the published type and omits `resolveActions` therefore renders a choose-mode lookup whose Select/Confirm buttons are permanently disabled (with no reason, since `title={decisions?.select.reason}` is undefined) and whose creation buttons never render. Separately, when `onChange` is supplied, `compatible` additionally requires `validateSelection`, so an adapter without it gets the blocking "requires an available, compatible entity adapter" alert instead of the lookup.
Evidence (re-verified by coordinator):
```
  const compatible =
    (!onChange || !!adapter?.validateSelection) &&
    adapter?.targetEntity === options.targetEntity &&
```
Impact scenario: following the exported adapter type produces a lookup that cannot select or create (choose mode) or that refuses to render at all when `onChange` is used; failures are silent disabled controls rather than an authorization message.
Suggested fix: promote both members to required in `EntityLookupAdapter` (so the contract fails at compile time), or treat a missing `resolveActions` as "allowed when the adapter declares the action", skip the `validateSelection` requirement when the lookup defers to `onChange`/`select`, and always render `decision?.reason`.

### [low] Dead `intl ?` branch: useEntityI18n() never returns a nullish runtime
Location: packages/platform/entity/runtime/form-detail/src/record-fields.tsx:31
What is wrong: the date/datetime rendering branches on `intl`, but `useEntityI18n()` always returns a runtime (it falls back to `fallbackLocalization`), so `: display(value)` is unreachable. The identical pattern exists in section-primitives.tsx:137.
Impact: dead fallback path suggests a null-safety guarantee that does not exist and invites copy-paste.
Suggested fix: remove the ternary and always use the i18n formatter.

### [low] Uncleared setTimeout in the validation provider can setState after unmount
Location: packages/platform/entity/runtime/form-detail/src/data-validation.tsx:99
What is wrong: every change event captured while `attempted` is true schedules a bare `setTimeout(() => setErrors(collect()), 0)`; the timer is never cleared on unmount and a new one is queued per event.
Evidence: `onChangeCapture={() => { if (attempted) setTimeout(() => setErrors(collect()), 0); }}`
Impact: post-unmount callbacks that walk registered readers and do DOM lookups before a state write on a detached tree.
Suggested fix: keep the handle in a ref and clear it in a cleanup effect, or schedule the recollect from an effect keyed on a change counter.

### [low] aria-live region is created together with its message, so field errors are not reliably announced
Location: packages/platform/entity/runtime/form-detail/src/data-surface.tsx:718
What is wrong: the per-field error paragraph only exists while an error exists, so the live region node and its text are inserted in the same commit; screen readers require the region to be present before its content changes. The submit-time summary uses `role="alert"`, so submitted errors are still announced once.
Impact: inline errors (including the effective-date range error) may never be announced to screen-reader users navigating field by field, even though the text is reachable via `aria-describedby`.
Suggested fix: render a persistent empty `<p id={fieldId + "-error"} aria-live="polite">` per field and toggle only its text.

### [low] IntersectionObserver effect re-runs on every render because its callbacks are inline arrows, and the scroll root is captured once
Location: packages/platform/entity/runtime/form-detail/src/entity-runtime-workspace.tsx:132
What is wrong: the observer effect depends on `onApproach`/`onObserve`, which the parent passes as inline arrows created every render, so the observer is disconnected and recreated on every render and on every section state change; `root: scrollRoot?.current ?? null` is resolved only when the effect runs, so a pane that attaches later is never used as the root.
Impact: continuous-mode section tracking can oscillate or miss observations (wrong active section / wrong URL state) and the observer is rebuilt on every keystroke-driven render.
Suggested fix: pass `item.key` plus stable workspace methods and build the callbacks with `useCallback`; resolve the observer root lazily.

### [low] Authorized exit href is rendered without the URL validation used everywhere else
Location: packages/platform/entity/runtime/form-detail/src/intake.tsx:364
What is wrong: `headerOperations.exit.href` goes straight into an anchor's `href`, unlike record-action.tsx:36 and entity-lookup.tsx:460 which reject non-root-relative, protocol-relative, control-character and backslash URLs. No in-repo producer currently sets it, so this is defense-in-depth.
Evidence: `<a className="a-button a-button--secondary" href={headerOperations.exit.href}>` versus `record-action.tsx:36 const safeHref = action.href?.startsWith("/") && !action.href.startsWith("//") && ...`
Impact scenario: an untrusted or later server-driven capability value becomes script execution in the authenticated origin.
Suggested fix: validate the href with the same helper before rendering the anchor.

### [low] SSR/hydration mismatch: initial collaboration state is read from window during render
Location: packages/platform/entity/runtime/form-detail/src/entity-edit-collaboration.tsx:44
What is wrong: the state initializer calls `read()`, which reads `window.location` and `matchMedia` via `readCollaborationFull`; on the server `readCollaborationFull()` returns true and `isCollaborationRequested(empty)` returns false, while hydration uses the real URL, so the first client render can differ for `data-full`/`hidden`.
Impact: hydration mismatch warning plus a flash of record fields (or an open panel) for the deep-linked collaboration URL; currently only reachable through the tooling fixture.
Suggested fix: initialize server-stable and apply the URL/media read in a layout effect.

### [low] Exported but unreferenced: EntityIntakeForm and EntityDraftSaveButton
Location: packages/platform/entity/runtime/form-detail/src/intake.tsx:544
What is wrong: `EntityIntakeForm` and `EntityDraftSaveButton` are exported (and re-exported through index.tsx:449) but have no call site anywhere in the repository; `EntityIntakeForm` is additionally the only mount point for the DataValidationProvider wiring at :548.
Impact: dead exported API in the shared framework with an unexercised validation/review integration path.
Suggested fix: delete the unused exports or wire them into an entity/fixture.

## Checked and clean
- data-surface.tsx:174 - change-confirmation only triggers when a `clearOnChange.fields` entry actually changed; `closeChange()` restores focus by field id.
- data-surface.tsx:640 - primary radio group name is unique per collection instance; the root-level empty-prefix case is unreachable.
- data-surface.tsx:731 - counter and `validateDataInput` both measure trimmed Unicode code points, so the counter cannot disagree with maxLength validation.
- data-validation.tsx:26 - every `ValidationCode` has an English fallback, so `fallback.replace` cannot throw.
- data-validation.tsx:65 - sort comparator precedence is correct and `collect()` reads the live readers ref.
- detail-collaboration.tsx:63 - effect aborts on dep change/unmount, stale responses rejected, cursor merge keeps the workspace mounted.
- detail-workspace.tsx:342 - `entityRelationships!.find(...)!` is guaranteed by the descriptor parser (throws when a section declares a relationshipKey with no matching relationship).
- detail-workspace.tsx:91 - navigation ResizeObserver is disconnected on cleanup and its `[]` deps are safe for descriptor-derived data.
- form-layout.tsx:80 - MutationObserver disconnected on cleanup; JSON.stringify comparison prevents redundant writes.
- form-values.ts:16 - only `""`/`undefined` are empty, so 0/false survive and required fields are never coerced.
- record-360-panel.tsx:29 - `panel.tabs[0]!`/`sectionKey!` are guaranteed by the contract parser.
- record-action.tsx:25 - no conditional hook; `messages` covers every `EntityAccessState`; `safeHref` rejects protocol-relative, backslash and control-character URLs.
- protected-value.tsx:52 - sensitive-value lifecycle otherwise sound: expiry timer cleared, clear() on unmount/dep change, stale responses rejected by abort + attempt identity, expiry clamped to 60s, CSRF in a hidden field (not the URL).
- entity-lookup.tsx:460 - record-link guard rejects javascript:, protocol-relative, whitespace and backslash URLs.
- entity-runtime-workspace.tsx:82 - all hooks run before the loading/error early returns; continuous-scroll listeners removed on cleanup.
- intake.tsx:702 - `readIntakeFormReview` excludes hidden/submit/button/file inputs and masks password inputs.
- Working-tree note: data-surface.tsx, intake.tsx and form-values.ts were rewritten at 23:05-23:11 while this group was reading; the reviewer re-read all three completely and the coordinator re-verified the quoted medium findings afterwards.


# Group G3

# Sweep G3

Group G3 — reference lookups, sections, related records, attachment rendering.
Reviewed files are read-only; every quoted line was re-grepped against the working
tree at 2026-09-29 23:32 (+08). The tree is being edited by another writer during
this sweep (see Notes), so line numbers are pinned to that timestamp.

## Coverage
| path | lines | verdict |
| --- | --- | --- |
| packages/platform/entity/runtime/form-detail/src/reference-lookup.tsx | 50 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/reference-select.tsx | 250 | clean |
| packages/platform/entity/runtime/form-detail/src/related-entity-section.tsx | 271 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/related-record.tsx | 753 | findings 3 |
| packages/platform/entity/runtime/form-detail/src/rich-text-render.tsx | 160 | findings 2 |
| packages/platform/entity/runtime/form-detail/src/section-availability.ts | 9 | clean |
| packages/platform/entity/runtime/form-detail/src/section-navigation.tsx | 189 | clean |
| packages/platform/entity/runtime/form-detail/src/section-primitives.tsx | 234 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/section-workspace.tsx | 56 | clean |
| packages/platform/entity/runtime/form-detail/src/shared-section-request.ts | 42 | clean |
| packages/platform/entity/runtime/form-detail/src/subsection-heading.tsx | 27 | clean |
| packages/platform/entity/runtime/form-detail/src/use-section-resource.ts | 618 | findings 3 |
| packages/platform/entity/runtime/form-detail/src/attachment-download.ts | 23 | clean |
| packages/platform/entity/runtime/form-detail/src/attachment-preview.tsx | 181 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/attachment-reference.tsx | 22 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/attachment-thumbnail.tsx | 119 | clean |
| packages/platform/entity/runtime/form-detail/src/attachment-workspace.tsx | 4 | clean |

## Findings

### [high] SearchableSelect refetches the reference directory forever when a saved value cannot be resolved
Location: packages/platform/foundation/ui/src/searchable-select.tsx:239-242 (driven by packages/platform/entity/runtime/form-detail/src/reference-select.tsx:175)
What is wrong: The "resolve a retired saved value" effect has no in-flight/attempted guard, and its dependency `effectiveOptions` is recomputed from a fresh array every time a directory response lands. If the server answers 200 without returning the saved `value`, `directory.options` is replaced with a new array, the effect re-runs, and it issues another request immediately (no debounce on this path). Each iteration also creates an `AbortController` that is never aborted, so responses can land out of order and overwrite a newer query's results.
Evidence: `if (!loadPage || !value || effectiveOptions.some((option) => option.value === value)) return;` / `void loadDirectory("", undefined, value);` and `}, [effectiveOptions, loadDirectory, loadPage, value]);`, with `setDirectory((current) => ({ query: nextQuery, options: ... : page.options, ... }))`.
Impact scenario: A record holds a reference key whose directory row was removed/retired (or the `value` lookup returns an empty page). Opening the form returns 200 with no matching option, so the control fires an unbounded stream of directory requests until the tab is closed — server/DB hammering from an ordinary detail form.
Suggested fix: In `SearchableSelect`, track "already attempted to resolve this exact `value`" in a ref and reset it when `value` changes; also abort the previous `loadDirectory` request (store the controller in a ref) before starting a new one, and derive `effectiveOptions` with a content-stable key (or compare by content) instead of relying on array identity for the effect.

### [medium] Related-record row clicks never reach the inline editor
Location: packages/platform/entity/runtime/form-detail/src/related-entity-section.tsx:261
What is wrong: `RelatedRecordList` passes `onNavigate` to `EntityListRuntime` and parses record hrefs out of it to call `setEditing(id)`, but `EntityListRuntime` only consults `onNavigate` for header action links (list-view/src/index.tsx:541-549) and section navigation; record rows are rendered as plain anchors built from `recordHref` (`descriptor.entity.detailRouteTemplate`, `/app/entity/<code>/:recordId`). The `setEditing` branch is therefore unreachable and a row click performs a full browser navigation.
Evidence: `onNavigate={(href) => {` / `const prefix = \`/app/entity/${entityCode}/\`;` / `if (href.startsWith(prefix)) {` / `if (/^[0-9a-f-]{36}$/i.test(id)) setEditing(id);` versus list-view `chooser ? recordLink?.(row) : recordHref(descriptor, row)` rendered as `<a className="a-entity-list__record-link" href={href}>`.
Impact scenario: On a record whose section declares a `relationshipKey`, clicking an existing related record leaves the parent detail page (and any unsaved form state) and loads the related entity page, while the intended inline edit/detail view is never shown. The whole `setEditing(id)` code path is dead.
Suggested fix: Give `EntityListRuntime` a supported record-link hook (it already has `embedding.recordHref`, which needs a full `EntityDirectoryEmbedding`) or add a dedicated `onRecordHref`/click-interception prop, and pass `onNavigate`-style interception there so embedded lists can open records in place.

### [medium] Comment composer crashes on a draft document whose `content` is not an array
Location: packages/platform/entity/runtime/form-detail/src/rich-text-render.tsx:44
What is wrong: `draftDocument` validates only `content.type === "doc"` before casting the untyped server draft to `RichTextDocument`, then `editableCommentDocument` spreads `document.content`. `RichTextDocument.content` is required by the type but the runtime payload is never checked, so a persisted draft such as `{"content":{"type":"doc"}}` (no `content` array) throws `TypeError: document.content is not iterable` during render of the comment edit composer.
Evidence: `return { ...document, content: [...document.content, ...missing] };` after `content && typeof content === "object" && !Array.isArray(content) && (content as { type?: unknown }).type === "doc" ? (content as RichTextDocument) : undefined`.
Impact scenario: A user (or a legacy/other client) saved an empty rich-text draft; opening that comment for editing blanks the composer with a render error instead of opening, and the record's collaboration surface can be taken down by the error boundary.
Suggested fix: Validate `Array.isArray(document.content)` (and per-node `type`) in `draftDocument`/`editableCommentDocument` and fall back to the generated paragraph document when the shape is wrong.

### [low] `pinnedFiles` entries are dereferenced without a null check
Location: packages/platform/entity/runtime/form-detail/src/rich-text-render.tsx:35
What is wrong: Both attachment scans assume every element of `item.pinnedFiles` is a non-null object. A `null`/primitive element in that server-supplied array throws while rendering a comment.
Evidence: `.filter((file: any) => !ids.has(file.attachmentId))` (line 35) and `(file: any) => file.attachmentId === node.attrs?.attachmentId,` (line 75).
Impact scenario: One malformed pinned-file record makes every comment in the section fail to render (`Cannot read properties of null`), rather than degrading to the text/attachment fallback.
Suggested fix: Reuse a `valueRecord`-style guard (`Array.isArray(item.pinnedFiles) ? item.pinnedFiles.filter(...) : []` plus `file && typeof file === "object"`) before reading `attachmentId`.

### [low] `AttachmentPreviewControl` is an unused export
Location: packages/platform/entity/runtime/form-detail/src/attachment-preview.tsx:152
What is wrong: `AttachmentPreviewControl` is exported but never imported or rendered anywhere. I checked `grep -rn "AttachmentPreviewControl" apps packages server --include=*.ts --include=*.tsx`, which returns only its own declaration; it is not re-exported from `form-detail/src/index.tsx` either, so it is not part of the package's public surface.
Evidence: `export function AttachmentPreviewControl({` (single repo-wide occurrence).
Impact scenario: Dead code that must be kept compiling and type-checked; a stale second preview entry point invites future copy/paste divergence from the live `AttachmentPreview` usage in `attachments/collection.tsx` / `comments-workspace.tsx`.
Suggested fix: Delete the component, or route the callers that hand-roll the preview toggle through it.

### [low] The whole `reference-lookup` module is unused
Location: packages/platform/entity/runtime/form-detail/src/reference-lookup.tsx:10
What is wrong: `EntityReferenceLookup` has no consumer: `grep -rn "EntityReferenceLookup" apps packages server --include=*.ts --include=*.tsx` returns only the declaration at line 10. `form-detail/src/index.tsx:454` does `export * from "./reference-lookup";`, so it is published API with zero call sites; it is also the only user of `EntityLookup`'s cardinality adapter. It additionally passes a fresh `answers={{}}` object on every render, which would defeat memoization if it were ever mounted.
Evidence: `export function EntityReferenceLookup({` … `answers={{}}`.
Impact scenario: Untested dead surface (its cardinality-mismatch branch returns `<p role="alert">`), and a future consumer inheriting the unstable `answers` prop.
Suggested fix: Delete the module and its barrel export, or wire it into the reference form path and memoize `answers` (`const EMPTY = {}`).

### [medium] Whole-record invalidation leaves the active non-initial section stuck on "Loading section…"
Location: packages/platform/entity/runtime/form-detail/src/use-section-resource.ts:510
What is wrong: When a record-level invalidation arrives without a `sectionKey`, the handler clears all section state and force-reloads only `bootstrap.plan.initialSectionKeys`. If the currently active section is not one of those initial keys, its state is gone and nothing reloads it, so `entity-runtime-workspace` renders the `!state` branch ("Loading section…") indefinitely.
Evidence: `setSections({});` / `if (bootstrap)` / `for (const sectionKey of bootstrap.plan.initialSectionKeys)` / `void loadSection(bootstrap, sectionKey, true);`.
Impact scenario: An app calls the exported `invalidateEntityRuntimeSectionCache({...})` without a section (e.g. after a record-wide mutation); the user's visible section (attachments, comments, …) disappears into a permanent loading state until they navigate to another section and back. Note the record-scoped path at line 485 does this correctly by remembering `refreshSection.current = activeSectionKey`.
Suggested fix: Include the active section in the reload set, e.g. `for (const sectionKey of new Set([...bootstrap.plan.initialSectionKeys, ...(activeSectionKey ? [activeSectionKey] : [])]))`.

### [low] `workspace.invalidate(sectionKey)` evicts the shared cache without notifying other consumers
Location: packages/platform/entity/runtime/form-detail/src/use-section-resource.ts:464
What is wrong: The hook's `invalidate` deletes the module-level cache entry and reloads only this hook instance's state; unlike the standalone `invalidateEntityRuntimeSectionCache` (line 562), it never dispatches `INVALIDATION_EVENT`, even though a second mounted workspace showing the same section would be reading the same evicted entry.
Evidence: `const invalidate = useCallback(` / `(sectionKey?: string) => {` / `evict(identity, sectionKey);` / `if (sectionKey && bootstrap)` / `void loadSection(bootstrap, sectionKey, true);` versus `window.dispatchEvent(new CustomEvent(INVALIDATION_EVENT, {...}))` at line 563.
Impact scenario: With two consumers of one section (e.g. the record page plus the 360 panel), a mutation committed in one leaves the other showing the pre-mutation resource until its TTL/remount.
Suggested fix: Have `invalidate` delegate to `invalidateEntityRuntimeSectionCache` (or dispatch the same event) so all consumers of the identity refresh together.

### [low] `collections` is merged twice inside `mergeSectionPages`, the first result being discarded
Location: packages/platform/entity/runtime/form-detail/src/use-section-resource.ts:602
What is wrong: The generic accumulation loop already merges the `"collections"` key, but the generic object merge only accumulates `items`/`collections`/`data`; the dedicated block immediately below overwrites `result.collections` with the per-collection array union. The loop branch is a superseded, redundant computation (harmless today because both are idempotent).
Evidence: `for (const key of ["items", "collections", "data"]) { if (key in before || key in after) result[key] = merge(...) }` followed by `result.collections = Object.fromEntries([...new Set([...Object.keys(oldCollections), ...Object.keys(newCollections)])]`.
Impact scenario: Two merge implementations for the same field drift apart; a later change to the generic loop silently has no effect on `collections`, and the extra read/merge of every collection is wasted work on every page append.
Suggested fix: Drop `"collections"` from the generic key list and keep only the dedicated per-collection merge.

### [low] User-visible strings are hardcoded English in otherwise localized surfaces
Location: packages/platform/entity/runtime/form-detail/src/related-record.tsx:32
What is wrong: The related-record renderer returns/announces fixed English text even though the package ships `entityEnglishMessages` and the surrounding components use `intl.message`/`intl.text`. Same pattern at `attachment-reference.tsx:19-20`.
Evidence: `if (!present(value)) return "Not provided";`, `return value === true ? "Yes" : value === false ? "No" : "Not provided";`, `return "Invalid date";`, `setStatus("Copied");` / `setStatus("Copy unavailable");`, and `>{busy ? "Preparing download…" : "Download document"}</Button>`.
Impact scenario: A Malaysian/other-locale user sees and hears mixed English (including the `role="status"` text a screen reader announces) inside an otherwise translated record view.
Suggested fix: Route these through `useEntityI18n()`/existing message keys (`entity.value.yes`/`no` are already used in `section-primitives.tsx:213`), or accept a label map from the published presentation.

### [low] `aria-label` on plain `<span>` wrappers is not exposed
Location: packages/platform/entity/runtime/form-detail/src/related-record.tsx:280
What is wrong: Field labels are attached to generic `<span>` elements (implicit `role="generic"`, where naming is prohibited/ignored), so assistive tech announces only the badge value with no indication of which field it belongs to. Repeated at lines 337 and 651.
Evidence: `<span key={field.key} aria-label={field.label}>` wrapping `<FieldValue … />`.
Impact scenario: Header/summary badges such as a status or primary flag are announced as anonymous values; users cannot tell what the value describes.
Suggested fix: Render a visually hidden text label inside the span, or use a semantic element/`<dl>` structure so the name is actually computed.

### [low] Divergent duplicated "copy label + channel type" logic between summary and detail
Location: packages/platform/entity/runtime/form-detail/src/related-record.tsx:563
What is wrong: The summary builds the channel copy label from the mapped/labeled type via `detailValue(row.type, <type field>, locale)`, while the detail table builds it from the raw `scalar(row.type)`. One of the two must be wrong for any channel type that has a `values` mapping.
Evidence: detail table `copyLabel={\`${detail.copyLabel}: ${scalar(row.type)}\`}` versus summary `copyLabel={\`${profile.summary!.copyLabel}: ${ fields.find((field) => field.field === "type") ? detailValue(row.type, fields.find((field) => field.field === "type")!, locale) : valueField.label }\`}`.
Impact scenario: Channel types mapped through `DetailFieldV1.values` (e.g. a code) are copied as raw codes from the detail view but as human labels from the compact summary; pasted text differs depending on which view the user used.
Suggested fix: Extract one helper (type label resolution + copy label assembly) and use it in both branches.

### [low] Dead `centered` branch in `EmptySectionState`
Location: packages/platform/entity/runtime/form-detail/src/section-primitives.tsx:171
What is wrong: The centered case returns early at line 159, so inside the remaining `return` the `centered` prop is always `false` and the conditional class can never be added.
Evidence: `className={\`a-runtime-section-empty${centered ? " a-files-empty-state" : ""}\`}` after `if (centered) return (<PanelEmptyState className="a-files-empty-state" … />);`.
Impact scenario: `EmptySectionState({ centered: true })` never reaches this branch, and the CSS hook `a-files-empty-state` is unreachable here — dead code that misleads future readers into thinking both branches are live.
Suggested fix: Drop the ternary (`className="a-runtime-section-empty"`), or remove the early return and drive `centered` once.

## Checked and clean
- packages/platform/entity/runtime/form-detail/src/reference-select.tsx:36 - `referenceRecentKey` is exported but only consumed at line 76 of the same module (prior finding confirmed, not re-reported); no other repo caller.
- packages/platform/entity/runtime/form-detail/src/reference-select.tsx:67 - `aria-invalid` is forwarded intact by spreading `{...props}`; it is dropped inside `SearchableSelect` (destructured at searchable-select.tsx:123, never applied to the input) - prior finding confirmed, defect is downstream, not here.
- packages/platform/entity/runtime/form-detail/src/reference-select.tsx:110-170 - store/effect ordering is sound: the storageKey effect subscribes before the bindingKey effect, cleanup nulls `store.current` and unsubscribes, and every async store callback is guarded by subscription lifetime - no setState-after-unmount path found.
- packages/platform/entity/runtime/form-detail/src/reference-select.tsx:125-145 - `transport`'s `history!` assertion is safe: every call site is gated on `remote` (`policy.enabled && policy.persistence === "server" && !!history`).
- packages/platform/entity/runtime/form-detail/src/related-entity-section.tsx:85-129 - both load branches set state only behind the `current` flag; no AbortController is used (prior finding confirmed, not re-reported). The `key` on `RelatedRecordList`/`RelatedSingleRecord` correctly remounts on identity/scope/relationship change.
- packages/platform/entity/runtime/form-detail/src/section-navigation.tsx:98-151 - `wheel/touchstart/pointerdown/keydown` listeners and the ResizeObserver are removed/disconnected with matching capture flags; the `handledNavigationRevision` ref prevents passive observation from re-scrolling.
- packages/platform/entity/runtime/form-detail/src/section-navigation.tsx:28-42 - the compact `<select>` is wrapped by its `<label>`, so the control is named; rail buttons carry `aria-current`.
- packages/platform/entity/runtime/form-detail/src/section-navigation.tsx:124 - `target.focus({preventScroll:true})` is valid for every consumer: detail-workspace.tsx:334 (`tabIndex={-1}`), record-360-panel.tsx:139 (`role="tabpanel" tabIndex={-1}`), data-surface.tsx:865/885 (`tabIndex={-1}`).
- packages/platform/entity/runtime/form-detail/src/shared-section-request.ts:22-40 - subscriber accounting is correct: aborting one consumer only aborts the shared transport when the last subscriber releases, `force` replaces the pending entry without cancelling the replacement, and double-release is guarded.
- packages/platform/entity/runtime/form-detail/src/use-section-resource.ts:60-70 - the module-level cache is bounded (120 entries), prunes expired entries on write, and keys include tenant/principal/authEpoch, so no cross-user reuse or unbounded growth.
- packages/platform/entity/runtime/form-detail/src/use-section-resource.ts:176-227 - every page response re-checks `releaseHash`/`releaseId`, and `current()` (abort + generation + per-section epoch) is evaluated before each setState; stale responses cannot overwrite fresh ones.
- packages/platform/entity/runtime/form-detail/src/attachment-download.ts:10-22 - `attachmentCapabilityUrl` rejects non-HTTPS/same-origin/userinfo/`#` URLs (upload-lifecycle.ts:31-43), the id is `encodeURIComponent`-ed (collaboration-operations.tsx:100), and the temporary anchor is removed with `rel`/`referrerPolicy` set.
- packages/platform/entity/runtime/form-detail/src/attachment-thumbnail.tsx:45-79 - polling is capped at 12 attempts with `Math.min(1000*polls, 10000)` backoff, and observer/abort/timer are all cleaned up.
- packages/platform/entity/runtime/form-detail/src/related-record.tsx:95-115 - `safeChannelHref` rejects control characters, whitelists `http/https` through `new URL`, and only emits `mailto:`/`tel:` from strict patterns.
- packages/platform/entity/runtime/form-detail/src/related-record.tsx:403-408 - restricted postal components also delete `formattedAddress`, so a protected component cannot leak through the preformatted string.
- packages/platform/entity/runtime/form-detail/src/related-record.tsx:490,539,551 - `key={field.key}` for group fields and `key={scalar(row.id) || index}` for collection rows are stable within their lists.
- packages/platform/entity/runtime/form-detail/src/rich-text-render.tsx:139-152 - link marks are gated by `safeHref`, rendered with `rel="noopener noreferrer nofollow"`, and all content is rendered as React children (no `dangerouslySetInnerHTML` anywhere in this group).
- packages/platform/entity/runtime/form-detail/src/rich-text-render.tsx:157-159 - `tableSpan` clamps to integer 1..30, so a hostile `colspan` cannot blow up the table.
- packages/platform/entity/runtime/form-detail/src/section-availability.ts:2-8 - only 403 and 409 + the two known problem codes map to availability states; every other failure stays a generic error.
- packages/platform/entity/runtime/form-detail/src/subsection-heading.tsx:4-16 - `style: "accent"` is the contract's only permitted value (intake-surface.ts:82) and the base `.a-subsection-header` is already the accent style (foundation/ui/src/styles.css:396), so ignoring the field has no visible effect.
- packages/platform/entity/runtime/form-detail/src/section-workspace.tsx:27 - `data-expanded` is consumed as `[data-expanded=true]` by foundation/ui/src/styles.css:462-467, so the boolean attribute renders correctly.
- packages/platform/entity/runtime/form-detail/src/section-primitives.tsx:210-228 - `MetadataValue` is always invoked as `<MetadataValue/>` and its single hook call is before every return, so the conditional rendering cannot change hook order.
- packages/platform/entity/runtime/form-detail/src/attachment-reference.tsx:8-12 - both `useState`/`useApiClient` run before the non-UUID early return, so no conditional-hook violation.
- packages/platform/entity/runtime/form-detail/src/attachment-workspace.tsx:1-4 - the two re-exports are both consumed by `compiled-section-content.tsx:14-17`.

## Notes
- Prior-reviewer items, confirm/refute (one line each):
  - reference-select `aria-invalid` dropped by SearchableSelect - CONFIRMED (searchable-select.tsx:123 destructures it; no `aria-invalid` on the rendered input at all).
  - `referenceRecentKey` dead export - CONFIRMED (only reference-select.tsx:36 declaration + :76 use).
  - related-entity-section non-abortable loads - CONFIRMED (no AbortController in the file; only the `current` flag at :86/:207).
  - related-entity-section duplicated create-permission probe - CONFIRMED (`entityDescriptorClient.form(client, entityCode, "create")` at :106 and :209).
  - `RelatedRecord` dead render path - REFUTED as stated: I traced every branch of `RelatedRecord` (compact+summary early return, detail main/aside/footer, collapsed `<details>`, non-detail `<ul>`, empty-fields disclosure, profile actions) and all are reachable for some published presentation; please supply the exact line if the prior note meant something narrower.
  - related-record duplicated row filtering - CONFIRMED (`visibleRows` at :511-514 vs the inline re-filter of `rows` at :580-584).
  - rich-text-render `String(undefined)` attachmentId - CONFIRMED (:39 `String(file.attachmentId)` yields the literal "undefined" when the field is absent; use a guard instead).
  - `applyCommentMarks`/`tableSpan` dead exports - CONFIRMED (only internal uses at :68 and :110/111/119/120; not re-exported from index.tsx).
  - `EntityReferenceLookup` dead - CONFIRMED (only declaration; see finding).
  - AttachmentPreview immediate re-read loop - CONFIRMED (attachment-preview.tsx:61-68 falls back to a 1000 ms poll whenever `expiresAt` is already in the past or within 15 s, with no attempt cap).
- F1 (the directory refetch loop) lives in `packages/platform/foundation/ui/src/searchable-select.tsx`, which is not in my assignment; it is reported here because `reference-select.tsx:175` is its only `loadPage` producer in the tree. Route it to whoever owns platform-ui.
- Working tree was mutating during this sweep: `section-primitives.tsx` changed at 23:30 (237 -> 234 lines, `humanize` became `humanizeIdentifier`) and `list-view/src/index.tsx` shrank 5703 -> 5672 lines. All evidence quotes above were re-grepped after those edits; `section-primitives.tsx` line numbers are for the 234-line version. If it changes again, the `centered` finding needs a line-number refresh.
- Not reported, residual risk: `summaryFields()` can return two fields with the same `key` from different groups in a `postal-summary` (the parser only enforces a single group for `contact-summary`, related-presentation.ts:431-438), which would produce duplicate React keys in `AddressSummary`. Unproven for current metadata, so left out of findings.
- Not reported, judgement call: `safeChannelHref("whatsapp", …)` returns `tel:` rather than a WhatsApp deep link; the explicit `sms` special-case suggests `tel` is deliberate.
- Exported with no in-repo caller (public barrel API only): `invalidateEntityRuntimeRecord`, `subscribeEntityRuntimeRecord`, `invalidateEntityRuntimeSectionCache` (use-section-resource.ts:72/86/553, re-exported by index.tsx:477-479). None is dead code internally, so they are listed here rather than as findings.
- Could not verify server-side behaviour of the shared reference directory `value` lookup (whether an unknown value returns 200-empty or an error), which is the precondition for F1; the client-side loop is proven regardless.


# Group G4

# Sweep G4

Group: uploads, attachments, intake, and `record/*`. Read-only review; every quote below was
re-checked against the working tree with `grep`/`sed` after the last read.

## Coverage
| path | lines | verdict |
| --- | --- | --- |
| packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx | 1758 | findings 6 |
| packages/platform/entity/runtime/form-detail/src/attachments/upload-context.tsx | 5 | clean |
| packages/platform/entity/runtime/form-detail/src/attachments/uploader.tsx | 626 | findings 4 |
| packages/platform/entity/runtime/form-detail/src/file-action.tsx | 13 | clean |
| packages/platform/entity/runtime/form-detail/src/file-filter-body.ts | 11 | clean |
| packages/platform/entity/runtime/form-detail/src/file-search.tsx | 361 | findings 3 |
| packages/platform/entity/runtime/form-detail/src/file-type.tsx | 21 | clean |
| packages/platform/entity/runtime/form-detail/src/intake-classification.tsx | 90 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/intake-state.ts | 113 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/intake-surface.tsx | 182 | findings 2 |
| packages/platform/entity/runtime/form-detail/src/intake-workspace.tsx | 19 | clean |
| packages/platform/entity/runtime/form-detail/src/record/browser-preferences.ts | 12 | clean |
| packages/platform/entity/runtime/form-detail/src/record/entity-record-page.tsx | 320 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/record/index.ts | 10 | partial |
| packages/platform/entity/runtime/form-detail/src/record/protected-operation-registry.ts | 21 | clean |
| packages/platform/entity/runtime/form-detail/src/record/protected-value-attempt.ts | 21 | clean |
| packages/platform/entity/runtime/form-detail/src/record/record-body.tsx | 128 | clean |
| packages/platform/entity/runtime/form-detail/src/record/record-contracts.ts | 34 | clean |
| packages/platform/entity/runtime/form-detail/src/record/record-navigation.tsx | 310 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/record/record-summary-panel.tsx | 190 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/record/record-url-state.ts | 62 | clean |
| packages/platform/entity/runtime/form-detail/src/record/record-view-preferences.ts | 15 | clean |
| packages/platform/entity/runtime/form-detail/src/record/resolve-resource-context.ts | 12 | clean |
| packages/platform/entity/runtime/form-detail/src/record/use-record-collaboration.ts | 90 | clean |
| packages/platform/entity/runtime/form-detail/src/record/write-record-location.ts | 15 | clean |
| packages/platform/entity/runtime/form-detail/src/reference-history-store.ts | 197 | clean |
| packages/platform/entity/runtime/form-detail/src/registered-renderers/contact-address.tsx | 10 | clean |
| packages/platform/entity/runtime/form-detail/src/registered-renderers/index.ts | 5 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/upload-record-attachment.ts | 71 | clean |
| packages/platform/entity/runtime/form-detail/src/use-attachment-browse.ts | 90 | findings 1 |
| packages/platform/entity/runtime/form-detail/src/use-attachment-status-polling.ts | 101 | findings 1 |

## Findings

### [medium] Intake `entityLookup` fields can never receive an adapter through the registered composer
Location: packages/platform/entity/runtime/form-detail/src/intake-surface.tsx:147 (with intake-classification.tsx:66 and entity-lookup.tsx:445)
What is wrong: `EntityIntakeSurface` forwards `adapters={lookupAdapters}` to `EntityLookup`, but the
only composer, `EntityIntakeClassification`, has no `lookupAdapters` prop and never passes it, so
`lookupAdapters` is always `undefined`. `EntityLookup` then falls into its `!compatible` branch and
renders a permanent alert instead of a usable control.
Evidence:
`<EntityIntakeSurface
        surface={surface}
        answers={answers}
        showErrors={showErrors}
        disabled={busy}
        onChange={(next) => {` (intake-classification.tsx:66-71) — no `lookupAdapters`;
`if (!compatible)
    return (
      <p role="alert">
        This lookup requires an available, compatible entity adapter.
      </p>
    );` (entity-lookup.tsx:445-449).
Impact scenario: published intake metadata may declare an `entityLookup` field (the checked-in
business-partner intake metadata does, `adapterKey: "business_partner.intake"` in
apps/docs-internal/public/assets/reports/bp-integration-20260921/native-intake-exact-release.json:3675).
Rendering that step through the framework's registered classification component shows an error
alert where the picker should be; the field is unusable and no caller can wire adapters. Because
lookup fields are contractually `required: false`, the step still submits, so the failure is silent
in the persisted answers.
Suggested fix: add a `lookupAdapters?: EntityLookupAdapters` prop to `EntityIntakeClassification`
and forward it to `EntityIntakeSurface`; if adapters are required, fail fast when a surface contains
an `entityLookup` field and none were supplied.

### [medium] `EntityLookup` remounts on every answer change, losing in-progress search state
Location: packages/platform/entity/runtime/form-detail/src/intake-surface.tsx:149
What is wrong: the lookup's React `key` embeds the entire answers object, so any answer mutation
(including the lookup's own) unmounts and remounts the whole lookup subtree.
Evidence:
`<EntityLookup
                    key={`${field.key}:${JSON.stringify(values)}`}` (intake-surface.tsx:148-149),
where `values = intakeSurfaceValues(surface, answers)` (line 125).
Impact scenario: `EntityLookup` owns `query`, `result`, `selected`, `draft`, `open`, `decisions`
and recent-list state (entity-lookup.tsx:106-119). Changing any unrelated choice-card answer — or
committing a lookup selection — wipes the typed query, closes the open picker, re-runs
`resolveActions`, and remounts the lazily imported `EntityListRuntime`, so a user typing a party
name can lose it mid-keystroke when another field on the same surface settles.
Suggested fix: key the lookup by `field.key` only, and let the existing
`useEffect(() => {...}, [JSON.stringify(answers)])` guards inside `EntityLookup` react to
dependency changes.

### [medium] Drag-to-upload gate compares `dataTransfer.types` with a localized label
Location: packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:828
What is wrong: the OS file-drag MIME type is the literal string `"Files"`, but the collection
compares it with the translated UI label.
Evidence:
`onDragEnter={(event) => {
        if (
          upload &&
          Array.from(event.dataTransfer.types).includes(
            intl.message("collaboration.files"),
          )
        ) {
          event.preventDefault();
          setUploadOpen(true);
        }
      }}` (collection.tsx:828-838); the catalog is
`"collaboration.files": ["Files", "Fail", "الملفات"],`
(packages/platform/foundation/i18n/src/catalogs/collaboration.ts:356). The sibling implementation
in the uploader correctly hardcodes the type: `Array.from(event.dataTransfer.types).includes(
            "Files",
          )` (uploader.tsx:407-410).
Impact scenario: in every locale that translates this key (`Fail`, `الملفات` — neither is the
literal drag type), the `includes` check fails, `preventDefault()` is never
called and `setUploadOpen(true)` never runs. The uploader card is `hidden` while collapsed
(uploader.tsx:400), so it cannot be a drop target; the browser then performs its default drop
action on the section (navigating away to the dropped file), which can discard unsaved record
state. Drag-and-drop upload silently does nothing.
Suggested fix: test `event.dataTransfer.types.includes("Files")` (and/or
`"application/x-moz-file"`) exactly as `uploader.tsx` does.

### [medium] Header-action failures render inside an already-closed `<details>`
Location: packages/platform/entity/runtime/form-detail/src/record/record-navigation.tsx:296
What is wrong: the action button closes the disclosure before awaiting the operation, and the error
node lives inside the panel that is now collapsed, so the error is never visible or announced.
Evidence:
`onClick={() => {
                  menu.current?.removeAttribute("open");
                  void onExecute(action.operationKey);
                }}` (record-navigation.tsx:296-299) followed by
`{error ? <p role="alert">{error}</p> : null}` (line 304) inside
`<details ref={menu} className="a-record-page-header__actions-menu">` (line 286). The error text is
set by entity-record-page.tsx:233-238.
Impact scenario: a record action that fails (authorization, revision conflict, transport) sets
`actionError`, but the user sees the menu close and nothing else — `details:not([open])` content is
`display:none`, so the `role="alert"` is not exposed to assistive technology either. The
`pendingAction` spinner also disappears, making a failed action look like a no-op.
Suggested fix: render the error outside the `<details>` (or force `open` while `error` is set) and
focus/announce it.

### [medium] Status polling permanently stops for a file after 5 failures
Location: packages/platform/entity/runtime/form-detail/src/use-attachment-status-polling.ts:55
What is wrong: a file id is dropped from the local `pending` set after 5 consecutive failures, and
the effect only re-runs when `pendingKey` changes; if the section keeps returning the same pending
ids, polling never restarts even after the server recovers.
Evidence:
`if (attempts >= 5) {
              pending.delete(id);
              setStatus((current) => ({
                ...current,
                [id]: "Status is temporarily unavailable",
              }));
            }` (lines 57-63) and `}, [client, pendingKey]);` (line 79), where `pendingKey` is the
sorted JSON of the same pending ids (lines 13-22). Backoff is
`delay = Math.min(delay * 2, 10000)` (line 71), applied even when every probe succeeded, and there
is no jitter.
Impact scenario: a brief 5-request outage (deploy, throttling, expired token) pins the row at
"Status is temporarily unavailable" forever while the upload actually finishes; the record section
is never told to refresh (`changed` stays false), so the file appears stuck until the user
navigates away or another event changes the pending id set.
Suggested fix: keep the id in the retry set with a long (jittered) backoff and a cap only on the
display, or reset `failures` on any success and re-arm polling on a fresh `items` identity; add
jitter to the delay.

### [medium] Folder retry keeps a stale `expectedRevision` and drops the idempotency key on conflict
Location: packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:601
What is wrong: a retained folder command replays the workspace revision captured before the first
attempt, so any failure whose recovery path calls `onChanged()` (which refreshes the revision)
makes the retry fail with `ATTACHMENT_WORKSPACE_REVISION_CONFLICT`; that handler then deletes the
retained idempotency key, so the next attempt is treated as a brand-new intent.
Evidence:
`const current = folderCommands.current.get(key) ?? {
      folderId: body.folderId === null ? null : String(body.folderId),
      idempotencyKey: crypto.randomUUID(),
      expectedRevision: revision,
    };` (lines 601-605);
`cause.problem?.code === "ATTACHMENT_WORKSPACE_REVISION_CONFLICT"
      )
        folderCommands.current.delete(key);
      onChanged();
      throw cause;` (lines 619-626). `createFolder` also reuses the same object and a fresh
`folderId: crypto.randomUUID()` once the entry is gone (lines 643-648).
Impact scenario: a create-folder request fails after the server committed it (timeout/reset).
`onChanged()` moves the workspace revision, the user retries, the pinned revision is rejected with
409, the idempotency key is discarded, and the third attempt re-issues create with a new
`folderId`/key — producing a duplicate folder, which is exactly what the idempotency key exists to
prevent (see the comment at lines 281-283 for the attachment actions).
Suggested fix: refresh `expectedRevision` from the current `workspaceRevision` before replaying a
retained command (or resolve the conflict by looking the folder up by its stable `folderId`) and do
not discard the idempotency key on a revision conflict.

### [medium] File admission and uploads continue after the uploader unmounts
Location: packages/platform/entity/runtime/form-detail/src/attachments/uploader.tsx:299
What is wrong: `addFiles` awaits a duplicate-name `attachmentBrowse` call with no `AbortSignal` and
no unmount guard, and the abort-on-unmount effect only aborts controllers that were registered
before unmount.
Evidence:
`useEffect(
    () => () => {
      for (const controller of uploadControllers.current.values())
        controller.abort();
    },
    [],)` (lines 76-82) runs once at unmount, while
`const result = await client.request(attachmentBrowse, {` … `exactName: true,` (lines 349-356)
resumes
afterwards and calls `enqueue`/`runBatch`/`upload`, which registers a *new* controller
(`uploadControllers.current.set(attempt.attachmentId, controller)`, line 108) that nothing aborts
and which then PUTs bytes.
Impact scenario: the user closes the collaboration panel or navigates away while the duplicate
probe is in flight; the component keeps working, `setQueue`/`setBusy`/`setError` are called on an
unmounted tree, and the file is still uploaded to the server — surprising data written after the
user left the page.
Suggested fix: create an `AbortController` in the unmount effect, pass its signal to the duplicate
probe, check `signal.aborted` before `enqueue`, and skip `upload()` when aborted.

### [low] Missing capability metadata is treated as unlimited uploads
Location: packages/platform/entity/runtime/form-detail/src/attachments/uploader.tsx:41
What is wrong: the "uploads disabled" sentinel is `maxFileBytes === 0`, tested with `!==`, so an
absent `capability` object (or an absent `maxFileBytes`) evaluates to "uploads allowed" with no
client-side size/type policy.
Evidence: `const uploadsAllowed = capability?.maxFileBytes !== 0;` (line 41), then
`validateUploadFile(file, capability ?? {})` (line 324) passes an empty policy so `maxFileBytes`
and `allowedContentTypes` checks are skipped (packages/platform/communications/collaboration-ui/src/upload-lifecycle.ts:8-18).
Impact scenario: if a publication omits `capability` for an attachments section, the drop zone
advertises uploads (the prompt at 472-505 shows no allowed-types/per-file limit) and any size/type
file is staged; only the server stops it, and the user gets a late failure instead of an early one.
Suggested fix: require `capability` for uploads (`capability !== undefined && capability.maxFileBytes !== 0`)
and disable the drop zone with a clear message when the policy is missing.

### [low] Switching search scope aborts a contents search but leaves it marked as completed
Location: packages/platform/entity/runtime/form-detail/src/file-search.tsx:61
What is wrong: `setScope` aborts the in-flight search, clears `busy` and changes scope, but does not
clear `submitted`/`hits`, so an aborted query is later rendered as a finished zero-result search.
Evidence:
`const setScope = (value: "names" | "contents") => {
    pending.current?.abort();
    setBusy(false);
    setScopeState(value);

  };` (lines 61-66) versus the empty-state guard
`{search.submitted &&
      !search.busy &&
      !search.error &&
      !search.cursor &&
      !search.hits.length ? (` (lines 302-306).
Impact scenario: the user submits "invoice", then clicks the "Names" radio (or the
"Search names" button in the results pane) before the response lands; on returning to "Contents"
the pane claims the query returned no matches, so the user concludes the content search is empty
when it never completed.
Suggested fix: clear `submitted`/`hits`/`cursor` in `setScope` (or track the aborted query) so an
aborted search is shown as not-yet-run.

### [low] History disclosure points `aria-controls` at an id that is not rendered while loading
Location: packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:1391
What is wrong: the toggle advertises a controlled element as soon as it is expanded, but the target
id only exists once the version history has loaded.
Evidence:
`aria-controls={
                                  history.has(String(item.id))
                                    ? `file-history-${item.id}`
                                    : undefined
                                }` (lines 1391-1396) versus
`{history.has(String(item.id)) &&
                    Array.isArray(item.versionHistory) ? (
                      <ul
                        id={`file-history-${item.id}`}` (lines 1569-1572); the loading/error branch
renders an `<p>` with no id (lines 1646-1656).
Impact scenario: expanding history before the request resolves leaves `aria-controls` referencing a
non-existent element; screen readers cannot resolve the relationship and the expanded content has
no accessible name until the ul appears.
Suggested fix: render a stable container with that id in the loading/error branches too, or omit
`aria-controls` until the list exists.

### [low] Hard-coded DOM id for the filter region instead of `useId`
Location: packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:1031
What is wrong: `file-browse-filters` is a literal id while the adjacent upload area uses
`useId()`, so two mounted collections would produce duplicate ids and mis-resolve `aria-controls`.
Evidence:
`<div
            id="file-browse-filters"
            hidden={!filtersOpen}` (lines 1030-1032) referenced by
`aria-controls="file-browse-filters"` (line 814); the neighbouring control uses
`const uploadAreaId = useId();` (line 141) and `aria-controls={uploadAreaId}` (line 1748).
Impact scenario: any second `AttachmentCollection` on the page (embedded/duplicated section, or a
future record-in-record view) makes the filter buttons of both instances point at the first
region, so the disclosure relationship is wrong for one of them.
Suggested fix: derive the id with `useId()` and use it in both places.

### [low] Client-side command and history caches are never bounded
Location: packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:284
What is wrong: retry keys and history pages accumulate in refs that are only pruned on success,
scope change, or a specific conflict.
Evidence:
`const attachmentCommands = useRef(new Map<string, string>());` (line 284) with
`const existing = attachmentCommands.current.get(key);` / `if (existing) return existing;` (287-289)
and deletion only in `completeCommand` (295); `historyCache.current.set(key, versions)` (363) cleared
only when the identity scope changes (329); `folderCommands` retains entries for every non-409
failure (601-626).
Impact scenario: an operator repeatedly retrying a failing rename/category/version action against
a long-lived record accumulates one idempotency-key entry per `action:id:value` combination, and
every history series toggled is cached for the session; memory grows without bound until the page
is reloaded.
Suggested fix: cap the maps (LRU/`size` check) or clear entries when their owning row disappears
from the refreshed section.

### [low] Summary panel feeds unvalidated server `displayFields` into `MetadataFields`
Location: packages/platform/entity/runtime/form-detail/src/record/record-summary-panel.tsx:135
What is wrong: card data is trusted shape-wise; only `Array.isArray` is checked before it is passed
as the typed `presentation.fields` array.
Evidence:
`const displayFields =
    summary && Array.isArray(summary.displayFields)
      ? summary.displayFields
      : [];` (lines 135-138) passed as
`<MetadataFields
        fields={displayFields}
        values={summary?.value as Record<string, unknown>}
      />` (140-144), while `Fields` keys rows by `field.key` (section-primitives.tsx:89-90).
Impact scenario: a server shape drift (fields as strings, or objects without `key`) yields
duplicate `undefined` React keys and empty rows instead of the intended "unavailable" fallback —
exactly the drift a runtime parse would surface.
Suggested fix: validate each entry (`typeof key === "string"`, optional known props) and fall back
to the generic `dl` rendering when the shape is not recognised.

### [low] View preference is read from localStorage on every render
Location: packages/platform/entity/runtime/form-detail/src/record/entity-record-page.tsx:107
What is wrong: the preference read is a plain render-time call, not a lazy initializer, although its
value is only used to seed two `useState` calls.
Evidence:
`const initialViewPreference = readRecordViewPreference(preferenceKey);` (line 107) followed by
`const [view, setView] = useState<"content" | "summary">(() =>
    initialViewPreference.summary ? "summary" : "content",
  );` (108-110); `readRecordViewPreference` performs `readStorageJson` + `JSON.parse`
(record-view-preferences.ts:3-9, browser-preferences.ts:4-9).
Impact scenario: every keystroke-driven re-render of the record page (scroll handler, action
pending, collaboration state) performs a synchronous localStorage read and JSON parse for a value
that never changes during the instance's life.
Suggested fix: hoist the read into a `useRef`/lazy initializer or the existing keyed instance.

### [low] `entityEditors` is exported but has no consumer
Location: packages/platform/entity/runtime/form-detail/src/registered-renderers/index.ts:4
What is wrong: dead registration table; only `summaryRenderers` is consumed.
Evidence:
`export const entityEditors = Object.freeze({"platform.contact.editor.v1": ContactEditor,"platform.address.editor.v1": AddressEditor});`
(line 4). Checked with
`grep -rn "entityEditors" apps packages server --include=*.ts --include=*.tsx` → only this
definition; also `grep -rn "ContactEditor|AddressEditor" ...` → only this file. `summaryRenderers`
has one consumer (record-summary-panel.tsx:13,165). Note the module is re-exported from the package
root (`export * from "./registered-renderers"`, index.tsx:496), so an out-of-repo consumer could
still import it; there is none in this repository.
Impact scenario: the contact/address editor registrations look wired up but nothing selects them,
so editor renderer keys silently fall back to generic rendering.
Suggested fix: either consume `entityEditors` from the record editor path or delete the export.

### [low] `FileSearchInput.creationAction` is never supplied
Location: packages/platform/entity/runtime/form-detail/src/file-search.tsx:142
What is wrong: dead prop/branch — no caller passes `creationAction`, and the component is not
exported from the package root.
Evidence:
`creationAction,` (line 142) / `creationAction?: ReactNode;` (line 150) /
`{creationAction ? <div className="a-file-search__create">{creationAction}</div> : null}` (line 194).
Checked with `grep -rn "creationAction" apps packages server --include=*.ts --include=*.tsx` → only
these three lines plus the unrelated `creationActions` in entity-lookup.tsx; the only caller,
collection.tsx:851-861, passes just `actions`.
Impact scenario: dead branch that will silently never render; a future "create file" affordance
added through this prop inside the collection would never appear.
Suggested fix: remove the prop, or wire it from the caller that needs it.

### [low] Browse results are discarded whenever the section resource refreshes
Location: packages/platform/entity/runtime/form-detail/src/use-attachment-browse.ts:79
What is wrong: the last dependency is declared as `revision` but the caller passes the section's
`items` array, and the effect clears the loaded browse page (including pagination) on any change of
that identity.
Evidence:
`}, [client, entityType, entityId, active, name, folder, category, revision]);` (line 79) with
`setItems(undefined); setCursor(undefined);` (69-70), called from
`useAttachmentBrowse(
    client,
    entityCode,
    recordId,
    canSearch,
    filter,
    folderFilter,
    categoryFilter,
    items,
  );` (collection.tsx:269-278). `items` is a fresh array per server response
(compiled-section-content.tsx:54-67).
Impact scenario: while an attachment is still processing, `useAttachmentStatusPolling` calls
`onChanged()` and the section refetches; every such refresh nulls an active name/content browse
result set and any loaded "more" pages, making the filtered list blink and forcing a new request
(180 ms debounce) on each poll.
Suggested fix: pass a genuine resource revision string, or only reset the browse page when the
filters/record change and merge in refreshed rows.

### [low] Saved intake checkpoint shape is not validated before use
Location: packages/platform/entity/runtime/form-detail/src/intake-state.ts:16
What is wrong: the checkpoint is only checked against the loaded flow (keys/hash), not for its own
shape; `saved.completed` and `saved.currentStep` are used directly.
Evidence:
`if (
    saved &&
    (!flow.allowDraftResume ||
      saved.flowKey !== flow.key ||
      saved.descriptorHash !== descriptorHash ||
      !keys.has(saved.currentStep) ||
      saved.completed.some((k) => !keys.has(k)))
  )` (lines 17-24). `initialCheckpoint` is a public prop on the intake runtime
(intake.tsx:142) with no in-repo caller, so the value crosses a JS boundary untyped.
Impact scenario: a persisted/server draft with `completed` missing or not an array throws
`TypeError: saved.completed.some is not a function` from inside a `useState` initializer, crashing
the intake render instead of raising the intended "different flow revision" error.
Suggested fix: `Array.isArray(saved.completed)` (and a `typeof saved.currentStep === "string"`)
check before the flow comparison.

### [low] Duplicate React key for two identical files in the duplicate chooser
Location: packages/platform/entity/runtime/form-detail/src/attachments/uploader.tsx:514
What is wrong: the key is derived from file name + `lastModified`, which is identical for two
copies of the same file added in one batch.
Evidence:
`<div key={`${duplicate.file.name}-${duplicate.file.lastModified}`}>` (line 514), populated from
`setDuplicates((current) => [...current, ...pending])` (line 375) for files matched by name.
Impact scenario: selecting the same file twice (same name and mtime, e.g. two downloads of one
attachment) yields duplicate keys; React reuses/drops the wrong row, so the "new version" /
"separate" / "cancel" buttons can act on the other entry.
Suggested fix: key duplicates by a generated id assigned at admission time.

## Checked and clean
- packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:325-375 – history
  effect creates its own `AbortController`, aborts on cleanup, and every `setHistoryRows`/error
  write is fenced by `if (controller.signal.aborted) return`; server payload is shape-checked
  (`if (!Array.isArray(versions)) throw`).
- packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:406-460 – linked-file
  effect aborts the previous probe, removes the `popstate` listener, and ignores aborted responses;
  `appliedPreviewLink` prevents repeat work.
- packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:596-600,636-642,716-753
  – `Number(workspaceRevision)` is validated with `Number.isSafeInteger`, rename enforces a positive
  revision regex, and the version retry reuses the same staged `attachmentId` with
  `retry: same` only for the identical `File`, so bytes are never re-staged blindly.
- packages/platform/entity/runtime/form-detail/src/attachments/uploader.tsx:92-183 – abort is
  threaded into `uploadRecordAttachment`; an `AbortError` removes the row and refreshes instead of
  offering a retry, and 422 responses are marked non-retryable.
- packages/platform/entity/runtime/form-detail/src/attachments/uploader.tsx:189-248 – the ready-row
  promotion timer is cleared in the effect cleanup (no interval/timer leak on unmount or re-render).
- packages/platform/entity/runtime/form-detail/src/attachments/uploader.tsx:406-456 – the uploader's
  own drag path uses the literal `"Files"` type, tracks `dragDepth`, and refuses the drop with
  `dropEffect = "none"` when uploads are not permitted.
- packages/platform/entity/runtime/form-detail/src/upload-record-attachment.ts:36-69 – the status
  probe maps 404 to `undefined` (unfinalized) rather than an error, and stage/finalize use the
  staged `attachmentId` as the idempotency key so retries are same-intent.
- packages/platform/entity/runtime/form-detail/src/use-attachment-browse.ts:26-64 – the
  `generation` counter plus `controller.signal.aborted` guard prevents a stale response from
  overwriting a newer filter's page, and `loadMore` refuses to start while a request is pending.
- packages/platform/entity/runtime/form-detail/src/use-attachment-status-polling.ts:32-78 – polling
  uses `setTimeout` (never `setInterval`), aborts the controller and clears the timer on unmount,
  and swallows post-abort responses.
- packages/platform/entity/runtime/form-detail/src/file-search.tsx:100-117 – an aborted search never
  writes `hits`, `cursor` or `busy`, so results cannot arrive out of order.
- packages/platform/entity/runtime/form-detail/src/file-search.tsx:230-238 – the `ResizeObserver`
  for excerpt clipping is disconnected on every cleanup.
- packages/platform/entity/runtime/form-detail/src/reference-history-store.ts:27-54 – persisted
  items are filtered for key shape, finite expiry and duplicates and capped by `limit`; only
  `{key, selectedAt}` is written to `localStorage`, so no labels/PII leave the session.
- packages/platform/entity/runtime/form-detail/src/reference-history-store.ts:104-146 – reads wait
  on the mutation queue and both read and mutate responses are dropped when a newer revision has
  been issued, so an older payload cannot overwrite an optimistic selection.
- packages/platform/entity/runtime/form-detail/src/reference-history-store.ts:158-196 – window
  listeners are installed once for all controls and removed when the last store unsubscribes, with a
  microtask guard for StrictMode re-subscription.
- packages/platform/entity/runtime/form-detail/src/record/record-url-state.ts:33-57 – resource
  context parses only strict UUIDs and `YYYY-MM-DD` `asOf`, dropping anything else instead of
  coercing it into the request.
- packages/platform/entity/runtime/form-detail/src/record/write-record-location.ts:6-14 – rejects
  cross-origin targets, preserves router history state and skips no-op writes.
- packages/platform/entity/runtime/form-detail/src/record/entity-record-page.tsx:44-60 – the
  identity `scopeKey` (tenant/principal/authEpoch/entity/record) remounts the instance so no
  view state or revealed value survives a scope change.
- packages/platform/entity/runtime/form-detail/src/record/entity-record-page.tsx:213-243 – header
  actions are filtered through `adapter.actions` with `Object.hasOwn` before execution, and errors
  are captured into state rather than swallowed.
- packages/platform/entity/runtime/form-detail/src/record/protected-operation-registry.ts:11-20 –
  reveals are an `Object.hasOwn` allowlist and historical (`asOf`) reveals are refused outright.
- packages/platform/entity/runtime/form-detail/src/record/protected-value-attempt.ts:7-19 – the
  expiry timer is cleared when re-armed and on `cancel()`, and never fires after abort.
- packages/platform/entity/runtime/form-detail/src/record/record-body.tsx:54-65 – the scroll
  debounce timeout is cleared on unmount.
- packages/platform/entity/runtime/form-detail/src/record/record-navigation.tsx:231-256 – the
  pointerdown/keydown listeners are removed on cleanup, and Escape closes the menu and returns focus
  to the summary.
- packages/platform/entity/runtime/form-detail/src/record/record-summary-panel.tsx:54-80 – one
  `AbortController` per fetch with `!controller.signal.aborted` guards before every `setState`.
- packages/platform/entity/runtime/form-detail/src/registered-renderers/contact-address.tsx:7-8 –
  contact channels go through `safeChannelHref`, which whitelists `mailto:`/`tel:`/`https:` shapes
  and rejects CR/LF and other control characters.
- packages/platform/entity/runtime/form-detail/src/registered-renderers/index.ts:3 – renderer maps
  are frozen at module scope, so no consumer can mutate shared registrations in place.
- packages/platform/entity/runtime/form-detail/src/file-filter-body.ts:2-10 – one shared filter
  serializer is used by both browse and content search, so the two bodies cannot drift.
- packages/platform/entity/runtime/form-detail/src/intake-state.ts:44-61 – `navigateIntake` re-checks
  the target's entry condition and linear prerequisites before moving.
- packages/platform/entity/runtime/form-detail/src/intake-surface.tsx:37-41,70-74,97-101 – the
  fieldset's `aria-describedby` and each radio's description id are rendered under exactly the same
  conditions they are referenced, and `useId()` scopes them per field.
- packages/platform/entity/runtime/form-detail/src/intake-classification.tsx:39-63 – the submit lock
  ref plus `busy` flag prevents double continuation and resets in `finally`.

## Notes
- `file-action.tsx` `onKeyUp` resets the tooltip-dismissed flag only on `Tab`; pointer/keyboard
  re-entry otherwise keeps a card's tooltip suppressed for the rest of its life. Judged cosmetic,
  not reported as a finding.
- No `createObjectURL`/`revokeObjectURL` exists anywhere in this package
  (`grep -rn "createObjectURL\|revokeObjectURL"` over form-detail and communications returned
  nothing), so the object-URL leak class does not apply to these files; thumbnail/preview byte
  handling lives in `attachment-thumbnail.tsx` / `attachment-preview.tsx`, which are outside this
  group.
- `packages/platform/entity/runtime/form-detail/src/record/index.ts` is exposed as the package
  subpath `"./record"` (package.json:10) but has no in-repo importer
  (`grep -rn 'record/index\|"./record"' apps packages server` matched only that package.json line);
  the same is true of `EntityRecordPage`, which is also re-exported from `index.tsx:498`. Both are
  public API surface, so I did not classify them as dead code.
- Hard-coded English strings still reach the UI in shared paths (e.g. collection.tsx "Save",
  "This archives the file everywhere it is linked…", "Only the first N files can be added at once.",
  uploader.tsx "Uploads are not permitted for this record.", intake-workspace.tsx "Layout"/"Guidance",
  file-search.tsx "Show more"/"Show less", record-summary-panel.tsx "Available"/"Current"). They are
  user-visible and untranslated while neighbouring strings use `intl.message`; grouped here rather
  than filed individually as they are an i18n-coverage gap rather than a logic defect.
- `collection.tsx` action promises (`download`, `unlink`, `archive`, `rename`, `category`,
  `folderCommand`, `copyLink`) have no abort/`isConnected` guard and will `setErrors`/`setBusy`
  after the panel closes. React 19 no longer warns, and the impact is limited to a dropped state
  update, so it is not filed as its own finding; the upload case was filed because it keeps writing
  bytes to the server.
- The uploader's `progress?: number` queue field (uploader.tsx:61) is never assigned; the
  `progress` elements are indeterminate. Left as a note because the rendered behaviour (indeterminate
  bar) is correct for the current lifecycle.
- I did not deep-review the files owned by the other reviewer (list-view/src/index.tsx,
  form-detail/src/index.tsx, form-detail/src/entity-read-runtime.tsx,
  form-detail/src/routes/entity-read-page.tsx, apps/*/lib/relay.ts); `entity-lookup.tsx`,
  `collaboration-surface.tsx`, `compiled-section-content.tsx` and
  `communications/collaboration-ui/src/upload-lifecycle.ts` were read only where needed as evidence
  for the assigned files.


# Group G5

# Sweep G5

Group: list-view runtime (index.tsx excluded — owned by another reviewer).
Reviewed from the working tree at 2026-09-29T23:31 (+08:00). `browser-storage.ts` (23:28:36) and
`preferences.ts` (23:28:36) were edited mid-review and were fully re-read afterwards; every quote
below was re-verified with grep against the file as it stands now. `index.tsx` and `list-notice.ts`
were also being edited during the run and are only used as context.

## Coverage

| path | lines | verdict |
| --- | --- | --- |
| packages/platform/entity/runtime/list-view/src/applied-filters.tsx | 2 | clean |
| packages/platform/entity/runtime/list-view/src/bookmark-state.ts | 6 | clean |
| packages/platform/entity/runtime/list-view/src/browser-storage.ts | 15 | clean |
| packages/platform/entity/runtime/list-view/src/columns.ts | 47 | clean |
| packages/platform/entity/runtime/list-view/src/data-operations.tsx | 120 | findings 3 |
| packages/platform/entity/runtime/list-view/src/directory-filters.tsx | 262 | findings 2 |
| packages/platform/entity/runtime/list-view/src/drawer-registry.tsx | 29 | clean |
| packages/platform/entity/runtime/list-view/src/entity-location.ts | 4 | clean |
| packages/platform/entity/runtime/list-view/src/field-catalogue.tsx | 230 | clean |
| packages/platform/entity/runtime/list-view/src/filter-editor.tsx | 1 | clean |
| packages/platform/entity/runtime/list-view/src/import-workspace.tsx | 50 | findings 1 |
| packages/platform/entity/runtime/list-view/src/location.ts | 74 | findings 1 |
| packages/platform/entity/runtime/list-view/src/lookup-directory.ts | 168 | clean |
| packages/platform/entity/runtime/list-view/src/navigation.tsx | 51 | findings 1 |
| packages/platform/entity/runtime/list-view/src/overview-favourites.tsx | 330 | findings 1 |
| packages/platform/entity/runtime/list-view/src/overview-messages.ts | 10 | clean |
| packages/platform/entity/runtime/list-view/src/overview.tsx | 731 | findings 1 |
| packages/platform/entity/runtime/list-view/src/preferences.ts | 101 | findings 2 |
| packages/platform/entity/runtime/list-view/src/required-context-status.tsx | 26 | clean |
| packages/platform/entity/runtime/list-view/src/retry-policy.ts | 4 | clean |
| packages/platform/entity/runtime/list-view/src/scope-control.tsx | 104 | findings 2 |
| packages/platform/entity/runtime/list-view/src/state.ts | 28 | clean |
| packages/platform/entity/runtime/list-view/src/sticky-table-header.ts | 50 | findings 1 |
| packages/platform/entity/runtime/list-view/src/sticky-table.tsx | 9 | findings 1 |
| packages/platform/entity/runtime/list-view/src/transfer-workspace.tsx | 41 | findings 1 |
| packages/platform/entity/runtime/list-view/src/view-policy.ts | 38 | clean |

## Findings

### [medium] Import wizard loses the staged session id and can never cancel an abandoned session

Location: packages/platform/entity/runtime/list-view/src/data-operations.tsx:88

What is wrong: `validate()` mints the session id locally and only commits it to state after every
step (begin → prepare → upload → complete → validate) has succeeded. `beginRecordImportOperation`
has already created a server-side session before any of the fallible steps run, so a failure in
prepare/upload/complete/validate leaves a staged session that the component no longer knows about.
The upload `fetch` is also issued without an `AbortSignal`, and `reset()` (called when the dialog
closes) does not cancel either. The API client does expose `cancelRecordImportOperation`
(`packages/platform/foundation/api-client/src/entity-list.ts:44`), but this file never imports or
calls it.

Evidence: `const validate = async () => { setBusy(true); setError(""); try { const id = crypto.randomUUID(); ... const result = await client.request(validateRecordImportOperation, { params: { sessionId: id }, idempotencyKey: `import:${id}:validate` }); setSessionId(id); setPreview(result); setStep("validate"); } catch (cause) { setError(cause instanceof Error ? cause.message : "Validation failed."); } finally { setBusy(false); } };`
and `const reset = () => { setStep("prepare"); setOperation(initialOperation); setFile(undefined); setPreview(undefined); setSessionId(undefined); setError(""); };`

Impact scenario: a user picks a 60 MB workbook; `begin` creates the session, `prepare` or the
signed PUT fails (malware scan, size limit, flaky network). The wizard shows an error, the user
closes the dialog and tries again — a *new* random session is created each time and the previous
staged session is orphaned until the server expires it. The user can never cancel or resume them
(they do show up in the transfers workspace, but only there).

Suggested fix: keep the session id in a ref/state as soon as `begin` resolves, and call
`client.request(cancelRecordImportOperation, { params: { sessionId } })` in the `catch` path and in
`reset()`/dialog close when the session has not reached `commit`; pass an AbortController signal to
the upload `fetch`.

### [medium] guidedImportHref drops most scope-coordinate fields

Location: packages/platform/entity/runtime/list-view/src/data-operations.tsx:115

What is wrong: the "Import from file" launch hand-builds the destination URL and copies only 4 of
the 11 fields of `EntityListScopeCoordinateV1` (`companyCodeId`, `legalEntityId`,
`operatingOrganizationId`, `networkAccountId`). `parentEntityCode`, `parentRecordId`,
`relationshipKey`, `companyCodeIds`, `operatingOrganizationIds`, `partnerRole` and
`eligibleOperation` are silently dropped — and the receiving page reads back only those same four
keys, so the scope cannot survive even if it were written.

Evidence: `function guidedImportHref(entityCode:string,scope?:EntityListScopeCoordinateV1){const query=new URLSearchParams({entity:entityCode});if(scope?.companyCodeId)query.set("companyCodeId",scope.companyCodeId);if(scope?.legalEntityId)query.set("legalEntityId",scope.legalEntityId);if(scope?.operatingOrganizationId)query.set("operatingOrganizationId",scope.operatingOrganizationId);if(scope?.networkAccountId)query.set("networkAccountId",scope.networkAccountId);return `/operations/data-transfers/new?${query.toString()}`;}`
Contract for comparison: `packages/platform/foundation/api-client/src/entity-list.ts:69` `entityListScopeQuery` handles all 11 fields, including the array forms and the parent-record triple.

Impact scenario: a user opens a related-records embedded list (`parentEntityCode` + `parentRecordId`
+ `relationshipKey`) or a multi-company list (`companyCodeIds` array) and launches the guided import.
The new page requests the descriptor with no parent/array scope, so the wizard describes and stages
an entity-wide import instead of the record-scoped one the user was looking at. Authorization is
still server-enforced, but the locked record scope the user launched from is lost.

Suggested fix: build the URL from `entityListScopeQuery(scopeCoordinate)` (arrays serialized the same
way the API expects) and parse it back on the receiving page with the same helper instead of a
hand-written four-key list.

### [medium] saveableViewState duplicates the contract helper and silently drops the search query

Location: packages/platform/entity/runtime/list-view/src/preferences.ts:17

What is wrong: the local `saveableViewState` re-implements the contract's `toSaveableListState`
(`packages/contracts/platform/entity-list/src/url-state.ts:85`) but omits `query`, even though
`SaveableListStateV1.query` exists (`packages/contracts/platform/entity-list/src/types.ts:103`) and
the contract decoder restores `base.query` from a saved view
(`packages/contracts/platform/entity-list/src/url-state.ts:37`). The contract helper has no callers
anywhere in the repo, so the divergent local copy is now the only serializer in use.

Evidence: `export function saveableViewState(state: ListLocationStateV1): SaveableListStateV1 { return Object.freeze({ ...(state.standardViewKey?{standardViewKey:state.standardViewKey}:{}), filters: state.filters, sort: state.sort, ...(state.group ? { group: state.group } : {}), columns: state.columns, density: state.density, mode: state.mode, ...(state.spreadsheet ? { spreadsheet: state.spreadsheet } : {}), }); }`
Contract equivalent: `...(state.query ? { query: state.query } : {}), filters: state.filters, ...`
The persisted view state is this function's output (`index.tsx:3606` server views, `index.tsx:3615` local views).

Impact scenario: a user searches "Acme", clicks Save view, and applies the view later (or another
user opens the shared view): the search term is gone, so the view matches a wider result set than
the one that was saved. Because the contract decoder is written to restore a saved query, the
feature looks supported but is unreachable.

Suggested fix: delete the local copy and re-export/use `toSaveableListState` from the contract (or at
minimum add the `...(state.query ? { query: state.query } : {})` line).

### [medium] Active-transfer polling never backs off, never stops on failure, and has no stale-response guard

Location: packages/platform/entity/runtime/list-view/src/transfer-workspace.tsx:17

What is wrong: the poll is a fixed 2 s `setTimeout` re-armed from `items` while any row is in an
active status. There is no backoff, no jitter, no attempt cap and no `document.hidden` check, so a
transfer that stays "running" (stuck job, backend outage) produces an endless 2 s request loop with
error toasts. Separately, `load()` keeps no request version and no AbortController: two overlapping
loads (manual Refresh plus the poll) can resolve out of order and let the older payload overwrite the
newer one, and a load that resolves after unmount still writes state.

Evidence: `const load=useCallback(async(silent=false)=>{if(!silent)setLoading(true);setError("");try{setItems(await client.request(recordTransfersOperation,{query:{limit:100}}));}catch(cause){setError(cause instanceof Error?cause.message:"Transfers could not be loaded.");}finally{if(!silent)setLoading(false);}},[client]);`
and `useEffect(()=>{if(!hasActive)return;const timer=window.setTimeout(()=>void load(true),2000);return()=>window.clearTimeout(timer);},[hasActive,items,load]);`

Impact scenario: one job is wedged in `running`; every open transfers tab polls the list endpoint
twice per second indefinitely (and keeps polling in background tabs), and while the endpoint is
degraded the poll keeps failing and resetting the error banner. If the user hits Refresh while a poll
is in flight and the poll's response lands last, the table flips back to the older snapshot.

Suggested fix: exponential backoff with jitter and a max attempt count (resume on the next user
action/visibility change), compare a monotonically increasing load version before `setItems`, abort
the in-flight request in the effect cleanup, and stop polling when `document.hidden`.

### [low] Long-URL session state accumulates in sessionStorage with no eviction

Location: packages/platform/entity/runtime/list-view/src/location.ts:31

What is wrong: `writeListLocation` stores oversized states under a fresh random token and only
removes the *current* URL's token in the `"replace"` branch. Pushes have to keep their token (Back
must still resolve), but nothing ever evicts tokens for history entries that are gone: there is no
cap, no TTL and no sweep, so every long-state navigation adds a permanent entry to the tab's
sessionStorage.

Evidence: `if (history === "replace") { removeCurrentSessionState(); window.history.replaceState(window.history.state, "", href); } else window.history.pushState(window.history.state, "", href);`
and `function removeCurrentSessionState(): void { try { const token = new URLSearchParams(window.location.search).get(SESSION_PARAMETER); if (token && SESSION_TOKEN.test(token)) window.sessionStorage.removeItem(sessionKey(token)); } catch { /* ... */ } }`
Store side: `window.sessionStorage.setItem(sessionKey(token), JSON.stringify({ descriptorHash: descriptor.revision.descriptorHash, state: parseListLocationState(state, descriptor) }));`

Impact scenario: a user who repeatedly filters, sorts and re-pages a wide list (URLs over 8 KB) ends
up with hundreds of frozen state blobs in sessionStorage for the life of the tab; the quota can be
exhausted, after which `storeSessionState` fails and the over-long URL is written to history instead
(the silent fallback at line 27-30).

Suggested fix: cap the number of stored tokens (e.g. keep the most recent N, oldest-first eviction)
or stamp each entry and sweep expired ones on write; alternatively use `history.state` for the
oversized payload where the app controls the history entries.

### [low] One shared search string drives both directory filters

Location: packages/platform/entity/runtime/list-view/src/directory-filters.tsx:48

What is wrong: a single `query` state is used both to filter the organization list locally and as the
`query`/`onQueryChange` props of `CompanyGroups`. When both kinds are rendered, typing in either
search box filters both lists, and two `data-context-picker-autofocus` search inputs exist with
identical content (the company one inside `CompanyGroups` → `ScopePickerToolbar`).

Evidence: `const [query, setQuery] = useState("");` with `query={query}` / `onQueryChange={setQuery}` in the organization block (lines 66-67) and `query={query}` / `onQueryChange={setQuery}` on `CompanyGroups` (lines 118-119).

Impact scenario: the user types "North" into "Search company name or code" and the organization list
above it collapses to nothing (or vice versa), which reads as data loss; with two autofocus search
boxes the browser focus target is also non-deterministic.

Suggested fix: keep one query state per section (two `useState`s), and only give the section that is
actually rendered the autofocus.

### [low] Scope popover loses its open-announcement listener when the branch changes after mount

Location: packages/platform/entity/runtime/list-view/src/scope-control.tsx:57

What is wrong: the effect has an empty dependency array and captures `const detailsElement = summary.current`
at mount, but the `<details ref={summary}>` element only exists in the single-option branch. The
other listeners read `summary.current` lazily and are fine; the `toggle` listener is not. If the
component first renders the `<select>` branch (options still loading / more than one option) and
later switches to the single-option `<details>` branch, no `toggle` listener is ever attached, so
`announceOverlayOpened` never fires. The reverse transition leaves listeners attached to a detached
node.

Evidence: `const detailsElement = summary.current;` (line 32) … `detailsElement?.addEventListener("toggle", announceWhenOpened);` (line 57) … `}, []);` (line 66)

Impact scenario: after a scope refresh that narrows the user to exactly one authorized context, the
summary popover opens silently — screen-reader users get no announcement that the context panel
appeared, which is the only place the "Authorized context" details now live.

Suggested fix: attach the `toggle` listener inside a layout effect that depends on whether the
single-option branch is rendered (e.g. `[singleOption]`), or read `summary.current` inside
`announceWhenOpened` and register the listener on `document` with an event-target check.

### [low] Export field-mode radios do not form a radio group

Location: packages/platform/entity/runtime/list-view/src/data-operations.tsx:67

What is wrong: the three "2. Fields" radios are rendered without a `name` attribute (and without
`value`), so each is its own one-option radio group. The record-scope radios directly above them
correctly share `name="export-scope"`. Keyboard arrow-key navigation between the three options is
therefore unavailable and assistive technology announces three separate single-option groups instead
of one "Fields" group; the `<fieldset><legend>` wrapper is not enough to fix this.

Evidence: `<Label className="a-entity-list__radio"><input type="radio" checked={fieldMode === "visible"} onChange={() => setFieldMode("visible")}/>…</Label><Label className="a-entity-list__radio"><input type="radio" checked={fieldMode === "all"} …/><Label className="a-entity-list__radio"><input type="radio" checked={fieldMode === "custom"} …/>`

Impact scenario: a keyboard/screen-reader user must Tab into each radio individually and cannot use
Up/Down to move between field modes; some screen readers announce each as "radio button, 1 of 1".

Suggested fix: add `name="export-field-mode"` (and distinct `value`s) to the three inputs.

### [low] Navigation reads window.location during render

Location: packages/platform/entity/runtime/list-view/src/navigation.tsx:38

What is wrong: when the caller does not pass `activePath`, `EntityNavigation` derives the current
item from `window.location.pathname` *during render* (guarded only by `typeof window ===
"undefined"`). Client components are still pre-rendered on the server, so the server markup computes
`pathname === ""` and `currentKey === undefined`, while the client's first render computes a real
key and marks a different navigation item current.

Evidence: `const pathname = activePath ?? (typeof window === "undefined" ? "" : window.location.pathname.replace(/\/$/, ""));`

Impact scenario: every entity page that renders `<EntityNavigation sections={...} />` without
`activePath` (e.g. `index.tsx`) produces a hydration mismatch on the nav band: React discards and
re-renders the subtree, and in dev it logs a hydration error on each load.

Suggested fix: resolve the current item in an effect/`useSyncExternalStore`, or require `activePath`
from the router (Next's `usePathname`) at the call sites.

### [low] Sticky-table effect tears down and rebuilds on every render

Location: packages/platform/entity/runtime/list-view/src/sticky-table.tsx:7

What is wrong: the effect depends on `children`, which is a freshly created element object on every
parent render. React therefore runs the cleanup (disconnect ResizeObserver, remove the capture-phase
scroll/resize listeners, clear `--entity-heading-offset`) and re-attaches everything on every render
of the list — including each keystroke in the search box and each selection toggle. `translation` is
also re-created (reset to 0) on each attach.

Evidence: `useEffect(() => sticky && ref.current ? attachStickyTableHeader(ref.current) : undefined, [children, sticky]);`

Impact scenario: with a large table and a 4-observer ResizeObserver plus two window listeners, every
render pays a detach/attach cycle and a forced `getBoundingClientRect` layout pass; under fast typing
the header offset can also visibly re-settle because the previous value is discarded before the
recompute.

Suggested fix: depend on the wrapper element and a genuine content signal (e.g. a row count/identity
key or a `MutationObserver` inside `attachStickyTableHeader`) instead of the `children` element.

### [low] Dead export: ListScopeControl and its public types are unused

Location: packages/platform/entity/runtime/list-view/src/scope-control.tsx:28

What is wrong: the entire 104-line component is exported from the package entry
(`index.tsx` re-exports `ListScopeControl`, `ListScopeControlProps`, `ListScopeOption`) but nothing
in the repo imports it. The plane that would need it ships its own control:
`packages/planes/neon/list-view/src/index.tsx:99` supplies `renderScopeControl={(input) =>
input.scope.workContext ? <NeonRequiredContext {...input} /> : null}`, and `NeonRequiredContext`
renders `WorkspaceContextControl` (line 195), which duplicates this component's role.

Evidence: `export function ListScopeControl(props: ListScopeControlProps) {`
Grep check: `grep -rn "ListScopeControl" apps packages server --include=*.ts --include=*.tsx` returns
only `scope-control.tsx` (definition + types) and `index.tsx:5657-5660` (the re-export).

Impact scenario: dead framework surface — any entity onboarding that reaches for
`ListScopeControl` from the package entry gets an unmaintained second scope selector instead of the
plane's `WorkspaceContextControl`, and the file keeps drifting (its `toggle` listener bug above is
unreachable in production).

Suggested fix: delete `scope-control.tsx` and its re-export, or wire it into the plane adapters and
delete the duplicate; verify with the grep above that nothing imports it first.

### [low] Dead exports: module-local symbols no importer reaches

Location: packages/platform/entity/runtime/list-view/src/overview.tsx:429 (also `overview-favourites.tsx:16,22,33,179`, `directory-filters.tsx:158`, `sticky-table-header.ts:4`)

What is wrong: `overviewCount` and `overviewListState` are exported from `overview.tsx` but used only
inside that file, and `index.tsx` re-exports only `EntityOverview`/`EntityOverviewProps` from it;
`EntityFavourites`, `EntityFavouritesRuntime`, `FavouriteRecord` and `EntityFavouritesProps` are in
the same position in `overview-favourites.tsx`; `scopeFilterReady` is exported from
`directory-filters.tsx` and used only within that module; `attachStickyTableHeader` is exported from
`sticky-table-header.ts` and used only by `sticky-table.tsx`. None of these modules is an exported
subpath of the package (`package.json` exposes only `.`, `./lookup-directory`, `./browser-storage`).

Evidence: `export function overviewCount(` / `export function overviewListState(` /
`export function EntityFavourites({` / `export function EntityFavouritesRuntime({` /
`export function scopeFilterReady(` / `export function attachStickyTableHeader(wrapper: HTMLElement): () => void {`

Impact scenario: exported-but-unreachable surface area invites external use of internals (the
package's `main` is `src/index.tsx`, so these are not importable today) and hides genuine dead code
during refactors.

Suggested fix: drop the `export` keyword on symbols that are only used in their own module, or
re-export the ones that are intended as public API.

### [low] Hand-rolled duplicate of entityListScopeQuery

Location: packages/platform/entity/runtime/list-view/src/import-workspace.tsx:21 (and data-operations.tsx:115)

What is wrong: `RecordImportWorkspace` rebuilds the scope query object field by field instead of
calling `entityListScopeQuery`, which is what the list runtime and the overview use. The copy already
covers only 4 of the 11 coordinate fields, so it is a divergent duplicate that will silently fall
behind whenever the coordinate type grows (it already did: the array/parent fields are missing — see
the guidedImportHref finding).

Evidence: `const query = useMemo(() => ({ ...(scopeCoordinate?.companyCodeId ? { companyCodeId: scopeCoordinate.companyCodeId } : {}), ...(scopeCoordinate?.legalEntityId ? { legalEntityId: scopeCoordinate.legalEntityId } : {}), ...(scopeCoordinate?.operatingOrganizationId ? { operatingOrganizationId: scopeCoordinate.operatingOrganizationId } : {}), ...(scopeCoordinate?.networkAccountId ? { networkAccountId: scopeCoordinate.networkAccountId } : {}), }), [scopeCoordinate]);`
Original: `export function entityListScopeQuery(scope?: EntityListScopeCoordinateV1)` at
`packages/platform/foundation/api-client/src/entity-list.ts:69`.

Impact scenario: adding a new scope coordinate (e.g. a new parent field) updates the list requests
but not the guided-import descriptor request, and the two silently disagree about what scope the
import runs against.

Suggested fix: `query: entityListScopeQuery(scopeCoordinate)` (memoized on the coordinate), and use
the same helper in `guidedImportHref`.

### [low] Inconsistent saved-view cap between the normal and fallback paths

Location: packages/platform/entity/runtime/list-view/src/preferences.ts:60

What is wrong: the normal path caps the merged catalogue+local list at 100 views; the
corrupt/foreign-storage fallback returns the whole compatible catalogue with no cap, so the same
descriptor yields a different list depending on whether the storage key happened to be corrupt.

Evidence: normal path `return Object.freeze([...(descriptor.viewCatalog?.views.filter(view=>view.compatible)??[]),...views.filter(view=>!descriptor.viewCatalog?.views.some(item=>item.id===view.id))].slice(0,100));`
fallback `return descriptor.viewCatalog?.views.filter(view=>view.compatible)??[];`

Impact scenario: with a large server view catalogue, a user whose localStorage held invalid JSON
suddenly sees more views than the capped list everyone else sees (and the views drawer renders all
of them).

Suggested fix: apply the same `.slice(0, 100)` in the fallback branch.

## Checked and clean

- packages/platform/entity/runtime/list-view/src/location.ts:8 - round-trip of the oversized-state token: `readSessionState` requires a matching `descriptorHash` and re-parses through `parseListLocationState`, so a malformed/foreign blob throws and falls back to URL decoding; verified the encoder/decoder pair in `url-state.ts` is symmetric for `q`/`filters`/`sort`/`group`/`columns`/`density`/`view`/`pageSize`.
- packages/platform/entity/runtime/list-view/src/preferences.ts:42 - `readSavedViews` validates every persisted view (id/name types, `parseSaveableListState`) and deletes unparseable storage instead of trusting it; `readStorageJson` (browser-storage.ts:9) drops junk.
- packages/platform/entity/runtime/list-view/src/preferences.ts:71 - `readDisplayPreferences` validates `density` against the allowed set; the unvalidated `mode` is re-checked at every use site against `surface.supportedModes` (`index.tsx:807`, `index.tsx:849`), so a tampered value cannot reach the API.
- packages/platform/entity/runtime/list-view/src/preferences.ts:36 - `inheritSavedViews` is idempotent by design (skips when the destination key exists) and never deletes source data; `readStorageItem` returns null when storage is unavailable.
- packages/platform/entity/runtime/list-view/src/lookup-directory.ts:61 - the descriptor cache is invalidated on abort, on request failure and on a `descriptorHash`/`scopeFingerprint` mismatch, and `viewsLoaded` is only set false when a cache exists (no cross-caller shared module state).
- packages/platform/entity/runtime/list-view/src/lookup-directory.ts:107 - the page-size clamp is safe: `limits.allowedPageSizes` is guaranteed non-empty and to contain `defaultPageSize` (`contracts/.../parsers.ts:158-173`), and `Math.max(...allowed.filter(size => size <= requestedSize), Math.min(...allowed))` picks the largest allowed size ≤ requested.
- packages/platform/entity/runtime/list-view/src/lookup-directory.ts:148 - the search-behaviour namespace matches its writer: `entity.<code>.<fingerprint>.<namespace>` with `namespace = field.key` on both sides (`entity-lookup.tsx:194` and `:475` pass `field.key`/`preferenceNamespace: field.key`; `index.tsx:1625` writes the same shape).
- packages/platform/entity/runtime/list-view/src/view-policy.ts:9 - an empty `allowedViewKeys` array cannot silently mean "unrestricted": the runtime contract rejects empty arrays (`lookup-options.ts:122-124`), so `!allowedViewKeys` only covers genuinely absent restrictions.
- packages/platform/entity/runtime/list-view/src/data-operations.tsx:22 - `useState` is declared before the `if (!policy || !hasVisibleOperation(policy)) return null;` early exit, so there is no conditional-hook violation.
- packages/platform/entity/runtime/list-view/src/data-operations.tsx:111 - `safeFileName` strips path separators, control characters and Windows-reserved characters before the name is used for the download; `csvCell` (:119) prefixes `= + - @` values with an apostrophe, so exported cells cannot be interpreted as formulas.
- packages/platform/entity/runtime/list-view/src/transfer-workspace.tsx:40 - the `transfer` query parameter is only used as a search-box value (React-escaped) and every localStorage entry is type-checked before use, so neither can inject markup; write failures are swallowed rather than crashing.
- packages/platform/entity/runtime/list-view/src/overview-favourites.tsx:210 - the bookmarks load effect aborts on cleanup and guards `setItems` with both `controller.signal.aborted` and a monotonic `loadVersion`, so a stale list cannot overwrite a fresh one; the `athyper:record-bookmarks-changed` listener ignores its own mutation via `mutation.current`, which is still true during the synchronous dispatch.
- packages/platform/entity/runtime/list-view/src/overview.tsx:586 - `data = loadedKey === authorityKey ? snapshot : undefined` plus the `AbortController` in the load effect prevents a previous entity/scope response from being rendered after an authority change; each view request re-checks `descriptorHash`/`scopeFingerprint` before its result is accepted.
- packages/platform/entity/runtime/list-view/src/sticky-table-header.ts:38 - the ResizeObserver, the capture-phase scroll listener and the resize listener are all disconnected/removed, the pending rAF is cancelled and the CSS variable is cleared on cleanup.
- packages/platform/entity/runtime/list-view/src/columns.ts:29 - `reorderColumn` returns the original array when source/target are absent (no in-place mutation) and `groupAvailableColumns` builds a fresh Map/arrays per call, so there is no module-level shared object being mutated.
- packages/platform/entity/runtime/list-view/src/import-workspace.tsx:28 - the descriptor load resets descriptor/error before each request and uses both an `active` flag and an `AbortController` (aborted in cleanup), and the entity code is validated against `/^[a-z][a-z0-9_.-]{0,126}$/` before any request.
- packages/platform/entity/runtime/list-view/src/directory-filters.tsx:190 - `reconcileDirectorySelection` is pass-bounded by `filters.length` with a `changed` break, and it only clears dependent keys, so it terminates and cannot drop unrelated selections.
- packages/platform/entity/runtime/list-view/src/state.ts:22 - `filterInputValue` always returns a string (`collection-controls/src/filter-state.ts:45-69`), so the `relative` branch's `raw.replaceAll("_", " ")` cannot throw, and the operator label map covers every `ListFilterOperator`.
- packages/platform/entity/runtime/list-view/src/field-catalogue.tsx:87 - option focus re-queries the container ref on every call (no stale index/closure), and `useId` is used for both the search input's label and the `aria-labelledby` target, which are rendered in the same tree (no dangling id).
- packages/platform/entity/runtime/list-view/src/entity-location.ts:2 - the in-place entity switch discards inherited search only when the pathname is unchanged and the entity actually changed, so deep links are preserved.
- packages/platform/entity/runtime/list-view/src/bookmark-state.ts:2 - verified against its single caller (`index.tsx:1304`): it restores each id to its pre-mutation membership on a copy of the current set, so concurrent unrelated bookmark results are preserved.
- packages/platform/entity/runtime/list-view/src/retry-policy.ts:2 - verified used at `index.tsx:649`; it only classifies which errors force a descriptor reload and does not itself perform retries, so there is no unbounded/non-idempotent retry loop here.
- packages/platform/entity/runtime/list-view/src/drawer-registry.tsx:27 - `LIST_DRAWERS` is a frozen-in-practice `as const` array that is only read; the host maps to new option objects per render and never mutates the registry.
- packages/platform/entity/runtime/list-view/src/required-context-status.tsx:17 - no unreachable ids; the separate `role="alert"` child is rendered only when the caller says context selection is unavailable (see Notes for the nested live-region nuance).

## Notes

- Live edits during the review: `preferences.ts` (93 → 101 lines, new `inheritSavedViews`) and
  `browser-storage.ts` (12 → 15 lines, new `readStorageItem`) were rewritten at 23:28:36 while this
  sweep was running; `index.tsx` and a new `list-notice.ts` were being edited in the same window.
  Both assigned files were re-read in full afterwards and all quotes re-grepped at 23:31. A
  subsequent edit could still invalidate a cited line.
- `index.tsx` is owned by another reviewer; I only read it for cross-file context (call sites,
  namespace shapes) and never cite it as the location of a finding.
- `required-context-status.tsx:17` nests `role="alert"` inside `role="status"`, so a screen reader can
  announce the same "Context selection is unavailable" text twice (once assertively, once politely).
  Left out of the findings because it is a duplicate-announcement nuance rather than a broken
  feature.
- Pre-existing repo-wide pattern: `crypto.randomUUID()` is called unguarded in
  `overview-favourites.tsx:276`, `data-operations.tsx:56`, `data-operations.tsx:88` and
  `index.tsx:3613`, while `location.ts:55` guards it with `globalThis.crypto?.randomUUID?.()`. On a
  non-secure origin the unguarded calls throw; not reported as a per-file defect because the apps
  are served over https/localhost.
- `lookup-directory.ts` never sends a scope coordinate with its descriptor request
  (`client.request(entityListDescriptorOperation, { params: { entityCode }, signal })`), unlike the
  list runtime which sends `entityListScopeQuery(scopeCoordinate)`. Its only callers
  (`entity-lookup.tsx`) do not pass one either, so I could not determine from the client whether the
  lookup surface is intentionally session-scoped; flagged here rather than as a finding.
- The import upload PUT sends `content-type: file.type || importContentType(format)`
  (`data-operations.tsx:88`). If the server-side pre-signed URL signature pins its own content type
  (the prepare response only returns `{sessionId, uploadUrl, expiresInSeconds}`), a browser-reported
  type such as `application/vnd.ms-excel` for a `.csv` would fail the signature. Not verifiable from
  this checkout, so not reported.


# Group G6

# Sweep G6

Group G6 — shell core (client / core / home / index / messages / shell-i18n).
Read-only review of the six assigned files at their current working-tree state.
Single Country request path files were not deep-reviewed (owned by another reviewer).

## Coverage

| path | lines | verdict |
| --- | --- | --- |
| packages/platform/shell/shell/src/client.tsx | 1495 | findings 10 |
| packages/platform/shell/shell/src/core.ts | 340 | findings 1 |
| packages/platform/shell/shell/src/home.tsx | 1809 | findings 6 |
| packages/platform/shell/shell/src/index.tsx | 48 | findings 1 |
| packages/platform/shell/shell/src/messages.ts | 31 | findings 1 |
| packages/platform/shell/shell/src/shell-i18n.ts | 18 | clean |

## Findings

### [high] Malformed percent-escape in the pathname throws during shell breadcrumb render

Location: packages/platform/shell/shell/src/core.ts:334

What is wrong: `humanizePathSegment` calls `decodeURIComponent(value)` on every path segment after the matched route, with no guard. `decodeURIComponent` throws `URIError: URI malformed` for a stray `%` or a truncated multi-byte escape. The value is the raw URL pathname, which browsers and `usePathname()`/`window.location.pathname` pass through unmodified.

Evidence: `  const decoded = decodeURIComponent(value).replace(/[-_]+/g, " ");`
and the unguarded call site `    .map(humanizePathSegment);` (core.ts:318).

Impact scenario: `deriveBreadcrumbs` runs inside `ShellChrome`'s render (`client.tsx:330` -> `deriveEntityBreadcrumbs` -> `route-state.tsx:29` -> `deriveBreadcrumbs`), so a URL such as `/app/country/%E0%A4%A` or `/mdg/partners/100%` matches a registered route by prefix, splits the remainder, and throws during render. The shell is rendered from the segment layout (`apps/neon/app/(shell)/layout.tsx`), so `app/(shell)/error.tsx` (a page-level boundary) does not catch it — the whole shell chrome is replaced by the ancestor error surface until the user navigates away. Verified with node: `decodeURIComponent("%E0%A4%A")` -> `URIError: URI malformed`, and `new URL("https://x/app/country/%E0%A4%A").pathname` keeps `%E0%A4%A` intact.

Suggested fix: wrap the decode in a try/catch and fall back to the raw segment, e.g. `let decoded = value; try { decoded = decodeURIComponent(value); } catch { /* keep raw */ } decoded = decoded.replace(/[-_]+/g, " ");`.

### [medium] Context switch reads the wrong CSRF cookie namespace

Location: packages/platform/shell/shell/src/client.tsx:1203

What is wrong: `switchShellContext` prefers `__Host-athyper-csrf` and falls back to `athyper-csrf` regardless of the active session namespace. The repo's canonical helper deliberately selects the namespace from `NODE_ENV` and never falls back (`packages/platform/shell/app-foundation/src/browser-csrf.ts:5-11`: "Match the auth runtime's session-cookie namespace; never use another mode's token"), and the browser contract test for that helper breaks if a stale production cookie wins (`tests/contracts/browser-csrf.test.ts:16`).

Evidence: `  const csrf = readCookie("__Host-athyper-csrf") ?? readCookie("athyper-csrf");`

Impact scenario: in a development/QA browser where a stale `__Host-athyper-csrf` cookie coexists with the active `athyper-csrf` cookie (the exact condition set up in `tests/foundation-browser/comment-actions.spec.ts:199-201`, which asserts the development token must be used), the context switch POST sends the stale token, the server answers 403, and the switcher then permanently disables itself (next finding). `readBrowserCsrfToken()` is already exported from `@athyper/platform-shell-app-foundation`, which `@athyper/platform-shell` already depends on.

Suggested fix: replace the local cookie read with `readBrowserCsrfToken()` (or replicate the namespace switch) and delete the local `readCookie` copy.

### [medium] A failed context switch permanently disables the organization switcher

Location: packages/platform/shell/shell/src/client.tsx:846

What is wrong: a failed `switchShellContext` sets `status` to `"error"`, and `status === "error"` is a hard gate on the picker's interactivity. Discovery is also latched off by `discoveryStarted`, so nothing can move the state back to `"ready"` except a full page reload.

Evidence: `      setPending(undefined);` / `      setStatus("error");` and `          interactive={status === "ready" && contexts.length > 1}` (client.tsx:858).

Impact scenario: a transient 403/500/network failure on one switch attempt turns the business-context control into the static `<span>` variant (`client.tsx:1030-1039`); the user cannot retry, cannot open the picker, and loses the "Open context selector" fallback link that lives inside the panel. Recovery requires a manual reload.

Suggested fix: keep the control interactive when `contexts.length > 1` even if the last attempt failed (discover error can stay non-interactive), or degrade to `status = "ready"` with an inline error while leaving the panel reachable.

### [medium] Choosing a context option closes the picker without restoring focus

Location: packages/platform/shell/shell/src/client.tsx:1055

What is wrong: clicking/activating `[data-context-picker-select]` closes the coordination surface (or the native `details`) but never moves focus back to the `<summary>`. Only the Escape path, the `selectionRevision` path and the boundary `onClose` restore focus.

Evidence: `        } else if (target.closest("[data-context-picker-select]")) {` / `          if (coordination) coordination.setContext(contextId, false);` / `          else event.currentTarget.open = false;`

Impact scenario: the focused element is inside the `<details>` content, which becomes `display: none` when the panel closes; the browser drops focus to `<body>`. A keyboard user who selects an account (e.g. Mesh, `packages/planes/mesh/shell/src/index.tsx:46` selects in place without a reload) loses their position and the next Tab starts from the top of the document.

Suggested fix: in the select branch, after closing, `requestAnimationFrame(() => details.current?.querySelector("summary")?.focus())`.

### [medium] The home surface is not localized at all

Location: packages/platform/shell/shell/src/home.tsx:124

What is wrong: `home.tsx` (1809 lines: greeting, hero, composer, search results, widgets, action previews) contains zero i18n usage — `grep -c useShellI18n packages/platform/shell/shell/src/home.tsx` returns `0` — while the shell ships a full Arabic catalog (`messages.ts:18-29`), `shellMessages()` locale selection and RTL support, and all three plane shells expose a working language switcher that reloads into `ar`.

Evidence: `    ? "Good morning"` / `      ? "Good afternoon"` / `      : "Good evening";` (home.tsx:124-127); also hardcoded `"What can we achieve together?"` (home.tsx:333), `"Your Dashboard"` (478), `"Recommended for your access"` (479), `"Ask Atlas"` (979), `"Send message"` (1139).

Impact scenario: an Arabic principal lands on `/home` and sees an English-only page (mixed with the correctly translated chrome), so the primary surface of the product is unusable for the locale the plane advertises.

Suggested fix: route these strings through `useShellI18n().message` and add `shell.home.*` keys to both catalogs (the whole surface is already inside `IntlProvider`).

### [low] `switchShellContext` returnTo guard allows a protocol-relative redirect via backslash

Location: packages/platform/shell/shell/src/client.tsx:1215

What is wrong: the redirect guard only rejects a leading `//`. WHATWG URL parsing treats `\` as `/` for special schemes, so `/\evil.com` resolves to another origin. The repo already has a hardened sanitizer (`packages/platform/iam/session/src/index.ts:29-40`) that rejects backslashes, control characters and reserved routes.

Evidence: `    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/",`

Impact scenario: `window.location.assign("/\\evil.com")` navigates to `https://evil.com/` (verified with node: `new URL("/\\evil.com","https://app.test/").href === "https://evil.com/"`). Currently `returnTo` is only fed from the `homeHref` prop (default `"/home"`), so an attacker would need to control that prop; the guard nevertheless fails at its stated job in an exported function.

Suggested fix: reuse `sanitizeReturnTo` (add the dependency or lift it into `@athyper/platform-shell-app-foundation`) instead of the inline string check.

### [low] `HeaderContextIdentity` never retries the logo after a failure when the asset changes

Location: packages/platform/shell/shell/src/client.tsx:1136

What is wrong: `logoFailed` is sticky state that is not reset when `logoAssetRef` changes, and the `<img>` key does not change either. Once one asset fails, every later asset is rendered as the generic building mark.

Evidence: `  const [logoFailed, setLogoFailed] = useState(false),` / `      logoAssetRef && !logoFailed && safeAssetRef(logoAssetRef)` / `        ? logoAssetRef` / `        : undefined,`

Impact scenario: in Mesh the account selector swaps `logoAssetRef` in place (`packages/planes/mesh/shell/src/index.tsx:47-49`); a 404 for account A permanently hides a valid logo for account B until a remount/reload.

Suggested fix: reset the flag when the ref changes (`useEffect(() => setLogoFailed(false), [logoAssetRef])`) or key the `<img>` on `safeLogo`.

### [low] Language select stays disabled after a successful locale change

Location: packages/platform/shell/shell/src/client.tsx:1354

What is wrong: `setLocalePending(true)` is cleared only in the rejection handler; the success path never resets it, so `disabled={localePending}` and "Updating language…" persist.

Evidence: `                setLocalePending(true);` / `                setLocaleError(false);` / `                void onLocaleChange(locale).catch(() => {` / `                  setLocalePending(false);`

Impact scenario: the three current plane shells call `window.location.reload()` after a successful update, which masks the bug, but any consumer that resolves `onLocaleChange` without reloading leaves the control permanently disabled and stuck on the saving message.

Suggested fix: `void onLocaleChange(locale).then(() => setLocalePending(false), () => { setLocalePending(false); setLocaleError(true); });`.

### [low] Escape closes the profile panel and the navigation drawer in one keypress

Location: packages/platform/shell/shell/src/client.tsx:283

What is wrong: the drawer-level `keydown` handler closes the drawer on any non-defaultPrevented Escape, and `SidebarProfile`'s own handler (client.tsx:1271-1280) also closes the profile `<details>` without preventing default or stopping propagation. Both window listeners fire for one press, and neither implements surface layering.

Evidence: `    const close = (event: KeyboardEvent) => {` / `      if (event.key === "Escape" && !event.defaultPrevented) {` / `        setDrawerOpen(false);` / `        requestAnimationFrame(() => menuButton.current?.focus());`

Impact scenario: with the drawer open on a narrow viewport, Escape intended to dismiss only the profile menu also navigates the user out of the drawer and moves focus to the menu button.

Suggested fix: only handle Escape while no descendant popup is open (e.g. check `event.defaultPrevented` after the profile handler runs first and calls `preventDefault()`), or make the profile handler `stopPropagation`/`preventDefault` and skip the drawer close when the event originated inside an open profile panel.

### [low] Inline context values in `ShellChrome` are recreated on every render

Location: packages/platform/shell/shell/src/client.tsx:378

What is wrong: three providers are given fresh object literals (and, for Atlas, fresh closures) on every `ShellChrome` render, so every consumer of these contexts re-renders whenever any shell state changes (navigation peek on hover, atlas resize, drawer open, ...). Their callbacks are already stable (`claimSidePanel`/`releaseSidePanel` via `useCallback`, `closeAtlas` via `useCallback`), so only the wrappers defeat memoization.

Evidence: `    <WorkspaceSidePanelContext.Provider` / `      value={{` / `        owner: atlasOpen ? "atlas" : sidePanel?.id,` / `        claim: claimSidePanel,` / `        release: releaseSidePanel,` (and `      <ShellSurfaceContext.Provider value={{ surface, setContext }}>` at line 385, `        <AtlasSurfaceContext.Provider` at line 386).

Impact scenario: `ActivityCenterShell` (`activity-center.tsx:139`), `collaboration-surface.tsx:76` and `atlas-workspace.tsx:72` all re-render on unrelated shell state changes; the effects that depend on `slot?.claim`/`slot?.owner` are safe because those primitives are stable, so this is a re-render cost rather than a loop.

Suggested fix: `useMemo` the three provider values (and memoize `fullscreen`/`minimize` with `useCallback`).

### [low] `ShellHomeIdentityProvider` recreates its context value each render

Location: packages/platform/shell/shell/src/home.tsx:109

What is wrong: the provider passes a new `{ displayName, timeZone }` object literal, so every render of the provider invalidates `ShellHomeIdentityContext` for `PlatformHome`, which reads it via `React.useContext` (home.tsx:155).

Evidence: `    <ShellHomeIdentityContext.Provider value={{ displayName, timeZone }}>`

Impact scenario: the shell identity provider sits in `index.tsx:24` above the whole chrome; any identity provider re-render re-renders the home surface (and its `useMemo` recomputations that depend on nothing identity-related are unaffected, so this is cost-only).

Suggested fix: `const value = React.useMemo(() => ({ displayName, timeZone }), [displayName, timeZone]);`.

### [low] `composerDrafts` module cache is never evicted

Location: packages/platform/shell/shell/src/home.tsx:544

What is wrong: the module-level `Map` is only ever read/created; `clearAtlasDraft` calls `composerDraft(key)`, which *creates* a new entry for the key when missing, and no code path calls `composerDrafts.delete(...)`.

Evidence: `const composerDrafts = new Map<` and `function composerDraft(key: string) {` / `  let draft = composerDrafts.get(key);` / `  if (!draft) {` / `    draft = { attachments: [] };` / `    composerDrafts.set(key, draft);`

Impact scenario: the key is `${scope.storageKey}:atlas-draft:v2:${atlas.threadId ?? "new"}`, so a long-lived session that starts many Atlas threads (each successful send calls `clearAtlasDraft`) accumulates one never-freed entry per thread; the map, and any attachments held by unfinished drafts, grows for the lifetime of the tab.

Suggested fix: delete the entry in `clearAtlasDraft` after resetting it (or cap the map with an LRU eviction).

### [low] Partial-rejection message is overwritten by the generic file-count message

Location: packages/platform/shell/shell/src/home.tsx:863

What is wrong: `addFiles` first reports which selection was partially rejected, then, after the uploads settle, overwrites that message whenever more files were picked than slots were left.

Evidence: `        accepted.length < candidates.length` / `          ? "Some files couldn’t be added. Check their type and size."` (home.tsx:809-810) followed by `      if (selected.length > remaining)` / `        setFormatMessage("You can add up to 5 files.");`

Impact scenario: selecting 7 files (5 slots left, some unsupported) tells the user only "You can add up to 5 files.", hiding that files were also rejected for type/size — the user cannot tell which input to fix.

Suggested fix: combine both reasons into one message, or only set the count message when no partial-rejection message was set.

### [low] Fourth copy of `readCookie`, with divergent decoding

Location: packages/platform/shell/shell/src/client.tsx:1218

What is wrong: this file re-implements cookie reading while `quick-access.tsx:221` (same package), `app-foundation/src/browser-csrf.ts:5` and `communications/collaboration-ui/src/attachment-client.ts:217` each have their own. Only the three peers `decodeURIComponent` the value and guard with try/catch; this copy returns the raw value and uses `startsWith`+`slice` instead of prefix matching.

Evidence: `function readCookie(name: string): string | undefined {` / `  return document.cookie` / `    .split(";")` / `    .map((part) => part.trim())` / `    .find((part) => part.startsWith(\`${name}=\`))` / `    ?.slice(name.length + 1);`

Impact scenario: beyond the namespace bug above, any future percent-encoded cookie value silently produces a mismatched token here only, so the two in-package behaviours can diverge without a type error.

Suggested fix: use the exported `readBrowserCsrfToken()` and delete `readCookie`, or move one hardened helper into `@athyper/platform-shell-app-foundation`.

### [low] Dead catalog entries `shell.profile.languageEnglish` / `shell.profile.languageArabic`

Location: packages/platform/shell/shell/src/messages.ts:14

What is wrong: both keys are defined in the English and Arabic catalogs but referenced nowhere; the language `<option>` labels actually come from `localeDefinition(locale).nativeName/englishName` (client.tsx:1364-1372). A repo-wide search (`grep -rn -F` over `apps packages server tests` for each of the 72 defined `panel.*`/`shell.*` keys) found no other unused keys.

Evidence: `"shell.profile.languageEnglish":"English", "shell.profile.languageArabic":"Arabic"` (and the Arabic twins on line 27).

Impact scenario: dead translations keep drifting (they will never be caught by the missing-key diagnostics) and mislead translators into maintaining strings that cannot render.

Suggested fix: delete both keys from both catalogs.

### [low] `ShellLocalePolicy.defaultLocale` is required but never read

Location: packages/platform/shell/shell/src/index.tsx:21

What is wrong: the public prop contract requires consumers to supply `defaultLocale`, but `ShellChromeProps` (client.tsx:110-112) only declares `enabledLocales`, and nothing in the shell reads `.defaultLocale` (grep over `packages/platform/shell` returns only the interface). The apps pass the whole `bootstrap.localePolicy`, so extra fields are silently accepted and dropped.

Evidence: `export interface ShellLocalePolicy {readonly enabledLocales:readonly SupportedLocale[];readonly defaultLocale:SupportedLocale;}`

Impact scenario: a consumer can believe the shell honors a plane's default locale (e.g. defaulting an unset principal to `ar`) while the shell always renders `currentLocale` (default `"en"`), producing a silently wrong locale choice.

Suggested fix: either consume `defaultLocale` when `currentLocale` is absent or drop it from the required prop shape.

### [low] `aria-controls` points at an element that is not rendered while collapsed

Location: packages/platform/shell/shell/src/home.tsx:484

What is wrong: the disclosure button claims to control `#home-personalization`, but the panel (the only element with that id) is conditionally rendered, so the reference dangles whenever the panel is collapsed.

Evidence: `          aria-controls="home-personalization"` with `      {personalizing ? (` / `        <PersonalizationPanel` / `      ) : null}` (home.tsx:491-496).

Impact scenario: assistive technology cannot resolve the controlled region for the collapsed state (axe/`aria-controls` validity checks flag it), so the expanded/collapsed relationship is not announced.

Suggested fix: render the panel with `hidden={!personalizing}` (or a `hidden` attribute) instead of unmounting it, or drop `aria-controls` when collapsed.

### [low] `aria-label` placed on role-less containers is not exposed

Location: packages/platform/shell/shell/src/home.tsx:397

What is wrong: the suggestions strip is a plain `div` and the composer is `ComposerFrame`, which renders a plain `div` (`packages/platform/foundation/ui/src/composer-frame/index.tsx:11-14`); `aria-label` on a generic element with no role is not exposed as an accessible name.

Evidence: `              aria-label="Suggested searches"` (home.tsx:397, inside the `athyper-home__suggestions` div) and `      aria-label="Atlas AI prompt composer"` (home.tsx:945, passed to `ComposerFrame`).

Impact scenario: screen-reader users get no group/composer name for these regions; the labels look present in the source but never reach the accessibility tree.

Suggested fix: add an appropriate role (`role="group"` for the suggestions, `role="group"`/`role="form"` or a `<section aria-label>` for the composer) or use a real landmark element.

### [low] `BusinessContext` ignores post-mount changes to the `contexts` prop

Location: packages/platform/shell/shell/src/client.tsx:795

What is wrong: the supplied contexts are copied into `useState` initial values only, and `discoveryStarted` is latched from the first render, so a new `contexts` array (or the prop appearing/disappearing) never reaches the picker.

Evidence: `  const [contexts, setContexts] = useState<readonly ShellContextOption[]>(` / `      suppliedContexts ?? [],` / `    [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(` / `      suppliedContexts ? "ready" : "idle",` and `  const discoveryStarted = useRef(Boolean(suppliedContexts));`

Impact scenario: an app that re-renders the shell with a refreshed tenant list without remounting keeps showing the stale list; if `contexts` is `undefined` on first render and supplied later, discovery is already latched off so nothing is fetched either.

Suggested fix: derive the list when the prop is present (`const options = suppliedContexts ?? discovered`) or sync with an effect keyed on `suppliedContexts`.

## Checked and clean

- packages/platform/shell/shell/src/shell-i18n.ts:17 - `useOptionalI18n() ?? FALLBACK_I18N`; the fallback runtime is built once at module scope from the frozen English catalog and `createIntlRuntime` only mutates its private compiled-message cache (`packages/platform/foundation/i18n/src/index.ts:181-209`), so the shared object cannot leak state between renders; missing keys fall back to English and emit a `missing-message` diagnostic.
- packages/platform/shell/shell/src/messages.ts:31 - `shellMessages` returns a frozen catalog and both catalogs define the same key set; the only unused keys are the two reported above (verified by extracting all 72 `panel.*`/`shell.*` keys and grepping each across `apps packages server tests`).
- packages/platform/shell/shell/src/index.tsx:24 - `IntlProvider` receives `messages={shellMessages(localization.catalogLocale)}` plus `fallbackMessages={shellEnglishMessages}`, so the Arabic catalog's missing `entityEnglishMessages` coverage resolves through the fallback; the `AtlasAnswerProvider` `key` includes application/tenant/principal so the AI state is discarded on identity changes rather than leaking across contexts.
- packages/platform/shell/shell/src/client.tsx:197-209 - Atlas panel width persistence: read happens once before `atlasWidthReady`, the write effect is gated on the same flag and both effects have no dependency that can flip mid-flight, so no stale overwrite.
- packages/platform/shell/shell/src/client.tsx:260-291 - window listener effects (`athyper:atlas-open`, drawer Escape, business-context pointer/Escape/peer/shortcut handlers at 1000-1012, profile pointer/Escape at 1281-1286) all remove exactly what they add and use refs for the opener element, so no stale closure or leaked listener.
- packages/platform/shell/shell/src/client.tsx:672 - breadcrumb `key={`${crumb.label}-${index}`}` is stable and unique per position; all other `.map` renders in the group (`contexts`, `hoverLines`, locales, widgets, results, workspaces, actions, recent, citations, attachments, agents, argument entries) have keys.
- packages/platform/shell/shell/src/client.tsx:1190-1195 - `safeAssetRef` rejects absolute URLs and `..` traversal before any `img src`, so the logo asset ref cannot point off-origin.
- packages/platform/shell/shell/src/core.ts:262-273 - `canAccessRoute` requires a versioned UUID for read paths and matches the published `list`/`read` operation, and the route-prefix checks use `${href}/`, so `/app/countryside` cannot satisfy `/app/country`.
- packages/platform/shell/shell/src/core.ts:111-251 - `deriveShellNavigation` copies before sorting, freezes every produced object and array, and filters `entityRoutes` through the same permission/feature gates as navigation routes; the shared-infrastructure branch still requires a known catalog binding.
- packages/platform/shell/shell/src/home.tsx:678 - `editor.current.innerHTML = serialized["text/html"]` is safe: the HTML is produced by `serializeForClipboard`/`render`, which drops `script|style|meta|link|iframe|object|embed|form|input|button|svg|img` and escapes text, attribute values and hrefs (`clipboard-converter.ts:103,181,190-192`), and the paste/draft paths re-parse untrusted input through `convertClipboard`. `dangerouslySetInnerHTML` does not appear anywhere in the shell package.
- packages/platform/shell/shell/src/home.tsx:266 - the greeting interval is cleared on unmount and on `identity.timeZone` change, and the `/` focus shortcut listener (254) is removed on `scope.storageKey` change.
- packages/platform/shell/shell/src/home.tsx:1186-1196 - `waitForAttachment` is bounded to 40 attempts (~60 s) and reports "This file is taking longer than expected." through `attachmentMessage`; it cannot poll forever, and post-unmount `setAttachments` calls only touch the module draft plus window events.
- packages/platform/shell/shell/src/home.tsx:1688-1715 - governed actions require the explicit "I reviewed…" checkbox before the confirm button enables, and both buttons are disabled while busy, so the write cannot be double-submitted from this surface.
- packages/platform/shell/shell/src/home.tsx:1729-1733 - citation links only accept templates starting with `/` and `encodeURIComponent` the record id/entity code, so citation data cannot inject a URL or break out of the href.
- packages/platform/shell/shell/src/home.tsx:1777-1786 - `safeArgument` masks secret-looking keys and renders only primitives/`N selected items`/`Structured value`, so governed-action argument previews do not print nested secret payloads.
- packages/platform/shell/shell/src/home.tsx:281-297 - a successful `ask` clears the draft through both the draft-key change effect (732-750) and `clearAtlasDraft`, so the new-thread key mismatch does not leave submitted text in the composer; a failed ask keeps the text for retry.

## Notes

- Nothing was modified except this report; no builds, tests or git commands were run. All quoted lines were re-verified with grep against the current working tree after the uncommitted edits seen at review time.
- Sibling copies of the CSRF defect reported for client.tsx exist outside this group and are worth one shared fix: `packages/platform/shell/shell/src/quick-access.tsx:208` and `packages/platform/iam/identity-gate/src/context-picker.tsx:24` both use the same `__Host-`-first fallback, while `app-foundation/src/browser-csrf.ts:5` (`readBrowserCsrfToken`, already re-exported from `@athyper/platform-shell-app-foundation`) is the namespace-aware implementation that the contract test pins.
- Reachability of the breadcrumb crash was established by reading, not running, the chain: `client.tsx:330-335` -> `route-state.tsx:21-31` -> `core.ts:296-321`; `apps/*/app/providers.tsx:35` feeds `usePathname()` into `ShellRouteProvider`, and `client.tsx:211-213` falls back to `window.location.pathname`.
- Files read only to validate claims (not part of this group and not reviewed for defects): `route-state.tsx`, `use-shell-surfaces.ts`, `shell-overlay-state.ts`, `shell-surfaces.ts`, `shell-surface-context.ts`, `workspace-side-panel.tsx`, `atlas-surface.tsx`, `atlas-workspace.tsx`, `activity-center.tsx`, `collaboration-surface.tsx`, `home-personalization.ts`, `clipboard-converter.ts`, `browser-csrf.ts`, `identity-gate/src/context-picker.tsx`, plane shell entrypoints and `apps/neon/app/providers.tsx`.
- Not covered: runtime behavior of the AI answer store (`@athyper/platform-ai-agent-ui`) beyond confirming that `ask` never rejects and that `confirmAction`/`declineAction` are passed through; and any localization/RTL verification in a real Arabic session.


# Group G7

# Sweep G7

Shell page layout, navigation, overlays, preferences (`packages/platform/shell/shell/src/*`).
Read-only review; no builds/tests run. Every quote below was re-checked with `grep`/`read` against the current working tree.

## Coverage
| path | lines | verdict |
| --- | --- | --- |
| packages/platform/shell/shell/src/content-header.tsx | 40 | clean |
| packages/platform/shell/shell/src/context-departure.ts | 29 | clean |
| packages/platform/shell/shell/src/entity-page-layout.tsx | 55 | clean |
| packages/platform/shell/shell/src/management-workspace.tsx | 142 | clean |
| packages/platform/shell/shell/src/page-foundation.tsx | 60 | findings 1 |
| packages/platform/shell/shell/src/page-navigation.tsx | 77 | findings 2 |
| packages/platform/shell/shell/src/page-resource-boundary.tsx | 25 | clean |
| packages/platform/shell/shell/src/page-workspace.tsx | 188 | findings 2 |
| packages/platform/shell/shell/src/personalization-scope.tsx | 21 | clean |
| packages/platform/shell/shell/src/quick-access.tsx | 408 | findings 4 |
| packages/platform/shell/shell/src/record-footer.tsx | 160 | clean |
| packages/platform/shell/shell/src/record-information.tsx | 178 | findings 1 |
| packages/platform/shell/shell/src/route-state.tsx | 36 | clean |
| packages/platform/shell/shell/src/shell-chrome.tsx | 87 | findings 1 |
| packages/platform/shell/shell/src/shell-header-actions.tsx | 414 | findings 1 |
| packages/platform/shell/shell/src/shell-navigation.tsx | 152 | findings 1 |
| packages/platform/shell/shell/src/shell-overlay-host.tsx | 44 | clean |
| packages/platform/shell/shell/src/shell-overlay-state.ts | 84 | clean |
| packages/platform/shell/shell/src/shell-preferences.ts | 33 | clean |
| packages/platform/shell/shell/src/shell-surface-boundary.tsx | 58 | clean |
| packages/platform/shell/shell/src/shell-surface-context.ts | 11 | clean |
| packages/platform/shell/shell/src/shell-surfaces.ts | 74 | clean |
| packages/platform/shell/shell/src/shell-utilities-menu.tsx | 154 | findings 2 |
| packages/platform/shell/shell/src/task-header.tsx | 64 | clean |
| packages/platform/shell/shell/src/use-shell-surfaces.ts | 80 | clean |
| packages/platform/shell/shell/src/workspace-side-panel.tsx | 19 | clean |

## Findings

### [medium] Utilities theme toggle renders an active `high_contrast` preference as "System"
Location: packages/platform/shell/shell/src/shell-utilities-menu.tsx:33
What is wrong: The theme `UtilitiesToggleGroup` collapses the profile value `high_contrast` into the `system` option. `appearanceMode` is a real server- and storage-backed value (server contract allows `high_contrast`: `server/packages/platform/experience/src/contracts.ts:12`, validated into the bootstrap profile at `packages/platform/foundation/api-client/src/bootstrap.ts:60` via `oneOf(profileRecord.appearanceMode, ["system", "light", "dark", "high_contrast"] ...)`; localStorage maps `"high-contrast"` back to `high_contrast` at `packages/platform/shell/app-foundation/src/index.tsx:50`). The toggle group offers no high-contrast option and its option list is `system | light | dark`, so the effective mode is silently re-labelled.
Evidence: `value={appearance.profile.appearanceMode === "high_contrast" ? "system" : appearance.profile.appearanceMode}`
Impact scenario: A tenant/plane profile (or a browser that previously stored `high-contrast`) that selects high contrast shows the theme group with **System** pressed (`aria-pressed={value === option.value}`, shell-utilities-menu.tsx:145). The user cannot see that high contrast is active; touching the group writes `appearanceMode: "system"` through `setPreference` (line 39), which persists via `writeAppearancePreference` and drops the accessibility mode for anyone whose OS is not in forced-colors/prefers-contrast. The preference also silently diverges from what the UI claims.
Suggested fix: Offer an explicit high-contrast option (or a read-only indicator) and stop folding `high_contrast` onto `system`; if `system` is meant to mean "follow the OS", show the resolved mode separately instead of overwriting the stored value.

### [low] Dead exported surfaces: `PlanePageFrame` and `useDeepLinkedTabState`
Location: packages/platform/shell/shell/src/page-workspace.tsx:110
What is wrong: Two exported functions have no consumer anywhere. `PlanePageFrame` (`page-workspace.tsx:110`, props type at line 96, re-exported at `index.tsx:39`) and `useDeepLinkedTabState` (`page-navigation.tsx:59`, re-exported at `index.tsx:40`) are only referenced by their own definition and the barrel. I checked with `grep -rn "PlanePageFrame" . --include=*.ts --include=*.tsx` (excluding `node_modules`) and `grep -rn "useDeepLinkedTabState" . --include=*.ts --include=*.tsx`: the only hits are the definitions, the props interface and `packages/platform/shell/shell/src/index.tsx:39-40`. The doc comments describe consumers that do not exist — `useDeepLinkedTabState` claims it was extracted to match "the existing Business Partner request-detail behavior this was extracted from" (`page-navigation.tsx:53-58`), but that consumer is gone.
Evidence: `export function PlanePageFrame({` / `export function useDeepLinkedTabState({ initial, normalize, storageKey }: DeepLinkedTabStateOptions) {`
Impact scenario: ~60 lines of framework API surface (plus barrel exports) are maintained and reviewed as if load-bearing; a future adopter inherits latent defects in the dead hook (see next item) because nothing exercises it.
Suggested fix: Delete both, or drop the unused ones from the barrel until a real consumer lands. Related dead code in my group (`quick-access.tsx:201`) — the else branch is unreachable because line 199 (`if (!route) return [];`) already returned when `route` is falsy:
```
    const href = route ? `${route.href}?q=${encodeURIComponent(label)}` : navigation.landingHref ?? "/";
```

### [low] The dead `useDeepLinkedTabState` hook is not safe to adopt (unguarded storage, lossy hash round trip, stale `normalize`)
Location: packages/platform/shell/shell/src/page-navigation.tsx:59
What is wrong: Three defects sit in the unused hook. (1) `window.sessionStorage.getItem/setItem` are called without a guard, unlike every other storage access in this package (`shell-preferences.ts:5-8`, `browser-storage.ts:2-11`), so a browser that throws on storage access (`SecurityError`) throws inside the effect. (2) `select` writes the raw value into the fragment, but the sync path reads the *percent-encoded* fragment, so values containing spaces, `+`, `<`, `>`, backtick or non-ASCII do not round-trip (URL fragments percent-encode that set). (3) `normalize` is used inside the effect but missing from the dependency list, so `hashchange` normalizes with the closure captured at mount while `select` normalizes with the current prop.
Evidence (page-navigation.tsx:63 and :73):
```
      const candidate = (storageKey ? window.sessionStorage.getItem(storageKey) : null) ?? window.location.hash.slice(1);
    window.history.replaceState(window.history.state, "", `#${next}`);
```
Impact scenario: If a future consumer wires this hook up for deep-linked tabs, a tab key such as `"audit trail"` selects correctly but is not restored on reload/back-navigation (the encoded fragment fails `normalize` and falls back to `initial`), and cookie-blocked browsers crash the page owning the hook.
Suggested fix: Delete with the rest of the dead surface, or wrap storage via `readBrowserStorage`/`writeBrowserStorage` (`packages/platform/foundation/ui/src/browser-storage.ts`), `decodeURIComponent` on read and `encodeURIComponent` on write, and add `normalize` to the effect deps.

### [low] `aria-controls` on shell overlay triggers points at ids that are never rendered
Location: packages/platform/shell/shell/src/shell-header-actions.tsx:370
What is wrong: `HeaderActionButton` falls back to a synthetic panel id, but the inbox/notifications activity surface does not use that id — its root is `id="athyper-activity-center"` (`packages/platform/shell/shell/src/activity-center.tsx:242`). The primary buttons patch this by passing `controls="athyper-activity-center"` (lines 146 and 154), but the copies inside the overflow panel (lines 195-232) pass no `controls`, so they emit `aria-controls="header-inbox-panel"` / `"header-notifications-panel"`, which are never in the DOM. The search/utilities instances are only valid while open (the `header-search-panel` id at line 253, `id="header-utilities-panel"` at line 314), so their closed-state `aria-controls` is dangling too. The same pattern appears in the rail: `QuickAccessRailActions` always emits `aria-controls="athyper-quick-access"` (`shell-navigation.tsx:125`) although that `aside` only exists while the panel is open (`quick-access.tsx:158`).
Evidence (shell-header-actions.tsx:370-372):
```
      aria-controls={
        controls ?? (kind === "agent" ? undefined : `header-${kind}-panel`)
      }
```
Impact scenario: Assistive technology that follows `aria-controls` (or automated a11y checks) finds a non-existent target for the compact/overflow Inbox and Notifications buttons, so the relationship between the trigger and the activity panel is lost exactly in the compact layout where the overflow menu is the only way to reach them.
Suggested fix: Pass `controls="athyper-activity-center"` for the overflow inbox/notifications copies, and render `aria-controls` only when the referenced panel is mounted (or always render the panels with `hidden`).

### [low] `PageFrame` labels itself with a fixed literal that `PageWorkspace` cannot keep truthful for element headers
Location: packages/platform/shell/shell/src/page-workspace.tsx:57
What is wrong: `PageFrame` hard-codes the accessible-name reference (`page-foundation.tsx:36-37`: default `titleId = "page-title"`, `aria-labelledby={titleId}`), and `PageHeader`/`ContentHeader`/`PageWorkspace` all default their heading to the same literal (`page-foundation.tsx:40,46`, `content-header.tsx:23,34`, `page-workspace.tsx:48,88`). When `PageWorkspace` receives a *React element* as `header`, `titleId` is not forwarded to it, so the frame keeps referencing whatever id the element happens to use. The only live element-header caller works purely by coincidence: `detail-workspace.tsx:184-189` passes `<EntityRecordHeader/>`, which hard-codes `titleId="page-title"` (`packages/platform/entity/runtime/form-detail/src/record-header.tsx:98`). The fixed default also means two frames/headers composed on one page define the same DOM id, and `aria-labelledby` resolves to whichever heading came first.
Evidence (page-workspace.tsx:57-61, page-foundation.tsx:36-37):
```
      {header ? (
        React.isValidElement(header) ? (
          header
        ) : (
          <PageHeader {...(header as PageHeaderProps)} titleId={titleId} />
```
```
export function PageFrame({ width = "content", titleId = "page-title", className, children, ...props }: PageFrameProps) {
  return <section className={["athyper-page-frame", `athyper-page-frame--${width}`, className].filter(Boolean).join(" ")} aria-labelledby={titleId} {...props}>{children}</section>;
```
Impact scenario: `<PageWorkspace titleId="x" header={<CustomHeader/>}>` renders a `<section aria-labelledby="x">` while the heading keeps `id="page-title"`; the section silently loses its accessible name (the referenced id does not exist). Any page composing two defaulted headers (`PageHeader`/`ContentHeader`) produces duplicate `page-title` ids, so both sections and both labels reference the first heading.
Suggested fix: Derive the id inside the component with `useId()` and pass it to both the frame and the rendered header, or clone the element header with the resolved `titleId` (and keep the fixed default only as a documented opt-in).

### [low] Every `useMemo` in `ShellQuickAccess` recomputes because its inputs are new arrays each render
Location: packages/platform/shell/shell/src/quick-access.tsx:85
What is wrong: `favourites` and `recent` are computed inline with `.filter(...)` (lines 85-86), producing a fresh array on every render. All downstream memos are keyed on those identities, so `favouriteHrefs` (line 87), `matchingFavourites` (line 89), `recentCounts` (lines 90-93), `matchingRecent` (line 94), `favouriteGroups` (line 95) and `recentGroups` (line 96) re-run on every render — including every keystroke in the panel's search field, which is the one thing the panel does interactively.
Evidence: `const favourites = (dataSource?.favourites ?? mergeFavourites(durableRecords.items, localStore.favourites)).filter((item) => canAccessRoute(navigation, item.href.split(/[?#]/)[0]!));`
Impact scenario: With up to `MAX_RECENT_ITEMS = 50` stored visits plus durable bookmarks, each keystroke re-filters, re-counts and re-groups three lists; the memos cost more than the work they skip, and the misleading `useMemo` boundaries hide the real dependency graph.
Suggested fix: Memoize the two base lists (`useMemo` over `dataSource?.favourites`/`durableRecords.items`/`localStore`/`navigation`) and drop the downstream memos, or remove the memos entirely.

### [low] Durable bookmark fetch has no abort or request-sequence guard
Location: packages/platform/shell/shell/src/quick-access.tsx:187
What is wrong: `load` applies whatever response resolves last (`setRows(...)`), is invoked on mount *and* from the `athyper:record-bookmarks-changed` listener (line 196), and has no `AbortController` or request-id check. Overlapping loads (initial mount racing a change event emitted by `durableRecords.remove`, or two bookmark changes in quick succession) can land out of order, and a response can land after the panel closed or the scope changed.
Evidence: `const changed = () => void load(); window.addEventListener("athyper:record-bookmarks-changed", changed);`
Impact scenario: The user un-stars a bookmark; `remove` optimistically removes the row and dispatches the change event; if a slower in-flight `load` from before the removal resolves afterwards, the stale payload re-adds the row, so the star shows as favourited again until the next event or remount. The endpoint is only polled by these events, so this is transient, but it is real cross-response clobbering.
Suggested fix: Keep a request generation counter (or an `AbortController` per load) and ignore responses that are no longer the newest, including after unmount.

### [low] Copy-pasted shell helpers and copyright literal drift between modules
Location: packages/platform/shell/shell/src/quick-access.tsx:389
What is wrong: The local-href guard is byte-identical in two modules of the same package, and the scope hash is duplicated under two names:
Evidence (quick-access.tsx:389-391 and :401-405 vs packages/platform/shell/shell/src/home-personalization.ts:119,121):
```
function safeLocalHref(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/(^|\/)\.\.(\/|$)/.test(value);
}
function hashScope(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619);
  return (hash >>> 0).toString(36);
}
```
```
function safeLocalHref(value: string): boolean { return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/(^|\/)\.\.(\/|$)/.test(value); }
function scopeHash(value: string): string { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619); return (hash >>> 0).toString(36); }
```
The same literal also appears twice in this group: `© 2026 Atlas Digital Technology Solutions` in shell-chrome.tsx:18 (`GlobalFooter`) and shell-utilities-menu.tsx:107 (About section). Both `quick-access.tsx:328-365` and `shell-preferences.ts:5-14,21-25` additionally re-implement the storage try/catch that already exists as `readBrowserStorage`/`writeBrowserStorage` in `packages/platform/foundation/ui/src/browser-storage.ts:6-14`.
Impact scenario: This is the security-relevant "is this href safe to render/restore" predicate and the "which principal does this browser storage belong to" hash. A hardening change to one copy (e.g. rejecting encoded traversal, or widening the hash) silently skips the other, so quick access and home personalization can disagree about what counts as a safe local href, and the footer/about text will diverge on the next edit.
Suggested fix: Extract one shell utility module (safe local href, scope hash, storage access via the existing `browser-storage` helpers) and one shared copyright constant, and import them from both call sites.

### [low] Record-information popover closes on a breakpoint change without restoring focus
Location: packages/platform/shell/shell/src/record-information.tsx:37
What is wrong: The media-query listener closes the popover directly with `setOpen(false)` instead of going through `close()` (lines 44-47) or the `Dialog`'s `onOpenChange` (lines 138-141), which are the only two paths that call `anchor.current?.focus()`.
Evidence (record-information.tsx:35-39):
```
    const media = matchMedia("(max-width: 760px)");
    const update = () => {
      setOpen(false);
      setCompact(media.matches);
    };
```
Impact scenario: With the popover open on a wide viewport, resizing/rotating across 760px removes the popover while focus is inside it; focus falls back to `<body>`, so the next Tab press restarts from the top of the document instead of the "Record information" trigger. The desktop popover's other close path is the outside-pointerdown handler, which does call `close()` (line 57), so only the breakpoint path loses focus.
Suggested fix: Call `close()` from `update` (or focus `anchor.current` after `setOpen(false)`).

## Checked and clean
- packages/platform/shell/shell/src/shell-surface-boundary.tsx:19-26 - "error boundary that never resets" checked: the failure flag is cleared by `onRetry` (`this.setState({ failed: false })`) and each surface boundary is either unmounted when its surface closes (search/utilities/activity branch in `shell-header-actions.tsx`) or re-keyed on scope change (`shell-overlay-host.tsx:19`), so a stale failure cannot be reused for different content.
- packages/platform/shell/shell/src/shell-overlay-state.ts:54,59-63 - reducer purity checked: `initialOverlayState` is a module-level shared object used as the `useReducer` seed (`use-shell-surfaces.ts:9`), and every branch returns new objects/`state`, never mutating it, so sharing across shell instances is safe.
- packages/platform/shell/shell/src/shell-overlay-state.ts:36-41,70-71 - overlay/route lifecycle checked: `dismiss-context` and the compact transition both force `atlas.full = false` and unbind the atlas when a transient surface is open, so `full`/`open` cannot desynchronise.
- packages/platform/shell/shell/src/use-shell-surfaces.ts:16-22 - "polling that never stops" checked: the only long-lived subscription is the `matchMedia("(max-width: 760px)")` `change` listener, removed in the effect cleanup; there is no interval or timer in this hook.
- packages/platform/shell/shell/src/context-departure.ts:14-22 - stale-closure check: the listener reads the live state from `current.current` (ref updated each render) and both `addEventListener`/`removeEventListener` are paired; `contextDepartureState()` is consumed synchronously in `packages/planes/neon/shell/src/index.tsx:330-336`, so mutating the event detail is safe.
- packages/platform/shell/shell/src/quick-access.tsx:83,141-142,151 - timer cleanup checked: `undoTimer` is cleared on unmount, on `restoreRecent`, and before re-arming in `clearRecent`, so the 8s undo window cannot fire after the panel closes.
- packages/platform/shell/shell/src/quick-access.tsx:205-215 - URL/param injection checked: the bookmark id is validated against `/^record-bookmark:([a-z][a-z0-9_.-]{0,126}):([0-9a-f-]{36})$/iu`, the entity code is `encodeURIComponent`-ed into the path, the CSRF token is read from the cookie and sent as `x-csrf-token`, and failures roll the optimistic removal back.
- packages/platform/shell/shell/src/quick-access.tsx:338-357 - stored-preference validation checked: `parseItems` rejects non-strings, non-local `href`s (`safeLocalHref` blocks `javascript:`/protocol-relative/traversal), empty labels, duplicates, and caps label/description/group length, and rendered hrefs are re-checked with `canAccessRoute` (lines 85-86).
- packages/platform/shell/shell/src/quick-access.tsx:66-69 - effect-dependency check: `navigation`/`dataSource` in the deps would loop if a consumer passed an inline object, but the only renderer (`shell-overlay-host.tsx:23`, reached from `client.tsx:615-631`) forwards Server-Component props, so those identities are stable per route; no loop is reachable today.
- packages/platform/shell/shell/src/page-navigation.tsx:27-41 - duplicate-id check: `PageNavigation` renders `Tabs`/`TabsContent`, whose ids are derived from `useId()` in `packages/platform/foundation/ui/src/index.tsx:52,63-66`, so multiple tab sets cannot collide; the optional `mount` prop it forwards is genuinely supported there.
- packages/platform/shell/shell/src/task-header.tsx:26-28,60-63 - registration-loop check: splitting the register function into its own context means the registering component never subscribes to the header it publishes; the effect returns the unregister function and the provider bails out on referentially identical `children`.
- packages/platform/shell/shell/src/route-state.tsx:19,35 - registration cleanup check: both cleanups compare the previous value by identity (`current === next` / `current === record`) before clearing, so a newer registration is not wiped by an older unmount.
- packages/platform/shell/shell/src/record-footer.tsx:145 - `<details key={JSON.stringify(sources)}>` checked: the element sits in a two-child array, and React compares explicit keys for array children, so a source change does remount the disclosure and reset its open state as intended.
- packages/platform/shell/shell/src/shell-chrome.tsx:56-68 - modal `outside` whitelist check: `:scope > .athyper-shell__scrim` resolves against the rail's parent and the scrim is rendered as a direct child of `.athyper-shell` (`client.tsx:506-513`), so the scrim stays interactive while the drawer is modal; `restoreFocus: false` is compensated by `closeDrawer`/`closeQuickAccess` (`client.tsx:299-311`).
- packages/platform/shell/shell/src/entity-page-layout.tsx:24-34,49-54 - owner-set leak check: each `useRecordPage` registers a fresh symbol and removes it in the effect cleanup, so `owners` returns to empty when the record page unmounts.
- packages/platform/shell/shell/src/shell-preferences.ts:5-15 - preference schema check: only `"true"`/`"false"` are accepted, the cookie fallback uses an anchored regex, and both storage paths are wrapped, matching the asserted behaviour "explicit collapse cookie survives unavailable local storage" (`tests/foundation-browser/shared-shell.spec.ts:310-315`).
- packages/platform/shell/shell/src/shell-overlay-host.tsx:26-33 - overlay scrim check: the Atlas dismiss scrim is a real `<button type="button">` with an accessible label, and the quick-access boundary key is the same `[plane, tenantId, accountScope]` triple the storage key is derived from, so error/personalization state cannot bleed across scopes.
- packages/platform/shell/shell/src/management-workspace.tsx:75-92 - keyboard check: navigation is rendered as real `<a href>` elements, `preventDefault` is only applied for unmodified primary activation with an `onNavigate` handler, and modifier clicks keep native behaviour.

## Notes
- Not finished / not attempted: I did not run any test or build (read-only review), so I could not confirm which of these regressions the existing Playwright suites already cover. `tests/foundation-browser/shared-shell.spec.ts` asserts focus restoration for the drawer/quick access/Escape ownership, which is why I did not file focus findings for those overlays.
- Dead-code scoping: `SectionNavigation` (`page-foundation.tsx:56`), `PageResourceBoundary` (`page-resource-boundary.tsx:20`), `PageNavigation` (`page-navigation.tsx:25`) and `useRecordFooterSources` (`record-footer.tsx:114`) have **no production consumer** but are imported by `tests/foundation/page-foundation.test.tsx:3,19`, `tests/foundation/second-entity-reuse-currency.test.tsx:5`, `tests/foundation/record-footer-registration.test.tsx:9`, `tests/foundation-browser/page-navigation-scroll-linked-tab.spec.ts:19` and `tests/foundation-browser/entity-record-footer.spec.ts:19`. I therefore did not call them dead; only `PlanePageFrame` and `useDeepLinkedTabState` have zero references anywhere in the repo.
- Shared `page-title` default: `content-header.tsx:23`, `page-foundation.tsx:36,40` and `page-workspace.tsx:48` all default to the literal `"page-title"`. Today's compositions happen to render exactly one `<h1 id="page-title">`, but the literal is a cross-component contract with no enforcement (rolled into the `PageFrame` finding above).
- Duplication detail (see the "Copy-pasted shell helpers" finding; `home-personalization.ts` is outside my group, cited only as the duplicate partner): `safeLocalHref` is byte-identical in `quick-access.tsx:389-391` and `home-personalization.ts:119`; the FNV-1a scope hash is duplicated as `hashScope` (`quick-access.tsx:401-405`) and `scopeHash` (`home-personalization.ts:121`); and the copyright literal `© 2026 Atlas Digital Technology Solutions` appears both in `shell-chrome.tsx:18` and `shell-utilities-menu.tsx:107`. Both `quick-access.tsx` read/write helpers and `shell-preferences.ts` also re-implement `readBrowserStorage`/`writeBrowserStorage` (`packages/platform/foundation/ui/src/browser-storage.ts`).
- Group-specific observations not filed as findings: (1) the two scope-hash keys use a 32-bit non-cryptographic hash of `plane:tenant:principal` as the localStorage scope (`quick-access.tsx:256-258`, `home-personalization.ts:114-116`) — a collision would surface another scope's visited hrefs in the same browser; with only a handful of scopes per browser the probability is negligible, so I treated it as a note. (2) Durable bookmark links embed the record label in the query string (`quick-access.tsx:201`, `${route.href}?q=${encodeURIComponent(label)}`) even though `row.recordId` is available, which puts a record display name into history/logs; I did not file it because I could not verify what the bookmark producer stores or whether the label may be personal data. (3) `shell-utilities-menu.tsx:98` renders an empty `<dt />` paired with the plane descriptor `<dd>`, i.e. an unlabelled term/value pair in the About `<dl>`.
- Cross-file observation (outside my assignment, reported for the owning reviewer): `client.tsx:385` provides `ShellSurfaceContext.Provider value={{ surface, setContext }}` with a fresh object literal on every render, so every `useShellSurfaceContext()` consumer (`client.tsx:938`) re-renders on unrelated shell state changes such as navigation-hover peek updates.


# Group G8

# Sweep G8

Scope: `packages/contracts/platform/entity-runtime/src/**` pure helpers, parsers and normalizers
(29 assigned files). The single Country request path owned by another reviewer
(`list-view/src/index.tsx`, `form-detail/src/index.tsx`, `form-detail/src/entity-read-runtime.tsx`,
`form-detail/src/routes/entity-read-page.tsx`, `apps/*/lib/relay.ts`) was not deep-reviewed.

## Coverage
| path | lines | verdict |
| --- | --- | --- |
| packages/contracts/platform/entity-runtime/src/access-decision.ts | 96 | clean |
| packages/contracts/platform/entity-runtime/src/activity-collections.ts | 73 | clean |
| packages/contracts/platform/entity-runtime/src/activity-date-range.ts | 56 | clean |
| packages/contracts/platform/entity-runtime/src/activity.ts | 85 | clean |
| packages/contracts/platform/entity-runtime/src/detail-navigation.ts | 68 | findings 1 |
| packages/contracts/platform/entity-runtime/src/entity-lookup.ts | 149 | clean |
| packages/contracts/platform/entity-runtime/src/entity-record-href.ts | 23 | clean |
| packages/contracts/platform/entity-runtime/src/entity-relationship.ts | 67 | findings 1 |
| packages/contracts/platform/entity-runtime/src/governed-workflow.ts | 587 | findings 1 |
| packages/contracts/platform/entity-runtime/src/index.ts | 68 | clean |
| packages/contracts/platform/entity-runtime/src/intake-data-values.ts | 335 | clean |
| packages/contracts/platform/entity-runtime/src/intake-data.ts | 720 | findings 1 |
| packages/contracts/platform/entity-runtime/src/intake-flow-authoring.ts | 66 | clean |
| packages/contracts/platform/entity-runtime/src/intake-operation.ts | 93 | clean |
| packages/contracts/platform/entity-runtime/src/intake-surface-authoring.ts | 194 | clean |
| packages/contracts/platform/entity-runtime/src/intake-surface.ts | 529 | clean |
| packages/contracts/platform/entity-runtime/src/intake.ts | 134 | clean |
| packages/contracts/platform/entity-runtime/src/lookup-options.ts | 183 | clean |
| packages/contracts/platform/entity-runtime/src/presentation-localization.ts | 28 | clean |
| packages/contracts/platform/entity-runtime/src/recent-choice.ts | 59 | clean |
| packages/contracts/platform/entity-runtime/src/record-360-panel.ts | 102 | clean |
| packages/contracts/platform/entity-runtime/src/record-presentation.ts | 373 | findings 2 |
| packages/contracts/platform/entity-runtime/src/related-presentation.ts | 547 | clean |
| packages/contracts/platform/entity-runtime/src/routes/entity-read-route.ts | 21 | clean |
| packages/contracts/platform/entity-runtime/src/runtime-resource.ts | 157 | findings 1 |
| packages/contracts/platform/entity-runtime/src/runtime-values.ts | 35 | clean |
| packages/contracts/platform/entity-runtime/src/validation-messages.ts | 159 | clean |
| packages/contracts/platform/entity-runtime/src/validation/entity-code.ts | 8 | findings 1 |
| packages/contracts/platform/entity-runtime/src/validation/values.ts | 17 | clean |

## Findings

### [high] Permission-projected presentation keeps navigation/panel references that the re-parse then rejects
Location: packages/contracts/platform/entity-runtime/src/record-presentation.ts:286

What is wrong: `readableRecordPresentation` filters `sections` by readable fields / authorized
relationships but copies `presentation.navigation` through a tab projection that can yield an empty
`tabs` array, and copies `panel` through completely unprojected. The live record path immediately
re-parses that projected object (`entity-list-service.ts:538` -> `index.ts:15`
`parseEntityRecordPresentation`), and that re-parse rejects an empty tab list and any panel reference
whose section disappeared. So an empty-by-authorization projection becomes a parse failure instead of
an empty page.

Evidence: `record-presentation.ts:286`
```
      ...(presentation.navigation.tabs ? { tabs: presentation.navigation.tabs.map(tab => ({
```
`record-presentation.ts:288`
```
      })).filter(tab => tab.sectionKeys.length) } : {}),
```
`detail-navigation.ts:27`
```
  if (!Array.isArray(raw.tabs) || !raw.tabs.length || raw.tabs.length > 12)
```
`record-presentation.ts:197` (panel checked against the *filtered* `result.sections`)
```
      ...result.panel.sections,
```
`record-presentation.ts:202`
```
      if (!sections.has(reference))
```

Impact scenario: a principal is admitted to the record but holds no readable field of any section and
no authorized relationship (the same case the code already anticipates for `titleField` with
`fallbackTitle`, line 292-294). `visibleSections` is empty, every tab filters to `sectionKeys: []` and
`readableRecordPresentation` emits `navigation: { mode, tabs: [] }`; `parseEntityDetailDescriptor`
then throws `Invalid detail navigation tabs` and the record detail descriptor fails (500-class) for
that user. The same happens for the legacy 360 `panel`: a rail section whose fields are all hidden is
removed from `sections` while staying in `panel.sections`, and the re-parse throws
`Unknown 360 section: <key>`. This is reachable with published metadata — e.g.
`metadata/products/mdg/entities/business_partner/presentation.detail.json` and
`metadata/products/shared/entities/country/definition.json` both publish `navigation.tabs`.

Suggested fix: treat an empty projected tab list as "no navigation" (drop the `navigation` key when
`tabs.length === 0`) and project `panel.sections` against `visibleSections` too (or make
`parseEntityDetailNavigation` accept `tabs: []` as absent, matching `entity-page-planner.ts:146-148`
which explicitly tolerates "permission filtering may legitimately remove every destination").

### [medium] Relationship field-existence gate fails open on `Object.prototype` members
Location: packages/contracts/platform/entity-runtime/src/entity-relationship.ts:61

What is wrong: the qualification check reads contract field maps with plain property access instead of
`Object.hasOwn`, and the reference validator `name()` accepts `constructor`. Both `owner.fields` and
`target.fields` are built with `Object.fromEntries(...)` (`relationship-qualification.ts:51-53, 72`),
so both lookups resolve `Object.prototype.constructor` for the name `constructor` and compare equal —
the "field mismatch" guard passes although neither contract declares that field.

Evidence: `entity-relationship.ts:61`
```
    if (!owner.fields[field.source] || owner.fields[field.source] !== target.fields[field.target]) throw new TypeError("Entity relationship field mismatch");
```
`entity-relationship.ts:15`
```
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{1,62}$/.test(value)) throw new TypeError("Invalid entity relationship reference");
```

Impact scenario: a published relationship declaring `fields: [{ source: "constructor", target:
"constructor" }]` (tenant mapping still real) passes `parseEntityRelationships` and then passes
`qualifyEntityRelationship` against any owner/target pair whose tenant mapping matches. The
publication-time proof that every mapping exists in both contracts is bypassed, so a relationship to a
column that does not exist is admitted instead of being rejected at qualification.

Suggested fix: `Object.hasOwn(owner.fields, field.source)` / `Object.hasOwn(target.fields,
field.target)` for the lookups, and reject reserved names (`constructor`, `prototype`, `__proto__`) in
`name()`; optionally build the contract maps with `Object.create(null)`.

### [low] Badge tone lookup is prototype-unsafe and case-sensitive
Location: packages/contracts/platform/entity-runtime/src/record-presentation.ts:356

What is wrong: `recordDisplay` returns the raw record value and it is used directly as a key into
`item.tones`, which was built with `Object.fromEntries`. Inherited members resolve, and the parsed
tone keys are forced to lowercase (`key(state)` requires `^[a-z]...`) while the lookup is
case-sensitive.

Evidence: `record-presentation.ts:356`
```
              tone: item.tones[value] ?? "neutral",
```
`record-presentation.ts:153`
```
            key(state),
```
Contrast, the shared helper that does this correctly (`runtime-values.ts:21`):
```
  return Object.hasOwn(tones, key) ? entityStatusTone((tones as Record<string, unknown>)[key]) : "neutral";
```

Impact scenario: a record value of `constructor`, `toString` or `valueOf` resolves an inherited
function, which is passed to `Badge` (`form-detail/src/record-header.tsx:107`) and rendered as
`a-badge--function ...` rather than a tone; a mixed-case status such as `Published` can never match a
declared tone even when metadata maps it (and metadata cannot declare an uppercase tone key at all),
so tones silently degrade to `neutral` — a divergence from `resolveEntityStatusTone`, which lowercases
and uses `Object.hasOwn`.

Suggested fix: `tone: resolveEntityStatusTone(value, item.tones)`.

### [low] `parseEntityRuntimeBootstrap` is dead code that silently coerces and drops fields
Location: packages/contracts/platform/entity-runtime/src/runtime-resource.ts:96

What is wrong: the exported parser has no call site; the served bootstrap is parsed by a second,
divergent normalizer. Inside the dead parser, `cursor` is coerced with `String(...)` and `revision` /
`nextCursor` / `reasonCode` are silently dropped when they are not strings, so shape drift cannot be
detected.

Evidence: `runtime-resource.ts:96`
```
export function parseEntityRuntimeBootstrap(
```
`runtime-resource.ts:123`
```
        ...(identity.cursor === undefined ? {} : { cursor: String(identity.cursor) }),
```
`runtime-resource.ts:127`
```
      ...(typeof item.revision === "string" ? { revision: item.revision } : {}),
```

Dead-code verification: `grep -rn "parseEntityRuntimeBootstrap\|EntityRuntimeBootstrapV1" apps
packages server tests` (excluding `.next`/`node_modules`) returns only `runtime-resource.ts:50,96,98`
for the parser plus `server/packages/contracts/metadata/src/ports.ts:3,9,13` for the *type*. The live
parser is `parseBootstrap` at
`packages/platform/entity/runtime/descriptor-client/src/runtime-client.ts:202`.

Impact scenario: two bootstrap normalizers drift; the unused one would accept `cursor: {}` as
`"[object Object]"` and lose a non-string `revision` without any error, so any future wiring to it
inherits undetected wire-shape drift.

Suggested fix: delete the unused parser (keep the type), or make `parseBootstrap` consume it and
validate `cursor`/`revision` explicitly.

### [low] `governed-workflow` parsers are exported but never used
Location: packages/contracts/platform/entity-runtime/src/governed-workflow.ts:168

What is wrong: all four parsers in this 587-line module, plus the contract-version constant, have no
reference anywhere in source; the interfaces are used only inside the same file.

Evidence: `governed-workflow.ts:204`
```
export function parseGovernedCaseView(value: unknown): GovernedCaseViewV1 {
```
(also lines 168, 325, 395 and `GOVERNED_WORKFLOW_CONTRACT_VERSION` at line 1).

Dead-code verification: `grep -rn "\bparseExperienceContextCoordinate\b"` /
`\bparseGovernedCaseView\b` / `\bparseEvidenceItemView\b` / `\bparseNotificationEvent\b` /
`\bGOVERNED_WORKFLOW_CONTRACT_VERSION\b` over `apps packages server tests tooling` (excluding
`.next`/`node_modules`) each return exactly one hit — the definition. Only `.next` build chunks
re-export them.

Impact scenario: ~500 lines of validation that no request path exercises; drift in the governed-case /
notification wire shapes it models will not be caught by anything, and reviewers cannot tell whether
the module is the supported contract or abandoned scaffolding.

Suggested fix: remove the module from `index.ts` until a consumer exists, or add a consumer plus tests.

### [low] `ENTITY_CODE_MIN_LENGTH` / `ENTITY_CODE_MAX_LENGTH` are unused
Location: packages/contracts/platform/entity-runtime/src/validation/entity-code.ts:3

What is wrong: both constants are exported but referenced nowhere; the length bounds only exist
implicitly in `entityCodePattern`.

Evidence: `validation/entity-code.ts:3`
```
export const ENTITY_CODE_MIN_LENGTH = 2;
```
```
export const ENTITY_CODE_MAX_LENGTH = 63;
```
Dead-code verification: `grep -rn "ENTITY_CODE_MIN_LENGTH\|ENTITY_CODE_MAX_LENGTH" .` matches only
those two definition lines in source (all other hits are generated `.next` chunks).

Impact scenario: none at runtime; the bounds are unshared documentation, so any future validator that
reaches for them cannot, and the constants give a false impression of a single source of truth.

Suggested fix: use them in `isCanonicalEntityCode` (or in the parser that reports the bound) or delete
them.

### [low] `IntakeInputField.pattern` is declared and consumed but never parsed from metadata
Location: packages/contracts/platform/entity-runtime/src/intake-data.ts:62

What is wrong: `validateDataInput` applies `field.pattern`, and `IntakeInputField` declares
`pattern?: string`, but `parseIntakeDataField` never reads a `pattern` key off the input field — it
only forwards `referenceRules` property *names* (which `resolveDataInput` later materializes as
`pattern`). A metadata-declared field-level pattern is therefore silently discarded.

Evidence: `intake-data.ts:62`
```
  readonly pattern?: string;
```
`validation-messages.ts:92`
```
  if (field.pattern) {
```
`intake-data.ts:586-596` returns only these keys for `referenceRules`:
```
              ...Object.fromEntries(
                [
                  "label",
                  "pattern",
                  "placeholder",
                  "helpText",
                  "value",
                  "widget",
                  "required",
                ].flatMap((k) => (r[k] === undefined ? [] : [[k, key(r[k])]])),
              ),
```
`intake-surface-authoring.ts:108` spreads `displayConfig` into the parsed field, so a
`displayConfig.pattern` reaches `parseIntakeDataField` and is dropped there.

Impact scenario: an author adds `"pattern": "^[0-9]{8}$"` to a native form field binding; the pattern
is accepted silently, never stored, and never enforced — the submitted value is not validated, with no
error to the author. (The only producer of `pattern` on a parsed field today is a
`referenceRules.pattern` option-data binding.)

Suggested fix: parse `f.pattern` with the same 256-char/regex-safe guard used by
`validateDataInput`, or remove `pattern` from `IntakeInputField` and document that only
`referenceRules` may supply it.

## Checked and clean
- packages/contracts/platform/entity-runtime/src/index.ts:16 - `parseEntityRecord` silently drops a non-integer `version`; the server applies the identical guard (`entity-list-service.ts:671-679`), so the shapes agree, and `String(rawId)` matches integer-PK ids.
- packages/contracts/platform/entity-runtime/src/lookup-options.ts:107-113 - `choose` + `recordAccess:"manage"` is rejected while `browse` + `manage` is allowed; call sites use `readOnly` for `choose` (`tests/foundation/entity-list-phase1a.test.tsx:2538`), so this is a deliberate mode/selection/access matrix, not an inverted check.
- packages/contracts/platform/entity-runtime/src/validation-messages.ts:119 - the `select` branch needs `field.lookup.options`; that looked like a broken source-backed select, but the server injects resolved directory options before the descriptor is served (`server/packages/services/records/src/intake-form-choices.ts:41-48` called from `entity-list-service.ts:209`), which is why the browser test injects them manually at `tests/foundation-browser/bank-editor.spec.ts:93`.
- packages/contracts/platform/entity-runtime/src/validation-messages.ts:88 - BIC is matched case-sensitively and without space stripping while IBAN at line 78 normalizes both; not reported because the same field contract offers `normalize:"uppercase"` and uppercase BIC is the canonical published form.
- packages/contracts/platform/entity-runtime/src/activity-date-range.ts:49-54 - no range off-by-one: `dateMs` differences are exact whole days, `startOfDate` always returns a whole-second instant so `new Date(next-1000).toISOString()` always ends `.000Z` and the `.999999Z` inclusive bound applies, and future ends fall back to `now`.
- packages/contracts/platform/entity-runtime/src/detail-navigation.ts:65 - "must cover every section" cannot be violated by `readableRecordPresentation` output, because tabs and sections are filtered with the same `visibleSections` predicate (line 277 vs 306-311).
- packages/contracts/platform/entity-runtime/src/access-decision.ts:54-56 - `reasonCode` must equal the reason paired with the state index, unknown properties are rejected, and `missingCoordinates` is only accepted for `context_required`; no allow-by-default path.
- packages/contracts/platform/entity-runtime/src/runtime-resource.ts:143 - the duplicate-resource check stringifies the parser-built `identity` (fixed key order), so it is deterministic, not key-order dependent.
- packages/contracts/platform/entity-runtime/src/related-presentation.ts:313-319 - status/value map keys reject `__proto__`/`constructor`/`prototype` before the render-time `values[state]` lookup (`form-detail/src/related-record.tsx:88`), so that map is prototype-safe.
- packages/contracts/platform/entity-runtime/src/related-presentation.ts:221,258,285 - catalogue membership uses `Object.hasOwn`, and summary/detail references are resolved through explicit `group.key + "." + field.key` matching.
- packages/contracts/platform/entity-runtime/src/entity-lookup.ts:53-56,85-92 - `only()` rejects unsupported lookup and message properties before `parseEntityLookupOptions` spreads the same object; message keys are enumerated and every value is text-validated.
- packages/contracts/platform/entity-runtime/src/intake-data.ts:353-364 - `key()` rejects prototype names per `[.-]` segment, so all later `option.data[...]` / `copyFields.from` lookups are prototype-safe.
- packages/contracts/platform/entity-runtime/src/intake-data.ts:496-504 - selects must declare either a registered `sourceKey` or static options, and option values are uniqueness-checked.
- packages/contracts/platform/entity-runtime/src/intake-data-values.ts:22-32 with packages/contracts/platform/entity-runtime/src/intake-surface.ts:487-504 - both visibility fixpoints are monotone decreasing over the same field order, so the count/JSON comparison terminates correctly; non-convergence returns a conservative result.
- packages/contracts/platform/entity-runtime/src/intake-data-values.ts:264-308 - repeatable rows require unique non-empty `key`s, primary-field uniqueness and `requiredItemValues` are enforced only outside draft mode, and hidden/unknown answers never reach the adapter (result is built only from `fieldsOf(surface)`).
- packages/contracts/platform/entity-runtime/src/intake-data-values.ts:110-132 - eligibility filtering falls back to the full option list only when `fallbackToAll` is set.
- packages/contracts/platform/entity-runtime/src/intake-surface.ts:249-260,300-310 - duplicate section/field/value keys are rejected and the condition-dependency graph is cycle-checked before the size budget (line 458-471).
- packages/contracts/platform/entity-runtime/src/intake-surface.ts:120-146 - choice presentation defaults are bounded enums and `stacked` + two columns is rejected.
- packages/contracts/platform/entity-runtime/src/presentation-localization.ts:26-28 - `readablePresentationLocalization` and `readableRecordPresentation` build new objects; the frozen parsed inputs are not mutated.
- packages/contracts/platform/entity-runtime/src/entity-record-href.ts:6-10 - segments are decoded before the `[\\/?#%...]`/`.`/`..` rejection, so `%2F` traversal is refused, and `entityRecordHref` re-encodes both path parts.
- packages/contracts/platform/entity-runtime/src/recent-choice.ts:22-45 - `limit` is 1..20 and `retentionDays` 1..90, so browser/server history cannot be unbounded.
- packages/contracts/platform/entity-runtime/src/record-360-panel.ts:85-93 - exactly one overview tab, non-empty sections, no section both in the rail and its own tab, and duplicate checks for every reference list.
- packages/contracts/platform/entity-runtime/src/routes/entity-read-route.ts:15-19 - more than one segment or a non-UUID record id is refused; `manage` intentionally maps to the list route.
- packages/contracts/platform/entity-runtime/src/validation/values.ts:2-16 - shape-only predicates, length checked before trimming as documented, used consistently at the runtime-resource/record-presentation boundaries.
- packages/contracts/platform/entity-runtime/src/runtime-values.ts:18-21,25-34 - `resolveEntityStatusTone` uses `Object.hasOwn`, and legacy provider/section-display defaults are resolved explicitly rather than by the renderer.
- packages/contracts/platform/entity-runtime/src/intake-operation.ts:70-92 - receipt version/policy outcome/capability operations are enum-checked and unknown capability operations rejected before use.
- packages/contracts/platform/entity-runtime/src/intake-flow-authoring.ts:34-49 / intake-surface-authoring.ts:36-45 - ordering checks run before `[...values].sort(...)`; the flow compiler sorts a `filter()` copy, so no shared input array is mutated.

## Notes
- Method: all 29 files were read end to end; line counts are `wc -l` on the current working tree. Every
  quoted line was re-verified with `grep -nF` against the current file after the uncommitted edits.
  Dead-code claims used `grep -rn` over `apps packages server tests tooling`, excluding generated
  `.next` and `node_modules` trees (build chunks re-export everything and otherwise dominate results).
- Group observation (not filed as a finding): this package is split between parsers that reject
  unknown properties (`access-decision.ts`, `entity-lookup.ts`, `intake-surface.ts`,
  `related-presentation.ts`, `lookup-options.ts`, `recent-choice.ts`, `intake-data.ts` collection
  pieces) and parsers that silently ignore them (`governed-workflow.ts`, `record-presentation.ts`,
  `record-360-panel.ts`, `intake.ts`, `runtime-resource.ts`, `index.ts`). For additive descriptor
  surfaces the tolerant behaviour looks deliberate, but it also means an unmodelled server property
  can change meaning without any client error — worth deciding once, package-wide.
- `runtime-resource.ts` also has no length bound on `resources`/`actions`; left unreported because the
  function is currently dead and the endpoint is authenticated.
- Not reviewed per assignment: the Country list/detail request path files, `apps/*/lib/relay.ts`, and
  the React components that consume these contracts (findings above cite them only as impact
  evidence).


# Group G9

# Sweep G9

Group: shell activity center / Atlas assistant / notifications.
All 11 assigned files were read in full. Every evidence quote below was re-verified
with `grep`/`sed` against the current working tree after reading.

## Coverage
| path | lines | verdict |
| --- | --- | --- |
| packages/platform/shell/shell/src/activity-center.tsx | 614 | findings 3 |
| packages/platform/shell/shell/src/activity-counts.ts | 25 | clean |
| packages/platform/shell/shell/src/activity-notification-actions.tsx | 24 | clean |
| packages/platform/shell/shell/src/activity-query-controls.tsx | 752 | findings 1 |
| packages/platform/shell/shell/src/atlas-action-history.tsx | 129 | findings 2 |
| packages/platform/shell/shell/src/atlas-answer.tsx | 404 | findings 1 |
| packages/platform/shell/shell/src/atlas-context-inspector.tsx | 212 | findings 2 |
| packages/platform/shell/shell/src/atlas-panel-resize.tsx | 21 | findings 1 |
| packages/platform/shell/shell/src/atlas-surface.tsx | 12 | clean |
| packages/platform/shell/shell/src/atlas-workspace.tsx | 1071 | findings 6 |
| packages/platform/shell/shell/src/home-personalization.ts | 121 | clean |

## Findings

### [medium] Superseded conversation selection permanently disables the history list
Location: packages/platform/shell/shell/src/atlas-workspace.tsx:98

What is wrong: `pendingThread` is the only guard for the whole conversation list, and it
is cleared in exactly two cases: `atlas.threadsStatus === "error"`, or
`atlas.threadsStatus === "ready" && atlas.threadId === pendingThread`. The shared
controller can neither set an error nor set `threadId` for that id when the load is
superseded (business context changed, or another `ask`/`newConversation` bumped
`conversationVersion`): `selectThread` returns early and leaves `threadsStatus` at
`"loading"`. The effect therefore never fires, `pendingThread` is never reset, every
thread button stays disabled, and the panel keeps rendering "Opening conversation…"
forever.

Evidence:
```tsx
  useEffect(() => {
    if (!pendingThread) return;
    if (atlas.threadsStatus === "error") {
      setPendingThread(undefined);
      return;
    }
    if (atlas.threadsStatus === "ready" && atlas.threadId === pendingThread) {
```
```tsx
                      disabled={!!pendingThread}
```
Supporting context in the shared controller (`packages/platform/ai/agent-ui/src/index.ts:628`, not part of this group):
```ts
        if (
          store.snapshot() !== captured ||
          version !== conversationVersion.current
        )
          return;
```
Impact scenario: In fullscreen (history is a persistent column) the user clicks a
conversation while the record/business-context generation changes (normal navigation),
or in the dock clicks a conversation and then interacts with the page (click-away closes
the overlay) and sends a question. The messages request resolves but is superseded, so
`threadId` never becomes `pendingThread`, `threadsStatus` stays `"loading"`, and the user
is left with "Opening conversation…" and a list in which no conversation can be selected.
Recovery requires knowing to press "New Atlas conversation" (`setPendingThread(undefined)`).

Suggested fix: make the pending selection self-clearing, e.g. clear `pendingThread` when
the controller is no longer loading (`threadsStatus !== "loading"`), when a newer
selection/`ask` supersedes it (track a selection epoch in the workspace and reset on
mismatch), or with a bounded timeout; additionally have `selectThread` reset
`threadsStatus` before its early return.

### [low] Activity filter-chip counts mix a filtered list length with an unfiltered server count
Location: packages/platform/shell/shell/src/activity-center.tsx:299

What is wrong: the "All" chip count is `notifications.length` / `inbox.length`, i.e. the
length of the list that is already filtered by the active query, while the sibling
"Unread"/"Needs attention" chips use `activityCount`, which prefers the explicit
`unreadNotificationCount` / `openInboxCount`. The explicit notification count is computed
server-side without the active filters
(`server/packages/platform/notifications/src/notification-routes.ts:211`
`const unreadCount=await options.inbox.countUnread({...})`). When the scope is
`unread`/`priority` the "All" chip therefore shows the *filtered* number under an "All"
label.

Evidence:
```tsx
                      count:
                        countsReady && !dataSource?.hasMoreNotifications
                          ? notifications.length
                          : undefined,
```
```tsx
                    { value: "unread", label: "Unread", count: unreadCount },
```
Impact scenario: In the legacy (no-collection) drawer path the user switches to "Unread";
the list is already unread-only, so "All" shows the loaded unread page length (e.g. 12)
next to "Unread" showing the unfiltered unread total (e.g. 40). Both numbers claim to
describe the same set and neither matches what clicking the chip will display.

Suggested fix: derive the "All" count from an unfiltered count (or from
`queryInfo.matchingCount` only when no filter is active) and label the count source, or
hide the count while a scope filter is active.

### [low] Activity tab declares a tabpanel id that is never rendered
Location: packages/platform/shell/shell/src/activity-center.tsx:272

What is wrong: `panelId` is passed for both tabs, but only the active tab renders its
panel (`id={`athyper-activity-content-${activeTab}`}`), so the inactive tab's
`aria-controls` always points at a non-existent element.

Evidence:
```tsx
              panelId: `athyper-activity-content-${key}`,
```
```tsx
            id={`athyper-activity-content-${activeTab}`}
```
Impact scenario: With a screen reader, the inactive tab's `aria-controls` reference is
dangling; AT cannot resolve the controlled region (reported as a broken relation and, in
some AT, suppresses the panel announcement after activation).

Suggested fix: render both tabpanels with `hidden` on the inactive one, or only set
`panelId` for the active tab (and use `aria-controls` only then).

### [low] Atlas history tabs and inspector reference regions they do not render
Location: packages/platform/shell/shell/src/atlas-workspace.tsx:345

What is wrong: the inspector toggle sets `aria-controls={inspectorId}` but the `<aside id={inspectorId}>`
is only mounted while `inspectorOpen`; likewise both history tabs declare
`aria-controls={`${id}-panel-${value}`}` while only the active tab's panel id exists.

Evidence:
```tsx
        <button type="button" aria-label={inspectorOpen ? "Hide context panel" : "Show context panel"} aria-expanded={inspectorOpen} aria-controls={inspectorId} onClick={()=>setInspectorOpen(open=>!open)}><InfoIcon size={17}/></button>
```
```tsx
              aria-controls={`${id}-panel-${value}`}
```
```tsx
        id={`${id}-panel-${activeTab}`}
```
Impact scenario: While the inspector is collapsed the toggle's `aria-controls` resolves to
nothing (broken relation); the inactive "Atlas actions"/"Conversations" tab has the same
problem. `aria-expanded` alone still conveys state, so this is non-blocking.

Suggested fix: keep the collapsed panel mounted with `hidden`, or drop `aria-controls`
while the region is absent.

### [low] Dead UI components and unused imports in the activity center
Location: packages/platform/shell/shell/src/activity-center.tsx:599

What is wrong: `NotificationToneGlyph` and `InboxItemGlyph` are defined and never
referenced (`grep -rn "NotificationToneGlyph|InboxItemGlyph" apps packages server tests tooling`
returns only these definitions), which also makes the `CircleCheckIcon`/`ClipboardCheckIcon`
imports dead. `CheckIcon`, `Tooltip` and the `React` namespace import are unused in this
file. `visibleNotifications`/`visibleInbox` are aliases of `notifications`/`inbox`, and the
inner `!dataSource?.collections?.[activeTab]` test inside the toolbar repeats its own
enclosing condition.

Evidence:
```tsx
function NotificationToneGlyph({
```
```tsx
function InboxItemGlyph() {
  return <ClipboardCheckIcon />;
}
```
```tsx
  const visibleNotifications = notifications, visibleInbox = inbox;
```
```tsx
          {!dataSource?.collections?.[activeTab] ? <FilterChipGroup
```
Impact scenario: Dead branches and imports hide the real success/error icon logic that the
notification tone data (`tone?: ShellNotificationTone`) was designed for, and they make the
unused-import surface of the shell module harder to trust.

Suggested fix: delete `NotificationToneGlyph`, `InboxItemGlyph` and the unused imports/aliases,
or wire the tone glyph into `ActivityNotificationRow` if that was the intent.

### [low] Unused `useMemo` import and dead `planeName` prop in AtlasWorkspace
Location: packages/platform/shell/shell/src/atlas-workspace.tsx:30

What is wrong: `useMemo` is imported but never used in the file, and `planeName` is required
by `AtlasWorkspaceProps`, destructured, and then never read. The only caller
(`packages/platform/shell/shell/src/client.tsx:639`) still passes it.

Evidence:
```tsx
import { useEffect, useMemo, useRef, useState } from "react";
```
```tsx
  readonly planeName: string;
```
```tsx
  mode,
  planeName,
  currentPath = "/home",
```
Impact scenario: Callers believe `planeName` (application/plane identity) is surfaced or
scoped by the workspace; it is silently ignored, and any future code relying on it would
have to guess which plane Atlas is running in.

Suggested fix: remove `planeName` (and the `client.tsx` argument) or use it in the
workspace/inspector labels.

### [low] Unused `import * as React` in five shell modules
Location: packages/platform/shell/shell/src/atlas-panel-resize.tsx:2

What is wrong: these client modules use the automatic JSX runtime
(`tooling/config/tsconfig-react.json` sets `"jsx": "react-jsx"`) and never reference the
React namespace, so the namespace import is dead: `atlas-panel-resize.tsx:2`,
`atlas-answer.tsx:3`, `atlas-action-history.tsx:2`, `atlas-context-inspector.tsx:2`
(and `activity-center.tsx:27`, covered above). `grep -c "React\."` returns 0 for each file.

Evidence:
```tsx
import * as React from "react";
```
Impact scenario: None at runtime; it is dead module surface that hides intended React
namespace usage (e.g. `React.useId`) and inflates the import graph reviewers must trust.

Suggested fix: delete the unused namespace imports (keep the named hook imports).

### [low] Conversation age renders as "NaN days ago" for an unparsable timestamp
Location: packages/platform/shell/shell/src/atlas-workspace.tsx:890

What is wrong: `relativeDate` does not guard the result of `parseInstant`; for a value the
temporal parser rejects it returns `Number.NaN`
(`packages/platform/foundation/temporal/src/index.ts:14 return Number.NaN;`), so
`days` is `NaN` and the fallback template prints `"NaN days ago"`. The controller parses
`updatedAt` with `textValue` only, so a malformed thread timestamp reaches this function.

Evidence:
```tsx
function relativeDate(value: string): string {
  const elapsed = Date.now() - parseInstant(value),
    days = Math.floor(elapsed / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}
```
Impact scenario: A thread whose `updatedAt` is not an accepted instant renders
"NaN days ago" in the conversation list instead of a neutral label.

Suggested fix: return "" or "Recently" when `!Number.isFinite(elapsed)`.

### [low] Unvalidated audit timestamps render as "Invalid Date"
Location: packages/platform/shell/shell/src/atlas-action-history.tsx:55

What is wrong: the action-history parser validates `createdAt` only as a non-empty string
(`textValue`), and the view formats it with `new Date(...).toLocaleString(...)`, which
yields the literal text "Invalid Date" for a malformed value (no throw, so the
`AtlasActionHistory` status/error branches never fire).

Evidence:
```tsx
              <time dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString(undefined, {
```
Impact scenario: A single malformed audit row prints "Invalid Date" in the governed
action list; the user cannot tell whether the record is corrupt or the UI is broken.

Suggested fix: validate the instant in `parseActionHistory` (or guard here) and omit the
`<time>` element when the value is not a parseable instant.

### [low] History tab re-loads without an in-flight guard (overlapping responses)
Location: packages/platform/shell/shell/src/atlas-workspace.tsx:530

What is wrong: every activation of the "Atlas actions" history tab calls
`atlas.loadHistory()`; that controller method (agent-ui) has no abort/epoch and writes
`history`/`historyStatus` with plain `setState`, so two overlapping loads are last-write-wins
plus a "Loading…" flash. An earlier, slower response can overwrite the newer list.

Evidence:
```tsx
  const choose = (next: "conversations" | "actions") => {
    setTab(next);
    if (next === "actions") void atlas.loadHistory();
  };
```
Impact scenario: Toggling between Conversations and Atlas actions twice quickly issues
overlapping requests; the list and its status can reflect the older request after the
newer one has already rendered.

Suggested fix: skip the call while `atlas.historyStatus === "loading"` and/or pass an
`AbortSignal`, or have the controller guard with an epoch (same pattern already used by
`selectThread`).

### [low] Legacy browser view entries are trusted as `{name, query}[]` without validation
Location: packages/platform/shell/shell/src/activity-query-controls.tsx:89

What is wrong: the array read from `localStorage` is only checked with `Array.isArray` and
then cast to `{ name: string; query: unknown }[]`. Element shape, `name` type/length and
uniqueness are never validated, yet `v.name` is sent to the view-create command and
`v.name`/`v.query` are echoed in the import UI.

Evidence:
```tsx
      const value = JSON.parse(localStorage.getItem(legacyKey) ?? "[]");
      if (Array.isArray(value)) setLegacy(value.slice(0, 30));
```
```tsx
                  importKey:JSON.stringify([v.name,state]),
```
Impact scenario: A corrupted or hand-edited draft key yields entries like `123` or
`{name: {}}`; the loop then posts `name: undefined`/an object to the views endpoint, the
import fails mid-list, and the error is reported as a generic "Reload views and try again"
while the remaining entries stay in storage.

Suggested fix: map/filter the parsed array through a validator (string name, bounded
length, object query) and drop invalid entries before `setLegacy`.

### [low] href validation accepts tab/newline, enabling protocol-relative navigation
Location: packages/platform/shell/shell/src/atlas-context-inspector.tsx:36

What is wrong: the "safe local href" pattern used for record links checks only
`startsWith("/")`, `!startsWith("//")` and `!includes("\\")`. Browsers strip ASCII tab and
newline characters from URLs before parsing, so a value such as `"/\t/evil.example"` passes
these checks and is then resolved as `//evil.example` (a different origin). The same
pattern is used for the `from` query parameter that feeds this prop.

Evidence:
```tsx
  const safeHref =
    recordHref?.startsWith("/") &&
    !recordHref.startsWith("//") &&
    !recordHref.includes("\\")
      ? recordHref
      : undefined;
```
```tsx
        {safeHref ? <a href={safeHref}>Open record</a> : null}
```
```tsx
    if (from?.startsWith("/") && !from.startsWith("//")) setEffectivePath(from);
```
Impact scenario: `/atlas?from=/%09/attacker.example` (decoded by `URLSearchParams` to a tab)
becomes the `recordHref` when the fullscreen workspace has a record context bound, and the
inspector renders an "Open record" link that navigates to an attacker-controlled origin —
an open-redirect/phishing vector that leaves the authenticated app. The identical bypass
exists for the breadcrumb hrefs taken from `sessionStorage`.

Suggested fix: reject control/whitespace characters (`/[\u0000-\u0020]/.test(value)`) and
resolve through `new URL(value, window.location.origin)`, requiring the result's origin to
equal the app origin before rendering.

## Checked and clean
- packages/platform/shell/shell/src/activity-counts.ts:11 - "missing/partial count is not zero" is implemented correctly: loading, global error, per-tab error and negative/non-integer explicit counts all return `undefined`, and the filtered-list fallback is gated on `!hasMore*`; verified against `countUnread` in the notification route.
- packages/platform/shell/shell/src/activity-notification-actions.tsx:21 - `!(activityCount(data, "notifications")! > 0)` is ugly but semantically right: `undefined > 0` and `0 > 0` are both false, so "Mark all read" is disabled while the count is unknown or zero.
- packages/platform/shell/shell/src/activity-center.tsx:140 - matchMedia listener, ResizeObserver and the rAF handle are all released in the effect cleanups; no unbounded observer/listener leak and no interval polling in this file.
- packages/platform/shell/shell/src/activity-center.tsx:158 - `dataSource?.queries?.notifications.read` cannot throw in practice: the only producer (`activity-center-data`) always initialises both keys and the type is `Record<ShellActivityTab, ActivityQuery>`.
- packages/platform/shell/shell/src/activity-center.tsx:254 - i18n keys `panel.pin`, `panel.unpin`, `panel.notificationsScope`, `panel.inboxScope`, `panel.currentTenant` all exist in `messages.ts` and the collaboration catalog; no missing-key fallback.
- packages/platform/shell/shell/src/activity-query-controls.tsx:109 - the preview effect is safe against request loops: a 300 ms debounce plus `AbortController` on every re-run, `signal.aborted` guards in `then`/`catch`, and `onPreviewQuery` is a `useCallback` in `activity-center-data` (stable identity).
- packages/platform/shell/shell/src/activity-query-controls.tsx:93 - the global "/" shortcut removes its document listener on unmount and excludes INPUT/SELECT/TEXTAREA/contentEditable targets.
- packages/platform/shell/shell/src/activity-query-controls.tsx:209 - I suspected `same()` (order-sensitive `JSON.stringify`) would always fail for server-round-tripped views because `state_json` is `jsonb` (reordered keys). It holds: the views GET re-validates every view through `descriptor.validate` (`parseCollectionState`) and `parseCollectionConfiguration` normalises `defaultState`, so both sides of the comparison share one key order.
- packages/platform/shell/shell/src/atlas-answer.tsx:118 - `useId` and all other hooks run before the `parseAtlasAnswerEnvelope` early return; no conditional-hook violation.
- packages/platform/shell/shell/src/atlas-answer.tsx:144 - the "could not be verified" path is reachable for invented references, and `authority={{insight, evidenceIds: [], actionIds: []}}` in `AtlasOwnerAssessment` is valid because `parseAtlasAnswerEnvelope` also allows the insight's own evidence ids (contract `answer.ts:81`).
- packages/platform/shell/shell/src/atlas-answer.tsx:288 - source links use `preventDefault`, open the matching `<details>` and move focus to its `summary`; ids are `record:i`/`attachment:i` and insight evidence ids must be unique per parser, so `key={source.id}` cannot collide.
- packages/platform/shell/shell/src/atlas-context-inspector.tsx:116 - the answer picker labels wrap their `<select>`, falls back to the latest completed answer if `selectedId` disappears, and renders no dangling selection.
- packages/platform/shell/shell/src/atlas-panel-resize.tsx:6 - keyboard support is complete (`ArrowLeft/Right`, `Home`, `End`), role/ARIA match the window-splitter pattern, bounds (360-560) match `client.tsx`, and pointer capture is released on pointerup; there are no listeners or timers to clean up, and `pointercancel` only ends the gesture (capture is released implicitly, `releasePointerCapture` is a no-op for an active pointer).
- packages/platform/shell/shell/src/atlas-surface.tsx:3 - context and hook are both defined and consumed (`client.tsx` provides, `home.tsx` and `atlas-workspace.tsx` consume); nothing dead here (the value object is recreated per render in `client.tsx`, which is outside this group).
- packages/platform/shell/shell/src/atlas-workspace.tsx:119 - `useEffect(() => atlas.mountWorkspace?.(), ...)` is intentional: the controller contract is `mountWorkspace(): () => void`, so the returned value *is* the owner-cleanup.
- packages/platform/shell/shell/src/atlas-workspace.tsx:142 - Escape closing the history before the workspace is deliberate and covered by `tests/foundation/atlas-history-interactions.test.tsx` ("dismisses outside and with Escape before closing the workspace"), including focus restore to the history trigger.
- packages/platform/shell/shell/src/atlas-workspace.tsx:191 - the sessionStorage breadcrumb handoff is keyed by plane/tenant/principal (`personalizationScope.storageKey`), expires after 300 s and is only applied when entity *and* record id match; no cross-record or cross-tenant breadcrumb leak.
- packages/platform/shell/shell/src/atlas-workspace.tsx:428 - message keys use `messageId`, result keys are positional per message, and action/action-receipt keys use `proposalId`; duplicate submission is prevented by `actionBusy`/`status !== "proposed"` in `transitionAction`, so no duplicate receipt key is reachable.
- packages/platform/shell/shell/src/atlas-workspace.tsx:933 - feedback/vocabulary receipts are idempotent on retry (same `crypto.randomUUID` until the category/verdict or phrase changes) and the status paragraphs are permanently mounted live regions, so announcements work; matches the retry test.
- packages/platform/shell/shell/src/atlas-workspace.tsx:82 - the un-cancelled `requestAnimationFrame` can only focus after mount (the ref is nulled on unmount), so it cannot act on a detached node.
- packages/platform/shell/shell/src/home-personalization.ts:37 - `DEFAULT_HOME_PERSONALIZATION` is deeply frozen module state and every mutator returns a new frozen object; no shared object is mutated in place.
- packages/platform/shell/shell/src/home-personalization.ts:97 - `parseHomePersonalization` bounds the interaction cache to 100 entries, drops unsafe hrefs, and validates visits/instants, so a hostile localStorage blob cannot grow without limit.
- packages/platform/shell/shell/src/home-personalization.ts:54 - `recommendHomeItems` maps/filters/sorts a fresh array (no prop mutation), caps visit weight and clamps `limit`; `isHomeItemAllowed` passes `navigation: "secondary"`, which only affects presentation ("available" vs "hidden") and not authorization in `decideRouteAccess`.

## Notes
- The shared unused-import finding (atlas-panel-resize.tsx:2) also applies to
  atlas-answer.tsx:3, atlas-action-history.tsx:2, atlas-context-inspector.tsx:2 and
  activity-center.tsx:27; the coverage verdict counts it per affected file.
- No polling exists in the assigned files (grep for `setInterval`/`setTimeout` finds only the
  300 ms preview debounce). The activity/notification bell trigger, its `aria-controls="athyper-activity-center"`
  (which dangles while the drawer is closed) and the notification count/refresh logic live in
  `packages/platform/shell/shell/src/shell-header-actions.tsx` and
  `packages/platform/shell/shell/src/activity-center-data/src/index.ts`, which are outside this
  group's file list, so the "polling that never stops" and "notification count drift" angles for
  those producers were not reviewed here beyond what is visible from the assigned files.
- Cross-file evidence was used only to confirm or reject suspicions in the assigned files
  (`agent-ui` controller, `contracts/platform/activity`, the notifications route, and the
  action-history parser); no unassigned file is claimed as owned by this review.
- Verification method: all cited lines were re-read with `read`/`sed` and identifier usage was
  confirmed with `grep -rn` over `apps packages server tests tooling` after the working-tree
  edits.


# Group G10

# Sweep G10

Group: collection-controls, content-ui, workflow-ui, cascade, authoring/metadata-client.

## Coverage
| path | lines | verdict |
| --- | --- | --- |
| packages/platform/entity/runtime/collection-controls/src/filter-editor.tsx | 695 | findings 6 |
| packages/platform/entity/runtime/collection-controls/src/filter-state.ts | 69 | findings 1 |
| packages/platform/entity/runtime/collection-controls/src/index.tsx | 114 | clean |
| packages/platform/entity/runtime/content-ui/src/index.ts | 0 | clean |
| packages/platform/entity/runtime/workflow-ui/src/index.ts | 0 | clean |
| packages/platform/entity/runtime/cascade/src/index.ts | 0 | clean |
| packages/platform/entity/authoring/metadata-client/src/index.ts | 0 | clean |

## Findings

### [high] Filter editor offers 8 relative periods that the entity list API rejects with HTTP 400
Location: packages/platform/entity/runtime/collection-controls/src/filter-editor.tsx:205-232
What is wrong: `RELATIVE_DATE_GROUPS` exposes 17 relative periods, but the HTTP admission check used by the entity list route accepts only 9 values. The client sends the relative value verbatim, so the other 8 periods make `GET /api/entity-runtime/:entityCode/list` fail with `INVALID_FILTER`. The UI's own validator (`filterValidationError`) accepts them because it only checks membership in `RELATIVE_DATE_GROUPS`, so Apply is enabled and the failure happens server side.
Evidence - the eight unsupported option lines inside `RELATIVE_DATE_GROUPS` (lines 205-232; group/optgroup lines omitted, each quoted line is verbatim from the file):
```
208:      { value: "last_90_days", label: "Last 90 days" },
211:      { value: "next_90_days", label: "Next 90 days" },
222:      { value: "this_quarter", label: "This quarter" },
228:      { value: "last_365_days", label: "Last 365 days" },
229:      { value: "next_365_days", label: "Next 365 days" },
230:      { value: "last_year", label: "Last calendar year" },
231:      { value: "this_year", label: "This year" },
232:      { value: "next_year", label: "Next calendar year" },
```
The entity list route (`server/packages/services/records/src/entity-list-routes.ts:97-117`) spreads `parseRecordListParameters` into its handler, and that parser admits only:
```
const RELATIVE_DATE_VALUES = new Set(["today", "yesterday", "tomorrow", "last_7_days", "last_30_days", "next_7_days", "next_30_days", "this_week", "this_month"]);
...
if (operator === "relative" && (typeof parsed["value"] !== "string" || !RELATIVE_DATE_VALUES.has(parsed["value"]))) throw new RecordServiceError(400, "INVALID_FILTER", `filter[${index}].value is not a supported relative date`);
```
(server/packages/services/records/src/records-routes.ts:53 and :92.) The client puts the raw filter JSON into the query string: `...(state.filters.length ? { filter: Object.freeze(state.filters.map((filter) => JSON.stringify(filter))) } : {})` (packages/platform/foundation/api-client/src/entity-list.ts:62). The other two copies of this list disagree with the admission set and agree with the UI: `server/packages/services/records/src/filter-value-validation.ts:4` and `packages/contracts/platform/collection/src/index.ts:233-255` both accept all 17.
Impact scenario: On the Country list (or any list with a date/datetime filter), a user opens Filters, chooses "Relative period", picks "Last 90 days", and applies. The list request is rejected with 400 INVALID_FILTER, so the list shows a transport error / no rows instead of results. The same value is persisted in session storage and the URL, so the failure repeats on reload until the filter is removed. The same short list of admitted values also means `last_90_days` etc. can never work from a saved view or shared link.
Suggested fix: keep one source of truth. Either extend `RELATIVE_DATE_VALUES` in records-routes.ts to the 17 values that `validateFilterValue` and the repository already support, or restrict `RELATIVE_DATE_GROUPS` to the 9 admitted values (ideally exporting the supported set from the entity-list contract and using it in both places).

### [low] Validation error is not associated with the choice, date-set, or option-select controls
Location: packages/platform/entity/runtime/collection-controls/src/filter-editor.tsx:571-619
What is wrong: `FilterValueEditor` computes `errorId` and wires `aria-invalid` / `aria-describedby` only on the two `Input` branches. The `ChoicePicker` (searchable reference/choice filters), the plain `<Select>` option branch, and `DateSetPicker` render the error `<small id={errorId} role="alert">` without any control pointing at it, so the message is announced once but is not tied to the field.
Evidence:
```
      <Select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
```
(lines 592-595; the `DateSetPicker` at 610-619 and `ChoicePicker` at 572-586 are the same), versus the wired branches `aria-invalid={!!error}` / `aria-describedby={error ? errorId : undefined}` (lines 548-549, 563-564, 626-627). `SearchableSelect` already accepts both props (`readonly describedBy?: string;` at packages/platform/foundation/ui/src/searchable-select.tsx:146 and `readonly "aria-invalid"?: React.AriaAttributes["aria-invalid"];` at :155) but `ChoicePicker` never passes them.
Impact scenario: A screen-reader user filters countries by an invalid reference value; the alert is announced while typing, but when they tab back to the field there is no `aria-describedby` link and no `aria-invalid`, so the field does not report why it is invalid.
Suggested fix: give `ChoicePicker` `describedBy` / `ariaInvalid` props and forward them to `SearchableSelect`; pass `aria-invalid={!!error}` and `aria-describedby={error ? errorId : undefined}` to the option `<Select>`; thread the same id into `DateSetPicker`.

### [low] `filterValueFromInput` can return `NaN`, which is not a `JsonValue`
Location: packages/platform/entity/runtime/collection-controls/src/filter-state.ts:24
What is wrong: numeric coercion is unconditional and unguarded, so text that is not a number becomes `NaN` even though the declared result is `JsonValue | undefined`.
Evidence:
```
  const convert = (value: string): JsonValue => {
    if (!value) return "";
    const option = options?.find((item) => String(item.value) === value);
    if (option) return option.value;
    if (
      valueKind === "integer" ||
      valueKind === "decimal" ||
      valueKind === "money"
    )
      return Number(value);
```
Impact scenario: `FilterValueEditor` renders a free-text input for `in` on a numeric field (line 623: `type={operator === "in" ? "text" : type}`), so "abc" is typeable. Callers that pre-validate (list-view applies only after `filterValidationError`) are safe, but `packages/platform/shell/shell/src/activity-query-controls.tsx:303-313` converts on every keystroke without validation: `NaN` enters filter state, `JSON.stringify` turns it into `null` in any persisted/encoded state, and `parseCollectionState` throws "Filter number must be finite" (packages/contracts/platform/collection/src/index.ts:231-232). The user gets a raw contract error instead of the editor's inline message.
Suggested fix: return the trimmed string (or `undefined`) when `Number.isFinite(Number(value))` is false, leaving validation to the caller, or reject the conversion explicitly.

### [low] Clear-recent logic duplicated inline instead of reusing `clearRecent`
Location: packages/platform/entity/runtime/collection-controls/src/filter-editor.tsx:525-530 and 682-687
What is wrong: the same storage-removal + re-render bump exists twice; the inline copy loses the `historyKey` guard the named helper has.
Evidence:
```
  const clearRecent = () => {
    try {
      removeBrowserStorage(`${historyKey}.${field.key}`, "session");
    } catch {}
    setHistoryVersion((version) => version + 1);
  };
```
and
```
            onClick={() => {
              try {
                removeBrowserStorage(`${historyKey}.${field.key}`, "session");
              } catch {}
              setHistoryVersion((version) => version + 1);
            }}
```
Impact scenario: a future change to the recent-choice storage key (or an added guard) will be applied to one copy only, and the two clear paths will silently diverge.
Suggested fix: call `clearRecent` from the button (only reachable when `historyKey` is set because `recent` is empty otherwise).

### [low] `"in"` in the plain option-select branch is dead code
Location: packages/platform/entity/runtime/collection-controls/src/filter-editor.tsx:587-590
What is wrong: that branch is only reachable for `eq`/`ne`; the `"in"` operand can never satisfy the condition.
Evidence:
```
  else if (
    ["eq", "ne", "in"].includes(operator) &&
    (field.filterOptions?.length || field.valueKind === "boolean")
  )
```
For `operator === "in"` with options or a boolean, `multiple` is `true` at lines 521-523, so `choicePresentation` returns `"searchable"` (packages/platform/foundation/ui/src/choice-presentation.ts:9) and the earlier `else if (searchable)` branch at line 572 always wins; with no options the second half of the condition is false. A single `<select>` could not represent the multi-value `in` filter anyway.
Impact scenario: none at runtime; it is misleading dead intent that invites a future edit to "support" `in` here (which would silently collapse multi-value filters).
Suggested fix: drop `"in"` from the array.

### [low] `between` value is silently truncated to two parts
Location: packages/platform/entity/runtime/collection-controls/src/filter-editor.tsx:537
What is wrong: the editor splits the serialized range with a limit of 2 and then rewrites the whole value from only those two parts on the next edit.
Evidence:
```
    const [from = "", to = ""] = value.split(",", 2);
...
              onChange(`${from.trim()},${event.currentTarget.value}`)
```
(lines 537 and 566; the From input at 550-552 does the same). Nothing in the URL decoder enforces the two-bound arity (`parseState` only calls `json(item.value, ...)`, packages/contracts/platform/entity-list/src/parsers.ts:734-744), so a state carrying `["a","b","c"]` renders as "a, b" and loses `c` as soon as either bound is edited.
Impact scenario: a shared link or saved state whose between filter was serialized with an extra part is displayed incorrectly and silently reduced to two bounds on the first keystroke, which is then applied as a different filter than the one that was loaded.
Suggested fix: keep the full split (`value.split(",")`) and ignore/flag the extra parts, or have the decoder reject non-two-part `between` values so the editor never receives one.

### [low] `relativePeriodDescription` is exported but has no consumer outside its module
Location: packages/platform/entity/runtime/collection-controls/src/filter-editor.tsx:238
What is wrong: the function is part of the shared package's public API via the barrel re-export, but the only caller is `RelativeDatePicker` in the same file.
Evidence:
```
export function relativePeriodDescription(value: string): string | undefined {
```
`export * from "./filter-editor";` (packages/platform/entity/runtime/collection-controls/src/index.tsx:17) publishes it. Checked with `grep -rn "relativePeriodDescription" apps packages server --include=*.ts --include=*.tsx`: the only source hits are filter-editor.tsx:238 (definition) and :268 (internal use); every other hit is a `.next` build artifact under apps/*/.next.
Impact scenario: none functionally; it widens the shared API surface and freezes a description format that no other package needs.
Suggested fix: remove the `export` (keep the function internal).

## Checked and clean
- filter-editor.tsx:326-331 - the only effect in the file flips a `mounted` ref and returns a cleanup; no timers, intervals, listeners, observers, or object URLs are created anywhere in this file, so there is nothing else to leak.
- filter-editor.tsx:332-352 - `openChoices` is de-duplicated by `pending.current` and its `.catch`/`.finally` only call `setState` when `mounted.current` is true (no setState after unmount); the in-flight request itself is abortable by the provider (list-view `filterChoiceControllers`, list-view/src/index.tsx:692-707).
- filter-editor.tsx:471-499 - `useId` and `useState` run before the `is_null`/`is_not_null` early return, so hook order stays identical when the operator changes (no conditional hooks).
- filter-editor.tsx:490-491 - recent choices are filtered by the active operator, and `recent.length && !searchable ? ... : null` is a ternary, so a zero length renders `null` rather than a stray `0`.
- filter-editor.tsx:51-74 - persisted recent entries are re-validated on read (`field.filterOperators.includes(item.operator)` plus `filterValidationError`), so tampered/corrupt session storage cannot inject an unsupported operator or value; capped at 5 per field.
- filter-editor.tsx:188-196 - reversed `between` ranges and numeric/temporal ordering are rejected, and the temporal check catches rollover dates (`date.toISOString().slice(0,10) !== value.slice(0,10)`).
- filter-editor.tsx:199-235 - `RELATIVE_DATE_GROUPS` freezes the outer array, every group object, and every options array (`Object.freeze` at each level), so the module-level constant cannot be mutated in place by consumers (the individual option objects are not frozen, but nothing mutates them).
- filter-editor.tsx:266-296 - `RelativeDatePicker` points `aria-describedby` at the description id only when that element is rendered, so the reference is never dangling.
- filter-editor.tsx:353-363 - the boolean/reference option list is memoized on `[field.filterOptions, field.valueKind]` and rebuilt only when the catalogue or kind changes.
- filter-state.ts:7-43 - round trip for date/datetime was checked: `filterValueFromInput` stores UTC ISO for `datetime`, `filterInputValue` renders local `YYYY-MM-DDTHH:MM` (seconds/ms only when non-zero) and truncates `date` to 10 chars, so load/edit/apply is lossless at minute precision.
- filter-state.ts:35-41 - the frozen array results are safe: no caller mutates filter values in place (`grep -rn "\.value\.push|\.value\.sort|\.value\.reverse|\.value\.splice|filters\.sort|filters\.push" packages/platform/entity/runtime packages/platform/shell/shell/src` returns no hits), and JSON serialization of frozen arrays is fine.
- index.tsx:37-40 - `useRef`/`useState` are called before `if (!current) return null;`, so the early return cannot change hook order.
- index.tsx:92-94 - the visually hidden `role="status"` region announces the active control group when it changes.
- index.tsx:95-107 - sections are keyed by the option key and only mounted once visited, then kept mounted with `hidden` + `inert` (React 19 boolean `inert`) so drafts survive tab switches; the registry guarantees unique keys.
- index.tsx:50-91 - the menu trigger has an explicit accessible name that includes the current section, and focus is returned to it after a selection (`selector.current?.querySelector<HTMLButtonElement>("button")?.focus()`), so no focus is dropped.
- index.tsx:112-114 - `CollectionDraftFooter` disables Apply on `!dirty || !!error || applyDisabled` and exposes the error in a `role="alert"` inside the footer summary; no stale or unguarded state.
- index.tsx:19-40 - the placeholder risk in `current = options.find(...) ?? options[0]` is bounded: the rendered sections are selected from the same `current.key`, so header and content cannot disagree.

## Notes
- packages/platform/entity/runtime/content-ui/src/index.ts, .../workflow-ui/src/index.ts, .../cascade/src/index.ts and packages/platform/entity/authoring/metadata-client/src/index.ts are byte-identical placeholders: a UTF-8 BOM plus `export {};` with no line terminator (`wc -l` = 0, 13 bytes). No source file imports any of the four package names - `grep -rn "platform-entity-content-ui|platform-entity-workflow-ui|platform-entity-cascade|platform-entity-metadata-client" apps packages server` matches only their own package.json files and the docs ownership matrix / a build log under apps/docs-internal. They are dead published packages with zero consumers; I did not treat the empty files themselves as defects.
- packages/platform/entity/runtime/collection-controls/src/index.tsx:2 imports the `React` default binding but never references it (only `ReactNode`/`ComponentType` are used, and `jsx: "react-jsx"` is configured). `noUnusedLocals` is not enabled in tooling/config/tsconfig-base.json, so this is a harmless dead import rather than a typecheck failure - too minor for a finding.
- filter-state.ts:24 also coerces `contains`/`starts_with` on numeric value kinds to a number, which the records route would reject (`filter[N].value must be a string`). I could not find a reachable path: numeric fields are not published with those operators (`entityFieldFilterOperators`, server/packages/contracts/metadata/src/descriptors.ts:44-55, and configured operators are re-validated against it at server/packages/platform/metadata/src/descriptor-parser.ts:270-274), so this stays latent.
- `readRecent` drops remembered values for reference fields while `filterOptions` is still unloaded, because `filterValidationError` returns "Reference choices are unavailable." for them; recent reference choices therefore only appear after the catalogue loads. Cosmetic inconsistency with `rememberFilters`, not a defect I raised.
- Recent filter values are persisted in `sessionStorage` (max 5 per field, 1024 chars per entry, keyed by plane/entity/scope fingerprint). Values are raw input or reference codes and the store is tab-scoped, so I did not classify this as a PII/localStorage leak; flagging it in case the security reviewer wants a policy decision on confidential/PII-classified fields.
- I could not execute builds, tests, or the app (read-only review), so the end-to-end 400 in the high finding is established from source only: route registration at server/packages/services/records/src/entity-list-routes.ts:97-117 (`contracts.list`, path `/api/entity-runtime/:entityCode/list` at :374), admission at records-routes.ts:53/92, client serialization at packages/platform/foundation/api-client/src/entity-list.ts:62.
- packages/platform/entity/runtime/list-view/src/index.tsx changed while I was reading it (5703 -> 5666 -> 5680 lines). All list-view/server citations above were re-grepped after the change, but that file belongs to another reviewer.
- I did not deep-review the files owned by the other reviewer (list-view/src/index.tsx, form-detail/*, apps/*/lib/relay.ts) beyond what was needed as evidence for the findings above.


# Group G11

# Sweep G11

## Coverage
| path | lines | verdict |
| --- | --- | --- |
| packages/contracts/platform/entity-list/src/types.ts | 356 | findings 6 |

## Findings

### [medium] Saved-view `state` is typed as a complete `SaveableListStateV1`, but the wire payload can be `{}`
Location: packages/contracts/platform/entity-list/src/types.ts:342
What is wrong: `EntitySavedView.state` is required and fully populated (`filters`, `sort`, `columns`, `density`, `mode` are all required by `SaveableListStateV1`). The views endpoint explicitly returns `state: {}` for every view whose stored state fails descriptor validation, together with `compatible: false`. The client response parser for that endpoint copies the field with an unchecked `as` cast, so such a view reaches typed code as a complete state while `filters`, `sort`, `columns`, `density` and `mode` are `undefined` at runtime. `compatible` is the only discriminator, and nothing in the type forces a consumer to test it.
Evidence: `  readonly state: SaveableListStateV1;` (types.ts:342). Cross-file, verified current: `              return { ...view, state: {}, compatible: false };` (server/packages/platform/preferences/src/entity-views-routes.ts:111) and `state:view.state as EntityViewCatalog["views"][number]["state"]` (packages/platform/foundation/api-client/src/entity-list.ts:112).
Impact scenario: A shared/personal view saved before a column or filter field was removed fails `descriptor.validate`, so it is served as `{compatible: false, state: {}}`. Any consumer that reads `view.state.filters` / `view.state.columns` (the compiler guarantees arrays) gets `undefined` and fails with `TypeError: undefined is not iterable` or `.map of undefined`. Today's call sites happen to guard (`packages/platform/entity/runtime/list-view/src/preferences.ts:52,55` keep only `view.compatible`; `packages/platform/entity/runtime/list-view/src/index.tsx:3598-3603` substitutes the descriptor default state for incompatible rows), so the defect is latent rather than a live crash — but the guard is per-call-site convention, not a type invariant, and the unchecked cast means no contract test catches the drift.
Suggested fix: Model the flag as a discriminated union, e.g. `{ readonly compatible: true; readonly state: SaveableListStateV1 } | { readonly compatible: false; readonly state?: Partial<SaveableListStateV1> }`, or type `state` as `Partial<SaveableListStateV1>`/`unknown`, and have `parseViewCatalog` validate each view state with `parseSaveableListState` instead of casting.

### [low] Dead row/result contract surface that no producer emits and no consumer reads
Location: packages/contracts/platform/entity-list/src/types.ts:276 (also 294, 298, 300)
What is wrong: `EntityListRowV1.decoration` (and its three members), `pagination.previousCursor`, `pagination.totalAsOf` and `EntityListResultV1.facets` are declared and runtime-validated by `parseEntityListResult`, but nothing in the repo ever produces or reads them.
Evidence: `  readonly decoration?: {` / `    readonly commentCount?: number;` / `    readonly hasOpenComment?: boolean;` / `    readonly bookmarked?: boolean;` (types.ts:276-279); `    readonly previousCursor?: string;` (types.ts:294); `    readonly totalAsOf?: string;` (types.ts:298); `  readonly facets?: Readonly<` (types.ts:300).
Greps run (apps, packages, server, tests, `--include=*.ts --include=*.tsx`): `hasOpenComment|commentCount|decoration` → only `parsers.ts` (the parse branches at 546-593) and an unrelated `server/db/scripts/checks/ddl/archetypes.ts`; `\.facets` → only activity-center/notification payload types, never `EntityListResultV1`; `previousCursor` → zero hits outside `parsers.ts`/`types.ts`; `totalAsOf` → zero hits outside `parsers.ts`/`types.ts`. The server list result builder hardcodes `hasPrevious: false`, never emits a previous cursor, facets, or `totalAsOf`, and never adds `decoration` (server/packages/services/records/src/entity-list-service.ts:675-679 and 698-712).
Impact scenario: The contract advertises page decoration (comment counts/open-comment/bookmark), facet counts, backward cursors and as-of totals that can never arrive. Consumers, tests and reviewers must treat four shapes as load-bearing optional members, and the parser carries hardening code for them (`parseBucketsByField` at parsers.ts:1047-1057 exists only for `facets`).
Suggested fix: Delete the unused members and their parser branches, or add the producing server behavior deliberately and document which side owns it.

### [low] `serverViews?: boolean` admits a value the parser normalizes away
Location: packages/contracts/platform/entity-list/src/types.ts:208
What is wrong: The canonical descriptor parser writes `serverViews` only when the input is exactly `true`, so `false` and "absent" become the same value (`undefined`). The declared type is `boolean`, which promises the `false`/`undefined` distinction that the parser destroys; a server or fixture that sets `serverViews: false` loses it on any parse round-trip.
Evidence: `  readonly serverViews?: boolean;` (types.ts:208) vs `    ...(record.serverViews === true ? { serverViews: true } : {}),` (packages/contracts/platform/entity-list/src/parsers.ts:231). All consumers test truthiness only: `packages/platform/entity/runtime/list-view/src/index.tsx:745,3600,3681,3688` and `packages/platform/entity/runtime/list-view/src/lookup-directory.ts:87`.
Impact scenario: A component that wants "explicitly off" vs "unset" (e.g. to override a default) cannot rely on the type; `descriptor.serverViews === false` is dead logic, and a fixture written as `serverViews: false` silently behaves as unset when it passes through `parseEntityListDescriptor` (server/packages/services/records/src/entity-list-service.ts:1002 always emits `true`, so today this is contract-width only).
Suggested fix: Type it `readonly serverViews?: true` (matching what the parser can emit) or have the parser preserve `false` explicitly; keep the two representations consistent.

### [low] Parser-guaranteed fields declared optional
Location: packages/contracts/platform/entity-list/src/types.ts:118 (also 334)
What is wrong: `parseListLocationState` always emits `pageSize` — either the validated request value or `rules.defaultPageSize` — so every parsed location state has it, yet `ListLocationStateV1.pageSize` is optional. `parseEntityApplicationDescriptor` likewise always emits `navigation` (possibly `[]`), while `EntityApplicationDescriptorV1.navigation` is optional.
Evidence: `  readonly pageSize?: number;` (types.ts:118) and `  readonly navigation?: EntityListDescriptorV1["navigation"];` (types.ts:334); parser: `    ...(pageSize !== undefined && rules.allowedPageSizes.has(pageSize)` / `      : { pageSize: rules.defaultPageSize }),` (packages/contracts/platform/entity-list/src/parsers.ts:835-837) and `    navigation: parseEffectiveEntitySections(value.navigation ?? []),` (packages/contracts/platform/entity-list/src/parsers.ts:1340).
Impact scenario: Every consumer keeps a coalesce that the parser makes unreachable (`packages/platform/foundation/api-client/src/entity-list.ts:57`, `packages/platform/entity/runtime/list-view/src/lookup-directory.ts:109`), and TypeScript cannot express "the parser always fills this", so new call sites either re-add the guard or, worse, read `state.pageSize` as `undefined` and conclude the user cleared the page size. Marking the parsed output as always-present would remove a whole class of defensive code.
Suggested fix: Keep the parser guarantee and expose it in the type (required `pageSize` on the parsed location type, with a separate input/override type if direct construction without it must stay legal); do the same for the application descriptor's `navigation` or drop the unconditional emit.

### [low] Browser limits duplicated as both a const and a literal type, with no link
Location: packages/contracts/platform/entity-list/src/types.ts:47-53
What is wrong: Each limit exists twice — the runtime const that `parsers.ts`/`url-state.ts`/`location.ts` clamp with, and an independent numeric literal type that the server uses for its enforcement constants. Nothing ties the two, so editing one silently desynchronizes browser and server limits.
Evidence: `export const ENTITY_LIST_MAX_VISIBLE_COLUMNS = 100;` / `export const ENTITY_LIST_MAX_FILTERS = 20;` / `export const ENTITY_LIST_MAX_SORT_LEVELS = 10;` (types.ts:47-49) versus `export type EntityListMaxVisibleColumns = 100;` / `export type EntityListMaxFilters = 20;` / `export type EntityListMaxSortLevels = 10;` (types.ts:51-53). The server derives its enforcement from the literal types: `export const MAX_LIST_FIELDS: EntityListMaxVisibleColumns = 100;` (server/packages/services/records/src/list-limits.ts:6).
Impact scenario: Raise `ENTITY_LIST_MAX_VISIBLE_COLUMNS` to 200 for the list UI: `parseState` (parsers.ts:772-776) and `decodeColumns`/`encodeColumns` (url-state.ts:97-132) accept and serialize up to 200 columns, while the server still rejects more than 100 (`MAX_LIST_FIELDS`) — exactly the browser/server mismatch the doc comment at types.ts:44-46 says the shared limits exist to prevent.
Suggested fix: Derive the literal types from the consts: `export type EntityListMaxVisibleColumns = typeof ENTITY_LIST_MAX_VISIBLE_COLUMNS;` (and the same for filters/sort levels), and have the server import the consts.

### [low] Trust-boundary doc comment attached to the wrong interface
Location: packages/contracts/platform/entity-list/src/types.ts:67-73
What is wrong: The JSDoc warning that these are "Explicit, untrusted work-context coordinates sent with list requests" that a server must validate against the principal snapshot sits directly above `EntityWorkContextRequirementV1` (which is server-derived). The interface it describes, `EntityListScopeCoordinateV1`, is declared below with only a one-line comment, and because two doc blocks are stacked the first is attached to no declaration at all.
Evidence: types.ts:67-72 is `/**` ` * Explicit, untrusted work-context coordinates sent with list requests.` ` * They are intentionally separate from saveable/location state: a server must` ` * validate every value against the current principal snapshot before use.` ` */` immediately followed by `/** Server-derived requirements for one collection operation, independent of directory filters. */` and `export interface EntityWorkContextRequirementV1 {`.
Impact scenario: This file is the reference for a security-adjacent input (`companyCodeIds`, `operatingOrganizationIds`, parent references) that the server must re-authorize on every request. A reader or code generator that attaches the warning to `EntityWorkContextRequirementV1` may add the trust-boundary validation to the wrong type and leave the actual untrusted coordinate input undocumented.
Suggested fix: Move the types.ts:67-71 block down to `EntityListScopeCoordinateV1` (merging it with the existing one-line comment at :82) and leave a single server-side comment on `EntityWorkContextRequirementV1`.

## Checked and clean
- types.ts:2 - `ListPlane` `"neon" | "mesh" | "studio"` matches the parser's `oneOf(record.plane, ["neon","mesh","studio"])` (parsers.ts:252) and the server's `descriptor.planeKey`; no stale plane value.
- types.ts:3-9 - `ListViewMode`/`ListDensity`/`ListCountMode`/`RecordExportFormat`/`RecordImportFormat` are value-identical to `MODES`/`DENSITIES`/`COUNT_MODES`/`EXPORT_FORMATS`/`IMPORT_FORMATS` (parsers.ts:38-46,77-78); the format unions also match the server transfer policy.
- types.ts:10-36 - `ListValueKind` (12 members) and `ListFilterOperator` (13 members) match `VALUE_KINDS`/`FILTER_OPERATORS` one-for-one (parsers.ts:47-75); no member is parseable but untyped or typed but unparseable.
- types.ts:37-42 - the `Json*` types match what `json()`/`jsonObject()` actually accept and produce (parsers.ts:1073-1108): finite numbers only, `__proto__`/`prototype`/`constructor` rejected, and the depth/array/property caps are enforced parser-side rather than promised by the types.
- types.ts:55-65 - `ListFilterV1.value?` and `ListSortV1.nulls?` are conditionally emitted by `parseState` (parsers.ts:738-768), so neither is "optional but always present".
- types.ts:81-94 - every scope-coordinate member is serialized by `entityListScopeQuery` (packages/platform/foundation/api-client/src/entity-list.ts:69-81), accepted by the route schema (server/packages/services/records/src/entity-list-routes.ts:208-220) and re-validated in list-scope-coordinate.ts:2-22; `supplier|customer` and `order|invoice|payment` match the server enums exactly.
- types.ts:96-99 - `SpreadsheetStateV1` matches `parseSpreadsheet` (parsers.ts:1024-1045) and the URL codec's decode/encode pair (url-state.ts:134-153), including the width clamp.
- types.ts:101-111 - the required `filters`/`sort`/`columns`/`density`/`mode` are unconditionally produced by `parseState`'s base object (parsers.ts:791-810), and `columns` always contains the identity field (parsers.ts:770-776).
- types.ts:113-119 - `savedViewId`/`baseSavedViewId`/`cursor`/`pageIndex` are genuinely conditional in `parseState` (parsers.ts:816-834); only `pageSize` is always present (raised as a finding).
- types.ts:121-144 - every optional `ListFieldDescriptorV1` member (`columnGroup`, `semanticRole`, `rendererKey`, `formatting`, `filterOptions`, `defaultWidth`) is conditionally emitted by `parseField` (parsers.ts:879-943), the required members are always set, and the filter-option scalar/label shape matches parsers.ts:855-878.
- types.ts:146-164 - the action unions (`placement`, `selection`, `execution`, `state`) match `parseAction` (parsers.ts:946-1021); the optional `disabledReason`/`localizedLabel`/`href`/`disabledMessage`/`iconKey` are all conditional, and "disabled requires a reason" is enforced (parsers.ts:957-960).
- types.ts:166-173 - `EffectiveDataOperationV1` matches `parseDataOperation`, including `state`-driven `disabledReason` and the optional `maxRecords`/`requiredPermission` spread (parsers.ts:480-534).
- types.ts:177-203 - `EntityListDataOperationsV1` matches `parseDataOperations` key-for-key, including the conditional `import.delete`/`import.replace` (parsers.ts:437-452) and `exportableFields`/`importableFields` being pre-filtered to readable fields (parsers.ts:391-398).
- types.ts:205-270 - every required descriptor member is emitted both by `parseEntityListDescriptor` (parsers.ts:230-355) and by the server compiler `compileEntityListDescriptor` (server/packages/services/records/src/entity-list-service.ts:1000-1094, which is itself type-checked against this interface via the service return type); `standardViews` is added by the service wrapper (entity-list-service.ts:323).
- types.ts:272-281 - row `id`/`version`/`values` match `parseEntityListResult`'s row construction (parsers.ts:589-594): `id` is a validated non-empty string, `version` conditional and non-negative, `values` a validated JSON object.
- types.ts:283-299 - the required pagination fields (`pageSize`, `hasNext`, `hasPrevious`, `countMode`) are all emitted by the server result builder (entity-list-service.ts:698-712) and enforced by the parser (parsers.ts:629-671), and the `total`-forbidden-when-`countMode: "none"` rule (parsers.ts:610-614) matches the type's optionality.
- types.ts:317-336 - `EntityApplicationDescriptorV1` matches `parseEntityApplicationDescriptor` (parsers.ts:1290-1344) and the server `applicationDescriptor` projection (entity-list-service.ts:188-226); `intakeSurfaces`/`intakeFlows` reuse the same published types the server passes through (server/packages/contracts/metadata/src/descriptors.ts:303-304), and `plane` is re-derived from the descriptor type so it cannot drift.
- types.ts:338-345 - `EntitySavedView` scalar members match the parser's validation boundary (`id`/`name` required text, `scope` enum-checked, `version` number, `compatible` coerced with `=== true`); only `state` is wrong (raised as a finding).
- types.ts:346-356 - `EntityViewCatalog`'s required `views`/`capabilities` are always produced (api-client/src/entity-list.ts:109-113; server route read path at entity-views-routes.ts:92-114), and the optional default/created ids are conditional on both sides.
- types.ts:47-50 - the four exported constants are all referenced (parsers.ts:723,772,776; url-state.ts:18; packages/platform/entity/runtime/list-view/src/location.ts:27), so none is dead.
- Exported-symbol sweep - I grepped every export of this file across `apps`, `packages`, `server` and `tests`: `EntityListMax*` are consumed by server/packages/services/records/src/list-limits.ts:6-8, `RecordExportFormat`/`RecordImportFormat`/`EntityListScopeCoordinateV1`/`ListValueKind`/`EntityViewCatalog`/`EntityApplicationDescriptorV1` etc. have external consumers, and `ListPlane`, `DataOperationState`, `JsonPrimitive`, `JsonArray`, `EntitySavedView` are used as member types inside the contract. No exported type in this file is unreferenced.

## Notes
- The working tree changed while this review ran: `packages/contracts/platform/entity-list/src/parsers.ts` went from 1415 to 1372 lines (the fallback quick-filter helpers moved into the new `filter-defaults.ts`, now re-exported from `index.ts`). I re-read the current `parsers.ts`, `url-state.ts`, `index.ts` and `filter-defaults.ts` in full and re-grepped every cited line against the current files; `types.ts` itself is unchanged at 356 lines (`wc -l`).
- Not deep-reviewed here (owned by other groups): the Country request path (`list-view/src/index.tsx`, `form-detail/src/index.tsx`, `entity-read-runtime.tsx`, `entity-read-page.tsx`, `apps/*/lib/relay.ts`). Cross-file reads in this report were used only to validate `types.ts`.
- Type/contract observation not raised as a defect: `EntityListDescriptorV1` mixes wire fields with two client-attached fields (`viewCatalog` documented at :209, `viewNamespace` at :249). `parseEntityListDescriptor` drops both, so any descriptor passed through the parser (e.g. JSON caching or a re-parse) loses them. Today `list-view/src/index.tsx:744,754` attaches them after parsing and no code re-parses a descriptor through the operation, so I did not raise it; if a future path caches descriptors, this becomes a real drop.
- Server-produced but client-unread wire fields (`supportsAllMatching`, `requestedCountMode`, `surface.search.profileKey`, `pagination.hasPrevious`) were deliberately not counted as dead: they have a producer, unlike the members in the dead-surface finding.
