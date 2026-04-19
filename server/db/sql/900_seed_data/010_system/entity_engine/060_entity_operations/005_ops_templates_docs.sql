-- 060_entity_operations/005_ops_templates_docs.sql
-- Entity operation registrations for DOC/WFL entities (41–48)
-- Covers: document_template, document_template_clause, workflow_definition,
--         workflow_template, workflow_template_stage, workflow_template_rule,
--         trigger_rule, print_profile
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- document_template  (Set F: create/update/delete/export/submit/activate/copy)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'document_template','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/document_template/new',       false,10,v_su),
    (NULL,'document_template','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/document_template/{id}/edit', true, 20,v_su),
    (NULL,'document_template','submit',  'DETAIL','TOOLBAR', 'MODAL',   'submit',                           true, 30,v_su),
    (NULL,'document_template','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                          true, 40,v_su),
    (NULL,'document_template','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                       true, 50,v_su),
    (NULL,'document_template','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                       true, 60,v_su),
    (NULL,'document_template','copy',    'DETAIL','OVERFLOW','API',     'copy',                             true, 70,v_su),
    (NULL,'document_template','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                           true, 80,v_su),
    (NULL,'document_template','export',  'LIST',  'TOOLBAR', 'API',     'export',                           false,90,v_su),
    (NULL,'document_template','import',  'LIST',  'TOOLBAR', 'API',     'import',                           false,100,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- workflow_definition  (Set F: template-like workflow)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'workflow_definition','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/workflow_definition/new',       false,10,v_su),
    (NULL,'workflow_definition','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/workflow_definition/{id}/edit', true, 20,v_su),
    (NULL,'workflow_definition','submit',  'DETAIL','TOOLBAR', 'MODAL',   'submit',                             true, 30,v_su),
    (NULL,'workflow_definition','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                            true, 40,v_su),
    (NULL,'workflow_definition','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                         true, 50,v_su),
    (NULL,'workflow_definition','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                         true, 60,v_su),
    (NULL,'workflow_definition','copy',    'DETAIL','OVERFLOW','API',     'copy',                               true, 70,v_su),
    (NULL,'workflow_definition','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                             true, 80,v_su),
    (NULL,'workflow_definition','export',  'LIST',  'TOOLBAR', 'API',     'export',                             false,90,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- workflow_template  (Set F)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'workflow_template','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/workflow_template/new',       false,10,v_su),
    (NULL,'workflow_template','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/workflow_template/{id}/edit', true, 20,v_su),
    (NULL,'workflow_template','submit',  'DETAIL','TOOLBAR', 'MODAL',   'submit',                           true, 30,v_su),
    (NULL,'workflow_template','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                          true, 40,v_su),
    (NULL,'workflow_template','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                       true, 50,v_su),
    (NULL,'workflow_template','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                       true, 60,v_su),
    (NULL,'workflow_template','copy',    'DETAIL','OVERFLOW','API',     'copy',                             true, 70,v_su),
    (NULL,'workflow_template','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                           true, 80,v_su),
    (NULL,'workflow_template','export',  'LIST',  'TOOLBAR', 'API',     'export',                           false,90,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- trigger_rule  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'trigger_rule','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/trigger_rule/new',       false,10,v_su),
    (NULL,'trigger_rule','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/trigger_rule/{id}/edit', true, 20,v_su),
    (NULL,'trigger_rule','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'trigger_rule','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'trigger_rule','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 50,v_su),
    (NULL,'trigger_rule','export', 'LIST',  'TOOLBAR', 'API',     'export',                      false,60,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- print_profile  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'print_profile','create','LIST',  'PRIMARY', 'NAVIGATE','/app/print_profile/new',       false,10,v_su),
    (NULL,'print_profile','update','DETAIL','PRIMARY', 'NAVIGATE','/app/print_profile/{id}/edit', true, 20,v_su),
    (NULL,'print_profile','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'print_profile','delete','DETAIL','OVERFLOW','MODAL',   'delete',                       true, 40,v_su),
    (NULL,'print_profile','export','LIST',  'TOOLBAR', 'API',     'export',                       false,50,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL / RELATION: document_template_clause, workflow_template_stage,
--                     workflow_template_rule  (Set G)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'document_template_clause','create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'document_template_clause','update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'document_template_clause','delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'workflow_template_stage', 'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'workflow_template_stage', 'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'workflow_template_stage', 'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'workflow_template_rule',  'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'workflow_template_rule',  'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'workflow_template_rule',  'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

RAISE NOTICE 'entity_operation: Templates/Docs/Workflow seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;
