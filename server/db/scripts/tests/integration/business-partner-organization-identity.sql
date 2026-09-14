-- Reversible check of the canonical organization-only, single-name DDL.
BEGIN;
CREATE TEMP TABLE bp_identity_check (LIKE master.business_partner INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
INSERT INTO bp_identity_check(tenant_id,code,name,category_locked_by,created_by)
VALUES('11111111-1111-4111-8111-111111111111','BP.IDENTITY.CHECK',repeat('N',320),
       '22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222');
DO $$ BEGIN
  BEGIN PERFORM 'person'::master.business_partner_category_d;
    RAISE EXCEPTION 'Person category was accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM 'group'::master.business_partner_category_d;
    RAISE EXCEPTION 'Group category was accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE bp_identity_check SET name=repeat('N',321);
    RAISE EXCEPTION 'Overlong registered name was accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE bp_identity_check SET name=' ';
    RAISE EXCEPTION 'Blank registered name was accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='master'
    AND table_name='business_partner' AND column_name IN('display_name','legal_name')) THEN
    RAISE EXCEPTION 'Obsolete name columns remain'; END IF;
  IF to_regclass('master.person_business_partner_legacy_link') IS NOT NULL THEN
    RAISE EXCEPTION 'Obsolete historical link remains'; END IF;
  IF to_regclass('master.business_partner_alias') IS NULL OR to_regclass('master.person') IS NULL
    OR to_regclass('master.external_worker') IS NULL THEN
    RAISE EXCEPTION 'Alias or People/Workforce authority is missing'; END IF;
END $$;
ROLLBACK;
