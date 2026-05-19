-- Entity search_config V1 contract cleanup.
--
-- display_config is presentation-only; search behavior belongs in
-- control.entity.search_config.  This derives a small, deterministic search
-- profile from the effective entity_field metadata for every active entity.

WITH effective_versions AS (
    SELECT DISTINCT ON (ev.entity_id)
           ev.entity_id,
           ev.id AS entity_version_id
    FROM control.entity_version ev
    WHERE ev.status = 'EFFECTIVE'
    ORDER BY ev.entity_id, ev.version_no DESC, ev.id DESC
),
candidate_fields AS (
    SELECT
        e.id AS entity_id,
        ef.name,
        ef.sort_order,
        (
            CASE
                WHEN ef.name = 'code' THEN 10000
                WHEN ef.name = 'name' THEN 9000
                WHEN ef.name = 'description' THEN 8000
                WHEN ef.name = e.display_config->>'code_field' THEN 7600
                WHEN ef.name = e.display_config->>'title_field' THEN 7500
                WHEN ef.name = e.display_config->>'subtitle_field' THEN 7400
                WHEN ef.name = e.display_config #>> '{document_header,number_field}' THEN 7350
                WHEN ef.name = e.display_config #>> '{document_header,title_field}' THEN 7300
                WHEN ef.name = e.display_config #>> '{document_header,name_field}' THEN 7250
                WHEN ef.name = e.display_config #>> '{document_header,party_name_field}' THEN 7200
                WHEN ef.name = 'search_text' THEN 7000
                WHEN ef.name ~ '(^|_)code$' THEN 6800
                WHEN ef.name ~ '(^|_)(number|no)$' THEN 6700
                WHEN ef.name LIKE '%\_name' THEN 6600
                WHEN ef.name LIKE '%\_title' OR ef.name = 'title' THEN 6500
                WHEN ef.name LIKE '%\_label' OR ef.name = 'label' THEN 6400
                WHEN ef.name LIKE '%\_description' THEN 6300
                WHEN ef.name IN ('notes', 'remarks', 'memo', 'comment') THEN 6200
                WHEN ef.name IN ('status', 'lifecycle_state', 'state') THEN 5200
                WHEN ef.name IN ('type', 'kind', 'category') OR ef.name LIKE '%\_type' THEN 5000
                WHEN ef.name IN ('email', 'phone', 'url') OR ef.name LIKE '%\_email' OR ef.name LIKE '%\_phone' THEN 4500
                ELSE 1000
            END
            + CASE WHEN ef.is_searchable THEN 100 ELSE 0 END
        ) AS score
    FROM control.entity e
    JOIN effective_versions ev ON ev.entity_id = e.id
    JOIN control.entity_field ef ON ef.entity_version_id = ev.entity_version_id
    WHERE e.is_active = true
      AND ef.is_active = true
      AND ef.is_computed = false
      AND lower(ef.data_type) IN ('email', 'enum', 'lifecycle_state', 'phone', 'string', 'text', 'url')
      AND ef.name !~ '(^id$|_id$|tenant_id|created_at|created_by|updated_at|updated_by|deleted_at|deleted_by|row_version|version_hash|checksum|hash)$'
),
ranked_fields AS (
    SELECT
        entity_id,
        name,
        row_number() OVER (
            PARTITION BY entity_id
            ORDER BY score DESC, sort_order ASC, name ASC
        ) AS rn
    FROM candidate_fields
),
chosen_fields AS (
    SELECT
        entity_id,
        jsonb_agg(name ORDER BY rn) AS fields,
        jsonb_object_agg(
            name,
            CASE rn WHEN 1 THEN 10 WHEN 2 THEN 5 ELSE 1 END
            ORDER BY rn
        ) AS rank
    FROM ranked_fields
    WHERE rn <= 3
    GROUP BY entity_id
),
entity_search_config AS (
    SELECT
        e.id AS entity_id,
        COALESCE(cf.fields, '[]'::jsonb) AS fields,
        COALESCE(cf.rank, '{}'::jsonb) AS rank
    FROM control.entity e
    LEFT JOIN chosen_fields cf ON cf.entity_id = e.id
    WHERE e.is_active = true
)
UPDATE control.entity e
SET
    search_config = jsonb_build_object(
        'enabled', jsonb_array_length(esc.fields) > 0,
        'fields', esc.fields,
        'rank', esc.rank,
        'min_query_length', 1,
        'operator', 'contains'
    ),
    display_config = e.display_config - 'search_fields',
    updated_at = now()
FROM entity_search_config esc
WHERE esc.entity_id = e.id;
