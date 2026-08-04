CREATE INDEX bom_snapshot_source_recent_idx
    ON snapshot.bom (tenant_id, source_bom_id, revision_no DESC);
CREATE INDEX bom_snapshot_output_idx
    ON snapshot.bom (tenant_id, company_code_id, output_item_id, released_at DESC);
CREATE INDEX bom_component_snapshot_parent_idx
    ON snapshot.bom_component (tenant_id, bom_snapshot_id, line_no);
CREATE INDEX bom_component_snapshot_item_idx
    ON snapshot.bom_component (tenant_id, component_item_id);
CREATE INDEX bom_snapshot_released_by_idx
    ON snapshot.bom (tenant_id, released_by);
CREATE INDEX bom_snapshot_created_by_idx
    ON snapshot.bom (tenant_id, created_by);
CREATE INDEX bom_component_snapshot_source_idx
    ON snapshot.bom_component (tenant_id, source_bom_component_id);
CREATE INDEX bom_component_snapshot_created_by_idx
    ON snapshot.bom_component (tenant_id, created_by);
