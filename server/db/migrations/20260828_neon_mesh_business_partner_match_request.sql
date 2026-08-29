BEGIN;

CREATE TABLE document.mesh_business_partner_match (
 id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, projection_id uuid NOT NULL,
 snapshot_id uuid NOT NULL, source_payload_hash text NOT NULL, source_publication_version integer NOT NULL,
 operating_organization_id uuid NOT NULL, company_code_id uuid, candidate_business_partner_id uuid,
 candidate_fingerprint text, algorithm_code text NOT NULL, algorithm_version integer NOT NULL,
 algorithm_hash text NOT NULL, ranked_candidates jsonb NOT NULL, field_diff jsonb NOT NULL,
 diff_hash text NOT NULL, idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL,
 CONSTRAINT mesh_business_partner_match_pkey PRIMARY KEY(id),
 CONSTRAINT mesh_business_partner_match_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT mesh_business_partner_match_key_uq UNIQUE(tenant_id,idempotency_key),
 CONSTRAINT mesh_business_partner_match_snapshot_uq UNIQUE(tenant_id,id,snapshot_id),
 CONSTRAINT mesh_business_partner_match_source_hash_chk CHECK(source_payload_hash ~ '^[a-f0-9]{64}$'),
 CONSTRAINT mesh_business_partner_match_version_chk CHECK(source_publication_version>=1 AND algorithm_version>=1),
 CONSTRAINT mesh_business_partner_match_algorithm_chk CHECK(algorithm_code ~ '^[a-z][a-z0-9_.-]{1,126}$' AND algorithm_hash ~ '^[a-f0-9]{64}$'),
 CONSTRAINT mesh_business_partner_match_candidate_chk CHECK((candidate_business_partner_id IS NULL)=(candidate_fingerprint IS NULL) AND (candidate_fingerprint IS NULL OR candidate_fingerprint ~ '^[a-f0-9]{64}$')),
 CONSTRAINT mesh_business_partner_match_evidence_chk CHECK(jsonb_typeof(ranked_candidates)='array' AND jsonb_typeof(field_diff)='array' AND pg_column_size(ranked_candidates)<=262144 AND pg_column_size(field_diff)<=262144 AND diff_hash ~ '^[a-f0-9]{64}$'),
 CONSTRAINT mesh_business_partner_match_key_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200)
);
CREATE TABLE document.mesh_business_partner_acceptance (
 id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, match_id uuid NOT NULL, snapshot_id uuid NOT NULL,
 accepted_field_paths text[] NOT NULL, proposed_payload jsonb NOT NULL, acceptance_hash text NOT NULL,
 request_idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL,
 CONSTRAINT mesh_business_partner_acceptance_pkey PRIMARY KEY(id),
 CONSTRAINT mesh_business_partner_acceptance_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT mesh_business_partner_acceptance_key_uq UNIQUE(tenant_id,request_idempotency_key),
 CONSTRAINT mesh_business_partner_acceptance_paths_chk CHECK(cardinality(accepted_field_paths) BETWEEN 1 AND 8 AND array_position(accepted_field_paths,NULL) IS NULL AND accepted_field_paths <@ ARRAY['partner.accountCode','partner.displayName','partner.legalName','partner.legalForm','partner.countryCode','partner.incorporationDate','partner.websiteUrl','partner.description']::text[]),
 CONSTRAINT mesh_business_partner_acceptance_payload_chk CHECK(jsonb_typeof(proposed_payload)='object' AND pg_column_size(proposed_payload)<=65536),
 CONSTRAINT mesh_business_partner_acceptance_hash_chk CHECK(acceptance_hash ~ '^[a-f0-9]{64}$'),
 CONSTRAINT mesh_business_partner_acceptance_key_chk CHECK(btrim(request_idempotency_key)=request_idempotency_key AND length(request_idempotency_key) BETWEEN 8 AND 200)
);
CREATE TABLE document.mesh_business_partner_acceptance_event (
 id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, acceptance_id uuid NOT NULL,
 lifecycle_version integer NOT NULL, event_kind text NOT NULL, business_partner_request_id uuid,
 event_fingerprint text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), recorded_by uuid NOT NULL,
 CONSTRAINT mesh_business_partner_acceptance_event_pkey PRIMARY KEY(id),
 CONSTRAINT mesh_business_partner_acceptance_event_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT mesh_business_partner_acceptance_event_version_uq UNIQUE(tenant_id,acceptance_id,lifecycle_version),
 CONSTRAINT mesh_business_partner_acceptance_event_request_uq UNIQUE NULLS NOT DISTINCT(tenant_id,acceptance_id,business_partner_request_id),
 CONSTRAINT mesh_business_partner_acceptance_event_version_chk CHECK(lifecycle_version>=1),
 CONSTRAINT mesh_business_partner_acceptance_event_kind_chk CHECK(event_kind IN('prepared','request_created')),
 CONSTRAINT mesh_business_partner_acceptance_event_request_chk CHECK((event_kind='prepared' AND business_partner_request_id IS NULL AND lifecycle_version=1) OR(event_kind='request_created' AND business_partner_request_id IS NOT NULL AND lifecycle_version=2)),
 CONSTRAINT mesh_business_partner_acceptance_event_fingerprint_chk CHECK(event_fingerprint ~ '^[a-f0-9]{64}$')
);

ALTER TABLE document.business_partner_request ADD CONSTRAINT business_partner_request_source_projection_fk FOREIGN KEY(tenant_id,source_projection_id) REFERENCES snapshot.mesh_business_partner_profile_received(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.mesh_business_partner_match
 ADD CONSTRAINT mesh_business_partner_match_projection_fk FOREIGN KEY(tenant_id,projection_id) REFERENCES control.mesh_business_partner_profile_projection(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT mesh_business_partner_match_snapshot_fk FOREIGN KEY(tenant_id,snapshot_id) REFERENCES snapshot.mesh_business_partner_profile_received(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT mesh_business_partner_match_org_fk FOREIGN KEY(tenant_id,operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT mesh_business_partner_match_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT mesh_business_partner_match_candidate_fk FOREIGN KEY(tenant_id,candidate_business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT mesh_business_partner_match_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.mesh_business_partner_acceptance
 ADD CONSTRAINT mesh_business_partner_acceptance_match_fk FOREIGN KEY(tenant_id,match_id,snapshot_id) REFERENCES document.mesh_business_partner_match(tenant_id,id,snapshot_id) ON DELETE RESTRICT,
 ADD CONSTRAINT mesh_business_partner_acceptance_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.mesh_business_partner_acceptance_event
 ADD CONSTRAINT mesh_business_partner_acceptance_event_acceptance_fk FOREIGN KEY(tenant_id,acceptance_id) REFERENCES document.mesh_business_partner_acceptance(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT mesh_business_partner_acceptance_event_request_fk FOREIGN KEY(tenant_id,business_partner_request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT mesh_business_partner_acceptance_event_recorded_by_fk FOREIGN KEY(tenant_id,recorded_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

CREATE INDEX mesh_business_partner_match_snapshot_idx ON document.mesh_business_partner_match(tenant_id,snapshot_id,created_at DESC);
CREATE INDEX mesh_business_partner_match_org_idx ON document.mesh_business_partner_match(tenant_id,operating_organization_id,created_at DESC);
CREATE INDEX mesh_business_partner_match_candidate_idx ON document.mesh_business_partner_match(tenant_id,candidate_business_partner_id,created_at DESC) WHERE candidate_business_partner_id IS NOT NULL;
CREATE INDEX mesh_business_partner_acceptance_match_idx ON document.mesh_business_partner_acceptance(tenant_id,match_id,created_at DESC);
CREATE UNIQUE INDEX mesh_business_partner_acceptance_event_request_global_uq ON document.mesh_business_partner_acceptance_event(tenant_id,business_partner_request_id) WHERE business_partner_request_id IS NOT NULL;

CREATE TRIGGER trg_mesh_business_partner_match_immutable BEFORE UPDATE OR DELETE ON document.mesh_business_partner_match FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_mesh_business_partner_acceptance_immutable BEFORE UPDATE OR DELETE ON document.mesh_business_partner_acceptance FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_mesh_business_partner_acceptance_event_immutable BEFORE UPDATE OR DELETE ON document.mesh_business_partner_acceptance_event FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

ALTER TABLE document.mesh_business_partner_match ENABLE ROW LEVEL SECURITY; ALTER TABLE document.mesh_business_partner_match FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.mesh_business_partner_match FOR SELECT USING(tenant_id=shared.current_tenant_id_soft()); CREATE POLICY tenant_insert ON document.mesh_business_partner_match FOR INSERT WITH CHECK(tenant_id=shared.current_tenant_id()); CREATE POLICY seed_write ON document.mesh_business_partner_match FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE document.mesh_business_partner_acceptance ENABLE ROW LEVEL SECURITY; ALTER TABLE document.mesh_business_partner_acceptance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.mesh_business_partner_acceptance FOR SELECT USING(tenant_id=shared.current_tenant_id_soft()); CREATE POLICY tenant_insert ON document.mesh_business_partner_acceptance FOR INSERT WITH CHECK(tenant_id=shared.current_tenant_id()); CREATE POLICY seed_write ON document.mesh_business_partner_acceptance FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE document.mesh_business_partner_acceptance_event ENABLE ROW LEVEL SECURITY; ALTER TABLE document.mesh_business_partner_acceptance_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.mesh_business_partner_acceptance_event FOR SELECT USING(tenant_id=shared.current_tenant_id_soft()); CREATE POLICY tenant_insert ON document.mesh_business_partner_acceptance_event FOR INSERT WITH CHECK(tenant_id=shared.current_tenant_id()); CREATE POLICY seed_write ON document.mesh_business_partner_acceptance_event FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT ON document.mesh_business_partner_match,document.mesh_business_partner_acceptance,document.mesh_business_partner_acceptance_event TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON document.mesh_business_partner_match,document.mesh_business_partner_acceptance,document.mesh_business_partner_acceptance_event TO athyperadmin; END IF;
END $$;
COMMENT ON TABLE document.mesh_business_partner_match IS 'Immutable, snapshot-pinned deterministic MESH-to-NEON candidate ranking and field diff. Matching grants no master-data write authority.';
COMMENT ON TABLE document.mesh_business_partner_acceptance IS 'Immutable selective-acceptance command containing only supported explicitly accepted fields and the exact derived onboarding payload.';
COMMENT ON TABLE document.mesh_business_partner_acceptance_event IS 'Append-only recoverable saga evidence linking a selective acceptance to the ordinary governed Business Partner request.';
COMMIT;
