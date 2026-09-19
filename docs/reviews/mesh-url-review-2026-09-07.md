# Mesh URL code review — 2026-09-07

Reviewed the user-listed Mesh URL surface at `https://mesh.dev.athyper.test`, using the current local checkout. Reviewed every Mesh page and route adapter, authentication/bootstrap and relay implementations, catalog-driven workspace/module rendering, account selection, Business Partner controls, service worker, and health/configuration code. This is a source review with unauthenticated live smoke checks, not a certification of every authenticated business workflow.

## Manual authentication confirmation

The user subsequently confirmed that Mesh login and authentication work. The supplied screenshot shows `https://mesh.dev.athyper.test/home` rendering the signed-in Mesh shell for CirrusAtlantic Ltd, with the Catl Admin account and workspace navigation visible. Record login and authenticated home rendering as manually verified by the user.

This confirmation resolves the lack of manual login evidence. The 12-test automated authenticated suite and other business workflows remain unverified; the screenshot does not establish their results.

## Follow-up: verification blockers resolved

The current workspace now passes both `@athyper/server-platform-host` and `@athyper/server-plane-mesh` typechecks. The shared response-map type fix was already present when the follow-up began. URL extraction fixes were also present; `pnpm urls:generate` regenerated the catalogue successfully and `pnpm urls:check` passes. All 20 URL-catalogue/manifest tests pass.

The three Neon registration assertions were repaired by inspecting the TypeScript syntax tree of the actual `createRelayHandler` operation array. The checks tolerate nested conditional pilot arrays while requiring unconditional registrations; imports or references inside conditional branches alone cannot satisfy them. The full root contract suite now reports **254 passed, 12 skipped, zero failures**.

A dedicated authenticated Mesh suite is available at `tests/e2e/mesh-review`, with configuration `tooling/config/playwright.mesh-review.config.ts`. Discovery confirms 12 tests. Execution was attempted and explicitly stopped at authentication setup: no Mesh credentials are configured, and the existing Mesh storage-state file has no cookies. Automated authenticated verification remains pending; the automated suite is not reported as passed. See `tests/e2e/mesh-review/README.md` for credentials/storage-state setup and the exact execution command. The target service must include the reviewed frontend and Runtime changes before it can validate those changes.

The verification section below records the original review run; its typecheck, catalogue and Neon-assertion blockers are superseded by this follow-up.

## Confirmed findings and changes

| Priority | Finding | Resolution |
| --- | --- | --- |
| High | `/mdg/business-partner/relationships` never transmitted the selected network account. Network workspace, relationship and registration services require `permissions.networkAccountId`, which ordinary browser session resolution does not populate. | Browser operations now include an explicit account coordinate. Runtime resolves it against the current principal's authorized account catalog before binding it to the service context. Missing/malformed selections return 400; unauthorized selections return 403 before service invocation. Existing domain authorization remains in force. |
| Medium | Switching the acting account could retain the previous network workspace, form values or pending response. | Remount the network exchange workspace on account changes. Old component responses cannot populate the newly selected account's controls. |
| Medium | Blocked localStorage reads/writes could turn successful account discovery into an error or throw during account selection. The recovery catch also accessed blocked storage. | Optional persistence helpers tolerate unavailable storage and keep the selected account in React state. |
| Medium | Account-provider state could survive tenant/principal changes; cancelled catalog requests could still set state. | Key the provider by tenant/principal and discard successful responses after cancellation. |
| Medium | Protected bootstrap sends required-action sessions to `/auth/required-action`, but Mesh had no public recovery route there. | Add a public account-setup recovery page with a sanitized return destination and a link back through OIDC login. It does not load protected bootstrap or bypass issuer actions. |
| Medium | Mesh's development-origin allowlist omitted the user-specified `mesh.dev.athyper.test` host. | Add the development hostname while retaining the existing local alias. |
| High / Medium | Notification click fallback changed only the pathname of an external URL, retaining its origin; null push data could crash the push handler. | These shared-worker fixes appeared concurrently in the workspace during review. Preserved them and added executable regression coverage for external/malformed click URLs and null payloads. They are not attributed to this review's implementation changes. |

New source route: `GET /auth/required-action`.

## Verification

- Updated Mesh production build passes, including TypeScript and the new recovery route.
- 74 focused contract tests pass: auth/session/deep links, Mesh account parsing and persistence, notification behavior, catalog surfaces and app composition.
- Mesh server suite: all 92 tests pass across 9 files, including 3 account-context regression tests. The HTTP case proves unauthorized/missing selections never invoke business handlers, and authorized GET/POST requests receive the bound account.
- Broad root contracts: 235 passed, 12 skipped, 3 failed. All three failures are existing source-regex assertions against the modified Neon relay's nested conditional operation arrays (Atlas, entity-list, record-transfer registrations). They do not indicate failing Mesh allowlists.
- Mesh server and platform-host typechecks are blocked by the existing TS2322 error at `server/packages/runtime/http/src/route-contract.ts:243`: conditional response entries can be undefined against the numeric response index signature. No additional type errors were reported in these runs.
- URL catalogue regeneration was attempted but is blocked by the existing unresolved dynamic route at `server/packages/platform/control-admin/src/control-service-routes.ts:139`. The generated catalogue was left with its pre-review contents; rerun `pnpm urls:generate` after that generator/input issue is resolved to include the recovery route.
- Diff whitespace checks pass for the changed implementation files.

## Live validation and limits

The development server uses a self-signed certificate. Smoke requests used curl's certificate-verification bypass only for this local development origin. No certificate verification setting was changed in application code.

Unauthenticated protected page responses return HTTP 200 streaming shells, with embedded Next.js redirects to login; a `/home` response was inspected to verify this. HTTP 200 alone does not demonstrate authorized page content or functioning backend business operations. No authenticated browser credentials were supplied, and no real relationship, publication, bank, import or approval mutation was performed.

`GET /api/auth/login` returned 302 to `iam.dev.athyper.test`, with client `mesh-web`, the correct Mesh callback, a state value and S256 PKCE. Callback requests without protocol state redirected to the public recovery UI. Session reads returned anonymous state; contexts and allowlisted relay reads rejected anonymous access. Invalid backchannel input returned 400. Auth mutation requests without a session were rejected; browser logout used the navigation wrapper. Unsupported relay method/path combinations returned 404.

These checks ran against the currently running development service. Local changes were built and tested but were not deployed or merged by this review.

### GET smoke results

```text
/ 200 
/api/auth/callback 303 https://mesh.dev.athyper.test/sign-in?reason=retry
/api/auth/contexts 401 
/api/auth/logout/callback 303 https://mesh.dev.athyper.test/sign-in?reason=logout-incomplete
/api/auth/session 200 
/api/relay/platform/experience/bootstrap 401 
/api/relay/unregistered 404 
/atlas 200 
/commercial-collaboration 200 
/commercial-collaboration/contract 200 
/commercial-collaboration/sourcing 200 
/commercial-collaboration/transaction 200 
/core 200 
/core/activity 200 
/core/audit 200 
/core/automation 200 
/core/content 200 
/core/documents 200 
/core/foundation 200 
/core/identity-access 200 
/core/integration 200 
/core/notifications 200 
/core/policies 200 
/core/reference-data 200 
/core/workflows 200 
/financial-collaboration 200 
/financial-collaboration/financing-programs 200 
/financial-collaboration/partner-network 200 
/financial-collaboration/payments-working-capital 200 
/financial-collaboration/trade-finance 200 
/home 200 
/inbox 200 
/livez 200 
/logout 200 
/mdg 200 
/mdg/business-partner 200 
/mdg/business-partner/profile 200 
/mdg/business-partner/relationships 200 
/mdg/business-partner/requests 200 
/network-relationships 200 
/network-relationships/intelligence 200 
/network-relationships/marketplace 200 
/network-relationships/partner-network 200 
/network-relationships/relationships 200 
/notification-sw.js 200 
/notifications 200 
/operations/data-transfers 200 
/operations/data-transfers/new 200 
/readyz 200 
/select-context 200 
/sign-in 200 
/supply-services 200 
/supply-services/supply-chain 200 
/supply-services/workforce-services 200 
```

### Method smoke results

```text
POST /api/auth/backchannel-logout 400 auth.invalid_request
POST /api/auth/logout 303 
POST /api/auth/mfa/verify 401 auth.unauthenticated
POST /api/auth/refresh 401 auth.unauthenticated
POST /api/auth/session/context 401 auth.unauthenticated
POST /api/auth/step-up/start 401 auth.unauthenticated
POST /api/auth/touch 401 auth.unauthenticated
DELETE /api/relay/platform/experience/bootstrap 404 RELAY_OPERATION_NOT_ALLOWED
GET /api/relay/platform/experience/bootstrap 401 AUTHENTICATION_REQUIRED
PATCH /api/relay/platform/experience/bootstrap 404 RELAY_OPERATION_NOT_ALLOWED
POST /api/relay/platform/experience/bootstrap 404 RELAY_OPERATION_NOT_ALLOWED
PUT /api/relay/platform/experience/bootstrap 404 RELAY_OPERATION_NOT_ALLOWED
```
