import type { NeonOperatingOrganizationValue } from "@athyper/product-neon-shell";
import { describe, expect, it } from "vitest";
import { resolveBusinessPartner360Organization } from "./business-partner-360";

describe("Business Partner 360 organization scope", () => {
  it("uses the sole permitted commercial organization for the all-role lens", () => {
    const organization = { id: "org-1", code: "catl.operations" };
    const value: Pick<NeonOperatingOrganizationValue, "selected" | "compatible"> = {
      selected: () => undefined,
      compatible: (capability) => capability === "procurement" ? [organization as never] : [],
    };

    expect(resolveBusinessPartner360Organization(value, "all")).toBe(organization);
  });

  it("prefers an explicit selection when several organizations are permitted", () => {
    const selected = { id: "org-2", code: "selected.operations" };
    const value: Pick<NeonOperatingOrganizationValue, "selected" | "compatible"> = {
      selected: (capability) => capability === "sales" ? selected as never : undefined,
      compatible: () => [],
    };

    expect(resolveBusinessPartner360Organization(value, "all")).toBe(selected);
  });
});
