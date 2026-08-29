BEGIN;

DO $$ BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' THEN
  RAISE EXCEPTION 'Business Partner invitation generalization requires athyper_neon and app.database_plane=neon';
 END IF;
END $$;

-- Additive authority first. The legacy table remains available under a private
-- name until verification; its public name becomes a read-only compatibility view.
CREATE TABLE document.business_partner_invitation (
 id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, invitation_no text NOT NULL,
 journey_kind text NOT NULL, registration_mode text NOT NULL DEFAULT 'self_service',
 requested_role document.business_partner_requested_role_d NOT NULL, scope_kind text NOT NULL,
 requested_operating_organization_id uuid, company_code_id uuid, legal_entity_id uuid, org_unit_id uuid, position_id uuid,
 intended_party_name text NOT NULL, invitee_email_hash text NOT NULL, token_hash text NOT NULL,
 expires_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending', resend_count integer NOT NULL DEFAULT 0,
 last_sent_at timestamptz NOT NULL DEFAULT now(), applicant_principal_id uuid, business_partner_request_id uuid,
 accepted_at timestamptz, cancelled_at timestamptz, superseded_at timestamptz,
 idempotency_key text NOT NULL, row_version bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
 CONSTRAINT business_partner_invitation_pkey PRIMARY KEY(id),
 CONSTRAINT business_partner_invitation_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT business_partner_invitation_no_uq UNIQUE(tenant_id,invitation_no),
 CONSTRAINT business_partner_invitation_idempotency_uq UNIQUE(tenant_id,idempotency_key),
 CONSTRAINT business_partner_invitation_token_uq UNIQUE(tenant_id,token_hash),
 CONSTRAINT business_partner_invitation_journey_chk CHECK(journey_kind IN('supplier','customer','candidate')),
 CONSTRAINT business_partner_invitation_mode_chk CHECK(registration_mode IN('self_service','on_behalf','integration')),
 CONSTRAINT business_partner_invitation_role_chk CHECK((journey_kind='supplier' AND requested_role='supplier') OR (journey_kind='customer' AND requested_role='customer') OR (journey_kind='candidate' AND requested_role='workforce')),
 CONSTRAINT business_partner_invitation_scope_chk CHECK((scope_kind='commercial' AND journey_kind IN('supplier','customer') AND requested_operating_organization_id IS NOT NULL AND legal_entity_id IS NULL AND org_unit_id IS NULL AND position_id IS NULL) OR (scope_kind='workforce' AND journey_kind='candidate' AND requested_operating_organization_id IS NULL AND legal_entity_id IS NOT NULL AND company_code_id IS NOT NULL AND org_unit_id IS NOT NULL)),
 CONSTRAINT business_partner_invitation_hash_chk CHECK(invitee_email_hash~'^[a-f0-9]{64}$' AND token_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT business_partner_invitation_status_chk CHECK(status IN('pending','accepted','cancelled','expired','superseded')),
 CONSTRAINT business_partner_invitation_lifecycle_chk CHECK((status='pending' AND applicant_principal_id IS NULL AND business_partner_request_id IS NULL AND accepted_at IS NULL AND cancelled_at IS NULL AND superseded_at IS NULL) OR (status='accepted' AND applicant_principal_id IS NOT NULL AND business_partner_request_id IS NOT NULL AND accepted_at IS NOT NULL AND cancelled_at IS NULL AND superseded_at IS NULL) OR (status='cancelled' AND accepted_at IS NULL AND cancelled_at IS NOT NULL AND superseded_at IS NULL) OR (status='expired' AND accepted_at IS NULL AND cancelled_at IS NULL AND superseded_at IS NULL) OR (status='superseded' AND accepted_at IS NULL AND cancelled_at IS NULL AND superseded_at IS NOT NULL)),
 CONSTRAINT business_partner_invitation_expiry_chk CHECK(expires_at>created_at),
 CONSTRAINT business_partner_invitation_name_chk CHECK(length(btrim(intended_party_name)) BETWEEN 1 AND 512),
 CONSTRAINT business_partner_invitation_idempotency_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
 CONSTRAINT business_partner_invitation_version_chk CHECK(row_version>=1 AND resend_count>=0),
 CONSTRAINT business_partner_invitation_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)),
 CONSTRAINT business_partner_invitation_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_operating_org_fk FOREIGN KEY(tenant_id,requested_operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_legal_entity_fk FOREIGN KEY(tenant_id,legal_entity_id) REFERENCES master.legal_entity(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_org_unit_fk FOREIGN KEY(tenant_id,org_unit_id) REFERENCES master.org_unit(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_position_fk FOREIGN KEY(tenant_id,position_id) REFERENCES master.position(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_applicant_fk FOREIGN KEY(tenant_id,applicant_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);
COMMENT ON TABLE document.business_partner_invitation IS 'Tenant-bound, expiring, single-use invitation authority for supplier, customer, and candidate onboarding. Only SHA-256 token and email hashes persist; raw secrets must never be stored or logged.';

INSERT INTO document.business_partner_invitation(id,tenant_id,invitation_no,journey_kind,registration_mode,requested_role,scope_kind,requested_operating_organization_id,company_code_id,intended_party_name,invitee_email_hash,token_hash,expires_at,status,applicant_principal_id,business_partner_request_id,accepted_at,cancelled_at,idempotency_key,row_version,created_at,created_by,updated_at,updated_by)
SELECT id,tenant_id,invitation_no,CASE registration_role WHEN 'customer' THEN 'customer' ELSE 'supplier' END,'self_service',registration_role,'commercial',requested_operating_organization_id,optional_company_code_id,intended_supplier_name,invitee_email_hash,token_hash,expires_at,status,applicant_principal_id,business_partner_request_id,accepted_at,cancelled_at,idempotency_key,row_version,created_at,created_by,updated_at,updated_by FROM document.supplier_registration_invitation;

ALTER TABLE document.business_partner_request DROP CONSTRAINT business_partner_request_invitation_fk;
ALTER TABLE document.supplier_registration_invitation DROP CONSTRAINT supplier_registration_invitation_request_fk;
ALTER TABLE document.supplier_registration_recovery DROP CONSTRAINT supplier_registration_recovery_invitation_fk;
ALTER TABLE document.supplier_registration_invitation RENAME TO supplier_registration_invitation_legacy;
ALTER TABLE document.business_partner_request ADD CONSTRAINT business_partner_request_invitation_fk FOREIGN KEY(tenant_id,invitation_id) REFERENCES document.business_partner_invitation(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.business_partner_invitation ADD CONSTRAINT business_partner_invitation_request_fk FOREIGN KEY(tenant_id,business_partner_request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.supplier_registration_recovery ADD CONSTRAINT supplier_registration_recovery_invitation_fk FOREIGN KEY(tenant_id,invitation_id) REFERENCES document.business_partner_invitation(tenant_id,id) ON DELETE RESTRICT;

CREATE VIEW document.supplier_registration_invitation WITH (security_invoker=true,security_barrier=true) AS
SELECT id,tenant_id,invitation_no,requested_role AS registration_role,requested_operating_organization_id,company_code_id AS optional_company_code_id,intended_party_name AS intended_supplier_name,invitee_email_hash,token_hash,expires_at,status,applicant_principal_id,business_partner_request_id,accepted_at,cancelled_at,idempotency_key,row_version,created_at,created_by,updated_at,updated_by
FROM document.business_partner_invitation WHERE journey_kind='supplier';
COMMENT ON VIEW document.supplier_registration_invitation IS 'Read-only supplier compatibility projection. Controlled writes go through the business-partner invitation service; retire after consumer cutover.';

CREATE TABLE document.business_partner_invitation_applicant_policy(
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,invitation_id uuid NOT NULL,applicant_principal_id uuid NOT NULL,journey_kind text NOT NULL,
 approved_fields text[] NOT NULL,approved_actions text[] NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,revoked_at timestamptz,revoked_by uuid,
 CONSTRAINT business_partner_invitation_applicant_policy_pkey PRIMARY KEY(id),CONSTRAINT business_partner_invitation_applicant_policy_tenant_id_uq UNIQUE(tenant_id,id),CONSTRAINT business_partner_invitation_applicant_policy_invitation_uq UNIQUE(tenant_id,invitation_id),
 CONSTRAINT business_partner_invitation_applicant_policy_journey_chk CHECK(journey_kind IN('supplier','customer','candidate')),
 CONSTRAINT business_partner_invitation_applicant_policy_actions_chk CHECK(approved_actions<@ARRAY['accept','status','correct','evidence']::text[] AND cardinality(approved_actions)>0),
 CONSTRAINT business_partner_invitation_applicant_policy_revocation_chk CHECK((revoked_at IS NULL)=(revoked_by IS NULL)),
 CONSTRAINT business_partner_invitation_applicant_policy_invitation_fk FOREIGN KEY(tenant_id,invitation_id) REFERENCES document.business_partner_invitation(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_applicant_policy_principal_fk FOREIGN KEY(tenant_id,applicant_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_applicant_policy_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_applicant_policy_revoked_by_fk FOREIGN KEY(tenant_id,revoked_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);
COMMENT ON TABLE document.business_partner_invitation_applicant_policy IS 'Restricted applicant principal/session ceiling. It grants only journey-approved fields and external actions; never internal decision, finance, HR, IAM administration, or master-data authority.';

CREATE TABLE document.business_partner_invitation_recovery(
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,invitation_id uuid NOT NULL,request_id uuid NOT NULL,prior_applicant_principal_id uuid NOT NULL,requested_applicant_principal_id uuid NOT NULL,reason text NOT NULL,idempotency_key text NOT NULL,status text NOT NULL DEFAULT 'requested',requested_at timestamptz NOT NULL DEFAULT now(),requested_by uuid NOT NULL,
 CONSTRAINT business_partner_invitation_recovery_pkey PRIMARY KEY(id),CONSTRAINT business_partner_invitation_recovery_tenant_id_uq UNIQUE(tenant_id,id),CONSTRAINT business_partner_invitation_recovery_idempotency_uq UNIQUE(tenant_id,idempotency_key),
 CONSTRAINT business_partner_invitation_recovery_status_chk CHECK(status='requested'),CONSTRAINT business_partner_invitation_recovery_reason_chk CHECK(length(btrim(reason)) BETWEEN 1 AND 4000),CONSTRAINT business_partner_invitation_recovery_principal_chk CHECK(prior_applicant_principal_id<>requested_applicant_principal_id),
 CONSTRAINT business_partner_invitation_recovery_invitation_fk FOREIGN KEY(tenant_id,invitation_id) REFERENCES document.business_partner_invitation(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_recovery_request_fk FOREIGN KEY(tenant_id,request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_recovery_prior_fk FOREIGN KEY(tenant_id,prior_applicant_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_recovery_requested_fk FOREIGN KEY(tenant_id,requested_applicant_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_invitation_recovery_actor_fk FOREIGN KEY(tenant_id,requested_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);
COMMENT ON TABLE document.business_partner_invitation_recovery IS 'Immutable, idempotent recovery intent. IAM performs subject recovery; historic invitation and request ownership is never rewritten and no duplicate principal or request is created.';

CREATE FUNCTION document.trg_guard_business_partner_invitation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,shared AS $$BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Business Partner invitations cannot be deleted' USING ERRCODE='check_violation'; END IF;
 IF (NEW.id,NEW.tenant_id,NEW.invitation_no,NEW.journey_kind,NEW.registration_mode,NEW.requested_role,NEW.scope_kind,NEW.requested_operating_organization_id,NEW.company_code_id,NEW.legal_entity_id,NEW.org_unit_id,NEW.position_id,NEW.intended_party_name,NEW.invitee_email_hash,NEW.idempotency_key,NEW.created_at,NEW.created_by) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.invitation_no,OLD.journey_kind,OLD.registration_mode,OLD.requested_role,OLD.scope_kind,OLD.requested_operating_organization_id,OLD.company_code_id,OLD.legal_entity_id,OLD.org_unit_id,OLD.position_id,OLD.intended_party_name,OLD.invitee_email_hash,OLD.idempotency_key,OLD.created_at,OLD.created_by) THEN RAISE EXCEPTION 'Invitation journey, authority, scope, recipient, and creation evidence are immutable' USING ERRCODE='check_violation'; END IF;
 IF OLD.status<>'pending' THEN RAISE EXCEPTION 'Terminal Business Partner invitations are immutable' USING ERRCODE='check_violation'; END IF;
 IF NEW.status NOT IN('pending','accepted','cancelled','expired','superseded') THEN RAISE EXCEPTION 'Invalid invitation transition' USING ERRCODE='check_violation'; END IF;
 IF NEW.status='accepted' AND NEW.expires_at<=statement_timestamp() THEN RAISE EXCEPTION 'An expired invitation cannot be accepted' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF NEW.status='pending' AND (NEW.token_hash=OLD.token_hash OR NEW.resend_count<>OLD.resend_count+1) AND (NEW.token_hash,NEW.expires_at,NEW.resend_count) IS DISTINCT FROM (OLD.token_hash,OLD.expires_at,OLD.resend_count) THEN RAISE EXCEPTION 'Resend must atomically rotate the token hash' USING ERRCODE='check_violation'; END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER trg_business_partner_invitation_10_guard BEFORE UPDATE OR DELETE ON document.business_partner_invitation FOR EACH ROW EXECUTE FUNCTION document.trg_guard_business_partner_invitation();
CREATE TRIGGER trg_business_partner_invitation_80_version BEFORE UPDATE ON document.business_partner_invitation FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER trg_business_partner_invitation_90_updated BEFORE UPDATE ON document.business_partner_invitation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request_registration() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$BEGIN
 IF TG_OP='UPDATE' AND (NEW.registration_mode,NEW.invitation_id,NEW.applicant_principal_id,NEW.represented_party_name) IS DISTINCT FROM (OLD.registration_mode,OLD.invitation_id,OLD.applicant_principal_id,OLD.represented_party_name) THEN RAISE EXCEPTION 'Business Partner registration channel identity is immutable' USING ERRCODE='check_violation'; END IF;
 IF TG_OP='UPDATE' AND OLD.status NOT IN('draft','validating','validation_failed','returned') AND NEW.representation_evidence_id IS DISTINCT FROM OLD.representation_evidence_id THEN RAISE EXCEPTION 'Submitted Business Partner representation evidence is immutable' USING ERRCODE='check_violation'; END IF;
 IF NEW.status IN('pending_approval','returned','approved','rejected','applying','applied','failed') AND NEW.registration_mode='on_behalf' AND NEW.representation_evidence_id IS NULL THEN RAISE EXCEPTION 'Submitted on-behalf registration requires representation evidence' USING ERRCODE='check_violation'; END IF;
 IF NEW.status IN('pending_approval','returned','approved','rejected','applying','applied','failed') AND NEW.registration_mode='self_service' AND NOT EXISTS(SELECT 1 FROM document.business_partner_invitation invitation WHERE invitation.tenant_id=NEW.tenant_id AND invitation.id=NEW.invitation_id AND invitation.status='accepted' AND invitation.journey_kind IN('supplier','customer','candidate') AND invitation.requested_role=NEW.requested_role AND invitation.business_partner_request_id=NEW.id AND invitation.applicant_principal_id=NEW.applicant_principal_id) THEN RAISE EXCEPTION 'Submitted self-service registration requires its accepted invitation binding' USING ERRCODE='check_violation'; END IF;
 RETURN NEW;
END$$;

CREATE INDEX business_partner_invitation_status_idx ON document.business_partner_invitation(tenant_id,status,expires_at);
CREATE INDEX business_partner_invitation_journey_scope_idx ON document.business_partner_invitation(tenant_id,journey_kind,scope_kind,created_at DESC);
CREATE UNIQUE INDEX business_partner_invitation_request_uq ON document.business_partner_invitation(tenant_id,business_partner_request_id) WHERE business_partner_request_id IS NOT NULL;

ALTER TABLE document.business_partner_invitation ENABLE ROW LEVEL SECURITY; ALTER TABLE document.business_partner_invitation FORCE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_invitation_applicant_policy ENABLE ROW LEVEL SECURITY; ALTER TABLE document.business_partner_invitation_applicant_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_invitation_recovery ENABLE ROW LEVEL SECURITY; ALTER TABLE document.business_partner_invitation_recovery FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.business_partner_invitation FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_write ON document.business_partner_invitation_applicant_policy FOR INSERT WITH CHECK(tenant_id=shared.current_tenant_id() AND applicant_principal_id=master.current_principal_id_soft());
CREATE POLICY tenant_update ON document.business_partner_invitation_applicant_policy FOR UPDATE USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY applicant_owned_read ON document.business_partner_invitation_applicant_policy FOR SELECT USING(tenant_id=shared.current_tenant_id_soft() AND applicant_principal_id=master.current_principal_id_soft());
CREATE POLICY tenant_access ON document.business_partner_invitation_recovery FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.business_partner_invitation FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true); CREATE POLICY seed_write ON document.business_partner_invitation_applicant_policy FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true); CREATE POLICY seed_write ON document.business_partner_invitation_recovery FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT,UPDATE ON document.business_partner_invitation,document.business_partner_invitation_applicant_policy,document.business_partner_invitation_recovery TO athyperapp; GRANT SELECT ON document.supplier_registration_invitation TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON document.business_partner_invitation,document.business_partner_invitation_applicant_policy,document.business_partner_invitation_recovery TO athyperadmin; GRANT SELECT ON document.supplier_registration_invitation TO athyperadmin; END IF;
END$$;
REVOKE ALL ON document.business_partner_invitation,document.business_partner_invitation_applicant_policy,document.business_partner_invitation_recovery,document.supplier_registration_invitation FROM PUBLIC;

INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT value.id::uuid,value.code,'entity_operation',module.id,value.risk::authz.risk_tier_d,value.mfa,value.sod,false,false,false,'{"migration":"20260829_neon_business_partner_invitation_generalization"}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid FROM control.module module CROSS JOIN(VALUES
 ('48052774-e56a-51e8-9bb8-e19fbb253d8c','neon.workforce.invitation.create','high',false,true),('d1d773bc-caae-5077-96a4-ed2c863e01d0','neon.workforce.invitation.read','medium',false,false),('82d630fd-50a0-54ac-a4da-497570851a56','neon.workforce.invitation.cancel','high',true,true),('28a0dcad-e7cf-58fd-94e9-850934587083','neon.workforce.invitation.external.respond','medium',false,false),('b4fd922f-dd3f-59de-bdbd-743431699cb9','neon.business_partner_invitation.recovery.request','critical',true,true)
)value(id,code,risk,mfa,sod) WHERE module.code='fnd' AND module.status='active' ON CONFLICT(canonical_code) DO UPDATE SET status='published',metadata=authz.permission.metadata||EXCLUDED.metadata;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'legal_entity','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code LIKE 'neon.workforce.invitation.%' AND canonical_code<>'neon.workforce.invitation.external.respond' ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code IN('neon.workforce.invitation.external.respond','neon.business_partner_invitation.recovery.request') ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

COMMIT;
