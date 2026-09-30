# Valkey qualification and immutable QA release — 2026-09-12

Scope: local DEV/QA cache migration, immutable image publication, and QA qualification. AWS provisioning, AWS data migration, staging qualification, and production promotion remain deferred.

## Valkey

The deployment uses Valkey 8.1.10 (BSD-3-Clause). The legacy `redis` ImageSet key, `ATHYPER_IMAGE_REDIS`, `REDIS_*` settings, service DNS name `memorycache`, and Redis-compatible metric names remain integration interfaces. They do not select Redis 7.4. The Redis 7.4 image is retained only as a migration test fixture and rollback material, outside the release ImageSet.

- Upstream base: `valkey/valkey:8.1.10-alpine@sha256:d2e18f3410b6f616de1417f570fa55261af2898b9c5b2cfb6781ce2373ea43d1`.
- Authenticated startup uses an owner-only temporary configuration, with no password in command arguments.
- 256 MiB `maxmemory`, `noeviction`, AOF persistence, and the 512 MiB container limit remain enforced.
- Real session TTL, BullMQ execution, restart persistence, OOM rejection, and exporter error metrics passed.
- Both firing and resolved exporter alerts reached the local Mailpit recipient `redis-alerts@athyper.test`. This proves local delivery; it is not an external production notification configuration.

Redis 7.4 RDB format 12 is incompatible with this Valkey release. Migration therefore rewrote Redis persistence with `aof-use-rdb-preamble no`, paused application writers, stopped Redis cleanly, and copied only command AOF files into separate Valkey volumes. The fixture verified strings, hashes, lists, sets, sorted sets, multiple databases, absolute expirations, and stream consumer-group pending state.

Live migration preserved the non-expiring key counts: QA 5,454 and DEV 22,096. The lower total key counts after cutover corresponded to expiring keys. Original Redis volumes are retained as cutover-time rollback snapshots; they do not contain subsequent Valkey writes. Rolling back later requires a fresh, quiesced data transfer.

Active volumes are `athyper-dev_valkey-data` and `athyper-qa-candidate-1789163256545_valkey-data`. Compose now selects `valkey-data` for subsequent starts.

Sources: [Valkey releases](https://valkey.io/download/), [Valkey license](https://github.com/valkey-io/valkey/blob/8.1.10/COPYING).

## Complete image inventory

The release inventory covers 18 images: the five application images, PostgreSQL, Valkey, PgBouncer, Traefik, Meilisearch, Gotenberg, Tika, SeaweedFS, S3 tools, ClamAV, the search-key initializer, Nginx, and Mailpit. The latter two retain their scanned upstream digest pins; the other 16 are built and published with SBOM/provenance attestations.

Fresh checks of the previously retained application/helper images found 51 additional blocking package findings beyond the earlier ten-image infrastructure remediation: 19 in Keycloak and the three web images, and 32 in ClamAV and the search initializer. These are package findings, not unique CVEs.

Repairs include Next.js 16.3.3, Sharp 0.35.4, updated OpenSSL/Alpine packages, Keycloak 26.7.3 with the complete Netty 4.1.137 module set and Microsoft JDBC 13.4.0.jre11, and an Alpine 3.24 search initializer. Keycloak dependency downloads are checksum-verified; original bootstrap filenames are retained while JAR metadata records the actual patched versions. No vulnerability suppression was used.

The source snapshot also retains the original audit's system-job UUID fixes and corrected dead-letter constraint/migration. Read-only checks confirmed the fixed constraint in all six running DEV/QA plane databases.

[Next.js security release](https://nextjs.org/blog/august-2026-security-release), [Netty patch release](https://github.com/netty/netty/releases/tag/netty-4.1.137.Final), [Microsoft JDBC releases](https://github.com/microsoft/mssql-jdbc/releases).

## Publication and qualification

The clean build source is the isolated checkout at `~/.athyper/candidates/20260912-release/complete-source`, revision `f02e10107af4797541f585b3cde89bde13fcbdf7`, based on the existing QA application baseline plus the scoped infrastructure and security repairs. It does not incorporate the unrelated current workspace edits.

`tooling/scripts/release/publish-qualified-image-set.mjs` builds each image, scans it, pushes it to GHCR, verifies the registry digest and attestation manifest, and scans that exact published digest. It emits the ImageSet only after the complete inventory passes. The Actions workflow also gates published digests before assembling its manifest. The promotion helper now requires the same complete inventory and rejects the former application-only set. A clean build exposed an ignored S3 helper npm lockfile; the lockfile is now included explicitly, and the final revision was rebuilt rather than mixing source revisions.

Private build/scan/publication evidence is retained under `~/.athyper/deployments/infra-remediation-20260912/publication-complete/`. Per-image receipts record immutable references, source revision, and scan report hashes. An IAM database backup is retained privately before the QA update.

Publication is complete: all 18 exact published digests have zero fixable HIGH/CRITICAL package findings in the retained September 12 scan database. All 16 built-image SPDX SBOM and SLSA provenance documents were retrieved from GHCR and validated. This is the existing package gate, not a claim that every severity or unfixable finding is absent.

QA now runs 20 healthy containers from those published references. The scoped search initializer, S3 initialization/permissions/multipart operations, real BullMQ/session TTL probe, compiled runtime presigned upload/read/delete, and SMTP delivery passed. Public HTTPS presigned reads passed for both DEV and QA. The QA ownership receipt and checked-in candidate ImageSet record the deployed revision and references. A live TLS probe exposed Traefik rejecting the publication proxy’s `.json` provider filename; the QA configuration generator and active overlay now use `.yaml` (JSON-compatible YAML content). The runtime then reached the publication provider’s `/api/status` over certificate-verified TLS with HTTP 200. Firing and resolved alerts were received again by local Mailpit. The source snapshot is retained locally; no source branch was pushed to the public repository.

Exact-image regression tests passed for Valkey (5), PostgreSQL/PgBouncer (1), ingress (1), document processing (2), and Keycloak authentication/optimized restart (1). Release/helper tests and deployment-model checks passed. The promotion helper rejects the former five-image-only candidate; STG/PROD were not promoted.

QA qualification for this infrastructure ImageSet passed at `2026-09-12T06:23:20.154952+00:00`. All four authenticated browser checks—`catl.admin` and `catl.owner` on Studio and Neon—verified the expected Cirrus identity, HTTP 200 from authenticated contexts and application pages, and zero browser errors. A final deployment check confirmed all 20 containers still match the published images and are running. No assurance or idle-timeout policy was bypassed.

The private qualification receipt binds the source revision, all 18 immutable references, and evidence hashes. This completes the requested Valkey → image publication → QA qualification work. AWS staging provisioning/qualification and production promotion remain deferred; this record does not approve production or assert unrelated application certifications.

[Published references and scan evidence](evidence/valkey-immutable-images-20260912.json), [QA candidate ImageSet](../../deploy/image-sets/candidates/qa-local.yaml).
