-- 100_finance/900_operations/001_fin_operations.sql
-- Purpose: control.entity_operation registrations for all 6 finance entities
--          Vendor, Customer, Invoice, Purchase Order, Journal Entry, Payment Entry
-- Depends on: 100_master/001_vendor.sql, 003_customer.sql
--             200_document/001_invoice.sql, 004_purchase_order.sql, 007_journal_entry.sql,
--             200_document/010_payment_entry.sql
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING

-- ══════════════════════════════════════════════════════════════════════════════
-- Prerequisite: ensure permission codes used below exist in shared.permission.
-- hold / release_hold are workflow-hold operations; view_match is a utility read.
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('hold',         'Hold',             'workflow', 'record', 'medium', 92),
    ('release_hold', 'Release Hold',     'workflow', 'record', 'medium', 93),
    ('view_match',   'View Match Case',  'utility',  'record', 'low',    75)
) AS v(code, name, cat, st, rl, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Vendor operations
-- permission_codes must reference shared.permission.code
-- Master lifecycle actions map to: cancel (deactivate/block), close (archive)
-- ══════════════════════════════════════════════════════════════════════════════

-- Remove any legacy rows inserted under the old 'supplier' entity name.
-- The entity_engine ops file now seeds vendor directly; supplier rows are obsolete.
DELETE FROM control.entity_operation WHERE entity_name = 'supplier' AND tenant_id IS NULL;

INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'vendor', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', '/master/vendor/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'vendor', 'update',  'DETAIL', 'PRIMARY',  'NAVIGATE', '/master/vendor/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'vendor', 'cancel',  'DETAIL', 'OVERFLOW', 'MODAL',    'deactivate',               true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'vendor', 'close',   'DETAIL', 'OVERFLOW', 'MODAL',    'archive',                  true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'vendor', 'export',  'LIST',   'TOOLBAR',  'API',      'export',                   false, 50, '00000000-0000-0000-0000-000000000000')
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Customer operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'customer', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', '/master/customer/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'customer', 'update',  'DETAIL', 'PRIMARY',  'NAVIGATE', '/master/customer/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'customer', 'cancel',  'DETAIL', 'OVERFLOW', 'MODAL',    'deactivate',                 true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'customer', 'close',   'DETAIL', 'OVERFLOW', 'MODAL',    'archive',                    true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'customer', 'export',  'LIST',   'TOOLBAR',  'API',      'export',                     false, 50, '00000000-0000-0000-0000-000000000000')
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ── Idempotent correction of NAVIGATE handler_targets ────────────────────────
-- Always sets canonical underscore-slug URLs. Catches both the old /document/...
-- prefix and any prior hyphenated form (/app/purchase-invoice/...).
UPDATE control.entity_operation
SET handler_target = CASE
    WHEN entity_name = 'purchase_invoice' AND permission_code = 'create' THEN '/app/purchase_invoice/new'
    WHEN entity_name = 'purchase_invoice' AND permission_code = 'update' THEN '/app/purchase_invoice/{id}/edit'
    WHEN entity_name = 'purchase_order'   AND permission_code = 'create' THEN '/app/purchase_order/new'
    WHEN entity_name = 'purchase_order'   AND permission_code = 'update' THEN '/app/purchase_order/{id}/edit'
    WHEN entity_name = 'journal_entry'    AND permission_code = 'create' THEN '/app/journal_entry/new'
    WHEN entity_name = 'journal_entry'    AND permission_code = 'update' THEN '/app/journal_entry/{id}/edit'
    WHEN entity_name = 'payment_entry'    AND permission_code = 'create' THEN '/app/payment_entry/new'
    WHEN entity_name = 'payment_entry'    AND permission_code = 'update' THEN '/app/payment_entry/{id}/edit'
END
WHERE tenant_id IS NULL
  AND entity_name IN ('purchase_invoice','purchase_order','journal_entry','payment_entry')
  AND permission_code IN ('create','update')
  AND handler_type = 'NAVIGATE';

-- ══════════════════════════════════════════════════════════════════════════════
-- Purchase Invoice operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'purchase_invoice', 'create',          'LIST',   'PRIMARY',  'NAVIGATE', '/app/purchase_invoice/new',       false, 10,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'update',          'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/purchase_invoice/{id}/edit', true,  20,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'submit',          'DETAIL', 'PRIMARY',  'MODAL',    'flow:submit_for_approval',        true,  30,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'approve',         'DETAIL', 'PRIMARY',  'MODAL',    'approve',                        true,  40,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'deny',            'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                           true,  50,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'post',            'DETAIL', 'TOOLBAR',  'MODAL',    'flow:post_invoice',              true,  60,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'cancel',          'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                         true,  70,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'reverse',         'DETAIL', 'OVERFLOW', 'MODAL',    'flow:reverse_invoice',           true,  80,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'copy',            'DETAIL', 'OVERFLOW', 'API',      'copy',                           true,  90,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'export',          'LIST',   'TOOLBAR',  'API',      'export',                         false, 100, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'hold',            'DETAIL', 'OVERFLOW', 'MODAL',    'hold',                           true,  110, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'release_hold',    'DETAIL', 'OVERFLOW', 'MODAL',    'release_hold',                   true,  120, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'amend',           'DETAIL', 'OVERFLOW', 'MODAL',    'amend',                          true,  130, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'ap.promote_proforma','DETAIL', 'PRIMARY',  'MODAL',    'flow:promote_proforma',          true,  25,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- Idempotent correction: ensure submit and post use the flow handler_targets
-- (catches existing rows that were seeded with the generic 'submit'/'post' targets)
UPDATE control.entity_operation
   SET handler_target = CASE
       WHEN permission_code = 'submit'  THEN 'flow:submit_for_approval'
       WHEN permission_code = 'post'    THEN 'flow:post_invoice'
       WHEN permission_code = 'reverse' THEN 'flow:reverse_invoice'
   END
 WHERE tenant_id IS NULL
   AND entity_name = 'purchase_invoice'
   AND permission_code IN ('submit','post','reverse')
   AND handler_target NOT LIKE 'flow:%';

-- ══════════════════════════════════════════════════════════════════════════════
-- Purchase Order operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'purchase_order', 'create',   'LIST',   'PRIMARY',  'NAVIGATE', '/app/purchase_order/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'update',   'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/purchase_order/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'submit',   'DETAIL', 'PRIMARY',  'MODAL',    'submit',                             true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'approve',  'DETAIL', 'PRIMARY',  'MODAL',    'approve',                            true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'deny',     'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                               true,  50, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'close',    'DETAIL', 'TOOLBAR',  'MODAL',    'close',                              true,  60, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'cancel',   'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                             true,  70, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'copy',     'DETAIL', 'OVERFLOW', 'API',      'copy',                               true,  80, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'export',   'LIST',   'TOOLBAR',  'API',      'export',                             false, 90, '00000000-0000-0000-0000-000000000000')
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Journal Entry operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'journal_entry', 'create',   'LIST',   'PRIMARY',  'NAVIGATE', '/app/journal_entry/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'update',   'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/journal_entry/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'submit',   'DETAIL', 'PRIMARY',  'MODAL',    'submit',                            true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'approve',  'DETAIL', 'PRIMARY',  'MODAL',    'approve',                           true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'deny',     'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                              true,  50, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'post',     'DETAIL', 'TOOLBAR',  'MODAL',    'post',                              true,  60, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'reverse',  'DETAIL', 'OVERFLOW', 'MODAL',    'reverse',                           true,  70, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'copy',     'DETAIL', 'OVERFLOW', 'API',      'copy',                              true,  80, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'export',   'LIST',   'TOOLBAR',  'API',      'export',                            false, 90, '00000000-0000-0000-0000-000000000000')
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Payment Entry operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'payment_entry', 'create',    'LIST',   'PRIMARY',  'NAVIGATE', '/app/payment_entry/new',        false, 10,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'update',    'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/payment_entry/{id}/edit',  true,  20,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'submit',    'DETAIL', 'PRIMARY',  'MODAL',    'submit',                             true,  30,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'approve',   'DETAIL', 'PRIMARY',  'MODAL',    'approve',                            true,  40,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'deny',      'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                               true,  50,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'post',      'DETAIL', 'TOOLBAR',  'MODAL',    'post',                               true,  60,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'void',      'DETAIL', 'OVERFLOW', 'MODAL',    'void',                               true,  70,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'reverse',   'DETAIL', 'OVERFLOW', 'MODAL',    'reverse',                            true,  80,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'cancel',    'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                             true,  90,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'copy',      'DETAIL', 'OVERFLOW', 'API',      'copy',                               true,  100, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'export',    'LIST',   'TOOLBAR',  'API',      'export',                             false, 110, '00000000-0000-0000-0000-000000000000')
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Purchase Invoice Line operations
-- create  → add a new line (only available when invoice is draft)
-- update  → edit an existing line (only available when invoice is draft/amend)
-- delete_draft → remove a line (only available when invoice is draft)
-- view_distribution → navigate to the accounting distributions for this line
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'purchase_invoice_line', 'create',              'LIST',   'PRIMARY',  'MODAL',    'add_line',                                               false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice_line', 'update',              'DETAIL', 'PRIMARY',  'MODAL',    'edit_line',                                              true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice_line', 'delete_draft',        'DETAIL', 'OVERFLOW', 'MODAL',    'delete_line',                                            true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice_line', 'view_je',             'DETAIL', 'OVERFLOW', 'NAVIGATE', '/document/accounting_distribution?source_line_id={id}', true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice_line', 'view_match',          'DETAIL', 'OVERFLOW', 'NAVIGATE', '/document/invoice_match_case?invoice_line_id={id}',      true,  50, '00000000-0000-0000-0000-000000000000')
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;
