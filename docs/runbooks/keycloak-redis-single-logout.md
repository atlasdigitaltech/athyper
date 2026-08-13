# Keycloak and Redis single-logout operations

## Expected flow

`Sign out of <plane>` clears the current browser cookies and revokes only that plane-and-realm Redis session. `Sign out of Athyper everywhere` redirects through the realm OIDC logout endpoint and Keycloak delivers a signed back-channel logout token to every client attached to the SSO session.

The active web clients must have:

- Front-channel logout disabled.
- Back-channel logout URL set to the plane's public `/api/auth/backchannel-logout` route.
- Back-channel logout session required enabled so the logout token contains `sid`.
- Exact valid post-logout redirect URI set to the plane's `/api/auth/logout/callback` route.

## Deployment verification

1. Import or reconcile `stack/config/iam/realm-athyper.json` and, when Studio uses the internal realm, `realm-platform-control.json`.
2. Inspect each deployed client in Keycloak rather than relying only on source JSON.
3. Sign into Neon, Mesh, and Studio using one Keycloak browser SSO session.
4. Choose `Sign out of Athyper everywhere` in one plane.
5. Confirm the browser passes through `/protocol/openid-connect/logout` and returns through that plane's exact logout callback.
6. Confirm all three `/api/auth/session` endpoints return anonymous and their opaque cookies no longer authorize a relay request.
7. Confirm one `auth.backchannel_logout` structured event per participating client. Investigate `outcome=no_match`; repeated delivery may report `outcome=replay` and is safe.

## Failure handling

- Redis revocation failure clears the requesting browser's cookies but renders `logout-incomplete`; alert on the session-store unavailable metric.
- Keycloak outage after local revocation means the current plane is closed but global SSO termination is incomplete. The user must not be shown the global-success message.
- A back-channel endpoint failure can leave another plane's Redis session alive until expiry. Alert on Keycloak delivery failures and retry/repair operationally; do not depend on front-channel iframes.
- Never log the ID-token hint, logout token, cookies, request body, or logout URL query string.

## Rollback

If RP-Initiated Logout causes a deployment incident, keep application logout available and temporarily remove the global action. Do not remove the back-channel endpoints or revert Redis provider-session indexing; administrator-initiated Keycloak logout depends on them.
