import { describe, expect, it } from "vitest";
import {
  FINANCE_SETTINGS_DIRECTORY,
  FINANCE_SETUP_WORKSPACE,
} from "../../../../../packages/domain/finance/finance-workbench/src/lib/finance-setup.workspace";

describe("Finance Settings directory contract", () => {
  it("defines static company and tenant settings groups", () => {
    const company = FINANCE_SETTINGS_DIRECTORY.groups.find((group) => group.scope === "company");
    const tenant = FINANCE_SETTINGS_DIRECTORY.groups.find((group) => group.scope === "tenant");

    expect(company?.items.map((item) => item.code)).toEqual([
      "foundation",
      "currency-fx",
      "tax",
      "payments",
      "banking",
    ]);
    expect(tenant?.items.map((item) => item.code)).toEqual([
      "currency-fx-defaults",
      "tax-definitions",
      "payment-terms",
    ]);
  });

  it("carries search and permission metadata without status fields", () => {
    const forbiddenFields = new Set([
      "attention",
      "certification",
      "completion",
      "progress",
      "readiness",
      "state",
      "status",
    ]);

    for (const group of FINANCE_SETTINGS_DIRECTORY.groups) {
      for (const item of group.items) {
        expect(item.requiredPermissions.length).toBeGreaterThan(0);
        expect(item.searchKeywords.length).toBeGreaterThan(0);
        expect(Object.keys(item).filter((key) => forbiddenFields.has(key))).toEqual([]);
      }
    }
  });

  it("keeps existing routes while excluding Certification from settings navigation", () => {
    expect(FINANCE_SETUP_WORKSPACE.label).toBe("Finance Settings");
    expect(FINANCE_SETUP_WORKSPACE.basePath).toBe("/finance/setup");
    expect(FINANCE_SETUP_WORKSPACE.domains.map((domain) => domain.code)).toEqual([
      "foundation",
      "currency-fx",
      "tax",
      "payments",
      "banking",
    ]);
    expect(FINANCE_SETUP_WORKSPACE.domains.some((domain) => domain.code === "certification")).toBe(false);
  });
});
