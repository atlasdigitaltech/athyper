/* ============================================================================
   Athyper v2.1 — Financial Engine Seed Data (Base)
   Dependencies: All fin.* and evt.* tables, core.tenant
   Note: COA, fiscal periods, and tax moved to 292/293/295 respectively.
   ============================================================================ */

DO $$
DECLARE
    v_tenant uuid;
    v_code   text;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- ====================================================================
        -- Business Intents (identical across all blueprints)
        -- ====================================================================
        INSERT INTO fin.business_intent (id, tenant_id, code, name, domain, subtype, requires_approval, visibility, sort_order)
        VALUES
            -- OPEX Intents
            (gen_random_uuid(), v_tenant, 'OPEX-GENERAL',     'General Operating Expense',        'OPEX',       'GENERAL',      true,  'STANDARD', 10),
            (gen_random_uuid(), v_tenant, 'OPEX-TRAVEL',      'Travel & Entertainment',           'OPEX',       'TRAVEL',       true,  'STANDARD', 20),
            (gen_random_uuid(), v_tenant, 'OPEX-IT',          'IT & Technology',                  'OPEX',       'TECHNOLOGY',   true,  'STANDARD', 30),
            (gen_random_uuid(), v_tenant, 'OPEX-FACILITIES',  'Facilities & Maintenance',         'OPEX',       'FACILITIES',   true,  'STANDARD', 40),
            (gen_random_uuid(), v_tenant, 'OPEX-PROFESSIONAL','Professional Services',            'OPEX',       'PROFESSIONAL', true,  'STANDARD', 50),
            (gen_random_uuid(), v_tenant, 'OPEX-MARKETING',   'Marketing & Advertising',          'OPEX',       'MARKETING',    true,  'STANDARD', 60),
            (gen_random_uuid(), v_tenant, 'OPEX-HR',          'Human Resources',                  'OPEX',       'HR',           true,  'STANDARD', 70),
            (gen_random_uuid(), v_tenant, 'OPEX-INSURANCE',   'Insurance & Risk Management',      'OPEX',       'INSURANCE',    true,  'STANDARD', 80),
            -- CAPEX Intents
            (gen_random_uuid(), v_tenant, 'CAPEX-EQUIPMENT',  'Equipment Acquisition',            'CAPEX',      'EQUIPMENT',    true,  'STANDARD', 100),
            (gen_random_uuid(), v_tenant, 'CAPEX-IT',         'IT Infrastructure Investment',     'CAPEX',      'TECHNOLOGY',   true,  'STANDARD', 110),
            (gen_random_uuid(), v_tenant, 'CAPEX-FACILITIES', 'Facility Construction/Renovation', 'CAPEX',      'FACILITIES',   true,  'STANDARD', 120),
            (gen_random_uuid(), v_tenant, 'CAPEX-VEHICLE',    'Vehicle Acquisition',              'CAPEX',      'VEHICLE',      true,  'STANDARD', 130),
            (gen_random_uuid(), v_tenant, 'CAPEX-INTANGIBLE', 'Intangible Asset Acquisition',     'CAPEX',      'INTANGIBLE',   true,  'STANDARD', 140),
            -- REVENUE Intents
            (gen_random_uuid(), v_tenant, 'REV-SALES',        'Product Sales Revenue',            'REVENUE',    'PRODUCT',      false, 'STANDARD', 200),
            (gen_random_uuid(), v_tenant, 'REV-SERVICE',      'Service Revenue',                  'REVENUE',    'SERVICE',      false, 'STANDARD', 210),
            (gen_random_uuid(), v_tenant, 'REV-SUBSCRIPTION', 'Subscription Revenue',             'REVENUE',    'SUBSCRIPTION', false, 'STANDARD', 220),
            -- TRANSFER Intents
            (gen_random_uuid(), v_tenant, 'XFER-IC',          'Intercompany Transfer',            'TRANSFER',   'INTERCOMPANY', true,  'RESTRICTED',  300),
            (gen_random_uuid(), v_tenant, 'XFER-FUND',        'Fund Transfer',                    'TRANSFER',   'FUND',         true,  'RESTRICTED', 310),
            -- REGULATORY Intents
            (gen_random_uuid(), v_tenant, 'REG-TAX',          'Tax Payment & Filing',             'REGULATORY', 'TAX',          true,  'RESTRICTED', 400),
            (gen_random_uuid(), v_tenant, 'REG-COMPLIANCE',   'Regulatory Compliance',            'REGULATORY', 'COMPLIANCE',   true,  'RESTRICTED',  410),
            -- ADMIN Intents
            (gen_random_uuid(), v_tenant, 'ADMIN-ADJUSTMENT', 'Journal Adjustment',               'ADMIN',      'ADJUSTMENT',   true,  'RESTRICTED',  500),
            (gen_random_uuid(), v_tenant, 'ADMIN-RECLASSIFY', 'Account Reclassification',         'ADMIN',      'RECLASS',      true,  'RESTRICTED',  510)
        ON CONFLICT (tenant_id, code) DO UPDATE SET updated_at = now();

        -- ====================================================================
        -- Default Policy Modules (identical across all blueprints)
        -- ====================================================================
        INSERT INTO fin.policy_module (id, tenant_id, module_id, module_name, module_version, scope, status, config_hash, config, is_extensible)
        VALUES
            (gen_random_uuid(), v_tenant, 'POL-SPEND',    'Spend Policy',              'v1.0', 'Amount thresholds and approval routing based on transaction value',                  'ACTIVE', 'initial', '{"thresholds": [{"max": 1000, "action": "APPROVE"}, {"max": 10000, "action": "REVIEW"}, {"max": 50000, "action": "ESCALATE"}, {"max": null, "action": "BLOCK"}]}', true),
            (gen_random_uuid(), v_tenant, 'POL-VENDOR',   'Vendor Policy',             'v1.0', 'Vendor compliance, approved vendor lists, new vendor review requirements',           'ACTIVE', 'initial', '{"requireApprovedVendor": true, "newVendorRequiresReview": true, "blockedVendorAction": "BLOCK"}', true),
            (gen_random_uuid(), v_tenant, 'POL-BUDGET',   'Budget Policy',             'v1.0', 'Funding profile health checks: RED/BLACK state handling, soft/hard limits',          'ACTIVE', 'initial', '{"redStateAction": "ESCALATE", "blackStateAction": "BLOCK", "yellowWarningEnabled": true}', true),
            (gen_random_uuid(), v_tenant, 'POL-CATEGORY', 'Category Policy',           'v1.0', 'Category-specific rules: restricted categories, required documentation',             'ACTIVE', 'initial', '{"restrictedCategories": ["CAPEX-INTANGIBLE"], "requireDocumentation": true}', true),
            (gen_random_uuid(), v_tenant, 'POL-SOD',      'Segregation of Duties',     'v1.0', 'Prevent same user from both requesting and approving a transaction',                 'ACTIVE', 'initial', '{"enabled": true, "exemptRoles": ["SYSTEM_ADMIN"]}', false),
            (gen_random_uuid(), v_tenant, 'POL-TEMPORAL',  'Temporal Policy',           'v1.0', 'Time-based rules: fiscal year-end blackout, weekend restrictions, holiday checks',   'ACTIVE', 'initial', '{"yearEndBlackout": true, "blackoutStartDay": 25, "blackoutStartMonth": 12, "weekendRestriction": false}', true),
            (gen_random_uuid(), v_tenant, 'POL-GEO',      'Geographic Policy',         'v1.0', 'Jurisdiction and sanctions compliance, export controls',                              'ACTIVE', 'initial', '{"sanctionedCountries": [], "exportControlEnabled": false}', true),
            (gen_random_uuid(), v_tenant, 'POL-CONTRACT',  'Contract Policy',           'v1.0', 'Contract value thresholds, legal review requirements, term limits',                  'ACTIVE', 'initial', '{"legalReviewAbove": 100000, "maxTermYears": 5, "autoRenewRequiresApproval": true}', true)
        ON CONFLICT (tenant_id, module_id, module_version) DO UPDATE SET updated_at = now();

        -- ====================================================================
        -- Default Smart Default Rules
        -- ====================================================================
        -- smart_default_rule has no unique constraint; guard via existence check
        IF NOT EXISTS (SELECT 1 FROM fin.smart_default_rule WHERE tenant_id = v_tenant AND field_name = 'gl_account') THEN
            INSERT INTO fin.smart_default_rule (id, tenant_id, field_name, source, method, priority, conditions, resolution, is_active)
            VALUES
                (gen_random_uuid(), v_tenant, 'gl_account',     'intent+category',    'RULES_ENGINE',  10, '{}', '{"lookupTable": "business_intent", "field": "default_gl_account"}', true),
                (gen_random_uuid(), v_tenant, 'cost_center',    'ou_mapping',         'DIRECT_LOOKUP', 20, '{}', '{"lookupTable": "operating_unit", "field": "default_cost_center_id"}', true),
                (gen_random_uuid(), v_tenant, 'profit_center',  'ou_mapping',         'DIRECT_LOOKUP', 20, '{}', '{"lookupTable": "operating_unit", "field": "default_profit_center_id"}', true),
                (gen_random_uuid(), v_tenant, 'fund_center',    'ou+intent',          'RULES_ENGINE',  10, '{}', '{"lookupTable": "ou_intent_mapping", "field": "override_fp_id", "fallback": "operating_unit.default_fp_id"}', true),
                (gen_random_uuid(), v_tenant, 'tax_code',       'intent+jurisdiction','RULES_ENGINE',  10, '{}', '{"lookupTable": "business_intent", "field": "default_tax_code", "jurisdictionOverride": true}', true),
                (gen_random_uuid(), v_tenant, 'currency_code',  'ou_default',         'DIRECT_LOOKUP', 30, '{}', '{"lookupTable": "operating_unit", "field": "default_currency_code"}', true);
        END IF;

        -- Rule 7: Spend category -> intent resolution (highest priority)
        IF NOT EXISTS (SELECT 1 FROM fin.smart_default_rule WHERE tenant_id = v_tenant AND field_name = 'intent') THEN
            INSERT INTO fin.smart_default_rule (id, tenant_id, field_name, source, method, priority, conditions, resolution, is_active)
            VALUES
                (gen_random_uuid(), v_tenant, 'intent',
                    'category+context', 'RULES_ENGINE', 5, '{}'::jsonb,
                    '{"lookupTable": "category_intent_rule", "evaluateConditions": true, "fallback": "spend_category.default_intent_id"}'::jsonb,
                    true),
                (gen_random_uuid(), v_tenant, 'domain',
                    'category+amount', 'RULES_ENGINE', 5, '{}'::jsonb,
                    '{"method": "capitalization_threshold", "source": "spend_category", "aboveThreshold": "CAPEX", "belowThreshold": "OPEX"}'::jsonb,
                    true),
                (gen_random_uuid(), v_tenant, 'hs_code',
                    'commodity+crosswalk', 'RULES_ENGINE', 10, '{}'::jsonb,
                    '{"lookupTable": "commodity_crosswalk", "source_domain": "unspsc", "target_domain": "hs", "minConfidence": 80}'::jsonb,
                    true),
                (gen_random_uuid(), v_tenant, 'classification_required',
                    'policy+category', 'RULES_ENGINE', 1, '{}'::jsonb,
                    '{"sources": ["ou.require_classification", "category.classification_required", "config.require_for_capex_above", "cross_border"]}'::jsonb,
                    true);
        END IF;

        -- ====================================================================
        -- Default Projection Registry (Event Store)
        -- ====================================================================
        INSERT INTO evt.projection_registry (id, tenant_id, projection_id, owning_engine, projection_version, source_event_types, partition_domains, checkpoint_strategy, rebuild_strategy, consistency_model, is_active)
        VALUES
            (gen_random_uuid(), v_tenant, 'gl-balance',              'posting-engine',     'v1.0', ARRAY['je.posted','je.reversed'],                                               ARRAY['COMMITMENT_FLOW','FUNDING_FLOW'],  'SEQUENCE_NO', 'SNAPSHOT_AND_CATCHUP', 'BOUNDED_STALENESS', true),
            (gen_random_uuid(), v_tenant, 'funding-profile-state',   'budget-engine',      'v1.0', ARRAY['fp.reserved','fp.committed','fp.consumed','fp.released'],                 ARRAY['FUNDING_FLOW'],                    'SEQUENCE_NO', 'SNAPSHOT_AND_CATCHUP', 'BOUNDED_STALENESS', true),
            (gen_random_uuid(), v_tenant, 'commitment-lifecycle',    'commitment-engine',  'v1.0', ARRAY['commitment.created','commitment.fulfilled','commitment.cancelled'],        ARRAY['COMMITMENT_FLOW'],                 'SEQUENCE_NO', 'SNAPSHOT_AND_CATCHUP', 'BOUNDED_STALENESS', true),
            (gen_random_uuid(), v_tenant, 'inventory-balance',       'inventory-engine',   'v1.0', ARRAY['inv.received','inv.issued','inv.transferred','inv.adjusted'],              ARRAY['INVENTORY_FLOW'],                  'SEQUENCE_NO', 'SNAPSHOT_AND_CATCHUP', 'BOUNDED_STALENESS', true),
            (gen_random_uuid(), v_tenant, 'asset-register',          'asset-engine',       'v1.0', ARRAY['asset.capitalized','asset.depreciated','asset.disposed'],                  ARRAY['ASSET_FLOW'],                      'SEQUENCE_NO', 'SNAPSHOT_AND_CATCHUP', 'BOUNDED_STALENESS', true),
            (gen_random_uuid(), v_tenant, 'commission-accrual',      'commission-engine',  'v1.0', ARRAY['comm.calculated','comm.accrued','comm.settled','comm.clawed_back'],         ARRAY['COMMISSION_FLOW'],                 'SEQUENCE_NO', 'SNAPSHOT_AND_CATCHUP', 'BOUNDED_STALENESS', true),
            (gen_random_uuid(), v_tenant, 'ic-netting',              'federation-engine',  'v1.0', ARRAY['ic.order_created','ic.mirror_created','ic.netted'],                        ARRAY['IC_FLOW'],                         'SEQUENCE_NO', 'SNAPSHOT_AND_CATCHUP', 'BOUNDED_STALENESS', true),
            (gen_random_uuid(), v_tenant, 'wip-accumulation',        'production-engine',  'v1.0', ARRAY['wo.material_issued','wo.labor_confirmed','wo.overhead_absorbed'],           ARRAY['WORKORDER_FLOW'],                  'SEQUENCE_NO', 'SNAPSHOT_AND_CATCHUP', 'BOUNDED_STALENESS', true)
        ON CONFLICT (tenant_id, projection_id) DO UPDATE SET updated_at = now();

        RAISE NOTICE 'Financial base seed data inserted for tenant %', v_code;
    END LOOP;
END $$;
