REVOKE ALL ON event.authorization_invalidation_outbox FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT, INSERT ON event.authorization_invalidation_outbox TO athyperapp;
    GRANT EXECUTE ON FUNCTION event.fn_authorization_bump_epoch(text, uuid, text), event.fn_authorization_emit_invalidation(text, text, uuid, text, text, char, jsonb, timestamptz), event.fn_authorization_claim_invalidations(text, integer, integer), event.fn_authorization_complete_invalidation(uuid, text), event.fn_authorization_fail_invalidation(uuid, text, text, integer) TO athyperapp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON event.authorization_invalidation_outbox TO athyperadmin; END IF;
END $$;
