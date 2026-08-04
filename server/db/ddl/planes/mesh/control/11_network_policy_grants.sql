REVOKE ALL ON control.routing_rule, control.retention_policy, control.quota_policy FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON control.routing_rule, control.retention_policy, control.quota_policy TO athyperapp;
GRANT ALL PRIVILEGES
    ON control.routing_rule, control.retention_policy, control.quota_policy TO athyperadmin;
