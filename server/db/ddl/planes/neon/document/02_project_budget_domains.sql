CREATE DOMAIN document.project_task_type_d AS text
    CHECK (VALUE IN ('task', 'milestone', 'review', 'approval', 'handoff'));

CREATE DOMAIN document.project_task_status_d AS text
    CHECK (VALUE IN ('draft', 'ready', 'in_progress', 'blocked', 'completed', 'cancelled'));

CREATE DOMAIN document.project_requirement_status_d AS text
    CHECK (VALUE IN ('planned', 'reserved', 'issued', 'partially_consumed', 'consumed', 'cancelled'));

CREATE DOMAIN document.budget_type_d AS text
    CHECK (VALUE IN ('baseline', 'forecast', 'supplemental'));

CREATE DOMAIN document.budget_profile_status_d AS text
    CHECK (VALUE IN ('draft', 'submitted', 'approved', 'active', 'closed', 'cancelled'));

CREATE DOMAIN document.budget_allocation_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'frozen', 'closed', 'cancelled'));

CREATE DOMAIN document.overspend_policy_d AS text
    CHECK (VALUE IN ('block', 'warn', 'allow'));
