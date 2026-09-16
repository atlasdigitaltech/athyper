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
