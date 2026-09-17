// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createHttpClient } from "@athyper/platform-api-client";
import { WorkbenchEditor } from "./workbench-editor";
import { differences, editProperty } from "./workbench-edit-model";
import type { Inspection } from "./workbench-model";
const state = vi.hoisted(() => ({ http: undefined as unknown }));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => state.http,
}));
const id = "00000000-0000-4000-8000-000000000001";
const graph = {
  entity: { entityCode: "business_partner" },
  fields: [
    { id: "field", fieldKey: "name", validationSpec: { rules: ["preserve"] } },
  ],
  operations: [{ id: "op", permissionCode: "neon.partner.create" }],
  surfaces: [{ id: "s", surfaceKey: "form", title: "Form" }],
  surfaceFieldBindings: [
    {
      id: "b",
      bindingKey: "name",
      entityFieldId: "field",
      entitySurfaceId: "s",
      labelOverride: "Old label",
      displayConfig: { required: true, lookup: { code: "retained" } },
      visibilityRule: { preserve: true },
    },
  ],
  extension: { unknown: [1, 2] },
};
const initial: Inspection = {
  source: "draft",
  id,
  changeSetId: id,
  version: "4",
  status: "draft",
  targets: [],
  data: graph,
};
let node: HTMLDivElement, root: Root;
const transport = vi.fn<typeof fetch>(),
  saved = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  transport.mockReset();
  saved.mockReset();
  state.http = createHttpClient({ fetch: transport, csrfToken: () => "csrf" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
});
async function mount() {
  await act(async () =>
    root.render(
      <WorkbenchEditor
        inspection={initial}
        onSelect={() => {}}
        onGuardChange={() => {}}
        onSaved={saved}
      />,
    ),
  );
}
async function edit() {
  const input = node.querySelector('input[type="text"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "New label");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(label: string) {
  await act(async () =>
    [...node.querySelectorAll("button")]
      .find((b) => b.textContent === label)!
      .click(),
  );
}
it("saves with expected revision and verifies all unrelated configuration survives readback", async () => {
  let submitted: any;
  transport.mockImplementation(async (_url, init) => {
    if (init?.method === "PUT") {
      submitted = JSON.parse(String(init.body));
      return Response.json({
        id,
        revision: 5,
        preview: {
          state: "failed",
          savedRevision: 5,
          activeRevision: 3,
          error: "PREVIEW_DEPENDENCY_UNAVAILABLE",
        },
      });
    }
    return Response.json({
      changeSet: { id, revision: 5, status: "draft" },
      graph: editProperty(
        graph,
        "surfaceFieldBindings",
        0,
        "labelOverride",
        "New label",
      ),
    });
  });
  await mount();
  await edit();
  expect(node.textContent).toContain("Old label");
  await click("Save draft and check preview");
  expect(submitted.expectedRevision).toBe(4);
  expect(submitted.operations).toEqual(graph.operations);
  expect(submitted.fields).toEqual(graph.fields);
  expect(submitted.extension).toEqual(graph.extension);
  expect(submitted.surfaceFieldBindings[0].displayConfig).toEqual(
    graph.surfaceFieldBindings[0].displayConfig,
  );
  expect(node.textContent).toContain("Saved and verified");
  expect(node.textContent).toContain("PREVIEW_DEPENDENCY_UNAVAILABLE");
  expect(node.textContent).toContain("Active revision: 3");
  expect(saved).toHaveBeenCalledOnce();
});
it("retains local edits and disables resubmission on revision conflict", async () => {
  transport.mockResolvedValue(
    Response.json({ error: "CONFLICT" }, { status: 409 }),
  );
  await mount();
  await edit();
  await click("Save draft and check preview");
  expect(node.textContent).toContain("revision conflict");
  expect(
    (node.querySelector('input[type="text"]') as HTMLInputElement).value,
  ).toBe("New label");
  expect(
    [...node.querySelectorAll("button")].find(
      (b) => b.textContent === "Save draft and check preview",
    )?.disabled,
  ).toBe(true);
  expect(saved).not.toHaveBeenCalled();
});
it("does not declare success when readback loses unrelated content", async () => {
  transport.mockImplementation(async (_url, init) =>
    Response.json(
      init?.method === "PUT"
        ? { id, revision: 5 }
        : {
            changeSet: { id, revision: 5, status: "draft" },
            graph: { ...graph, operations: [] },
          },
    ),
  );
  await mount();
  await edit();
  await click("Save draft and check preview");
  expect(node.textContent).toContain("stored graph differs");
  expect(saved).not.toHaveBeenCalled();
});
it("only permits allowlisted leaves and compares keyed storage order without losing differences", () => {
  expect(() =>
    editProperty(graph, "surfaceFieldBindings", 0, "entityFieldId", "wrong"),
  ).toThrow("not supported");
  expect(graph.surfaceFieldBindings[0].labelOverride).toBe("Old label");
  expect(
    differences(
      {
        fields: [
          { id: "b", value: 2 },
          { id: "a", value: 1 },
        ],
      },
      {
        fields: [
          { id: "a", value: 1 },
          { id: "b", value: 2 },
        ],
      },
    ),
  ).toEqual([]);
  expect(
    differences(
      graph,
      editProperty(graph, "surfaceFieldBindings", 0, "helpText", "Help"),
    ),
  ).toHaveLength(1);
});
it("requires a fresh read after a save succeeds but verification is unavailable", async () => {
  transport.mockImplementation(async (_url, init) =>
    init?.method === "PUT"
      ? Response.json({ id, revision: 5 })
      : Response.json({ error: "UNAVAILABLE" }, { status: 503 }),
  );
  await mount();
  await edit();
  await click("Save draft and check preview");
  expect(node.textContent).toContain("previous save may have completed");
  expect(node.textContent).not.toContain("Saved and verified");
  expect(saved).not.toHaveBeenCalled();
  expect(
    [...node.querySelectorAll("button")].find(
      (b) => b.textContent === "Save draft and check preview",
    )?.disabled,
  ).toBe(true);
});

it("keeps the compact new-draft entry informational until explicitly opening the working draft", async () => {
  const select = vi.fn();
  transport.mockResolvedValue(Response.json({ id, status: "draft" }));
  await act(async () => root.render(<WorkbenchEditor compact inspection={{ ...initial, source: "release", status: "published" }} onSelect={select} onGuardChange={() => {}} onSaved={saved}/>));
  expect(node.querySelector("h3")).toBeNull();
  expect(node.querySelector("summary")?.textContent).toBe("+ New draft");
  await act(async () => node.querySelector("summary")!.click());
  expect(transport).not.toHaveBeenCalled();
  expect(node.textContent).toContain("one working draft");
  await act(async () => node.querySelector("button")!.click());
  expect(select).toHaveBeenCalledWith(`draft:${id}`);
});
