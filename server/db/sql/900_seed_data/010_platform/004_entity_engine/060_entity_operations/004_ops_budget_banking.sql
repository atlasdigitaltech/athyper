-- 060_entity_operations/004_ops_budget_banking.sql
-- Entity operation registrations for Budget, Banking, Payment Terms, Products (84–102)
-- Covers: budget_profile, budget_allocation, planning_model,
--         bank_party, bank_account, bank_account_mandate, bank_branch, payment_method,
--         holiday_calendar, holiday_calendar_day, payment_term, payment_term_clause,
--         payment_term_discount_tier, product, item, item_category, spend_category,
--         commodity_classification, company_code_spend_policy
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- budget_profile  (Set F + lock)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'budget_profile','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/budget_profile/new',       false,10,v_su),
    (NULL,'budget_profile','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/budget_profile/{id}/edit', true, 20,v_su),
    (NULL,'budget_profile','submit',  'DETAIL','PRIMARY', 'MODAL',   'submit',                        true, 30,v_su),
    (NULL,'budget_profile','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                       true, 40,v_su),
    (NULL,'budget_profile','deny',    'DETAIL','TOOLBAR', 'MODAL',   'deny',                          true, 50,v_su),
    (NULL,'budget_profile','close',   'DETAIL','OVERFLOW','MODAL',   'lock',                          true, 60,v_su),
    (NULL,'budget_profile','reopen',  'DETAIL','OVERFLOW','MODAL',   'unlock',                        true, 70,v_su),
    (NULL,'budget_profile','cancel',  'DETAIL','OVERFLOW','MODAL',   'cancel',                        true, 80,v_su),
    (NULL,'budget_profile','copy',    'DETAIL','OVERFLOW','API',     'copy',                          true, 90,v_su),
    (NULL,'budget_profile','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                        true,100,v_su),
    (NULL,'budget_profile','export',  'LIST',  'TOOLBAR', 'API',     'export',                        false,110,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- budget_allocation  (Set B + bulk_update)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'budget_allocation','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/budget_allocation/new',       false,10,v_su),
    (NULL,'budget_allocation','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/budget_allocation/{id}/edit', true, 20,v_su),
    (NULL,'budget_allocation','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',                       true, 30,v_su),
    (NULL,'budget_allocation','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                           true, 40,v_su),
    (NULL,'budget_allocation','export',     'LIST',  'TOOLBAR', 'API',     'export',                           false,50,v_su),
    (NULL,'budget_allocation','import',     'LIST',  'TOOLBAR', 'API',     'import',                           false,60,v_su),
    (NULL,'budget_allocation','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',                      false,70,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- planning_model  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'planning_model','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/planning_model/new',       false,10,v_su),
    (NULL,'planning_model','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/planning_model/{id}/edit', true, 20,v_su),
    (NULL,'planning_model','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                    true, 30,v_su),
    (NULL,'planning_model','copy',   'DETAIL','OVERFLOW','API',     'copy',                          true, 40,v_su),
    (NULL,'planning_model','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                        true, 50,v_su),
    (NULL,'planning_model','export', 'LIST',  'TOOLBAR', 'API',     'export',                        false,60,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- bank_party  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'bank_party','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/bank_party/new',       false,10,v_su),
    (NULL,'bank_party','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/bank_party/{id}/edit', true, 20,v_su),
    (NULL,'bank_party','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                true, 30,v_su),
    (NULL,'bank_party','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                true, 40,v_su),
    (NULL,'bank_party','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                    true, 50,v_su),
    (NULL,'bank_party','export', 'LIST',  'TOOLBAR', 'API',     'export',                    false,60,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- bank_account  (Set C + activate/deactivate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'bank_account','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/bank_account/new',       false,10,v_su),
    (NULL,'bank_account','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/bank_account/{id}/edit', true, 20,v_su),
    (NULL,'bank_account','cancel', 'DETAIL','TOOLBAR', 'MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'bank_account','reopen', 'DETAIL','TOOLBAR', 'MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'bank_account','close',  'DETAIL','OVERFLOW','MODAL',   'close',                       true, 50,v_su),
    (NULL,'bank_account','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 60,v_su),
    (NULL,'bank_account','export', 'LIST',  'TOOLBAR', 'API',     'export',                      false,70,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- bank_branch / payment_method  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'bank_branch',  'create','LIST',  'PRIMARY', 'NAVIGATE','/app/bank_branch/new',       false,10,v_su),
    (NULL,'bank_branch',  'update','DETAIL','PRIMARY', 'NAVIGATE','/app/bank_branch/{id}/edit', true, 20,v_su),
    (NULL,'bank_branch',  'delete','DETAIL','OVERFLOW','MODAL',   'delete',                     true, 30,v_su),
    (NULL,'bank_branch',  'export','LIST',  'TOOLBAR', 'API',     'export',                     false,40,v_su),
    (NULL,'payment_method','create','LIST', 'PRIMARY', 'NAVIGATE','/app/payment_method/new',       false,10,v_su),
    (NULL,'payment_method','update','DETAIL','PRIMARY','NAVIGATE','/app/payment_method/{id}/edit', true, 20,v_su),
    (NULL,'payment_method','cancel','DETAIL','OVERFLOW','MODAL',  'deactivate',                   true, 30,v_su),
    (NULL,'payment_method','delete','DETAIL','OVERFLOW','MODAL',  'delete',                       true, 40,v_su),
    (NULL,'payment_method','export','LIST',  'TOOLBAR','API',     'export',                       false,50,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- payment_term  (Set B + import)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'payment_term','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/payment_term/new',       false,10,v_su),
    (NULL,'payment_term','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/payment_term/{id}/edit', true, 20,v_su),
    (NULL,'payment_term','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'payment_term','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'payment_term','copy',   'DETAIL','OVERFLOW','API',     'copy',                        true, 50,v_su),
    (NULL,'payment_term','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 60,v_su),
    (NULL,'payment_term','export', 'LIST',  'TOOLBAR', 'API',     'export',                      false,70,v_su),
    (NULL,'payment_term','import', 'LIST',  'TOOLBAR', 'API',     'import',                      false,80,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- holiday_calendar  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'holiday_calendar','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/holiday_calendar/new',       false,10,v_su),
    (NULL,'holiday_calendar','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/holiday_calendar/{id}/edit', true, 20,v_su),
    (NULL,'holiday_calendar','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                      true, 30,v_su),
    (NULL,'holiday_calendar','copy',   'DETAIL','OVERFLOW','API',     'copy',                            true, 40,v_su),
    (NULL,'holiday_calendar','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                          true, 50,v_su),
    (NULL,'holiday_calendar','export', 'LIST',  'TOOLBAR', 'API',     'export',                          false,60,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- product / item  (Set C: + archived lifecycle)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'product','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/product/new',       false,10,v_su),
    (NULL,'product','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/product/{id}/edit', true, 20,v_su),
    (NULL,'product','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',             true, 30,v_su),
    (NULL,'product','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',             true, 40,v_su),
    (NULL,'product','close',      'DETAIL','OVERFLOW','MODAL',   'archive',                true, 50,v_su),
    (NULL,'product','copy',       'DETAIL','OVERFLOW','API',     'copy',                   true, 60,v_su),
    (NULL,'product','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                 true, 70,v_su),
    (NULL,'product','export',     'LIST',  'TOOLBAR', 'API',     'export',                 false,80,v_su),
    (NULL,'product','import',     'LIST',  'TOOLBAR', 'API',     'import',                 false,90,v_su),
    (NULL,'product','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',            false,100,v_su),

    (NULL,'item','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/item/new',       false,10,v_su),
    (NULL,'item','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/item/{id}/edit', true, 20,v_su),
    (NULL,'item','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',          true, 30,v_su),
    (NULL,'item','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',          true, 40,v_su),
    (NULL,'item','close',      'DETAIL','OVERFLOW','MODAL',   'archive',             true, 50,v_su),
    (NULL,'item','copy',       'DETAIL','OVERFLOW','API',     'copy',                true, 60,v_su),
    (NULL,'item','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',              true, 70,v_su),
    (NULL,'item','export',     'LIST',  'TOOLBAR', 'API',     'export',              false,80,v_su),
    (NULL,'item','import',     'LIST',  'TOOLBAR', 'API',     'import',              false,90,v_su),
    (NULL,'item','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',         false,100,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- item_category / spend_category  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'item_category','create','LIST',  'PRIMARY', 'NAVIGATE','/app/item_category/new',       false,10,v_su),
    (NULL,'item_category','update','DETAIL','PRIMARY', 'NAVIGATE','/app/item_category/{id}/edit', true, 20,v_su),
    (NULL,'item_category','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'item_category','delete','DETAIL','OVERFLOW','MODAL',   'delete',                       true, 40,v_su),
    (NULL,'item_category','export','LIST',  'TOOLBAR', 'API',     'export',                       false,50,v_su),

    (NULL,'spend_category','create','LIST',  'PRIMARY', 'NAVIGATE','/app/spend_category/new',       false,10,v_su),
    (NULL,'spend_category','update','DETAIL','PRIMARY', 'NAVIGATE','/app/spend_category/{id}/edit', true, 20,v_su),
    (NULL,'spend_category','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                    true, 30,v_su),
    (NULL,'spend_category','delete','DETAIL','OVERFLOW','MODAL',   'delete',                        true, 40,v_su),
    (NULL,'spend_category','export','LIST',  'TOOLBAR', 'API',     'export',                        false,50,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL / RELATION: bank_account_mandate, payment_term_clause,
--                     payment_term_discount_tier, commodity_classification,
--                     company_code_spend_policy, holiday_calendar_day
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'bank_account_mandate',       'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'bank_account_mandate',       'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'payment_term_clause',        'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'payment_term_clause',        'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'payment_term_clause',        'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'payment_term_discount_tier', 'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'payment_term_discount_tier', 'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'payment_term_discount_tier', 'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'holiday_calendar_day',       'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'holiday_calendar_day',       'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'holiday_calendar_day',       'import','LIST',  'TOOLBAR', 'API',  'import',false,30,v_su),
    (NULL,'commodity_classification',   'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'commodity_classification',   'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'company_code_spend_policy',  'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 10,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

RAISE NOTICE 'entity_operation: Budget/Banking/Products seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;
