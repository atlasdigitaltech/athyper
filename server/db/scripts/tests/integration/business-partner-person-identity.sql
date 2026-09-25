-- Run on the coordinated schema. All synthetic writes roll back.
BEGIN;
DO $$
DECLARE tenant uuid; actor uuid; other_tenant uuid; person uuid:=gen_random_uuid();
 partner uuid:=gen_random_uuid(); organization uuid:=gen_random_uuid();
BEGIN
 SELECT p.tenant_id,p.id INTO STRICT tenant,actor FROM master.principal p WHERE p.code='catl.admin';
 SELECT t.id INTO STRICT other_tenant FROM master.tenant t WHERE t.id<>tenant ORDER BY t.id LIMIT 1;
 PERFORM set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',tenant::text,true),set_config('app.current_principal_id',actor::text,true);
 INSERT INTO master.person(id,tenant_id,code,name,first_name,last_name,created_by)
 VALUES(person,tenant,'PERSON.IDENTITY.TEST','Maya Example','Maya','Example',actor);
 INSERT INTO master.business_partner(id,tenant_id,code,name,partner_category,person_id,category_locked_by,created_by)
 VALUES(partner,tenant,'BP.PERSON.IDENTITY.TEST','Maya Example','person',person,actor,actor);
 INSERT INTO master.business_partner(id,tenant_id,code,name,category_locked_by,created_by)
 VALUES(organization,tenant,'BP.ORG.IDENTITY.TEST','Example Ltd',actor,actor);
 SET CONSTRAINTS ALL IMMEDIATE;
 IF EXISTS(SELECT 1 FROM master.business_partner_organization_identity WHERE business_partner_id=partner) THEN RAISE EXCEPTION 'Person received organization subtype'; END IF;
 IF (SELECT count(*) FROM master.business_partner_organization_identity WHERE business_partner_id=organization)<>1 THEN RAISE EXCEPTION 'Organization subtype missing'; END IF;
 BEGIN
  INSERT INTO master.business_partner(tenant_id,code,name,partner_category,category_locked_by,created_by)
  VALUES(tenant,'BP.PERSON.NOREF','Invalid','person',actor,actor);
  RAISE EXCEPTION 'Missing person accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO master.business_partner(tenant_id,code,name,person_id,category_locked_by,created_by)
  VALUES(tenant,'BP.ORG.PERSON','Invalid',person,actor,actor);
  RAISE EXCEPTION 'Organization person reference accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO master.business_partner(tenant_id,code,name,partner_category,person_id,category_locked_by,created_by)
  VALUES(tenant,'BP.PERSON.DUP','Duplicate','person',person,actor,actor);
  RAISE EXCEPTION 'Duplicate person purpose accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 INSERT INTO master.business_partner(tenant_id,code,name,partner_category,person_id,representation_purpose_code,category_locked_by,created_by)
 VALUES(tenant,'BP.PERSON.OTHER','Other representation','person',person,'other',actor,actor);
 BEGIN
  INSERT INTO master.business_partner(tenant_id,code,name,partner_category,person_id,category_locked_by,created_by)
  VALUES(other_tenant,'BP.PERSON.CROSS','Invalid','person',person,actor,actor);
  RAISE EXCEPTION 'Cross-tenant person accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN DELETE FROM master.person p WHERE p.id=person; RAISE EXCEPTION 'Referenced person deleted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN DELETE FROM master.business_partner_organization_identity WHERE business_partner_id=organization; RAISE EXCEPTION 'Required subtype deleted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO master.business_partner_organization_identity(business_partner_id,tenant_id,legal_name,created_by)
  VALUES(partner,tenant,'Invalid',actor);
  RAISE EXCEPTION 'Person organization subtype accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
