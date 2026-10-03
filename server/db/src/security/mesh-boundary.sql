BEGIN;
SET LOCAL session_replication_role=replica;
INSERT INTO mesh.catalog(id,tenant_id,owner_account_id,code,name,created_by) VALUES
 ('a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','probe.catalog_one','Owned catalog','d2000000-0000-4000-8000-000000000001'),
 ('a2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000002','probe.catalog_two','Foreign catalog','d2000000-0000-4000-8000-000000000002');
INSERT INTO mesh.business_partner_delivery_acknowledgement(source_tenant_id,recipient_tenant_id,source_network_account_id,outbox_id,event_id,delivery_lease_id,attempt_no,disposition) VALUES
 ('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000004','owned-lease',1,'applied'),
 ('b2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000005','a2000000-0000-4000-8000-000000000006','foreign-lease',1,'applied');
SET LOCAL session_replication_role=origin;
-- Exercise the helper independently of its currently authorized caller.
GRANT EXECUTE ON FUNCTION mesh.fn_catalog_publication_snapshot(uuid) TO athyper_runtime;
SET LOCAL SESSION AUTHORIZATION athyper_runtime;
SET LOCAL app.current_tenant_id='b2000000-0000-4000-8000-000000000001';
DO $assert$ BEGIN
 IF mesh.fn_catalog_publication_snapshot('a2000000-0000-4000-8000-000000000001')->'catalog'->>'name' IS DISTINCT FROM 'Owned catalog' THEN RAISE EXCEPTION 'snapshot lost same-tenant catalog'; END IF;
 IF mesh.fn_catalog_publication_snapshot('a2000000-0000-4000-8000-000000000002') IS NOT NULL THEN RAISE EXCEPTION 'snapshot leaked foreign catalog'; END IF;
END $assert$;
RESET SESSION AUTHORIZATION;
SET LOCAL SESSION AUTHORIZATION athyper_worker;
SET LOCAL ROLE athyper_jobs_service;
DO $assert$ BEGIN
 IF (SELECT count(*) FROM mesh.business_partner_delivery_acknowledgement WHERE delivery_lease_id IN ('owned-lease','foreign-lease'))<>1 THEN RAISE EXCEPTION 'jobs read foreign acknowledgement'; END IF;
 BEGIN
  INSERT INTO mesh.business_partner_delivery_acknowledgement(source_tenant_id,recipient_tenant_id,source_network_account_id,outbox_id,event_id,delivery_lease_id,attempt_no,disposition) VALUES
   ('b2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000005','a2000000-0000-4000-8000-000000000006','forged-lease',1,'applied');
  RAISE EXCEPTION 'jobs inserted foreign acknowledgement';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO mesh.business_partner_delivery_acknowledgement(source_tenant_id,recipient_tenant_id,source_network_account_id,outbox_id,event_id,delivery_lease_id,attempt_no,disposition) VALUES
  ('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000004','owned-second-lease',2,'duplicate');
END $assert$;
SET LOCAL app.current_tenant_id='';
DO $assert$ BEGIN
 IF EXISTS(SELECT 1 FROM mesh.business_partner_delivery_acknowledgement WHERE delivery_lease_id LIKE '%lease') THEN RAISE EXCEPTION 'jobs read without context'; END IF;
END $assert$;
RESET SESSION AUTHORIZATION;
SET LOCAL SESSION AUTHORIZATION athyper_runtime;
DO $assert$ BEGIN
 IF mesh.fn_catalog_publication_snapshot('a2000000-0000-4000-8000-000000000001') IS NOT NULL THEN RAISE EXCEPTION 'snapshot read without context'; END IF;
END $assert$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
