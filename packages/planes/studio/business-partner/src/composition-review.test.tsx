// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CompositionReview } from "./composition-review";
import type { Inspection } from "./workbench-model";
it("navigates findings and changes by identity and preserves the base renderer input", async () => {
  const baseline: Inspection = {
    source: "draft",
    id: "draft",
    version: "4",
    status: "draft",
    targets: [],
    data: {
      surfaces: [{ id: "s", surfaceKey: "intake", title: "Original" }],
      surfaceSections: [
        { id: "sec", entitySurfaceId: "missing", title: "Orphan" },
      ],
    },
  };
  const working = {
    ...baseline.data,
    surfaces: [{ id: "s", surfaceKey: "intake", title: "Updated" }],
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host),
    onSelect = vi.fn(),
    preview = vi.fn(() => null);
  try {
    await act(async () =>
      root.render(
        <CompositionReview
          baseline={baseline}
          saved={baseline}
          working={working}
          onSelect={onSelect}
          renderPreview={preview}
        />,
      ),
    );
    expect(preview.mock.calls[0]?.[0]).toEqual(baseline.data);
    expect(preview.mock.calls[1]?.[0]).toEqual(working);
    const buttons = Array.from(host.querySelectorAll("button"));
    await act(async () =>
      buttons.find((b) => b.textContent === "Inspect object")!.click(),
    );
    expect(onSelect).toHaveBeenLastCalledWith({
      source: "draft:draft",
      node: "surfaces:s",
      reveal: expect.any(Number),
    });
    await act(async () =>
      buttons.find((b) => b.textContent === "Orphan")!.click(),
    );
    expect(onSelect).toHaveBeenLastCalledWith({
      source: "draft:draft",
      node: "surfaceSections:sec",
      reveal: expect.any(Number),
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("compares the chosen saved base and retains surfaces removed from the candidate", async () => {
  const baseline: Inspection = {
    source: "draft",
    id: "draft",
    version: "4",
    status: "draft",
    targets: [],
    data: { surfaces: [{ id: "removed", title: "Removed surface" }] },
  };
  const saved: Inspection = {
    ...baseline,
    version: "5",
    data: { surfaces: [{ id: "saved", title: "Saved surface" }] },
  };
  const working = { surfaces: [] };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host),
    preview = vi.fn(() => null);
  try {
    await act(async () =>
      root.render(
        <CompositionReview
          baseline={baseline}
          saved={saved}
          working={working}
          renderPreview={preview}
        />,
      ),
    );
    expect(host.querySelector("#review-surface")?.textContent).toContain(
      "Removed surface",
    );
    const comparison =
      host.querySelector<HTMLSelectElement>("#review-comparison")!;
    await act(async () => {
      comparison.value = "saved";
      comparison.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(preview.mock.calls.at(-2)?.[0]).toEqual(saved.data);
    expect(preview.mock.calls.at(-1)?.[0]).toEqual(working);
    expect(
      host.querySelector<HTMLSelectElement>("#review-surface")!.value,
    ).toBe("saved");
    expect(host.textContent).toContain("Removed from this configuration");
    expect(baseline.version).toBe("4");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("loads either historical side without changing the working graph, and keeps selection on read failure", async () => {
  const current: Inspection = {
    source: "draft",
    id: "draft",
    version: "3",
    status: "draft",
    targets: [],
    data: { surfaces: [{ id: "s", title: "Third" }] },
  };
  const graphs: Record<string, any> = {
    1: { surfaces: [{ id: "s", title: "First" }] },
    2: { surfaces: [{ id: "s", title: "Second" }] },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: !url.endsWith("/9"),
      json: async () =>
        url.endsWith("/history")
          ? [1, 2, 9].map((revision) => ({
              revision,
              capturedAt: "2026-09-16T00:00:00Z",
              kind: "saved",
            }))
          : {
              revision: Number(url.split("/").at(-1)),
              graph: graphs[url.split("/").at(-1)!],
            },
    })),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host),
    preview = vi.fn(() => null);
  const select = async (id: string, value: string) =>
    act(async () => {
      const e = host.querySelector<HTMLSelectElement>(id)!;
      e.value = value;
      e.dispatchEvent(new Event("change", { bubbles: true }));
    });
  try {
    await act(async () =>
      root.render(
        <CompositionReview
          baseline={current}
          saved={current}
          working={current.data}
          renderPreview={preview}
        />,
      ),
    );
    await select("#review-comparison", "revision:1");
    await select("#review-mode", "revision:2");
    expect(preview.mock.calls.at(-2)?.[0]).toEqual(graphs[1]);
    expect(preview.mock.calls.at(-1)?.[0]).toEqual(graphs[2]);
    expect(host.textContent).toContain("Candidate · saved revision 2");
    await select("#review-mode", "revision:9");
    expect(host.querySelector<HTMLSelectElement>("#review-mode")!.value).toBe(
      "revision:2",
    );
    expect(host.textContent).toContain("previous comparison is unchanged");
    expect(current.data.surfaces).toEqual([{ id: "s", title: "Third" }]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("filters changes by kind and surface, and keeps deleted historical objects inspectable without a broken workspace link", async () => {
  const base: Inspection = {
    source: "release",
    id: "release",
    version: "1",
    status: "published",
    targets: [],
    data: {
      surfaces: [
        { id: "s", title: "Address" },
        { id: "other", title: "Other" },
      ],
      surfaceSections: [
        { id: "sec", entitySurfaceId: "s", title: "Old section" },
      ],
    },
  };
  const working = {
    surfaces: [
      { id: "s", title: "Updated address" },
      { id: "other", title: "Other" },
      { id: "new", title: "New form" },
    ],
    surfaceSections: [],
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const select = async (id: string, value: string) =>
    act(async () => {
      const e = host.querySelector<HTMLSelectElement>(id)!;
      e.value = value;
      e.dispatchEvent(new Event("change", { bubbles: true }));
    });
  try {
    await act(async () =>
      root.render(
        <CompositionReview baseline={base} saved={base} working={working} />,
      ),
    );
    const region = host.querySelector("#studio-composition-differences")!;
    expect(region.textContent).toContain("3 of 3 changed objects");
    await select("#difference-scope", "surface");
    expect(region.textContent).toContain("2 of 3 changed objects");
    await select("#difference-kind", "removed");
    expect(region.textContent).toContain("1 of 3 changed objects");
    expect(region.textContent).toContain("Old section");
    expect(region.textContent).toContain("Removed from this configuration");
    expect(
      Array.from(region.querySelectorAll("button")).some(
        (b) => b.textContent === "Inspect object",
      ),
    ).toBe(false);
    expect(region.querySelector("table")?.textContent).toContain("Old section");
    await select("#difference-kind", "added");
    expect(region.textContent).toContain("No changes match these filters.");
    await act(async () =>
      Array.from(region.querySelectorAll("button"))
        .find((b) => b.textContent === "Clear change filters")!
        .click(),
    );
    expect(region.textContent).toContain("3 of 3 changed objects");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
