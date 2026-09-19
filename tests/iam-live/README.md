# IAM live harness

This harness provides real Keycloak, Redis ACL, and PostgreSQL dependencies. It deliberately uses isolated test credentials and no durable volumes. CI runs the dependency boot/readiness gate with `pnpm test:iam-live`; run the same command locally to ensure teardown happens even after a failed startup.

The readiness gate verifies only that the checked-in realm imports and all three dependencies become healthy. The Keycloak readiness probe runs from a BusyBox sidecar because the Keycloak ubi9-micro image does not contain Bash, `/dev/tcp`, `grep`, or curl.

It is not evidence for platform-host authorization behavior. Issuer/audience rejection, `AUTHORIZED` role enforcement, required-action default deny, Redis fail-closed behavior, JWKS rotation, indexed back-channel logout, suspended-principal and missing-membership rejection, projection mismatch, and single-use MFA elevation still require an explicit live platform-host scenario suite before they may be claimed as live coverage.
