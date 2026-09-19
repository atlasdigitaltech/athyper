# Infrastructure image updates

PostgreSQL, Redis (main and jobs), PgBouncer, MinIO server/client and Mailpit use
`tag@sha256:<index digest>` references in the instance Compose files and service
catalog. Related database initializer services use the same PostgreSQL reference.

During the September 2026 qualification, Docker Hub denied access to the selected
MinIO server/client releases, including their digest references. The same releases
were available from the upstream `quay.io/minio` repositories. Both index digests
and the downloaded amd64 image IDs matched the existing locally qualified images.
The registry change preserves those image contents. Pinning does not establish
that an old release has no vulnerabilities or replace upstream security review.

## Maintenance

1. Review upstream release notes and security advisories before choosing a release.
2. Resolve the top-level index with `docker buildx imagetools inspect <tag>` and
   inspect the resulting `tag@sha256:<digest>` again. Verify deployment architecture
   coverage; current pins include Linux amd64 and arm64. Do not substitute a local
   image ID or a single architecture's manifest digest for the index.
3. Update matching references in `deploy/catalog/capabilities.yaml` and all three
   instance files: `compose.yaml`, `compose.parity.yaml`, `compose.optional.yaml`.
   Search for the old tag to catch initializer and optional-service references.
4. Run the structure tests and the Redis and full hardening qualifications listed
   in `deploy/compose/tests/README.md`. Qualify on each target architecture before
   rollout; the initial runtime tests ran on amd64, with arm64 index presence checked.
5. Record old/new digests and results. Recreate only the intended services during
   rollout. Database/object-storage version upgrades require their own backup,
   compatibility and rollback review; a digest pin is not an upgrade qualification.

The `searchcore-key-init` Bake target provides the build/publication hook for the
local provisioning image. Its README explains how to consume a published digest
without inheriting Compose's `pull_policy: build` behavior.

Keycloak's `start-dev --import-realm` and writable-root exception remain tracked
separately. Switching to `start --optimized` requires matching build-time options
and realm-import, authentication and restart qualification; this image-pinning
change does not claim to complete that work.
