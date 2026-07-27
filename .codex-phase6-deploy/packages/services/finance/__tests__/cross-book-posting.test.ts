import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("cross-book posting contracts", () => {
  it("uses durable source/rule idempotency and one-hop loop prevention", () => {
    const service = read("server/packages/services/finance/services/cross-book-posting.service.ts");
    const ddl = read("server/db/ddl/document/01z_cross_book_posting.sql");
    const trigger = read("server/db/ddl/document/05_functions.sql");
    expect(ddl).toContain("bpd_source_rule_version_uq");
    expect(ddl).toContain("bpd_idempotency_uq");
    expect(service).toContain("pg_advisory_xact_lock");
    expect(service).toContain("CROSS_BOOK_LOOP_PREVENTED");
    expect(trigger).toContain("NEW.derived_from_je_id IS NOT NULL");
  });

  it("exposes trace, monitoring, and governance evidence", () => {
    const route = read("server/packages/services/finance/routes/journal.route.ts");
    const governance = read("server/packages/services/finance/services/finance-governance.service.ts");
    expect(route).toContain("/finance/cross-book/monitor");
    expect(route).toContain("book_posting_derivation");
    expect(governance).toContain("finance.cross_book.derivations_complete");
  });
});
