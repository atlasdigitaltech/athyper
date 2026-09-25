import { describe, expect, it } from "vitest";
import {
  readPartnerPublicationTargets,
  assertPartnerPublicationSchema,
} from "./publication-contract.js";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type Transaction,
} from "kysely";
const businessPartnerId = "44444444-4444-4444-8444-444444444444";
describe("partner-owned publication receipt", () => {
  it("fails closed if the matching schema and command marker are unavailable", async () => {
    const queries: string[] = [];
    const db = new Kysely<Record<string, never>>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (db) => new PostgresIntrospector(db),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
      log: (event) => queries.push(event.query.sql),
    });
    await expect(
      assertPartnerPublicationSchema(
        db as unknown as Transaction<Record<string, never>>,
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: "WORKFORCE_PARTNER_SCHEMA_REQUIRED",
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("pg_catalog.pg_attribute");
    expect(queries[0]).not.toMatch(/INSERT|UPDATE|DELETE/);
    await db.destroy();
  });
  it("accepts an explicitly versioned BP receipt", () => {
    expect(
      readPartnerPublicationTargets({
        counterpartyContract: "business_partner.v1",
        partnerTargets: [{ businessPartnerId }],
      }),
    ).toEqual([{ businessPartnerId }]);
  });
  it.each([
    { supplierTargets: [{ supplierId: businessPartnerId }] },
    { partnerTargets: [{ businessPartnerId }] },
    { counterpartyContract: "business_partner.v1", partnerTargets: [] },
    {
      counterpartyContract: "business_partner.v1",
      partnerTargets: [{ supplierId: businessPartnerId }],
    },
    {
      counterpartyContract: "business_partner.v1",
      partnerTargets: [{ businessPartnerId, supplierId: businessPartnerId }],
    },
  ])(
    "does not relabel or silently replay a legacy/malformed receipt",
    (payload) => {
      expect(() => readPartnerPublicationTargets(payload)).toThrowError(
        expect.objectContaining({
          code: "WORKFORCE_PUBLICATION_RECEIPT_CONTRACT_MISMATCH",
        }),
      );
    },
  );
});
