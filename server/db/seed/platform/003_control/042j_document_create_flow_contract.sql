-- ============================================================================
-- Document Create Flow Contract â€” Purchase Order + Receipt
--
-- Purpose
--   Aligns document creation metadata with the audited architecture:
--     * Purchase Order is an authored document: EARLY_DRAFT + AUTO_ON_PROMOTE.
--     * Receipt is source-derived fulfillment: SOURCE_DOCUMENT_CREATE + AUTO_ON_PROMOTE.
--   Flow rows define orchestration only. Canonical field properties remain in
--   control.entity_field; entity_flow_* stores step placement/context.
-- ============================================================================

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

UPDATE control.entity
   SET create_mode = 'EARLY_DRAFT',
       draft_ttl_hours = 24,
       numbering_strategy = 'AUTO_ON_PROMOTE',
       identity_config = COALESCE(identity_config, '{}'::jsonb) || jsonb_build_object(
         'primary_key_field', 'id',
         'business_key_fields', jsonb_build_array('code'),
         'natural_key_fields', jsonb_build_array('company_code_id', 'code'),
         'numbering', jsonb_build_object(
           'enabled', true,
           'field', 'code',
           'strategy', 'AUTO_ON_PROMOTE',
           'provider', 'entity_numbering_config',
           'company_scope_field', 'company_code_id',
           'effective_date_field', 'document_date'
         ),
         'naming', jsonb_build_object(
           'field', 'name',
           'max_length', 255,
           'initiate', jsonb_build_object('kind', 'template', 'template', 'New Purchase Order'),
           'copy', jsonb_build_object(
             'kind', 'template',
             'template', 'Copy of {source.name}',
             'fallback_template', 'Copy of {source.code}',
             'normalize_copy_prefix', true
           ),
           'promote', jsonb_build_object(
             'kind', 'template',
             'template', 'Purchase Order {code}',
             'apply_when', 'system_managed'
           )
         )
       ),
       updated_at = now()
 WHERE tenant_id IS NULL
   AND entity_code = 'purchase_order';

UPDATE control.entity
   SET create_mode = 'SOURCE_DOCUMENT_CREATE',
       draft_ttl_hours = NULL,
       numbering_strategy = 'AUTO_ON_PROMOTE',
       updated_at = now()
 WHERE tenant_id IS NULL
   AND entity_code = 'receipt';

DO $$
DECLARE
  v_system uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_po_version_id uuid;
  v_receipt_version_id uuid;
  v_flow_id uuid;
BEGIN
  SELECT ev.id
    INTO v_po_version_id
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id
   WHERE e.tenant_id IS NULL
     AND e.entity_code = 'purchase_order'
     AND ev.status = 'EFFECTIVE'
   ORDER BY ev.version_no DESC
   LIMIT 1;

  SELECT ev.id
    INTO v_receipt_version_id
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id
   WHERE e.tenant_id IS NULL
     AND e.entity_code = 'receipt'
     AND ev.status = 'EFFECTIVE'
   ORDER BY ev.version_no DESC
   LIMIT 1;

  IF v_po_version_id IS NOT NULL THEN
    INSERT INTO control.entity_relation (
      tenant_id,
      entity_version_id,
      name,
      relation_kind,
      target_entity,
      resolution_kind,
      fk_field,
      source_type_field,
      source_type_value,
      source_id_field,
      source_line_field,
      runtime_role,
      on_delete,
      record_filter,
      created_by
    )
    SELECT
      NULL,
      v_po_version_id,
      r.name,
      r.relation_kind,
      r.target_entity,
      r.resolution_kind,
      r.fk_field,
      r.source_type_field,
      r.source_type_value,
      r.source_id_field,
      r.source_line_field,
      r.runtime_role,
      r.on_delete,
      r.record_filter,
      v_system
    FROM (VALUES
      ('lines',                    'has_many', 'commitment_line',          'fk',          'commitment_id', NULL,              NULL,              NULL,            NULL,             'lines',                    'cascade', '{}'::jsonb),
      ('pricing_components',       'has_many', 'pricing_component',        'polymorphic', NULL,            'source_doc_type', 'commitment_line', 'source_doc_id', 'source_line_id', 'pricing_components',       'cascade', '{"superseded_by_id":"null"}'::jsonb),
      ('accounting_distributions', 'has_many', 'accounting_distribution',  'polymorphic', NULL,            'source_doc_type', 'commitment_line', 'source_doc_id', 'source_line_id', 'accounting_distributions', 'cascade', '{}'::jsonb)
    ) AS r(name, relation_kind, target_entity, resolution_kind, fk_field, source_type_field, source_type_value, source_id_field, source_line_field, runtime_role, on_delete, record_filter)
    ON CONFLICT (entity_version_id, name)
    DO UPDATE SET
      relation_kind = EXCLUDED.relation_kind,
      target_entity = EXCLUDED.target_entity,
      resolution_kind = EXCLUDED.resolution_kind,
      fk_field = EXCLUDED.fk_field,
      source_type_field = EXCLUDED.source_type_field,
      source_type_value = EXCLUDED.source_type_value,
      source_id_field = EXCLUDED.source_id_field,
      source_line_field = EXCLUDED.source_line_field,
      runtime_role = EXCLUDED.runtime_role,
      on_delete = EXCLUDED.on_delete,
      record_filter = EXCLUDED.record_filter,
      updated_at = now(),
      updated_by = EXCLUDED.created_by;

    -- Mark pricing_components + accounting_distributions data-only so the
    -- compiler skips their auto child_records tabs. Mirrors the PI treatment
    -- in 043_control_entity_relation_contract.sql. The relations still feed
    -- DocumentRuntimeContext + line-drawer expansions; the visible "Components"
    -- surface is owned by display_config.document_runtime.surfaces in 042i.
    UPDATE control.entity_relation er
       SET ui_behavior = COALESCE(er.ui_behavior, '{}'::jsonb)
                         || jsonb_build_object(
                              'role', CASE er.name
                                        WHEN 'pricing_components'       THEN 'components'
                                        WHEN 'accounting_distributions' THEN 'accounting'
                                      END,
                              'visible_as_tab', false
                            ),
           updated_at  = now(),
           updated_by  = v_system
     WHERE er.entity_version_id = v_po_version_id
       AND er.tenant_id IS NULL
       AND er.name IN ('pricing_components', 'accounting_distributions');

    INSERT INTO control.entity_flow (
      tenant_id, entity_version_id, flow_code, label, description,
      trigger_context, is_default, config, version_no, status,
      effective_from, created_by
    )
    VALUES (
      NULL, v_po_version_id, 'purchase_order_create', 'Purchase Order Create',
      'Authoring flow for PO early draft creation. Identity is rendered by the document shell, not as a user-authored step.',
      'new', true,
      '{
         "flow_type":"DOCUMENT_CREATE",
         "default_step":"details",
         "submit_behavior":"PROMOTE_DRAFT",
         "numbering_strategy":"AUTO_ON_PROMOTE",
         "status_model":{
           "axes":["lifecycle_status","fulfillment_status","billing_status"],
           "display_status":"computed"
         },
         "preflight":{"operation":"submit.preflight","server_computed":true}
       }'::jsonb,
      1, 'active', now(), v_system
    )
    ON CONFLICT (tenant_id, entity_version_id, flow_code, version_no)
    DO UPDATE SET
      label = EXCLUDED.label,
      description = EXCLUDED.description,
      trigger_context = EXCLUDED.trigger_context,
      is_default = EXCLUDED.is_default,
      config = EXCLUDED.config,
      status = EXCLUDED.status,
      effective_from = COALESCE(control.entity_flow.effective_from, EXCLUDED.effective_from),
      updated_at = now(),
      updated_by = EXCLUDED.created_by;

    SELECT id INTO v_flow_id
      FROM control.entity_flow
     WHERE tenant_id IS NULL
       AND entity_version_id = v_po_version_id
       AND flow_code = 'purchase_order_create'
       AND version_no = 1;

    INSERT INTO control.entity_flow_step (
      tenant_id, flow_id, step_key, label, description, icon_key,
      sort_order, layout_hint, advance_rule, created_by
    )
    VALUES
      (NULL, v_flow_id, 'details',       'Details',       'Header commercial details and defaults.',        'file-text', 10, 'two_column',    '{"required_stage":"save"}'::jsonb,   v_system),
      (NULL, v_flow_id, 'lines',         'Lines',         'PO lines are authored before dependent schedules or distributions.', 'list',      20, 'line_editor',   '{"required_stage":"submit","min_rows":1}'::jsonb, v_system),
      (NULL, v_flow_id, 'schedules',     'Schedules',     'Delivery schedules derived from or attached to lines.', 'calendar',   30, 'grid',          '{}'::jsonb, v_system),
      (NULL, v_flow_id, 'distributions', 'Distributions', 'Accounting distributions at line or header level.', 'split',        40, 'grid',          '{}'::jsonb, v_system),
      (NULL, v_flow_id, 'components',    'Components',    'Optional service/BOM/pricing components.',        'blocks',     50, 'grid',          '{}'::jsonb, v_system),
      (NULL, v_flow_id, 'attachments',   'Attachments',   'Supporting files for the purchase order.',        'paperclip',  60, 'card',          '{}'::jsonb, v_system),
      (NULL, v_flow_id, 'comments',      'Comments',      'Internal and collaboration comments.',           'message',    70, 'card',          '{}'::jsonb, v_system),
      (NULL, v_flow_id, 'review',        'Review',        'Server-computed submit readiness and workflow preview.', 'check',   80, 'summary_side',  '{"preflight":"submit.preflight"}'::jsonb, v_system)
    ON CONFLICT (flow_id, step_key)
    DO UPDATE SET
      label = EXCLUDED.label,
      description = EXCLUDED.description,
      icon_key = EXCLUDED.icon_key,
      sort_order = EXCLUDED.sort_order,
      layout_hint = EXCLUDED.layout_hint,
      advance_rule = EXCLUDED.advance_rule,
      updated_at = now(),
      updated_by = EXCLUDED.created_by;
  END IF;

  IF v_receipt_version_id IS NOT NULL THEN
    INSERT INTO control.entity_flow (
      tenant_id, entity_version_id, flow_code, label, description,
      trigger_context, is_default, config, version_no, status,
      effective_from, created_by
    )
    VALUES (
      NULL, v_receipt_version_id, 'receipt_from_source', 'Receipt from Source',
      'Source-document receipt flow. Source is selected at line level to support multi-PO receiving.',
      'new', true,
      '{
         "flow_type":"SOURCE_DOCUMENT_CREATE",
         "default_step":"source",
         "submit_behavior":"PROMOTE_DRAFT",
         "numbering_strategy":"AUTO_ON_PROMOTE",
         "source_model":{
           "header_source":"derived",
           "line_level_source":true,
           "allowed_sources":["purchase_order"],
           "relation_strategy":"entity_relation"
         },
         "concurrency":{"strategy":"optimistic_source_line_version"},
         "tolerance":{"source":"control.tolerance_config"},
         "preflight":{"operation":"submit.preflight","server_computed":true}
       }'::jsonb,
      1, 'active', now(), v_system
    )
    ON CONFLICT (tenant_id, entity_version_id, flow_code, version_no)
    DO UPDATE SET
      label = EXCLUDED.label,
      description = EXCLUDED.description,
      trigger_context = EXCLUDED.trigger_context,
      is_default = EXCLUDED.is_default,
      config = EXCLUDED.config,
      status = EXCLUDED.status,
      effective_from = COALESCE(control.entity_flow.effective_from, EXCLUDED.effective_from),
      updated_at = now(),
      updated_by = EXCLUDED.created_by;

    SELECT id INTO v_flow_id
      FROM control.entity_flow
     WHERE tenant_id IS NULL
       AND entity_version_id = v_receipt_version_id
       AND flow_code = 'receipt_from_source'
       AND version_no = 1;

    INSERT INTO control.entity_flow_step (
      tenant_id, flow_id, step_key, label, description, icon_key,
      sort_order, layout_hint, advance_rule, created_by
    )
    VALUES
      (NULL, v_flow_id, 'source',      'Source',      'Select receivable PO lines/schedules from server-computed open quantities.', 'link',      10, 'grid',         '{"operation":"source.select","required_stage":"draft_start"}'::jsonb, v_system),
      (NULL, v_flow_id, 'details',     'Details',     'Receipt header defaults and receiving context.',                            'file-text', 20, 'two_column',   '{"required_stage":"save"}'::jsonb, v_system),
      (NULL, v_flow_id, 'lines',       'Lines',       'Received, accepted, and rejected quantities by source line.',                'list',      30, 'line_editor',  '{"required_stage":"submit","min_rows":1}'::jsonb, v_system),
      (NULL, v_flow_id, 'inspection',  'Inspection',  'Inspection and acceptance capture for controlled items.',                   'shield',    40, 'grid',         '{}'::jsonb, v_system),
      (NULL, v_flow_id, 'attachments', 'Attachments', 'Delivery notes, photos, and supporting files.',                             'paperclip', 50, 'card',         '{}'::jsonb, v_system),
      (NULL, v_flow_id, 'comments',    'Comments',    'Receiving comments and exception notes.',                                   'message',   60, 'card',         '{}'::jsonb, v_system),
      (NULL, v_flow_id, 'review',      'Review',      'Server-computed submit readiness, tolerance results, and conflict checks.', 'check',     70, 'summary_side', '{"preflight":"submit.preflight"}'::jsonb, v_system)
    ON CONFLICT (flow_id, step_key)
    DO UPDATE SET
      label = EXCLUDED.label,
      description = EXCLUDED.description,
      icon_key = EXCLUDED.icon_key,
      sort_order = EXCLUDED.sort_order,
      layout_hint = EXCLUDED.layout_hint,
      advance_rule = EXCLUDED.advance_rule,
      updated_at = now(),
      updated_by = EXCLUDED.created_by;
  END IF;
END $$;

COMMIT;



