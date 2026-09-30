# Tenant broker provider contract

Tenant identity providers are brokered by Athyper Keycloak. The application
database stores the tenant routing policy and a `configuration_ref`; it does
not store client secrets, SAML signing keys, provider tokens, assertions,
metadata certificates, or Kerberos keytabs.

The tenant provider registry supports these provider types:

| Provider | Protocol | Plane policy |
| --- | --- | --- |
| Generic OIDC | OIDC | Neon, Mesh, or Admin |
| Generic SAML 2.0 | SAML | Neon, Mesh, or Admin |
| Microsoft Entra ID | OIDC or SAML | Neon, Mesh, or Admin |
| Google Workspace | OIDC | Neon, Mesh, or Admin; validate Workspace claims per tenant |
| LinkedIn | OIDC | Mesh only; Athyper MFA remains required for sensitive access |
| Windows Integrated Authentication | Kerberos/SPNEGO | Separate enterprise feature; Neon/Mesh only |

## Provisioning boundary

The registry API creates disabled provider records. A deployment-specific
Keycloak provisioning adapter resolves the `configuration_ref` in Keycloak or
the approved secret manager, performs a connection test, and then creates or
updates the broker in the selected realm. Provisioning must keep these safety
properties:

- `trustEmail=false` until tenant email verification policy explicitly permits
  otherwise.
- `storeToken=false` and `addReadTokenRoleOnCreate=false` by default.
- External groups, roles, and email domains never grant Athyper membership or
  plane authorization.
- Generic SAML production assertions must be signed and validated for issuer,
  audience, recipient, destination, clock skew, replay, and certificate state.
- Windows/Kerberos is disabled unless `ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED=true`
  in the controlled enterprise deployment.

The provisioning descriptor is implemented in
`server/packages/services/iam/providers/keycloak-provider.contract.ts` and is
deliberately secret-free.

## Stable reference examples

Use references such as:

```text
tenant/acme/entra-prod
tenant/acme/google-workspace
tenant/acme/saml/okta-prod
tenant/acme/oidc/partner-prod
```

The reference is an opaque lookup key, not a URL and not a credential.
