-- Canonical task interaction storage/commands. Applied after the base document grants.
CREATE TABLE IF NOT EXISTS document.process_task_information (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
 tenant_id uuid NOT NULL,
 case_id uuid NOT NULL,
 attempt_id uuid NOT NULL,
 work_item_id uuid NOT NULL,
 source_information_id uuid,
 requested_by uuid NOT NULL,
 respondent_id uuid NOT NULL,
 question text NOT NULL CHECK(length(btrim(question)) BETWEEN 1 AND 2000),
 response text CHECK(length(btrim(response)) BETWEEN 1 AND 4000),
 state text NOT NULL DEFAULT 'open' CHECK(state IN('open','answered','resolved','cancelled')),
 due_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 answered_at timestamptz,
 closed_at timestamptz,
 CONSTRAINT process_task_information_tenant_uq UNIQUE(tenant_id,id),
 CONSTRAINT process_task_information_case_fk FOREIGN KEY(tenant_id,case_id) REFERENCES document.entity_case(tenant_id,id),
 CONSTRAINT process_task_information_attempt_fk FOREIGN KEY(tenant_id,attempt_id) REFERENCES governance.process_attempt(tenant_id,id),
 CONSTRAINT process_task_information_item_fk FOREIGN KEY(tenant_id,work_item_id) REFERENCES document.work_item(tenant_id,id),
 CONSTRAINT process_task_information_source_fk FOREIGN KEY(tenant_id,source_information_id) REFERENCES document.process_task_information(tenant_id,id),
 CONSTRAINT process_task_information_response_chk CHECK((state IN('answered','resolved')) IS NOT TRUE OR (response IS NOT NULL AND answered_at IS NOT NULL)),
 CONSTRAINT process_task_information_closure_chk CHECK((state IN('resolved','cancelled'))=(closed_at IS NOT NULL))
);
-- Canonical additive columns also support existing local installations.
ALTER TABLE document.process_task_information ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'clarification' CHECK(kind IN('clarification','consultation'));
ALTER TABLE document.process_task_information ADD COLUMN IF NOT EXISTS decision_due_before timestamptz;
ALTER TABLE document.process_task_information ADD COLUMN IF NOT EXISTS pause_started_at timestamptz;
ALTER TABLE document.process_task_information ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
ALTER TABLE document.process_task_information ADD COLUMN IF NOT EXISTS escalated_to uuid;
ALTER TABLE document.process_task_information ADD COLUMN IF NOT EXISTS escalation_reason text;
CREATE UNIQUE INDEX IF NOT EXISTS process_task_information_open_uq ON document.process_task_information(tenant_id,work_item_id) WHERE state IN('open','answered');
CREATE TABLE IF NOT EXISTS document.process_task_interaction_receipt (
 tenant_id uuid NOT NULL,
 idempotency_key text NOT NULL,
 case_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 fingerprint text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,case_id) REFERENCES document.entity_case(tenant_id,id)
);
ALTER TABLE document.process_task_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.process_task_information FORCE ROW LEVEL SECURITY;
ALTER TABLE document.process_task_interaction_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.process_task_interaction_receipt FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON document.process_task_information;
CREATE POLICY tenant_access ON document.process_task_information FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());
DROP POLICY IF EXISTS tenant_access ON document.process_task_interaction_receipt;
CREATE POLICY tenant_access ON document.process_task_interaction_receipt FOR SELECT USING(tenant_id=shared.current_tenant_id_soft() AND actor_id=master.current_principal_id_soft());

CREATE OR REPLACE FUNCTION document.command_process_task_information(
 p_tenant uuid,p_case uuid,p_item uuid,p_attempt uuid,p_action text,p_expected bigint,p_text text,p_key text,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c document.entity_case%ROWTYPE; i document.work_item%ROWTYPE; a governance.process_attempt%ROWTYPE;
 x document.process_task_information%ROWTYPE; prior document.process_task_interaction_receipt%ROWTYPE;
 binding jsonb; config jsonb; fingerprint text; result jsonb; recipient uuid; hours integer; decision_due timestamptz; started timestamptz; supervisors uuid[]; automatic boolean;
BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true) IS DISTINCT FROM 'neon'
  OR shared.current_tenant_id() IS DISTINCT FROM p_tenant OR master.current_principal_id_soft() IS DISTINCT FROM p_actor
  OR p_actor IS NULL THEN RAISE EXCEPTION 'PROCESS_INFORMATION_FORBIDDEN' USING ERRCODE='insufficient_privilege'; END IF;
 IF p_action IS NULL OR p_action NOT IN('request','respond','resolve','escalate') OR p_expected IS NULL OR p_expected<1
  OR p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 160 OR btrim(p_key)<>p_key
  OR (p_action IN('request','respond','escalate') AND (p_text IS NULL OR length(btrim(p_text)) NOT BETWEEN 1 AND CASE WHEN p_action='request' THEN 2000 ELSE 4000 END))
  OR (p_action='resolve' AND p_text IS NOT NULL) THEN RAISE EXCEPTION 'PROCESS_INFORMATION_INPUT_INVALID' USING ERRCODE='check_violation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':entity-case:'||p_case::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':task-interaction:'||p_key,0));
 SELECT * INTO c FROM document.entity_case WHERE tenant_id=p_tenant AND id=p_case FOR UPDATE;
 SELECT * INTO i FROM document.work_item WHERE tenant_id=p_tenant AND id=p_item AND source_entity_id=p_case FOR UPDATE;
 IF c.id IS NULL OR i.id IS NULL THEN RAISE EXCEPTION 'PROCESS_INFORMATION_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
 automatic:=COALESCE(p_action='escalate' AND session_user='athyper_worker' AND p_actor=event.fn_notification_worker_principal(p_tenant) AND EXISTS(SELECT 1 FROM document.process_task_information q WHERE q.tenant_id=p_tenant AND q.work_item_id=p_item AND q.state='open' AND q.due_at<=clock_timestamp()),false);
 IF NOT automatic AND ((p_action='respond' AND c.created_by IS DISTINCT FROM p_actor AND NOT EXISTS(SELECT 1 FROM document.process_task_information q WHERE q.tenant_id=p_tenant AND q.work_item_id=p_item AND q.respondent_id=p_actor AND q.kind='consultation')) OR (p_action<>'respond' AND (i.assignee_principal_id IS DISTINCT FROM p_actor OR (i.claimant_principal_id IS NOT NULL AND i.claimant_principal_id<>p_actor)
  OR NOT EXISTS(SELECT 1 FROM document.process_case_reviewers(p_tenant,p_case,NULL) r WHERE r.principal_id=p_actor))))
 THEN RAISE EXCEPTION 'PROCESS_INFORMATION_FORBIDDEN' USING ERRCODE='insufficient_privilege'; END IF;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object('case',p_case,'item',p_item,'attempt',p_attempt,'action',p_action,'version',p_expected,'text',p_text,'actor',p_actor)::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO prior FROM document.process_task_interaction_receipt WHERE tenant_id=p_tenant AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.fingerprint<>fingerprint OR prior.actor_id<>p_actor THEN RAISE EXCEPTION 'PROCESS_INFORMATION_REPLAY_CONFLICT' USING ERRCODE='unique_violation'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO a FROM governance.process_attempt WHERE tenant_id=p_tenant AND id=p_attempt AND case_id=p_case;
 IF a.id IS NULL OR c.status NOT IN('submitted','in_review') OR c.submitted_snapshot_id<>a.submission_snapshot_id
  OR i.payload->>'attemptId' IS DISTINCT FROM p_attempt::text OR i.status NOT IN('open','claimed') OR i.row_version<>p_expected
  OR a.attempt_number<>(SELECT max(attempt_number) FROM governance.process_attempt WHERE tenant_id=p_tenant AND case_id=p_case)
  OR NOT EXISTS(SELECT 1 FROM document.workflow_stage s WHERE s.tenant_id=p_tenant AND s.id=(i.payload->>'workflowStageId')::uuid AND s.status='active')
  OR NOT EXISTS(SELECT 1 FROM governance.process_document_job j WHERE j.tenant_id=p_tenant AND j.id=a.review_pack_job_id AND j.status='ready')
 THEN RAISE EXCEPTION 'PROCESS_INFORMATION_STALE' USING ERRCODE='serialization_failure'; END IF;
 SELECT t INTO binding FROM governance.process_selection_evidence e CROSS JOIN LATERAL jsonb_array_elements(e.evidence->'executionManifest'->'tasks') t
  WHERE e.tenant_id=p_tenant AND e.id=a.selection_id AND t->>'taskTemplateId'=i.payload->>'taskTemplateId';
 SELECT * INTO x FROM document.process_task_information WHERE tenant_id=p_tenant AND work_item_id=p_item AND state IN('open','answered') FOR UPDATE;
 IF p_action<>'request' AND x.kind='consultation' THEN
  config:=binding->'escalationPolicy';
  IF config->>'schema' IS DISTINCT FROM 'athyper.task-escalation-policy/1' OR config->>'mode' IS DISTINCT FROM 'consult'
   OR (p_action='respond' AND NOT EXISTS(SELECT 1 FROM document.process_case_reviewers(p_tenant,p_case,config->>'supervisorRole') r WHERE r.principal_id=p_actor))
  THEN RAISE EXCEPTION 'PROCESS_CONSULTATION_FORBIDDEN' USING ERRCODE='insufficient_privilege'; END IF;
  config:=jsonb_build_object('schema','athyper.task-information-policy/1','clockMode','elapsed','responseHours',config->'responseHours');
 ELSE config:=binding->'informationPolicy'; END IF;
 IF config->>'schema' IS DISTINCT FROM 'athyper.task-information-policy/1' OR jsonb_typeof(config->'responseHours') IS DISTINCT FROM 'number'
  OR COALESCE(config->>'clockMode','') NOT IN('elapsed','bounded_pause') THEN RAISE EXCEPTION 'PROCESS_INFORMATION_NOT_CONFIGURED' USING ERRCODE='check_violation'; END IF;
 hours:=(config->>'responseHours')::integer;
 IF hours NOT BETWEEN 1 AND 168 THEN RAISE EXCEPTION 'PROCESS_INFORMATION_NOT_CONFIGURED' USING ERRCODE='check_violation'; END IF;
 decision_due:=i.due_at;
 SELECT * INTO x FROM document.process_task_information WHERE tenant_id=p_tenant AND work_item_id=p_item AND state IN('open','answered') FOR UPDATE;
 IF p_action='request' THEN
  IF x.id IS NOT NULL THEN RAISE EXCEPTION 'PROCESS_INFORMATION_ALREADY_OPEN' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  started:=clock_timestamp();
  INSERT INTO document.process_task_information(tenant_id,case_id,attempt_id,work_item_id,requested_by,respondent_id,question,due_at,decision_due_before,pause_started_at)
   VALUES(p_tenant,p_case,p_attempt,p_item,p_actor,c.created_by,btrim(p_text),started+make_interval(hours=>hours),
    CASE WHEN config->>'clockMode'='bounded_pause' THEN i.due_at END,
    CASE WHEN config->>'clockMode'='bounded_pause' THEN started END) RETURNING * INTO x;
  IF x.pause_started_at IS NOT NULL THEN decision_due:=i.due_at+make_interval(hours=>hours); END IF;
  recipient:=x.respondent_id;
 ELSIF p_action='escalate' THEN
  IF x.id IS NULL OR x.state<>'open' OR x.kind<>'clarification' OR x.escalated_at IS NOT NULL
    OR NULLIF(config->>'overdueSupervisorRole','') IS NULL THEN RAISE EXCEPTION 'PROCESS_INFORMATION_ESCALATION_UNAVAILABLE' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  -- The supervisor may already own the approval task. The overdue responsibility belongs to the respondent.
  IF automatic THEN PERFORM set_config('app.current_principal_id',i.assignee_principal_id::text,true); END IF;
  SELECT array_agg(DISTINCT r.principal_id) INTO supervisors FROM document.process_case_reviewers(p_tenant,p_case,config->>'overdueSupervisorRole') r WHERE r.principal_id<>x.respondent_id;
  IF automatic THEN PERFORM set_config('app.current_principal_id',p_actor::text,true); END IF;
  IF COALESCE(cardinality(supervisors),0)<>1 THEN RAISE EXCEPTION 'PROCESS_SUPERVISOR_UNRESOLVED' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  recipient:=supervisors[1];
  UPDATE document.process_task_information SET escalated_at=clock_timestamp(),escalated_to=recipient,escalation_reason=btrim(p_text) WHERE tenant_id=p_tenant AND id=x.id RETURNING * INTO x;
 ELSIF p_action='respond' THEN
  IF x.id IS NULL OR x.state<>'open' OR x.respondent_id<>p_actor THEN RAISE EXCEPTION 'PROCESS_INFORMATION_NOT_ACTIONABLE' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  UPDATE document.process_task_information SET response=btrim(p_text),answered_at=clock_timestamp(),state='answered' WHERE tenant_id=p_tenant AND id=x.id RETURNING * INTO x;
  recipient:=i.assignee_principal_id;
 ELSE
  IF x.id IS NULL OR x.state<>'answered' THEN RAISE EXCEPTION 'PROCESS_INFORMATION_NOT_ACTIONABLE' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  UPDATE document.process_task_information SET state='resolved',closed_at=clock_timestamp() WHERE tenant_id=p_tenant AND id=x.id RETURNING * INTO x;
  IF x.pause_started_at IS NOT NULL THEN decision_due:=x.decision_due_before+GREATEST(interval '0',LEAST(x.closed_at,x.due_at)-x.pause_started_at); END IF;
  recipient:=i.assignee_principal_id;
 END IF;
 UPDATE document.work_item SET due_at=decision_due,row_version=row_version+1,updated_by=p_actor WHERE tenant_id=p_tenant AND id=p_item;
 result:=jsonb_build_object('informationId',x.id,'attemptId',p_attempt,'workItemId',p_item,'state',x.state,'workItemVersion',p_expected+1,'replayed',false);
 INSERT INTO document.process_task_interaction_receipt(tenant_id,idempotency_key,case_id,actor_id,fingerprint,result) VALUES(p_tenant,p_key,p_case,p_actor,fingerprint,result);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,payload,created_by)
  VALUES(p_tenant,'workflow','workflow.task.information_'||p_action,'task-information:'||x.id::text||':'||p_action,'business_partner_case',p_case,'workflow.work_item',p_item,p_actor,'supplier-process.information',
   jsonb_build_object('information_id',x.id,'attempt_id',p_attempt,'work_item_id',p_item,'entity_type','business_partner_case','entity_id',p_case,'recipient_principal_ids',jsonb_build_array(recipient)),p_actor);
 RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION document.trg_process_task_information_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.payload->>'attemptId' IS NULL THEN RETURN NEW; END IF;
 IF NEW.status='completed' AND NEW.outcome->>'decision' IN('approve','accept_review')
  AND EXISTS(SELECT 1 FROM document.process_task_information x WHERE x.tenant_id=NEW.tenant_id AND x.work_item_id=NEW.id AND x.kind='clarification' AND x.state IN('open','answered'))
 THEN RAISE EXCEPTION 'PROCESS_INFORMATION_PENDING' USING ERRCODE='check_violation'; END IF;
 IF NEW.status IN('completed','cancelled') THEN
  UPDATE document.process_task_information SET state='cancelled',closed_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND work_item_id=NEW.id AND state IN('open','answered');
 END IF;
 RETURN NEW;
END; $$;
-- The trigger owns automatic cancellation; callers never receive table-write privileges.
ALTER FUNCTION document.trg_process_task_information_guard() SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_process_task_information_guard ON document.work_item;
CREATE TRIGGER trg_process_task_information_guard BEFORE UPDATE ON document.work_item FOR EACH ROW EXECUTE FUNCTION document.trg_process_task_information_guard();
REVOKE ALL ON FUNCTION document.command_process_task_information(uuid,uuid,uuid,uuid,text,bigint,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION document.trg_process_task_information_guard() FROM PUBLIC;
REVOKE ALL ON document.process_task_information,document.process_task_interaction_receipt FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
 REVOKE ALL ON document.process_task_information,document.process_task_interaction_receipt FROM athyperapp;
 GRANT SELECT ON document.process_task_information,document.process_task_interaction_receipt TO athyperapp;
 GRANT EXECUTE ON FUNCTION document.command_process_task_information(uuid,uuid,uuid,uuid,text,bigint,text,text,uuid) TO athyperapp;
END IF; END $$;

CREATE TABLE IF NOT EXISTS document.process_task_assignment_history (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, case_id uuid NOT NULL, attempt_id uuid NOT NULL,
 previous_work_item_id uuid NOT NULL, replacement_work_item_id uuid,
 previous_assignee_id uuid NOT NULL, supervisor_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN('notify','consult','reassign')), reason text NOT NULL,
 actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,case_id) REFERENCES document.entity_case(tenant_id,id),
 FOREIGN KEY(tenant_id,attempt_id) REFERENCES governance.process_attempt(tenant_id,id),
 FOREIGN KEY(tenant_id,previous_work_item_id) REFERENCES document.work_item(tenant_id,id),
 FOREIGN KEY(tenant_id,replacement_work_item_id) REFERENCES document.work_item(tenant_id,id)
);
ALTER TABLE document.process_task_assignment_history DROP CONSTRAINT IF EXISTS process_task_assignment_history_mode_check;
ALTER TABLE document.process_task_assignment_history ADD CONSTRAINT process_task_assignment_history_mode_check CHECK(mode IN('notify','consult','reassign'));
ALTER TABLE document.process_task_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.process_task_assignment_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON document.process_task_assignment_history;
CREATE POLICY tenant_access ON document.process_task_assignment_history FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());

CREATE OR REPLACE FUNCTION document.command_process_task_escalate(
 p_tenant uuid,p_case uuid,p_item uuid,p_attempt uuid,p_expected bigint,p_reason text,p_key text,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c document.entity_case%ROWTYPE; i document.work_item%ROWTYPE; a governance.process_attempt%ROWTYPE;
 w document.workflow_request%ROWTYPE; stage document.workflow_stage%ROWTYPE; x document.process_task_information%ROWTYPE;
 prior document.process_task_interaction_receipt%ROWTYPE; binding jsonb; config jsonb; fingerprint text; result jsonb;
 targets uuid[]; target uuid; continuation uuid; continuation_action text; candidate jsonb; candidates jsonb; approval jsonb; payload jsonb;
 replacement uuid; history_id uuid; stage_index integer;
BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true) IS DISTINCT FROM 'neon'
  OR shared.current_tenant_id() IS DISTINCT FROM p_tenant OR master.current_principal_id_soft() IS DISTINCT FROM p_actor OR p_actor IS NULL
 THEN RAISE EXCEPTION 'PROCESS_ESCALATION_FORBIDDEN' USING ERRCODE='insufficient_privilege'; END IF;
 IF p_expected IS NULL OR p_expected<1 OR p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 160 OR btrim(p_key)<>p_key
  OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'PROCESS_ESCALATION_INPUT_INVALID' USING ERRCODE='check_violation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':entity-case:'||p_case::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':task-interaction:'||p_key,0));
 SELECT * INTO c FROM document.entity_case WHERE tenant_id=p_tenant AND id=p_case FOR UPDATE;
 SELECT * INTO i FROM document.work_item WHERE tenant_id=p_tenant AND id=p_item AND source_entity_id=p_case FOR UPDATE;
 IF c.id IS NULL OR i.id IS NULL OR i.assignee_principal_id IS DISTINCT FROM p_actor
  OR (i.claimant_principal_id IS NOT NULL AND i.claimant_principal_id<>p_actor)
  OR NOT EXISTS(SELECT 1 FROM document.process_case_reviewers(p_tenant,p_case,NULL) r WHERE r.principal_id=p_actor)
 THEN RAISE EXCEPTION 'PROCESS_ESCALATION_FORBIDDEN' USING ERRCODE='insufficient_privilege'; END IF;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object('case',p_case,'item',p_item,'attempt',p_attempt,'version',p_expected,'reason',p_reason,'actor',p_actor,'action','escalate')::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO prior FROM document.process_task_interaction_receipt WHERE tenant_id=p_tenant AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.fingerprint<>fingerprint OR prior.actor_id<>p_actor THEN RAISE EXCEPTION 'PROCESS_ESCALATION_REPLAY_CONFLICT' USING ERRCODE='unique_violation'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO a FROM governance.process_attempt WHERE tenant_id=p_tenant AND id=p_attempt AND case_id=p_case;
 SELECT * INTO w FROM document.workflow_request WHERE tenant_id=p_tenant AND id=(i.payload->>'workflowRequestId')::uuid FOR UPDATE;
 SELECT * INTO stage FROM document.workflow_stage WHERE tenant_id=p_tenant AND id=(i.payload->>'workflowStageId')::uuid AND workflow_request_id=w.id FOR UPDATE;
 IF a.id IS NULL OR c.status NOT IN('submitted','in_review') OR c.submitted_snapshot_id<>a.submission_snapshot_id
  OR i.payload->>'attemptId' IS DISTINCT FROM p_attempt::text OR i.status NOT IN('open','claimed') OR i.row_version<>p_expected
  OR stage.status IS DISTINCT FROM 'active' OR w.status IN('approved','rejected','cancelled')
  OR a.attempt_number<>(SELECT max(attempt_number) FROM governance.process_attempt WHERE tenant_id=p_tenant AND case_id=p_case)
  OR NOT EXISTS(SELECT 1 FROM governance.process_document_job j WHERE j.tenant_id=p_tenant AND j.id=a.review_pack_job_id AND j.status='ready')
 THEN RAISE EXCEPTION 'PROCESS_ESCALATION_STALE' USING ERRCODE='serialization_failure'; END IF;
 SELECT t INTO binding FROM governance.process_selection_evidence e CROSS JOIN LATERAL jsonb_array_elements(e.evidence->'executionManifest'->'tasks') t
  WHERE e.tenant_id=p_tenant AND e.id=a.selection_id AND t->>'taskTemplateId'=i.payload->>'taskTemplateId';
 config:=binding->'escalationPolicy';
 IF config->>'schema' IS DISTINCT FROM 'athyper.task-escalation-policy/1' OR config->>'mode' IS NULL OR config->>'mode' NOT IN('notify','consult','reassign')
  OR NULLIF(config->>'supervisorRole','') IS NULL THEN RAISE EXCEPTION 'PROCESS_ESCALATION_NOT_CONFIGURED' USING ERRCODE='check_violation'; END IF;
 SELECT array_agg(DISTINCT r.principal_id) INTO targets FROM document.process_case_reviewers(p_tenant,p_case,config->>'supervisorRole') r
  WHERE r.principal_id<>p_actor AND r.principal_id<>c.created_by;
 IF COALESCE(cardinality(targets),0)<>1 THEN RAISE EXCEPTION 'PROCESS_SUPERVISOR_UNRESOLVED' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 target:=targets[1];
 IF config->>'mode'='reassign' THEN
  stage_index:=stage.stage_no-1;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(w.template_snapshot->'stages'->stage_index->'approvers') selector
    CROSS JOIN LATERAL document.process_case_reviewers(p_tenant,p_case,selector->>'roleCode') r
    WHERE selector->>'kind'='role' AND r.principal_id=target)
   OR EXISTS(SELECT 1 FROM document.work_item other WHERE other.tenant_id=p_tenant AND other.cycle_task_id=i.cycle_task_id
     AND other.payload->>'workflowStageId'=stage.id::text AND other.assignee_principal_id=target)
  THEN RAISE EXCEPTION 'PROCESS_SUPERVISOR_INELIGIBLE' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO x FROM document.process_task_information WHERE tenant_id=p_tenant AND work_item_id=p_item AND state IN('open','answered') FOR UPDATE;
  -- Cancel the old immutable assignment before replacing its seat. Its evidence remains untouched.
  UPDATE document.work_item SET status='cancelled',completed_at=clock_timestamp(),row_version=row_version+1,updated_by=p_actor WHERE tenant_id=p_tenant AND id=p_item;
  candidate:=jsonb_build_object('principalId',target,'source','supervisor-role:'||(config->>'supervisorRole'));
  SELECT jsonb_agg(CASE WHEN person->>'principalId'=p_actor::text THEN candidate ELSE person END ORDER BY n) INTO candidates
    FROM jsonb_array_elements(stage.quorum->'eligibilityEvidence'->'candidates') WITH ORDINALITY people(person,n);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(candidates) person WHERE person->>'principalId'=target::text)
   THEN RAISE EXCEPTION 'PROCESS_ESCALATION_SEAT_MISSING' USING ERRCODE='check_violation'; END IF;
  UPDATE document.workflow_stage SET quorum=jsonb_set(jsonb_set(quorum,'{eligibilityEvidence,candidates}',candidates),'{chosenAssigneePrincipalIds}',
    (SELECT jsonb_agg(person->'principalId') FROM jsonb_array_elements(candidates) person)),updated_by=p_actor WHERE tenant_id=p_tenant AND id=stage.id;
  approval:=jsonb_set(w.metadata->'approval',ARRAY['stages',stage_index::text,'eligibilityEvidence','candidates'],candidates);
  UPDATE document.workflow_request SET metadata=jsonb_set(metadata,'{approval}',approval),updated_by=p_actor WHERE tenant_id=p_tenant AND id=w.id;
  payload:=jsonb_set(jsonb_set(i.payload,'{eligibility_evidence,candidates}',jsonb_build_array(candidate)),'{eligibility_evidence,selectedPrincipalId}',to_jsonb(target::text));
  INSERT INTO document.work_item(tenant_id,work_type_code,title,source_entity_code,source_entity_id,source_action_code,cycle_task_id,assignee_principal_id,due_at,available_at,priority,payload,created_by)
   VALUES(p_tenant,i.work_type_code,i.title,i.source_entity_code,i.source_entity_id,i.source_action_code,i.cycle_task_id,target,i.due_at,clock_timestamp(),i.priority,payload,p_actor) RETURNING id INTO replacement;
  IF x.id IS NOT NULL THEN
   INSERT INTO document.process_task_information(tenant_id,case_id,attempt_id,work_item_id,source_information_id,requested_by,respondent_id,question,response,state,due_at,answered_at,decision_due_before,pause_started_at,kind)
    VALUES(p_tenant,p_case,p_attempt,replacement,x.id,target,x.respondent_id,x.question,x.response,x.state,x.due_at,x.answered_at,x.decision_due_before,x.pause_started_at,x.kind) RETURNING id INTO continuation;
   continuation_action:=CASE WHEN x.state='open' THEN 'request' ELSE 'respond' END;
   INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,payload,created_by)
    VALUES(p_tenant,'workflow','workflow.task.information_'||continuation_action,'task-information:'||continuation::text||':'||continuation_action,'business_partner_case',p_case,'workflow.work_item',replacement,p_actor,'supplier-process.escalation',
      jsonb_build_object('information_id',continuation,'attempt_id',p_attempt,'work_item_id',replacement,'entity_type','business_partner_case','entity_id',p_case,'recipient_principal_ids',jsonb_build_array(CASE WHEN x.state='open' THEN x.respondent_id ELSE target END)),p_actor);
  END IF;
 ELSE
  IF config->>'mode'='consult' THEN
   IF jsonb_typeof(config->'responseHours') IS DISTINCT FROM 'number' OR (config->>'responseHours')::integer NOT BETWEEN 1 AND 168
    THEN RAISE EXCEPTION 'PROCESS_CONSULTATION_NOT_CONFIGURED' USING ERRCODE='check_violation'; END IF;
   IF EXISTS(SELECT 1 FROM document.process_task_information WHERE tenant_id=p_tenant AND work_item_id=p_item AND state IN('open','answered'))
    THEN RAISE EXCEPTION 'PROCESS_INFORMATION_ALREADY_OPEN' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
   INSERT INTO document.process_task_information(tenant_id,case_id,attempt_id,work_item_id,requested_by,respondent_id,question,due_at,kind)
    VALUES(p_tenant,p_case,p_attempt,p_item,p_actor,target,btrim(p_reason),clock_timestamp()+make_interval(hours=>(config->>'responseHours')::integer),'consultation') RETURNING id INTO continuation;
   INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,payload,created_by)
    VALUES(p_tenant,'workflow','workflow.task.information_request','task-information:'||continuation::text||':request','business_partner_case',p_case,'workflow.work_item',p_item,p_actor,'supplier-process.consultation',
     jsonb_build_object('information_id',continuation,'attempt_id',p_attempt,'work_item_id',p_item,'entity_type','business_partner_case','entity_id',p_case,'recipient_principal_ids',jsonb_build_array(target)),p_actor);
  END IF;
  UPDATE document.work_item SET row_version=row_version+1,updated_by=p_actor WHERE tenant_id=p_tenant AND id=p_item;
 END IF;
 INSERT INTO document.process_task_assignment_history(tenant_id,case_id,attempt_id,previous_work_item_id,replacement_work_item_id,previous_assignee_id,supervisor_id,mode,reason,actor_id)
  VALUES(p_tenant,p_case,p_attempt,p_item,replacement,p_actor,target,config->>'mode',btrim(p_reason),p_actor) RETURNING id INTO history_id;
 result:=jsonb_build_object('historyId',history_id,'attemptId',p_attempt,'workItemId',p_item,'replacementWorkItemId',replacement,'supervisorId',target,'mode',config->>'mode','informationId',continuation,'replayed',false);
 INSERT INTO document.process_task_interaction_receipt(tenant_id,idempotency_key,case_id,actor_id,fingerprint,result) VALUES(p_tenant,p_key,p_case,p_actor,fingerprint,result);
 IF config->>'mode'<>'consult' THEN
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,payload,created_by)
  VALUES(p_tenant,'workflow','workflow.task.supervisor_escalated','task-escalation:'||history_id::text,'business_partner_case',p_case,'workflow.work_item',COALESCE(replacement,p_item),p_actor,'supplier-process.escalation',
   jsonb_build_object('history_id',history_id,'attempt_id',p_attempt,'work_item_id',COALESCE(replacement,p_item),'entity_type','business_partner_case','entity_id',p_case,'recipient_principal_ids',jsonb_build_array(target)),p_actor);
 END IF;
 RETURN result;
END; $$;
REVOKE ALL ON document.process_task_assignment_history FROM PUBLIC;
REVOKE ALL ON FUNCTION document.command_process_task_escalate(uuid,uuid,uuid,uuid,bigint,text,text,uuid) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
 REVOKE ALL ON document.process_task_assignment_history FROM athyperapp;
 GRANT SELECT ON document.process_task_assignment_history TO athyperapp;
 GRANT EXECUTE ON FUNCTION document.command_process_task_escalate(uuid,uuid,uuid,uuid,bigint,text,text,uuid) TO athyperapp;
END IF; END $$;

-- Material editors remain excluded from independent checking for this case.
-- Full correction re-review may retain any earlier submitted facts, so this pilot
-- conservatively retains contributor exclusions across all attempts of the case.
CREATE TABLE IF NOT EXISTS document.process_case_contributor (
 tenant_id uuid NOT NULL, case_id uuid NOT NULL, source_attempt_id uuid NOT NULL,
 principal_id uuid NOT NULL, source_version bigint NOT NULL CHECK(source_version>0),
 fact_hash text NOT NULL CHECK(fact_hash ~ '^[a-f0-9]{64}$'),
 changed_paths jsonb NOT NULL CHECK(jsonb_typeof(changed_paths)='array' AND jsonb_array_length(changed_paths)>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,case_id,principal_id,source_version),
 FOREIGN KEY(tenant_id,case_id) REFERENCES document.entity_case(tenant_id,id),
 FOREIGN KEY(tenant_id,source_attempt_id) REFERENCES governance.process_attempt(tenant_id,id),
 FOREIGN KEY(tenant_id,principal_id) REFERENCES master.principal(tenant_id,id)
);
ALTER TABLE document.process_case_contributor ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.process_case_contributor FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON document.process_case_contributor;
CREATE POLICY tenant_read ON document.process_case_contributor FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());
REVOKE ALL ON document.process_case_contributor FROM PUBLIC,athyperapp;
GRANT SELECT ON document.process_case_contributor TO athyperapp;
DROP TRIGGER IF EXISTS contributor_immutable ON document.process_case_contributor;
CREATE TRIGGER contributor_immutable BEFORE UPDATE OR DELETE ON document.process_case_contributor
 FOR EACH ROW EXECUTE FUNCTION control.trg_reject_process_publication_mutation();
CREATE OR REPLACE FUNCTION document.command_record_process_contribution(p_tenant uuid,p_case uuid,p_attempt uuid,p_version bigint,p_actor uuid,p_hash text,p_paths jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c document.entity_case%ROWTYPE; prior document.process_case_contributor%ROWTYPE;
BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' OR shared.current_tenant_id() IS DISTINCT FROM p_tenant OR master.current_principal_id_soft() IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'PROCESS_CONTRIBUTOR_CONTEXT_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':entity-case:'||p_case::text,0));
 SELECT * INTO c FROM document.entity_case WHERE tenant_id=p_tenant AND id=p_case FOR UPDATE;
 IF c.id IS NULL OR c.row_version<>p_version OR c.status NOT IN('draft','validation_failed','returned') OR NOT EXISTS(SELECT 1 FROM governance.process_attempt a WHERE a.tenant_id=p_tenant AND a.id=p_attempt AND a.case_id=p_case AND a.attempt_number=(SELECT max(attempt_number) FROM governance.process_attempt WHERE tenant_id=p_tenant AND case_id=p_case)) THEN RAISE EXCEPTION 'PROCESS_CONTRIBUTOR_STALE' USING ERRCODE='40001'; END IF;
 SELECT * INTO prior FROM document.process_case_contributor WHERE tenant_id=p_tenant AND case_id=p_case AND principal_id=p_actor AND source_version=p_version;
 IF FOUND THEN
  IF prior.source_attempt_id<>p_attempt OR prior.fact_hash IS DISTINCT FROM p_hash OR prior.changed_paths IS DISTINCT FROM p_paths THEN RAISE EXCEPTION 'PROCESS_CONTRIBUTOR_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN;
 END IF;
 INSERT INTO document.process_case_contributor(tenant_id,case_id,source_attempt_id,principal_id,source_version,fact_hash,changed_paths)
  VALUES(p_tenant,p_case,p_attempt,p_actor,p_version,p_hash,p_paths);
END $$;
REVOKE ALL ON FUNCTION document.command_record_process_contribution(uuid,uuid,uuid,bigint,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION document.command_record_process_contribution(uuid,uuid,uuid,bigint,uuid,text,jsonb) TO athyperapp;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_worker') THEN
 GRANT SELECT ON document.process_task_information TO athyper_worker;
 GRANT EXECUTE ON FUNCTION document.command_process_task_information(uuid,uuid,uuid,uuid,text,bigint,text,text,uuid) TO athyper_worker;
END IF; END $$;

-- Worker-only timer entry point; the clock and candidate set are owned by PostgreSQL.
CREATE OR REPLACE FUNCTION document.sweep_process_information_due(p_tenant uuid,p_actor uuid,p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE x record; emitted integer:=0;
BEGIN
 IF p_actor IS NULL OR session_user<>'athyper_worker' OR shared.current_tenant_id() IS DISTINCT FROM p_tenant
  OR master.current_principal_id_soft() IS DISTINCT FROM p_actor OR p_actor IS DISTINCT FROM event.fn_notification_worker_principal(p_tenant)
  OR current_setting('app.database_plane',true) IS DISTINCT FROM 'neon' THEN RAISE EXCEPTION 'PROCESS_INFORMATION_TIMER_FORBIDDEN' USING ERRCODE='insufficient_privilege'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'PROCESS_INFORMATION_TIMER_LIMIT_INVALID' USING ERRCODE='check_violation'; END IF;
 FOR x IN SELECT q.id,q.case_id,q.attempt_id,q.work_item_id,i.row_version FROM document.process_task_information q
  JOIN document.work_item i ON i.tenant_id=q.tenant_id AND i.id=q.work_item_id
  JOIN governance.process_attempt a ON a.tenant_id=q.tenant_id AND a.id=q.attempt_id
  JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id
  CROSS JOIN LATERAL jsonb_array_elements(e.evidence->'executionManifest'->'tasks') binding
  WHERE q.tenant_id=p_tenant AND q.state='open' AND q.kind='clarification' AND q.escalated_at IS NULL AND q.due_at<=clock_timestamp()
  AND i.status IN('open','claimed') AND binding->>'taskTemplateId'=i.payload->>'taskTemplateId' AND binding->'informationPolicy'->>'overdueSupervisorRole' IS NOT NULL
  ORDER BY q.due_at,q.id LIMIT p_limit
 LOOP
  BEGIN
   PERFORM document.command_process_task_information(p_tenant,x.case_id,x.work_item_id,x.attempt_id,'escalate',x.row_version,'Clarification response deadline elapsed','information-overdue:'||x.id::text,p_actor);
   emitted:=emitted+1;
  EXCEPTION WHEN serialization_failure OR object_not_in_prerequisite_state THEN NULL;
  END;
 END LOOP;
 RETURN emitted;
END; $$;
REVOKE ALL ON FUNCTION document.sweep_process_information_due(uuid,uuid,integer) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_worker') THEN
 GRANT USAGE ON SCHEMA document TO athyper_worker;
 GRANT EXECUTE ON FUNCTION document.sweep_process_information_due(uuid,uuid,integer) TO athyper_worker;
END IF; END $$;

-- NEON extends the shared discovery with response deadlines, independent of a paused decision deadline.
CREATE OR REPLACE FUNCTION document.fn_workflow_sla_due_tenants(p_at timestamptz,p_limit integer DEFAULT 500)
RETURNS TABLE(tenant_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_at IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'invalid workflow SLA tenant-discovery arguments'; END IF;
 RETURN QUERY SELECT t.id FROM master.tenant t WHERE t.status='active' AND (
  EXISTS(SELECT 1 FROM document.work_item i WHERE i.tenant_id=t.id AND i.status IN('open','claimed','in_progress','blocked') AND i.due_at<=p_at AND NOT(i.payload ? 'sla_breach'))
  OR EXISTS(SELECT 1 FROM document.process_task_information x JOIN document.work_item i ON i.tenant_id=x.tenant_id AND i.id=x.work_item_id
   JOIN governance.process_attempt a ON a.tenant_id=x.tenant_id AND a.id=x.attempt_id
   JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id
   CROSS JOIN LATERAL jsonb_array_elements(e.evidence->'executionManifest'->'tasks') binding
   WHERE x.tenant_id=t.id AND x.kind='clarification' AND x.state='open' AND x.escalated_at IS NULL AND x.due_at<=p_at
   AND i.status IN('open','claimed') AND binding->>'taskTemplateId'=i.payload->>'taskTemplateId' AND binding->'informationPolicy'->>'overdueSupervisorRole' IS NOT NULL)
 ) ORDER BY t.id LIMIT p_limit;
END; $$;
REVOKE ALL ON FUNCTION document.fn_workflow_sla_due_tenants(timestamptz,integer) FROM PUBLIC;
