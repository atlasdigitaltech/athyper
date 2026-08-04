CREATE INDEX project_task_wbs_idx
    ON document.project_task (tenant_id, project_id, project_wbs_id);
CREATE INDEX project_task_assignee_principal_idx
    ON document.project_task (tenant_id, assignee_principal_id)
    WHERE assignee_principal_id IS NOT NULL;
CREATE INDEX project_task_assignee_team_idx
    ON document.project_task (tenant_id, assignee_team_id)
    WHERE assignee_team_id IS NOT NULL;
CREATE INDEX project_task_status_idx
    ON document.project_task (tenant_id, project_id, status);
CREATE INDEX project_task_created_by_idx
    ON document.project_task (tenant_id, created_by);

CREATE INDEX project_task_requirement_task_idx
    ON document.project_task_requirement (tenant_id, project_id, project_task_id);
CREATE INDEX project_task_requirement_item_idx
    ON document.project_task_requirement (tenant_id, project_id, project_item_id);
CREATE INDEX project_task_requirement_status_idx
    ON document.project_task_requirement (tenant_id, project_task_id, status);
CREATE INDEX project_task_requirement_created_by_idx
    ON document.project_task_requirement (tenant_id, created_by);

CREATE INDEX budget_profile_project_idx
    ON document.budget_profile (tenant_id, company_code_id, project_id);
CREATE INDEX budget_profile_company_idx
    ON document.budget_profile (tenant_id, company_code_id);
CREATE INDEX budget_profile_book_idx
    ON document.budget_profile (tenant_id, ledger_book_id);
CREATE INDEX budget_profile_status_idx
    ON document.budget_profile (tenant_id, project_id, status);
CREATE INDEX budget_profile_supersedes_idx
    ON document.budget_profile (tenant_id, project_id, supersedes_profile_id)
    WHERE supersedes_profile_id IS NOT NULL;
CREATE INDEX budget_profile_approved_by_idx
    ON document.budget_profile (tenant_id, approved_by)
    WHERE approved_by IS NOT NULL;
CREATE INDEX budget_profile_created_by_idx
    ON document.budget_profile (tenant_id, created_by);

CREATE INDEX budget_allocation_profile_idx
    ON document.budget_allocation (tenant_id, project_id, budget_profile_id);
CREATE INDEX budget_allocation_wbs_idx
    ON document.budget_allocation (tenant_id, project_id, project_wbs_id);
CREATE INDEX budget_allocation_status_idx
    ON document.budget_allocation (tenant_id, budget_profile_id, status);
CREATE INDEX budget_allocation_created_by_idx
    ON document.budget_allocation (tenant_id, created_by);
