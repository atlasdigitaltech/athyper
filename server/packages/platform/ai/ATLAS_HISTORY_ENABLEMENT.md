# Atlas conversation history enablement — 2026-09-07

The shared API now composes durable conversation history without requiring an inference provider. This applies to Neon, Mesh, and Studio. Each request selects its verified plane database and establishes transaction-local tenant, principal, and Atlas-plane scope; conversations are not pooled across planes or tenants.

## Changes

- Added the PostgreSQL thread repository: create, bounded cursor pagination, messages, rename, archive, soft delete, and participant management. Writes enforce owner access, row versions, and legal holds; reads honor participant access and expiry.
- Added exact-plane capability authorization and database-backed retention policies, with a 30-day default. Denied, plan-locked, and plane-excluded permissions override allowed permissions.
- Added `mesh.ai.agent.use` and `studio.ai.agent.use` to canonical catalogs and generated seed packs. Local enablement adds only the Atlas capability to existing demo tenant-admin roles; it does not create users, memberships, or role assignments. Fresh provisioning continues through the existing authorization seed process.
- Added the missing runtime grant for the database helper used by conversation participant guards.
- Enabled `ATLAS_AGENT_ENABLED=true` and `ATLAS_CONVERSATION_PERSISTENCE_ENABLED=true` on the development API. Kept `ATLAS_AGENT_TOOLS_ENABLED=false` because provider and command dependencies are not composed.
- Preserved existing Compose overlays and API environment settings. Added the local Atlas overlay to the development controller so subsequent deployments retain the configuration.
- The new image also includes existing control-admin changes that require lookup reference governance. Added and applied their source DDL as a forward migration; this resolved the readiness failure exposed by deployment.

## Verification

- AI package: **148 tests passed**; TypeScript checks passed.
- Host Atlas composition: **4 tests passed**; host TypeScript checks passed.
- Deployment/controller model: **21 tests passed**.
- Canonical permission catalog validation passed for all three planes.
- PostgreSQL behavior passed in **all three plane databases**, using the non-bypass `athyper_runtime` role: create/list/read, rename, stale-version rejection, stranger isolation, archive, and delete. Test fixtures were rolled back.
- Deployed API `/readyz`: **HTTP 200**, every health check healthy, including `atlas.conversation-persistence`.
- Authenticated browser `/api/relay/atlas/threads`: **pending a fresh MFA code**. The prior session expired. An authentication response is not a successful history-response verification.

## Remaining provider work

Answer generation and tools are not enabled. There is no configured provider dependency bundle in the API entrypoint, and the Studio tenant-provider credential table is empty. History operates independently; a run without a runtime returns `503 PROVIDER_UNAVAILABLE` and admission reports `chatAllowed=false`. The existing fully composed provider/runtime path remains supported, but choosing a provider, supplying its secret through the secret store, and completing that production composition remain outstanding.

## Reproducible local checks

```sh
pnpm --filter @athyper/server-platform-ai test
pnpm --filter @athyper/server-platform-ai typecheck
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/__tests__/ai-vertical.test.ts
node --import tsx tooling/scripts/verification/verify-local-atlas-conversations.mts
```

The local PostgreSQL verifier uses the existing Docker database and rolls back its synthetic data. The additive local permission setup is `node --import tsx tooling/scripts/verification/setup-local-atlas-authority.mts --apply`; it targets the development Docker databases only.

Deployment configuration: `~/.athyper/instances/dev/config/local-atlas.compose.json`.
Deployment receipt: `~/.athyper/instances/dev/receipts/atlas-history-deployment.json`.
