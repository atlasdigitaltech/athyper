GRANT SELECT, INSERT, UPDATE, DELETE
  ON master.certification_type TO athyperapp;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON master.certification TO athyperapp;
GRANT ALL PRIVILEGES
  ON master.certification_type TO athyperadmin;
GRANT ALL PRIVILEGES
  ON master.certification TO athyperadmin;
GRANT EXECUTE
  ON FUNCTION master.trg_validate_certification_type_scope()
  TO athyperapp, athyperadmin;
