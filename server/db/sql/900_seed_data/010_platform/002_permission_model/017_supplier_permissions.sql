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
