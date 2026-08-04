CREATE TABLE IF NOT EXISTS ops.authorization_operation_cutover_drill (
 id uuid NOT NULL DEFAULT shared.uuidv7(),plane_code text NOT NULL,entity_code text NOT NULL,
 source_entity_operation_id uuid NOT NULL,source_release_hash text NOT NULL,source_artifact_hash text NOT NULL,
 certification_id uuid NOT NULL REFERENCES ops.authorization_parity_certification(id) ON DELETE RESTRICT,
 activation_request_id text NOT NULL,activation_audit_evidence_id uuid NOT NULL,
 activated_observed_at timestamptz NOT NULL,rolled_back_observed_at timestamptz NOT NULL,
 legacy_observed_at timestamptz NOT NULL,reactivated_observed_at timestamptz NOT NULL,
 legacy_fallback_count integer NOT NULL DEFAULT 0,outcome text NOT NULL,ticket_reference text NOT NULL,
 performed_at timestamptz NOT NULL DEFAULT now(),performed_by uuid NOT NULL,
 CONSTRAINT authorization_operation_cutover_drill_pkey PRIMARY KEY(id),
 CONSTRAINT authorization_operation_cutover_drill_plane_chk CHECK(plane_code IN('neon','mesh')),
 CONSTRAINT authorization_operation_cutover_drill_hash_chk CHECK(source_release_hash~'^[a-f0-9]{64}$' AND source_artifact_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT authorization_operation_cutover_drill_outcome_chk CHECK(outcome IN('passed','failed')),
 CONSTRAINT authorization_operation_cutover_drill_fallback_chk CHECK(legacy_fallback_count>=0 AND(outcome='failed' OR legacy_fallback_count=0)),
 CONSTRAINT authorization_operation_cutover_drill_time_chk CHECK(activated_observed_at<=rolled_back_observed_at AND rolled_back_observed_at<=legacy_observed_at AND legacy_observed_at<=reactivated_observed_at AND reactivated_observed_at<=performed_at+interval '5 minutes'),
 CONSTRAINT authorization_operation_cutover_drill_ticket_chk CHECK(btrim(ticket_reference)<>'')
);
CREATE UNIQUE INDEX IF NOT EXISTS authorization_operation_cutover_drill_passed_uq ON ops.authorization_operation_cutover_drill(plane_code,source_entity_operation_id,source_release_hash,source_artifact_hash) WHERE outcome='passed';
CREATE OR REPLACE FUNCTION ops.trg_guard_authorization_operation_cutover_drill() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,ops AS $$ BEGIN RAISE EXCEPTION 'authorization_operation_cutover_drill is append-only'; END $$;
DROP TRIGGER IF EXISTS authorization_operation_cutover_drill_immutable ON ops.authorization_operation_cutover_drill;
CREATE TRIGGER authorization_operation_cutover_drill_immutable BEFORE UPDATE OR DELETE ON ops.authorization_operation_cutover_drill FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_authorization_operation_cutover_drill();
ALTER TABLE ops.authorization_operation_cutover_drill ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_operation_cutover_drill FORCE ROW LEVEL SECURITY;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='ops' AND tablename='authorization_operation_cutover_drill' AND policyname='authorization_operation_cutover_drill_admin') THEN CREATE POLICY authorization_operation_cutover_drill_admin ON ops.authorization_operation_cutover_drill FOR ALL TO athyperadmin USING(plane_code=current_setting('app.database_plane',true)) WITH CHECK(plane_code=current_setting('app.database_plane',true)); END IF; END $$;
REVOKE ALL ON ops.authorization_operation_cutover_drill FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT,INSERT ON ops.authorization_operation_cutover_drill TO athyperadmin; END IF; END $$;

CREATE TABLE IF NOT EXISTS ops.authorization_legacy_retirement_approval (
 id uuid NOT NULL DEFAULT shared.uuidv7(),plane_code text NOT NULL,activation_manifest_sha256 text NOT NULL,
 covered_operation_count integer NOT NULL,approval_action text NOT NULL,ticket_reference text NOT NULL,
 decision_reason text NOT NULL,decided_at timestamptz NOT NULL DEFAULT now(),decided_by uuid NOT NULL,
 CONSTRAINT authorization_legacy_retirement_approval_pkey PRIMARY KEY(id),
 CONSTRAINT authorization_legacy_retirement_approval_plane_chk CHECK(plane_code IN('neon','mesh')),
 CONSTRAINT authorization_legacy_retirement_approval_hash_chk CHECK(activation_manifest_sha256~'^[a-f0-9]{64}$'),
 CONSTRAINT authorization_legacy_retirement_approval_count_chk CHECK(covered_operation_count>0),
 CONSTRAINT authorization_legacy_retirement_approval_action_chk CHECK(approval_action IN('approve','revoke')),
 CONSTRAINT authorization_legacy_retirement_approval_text_chk CHECK(btrim(ticket_reference)<>'' AND btrim(decision_reason)<>'')
);
CREATE INDEX IF NOT EXISTS authorization_legacy_retirement_approval_latest_idx ON ops.authorization_legacy_retirement_approval(plane_code,decided_at DESC);
DROP TRIGGER IF EXISTS authorization_legacy_retirement_approval_immutable ON ops.authorization_legacy_retirement_approval;
CREATE TRIGGER authorization_legacy_retirement_approval_immutable BEFORE UPDATE OR DELETE ON ops.authorization_legacy_retirement_approval FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_authorization_operation_cutover_drill();
ALTER TABLE ops.authorization_legacy_retirement_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_legacy_retirement_approval FORCE ROW LEVEL SECURITY;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='ops' AND tablename='authorization_legacy_retirement_approval' AND policyname='authorization_legacy_retirement_approval_admin') THEN CREATE POLICY authorization_legacy_retirement_approval_admin ON ops.authorization_legacy_retirement_approval FOR ALL TO athyperadmin USING(plane_code=current_setting('app.database_plane',true)) WITH CHECK(plane_code=current_setting('app.database_plane',true)); END IF; END $$;
REVOKE ALL ON ops.authorization_legacy_retirement_approval FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT,INSERT ON ops.authorization_legacy_retirement_approval TO athyperadmin; END IF; END $$;
