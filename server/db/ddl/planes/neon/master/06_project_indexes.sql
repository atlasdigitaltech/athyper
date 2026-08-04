CREATE INDEX project_customer_idx
    ON master.project (tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX project_responsible_idx
    ON master.project (tenant_id, responsible_principal_id)
    WHERE responsible_principal_id IS NOT NULL;
CREATE INDEX project_cost_center_idx
    ON master.project (tenant_id, default_cost_center_id)
    WHERE default_cost_center_id IS NOT NULL;
CREATE INDEX project_status_idx
    ON master.project (tenant_id, company_code_id, status);
CREATE INDEX project_created_by_idx
    ON master.project (tenant_id, created_by);

CREATE INDEX project_wbs_parent_idx
    ON master.project_wbs (tenant_id, project_id, parent_wbs_id)
    WHERE parent_wbs_id IS NOT NULL;
CREATE INDEX project_wbs_responsible_idx
    ON master.project_wbs (tenant_id, responsible_principal_id)
    WHERE responsible_principal_id IS NOT NULL;
CREATE INDEX project_wbs_cost_center_idx
    ON master.project_wbs (tenant_id, default_cost_center_id)
    WHERE default_cost_center_id IS NOT NULL;
CREATE INDEX project_wbs_status_idx
    ON master.project_wbs (tenant_id, project_id, status, is_postable);
CREATE INDEX project_wbs_created_by_idx
    ON master.project_wbs (tenant_id, created_by);

CREATE INDEX project_item_wbs_idx
    ON master.project_item (tenant_id, project_id, project_wbs_id)
    WHERE project_wbs_id IS NOT NULL;
CREATE INDEX project_item_item_idx
    ON master.project_item (tenant_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX project_item_status_idx
    ON master.project_item (tenant_id, project_id, status);
CREATE INDEX project_item_created_by_idx
    ON master.project_item (tenant_id, created_by);
