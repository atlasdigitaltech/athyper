-- 060_entity_operations/007_ops_ui_cms.sql
-- Entity operation registrations for UI + CMS entities (103–111)
-- and remaining NTF / tenant_notification_profile CONTROL entities
-- Covers: principal_ui_profile, principal_ui_preference, saved_view, dashboard,
--         dashboard_widget, principal_notification_preference,
--         content_item, content_item_link, content_item_access_grant,
--         notification_default, tenant_notification_profile
-- Also seeds: dimension_set (75–80 group, missed in 006)
-- Idempotent: ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- saved_view  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'saved_view','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/saved_view/new',       false,10,v_su),
    (NULL,'saved_view','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/saved_view/{id}/edit', true, 20,v_su),
    (NULL,'saved_view','cancel',     'DETAIL','OVERFLOW','MODAL',   'archive',                   true, 30,v_su),
    (NULL,'saved_view','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                    true, 40,v_su),
    (NULL,'saved_view','share_read', 'DETAIL','OVERFLOW','MODAL',   'share',                     true, 50,v_su),
    (NULL,'saved_view','export',     'LIST',  'TOOLBAR', 'API',     'export',                    false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- dashboard  (Set B + share)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'dashboard','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/dashboard/new',       false,10,v_su),
    (NULL,'dashboard','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/dashboard/{id}/edit', true, 20,v_su),
    (NULL,'dashboard','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',               true, 30,v_su),
    (NULL,'dashboard','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                   true, 40,v_su),
    (NULL,'dashboard','share_read', 'DETAIL','OVERFLOW','MODAL',   'share',                    true, 50,v_su),
    (NULL,'dashboard','copy',       'DETAIL','OVERFLOW','API',     'copy',                     true, 60,v_su),
    (NULL,'dashboard','export',     'LIST',  'TOOLBAR', 'API',     'export',                   false,70,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- content_item  (Set F + share + add_attachment)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'content_item','create',         'LIST',  'PRIMARY', 'NAVIGATE','/app/content_item/new',       false,10,v_su),
    (NULL,'content_item','update',         'DETAIL','PRIMARY', 'NAVIGATE','/app/content_item/{id}/edit', true, 20,v_su),
    (NULL,'content_item','submit',         'DETAIL','TOOLBAR', 'MODAL',   'submit',                      true, 30,v_su),
    (NULL,'content_item','approve',        'DETAIL','TOOLBAR', 'MODAL',   'approve',                     true, 40,v_su),
    (NULL,'content_item','cancel',         'DETAIL','OVERFLOW','MODAL',   'unpublish',                   true, 50,v_su),
    (NULL,'content_item','reopen',         'DETAIL','OVERFLOW','MODAL',   'republish',                   true, 60,v_su),
    (NULL,'content_item','close',          'DETAIL','OVERFLOW','MODAL',   'archive',                     true, 70,v_su),
    (NULL,'content_item','copy',           'DETAIL','OVERFLOW','API',     'copy',                        true, 80,v_su),
    (NULL,'content_item','delete',         'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 90,v_su),
    (NULL,'content_item','share_read',     'DETAIL','OVERFLOW','MODAL',   'share',                       true,100,v_su),
    (NULL,'content_item','add_attachment', 'DETAIL','OVERFLOW','MODAL',   'attach',                      true,110,v_su),
    (NULL,'content_item','export',         'LIST',  'TOOLBAR', 'API',     'export',                      false,120,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL: principal_ui_profile, principal_ui_preference,
--          principal_notification_preference, notification_default,
--          content_item_link, content_item_access_grant, dashboard_widget
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'principal_ui_profile',           'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 10,v_su),
    (NULL,'principal_ui_preference',        'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 10,v_su),
    (NULL,'principal_ui_preference',        'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'principal_notification_preference','update','DETAIL','PRIMARY','MODAL','edit', true, 10,v_su),
    (NULL,'notification_default',           'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'notification_default',           'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'notification_default',           'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'content_item_access_grant',      'create','LIST',  'PRIMARY', 'MODAL','grant', false,10,v_su),
    (NULL,'content_item_access_grant',      'cancel','DETAIL','PRIMARY', 'MODAL','revoke',true, 20,v_su),
    (NULL,'content_item_access_grant',      'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'dashboard_widget',               'create','LIST',  'PRIMARY', 'MODAL','add_widget',false,10,v_su),
    (NULL,'dashboard_widget',               'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'dashboard_widget',               'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- dimension_set  (missed in 006 — Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'dimension_set','create','LIST',  'PRIMARY', 'NAVIGATE','/app/dimension_set/new',       false,10,v_su),
    (NULL,'dimension_set','update','DETAIL','PRIMARY', 'NAVIGATE','/app/dimension_set/{id}/edit', true, 20,v_su),
    (NULL,'dimension_set','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'dimension_set','delete','DETAIL','OVERFLOW','MODAL',   'delete',                       true, 40,v_su),
    (NULL,'dimension_set','export','LIST',  'TOOLBAR', 'API',     'export',                       false,50,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- gl_account_hierarchy  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'gl_account_hierarchy','create','LIST',  'PRIMARY', 'NAVIGATE','/app/gl_account_hierarchy/new',       false,10,v_su),
    (NULL,'gl_account_hierarchy','update','DETAIL','PRIMARY', 'NAVIGATE','/app/gl_account_hierarchy/{id}/edit', true, 20,v_su),
    (NULL,'gl_account_hierarchy','delete','DETAIL','OVERFLOW','MODAL',   'delete',                              true, 30,v_su),
    (NULL,'gl_account_hierarchy','export','LIST',  'TOOLBAR', 'API',     'export',                              false,40,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

RAISE NOTICE 'entity_operation: UI/CMS + remaining entities seeded';
RAISE NOTICE 'entity_operation: TOTAL system-global operations = %',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;
