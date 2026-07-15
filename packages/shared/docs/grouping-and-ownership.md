# Shared Packages: Grouping & ownership (business/technical map)

## Active grouping strategy

This directory keeps all shared packages at their current filesystem paths (`packages/shared/<package-name>`)
while classifying each package by business/technical role for review, ownership, and review consistency.

## Canonical groups

### platform-auth
- `auth-bff`
- `auth-common`
- `identity-gate`
- `session-plane`
- `session-store`

### data-integration
- `api-client`
- `api-contracts`
- `route-manifest-core`
- `metadata-client`
- `mesh-exchange-contracts`
- `query`
- `bff-relay`
- `core`
- `config`

### ui-platform
- `ui`
- `theme`
- `surface-kit`
- `shell`
- `workflow-ui`
- `content-ui`
- `collaboration-ui`
- `me-ui`
- `brand`
- `icons`

### runtime-domain
- `runtime-canvas`
- `runtime-contracts`
- `runtime-list`
- `runtime-add-item`
- `runtime-bulk-actions`
- `runtime-line-item`
- `runtime-shared`
- `shell-runtime`

### business-domain
- `finance-rules`
- `cascade`
- `entity-print`
- `print-templates`
- `temporal`
- `domain-widgets`

### shared-infrastructure
- `i18n`

## Migration and reference update notes

- `packages/shared/package-groups.ts` is now the source of truth for group metadata.
- `SharedPackageGroup` is preserved for backward compatibility.
- New business groups are exported via `sharedBusinessGroups` and `sharedPackageGroupAliases` from:
  - `packages/shared/package-groups.ts`
  - `packages/shared/index.ts`
- Use this map when:
  - adding a new package,
  - moving package ownership,
  - planning strict-naming or architecture cleanups,
  - preparing change impact reviews.

## Naming rule alignment (implemented)

- Package folders remain kebab-case (`package-name`).
- Group assignment follows business/technical intent, not just prefix.
- `__tests__` remains unchanged.
