# Phase 2 — Compiled capability and write contract

## Canonical contract

`EntityCompilerService` now emits `capability_manifest` for the effective
`control.entity_version`. The manifest contains renderer, CRUD/aggregate
bindings, deletion and lifecycle semantics, collection ownership, named
handlers, and a field-by-field create/update write projection.

The write projection is the common source for both generic record mutations
and write facades. It records writable, required, computed, read-only,
system-managed, write-once, and status-limited decisions. Older snapshots are
supported by a temporary live-metadata fallback, which also selects the
effective version; the former `version_no = 1` selection has been removed.

## Compilation failures

Compilation fails before a snapshot is published when metadata declares:

- a document renderer without a compiled document runtime;
- a named handler or write facade absent from the deployment registry;
- an explicitly mutable child collection without an FK, polymorphic ownership,
  or registered collection handler;
- an enabled operation with a missing or inactive permission;
- a ledger with generic mutation operations or write handlers;
- lifecycle-only deletion together with hard delete.

The API startup compiler and metadata approval compiler receive the records
service handler manifest. Per-entity failures are reported by the existing
compile-all deployment summary.

## Hashing and caching

The capability manifest is part of `compiled_hash`. The descriptor cache
namespace is `desc:v6`, its payload key contains the compiled hash, and the
write-descriptor cache is keyed by entity plus compiled hash. Recompiling an
existing effective version now refreshes its snapshot rather than silently
retaining a pre-capability snapshot.

## Runtime and health

Generic field guards and facade write descriptors first consume
`snapshot.entity_compiled.capability_manifest.write`. They fail over to the
effective live metadata only while old snapshots are being rebuilt.

Neon descriptor health reports a missing capability manifest, missing enabled
handler or permission bindings, and incomplete field projection coverage as
errors.
