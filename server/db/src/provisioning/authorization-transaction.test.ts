import assert from "node:assert/strict";
import { test } from "node:test";
import { withAuthorizationProvisionTransaction } from "./authorization-transaction.js";
import type { QueryClient } from "../../scripts/provisioning/safe-provision.js";

function fixture(brokenRollback = false) {
  const calls: string[] = [];
  let installed = ["original authorization"];
  let before: string[] = [];
  const client: QueryClient = {
    async query<Row extends object>(sql: string) {
      calls.push(sql);
      if (sql === "BEGIN") before = [...installed];
      if (sql === "TRUNCATE") installed = [];
      if (sql === "SEED") installed = ["quarantine authorization"];
      if (sql === "ROLLBACK") {
        if (brokenRollback) throw new Error("connection lost during rollback");
        installed = before;
      }
      return { rows: [] as Row[] };
    },
  };
  return { client, calls, installed: () => installed };
}

test("seed and verification failure roll back destructive reset before any commit", async () => {
  for (const stage of ["seed", "verification"]) {
    const f = fixture();
    const failure = new Error(`${stage} failed`);
    await assert.rejects(withAuthorizationProvisionTransaction(f.client, "neon", async tx => {
      await tx.query("TRUNCATE");
      if (stage === "seed") throw failure;
      await tx.query("SEED");
      throw failure;
    }), error => error === failure);
    assert.deepEqual(f.installed(), ["original authorization"]);
    assert.equal(f.calls.includes("COMMIT"), false);
    assert.equal(f.calls.at(-1), "ROLLBACK");
  }
});

test("verified reseed commits only after postconditions and returns its receipt", async () => {
  const f = fixture();
  const receipt = await withAuthorizationProvisionTransaction(f.client, "studio", async tx => {
    await tx.query("TRUNCATE");
    await tx.query("SEED");
    await tx.query("VERIFY");
    return { verified: true };
  });
  assert.deepEqual(receipt, { verified: true });
  assert.deepEqual(f.installed(), ["quarantine authorization"]);
  assert.deepEqual(f.calls.slice(-2), ["VERIFY", "COMMIT"]);
});

test("a broken rollback preserves the original operation error", async () => {
  const f = fixture(true);
  const original = new Error("seed failed");
  await assert.rejects(withAuthorizationProvisionTransaction(f.client, "mesh", async () => { throw original; }), error => error === original);
});
