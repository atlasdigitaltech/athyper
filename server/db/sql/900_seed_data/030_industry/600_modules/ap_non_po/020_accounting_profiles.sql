-- ============================================================================
-- FILE: blueprint/020_accounting_profiles.sql
-- Purpose: Seed 4 accounting profiles for the Non-PO AP cycle
-- Depends on: master.accounting_profile (005_accounting_profile_ddl.sql)
-- Idempotent: ON CONFLICT (tenant_id, code) DO NOTHING
-- ============================================================================
-- This seed is per-tenant — profiles live in the tenant's master data.
-- The block below runs once per tenant at provisioning time (invoked by
-- 099_apply.sql which iterates over master.tenant).
--
-- 4 profiles created:
--   AP_NON_PO_STANDARD   — OPEX Non-PO invoices (consulting, utilities, etc.)
--   AP_NON_PO_CAPEX      — CAPEX Non-PO invoices (IT equipment, furniture, etc.)
--   AP_ADVANCE_SUPPLIER    — Supplier-level advance (prepayment; no invoice yet)
--   AP_RETENTION_RELEASE — Release of AP Retention Payable on milestone
-- ============================================================================

DO $seed_ap_profiles$
DECLARE
    v_tenant    record;
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    FOR v_tenant IN
        SELECT id AS tenant_id, code AS tenant_code
          FROM master.tenant
         WHERE status = 'active'
    LOOP
        INSERT INTO master.accounting_profile (
            tenant_id, code, name, description,
            direction, subledger_type, domain_hint,
            icon_key, color_token, sort_order,
            status, created_by
        ) VALUES
        (v_tenant.tenant_id,
         'AP_NON_PO_STANDARD',
         'AP Non-PO — Standard',
         'Standard Non-PO supplier invoice for operating expenditure. '
         'Produces Dr Expense / Cr AP Trade Payable; supports VAT and WHT.',
         'INBOUND', 'AP', 'OPEX',
         'file-text', 'violet', 100,
         'active', v_sys),

        (v_tenant.tenant_id,
         'AP_NON_PO_CAPEX',
         'AP Non-PO — CAPEX',
         'Non-PO supplier invoice for capital expenditure. '
         'Produces Dr Fixed Asset (CWIP or direct) / Cr AP Trade Payable.',
         'INBOUND', 'AP', 'CAPEX',
         'building', 'indigo', 110,
         'active', v_sys),

        (v_tenant.tenant_id,
         'AP_ADVANCE_SUPPLIER',
         'AP Advance — Supplier Level',
         'Standalone advance payment to supplier without a prior invoice. '
         'Produces Dr AP Advance (asset) / Cr Bank Clearing on payment. '
         'Recovered by later invoices via ADVANCE_RECOVERED event.',
         'INBOUND', 'AP', 'OPEX',
         'circle-dollar-sign', 'amber', 120,
         'active', v_sys),

        (v_tenant.tenant_id,
         'AP_RETENTION_RELEASE',
         'AP Retention Release',
         'Release payment of previously-withheld retention to supplier on milestone. '
         'Produces Dr AP Retention Payable / Cr Bank Clearing.',
         'INBOUND', 'AP', 'OPEX',
         'unlock', 'teal', 130,
         'active', v_sys)

        ON CONFLICT (tenant_id, code) DO NOTHING;
    END LOOP;

    RAISE NOTICE 'blueprint/020_accounting_profiles: % tenants processed',
        (SELECT count(*) FROM master.tenant WHERE status = 'active');
END $seed_ap_profiles$;
