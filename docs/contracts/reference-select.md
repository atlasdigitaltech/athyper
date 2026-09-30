# Reference chooser and recent selections

`EntityDataSurface` uses the shared searchable chooser for metadata-backed `select`
fields with `lookup.sourceKey`. Small inline fixed-choice fields retain native
selects. Options, labels, and eligibility come from the authorized descriptor.

The committed value remains visible while the popup opens a separate focused
search box. Search covers names and codes, ignoring case and accents; exact
matches rank ahead of prefixes and other matches. Recent choices appear first
when search is empty, without duplicates in the remaining options. Clicking or
pressing Enter commits; Escape preserves the prior value. Clear recent choices
changes history only. The popup is bounded, reveals the selected row, and uses
shared icons, styling, and `entity.reference.*` localized messages.

Complex `EntityLookup` references retain their existing full browse dialog and
metadata-defined columns, filters, and single/multiple selection. The compact
search now has a distinct Browse button. The full chooser commits only through
its confirmation action; Cancel preserves the previous selection. Existing
single-select rendering uses radio controls; multi-select uses checkboxes.

## Published history policy

The shared `RecentChoicePolicy` extends the existing lookup `recent` contract.
Data input references carry it under `lookup.recent`:

```json
{
  "sourceKey": "iso.country",
  "recent": {
    "enabled": true,
    "limit": 5,
    "persistence": "server",
    "scope": "referenceSource",
    "retentionDays": 90
  }
}
```

`persistence` is `browser` or `server`; server mode uses a browser cache.
`scope` is `referenceSource` or `businessContext`. Tenant, principal, and plane
isolation always applies. Limits are 1–20 entries and 1–90 days. Missing
persistence defaults to browser, missing scope to business context, and missing
retention to 90 days. Older data fields without `recent` keep browser history
with five entries. Explicit `enabled:false` disables history.

Country provisioning now selects server persistence and reference-source scope,
so a user's country history spans organizations within a tenant. The authoring
transform `withBusinessPartnerReferenceHistory` adds this default only where no
explicit history policy exists. Published payloads are immutable; republish the
updated authoring graph through the normal release process.

## Persistence and API

`master.reference_choice_recent` stores one row per tenant, principal, plane,
reference source, business-context key, and selected reference key, with
`last_selected_at` and `expires_at`. No labels or form values beyond reference
keys are retained. This is separate from `master.principal_ui_preference`.

- `GET /api/entity-runtime/:entityCode/reference-history?surface=…&field=…`
- `POST` to the same endpoint with `{ "action":"select", "key":"MY" }`
  or `{ "action":"clear" }`.

The server derives identity from authentication and policy from the authorized
application descriptor, validates selected keys against current options, and
returns only currently available keys. The registered source-backed data input
path currently supports `iso.country`. This API does not accept arbitrary target
entities, reference sources, owners, or client-provided retention settings.
Complex entity directories retain their existing recent resolver path; extending
server history to those directories requires their registered eligibility adapter.

Per-group transaction locks serialize upserts, trimming, and clear operations.
Each selection updates one key, preserving other devices' selections. Reads and
writes remove expired owner history; reads enforce the current policy's age
limit. A five-minute `references.history.expire` job deletes expired rows in
batches of 5,000 through a narrowly scoped maintenance function. That function
must be owned by the migration/maintenance database role with RLS bypass, not
the application role. It exposes no history and cannot delete unexpired rows.

The client shares one active history store per authenticated history scope, updates its cache immediately, and serializes background synchronization.
Stale responses cannot replace newer local selections, and the last subscriber unmounting aborts
requests. Reads are lazy: the first open refreshes history, then activated controls refresh on window focus only when their binding is older than 60 seconds. Equivalent bindings share in-flight reads; distinct descriptor fields, query scopes and eligibility sets retain separate freshness entries (bounded to 100 per store). One window focus/storage listener serves all mounted stores. Stores are disposed when their last subscriber leaves. Transport or storage failure never
blocks field selection or form submission. Browser caches contain keys and
selection timestamps; expired/unavailable entries are omitted. They are scoped
by authenticated identity, source, and relevant context. There is no automatic
migration of old browser-only history into server history.

## Deployment and verification

Apply `server/db/migrations/20260913_reference_choice_recent.sql` to the relevant
plane databases, deploy the host/frontend/worker/scheduler, and publish the
updated Business Partner authoring graph. Fresh database manifests include the
same schema. Frontend deployment alone does not enable server history on old
published descriptors.

Tests cover contract validation and authoring preservation, authenticated routes,
real PostgreSQL concurrent updates/RLS/expiry, desktop/mobile accessibility,
search/selection, separate browser-context synchronization, clearing, and outages.
The PostgreSQL integration test requires a disposable database initialized with
the schema and actor-context functions; set `REFERENCE_HISTORY_TEST_URL` when
running `server/db/scripts/__tests__/platform/reference-choice-history.test.ts`.

## Shared presentation and performance

The pure `choicePresentation` policy selects native dropdowns for short fixed lists
(up to 15 options) and the shared searchable popup for source-backed references,
country/language/currency semantics, longer lists and multiple selection. Forms,
filter values, and sort/filter field selectors reuse this policy. Native dropdowns
share the chevron geometry and trailing width without adding buttons or tab stops.
Date inputs retain native calendars and date-only serialization.

The searchable popup supports single/multiple values and optional labelled groups.
Relative date filters use its grouped presentation. Filter recents remain applied
filter history in the existing authorization-scoped session store; clearing them
preserves the current filter draft. Loading an empty authorized catalogue does not
trigger repeated requests. Existing textual operators keep a text editor.

Country catalogue indexes are shared by immutable option-array identity and locale
through a weak cache, with at most four locales per array. Popup DOM is mounted only
when open. A manual browser popover escapes transformed/clipped drawers while the
portal remains inside the modal's focus boundary. Old browsers retain the fixed
popup fallback. Popup search and history failures never change committed values.

Compact entity lookups load display preferences and recent records only after
interaction. The full directory is a deferred module. Scoped adapters can reuse
completed descriptor/view metadata for 60 seconds; changing context replaces that
cache, and an authority mismatch or request failure invalidates it. Every returned
page still has its descriptor hash and scope checked. Search remains debounced at
350ms and uses the descriptor's minimum query length and allowed page sizes (at most
50 when the descriptor permits it). No record result cache or hierarchy is inferred.

See `docs/ui/global-field-controls-implementation.md` for verification and rollout.
