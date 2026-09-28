# Metadata-bound collection compiler checkpoint

Date: 2026-09-26.

Follow-up: studio-collection-binding-checkpoint.md records the now-implemented
Studio persistence/validation/emission path. The producer-gap statement below is
historical to this compiler-only checkpoint; live activation remains unverified.

## Implemented boundary

The compiler now lives in publication/src/shared/collections/compiler.ts.
The old compiled-entity-collection-compiler.ts path is a compatibility re-export,
not a second implementation. Publication authority work and host graph preview
use the shared implementation; a direct package subpath is exported.

Product selection is explicit in native.collectionCompilation:

```json
{
  "schemaVersion": 1,
  "entityCode": "asset_change",
  "planeKey": "neon",
  "subjectEntityCode": "master.asset",
  "permissionCode": "neon.assets.case.read",
  "detailRouteTemplate": "/app/entity/asset_change/:recordId"
}
```

This belongs in the reviewed, release-pinned graph. It must not be merged from a
request, caller coordinates, or deployment environment after review. Unknown keys,
wrong versions, plane/entity mismatches and noncanonical detail routes reject.
Subject must match the registered relationship; permission must match both graph
permission links and the unique current target catalog entry. The authorization
profile is still parsed against those exact operation permissions.

No new SQL, arbitrary resolver, storage model, or command is enabled. The registered
document.entity_case summary fields, organization relationship resolver, read-only
backing, discover/read operation restriction and authorization restrictions remain.
This is reusable document-case collection compilation, not a universal table compiler.
The single allowed import is @athyper/server-contract-metadata; an AST test rejects
additional dependencies, re-export/import-type edges and dynamic loading bypasses.

withDocumentCollectionSource retains its UUID/hash validation unchanged. Publication
still supplies entity ID and release hash from the selected source row and runs its
existing descriptor/hash/signature path. None of those security controls were removed.

## Deliberate availability change and remaining work

Previously the compiler inferred Neon/BP entity, subject, read permission and legacy
detail URL. Those defaults are gone. Graphs without collectionCompilation fail with
DOCUMENT_COLLECTION_COMPILATION_INVALID, including historical native graphs passed
through fresh compilation/preview. Compatibility exports preserve import paths,
not implicit BP behavior. Already stored artifacts were not rewritten or redeployed.
Any recompilation/rollback path using this native lowering must account for the new
required binding before deployment; no end-to-end rollback compatibility is claimed.

Studio authoring/persistence/lowering does not yet emit collectionCompilation.
That producer-side integration and product migration remain required before enabling
new collection publication from Studio. Do not work around this gap by injecting
defaults in the host or by modifying signed historical evidence. Tests clone old
fixture data into a new explicitly bound graph; the evidence file itself is unchanged.

Case-contract behavior, preflight persistence and authenticated release review were
not changed. The five previously designated generic retain implementations were
not edited. No DDL, live data, product metadata or deployed process changed.

## Fresh verification

| Check | Result |
| --- | --- |
| Publication typecheck | Exit 0; source and test-source compilation |
| Publication tests | 33 files passed; 265 tests passed; exit 0 |
| Host typecheck | Exit 2; only entity-case-preflight.ts missing KyselyBusinessPartnerCaseRepository export |
| Host tests | 72 files passed, 2 skipped; 531 tests passed, 9 skipped; exit 0 |
| Diff integrity | Passed |

New cases cover a non-BP subject, absent bindings, binding versions, entity/plane
mismatches, permission and authorization mismatches, duplicate catalog entries,
resolver changes, route injection, unknown properties, and the AST import allowlist.
Existing incompatible storage/fields/write behavior and source-pin assertions remain.
No live database or activation run was performed for this compiler extraction.
