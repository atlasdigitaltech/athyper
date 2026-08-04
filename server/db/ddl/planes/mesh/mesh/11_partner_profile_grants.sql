DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            mesh.network_account_profile,
            mesh.network_account_commodity_capability,
            mesh.network_account_tax_registration,
            mesh.bank_party,
            mesh.bank_account_link,
            mesh.bank_account_disclosure
        TO athyperapp;
        GRANT INSERT, UPDATE ON mesh.bank_account TO athyperapp;
        GRANT SELECT (
            id, tenant_id, network_account_id, code, name, bank_party_id,
            account_holder_name, account_id_type, account_last4,
            currency_code, bic_override, bank_name_override,
            bank_country_override, provider_account_ref,
            is_verified, verified_at, verified_by, verification_method,
            metadata, status, is_active, status_changed_at,
            status_changed_by, created_at, created_by, updated_at, updated_by
        ) ON mesh.bank_account TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            mesh.network_account_profile,
            mesh.network_account_commodity_capability,
            mesh.network_account_tax_registration,
            mesh.bank_party,
            mesh.bank_account,
            mesh.bank_account_link,
            mesh.bank_account_disclosure
        TO athyperadmin;
    END IF;
END;
$$;
