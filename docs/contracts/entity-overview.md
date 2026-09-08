# Entity Overview v1

Current presentation: the Entity Pulse toolbar, attention banner, and metric
cards are deferred and hidden by default (`showSummary=false`). The overview
starts with Focus and Continue your work, followed by Recently updated and
Favourites. Summary-only count requests are skipped. The optional summary
implementation is retained for later reintroduction.

The shared entity application runtime renders Entity Pulse for every authorized
navigation section whose content kind is `overview`. Business Partners uses this
path without a separate entity-specific dashboard.

The first version includes an attention summary, clickable record metrics, Focus
queues, published-view shortcuts, and up to five records. It uses the existing
application descriptor, collection descriptor, and list operations. It does not
require a new endpoint or metadata publication.

## Data behavior

- The main entity collection is preferred; otherwise the first authorized entity
  collection is used. No collection is fetched without a published destination.
- All records is unfiltered. Up to three published standard views receive their
  own counts and destinations. Links explicitly select System default and carry
  the matching query so personal defaults cannot alter the metric's meaning.
- Requests use current work coordinates, bounded allowed page sizes, and the
  descriptor's count mode. Approximate counts are marked; cached counts are
  labeled. Missing totals are unknown unless the complete first page is present.
- Focus uses authorized task sections or sections with published attention counts.
  Missing counts are unknown. Overlapping queue counts are never added together.
  The all-clear summary requires every available queue to report zero.
- Recently updated requires a sortable datetime field identified as `updated_at`
  (semantic role or field key) or `updatedAt`. Otherwise the panel is Record
  preview. No audit event, actor, quality score, or lifecycle metric is inferred.
- Scope changes clear old records immediately and abort pending requests. Returned
  descriptor hashes and scope fingerprints must match before data is displayed.
  Failed view requests do not hide other successful results. Refresh retries the
  collection reads; navigation attention counts follow application-descriptor
  refreshes.

## Extension and presentation

`EntityOverview` is the reusable presentation component; `EntityOverviewRuntime`
provides the existing-list adapter. Additional adapters can supply explicit facts
without coupling the layout to an entity's field names or statuses. Future audit
activity and quality sections should use defined backend contracts.

Styling uses shared theme tokens, responsive single-column layouts, visible
keyboard focus, reduced-motion support, and light/dark/high-contrast themes.

Verification: `tests/foundation/entity-overview.test.tsx`, the application
integration test in `entity-list-phase1a.test.tsx`, and
`tests/foundation-browser/entity-overview.spec.ts` cover counts, scope changes,
retry, query links, responsive rendering, keyboard operation, and axe checks.

## Favourites

Recently updated and Favourites share a second 60/40 row beneath Focus and
Continue your work. Both rows stack on mobile. Favourites shows five entries;
View favourites expands the available list, and Show fewer restores the preview.
The endpoint returns at most the 200 most recent bookmarks for the current entity.

`GET /api/record-bookmarks?entityCode=…` accepts the same work coordinates as the
list runtime and revalidates bookmarked IDs through the record list executor.
Only currently readable records are returned. Names, codes and statuses come
from currently readable metadata fields; missing presentation fields are omitted.
The existing unfiltered endpoint remains compatible with shell quick access.

Removal uses the existing bookmark mutation and emits the shared bookmark-change
event. Undo restores the record through the scoped add operation. Failed mutations
retain the row or Undo action. Scope changes unmount the panel and suppress stale
responses. Loading and error states remain local to Favourites.
