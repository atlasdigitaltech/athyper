-- Wave 5 retirement slot.
-- Prefix routing formerly held in control.commodity_code_to_category_rule is not
-- copied into the new model. The selected reference domains are governed by the
-- tenant commodity-code policy; category selection is an application decision
-- whose result is stored as authoritative master data.
DO $wave5_code_routing_retirement$
DECLARE v_tid uuid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM control.commodity_code_classification_policy
     WHERE tenant_id=v_tid AND primary_commodity_domain_code='unspsc' AND status='active'
  ) THEN RAISE EXCEPTION '[wave5.spend-taxonomy] UNSPSC tenant policy required'; END IF;
END $wave5_code_routing_retirement$;
