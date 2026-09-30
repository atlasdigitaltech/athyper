-- Local DEV demo access only. No changes to MFA/SoD or existing human identities.
BEGIN;
DO $$
DECLARE t record; u record; actor uuid; scope_id uuid; rid uuid; gid uuid; codes text[]; permission record; plane text;
BEGIN
 plane:=substring(current_database() from 9);
 IF current_database() NOT IN('athyper_neon','athyper_studio') THEN RAISE EXCEPTION 'Unexpected database'; END IF;
 FOR t IN SELECT id,code FROM master.tenant WHERE code IN('athyper','technostat','cirrusatlantic') AND status='active' LOOP
  SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t.id AND code='seed.three-plane-provisioner';
  PERFORM set_config('app.current_tenant_id',t.id::text,true),set_config('app.current_principal_id',actor::text,true);
  SELECT id INTO STRICT scope_id FROM authz.scope_target WHERE tenant_id=t.id AND scope_kind='tenant' AND target_id=t.id AND status='active';
  FOR u IN SELECT id,code FROM master.principal WHERE tenant_id=t.id AND code IN('athyper.admin','tksa.admin','catl.admin','catl.owner') AND status='active' LOOP
   IF plane='neon' THEN
    codes:=ARRAY['neon.context.catalog.read','neon.relationship.business_partner.read','neon.relationship.business_partner_identity.read',
     'neon.relationship.business_partner_contact.read','neon.relationship.business_partner_address.read',
     'neon.relationship.business_partner_person.read',
     'neon.relationship.business_partner_identifier.read_masked','neon.relationship.business_partner_tax.read_masked',
     'neon.relationship.business_partner_bank.read_masked','neon.relationship.business_partner_qualification.read',
     'neon.relationship.business_partner_certificate.read','neon.relationship.business_partner_network.read',
     'neon.business_partner_classification.read','neon.business_partner_industry_classification.read',
     'neon.business_partner_registration.read'];
    IF u.code='catl.owner' THEN codes:=codes||ARRAY['neon.business_partner_registration.decide'];
    ELSE codes:=codes||ARRAY['neon.business_partner_registration.create','neon.business_partner_registration.validate','neon.business_partner_registration.submit','neon.business_partner_registration.materialize']; END IF;
   ELSE
    codes:=ARRAY['studio.business_partner_definition.read'];
    IF u.code='catl.owner' THEN codes:=codes||ARRAY['studio.business_partner_definition.publish'];
    ELSE codes:=codes||ARRAY['studio.business_partner_definition.author']; END IF;
   END IF;
   IF (SELECT count(*) FROM authz.permission WHERE canonical_code=ANY(codes) AND status='published')<>cardinality(codes) THEN RAISE EXCEPTION 'Missing fixture permissions'; END IF;
   INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
    SELECT p.id,'tenant','exact','active',actor FROM authz.permission p WHERE p.canonical_code=ANY(codes)
    AND NOT EXISTS(SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.scope_kind='tenant' AND s.propagation_mode='exact');
   SELECT id INTO rid FROM authz.role WHERE tenant_id=t.id AND code='dev.bp.rebuild.'||u.code;
   IF rid IS NOT NULL THEN RAISE EXCEPTION 'Access already seeded; inspect instead of expanding'; END IF;
   INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
    VALUES(t.id,'dev.bp.rebuild.'||u.code,'DEV BP scoped acceptance','custom','manual','authorized-dev-rebuild-20260924','draft',actor) RETURNING id INTO rid;
   INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT t.id,rid,id,actor FROM authz.permission WHERE canonical_code=ANY(codes);
   UPDATE authz.role SET status='active',updated_by=actor WHERE id=rid AND tenant_id=t.id;
   INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
    VALUES(t.id,'dev.bp.rebuild.'||u.code,'DEV BP scoped acceptance','custom','manual','authorized-dev-rebuild-20260924','active',actor) RETURNING id INTO gid;
   INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by) VALUES(t.id,gid,u.id,'manual','authorized-dev-rebuild-20260924','active',actor);
   INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by) VALUES(t.id,gid,rid,scope_id,'exact','manual','authorized-dev-rebuild-20260924','active',actor);
  END LOOP;
 END LOOP;
END $$;
COMMIT;
