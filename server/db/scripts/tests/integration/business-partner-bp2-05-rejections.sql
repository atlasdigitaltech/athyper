-- BP2-05 canonical-reference rejection checks. Synthetic rows; always rolled back.
BEGIN;
DO $$
DECLARE
  tenant_a uuid;
  tenant_b uuid;
  partner_b uuid;
  actor_a uuid;
  actor_b uuid;
  foreign_category uuid := gen_random_uuid();
  category_parent uuid := gen_random_uuid();
  category_child uuid := gen_random_uuid();
  industry_id uuid;
  industry_domain text;
  wrong_domain text;
  alias_id uuid := gen_random_uuid();
  rejected boolean;
  commodity_id uuid;
  commodity_other uuid;
  commodity_domain text;
  assignment_id uuid := gen_random_uuid();
BEGIN
  SELECT bp.tenant_id, bp.id, bp.created_by INTO tenant_b, partner_b, actor_b
  FROM master.business_partner bp ORDER BY bp.created_at LIMIT 1;
  SELECT tenant.id INTO tenant_a FROM master.tenant tenant WHERE tenant.id <> tenant_b ORDER BY tenant.id LIMIT 1;
  SELECT principal.id INTO actor_a FROM master.principal principal WHERE principal.tenant_id = tenant_a ORDER BY principal.id LIMIT 1;
  IF tenant_a IS NULL OR tenant_b IS NULL OR partner_b IS NULL OR actor_a IS NULL OR actor_b IS NULL THEN
    RAISE EXCEPTION 'BP2-05 fixture prerequisites are unavailable';
  END IF;

  INSERT INTO master.commodity_category(id,tenant_id,code,name,status,created_by)
  VALUES(foreign_category,tenant_a,'TEST.BP205.FOREIGN','Foreign category','active',actor_a);
  rejected := false;
  BEGIN
    INSERT INTO master.business_partner_commodity_classification(tenant_id,business_partner_id,commodity_category_id,source_system,source_reference,effective_from,status,created_by)
    VALUES(tenant_b,partner_b,foreign_category,'bp2_acceptance','cross-tenant-category',CURRENT_DATE,'draft',actor_b);
  EXCEPTION WHEN foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Cross-tenant commodity category was admitted'; END IF;

  SELECT id,domain_code INTO industry_id,industry_domain FROM shared.industry_code WHERE status='active' ORDER BY id LIMIT 1;
  wrong_domain := CASE WHEN industry_domain='isic' THEN 'naics' ELSE 'isic' END;
  rejected := false;
  BEGIN
    INSERT INTO master.business_partner_industry_classification(tenant_id,business_partner_id,industry_domain_code,industry_code_id,effective_from,status,created_by)
    VALUES(tenant_b,partner_b,wrong_domain,industry_id,CURRENT_DATE,'draft',actor_b);
  EXCEPTION WHEN foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Wrong industry domain was admitted'; END IF;

  INSERT INTO master.commodity_category(id,tenant_id,code,name,status,created_by)
  VALUES(category_parent,tenant_b,'TEST.BP205.PARENT','Parent category','active',actor_b),
        (category_child,tenant_b,'TEST.BP205.CHILD','Child category','active',actor_b);
  UPDATE master.commodity_category SET parent_id=category_parent WHERE tenant_id=tenant_b AND id=category_child;
  rejected := false;
  BEGIN
    UPDATE master.commodity_category SET parent_id=category_child WHERE tenant_id=tenant_b AND id=category_parent;
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Commodity hierarchy cycle was admitted'; END IF;

  SELECT id,domain_code INTO STRICT commodity_id,commodity_domain FROM shared.commodity_code WHERE status='active' ORDER BY id LIMIT 1;
  SELECT id INTO STRICT commodity_other FROM shared.commodity_code WHERE status='active' AND domain_code=commodity_domain AND id<>commodity_id ORDER BY id LIMIT 1;
  INSERT INTO master.commodity_code_assignment(id,tenant_id,commodity_category_id,commodity_domain_code,commodity_code_id,is_owner_primary,is_code_routing_default,mapping_type,confidence,provenance,created_by)
  VALUES(assignment_id,tenant_b,category_parent,commodity_domain,commodity_id,true,false,'exact',95,'manual',actor_b);
  INSERT INTO master.commodity_code_assignment(tenant_id,commodity_category_id,commodity_domain_code,commodity_code_id,is_owner_primary,is_code_routing_default,mapping_type,confidence,provenance,created_by)
  VALUES(tenant_b,category_child,commodity_domain,commodity_id,false,true,'exact',90,'manual',actor_b);
  IF NOT EXISTS(SELECT 1 FROM master.commodity_code_assignment WHERE id=assignment_id AND is_owner_primary AND NOT is_code_routing_default AND confidence=95 AND provenance='manual') THEN
    RAISE EXCEPTION 'Owner-primary and routing-default mapping identities were conflated';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE master.commodity_code_assignment SET is_code_routing_default=true WHERE id=assignment_id;
  EXCEPTION WHEN unique_violation THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Ambiguous inbound routing default was admitted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO master.commodity_code_assignment(tenant_id,commodity_category_id,commodity_domain_code,commodity_code_id,is_owner_primary,created_by)
    VALUES(tenant_b,category_parent,commodity_domain,commodity_other,true,actor_b);
  EXCEPTION WHEN unique_violation THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Ambiguous owner-primary mapping was admitted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO master.commodity_code_assignment(tenant_id,commodity_category_id,commodity_domain_code,commodity_code_id,created_by)
    VALUES(tenant_b,category_parent,'bp2_wrong_domain',commodity_other,actor_b);
  EXCEPTION WHEN foreign_key_violation THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Cross-domain commodity identity was admitted'; END IF;

  rejected := false;
  BEGIN
    INSERT INTO master.business_partner_alias(id,tenant_id,business_partner_id,alias_kind,alias_name,language_code,created_by)
    VALUES(gen_random_uuid(),tenant_b,partner_b,'trading','Invalid alias locale','en_GB',actor_b);
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Invalid alias locale was admitted'; END IF;
  INSERT INTO master.business_partner_alias(id,tenant_id,business_partner_id,alias_kind,alias_name,language_code,created_by)
  VALUES(alias_id,tenant_b,partner_b,'trading','Valid alias locale','en-GB',actor_b);

  rejected := false;
  BEGIN
    INSERT INTO master.business_partner_relationship(tenant_id,source_business_partner_id,target_business_partner_id,relationship_type_code,status,created_by)
    VALUES(tenant_b,partner_b,partner_b,'parent','draft',actor_b);
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Self relationship was admitted'; END IF;
END $$;
ROLLBACK;
