import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { registerSeedPack } from "../../scripts/provisioning/safe-provision.js";
import { withAuthorizationProvisionTransaction } from "./authorization-transaction.js";
const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

test("PostgreSQL restores authorization rows, epochs and receipts on reseed or verification failure", { timeout: 30_000 }, async () => {
  const container = `athyper-auth-reset-${randomUUID().slice(0, 8)}`;
  let client: pg.Client | undefined;
  let created = false;
  try {
    docker("run", "-d", "--name", container, "--label", "athyper.purpose=authorization-reset-test", "--tmpfs", "/var/lib/postgresql/data", "-p", "127.0.0.1::5432", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16.15-bookworm");
    created = true;
    const port = Number(docker("port", container, "5432/tcp").split(":").at(-1));
    for (let attempt = 0; ; attempt++) {
      try { docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"); break; }
      catch { assert.ok(attempt < 80); await new Promise(done => setTimeout(done, 100)); }
    }
    client = new pg.Client({ host: "127.0.0.1", port, user: "postgres", database: "postgres" });
    await client.connect();
    await client.query("CREATE SCHEMA authz; CREATE TABLE authz.reset_fixture(id integer PRIMARY KEY, authority text); INSERT INTO authz.reset_fixture VALUES(1,'original'); CREATE TABLE public.epoch_fixture(value integer); INSERT INTO public.epoch_fixture VALUES(7); CREATE TABLE public.seed_receipt_fixture(hash text)");
    for (const failure of ["seed", "verification"]) {
      await assert.rejects(withAuthorizationProvisionTransaction(client, "neon", async transaction => {
        await transaction.query("TRUNCATE authz.reset_fixture");
        await transaction.query("UPDATE public.epoch_fixture SET value=value+1");
        await transaction.query("INSERT INTO public.seed_receipt_fixture VALUES('pending')");
        await registerSeedPack(transaction, { plane: "neon", packKey: "reset-test", packVersion: "v1", sourcePath: "seed/reset-test.sql", contentSha256: "a".repeat(64), manifestSha256: "b".repeat(64) });
        if (failure === "seed") await transaction.query("SELECT 1/0");
        await transaction.query("INSERT INTO authz.reset_fixture VALUES(2,'quarantine')");
        if (failure === "verification") throw new Error("seed postcondition failed");
      }));
      assert.deepEqual((await client.query("SELECT * FROM authz.reset_fixture")).rows, [{ id: 1, authority: "original" }]);
      assert.deepEqual((await client.query("SELECT * FROM public.epoch_fixture")).rows, [{ value: 7 }]);
      assert.deepEqual((await client.query("SELECT * FROM public.seed_receipt_fixture")).rows, []);
      assert.equal((await client.query("SELECT to_regclass('public.seed_pack_ledger_v2') IS NULL AS absent")).rows[0].absent, true);
    }
    await withAuthorizationProvisionTransaction(client, "neon", async transaction => {
      await transaction.query("TRUNCATE authz.reset_fixture");
      await transaction.query("INSERT INTO authz.reset_fixture VALUES(2,'quarantine')");
      await registerSeedPack(transaction, { plane: "neon", packKey: "reset-test", packVersion: "v1", sourcePath: "seed/reset-test.sql", contentSha256: "a".repeat(64), manifestSha256: "b".repeat(64) });
    });
    assert.deepEqual((await client.query("SELECT * FROM authz.reset_fixture")).rows, [{ id: 2, authority: "quarantine" }]);
  } finally {
    if (client) await client.end();
    if (created) docker("rm", "-f", container);
  }
});
