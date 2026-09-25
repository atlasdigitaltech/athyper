# Activity collections — application integration

Implemented on 2026-09-23. Studio collection **authoring screens remain deferred**. Neon, Mesh and Studio share the same Activity application components and backend composition.

## What is shared

- Published `activity.notifications` and `activity.inbox` configuration controls fields, operators, presets, sorting, grouping, density, actions and page size. The effective descriptor uses the authenticated tenant and plane. Inbox still requires `workflow.work_item.read`; publication does not grant access.
- `packages/platform/entity/runtime/collection-controls` owns the extracted drawer host, filter value editor, filter input conversion and draft footer. Business Partner and Activity both consume these components. Activity retains its readable rows and uses the existing toolbar, search, view selector, buttons and theme tokens. BP-specific organization/company controls remain with Entity List.
- Activity query adapters search and filter all authorized rows before pagination. Matching counts are separate from global unread/open badges. Cursors are tied to the query and identity scope. The current implementation uses the existing local scan-based providers.
- The existing preference service/repository stores Activity views under a logical collection key and `activity_center` surface. No fake entity or new saved-view storage table is required. Existing Entity List endpoints remain supported.
- Full pages have draft filters and Sort/Group/Display/Manage views sections. Apply updates the URL and resets pagination; Cancel preserves the applied query. Reset restores published defaults. Drawer filters stay inline and the full-view link carries the applied query.

## APIs for application consumers

Use each application's authenticated `/api/relay` prefix. Requests derive identity and plane from the verified session; callers do not supply a target user or tenant.

| Operation | Endpoint / body |
|---|---|
| Effective configuration | `GET /collections/activity.notifications/descriptor` (or `activity.inbox`) |
| Available views/defaults | `GET /collections/activity.inbox/views` |
| Create personal view | `POST .../views` with `{ "action": "create", "name": "My work", "visibility": "personal", "state": { "schemaVersion": 1, "collection": <validated collection state> } }` |
| Update | `{ "action": "update", "id": "<view UUID>", "version": <returned revision>, "name": "Updated", "state": <validated state> }` |
| Default | `{ "action": "default", "id": "<view UUID, standard key or system>", "target": "personal" }` |
| Remove personal default override | `{ "action": "clear_default" }` |
| Archive | `{ "action": "delete", "id": "<view UUID>" }` |

Shared creation/defaults use the existing shared-view permissions. Returned capabilities control their UI availability. Always use the returned revision; do not assume a newly inserted view has revision `1`. Stale updates return 409. Unsupported state/schema returns a readable validation error. Incompatible stored views remain visible in Manage views so they can be removed or replaced.

Personal browser-local views are imported only when the user selects Import. Import runs through the same validated create API, with a stable personal import identity. Successful entries are removed from local storage; unsuccessful entries remain available to retry. Nothing automatically uploads another account's browser-local views.

The raw Phase 1 `/configuration` reader remains available for publication verification. Application consumers use `/descriptor` to include current admission checks.

## Repeatable local checks

Use each plane's **own** refreshed `catl.owner` session in `tests/e2e/.auth/dev/<plane>/catl.owner.json`. Inbox verification needs an ordinary read grant in that plane. A refreshed login alone does not add permissions.

```bash
node tooling/scripts/verification/verify-activity-collections.dev.mjs
node tooling/scripts/verification/verify-activity-collections-browser.dev.mjs
pnpm --filter @athyper/server-platform-preferences test
pnpm --filter @athyper/server-platform-notifications exec vitest run src/__tests__/activity-collection-query.test.ts src/__tests__/activity-query.test.ts
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/__tests__/activity-presentation.test.ts
pnpm exec playwright test -c tooling/config/playwright.foundation.config.ts tests/foundation-browser/activity-query.spec.ts tests/foundation-browser/activity-hydration.spec.ts tests/foundation-browser/entity-drawer-selector.spec.ts tests/foundation-browser/company-filter-groups.spec.ts
```

The API script creates temporary personal views, checks updates/defaults from a fresh API context, rejects a stale version and incompatible state, restores the prior personal default and archives its fixtures. It never changes a published configuration or workflow task. Results go to `/tmp/athyper-activity-phase2-verification.json`.

The browser script checks both routes, inline drawer filters, Apply/Cancel/Back, published Inbox density, full-view query transfer and a narrow viewport in each plane. It performs no task or notification mutations. Results go to `/tmp/athyper-activity-phase2-browser.json`.

## Local results and boundaries

- Effective Notifications revision 1 and Inbox revision 2 were read in all three planes. Inbox's published compact density is visible.
- Both routes and the Activity drawer worked in Neon, Mesh and Studio. No browser hydration/page errors were observed. Narrow layouts had no horizontal document overflow.
- Personal views persisted across fresh sessions in all six plane/collection combinations. Stale revision and incompatible schema requests were rejected.
- BP's live Filters/Cancel/view selector and the shared filter drawer regressions were checked. The original Entity List view storage contracts remain in use.
- Backend regression coverage includes a match beyond the first 100 rows, multi-level sorting, scope-bound cursors and incompatible legacy shortcut recovery. Browser coverage includes a late pagination response, Back navigation and cross-timezone hydration.
- Neutral notification/task presentation fixtures exercise each plane through the shared presentation service, including denied/missing records. Live Neon used its existing BP activity. Live Mesh/Studio exercised authorized empty results; no persisted synthetic tasks were created and no task-write permissions were added. This distinction matters when repeating a populated-list demo.
- Legacy attention/mention shortcuts that cannot be represented faithfully by published filters produce a Reset view recovery state instead of silently broadening the query. Current collection bookmarks retain their query and timezone.
- Temporary Mesh/Studio Inbox read access was approved only for this walkthrough and is revoked after verification. Normal application use still requires the corresponding account permission.

The walkthrough does not require production providers, authoring pages, or direct configuration-table edits. Durable role provisioning and a populated Mesh/Studio business application are separate from this shared application build.
