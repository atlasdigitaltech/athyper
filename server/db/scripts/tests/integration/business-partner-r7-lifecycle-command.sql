\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
 v_tenant uuid;v_actor uuid;v_engagement uuid;v_company uuid;v_effective_at timestamptz;v_placement_policy jsonb;v_end_policy jsonb;v_placement record;v_termination record;v_replay record;v_count bigint;
BEGIN
 SELECT engagement.tenant_id,engagement.created_by,engagement.id,engagement.company_code_id
 INTO v_tenant,v_actor,v_engagement,v_company
 FROM document.worker_engagement engagement
 WHERE engagement.metadata#>>'{_seed,pack}'='acceptance.business-partner-r7.v1'
   AND engagement.status='active' AND engagement.row_version=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'R7 lifecycle probe requires a fresh R7 fixture pack';END IF;
 PERFORM set_config('app.database_plane','neon',true);PERFORM set_config('app.current_tenant_id',v_tenant::text,true);PERFORM set_config('app.current_principal_id',v_actor::text,true);
 v_placement_policy:=jsonb_build_object('boundary','placement_change','coordinates',jsonb_build_array(
  jsonb_build_object('decisionId','BP-Q004','version',1,'hash',repeat('a',64),'approvalEvidenceId','44444444-4444-4444-8444-444444444444'),
  jsonb_build_object('decisionId','BP-Q006','version',1,'hash',repeat('b',64),'approvalEvidenceId','66666666-6666-4666-8666-666666666666')));
 v_end_policy:=jsonb_set(v_placement_policy,'{boundary}','"engagement_end"');
 SELECT * INTO v_placement FROM document.command_worker_operational_placement_activate(v_tenant,v_engagement,1,'r7-live-placement-0001',v_actor,NULL,current_date,NULL,v_company,NULL,NULL,NULL,NULL,NULL,NULL,NULL,100,true,'{"probe":"BP-WRK-007"}',v_placement_policy);
 IF v_placement.replayed OR v_placement.engagement_version<>2 OR v_placement.placement_id IS NULL OR v_placement.outbox_id IS NULL THEN RAISE EXCEPTION 'R7 placement proof invalid: %',row_to_json(v_placement);END IF;
 BEGIN
  INSERT INTO document.worker_operational_placement(tenant_id,worker_engagement_id,company_code_id,effective_from,effective_until,created_by)VALUES(v_tenant,v_engagement,v_company,current_date,current_date+1,v_actor);
  RAISE EXCEPTION 'Direct placement mutation was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 v_effective_at:=clock_timestamp();
 SELECT * INTO v_termination FROM document.command_worker_engagement_terminate(v_tenant,v_engagement,2,'r7-live-termination-0001',v_actor,NULL,'QUALIFICATION_TEST_END',v_effective_at,v_end_policy);
 IF v_termination.replayed OR v_termination.engagement_version<>4 OR v_termination.iam_outbox_id IS NULL OR v_termination.iam_desired_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'R7 termination proof invalid: %',row_to_json(v_termination);END IF;
 SELECT * INTO v_replay FROM document.command_worker_engagement_terminate(v_tenant,v_engagement,2,'r7-live-termination-0001',v_actor,NULL,'QUALIFICATION_TEST_END',v_effective_at,v_end_policy);
 IF NOT v_replay.replayed OR v_replay.iam_outbox_id<>v_termination.iam_outbox_id THEN RAISE EXCEPTION 'R7 termination exact replay failed';END IF;
 SELECT count(*) INTO v_count FROM event.outbox WHERE tenant_id=v_tenant AND aggregate_id=v_engagement AND event_type IN('workforce.external_worker.placement.activated','workforce.external_worker.engagement.terminated','workforce.external_worker.identity_projection.requested');
 IF v_count<>3 THEN RAISE EXCEPTION 'R7 lifecycle expected exactly three retained outbox proofs, received %',v_count;END IF;
 BEGIN UPDATE document.worker_engagement SET status='completed' WHERE tenant_id=v_tenant AND id=v_engagement;RAISE EXCEPTION 'Direct engagement lifecycle mutation was accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END;$$;
ROLLBACK;
