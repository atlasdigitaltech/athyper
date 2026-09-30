CREATE INDEX work_item_assignee_queue_idx
    ON document.work_item (tenant_id, assignee_principal_id, status, priority, due_at)
    WHERE assignee_principal_id IS NOT NULL
      AND status IN ('open','claimed','in_progress','blocked');
CREATE INDEX work_item_team_queue_idx
    ON document.work_item (tenant_id, assignee_team_id, status, due_at)
    WHERE assignee_team_id IS NOT NULL
      AND status IN ('open','claimed','in_progress','blocked');
CREATE INDEX work_item_source_idx
    ON document.work_item (tenant_id, source_entity_code, source_entity_id);
CREATE INDEX work_item_cycle_task_idx
    ON document.work_item (tenant_id, cycle_task_id) WHERE cycle_task_id IS NOT NULL;
CREATE INDEX entity_case_queue_idx ON document.entity_case(tenant_id,status,updated_at,created_at);
CREATE INDEX entity_case_target_idx ON document.entity_case(tenant_id,entity_code,target_entity_id) WHERE target_entity_id IS NOT NULL;
CREATE INDEX entity_case_validation_lookup_idx ON document.entity_case_validation(tenant_id,entity_case_id,evaluated_at DESC);
CREATE INDEX entity_case_materialization_queue_idx ON document.entity_case_materialization(tenant_id,status,requested_at) WHERE status IN('requested','running');
