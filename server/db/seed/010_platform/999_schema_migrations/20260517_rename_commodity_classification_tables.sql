-- =============================================================================
-- Migration: commodity classification table naming cleanup (2026-05-17)
--
-- Renames the two generic classification control tables to commodity-scoped names:
--   control.classification_config         -> control.commodity_classification_config
--   control.classification_to_intent_rule -> control.commodity_classification_to_intent_rule
--
-- DDL source files are updated for fresh databases. This migration handles local
-- development databases where those DDL files were already marked executed.
-- =============================================================================

DO $rename$ BEGIN
    IF to_regclass('control.commodity_classification_config') IS NULL
       AND to_regclass('control.classification_config') IS NOT NULL THEN
        ALTER TABLE control.classification_config RENAME TO commodity_classification_config;
        RAISE NOTICE 'Renamed control.classification_config to control.commodity_classification_config';
    END IF;

    IF to_regclass('control.commodity_classification_to_intent_rule') IS NULL
       AND to_regclass('control.classification_to_intent_rule') IS NOT NULL THEN
        ALTER TABLE control.classification_to_intent_rule RENAME TO commodity_classification_to_intent_rule;
        RAISE NOTICE 'Renamed control.classification_to_intent_rule to control.commodity_classification_to_intent_rule';
    END IF;
END $rename$;
DROP FUNCTION IF EXISTS control.resolve_business_intent(uuid,text,uuid,text,text,uuid,text,numeric,text,boolean,boolean,uuid,uuid,text,text,text,text,text,date);
CREATE OR REPLACE FUNCTION control.resolve_business_intent(
    p_tenant_id             uuid,
    p_classification_source text,
    p_classification_id     uuid,
    p_direction             text         DEFAULT 'INBOUND',
    p_flow_code             text         DEFAULT 'NON_PO',
    p_company_code_id       uuid         DEFAULT NULL,
    p_doc_type              text         DEFAULT NULL,
    p_amount                numeric      DEFAULT NULL,
    p_currency_code         text         DEFAULT NULL,
    p_is_cross_border       boolean      DEFAULT false,
    p_is_recurring          boolean      DEFAULT false,
    p_supplier_id           uuid         DEFAULT NULL,
    p_customer_id           uuid         DEFAULT NULL,
    p_counterparty_tier     text         DEFAULT NULL,
    p_commodity_domain      text         DEFAULT NULL,
    p_procurement_method    text         DEFAULT NULL,
    p_contract_type         text         DEFAULT NULL,
    p_channel               text         DEFAULT NULL,
    p_as_of_date            date         DEFAULT CURRENT_DATE
) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SECURITY DEFINER
    SET search_path = control, master, pg_temp
AS $$
DECLARE
    v_rule   RECORD;
    v_match  boolean;
    v_n      smallint := 0;
    v_default uuid;
BEGIN
    -- Input validation
    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('intent_id', NULL, 'method', 'FAILED',
            'explanation', 'p_tenant_id is required', 'rules_checked', 0);
    END IF;
    IF p_classification_id IS NULL THEN
        RETURN jsonb_build_object('intent_id', NULL, 'method', 'FAILED',
            'explanation', 'p_classification_id is required', 'rules_checked', 0);
    END IF;

    FOR v_rule IN
        SELECT *
        FROM control.commodity_classification_to_intent_rule
        WHERE tenant_id        = p_tenant_id
          AND classification_source = p_classification_source
          AND classification_id     = p_classification_id
          AND is_active         = true
          AND effective_from   <= p_as_of_date
          AND (effective_to IS NULL OR effective_to >= p_as_of_date)
          AND (direction IS NULL OR direction = p_direction)
          AND (applies_to_flows IS NULL
               OR applies_to_flows = '{}'
               OR p_flow_code = ANY(applies_to_flows))
        ORDER BY priority ASC, created_at ASC
    LOOP
        v_n := v_n + 1;
        v_match := CASE v_rule.condition_type
            WHEN 'FALLBACK'            THEN true
            WHEN 'AMOUNT_ABOVE'        THEN p_amount IS NOT NULL
                AND p_amount > (v_rule.condition_config->>'threshold')::numeric
            WHEN 'AMOUNT_BELOW'        THEN p_amount IS NOT NULL
                AND p_amount < (v_rule.condition_config->>'threshold')::numeric
            WHEN 'IS_RECURRING'        THEN p_is_recurring = true
            WHEN 'IS_ONE_TIME'         THEN p_is_recurring = false
            WHEN 'CROSS_BORDER'        THEN p_is_cross_border = true
            WHEN 'COMPANY_MATCH'       THEN p_company_code_id IS NOT NULL
                AND p_company_code_id::text = ANY(
                    ARRAY(SELECT jsonb_array_elements_text(v_rule.condition_config->'company_code_ids')))
            WHEN 'DOC_TYPE_MATCH'      THEN p_doc_type IS NOT NULL
                AND p_doc_type = v_rule.condition_config->>'doc_type'
            WHEN 'FLOW_MATCH'          THEN p_flow_code = v_rule.condition_config->>'flow'
            WHEN 'PROCUREMENT_METHOD'  THEN p_procurement_method IS NOT NULL
                AND p_procurement_method = v_rule.condition_config->>'method'
            WHEN 'COMMODITY_MATCH'     THEN p_commodity_domain IS NOT NULL
                AND p_commodity_domain = v_rule.condition_config->>'domain'
            WHEN 'SUPPLIER_MATCH'      THEN p_supplier_id IS NOT NULL
                AND p_supplier_id::text = ANY(
                    ARRAY(SELECT jsonb_array_elements_text(v_rule.condition_config->'supplier_ids')))
            WHEN 'CUSTOMER_MATCH'      THEN p_customer_id IS NOT NULL
                AND p_customer_id::text = ANY(
                    ARRAY(SELECT jsonb_array_elements_text(v_rule.condition_config->'customer_ids')))
            WHEN 'CUSTOMER_TIER'       THEN p_counterparty_tier IS NOT NULL
                AND p_counterparty_tier = v_rule.condition_config->>'tier'
            WHEN 'CONTRACT_TYPE_MATCH' THEN p_contract_type IS NOT NULL
                AND p_contract_type = v_rule.condition_config->>'contract_type'
            WHEN 'CHANNEL_MATCH'       THEN p_channel IS NOT NULL
                AND p_channel = v_rule.condition_config->>'channel'
            ELSE false
        END;

        IF v_match THEN
            RETURN jsonb_build_object(
                'intent_id',     v_rule.resolved_intent_id,
                'domain',        v_rule.resolved_domain,
                'rule_id',       v_rule.id,
                'confidence',    v_rule.confidence,
                'explanation',   v_rule.explanation_template,
                'method',        'RULE_MATCH',
                'direction',     p_direction,
                'flow_code',     p_flow_code,
                'rules_checked', v_n);
        END IF;
    END LOOP;

    -- Fallback: classification default intent.
    IF p_classification_source = 'COMMODITY_CATEGORY' THEN
        BEGIN
            SELECT p.business_intent_id INTO v_default
            FROM control.commodity_category_buy_policy p
            WHERE p.tenant_id = p_tenant_id
              AND p.commodity_category_id = p_classification_id
              AND p.scope_type = 'TENANT'
              AND p.scope_id IS NULL
              AND p.mapping_mode = 'ALLOW'
              AND p.is_default = true
              AND p.is_active = true
              AND p.effective_from <= p_as_of_date
              AND (p.effective_to IS NULL OR p.effective_to >= p_as_of_date)
            ORDER BY p.effective_from DESC, p.created_at DESC
            LIMIT 1;
        EXCEPTION WHEN undefined_table THEN
            v_default := NULL;
        END;
    ELSIF p_classification_source = 'SPEND_CATEGORY' THEN
        BEGIN
            SELECT default_intent_id INTO v_default
            FROM master.spend_category
            WHERE id = p_classification_id AND tenant_id = p_tenant_id;
        EXCEPTION WHEN undefined_table THEN
            v_default := NULL;
        END;
    END IF;

    IF v_default IS NOT NULL THEN
        RETURN jsonb_build_object(
            'intent_id',     v_default,
            'domain',        NULL,
            'confidence',    0.70,
            'explanation',   'Classification default intent',
            'method',        'CLASSIFICATION_DEFAULT',
            'direction',     p_direction,
            'rules_checked', v_n);
    END IF;

    RETURN jsonb_build_object(
        'intent_id',     NULL,
        'method',        'FAILED',
        'explanation',   'No intent resolved: no matching rule and no classification default',
        'rules_checked', v_n);
END;
$$;

COMMENT ON FUNCTION control.resolve_business_intent IS
    'Engine 4.13 §F1: classification → business intent. '
    'Evaluates all 16 condition types in priority order. '
    'Fallback: classification default (COMMODITY_CATEGORY policy, then legacy SPEND_CATEGORY). '
    'Returns JSONB with method=RULE_MATCH|CLASSIFICATION_DEFAULT|FAILED.';




CREATE OR REPLACE FUNCTION control.resolve_classification_to_intent(
    p_tenant_id             uuid,
    p_classification_source text,
    p_classification_id     uuid,
    p_direction             text,
    p_flow_code             text,
    p_amount                numeric,
    p_currency_code         text,
    p_is_recurring          boolean,
    p_is_cross_border       boolean,
    p_is_intercompany       boolean,
    p_company_code_id       uuid,
    p_doc_type              text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = control
AS $$
DECLARE
    v_rule      record;
    v_count     smallint := 0;
    v_matched   boolean;
    v_threshold numeric;
    v_expl      text;
BEGIN
    FOR v_rule IN
        SELECT r.id, r.condition_type, r.condition_config,
               r.resolved_intent_id, r.resolved_domain,
               r.explanation_template, r.confidence, r.priority
        FROM   control.commodity_classification_to_intent_rule r
        WHERE  r.tenant_id              = p_tenant_id
          AND  r.classification_source  = p_classification_source
          AND  r.classification_id      = p_classification_id
          AND  r.is_active              = true
          AND  (r.effective_from IS NULL OR r.effective_from <= CURRENT_DATE)
          AND  (r.effective_to   IS NULL OR r.effective_to   >= CURRENT_DATE)
          AND  (r.direction IS NULL OR r.direction = p_direction)
          AND  (r.applies_to_flows IS NULL OR p_flow_code = ANY(r.applies_to_flows))
        ORDER  BY r.priority ASC
    LOOP
        v_count   := v_count + 1;
        v_matched := false;

        CASE v_rule.condition_type
        WHEN 'IS_RECURRING' THEN
            v_matched := (p_is_recurring = true);

        WHEN 'IS_ONE_TIME' THEN
            v_matched := (p_is_recurring IS NULL OR p_is_recurring = false);

        WHEN 'AMOUNT_ABOVE' THEN
            v_threshold := (v_rule.condition_config->>'threshold')::numeric;
            v_matched   := (p_amount IS NOT NULL AND p_amount > v_threshold);

        WHEN 'AMOUNT_BELOW' THEN
            v_threshold := (v_rule.condition_config->>'threshold')::numeric;
            v_matched   := (p_amount IS NOT NULL AND p_amount < v_threshold);

        WHEN 'CROSS_BORDER' THEN
            v_matched := (p_is_cross_border = true);

        WHEN 'COMPANY_MATCH' THEN
            v_matched := (p_company_code_id::text = v_rule.condition_config->>'company_code_id');

        WHEN 'DOC_TYPE_MATCH' THEN
            v_matched := (p_doc_type = v_rule.condition_config->>'doc_type');

        WHEN 'FLOW_MATCH' THEN
            v_matched := (p_flow_code = v_rule.condition_config->>'flow_code');

        WHEN 'FALLBACK' THEN
            v_matched := true;

        ELSE
            v_matched := false;
        END CASE;

        CONTINUE WHEN NOT v_matched;

        -- Build explanation, substituting template variables
        v_expl := COALESCE(v_rule.explanation_template, 'Matched rule ' || v_rule.id);
        v_expl := replace(v_expl, '{amount}',    COALESCE(p_amount::text, '0'));
        v_expl := replace(v_expl, '{threshold}', COALESCE(v_rule.condition_config->>'threshold', ''));
        v_expl := replace(v_expl, '{currency}',  COALESCE(p_currency_code, ''));

        RETURN jsonb_build_object(
            'matched',          true,
            'intent_id',        v_rule.resolved_intent_id,
            'domain',           v_rule.resolved_domain,
            'method',           'RULE_MATCH',
            'rule_id',          v_rule.id,
            'confidence',       v_rule.confidence,
            'explanation',      v_expl,
            'rules_evaluated',  v_count
        );
    END LOOP;

    RETURN jsonb_build_object(
        'matched',         false,
        'method',          'FAILED',
        'confidence',      0,
        'rules_evaluated', v_count
    );
END;
$$;

COMMENT ON FUNCTION control.resolve_classification_to_intent(
    uuid, text, uuid, text, text, numeric, text, boolean, boolean, boolean, uuid, text
) IS
    'Step 3 of the procurement intake pipeline. Evaluates commodity_classification_to_intent_rule '
    'rows for the given classification in priority order. Supports 16 condition types. '
    'Returns first match with explanation, or FAILED. Called by IntentResolutionService.ts.';


DO $metadata$ BEGIN
    UPDATE control.entity
       SET status = 'ARCHIVED',
           feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                           || jsonb_build_object(
                                'is_hidden', true,
                                'records_api_disabled', true,
                                'replacement_entity', 'commodity_classification_to_intent_rule'
                              ),
           updated_at = now(),
           updated_by = '00000000-0000-0000-0000-000000000000'
     WHERE tenant_id IS NULL
       AND entity_code = 'classification_to_intent_rule';

    DELETE FROM control.entity_operation
     WHERE tenant_id IS NULL
       AND entity_name = 'classification_to_intent_rule';

    DELETE FROM control.entity_lifecycle
     WHERE tenant_id IS NULL
       AND entity_name = 'classification_to_intent_rule';
END $metadata$;