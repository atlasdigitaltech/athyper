-- ============================================================================
-- master/01f_tables_cms.sql
-- Concept: Content Management — content items, links, access grants, comment cursors
-- Depends on: 04_tables/003a_master_identity.sql
-- Master schema tables (Part F): Content management.
-- 3 tables: content_item, content_item_link, content_item_access_grant.
--
-- current_version_id circular FK → 06_constraints (DEFERRABLE INITIALLY DEFERRED).
--
-- Lookup-validated columns (trigger-based, 09_triggers/011_cms.sql):
--   content_item.kind           — master.content_item_kind
--   content_item_link.relation_type — master.content_item_link_relation_type
--
-- Sealed inline CHECK (protocol / platform vocabulary):
--   content_item.status         (DRAFT / REVIEW / PUBLISHED / ARCHIVED)
--   content_item_access_grant.subject_type  (principal / role / group / public)
--   content_item_access_grant.access_level  (read / write / publish / admin)
--
-- FKs → 06_constraints/011_cms.sql
-- Indexes → 07_indexes/011_cms.sql
-- Triggers → 09_triggers/011_cms.sql
-- ============================================================================


-- ============================================================================
-- §1  master.content_item — versioned content header
-- ============================================================================
-- Registry / standing record for CMS content.
-- Body lives in snapshot.content_item_version.
-- current_version_id → DEFERRABLE circular FK (06_constraints).
-- Lifecycle mirrors master.template: UPPERCASE status, no is_active generated column.

CREATE TABLE IF NOT EXISTS master.content_item (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Natural key
    code                text        NOT NULL,
    title               text        NOT NULL,

    -- Table-specific (classification)
    kind                text        NOT NULL DEFAULT 'page',

    -- Table-specific (tree + locale + routing)
    parent_id           uuid,
    locale_code         text        NOT NULL DEFAULT 'en',
    slug                text        NOT NULL,
    summary             text,

    -- Current version pointer (circular FK — see 06_constraints)
    current_version_id  uuid,

    -- Metadata
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'DRAFT',
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT content_item_pkey                PRIMARY KEY (id),
    CONSTRAINT content_item_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT content_item_tenant_code_uq      UNIQUE (tenant_id, code),
    CONSTRAINT content_item_slug_uq             UNIQUE (tenant_id, parent_id, locale_code, slug),
    CONSTRAINT content_item_no_self_ref         CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT content_item_code_chk            CHECK (btrim(code) <> ''),
    CONSTRAINT content_item_title_chk           CHECK (btrim(title) <> ''),
    CONSTRAINT content_item_slug_chk            CHECK (slug ~ '^[a-z][a-z0-9_-]*$'),
    CONSTRAINT content_item_locale_code_chk     CHECK (btrim(locale_code) <> ''),
    CONSTRAINT content_item_status_chk          CHECK (status IN (
        'DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'
    ))
    -- kind: 09_triggers — control.trg_validate_lookup_columns('master.content_item_kind')
    -- parent_id FK: 06_constraints (same-schema self-referential)
    -- current_version_id FK: 06_constraints — DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE  master.content_item IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Versioned content header. Body snapshots in snapshot.content_item_version. '
    'current_version_id → snapshot.content_item_version via DEFERRABLE FK (06_constraints). '
    'Lifecycle mirrors master.template: UPPERCASE status, no is_active. '
    'Multilingual: slug uniqueness includes locale_code. Multiple locales for one '
    'logical content item are modelled as sibling rows sharing the same code.';
COMMENT ON COLUMN master.content_item.code IS
    'Stable internal key. Never changes when title or slug is updated.';
COMMENT ON COLUMN master.content_item.slug IS
    'URL-visible path segment. Format: lowercase alphanumeric + hyphens/underscores. '
    'Unique per (tenant_id, parent_id, locale_code).';
COMMENT ON COLUMN master.content_item.kind IS
    'Content functional category. Lookup: master.content_item_kind. '
    'e.g. page, article, snippet, announcement.';
COMMENT ON COLUMN master.content_item.current_version_id IS
    'Points to the active snapshot. NULL until first version is saved. '
    'FK is DEFERRABLE INITIALLY DEFERRED — item + first version can be inserted '
    'atomically in a single transaction.';
COMMENT ON COLUMN master.content_item.locale_code IS
    'BCP 47 locale tag (e.g. en, fr, ar). Part of slug uniqueness key.';
COMMENT ON COLUMN master.content_item.summary IS
    'Short plain-text excerpt for listings and search results. Not versioned.';


-- ============================================================================
-- §2  master.content_item_link — cross-reference graph
-- ============================================================================
-- Explicit directional links between content items.
-- relation_type is extensible — governed by master.content_item_link_relation_type.
-- No updated_at: links are immutable once created (delete and re-create to change).

CREATE TABLE IF NOT EXISTS master.content_item_link (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Graph edge
    source_content_item_id  uuid        NOT NULL,
    target_content_item_id  uuid        NOT NULL,

    -- Table-specific
    relation_type           text        NOT NULL DEFAULT 'related',
    display_order           integer     NOT NULL DEFAULT 0,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,

    CONSTRAINT cil_pkey                 PRIMARY KEY (id),
    CONSTRAINT cil_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT cil_edge_uq              UNIQUE (tenant_id, source_content_item_id,
                                                target_content_item_id, relation_type),
    CONSTRAINT cil_no_self_ref          CHECK (source_content_item_id IS DISTINCT FROM
                                               target_content_item_id),
    CONSTRAINT cil_display_order_chk    CHECK (display_order >= 0),
    CONSTRAINT cil_relation_type_chk    CHECK (btrim(relation_type) <> '')
    -- relation_type: 09_triggers — control.trg_validate_lookup_columns(
    --     'master.content_item_link_relation_type', 'relation_type')
);

COMMENT ON TABLE  master.content_item_link IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Directional cross-reference graph between content items. '
    'relation_type is extensible via master.content_item_link_relation_type lookup.';
COMMENT ON COLUMN master.content_item_link.relation_type IS
    'Link classification. Lookup: master.content_item_link_relation_type. '
    'e.g. related, embed, see_also.';
COMMENT ON COLUMN master.content_item_link.display_order IS
    'Sort order for rendering outbound links from source item.';


-- ============================================================================
-- §3  master.content_item_access_grant — per-record access overrides
-- ============================================================================
-- Record-level access grants layered on top of platform RBAC.
-- subject_type / access_level: sealed platform vocabulary — inline CHECK only.
-- subject_type = 'public' + subject_id IS NULL = world-readable content.

CREATE TABLE IF NOT EXISTS master.content_item_access_grant (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Target
    content_item_id     uuid        NOT NULL,

    -- Subject (one of: principal, role, group, or public)
    subject_type        text        NOT NULL,
    subject_id          uuid,

    -- Grant
    access_level        text        NOT NULL,
    expires_at          timestamptz,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,

    CONSTRAINT ciag_pkey                PRIMARY KEY (id),
    CONSTRAINT ciag_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT ciag_grant_uq            UNIQUE (tenant_id, content_item_id,
                                                subject_type, subject_id, access_level),
    CONSTRAINT ciag_subject_type_chk    CHECK (subject_type IN (
        'principal', 'role', 'group', 'public'
    )),
    CONSTRAINT ciag_access_level_chk    CHECK (access_level IN (
        'read', 'write', 'publish', 'admin'
    )),
    CONSTRAINT ciag_public_no_subject   CHECK (
        subject_type <> 'public' OR subject_id IS NULL
    ),
    CONSTRAINT ciag_named_has_subject   CHECK (
        subject_type = 'public' OR subject_id IS NOT NULL
    ),
    CONSTRAINT ciag_expiry_chk          CHECK (
        expires_at IS NULL OR expires_at > created_at
    )
);

COMMENT ON TABLE  master.content_item_access_grant IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Per-record access grants. Additive overrides on top of platform RBAC. '
    'subject_type and access_level are sealed platform vocabulary (inline CHECK). '
    'subject_type=''public'' + subject_id IS NULL = open/world-readable.';
COMMENT ON COLUMN master.content_item_access_grant.subject_type IS
    'Sealed: principal | role | group | public.';
COMMENT ON COLUMN master.content_item_access_grant.access_level IS
    'Sealed: read | write | publish | admin.';
COMMENT ON COLUMN master.content_item_access_grant.expires_at IS
    'Optional expiry. NULL = perpetual grant. Must be after created_at.';


-- ============================================================================
-- §4  master.comment_feed_cursor — per-principal comment read watermark
-- ============================================================================
-- Lightweight per-principal read cursor for unread comment tracking.
--
-- One row per (tenant_id, principal_id, entity_type, entity_id).
-- Upserted when a principal opens a comment thread (sets last_read_at = now()).
--
-- Why a cursor table instead of log.activity_log?
--   log.activity_log is append-only and partitioned by month. Querying it
--   at render time (once per CommentList mount) would require a partition scan.
--   This table holds the latest watermark only — O(1) reads on a tiny B-tree.

CREATE TABLE IF NOT EXISTS master.comment_feed_cursor (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL,
    principal_id    uuid        NOT NULL,
    entity_type     text        NOT NULL,
    entity_id       text        NOT NULL,
    last_read_at    timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz,

    CONSTRAINT cfc_pk     PRIMARY KEY (id),
    CONSTRAINT cfc_unique UNIQUE (tenant_id, principal_id, entity_type, entity_id),
    CONSTRAINT cfc_entity_type_len CHECK (char_length(entity_type) BETWEEN 1 AND 120),
    CONSTRAINT cfc_entity_id_len   CHECK (char_length(entity_id)   BETWEEN 1 AND 120)
);

COMMENT ON TABLE master.comment_feed_cursor IS
    'ARCHETYPE=C;SCOPE=T. Per-principal watermark for comment thread read tracking. '
    'One row per (tenant, principal, entity). Upserted on thread open. '
    'Enables O(1) unread-count queries without scanning activity_log.';

COMMENT ON COLUMN master.comment_feed_cursor.last_read_at IS
    'Timestamp of the last time this principal opened the comment thread. '
    'Comments created after this timestamp are counted as unread.';

-- Primary unread-count lookup: (tenant, entity_type, entity_id, principal)
CREATE INDEX IF NOT EXISTS cfc_entity_principal_idx
    ON master.comment_feed_cursor (tenant_id, entity_type, entity_id, principal_id);

ALTER TABLE master.comment_feed_cursor ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.comment_feed_cursor FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_rw  ON master.comment_feed_cursor;
DROP POLICY IF EXISTS admin_all  ON master.comment_feed_cursor;

CREATE POLICY tenant_rw ON master.comment_feed_cursor
    USING     (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY admin_all ON master.comment_feed_cursor
    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §PREVIEW  Preview columns — populated asynchronously by the cms-preview worker
-- ============================================================================
-- Added via Sprint 36 (Task 11.2 — CMS Preview Generation Worker).
-- The cms-preview BullMQ worker processes jobs queued when a new content
-- version is saved. It extracts plain text and HTML snippets from body_json
-- and writes them here so listing/search pages can render previews without
-- loading the full snapshot.content_item_version body.
--
-- preview_text — plain-text excerpt, max ~500 chars, suitable for search
-- preview_html — HTML snippet (first 3 paragraphs), suitable for embedding
-- preview_generated_at — when the worker last populated these columns;
--   NULL means no preview has been generated yet (pending first version save)
-- ============================================================================

ALTER TABLE master.content_item ADD COLUMN IF NOT EXISTS preview_text          text;
ALTER TABLE master.content_item ADD COLUMN IF NOT EXISTS preview_html          text;
ALTER TABLE master.content_item ADD COLUMN IF NOT EXISTS preview_generated_at  timestamptz;

COMMENT ON COLUMN master.content_item.preview_text IS
    'Plain-text excerpt generated by the cms-preview worker from the current version body_json. '
    'Max ~500 chars. NULL until first version is processed. Used for search snippets.';
COMMENT ON COLUMN master.content_item.preview_html IS
    'HTML snippet (first 3 rendered paragraphs) generated by the cms-preview worker. '
    'NULL until first version is processed. Used for embed/preview cards.';
COMMENT ON COLUMN master.content_item.preview_generated_at IS
    'Timestamp when the cms-preview worker last wrote preview_text/preview_html. '
    'NULL = preview pending. Use to detect stale previews after version updates.';
