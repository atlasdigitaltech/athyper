-- Materialize the canonical Meta Entity Contract v2 from the pre-v2 graph.
-- This is the only seed allowed to read legacy duplicate properties. Runtime
-- consumers and Studio read the v2 columns after this file has run.

DO $$
DECLARE
    v_user uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
    INSERT INTO control.entity_version_contract (
        entity_version_id, tenant_id, catalog_enabled, api_exposure,
        backing_type, table_schema, table_name, key_strategy, primary_key,
        tenant_column, read_capability, write_capability, source_kind,
        runtime_enabled, create_mode, draft_ttl_hours, governance_level,
        security_tier, mutability, identity_config, search_config,
        data_policy, concurrency_config, storage_config, contract_version,
        created_by, updated_by
    )
    SELECT
        ev.id,
        ev.tenant_id,
        true,
        CASE WHEN e.runtime_enabled AND e.read_capability <> 'none' THEN 'API' ELSE 'CATALOG_ONLY' END,
        e.backing_type,
        e.table_schema,
        e.table_name,
        CASE WHEN e.primary_key IS NULL THEN 'none' ELSE 'single' END,
        COALESCE(e.primary_key, 'id'),
        e.tenant_column,
        e.read_capability,
        e.write_capability,
        'derived',
        e.runtime_enabled,
        e.create_mode,
        e.draft_ttl_hours,
        e.governance_level,
        e.security_tier,
        e.mutability,
        jsonb_build_object(
            'primary_key_field', COALESCE(e.primary_key, 'id'),
            'business_key_fields', COALESCE(e.identity_config->'business_key_fields', '[]'::jsonb),
            'natural_key_fields', COALESCE(e.identity_config->'natural_key_fields', '[]'::jsonb),
            'display_identity', jsonb_build_object(
                'title_field', COALESCE(e.identity_config->>'title_field', 'name'),
                'subtitle_field', e.identity_config->>'subtitle_field'
            ),
            'parent', CASE WHEN e.identity_config->>'parent_entity' IS NULL THEN NULL
                ELSE jsonb_build_object('relation', e.identity_config->>'parent_entity') END,
            'identity_via', e.identity_config->>'identity_via',
            'list_entity_code', e.identity_config->>'list_entity_code',
            'duplicate_check', COALESCE(e.identity_config->'duplicate_check', '{"enabled":false,"fields":[],"scope":"tenant"}'::jsonb),
            'replacement', CASE WHEN e.identity_config->>'replacement_for' IS NULL THEN NULL
                ELSE jsonb_build_object('entity_code', e.identity_config->>'replacement_for') END
        ),
        jsonb_build_object(
            'enabled', COALESCE((e.search_config->>'enabled')::boolean, true),
            'mode', COALESCE(e.search_config->>'mode', 'server'),
            'fields', COALESCE(
                e.search_config->'fields',
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('field', ef.name, 'weight', 1) ORDER BY ef.sort_order), '[]'::jsonb)
                   FROM control.entity_field ef
                  WHERE ef.entity_version_id = ev.id AND ef.is_active AND ef.is_searchable)
            ),
            'minimum_query_length', COALESCE((e.search_config->>'minimum_query_length')::integer, 2),
            'operator', COALESCE(e.search_config->>'operator', 'contains')
        ),
        jsonb_build_object(
            'classification', COALESCE(e.data_policy->>'classification', 'internal'),
            'retention', jsonb_build_object(
                'days', (e.data_policy->'retention'->>'days')::integer,
                'legal_hold_eligible', COALESCE((e.data_policy->'retention'->>'legal_hold_eligible')::boolean, false)
            ),
            'deletion', jsonb_build_object(
                'anonymize', COALESCE((e.data_policy->'deletion'->>'anonymize')::boolean, false)
            ),
            'pii_fields', COALESCE(e.data_policy->'pii_fields', '[]'::jsonb)
        ),
        jsonb_build_object(
            'strategy', COALESCE(e.concurrency_policy->>'strategy', 'none'),
            'rollout', COALESCE(e.concurrency_policy->>'rollout', 'observe'),
            'row_version_field', e.concurrency_policy->>'row_version_field',
            'lock_required', COALESCE((e.concurrency_policy->>'lock_required')::boolean, false)
        ),
        jsonb_build_object(
            'discriminator', CASE WHEN e.discriminator_column IS NULL THEN NULL
                ELSE jsonb_build_object('column', e.discriminator_column, 'value', e.discriminator_value) END,
            'partition', CASE WHEN e.partition_key IS NULL THEN NULL
                ELSE jsonb_build_object('parent_entity', p.entity_code, 'key', e.partition_key) END,
            'external_source', CASE WHEN e.external_source_config = '{}'::jsonb THEN NULL
                ELSE e.external_source_config END,
            'indexes', COALESCE(e.composite_indexes, '[]'::jsonb)
        ),
        2,
        v_user,
        v_user
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    LEFT JOIN control.entity p ON p.id = e.partition_parent_id
    WHERE ev.tenant_id IS NULL
    ON CONFLICT (entity_version_id) DO UPDATE SET
        runtime_enabled = EXCLUDED.runtime_enabled,
        create_mode = EXCLUDED.create_mode,
        draft_ttl_hours = EXCLUDED.draft_ttl_hours,
        governance_level = EXCLUDED.governance_level,
        security_tier = EXCLUDED.security_tier,
        mutability = EXCLUDED.mutability,
        identity_config = EXCLUDED.identity_config,
        search_config = EXCLUDED.search_config,
        data_policy = EXCLUDED.data_policy,
        concurrency_config = EXCLUDED.concurrency_config,
        storage_config = EXCLUDED.storage_config,
        contract_version = 2,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by;

    UPDATE control.entity_field ef
       SET semantic_roles = ARRAY_REMOVE(ARRAY[
               CASE WHEN ef.is_primary_amount THEN 'money.primary_amount' END,
               CASE WHEN ef.is_primary_currency THEN 'money.currency' END,
               CASE WHEN ef.ui_hint->>'semantic_role' IS NOT NULL THEN ef.ui_hint->>'semantic_role' END
           ]::text[], NULL),
           type_config = CASE
               WHEN ef.data_type IN ('reference','uuid') AND COALESCE(ef.reference_config, '{}'::jsonb) <> '{}'::jsonb
                   THEN jsonb_build_object('kind', 'reference', 'relation', COALESCE(ef.reference_config->>'relation', ef.name),
                       'display', jsonb_build_object('label_field', COALESCE(ef.reference_config->>'display_field', 'name'),
                           'code_field', ef.reference_config->>'code_field', 'description_field', ef.reference_config->>'description_field', 'format', 'label'))
               WHEN ef.data_type IN ('money','decimal','numeric') AND ef.money_config IS NOT NULL
                   THEN jsonb_build_object('kind', 'money', 'currency', jsonb_build_object('source', 'field', 'field',
                       COALESCE(ef.money_config->>'currency_field', ef.money_config->>'currency_code')), 'minor_units',
                       COALESCE((ef.money_config->>'minor_units')::integer, 2))
               WHEN ef.data_type = 'enum'
                   THEN jsonb_build_object('kind', 'enum', 'domain_code', COALESCE(ef.enum_domain_code, ef.enum_config->>'domain_code', 'unknown'))
               WHEN ef.temporal_kind IS NOT NULL OR ef.data_type IN ('date','datetime','timestamp','timestamptz')
                   THEN jsonb_build_object('kind', 'temporal', 'temporal_kind', COALESCE(ef.temporal_kind, 'instant'),
                       'display_mode', COALESCE(ef.display_mode, 'dateTime'),
                       'affects_posting_period', ef.affects_posting_period)
               WHEN ef.data_type IN ('json','jsonb')
                   THEN jsonb_build_object('kind', 'json', 'schema_key', COALESCE(ef.json_config->>'schema_key', ef.name))
               ELSE jsonb_build_object('kind', 'scalar', 'format', ef.format, 'unit', ef.unit)
           END,
           updated_at = now(),
           updated_by = v_user
     WHERE ef.entity_version_id IS NOT NULL;

    UPDATE control.entity_relation er
       SET relation_code = COALESCE(er.relation_code, er.name),
           target_entity_code = COALESCE(er.target_entity_code, er.target_entity),
           source_field = COALESCE(er.source_field, er.fk_field),
           target_field = COALESCE(er.target_field, er.target_key, 'id'),
           polymorphic_type_field = COALESCE(er.polymorphic_type_field, er.source_type_field),
           polymorphic_type_value = COALESCE(er.polymorphic_type_value, er.source_type_value),
           polymorphic_id_field = COALESCE(er.polymorphic_id_field, er.source_id_field),
           mutation_owner = COALESCE(NULLIF(er.mutation_owner, 'read_only'),
               CASE WHEN er.ui_behavior->>'mutation_handler' IS NOT NULL THEN 'handler' ELSE 'read_only' END),
           updated_at = now(),
           updated_by = v_user
     WHERE er.tenant_id IS NULL;

    UPDATE control.entity_surface es
       SET entity_version_id = COALESCE(es.entity_version_id, ev.id),
           v2_mode = CASE es.mode WHEN 'view' THEN 'detail' ELSE es.mode END,
           v2_kind = CASE
               WHEN es.mode = 'list' THEN 'TABLE'
               WHEN es.kind IN ('fields','document_identity_summary') THEN 'FORM'
               WHEN es.kind IN ('line_items','child_records','document_lines') THEN 'COLLECTION'
               WHEN es.mode = 'print' THEN 'PRINT'
               ELSE 'CUSTOM'
           END,
           updated_at = now(),
           updated_by = v_user
      FROM control.entity_version ev
     WHERE ev.entity_id = es.entity_id
       AND ev.tenant_id IS NULL
       AND ev.status = 'EFFECTIVE'
       AND es.tenant_id IS NULL;

    UPDATE control.entity_operation eo
       SET entity_version_id = COALESCE(eo.entity_version_id, ev.id),
           operation_code = COALESCE(eo.operation_code, lower(eo.permission_code)),
           label = COALESCE(eo.label, eo.label_override, eo.permission_code),
           icon = COALESCE(eo.icon, eo.icon_override),
           record_required = COALESCE(eo.record_required, eo.is_record_required),
           updated_at = now(),
           updated_by = v_user
      FROM control.entity e
      JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.tenant_id IS NULL AND ev.status = 'EFFECTIVE'
     WHERE eo.entity_name IN (e.entity_code, e.name, e.table_name)
       AND eo.tenant_id IS NULL;

    -- All legacy control seeds have now run. Verify the data conversion only.
    -- Structural indexes and constraints belong to forward-only DDL files;
    -- seed 101 must never alter schema.
    IF EXISTS (
        SELECT 1
          FROM control.entity_operation eo
         WHERE eo.entity_version_id IS NULL
    ) THEN
        RAISE EXCEPTION '[101 contract v2] cannot promote operations: at least one row has no entity_version_id';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM control.entity_surface es
         WHERE es.entity_version_id IS NULL
    ) THEN
        RAISE EXCEPTION '[101 contract v2] cannot promote surfaces: at least one row has no entity_version_id';
    END IF;

    IF to_regclass('control.es_v2_binding_uq_idx') IS NULL
       OR to_regclass('control.eo_v2_binding_uq_idx') IS NULL
    THEN
        RAISE EXCEPTION '[101 contract v2] required version-aware indexes were not installed by DDL';
    END IF;

    RAISE NOTICE '[101 contract v2] canonical runtime/storage/type/relation/surface/operation properties materialized.';
END $$;

-- Fail the reset if the canonical policy points at a field that does not exist.
DO $$
DECLARE
    v_bad text;
BEGIN
    SELECT e.entity_code || ': ' || missing.field_name
      INTO v_bad
      FROM control.entity_version_contract c
      JOIN control.entity_version ev ON ev.id = c.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(c.data_policy->'pii_fields', '[]'::jsonb)) missing(field_name)
     WHERE NOT EXISTS (
         SELECT 1 FROM control.entity_field ef
          WHERE ef.entity_version_id = c.entity_version_id
            AND ef.name = missing.field_name
            AND ef.is_active
     )
     LIMIT 1;

    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION '[101 contract v2] data_policy.pii_fields references a missing field: %', v_bad;
    END IF;
END $$;
