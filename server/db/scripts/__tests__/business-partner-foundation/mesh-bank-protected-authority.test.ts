import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, "../../..");
test("G4 clean MESH bank authority stores tokens rather than account identifiers", async () => {
  const tables = await readFile(
      path.join(root, "ddl/planes/mesh/mesh/03_tables.sql"),
      "utf8",
    ),
    bank = tables.slice(
      tables.indexOf("CREATE TABLE mesh.bank_account ("),
      tables.indexOf("CREATE TABLE mesh.bank_account_link ("),
    );
  assert.match(bank, /protected_value_token\s+text\s+NOT NULL/);
  assert.match(bank, /identifier_fingerprint\s+char\(64\)\s+NOT NULL/);
  assert.match(bank, /protection_key_version\s+integer\s+NOT NULL/);
  assert.doesNotMatch(bank, /account_id_value/);
  assert.match(bank, /pg_column_size\(metadata\) <= 4096/);
});
test("G4 migrates populated legacy identifiers without ordinary evidence leakage", async () => {
  const migration = await readFile(
      path.join(
        root,
        "migrations/20260904_mesh_bank_protected_value_upgrade.sql",
      ),
      "utf8",
    ),
    g4 = await readFile(
      path.join(
        root,
        "ddl/planes/mesh/mesh/15_data_protection_and_stewardship.sql",
      ),
      "utf8",
    );
  assert.match(migration, /G4_VAULT_MIGRATION_KEY_REQUIRED/);
  assert.match(migration, /pgp_sym_encrypt/);
  assert.match(migration, /DROP COLUMN account_id_value/);
  assert.doesNotMatch(g4, /account_id_value/);
  assert.match(g4, /command_retrieve_bank_protected_token/);
  assert.match(g4, /athyper_protected_value_retriever/);
  assert.match(g4, /command_rotate_bank_protected_token/);
  assert.match(g4, /bank_disclosure_purpose/);
  assert.match(g4, /network_account_profile_address/);
  assert.match(g4, /canonical_party_correlation_case/);
});
