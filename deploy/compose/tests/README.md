# Compose hardening checks

The [container wiring runbook](../../docs/operations/container-wiring.md) covers
password-file contracts, allowlisted shared logging, tracing, Metabase and image
inventory, with the corresponding disposable qualification commands.

Run the static Compose contracts with:

```sh
node --test deploy/compose/tests/structure.test.mjs
```

The migration contract reads all three manifests, rejects unsafe or duplicate
filenames, loads each referenced file, and checks opening/closing transaction
boundaries. Five already-applied unwrapped migrations are pinned by SHA-256 in
`server/db/migrations/manifests/runner-transactions.sha256`. The forward runner
uses `psql --single-transaction` for those exact files, preserving their original
contents and ledger checksums. All other migrations retain explicit SQL wrappers.

Verify rollback, successful application, replay and checksum rejection against
an isolated disposable PostgreSQL instance (requires the local hardened image):

```sh
ATHYPER_FORWARD_MIGRATION_TESTS=true node --test deploy/compose/tests/forward-migrations.integration.test.mjs
```

The test uses the actual recent-choice migration, deliberately omits a dependency
to cause a mid-file error, and verifies that its earlier DDL is rolled back. It
does not change DEV or QA databases. After a failed migration the ledger still
requires operator review; a crash between SQL commit and ledger completion also
remains an explicit recovery case.

Run service qualification with a local Docker daemon and Compose:

For the main and jobs Redis credential regression alone:

```sh
ATHYPER_REDIS_TESTS=true node --test deploy/compose/tests/redis.integration.test.mjs
```

This uses disposable secrets containing whitespace, quotes, backslashes and an
embedded newline. It checks authentication, owner-only tmpfs configuration,
absence of the password from Redis argv/container metadata, privilege dropping,
restart persistence, the main healthcheck, and rejection of empty passwords.
The Redis CLI healthcheck uses `REDISCLI_AUTH`, never `-a`; an authorized process
with environment access can still read that short-lived client credential.

For full service qualification:

```sh
ATHYPER_TEST_IAM_IMAGE=athyper/keycloak:dev-build node deploy/compose/tests/hardening.integration.mjs
```

Set `ATHYPER_TEST_IAM_IMAGE` explicitly to an optimized image built from
`deploy/config/iam` with health support. The example uses the default Bake tag;
build it with `docker buildx bake -f deploy/docker-bake.hcl iam` if needed.
Run as UID 1000 or root so disposable `0600` secrets match Keycloak's UID 1000.
The test renders DEV/QA/STG overlays, then creates a unique project with fresh
volumes and generated secrets. It checks health, authenticated operations,
Valkey privilege dropping, restart persistence, repeat SeaweedFS S3 provisioning, and
read-only root filesystems. Cleanup removes only that project's resources.
Keycloak's test HTTP endpoint uses a random loopback port.

PostgreSQL and Redis bootstrap as root and then drop to UID 999. Their capability
grants support secret reads, volume ownership repair and privilege dropping.
SeaweedFS and the S3 initializer run as UID 1000 with all capabilities dropped.
The initializer uses the AWS SDK in `deploy/config/s3-tools` and has a 256 MiB
limit. Keycloak runs as UID 1000 with all capabilities dropped and a read-only
root. Quarkus augmentation and health support are baked into the image; startup
uses `start --optimized`, with writable data and temporary mounts. Secrets originate in files, but some
startup scripts export their values into the service's process environment.

## Bounded temporary storage and publication TLS

Run disposable readiness, ingestion/scraping and restart qualification with:

```sh
docker buildx bake -f deploy/docker-bake.hcl loki tempo
ATHYPER_OBSERVABILITY_TESTS=true node --test deploy/compose/tests/observability-tmp.integration.test.mjs
ATHYPER_PUBLICATION_TLS_TESTS=true node --test deploy/compose/tests/publication-tls.integration.test.mjs
node --test deploy/compose/tests/provider-merge.test.mjs deploy/compose/tests/review-port-contract.test.mjs
```

The observability suite checks both stacks' Docker readiness states before and
after restart and starts a disposable dependent using Grafana's dependency
configuration to verify readiness gates startup. Loki and Tempo use the static
probe in `deploy/config/observability-readiness`; Prometheus uses its bundled
`wget`. The suite also writes `/tmp` as each application's
UID, including distroless images via a read-only diagnostic binary. It uses the
local hardened Redis image to supply that binary. TLS qualification uses the
local hardened Traefik image, OpenSSL and the pinned Bull-Board Node image as a
disposable HTTP backend. No existing project or volume is used. These checks do
not establish long-running compaction behavior or production tmpfs sizing.

Generated Next.js review deployments must declare `PORT=3000`. Validate a
review deployment before activating its route overlay:

```sh
node tooling/scripts/verification/review-port-contract.mjs /path/to/review.compose.json
```

## Read-only document and search services

```sh
ATHYPER_DOCUMENT_IMAGE_TESTS=true node --test deploy/compose/tests/document-services.integration.test.mjs
ATHYPER_VIRUSSCAN_READONLY_TESTS=true node --test deploy/compose/tests/virusscan-readonly.integration.test.mjs
ATHYPER_SEARCH_BOOTSTRAP_TESTS=true pnpm exec tsx --test deploy/compose/tests/searchcore.integration.test.mjs
```

These use disposable resources and the configured read-only roots, temporary
mounts and capabilities. ClamAV's wrapper redirects upstream configuration
mutations to `/tmp/clamav-config`, preserves the immutable `/var/lock` symlink,
and leaves signatures on `/var/lib/clamav`. It refuses unrecognized upstream
entrypoint commands; review the adaptation when upgrading the image. Its offline
smoke test uses bundled signatures for clean/EICAR scans and does not qualify
FreshClam network updates or bypass the deployment's signature-age healthcheck.
Gotenberg additionally needs a user-owned `/home/gotenberg` tmpfs for Chromium.
Document tests exercise PDF rendering, extraction, unsafe-input rejection and
restart. Search tests use the secret-reading wrapper and data volume, then check
index persistence after restart and scoped-key permissions.
