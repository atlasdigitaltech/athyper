# Shared package group index

## Purpose
- Provide one discoverable map of `packages/shared/*` packages during cleanup and audits.
- Keep package-group boundaries explicit and versioned separately from code exports.

## Canonical groups

- `api`: API clients/contracts/relay packages.
- `auth`: authentication/authorization shared logic and auth gating.
- `contract`: shared schemas, runtime/shared contracts, and metadata contracts.
- `navigation`: route/menu/navigation shared contracts.
- `runtime`: runtime execution, runtime canvas/listing/add-item/bulk actions, and runtime UI helpers.
- `session`: session persistence and session runtime coordination packages.
- `ui`: UI primitives/facades/visual family packages.
- `other`: everything not yet assigned above.

## Source of truth
- `packages/shared/package-groups.ts`
- `packages/shared/index.ts` (boundary re-export for discoverability)

