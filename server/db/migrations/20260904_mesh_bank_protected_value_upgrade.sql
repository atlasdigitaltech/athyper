-- G4 P0 supported-upgrade conversion. Populated upgrades must inject a
-- high-entropy key as app.g4_bank_migration_key on the migration session.
-- The key and clear identifier are never written to evidence, logs, snapshots
-- or outbox rows. The transitional column is dropped in this transaction.

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyper_protected_value_retriever') THEN
    CREATE ROLE athyper_protected_value_retriever
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$role$;

ALTER TABLE mesh.bank_account
  ADD COLUMN protected_value_token text,
  ADD COLUMN identifier_fingerprint char(64),
  ADD COLUMN protection_key_version integer;

DO $upgrade$
DECLARE
  v_key text := nullif(current_setting('app.g4_bank_migration_key',true),'');
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM mesh.bank_account;
  IF v_count>0 AND (v_key IS NULL OR length(v_key)<32) THEN
    RAISE EXCEPTION 'G4_VAULT_MIGRATION_KEY_REQUIRED rows=%',v_count
      USING ERRCODE='object_not_in_prerequisite_state';
  END IF;
  IF v_count>0 THEN
    EXECUTE $sql$
      UPDATE mesh.bank_account
         SET protected_value_token='enc:v1:'||encode(public.pgp_sym_encrypt(
               account_id_value,current_setting('app.g4_bank_migration_key'),
               'cipher-algo=aes256,compress-algo=0'),'hex'),
             identifier_fingerprint=encode(public.hmac(
               convert_to(tenant_id::text||':'||account_id_value,'UTF8'),
               convert_to(current_setting('app.g4_bank_migration_key'),'UTF8'),'sha256'),'hex'),
             protection_key_version=1,
             account_last4=right(account_id_value,4)
    $sql$;
  END IF;
END
$upgrade$;

DROP TRIGGER trg_mesh_bank_account_normalize ON mesh.bank_account;
ALTER TABLE mesh.bank_account
  ALTER COLUMN protected_value_token SET NOT NULL,
  ALTER COLUMN identifier_fingerprint SET NOT NULL,
  ALTER COLUMN protection_key_version SET NOT NULL,
  DROP CONSTRAINT mesh_bank_account_identifier_chk,
  DROP CONSTRAINT mesh_bank_account_last4_chk,
  DROP COLUMN account_id_value,
  ADD CONSTRAINT mesh_bank_account_token_chk CHECK(
    length(protected_value_token) BETWEEN 8 AND 512
    AND protected_value_token~'^[A-Za-z0-9][A-Za-z0-9._:/-]+$'
    AND protected_value_token!~'(\.\.|//)'),
  ADD CONSTRAINT mesh_bank_account_fingerprint_chk CHECK(identifier_fingerprint~'^[a-f0-9]{64}$'),
  ADD CONSTRAINT mesh_bank_account_key_version_chk CHECK(protection_key_version>=1),
  ADD CONSTRAINT mesh_bank_account_last4_chk CHECK(account_last4~'^[A-Z0-9]{4}$'),
  DROP CONSTRAINT mesh_bank_account_metadata_chk,
  ADD CONSTRAINT mesh_bank_account_metadata_chk CHECK(jsonb_typeof(metadata)='object' AND pg_column_size(metadata)<=4096);

COMMENT ON COLUMN mesh.bank_account.protected_value_token IS
  'Opaque encrypted/tokenized locator. Raw bank-account identifiers are prohibited from MESH authority and evidence.';
COMMENT ON COLUMN mesh.bank_account.identifier_fingerprint IS
  'Tenant-bound keyed fingerprint for equality checks; never a retrieval credential.';

\ir ../ddl/planes/mesh/mesh/15_data_protection_and_stewardship.sql
