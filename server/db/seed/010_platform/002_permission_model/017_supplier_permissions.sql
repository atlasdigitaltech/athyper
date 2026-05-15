-- 900_seed_data/010_platform/002_permission_model/017_supplier_permissions.sql
-- Seed: Supplier-specific permission codes for intake section-level guards
-- Schema: shared | Table: permission
-- Depends on: 015_permission_category.sql (entity + special categories)
-- Idempotent: ON CONFLICT (code) DO NOTHING

-- Supplier Tax section permissions (split: requester can submit; finance verifies)
INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('supplier.tax.submit',     'Submit Tax Profile',     'finance', 'record', 'low',    false, 10),
    ('supplier.tax.verify',     'Verify Tax Profile',     'finance', 'record', 'medium', false, 20),
    ('supplier.tax.restricted', 'Restricted Tax Access',  'finance', 'record', 'high',   false, 30)
) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;

-- Supplier Banking section permissions
INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('supplier.banking.submit', 'Submit Bank Details',   'finance', 'record', 'medium', false, 10),
    ('supplier.banking.verify', 'Verify Bank Account',   'finance', 'record', 'high',   false, 20),
    ('supplier.banking.admin',  'Administer Banking',    'finance', 'record', 'high',   false, 30)
) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;

-- Supplier Governance section permissions
INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('supplier.governance.write', 'Write Governance Record', 'special', 'record', 'high', false, 10)
) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;

-- Supplier Qualification admin (compliance / data steward only)
INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('supplier.qualification.admin', 'Administer Qualification', 'special', 'record', 'critical', false, 10)
) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;

-- Supplier intake submit/write grants.
-- These permissions only unlock create-time intake sections; verify/admin/restricted
-- supplier permissions remain separate and are intentionally not granted here.
WITH grants AS (
    SELECT p.id AS pid, pm.id AS permid
    FROM   shared.persona p
    CROSS JOIN shared.permission pm
    WHERE  p.code IN ('requester', 'agent', 'manager', 'owner', 'admin')
    AND    pm.code IN (
        'supplier.tax.submit',
        'supplier.banking.submit',
        'supplier.governance.write'
    )
)
INSERT INTO shared.persona_permission (persona_id, permission_id, is_granted, created_by)
SELECT pid, permid, true, '00000000-0000-0000-0000-000000000000'::uuid
FROM   grants
ON CONFLICT (persona_id, permission_id) DO UPDATE SET is_granted = true;
