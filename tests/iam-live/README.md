# IAM live harness

This opt-in harness provides real Keycloak, Redis ACL, and PostgreSQL dependencies for IAM contract scenarios. It deliberately uses isolated test credentials and no durable volumes.

Start it with `docker compose -f tests/iam-live/compose.yml up --wait`. Tests must continue to verify bearer tokens in the platform host even when the gateway envelope is valid, and must fail closed when Redis, principal membership, or organization projection verification is unavailable.

Required scenario groups are: cross-plane issuer/audience rejection; `AUTHORIZED` role enforcement; required-action default deny; Redis outage; JWKS key rotation; indexed back-channel logout; suspended principal and missing membership rejection; projection hash/version mismatch; and single-use MFA elevation binding.
