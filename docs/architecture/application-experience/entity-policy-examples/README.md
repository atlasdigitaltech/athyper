# Draft Neon compiled entity descriptors

The three `*.entity_descriptor.compiled.json` files show the JSON intended for
`runtime_meta.entity_descriptor.compiled_json` after Studio publishes an entity
release and the Neon compiler has produced a plane-specific descriptor.

The surrounding `runtime_meta.entity_descriptor` row supplies the immutable
release envelope: `id`, `tenant_id`, `entity_contract_id`, `entity_id`,
`release_id`, `revision_id`, `plane_code`, `descriptor_kind`, schema version,
source-contract hash, compiled hash, compiler version, compatibility level,
applied-release ID, generated/received timestamps, and activation status.
Those coordinates must not be duplicated as editable values in `compiled_json`.

`schema: athyper.entity-runtime-descriptor/1.0` is the current parser contract.
These examples use the proposed `2.0` schema because `businessContext` is the
new extension required for the Business Context Selector. The current parser
does not parse, expose, or enforce that property; publishing these files is
therefore not yet supported.

The compiler work must make `businessContext` an explicit versioned contract,
validate every key, compile the matching `operation_scope_bindings` into the
runtime `authz` bindings, and ensure every command invokes the server-side
business-context validator. Metadata remains descriptive and restrictive: it
never grants a permission or overrides persisted record authorization.
