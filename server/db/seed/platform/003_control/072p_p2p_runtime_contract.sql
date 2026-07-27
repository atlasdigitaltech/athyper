-- P2P runtime contract â€” runtime metadata for PR / POC / DN / Receipt / SES / schedule_line
-- + PI/PO cross-refs. P2P parallel of the AP contract (042d) and three-plane contract (095).
-- Runs at 072 because Â§6 hooks need the action_registry guard from 070.
-- Section map:
--   Â§0  Line list display defaults
--   Â§1  Relations                       (control.entity_relation)
--   Â§2a Operations                      (control.entity_operation)
--   Â§2b Numbering configs               (control.entity_numbering_config)
--   Â§3  Action rules                    (control.entity_action_rule)
--   Â§4  Field security                  (control.field_security_policy)
--   Â§5  Workflows                       (workflow_template/_stage/_rule + workflow_definition)
--   Â§6a Transition hooks (after)        (control.lifecycle_transition_hook)
--   Â§6b Workflow-start hooks (before)   (control.lifecycle_transition_hook)
--   Â§7  Notification templates          (control.notification_template)
--   Â§8  Notification routing            (control.notification_routing_rule)
--   Â§9  State masks                     (control.entity_lifecycle_state_mask)

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

-- Â§0 Line list display defaults â€” RECONCILED (Batch 6E).
-- Line display_config (list_columns, default_sort_field, line_ui_variant) is
-- now owned exclusively by 042p_p2p_foundation_contract.sql Â§1. Two seed
-- files writing to the same display_config keys was a drift vector â€” 072p
-- ran last and silently overrode 042p, so any 042p edit would look effective
-- but be swallowed. See Batch 5C lint rule B1.line.status for a regression
-- guard.


-- Â§1 Relations â€” mirrors the PI pattern in 043_control_entity_relation_contract.sql.
DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    IF NOT EXISTS (
        SELECT 1 FROM control.entity_version ev
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.entity_code = 'purchase_invoice' AND e.tenant_id IS NULL AND ev.version_no = 1
    ) THEN
        RAISE NOTICE '072p Â§1 relations: purchase_invoice entity_version not found â€” skipped';
        RETURN;
    END IF;

    INSERT INTO control.entity_relation (
        tenant_id, entity_version_id, name, relation_kind, target_entity,
        resolution_kind, fk_field, source_type_field, source_type_value,
        source_id_field, source_line_field, runtime_role, on_delete,
        record_filter, created_by
    )
    SELECT
        NULL,
        ev.id,
        r.rel_name,
        r.kind,
        r.target_entity,
        r.resolution_kind,
        r.fk_field,
        r.source_type_field,
        r.source_type_value,
        r.source_id_field,
        r.source_line_field,
        r.runtime_role,
        r.on_del,
        r.record_filter,
        v_su
    FROM (VALUES

        -- â”€â”€ purchase_requisition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('purchase_requisition', 'company_code',          'belongs_to', 'company_code',              'fk',          'company_code_id',         NULL,              NULL,                          NULL,             NULL,              NULL,         'restrict', '{}'::jsonb),
        -- purchase_requisition.suggested_supplier_ids is uuid[]. Resolved via
        -- `WHERE :target_id = ANY(source.suggested_supplier_ids)` â€” see
        -- resolution_kind='array_fk' (er_resolution_config_chk enforces
        -- has_many + fk_field NOT NULL).
        ('purchase_requisition', 'suggested_suppliers',   'has_many',   'supplier',                  'array_fk',    'suggested_supplier_ids',  NULL,              NULL,                          NULL,             NULL,              NULL,         'no_action','{}'::jsonb),
        ('purchase_requisition', 'requested_by',          'belongs_to', 'principal',                 'fk',          'requested_by',            NULL,              NULL,                          NULL,             NULL,              NULL,         'restrict', '{}'::jsonb),
        ('purchase_requisition', 'workflow_request',      'belongs_to', 'workflow_request',          'fk',          'workflow_request_id',     NULL,              NULL,                          NULL,             NULL,              NULL,         'set_null', '{}'::jsonb),
        ('purchase_requisition', 'lines',                 'has_many',   'purchase_requisition_line', 'fk',          'purchase_requisition_id', NULL,              NULL,                          NULL,             NULL,              'lines',      'cascade',  '{}'::jsonb),
        ('purchase_requisition', 'schedules',             'has_many',   'schedule_line',             'polymorphic', NULL,                      'source_doc_type', 'purchase_requisition_line',   'source_doc_id',  'source_line_id',  'schedules',  'cascade',  '{"is_current_version":true}'::jsonb),
        ('purchase_requisition_line', 'purchase_requisition', 'belongs_to', 'purchase_requisition',  'fk',          'purchase_requisition_id', NULL,              NULL,                          NULL,             NULL,              NULL,         'cascade',  '{}'::jsonb),
        ('purchase_requisition_line', 'pricing_components', 'has_many', 'pricing_component',          'polymorphic', NULL,                      'source_doc_type', 'purchase_requisition_line',   'source_line_id', NULL,              'pricing_components', 'cascade', '{"superseded_by_id":"null"}'::jsonb),
        ('purchase_requisition_line', 'distributions',      'has_many', 'accounting_distribution',    'polymorphic', NULL,                      'source_doc_type', 'purchase_requisition_line',   'source_line_id', NULL,              'accounting_distributions', 'cascade', '{}'::jsonb),

        -- â”€â”€ purchase_order_confirmation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('purchase_order_confirmation', 'company_code',         'belongs_to', 'company_code',                  'fk', 'company_code_id',        NULL, NULL, NULL, NULL, NULL,    'restrict', '{}'::jsonb),
        ('purchase_order_confirmation', 'purchase_order',       'belongs_to', 'purchase_order',                'fk', 'commitment_id',          NULL, NULL, NULL, NULL, NULL,    'restrict', '{}'::jsonb),
        ('purchase_order_confirmation', 'amendment_commitment', 'belongs_to', 'purchase_order',                'fk', 'amendment_commitment_id',NULL, NULL, NULL, NULL, NULL,    'set_null', '{}'::jsonb),
        ('purchase_order_confirmation', 'supplier',             'belongs_to', 'supplier',                      'fk', 'supplier_id',            NULL, NULL, NULL, NULL, NULL,    'restrict', '{}'::jsonb),
        ('purchase_order_confirmation', 'lines',                'has_many',   'purchase_order_confirmation_line','fk','confirmation_id',       NULL, NULL, NULL, NULL, 'lines', 'cascade',  '{}'::jsonb),
        ('purchase_order_confirmation_line', 'confirmation',    'belongs_to', 'purchase_order_confirmation',   'fk', 'confirmation_id',        NULL, NULL, NULL, NULL, NULL,    'cascade',  '{}'::jsonb),
        ('purchase_order_confirmation_line', 'commitment_line', 'belongs_to', 'commitment_line',               'fk', 'commitment_line_id',     NULL, NULL, NULL, NULL, NULL,    'restrict', '{}'::jsonb),

        -- â”€â”€ delivery_note â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('delivery_note', 'company_code',        'belongs_to', 'company_code',     'fk', 'company_code_id',       NULL, NULL, NULL, NULL, NULL,     'restrict', '{}'::jsonb),
        ('delivery_note', 'purchase_order',      'belongs_to', 'purchase_order',   'fk', 'commitment_id',         NULL, NULL, NULL, NULL, NULL,     'restrict', '{}'::jsonb),
        ('delivery_note', 'supplier',            'belongs_to', 'supplier',         'fk', 'supplier_id',           NULL, NULL, NULL, NULL, NULL,     'restrict', '{}'::jsonb),
        ('delivery_note', 'delivery_site',       'belongs_to', 'site',             'fk', 'delivery_site_id',      NULL, NULL, NULL, NULL, NULL,     'restrict', '{}'::jsonb),
        ('delivery_note', 'delivery_warehouse',  'belongs_to', 'warehouse',        'fk', 'delivery_warehouse_id', NULL, NULL, NULL, NULL, NULL,     'set_null', '{}'::jsonb),
        ('delivery_note', 'lines',               'has_many',   'delivery_note_line','fk','delivery_note_id',      NULL, NULL, NULL, NULL, 'lines',  'cascade',  '{}'::jsonb),
        ('delivery_note', 'receipts',            'has_many',   'receipt',          'fk', 'delivery_note_id',      NULL, NULL, NULL, NULL, 'receipts','restrict','{}'::jsonb),
        ('delivery_note_line', 'delivery_note',  'belongs_to', 'delivery_note',    'fk', 'delivery_note_id',      NULL, NULL, NULL, NULL, NULL,     'cascade',  '{}'::jsonb),
        ('delivery_note_line', 'commitment_line','belongs_to', 'commitment_line',  'fk', 'commitment_line_id',    NULL, NULL, NULL, NULL, NULL,     'restrict', '{}'::jsonb),

        -- â”€â”€ receipt (formerly goods_receipt) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('receipt', 'company_code',         'belongs_to', 'company_code',     'fk', 'company_code_id',        NULL, NULL, NULL, NULL, NULL,    'restrict', '{}'::jsonb),
        ('receipt', 'purchase_order',       'belongs_to', 'purchase_order',   'fk', 'commitment_id',          NULL, NULL, NULL, NULL, NULL,    'restrict', '{}'::jsonb),
        ('receipt', 'delivery_note',        'belongs_to', 'delivery_note',    'fk', 'delivery_note_id',       NULL, NULL, NULL, NULL, NULL,    'set_null', '{}'::jsonb),
        ('receipt', 'supplier',             'belongs_to', 'supplier',         'fk', 'supplier_id',            NULL, NULL, NULL, NULL, NULL,    'restrict', '{}'::jsonb),
        ('receipt', 'accrual_journal_entry','belongs_to', 'journal_entry',    'fk', 'accrual_je_id',          NULL, NULL, NULL, NULL, NULL,    'set_null', '{}'::jsonb),
        ('receipt', 'workflow_request',     'belongs_to', 'workflow_request', 'fk', 'workflow_request_id',    NULL, NULL, NULL, NULL, NULL,    'set_null', '{}'::jsonb),
        ('receipt', 'lines',                'has_many',   'receipt_line',     'fk', 'receipt_id',             NULL, NULL, NULL, NULL, 'lines', 'cascade',  '{}'::jsonb),
        ('receipt_line', 'receipt',         'belongs_to', 'receipt',          'fk', 'receipt_id',             NULL, NULL, NULL, NULL, NULL,    'cascade',  '{}'::jsonb),
        ('receipt_line', 'commitment_line', 'belongs_to', 'commitment_line',  'fk', 'commitment_line_id',     NULL, NULL, NULL, NULL, NULL,    'restrict', '{}'::jsonb),
        ('receipt_line', 'delivery_note_line','belongs_to','delivery_note_line','fk','delivery_note_line_id', NULL, NULL, NULL, NULL, NULL,    'set_null', '{}'::jsonb),
        ('receipt', 'pricing_components',   'has_many',   'pricing_component',       'polymorphic', NULL, 'source_doc_type', 'receipt_line',       'source_doc_id',  'source_line_id', 'pricing_components', 'cascade', '{"superseded_by_id":"null"}'::jsonb),
        ('receipt', 'accounting_distributions','has_many','accounting_distribution', 'polymorphic', NULL, 'source_doc_type', 'receipt_line',       'source_doc_id',  'source_line_id', 'accounting_distributions', 'cascade', '{}'::jsonb),
        ('receipt_line', 'pricing_components','has_many', 'pricing_component',       'polymorphic', NULL, 'source_doc_type', 'receipt_line',       'source_line_id', NULL,             'pricing_components', 'cascade', '{"superseded_by_id":"null"}'::jsonb),
        ('receipt_line', 'distributions',     'has_many', 'accounting_distribution', 'polymorphic', NULL, 'source_doc_type', 'receipt_line',       'source_line_id', NULL,             'accounting_distributions', 'cascade', '{}'::jsonb),

        -- â”€â”€ service_sheet (formerly service_entry_sheet) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('service_sheet', 'company_code',          'belongs_to', 'company_code',     'fk', 'company_code_id',       NULL, NULL, NULL, NULL, NULL,    'restrict', '{}'::jsonb),
        ('service_sheet', 'purchase_order',        'belongs_to', 'purchase_order',   'fk', 'commitment_id',         NULL, NULL, NULL, NULL, NULL,    'restrict', '{}'::jsonb),
        ('service_sheet', 'supplier',              'belongs_to', 'supplier',         'fk', 'supplier_id',           NULL, NULL, NULL, NULL, NULL,    'restrict', '{}'::jsonb),
        ('service_sheet', 'accrual_journal_entry', 'belongs_to', 'journal_entry',    'fk', 'accrual_je_id',         NULL, NULL, NULL, NULL, NULL,    'set_null', '{}'::jsonb),
        ('service_sheet', 'workflow_request',      'belongs_to', 'workflow_request', 'fk', 'workflow_request_id',   NULL, NULL, NULL, NULL, NULL,    'set_null', '{}'::jsonb),
        ('service_sheet', 'lines',                 'has_many',   'service_sheet_line','fk','service_sheet_id',      NULL, NULL, NULL, NULL, 'lines', 'cascade',  '{}'::jsonb),
        ('service_sheet_line', 'service_sheet',    'belongs_to', 'service_sheet',    'fk', 'service_sheet_id',      NULL, NULL, NULL, NULL, NULL,    'cascade',  '{}'::jsonb),
        ('service_sheet_line', 'commitment_line',  'belongs_to', 'commitment_line',  'fk', 'commitment_line_id',    NULL, NULL, NULL, NULL, NULL,    'restrict', '{}'::jsonb),
        ('service_sheet_line', 'site',             'belongs_to', 'site',             'fk', 'site_id',               NULL, NULL, NULL, NULL, NULL,    'set_null', '{}'::jsonb),
        ('service_sheet', 'pricing_components',    'has_many',   'pricing_component',       'polymorphic', NULL, 'source_doc_type', 'service_sheet_line', 'source_doc_id',  'source_line_id', 'pricing_components', 'cascade', '{"superseded_by_id":"null"}'::jsonb),
        ('service_sheet', 'accounting_distributions','has_many', 'accounting_distribution', 'polymorphic', NULL, 'source_doc_type', 'service_sheet_line', 'source_doc_id',  'source_line_id', 'accounting_distributions', 'cascade', '{}'::jsonb),
        ('service_sheet_line', 'pricing_components','has_many',  'pricing_component',       'polymorphic', NULL, 'source_doc_type', 'service_sheet_line', 'source_line_id', NULL,             'pricing_components', 'cascade', '{"superseded_by_id":"null"}'::jsonb),
        ('service_sheet_line', 'distributions',     'has_many',  'accounting_distribution', 'polymorphic', NULL, 'source_doc_type', 'service_sheet_line', 'source_line_id', NULL,             'accounting_distributions', 'cascade', '{}'::jsonb),

        -- â”€â”€ schedule_line back-refs (polymorphic carrier) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- Header-scoped relations use source_doc_id + source_line_field; line-
        -- scoped relations use source_line_id as the id field and leave
        -- source_line_field NULL (matches existing PI distributions pattern).
        ('commitment',          'schedules',          'has_many',   'schedule_line', 'polymorphic', NULL, 'source_doc_type', 'commitment_line',           'source_doc_id',  'source_line_id', 'schedules', 'cascade', '{"is_current_version":true}'::jsonb),
        ('commitment_line',     'schedules',          'has_many',   'schedule_line', 'polymorphic', NULL, 'source_doc_type', 'commitment_line',           'source_line_id', NULL,             'schedules', 'cascade', '{"is_current_version":true}'::jsonb),
        ('commitment',          'pricing_components', 'has_many',   'pricing_component',       'polymorphic', NULL, 'source_doc_type', 'commitment_line',           'source_doc_id',  'source_line_id', 'pricing_components', 'cascade', '{"superseded_by_id":"null"}'::jsonb),
        ('commitment',          'accounting_distributions','has_many','accounting_distribution','polymorphic', NULL, 'source_doc_type', 'commitment_line',           'source_doc_id',  'source_line_id', 'accounting_distributions', 'cascade', '{}'::jsonb),
        ('commitment_line',     'pricing_components', 'has_many',   'pricing_component',       'polymorphic', NULL, 'source_doc_type', 'commitment_line',           'source_line_id', NULL,             'pricing_components', 'cascade', '{"superseded_by_id":"null"}'::jsonb),
        ('commitment_line',     'distributions',      'has_many',   'accounting_distribution', 'polymorphic', NULL, 'source_doc_type', 'commitment_line',           'source_line_id', NULL,             'accounting_distributions', 'cascade', '{}'::jsonb),
        ('purchase_order',      'schedules',          'has_many',   'schedule_line',           'polymorphic', NULL, 'source_doc_type', 'commitment_line',           'source_doc_id',  'source_line_id', 'schedules', 'cascade', '{"is_current_version":true}'::jsonb),
        ('purchase_order',      'pricing_components', 'has_many',   'pricing_component',       'polymorphic', NULL, 'source_doc_type', 'commitment_line',           'source_doc_id',  'source_line_id', 'pricing_components', 'cascade', '{"superseded_by_id":"null"}'::jsonb),
        ('purchase_order',      'accounting_distributions','has_many','accounting_distribution','polymorphic', NULL, 'source_doc_type', 'commitment_line',           'source_doc_id',  'source_line_id', 'accounting_distributions', 'cascade', '{}'::jsonb),
        ('purchase_invoice',    'schedules',          'has_many',   'schedule_line', 'polymorphic', NULL, 'source_doc_type', 'purchase_invoice_line',     'source_doc_id',  'source_line_id', 'schedules', 'cascade', '{"is_current_version":true}'::jsonb),
        ('purchase_invoice_line','schedules',         'has_many',   'schedule_line', 'polymorphic', NULL, 'source_doc_type', 'purchase_invoice_line',     'source_line_id', NULL,             'schedules', 'cascade', '{"is_current_version":true}'::jsonb),

        -- â”€â”€ PI-line cross-refs to new FK columns (receipt_line / service_sheet_line) â”€â”€
        ('purchase_invoice_line', 'receipt_line',       'belongs_to', 'receipt_line',       'fk', 'receipt_line_id',       NULL, NULL, NULL, NULL, NULL, 'set_null', '{}'::jsonb),
        ('purchase_invoice_line', 'service_sheet_line', 'belongs_to', 'service_sheet_line', 'fk', 'service_sheet_line_id', NULL, NULL, NULL, NULL, NULL, 'set_null', '{}'::jsonb),

        -- â”€â”€ Payment allocations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('purchase_invoice', 'payment_allocations', 'has_many',   'payment_entry_allocation', 'fk', 'purchase_invoice_id', NULL, NULL, NULL, NULL, 'payment_allocations', 'restrict', '{}'::jsonb),
        ('commitment',       'payment_allocations', 'has_many',   'payment_entry_allocation', 'fk', 'commitment_id',       NULL, NULL, NULL, NULL, 'payment_allocations', 'restrict', '{}'::jsonb),
        ('purchase_order',   'payment_allocations', 'has_many',   'payment_entry_allocation', 'fk', 'commitment_id',       NULL, NULL, NULL, NULL, 'payment_allocations', 'restrict', '{}'::jsonb),
        ('payment_entry',    'allocations',         'has_many',   'payment_entry_allocation', 'fk', 'payment_entry_id',    NULL, NULL, NULL, NULL, 'allocations',          'cascade',  '{}'::jsonb),
        ('payment_entry_allocation', 'payment_entry',    'belongs_to', 'payment_entry',    'fk', 'payment_entry_id',    NULL, NULL, NULL, NULL, NULL, 'cascade',  '{}'::jsonb),
        ('payment_entry_allocation', 'purchase_invoice', 'belongs_to', 'purchase_invoice', 'fk', 'purchase_invoice_id', NULL, NULL, NULL, NULL, NULL, 'set_null', '{}'::jsonb),
        ('payment_entry_allocation', 'commitment',       'belongs_to', 'commitment',       'fk', 'commitment_id',       NULL, NULL, NULL, NULL, NULL, 'set_null', '{}'::jsonb)
    ) AS r(entity, rel_name, kind, target_entity, resolution_kind, fk_field, source_type_field, source_type_value, source_id_field, source_line_field, runtime_role, on_del, record_filter)
    JOIN control.entity         e  ON e.entity_code = r.entity AND e.tenant_id IS NULL
    JOIN control.entity_version ev ON ev.entity_id  = e.id
                                  AND ev.version_no  = 1
                                  AND ev.tenant_id   IS NULL
    ON CONFLICT (entity_version_id, name) DO UPDATE
       SET relation_kind     = EXCLUDED.relation_kind,
           target_entity     = EXCLUDED.target_entity,
           resolution_kind   = EXCLUDED.resolution_kind,
           fk_field          = EXCLUDED.fk_field,
           source_type_field = EXCLUDED.source_type_field,
           source_type_value = EXCLUDED.source_type_value,
           source_id_field   = EXCLUDED.source_id_field,
           source_line_field = EXCLUDED.source_line_field,
           runtime_role      = EXCLUDED.runtime_role,
           on_delete         = EXCLUDED.on_delete,
           record_filter     = EXCLUDED.record_filter;

    RAISE NOTICE '072p Â§1: seeded relations for PR/POC/DN/receipt/service_sheet + schedule_line + PI-line cross-refs.';
    -- PO authoring surface hygiene:
    --   - pricing_components belongs in the domain Components/Pricing surface.
    --   - schedules and accounting_distributions belong in the document
    --     runtime Schedules/Accounting surfaces.
    --   - payment_allocations are settlement/application history, not an
    --     authoring tab on a PO. Keep the relation for traceability, but hide
    --     it from the generic relation-tab compiler.
    UPDATE control.entity_relation er
       SET ui_behavior = COALESCE(er.ui_behavior, '{}'::jsonb)
                         || CASE er.name
                              WHEN 'pricing_components' THEN
                                jsonb_build_object(
                                  'label', 'Components',
                                  'role', 'components',
                                  'placement', 'main',
                                  'visible_as_tab', false,
                                  'sort_order', 1030
                                )
                              WHEN 'schedules' THEN
                                jsonb_build_object(
                                  'role', 'schedules',
                                  'visible_as_tab', false
                                )
                              WHEN 'accounting_distributions' THEN
                                jsonb_build_object(
                                  'role', 'accounting',
                                  'visible_as_tab', false
                                )
                              WHEN 'payment_allocations' THEN
                                jsonb_build_object(
                                  'role', 'settlement_history',
                                  'visible_as_tab', false
                                )
                              ELSE '{}'::jsonb
                            END,
           updated_at  = now(),
           updated_by  = v_su
      FROM control.entity_version ev
      JOIN control.entity e
        ON e.id = ev.entity_id
       AND e.tenant_id IS NULL
       AND e.entity_code = 'purchase_order'
     WHERE er.entity_version_id = ev.id
       AND ev.tenant_id IS NULL
       AND ev.version_no = 1
       AND er.tenant_id IS NULL
       AND er.name IN (
         'pricing_components',
         'schedules',
         'accounting_distributions',
         'payment_allocations'
       );
END $$;


-- Â§2a Operations
-- Mirrors the existing PI block in 044_control_entity_operation_contract.sql.
-- Each row binds an op verb to a UI surface placement and handler.
-- The op verb matches the lifecycle_transition.operation_code so the runtime
-- can resolve "what action handlers does this state expose" via a join.

INSERT INTO control.entity_operation (
    tenant_id, entity_name, permission_code,
    surface, placement, handler_type, handler_target,
    is_record_required, sort_order, created_by
)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    -- â”€â”€ purchase_requisition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL, 'purchase_requisition', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', '/app/purchase_requisition/new',       false, 10,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_requisition', 'update',  'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/purchase_requisition/{id}/edit', true,  20,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_requisition', 'submit',  'DETAIL', 'PRIMARY',  'MODAL',    'flow:submit_for_approval',            true,  30,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_requisition', 'approve', 'DETAIL', 'PRIMARY',  'MODAL',    'approve',                             true,  40,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_requisition', 'deny',    'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                                true,  50,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_requisition', 'amend',   'DETAIL', 'OVERFLOW', 'MODAL',    'amend',                               true,  60,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_requisition', 'convert', 'DETAIL', 'OVERFLOW', 'MODAL',    'flow:convert_to_po',                  true,  70,  '00000000-0000-0000-0000-000000000000'),
    -- Promoted-flow entry point: NAVIGATE to /p2p/commitment-from-requisition.
    (NULL, 'purchase_requisition', 'create_commitment', 'DETAIL', 'PRIMARY', 'NAVIGATE', '/p2p/commitment-from-requisition?requisitionId={id}', true, 71, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_requisition', 'close',   'DETAIL', 'OVERFLOW', 'MODAL',    'close',                               true,  80,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_requisition', 'cancel',  'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                              true,  90,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_requisition', 'copy',    'DETAIL', 'OVERFLOW', 'API',      'copy',                                true,  100, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_requisition', 'export',  'LIST',   'TOOLBAR',  'API',      'export',                              false, 110, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ purchase_order_confirmation (supplier-driven; no create/update from buyer side) â”€â”€
    (NULL, 'purchase_order_confirmation', 'confirm',         'DETAIL', 'PRIMARY',  'MODAL', 'flow:confirm_po',         true,  10,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order_confirmation', 'propose_changes', 'DETAIL', 'PRIMARY',  'MODAL', 'flow:propose_changes',    true,  20,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order_confirmation', 'reject',          'DETAIL', 'TOOLBAR',  'MODAL', 'reject',                  true,  30,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order_confirmation', 'accept_changes',  'DETAIL', 'PRIMARY',  'MODAL', 'flow:accept_changes',     true,  40,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order_confirmation', 'reject_changes',  'DETAIL', 'TOOLBAR',  'MODAL', 'flow:reject_changes',     true,  50,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order_confirmation', 'cancel',          'DETAIL', 'OVERFLOW', 'MODAL', 'cancel',                  true,  60,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order_confirmation', 'export',          'LIST',   'TOOLBAR',  'API',   'export',                  false, 70,  '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ delivery_note â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL, 'delivery_note', 'create',       'LIST',   'PRIMARY',  'NAVIGATE', '/app/delivery_note/new',       false, 10,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'delivery_note', 'update',       'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/delivery_note/{id}/edit', true,  20,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'delivery_note', 'dispatch',     'DETAIL', 'PRIMARY',  'MODAL',    'flow:dispatch',                true,  30,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'delivery_note', 'mark_arrived', 'DETAIL', 'PRIMARY',  'MODAL',    'flow:mark_arrived',            true,  40,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'delivery_note', 'receipt',      'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/receipt/new?dn={id}',     true,  50,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'delivery_note', 'return',       'DETAIL', 'OVERFLOW', 'MODAL',    'flow:return',                  true,  60,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'delivery_note', 'cancel',       'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                       true,  70,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'delivery_note', 'export',       'LIST',   'TOOLBAR',  'API',      'export',                       false, 80,  '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ receipt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL, 'receipt', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', '/app/receipt/new',       false, 10,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'receipt', 'update',  'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/receipt/{id}/edit', true,  20,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'receipt', 'submit',  'DETAIL', 'PRIMARY',  'MODAL',    'flow:submit_for_approval',true, 30,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'receipt', 'approve', 'DETAIL', 'PRIMARY',  'MODAL',    'approve',                true,  40,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'receipt', 'amend',   'DETAIL', 'TOOLBAR',  'MODAL',    'amend',                  true,  50,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'receipt', 'post',    'DETAIL', 'PRIMARY',  'MODAL',    'flow:post_receipt',      true,  60,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'receipt', 'reverse', 'DETAIL', 'OVERFLOW', 'MODAL',    'flow:reverse_receipt',   true,  70,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'receipt', 'cancel',  'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                 true,  80,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'receipt', 'copy',    'DETAIL', 'OVERFLOW', 'API',      'copy',                   true,  90,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'receipt', 'export',  'LIST',   'TOOLBAR',  'API',      'export',                 false, 100, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ service_sheet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL, 'service_sheet', 'create',                'LIST',   'PRIMARY',  'NAVIGATE', '/app/service_sheet/new',       false, 10,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet', 'update',                'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/service_sheet/{id}/edit', true,  20,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet', 'submit_for_acceptance', 'DETAIL', 'PRIMARY',  'MODAL',    'flow:submit_for_acceptance',   true,  30,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet', 'accept',                'DETAIL', 'PRIMARY',  'MODAL',    'accept',                       true,  40,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet', 'reject_acceptance',     'DETAIL', 'TOOLBAR',  'MODAL',    'reject_acceptance',            true,  50,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet', 'submit',                'DETAIL', 'PRIMARY',  'MODAL',    'flow:submit_for_approval',     true,  60,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet', 'approve',               'DETAIL', 'PRIMARY',  'MODAL',    'approve',                      true,  70,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet', 'amend',                 'DETAIL', 'TOOLBAR',  'MODAL',    'amend',                        true,  80,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet', 'post',                  'DETAIL', 'PRIMARY',  'MODAL',    'flow:post_service_sheet',      true,  90,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet', 'reverse',               'DETAIL', 'OVERFLOW', 'MODAL',    'flow:reverse_service_sheet',   true,  100, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet', 'cancel',                'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                       true,  110, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet', 'copy',                  'DETAIL', 'OVERFLOW', 'API',      'copy',                         true,  120, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet', 'export',                'LIST',   'TOOLBAR',  'API',      'export',                       false, 130, '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- Separate the UI flow selector from the server lifecycle command. The modal
-- keeps handler_target='flow:submit_for_approval'; execution is entity-scoped
-- through lifecycle:submit.
UPDATE control.entity_operation eo
   SET execution_target = v.execution_target,
       updated_at = CASE WHEN eo.execution_target IS DISTINCT FROM v.execution_target THEN now() ELSE eo.updated_at END,
       updated_by = CASE WHEN eo.execution_target IS DISTINCT FROM v.execution_target
                         THEN '00000000-0000-0000-0000-000000000000'::uuid ELSE eo.updated_by END
  FROM (VALUES
    ('purchase_requisition', 'submit', 'lifecycle:submit'),
    ('receipt',              'submit', 'lifecycle:submit'),
    ('service_sheet',        'submit', 'lifecycle:submit')
  ) AS v(entity_name, permission_code, execution_target)
 WHERE eo.tenant_id IS NULL
   AND eo.entity_name = v.entity_name
   AND eo.permission_code = v.permission_code
   AND eo.execution_target IS DISTINCT FROM v.execution_target;


-- Â§2b Numbering configs
-- Mirrors the PI block in 050_control_entity_numbering_config_contract.sql.
-- Per-tenant per-company sequential numbering with platform-default scope.
-- Number field captured here is the canonical UX label (document_no); the
-- physical column is stamped via metadata.physical_column.

WITH configs AS (
    SELECT *
    FROM (VALUES
        -- purchase_requisition â†’ REQ
        (
            'purchase_requisition', 'document_no', 'REQ', true, '-',
            jsonb_build_array(
                jsonb_build_object('type', 'year', 'format', 'YYYY'),
                jsonb_build_object('type', 'sequence', 'padding', 5)
            ),
            'yearly', 'company', 50, 'upper_alnum_dash',
            jsonb_build_object('source', 'platform_default', 'physical_column', 'requisition_number')
        ),
        -- purchase_order_confirmation â†’ POC
        (
            'purchase_order_confirmation', 'document_no', 'POC', true, '-',
            jsonb_build_array(
                jsonb_build_object('type', 'year', 'format', 'YYYY'),
                jsonb_build_object('type', 'sequence', 'padding', 5)
            ),
            'yearly', 'company', 50, 'upper_alnum_dash',
            jsonb_build_object('source', 'platform_default', 'physical_column', 'confirmation_number')
        ),
        -- delivery_note â†’ DN
        (
            'delivery_note', 'document_no', 'DN', true, '-',
            jsonb_build_array(
                jsonb_build_object('type', 'year', 'format', 'YYYY'),
                jsonb_build_object('type', 'sequence', 'padding', 5)
            ),
            'yearly', 'company', 50, 'upper_alnum_dash',
            jsonb_build_object('source', 'platform_default', 'physical_column', 'delivery_note_number')
        ),
        -- receipt â†’ RCP
        (
            'receipt', 'document_no', 'RCP', true, '-',
            jsonb_build_array(
                jsonb_build_object('type', 'year', 'format', 'YYYY'),
                jsonb_build_object('type', 'sequence', 'padding', 5)
            ),
            'yearly', 'company', 50, 'upper_alnum_dash',
            jsonb_build_object('source', 'platform_default', 'physical_column', 'code')
        ),
        -- service_sheet â†’ SSH
        (
            'service_sheet', 'document_no', 'SSH', true, '-',
            jsonb_build_array(
                jsonb_build_object('type', 'year', 'format', 'YYYY'),
                jsonb_build_object('type', 'sequence', 'padding', 5)
            ),
            'yearly', 'company', 50, 'upper_alnum_dash',
            jsonb_build_object('source', 'platform_default', 'physical_column', 'service_sheet_number')
        )
    ) AS v(
        entity_code, number_field, prefix, prefix_configurable, separator,
        segments, reset_strategy, uniqueness_scope, max_length, allowed_chars, metadata
    )
)
INSERT INTO control.entity_numbering_config (
    tenant_id, entity_id, number_field, company_code_id,
    prefix, prefix_configurable, separator, segments,
    reset_strategy, uniqueness_scope, max_length, allowed_chars,
    metadata, status, created_by
)
SELECT
    NULL,
    e.id,
    c.number_field,
    NULL,
    c.prefix,
    c.prefix_configurable,
    c.separator,
    c.segments,
    c.reset_strategy,
    c.uniqueness_scope,
    c.max_length,
    c.allowed_chars,
    c.metadata,
    'active',
    '00000000-0000-0000-0000-000000000000'
FROM configs c
JOIN control.entity e
  ON e.entity_code = c.entity_code
 AND e.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT encfg_natural_uq DO UPDATE
SET prefix              = EXCLUDED.prefix,
    prefix_configurable = EXCLUDED.prefix_configurable,
    separator           = EXCLUDED.separator,
    segments            = EXCLUDED.segments,
    reset_strategy      = EXCLUDED.reset_strategy,
    uniqueness_scope    = EXCLUDED.uniqueness_scope,
    max_length          = EXCLUDED.max_length,
    allowed_chars       = EXCLUDED.allowed_chars,
    metadata            = control.entity_numbering_config.metadata || EXCLUDED.metadata,
    status              = 'active',
    updated_at          = now(),
    updated_by          = '00000000-0000-0000-0000-000000000000';


-- Â§3 Action rules
-- Convention: HEADER.<UPPERCASE_VERB> action codes; uppercase dotted permission
-- codes (PR.APPROVE, RECEIPT.POST, ...) per Section A2 of the master plan.
-- Coverage: every from_state of every lifecycle_transition seeded in
-- 030p_p2p_lifecycle_contract.sql gets a HEADER.* allowed row. Sensitive transitions
-- carry `requires_permission`. POSTINGS_PREVIEW.OPEN is allowed in all
-- statuses for posting entities (receipt, service_sheet) â€” matches PI rule.

INSERT INTO control.entity_action_rule (
    entity_code, status, action_code, capability, required_permission,
    reason, description, metadata, created_by
)
VALUES
    -- â”€â”€ purchase_requisition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_requisition', 'draft',                'HEADER.SUBMIT',  'allowed',              NULL,           NULL, 'Submit requisition for approval.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_requisition', 'draft',                'HEADER.CANCEL',  'allowed',              NULL,           NULL, 'Cancel requisition in draft.',     '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_requisition', 'pending_approval',     'HEADER.APPROVE', 'requires_permission', 'PR.APPROVE',    NULL, 'Approve the requisition.',         '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_requisition', 'pending_approval',     'HEADER.DENY',    'requires_permission', 'PR.APPROVE',    NULL, 'Reject and return to draft.',      '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_requisition', 'pending_approval',     'HEADER.AMEND',   'allowed',              NULL,           NULL, 'Return to draft for revision.',    '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_requisition', 'rejected',             'HEADER.AMEND',   'allowed',              NULL,           NULL, 'Edit and resubmit.',               '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_requisition', 'approved',             'HEADER.CONVERT', 'requires_permission', 'PR.CONVERT',    NULL, 'Convert to purchase order.',       '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_requisition', 'approved',             'HEADER.CANCEL',  'allowed',              NULL,           NULL, 'Cancel before conversion.',        '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_requisition', 'approved',             'HEADER.CLOSE',   'allowed',              NULL,           NULL, 'Close without converting.',        '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_requisition', 'partially_converted',  'HEADER.CONVERT', 'requires_permission', 'PR.CONVERT',    NULL, 'Convert remaining lines.',         '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_requisition', 'partially_converted',  'HEADER.CLOSE',   'allowed',              NULL,           NULL, 'Close remaining unconverted.',     '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_requisition', 'partially_converted',  'HEADER.CANCEL',  'allowed',              NULL,           NULL, 'Cancel remaining.',                '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_requisition', 'fully_converted',      'HEADER.CLOSE',   'allowed',              NULL,           NULL, 'Close fully-converted requisition.','{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ purchase_order / commitment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- â”€â”€ purchase_order_confirmation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_order_confirmation', 'received',         'HEADER.CONFIRM',         'allowed',              NULL,            NULL, 'Confirm PO as received (within tolerance).', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order_confirmation', 'received',         'HEADER.PROPOSE_CHANGES', 'allowed',              NULL,            NULL, 'Supplier proposes changes to PO.',           '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order_confirmation', 'received',         'HEADER.REJECT',          'requires_permission', 'POC.DISPUTE',    NULL, 'Reject PO outright.',                        '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order_confirmation', 'received',         'HEADER.CANCEL',          'allowed',              NULL,            NULL, 'Cancel confirmation.',                       '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order_confirmation', 'changes_proposed', 'HEADER.ACCEPT_CHANGES',  'requires_permission', 'POC.ACCEPT',     NULL, 'Buyer accepts supplier changes.',            '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order_confirmation', 'changes_proposed', 'HEADER.REJECT_CHANGES',  'requires_permission', 'POC.DISPUTE',    NULL, 'Buyer rejects supplier changes.',            '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order_confirmation', 'changes_rejected', 'HEADER.PROPOSE_CHANGES', 'allowed',              NULL,            NULL, 'Supplier re-proposes after rejection.',      '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order_confirmation', 'changes_rejected', 'HEADER.CANCEL',          'allowed',              NULL,            NULL, 'Abandon confirmation.',                      '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ delivery_note â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('delivery_note', 'draft',                'HEADER.DISPATCH',     'allowed',              NULL,                  NULL, 'Mark as dispatched.',     '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('delivery_note', 'draft',                'HEADER.CANCEL',       'allowed',              NULL,                  NULL, 'Cancel before dispatch.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('delivery_note', 'in_transit',           'HEADER.MARK_ARRIVED', 'requires_permission', 'DN.MARK_ARRIVED',      NULL, 'Mark as arrived.',        '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('delivery_note', 'in_transit',           'HEADER.CANCEL',       'allowed',              NULL,                  NULL, 'Cancel in transit.',      '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('delivery_note', 'arrived',              'HEADER.RECEIPT',      'allowed',              NULL,                  NULL, 'Open receipt for inbound.','{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('delivery_note', 'arrived',              'HEADER.RETURN',       'allowed',              NULL,                  NULL, 'Return to supplier.',     '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('delivery_note', 'partially_receipted',  'HEADER.RECEIPT',      'allowed',              NULL,                  NULL, 'Continue receipting.',    '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('delivery_note', 'partially_receipted',  'HEADER.RETURN',       'allowed',              NULL,                  NULL, 'Return remaining qty.',   '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ receipt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('receipt', 'draft',             'HEADER.SUBMIT',          'allowed',              NULL,                   NULL, 'Submit receipt for approval.',       '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('receipt', 'draft',             'HEADER.CANCEL',          'allowed',              NULL,                   NULL, 'Cancel before submission.',          '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('receipt', 'pending_approval',  'HEADER.APPROVE',         'requires_permission', 'RECEIPT.APPROVE',       NULL, 'Approve receipt for posting.',       '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('receipt', 'pending_approval',  'HEADER.AMEND',           'allowed',              NULL,                   NULL, 'Return to draft for revision.',      '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('receipt', 'pending_approval',  'HEADER.CANCEL',          'allowed',              NULL,                   NULL, 'Cancel pending approval.',           '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('receipt', 'approved',          'HEADER.POST',            'requires_permission', 'RECEIPT.POST',          NULL, 'Post receipt â†’ JE + inventory + commitment_fulfillment.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('receipt', 'approved',          'HEADER.CANCEL',          'allowed',              NULL,                   NULL, 'Cancel before posting.',             '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('receipt', 'posted',            'HEADER.REVERSE',         'requires_permission', 'RECEIPT.REVERSE',       NULL, 'Reverse with compensating JE.',      '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Postings preview always available
    ('receipt', 'draft',             'POSTINGS_PREVIEW.OPEN',  'allowed',              NULL,                   NULL, 'Postings preview is read-only.',     '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('receipt', 'pending_approval',  'POSTINGS_PREVIEW.OPEN',  'allowed',              NULL,                   NULL, NULL,                                 '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('receipt', 'approved',          'POSTINGS_PREVIEW.OPEN',  'allowed',              NULL,                   NULL, NULL,                                 '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('receipt', 'posted',            'POSTINGS_PREVIEW.OPEN',  'allowed',              NULL,                   NULL, 'Frozen with JE link post-posting.',  '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('receipt', 'reversed',          'POSTINGS_PREVIEW.OPEN',  'allowed',              NULL,                   NULL, NULL,                                 '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('receipt', 'cancelled',         'POSTINGS_PREVIEW.OPEN',  'allowed',              NULL,                   NULL, NULL,                                 '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ service_sheet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('service_sheet', 'draft',                'HEADER.SUBMIT_FOR_ACCEPTANCE', 'allowed',              NULL,                          NULL, 'Send to requester for acceptance.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'draft',                'HEADER.CANCEL',                'allowed',              NULL,                          NULL, 'Cancel before submission.',         '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'pending_acceptance',   'HEADER.ACCEPT',                'allowed',              NULL,                          NULL, 'Requester accepts work done.',      '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'pending_acceptance',   'HEADER.REJECT_ACCEPTANCE',     'allowed',              NULL,                          NULL, 'Return to draft for rework.',       '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'accepted',             'HEADER.SUBMIT',                'allowed',              NULL,                          NULL, 'Submit for finance approval.',      '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'pending_approval',     'HEADER.APPROVE',               'requires_permission', 'SERVICE_SHEET.APPROVE',         NULL, 'Approve for posting.',              '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'pending_approval',     'HEADER.AMEND',                 'allowed',              NULL,                          NULL, 'Return to draft for revision.',     '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'pending_approval',     'HEADER.CANCEL',                'allowed',              NULL,                          NULL, 'Cancel pending approval.',          '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'approved',             'HEADER.POST',                  'requires_permission', 'SERVICE_SHEET.POST',            NULL, 'Post â†’ JE + commitment_fulfillment.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'approved',             'HEADER.CANCEL',                'allowed',              NULL,                          NULL, 'Cancel before posting.',            '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'posted',               'HEADER.REVERSE',               'requires_permission', 'SERVICE_SHEET.REVERSE',         NULL, 'Reverse with compensating JE.',     '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Postings preview always available
    ('service_sheet', 'draft',               'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, 'Postings preview is read-only.',     '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'pending_acceptance',  'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL,                                 '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'accepted',            'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL,                                 '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'pending_approval',    'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL,                                 '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'approved',            'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL,                                 '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'posted',              'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, 'Frozen with JE link post-posting.',  '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'reversed',            'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL,                                 '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('service_sheet', 'cancelled',           'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL,                                 '{}'::jsonb, '00000000-0000-0000-0000-000000000000')

ON CONFLICT (entity_code, status, action_code)
    WHERE entity_version_id IS NULL DO UPDATE
SET capability          = EXCLUDED.capability,
    required_permission = EXCLUDED.required_permission,
    reason              = EXCLUDED.reason,
    description         = EXCLUDED.description,
    metadata            = EXCLUDED.metadata,
    updated_at          = now();

INSERT INTO control.entity_action_rule (
    entity_code, status, action_code, capability, required_permission,
    reason, description, metadata, created_by
)
SELECT
    'commitment',
    status,
    action_code,
    capability,
    required_permission,
    reason,
    description,
    metadata || '{"mirrors_entity":"purchase_order"}'::jsonb,
    '00000000-0000-0000-0000-000000000000'
FROM control.entity_action_rule
WHERE entity_code = 'purchase_order'
ON CONFLICT (entity_code, status, action_code)
    WHERE entity_version_id IS NULL DO UPDATE
SET capability          = EXCLUDED.capability,
    required_permission = EXCLUDED.required_permission,
    reason              = EXCLUDED.reason,
    description         = EXCLUDED.description,
    metadata            = EXCLUDED.metadata,
    updated_at          = now(),
    updated_by          = '00000000-0000-0000-0000-000000000000';


-- Â§4 Field security
--
-- Scope decision:
--   control.field_security_policy.tenant_id is NOT NULL by schema design â€”
--   policies are tenant-scoped. We seed defaults against the system-sentinel
--   tenant (00000000-0000-0000-0000-000000000000) so they ship as platform
--   defaults; per-tenant rows can override with lower `priority` (lower wins).
--
-- Coverage:
--   supplier.bank_account_no   â€” partial mask (last 4) for non-finance roles
--   supplier.iban              â€” partial mask
--   supplier.tax_id            â€” partial mask for non-finance roles
--   business_partner.tax_id    â€” partial mask
--   purchase_invoice.supplier_invoice_number â€” read-only mask outside AP role
--
-- mask_strategy values seeded:
--   partial  â†’ returns "*****" + last 4 chars
--   null     â†’ returns NULL when the policy applies
-- (hash / encrypt / tokenise deferred â€” require tenant key material)

WITH targets AS (
    SELECT *
    FROM (VALUES
        -- (entity_code, field_path, mask_strategy, role_list, pii_class, priority, classification_note)
        ('supplier',          'bank_account_no',          'partial', ARRAY['ap_clerk','finance_controller','cfo'], 'sensitive', 50,
            'PCI/banking â€” only finance roles see full bank account number'),
        ('supplier',          'iban',                     'partial', ARRAY['ap_clerk','finance_controller','cfo'], 'sensitive', 50,
            'IBAN â€” same scope as bank_account_no'),
        ('supplier',          'tax_id',                   'partial', ARRAY['ap_clerk','finance_controller','tax_specialist','cfo'], 'direct', 60,
            'Tax ID is direct PII; visible to AP/tax/finance'),
        ('business_partner',  'tax_id',                   'partial', ARRAY['ap_clerk','finance_controller','tax_specialist','cfo'], 'direct', 60,
            'BP-level tax_id â€” duplicate scope to supplier'),
        ('purchase_invoice',  'supplier_invoice_number',  'null',    ARRAY['ap_clerk','finance_controller','auditor'], 'quasi', 100,
            'Supplier invoice number is quasi-PII when combined with supplier â€” restrict to AP/auditor')
    ) AS v(entity_code, field_path, mask_strategy, role_list, pii_class, priority, note)
)
INSERT INTO control.field_security_policy (
    tenant_id, entity_id, field_path,
    policy_type, role_list, mask_strategy, mask_config,
    scope, priority, pii_classification, privacy_metadata,
    version, is_active, metadata, created_by
)
SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS tenant_id,
    e.id                                          AS entity_id,
    t.field_path,
    'mask',
    t.role_list::text[],
    t.mask_strategy,
    CASE
      WHEN t.mask_strategy = 'partial'
        THEN '{"keep_last": 4, "fill_char": "*"}'::jsonb
      ELSE '{}'::jsonb
    END AS mask_config,
    'global',
    t.priority,
    t.pii_class,
    jsonb_build_object('classification_note', t.note),
    1,
    true,
    jsonb_build_object('source', 'platform_default'),
    '00000000-0000-0000-0000-000000000000'::uuid
FROM targets t
JOIN control.entity e
  ON e.entity_code = t.entity_code
 AND e.tenant_id IS NULL
WHERE NOT EXISTS (
    SELECT 1 FROM control.field_security_policy fsp
    WHERE fsp.tenant_id  = '00000000-0000-0000-0000-000000000000'::uuid
      AND fsp.entity_id  = e.id
      AND fsp.field_path = t.field_path
      AND fsp.policy_type = 'mask'
);


-- Â§5 Workflows (template/_stage/_rule + workflow_definition)
-- Mirrors the PI block in 060_workflow_template.sql.
--
-- Templates seeded:
--   pr_std_approval      â€” single-stage manager approval for PRs
--   pr_hv_approval       â€” two-stage (manager + finance) for high-value PRs â‰¥ 25,000
--   rcp_std_approval     â€” single-stage warehouse manager approval for receipts
--   ssh_std_approval     â€” single-stage finance approval for service sheets
--   ssh_hv_approval      â€” two-stage finance + CFO for high-value service sheets â‰¥ 100,000
--                          (the acceptance step is handled by the lifecycle
--                           transition pending_acceptance â†’ accepted without a
--                           formal workflow â€” direct user action)

-- === Purchase Requisition ===================================================
DO $$ DECLARE
    v_tpl_std_id  uuid;
    v_tpl_hv_id   uuid;
BEGIN

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'pr_std_approval',
     'Purchase Requisition â€” Standard Approval',
     'Single-stage approval by the requester''s manager for standard purchase requisitions.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_std_id FROM control.workflow_template
WHERE code = 'pr_std_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_std_id, 1, 'Manager Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_std_id, 1, 10, NULL,
     '{"type":"requester_manager","resolve_from":"principal_profile.supervisor_id"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- High-value PR: two-stage manager + finance controller (>= 25,000)
INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'pr_hv_approval',
     'Purchase Requisition â€” High-Value Approval',
     'Two-stage approval for high-value PRs: manager then finance controller.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_hv_id FROM control.workflow_template
WHERE code = 'pr_hv_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_hv_id, 1, 'Manager Approval',           'serial', '{"strategy":"unanimous"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id, 2, 'Finance Controller Approval','serial', '{"strategy":"unanimous"}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_hv_id, 1, 10, NULL, '{"type":"requester_manager","resolve_from":"principal_profile.supervisor_id"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id, 2, 10, NULL, '{"type":"role","role_code":"finance_controller"}'::jsonb,                              '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- Workflow definition â€” routes by total_amount
INSERT INTO control.workflow_definition
    (tenant_id, code, name, entity_type, rules, effective_from, is_active, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid,
     'purchase_requisition_approval',
     'Purchase Requisition Approval',
     'purchase_requisition',
     '[
       {"condition":{"field":"total_amount","operator":"gte","value":25000},"template_code":"pr_hv_approval","workflow_type":"approval","priority":10},
       {"condition":null,"template_code":"pr_std_approval","workflow_type":"approval","priority":20}
     ]'::jsonb,
     now(), true,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

END $$;


-- === Receipt ================================================================
DO $$ DECLARE
    v_tpl_id uuid;
BEGIN

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'rcp_std_approval',
     'Receipt â€” Standard Approval',
     'Single-stage approval by the warehouse manager for goods/asset receipts.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_id FROM control.workflow_template
WHERE code = 'rcp_std_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_id, 1, 'Warehouse Manager Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_id, 1, 10, NULL,
     '{"type":"role","role_code":"warehouse_manager"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

INSERT INTO control.workflow_definition
    (tenant_id, code, name, entity_type, rules, effective_from, is_active, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid,
     'receipt_approval',
     'Receipt Approval',
     'receipt',
     '[
       {"condition":null,"template_code":"rcp_std_approval","workflow_type":"approval","priority":10}
     ]'::jsonb,
     now(), true,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

END $$;


-- === Service Sheet ==========================================================
-- The acceptance step (pending_acceptance â†’ accepted) is a direct lifecycle
-- transition routed to the original requester â€” no formal workflow needed.
-- Finance approval (pending_approval â†’ approved) uses this workflow.
DO $$ DECLARE
    v_tpl_std_id uuid;
    v_tpl_hv_id  uuid;
BEGIN

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'ssh_std_approval',
     'Service Sheet â€” Standard Approval',
     'Single-stage finance approval for accepted service sheets.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_std_id FROM control.workflow_template
WHERE code = 'ssh_std_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_std_id, 1, 'Finance Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_std_id, 1, 10, NULL,
     '{"type":"role","role_code":"finance_controller"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- High-value variant â€” adds CFO sign-off for sheets >= 100,000
INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'ssh_hv_approval',
     'Service Sheet â€” High-Value Approval',
     'Two-stage approval for high-value service sheets: finance controller then CFO.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_hv_id FROM control.workflow_template
WHERE code = 'ssh_hv_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_hv_id, 1, 'Finance Controller Approval', 'serial', '{"strategy":"unanimous"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id, 2, 'CFO Approval',                'serial', '{"strategy":"unanimous"}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_hv_id, 1, 10, NULL, '{"type":"role","role_code":"finance_controller"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id, 2, 10, NULL, '{"type":"role","role_code":"cfo"}'::jsonb,                '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

INSERT INTO control.workflow_definition
    (tenant_id, code, name, entity_type, rules, effective_from, is_active, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid,
     'service_sheet_approval',
     'Service Sheet Approval',
     'service_sheet',
     '[
       {"condition":{"field":"total_amount","operator":"gte","value":100000},"template_code":"ssh_hv_approval","workflow_type":"approval","priority":10},
       {"condition":null,"template_code":"ssh_std_approval","workflow_type":"approval","priority":20}
     ]'::jsonb,
     now(), true,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

END $$;


-- Â§6a Transition hooks (AFTER)
--
-- Per Master Plan Â§7 (Wiring rule per transition):
--   AFTER sort  10  activity_log.write            required (every transition)
--   AFTER sort  20  snapshot.capture              required (per capture matrix)
--   AFTER sort  30  transaction_flow.dispatch     required (posting transitions)
--   AFTER sort  60  notification.publish          narrowable (every transition)
--
-- Must run AFTER 070_control_hook_action_registry_contract.sql because the action_registry guard
-- trigger (trg_lth_action_registry_guard) validates lifecycle_transition_hook
-- .action against control.hook_action_registry.action_key on INSERT.
--
-- Coverage assumptions:
--   - lifecycles seeded in 030_control_lifecycle_contract.sql (PI/PO/PE/JE) and
--     030p_p2p_lifecycle_contract.sql (PR/POC/DN/receipt/service_sheet).
--   - hook actions registered in 070_control_hook_action_registry_contract.sql.
--   - Idempotent: NOT EXISTS guards skip already-wired transitions.

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- Purchase Order is a facade over document.commitment and is bound to the
-- active `commitment` lifecycle. Older seeds attached PO hooks to the retired
-- standalone `purchase_order` lifecycle. Deactivate those rows first so this
-- contract repairs existing databases as well as fresh installs.
UPDATE control.lifecycle_transition_hook lth
   SET is_active = false,
       updated_at = now(),
       updated_by = v_su
  FROM control.lifecycle_transition lt
  JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id
 WHERE lth.transition_id = lt.id
   AND lth.tenant_id IS NULL
   AND lc.tenant_id IS NULL
   AND lc.code = 'purchase_order'
   AND lth.action IN ('activity_log.write', 'snapshot.capture', 'notification.publish')
   AND lth.is_active = true;

-- Canonicalise existing activity hooks before filling gaps below. The hook
-- table intentionally has no natural unique constraint, so UPDATE followed by
-- INSERT ... NOT EXISTS is the idempotent repair pattern.
UPDATE control.lifecycle_transition_hook lth
   SET timing = 'after',
       sort_order = 10,
       config = '{}'::jsonb,
       origin = 'system',
       layer_rank = 10,
       contract_role = 'contract',
       safety_level = 'required',
       is_active = true,
       updated_at = now(),
       updated_by = v_su
  FROM control.lifecycle_transition lt
  JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id
 WHERE lth.transition_id = lt.id
   AND lth.tenant_id IS NULL
   AND lth.action = 'activity_log.write'
   AND lc.tenant_id IS NULL
   AND lc.code IN (
       'purchase_requisition', 'purchase_order_confirmation', 'delivery_note',
       'receipt', 'service_sheet', 'purchase_invoice', 'payment_entry', 'commitment'
   )
   AND lt.tenant_id IS NULL
   AND lt.is_active = true;

-- â”€â”€ 1. activity_log.write â€” every transition in the 7 P2P lifecycles â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle_transition_hook
    (tenant_id, transition_id, timing, sort_order, action, config,
     origin, layer_rank, contract_role, safety_level, is_active, created_by)
SELECT
    NULL, lt.id, 'after', 10, 'activity_log.write', '{}'::jsonb,
    'system', 10, 'contract', 'required', true, v_su
FROM control.lifecycle_transition lt
JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id
WHERE lc.tenant_id IS NULL
  AND lc.code IN (
      'purchase_requisition', 'purchase_order_confirmation', 'delivery_note',
      'receipt', 'service_sheet', 'purchase_invoice', 'payment_entry', 'commitment'
  )
  AND lt.tenant_id IS NULL
  AND lt.is_active = true
  AND NOT EXISTS (
      SELECT 1 FROM control.lifecycle_transition_hook lth
      WHERE lth.transition_id = lt.id
        AND lth.action        = 'activity_log.write'
        AND lth.timing        = 'after'
        AND lth.tenant_id     IS NULL
  );


-- â”€â”€ 2. notification.publish â€” every transition (narrowable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- template_key is left NULL in the base config; the dispatcher resolves the
-- template_key from a join on (entity_type, gate_event) in Phase 7.
INSERT INTO control.lifecycle_transition_hook
    (tenant_id, transition_id, timing, sort_order, action, config,
     origin, layer_rank, contract_role, safety_level, is_active, created_by)
SELECT
    NULL, lt.id, 'after', 60, 'notification.publish',
    jsonb_build_object('template_key', NULL),
    'system', 10, 'extension', 'narrowable', true, v_su
FROM control.lifecycle_transition lt
JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id
WHERE lc.tenant_id IS NULL
  AND lc.code IN (
      'purchase_requisition', 'purchase_order_confirmation', 'delivery_note',
      'receipt', 'service_sheet', 'purchase_invoice', 'payment_entry', 'commitment'
  )
  AND lt.tenant_id IS NULL
  AND lt.is_active = true
  AND NOT EXISTS (
      SELECT 1 FROM control.lifecycle_transition_hook lth
      WHERE lth.transition_id = lt.id
        AND lth.action        = 'notification.publish'
        AND lth.timing        = 'after'
        AND lth.tenant_id     IS NULL
  );


-- Transactional domain outbox â€” every lifecycle transition carries both
-- public purchase-order and physical commitment identities.
INSERT INTO control.lifecycle_transition_hook
    (tenant_id, transition_id, timing, sort_order, action, config,
     origin, layer_rank, contract_role, safety_level, is_active, created_by)
SELECT
    NULL, lt.id, 'after', 50, 'emit_event', '{}'::jsonb,
    'system', 10, 'contract', 'required', true, v_su
FROM control.lifecycle_transition lt
JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id
WHERE lc.tenant_id IS NULL
  AND lc.code IN (
      'purchase_requisition', 'purchase_order_confirmation', 'delivery_note',
      'receipt', 'service_sheet', 'purchase_invoice', 'payment_entry', 'commitment'
  )
  AND lt.tenant_id IS NULL
  AND lt.is_active = true
  AND NOT EXISTS (
      SELECT 1 FROM control.lifecycle_transition_hook lth
      WHERE lth.transition_id = lt.id
        AND lth.action = 'emit_event'
        AND lth.timing = 'after'
        AND lth.tenant_id IS NULL
  );


-- â”€â”€ 3. snapshot.capture â€” per capture matrix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- (entity, from_state, to_state, gate_event_kind)
WITH spec(lc_code, from_code, to_code, kind) AS (
    VALUES
    -- PR
    ('purchase_requisition',         'draft',             'pending_approval',    'authoring_lock'),
    ('purchase_requisition',         'pending_approval',  'approved',            'commitment'),
    ('purchase_requisition',         'pending_approval',  'rejected',            'amendment_baseline'),
    ('purchase_requisition',         'pending_approval',  'draft',               'amendment_baseline'),
    ('purchase_requisition',         'rejected',          'draft',               'amendment_baseline'),
    ('purchase_requisition',         'approved',          'partially_converted', 'commitment'),
    ('purchase_requisition',         'partially_converted','fully_converted',    'commitment'),
    ('purchase_requisition',         'draft',             'cancelled',           'reversal'),
    ('purchase_requisition',         'approved',          'closed',              'reversal'),
    ('purchase_requisition',         'partially_converted','closed',             'reversal'),
    ('purchase_requisition',         'fully_converted',   'closed',              'reversal'),
    ('purchase_requisition',         'approved',          'cancelled',           'reversal'),
    ('purchase_requisition',         'partially_converted','cancelled',          'reversal'),
    -- PO (commitment)
    -- The PO facade uses the active commitment lifecycle.
    ('commitment',                   'draft',             'pending_approval',    'authoring_lock'),
    ('commitment',                   'pending_approval',  'approved',            'commitment'),
    ('commitment',                   'approved',          'active',              'commitment'),
    ('commitment',                   'pending_approval',  'rejected',            'amendment_baseline'),
    ('commitment',                   'pending_approval',  'draft',               'amendment_baseline'),
    ('commitment',                   'rejected',          'draft',               'amendment_baseline'),
    ('commitment',                   'draft',             'cancelled',           'reversal'),
    ('commitment',                   'pending_approval',  'cancelled',           'reversal'),
    ('commitment',                   'approved',          'cancelled',           'reversal'),
    ('commitment',                   'active',            'cancelled',           'reversal'),
    ('commitment',                   'partially_fulfilled','cancelled',          'reversal'),
    ('commitment',                   'active',            'partially_fulfilled', 'fulfillment'),
    ('commitment',                   'active',            'fully_fulfilled',     'fulfillment'),
    ('commitment',                   'partially_fulfilled','fully_fulfilled',     'fulfillment'),
    ('commitment',                   'approved',          'closed',              'reversal'),
    ('commitment',                   'active',            'closed',              'reversal'),
    ('commitment',                   'partially_fulfilled','closed',             'reversal'),
    ('commitment',                   'fully_fulfilled',   'closed',              'fulfillment'),
    ('commitment',                   'approved',          'expired',             'reversal'),
    ('commitment',                   'active',            'expired',             'reversal'),
    -- POC
    ('purchase_order_confirmation',  'received',          'confirmed',           'commitment'),
    ('purchase_order_confirmation',  'received',          'changes_proposed',    'amendment_baseline'),
    ('purchase_order_confirmation',  'received',          'rejected',            'reversal'),
    ('purchase_order_confirmation',  'changes_proposed',  'changes_accepted',    'amendment_baseline'),
    ('purchase_order_confirmation',  'changes_proposed',  'changes_rejected',    'amendment_baseline'),
    ('purchase_order_confirmation',  'changes_rejected',  'changes_proposed',    'amendment_baseline'),
    ('purchase_order_confirmation',  'received',          'cancelled',           'reversal'),
    ('purchase_order_confirmation',  'changes_rejected',  'cancelled',           'reversal'),
    -- DN
    ('delivery_note',                'draft',             'in_transit',          'fulfillment'),
    ('delivery_note',                'in_transit',        'arrived',             'fulfillment'),
    ('delivery_note',                'arrived',           'partially_receipted', 'fulfillment'),
    ('delivery_note',                'arrived',           'fully_receipted',     'fulfillment'),
    ('delivery_note',                'partially_receipted','fully_receipted',    'fulfillment'),
    ('delivery_note',                'arrived',           'returned',            'reversal'),
    ('delivery_note',                'partially_receipted','returned',           'reversal'),
    ('delivery_note',                'draft',             'cancelled',           'reversal'),
    ('delivery_note',                'in_transit',        'cancelled',           'reversal'),
    -- receipt
    ('receipt',                      'draft',             'pending_approval',    'authoring_lock'),
    ('receipt',                      'pending_approval',  'approved',            'commitment'),
    ('receipt',                      'pending_approval',  'draft',               'amendment_baseline'),
    ('receipt',                      'approved',          'posted',              'financial_post'),
    ('receipt',                      'posted',            'reversed',            'reversal'),
    ('receipt',                      'draft',             'cancelled',           'reversal'),
    ('receipt',                      'pending_approval',  'cancelled',           'reversal'),
    ('receipt',                      'approved',          'cancelled',           'reversal'),
    -- service_sheet
    ('service_sheet',                'draft',             'pending_acceptance',  'authoring_lock'),
    ('service_sheet',                'pending_acceptance','accepted',            'commitment'),
    ('service_sheet',                'pending_acceptance','draft',               'amendment_baseline'),
    ('service_sheet',                'accepted',          'pending_approval',    'authoring_lock'),
    ('service_sheet',                'pending_approval',  'approved',            'commitment'),
    ('service_sheet',                'pending_approval',  'draft',               'amendment_baseline'),
    ('service_sheet',                'approved',          'posted',              'financial_post'),
    ('service_sheet',                'posted',            'reversed',            'reversal'),
    ('service_sheet',                'draft',             'cancelled',           'reversal'),
    ('service_sheet',                'pending_approval',  'cancelled',           'reversal'),
    ('service_sheet',                'approved',          'cancelled',           'reversal'),
    -- PI â€” see docs/specs/purchase_invoice_field_design.md Â§lifecycle for the
    -- gate-event-kind matrix. Authoring-lock + amendment-baseline + reversal
    -- transitions are all snapshot moments; on_hold / release_hold and the
    -- payment transitions (pay / pay-final) are not â€” they don't change
    -- document substance, and release_hold returns to a state that already
    -- has its own snapshot.
    ('purchase_invoice',             'draft',             'pending_approval',    'authoring_lock'),
    ('purchase_invoice',             'pending_approval',  'approved',            'commitment'),
    ('purchase_invoice',             'approved',          'posted',              'financial_post'),
    ('purchase_invoice',             'posted',            'reversed',            'reversal'),
    -- Amendment baselines: preserve "the version that was [rejected | sent back
    -- to draft]" so the rework diff has a fixed prior to compare against.
    ('purchase_invoice',             'pending_approval',  'rejected',            'amendment_baseline'),
    ('purchase_invoice',             'pending_approval',  'draft',               'amendment_baseline'),
    ('purchase_invoice',             'rejected',          'draft',               'amendment_baseline'),
    -- Terminal evidence: cancellation from either draft or approved is a
    -- terminal state; snapshot captures what was cancelled for audit / legal.
    ('purchase_invoice',             'draft',             'cancelled',           'reversal'),
    ('purchase_invoice',             'approved',          'cancelled',           'reversal'),
    -- Payment entry: single-shot financial document; revision_no is always 1.
    ('payment_entry',                'draft',             'pending_approval',    'authoring_lock'),
    ('payment_entry',                'pending_approval',  'approved',            'commitment'),
    ('payment_entry',                'pending_approval',  'rejected',            'reversal'),
    ('payment_entry',                'pending_approval',  'draft',               'reversal'),
    ('payment_entry',                'rejected',          'draft',               'reversal'),
    ('payment_entry',                'draft',             'cancelled',           'reversal'),
    ('payment_entry',                'approved',          'cancelled',           'reversal'),
    ('payment_entry',                'approved',          'posted',              'financial_post'),
    ('payment_entry',                'posted',            'transmitted',         'commitment'),
    ('payment_entry',                'posted',            'printed',             'commitment'),
    ('payment_entry',                'transmitted',       'cleared',             'financial_post'),
    ('payment_entry',                'printed',           'cleared',             'financial_post'),
    ('payment_entry',                'posted',            'reversed',            'reversal'),
    ('payment_entry',                'posted',            'voided',              'reversal')
)
INSERT INTO control.lifecycle_transition_hook
    (tenant_id, transition_id, timing, sort_order, action, config,
     origin, layer_rank, contract_role, safety_level, is_active, created_by)
SELECT
    NULL, lt.id, 'after', 20, 'snapshot.capture',
    jsonb_build_object('gate_event_kind', s.kind),
    'system', 10, 'contract', 'required', true, v_su
FROM control.lifecycle_transition lt
JOIN control.lifecycle       lc ON lc.id = lt.lifecycle_id AND lc.tenant_id IS NULL
JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
JOIN spec s
  ON s.lc_code   = lc.code
 AND s.from_code = fs.code
 AND s.to_code   = ts.code
WHERE lt.tenant_id IS NULL
  AND lt.is_active = true
  AND NOT EXISTS (
      SELECT 1 FROM control.lifecycle_transition_hook lth
      WHERE lth.transition_id = lt.id
        AND lth.action        = 'snapshot.capture'
        AND lth.timing        = 'after'
        AND lth.tenant_id     IS NULL
        AND lth.is_active     = true
  );


-- â”€â”€ 4. transaction_flow.dispatch â€” posting transitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- (entity, from_state, to_state, event_code, flow_code)
-- event_code matches control.transaction_event_catalog.event_code
-- flow_code is the dispatcher's hint for which template to resolve
WITH spec(lc_code, from_code, to_code, event_code, flow_code) AS (
    VALUES
    -- PR approval â†’ encumbrance
    ('purchase_requisition', 'pending_approval', 'approved',     'ORDER_CREATION',   'PO_BASED'),
    -- PO approval â†’ commitment_schedule + budget commit
    ('commitment',           'pending_approval', 'approved',     'ORDER_APPROVAL',   'PO_BASED'),
    -- Receipt post â†’ JE + inventory + commitment_consume + budget_consume
    ('receipt',              'approved',         'posted',       'FULFILLMENT',      'PO_BASED'),
    -- Receipt reversal â†’ compensating JE
    ('receipt',              'posted',           'reversed',     'REVERSAL',         'PO_BASED'),
    -- Service sheet post â†’ JE + commitment_consume
    ('service_sheet',        'approved',         'posted',       'FULFILLMENT',      'SERVICES'),
    ('service_sheet',        'posted',           'reversed',     'REVERSAL',         'SERVICES'),
    -- PI post â†’ JE + tax + commitment + budget consume
    ('purchase_invoice',     'approved',         'posted',       'INVOICE_MATCHED',  'PO_BASED'),
    ('purchase_invoice',     'posted',           'reversed',     'REVERSAL',         'PO_BASED'),
    -- Payment posting/reversal. The posting handler resolves the actual
    -- allocation mix; PO_BASED is the transaction-template family used to
    -- validate that SETTLEMENT/REVERSAL are registered.
    ('payment_entry',        'approved',         'posted',       'SETTLEMENT',       'PO_BASED'),
    ('payment_entry',        'posted',           'reversed',     'REVERSAL',         'PO_BASED'),
    ('payment_entry',        'posted',           'voided',       'REVERSAL',         'PO_BASED'),
    -- PO short-close / cancel â†’ release encumbrance
    ('commitment',           'approved',              'cancelled', 'RELEASE', 'PO_BASED'),
    ('commitment',           'active',                'cancelled', 'RELEASE', 'PO_BASED'),
    ('commitment',           'partially_fulfilled',   'cancelled', 'RELEASE', 'PO_BASED'),
    ('commitment',           'approved',              'closed',    'RELEASE', 'PO_BASED'),
    ('commitment',           'active',                'closed',    'RELEASE', 'PO_BASED'),
    ('commitment',           'partially_fulfilled',   'closed',    'RELEASE', 'PO_BASED'),
    ('commitment',           'fully_fulfilled',       'closed',    'RELEASE', 'PO_BASED'),
    ('commitment',           'approved',              'expired',   'RELEASE', 'PO_BASED'),
    ('commitment',           'active',                'expired',   'RELEASE', 'PO_BASED')
)
INSERT INTO control.lifecycle_transition_hook
    (tenant_id, transition_id, timing, sort_order, action, config,
     origin, layer_rank, contract_role, safety_level, is_active, created_by)
SELECT
    NULL, lt.id, 'after', 30, 'transaction_flow.dispatch',
    jsonb_build_object('event_code', s.event_code, 'flow_code', s.flow_code),
    'system', 10, 'contract', 'required', true, v_su
FROM control.lifecycle_transition lt
JOIN control.lifecycle       lc ON lc.id = lt.lifecycle_id AND lc.tenant_id IS NULL
JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
JOIN spec s
  ON s.lc_code   = lc.code
 AND s.from_code = fs.code
 AND s.to_code   = ts.code
WHERE lt.tenant_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM control.lifecycle_transition_hook lth
      WHERE lth.transition_id = lt.id
        AND lth.action        = 'transaction_flow.dispatch'
        AND lth.timing        = 'after'
        AND lth.tenant_id     IS NULL
  );


RAISE NOTICE '072p Â§6a: wired activity_log + notification + snapshot + dispatch hooks.';
END $$;


-- Â§6b Workflow-start hooks (BEFORE)
--
-- BEFORE-hook contract:
--   sort 5  workflow.start  required (contract)
--   Fires before the transition commits. The hook creates a
--   document.workflow_request from control.workflow_definition. The
--   lifecycle gate then waits for the workflow_request to reach APPROVED
--   before the actual state change happens.
--
-- Coverage:
--   purchase_requisition          draft     â†’ pending_approval
--   purchase_order (commitment)   draft     â†’ pending_approval
--   purchase_invoice              draft     â†’ pending_approval
--   receipt                       draft     â†’ pending_approval
--   service_sheet                 accepted  â†’ pending_approval  (post-acceptance)
--   payment_entry                 draft     â†’ pending_approval
--
-- Must run after Â§5 (workflow_definition rows must exist for the lookup) and
-- after 070_control_hook_action_registry_contract.sql (action 'workflow.start' must be registered).

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

WITH spec(lc_code, from_code, to_code, wf_def_code) AS (
    VALUES
    ('purchase_requisition',          'draft',    'pending_approval', 'purchase_requisition_approval'),
    ('commitment',                    'draft',    'pending_approval', 'purchase_order_approval'),
    ('purchase_invoice',              'draft',    'pending_approval', 'purchase_invoice_approval'),
    ('receipt',                       'draft',    'pending_approval', 'receipt_approval'),
    ('service_sheet',                 'accepted', 'pending_approval', 'service_sheet_approval'),
    ('payment_entry',                 'draft',    'pending_approval', 'payment_entry_approval')
)
INSERT INTO control.lifecycle_transition_hook
    (tenant_id, transition_id, timing, sort_order, action, config,
     origin, layer_rank, contract_role, safety_level, is_active, created_by)
SELECT
    NULL,
    lt.id,
    'before',
    5,
    'workflow.start',
    jsonb_build_object(
        'workflow_definition_code', s.wf_def_code,
        'workflow_definition_id',   wd.id
    ),
    'system', 10, 'contract', 'required', true, v_su
FROM control.lifecycle_transition lt
JOIN control.lifecycle       lc ON lc.id = lt.lifecycle_id AND lc.tenant_id IS NULL
JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
JOIN spec s
  ON s.lc_code   = lc.code
 AND s.from_code = fs.code
 AND s.to_code   = ts.code
JOIN control.workflow_definition wd
  ON wd.code = s.wf_def_code
WHERE lt.tenant_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM control.lifecycle_transition_hook lth
      WHERE lth.transition_id = lt.id
        AND lth.action        = 'workflow.start'
        AND lth.timing        = 'before'
        AND lth.tenant_id     IS NULL
  );

RAISE NOTICE '072p Â§6b: wired workflow.start BEFORE-hooks for 6 submit transitions.';
END $$;


-- Â§7 Notification templates
-- Scope: in_app + email channels only (push / sms / whatsapp deferred to v2).
-- Idempotent: WHERE NOT EXISTS guards on (tenant_id, template_key, channel,
-- locale, version).
--
-- Templates seeded (one per channel Ã— locale=en Ã— version=1):
--   purchase_requisition.lifecycle.changed
--   purchase_order_confirmation.lifecycle.changed
--   delivery_note.lifecycle.changed
--   receipt.lifecycle.changed
--   service_sheet.lifecycle.changed
--   wfl.sla_reminder       â€” SLA 75% warning
--   wfl.sla_breach         â€” SLA 100% breach
--   wfl.sla_auto_reject    â€” SLA 200% auto-reject
--   wfl.sla_auto_cancel    â€” SLA 200% auto-cancel (operational entities)

INSERT INTO control.notification_template
    (tenant_id, template_key, channel, locale, version,
     subject, body_text, variables_schema,
     status, created_by)
SELECT
    NULL,
    v.template_key,
    v.channel,
    'en',
    1,
    v.subject,
    v.body_text,
    v.variables_schema::jsonb,
    'active',
    '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- â”€â”€ purchase_requisition.lifecycle.changed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_requisition.lifecycle.changed', 'in_app',
     'Requisition {{requisition_number}} â†’ {{to_status}}',
     '{{actor_name}} moved requisition {{requisition_number}} from {{from_status}} to {{to_status}}.',
     '{"requisition_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),
    ('purchase_requisition.lifecycle.changed', 'email',
     'Requisition {{requisition_number}} moved to {{to_status}}',
     E'Hi,\n\n{{actor_name}} moved requisition {{requisition_number}} from {{from_status}} to {{to_status}}.\n\nView it: {{entity_url}}',
     '{"requisition_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),

    -- â”€â”€ purchase_order_confirmation.lifecycle.changed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_order_confirmation.lifecycle.changed', 'in_app',
     'PO Confirmation {{confirmation_number}} â†’ {{to_status}}',
     '{{actor_name}} moved PO confirmation {{confirmation_number}} from {{from_status}} to {{to_status}}.',
     '{"confirmation_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),
    ('purchase_order_confirmation.lifecycle.changed', 'email',
     'PO Confirmation {{confirmation_number}} moved to {{to_status}}',
     E'Hi,\n\n{{actor_name}} moved PO confirmation {{confirmation_number}} from {{from_status}} to {{to_status}}.\n\nView it: {{entity_url}}',
     '{"confirmation_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),

    -- â”€â”€ delivery_note.lifecycle.changed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('delivery_note.lifecycle.changed', 'in_app',
     'Delivery Note {{delivery_note_number}} â†’ {{to_status}}',
     '{{actor_name}} moved delivery note {{delivery_note_number}} from {{from_status}} to {{to_status}}.',
     '{"delivery_note_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),
    ('delivery_note.lifecycle.changed', 'email',
     'Delivery Note {{delivery_note_number}} moved to {{to_status}}',
     E'Hi,\n\n{{actor_name}} moved delivery note {{delivery_note_number}} from {{from_status}} to {{to_status}}.\n\nView it: {{entity_url}}',
     '{"delivery_note_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),

    -- â”€â”€ receipt.lifecycle.changed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('receipt.lifecycle.changed', 'in_app',
     'Receipt {{code}} â†’ {{to_status}}',
     '{{actor_name}} moved receipt {{code}} from {{from_status}} to {{to_status}}.',
     '{"code":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),
    ('receipt.lifecycle.changed', 'email',
     'Receipt {{code}} moved to {{to_status}}',
     E'Hi,\n\n{{actor_name}} moved receipt {{code}} from {{from_status}} to {{to_status}}.\n\nView it: {{entity_url}}',
     '{"code":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),

    -- â”€â”€ service_sheet.lifecycle.changed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('service_sheet.lifecycle.changed', 'in_app',
     'Service Sheet {{service_sheet_number}} â†’ {{to_status}}',
     '{{actor_name}} moved service sheet {{service_sheet_number}} from {{from_status}} to {{to_status}}.',
     '{"service_sheet_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),
    ('service_sheet.lifecycle.changed', 'email',
     'Service Sheet {{service_sheet_number}} moved to {{to_status}}',
     E'Hi,\n\n{{actor_name}} moved service sheet {{service_sheet_number}} from {{from_status}} to {{to_status}}.\n\nView it: {{entity_url}}',
     '{"service_sheet_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),

    -- payment_entry.lifecycle.changed
    ('payment_entry.lifecycle.changed', 'in_app',
     'Payment {{payment_number}} -> {{to_status}}',
     '{{actor_name}} moved payment {{payment_number}} from {{from_status}} to {{to_status}}.',
     '{"payment_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),
    ('payment_entry.lifecycle.changed', 'email',
     'Payment {{payment_number}} moved to {{to_status}}',
     E'Hi,\n\n{{actor_name}} moved payment {{payment_number}} from {{from_status}} to {{to_status}}.\n\nView it: {{entity_url}}',
     '{"payment_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),

    -- â”€â”€ wfl.sla_reminder â€” 75% of SLA elapsed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('wfl.sla_reminder', 'in_app',
     'Reminder: {{entity_label}} {{entity_code}} awaiting approval',
     '{{entity_label}} {{entity_code}} has been pending approval for {{elapsed_hours}}h. SLA target: {{sla_target_hours}}h.',
     '{"entity_label":"string","entity_code":"string","elapsed_hours":"number","sla_target_hours":"number","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),
    ('wfl.sla_reminder', 'email',
     'Reminder: {{entity_label}} {{entity_code}} awaiting your approval',
     E'Hi,\n\n{{entity_label}} {{entity_code}} has been awaiting your approval for {{elapsed_hours}}h ({{percent_of_sla}}% of SLA).\n\nReview it: {{entity_url}}',
     '{"entity_label":"string","entity_code":"string","elapsed_hours":"number","sla_target_hours":"number","percent_of_sla":"number","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),

    -- â”€â”€ wfl.sla_breach â€” 100% of SLA elapsed (escalation) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('wfl.sla_breach', 'in_app',
     'SLA breached: {{entity_label}} {{entity_code}} escalated',
     '{{entity_label}} {{entity_code}} breached its {{sla_target_hours}}h SLA. Escalated to {{escalated_to}}.',
     '{"entity_label":"string","entity_code":"string","sla_target_hours":"number","escalated_to":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),
    ('wfl.sla_breach', 'email',
     'SLA breached: {{entity_label}} {{entity_code}}',
     E'SLA breached.\n\n{{entity_label}} {{entity_code}} has exceeded its {{sla_target_hours}}h approval SLA and is now escalated to {{escalated_to}}.\n\nReview it: {{entity_url}}',
     '{"entity_label":"string","entity_code":"string","sla_target_hours":"number","escalated_to":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),

    -- â”€â”€ wfl.sla_auto_reject â€” 200% of SLA elapsed (auto-rejected) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('wfl.sla_auto_reject', 'in_app',
     'Auto-rejected: {{entity_label}} {{entity_code}}',
     '{{entity_label}} {{entity_code}} was auto-rejected after exceeding {{percent_of_sla}}% of its SLA. Resubmit if still needed.',
     '{"entity_label":"string","entity_code":"string","percent_of_sla":"number","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),
    ('wfl.sla_auto_reject', 'email',
     'Auto-rejected: {{entity_label}} {{entity_code}}',
     E'{{entity_label}} {{entity_code}} was automatically rejected after the SLA was exceeded by {{percent_of_sla}}% with no decision.\n\nResubmit if still needed: {{entity_url}}',
     '{"entity_label":"string","entity_code":"string","percent_of_sla":"number","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),

    -- â”€â”€ wfl.sla_auto_cancel â€” operational variant (receipts, etc.) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('wfl.sla_auto_cancel', 'in_app',
     'Auto-cancelled: {{entity_label}} {{entity_code}}',
     '{{entity_label}} {{entity_code}} was auto-cancelled after exceeding {{percent_of_sla}}% of its SLA.',
     '{"entity_label":"string","entity_code":"string","percent_of_sla":"number","entity_type":"string","entity_id":"string","entity_url":"string"}'
    ),
    ('wfl.sla_auto_cancel', 'email',
     'Auto-cancelled: {{entity_label}} {{entity_code}}',
     E'{{entity_label}} {{entity_code}} was automatically cancelled after the SLA was exceeded by {{percent_of_sla}}% with no decision.\n\nThe operational window has closed.',
     '{"entity_label":"string","entity_code":"string","percent_of_sla":"number","entity_type":"string","entity_id":"string","entity_url":"string"}'
    )
) AS v(template_key, channel, subject, body_text, variables_schema)
WHERE NOT EXISTS (
    SELECT 1 FROM control.notification_template t
    WHERE t.tenant_id IS NULL
      AND t.template_key = v.template_key
      AND t.channel      = v.channel
      AND t.locale       = 'en'
      AND t.version      = 1
);


-- Â§8 Notification routing
-- Mirrors the PI rule in 083_notification_routing_rule.sql.
-- Idempotent: WHERE NOT EXISTS on (tenant_id, code).
--
-- Recipient strategy (recipient_rules.jsonb):
--   actor=true          â†’ the principal who fired the transition
--   roles=[â€¦]           â†’ role-based fanout (resolved against role grants)
--   explicit_ids=[â€¦]    â†’ static principal IDs (used by service layer)
--   workflow_phase      â†’ in_workflow (assignees) | post_workflow (decision)

INSERT INTO control.notification_routing_rule
    (code, name, description,
     event_type, entity_type, template_key,
     channels, priority, recipient_rules,
     dedup_window_ms, is_enabled, sort_order, created_by)
SELECT
    v.code,
    v.name,
    v.description,
    v.event_type,
    v.entity_type,
    v.template_key,
    v.channels,
    v.priority,
    v.recipient_rules::jsonb,
    v.dedup_window_ms,
    true,
    v.sort_order,
    '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- â”€â”€ purchase_requisition lifecycle changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('document.purchase_requisition_lifecycle_changed',
     'Purchase Requisition Lifecycle Changed',
     'Notify requester + current assignee when a requisition transitions.',
     'purchase_requisition.lifecycle.changed',
     'purchase_requisition',
     'purchase_requisition.lifecycle.changed',
     ARRAY['in_app','email']::text[],
     'normal',
     '{"actor":true,"workflow_phase":"in_workflow","roles":["requester","approver"]}',
     300000,
     10),

    -- â”€â”€ purchase_order_confirmation lifecycle changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('document.purchase_order_confirmation_lifecycle_changed',
     'PO Confirmation Lifecycle Changed',
     'Notify buyer when supplier confirms / disputes / amends a PO.',
     'purchase_order_confirmation.lifecycle.changed',
     'purchase_order_confirmation',
     'purchase_order_confirmation.lifecycle.changed',
     ARRAY['in_app','email']::text[],
     'normal',
     '{"actor":true,"roles":["buyer","procurement_manager"]}',
     300000,
     20),

    -- â”€â”€ delivery_note lifecycle changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('document.delivery_note_lifecycle_changed',
     'Delivery Note Lifecycle Changed',
     'Notify warehouse + buyer when a delivery transitions (announced/arrived/returned).',
     'delivery_note.lifecycle.changed',
     'delivery_note',
     'delivery_note.lifecycle.changed',
     ARRAY['in_app']::text[],
     'normal',
     '{"actor":true,"roles":["warehouse_manager","buyer"]}',
     300000,
     30),

    -- â”€â”€ receipt lifecycle changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('document.receipt_lifecycle_changed',
     'Receipt Lifecycle Changed',
     'Notify warehouse + AP when a receipt is approved/posted/reversed.',
     'receipt.lifecycle.changed',
     'receipt',
     'receipt.lifecycle.changed',
     ARRAY['in_app','email']::text[],
     'normal',
     '{"actor":true,"workflow_phase":"post_workflow","roles":["warehouse_manager","ap_clerk"]}',
     300000,
     40),

    -- â”€â”€ service_sheet lifecycle changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('document.service_sheet_lifecycle_changed',
     'Service Sheet Lifecycle Changed',
     'Notify project owner + requester + finance when a service sheet transitions.',
     'service_sheet.lifecycle.changed',
     'service_sheet',
     'service_sheet.lifecycle.changed',
     ARRAY['in_app','email']::text[],
     'normal',
     '{"actor":true,"workflow_phase":"in_workflow","roles":["project_owner","requester","finance_controller"]}',
     300000,
     50),

    -- payment lifecycle changes
    ('document.payment_entry_lifecycle_changed',
     'Payment Entry Lifecycle Changed',
     'Notify treasury and AP when a payment is approved, posted, transmitted, cleared, reversed, or voided.',
     'payment_entry.lifecycle.changed',
     'payment_entry',
     'payment_entry.lifecycle.changed',
     ARRAY['in_app','email']::text[],
     'high',
     '{"actor":true,"workflow_phase":"post_workflow","roles":["treasury_manager","finance_controller","ap_clerk"]}',
     300000,
     55),

    -- â”€â”€ SLA reminders (75% of SLA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Single rule covers any entity_type â€” workflow engine fires the event_type
    -- with the entity_type bound at runtime.
    ('workflow.sla_reminder',
     'Workflow SLA Reminder',
     'Notify the assignee at 75% of the SLA window.',
     'workflow.sla_reminder',
     NULL,
     'wfl.sla_reminder',
     ARRAY['in_app','email']::text[],
     'normal',
     '{"workflow_phase":"in_workflow","assignees_only":true}',
     86400000,  -- 24 h dedup so each assignee gets at most one reminder per day
     60),

    -- â”€â”€ SLA breach (100% of SLA, escalation) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('workflow.sla_breach',
     'Workflow SLA Breach',
     'Notify the escalation chain when the SLA is breached.',
     'workflow.sla_breach',
     NULL,
     'wfl.sla_breach',
     ARRAY['in_app','email']::text[],
     'high',
     '{"workflow_phase":"in_workflow","escalation_chain":true}',
     86400000,
     70),

    -- â”€â”€ SLA auto-reject (200% of SLA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('workflow.sla_auto_reject',
     'Workflow SLA Auto-Reject',
     'Notify requester + assignees when the workflow auto-rejects on SLA.',
     'workflow.sla_auto_reject',
     NULL,
     'wfl.sla_auto_reject',
     ARRAY['in_app','email']::text[],
     'high',
     '{"requester":true,"workflow_phase":"in_workflow"}',
     0,         -- terminal â€” no dedup
     80),

    -- â”€â”€ SLA auto-cancel (operational, e.g. receipts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('workflow.sla_auto_cancel',
     'Workflow SLA Auto-Cancel',
     'Notify operations when a time-bound workflow auto-cancels on SLA.',
     'workflow.sla_auto_cancel',
     NULL,
     'wfl.sla_auto_cancel',
     ARRAY['in_app','email']::text[],
     'high',
     '{"requester":true,"roles":["operations_manager"]}',
     0,
     90)
) AS v(code, name, description,
       event_type, entity_type, template_key,
       channels, priority, recipient_rules,
       dedup_window_ms, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.notification_routing_rule r
    WHERE r.tenant_id IS NULL AND r.code = v.code
);


-- Â§9 State masks
--
-- Why this matters:
--   The lifecycle hooks (Â§6a/Â§6b) prevent illegal *transitions*. State masks
--   prevent illegal *edits/deletes* on records sitting in a particular status
--   (e.g. you can't edit a posted receipt's lines even if no transition is
--   firing). Resolved during descriptor compile; emits disabled_reason to
--   drive UI affordance tooltips.
--
-- Convention:
--   can_edit / can_delete default to true and are only flipped to false here
--   for statuses where the record is operationally or financially locked.

INSERT INTO control.entity_lifecycle_state_mask (
    tenant_id, entity_name, record_status,
    can_edit, can_delete, can_transition_to,
    disabled_reason, applies_to_planes, created_by
)
VALUES
    -- â”€â”€ purchase_requisition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- approved through closed: header is frozen; conversion mutates only line
    -- conversion caches, not the header proper.
    (NULL, 'purchase_requisition', 'approved',            false, true,  NULL, 'approved_lock',           ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_requisition', 'partially_converted', false, false, NULL, 'partially_converted_lock',ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_requisition', 'fully_converted',     false, false, NULL, 'fully_converted_immutable', ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_requisition', 'closed',              false, false, NULL, 'closed_immutable',        ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_requisition', 'cancelled',           false, false, NULL, 'cancelled_immutable',     ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),

    -- â”€â”€ purchase_order_confirmation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- supplier artifact; only mutable at received / changes_proposed.
    (NULL, 'purchase_order_confirmation', 'confirmed',        false, false, NULL, 'confirmed_immutable',  ARRAY['neon','admin','mesh'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_order_confirmation', 'changes_accepted', false, false, NULL, 'accepted_immutable',   ARRAY['neon','admin','mesh'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_order_confirmation', 'rejected',         false, false, NULL, 'rejected_immutable',   ARRAY['neon','admin','mesh'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_order_confirmation', 'cancelled',        false, false, NULL, 'cancelled_immutable',  ARRAY['neon','admin','mesh'], '00000000-0000-0000-0000-000000000000'::uuid),

    -- â”€â”€ delivery_note â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Logistics artifact. Once arrived, header locks; line edits route through receipts.
    (NULL, 'delivery_note', 'arrived',             false, true,  NULL, 'arrived_lock',            ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'delivery_note', 'partially_receipted', false, false, NULL, 'partially_receipted_lock',ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'delivery_note', 'fully_receipted',     false, false, NULL, 'fully_receipted_immutable',ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'delivery_note', 'returned',            false, false, NULL, 'returned_immutable',      ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'delivery_note', 'cancelled',           false, false, NULL, 'cancelled_immutable',     ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),

    -- â”€â”€ receipt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Approval gate + posting gate. posted: financial lock. reversed: history.
    (NULL, 'receipt', 'approved',  false, true,  NULL, 'approved_lock',       ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'receipt', 'posted',    false, false, NULL, 'posted_locked',       ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'receipt', 'reversed',  false, false, NULL, 'reversed_immutable',  ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'receipt', 'cancelled', false, false, NULL, 'cancelled_immutable', ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),

    -- â”€â”€ service_sheet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Two-step. Acceptance/approval/posted progressively lock the record.
    (NULL, 'service_sheet', 'accepted',  false, true,  NULL, 'accepted_lock',       ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'service_sheet', 'approved',  false, true,  NULL, 'approved_lock',       ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'service_sheet', 'posted',    false, false, NULL, 'posted_locked',       ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'service_sheet', 'reversed',  false, false, NULL, 'reversed_immutable',  ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'service_sheet', 'cancelled', false, false, NULL, 'cancelled_immutable', ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),

    -- â”€â”€ schedule_line (polymorphic carrier) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Superseded rows are history; only is_current_version=true rows are
    -- editable. The mask handles the status-level lock; the runtime
    -- additionally filters on is_current_version when surfacing rows.
    (NULL, 'schedule_line', 'superseded', false, false, NULL, 'superseded_history',ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'schedule_line', 'retired',    false, false, NULL, 'retired_immutable', ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'schedule_line', 'cancelled',  false, false, NULL, 'cancelled_immutable',ARRAY['neon','admin'], '00000000-0000-0000-0000-000000000000'::uuid)

ON CONFLICT (tenant_id, entity_name, record_status)
    WHERE entity_version_id IS NULL DO UPDATE
SET can_edit         = EXCLUDED.can_edit,
    can_delete       = EXCLUDED.can_delete,
    disabled_reason  = EXCLUDED.disabled_reason,
    applies_to_planes= EXCLUDED.applies_to_planes,
    updated_at       = now(),
    updated_by       = '00000000-0000-0000-0000-000000000000'::uuid;


COMMIT;




