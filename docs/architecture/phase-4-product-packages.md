# Phase 4 — Product package creation

The product package boundary is now present for Neon, Admin, and Mesh, and all product-scoped
packages live under `packages/products/<product>/<role>/`:

| Product | Runtime package | Composition packages |
| --- | --- | --- |
| Neon | `@athyper/neon-runtime` (`packages/products/neon/runtime`) | `app`, `brand`, `shell`, `navigation`, `route-manifest`, `i18n`, `command-hub` |
| Admin | `@athyper/admin-studio` (`packages/products/admin/runtime`) | `app`, `brand`, `shell`, `navigation`, `route-manifest`, `i18n`, `command-hub` |
| Mesh | `@athyper/mesh-runtime` (`packages/products/mesh/runtime`) | `app`, `brand`, `shell`, `navigation`, `route-manifest`, `i18n` |

## Dependency contract

Product packages may depend on shared contracts, shared platform packages, shared runtime
packages, and shared business capabilities. They may not depend on another product package or
application composition package. This is enforced by `policy:canonical-packages`.

The `runtime` subpackage is intentionally minimal initially. The sibling composition subpackages
(`app`, `brand`, `shell`, `navigation`, `route-manifest`, `command-hub`, `i18n`) remain the
application composition surface. They are not copied into `runtime`.

## Relocation rule

Code is moved into a product package only after repository-wide consumer analysis proves that all
consumers belong to the same product. Shared consumers stay in `packages/shared`. A relocation
must update imports, package exports, workspace metadata, and the ownership matrix in one change.

The first extraction candidates are product-shaped subtrees such as the Neon purchase-invoice
experience under `packages/products/neon/app/src/workbench`. These require file-level consumer
analysis because their parent packages also contain reusable runtime components. Whole-package
moves are prohibited unless the package has exactly one product consumer.

## Validation

- `pnpm install --ignore-scripts` resolves all 102 workspace projects.
- All three product package typechecks pass.
- `pnpm policy:canonical-packages` passes.
- `pnpm policy:shared-purity` passes.
- The package ownership matrix now includes all three product authorities.
