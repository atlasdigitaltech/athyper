CREATE OR REPLACE FUNCTION governance.trg_guard_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'identity and creation evidence are immutable on %.%',
            TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION governance.trg_guard_channel_consent_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
       OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
       OR NEW.channel_code IS DISTINCT FROM OLD.channel_code
       OR NEW.destination_hash IS DISTINCT FROM OLD.destination_hash
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'channel consent coordinates are immutable'
            USING ERRCODE = '22000';
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION governance.trg_guard_approved_certification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'approved' THEN
        RAISE EXCEPTION 'approved cycle certifications are immutable'
            USING ERRCODE = '22000';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION governance.trg_reject_cycle_dependency_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'instantiated cycle task dependencies are immutable'
        USING ERRCODE = '22000';
END;
$$;

CREATE OR REPLACE FUNCTION governance.trg_reject_process_selection_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'PROCESS_SELECTION_EVIDENCE_IMMUTABLE' USING ERRCODE='55000';
END;
$$;

CREATE OR REPLACE FUNCTION governance.trg_process_task_document_gate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (OLD.process_attempt_id IS DISTINCT FROM NEW.process_attempt_id OR (OLD.process_attempt_id IS NOT NULL AND (OLD.cycle_run_id IS DISTINCT FROM NEW.cycle_run_id OR OLD.task_template_id IS DISTINCT FROM NEW.task_template_id OR (OLD.status IN('completed','cancelled') AND NEW IS DISTINCT FROM OLD)))) THEN RAISE EXCEPTION 'PROCESS_TASK_HISTORY_IMMUTABLE' USING ERRCODE='55000'; END IF;
 IF NEW.status IN('ready','in_progress','completed','waived') AND EXISTS(
  SELECT 1 FROM governance.process_attempt a JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id,
   LATERAL jsonb_array_elements(e.evidence->'executionManifest'->'tasks') binding
  WHERE a.tenant_id=NEW.tenant_id AND a.cycle_run_id=NEW.cycle_run_id AND a.id=NEW.process_attempt_id AND binding->>'taskTemplateId'=NEW.task_template_id::text
   AND (binding->>'executionKind' IN('review','approval') OR (binding->>'executionKind'='document' AND NEW.status IN('completed','waived')))
   AND NOT EXISTS(SELECT 1 FROM governance.process_document_job j WHERE j.tenant_id=a.tenant_id AND j.attempt_id=a.id AND j.purpose='submitted_review_pack' AND j.status='ready'))
 THEN RAISE EXCEPTION 'PROCESS_REVIEW_DOCUMENT_NOT_READY' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION governance.trg_validate_process_attempt()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c jsonb; previous governance.process_attempt%ROWTYPE; original jsonb; incoming jsonb;
BEGIN
 SELECT evidence->'coordinate' INTO c FROM governance.process_selection_evidence WHERE tenant_id=NEW.tenant_id AND id=NEW.selection_id;
 IF (c->>'attemptId'=NEW.id::text AND c->>'caseId'=NEW.case_id::text AND c->>'cycleRunId'=NEW.cycle_run_id::text
  AND (c->>'attemptNumber')::integer=NEW.attempt_number
  AND c->'submissionSnapshot'->>'id'=NEW.submission_snapshot_id::text AND (c->'submissionSnapshot'->>'version')::integer=NEW.submission_snapshot_version AND c->'submissionSnapshot'->>'hash'=NEW.submission_snapshot_hash
  AND NEW.response->'process'->>'cycleRunId'=NEW.cycle_run_id::text AND NEW.response->'process'->>'attemptId'=NEW.id::text
  AND NEW.response->'process'->>'selectionId'=NEW.selection_id::text AND (NEW.response->'process'->>'attemptNumber')::integer=NEW.attempt_number
  AND c->'manifest'->>'id'=NEW.manifest_id::text AND (c->'manifest'->>'version')::integer=NEW.manifest_version AND c->'manifest'->>'hash'=NEW.manifest_hash) IS NOT TRUE
 THEN RAISE EXCEPTION 'PROCESS_ATTEMPT_COORDINATE_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT a.* INTO previous FROM governance.process_attempt a WHERE a.tenant_id=NEW.tenant_id AND a.case_id=NEW.case_id ORDER BY a.attempt_number DESC LIMIT 1;
 IF previous.id IS NOT NULL THEN
  SELECT evidence INTO original FROM governance.process_selection_evidence WHERE tenant_id=NEW.tenant_id AND id=previous.selection_id;
  SELECT evidence INTO incoming FROM governance.process_selection_evidence WHERE tenant_id=NEW.tenant_id AND id=NEW.selection_id;
  IF NEW.attempt_number<>previous.attempt_number+1 OR NEW.cycle_run_id<>previous.cycle_run_id OR incoming->'policy' IS DISTINCT FROM original->'policy' OR incoming->'executionManifest' IS DISTINCT FROM original->'executionManifest'
   OR NOT EXISTS(SELECT 1 FROM document.entity_case_command_evidence e WHERE e.tenant_id=NEW.tenant_id AND e.entity_case_id=NEW.case_id AND e.result_code='ENTITY_CASE_RETURNED' AND e.before_version>previous.expected_case_version)
   OR EXISTS(SELECT 1 FROM document.work_item i WHERE i.tenant_id=NEW.tenant_id AND i.source_entity_id=NEW.case_id AND i.payload->>'attemptId'=previous.id::text AND i.status IN('open','claimed'))
   OR NOT EXISTS(SELECT 1 FROM governance.cycle_run r WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.cycle_run_id AND r.status='running')
  THEN RAISE EXCEPTION 'PROCESS_CORRECTION_BINDING_INVALID' USING ERRCODE='23514'; END IF;
 ELSIF NEW.attempt_number<>1 THEN RAISE EXCEPTION 'PROCESS_ATTEMPT_SEQUENCE_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM governance.cycle_task t WHERE t.tenant_id=NEW.tenant_id AND t.process_attempt_id=NEW.id AND (t.cycle_run_id<>NEW.cycle_run_id OR t.completion_evidence->'coordinate' IS DISTINCT FROM c)) THEN RAISE EXCEPTION 'PROCESS_TASK_ATTEMPT_BINDING_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION governance.trg_validate_process_document_intent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e jsonb;
BEGIN
 SELECT evidence INTO e FROM governance.process_selection_evidence WHERE tenant_id=NEW.tenant_id AND id=NEW.selection_id;
 IF NEW.status<>'pending' OR NEW.result IS NOT NULL OR (
   NEW.intent->'coordinate'=e->'coordinate'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(e->'executionManifest'->'documents') binding WHERE binding=NEW.intent->'binding')
   AND (NEW.purpose<>'submitted_review_pack' OR NEW.intent->'sourceSnapshot'=e->'coordinate'->'submissionSnapshot')) IS NOT TRUE
 THEN RAISE EXCEPTION 'PROCESS_DOCUMENT_INTENT_BINDING_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

-- Shared structural completion evaluation for generic cycles and domain coordinators.
CREATE OR REPLACE FUNCTION governance.evaluate_cycle_completion(p_tenant uuid,p_run uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE reasons jsonb:='[]'; attempt uuid; required_count integer; complete_count integer; critical_count integer; child_count integer;
BEGIN
 IF shared.current_tenant_id() IS DISTINCT FROM p_tenant THEN RAISE EXCEPTION 'CYCLE_COMPLETION_SCOPE_INVALID' USING ERRCODE='insufficient_privilege'; END IF;
 SELECT a.id INTO attempt FROM governance.process_attempt a WHERE a.tenant_id=p_tenant AND a.cycle_run_id=p_run ORDER BY a.attempt_number DESC LIMIT 1;
 SELECT count(*),count(*) FILTER(WHERE t.status IN('completed','waived')) INTO required_count,complete_count FROM governance.cycle_task t WHERE t.tenant_id=p_tenant AND t.cycle_run_id=p_run AND t.is_mandatory AND (attempt IS NULL OR t.process_attempt_id=attempt);
 SELECT count(*) INTO critical_count FROM governance.cycle_deviation d WHERE d.tenant_id=p_tenant AND d.cycle_run_id=p_run AND d.status='open' AND d.severity_code='critical';
 SELECT count(*) INTO child_count FROM governance.cycle_run r WHERE r.tenant_id=p_tenant AND r.parent_cycle_run_id=p_run AND r.status NOT IN('completed','cancelled');
 IF required_count=0 OR complete_count<>required_count THEN reasons:=reasons||'"mandatory_tasks_incomplete"'::jsonb; END IF;
 IF critical_count>0 THEN reasons:=reasons||'"critical_deviations_open"'::jsonb; END IF;
 IF child_count>0 THEN reasons:=reasons||'"child_cycles_active"'::jsonb; END IF;
 RETURN jsonb_build_object('ready',jsonb_array_length(reasons)=0,'evaluatedAt',clock_timestamp(),'reasons',reasons,'evidence',jsonb_build_object('attemptId',attempt,'taskCount',required_count,'completedTaskCount',complete_count,'openCriticalDeviationCount',critical_count,'activeChildCount',child_count));
END $$;

CREATE OR REPLACE FUNCTION governance.trg_cycle_completion_structure()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status AND NOT (governance.evaluate_cycle_completion(NEW.tenant_id,NEW.id)->>'ready')::boolean THEN RAISE EXCEPTION 'CYCLE_COMPLETION_WORK_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
