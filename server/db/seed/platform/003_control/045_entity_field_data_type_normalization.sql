-- Final metadata field type normalization.
-- Explicit legacy field seeds still contain a few historical aliases. Normalize
-- them after all entity_field upserts so compiled descriptors use canonical
-- runtime data_type values.

WITH physical_columns AS (
    SELECT
        n.nspname AS table_schema,
        c.relname AS table_name,
        a.attname AS column_name,
        CASE
            WHEN t.typcategory = 'A' THEN 'ARRAY'
            WHEN t.typname = 'int2' THEN 'smallint'
            WHEN t.typname = 'int4' THEN 'integer'
            WHEN t.typname = 'int8' THEN 'bigint'
            WHEN t.typname = 'float4' THEN 'real'
            WHEN t.typname = 'float8' THEN 'double precision'
            WHEN t.typname = 'bool' THEN 'boolean'
            WHEN t.typname = 'timestamptz' THEN 'timestamp with time zone'
            WHEN t.typname = 'timestamp' THEN 'timestamp without time zone'
            WHEN t.typname = 'varchar' THEN 'character varying'
            WHEN t.typname = 'bpchar' THEN 'character'
            ELSE t.typname
        END AS pg_data_type,
        t.typname AS udt_name,
        CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
        pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
        CASE WHEN a.attgenerated = '' THEN 'NEVER' ELSE 'ALWAYS' END AS is_generated,
        a.attnum AS ordinal_position
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    JOIN pg_attribute a
      ON a.attrelid = c.oid
     AND a.attnum > 0
     AND NOT a.attisdropped
    JOIN pg_type t
      ON t.oid = a.atttypid
    LEFT JOIN pg_attrdef ad
      ON ad.adrelid = a.attrelid
     AND ad.adnum = a.attnum
    WHERE c.relkind IN ('r', 'p', 'v', 'm')
      AND n.nspname IN (
          'aggregate',
          'control',
          'document',
          'event',
          'governance',
          'ledger',
          'log',
          'master',
          'public',
          'shared',
          'snapshot'
      )
),
missing_cols AS (
    SELECT
        e.id AS entity_id,
        e.entity_code,
        e.table_schema,
        e.table_name,
        e.backing_type,
        COALESCE(e.feature_flags ->> 'metadata_coverage_source', '') AS metadata_coverage_source,
        ev.id AS entity_version_id,
        pc.column_name,
        pc.pg_data_type,
        pc.udt_name,
        pc.is_nullable,
        pc.column_default,
        pc.is_generated,
        pc.ordinal_position
    FROM control.entity e
    JOIN control.entity_version ev
      ON ev.entity_id = e.id
     AND ev.version_no = 1
     AND ev.status = 'EFFECTIVE'
    JOIN physical_columns pc
      ON pc.table_schema = e.table_schema
     AND pc.table_name = e.table_name
    WHERE e.tenant_id IS NULL
      AND e.table_schema IN (
          'aggregate',
          'control',
          'document',
          'event',
          'governance',
          'ledger',
          'log',
          'master',
          'public',
          'shared',
          'snapshot'
      )
      AND pc.column_name ~ '^[a-z][a-z0-9_]*$'
      AND NOT EXISTS (
          SELECT 1
          FROM control.entity_field ef
          WHERE ef.entity_version_id = ev.id
            AND ef.column_name = pc.column_name
      )
),
typed AS (
    SELECT
        missing_cols.*,
        CASE
            WHEN udt_name = 'uuid' THEN 'uuid'
            WHEN pg_data_type IN ('integer', 'smallint') THEN 'integer'
            WHEN pg_data_type = 'bigint' THEN 'bigint'
            WHEN pg_data_type IN ('numeric', 'decimal', 'real', 'double precision') THEN 'decimal'
            WHEN pg_data_type = 'money' THEN 'money'
            WHEN pg_data_type = 'boolean'
             AND column_name ~ '^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)'
                THEN 'boolean'
            WHEN pg_data_type = 'boolean' THEN 'string'
            WHEN pg_data_type = 'date' THEN 'date'
            WHEN pg_data_type = 'timestamp with time zone' THEN 'timestamptz'
            WHEN pg_data_type = 'timestamp without time zone' THEN 'datetime'
            WHEN pg_data_type = 'jsonb' THEN 'jsonb'
            WHEN pg_data_type = 'json' THEN 'json'
            WHEN pg_data_type = 'tsvector' THEN 'tsvector'
            WHEN pg_data_type = 'ARRAY' AND udt_name = '_uuid' THEN 'uuid_array'
            WHEN pg_data_type = 'ARRAY' AND udt_name IN ('_int2', '_int4', '_int8') THEN 'int_array'
            WHEN pg_data_type = 'ARRAY' AND udt_name = '_jsonb' THEN 'jsonb_array'
            WHEN pg_data_type = 'ARRAY' THEN 'text_array'
            WHEN pg_data_type = 'text' THEN 'text'
            ELSE 'string'
        END AS field_data_type
    FROM missing_cols
)
INSERT INTO control.entity_field (
    entity_version_id,
    name,
    column_name,
    label,
    data_type,
    ui_type,
    cardinality,
    origin,
    is_required,
    is_searchable,
    is_filterable,
    is_sortable,
    is_read_only,
    validation,
    sort_order,
    created_by,
    updated_by
)
SELECT
    entity_version_id,
    column_name,
    column_name,
    initcap(replace(column_name, '_', ' ')),
    field_data_type,
    CASE
        WHEN column_name IN ('id', 'tenant_id', 'created_by', 'updated_by', 'status_changed_by', 'deleted_by')
          OR field_data_type = 'tsvector'
            THEN 'hidden'
        WHEN column_name LIKE '%\_id' ESCAPE '\' AND field_data_type = 'uuid' THEN 'reference'
        WHEN column_name = 'status' THEN 'select'
        WHEN field_data_type IN ('integer', 'bigint', 'decimal', 'numeric', 'money') THEN 'number'
        WHEN field_data_type = 'boolean' THEN 'checkbox'
        WHEN field_data_type = 'date' THEN 'date'
        WHEN field_data_type IN ('datetime', 'timestamptz') THEN 'datetime'
        WHEN field_data_type IN ('json', 'jsonb', 'text_array', 'uuid_array', 'int_array', 'jsonb_array') THEN 'json'
        WHEN field_data_type = 'text' THEN 'textarea'
        ELSE 'text'
    END,
    CASE
        WHEN field_data_type IN ('text_array', 'uuid_array', 'int_array', 'jsonb_array') THEN 'many'
        WHEN is_nullable = 'YES' THEN 'zero_or_one'
        ELSE 'one'
    END,
    CASE
        WHEN column_name IN (
            'id', 'tenant_id', 'is_active', 'created_at', 'created_by',
            'updated_at', 'updated_by', 'status_changed_at',
            'status_changed_by', 'deleted_at', 'deleted_by',
            'row_version', 'xmin'
        ) THEN 'system'
        ELSE 'standard'
    END,
    (
        is_nullable = 'NO'
        AND column_default IS NULL
        AND is_generated = 'NEVER'
        AND backing_type <> 'view'
        AND metadata_coverage_source <> 'governed_schema_coverage'
    ),
    (
        field_data_type IN ('string', 'text')
        AND column_name IN ('code', 'name', 'slug', 'document_no', 'number', 'title', 'description')
    ),
    (
        column_name IN ('id', 'tenant_id', 'code', 'name', 'status', 'created_at', 'updated_at')
        OR column_name LIKE '%\_id' ESCAPE '\'
        OR column_name LIKE '%\_code' ESCAPE '\'
        OR column_name LIKE '%\_type' ESCAPE '\'
        OR column_name LIKE '%\_status' ESCAPE '\'
    ),
    field_data_type NOT IN ('json', 'jsonb', 'text_array', 'uuid_array', 'int_array', 'jsonb_array', 'tsvector'),
    (
        backing_type = 'view'
        OR metadata_coverage_source = 'governed_schema_coverage'
        OR column_name IN ('id', 'tenant_id', 'created_at', 'created_by', 'updated_at', 'updated_by')
        OR is_generated <> 'NEVER'
    ),
    CASE
        WHEN field_data_type = 'uuid' AND column_name LIKE '%\_id' ESCAPE '\'
            THEN jsonb_build_object('ref_hint', regexp_replace(column_name, '_id$', ''))
        ELSE NULL::jsonb
    END,
    LEAST((ordinal_position * 10), 32760)::smallint,
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000'
FROM typed
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO NOTHING;

UPDATE control.entity_field ef
SET
    data_type = CASE
        WHEN ic.udt_name = '_uuid' THEN 'uuid_array'
        WHEN ic.udt_name IN ('_int2', '_int4', '_int8') THEN 'int_array'
        WHEN ic.udt_name = '_jsonb' THEN 'jsonb_array'
        ELSE 'text_array'
    END,
    ui_type = CASE
        WHEN ef.ui_type IS NULL OR ef.ui_type IN ('text', 'input') THEN 'json'
        ELSE ef.ui_type
    END,
    cardinality = 'many',
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e
  ON e.id = ev.entity_id
JOIN information_schema.columns ic
  ON ic.table_schema = e.table_schema
 AND ic.table_name = e.table_name
WHERE ef.entity_version_id = ev.id
  AND ef.column_name = ic.column_name
  AND ic.data_type = 'ARRAY'
  AND ef.data_type = 'array';

UPDATE control.entity_field
SET
    data_type = 'datetime',
    ui_type = CASE
        WHEN ui_type IS NULL OR ui_type IN ('text', 'input') THEN 'datetime'
        ELSE ui_type
    END,
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE data_type = 'timestamp';

UPDATE control.entity_field
SET
    data_type = CASE
        WHEN enum_domain_code IS NOT NULL THEN 'enum'
        ELSE 'string'
    END,
    ui_type = CASE
        WHEN enum_domain_code IS NOT NULL AND (ui_type IS NULL OR ui_type IN ('text', 'input')) THEN 'select'
        WHEN enum_domain_code IS NULL AND ui_type IS NULL THEN 'lookup_chooser'
        ELSE ui_type
    END,
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE data_type = 'lookup';

-- Legacy AP/master seeds used array aliases before runtime data types were
-- standardized. Keep those repairs in the final normalization owner.
UPDATE control.entity_field ef
SET
    data_type = 'text_array',
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e
  ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND ef.column_name IN ('aliases', 'business_types')
  AND ef.data_type IN ('text[]', 'enum[]')
  AND e.table_schema = 'master'
  AND e.table_name IN ('supplier', 'customer', 'legal_entity')
  AND e.tenant_id IS NULL
  AND ev.version_no = 1;

-- Hierarchy/grouping metadata belongs with final field normalization because it
-- depends on the settled entity_field rows and their canonical data types.
UPDATE control.entity_field ef
SET
    is_groupable = true,
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e
  ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND ef.is_active = true
  AND ef.is_sortable = true
  AND ef.is_groupable = false
  AND (
      (
          ef.name LIKE 'level%'
          AND ef.data_type IN ('integer', 'smallint', 'number')
      )
      OR (
          ef.name = 'parent_code'
          AND ef.data_type = 'text'
      )
  );

WITH gl_account_parent_reference AS (
    SELECT jsonb_build_object(
        'target_entity', 'gl_account',
        'target_field', 'id',
        'display_field', 'name',
        'display_format', 'code_label',
        'picker', jsonb_build_object(
            'code_field', 'code',
            'show_code', true
        )
    ) AS reference_config
)
UPDATE control.entity_field ef
SET
    is_groupable = true,
    reference_config = cfg.reference_config,
    validation = COALESCE(ef.validation, '{}'::jsonb)
                 || jsonb_build_object('ref_entity', 'gl_account'),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e
  ON e.id = ev.entity_id
CROSS JOIN gl_account_parent_reference cfg
WHERE ef.entity_version_id = ev.id
  AND e.tenant_id IS NULL
  AND e.entity_code = 'gl_account'
  AND ev.version_no = 1
  AND ef.is_active = true
  AND ef.name = 'parent_id'
  AND (
      ef.is_groupable = false
      OR ef.reference_config IS DISTINCT FROM cfg.reference_config
      OR COALESCE(ef.validation->>'ref_entity', '') IS DISTINCT FROM 'gl_account'
  );

-- Invalidate compiled descriptors whose field payload no longer matches the
-- active control.entity_field rows. snapshot.entity_compiled is append-only at
-- runtime, so seeds temporarily disable the immutability triggers for this
-- metadata repair path; the server startup compiler will repopulate rows.
DO $$
DECLARE
    v_overlay_deleted integer := 0;
    v_compiled_deleted integer := 0;
BEGIN
    EXECUTE 'ALTER TABLE snapshot.entity_compiled_overlay DISABLE TRIGGER trg_eco_immutable';
    EXECUTE 'ALTER TABLE snapshot.entity_compiled DISABLE TRIGGER trg_ec_immutable';

    DELETE FROM snapshot.entity_compiled_overlay eco
    WHERE eco.entity_version_id IN (
        SELECT ev.id
        FROM snapshot.entity_compiled ec
        JOIN control.entity_version ev
          ON ev.id = ec.entity_version_id
        JOIN control.entity e
          ON e.id = ev.entity_id
        LEFT JOIN LATERAL (
            SELECT count(*)::integer AS active_field_count
            FROM control.entity_field ef
            WHERE ef.entity_version_id = ev.id
              AND ef.is_active = true
        ) fc ON true
        WHERE e.tenant_id IS NULL
          AND e.status = 'ACTIVE'
          AND jsonb_array_length(COALESCE(ec.compiled_json -> 'fields', '[]'::jsonb)) <> fc.active_field_count
    );
    GET DIAGNOSTICS v_overlay_deleted = ROW_COUNT;

    DELETE FROM snapshot.entity_compiled ec
    WHERE ec.entity_version_id IN (
        SELECT ev.id
        FROM control.entity_version ev
        JOIN control.entity e
          ON e.id = ev.entity_id
        LEFT JOIN LATERAL (
            SELECT count(*)::integer AS active_field_count
            FROM control.entity_field ef
            WHERE ef.entity_version_id = ev.id
              AND ef.is_active = true
        ) fc ON true
        WHERE e.tenant_id IS NULL
          AND e.status = 'ACTIVE'
          AND ec.entity_version_id = ev.id
          AND jsonb_array_length(COALESCE(ec.compiled_json -> 'fields', '[]'::jsonb)) <> fc.active_field_count
    );
    GET DIAGNOSTICS v_compiled_deleted = ROW_COUNT;

    EXECUTE 'ALTER TABLE snapshot.entity_compiled ENABLE TRIGGER trg_ec_immutable';
    EXECUTE 'ALTER TABLE snapshot.entity_compiled_overlay ENABLE TRIGGER trg_eco_immutable';

    RAISE NOTICE '045 compiled descriptor invalidation: % compiled rows, % overlay rows removed',
        v_compiled_deleted,
        v_overlay_deleted;
EXCEPTION WHEN OTHERS THEN
    EXECUTE 'ALTER TABLE snapshot.entity_compiled ENABLE TRIGGER trg_ec_immutable';
    EXECUTE 'ALTER TABLE snapshot.entity_compiled_overlay ENABLE TRIGGER trg_eco_immutable';
    RAISE;
END $$;
