BEGIN;

DO $guard$ BEGIN
  IF current_database()<>'athyper_mesh' OR current_setting('app.database_plane',true)<>'mesh' THEN RAISE EXCEPTION 'MESH Business Partner profile publication migration requires the MESH plane'; END IF;
END $guard$;

CREATE DOMAIN mesh.profile_publication_event_d AS text CHECK(VALUE IN ('published','withdrawn'));

CREATE FUNCTION mesh.profile_publication_payload_is_safe(p_payload jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,mesh AS $$
DECLARE v_key text;v_value jsonb;
BEGIN
 IF jsonb_typeof(p_payload)='object' THEN FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_payload) LOOP IF lower(v_key)~'(bank|iban|swift|bic|routing|account.?number|tax|registration.?number|metadata|capabilities|contact|email|phone|address|identifier)' THEN RETURN false;END IF;IF NOT mesh.profile_publication_payload_is_safe(v_value) THEN RETURN false;END IF;END LOOP;
 ELSIF jsonb_typeof(p_payload)='array' THEN FOR v_value IN SELECT value FROM jsonb_array_elements(p_payload) LOOP IF NOT mesh.profile_publication_payload_is_safe(v_value) THEN RETURN false;END IF;END LOOP;END IF;
 RETURN true;
END $$;

CREATE FUNCTION mesh.trg_reject_profile_publication_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'MESH Business Partner profile publications are immutable; create a new version or lifecycle event' USING ERRCODE='integrity_constraint_violation';END $$;
CREATE FUNCTION snapshot.trg_reject_network_profile_publication_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'snapshot.network_account_profile_publication is immutable' USING ERRCODE='integrity_constraint_violation';END $$;

CREATE TABLE snapshot.network_account_profile_publication(
 id uuid NOT NULL DEFAULT shared.uuidv7(),owner_tenant_id uuid NOT NULL,owner_account_id uuid NOT NULL,recipient_tenant_id uuid NOT NULL,recipient_account_id uuid NOT NULL,network_relationship_id uuid NOT NULL,
 schema_code text NOT NULL,schema_version integer NOT NULL,field_set_code text NOT NULL,payload_json jsonb NOT NULL,payload_hash text NOT NULL,captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),captured_by uuid NOT NULL,
 CONSTRAINT network_account_profile_publication_snapshot_pkey PRIMARY KEY(id),CONSTRAINT network_account_profile_publication_snapshot_owner_id_uq UNIQUE(owner_tenant_id,id),
 CONSTRAINT network_account_profile_publication_snapshot_participants_chk CHECK(owner_tenant_id<>recipient_tenant_id AND owner_account_id<>recipient_account_id),
 CONSTRAINT network_account_profile_publication_snapshot_schema_chk CHECK(schema_code='mesh.business_partner_profile' AND schema_version>=1 AND field_set_code~'^[a-z][a-z0-9_.-]{1,62}$'),
 CONSTRAINT network_account_profile_publication_snapshot_payload_chk CHECK(jsonb_typeof(payload_json)='object' AND pg_column_size(payload_json)<=262144),
 CONSTRAINT network_account_profile_publication_snapshot_safe_chk CHECK(mesh.profile_publication_payload_is_safe(payload_json)),
 CONSTRAINT network_account_profile_publication_snapshot_hash_chk CHECK(payload_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT network_account_profile_publication_snapshot_owner_fk FOREIGN KEY(owner_tenant_id,owner_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT network_account_profile_publication_snapshot_recipient_fk FOREIGN KEY(recipient_tenant_id,recipient_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT network_account_profile_publication_snapshot_relationship_fk FOREIGN KEY(network_relationship_id) REFERENCES mesh.network_relationship(id) ON DELETE RESTRICT,
 CONSTRAINT network_account_profile_publication_snapshot_captured_by_fk FOREIGN KEY(owner_tenant_id,captured_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE mesh.network_account_profile_publication(
 id uuid NOT NULL DEFAULT shared.uuidv7(),owner_tenant_id uuid NOT NULL,owner_account_id uuid NOT NULL,recipient_tenant_id uuid NOT NULL,recipient_account_id uuid NOT NULL,network_relationship_id uuid NOT NULL,snapshot_id uuid NOT NULL,
 publication_version integer NOT NULL,schema_version integer NOT NULL,field_set_code text NOT NULL,payload_hash text NOT NULL,previous_publication_id uuid,idempotency_key text NOT NULL,published_at timestamptz NOT NULL DEFAULT clock_timestamp(),published_by uuid NOT NULL,
 CONSTRAINT network_account_profile_publication_pkey PRIMARY KEY(id),CONSTRAINT network_account_profile_publication_owner_id_uq UNIQUE(owner_tenant_id,id),
 CONSTRAINT network_account_profile_publication_version_uq UNIQUE(owner_tenant_id,owner_account_id,recipient_account_id,publication_version),CONSTRAINT network_account_profile_publication_snapshot_uq UNIQUE(owner_tenant_id,snapshot_id),CONSTRAINT network_account_profile_publication_idempotency_uq UNIQUE(owner_tenant_id,idempotency_key),
 CONSTRAINT network_account_profile_publication_participants_chk CHECK(owner_tenant_id<>recipient_tenant_id AND owner_account_id<>recipient_account_id),CONSTRAINT network_account_profile_publication_version_chk CHECK(publication_version>=1 AND schema_version>=1),CONSTRAINT network_account_profile_publication_field_set_chk CHECK(field_set_code~'^[a-z][a-z0-9_.-]{1,62}$'),CONSTRAINT network_account_profile_publication_hash_chk CHECK(payload_hash~'^[a-f0-9]{64}$'),CONSTRAINT network_account_profile_publication_idempotency_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
 CONSTRAINT network_account_profile_publication_owner_fk FOREIGN KEY(owner_tenant_id,owner_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT network_account_profile_publication_recipient_fk FOREIGN KEY(recipient_tenant_id,recipient_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT network_account_profile_publication_relationship_fk FOREIGN KEY(network_relationship_id) REFERENCES mesh.network_relationship(id) ON DELETE RESTRICT,
 CONSTRAINT network_account_profile_publication_snapshot_fk FOREIGN KEY(owner_tenant_id,snapshot_id) REFERENCES snapshot.network_account_profile_publication(owner_tenant_id,id) ON DELETE RESTRICT,CONSTRAINT network_account_profile_publication_previous_fk FOREIGN KEY(owner_tenant_id,previous_publication_id) REFERENCES mesh.network_account_profile_publication(owner_tenant_id,id) ON DELETE RESTRICT,CONSTRAINT network_account_profile_publication_published_by_fk FOREIGN KEY(owner_tenant_id,published_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE mesh.network_account_profile_publication_event(
 id uuid NOT NULL DEFAULT shared.uuidv7(),owner_tenant_id uuid NOT NULL,recipient_tenant_id uuid NOT NULL,publication_id uuid NOT NULL,lifecycle_version integer NOT NULL,event_kind mesh.profile_publication_event_d NOT NULL,reason text,decision_fingerprint text NOT NULL,idempotency_key text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),recorded_by uuid NOT NULL,
 CONSTRAINT network_account_profile_publication_event_pkey PRIMARY KEY(id),CONSTRAINT network_account_profile_publication_event_owner_id_uq UNIQUE(owner_tenant_id,id),CONSTRAINT network_account_profile_publication_event_version_uq UNIQUE(owner_tenant_id,publication_id,lifecycle_version),CONSTRAINT network_account_profile_publication_event_idempotency_uq UNIQUE(owner_tenant_id,idempotency_key),CONSTRAINT network_account_profile_publication_event_participants_chk CHECK(owner_tenant_id<>recipient_tenant_id),CONSTRAINT network_account_profile_publication_event_version_chk CHECK(lifecycle_version>=1),CONSTRAINT network_account_profile_publication_event_reason_chk CHECK((event_kind='published' AND reason IS NULL) OR(event_kind='withdrawn' AND reason IS NOT NULL AND length(reason) BETWEEN 1 AND 4000)),CONSTRAINT network_account_profile_publication_event_fingerprint_chk CHECK(decision_fingerprint~'^[a-f0-9]{64}$'),CONSTRAINT network_account_profile_publication_event_idempotency_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),CONSTRAINT network_account_profile_publication_event_publication_fk FOREIGN KEY(owner_tenant_id,publication_id) REFERENCES mesh.network_account_profile_publication(owner_tenant_id,id) ON DELETE RESTRICT,CONSTRAINT network_account_profile_publication_event_recorded_by_fk FOREIGN KEY(owner_tenant_id,recorded_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);

CREATE INDEX network_account_profile_publication_recipient_idx ON mesh.network_account_profile_publication(recipient_tenant_id,network_relationship_id,published_at DESC);
CREATE INDEX network_account_profile_publication_owner_idx ON mesh.network_account_profile_publication(owner_tenant_id,owner_account_id,published_at DESC);
CREATE INDEX network_account_profile_publication_event_latest_idx ON mesh.network_account_profile_publication_event(owner_tenant_id,publication_id,lifecycle_version DESC);
CREATE INDEX network_account_profile_publication_snapshot_recipient_idx ON snapshot.network_account_profile_publication(recipient_tenant_id,network_relationship_id,captured_at DESC);

CREATE TRIGGER trg_network_account_profile_publication_snapshot_immutable BEFORE UPDATE OR DELETE ON snapshot.network_account_profile_publication FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_network_profile_publication_mutation();
CREATE TRIGGER trg_network_account_profile_publication_immutable BEFORE UPDATE OR DELETE ON mesh.network_account_profile_publication FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_profile_publication_mutation();
CREATE TRIGGER trg_network_account_profile_publication_event_immutable BEFORE UPDATE OR DELETE ON mesh.network_account_profile_publication_event FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_profile_publication_mutation();

ALTER TABLE snapshot.network_account_profile_publication ENABLE ROW LEVEL SECURITY;ALTER TABLE snapshot.network_account_profile_publication FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_profile_publication ENABLE ROW LEVEL SECURITY;ALTER TABLE mesh.network_account_profile_publication FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_profile_publication_event ENABLE ROW LEVEL SECURITY;ALTER TABLE mesh.network_account_profile_publication_event FORCE ROW LEVEL SECURITY;
CREATE POLICY profile_publication_snapshot_participant_read ON snapshot.network_account_profile_publication FOR SELECT USING(shared.current_tenant_id_soft() IN(owner_tenant_id,recipient_tenant_id));CREATE POLICY profile_publication_snapshot_owner_insert ON snapshot.network_account_profile_publication FOR INSERT WITH CHECK(owner_tenant_id=shared.current_tenant_id());CREATE POLICY seed_write ON snapshot.network_account_profile_publication FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY profile_publication_participant_read ON mesh.network_account_profile_publication FOR SELECT USING(shared.current_tenant_id_soft() IN(owner_tenant_id,recipient_tenant_id));CREATE POLICY profile_publication_owner_insert ON mesh.network_account_profile_publication FOR INSERT WITH CHECK(owner_tenant_id=shared.current_tenant_id());CREATE POLICY seed_write ON mesh.network_account_profile_publication FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY profile_publication_event_participant_read ON mesh.network_account_profile_publication_event FOR SELECT USING(shared.current_tenant_id_soft() IN(owner_tenant_id,recipient_tenant_id));CREATE POLICY profile_publication_event_owner_insert ON mesh.network_account_profile_publication_event FOR INSERT WITH CHECK(owner_tenant_id=shared.current_tenant_id());CREATE POLICY seed_write ON mesh.network_account_profile_publication_event FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

REVOKE ALL ON snapshot.network_account_profile_publication,mesh.network_account_profile_publication,mesh.network_account_profile_publication_event FROM PUBLIC;REVOKE ALL ON FUNCTION mesh.profile_publication_payload_is_safe(jsonb),mesh.trg_reject_profile_publication_mutation(),snapshot.trg_reject_network_profile_publication_mutation() FROM PUBLIC;
DO $roles$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT ON snapshot.network_account_profile_publication,mesh.network_account_profile_publication,mesh.network_account_profile_publication_event TO athyperapp;GRANT EXECUTE ON FUNCTION mesh.profile_publication_payload_is_safe(jsonb) TO athyperapp;END IF;IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON snapshot.network_account_profile_publication,mesh.network_account_profile_publication,mesh.network_account_profile_publication_event TO athyperadmin;END IF;END $roles$;

INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT permission.id,permission.code,'entity_operation',module.id,permission.risk::authz.risk_tier_d,permission.mfa,false,false,false,false,'{"_seed":{"pack":"mesh.business-partner-profile-publication","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid FROM control.module module CROSS JOIN(VALUES
 ('e46fd3f2-2162-5a6d-a48f-78c4c809aef7'::uuid,'mesh.business_partner_profile.publish','high',true),
 ('329be19f-8aed-5b66-b20f-70d7a598ecaf'::uuid,'mesh.business_partner_profile.read','low',false),
 ('c6752dd7-945b-559f-8bea-83c65139e4cd'::uuid,'mesh.business_partner_profile.withdraw','high',true)
)permission(id,code,risk,mfa) WHERE module.code='fnd' AND module.status='active' ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'network_relationship','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code IN('mesh.business_partner_profile.publish','mesh.business_partner_profile.read','mesh.business_partner_profile.withdraw') ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

DO $assertions$ BEGIN IF(SELECT count(*) FROM authz.permission WHERE canonical_code LIKE 'mesh.business_partner_profile.%' AND status='published')<>3 THEN RAISE EXCEPTION 'MESH Business Partner profile publication permissions were not installed';END IF;IF to_regclass('snapshot.network_account_profile_publication') IS NULL OR to_regclass('mesh.network_account_profile_publication') IS NULL OR to_regclass('mesh.network_account_profile_publication_event') IS NULL THEN RAISE EXCEPTION 'MESH Business Partner profile publication tables were not installed';END IF;END $assertions$;

COMMIT;
