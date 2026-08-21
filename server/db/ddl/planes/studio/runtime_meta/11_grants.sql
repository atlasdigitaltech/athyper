GRANT USAGE ON SCHEMA runtime_meta TO athyperapp, athyperadmin;
REVOKE ALL ON runtime_meta.mfa_credential_projection FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON runtime_meta.mfa_credential_projection TO athyperapp;
GRANT ALL PRIVILEGES ON runtime_meta.mfa_credential_projection TO athyperadmin;
