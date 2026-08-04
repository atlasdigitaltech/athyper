-- Wave 5 tenant commodity-code policy. Category intent and inventory behaviour
-- are seeded separately in control.commodity_category_*_policy.
DO $wave5_commodity_policy$
DECLARE
    v_tid uuid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    v_actor uuid := nullif(trim(current_setting('app.current_principal_id',true)),'')::uuid;
BEGIN
    IF current_setting('app.database_plane', true) <> 'neon' THEN
        RAISE EXCEPTION '[wave5.spend-taxonomy] Neon plane required';
    END IF;
    IF v_tid IS NULL OR NOT EXISTS (SELECT 1 FROM master.tenant WHERE id=v_tid) THEN
        RAISE EXCEPTION '[wave5.spend-taxonomy] valid app.seed_tenant_id required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM shared.classification_scheme WHERE code='unspsc' AND status='active')
       OR NOT EXISTS (SELECT 1 FROM shared.classification_scheme WHERE code='hs' AND status='active') THEN
        RAISE EXCEPTION '[wave5.spend-taxonomy] active UNSPSC and HS reference schemes required';
    END IF;

    INSERT INTO control.commodity_code_classification_policy (
        id,tenant_id,primary_commodity_domain_code,trade_commodity_domain_code,
        commodity_code_required,trade_code_required,regulated_classification_required,
        auto_classification_enabled,auto_crosswalk_enabled,auto_accept_confidence,
        suggestion_confidence,crosswalk_strategy,metadata,status,created_by
    ) VALUES (
        md5('wave5:commodity-code-policy:' || v_tid::text)::uuid,v_tid,'unspsc','hs',
        false,false,true,true,true,90.00,60.00,'best_match',
        '{"_seed":{"pack":"spend-taxonomy-business-intents","version":"2.0.0"}}'::jsonb,
        'active',v_actor
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        primary_commodity_domain_code=excluded.primary_commodity_domain_code,
        trade_commodity_domain_code=excluded.trade_commodity_domain_code,
        commodity_code_required=excluded.commodity_code_required,
        trade_code_required=excluded.trade_code_required,
        regulated_classification_required=excluded.regulated_classification_required,
        auto_classification_enabled=excluded.auto_classification_enabled,
        auto_crosswalk_enabled=excluded.auto_crosswalk_enabled,
        auto_accept_confidence=excluded.auto_accept_confidence,
        suggestion_confidence=excluded.suggestion_confidence,
        crosswalk_strategy=excluded.crosswalk_strategy,metadata=excluded.metadata,status='active',
        updated_at=now(),updated_by=excluded.created_by
    WHERE (control.commodity_code_classification_policy.primary_commodity_domain_code,
           control.commodity_code_classification_policy.trade_commodity_domain_code,
           control.commodity_code_classification_policy.commodity_code_required,
           control.commodity_code_classification_policy.trade_code_required,
           control.commodity_code_classification_policy.regulated_classification_required,
           control.commodity_code_classification_policy.auto_classification_enabled,
           control.commodity_code_classification_policy.auto_crosswalk_enabled,
           control.commodity_code_classification_policy.auto_accept_confidence,
           control.commodity_code_classification_policy.suggestion_confidence,
           control.commodity_code_classification_policy.crosswalk_strategy,
           control.commodity_code_classification_policy.metadata,
           control.commodity_code_classification_policy.status)
      IS DISTINCT FROM
          (excluded.primary_commodity_domain_code,excluded.trade_commodity_domain_code,
           excluded.commodity_code_required,excluded.trade_code_required,
           excluded.regulated_classification_required,excluded.auto_classification_enabled,
           excluded.auto_crosswalk_enabled,excluded.auto_accept_confidence,
           excluded.suggestion_confidence,excluded.crosswalk_strategy,excluded.metadata,'active'::shared.active_inactive_d);

    IF (SELECT count(*) FROM control.commodity_code_classification_policy WHERE tenant_id=v_tid AND status='active') <> 1 THEN
        RAISE EXCEPTION '[wave5.spend-taxonomy] commodity policy assertion failed';
    END IF;
END $wave5_commodity_policy$;
