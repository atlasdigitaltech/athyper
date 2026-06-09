-- LookupDomain/master/ou_type.sql
-- REMOVED — ou_type lookup domain retired with master.operating_unit (company_code migration).
-- This file now cleans up any residual values from earlier seeds.
-- See 13_patches/002_drop_operating_unit.sql for the authoritative DROP.

DELETE FROM control.lookup_value
WHERE domain_code = 'ou_type'
  AND tenant_id   IS NULL;

DELETE FROM control.lookup_domain
WHERE code = 'ou_type';
