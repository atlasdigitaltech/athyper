-- Repair the confirmed pre-G3 development MESH baseline without resetting data.
-- G3 schema block copied from ddl/planes/mesh/mesh/11_grants.sql, 2026-09-06.
-- Already complete G3 baselines are left intact; partial baselines fail closed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtextextended('athyper:mesh:g3-exchange-readiness', 0));
DO $migration$
BEGIN
  IF to_regclass('mesh.network_relationship_kind') IS NULL
    AND to_regclass('mesh.network_relationship_capability') IS NULL
    AND to_regclass('mesh.registration_exchange') IS NULL THEN
-- G3 relationship-capability foundation. Relationship identity/episodes remain
-- the bilateral edge; each independently authorized collaboration mode is a
-- separate effective-dated capability episode.

CREATE TABLE mesh.network_relationship_kind (
    code                text        NOT NULL,
    name                text        NOT NULL,
    description         text,
    status              text        NOT NULL DEFAULT 'active',
    created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by          uuid        NOT NULL,
    CONSTRAINT network_relationship_kind_pkey PRIMARY KEY (code),
    CONSTRAINT network_relationship_kind_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT network_relationship_kind_name_chk CHECK (length(btrim(name)) BETWEEN 1 AND 128),
    CONSTRAINT network_relationship_kind_description_chk CHECK (description IS NULL OR length(description) <= 2000),
    CONSTRAINT network_relationship_kind_status_chk CHECK (status IN ('active', 'deprecated', 'retired'))
);

INSERT INTO mesh.network_relationship_kind(code, name, description, created_by)
VALUES ('commercial', 'Commercial', 'Buyer and supplier commercial relationship; access is granted only by active child capabilities.', '00000000-0000-0000-0000-000000000000'::uuid);

-- Preserve existing relationship kinds (including development acceptance fixtures)
-- before adding the catalog foreign keys. No existing relationship is rewritten.
INSERT INTO mesh.network_relationship_kind(code,name,description,created_by)
SELECT relationship_kind,relationship_kind,'Preserved from the pre-G3 relationship baseline','00000000-0000-0000-0000-000000000000'::uuid
FROM (SELECT relationship_kind FROM mesh.network_relationship UNION SELECT relationship_kind FROM mesh.network_relationship_identity) existing
ON CONFLICT(code) DO NOTHING;

ALTER TABLE mesh.network_relationship
    ADD CONSTRAINT network_relationship_kind_fk
    FOREIGN KEY (relationship_kind)
    REFERENCES mesh.network_relationship_kind(code) ON DELETE RESTRICT;
ALTER TABLE mesh.network_relationship_identity
    ADD CONSTRAINT network_relationship_identity_kind_fk
    FOREIGN KEY (relationship_kind)
    REFERENCES mesh.network_relationship_kind(code) ON DELETE RESTRICT;

CREATE TABLE mesh.network_relationship_capability (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    network_relationship_id  uuid        NOT NULL,
    capability_code          text        NOT NULL,
    episode_no               integer     NOT NULL,
    requested_by_tenant_id   uuid        NOT NULL,
    approved_by_tenant_id    uuid,
    effective_from           date        NOT NULL,
    effective_until          date,
    routing_policy           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                   text        NOT NULL DEFAULT 'requested',
    row_version              bigint      NOT NULL DEFAULT 1,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT network_relationship_capability_pkey PRIMARY KEY (id),
    CONSTRAINT network_relationship_capability_episode_uq UNIQUE (network_relationship_id, capability_code, episode_no),
    CONSTRAINT network_relationship_capability_code_chk CHECK (capability_code IN ('profile_exchange', 'sourcing', 'procurement', 'invoicing', 'payments', 'services_procurement')),
    CONSTRAINT network_relationship_capability_episode_chk CHECK (episode_no >= 1),
    CONSTRAINT network_relationship_capability_range_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT network_relationship_capability_route_chk CHECK (jsonb_typeof(routing_policy) = 'object' AND pg_column_size(routing_policy) <= 16384),
    CONSTRAINT network_relationship_capability_status_chk CHECK (status IN ('requested', 'active', 'suspended', 'rejected', 'ended')),
    CONSTRAINT network_relationship_capability_approval_chk CHECK (
        (status = 'requested' AND approved_by_tenant_id IS NULL)
        OR (status = 'rejected' AND approved_by_tenant_id IS NOT NULL)
        OR (status IN ('active', 'suspended', 'ended') AND approved_by_tenant_id IS NOT NULL AND approved_by_tenant_id <> requested_by_tenant_id)
    ),
    CONSTRAINT network_relationship_capability_version_chk CHECK (row_version >= 1),
    CONSTRAINT network_relationship_capability_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT network_relationship_capability_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT network_relationship_capability_relationship_fk FOREIGN KEY (network_relationship_id)
        REFERENCES mesh.network_relationship(id) ON DELETE RESTRICT,
    CONSTRAINT network_relationship_capability_requester_fk FOREIGN KEY (requested_by_tenant_id)
        REFERENCES master.tenant(id) ON DELETE RESTRICT,
    CONSTRAINT network_relationship_capability_approver_fk FOREIGN KEY (approved_by_tenant_id)
        REFERENCES master.tenant(id) ON DELETE RESTRICT,
    CONSTRAINT network_relationship_capability_no_overlap_excl EXCLUDE USING gist (
        network_relationship_id WITH =,
        capability_code WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('requested', 'active', 'suspended'))
);

COMMENT ON TABLE mesh.network_relationship_capability IS
  'G3 bilateral, effective-dated capability episodes. A requested capability grants no access; activation requires counterparty command evidence. Relationship metadata is never an authorization source.';

CREATE INDEX network_relationship_capability_lookup_idx
    ON mesh.network_relationship_capability(network_relationship_id, capability_code, status, effective_from, effective_until);

ALTER TABLE mesh.network_account_commodity_capability
    ADD CONSTRAINT network_account_commodity_capability_no_overlap_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        network_account_id WITH =,
        commodity_code_id WITH =,
        trade_role WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active');

ALTER TABLE mesh.network_relationship_kind ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship_kind FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship_capability ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship_capability FORCE ROW LEVEL SECURITY;

CREATE POLICY network_relationship_kind_read ON mesh.network_relationship_kind
    FOR SELECT USING (true);
CREATE POLICY network_relationship_kind_seed_owner ON mesh.network_relationship_kind
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY network_relationship_capability_participant_read ON mesh.network_relationship_capability
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM mesh.network_relationship relationship
         WHERE relationship.id = network_relationship_id
           AND shared.current_tenant_id_soft() IN (relationship.buyer_tenant_id, relationship.supplier_tenant_id)
    ));
CREATE POLICY network_relationship_capability_seed_owner ON mesh.network_relationship_capability
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

REVOKE ALL ON mesh.network_relationship_kind, mesh.network_relationship_capability FROM PUBLIC;
GRANT SELECT ON mesh.network_relationship_kind, mesh.network_relationship_capability TO athyperapp;
GRANT ALL PRIVILEGES ON mesh.network_relationship_kind, mesh.network_relationship_capability TO athyperadmin;

-- Bounded registration exchange. It records participant intent and invitation
-- state only; no row is a NEON Business Partner or an access grant.
CREATE TABLE mesh.registration_exchange (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    requester_tenant_id      uuid        NOT NULL,
    counterparty_tenant_id   uuid        NOT NULL,
    requester_account_id     uuid        NOT NULL,
    counterparty_account_id  uuid        NOT NULL,
    intent_kind              text        NOT NULL,
    relationship_kind        text        NOT NULL DEFAULT 'commercial',
    contract_name            text        NOT NULL,
    contract_version         integer     NOT NULL,
    contract_hash            char(64)    NOT NULL,
    intent_snapshot          jsonb       NOT NULL,
    invitation_token_hash    char(64)    NOT NULL,
    expires_at               timestamptz NOT NULL,
    status                   text        NOT NULL DEFAULT 'issued',
    row_version              bigint      NOT NULL DEFAULT 1,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT registration_exchange_pkey PRIMARY KEY(id),
    CONSTRAINT registration_exchange_participants_chk CHECK(requester_tenant_id<>counterparty_tenant_id AND requester_account_id<>counterparty_account_id),
    CONSTRAINT registration_exchange_intent_chk CHECK(intent_kind IN('buyer_request','supplier_self_registration','discovery_nomination')),
    CONSTRAINT registration_exchange_contract_chk CHECK(contract_name~'^[a-z][a-z0-9_.-]{2,126}$' AND contract_version>=1 AND contract_hash~'^[a-f0-9]{64}$'),
    CONSTRAINT registration_exchange_snapshot_chk CHECK(jsonb_typeof(intent_snapshot)='object' AND pg_column_size(intent_snapshot)<=16384 AND intent_snapshot-ARRAY['displayName','countryCode','requestedCapabilities','sourceReference','message']::text[]='{}'::jsonb),
    CONSTRAINT registration_exchange_token_chk CHECK(invitation_token_hash~'^[a-f0-9]{64}$'),
    CONSTRAINT registration_exchange_expiry_chk CHECK(expires_at>created_at),
    CONSTRAINT registration_exchange_status_chk CHECK(status IN('issued','accepted','rejected','cancelled','expired')),
    CONSTRAINT registration_exchange_version_chk CHECK(row_version>=1),
    CONSTRAINT registration_exchange_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT registration_exchange_requester_fk FOREIGN KEY(requester_tenant_id,requester_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT registration_exchange_counterparty_fk FOREIGN KEY(counterparty_tenant_id,counterparty_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT registration_exchange_kind_fk FOREIGN KEY(relationship_kind) REFERENCES mesh.network_relationship_kind(code) ON DELETE RESTRICT
);

ALTER TABLE mesh.network_command_evidence DROP CONSTRAINT network_command_evidence_kind_chk,
  ADD CONSTRAINT network_command_evidence_kind_chk CHECK(aggregate_kind IN('network_account','network_relationship','network_relationship_capability','registration_exchange','catalog','document_envelope'));

CREATE OR REPLACE FUNCTION mesh.trg_enforce_g3_command()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,mesh AS $$
DECLARE v_evidence_id uuid;v_kind text:=TG_TABLE_NAME;v_from text;v_expected bigint;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.row_version IS NOT DISTINCT FROM OLD.row_version THEN RETURN NEW; END IF;
  v_from:=CASE WHEN TG_OP='INSERT' THEN 'none' ELSE OLD.status::text END;
  v_expected:=CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.row_version END;
  BEGIN v_evidence_id:=nullif(current_setting('app.mesh_command_evidence_id',true),'')::uuid;EXCEPTION WHEN invalid_text_representation THEN v_evidence_id:=NULL;END;
  IF v_evidence_id IS NULL OR NOT EXISTS(SELECT 1 FROM mesh.network_command_evidence e WHERE e.id=v_evidence_id AND e.aggregate_kind=v_kind AND e.aggregate_id=NEW.id AND e.from_state=v_from AND e.to_state=NEW.status AND e.expected_version=v_expected AND e.resulting_version=NEW.row_version) THEN
    RAISE EXCEPTION 'mesh.%.lifecycle requires its command function',TG_TABLE_NAME USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_request_relationship_capability(
  p_relationship_id uuid,p_capability_code text,p_effective_from date,p_effective_until date,
  p_routing_policy jsonb,p_reason text,p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(capability_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_rel mesh.network_relationship%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_id uuid:=shared.uuidv7();v_episode integer;v_hash text;v_evidence uuid;v_other uuid;
BEGIN
  IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_capability_code NOT IN('profile_exchange','sourcing','procurement','invoicing','payments','services_procurement') OR p_effective_from IS NULL OR(p_effective_until IS NOT NULL AND p_effective_until<=p_effective_from) OR jsonb_typeof(COALESCE(p_routing_policy,'{}'))<>'object' OR pg_column_size(COALESCE(p_routing_policy,'{}'))>16384 OR COALESCE(p_routing_policy,'{}')-ARRAY['protocol','endpointAlias','documentKinds','region']::text[]<>'{}'::jsonb OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid relationship capability request' USING ERRCODE='check_violation';END IF;
  v_hash:=encode(public.digest(convert_to(jsonb_build_object('relationshipId',p_relationship_id,'capabilityCode',p_capability_code,'effectiveFrom',p_effective_from,'effectiveUntil',p_effective_until,'routingPolicy',COALESCE(p_routing_policy,'{}'),'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));
  SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
  IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
  SELECT * INTO v_rel FROM mesh.network_relationship WHERE id=p_relationship_id FOR UPDATE;
  IF NOT FOUND OR v_actor NOT IN(v_rel.buyer_tenant_id,v_rel.supplier_tenant_id) THEN RAISE EXCEPTION 'Relationship is not visible to current participant' USING ERRCODE='insufficient_privilege';END IF;
  IF v_rel.status='requested' AND p_capability_code<>'profile_exchange' THEN RAISE EXCEPTION 'Potential relationships may request profile exchange only' USING ERRCODE='insufficient_privilege';END IF;
  IF v_rel.status NOT IN('requested','active') THEN RAISE EXCEPTION 'Relationship cannot receive a capability in state %',v_rel.status USING ERRCODE='object_not_in_prerequisite_state';END IF;
  v_other:=CASE WHEN v_actor=v_rel.buyer_tenant_id THEN v_rel.supplier_tenant_id ELSE v_rel.buyer_tenant_id END;
  SELECT COALESCE(max(episode_no),0)+1 INTO v_episode FROM mesh.network_relationship_capability WHERE network_relationship_id=p_relationship_id AND capability_code=p_capability_code;
  v_evidence:=mesh.fn_record_network_command(v_actor,v_other,'network_relationship_capability',v_id,'capability_request','none','requested',0,p_reason,p_idempotency_key,v_hash,jsonb_build_object('relationshipId',p_relationship_id,'capabilityCode',p_capability_code,'episodeNo',v_episode),p_actor_id);
  PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);
  INSERT INTO mesh.network_relationship_capability(id,network_relationship_id,capability_code,episode_no,requested_by_tenant_id,effective_from,effective_until,routing_policy,status,row_version,created_by) VALUES(v_id,p_relationship_id,p_capability_code,v_episode,v_actor,p_effective_from,p_effective_until,COALESCE(p_routing_policy,'{}'),'requested',1,p_actor_id);
  PERFORM set_config('app.mesh_command_evidence_id','',true);
  RETURN QUERY SELECT v_id,'requested'::text,1::bigint,v_evidence,false;
END $$;

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
 IF(p_action IN('accept','reject') AND(v_cap.status<>'requested' OR v_actor=v_cap.requested_by_tenant_id))OR(p_action='suspend' AND v_cap.status<>'active')OR(p_action='end' AND v_cap.status NOT IN('active','suspended','requested'))THEN RAISE EXCEPTION 'Invalid capability transition or participant' USING ERRCODE='object_not_in_prerequisite_state';END IF;
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
DECLARE v_relationship record;v_capability record;
BEGIN
  SELECT * INTO v_relationship FROM mesh.command_request_network_relationship(p_buyer_tenant_id,p_buyer_account_id,p_supplier_tenant_id,p_supplier_account_id,'commercial',p_effective_from,p_effective_until,p_reason,p_idempotency_key||'.relationship',p_actor_id);
  SELECT * INTO v_capability FROM mesh.command_request_relationship_capability(v_relationship.relationship_id,'profile_exchange',COALESCE(p_effective_from,CURRENT_DATE),p_effective_until,'{}'::jsonb,p_reason,p_idempotency_key||'.profile',p_actor_id);
  RETURN QUERY SELECT v_relationship.relationship_id,v_capability.capability_id,'requested'::text,(v_relationship.replayed AND v_capability.replayed);
END $$;

CREATE OR REPLACE FUNCTION mesh.command_issue_registration_exchange(p_counterparty_tenant_id uuid,p_requester_account_id uuid,p_counterparty_account_id uuid,p_intent_kind text,p_relationship_kind text,p_contract_name text,p_contract_version integer,p_contract_hash text,p_intent_snapshot jsonb,p_invitation_token_hash text,p_expires_at timestamptz,p_reason text,p_idempotency_key text,p_actor_id uuid)
RETURNS TABLE(exchange_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_id uuid:=shared.uuidv7();v_hash text;v_evidence uuid;
BEGIN
 IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR v_actor=p_counterparty_tenant_id OR p_intent_kind NOT IN('buyer_request','supplier_self_registration','discovery_nomination') OR p_contract_name!~'^[a-z][a-z0-9_.-]{2,126}$' OR p_contract_version<1 OR p_contract_hash!~'^[a-f0-9]{64}$' OR p_invitation_token_hash!~'^[a-f0-9]{64}$' OR p_expires_at<=clock_timestamp() OR jsonb_typeof(p_intent_snapshot)<>'object' OR pg_column_size(p_intent_snapshot)>16384 OR p_intent_snapshot-ARRAY['displayName','countryCode','requestedCapabilities','sourceReference','message']::text[]<>'{}'::jsonb OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid registration exchange' USING ERRCODE='check_violation';END IF;
 IF NOT EXISTS(SELECT 1 FROM mesh.network_account WHERE tenant_id=v_actor AND id=p_requester_account_id)OR NOT EXISTS(SELECT 1 FROM mesh.network_account WHERE tenant_id=p_counterparty_tenant_id AND id=p_counterparty_account_id)THEN RAISE EXCEPTION 'Registration exchange accounts do not match participants' USING ERRCODE='foreign_key_violation';END IF;
 v_hash:=encode(public.digest(convert_to(jsonb_build_object('requesterTenantId',v_actor,'counterpartyTenantId',p_counterparty_tenant_id,'requesterAccountId',p_requester_account_id,'counterpartyAccountId',p_counterparty_account_id,'intentKind',p_intent_kind,'relationshipKind',p_relationship_kind,'contractName',p_contract_name,'contractVersion',p_contract_version,'contractHash',p_contract_hash,'intentSnapshot',p_intent_snapshot,'invitationTokenHash',p_invitation_token_hash,'expiresAt',p_expires_at,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
 v_evidence:=mesh.fn_record_network_command(v_actor,p_counterparty_tenant_id,'registration_exchange',v_id,'registration_issue','none','issued',0,p_reason,p_idempotency_key,v_hash,jsonb_build_object('intentKind',p_intent_kind,'contractName',p_contract_name,'contractVersion',p_contract_version,'contractHash',p_contract_hash),p_actor_id);
 PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);INSERT INTO mesh.registration_exchange(id,requester_tenant_id,counterparty_tenant_id,requester_account_id,counterparty_account_id,intent_kind,relationship_kind,contract_name,contract_version,contract_hash,intent_snapshot,invitation_token_hash,expires_at,status,row_version,created_by)VALUES(v_id,v_actor,p_counterparty_tenant_id,p_requester_account_id,p_counterparty_account_id,p_intent_kind,p_relationship_kind,p_contract_name,p_contract_version,p_contract_hash,p_intent_snapshot,p_invitation_token_hash,p_expires_at,'issued',1,p_actor_id);PERFORM set_config('app.mesh_command_evidence_id','',true);
 RETURN QUERY SELECT v_id,'issued'::text,1::bigint,v_evidence,false;
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
 IF v_row.status<>'issued' OR(p_action IN('accept','reject') AND v_actor<>v_row.counterparty_tenant_id)OR(p_action='cancel' AND v_actor<>v_row.requester_tenant_id)OR(p_action='expire' AND clock_timestamp()<v_row.expires_at)THEN RAISE EXCEPTION 'Invalid registration transition or participant' USING ERRCODE='object_not_in_prerequisite_state';END IF;
 v_to:=CASE p_action WHEN 'accept' THEN 'accepted' WHEN 'reject' THEN 'rejected' WHEN 'cancel' THEN 'cancelled' ELSE 'expired' END;v_other:=CASE WHEN v_actor=v_row.requester_tenant_id THEN v_row.counterparty_tenant_id ELSE v_row.requester_tenant_id END;
 v_evidence:=mesh.fn_record_network_command(v_actor,v_other,'registration_exchange',p_exchange_id,'registration_'||p_action,v_row.status,v_to,p_expected_version,p_reason,p_idempotency_key,v_hash,jsonb_build_object('intentKind',v_row.intent_kind,'contractHash',v_row.contract_hash),p_actor_id);PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);UPDATE mesh.registration_exchange AS target SET status=v_to,row_version=target.row_version+1,status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_at=clock_timestamp(),updated_by=p_actor_id WHERE target.id=p_exchange_id;PERFORM set_config('app.mesh_command_evidence_id','',true);RETURN QUERY SELECT p_exchange_id,v_to,p_expected_version+1,v_evidence,false;
END $$;

CREATE TRIGGER trg_network_relationship_capability_command BEFORE INSERT OR UPDATE OF status,row_version ON mesh.network_relationship_capability FOR EACH ROW EXECUTE FUNCTION mesh.trg_enforce_g3_command();
CREATE TRIGGER trg_registration_exchange_command BEFORE INSERT OR UPDATE OF status,row_version ON mesh.registration_exchange FOR EACH ROW EXECUTE FUNCTION mesh.trg_enforce_g3_command();
CREATE TRIGGER trg_registration_exchange_immutable BEFORE UPDATE ON mesh.registration_exchange FOR EACH ROW WHEN(NEW.requester_tenant_id IS DISTINCT FROM OLD.requester_tenant_id OR NEW.counterparty_tenant_id IS DISTINCT FROM OLD.counterparty_tenant_id OR NEW.requester_account_id IS DISTINCT FROM OLD.requester_account_id OR NEW.counterparty_account_id IS DISTINCT FROM OLD.counterparty_account_id OR NEW.intent_kind IS DISTINCT FROM OLD.intent_kind OR NEW.contract_hash IS DISTINCT FROM OLD.contract_hash OR NEW.invitation_token_hash IS DISTINCT FROM OLD.invitation_token_hash) EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_registration_exchange_no_delete BEFORE DELETE ON mesh.registration_exchange FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_network_relationship_capability_immutable BEFORE UPDATE ON mesh.network_relationship_capability FOR EACH ROW WHEN(NEW.network_relationship_id IS DISTINCT FROM OLD.network_relationship_id OR NEW.capability_code IS DISTINCT FROM OLD.capability_code OR NEW.episode_no IS DISTINCT FROM OLD.episode_no OR NEW.requested_by_tenant_id IS DISTINCT FROM OLD.requested_by_tenant_id OR NEW.effective_from IS DISTINCT FROM OLD.effective_from OR NEW.effective_until IS DISTINCT FROM OLD.effective_until OR NEW.routing_policy IS DISTINCT FROM OLD.routing_policy OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by) EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_network_relationship_capability_no_delete BEFORE DELETE ON mesh.network_relationship_capability FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();

ALTER TABLE mesh.registration_exchange ENABLE ROW LEVEL SECURITY;ALTER TABLE mesh.registration_exchange FORCE ROW LEVEL SECURITY;
CREATE POLICY registration_exchange_participant_read ON mesh.registration_exchange FOR SELECT USING(shared.current_tenant_id_soft() IN(requester_tenant_id,counterparty_tenant_id));
CREATE POLICY registration_exchange_seed_owner ON mesh.registration_exchange FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON mesh.registration_exchange FROM PUBLIC;REVOKE INSERT,UPDATE,DELETE ON mesh.network_relationship_capability,mesh.registration_exchange FROM athyperapp;
GRANT SELECT ON mesh.registration_exchange TO athyperapp;GRANT ALL PRIVILEGES ON mesh.registration_exchange TO athyperadmin;
REVOKE ALL ON FUNCTION mesh.command_request_relationship_capability(uuid,text,date,date,jsonb,text,text,uuid),mesh.command_relationship_capability_lifecycle(uuid,text,bigint,text,text,uuid),mesh.command_discover_network_relationship(uuid,uuid,uuid,uuid,date,date,text,text,uuid),mesh.command_issue_registration_exchange(uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,timestamptz,text,text,uuid),mesh.command_registration_exchange_lifecycle(uuid,text,bigint,text,text,uuid),mesh.trg_enforce_g3_command() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mesh.command_request_relationship_capability(uuid,text,date,date,jsonb,text,text,uuid),mesh.command_relationship_capability_lifecycle(uuid,text,bigint,text,text,uuid),mesh.command_discover_network_relationship(uuid,uuid,uuid,uuid,date,date,text,text,uuid),mesh.command_issue_registration_exchange(uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,timestamptz,text,text,uuid),mesh.command_registration_exchange_lifecycle(uuid,text,bigint,text,text,uuid) TO athyperapp,athyperadmin;

COMMENT ON TABLE mesh.registration_exchange IS 'Bounded, contract-pinned invitation/registration intent exchanged between MESH participants. Token material is hash-only and acceptance does not create NEON master authority or grant relationship access.';

  ELSIF to_regclass('mesh.network_relationship_kind') IS NULL
    OR to_regclass('mesh.network_relationship_capability') IS NULL
    OR to_regclass('mesh.registration_exchange') IS NULL
    OR to_regprocedure('mesh.command_issue_registration_exchange(uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,timestamptz,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Partial MESH G3 baseline: reconcile existing schema before applying exchange repair';
  END IF;
END $migration$;
WITH desired(canonical_code,risk_tier,requires_mfa) AS (
  VALUES
    ('mesh.business_partner_exchange.read','low',false),
    ('mesh.business_partner_exchange.relationship','medium',false),
    ('mesh.business_partner_exchange.registration','medium',false)
)
INSERT INTO authz.permission(
  id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
  is_shareable,is_delegable,is_overridable,metadata,status,created_by
)
SELECT md5('athyper:permission:'||desired.canonical_code)::uuid,desired.canonical_code,
       'entity_operation',module.id,desired.risk_tier::authz.risk_tier_d,
       desired.requires_mfa,false,false,false,false,
       '{"_seed":{"pack":"mesh.business-partner-exchange-permissions","version":"1.0.0"}}'::jsonb,
       'published','00000000-0000-0000-0000-000000000000'::uuid
FROM desired
JOIN control.module module ON module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET
  risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,
  metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';

INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT permission.id,scope.kind,'exact','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission permission
CROSS JOIN LATERAL (VALUES
  (CASE WHEN permission.canonical_code LIKE 'mesh.business_partner_exchange.%' THEN 'tenant' ELSE 'network_relationship' END::authz.scope_kind_d)
) scope(kind)
WHERE permission.canonical_code IN(
  'mesh.business_partner_exchange.read','mesh.business_partner_exchange.relationship','mesh.business_partner_exchange.registration'
)
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';


DO $verify$
BEGIN
  IF EXISTS(SELECT 1 FROM (VALUES ('mesh.business_partner_exchange.read'),('mesh.business_partner_exchange.relationship'),('mesh.business_partner_exchange.registration')) required(code)
    WHERE NOT EXISTS(SELECT 1 FROM authz.permission permission WHERE permission.canonical_code=required.code AND permission.status='published')) THEN
    RAISE EXCEPTION 'Required MESH exchange permissions were not published';
  END IF;
  IF NOT has_function_privilege('athyperapp','mesh.command_request_network_relationship(uuid,uuid,uuid,uuid,text,date,date,text,text,uuid)','EXECUTE')
    OR NOT has_function_privilege('athyperapp','mesh.command_issue_registration_exchange(uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,timestamptz,text,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'MESH exchange application execution grants are incomplete';
  END IF;
END $verify$;
COMMIT;
