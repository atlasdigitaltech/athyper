CREATE INDEX template_version_template_recent_idx
    ON snapshot.template_version
       (tenant_id, template_id, locale_code, version DESC);

CREATE INDEX template_version_effective_idx
    ON snapshot.template_version
       (tenant_id, template_id, locale_code, effective_from, effective_to);

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

CREATE INDEX mesh_bp_profile_received_relationship_idx
    ON snapshot.mesh_business_partner_profile_received
    (tenant_id, network_relationship_id, publication_version DESC);
CREATE INDEX mesh_bank_disclosure_received_relationship_idx ON snapshot.mesh_bank_account_disclosure_received(tenant_id,network_relationship_id,received_at DESC);
