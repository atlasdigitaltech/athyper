# Identity & Access Management

Athyper's IAM system implements PKCE Authorization Code flow with Keycloak, Redis-backed sessions, and defense-in-depth security controls.

---

## Architecture Overview

```
Browser                          BFF (Next.js)                    Keycloak
  │                                   │                              │
  ├─ GET /api/auth/login ────────────►│                              │
  │                                   ├─ Generate PKCE verifier      │
  │                                   ├─ Store in Redis              │
  │  ◄── 302 Redirect ──────────────┤                              │
  │                                   │                              │
  ├─ Login at Keycloak ──────────────────────────────────────────────►│
  │  ◄── 302 + code ────────────────────────────────────────────────┤
  │                                   │                              │
  ├─ GET /api/auth/callback?code= ──►│                              │
  │                                   ├─ Exchange code + verifier ──►│
  │                                   │  ◄── tokens ────────────────┤
  │                                   ├─ Validate ID token (JWKS)    │
  │                                   ├─ Create Redis session        │
  │                                   ├─ Set neon_sid cookie         │
  │  ◄── 302 to app ────────────────┤                              │
  │                                   │                              │
  ├─ Subsequent requests ───────────►│                              │
  │   (neon_sid + x-csrf-token)      ├─ Lookup session in Redis     │
  │                                   ├─ Verify CSRF token           │
  │                                   ├─ Attach user context         │
  │  ◄── Response ───────────────────┤                              │
```

**Key principle**: No tokens are ever exposed to the browser. The `neon_sid` HTTP-only cookie is the only client-side credential.

---

## Session Management

### Redis Session Store

Sessions are stored in Redis with the key pattern `session:{sid}`.

| Field | Type | Purpose |
|-------|------|---------|
| `userId` | string | Keycloak user ID |
| `tenantId` | string | Bound tenant ID |
| `roles` | string[] | Resolved roles |
| `accessToken` | string | Keycloak access token (server-side only) |
| `refreshToken` | string | Keycloak refresh token (server-side only) |
| `expiresAt` | number | Token expiry timestamp |
| `lastActivity` | number | Last request timestamp |
| `ip` | string | Client IP (soft binding) |
| `ua` | string | User-Agent (soft binding) |

### Session Lifecycle

```
Login ──► Active ──► Idle (900s no activity) ──► Expired
                 ──► Refreshed (proactive at expiresAt - 90s)
                 ──► Destroyed (logout / security event)
```

### Session ID Rotation

The session ID is rotated on security-sensitive events:
- Login callback (new session created)
- Token refresh (old session destroyed, new session created)

This prevents session fixation attacks.

### Idle Timeout

- **Server-side**: 900-second (15-minute) idle timeout enforced in `/api/auth/touch` and `/api/auth/refresh` routes
- **Client-side**: `useIdleTracker` hook tracks mouse/keyboard activity and calls the touch endpoint
- **Hard security control**: An idle-expired session cannot be refreshed — this prevents stolen session IDs from being silently extended

### Proactive Token Refresh

The `useSessionRefresh` client hook schedules a refresh call at `expiresAt - 90s`, ensuring tokens stay fresh without user intervention.

---

## CSRF Protection

Double-submit cookie pattern:

1. Server sets `__csrf` cookie (HttpOnly=false, SameSite=Strict)
2. Client reads cookie and sends value in `x-csrf-token` header
3. Middleware validates that cookie value matches header value
4. Mismatch → 403 Forbidden

Enforced in `products/neon/apps/web/middleware.ts` for all mutating requests.

---

## Soft IP/UA Binding

Sessions are soft-bound to the client's IP address and User-Agent:

- If **both** IP and UA differ from the session's stored values → session is destroyed + audit event emitted
- If only one differs → session continues (handles mobile networks and browser updates)

This detects session hijacking without breaking legitimate usage patterns.

---

## MFA (Multi-Factor Authentication)

### Supported Methods

| Method | Implementation | File |
|--------|---------------|------|
| **TOTP** | Time-based one-time passwords | `iam/mfa/mfa.service.ts` |
| **WebAuthn** | FIDO2 hardware keys / passkeys | `iam/mfa/webauthn.service.ts` |
| **Backup Codes** | One-time recovery codes | `iam/mfa/mfa.service.ts` |

### MFA Challenge Flow

```
User completes primary auth
    │
    ▼
Check MFA policy for tenant/user
    │
    ├─ No MFA required → Session active
    │
    ├─ MFA required →
    │   ├─ Redirect to /mfa/challenge
    │   ├─ User provides TOTP / WebAuthn / backup code
    │   ├─ Server validates
    │   ├─ Success → Session upgraded, redirect to app
    │   └─ Failure → Retry (with rate limiting)
```

---

## Keycloak Configuration

### Realm Setup

Keycloak realm configuration is exported as JSON in `mesh/config/iam/`:
- `realm-export.json` — Full realm export
- `realm-demosetup.json` — Demo realm with sample users

### Client Registration

The Neon web app is registered as a Keycloak client with:
- **Flow**: Authorization Code with PKCE
- **Access Type**: Public (no client secret — PKCE verifier replaces it)
- **Redirect URIs**: Configured per environment
- **Token Lifetimes**: Configurable per realm

### Role Model

| Level | Examples |
|-------|---------|
| **Realm roles** | `admin`, `user`, `partner` |
| **Client roles** | Module-specific permissions |
| **Group hierarchies** | Organizational structure mapping |

---

## Boot-Time Safety

### Realm Safety Assertions

At application startup, the framework validates:
- Production environments reject realms pointing to `localhost` identity providers
- TLS is enforced in non-local environments
- Realm URLs match expected patterns

### Environment Profiles

| Profile | TLS | IdP Validation | Session TTL |
|---------|-----|---------------|-------------|
| `local` | Self-signed | Accepts localhost | 1 hour |
| `staging` | Let's Encrypt | Rejects localhost | 30 min |
| `production` | Managed certs | Rejects localhost | 15 min |

---

## Auth Audit

### Event Types (14 events)

| Event | When |
|-------|------|
| `auth.login.start` | Login flow initiated |
| `auth.login.success` | Successful login |
| `auth.login.failure` | Failed login attempt |
| `auth.callback.success` | OAuth callback succeeded |
| `auth.callback.failure` | OAuth callback failed |
| `auth.refresh.success` | Token refresh succeeded |
| `auth.refresh.failure` | Token refresh failed |
| `auth.logout` | User logged out |
| `auth.session.created` | New session created |
| `auth.session.destroyed` | Session terminated |
| `auth.session.expired` | Session expired (idle/absolute) |
| `auth.session.hijack_detected` | IP+UA mismatch detected |
| `auth.mfa.success` | MFA challenge passed |
| `auth.mfa.failure` | MFA challenge failed |

### BFF Audit

The BFF layer (`products/neon/auth/server/audit.ts`) logs auth events to Redis:
- Key pattern: `audit:auth:{tenantId}`
- Storage: Redis LIST with 10,000 event cap
- Session IDs are hashed with `hashSidForAudit()` before logging

### Framework Audit

Framework-level auth events (`framework/runtime/src/services/platform/foundation/security/auth-audit.ts`) feed into the main audit governance pipeline with hash chain integrity.

---

## Session Invalidation

The `SessionInvalidationService` (`framework/runtime/src/services/platform/foundation/iam/session-invalidation.ts`) handles:

- **Password changes** → Destroy all user sessions
- **Role changes** → Destroy all user sessions (force re-auth with new roles)
- **Account disable** → Destroy all user sessions
- **Admin forced logout** → Destroy specific session

---

## File Reference

### BFF Auth Routes

| Route | File |
|-------|------|
| `/api/auth/login` | `products/neon/apps/web/app/api/auth/login/route.ts` |
| `/api/auth/callback` | `products/neon/apps/web/app/api/auth/callback/route.ts` |
| `/api/auth/session` | `products/neon/apps/web/app/api/auth/session/route.ts` |
| `/api/auth/refresh` | `products/neon/apps/web/app/api/auth/refresh/route.ts` |
| `/api/auth/touch` | `products/neon/apps/web/app/api/auth/touch/route.ts` |
| `/api/auth/logout` | `products/neon/apps/web/app/api/auth/logout/route.ts` |

### Client Hooks

| Hook | File |
|------|------|
| `useSessionRefresh` | `products/neon/apps/web/lib/auth-refresh.ts` |
| `useIdleTracker` | `products/neon/apps/web/lib/idle-tracker.ts` |
| CSRF utilities | `products/neon/apps/web/lib/csrf.ts` |
| Session bootstrap | `products/neon/apps/web/lib/session-bootstrap.ts` |

### Framework Security

| Service | File |
|---------|------|
| Session store | `framework/runtime/src/services/platform/foundation/security/session-store.ts` |
| Realm safety | `framework/runtime/src/services/platform/foundation/security/realm-safety.ts` |
| Env profiles | `framework/runtime/src/services/platform/foundation/security/env-profiles.ts` |
| Auth audit | `framework/runtime/src/services/platform/foundation/security/auth-audit.ts` |
| Auth telemetry | `framework/runtime/src/services/platform/foundation/security/auth-telemetry.ts` |
| Session invalidation | `framework/runtime/src/services/platform/foundation/iam/session-invalidation.ts` |
| Tenant IAM profile | `framework/runtime/src/services/platform/foundation/iam/tenant-iam-profile.ts` |

---

## Related Documentation

- [Security](../security/README.md) — Security hardening, rate limiting, field-level security
- [Architecture](../architecture/README.md) — System architecture overview
- [Runbooks: Auth Operations](../runbooks/auth-operations.md) — Operational procedures
