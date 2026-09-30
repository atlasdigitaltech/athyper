# BP2-01 — Shared reference foundation and lookup contracts

**Status:** implemented in authoring and runtime code; ready for the next governed Neon metadata publication. This phase creates no shared-reference maintenance workflow and does not activate UI-language localization.

The reference directory is the only read contract for Business Partner reference controls. It is registered by source key, so a browser request cannot select a table, a column, or an arbitrary predicate. Each page is limited to 100 records (25 by default), ordered deterministically, and has an opaque cursor bound to both source and dependency scope.

`value` is the value that a consuming Business Partner field persists. `recordId` is always the shared-reference UUID. Code-valued references therefore remain code-valued even though the directory has a stable record identity; bank and classification-code references persist UUIDs where their DDL relationships do so.

Normal searches return active/effective rows only. An exact `value` request resolves a stored historical value for display, including a retired reference, without making it selectable in normal lookup results. State/region requires `countryCode`; bank branch and identifier require `institutionId`; classification codes and crosswalks require their declared domain scope. The dependency rules deliberately leave an empty initial control until its parent answer is available.

Bank institution and branch capture remain on the existing banking-specific choice projection until BP2-09. The directory already registers the bank source contracts and identity semantics so that phase can replace that projection without changing persisted values.

## Artifacts and runtime path

| Layer | Location | Responsibility |
| --- | --- | --- |
| Contract | `server/packages/contracts/master-data/src/shared-reference-directory.ts` | Browser-safe lookup shape and stable source keys |
| Service | `server/packages/services/records/src/shared-reference-directory.ts` | Fixed registry, validation, active/historical rules, SQL projections and cursors |
| HTTP | `server/packages/services/records/src/shared-reference-directory-routes.ts` | Authenticated `GET /api/reference-directory/:sourceKey` |
| Form runtime | `packages/platform/entity/runtime/form-detail/src/reference-select.tsx` | Sends only declared answer-derived filters and resolves historical values |
| UI control | `packages/platform/foundation/ui/src/searchable-select.tsx` | Incremental search, pagination and closed-control historical label resolution |
| Authoring | `metadata/products/mdg/entities/*/core.json` | Read-only reference cores; no generic write capability |

`reference-registry.csv` is the implementation ledger for all fifteen tables.

## Checks completed

- `shared-reference-directory.test.ts`: source coverage, code/UUID distinction, rejected forged filters, required scopes, historical UUID resolution, cursor page boundaries and cursor/source isolation.
- `compiled-entity-artifact-compiler.test.ts`: all authoring examples, including the new read-only cores, compile deterministically.
- Typechecks: records service, platform host, API client, UI and form-detail runtime.

The next publication must activate the reviewed core artifacts through the existing governed release process. It must not introduce a UI-language activation as part of this reference-only phase.
