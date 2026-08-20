# Authentication and session production-readiness audit

Date: 2026-08-18  
Scope: Neon, Mesh, and Studio login, logout, OAuth/OIDC, Keycloak, JWT assurance, BFF relay, Redis sessions, exact-plane IAM context, and remembered devices.  
Input: the design review supplied for the current uncommitted `refactor/three-plane-packages` worktree.

## Executive verdict

**Conditional NO-GO for production deployment.**

The reviewed authentication/session code is materially stronger after this audit. The two open design-review gaps are implemented: step-up now requires issuer-proven second-factor evidence, and remembered-device enrollment now exists with hash-only persistence. Step-up rotates the session identifier and CSRF binding, and remembered-device evidence is bound to the exact plane, tenant, principal, authorization epoch, and expiry.

The code-level security slice passes 39 focused tests and both affected TypeScript package checks. The production release is still blocked by deployment and integration evidence, not by a known exploitable defect in the focused BFF/Redis flow:

1. An existing Keycloak realm will not be updated by `start --import-realm`; Keycloak skips startup import when the realm already exists. The live realm must be explicitly and safely reconciled before the application-side `AUTHORIZED`, redirect URI, AMR, ACR, and browser-flow cutovers.
2. The platform-host suite has seven failures because an in-progress exact-plane identity resolver migration is now fail-closed while seven vertical fixtures still provide claim-only identities and no database authority.
3. No live three-plane Keycloak + Redis + PostgreSQL smoke test was available in this audit.
4. All three generated Prisma schemas currently fail validation on pre-existing duplicate governance relation fields. The new `auth_epoch` field is not the reported validation error, but schema validation must be green before a database release.

The base login/session rollout can proceed after these blockers close. Keep remembered-device enrollment unavailable in the UI until its management and operations gates in this report are complete.

## Risk disposition

| ID | Priority | Finding | Disposition |
| --- | --- | --- | --- |
| AUTH-01 | Critical, fixed | Relay refresh coalescing could share refreshed authority across simultaneous users in one BFF process. | Fixed with per-request refresh and exact `realmKey + tenantId + principalId + authEpoch` comparison; concurrent-user regression test passes. |
| AUTH-02 | High, fixed | A completed step-up round trip was enough to elevate a session even if the ID token did not prove a second factor. | Fixed. Password-only `amr` is rejected with `auth.step_up_assurance_missing`; accepted methods are narrowly allowlisted. |
| AUTH-03 | High, fixed | Successful step-up did not rotate the opaque session ID, leaving avoidable session-fixation exposure. | Fixed for interactive and remembered-device elevation; CSRF binding rotates with the session ID. |
| AUTH-04 | High, fixed | Remembered-device verification existed, but no enrollment path or browser secret issuance existed. | Fixed behind explicit `rememberDevice=true`: random 256-bit browser token, SHA-256-only persistence, strict HttpOnly cookie, exact-context server enrollment, and audit event. |
| AUTH-05 | High, fixed | Remembered-device evidence was not tied to the principal authorization epoch. | Fixed in the fresh-schema contract and runtime SQL. Epoch increments make old device evidence ineligible. Existing databases require a reviewed migration. |
| AUTH-06 | High, fixed | A shared Redis principal/provider index could expire at the lifetime of a shorter session and break later bulk revocation. | Fixed with monotonic `PEXPIREAT NX/GT`; regression test passes. |
| AUTH-07 | Medium, fixed | CSRF cookies minted with a previous key could fail during rolling key rotation. | Fixed across logout, touch, context, refresh, and elevation paths; previous-key regression tests pass. |
| AUTH-08 | Medium, fixed | A `context_required` response could expose principal coordinates before context selection. | Producer and contract invariants now suppress/reject those fields. |
| DEPLOY-01 | Release blocker | Startup realm import does not reconcile an existing realm. | Explicit live-realm reconciliation and drift verification are mandatory. Do not treat container restart as a realm migration. |
| TEST-01 | Release blocker | Platform-host integration suite: 74/81 pass; seven exact-context vertical tests fail with `AUTH_CONTEXT_MISMATCH`. | Update fixtures to use a deterministic exact-plane resolver/database authority. Do not restore claim authority or weaken fail-closed behavior. |
| DB-01 | Release blocker | Neon and Studio Prisma validation each report five duplicate relation fields; Mesh reports six. | Repair/regenerate the dirty schemas and make all three `prisma validate` checks pass. |
| LIVE-01 | Release blocker | Static realm and unit contracts do not prove the live IdP emits the required ID/access-token claims. | Run the staging token and session matrix below before promotion. |
| DEVICE-01 | Feature activation blocker | There is no completed user-facing list, rename, revoke-one, revoke-all, or “forget this browser” journey. | Keep the remember-device control hidden until management, limits, and incident runbooks are delivered. |

## Changes made during this audit

### Step-up assurance

- ID-token `amr` is normalized and propagated from the verified Keycloak token.
- Elevation requires at least one explicit second-factor method: `otp`, `webauthn`, `webauthn-passwordless`, `fido`, `fido2`, `hwk`, or `mfa`.
- `acr` remains useful metadata but does not independently satisfy BFF elevation. This prevents a high ACR label from masking missing factor evidence.
- Password-only reauthentication fails without mutating the existing baseline session.
- Successful interactive or remembered-device elevation rotates the session identifier and CSRF token.

### Remembered-device enrollment

- Enrollment is explicit, not automatic: `POST /api/auth/step-up/start?rememberDevice=true` records intent in the one-time, browser-bound OAuth transaction.
- Enrollment happens only after the callback validates OAuth state, browser binding, nonce, issuer, audience, plane, realm, identity continuity, active context, and strong `amr`.
- The browser receives a random 32-byte opaque token in a production `__Host-` cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and bounded `Max-Age`.
- Only the lowercase SHA-256 digest is sent to and stored by the exact-plane authority. The raw token is never logged or persisted server-side.
- The server independently requires a strong authentication method from the access token before inserting a row; a direct call cannot bypass BFF callback validation.
- Enrollment and verification are bound to tenant, principal, authorization epoch, revocation state, and database time-based expiry. Verification advances only `last_seen_at`.
- Enrollment emits `iam.trusted_device.registered` in the same database transaction.
- `AUTH_TRUSTED_DEVICE_TTL_DAYS` defaults to 30 and is constrained to 1 minute through 90 days by the runtime contract.

### Existing controls revalidated

- OAuth authorization-code flow uses PKCE, nonce, one-time state, and a separate HttpOnly browser-binding cookie.
- Provider callback `iss` is checked when returned, and Keycloak ID tokens are signature/issuer/audience verified.
- Redirect URIs are exact callback paths in the checked-in realm, not host wildcards.
- Context selection rotates session state, resets elevation, and accepts only server-discovered membership coordinates.
- Unsafe session routes require same-origin and CSRF proof; the relay strips caller-supplied authority headers and injects server-resolved identity.
- Relay retry is once-only and mutation retry requires idempotency evidence.
- Backchannel logout verifies the logout token, rejects nonce/staleness/replay, and revokes the provider-session index.
- Redis is the server-side session authority; the browser cookie contains only an opaque random identifier.
- Session encryption-key version and Redis namespace version are independent.
- Plane application TTLs match the checked-in realm/client TTLs, and the invariant already has a contract test.

## Keycloak deployment correction

The source design review assumed the checked-in realm would be reapplied during non-local startup. That assumption is incorrect for an already-created realm. Keycloak documents that startup import skips a realm when it already exists. See [Importing and exporting realms](https://www.keycloak.org/server/importExport).

Consequences:

- `--import-realm` is suitable for first bootstrap, not ongoing configuration reconciliation.
- Exact redirect URIs, client-scoped `AUTHORIZED` roles, the `acr` client scope, the `oidc-amr-mapper`, and the step-up browser flow must be verified against the live realm.
- The checked-in realm attaches the AMR mapper to ID and access tokens. Keycloak's mapper inventory describes `oidc-amr-mapper` as the authentication-method-reference mapper; see [Protocol mapper types](https://www.keycloak.org/admin-api/protocol-mappers).
- Do not run an unreviewed full-realm override against production. Export/backup first, calculate drift, apply a reviewed reconciliation, then export and compare the effective result.

## Production rollout sequence

1. **Freeze and inventory.** Record the exact application commit, realm export, Keycloak version, database DDL version, Redis namespace version, and session encryption-key versions for each environment.
2. **Back up Keycloak and plane databases.** Test restore procedures before making the hard role/flow cutover.
3. **Reconcile Keycloak explicitly.** Apply exact client redirect/post-logout URIs, web origins, client-scoped `AUTHORIZED`, organization scope, ACR/AMR mappers, and the Neon/Mesh/Studio browser flows. Preserve a reviewed rollback export.
4. **Verify live tokens before deploying BFF changes.** For every plane, decode a real interactive-login ID token and access token. Confirm issuer, intended audience/authorized party, organization, plane, client role, session ID, and expected AMR. Repeat after `max_age=0` step-up and prove the second factor appears in both tokens.
5. **Apply a reviewed database migration.** Add `authz.trusted_device.auth_epoch`; treat all historical rows as untrusted during migration, populate evidence only for constraint completion, and revoke them rather than grandfathering them. Apply the constraint, trigger guard, and schema metadata in Neon, Mesh, and Studio.
6. **Repair exact-plane integration fixtures and Prisma schemas.** Require the platform-host suite and all three Prisma validations to pass.
7. **Deploy runtime API before web BFFs.** Confirm `/api/iam/contexts` and trusted-device endpoints are healthy in all planes. Enrollment remains hidden.
8. **Deploy BFFs one plane at a time.** Canary Neon, then Mesh, then Studio unless business criticality requires a different order.
9. **Increment `AUTH_CONFIGURATION_REVISION`.** This lazily invalidates incompatible existing BFF sessions. Do not change `SESSION_STORE_VERSION` unless deliberate namespace-wide invalidation is required. Do not rotate the encryption key in the same change unless necessary; isolating variables simplifies rollback.
10. **Run the live acceptance matrix.** Promote only after the matrix below passes and telemetry remains within thresholds.
11. **Enable remembered-device UI separately.** Ship list/revoke/forget controls, active-device limits, abuse controls, and incident procedures before exposing `rememberDevice=true` to ordinary users.

For the `AUTHORIZED` hard cutover, grant and verify the new client role before deploying code that requires it. Retaining the role during rollback is harmless; deploying app enforcement before live realm reconciliation is not.

## Required live acceptance matrix

Run each case against Neon, Mesh, and Studio unless explicitly noted.

### Login and context

- New browser login succeeds with exact redirect URI, PKCE, browser binding, nonce, issuer, and audience validation.
- A copied callback URL without the initiating browser cookie fails.
- State replay fails after the first callback.
- Wrong plane, realm, tenant, organization, subject binding, principal status, or authorization epoch fails closed.
- Zero contexts denies access; one auto-selects; multiple require explicit selection without exposing an unselected principal.
- Context switch rotates the session ID and CSRF value and resets elevated assurance.

### Step-up and remembered device

- Password-only step-up returns 403 and the old session remains baseline.
- OTP and WebAuthn step-up each return a rotated session whose old cookie is unusable.
- ID and access tokens both carry the expected second-factor AMR after step-up.
- Enrollment stores only a 64-character hash and the current authorization epoch; no raw secret appears in database, logs, traces, audit metadata, or HTTP responses.
- Valid trust evidence elevates only the matching plane/tenant/principal/epoch and never beyond the shorter of device, elevation, and absolute-session expiry.
- Revoked, expired, wrong-principal, wrong-tenant, wrong-plane, wrong-epoch, malformed, and random device tokens fail closed.
- Principal suspension or authorization-epoch increment invalidates both the active BFF session and previously enrolled trust evidence.

### Refresh, Redis, and logout

- Two different users receiving simultaneous upstream 401 responses never share refreshed authority.
- Same-user concurrent refresh coalesces safely; failure releases the lock.
- Redis outage fails login/session/refresh/logout closed without queued authorization work.
- Principal and provider revocation indexes survive until the latest indexed session expires.
- Local logout revokes the BFF session and clears session/CSRF cookies.
- Global logout uses one-time state; backchannel logout revokes all matching provider sessions and rejects replay.
- Current and previous CSRF keys both work during a planned rolling rotation; an unknown key does not.

### Browser and platform behavior

- Cookie flags are observed at the external TLS boundary, including the production `__Host-` names.
- HSTS, CSP, frame restrictions, referrer policy, and cache-control are confirmed at the gateway/browser boundary.
- No access, refresh, ID, device, session, or CSRF token appears in application logs, error tracking, browser-readable storage, analytics, or URLs.
- Clock skew between Keycloak, application nodes, Redis, and PostgreSQL is within the operational budget.

## Operational requirements before remembered-device activation

- User UI/API for list, rename, revoke-one, revoke-all, and forget-this-browser.
- A bounded active-device count per principal, deterministic oldest-device eviction or explicit conflict behavior, and enrollment/verification rate limits.
- Automatic bulk revocation on principal suspension, credential compromise, administrator reset, and other authorization-epoch increments. Epoch binding already prevents use; revocation provides retained operational evidence and cleanup.
- Metrics and alerts for step-up attempts/outcomes, missing strong AMR, enrollment outcomes, invalid-device rate, database/Redis failures, context mismatches, refresh contention, and backchannel logout no-match/replay.
- Privacy review and retention policy for user-agent, IP, last-seen, audit, and revoked-device evidence.
- Support and incident runbooks that never request the raw device or session cookie from a user.

## Validation evidence

| Validation | Result |
| --- | --- |
| Focused auth, relay, Redis-index, trusted-device, and trusted-device DDL contracts | **39/39 passed** |
| `@athyper/platform-iam-auth-bff` TypeScript check | **Passed** |
| `@athyper/server-platform-host` TypeScript check | **Passed** |
| Checked-in Keycloak three-plane contract and canonical check | **Passed** |
| MFA authority verifier | **Passed** |
| Federated-assurance verifier | **Passed** |
| BFF relay policy verifier | **Passed** |
| Runtime database qualification tests | **3/3 passed** |
| Platform-host full suite | **74/81 passed; 7 exact-context fixture failures** |
| Prisma validation | **Failed on pre-existing duplicate relation fields: Neon 5, Mesh 6, Studio 5** |
| Relevant-file whitespace/error check | **Passed** |
| Live Keycloak/Redis/PostgreSQL/browser test | **Not run; environment was not supplied** |

The seven host failures are in IAM/Audit, Documents, Workflow, Policy, and Metadata/Records vertical tests. They all fail with `AUTH_CONTEXT_MISMATCH` before their intended route behavior. The production composition correctly supplies the exact-plane resolver and fails closed; test fixtures must supply equivalent authoritative identity data rather than relying on token claims.

## Residual limitations

- Static realm JSON checks cannot prove the configuration currently loaded in staging or production.
- Unit/static tests do not exercise real Keycloak authentication executions, reverse-proxy cookie handling, Redis Lua behavior on a clustered/managed deployment, database RLS roles, network partitions, or clock skew.
- The worktree contains extensive unrelated and unfinished changes. This audit intentionally did not weaken or rewrite the exact-plane resolver migration to make legacy tests pass.
- Client-ID overrides are a coordinated trust change. The context-discovery server currently trusts the registered `neon-web`, `mesh-web`, and `studio-web` clients exactly; changing those IDs requires an explicit realm and server allowlist migration.
- An existing database needs an additive migration for `auth_epoch`; changing the fresh-install DDL alone is insufficient.

## Final release criteria

Production approval requires all of the following:

- Live Keycloak reconciliation completed and exported drift is clean.
- Live ID/access-token AMR evidence passes for OTP and WebAuthn in every enabled plane.
- Database migration applied and verified in all three planes.
- Platform-host tests and all three Prisma validations pass.
- Three-plane login/context/step-up/refresh/logout acceptance matrix passes.
- Dashboards, alerts, rollback owner, and tested backups are documented.
- Remembered-device UI remains disabled until DEVICE-01 closes.

Until then, the correct status is **code-level auth fixes validated; production release not yet approved**.

## Continuation validation — 2026-08-18

- The seven exact-plane host fixtures now inject a deterministic exact-plane identity authority through a composition-only seam. Production still defaults to the Kysely resolver and remains fail-closed. The complete platform-host suite passes **81/81**, and its TypeScript check passes.
- Duplicate Prisma back-relation names and incorrect generated relation cardinalities were repaired. Neon, Mesh, and Studio schemas all pass `prisma validate` (remaining `SetNull` messages are non-fatal warnings).
- Added `server/db/migrations/20260818_trusted_device_auth_epoch.sql`. It adds the non-null epoch and check constraint, revokes any unverifiable historical device evidence, refreshes the immutability guard, and is safe to reapply. It was applied successfully to the local `athyper_neon`, `athyper_mesh`, and `athyper_studio` databases; each now reports `auth_epoch integer NOT NULL`. Deployment environments still require their own controlled execution and verification.
- No UI references `rememberDevice`; only the BFF opt-in query handling and internal trusted-device endpoints exist. The user-facing feature therefore remains hidden as required.
- Live Keycloak inspection after the reported import found the realm still configured with `browserFlow: browser`, while `neon-web`, `mesh-web`, and `studio-web` each have empty `authenticationFlowBindingOverrides`. Therefore DEPLOY-01 is **not yet evidenced as closed** in this environment. Live OTP/WebAuthn ID-token and access-token AMR acceptance testing remains blocked until the intended flows are effectively bound and real ceremonies can be completed.
