CREATE DOMAIN runtime_meta.entity_contract_status_d AS text
    CHECK (VALUE IN ('published', 'superseded', 'revoked'));
