-- ============================================================================
-- 99_security/800_security_hardening.sql
-- Concept: Security Hardening — SECURITY DEFINER ownership, REVOKE/GRANT matrix
-- SECURITY DEFINER function hardening: ownership, revoke, grant.
-- Executes AFTER all phases (11_rls_policies) so all functions exist.
-- ============================================================================
 
-- ── Application role ─────────────────────────────────────────────────────────
-- athyperapp is the runtime application connection role.
-- It can EXECUTE SECURITY DEFINER functions but cannot directly modify tables.
DO $$ BEGIN
    CREATE ROLE athyperapp NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
 
COMMENT ON ROLE athyperapp IS
    'Runtime application role. Can EXECUTE SECURITY DEFINER functions and '
    'SELECT via RLS. Cannot directly INSERT/UPDATE/DELETE base tables '
    'except where tenant RLS policies permit.';
 
-- ── Ownership ────────────────────────────────────────────────────────────────
-- All SECURITY DEFINER functions must be owned by athyperadmin so they run
-- with admin privileges (admin_write RLS policies) regardless of caller.
 
-- shared tenant-context helpers (used in RLS policies and tenant-scoped queries):
DO $$ BEGIN
    ALTER FUNCTION shared.current_tenant_id()      OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION shared.current_tenant_id_soft()  OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    ALTER FUNCTION master.fn_lookup_tenant_for_auth(text, text)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    ALTER FUNCTION master.fn_check_tenant_code_available(text, text)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    ALTER FUNCTION master.fn_register_tenant(text, text, text, text, text, text, text, text, text)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    ALTER FUNCTION master.fn_update_tenant_profile(uuid, text, text, text, jsonb, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    ALTER FUNCTION master.fn_upsert_contact_link(uuid, text, uuid, text, text, text, boolean, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    ALTER FUNCTION master.fn_verify_contact_link(uuid, uuid, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    ALTER FUNCTION master.fn_set_primary_contact_link(uuid, uuid, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    ALTER FUNCTION master.fn_create_owner_contact_address(uuid, text, uuid, text, text, text, text, text, text, text, text, text, uuid, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    ALTER FUNCTION master.fn_set_primary_address_link(uuid, uuid, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- Tenant-session guards — not SECURITY DEFINER but leak session tenant UUID
-- in error messages when called by any role. Lock down for consistency.
DO $$ BEGIN
    ALTER FUNCTION master.fn_assert_tenant_session(uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION master.fn_require_tenant_session(uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- ── Revoke public execute ─────────────────────────────────────────────────────
-- PostgreSQL grants EXECUTE to PUBLIC by default. Remove that for all
-- SECURITY DEFINER functions — only explicitly granted roles may call them.
 
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION shared.current_tenant_id()      FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION shared.current_tenant_id_soft()  FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_lookup_tenant_for_auth(text, text) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_check_tenant_code_available(text, text) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_register_tenant(text, text, text, text, text, text, text, text, text) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_update_tenant_profile(uuid, text, text, text, jsonb, uuid) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_upsert_contact_link(uuid, text, uuid, text, text, text, boolean, uuid) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_verify_contact_link(uuid, uuid, uuid) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_set_primary_contact_link(uuid, uuid, uuid) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_create_owner_contact_address(uuid, text, uuid, text, text, text, text, text, text, text, text, text, uuid, uuid) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_set_primary_address_link(uuid, uuid, uuid) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_assert_tenant_session(uuid) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_require_tenant_session(uuid) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- ── Grant to application role ─────────────────────────────────────────────────
 
-- Tenant-context helpers (required by RLS policies — every role that SELECTs
-- from tenant-scoped tables needs EXECUTE on these):
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION shared.current_tenant_id()      TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION shared.current_tenant_id_soft()  TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- Public-surface functions (callable without a tenant session — auth/registration):
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_lookup_tenant_for_auth(text, text)      TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_check_tenant_code_available(text, text) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_register_tenant(text, text, text, text, text, text, text, text, text) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- Tenant-session functions (require app.current_tenant_id to be set):
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_update_tenant_profile(uuid, text, text, text, jsonb, uuid) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_upsert_contact_link(uuid, text, uuid, text, text, text, boolean, uuid) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_verify_contact_link(uuid, uuid, uuid) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_set_primary_contact_link(uuid, uuid, uuid) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_create_owner_contact_address(uuid, text, uuid, text, text, text, text, text, text, text, text, text, uuid, uuid) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_set_primary_address_link(uuid, uuid, uuid) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_assert_tenant_session(uuid) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_require_tenant_session(uuid) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- ── Schema access ──────────────────────────────────────────────────────────
-- PostgreSQL requires GRANT USAGE before any object in a schema is accessible.
-- Without these, athyperapp gets "permission denied for schema" even when RLS
-- would otherwise permit the rows.
 
GRANT USAGE ON SCHEMA shared, control, master,
                      document, ledger, log, event, governance, snapshot, aggregate
    TO athyperapp;
 
-- ── Read access (RLS filters rows; grants open the door) ───────────────────
 
GRANT SELECT ON ALL TABLES IN SCHEMA shared     TO athyperapp;
GRANT SELECT ON ALL TABLES IN SCHEMA control    TO athyperapp;
GRANT SELECT ON ALL TABLES IN SCHEMA master     TO athyperapp;
GRANT SELECT ON ALL TABLES IN SCHEMA document   TO athyperapp;
GRANT SELECT ON ALL TABLES IN SCHEMA ledger     TO athyperapp;
GRANT SELECT ON ALL TABLES IN SCHEMA log        TO athyperapp;
GRANT SELECT ON ALL TABLES IN SCHEMA event      TO athyperapp;
GRANT SELECT ON ALL TABLES IN SCHEMA governance TO athyperapp;
GRANT SELECT ON ALL TABLES IN SCHEMA snapshot   TO athyperapp;
GRANT SELECT ON ALL TABLES IN SCHEMA aggregate  TO athyperapp;
 
-- ── Write access ───────────────────────────────────────────────────────────
-- Only tables where tenant RLS policies allow DML from the application role.
 
GRANT INSERT, UPDATE, DELETE ON
    master.contact_link,
    master.contact_email,
    master.contact_phone,
    master.address,
    master.address_link,
    control.lookup_value,
    control.mfa_config,
    master.owner_type,
    master.label
TO athyperapp;
 
-- ── athyperadmin — schema + table access for SECURITY DEFINER functions ──────
-- SECURITY DEFINER functions owned by athyperadmin execute as athyperadmin.
-- Without USAGE on each schema they reference, those functions raise
-- "permission denied for schema X" even when called by a superuser session.
-- Full DML: admin_write RLS policies (TO athyperadmin) already restrict rows;
-- these grants open the table-privilege layer for functions like fn_valid_lookup,
-- fn_register_tenant, upsert_gl_balance, materialize_cycle_tasks, etc.

GRANT USAGE ON SCHEMA shared, control, master,
                      document, ledger, log, event, governance, snapshot, aggregate
    TO athyperadmin;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shared     TO athyperadmin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA control    TO athyperadmin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA master     TO athyperadmin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA document   TO athyperadmin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ledger     TO athyperadmin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA log        TO athyperadmin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA event      TO athyperadmin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA governance TO athyperadmin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA snapshot   TO athyperadmin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA aggregate  TO athyperadmin;

-- ── Default privileges for future tables ───────────────────────────────────
-- Ensures tables created later by athyperadmin inherit SELECT for athyperapp.
 
-- Revoke default privileges from PUBLIC to prevent accidental access on future tables.
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA shared     REVOKE SELECT ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA control    REVOKE SELECT ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA master     REVOKE SELECT ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA document   REVOKE SELECT ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA ledger     REVOKE SELECT ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA log        REVOKE SELECT ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA event      REVOKE SELECT ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA governance REVOKE SELECT ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA snapshot   REVOKE SELECT ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA aggregate  REVOKE SELECT ON TABLES FROM PUBLIC;
 
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA shared     GRANT SELECT ON TABLES TO athyperapp;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA control    GRANT SELECT ON TABLES TO athyperapp;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA master     GRANT SELECT ON TABLES TO athyperapp;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA document   GRANT SELECT ON TABLES TO athyperapp;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA ledger     GRANT SELECT ON TABLES TO athyperapp;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA log        GRANT SELECT ON TABLES TO athyperapp;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA event      GRANT SELECT ON TABLES TO athyperapp;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA governance GRANT SELECT ON TABLES TO athyperapp;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA snapshot   GRANT SELECT ON TABLES TO athyperapp;
ALTER DEFAULT PRIVILEGES FOR ROLE athyperadmin IN SCHEMA aggregate  GRANT SELECT ON TABLES TO athyperapp;
 
 
-- =============================================================================
-- DOCUMENT · PRINT · BRANDING  —  function security hardening
-- =============================================================================
 
-- Ownership: trigger/validation functions owned by athyperadmin
DO $$ BEGIN
    ALTER FUNCTION document.trg_enforce_single_default()             OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION document.trg_comment_parent_same_attachment()     OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION document.trg_doc_validate_mentions()              OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION document.trg_validate_page_margins()              OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION document.trg_validate_manifest_json()             OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION document.trg_validate_variables_schema()          OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION snapshot.trg_template_version_immutable()         OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- Utility functions: owned by athyperadmin, callable by application
DO $$ BEGIN
    ALTER FUNCTION document.resolve_template_binding(uuid, text, text, text) OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION document.compute_attachment_lineage(uuid, uuid)            OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION document.cleanup_expired_render_outputs(uuid, integer, integer) OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION document.resolve_template_binding(uuid, text, text, text)    TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION document.compute_attachment_lineage(uuid, uuid)               TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION document.cleanup_expired_render_outputs(uuid, integer, integer) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
 
-- =============================================================================
-- GOVERNANCE CYCLE MODEL — function security hardening
-- =============================================================================
 
-- Ownership: SECURITY DEFINER functions owned by athyperadmin
DO $$ BEGIN
    ALTER FUNCTION governance.materialize_cycle_tasks(uuid, varchar)  OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION governance.execute_carryforward(uuid, uuid)        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION log.emit_cycle_audit(uuid, varchar, varchar, varchar, varchar, uuid, uuid, varchar, uuid, varchar, varchar, varchar, jsonb, text)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION log.create_cycle_audit_partition(date) OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- Revoke public execute
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION governance.materialize_cycle_tasks(uuid, varchar) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION governance.execute_carryforward(uuid, uuid) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION log.emit_cycle_audit(uuid, varchar, varchar, varchar, varchar, uuid, uuid, varchar, uuid, varchar, varchar, varchar, jsonb, text)
        FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION log.create_cycle_audit_partition(date) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- Grant to application role
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION governance.materialize_cycle_tasks(uuid, varchar) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION governance.execute_carryforward(uuid, uuid) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION log.emit_cycle_audit(uuid, varchar, varchar, varchar, varchar, uuid, uuid, varchar, uuid, varchar, varchar, varchar, jsonb, text)
        TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
-- create_cycle_audit_partition: NOT granted to athyperapp (admin-only DDL)
 
-- Write grants for governance cycle tables
GRANT INSERT, UPDATE, DELETE ON
    governance.cycle_type,
    governance.cycle_phase,
    governance.cycle_task_category,
    governance.cycle_task_template,
    governance.cycle_task_dependency,
    governance.cycle_run,
    governance.cycle_task,
    governance.cycle_deviation,
    governance.cycle_certification,
    governance.cycle_cross_dependency,
    governance.cycle_carryforward_rule
TO athyperapp;
 
GRANT INSERT ON log.cycle_audit_log TO athyperapp;
 
 
-- ── Bank Engine — function security ──────────────────────────────────────────
 
DO $$ BEGIN
    ALTER FUNCTION control.resolve_bank_format_rule(uuid, character(2), text, text, character(3))
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION control.resolve_bank_format_rule(uuid, character(2), text, text, character(3))
        FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION control.resolve_bank_format_rule(uuid, character(2), text, text, character(3))
        TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- ── Bank Engine — table DML grants ───────────────────────────────────────────
 
GRANT INSERT, UPDATE, DELETE ON
    master.bank_party,
    master.bank_account,
    master.bank_account_link,
    master.bank_account_house_config
TO athyperapp;
 
GRANT SELECT ON
    control.bank_format_rule
TO athyperapp;
 
GRANT INSERT, UPDATE ON control.bank_format_rule TO athyperapp;
 
 
-- ── Payment Method Engine — function security ────────────────────────────────
 
DO $$ BEGIN
    ALTER FUNCTION control.resolve_bank_interface(uuid, uuid, text, uuid, uuid, character(3), character(2), text)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION control.resolve_bank_interface(uuid, uuid, text, uuid, uuid, character(3), character(2), text)
        FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION control.resolve_bank_interface(uuid, uuid, text, uuid, uuid, character(3), character(2), text)
        TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- ── Payment Method Engine — table DML grants ─────────────────────────────────
 
GRANT INSERT, UPDATE, DELETE ON
    master.payment_method,
    control.payment_method_company_policy
TO athyperapp;
 
-- Interface profiles, bindings, settlement rules: deactivate, don't delete
GRANT INSERT, UPDATE ON
    control.bank_interface_profile,
    control.payment_method_interface_binding,
    control.payment_settlement_rule
TO athyperapp;
 
GRANT SELECT ON
    master.payment_method,
    control.payment_method_company_policy,
    control.bank_interface_profile,
    control.payment_method_interface_binding,
    control.payment_settlement_rule
TO athyperapp;
 
 
-- ── Lookup validation functions — ownership + revoke + grant ─────────────────
-- These are SECURITY DEFINER (as of the review fix) and must be owned by admin.
DO $$ BEGIN
    ALTER FUNCTION control.fn_valid_lookup(text, text)          OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION control.fn_valid_lookup_nullable(text, text) OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION master.fn_valid_owner_type(text)             OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION control.fn_valid_lookup(text, text)          FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION control.fn_valid_lookup_nullable(text, text) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_valid_owner_type(text)             FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION control.fn_valid_lookup(text, text)          TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION control.fn_valid_lookup_nullable(text, text) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_valid_owner_type(text)             TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
 
-- ── Ledger SECURITY DEFINER functions — ownership ───────────────────────────
DO $$ BEGIN
    ALTER FUNCTION ledger.upsert_gl_balance(uuid, uuid, uuid, uuid, smallint, smallint, character, numeric, numeric, uuid, uuid, uuid, uuid, uuid, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION ledger.trg_guard_inventory_company_consistency()
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION ledger.upsert_gl_balance(uuid, uuid, uuid, uuid, smallint, smallint, character, numeric, numeric, uuid, uuid, uuid, uuid, uuid, uuid)
        FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION ledger.upsert_gl_balance(uuid, uuid, uuid, uuid, smallint, smallint, character, numeric, numeric, uuid, uuid, uuid, uuid, uuid, uuid)
        TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
 
-- ── Control engine SECURITY DEFINER functions — ownership ───────────────────
DO $$ BEGIN
    ALTER FUNCTION control.resolve_business_intent(uuid, uuid, uuid, text, text, uuid, uuid, uuid, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION control.resolve_accounting_profile(uuid, uuid, uuid, text, text, uuid, uuid, uuid, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION control.resolve_entry_account(uuid, uuid, uuid, text, text, uuid, uuid, uuid, uuid, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION control.generate_event_entries(uuid, uuid, uuid, text, text, uuid, uuid, uuid, uuid, text)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION control.rebuild_intent_paths(uuid, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION control.validate_profile_completeness(uuid, uuid, uuid, text, text, uuid, uuid, uuid, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION control.promote_obligation_tier(uuid, uuid, uuid, text, uuid, uuid, character(3), character(2), text)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION control.next_document_number(uuid, text, text, text, text, uuid, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION control.resolve_asset_class_book_policy(uuid, uuid, text)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION control.provision_asset_policies(uuid, uuid, text, date, uuid, boolean)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION control.resolve_posting_role_account(uuid, uuid, text)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
 
-- =============================================================================
-- UI PRINCIPAL — function security hardening
-- Depends on: 08_functions/003b_master_ui_principal.sql
-- =============================================================================
 
-- ── Ownership ─────────────────────────────────────────────────────────────────
-- All three are SECURITY DEFINER. Without OWNER TO athyperadmin the definer
-- privilege elevation is wrong and admin_write RLS bypass will not apply.
DO $$ BEGIN
    ALTER FUNCTION master.fn_resolve_principal_ui(uuid, uuid)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION master.fn_set_principal_ui_preference(uuid, uuid, text, text, jsonb)
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION master.trg_enforce_created_by()
        OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- Supplementary trigger functions (defined in 08_functions/003c_master_ui_principal_supplementary.sql).
DO $$ BEGIN
    ALTER FUNCTION master.trg_guard_scope_owner_immutable() OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    ALTER FUNCTION master.trg_sync_deleted_at_with_status()  OWNER TO athyperadmin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- ── Revoke public execute ──────────────────────────────────────────────────────
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_resolve_principal_ui(uuid, uuid) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.fn_set_principal_ui_preference(uuid, uuid, text, text, jsonb) FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
-- Trigger functions: not callable directly but lock down as hygiene.
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.trg_enforce_created_by() FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.trg_guard_scope_owner_immutable() FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION master.trg_sync_deleted_at_with_status()  FROM PUBLIC;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- ── Grant to application role ──────────────────────────────────────────────────
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_resolve_principal_ui(uuid, uuid) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION master.fn_set_principal_ui_preference(uuid, uuid, text, text, jsonb) TO athyperapp;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
 
-- ── DML grants for UI principal tables ────────────────────────────────────────
-- RLS policies control which rows are accessible; these grants open the door.
GRANT INSERT, UPDATE, DELETE ON
    master.principal_ui_profile,
    master.principal_ui_preference,
    master.saved_view,
    master.dashboard,
    master.dashboard_widget
TO athyperapp;
