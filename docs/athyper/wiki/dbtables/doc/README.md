# DOC Schema -- Document Management & Template Engine

> **Source DDL**: `framework/adapters/db/src/sql/080_doc.sql`
> **PostgreSQL 16+**

The `doc` schema implements a comprehensive document management system covering five major areas:

1. **Storage Layer** -- Object storage-backed attachments with versioning, content deduplication (SHA-256), preview generation, and expiration policies.
2. **Document Registry** -- Logical document metadata with tagging and search.
3. **Template Engine** -- Versioned, governed template definitions supporting Handlebars, MJML, and React-PDF engines with entity-operation binding resolution.
4. **Brand Layer** -- Tenant/org-unit scoped letterhead and brand profiles for consistent document branding.
5. **Render Pipeline** -- Immutable rendered outputs with BullMQ job tracking, dead-letter queue for failed renders, and full lifecycle management (queued through archived/revoked).

All tables are tenant-isolated (every table carries a `tenant_id` foreign key to `core.tenant`).

---

## Table of Contents

- [doc.attachment](#docattachment)
- [doc.document](#docdocument)
- [doc.template](#doctemplate)
- [doc.template_version](#doctemplate_version)
- [doc.template_binding](#doctemplate_binding)
- [doc.letterhead](#docletterhead)
- [doc.brand_profile](#docbrand_profile)
- [doc.render_output](#docrender_output)
- [doc.render_job](#docrender_job)
- [doc.render_dlq](#docrender_dlq)
- [doc.entity_document_link](#docentity_document_link)
- [doc.document_acl](#docdocument_acl)
- [doc.attachment_access_log](#docattachment_access_log)
- [doc.attachment_comment](#docattachment_comment)
- [doc.multipart_upload](#docmultipart_upload)
- [Entity Relationship Diagram](#entity-relationship-diagram)

---

## doc.attachment

Object storage-backed file attachments (MinIO/S3). Each attachment represents a file stored in a cloud bucket and tracks its metadata, content hash, virus scan status, and retention policy. Attachments support versioning via a self-referencing `parent_attachment_id` chain, content deduplication through SHA-256 checksums, and a `kind` taxonomy for classification. Preview and thumbnail generation is tracked to support file browser UIs. Attachments can optionally be linked to comments (entity or approval comments) via the `comment_type`/`comment_id` columns.

### Columns

| Column                      | Type             | Nullable | Default             | Description                                                                                               |
| --------------------------- | ---------------- | -------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`                        | `uuid`           | NOT NULL | `gen_random_uuid()` | Primary key.                                                                                              |
| `tenant_id`                 | `uuid`           | NOT NULL | --                  | FK to `core.tenant(id)`. Tenant scope.                                                                    |
| `owner_entity`              | `text`           | NULL     | --                  | Entity type that owns this attachment (e.g., "invoice").                                                  |
| `owner_entity_id`           | `text`           | NULL     | --                  | ID of the owning entity.                                                                                  |
| `file_name`                 | `text`           | NOT NULL | --                  | Display file name.                                                                                        |
| `content_type`              | `text`           | NULL     | --                  | MIME type (e.g., "application/pdf").                                                                      |
| `size_bytes`                | `bigint`         | NULL     | --                  | File size in bytes.                                                                                       |
| `storage_bucket`            | `text`           | NOT NULL | --                  | Object storage bucket name.                                                                               |
| `storage_key`               | `text`           | NOT NULL | --                  | Object storage key/path.                                                                                  |
| `is_virus_scanned`          | `boolean`        | NOT NULL | `false`             | Whether the file has been virus scanned.                                                                  |
| `retention_until`           | `timestamptz`    | NULL     | --                  | Retention policy: do not delete before this date.                                                         |
| `metadata`                  | `jsonb`          | NULL     | --                  | Arbitrary metadata.                                                                                       |
| `created_at`                | `timestamptz`    | NOT NULL | `now()`             | Row creation timestamp.                                                                                   |
| `created_by`                | `text`           | NOT NULL | --                  | Identity of the uploader.                                                                                 |
| `kind`                      | `text`           | NOT NULL | `'attachment'`      | Content kind taxonomy. See constraint for allowed values.                                                 |
| `sha256`                    | `text`           | NULL     | --                  | SHA-256 hash of file content for deduplication.                                                           |
| `original_filename`         | `text`           | NULL     | --                  | Original filename as uploaded by the user.                                                                |
| `uploaded_by`               | `text`           | NULL     | --                  | Display name or ID of the uploader.                                                                       |
| `shard`                     | `integer`        | NULL     | --                  | Storage shard number for distributed buckets.                                                             |
| `version_no`                | `integer`        | NULL     | `1`                 | Version number within the version chain.                                                                  |
| `is_current`                | `boolean`        | NULL     | `true`              | Whether this is the current (latest) version.                                                             |
| `parent_attachment_id`      | `uuid`           | NULL     | --                  | Self-referencing FK. Previous version in the version chain.                                               |
| `replaced_at`               | `timestamptz(6)` | NULL     | --                  | When this version was replaced by a newer one.                                                            |
| `replaced_by`               | `text`           | NULL     | --                  | Identity of who replaced this version.                                                                    |
| `thumbnail_key`             | `text`           | NULL     | --                  | Object storage key for thumbnail image.                                                                   |
| `preview_key`               | `text`           | NULL     | --                  | Object storage key for preview image/file.                                                                |
| `preview_generated_at`      | `timestamptz(6)` | NULL     | --                  | When the preview was generated.                                                                           |
| `preview_generation_failed` | `boolean`        | NULL     | `false`             | Whether preview generation has permanently failed.                                                        |
| `expires_at`                | `timestamptz(6)` | NULL     | --                  | Expiration timestamp for auto-deletion policy.                                                            |
| `auto_delete_on_expiry`     | `boolean`        | NULL     | `false`             | Whether to automatically delete when expired.                                                             |
| `reference_count`           | `integer`        | NULL     | `1`                 | Reference count for content deduplication (garbage collection).                                           |
| `comment_type`              | `text`           | NULL     | --                  | Type of comment this attachment belongs to, if any. Constrained to: `entity_comment`, `approval_comment`. |
| `comment_id`                | `uuid`           | NULL     | --                  | ID of the comment this attachment belongs to, if any.                                                     |

### Primary Key

- `id`

### Foreign Keys

| Column                 | References           | On Delete                                                       |
| ---------------------- | -------------------- | --------------------------------------------------------------- |
| `tenant_id`            | `core.tenant(id)`    | CASCADE                                                         |
| `parent_attachment_id` | `doc.attachment(id)` | SET NULL (self-referencing, added via `attachment_parent_fkey`) |

### Constraints

| Name                          | Type  | Details                                                                                                                                                     |
| ----------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attachment_kind_check`       | CHECK | `kind IN ('attachment', 'generated', 'export', 'template', 'letterhead', 'avatar', 'signature', 'certificate', 'invoice', 'receipt', 'contract', 'report')` |
| `attachment_comment_type_chk` | CHECK | `comment_type IS NULL OR comment_type IN ('entity_comment','approval_comment')`                                                                             |

### Indexes

| Name                             | Columns                                                  | Notes                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `idx_attachment_owner`           | `(tenant_id, owner_entity, owner_entity_id)`             | Lookup attachments by owning entity.                                                                                                      |
| `idx_attachment_kind`            | `(tenant_id, kind, created_at DESC)`                     | Filter by kind with recency ordering.                                                                                                     |
| `idx_attachment_parent`          | `(parent_attachment_id)`                                 | Partial: `WHERE parent_attachment_id IS NOT NULL`. Version chain traversal.                                                               |
| `idx_attachment_sha256`          | `(tenant_id, sha256)`                                    | Partial: `WHERE sha256 IS NOT NULL`. Content deduplication lookups.                                                                       |
| `idx_attachment_current`         | `(tenant_id, owner_entity, owner_entity_id, is_current)` | Partial: `WHERE is_current = true`. Current version fast path.                                                                            |
| `idx_attachment_preview_pending` | `(tenant_id, created_at)`                                | Partial: `WHERE preview_key IS NULL AND preview_generation_failed = false AND content_type LIKE 'image/%'`. Queue for preview generation. |
| `idx_attachment_expired`         | `(tenant_id, expires_at)`                                | Partial: `WHERE expires_at IS NOT NULL AND is_current = true`. Expiration cleanup job.                                                    |
| `idx_attachment_reference_count` | `(sha256, reference_count)`                              | Partial: `WHERE sha256 IS NOT NULL AND reference_count > 0`. Dedup garbage collection.                                                    |
| `idx_attachment_comment`         | `(comment_type, comment_id)`                             | Partial: `WHERE comment_type IS NOT NULL AND comment_id IS NOT NULL`. Comment attachment lookup.                                          |

### Relationships

- **Has many** `doc.attachment` (self-referencing version chain via `parent_attachment_id`).
- **Has many** `doc.entity_document_link` -- Links to entities.
- **Has many** `doc.document_acl` -- Access control entries.
- **Has many** `doc.attachment_comment` -- Threaded comments.
- **Has many** `doc.multipart_upload` -- Multipart upload tracking.

---

## doc.document

Logical document registry that stores document metadata separately from the binary file blobs. Documents are identified by an optional `code` for programmatic lookup and support free-form tagging via a PostgreSQL text array. The `metadata` JSONB column holds arbitrary structured metadata. This table serves as a lightweight catalog -- the actual file content lives in `doc.attachment`.

### Columns

| Column       | Type          | Nullable | Default             | Description                                  |
| ------------ | ------------- | -------- | ------------------- | -------------------------------------------- |
| `id`         | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                 |
| `tenant_id`  | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                     |
| `code`       | `text`        | NULL     | --                  | Optional machine-readable document code.     |
| `title`      | `text`        | NULL     | --                  | Human-readable document title.               |
| `tags`       | `text[]`      | NULL     | --                  | Freeform tags for search and classification. |
| `metadata`   | `jsonb`       | NULL     | --                  | Arbitrary structured metadata.               |
| `created_at` | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                      |
| `created_by` | `text`        | NOT NULL | --                  | Identity of the creator.                     |
| `updated_at` | `timestamptz` | NULL     | --                  | Last modification timestamp.                 |
| `updated_by` | `text`        | NULL     | --                  | Identity of last modifier.                   |

### Primary Key

- `id`

### Foreign Keys

| Column      | References        | On Delete |
| ----------- | ----------------- | --------- |
| `tenant_id` | `core.tenant(id)` | CASCADE   |

### Indexes

| Name                       | Columns             | Notes                                       |
| -------------------------- | ------------------- | ------------------------------------------- |
| `idx_document_tenant_code` | `(tenant_id, code)` | Lookup by code within tenant.               |
| `idx_document_tags`        | `(tags)` using GIN  | Full-text tag search using GIN array index. |

---

## doc.template

Versioned template definitions for document generation. Each template has a `kind` (LETTER, REPORT, CERTIFICATE, PACK, RECEIPT, STATEMENT), a rendering `engine` (HANDLEBARS, MJML, REACT_PDF), and a publication `status` (DRAFT, PUBLISHED, RETIRED). The `current_version_id` points to the latest published template version. Templates support capability flags for RTL layout, letterhead requirements, allowed operations, and supported locales.

### Columns

| Column                | Type          | Nullable | Default             | Description                                                                                           |
| --------------------- | ------------- | -------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `id`                  | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                                                          |
| `tenant_id`           | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                                                              |
| `code`                | `text`        | NOT NULL | --                  | Unique machine-readable template code within tenant.                                                  |
| `name`                | `text`        | NOT NULL | --                  | Human-readable template name.                                                                         |
| `kind`                | `text`        | NOT NULL | --                  | Template category. Constrained to: `LETTER`, `REPORT`, `CERTIFICATE`, `PACK`, `RECEIPT`, `STATEMENT`. |
| `engine`              | `text`        | NOT NULL | `'HANDLEBARS'`      | Rendering engine. Constrained to: `HANDLEBARS`, `MJML`, `REACT_PDF`.                                  |
| `status`              | `text`        | NOT NULL | `'DRAFT'`           | Publication status. Constrained to: `DRAFT`, `PUBLISHED`, `RETIRED`.                                  |
| `current_version_id`  | `uuid`        | NULL     | --                  | FK to `doc.template_version(id)`. Latest published version (deferred FK).                             |
| `metadata`            | `jsonb`       | NULL     | --                  | Arbitrary template metadata.                                                                          |
| `created_at`          | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                                                                               |
| `created_by`          | `text`        | NOT NULL | --                  | Identity of the creator.                                                                              |
| `updated_at`          | `timestamptz` | NULL     | --                  | Last modification timestamp.                                                                          |
| `updated_by`          | `text`        | NULL     | --                  | Identity of last modifier.                                                                            |
| `supports_rtl`        | `boolean`     | NOT NULL | `false`             | Whether this template supports RTL layout (added via ALTER).                                          |
| `requires_letterhead` | `boolean`     | NOT NULL | `false`             | Whether rendering requires a letterhead to be applied (added via ALTER).                              |
| `allowed_operations`  | `text[]`      | NULL     | --                  | Operations this template can be used for (added via ALTER).                                           |
| `supported_locales`   | `text[]`      | NULL     | --                  | Locales this template supports (added via ALTER).                                                     |

### Primary Key

- `id`

### Foreign Keys

| Column               | References                 | On Delete                                          |
| -------------------- | -------------------------- | -------------------------------------------------- |
| `tenant_id`          | `core.tenant(id)`          | CASCADE                                            |
| `current_version_id` | `doc.template_version(id)` | (deferred FK, named `fk_template_current_version`) |

### Constraints

| Name     | Type  | Details                                                                  |
| -------- | ----- | ------------------------------------------------------------------------ |
| (inline) | CHECK | `kind IN ('LETTER','REPORT','CERTIFICATE','PACK','RECEIPT','STATEMENT')` |
| (inline) | CHECK | `engine IN ('HANDLEBARS','MJML','REACT_PDF')`                            |
| (inline) | CHECK | `status IN ('DRAFT','PUBLISHED','RETIRED')`                              |

### Indexes

| Name                         | Columns               | Notes                                       |
| ---------------------------- | --------------------- | ------------------------------------------- |
| `idx_template_tenant_code`   | `(tenant_id, code)`   | UNIQUE. Template code lookup within tenant. |
| `idx_template_tenant_status` | `(tenant_id, status)` | Filter templates by status.                 |

### Relationships

- **Has many** `doc.template_version` -- Immutable version snapshots.
- **Has many** `doc.template_binding` -- Entity-operation resolution bindings.
- **Points to** `doc.template_version` via `current_version_id` (the currently active version).

---

## doc.template_version

Immutable version snapshots of template content. Each version contains the full template content (HTML body, structured JSON blocks, header, footer, CSS), a Zod-compatible variables schema for input validation, and an assets manifest for fonts and images. Versions are checksummed (SHA-256) across all content fields to detect tampering. Versions can have an effective date range to support time-scoped template applicability.

### Columns

| Column             | Type          | Nullable | Default             | Description                                               |
| ------------------ | ------------- | -------- | ------------------- | --------------------------------------------------------- |
| `id`               | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                              |
| `tenant_id`        | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                  |
| `template_id`      | `uuid`        | NOT NULL | --                  | FK to `doc.template(id)`. Parent template.                |
| `version`          | `int`         | NOT NULL | --                  | Monotonically increasing version number per template.     |
| `content_html`     | `text`        | NULL     | --                  | HTML body template content.                               |
| `content_json`     | `jsonb`       | NULL     | --                  | Structured blocks (alternative to HTML).                  |
| `header_html`      | `text`        | NULL     | --                  | Page header template.                                     |
| `footer_html`      | `text`        | NULL     | --                  | Page footer template.                                     |
| `styles_css`       | `text`        | NULL     | --                  | Scoped CSS styles.                                        |
| `variables_schema` | `jsonb`       | NULL     | --                  | Zod-compatible schema defining expected input variables.  |
| `assets_manifest`  | `jsonb`       | NULL     | --                  | Map of asset keys to checksums for fonts/images.          |
| `checksum`         | `text`        | NOT NULL | --                  | SHA-256 of all content fields for integrity verification. |
| `published_at`     | `timestamptz` | NULL     | --                  | When this version was published.                          |
| `published_by`     | `text`        | NULL     | --                  | Who published this version.                               |
| `effective_from`   | `timestamptz` | NULL     | --                  | Start of effective date range.                            |
| `effective_to`     | `timestamptz` | NULL     | --                  | End of effective date range.                              |
| `created_at`       | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                                   |
| `created_by`       | `text`        | NOT NULL | --                  | Identity of the creator.                                  |

### Primary Key

- `id`

### Foreign Keys

| Column        | References         | On Delete |
| ------------- | ------------------ | --------- |
| `tenant_id`   | `core.tenant(id)`  | CASCADE   |
| `template_id` | `doc.template(id)` | CASCADE   |

### Indexes

| Name                           | Columns                  | Notes                                |
| ------------------------------ | ------------------------ | ------------------------------------ |
| `idx_template_version_tpl_ver` | `(template_id, version)` | UNIQUE. Version number per template. |
| `idx_template_version_tenant`  | `(tenant_id)`            | Tenant-scoped queries.               |

### Relationships

- **Belongs to** `doc.template` via `template_id`.
- **Referenced by** `doc.template.current_version_id` -- Active version pointer.
- **Referenced by** `doc.render_output.template_version_id` -- Rendered documents track which version was used.

---

## doc.template_binding

Maps templates to entity+operation+variant combinations for automatic template resolution. When the system needs to generate a document for a specific entity and operation (e.g., printing an invoice), it queries this table to find the appropriate template. The `variant` column allows multiple templates for the same entity+operation (e.g., "customer_copy" vs "tax_copy"). Priority controls resolution order when multiple bindings match.

### Columns

| Column        | Type          | Nullable | Default             | Description                                           |
| ------------- | ------------- | -------- | ------------------- | ----------------------------------------------------- |
| `id`          | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                          |
| `tenant_id`   | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                              |
| `template_id` | `uuid`        | NOT NULL | --                  | FK to `doc.template(id)`. Bound template.             |
| `entity_name` | `text`        | NOT NULL | --                  | Entity type name (e.g., "invoice", "purchase_order"). |
| `operation`   | `text`        | NOT NULL | --                  | Operation type (e.g., "print", "email", "submit").    |
| `variant`     | `text`        | NOT NULL | `'default'`         | Variant name for multi-copy scenarios.                |
| `priority`    | `int`         | NOT NULL | `0`                 | Resolution priority (higher = preferred).             |
| `active`      | `boolean`     | NOT NULL | `true`              | Whether this binding is active.                       |
| `created_at`  | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                               |
| `created_by`  | `text`        | NOT NULL | --                  | Identity of the creator.                              |

### Primary Key

- `id`

### Foreign Keys

| Column        | References         | On Delete |
| ------------- | ------------------ | --------- |
| `tenant_id`   | `core.tenant(id)`  | CASCADE   |
| `template_id` | `doc.template(id)` | CASCADE   |

### Indexes

| Name                            | Columns                                        | Notes                                                        |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| `idx_template_binding_unique`   | `(tenant_id, entity_name, operation, variant)` | UNIQUE. One binding per entity+operation+variant per tenant. |
| `idx_template_binding_template` | `(template_id)`                                | Reverse lookup: which bindings use this template.            |

### Relationships

- **Belongs to** `doc.template` via `template_id`.

---

## doc.letterhead

Tenant or organizational unit-scoped letterhead definitions for branded document rendering. Each letterhead includes a logo reference (MinIO storage key), header and footer HTML templates, optional watermark text with configurable opacity, default font configuration, and page margin settings. A unique partial index enforces that at most one letterhead per tenant can be marked as the default.

### Columns

| Column              | Type           | Nullable | Default             | Description                                                                      |
| ------------------- | -------------- | -------- | ------------------- | -------------------------------------------------------------------------------- |
| `id`                | `uuid`         | NOT NULL | `gen_random_uuid()` | Primary key.                                                                     |
| `tenant_id`         | `uuid`         | NOT NULL | --                  | FK to `core.tenant(id)`.                                                         |
| `code`              | `text`         | NOT NULL | --                  | Unique letterhead code within tenant.                                            |
| `name`              | `text`         | NOT NULL | --                  | Human-readable name.                                                             |
| `org_unit_id`       | `uuid`         | NULL     | --                  | Optional: scope to a specific organizational unit.                               |
| `logo_storage_key`  | `text`         | NULL     | --                  | MinIO/S3 storage key for the logo image.                                         |
| `header_html`       | `text`         | NULL     | --                  | Header block HTML template.                                                      |
| `footer_html`       | `text`         | NULL     | --                  | Footer block HTML template.                                                      |
| `watermark_text`    | `text`         | NULL     | --                  | Watermark text (e.g., "DRAFT", "CONFIDENTIAL").                                  |
| `watermark_opacity` | `numeric(3,2)` | NULL     | `0.15`              | Watermark opacity (0.00 to 1.00).                                                |
| `default_fonts`     | `jsonb`        | NULL     | --                  | Font configuration (e.g., `{"heading": "Arial", "body": "Times"}`).              |
| `page_margins`      | `jsonb`        | NULL     | --                  | Page margins in mm (e.g., `{"top": 25, "right": 20, "bottom": 25, "left": 20}`). |
| `is_default`        | `boolean`      | NOT NULL | `false`             | Whether this is the tenant's default letterhead.                                 |
| `metadata`          | `jsonb`        | NULL     | --                  | Arbitrary metadata.                                                              |
| `created_at`        | `timestamptz`  | NOT NULL | `now()`             | Row creation timestamp.                                                          |
| `created_by`        | `text`         | NOT NULL | --                  | Identity of the creator.                                                         |
| `updated_at`        | `timestamptz`  | NULL     | --                  | Last modification timestamp.                                                     |
| `updated_by`        | `text`         | NULL     | --                  | Identity of last modifier.                                                       |

### Primary Key

- `id`

### Foreign Keys

| Column      | References        | On Delete |
| ----------- | ----------------- | --------- |
| `tenant_id` | `core.tenant(id)` | CASCADE   |

### Indexes

| Name                            | Columns             | Notes                                                                          |
| ------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `idx_letterhead_tenant_code`    | `(tenant_id, code)` | UNIQUE. Code lookup within tenant.                                             |
| `idx_letterhead_tenant_default` | `(tenant_id)`       | UNIQUE partial: `WHERE is_default = true`. Enforces single default per tenant. |

### Relationships

- **Referenced by** `doc.render_output.letterhead_id` -- Rendered documents track which letterhead was used.

---

## doc.brand_profile

Brand profile defining the visual identity for document rendering per tenant. Includes palette colors, typography settings, spacing scale, text direction (LTR/RTL), default locale, and supported locales. Like letterhead, a unique partial index enforces a single default brand profile per tenant. Brand profiles are applied during document rendering to ensure consistent visual identity across all generated documents.

### Columns

| Column              | Type          | Nullable | Default             | Description                                                                              |
| ------------------- | ------------- | -------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `id`                | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                                             |
| `tenant_id`         | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                                                 |
| `code`              | `text`        | NOT NULL | --                  | Unique brand profile code within tenant.                                                 |
| `name`              | `text`        | NOT NULL | --                  | Human-readable name.                                                                     |
| `palette`           | `jsonb`       | NULL     | --                  | Color palette (e.g., `{"primary": "#1A73E8", "secondary": "#...", "accent": "#..."}`).   |
| `typography`        | `jsonb`       | NULL     | --                  | Typography settings (e.g., `{"headingFont": "...", "bodyFont": "...", "sizes": {...}}`). |
| `spacing_scale`     | `jsonb`       | NULL     | --                  | Spacing scale (e.g., `{"xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32}`).                |
| `direction`         | `text`        | NOT NULL | `'LTR'`             | Text direction. Constrained to: `LTR`, `RTL`.                                            |
| `default_locale`    | `text`        | NOT NULL | `'en'`              | Default locale for rendering.                                                            |
| `supported_locales` | `text[]`      | NULL     | --                  | Array of supported locale codes.                                                         |
| `is_default`        | `boolean`     | NOT NULL | `false`             | Whether this is the tenant's default brand profile.                                      |
| `metadata`          | `jsonb`       | NULL     | --                  | Arbitrary metadata.                                                                      |
| `created_at`        | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                                                                  |
| `created_by`        | `text`        | NOT NULL | --                  | Identity of the creator.                                                                 |
| `updated_at`        | `timestamptz` | NULL     | --                  | Last modification timestamp.                                                             |
| `updated_by`        | `text`        | NULL     | --                  | Identity of last modifier.                                                               |

### Primary Key

- `id`

### Foreign Keys

| Column      | References        | On Delete |
| ----------- | ----------------- | --------- |
| `tenant_id` | `core.tenant(id)` | CASCADE   |

### Constraints

| Name     | Type  | Details                      |
| -------- | ----- | ---------------------------- |
| (inline) | CHECK | `direction IN ('LTR','RTL')` |

### Indexes

| Name                               | Columns             | Notes                                                                          |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `idx_brand_profile_tenant_code`    | `(tenant_id, code)` | UNIQUE. Code lookup within tenant.                                             |
| `idx_brand_profile_tenant_default` | `(tenant_id)`       | UNIQUE partial: `WHERE is_default = true`. Enforces single default per tenant. |

### Relationships

- **Referenced by** `doc.render_output.brand_profile_id` -- Rendered documents track which brand profile was used.

---

## doc.render_output

Immutable rendered document outputs. Each row represents a document that has been (or is being) rendered from a template, letterhead, and brand profile combination for a specific entity, operation, variant, locale, and timezone. Outputs progress through a lifecycle: QUEUED, RENDERING, RENDERED, DELIVERED, FAILED, ARCHIVED, REVOKED. The `manifest_json` captures the complete render contract (all inputs) for reproducibility. Outputs support revision chains via `replaces_output_id`. An idempotency index prevents duplicate in-flight renders for the same input combination.

### Columns

| Column                | Type          | Nullable | Default             | Description                                                                                                        |
| --------------------- | ------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`                  | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                                                                       |
| `tenant_id`           | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                                                                           |
| `template_version_id` | `uuid`        | NULL     | --                  | FK to `doc.template_version(id)`. Template version used.                                                           |
| `letterhead_id`       | `uuid`        | NULL     | --                  | FK to `doc.letterhead(id)`. Letterhead applied.                                                                    |
| `brand_profile_id`    | `uuid`        | NULL     | --                  | FK to `doc.brand_profile(id)`. Brand profile applied.                                                              |
| `entity_name`         | `text`        | NOT NULL | --                  | Entity type name.                                                                                                  |
| `entity_id`           | `text`        | NOT NULL | --                  | Entity instance ID.                                                                                                |
| `operation`           | `text`        | NOT NULL | --                  | Operation (e.g., "print", "email").                                                                                |
| `variant`             | `text`        | NOT NULL | `'default'`         | Variant name.                                                                                                      |
| `locale`              | `text`        | NOT NULL | `'en'`              | Rendering locale.                                                                                                  |
| `timezone`            | `text`        | NOT NULL | `'UTC'`             | Rendering timezone.                                                                                                |
| `status`              | `text`        | NOT NULL | `'QUEUED'`          | Lifecycle status. Constrained to: `QUEUED`, `RENDERING`, `RENDERED`, `DELIVERED`, `FAILED`, `ARCHIVED`, `REVOKED`. |
| `storage_key`         | `text`        | NULL     | --                  | MinIO/S3 path to the rendered output file.                                                                         |
| `mime_type`           | `text`        | NULL     | `'application/pdf'` | MIME type of the rendered output.                                                                                  |
| `size_bytes`          | `bigint`      | NULL     | --                  | Rendered file size in bytes.                                                                                       |
| `checksum`            | `text`        | NULL     | --                  | SHA-256 of the rendered output for integrity verification.                                                         |
| `manifest_json`       | `jsonb`       | NOT NULL | --                  | Complete render contract: all inputs for reproducibility.                                                          |
| `input_payload_hash`  | `text`        | NULL     | --                  | SHA-256 of the input data for idempotency checks.                                                                  |
| `replaces_output_id`  | `uuid`        | NULL     | --                  | Self-referencing FK. Points to the output this revision replaces.                                                  |
| `error_message`       | `text`        | NULL     | --                  | Error message if rendering failed.                                                                                 |
| `rendered_at`         | `timestamptz` | NULL     | --                  | When rendering completed.                                                                                          |
| `delivered_at`        | `timestamptz` | NULL     | --                  | When the output was delivered.                                                                                     |
| `archived_at`         | `timestamptz` | NULL     | --                  | When the output was archived.                                                                                      |
| `revoked_at`          | `timestamptz` | NULL     | --                  | When the output was revoked.                                                                                       |
| `revoked_by`          | `text`        | NULL     | --                  | Who revoked the output.                                                                                            |
| `revoke_reason`       | `text`        | NULL     | --                  | Reason for revocation.                                                                                             |
| `created_at`          | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                                                                                            |
| `created_by`          | `text`        | NOT NULL | --                  | Identity of the creator.                                                                                           |
| `storage_bucket`      | `text`        | NULL     | --                  | Object storage bucket (added via ALTER).                                                                           |
| `storage_version_id`  | `text`        | NULL     | --                  | Object storage version ID for versioned buckets (added via ALTER).                                                 |
| `manifest_version`    | `int`         | NOT NULL | `1`                 | Manifest schema version for forward compatibility (added via ALTER).                                               |
| `error_code`          | `text`        | NULL     | --                  | Machine-readable error code (added via ALTER).                                                                     |

### Primary Key

- `id`

### Foreign Keys

| Column                | References                 | On Delete                                |
| --------------------- | -------------------------- | ---------------------------------------- |
| `tenant_id`           | `core.tenant(id)`          | CASCADE                                  |
| `template_version_id` | `doc.template_version(id)` | (no cascade specified)                   |
| `letterhead_id`       | `doc.letterhead(id)`       | (no cascade specified)                   |
| `brand_profile_id`    | `doc.brand_profile(id)`    | (no cascade specified)                   |
| `replaces_output_id`  | `doc.render_output(id)`    | (self-referencing, no cascade specified) |

### Constraints

| Name     | Type  | Details                                                                                 |
| -------- | ----- | --------------------------------------------------------------------------------------- |
| (inline) | CHECK | `status IN ('QUEUED','RENDERING','RENDERED','DELIVERED','FAILED','ARCHIVED','REVOKED')` |

### Indexes

| Name                                     | Columns                                                                                            | Notes                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `idx_render_output_entity`               | `(tenant_id, entity_name, entity_id)`                                                              | Outputs for an entity.                                                                          |
| `idx_render_output_status`               | `(tenant_id, status)`                                                                              | Filter by lifecycle status.                                                                     |
| `idx_render_output_template_version`     | `(template_version_id)`                                                                            | Outputs using a specific template version.                                                      |
| `idx_render_output_replaces`             | `(replaces_output_id)`                                                                             | Partial: `WHERE replaces_output_id IS NOT NULL`. Revision chain lookup.                         |
| `idx_render_output_inflight_idempotency` | `(tenant_id, template_version_id, entity_name, entity_id, operation, variant, input_payload_hash)` | UNIQUE partial: `WHERE status IN ('QUEUED','RENDERING')`. Prevents duplicate in-flight renders. |

### Relationships

- **Belongs to** `doc.template_version` via `template_version_id`.
- **Belongs to** `doc.letterhead` via `letterhead_id`.
- **Belongs to** `doc.brand_profile` via `brand_profile_id`.
- **Has many** `doc.render_output` (self-referencing revision chain via `replaces_output_id`).
- **Has many** `doc.render_job` -- Queue processing jobs.
- **Has many** `doc.render_dlq` -- Dead-letter entries for failed renders.

---

## doc.render_job

Render job queue tracking table that correlates with BullMQ jobs for observability. Each job is linked to a `render_output` and tracks the BullMQ job ID, processing status, attempt count, error details, and OpenTelemetry trace ID. This provides a durable database record of render job execution alongside the ephemeral BullMQ queue state, enabling monitoring dashboards, retry analysis, and SLA tracking.

### Columns

| Column         | Type          | Nullable | Default             | Description                                                                             |
| -------------- | ------------- | -------- | ------------------- | --------------------------------------------------------------------------------------- |
| `id`           | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                                            |
| `output_id`    | `uuid`        | NOT NULL | --                  | FK to `doc.render_output(id)`. The render output this job produces.                     |
| `tenant_id`    | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                                                |
| `job_queue_id` | `text`        | NULL     | --                  | BullMQ job ID for correlation.                                                          |
| `status`       | `text`        | NOT NULL | `'PENDING'`         | Job status. Constrained to: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `RETRYING`. |
| `attempts`     | `int`         | NOT NULL | `0`                 | Number of processing attempts so far.                                                   |
| `max_attempts` | `int`         | NOT NULL | `3`                 | Maximum allowed attempts before DLQ.                                                    |
| `error_code`   | `text`        | NULL     | --                  | Machine-readable error code.                                                            |
| `error_detail` | `text`        | NULL     | --                  | Human-readable error description.                                                       |
| `trace_id`     | `text`        | NULL     | --                  | OpenTelemetry trace ID for distributed tracing.                                         |
| `started_at`   | `timestamptz` | NULL     | --                  | When processing started.                                                                |
| `completed_at` | `timestamptz` | NULL     | --                  | When processing completed.                                                              |
| `duration_ms`  | `int`         | NULL     | --                  | Processing duration in milliseconds.                                                    |
| `created_at`   | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                                                                 |

### Primary Key

- `id`

### Foreign Keys

| Column      | References              | On Delete |
| ----------- | ----------------------- | --------- |
| `output_id` | `doc.render_output(id)` | CASCADE   |
| `tenant_id` | `core.tenant(id)`       | CASCADE   |

### Constraints

| Name     | Type  | Details                                                              |
| -------- | ----- | -------------------------------------------------------------------- |
| (inline) | CHECK | `status IN ('PENDING','PROCESSING','COMPLETED','FAILED','RETRYING')` |

### Indexes

| Name                    | Columns               | Notes                      |
| ----------------------- | --------------------- | -------------------------- |
| `idx_render_job_output` | `(output_id)`         | Jobs for a render output.  |
| `idx_render_job_status` | `(tenant_id, status)` | Dashboard: jobs by status. |

### Relationships

- **Belongs to** `doc.render_output` via `output_id`.
- **Referenced by** `doc.render_dlq` via `render_job_id`.

---

## doc.render_dlq

Dead-letter queue for permanently failed document render jobs. When a render job exhausts its retry attempts and still fails, it is moved to this DLQ for manual investigation and replay. Each entry captures the error classification (`error_category`: transient, permanent, timeout, crash), the full job payload for replay, and replay tracking fields. An index on unreplayed entries supports operator dashboards for monitoring DLQ backlog.

### Columns

| Column           | Type          | Nullable | Default             | Description                                                                         |
| ---------------- | ------------- | -------- | ------------------- | ----------------------------------------------------------------------------------- |
| `id`             | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                                        |
| `tenant_id`      | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                                            |
| `output_id`      | `uuid`        | NOT NULL | --                  | FK to `doc.render_output(id)`. The failed render output.                            |
| `render_job_id`  | `uuid`        | NULL     | --                  | FK to `doc.render_job(id)`. The failed job (if available).                          |
| `error_code`     | `text`        | NOT NULL | --                  | Machine-readable error code.                                                        |
| `error_detail`   | `text`        | NULL     | --                  | Human-readable error description.                                                   |
| `error_category` | `text`        | NOT NULL | --                  | Error classification. Constrained to: `transient`, `permanent`, `timeout`, `crash`. |
| `attempt_count`  | `int`         | NOT NULL | `0`                 | Total number of attempts before DLQ.                                                |
| `payload`        | `jsonb`       | NOT NULL | --                  | Full job payload for replay.                                                        |
| `replayed_at`    | `timestamptz` | NULL     | --                  | When this DLQ entry was replayed (null = not yet replayed).                         |
| `replayed_by`    | `text`        | NULL     | --                  | Who triggered the replay.                                                           |
| `replay_count`   | `int`         | NOT NULL | `0`                 | Number of times this entry has been replayed.                                       |
| `dead_at`        | `timestamptz` | NOT NULL | `now()`             | When the job entered the DLQ.                                                       |
| `created_at`     | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                                                             |

### Primary Key

- `id`

### Foreign Keys

| Column          | References              | On Delete              |
| --------------- | ----------------------- | ---------------------- |
| `tenant_id`     | `core.tenant(id)`       | CASCADE                |
| `output_id`     | `doc.render_output(id)` | (no cascade specified) |
| `render_job_id` | `doc.render_job(id)`    | (no cascade specified) |

### Constraints

| Name     | Type  | Details                                                         |
| -------- | ----- | --------------------------------------------------------------- |
| (inline) | CHECK | `error_category IN ('transient','permanent','timeout','crash')` |

### Indexes

| Name                        | Columns       | Notes                                                         |
| --------------------------- | ------------- | ------------------------------------------------------------- |
| `idx_render_dlq_unreplayed` | `(tenant_id)` | Partial: `WHERE replayed_at IS NULL`. DLQ backlog monitoring. |
| `idx_render_dlq_output`     | `(output_id)` | DLQ entries for a render output.                              |

### Relationships

- **Belongs to** `doc.render_output` via `output_id`.
- **Optionally belongs to** `doc.render_job` via `render_job_id`.

---

## doc.entity_document_link

Many-to-many link table between arbitrary entities and document attachments. Each link has a `link_kind` classification (primary, related, supporting, compliance, audit) and a `display_order` for UI sorting. This enables entities like invoices, purchase orders, or contracts to reference multiple attachments with categorization, while attachments can be shared across multiple entities. A unique composite index prevents duplicate links.

### Columns

| Column          | Type             | Nullable | Default             | Description                                                                                     |
| --------------- | ---------------- | -------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `id`            | `uuid`           | NOT NULL | `gen_random_uuid()` | Primary key.                                                                                    |
| `tenant_id`     | `uuid`           | NOT NULL | --                  | FK to `core.tenant(id)`.                                                                        |
| `entity_type`   | `text`           | NOT NULL | --                  | Type of the linked entity.                                                                      |
| `entity_id`     | `uuid`           | NOT NULL | --                  | ID of the linked entity.                                                                        |
| `attachment_id` | `uuid`           | NOT NULL | --                  | FK to `doc.attachment(id)`. The linked attachment.                                              |
| `link_kind`     | `text`           | NOT NULL | `'related'`         | Link classification. Constrained to: `primary`, `related`, `supporting`, `compliance`, `audit`. |
| `display_order` | `integer`        | NOT NULL | `0`                 | Display order for UI rendering.                                                                 |
| `metadata`      | `jsonb`          | NULL     | --                  | Arbitrary link metadata.                                                                        |
| `created_at`    | `timestamptz(6)` | NOT NULL | `now()`             | Row creation timestamp.                                                                         |
| `created_by`    | `text`           | NOT NULL | --                  | Identity of the creator.                                                                        |

### Primary Key

- `id`

### Foreign Keys

| Column          | References           | On Delete |
| --------------- | -------------------- | --------- |
| `tenant_id`     | `core.tenant(id)`    | CASCADE   |
| `attachment_id` | `doc.attachment(id)` | CASCADE   |

### Constraints

| Name                              | Type  | Details                                                                    |
| --------------------------------- | ----- | -------------------------------------------------------------------------- |
| `entity_document_link_kind_check` | CHECK | `link_kind IN ('primary', 'related', 'supporting', 'compliance', 'audit')` |

### Indexes

| Name                                          | Columns                                              | Notes                                                     |
| --------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| `entity_document_link_entity_attachment_uniq` | `(tenant_id, entity_type, entity_id, attachment_id)` | UNIQUE. Prevents duplicate entity-attachment links.       |
| `idx_entity_document_link_entity`             | `(tenant_id, entity_type, entity_id, link_kind)`     | Entity document listing with kind filter.                 |
| `idx_entity_document_link_attachment`         | `(attachment_id)`                                    | Reverse lookup: which entities reference this attachment. |

### Relationships

- **Belongs to** `doc.attachment` via `attachment_id`.

---

## doc.document_acl

Optional per-document access control list that supplements the platform-level PolicyGateService. Each ACL entry grants or denies a specific permission (read, download, delete, share) to either a principal or a role (but not both). ACL entries can have an expiration date for time-limited access grants. This provides fine-grained, document-level access control beyond what entity-level policies offer.

### Columns

| Column          | Type             | Nullable | Default             | Description                                                                   |
| --------------- | ---------------- | -------- | ------------------- | ----------------------------------------------------------------------------- |
| `id`            | `uuid`           | NOT NULL | `gen_random_uuid()` | Primary key.                                                                  |
| `tenant_id`     | `uuid`           | NOT NULL | --                  | FK to `core.tenant(id)`.                                                      |
| `attachment_id` | `uuid`           | NOT NULL | --                  | FK to `doc.attachment(id)`. The controlled attachment.                        |
| `principal_id`  | `uuid`           | NULL     | --                  | The principal being granted/denied access. Mutually exclusive with `role_id`. |
| `role_id`       | `uuid`           | NULL     | --                  | The role being granted/denied access. Mutually exclusive with `principal_id`. |
| `permission`    | `text`           | NOT NULL | --                  | Permission type. Constrained to: `read`, `download`, `delete`, `share`.       |
| `granted`       | `boolean`        | NOT NULL | `true`              | Whether the permission is granted (true) or denied (false).                   |
| `granted_by`    | `text`           | NOT NULL | --                  | Who granted this ACL entry.                                                   |
| `granted_at`    | `timestamptz(6)` | NOT NULL | `now()`             | When the ACL entry was created.                                               |
| `expires_at`    | `timestamptz(6)` | NULL     | --                  | Optional expiration for time-limited access.                                  |

### Primary Key

- `id`

### Foreign Keys

| Column          | References           | On Delete |
| --------------- | -------------------- | --------- |
| `tenant_id`     | `core.tenant(id)`    | CASCADE   |
| `attachment_id` | `doc.attachment(id)` | CASCADE   |

### Constraints

| Name                                   | Type  | Details                                                                                                                                             |
| -------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document_acl_permission_check`        | CHECK | `permission IN ('read', 'download', 'delete', 'share')`                                                                                             |
| `document_acl_principal_or_role_check` | CHECK | `(principal_id IS NOT NULL AND role_id IS NULL) OR (principal_id IS NULL AND role_id IS NOT NULL)` -- Exactly one of principal or role must be set. |

### Indexes

| Name                          | Columns                       | Notes                         |
| ----------------------------- | ----------------------------- | ----------------------------- |
| `idx_document_acl_attachment` | `(attachment_id, permission)` | ACL lookup for an attachment. |

### Relationships

- **Belongs to** `doc.attachment` via `attachment_id`.

---

## doc.attachment_access_log

High-volume audit trail for file access events. Every download, preview, or metadata access of an attachment is recorded with the actor identity, IP address, and user agent. This table uses a `bigserial` primary key (instead of UUID) for write performance at high volumes. The table comment recommends partitioning by month and implementing a retention policy of 30-90 days for production deployments.

### Columns

| Column          | Type             | Nullable | Default        | Description                                                       |
| --------------- | ---------------- | -------- | -------------- | ----------------------------------------------------------------- |
| `id`            | `bigserial`      | NOT NULL | auto-increment | Primary key (sequential for write performance).                   |
| `tenant_id`     | `uuid`           | NOT NULL | --             | FK to `core.tenant(id)`.                                          |
| `attachment_id` | `uuid`           | NOT NULL | --             | ID of the accessed attachment (not a FK for decoupling).          |
| `actor_id`      | `text`           | NOT NULL | --             | Identity of the accessor.                                         |
| `action`        | `text`           | NOT NULL | --             | Access action. Constrained to: `download`, `preview`, `metadata`. |
| `ip_address`    | `text`           | NULL     | --             | Client IP address.                                                |
| `user_agent`    | `text`           | NULL     | --             | Client user agent string.                                         |
| `accessed_at`   | `timestamptz(6)` | NOT NULL | `now()`        | When the access occurred.                                         |

### Primary Key

- `id`

### Foreign Keys

| Column      | References        | On Delete |
| ----------- | ----------------- | --------- |
| `tenant_id` | `core.tenant(id)` | CASCADE   |

### Constraints

| Name     | Type  | Details                                         |
| -------- | ----- | ----------------------------------------------- |
| (inline) | CHECK | `action IN ('download', 'preview', 'metadata')` |

### Indexes

| Name                         | Columns                                   | Notes                               |
| ---------------------------- | ----------------------------------------- | ----------------------------------- |
| `idx_access_log_tenant_time` | `(tenant_id, accessed_at DESC)`           | Tenant activity feed, newest first. |
| `idx_access_log_attachment`  | `(attachment_id, accessed_at DESC)`       | Access history for an attachment.   |
| `idx_access_log_actor`       | `(tenant_id, actor_id, accessed_at DESC)` | Access history for a user.          |

### Relationships

- **Logically references** `doc.attachment` via `attachment_id` (no FK constraint for performance at high volume).

---

## doc.attachment_comment

Comments and annotations for attachments with support for threaded replies and user mentions. Comments are soft-deletable (via `deleted_at`/`deleted_by`) and editable (via `edited_at`/`edited_by`). The `mentions` JSONB column stores structured mention data for notification dispatch. A self-referencing `parent_id` enables threaded reply chains. All query indexes exclude soft-deleted comments.

### Columns

| Column          | Type             | Nullable | Default             | Description                                                       |
| --------------- | ---------------- | -------- | ------------------- | ----------------------------------------------------------------- |
| `id`            | `uuid`           | NOT NULL | `gen_random_uuid()` | Primary key.                                                      |
| `tenant_id`     | `uuid`           | NOT NULL | --                  | FK to `core.tenant(id)`.                                          |
| `attachment_id` | `uuid`           | NOT NULL | --                  | FK to `doc.attachment(id)`. The commented attachment.             |
| `parent_id`     | `uuid`           | NULL     | --                  | Self-referencing FK. Parent comment for threading.                |
| `author_id`     | `text`           | NOT NULL | --                  | Identity of the comment author.                                   |
| `content`       | `text`           | NOT NULL | --                  | Comment body text.                                                |
| `mentions`      | `jsonb`          | NULL     | --                  | Structured mention data (e.g., `[{"id": "...", "name": "..."}]`). |
| `edited_at`     | `timestamptz(6)` | NULL     | --                  | When the comment was last edited.                                 |
| `edited_by`     | `text`           | NULL     | --                  | Who last edited the comment.                                      |
| `deleted_at`    | `timestamptz(6)` | NULL     | --                  | Soft-delete timestamp (null = active).                            |
| `deleted_by`    | `text`           | NULL     | --                  | Who soft-deleted the comment.                                     |
| `created_at`    | `timestamptz(6)` | NOT NULL | `now()`             | Comment creation timestamp.                                       |
| `updated_at`    | `timestamptz(6)` | NOT NULL | `now()`             | Last update timestamp.                                            |

### Primary Key

- `id`

### Foreign Keys

| Column          | References                   | On Delete                  |
| --------------- | ---------------------------- | -------------------------- |
| `tenant_id`     | `core.tenant(id)`            | CASCADE                    |
| `attachment_id` | `doc.attachment(id)`         | CASCADE                    |
| `parent_id`     | `doc.attachment_comment(id)` | CASCADE (self-referencing) |

### Indexes

| Name                     | Columns                                       | Notes                                                                                |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `idx_comment_attachment` | `(tenant_id, attachment_id, created_at DESC)` | Partial: `WHERE deleted_at IS NULL`. Comment thread for an attachment.               |
| `idx_comment_parent`     | `(parent_id, created_at)`                     | Partial: `WHERE parent_id IS NOT NULL AND deleted_at IS NULL`. Replies to a comment. |
| `idx_comment_author`     | `(tenant_id, author_id, created_at DESC)`     | Partial: `WHERE deleted_at IS NULL`. A user's comment history.                       |
| `idx_comment_mentions`   | `(mentions)` using GIN                        | Partial: `WHERE mentions IS NOT NULL`. Mention-based notification queries.           |

### Relationships

- **Belongs to** `doc.attachment` via `attachment_id`.
- **Has many** `doc.attachment_comment` (self-referencing thread via `parent_id`).

---

## doc.multipart_upload

Tracks S3-compatible multipart uploads for large files (typically over 100 MB). When a large file upload is initiated, a row is created with the S3 upload ID, expected part count, and expiration time. As parts are uploaded, `completed_parts` is incremented and part ETags are accumulated in `part_etags`. A cleanup job aborts uploads that exceed their `expires_at` deadline. The `s3_upload_id` has a unique constraint for idempotent lookups.

### Columns

| Column            | Type             | Nullable | Default             | Description                                                                                |
| ----------------- | ---------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------ |
| `id`              | `uuid`           | NOT NULL | `gen_random_uuid()` | Primary key.                                                                               |
| `tenant_id`       | `uuid`           | NOT NULL | --                  | FK to `core.tenant(id)`.                                                                   |
| `attachment_id`   | `uuid`           | NOT NULL | --                  | FK to `doc.attachment(id)`. The attachment being uploaded.                                 |
| `s3_upload_id`    | `text`           | NOT NULL | --                  | S3 multipart upload ID. Unique.                                                            |
| `total_parts`     | `integer`        | NOT NULL | --                  | Expected total number of upload parts.                                                     |
| `completed_parts` | `integer`        | NULL     | `0`                 | Number of parts uploaded so far.                                                           |
| `part_etags`      | `jsonb`          | NULL     | --                  | Map of part numbers to ETags for S3 completion.                                            |
| `status`          | `text`           | NOT NULL | --                  | Upload status. Constrained to: `initiated`, `uploading`, `completed`, `aborted`, `failed`. |
| `initiated_at`    | `timestamptz(6)` | NOT NULL | `now()`             | When the multipart upload was initiated.                                                   |
| `completed_at`    | `timestamptz(6)` | NULL     | --                  | When the upload completed.                                                                 |
| `expires_at`      | `timestamptz(6)` | NOT NULL | --                  | Expiration deadline for the upload. Cleanup job aborts expired uploads.                    |

### Primary Key

- `id`

### Foreign Keys

| Column          | References           | On Delete |
| --------------- | -------------------- | --------- |
| `tenant_id`     | `core.tenant(id)`    | CASCADE   |
| `attachment_id` | `doc.attachment(id)` | CASCADE   |

### Constraints

| Name     | Type   | Details                                                                  |
| -------- | ------ | ------------------------------------------------------------------------ |
| (inline) | CHECK  | `status IN ('initiated', 'uploading', 'completed', 'aborted', 'failed')` |
| (inline) | UNIQUE | `(s3_upload_id)` -- Idempotent upload ID lookup.                         |

### Indexes

| Name                       | Columns                           | Notes                                                                                                   |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `idx_multipart_attachment` | `(attachment_id)`                 | Uploads for an attachment.                                                                              |
| `idx_multipart_status`     | `(tenant_id, status, expires_at)` | Partial: `WHERE status IN ('initiated', 'uploading')`. Active upload monitoring and expiration cleanup. |

### Relationships

- **Belongs to** `doc.attachment` via `attachment_id`.

---

## Entity Relationship Diagram

```
                              core.tenant
                                  |
        +------------+------------+------------+------------+
        |            |            |            |            |
  doc.attachment  doc.document  doc.template  doc.letterhead  doc.brand_profile
        |                         |
        |--- (self-ref version chain)       |--- doc.template_version
        |                         |                   |
        |--- doc.entity_document_link       |--- doc.template_binding
        |
        |--- doc.document_acl
        |
        |--- doc.attachment_access_log (logical ref)
        |
        |--- doc.attachment_comment (threaded)
        |
        |--- doc.multipart_upload


                    doc.render_output
                    /       |       \
            template_   letterhead  brand_profile
            version_id    _id         _id
                |
        doc.render_job
                |
        doc.render_dlq
```

### Key Design Decisions

1. **Immutable outputs**: `render_output` records are append-only; revisions create new rows linked via `replaces_output_id`.
2. **Idempotency**: A unique partial index on `render_output` prevents duplicate in-flight renders for identical inputs.
3. **Content deduplication**: Attachments track SHA-256 checksums and reference counts for storage-level dedup.
4. **Version chains**: Attachments support a self-referencing `parent_attachment_id` chain for file versioning.
5. **Single-default enforcement**: Both `letterhead` and `brand_profile` use unique partial indexes to enforce exactly one default per tenant.
6. **High-volume audit**: `attachment_access_log` uses `bigserial` instead of UUID and recommends monthly partitioning.
7. **Soft deletes**: `attachment_comment` uses `deleted_at`/`deleted_by` with partial indexes that exclude deleted rows.
8. **Dead-letter queue**: `render_dlq` categorizes failures (transient/permanent/timeout/crash) and supports operator replay.
9. **Template governance**: Templates progress through DRAFT, PUBLISHED, RETIRED lifecycle with versioned content checksums.
10. **Tenant isolation**: Every table includes `tenant_id` with CASCADE delete from `core.tenant`.
