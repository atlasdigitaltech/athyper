import { expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
} from "kysely";
import {
  createBusinessPartnerJournalActivityReader,
  type BusinessPartnerJournalActivityQuery,
} from "./business-partner-journal-activity.js";
const query: BusinessPartnerJournalActivityQuery = {
  actor: {
    tenantId: "tenant",
    principalId: "reader",
    planeKey: "neon",
    correlationId: "test",
  },
  businessPartnerId: "partner",
  operatingOrganizationId: "organization",
  companyCodeId: "company",
  asOf: "2026-09-12",
};
function setup(rows: Record<string, unknown>[][], decisions = [true, true]) {
  const queries: CompiledQuery[] = [];
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
          rows: rows.shift() ?? [],
        }),
      },
    ],
  });
  const authorize = vi.fn(async () => decisions.shift() ?? false);
  const reader = createBusinessPartnerJournalActivityReader({
    transactions: { run: async (_actor, work) => work(db) },
    authorize,
    now: () => new Date("2026-09-12T05:00:00Z"),
  });
  return { reader, authorize, queries };
}
it("requires a complete context and independent Finance authorization before SQL", async () => {
  const denied = setup([], [false]);
  expect((await denied.reader.read(query)).reasonCode).toBe(
    "FINANCE_ACTIVITY_FORBIDDEN",
  );
  expect(denied.authorize).toHaveBeenCalledWith(
    query,
    "finance.ledger.business_partner_activity.read",
  );
  expect(denied.queries).toHaveLength(0);
  const incomplete = setup([]);
  expect(
    (await incomplete.reader.read({ ...query, companyCodeId: "" })).reasonCode,
  ).toBe("FINANCE_ACTIVITY_CONTEXT_REQUIRED");
  expect(incomplete.authorize).not.toHaveBeenCalled();
});
it("rejects incompatible or stale company context before aggregation", async () => {
  const { reader, queries } = setup([[]]);
  expect((await reader.read(query)).reasonCode).toBe(
    "FINANCE_ACTIVITY_CONTEXT_INCOMPATIBLE",
  );
  expect(queries).toHaveLength(1);
});
it("returns populated counts from a tenant/company/date/BP-filtered journal aggregate", async () => {
  const { reader, queries } = setup([
    [{ exists: 1 }],
    [{ draft_count: "2", posted_count: "3" }],
    [{ exists: 1 }],
  ]);
  const result = await reader.read(query);
  expect(result.state).toBe("ready");
  expect(result.metrics.map((x) => x.value)).toEqual([2, 3]);
  const aggregate = queries[1]!;
  expect(aggregate.sql).toContain("EXISTS(SELECT 1 FROM document.journal_line");
  expect(aggregate.sql).toContain("line.tenant_id=journal.tenant_id");
  expect(aggregate.sql).toContain("journal.company_code_id=");
  expect(aggregate.sql).toContain("journal.document_date<=");
  expect(aggregate.parameters).toEqual([
    "tenant",
    "company",
    "2026-09-12",
    "2026-09-12",
    "partner",
  ]);
});
it("distinguishes a genuinely empty authorized aggregate", async () => {
  const { reader } = setup([
    [{ exists: 1 }],
    [{ draft_count: "0", posted_count: "0" }],
    [{ exists: 1 }],
  ]);
  expect((await reader.read(query)).state).toBe("empty");
});
it("discards populated counts when access is revoked during the read", async () => {
  const { reader } = setup(
    [[{ exists: 1 }], [{ draft_count: "2", posted_count: "3" }]],
    [true, false],
  );
  const result = await reader.read(query);
  expect(result.reasonCode).toBe("FINANCE_ACTIVITY_AUTHORIZATION_CHANGED");
  expect(result.metrics).toEqual([]);
});
it("discards populated counts when the company context becomes stale during the read", async () => {
  const { reader } = setup([
    [{ exists: 1 }],
    [{ draft_count: "2", posted_count: "3" }],
    [],
  ]);
  const result = await reader.read(query);
  expect(result.reasonCode).toBe("FINANCE_ACTIVITY_CONTEXT_CHANGED");
  expect(result.metrics).toEqual([]);
});
it("fails closed for invalid aggregate numbers", async () => {
  const { reader } = setup([
    [{ exists: 1 }],
    [{ draft_count: "9007199254740992", posted_count: "0" }],
  ]);
  await expect(reader.read(query)).rejects.toThrow(
    "FINANCE_ACTIVITY_COUNT_INVALID",
  );
});
