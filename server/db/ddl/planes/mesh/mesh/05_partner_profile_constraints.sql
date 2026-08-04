ALTER TABLE mesh.network_account_profile
    ADD CONSTRAINT network_account_profile_account_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_profile_language_fk
    FOREIGN KEY (preferred_language_code)
    REFERENCES shared.locale (code) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_profile_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.network_account_commodity_capability
    ADD CONSTRAINT network_account_commodity_capability_account_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_commodity_capability_commodity_fk
    FOREIGN KEY (commodity_code_id)
    REFERENCES shared.commodity_code (id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_commodity_capability_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.network_account_tax_registration
    ADD CONSTRAINT network_account_tax_registration_account_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_tax_registration_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_tax_registration_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_tax_registration_verified_by_fk
    FOREIGN KEY (tenant_id, verified_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.bank_party
    ADD CONSTRAINT mesh_bank_party_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_party_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_party_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.bank_account
    ADD CONSTRAINT mesh_bank_account_owner_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_bank_party_fk
    FOREIGN KEY (tenant_id, bank_party_id)
    REFERENCES mesh.bank_party (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_country_fk
    FOREIGN KEY (bank_country_override)
    REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_verified_by_fk
    FOREIGN KEY (tenant_id, verified_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.bank_account_link
    ADD CONSTRAINT mesh_bank_account_link_owner_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_link_account_fk
    FOREIGN KEY (tenant_id, network_account_id, bank_account_id)
    REFERENCES mesh.bank_account (tenant_id, network_account_id, id)
    ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_link_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.bank_account_disclosure
    ADD CONSTRAINT bank_account_disclosure_owner_fk
    FOREIGN KEY (owner_tenant_id, owner_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_recipient_fk
    FOREIGN KEY (recipient_tenant_id, recipient_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_account_fk
    FOREIGN KEY (owner_tenant_id, owner_account_id, bank_account_id)
    REFERENCES mesh.bank_account (tenant_id, network_account_id, id)
    ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_relationship_fk
    FOREIGN KEY (network_relationship_id)
    REFERENCES mesh.network_relationship (id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_created_by_fk
    FOREIGN KEY (owner_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_disclosed_by_fk
    FOREIGN KEY (owner_tenant_id, disclosed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_revoked_by_fk
    FOREIGN KEY (owner_tenant_id, revoked_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
