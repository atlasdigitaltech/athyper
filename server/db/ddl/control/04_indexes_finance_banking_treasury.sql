CREATE INDEX IF NOT EXISTS ix_bip_connection_readiness ON control.bank_interface_profile
  (tenant_id,credential_status,last_connection_test_status,status);
