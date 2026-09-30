CREATE OR REPLACE FUNCTION document.trg_guard_work_item_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.source_entity_code IS DISTINCT FROM OLD.source_entity_code
       OR NEW.source_entity_id IS DISTINCT FROM OLD.source_entity_id THEN
        RAISE EXCEPTION 'work item identity, source, and creation evidence are immutable'
            USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.fn_entity_case_three_way_merge(p_base jsonb,p_current jsonb,p_proposed jsonb,p_path text DEFAULT '')
RETURNS TABLE(merged jsonb,conflicts text[]) LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE k text;b jsonb;c jsonb;p jsonb;bh boolean;ch boolean;ph boolean;r record;take_present boolean;take_value jsonb;path text;
BEGIN
 IF p_base IS NOT DISTINCT FROM p_current THEN RETURN QUERY SELECT p_proposed,'{}'::text[];RETURN; END IF;
 IF p_base IS NOT DISTINCT FROM p_proposed OR p_current IS NOT DISTINCT FROM p_proposed THEN RETURN QUERY SELECT p_current,'{}'::text[];RETURN; END IF;
 IF jsonb_typeof(p_base)<>'object' OR jsonb_typeof(p_current)<>'object' OR jsonb_typeof(p_proposed)<>'object' THEN RETURN QUERY SELECT p_current,ARRAY[COALESCE(NULLIF(p_path,''),'/')];RETURN; END IF;
 merged:='{}'::jsonb;conflicts:='{}'::text[];
 FOR k IN SELECT key FROM(SELECT jsonb_object_keys(p_base) key UNION SELECT jsonb_object_keys(p_current) UNION SELECT jsonb_object_keys(p_proposed)) keys ORDER BY key LOOP
  bh:=p_base?k;ch:=p_current?k;ph:=p_proposed?k;b:=p_base->k;c:=p_current->k;p:=p_proposed->k;path:=p_path||'/'||replace(replace(k,'~','~0'),'/','~1');take_present:=false;take_value:=NULL;
  IF ch=bh AND (NOT ch OR c=b) THEN take_present:=ph;take_value:=p;
  ELSIF ph=bh AND (NOT ph OR p=b) THEN take_present:=ch;take_value:=c;
  ELSIF ch=ph AND (NOT ch OR c=p) THEN take_present:=ch;take_value:=c;
  ELSIF bh AND ch AND ph AND jsonb_typeof(b)='object' AND jsonb_typeof(c)='object' AND jsonb_typeof(p)='object' THEN
    SELECT * INTO r FROM document.fn_entity_case_three_way_merge(b,c,p,path);take_present:=true;take_value:=r.merged;conflicts:=conflicts||r.conflicts;
  ELSE take_present:=ch;take_value:=c;conflicts:=conflicts||path; END IF;
  IF take_present THEN merged:=jsonb_set(merged,ARRAY[k],take_value,true); END IF;
 END LOOP;
 RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION document.fn_validate_entity_case_payload(p_contract jsonb,p_payload jsonb)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE
 s jsonb:=COALESCE(p_contract->'jsonSchema',p_contract->'schema',p_contract);
 k text; definition jsonb; errors text[]:='{}'; actual text; expected text; value jsonb;
BEGIN
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR pg_column_size(p_payload)>262144 THEN RETURN ARRAY['PAYLOAD_OBJECT_OR_SIZE_INVALID']; END IF;
 IF s IS NULL OR jsonb_typeof(s)<>'object' THEN RETURN ARRAY['CONTRACT_SCHEMA_INVALID']; END IF;
 IF jsonb_typeof(s->'required')='array' THEN
  FOR k IN SELECT jsonb_array_elements_text(s->'required') LOOP
   IF NOT p_payload?k THEN errors:=array_append(errors,'MISSING_REQUIRED:'||k); END IF;
  END LOOP;
 END IF;
 IF s->>'additionalProperties'='false' AND jsonb_typeof(s->'properties')='object' THEN
  FOR k IN SELECT jsonb_object_keys(p_payload) LOOP
   IF NOT (s->'properties')?k THEN errors:=array_append(errors,'UNKNOWN_PROPERTY:'||k); END IF;
  END LOOP;
 END IF;
 IF jsonb_typeof(s->'properties')='object' THEN
  FOR k,definition IN SELECT entry.key,entry.value FROM jsonb_each(s->'properties') entry LOOP
   IF NOT p_payload?k THEN CONTINUE; END IF;
   value:=p_payload->k;actual:=jsonb_typeof(value);expected:=definition->>'type';
   IF definition?'type' THEN
    IF NOT(actual=expected OR expected='integer' AND actual='number') THEN
     errors:=array_append(errors,'TYPE_MISMATCH:'||k); CONTINUE;
    END IF;
    IF expected='integer' AND (value::text)::numeric<>trunc((value::text)::numeric) THEN
     errors:=array_append(errors,'TYPE_MISMATCH:'||k); CONTINUE;
    END IF;
   END IF;
   IF definition?'enum' THEN
    IF jsonb_typeof(definition->'enum')<>'array' THEN RETURN ARRAY['CONTRACT_SCHEMA_INVALID']; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(definition->'enum') AS options(enum_value) WHERE options.enum_value=value) THEN
     errors:=array_append(errors,'ENUM_MISMATCH:'||k);
    END IF;
   END IF;
   IF actual='string' THEN
    IF definition?'minLength' AND char_length(p_payload->>k)<(definition->>'minLength')::integer THEN errors:=array_append(errors,'MIN_LENGTH:'||k); END IF;
    IF definition?'maxLength' AND char_length(p_payload->>k)>(definition->>'maxLength')::integer THEN errors:=array_append(errors,'MAX_LENGTH:'||k); END IF;
   ELSIF actual='number' THEN
    IF definition?'minimum' AND (value::text)::numeric<(definition->>'minimum')::numeric THEN errors:=array_append(errors,'MINIMUM:'||k); END IF;
    IF definition?'maximum' AND (value::text)::numeric>(definition->>'maximum')::numeric THEN errors:=array_append(errors,'MAXIMUM:'||k); END IF;
   END IF;
  END LOOP;
 END IF;
 RETURN errors;
EXCEPTION WHEN others THEN RETURN ARRAY['CONTRACT_SCHEMA_INVALID'];
END $$;

CREATE OR REPLACE FUNCTION document.trg_guard_entity_case_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,event AS $$
DECLARE execution uuid:=NULLIF(current_setting('app.entity_case_command_execution_id',true),'')::uuid;tenant uuid:=COALESCE(NEW.tenant_id,OLD.tenant_id);
BEGIN
 IF execution IS NULL OR NOT EXISTS(SELECT 1 FROM event.command_execution e WHERE e.id=execution AND e.tenant_id=tenant AND e.command_code IN('entity.case.draft.write','entity.case.validation','entity.case.lifecycle','entity.case.materialize.internal_business_partner','entity.case.materialize.business_partner_role','entity.case.materialize.business_partner_company','entity.case.materialize.business_partner_change','entity.case.backfill.business_partner_request') AND e.status='processing' AND e.actor_principal_id=master.current_principal_id_soft()) THEN RAISE EXCEPTION 'Entity case mutations require the governed command' USING ERRCODE='insufficient_privilege';END IF;RETURN COALESCE(NEW,OLD);
END $$;

CREATE OR REPLACE FUNCTION document.command_entity_case_lifecycle(
 p_tenant_id uuid,p_case_id uuid,p_action text,p_expected_version bigint,p_cycle_run_id uuid,p_cycle_task_id uuid,p_reason text,p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL)
RETURNS TABLE(entity_case_id uuid,snapshot_id uuid,row_version bigint,status text,replayed boolean,outbox_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,document,snapshot,runtime_meta,event,governance,shared,master SET row_security=on AS $$
DECLARE fingerprint text;prior event.command_execution%ROWTYPE;execution uuid;current document.entity_case%ROWTYPE;task governance.cycle_task%ROWTYPE;payload jsonb;next_snapshot uuid;next_version bigint;next_status text;outbox uuid;result jsonb;command_code text;lineage_role text;lineage_hash text;
BEGIN
 IF current_database()<>'athyper_'||current_setting('app.database_plane',true) OR shared.current_tenant_id()<>p_tenant_id OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Entity case lifecycle context mismatch' USING ERRCODE='insufficient_privilege';END IF;
 IF p_action NOT IN('submit','approve','reject') OR p_expected_version<1 OR p_cycle_run_id IS NULL OR p_cycle_task_id IS NULL OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 OR (p_action='reject' AND NULLIF(btrim(p_reason),'') IS NULL) OR length(COALESCE(p_reason,''))>2000 THEN RAISE EXCEPTION 'Entity case lifecycle arguments are invalid' USING ERRCODE='check_violation';END IF;
 command_code:=CASE WHEN p_action='submit' THEN 'entity.case.submit' ELSE 'entity.case.decision' END;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,'action',p_action,'expectedVersion',p_expected_version,'cycleRunId',p_cycle_run_id,'cycleTaskId',p_cycle_task_id,'reason',p_reason,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case-lifecycle:'||p_idempotency_key,0));
 SELECT e.* INTO prior FROM event.command_execution e WHERE e.tenant_id=p_tenant_id AND e.command_code='entity.case.lifecycle' AND e.idempotency_key=p_idempotency_key;
 IF FOUND THEN IF prior.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Entity case lifecycle idempotency conflict' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT (prior.result_payload->>'caseId')::uuid,(prior.result_payload->>'snapshotId')::uuid,(prior.result_payload->>'rowVersion')::bigint,prior.result_payload->>'status',true,(prior.result_payload->>'outboxId')::uuid;RETURN;END IF;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by) VALUES(p_tenant_id,'entity.case.lifecycle',p_idempotency_key,fingerprint,'processing',p_actor_id,'governed-entity-case',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO execution;
 PERFORM set_config('app.entity_case_command_execution_id',execution::text,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case:'||p_case_id::text,0));
 SELECT c.* INTO current FROM document.entity_case c WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Entity case was not found' USING ERRCODE='no_data_found';END IF;
 IF current.row_version<>p_expected_version THEN RAISE EXCEPTION 'Entity case version is stale' USING ERRCODE='serialization_failure';END IF;
 SELECT t.* INTO task FROM governance.cycle_task t JOIN governance.cycle_run r ON r.tenant_id=t.tenant_id AND r.id=t.cycle_run_id WHERE t.tenant_id=p_tenant_id AND t.id=p_cycle_task_id AND t.cycle_run_id=p_cycle_run_id FOR UPDATE OF t;IF NOT FOUND THEN RAISE EXCEPTION 'Cycle run and task binding was not found' USING ERRCODE='foreign_key_violation';END IF;
 SELECT s.payload_json INTO payload FROM snapshot.entity_snapshot s WHERE s.tenant_id=p_tenant_id AND s.snapshot_id=current.current_snapshot_id;IF NOT FOUND THEN RAISE EXCEPTION 'Current entity case snapshot was not found' USING ERRCODE='data_corrupted';END IF;
 next_version:=current.row_version+1;
 IF p_action='submit' THEN
  IF current.status<>'draft' OR task.status NOT IN('pending','ready','in_progress') THEN RAISE EXCEPTION 'Entity case or cycle task is not submittable' USING ERRCODE='object_not_in_prerequisite_state';END IF;
  IF cardinality(document.fn_validate_entity_case_payload((SELECT c.contract_json FROM runtime_meta.entity_contract c WHERE c.tenant_id=p_tenant_id AND c.id=current.entity_contract_id AND c.entity_contract_hash=current.entity_contract_hash AND c.status IN('published','superseded')),payload))>0 THEN RAISE EXCEPTION 'Entity case submission failed pinned contract validation' USING ERRCODE='check_violation';END IF;
  next_status:='submitted';lineage_role:='submitted_from';
 ELSE
  IF current.status NOT IN('submitted','in_review') OR p_actor_id=current.created_by OR task.status NOT IN('in_progress','ready') OR (task.owner_principal_id IS NOT NULL AND task.owner_principal_id<>p_actor_id) OR NOT EXISTS(SELECT 1 FROM governance.cycle_subject s WHERE s.tenant_id=p_tenant_id AND s.cycle_run_id=p_cycle_run_id AND s.cycle_task_id=p_cycle_task_id AND s.entity_case_id=p_case_id AND s.is_primary) THEN RAISE EXCEPTION 'Entity case decision violates workflow or maker-checker authority' USING ERRCODE='insufficient_privilege';END IF;
  next_status:=CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END;lineage_role:='decided_from';
 END IF;
 next_snapshot:=snapshot.fn_capture_entity('document.entity_case',p_case_id,current.case_code,1,current.entity_contract_hash,next_version,'entity.case.'||p_action,'version',payload,p_correlation_id,NULL,NULL,NULL,'legal','governed-entity-case');
 lineage_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,'sourceSnapshotId',current.current_snapshot_id,'targetSnapshotId',next_snapshot,'action',p_action,'version',next_version)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,lineage_role,transformation_code,transformation_version,evidence_hash,created_by) VALUES(p_tenant_id,p_case_id,current.current_snapshot_id,next_snapshot,lineage_role,'entity.case.'||p_action,'1',lineage_hash,p_actor_id);
 IF p_action='submit' THEN
  INSERT INTO governance.cycle_subject(tenant_id,cycle_run_id,cycle_task_id,subject_role,entity_case_id,is_primary,created_by) VALUES(p_tenant_id,p_cycle_run_id,p_cycle_task_id,'governed_case',p_case_id,true,p_actor_id);
  UPDATE governance.cycle_task t SET status='in_progress',started_at=COALESCE(t.started_at,clock_timestamp()),updated_by=p_actor_id,version=t.version+1 WHERE t.tenant_id=p_tenant_id AND t.id=p_cycle_task_id;
  UPDATE governance.cycle_run r SET status='running',started_at=COALESCE(r.started_at,clock_timestamp()),updated_by=p_actor_id,version=r.version+1 WHERE r.tenant_id=p_tenant_id AND r.id=p_cycle_run_id AND r.status IN('draft','scheduled');
  UPDATE document.entity_case c SET current_snapshot_id=next_snapshot,submitted_snapshot_id=next_snapshot,status=next_status,row_version=next_version,updated_by=p_actor_id WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id;
 ELSE
  UPDATE governance.cycle_task t SET status='completed',completed_at=clock_timestamp(),completion_evidence=jsonb_build_object('caseId',p_case_id,'decision',p_action,'snapshotId',next_snapshot,'reason',p_reason),updated_by=p_actor_id,version=t.version+1 WHERE t.tenant_id=p_tenant_id AND t.id=p_cycle_task_id;
  UPDATE governance.cycle_run r SET status='completed',completed_at=clock_timestamp(),updated_by=p_actor_id,version=version+1 WHERE r.tenant_id=p_tenant_id AND r.id=p_cycle_run_id AND NOT EXISTS(SELECT 1 FROM governance.cycle_task t WHERE t.tenant_id=r.tenant_id AND t.cycle_run_id=r.id AND t.id<>p_cycle_task_id AND t.is_mandatory AND t.status NOT IN('completed','waived','cancelled'));
  UPDATE document.entity_case c SET current_snapshot_id=next_snapshot,decision_snapshot_id=next_snapshot,status=next_status,row_version=next_version,updated_by=p_actor_id WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id;
 END IF;
 INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,result_code,result_snapshot_id,result_evidence,recorded_by) VALUES(p_tenant_id,p_case_id,command_code,p_idempotency_key,fingerprint,p_expected_version,current.row_version,next_version,current.status,next_status,'accepted',CASE WHEN p_action='submit' THEN 'ENTITY_CASE_SUBMITTED' WHEN p_action='approve' THEN 'ENTITY_CASE_APPROVED' ELSE 'ENTITY_CASE_REJECTED' END,next_snapshot,jsonb_build_object('cycleRunId',p_cycle_run_id,'cycleTaskId',p_cycle_task_id,'reason',p_reason),p_actor_id);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,correlation_id,partition_key,payload,created_by) VALUES(p_tenant_id,'governed-entity-case','entity.case.'||CASE WHEN p_action='submit' THEN 'submitted' ELSE 'decided' END,'entity-case:'||p_case_id::text||':v'||next_version::text||':'||p_idempotency_key,'document.entity_case',p_case_id,'entity_case',p_case_id,LEAST(next_version,2147483647)::integer,p_actor_id,'governed-entity-case',p_correlation_id,p_tenant_id::text,jsonb_build_object('caseId',p_case_id,'snapshotId',next_snapshot,'rowVersion',next_version,'status',next_status,'action',p_action,'cycleRunId',p_cycle_run_id,'cycleTaskId',p_cycle_task_id),p_actor_id) RETURNING id INTO outbox;
 result:=jsonb_build_object('caseId',p_case_id,'snapshotId',next_snapshot,'rowVersion',next_version,'status',next_status,'outboxId',outbox);UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
 RETURN QUERY SELECT p_case_id,next_snapshot,next_version,next_status,false,outbox;
END $$;

CREATE OR REPLACE FUNCTION document.command_entity_case_draft(
 p_tenant_id uuid,p_case_id uuid,p_expected_version bigint,p_base_snapshot_id uuid,p_case_code text,p_entity_code text,p_operation_code text,p_target_entity_id uuid,p_pre_materialization_ref text,
 p_entity_contract_id uuid,p_entity_contract_hash text,p_form_template_release_id uuid,p_form_template_release_no bigint,p_form_template_hash text,p_proposed_payload jsonb,p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL)
RETURNS TABLE(entity_case_id uuid,snapshot_id uuid,row_version bigint,status text,disposition text,conflict_paths text[],replayed boolean,outbox_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,document,snapshot,runtime_meta,event,shared,master SET row_security=on AS $$
DECLARE fingerprint text;prior event.command_execution%ROWTYPE;execution uuid;contract runtime_meta.entity_contract%ROWTYPE;current document.entity_case%ROWTYPE;base_payload jsonb;current_payload jsonb;candidate jsonb;merge_result record;errors text[];new_snapshot uuid;new_version bigint;outbox uuid;result jsonb;before_version bigint;outcome text;
BEGIN
 IF current_database()<>'athyper_'||current_setting('app.database_plane',true) OR shared.current_tenant_id()<>p_tenant_id OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Entity case command context mismatch' USING ERRCODE='insufficient_privilege';END IF;
 IF p_expected_version<0 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 OR jsonb_typeof(p_proposed_payload)<>'object' THEN RAISE EXCEPTION 'Entity case command arguments are invalid' USING ERRCODE='check_violation';END IF;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,'expectedVersion',p_expected_version,'baseSnapshotId',p_base_snapshot_id,'caseCode',p_case_code,'entityCode',p_entity_code,'operationCode',p_operation_code,'targetEntityId',p_target_entity_id,'preMaterializationRef',p_pre_materialization_ref,'contractId',p_entity_contract_id,'contractHash',p_entity_contract_hash,'formReleaseId',p_form_template_release_id,'formReleaseNo',p_form_template_release_no,'formHash',p_form_template_hash,'payload',p_proposed_payload,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case-command:'||p_idempotency_key,0));
 SELECT e.* INTO prior FROM event.command_execution e WHERE e.tenant_id=p_tenant_id AND e.command_code='entity.case.draft.write' AND e.idempotency_key=p_idempotency_key;
 IF FOUND THEN IF prior.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Entity case idempotency conflict' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT (prior.result_payload->>'caseId')::uuid,(prior.result_payload->>'snapshotId')::uuid,(prior.result_payload->>'rowVersion')::bigint,prior.result_payload->>'status',prior.result_payload->>'disposition',ARRAY(SELECT jsonb_array_elements_text(prior.result_payload->'conflictPaths')),true,(prior.result_payload->>'outboxId')::uuid;RETURN;END IF;
 SELECT c.* INTO contract FROM runtime_meta.entity_contract c WHERE c.tenant_id=p_tenant_id AND c.id=p_entity_contract_id AND c.entity_code=p_entity_code AND c.entity_contract_hash=p_entity_contract_hash AND c.status='published';IF NOT FOUND THEN RAISE EXCEPTION 'Pinned published entity contract was not found' USING ERRCODE='foreign_key_violation';END IF;
 errors:=document.fn_validate_entity_case_payload(contract.contract_json,p_proposed_payload);IF cardinality(errors)>0 THEN RAISE EXCEPTION 'Entity case payload failed contract validation: %',array_to_string(errors,',') USING ERRCODE='check_violation';END IF;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by) VALUES(p_tenant_id,'entity.case.draft.write',p_idempotency_key,fingerprint,'processing',p_actor_id,'governed-entity-case',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO execution;
 PERFORM set_config('app.entity_case_command_execution_id',execution::text,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case:'||p_case_id::text,0));
 SELECT c.* INTO current FROM document.entity_case c WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN
  IF p_expected_version<>0 OR p_base_snapshot_id IS NOT NULL THEN RAISE EXCEPTION 'Entity case was not found at expected version' USING ERRCODE='serialization_failure';END IF;candidate:=p_proposed_payload;before_version:=0;new_version:=1;outcome:='accepted';
  new_snapshot:=snapshot.fn_capture_entity('document.entity_case',p_case_id,p_case_code,1,p_entity_contract_hash,1,'entity.case.draft.created','create',candidate,p_correlation_id,NULL,NULL,NULL,'legal','governed-entity-case');
  INSERT INTO document.entity_case(id,tenant_id,case_code,entity_code,operation_code,target_entity_id,pre_materialization_ref,entity_contract_id,entity_contract_hash,form_template_release_id,form_template_release_no,form_template_hash,current_snapshot_id,status,row_version,idempotency_key,created_by,owner_company_code_id) VALUES(p_case_id,p_tenant_id,p_case_code,p_entity_code,p_operation_code,p_target_entity_id,p_pre_materialization_ref,p_entity_contract_id,p_entity_contract_hash,p_form_template_release_id,p_form_template_release_no,p_form_template_hash,new_snapshot,'draft',1,p_idempotency_key,p_actor_id,CASE WHEN p_entity_code='master.business_partner_company_setup_request' THEN NULLIF(candidate->>'companyCodeId','')::uuid ELSE NULL END);
 ELSE
  IF ROW(current.case_code,current.entity_code,current.operation_code,current.target_entity_id,current.pre_materialization_ref,current.entity_contract_id,current.entity_contract_hash,current.form_template_release_id,current.form_template_release_no,current.form_template_hash) IS DISTINCT FROM ROW(p_case_code,p_entity_code,p_operation_code,p_target_entity_id,p_pre_materialization_ref,p_entity_contract_id,p_entity_contract_hash,p_form_template_release_id,p_form_template_release_no,p_form_template_hash) OR current.status<>'draft' THEN RAISE EXCEPTION 'Entity case identity or lifecycle is not draft-editable' USING ERRCODE='object_not_in_prerequisite_state';END IF;
  IF p_expected_version>current.row_version THEN RAISE EXCEPTION 'Entity case expected version is ahead of current state' USING ERRCODE='serialization_failure';END IF;before_version:=current.row_version;
  SELECT s.payload_json INTO current_payload FROM snapshot.entity_snapshot s WHERE s.tenant_id=p_tenant_id AND s.snapshot_id=current.current_snapshot_id;
  IF p_expected_version=current.row_version THEN candidate:=p_proposed_payload;conflict_paths:='{}';outcome:='accepted';
  ELSE SELECT s.payload_json INTO base_payload FROM snapshot.entity_snapshot s JOIN snapshot.entity_snapshot_identity i ON i.tenant_id=s.tenant_id AND i.id=s.snapshot_id WHERE s.tenant_id=p_tenant_id AND s.snapshot_id=p_base_snapshot_id AND i.entity_type='document.entity_case' AND i.entity_id=p_case_id AND i.version_number=p_expected_version;IF NOT FOUND THEN RAISE EXCEPTION 'Entity case merge base does not match expected case and version' USING ERRCODE='serialization_failure';END IF;SELECT * INTO merge_result FROM document.fn_entity_case_three_way_merge(base_payload,current_payload,p_proposed_payload);candidate:=merge_result.merged;conflict_paths:=merge_result.conflicts;outcome:=CASE WHEN cardinality(conflict_paths)>0 THEN 'conflict' ELSE 'accepted' END;END IF;
  IF outcome='accepted' THEN new_version:=current.row_version+1;new_snapshot:=snapshot.fn_capture_entity('document.entity_case',p_case_id,p_case_code,1,p_entity_contract_hash,new_version,'entity.case.draft.revised','version',candidate,p_correlation_id,NULL,NULL,NULL,'legal','governed-entity-case');UPDATE document.entity_case c SET current_snapshot_id=new_snapshot,row_version=new_version,updated_by=p_actor_id WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id;ELSE new_version:=current.row_version;new_snapshot:=current.current_snapshot_id;END IF;
 END IF;
 conflict_paths:=COALESCE(conflict_paths,'{}');INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,result_code,result_snapshot_id,result_evidence,recorded_by) VALUES(p_tenant_id,p_case_id,'entity.case.draft.write',p_idempotency_key,fingerprint,p_expected_version,before_version,new_version,'draft','draft',outcome,CASE WHEN outcome='conflict' THEN 'ENTITY_CASE_MERGE_CONFLICT' ELSE 'ENTITY_CASE_DRAFT_APPLIED' END,new_snapshot,jsonb_build_object('conflictPaths',conflict_paths),p_actor_id);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,correlation_id,partition_key,payload,created_by) VALUES(p_tenant_id,'governed-entity-case',CASE WHEN outcome='conflict' THEN 'entity.case.draft.conflicted' ELSE 'entity.case.draft.saved' END,'entity-case:'||p_case_id::text||':v'||new_version::text||':'||p_idempotency_key,'document.entity_case',p_case_id,'entity_case',p_case_id,LEAST(new_version,2147483647)::integer,p_actor_id,'governed-entity-case',p_correlation_id,p_tenant_id::text,jsonb_build_object('caseId',p_case_id,'snapshotId',new_snapshot,'rowVersion',new_version,'status','draft','disposition',outcome,'conflictPaths',conflict_paths,'contractHash',p_entity_contract_hash),p_actor_id) RETURNING id INTO outbox;
 result:=jsonb_build_object('caseId',p_case_id,'snapshotId',new_snapshot,'rowVersion',new_version,'status','draft','disposition',outcome,'conflictPaths',conflict_paths,'outboxId',outbox);UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
 RETURN QUERY SELECT p_case_id,new_snapshot,new_version,'draft',outcome,conflict_paths,false,outbox;
END $$;

-- Plane-global discovery boundary for the scheduler. Tenant work is returned
-- as coordinates only; each child sweep re-enters tenant RLS independently.
CREATE OR REPLACE FUNCTION document.fn_workflow_sla_due_tenants(
    p_at timestamptz,
    p_limit integer DEFAULT 500
)
RETURNS TABLE (tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = document, master, pg_catalog
AS $$
BEGIN
    IF p_at IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'invalid workflow SLA tenant-discovery arguments';
    END IF;
    RETURN QUERY
    SELECT tenant.id
      FROM master.tenant AS tenant
     WHERE tenant.status = 'active'
       AND EXISTS (
           SELECT 1
             FROM document.work_item AS item
            WHERE item.tenant_id = tenant.id
              AND item.status IN ('open','claimed','in_progress','blocked')
              AND item.due_at <= p_at
              AND NOT (item.payload ? 'sla_breach')
       )
     ORDER BY tenant.id
     LIMIT p_limit;
END;
$$;


CREATE OR REPLACE FUNCTION document.trg_company_owned_case() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE payload jsonb;
BEGIN
 IF TG_OP='UPDATE' AND OLD.entity_code='master.business_partner_company_setup_request' AND
    (NEW.tenant_id,NEW.id,NEW.entity_code,NEW.owner_company_code_id,NEW.target_entity_id)
    IS DISTINCT FROM (OLD.tenant_id,OLD.id,OLD.entity_code,OLD.owner_company_code_id,OLD.target_entity_id) THEN
   RAISE EXCEPTION 'COMPANY_CASE_OWNER_IMMUTABLE' USING ERRCODE='check_violation';
 END IF;
 IF TG_OP='UPDATE' AND OLD.entity_code<>NEW.entity_code AND NEW.entity_code='master.business_partner_company_setup_request' THEN
   RAISE EXCEPTION 'COMPANY_CASE_RECLASSIFICATION_FORBIDDEN' USING ERRCODE='check_violation';
 END IF;
 IF NEW.entity_code<>'master.business_partner_company_setup_request' THEN RETURN NEW; END IF;
 SELECT payload_json INTO STRICT payload FROM snapshot.entity_snapshot
 WHERE tenant_id=NEW.tenant_id AND snapshot_id=NEW.current_snapshot_id;
 IF NEW.owner_company_code_id IS NULL OR NEW.target_entity_id IS NULL
    OR payload->>'companyCodeId' IS DISTINCT FROM NEW.owner_company_code_id::text
    OR NEW.operation_code IS DISTINCT FROM 'configure_company' THEN
   RAISE EXCEPTION 'COMPANY_CASE_SNAPSHOT_OWNER_MISMATCH' USING ERRCODE='check_violation';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM master.business_partner WHERE tenant_id=NEW.tenant_id AND id=NEW.target_entity_id)
    OR NOT EXISTS(SELECT 1 FROM master.company_code WHERE tenant_id=NEW.tenant_id AND id=NEW.owner_company_code_id AND status='active' AND is_active)
    OR NOT EXISTS(SELECT 1 FROM master.operating_organization o
      JOIN master.operating_organization_company_assignment a ON a.tenant_id=o.tenant_id AND a.operating_organization_id=o.id
      WHERE o.tenant_id=NEW.tenant_id AND o.id::text=payload->>'operatingOrganizationId' AND o.status='active'
       AND a.company_code_id=NEW.owner_company_code_id AND a.status='active'
       AND a.effective_from<=current_date AND (a.effective_until IS NULL OR a.effective_until>current_date)) THEN
   RAISE EXCEPTION 'COMPANY_CASE_CATALOG_INCOMPATIBLE' USING ERRCODE='check_violation';
 END IF;
 RETURN NEW;
END $$;
