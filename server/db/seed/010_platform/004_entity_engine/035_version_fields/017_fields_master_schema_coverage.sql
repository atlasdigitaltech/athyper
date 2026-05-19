-- Derive field metadata for the master-schema coverage entities from the
-- database catalog.  This keeps the setup complete without hand-maintaining
-- dozens of table-specific field lists.
DO $$
DECLARE
    v_system_user uuid := '00000000-0000-0000-0000-000000000001';
    v_data_type text;
    v_ui_type text;
    v_field_name text;
    v_origin text;
    v_ref_entity text;
    v_ref_entity_id uuid;
    v_rows integer := 0;
    v_total integer := 0;
    v_version_rows integer := 0;
    v_deleted integer := 0;
    v_display_updates integer := 0;
    r record;
    c record;
BEGIN
    -- Keep this field seed self-sufficient for incremental runs where the
    -- coverage entity seed was applied after the bulk version seed.
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
        'Initial master schema coverage version',
        'structural',
        now(),
        v_system_user,
        v_system_user
    FROM control.entity e
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
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

    FOR r IN
        SELECT
            e.id AS entity_id,
            e.entity_code,
            e.table_schema,
            e.table_name,
            e.backing_type,
            COALESCE((e.feature_flags ->> 'is_readonly')::boolean, false) AS entity_readonly,
            ev.id AS entity_version_id
        FROM control.entity e
        JOIN control.entity_version ev
          ON ev.entity_id = e.id
         AND ev.version_no = 1
        WHERE e.table_schema = 'master'
          AND e.ownership_model = 'system'
          AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
        ORDER BY e.table_name
    LOOP
        FOR c IN
            SELECT column_name, data_type, udt_name, is_nullable, ordinal_position
            FROM information_schema.columns
            WHERE table_schema = r.table_schema
              AND table_name = r.table_name
            ORDER BY ordinal_position
        LOOP
            v_data_type := CASE
                WHEN c.udt_name = 'uuid' THEN 'uuid'
                WHEN c.data_type IN ('integer', 'smallint') THEN 'integer'
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
                WHEN c.data_type = 'text' THEN 'text'
                ELSE 'string'
            END;

            v_ui_type := CASE
                WHEN c.column_name IN ('id', 'tenant_id')
                  OR c.column_name IN ('created_by', 'updated_by', 'status_changed_by', 'deleted_by')
                  OR v_data_type = 'tsvector'
                    THEN 'hidden'
                WHEN v_data_type = 'uuid' AND c.column_name LIKE '%\_id' ESCAPE '\'
                    THEN 'reference'
                WHEN v_data_type IN ('integer', 'bigint', 'decimal', 'numeric', 'money')
                    THEN 'number'
                WHEN v_data_type = 'boolean' THEN 'checkbox'
                WHEN v_data_type = 'date' THEN 'date'
                WHEN v_data_type IN ('datetime', 'timestamptz') THEN 'datetime'
                WHEN v_data_type IN ('json', 'jsonb', 'text_array', 'uuid_array', 'int_array', 'jsonb_array')
                    THEN 'json'
                ELSE 'text'
            END;

            v_field_name := CASE
                WHEN v_data_type = 'boolean'
                 AND c.column_name !~ '^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)'
                    THEN 'is_' || c.column_name
                ELSE c.column_name
            END;

            IF v_field_name LIKE '%\_id' ESCAPE '\'
               AND v_data_type NOT IN ('uuid', 'reference', 'uuid_array', 'uuid[]') THEN
                v_field_name := regexp_replace(v_field_name, '_id$', '_identifier');
            END IF;

            v_origin := CASE
                WHEN c.column_name IN (
                    'id', 'tenant_id', 'is_active', 'created_at', 'created_by',
                    'updated_at', 'updated_by', 'status_changed_at',
                    'status_changed_by', 'deleted_at', 'deleted_by',
                    'row_version', 'xmin'
                ) THEN 'system'
                ELSE 'standard'
            END;

            v_ref_entity := NULL;
            v_ref_entity_id := NULL;

            IF v_data_type = 'uuid' AND (
                c.column_name LIKE '%\_id' ESCAPE '\'
                OR c.column_name IN (
                    'created_by', 'updated_by', 'status_changed_by', 'deleted_by',
                    'approved_by', 'rejected_by', 'verified_by', 'reviewed_by'
                )
            ) THEN
                v_ref_entity := CASE
                    WHEN c.column_name = 'tenant_id' THEN 'tenant'
                    WHEN c.column_name IN (
                        'created_by', 'updated_by', 'status_changed_by', 'deleted_by',
                        'principal_id', 'user_id', 'owner_user_id', 'reviewer_user_id',
                        'actor_principal_id', 'approved_by', 'rejected_by',
                        'verified_by', 'reviewed_by'
                    ) THEN 'principal'
                    WHEN c.column_name = 'assessment_id' THEN 'party_risk_assessment'
                    WHEN c.column_name IN ('risk_dimension_id', 'dimension_id') THEN 'risk_dimension'
                    WHEN c.column_name IN ('risk_driver_id', 'driver_id') THEN 'risk_driver_registry'
                    WHEN c.column_name IN ('risk_model_id', 'model_id') THEN 'risk_model'
                    WHEN c.column_name IN ('risk_source_id', 'source_id') AND r.entity_code LIKE '%risk%' THEN 'risk_source'
                    WHEN c.column_name IN ('network_provider_id', 'provider_id') AND r.entity_code LIKE '%network%' THEN 'network_provider'
                    WHEN c.column_name IN ('tenant_parameter_definition_id', 'parameter_definition_id') THEN 'tenant_parameter_definition'
                    WHEN c.column_name ~ '(^|_)business_partner_id$' THEN 'business_partner'
                    WHEN c.column_name ~ '(^|_)legal_entity_id$' THEN 'legal_entity'
                    WHEN c.column_name ~ '(^|_)company_code_id$' THEN 'company_code'
                    WHEN c.column_name ~ '(^|_)bank_account_id$' THEN 'bank_account'
                    WHEN c.column_name ~ '(^|_)contact_id$' THEN 'contact'
                    WHEN c.column_name ~ '(^|_)address_id$' THEN 'address'
                    WHEN c.column_name ~ '(^|_)employee_id$' THEN 'employee'
                    WHEN c.column_name ~ '(^|_)supplier_id$' THEN 'supplier'
                    WHEN c.column_name ~ '(^|_)commodity_id$' THEN 'commodity'
                    WHEN c.column_name ~ '(^|_)attachment_id$' THEN 'attachment'
                    WHEN c.column_name ~ '(^|_)folder_id$' THEN 'attachment_folder'
                    WHEN c.column_name = 'parent_id' THEN r.entity_code
                    ELSE regexp_replace(
                        regexp_replace(c.column_name, '_id$', ''),
                        '^(source|target|parent|child|owner|counterparty|remote|member|default|preferred|primary|buyer|seller|from|to)_',
                        ''
                    )
                END;

                SELECT e.id
                  INTO v_ref_entity_id
                FROM control.entity e
                WHERE e.tenant_id IS NULL
                  AND e.entity_code = v_ref_entity
                LIMIT 1;

                IF v_ref_entity_id IS NULL THEN
                    v_ref_entity := NULL;
                END IF;
            END IF;

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
                reference_config,
                fk_target_entity_id,
                fk_target_field,
                validation,
                sort_order,
                created_by,
                updated_by
            )
            VALUES (
                r.entity_version_id,
                v_field_name,
                c.column_name,
                initcap(replace(c.column_name, '_', ' ')),
                v_data_type,
                v_ui_type,
                CASE
                    WHEN v_data_type IN ('text_array', 'uuid_array', 'int_array', 'jsonb_array') THEN 'many'
                    WHEN c.is_nullable = 'NO' THEN 'one'
                    ELSE 'zero_or_one'
                END,
                v_origin,
                c.is_nullable = 'NO'
                    AND r.backing_type <> 'view'
                    AND c.column_name NOT IN (
                        'id', 'tenant_id', 'created_at', 'created_by',
                        'updated_at', 'updated_by', 'status_changed_at',
                        'status_changed_by', 'deleted_at', 'deleted_by',
                        'row_version', 'xmin'
                    ),
                c.column_name = ANY(ARRAY[
                    'tenant_id', 'code', 'name', 'status', 'is_active',
                    'entity_code', 'entity_type', 'record_id', 'party_id',
                    'business_partner_id', 'legal_entity_id', 'company_code_id',
                    'network_provider_id', 'risk_model_id', 'risk_dimension_id',
                    'risk_source_id', 'risk_driver_id', 'assessment_id',
                    'principal_id', 'created_at', 'updated_at'
                ])
                OR c.column_name LIKE '%\_id' ESCAPE '\'
                OR c.column_name LIKE '%\_code' ESCAPE '\'
                OR c.column_name LIKE '%\_type' ESCAPE '\'
                OR c.column_name LIKE '%\_status' ESCAPE '\',
                c.column_name = ANY(ARRAY[
                    'code', 'name', 'status', 'is_active', 'created_at',
                    'updated_at', 'effective_from', 'effective_to',
                    'effective_until', 'valid_from', 'valid_to',
                    'reviewed_at', 'assessed_at', 'last_used_at',
                    'display_order', 'sort_order'
                ]),
                c.column_name = ANY(ARRAY[
                    'code', 'name', 'title', 'display_name', 'full_name',
                    'description', 'email', 'primary_email', 'device_name',
                    'entity_code', 'record_label', 'external_ref',
                    'external_reference'
                ])
                OR c.column_name LIKE '%\_name' ESCAPE '\'
                OR c.column_name LIKE '%\_number' ESCAPE '\',
                r.entity_readonly
                OR r.backing_type = 'view'
                OR c.column_name IN (
                    'id', 'tenant_id', 'is_active', 'created_at', 'created_by',
                    'updated_at', 'updated_by', 'status_changed_at',
                    'status_changed_by', 'deleted_at', 'deleted_by',
                    'row_version', 'xmin'
                ),
                false,
                CASE
                    WHEN v_ref_entity IS NOT NULL THEN jsonb_build_object(
                        'target_entity', v_ref_entity,
                        'target_field', 'id',
                        'display_field', 'name'
                    )
                    ELSE NULL::jsonb
                END,
                v_ref_entity_id,
                CASE WHEN v_ref_entity_id IS NOT NULL THEN 'id' ELSE NULL END,
                CASE
                    WHEN v_ref_entity IS NOT NULL THEN jsonb_build_object('ref_entity', v_ref_entity)
                    WHEN v_data_type = 'uuid' AND c.column_name LIKE '%\_id' ESCAPE '\' THEN
                        jsonb_build_object('ref_hint', regexp_replace(c.column_name, '_id$', ''))
                    ELSE NULL::jsonb
                END,
                c.ordinal_position * 10,
                v_system_user,
                v_system_user
            )
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
                is_filterable = control.entity_field.is_filterable OR EXCLUDED.is_filterable,
                is_sortable = control.entity_field.is_sortable OR EXCLUDED.is_sortable,
                is_searchable = control.entity_field.is_searchable OR EXCLUDED.is_searchable,
                is_read_only = CASE
                    WHEN control.entity_field.is_write_once THEN control.entity_field.is_read_only
                    ELSE control.entity_field.is_read_only OR EXCLUDED.is_read_only
                END,
                is_computed = CASE
                    WHEN control.entity_field.is_write_once THEN control.entity_field.is_computed
                    ELSE control.entity_field.is_computed OR EXCLUDED.is_computed
                END,
                reference_config = COALESCE(control.entity_field.reference_config, EXCLUDED.reference_config),
                fk_target_entity_id = COALESCE(control.entity_field.fk_target_entity_id, EXCLUDED.fk_target_entity_id),
                fk_target_field = COALESCE(control.entity_field.fk_target_field, EXCLUDED.fk_target_field),
                validation = COALESCE(control.entity_field.validation, EXCLUDED.validation),
                sort_order = EXCLUDED.sort_order,
                updated_at = now(),
                updated_by = v_system_user;

            GET DIAGNOSTICS v_rows = ROW_COUNT;
            v_total := v_total + v_rows;
        END LOOP;
    END LOOP;

    -- Remove common-field rows that were stamped onto coverage entities but do
    -- not map to a physical column on the backing table/view.
    DELETE FROM control.entity_field ef
    USING control.entity_version ev, control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id = e.id
      AND e.table_schema = 'master'
      AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
      AND ef.column_name <> ''
      AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns ic
          WHERE ic.table_schema = e.table_schema
            AND ic.table_name = e.table_name
            AND ic.column_name = ef.column_name
      );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    UPDATE control.entity e
    SET
        display_config = COALESCE(e.display_config, '{}'::jsonb)
            || jsonb_build_object(
                'code_field', COALESCE(cfg.natural_field, cfg.code_field, cfg.title_field, 'id'),
                'title_field', COALESCE(cfg.title_field, cfg.code_field, cfg.natural_field, 'id'),
                'default_sort_field', COALESCE(cfg.sort_field, cfg.title_field, cfg.code_field, cfg.natural_field, 'id'),
                'default_sort_order', 'asc',
                'list_columns', to_jsonb(cfg.list_columns)
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
                      'code', 'series_code', 'parameter_code', 'entity_code',
                      'name', 'display_name', 'record_id', 'id'
                  ])
                ORDER BY CASE ef.name
                    WHEN 'code' THEN 1
                    WHEN 'series_code' THEN 2
                    WHEN 'parameter_code' THEN 3
                    WHEN 'entity_code' THEN 4
                    WHEN 'name' THEN 5
                    WHEN 'display_name' THEN 6
                    WHEN 'record_id' THEN 7
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
                      'code', 'series_code', 'parameter_code',
                      'email', 'primary_email', 'description', 'id'
                  ])
                ORDER BY CASE ef.name
                    WHEN 'display_name' THEN 1
                    WHEN 'name' THEN 2
                    WHEN 'title' THEN 3
                    WHEN 'full_name' THEN 4
                    WHEN 'code' THEN 5
                    WHEN 'series_code' THEN 6
                    WHEN 'parameter_code' THEN 7
                    WHEN 'email' THEN 8
                    WHEN 'primary_email' THEN 9
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
                      'valid_from', 'reviewed_at', 'assessed_at',
                      'display_order', 'sort_order', 'code', 'name', 'id'
                  ])
                ORDER BY CASE ef.name
                    WHEN 'updated_at' THEN 1
                    WHEN 'created_at' THEN 2
                    WHEN 'effective_from' THEN 3
                    WHEN 'valid_from' THEN 4
                    WHEN 'reviewed_at' THEN 5
                    WHEN 'assessed_at' THEN 6
                    WHEN 'display_order' THEN 7
                    WHEN 'sort_order' THEN 8
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
                    WHEN ef.name = ANY(ARRAY['code', 'series_code', 'parameter_code']) THEN 1
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
      AND e.table_schema = 'master'
      AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage';

    GET DIAGNOSTICS v_display_updates = ROW_COUNT;

    RAISE NOTICE
        'Master schema coverage versions upserted %, fields upserted %, removed %, refreshed display config %',
        v_version_rows, v_total, v_deleted, v_display_updates;
END $$;
