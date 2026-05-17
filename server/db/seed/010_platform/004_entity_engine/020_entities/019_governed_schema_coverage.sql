-- Registers any physical relation in governed platform schemas that does not
-- already have a curated control.entity row. These rows are metadata coverage
-- only: they are hidden, locked, read-only, and disabled for the generic
-- records API. Curated entity rows are intentionally left untouched.
DO $$
DECLARE
    v_system_user uuid := '00000000-0000-0000-0000-000000000000';
    v_rows integer := 0;
    v_version_rows integer := 0;
BEGIN
    WITH rels AS (
        SELECT
            t.table_schema,
            t.table_name,
            'table'::text AS rel_kind
        FROM information_schema.tables t
        WHERE t.table_schema IN ('control', 'document', 'master', 'shared')
          AND t.table_type = 'BASE TABLE'

        UNION ALL

        SELECT
            v.table_schema,
            v.table_name,
            'view'::text AS rel_kind
        FROM information_schema.views v
        WHERE v.table_schema IN ('control', 'document', 'master', 'shared')
    ),
    missing AS (
        SELECT r.*
        FROM rels r
        WHERE NOT EXISTS (
            SELECT 1
            FROM control.entity e
            WHERE e.table_schema = r.table_schema
              AND e.table_name = r.table_name
        )
    ),
    classified AS (
        SELECT
            m.table_schema,
            m.table_name,
            m.rel_kind,
            COALESCE(module_match.id::text, fnd.id::text, module_pick.module_code) AS module_id,
            (m.table_schema || '_' || m.table_name) AS coverage_code,
            upper(substr(m.table_schema, 1, 3) || substr(md5(m.table_schema || '.' || m.table_name), 1, 8)) AS entity_short,
            CASE
                WHEN m.rel_kind = 'view' THEN 'AGGREGATE'
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
            CASE WHEN m.rel_kind = 'view' THEN 'view' ELSE 'table' END AS backing_type,
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
            ARRAY(
                SELECT c.column_name::text
                FROM information_schema.columns c
                WHERE c.table_schema = m.table_schema
                  AND c.table_name = m.table_name
                  AND c.column_name IN (
                      'code', 'name', 'slug', 'document_no', 'number',
                      'entity_code', 'permission_code', 'id'
                  )
                ORDER BY CASE c.column_name
                    WHEN 'code' THEN 1
                    WHEN 'name' THEN 2
                    WHEN 'slug' THEN 3
                    WHEN 'document_no' THEN 4
                    WHEN 'number' THEN 5
                    WHEN 'entity_code' THEN 6
                    WHEN 'permission_code' THEN 7
                    WHEN 'id' THEN 99
                    ELSE 50
                END
                LIMIT 2
            ) AS natural_key_fields
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
        natural_key_fields,
        status,
        created_by,
        updated_by
    )
    SELECT
        NULL::uuid,
        c.module_id,
        c.coverage_code,
        replace(c.coverage_code, '_', '-'),
        c.entity_short,
        c.coverage_code,
        c.entity_class,
        'system',
        'ent',
        c.backing_type,
        'audit_only',
        c.security_tier,
        'locked',
        c.table_schema,
        c.table_name,
        initcap(replace(c.coverage_code, '_', ' ')),
        initcap(replace(c.coverage_code, '_', ' ')) || ' Metadata',
        c.icon_key,
        c.color_token,
        jsonb_build_object(
            'metadata_coverage_source', 'governed_schema_coverage',
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
        c.natural_key_fields,
        'ACTIVE',
        v_system_user,
        v_system_user
    FROM classified c
    ON CONFLICT (table_schema, table_name) DO UPDATE
    SET
        module_id = EXCLUDED.module_id,
        slug = EXCLUDED.slug,
        entity_short = EXCLUDED.entity_short,
        entity_class = EXCLUDED.entity_class,
        backing_type = EXCLUDED.backing_type,
        governance_level = EXCLUDED.governance_level,
        security_tier = EXCLUDED.security_tier,
        mutability = EXCLUDED.mutability,
        label_singular = EXCLUDED.label_singular,
        label_plural = EXCLUDED.label_plural,
        icon_key = EXCLUDED.icon_key,
        color_token = EXCLUDED.color_token,
        feature_flags = control.entity.feature_flags || EXCLUDED.feature_flags,
        display_config = control.entity.display_config || EXCLUDED.display_config,
        natural_key_fields = EXCLUDED.natural_key_fields,
        updated_at = now(),
        updated_by = v_system_user
    WHERE control.entity.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage';

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE 'Governed schema coverage entity seed upserted % relation(s)', v_rows;

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
        e.tenant_id,
        1,
        'EFFECTIVE',
        'Initial governed metadata coverage version',
        'structural',
        now(),
        v_system_user,
        v_system_user
    FROM control.entity e
    WHERE e.ownership_model = 'system'
      AND e.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage'
    ON CONFLICT (entity_id, version_no) DO UPDATE
    SET
        status = 'EFFECTIVE',
        label = COALESCE(control.entity_version.label, EXCLUDED.label),
        change_type = COALESCE(control.entity_version.change_type, EXCLUDED.change_type),
        effective_from = COALESCE(control.entity_version.effective_from, now()),
        updated_at = now(),
        updated_by = v_system_user
    WHERE control.entity_version.status <> 'EFFECTIVE'
       OR control.entity_version.effective_from IS NULL;

    GET DIAGNOSTICS v_version_rows = ROW_COUNT;
    RAISE NOTICE 'Governed schema coverage entity seed upserted % version row(s)', v_version_rows;
END $$;
