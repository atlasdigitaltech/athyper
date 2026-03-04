# Content Management

The content management service provides file upload, versioning, access control, and document rendering capabilities. It is a Tier 2 platform service used by all layers above it.

---

## Architecture

```
Client (Browser)
    │
    ├─ Upload: POST /api/content/upload → presigned S3 URL → PUT to MinIO
    ├─ Download: GET /api/content/download/:id → presigned S3 URL → GET from MinIO
    │
    ▼
Next.js BFF (content routes)
    │
    ▼
Runtime Content Module
    ├─ ContentService        Core upload/download logic
    ├─ VersionService        Version history & restore
    ├─ LinkService           Entity-document linking
    ├─ AclService            Per-document permissions
    ├─ MultipartUploadService  Large file chunked upload
    ├─ PreviewService        Preview generation
    ├─ ExpiryService         Document expiration
    ├─ CommentService        Document comments
    ├─ AccessLogService      Access audit trail
    │
    ▼
Object Storage (MinIO / S3)       PostgreSQL (doc schema)
```

---

## Content Service

File: `framework/runtime/src/services/platform-services/content/domain/services/ContentService.ts`

### Upload Flow

```
1. Client requests upload URL
2. Server validates: file type, size limits, tenant quota
3. Server generates storage key: {tenant}/{entity}/{hash}/{filename}
4. Server creates presigned PUT URL (5-minute expiry)
5. Client uploads directly to S3/MinIO using presigned URL
6. Server records metadata in database
7. SHA-256 content hash computed for deduplication
```

### Download Flow

```
1. Client requests download URL
2. Server checks ACL permissions
3. Server generates presigned GET URL (15-minute expiry)
4. Server logs access event
5. Client downloads directly from S3/MinIO
```

### Storage Key Format

```
{tenantId}/{entityType}/{entityId}/{contentHash}/{originalFilename}
```

Tests: `content/storage/storage-key-builder.test.ts`

---

## Versioning

File: `framework/runtime/src/services/platform-services/content/domain/services/VersionService.ts`

Every content update creates a new version:

| Field           | Purpose                           |
| --------------- | --------------------------------- |
| `versionNumber` | Auto-incrementing version counter |
| `contentHash`   | SHA-256 hash for deduplication    |
| `createdBy`     | User who created the version      |
| `createdAt`     | Timestamp                         |
| `comment`       | Optional version comment          |
| `storageKey`    | S3 key for this version's content |

### Operations

- **List versions**: Returns version history for a document
- **Restore version**: Creates a new version by copying an old version's content
- **Compare versions**: Returns metadata diff between two versions

API handler: `content/api/handlers/version.handler.ts`

---

## Access Control (ACL)

File: `framework/runtime/src/services/platform-services/content/domain/services/AclService.ts`

Per-document permission grants:

| Permission | Effect                          |
| ---------- | ------------------------------- |
| `read`     | Can download and view document  |
| `write`    | Can upload new versions         |
| `delete`   | Can delete the document         |
| `share`    | Can grant permissions to others |
| `admin`    | Full control (all permissions)  |

### Grant Levels

| Level    | Scope                          |
| -------- | ------------------------------ |
| `user`   | Specific user ID               |
| `role`   | Anyone with the specified role |
| `group`  | Members of a specified group   |
| `tenant` | All users in the tenant        |
| `public` | Anyone (with link)             |

Repository: `content/persistence/DocumentAclRepo.ts`
API handler: `content/api/handlers/acl.handler.ts`

---

## Multipart Upload

File: `framework/runtime/src/services/platform-services/content/domain/services/MultipartUploadService.ts`

For large files (>5MB), supports chunked multipart upload:

```
1. Initiate multipart upload → receive uploadId
2. Upload parts (each part gets a presigned URL)
3. Complete multipart upload → parts assembled into final object
4. Or: Abort multipart upload → parts cleaned up
```

API handler: `content/api/handlers/multipart.handler.ts`

### Stale Multipart Cleanup

Worker: `content/workers/cleanup-stale-multipart.worker.ts`

Automatically cleans up abandoned multipart uploads older than 24 hours.

---

## Entity-Document Linking

File: `framework/runtime/src/services/platform-services/content/domain/services/LinkService.ts`

Documents are linked to business entities via a many-to-many relationship:

```
Entity (e.g., Order #123)  ──M:N──  Document (e.g., PO.pdf v3)
```

| Operation                   | Endpoint                            |
| --------------------------- | ----------------------------------- |
| Link document to entity     | `POST /api/content/link`            |
| Unlink document from entity | `DELETE /api/content/link`          |
| List entity documents       | `GET /api/content/entity/:type/:id` |
| List document entities      | `GET /api/content/doc/:id/entities` |

API handler: `content/api/handlers/link.handler.ts`

---

## Document Expiry

File: `framework/runtime/src/services/platform-services/content/domain/services/ExpiryService.ts`

Documents can have expiration dates:

- Set expiry date on upload or later
- Expired documents are soft-deleted
- Cleanup worker permanently deletes expired content

Worker: `content/workers/cleanup-expired-files.worker.ts`
API handler: `content/api/handlers/expiry.handler.ts`

---

## Preview Generation

File: `framework/runtime/src/services/platform-services/content/domain/services/PreviewService.ts`

Generates preview thumbnails for supported file types:

- Images: Resize to thumbnail dimensions
- PDFs: First page thumbnail
- Office documents: Converted preview (if renderer available)

Worker: `content/workers/generate-previews.worker.ts`
API handler: `content/api/handlers/preview.handler.ts`

---

## Access Logging

File: `framework/runtime/src/services/platform-services/content/domain/services/AccessLogService.ts`

Every document access is logged:

| Field        | Purpose                              |
| ------------ | ------------------------------------ |
| `documentId` | Which document                       |
| `userId`     | Who accessed it                      |
| `action`     | `view`, `download`, `edit`, `delete` |
| `timestamp`  | When                                 |
| `ip`         | Client IP                            |

Cleanup: `content/workers/cleanup-access-logs.worker.ts`
Repository: `content/persistence/AccessLogRepo.ts`
API handler: `content/api/handlers/access-log.handler.ts`

---

## Document Rendering Service

A separate service for generating formatted documents from templates.

File: `framework/runtime/src/services/platform-services/document/`

### Components

| Component          | File                      | Purpose                                     |
| ------------------ | ------------------------- | ------------------------------------------- |
| Template service   | `DocTemplateService.ts`   | Template CRUD, versioning, publish/retire   |
| HTML composer      | `DocHtmlComposer.ts`      | Merges template + data + brand + letterhead |
| PDF renderer       | `DocRenderService.ts`     | HTML → PDF via Puppeteer                    |
| Brand service      | `DocBrandService.ts`      | Brand profiles (colors, logos, fonts)       |
| Letterhead service | `DocLetterheadService.ts` | Letterhead management                       |
| Output service     | `DocOutputService.ts`     | Output storage, download, verification      |
| DLQ manager        | `DocRenderDlqManager.ts`  | Dead letter queue for failed renders        |

### Render Pipeline

```
Template + Data + Brand + Letterhead
           │
           ▼
    HTML Composer (Handlebars)
           │
           ▼
    PDF Renderer (Puppeteer)
           │
           ▼
    Output Storage (S3/MinIO)
           │
           ▼
    Audit Event + Notification
```

### Background Workers

| Worker                       | Purpose                             |
| ---------------------------- | ----------------------------------- |
| `renderDocument.worker.ts`   | Async document rendering            |
| `cleanupOutputs.worker.ts`   | Clean up expired outputs            |
| `recoverStuckJobs.worker.ts` | Recover renders stuck in processing |

---

## Database Schema (`doc`)

| Table                   | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `doc.attachments`       | File metadata (name, type, size, hash, storage key) |
| `doc.document_acl`      | Per-document permission grants                      |
| `doc.document_versions` | Version history                                     |
| `doc.document_links`    | Entity-document relationships                       |
| `doc.document_comments` | Comments on documents                               |
| `doc.access_log`        | Document access audit trail                         |
| `doc.templates`         | Document templates                                  |
| `doc.template_versions` | Template version history                            |
| `doc.template_bindings` | Template-entity bindings                            |
| `doc.outputs`           | Rendered document outputs                           |
| `doc.render_jobs`       | Render job queue                                    |
| `doc.render_dlq`        | Render dead letter queue                            |
| `doc.brand_profiles`    | Brand configurations                                |
| `doc.letterheads`       | Letterhead definitions                              |

SQL: `framework/adapters/db/src/sql/070_doc.sql`

---

## UI Components

Shared React components in `packages/ui/src/content/`:

| Component                 | Purpose                                |
| ------------------------- | -------------------------------------- |
| `AttachmentCard`          | File attachment display with actions   |
| `AttachmentList`          | List of attachment cards               |
| `EntityDocumentsPanel`    | Document panel for entity detail pages |
| `FilePicker`              | File selection dialog                  |
| `DocumentVersionTimeline` | Version history timeline view          |
| `DocumentAclManager`      | ACL management interface               |

API client: `packages/api-client/src/content/contentClient.ts`

---

## Tests

| Test File                               | Coverage                    |
| --------------------------------------- | --------------------------- |
| `content-taxonomy.test.ts`              | Content type classification |
| `storage-key-builder.test.ts`           | Storage key generation      |
| `cleanupOrphanedUploads.worker.test.ts` | Orphaned upload cleanup     |
| `DocHtmlComposer.test.ts`               | HTML composition            |
| `DocRenderDlqManager.test.ts`           | DLQ operations              |
| `OutputStatusMachine.test.ts`           | Output state transitions    |
| `PdfRenderer.test.ts`                   | PDF rendering               |
| `contentClient.test.ts`                 | API client                  |

---

## Related Documentation

- [Architecture](../architecture/README.md) — System architecture
- [Infrastructure](../infrastructure/README.md) — MinIO/S3 setup
- [Security](../security/README.md) — Field-level security, ACL enforcement
