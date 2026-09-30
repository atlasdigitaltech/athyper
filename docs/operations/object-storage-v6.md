# Object storage v6 — local cutover and acceptance

Design locked. DEV reset and direct live storage/service acceptance were executed
on 2026-09-11; full DEV qualification remains pending. See
`governance/policy/reports/object-storage-v6-live.dev.json` for results and limits.
This procedure is for the disposable **DEV** instance only. Do not run it against
QA/staging/production or while preserving existing publication/attachment records.
Initialization is non-destructive. Reset is a separate, explicitly invoked operation.

## Existing installation: provision missing secrets

From the repository root, with ATHYPER_RUNTIME_ROOT pointing to the existing local
runtime directory (defaults to ~/.athyper):

```sh
node deploy/bootstrap/provision-dev-artifacts-writer.mjs
```

This preserves all existing secrets and an existing complete writer pair. It refuses
an incomplete pair. Reconcile an interrupted provisioning before retrying; do not
regenerate the whole installation's secrets. Compose must be rendered from the new
source so API, worker, scheduler, and objectstorage-init mount the new pair.

## Prepare the reset

Use the active DEV receipt's Compose files and the freshly rendered DEV environment
from `athyper config render dev` / `athyper plan dev`. Define a shell `dc` function
that invokes `docker compose` with that exact file list, environment and project
`athyper-dev`. Include the selected overlays; do not invoke the base file alone.
Verify `dc config --services` and the resolved mounts point only at DEV. Record the
source revision, image IDs and resolved bucket names before proceeding.

The sequence below rebuilds all three disposable plane databases so object references,
transfer rows, outbox records and publication state cannot survive the bucket wipe.
It preserves cluster roles and the IAM database. Keep all app clients offline until
reseed and acceptance finish. Do not use `down --volumes`, which also removes unrelated
services' state.

## Explicit reset (destructive; execute only for the selected DEV installation)

1. Stop API, worker, scheduler, and any external fixture producers. Stop database
   poolers too so they cannot reconnect during database recreation:
   `dc stop api worker scheduler dbpool-apps dbpool-session`.
2. In the existing `objectstorage-init` service's admin context, inventory the
   three target buckets and any obsolete buckets before removing them. The current
   service runs the Node-based `athyper/s3-tools` image against SeaweedFS; it does
   not contain the MinIO `mc` bootstrap. Use a separately reviewed S3 SDK reset
   script mounted into that service and override its entrypoint explicitly with
   `--entrypoint node`. Keep reset code separate from `/app/init.mjs`, whose
   bucket, deny-delete policy and sentinel reconciliation is non-destructive.
   The reset script must handle pagination and any object versions, restrict deletion
   to the inventoried DEV buckets, and fail on unexpected errors. An unavailable
   server is not an absent bucket. No automatic bucket reset is provided by the
   initializer.
3. Use `dc exec -T db` to run psql as the existing postgres administrator, with
   PGPASSWORD read inside the container from `/run/secrets/postgres-password`.
   Connect to `postgres`, enable `ON_ERROR_STOP`, and execute:

   ```sql
   DROP DATABASE athyper_studio WITH (FORCE);
   DROP DATABASE athyper_neon WITH (FORCE);
   DROP DATABASE athyper_mesh WITH (FORCE);
   ```

   Run `dc run --rm db-init` to recreate the plane databases with their existing
   owners. Run the DEV foundation service `db-migration` with the current rendered
   ATHYPER_DDL_SHA256; its manifests apply DDL, grants and reference seeds. Invoke `dc run --rm db-migration` using the selected parity overlay. Never reuse an
   old foundation receipt or skip a checksum mismatch.
   Preserve and reapply the selected installation's explicit database CONNECT grants
   for auxiliary login identities after recreation. In the existing DEV installation,
   `athyper_atlas_writer_dev` needs CONNECT on STUDIO and NEON; its existing role
   memberships survive the reset. Do not grant it access to additional planes.

4. Clear pending BullMQ jobs while all producers remain stopped. The stock runtime
   uses REDIS_BULLMQ_URL; inspect the actual rendered URL/database before clearing.
   Use redis-cli inside that DEV Redis service, read its password from the mounted
   secret, select that database with `-n`, and run **FLUSHDB**, not FLUSHALL. Clear
   the DEV application cache database too, because it can contain old object URLs
   and publication descriptors. If a dedicated jobs Redis overlay is selected,
   clear that selected service/database instead. Never print credential-bearing URLs.
5. Run `dc run --rm objectstorage-init` twice. Both runs must succeed, preserving
   existing objects and sentinel bytes. For stale-policy acceptance, alter a test
   artifacts-writer deny-delete policy through the admin context, rerun initialization,
   and confirm that policy is restored. App/writer identities and bucket permissions
   come from the SeaweedFS service configuration; verify those separately.
6. Start poolers and the new API/worker/scheduler images. Regenerate the selected
   DEV fixtures through the current attachment, publication, report-pack and transfer
   service flows. Foundation SQL seeds reference data; it does not recreate generated
   object bytes. Do not replay old completed job envelopes or restore old object URIs.
   Re-request generation against freshly seeded IDs. Include at least one tenant
   shared across two planes, a report pack, an import source/error report, an export,
   a template and a publication release. Templates are retained until the next reset.
   Retire deployment descriptors for releases removed by the reset, including an
   obsolete `BP_AUTHORIZATION_DEPLOYMENT_CONFIG_PATH`. Republish and qualify a new
   Business Partner release before restoring its deployment descriptor. Retain the
   prior Compose specification privately for recovery; do not restore old artifact
   references or disable signature validation to get through startup.
   Saved browser sessions are invalidated when their Redis database is cleared;
   authenticated HTTP acceptance requires a fresh sign-in.

## Acceptance and evidence

Run authenticated functional platform verification. Development qualification now
requires `records.storage-round-trip` and `governance.storage-write-once`, including
one winning concurrent create, unchanged bytes and explicit AccessDenied/403 on
delete. Preserve the verification JSON alongside source revision, pinned SeaweedFS and s3-tools images
and init results. Probe objects remain in artifacts until explicit local reset.

Also execute actual service round trips (not only raw adapter probes): identical
publication/report-pack retries must succeed idempotently, changed bytes must
conflict, and a report pack's persisted s3 URI must download the original bytes.
Confirm app credentials cannot write/delete artifacts and writer credentials cannot
delete them.

For transfer cleanup, use the runtime/worker database login, not postgres. Create
expired and unexpired fixtures in two planes using the same tenant and transfer IDs;
run maintenance per plane and verify only the expired matching-plane objects and
rows are purged/acknowledged. Verify the new cleanup function signatures/grants and
absence of old overloads in pg_proc. Enumerate seeded attachment/document locations,
publication.artifact.artifact_uri, report-pack URIs and transfer keys: every live
reference must resolve to the new bucket/key and expected checksum; no reference
may point to the retired buckets or old key grammar. Confirm no old queued jobs remain.

Only mark live acceptance complete after these checks pass. A green unit suite or
read-only startup probe is not a substitute.

## Historical isolated verification harnesses

`tooling/scripts/verification/isolated-execution` is the release-19 / 20260910 pinned
image harness. `isolated-successor` derives its environment and authority boundary
from that historical single-bucket harness and approved image receipts. Their
`S3_BUCKET=bp-release19-qualification` values deliberately remain for replay of those
images. They are not the v6 runtime bootstrap. Do not point their arbitrary candidate
image entrypoints at a v6 host: provision a separate v6 three-bucket sandbox and new
qualification evidence first. Historical acceptance does not qualify v6 storage.

`retain-development-publication-receipts.mjs` uses the current host and now requires
S3_BUCKET_ARTIFACTS; its read-only app credential remains appropriate.
