-- Wave 5 retirement slot.
-- The retired polymorphic master.commodity_classification bridge is deliberately
-- not recreated. Classification scheme selection now belongs to
-- control.commodity_code_classification_policy; category behaviour belongs to the
-- three effective control.commodity_category_*_policy aggregates.
DO $wave5_classification_retirement$
DECLARE v_tid uuid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM control.commodity_code_classification_policy WHERE tenant_id=v_tid AND status='active') THEN
    RAISE EXCEPTION '[wave5.spend-taxonomy] commodity policy must precede classification retirement';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM master.commodity_category WHERE tenant_id=v_tid AND status='active') THEN
    RAISE EXCEPTION '[wave5.spend-taxonomy] active commodity categories required';
  END IF;
END $wave5_classification_retirement$;
