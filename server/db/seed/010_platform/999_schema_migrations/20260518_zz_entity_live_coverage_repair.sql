-- Live entity metadata coverage repair.
--
-- Scope rule:
--   tenant_id IS NULL = platform standard metadata, safe for seed repair.
--   tenant_id IS NOT NULL = tenant override/customisation, never touched here.
--
-- Repairs:
--   * removes legacy entity columns now owned by identity_config
--   * aligns backing_type with the physical relation kind
--   * ensures platform version 1 rows exist
--   * inserts missing platform entity_field rows from information_schema,
--     including ordinary and partitioned tables
--   * fills any still-empty search_config with a deterministic V1 contract

DO $$
DECLARE
    v_su                uuid := '00000000-0000-0000-0000-000000000000';
    v_entity_rows       integer := 0;
    v_backing_rows      integer := 0;
    v_version_rows      integer := 0;
    v_field_rows        integer := 0;
    v_legacy_field_rows integer := 0;
    v_search_rows       integer := 0;
BEGIN
    -- These moved to identity_config.numbering.enabled and
    -- identity_config.natural_key_fields.
    ALTER TABLE control.entity DROP COLUMN IF EXISTS numbering_active;
    ALTER TABLE control.entity DROP COLUMN IF EXISTS natural_key_fields;

    WITH rels AS (
        SELECT
            n.nspname AS table_schema,
            c.relname AS table_name,
            CASE c.relkind
                WHEN 'r' THEN 'table'
                WHEN 'p' THEN 'table'
                WHEN 'v' THEN 'view'
                WHEN 'm' THEN 'materialized_view'
            END AS backing_type,
            CASE c.relkind
                WHEN 'r' THEN 'table'
                WHEN 'p' THEN 'table'
                WHEN 'v' THEN 'view'
                WHEN 'm' THEN 'materialized_view'
            END AS rel_kind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('control', 'document', 'master', 'shared')
          AND c.relkind IN ('r', 'p', 'v', 'm')
          AND c.relname NOT LIKE 'pg_%'
    ),
    missing AS (
        SELECT r.*
        FROM rels r
        WHERE NOT EXISTS (
            SELECT 1
            FROM control.entity e
            WHERE e.tenant_id IS NULL
              AND e.table_schema = r.table_schema
              AND e.table_name = r.table_name
        )
    ),
    classified AS (
        SELECT
            m.*,
            COALESCE(module_match.id::text, fnd.id::text, module_pick.module_code) AS module_id,
            upper(substr(m.table_schema, 1, 3) || substr(md5(m.table_schema || '.' || m.table_name), 1, 8)) AS entity_short,
            CASE
                WHEN m.backing_type IN ('view', 'materialized_view') THEN 'AGGREGATE'
                WHEN m.table_schema = 'document'
                 AND (
                    m.table_name LIKE '%\_line' ESCAPE '\'
                    OR m.table_name LIKE '%\_lines' ESCAPE '\'
                    OR m.table_name LIKE '%\_item' ESCAPE '\'
                    OR m.table_name LIKE '%\_items' ESCAPE '\'
                    OR m.table_name LIKE '%\_distribution' ESCAPE '\'
                    OR m.table_name LIKE '%\_allocation' ESCAPE '\'
                    OR m.table_name LIKE '%\_reference' ESCAPE '\'
                    OR m.table_name LIKE '%\_link' ESCAPE '\'
                 ) THEN 'DOCUMENT_RELATION'
                WHEN m.table_schema = 'document' THEN 'DOCUMENT'
                WHEN m.table_schema = 'shared'
                 AND m.table_name IN (
                    'country', 'currency', 'language', 'locale', 'timezone',
                    'uom', 'state_region', 'commodity_code', 'industry_code',
                    'commodity_crosswalk', 'industry_crosswalk'
                 ) THEN 'REFERENCE'
                WHEN m.table_schema = 'shared' THEN 'CONTROL'
                WHEN m.table_schema = 'control'
                 AND (m.table_name LIKE '%\_log' ESCAPE '\' OR m.table_name LIKE '%\_history' ESCAPE '\') THEN 'LOG'
                WHEN m.table_schema = 'control' THEN 'CONTROL'
                ELSE 'MASTER'
            END AS entity_class,
            CASE m.table_schema
                WHEN 'control' THEN 'platform_critical'
                WHEN 'document' THEN 'tenant_critical'
                WHEN 'master' THEN 'operational'
                WHEN 'shared' THEN 'config'
                ELSE 'config'
            END AS security_tier,
            CASE m.table_schema
                WHEN 'control' THEN 'settings'
                WHEN 'document' THEN 'file-text'
                WHEN 'master' THEN 'database'
                WHEN 'shared' THEN 'globe-2'
                ELSE 'database'
            END AS icon_key,
            CASE m.table_schema
                WHEN 'control' THEN 'red'
                WHEN 'document' THEN 'blue'
                WHEN 'master' THEN 'slate'
                WHEN 'shared' THEN 'green'
                ELSE 'slate'
            END AS color_token,
            COALESCE((
                SELECT jsonb_agg(c.column_name ORDER BY
                    CASE c.column_name
                        WHEN 'code' THEN 1
                        WHEN 'name' THEN 2
                        WHEN 'slug' THEN 3
                        WHEN 'document_no' THEN 4
                        WHEN 'number' THEN 5
                        WHEN 'entity_code' THEN 6
                        WHEN 'permission_code' THEN 7
                        WHEN 'company_code' THEN 8
                        WHEN 'account_code' THEN 9
                        WHEN 'id' THEN 99
                        ELSE 50
                    END,
                    c.ordinal_position
                )
                FROM (
                    SELECT a.attname AS column_name, a.attnum AS ordinal_position
                    FROM pg_class rel
                    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
                    JOIN pg_attribute a ON a.attrelid = rel.oid
                    WHERE ns.nspname = m.table_schema
                      AND rel.relname = m.table_name
                      AND rel.relkind IN ('r', 'p', 'v', 'm')
                      AND a.attnum > 0
                      AND NOT a.attisdropped
                      AND (
                          a.attname IN (
                              'code', 'name', 'slug', 'document_no', 'number',
                              'entity_code', 'permission_code', 'id'
                          )
                          OR a.attname LIKE '%\_code' ESCAPE '\'
                      )
                    ORDER BY
                        CASE a.attname
                            WHEN 'code' THEN 1
                            WHEN 'name' THEN 2
                            WHEN 'slug' THEN 3
                            WHEN 'document_no' THEN 4
                            WHEN 'number' THEN 5
                            WHEN 'entity_code' THEN 6
                            WHEN 'permission_code' THEN 7
                            WHEN 'company_code' THEN 8
                            WHEN 'account_code' THEN 9
                            WHEN 'id' THEN 99
                            ELSE 50
                        END,
                        a.attnum
                    LIMIT 3
                ) c
            ), '[]'::jsonb) AS natural_key_fields
        FROM missing m
        CROSS JOIN LATERAL (
            SELECT CASE
                WHEN m.table_schema = 'document' THEN 'DOC'
                ELSE 'FND'
            END AS module_code
        ) module_pick
        LEFT JOIN shared.module module_match
          ON module_match.code = module_pick.module_code
        LEFT JOIN shared.module fnd
          ON fnd.code = 'FND'
    )
    INSERT INTO control.entity (
        tenant_id,
        module_id,
        name,
        slug,
        entity_short,
        entity_code,
        entity_class,
        ownership_model,
        kind,
        backing_type,
        governance_level,
        security_tier,
        mutability,
        table_schema,
        table_name,
        label_singular,
        label_plural,
        icon_key,
        color_token,
        feature_flags,
        display_config,
        identity_config,
        status,
        created_by,
        updated_by
    )
    SELECT
        NULL::uuid,
        c.module_id,
        c.table_name,
        replace(lower(c.table_name), '_', '-'),
        c.entity_short,
        c.table_name,
        c.entity_class,
        'system',
        'ent',
        c.backing_type,
        'audit_only',
        c.security_tier,
        'locked',
        c.table_schema,
        c.table_name,
        initcap(replace(c.table_name, '_', ' ')),
        initcap(replace(c.table_name, '_', ' ')) || ' Metadata',
        c.icon_key,
        c.color_token,
        jsonb_build_object(
            'metadata_coverage_source', 'live_coverage_repair',
            'metadata_coverage_schema', c.table_schema,
            'metadata_coverage_relation_kind', c.rel_kind,
            'is_readonly', true,
            'is_hidden', true,
            'is_exportable', false,
            'is_importable', false,
            'generic_runtime_disabled', true,
            'records_api_disabled', true
        ),
        jsonb_build_object(
            'coverage_mode', 'governed_metadata',
            'list_renderer', 'metadata',
            'detail_renderer', 'readOnly',
            'readOnly', true,
            'hidden', true
        ),
        jsonb_build_object('natural_key_fields', c.natural_key_fields),
        'ACTIVE',
        v_su,
        v_su
    FROM classified c
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    GET DIAGNOSTICS v_entity_rows = ROW_COUNT;

    WITH rel_natural_keys AS (
        SELECT
            ns.nspname AS table_schema,
            rel.relname AS table_name,
            COALESCE(jsonb_agg(c.column_name ORDER BY c.rank_order, c.ordinal_position), '[]'::jsonb) AS natural_key_fields
        FROM pg_class rel
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        CROSS JOIN LATERAL (
            SELECT
                a.attname AS column_name,
                a.attnum AS ordinal_position,
                CASE a.attname
                    WHEN 'code' THEN 1
                    WHEN 'name' THEN 2
                    WHEN 'slug' THEN 3
                    WHEN 'document_no' THEN 4
                    WHEN 'number' THEN 5
                    WHEN 'entity_code' THEN 6
                    WHEN 'permission_code' THEN 7
                    WHEN 'company_code' THEN 8
                    WHEN 'account_code' THEN 9
                    WHEN 'id' THEN 99
                    ELSE 50
                END AS rank_order
            FROM pg_attribute a
            WHERE a.attrelid = rel.oid
              AND a.attnum > 0
              AND NOT a.attisdropped
              AND (
                  a.attname IN (
                      'code', 'name', 'slug', 'document_no', 'number',
                      'entity_code', 'permission_code', 'id'
                  )
                  OR a.attname LIKE '%\_code' ESCAPE '\'
              )
            ORDER BY rank_order, a.attnum
            LIMIT 3
        ) c
        WHERE ns.nspname IN ('control', 'document', 'master', 'shared')
          AND rel.relkind IN ('r', 'p', 'v', 'm')
          AND rel.relname NOT LIKE 'pg_%'
        GROUP BY ns.nspname, rel.relname
    )
    UPDATE control.entity e
       SET identity_config = jsonb_set(
               COALESCE(e.identity_config, '{}'::jsonb),
               '{natural_key_fields}',
               nk.natural_key_fields,
               true
           ),
           updated_at = now(),
           updated_by = v_su
      FROM rel_natural_keys nk
     WHERE e.tenant_id IS NULL
       AND e.table_schema = nk.table_schema
       AND e.table_name = nk.table_name
       AND jsonb_array_length(nk.natural_key_fields) > 0
       AND CASE
           WHEN jsonb_typeof(COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields') = 'array'
           THEN jsonb_array_length(COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields')
           ELSE 0
       END = 0;

    WITH rels AS (
        SELECT
            n.nspname AS table_schema,
            c.relname AS table_name,
            CASE c.relkind
                WHEN 'r' THEN 'table'
                WHEN 'p' THEN 'table'
                WHEN 'v' THEN 'view'
                WHEN 'm' THEN 'materialized_view'
            END AS backing_type
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('control', 'document', 'master', 'shared')
          AND c.relkind IN ('r', 'p', 'v', 'm')
          AND c.relname NOT LIKE 'pg_%'
    )
    UPDATE control.entity e
       SET backing_type = r.backing_type,
           updated_at = now(),
           updated_by = v_su
      FROM rels r
     WHERE e.tenant_id IS NULL
       AND e.table_schema = r.table_schema
       AND e.table_name = r.table_name
       AND e.backing_type IS DISTINCT FROM r.backing_type;

    GET DIAGNOSTICS v_backing_rows = ROW_COUNT;

    INSERT INTO control.entity_version (
        entity_id,
        tenant_id,
        version_no,
        status,
        label,
        change_type,
        effective_from,
        created_by,
        updated_by
    )
    SELECT
        e.id,
        NULL::uuid,
        1,
        'EFFECTIVE',
        'Initial Version',
        'structural',
        now(),
        v_su,
        v_su
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.table_schema IN ('control', 'document', 'master', 'shared')
    ON CONFLICT (entity_id, version_no) DO UPDATE
    SET
        status = 'EFFECTIVE',
        effective_from = COALESCE(control.entity_version.effective_from, EXCLUDED.effective_from),
        updated_at = now(),
        updated_by = v_su
    WHERE control.entity_version.tenant_id IS NULL
      AND (
          control.entity_version.status IS DISTINCT FROM 'EFFECTIVE'
          OR control.entity_version.effective_from IS NULL
      );

    GET DIAGNOSTICS v_version_rows = ROW_COUNT;

    WITH rels AS (
        SELECT
            n.nspname AS table_schema,
            c.relname AS table_name,
            CASE c.relkind
                WHEN 'r' THEN 'table'
                WHEN 'p' THEN 'table'
                WHEN 'v' THEN 'view'
                WHEN 'm' THEN 'materialized_view'
            END AS rel_kind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('control', 'document', 'master', 'shared')
          AND c.relkind IN ('r', 'p', 'v', 'm')
          AND c.relname NOT LIKE 'pg_%'
    ),
    entity_scope AS (
        SELECT
            e.id AS entity_id,
            e.table_schema,
            e.table_name,
            r.rel_kind,
            ev.id AS entity_version_id
        FROM control.entity e
        JOIN rels r
          ON r.table_schema = e.table_schema
         AND r.table_name = e.table_name
        JOIN control.entity_version ev
          ON ev.entity_id = e.id
         AND ev.tenant_id IS NULL
         AND ev.version_no = 1
        WHERE e.tenant_id IS NULL
          AND e.table_schema IN ('control', 'document', 'master', 'shared')
    ),
    physical_columns AS (
        SELECT
            es.entity_version_id,
            es.rel_kind,
            c.column_name,
            c.data_type,
            c.udt_name,
            c.is_nullable,
            c.is_generated,
            c.column_default,
            c.character_maximum_length,
            c.ordinal_position,
            CASE
                WHEN c.column_name = 'status' THEN 'lifecycle_state'
                WHEN c.udt_name = 'uuid' THEN 'uuid'
                WHEN c.data_type IN ('smallint', 'integer') THEN 'integer'
                WHEN c.data_type = 'bigint' THEN 'bigint'
                WHEN c.data_type IN ('numeric', 'decimal') THEN 'decimal'
                WHEN c.data_type = 'money' THEN 'money'
                WHEN c.data_type = 'boolean' THEN 'boolean'
                WHEN c.data_type = 'date' THEN 'date'
                WHEN c.data_type = 'timestamp with time zone' THEN 'timestamptz'
                WHEN c.data_type = 'timestamp without time zone' THEN 'datetime'
                WHEN c.data_type = 'jsonb' THEN 'jsonb'
                WHEN c.data_type = 'json' THEN 'json'
                WHEN c.data_type = 'tsvector' THEN 'tsvector'
                WHEN c.data_type = 'ARRAY' AND c.udt_name = '_uuid' THEN 'uuid_array'
                WHEN c.data_type = 'ARRAY' AND c.udt_name IN ('_int2', '_int4', '_int8') THEN 'int_array'
                WHEN c.data_type = 'ARRAY' AND c.udt_name = '_jsonb' THEN 'jsonb_array'
                WHEN c.data_type = 'ARRAY' THEN 'text_array'
                WHEN c.data_type IN ('text', 'character varying', 'character') THEN 'text'
                WHEN c.data_type = 'USER-DEFINED' THEN 'enum'
                ELSE 'string'
            END AS field_data_type
        FROM entity_scope es
        JOIN LATERAL (
            SELECT
                a.attname AS column_name,
                CASE
                    WHEN t.typcategory = 'A' THEN 'ARRAY'
                    WHEN t.typtype = 'e' THEN 'USER-DEFINED'
                    WHEN t.typname = 'varchar' THEN 'character varying'
                    WHEN t.typname = 'bpchar' THEN 'character'
                    WHEN t.typname = 'int2' THEN 'smallint'
                    WHEN t.typname = 'int4' THEN 'integer'
                    WHEN t.typname = 'int8' THEN 'bigint'
                    WHEN t.typname = 'bool' THEN 'boolean'
                    WHEN t.typname = 'timestamptz' THEN 'timestamp with time zone'
                    WHEN t.typname = 'timestamp' THEN 'timestamp without time zone'
                    ELSE t.typname
                END AS data_type,
                t.typname AS udt_name,
                CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
                CASE WHEN COALESCE(a.attgenerated, '') <> '' THEN 'ALWAYS' ELSE 'NEVER' END AS is_generated,
                pg_get_expr(d.adbin, d.adrelid) AS column_default,
                CASE
                    WHEN a.atttypmod > 4 AND t.typname IN ('varchar', 'bpchar') THEN a.atttypmod - 4
                    ELSE NULL::integer
                END AS character_maximum_length,
                a.attnum AS ordinal_position
            FROM pg_class rel
            JOIN pg_namespace ns ON ns.oid = rel.relnamespace
            JOIN pg_attribute a ON a.attrelid = rel.oid
            JOIN pg_type t ON t.oid = a.atttypid
            LEFT JOIN pg_attrdef d ON d.adrelid = rel.oid AND d.adnum = a.attnum
            WHERE ns.nspname = es.table_schema
              AND rel.relname = es.table_name
              AND rel.relkind IN ('r', 'p', 'v', 'm')
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY a.attnum
        ) c ON true
    ),
    final_fields AS (
        SELECT
            pc.*,
            CASE
                WHEN pc.field_data_type = 'boolean'
                 AND pc.column_name !~ '^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)'
                    THEN 'is_' || pc.column_name
                ELSE pc.column_name
            END AS base_field_name,
            CASE
                WHEN pc.column_name IN (
                    'id', 'tenant_id', 'is_active',
                    'created_at', 'created_by',
                    'updated_at', 'updated_by',
                    'status_changed_at', 'status_changed_by',
                    'deleted_at', 'deleted_by',
                    'lock_version', 'row_version', 'xmin'
                ) THEN 'system'
                ELSE 'standard'
            END AS field_origin,
            CASE
                WHEN pc.column_name IN ('id', 'tenant_id')
                  OR pc.column_name IN ('created_by', 'updated_by', 'status_changed_by', 'deleted_by')
                  OR pc.field_data_type = 'tsvector' THEN 'hidden'
                WHEN pc.field_data_type = 'lifecycle_state' THEN 'status'
                WHEN pc.field_data_type = 'uuid' AND pc.column_name LIKE '%\_id' ESCAPE '\' THEN 'reference'
                WHEN pc.field_data_type IN ('integer', 'bigint', 'decimal', 'money') THEN 'number'
                WHEN pc.field_data_type = 'boolean' THEN 'checkbox'
                WHEN pc.field_data_type = 'date' THEN 'date'
                WHEN pc.field_data_type IN ('datetime', 'timestamptz') THEN 'datetime'
                WHEN pc.field_data_type = 'enum' THEN 'select'
                WHEN pc.field_data_type IN ('json', 'jsonb', 'text_array', 'uuid_array', 'int_array', 'jsonb_array') THEN 'json'
                ELSE 'text'
            END AS field_ui_type
        FROM physical_columns pc
    ),
    safe_fields AS (
        SELECT
            ff.*,
            CASE
                WHEN ff.base_field_name LIKE '%\_id' ESCAPE '\'
                 AND ff.field_data_type NOT IN ('uuid', 'reference', 'uuid_array', 'uuid[]')
                    THEN regexp_replace(ff.base_field_name, '_id$', '_identifier')
                ELSE ff.base_field_name
            END AS field_name
        FROM final_fields ff
    )
    INSERT INTO control.entity_field (
        entity_version_id,
        tenant_id,
        name,
        column_name,
        label,
        data_type,
        ui_type,
        cardinality,
        origin,
        is_required,
        is_filterable,
        is_sortable,
        is_searchable,
        is_read_only,
        is_computed,
        compute_mode,
        reference_config,
        validation,
        sort_order,
        created_by,
        updated_by
    )
    SELECT
        ff.entity_version_id,
        NULL::uuid,
        ff.field_name,
        ff.column_name,
        initcap(replace(ff.field_name, '_', ' ')),
        ff.field_data_type,
        ff.field_ui_type,
        CASE WHEN ff.is_nullable = 'NO' THEN 'one' ELSE 'zero_or_one' END,
        ff.field_origin,
        ff.is_nullable = 'NO',
        ff.field_data_type IN (
            'uuid', 'integer', 'bigint', 'decimal', 'money',
            'boolean', 'date', 'datetime', 'timestamptz',
            'text', 'string', 'enum', 'lifecycle_state'
        ),
        ff.field_data_type NOT IN (
            'json', 'jsonb', 'tsvector',
            'text_array', 'uuid_array', 'int_array', 'jsonb_array'
        ),
        ff.field_data_type IN ('text', 'string', 'enum', 'lifecycle_state')
          AND (
              ff.column_name IN (
                  'code', 'name', 'title', 'display_name', 'full_name',
                  'description', 'email', 'primary_email', 'entity_code',
                  'document_no', 'document_number', 'number', 'status',
                  'search_text', 'external_ref', 'external_reference'
              )
              OR ff.column_name LIKE '%\_name' ESCAPE '\'
              OR ff.column_name LIKE '%\_number' ESCAPE '\'
              OR ff.column_name LIKE '%\_code' ESCAPE '\'
          ),
        ff.rel_kind IN ('view', 'materialized_view')
          OR ff.field_origin = 'system'
          OR COALESCE(ff.is_generated, 'NEVER') <> 'NEVER',
        COALESCE(ff.is_generated, 'NEVER') <> 'NEVER',
        CASE
            WHEN COALESCE(ff.is_generated, 'NEVER') <> 'NEVER' THEN 'db_generated'
            ELSE NULL::text
        END,
        CASE
            WHEN ff.field_data_type = 'uuid' AND ff.column_name LIKE '%\_id' ESCAPE '\'
            THEN jsonb_build_object('ref_hint', regexp_replace(ff.column_name, '_id$', ''))
            ELSE NULL::jsonb
        END,
        CASE
            WHEN ff.character_maximum_length IS NOT NULL
            THEN jsonb_build_object('max_length', ff.character_maximum_length)
            ELSE NULL::jsonb
        END,
        least(ff.ordinal_position * 10, 32000)::smallint,
        v_su,
        v_su
    FROM safe_fields ff
    WHERE NOT EXISTS (
        SELECT 1
        FROM control.entity_field existing
        WHERE existing.entity_version_id = ff.entity_version_id
          AND (
              existing.name = ff.field_name
              OR existing.column_name = ff.column_name
          )
    )
    ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL
    DO NOTHING;

    GET DIAGNOSTICS v_field_rows = ROW_COUNT;

    DELETE FROM control.entity_field ef
    USING control.entity_version ev, control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id = e.id
      AND e.tenant_id IS NULL
      AND ev.tenant_id IS NULL
      AND e.table_schema = 'control'
      AND e.table_name = 'entity'
      AND ef.column_name IN ('numbering_active', 'natural_key_fields');

    GET DIAGNOSTICS v_legacy_field_rows = ROW_COUNT;

    WITH ranked_fields AS (
        SELECT
            e.id AS entity_id,
            ef.name,
            row_number() OVER (
                PARTITION BY e.id
                ORDER BY
                    CASE
                        WHEN ef.name = 'code' THEN 1
                        WHEN ef.name = 'document_no' THEN 2
                        WHEN ef.name = 'document_number' THEN 3
                        WHEN ef.name = 'number' THEN 4
                        WHEN ef.name = 'name' THEN 5
                        WHEN ef.name = 'display_name' THEN 6
                        WHEN ef.name = 'title' THEN 7
                        WHEN ef.name = 'description' THEN 8
                        WHEN ef.name = 'search_text' THEN 9
                        WHEN ef.name = 'status' THEN 20
                        ELSE 50
                    END,
                    ef.sort_order,
                    ef.name
            ) AS rn
        FROM control.entity e
        JOIN control.entity_version ev
          ON ev.entity_id = e.id
         AND ev.tenant_id IS NULL
         AND ev.version_no = 1
        JOIN control.entity_field ef
          ON ef.entity_version_id = ev.id
         AND ef.is_active = true
        WHERE e.tenant_id IS NULL
          AND e.table_schema IN ('control', 'document', 'master', 'shared')
          AND (
              e.search_config = '{}'::jsonb
              OR jsonb_typeof(e.search_config) IS DISTINCT FROM 'object'
              OR NOT (e.search_config ? 'fields')
          )
          AND ef.data_type IN ('text', 'string', 'enum', 'lifecycle_state')
          AND COALESCE(ef.ui_type, '') <> 'hidden'
    ),
    picked_fields AS (
        SELECT entity_id, name, rn
        FROM ranked_fields
        WHERE rn <= 3
    ),
    search_shapes AS (
        SELECT
            entity_id,
            jsonb_build_object(
                'enabled', true,
                'fields', jsonb_agg(name ORDER BY rn),
                'rank', jsonb_object_agg(
                    name,
                    CASE rn WHEN 1 THEN 10 WHEN 2 THEN 5 ELSE 1 END
                    ORDER BY rn
                ),
                'min_query_length', 1,
                'operator', 'contains'
            ) AS search_config
        FROM picked_fields
        GROUP BY entity_id
    )
    UPDATE control.entity e
       SET search_config = COALESCE(
               ss.search_config,
               jsonb_build_object(
                   'enabled', false,
                   'fields', jsonb_build_array(),
                   'rank', '{}'::jsonb,
                   'min_query_length', 1,
                   'operator', 'contains'
               )
           ),
           updated_at = now(),
           updated_by = v_su
      FROM control.entity target
      LEFT JOIN search_shapes ss
        ON ss.entity_id = target.id
     WHERE e.id = target.id
       AND target.tenant_id IS NULL
       AND target.table_schema IN ('control', 'document', 'master', 'shared')
       AND (
           target.search_config = '{}'::jsonb
           OR jsonb_typeof(target.search_config) IS DISTINCT FROM 'object'
           OR NOT (target.search_config ? 'fields')
       );

    GET DIAGNOSTICS v_search_rows = ROW_COUNT;

    RAISE NOTICE
        'Entity live coverage repair: entities %, backing %, versions %, fields inserted %, legacy fields deleted %, search configs %',
        v_entity_rows,
        v_backing_rows,
        v_version_rows,
        v_field_rows,
        v_legacy_field_rows,
        v_search_rows;
END $$;
