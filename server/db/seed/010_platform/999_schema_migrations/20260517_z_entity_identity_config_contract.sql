-- Entity identity_config V1 contract cleanup.
--
-- feature_flags is capability/runtime behavior. Entity identity, parent
-- binding, duplicate policy, replacement target, and list identity routing
-- belong in control.entity.identity_config. This script derives a normalized
-- V1 identity contract from the existing entity row and moves legacy
-- identity-related feature_flags into that contract.

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
        CASE
            WHEN ef.name = 'code' THEN 10000
            WHEN ef.name = e.display_config->>'code_field' THEN 9900
            WHEN ef.name = e.display_config #>> '{document_header,number_field}' THEN 9800
            WHEN ef.name = 'document_no' THEN 9700
            WHEN ef.name = 'document_number' THEN 9650
            WHEN ef.name = 'number' THEN 9600
            WHEN ef.name ~ '(^|_)(code|no|number)$' THEN 9400
            WHEN ef.name IN ('external_id', 'external_ref', 'registration_no', 'tax_registration_no') THEN 9000
            WHEN ef.name = e.display_config->>'title_field' THEN 8300
            WHEN ef.name = e.display_config #>> '{document_header,title_field}' THEN 8250
            WHEN ef.name = e.display_config #>> '{document_header,name_field}' THEN 8200
            WHEN ef.name IN ('name', 'display_name', 'legal_name') THEN 8000
            WHEN ef.name IN ('title', 'label') OR ef.name ~ '(^|_)(name|title|label)$' THEN 7600
            WHEN ef.name IN ('email', 'phone') OR ef.name ~ '(^|_)(email|phone)$' THEN 5200
            ELSE 1000
        END AS score
    FROM control.entity e
    JOIN effective_versions ev ON ev.entity_id = e.id
    JOIN control.entity_field ef ON ef.entity_version_id = ev.entity_version_id
    WHERE ef.is_active = true
      AND ef.is_computed = false
      AND lower(ef.data_type) IN ('email', 'enum', 'phone', 'string', 'text', 'url')
      AND ef.name !~ '(^id$|_id$|tenant_id|created_at|created_by|updated_at|updated_by|deleted_at|deleted_by|row_version|version_hash|checksum|hash|status|state|lifecycle_state|description|long_description|notes|remarks|memo|comment)$'
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
    WHERE score >= 5000
),
chosen_fields AS (
    SELECT
        entity_id,
        jsonb_agg(name ORDER BY rn) AS fields
    FROM ranked_fields
    WHERE rn = 1
    GROUP BY entity_id
),
entity_identity_config AS (
    SELECT
        e.id AS entity_id,
        COALESCE(e.identity_config, '{}'::jsonb) AS existing_identity_config,
        COALESCE(e.feature_flags, '{}'::jsonb) AS feature_flags,
        CASE
            WHEN jsonb_typeof(COALESCE(e.identity_config, '{}'::jsonb)->'numbering') = 'object'
            THEN COALESCE(e.identity_config, '{}'::jsonb)->'numbering'
            ELSE jsonb_build_object('enabled', true)
        END AS numbering_config,
        CASE
            WHEN jsonb_typeof(COALESCE(e.identity_config, '{}'::jsonb)->'business_key_fields') = 'array'
             AND jsonb_array_length(COALESCE(e.identity_config, '{}'::jsonb)->'business_key_fields') > 0
            THEN COALESCE(e.identity_config, '{}'::jsonb)->'business_key_fields'
            WHEN jsonb_typeof(COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields') = 'array'
             AND jsonb_array_length(COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields') > 0
            THEN (
                SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
                FROM jsonb_array_elements_text(COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields') WITH ORDINALITY AS nk(value, ord)
                WHERE value NOT IN ('tenant_id', 'id')
            )
            ELSE COALESCE(cf.fields, '[]'::jsonb)
        END AS business_key_fields,
        CASE
            WHEN jsonb_typeof(COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields') = 'array'
             AND jsonb_array_length(COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields') > 0
            THEN COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields'
            WHEN jsonb_array_length(COALESCE(cf.fields, '[]'::jsonb)) > 0 THEN COALESCE(cf.fields, '[]'::jsonb)
            ELSE '[]'::jsonb
        END AS natural_key_fields
    FROM control.entity e
    LEFT JOIN chosen_fields cf ON cf.entity_id = e.id
)
UPDATE control.entity e
SET
    identity_config = jsonb_strip_nulls(
        eic.existing_identity_config
        || jsonb_build_object(
            'primary_key_field', COALESCE(NULLIF(eic.existing_identity_config->>'primary_key_field', ''), 'id'),
            'business_key_fields', eic.business_key_fields,
            'natural_key_fields', eic.natural_key_fields,
            'numbering', eic.numbering_config,
            'identity_via', COALESCE(NULLIF(eic.feature_flags->>'identity_via', ''), NULLIF(eic.existing_identity_config->>'identity_via', '')),
            'list_entity_code', COALESCE(NULLIF(eic.feature_flags->>'list_entity_code', ''), NULLIF(eic.existing_identity_config->>'list_entity_code', '')),
            'parent',
                CASE
                    WHEN eic.feature_flags ?| ARRAY['parent_entity', 'parent_fk', 'parent_scope']::text[]
                    THEN jsonb_strip_nulls(jsonb_build_object(
                        'entity', NULLIF(eic.feature_flags->>'parent_entity', ''),
                        'field', NULLIF(eic.feature_flags->>'parent_fk', ''),
                        'scope', NULLIF(eic.feature_flags->>'parent_scope', '')
                    ))
                    WHEN jsonb_typeof(eic.existing_identity_config->'parent') = 'object'
                    THEN eic.existing_identity_config->'parent'
                    ELSE NULL
                END,
            'duplicate_check',
                CASE
                    WHEN jsonb_typeof(eic.feature_flags->'duplicate_check') = 'object'
                    THEN eic.feature_flags->'duplicate_check'
                    WHEN jsonb_typeof(eic.existing_identity_config->'duplicate_check') = 'object'
                    THEN eic.existing_identity_config->'duplicate_check'
                    ELSE NULL
                END,
            'replacement',
                CASE
                    WHEN eic.feature_flags ? 'replacement_entity'
                    THEN jsonb_strip_nulls(jsonb_build_object(
                        'replacement_entity', NULLIF(eic.feature_flags->>'replacement_entity', '')
                    ))
                    WHEN jsonb_typeof(eic.existing_identity_config->'replacement') = 'object'
                    THEN eic.existing_identity_config->'replacement'
                    ELSE NULL
                END
        )
    ),
    feature_flags = COALESCE(e.feature_flags, '{}'::jsonb)
        - 'identity_via'
        - 'list_entity_code'
        - 'parent_entity'
        - 'parent_fk'
        - 'parent_scope'
        - 'duplicate_check'
        - 'replacement_entity',
    updated_at = now()
FROM entity_identity_config eic
WHERE eic.entity_id = e.id;
