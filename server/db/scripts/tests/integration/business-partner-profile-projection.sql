\set ON_ERROR_STOP on
BEGIN;

INSERT INTO control.mesh_business_partner_profile_inbox(
 id,tenant_id,event_id,event_type,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,publication_id,publication_version,lifecycle_version,schema_code,schema_version,field_set_code,payload_hash,envelope_json,envelope_hash,occurred_at,received_by
) VALUES(
 '70000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','70000000-0000-4000-8000-000000000002','business_partner.profile_publication.published','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,1,'mesh.business_partner_profile',1,'recipient_safe_v1','a193f6f211227718ee0ba592eb6dbec7507fc9956555ba0e61aed9b3999e0f44','{"eventId":"70000000-0000-4000-8000-000000000002"}'::jsonb,repeat('a',64),clock_timestamp(),'34ce3386-ed20-5933-91d1-699d38b197fe'
);
INSERT INTO snapshot.mesh_business_partner_profile_received(
 id,tenant_id,inbox_event_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,publication_id,publication_version,schema_code,schema_version,field_set_code,payload_json,payload_hash,received_by
) VALUES(
 '70000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','70000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'mesh.business_partner_profile',1,'recipient_safe_v1','{"commodityCapabilities":[],"fieldSetCode":"recipient_safe_v1","partner":{"accountCode":"supplier.one","displayName":"Supplier One"},"recipient":{"networkAccountId":"55555555-5555-4555-8555-555555555555","networkRelationshipId":"66666666-6666-4666-8666-666666666666","proposedNeonRole":"supplier","tenantId":"11111111-1111-4111-8111-111111111111"},"schemaCode":"mesh.business_partner_profile","schemaVersion":1}'::jsonb,'a193f6f211227718ee0ba592eb6dbec7507fc9956555ba0e61aed9b3999e0f44','34ce3386-ed20-5933-91d1-699d38b197fe'
);
INSERT INTO control.mesh_business_partner_profile_processing_attempt(id,tenant_id,inbox_event_id,attempt_no,trigger_kind,disposition,reason_code,processed_by)
VALUES('70000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','70000000-0000-4000-8000-000000000001',1,'delivery','quarantined','MESH_PROFILE_PUBLICATION_GAP','34ce3386-ed20-5933-91d1-699d38b197fe'),
      ('70000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','70000000-0000-4000-8000-000000000001',2,'replay','applied',NULL,'34ce3386-ed20-5933-91d1-699d38b197fe');
INSERT INTO control.mesh_business_partner_profile_projection(id,tenant_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,current_publication_id,current_publication_version,current_lifecycle_version,current_snapshot_id,last_inbox_event_id,projection_status,updated_by)
VALUES('70000000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,1,'70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','active','34ce3386-ed20-5933-91d1-699d38b197fe');

DO $$ BEGIN
  BEGIN UPDATE control.mesh_business_partner_profile_inbox SET envelope_hash=repeat('b',64) WHERE id='70000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'inbox update unexpectedly succeeded'; EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  BEGIN UPDATE snapshot.mesh_business_partner_profile_received SET payload_hash=repeat('b',64) WHERE id='70000000-0000-4000-8000-000000000003'; RAISE EXCEPTION 'snapshot update unexpectedly succeeded'; EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  BEGIN INSERT INTO snapshot.mesh_business_partner_profile_received(id,tenant_id,inbox_event_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,publication_id,publication_version,schema_code,schema_version,field_set_code,payload_json,payload_hash,received_by) VALUES('70000000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','70000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2,'mesh.business_partner_profile',1,'recipient_safe_v1','{"bankAccount":{"number":"1"}}',repeat('b',64),'34ce3386-ed20-5933-91d1-699d38b197fe'); RAISE EXCEPTION 'bank payload unexpectedly succeeded'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

SET LOCAL ROLE athyperapp;
SELECT set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true);
DO $$ BEGIN IF (SELECT count(*) FROM control.mesh_business_partner_profile_projection) <> 1 THEN RAISE EXCEPTION 'recipient tenant cannot read projection'; END IF; END $$;
SELECT set_config('app.current_tenant_id','22222222-2222-4222-8222-222222222222',true);
DO $$ BEGIN IF (SELECT count(*) FROM control.mesh_business_partner_profile_projection) <> 0 THEN RAISE EXCEPTION 'unrelated tenant can read projection'; END IF; END $$;
RESET ROLE;

ROLLBACK;
