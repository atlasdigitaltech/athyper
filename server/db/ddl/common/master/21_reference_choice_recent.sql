-- Recent selections are history, not principal_ui_preference overrides.
CREATE TABLE IF NOT EXISTS master.reference_choice_recent (
  tenant_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  plane_key text NOT NULL CHECK (plane_key IN ('neon','studio','mesh')),
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 1 AND 127),
  context_key text NOT NULL DEFAULT '' CHECK (length(context_key) <= 128),
  reference_key text NOT NULL CHECK (length(reference_key) BETWEEN 1 AND 256),
  last_selected_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id,principal_id,plane_key,source_key,context_key,reference_key),
  CHECK (expires_at > last_selected_at AND expires_at <= last_selected_at + interval '91 days')
);
CREATE INDEX IF NOT EXISTS reference_choice_recent_expiry ON master.reference_choice_recent(expires_at);
ALTER TABLE master.reference_choice_recent ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.reference_choice_recent FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reference_choice_recent_owner ON master.reference_choice_recent;
CREATE POLICY reference_choice_recent_owner ON master.reference_choice_recent
  USING (tenant_id=shared.current_tenant_id_soft() AND principal_id=master.current_principal_id_soft())
  WITH CHECK (tenant_id=shared.current_tenant_id() AND principal_id=master.current_principal_id_soft());
DO $$ BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON master.reference_choice_recent TO athyperapp;
  END IF;
END $$;
COMMENT ON TABLE master.reference_choice_recent IS 'Bounded per-user reference selection history. Stores keys only; expired entries are never returned.';

-- Narrow maintenance capability: the caller cannot inspect history or delete live choices.
CREATE OR REPLACE FUNCTION master.purge_expired_reference_choices(batch_size integer DEFAULT 1000)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,master SET row_security=off AS $$
DECLARE removed bigint;
BEGIN
  IF batch_size < 1 OR batch_size > 5000 THEN RAISE EXCEPTION 'Invalid cleanup batch'; END IF;
  WITH expired AS (SELECT ctid FROM master.reference_choice_recent WHERE expires_at<=now() ORDER BY expires_at LIMIT batch_size FOR UPDATE SKIP LOCKED)
  DELETE FROM master.reference_choice_recent WHERE ctid IN (SELECT ctid FROM expired);
  GET DIAGNOSTICS removed=ROW_COUNT;
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION master.purge_expired_reference_choices(integer) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT EXECUTE ON FUNCTION master.purge_expired_reference_choices(integer) TO athyperapp;
  END IF;
END $$;
