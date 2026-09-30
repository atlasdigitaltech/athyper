ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.network_account_profile_publication
  ADD CONSTRAINT network_account_profile_publication_snapshot_owner_fk FOREIGN KEY(owner_tenant_id,owner_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT network_account_profile_publication_snapshot_recipient_fk FOREIGN KEY(recipient_tenant_id,recipient_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT network_account_profile_publication_snapshot_relationship_fk FOREIGN KEY(network_relationship_id) REFERENCES mesh.network_relationship(id) ON DELETE RESTRICT,
  ADD CONSTRAINT network_account_profile_publication_snapshot_captured_by_fk FOREIGN KEY(owner_tenant_id,captured_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE snapshot.bank_account_disclosure
  ADD CONSTRAINT bank_account_disclosure_snapshot_owner_fk FOREIGN KEY(owner_tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT bank_account_disclosure_snapshot_recipient_fk FOREIGN KEY(recipient_tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT bank_account_disclosure_snapshot_actor_fk FOREIGN KEY(owner_tenant_id,captured_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

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
