CREATE INDEX lookup_domain_active_idx
  ON control.lookup_domain(code) WHERE status = 'active';
CREATE UNIQUE INDEX lookup_value_global_uq
  ON control.lookup_value(domain_code, code) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX lookup_value_tenant_uq
  ON control.lookup_value(tenant_id, domain_code, code) WHERE tenant_id IS NOT NULL;
CREATE INDEX lookup_value_tenant_domain_idx
  ON control.lookup_value(tenant_id, domain_code) WHERE tenant_id IS NOT NULL;
CREATE INDEX lookup_value_validation_idx
  ON control.lookup_value(domain_code, code) WHERE status = 'active';
