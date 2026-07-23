CREATE INDEX IF NOT EXISTS ix_tgv_effective ON control.tax_group_version(tenant_id,tax_group_id,effective_from DESC) WHERE status='active';
CREATE INDEX IF NOT EXISTS ix_tgc_version_order ON control.tax_group_component(tenant_id,tax_group_version_id,calculation_seq) WHERE status='active';
CREATE UNIQUE INDEX IF NOT EXISTS ux_tgc_active_version_seq ON control.tax_group_component
    (tenant_id,tax_group_id,COALESCE(tax_group_version_id,'00000000-0000-0000-0000-000000000000'::uuid),calculation_seq) WHERE status='active';
CREATE UNIQUE INDEX IF NOT EXISTS ux_tgc_active_version_rate ON control.tax_group_component
    (tenant_id,tax_group_id,COALESCE(tax_group_version_id,'00000000-0000-0000-0000-000000000000'::uuid),tax_rate_schedule_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS ix_wtc_resolution ON control.wht_threshold_config(tenant_id,jurisdiction_id,tax_type_id,effective_from DESC) WHERE is_active=true;
