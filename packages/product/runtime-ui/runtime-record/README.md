# @athyper/runtime-record

Product-tier record runtime contracts and primitives.

This package is intentionally under `packages/product/runtime-ui`, not
`packages/shared`. It may depend on product runtime concepts, but it must not
depend on Neon, Mesh, Admin, Next app routes, BFF paths, or query clients.

Current scope:

- record adapter contracts,
- operation adapter contracts,
- field lookup adapter contracts,
- panel adapter contracts.

Future slices can move header, form, field registry, and generic detail shell
code here after each dependency is adapterized.
