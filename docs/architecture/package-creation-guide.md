# Package creation guide

Choose the owner before creating a package:

1. Shared contract/platform/runtime/business behavior used by multiple planes goes under the
   appropriate `packages/shared/<group>/` directory.
2. Neon-only behavior goes under `packages/product/neon/`.
3. Admin-only behavior goes under `packages/product/admin/`.
4. Mesh-only behavior goes under `packages/product/mesh/`.
5. Routes, shells, navigation, branding, and app composition stay under
   `packages/apps/<plane>/` or `apps/<plane>/`.

Every package must have a unique name, `package.json`, exports for public packages, ownership
matrix coverage, and a typecheck/build script. Add it to the workspace using a portable physical
path. Do not create a generic common package and do not create source aliases.

Run `pnpm package:ownership:inventory` and `pnpm policy:release-boundaries` before submitting.
