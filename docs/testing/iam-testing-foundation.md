# IAM testing foundation

The IAM test matrix is intentionally split into three tiers:

1. **Contract tests** run without external services and protect tenant, plane,
   provider-policy, assurance, step-up, session, and offline-theme boundaries.
2. **Keycloak integration tests** run against the local IAM container and cover
   real OIDC authorization-code/PKCE, TOTP, WebAuthn, required actions,
   logout, recovery, and session reuse.
3. **Provider integration tests** run only when the provider sandbox is
   available. Entra ID, Google Workspace, generic OIDC/SAML, LinkedIn, and
   Kerberos must never be represented by a fake success test alone.

## Declared matrix

The contract gate declares 324 product/provider/policy/user combinations:

```text
3 planes × 9 authentication methods × 3 SSO modes × 4 user states
```

Planes:

- Neon
- Mesh
- Admin

Authentication methods:

- Local password
- TOTP
- Passkey/security key
- Microsoft Entra ID
- Google Workspace
- Generic OIDC
- Generic SAML
- LinkedIn
- Windows Integrated Authentication

SSO modes:

- Optional
- Preferred
- Exclusive

User states:

- Existing user
- Invited user
- JIT user
- Conflicting identity

Security conditions are tested independently and then added to the provider
integration matrix:

- Multiple tenants
- Multiple identity providers
- Insufficient MFA assurance
- External provider outage
- Certificate rollover
- Session reuse
- Step-up authentication
- Logout
- Account linking and unlinking
- Recovery

Provider eligibility remains policy-driven. LinkedIn is Mesh-only and cannot
satisfy Admin MFA. Windows/Kerberos requires its explicit enterprise feature
gate.

## Critical security assertions

Every release candidate must prove:

- Tenant A cannot enter Tenant B by modifying claims, context, return URLs, or
  organization selection.
- An email match cannot silently bind a new external subject to an existing
  principal.
- External social-provider MFA cannot satisfy the Admin assurance boundary.
- A Neon session cannot be replayed into Admin without the required realm,
  plane, tenant, and assurance checks.
- Disabling a provider prevents new authentication while preserving existing
  identity and audit records.
- Exclusive SSO cannot be activated until a tested tenant administrator and a
  recovery path exist.
- IAM CSS, brand assets, and gateway fallback pages work without Neon, Mesh,
  or Admin being available.

## Current deterministic coverage

The following tests are the contract baseline:

- `server/packages/services/iam/__tests__/verified-request-context.test.ts`
- `packages/shared/platform-auth/auth-common/src/__tests__/federated-assurance.test.ts`
- `server/packages/services/iam/mfa/__tests__/step-up.service.test.ts`
- `server/packages/services/iam/providers/__tests__/tenant-identity-provider.test.ts`
- `packages/shared/platform-auth/auth-bff/src/__tests__/session-termination.test.ts`
- Neon and Mesh tenant-admin login-flow tests

Run the foundation gate with:

```text
pnpm iam:verify:testing-foundation
```

The gate verifies the declared matrix, critical test files, provider policy
contracts, and offline IAM assets. It does not claim that external provider
integration has run.

## Integration execution requirements

Keycloak integration must run with:

- local Athyper and platform-control realms
- browser-based PKCE clients
- seeded test users
- TOTP enrollment through `CONFIGURE_TOTP`
- WebAuthn registration and assertion
- Admin mandatory MFA
- Neon/Mesh conditional MFA
- back-channel logout enabled

Provider sandboxes must use synthetic identities and isolated tenants. No
production provider credentials or production users belong in automated tests.
