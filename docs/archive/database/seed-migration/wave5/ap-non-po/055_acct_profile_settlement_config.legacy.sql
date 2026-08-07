-- Settlement + dynamic discounting matrix (tolerance / discount APR):
--   AP_NON_PO_STANDARD   1%  BUYER_FUNDED 18% APR / 10 days / $500 min
--   AP_NON_PO_CAPEX      1%  no discount (CAPEX contracts are fixed-price)
--   AP_ADVANCE_SUPPLIER  0%  advances must match exactly
--   AP_RETENTION_RELEASE 0%  contractual milestone, no flex

DO $seed_ap_settlement$
DECLARE
    v_cfg  record;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_NON_PO_STANDARD'
           AND ap.tenant_id = v_tid
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_settlement_config (
            tenant_id, profile_config_id,
            settlement_method, settlement_tolerance,
            discount_model, discount_curve_type,
            discount_apr, discount_min_days, discount_min_amount,
            status, created_by, metadata
        ) VALUES (
            v_cfg.tenant_id, v_cfg.config_id,
            'PAYMENT', 1.00,
            'BUYER_FUNDED', 'FLAT',
            18.00, 10, 500.00,
            'active', v_sys,
            '{"description":"OPEX Non-PO — PAYMENT; 1% tolerance; buyer-funded early-pay discount at 18% APR, min 10 days, min 500"}'::jsonb
        )
        ON CONFLICT (profile_config_id) DO UPDATE SET
            settlement_method    = EXCLUDED.settlement_method,
            settlement_tolerance = EXCLUDED.settlement_tolerance,
            discount_model       = EXCLUDED.discount_model,
            discount_curve_type  = EXCLUDED.discount_curve_type,
            discount_apr         = EXCLUDED.discount_apr,
            discount_min_days    = EXCLUDED.discount_min_days,
            discount_min_amount  = EXCLUDED.discount_min_amount,
            status               = EXCLUDED.status,
            metadata             = EXCLUDED.metadata,
            updated_at           = now(),
            updated_by           = v_sys;
    END LOOP;

    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_NON_PO_CAPEX'
           AND ap.tenant_id = v_tid
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_settlement_config (
            tenant_id, profile_config_id,
            settlement_method, settlement_tolerance,
            status, created_by, metadata
        ) VALUES (
            v_cfg.tenant_id, v_cfg.config_id,
            'PAYMENT', 1.00,
            'active', v_sys,
            '{"description":"CAPEX Non-PO — PAYMENT; 1% tolerance; no discount (CAPEX contracts are fixed-price)"}'::jsonb
        )
        ON CONFLICT (profile_config_id) DO UPDATE SET
            settlement_method    = EXCLUDED.settlement_method,
            settlement_tolerance = EXCLUDED.settlement_tolerance,
            discount_model       = NULL,
            discount_curve_type  = NULL,
            discount_apr         = NULL,
            discount_min_days    = NULL,
            discount_min_amount  = NULL,
            status               = EXCLUDED.status,
            metadata             = EXCLUDED.metadata,
            updated_at           = now(),
            updated_by           = v_sys;
    END LOOP;

    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_ADVANCE_SUPPLIER'
           AND ap.tenant_id = v_tid
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_settlement_config (
            tenant_id, profile_config_id,
            settlement_method, settlement_tolerance,
            status, created_by, metadata
        ) VALUES (
            v_cfg.tenant_id, v_cfg.config_id,
            'PAYMENT', 0.00,
            'active', v_sys,
            '{"description":"Advance supplier payment — PAYMENT; 0% tolerance (advances are exact); no discount"}'::jsonb
        )
        ON CONFLICT (profile_config_id) DO UPDATE SET
            settlement_method    = EXCLUDED.settlement_method,
            settlement_tolerance = EXCLUDED.settlement_tolerance,
            discount_model       = NULL,
            discount_curve_type  = NULL,
            discount_apr         = NULL,
            discount_min_days    = NULL,
            discount_min_amount  = NULL,
            status               = EXCLUDED.status,
            metadata             = EXCLUDED.metadata,
            updated_at           = now(),
            updated_by           = v_sys;
    END LOOP;

    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_RETENTION_RELEASE'
           AND ap.tenant_id = v_tid
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_settlement_config (
            tenant_id, profile_config_id,
            settlement_method, settlement_tolerance,
            status, created_by, metadata
        ) VALUES (
            v_cfg.tenant_id, v_cfg.config_id,
            'PAYMENT', 0.00,
            'active', v_sys,
            '{"description":"Retention release — PAYMENT; 0% tolerance (contractual milestone, exact amount); no discount"}'::jsonb
        )
        ON CONFLICT (profile_config_id) DO UPDATE SET
            settlement_method    = EXCLUDED.settlement_method,
            settlement_tolerance = EXCLUDED.settlement_tolerance,
            discount_model       = NULL,
            discount_curve_type  = NULL,
            discount_apr         = NULL,
            discount_min_days    = NULL,
            discount_min_amount  = NULL,
            status               = EXCLUDED.status,
            metadata             = EXCLUDED.metadata,
            updated_at           = now(),
            updated_by           = v_sys;
    END LOOP;

    RAISE NOTICE 'blueprint/055_acct_profile_settlement_config: upserted settlement configs for tenant %', v_tid;
END $seed_ap_settlement$;
