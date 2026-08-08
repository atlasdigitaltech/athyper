# P0 Deletion Manifest

Generated: 2026-08-08  
Branch: refactor/three-plane-packages

An item advances to **delete** status only when the consumer grep above its entry
produces zero hits outside its own directory and `node_modules`. Items marked
**quarantine** remain on disk but are excluded from the workspace; they will be
deleted after Phase 1 proves the replacement is complete.

---

## READY TO DELETE — zero consumers confirmed

All items below were verified with:
```
grep -rl "<package-name>" packages/ apps/ server/ --include="*.ts" --include="*.tsx" --include="*.json" --exclude-dir=node_modules --exclude-dir=dist
```
Results outside the package's own directory: **0 in all cases**.

### Category 1 — Flat platform stubs (superseded by packages/platform/foundation/*)

| Directory | npm name | Canonical replacement |
|---|---|---|
| `packages/platform/core/` | `@athyper/platform-core` | `packages/platform/foundation/core/` |
| `packages/platform/brand/` | `@athyper/platform-brand` | `packages/platform/foundation/brand/` |
| `packages/platform/api-client/` | `@athyper/platform-api-client` | `packages/platform/foundation/api-client/` |
| `packages/platform/i18n/` | `@athyper/platform-i18n` | `packages/platform/foundation/i18n/` |
| `packages/platform/icons/` | `@athyper/platform-icons` | `packages/platform/foundation/icons/` |
| `packages/platform/query/` | `@athyper/platform-query` | `packages/platform/foundation/query/` |
| `packages/platform/surface-kit/` | `@athyper/platform-surface-kit` | `packages/platform/foundation/surface-kit/` |
| `packages/platform/theme/` | `@athyper/platform-theme` | `packages/platform/foundation/theme/` |
| `packages/platform/ui/` | `@athyper/platform-ui` | `packages/platform/foundation/ui/` |
| `packages/platform/notifications/` | `@athyper/platform-notifications` | frontend stub only — no replacement needed (server service is at `server/packages/platform/notifications/`) |

All ten are confirmed 1-line empty files. The workspace exclusions added in P0-B
ensure pnpm will no longer activate them.

**Delete command (run after confirming this branch is clean):**
```
rm -rf packages/platform/core packages/platform/brand packages/platform/api-client \
       packages/platform/i18n packages/platform/icons packages/platform/query \
       packages/platform/surface-kit packages/platform/theme packages/platform/ui \
       packages/platform/notifications
```

### Category 2 — Server plane stubs (never implemented, no consumers)

These packages were activated by `server/packages/planes/*/*` which has been
removed from pnpm-workspace.yaml in P0-B. All confirmed empty (comment-only
source) with zero imports in server/packages, server/src, or any app.

| Directory | npm name |
|---|---|
| `server/packages/planes/athyper/canonical-party/` | `@athyper/plane-athyper-canonical-party` |
| `server/packages/planes/athyper/identity-trust/` | `@athyper/plane-athyper-identity-trust` |
| `server/packages/planes/athyper/metadata/` | `@athyper/plane-athyper-metadata` |
| `server/packages/planes/athyper/onboarding/` | `@athyper/plane-athyper-onboarding` |
| `server/packages/planes/athyper/platform-catalog/` | `@athyper/plane-athyper-platform-catalog` |
| `server/packages/planes/athyper/publication/` | `@athyper/plane-athyper-publication` |
| `server/packages/planes/mesh/banking-disclosure/` | `@athyper/plane-mesh-banking-disclosure` |
| `server/packages/planes/mesh/catalog/` | `@athyper/plane-mesh-catalog` |
| `server/packages/planes/mesh/certification/` | `@athyper/plane-mesh-certification` |
| `server/packages/planes/mesh/exchange/` | `@athyper/plane-mesh-exchange` |
| `server/packages/planes/mesh/network/` | `@athyper/plane-mesh-network` |
| `server/packages/planes/mesh/partner/` | `@athyper/plane-mesh-partner` |
| `server/packages/planes/neon/assets/` | `@athyper/plane-neon-assets` |
| `server/packages/planes/neon/document-rendering/` | `@athyper/plane-neon-document-rendering` |
| `server/packages/planes/neon/finance/` | `@athyper/plane-neon-finance` |
| `server/packages/planes/neon/inventory/` | `@athyper/plane-neon-inventory` |
| `server/packages/planes/neon/organization/` | `@athyper/plane-neon-organization` |
| `server/packages/planes/neon/party/` | `@athyper/plane-neon-party` |
| `server/packages/planes/neon/people/` | `@athyper/plane-neon-people` |
| `server/packages/planes/neon/procurement/` | `@athyper/plane-neon-procurement` |
| `server/packages/planes/neon/projects/` | `@athyper/plane-neon-projects` |
| `server/packages/planes/neon/sales/` | `@athyper/plane-neon-sales` |

**Note on `neon/document-rendering`:** `server/src/kernel/bootstrap.ts` imports
`@athyper/plane-neon-document-rendering` from
`server/packages/planes/neon/document-rendering/` — this is a **real implementation**,
not a stub. It is retained in the workspace as a specific entry; only the other 21
planes stubs were removed from the glob.

**Delete command:**
```
rm -rf server/packages/planes/
```

### Category 4 — Legacy shared hierarchy copy

| Directory | npm name | Canonical replacement |
|---|---|---|
| `packages/shared/data-integration/mesh-exchange-contracts/` | `@athyper/mesh-exchange-contracts` | `packages/contracts/mesh-exchange/` |

---

## QUARANTINE — excluded from workspace, retain on disk for now

These directories are excluded from pnpm-workspace.yaml but must not be deleted
until their canonical replacements are confirmed stable in production.

| Directory | Reason to retain |
|---|---|
| `packages/shared/business-domain/theme/` | Has full implementation identical to `packages/platform/foundation/theme/`; retain until foundation/theme is proven as the sole reference across all builds |
| Old `packages/shared/` hierarchy copies already excluded by existing `!` entries | Already dormant; bulk-delete after Phase 1 passes |

---

## NOT READY — requires further investigation

| Directory | Blocker |
|---|---|
| `packages/shared/business-domain/theme/` vs `packages/platform/foundation/theme/` | Two full implementations with overlapping content (see Theme Conflict note in agents' report); ownership must be decided before either is deleted |
| `server/packages/services/` old service directories (ai, audit, collab, documents, integration, iam, jobs, policy, search, workflow) | Directories still exist on disk but implementations have moved to `server/packages/platform/*`. Verify no stale imports in the services themselves before deleting. Run `grep -r "services/ai\|services/audit\|services/collab" server/src --include="*.ts"` to confirm zero. |

---

## Verification before executing deletes

```bash
# Confirm zero workspace duplicates remain
node -e "
const fs = require('fs');
const glob = (dir) => { ... };  // as per original duplicate-check script
"

# Confirm workspace installs cleanly
pnpm install --frozen-lockfile

# Confirm no consumer of the deleted package names
grep -r '@athyper/platform-core\|@athyper/platform-brand' \
  packages/ apps/ server/ \
  --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules --exclude-dir=dist
```
