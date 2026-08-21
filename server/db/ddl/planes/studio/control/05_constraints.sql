ALTER TABLE control.owner_type
    ADD CONSTRAINT owner_type_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE control.owner_type_purpose
    ADD CONSTRAINT owner_type_purpose_owner_type_fk
    FOREIGN KEY (owner_type_id)
    REFERENCES control.owner_type (id)
    ON DELETE RESTRICT;

ALTER TABLE control.workflow_sla_policy
    ADD CONSTRAINT workflow_sla_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT workflow_sla_policy_supersedes_fk
        FOREIGN KEY (supersedes_policy_id) REFERENCES control.workflow_sla_policy(id) ON DELETE RESTRICT,
    ADD CONSTRAINT workflow_sla_policy_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT workflow_sla_policy_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT workflow_sla_policy_status_changed_by_fk
        FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE control.bank_format_rule
    ADD CONSTRAINT bank_format_rule_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT bank_format_rule_country_fk
        FOREIGN KEY (country_code) REFERENCES shared.country(code) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_format_rule_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_format_rule_supersedes_fk
        FOREIGN KEY (supersedes_rule_id) REFERENCES control.bank_format_rule(id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_format_rule_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_format_rule_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_format_rule_status_changed_by_fk
        FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
