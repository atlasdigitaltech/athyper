import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type CompiledQuery, type Transaction } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createPartnerClassificationService } from "../business-partner/classification/service.js";

const id = "11111111-1111-4111-8111-111111111111";
const maker = "22222222-2222-4222-8222-222222222222";
const context = { planeKey: "neon", tenantId: id, principalId: id, requestId: "test" } as VerifiedRequestContext;
const declaration = { commodityCodeId: id, effectiveFrom: "2026-01-01", sourceSystem: "test", sourceReference: "test-ref", idempotencyKey: "test-key-1" };
const target = { classificationId: id, expectedVersion: 1, idempotencyKey: "test-key-1" };
const current = { id, status: "active", created_by: maker, assignment_kind: "declared", record_version: 1, verified_at: null, verified_by: null };
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(fn => fn())); });
function setup(batches: Record<string, unknown>[][] = [], allowed = true) {
  const queries: CompiledQuery[] = [];
  const db = new Kysely<Record<string, never>>({ dialect: {
    createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(),
    createIntrospector: db => new PostgresIntrospector(db), createQueryCompiler: () => new PostgresQueryCompiler(),
  }, log: event => { if (event.level === "query") queries.push(event.query); },
  plugins: [{ transformQuery: args => args.node, transformResult: async args => ({ ...args.result, rows: batches.shift() ?? [] }) }] });
  cleanup.push(() => db.destroy());
  const authorize = vi.fn(async () => ({ allowed }));
  const audit = vi.fn(async () => {});
  const run = vi.fn(async (_plane: string, _actor: unknown, work: (tx: Transaction<Record<string, never>>) => Promise<unknown>) => work(db as unknown as Transaction<Record<string, never>>));
  const service = createPartnerClassificationService({ authorizer: { authorize } as never, transactions: { run } as never, audit: { record: audit } });
  const execute = (action: "declare" | "verify" | "archive", body: Record<string, unknown>) => service.execute({ context, businessPartnerId: id, action, body });
  return { execute, queries, run, audit, authorize };
}
const admission = () => [[{ id, status: "active" }], [], []];
describe("classification action handlers", () => {
  it("authorizes before parsing or opening a transaction", async () => {
    const h = setup([], false);
    await expect(h.execute("declare", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.run).not.toHaveBeenCalled();
  });
  it.each([
    ["declare", { ...declaration, effectiveFrom: "2026-02-30" }],
    ["declare", { ...declaration, effectiveUntil: "2026-01-01" }],
    ["declare", { ...declaration, commodityCategoryId: id }],
    ["verify", { ...target, evidenceReference: "proof", reason: "not allowed" }],
    ["verify", { ...target, evidenceReference: "proof", expectedVersion: 0 }],
    ["archive", { ...target, reason: "" }],
  ] as const)("rejects invalid %s inputs before mutation", async (action, body) => {
    const h = setup();
    await expect(h.execute(action, body)).rejects.toMatchObject({ code: "BP_CLASSIFICATION_INPUT_INVALID" });
    expect(h.run).not.toHaveBeenCalled();
  });
  it("declares under tenant, parent and source locks and writes an audited receipt", async () => {
    const h = setup([...admission(), [], [], [{ id }], [current], []]);
    expect(await h.execute("declare", declaration)).toMatchObject({ replayed: false, classification: { id } });
    expect(h.queries.filter(q => q.sql.includes("pg_advisory_xact_lock"))).toHaveLength(2);
    const insert = h.queries.find(q => q.sql.startsWith("INSERT INTO master.business_partner_commodity_classification"))!;
    expect(insert.parameters).toEqual([id, id, id, "2026-01-01", null, "test", "test-ref", null, id]);
    expect(h.audit).toHaveBeenCalledOnce();
    expect(h.queries.at(-1)?.sql).toContain("business_partner_classification_command");
  });
  it("preserves exact historical fingerprints and replays retired category commands before capture rejection", async () => {
    const { commodityCodeId: _code, ...rest } = declaration;
    const body = { ...rest, commodityCategoryId: id };
    const fingerprint = createHash("sha256").update(JSON.stringify({ bp: id, action: "declare", body: Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b))) })).digest("hex");
    const h = setup([[{ id, status: "active" }], [], [{ fingerprint, result: { id } }]]);
    expect(await h.execute("declare", body)).toMatchObject({ replayed: true, classification: { id } });
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.queries).toHaveLength(3);
    const fresh = setup(admission());
    await expect(fresh.execute("declare", body)).rejects.toMatchObject({ code: "BP_CLASSIFICATION_LEGACY_CAPTURE_RETIRED" });
  });
  it.each([
    [[[], [{id}]], "BP_CLASSIFICATION_SOURCE_CONFLICT"],
    [[[], [], []], "BP_CLASSIFICATION_CODE_NOT_FOUND"],
  ] as const)("rejects unavailable declaration targets %#", async (batches, code) => {
    const h = setup([...admission(), ...batches.map(rows => [...rows])]);
    await expect(h.execute("declare", declaration)).rejects.toMatchObject({code});
    expect(h.queries.some(q => q.sql.startsWith("INSERT"))).toBe(false);
    expect(h.audit).not.toHaveBeenCalled();
  });
  it("rejects reuse of a receipt for a different command", async () => {
    const h = setup([[{ id, status: "active" }], [], [{ fingerprint: "different" }]]);
    await expect(h.execute("declare", declaration)).rejects.toMatchObject({ code: "BP_CLASSIFICATION_IDEMPOTENCY_CONFLICT" });
    expect(h.audit).not.toHaveBeenCalled();
  });
  it.each([
    [[], "BP_CLASSIFICATION_NOT_FOUND"],
    [[{ ...current, record_version: 2 }], "BP_CLASSIFICATION_VERSION_CONFLICT"],
    [[{ ...current, status: "archived" }], "BP_CLASSIFICATION_NOT_ACTIVE"],
    [[{ ...current, created_by: id }], "BP_CLASSIFICATION_INDEPENDENT_CHECKER_REQUIRED"],
    [[{ ...current, assignment_kind: "verified" }], "BP_CLASSIFICATION_INDEPENDENT_CHECKER_REQUIRED"],
  ] as const)("protects verify row transitions %#", async (rows, code) => {
    const h = setup([...admission(), [...rows]]);
    await expect(h.execute("verify", { ...target, evidenceReference: "proof" })).rejects.toMatchObject({ code });
    expect(h.queries.some(q => q.sql.startsWith("UPDATE"))).toBe(false);
    expect(h.queries.at(-1)?.parameters).toEqual([id, id, id]);
  });
  it.each(["verify", "archive"] as const)("keeps %s updates action-specific and hashes audit evidence", async action => {
    const h = setup([...admission(), [current], [{ ...current, record_version: 2 }], []]);
    await h.execute(action, { ...target, ...(action === "verify" ? { evidenceReference: "proof" } : { reason: "proof" }) });
    const update = h.queries.find(q => q.sql.startsWith("UPDATE"))!;
    expect(update.parameters[0]).toBe(action === "verify" ? "active" : "archived");
    expect(update.parameters[1]).toBe(action === "verify" ? "verified" : "declared");
    expect(update.parameters[3]).toBe(action === "verify" ? id : null);
    expect(h.audit.mock.calls[0]?.[0]).toMatchObject({ metadata: { commercialApproval: false, evidenceHash: createHash("sha256").update("proof").digest("hex") } });
  });
});
