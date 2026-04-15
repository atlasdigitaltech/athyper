-- 060_entity_operations/002_ops_finance_org.sql
-- Entity operation registrations for Finance Org entities (49–64)
-- Covers: legal_entity, company_code, business_unit, cost_center, profit_center,
--         warehouse, chart_of_account, gl_account, project, project_item,
--         dimension_set, fiscal_period
-- Idempotent: ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- legal_entity  (Set C: full CRUD + import + activate/deactivate/close)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'legal_entity','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/legal_entity/new',       false,10,v_su),
    (NULL,'legal_entity','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/legal_entity/{id}/edit', true, 20,v_su),
    (NULL,'legal_entity','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'legal_entity','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'legal_entity','close',   'DETAIL','OVERFLOW','MODAL',   'close',                       true, 50,v_su),
    (NULL,'legal_entity','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 60,v_su),
    (NULL,'legal_entity','export',  'LIST',  'TOOLBAR', 'API',     'export',                      false,70,v_su),
    (NULL,'legal_entity','import',  'LIST',  'TOOLBAR', 'API',     'import',                      false,80,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- company_code  (Set C)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'company_code','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/company_code/new',       false,10,v_su),
    (NULL,'company_code','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/company_code/{id}/edit', true, 20,v_su),
    (NULL,'company_code','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'company_code','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'company_code','close',  'DETAIL','OVERFLOW','MODAL',   'close',                       true, 50,v_su),
    (NULL,'company_code','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 60,v_su),
    (NULL,'company_code','export', 'LIST',  'TOOLBAR', 'API',     'export',                      false,70,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- business_unit / cost_center / profit_center  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'business_unit','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/business_unit/new',       false,10,v_su),
    (NULL,'business_unit','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/business_unit/{id}/edit', true, 20,v_su),
    (NULL,'business_unit','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'business_unit','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                   true, 40,v_su),
    (NULL,'business_unit','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                       true, 50,v_su),
    (NULL,'business_unit','export', 'LIST',  'TOOLBAR', 'API',     'export',                       false,60,v_su),

    (NULL,'cost_center','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/cost_center/new',       false,10,v_su),
    (NULL,'cost_center','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/cost_center/{id}/edit', true, 20,v_su),
    (NULL,'cost_center','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                 true, 30,v_su),
    (NULL,'cost_center','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                 true, 40,v_su),
    (NULL,'cost_center','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                     true, 50,v_su),
    (NULL,'cost_center','export', 'LIST',  'TOOLBAR', 'API',     'export',                     false,60,v_su),

    (NULL,'profit_center','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/profit_center/new',       false,10,v_su),
    (NULL,'profit_center','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/profit_center/{id}/edit', true, 20,v_su),
    (NULL,'profit_center','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'profit_center','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                   true, 40,v_su),
    (NULL,'profit_center','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                       true, 50,v_su),
    (NULL,'profit_center','export', 'LIST',  'TOOLBAR', 'API',     'export',                       false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- warehouse  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'warehouse','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/warehouse/new',       false,10,v_su),
    (NULL,'warehouse','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/warehouse/{id}/edit', true, 20,v_su),
    (NULL,'warehouse','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',               true, 30,v_su),
    (NULL,'warehouse','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',               true, 40,v_su),
    (NULL,'warehouse','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                   true, 50,v_su),
    (NULL,'warehouse','export', 'LIST',  'TOOLBAR', 'API',     'export',                   false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- chart_of_account  (Set C: + import, copy)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'chart_of_account','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/chart_of_account/new',       false,10,v_su),
    (NULL,'chart_of_account','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/chart_of_account/{id}/edit', true, 20,v_su),
    (NULL,'chart_of_account','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                      true, 30,v_su),
    (NULL,'chart_of_account','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                      true, 40,v_su),
    (NULL,'chart_of_account','copy',   'DETAIL','OVERFLOW','API',     'copy',                            true, 50,v_su),
    (NULL,'chart_of_account','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                          true, 60,v_su),
    (NULL,'chart_of_account','export', 'LIST',  'TOOLBAR', 'API',     'export',                          false,70,v_su),
    (NULL,'chart_of_account','import', 'LIST',  'TOOLBAR', 'API',     'import',                          false,80,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- gl_account  (Set C + block/unblock via cancel/reopen)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'gl_account','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/gl_account/new',       false,10,v_su),
    (NULL,'gl_account','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/gl_account/{id}/edit', true, 20,v_su),
    (NULL,'gl_account','cancel',  'DETAIL','TOOLBAR', 'MODAL',   'block',                     true, 30,v_su),
    (NULL,'gl_account','reopen',  'DETAIL','TOOLBAR', 'MODAL',   'unblock',                   true, 40,v_su),
    (NULL,'gl_account','close',   'DETAIL','OVERFLOW','MODAL',   'close',                     true, 50,v_su),
    (NULL,'gl_account','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                    true, 60,v_su),
    (NULL,'gl_account','export',  'LIST',  'TOOLBAR', 'API',     'export',                    false,70,v_su),
    (NULL,'gl_account','import',  'LIST',  'TOOLBAR', 'API',     'import',                    false,80,v_su),
    (NULL,'gl_account','bulk_update','LIST','TOOLBAR','API',     'bulk_update',               false,90,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- project  (Set F: + submit/approve/close/reopen)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'project','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/project/new',       false,10,v_su),
    (NULL,'project','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/project/{id}/edit', true, 20,v_su),
    (NULL,'project','submit',  'DETAIL','PRIMARY', 'MODAL',   'submit',                 true, 30,v_su),
    (NULL,'project','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                true, 40,v_su),
    (NULL,'project','deny',    'DETAIL','TOOLBAR', 'MODAL',   'deny',                   true, 50,v_su),
    (NULL,'project','close',   'DETAIL','OVERFLOW','MODAL',   'close',                  true, 60,v_su),
    (NULL,'project','reopen',  'DETAIL','OVERFLOW','MODAL',   'reopen',                 true, 70,v_su),
    (NULL,'project','cancel',  'DETAIL','OVERFLOW','MODAL',   'cancel',                 true, 80,v_su),
    (NULL,'project','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                 true, 90,v_su),
    (NULL,'project','export',  'LIST',  'TOOLBAR', 'API',     'export',                 false,100,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- fiscal_period  (lifecycle: close/reopen + submit/approve)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'fiscal_period','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/fiscal_period/new',       false,10,v_su),
    (NULL,'fiscal_period','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/fiscal_period/{id}/edit', true, 20,v_su),
    (NULL,'fiscal_period','submit',  'DETAIL','PRIMARY', 'MODAL',   'submit_for_close',              true, 30,v_su),
    (NULL,'fiscal_period','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve_close',                 true, 40,v_su),
    (NULL,'fiscal_period','close',   'DETAIL','TOOLBAR', 'MODAL',   'close',                         true, 50,v_su),
    (NULL,'fiscal_period','reopen',  'DETAIL','OVERFLOW','MODAL',   'reopen',                        true, 60,v_su),
    (NULL,'fiscal_period','export',  'LIST',  'TOOLBAR', 'API',     'export',                        false,70,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL entities under Finance Org (Set G)
-- gl_account_type, gl_account_hierarchy, company_code_gl_config,
-- company_code_book_assignment, dimension_set, project_item
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'gl_account_type',           'create','LIST',  'PRIMARY', 'NAVIGATE','/app/gl_account_type/new',       false,10,v_su),
    (NULL,'gl_account_type',           'update','DETAIL','PRIMARY', 'NAVIGATE','/app/gl_account_type/{id}/edit', true, 20,v_su),
    (NULL,'gl_account_type',           'delete','DETAIL','OVERFLOW','MODAL',   'delete',                         true, 30,v_su),
    (NULL,'gl_account_type',           'export','LIST',  'TOOLBAR', 'API',     'export',                         false,40,v_su),
    (NULL,'company_code_gl_config',    'update','DETAIL','PRIMARY', 'MODAL',   'edit',                           true, 10,v_su),
    (NULL,'company_code_book_assignment','update','DETAIL','PRIMARY','MODAL',  'edit',                           true, 10,v_su),
    (NULL,'company_code_book_assignment','delete','DETAIL','OVERFLOW','MODAL', 'delete',                         true, 20,v_su),
    (NULL,'project_item',              'create','LIST',  'PRIMARY', 'MODAL',   'create',                         false,10,v_su),
    (NULL,'project_item',              'update','DETAIL','PRIMARY', 'MODAL',   'edit',                           true, 20,v_su),
    (NULL,'project_item',              'delete','DETAIL','OVERFLOW','MODAL',   'delete',                         true, 30,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

RAISE NOTICE 'entity_operation: Finance org entities seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;
