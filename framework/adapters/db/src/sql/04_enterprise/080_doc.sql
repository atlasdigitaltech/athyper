/* ============================================================================
   Athyper — DOC Schema
   Storage: Attachments, Documents
   Templates: Definitions, Versions, Bindings, Letterhead, Brand Profiles
   Rendering: Outputs, Render Jobs, Render DLQ

   PostgreSQL 16+
   ============================================================================ */

-- ============================================================================
-- DOC: Attachments
-- ============================================================================
create table if not exists doc.attachment (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,

  owner_entity    text,
  owner_entity_id text,
  file_name       text not null,
  content_type    text,
  size_bytes      bigint,
  storage_bucket  text not null,
  storage_key     text not null,

  is_virus_scanned boolean not null default false,
  retention_until  timestamptz,
  metadata         jsonb,

  created_at      timestamptz not null default now(),
  created_by      text not null,

  -- Content management
  kind               text not null default 'attachment',
  sha256             text,
  original_filename  text,
  uploaded_by        text,
  shard              integer,
  version_no         integer default 1,
  is_current         boolean default true,
  parent_attachment_id uuid,
  replaced_at        timestamptz(6),
  replaced_by        text,

  -- Content enhancements
  thumbnail_key         text,
  preview_key           text,
  preview_generated_at  timestamptz(6),
  preview_generation_failed boolean default false,
  expires_at            timestamptz(6),
  auto_delete_on_expiry boolean default false,
  reference_count       integer default 1
);

comment on table doc.attachment is 'Object storage-backed attachments (MinIO/S3).';

create index if not exists idx_attachment_owner
  on doc.attachment (tenant_id, owner_entity, owner_entity_id);

-- Self-referencing FK for version chain
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'attachment_parent_fkey'
  ) then
    alter table doc.attachment
      add constraint attachment_parent_fkey
        foreign key (parent_attachment_id)
        references doc.attachment(id)
        on delete set null on update no action;
  end if;
end $$;

-- Content kind taxonomy constraint
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attachment_kind_check'
  ) then
    alter table doc.attachment
      add constraint attachment_kind_check check (kind in (
        'attachment', 'generated', 'export', 'template', 'letterhead',
        'avatar', 'signature', 'certificate', 'invoice', 'receipt',
        'contract', 'report'
      ));
  end if;
end $$;

-- Content management indexes
create index if not exists idx_attachment_kind
  on doc.attachment(tenant_id, kind, created_at desc);

create index if not exists idx_attachment_parent
  on doc.attachment(parent_attachment_id)
  where parent_attachment_id is not null;

create index if not exists idx_attachment_sha256
  on doc.attachment(tenant_id, sha256)
  where sha256 is not null;

create index if not exists idx_attachment_current
  on doc.attachment(tenant_id, owner_entity, owner_entity_id, is_current)
  where is_current = true;

-- Content enhancement indexes
create index if not exists idx_attachment_preview_pending
  on doc.attachment(tenant_id, created_at)
  where preview_key is null and preview_generation_failed = false and content_type like 'image/%';

create index if not exists idx_attachment_expired
  on doc.attachment(tenant_id, expires_at)
  where expires_at is not null and is_current = true;

create index if not exists idx_attachment_reference_count
  on doc.attachment(sha256, reference_count)
  where sha256 is not null and reference_count > 0;

-- ============================================================================
-- ALTER: Extend doc.attachment with comment link
-- ============================================================================
alter table doc.attachment
  add column if not exists comment_type text,
  add column if not exists comment_id uuid;

-- Add constraint if it doesn't already exist
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attachment_comment_type_chk'
  ) then
    alter table doc.attachment
      add constraint attachment_comment_type_chk check
        (comment_type is null or comment_type in ('entity_comment','approval_comment'));
  end if;
end $$;

comment on column doc.attachment.comment_type is 'Optional: type of comment this attachment belongs to.';
comment on column doc.attachment.comment_id is 'Optional: ID of comment this attachment belongs to.';

create index if not exists idx_attachment_comment
  on doc.attachment (comment_type, comment_id)
  where comment_type is not null and comment_id is not null;

-- ============================================================================
-- DOC: Documents
-- ============================================================================
create table if not exists doc.document (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,

  code           text,
  title          text,
  tags           text[],
  metadata       jsonb,

  created_at     timestamptz not null default now(),
  created_by     text not null,
  updated_at     timestamptz,
  updated_by     text
);

comment on table doc.document is 'Logical document registry (metadata separate from blobs).';

create index if not exists idx_document_tenant_code
  on doc.document (tenant_id, code);

create index if not exists idx_document_tags
  on doc.document using gin (tags);

-- ============================================================================
-- A) Template System (versioned + governed)
-- ============================================================================

-- 1. template: versioned template definitions
create table if not exists doc.template (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id) on delete cascade,

    code                text not null,
    name                text not null,
    kind                text not null check (kind in ('LETTER','REPORT','CERTIFICATE','PACK','RECEIPT','STATEMENT')),
    engine              text not null default 'HANDLEBARS' check (engine in ('HANDLEBARS','MJML','REACT_PDF')),
    status              text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','RETIRED')),
    current_version_id  uuid,                                       -- FK added below (deferred)
    metadata            jsonb,

    created_at          timestamptz not null default now(),
    created_by          text not null,
    updated_at          timestamptz,
    updated_by          text
);

comment on table doc.template is 'Document template definitions — versioned, governed, tenant-scoped.';

create unique index if not exists idx_template_tenant_code
    on doc.template (tenant_id, code);

create index if not exists idx_template_tenant_status
    on doc.template (tenant_id, status);


-- 2. template_version: immutable version snapshots
create table if not exists doc.template_version (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id) on delete cascade,
    template_id         uuid not null references doc.template(id) on delete cascade,

    version             int not null,                                -- monotonic per template
    content_html        text,                                        -- HTML body template
    content_json        jsonb,                                       -- structured blocks (alternative)
    header_html         text,                                        -- page header template
    footer_html         text,                                        -- page footer template
    styles_css          text,                                        -- scoped CSS
    variables_schema    jsonb,                                       -- Zod-compatible schema for input validation
    assets_manifest     jsonb,                                       -- {key: checksum} for fonts/images
    checksum            text not null,                               -- SHA-256 of all content fields

    published_at        timestamptz,
    published_by        text,
    effective_from      timestamptz,
    effective_to        timestamptz,

    created_at          timestamptz not null default now(),
    created_by          text not null
);

comment on table doc.template_version is 'Immutable template version snapshots with content checksums.';

create unique index if not exists idx_template_version_tpl_ver
    on doc.template_version (template_id, version);

create index if not exists idx_template_version_tenant
    on doc.template_version (tenant_id);


-- Deferred FK: template.current_version_id -> template_version.id
do $$
begin
    if not exists (
        select 1 from information_schema.table_constraints
        where constraint_name = 'fk_template_current_version'
          and table_schema = 'doc'
          and table_name = 'template'
    ) then
        alter table doc.template
            add constraint fk_template_current_version
            foreign key (current_version_id) references doc.template_version(id);
    end if;
end $$;


-- 3. template_binding: maps templates to entity + operation
create table if not exists doc.template_binding (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id) on delete cascade,
    template_id         uuid not null references doc.template(id) on delete cascade,

    entity_name         text not null,                               -- e.g., "invoice", "purchase_order"
    operation           text not null,                               -- e.g., "print", "email", "submit"
    variant             text not null default 'default',             -- e.g., "customer_copy", "tax_copy"
    priority            int not null default 0,                      -- for resolution order
    active              boolean not null default true,

    created_at          timestamptz not null default now(),
    created_by          text not null
);

comment on table doc.template_binding is 'Binds templates to entity+operation+variant for automatic resolution.';

create unique index if not exists idx_template_binding_unique
    on doc.template_binding (tenant_id, entity_name, operation, variant);

create index if not exists idx_template_binding_template
    on doc.template_binding (template_id);

-- ============================================================================
-- B) Brand Layer (letterhead + brand profile)
-- ============================================================================

-- 4. letterhead: tenant/org-unit scoped brand layer
create table if not exists doc.letterhead (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id) on delete cascade,

    code                text not null,
    name                text not null,
    org_unit_id         uuid,                                        -- optional scope to org unit
    logo_storage_key    text,                                        -- MinIO key for logo image
    header_html         text,                                        -- header block template
    footer_html         text,                                        -- footer block template
    watermark_text      text,                                        -- e.g., "DRAFT", "CONFIDENTIAL"
    watermark_opacity   numeric(3,2) default 0.15,
    default_fonts       jsonb,                                       -- {heading: "...", body: "..."}
    page_margins        jsonb,                                       -- {top, right, bottom, left} in mm
    is_default          boolean not null default false,
    metadata            jsonb,

    created_at          timestamptz not null default now(),
    created_by          text not null,
    updated_at          timestamptz,
    updated_by          text
);

comment on table doc.letterhead is 'Tenant/org-unit scoped letterhead with logo, header/footer, watermark, and fonts.';

create unique index if not exists idx_letterhead_tenant_code
    on doc.letterhead (tenant_id, code);

-- Strict single-default enforcement (from 141_document_robustness.sql)
DROP INDEX IF EXISTS doc.idx_letterhead_tenant_default;
CREATE UNIQUE INDEX IF NOT EXISTS idx_letterhead_tenant_default
    ON doc.letterhead (tenant_id) WHERE is_default = true;


-- 5. brand_profile: typography + palette per tenant
create table if not exists doc.brand_profile (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id) on delete cascade,

    code                text not null,
    name                text not null,
    palette             jsonb,                                       -- {primary, secondary, accent, ...}
    typography          jsonb,                                       -- {headingFont, bodyFont, sizes, lineHeight}
    spacing_scale       jsonb,                                       -- {xs, sm, md, lg, xl} in px/rem
    direction           text not null default 'LTR' check (direction in ('LTR','RTL')),
    default_locale      text not null default 'en',
    supported_locales   text[],
    is_default          boolean not null default false,
    metadata            jsonb,

    created_at          timestamptz not null default now(),
    created_by          text not null,
    updated_at          timestamptz,
    updated_by          text
);

comment on table doc.brand_profile is 'Brand profile: palette, typography, spacing, RTL/LTR per tenant.';

create unique index if not exists idx_brand_profile_tenant_code
    on doc.brand_profile (tenant_id, code);

-- Strict single-default enforcement (from 141_document_robustness.sql)
DROP INDEX IF EXISTS doc.idx_brand_profile_tenant_default;
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_profile_tenant_default
    ON doc.brand_profile (tenant_id) WHERE is_default = true;

-- ============================================================================
-- C) Document Outputs (immutable + verifiable)
-- ============================================================================

-- 6. render_output: immutable rendered document records
create table if not exists doc.render_output (
    id                      uuid primary key default gen_random_uuid(),
    tenant_id               uuid not null references core.tenant(id) on delete cascade,
    template_version_id     uuid references doc.template_version(id),
    letterhead_id           uuid references doc.letterhead(id),
    brand_profile_id        uuid references doc.brand_profile(id),

    entity_name             text not null,
    entity_id               text not null,
    operation               text not null,
    variant                 text not null default 'default',
    locale                  text not null default 'en',
    timezone                text not null default 'UTC',

    status                  text not null default 'QUEUED'
                            check (status in ('QUEUED','RENDERING','RENDERED','DELIVERED','FAILED','ARCHIVED','REVOKED')),

    storage_key             text,                                    -- MinIO path to rendered file
    mime_type               text default 'application/pdf',
    size_bytes              bigint,
    checksum                text,                                    -- SHA-256 of rendered output
    manifest_json           jsonb not null,                          -- full render contract inputs
    input_payload_hash      text,                                    -- SHA-256 of the input data

    replaces_output_id      uuid references doc.render_output(id),     -- for revisions
    error_message           text,

    rendered_at             timestamptz,
    delivered_at            timestamptz,
    archived_at             timestamptz,
    revoked_at              timestamptz,
    revoked_by              text,
    revoke_reason           text,

    created_at              timestamptz not null default now(),
    created_by              text not null
);

comment on table doc.render_output is 'Immutable rendered document outputs with checksum, manifest, and full lifecycle.';

create index if not exists idx_render_output_entity
    on doc.render_output (tenant_id, entity_name, entity_id);

create index if not exists idx_render_output_status
    on doc.render_output (tenant_id, status);

create index if not exists idx_render_output_template_version
    on doc.render_output (template_version_id);

create index if not exists idx_render_output_replaces
    on doc.render_output (replaces_output_id) where replaces_output_id is not null;

-- Storage versioning columns (from 141_document_robustness.sql)
ALTER TABLE doc.render_output ADD COLUMN IF NOT EXISTS storage_bucket TEXT;
ALTER TABLE doc.render_output ADD COLUMN IF NOT EXISTS storage_version_id TEXT;
ALTER TABLE doc.render_output ADD COLUMN IF NOT EXISTS manifest_version INT NOT NULL DEFAULT 1;
ALTER TABLE doc.render_output ADD COLUMN IF NOT EXISTS error_code TEXT;

-- Idempotency composite index (from 141_document_robustness.sql)
CREATE UNIQUE INDEX IF NOT EXISTS idx_render_output_inflight_idempotency
    ON doc.render_output (tenant_id, template_version_id, entity_name, entity_id, operation, variant, input_payload_hash)
    WHERE status IN ('QUEUED', 'RENDERING');

-- Template capability columns (from 141_document_robustness.sql)
ALTER TABLE doc.template ADD COLUMN IF NOT EXISTS supports_rtl BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE doc.template ADD COLUMN IF NOT EXISTS requires_letterhead BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE doc.template ADD COLUMN IF NOT EXISTS allowed_operations TEXT[];
ALTER TABLE doc.template ADD COLUMN IF NOT EXISTS supported_locales TEXT[];


-- 7. render_job: queue tracking (correlates with BullMQ jobs)
create table if not exists doc.render_job (
    id                  uuid primary key default gen_random_uuid(),
    output_id           uuid not null references doc.render_output(id) on delete cascade,
    tenant_id           uuid not null references core.tenant(id) on delete cascade,

    job_queue_id        text,                                        -- BullMQ job ID
    status              text not null default 'PENDING'
                        check (status in ('PENDING','PROCESSING','COMPLETED','FAILED','RETRYING')),
    attempts            int not null default 0,
    max_attempts        int not null default 3,
    error_code          text,
    error_detail        text,
    trace_id            text,                                        -- OpenTelemetry trace

    started_at          timestamptz,
    completed_at        timestamptz,
    duration_ms         int,

    created_at          timestamptz not null default now()
);

comment on table doc.render_job is 'Render job queue tracking — correlates with BullMQ jobs for observability.';

create index if not exists idx_render_job_output
    on doc.render_job (output_id);

create index if not exists idx_render_job_status
    on doc.render_job (tenant_id, status);

-- ============================================================================
-- D) Render Dead-Letter Queue (from 141_document_robustness.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS doc.render_dlq (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    output_id       UUID NOT NULL REFERENCES doc.render_output(id),
    render_job_id   UUID REFERENCES doc.render_job(id),

    error_code      TEXT NOT NULL,
    error_detail    TEXT,
    error_category  TEXT NOT NULL CHECK (error_category IN ('transient','permanent','timeout','crash')),
    attempt_count   INT NOT NULL DEFAULT 0,
    payload         JSONB NOT NULL,

    replayed_at     TIMESTAMPTZ,
    replayed_by     TEXT,
    replay_count    INT NOT NULL DEFAULT 0,

    dead_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

comment on table doc.render_dlq is 'Dead-letter queue for permanently failed document render jobs.';

CREATE INDEX IF NOT EXISTS idx_render_dlq_unreplayed
    ON doc.render_dlq (tenant_id) WHERE replayed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_render_dlq_output
    ON doc.render_dlq (output_id);

-- ============================================================================
-- DOC: Entity Document Link (many-to-many entity → document)
-- ============================================================================
create table if not exists doc.entity_document_link (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  entity_type     text not null,
  entity_id       uuid not null,
  attachment_id   uuid not null references doc.attachment(id) on delete cascade,

  link_kind       text not null default 'related',
  display_order   integer not null default 0,
  metadata        jsonb,

  created_at      timestamptz(6) not null default now(),
  created_by      text not null
);

comment on table doc.entity_document_link is 'Many-to-many links between entities and documents with categorization.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'entity_document_link_kind_check'
  ) then
    alter table doc.entity_document_link
      add constraint entity_document_link_kind_check
        check (link_kind in ('primary', 'related', 'supporting', 'compliance', 'audit'));
  end if;
end $$;

create unique index if not exists entity_document_link_entity_attachment_uniq
  on doc.entity_document_link(tenant_id, entity_type, entity_id, attachment_id);

create index if not exists idx_entity_document_link_entity
  on doc.entity_document_link(tenant_id, entity_type, entity_id, link_kind);

create index if not exists idx_entity_document_link_attachment
  on doc.entity_document_link(attachment_id);

-- ============================================================================
-- DOC: Document ACL (per-document access control)
-- ============================================================================
create table if not exists doc.document_acl (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,
  attachment_id   uuid not null references doc.attachment(id) on delete cascade,

  principal_id    uuid,
  role_id         uuid,
  permission      text not null,
  granted         boolean not null default true,
  granted_by      text not null,
  granted_at      timestamptz(6) not null default now(),
  expires_at      timestamptz(6)
);

comment on table doc.document_acl is 'Optional per-document access control list (supplements PolicyGateService).';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_acl_permission_check'
  ) then
    alter table doc.document_acl
      add constraint document_acl_permission_check
        check (permission in ('read', 'download', 'delete', 'share'));
  end if;
end $$;

-- Ensure either principal_id OR role_id is set (not both, not neither)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_acl_principal_or_role_check'
  ) then
    alter table doc.document_acl
      add constraint document_acl_principal_or_role_check
        check (
          (principal_id is not null and role_id is null) or
          (principal_id is null and role_id is not null)
        );
  end if;
end $$;

create index if not exists idx_document_acl_attachment
  on doc.document_acl(attachment_id, permission);

-- ============================================================================
-- DOC: Attachment Access Log (high-volume audit trail)
-- ============================================================================
create table if not exists doc.attachment_access_log (
  id              bigserial primary key,
  tenant_id       uuid not null references core.tenant(id) on delete cascade,
  attachment_id   uuid not null,
  actor_id        text not null,
  action          text not null check (action in ('download', 'preview', 'metadata')),
  ip_address      text,
  user_agent      text,
  accessed_at     timestamptz(6) not null default now()
);

comment on table doc.attachment_access_log is 'High-volume audit trail for file access. Consider partitioning by month and retention policy (30-90 days).';

create index if not exists idx_access_log_tenant_time
  on doc.attachment_access_log(tenant_id, accessed_at desc);

create index if not exists idx_access_log_attachment
  on doc.attachment_access_log(attachment_id, accessed_at desc);

create index if not exists idx_access_log_actor
  on doc.attachment_access_log(tenant_id, actor_id, accessed_at desc);

-- ============================================================================
-- DOC: Attachment Comment (file comments with threading)
-- ============================================================================
create table if not exists doc.attachment_comment (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,
  attachment_id   uuid not null references doc.attachment(id) on delete cascade,
  parent_id       uuid references doc.attachment_comment(id) on delete cascade,

  author_id       text not null,
  content         text not null,
  mentions        jsonb,

  edited_at       timestamptz(6),
  edited_by       text,
  deleted_at      timestamptz(6),
  deleted_by      text,

  created_at      timestamptz(6) not null default now(),
  updated_at      timestamptz(6) not null default now()
);

comment on table doc.attachment_comment is 'Comments and annotations for attachments. Supports threaded replies and mentions.';

create index if not exists idx_comment_attachment
  on doc.attachment_comment(tenant_id, attachment_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_comment_parent
  on doc.attachment_comment(parent_id, created_at)
  where parent_id is not null and deleted_at is null;

create index if not exists idx_comment_author
  on doc.attachment_comment(tenant_id, author_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_comment_mentions
  on doc.attachment_comment using gin (mentions)
  where mentions is not null;

-- ============================================================================
-- DOC: Multipart Upload (S3 multipart upload tracking)
-- ============================================================================
create table if not exists doc.multipart_upload (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,
  attachment_id   uuid not null references doc.attachment(id) on delete cascade,

  s3_upload_id    text not null,
  total_parts     integer not null,
  completed_parts integer default 0,
  part_etags      jsonb,
  status          text not null check (status in ('initiated', 'uploading', 'completed', 'aborted', 'failed')),

  initiated_at    timestamptz(6) not null default now(),
  completed_at    timestamptz(6),
  expires_at      timestamptz(6) not null,

  unique(s3_upload_id)
);

comment on table doc.multipart_upload is 'Tracks S3 multipart uploads for large files (>100MB). Cleanup job aborts expired uploads.';

create index if not exists idx_multipart_attachment
  on doc.multipart_upload(attachment_id);

create index if not exists idx_multipart_status
  on doc.multipart_upload(tenant_id, status, expires_at)
  where status in ('initiated', 'uploading');
