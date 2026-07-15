# Phase 8 — Metadata architecture cleanup

Status: implemented for the canonical metadata/runtime boundary.

## Deletion manifest

The following duplicate package authorities were removed from the repository. Their complete pre-deletion trees are backed up outside the repository at `D:\Products\athyper-phase8-backup-20260716`:

- `packages/shared/api-contracts`
- `packages/shared/metadata-client`
- `packages/shared/runtime-contracts`
- `packages/shared/runtime-shared`
- `packages/shared/business-domain/api-contracts`
- `packages/shared/business-domain/runtime-contracts`
- `packages/shared/business-domain/runtime-shared`
- `packages/shared/platform-auth/runtime-contracts`
- `packages/shared/runtime-domain/api-contracts`
- `packages/shared/runtime-domain/metadata-client`
- `packages/shared/ui-platform/api-contracts`
- `packages/shared/ui-platform/runtime-contracts`
- `packages/shared/ui-platform/runtime-shared`

The canonical authorities are:

- `packages/shared/data-integration/api-contracts`
- `packages/shared/data-integration/metadata-client`
- `packages/shared/runtime-domain/runtime-contracts`
- `packages/shared/runtime-domain/runtime-shared`
- `server/packages/adapters/db/src/prisma/schema.prisma`

## Compatibility removal

Runtime exposure is now derived from the explicit metadata contract: `runtime_enabled`, `read_capability`, and `write_capability`. The old `records_api_disabled`, `generic_runtime_disabled`, and query-pilot rollout flags are no longer seeded, read, or passed through the API/BFF runtime path.

The deprecated `packages/product-deprecated/runtime-ui` tree and its records relay remain a separately tracked deletion tranche because the relay still exists solely as its compatibility boundary. They must be removed together after the last deprecated-tree consumer is deleted; the current retirement inventory remains in `docs/runtime-service-rename.md`.

## Hygiene gate

Run:

```text
pnpm --dir server run meta:hygiene
```

The gate fails if retired duplicate packages, a second Prisma schema, or the removed compatibility tokens return.
