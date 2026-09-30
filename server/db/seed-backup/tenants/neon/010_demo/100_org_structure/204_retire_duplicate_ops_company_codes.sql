-- Retires duplicate *.ops Company Codes. Each is verified to have the same LE
-- and currency as its base code. Historical accounting setup remains attached
-- for audit; inactive Company Codes are excluded from working context.
DO $retire_demo_duplicate_ops_company_codes$
DECLARE v_tenant_id uuid; v_actor uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM master.tenant WHERE realm_key='athyper' AND code='athyper';
  SELECT id INTO v_actor FROM master.principal WHERE tenant_id=v_tenant_id AND code='seed.three-plane-provisioner' AND status='active';
  IF v_tenant_id IS NULL OR v_actor IS NULL THEN RAISE EXCEPTION '[204_retire_duplicate_ops_company_codes] demo tenant or seed principal missing'; END IF;
  PERFORM set_config('app.current_principal_id',v_actor::text,true);
  IF EXISTS (
    SELECT 1 FROM master.company_code duplicate
    LEFT JOIN master.company_code base ON base.tenant_id=duplicate.tenant_id AND base.code=regexp_replace(duplicate.code,'\.ops$','')
    WHERE duplicate.tenant_id=v_tenant_id AND duplicate.code LIKE '%.ops'
      AND (base.id IS NULL OR base.legal_entity_id IS DISTINCT FROM duplicate.legal_entity_id OR base.functional_currency IS DISTINCT FROM duplicate.functional_currency)
  ) THEN RAISE EXCEPTION '[204_retire_duplicate_ops_company_codes] duplicate Company Code has no compatible base Company Code'; END IF;
  UPDATE master.company_code
     SET status='inactive',status_changed_at=now(),status_changed_by=v_actor,
         metadata=metadata||jsonb_build_object('migration',jsonb_build_object('replacement_company_code',regexp_replace(code,'\.ops$',''),'retired_reason','duplicate-operating-company-code')),
         updated_at=now(),updated_by=v_actor
   WHERE tenant_id=v_tenant_id AND code LIKE '%.ops' AND status<>'inactive';
END;
$retire_demo_duplicate_ops_company_codes$;
