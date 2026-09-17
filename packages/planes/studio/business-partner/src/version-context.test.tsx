// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ContextSelectionDrawer } from "@athyper/platform-ui";
it("browses locally, keeps failed switches open, and cancels without changing context", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const open = vi
    .fn()
    .mockRejectedValueOnce(new Error("Read failed"))
    .mockResolvedValueOnce(true);
  const refresh = vi.fn();
  const click = async (name: string) =>
    act(async () => {
      Array.from(document.querySelectorAll("button"))
        .find(
          (b) =>
            b.textContent?.trim() === name ||
            b.getAttribute("aria-label") === name,
        )!
        .click();
    });
  try {
    await act(async () =>
      root.render(
        <ContextSelectionDrawer
          title="Version context"
          description="Choose configuration"
          currentKey="a"
          currentLabel="Draft 3"
          choices={[
            { key: "a", label: "Draft 3", group: "Drafts" },
            { key: "b", label: "Release 2", group: "Releases" },
          ]}
          loading={false}
          onRefresh={refresh}
          onConfirm={open}
        />,
      ),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click(),
    );
    await act(async () =>
      document.querySelector<HTMLInputElement>('input[value="b"]')!.click(),
    );
    expect(open).not.toHaveBeenCalled();
    await click("Drafts1");
    expect(document.querySelectorAll('input[type="radio"]')).toHaveLength(1);
    expect(document.body.textContent).toContain(
      "The selected version is outside these results.",
    );
    await click("Releases1");
    expect(
      document.querySelector<HTMLInputElement>('input[value="b"]')!.checked,
    ).toBe(true);
    await click("All2");
    await click("Refresh list");
    expect(refresh).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    await click("Open version");
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
    expect(document.body.textContent).toContain("Read failed");
    await click("Cancel");
    expect(document.querySelector("[role=dialog]")).toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click(),
    );
    expect(
      document.querySelector<HTMLInputElement>('input[value="a"]')!.checked,
    ).toBe(true);
    await act(async () =>
      document.querySelector<HTMLInputElement>('input[value="b"]')!.click(),
    );
    await click("Open version");
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(open.mock.calls[1][0]).toBe("b");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it("aborts a pending open when the drawer is dismissed", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let signal: AbortSignal | undefined;
  try {
    await act(async () =>
      root.render(
        <ContextSelectionDrawer
          title="Versions"
          description="Choose"
          currentKey="a"
          currentLabel="Current"
          choices={[{ key: "b", label: "Other", group: "Versions" }]}
          loading={false}
          onRefresh={() => {}}
          onConfirm={(_key, s) => {
            signal = s;
            return new Promise(() => {});
          }}
        />,
      ),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click(),
    );
    await act(async () =>
      document.querySelector<HTMLInputElement>("input[type=radio]")!.click(),
    );
    await act(async () =>
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent === "Open version")!
        .click(),
    );
    await act(async () =>
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent === "Cancel")!
        .click(),
    );
    expect(signal?.aborted).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
