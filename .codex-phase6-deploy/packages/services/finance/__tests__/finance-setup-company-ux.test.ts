import { describe, expect, it } from "vitest";

import {
  resolveAccessibleCompany,
  resolveCompanyEntryMode,
} from "../../../../../packages/domain/finance/finance-workbench/src/lib/company-selection.js";

describe("Finance Setup Company entry UX", () => {
  it("handles no accessible Company", () => {
    expect(resolveCompanyEntryMode([], null)).toEqual({ kind: "empty" });
  });

  it("bypasses the chooser for a single accessible Company", () => {
    expect(resolveCompanyEntryMode([{ code: "MY01" }], "MY01")).toEqual({ kind: "redirect", companyCode: "MY01" });
  });

  it("requires an explicit choice for multiple Companies and honors a valid default", () => {
    const companies = [{ code: "MY01" }, { code: "SG01" }];
    expect(resolveCompanyEntryMode(companies, "sg01")).toEqual({ kind: "select", initialCompanyCode: "SG01" });
    expect(resolveCompanyEntryMode(companies, "UNKNOWN")).toEqual({ kind: "select", initialCompanyCode: "MY01" });
  });

  it("canonicalizes an accessible route company without falling back to another company", () => {
    const companies = [
      { code: "ATHQ", tenantCode: "athyper" },
      { code: "MY01", tenantCode: "athyper" },
    ];
    expect(resolveAccessibleCompany(companies, "athq")).toEqual(companies[0]);
    expect(resolveAccessibleCompany(companies, "TKSA")).toBeNull();
    expect(resolveAccessibleCompany(companies, "")).toBeNull();
  });
});
