# Frontend authentication and session foundation

Phase 3 makes the browser session a sanitized projection of a server-owned Redis record. `@athyper/platform-iam-session` owns the canonical safe contract and pure decisions. `@athyper/platform-iam-session-store` and `@athyper/platform-iam-auth-bff` are server-only conditional exports and fail browser resolution intentionally.

## Runtime flow

1. `/api/auth/login` creates PKCE verifier/challenge, state, and nonce. The one-time transaction is stored atomically in the plane-and-realm Redis namespace.
2. `/api/auth/callback` consumes state once, exchanges the code, verifies the signed ID token, validates issuer, audience, nonce, time, plane, realm, role, subject, and provider session, then rotates the opaque session identifier.
3. The production cookie is `__Host-athyper-session`, with `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`. Redis sees only the SHA-256 hash of the opaque identifier.
4. `/api/auth/session` returns safe context, expiry hints, assurance, required actions, version/epoch, configuration revision, and allowed next actions. It never returns provider-session IDs or token material.
5. Context changes rotate the identifier and increment epoch/version. Refresh uses a Redis lock and compare-generation replacement so concurrent requests coalesce.
6. Logout has two explicit scopes. **Application logout** revokes only the current plane's Redis session and leaves the Keycloak SSO session and other plane sessions available. **Athyper-wide logout** performs OIDC RP-Initiated Logout using the server-held ID token, a one-time Redis logout state, and an exact post-logout callback URI.
7. Keycloak back-channel logout is the cross-plane revocation mechanism. Each participating client posts a signed logout token to its own `/api/auth/backchannel-logout`; the BFF verifies issuer, audience, event, `sid`, `iat`, `jti`, expiry, age, and absence of nonce, consumes the `jti` once in Redis, and revokes that plane's provider-session index.

## Logout guarantees

- Browser forms must provide the session-bound CSRF value and pass same-origin checks for both logout scopes.
- Browser cookies are discarded after an authenticated logout request even when Redis revocation becomes unavailable, but the UI reports `logout-incomplete`; it never reports a verified sign-out on a failed revocation.
- Application logout is not presented as global logout. A later login may reuse the existing Keycloak SSO session.
- Athyper-wide logout redirects through Keycloak and reports completion only after the one-time logout callback state is consumed.
- Keycloak clients use back-channel rather than iframe/front-channel logout. The registered post-logout redirect is the exact `/api/auth/logout/callback` path, not a broad production wildcard.
- A valid replayed back-channel logout token is idempotent. A valid first delivery that matches no Redis session is recorded as an operational warning.

## Required environment

- `REDIS_URL`: mandatory Redis connection; there is no runtime memory fallback.
- `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, and the plane client ID variables.
- `APP_ORIGIN`: canonical same-origin application URL used for the callback.
- `SESSION_TOKEN_ENCRYPTION_KEY`: base64-encoded 32-byte current AES-256-GCM key.
- `SESSION_KEY_VERSION`: positive current namespace/encryption key version.
- `SESSION_TOKEN_PREVIOUS_KEYS`: optional JSON map from previous numeric versions to base64 keys, allowing rolling decryption during rotation.
- `AUTH_CONFIGURATION_REVISION`: changing this revision allows stale session invalidation policy to be applied consistently.

The environment adapter is lazy: builds do not contact Redis or Keycloak. The first authentication request initializes the adapters and fails closed if required configuration, Redis, atomic commands, or verification keys are unavailable.

The same runtime derives a CSRF proof bound to the opaque session identifier. The proof is rotated on login and context change and is stored in a separate host-prefixed `SameSite=Strict` cookie. It contains no token or principal context and is compared by the relay in constant time.

Step-up and MFA routes return `auth.capability_unavailable` with HTTP 501 because the active BFF/server contract does not yet expose a supported verification operation. They must not simulate success.
