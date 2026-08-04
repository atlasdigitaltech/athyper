CREATE INDEX warehouse_site_idx ON master.warehouse (tenant_id, site_id);
CREATE INDEX warehouse_active_site_idx ON master.warehouse (tenant_id, site_id, code) WHERE status = 'active';
CREATE INDEX warehouse_type_idx ON master.warehouse (tenant_id, warehouse_type);
CREATE INDEX warehouse_manager_idx ON master.warehouse (tenant_id, manager_id) WHERE manager_id IS NOT NULL;
CREATE INDEX warehouse_status_by_idx ON master.warehouse (tenant_id, status_changed_by) WHERE status_changed_by IS NOT NULL;
CREATE INDEX warehouse_created_by_idx ON master.warehouse (tenant_id, created_by);
CREATE INDEX warehouse_updated_by_idx ON master.warehouse (tenant_id, updated_by) WHERE updated_by IS NOT NULL;
