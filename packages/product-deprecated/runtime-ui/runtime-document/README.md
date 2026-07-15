# @athyper/runtime-document

Product-tier document runtime contracts and primitives.

This package is intentionally under `packages/product/runtime-ui`, not
`packages/shared`. Document runtime behavior currently includes product-specific
accounting, procurement, workflow, and document BFF assumptions. Those must be
adapterized before code moves here, and promotion to `packages/shared` requires
a separate audit.

Current scope:

- document adapter contracts,
- document line adapter contracts,
- flow adapter contracts.
