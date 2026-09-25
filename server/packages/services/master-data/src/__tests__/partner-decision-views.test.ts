import { describe, expect, it, vi } from "vitest";
import {
  Kysely,
  DummyDriver,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type Transaction,
  type CompiledQuery,
} from "kysely";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  createPartnerDecisionViews,
  partnerDecisionViewPermissions,
  conditionSummaries,
} from "../business-partner/record/decision-views.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const recordId = "33333333-3333-4333-8333-333333333333";
const context = { planeKey: "neon", tenantId } as VerifiedRequestContext;
function fixture(allowed = true, rows: Record<string, unknown>[] = []) {
  const queries: CompiledQuery[] = [];
  let count = 0;
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => {
      if (event.level === "query") queries.push(event.query);
    },
    plugins: [
      {
        transformQuery: (args) => args.node,
        transformResult: async (args) => ({
          ...args.result,
          rows: count++ === 0 ? [{ record_version: "2" }] : rows,
        }),
      },
    ],
  });
  const authorize = vi.fn(async () => ({ allowed }));
  const admitPartner = vi.fn(async () => {});
  const run = vi.fn(
    async <T>(
      _plane: "neon",
      _actor: VerifiedRequestContext,
      work: (tx: Transaction<Record<string, never>>) => Promise<T>,
    ) => work(db as unknown as Transaction<Record<string, never>>),
  );
  return {
    queries,
    authorize,
    admitPartner,
    run,
    api: createPartnerDecisionViews({
      authorizer: { authorize } as unknown as Authorizer,
      admitPartner,
      transactions: { run },
    }),
  };
}
describe("partner decision views", () => {
  it("projects only the explicit condition summary envelope",()=>{
    expect(conditionSummaries([{presentation:{schema:"partner-condition-summary.v1",summary:"Handling review required"},secret:"private"},{summary:"legacy private text"}])).toEqual([
      {summary:"Handling review required",state:"recorded_not_evaluated"},{summary:null,state:"summary_unavailable"},
    ]);
    expect(conditionSummaries(Array.from({length:101},()=>({})))).toHaveLength(100);
  });
  it.each(["qualifications", "restrictions"] as const)(
    "denies %s before querying",
    async (kind) => {
      const f = fixture(false);
      await expect(
        f.api.read({ context, recordId, kind, limit: 25 }),
      ).rejects.toMatchObject({ status: 403 });
      expect(f.run).not.toHaveBeenCalled();
      expect(f.authorize).toHaveBeenCalledWith({
        context,
        permissionCode: partnerDecisionViewPermissions[kind],
        resource: { tenantId, businessPartnerId: recordId },
      });
    },
  );
  it("requires parent admission even with section access", async () => {
    const f = fixture();
    f.admitPartner.mockRejectedValueOnce(new Error("parent denied"));
    await expect(
      f.api.read({ context, recordId, kind: "qualifications", limit: 25 }),
    ).rejects.toThrow("parent denied");
    expect(f.authorize).not.toHaveBeenCalled();
    expect(f.run).not.toHaveBeenCalled();
  });
  it("rejects malformed cursors before access or query", async () => {
    const f = fixture();
    await expect(
      f.api.read({
        context,
        recordId,
        kind: "restrictions",
        limit: 25,
        cursor: "bad",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.admitPartner).not.toHaveBeenCalled();
  });
  it.each(["qualifications", "restrictions"] as const)(
    "bounds %s by tenant, partner and cursor without evidence or workflow",
    async (kind) => {
      const f = fixture(true, [{ id: recordId }, { id: tenantId }]);
      const result = await f.api.read({
        context,
        recordId,
        kind,
        limit: 1,
        cursor: tenantId,
      });
      expect(result.data.items).toHaveLength(1);
      expect(result.data.nextCursor).toBe(recordId);
      const q = f.queries.at(-1)!;
      expect(q.sql).toContain("d.tenant_id=");
      expect(q.sql).toContain("d.business_partner_id=");
      expect(q.sql).toContain("s.tenant_id=d.tenant_id");
      expect(q.parameters).toEqual(
        expect.arrayContaining([tenantId, recordId, 2]),
      );
      expect(q.sql).not.toMatch(
        /decision_reason|approved_snapshot_id|blocked_by|\bd\.reason\b|workflow|document\./,
      );
    },
  );
  it("returns a genuine empty view without eligibility claims", async () => {
    const f = fixture();
    expect(
      (
        await f.api.read({
          context,
          recordId,
          kind: "qualifications",
          limit: 25,
        })
      ).data,
    ).toEqual({ state: "empty", items: [] });
  });
});
