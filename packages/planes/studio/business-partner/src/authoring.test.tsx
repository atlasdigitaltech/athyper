// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHttpClient } from "@athyper/platform-api-client";
import { BusinessPartnerAuthoringWorkspace } from "./authoring";

const state = vi.hoisted(() => ({ http: undefined as unknown }));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => state.http,
}));
let container: HTMLDivElement, root: Root;
const transport = vi.fn<typeof fetch>();
const revision = {
  id: "revision-1",
  bundleCode: "business_partner.onboarding",
  semanticVersion: "2.2.0",
  bundleHash: "a".repeat(64),
  createdBy: "maker",
  createdAt: "2026-09-05T00:00:00Z",
  bundle: {},
  targetPlanes: ["studio", "neon", "mesh"],
};
const simulation = {
  compatible: true,
  bundleCode: revision.bundleCode,
  semanticVersion: revision.semanticVersion,
  planes: [],
};
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  transport.mockReset();
  transport.mockResolvedValueOnce(new Response(JSON.stringify({error:"No local preview"}), {status:404,headers:{"content-type":"application/json"}}));
  state.http = createHttpClient({ fetch: transport, csrfToken: () => "csrf" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<BusinessPartnerAuthoringWorkspace />));
  // Local preview discovery is a separate read, not part of a tested authoring command.
  transport.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
function button(text: string) {
  return [...container.querySelectorAll("button")].find(
    (node) => node.textContent === text,
  )!;
}
async function click(node: HTMLElement) {
  await act(async () => node.click());
}
async function input(node: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("requires simulation before save and invalidates it when consumer selection changes", async () => {
  expect(button("Save immutable revision").disabled).toBe(true);
  transport.mockResolvedValueOnce(Response.json(simulation));
  await click(button("Simulate proposed revision"));
  expect(button("Save immutable revision").disabled).toBe(false);
  await click(container.querySelector('input[type="checkbox"]')!);
  expect(button("Save immutable revision").disabled).toBe(true);
  expect(transport).toHaveBeenCalledTimes(1);
});
it("saves an immutable revision and shows the coordinate for an independent checker", async () => {
  transport
    .mockResolvedValueOnce(Response.json(simulation))
    .mockResolvedValueOnce(Response.json(revision));
  await click(button("Simulate proposed revision"));
  await click(button("Save immutable revision"));
  expect(container.textContent).toContain("Saved revision: revision-1");
  expect(container.textContent).toContain("independent checker");
  expect(button("Save immutable revision").disabled).toBe(true);
});
it("requires revision review, retains a denied approval, and retries the same command key", async () => {
  transport.mockResolvedValueOnce(Response.json(revision));
  const field = container.querySelector("form input") as HTMLInputElement;
  await input(field, revision.id);
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(button("Approve and queue release").disabled).toBe(true);
  const checkboxes = container.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  await click(checkboxes[checkboxes.length - 1]!);
  transport.mockResolvedValueOnce(
    Response.json({ message: "Independent checker required" }, { status: 403 }),
  );
  await click(button("Approve and queue release"));
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).not.toContain("Compilation job:");
  transport.mockResolvedValueOnce(
    Response.json({
      release: { id: "release-1", releaseNo: 1, status: "approved" },
      jobId: "compile-1",
    }),
  );
  await click(button("Approve and queue release"));
  expect(container.textContent).toContain("Compilation job: compile-1");
  expect(
    new Headers(transport.mock.calls[1]![1]!.headers).get("idempotency-key"),
  ).toBe(
    new Headers(transport.mock.calls[2]![1]!.headers).get("idempotency-key"),
  );
  await input(field, "revision-2");
  expect(container.textContent).not.toContain("Compilation job:");
  expect(button("Approve and queue release")).toBeUndefined();
});
