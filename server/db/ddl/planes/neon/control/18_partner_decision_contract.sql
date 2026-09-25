-- Canonical decision coverage: no role identity, duplicate coverage or link table.
ALTER TABLE control.business_partner_qualification
 ADD CONSTRAINT business_partner_qualification_snapshot_fk
 FOREIGN KEY(tenant_id,approved_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id);
ALTER TABLE control.business_partner_decision_scope
 ADD CONSTRAINT business_partner_decision_scope_classification_fk
 FOREIGN KEY(tenant_id,commodity_classification_id)
 REFERENCES master.business_partner_commodity_classification(tenant_id,id);
CREATE INDEX business_partner_decision_scope_classification_idx
 ON control.business_partner_decision_scope(tenant_id,commodity_classification_id)
 WHERE commodity_classification_id IS NOT NULL;

CREATE FUNCTION control.guard_partner_decision_scope_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,control,master AS $$
DECLARE r control.business_partner_decision_scope;
        partner_id uuid; sealed boolean; decision_state text;
BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.tenant_id,NEW.qualification_id,NEW.block_id,
 NEW.supplier_preference_id,NEW.customer_designation_id,NEW.credit_review_id)
 IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.qualification_id,OLD.block_id,
 OLD.supplier_preference_id,OLD.customer_designation_id,OLD.credit_review_id) THEN
  RAISE EXCEPTION 'Decision scope cannot change owner' USING ERRCODE='23514';
 END IF;
 IF r.block_id IS NOT NULL THEN
  SELECT business_partner_id,scope_sealed INTO partner_id,sealed
   FROM control.business_partner_block WHERE tenant_id=r.tenant_id AND id=r.block_id FOR UPDATE;
  IF NOT FOUND OR sealed THEN
   RAISE EXCEPTION 'Restriction scope is absent or sealed' USING ERRCODE='23514';
  END IF;
 ELSIF r.qualification_id IS NOT NULL THEN
  SELECT business_partner_id,decision::text INTO partner_id,decision_state
   FROM control.business_partner_qualification WHERE tenant_id=r.tenant_id AND id=r.qualification_id FOR UPDATE;
  IF NOT FOUND OR decision_state<>'pending' THEN
   RAISE EXCEPTION 'Only pending qualification coverage may change' USING ERRCODE='23514';
  END IF;
 ELSE RETURN r;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF r.commodity_classification_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM master.business_partner_commodity_classification c
   WHERE c.tenant_id=r.tenant_id AND c.business_partner_id=partner_id AND c.id=r.commodity_classification_id
 ) THEN RAISE EXCEPTION 'Declared commodity must belong to this tenant and partner' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM control.business_partner_decision_scope s WHERE s.tenant_id=r.tenant_id
     AND s.id<>r.id AND s.block_id IS NOT DISTINCT FROM r.block_id
     AND s.qualification_id IS NOT DISTINCT FROM r.qualification_id)>=100 THEN
  RAISE EXCEPTION 'At most 100 coverage rows are allowed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER decision_scope_00_owner BEFORE INSERT OR UPDATE OR DELETE
 ON control.business_partner_decision_scope FOR EACH ROW EXECUTE FUNCTION control.guard_partner_decision_scope_owner();

CREATE FUNCTION control.assert_partner_decision_coverage(p_tenant uuid,p_qualification uuid,p_block uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,control,master AS $$
DECLARE g smallint; dimension text;
BEGIN
 IF num_nonnulls(p_qualification,p_block)<>1 THEN RAISE EXCEPTION 'Exactly one decision owner is required' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope s WHERE s.tenant_id=p_tenant
  AND s.qualification_id IS NOT DISTINCT FROM p_qualification AND s.block_id IS NOT DISTINCT FROM p_block) THEN
  RAISE EXCEPTION 'Missing coverage never means unrestricted' USING ERRCODE='23514';
 END IF;
 FOR g IN SELECT DISTINCT s.scope_group FROM control.business_partner_decision_scope s WHERE s.tenant_id=p_tenant
  AND s.qualification_id IS NOT DISTINCT FROM p_qualification AND s.block_id IS NOT DISTINCT FROM p_block LOOP
  FOREACH dimension IN ARRAY ARRAY['commercial_capacity','operating_organization','company_code','commodity','country'] LOOP
   IF NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope s WHERE s.tenant_id=p_tenant
     AND s.qualification_id IS NOT DISTINCT FROM p_qualification AND s.block_id IS NOT DISTINCT FROM p_block
     AND s.scope_group=g AND s.scope_mode='include'
     AND CASE WHEN s.scope_kind IN('commodity_category','commodity_classification') THEN 'commodity' ELSE s.scope_kind END=dimension) THEN
    RAISE EXCEPTION 'Coverage group % requires explicit % coverage',g,dimension USING ERRCODE='23514';
   END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM control.business_partner_decision_scope s WHERE s.tenant_id=p_tenant
    AND s.qualification_id IS NOT DISTINCT FROM p_qualification AND s.block_id IS NOT DISTINCT FROM p_block
    AND s.scope_group=g AND s.scope_mode='include'
    GROUP BY CASE WHEN s.scope_kind IN('commodity_category','commodity_classification') THEN 'commodity' ELSE s.scope_kind END,s.country_purpose
    HAVING bool_or(s.selection_mode='all') AND bool_or(s.selection_mode='selected')) THEN
   RAISE EXCEPTION 'A dimension cannot mix all and selected inclusion modes' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM control.business_partner_decision_scope c
   WHERE c.tenant_id=p_tenant AND c.qualification_id IS NOT DISTINCT FROM p_qualification AND c.block_id IS NOT DISTINCT FROM p_block
    AND c.scope_group=g AND c.scope_kind='company_code' AND c.scope_mode='include' AND c.selection_mode='selected'
    AND EXISTS(SELECT 1 FROM control.business_partner_decision_scope o WHERE o.tenant_id=p_tenant
     AND o.qualification_id IS NOT DISTINCT FROM p_qualification AND o.block_id IS NOT DISTINCT FROM p_block
     AND o.scope_group=g AND o.scope_kind='operating_organization' AND o.scope_mode='include' AND o.selection_mode='selected')
    AND NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope o
     JOIN master.operating_organization_company_assignment a ON a.tenant_id=o.tenant_id AND a.operating_organization_id=o.operating_organization_id
     WHERE o.tenant_id=p_tenant AND o.qualification_id IS NOT DISTINCT FROM p_qualification AND o.block_id IS NOT DISTINCT FROM p_block
      AND o.scope_group=g AND o.scope_kind='operating_organization' AND o.scope_mode='include'
      AND a.company_code_id=c.company_code_id AND a.status='active'
      AND a.effective_from<=CURRENT_DATE AND (a.effective_until IS NULL OR a.effective_until>CURRENT_DATE))) THEN
   RAISE EXCEPTION 'Selected company is outside the selected operating organizations' USING ERRCODE='23514';
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION control.require_partner_decision_coverage() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$
DECLARE t uuid; q uuid; b uuid; sealed boolean;
BEGIN
 IF TG_TABLE_NAME='business_partner_decision_scope' THEN
  t:=COALESCE(NEW.tenant_id,OLD.tenant_id); q:=COALESCE(NEW.qualification_id,OLD.qualification_id); b:=COALESCE(NEW.block_id,OLD.block_id);
 ELSIF TG_TABLE_NAME='business_partner_block' THEN t:=NEW.tenant_id; b:=NEW.id;
 ELSE t:=NEW.tenant_id; q:=NEW.id;
 END IF;
 IF b IS NOT NULL THEN
  SELECT scope_sealed INTO sealed FROM control.business_partner_block WHERE tenant_id=t AND id=b;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT sealed THEN RAISE EXCEPTION 'Restriction creation must seal its complete scope atomically' USING ERRCODE='23514'; END IF;
 ELSIF q IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM control.business_partner_qualification WHERE tenant_id=t AND id=q) THEN RETURN NULL; END IF;
 ELSE RETURN NULL;
 END IF;
 PERFORM control.assert_partner_decision_coverage(t,q,b);
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER restriction_complete AFTER INSERT OR UPDATE ON control.business_partner_block
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION control.require_partner_decision_coverage();
CREATE CONSTRAINT TRIGGER qualification_complete AFTER INSERT OR UPDATE ON control.business_partner_qualification
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION control.require_partner_decision_coverage();
CREATE CONSTRAINT TRIGGER decision_scope_complete AFTER INSERT OR UPDATE OR DELETE ON control.business_partner_decision_scope
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION control.require_partner_decision_coverage();

-- No direct application insertion or unsealing. New command/API permission binding
-- must be implemented before these target controls are published to application users.
CREATE FUNCTION control.assemble_partner_decision(
 p_tenant uuid,p_partner uuid,p_kind text,p_header jsonb,p_scopes jsonb,p_actor uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,control,master,shared SET row_security=on AS $$
DECLARE decision_id uuid:=shared.uuidv7();
BEGIN
 IF p_tenant IS DISTINCT FROM shared.current_tenant_id()
  OR p_actor IS DISTINCT FROM nullif(current_setting('app.current_principal_id',true),'')::uuid
  OR p_actor IS NULL THEN RAISE EXCEPTION 'Decision actor/tenant mismatch' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN ('qualification','restriction') OR p_kind IS NULL
  OR jsonb_typeof(p_header) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_scopes) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_scopes) NOT BETWEEN 5 AND 100 THEN
  RAISE EXCEPTION 'Explicit header and complete coverage are required' USING ERRCODE='23514';
 END IF;
 IF p_kind='qualification' THEN
  INSERT INTO control.business_partner_qualification(id,tenant_id,business_partner_id,
   qualification_type_code,idempotency_key,context_kind,context_id,effective_from,effective_until,
   conditions,risk_assessment_id,created_by)
  VALUES(decision_id,p_tenant,p_partner,p_header->>'qualificationTypeCode',p_header->>'idempotencyKey',
   COALESCE(p_header->>'contextKind','standing'),(p_header->>'contextId')::uuid,
   (p_header->>'effectiveFrom')::date,(p_header->>'effectiveUntil')::date,
   COALESCE(p_header->'conditions','[]'::jsonb),(p_header->>'riskAssessmentId')::uuid,p_actor);
 ELSE
  INSERT INTO control.business_partner_block(id,tenant_id,business_partner_id,operation_codes,
   reason_code,reason,effective_from,effective_until,blocked_by,created_by,context_kind,context_id,
   restriction_mode,target_entity_type,target_entity_id,target_line_id)
  VALUES(decision_id,p_tenant,p_partner,ARRAY(SELECT jsonb_array_elements_text(p_header->'operationCodes')),
   p_header->>'reasonCode',p_header->>'reason',COALESCE((p_header->>'effectiveFrom')::timestamptz,clock_timestamp()),
   (p_header->>'effectiveUntil')::timestamptz,p_actor,p_actor,
   COALESCE(p_header->>'contextKind','standing'),(p_header->>'contextId')::uuid,
   COALESCE(p_header->>'restrictionMode','scope'),p_header->>'targetEntityType',
   (p_header->>'targetEntityId')::uuid,(p_header->>'targetLineId')::uuid);
 END IF;
 INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,block_id,
  scope_group,scope_kind,scope_mode,selection_mode,commercial_capacity_code,operating_organization_id,
  company_code_id,commodity_category_id,commodity_classification_id,country_code,country_purpose,created_by)
 SELECT p_tenant,CASE WHEN p_kind='qualification' THEN decision_id END,
  CASE WHEN p_kind='restriction' THEN decision_id END,
  COALESCE((x->>'group')::smallint,1),x->>'kind',COALESCE(x->>'mode','include'),x->>'selection',
  x->>'commercialCapacity',(x->>'operatingOrganizationId')::uuid,(x->>'companyCodeId')::uuid,
  (x->>'commodityCategoryId')::uuid,(x->>'commodityClassificationId')::uuid,
  x->>'countryCode',x->>'countryPurpose',p_actor
 FROM jsonb_array_elements(p_scopes) x;
 PERFORM control.assert_partner_decision_coverage(p_tenant,
  CASE WHEN p_kind='qualification' THEN decision_id END,CASE WHEN p_kind='restriction' THEN decision_id END);
 IF p_kind='restriction' THEN
  UPDATE control.business_partner_block SET scope_sealed=true,updated_at=clock_timestamp(),updated_by=p_actor
   WHERE tenant_id=p_tenant AND id=decision_id;
 END IF;
 RETURN decision_id;
END $$;
-- Internal assembly primitive, not a permission bypass or public API. A reviewed
-- idempotent action/permission wrapper is required before granting execution.
REVOKE ALL ON FUNCTION control.assemble_partner_decision(uuid,uuid,text,jsonb,jsonb,uuid) FROM PUBLIC,athyperapp,athyperadmin;
REVOKE INSERT,UPDATE,DELETE ON control.business_partner_block FROM athyperapp,athyperadmin;
GRANT UPDATE(status,lifted_at,lifted_by,lift_reason,updated_at,updated_by)
 ON control.business_partner_block TO athyperapp,athyperadmin;
REVOKE ALL ON FUNCTION control.guard_partner_decision_scope_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION control.assert_partner_decision_coverage(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION control.require_partner_decision_coverage() FROM PUBLIC;
