# Redis monitoring and PostgreSQL maintenance — 2026-09-12

Current status: the two follow-up items are resolved for dev/QA; see
[closure and verification](#follow-up-closure-mailpit-and-gosu-removal) below.
Earlier scan and local-only delivery statements describe the initial rollout.

## Completed changes

Redis retains its 256 MiB ceiling and `noeviction` policy. Both Compose monitoring
configurations now load `deploy/config/telemetry/metrics/redis-alerts.yml`.
The instance scrape has the required `service=memorycache` label. Exporters can
join the shared observability network with per-instance aliases; controller
startup writes their discovery targets when the exporter is selected.

The exporter previously treated the raw Redis secret as a JSON password map and
ran under a UID unable to read the owner-only file. `start-redis-exporter.sh`
reads the raw secret under the runtime UID and passes it to the exporter through
its process environment. Passwords are absent from Docker configuration and
command arguments. The integration test verifies authentication with special
characters and observes the actual OOM error metric.

Rules cover 80%/95% memory pressure, OOM command rejections, Redis unavailability,
and exporter failure. Connection rejection remains a separate maxclients alert.
The alert text no longer assumes a 100 MB ceiling.

Live dev and QA Redis are scraped by a small dedicated Compose project,
`athyper-redis-monitoring`, without restarting application services. The rendered
configuration is retained at:
`~/.athyper/deployments/infra-followup-20260912/monitoring.compose.json`.
It contains only exporters, Prometheus and Alertmanager. It owns ports 53900 and
53905; stop this project before starting the full operations monitoring stack on
those ports. Its per-instance discovery files are `redis-dev.json` and
`redis-qa.json` under `~/.athyper/operations/prometheus-targets/`. Remove these
standalone files when switching to controller-generated exporter targets, to
avoid duplicate scrapes.

- Prometheus: http://127.0.0.1:53900/alerts
- Alertmanager: http://127.0.0.1:53905/

These are local operator interfaces. The existing `local-null` receiver does
**not** send email, Slack, or paging notifications. A production deployment needs
an owned notification destination and credentials; no external messages were
sent or destination invented during this change.

A live test stopped only the QA exporter. `RedisExporterDown` fired, reached
Alertmanager, and resolved after the exporter restarted. Both Redis targets are
now up and all eight Redis rules evaluate successfully. Redis itself remained
available throughout that test. Promtool tests cover warning/critical thresholds,
OOM detection, Redis/exporter outages, and healthy non-firing behavior.

## Rendered network bindings

`stackctl up` and restore now validate Docker Compose's normalized JSON before
creating containers. Host networking, omitted host addresses, wildcard IPv4/IPv6,
and non-loopback addresses are rejected. The existing instance schema still
restricts configured debug ports to IPv4 loopback.

For direct Compose startup, use the same guard:

```sh
node deploy/compose/scripts/safe-compose.mjs -f /path/to/compose.yaml -- up -d
```

The wrapper renders with the same environment and files used for startup; rendered
configuration is not printed because it can contain secrets. Direct, unwrapped
`docker compose up` can still bypass repository tooling. CI exercises actual
Docker interpolation of safe and unsafe `ATHYPER_POSTGRES_BIND` overrides, and
controller tests verify rejection before any `up` or migration command.

## PostgreSQL 16.15

Compose and catalog references now use:

`postgres:16.15-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825`

Reviewed the [16.14](https://www.postgresql.org/docs/release/16.14/) and
[16.15 migration notes](https://www.postgresql.org/docs/release/16.15/).
All nine application databases across dev and QA were backed up and restored
successfully into disposable 16.15 containers, including dev's Infisical database.
Live QA was updated first, followed by dev. Both report 16.15 and healthy status;
relation counts are unchanged and transaction-scoped read/write probes passed
for every database. Both public OIDC discovery endpoints still respond.

There were no logical decoding slots. `btree_gist` exists, but no floating-point
GiST indexes needing the 16.15 reindex repair were found. No `ltree` extension was
present in the application planes. The repository search found no PGP encryption
calls requiring the release-note cipher cleanup. This is not an audit of
externally supplied encrypted data.

Backups, SHA-256s, restore evidence, rollout receipts and per-instance rollback
Compose files are retained privately under
`~/.athyper/deployments/infra-followup-20260912/`.

The new image was scanned with Trivy 0.74.0 using the current vulnerability DB.
Fixable HIGH/CRITICAL package findings decreased from 38 to 22; remaining findings
are in `/usr/local/bin/gosu`. The [new scan summary](evidence/postgres-1615-scan-20260912.json)
records the exact image and report hash. **The production release gate remains
blocked.** A minor update is not evidence that the entire image is vulnerability-free.

## Licensing and maintenance decisions

Redis: retain the current image for existing private dev/QA while documenting the
license decision before redistribution or a third-party launch. This is not legal
approval. Evaluate the actual deployment model under
[Redis's applicable licenses](https://redis.io/legal/licenses/): 7.4 uses
RSALv2/SSPLv1; Redis 8 adds AGPLv3. Valkey is the migration candidate if those terms
do not fit. It requires qualification for sessions, BullMQ/Lua, TTLs, persistence,
data transfer and rollback. Do not mount Redis 7.4 data into Valkey:
[upstream documents incompatible persistence formats](https://valkey.io/topics/migration/).
No automatic Redis-to-Valkey image substitution was made.

MinIO: the user confirmed authenticated console login and object browsing on the
pinned release, closing the suspected console regression. No console repair or
MinIO image change is needed for that finding. Retain the existing private dev/QA
installation; require a maintained S3-compatible backend and a license decision
before a new production/third-party deployment. The
[community repository is archived and no longer maintained](https://github.com/minio/minio).
A working console does not change that maintenance status. The previous
[maintenance decision](container-hardening-20260912.md) remains in effect.

## Follow-up closure: Mailpit and gosu removal

Redis alerts now deliver email to `redis-alerts@athyper.test`, from
`alerts@athyper.test`, through the existing dev Mailpit SMTP listener. The user
explicitly requested dummy-address delivery through Mailpit. Mailpit joins the
shared observability network as `mailtrap-dev`; no public SMTP port was opened.
Only `service=memorycache` alerts use this receiver; unrelated alerts retain their
previous receiver. SMTP TLS is disabled only for this internal Mailpit test path.

A real QA exporter outage produced a **FIRING** email, and restarting that
exporter produced a **RESOLVED** email. Redis itself stayed running. Both messages
remain in Mailpit, and their IDs/subjects are retained in the
[email evidence](evidence/redis-mailpit-delivery-20260912.json). The usual dev
Mailpit UI is `https://mail.dev.athyper.test`. This closes dev/QA delivery testing;
Mailpit captures messages and is not a substitute for production on-call paging.

The derived image in `deploy/config/postgres/Dockerfile` removes the bundled
`gosu` binary and changes the upstream entrypoint's single privilege-drop command
to Debian's already installed `setpriv --reuid=postgres --regid=postgres
--init-groups`. The build asserts the expected upstream call exists exactly once
and rejects unexpected entrypoint drift. No additional packages or downloads are
introduced. The upstream PostgreSQL 16.15 base remains digest-pinned.

Compose builds `athyper/postgres:16.15-hardened` for local use. Published image
sets now include a `postgres` artifact, with scan-before-push, SBOM and provenance
following the existing publication workflow. Use the published immutable
reference through `ATHYPER_IMAGE_POSTGRES` for deployment; local dev builds are
not a substitute for a promoted release digest. Both live databases run the
exact locally verified image ID recorded in the
[hardened scan evidence](evidence/postgres-hardened-scan-20260912.json).

Trivy reports **zero fixable HIGH/CRITICAL findings** for the derived PostgreSQL
image, down from 22. Unfixed findings remain in the full report; no CVE ignore or
gate waiver was added. CI scans the actual derived image and applies the same
gate. It no longer treats the unused upstream runtime image as the deployed
PostgreSQL artifact. Other infrastructure images retain independent scans and
existing release blockers; this is not approval of the entire stack.

Verification passed:

- Fresh initialization using an owner-only password file and a read-only root.
- PostgreSQL PID 1 runs as UID 999; the gosu binary is absent.
- Authenticated TCP SQL and persistence across a container restart.
- Backup/restore qualification for all nine dev/QA application databases.
- Optimized Keycloak login, refresh, logout, and restart using the derived DB.
- Dev/QA rollout health, unchanged relation counts, and database read/write probes.
- Alertmanager configuration/routing tests and actual Mailpit email delivery.
- Controller and publication contract tests.

Private rollback configs and fresh backups are retained under the same deployment
directory with `hardened` in their filenames; the earlier rollback evidence is
preserved separately. Recreate only the intended DB service when rolling back.
