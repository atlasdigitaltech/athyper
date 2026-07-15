# Legacy runtime retirement inventory

Status: active retirement control, last baseline refresh 2026-07-14.

The deprecated runtime tree contains four workspace packages:

- `@athyper/entity-runtime`
- `@athyper/document-runtime`
- `@athyper/runtime-document`
- `@athyper/runtime-record`

The only legacy BFF surface is [`apps/neon/app/api/records/[...path]/route.ts`](../../apps/neon/app/api/records/[...path]/route.ts). It exists solely for the deprecated tree and emits `legacy_records_call` telemetry with method, caller route, entity, and migration blocker.

The authoritative inventory is [`policy/legacy-runtime-retirement-allowlist.json`](../../policy/legacy-runtime-retirement-allowlist.json). Every remaining legacy route consumer has an owner, removal target, and a bounded occurrence count; the deprecated tree itself is an owned bounded group. Run `pnpm policy:legacy-runtime-retirement` to validate it.

Migration order:

1. Replace non-deprecated `/api/records` callers with `/api/runtime/v1` typed routes or the runtime-v1 catchall.
2. Replace the remaining deprecated document and master-detail consumers with `runtime-canvas` capabilities.
3. Use legacy-route telemetry to confirm zero traffic for a sustained release window.
4. Delete the BFF relay, server-side `/records` compatibility mounts, this inventory, and the four deprecated packages together.

Do not add a new allowlist entry as a convenience. A new entry requires an explicit owner, a concrete removal date, and a migration blocker in the same change.
