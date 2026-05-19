-- Entity display_config V1 contract cleanup.
--
-- display_config now owns UI presentation only. This pass normalizes legacy
-- renderer/view/sort values, moves code_field into identity_config business
-- keys, and removes keys that moved to search_config, feature_flags,
-- entity_field, or entity core governance columns.

WITH current_entity AS (
    SELECT
        e.id,
        COALESCE(e.display_config, '{}'::jsonb) AS dc,
        COALESCE(e.identity_config, '{}'::jsonb) AS ic,
        COALESCE(e.feature_flags, '{}'::jsonb) AS ff
    FROM control.entity e
),
display_values AS (
    SELECT
        id,
        dc,
        ic,
        ff,
        lower(regexp_replace(COALESCE(NULLIF(dc->>'detail_renderer', ''), ''), '[[:space:]-]+', '_', 'g')) AS detail_renderer_key,
        lower(regexp_replace(COALESCE(NULLIF(dc->>'detail_profile', ''), ''), '[[:space:]_]+', '-', 'g')) AS detail_profile_key,
        lower(regexp_replace(COALESCE(NULLIF(dc->>'list_renderer', ''), ''), '[[:space:]-]+', '_', 'g')) AS list_renderer_key,
        lower(COALESCE(NULLIF(dc->>'default_sort_order', ''), NULLIF(dc->>'default_sort_dir', ''))) AS sort_order_key
    FROM current_entity
),
business_key_candidates AS (
    SELECT
        ce.id,
        bk.value AS field_name,
        bk.ord
    FROM current_entity ce
    JOIN LATERAL jsonb_array_elements_text(
        CASE
            WHEN jsonb_typeof(ce.ic->'business_key_fields') = 'array' THEN ce.ic->'business_key_fields'
            ELSE '[]'::jsonb
        END
    ) WITH ORDINALITY AS bk(value, ord) ON true
    WHERE btrim(bk.value) <> ''

    UNION ALL

    SELECT
        ce.id,
        ce.dc->>'code_field' AS field_name,
        100000 AS ord
    FROM current_entity ce
    WHERE btrim(COALESCE(ce.dc->>'code_field', '')) <> ''
),
business_key_first AS (
    SELECT
        id,
        field_name,
        min(ord) AS ord
    FROM business_key_candidates
    GROUP BY id, field_name
),
business_key_fields AS (
    SELECT
        id,
        jsonb_agg(field_name ORDER BY ord) AS fields
    FROM business_key_first
    GROUP BY id
),
view_mode_candidates AS (
    SELECT
        ce.id,
        vm.ord,
        CASE lower(regexp_replace(vm.value, '[[:space:]-]+', '_', 'g'))
            WHEN 'list' THEN 'table'
            WHEN 'grid' THEN 'table'
            WHEN 'data_table' THEN 'table'
            WHEN 'board' THEN 'kanban'
            WHEN 'excel' THEN 'spreadsheet'
            WHEN 'table' THEN 'table'
            WHEN 'compact' THEN 'compact'
            WHEN 'kanban' THEN 'kanban'
            WHEN 'dashboard' THEN 'dashboard'
            WHEN 'spreadsheet' THEN 'spreadsheet'
            ELSE NULL
        END AS mode
    FROM current_entity ce
    LEFT JOIN LATERAL jsonb_array_elements_text(
        CASE
            WHEN jsonb_typeof(ce.dc->'view_modes') = 'array' THEN ce.dc->'view_modes'
            ELSE '[]'::jsonb
        END
    ) WITH ORDINALITY AS vm(value, ord) ON true
),
view_mode_first AS (
    SELECT
        id,
        mode,
        min(ord) AS ord
    FROM view_mode_candidates
    WHERE mode IS NOT NULL
    GROUP BY id, mode
),
view_modes AS (
    SELECT
        id,
        jsonb_agg(mode ORDER BY ord) AS modes
    FROM view_mode_first
    GROUP BY id
),
normalized AS (
    SELECT
        dv.id,
        jsonb_strip_nulls(
            (
                dv.dc
                - 'code_field'
                - 'search_fields'
                - 'default_sort_dir'
                - 'default_sort_order'
                - 'hidden'
                - 'readOnly'
                - 'read_only'
                - 'coverage_mode'
                - 'reference_model'
                - 'field_metadata_repair_version'
                - 'detail_renderer'
                - 'detail_profile'
                - 'list_renderer'
                - 'view_modes'
            )
            || jsonb_build_object(
                'default_sort_order',
                CASE
                    WHEN dv.sort_order_key IN ('asc', 'desc') THEN dv.sort_order_key
                    ELSE NULL
                END,
                'detail_renderer',
                CASE
                    WHEN dv.detail_renderer_key IN ('document', 'document_detail') THEN 'document'
                    WHEN dv.detail_renderer_key IN ('ledger', 'log') THEN 'ledger'
                    WHEN dv.detail_renderer_key IN ('master', 'standard', 'readonly', 'read_only', 'read_only_master') THEN 'master'
                    ELSE NULL
                END,
                'detail_profile',
                CASE
                    WHEN dv.detail_renderer_key IN ('readonly', 'read_only')
                      OR lower(COALESCE(dv.dc->>'readOnly', '')) IN ('true', 't', 'yes', 'y', '1', 'enabled', 'on')
                      OR lower(COALESCE(dv.dc->>'read_only', '')) IN ('true', 't', 'yes', 'y', '1', 'enabled', 'on')
                    THEN 'read-only'
                    WHEN dv.detail_profile_key IN ('simple', 'rich', 'read-only') THEN dv.detail_profile_key
                    WHEN dv.detail_renderer_key = 'standard' THEN 'simple'
                    ELSE NULL
                END,
                'list_renderer',
                CASE
                    WHEN dv.list_renderer_key IN ('list', 'grid', 'data_table') THEN 'table'
                    WHEN dv.list_renderer_key = 'board' THEN 'kanban'
                    WHEN dv.list_renderer_key = 'excel' THEN 'spreadsheet'
                    WHEN dv.list_renderer_key IN ('table', 'kanban', 'dashboard', 'spreadsheet') THEN dv.list_renderer_key
                    ELSE NULL
                END,
                'view_modes', vm.modes
            )
        ) AS next_display_config,
        CASE
            WHEN bk.fields IS NOT NULL THEN jsonb_set(dv.ic, '{business_key_fields}', bk.fields, true)
            ELSE dv.ic
        END AS next_identity_config,
        jsonb_strip_nulls(
            dv.ff
            || jsonb_build_object(
                'is_hidden',
                CASE
                    WHEN dv.ff ? 'is_hidden' THEN dv.ff->'is_hidden'
                    WHEN lower(COALESCE(dv.dc->>'hidden', '')) IN ('true', 't', 'yes', 'y', '1', 'enabled', 'on') THEN to_jsonb(true)
                    WHEN lower(COALESCE(dv.dc->>'hidden', '')) IN ('false', 'f', 'no', 'n', '0', 'disabled', 'off') THEN to_jsonb(false)
                    ELSE NULL
                END,
                'is_readonly',
                CASE
                    WHEN dv.ff ? 'is_readonly' THEN dv.ff->'is_readonly'
                    WHEN lower(COALESCE(dv.dc->>'readOnly', dv.dc->>'read_only', '')) IN ('true', 't', 'yes', 'y', '1', 'enabled', 'on') THEN to_jsonb(true)
                    WHEN lower(COALESCE(dv.dc->>'readOnly', dv.dc->>'read_only', '')) IN ('false', 'f', 'no', 'n', '0', 'disabled', 'off') THEN to_jsonb(false)
                    ELSE NULL
                END
            )
        ) AS next_feature_flags
    FROM display_values dv
    LEFT JOIN business_key_fields bk ON bk.id = dv.id
    LEFT JOIN view_modes vm ON vm.id = dv.id
)
UPDATE control.entity e
SET
    display_config = n.next_display_config,
    identity_config = n.next_identity_config,
    feature_flags = n.next_feature_flags,
    updated_at = now()
FROM normalized n
WHERE n.id = e.id
  AND (
      e.display_config IS DISTINCT FROM n.next_display_config
      OR e.identity_config IS DISTINCT FROM n.next_identity_config
      OR e.feature_flags IS DISTINCT FROM n.next_feature_flags
  );
