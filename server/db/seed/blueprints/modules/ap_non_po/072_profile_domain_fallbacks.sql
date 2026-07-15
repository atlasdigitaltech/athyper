-- Domain-level wildcard fallbacks (intent_id IS NULL) covering classification-
-- derived intents that don't match a specific 070 rule. Priority 900 — only
-- fires when no specific-intent rule matched.
-- Domain → profile: OPEX/ADMIN/COGS/REGULATORY/TRANSFER → AP_NON_PO_STANDARD,
-- CAPEX → AP_NON_PO_CAPEX. COGS/REG/TRANSFER all route through the AP subledger.

DO $seed_profile_domain_fallbacks$
DECLARE
    v_tenant     record;
    v_tid        uuid;
    v_sys        uuid := '00000000-0000-0000-0000-000000000000';

    v_apc_std    uuid;
    v_apc_capex  uuid;
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

        IF v_apc_std IS NOT NULL THEN
            INSERT INTO control.intent_to_accounting_profile_rule (
                tenant_id, direction, intent_id, intent_domain,
                flow_code, doc_type, resolved_profile_config_id,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'INBOUND', NULL, 'OPEX',
                   NULL, NULL, v_apc_std,
                   'Fallback: any OPEX intent → AP_NON_PO_STANDARD', 0.70, 900,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.intent_to_accounting_profile_rule
                 WHERE tenant_id     = v_tenant.tenant_id
                   AND intent_id     IS NULL
                   AND intent_domain = 'OPEX'
                   AND flow_code     IS NULL
                   AND doc_type      IS NULL
                   AND resolved_profile_config_id = v_apc_std
            );
        END IF;

        IF v_apc_capex IS NOT NULL THEN
            INSERT INTO control.intent_to_accounting_profile_rule (
                tenant_id, direction, intent_id, intent_domain,
                flow_code, doc_type, resolved_profile_config_id,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'INBOUND', NULL, 'CAPEX',
                   NULL, NULL, v_apc_capex,
                   'Fallback: any CAPEX intent → AP_NON_PO_CAPEX', 0.70, 900,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.intent_to_accounting_profile_rule
                 WHERE tenant_id     = v_tenant.tenant_id
                   AND intent_id     IS NULL
                   AND intent_domain = 'CAPEX'
                   AND flow_code     IS NULL
                   AND doc_type      IS NULL
                   AND resolved_profile_config_id = v_apc_capex
            );
        END IF;

        IF v_apc_std IS NOT NULL THEN
            INSERT INTO control.intent_to_accounting_profile_rule (
                tenant_id, direction, intent_id, intent_domain,
                flow_code, doc_type, resolved_profile_config_id,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'INBOUND', NULL, 'ADMIN',
                   NULL, NULL, v_apc_std,
                   'Fallback: any ADMIN intent → AP_NON_PO_STANDARD', 0.70, 900,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.intent_to_accounting_profile_rule
                 WHERE tenant_id     = v_tenant.tenant_id
                   AND intent_id     IS NULL
                   AND intent_domain = 'ADMIN'
                   AND flow_code     IS NULL
                   AND doc_type      IS NULL
                   AND resolved_profile_config_id = v_apc_std
            );
        END IF;

        IF v_apc_std IS NOT NULL THEN
            INSERT INTO control.intent_to_accounting_profile_rule (
                tenant_id, direction, intent_id, intent_domain,
                flow_code, doc_type, resolved_profile_config_id,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'INBOUND', NULL, 'COST_OF_SALES',
                   NULL, NULL, v_apc_std,
                   'Fallback: any COST_OF_SALES intent → AP_NON_PO_STANDARD (AP subledger)', 0.70, 900,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.intent_to_accounting_profile_rule
                 WHERE tenant_id     = v_tenant.tenant_id
                   AND intent_id     IS NULL
                   AND intent_domain = 'COST_OF_SALES'
                   AND flow_code     IS NULL
                   AND doc_type      IS NULL
                   AND resolved_profile_config_id = v_apc_std
            );
        END IF;

        IF v_apc_std IS NOT NULL THEN
            INSERT INTO control.intent_to_accounting_profile_rule (
                tenant_id, direction, intent_id, intent_domain,
                flow_code, doc_type, resolved_profile_config_id,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'INBOUND', NULL, 'REGULATORY',
                   NULL, NULL, v_apc_std,
                   'Fallback: any REGULATORY intent → AP_NON_PO_STANDARD', 0.70, 900,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.intent_to_accounting_profile_rule
                 WHERE tenant_id     = v_tenant.tenant_id
                   AND intent_id     IS NULL
                   AND intent_domain = 'REGULATORY'
                   AND flow_code     IS NULL
                   AND doc_type      IS NULL
                   AND resolved_profile_config_id = v_apc_std
            );
        END IF;

        IF v_apc_std IS NOT NULL THEN
            INSERT INTO control.intent_to_accounting_profile_rule (
                tenant_id, direction, intent_id, intent_domain,
                flow_code, doc_type, resolved_profile_config_id,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'INBOUND', NULL, 'TRANSFER',
                   NULL, NULL, v_apc_std,
                   'Fallback: any TRANSFER intent → AP_NON_PO_STANDARD', 0.65, 900,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.intent_to_accounting_profile_rule
                 WHERE tenant_id     = v_tenant.tenant_id
                   AND intent_id     IS NULL
                   AND intent_domain = 'TRANSFER'
                   AND flow_code     IS NULL
                   AND doc_type      IS NULL
                   AND resolved_profile_config_id = v_apc_std
            );
        END IF;

    END LOOP;

    RAISE NOTICE 'blueprint/072_profile_domain_fallbacks: up to 6 domain wildcard rules seeded for tenant %', v_tid;
END $seed_profile_domain_fallbacks$;
