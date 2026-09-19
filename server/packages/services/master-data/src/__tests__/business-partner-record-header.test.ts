import { describe, expect, it } from "vitest";
import type { BusinessPartner360Summary } from "@athyper/server-contract-master-data";
import {
  businessPartnerRecordHeader,
  businessPartnerRecordPresentation,
} from "../business-partner-record-header.js";
const summary = {
  identity: {
    id: "bp-1",
    code: "BP-001",
    displayName: "Northwind",
    lifecycleStatus: "active",
    category: "organization",
  },
  scope: {businessPartnerId: "bp-1", asOf: "2026-09-08"},
  roles: [{ code: "supplier" }],
  asOf: "2026-09-08",
  completeness: { readOnly: false, fingerprint: "test-revision" },
  sections: [
    { code: "overview", authorization: "granted" },
    { code: "contacts", authorization: "restricted", count: 99 },
  ],
} as BusinessPartner360Summary;
describe("Business Partner record header", () => {
  it("only places authorized actions and never discloses restricted section counts", () => {
    const header = businessPartnerRecordHeader(summary, {
      add_role: {
        code: "add_role",
        label: "Add role",
        href: "/roles/new",
        authority: "entity_case",
        permission: "create",
      },
    });
    expect(header.actions.map((item) => item.key)).toEqual(["add_role"]);
    expect(
      header.sections.find((item) => item.key === "contacts"),
    ).not.toHaveProperty("count");
    expect(header.badges).toContainEqual({ label: "active", tone: "success" });
  });
  it("uses published labels and order without granting unpublished section access", () => {
    const header = businessPartnerRecordHeader(
      summary,
      {},
      {
        ...businessPartnerRecordPresentation,
        sections: [
          { key: "contacts", label: "People", placement: "direct", fields: [] },
          { key: "secret", label: "Secret", placement: "direct", fields: [] },
        ],
      },
    );
    expect(header.sections[0]?.label).toBe("People");
    expect(header.sections.some((item) => item.key === "secret")).toBe(false);
  });
  it("keeps historical records read-only", () => {
    const header = businessPartnerRecordHeader(
      { ...summary, completeness: { ...summary.completeness, readOnly: true } },
      {
        add_role: {
          code: "add_role",
          label: "Add",
          href: "/roles/new",
          authority: "entity_case",
          permission: "create",
        },
      },
    );
    expect(header.actions).toEqual([]);
    expect(header.readOnly).toBe(true);
  });
});

it("binds header and related actions to the same operation, context and authority revision", () => {
  const header = businessPartnerRecordHeader(
    {...summary, scope: {...summary.scope, operatingOrganizationId: "org-1", companyCodeId: "company-1"}},
    {add_role: {code: "add_role", label: "Add role", href: "/roles/new", authority: "entity_case", permission: "create"}},
    {...businessPartnerRecordPresentation, actions: [{key: "role-button", operationKey: "add_role", label: "Add role", placement: "primary"}]},
    "legacy:current-profile",
  );
  const action = header.actions[0]!;
  expect(action.operationKey).toBe("add_role");
  expect(action.key).toBe("role-button");
  expect(action.href).toBe("/roles/new?operatingOrganizationId=org-1&companyCodeId=company-1");
  expect(action.decision).toMatchObject({state: "allowed", operationKey: "add_role", authorityRevision: "legacy:current-profile"});
  expect(header.relatedActions?.[0]).toMatchObject({operationKey: action.operationKey, href: action.href, decision: action.decision});
});
