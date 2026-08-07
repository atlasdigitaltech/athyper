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
