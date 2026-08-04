REVOKE ALL ON control.workflow_sla_policy, control.bank_format_rule FROM PUBLIC;
GRANT SELECT ON control.workflow_sla_policy, control.bank_format_rule TO athyperapp;
GRANT ALL PRIVILEGES ON control.workflow_sla_policy, control.bank_format_rule TO athyperadmin;
