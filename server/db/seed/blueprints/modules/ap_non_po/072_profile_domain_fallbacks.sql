-- ============================================================================
-- FILE: blueprints/modules/ap_non_po/072_profile_domain_fallbacks.sql
-- Purpose: Wildcard domain-level fallback rules so classification-derived
--          intents (all resolved through canonical BI-* domain IDs)
--          still resolve to an accounting profile.
--
-- Problem solved: intent_to_accounting_profile_rule only carries specific
--   intent_id rows. Classification
--   rules may resolve intents like SC-IT-HW → CAPEX which have their own
--   business_intent IDs.  These wildcards (intent_id IS NULL) catch any intent
--   whose domain matches, regardless of the specific intent UUID.
--
-- 6 rules per tenant:
--   Wildcard-1: any OPEX         intent → AP_NON_PO_STANDARD
--   Wildcard-2: any CAPEX        intent → AP_NON_PO_CAPEX
--   Wildcard-3: any ADMIN        intent → AP_NON_PO_STANDARD
--   Wildcard-4: any COST_OF_SALES intent → AP_NON_PO_STANDARD
--              (COGS-classified AP invoices still post through the AP subledger)
--   Wildcard-5: any REGULATORY   intent → AP_NON_PO_STANDARD
--              (tax authority invoices, statutory fees route via AP)
--   Wildcard-6: any TRANSFER     intent → AP_NON_PO_STANDARD
--              (intercompany AP charges route via AP)
--
-- Priority: 900 (lowest — only fires when no specific-intent rule matched)
-- Idempotent: WHERE NOT EXISTS guard on (tenant_id, intent_id IS NULL, intent_domain)
-- ============================================================================

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

        -- ── Wildcard-1: any OPEX intent → AP_NON_PO_STANDARD ─────────────────
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

        -- ── Wildcard-2: any CAPEX intent → AP_NON_PO_CAPEX ───────────────────
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

        -- ── Wildcard-3: any ADMIN intent → AP_NON_PO_STANDARD ────────────────
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

        -- ── Wildcard-4: any COST_OF_SALES intent → AP_NON_PO_STANDARD ────────
        -- COGS-classified AP invoices (raw materials, freight, contract mfg)
        -- still post through the AP subledger — accounting profile is AP standard.
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

        -- ── Wildcard-5: any REGULATORY intent → AP_NON_PO_STANDARD ──────────
        -- Tax authority invoices, statutory levies, and compliance billings
        -- are processed through the AP subledger using the standard profile.
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

        -- ── Wildcard-6: any TRANSFER intent → AP_NON_PO_STANDARD ─────────────
        -- Intercompany AP charges and cost re-allocations received as invoices
        -- route through the standard AP profile.
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
