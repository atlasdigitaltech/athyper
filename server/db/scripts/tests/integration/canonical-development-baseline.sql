-- Read-only catalog assertions for the September 2026 development baseline.
-- Invoke after a fresh canonical foundation build, once per plane.
DO $baseline$
DECLARE definition text; plane text := replace(current_database(),'athyper_',''); item text;
BEGIN
 IF plane NOT IN ('neon','studio','mesh') THEN RAISE EXCEPTION 'Expected a three-plane foundation database'; END IF;
 PERFORM 'quarantined'::document.attachment_derivative_status_d;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='document' AND table_name='attachment_derivative' AND column_name IN ('scanned_at','scan_status'))<>2 THEN RAISE EXCEPTION 'Derivative scan columns missing'; END IF;
 SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint WHERE conrelid='document.attachment_derivative'::regclass AND conname='attachment_derivative_scan_status_chk';
 IF position('clean' in definition)=0 OR position('quarantined' in definition)=0 THEN RAISE EXCEPTION 'Derivative scan constraint incomplete'; END IF;
 SELECT pg_get_indexdef('document.attachment_derivative_scan_pending_idx'::regclass) INTO definition;
 IF position('ready' in definition)=0 OR position('scanned_at IS NULL' in definition)=0 THEN RAISE EXCEPTION 'Derivative scan index incomplete'; END IF;
 SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint WHERE conrelid='event.invalidation_dead_letter'::regclass AND conname='invalidation_dead_letter_scope_chk';
 IF position('^[A-Za-z0-9_.:-]+$' in definition)=0 THEN RAISE EXCEPTION 'Invalidation scope constraint missing'; END IF;
 SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint WHERE conrelid='runtime_meta.entity_contract'::regclass AND conname='runtime_entity_contract_release_no_uq';
 IF position('entity_code' in definition)=0 THEN RAISE EXCEPTION 'Runtime contract code identity missing'; END IF;
 IF position('entity_code' in pg_get_indexdef('runtime_meta.runtime_entity_contract_published_uq'::regclass))=0 THEN RAISE EXCEPTION 'Published contract code identity missing'; END IF;
 FOREACH item IN ARRAY ARRAY['control.lookup_revision','control.lookup_tenant_revision','control.lookup_publication_receipt','control.lookup_value_reference','master.reference_choice_recent'] LOOP
  IF to_regclass(item) IS NULL THEN RAISE EXCEPTION 'Canonical table missing: %',item; END IF;
 END LOOP;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='master.reference_choice_recent'::regclass) THEN RAISE EXCEPTION 'Recent choice RLS missing'; END IF;
 IF to_regprocedure('master.purge_expired_reference_choices(timestamp with time zone)') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='master' AND p.proname='purge_expired_reference_choices') THEN RAISE EXCEPTION 'Recent choice expiry function missing'; END IF;
 IF plane='neon' THEN
  FOREACH item IN ARRAY ARRAY['document.trg_guard_entity_case_mutation()','document.command_entity_case_lifecycle','master.command_materialize_business_partner_company_case','document.fn_company_setup_case_approvers'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=split_part(item,'.',1) AND p.proname=replace(split_part(item,'.',2),'()','')) THEN RAISE EXCEPTION 'Canonical function missing: %',item; END IF;
  END LOOP;
  definition:=pg_get_functiondef('document.trg_guard_entity_case_mutation()'::regprocedure);
  IF position('entity.case.validation' in definition)=0 OR position('e.actor_principal_id=master.current_principal_id_soft()' in definition)=0 THEN RAISE EXCEPTION 'Case validation actor guard missing'; END IF;
 END IF;
 IF plane='studio' THEN
  FOREACH item IN ARRAY ARRAY['trustiam.identity_projection','trustiam.identity_saga_attempt','trustiam.provider_identity_callback_inbox'] LOOP
   IF to_regclass(item) IS NULL THEN RAISE EXCEPTION 'Saga foundation missing: %',item; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='publication' AND p.proname='fn_prepare_document_collection_release') THEN RAISE EXCEPTION 'Document collection publication function missing'; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='snapshot' AND table_name='business_partner_case_contract_revision' AND column_name IN ('previous_contract_id','previous_contract_hash') AND is_nullable='NO') THEN RAISE EXCEPTION 'Initial contract publication incorrectly requires predecessor'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='snapshot.business_partner_case_contract_revision'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%previous_release_no = 0%') THEN RAISE EXCEPTION 'Initial contract predecessor check missing'; END IF;
 END IF;

 -- Final baseline: previously automatic September 6-10 upgrades.
 FOREACH item IN ARRAY ARRAY['master.saved_view_default','ai.atlas_learning_candidate','ai.atlas_experience_release','runtime_meta.experience_surface_projection'] LOOP
  IF to_regclass(item) IS NULL THEN RAISE EXCEPTION 'Final baseline table missing: %',item; END IF;
 END LOOP;
 IF NOT has_table_privilege('athyperapp','master.saved_view_default','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Application saved-view grants missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime') THEN
  IF NOT has_function_privilege('athyper_runtime','ai.fn_atlas_conversation_access(uuid,uuid,boolean)','EXECUTE') OR NOT has_function_privilege('athyper_runtime','ai.fn_is_atlas_conversation(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Optional runtime conversation grants missing'; END IF;
  IF has_table_privilege('athyper_runtime','master.saved_view_default','SELECT') THEN RAISE EXCEPTION 'Legacy saved-view grant survived'; END IF;
 END IF;
 SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint WHERE conrelid='ai.ai_agent_run'::regclass AND conname='ai_agent_run_aar_completed_usage_chk';
 IF position('model_call_count = 0' in definition)=0 OR position('tool_call_count > 0' in definition)=0 THEN RAISE EXCEPTION 'Tool-only run constraint missing'; END IF;
 SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint WHERE conrelid='ai.ai_agent_call'::regclass AND conname='ai_agent_call_aac_completed_usage_chk';
 IF position('provider_final' in definition)=0 THEN RAISE EXCEPTION 'Model-call usage constraint missing'; END IF;
 FOREACH item IN ARRAY ARRAY['document.active_attachment','document.active_comment'] LOOP
  IF NOT (SELECT coalesce(reloptions,'{}') @> ARRAY['security_invoker=true','security_barrier=true'] FROM pg_class WHERE oid=item::regclass) THEN RAISE EXCEPTION 'Tenant view security missing: %',item; END IF;
 END LOOP;
 IF plane='studio' THEN
  FOREACH item IN ARRAY ARRAY['publication.fn_prepare_initial_baseline_release','publication.fn_initial_baseline_compilation_source','publication.fn_confirm_metadata_activation','trustiam.trg_require_identity_replay_approval'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=split_part(item,'.',1) AND p.proname=split_part(item,'.',2)) THEN RAISE EXCEPTION 'Studio final baseline function missing: %',item; END IF;
  END LOOP;
  IF to_regclass('ai.atlas_learning_inbox') IS NULL THEN RAISE EXCEPTION 'Studio learning inbox missing'; END IF;
 ELSIF plane='neon' THEN
  IF to_regprocedure('ai.fn_owned_knowledge_attachment(uuid,uuid)') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='ai' AND p.proname='fn_owned_knowledge_attachment') THEN RAISE EXCEPTION 'Attachment knowledge writer missing'; END IF;
 ELSIF plane='mesh' THEN
  FOREACH item IN ARRAY ARRAY['command_relationship_capability_lifecycle','command_discover_network_relationship','command_registration_exchange_lifecycle','command_retrieve_bank_protected_token'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='mesh' AND p.proname=item) THEN RAISE EXCEPTION 'Mesh baseline command missing: %',item; END IF;
  END LOOP;
 END IF;
END $baseline$;
