-- Metadata-first semantic repair.
-- Makes runtime meaning explicit so UI surfaces do not need field-name inference.
-- Idempotent and tenant-safe: existing explicit metadata always wins.

DO $$
BEGIN
    PERFORM set_config('app.bypass_version_lock', 'true', true);

    -- Temporal storage types have deterministic semantics in the platform
    -- contract. Preserve any explicitly authored zoned/business overrides.
    UPDATE control.entity_field
       SET temporal_kind = COALESCE(
               temporal_kind,
               CASE WHEN data_type = 'date' THEN 'businessDate' ELSE 'instant' END
           ),
           display_mode = COALESCE(
               display_mode,
               CASE WHEN data_type = 'date' THEN 'date' ELSE 'dateTime' END
           ),
           updated_at = now()
     WHERE is_active = true
       AND data_type IN ('date', 'datetime', 'timestamp', 'timestamptz')
       AND (temporal_kind IS NULL OR display_mode IS NULL);

    -- Actor fields are references to the principal directory. This is the
    -- only name-based migration in the seed: it converts a known legacy
    -- platform contract into explicit metadata; runtime code does not infer it.
    UPDATE control.entity_field
       SET ui_type = 'reference',
           reference_config = COALESCE(reference_config, '{}'::jsonb)
             || jsonb_build_object(
                  'target_entity', 'principal',
                  'target_field', 'id',
                  'value_field', 'id',
                  'label_field', 'name',
                  'code_field', 'login_email',
                  'display_field', 'name',
                  'scope_mode', 'tenant'
                ),
           ui_hint = COALESCE(ui_hint, '{}'::jsonb)
             || jsonb_build_object(
                  'display',
                  COALESCE(ui_hint->'display', '{}'::jsonb)
                    || jsonb_build_object('renderer', 'reference_label', 'format', 'label')
                ),
           updated_at = now()
     WHERE is_active = true
       AND data_type IN ('uuid', 'reference')
       AND name IN (
         'created_by', 'updated_by', 'deleted_by', 'status_changed_by',
         'posted_by', 'approved_by', 'rejected_by', 'submitted_by',
         'cancelled_by', 'closed_by'
       );

    -- Derive reference targets from real PostgreSQL foreign keys. Unlike an
    -- *_id guess, the catalog constraint identifies both target entity and
    -- target column unambiguously.
    WITH fk_fields AS (
      SELECT ef.id AS field_id,
             target_entity.entity_code AS target_entity_code,
             target_attr.attname AS target_field
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id
        JOIN control.entity source_entity ON source_entity.id = ev.entity_id
        JOIN pg_namespace source_ns ON source_ns.nspname = source_entity.table_schema
        JOIN pg_class source_table
          ON source_table.relnamespace = source_ns.oid
         AND source_table.relname = source_entity.table_name
        JOIN pg_constraint fk
          ON fk.conrelid = source_table.oid
         AND fk.contype = 'f'
         -- A component of a composite FK is not an independent reference.
         -- Treating tenant_id from (tenant_id, reversal_of_id) as one caused
         -- tenant_id to point back to journal_entry.
         AND cardinality(fk.conkey) = 1
         AND cardinality(fk.confkey) = 1
        JOIN LATERAL unnest(fk.conkey) WITH ORDINALITY source_key(attnum, ord) ON true
        JOIN LATERAL unnest(fk.confkey) WITH ORDINALITY target_key(attnum, ord)
          ON target_key.ord = source_key.ord
        JOIN pg_attribute source_attr
          ON source_attr.attrelid = source_table.oid
         AND source_attr.attnum = source_key.attnum
         AND source_attr.attname = ef.column_name
        JOIN pg_class target_table ON target_table.oid = fk.confrelid
        JOIN pg_namespace target_ns ON target_ns.oid = target_table.relnamespace
        JOIN pg_attribute target_attr
          ON target_attr.attrelid = target_table.oid
         AND target_attr.attnum = target_key.attnum
        JOIN control.entity target_entity
          ON target_entity.table_schema = target_ns.nspname
         AND target_entity.table_name = target_table.relname
         AND target_entity.tenant_id IS NOT DISTINCT FROM source_entity.tenant_id
       WHERE ef.is_active = true
         AND ef.data_type IN ('uuid', 'reference')
         AND COALESCE(ef.reference_config, '{}'::jsonb) = '{}'::jsonb
    )
    UPDATE control.entity_field ef
       SET ui_type = 'reference',
           reference_config = jsonb_build_object(
             'target_entity', fk.target_entity_code,
             'target_field', fk.target_field,
             'value_field', fk.target_field,
             'label_field', 'name',
             'display_field', 'name'
           ),
           ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
             || jsonb_build_object(
                  'display',
                  COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                    || jsonb_build_object('renderer', 'reference_label', 'format', 'label')
                ),
           updated_at = now()
      FROM fk_fields fk
     WHERE ef.id = fk.field_id;

    -- tenant_id is a platform reference to the tenant directory. Some domain
    -- tables intentionally carry it only as the scoping half of composite
    -- foreign keys, so PostgreSQL cannot supply a safe single-column FK.
    UPDATE control.entity_field
       SET data_type = 'reference',
           ui_type = 'reference',
           reference_config = jsonb_build_object(
             'target_entity', 'tenant',
             'target_field', 'id',
             'value_field', 'id',
             'label_field', 'name',
             'code_field', 'code',
             'display_field', 'name',
             'scope_mode', 'unscoped'
           ),
           ui_hint = COALESCE(ui_hint, '{}'::jsonb)
             || jsonb_build_object(
                  'display',
                  COALESCE(ui_hint->'display', '{}'::jsonb)
                    || jsonb_build_object('renderer', 'reference_label', 'format', 'code_label')
                ),
           updated_at = now()
     WHERE is_active = true
       AND name = 'tenant_id';

    -- Some legacy descriptors classified every column named status as a
    -- lifecycle_state even when the entity has no lifecycle binding. Where a
    -- single-column PostgreSQL CHECK constraint declares the allowed values,
    -- preserve that contract as an enum with explicit static options.
    WITH unbound_check_options AS (
      SELECT ef.id AS field_id,
             jsonb_agg(DISTINCT jsonb_build_object(
               'value', match.value,
               'code', match.value,
               'label', initcap(replace(match.value, '_', ' '))
             )) AS options
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id
        JOIN control.entity e ON e.id = ev.entity_id
        JOIN pg_namespace ns ON ns.nspname = e.table_schema
        JOIN pg_class tbl ON tbl.relnamespace = ns.oid AND tbl.relname = e.table_name
        JOIN pg_attribute attr
          ON attr.attrelid = tbl.oid AND attr.attname = ef.column_name
        JOIN pg_constraint chk
          ON chk.conrelid = tbl.oid
         AND chk.contype = 'c'
         AND chk.conkey = ARRAY[attr.attnum]::smallint[]
        JOIN LATERAL (
          SELECT capture[1] AS value
            FROM regexp_matches(pg_get_constraintdef(chk.oid), '''([^'']+)''::', 'g') capture
        ) match ON true
       WHERE ef.is_active = true
         AND ef.data_type = 'lifecycle_state'
         AND NOT EXISTS (
           SELECT 1
             FROM control.entity_lifecycle el
             JOIN control.lifecycle lc ON lc.id = el.lifecycle_id AND lc.is_active = true
            WHERE el.entity_name = e.entity_code
              AND (el.tenant_id IS NULL OR el.tenant_id IS NOT DISTINCT FROM e.tenant_id)
         )
       GROUP BY ef.id
    )
    UPDATE control.entity_field ef
       SET data_type = 'enum',
           ui_type = 'status',
           enum_config = jsonb_build_object('values', options.options),
           enum_domain_code = NULL,
           constraints = COALESCE(ef.constraints, '{}'::jsonb)
             || jsonb_build_object('options', options.options),
           ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
             || jsonb_build_object(
                  'editor', jsonb_build_object(
                    'optionSource', jsonb_build_object('kind', 'static', 'options', options.options)
                  )
                ),
           updated_at = now()
      FROM unbound_check_options options
     WHERE ef.id = options.field_id;

    -- An unbound field with no declared value constraint is plain stored text,
    -- not a lifecycle. Keep its value visible without inventing labels/states.
    UPDATE control.entity_field ef
       SET data_type = 'text',
           ui_type = 'text',
           ui_hint = (COALESCE(ef.ui_hint, '{}'::jsonb) - 'editor')
             || jsonb_build_object(
                  'display',
                  COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                    || jsonb_build_object('renderer', 'text')
                ),
           updated_at = now()
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND ef.is_active = true
       AND ef.data_type = 'lifecycle_state'
       AND NOT EXISTS (
         SELECT 1
           FROM control.entity_lifecycle el
           JOIN control.lifecycle lc ON lc.id = el.lifecycle_id AND lc.is_active = true
          WHERE el.entity_name = e.entity_code
            AND (el.tenant_id IS NULL OR el.tenant_id IS NOT DISTINCT FROM e.tenant_id)
       );

    -- Lifecycle fields declare a live option source. Labels and presentation
    -- are resolved from the tenant-preferred entity_lifecycle binding whenever
    -- the runtime descriptor is built; they are never copied into this row.
    UPDATE control.entity_field ef
       SET constraints = NULLIF(COALESCE(ef.constraints, '{}'::jsonb) - 'options', '{}'::jsonb),
           ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
             || jsonb_build_object(
                  'editor',
                  COALESCE(ef.ui_hint->'editor', '{}'::jsonb)
                    || jsonb_build_object(
                         'optionSource',
                         jsonb_build_object('kind', 'lifecycle', 'entityLifecycle', 'current')
                       )
                ),
           updated_at = now()
     WHERE ef.is_active = true
       AND ef.data_type = 'lifecycle_state';

    -- Typed enum and declared reference fields get explicit display renderers.
    UPDATE control.entity_field
       SET ui_hint = COALESCE(ui_hint, '{}'::jsonb)
             || jsonb_build_object(
                  'display',
                  COALESCE(ui_hint->'display', '{}'::jsonb)
                    || jsonb_build_object('renderer', 'lookup_label', 'format', 'label')
                ),
           updated_at = now()
     WHERE is_active = true
       AND data_type IN ('enum', 'lifecycle_state')
       AND COALESCE(ui_hint->'display'->>'renderer', '') = '';

    -- Status presentation is explicit metadata after this migration. The name
    -- is inspected here once to migrate the legacy contract, never at runtime.
    UPDATE control.entity_field
       SET ui_type = 'status',
           updated_at = now()
     WHERE is_active = true
       AND data_type IN ('enum', 'lifecycle_state')
       AND (name = 'status' OR name LIKE '%\_status' ESCAPE '\');

    UPDATE control.entity_field
       SET ui_type = COALESCE(NULLIF(ui_type, ''), 'reference'),
           ui_hint = COALESCE(ui_hint, '{}'::jsonb)
             || jsonb_build_object(
                  'display',
                  COALESCE(ui_hint->'display', '{}'::jsonb)
                    || jsonb_build_object('renderer', 'reference_label', 'format', 'label')
                ),
           updated_at = now()
     WHERE is_active = true
       AND COALESCE(reference_config, '{}'::jsonb) <> '{}'::jsonb
       AND COALESCE(ui_hint->'display'->>'renderer', '') = '';
END $$;
