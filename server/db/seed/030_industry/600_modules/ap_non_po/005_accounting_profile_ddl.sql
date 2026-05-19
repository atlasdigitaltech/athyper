-- ============================================================================
-- FILE: blueprint/005_accounting_profile_ddl.sql
-- Purpose: Create master.accounting_profile identity table
-- Why here: Existing FK stubs in master.company_code_supplier_profile and
--           master.company_code_customer_profile use undefined_table guards that
--           reference this table. Base DDL never creates it. This file closes
--           that gap — once run, those FK stubs activate automatically.
-- Depends on: master.tenant, master.principal
-- Idempotent: CREATE TABLE IF NOT EXISTS + ADD CONSTRAINT DO $$ guards
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.accounting_profile (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Natural key
    code                text            NOT NULL,
    name                text            NOT NULL,
    description         text,

    -- Classification
    direction           text            NOT NULL DEFAULT 'INBOUND',
    subledger_type      text            NOT NULL DEFAULT 'AP',
    domain_hint         text,

    -- Display
    icon_key            text,
    color_token         text,
    sort_order          smallint        NOT NULL DEFAULT 0,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              text            NOT NULL DEFAULT 'active',
    is_active           boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT ap_pkey              PRIMARY KEY (id),
    CONSTRAINT ap_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ap_tenant_code_uq    UNIQUE (tenant_id, code),
    CONSTRAINT ap_code_nonempty     CHECK (btrim(code) <> ''),
    CONSTRAINT ap_code_fmt          CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT ap_name_nonempty     CHECK (btrim(name) <> ''),
    CONSTRAINT ap_direction_chk     CHECK (direction IN ('INBOUND','OUTBOUND','BILATERAL')),
    CONSTRAINT ap_subledger_chk     CHECK (subledger_type IN (
        'AP','AR','ASSET','INVENTORY','WIP','COMMISSION','NONE')),
    CONSTRAINT ap_status_chk        CHECK (status IN ('active','inactive','archived'))
);

COMMENT ON TABLE master.accounting_profile IS
    'Identity table for accounting profiles. '
    '1:N with control.acct_profile_config (versioned configuration). '
    'Referenced by master.company_code_supplier_profile.default_accounting_profile_id '
    'and master.company_code_customer_profile.default_accounting_profile_id. '
    'Engine 4.13 resolves profile_config at runtime via intent_to_accounting_profile_rule.';

COMMENT ON COLUMN master.accounting_profile.direction IS
    'INBOUND=AP (supplier-facing), OUTBOUND=AR (customer-facing), BILATERAL=both sides.';
COMMENT ON COLUMN master.accounting_profile.subledger_type IS
    'Must match the subledger_type on the corresponding acct_profile_config. '
    'AP for supplier flows, AR for customer flows, ASSET for fixed-asset profiles.';
COMMENT ON COLUMN master.accounting_profile.domain_hint IS
    'Optional classification hint (OPEX/CAPEX/ADMIN/...). Informational only; '
    'actual routing is driven by business_intent via Engine 4.13 rules.';


-- ── FK constraints (tenant + audit) ─────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE master.accounting_profile
        ADD CONSTRAINT ap_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.accounting_profile
        ADD CONSTRAINT ap_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.accounting_profile
        ADD CONSTRAINT ap_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;


-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS ap_tenant_status_idx
    ON master.accounting_profile (tenant_id, status)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ap_subledger_idx
    ON master.accounting_profile (tenant_id, subledger_type, direction)
    WHERE is_active = true;


-- ── Row-Level Security ──────────────────────────────────────────────────────

ALTER TABLE master.accounting_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ap_tenant_isolation ON master.accounting_profile;
CREATE POLICY ap_tenant_isolation ON master.accounting_profile
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);


-- ── Updated-at trigger ──────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_ap_updated_at ON master.accounting_profile;
CREATE TRIGGER trg_ap_updated_at
    BEFORE UPDATE ON master.accounting_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ap_status_changed ON master.accounting_profile;
CREATE TRIGGER trg_ap_status_changed
    BEFORE UPDATE ON master.accounting_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ── Entity metadata ─────────────────────────────────────────────────────────
-- The AP module is installed after the base entity-engine pass, so register the
-- metadata needed by reference displays and runtime search here.
INSERT INTO control.entity (
    module_id, name, slug, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    feature_flags, status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'accounting_profile', 'accounting-profile', 'ACCP', 'accounting_profile',
    'MASTER', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'master', 'accounting_profile',
    'Accounting Profile', 'Accounting Profiles', 'layers', 'blue',
    '{}'::jsonb, 'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1
    FROM control.entity
    WHERE table_schema = 'master'
      AND table_name = 'accounting_profile'
      AND tenant_id IS NULL
);

INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', 'Initial version', 'structural', now(),
       '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE e.entity_code = 'accounting_profile' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
    is_read_only, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type, f.ui_type,
       f.cardinality, f.origin, f.is_required, f.is_filterable, f.is_sortable, f.is_searchable,
       f.is_read_only, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('id',             'id',             'ID',              'uuid',            'hidden',   'one',         'system',   true,  false, false, false, true,   10),
    ('tenant_id',      'tenant_id',      'Tenant',          'uuid',            'hidden',   'one',         'system',   true,  true,  false, false, true,   20),
    ('code',           'code',           'Code',            'string',          'text',     'one',         'standard', true,  true,  true,  true,  false,  30),
    ('name',           'name',           'Name',            'string',          'text',     'one',         'standard', true,  true,  true,  true,  false,  40),
    ('description',    'description',    'Description',     'text',            'textarea', 'zero_or_one', 'standard', false, false, false, true,  false,  50),
    ('direction',      'direction',      'Direction',       'string',          'select',   'one',         'standard', true,  true,  true,  false, false,  60),
    ('subledger_type', 'subledger_type', 'Subledger Type',  'string',          'select',   'one',         'standard', true,  true,  true,  false, false,  70),
    ('domain_hint',    'domain_hint',    'Domain',          'string',          'text',     'zero_or_one', 'standard', false, true,  true,  false, false,  80),
    ('icon_key',       'icon_key',       'Icon',            'string',          'text',     'zero_or_one', 'standard', false, false, false, false, false,  85),
    ('color_token',    'color_token',    'Color',           'string',          'text',     'zero_or_one', 'standard', false, false, false, false, false,  86),
    ('sort_order',     'sort_order',     'Sort Order',      'integer',         'number',   'one',         'standard', true,  false, true,  false, false,  87),
    ('metadata',       'metadata',       'Metadata',        'jsonb',           'json',     'one',         'system',   true,  false, false, false, false,  88),
    ('status',         'status',         'Status',          'lifecycle_state', 'select',   'one',         'standard', true,  true,  true,  false, false,  90),
    ('is_active',      'is_active',      'Active',          'boolean',         'checkbox', 'one',         'system',   true,  true,  true,  false, true,  100),
    ('status_changed_at','status_changed_at','Status Changed At','timestamptz','datetime','zero_or_one', 'system',   false, false, true,  false, true,  110),
    ('status_changed_by','status_changed_by','Status Changed By','uuid',       'hidden',   'zero_or_one', 'system',   false, false, false, false, true,  120),
    ('created_at',     'created_at',     'Created At',      'timestamptz',     'datetime', 'one',         'system',   true,  false, true,  false, true,  130),
    ('created_by',     'created_by',     'Created By',      'uuid',            'hidden',   'one',         'system',   true,  false, false, false, true,  140),
    ('updated_at',     'updated_at',     'Updated At',      'timestamptz',     'datetime', 'zero_or_one', 'system',   false, false, true,  false, true,  150),
    ('updated_by',     'updated_by',     'Updated By',      'uuid',            'hidden',   'zero_or_one', 'system',   false, false, false, false, true,  160)
) AS f(name, column_name, label, data_type, ui_type, cardinality, origin,
       is_required, is_filterable, is_sortable, is_searchable, is_read_only, sort_order)
WHERE e.entity_code = 'accounting_profile' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

UPDATE control.entity
SET slug = 'accounting-profile',
    display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       jsonb_build_array('code','name','direction','subledger_type','status'),
        'default_sort_field', 'name',
        'default_sort_order', 'asc',
        'code_field',         'code',
        'title_field',        'name'
    ),
    search_config = jsonb_build_object(
        'enabled', true,
        'fields', jsonb_build_array('code','name','description'),
        'rank', jsonb_build_object('code', 10, 'name', 5, 'description', 1),
        'min_query_length', 1,
        'operator', 'contains'
    ),
    identity_config = jsonb_build_object(
        'primary_key_field', 'id',
        'business_key_fields', jsonb_build_array('code'),
        'natural_key_fields', jsonb_build_array('code')
    ),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE entity_code = 'accounting_profile' AND tenant_id IS NULL;

UPDATE control.entity_version ev
SET version_hash = encode(sha256(convert_to(
        jsonb_build_object(
            'version', jsonb_build_object(
                'id', ev.id,
                'entity_id', ev.entity_id,
                'version_no', ev.version_no,
                'behaviors', ev.behaviors
            ),
            'entity', jsonb_build_object(
                'entity_code', e.entity_code,
                'name', e.name,
                'slug', e.slug,
                'entity_class', e.entity_class,
                'table_schema', e.table_schema,
                'table_name', e.table_name,
                'backing_type', e.backing_type
            ),
            'fields', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', ef.id,
                        'name', ef.name,
                        'column_name', ef.column_name,
                        'label', ef.label,
                        'data_type', ef.data_type,
                        'ui_type', ef.ui_type,
                        'cardinality', ef.cardinality,
                        'origin', ef.origin,
                        'is_required', ef.is_required,
                        'is_searchable', ef.is_searchable,
                        'is_filterable', ef.is_filterable,
                        'is_sortable', ef.is_sortable,
                        'is_read_only', ef.is_read_only,
                        'validation', ef.validation,
                        'reference_config', ef.reference_config,
                        'sort_order', ef.sort_order
                    )
                    ORDER BY ef.sort_order, ef.name, ef.id
                )
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.tenant_id IS NULL
                  AND ef.is_active = true
            ), '[]'::jsonb)
        )::text,
        'UTF8'
    )), 'hex'),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE ev.entity_id = e.id
  AND ev.tenant_id IS NULL
  AND e.tenant_id IS NULL
  AND e.entity_code = 'accounting_profile'
  AND ev.version_no = 1;
