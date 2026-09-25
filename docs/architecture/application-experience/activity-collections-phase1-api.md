# Activity collections — Phase 1 backend usage

Updated: 2026-09-23. Phase 1 complete: backend checks and the authenticated publication walkthrough passed in Neon, Mesh and Studio. Temporary verification grants were revoked afterwards.

## What is shared

`@athyper/contract-platform-collection` reuses Entity List field kinds, filter operators, filters and sort state. `adaptEntityCollection()` converts an existing Business Partner descriptor without changing its record runtime. Notifications and Inbox have registered provider capabilities and independently validated configurations. Unknown providers, fields, operators, renderers, actions and incompatible schema/view versions are rejected.

The native Studio configuration entity is only a draft/publication identity. Its single embedded surface stores `layoutConfig.collectionConfiguration`; it has a virtual, catalog-only profile and no fields, record operations or business-table storage. This avoids treating Activity as an ordinary entity-record list. The collection descriptor has kind `collection_configuration`, carried through the existing signed publication envelope, staging and activation services.

Runtime keys are `metadata.collection.activity.notifications.<tenant-without-hyphens>` and `metadata.collection.activity.inbox.<tenant-without-hyphens>`. Each target plane has its own active head. Publishing configuration does not grant record access, send notifications, or execute workflow actions. Effective permission filtering and UI consumption belong to Phase 2.

## Local setup

Apply `server/db/migrations/20260923_collection_configuration.sql` to **athyper_studio** using the supported local schema migration credentials. It creates two narrow publication functions and execute grants; it does not write configuration rows. The equivalent fresh-database definition is `server/db/ddl/planes/studio/publication/13_collection_configuration.sql`.

The source API and publication workers need the updated packages. The publication worker must include `studio,neon,mesh` in `PUBLICATION_TARGET_PLANES` and have its existing signing, dispatch and per-plane apply configuration enabled. The current local worker already has all three target scopes.

Use independently authenticated saved sessions:

| Purpose | Default saved state | Optional environment override |
|---|---|---|
| Studio author | `tests/e2e/.auth/dev/studio/catl.admin.json` | `COLLECTION_STUDIO_AUTHOR_STATE` |
| Studio independent reviewer and reader | `tests/e2e/.auth/dev/studio/catl.owner.json` | `COLLECTION_STUDIO_REVIEWER_STATE` |
| Neon reader | `tests/e2e/.auth/dev/neon/catl.owner.json` | `COLLECTION_NEON_READER_STATE` |
| Mesh reader | `tests/e2e/.auth/dev/mesh/catl.owner.json` | `COLLECTION_MESH_READER_STATE` |

Do not copy sessions between planes. Author and reviewer must be different principals in the same tenant. All readers must use that tenant. The script checks these conditions before creating drafts and uses the normal CSRF-protected relay.

```bash
node tooling/scripts/verification/setup-activity-collections.dev.mjs --check
node tooling/scripts/verification/setup-activity-collections.dev.mjs
```

The script creates both configuration drafts through native authoring APIs, saves/reads collection configuration, verifies a stale revision returns 409 and an unsupported provider returns 422, previews synthetic rows, validates/tests the graph, submits, independently approves, then publishes to all three planes. It publishes a second Inbox revision with compact density to demonstrate an update.

The receipt defaults to `/tmp/athyper-collections-phase1.dev.json` (`COLLECTION_RECEIPT` can override it). Reruns reuse recorded drafts and redispatch recorded releases through the normal publication endpoint. Completed samples are not republished; final active heads are checked again. If a publish response is lost before its release ID is recorded, inspect that draft's existing release before retrying; do not create runtime rows or bypass review to recover it. Use a new receipt path to intentionally run a new configuration cycle.

## API shapes

Below are host paths. Application callers use `/api/relay/...` in place of `/api/...`. Studio authoring operations require authenticated Studio context and `metadata.entity.author`; existing submit, review and publication permissions remain unchanged.

| Method and path | Purpose |
|---|---|
| `GET /api/meta-entity-authoring/collection-providers` | Registered provider fields, choices, renderers, actions and limits |
| `GET /api/meta-entity-authoring/change-sets` | Existing draft catalog; configuration identity codes are `activity_notifications_configuration` and `activity_inbox_configuration` |
| `POST /api/meta-entity-authoring/change-sets` | Existing configuration draft creation |
| `GET /api/meta-entity-authoring/change-sets/:id/collection` | Read saved configuration and revision |
| `PUT /api/meta-entity-authoring/change-sets/:id/collection` | Validate and save configuration with `expectedRevision` |
| `POST /api/meta-entity-authoring/change-sets/:id/collection/validate` | Validate the saved collection configuration |
| `POST /api/meta-entity-authoring/change-sets/:id/collection/preview` | Resolve saved controls/defaults and return synthetic rows |
| `GET /api/collections/:collectionKey/configuration` | Read current published configuration in the authenticated tenant and plane |

Create draft example:

```json
{
  "entityId": "<new UUID, or existing configuration entity UUID>",
  "entityCode": "activity_inbox_configuration",
  "branchCode": "inbox_collection_local",
  "title": "Inbox collection configuration",
  "registration": {
    "schemaVersion": 1,
    "moduleCode": "fnd",
    "entityClass": "configuration",
    "ownershipModel": "tenant"
  }
}
```

Omit `registration` when editing an existing identity. The setup script installs the native graph from `tooling/fixtures/collections/inbox.json` or `notifications.json` through `PUT .../:id/graph` with `If-Match: <revision>`. No direct database edits are used.

Save through `PUT .../:id/collection`:

```json
{
  "expectedRevision": 1,
  "configuration": "<the configuration object from the fixture's surface layoutConfig>"
}
```

The placeholder above denotes an object, not a JSON string. Its required fields are `schema`, `collectionKey`, `title`, `description`, `providerKey`, `providerVersion`, `viewVersion`, `targetPlanes`, `rendererKey`, `searchFields`, `fields`, `quickFields`, `defaultState`, `views`, `surfaces`, `actionKeys`, and `maxPageSize`. The fixtures are executable full examples. Fields and views can narrow registered capabilities; they cannot introduce executable expressions, SQL or arbitrary URL destinations.

Read returns `{ revision, configuration }`. Validate returns `{ revision, valid: true, configuration }`. Preview returns:

```json
{
  "revision": 2,
  "configuration": "<validated controls and defaults>",
  "synthetic": true,
  "sent": false,
  "actionsExecuted": false,
  "rows": [{ "id": "synthetic-1", "title": "Example activity" }]
}
```

Preview intentionally uses synthetic display data and does not query personal activity or invoke provider actions. Synthetic rows are illustrative, not matching counts.

Publication follows the existing `validate → test → submit → approve → publish` change-set endpoints. Submit/approve/publish use the latest `expectedRevision`; approve uses the independent reviewer. Publish includes `targetPlanes: ["neon", "mesh", "studio"]`, which must exactly match the configuration's declared targets. A recorded release can be redispatched with `{ releaseId, targetPlanes }`.

Runtime read returns `{ collectionKey, plane, releaseId, releaseNo, compiledHash, configuration }`. `releaseNo` is the published revision. This API derives tenant and plane from verified authentication and the local active head; query parameters cannot select another tenant or plane. No published head returns `404 COLLECTION_CONFIGURATION_NOT_PUBLISHED`. These reads are noncacheable.

## Local verification recorded

- Collection examples and BP descriptor adaptation validate.
- Authenticated in-process API checks cover save/read/preview, invalid configuration, stale revision, closed draft, tenant/plane scope and authentication/authorization denial.
- Signed artifacts verify for all three planes; tampered projection/source and inner signatures are rejected. Authority compilation produces all three plane artifacts. Runtime reads reject wrong scope.
- Existing Entity List compilation and notification authoring/publication regressions pass.
- Studio schema migration applied successfully.
- Live draft save/read, synthetic preview, stale revision (409), invalid provider (422), validation, tests, independent review and publication passed through authenticated APIs.
- Notifications revision 1 (`de278fe7-503f-4cdb-bff1-771f7bdaf8b8`) is active in Neon, Mesh and Studio with comfortable density.
- Inbox revision 1 was published, followed by revision 2 (`75a3c3e4-464f-43bc-a059-9ee8a2979601`) with compact density; all three readers report revision 2 and the changed default.
- The script reran successfully without creating new releases. Fixed fixture surface IDs to belong to each draft, avoiding a primary-key collision when publishing a successor.
- Approved temporary access was applied at 05:55 UTC and revoked at 05:55 UTC on 2026-09-23. Zero grant edges remain active. Studio authoring again returns 403 `missing_permission`; all six published configuration reads still return 200.
- Local receipts: `/tmp/athyper-collections-phase1.dev.json`, `/tmp/athyper-collections-phase1-readers.dev.json`, and `/tmp/activity-collections-phase1-access.{apply,revoke}.json`.


No Studio authoring screens or Activity UI changes are included in this phase.
