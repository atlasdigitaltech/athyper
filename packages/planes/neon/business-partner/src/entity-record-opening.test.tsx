// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { entityRuntimeClient } from "@athyper/platform-entity-descriptor-client";
import { EntityRecordPage } from "../../../../platform/entity/runtime/form-detail/src/record/entity-record-page";

vi.mock("@athyper/platform-entity-descriptor-client", async (original) => {
  const actual = await original<typeof import("@athyper/platform-entity-descriptor-client")>();
  return { ...actual, entityRuntimeClient: { ...actual.entityRuntimeClient } };
});
vi.mock("@athyper/platform-shell", () => ({
  useRecordPage: () => {},
  useRecordBreadcrumb: () => {},
  useAtlasBusinessContextPublisher: () => {},
  PageHeader: () => null,
  PageWorkspace: ({ children }: any) => <main>{children}</main>,
}));
const http = {};
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => http,
  useSessionIdentity: () => ({ scope: { tenantId: "tenant", principalId: "user", authEpoch: 3 } }),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});
const company = "11111111-1111-4111-8111-111111111111";
const explicitCompany = "22222222-2222-4222-8222-222222222222";
const defaults = { companyCodeId: company, operatingOrganizationId: company, legalEntityId: company };

for (const scenario of [
  { name: "unscoped opening", query: "", defaults: undefined, expected: {} },
  { name: "resolved workspace default", query: "", defaults, expected: defaults },
  { name: "explicit scope without mixing workspace coordinates", query: "?companyCodeId=" + explicitCompany, defaults, expected: { companyCodeId: explicitCompany } },
]) {
  it(`opens the shared record with ${scenario.name} without rewriting its URL`, async () => {
    window.history.replaceState({}, "", "/app/entity/business_partner/record" + scenario.query);
    const bootstrap = vi.spyOn(entityRuntimeClient, "bootstrap").mockImplementation(() => new Promise(() => {}));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<EntityRecordPage
        adapter={{ entityCode: "business_partner", label: "Business Partner", recordHref: id => "/app/entity/business_partner/" + id }}
        recordId="record"
        defaultResourceContext={scenario.defaults}
      />));
      expect(bootstrap).toHaveBeenCalled();
      expect(bootstrap.mock.calls[0]?.[1].resourceContext).toEqual(scenario.expected);
      expect(window.location.search).toBe(scenario.query);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
}
