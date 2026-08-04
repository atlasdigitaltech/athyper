CREATE INDEX network_account_profile_status_idx
    ON mesh.network_account_profile (tenant_id, status, network_account_id);

CREATE UNIQUE INDEX network_account_commodity_capability_current_uq
    ON mesh.network_account_commodity_capability
       (tenant_id, network_account_id, commodity_code_id, trade_role)
    WHERE effective_until IS NULL AND status = 'active';
CREATE INDEX network_account_commodity_capability_commodity_idx
    ON mesh.network_account_commodity_capability
       (commodity_code_id, trade_role, status);

CREATE UNIQUE INDEX network_account_tax_registration_current_uq
    ON mesh.network_account_tax_registration
       (tenant_id, network_account_id, country_code,
        registration_type_code, registration_number)
    WHERE status = 'active';
CREATE UNIQUE INDEX network_account_tax_registration_primary_uq
    ON mesh.network_account_tax_registration
       (tenant_id, network_account_id, country_code, registration_type_code)
    WHERE is_primary AND status = 'active';

CREATE INDEX mesh_bank_party_bic_idx
    ON mesh.bank_party (bic) WHERE bic IS NOT NULL;
CREATE UNIQUE INDEX mesh_bank_account_code_uq
    ON mesh.bank_account (tenant_id, network_account_id, code)
    WHERE code IS NOT NULL;
CREATE INDEX mesh_bank_account_owner_status_idx
    ON mesh.bank_account (tenant_id, network_account_id, status);
CREATE INDEX mesh_bank_account_fingerprint_idx
    ON mesh.bank_account (tenant_id, network_account_id, account_last4);
CREATE UNIQUE INDEX mesh_bank_account_link_current_uq
    ON mesh.bank_account_link
       (tenant_id, network_account_id, bank_account_id, purpose)
    WHERE effective_until IS NULL;
CREATE UNIQUE INDEX mesh_bank_account_link_primary_uq
    ON mesh.bank_account_link (tenant_id, network_account_id, purpose)
    WHERE is_primary AND effective_until IS NULL;
CREATE UNIQUE INDEX bank_account_disclosure_active_uq
    ON mesh.bank_account_disclosure
       (bank_account_id, network_relationship_id, recipient_account_id, purpose)
    WHERE status = 'active';
CREATE INDEX bank_account_disclosure_recipient_idx
    ON mesh.bank_account_disclosure
       (recipient_tenant_id, recipient_account_id, status, disclosed_at DESC);
