import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { KyselyRecordSnapshotRepository } from "../snapshots/kysely-snapshot-repository.js";

const connectionString=process.env["ATHYPER_NEON_TEST_DATABASE_URL"],enabled=process.env["ATHYPER_SERVICE_DB_TESTS"]==="true"&&Boolean(connectionString);
const tenantId=process.env["ATHYPER_SERVICE_TEST_TENANT_ID"],principalId=process.env["ATHYPER_SERVICE_TEST_PRINCIPAL_ID"];
if(enabled&&(!tenantId||!principalId))throw new Error("ATHYPER_SERVICE_TEST_TENANT_ID and ATHYPER_SERVICE_TEST_PRINCIPAL_ID are required");
const pool=new Pool({connectionString:connectionString??"postgres://disabled",max:4});
const database=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool})});
type Tx=Transaction<Record<string,never>>;
const transactions={run<T>(plane:string,actor:{tenantId:string;principalId:string},work:(transaction:Tx)=>Promise<T>):Promise<T>{if(plane!=="neon")return Promise.reject(new Error("WRONG_PLANE"));return database.transaction().execute(async tx=>{await sql`SELECT set_config('app.current_tenant_id',${actor.tenantId},true),set_config('app.current_principal_id',${actor.principalId},true)`.execute(tx);return work(tx);});}};
const repository=new KyselyRecordSnapshotRepository(transactions as never);

describe.skipIf(!enabled)("snapshot PostgreSQL concurrency",()=>{
  afterAll(async()=>{await database.destroy();});
  it("serializes concurrent captures and replays an identical latest payload",async()=>{
    const entityId=randomUUID(),common={tenantId:tenantId!,principalId:principalId!,planeKey:"neon" as const,entityType:"master.wave0_test",entityId,entityCode:"wave0_test",entityContractHash:"a".repeat(64),captureEvent:"records.snapshot.capture",captureKind:"manual" as const,retentionClass:"temporary" as const,captureSource:"postgres_test"};
    const receipts=await Promise.all([repository.capture({...common,sourceRecordVersion:1,payload:{id:entityId,row_version:1,value:"first"}}),repository.capture({...common,sourceRecordVersion:2,payload:{id:entityId,row_version:2,value:"second"}})]);
    expect(receipts.map(item=>item.snapshot.chainSequence).sort()).toEqual([1,2]);
    const latest=await repository.latest({tenantId:tenantId!,principalId:principalId!,planeKey:"neon"},common.entityType,entityId);
    const replay=await repository.capture({...common,sourceRecordVersion:latest!.sourceRecordVersion,payload:latest!.payload});
    expect(replay).toMatchObject({kind:"replayed",snapshot:{id:latest!.id,chainSequence:2}});
    expect(await repository.get({tenantId:randomUUID(),principalId:principalId!,planeKey:"neon"},latest!.id)).toBeNull();
    await expect(repository.get({tenantId:tenantId!,principalId:principalId!,planeKey:"studio"},latest!.id)).rejects.toThrow("WRONG_PLANE");
  });
  it("persists canonical JSONB evidence and creates new evidence for retention changes", async () => {
    const input = { tenantId: tenantId!, principalId: principalId!, planeKey: "neon" as const, entityType: "master.wave0_test", entityId: randomUUID(), entityCode: "wave0_test", entityContractHash: "a".repeat(64), captureEvent: "records.snapshot.capture", captureKind: "manual" as const, retentionClass: "temporary" as const, captureSource: "postgres_test", payload: { label: "Résumé 東京", nested: { longKey: 1, a: 2 }, date: new Date("2026-09-06T01:02:03.456Z") } };
    const captured = await repository.capture(input);
    const read = await repository.get({ tenantId: tenantId!, principalId: principalId!, planeKey: "neon" }, captured.snapshot.id);
    expect(read).toEqual(captured.snapshot);
    expect(read!.payload["date"]).toBe("2026-09-06T01:02:03.456Z");
    const evidence = await transactions.run("neon", {tenantId:tenantId!,principalId:principalId!}, tx => sql<{ matches: boolean }>`SELECT snapshot.fn_verify_entity_snapshot_hash(${captured.snapshot.id}::uuid) AS matches`.execute(tx));
    expect(evidence.rows).toEqual([{ matches: true }]);
    expect((await repository.capture(input)).kind).toBe("replayed");
    const legal = await repository.capture({ ...input, retentionClass: "legal" });
    expect(legal).toMatchObject({ kind: "created", snapshot: { chainSequence: 2, retentionClass: "legal", previousSnapshotId: captured.snapshot.id } });
  });

});
