-- Retires the former functional shared-service selector records after the
-- Company Operations hierarchy is installed. It preserves rows for audit and
-- refuses to retire a record that is still referenced by BP decision data.
DO $retire_demo_legacy_operating_organizations$
DECLARE
  v_tenant_id uuid; v_actor uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM master.tenant WHERE realm_key='athyper' AND code='athyper';
  SELECT id INTO v_actor FROM master.principal WHERE tenant_id=v_tenant_id AND code='seed.three-plane-provisioner' AND status='active';
  IF v_tenant_id IS NULL OR v_actor IS NULL THEN RAISE EXCEPTION '[203_retire_legacy_operating_organizations] demo tenant or seed principal missing'; END IF;
  PERFORM set_config('app.current_principal_id',v_actor::text,true);
  IF EXISTS (
    SELECT 1 FROM master.operating_organization org
    WHERE org.tenant_id=v_tenant_id
      AND org.code IN ('athyper.shared-services','athyper.finance.apac','athyper.finance.emea','athyper.finance.americas','athyper.people.apac','athyper.people.emea','athyper.people.americas','athyper.procurement.apac','athyper.procurement.emea','athyper.procurement.americas')
      AND (EXISTS (SELECT 1 FROM master.business_partner_operating_organization_assignment row WHERE row.operating_organization_id=org.id)
        OR EXISTS (SELECT 1 FROM control.business_partner_decision_scope row WHERE row.operating_organization_id=org.id)
        OR EXISTS (SELECT 1 FROM document.supplier_activation_evidence row WHERE row.operating_organization_id=org.id))
  ) THEN RAISE EXCEPTION '[203_retire_legacy_operating_organizations] legacy Demo organizations still have business-record references'; END IF;
  UPDATE master.operating_organization_company_assignment assignment
     SET status='inactive',status_changed_at=now(),status_changed_by=v_actor,updated_at=now(),updated_by=v_actor
    FROM master.operating_organization org
   WHERE org.tenant_id=v_tenant_id AND assignment.tenant_id=org.tenant_id AND assignment.operating_organization_id=org.id
     AND org.code IN ('athyper.finance.apac','athyper.finance.emea','athyper.finance.americas','athyper.people.apac','athyper.people.emea','athyper.people.americas','athyper.procurement.apac','athyper.procurement.emea','athyper.procurement.americas');
  UPDATE master.operating_organization
     SET status='inactive',status_changed_at=now(),status_changed_by=v_actor,metadata=metadata||'{"migration":{"replacement_model":"company-operations-v2","retired_reason":"functional-processing-teams-are-workflow-routed"}}'::jsonb,updated_at=now(),updated_by=v_actor
   WHERE tenant_id=v_tenant_id
     AND code IN ('athyper.finance.apac','athyper.finance.emea','athyper.finance.americas','athyper.people.apac','athyper.people.emea','athyper.people.americas','athyper.procurement.apac','athyper.procurement.emea','athyper.procurement.americas');
  UPDATE master.operating_organization
     SET status='inactive',status_changed_at=now(),status_changed_by=v_actor,metadata=metadata||'{"migration":{"replacement_model":"company-operations-v2","retired_reason":"functional-processing-teams-are-workflow-routed"}}'::jsonb,updated_at=now(),updated_by=v_actor
   WHERE tenant_id=v_tenant_id AND code='athyper.shared-services';
END;
$retire_demo_legacy_operating_organizations$;
