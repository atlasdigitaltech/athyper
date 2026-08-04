GRANT SELECT, INSERT, UPDATE, DELETE
  ON mesh.certification_type, mesh.certification TO athyperapp;
GRANT ALL PRIVILEGES
  ON mesh.certification_type, mesh.certification TO athyperadmin;
GRANT EXECUTE
  ON FUNCTION mesh.trg_validate_certification_type_scope()
  TO athyperapp, athyperadmin;
