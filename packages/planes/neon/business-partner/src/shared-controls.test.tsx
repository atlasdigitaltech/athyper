import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  operating: {
    organizations: [] as {
      id: string;
      companyAssignments: { companyCodeId: string }[];
    }[],
  },
  work: { selection: { mode: "company", companyCodeId: "a" } },
  push: vi.fn(),
}));
vi.mock("@athyper/product-neon-shell", () => ({
  useNeonOperatingOrganization: () => mock.operating,
  useNeonWorkContext: () => mock.work,
}));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useToasts: () => ({ push: mock.push }),
}));
import { useOrganizationSelection } from "./use-organization-selection";
import { useCommandRunner } from "./command-feedback";
let dom: JSDOM, root: Root, host: HTMLElement;
beforeEach(() => {
  dom = new JSDOM("<div id='root'></div>");
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  host = document.getElementById("root")!;
  root = createRoot(host);
  mock.push.mockReset();
  mock.work.selection = { mode: "company", companyCodeId: "a" };
  mock.operating.organizations = [
    { id: "org-a", companyAssignments: [{ companyCodeId: "a" }] },
    { id: "org-b", companyAssignments: [{ companyCodeId: "b" }] },
  ];
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});
function Selection({
  requestScope,
}: {
  requestScope?: { operatingOrganizationId: string; companyCodeId?: string };
}) {
  const { selected, compatible } = useOrganizationSelection(requestScope);
  return (
    <p>
      {selected || "Unselected"}: {compatible.map((org) => org.id).join(",")}
    </p>
  );
}
it("selects the sole compatible organization and realigns when company changes", async () => {
  await act(async () => root.render(<Selection />));
  expect(host.textContent).toBe("org-a: org-a");
  mock.work.selection = { mode: "company", companyCodeId: "b" };
  await act(async () => root.render(<Selection />));
  expect(host.textContent).toBe("org-b: org-b");
});
it("does not substitute a sole organization for an unavailable request organization", async () => {
  await act(async () =>
    root.render(
      <Selection
        requestScope={{
          operatingOrganizationId: "unavailable",
          companyCodeId: "b",
        }}
      />,
    ),
  );
  expect(host.textContent).toBe("Unselected: org-b");
});
function PendingSelection() {
  const {
    selected,
    pendingOperatingOrganizationId,
    beginEdit,
    updatePending,
    applyPending,
    discardPending,
  } = useOrganizationSelection();
  return (
    <div>
      <p>
        committed:{selected || "none"} pending:
        {pendingOperatingOrganizationId ?? "none"}
      </p>
      <button onClick={beginEdit}>begin</button>
      <button onClick={() => updatePending("org-a")}>set-a</button>
      <button onClick={() => updatePending("unavailable")}>set-bad</button>
      <button onClick={applyPending}>apply</button>
      <button onClick={discardPending}>discard</button>
    </div>
  );
}
it("does not commit an incompatible pending organization on apply", async () => {
  await act(async () => root.render(<PendingSelection />));
  expect(host.textContent).toContain("committed:org-a pending:none");
  host.querySelector("button")!.click(); // begin
  await act(async () => {});
  (
    Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "set-bad",
    ) as HTMLButtonElement
  ).click();
  await act(async () => {});
  expect(host.textContent).toContain("pending:unavailable");
  (
    Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "apply",
    ) as HTMLButtonElement
  ).click();
  await act(async () => {});
  // The invalid pending value must not have been committed.
  expect(host.textContent).toContain("committed:org-a pending:unavailable");
});
it("commits a compatible pending organization and clears the pending edit", async () => {
  await act(async () => root.render(<PendingSelection />));
  const click = (label: string) =>
    act(async () =>
      (
        Array.from(host.querySelectorAll("button")).find(
          (button) => button.textContent === label,
        ) as HTMLButtonElement
      ).click(),
    );
  await click("begin");
  mock.work.selection = { mode: "company", companyCodeId: "b" };
  await act(async () => root.render(<PendingSelection />));
  await click("set-a"); // org-a is not compatible with company b
  await click("apply");
  // apply() must reject an org incompatible with the current company.
  expect(host.textContent).toContain("pending:org-a");
  expect(host.textContent).not.toContain("committed:org-a pending:none");
});
it("discardPending clears the pending edit without changing the committed selection", async () => {
  await act(async () => root.render(<PendingSelection />));
  const click = (label: string) =>
    act(async () =>
      (
        Array.from(host.querySelectorAll("button")).find(
          (button) => button.textContent === label,
        ) as HTMLButtonElement
      ).click(),
    );
  await click("begin");
  await click("set-bad");
  expect(host.textContent).toContain("pending:unavailable");
  await click("discard");
  expect(host.textContent).toContain("committed:org-a pending:none");
});
it("uses a request's company instead of the global company", async () => {
  await act(async () =>
    root.render(
      <Selection
        requestScope={{ operatingOrganizationId: "org-b", companyCodeId: "b" }}
      />,
    ),
  );
  expect(host.textContent).toBe("org-b: org-b");
});
it("serializes rapid commands through refresh and recovers after failure", async () => {
  let resolve!: () => void;
  const command = vi.fn().mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const reload = vi.fn().mockResolvedValue(undefined);
  let run!: ReturnType<typeof useCommandRunner>;
  function Controls() {
    const [busy, setBusy] = useState<string>(),
      [error, setError] = useState<string>();
    run = useCommandRunner({
      setBusy,
      setError,
      reload,
      errorMessage: () => "Command failed",
    });
    return (
      <p>
        {busy ?? "Idle"} {error}
      </p>
    );
  }
  await act(async () => root.render(<Controls />));
  let pending!: Promise<void>;
  await act(async () => {
    pending = run("approve", command, "Approved");
    void run("approve", command, "Approved");
  });
  expect(command).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("approve");
  await act(async () => {
    resolve();
    await pending;
  });
  expect(reload).toHaveBeenCalledTimes(1);
  expect(mock.push).toHaveBeenCalledWith({
    tone: "success",
    title: "Approved",
  });
  command.mockRejectedValueOnce(new Error("Failure"));
  await act(async () => {
    await run("approve", command);
  });
  expect(host.textContent).toContain("Idle Command failed");
  expect(reload).toHaveBeenCalledTimes(1);
  command.mockResolvedValueOnce(undefined);
  await act(async () => {
    await run("approve", command);
  });
  expect(host.textContent).not.toContain("Command failed");
  expect(reload).toHaveBeenCalledTimes(2);
});
