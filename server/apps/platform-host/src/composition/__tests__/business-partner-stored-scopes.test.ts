import { expect, it } from "vitest";
import {
  PostgresQueryCompiler,
  type Kysely,
  type RootOperationNode,
} from "kysely";
import type { EntityScopeAdapter } from "@athyper/server-service-records";
import { createBusinessPartnerStoredScopes } from "../business-partner-stored-scopes.js";
function setup(
  owner: { company_id: string; organization_id: string } | null = {
    company_id: "stored-company",
    organization_id: "stored-org",
  },
  catalog = true,
) {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const executor = {
    transformQuery: (q: RootOperationNode) => q,
    compileQuery: (q: RootOperationNode) =>
      new PostgresQueryCompiler().compileQuery(q),
    async executeQuery(q: { sql: string; parameters: readonly unknown[] }) {
      queries.push(q);
      return {
        rows: q.sql.includes("owner_company_code_id")
          ? owner
            ? [owner]
            : []
          : q.sql.includes("SELECT 1")
            ? catalog
              ? [{ id: 1 }]
              : []
            : [],
      };
    },
  };
  const tx = { getExecutor: () => executor };
  const db = {
    transaction: () => ({
      execute: (work: (tx: unknown) => unknown) => work(tx),
    }),
  } as unknown as Kysely<Record<string, never>>;
  return {
    adapter: createBusinessPartnerStoredScopes(db, async () => "allowed"),
    queries,
  };
}
const input = {
  context: { planeKey: "neon", tenantId: "tenant", principalId: "principal" },
  entityCode: "business_partner_company_setup_request",
  resolver: "company.record.v1",
  target: "existing",
  recordId: "case",
  coordinates: {
    companyCodeId: "caller-company",
    operatingOrganizationId: "caller-org",
  },
} as Parameters<EntityScopeAdapter["resolve"]>[0];
it("resolves the independently stored company without acquiring caller organization ownership", async () => {
  const { adapter, queries } = setup();
  expect(await adapter.resolve(input)).toEqual({
    state: "resolved",
    coordinates: { companyCodeId: "stored-company" },
  });
  expect(queries.some((q) => q.sql.includes("owner_company_code_id"))).toBe(
    true,
  );
  expect(queries.flatMap((q) => q.parameters)).not.toContain("caller-company");
  expect(queries.flatMap((q) => q.parameters)).not.toContain("caller-org");
});
it("fails closed for a missing stored owner or inactive/incompatible catalog", async () => {
  expect(await setup(null).adapter.resolve(input)).toEqual({
    state: "invalid",
  });
  expect(
    await setup({ company_id: "", organization_id: "org" }).adapter.resolve(
      input,
    ),
  ).toEqual({ state: "invalid" });
  expect(
    await setup(
      { company_id: "company", organization_id: "org" },
      false,
    ).adapter.resolve(input),
  ).toEqual({ state: "invalid" });
});
it("does not treat organization authority or a readable BP as company-case ownership", async () => {
  const { adapter, queries } = setup();
  expect(
    await adapter.resolve({ ...input, resolver: "organization.record.v1" }),
  ).toEqual({ state: "invalid" });
  expect(queries.some((q) => q.sql.includes("master.business_partner"))).toBe(
    false,
  );
});
it("requires both proposed company and compatible organization before persistence", async () => {
  const { adapter } = setup();
  expect(
    await adapter.resolve({
      ...input,
      target: "proposed",
      recordId: undefined,
      coordinates: { companyCodeId: "company" },
    }),
  ).toEqual({ state: "invalid" });
  expect(
    await adapter.resolve({
      ...input,
      target: "proposed",
      recordId: undefined,
      coordinates: { companyCodeId: "company", operatingOrganizationId: "org" },
    }),
  ).toEqual({ state: "resolved", coordinates: { companyCodeId: "company" } });
});
it("discovers a company-owned collection without forcing an organization selector", async () => {
  const { adapter, queries } = setup();
  expect(
    await adapter.resolve({
      ...input,
      target: "collection",
      recordId: undefined,
      coordinates: { companyCodeId: "company" },
    }),
  ).toEqual({ state: "resolved", coordinates: { companyCodeId: "company" } });
  expect(queries.some((q) => q.sql.includes("master.company_code"))).toBe(true);
  expect(
    queries.some((q) =>
      q.sql.includes("operating_organization_company_assignment"),
    ),
  ).toBe(false);
  expect(
    await adapter.resolve({
      ...input,
      target: "collection",
      recordId: undefined,
      coordinates: {},
    }),
  ).toEqual({ state: "invalid" });
  expect(
    await setup(null, false).adapter.resolve({
      ...input,
      target: "collection",
      recordId: undefined,
      coordinates: { companyCodeId: "company" },
    }),
  ).toEqual({ state: "invalid" });
});
