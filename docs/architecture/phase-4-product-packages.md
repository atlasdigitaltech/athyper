# Phase 4 — Product package creation

The product package boundary is now present for Neon, Admin, and Mesh:

| Product | Package | Owns |
| --- | --- | --- |
| Neon | `@athyper/neon-runtime` | End-user entity screens, document workspaces, runtime record experiences, Neon workflows, business composition |
| Admin | `@athyper/admin-studio` | Metadata Studio, tenant administration, diagnostics, governance, platform configuration UI |
| Mesh | `@athyper/mesh-runtime` | Integration administration, external connectors, exchange workflows, Mesh operational tooling |

## Dependency contract

Product packages may depend on shared contracts, shared platform packages, shared runtime
packages, and shared business capabilities. They may not depend on another product package or
application composition package. This is enforced by `policy:canonical-packages`.

The product packages are intentionally minimal initially. Existing application packages under
`packages/apps/<product>` remain application composition: brand, shell, navigation, route
manifest, command hub, and i18n. They are not copied into product packages.

## Relocation rule

Code is moved into a product package only after repository-wide consumer analysis proves that all
consumers belong to the same product. Shared consumers stay in `packages/shared`. A relocation
must update imports, package exports, workspace metadata, and the ownership matrix in one change.

The first extraction candidates are product-shaped subtrees such as the Neon purchase-invoice
experience. These require file-level consumer analysis because their parent packages also contain
reusable runtime components. Whole-package moves are prohibited unless the package has exactly
one product consumer.

## Validation

- `pnpm install --ignore-scripts` resolves all 102 workspace projects.
- All three product package typechecks pass.
- `pnpm policy:canonical-packages` passes.
- `pnpm policy:shared-purity` passes.
- The package ownership matrix now includes all three product authorities.
