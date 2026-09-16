// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createHttpClient } from "@athyper/platform-api-client";
import { WorkbenchPublication } from "./workbench-publication";
import type { Inspection } from "./workbench-model";
const state = vi.hoisted(() => ({ http: undefined as unknown }));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => state.http,
  readBrowserCsrfToken: () => "test-csrf",
}));
const id = "00000000-0000-4000-8000-000000000001",
  release = "00000000-0000-4000-8000-000000000002";
const initial: Inspection = {
  id,
  source: "draft",
  status: "approved",
  version: "8",
  targets: [],
  data: { entity: { entityCode: "business_partner" } },
};
let node: HTMLDivElement, root: Root;
const fetcher = vi.fn<typeof fetch>(),
  select = vi.fn(),
  saved = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  fetcher.mockReset();
  select.mockReset();
  saved.mockReset();
  state.http = createHttpClient({ fetch: fetcher, csrfToken: () => "csrf" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
});
async function render(inspection = initial, canAct = () => true) {
  await act(async () =>
    root.render(
      <WorkbenchPublication
        inspection={inspection}
        onSelect={select}
        onSaved={saved}
        canAct={canAct}
        onBusyChange={() => {}}
      />,
    ),
  );
}
async function click(label: string) {
  await act(async () =>
    [...node.querySelectorAll("button")]
      .find((b) => b.textContent === label)!
      .click(),
  );
}
it("publishes only the approved saved revision and switches to returned release without claiming activation", async () => {
  fetcher
    .mockResolvedValueOnce(
      Response.json({
        release: { id: release },
        artifact: { contractHash: "hash" },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        release: {
          id: release,
          changeSetId: id,
          contractHash: "hash",
          targetPlanes: ["neon"],
          releaseNo: 1,
        },
        graph: initial.data,
      }),
    );
  await render();
  await click("Publish approved revision");
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
    expectedRevision: 8,
    targetPlanes: ["neon"],
  });
  expect(select).toHaveBeenCalledWith(`release:${release}`);
  expect(node.textContent).not.toContain("Confirmed active");
});
it("blocks publication while local edits exist", async () => {
  await render(initial, () => false);
  await click("Publish approved revision");
  expect(fetcher).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Save or discard local edits");
});
it("requires explicit reviewer acknowledgement before approval", async () => {
  fetcher.mockImplementation(async (_url, init) =>
    Response.json(
      init?.method === "POST"
        ? {}
        : {
            changeSet: { id, status: "approved", revision: 9 },
            graph: initial.data,
          },
    ),
  );
  await render({ ...initial, status: "in_review" });
  const button = [...node.querySelectorAll("button")].find(
    (b) => b.textContent === "Approve saved revision",
  )!;
  expect(button.disabled).toBe(true);
  await act(async () =>
    (node.querySelector('input[type="checkbox"]') as HTMLInputElement).click(),
  );
  await click("Approve saved revision");
  expect(fetcher.mock.calls[0]?.[0]).toContain("/approve");
  expect(saved).toHaveBeenCalledOnce();
});
it("shows active only from matching target evidence and never marks browser verification complete", async () => {
  fetcher.mockResolvedValue(
    Response.json({
      releaseId: release,
      contractHash: "hash",
      observedAt: "2026-09-16",
      targets: [
        {
          plane: "neon",
          state: "active",
          releaseId: release,
          descriptorHash: "descriptor",
          appliedReleaseId: "applied",
          contractHash: "hash",
          descriptorSourceHash: "hash",
        },
      ],
    }),
  );
  await render({ ...initial, id: release, source: "release", hash: "hash" });
  expect(node.textContent).toContain("Confirmed active");
  expect(node.textContent).toContain("Browser verification: not recorded");
});
it("clears activation confirmation on a failed refresh", async () => {
  fetcher
    .mockResolvedValueOnce(
      Response.json({
        releaseId: release,
        contractHash: "hash",
        targets: [{ plane: "neon", state: "active" }],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ error: "unavailable" }, { status: 503 }),
    );
  await render({ ...initial, id: release, source: "release", hash: "hash" });
  await click("Check target activation");
  expect(node.textContent).not.toContain("Confirmed active");
  expect(node.textContent).toContain("Activation unverified");
});
it("does not select a returned release belonging to a different change set", async () => {
  fetcher
    .mockResolvedValueOnce(
      Response.json({
        release: { id: release },
        artifact: { contractHash: "hash" },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        release: {
          id: release,
          changeSetId: "other",
          contractHash: "hash",
          targetPlanes: ["neon"],
        },
        graph: initial.data,
      }),
    );
  await render();
  await click("Publish approved revision");
  expect(select).not.toHaveBeenCalled();
  expect(node.textContent).toContain("coordinates do not match");
});
it("reconciles a timed-out publication by reading its durable release without reposting", async () => {
  fetcher.mockResolvedValueOnce(
    Response.json({ error: "timeout" }, { status: 504 }),
  );
  await render();
  await click("Publish approved revision");
  fetcher
    .mockResolvedValueOnce(
      Response.json({
        changeSet: { id, status: "published", revision: 9 },
        graph: initial.data,
      }),
    )
    .mockResolvedValueOnce(Response.json([{ id: release, changeSetId: id }]))
    .mockResolvedValueOnce(
      Response.json({
        release: {
          id: release,
          changeSetId: id,
          contractHash: "hash",
          targetPlanes: ["neon"],
        },
        graph: initial.data,
      }),
    );
  await click("Reload publication state");
  expect(select).toHaveBeenCalledWith(`release:${release}`);
  expect(
    fetcher.mock.calls.filter((c) => c[1]?.method === "POST"),
  ).toHaveLength(1);
});
it("does not trust an active label with mismatched target hash", async () => {
  fetcher.mockResolvedValue(
    Response.json({
      releaseId: release,
      contractHash: "hash",
      targets: [
        {
          plane: "neon",
          state: "active",
          releaseId: release,
          contractHash: "other",
          descriptorSourceHash: "hash",
          descriptorHash: "d",
          appliedReleaseId: "a",
        },
      ],
    }),
  );
  await render({ ...initial, id: release, source: "release", hash: "hash" });
  expect(node.textContent).not.toContain("Confirmed active:");
  expect(node.textContent).toContain("incomplete or does not match");
});

it("offers CSRF-bound interactive step-up while preventing loss of local edits", async () => {
  await render(initial, () => false);
  const form = node.querySelector('form[action^="/api/auth/step-up/start"]')!;
  const blocked = new Event("submit", { bubbles: true, cancelable: true });
  await act(async () => {
    form.dispatchEvent(blocked);
  });
  expect(blocked.defaultPrevented).toBe(true);
  await render(initial);
  const allowed = new Event("submit", { bubbles: true, cancelable: true });
  await act(async () => {
    form.dispatchEvent(allowed);
  });
  expect(allowed.defaultPrevented).toBe(false);
  expect(
    (form.querySelector('input[name="csrfToken"]') as HTMLInputElement).value,
  ).toBe("test-csrf");
  expect(fetcher).not.toHaveBeenCalled();
});
