-- 900_seed_data/002_control/007_upupr_entity_registration.sql
-- Purpose: control.entity + control.entity_version + control.entity_field (2 rows)
-- Depends on: 002_hook_actions.sql (control schema), shared.module rows (IAM)
-- Idempotent: yes — WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. control.entity ───────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'IAM'),
    'user_profile_update_request', 'UPUPR', 'user_profile_update_request',
    'DOCUMENT', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'user_profile_update_request',
    'Profile Update Request', 'Profile Update Requests', 'user-pen', 'blue',
    true,
    '{"prefix":"UPUPR","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":5}]}'::jsonb,
    '{"is_approvable":true,"document_category":"hr_request","allow_on_behalf_of":false,"requires_supervisor_approval":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'user_profile_update_request'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ───────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'user_profile_update_request'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field — request_scope ─────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
    'request_scope', 'request_scope', 'Change Categories', 'enum',
    'many', 'system', 'document.upupr_request_scope', true, true,
    '{"min_items":1,"trigger":"on_submit"}'::jsonb,
    9, '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE e.table_schema = 'document' AND e.table_name = 'user_profile_update_request'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. control.entity_field — change_reason ─────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, is_required,
    validation, sort_order, created_by)
SELECT ev.id,
    'change_reason', 'change_reason', 'Reason for Change', 'text',
    'zero_or_one', 'system', false,
    '{"required_when":{"field":"request_scope","operator":"contains_any","values":["iam_group","ou_assignment"]},"trigger":"on_submit"}'::jsonb,
    10, '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE e.table_schema = 'document' AND e.table_name = 'user_profile_update_request'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
ON CONFLICT DO NOTHING;
