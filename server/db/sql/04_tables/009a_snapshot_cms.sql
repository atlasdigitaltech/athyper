-- 04_tables/009a_snapshot_cms.sql
-- Depends on: 01_schemas, 003f_master_cms.sql, 009_snapshot.sql
-- Snapshot schema tables (CMS): content_item_version.
-- Immutable body snapshots for master.content_item.
-- UPDATE and DELETE blocked by snapshot.trg_content_item_version_immutable (09_triggers/011_cms.sql).
-- Pattern mirrors snapshot.template_version.
--
-- FKs → 06_constraints/011_cms.sql
-- Immutability trigger → 09_triggers/011_cms.sql


-- ============================================================================
-- §1  snapshot.content_item_version — immutable body snapshot
-- ============================================================================
-- One row per (tenant, content_item, version). Append-only.
-- checksum prevents saving an identical body as a new version number.
-- master.content_item.current_version_id points to the active row.

CREATE TABLE IF NOT EXISTS snapshot.content_item_version (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Parent reference
    content_item_id     uuid        NOT NULL,
    version             integer     NOT NULL,

    -- Body
    body_json           jsonb       NOT NULL,
    body_format         text        NOT NULL DEFAULT 'slate',

    -- Metadata
    change_summary      text,
    checksum            text        NOT NULL,

    -- Immutable audit — no updated_at (snapshots never change)
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,

    CONSTRAINT civ_pkey             PRIMARY KEY (id),
    CONSTRAINT civ_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT civ_version_uq       UNIQUE (tenant_id, content_item_id, version),
    CONSTRAINT civ_checksum_uq      UNIQUE (tenant_id, content_item_id, checksum),
    CONSTRAINT civ_version_pos      CHECK (version >= 1),
    CONSTRAINT civ_checksum_chk     CHECK (btrim(checksum) <> ''),
    CONSTRAINT civ_body_format_chk  CHECK (body_format IN (
        'slate', 'prosemirror', 'html', 'markdown'
    ))
    -- FKs (tenant, content_item, principal) → 06_constraints/011_cms.sql
    -- Circular FK from master.content_item.current_version_id → 06_constraints/011_cms.sql
);

COMMENT ON TABLE  snapshot.content_item_version IS
    'Immutable body snapshot per content item version. '
    'UPDATE and DELETE blocked by snapshot.trg_content_item_version_immutable trigger. '
    'Pattern mirrors snapshot.template_version. '
    'checksum prevents saving an identical body under a new version number.';
COMMENT ON COLUMN snapshot.content_item_version.version IS
    'Monotonically increasing per (tenant_id, content_item_id). Starts at 1.';
COMMENT ON COLUMN snapshot.content_item_version.body_json IS
    'Rich-text document tree. Format declared in body_format.';
COMMENT ON COLUMN snapshot.content_item_version.body_format IS
    'Sealed: slate | prosemirror | html | markdown.';
COMMENT ON COLUMN snapshot.content_item_version.checksum IS
    'SHA-256 of body_json. Unique per (tenant, content_item) — prevents '
    'saving a duplicate body as a new version.';
