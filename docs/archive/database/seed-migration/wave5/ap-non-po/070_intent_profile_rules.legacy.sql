-- Routes (intent + flow + doc_type) → acct_profile_config (6 rules/tenant).
-- Priority — 100 (most specific: advance/retention), 200 CAPEX, 300/310 STANDARD/credit-note;
-- first match by ascending priority wins.
-- Rules 5/6 use flow_code=NULL as wildcard (matches NON_PO + PURCHASE_CONTRACT + DIRECT_PURCHASE).

DO $seed_intent_profile_rules$
DECLARE
    v_tenant     record;
    v_tid        uuid;
    v_sys        uuid := '00000000-0000-0000-0000-000000000000';

    v_bi_opex    uuid;
    v_bi_capex   uuid;
    v_bi_admin   uuid;

    v_apc_std    uuid;  -- AP_NON_PO_STANDARD config id
    v_apc_capex  uuid;  -- AP_NON_PO_CAPEX config id
    v_apc_adv    uuid;  -- AP_ADVANCE_SUPPLIER config id
    v_apc_ret    uuid;  -- AP_RETENTION_RELEASE config id
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.tenant WHERE id = v_tid AND status = 'active') THEN
        RAISE EXCEPTION '[seed] active tenant % not found', v_tid;
    END IF;

    FOR v_tenant IN
        SELECT id AS tenant_id FROM master.tenant WHERE id = v_tid AND status = 'active'
    LOOP
        SELECT id INTO v_bi_opex  FROM master.business_intent
         WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-OPEX';
        SELECT id INTO v_bi_capex FROM master.business_intent
         WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-CAPEX';
        SELECT id INTO v_bi_admin FROM master.business_intent
         WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-ADMIN';

        SELECT apc.id INTO v_apc_std
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.tenant_id = v_tenant.tenant_id
           AND ap.code = 'AP_NON_PO_STANDARD'
           AND apc.is_active = true
         LIMIT 1;

        SELECT apc.id INTO v_apc_capex
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.tenant_id = v_tenant.tenant_id
           AND ap.code = 'AP_NON_PO_CAPEX'
           AND apc.is_active = true
         LIMIT 1;

        SELECT apc.id INTO v_apc_adv
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.tenant_id = v_tenant.tenant_id
           AND ap.code = 'AP_ADVANCE_SUPPLIER'
           AND apc.is_active = true
         LIMIT 1;

        SELECT apc.id INTO v_apc_ret
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.tenant_id = v_tenant.tenant_id
           AND ap.code = 'AP_RETENTION_RELEASE'
           AND apc.is_active = true
         LIMIT 1;

        IF v_bi_opex IS NOT NULL AND v_apc_std IS NOT NULL THEN
            INSERT INTO control.intent_to_accounting_profile_rule (
                tenant_id, direction, intent_id, intent_domain,
                flow_code, doc_type, resolved_profile_config_id,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'INBOUND', v_bi_opex, 'OPEX',
                   'NON_PO', 'STANDARD', v_apc_std,
                   'OPEX Non-PO standard invoice → AP_NON_PO_STANDARD', 0.95, 300,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.intent_to_accounting_profile_rule
                 WHERE tenant_id = v_tenant.tenant_id
                   AND intent_id = v_bi_opex
                   AND flow_code = 'NON_PO'
                   AND doc_type  = 'STANDARD'
                   AND resolved_profile_config_id = v_apc_std
            );
        END IF;

        IF v_bi_admin IS NOT NULL AND v_apc_std IS NOT NULL THEN
            INSERT INTO control.intent_to_accounting_profile_rule (
                tenant_id, direction, intent_id, intent_domain,
                flow_code, doc_type, resolved_profile_config_id,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'INBOUND', v_bi_admin, 'ADMIN',
                   'NON_PO', 'STANDARD', v_apc_std,
                   'Admin Non-PO standard invoice → AP_NON_PO_STANDARD', 0.95, 300,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.intent_to_accounting_profile_rule
                 WHERE tenant_id = v_tenant.tenant_id
                   AND intent_id = v_bi_admin
                   AND flow_code = 'NON_PO'
                   AND doc_type  = 'STANDARD'
                   AND resolved_profile_config_id = v_apc_std
            );
        END IF;

        IF v_bi_opex IS NOT NULL AND v_apc_std IS NOT NULL THEN
            INSERT INTO control.intent_to_accounting_profile_rule (
                tenant_id, direction, intent_id, intent_domain,
                flow_code, doc_type, resolved_profile_config_id,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'INBOUND', v_bi_opex, 'OPEX',
                   'NON_PO', 'CREDIT_NOTE', v_apc_std,
                   'OPEX Non-PO credit note → AP_NON_PO_STANDARD (reversing)', 0.95, 310,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.intent_to_accounting_profile_rule
                 WHERE tenant_id = v_tenant.tenant_id
                   AND intent_id = v_bi_opex
                   AND flow_code = 'NON_PO'
                   AND doc_type  = 'CREDIT_NOTE'
                   AND resolved_profile_config_id = v_apc_std
            );
        END IF;

        IF v_bi_capex IS NOT NULL AND v_apc_capex IS NOT NULL THEN
            INSERT INTO control.intent_to_accounting_profile_rule (
                tenant_id, direction, intent_id, intent_domain,
                flow_code, doc_type, resolved_profile_config_id,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'INBOUND', v_bi_capex, 'CAPEX',
                   'NON_PO', 'STANDARD', v_apc_capex,
                   'CAPEX Non-PO invoice → AP_NON_PO_CAPEX (capitalisation)', 0.95, 200,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.intent_to_accounting_profile_rule
                 WHERE tenant_id = v_tenant.tenant_id
                   AND intent_id = v_bi_capex
                   AND flow_code = 'NON_PO'
                   AND doc_type  = 'STANDARD'
                   AND resolved_profile_config_id = v_apc_capex
            );
        END IF;

        IF v_bi_opex IS NOT NULL AND v_apc_adv IS NOT NULL THEN
            INSERT INTO control.intent_to_accounting_profile_rule (
                tenant_id, direction, intent_id, intent_domain,
                flow_code, doc_type, resolved_profile_config_id,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'INBOUND', v_bi_opex, 'OPEX',
                   NULL, 'ADVANCE', v_apc_adv,
                   'Supplier advance payment → AP_ADVANCE_SUPPLIER', 0.99, 100,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.intent_to_accounting_profile_rule
                 WHERE tenant_id = v_tenant.tenant_id
                   AND intent_id = v_bi_opex
                   AND flow_code IS NULL
                   AND doc_type  = 'ADVANCE'
                   AND resolved_profile_config_id = v_apc_adv
            );
        END IF;

        IF v_bi_opex IS NOT NULL AND v_apc_ret IS NOT NULL THEN
            INSERT INTO control.intent_to_accounting_profile_rule (
                tenant_id, direction, intent_id, intent_domain,
                flow_code, doc_type, resolved_profile_config_id,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'INBOUND', v_bi_opex, 'OPEX',
                   NULL, 'RETENTION_RELEASE', v_apc_ret,
                   'Retention release payment → AP_RETENTION_RELEASE', 0.99, 100,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.intent_to_accounting_profile_rule
                 WHERE tenant_id = v_tenant.tenant_id
                   AND intent_id = v_bi_opex
                   AND flow_code IS NULL
                   AND doc_type  = 'RETENTION_RELEASE'
                   AND resolved_profile_config_id = v_apc_ret
            );
        END IF;

    END LOOP;

    RAISE NOTICE 'blueprint/070_intent_profile_rules: 6 rules seeded for tenant %', v_tid;
END $seed_intent_profile_rules$;
