\set ON_ERROR_STOP on
-- Disposable fresh-install fixture. All mutations roll back; no live records used.
BEGIN;
SET LOCAL app.database_plane='neon';
SET LOCAL app.current_tenant_id='00000000-0000-0000-0000-000000000000';
SET LOCAL app.current_principal_id='00000000-0000-0000-0000-000000000000';
INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by)
VALUES('ca020000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','ca02.reader','CA02 synthetic reader','user','00000000-0000-0000-0000-000000000000');
SET LOCAL ROLE athyperapp;
INSERT INTO document.comment(id,tenant_id,entity_type,entity_id,commenter_id,comment_text,visibility,created_by)
VALUES('ca020000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','business_partner','ca02-fixture','00000000-0000-0000-0000-000000000000','Original evidence','private','00000000-0000-0000-0000-000000000000');
DO $$ BEGIN
 IF (SELECT revision_no FROM document.comment WHERE id='ca020000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'First revision absent'; END IF;
 IF NOT EXISTS(SELECT 1 FROM document.comment_revision WHERE comment_id='ca020000-0000-4000-8000-000000000001' AND revision_no=1 AND change_kind='create') THEN RAISE EXCEPTION 'Create history absent'; END IF;
END $$;
UPDATE document.comment SET comment_text='Edited evidence',updated_by='00000000-0000-0000-0000-000000000000'
WHERE id='ca020000-0000-4000-8000-000000000001' AND revision_no=1;
DO $$ DECLARE affected integer; BEGIN
 UPDATE document.comment SET comment_text='Stale overwrite' WHERE id='ca020000-0000-4000-8000-000000000001' AND revision_no=1;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'Stale revision accepted'; END IF;
 IF (SELECT count(*) FROM document.comment_revision WHERE comment_id='ca020000-0000-4000-8000-000000000001')<>2 THEN RAISE EXCEPTION 'Edit history absent'; END IF;
 BEGIN
  UPDATE document.comment_revision SET comment_text='Tampered' WHERE comment_id='ca020000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'History mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE document.comment SET comment_text='Rolled-back edit',updated_by='00000000-0000-0000-0000-000000000000' WHERE id='ca020000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'simulate outbox failure' USING ERRCODE='P0002';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 IF (SELECT revision_no FROM document.comment WHERE id='ca020000-0000-4000-8000-000000000001')<>2 THEN RAISE EXCEPTION 'Edit not atomic'; END IF;
 IF (SELECT count(*) FROM document.comment_revision WHERE comment_id='ca020000-0000-4000-8000-000000000001')<>2 THEN RAISE EXCEPTION 'History not atomic'; END IF;
END $$;
INSERT INTO event.comment_flag(id,tenant_id,comment_id,reporter_principal_id,reason_code,created_by)
VALUES('ca020000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','ca020000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','spam','00000000-0000-0000-0000-000000000000');
INSERT INTO governance.comment_moderation(tenant_id,comment_flag_id,created_by)
VALUES('00000000-0000-0000-0000-000000000000','ca020000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000');
UPDATE governance.comment_moderation SET decision_code='dismiss',moderator_principal_id='00000000-0000-0000-0000-000000000000',updated_by='00000000-0000-0000-0000-000000000000' WHERE comment_flag_id='ca020000-0000-4000-8000-000000000003';
INSERT INTO document.comment_mention(id,tenant_id,comment_id,mentioned_id,created_by)
VALUES('ca020000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','ca020000-0000-4000-8000-000000000001','ca020000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000');
INSERT INTO document.comment_reaction(id,tenant_id,comment_id,principal_id,reaction_type,created_by)
VALUES('ca020000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','ca020000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','thumbs_up','00000000-0000-0000-0000-000000000000');
INSERT INTO document.attachment_series(id,tenant_id,created_by) VALUES
 ('ca020000-0000-4000-8000-000000000010','00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000'),
 ('ca020000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000');
INSERT INTO document.attachment(id,tenant_id,file_name,content_type,size_bytes,sha256,storage_bucket,storage_key,series_id,is_virus_scanned,metadata,admitted_release_hash,admitted_policy_hash,created_by)
VALUES('ca020000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','synthetic.txt','text/plain',4,repeat('a',64),'ca02-fixture','synthetic.txt','ca020000-0000-4000-8000-000000000010',true,'{"entity_type":"business_partner","entity_id":"ca02-fixture"}','sha256:'||repeat('a',64),'sha256:'||repeat('b',64),'00000000-0000-0000-0000-000000000000');
INSERT INTO document.attachment_link(tenant_id,entity_type,entity_id,attachment_series_id,pinned_attachment_id,link_kind,created_by)
VALUES('00000000-0000-0000-0000-000000000000','business_partner','ca02-fixture','ca020000-0000-4000-8000-000000000010','ca020000-0000-4000-8000-000000000012','evidence','00000000-0000-0000-0000-000000000000');
INSERT INTO document.attachment_folder(id,tenant_id,entity_type,entity_id,name,created_by)
VALUES('ca020000-0000-4000-8000-000000000020','00000000-0000-0000-0000-000000000000','business_partner','ca02-fixture','Root','00000000-0000-0000-0000-000000000000');
INSERT INTO document.attachment_folder(id,tenant_id,entity_type,entity_id,name,parent_id,created_by)
VALUES('ca020000-0000-4000-8000-000000000021','00000000-0000-0000-0000-000000000000','business_partner','ca02-fixture','Child','ca020000-0000-4000-8000-000000000020','00000000-0000-0000-0000-000000000000');
DO $$ BEGIN
 BEGIN
  INSERT INTO document.attachment_link(tenant_id,entity_type,entity_id,attachment_series_id,pinned_attachment_id,link_kind,created_by)
  VALUES('00000000-0000-0000-0000-000000000000','business_partner','ca02-fixture','ca020000-0000-4000-8000-000000000011','ca020000-0000-4000-8000-000000000012','evidence','00000000-0000-0000-0000-000000000000');
  RAISE EXCEPTION 'Cross-series pin accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  UPDATE document.attachment_folder SET parent_id='ca020000-0000-4000-8000-000000000021',updated_by='00000000-0000-0000-0000-000000000000' WHERE id='ca020000-0000-4000-8000-000000000020';
  RAISE EXCEPTION 'Folder cycle accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE document.attachment SET sha256=repeat('b',64),updated_by='00000000-0000-0000-0000-000000000000' WHERE id='ca020000-0000-4000-8000-000000000012';
  RAISE EXCEPTION 'Scanned bytes changed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE document.attachment SET metadata='{"entity_type":"other","entity_id":"other"}',updated_by='00000000-0000-0000-0000-000000000000' WHERE id='ca020000-0000-4000-8000-000000000012';
  RAISE EXCEPTION 'Admitted owner changed';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET LOCAL app.current_principal_id='ca020000-0000-4000-8000-000000000002';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM document.comment WHERE id='ca020000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Private comment leaked'; END IF;
 IF EXISTS(SELECT 1 FROM document.comment_revision WHERE comment_id='ca020000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Private history leaked'; END IF;
 IF EXISTS(SELECT 1 FROM document.comment_mention WHERE comment_id='ca020000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Private mention leaked'; END IF;
 IF EXISTS(SELECT 1 FROM document.comment_reaction WHERE comment_id='ca020000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Private reaction leaked'; END IF;
END $$;
SET LOCAL app.current_tenant_id='ca020000-0000-4000-8000-000000000099';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM document.comment WHERE id='ca020000-0000-4000-8000-000000000001') OR EXISTS(SELECT 1 FROM event.comment_flag WHERE id='ca020000-0000-4000-8000-000000000003') OR EXISTS(SELECT 1 FROM governance.comment_moderation WHERE comment_flag_id='ca020000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Tenant isolation failed'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF to_regclass('document.comment_moderation_flag') IS NOT NULL THEN RAISE EXCEPTION 'Obsolete report table remains'; END IF;
END $$;
ROLLBACK;
\echo CA02 revision, atomicity, canonical reporting and application-role isolation passed
