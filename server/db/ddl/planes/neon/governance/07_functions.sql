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
      AND run.status IN ('running','blocked') AND (type.code='BP_SUPPLIER_ONBOARDING' OR (
       p_subject_role='onboarding_case' AND EXISTS(
         SELECT 1 FROM governance.process_selection_evidence e JOIN document.entity_case c ON c.tenant_id=e.tenant_id AND c.id=e.case_id
         WHERE e.tenant_id=p_tenant_id AND e.case_id=p_entity_case_id AND e.cycle_run_id=run.id
          AND e.evidence->'executionManifest'->'cycle'->>'cycleTypeId'=run.cycle_type_id::text
          AND e.evidence->'executionManifest'->'cycle'->>'id'=run.template_revision_id::text
          AND e.evidence->'executionManifest'->'cycle'->>'hash'=btrim(run.template_hash)
          AND e.evidence->'coordinate'->'submissionSnapshot'->>'id'=c.submitted_snapshot_id::text)))
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

CREATE OR REPLACE FUNCTION governance.command_link_supplier_onboarding_work(p_tenant uuid,p_run uuid,p_case uuid,p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE child document.entity_case%ROWTYPE; parent document.entity_case%ROWTYPE; child_payload jsonb; scope jsonb; role_code text; result uuid;
BEGIN
 IF shared.current_tenant_id() IS DISTINCT FROM p_tenant OR master.current_principal_id_soft() IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'SUPPLIER_LINK_CONTEXT_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM governance.cycle_run WHERE tenant_id=p_tenant AND id=p_run AND status IN('running','blocked') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_LINK_RUN_INACTIVE' USING ERRCODE='23514'; END IF;
 SELECT e.evidence->'coordinate'->'scope' INTO scope FROM governance.process_attempt a JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id JOIN document.entity_case c ON c.tenant_id=a.tenant_id AND c.id=a.case_id WHERE a.tenant_id=p_tenant AND a.cycle_run_id=p_run ORDER BY a.attempt_number DESC LIMIT 1;
 SELECT c.* INTO parent FROM governance.process_attempt a JOIN document.entity_case c ON c.tenant_id=a.tenant_id AND c.id=a.case_id WHERE a.tenant_id=p_tenant AND a.cycle_run_id=p_run ORDER BY a.attempt_number DESC LIMIT 1;
 SELECT * INTO child FROM document.entity_case WHERE tenant_id=p_tenant AND id=p_case;
 SELECT payload_json INTO child_payload FROM snapshot.entity_snapshot WHERE tenant_id=p_tenant AND snapshot_id=child.current_snapshot_id;
 role_code:=CASE child.operation_code WHEN 'configure_company' THEN 'company_setup' WHEN 'change_bank' THEN 'bank_change' WHEN 'activate_supplier' THEN 'supplier_activation' END;
 IF parent.id IS NULL OR parent.status<>'materialized' OR child.target_entity_id IS DISTINCT FROM parent.target_entity_id OR role_code IS NULL OR child_payload->>'operatingOrganizationId' IS DISTINCT FROM scope->>'operatingOrganizationId' OR child_payload->>'companyCodeId' IS DISTINCT FROM scope->>'companyCodeId' THEN RAISE EXCEPTION 'SUPPLIER_LINK_SCOPE_INVALID' USING ERRCODE='23514'; END IF;
 SELECT id INTO result FROM governance.cycle_subject WHERE tenant_id=p_tenant AND cycle_run_id=p_run AND entity_case_id=p_case AND subject_role=role_code;
 IF result IS NOT NULL THEN RETURN result; END IF;
 INSERT INTO governance.cycle_subject(tenant_id,cycle_run_id,subject_role,entity_case_id,is_primary,created_by) VALUES(p_tenant,p_run,role_code,p_case,false,p_actor) RETURNING id INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION governance.trg_supplier_onboarding_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE a governance.process_attempt%ROWTYPE; c document.entity_case%ROWTYPE; receipt jsonb; scope jsonb;
BEGIN
 IF OLD.status IN('completed','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'SUPPLIER_ONBOARDING_RUN_TERMINAL' USING ERRCODE='23514'; END IF;
 IF NEW.data->>'schema'<>'athyper.process-run/1' THEN RETURN NEW; END IF;
 IF NEW.data-'completion' IS DISTINCT FROM OLD.data-'completion' THEN RAISE EXCEPTION 'SUPPLIER_ONBOARDING_PIN_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF NEW.status<>'completed' OR NEW.status=OLD.status THEN RETURN NEW; END IF;
 SELECT * INTO a FROM governance.process_attempt WHERE tenant_id=NEW.tenant_id AND cycle_run_id=NEW.id ORDER BY attempt_number DESC LIMIT 1;
 SELECT * INTO c FROM document.entity_case WHERE tenant_id=NEW.tenant_id AND id=a.case_id;
 SELECT evidence->'coordinate'->'scope' INTO scope FROM governance.process_selection_evidence WHERE tenant_id=NEW.tenant_id AND id=a.selection_id;
 receipt:=NEW.data->'completion';
 IF c.status IS DISTINCT FROM 'materialized' OR receipt->>'ready' IS DISTINCT FROM 'true' OR receipt->'evidence'->'completion'->>'attemptId' IS DISTINCT FROM a.id::text OR receipt->'evidence'->'completion'->>'caseVersion' IS DISTINCT FROM c.row_version::text OR receipt->>'expectedVersion' IS DISTINCT FROM OLD.version::text OR receipt->>'principalId' IS DISTINCT FROM master.current_principal_id_soft()::text THEN RAISE EXCEPTION 'SUPPLIER_ONBOARDING_COMPLETION_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM document.entity_case_materialization m WHERE m.tenant_id=NEW.tenant_id AND m.entity_case_id=c.id AND m.status='succeeded' AND m.source_snapshot_id=c.decision_snapshot_id AND m.result_snapshot_id=c.result_snapshot_id) THEN RAISE EXCEPTION 'SUPPLIER_ONBOARDING_MATERIALIZATION_REQUIRED' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM document.supplier_activation_evidence e JOIN master.supplier s ON s.tenant_id=e.tenant_id AND s.id=e.supplier_id AND s.status='active' JOIN governance.process_document_job j ON j.tenant_id=e.tenant_id AND j.attempt_id=a.id AND j.purpose='activation_confirmation' AND j.status='ready' AND j.intent->'activationEvidence'->>'id'=e.id::text AND j.intent->'activationEvidence'->>'hash'=e.readiness_fingerprint AND j.intent->'sourceSnapshot'->>'id'=c.result_snapshot_id::text WHERE e.tenant_id=NEW.tenant_id AND e.business_partner_id=c.target_entity_id AND e.operating_organization_id::text=scope->>'operatingOrganizationId' AND e.company_code_id::text IS NOT DISTINCT FROM scope->>'companyCodeId') THEN RAISE EXCEPTION 'SUPPLIER_ONBOARDING_ACTIVATION_REQUIRED' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM governance.cycle_subject s JOIN document.entity_case work ON work.tenant_id=s.tenant_id AND work.id=s.entity_case_id WHERE s.tenant_id=NEW.tenant_id AND s.cycle_run_id=NEW.id AND NOT s.is_primary AND s.subject_role IN('company_setup','bank_change','supplier_activation') AND work.status NOT IN('materialized','rejected','cancelled')) THEN RAISE EXCEPTION 'SUPPLIER_ONBOARDING_LINKED_WORK_OPEN' USING ERRCODE='23514'; END IF;
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,partition_key,payload,created_by) VALUES(NEW.tenant_id,'supplier-onboarding','business_partner.supplier.onboarding.completed','supplier-onboarding:'||NEW.id::text||':completed','governance.cycle_run',NEW.id,'supplier_onboarding',NEW.id,NEW.version,master.current_principal_id_soft(),'supplier-onboarding.completion',NEW.tenant_id::text,jsonb_build_object('cycleRunId',NEW.id,'caseId',c.id,'attemptId',a.id,'selectionId',a.selection_id,'businessPartnerId',c.target_entity_id,'resultSnapshotId',c.result_snapshot_id),master.current_principal_id_soft());
 RETURN NEW;
END $$;
