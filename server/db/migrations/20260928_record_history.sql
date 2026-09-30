BEGIN;
-- Authoritative root-record history. Only owning mutation transactions append.
-- A concurrency counter alone never populates this ledger.
CREATE TABLE snapshot.record_version (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  plane_code text NOT NULL CHECK (plane_code IN ('studio','neon','mesh')),
  entity_type text NOT NULL,
  entity_code text NOT NULL,
  entity_id uuid NOT NULL,
  source_record_version bigint NOT NULL CHECK (source_record_version > 0),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create','patch','transition','delete','aggregate','domain')),
  transition_code text,
  release_id uuid NOT NULL,
  contract_hash text NOT NULL,
  changed_fields text[] NOT NULL,
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json)='object'),
  snapshot_id uuid,
  CONSTRAINT record_version_source_uq UNIQUE (tenant_id,plane_code,entity_type,entity_id,source_record_version),
  CONSTRAINT record_version_snapshot_fk FOREIGN KEY (tenant_id,snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id)
);
CREATE INDEX record_version_feed_idx ON snapshot.record_version(tenant_id,plane_code,entity_code,entity_type,entity_id,occurred_at DESC,id DESC);
CREATE FUNCTION snapshot.trg_record_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Record versions are immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER record_version_immutable BEFORE UPDATE OR DELETE ON snapshot.record_version
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_record_version_immutable();
ALTER TABLE snapshot.record_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.record_version FORCE ROW LEVEL SECURITY;
CREATE POLICY record_version_read ON snapshot.record_version FOR SELECT
USING (tenant_id=shared.current_tenant_id() AND plane_code=current_setting('app.database_plane',true));
CREATE POLICY record_version_append ON snapshot.record_version FOR INSERT
WITH CHECK (tenant_id=shared.current_tenant_id() AND plane_code=current_setting('app.database_plane',true)
  AND actor_principal_id=master.current_principal_id_soft());
REVOKE ALL ON snapshot.record_version FROM PUBLIC;
REVOKE ALL ON FUNCTION snapshot.trg_record_version_immutable() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT,INSERT ON snapshot.record_version TO athyperapp;
  END IF;
END $$;
COMMENT ON TABLE snapshot.record_version IS 'Immutable, tenant/plane scoped root history from admitted owning transactions. Coverage is the reviewed logical root projection, not an aggregate backup. No reconstruction from counters or audit events.';

COMMIT;
