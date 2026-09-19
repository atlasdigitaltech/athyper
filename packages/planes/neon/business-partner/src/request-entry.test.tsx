// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BusinessPartnerRequestContent as BusinessPartnerRequestEntry } from "./request-entry";
import { businessPartnerRoleSurface } from "../../../../../server/db/scripts/provisioning/intake-choice-surfaces";
const request = vi.hoisted(() => vi.fn());
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => ({ request }),
  usePermissions: () => ({ has: () => true }),
}));
vi.mock("@athyper/platform-surface-kit", () => ({
  PageSurface: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("./index", () => ({
  NewBusinessPartnerRequest: () => <p>Supplier details</p>,
}));
vi.mock("./customer-request", () => ({
  NewCustomerRequest: () => <p>Customer details</p>,
}));
vi.mock("./role-extension-experience", () => ({
  GovernedBusinessPartnerRoleExtension: ({
    businessPartnerId,
    requestedRole,
  }: any) => (
    <p>
      Extend {businessPartnerId} as {requestedRole}
    </p>
  ),
}));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  request.mockReset();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const button = (text: string) =>
  [...container.querySelectorAll("button")].find(
    (node) => node.textContent === text,
  )!;
async function render(role?: "supplier" | "customer") {
  await act(async () =>
    root.render(
      <BusinessPartnerRequestEntry
        initialRole={role}
        surface={businessPartnerRoleSurface}
      />,
    ),
  );
}
async function input(value: string) {
  const node = container.querySelector<HTMLInputElement>("#bp-partner-search")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function search() {
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
function results(rows: readonly unknown[] = []) {
  request
    .mockResolvedValueOnce({
      surface: { search: { minimumQueryLength: 2 } },
      limits: { defaultPageSize: 20, countMode: "none" },
    })
    .mockResolvedValueOnce({ rows, pagination: { hasNext: false } });
}
it("requires a role and successful partner search before new onboarding", async () => {
  await render();
  expect(container.querySelector("form")).toBeNull();
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('input[value="customer"]')!
      .click(),
  );
  expect(button("New customer request")).toBeUndefined();
  await input("Acme");
  results();
  await search();
  await act(async () => button("New customer request").click());
  expect(container.textContent).toContain("Customer details");
});
it("searches across roles and preserves the selected role for an existing partner", async () => {
  await render("supplier");
  await input("Acme");
  results([
    { id: "existing-customer", values: { name: "Acme", code: "ACME" } },
  ]);
  await search();
  expect(request.mock.calls[1]![1].query).toMatchObject({ search: "Acme" });
  expect(request.mock.calls[1]![1].query).not.toHaveProperty("partnerRole");
  await act(async () => button("Use existing partner").click());
  expect(container.textContent).toContain(
    "Extend existing-customer as supplier",
  );
});
it("does not treat a failed search as no matches", async () => {
  await render("supplier");
  await input("Acme");
  request.mockRejectedValueOnce(new Error("Search unavailable"));
  await search();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Search unavailable",
  );
  expect(button("New supplier request")).toBeUndefined();
});
it("invalidates prior matches when the search text changes", async () => {
  await render("supplier");
  await input("Acme");
  results();
  await search();
  expect(button("New supplier request")).toBeDefined();
  await input("Different");
  expect(button("New supplier request")).toBeUndefined();
});
