# Phase 8 — Package boundary enforcement

`pnpm policy:release-boundaries` is the pre-release gate. It combines checks for:

- duplicate active package names;
- duplicate active package paths;
- source junctions and symlinks outside `node_modules`;
- cross-product imports;
- shared-to-application/product imports;
- server-to-UI imports;
- missing exports on public packages;
- missing package ownership-matrix metadata;
- deployment profiles referencing inactive or missing packages.

The existing canonical-package validator also enforces the shared, product, application, and
server dependency direction rules. The deployment-profile validator verifies that all active
workspace packages are represented in the ownership matrix and that every profile resolves to
real workspace authorities.

The gate runs in CI and in the release workflow after a clean Linux `pnpm install`:

```text
pnpm policy:release-boundaries
```
