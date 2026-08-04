ALTER TABLE control.numbering_policy
    ADD CONSTRAINT numbering_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT numbering_policy_timezone_fk
        FOREIGN KEY (timezone_code) REFERENCES shared.timezone (code) ON DELETE RESTRICT,
    ADD CONSTRAINT numbering_policy_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT numbering_policy_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT numbering_policy_activated_by_fk
        FOREIGN KEY (activated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
