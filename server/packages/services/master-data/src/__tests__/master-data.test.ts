import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeAddress, normalizeContactValue } from "../index.js";

describe("master contacts and addresses", () => {
  it("normalizes PII before deriving duplicate candidates", () => {
    expect(normalizeContactValue("email", "  PERSON@Example.COM ")).toBe("person@example.com");
    expect(normalizeContactValue("phone", "+60 (12) 345-6789")).toBe("+60123456789");
    const first = normalizeAddress({ line1: " 10  Main St ", city: " KL ", countryCode: "my" });
    const second = normalizeAddress({ line1: "10 Main St", city: "KL", countryCode: "MY" });
    expect(first.address).toEqual(second.address);
    expect(first.hash).toBe(second.hash);
  });

  it.each(["studio", "neon", "mesh"])("enforces effective dating, signed verification evidence, and primary uniqueness in %s DDL", (plane) => {
    const root = resolve(process.cwd(), `../../../db/ddl/planes/${plane}/master`);
    const tables = readFileSync(resolve(process.cwd(), "../../../db/ddl/common/master/03_platform_tables.sql"), "utf8");
    const indexes = readFileSync(resolve(root, "06_indexes.sql"), "utf8");
    const functions = readFileSync(resolve(root, "07_functions.sql"), "utf8");
    expect(tables).toContain("verification_evidence jsonb");
    expect(tables).toContain("effective_until     timestamptz");
    expect(indexes).toContain("CREATE UNIQUE INDEX address_link_current_primary_uq");
    expect(indexes).toContain("WHERE is_primary AND status = 'active' AND effective_until IS NULL");
    expect(functions).toContain("Verification changes require new signed provider evidence");
  });
});
