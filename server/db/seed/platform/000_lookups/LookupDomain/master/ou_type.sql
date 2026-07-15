-- Tombstone: ou_type retired with master.operating_unit (company_code migration).
-- This file only cleans up residual values from earlier seeds.

DELETE FROM control.lookup_value
WHERE domain_code = 'ou_type'
  AND tenant_id   IS NULL;

DELETE FROM control.lookup_domain
WHERE code = 'ou_type';
