// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => http,
  useSessionIdentity: () => ({
    scope: { tenantId: "tenant", principalId: "actor", authEpoch: 1 },
  }),
}));
const http = {};
vi.mock("@athyper/platform-shell", () => ({
  useRecordFooterSources: () => {},
}));
vi.mock("../business-partner-360-context", () => ({
  useBusinessPartner360: () => ({
    summary: {
      identity: { id: "bp" },
      scope: { operatingOrganizationId: "org", companyCodeId: "company" },
      asOf: "2026-09-12",
    },
    roleLens: "all",
  }),
}));
vi.mock("../business-partner-360-section-client", async () => ({
  ...(await vi.importActual("../business-partner-360-section-client")),
  createBusinessPartner360SectionClient: () => ({ read: state.read }),
}));
vi.mock("@athyper/platform-ui", () => ({
  Card: ({ children }: any) => <section>{children}</section>,
  Skeleton: () => null,
}));
import { CommonSection } from "./common-section";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState({}, "", "/");
  state.read.mockReset().mockResolvedValue({
    sectionCode: "identifiers-tax",
    data: { items: [] },
    provenance: [],
    redactions: [],
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it("keeps current tax requests current and preserves both transaction coordinates", async () => {
  await act(async () => root.render(<CommonSection code="identifiers-tax" />));
  expect(state.read.mock.lastCall?.[0]).toMatchObject({
    operatingOrganizationId: "org",
    companyCodeId: "company",
  });
  expect(state.read.mock.lastCall?.[0]).not.toHaveProperty("asOf");
});
it("sends the explicit historical date when selected", async () => {
  window.history.replaceState({}, "", "/?asOf=2026-09-12");
  await act(async () => root.render(<CommonSection code="identifiers-tax" />));
  expect(state.read.mock.lastCall?.[0]).toMatchObject({
    asOf: "2026-09-12",
    operatingOrganizationId: "org",
    companyCodeId: "company",
  });
});
