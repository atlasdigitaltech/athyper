import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  read: vi.fn(),
  http: {},
  summary: {
    identity: { id: "bp" },
    scope: {} as Record<string, string>,
    asOf: "2026-09-09",
  },
  roleLens: "all",
  identity: {
    scope: { tenantId: "tenant", principalId: "reader", authEpoch: 1 },
  },
}));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => mock.http,
  useSessionIdentity: () => mock.identity,
}));
vi.mock("@athyper/platform-ui", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Skeleton: () => <p>Loading</p>,
}));
vi.mock("../business-partner-360-context", () => ({
  useBusinessPartner360: () => ({
    summary: mock.summary,
    roleLens: mock.roleLens,
  }),
}));
vi.mock(
  "../business-partner-360-explainability-client",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    createBusinessPartner360ExplainabilityClient: () => ({ read: mock.read }),
  }),
);
import { RequestsSection } from "./explainability-sections";
let dom: JSDOM, root: Root, host: HTMLElement;
const page = (name: string, nextCursor?: string) => ({
  schemaVersion: 1,
  sectionCode: "requests",
  state: "ready",
  data: { items: [{ id: name, requestNo: name }], nextCursor },
});
const render = () => act(async () => root.render(<RequestsSection />));
const click = (label: string) =>
  act(async () => {
    Array.from(host.querySelectorAll("button"))
      .find((button) => button.textContent === label)!
      .click();
  });
beforeEach(() => {
  dom = new JSDOM("<div id='root'></div>");
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  host = document.getElementById("root")!;
  root = createRoot(host);
  mock.read.mockReset();
  mock.summary = { identity: { id: "bp" }, scope: {}, asOf: "2026-09-09" };
  mock.roleLens = "all";
  mock.identity.scope = {
    tenantId: "tenant",
    principalId: "reader",
    authEpoch: 1,
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});
it.each([
  "operatingOrganizationId",
  "companyCodeId",
  "legalEntityId",
  "roleLens",
  "asOf",
  "authEpoch",
  "principalId",
  "tenantId",
  "businessPartnerId",
])(
  "resets pagination and hides old results when %s changes without unmounting",
  async (coordinate) => {
    mock.read
      .mockResolvedValueOnce(page("Old first", "page-2"))
      .mockResolvedValueOnce(page("Old second", "page-3"));
    await render();
    await click("Load more");
    expect(mock.read.mock.calls[1]![0].cursor).toBe("page-2");
    expect(host.textContent).toContain("Old first");
    expect(host.textContent).toContain("Old second");
    let resolve!: (value: ReturnType<typeof page>) => void;
    mock.read.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    if (coordinate === "roleLens") mock.roleLens = "supplier";
    else if (coordinate === "asOf") mock.summary.asOf = "2026-09-10";
    else if (coordinate === "businessPartnerId")
      mock.summary.identity.id = "other-bp";
    else if (coordinate === "authEpoch") mock.identity.scope.authEpoch++;
    else if (coordinate === "principalId" || coordinate === "tenantId")
      mock.identity.scope[coordinate] = "other";
    else mock.summary.scope = { [coordinate]: "other" };
    await render();
    expect(mock.read.mock.calls[2]![0].cursor).toBeUndefined();
    expect(host.textContent).toBe("Loading");
    await act(async () => resolve(page("New scope")));
    expect(host.textContent).toContain("New scope");
    expect(host.textContent).not.toContain("Old");
  },
);
it("ignores late responses even when the transport does not honor abort", async () => {
  let resolve!: (value: ReturnType<typeof page>) => void;
  mock.read.mockResolvedValueOnce(page("Old first", "page-2"));
  await render();
  mock.read.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  await click("Load more");
  const signal = mock.read.mock.calls[1]![1] as AbortSignal;
  mock.summary.scope = { operatingOrganizationId: "other" };
  mock.read.mockResolvedValueOnce(page("New scope"));
  await render();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(page("Late old page")));
  expect(host.textContent).toContain("New scope");
  expect(host.textContent).not.toContain("Late old page");
});
it("retains current results and retries a failed next page", async () => {
  mock.read
    .mockResolvedValueOnce(page("First", "page-2"))
    .mockRejectedValueOnce(new Error("Offline"));
  await render();
  await click("Load more");
  expect(host.textContent).toContain("First");
  expect(host.textContent).toContain("Unable to load more results");
  mock.read.mockResolvedValueOnce(page("Second"));
  await click("Try again");
  expect(mock.read.mock.calls[2]![0].cursor).toBe("page-2");
  expect(host.textContent).toContain("First");
  expect(host.textContent).toContain("Second");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("returns to the first page when revisiting a previous scope", async () => {
  mock.read
    .mockResolvedValueOnce(page("Original", "page-2"))
    .mockResolvedValueOnce(page("Original second"));
  await render();
  await click("Load more");
  mock.summary.scope = { operatingOrganizationId: "other" };
  mock.read.mockResolvedValueOnce(page("Other scope"));
  await render();
  mock.summary.scope = {};
  mock.read.mockResolvedValueOnce(page("Original refreshed"));
  await render();
  expect(mock.read.mock.calls[3]![0].cursor).toBeUndefined();
  expect(host.textContent).toContain("Original refreshed");
  expect(host.textContent).not.toContain("Original second");
});
