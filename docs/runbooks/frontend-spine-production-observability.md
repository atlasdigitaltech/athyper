# Frontend spine production observability

The immutable Grafana dashboard `athyper-frontend-spine` is provisioned from `stack/config/telemetry/provisioning/dashboards/json/frontend-spine-production.json`. It covers Neon, Mesh, and Studio liveness/readiness, platform-host latency and errors, auth/relay/bootstrap failures, and redacted frontend boundary/request errors.

## Signals and response

- `/livez` probe below 1 for two minutes: page the frontend runtime owner. Confirm process/container health, then roll back the affected immutable deployment if restart does not recover it.
- `/readyz` probe below 1 for five minutes: inspect missing runtime configuration, Redis, Keycloak, and platform-host reachability. Do not route new traffic while readiness is failing.
- Platform-host p95 above 2 seconds for ten minutes or HTTP 5xx growth: correlate Tempo traces by request ID, then inspect the exact-plane service and database. Do not bypass the BFF.
- Repeated `AUTH_` failures: check realm/client configuration and Redis health. Never log or paste cookies or tokens into an incident.
- Repeated `RELAY_` failures: separate policy rejections from upstream dependency failures. SSRF, CSRF, plane, and tenant rejections are security signals.
- `app_boundary_error` or `frontend-request-error`: use only the safe digest, route template, plane, and request ID. Raw errors, bodies, identity values, and internal URLs are prohibited.

## Promotion and rollback

Compare this dashboard for at least fifteen minutes before and after each pilot promotion in order Neon, Mesh, Studio. Rollback changes the deployment target to the previous immutable frontend artifact according to `docs/architecture/frontend-pilot-cutover.md`; backup source directories are never started or added to the workspace. Record deployment ID, dashboard window, request IDs, decision, and owner in the incident/change record.
