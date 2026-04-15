-- 060_entity_operations/001_ops_iam.sql
-- Entity operation registrations for IAM entities (1–26)
-- Covers: tenant, principal, auth_group, team, label, owner_type, address,
--         access_grant, delegation_grant, principal_persona
-- Idempotent: ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING
-- Run AFTER: 010_system/entity_engine/020_entities/001_master_identity.sql

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- tenant  (Set C: create/update/delete/export/import/activate/deactivate/copy)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'tenant','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/tenant/new',       false,10,v_su),
    (NULL,'tenant','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/tenant/{id}/edit', true, 20,v_su),
    (NULL,'tenant','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',             true, 30,v_su),
    (NULL,'tenant','close',   'DETAIL','OVERFLOW','MODAL',   'close',                  true, 40,v_su),
    (NULL,'tenant','export',  'LIST',  'TOOLBAR', 'API',     'export',                 false,50,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- principal  (Set D: + import, bulk ops, share)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'principal','create',      'LIST',  'PRIMARY', 'NAVIGATE','/app/principal/new',       false,10,v_su),
    (NULL,'principal','update',      'DETAIL','PRIMARY', 'NAVIGATE','/app/principal/{id}/edit', true, 20,v_su),
    (NULL,'principal','cancel',      'DETAIL','OVERFLOW','MODAL',   'deactivate',               true, 30,v_su),
    (NULL,'principal','reopen',      'DETAIL','OVERFLOW','MODAL',   'reactivate',               true, 40,v_su),
    (NULL,'principal','close',       'DETAIL','OVERFLOW','MODAL',   'close',                    true, 50,v_su),
    (NULL,'principal','delete',      'DETAIL','OVERFLOW','MODAL',   'delete',                   true, 60,v_su),
    (NULL,'principal','export',      'LIST',  'TOOLBAR', 'API',     'export',                   false,70,v_su),
    (NULL,'principal','import',      'LIST',  'TOOLBAR', 'API',     'import',                   false,80,v_su),
    (NULL,'principal','bulk_update', 'LIST',  'TOOLBAR', 'API',     'bulk_update',              false,90,v_su),
    (NULL,'principal','delegate',    'DETAIL','OVERFLOW','MODAL',   'delegate',                 true,100,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- auth_group  (Set C: create/update/delete/export/import/activate/deactivate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'auth_group','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/auth_group/new',       false,10,v_su),
    (NULL,'auth_group','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/auth_group/{id}/edit', true, 20,v_su),
    (NULL,'auth_group','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                true, 30,v_su),
    (NULL,'auth_group','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                true, 40,v_su),
    (NULL,'auth_group','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                    true, 50,v_su),
    (NULL,'auth_group','export',  'LIST',  'TOOLBAR', 'API',     'export',                    false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- team  (Set C)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'team','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/team/new',       false,10,v_su),
    (NULL,'team','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/team/{id}/edit', true, 20,v_su),
    (NULL,'team','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',          true, 30,v_su),
    (NULL,'team','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',              true, 40,v_su),
    (NULL,'team','export',  'LIST',  'TOOLBAR', 'API',     'export',              false,50,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- principal_persona  (Set A: create/update/delete/export)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'principal_persona','create','LIST',  'PRIMARY', 'NAVIGATE','/app/principal_persona/new',       false,10,v_su),
    (NULL,'principal_persona','update','DETAIL','PRIMARY', 'NAVIGATE','/app/principal_persona/{id}/edit', true, 20,v_su),
    (NULL,'principal_persona','delete','DETAIL','OVERFLOW','MODAL',   'delete',                           true, 30,v_su),
    (NULL,'principal_persona','export','LIST',  'TOOLBAR', 'API',     'export',                           false,40,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- access_grant  (Set A + delegate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'access_grant','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/access_grant/new',       false,10,v_su),
    (NULL,'access_grant','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/access_grant/{id}/edit', true, 20,v_su),
    (NULL,'access_grant','cancel',  'DETAIL','OVERFLOW','MODAL',   'revoke',                      true, 30,v_su),
    (NULL,'access_grant','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 40,v_su),
    (NULL,'access_grant','export',  'LIST',  'TOOLBAR', 'API',     'export',                      false,50,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- delegation_grant  (Set A + revoke)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'delegation_grant','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/delegation_grant/new',       false,10,v_su),
    (NULL,'delegation_grant','cancel',  'DETAIL','PRIMARY', 'MODAL',   'revoke',                          true, 20,v_su),
    (NULL,'delegation_grant','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                          true, 30,v_su),
    (NULL,'delegation_grant','export',  'LIST',  'TOOLBAR', 'API',     'export',                          false,40,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- label  (Set B: create/update/delete/export/activate/deactivate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'label','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/label/new',       false,10,v_su),
    (NULL,'label','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/label/{id}/edit', true, 20,v_su),
    (NULL,'label','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',           true, 30,v_su),
    (NULL,'label','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',           true, 40,v_su),
    (NULL,'label','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',               true, 50,v_su),
    (NULL,'label','export', 'LIST',  'TOOLBAR', 'API',     'export',               false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- owner_type  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'owner_type','create','LIST',  'PRIMARY', 'NAVIGATE','/app/owner_type/new',       false,10,v_su),
    (NULL,'owner_type','update','DETAIL','PRIMARY', 'NAVIGATE','/app/owner_type/{id}/edit', true, 20,v_su),
    (NULL,'owner_type','delete','DETAIL','OVERFLOW','MODAL',   'delete',                    true, 30,v_su),
    (NULL,'owner_type','export','LIST',  'TOOLBAR', 'API',     'export',                    false,40,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- address  (Set A + import)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'address','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/address/new',       false,10,v_su),
    (NULL,'address','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/address/{id}/edit', true, 20,v_su),
    (NULL,'address','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',             true, 30,v_su),
    (NULL,'address','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                 true, 40,v_su),
    (NULL,'address','export', 'LIST',  'TOOLBAR', 'API',     'export',                 false,50,v_su),
    (NULL,'address','import', 'LIST',  'TOOLBAR', 'API',     'import',                 false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL entities (Set G: update only — managed via parent entity UI)
-- principal_profile, principal_identity_binding, contact_link, contact_email,
-- contact_phone, address_link, tenant_module_subscription,
-- tenant_feature_entitlement, tenant_permission_override, company_code_access,
-- auth_group_role, auth_group_member, team_member,
-- group_feature_grant, principal_feature_grant
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'principal_profile',          'update','DETAIL','PRIMARY','MODAL','edit',false,10,v_su),
    (NULL,'principal_profile',          'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su),
    (NULL,'principal_identity_binding', 'update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su),
    (NULL,'principal_identity_binding', 'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su),
    (NULL,'contact_email',              'create','LIST',  'PRIMARY','MODAL','create',false,10,v_su),
    (NULL,'contact_email',              'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su),
    (NULL,'contact_phone',              'create','LIST',  'PRIMARY','MODAL','create',false,10,v_su),
    (NULL,'contact_phone',              'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su),
    (NULL,'auth_group_member',          'create','LIST',  'PRIMARY','MODAL','add_member',false,10,v_su),
    (NULL,'auth_group_member',          'delete','DETAIL','OVERFLOW','MODAL','remove_member',true,20,v_su),
    (NULL,'team_member',                'create','LIST',  'PRIMARY','MODAL','add_member',false,10,v_su),
    (NULL,'team_member',                'delete','DETAIL','OVERFLOW','MODAL','remove_member',true,20,v_su),
    (NULL,'tenant_module_subscription', 'update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su),
    (NULL,'tenant_feature_entitlement', 'update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su),
    (NULL,'tenant_feature_entitlement', 'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

RAISE NOTICE 'entity_operation: IAM entities seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;
