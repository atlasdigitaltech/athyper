// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHttpClient } from "@athyper/platform-api-client";
import {
  BusinessPartnerInspection,
  BusinessPartnerWorkbench,
} from "./workbench";
import { operationTrace, parseInspection } from "./workbench-model";
const state = vi.hoisted(() => ({ http: undefined as unknown }));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => state.http,
}));
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002";
const fixture = (id = a, label = "Stored legal name") => ({
  release: {
    id,
    entityCode: "business_partner",
    releaseNo: 7,
    contractHash: "a".repeat(64),
    targetPlanes: ["neon"],
    publishedAt: "2026-09-16",
  },
  graph: {
    entity: { entityCode: "business_partner" },
    fields: [{ id: "field", fieldKey: label, dataType: "string" }],
    surfaces: [],
    operations: [],
  },
});
let node: HTMLDivElement, root: Root;
const transport = vi.fn<typeof fetch>();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  transport.mockReset();
  state.http = createHttpClient({ fetch: transport });
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
});
async function render(
  selection = `release:${a}`,
  tab: "model" | "validation" = "model",
) {
  await act(async () =>
    root.render(
      <BusinessPartnerWorkbench selection={selection} onSelect={() => {}}>
        <BusinessPartnerInspection tab={tab} />
      </BusinessPartnerWorkbench>,
    ),
  );
}
it("uses only GETs and renders the selected stored release without claiming target activation", async () => {
  transport.mockImplementation(async (url) =>
    Response.json(String(url).endsWith(`/releases/${a}`) ? fixture() : []),
  );
  await render();
  expect(node.textContent).toContain("Stored legal name");
  expect(node.textContent).toContain("Published source release");
  expect(node.textContent).toContain("Activation unverified");
  await render(`release:${a}`, "validation");
  expect(node.textContent).toContain(`Source: release · version 7 · ${a}`);
  expect(
    transport.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET"),
  ).toBe(true);
});
it("does not display a previous response after selecting another release", async () => {
  let resolveFirst!: (response: Response) => void;
  transport.mockImplementation(async (url) =>
    String(url).endsWith(`/releases/${a}`)
      ? new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        })
      : Response.json(
          String(url).endsWith(`/releases/${b}`)
            ? fixture(b, "Second release")
            : [],
        ),
  );
  await render();
  await render(`release:${b}`);
  expect(node.textContent).toContain("Second release");
  await act(async () =>
    resolveFirst(Response.json(fixture(a, "Stale release"))),
  );
  expect(node.textContent).not.toContain("Stale release");
  expect(node.textContent).toContain("Second release");
});
it("clears previous data when a selected read is denied", async () => {
  transport.mockImplementation(async (url) =>
    String(url).endsWith(`/releases/${b}`)
      ? Response.json({ error: "FORBIDDEN" }, { status: 403 })
      : Response.json(String(url).endsWith(`/releases/${a}`) ? fixture() : []),
  );
  await render();
  await render(`release:${b}`);
  expect(node.textContent).not.toContain("Stored legal name");
  expect(node.textContent).toContain("Access denied");
});
it("rejects wrong identity and wrong entity responses", () => {
  expect(() => parseInspection(fixture(b), "release", a)).toThrow(
    "does not match",
  );
  const wrong = fixture();
  wrong.graph.entity.entityCode = "invoice";
  expect(() => parseInspection(wrong, "release", a)).toThrow(
    "not Business Partner",
  );
});
it("keeps scope requirements plane-specific and retains headless operations", () => {
  const trace = operationTrace({
    operations: [{ id: "op", operationKey: "submit" }],
    operationPermissions: [
      {
        entityOperationId: "op",
        targetPlane: "neon",
        permissionCode: "neon.case.submit",
      },
      {
        entityOperationId: "op",
        targetPlane: "mesh",
        permissionCode: "mesh.case.submit",
      },
    ],
    operationScopeBindings: [
      {
        entityOperationId: "op",
        targetPlane: "neon",
        scopeKind: "company_code",
      },
      {
        entityOperationId: "op",
        targetPlane: "mesh",
        scopeKind: "network_account",
      },
    ],
  });
  expect(trace[0]?.scopes).toEqual([
    { entityOperationId: "op", targetPlane: "neon", scopeKind: "company_code" },
  ]);
  expect(trace[1]?.surfaces).toContain("Headless");
});

it("verifies drawer selections before replacing the workspace and refreshes only the catalog", async () => {
  const select = vi.fn();
  transport.mockImplementation(async (url) => {
    const path = String(url);
    if (path.endsWith(`/releases/${a}`)) return Response.json(fixture());
    if (path.endsWith(`/releases/${b}`))
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    if (path.endsWith("/inspection/releases"))
      return Response.json([
        fixture().release,
        { ...fixture(b).release, releaseNo: 8 },
      ]);
    return Response.json([]);
  });
  await act(async () =>
    root.render(
      <BusinessPartnerWorkbench
        compositionMode
        selection={`release:${a}`}
        onSelect={select}
      >
        <BusinessPartnerInspection tab="model" />
      </BusinessPartnerWorkbench>,
    ),
  );
  const reads = () =>
    transport.mock.calls.filter(([url]) =>
      String(url).endsWith(`/releases/${a}`),
    ).length;
  const initialReads = reads();
  await act(async () =>
    node
      .querySelector<HTMLButtonElement>(".a-context-selection__trigger")!
      .click(),
  );
  await act(async () =>
    Array.from(document.querySelectorAll("button"))
      .find((b) => b.getAttribute("aria-label") === "Refresh list")!
      .click(),
  );
  expect(reads()).toBe(initialReads);
  await act(async () =>
    document
      .querySelector<HTMLInputElement>(`input[value="release:${b}"]`)!
      .click(),
  );
  expect(select).not.toHaveBeenCalled();
  await act(async () =>
    Array.from(document.querySelectorAll("button"))
      .find((b) => b.textContent === "Open version")!
      .click(),
  );
  expect(select).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Stored legal name");
  expect(document.querySelector("[role=dialog]")).not.toBeNull();
});

it("explains MFA-required reads without claiming the author permission is missing", async () => {
  transport.mockResolvedValue(
    Response.json(
      {
        type: "urn:athyper:problem:authorization",
        title: "Access denied",
        status: 403,
        code: "MFA_REQUIRED",
      },
      { status: 403, headers: { "content-type": "application/problem+json" } },
    ),
  );
  await render();
  expect(node.textContent).toContain("MFA verification is required");
  expect(node.textContent).not.toContain("read/author permission");
});
