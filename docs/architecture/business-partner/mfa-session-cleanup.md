# Studio MFA session cleanup

## Behavior

- Normal login reuses issuer-verified second-factor methods (`amr`) when a verified `auth_time` is present and within the configured elevation window (default 24 hours).
- This application default applies to login MFA reuse and explicit step-up across planes. Explicit `elevationTtlMs` overrides still apply. Session expiry can end assurance earlier; existing stored expirations and Keycloak policy are unchanged.
- The window starts at authentication, not token issuance or page load. Refresh does not extend it. Missing, future or stale authentication timestamps and password-only/ACR-only evidence do not elevate login sessions.
- Existing permission, tenant, independent-review and step-up checks remain enforced. Organization context changes retain their existing assurance reset.
- Authoring permission denials now use an API problem response. MFA denials carry `MFA_REQUIRED`, while other denials retain `FORBIDDEN`. Existing `error` and `reason` fields remain for compatibility.
- Studio explains MFA-required reads accurately, does not label failed loads as empty search results, and shows verified status while the sanitized session reports valid elevation. Status is checked on mount/focus and expires locally at the server-provided time; the server remains authoritative.

## Qualification

56 authentication contract tests, 10 Studio UI tests and the reviewer-read route test passed. Authentication BFF, Studio Business Partner and authoring backend typechecks passed. No live realm settings, grants or publications were modified.

## Rollout verification

Deploy the BFF/Studio and authoring backend changes together. Start a fresh MFA login; old baseline sessions are not retroactively upgraded. Confirm the issuer supplies truthful second-factor `amr` evidence and `auth_time` in the verified ID token, and compatible assurance evidence in the access token. Never add hardcoded MFA claims to make this pass.

Verify version reads immediately after login, an approval action by the independent reviewer, expiry behavior, and a true permission denial. Live login/token behavior has not been verified in this change; missing issuer evidence still requires explicit step-up.
