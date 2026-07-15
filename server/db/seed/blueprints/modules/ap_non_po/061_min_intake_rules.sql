-- Phase 1b minimum seed — leaf classification→intent rules for top-20 spend
-- categories. Priorities: 10–99 = amount/recurring conditions (evaluated first),
-- 500 = FALLBACK. 060 fallback stubs sit at 999 below these.

DO $seed_min_intake$
DECLARE
    v_tenant     record;
    v_tid        uuid;
    v_sys        uuid  := '00000000-0000-0000-0000-000000000000';

    -- commodity_category UUIDs (resolved per tenant loop)
    v_cc_it_hw        uuid; v_cc_it_sw         uuid; v_cc_it_svc       uuid;
    v_cc_it_cloud     uuid; v_cc_it_sec        uuid;
    v_cc_prof_consult uuid; v_cc_prof_legal    uuid; v_cc_prof_audit   uuid;
    v_cc_prof_eng     uuid;
    v_cc_fac_rent     uuid; v_cc_fac_maint     uuid;
    v_cc_office_sup   uuid;
    v_cc_mktg_digital uuid; v_cc_travel_air    uuid;
    v_cc_freight      uuid; v_cc_capequip      uuid;
    v_cc_raw          uuid; v_cc_tax           uuid;
    v_cc_outsrc       uuid; v_cc_subs          uuid;

    -- business_intent UUIDs (resolved / created per tenant)
    v_bi_opex_it       uuid; v_bi_capex_it      uuid;
    v_bi_opex_it_sub   uuid; v_bi_capex_it_lic  uuid;
    v_bi_opex_consult  uuid; v_bi_opex_consult_xb uuid;
    v_bi_opex_legal    uuid; v_bi_reg_audit     uuid;
    v_bi_opex_fac_rent uuid; v_bi_opex_fac_maint uuid;
    v_bi_opex_office   uuid; v_bi_opex_mktg     uuid;
    v_bi_opex_travel   uuid; v_bi_cogs_freight  uuid;
    v_bi_capex_equip   uuid; v_bi_cogs_raw      uuid;
    v_bi_reg_tax       uuid; v_bi_transfer_ic   uuid;
    v_bi_opex_subs     uuid;
    -- loop variable for FOREACH (distinct from v_cc_it_hw)
    v_cc_cur           uuid;

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

        -- Domain-level business_intent IDs (specific intent rows were retired —
        -- everything now resolves to BI-OPEX / BI-CAPEX / BI-COGS / BI-REG / BI-TRANSFER).
        SELECT id INTO v_bi_opex_it          FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-OPEX';
        SELECT id INTO v_bi_opex_it_sub      FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-OPEX';
        SELECT id INTO v_bi_capex_it         FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-CAPEX';
        SELECT id INTO v_bi_capex_it_lic     FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-CAPEX';
        SELECT id INTO v_bi_opex_consult     FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-OPEX';
        SELECT id INTO v_bi_opex_consult_xb  FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-OPEX';
        SELECT id INTO v_bi_opex_legal       FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-OPEX';
        SELECT id INTO v_bi_reg_audit        FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-REG';
        SELECT id INTO v_bi_opex_fac_rent    FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-OPEX';
        SELECT id INTO v_bi_opex_fac_maint   FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-OPEX';
        SELECT id INTO v_bi_opex_office      FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-OPEX';
        SELECT id INTO v_bi_opex_mktg        FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-OPEX';
        SELECT id INTO v_bi_opex_travel      FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-OPEX';
        SELECT id INTO v_bi_cogs_freight     FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-COGS';
        SELECT id INTO v_bi_capex_equip      FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-CAPEX';
        SELECT id INTO v_bi_cogs_raw         FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-COGS';
        SELECT id INTO v_bi_opex_subs        FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-OPEX';
        SELECT id INTO v_bi_reg_tax          FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-REG';
        SELECT id INTO v_bi_transfer_ic      FROM master.business_intent WHERE tenant_id = v_tenant.tenant_id AND code = 'BI-TRANSFER';

        SELECT id INTO v_cc_it_hw        FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-IT-HW';
        SELECT id INTO v_cc_it_sw        FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-IT-SW';
        SELECT id INTO v_cc_it_svc       FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-IT-SVC';
        SELECT id INTO v_cc_it_cloud     FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-IT-CLOUD';
        SELECT id INTO v_cc_it_sec       FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-IT-SEC';
        SELECT id INTO v_cc_prof_consult FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-PROF-CONSULT';
        SELECT id INTO v_cc_prof_legal   FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-PROF-LEGAL';
        SELECT id INTO v_cc_prof_audit   FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-PROF-AUDIT';
        SELECT id INTO v_cc_prof_eng     FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-PROF-ENG';
        SELECT id INTO v_cc_fac_rent     FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-FAC-RENT';
        SELECT id INTO v_cc_fac_maint    FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-FAC-MAINT';
        SELECT id INTO v_cc_office_sup   FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-OFFICE-SUP';
        SELECT id INTO v_cc_mktg_digital FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-MKTG-DIGITAL';
        SELECT id INTO v_cc_travel_air   FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-TRAVEL-AIR';
        SELECT id INTO v_cc_freight      FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-FREIGHT';
        SELECT id INTO v_cc_capequip     FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-CAPEQUIP';
        SELECT id INTO v_cc_raw          FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-RAW';
        SELECT id INTO v_cc_tax          FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-TAX';
        SELECT id INTO v_cc_outsrc       FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-OUTSRC';
        SELECT id INTO v_cc_subs         FROM master.commodity_category WHERE tenant_id = v_tenant.tenant_id AND code = 'SC-SUBS';

        -- SC-IT-HW: amount > 5,000 → CAPEX; else OPEX fallback.
        IF v_cc_it_hw IS NOT NULL AND v_bi_capex_it IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id, classification_source, classification_id, direction,
                 condition_type, condition_config, applies_to_flows,
                 resolved_intent_id, resolved_domain,
                 explanation_template, confidence, priority, effective_from, status, created_by)
            SELECT v_tenant.tenant_id, 'COMMODITY_CATEGORY', v_cc_it_hw, 'INBOUND',
                   'AMOUNT_ABOVE', '{"threshold":5000}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_capex_it, 'CAPEX',
                   'CAPEX because amount {amount} > IT Hardware threshold 5,000', 0.92, 10,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id AND classification_source = 'COMMODITY_CATEGORY' AND classification_id = v_cc_it_hw
                   AND condition_type = 'AMOUNT_ABOVE' AND resolved_intent_id = v_bi_capex_it);
        END IF;

        IF v_cc_it_hw IS NOT NULL AND v_bi_opex_it IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id, classification_source, classification_id, direction,
                 condition_type, condition_config, applies_to_flows,
                 resolved_intent_id, resolved_domain,
                 explanation_template, confidence, priority, effective_from, status, created_by)
            SELECT v_tenant.tenant_id, 'COMMODITY_CATEGORY', v_cc_it_hw, 'INBOUND',
                   'FALLBACK', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_opex_it, 'OPEX',
                   'IT Hardware below CAPEX threshold — expensed as OPEX', 0.85, 500,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id AND classification_source = 'COMMODITY_CATEGORY' AND classification_id = v_cc_it_hw
                   AND condition_type = 'FALLBACK' AND resolved_intent_id = v_bi_opex_it);
        END IF;

        -- SC-IT-SW: recurring → OPEX (SaaS); amount > 25,000 → CAPEX (perpetual license).
        IF v_cc_it_sw IS NOT NULL AND v_bi_opex_it_sub IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id, classification_source, classification_id, direction,
                 condition_type, condition_config, applies_to_flows,
                 resolved_intent_id, resolved_domain,
                 explanation_template, confidence, priority, effective_from, status, created_by)
            SELECT v_tenant.tenant_id, 'COMMODITY_CATEGORY', v_cc_it_sw, 'INBOUND',
                   'IS_RECURRING', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_opex_it_sub, 'OPEX',
                   'SaaS/subscription flagged as recurring — OPEX regardless of amount', 0.95, 10,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id AND classification_source = 'COMMODITY_CATEGORY' AND classification_id = v_cc_it_sw
                   AND condition_type = 'IS_RECURRING' AND resolved_intent_id = v_bi_opex_it_sub);
        END IF;

        IF v_cc_it_sw IS NOT NULL AND v_bi_capex_it_lic IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id, classification_source, classification_id, direction,
                 condition_type, condition_config, applies_to_flows,
                 resolved_intent_id, resolved_domain,
                 explanation_template, confidence, priority, effective_from, status, created_by)
            SELECT v_tenant.tenant_id, 'COMMODITY_CATEGORY', v_cc_it_sw, 'INBOUND',
                   'AMOUNT_ABOVE', '{"threshold":25000}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_capex_it_lic, 'CAPEX',
                   'Large perpetual license above 25,000 threshold — capitalised', 0.88, 20,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id AND classification_source = 'COMMODITY_CATEGORY' AND classification_id = v_cc_it_sw
                   AND condition_type = 'AMOUNT_ABOVE' AND resolved_intent_id = v_bi_capex_it_lic);
        END IF;

        IF v_cc_it_sw IS NOT NULL AND v_bi_opex_it IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id, classification_source, classification_id, direction,
                 condition_type, condition_config, applies_to_flows,
                 resolved_intent_id, resolved_domain,
                 explanation_template, confidence, priority, effective_from, status, created_by)
            SELECT v_tenant.tenant_id, 'COMMODITY_CATEGORY', v_cc_it_sw, 'INBOUND',
                   'FALLBACK', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_opex_it, 'OPEX',
                   'Software / SaaS — expensed as IT OPEX', 0.80, 500,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id AND classification_source = 'COMMODITY_CATEGORY' AND classification_id = v_cc_it_sw
                   AND condition_type = 'FALLBACK' AND resolved_intent_id = v_bi_opex_it);
        END IF;

        FOREACH v_cc_cur IN ARRAY ARRAY[v_cc_it_svc, v_cc_it_cloud, v_cc_it_sec] LOOP
            CONTINUE WHEN v_cc_cur IS NULL OR v_bi_opex_it IS NULL;
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id, classification_source, classification_id, direction,
                 condition_type, condition_config, applies_to_flows,
                 resolved_intent_id, resolved_domain,
                 explanation_template, confidence, priority, effective_from, status, created_by)
            SELECT v_tenant.tenant_id, 'COMMODITY_CATEGORY', v_cc_cur, 'INBOUND',
                   'FALLBACK', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_opex_it, 'OPEX',
                   'IT services / cloud / security — OPEX', 0.85, 500,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id AND classification_source = 'COMMODITY_CATEGORY' AND classification_id = v_cc_cur
                   AND condition_type = 'FALLBACK' AND resolved_intent_id = v_bi_opex_it);
        END LOOP;

        -- SC-PROF-CONSULT: cross-border priority rule triggers WHT withholding downstream.
        IF v_cc_prof_consult IS NOT NULL AND v_bi_opex_consult_xb IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id, classification_source, classification_id, direction,
                 condition_type, condition_config, applies_to_flows,
                 resolved_intent_id, resolved_domain,
                 explanation_template, confidence, priority, effective_from, status, created_by)
            SELECT v_tenant.tenant_id, 'COMMODITY_CATEGORY', v_cc_prof_consult, 'INBOUND',
                   'CROSS_BORDER', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_opex_consult_xb, 'OPEX',
                   'Cross-border consulting — WHT withholding may apply', 0.90, 10,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id AND classification_source = 'COMMODITY_CATEGORY' AND classification_id = v_cc_prof_consult
                   AND condition_type = 'CROSS_BORDER' AND resolved_intent_id = v_bi_opex_consult_xb);
        END IF;

        IF v_cc_prof_consult IS NOT NULL AND v_bi_opex_consult IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id, classification_source, classification_id, direction,
                 condition_type, condition_config, applies_to_flows,
                 resolved_intent_id, resolved_domain,
                 explanation_template, confidence, priority, effective_from, status, created_by)
            SELECT v_tenant.tenant_id, 'COMMODITY_CATEGORY', v_cc_prof_consult, 'INBOUND',
                   'FALLBACK', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_opex_consult, 'OPEX',
                   'Management consulting — operating expense', 0.88, 500,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id AND classification_source = 'COMMODITY_CATEGORY' AND classification_id = v_cc_prof_consult
                   AND condition_type = 'FALLBACK' AND resolved_intent_id = v_bi_opex_consult);
        END IF;

        IF v_cc_prof_legal IS NOT NULL AND v_bi_opex_legal IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id, classification_source, classification_id, direction,
                 condition_type, condition_config, applies_to_flows,
                 resolved_intent_id, resolved_domain,
                 explanation_template, confidence, priority, effective_from, status, created_by)
            SELECT v_tenant.tenant_id, 'COMMODITY_CATEGORY', v_cc_prof_legal, 'INBOUND',
                   'FALLBACK', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_opex_legal, 'OPEX',
                   'Legal services — operating expense', 0.88, 500,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id AND classification_source = 'COMMODITY_CATEGORY' AND classification_id = v_cc_prof_legal
                   AND condition_type = 'FALLBACK' AND resolved_intent_id = v_bi_opex_legal);
        END IF;

        IF v_cc_prof_audit IS NOT NULL AND v_bi_reg_audit IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id, classification_source, classification_id, direction,
                 condition_type, condition_config, applies_to_flows,
                 resolved_intent_id, resolved_domain,
                 explanation_template, confidence, priority, effective_from, status, created_by)
            SELECT v_tenant.tenant_id, 'COMMODITY_CATEGORY', v_cc_prof_audit, 'INBOUND',
                   'FALLBACK', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_reg_audit, 'REGULATORY',
                   'External audit — regulatory classification', 0.90, 500,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id AND classification_source = 'COMMODITY_CATEGORY' AND classification_id = v_cc_prof_audit
                   AND condition_type = 'FALLBACK' AND resolved_intent_id = v_bi_reg_audit);
        END IF;

        IF v_cc_prof_eng IS NOT NULL AND v_bi_opex_consult IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id, classification_source, classification_id, direction,
                 condition_type, condition_config, applies_to_flows,
                 resolved_intent_id, resolved_domain,
                 explanation_template, confidence, priority, effective_from, status, created_by)
            SELECT v_tenant.tenant_id, 'COMMODITY_CATEGORY', v_cc_prof_eng, 'INBOUND',
                   'FALLBACK', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_opex_consult, 'OPEX',
                   'Engineering consulting — operating expense', 0.85, 500,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id AND classification_source = 'COMMODITY_CATEGORY' AND classification_id = v_cc_prof_eng
                   AND condition_type = 'FALLBACK' AND resolved_intent_id = v_bi_opex_consult);
        END IF;

        IF v_cc_fac_rent    IS NOT NULL AND v_bi_opex_fac_rent  IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id,classification_source,classification_id,direction,condition_type,condition_config,applies_to_flows,resolved_intent_id,resolved_domain,explanation_template,confidence,priority,effective_from,status,created_by)
            SELECT v_tenant.tenant_id,'COMMODITY_CATEGORY',v_cc_fac_rent,'INBOUND','IS_RECURRING','{}'::jsonb,ARRAY['NON_PO','DIRECT_PURCHASE'],v_bi_opex_fac_rent,'OPEX','Recurring rent/lease payment — OPEX',0.95,10,CURRENT_DATE,'active',v_sys
            WHERE NOT EXISTS(SELECT 1 FROM control.commodity_classification_to_intent_rule WHERE tenant_id=v_tenant.tenant_id AND classification_source='COMMODITY_CATEGORY' AND classification_id=v_cc_fac_rent AND condition_type='IS_RECURRING' AND resolved_intent_id=v_bi_opex_fac_rent);

            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id,classification_source,classification_id,direction,condition_type,condition_config,applies_to_flows,resolved_intent_id,resolved_domain,explanation_template,confidence,priority,effective_from,status,created_by)
            SELECT v_tenant.tenant_id,'COMMODITY_CATEGORY',v_cc_fac_rent,'INBOUND','FALLBACK','{}'::jsonb,ARRAY['NON_PO','DIRECT_PURCHASE'],v_bi_opex_fac_rent,'OPEX','Rent & occupancy — OPEX',0.88,500,CURRENT_DATE,'active',v_sys
            WHERE NOT EXISTS(SELECT 1 FROM control.commodity_classification_to_intent_rule WHERE tenant_id=v_tenant.tenant_id AND classification_source='COMMODITY_CATEGORY' AND classification_id=v_cc_fac_rent AND condition_type='FALLBACK' AND resolved_intent_id=v_bi_opex_fac_rent);
        END IF;

        IF v_cc_fac_maint    IS NOT NULL AND v_bi_opex_fac_maint IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id,classification_source,classification_id,direction,condition_type,condition_config,applies_to_flows,resolved_intent_id,resolved_domain,explanation_template,confidence,priority,effective_from,status,created_by)
            SELECT v_tenant.tenant_id,'COMMODITY_CATEGORY',v_cc_fac_maint,'INBOUND','FALLBACK','{}'::jsonb,ARRAY['NON_PO','DIRECT_PURCHASE'],v_bi_opex_fac_maint,'OPEX','Facility maintenance — OPEX',0.88,500,CURRENT_DATE,'active',v_sys
            WHERE NOT EXISTS(SELECT 1 FROM control.commodity_classification_to_intent_rule WHERE tenant_id=v_tenant.tenant_id AND classification_source='COMMODITY_CATEGORY' AND classification_id=v_cc_fac_maint AND condition_type='FALLBACK' AND resolved_intent_id=v_bi_opex_fac_maint);
        END IF;

        IF v_cc_office_sup   IS NOT NULL AND v_bi_opex_office    IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id,classification_source,classification_id,direction,condition_type,condition_config,applies_to_flows,resolved_intent_id,resolved_domain,explanation_template,confidence,priority,effective_from,status,created_by)
            SELECT v_tenant.tenant_id,'COMMODITY_CATEGORY',v_cc_office_sup,'INBOUND','FALLBACK','{}'::jsonb,ARRAY['NON_PO','DIRECT_PURCHASE'],v_bi_opex_office,'OPEX','Office supplies — OPEX',0.90,500,CURRENT_DATE,'active',v_sys
            WHERE NOT EXISTS(SELECT 1 FROM control.commodity_classification_to_intent_rule WHERE tenant_id=v_tenant.tenant_id AND classification_source='COMMODITY_CATEGORY' AND classification_id=v_cc_office_sup AND condition_type='FALLBACK' AND resolved_intent_id=v_bi_opex_office);
        END IF;

        IF v_cc_mktg_digital IS NOT NULL AND v_bi_opex_mktg      IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id,classification_source,classification_id,direction,condition_type,condition_config,applies_to_flows,resolved_intent_id,resolved_domain,explanation_template,confidence,priority,effective_from,status,created_by)
            SELECT v_tenant.tenant_id,'COMMODITY_CATEGORY',v_cc_mktg_digital,'INBOUND','FALLBACK','{}'::jsonb,ARRAY['NON_PO','DIRECT_PURCHASE'],v_bi_opex_mktg,'OPEX','Digital marketing — OPEX',0.88,500,CURRENT_DATE,'active',v_sys
            WHERE NOT EXISTS(SELECT 1 FROM control.commodity_classification_to_intent_rule WHERE tenant_id=v_tenant.tenant_id AND classification_source='COMMODITY_CATEGORY' AND classification_id=v_cc_mktg_digital AND condition_type='FALLBACK' AND resolved_intent_id=v_bi_opex_mktg);
        END IF;

        IF v_cc_travel_air   IS NOT NULL AND v_bi_opex_travel     IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id,classification_source,classification_id,direction,condition_type,condition_config,applies_to_flows,resolved_intent_id,resolved_domain,explanation_template,confidence,priority,effective_from,status,created_by)
            SELECT v_tenant.tenant_id,'COMMODITY_CATEGORY',v_cc_travel_air,'INBOUND','FALLBACK','{}'::jsonb,ARRAY['NON_PO','DIRECT_PURCHASE'],v_bi_opex_travel,'OPEX','Air travel — OPEX',0.90,500,CURRENT_DATE,'active',v_sys
            WHERE NOT EXISTS(SELECT 1 FROM control.commodity_classification_to_intent_rule WHERE tenant_id=v_tenant.tenant_id AND classification_source='COMMODITY_CATEGORY' AND classification_id=v_cc_travel_air AND condition_type='FALLBACK' AND resolved_intent_id=v_bi_opex_travel);
        END IF;

        IF v_cc_freight  IS NOT NULL AND v_bi_cogs_freight IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id,classification_source,classification_id,direction,condition_type,condition_config,applies_to_flows,resolved_intent_id,resolved_domain,explanation_template,confidence,priority,effective_from,status,created_by)
            SELECT v_tenant.tenant_id,'COMMODITY_CATEGORY',v_cc_freight,'INBOUND','FALLBACK','{}'::jsonb,ARRAY['NON_PO','DIRECT_PURCHASE'],v_bi_cogs_freight,'COST_OF_SALES','Inbound freight — cost of sales',0.88,500,CURRENT_DATE,'active',v_sys
            WHERE NOT EXISTS(SELECT 1 FROM control.commodity_classification_to_intent_rule WHERE tenant_id=v_tenant.tenant_id AND classification_source='COMMODITY_CATEGORY' AND classification_id=v_cc_freight AND condition_type='FALLBACK' AND resolved_intent_id=v_bi_cogs_freight);
        END IF;

        IF v_cc_capequip IS NOT NULL AND v_bi_capex_equip  IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id,classification_source,classification_id,direction,condition_type,condition_config,applies_to_flows,resolved_intent_id,resolved_domain,explanation_template,confidence,priority,effective_from,status,created_by)
            SELECT v_tenant.tenant_id,'COMMODITY_CATEGORY',v_cc_capequip,'INBOUND','FALLBACK','{}'::jsonb,ARRAY['NON_PO','DIRECT_PURCHASE'],v_bi_capex_equip,'CAPEX','Capital equipment — CAPEX',0.92,500,CURRENT_DATE,'active',v_sys
            WHERE NOT EXISTS(SELECT 1 FROM control.commodity_classification_to_intent_rule WHERE tenant_id=v_tenant.tenant_id AND classification_source='COMMODITY_CATEGORY' AND classification_id=v_cc_capequip AND condition_type='FALLBACK' AND resolved_intent_id=v_bi_capex_equip);
        END IF;

        IF v_cc_raw    IS NOT NULL AND v_bi_cogs_raw     IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id,classification_source,classification_id,direction,condition_type,condition_config,applies_to_flows,resolved_intent_id,resolved_domain,explanation_template,confidence,priority,effective_from,status,created_by)
            SELECT v_tenant.tenant_id,'COMMODITY_CATEGORY',v_cc_raw,'INBOUND','FALLBACK','{}'::jsonb,ARRAY['NON_PO','DIRECT_PURCHASE'],v_bi_cogs_raw,'COST_OF_SALES','Raw materials — cost of sales',0.90,500,CURRENT_DATE,'active',v_sys
            WHERE NOT EXISTS(SELECT 1 FROM control.commodity_classification_to_intent_rule WHERE tenant_id=v_tenant.tenant_id AND classification_source='COMMODITY_CATEGORY' AND classification_id=v_cc_raw AND condition_type='FALLBACK' AND resolved_intent_id=v_bi_cogs_raw);
        END IF;

        IF v_cc_tax    IS NOT NULL AND v_bi_reg_tax      IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id,classification_source,classification_id,direction,condition_type,condition_config,applies_to_flows,resolved_intent_id,resolved_domain,explanation_template,confidence,priority,effective_from,status,created_by)
            SELECT v_tenant.tenant_id,'COMMODITY_CATEGORY',v_cc_tax,'INBOUND','FALLBACK','{}'::jsonb,ARRAY['NON_PO','DIRECT_PURCHASE'],v_bi_reg_tax,'REGULATORY','Taxes and duties — regulatory',0.90,500,CURRENT_DATE,'active',v_sys
            WHERE NOT EXISTS(SELECT 1 FROM control.commodity_classification_to_intent_rule WHERE tenant_id=v_tenant.tenant_id AND classification_source='COMMODITY_CATEGORY' AND classification_id=v_cc_tax AND condition_type='FALLBACK' AND resolved_intent_id=v_bi_reg_tax);
        END IF;

        IF v_cc_outsrc IS NOT NULL AND v_bi_transfer_ic  IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id,classification_source,classification_id,direction,condition_type,condition_config,applies_to_flows,resolved_intent_id,resolved_domain,explanation_template,confidence,priority,effective_from,status,created_by)
            SELECT v_tenant.tenant_id,'COMMODITY_CATEGORY',v_cc_outsrc,'INBOUND','FALLBACK','{}'::jsonb,ARRAY['NON_PO','DIRECT_PURCHASE'],v_bi_transfer_ic,'TRANSFER','Outsourced/shared services — intercompany transfer',0.85,500,CURRENT_DATE,'active',v_sys
            WHERE NOT EXISTS(SELECT 1 FROM control.commodity_classification_to_intent_rule WHERE tenant_id=v_tenant.tenant_id AND classification_source='COMMODITY_CATEGORY' AND classification_id=v_cc_outsrc AND condition_type='FALLBACK' AND resolved_intent_id=v_bi_transfer_ic);
        END IF;

        IF v_cc_subs   IS NOT NULL AND v_bi_opex_subs    IS NOT NULL THEN
            INSERT INTO control.commodity_classification_to_intent_rule
                (tenant_id,classification_source,classification_id,direction,condition_type,condition_config,applies_to_flows,resolved_intent_id,resolved_domain,explanation_template,confidence,priority,effective_from,status,created_by)
            SELECT v_tenant.tenant_id,'COMMODITY_CATEGORY',v_cc_subs,'INBOUND','FALLBACK','{}'::jsonb,ARRAY['NON_PO','DIRECT_PURCHASE'],v_bi_opex_subs,'OPEX','Subscriptions and memberships — OPEX',0.88,500,CURRENT_DATE,'active',v_sys
            WHERE NOT EXISTS(SELECT 1 FROM control.commodity_classification_to_intent_rule WHERE tenant_id=v_tenant.tenant_id AND classification_source='COMMODITY_CATEGORY' AND classification_id=v_cc_subs AND condition_type='FALLBACK' AND resolved_intent_id=v_bi_opex_subs);
        END IF;

    END LOOP;

    RAISE NOTICE '061_min_intake_rules: Phase 1b seed complete for tenant %.', v_tid;
END $seed_min_intake$;


-- Guard: every seeded category MUST have ≥1 active intent rule.
DO $verify_intake_rules$
DECLARE
    v_missing int := 0;
    v_code    text;
BEGIN
    FOR v_code IN SELECT unnest(ARRAY[
        'SC-IT-HW','SC-IT-SW','SC-IT-SVC','SC-IT-CLOUD','SC-IT-SEC',
        'SC-PROF-CONSULT','SC-PROF-LEGAL','SC-PROF-AUDIT','SC-PROF-ENG',
        'SC-FAC-RENT','SC-FAC-MAINT','SC-OFFICE-SUP',
        'SC-MKTG-DIGITAL','SC-TRAVEL-AIR',
        'SC-FREIGHT','SC-CAPEQUIP',
        'SC-RAW','SC-SUBS'
    ]) LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM   master.commodity_category sc
            JOIN   control.commodity_classification_to_intent_rule r
                   ON r.classification_id = sc.id AND r.classification_source = 'COMMODITY_CATEGORY' AND r.status = 'active'
            WHERE  sc.code = v_code
        ) THEN
            v_missing := v_missing + 1;
            RAISE WARNING '061 verify: no active rule for category %', v_code;
        END IF;
    END LOOP;

    IF v_missing > 0 THEN
        RAISE EXCEPTION '061_min_intake_rules verification failed: % categories have no active intent rule', v_missing;
    END IF;

    RAISE NOTICE '061_min_intake_rules VERIFIED: all target categories have active classification→intent rules.';
END $verify_intake_rules$;
