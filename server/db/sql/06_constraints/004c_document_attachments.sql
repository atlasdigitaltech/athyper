-- 06_constraints/004c_document_attachments.sql
-- FK constraints and live-DB fixups for document.doc_attachment.
-- Idempotent: EXCEPTION WHEN duplicate_object / column_already_exists guards.
-- Depends on: 04_tables/004c_document_attachments.sql

-- ── Live-DB column fixups (table already exists in dev; re-run safe) ─────────

-- Add missing audit columns (no-op if already present)
ALTER TABLE document.doc_attachment
    ADD COLUMN IF NOT EXISTS updated_at  timestamptz,
    ADD COLUMN IF NOT EXISTS updated_by  uuid;

-- Harden created_by to NOT NULL (safe: table has no data at time of migration)
ALTER TABLE document.doc_attachment
    ALTER COLUMN created_by SET NOT NULL;

-- Add UNIQUE (tenant_id, id) if not already present
-- duplicate_table (42P07) raised when constraint was already created inline in CREATE TABLE
-- duplicate_object (42710) raised when already added via ALTER TABLE previously
DO $$ BEGIN
    ALTER TABLE document.doc_attachment
        ADD CONSTRAINT doc_attachment_tenant_id_uq UNIQUE (tenant_id, id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── FK constraints ────────────────────────────────────────────────────────────

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
