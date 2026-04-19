-- 100_finance/900_operations/001_fin_operations.sql
-- Purpose: control.entity_operation registrations for all 6 finance entities
--          Vendor, Customer, Invoice, Purchase Order, Journal Entry, Payment Entry
-- Depends on: 100_master/001_vendor.sql, 003_customer.sql
--             200_document/001_invoice.sql, 004_purchase_order.sql, 007_journal_entry.sql,
--             200_document/010_payment_entry.sql
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING

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

-- ══════════════════════════════════════════════════════════════════════════════
-- Purchase Invoice operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'purchase_invoice', 'create',   'LIST',   'PRIMARY',  'NAVIGATE', '/document/purchase_invoice/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'update',   'DETAIL', 'PRIMARY',  'NAVIGATE', '/document/purchase_invoice/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'submit',   'DETAIL', 'PRIMARY',  'MODAL',    'submit',                               true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'approve',  'DETAIL', 'PRIMARY',  'MODAL',    'approve',                              true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'deny',     'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                                 true,  50, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'post',     'DETAIL', 'TOOLBAR',  'MODAL',    'post',                                 true,  60, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'cancel',   'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                               true,  70, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'reverse',  'DETAIL', 'OVERFLOW', 'MODAL',    'reverse',                              true,  80, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'copy',     'DETAIL', 'OVERFLOW', 'API',      'copy',                                 true,  90, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'export',   'LIST',   'TOOLBAR',  'API',      'export',                               false, 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Purchase Order operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'purchase_order', 'create',   'LIST',   'PRIMARY',  'NAVIGATE', '/document/purchase_order/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'update',   'DETAIL', 'PRIMARY',  'NAVIGATE', '/document/purchase_order/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
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
    (NULL, 'journal_entry', 'create',   'LIST',   'PRIMARY',  'NAVIGATE', '/document/journal_entry/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'update',   'DETAIL', 'PRIMARY',  'NAVIGATE', '/document/journal_entry/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
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
    (NULL, 'payment_entry', 'create',    'LIST',   'PRIMARY',  'NAVIGATE', '/document/payment_entry/new',        false, 10,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'update',    'DETAIL', 'PRIMARY',  'NAVIGATE', '/document/payment_entry/{id}/edit',  true,  20,  '00000000-0000-0000-0000-000000000000'),
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
