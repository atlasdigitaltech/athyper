-- Upgrade definitions corrected by the 2026-09-09 database review.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN IF current_database()<>'athyper_mesh' THEN RAISE EXCEPTION 'This migration requires athyper_mesh'; END IF; END $$;

ALTER TABLE mesh.network_relationship_capability DROP CONSTRAINT network_relationship_capability_approval_chk,
 ADD CONSTRAINT network_relationship_capability_approval_chk CHECK (
        (status = 'requested' AND approved_by_tenant_id IS NULL)
        OR (status = 'rejected' AND approved_by_tenant_id IS NOT NULL)
        OR (status IN ('active', 'suspended') AND approved_by_tenant_id IS NOT NULL AND approved_by_tenant_id <> requested_by_tenant_id)
        OR (status = 'ended' AND (approved_by_tenant_id IS NULL OR approved_by_tenant_id <> requested_by_tenant_id))
    );
DO $receipt$ BEGIN
 IF to_regclass('mesh.network_discovery_receipt') IS NULL THEN
CREATE TABLE mesh.network_discovery_receipt (
  actor_tenant_id uuid NOT NULL REFERENCES master.tenant(id),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200 AND btrim(idempotency_key)=idempotency_key),
  command_fingerprint text NOT NULL CHECK (command_fingerprint ~ '^[a-f0-9]{64}$'),
  relationship_id uuid NOT NULL REFERENCES mesh.network_relationship(id),
  capability_id uuid NOT NULL REFERENCES mesh.network_relationship_capability(id),
  PRIMARY KEY(actor_tenant_id,idempotency_key)
);
ALTER TABLE mesh.network_discovery_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_discovery_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY network_discovery_receipt_owner ON mesh.network_discovery_receipt
  FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
REVOKE ALL ON mesh.network_discovery_receipt FROM PUBLIC,athyperapp;
CREATE TRIGGER network_discovery_receipt_immutable BEFORE UPDATE OR DELETE ON mesh.network_discovery_receipt
  FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();


 END IF;
END $receipt$;
CREATE OR REPLACE FUNCTION mesh.command_relationship_capability_lifecycle(p_capability_id uuid,p_action text,p_expected_version bigint,p_reason text,p_idempotency_key text,p_actor_id uuid)
RETURNS TABLE(capability_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_cap mesh.network_relationship_capability%ROWTYPE;v_rel mesh.network_relationship%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_to text;v_hash text;v_evidence uuid;v_other uuid;
BEGIN
 IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_action NOT IN('accept','reject','suspend','end') OR p_expected_version<1 OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid capability lifecycle command' USING ERRCODE='check_violation';END IF;
 v_hash:=encode(public.digest(convert_to(jsonb_build_object('capabilityId',p_capability_id,'action',p_action,'expectedVersion',p_expected_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
 SELECT c.* INTO v_cap FROM mesh.network_relationship_capability c WHERE c.id=p_capability_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Capability was not found' USING ERRCODE='no_data_found';END IF;
 SELECT * INTO v_rel FROM mesh.network_relationship WHERE id=v_cap.network_relationship_id;IF v_actor NOT IN(v_rel.buyer_tenant_id,v_rel.supplier_tenant_id) THEN RAISE EXCEPTION 'Capability is not visible to current participant' USING ERRCODE='insufficient_privilege';END IF;
 IF v_cap.row_version<>p_expected_version THEN RAISE EXCEPTION 'Capability version is stale' USING ERRCODE='serialization_failure';END IF;
 v_to:=CASE p_action WHEN 'accept' THEN 'active' WHEN 'reject' THEN 'rejected' WHEN 'suspend' THEN 'suspended' ELSE 'ended' END;
 IF(p_action IN('accept','reject') AND(v_cap.status<>'requested' OR v_actor=v_cap.requested_by_tenant_id))OR(p_action='suspend' AND v_cap.status<>'active')OR(p_action='end' AND (v_cap.status NOT IN('active','suspended','requested') OR (v_cap.status='requested' AND v_actor<>v_cap.requested_by_tenant_id)))THEN RAISE EXCEPTION 'Invalid capability transition or participant' USING ERRCODE='object_not_in_prerequisite_state';END IF;
 v_other:=CASE WHEN v_actor=v_rel.buyer_tenant_id THEN v_rel.supplier_tenant_id ELSE v_rel.buyer_tenant_id END;
 v_evidence:=mesh.fn_record_network_command(v_actor,v_other,'network_relationship_capability',p_capability_id,'capability_'||p_action,v_cap.status,v_to,p_expected_version,p_reason,p_idempotency_key,v_hash,jsonb_build_object('relationshipId',v_rel.id,'capabilityCode',v_cap.capability_code,'episodeNo',v_cap.episode_no),p_actor_id);
 PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);UPDATE mesh.network_relationship_capability AS target SET status=v_to,approved_by_tenant_id=CASE WHEN p_action IN('accept','reject') THEN v_actor ELSE target.approved_by_tenant_id END,row_version=target.row_version+1,status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_at=clock_timestamp(),updated_by=p_actor_id WHERE target.id=p_capability_id;PERFORM set_config('app.mesh_command_evidence_id','',true);
 RETURN QUERY SELECT p_capability_id,v_to,p_expected_version+1,v_evidence,false;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_discover_network_relationship(
  p_buyer_tenant_id uuid,p_buyer_account_id uuid,p_supplier_tenant_id uuid,p_supplier_account_id uuid,
  p_effective_from date,p_effective_until date,p_reason text,p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(relationship_id uuid,capability_id uuid,status text,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh AS $$
DECLARE
  v_relationship record; v_capability record;
  v_actor uuid := shared.current_tenant_id();
  v_receipt mesh.network_discovery_receipt%ROWTYPE;
  v_hash text; v_key text; v_relationship_key text; v_capability_key text;
  v_legacy boolean; v_relationship_from date; v_capability_from date;
BEGIN
  IF p_actor_id IS NULL OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id
     OR v_actor NOT IN(p_buyer_tenant_id,p_supplier_tenant_id)
     OR mesh.current_network_account_id_soft() IS DISTINCT FROM
        (CASE WHEN v_actor=p_buyer_tenant_id THEN p_buyer_account_id ELSE p_supplier_account_id END) THEN
    RAISE EXCEPTION 'Discovery requester is not the current participant' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 200
     OR btrim(p_idempotency_key)<>p_idempotency_key THEN
    RAISE EXCEPTION 'Invalid discovery idempotency key' USING ERRCODE='check_violation';
  END IF;
  v_hash:=encode(public.digest(convert_to(jsonb_build_object(
    'buyerTenantId',p_buyer_tenant_id,'buyerAccountId',p_buyer_account_id,
    'supplierTenantId',p_supplier_tenant_id,'supplierAccountId',p_supplier_account_id,
    'effectiveFrom',p_effective_from,'effectiveUntil',p_effective_until,
    'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh-discovery:'||p_idempotency_key,0));
  SELECT * INTO v_receipt FROM mesh.network_discovery_receipt r
    WHERE r.actor_tenant_id=v_actor AND r.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_receipt.command_fingerprint<>v_hash THEN
      RAISE EXCEPTION 'Discovery idempotency key was reused with a different command' USING ERRCODE='unique_violation';
    END IF;
    RETURN QUERY SELECT v_receipt.relationship_id,v_receipt.capability_id,'requested'::text,true;
    RETURN;
  END IF;
  -- Hash every new caller key. Separate prefixes cannot alias legacy keys,
  -- which always ended in .relationship/.profile, or another command kind.
  v_key:=encode(public.digest(convert_to(p_idempotency_key,'UTF8'),'sha256'),'hex');
  v_relationship_key:='discovery.relationship.'||v_key;
  v_capability_key:='discovery.profile.'||v_key;
  SELECT EXISTS(SELECT 1 FROM mesh.network_command_evidence e
    WHERE e.actor_tenant_id=v_actor AND e.idempotency_key=p_idempotency_key||'.relationship') INTO v_legacy;
  IF v_legacy THEN
    v_relationship_key:=p_idempotency_key||'.relationship';
    v_capability_key:=p_idempotency_key||'.profile';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||v_relationship_key,0));
  IF v_legacy THEN
    -- Legacy discovery fingerprinted the raw nullable relationship date.
    v_relationship_from:=p_effective_from;
    SELECT c.effective_from INTO v_capability_from
      FROM mesh.network_command_evidence e JOIN mesh.network_relationship_capability c ON c.id=e.aggregate_id
      WHERE e.actor_tenant_id=v_actor AND e.idempotency_key=v_capability_key;
  ELSE
    v_relationship_from:=COALESCE(p_effective_from,CURRENT_DATE);
  END IF;
  SELECT * INTO v_relationship FROM mesh.command_request_network_relationship(
    p_buyer_tenant_id,p_buyer_account_id,p_supplier_tenant_id,p_supplier_account_id,
    'commercial',v_relationship_from,p_effective_until,p_reason,v_relationship_key,p_actor_id);
  SELECT * INTO v_capability FROM mesh.command_request_relationship_capability(
    v_relationship.relationship_id,'profile_exchange',COALESCE(p_effective_from,v_capability_from,v_relationship_from,CURRENT_DATE),
    p_effective_until,'{}'::jsonb,p_reason,v_capability_key,p_actor_id);
  INSERT INTO mesh.network_discovery_receipt VALUES(v_actor,p_idempotency_key,v_hash,v_relationship.relationship_id,v_capability.capability_id);
  RETURN QUERY SELECT v_relationship.relationship_id,v_capability.capability_id,'requested'::text,(v_relationship.replayed AND v_capability.replayed);
END $$;

CREATE OR REPLACE FUNCTION mesh.command_registration_exchange_lifecycle(p_exchange_id uuid,p_action text,p_expected_version bigint,p_reason text,p_idempotency_key text,p_actor_id uuid)
RETURNS TABLE(exchange_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_row mesh.registration_exchange%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_to text;v_hash text;v_evidence uuid;v_other uuid;
BEGIN
 IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_action NOT IN('accept','reject','cancel','expire') OR p_expected_version<1 OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid registration lifecycle command' USING ERRCODE='check_violation';END IF;
 v_hash:=encode(public.digest(convert_to(jsonb_build_object('exchangeId',p_exchange_id,'action',p_action,'expectedVersion',p_expected_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
 SELECT * INTO v_row FROM mesh.registration_exchange WHERE id=p_exchange_id FOR UPDATE;IF NOT FOUND OR v_actor NOT IN(v_row.requester_tenant_id,v_row.counterparty_tenant_id)THEN RAISE EXCEPTION 'Registration exchange is not visible to participant' USING ERRCODE='insufficient_privilege';END IF;IF v_row.row_version<>p_expected_version THEN RAISE EXCEPTION 'Registration version is stale' USING ERRCODE='serialization_failure';END IF;
 IF v_row.status<>'issued' OR(p_action IN('accept','reject') AND v_actor<>v_row.counterparty_tenant_id)OR(p_action='cancel' AND v_actor<>v_row.requester_tenant_id)OR(p_action='accept' AND clock_timestamp()>=v_row.expires_at)OR(p_action='expire' AND clock_timestamp()<v_row.expires_at)THEN RAISE EXCEPTION 'Invalid registration transition or participant' USING ERRCODE='object_not_in_prerequisite_state';END IF;
 v_to:=CASE p_action WHEN 'accept' THEN 'accepted' WHEN 'reject' THEN 'rejected' WHEN 'cancel' THEN 'cancelled' ELSE 'expired' END;v_other:=CASE WHEN v_actor=v_row.requester_tenant_id THEN v_row.counterparty_tenant_id ELSE v_row.requester_tenant_id END;
 v_evidence:=mesh.fn_record_network_command(v_actor,v_other,'registration_exchange',p_exchange_id,'registration_'||p_action,v_row.status,v_to,p_expected_version,p_reason,p_idempotency_key,v_hash,jsonb_build_object('intentKind',v_row.intent_kind,'contractHash',v_row.contract_hash),p_actor_id);PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);UPDATE mesh.registration_exchange AS target SET status=v_to,row_version=target.row_version+1,status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_at=clock_timestamp(),updated_by=p_actor_id WHERE target.id=p_exchange_id;PERFORM set_config('app.mesh_command_evidence_id','',true);RETURN QUERY SELECT p_exchange_id,v_to,p_expected_version+1,v_evidence,false;
END $$;

-- Pre-G4 deployments have no protected-retrieval command to repair. Do not
-- install a new feature as a side effect; reject only inconsistent partial G4.
DO $bank_upgrade$ BEGIN
 IF to_regprocedure('mesh.command_retrieve_bank_protected_token(uuid,integer,text,text,uuid)') IS NULL
    AND to_regclass('mesh.bank_disclosure_purpose') IS NULL
    AND to_regclass('mesh.bank_account_retrieval_evidence') IS NULL THEN
   RAISE NOTICE 'Protected bank retrieval is not installed; applying G3 repairs only';
 ELSIF to_regprocedure('mesh.command_retrieve_bank_protected_token(uuid,integer,text,text,uuid)') IS NULL
    OR to_regclass('mesh.bank_disclosure_purpose') IS NULL
    OR to_regclass('mesh.bank_account_retrieval_evidence') IS NULL THEN
   RAISE EXCEPTION 'Partial protected bank retrieval baseline; reconcile G4 before applying repairs';
 ELSE
CREATE OR REPLACE FUNCTION mesh.command_retrieve_bank_protected_token(
  p_disclosure_id uuid,p_expected_disclosure_version integer,p_reason text,
  p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(protected_value_token text,protection_key_version integer,authorized_until timestamptz,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared,audit AS $$
DECLARE v_disclosure mesh.bank_account_disclosure%ROWTYPE;v_bank mesh.bank_account%ROWTYPE;v_purpose mesh.bank_disclosure_purpose%ROWTYPE;v_existing mesh.bank_account_retrieval_evidence%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_hash text;v_token_hash text;v_until timestamptz;v_id uuid:=shared.uuidv7();
BEGIN
  IF NOT pg_has_role(session_user,'athyper_protected_value_retriever','MEMBER') OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_expected_disclosure_version<1 OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Protected bank retrieval is not authorized' USING ERRCODE='insufficient_privilege';END IF;
  v_hash:=encode(public.digest(convert_to(jsonb_build_object('disclosureId',p_disclosure_id,'expectedVersion',p_expected_disclosure_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':bank-retrieval:'||p_idempotency_key,0));
  SELECT * INTO v_existing FROM mesh.bank_account_retrieval_evidence WHERE recipient_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
  SELECT d.* INTO v_disclosure FROM mesh.bank_account_disclosure d WHERE d.id=p_disclosure_id AND d.recipient_tenant_id=v_actor FOR SHARE;
  IF NOT FOUND OR v_disclosure.status<>'active' OR v_disclosure.disclosure_version<>p_expected_disclosure_version OR (v_disclosure.expires_at IS NOT NULL AND v_disclosure.expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'Disclosure is unavailable, stale, expired or revoked' USING ERRCODE='insufficient_privilege';END IF;
  -- SHARE locks serialize retrieval with relationship/account/capability revocation.
  PERFORM 1 FROM mesh.network_relationship r
    WHERE r.id=v_disclosure.network_relationship_id AND r.status='active'
      AND (r.effective_from IS NULL OR r.effective_from<=CURRENT_DATE)
      AND (r.effective_until IS NULL OR r.effective_until>CURRENT_DATE)
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relationship is unavailable or outside its effective interval' USING ERRCODE='insufficient_privilege'; END IF;
  PERFORM 1 FROM mesh.network_account a WHERE a.id=v_disclosure.owner_account_id
    AND a.tenant_id=v_disclosure.owner_tenant_id AND a.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disclosure owner account is unavailable' USING ERRCODE='insufficient_privilege'; END IF;
  PERFORM 1 FROM mesh.network_account a WHERE a.id=v_disclosure.recipient_account_id
    AND a.tenant_id=v_disclosure.recipient_tenant_id AND a.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disclosure recipient account is unavailable' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_purpose FROM mesh.bank_disclosure_purpose WHERE code=v_disclosure.purpose AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disclosure purpose is unavailable' USING ERRCODE='insufficient_privilege'; END IF;
  PERFORM 1 FROM mesh.network_relationship_capability c WHERE c.network_relationship_id=v_disclosure.network_relationship_id
    AND c.capability_code=v_purpose.required_capability_code AND c.status='active'
    AND c.effective_from<=CURRENT_DATE AND (c.effective_until IS NULL OR c.effective_until>CURRENT_DATE) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Required relationship capability is unavailable' USING ERRCODE='insufficient_privilege';END IF;
  SELECT * INTO v_bank FROM mesh.bank_account WHERE id=v_disclosure.bank_account_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank account is unavailable' USING ERRCODE='insufficient_privilege'; END IF;
  v_token_hash:=encode(public.digest(convert_to(v_bank.protected_value_token,'UTF8'),'sha256'),'hex');
  IF v_existing.id IS NOT NULL THEN IF v_existing.command_fingerprint<>v_hash OR v_existing.protected_token_hash<>v_token_hash OR v_existing.authorized_until<=clock_timestamp() THEN RAISE EXCEPTION 'Retrieval replay is stale or mismatched' USING ERRCODE='serialization_failure';END IF;RETURN QUERY SELECT v_bank.protected_value_token,v_bank.protection_key_version,v_existing.authorized_until,v_existing.id,true;RETURN;END IF;
  v_until:=least(COALESCE(v_disclosure.expires_at,'infinity'::timestamptz),clock_timestamp()+make_interval(secs=>v_purpose.maximum_retrieval_seconds));
  INSERT INTO mesh.bank_account_retrieval_evidence(id,recipient_tenant_id,recipient_account_id,disclosure_id,purpose_code,disclosure_version,protection_key_version,protected_token_hash,command_fingerprint,idempotency_key,authorized_until,retrieved_by) VALUES(v_id,v_actor,v_disclosure.recipient_account_id,v_disclosure.id,v_disclosure.purpose,v_disclosure.disclosure_version,v_bank.protection_key_version,v_token_hash,v_hash,p_idempotency_key,v_until,p_actor_id);
  PERFORM audit.append_event(p_event_code=>'data.mesh_bank_retrieved',p_operation=>'execute',p_entity_type=>'bank_account_disclosure',p_entity_id=>v_disclosure.id,p_context=>jsonb_build_object('retrievalEvidenceId',v_id,'purpose',v_disclosure.purpose,'recipientAccountId',v_disclosure.recipient_account_id,'authorizedUntil',v_until,'protectionKeyVersion',v_bank.protection_key_version));
  RETURN QUERY SELECT v_bank.protected_value_token,v_bank.protection_key_version,v_until,v_id,false;
END $$;
 END IF;
END $bank_upgrade$;
COMMIT;
