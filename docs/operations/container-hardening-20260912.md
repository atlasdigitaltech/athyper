# Container hardening and MinIO maintenance decision

Decision date: 2026-09-12.

## Redis

The main Redis instance serves sessions, cache invalidation and BullMQ. Both the
main and optional jobs instance use `noeviction`, with a default `maxmemory` of
256 MiB inside a 512 MiB container. `REDIS_MAXMEMORY_MB` is a positive integer
startup override; size the container and measure persistence/fork peaks before
raising it. The Redis limit is not a bound on RSS or cgroup memory.

At capacity allocating writes fail; reads remain available. Alert on sustained
`used_memory / maxmemory` above 80%, rejected writes, cgroup memory pressure,
AOF errors and queue backlog. Arbitrary eviction must never be enabled on a
BullMQ instance. A separately deployed cache can use an eviction policy after
sessions, queues and coordination keys are separated.

Validate with:

```sh
ATHYPER_REDIS_TESTS=true node --test deploy/compose/tests/redis.integration.test.mjs
```

## Image scans

`infrastructure-maintenance.yml` inventories and deduplicates every literal
pinned digest in compose YAML files. Each image receives an OS/library scan,
including unfixed vulnerabilities. Full JSON reports are retained even when the
fixable HIGH/CRITICAL gate fails. Scan errors and missing reports also fail.
The reusable workflow is a required dependency of both tagged releases and
Stack v2 image publication.
The inventory explicitly records unpinned/interpolated images excluded from
this digest matrix: it is not a certification of those images. Built application
images retain their separate build/scan workflow.

Do not treat a zero gate count as a clean bill of health: review unfixed findings,
reachability and support status as well. Never update tags without matching
verified digests, service-specific smoke tests and rollback artifacts.

## MinIO decision

Retain the existing digest-pinned MinIO/mc pair for the current private dev and
QA stacks while qualifying a maintained S3 backend. Do not approve this
unmaintained pair for a new production or externally hosted release.

The upstream MinIO repository is archived and explicitly marked unmaintained;
legacy community binaries do not receive updates. A newer historical tag or a
local rebuild alone does not establish an ongoing security maintenance path.

Production direction: use a maintained S3 service/distribution with a documented
security update commitment. Provider selection requires deployment-region,
operating-cost and support requirements; this change makes no purchase or
object-data migration. AIStor is an upstream-supported candidate, not an assumed
drop-in upgrade or an approved license choice.

Acceptance before replacement: bucket-policy parity, application read/write/delete
boundaries, non-deleting artifact writer, multipart upload, presigned URLs,
sentinel health checks, persistence/restore, object metadata/checksum parity,
and a tested rollback plan. Retain the original object volumes until migration
and restore checks succeed. Review the retained pins against every weekly scan;
newly actionable vulnerabilities require remediation or an explicit dated exception.

Sources:

- https://github.com/minio/minio (maintenance and legacy binary status)
- https://github.com/minio/mc
- https://docs.bullmq.io/guide/going-to-production
- https://redis.io/docs/latest/develop/reference/eviction/

## Optimized IAM

The image bakes PostgreSQL and health support into Quarkus after installing
providers and fixing their timestamps. Runtime uses `start --optimized`, retains
realm import, drops all capabilities and has a read-only root. `/opt/keycloak/data`
is a named volume and `/tmp` is tmpfs. Deploy the matching image and script
atomically; do not point the new script at an older, differently augmented image.

The disposable test covers fresh database/realm import, registered custom
providers, login, refresh, logout/revocation, restart and absence of runtime
augmentation:

```sh
docker build -t athyper/keycloak:integration deploy/config/iam
ATHYPER_KEYCLOAK_TEST_IMAGE=athyper/keycloak:integration node --test deploy/compose/tests/keycloak.integration.test.mjs
```

## MinIO initialization

Keep error propagation from `mc ls`; `|| true` would hide denied access and
transport failures. Keep the initial empty `writer_policy`: the early cleanup
trap must remain safe under `set -u` before the second temporary file exists.

The sentinel upload uses an explicit 5 MiB multipart size: the pinned `mc pipe`
default is 528 MiB and can OOM the 256 MiB initializer even for a tiny object.

The pinned-image integration test exercises a missing prefix, initial sentinel
creation, preservation on rerun, denied listing, a listing-only transport failure, bad credentials and an unavailable
endpoint using disposable containers and volumes only:

```sh
ATHYPER_MINIO_TESTS=true node --test deploy/compose/tests/minio.integration.test.mjs
```

## Verification results

All 42 relevant checks passed (Redis 6, MinIO 1, optimized IAM 1, IAM provider
unit tests 8, compose/inventory/gate tests 25, existing image-publication contract 1). Dev and QA run Redis with the
persistent 256 MiB ceiling and optimized IAM with all capabilities dropped and
a read-only root. Redis restart persistence and unchanged public OIDC issuers
were verified. IAM backups and per-service rollback configurations are retained
under `~/.athyper/deployments/infra-hardening-20260912/`.

The [scan summary](evidence/container-hardening-scans-20260912.json) records
Trivy 0.74.0 findings for all 11 pinned images. **All 11 fail the fixable
HIGH/CRITICAL release gate.** These are package findings, not exploitability
verdicts or unique CVE counts. No blanket exceptions or production approval
were added. The Redis findings are in its bundled `gosu` helper, rather than
proof of a Redis-server vulnerability. MinIO has findings in OS packages and
both bundled binaries, reinforcing the maintained-backend requirement.

Nine images were scanned directly. For Tika and Gotenberg, the 920 MiB Java
index download could not finish reliably on this connection. Their OS packages
were scanned directly and their Syft 1.51.1 CycloneDX library inventories were
scanned by Trivy. The inventories contain 125 and 5 Maven components respectively.
These methods can identify packages differently; the summary records the method
and SHA-256 of every retained report. CI uses direct image scans with a 20-minute
timeout and fails on download or scan errors. Full reports and both SBOMs are
retained in the deployment directory's `scans/` subdirectory.

Subsequent Redis monitoring, rendered-bind validation, PostgreSQL 16.15 rollout,
and confirmed MinIO console status are recorded in the
[follow-up](redis-postgres-followup-20260912.md). The initial scan results above
remain a historical record of the previous pins.
