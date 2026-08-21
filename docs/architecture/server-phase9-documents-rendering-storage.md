# Phase 9: Documents, Rendering, and Object Storage

## Outcome

The first document-delivery slice is shared by Athyper, Neon, and Mesh. An authenticated request uses the active Entity Meta operation, resolves the plane-local published template binding and immutable template version, renders PDF through Gotenberg, stores it through the object-storage port, and records it in the universal attachment model.

## Canonical ownership

| Concern | Canonical owner |
| --- | --- |
| Object byte operations | `@athyper/server-contract-object-storage` |
| HTML-to-PDF boundary | `@athyper/server-contract-rendering` |
| Document commands, results, and repositories | `@athyper/server-contract-documents` |
| Provider-neutral byte/stream malware scanning | `@athyper/server-contract-malware-scanning` |
| Rendering availability facade | `@athyper/server-platform-rendering` |
| Document orchestration, strict template expansion, routes, and Kysely repositories | `@athyper/server-service-documents` |
| S3/MinIO implementation | `@athyper/server-adapter-object-storage-s3` |
| Gotenberg implementation | `@athyper/server-adapter-rendering` |
| ClamAV INSTREAM implementation | `@athyper/server-adapter-malware-clamav` |
| Concrete construction | `@athyper/server-platform-host` |

Documents imports capability contracts, never AWS SDK, Gotenberg, host, or plane adapter packages.

## DDL and Entity Meta model

The following model exists in every plane:

- `master.template` owns lifecycle and points to `current_version_id` only when published.
- `master.template_binding` coordinates tenant, entity, operation, variant, locale, brand, letterhead, and print profile. The first slice consumes the template, letterhead HTML, and print profile; brand asset expansion is deferred.
- `snapshot.template_version` owns immutable, checksummed locale content.
- `document.attachment` owns object metadata.
- `document.attachment_link` owns the polymorphic entity relationship.

Entity Meta remains the authority for whether an entity operation exists and which permission protects it. It does not duplicate template HTML. A local `master.template_binding` supplies the presentation choice after the active runtime descriptor publishes the operation.

The service uses `document.attachment` rather than Neon-only `document.render_output`, preserving identical behavior across Athyper, Neon, and Mesh. Generated attachments use kind `generated_document`, link kind `rendered`, SHA-256 evidence, the immutable template coordinate, renderer provider/duration, and optional idempotency metadata.

## Runtime behavior

`POST /api/documents/render`:

1. Authenticates and requires `documents.render`.
2. Resolves the active plane-local Entity Meta descriptor.
3. Rejects an unpublished operation and enforces its operation permission.
4. Returns an existing tenant-scoped artifact for a repeated idempotency key.
5. Resolves the published binding with requested/default variant and locale fallback.
6. Uses the immutable current version only within its effective dates.
7. Validates required variables and expands only escaped scalar Handlebars paths.
8. Renders through Gotenberg with DDL-backed paper, orientation, margin, header/footer, and background settings.
9. Streams the rendered bytes through the malware-scanning port. Infection and scanner failure are audited and rejected before storage (fail closed).
10. Stores a clean PDF under a plane/tenant/entity-scoped key with SHA-256 and scan metadata.
11. Commits attachment, link, outbox event, and audit together in the local tenant transaction. Only a real clean result sets `is_virus_scanned=true`.
12. Deletes the uploaded object if durable persistence fails. Concurrent idempotent races return the winning durable artifact after cleanup.

`POST /api/documents/:documentId/download` requires `documents.download`, proves tenant-local attachment access, creates a short-lived signed URL, and audits URL creation. The API never exposes raw storage credentials or accepts caller-controlled object keys.

## Container applications

- `stack/compose/render/athyper-docrender.yml` supplies the pinned Gotenberg 8 container. The host uses `DOCRENDER_BASE_URL`; startup fails when a configured renderer is unhealthy.
- `stack/compose/objectstorage/athyper-objectstorage.yml` supplies MinIO locally and provisions a scoped application account and bucket policy.
- `stack/compose/security/athyper-virusscan.yml` supplies pinned ClamAV. The host checks `PING` readiness and uses the internal `INSTREAM` protocol at `CLAMD_HOST:CLAMD_PORT`.
- The host prefers `APP_S3_ACCESS_KEY` and `APP_S3_SECRET_KEY` outside local development, preventing use of MinIO root credentials by the application.
- Managed S3 remains supported by omitting `S3_ENDPOINT`; endpoint-based storage automatically uses path-style addressing for MinIO compatibility.
- Gotenberg input/output byte limits, conversion timeout, PDF signature validation, resource-loading failure policy, S3 upload limits, multipart limits, signing TTL, and startup access probes remain enforced by their adapters.

## Legacy disposition

| Legacy area | Disposition | Reason |
| --- | --- | --- |
| Gotenberg HTML-to-PDF client | Rebuilt and retained | Current recommended renderer with bounded input/output and health checks. |
| Legacy custom PDF-renderer container/client | Retired | Superseded by pinned Gotenberg. |
| S3 object operations and presigning | Rebuilt and retained | Adapter now implements a narrow capability-owned contract. |
| Template/binding/version reads | Rebuilt | Uses current three-plane master/snapshot DDL. |
| Generated artifact persistence | Rebuilt | Uses universal attachment/link DDL and compensating cleanup. |
| Neon `document.render_output` queue/replay lifecycle | Deferred Neon extension | Not present in Athyper or Mesh; asynchronous high-volume rendering is a later bounded slice. |
| Generated-PDF malware scanning | Rebuilt and retained | Scan occurs before object storage; clean provenance is durable and downloads require `is_virus_scanned=true`. |
| General attachment upload, folders, versions, quarantine, and deletion lifecycle | Deferred attachment slice | Requires streaming upload, quarantine storage, retention, and extraction governance. |
| Tika document parser worker | Rebuilt and retained | Implemented as the separate content-extraction contract, Tika adapter, and governed document-processing job. |
| LibreOffice source-document conversion | Deferred | Gotenberg supports it, but no stable public contract is owned yet. |
| Brand palette/typography, logo assets, and watermark expansion | Deferred | Requires a reviewed asset-resolution and CSS-variable contract; template styles and letterhead HTML work now. |
| Full Handlebars helpers, blocks, partials, and raw HTML variables | Deferred/disabled | Runtime enables only escaped scalar paths; richer template programs require a reviewed helper catalog and sandbox contract. |
| Template authoring/publishing API and UI | Deferred Athyper authoring slice | Draft/review/publish and immutable snapshot creation must be governed separately. |

No document-specific background job is required for this synchronous first slice.

## Remaining production gates

Add PostgreSQL integration tests under real Athyper, Neon, and Mesh RLS roles; exercise the live MinIO, Gotenberg, Tika, Meilisearch, ClamAV, and Redis containers; and add the governed template publishing workflow. Later slices can add async render-output replay, general attachment ingestion, recovery sweeps, deletion/expiry index consumers, and office-format conversion without changing the boundaries above.
