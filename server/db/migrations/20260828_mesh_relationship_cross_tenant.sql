BEGIN;

ALTER TABLE mesh.network_relationship
  ADD CONSTRAINT network_relationship_tenants_chk
  CHECK (buyer_tenant_id <> supplier_tenant_id);

COMMIT;
