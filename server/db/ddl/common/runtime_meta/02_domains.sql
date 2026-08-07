CREATE DOMAIN runtime_meta.applied_release_status_d AS text
  CHECK (VALUE IN ('staged','verified','active','rejected','superseded'));
