# Numbering runtime

This package is the only application service allowed to advance
`runtime_meta.entity_number_counter`.

- `previewNumberingPolicy` is pure and never opens a database transaction.
- `allocateWithinTransaction` is the production composition boundary. Consumer
  code must write the generated number to its business record in the same
  transaction so rollback does not consume a value.
- `allocate` is a standalone atomic allocation helper. Use it only when the
  allocation itself is the complete unit of work.
- `allocationId` and `correlationId` are evidence coordinates, not a substitute
  for command idempotency. Consumer commands must be deduplicated before they
  call the allocator; the future common command-receipt slice owns that concern.
- Policy authoring, lifecycle decisions, authorization scopes, audit evidence,
  and document mutation remain outside this package.
