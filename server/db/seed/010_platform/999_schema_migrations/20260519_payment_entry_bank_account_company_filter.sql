-- 20260519_payment_entry_bank_account_company_filter.sql
-- Scope payment_entry bank account choices to the selected company's house-bank links.

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_ev_id uuid;
    v_flow_id uuid;
    v_step_id uuid;
    v_lookup jsonb := '{
      "search_fields": ["code", "name", "account_holder_name", "account_id_value", "account_last4"],
      "filters": {
        "status": "active"
      },
      "dependent_filter": {
        "source_field": "company_code_id",
        "target_field": "id",
        "through_entity": "bank_account_link",
        "through_source_field": "owner_id",
        "through_target_field": "bank_account_id",
        "through_filters": {
          "owner_type": "company_code",
          "purpose": ["default", "disbursement"]
        },
        "sort_field": "is_primary",
        "sort_direction": "desc",
        "empty_behavior": "empty"
      }
    }'::jsonb;
BEGIN
    SELECT ev.id INTO v_ev_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.tenant_id IS NULL
       AND ev.tenant_id IS NULL
       AND e.entity_code = 'payment_entry'
       AND ev.version_no = 1;

    IF v_ev_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE control.entity_field ef
       SET validation = '{"ref_entity":"bank_account"}'::jsonb,
           lookup_config = v_lookup,
           updated_at = now(),
           updated_by = v_su
     WHERE ef.entity_version_id = v_ev_id
       AND ef.tenant_id IS NULL
       AND ef.name = 'bank_account_id'
       AND (
           ef.validation IS DISTINCT FROM '{"ref_entity":"bank_account"}'::jsonb
           OR COALESCE(ef.lookup_config, '{}'::jsonb) IS DISTINCT FROM v_lookup
       );

    SELECT f.id INTO v_flow_id
      FROM control.entity_flow f
     WHERE f.entity_version_id = v_ev_id
       AND f.tenant_id IS NULL
       AND f.flow_code = 'create_payment';

    SELECT s.id INTO v_step_id
      FROM control.entity_flow_step s
     WHERE s.flow_id = v_flow_id
       AND s.tenant_id IS NULL
       AND s.step_key = 'details';

    IF v_step_id IS NOT NULL THEN
        UPDATE control.entity_flow_step
           SET advance_rule = COALESCE(advance_rule, '{}'::jsonb)
               || jsonb_build_object(
                    'required_fields',
                    jsonb_build_array(
                        'payment_type',
                        'company_code_id',
                        'supplier_id',
                        'document_date',
                        'posting_date',
                        'currency_code',
                        'payment_amount',
                        'bank_account_id'
                    )
                  ),
               updated_at = now(),
               updated_by = v_su
         WHERE id = v_step_id
           AND tenant_id IS NULL;

        DELETE FROM control.entity_flow_field eff
         USING control.entity_field ef
         WHERE eff.flow_step_id = v_step_id
           AND eff.tenant_id IS NULL
           AND eff.entity_field_id = ef.id
           AND ef.entity_version_id = v_ev_id
           AND ef.name = 'company_code_id';

        INSERT INTO control.entity_flow_field (
            tenant_id, flow_step_id, entity_field_id,
            mode, derivation_mode, ui_variant,
            visible_when, required_when,
            default_source, derive_expression, override_permission,
            summary_role, span, help_text, sort_order, created_by)
        SELECT
            NULL, v_step_id, ef.id,
            'required', 'derived_overrideable', 'inline_search',
            NULL::jsonb, NULL::jsonb,
            NULL, 'ctx.user.default_company_code', 'ap.override_company_code',
            NULL, 1, 'Company code paying this entry.', 15, v_su
          FROM control.entity_field ef
         WHERE ef.entity_version_id = v_ev_id
           AND ef.tenant_id IS NULL
           AND ef.name = 'company_code_id';
    END IF;

    WITH version_payload AS (
        SELECT
            ev.id AS entity_version_id,
            jsonb_build_object(
                'version', jsonb_build_object(
                    'id', ev.id,
                    'entity_id', ev.entity_id,
                    'version_no', ev.version_no,
                    'behaviors', ev.behaviors
                ),
                'entity', jsonb_build_object(
                    'entity_code', e.entity_code,
                    'name', e.name,
                    'slug', e.slug,
                    'entity_class', e.entity_class,
                    'table_schema', e.table_schema,
                    'table_name', e.table_name,
                    'backing_type', e.backing_type
                ),
                'fields', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', ef.id,
                            'name', ef.name,
                            'column_name', ef.column_name,
                            'label', ef.label,
                            'description', ef.description,
                            'data_type', ef.data_type,
                            'ui_type', ef.ui_type,
                            'format', ef.format,
                            'unit', ef.unit,
                            'cardinality', ef.cardinality,
                            'origin', ef.origin,
                            'is_required', ef.is_required,
                            'is_unique', ef.is_unique,
                            'unique_scope', ef.unique_scope,
                            'is_searchable', ef.is_searchable,
                            'is_filterable', ef.is_filterable,
                            'is_sortable', ef.is_sortable,
                            'is_groupable', ef.is_groupable,
                            'is_aggregatable', ef.is_aggregatable,
                            'is_read_only', ef.is_read_only,
                            'is_deprecated', ef.is_deprecated,
                            'is_computed', ef.is_computed,
                            'is_write_once', ef.is_write_once,
                            'compute_mode', ef.compute_mode,
                            'compute_expr', ef.compute_expr,
                            'enum_config', ef.enum_config,
                            'enum_domain_code', ef.enum_domain_code,
                            'enum_kind', ef.enum_kind,
                            'reference_config', ef.reference_config,
                            'fk_target_entity_id', ef.fk_target_entity_id,
                            'fk_target_field', ef.fk_target_field,
                            'fk_on_delete', ef.fk_on_delete,
                            'fk_on_update', ef.fk_on_update,
                            'fk_relationship_class', ef.fk_relationship_class,
                            'json_config', ef.json_config,
                            'money_config', ef.money_config,
                            'datetime_config', ef.datetime_config,
                            'ui_hint', ef.ui_hint,
                            'visibility', ef.visibility,
                            'editability', ef.editability,
                            'lookup_config', ef.lookup_config,
                            'lookup_profile', ef.lookup_profile,
                            'child_entity_name', ef.child_entity_name,
                            'child_fk_field', ef.child_fk_field,
                            'collection_behavior', ef.collection_behavior,
                            'validation', ef.validation,
                            'constraints', ef.constraints,
                            'default_value', ef.default_value,
                            'sort_order', ef.sort_order
                        )
                        ORDER BY ef.sort_order, ef.name, ef.id
                    )
                    FROM control.entity_field ef
                    WHERE ef.entity_version_id = ev.id
                      AND ef.tenant_id IS NULL
                      AND ef.is_active = true
                ), '[]'::jsonb)
            ) AS payload
        FROM control.entity_version ev
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE ev.tenant_id IS NULL
          AND e.tenant_id IS NULL
          AND e.entity_code = 'payment_entry'
          AND ev.version_no = 1
    ),
    computed_hash AS (
        SELECT
            entity_version_id,
            encode(sha256(convert_to(payload::text, 'UTF8')), 'hex') AS version_hash
        FROM version_payload
    )
    UPDATE control.entity_version ev
       SET version_hash = ch.version_hash,
           updated_at = now(),
           updated_by = v_su
      FROM computed_hash ch
     WHERE ev.id = ch.entity_version_id
       AND ev.tenant_id IS NULL
       AND ev.version_hash IS DISTINCT FROM ch.version_hash;
END $$;
