-- Synthetic fixture construction bypasses unrelated FKs. All reads/writes under
-- test run as the real application role with normal triggers and RLS.
BEGIN;
SET LOCAL session_replication_role=replica;
INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by)
VALUES('b0000000-0000-4000-8000-000000000001','review_tenant','Review tenant','Review tenant','athyper','active','d0000000-0000-4000-8000-000000000001');
INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by)
VALUES('d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','review.actor','Review actor','user','d0000000-0000-4000-8000-000000000001');
INSERT INTO document.comment(tenant_id,entity_type,entity_id,commenter_id,comment_text,created_by)
VALUES('b0000000-0000-4000-8000-000000000001','business_partner','review-fixture','d0000000-0000-4000-8000-000000000001','Foreign confidential comment','d0000000-0000-4000-8000-000000000001');
INSERT INTO document.attachment(tenant_id,file_name,storage_bucket,storage_key,series_id,created_by)
VALUES('b0000000-0000-4000-8000-000000000001','confidential.txt','documents','foreign/confidential.txt','a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001');
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE athyperapp;
SET LOCAL app.current_tenant_id='b0000000-0000-4000-8000-000000000002';
SET LOCAL app.current_principal_id='d0000000-0000-4000-8000-000000000001';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM document.active_comment WHERE entity_id='review-fixture') OR
    EXISTS(SELECT 1 FROM document.active_attachment WHERE storage_key='foreign/confidential.txt') THEN
   RAISE EXCEPTION 'Document views leaked foreign tenant data';
 END IF;
END $$;
SET LOCAL app.current_tenant_id='b0000000-0000-4000-8000-000000000001';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM document.active_comment WHERE entity_id='review-fixture') OR
    NOT EXISTS(SELECT 1 FROM document.active_attachment WHERE storage_key='foreign/confidential.txt') THEN
   RAISE EXCEPTION 'Document views lost same-tenant visibility';
 END IF;
END $$;
INSERT INTO master.saved_view_default(tenant_id,entity_code,surface_code,view_id,created_by,updated_by)
VALUES('b0000000-0000-4000-8000-000000000001','business_partner','list','system','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001');
UPDATE master.saved_view_default SET view_id='standard.all' WHERE entity_code='business_partner';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM master.saved_view_default WHERE view_id='standard.all') THEN
   RAISE EXCEPTION 'Application cannot write/read saved view defaults';
 END IF;
END $$;
SET LOCAL app.current_tenant_id='b0000000-0000-4000-8000-000000000002';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM master.saved_view_default WHERE tenant_id='b0000000-0000-4000-8000-000000000001') THEN
   RAISE EXCEPTION 'Saved defaults leaked foreign tenant data';
 END IF;
END $$;
ROLLBACK;
