# Canonical package rules

The repository has one canonical package graph. These rules are enforced by:

```text
pnpm policy:canonical-packages
```

## Boundaries

| Boundary | Rule |
|---|---|
| Shared packages | `packages/shared/*`, `packages/platform/*`, and `packages/domain/*` may depend on shared/contract packages and external libraries, but not applications, plane products, deprecated products, or server implementations. |
| Contract packages | `packages/contracts/*` contain browser-safe wire contracts and may not depend on React, Next.js, Node built-ins, databases, applications, plane products, or server implementations. |
| Product packages | `packages/planes/<plane>/*` may depend on shared/contract packages, external libraries, and packages in the same plane only. |
| Application composition | `apps/<plane>` may consume shared packages and packages from its own `packages/planes/<plane>` tree; it may not consume another plane. |
| Product isolation | Product packages may not depend on another product package. |
| Server isolation | `server/packages/*` may not depend on application or UI packages. |
| Package identity | Only one active workspace implementation may expose a package name. Retired or duplicate authorities must be removed or excluded from the active graph. |
| Source layout | Source junctions and symlinks are forbidden under `apps`, `packages`, and `server`. pnpm-generated links under `node_modules` are allowed. |

The validator checks package manifest dependencies and source imports, including relative cross-package imports. It resolves duplicate package names against the active pnpm workspace so inactive reference copies do not become runtime authorities.

## Reference-tree policy

`apps-backup/*`, `packages-backup/*`, and `server-backup/*` are read-only evidence. They are excluded from the workspace and may not be imported, required, exported, aliased, or used as package authorities by active code. New frontend product code belongs under `packages/planes/<plane>/*`.
