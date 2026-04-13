-- 04_tables/003f_master_cms.sql
-- Depends on: 01_schemas, 02_types_domains, 003a_master_identity.sql
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
    'Versioned content header. Body snapshots in snapshot.content_item_version. '
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
    'Directional cross-reference graph between content items. '
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
    'Per-record access grants. Additive overrides on top of platform RBAC. '
    'subject_type and access_level are sealed platform vocabulary (inline CHECK). '
    'subject_type=''public'' + subject_id IS NULL = open/world-readable.';
COMMENT ON COLUMN master.content_item_access_grant.subject_type IS
    'Sealed: principal | role | group | public.';
COMMENT ON COLUMN master.content_item_access_grant.access_level IS
    'Sealed: read | write | publish | admin.';
COMMENT ON COLUMN master.content_item_access_grant.expires_at IS
    'Optional expiry. NULL = perpetual grant. Must be after created_at.';
