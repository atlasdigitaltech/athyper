import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBookCurrencyPrecedence } from "../services/finance-setup-mutations.service.js";

const root = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Finance Setup Books foundation", () => {
  it("confirms the Ledger Book Entity contract and Company assignment metadata", () => {
    const entities = read("server/db/seed/platform/003_control/040_control_entity_contract.sql");
    const fields = read("server/db/seed/platform/003_control/044_control_entity_operation_contract.sql");
    const relations = read("server/db/seed/platform/003_control/043_control_entity_relation_contract.sql");
    expect(entities).toContain("'ledger_book'");
    expect(entities).toContain("'company_code_book_assignment'");
    for (const field of ["category", "reporting_standard", "base_currency_code", "is_auto_post", "is_approval_required", "is_manual_je_allowed", "is_reversal_allowed", "close_mode"]) {
      expect(fields).toContain(`'${field}'`);
    }
    for (const field of ["effective_from", "effective_to", "override_currency_code", "alternate_coa_prefix", "priority", "conflict_strategy"]) {
      expect(fields).toContain(`'${field}'`);
    }
    expect(fields).toContain("'Tenant Default'");
    expect(relations).toContain("('ledger_book', 'company_assignments'");
    expect(relations).toContain("('company_code_book_assignment','ledger_book'");
  });

  it("uses override then Book base currency while retaining Company currency as context", () => {
    expect(resolveBookCurrencyPrecedence("eur", "USD", "MYR")).toEqual({
      currencyCode: "EUR", source: "assignment_override", companyFunctionalCurrency: "MYR",
    });
    expect(resolveBookCurrencyPrecedence(null, "usd", "myr")).toEqual({
      currencyCode: "USD", source: "book_base", companyFunctionalCurrency: "MYR",
    });
    expect(() => resolveBookCurrencyPrecedence(null, "", "MYR")).toThrow("required");
  });

  it("uses explicit Company default CRUD and removes priority-driven default synchronization", () => {
    const routes = read("server/packages/services/finance/routes/finance-setup.route.ts");
    const mutations = read("server/packages/services/finance/services/finance-setup-mutations.service.ts");
    const hardening = read("server/db/ddl/master/01m_bp_core_hardening.sql");
    expect(routes).toContain('/finance/setup/company/:companyCode/book-assignments');
    expect(routes).toContain('/finance/setup/company/:companyCode/book-assignments/:assignmentId');
    expect(routes).toContain('/finance/setup/company/:companyCode/book-assignments/:bookId/set-default');
    expect(routes).not.toContain('/finance/setup/mutations/book/:bookId/set-primary');
    expect(mutations).toContain("export async function setCompanyDefaultBook");
    expect(mutations).not.toContain("export async function setPrimaryBook");
    expect(mutations).toContain("default_ledger_book_id");
    expect(mutations).toContain("BOOK_ASSIGNMENT_NOT_EFFECTIVE");
    expect(hardening).toContain("DROP TRIGGER IF EXISTS trg_sync_default_ledger_book");
    expect(hardening).not.toContain("CREATE TRIGGER trg_sync_default_ledger_book");
  });

  it("invalidates readiness for assignment and default mutations", () => {
    const mutations = read("server/packages/services/finance/services/finance-setup-mutations.service.ts");
    expect(mutations).toContain('"Company Book assignment changed"');
    expect(mutations).toContain('"Company Book assignment deactivated"');
    expect(mutations).toContain('"Company default Book changed"');
  });
});
