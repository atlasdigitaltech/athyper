-- 060_entity_operations/006_ops_master_data.sql
-- Entity operation registrations for Dimensions, Tax/FX, NTF, CMS/ACT (75–86 + 27–40)
-- Covers: dimension_type, dimension_value, cost_center_dimension_map,
--         profit_center_dimension_map, project_dimension_map,
--         company_code_dimension_default, tax_jurisdiction, tax_type, fx_rate,
--         notification, notification_default, attachment, comment, conversation,
--         reaction, draft, flag_submission, activity_event, comment_flag,
--         comment_draft, comment_feed_cursor
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- dimension_type / dimension_value  (Set B + import)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'dimension_type','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/dimension_type/new',       false,10,v_su),
    (NULL,'dimension_type','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/dimension_type/{id}/edit', true, 20,v_su),
    (NULL,'dimension_type','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                    true, 30,v_su),
    (NULL,'dimension_type','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                    true, 40,v_su),
    (NULL,'dimension_type','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                        true, 50,v_su),
    (NULL,'dimension_type','export', 'LIST',  'TOOLBAR', 'API',     'export',                        false,60,v_su),

    (NULL,'dimension_value','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/dimension_value/new',       false,10,v_su),
    (NULL,'dimension_value','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/dimension_value/{id}/edit', true, 20,v_su),
    (NULL,'dimension_value','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',                     true, 30,v_su),
    (NULL,'dimension_value','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',                     true, 40,v_su),
    (NULL,'dimension_value','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                         true, 50,v_su),
    (NULL,'dimension_value','export',     'LIST',  'TOOLBAR', 'API',     'export',                         false,60,v_su),
    (NULL,'dimension_value','import',     'LIST',  'TOOLBAR', 'API',     'import',                         false,70,v_su),
    (NULL,'dimension_value','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',                    false,80,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- tax_jurisdiction / tax_type  (Set B + import)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'tax_jurisdiction','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/tax_jurisdiction/new',       false,10,v_su),
    (NULL,'tax_jurisdiction','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/tax_jurisdiction/{id}/edit', true, 20,v_su),
    (NULL,'tax_jurisdiction','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                      true, 30,v_su),
    (NULL,'tax_jurisdiction','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                      true, 40,v_su),
    (NULL,'tax_jurisdiction','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                          true, 50,v_su),
    (NULL,'tax_jurisdiction','export', 'LIST',  'TOOLBAR', 'API',     'export',                          false,60,v_su),
    (NULL,'tax_jurisdiction','import', 'LIST',  'TOOLBAR', 'API',     'import',                          false,70,v_su),

    (NULL,'tax_type','create','LIST',  'PRIMARY', 'NAVIGATE','/app/tax_type/new',       false,10,v_su),
    (NULL,'tax_type','update','DETAIL','PRIMARY', 'NAVIGATE','/app/tax_type/{id}/edit', true, 20,v_su),
    (NULL,'tax_type','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',              true, 30,v_su),
    (NULL,'tax_type','reopen','DETAIL','OVERFLOW','MODAL',   'reactivate',              true, 40,v_su),
    (NULL,'tax_type','delete','DETAIL','OVERFLOW','MODAL',   'delete',                  true, 50,v_su),
    (NULL,'tax_type','export','LIST',  'TOOLBAR', 'API',     'export',                  false,60,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- fx_rate  (Set A + import + bulk_update)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'fx_rate','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/fx_rate/new',       false,10,v_su),
    (NULL,'fx_rate','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/fx_rate/{id}/edit', true, 20,v_su),
    (NULL,'fx_rate','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                 true, 30,v_su),
    (NULL,'fx_rate','export',     'LIST',  'TOOLBAR', 'API',     'export',                 false,40,v_su),
    (NULL,'fx_rate','import',     'LIST',  'TOOLBAR', 'API',     'import',                 false,50,v_su),
    (NULL,'fx_rate','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',            false,60,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- notification  (Set H: read + export)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'notification','read',   'LIST',  'TOOLBAR','NAVIGATE','/app/notification/{id}',false,10,v_su),
    (NULL,'notification','delete', 'DETAIL','OVERFLOW','MODAL',  'delete',                 true, 20,v_su),
    (NULL,'notification','export', 'LIST',  'TOOLBAR', 'API',    'export',                 false,30,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- attachment  (Set A + add_attachment)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'attachment','create',          'LIST',  'PRIMARY', 'MODAL','upload',              false,10,v_su),
    (NULL,'attachment','add_attachment',  'LIST',  'PRIMARY', 'MODAL','upload',              false,15,v_su),
    (NULL,'attachment','update',          'DETAIL','PRIMARY', 'MODAL','edit',                true, 20,v_su),
    (NULL,'attachment','delete',          'DETAIL','OVERFLOW','MODAL','delete',              true, 30,v_su),
    (NULL,'attachment','export',          'LIST',  'TOOLBAR', 'API',  'export',              false,40,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- comment  (add_comment, flag, delete own)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'comment','create',              'LIST',  'PRIMARY', 'MODAL','add_comment',         false,10,v_su),
    (NULL,'comment','add_comment',         'LIST',  'PRIMARY', 'MODAL','add_comment',         false,15,v_su),
    (NULL,'comment','update',              'DETAIL','PRIMARY', 'MODAL','edit_comment',        true, 20,v_su),
    (NULL,'comment','delete',              'DETAIL','OVERFLOW','MODAL','delete_comment',      true, 30,v_su),
    (NULL,'comment','del_others_comment',  'DETAIL','OVERFLOW','MODAL','delete_comment',      true, 35,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- conversation  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'conversation','create','LIST',  'PRIMARY', 'MODAL','create',  false,10,v_su),
    (NULL,'conversation','update','DETAIL','PRIMARY', 'MODAL','edit',    true, 20,v_su),
    (NULL,'conversation','close', 'DETAIL','OVERFLOW','MODAL','close',   true, 30,v_su),
    (NULL,'conversation','delete','DETAIL','OVERFLOW','MODAL','delete',  true, 40,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL / RELATION dimension maps  (Set G)
-- cost_center_dimension_map, profit_center_dimension_map,
-- project_dimension_map, company_code_dimension_default
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'cost_center_dimension_map',    'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'cost_center_dimension_map',    'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'profit_center_dimension_map',  'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'profit_center_dimension_map',  'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'project_dimension_map',        'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'project_dimension_map',        'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'company_code_dimension_default','update','DETAIL','PRIMARY','MODAL','edit',  true, 10,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

RAISE NOTICE 'entity_operation: Dimensions/Tax/NTF/CMS/ACT seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;
