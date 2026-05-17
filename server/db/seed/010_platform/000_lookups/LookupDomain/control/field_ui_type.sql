-- LookupDomain/control/field_ui_type.sql
-- Lookup values for domain: entity_field.ui_type
-- Renderer hints consumed by the field-renderer registry and form engine.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- ── Core text inputs ─────────────────────────────────────────────────────
    ('text',            'Text',             'entity_field.ui_type',  10),
    ('textarea',        'Textarea',         'entity_field.ui_type',  11),
    ('email',           'Email',            'entity_field.ui_type',  12),
    ('phone',           'Phone',            'entity_field.ui_type',  13),
    ('url',             'URL',              'entity_field.ui_type',  14),
    -- ── Numeric / financial ──────────────────────────────────────────────────
    ('number',          'Number',           'entity_field.ui_type',  20),
    ('currency',        'Currency / Money', 'entity_field.ui_type',  21),
    ('percent',         'Percent',          'entity_field.ui_type',  22),
    -- ── Selection ────────────────────────────────────────────────────────────
    ('select',          'Select (enum)',     'entity_field.ui_type',  30),
    ('radio',           'Radio Group',      'entity_field.ui_type',  31),
    ('checkbox',        'Checkbox',         'entity_field.ui_type',  32),
    ('tags',            'Tags / Multi-select', 'entity_field.ui_type', 33),
    -- ── Date / time ──────────────────────────────────────────────────────────
    ('date',            'Date',             'entity_field.ui_type',  40),
    ('datetime',        'Date & Time',      'entity_field.ui_type',  41),
    -- ── Reference / picker ───────────────────────────────────────────────────
    ('reference',       'Reference (UUID)', 'entity_field.ui_type',  50),
    ('entity_chooser',  'Entity Chooser',   'entity_field.ui_type',  51),
    ('lookup_chooser',  'Lookup Chooser',   'entity_field.ui_type',  52),
    ('country',         'Country Picker',   'entity_field.ui_type',  53),
    ('currency_code',   'Currency Picker',  'entity_field.ui_type',  54),
    -- ── Structured / rich ────────────────────────────────────────────────────
    ('json',            'JSON Editor',      'entity_field.ui_type',  60),
    ('json_editor',     'JSON Editor (alt)','entity_field.ui_type',  61),
    ('code',            'Code Editor',      'entity_field.ui_type',  62),
    ('rich_text',       'Rich Text',        'entity_field.ui_type',  63),
    -- ── Status / lifecycle ───────────────────────────────────────────────────
    ('status',          'Status Badge',     'entity_field.ui_type',  70),
    -- ── Media / file ─────────────────────────────────────────────────────────
    ('image',           'Image',            'entity_field.ui_type',  80),
    ('file',            'File Upload',      'entity_field.ui_type',  81),
    ('color',           'Color Picker',     'entity_field.ui_type',  82),
    -- ── Hidden / computed ────────────────────────────────────────────────────
    ('hidden',          'Hidden',           'entity_field.ui_type',  90),
    ('computed',        'Computed Display', 'entity_field.ui_type',  91)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
