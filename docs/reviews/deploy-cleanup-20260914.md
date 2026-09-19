# Deploy review and cleanup — 14 September 2026

Reviewed `deploy/` (approximately 3.2 MiB) for generated files, backups, duplicate
content, broken documentation links, container bind mounts and deployment tests.
Existing checkout changes were retained.

## Cleanup

- Removed `deploy/config/memorycache/redis-acl.conf`, a tracked generated legacy
  ACL containing password hashes. No existing container mounted it, and the
  current startup wrappers do not consume it. Its template remains; the local
  ignore rule already excludes regenerated output.
- Removed the empty `deploy/compose/instance/config/loki` directory.
- No database dumps, backup archives, build caches or temporary logs were found
  in `deploy/`. Dependency links, SQL reconciliation scripts, release manifests,
  schemas, test fixtures, IAM assets and active review overlays were retained.
- Identical Grafana dashboard copies were retained because they belong to
  separate deployment/provisioning trees.

A checksum-verified, owner-only snapshot of the pre-cleanup deploy tree is at
`~/.athyper/backups/deploy-cleanup/20260914T034937Z/deploy-before-cleanup.tar.gz`.
It excludes `node_modules` and includes the removed ACL; treat it as private.
No database volumes, images, existing containers or operator backups were deleted.

## Fixes

- The disposable hardening harness uses the S3 helper's AWS SDK instead of the
  removed MinIO `mc` executable for write/read persistence checks.
- Overlay rendering includes `compose.optional.yaml` before the publication
  secretstore and observability overlays.
- The harness requires an explicit optimized `ATHYPER_TEST_IAM_IMAGE`, instead
  of silently selecting the obsolete `athyper/keycloak:local-dev` image.
- The read-only controller test uses an isolated operator root so personal QA
  publication overrides cannot invalidate plans based on repository templates.
- Updated storage/IAM instructions, release inventory guidance, local DEV entry
  commands and cleanup guidance; replaced the broken IAM documentation link.

## Validation

- `pnpm stack:v2:test`: 133 passed, 19 opt-in checks skipped, one failure for
  the already-applied migration described below (153 tests total).
- Disposable hardening qualification passed with DEV's optimized IAM image:
  DEV/QA/STG overlay rendering, operations rendering, authenticated database,
  Valkey, S3 and IAM access, restart persistence, repeat bucket provisioning,
  and read-only roots. Temporary containers, networks and volumes were removed.
- Syntax validation passed for 27 shell scripts, 83 JavaScript modules and
  55 JSON files. No broken relative Markdown links remain in `deploy/`.
- All six existing DEV source application containers remain healthy.

## Migration finding and follow-up correction

The deployment structure test rejects
`server/db/migrations/20260913_reference_choice_recent.sql` because it lacks an
outer `BEGIN`/`COMMIT` transaction. Read-only queries confirmed that this filename
is already recorded as `applied` in Studio, NEON and Mesh DEV migration ledgers.
Changing the file would change its checksum; adding a test exception would not
repair the partial-application risk. Neither was done during directory cleanup.
The subsequent requested correction adds a checksum-pinned registry of the five
historical unwrapped files. The forward runner applies those exact files using
`psql --single-transaction`; ordinary migrations retain their SQL wrappers.
The SQL files and existing database ledgers are unchanged. The disposable
PostgreSQL test confirms mid-file failure rollback, successful application,
unchanged replay, and rejection of modified checksums. The structure check now
passes. Updated runner behavior takes effect in future runtime images built
from this checkout; this cleanup did not rebuild or deploy release images.

Follow-up validation: `pnpm stack:v2:test` passes with 134 passed, zero failures
and 20 opt-in checks skipped. The new rollback/replay test was also enabled and
passed separately against disposable PostgreSQL. DEV's original migration
checksum and applied status were rechecked in all three databases and match.
