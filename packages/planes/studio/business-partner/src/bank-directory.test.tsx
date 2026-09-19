// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHttpClient } from "@athyper/platform-api-client";
import { BankDirectoryWorkspace } from "./bank-directory";
const state = vi.hoisted(() => ({ http: undefined as unknown, canReview: true }));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => state.http,
  usePermissions: () => ({ has: (permission: string) => permission.endsWith(".publish") ? state.canReview : true }),
  readBrowserCsrfToken: () => "csrf",
}));
let container: HTMLDivElement, root: Root;
const transport = vi.fn<typeof fetch>();
const revision = {
  id: "revision",
  created_at: "2026-09-09",
  created_by: "maker",
  content_hash: "a".repeat(64),
  input_json: { schema: "source" },
  payload: {},
  validation_report: {
    valid: false,
    additions: [],
    changes: [],
    retirements: [],
    issues: [
      {
        code: "REVIEW_REQUIRED",
        record: "bank",
        message: "Resolve the identity",
      },
    ],
  },
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  transport.mockReset();
  state.canReview = true;
  state.http = createHttpClient({ fetch: transport, csrfToken: () => "csrf" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function mount() {
  transport
    .mockResolvedValueOnce(Response.json({ revisions: [revision] }))
    .mockResolvedValueOnce(
      Response.json({
        expected: { version: 2, releaseId: "release", hash: "a".repeat(64) },
        planes: [
          {
            plane: "neon",
            state: "pending_release",
            version: 1,
            hash: "b".repeat(64),
          },
          {
            plane: "mesh",
            state: "hash_mismatch",
            version: 2,
            hash: "c".repeat(64),
          },
        ],
        deliveries: [],
        checkedAt: "now",
      }),
    );
  await act(async () => root.render(<BankDirectoryWorkspace />));
}
it("shows pending consumers and hash conflicts without marking them current", async () => {
  await mount();
  expect(container.textContent).toContain("pending release");
  expect(container.textContent).toContain("hash mismatch");
  expect(container.textContent).toContain("Expected release 2");
});
it("loads revision evidence and blocks approval for unresolved imports", async () => {
  await mount();
  transport.mockResolvedValueOnce(Response.json(revision));
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Needs correction"))!
      .click(),
  );
  expect(container.textContent).toContain("Resolve the identity");
  expect(
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Approve and publish",
    )!.disabled,
  ).toBe(true);
});
it("shows authorization failures and does not invent release data", async () => {
  transport.mockResolvedValue(
    Response.json({ error: "FORBIDDEN" }, { status: 403 }),
  );
  await act(async () => root.render(<BankDirectoryWorkspace />));
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).not.toContain("Expected release");
});

it("explains author-only access and keeps review controls disabled", async () => {
  state.canReview = false;
  await mount();
  transport.mockResolvedValueOnce(Response.json({ ...revision, validation_report: { ...revision.validation_report, valid: true, issues: [] } }));
  await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent?.includes("Needs correction"))!.click());
  expect(container.textContent).toContain("cannot approve or reject");
  expect([...container.querySelectorAll("button")].find(b => b.textContent === "Approve and publish")!.disabled).toBe(true);
  expect([...container.querySelectorAll("button")].find(b => b.textContent === "Reject revision")!.disabled).toBe(true);
  expect(container.querySelector('form[action*="step-up"]')).toBeNull();
});
