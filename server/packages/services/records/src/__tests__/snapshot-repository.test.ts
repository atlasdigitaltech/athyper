import type { RecordSnapshotCaptureInput } from "@athyper/server-contract-records";
import { Kysely, PostgresDialect } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { KyselyRecordSnapshotRepository } from "../snapshots/kysely-snapshot-repository.js";

const input: RecordSnapshotCaptureInput = { tenantId: "tenant", principalId: "principal", planeKey: "neon", entityType: "master.partner", entityId: "record", entityCode: "partner", entityContractHash: "a".repeat(64), sourceRecordVersion: 1, captureEvent: "records.snapshot.capture", captureKind: "manual", retentionClass: "standard", captureSource: "application", payload: { name: "same" } };
const row = { id: "previous", tenant_id: input.tenantId, entity_type: input.entityType, entity_id: input.entityId, entity_code: input.entityCode, entity_contract_hash: input.entityContractHash, source_record_version: 1, version_number: 1, payload_schema_version: 1, capture_event: input.captureEvent, capture_kind: input.captureKind, retention_class: input.retentionClass, capture_source: input.captureSource, payload_hash: "b".repeat(64), chain_seq: 1, payload_size_bytes: 15, captured_at: "2026-09-06T00:00:00Z", captured_by: "principal", payload_json: input.payload };
function setup(previous: Record<string, unknown> | null = row) {
  const query = vi.fn(async (sql: string, _parameters: readonly unknown[]) => ({ rows: sql.includes("fn_compute_entity_snapshot_hash") ? [{ payload_hash: "database-hash", payload_size_bytes: 42 }] : sql.includes("SELECT i.*") ? previous ? [previous] : [] : sql.includes("RETURNING *") ? [{ ...row, id: "new", chain_seq: 2 }] : [], command: "SELECT", rowCount: 1 }));
  const database = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: { connect: async () => ({ query, release() {} }), end: async () => {} } as never }) });
  const run = vi.fn(async (_plane: unknown, _actor: unknown, work: (tx: unknown) => Promise<unknown>) => work(database));
  return { repository: new KyselyRecordSnapshotRepository({ run } as never, () => "new"), query, run, database };
}
describe("snapshot persistence", () => {
  it("replays an identical capture after acquiring the record lock", async () => {
    const h = setup();
    expect((await h.repository.capture(input)).kind).toBe("replayed");
    expect(h.query.mock.calls[0]?.[0]).toContain("pg_advisory_xact_lock");
    expect(h.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
    expect(h.run).toHaveBeenCalledWith("neon", { tenantId: "tenant", principalId: "principal" }, expect.any(Function));
    await h.database.destroy();
  });
  it.each([
    { retentionClass: "legal" }, { captureKind: "approval" }, { captureEvent: "record.approved" }, { auditEventId: "audit" },
    { entityCode: "new_code" }, { entityContractHash: "c".repeat(64) }, { sourceRecordVersion: 2 },
    { validFrom: "2026-01-01T00:00:00.000Z" }, { validUntil: "2027-01-01T00:00:00.000Z" }, { captureSource: "migration" },
  ])("creates evidence when capture metadata changes: %j", async change => {
    const h = setup();
    expect((await h.repository.capture({ ...input, ...change } as RecordSnapshotCaptureInput)).kind).toBe("created");
    expect(h.query.mock.calls.filter(([sql]) => sql.includes("INSERT"))).toHaveLength(2);
    await h.database.destroy();
  });
  it("hashes and returns the serialized payload, including Date values", async () => {
    const h = setup(null); const date = new Date("2026-09-06T00:00:00Z");
    const receipt = await h.repository.capture({ ...input, payload: { date } });
    expect(receipt.snapshot.payload).toEqual({ date: date.toISOString() });
    const evidence = h.query.mock.calls.find(([sql]) => sql.includes("fn_compute_entity_snapshot_hash"));
    expect(evidence?.[1]).toContain(JSON.stringify({ date: date.toISOString() }));
    expect(h.query.mock.calls.find(([sql]) => sql.includes("RETURNING *"))?.[1]).toContain("database-hash");
    await h.database.destroy();
  });
  it("replays a Date against its stored JSON string", async () => {
    const date = new Date("2026-09-06T00:00:00Z"); const h = setup({ ...row, payload_json: { date: date.toISOString() } });
    expect((await h.repository.capture({ ...input, payload: { date } })).kind).toBe("replayed");
    await h.database.destroy();
  });
  it("binds tenant and snapshot IDs in reads", async () => {
    const h = setup(null);
    expect(await h.repository.get({ tenantId: "other", principalId: "principal", planeKey: "mesh" }, "missing")).toBeNull();
    expect(h.query.mock.calls[0]?.[1]).toEqual(["other", "missing"]);
    expect(h.query.mock.calls[0]?.[0]).toContain("p.tenant_id=i.tenant_id");
    await h.database.destroy();
  });
});
