import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const dbRoot = resolve(import.meta.dirname, "../../..");
const sourceRoot = resolve(dbRoot, "../packages/platform/iam/src");

test("P7 persists exact desired identity state, fenced attempts, callbacks, and SoD replay evidence", async () => {
  const [tables, constraints, indexes, triggers, rls, grants] =
    await Promise.all(
      [
        "03_tables.sql",
        "05_constraints.sql",
        "06_indexes.sql",
        "08_triggers.sql",
        "10_rls.sql",
        "11_grants.sql",
      ].map((file) =>
        readFile(resolve(dbRoot, `ddl/planes/studio/trustiam/${file}`), "utf8"),
      ),
    );
  assert.match(tables, /CREATE TABLE trustiam\.identity_projection/);
  assert.match(tables, /CREATE TABLE trustiam\.identity_saga_attempt/);
  assert.match(
    tables,
    /CREATE TABLE trustiam\.provider_identity_callback_inbox/,
  );
  assert.match(
    tables,
    /desired_version bigint NOT NULL, desired_hash char\(64\) NOT NULL/,
  );
  assert.match(tables, /replay_requested_by<>replay_approved_by/);
  assert.match(tables, /payload attributes are intentionally not stored/);
  assert.match(constraints, /identity_saga_attempt_projection_fk/);
  assert.match(indexes, /identity_saga_attempt_open_uq/);
  assert.match(indexes, /provider_identity_callback_sequence_idx/);
  assert.match(
    triggers,
    /identity desired state is fenced by an active saga attempt/,
  );
  assert.match(triggers, /terminal identity saga evidence is immutable/);
  assert.match(rls, /identity_saga_attempt/);
  assert.match(rls, /trustiam_identity_saga_evidence_insert/);
  assert.match(rls, /trustiam\.identity\.saga\.dead_letter/);
  assert.match(
    grants,
    /GRANT SELECT,INSERT,UPDATE ON trustiam\.identity_projection,trustiam\.identity_saga_attempt,trustiam\.provider_identity_callback_inbox TO athyper_trustiam_service/,
  );
  assert.match(
    grants,
    /GRANT INSERT ON event\.outbox TO athyper_trustiam_service/,
  );
});

test("P7 keeps provider administration separate from local authorization and business history", async () => {
  const [contract, repository] = await Promise.all([
    readFile(resolve(sourceRoot, "identity-saga.ts"), "utf8"),
    readFile(resolve(sourceRoot, "kysely-identity-saga.ts"), "utf8"),
  ]);
  assert.match(contract, /Provider attributes are deliberately absent/);
  assert.match(
    contract,
    /person, employment and BP stores are outside this port/,
  );
  assert.match(contract, /roles: readonly LocalRoleAssignment\[\]/);
  assert.match(contract, /Plane-local admission is closed first/);
  assert.doesNotMatch(
    repository,
    /DELETE FROM master\.(person|employment|business_partner)/i,
  );
  assert.match(repository, /provider_attributes[^;]+?'\{\}'::jsonb/);
  assert.doesNotMatch(
    repository,
    /provider_attributes\s*->|provider_attributes\s*#>|jsonb_to_record[^;]+provider_attributes/,
  );
  assert.match(repository, /appendSagaEvidence/);
  assert.match(repository, /trustiam\.identity\.saga\.\$\{outcome\}/);
});
