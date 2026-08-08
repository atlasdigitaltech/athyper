import { describe, expect, it } from "vitest";
import type { SetupWorkspaceContract } from "../setup-workspace";
import { setupDomainPath, setupScopePath, setupSectionPath } from "../setup-workspace";

const contract = {
  schemaVersion: "1.0",
  code: "finance-setup",
  workspaceCode: "FIN",
  workspaceSlug: "finance",
  label: "Finance Setup",
  basePath: "/finance/setup",
  contributingModuleCodes: ["ACC"],
  scopePolicies: [
    { type: "company_code", routeSegment: "company", selectionMode: "automatic_single", required: true },
  ],
  domains: [
    {
      code: "foundation",
      routeSegment: "foundation",
      label: "Foundation",
      description: "Foundation",
      iconKey: "building",
      order: 10,
      ownerModuleCode: "ACC",
      contributingModuleCodes: [],
      requiredModuleCodes: ["ACC"],
      requiredPermissions: [],
      supportedScopeTypes: ["company_code"],
      sections: [
        { code: "organization", routeSegment: "organization", label: "Organization", order: 10 },
      ],
    },
    {
      code: "certification",
      routeSegment: "certification",
      label: "Certification",
      description: "Certification",
      iconKey: "shield-check",
      order: 20,
      ownerModuleCode: "ACC",
      contributingModuleCodes: [],
      requiredModuleCodes: ["ACC"],
      requiredPermissions: [],
      supportedScopeTypes: ["company_code"],
      anchor: "certification-readiness",
    },
  ],
  overview: {
    title: "Overview",
    layout: "cards",
    showDomainProgress: true,
    showAttention: true,
    certificationEnabled: true,
  },
  capabilities: {
    readiness: true,
    certification: true,
    issues: true,
    activity: false,
    search: false,
    export: false,
  },
} as const satisfies SetupWorkspaceContract;

describe("setup workspace route contract", () => {
  const scope = { type: "company_code" as const, code: "ATH Q" };

  it("maps a canonical scope type to its friendly route segment", () => {
    expect(setupScopePath(contract, scope)).toBe("/finance/setup/company/ATH%20Q");
  });

  it("builds domain, section, and anchored overview paths", () => {
    const foundation = contract.domains[0];
    const certification = contract.domains[1];
    expect(setupDomainPath(contract, scope, foundation))
      .toBe("/finance/setup/company/ATH%20Q/foundation");
    expect(setupSectionPath(contract, scope, foundation, foundation.sections[0]))
      .toBe("/finance/setup/company/ATH%20Q/foundation/organization");
    expect(setupDomainPath(contract, scope, certification))
      .toBe("/finance/setup/company/ATH%20Q#certification-readiness");
  });

  it("rejects scope types not declared by the workspace", () => {
    expect(() => setupScopePath(contract, { type: "tenant", code: "T1" }))
      .toThrow("Unsupported setup scope type: tenant");
  });
});
