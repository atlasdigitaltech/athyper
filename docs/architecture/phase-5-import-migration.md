# Phase 5 — Import migration

## Canonical product package names

| Product | Canonical package | Filesystem authority |
| --- | --- | --- |
| Neon | `@athyper/neon-runtime` | `packages/product/neon` |
| Admin | `@athyper/admin-studio` | `packages/product/admin` |
| Mesh | `@athyper/mesh-runtime` | `packages/product/mesh` |

These packages are separate from `@athyper/app-neon`, `@athyper/app-admin`, and
`@athyper/app-mesh`. The `app-*` packages remain application composition authorities for
routes, shells, navigation, branding, and app wiring.

## Completed in this phase

- Added canonical package names and package exports.
- Registered `packages/product/*` as a workspace source.
- Updated the lockfile.
- Added product package manifests to both server Dockerfiles for dependency-layer resolution.
- Regenerated the ownership matrix.
- Verified canonical package boundaries.
- Typechecked all three product packages.
- Confirmed no source imports currently reference the new product names, so no speculative import
  rewrites were made.

## Migration rule

Imports must use package names, never filesystem paths. Existing `@athyper/app-*` imports remain
valid where they refer to application composition. They should be changed to a product package
only when the imported implementation has moved into that product package.

Relative imports inside one package remain valid. Relative imports that cross a package root are
tracked as extraction work and must be replaced with the target package export as part of the same
move. The old source path is removed only after repository-wide consumers, tests, fixtures,
Dockerfiles, and build scripts resolve through the canonical package.

## Not moved yet

No existing feature files were moved in this phase. The product packages currently contain only
their canonical entrypoints because existing application packages still own the implementations.
This prevents duplicate implementations and avoids breaking shared consumers. Feature extraction
will proceed package-by-package after consumer exclusivity is proven.
