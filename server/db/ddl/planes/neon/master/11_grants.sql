REVOKE ALL ON SCHEMA master FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA master FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA master FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA master TO athyperapp;

        GRANT SELECT ON
            master.tenant,
            master.tenant_relationship,
            master.workspace,
            master.module,
            master.tax_jurisdiction,
            master.tax_type
        TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON master.condition_type
            TO athyperapp;
        GRANT SELECT, INSERT, UPDATE
            ON master.tenant_profile
            TO athyperapp;

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON master.address,
               master.address_link,
               master.contact_link,
               master.contact_email,
               master.contact_phone,
               master.external_reference
            TO athyperapp;

        GRANT SELECT ON master.principal TO athyperapp;
        GRANT SELECT ON
            master.team,
            master.team_member
        TO athyperapp;
        GRANT SELECT, INSERT, UPDATE
            ON master.principal_profile,
               master.principal_ui_profile
            TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON master.principal_ui_preference,
               master.principal_notification_preference
            TO athyperapp;
        GRANT SELECT, INSERT, UPDATE
            ON master.saved_view
            TO athyperapp;
        GRANT SELECT, INSERT, DELETE
            ON master.record_bookmark
            TO athyperapp;
        GRANT SELECT, INSERT, UPDATE
            ON master.brand_profile,
               master.letterhead,
               master.print_profile,
               master.template,
               master.template_binding
            TO athyperapp;
        GRANT SELECT, INSERT, UPDATE
            ON master.legal_entity,
               master.company_code,
               master.organization_tax_registration,
               master.operating_organization,
               master.procurement_organization_profile,
               master.sales_organization_profile,
               master.operating_organization_company_assignment,
               master.org_unit,
               master.profit_center,
               master.cost_center,
               master.dimension_type,
               master.dimension_value
            TO athyperapp;
        GRANT SELECT ON
            master.dimension_set,
            master.dimension_set_item
            TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            master.accounting_profile,
            master.chart_of_account,
            master.gl_account,
            master.ledger_book,
            master.company_code_chart_assignment,
            master.company_code_book_assignment,
            master.fiscal_period,
            master.company_code_dimension_default,
            master.company_code_gl_account
            TO athyperapp;
        GRANT SELECT, INSERT, UPDATE
            ON master.fx_rate
            TO athyperapp;
        GRANT SELECT ON master.mv_company_postable_account TO athyperapp;
        GRANT SELECT, INSERT, UPDATE
            ON master.bank_party,
               master.bank_account_link,
               master.bank_account_house_config
            TO athyperapp;
        GRANT INSERT, UPDATE ON master.bank_account TO athyperapp;
        GRANT SELECT (
            id, tenant_id, code, name, bank_party_id,
            account_holder_name, account_id_type, account_last4,
            currency_code, bic_override, bank_name_override,
            bank_country_override, account_nature, provider_account_ref,
            correspondent_bank_party_id, is_verified, verified_at,
            verified_by, verification_method, metadata, status, is_active,
            status_changed_at, status_changed_by,
            created_at, created_by, updated_at, updated_by
        ) ON master.bank_account TO athyperapp;
        GRANT SELECT ON
            master.v_bank_account_resolved,
            master.v_bank_account_link_resolved
            TO athyperapp;
        GRANT SELECT, INSERT ON master.payment_term TO athyperapp;
        GRANT UPDATE (
            id, tenant_id, code, name, description,
            direction, instrument_mode, requires_bank_account,
            requires_counterparty_bank, requires_bank_interface,
            requires_reference_number, supports_batch, supports_partial,
            supports_reversal, supports_file_generation, supports_real_time_api,
            sort_order, metadata, status, status_changed_at, status_changed_by,
            updated_at, updated_by
        ) ON master.payment_method TO athyperapp;
        GRANT SELECT, INSERT ON master.payment_method TO athyperapp;
        GRANT UPDATE (
            name, description, applicable_to, base_event,
            due_rule_type, due_days, due_day_of_month, grace_days,
            due_date_flexibility, business_day_convention,
            holiday_calendar_id, month_offset, term_category,
            installment_count, version, is_current_version,
            discount_selection_mode,
            replaces_payment_term_id, sort_order, metadata,
            updated_at, updated_by
        ) ON master.payment_term TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON master.payment_term_clause,
               master.payment_term_discount_tier
            TO athyperapp;
        GRANT SELECT ON master.principal_directory TO athyperapp;

        GRANT SELECT, INSERT, UPDATE ON
            master.business_partner,
            master.supplier,
            master.customer
            TO athyperapp;

        GRANT SELECT, INSERT, UPDATE ON
            master.asset_class,
            master.asset,
            master.asset_book,
            master.asset_component
            TO athyperapp;
        GRANT SELECT, INSERT
            ON master.asset_assignment_history
            TO athyperapp;

        GRANT EXECUTE ON FUNCTION master.current_principal_id_soft()
            TO athyperapp;
        GRANT EXECUTE ON FUNCTION master.fn_resolve_principal_identity(
            uuid, master.identity_provider_d, text, text
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION master.fn_resolve_dimension_set(jsonb, uuid)
            TO athyperapp;
        GRANT EXECUTE ON FUNCTION master.fn_refresh_mv_cpa()
            TO athyperapp;
        GRANT EXECUTE ON FUNCTION master.end_bank_account_link(
            uuid, uuid, date, uuid
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION master.activate_payment_term(
            uuid, uuid, uuid
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION master.retire_payment_term(
            uuid, uuid, uuid
        ) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA master TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA master TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA master TO athyperadmin;
    END IF;
END;
$$;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON master.business_intent TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON master.business_intent TO athyperadmin;
        GRANT EXECUTE ON FUNCTION master.trg_bi_parent_guard()
            TO athyperadmin;
    END IF;
END;
$$;
