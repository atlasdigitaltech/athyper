# Entity Runtime Edit Compatibility

This folder is a compatibility barrel for existing
`@athyper/entity-runtime/edit` consumers.

Add new shared edit lifecycle behavior to
`packages/shared/runtime-shared/src/edit` and re-export it here only
when existing entity-runtime consumers need the compatibility path.
