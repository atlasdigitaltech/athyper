# Publication shared extraction checkpoint

Date: 2026-09-26. First implementation slice only; collection and evidence
migrations are not complete.

## Consumer baseline

publication-source-consumers-before-extraction.md captures the per-source graph
before implementation edits, including direct imports of non-barrel helpers.
The inventory tool now emits sourceConsumers as well as symbol consumers.
Barrel edges are attributed to their declaration source; namespace/dynamic edges
are conservative. Subpaths and relative imports are included. Computed imports,
non-source configuration references and external repositories remain outside scope.

## Changes

- Extracted localPreviewRoot, unchanged, into
  packages/services/publication/src/shared/preview/environment.ts.
- Extracted ActiveCaseContract and InitialCaseContract, unchanged, into
  packages/services/publication/src/shared/case-contract/model.ts.
- Added explicit shared package subpaths; switched the host preview guard to its
  direct subpath. Internal preview/service/test callers and the local initialization
  script now use the shared guard/type locations.
- Preserved old exports as compatibility re-exports, not duplicate implementations.
  Runtime compatibility is tested for the guard; type compatibility is typechecked.
- Added fail-closed environment cases and AST dependency-boundary tests for the two
  intentionally dependency-free leaf modules (including type imports/re-exports,
  import expressions and require calls).
- Root export surface remains 105 symbols. Fresh checker output resolves all three
  extracted symbols to their shared source files. Source graph now covers 36 modules,
  including non-barrel helpers; this count is not comparable to the previous 31
  barrel-declaration source modules.

This does not make the entire package barrel import-isolated: legacy exports remain.
The host still imports the existing collection compiler; no claim that all preview
dependencies are now generic. No policy, payload, workflow or case-contract behavior
was changed.

## Fresh verification

| Command | Result |
| --- | --- |
| pnpm --dir server/packages/services/publication typecheck | Exit 0; source and test-source compilation |
| pnpm --dir server/packages/services/publication test | Exit 0; 33 files, 253 tests passed |
| pnpm --dir server/apps/platform-host typecheck | Exit 2; only the existing entity-case-preflight.ts missing KyselyBusinessPartnerCaseRepository export |
| pnpm --dir server/apps/platform-host test | Exit 0; 72 files passed, 2 skipped; 531 tests passed, 9 skipped |
| Inventory script, post-extraction | Exit 0; 105 root exports; three moved declaration origins verified |
| git diff --check | Passed |

The host run followed production changes; the final subsequent change added only
the guard compatibility assertion to the publication test suite, which was rerun
with publication typechecking. No new live-DB run was needed for pure guard/type
extraction; the prior live fixture results remain historical.

## Next boundary

Collection compilation needs explicit metadata-backed relationship/source bindings,
with current catalog, scope, authorization and release-pin validation preserved.
No new collection binding was enabled in this slice. Case-contract behavioral
changes and preflight persistence remain governance-gated. Authenticated release
review remains last, with a separate versioned-evidence migration and security tests.

The five generic retain implementations were not edited by this slice:
entity-authorization-compiler.ts, entity-authorization-publication-review.ts,
coordinated-entity-adoption.ts, compiled-entity-artifact-compiler.ts, and
collection-configuration-source.ts. No legacy file was deleted.
