# Platform system verification

The authenticated System Verification surface runs bounded checks through the
same platform adapters used by Studio, Neon, and Mesh. It never publishes or
returns database, Redis, MinIO, search, IAM, or telemetry credentials.

## User routes

- Studio consolidated authority: `/operations/verification`
- Neon plane scope: `/system/verification`
- Mesh plane scope: `/system/verification`

Opening a route runs a read-only snapshot. **Run functional check** adds
ephemeral Redis, object-storage, clean malware scan, extraction, PDF rendering,
search, worker, scheduler, and local SMTP checks. Every mutable artifact uses a
run-specific key and is removed in `finally` cleanup.

The feature is enabled by default only when `ATHYPER_ENV=local`. Other
environments must explicitly set `PLATFORM_VERIFICATION_ENABLED=true`.
`PLATFORM_VERIFICATION_GRAFANA_URL` controls the optional Explore link. No
mutation, container-control, reset, or arbitrary command endpoint is provided.

## Automated DEV or QA qualification

Use a short-lived service-account token scoped to the intended exact plane.
Never place the token on the command line or in a receipt.

```sh
export VERIFICATION_API_URL=https://api.dev.athyper.test
export VERIFICATION_ACCESS_TOKEN='short-lived-token'
export VERIFICATION_PLANE=studio
export VERIFICATION_REALM=athyper
export VERIFICATION_TENANT_ID='tenant-uuid'

pnpm verify:platform -- --mode quick \
  --output qualification/dev/platform-verification-quick.json

pnpm verify:platform -- --mode functional \
  --output qualification/dev/platform-verification-functional.json

# The same token lets Stack v2 replace its document, worker, scheduler, mail,
# and authenticated-API placeholders with this runner's evidence.
node deploy/stackctl/bin/athyper.mjs qualify dev --json
```

For QA, change only the API URL, token, tenant context, and receipt directory.
The command exits non-zero when the endpoint fails, the response authority does
not match the requested plane/mode, or any required check fails. Receipts are
created owner-only and contain sanitized evidence, timings, cleanup state, run
ID, and a Loki query—not secrets.

## Observability

Each completed run emits `platform.verification.completed` with its run ID and
correlation ID. In Grafana Explore select Loki and paste the returned query,
for example:

```logql
{instance="dev"} |= "verification-run-id"
```

Loki, Alloy, Alertmanager, databases, caches, and document services remain
network-internal. Grafana is only a deep link; application pages do not receive
Grafana credentials.
