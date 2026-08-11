import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const mutationFiles = [
  "../budget/budget-service.ts",
  "../inventory/inventory-service.ts",
  "../tax/tax-calculation-service.ts",
  "../tax/tax-credit-service.ts",
  "../ledger/gl-posting-service.ts",
  "../ledger/commitment-service.ts",
  "../ledger/cross-book-posting-service.ts",
  "../closing/closing-services.ts",
] as const;

describe("finance period-closure adoption contract", () => {
  it("declares the accounting-coordinate JSON row before any field access", async () => {
    const ddl = await readFile(new URL("../../../../../db/ddl/planes/neon/ledger/07_functions.sql", import.meta.url), "utf8");
    const body = ddl.match(/CREATE OR REPLACE FUNCTION ledger\.trg_validate_accounting_coordinates\(\)([\s\S]*?)\n\$\$;/)?.[1];
    expect(body).toBeDefined();
    expect(body).toMatch(/DECLARE\s+v_row jsonb := to_jsonb\(NEW\);/);
    expect(body!.indexOf("v_row jsonb")).toBeLessThan(body!.indexOf("v_row->>"));
  });

  it.each(mutationFiles)("requires period admission before writes in %s", async file => {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    expect(source).toMatch(/(?:guard\.admit|guard\.assertPeriodOpen)\(/);
    const firstGuard = source.search(/(?:guard\.admit|guard\.assertPeriodOpen)\(/);
    const firstWriteBoundary = source.indexOf("commands.execute");
    expect(firstGuard).toBeGreaterThanOrEqual(0);
    expect(firstWriteBoundary).toBeGreaterThan(firstGuard);
  });

  it("re-checks cross-book background retries before destination posting", async () => {
    const source = await readFile(new URL("../ledger/cross-book-posting-service.ts", import.meta.url), "utf8");
    expect(source.match(/guard\.assertPeriodOpen\(/g)).toHaveLength(4);
    expect(source.lastIndexOf("guard.assertPeriodOpen(actor")).toBeLessThan(source.indexOf("destination.createDerivedJournal"));
  });
});
