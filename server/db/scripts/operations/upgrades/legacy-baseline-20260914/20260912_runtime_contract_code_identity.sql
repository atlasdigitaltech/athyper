-- Record descriptors and governed case contracts may share the source entity
-- while using distinct entity codes. Keep each code's versions and active head unique.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE runtime_meta.entity_contract DROP CONSTRAINT runtime_entity_contract_release_no_uq;
ALTER TABLE runtime_meta.entity_contract ADD CONSTRAINT runtime_entity_contract_release_no_uq
 UNIQUE NULLS NOT DISTINCT (tenant_id,entity_id,entity_code,release_no);
DROP INDEX runtime_meta.runtime_entity_contract_published_uq;
CREATE UNIQUE INDEX runtime_entity_contract_published_uq ON runtime_meta.entity_contract(tenant_id,entity_id,entity_code)
 NULLS NOT DISTINCT WHERE status='published';
COMMIT;
