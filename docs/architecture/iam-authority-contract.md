# IAM authority and contract

Canonical planes are `studio`, `neon`, and `mesh`. HTTP ingress uses only `X-Plane`; `athyper`, `admin`, and `X-Plane-Key` are not accepted IAM aliases.

Keycloak owns passwords, WebAuthn/TOTP credentials, federation, required actions, and provider sessions. Studio `trustiam` owns desired identity-organization and application-projection configuration. Each plane's PostgreSQL database owns principals, bindings, memberships, groups, roles, delegations, audit, and durable provisioning state. Redis owns only short-lived BFF sessions, refresh locks, revocation indexes, and one-time MFA elevation.

A Keycloak user or organization membership grants no application permission. Successful access requires a valid plane-specific issuer/audience/client, the `AUTHORIZED` client role, an active plane principal and membership, and a verified current organization projection. Unknown required actions deny mutations by default.

Provisioning mutations must persist the state change, audit evidence, and outbox command atomically. The idempotency identity is the SHA-256 of tenant, realm, and normalized identity identifier. Projection consumers apply only a higher version with the expected content hash; same-version hash conflicts fail closed.

The gateway strips incoming assertion headers, verifies signature/issuer/audience/plane, and signs a short-lived token-bound envelope. Applications verify the bearer token independently and cross-check that envelope; it is never an authorization grant.
