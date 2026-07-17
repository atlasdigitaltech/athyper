# Phase 2 — Canonical package rules

The repository has one canonical package graph. These rules are enforced by:

```text
pnpm policy:canonical-packages
```

## Boundaries

| Boundary | Rule |
|---|---|
| Shared packages | `packages/shared/*` may depend on shared packages and external libraries, but not `apps/*`, `packages/apps/*`, `packages/product/*`, or deprecated product packages. |
| Product packages | `packages/product/<product>/*` may depend on shared packages and external libraries only. |
| Application composition | `apps/<app>` and `packages/apps/<app>` may consume shared packages and their own product packages; they may not consume another product's package. |
| Product isolation | Product packages may not depend on another product package. |
| Server isolation | `server/packages/*` may not depend on application or UI packages. |
| Shared contracts | Contract packages may not depend on product/application code. Product-specific behavior belongs in product adapters or applications. |
| Package identity | Only one active workspace implementation may expose a package name. Retired or duplicate authorities must be removed or excluded from the active graph. |
| Source layout | Source junctions and symlinks are forbidden under `apps`, `packages`, and `server`. pnpm-generated links under `node_modules` are allowed. |

The validator checks both package manifest dependencies and source imports, including relative cross-package imports. It resolves duplicate package names against the active pnpm workspace so inactive legacy copies do not become runtime authorities.

## Migration policy

The rule set intentionally keeps `packages/apps/<app>` as a recognized transitional application-package location while the target location is `packages/product/<app>`. New product packages must use `packages/product/<app>`; existing `packages/apps` packages are tracked by the Phase 1 ownership matrix for migration.
