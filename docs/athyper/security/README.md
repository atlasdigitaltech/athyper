# Security

Athyper implements defense-in-depth security across authentication, authorization, data access, and API protection layers.

---

## Security Layers

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Network (Traefik TLS, HTTPS enforcement)      │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Authentication (PKCE, session, CSRF, MFA)     │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Authorization (RBAC, policy gate, field ACL)  │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Data Protection (encryption, redaction, audit)│
├─────────────────────────────────────────────────────────┤
│  Layer 5: Rate Limiting (per-tenant, per-user, per-IP)  │
└─────────────────────────────────────────────────────────┘
```

---

## Authentication Security

See [IAM Documentation](../iam/README.md) for full details.

### Key Controls

| Control | Implementation |
|---------|---------------|
| **No browser tokens** | Only `neon_sid` HttpOnly cookie; tokens stay server-side in Redis |
| **PKCE flow** | Prevents authorization code interception |
| **CSRF protection** | Double-submit cookie (`__csrf` + `x-csrf-token` header) |
| **Session rotation** | New session ID on login and token refresh |
| **Idle timeout** | 900-second server-enforced idle timeout |
| **Soft IP/UA binding** | Both must differ to trigger session destruction |
| **MFA support** | TOTP, WebAuthn/FIDO2, backup codes |
| **Realm safety** | Production rejects localhost identity providers |

---

## Authorization

### RBAC (Role-Based Access Control)

Defined in `framework/core/src/access/`:

```typescript
interface RbacPolicy {
    role: string;
    permissions: Permission[];
    conditions?: PolicyCondition[];
}

interface Permission {
    resource: string;
    actions: ("create" | "read" | "update" | "delete" | "execute")[];
}
```

### Policy Gate

File: `framework/runtime/src/services/platform/meta/core/policy-gate.service.ts`

The policy gate evaluates access decisions:
1. Resolve user roles from session
2. Load applicable policies
3. Evaluate conditions (tenant, time, field-level)
4. Allow or deny with audit trail

### Policy Engine

File: `framework/runtime/src/services/platform/policy-rules/`

Declarative policy evaluation with:
- **Rule evaluator**: Evaluates policies against facts
- **Policy compiler**: Compiles declarative rules into executable form
- **Subject resolver**: Resolves policy subjects (users, groups, roles)
- **Decision logger**: Logs all policy decisions for audit
- **Policy simulator**: Test policies against golden test cases

---

## Field-Level Security

Files in `framework/runtime/src/services/platform/foundation/security/field-security/`:

### Field Access Policies

Per-field access control:

```typescript
interface FieldAccessPolicy {
    entityType: string;
    fieldName: string;
    roles: string[];
    access: "visible" | "masked" | "hidden";
    maskPattern?: string;  // e.g., "****1234" for last-4-digits
}
```

### Field Masking

| Mode | Output | Use Case |
|------|--------|----------|
| `visible` | Full value | Authorized users |
| `masked` | `****1234` | Partial access (last N digits) |
| `hidden` | Field omitted from response | No access |

### Field Projection

The field projection builder removes or masks fields before data leaves the service layer:

```
Query result → Field security check → Projection → Response
                    │                      │
                    └─ Check role ──────────┘
                    └─ Apply mask ──────────┘
                    └─ Remove field ────────┘
```

Repository: `field-security.repository.ts`

---

## Rate Limiting

### Redis-Based Rate Limiter

File: `framework/runtime/src/services/platform/foundation/security/`

Three rate limiting scopes:

| Scope | Key Pattern | Purpose |
|-------|-------------|---------|
| **Per-tenant** | `ratelimit:tenant:{tenantId}` | Prevent tenant resource exhaustion |
| **Per-user** | `ratelimit:user:{userId}` | Prevent user abuse |
| **Per-IP** | `ratelimit:ip:{ip}` | Prevent brute force |

### Algorithm

Sliding window counter in Redis:
1. Increment counter for current window
2. If count exceeds limit → 429 Too Many Requests
3. Return `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers

### Collaboration Rate Limiter

File: `framework/runtime/src/services/enterprise-services/collaboration/domain/rate-limiter.ts`

Additional rate limits for collaboration features:
- Comment creation: X per minute per user
- Reaction toggling: Y per minute per user
- Mention notifications: Z per hour per user

### Integration Rate Limiter

File: `framework/runtime/src/services/platform-services/integration-hub/domain/services/RateLimiter.ts`

Per-endpoint rate limiting for external integrations.

---

## Middleware Chain

File: `framework/runtime/src/services/platform/foundation/middleware/`

Request middleware applied in order:

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | Security headers | HSTS, X-Frame-Options, CSP, X-Content-Type-Options |
| 2 | Rate limiting | Per-tenant/user/IP rate checks |
| 3 | Observability | Request ID, trace context, timing |
| 4 | Validation | Input sanitization, schema validation |
| 5 | Field-level security | Field access policy enforcement |

### Security Headers

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 0
Content-Security-Policy: default-src 'self'; ...
Referrer-Policy: strict-origin-when-cross-origin
```

---

## Input Validation

### Sanitizer

File: `framework/core/src/security/sanitizer.ts`

- HTML entity encoding
- Script tag stripping
- SQL injection pattern detection
- Path traversal prevention

### Validator

File: `framework/core/src/security/validator.ts`

- Schema-based validation (Zod schemas)
- Type coercion with strict mode
- Length limits enforcement
- Regex pattern validation

---

## Data Protection

### Encryption at Rest

- **Database**: PostgreSQL TDE (if enabled) + audit column encryption (AES-256-GCM)
- **Object storage**: MinIO server-side encryption
- **Redis**: Optional TLS + encryption at rest

### Encryption in Transit

- All inter-service communication over TLS
- Traefik handles TLS termination
- Internal services communicate on Docker network (encrypted in production)

### Audit Column Encryption

See [Compliance Documentation](../compliance/README.md) for details on:
- AES-256-GCM column encryption
- Key rotation
- PII field encryption

### Redaction

The audit redaction pipeline removes sensitive data before storage:
- Credit card numbers → `****1234`
- SSN/Tax IDs → `***-**-1234`
- Email addresses → `u***@domain.com`
- Custom patterns per tenant

---

## Session Security

| Control | Implementation |
|---------|---------------|
| **Cookie flags** | `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` |
| **Session ID** | Cryptographically random (128-bit) |
| **Session rotation** | New ID on auth events (prevent fixation) |
| **Tenant binding** | Cross-tenant access destroys session |
| **Idle timeout** | 900s server-enforced |
| **Absolute timeout** | Configurable per environment |
| **Concurrent sessions** | Configurable limit per user |

---

## Adapter Circuit Breakers

File: `framework/runtime/src/services/platform/foundation/resilience/adapter-protection.ts`

All external adapter calls are protected:

```
Adapter call → Circuit breaker check
                   │
                   ├─ CLOSED (healthy) → Execute call
                   │                         │
                   │                    ├─ Success → Reset failure count
                   │                    └─ Failure → Increment count
                   │                                    │
                   │                              (threshold exceeded)
                   │                                    │
                   ├─ OPEN (unhealthy) → Fail fast (no call)
                   │                         │
                   │                    (cooldown elapsed)
                   │                         │
                   └─ HALF_OPEN → Execute single test call
                                      │
                                 ├─ Success → CLOSED
                                 └─ Failure → OPEN
```

---

## Architecture Boundary Enforcement

### ESLint Boundaries

The ESLint configuration enforces that:
- `core` cannot import from `runtime`, `adapters`, `packages`, or `products`
- `runtime` cannot import deep adapter internals
- `packages` and `products` cannot import framework packages
- All files must belong to a classified boundary element

### Dependency Cruiser

`.dependency-cruiser.cjs` validates at the import-graph level:
- No circular dependencies
- Layer boundary compliance
- No imports from forbidden zones

```bash
pnpm depcheck  # Run architecture boundary validation
```

---

## Related Documentation

- [IAM & Authentication](../iam/README.md) — Auth flow, sessions, MFA
- [Compliance](../compliance/README.md) — Audit, encryption, DSAR
- [Architecture](../architecture/README.md) — System architecture
- [Runbooks: Auth Operations](../runbooks/auth-operations.md) — Operational procedures
