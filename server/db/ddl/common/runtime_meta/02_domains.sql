CREATE DOMAIN runtime_meta.applied_release_status_d AS text
  CHECK (VALUE IN ('staged','verified','active','rejected','superseded'));

CREATE DOMAIN runtime_meta.entity_contract_status_d AS text
  CHECK (VALUE IN ('staged','published','superseded','revoked'));

CREATE DOMAIN runtime_meta.entity_descriptor_status_d AS text
  CHECK (VALUE IN ('staged','active','retired'));
