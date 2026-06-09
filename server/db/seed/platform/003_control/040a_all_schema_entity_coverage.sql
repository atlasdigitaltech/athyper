-- Schema coverage seed for control.entity.
-- 040_entity.sql owns the curated business/runtime entity catalogue. This file
-- fills the remaining Neon schemas so every physical table/view has a metadata
-- entity and a version-1 scaffold.

WITH
constants AS (
    SELECT '00000000-0000-0000-0000-000000000000'::uuid AS system_user_id
),
relations AS (
    SELECT
        n.nspname AS table_schema,
        c.relname AS table_name,
        CASE
            WHEN c.relkind = 'm' THEN 'materialized_view'
            WHEN c.relkind = 'v' THEN 'view'
            ELSE 'table'
        END AS backing_type,
        CASE
            WHEN c.relkind IN ('v', 'm') THEN 'aggregate'
            ELSE 'ent'
        END AS kind
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
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
relation_columns AS (
    SELECT
        n.nspname AS table_schema,
        c.relname AS table_name,
        a.attname AS column_name,
        a.attnum AS ordinal_position
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    JOIN pg_attribute a
      ON a.attrelid = c.oid
     AND a.attnum > 0
     AND NOT a.attisdropped
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
missing_relations AS (
    SELECT r.*
    FROM relations r
    WHERE NOT EXISTS (
        SELECT 1
        FROM control.entity e
        WHERE e.tenant_id IS NULL
          AND e.table_schema = r.table_schema
          AND e.table_name = r.table_name
    )
      AND NOT EXISTS (
        SELECT 1
        FROM control.entity e
        WHERE e.tenant_id IS NULL
          AND e.entity_code = r.table_name
    )
),
classified AS (
    SELECT
        r.*,
        CASE
            WHEN r.table_schema = 'ledger' THEN 'LEDGER'
            WHEN r.table_schema = 'log' THEN 'LOG'
            WHEN r.table_schema = 'aggregate' OR r.backing_type IN ('view', 'materialized_view') THEN 'AGGREGATE'
            WHEN r.table_schema = 'document' THEN 'DOCUMENT'
            WHEN r.table_schema = 'shared' THEN 'REFERENCE'
            WHEN r.table_schema = 'master' THEN 'MASTER'
            ELSE 'CONTROL'
        END AS entity_class,
        CASE
            WHEN r.table_schema IN ('ledger', 'aggregate') OR r.backing_type IN ('view', 'materialized_view') THEN 'aggregate'
            ELSE r.kind
        END AS resolved_kind,
        CASE
            WHEN r.table_schema = 'document' THEN 'DOC'
            WHEN r.table_schema = 'ledger' THEN 'ACC'
            WHEN r.table_schema = 'governance' THEN 'GOV'
            WHEN r.table_schema = 'event' THEN 'ACT'
            WHEN r.table_schema = 'log' THEN 'OBS'
            ELSE 'FND'
        END AS module_code,
        upper(left(regexp_replace(r.table_name, '[^a-zA-Z0-9]', '', 'g'), 12)) AS entity_short,
        initcap(replace(r.table_name, '_', ' ')) AS label_singular,
        initcap(replace(r.table_name, '_', ' ')) || 's' AS label_plural,
        CASE
            WHEN r.table_schema = 'aggregate' THEN 'chart-no-axes-combined'
            WHEN r.table_schema = 'event' THEN 'radio-tower'
            WHEN r.table_schema = 'governance' THEN 'shield-check'
            WHEN r.table_schema = 'ledger' THEN 'book-open'
            WHEN r.table_schema = 'log' THEN 'scroll-text'
            WHEN r.table_schema = 'snapshot' THEN 'archive'
            WHEN r.backing_type IN ('view', 'materialized_view') THEN 'table-properties'
            ELSE 'database'
        END AS icon_key,
        CASE
            WHEN r.table_schema = 'aggregate' THEN 'indigo'
            WHEN r.table_schema = 'event' THEN 'cyan'
            WHEN r.table_schema = 'governance' THEN 'rose'
            WHEN r.table_schema = 'ledger' THEN 'emerald'
            WHEN r.table_schema = 'log' THEN 'slate'
            WHEN r.table_schema = 'snapshot' THEN 'amber'
            ELSE 'gray'
        END AS color_token,
        CASE
            WHEN r.table_schema IN ('control', 'event', 'log', 'snapshot', 'public') THEN 'platform_critical'
            WHEN r.table_schema IN ('document', 'governance', 'ledger') THEN 'tenant_critical'
            WHEN r.table_schema = 'shared' THEN 'config'
            ELSE 'operational'
        END AS security_tier
    FROM missing_relations r
),
column_config AS (
    SELECT
        c.*,
        COALESCE(NULLIF(ARRAY(
            SELECT col.column_name::text
            FROM relation_columns col
            WHERE col.table_schema = c.table_schema
              AND col.table_name = c.table_name
              AND col.column_name IN (
                  'code', 'name', 'slug', 'document_no', 'number',
                  'entity_code', 'record_id', 'id'
              )
            ORDER BY CASE col.column_name
                WHEN 'code' THEN 1
                WHEN 'name' THEN 2
                WHEN 'slug' THEN 3
                WHEN 'document_no' THEN 4
                WHEN 'number' THEN 5
                WHEN 'entity_code' THEN 6
                WHEN 'record_id' THEN 7
                WHEN 'id' THEN 99
                ELSE 50
            END
            LIMIT 3
        ), ARRAY[]::text[]), NULLIF(ARRAY(
            SELECT col.column_name::text
            FROM relation_columns col
            WHERE col.table_schema = c.table_schema
              AND col.table_name = c.table_name
            ORDER BY col.ordinal_position
            LIMIT 1
        ), ARRAY[]::text[]), ARRAY['id']::text[]) AS natural_key_fields,
        COALESCE(NULLIF(ARRAY(
            SELECT col.column_name::text
            FROM relation_columns col
            WHERE col.table_schema = c.table_schema
              AND col.table_name = c.table_name
              AND col.column_name IN (
                  'code', 'name', 'document_no', 'number', 'entity_code',
                  'status', 'created_at', 'updated_at', 'id'
              )
            ORDER BY CASE col.column_name
                WHEN 'code' THEN 1
                WHEN 'name' THEN 2
                WHEN 'document_no' THEN 3
                WHEN 'number' THEN 4
                WHEN 'entity_code' THEN 5
                WHEN 'status' THEN 6
                WHEN 'updated_at' THEN 7
                WHEN 'created_at' THEN 8
                WHEN 'id' THEN 99
                ELSE 50
            END
            LIMIT 8
        ), ARRAY[]::text[]), NULLIF(ARRAY(
            SELECT col.column_name::text
            FROM relation_columns col
            WHERE col.table_schema = c.table_schema
              AND col.table_name = c.table_name
            ORDER BY col.ordinal_position
            LIMIT 8
        ), ARRAY[]::text[]), ARRAY['id']::text[]) AS list_columns
    FROM classified c
),
resolved AS (
    SELECT
        cc.*,
        COALESCE(module_match.id::text, module_fallback.id::text, cc.module_code) AS module_id,
        jsonb_build_object(
            'list_renderer', 'master',
            'detail_renderer', 'master',
            'list_columns', to_jsonb(cc.list_columns),
            'code_field', cc.natural_key_fields[1],
            'title_field', cc.natural_key_fields[1],
            'default_sort_field', cc.list_columns[1],
            'default_sort_order', 'asc',
            'readOnly', true,
            'metadata_coverage', true
        ) AS display_config,
        jsonb_build_object(
            'natural_key_fields', to_jsonb(cc.natural_key_fields)
        ) AS identity_config
    FROM column_config cc
    LEFT JOIN shared.module module_match
      ON module_match.code = cc.module_code
    LEFT JOIN shared.module module_fallback
      ON module_fallback.code = 'FND'
),
inserted_entities AS (
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
        mapping_mode,
        table_schema,
        table_name,
        label_singular,
        label_plural,
        icon_key,
        color_token,
        display_config,
        feature_flags,
        data_policy,
        identity_config,
        search_config,
        concurrency_policy,
        status,
        created_by,
        updated_by
    )
    SELECT
        NULL::uuid,
        r.module_id,
        r.table_name,
        replace(lower(r.table_name), '_', '-'),
        r.entity_short,
        r.table_name,
        r.entity_class,
        'system',
        r.resolved_kind,
        r.backing_type,
        'standard',
        r.security_tier,
        'locked',
        'exclusive',
        r.table_schema,
        r.table_name,
        r.label_singular,
        r.label_plural,
        r.icon_key,
        r.color_token,
        r.display_config,
        jsonb_build_object(
            'metadata_coverage_source', 'governed_schema_coverage',
            'is_readonly', true,
            'comments_enabled', true,
            'has_attachments', true,
            'event_history', true
        ),
        '{}'::jsonb,
        r.identity_config,
        '{}'::jsonb,
        '{}'::jsonb,
        'ACTIVE',
        c.system_user_id,
        c.system_user_id
    FROM resolved r
    CROSS JOIN constants c
    RETURNING id, tenant_id
)
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
    'Initial Version',
    'structural',
    now(),
    c.system_user_id,
    c.system_user_id
FROM inserted_entities e
CROSS JOIN constants c
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- Repair rows inserted by earlier versions of this coverage seed. Materialized
-- views are not exposed consistently through information_schema.columns, so use
-- pg_catalog for the physical binding and display/identity defaults.
WITH
relations AS (
    SELECT
        n.nspname AS table_schema,
        c.relname AS table_name,
        CASE
            WHEN c.relkind = 'm' THEN 'materialized_view'
            WHEN c.relkind = 'v' THEN 'view'
            ELSE 'table'
        END AS backing_type
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
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
relation_columns AS (
    SELECT
        n.nspname AS table_schema,
        c.relname AS table_name,
        a.attname AS column_name,
        a.attnum AS ordinal_position
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    JOIN pg_attribute a
      ON a.attrelid = c.oid
     AND a.attnum > 0
     AND NOT a.attisdropped
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
column_config AS (
    SELECT
        r.*,
        COALESCE(NULLIF(ARRAY(
            SELECT col.column_name::text
            FROM relation_columns col
            WHERE col.table_schema = r.table_schema
              AND col.table_name = r.table_name
              AND col.column_name IN (
                  'code', 'name', 'slug', 'document_no', 'number',
                  'entity_code', 'record_id', 'id'
              )
            ORDER BY CASE col.column_name
                WHEN 'code' THEN 1
                WHEN 'name' THEN 2
                WHEN 'slug' THEN 3
                WHEN 'document_no' THEN 4
                WHEN 'number' THEN 5
                WHEN 'entity_code' THEN 6
                WHEN 'record_id' THEN 7
                WHEN 'id' THEN 99
                ELSE 50
            END
            LIMIT 3
        ), ARRAY[]::text[]), NULLIF(ARRAY(
            SELECT col.column_name::text
            FROM relation_columns col
            WHERE col.table_schema = r.table_schema
              AND col.table_name = r.table_name
            ORDER BY col.ordinal_position
            LIMIT 1
        ), ARRAY[]::text[]), ARRAY['id']::text[]) AS natural_key_fields,
        COALESCE(NULLIF(ARRAY(
            SELECT col.column_name::text
            FROM relation_columns col
            WHERE col.table_schema = r.table_schema
              AND col.table_name = r.table_name
              AND col.column_name IN (
                  'code', 'name', 'document_no', 'number', 'entity_code',
                  'status', 'created_at', 'updated_at', 'id'
              )
            ORDER BY CASE col.column_name
                WHEN 'code' THEN 1
                WHEN 'name' THEN 2
                WHEN 'document_no' THEN 3
                WHEN 'number' THEN 4
                WHEN 'entity_code' THEN 5
                WHEN 'status' THEN 6
                WHEN 'updated_at' THEN 7
                WHEN 'created_at' THEN 8
                WHEN 'id' THEN 99
                ELSE 50
            END
            LIMIT 8
        ), ARRAY[]::text[]), NULLIF(ARRAY(
            SELECT col.column_name::text
            FROM relation_columns col
            WHERE col.table_schema = r.table_schema
              AND col.table_name = r.table_name
            ORDER BY col.ordinal_position
            LIMIT 8
        ), ARRAY[]::text[]), ARRAY['id']::text[]) AS list_columns
    FROM relations r
)
UPDATE control.entity e
SET
    backing_type = cc.backing_type,
    kind = CASE
        WHEN e.table_schema IN ('ledger', 'aggregate') OR cc.backing_type IN ('view', 'materialized_view') THEN 'aggregate'
        ELSE e.kind
    END,
    entity_class = CASE
        WHEN e.table_schema = 'ledger' THEN 'LEDGER'
        WHEN e.table_schema = 'log' THEN 'LOG'
        WHEN e.table_schema = 'aggregate' OR cc.backing_type IN ('view', 'materialized_view') THEN 'AGGREGATE'
        WHEN e.table_schema = 'document' THEN 'DOCUMENT'
        WHEN e.table_schema = 'shared' THEN 'REFERENCE'
        WHEN e.table_schema = 'master' THEN 'MASTER'
        ELSE 'CONTROL'
    END,
    display_config = e.display_config || jsonb_build_object(
        'list_columns', to_jsonb(cc.list_columns),
        'code_field', cc.natural_key_fields[1],
        'title_field', cc.natural_key_fields[1],
        'default_sort_field', cc.list_columns[1],
        'default_sort_order', 'asc',
        'readOnly', true,
        'metadata_coverage', true
    ),
    identity_config = e.identity_config || jsonb_build_object(
        'natural_key_fields', to_jsonb(cc.natural_key_fields)
    ),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
FROM column_config cc
WHERE e.tenant_id IS NULL
  AND e.table_schema = cc.table_schema
  AND e.table_name = cc.table_name
  AND e.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage';

-- New all-schema coverage entities should participate in the same collaboration
-- affordances as the curated catalogue.
UPDATE control.entity
SET
    feature_flags = feature_flags || '{"comments_enabled":true,"has_attachments":true,"event_history":true}'::jsonb,
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE tenant_id IS NULL
  AND table_schema IN (
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
  );
