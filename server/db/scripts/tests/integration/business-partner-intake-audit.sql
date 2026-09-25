-- Exact-event admission under the real application role. All evidence rolls back.
BEGIN;
DO $test$
DECLARE t uuid; p uuid; event_id uuid;
BEGIN
 SELECT tenant_id,id INTO STRICT t,p FROM master.principal WHERE code='catl.admin' AND status='active';
 PERFORM set_config('app.current_tenant_id',t::text,true);
 PERFORM set_config('app.current_principal_id',p::text,true);
 PERFORM set_config('app.current_actor_type','user',true);
 SET LOCAL ROLE athyperapp;
 event_id:=audit.append_event(p_event_code:='business_partner.intake_value.protected',
   p_operation:='execute',p_entity_type:='business_partner',p_outcome:='success',
   p_context:='{"kind":"tax","protected":true}'::jsonb);
 IF event_id IS NULL THEN RAISE EXCEPTION 'Missing capture audit receipt'; END IF;
 BEGIN
   PERFORM audit.append_event(p_event_code:='business_partner.intake_value.unregistered',
     p_operation:='execute',p_entity_type:='business_partner',p_outcome:='success');
   RAISE EXCEPTION 'Unregistered capture event admitted';
 EXCEPTION WHEN foreign_key_violation THEN
   IF SQLERRM <> 'No active audit event contract matches business_partner.intake_value.unregistered' THEN RAISE; END IF;
 END;
 RESET ROLE;
END $test$;
ROLLBACK;
