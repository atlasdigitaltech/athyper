// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CompositionEditor } from "./composition-editor";
import { compositionEdit } from "./composition-edit";
import type { Inspection } from "./workbench-model";
const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => mock,
}));
const graph = {
  surfaces: [
    {
      id: "s",
      surfaceKey: "form",
      title: "Form",
      layoutConfig: { renderer: "intake" },
    },
  ],
  fields: [{ id: "f", fieldKey: "requested_role" }],
  surfaceFieldBindings: [
    {
      id: "p",
      entitySurfaceId: "s",
      entityFieldId: "f",
      labelOverride: "Role",
      widgetKey: "choice_cards",
      columnSpan: 12,
      unknown: { keep: true },
    },
  ],
  other: { preserve: true },
};
const inspection: Inspection = {
  source: "draft",
  id: "draft",
  version: "4",
  status: "draft",
  targets: [],
  data: graph,
};
const select = { source: "draft:draft", node: "surfaceFieldBindings:p" };
async function fixture() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const saved = vi.fn();
  await act(async () =>
    root.render(
      <CompositionEditor
        inspection={inspection}
        selection={select}
        onSaved={saved}
        onGuardChange={() => {}}
      />,
    ),
  );
  return {
    host,
    saved,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
async function change(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>(
    "#composition-labelOverride",
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(host: HTMLElement, name: string) {
  await act(async () => {
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === name)!
      .click();
  });
}
it("patches by stable identity, preserves unknown fields and rejects unsupported edits", () => {
  const out = compositionEdit(
    graph,
    "surfaceFieldBindings",
    "p",
    "labelOverride",
    "New",
  );
  expect((out.surfaceFieldBindings as any[])[0].unknown).toEqual({
    keep: true,
  });
  expect(out.other).toBe(graph.other);
  expect(() =>
    compositionEdit(graph, "surfaceFieldBindings", "p", "columnSpan", 6),
  ).toThrow("full-width");
  expect(() =>
    compositionEdit(graph, "surfaceFieldBindings", "p", "widgetKey", "text"),
  ).toThrow("not supported");
});
it("saves complete graph with expected revision, rereads and supports undo", async () => {
  const f = await fixture();
  try {
    await change(f.host, "New role");
    await click(f.host, "Undo");
    expect(
      f.host.querySelector<HTMLInputElement>("#composition-labelOverride")!
        .value,
    ).toBe("Role");
    await change(f.host, "New role");
    const updated = compositionEdit(
      graph,
      "surfaceFieldBindings",
      "p",
      "labelOverride",
      "New role",
    );
    mock.request
      .mockReset()
      .mockResolvedValueOnce({ revision: 5 })
      .mockResolvedValueOnce({ ...inspection, version: "5", data: updated });
    await click(f.host, "Save draft");
    expect(mock.request.mock.calls[0]![1].body).toEqual({
      ...updated,
      expectedRevision: 4,
    });
    expect(f.saved).toHaveBeenCalledWith(
      expect.objectContaining({ version: "5" }),
    );
    expect(f.host.textContent).toContain("Saved and reread");
  } finally {
    await f.close();
  }
});
it("retains local edits and blocks retry on conflict; comparison does not overwrite", async () => {
  const f = await fixture();
  try {
    await change(f.host, "Local");
    mock.request
      .mockReset()
      .mockRejectedValueOnce(new Error("Revision conflict"));
    await click(f.host, "Save draft");
    expect(
      f.host.querySelector<HTMLInputElement>("#composition-labelOverride")!
        .value,
    ).toBe("Local");
    expect(
      [...f.host.querySelectorAll("button")].find(
        (b) => b.textContent === "Save draft",
      )!.disabled,
    ).toBe(true);
    mock.request.mockResolvedValueOnce({ ...inspection, version: "6" });
    await click(f.host, "Compare latest stored draft");
    expect(f.host.textContent).toContain("Stored revision 6");
    expect(
      f.host.querySelector<HTMLInputElement>("#composition-labelOverride")!
        .value,
    ).toBe("Local");
    expect(f.saved).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});
it("blocks an acknowledged save when reread content differs", async () => {
  const f = await fixture();
  try {
    await change(f.host, "Local");
    mock.request
      .mockReset()
      .mockResolvedValueOnce({ revision: 5 })
      .mockResolvedValueOnce({ ...inspection, version: "5" });
    await click(f.host, "Save draft");
    expect(f.host.textContent).toContain("does not match");
    expect(f.saved).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

it("keeps the loaded comparison base after a verified save", async () => {
  const f = await fixture();
  try {
    await change(f.host, "Reviewed role");
    const updated = compositionEdit(
      graph,
      "surfaceFieldBindings",
      "p",
      "labelOverride",
      "Reviewed role",
    );
    mock.request
      .mockReset()
      .mockResolvedValueOnce({ revision: 5 })
      .mockResolvedValueOnce({ ...inspection, version: "5", data: updated });
    await click(f.host, "Save draft");
    expect(f.host.textContent).toContain("loaded draft · revision 4");
    expect(f.host.textContent).toContain("Changes (1)");
  } finally {
    await f.close();
  }
});

it("reloads after a conflict only with confirmed discard and retains unrelated configuration", async () => {
  const f = await fixture();
  const confirm = vi.spyOn(window, "confirm");
  try {
    await change(f.host, "Local edit");
    mock.request.mockReset().mockRejectedValueOnce(new Error("Revision conflict"));
    await click(f.host, "Save draft");
    confirm.mockReturnValue(false);
    await click(f.host, "Reload stored draft");
    expect(mock.request).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    mock.request.mockResolvedValueOnce({...inspection, version:"6"});
    await click(f.host, "Reload stored draft");
    expect(f.host.querySelector<HTMLInputElement>("#composition-labelOverride")!.value).toBe("Role");
    expect(f.saved).toHaveBeenLastCalledWith(expect.objectContaining({version:"6",data:graph}));
    await change(f.host, "Next label");
    const updated = compositionEdit(graph,"surfaceFieldBindings","p","labelOverride","Next label");
    mock.request.mockResolvedValueOnce({revision:7}).mockResolvedValueOnce({...inspection,version:"7",data:updated});
    await click(f.host,"Save draft");
    expect(mock.request.mock.calls.at(-2)![1].body).toEqual({...updated, expectedRevision:6});
  } finally {confirm.mockRestore(); await f.close();}
});
