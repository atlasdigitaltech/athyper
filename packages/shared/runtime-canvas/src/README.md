# Runtime Canvas Source Layout

`@athyper/runtime-canvas` is the shared descriptor runtime shell. It stays in
`packages/shared/runtime-canvas` because it is driven by runtime contracts,
plane policy, and caller-provided descriptors rather than a Neon-only route
implementation.

Use these folder names consistently:

- `fields/`: field value components and field-level runtime display helpers.
- `actions/`: operation dispatch contracts and the current runtime-canvas
  dispatcher implementation.
- `flow/`: generic modal shells for descriptor-driven operation flows.
- `panels/`: context drawer, comments, attachments, and activity panels.
- `surfaces/`: descriptor-rendered page sections and tab bodies.
- `fields/registry.tsx`: shared/default field renderer registry. App-specific
  lookup/reference renderers should register through the exported field
  registry instead of importing product runtime UI.

App packages should own route loaders, entity-specific adapters, and product
policy glue. Keep those callers in `packages/apps/*`; promote only contract-
driven runtime behavior here.
