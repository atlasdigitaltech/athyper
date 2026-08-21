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

        GRANT SELECT ON master.principal, master.principal_identity_binding TO athyperapp;
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

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            master.business_partner_relationship,
            master.business_partner_governance_relation,
            master.business_partner_identifier,
            master.business_partner_tax_registration,
            master.business_partner_commodity_capability,
            master.business_partner_operating_organization_assignment,
            master.company_code_supplier_profile,
            master.company_code_customer_profile,
            master.legal_entity_business_partner_link,
            master.intercompany_trading_pair
        TO athyperapp;
        GRANT SELECT, INSERT, DELETE ON
            master.contact_person_identity_link
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            master.business_partner_relationship,
            master.business_partner_governance_relation,
            master.business_partner_identifier,
            master.business_partner_tax_registration,
            master.business_partner_commodity_capability,
            master.business_partner_operating_organization_assignment,
            master.company_code_supplier_profile,
            master.company_code_customer_profile,
            master.legal_entity_business_partner_link,
            master.intercompany_trading_pair,
            master.contact_person_identity_link
        TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            master.person,
            master.site,
            master.career_band,
            master.career_level,
            master.designation,
            master.job_family,
            master.job_function,
            master.pay_grade,
            master.job,
            master.holiday_calendar,
            master.holiday_calendar_day,
            master.shift_type,
            master.work_pattern,
            master.work_pattern_day,
            master.pay_component,
            master.pay_group,
            master.pay_structure,
            master.pay_structure_line,
            master.statutory_scheme,
            master.leave_type,
            master.leave_plan,
            master.leave_plan_rule,
            master.position,
            master.employee,
            master.employment,
            master.work_assignment,
            master.employee_leave_enrollment,
            master.employee_statutory_enrollment
        TO athyperapp;

        -- Sensitive attributes are read-only to the generic runtime role.
        -- A future dedicated HR writer role may receive narrowly scoped writes.
        GRANT SELECT ON master.person_sensitive_profile TO athyperapp;
        GRANT SELECT ON master.v_employee TO athyperapp;

        GRANT EXECUTE ON FUNCTION master.trg_set_site_hierarchy() TO athyperapp;
        GRANT EXECUTE ON FUNCTION master.trg_validate_work_assignment_contract() TO athyperapp;
    END IF;
END;
$$;

REVOKE ALL ON master.warehouse FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON master.warehouse TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON master.warehouse TO athyperadmin;
        GRANT EXECUTE ON FUNCTION master.trg_guard_warehouse_identity() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION master.trg_validate_warehouse_type() TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON
            master.risk_dimension,
            master.risk_driver_registry,
            master.risk_model,
            master.risk_model_dimension,
            master.risk_source
        TO athyperapp;

        GRANT SELECT, INSERT, UPDATE ON
            master.party_risk_assessment,
            master.party_risk_dimension_score,
            master.party_risk_evidence
        TO athyperapp;

        GRANT SELECT, INSERT, UPDATE, DELETE ON
            master.party_risk_driver,
            master.party_risk_mitigation
        TO athyperapp;

        GRANT SELECT, INSERT ON
            master.party_risk_review_event
        TO athyperapp;

    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA master TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            master.commodity_category,
            master.product,
            master.item,
            master.commodity_code_assignment,
            master.catalog,
            master.catalog_item,
            master.catalog_price,
            master.bom,
            master.bom_component
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA master TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            master.commodity_category,
            master.product,
            master.item,
            master.commodity_code_assignment,
            master.catalog,
            master.catalog_item,
            master.catalog_price,
            master.bom,
            master.bom_component
        TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA master TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            master.project, master.project_wbs, master.project_item
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA master TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            master.project, master.project_wbs, master.project_item
        TO athyperadmin;
    END IF;
END;
$$;

DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT SELECT,INSERT,UPDATE ON master.compensation_assignment TO athyperapp;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT ALL PRIVILEGES ON master.compensation_assignment TO athyperadmin;
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON master.certification_type TO athyperapp;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON master.certification TO athyperapp;
GRANT ALL PRIVILEGES
  ON master.certification_type TO athyperadmin;
GRANT ALL PRIVILEGES
  ON master.certification TO athyperadmin;
GRANT EXECUTE
  ON FUNCTION master.trg_validate_certification_type_scope()
  TO athyperapp, athyperadmin;


REVOKE ALL ON master.organization_amendment FROM PUBLIC;
REVOKE ALL ON FUNCTION master.trg_guard_organization_lifecycle(),master.trg_record_organization_amendment(),master.trg_sync_organization_scope_target(),master.trg_emit_operating_assignment_invalidation(),master.trg_reject_organization_amendment_mutation() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT ON master.organization_amendment TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON master.organization_amendment TO athyperadmin; END IF;
END $$;
