import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { NeonOperatingOrganization } from "@athyper/platform-api-client";
import { WorkspaceContextControl } from "./workspace-context-control";

let dom: JSDOM, root: Root, host: HTMLElement;
beforeEach(() => {
  dom = new JSDOM("<div id='root'></div>");
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  host = document.getElementById("root")!;
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});

const org = (id: string, name: string): NeonOperatingOrganization => ({
  id,
  code: id,
  displayName: name,
  organizationKind: "shared_operations",
  path: [name],
  capabilities: ["procurement"],
  procurementProfileConfigured: true,
  salesProfileConfigured: false,
  companyAssignments: [],
  defaults: {},
});

it("renders the precomputed summary and stays a readonly summary when not editable", async () => {
  await act(async () =>
    root.render(
      <WorkspaceContextControl
        mode="readonly"
        status="ready"
        summary="Company: UK01 · Operating organization: Procurement"
        onPendingChange={() => {}}
        onApply={() => {}}
      />,
    ),
  );
  expect(host.textContent).toBe(
    "Company: UK01 · Operating organization: Procurement",
  );
  expect(host.querySelector("details")).toBeNull();
});

it("renders nothing when not_applicable", async () => {
  await act(async () =>
    root.render(
      <WorkspaceContextControl
        mode="not_applicable"
        status="ready"
        summary="Tenant-wide"
        onPendingChange={() => {}}
        onApply={() => {}}
      />,
    ),
  );
  expect(host.textContent).toBe("");
});

it("shows a resolving status without a guessed selection", async () => {
  await act(async () =>
    root.render(
      <WorkspaceContextControl
        mode="editable"
        status="resolving"
        summary=""
        onPendingChange={() => {}}
        onApply={() => {}}
      />,
    ),
  );
  expect(host.querySelector('[role="status"]')).not.toBeNull();
  expect(host.querySelector("details")).toBeNull();
});

it("disables Apply until pending changes are supplied, and lists compatible organizations", async () => {
  const onApply = vi.fn();
  const onPendingChange = vi.fn();
  await act(async () =>
    root.render(
      <WorkspaceContextControl
        mode="editable"
        status="ready"
        summary="Org: Choose organization"
        organizations={[org("org-a", "Procurement A"), org("org-b", "Procurement B")]}
        onPendingChange={onPendingChange}
        onApply={onApply}
      />,
    ),
  );
  const buttons = Array.from(host.querySelectorAll("button")).map(
    (button) => button.textContent ?? "",
  );
  expect(buttons.some((text) => text.includes("Procurement A"))).toBe(true);
  expect(buttons.some((text) => text.includes("Procurement B"))).toBe(true);
  const applyButton = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Apply",
  ) as HTMLButtonElement;
  expect(applyButton).toBeDefined();
  await act(async () => applyButton.click());
  expect(onApply).toHaveBeenCalledTimes(1);
});

it("shows retry on error status and calls the retry handler", async () => {
  const retry = vi.fn();
  await act(async () =>
    root.render(
      <WorkspaceContextControl
        mode="editable"
        status="error"
        summary=""
        error="Operating-organization access is unavailable"
        retry={retry}
        onPendingChange={() => {}}
        onApply={() => {}}
      />,
    ),
  );
  const retryButton = host.querySelector("button") as HTMLButtonElement;
  expect(retryButton.textContent).toBe("Try again");
  await act(async () => retryButton.click());
  expect(retry).toHaveBeenCalledTimes(1);
});
