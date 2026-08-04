ALTER TABLE control.policy_rule
    ADD CONSTRAINT policy_rule_definition_fk
        FOREIGN KEY (policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE CASCADE,
    ADD CONSTRAINT policy_rule_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_rule_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE control.policy_test_case
    ADD CONSTRAINT policy_test_case_definition_fk
        FOREIGN KEY (policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE CASCADE,
    ADD CONSTRAINT policy_test_case_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_test_case_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_test_case_status_changed_by_fk
        FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
