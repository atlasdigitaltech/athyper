-- LookupDomain/control/governance_level.sql
-- Lookup values for domain: entity.governance_level
-- Canonical values: full | standard | lite  (spec renamed light→standard, audit_only/none→lite)
-- Idempotent: WHERE NOT EXISTS guard + cleanup of stale codes.

-- Step 1: Insert canonical values
INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('full',     'Full',     'entity.governance_level', 10),
    ('standard', 'Standard', 'entity.governance_level', 20),
    ('lite',     'Lite',     'entity.governance_level', 30),
    ('none',     'None',     'entity.governance_level', 40)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- Step 2: Remove stale / renamed codes
DELETE FROM control.lookup_value
WHERE domain_code = 'entity.governance_level'
  AND code IN ('light', 'audit_only')
  AND tenant_id IS NULL;
