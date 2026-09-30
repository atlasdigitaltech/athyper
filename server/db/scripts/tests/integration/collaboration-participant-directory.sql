-- Run on a canonically seeded disposable plane. No durable test data.
BEGIN;
DO $test$
DECLARE
 t uuid; caller uuid; recipient uuid; foreign_id uuid; n integer;
BEGIN
 SELECT tenant_id,id INTO STRICT t,caller FROM master.principal WHERE code='catl.admin' AND status='active';
 SELECT id INTO STRICT recipient FROM master.principal WHERE tenant_id=t AND code='catl.owner' AND status='active';
 SELECT id INTO STRICT foreign_id FROM master.principal WHERE code='athyper.admin' AND status='active';
 PERFORM set_config('app.current_tenant_id',t::text,true);
 PERFORM set_config('app.current_principal_id',caller::text,true);
 SET LOCAL ROLE athyperapp;
 SELECT count(*) INTO n FROM document.collaboration_principal_candidates('',recipient);
 IF n<>1 THEN RAISE EXCEPTION 'Admitted same-tenant recipient not discoverable'; END IF;
 IF EXISTS(SELECT 1 FROM document.collaboration_principal_candidates('',foreign_id))
   THEN RAISE EXCEPTION 'Cross-tenant directory disclosure'; END IF;
 SELECT count(*) INTO n FROM document.collaboration_principal_candidates('');
 IF n>50 THEN RAISE EXCEPTION 'Directory bound violated'; END IF;
 PERFORM set_config('app.current_principal_id',foreign_id::text,true);
 IF EXISTS(SELECT 1 FROM document.collaboration_principal_candidates(''))
   THEN RAISE EXCEPTION 'Unadmitted caller directory disclosure'; END IF;
 PERFORM set_config('app.current_tenant_id','',true);
 IF EXISTS(SELECT 1 FROM document.collaboration_principal_candidates(''))
   THEN RAISE EXCEPTION 'Missing tenant directory disclosure'; END IF;
 RESET ROLE;
END $test$;
ROLLBACK;
