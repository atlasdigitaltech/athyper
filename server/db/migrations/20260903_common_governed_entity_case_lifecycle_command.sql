-- G1 cycle-bound submit and maker-checker decision command, shared by all planes.
BEGIN;
DO $$ BEGIN IF current_database() NOT IN('athyper_studio','athyper_neon','athyper_mesh') OR current_setting('app.database_plane',true) NOT IN('studio','neon','mesh') OR current_database()<>'athyper_'||current_setting('app.database_plane',true) THEN RAISE EXCEPTION 'Governed entity-case lifecycle command requires a supported matching plane';END IF;END $$;

CREATE OR REPLACE FUNCTION document.trg_guard_entity_case_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,event AS $$
DECLARE execution uuid:=NULLIF(current_setting('app.entity_case_command_execution_id',true),'')::uuid;tenant uuid:=COALESCE(NEW.tenant_id,OLD.tenant_id);
BEGIN
 IF execution IS NULL OR NOT EXISTS(SELECT 1 FROM event.command_execution e WHERE e.id=execution AND e.tenant_id=tenant AND e.command_code IN('entity.case.draft.write','entity.case.lifecycle') AND e.status='processing' AND e.actor_principal_id=master.current_principal_id_soft()) THEN RAISE EXCEPTION 'Entity case mutations require the governed command' USING ERRCODE='insufficient_privilege';END IF;RETURN COALESCE(NEW,OLD);
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
  IF cardinality(document.fn_validate_entity_case_payload((SELECT c.contract_json FROM runtime_meta.entity_contract c WHERE c.tenant_id=p_tenant_id AND c.id=current.entity_contract_id AND c.entity_contract_hash=current.entity_contract_hash AND c.status='published'),payload))>0 THEN RAISE EXCEPTION 'Entity case submission failed pinned contract validation' USING ERRCODE='check_violation';END IF;
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
  UPDATE governance.cycle_run r SET status='completed',completed_at=clock_timestamp(),updated_by=p_actor_id,version=r.version+1 WHERE r.tenant_id=p_tenant_id AND r.id=p_cycle_run_id AND NOT EXISTS(SELECT 1 FROM governance.cycle_task t WHERE t.tenant_id=r.tenant_id AND t.cycle_run_id=r.id AND t.id<>p_cycle_task_id AND t.is_mandatory AND t.status NOT IN('completed','waived','cancelled'));
  UPDATE document.entity_case c SET current_snapshot_id=next_snapshot,decision_snapshot_id=next_snapshot,status=next_status,row_version=next_version,updated_by=p_actor_id WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id;
 END IF;
 INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,result_code,result_snapshot_id,result_evidence,recorded_by) VALUES(p_tenant_id,p_case_id,command_code,p_idempotency_key,fingerprint,p_expected_version,current.row_version,next_version,current.status,next_status,'accepted',CASE WHEN p_action='submit' THEN 'ENTITY_CASE_SUBMITTED' WHEN p_action='approve' THEN 'ENTITY_CASE_APPROVED' ELSE 'ENTITY_CASE_REJECTED' END,next_snapshot,jsonb_build_object('cycleRunId',p_cycle_run_id,'cycleTaskId',p_cycle_task_id,'reason',p_reason),p_actor_id);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,correlation_id,partition_key,payload,created_by) VALUES(p_tenant_id,'governed-entity-case','entity.case.'||CASE WHEN p_action='submit' THEN 'submitted' ELSE 'decided' END,'entity-case:'||p_case_id::text||':v'||next_version::text||':'||p_idempotency_key,'document.entity_case',p_case_id,'entity_case',p_case_id,LEAST(next_version,2147483647)::integer,p_actor_id,'governed-entity-case',p_correlation_id,p_tenant_id::text,jsonb_build_object('caseId',p_case_id,'snapshotId',next_snapshot,'rowVersion',next_version,'status',next_status,'action',p_action,'cycleRunId',p_cycle_run_id,'cycleTaskId',p_cycle_task_id),p_actor_id) RETURNING id INTO outbox;
 result:=jsonb_build_object('caseId',p_case_id,'snapshotId',next_snapshot,'rowVersion',next_version,'status',next_status,'outboxId',outbox);UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
 RETURN QUERY SELECT p_case_id,next_snapshot,next_version,next_status,false,outbox;
END $$;

REVOKE ALL ON FUNCTION document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT EXECUTE ON FUNCTION document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid) TO athyperapp;END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT EXECUTE ON FUNCTION document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid) TO athyperadmin;END IF;
END $$;
COMMIT;
