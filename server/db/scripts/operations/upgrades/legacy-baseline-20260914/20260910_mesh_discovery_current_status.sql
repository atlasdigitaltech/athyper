BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN IF current_database()<>'athyper_mesh' THEN RAISE EXCEPTION 'This migration requires athyper_mesh'; END IF; END $$;
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
    RETURN QUERY SELECT v_receipt.relationship_id,c.id,c.status::text,true
      FROM mesh.network_relationship_capability c WHERE c.id=v_receipt.capability_id;
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
  RETURN QUERY SELECT v_relationship.relationship_id,c.id,c.status::text,(v_relationship.replayed AND v_capability.replayed)
    FROM mesh.network_relationship_capability c WHERE c.id=v_capability.capability_id;
END $$;
COMMIT;
