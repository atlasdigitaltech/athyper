# Studio collection binding persistence and lowering

Date: 2026-09-26.

Follow-up: collection-hash-preparation-checkpoint.md resolves the hash expectation
with an exact five-key delta assertion and records fresh green Studio tests.
Results below remain the historical producer checkpoint.

## Authoring and persistence

Author the explicit collectionCompilation object on the same active surface's
layoutConfig as collectionRelationship. MetaEntitySurfaceLayoutConfig now types
both properties. The existing metadata.entity_surface.layout_config JSONB column
and repository branch whitelist already persist the entire object; no new table
or column is needed.

The repository's replaceGraph path validates before writing. Added SQL-adapter
coverage exercises its real JSONB serialization and loadGraph decoding and then
compiles the reloaded graph. This is a mocked connection test, not live RLS/DDL
qualification. Existing snapshot capture includes layoutConfig in canonical graph
hashing; binding changes alter both contract and descriptor hashes.

## Fail-closed compilation

Studio and publication now share parseCollectionCompilationBinding from the
metadata contract package. Studio rejects missing/orphan/duplicate declarations,
unknown properties, invalid routes/versions, entity/subject/plane mismatches,
runtime profile mismatches, and discover/read permission/scope mismatches.
Deprecated declarations are not emitted. Missing bindings are never inferred.

compileGraph emits collectionCompilation at the descriptor root, exactly where
the shared publication collection compiler consumes it. A host cross-package test
passes a Studio-compiled non-BP asset collection through that compiler and binds its
source hash; missing target catalog and wrong plane still reject.

## Database publication boundary

Updated the source DDL for fn_prepare_document_collection_release to allow the new
descriptor/layout property only when it equals the approved snapshot declaration
and matches its entity, plane, subject, read permission and canonical detail route.
Existing independent-review, signature, tenant and source branch checks remain.

This DDL was NOT applied to a running database. Existing databases require a
reviewed deployment of the function change before using the new field.
The preparation function and its TypeScript adapter retain their pre-existing
BP/Neon-only admission restrictions: generic non-BP compilation does not mean
generic live activation is implemented. Other pre-existing descriptor/SQL
compatibility gaps are not claimed resolved. No product release was activated.

## Verification

| Check | Result |
| --- | --- |
| Metadata contracts typecheck | Passed |
| Meta-entity authoring contracts typecheck | Passed |
| Studio authoring source/test typecheck | Passed |
| Studio collection suite | 21 tests passed |
| Full Studio authoring suite | 131 passed, 1 failed (35 files: 34 passed, 1 failed) |
| Publication typecheck and tests | Passed; 265 tests passed |
| Host source typecheck | Only existing preflight repository import diagnostic |
| Full host tests | 532 passed, 9 skipped; 73 files passed, 2 skipped |
| Diff integrity | Passed |

The Studio failure is deterministic.test.ts:71, its pinned invoice descriptor hash:
expected b95907f0dc3f6b3c2e90a6ed1bd2cbecdbf4540fae93abfe73416ec44e99356c;
actual bb8f34e8cc6817778c06ae40ebe999495ab0f794df2fc25e2800ad8d140bb332.
The same mismatch reproduced with the new collectionCompilation emission removed;
that invoice graph has no collection declaration. Emission was restored and the
assertion was not changed to bless an unexplained hash. Full Studio tests are not
green and this unrelated descriptor baseline needs investigation before release.

Preflight, case-contract behavior and authenticated release review remain untouched.
