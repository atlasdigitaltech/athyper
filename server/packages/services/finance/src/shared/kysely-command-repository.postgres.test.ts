import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import type { FinanceActor, FinanceCommand } from "@athyper/server-contract-finance";
import { canonicalFinanceHash } from "./canonical.js";
import { KyselyFinanceCommandRepository } from "./kysely-command-repository.js";

const connectionString = process.env["ATHYPER_NEON_TEST_DATABASE_URL"];
const enabled = process.env["ATHYPER_SERVICE_DB_TESTS"] === "true" && Boolean(connectionString);
const tenantId = process.env["ATHYPER_SERVICE_TEST_TENANT_ID"];
const principalId = process.env["ATHYPER_SERVICE_TEST_PRINCIPAL_ID"];
if (enabled && (!tenantId || !principalId)) throw new Error("ATHYPER_SERVICE_TEST_TENANT_ID and ATHYPER_SERVICE_TEST_PRINCIPAL_ID are required");

type Database = Record<string, never>;
type Tx = Transaction<Database>;
const pool = new Pool({ connectionString: connectionString ?? "postgres://disabled", max: 4 });
const database = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
const repository = new KyselyFinanceCommandRepository();

describe.skipIf(!enabled)("finance durable PostgreSQL idempotency", () => {
  afterAll(async () => database.destroy());

  it("serializes same-key retries, replays the original result, and conflicts on changed input", async () => {
    const actor: FinanceActor = { tenantId: tenantId!, principalId: principalId!, planeKey: "neon", correlationId: randomUUID() };
    const commandCode = `finance.test.${randomUUID()}`;
    const key = randomUUID();
    const original = command(actor, randomUUID(), commandCode, key, { amount: "10.0000" });
    let applications = 0;
    const execute = <T extends Readonly<Record<string, unknown>>>(value: FinanceCommand<T>) => database.transaction().execute(async tx => {
      await context(actor, tx);
      return repository.execute(value, tx, async () => { applications += 1; return { resourceId: original.commandId, version: 7, output: { amount: "10.0000" } }; });
    });
    {
      const [left, right] = await Promise.all([execute(original), execute({ ...original, commandId: randomUUID(), actor: { ...actor, correlationId: randomUUID() } })]);
      expect([left.kind, right.kind].sort()).toEqual(["applied", "replayed"]);
      const applied = [left, right].find(result => result.kind === "applied")!;
      const replayed = [left, right].find(result => result.kind === "replayed")!;
      expect(applied.resourceId).toBe(original.commandId);
      expect(replayed.resourceId).toBe(original.commandId);
      expect(applied.output).toEqual({ amount: "10.0000" });
      expect(replayed.output).toEqual({ amount: "10.0000" });
      expect(applications).toBe(1);
      const changed = command(actor, randomUUID(), commandCode, key, { amount: "11.0000" });
      await expect(execute(changed)).resolves.toMatchObject({ kind: "idempotency_conflict", existingCommandId: applied.commandId });
      expect(applications).toBe(1);
    }
    // The command ledger is immutable. Its unique test records die with the
    // disposable database; runtime DELETE must remain forbidden.
    await expect(database.transaction().execute(async tx => { await context(actor, tx); await sql`DELETE FROM event.command_execution WHERE tenant_id=${actor.tenantId}::uuid AND command_code=${commandCode}`.execute(tx); })).rejects.toMatchObject({code:"42501"});
  });
  it("rolls back a failed application and permits a clean retry of the same key", async () => {
    const actor: FinanceActor = {tenantId:tenantId!,principalId:principalId!,planeKey:"neon",correlationId:randomUUID()};
    const original=command(actor,randomUUID(),`finance.test.${randomUUID()}`,randomUUID(),{amount:"5.0000"});
    await expect(database.transaction().execute(async tx => {
      await context(actor,tx);
      return repository.execute(original,tx,async () => {throw new Error("controlled finance application failure");});
    })).rejects.toThrow("controlled finance application failure");
    await database.transaction().execute(async tx => {
      await context(actor,tx);
      const rows=await sql`SELECT 1 FROM event.command_execution WHERE id=${original.commandId}::uuid`.execute(tx);
      expect(rows.rows).toHaveLength(0);
      expect(await repository.execute(original,tx,async () => ({resourceId:original.commandId,version:1,output:{amount:"5.0000"}}))).toMatchObject({kind:"applied"});
    });
  });

});

function command<Payload extends Readonly<Record<string, unknown>>>(actor: FinanceActor, commandId: string, commandCode: string, idempotencyKey: string, payload: Payload): FinanceCommand<Payload> {
  return { actor, commandId, commandCode, idempotencyKey, payload, requestFingerprint: canonicalFinanceHash({ commandCode, tenantId: actor.tenantId, principalId: actor.principalId, payload, expectedVersion: undefined }) };
}

async function context(actor: FinanceActor, tx: Tx): Promise<void> {
  await sql`SELECT set_config('app.current_tenant_id',${actor.tenantId},true),set_config('app.current_principal_id',${actor.principalId},true)`.execute(tx);
}
