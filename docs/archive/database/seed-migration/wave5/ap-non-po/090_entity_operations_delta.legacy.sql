-- Non-PO UI metadata for operations already published by the canonical catalog.
-- This seed never creates permissions or operation authority.
WITH bindings (
    entity_name, operation_code, surface, placement,
    handler_type, handler_target, is_record_required, sort_order
) AS (
    VALUES
      ('purchase_invoice', 'hold',             'DETAIL', 'OVERFLOW', 'MODAL',    'put_on_hold',                          true, 110),
      ('purchase_invoice', 'release_hold',     'DETAIL', 'OVERFLOW', 'MODAL',    'release_hold',                         true, 120),
      ('purchase_invoice', 'propose_payment',  'DETAIL', 'TOOLBAR',  'NAVIGATE', '/app/payment_entry/new?invoice={id}', true, 130),
      ('purchase_invoice', 'view_je',          'DETAIL', 'OVERFLOW', 'NAVIGATE', '/app/journal_entry?source_id={id}',    true, 140),
      ('purchase_invoice', 'match_advance',    'DETAIL', 'OVERFLOW', 'MODAL',    'match_supplier_advance',               true, 150),
      ('purchase_invoice', 'allocate_payment', 'DETAIL', 'OVERFLOW', 'MODAL',    'allocate_payment',                     true, 160),
      ('payment_entry',    'transmit',         'DETAIL', 'TOOLBAR',  'MODAL',    'transmit_to_bank',                     true, 120),
      ('payment_entry',    'print',            'DETAIL', 'OVERFLOW', 'API',      'print_remittance',                     true, 130),
      ('payment_entry',    'mark_cleared',     'DETAIL', 'TOOLBAR',  'MODAL',    'mark_bank_cleared',                    true, 140),
      ('payment_entry',    'allocate',         'DETAIL', 'PRIMARY',  'MODAL',    'allocate_to_invoice',                  true, 150),
      ('payment_entry',    'unallocate',       'DETAIL', 'OVERFLOW', 'MODAL',    'unallocate',                            true, 160)
)
UPDATE control.entity_operation operation
   SET entity_version_id = version.id,
       surface = binding.surface,
       placement = binding.placement,
       handler_type = binding.handler_type,
       handler_target = binding.handler_target,
       is_record_required = binding.is_record_required,
       sort_order = binding.sort_order,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
  FROM bindings binding
  JOIN control.entity entity
    ON entity.entity_code = binding.entity_name
   AND entity.tenant_id IS NULL
  JOIN control.entity_version version
    ON version.entity_id = entity.id
   AND version.tenant_id IS NULL
   AND version.status = 'EFFECTIVE'
 WHERE operation.tenant_id IS NULL
   AND operation.entity_name IN (
       entity.entity_code, entity.name, entity.table_name
   )
   AND operation.operation_code_v2 = binding.operation_code
   AND operation.v2_publication_status = 'published';
