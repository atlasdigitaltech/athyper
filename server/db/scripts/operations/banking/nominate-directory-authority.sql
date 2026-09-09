-- Administrative bootstrap, no publication or user grants. Supply tenant_id and apply.
BEGIN;
SELECT set_config('app.current_tenant_id',:'tenant_id',true);
DO $$ BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio database required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM master.tenant WHERE id=shared.current_tenant_id() AND status='active') THEN RAISE EXCEPTION 'Active authority tenant required'; END IF;
 IF EXISTS(SELECT 1 FROM publication.bank_directory_authority WHERE tenant_id<>shared.current_tenant_id()) THEN RAISE EXCEPTION 'An authority is already nominated; explicit authority transfer required'; END IF;
END $$;
INSERT INTO publication.bank_directory_authority(singleton,tenant_id) VALUES(true,shared.current_tenant_id()) ON CONFLICT(singleton) DO NOTHING;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM publication.bank_directory_authority WHERE tenant_id=shared.current_tenant_id()) THEN RAISE EXCEPTION 'Authority nomination conflicts with an existing owner'; END IF; END $$;
SELECT tenant_id FROM publication.bank_directory_authority;
\if :apply
COMMIT;
\else
ROLLBACK;
\endif
