-- AP Non-PO accounting profiles (4 codes). Per-tenant seed driven by
-- app.seed_tenant_id; invoked from 099_apply.sql per tenant row.
-- Codes (referenced by 030/040/050 configs/events/templates):
--   AP_NON_PO_STANDARD, AP_NON_PO_CAPEX, AP_ADVANCE_SUPPLIER, AP_RETENTION_RELEASE

DO $seed_ap_profiles$
DECLARE
    v_tenant    record;
    v_tid       uuid;
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.tenant WHERE id = v_tid AND status = 'active') THEN
        RAISE EXCEPTION '[seed] active tenant % not found', v_tid;
    END IF;

    FOR v_tenant IN
        SELECT id AS tenant_id, code AS tenant_code
          FROM master.tenant
         WHERE id = v_tid
           AND status = 'active'
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

        ON CONFLICT (tenant_id, code) DO UPDATE SET
            name           = EXCLUDED.name,
            description    = EXCLUDED.description,
            direction      = EXCLUDED.direction,
            subledger_type = EXCLUDED.subledger_type,
            domain_hint    = EXCLUDED.domain_hint,
            icon_key       = EXCLUDED.icon_key,
            color_token    = EXCLUDED.color_token,
            sort_order     = EXCLUDED.sort_order,
            status         = EXCLUDED.status,
            updated_at     = now(),
            updated_by     = v_sys
        WHERE (master.accounting_profile.name,master.accounting_profile.description,
               master.accounting_profile.direction,master.accounting_profile.subledger_type,
               master.accounting_profile.domain_hint,master.accounting_profile.icon_key,
               master.accounting_profile.color_token,master.accounting_profile.sort_order,
               master.accounting_profile.status)
          IS DISTINCT FROM
              (EXCLUDED.name,EXCLUDED.description,EXCLUDED.direction,EXCLUDED.subledger_type,
               EXCLUDED.domain_hint,EXCLUDED.icon_key,EXCLUDED.color_token,EXCLUDED.sort_order,
               EXCLUDED.status);
    END LOOP;

    RAISE NOTICE 'blueprint/020_accounting_profiles: upserted 4 profiles for tenant %', v_tid;
END $seed_ap_profiles$;
