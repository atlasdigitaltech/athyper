# Storage and infrastructure remediation — 12 September 2026

The ten replacements for the remaining audited infrastructure images have zero
fixable HIGH/CRITICAL package findings. See
[evidence](evidence/infrastructure-remediation-20260912.json) for exact image IDs,
report hashes and retained report paths. Counts are package findings, not unique
vulnerabilities. Unfixed findings remain visible; none were suppressed.
PostgreSQL was qualified separately in the preceding remediation.

## Qualified replacements

| Service        | Replacement                          | Change                                                                     |
| -------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| Redis          | 7.4.8 hardened                       | Replace unused Go `gosu` with Alpine `su-exec`; retain 256 MiB/noeviction  |
| PgBouncer      | 1.25.2 hardened                      | Patched libpq/OpenSSL/OS packages                                          |
| Nginx outage   | digest-pinned stable Alpine (1.30.4) | Updated unprivileged upstream image                                        |
| Traefik        | 3.7.13 hardened                      | Upstream fixes plus patched OpenSSL                                        |
| Meilisearch    | 1.13.3 hardened                      | Patch OS while preserving index format                                     |
| Mailpit        | digest-pinned 1.31.1                 | Updated upstream; preserve existing captured messages                      |
| Gotenberg      | 8.37.0 hardened                      | Rebuild pdfcpu with patched Go modules; remove unused Python build tooling |
| Tika           | 4.0.0 hardened                       | Updated extraction dependencies; remove unused Pebble supervisor           |
| Local S3       | SeaweedFS 4.46 hardened              | Rebuild with patched gRPC; replace MinIO                                   |
| S3 initializer | Node 24.19 + locked AWS SDK          | Replace `mc`; remove unused npm/Yarn runtime tooling                       |

QA was updated before DEV. Redis sessions, actual BullMQ processing, authenticated
metrics, memory limits and persistence passed. Pooling/authentication, the three
outage endpoints, TLS/BasicAuth routing, restricted search keys, document rendering
and XML external-entity rejection passed. Backups precede stateful replacements.
The release workflow now builds and scans every derived replacement in addition
to literal upstream digests, and publishes immutable candidates through the
existing controlled image-publication workflow.

A subsequent QA runtime compatibility image exposed seven additional findings
(OpenSSL, fast-uri and Nodemailer). Those were patched too; that exact runtime
image now scans with zero blocking findings. Its real S3 adapter signed-upload
round trip and SMTP delivery to QA Mailpit passed, and QA API/worker/scheduler
were updated. The same dependency fixes are recorded in the source lockfile and
runtime Dockerfile. Cloud profile support is prepared in source for the next
full runtime release; the local QA compatibility image changes only signing and
the affected packages, preserving the rest of its application build.

## Local object storage

DEV and QA each have their own SeaweedFS container, named volume and credentials.
The existing application and writer credentials were retained, and their values
are distinct between environments. `minio-root-password` remains the legacy
secret-file name for the local administrative credential; its name does not mean
MinIO is running.

Migration copied and verified **26 DEV objects and 2 QA objects**, including sizes,
SHA256 content hashes, metadata and tags. Source inventories were stable during
copy; application writers were paused for cutover. The migrated objects were
verified again after restarting the storage service. Both application stacks
are healthy. Signed downloads through public HTTPS endpoints were verified in
both environments. Signed uploads, copies, ranges, multipart uploads, reruns,
persistence and permission denials passed disposable SeaweedFS qualification.

The application can manage documents/transfers and only read artifacts. The
artifacts writer can read/upload artifacts and is explicitly denied object and
version deletion, including multi-object deletion. SeaweedFS's broad `Write`
action alone does **not** enforce that contract: the initializer's bucket policy
is required before application startup. It is reapplied on every initialization.
Only the S3 port listens on container-facing interfaces; master/filer/volume
administration stays on loopback. The old MinIO console route is removed.

The S3 adapter also separates signing from normal uploads so generating a signed
PUT without its eventual body does not sign the empty-body checksum. Normal SDK
uploads retain default checksum protection. Cloud adapters support independent,
renewable SDK credential profiles; tests exercise profile isolation and renewal.

Rollback data remains in the original named volumes:

- `athyper-dev_objectstorage-data`
- `athyper-qa-candidate-1789163256545_objectstorage-data`

Do not attach these volumes to SeaweedFS or delete them during routine cleanup.
Private original-container inspections, migration proofs, receipts, database
backups and per-service Compose files are retained under
`~/.athyper/deployments/infra-remediation-20260912/`. For rollback, first stop
application writers and preserve new SeaweedFS writes. Recreate MinIO from the
retained original inspection/configuration and original volume, restore its
network aliases, then resume applications. Reverting directly to the old volume
would omit writes made after cutover; reconcile those separately before rollback.
The supplied migration tool refuses versioned sources instead of silently losing
history. Both migrated local sources had versioning disabled.

## Alerts and maintenance decisions

Redis firing and resolved notifications were captured again by updated Mailpit
at `redis-alerts@athyper.test`. This is the user-approved local delivery test;
it is not an external production paging destination. Keep a real operational
receiver as a production setup task.

MinIO is retired from the DEV/QA manifests. Local SeaweedFS is a development
service, not the production storage choice. STG and PROD use Amazon S3.

The Redis licensing decision is superseded by the [Valkey qualification follow-up](valkey-and-immutable-qa-release-20260912.md). DEV and QA now run Valkey 8.1.10 (BSD-3-Clause) on separate migrated volumes. Redis 7.4 remains only in the migration fixture and retained rollback material, outside the deployed release ImageSet.

## AWS status: pending provisioning

No AWS resources were created and no AWS data migration occurred. The
[CloudFormation template and setup instructions](../../deploy/aws/object-storage/README.md)
provide separate buckets, least-privilege roles, SSE-KMS encryption, versioning,
public-access blocks and TLS enforcement. Contabo staging uses IAM Roles
Anywhere with distinct certificate identities and renewable credential profiles.
Regions, names and authentication settings must come from actual provisioning.

The cloud Compose overlay disables local storage and removes local storage
credentials/dependencies. Missing AWS settings fail rendering and application
startup. DEV/QA omit that overlay and remain independent of AWS configuration.
STG/PROD remain pending until explicit provisioning, authentication setup and
cloud qualification are completed. This remediation does not assert that the
broader application release certification or production readiness gates pass.

The publication follow-up supersedes this audit's original local-image limitation: the complete 18-image set is published and the QA candidate pins its exact digests. See the [Valkey and immutable QA release report](valkey-and-immutable-qa-release-20260912.md) for scan evidence, deployment checks, and completed authenticated-browser qualification. STG/PROD promotion remains deferred.
