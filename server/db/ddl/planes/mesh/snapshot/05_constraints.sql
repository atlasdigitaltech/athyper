ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_template_fk
    FOREIGN KEY (tenant_id, template_id)
    REFERENCES master.template (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_locale_fk
    FOREIGN KEY (locale_code)
    REFERENCES shared.locale (code)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
