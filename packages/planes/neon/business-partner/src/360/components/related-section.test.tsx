import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { parseEntityRecordPresentation } from "@athyper/contract-platform-entity-runtime";
const mock = vi.hoisted(() => ({
  read: vi.fn(),
  summary: {} as any,
  identity: {
    scope: { tenantId: "tenant-a", principalId: "reader", authEpoch: 1 },
  },
  http: {},
}));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => mock.http,
  useSessionIdentity: () => mock.identity,
}));
vi.mock("@athyper/platform-shell", () => ({
  useRecordFooterSources: () => {},
}));
vi.mock("@athyper/platform-ui", async (importOriginal) => ({
  ...await importOriginal<any>(),
  Card: ({ children }: any) => <div>{children}</div>,
  Skeleton: () => <p>Loading</p>,
}));
vi.mock(
  "@athyper/platform-entity-form-detail",
  async () =>
    await import("../../../../../../platform/entity/runtime/form-detail/src/related-record"),
);
vi.mock("../business-partner-360-context", () => ({
  useBusinessPartner360: () => ({ summary: mock.summary, roleLens: "all" }),
}));
vi.mock("../business-partner-360-section-client", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  createBusinessPartner360SectionClient: () => ({ read: mock.read }),
}));
import { RelatedSection } from "./related-section";
const config = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../../../server/db/scripts/provisioning/config/business-partner-record-presentation.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
let dom: JSDOM, root: Root, host: HTMLElement;
const page = (items: any[], nextCursor?: string) => ({
  schemaVersion: 1,
  sectionCode: "contacts",
  state: "ready",
  data: { items, nextCursor },
  redactions: [],
  provenance: [],
});
beforeEach(() => {
  dom = new JSDOM("<div id='root'></div>");
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  host = document.getElementById("root")!;
  root = createRoot(host);
  mock.read.mockReset();
  mock.identity.scope.authEpoch = 1;
  mock.summary = {
    completeness: {readOnly: false, required: []},
    identity: { id: "bp" },
    scope: {},
    asOf: "2026-09-09",
    sections: [{ code: "contacts", authorization: "granted" }],
    recordHeader: {
      related: parseEntityRecordPresentation(config.recordPresentation).related,
      sections: [{ key: "contacts", label: "Contacts" }],
    },
    primaryContact: { id: "primary", primary: true },
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});
describe("metadata related section loading", () => {
  it("finds the primary record beyond page one and uses its precise channel verification", async () => {
    mock.read
      .mockResolvedValueOnce(
        page([{ id: "other", displayName: "Other" }], "page-2"),
      )
      .mockResolvedValueOnce(
        page([
          {
            id: "primary",
            displayName: "Primary",
            channels: [
              { type: "email", value: "a@example.test", verified: false },
            ],
          },
        ]),
      );
    await act(async () =>
      root.render(<RelatedSection code="contacts" compact />),
    );
    expect(mock.read).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Not verified");
    expect(host.textContent).not.toContain("Other");
  });
  it("shows retry with the real request reference and then recovers", async () => {
    mock.read
      .mockRejectedValueOnce({ status: 500, requestId: "req-123" })
      .mockResolvedValueOnce(page([{ id: "ok", displayName: "Recovered" }]));
    await act(async () => root.render(<RelatedSection code="contacts" />));
    expect(host.textContent).toContain("req-123");
    await act(async () => host.querySelector("button")!.click());
    expect(host.textContent).toContain("Recovered");
  });
  it("does not label a non-primary contact as primary", async () => {
    mock.summary.primaryContact.primary = false;
    await act(async () => root.render(<RelatedSection code="contacts" compact />));
    expect(mock.read).not.toHaveBeenCalled();
    expect(host.textContent).toBe("No primary contact assigned");
  });
  it("does not query a restricted section", async () => {
    mock.summary.sections[0].authorization = "restricted";
    await act(async () => root.render(<RelatedSection code="contacts" />));
    expect(mock.read).not.toHaveBeenCalled();
    expect(host.textContent).toBe("Restricted");
  });
  it("discards late responses after authorization changes", async () => {
    let resolve!: (v: any) => void;
    mock.read
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        }),
      )
      .mockResolvedValueOnce(
        page([{ id: "new", displayName: "Current access" }]),
      );
    await act(async () => root.render(<RelatedSection code="contacts" />));
    mock.identity.scope.authEpoch++;
    await act(async () => root.render(<RelatedSection code="contacts" />));
    await act(async () =>
      resolve(page([{ id: "old", displayName: "Old access" }])),
    );
    expect(host.textContent).toContain("Current access");
    expect(host.textContent).not.toContain("Old access");
  });
});
