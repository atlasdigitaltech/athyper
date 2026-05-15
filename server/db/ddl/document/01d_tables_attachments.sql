-- ============================================================================
-- document/01d_tables_attachments.sql
-- Concept: Document Attachments — file references linked to transactional documents
-- Depends on: 04_tables/004_document.sql
-- ============================================================================

-- ─── document.doc_attachment ─────────────────────────────────────────────────
--
-- Inline file storage for document attachments.
-- Stores base64-encoded file content directly in the row — no S3 dependency.
-- Suitable for development and moderate-size files (< 25 MB).
--
-- Linked to a document by (tenant_id, entity_type, entity_id):
--   entity_type  — document entity slug, e.g. 'purchase_invoice'
--   entity_id    — document primary key UUID
--
-- Upload flow: BFF relay converts multipart/form-data → base64 JSON →
--   runtime stores base64 in data_base64.
-- Download flow: GET .../attachments/:id/download streams decoded bytes.
 
CREATE TABLE IF NOT EXISTS document.doc_attachment (
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid            NOT NULL,
    entity_type     text            NOT NULL,
    entity_id       uuid            NOT NULL,
    filename        text            NOT NULL,
    content_type    text            NOT NULL DEFAULT 'application/octet-stream',
    size_bytes      bigint          NOT NULL DEFAULT 0,
    data_base64     text            NOT NULL DEFAULT '',
    uploaded_by     uuid,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
 
    CONSTRAINT doc_attachment_pkey          PRIMARY KEY (id),
    CONSTRAINT doc_attachment_tenant_id_uq  UNIQUE (tenant_id, id),
    CONSTRAINT doc_attachment_filename_chk  CHECK (btrim(filename) <> ''),
    CONSTRAINT doc_attachment_size_chk      CHECK (size_bytes >= 0)
);
 
CREATE INDEX IF NOT EXISTS doc_attachment_entity_idx
    ON document.doc_attachment (tenant_id, entity_type, entity_id);
 
COMMENT ON TABLE document.doc_attachment IS
    'ARCHETYPE=C;SCOPE=T. Inline document file attachments. Base64 content in data_base64. '
    'entity_type = document entity name slug; entity_id = document PK.';
 
COMMENT ON COLUMN document.doc_attachment.data_base64 IS
    'Base64-encoded file content. Empty string for metadata-only records '
    '(e.g. after migration to S3-backed master.attachment).';
 
 
-- FK constraints

DO $$ BEGIN
    ALTER TABLE document.doc_attachment
        ADD CONSTRAINT da_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.doc_attachment
        ADD CONSTRAINT da_uploaded_by_fk
        FOREIGN KEY (uploaded_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.doc_attachment
        ADD CONSTRAINT da_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.doc_attachment
        ADD CONSTRAINT da_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
 
 