import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const tables = readFileSync(resolve(repoRoot, "server/db/ddl/control/01u_tables_posting_role.sql"), "utf8");
const functions = readFileSync(resolve(repoRoot, "server/db/ddl/control/05_functions_posting_role.sql"), "utf8");
const rls = readFileSync(resolve(repoRoot, "server/db/ddl/control/08_rls_posting_role.sql"), "utf8");
const service = readFileSync(resolve(repoRoot, "server/packages/services/finance/services/posting-role.service.ts"), "utf8");

describe("posting-role foundation contract", () => {
  it("defines a canonical lookup domain, compatibility aliases, and effective company/book maps", () => {
    expect(tables).toContain("finance.posting_role");
    expect(tables).toContain("control.posting_role_alias");
    expect(tables).toContain("control.posting_role_account_map");
    expect(tables).toContain("ledger_book_id");
    expect(tables).toContain("supersedes_id");
  });

  it("keeps the original resolver signature and exposes a tenant-hardened trace", () => {
    expect(functions).toContain("control.resolve_posting_role_account_trace(");
    expect(functions).toContain("control.resolve_posting_role_account(");
    expect(functions).toContain("p_book_code       text");
    expect(functions).toContain("p_tenant_id IS DISTINCT FROM shared.current_tenant_id()");
    expect(functions).toContain("'step', 'select_mapping'");
    expect(functions).toContain("incompatible with posting role");
  });

  it("forces tenant RLS and derives readiness requirements from active finance policies", () => {
    expect(rls).toContain("FORCE ROW LEVEL SECURITY");
    expect(rls).toContain("tenant_id = shared.current_tenant_id_soft()");
    expect(service).toContain("accounting_profile");
    expect(service).toContain("payment_policy");
    expect(service).toContain("asset_policy");
    expect(service).toContain("posting_role_mapping_missing");
  });
});
