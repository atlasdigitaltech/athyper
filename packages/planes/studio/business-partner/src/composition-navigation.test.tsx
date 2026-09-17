// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { CompositionNavigation } from "./composition-navigation";
import {
  CompositionWorkspace,
  type CompositionSelection,
} from "./composition-workspace";
import { CompositionReview } from "./composition-review";
import type { Inspection } from "./workbench-model";
it("switches task views without remounting previews and links changes back to composition", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const base: Inspection = {
    source: "release",
    id: "r",
    version: "1",
    status: "published",
    targets: [],
    data: { surfaces: [{ id: "s", title: "Original" }] },
  };
  const working = { surfaces: [{ id: "s", title: "Updated" }] };
  function App() {
    const [selection, setSelection] = useState<CompositionSelection>();
    return (
      <CompositionNavigation>
        <CompositionWorkspace
          inspection={{ ...base, data: working }}
          selection={selection}
          onSelect={setSelection}
        />
        <CompositionReview
          baseline={base}
          saved={base}
          working={working}
          selection={selection}
          onSelect={setSelection}
          renderPreview={() => (
            <input aria-label="Sample answer" defaultValue="kept" />
          )}
        />
      </CompositionNavigation>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const click = async (text: string) =>
    act(async () => {
      Array.from(host.querySelectorAll("button"))
        .find((b) => b.textContent === text)!
        .click();
    });
  try {
    await act(async () => root.render(<App />));
    expect(
      host.querySelector<HTMLElement>("#composition-view-preview")!.hidden,
    ).toBe(true);
    const frames = Array.from(host.querySelectorAll("iframe"));
    const candidate = frames[1]!.contentDocument!.querySelector("input")!;
    candidate.value = "My sample";
    await click("Preview");
    expect(
      host.querySelector<HTMLElement>("#composition-view-compose")!.hidden,
    ).toBe(true);
    await click("Changes1");
    expect(
      host.querySelector<HTMLElement>("#composition-view-changes")!.hidden,
    ).toBe(false);
    await click("Inspect object");
    expect(
      host.querySelector<HTMLElement>("#composition-view-compose")!.hidden,
    ).toBe(false);
    await click("Return to differences");
    expect(
      host.querySelector<HTMLElement>("#composition-view-changes")!.hidden,
    ).toBe(false);
    expect(frames[1]!.contentDocument!.querySelector("input")).toBe(candidate);
    expect(candidate.value).toBe("My sample");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
