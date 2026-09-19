// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CompositionWorkspace } from "./composition-workspace";
import type { Inspection } from "./workbench-model";
it("supports keyboard selection, restores controlled selection and never renders mutation actions", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onSelect = vi.fn();
  const inspection: Inspection = {
    id: "release",
    source: "release",
    version: "2",
    status: "published",
    targets: [],
    data: {
      surfaces: [{ id: "s", title: "Details" }],
      surfaceSections: [{ id: "sec", title: "Identity", entitySurfaceId: "s" }],
      fields: [{ id: "f", fieldKey: "legal_name" }],
      surfaceFieldBindings: [
        {
          id: "p",
          entitySurfaceId: "s",
          entitySurfaceSectionId: "sec",
          entityFieldId: "f",
        },
      ],
    },
  };
  try {
    await act(async () =>
      root.render(
        <CompositionWorkspace inspection={inspection} onSelect={onSelect} />,
      ),
    );
    const nodes = host.querySelectorAll<HTMLElement>("[role=treeitem]");
    await act(async () => {
      nodes[0]!.focus();
      nodes[0]!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(nodes[1]);
    await act(async () =>
      nodes[1]!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(onSelect).toHaveBeenLastCalledWith({
      source: "release:release",
      node: "surfaceSections:sec",
    });
    await act(async () =>
      root.render(
        <CompositionWorkspace
          inspection={inspection}
          selection={{
            source: "release:release",
            node: "surfaceFieldBindings:p",
          }}
          onSelect={onSelect}
        />,
      ),
    );
    expect(
      host.querySelector("[aria-selected=true]")?.getAttribute("data-node"),
    ).toBe("surfaceFieldBindings:p");
    expect(host.querySelectorAll("input")).toHaveLength(1);
    expect(
      [...host.querySelectorAll("button")].some((b) =>
        /save|remove|publish/i.test(b.textContent || ""),
      ),
    ).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("searches technical keys with ancestors, preserves selection, and restores collapsed categories", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const inspection: Inspection = {
    id: "draft",
    source: "draft",
    version: "63",
    status: "approved",
    targets: [],
    data: {
      surfaces: [{ id: "s", surfaceKey: "partner_details", title: "Details" }],
      fields: [{ id: "f", fieldKey: "legal_name" }],
      surfaceFieldBindings: [
        {
          id: "p",
          bindingKey: "identity_name",
          labelOverride: "Legal name",
          entitySurfaceId: "s",
          entityFieldId: "f",
        },
      ],
    },
  };
  const input = (value: string) => {
    const el = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  try {
    await act(async () =>
      root.render(
        <CompositionWorkspace
          inspection={inspection}
          selection={{ source: "draft:draft", node: "surfaces:s" }}
        />,
      ),
    );
    const category = [
      ...host.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent?.includes("Forms and surfaces"))!;
    await act(async () => category.click());
    expect(host.querySelector('[data-node="surfaces:s"]')).toBeNull();
    await act(async () => input("identity_name"));
    expect(host.querySelector('[data-node="surfaces:s"]')).not.toBeNull();
    expect(
      host.querySelector('[data-node="surfaceFieldBindings:p"]'),
    ).not.toBeNull();
    expect(host.textContent).toContain("1 matching objects");
    await act(async () => input("no match"));
    expect(host.textContent).toContain(
      "Selected object is outside these results",
    );
    await act(async () => input(""));
    expect(host.querySelector('[data-node="surfaces:s"]')).toBeNull();
    expect(host.textContent).toContain("approved");
    expect(host.textContent).not.toContain("Saved draft");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("reveals a linked object and returns keyboard focus to differences", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const destination = document.createElement("section");
  destination.id = "studio-composition-differences";
  destination.tabIndex = -1;
  document.body.append(destination);
  const root = createRoot(host);
  const inspection: Inspection = {
    id: "draft",
    source: "draft",
    version: "1",
    status: "draft",
    targets: [],
    data: { surfaces: [{ id: "s", title: "Address" }] },
  };
  try {
    await act(async () =>
      root.render(
        <CompositionWorkspace
          inspection={inspection}
          selection={{ source: "draft:draft", node: "surfaces:s", reveal: 1 }}
        />,
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(document.activeElement?.id).toBe("studio-composition-properties");
    expect(
      host.querySelector('[aria-selected="true"]')?.getAttribute("data-node"),
    ).toBe("surfaces:s");
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((b) => b.textContent === "Return to differences")!
        .click(),
    );
    expect(document.activeElement).toBe(destination);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    destination.remove();
  }
});
