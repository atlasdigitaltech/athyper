REVOKE ALL ON runtime_meta.authorization_epoch FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT ON runtime_meta.authorization_epoch TO athyperapp; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON runtime_meta.authorization_epoch TO athyperadmin; END IF;
END $$;
