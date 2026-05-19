-- Derives read-only field metadata for governed schema coverage entities from
-- information_schema. These rows exist for governance/search/catalog purposes;
-- the backing records API is disabled by the entity feature flags.
DO $$
DECLARE
    v_system_user uuid := '00000000-0000-0000-0000-000000000000';
    v_version_rows integer := 0;
    v_field_rows integer := 0;
    v_deleted_rows integer := 0;
    v_display_rows integer := 0;
BEGIN
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

    WITH coverage_entities AS (
        SELECT
            e.id AS entity_id,
            e.entity_code,
            e.table_schema,
            e.table_name,
            e.backing_type,
            ev.id AS entity_version_id
        FROM control.entity e
        JOIN control.entity_version ev
          ON ev.entity_id = e.id
         AND ev.version_no = 1
        WHERE e.ownership_model = 'system'
          AND e.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage'
    ),
    cols AS (
        SELECT
            ce.*,
            c.column_name,
            c.data_type AS pg_data_type,
            c.udt_name,
            c.is_nullable,
            c.ordinal_position,
            (
                c.column_name ~* '(password|passwd|secret|token|credential|hash|salt|private_key|api_key|access_key|refresh_key|fingerprint)'
            ) AS is_sensitive
        FROM coverage_entities ce
        JOIN information_schema.columns c
          ON c.table_schema = ce.table_schema
         AND c.table_name = ce.table_name
    ),
    typed AS (
        SELECT
            cols.*,
            CASE
                WHEN udt_name = 'uuid' THEN 'uuid'
                WHEN pg_data_type IN ('integer', 'smallint') THEN 'integer'
                WHEN pg_data_type = 'bigint' THEN 'bigint'
                WHEN pg_data_type IN ('numeric', 'decimal') THEN 'decimal'
                WHEN pg_data_type = 'money' THEN 'money'
                WHEN pg_data_type = 'boolean' THEN 'boolean'
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
        FROM cols
    ),
    named AS (
        SELECT
            typed.*,
            CASE
                WHEN field_data_type = 'boolean'
                 AND column_name !~ '^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)'
                    THEN 'is_' || column_name
                ELSE column_name
            END AS boolean_safe_name
        FROM typed
    ),
    id_safe AS (
        SELECT
            named.*,
            CASE
                WHEN boolean_safe_name LIKE '%\_id' ESCAPE '\'
                 AND field_data_type NOT IN ('uuid', 'reference', 'uuid_array', 'uuid[]')
                    THEN regexp_replace(boolean_safe_name, '_id$', '_identifier')
                ELSE boolean_safe_name
            END AS generated_name
        FROM named
    ),
    collision_safe AS (
        SELECT
            id_safe.*,
            CASE
                WHEN count(*) OVER (PARTITION BY entity_version_id, generated_name) = 1
                    THEN generated_name
                WHEN field_data_type = 'boolean'
                 AND column_name ~ '^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)'
                    THEN generated_name || '_' || ordinal_position::text
                WHEN field_data_type = 'boolean'
                    THEN 'is_' || regexp_replace(column_name, '_id$', '_identifier') || '_flag'
                ELSE regexp_replace(column_name, '_id$', '_identifier') || '_field'
            END AS collision_safe_name
        FROM id_safe
    ),
    final_fields AS (
        SELECT
            collision_safe.*,
            CASE
                WHEN count(*) OVER (PARTITION BY entity_version_id, collision_safe_name) = 1
                    THEN collision_safe_name
                ELSE collision_safe_name || '_' || ordinal_position::text
            END AS field_name,
            CASE
                WHEN is_sensitive
                  OR column_name IN (
                    'id', 'tenant_id', 'created_by', 'updated_by',
                    'status_changed_by', 'deleted_by', 'row_version', 'xmin'
                  )
                  OR field_data_type = 'tsvector'
                    THEN 'hidden'
                WHEN field_data_type = 'uuid' AND column_name LIKE '%\_id' ESCAPE '\'
                    THEN 'reference'
                WHEN field_data_type IN ('integer', 'bigint', 'decimal', 'numeric', 'money')
                    THEN 'number'
                WHEN field_data_type = 'boolean' THEN 'checkbox'
                WHEN field_data_type = 'date' THEN 'date'
                WHEN field_data_type IN ('datetime', 'timestamptz') THEN 'datetime'
                WHEN field_data_type IN ('json', 'jsonb', 'text_array', 'uuid_array', 'int_array', 'jsonb_array')
                    THEN 'json'
                WHEN field_data_type = 'text' THEN 'textarea'
                ELSE 'text'
            END AS field_ui_type,
            CASE
                WHEN column_name IN (
                    'id', 'tenant_id', 'is_active', 'created_at', 'created_by',
                    'updated_at', 'updated_by', 'status_changed_at',
                    'status_changed_by', 'deleted_at', 'deleted_by',
                    'row_version', 'xmin'
                ) THEN 'system'
                ELSE 'standard'
            END AS field_origin
        FROM collision_safe
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
        is_filterable,
        is_sortable,
        is_searchable,
        is_read_only,
        is_computed,
        validation,
        visibility,
        editability,
        sort_order,
        created_by,
        updated_by
    )
    SELECT
        entity_version_id,
        field_name,
        column_name,
        initcap(replace(column_name, '_', ' ')),
        field_data_type,
        field_ui_type,
        CASE
            WHEN field_data_type IN ('text_array', 'uuid_array', 'int_array', 'jsonb_array') THEN 'many'
            WHEN is_nullable = 'NO' THEN 'one'
            ELSE 'zero_or_one'
        END,
        field_origin,
        is_nullable = 'NO'
            AND backing_type <> 'view'
            AND column_name NOT IN (
                'id', 'tenant_id', 'created_at', 'created_by',
                'updated_at', 'updated_by', 'status_changed_at',
                'status_changed_by', 'deleted_at', 'deleted_by',
                'row_version', 'xmin'
            ),
        NOT is_sensitive
            AND (
                column_name = ANY(ARRAY[
                    'tenant_id', 'code', 'name', 'status', 'is_active',
                    'entity_code', 'entity_type', 'record_id', 'created_at',
                    'updated_at'
                ])
                OR column_name LIKE '%\_id' ESCAPE '\'
                OR column_name LIKE '%\_code' ESCAPE '\'
                OR column_name LIKE '%\_type' ESCAPE '\'
                OR column_name LIKE '%\_status' ESCAPE '\'
            ),
        NOT is_sensitive
            AND field_data_type NOT IN ('json', 'jsonb', 'text_array', 'uuid_array', 'int_array', 'jsonb_array', 'tsvector')
            AND (
                column_name = ANY(ARRAY[
                    'code', 'name', 'status', 'is_active', 'created_at',
                    'updated_at', 'effective_from', 'effective_to',
                    'valid_from', 'valid_to', 'sort_order', 'display_order'
                ])
                OR column_name LIKE '%\_at' ESCAPE '\'
                OR column_name LIKE '%\_date' ESCAPE '\'
            ),
        NOT is_sensitive
            AND field_data_type IN ('string', 'text')
            AND (
                column_name = ANY(ARRAY[
                    'code', 'name', 'title', 'display_name', 'full_name',
                    'description', 'email', 'primary_email', 'entity_code',
                    'record_label', 'external_ref', 'external_reference'
                ])
                OR column_name LIKE '%\_name' ESCAPE '\'
                OR column_name LIKE '%\_number' ESCAPE '\'
            ),
        true,
        false,
        CASE
            WHEN field_data_type = 'uuid' AND column_name LIKE '%\_id' ESCAPE '\'
                THEN jsonb_build_object('ref_hint', regexp_replace(column_name, '_id$', ''))
            ELSE NULL::jsonb
        END,
        CASE
            WHEN is_sensitive OR field_ui_type = 'hidden'
                THEN jsonb_build_object('hidden', true, 'reason', 'governed_metadata_coverage')
            ELSE jsonb_build_object('hidden', false)
        END,
        jsonb_build_object('mode', 'readOnly', 'reason', 'governed_metadata_coverage'),
        least(ordinal_position * 10, 32000)::smallint,
        v_system_user,
        v_system_user
    FROM final_fields
    ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL
    DO UPDATE
    SET
        column_name = EXCLUDED.column_name,
        label = COALESCE(control.entity_field.label, EXCLUDED.label),
        data_type = EXCLUDED.data_type,
        ui_type = EXCLUDED.ui_type,
        cardinality = EXCLUDED.cardinality,
        origin = EXCLUDED.origin,
        is_required = EXCLUDED.is_required,
        is_filterable = EXCLUDED.is_filterable,
        is_sortable = EXCLUDED.is_sortable,
        is_searchable = EXCLUDED.is_searchable,
        is_read_only = true,
        is_write_once = false,
        is_computed = false,
        validation = COALESCE(control.entity_field.validation, EXCLUDED.validation),
        visibility = COALESCE(control.entity_field.visibility, EXCLUDED.visibility),
        editability = COALESCE(control.entity_field.editability, EXCLUDED.editability),
        sort_order = EXCLUDED.sort_order,
        updated_at = now(),
        updated_by = v_system_user;

    GET DIAGNOSTICS v_field_rows = ROW_COUNT;

    DELETE FROM control.entity_field ef
    USING control.entity_version ev, control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id = e.id
      AND e.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage'
      AND ef.column_name <> ''
      AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns ic
          WHERE ic.table_schema = e.table_schema
            AND ic.table_name = e.table_name
            AND ic.column_name = ef.column_name
      );

    GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

    UPDATE control.entity e
    SET
        display_config = COALESCE(e.display_config, '{}'::jsonb)
            || jsonb_build_object(
                'code_field', COALESCE(cfg.code_field, cfg.title_field, cfg.natural_field, 'id'),
                'title_field', COALESCE(cfg.title_field, cfg.code_field, cfg.natural_field, 'id'),
                'default_sort_field', COALESCE(cfg.sort_field, cfg.title_field, cfg.code_field, cfg.natural_field, 'id'),
                'default_sort_order', 'asc',
                'list_columns', to_jsonb(cfg.list_columns),
                'readOnly', true,
                'hidden', true
            ),
        identity_config = CASE
            WHEN cfg.natural_field IS NOT NULL
            THEN jsonb_set(COALESCE(e.identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY[cfg.natural_field]::text[]), true)
            ELSE e.identity_config
        END,
        updated_at = now(),
        updated_by = v_system_user
    FROM control.entity_version ev
    JOIN control.entity e_cfg
      ON e_cfg.id = ev.entity_id
    CROSS JOIN LATERAL (
        SELECT
            (
                SELECT ef.name
                FROM jsonb_array_elements_text(
                    CASE
                        WHEN jsonb_typeof(COALESCE(e_cfg.identity_config, '{}'::jsonb)->'natural_key_fields') = 'array'
                        THEN COALESCE(e_cfg.identity_config, '{}'::jsonb)->'natural_key_fields'
                        ELSE '[]'::jsonb
                    END
                ) WITH ORDINALITY nk(field_name, ord)
                JOIN control.entity_field ef
                  ON ef.entity_version_id = ev.id
                 AND (ef.name = nk.field_name OR ef.column_name = nk.field_name)
                WHERE ef.is_active
                ORDER BY nk.ord
                LIMIT 1
            ) AS natural_field,
            (
                SELECT ef.name
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.is_active
                  AND ef.name = ANY(ARRAY[
                      'code', 'entity_code', 'permission_code',
                      'document_no', 'number', 'name', 'id'
                  ])
                ORDER BY CASE ef.name
                    WHEN 'code' THEN 1
                    WHEN 'entity_code' THEN 2
                    WHEN 'permission_code' THEN 3
                    WHEN 'document_no' THEN 4
                    WHEN 'number' THEN 5
                    WHEN 'name' THEN 6
                    WHEN 'id' THEN 99
                    ELSE 50
                END
                LIMIT 1
            ) AS code_field,
            (
                SELECT ef.name
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.is_active
                  AND ef.name = ANY(ARRAY[
                      'display_name', 'name', 'title', 'full_name',
                      'code', 'entity_code', 'document_no',
                      'number', 'description', 'id'
                  ])
                ORDER BY CASE ef.name
                    WHEN 'display_name' THEN 1
                    WHEN 'name' THEN 2
                    WHEN 'title' THEN 3
                    WHEN 'full_name' THEN 4
                    WHEN 'code' THEN 5
                    WHEN 'entity_code' THEN 6
                    WHEN 'document_no' THEN 7
                    WHEN 'number' THEN 8
                    WHEN 'description' THEN 20
                    WHEN 'id' THEN 99
                    ELSE 50
                END
                LIMIT 1
            ) AS title_field,
            (
                SELECT ef.name
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.is_active
                  AND ef.name = ANY(ARRAY[
                      'updated_at', 'created_at', 'effective_from',
                      'valid_from', 'document_date', 'posting_date',
                      'sort_order', 'display_order', 'code', 'name', 'id'
                  ])
                ORDER BY CASE ef.name
                    WHEN 'updated_at' THEN 1
                    WHEN 'created_at' THEN 2
                    WHEN 'effective_from' THEN 3
                    WHEN 'valid_from' THEN 4
                    WHEN 'document_date' THEN 5
                    WHEN 'posting_date' THEN 6
                    WHEN 'sort_order' THEN 10
                    WHEN 'display_order' THEN 11
                    WHEN 'code' THEN 20
                    WHEN 'name' THEN 21
                    WHEN 'id' THEN 99
                    ELSE 50
                END
                LIMIT 1
            ) AS sort_field,
            ARRAY(
                SELECT ef.name
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.is_active
                  AND COALESCE(ef.ui_type, '') <> 'hidden'
                ORDER BY CASE
                    WHEN ef.name = ANY(ARRAY['code', 'entity_code', 'permission_code', 'document_no']) THEN 1
                    WHEN ef.name = ANY(ARRAY['name', 'display_name', 'title', 'full_name']) THEN 2
                    WHEN ef.name LIKE '%\_id' ESCAPE '\' THEN 3
                    WHEN ef.name = ANY(ARRAY['status', 'is_active']) THEN 4
                    WHEN ef.name = ANY(ARRAY['created_at', 'updated_at']) THEN 9
                    ELSE 5
                END,
                ef.sort_order,
                ef.name
                LIMIT 8
            ) AS list_columns
    ) cfg
    WHERE ev.entity_id = e.id
      AND e_cfg.id = e.id
      AND ev.version_no = 1
      AND e.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage';

    GET DIAGNOSTICS v_display_rows = ROW_COUNT;

    RAISE NOTICE
        'Governed schema coverage versions upserted %, fields upserted %, removed %, refreshed display config %',
        v_version_rows, v_field_rows, v_deleted_rows, v_display_rows;
END $$;
