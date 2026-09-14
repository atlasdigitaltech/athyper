# Container wiring and qualification

## Password files

Database and cache passwords are nonempty single-line UTF-8 values, at most
1024 bytes, without NUL, CR or LF. Leading/trailing spaces are significant.
The STG installer writes interactive input without a newline and rejects invalid
password imports before replacing the installed file. Other secret types remain
byte-preserving so multiline key formats are not damaged.

Runtime and Infisical wrappers URL-encode password components without trimming
them. Existing password files with line endings need an explicit coordinated
rotation; consumers do not silently change credentials during startup.

## Shared log collection

The operations stack owns Loki and its push-only Alloy receiver. It retains logs
for 24 hours with compactor retention enabled. The unused per-instance Loki
service and datasource have been removed; existing volumes are not deleted.
Use shared operations Grafana (loopback port 53902) to query logs by `instance`.

`deploy/compose/operations/config/log-sources.json` explicitly selects DEV and QA.
To use a different non-production allowlist, set `ATHYPER_LOG_SOURCES_FILE` to a
JSON file with the same shape before starting operations. STG is opt-in.
Production instances/environments are rejected by this shared collector and
require their own isolated logging deployment.

The host forwarder reads both the allowlist and controller ownership receipts
every 10 seconds. It follows only running, allowlisted Compose projects. Each
stream carries instance, environment, service, container, stdout/stderr, and
the instance receipt's source revision. Changed projects are rediscovered;
stopped/revoked instances are detached. Invalid configuration stops collection.

Operations up/down owns the forwarder PID and stops its Docker-log children.
PID identity is checked before signalling, avoiding unrelated processes after
PID reuse. Collection uses the host Docker CLI and HTTP pushes to loopback Alloy;
no container receives the Docker socket. This is bounded, best-effort operational
logging: restart replay may duplicate recent lines and extended outages/queue
overflow can lose logs. It is not a durable audit archive.

## Tracing and optional dashboards

The observability capability plan now includes `compose.observability.yaml`
after the base, parity and optional files. API, worker and scheduler export OTLP
gRPC to `http://tracing:4317`, with distinct instance/process service names.
`ATHYPER_OTLP_ENDPOINT` may select another reachable gRPC collector.
Apply this overlay only when enabling tracing; telemetry availability does not
become an application startup dependency.

Grafana and Alertmanager now have their own readiness checks. Per-instance
Grafana displays local metrics and traces; logs live in shared operations Grafana.

## Metabase

Build the derived image with:

```sh
docker buildx bake -f deploy/docker-bake.hcl metabase
```

The image creates the Metabase account at build time. Its wrapper reads the
owner-only PostgreSQL secret as root, then uses `su` to run the explicit upstream
startup command as UID 2000. The root filesystem is read-only. `/tmp` is bounded
to 128 MiB and `/plugins` to 256 MiB; `MB_PLUGINS_DIR` explicitly selects the latter.
Plugin extraction is ephemeral; application data remains in PostgreSQL. Heap is
capped at 384 MiB inside the existing 1 GiB container budget. This qualifies
startup/restart, not maximum dashboard concurrency; load-test before resizing.

## Image inventory

Capture running image IDs, registry digests and OCI source revisions without
exporting container environment variables or secret mounts:

```sh
node deploy/stackctl/src/image-inventory.mjs --project athyper-dev
```

Pass `--compose-json /path/to/rendered-compose.json` to compare against an already
rendered deployment configuration. The report distinguishes reference equality
from equality with the locally resolved desired image ID, catching mutable-tag
drift. Missing local images/provenance produce unknown fields; this command never
pulls images or redeploys containers. Use the deployment's actual overrides when
rendering; repository defaults alone do not establish the intended live version.

## Validation

```sh
node --test deploy/stackctl/tests/secret-bootstrap.test.mjs deploy/stackctl/tests/docker-log-forwarder.test.mjs deploy/stackctl/tests/image-inventory.test.mjs deploy/stackctl/tests/operations-execution.test.mjs deploy/compose/tests/structure.test.mjs
ATHYPER_CREDENTIAL_TESTS=true node --test deploy/compose/tests/credentials.integration.test.mjs
ATHYPER_PGBOUNCER_TESTS=true node --test deploy/compose/tests/pgbouncer.integration.test.mjs
ATHYPER_METABASE_TESTS=true node --test deploy/compose/tests/metabase.integration.test.mjs
ATHYPER_LOGGING_TESTS=true node --test deploy/compose/tests/shared-logging.integration.test.mjs
ATHYPER_TRACING_TESTS=true node --test deploy/compose/tests/tracing.integration.test.mjs
ATHYPER_OBSERVABILITY_TESTS=true node --test deploy/compose/tests/observability-tmp.integration.test.mjs
```

Docker tests use disposable projects and synthetic credentials. Logging tests
verify DEV and QA ingestion, exclusion of unconfigured instances, and revocation.
Tracing tests export a searchable span through the real application adapter.
These tests do not claim long-running retention/compaction coverage.
