CREATE INDEX IF NOT EXISTS ix_otr_company_effective ON master.organization_tax_registration(tenant_id,company_code_id,effective_from DESC) WHERE status='active';
CREATE INDEX IF NOT EXISTS ix_otr_legal_entity_effective ON master.organization_tax_registration(tenant_id,legal_entity_id,effective_from DESC) WHERE status='active';

