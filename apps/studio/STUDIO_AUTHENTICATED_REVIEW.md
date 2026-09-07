# Studio authenticated follow-up

2026-09-07. Signed in as `catl.admin`, completed the identity provider's authenticator challenge, selected **CirrusAtlantic**, and verified `state=authenticated`, `plane=studio` through the BFF. Session state is stored in the ignored `tests/e2e/.auth/studio.json` with mode 0600. No password or authenticator code was written into source files.

## Results

- Paced server requests to all **57 protected page URLs** returned HTTP 200 without numeric server-render error digests or sign-in redirects. This does not prove authorization of every rendered page: the shell can display an access-denied page with HTTP 200.
- Six representative pages were rendered on both desktop and mobile (12 browser checks); findings below.
- The initial production-suite attempt could not find its storage-state file. After fixing the paths, the broad suite recorded **14 passed, 6 failed, 44 skipped, 28 not run**, stopping at its failure limit. Concurrent broad sweeps hit the runtime limit of 100 requests/minute and produced bootstrap 429 errors. Those errors are not treated as independent page defects.
- Clean targeted recheck: identity-provider sign-in **passed on desktop and mobile**; Business Partner definition **failed on both**, consistently showing Access denied on the unchanged deployment.
- Local regression tests for shell navigation, state paths and MFA-session reuse: **19 passed**. Studio production build passed after the local fixes.

## Fixes made during this follow-up

1. Resolve Playwright storage-state paths relative to its configuration file, rather than the shell working directory.
2. Add explicit `PLAYWRIGHT_REUSE_AUTH_STATE=studio` support. The setup validates the saved session against `/api/auth/session` and fails if the session is anonymous, context-incomplete or from another plane. Normal credential-based setup remains the default.
3. Correct the public-login browser test to use `/api/auth/login` and support identity-first sign-in rather than assuming a password field on the initial screen.
4. Register `/inbox` and `/notifications` as exact shared authenticated-shell activity routes. Their URLs were omitted from the shell's system-route handling, causing false access denials.
5. Register the Studio `/mdg` hierarchy under the existing publication module and `studio.business_partner_definition.read` permission. The registry previously covered only its publication child. The live bootstrap confirms this account has both the publication entitlement and definition-read permission, so the missing registration—not missing account authority—explains the MDG denial.

The code fixes above are **local and not deployed**. Backend authorization is still enforced; no roles, tenant entitlements, or MFA settings were changed.

## Clean browser observations on the existing deployment

| Device | URL | Observation |
| --- | --- | --- |
| desktop | `/home` | Rendered without observed browser exceptions or failed API requests |
| desktop | `/notifications` | Shell displays Access denied; local route-registration fix added |
| desktop | `/atlas` | Atlas history request returns 404 ROUTE_NOT_FOUND |
| desktop | `/entity/experiences` | Rendered without observed browser exceptions or failed API requests |
| desktop | `/mdg/business-partner` | Shell displays Access denied; local route-registration fix added |
| desktop | `/mdg/business-partner/ai-experience` | Shell displays Access denied; local route-registration fix added |
| mobile | `/home` | Rendered without observed browser exceptions or failed API requests |
| mobile | `/notifications` | Shell displays Access denied; local route-registration fix added |
| mobile | `/atlas` | Atlas history request returns 404 ROUTE_NOT_FOUND |
| mobile | `/entity/experiences` | Rendered without observed browser exceptions or failed API requests |
| mobile | `/mdg/business-partner` | Shell displays Access denied; local route-registration fix added |
| mobile | `/mdg/business-partner/ai-experience` | Shell displays Access denied; local route-registration fix added |

The Atlas history failure persists after pacing: `/api/relay/atlas/threads` returns `404 ROUTE_NOT_FOUND`. The local backend source defines this route, so runtime registration/deployment parity still needs verification before claiming the live Atlas flow is fixed. The broad suite also observed an Atlas Add-menu focus assertion failure; it was not resolved or certified by this follow-up.

## Reuse the MFA session

Run from the repository root while the session remains valid:

```sh
PLAYWRIGHT_STUDIO_BASE_URL=https://studio.dev.athyper.test \
PLAYWRIGHT_REUSE_AUTH_STATE=studio \
PLAYWRIGHT_PRODUCTION_MATRIX=1 \
bash tooling/scripts/verification/run-playwright-with-linux-deps.sh \
  test --config=tooling/config/playwright.config.ts \
  --project=production-studio-desktop \
  --project=production-studio-mobile
```

Use the reuse option only for the selected plane's projects. The full suite still requires deployment of the local fixes and appropriate seeded fixtures; the command is not a claim that it currently passes. Avoid concurrent broad browser sweeps against the same tenant/principal. When the BFF reports expiration, complete a fresh sign-in and MFA challenge instead of extending cookie timestamps.

## Atlas history root cause confirmed

The running `athyper-dev-api-1` container has neither `ATLAS_AGENT_ENABLED` nor `ATLAS_CONVERSATION_PERSISTENCE_ENABLED` set. Host configuration defaults both to false. `registerAtlas()` therefore returns before registering `/api/atlas/threads`, producing the observed `ROUTE_NOT_FOUND` response through the otherwise valid relay.

Enabling flags alone is insufficient: the API entrypoint currently calls `registerServices(container, {}, config)`, without the Atlas dependency bundle. When Atlas is enabled without that bundle, registration explicitly throws. The bundle includes conversation storage and authorization, retention/admission policies, model/provider bindings, credential resolution and runtime services.

Resolution requires composing the Atlas dependencies and then enabling the two flags and redeploying the API. Conversation history should subsequently return a successful list response for an authorized Studio session. Tool execution has its own flag and is not required merely to register history. No flags, provider credentials, or running services were changed during this diagnosis.

## Subsequent Atlas enablement

The diagnosis above describes the pre-fix deployment. Durable history has now been composed and enabled on the shared development API for Neon, Mesh, and Studio, with per-plane database isolation and capability checks. All API readiness checks pass. Authenticated history verification is awaiting a fresh MFA code; generation remains unavailable pending provider composition. See [Atlas history enablement](../../server/packages/platform/ai/ATLAS_HISTORY_ENABLEMENT.md) for changes, tests, and remaining work.
