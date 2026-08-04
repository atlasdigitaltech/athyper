CREATE INDEX pricing_component_source_current_idx
    ON document.pricing_component
       (tenant_id, source_doc_type, source_doc_id, source_line_id, term_type, sequence)
    WHERE superseded_by_id IS NULL;
CREATE INDEX pricing_component_condition_idx
    ON document.pricing_component (tenant_id, condition_type_id)
    WHERE superseded_by_id IS NULL;
CREATE INDEX pricing_component_tax_group_idx
    ON document.pricing_component (tenant_id, tax_group_id)
    WHERE superseded_by_id IS NULL AND tax_group_id IS NOT NULL;
CREATE INDEX pricing_component_apportion_parent_idx
    ON document.pricing_component (tenant_id, is_apportioned_from_id)
    WHERE is_apportioned_from_id IS NOT NULL;
CREATE INDEX pricing_component_superseded_by_idx
    ON document.pricing_component (tenant_id, superseded_by_id)
    WHERE superseded_by_id IS NOT NULL;
CREATE INDEX pricing_component_superseded_actor_idx
    ON document.pricing_component (tenant_id, superseded_by_user)
    WHERE superseded_by_user IS NOT NULL;

CREATE UNIQUE INDEX schedule_line_current_number_uq
    ON document.schedule_line
       (tenant_id, source_doc_type, source_doc_id, source_line_id, schedule_no)
    WHERE is_current_version AND terminal_status IS NULL;
CREATE INDEX schedule_line_source_current_idx
    ON document.schedule_line (tenant_id, source_doc_type, source_line_id)
    WHERE is_current_version AND terminal_status IS NULL;
CREATE INDEX schedule_line_source_doc_idx
    ON document.schedule_line (tenant_id, source_doc_type, source_doc_id);
CREATE INDEX schedule_line_due_idx
    ON document.schedule_line (tenant_id, scheduled_date)
    WHERE is_current_version AND terminal_status IS NULL
      AND fulfillment_status IN ('open','partial');
CREATE INDEX schedule_line_previous_idx
    ON document.schedule_line (tenant_id, previous_version_id)
    WHERE previous_version_id IS NOT NULL;
