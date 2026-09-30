-- Existing DEV only. Additive synthetic account; never payment-ready.
-- Run: docker exec -i athyper-dev-db-1 psql -X -v ON_ERROR_STOP=1 -U postgres -d athyper_neon < tooling/scripts/local-dev/seed-catl-directory-bank.sql
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE
 t constant uuid := '44444444-4444-4444-8444-444444444444';
 bp constant uuid := 'b4137225-4534-5469-8138-09d15a970271';
 instrument constant uuid := 'cd5b4b2e-b42e-4608-9a82-c04ca9d83002';
 link constant uuid := 'cd5b4b2e-b42e-4608-9a82-c04ca9d84002';
 actor uuid; institution uuid; branch uuid; owner_type uuid;
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Neon database required'; END IF;
 SELECT created_by INTO STRICT actor FROM master.business_partner
 WHERE tenant_id=t AND id=bp AND code='BP-DEMO-CORE-001';
 SELECT id INTO STRICT institution FROM shared.bank_institution
 WHERE name='Malayan Banking Berhad' AND country_code='MY' AND status='active';
 SELECT id INTO STRICT branch FROM shared.bank_branch
 WHERE institution_id=institution AND name='Malayan Banking Berhad — Menara Maybank Branch' AND status='active';
 IF NOT EXISTS(SELECT 1 FROM shared.bank_identifier WHERE institution_id=institution AND branch_id=branch AND scheme='national_branch_code')
 THEN RAISE EXCEPTION 'Seeded branch directory identifier required'; END IF;
 SELECT id INTO STRICT owner_type FROM control.owner_type WHERE tenant_id IS NULL AND code='business_partner';
 PERFORM set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',t::text,true),
 set_config('app.current_principal_id',actor::text,true),set_config('app.current_actor_type','user',true);
 PERFORM pg_advisory_xact_lock(hashtextextended('demo.catl.directory-bank.v1',0));
 INSERT INTO master.payment_instrument(id,tenant_id,instrument_type_code,name,status,metadata,created_by)
 VALUES(instrument,t,'bank_account','Directory-linked demo — not for payment','inactive','{"_seed":"demo.catl.directory-bank.v1"}',actor)
 ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM master.payment_instrument WHERE id=instrument AND tenant_id=t AND status='inactive' AND instrument_type_code='bank_account' AND metadata->>'_seed'='demo.catl.directory-bank.v1')
 THEN RAISE EXCEPTION 'Instrument drift; refusing overwrite'; END IF;
 INSERT INTO master.bank_account(id,tenant_id,bank_institution_id,bank_branch_id,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,metadata,created_by)
 VALUES(instrument,t,institution,branch,'Aster Research Services (Demo)','local','DEMOCATL00003002','3002','MYR','{"_seed":"demo.catl.directory-bank.v1"}',actor)
 ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM master.bank_account WHERE id=instrument AND tenant_id=t AND bank_institution_id=institution AND bank_branch_id=branch AND provisional_bank_reference_id IS NULL AND account_id_value='DEMOCATL00003002' AND currency_code='MYR' AND metadata->>'_seed'='demo.catl.directory-bank.v1')
 THEN RAISE EXCEPTION 'Account drift; refusing overwrite'; END IF;
 INSERT INTO master.payment_instrument_link(id,tenant_id,owner_type_id,owner_type,owner_id,payment_instrument_id,relationship_role,purpose,is_primary,effective_from,metadata,created_by)
 VALUES(link,t,owner_type,'business_partner',bp,instrument,'beneficiary','default',false,'2025-01-01','{"_seed":"demo.catl.directory-bank.v1"}',actor)
 ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM master.payment_instrument_link WHERE id=link AND tenant_id=t AND owner_id=bp AND payment_instrument_id=instrument AND relationship_role='beneficiary' AND NOT is_primary AND company_code_id IS NULL AND metadata->>'_seed'='demo.catl.directory-bank.v1')
 THEN RAISE EXCEPTION 'Link drift; refusing overwrite'; END IF;
END $$;
COMMIT;
