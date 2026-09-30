-- New synthetic protected account and link; existing linked identity is immutable.
-- Only execute after the corresponding protected-value secret has been verified.
DO $fixture$ DECLARE actor uuid; BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Isolated NEON required';END IF;
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id='44444444-4444-4444-8444-444444444444' AND code='seed.three-plane-provisioner' AND status='active';
 INSERT INTO master.bank_account(id,tenant_id,provisional_bank_reference_id,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bank_name_override,bank_country_override,metadata,created_by)
 SELECT 'b19c9b40-398c-4b73-a5c4-e2d13f541531',tenant_id,provisional_bank_reference_id,account_holder_name,account_id_type,'45C755C9E88BA16735DAA1E465DDE67BFCB209EA707EA9955EBB853683B8A248',account_last4,currency_code,bank_name_override,bank_country_override,
 jsonb_build_object('protectedValueToken','qualification.bp.finance-reveal.01d4baa18931c720.bank','qualification','isolated synthetic protected reveal'),actor
 FROM master.bank_account WHERE id='85363c6b-2735-4071-8dc7-c6c19a2d2e42' AND tenant_id='44444444-4444-4444-8444-444444444444' AND account_id_value='GB82WEST12345698765432' AND is_verified=false;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original synthetic bank fixture changed';END IF;
 INSERT INTO master.bank_account_link(id,tenant_id,owner_type_id,owner_type,owner_id,relationship_role,bank_account_id,purpose,is_primary,effective_from,metadata,created_by)
 SELECT 'b19c9b40-398c-4b73-a5c4-e2d13f541532',tenant_id,owner_type_id,owner_type,owner_id,relationship_role,'b19c9b40-398c-4b73-a5c4-e2d13f541531',purpose,false,effective_from,'{"qualification":"isolated synthetic protected reveal"}',actor
 FROM master.bank_account_link WHERE id='b23870af-fa78-44bd-b4de-8f3763153fe8' AND owner_id='01a092d1-8242-7948-9ce9-6f19c38c4b27' AND tenant_id='44444444-4444-4444-8444-444444444444';
 IF NOT FOUND THEN RAISE EXCEPTION 'Original synthetic bank link changed';END IF;
END $fixture$;
