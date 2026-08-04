REVOKE ALL ON metadata.entity_numbering_binding FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON metadata.entity_numbering_binding TO athyperapp;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON metadata.entity_numbering_binding TO athyperadmin;
  END IF;
END $$;
