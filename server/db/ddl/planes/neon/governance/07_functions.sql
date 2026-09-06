CREATE OR REPLACE FUNCTION governance.command_link_business_partner_onboarding_subject(
  p_tenant_id uuid, p_cycle_run_id uuid, p_subject_role text,
  p_entity_case_id uuid, p_external_reference text, p_is_primary boolean,
  p_actor_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,governance,control,document,master,shared
AS $function$
DECLARE v_id uuid;
BEGIN
  IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id()
     OR p_actor_id IS DISTINCT FROM master.current_principal_id_soft() THEN
    RAISE EXCEPTION 'Cycle subject actor or tenant context is invalid' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_subject_role NOT IN ('onboarding_case','supplier_invitation')
     OR num_nonnulls(p_entity_case_id,p_external_reference)<>1
     OR (p_is_primary IS DISTINCT FROM (p_subject_role='onboarding_case')) THEN
    RAISE EXCEPTION 'Business Partner onboarding subject coordinate is invalid' USING ERRCODE='check_violation';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM governance.cycle_run run
    JOIN control.cycle_type type ON type.tenant_id=run.tenant_id AND type.id=run.cycle_type_id
    WHERE run.tenant_id=p_tenant_id AND run.id=p_cycle_run_id
      AND type.code='BP_SUPPLIER_ONBOARDING' AND run.status IN ('running','blocked')
  ) THEN RAISE EXCEPTION 'Active Business Partner onboarding cycle was not found' USING ERRCODE='foreign_key_violation'; END IF;
  IF p_entity_case_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM document.entity_case c WHERE c.tenant_id=p_tenant_id
      AND c.id=p_entity_case_id AND c.entity_code='master.business_partner'
  ) THEN RAISE EXCEPTION 'Governed Business Partner case was not found' USING ERRCODE='foreign_key_violation'; END IF;
  IF p_external_reference IS NOT NULL AND p_external_reference !~ '^business_partner_invitation:[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'Supplier invitation coordinate is invalid' USING ERRCODE='check_violation';
  END IF;
  SELECT id INTO v_id FROM governance.cycle_subject
   WHERE tenant_id=p_tenant_id AND cycle_run_id=p_cycle_run_id AND subject_role=p_subject_role
     AND entity_case_id IS NOT DISTINCT FROM p_entity_case_id
     AND external_reference IS NOT DISTINCT FROM p_external_reference;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO governance.cycle_subject(tenant_id,cycle_run_id,subject_role,entity_case_id,external_reference,is_primary,created_by)
  VALUES(p_tenant_id,p_cycle_run_id,p_subject_role,p_entity_case_id,p_external_reference,p_is_primary,p_actor_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;
