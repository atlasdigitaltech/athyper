# Metadata-driven Activity center — local build plan

Status: Phase 1 and Phase 2 implemented and locally verified. Studio collection-authoring frontend remains deferred. See [Phase 2 usage and verification notes](activity-collections-phase2-usage.md) for commands, authorization requirements and the distinction between live data and service fixtures.
Updated: 2026-09-23.

## 1. Outcome

Use the metadata-driven list capabilities already built for Business Partner to configure Activity center. Extend the shared contracts and components so Business Partner and Activity center use one implementation of applicable list controls. Retain the readable Activity rows and the existing authorized notification/workflow services.

Deliver `/notifications`, `/inbox` and the Activity center drawer in **Neon, Mesh and Studio**, with frontend and backend integration in each plane. Publish collection configuration through **Studio backend APIs first**. Studio configuration-authoring screens are a later phase.

This is a collection presentation and application integration build. It extends the Activity center work; it does not restart the notification-channel build or add real external provider delivery.

## 2. Scope by application

| Application/area | This build | Later |
|---|---|---|
| Studio configuration backend | Draft/read/update, validate, preview, publish and inspect effective collection configuration through authenticated APIs | — |
| Studio configuration frontend | — | Collection editor, validation/preview screens and publish UI |
| Neon application | Frontend + backend for both full pages, drawer, published configuration consumption and saved views | — |
| Mesh application | Frontend + backend for both full pages, drawer, published configuration consumption and saved views | — |
| Studio application | Frontend + backend for its own full pages, drawer, published configuration consumption and saved views | — |
| Shared platform | Collection contracts, provider adapters, reusable controls, query/state validation and preference-service integration | — |
| Business Partner | Adopt extracted shared components/contracts through its existing entity adapter; retain existing entity behavior | — |

**Studio Activity center is included now. Studio's collection-authoring UI is deferred.** These are separate features.

Repository baseline: all three applications already have `/inbox` and `/notifications` pages importing `ActivityCenterPage` from the shared Activity package. Reuse those entry points. Runtime permissions, provider bindings and published configuration still need verification in each plane; existing routes alone do not establish full cross-plane support.

## 3. Reuse and architecture

```text
Studio backend configuration APIs
          ↓ validate and publish
Versioned collection configuration for the selected target plane
          ↓ resolve with current permissions and provider capabilities
Shared collection controls and view state
          ├─ Business Partner entity adapter → existing Entity List service
          ├─ Notifications provider → existing notification service
          └─ Inbox provider → existing workflow service
          ↓
Neon / Mesh / Studio: full pages and Activity drawer
```

| Reuse | Required extension |
|---|---|
| Entity List field types, filter operators, sort/group capabilities and published defaults | Extract a collection presentation contract independent of entity storage, columns and record CRUD. Keep existing entity contracts compatible through an adapter. |
| `ManagementToolbar`, `ObjectSearch`, `ViewSelector`, `AppliedFilters`, shared buttons and theme tokens | Consume the resolved collection descriptor. Do not create another toolbar implementation. |
| Business Partner filter editor and list drawer | Extract reusable header/section selector, summary, draft filter editor and Apply/Cancel/Reset footer. Both consumers must use the extracted implementation. |
| Business Partner Sort, Group by, Display and Manage views behavior | Expose only supported sections; retain Activity row rendering. No Columns section for Activity's feed. |
| Existing saved-view service, repository and authorization | Add collection-aware identity and state validation; preserve existing entity views and APIs. |
| Existing Studio validation/publication infrastructure | Add a registered collection artifact/projection through the supported publication path, rather than creating a second publication engine. |
| Existing authorized record links, notification and workflow APIs | Add collection adapters and capability validation without bypassing recipient/assignment/record-access checks. |

Proposed collection keys: `activity.notifications` and `activity.inbox`. These are logical collection identities, not fabricated entity/table definitions. Keep shared packages free of Business Partner-specific routes.

## 4. Configuration boundary

The published contract should include:

- Schema version, collection key, revision/hash, target plane and registered provider key/version.
- Localized title/description, approved row renderer key and supported full-page/drawer presentation.
- Search capabilities and registered searchable fields.
- Filter field definitions: type, label, allowed operators, order, quick-filter placement and registered choice source.
- Sort/group capabilities and defaults; supported density values.
- Published standard views and quick-filter mappings to the same query state.
- Approved action/destination resolver references, and required capabilities for exposing them.
- Query limits, count semantics and saved-view compatibility version.

Metadata declares presentation and supported capabilities. Code implements query operators, timezone-aware due buckets, recipient eligibility, workflow actions, record authorization and trusted navigation. Do not allow arbitrary SQL, executable expressions or arbitrary destination URLs in configuration.

Reuse existing lookup catalogs where semantics match. Dynamic choices such as accessible entity types must come from registered, authorized providers. Configuring a new operator is valid only when its provider implements it; reject unsupported configurations during validation/publication.

Resolution order: platform collection defaults → published target-plane/tenant configuration → permitted personal/shared view state. Intersect the result with current provider capabilities and permissions. Personal preferences cannot enable a forbidden field, action or provider. Keep tenant and plane scope in configuration lookup, saved views and cache keys.

An unpublished or invalid draft must not affect runtime. An update replaces the current published version only after successful validation/publication. Reuse existing publication recovery conventions; for local recovery, republishing the previous valid configuration is sufficient. A collection with no valid published configuration must show a clear configuration-unavailable state, rather than silently inventing a descriptor.

## 5. Phase 1 — shared foundation and Studio publishing backend

No Studio authoring pages, navigation entries or frontend authoring tests are required in this phase. Use authenticated API examples and a repeatable local setup script.

| Step | Build activities | Main code areas | Done when |
|---|---|---|---|
| S-01 | Define the shared collection contract, provider capability contract and query/view compatibility rules. Add an adapter for the existing Business Partner descriptor and examples for Notifications and Inbox. | `packages/contracts/platform/entity-list`, shared Activity contract, new shared collection contract where needed | BP and both Activity examples validate; an unsupported provider/operator returns a readable error. |
| S-02 | Add Studio backend operations for list/read, draft create/update, validation and configuration preview. Reuse authorization and optimistic-versioning patterns. Preview returns the resolved controls/defaults and synthetic rows; it sends no notifications and performs no task actions. | Studio authoring backend, shared publication contracts, host API composition | An authenticated API call saves a draft, reads it and previews its controls; a stale update is rejected. |
| S-03 | Integrate collection artifacts with existing publication. Validate registered references, compile the runtime projection and support explicit target-plane publication. Add only required catalog/migration changes. | Studio publication services, metadata catalogs/projections, runtime configuration reader | The local script publishes Notifications and Inbox for Neon, Mesh and Studio; each target reader reports the expected revision and defaults. |
| S-04 | Add setup/API examples, local fixtures and focused backend checks. Include a configuration update and an invalid configuration example. | Local tooling, API documentation and backend tests | The script reruns through normal validated APIs/services, a changed default is visible to the target reader, and affected tests/typechecks pass. |

**Phase 1 complete:** configuration can be saved, previewed and published through backend APIs, and all three target planes can read it. No Studio authoring frontend is needed.

The setup script must use the normal validation/publication path. Do not configure runtime by directly editing database rows. Reuse explicit supported deployment/publication credentials and target scopes; do not copy a Neon session into another plane.

### Phase 1 implementation status

Shared contracts and BP adaptation, registered Activity providers, authenticated draft/preview APIs, signed publication integration, target-plane readers, fixtures and the repeatable setup script are implemented. See [backend API and local setup](activity-collections-phase1-api.md).

Focused backend regressions and affected typechecks pass. The authenticated setup script published Notifications revision 1 and Inbox revisions 1 and 2 through independent Studio review. Neon, Mesh and Studio each report Notifications revision 1 (comfortable) and Inbox revision 2 (compact). The script reran without new releases. Temporary author/reviewer grants were revoked; published readers still succeed. **Phase 1 is complete.** No authoring frontend was added.

## 6. Phase 2 — shared application frontend and backend, all three planes

Start after Phase 1 provides valid published examples. Build shared behavior once; wire and check it in Neon, Mesh and Studio.

| Step | Build activities | Main code areas | Done when |
|---|---|---|---|
| A-01 | Resolve published collection descriptors against current identity, permissions and registered provider capabilities. Add Notifications/Inbox adapters in each plane. Preserve recipient scope, workflow eligibility and authorized record presentation. | Shared notifications/workflow services, host composition, application API relays | Each plane returns its own effective descriptor and activity; a user cannot query another tenant/plane or another user's personal activity. |
| A-02 | Extract the applicable Business Partner drawer/filter/sort/group/display components and make Entity List and Activity use them. Use shared styling and density tokens. | Entity List runtime, foundation UI, shell/Activity packages | BP and Activity show the same control structure; BP's existing filters and views still work. |
| A-03 | Generate Activity filters, quick filters and presets from the descriptor. Add draft editing, validation, Apply/Cancel/Reset and matching-count feedback. Connect declared operators to the backend query adapter. | Shared collection controls, Activity state/query adapter, backend query services | Apply changes results, Cancel preserves the old query, Reset behaves consistently, and a search can find a row beyond the first page. |
| A-04 | Reuse server saved views for Activity. Introduce a backward-compatible collection identity/state-validator boundary instead of faking an entity. Support personal/shared views, defaults and version conflicts. Offer an explicit one-time import of this user's browser-local views through validated APIs; retain local data until import succeeds. | Shared preferences service/client, saved-view storage, collection validator, Manage views UI | A personal view is available in a fresh browser session; authorized shared views work; BP views remain readable; an incompatible view has a clear recovery option. |
| A-05 | Complete the shared full-page and drawer integration in all apps. Preserve readable rows, authorized actions/links, query URLs, Back/Forward and pagination reset/refresh behavior. Drawer filters stay inline; opening full view carries the applied query. | `apps/neon`, `apps/mesh`, `apps/studio`, shared Activity page/data source and shell | Both routes and the drawer work in each app; links stay in the correct plane; bookmarked queries hydrate without errors. |
| A-06 | Run a short local walkthrough and update setup notes. Rebuild/restart only affected services when needed. Use local synthetic examples in planes without real activity. | Local configuration, backend/browser regression tests, documentation | The checklist below passes, affected tests/typechecks pass, and local setup instructions are repeatable. |

**Phase 2 complete:** Neon, Mesh and Studio use published configuration for their Activity pages and drawer, share Business Partner's applicable controls, and persist views through the existing preference services.

### Application usage checks

| App | Notifications | Inbox | Integration check |
|---|---|---|---|
| Neon | Existing local notification examples | Existing eligible work items | BP request/comment links and a neutral registered entity destination |
| Mesh | Small plane-local notification fixture | Small plane-local eligible task fixture | Authorized Mesh destination; no Neon route fallback |
| Studio | Small plane-local notification fixture | Small plane-local eligible task fixture | Authorized Studio destination; independent of the deferred authoring UI |

Use supported local fixture APIs/services. These checks do not require a complete new business application in Mesh or Studio. An unavailable source record should produce an informative unavailable state, not a fabricated link.

## 7. Later phase — Studio collection-authoring frontend

After Phases 1 and 2, build Studio screens over the same APIs: collection catalog, draft editor, fields/filters, sort/group/display settings, standard views, preview, validation messages and publish/version controls. Reuse Studio's existing authoring components and shared collection preview. Do not add a frontend-only save/publication path.

**Done when:** a Studio user can edit, preview and publish a collection configuration, then see the change in its selected application. This later phase does not block the local Activity center build.

## 8. Simple local completion checklist

No separate production readiness gate, sign-off packet, benchmark campaign or deployment evidence bundle is required. Keep ordinary authorization and version validation intact.

1. **Publish:** one script configures both collections for all three target planes; an invalid setting gives a useful error.
2. **Reuse:** BP and Activity use the extracted controls; a BP filter/view smoke test passes.
3. **Use:** `/notifications`, `/inbox` and the drawer open in Neon, Mesh and Studio; search, Apply/Cancel, grouping and links behave as expected.
4. **Remember:** a saved view reloads from the server, stays scoped to its account/tenant/plane/collection, and URL Back/Forward restores the applied query.
5. **Protect and recover:** one denied-record case, one stale saved-view/configuration update and one empty/error state behave clearly.
6. **Verify:** affected typechecks and focused tests pass, including cross-timezone hydration, late pagination responses and matching/global-count separation. Check one narrow layout plus light/dark appearance of the extracted controls.

Record commands and a short result summary in the implementation notes. Screenshots are optional for layout changes. Do not require production providers, real push devices or real messages.

## 9. Local implementation boundaries

- Retain complete authorized search before pagination. The current local scan-based Activity query implementation can remain behind the provider interface; an indexed activity projection is deferred until scale warrants it.
- Do not add data creation/deletion, generic task completion or bulk actions merely because Entity List supports CRUD.
- Show Organization/Company filters only if the particular collection provider supports their scope semantics. Do not replicate BP-only controls on every collection.
- Preserve deterministic SSR defaults; restore browser timezone, bookmarked state and personal preferences after hydration or from a server-provided matching snapshot.
- Distinguish global unread/open badges from matching counts and draft-filter preview counts.
- Hide or disable unsupported sections based on effective capabilities. Absence of permission must not be displayed as an empty successful query.
- Shared views/configuration do not confer access to the underlying records or tasks.

## 10. Implementation order

S-01 → S-02 → S-03 → S-04 → A-01 → A-02 → A-03 → A-04 → A-05 → A-06.

At A-02, migrate Business Partner and Activity together for every extracted component. This avoids leaving duplicate implementations behind. Neon, Mesh and Studio integration checks occur before marking Phase 2 complete. Studio authoring screens remain a separately scheduled later phase.
