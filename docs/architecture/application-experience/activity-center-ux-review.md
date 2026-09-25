# Activity center — UX review and recommended build

Date: 2026-09-23. Status: reviewed and implemented locally; implementation details and verification follow the original recommendations.

Reviewed `system-design.md`, shared Activity center source, screenshots and authenticated CATL owner API responses. Notifications and Inbox both returned HTTP 200. No workflow mutations were performed during this review.

## Findings

1. Inbox items expose technical task titles and UUIDs, making separate requests indistinguishable. The inspected approval items have source entity coordinates but no href. `activity-center-data/src/index.ts` checks only payload href/entity_href/action_url; it does not resolve coordinates into an authorized destination.
2. Supplier notifications carry `caseUrl`, while `kysely-notification-repositories.ts` reads href/entity_url. Absolute URLs are also rejected by the existing relative-path contract. A URL displayed inside body text is not a navigation contract. Do not solve this by auto-linking arbitrary body text.
3. All Inbox rows get a generic Complete callback. The workflow service explicitly rejects direct completion for cycle tasks and requires the owning task command. Review tasks should open their review context; approval remains in the domain workflow.
4. Full-page title and metadata can run together when there is no paragraph, because strong/small are inline. Drawer and page implement separate row markup and actions, causing further differences.
5. A large preference panel precedes primary navigation and work. All external channels look equally usable even though local capture is not physical device/provider delivery.
6. Page counts use zero when unknown/failed, and the drawer shows a chevron even without a destination. These imply facts/actions that are not available.
7. Refresh currently replaces loaded pages with the first page and can interrupt browsing. Read/complete failures largely recover by refresh without an item-level explanation.

## Recommended product model

Notifications answer “What happened?” Inbox answers “What needs my action?” Both use Activity center navigation and one shared visual vocabulary. Opening a notification can mark it read; dismissing a notification never completes its related task.

### Shared item anatomy

- Leading event/task icon; unread indicator remains separate from event meaning.
- Plain-language title, e.g. “Supplier approval requested” or “Alex mentioned you”. Names are examples and must come from authorized data.
- Explicit record line: entity label, record display name and meaningful business reference. Prefer readable request numbers to opaque identifiers.
- Brief summary, limited to two lines in the drawer; no raw URL in generated notification copy. Do not strip URLs from user-authored comments indiscriminately.
- Separate metadata line: timestamp for notifications; workflow status, assignment and due date for tasks. Exact date available on focus/hover as well as a relative label.
- One clear primary action: View comment, Review request, Open task or View record. Secondary read/dismiss actions live in a consistently placed menu.

Inbox example: “Review supplier request” → “Business Partner · Acme Supplies · BP-00125” → “Approval · Assigned to you · Overdue 2 days” → Review request. Example values are illustrative.

## Drawer and full page

| Area | Drawer | Full page |
| --- | --- | --- |
| Header | Activity center; compact description; expand and close | Activity center; short description; Preferences action |
| Navigation | Shared Notifications / Inbox tabs with labeled counts | Same tabs, preserving /notifications and /inbox routes |
| Filters | Notifications: All / Unread. Inbox: All / Needs attention | Same core filters, plus supported search and sort |
| Rows | Same component in compact density; two-line summary | Same hierarchy with additional context where useful |
| Grouping | Notifications by Today / Yesterday / Earlier | Same dates; Inbox defaults to overdue/due work, then other work |
| Footer | Open Notifications / Open Inbox in full view | Load more and loaded-count feedback |
| States | Shared loading/empty/denied/error components | Same messages and recovery behavior |

Use existing PanelTabs, filter controls, PanelEmptyState, buttons and theme tokens. Page headers can remain page-sized; drawer headers remain compact. Share semantics and tokens instead of forcing identical outer dimensions. One page scroll surface; drawer body scrolls independently. Preserve filters, loaded items, focus and scroll on ordinary refresh/navigation. Unknown counts display unavailable/loading, never confirmed zero.

Preferences should open from a labeled header action. Use a shared settings form in a suitable secondary surface or settings route consistent with shell overlay coordination. Show In-app, Email, Browser notifications, SMS and WhatsApp only with honest availability/status. Separate browser permission from channel preference. Replace technical consent/routing language with actionable explanations. Save only when changed; expose reload primarily for conflicts. Keep delivery diagnostics in a separate permission-scoped operator view.

## Shared backend view model and navigation

Enrich authorized list responses in batches with a typed activity presentation model:

- Event/task identity and source coordinates.
- Readable title, summary and record label/reference.
- Record destination and optional work/comment destination.
- Allowed primary action and availability reason.
- Read state or task status/assignment/due date.

The shared resolver uses published entity route metadata and registered domain providers. Business Partner supplies request/review coordinates; shared UI contains no BP-specific route branches. Preserve attempt/work-item context for review links. Comment destinations open Collaboration Comments and reveal the referenced comment, including when it is outside the initially loaded page.

Use trusted local route generation. A compatibility adapter may normalize legacy absolute URLs only against the configured application origin and expected route contract. Do not trust arbitrary payload/body URLs. Recheck record access and workflow action authority at the destination; remove unavailable sensitive labels according to the existing disclosure policy. Show a clear unavailable state rather than a broken link or misleading chevron.

Use the same destination/action model for notifications and tasks about the same request. Do not manufacture another Inbox task from a notification. Existing records need a read-time compatibility projection; new producers should emit structured presentation/context fields. Do not rewrite historical user content just to clean up display.

## Build order and simple local checks

1. **Context and links:** add shared authorized resolution, legacy caseUrl compatibility and record display labels. Existing supplier notices open the correct request; an old mention resolves its comment; inaccessible destinations remain protected.
2. **Correct actions:** replace universal Complete with provider-declared actions. Approval opens review and retains attempt/work-item context. Only genuinely supported completion actions call a mutation and show pending/error feedback.
3. **Shared layout:** extract common row/list/filter/state presentation and adopt it in both surfaces. Verify light/dark, keyboard, narrow width, long names and 200% zoom.
4. **Preferences and list behavior:** move settings out of the feed, preserve loaded rows on refresh, use honest counts and working server-backed filtering/search. Do not search only the first loaded page while presenting results as complete.
5. **Focused walkthrough:** mention → comment; supplier notice → request; Inbox approval → review; denied/deleted record; failed action; switch drawer/full view; Back restores context. Use local fixtures for unavailable provider/device scenarios.

This follows system-design.md: notifications inform, Inbox contains actionable work; generic components do not own business-specific decisions; access and failed/empty states remain distinct.

## Implementation update — 2026-09-23

Implemented the shared Activity center header/tab/filter vocabulary and reusable notification/task rows in full pages and drawer. Record context occupies a separate line, metadata no longer runs into titles, overdue tasks have an explicit label, and navigation is a labeled action. Full view remains at `/notifications` and `/inbox`; drawer expansion carries the active filter. Notification preferences are opened from the page header, save requires a change, and channel availability/permission requirements are surfaced. Delivery diagnostics remain permission-scoped inside the settings area.

Added a shared destination-resolution utility and host-owned authorized record providers. Supplier requests use the existing governed request read service; generic records use published route/title metadata and the record query service. Existing supplier `caseUrl` review coordinates are retained only when they match the resolved request path. No arbitrary payload URL is made clickable. Approval rows no longer call generic completion. Both source read access and destination command authorization remain intact.

Comment links open Collaboration Comments and load the required root/reply pages. Deleted or inaccessible comments are presented as unavailable, without their old excerpt. Focus is applied after the reply view commits and stops following the deep link after user interaction. Existing historical data was not rewritten.

Ordinary refresh reloads the previously loaded page depth, retains the view during refresh, and rejects stale pagination results. Row failures remain local. Counts are unavailable during failed/initial requests; partial loaded counts are not presented as totals. The initial row-layout change used loaded-row shortcuts. The Activity query toolbar update below replaces those shortcuts with server-backed matching before pagination.

Verification: live owner Inbox and Notifications returned working authorized request links; review links retained attempt/work-item coordinates. Mobile layout had no horizontal overflow at 390px; drawer and page rendered without browser errors. Backend and browser regression results are summarized in the completion report for this change.

Final targeted checks: 27 browser tests passed; five host tests passed; 180 notification and 104 workflow tests passed. The reply deep-link and eight-page refresh cases passed three repeated runs after the focus-race correction. Host, notifications, workflow, shell/Activity center and entity-detail typechecks passed. Local request-link navigation retained `attemptId`, `workItemId` and the review section. No new permission grants, workflow decisions or notification sends were performed for this UX build.

## Activity query toolbar — 2026-09-23

The full pages now use `ManagementToolbar`, `ObjectSearch`, `AppliedFilters`, shared buttons and drawer/select controls. `ViewSelector` was extracted into foundation UI and is used by both Entity List and Activity center. Activity results still use the existing shared readable rows. There is no synthetic Entity List descriptor.

Notifications support read status, event type (including Mentions), entity type and date range. Inbox supports status, priority, assignment, due bucket and entity type. Controls expose sorting, grouping and comfortable/compact density. Default Inbox grouping is Overdue / Due today / Upcoming / No due date. Calendar dates use the browser's IANA time zone, included in the validated query. Quick filters and predefined views update the same query. Personal views are stored locally in this browser, scoped by the server-returned tenant, principal, plane and tab; they do not yet synchronize between devices.

The drawer uses compact search and inline filters. Its full-view link carries the complete query. Full pages preserve query changes in browser history, restore Back/Forward and reset pagination when the query changes. Refresh retains the loaded page depth; generation checks reject late requests from old queries. Search submits with Enter, matching the Entity List search interaction.

### API behavior

`GET /api/notifications/inbox` and `GET /api/workflow/inbox` accept an optional JSON `activityQuery`. Existing callers without it retain their original API behavior. Example query:

```json
{"search":"supplier","read":"unread","group":"date","sort":"newest","timeZone":"Asia/Kuala_Lumpur"}
```

The shared contract validates fields, enums, dates and time zones. Responses add `matchingCount`, authorized entity/event facets, `viewScope`, per-row `groupLabel` and an opaque query-bound cursor. Notification `unreadCount` and workflow `totalCount` remain global personal unread/open counts, independent of matching results.

For this local implementation, each request pages through the existing tenant/principal/plane-scoped repositories, resolves authorized presentation, then filters/groups/sorts before the final response page. There is no first-50-row search or silent scan cap. Cursor order includes a stable ID tie-breaker and a frozen reference time; newly created items enter on refresh. Changed access and item mutations are rechecked on every request, so this is not a historical database snapshot. Unavailable record labels and snippets are redacted before matching.

This approach preserves current authorization services and works with the local dataset. Its cost grows with each user's activity history; a future larger deployment should introduce an indexed authorized activity projection behind the same query contract. No provider configuration or schema changes are needed for the current local implementation.

Generated workflow labels such as dependency impact review and data stewardship no longer expose UUIDs in the title or generated summary. User-written comment text is preserved.

### Verification

Targeted coverage includes a match after repository row 100, redacted content not being searchable, exact matching counts, stable page ties, changed-query cursor rejection, validation, due buckets, delayed pagination during search, URL Back navigation, repeat search, scoped personal views and drawer/full-view transfer. Live owner checks exercised full-page filtering and controls, zero-results recovery, drawer inline filters and a 390px layout without horizontal overflow.

## Next build — published collections across applications

The accepted next step is the [metadata-driven Activity center build plan](metadata-driven-activity-center-build-plan.md): Studio publishing backend first, followed by shared frontend/backend integration for Neon, Mesh and Studio. It reuses Business Partner controls and existing saved-view services. Studio configuration-authoring screens are deferred; Studio’s own Activity center is included. This plan is future work, not a claim that published collection integration is already implemented.
