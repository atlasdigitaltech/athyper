-- Final metadata ownership boundary before the seed assertions.
-- 042_control_entity_field_contract.sql is the sole physical-column generator.
-- Runtime eligibility is repaired separately so registered metadata remains
-- available to discovery/UI even when a field is not descriptor-safe.

-- Capability repair: 044 registers a broad operation menu for many catalog
-- entities. A runtime entity whose write capability is `none` must not retain
-- enabled create/update/import/lifecycle operations from that generic menu.
-- Keep read-only navigation/export operations available and disable every
-- other operation deterministically.
DO $$
DECLARE
    v_disabled bigint;
BEGIN
    UPDATE control.entity_operation eo
       SET is_enabled = false,
           updated_at = now(),
           updated_by = '00000000-0000-0000-0000-000000000000'
      FROM control.entity e
     WHERE eo.tenant_id IS NULL
       AND e.tenant_id IS NULL
       AND eo.entity_name = e.entity_code
       AND e.runtime_enabled = true
       AND e.write_capability = 'none'
       AND eo.is_enabled = true
       AND lower(eo.permission_code) NOT IN ('read','list','view','get','search','browse','export');

    GET DIAGNOSTICS v_disabled = ROW_COUNT;
    RAISE NOTICE '[099b capability repair] disabled % operations for read-only runtime entities', v_disabled;
END $$;

DO $$
DECLARE
    v_quarantined bigint;
BEGIN
    WITH invalid AS (
        SELECT ef.id
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE ef.is_active = true
          AND COALESCE(ef.runtime_enabled, true) = true
          AND COALESCE(ef.column_name, '') = ''
        UNION
        SELECT ef.id
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE ef.is_active = true
          AND COALESCE(ef.runtime_enabled, true) = true
          AND COALESCE(ef.column_name, '') <> ''
          AND e.backing_type IN ('table', 'view', 'materialized_view')
          AND NOT EXISTS (
              SELECT 1
              FROM information_schema.columns c
              WHERE c.table_schema = e.table_schema
                AND c.table_name = e.table_name
                AND c.column_name = ef.column_name
          )
    ), updated AS (
        UPDATE control.entity_field ef
           SET runtime_enabled = false,
               updated_at = now(),
               updated_by = '00000000-0000-0000-0000-000000000000'
          FROM invalid i
         WHERE ef.id = i.id
           AND ef.runtime_enabled = true
        RETURNING ef.id
    )
    SELECT count(*) INTO v_quarantined FROM updated;

    RAISE NOTICE '[099b runtime fields] quarantined % non-physical metadata fields', v_quarantined;
END $$;

DO $$
DECLARE
    v_repaired bigint;
BEGIN
    WITH ranked AS (
        SELECT
            ef.id,
            row_number() OVER (
                PARTITION BY ef.entity_version_id, ef.column_name
                ORDER BY
                    CASE WHEN ef.name = ef.column_name THEN 0 ELSE 1 END,
                    CASE WHEN ef.origin = 'system' THEN 0 ELSE 1 END,
                    ef.id
            ) AS rn
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE ef.is_active = true
          AND COALESCE(ef.runtime_enabled, true) = true
          AND COALESCE(ef.column_name, '') <> ''
          AND e.backing_type = 'table'
    ), repaired AS (
        UPDATE control.entity_field ef
           SET runtime_enabled = false,
               updated_at = now(),
               updated_by = '00000000-0000-0000-0000-000000000000'
          FROM ranked r
         WHERE ef.id = r.id
           AND r.rn > 1
        RETURNING ef.id
    )
    SELECT count(*) INTO v_repaired FROM repaired;

    RAISE NOTICE '[099b runtime contract] quarantined % duplicate table-backed physical fields without collapsing metadata', v_repaired;
END $$;

DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count bigint;
    v_sample text;
BEGIN
    SELECT count(*), COALESCE(string_agg(entity_code || '.' || column_name, ', ' ORDER BY entity_code, column_name), '')
      INTO v_count, v_sample
      FROM (
          SELECT e.entity_code, ef.column_name
          FROM control.entity_field ef
          JOIN control.entity_version ev ON ev.id = ef.entity_version_id
          JOIN control.entity e ON e.id = ev.entity_id
          WHERE ef.is_active = true
            AND COALESCE(ef.runtime_enabled, true) = true
            AND COALESCE(ef.column_name, '') <> ''
            AND e.backing_type = 'table'
          GROUP BY e.entity_code, ev.id, ef.column_name
          HAVING count(*) > 1
      ) duplicates;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[099b duplicate physical fields] % duplicate groups remain: %', v_count, v_sample;
        ELSE
            RAISE WARNING '[099b duplicate physical fields] % duplicate groups remain: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[099b duplicate physical fields] PASSED.';
    END IF;
END $$;

DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count bigint;
    v_sample text;
BEGIN
    SELECT count(*), COALESCE(string_agg(e.entity_code || '.' || ef.name, ', ' ORDER BY e.entity_code, ef.name), '')
      INTO v_count, v_sample
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
      WHERE ef.is_active = true
        AND COALESCE(ef.runtime_enabled, true) = true
        AND ef.projection_alias_of IS NOT NULL
        AND e.backing_type NOT IN ('view', 'materialized_view');

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[099b projection aliases] % active aliases belong to non-view entities: %', v_count, v_sample;
        ELSE
            RAISE WARNING '[099b projection aliases] % active aliases belong to non-view entities: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[099b projection aliases] PASSED.';
    END IF;
END $$;

DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count bigint;
    v_sample text;
BEGIN
    SELECT count(*), COALESCE(string_agg(e.entity_code || '.' || ef.name, ', ' ORDER BY e.entity_code, ef.name), '')
      INTO v_count, v_sample
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
      LEFT JOIN control.entity_field target
        ON target.entity_version_id = ef.entity_version_id
       AND target.name = ef.projection_alias_of
       AND target.is_active = true
       AND COALESCE(target.runtime_enabled, true) = true
       AND target.column_name = ef.column_name
      WHERE ef.is_active = true
        AND COALESCE(ef.runtime_enabled, true) = true
        AND ef.projection_alias_of IS NOT NULL
        AND target.id IS NULL;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[099b projection alias targets] % aliases have no active same-column target: %', v_count, v_sample;
        ELSE
            RAISE WARNING '[099b projection alias targets] % aliases have no active same-column target: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[099b projection alias targets] PASSED.';
    END IF;
END $$;

DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count bigint;
    v_sample text;
BEGIN
    SELECT count(*), COALESCE(string_agg(entity_code || ':' || reason, ', ' ORDER BY entity_code), '')
      INTO v_count, v_sample
      FROM (
          SELECT e.entity_code, 'runtime_enabled_without_primary_key' AS reason
          FROM control.entity e
          WHERE e.runtime_enabled = true
            AND e.primary_key IS NULL
          UNION ALL
          SELECT e.entity_code, 'runtime_enabled_without_read_capability'
          FROM control.entity e
          WHERE e.runtime_enabled = true
            AND e.read_capability = 'none'
          UNION ALL
          SELECT e.entity_code, 'coverage_entity_runtime_enabled'
          FROM control.entity e
          WHERE e.runtime_enabled = true
            AND e.feature_flags ->> 'metadata_coverage_source' LIKE '%schema_coverage'
          UNION ALL
          SELECT e.entity_code, 'runtime_primary_key_missing_physical_column'
          FROM control.entity e
          WHERE e.runtime_enabled = true
            AND NOT EXISTS (
                SELECT 1
                FROM information_schema.columns c
                WHERE c.table_schema = e.table_schema
                  AND c.table_name = e.table_name
                  AND c.column_name = e.primary_key
            )
          UNION ALL
          SELECT e.entity_code, 'runtime_tenant_column_missing_physical_column'
          FROM control.entity e
          WHERE e.runtime_enabled = true
            AND e.tenant_column IS NOT NULL
            AND NOT EXISTS (
                SELECT 1
                FROM information_schema.columns c
                WHERE c.table_schema = e.table_schema
                  AND c.table_name = e.table_name
                  AND c.column_name = e.tenant_column
            )
      ) violations;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[099b runtime contract] % violations: %', v_count, v_sample;
        ELSE
            RAISE WARNING '[099b runtime contract] % violations: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[099b runtime contract] PASSED.';
    END IF;
END $$;
