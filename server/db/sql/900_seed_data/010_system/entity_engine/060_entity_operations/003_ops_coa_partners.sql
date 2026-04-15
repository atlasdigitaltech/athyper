-- 060_entity_operations/003_ops_coa_partners.sql
-- Entity operation registrations for Business Partners + Assets (65–74)
-- Covers: customer, supplier, employee, company_code_customer_profile,
--         company_code_supplier_profile, asset_class, asset, asset_book,
--         asset_component, asset_assignment_history
-- Idempotent: ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- customer  (Set D: + close/reopen for credit hold / suspend)
-- NOTE: existing 001_fin_operations.sql seeds customer with cancel+close.
--       This file adds the reopen + import + bulk_update ops.
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'customer','reopen',      'DETAIL','OVERFLOW','MODAL','reactivate',  true, 45,v_su),
    (NULL,'customer','import',      'LIST',  'TOOLBAR', 'API',  'import',      false,55,v_su),
    (NULL,'customer','bulk_update', 'LIST',  'TOOLBAR', 'API',  'bulk_update', false,65,v_su),
    (NULL,'customer','copy',        'DETAIL','OVERFLOW','API',  'copy',        true, 35,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- supplier  (same additions — 001_fin_operations uses 'vendor'; this covers supplier)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'supplier','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/supplier/new',       false,10,v_su),
    (NULL,'supplier','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/supplier/{id}/edit', true, 20,v_su),
    (NULL,'supplier','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',              true, 30,v_su),
    (NULL,'supplier','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',              true, 40,v_su),
    (NULL,'supplier','close',      'DETAIL','OVERFLOW','MODAL',   'close',                   true, 50,v_su),
    (NULL,'supplier','copy',       'DETAIL','OVERFLOW','API',     'copy',                    true, 60,v_su),
    (NULL,'supplier','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                  true, 70,v_su),
    (NULL,'supplier','export',     'LIST',  'TOOLBAR', 'API',     'export',                  false,80,v_su),
    (NULL,'supplier','import',     'LIST',  'TOOLBAR', 'API',     'import',                  false,90,v_su),
    (NULL,'supplier','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',             false,100,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- employee  (Set C + delegate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'employee','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/employee/new',       false,10,v_su),
    (NULL,'employee','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/employee/{id}/edit', true, 20,v_su),
    (NULL,'employee','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',              true, 30,v_su),
    (NULL,'employee','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',              true, 40,v_su),
    (NULL,'employee','close',      'DETAIL','OVERFLOW','MODAL',   'terminate',               true, 50,v_su),
    (NULL,'employee','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                  true, 60,v_su),
    (NULL,'employee','export',     'LIST',  'TOOLBAR', 'API',     'export',                  false,70,v_su),
    (NULL,'employee','import',     'LIST',  'TOOLBAR', 'API',     'import',                  false,80,v_su),
    (NULL,'employee','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',             false,90,v_su),
    (NULL,'employee','delegate',   'DETAIL','OVERFLOW','MODAL',   'delegate',                true,100,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL: company_code_customer_profile, company_code_supplier_profile (Set G)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'company_code_customer_profile','update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su),
    (NULL,'company_code_supplier_profile','update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- asset_class  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'asset_class','create','LIST',  'PRIMARY', 'NAVIGATE','/app/asset_class/new',       false,10,v_su),
    (NULL,'asset_class','update','DETAIL','PRIMARY', 'NAVIGATE','/app/asset_class/{id}/edit', true, 20,v_su),
    (NULL,'asset_class','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                 true, 30,v_su),
    (NULL,'asset_class','reopen','DETAIL','OVERFLOW','MODAL',   'reactivate',                 true, 40,v_su),
    (NULL,'asset_class','delete','DETAIL','OVERFLOW','MODAL',   'delete',                     true, 50,v_su),
    (NULL,'asset_class','export','LIST',  'TOOLBAR', 'API',     'export',                     false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- asset  (Set C + dispose workflow)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'asset','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/asset/new',       false,10,v_su),
    (NULL,'asset','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/asset/{id}/edit', true, 20,v_su),
    (NULL,'asset','submit',  'DETAIL','PRIMARY', 'MODAL',   'submit_disposal',      true, 30,v_su),
    (NULL,'asset','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve_disposal',     true, 40,v_su),
    (NULL,'asset','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',           true, 50,v_su),
    (NULL,'asset','close',   'DETAIL','OVERFLOW','MODAL',   'dispose',              true, 60,v_su),
    (NULL,'asset','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',               true, 70,v_su),
    (NULL,'asset','export',  'LIST',  'TOOLBAR', 'API',     'export',               false,80,v_su),
    (NULL,'asset','import',  'LIST',  'TOOLBAR', 'API',     'import',               false,90,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL / RELATION: asset_book, asset_component, asset_assignment_history
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'asset_book',               'create','LIST',  'PRIMARY', 'MODAL','create', false,10,v_su),
    (NULL,'asset_book',               'update','DETAIL','PRIMARY', 'MODAL','edit',   true, 20,v_su),
    (NULL,'asset_book',               'delete','DETAIL','OVERFLOW','MODAL','delete', true, 30,v_su),
    (NULL,'asset_component',          'create','LIST',  'PRIMARY', 'MODAL','create', false,10,v_su),
    (NULL,'asset_component',          'update','DETAIL','PRIMARY', 'MODAL','edit',   true, 20,v_su),
    (NULL,'asset_component',          'delete','DETAIL','OVERFLOW','MODAL','delete', true, 30,v_su),
    (NULL,'asset_assignment_history', 'create','LIST',  'PRIMARY', 'MODAL','assign', false,10,v_su),
    (NULL,'asset_assignment_history', 'export','LIST',  'TOOLBAR', 'API',  'export', false,20,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

RAISE NOTICE 'entity_operation: Partners + Assets seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;
