CREATE OR REPLACE FUNCTION document.command_workforce_iam_projection(
  p_tenant_id uuid,p_projection_id uuid,p_expected_version bigint,
  p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL
) RETURNS TABLE(employment_id uuid,desired_status text,desired_version bigint,desired_hash text,outbox_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,document,master,event,shared
AS $$
DECLARE
  v_fingerprint text;v_existing event.command_execution%ROWTYPE;v_projection document.workforce_iam_projection%ROWTYPE;
  v_employment_id uuid;v_person_id uuid;v_person_status text;v_employee_status text;v_employment_status text;
  v_identifier text;v_display_name text;v_status text;v_hash text;v_outbox uuid;v_execution uuid;v_payload jsonb;
BEGIN
  IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true) IS DISTINCT FROM 'neon'
     OR NULLIF(current_setting('app.current_tenant_id',true),'')::uuid IS DISTINCT FROM p_tenant_id
     OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Internal-workforce IAM command context does not match plane, tenant and actor' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_expected_version<1 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid internal-workforce IAM command' USING ERRCODE='check_violation';
  END IF;
  v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object('tenantId',p_tenant_id,'projectionId',p_projection_id,'expectedVersion',p_expected_version,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':internal-workforce-iam:'||p_idempotency_key,0));
  SELECT command.* INTO v_existing FROM event.command_execution command WHERE command.tenant_id=p_tenant_id AND command.command_code='workforce.employee.iam.project' AND command.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.request_fingerprint::text IS DISTINCT FROM v_fingerprint THEN RAISE EXCEPTION 'Internal-workforce IAM idempotency key was reused for another command' USING ERRCODE='unique_violation'; END IF;
    IF v_existing.status<>'succeeded' THEN RAISE EXCEPTION 'Prior internal-workforce IAM command is not replayable in status %',v_existing.status USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    RETURN QUERY SELECT (v_existing.result_payload->>'employmentId')::uuid,v_existing.result_payload->>'desiredStatus',(v_existing.result_payload->>'desiredVersion')::bigint,v_existing.result_payload->>'desiredHash',(v_existing.result_payload->>'outboxId')::uuid,true;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':workforce-iam-projection:'||p_projection_id::text,0));
  SELECT projection.* INTO v_projection FROM document.workforce_iam_projection projection WHERE projection.tenant_id=p_tenant_id AND projection.id=p_projection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Internal-workforce IAM projection was not found in command tenant' USING ERRCODE='no_data_found'; END IF;
  IF v_projection.row_version<>p_expected_version THEN RAISE EXCEPTION 'Internal-workforce IAM projection version is stale' USING ERRCODE='serialization_failure'; END IF;
  SELECT employment.id,person.id,person.status::text,employee.status::text,employment.employment_status,
         lower(btrim(COALESCE(NULLIF(person.primary_email,''),NULLIF(employee.email,'')))),
         COALESCE(NULLIF(btrim(person.display_name),''),NULLIF(btrim(employee.display_name),''),btrim(concat_ws(' ',person.first_name,person.last_name)))
    INTO v_employment_id,v_person_id,v_person_status,v_employee_status,v_employment_status,v_identifier,v_display_name
    FROM master.employee employee JOIN master.person person ON person.tenant_id=employee.tenant_id AND person.id=employee.person_id
    JOIN master.employment employment ON employment.tenant_id=employee.tenant_id AND employment.employee_id=employee.id AND employment.legal_entity_id=v_projection.employer_organization_id
   WHERE employee.tenant_id=p_tenant_id AND employee.id=v_projection.employee_id
   ORDER BY employment.is_primary DESC,employment.hire_date DESC,employment.id DESC LIMIT 1 FOR UPDATE OF employment;
  IF NOT FOUND THEN RAISE EXCEPTION 'Internal-workforce employment was not found for projection' USING ERRCODE='no_data_found'; END IF;
  IF v_projection.desired_state='member' THEN
    IF NOT v_projection.requested_principal_creation OR v_person_status<>'active' OR v_employee_status<>'active' OR v_employment_status<>'active' OR v_identifier IS NULL OR v_identifier='' THEN
      RAISE EXCEPTION 'Internal workforce is not eligible for IAM provisioning' USING ERRCODE='check_violation';
    END IF;
    v_status:='active';
  ELSIF v_projection.desired_state='suspended' THEN v_status:='suspended';
  ELSE v_status:='deprovisioned'; END IF;
  INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by)
  VALUES(p_tenant_id,'workforce.employee.iam.project',p_idempotency_key,v_fingerprint,'processing',p_actor_id,'neon.internal-workforce-iam',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO v_execution;
  v_payload:=jsonb_build_object('schema','athyper.trustiam.identity-projection-intent/1','sourcePlane','neon','sourceTenantId',p_tenant_id,'authorityTenantId',p_tenant_id,'targetTenantId',p_tenant_id,'personId',v_person_id,'identifier',v_identifier,'displayName',v_display_name,'realmKey','neon','organizationId',v_projection.employer_organization_id,'relationship','employer','sourceRef','employment:'||v_employment_id::text,'commandExecutionId',v_execution,'desiredVersion',v_projection.row_version,'desiredStatus',v_status,'applications',jsonb_build_array(jsonb_build_object('plane','neon','targetTenantId',p_tenant_id,'roles',jsonb_build_array(jsonb_build_object('roleCode','workforce.employee','scopeKind','legal_entity','scopeTargetId',v_projection.employer_organization_id)))));
  v_hash:=encode(public.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');v_payload:=v_payload||jsonb_build_object('desiredHash',v_hash);
  INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,correlation_id,partition_key,payload,created_by)
  VALUES(p_tenant_id,'neon-workforce-iam','workforce.employee.identity_projection.requested','internal-workforce-iam:'||v_employment_id::text||':v'||v_projection.row_version::text,'employment',v_employment_id,'employment',v_employment_id,LEAST(v_projection.row_version,2147483647)::integer,p_actor_id,'neon.internal-workforce-iam',p_correlation_id,p_tenant_id::text,v_payload,p_actor_id) RETURNING id INTO v_outbox;
  UPDATE event.command_execution SET status='succeeded',result_payload=jsonb_build_object('employmentId',v_employment_id,'desiredStatus',v_status,'desiredVersion',v_projection.row_version,'desiredHash',v_hash,'outboxId',v_outbox),completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=v_execution AND status='processing';
  RETURN QUERY SELECT v_employment_id,v_status,v_projection.row_version,v_hash,v_outbox,false;
END $$;

-- Canonical G6 internal-workforce identity intent.  The employment aggregate is
-- the source authority; the retained workforce_iam_projection relation is not
-- consulted or mutated by this command.
CREATE OR REPLACE FUNCTION document.command_internal_workforce_identity_intent(
  p_tenant_id uuid,p_employment_id uuid,p_desired_status text,
  p_create_principal boolean,p_idempotency_key text,p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS TABLE(employment_id uuid,desired_status text,desired_version bigint,
  desired_hash text,outbox_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,document,master,event,shared
AS $$
DECLARE
  v_fingerprint text;v_existing event.command_execution%ROWTYPE;
  v_employment master.employment%ROWTYPE;v_employee master.employee%ROWTYPE;
  v_person master.person%ROWTYPE;v_version bigint;v_hash text;v_outbox uuid;
  v_execution uuid;v_payload jsonb;v_identifier text;
BEGIN
  IF current_setting('app.database_plane',true) IS DISTINCT FROM 'neon'
     OR NULLIF(current_setting('app.current_tenant_id',true),'')::uuid IS DISTINCT FROM p_tenant_id
     OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Internal-workforce identity intent context does not match plane, tenant and actor' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_desired_status NOT IN('active','suspended','deprovisioned')
     OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid internal-workforce identity intent' USING ERRCODE='check_violation';
  END IF;
  v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object(
    'tenantId',p_tenant_id,'employmentId',p_employment_id,'desiredStatus',p_desired_status,
    'createPrincipal',p_create_principal,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id
  )::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':internal-workforce-identity:'||p_idempotency_key,0));
  SELECT command.* INTO v_existing FROM event.command_execution command
   WHERE command.tenant_id=p_tenant_id AND command.command_code='workforce.employee.identity.request'
     AND command.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.request_fingerprint::text IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'Internal-workforce identity idempotency key was reused' USING ERRCODE='unique_violation';
    END IF;
    IF v_existing.status<>'succeeded' THEN
      RAISE EXCEPTION 'Prior internal-workforce identity command is not replayable' USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    RETURN QUERY SELECT (v_existing.result_payload->>'employmentId')::uuid,
      v_existing.result_payload->>'desiredStatus',(v_existing.result_payload->>'desiredVersion')::bigint,
      v_existing.result_payload->>'desiredHash',(v_existing.result_payload->>'outboxId')::uuid,true;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':internal-workforce-identity:'||p_employment_id::text,0));
  SELECT value.* INTO v_employment FROM master.employment value
   WHERE value.tenant_id=p_tenant_id AND value.id=p_employment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Internal-workforce employment was not found' USING ERRCODE='no_data_found'; END IF;
  SELECT value.* INTO v_employee FROM master.employee value
   WHERE value.tenant_id=p_tenant_id AND value.id=v_employment.employee_id;
  SELECT value.* INTO v_person FROM master.person value
   WHERE value.tenant_id=p_tenant_id AND value.id=v_employment.person_id;
  IF v_employee.id IS NULL OR v_person.id IS NULL THEN
    RAISE EXCEPTION 'Internal-workforce identity authority is incomplete' USING ERRCODE='data_corrupted';
  END IF;
  v_identifier:=lower(btrim(COALESCE(NULLIF(v_person.primary_email,''),NULLIF(v_employee.email,''))));
  IF p_desired_status='active' AND (NOT p_create_principal OR v_person.status<>'active'
     OR v_employee.status<>'active' OR v_employment.employment_status<>'active'
     OR v_identifier IS NULL OR v_identifier='') THEN
    RAISE EXCEPTION 'Internal workforce is not eligible for IAM provisioning' USING ERRCODE='check_violation';
  END IF;
  SELECT COALESCE(max((command.result_payload->>'desiredVersion')::bigint),0)+1 INTO v_version
    FROM event.command_execution command
   WHERE command.tenant_id=p_tenant_id AND command.command_code='workforce.employee.identity.request'
     AND command.status='succeeded' AND command.result_payload->>'employmentId'=p_employment_id::text;
  INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,
    actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by)
  VALUES(p_tenant_id,'workforce.employee.identity.request',p_idempotency_key,v_fingerprint,'processing',
    p_actor_id,'neon.internal-workforce-iam',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id)
  RETURNING id INTO v_execution;
  v_payload:=jsonb_build_object('schema','athyper.trustiam.identity-projection-intent/1','sourcePlane','neon',
    'sourceTenantId',p_tenant_id,'authorityTenantId',p_tenant_id,'targetTenantId',p_tenant_id,
    'personId',v_person.id,'identifier',v_identifier,
    'displayName',COALESCE(NULLIF(btrim(v_person.display_name),''),NULLIF(btrim(v_employee.display_name),''),btrim(concat_ws(' ',v_person.first_name,v_person.last_name))),
    'realmKey','neon','organizationId',v_employment.legal_entity_id,'relationship','employer',
    'sourceRef','employment:'||v_employment.id::text,'commandExecutionId',v_execution,
    'desiredVersion',v_version,'desiredStatus',p_desired_status,
    'applications',jsonb_build_array(jsonb_build_object('plane','neon','targetTenantId',p_tenant_id,
      'roles',CASE WHEN p_desired_status='deprovisioned' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
        'roleCode','workforce.employee','scopeKind','legal_entity','scopeTargetId',v_employment.legal_entity_id)) END)));
  v_hash:=encode(public.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  v_payload:=v_payload||jsonb_build_object('desiredHash',v_hash);
  INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,
    event_version,actor_id,source,correlation_id,partition_key,payload,created_by)
  VALUES(p_tenant_id,'neon-workforce-iam','workforce.employee.identity_projection.requested',
    'internal-workforce-identity:'||v_employment.id::text||':v'||v_version::text,'employment',v_employment.id,
    'employment',v_employment.id,LEAST(v_version,2147483647)::integer,p_actor_id,'neon.internal-workforce-iam',
    p_correlation_id,p_tenant_id::text,v_payload,p_actor_id) RETURNING id INTO v_outbox;
  UPDATE event.command_execution SET status='succeeded',result_payload=jsonb_build_object(
    'employmentId',v_employment.id,'desiredStatus',p_desired_status,'desiredVersion',v_version,
    'desiredHash',v_hash,'outboxId',v_outbox),completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),
    status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=v_execution AND status='processing';
  RETURN QUERY SELECT v_employment.id,p_desired_status,v_version,v_hash,v_outbox,false;
END $$;
