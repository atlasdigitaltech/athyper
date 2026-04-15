-- 030_canonical_fields/000_canonical_dictionary.sql
-- Seed: ~15 canonical field dictionary rows
-- entity_version_id IS NULL = global canonical field (cross-entity)
-- CHECK constraint ef_canonical_tenant_chk: canonical fields must have tenant_id IS NULL
-- Partial UNIQUE index ef_canonical_name_uidx: UNIQUE(name) WHERE entity_version_id IS NULL
-- Idempotent: ON CONFLICT DO NOTHING (via index)

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO control.entity_field (
    tenant_id, entity_version_id,
    name, column_name, label, description,
    data_type, ui_type, cardinality, origin,
    is_required, is_unique, is_searchable, is_filterable, is_sortable,
    is_read_only, is_write_once,
    applies_to_classes, is_required_default, is_filterable_default,
    sort_order, created_by
) VALUES

    -- ── System identity ──────────────────────────────────────────────────────
    (NULL, NULL,
     'id', 'id', 'ID', 'Primary key (UUIDv7)',
     'uuid', 'hidden', 'one', 'system',
     true, true, false, false, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,DOCUMENT_RELATION,REFERENCE,RELATION,LOG,DIMENSION,AGGREGATE}',
     true, false,
     10, v_su),

    (NULL, NULL,
     'tenant_id', 'tenant_id', 'Tenant', 'Owning tenant reference',
     'uuid', 'hidden', 'one', 'system',
     true, false, false, true, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,DOCUMENT_RELATION,RELATION,LOG,DIMENSION}',
     true, true,
     20, v_su),

    -- ── Standard identity ────────────────────────────────────────────────────
    (NULL, NULL,
     'code', 'code', 'Code', 'Unique business code / slug',
     'string', 'text', 'one', 'standard',
     true, true, true, true, true,
     false, false,
     '{MASTER,REFERENCE,DIMENSION}',
     true, true,
     30, v_su),

    (NULL, NULL,
     'name', 'name', 'Name', 'Display name',
     'string', 'text', 'one', 'standard',
     true, false, true, true, true,
     false, false,
     '{MASTER,REFERENCE,DIMENSION}',
     true, true,
     40, v_su),

    (NULL, NULL,
     'description', 'description', 'Description', 'Detailed description',
     'text', 'textarea', 'one', 'standard',
     false, false, true, false, false,
     false, false,
     '{MASTER,CONTROL,REFERENCE,DIMENSION}',
     false, false,
     50, v_su),

    -- ── Lifecycle / Status ───────────────────────────────────────────────────
    (NULL, NULL,
     'status', 'status', 'Status', 'Lifecycle status code',
     'string', 'status', 'one', 'system',
     true, false, false, true, true,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,REFERENCE,DIMENSION}',
     true, true,
     900, v_su),

    (NULL, NULL,
     'is_active', 'is_active', 'Active', 'Computed active flag (status = active or ACTIVE)',
     'boolean', 'hidden', 'one', 'system',
     true, false, false, true, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,REFERENCE,DIMENSION}',
     true, true,
     910, v_su),

    (NULL, NULL,
     'status_changed_at', 'status_changed_at', 'Status Changed', 'Timestamp of last status change',
     'timestamp', 'datetime', 'one', 'system',
     false, false, false, true, true,
     true, false,
     '{MASTER,DOCUMENT}',
     false, false,
     920, v_su),

    (NULL, NULL,
     'status_changed_by', 'status_changed_by', 'Status Changed By', 'Actor who last changed status',
     'uuid', 'reference', 'one', 'system',
     false, false, false, false, false,
     true, false,
     '{MASTER,DOCUMENT}',
     false, false,
     925, v_su),

    -- ── Metadata ─────────────────────────────────────────────────────────────
    (NULL, NULL,
     'metadata', 'metadata', 'Metadata', 'Extensible JSONB metadata bag',
     'json', 'json-editor', 'one', 'system',
     false, false, false, false, false,
     false, false,
     '{MASTER,CONTROL,DOCUMENT,DIMENSION}',
     false, false,
     930, v_su),

    (NULL, NULL,
     'tags', 'tags', 'Tags', 'JSONB string-array of user-defined tags',
     'json', 'tag-input', 'many', 'system',
     false, false, true, true, false,
     false, false,
     '{MASTER,DOCUMENT}',
     false, false,
     935, v_su),

    -- ── Audit trail ──────────────────────────────────────────────────────────
    (NULL, NULL,
     'created_at', 'created_at', 'Created', 'Row creation timestamp',
     'timestamp', 'datetime', 'one', 'system',
     true, false, false, true, true,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,DOCUMENT_RELATION,REFERENCE,RELATION,LOG,DIMENSION,AGGREGATE}',
     true, true,
     950, v_su),

    (NULL, NULL,
     'created_by', 'created_by', 'Created By', 'Actor UUID who created the row',
     'uuid', 'reference', 'one', 'system',
     true, false, false, true, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,DOCUMENT_RELATION,REFERENCE,RELATION,LOG,DIMENSION}',
     true, false,
     960, v_su),

    (NULL, NULL,
     'updated_at', 'updated_at', 'Updated', 'Timestamp of last update',
     'timestamp', 'datetime', 'one', 'system',
     false, false, false, true, true,
     true, false,
     '{MASTER,CONTROL,DOCUMENT}',
     false, false,
     970, v_su),

    (NULL, NULL,
     'updated_by', 'updated_by', 'Updated By', 'Actor UUID who last updated',
     'uuid', 'reference', 'one', 'system',
     false, false, false, false, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT}',
     false, false,
     980, v_su)

ON CONFLICT DO NOTHING;

RAISE NOTICE 'control.entity_field: canonical dictionary seeded (% rows if first run)',
    (SELECT count(*) FROM control.entity_field WHERE entity_version_id IS NULL);

END $$;
