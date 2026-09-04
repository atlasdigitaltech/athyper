-- G2 hardening: exact commercial-role bindings, bounded metadata/URLs, and
-- optimistic Customer lifecycle outcomes. Forward-only and preflight-first.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM control.business_partner_qualification q
    WHERE NOT EXISTS (
      SELECT 1 FROM master.supplier s WHERE q.partner_role='supplier'
        AND (s.tenant_id,s.business_partner_id)=(q.tenant_id,q.business_partner_id)
      UNION ALL
      SELECT 1 FROM master.customer c WHERE q.partner_role='customer'
        AND (c.tenant_id,c.business_partner_id)=(q.tenant_id,q.business_partner_id)
    )
  ) THEN RAISE EXCEPTION 'G2 preflight: qualification has no matching commercial role'; END IF;
  IF EXISTS (SELECT 1 FROM control.supplier_preference_designation d JOIN master.supplier s ON (s.tenant_id,s.id)=(d.tenant_id,d.supplier_id) WHERE s.business_partner_id<>d.business_partner_id)
  THEN RAISE EXCEPTION 'G2 preflight: supplier preference role pair mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM control.customer_account_designation d JOIN master.customer c ON (c.tenant_id,c.id)=(d.tenant_id,d.customer_id) WHERE c.business_partner_id<>d.business_partner_id)
     OR EXISTS (SELECT 1 FROM control.customer_credit_review r JOIN master.customer c ON (c.tenant_id,c.id)=(r.tenant_id,r.customer_id) WHERE c.business_partner_id<>r.business_partner_id)
  THEN RAISE EXCEPTION 'G2 preflight: customer authority role pair mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM master.business_partner WHERE website_url IS NOT NULL AND (length(website_url)>2048 OR website_url~'[[:space:][:cntrl:]@]' OR website_url!~*'^https://([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?::[0-9]{1,5})?(?:[/#?][^[:space:][:cntrl:]]*)?$'))
  THEN RAISE EXCEPTION 'G2 preflight: unsafe historical Business Partner website URL'; END IF;
  IF EXISTS (SELECT 1 FROM master.contact_link WHERE channel_type='website' AND (length(value)>2048 OR value~'[[:space:][:cntrl:]@]' OR value!~*'^https://([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?::[0-9]{1,5})?(?:[/#?][^[:space:][:cntrl:]]*)?$'))
  THEN RAISE EXCEPTION 'G2 preflight: unsafe historical contact website URL'; END IF;
  IF EXISTS (SELECT 1 FROM master.business_partner WHERE metadata-ARRAY['_seed','acceptanceFamily','externalScopeKey','sourceSystem','sourceReference','integrationTags','notes','importedAt','importBatchId']::text[]<>'{}'::jsonb)
     OR EXISTS (SELECT 1 FROM master.supplier WHERE metadata-ARRAY['sourceSystem','sourceReference','integrationTags','notes','importedAt','importBatchId']::text[]<>'{}'::jsonb)
     OR EXISTS (SELECT 1 FROM master.customer WHERE metadata-ARRAY['sourceSystem','sourceReference','integrationTags','notes','importedAt','importBatchId']::text[]<>'{}'::jsonb)
  THEN RAISE EXCEPTION 'G2 preflight: historical metadata contains keys outside contract v1 allowlist'; END IF;
END $$;

ALTER TABLE master.supplier ADD CONSTRAINT supplier_tenant_role_partner_uq UNIQUE(tenant_id,id,business_partner_id);
ALTER TABLE master.customer ADD CONSTRAINT customer_tenant_role_partner_uq UNIQUE(tenant_id,id,business_partner_id);

ALTER TABLE control.business_partner_qualification ADD COLUMN role_id uuid;
UPDATE control.business_partner_qualification q SET role_id=CASE q.partner_role
  WHEN 'supplier' THEN (SELECT s.id FROM master.supplier s WHERE (s.tenant_id,s.business_partner_id)=(q.tenant_id,q.business_partner_id))
  ELSE (SELECT c.id FROM master.customer c WHERE (c.tenant_id,c.business_partner_id)=(q.tenant_id,q.business_partner_id)) END;
ALTER TABLE control.business_partner_qualification ALTER COLUMN role_id SET NOT NULL;

ALTER TABLE control.supplier_preference_designation DROP CONSTRAINT supplier_preference_designation_supplier_fk,
  ADD CONSTRAINT supplier_preference_designation_supplier_fk FOREIGN KEY(tenant_id,supplier_id,business_partner_id) REFERENCES master.supplier(tenant_id,id,business_partner_id) ON DELETE RESTRICT;
ALTER TABLE control.customer_account_designation DROP CONSTRAINT customer_account_designation_customer_fk,
  ADD CONSTRAINT customer_account_designation_customer_fk FOREIGN KEY(tenant_id,customer_id,business_partner_id) REFERENCES master.customer(tenant_id,id,business_partner_id) ON DELETE RESTRICT;
ALTER TABLE control.customer_credit_review DROP CONSTRAINT customer_credit_review_customer_fk,
  ADD CONSTRAINT customer_credit_review_customer_fk FOREIGN KEY(tenant_id,customer_id,business_partner_id) REFERENCES master.customer(tenant_id,id,business_partner_id) ON DELETE RESTRICT;
ALTER TABLE control.customer_lifecycle_event DROP CONSTRAINT customer_lifecycle_event_customer_fk,
  ADD CONSTRAINT customer_lifecycle_event_customer_fk FOREIGN KEY(tenant_id,customer_id,business_partner_id) REFERENCES master.customer(tenant_id,id,business_partner_id) ON DELETE RESTRICT;

CREATE FUNCTION control.trg_validate_qualification_role_pair()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control,master AS $$
BEGIN
  IF NEW.partner_role='supplier' THEN
    SELECT s.id INTO NEW.role_id FROM master.supplier s WHERE s.tenant_id=NEW.tenant_id AND s.business_partner_id=NEW.business_partner_id AND(NEW.role_id IS NULL OR s.id=NEW.role_id) AND s.status<>'archived';
  ELSE
    SELECT c.id INTO NEW.role_id FROM master.customer c WHERE c.tenant_id=NEW.tenant_id AND c.business_partner_id=NEW.business_partner_id AND(NEW.role_id IS NULL OR c.id=NEW.role_id) AND c.status<>'archived';
  END IF;
  IF NEW.role_id IS NULL THEN RAISE EXCEPTION 'Qualification role does not belong to the selected Business Partner' USING ERRCODE='foreign_key_violation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_business_partner_qualification_15_role_pair BEFORE INSERT OR UPDATE OF tenant_id,business_partner_id,partner_role,role_id ON control.business_partner_qualification FOR EACH ROW EXECUTE FUNCTION control.trg_validate_qualification_role_pair();

ALTER TABLE master.business_partner DROP CONSTRAINT business_partner_website_chk,
  ADD CONSTRAINT business_partner_website_chk CHECK(website_url IS NULL OR(length(website_url)<=2048 AND website_url!~'[[:space:][:cntrl:]@]' AND website_url~*'^https://([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?::[0-9]{1,5})?(?:[/#?][^[:space:][:cntrl:]]*)?$'));
ALTER TABLE master.business_partner DROP CONSTRAINT business_partner_metadata_object_chk,
  ADD CONSTRAINT business_partner_metadata_object_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384 AND metadata-ARRAY['_seed','acceptanceFamily','externalScopeKey','sourceSystem','sourceReference','integrationTags','notes','importedAt','importBatchId']::text[]='{}'::jsonb);
ALTER TABLE master.supplier DROP CONSTRAINT supplier_metadata_object_chk,
  ADD CONSTRAINT supplier_metadata_object_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384 AND metadata-ARRAY['sourceSystem','sourceReference','integrationTags','notes','importedAt','importBatchId']::text[]='{}'::jsonb);
ALTER TABLE master.customer DROP CONSTRAINT customer_metadata_object_chk,
  ADD CONSTRAINT customer_metadata_object_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384 AND metadata-ARRAY['sourceSystem','sourceReference','integrationTags','notes','importedAt','importBatchId']::text[]='{}'::jsonb);

CREATE OR REPLACE FUNCTION master.trg_normalize_contact_link()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
BEGIN
  NEW.value:=btrim(NEW.value); NEW.purpose:=lower(btrim(NEW.purpose)); NEW.role_qualifier:=nullif(btrim(NEW.role_qualifier),'');
  IF NEW.channel_type='email' THEN
    NEW.value:=lower(NEW.value);
    IF NEW.value!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Invalid email contact value' USING ERRCODE='check_violation'; END IF;
  ELSIF NEW.channel_type IN('phone','fax','sms','whatsapp') THEN
    IF NEW.value!~'^\+[1-9][0-9]{1,14}$' THEN RAISE EXCEPTION 'Phone-family contact values must use E.164' USING ERRCODE='check_violation'; END IF;
  ELSIF NEW.channel_type='website' THEN
    IF length(NEW.value)>2048 OR NEW.value~'[[:space:][:cntrl:]@]' OR NEW.value!~*'^https://([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?::[0-9]{1,5})?(?:[/#?][^[:space:][:cntrl:]]*)?$'
    THEN RAISE EXCEPTION 'Website contact value must be a credential-free absolute HTTPS URL with a valid DNS host' USING ERRCODE='check_violation'; END IF;
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE control.customer_lifecycle_event ADD COLUMN expected_version bigint, ADD COLUMN resulting_version bigint;
UPDATE control.customer_lifecycle_event e SET expected_version=m.expected_version,resulting_version=m.resulting_version
FROM control.business_partner_mutation_evidence m WHERE m.tenant_id=e.tenant_id AND m.aggregate_kind='customer' AND m.aggregate_id=e.customer_id AND m.idempotency_key=e.idempotency_key;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM control.customer_lifecycle_event WHERE expected_version IS NULL OR resulting_version IS NULL) THEN RAISE EXCEPTION 'G2 preflight: lifecycle event has no authoritative version evidence'; END IF; END $$;
ALTER TABLE control.customer_lifecycle_event ALTER COLUMN expected_version SET NOT NULL, ALTER COLUMN resulting_version SET NOT NULL,
  ADD CONSTRAINT customer_lifecycle_event_version_chk CHECK(expected_version>=1 AND resulting_version=expected_version+1),
  DROP CONSTRAINT customer_lifecycle_event_action_chk,
  ADD CONSTRAINT customer_lifecycle_event_action_chk CHECK(action_code IN('activate','suspend','reactivate','deactivate','archive')),
  DROP CONSTRAINT customer_lifecycle_event_transition_chk,
  ADD CONSTRAINT customer_lifecycle_event_transition_chk CHECK((action_code='activate' AND from_status='prospect' AND to_status='active') OR(action_code='suspend' AND from_status='active' AND to_status='suspended') OR(action_code='reactivate' AND from_status='suspended' AND to_status='active') OR(action_code='deactivate' AND from_status IN('active','suspended') AND to_status='inactive') OR(action_code='archive' AND from_status='inactive' AND to_status='archived')),
  DROP CONSTRAINT customer_lifecycle_event_readiness_chk,
  ADD CONSTRAINT customer_lifecycle_event_readiness_chk CHECK(action_code IN('suspend','deactivate','archive') OR(readiness_fingerprint IS NOT NULL AND readiness_evidence->>'decisionFingerprint'=readiness_fingerprint AND readiness_evidence->>'eligible'='true'));

DROP FUNCTION control.command_customer_lifecycle(uuid,uuid,uuid,uuid,uuid,text,text,date,text,jsonb,text,uuid);
CREATE FUNCTION control.command_customer_lifecycle(
  p_tenant_id uuid,p_business_partner_id uuid,p_customer_id uuid,
  p_operating_organization_id uuid,p_company_code_id uuid,p_action text,
  p_expected_version bigint,p_reason_code text,p_business_date date,
  p_readiness_fingerprint text,p_readiness_evidence jsonb,
  p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(customer_id uuid,status text,resulting_version bigint,event_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control,master,shared AS $$
DECLARE
  v_customer master.customer%ROWTYPE;
  v_existing control.customer_lifecycle_event%ROWTYPE;
  v_event_id uuid; v_from text; v_to text; v_fingerprint text;
BEGIN
  IF NULLIF(current_setting('app.current_tenant_id',true),'')::uuid IS DISTINCT FROM p_tenant_id
     OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id
  THEN RAISE EXCEPTION 'Customer lifecycle command context does not match tenant and actor' USING ERRCODE='insufficient_privilege'; END IF;
  IF p_action NOT IN('activate','suspend','reactivate','deactivate','archive') OR p_expected_version<1
     OR p_reason_code!~'^[A-Z][A-Z0-9_.-]{2,126}$' OR btrim(p_idempotency_key)<>p_idempotency_key
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 OR jsonb_typeof(COALESCE(p_readiness_evidence,'{}'::jsonb))<>'object'
  THEN RAISE EXCEPTION 'Invalid Customer lifecycle command' USING ERRCODE='check_violation'; END IF;
  v_from:=CASE p_action WHEN 'activate' THEN 'prospect' WHEN 'suspend' THEN 'active' WHEN 'reactivate' THEN 'suspended' WHEN 'archive' THEN 'inactive' END;
  v_to:=CASE p_action WHEN 'suspend' THEN 'suspended' WHEN 'deactivate' THEN 'inactive' WHEN 'archive' THEN 'archived' ELSE 'active' END;
  IF p_action NOT IN('suspend','deactivate','archive') AND(p_readiness_fingerprint IS NULL OR p_readiness_fingerprint!~'^[a-f0-9]{64}$' OR p_readiness_evidence->>'decisionFingerprint' IS DISTINCT FROM p_readiness_fingerprint OR p_readiness_evidence->>'eligible' IS DISTINCT FROM 'true' OR p_readiness_evidence->>'businessPartnerId' IS DISTINCT FROM p_business_partner_id::text OR p_readiness_evidence->>'role' IS DISTINCT FROM 'customer' OR p_readiness_evidence->>'operatingOrganizationId' IS DISTINCT FROM p_operating_organization_id::text OR p_readiness_evidence->>'companyCodeId' IS DISTINCT FROM p_company_code_id::text OR p_readiness_evidence->>'businessDate' IS DISTINCT FROM p_business_date::text)
  THEN RAISE EXCEPTION 'Customer activation requires matching eligible readiness evidence' USING ERRCODE='check_violation'; END IF;
  v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object('tenantId',p_tenant_id,'businessPartnerId',p_business_partner_id,'customerId',p_customer_id,'operatingOrganizationId',p_operating_organization_id,'companyCodeId',p_company_code_id,'action',p_action,'expectedVersion',p_expected_version,'reasonCode',p_reason_code,'businessDate',p_business_date,'readinessFingerprint',p_readiness_fingerprint,'readinessEvidence',COALESCE(p_readiness_evidence,'{}'::jsonb),'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':customer-lifecycle:'||p_customer_id::text,0));
  SELECT e.* INTO v_existing FROM control.customer_lifecycle_event e WHERE e.tenant_id=p_tenant_id AND e.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.command_fingerprint IS DISTINCT FROM v_fingerprint THEN RAISE EXCEPTION 'Customer lifecycle idempotency key was reused for another command' USING ERRCODE='unique_violation'; END IF;
    RETURN QUERY SELECT v_existing.customer_id,v_existing.to_status,v_existing.resulting_version,v_existing.id,true; RETURN;
  END IF;
  SELECT c.* INTO v_customer FROM master.customer c WHERE c.tenant_id=p_tenant_id AND c.id=p_customer_id AND c.business_partner_id=p_business_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS(SELECT 1 FROM master.customer c WHERE c.id=p_customer_id) THEN RAISE EXCEPTION 'Customer belongs to another tenant or Business Partner' USING ERRCODE='insufficient_privilege'; END IF;
    RAISE EXCEPTION 'Customer was not found' USING ERRCODE='no_data_found';
  END IF;
  IF v_customer.record_version<>p_expected_version THEN RAISE EXCEPTION 'Customer version is stale' USING ERRCODE='serialization_failure'; END IF;
  IF(p_action='deactivate' AND v_customer.status::text NOT IN('active','suspended')) OR(p_action<>'deactivate' AND v_customer.status::text<>v_from) THEN RAISE EXCEPTION 'Invalid Customer lifecycle transition' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  IF NOT EXISTS(SELECT 1 FROM master.business_partner_operating_organization_assignment a JOIN master.operating_organization_company_assignment s ON s.tenant_id=a.tenant_id AND s.operating_organization_id=a.operating_organization_id AND s.company_code_id=p_company_code_id AND s.status='active' AND s.effective_from<=p_business_date AND(s.effective_until IS NULL OR s.effective_until>p_business_date) WHERE a.tenant_id=p_tenant_id AND a.business_partner_id=p_business_partner_id AND a.operating_organization_id=p_operating_organization_id AND a.partner_role='customer' AND a.status='active' AND a.effective_from<=p_business_date AND(a.effective_until IS NULL OR a.effective_until>p_business_date)) THEN RAISE EXCEPTION 'Customer lifecycle command is outside an active organization/company scope' USING ERRCODE='check_violation'; END IF;
  INSERT INTO control.customer_lifecycle_event(tenant_id,business_partner_id,customer_id,operating_organization_id,company_code_id,action_code,from_status,to_status,expected_version,resulting_version,reason_code,business_date,readiness_fingerprint,readiness_evidence,idempotency_key,command_fingerprint,occurred_by)
  VALUES(p_tenant_id,p_business_partner_id,p_customer_id,p_operating_organization_id,p_company_code_id,p_action,v_customer.status::text,v_to,p_expected_version,p_expected_version+1,p_reason_code,p_business_date,p_readiness_fingerprint,COALESCE(p_readiness_evidence,'{}'::jsonb),p_idempotency_key,v_fingerprint,p_actor_id) RETURNING id INTO v_event_id;
  PERFORM set_config('app.customer_lifecycle_event_id',v_event_id::text,true);
  UPDATE master.customer SET status=v_to::master.customer_status_d,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_customer_id;
  PERFORM set_config('app.customer_lifecycle_event_id','',true);
  RETURN QUERY SELECT p_customer_id,v_to,p_expected_version+1,v_event_id,false;
END $$;
REVOKE ALL ON FUNCTION control.command_customer_lifecycle(uuid,uuid,uuid,uuid,uuid,text,bigint,text,date,text,jsonb,text,uuid) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT EXECUTE ON FUNCTION control.command_customer_lifecycle(uuid,uuid,uuid,uuid,uuid,text,bigint,text,date,text,jsonb,text,uuid) TO athyperapp; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT EXECUTE ON FUNCTION control.command_customer_lifecycle(uuid,uuid,uuid,uuid,uuid,text,bigint,text,date,text,jsonb,text,uuid) TO athyperadmin; END IF;
END $$;

INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT value.id::uuid,value.code,'entity_operation',module.id,'critical'::authz.risk_tier_d,true,true,false,false,false,'{"_seed":{"pack":"neon.customer-onboarding-permissions","version":"1.1.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN(VALUES
 ('cbbdaef1-8a21-4ed7-a622-957fd6788e29','neon.customer.lifecycle.deactivate'),
 ('f37228fa-2e7d-45ee-bc92-81abb949e46f','neon.customer.lifecycle.archive')
) value(id,code) WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=true,requires_sod=true,metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code IN('neon.customer.lifecycle.deactivate','neon.customer.lifecycle.archive')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

COMMENT ON COLUMN control.business_partner_qualification.role_id IS 'Exact supplier/customer role identity owned by this qualification; the bounded role discriminator is validated against the matching tenant/BP pair.';
COMMENT ON TABLE master.supplier IS 'Stable one-lifetime supplier role identity. Lifecycle history is immutable command evidence; duplicate effective-dated role episodes are intentionally rejected.';
COMMENT ON TABLE master.customer IS 'Stable one-lifetime customer role identity. Lifecycle history is immutable command evidence; duplicate effective-dated role episodes are intentionally rejected.';
