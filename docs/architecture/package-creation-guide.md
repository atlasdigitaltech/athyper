# Package creation guide

Choose the owner before creating a package:

1. Shared contract/platform/runtime/business behavior used by multiple planes goes under the
   appropriate `packages/shared/<group>/` directory.
2. Neon-only runtime behavior goes under `packages/products/neon/runtime/`.
3. Admin-only runtime behavior goes under `packages/products/admin/runtime/`.
4. Mesh-only runtime behavior goes under `packages/products/mesh/runtime/`.
5. Routes, shells, navigation, branding, and app composition stay under
   `packages/products/<product>/<role>/` (`app`, `brand`, `shell`, `navigation`,
   `route-manifest`, `i18n`, `command-hub`) or the Next.js entrypoint at `apps/<product>/`.

Every package must have a unique name, `package.json`, exports for public packages, ownership
matrix coverage, and a typecheck/build script. Add it to the workspace using a portable physical
path. Do not create a generic common package and do not create source aliases.

Run `pnpm package:ownership:inventory` and `pnpm policy:release-boundaries` before submitting.
