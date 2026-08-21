# Deprecated document runtime status

`@athyper/document-runtime` under `packages/product-deprecated` is not imported by any
production application or production package. Neon uses `@athyper/runtime-canvas` for
document pages.

The deprecated package remains private and workspace-local for reference and test fixtures.
Its retained Save adapter uses only the workspace OPEN/SUBMIT lifecycle. It must not be added
as a dependency of an application; remove the package when its remaining reference fixtures
are no longer needed.
